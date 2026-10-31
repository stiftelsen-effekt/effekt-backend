/**
 * Deterministic simulation of donor activity for the local database.
 *
 * generate({ seed, start, end }) walks day by day from `start` to `end` (inclusive) and returns
 * every table's rows as of `end`. Two properties make top-ups possible (see store.ts):
 *
 * - Causality: what happens on a day depends only on the seed and earlier days. Randomness comes
 *   from streams keyed by (seed, purpose, day/entity), and anything that happens later than the
 *   day it is decided on (a donation arriving on the next bank day, an agreement being cancelled
 *   in two years) is queued and only materialised when the simulation reaches that day.
 * - Stable ids: rows get sequential ids per table in the order they are materialised, so the rows
 *   of generate(start, end1) are a prefix of those of generate(start, end2) for end1 < end2.
 *   Only "state" columns of earlier rows can differ (agreement status, charge status, review
 *   item status...), and those are computed in finalize() from the dates sampled up front.
 */
import { config } from "./config";
import {
  daysInMonth,
  isBankDay,
  isLastDayOfMonth,
  isoDate,
  nextBankDay,
  parts,
  timestamp,
  toDay,
} from "./calendar";
import {
  fakeFnr,
  fakeOrgNumber,
  fakePerson,
  makeKid,
  randomToken,
  unknownKid,
  vippsId,
} from "./people";
import { Rng } from "./random";
import { gdzfClosedDay, RegrantingHistory, RG_ORG, type SplitShare } from "./regranting";
import {
  FUNDRAISER_MESSAGES,
  ORG,
  ORGANIZATIONS,
  PAYMENT,
  PAYMENT_METHODS,
  REFERRAL_OTHER_COMMENTS,
  REFERRAL_TYPES,
  STOP_OTHER_COMMENTS,
} from "./reference";

export type Row = Record<string, string | number | null>;
export type Dataset = Record<string, Row[]>;

export type GenerateOptions = {
  seed: string;
  /** First simulated day */
  start: number;
  /** Last simulated day ("today") */
  end: number;
  /** Multiplies all volumes */
  scale: number;
  /**
   * The day of the first seed (default `end`). Kept across top-ups; the regranting history is
   * laid out relative to it (prisma/devdata/regranting.ts).
   */
  anchor?: number;
};

/** Tables written by the generator, in foreign key order */
export const GENERATED_TABLES = [
  "Donors",
  "Tax_unit",
  "Fundraisers",
  "Fundraiser_transactions",
  "Distributions",
  "Distribution_cause_areas",
  "Distribution_cause_area_organizations",
  "Avtalegiro_agreements",
  "Vipps_agreements",
  "Vipps_agreement_charges",
  "Donations",
  "Payment_intent",
  "Vipps_orders",
  "Referral_records",
  "Recurring_agreement_stopped",
  "Import_logs",
  "Review_queue_items",
  "Avtalegiro_shipment",
  "Avtalegiro_agreement_charges",
  // Regranting (prisma/devdata/regranting.ts)
  "Payees",
  "Organization_payees",
  "Projects",
  "Funds",
  "Regrant_holds",
  "Regrant_rounds",
  "Regrant_round_donations",
  "Regrant_round_recipients",
  "Regrant_transfers",
  "Regrant_transfer_lines",
  "Fund_grants",
  "Fund_grant_lines",
  "Regrant_adjustments",
  // Downstream regrants (docs/regranting-downstream.md)
  "Intermediary_payees",
  "Regranting_funds",
  "External_grantees",
  "Onward_reports",
  "Onward_allocations",
  "Regrant_documents",
  "Regrant_round_balances",
  // Pledges (tilsagn) for the analysis overview
  "Pledges",
] as const;
export type TableName = (typeof GENERATED_TABLES)[number];

const fees = new Map(PAYMENT_METHODS.map((m) => [m.ID, m]));
const money = (n: number) => n.toFixed(2);
const DAYS_PER_MONTH = 30.44;

type Split = {
  causeAreaId: number;
  /** Share of the distribution; 100 when omitted */
  pct?: number;
  standard: boolean;
  orgs: { orgId: number; pct: number }[];
}[];

type Donor = {
  id: number;
  name: string;
  isCompany: boolean;
  taxUnitId: number | null;
  /** KIDs used for one-off gifts, reused by returning donors */
  oneOffKids: string[];
};

type AvtaleGiro = {
  id: number;
  KID: string;
  amount: number;
  paymentDay: number;
  notice: boolean;
  created: number;
  createdSeconds: number;
  activated: number | null;
  cancelled: number | null;
};

type VippsAgreement = {
  genOrder: number;
  id: string;
  donorId: number;
  KID: string;
  amount: number;
  chargeDay: number;
  created: number;
  createdSeconds: number;
  accepted: number | null;
  stopped: number | null;
  hasCancellationDate: boolean;
  urlCode: string;
};

/** A claim sent to MPS for an agreement and due date (Avtalegiro_agreement_charges) */
type AvtaleGiroCharge = {
  row: Row;
  agreement: AvtaleGiro;
  due: number;
};

type Charge = {
  row: Row;
  due: number;
  outcome: string;
};

type ReviewItem = {
  row: Row;
  resolved: number;
  registered: boolean;
  donationId: number | null;
};

type DayStats = {
  ocrDonations: number;
  ocrKids: string[];
  agActivated: number;
  agTerminated: number;
  agClaims: number;
  agNoticed: number;
  vippsCharges: number;
  reviewOcr: Row[];
};

export function generate(options: GenerateOptions): Dataset {
  return new Simulation(options).run();
}

class Simulation {
  private readonly seed: string;
  private readonly start: number;
  private readonly end: number;
  private readonly scale: number;

  private readonly tables: Record<TableName, Row[]>;
  private readonly nextId: Record<string, number> = {};

  private day = 0;
  private readonly queue = new Map<number, (() => void)[]>();

  private readonly donors: Donor[] = [];
  private readonly usedKids = new Set<string>();
  private readonly kidDonor = new Map<string, number>();
  /** Organization shares per KID (pct of cause area × pct of organization) for regranting */
  private readonly kidShares = new Map<string, { orgId: number; share: number }[]>();
  private readonly regranting: RegrantingHistory;
  /** The day of the first seed; pledges, like the regranting history, are laid out from it */
  private readonly anchor: number;
  /** GiveDirectly's Zakat fund closes: new splits stop choosing it */
  private readonly gdzfClosed: number | null;
  private readonly agreementsByPaymentDay = new Map<number, AvtaleGiro[]>();
  private readonly avtaleGiro: AvtaleGiro[] = [];
  private readonly vippsByChargeDay = new Map<number, VippsAgreement[]>();
  private readonly vipps: VippsAgreement[] = [];
  private readonly charges: Charge[] = [];
  private readonly reviewItems: ReviewItem[] = [];
  /** The live claim per `${agreementId}:${dueDay}` (a superseded one is replaced by its retry) */
  private readonly agCharges = new Map<string, AvtaleGiroCharge>();
  private readonly agChargesByAgreement = new Map<number, AvtaleGiroCharge[]>();
  /** Deletion requests waiting for the next run, with the day they were requested */
  private agDeletionQueue: { charge: AvtaleGiroCharge; requested: number }[] = [];
  /** The claims shipment generated each day (10:00 run) */
  private readonly claimShipments = new Map<number, Row>();
  private stats: DayStats = this.emptyStats();
  private activeAvtaleGiro = 0;
  private activeVipps = 0;

  /** Import logs, shipments and review items only exist for recent days (anchored at start) */
  private readonly operationalFrom: number;
  private readonly reviewFrom: number;
  /** AvtaleGiro claims are recorded per charge from this day */
  private readonly chargesFrom: number;

  constructor({ seed, start, end, scale, anchor }: GenerateOptions) {
    this.seed = seed;
    this.start = start;
    this.end = end;
    this.scale = scale;
    this.tables = Object.fromEntries(GENERATED_TABLES.map((t) => [t, []])) as unknown as Record<
      TableName,
      Row[]
    >;
    const regrantingAnchor = anchor ?? end;
    this.anchor = regrantingAnchor;
    this.gdzfClosed = gdzfClosedDay(start, regrantingAnchor);
    this.regranting = new RegrantingHistory(
      {
        id: (table) => this.id(table),
        add: (table, row) => this.add(table, row),
        donations: this.tables.Donations,
        kidShares: (KID) => this.kidShares.get(KID),
        majorGift: (tag, day, arrival, amount, split, onArrival) =>
          this.majorGift(tag, day, arrival, amount, split, onArrival),
      },
      seed,
      start,
      regrantingAnchor,
    );
    const initialEnd = start + Math.round(config.years * 365.25);
    this.operationalFrom = initialEnd - config.operationalLogDays;
    this.reviewFrom = initialEnd - 150;
    this.chargesFrom = initialEnd - config.avtaleGiro.chargeHistoryDays;
    this.schedulePledges();
  }

  run(): Dataset {
    for (this.day = this.start; this.day <= this.end; this.day++) {
      this.stats = this.emptyStats();
      if (this.day === this.start) {
        this.anonymousDonor();
        this.initialStock();
      }
      this.drainQueue();
      this.newAgreements();
      this.avtaleGiroClaims();
      this.avtaleGiroChargeRun();
      this.vippsCharges();
      this.oneOffDonations();
      this.fundraisers();
      this.bigGifts();
      this.reviewQueue();
      this.drainQueue();
      this.regranting.step(this.day);
      this.operationalLogs();
    }
    this.finalize();
    return this.tables;
  }

  // ---------------------------------------------------------------------------------------------
  // Infrastructure

  private id(table: string): number {
    const id = (this.nextId[table] ?? 0) + 1;
    this.nextId[table] = id;
    return id;
  }

  private add(table: TableName, row: Row): Row {
    this.tables[table].push(row);
    return row;
  }

  /** Runs `fn` on `day`, or right away when that is today or earlier */
  private at(day: number, fn: () => void) {
    if (day <= this.day) {
      fn();
      return;
    }
    const list = this.queue.get(day);
    if (list) list.push(fn);
    else this.queue.set(day, [fn]);
  }

  private drainQueue() {
    const list = this.queue.get(this.day);
    if (!list) return;
    this.queue.delete(this.day);
    for (const fn of list) fn();
  }

  private rng(...parts: (string | number)[]): Rng {
    return new Rng(this.seed, ...parts);
  }

  private emptyStats(): DayStats {
    return {
      ocrDonations: 0,
      ocrKids: [],
      agActivated: 0,
      agTerminated: 0,
      agClaims: 0,
      agNoticed: 0,
      vippsCharges: 0,
      reviewOcr: [],
    };
  }

  /** Growth multiplier: 1 at `years` after start, (1 + g)^-years at start */
  private growth(day: number): number {
    const years = (day - this.start) / 365.25;
    return Math.pow(1 + config.growthPerYear, years - config.years) * this.scale;
  }

  // ---------------------------------------------------------------------------------------------
  // Donors and distributions

  private newDonor(
    rng: Rng,
    day: number,
    seconds: number,
    kind: keyof typeof config.donors.taxUnit,
    isCompany = false,
  ): Donor {
    const id = this.id("Donors");
    const person = fakePerson(rng, id, isCompany);
    this.add("Donors", {
      ID: id,
      email: person.email,
      full_name: person.fullName,
      date_registered: timestamp(day, seconds),
      Meta_owner_ID: 3,
      newsletter: rng.chance(config.donors.newsletter) ? 1 : 0,
      trash: null,
    });

    let taxUnitId: number | null = null;
    if (isCompany || rng.chance(config.donors.taxUnit[kind])) {
      taxUnitId = this.id("Tax_unit");
      this.add("Tax_unit", {
        ID: taxUnitId,
        Donor_ID: id,
        ssn: isCompany ? fakeOrgNumber(rng) : fakeFnr(rng),
        full_name: person.fullName,
        registered: timestamp(day, seconds + 60),
        archived: null,
      });
    }

    if (!isCompany && rng.chance(config.donors.referralAnswer)) {
      const type = rng.weightedNum(Object.fromEntries(REFERRAL_TYPES.map((t) => [t.ID, t.weight])));
      this.add("Referral_records", {
        ID: this.id("Referral_records"),
        ReferralID: type,
        DonorID: id,
        Registered: timestamp(day, seconds + 120),
        other_comment: type === 8 && rng.chance(0.4) ? rng.pick(REFERRAL_OTHER_COMMENTS) : null,
        website_session: null,
      });
    }

    const donor: Donor = { id, name: person.fullName, isCompany, taxUnitId, oneOffKids: [] };
    this.donors.push(donor);
    return donor;
  }

  /** A random earlier donor (uniform, so long-standing donors come back more often over time) */
  private existingDonor(rng: Rng): Donor | null {
    if (this.donors.length === 0) return null;
    const donor = this.donors[rng.int(0, this.donors.length - 1)];
    return donor === this.anonymous ? this.donors[0] : donor;
  }

  private anonymous: Donor | null = null;
  /** Shared donor for gifts without contact details (fundraiser gifts mostly) */
  private anonymousDonor(): Donor {
    if (!this.anonymous) {
      const id = this.id("Donors");
      this.add("Donors", {
        ID: id,
        email: "anonym@example.org",
        full_name: "Anonym giver",
        date_registered: timestamp(this.start - 400, 12 * 3600),
        Meta_owner_ID: 3,
        newsletter: 0,
        trash: null,
      });
      this.anonymous = {
        id,
        name: "Anonym giver",
        isCompany: false,
        taxUnitId: null,
        oneOffKids: [],
      };
      this.donors.push(this.anonymous);
    }
    return this.anonymous;
  }

  private sampleSplit(rng: Rng, day: number, preferCustom = false): Split {
    const d = config.distributions;
    const r = rng.next();
    if (r < d.otherCauseAreas.animals) {
      return rng.chance(0.7)
        ? [
            {
              causeAreaId: 2,
              standard: true,
              orgs: [
                { orgId: 13, pct: 50 },
                { orgId: 14, pct: 50 },
              ],
            },
          ]
        : [
            {
              causeAreaId: 2,
              standard: false,
              orgs: [{ orgId: rng.pick([13, 14, 15]), pct: 100 }],
            },
          ];
    }
    if (r < d.otherCauseAreas.animals + d.otherCauseAreas.climate) {
      return rng.chance(0.7)
        ? [{ causeAreaId: 3, standard: true, orgs: [{ orgId: 16, pct: 100 }] }]
        : [{ causeAreaId: 3, standard: false, orgs: [{ orgId: rng.pick([16, 17]), pct: 100 }] }];
    }
    if (rng.chance(0.01)) {
      // A few donors split between cause areas
      return [
        {
          causeAreaId: 1,
          pct: 80,
          standard: true,
          orgs: [{ orgId: this.standardOrg(day), pct: 100 }],
        },
        {
          causeAreaId: 2,
          pct: 20,
          standard: true,
          orgs: [
            { orgId: 13, pct: 50 },
            { orgId: 14, pct: 50 },
          ],
        },
      ];
    }
    if (!preferCustom && rng.chance(d.standardSplit)) {
      return [
        { causeAreaId: 1, standard: true, orgs: [{ orgId: this.standardOrg(day), pct: 100 }] },
      ];
    }
    return [{ causeAreaId: 1, standard: false, orgs: this.customOrgs(rng, day) }];
  }

  /**
   * The standard split is GiveWell's All Grants Fund. (It was Top Charities before April 2025,
   * but production totals show existing standard KIDs follow the current standard.)
   */
  private standardOrg(_day: number): number {
    return ORG.AGF;
  }

  private customOrgs(rng: Rng, day: number): { orgId: number; pct: number }[] {
    const count = rng.weightedNum(config.distributions.customOrgCount);
    const closed = (id: number) =>
      id === RG_ORG.GDZF && this.gdzfClosed !== null && day >= this.gdzfClosed;
    const candidates = ORGANIZATIONS.filter(
      (o) => o.cause_area_ID === 1 && o.customWeight > 0 && !closed(o.ID),
    );
    const chosen: number[] = [];
    while (chosen.length < Math.min(count, candidates.length)) {
      const remaining = candidates.filter((o) => !chosen.includes(o.ID));
      chosen.push(
        rng.weightedNum(Object.fromEntries(remaining.map((o) => [o.ID, o.customWeight]))),
      );
    }
    const withOps = rng.chance(config.distributions.operationsShare);
    const opsPct = withOps ? rng.pick([5, 10, 10, 15, 20, 25]) : 0;
    const pcts = splitPercent(rng, 100 - opsPct, chosen.length);
    const orgs = chosen.map((orgId, i) => ({ orgId, pct: pcts[i] }));
    if (withOps) orgs.push({ orgId: ORG.DRIFT, pct: opsPct });
    return orgs;
  }

  /** Creates a distribution (KID) with its cause area and organization shares */
  private newDistribution(
    rng: Rng,
    donor: Donor,
    day: number,
    seconds: number,
    options: { split?: Split; fundraiserTransactionId?: number; ownerId?: number } = {},
  ): { KID: string; ownerId: number } {
    let KID = makeKid(rng, donor.id);
    while (this.usedKids.has(KID)) KID = makeKid(rng, donor.id);
    this.usedKids.add(KID);
    this.kidDonor.set(KID, donor.id);

    const ownerId = options.ownerId ?? rng.weightedNum(config.distributions.dataOwners);
    this.add("Distributions", {
      KID,
      Donor_ID: donor.id,
      Tax_unit_ID: donor.taxUnitId !== null && rng.chance(0.9) ? donor.taxUnitId : null,
      Fundraiser_transaction_ID: options.fundraiserTransactionId ?? null,
      Meta_owner_ID: ownerId,
      Replaced_old_organizations: 0,
      inserted: timestamp(day, seconds),
      last_updated: timestamp(day, seconds),
    });

    const split = options.split ?? this.sampleSplit(rng, day);
    this.kidShares.set(
      KID,
      split.flatMap((ca) =>
        ca.orgs.map((o) => ({ orgId: o.orgId, share: (ca.pct ?? 100) * o.pct })),
      ),
    );
    for (const causeArea of split) {
      const causeAreaRowId = this.id("Distribution_cause_areas");
      this.add("Distribution_cause_areas", {
        ID: causeAreaRowId,
        Distribution_KID: KID,
        Cause_area_ID: causeArea.causeAreaId,
        Percentage_share: String(causeArea.pct ?? 100),
        Standard_split: causeArea.standard ? 1 : 0,
      });
      for (const org of causeArea.orgs) {
        this.add("Distribution_cause_area_organizations", {
          ID: this.id("Distribution_cause_area_organizations"),
          Distribution_cause_area_ID: causeAreaRowId,
          Organization_ID: org.orgId,
          Percentage_share: String(org.pct),
        });
      }
    }
    return { KID, ownerId };
  }

  // ---------------------------------------------------------------------------------------------
  // Donations

  private donation(args: {
    donorId: number;
    KID: string;
    paymentId: number;
    amount: number;
    day: number;
    seconds: number;
    ownerId?: number;
    externalId?: (id: number) => string | null;
  }): number {
    const id = this.id("Donations");
    const fee = fees.get(args.paymentId)!;
    const cost = fee.flat_fee + (fee.percentage_fee / 100) * args.amount;
    const confirmed = timestamp(args.day, args.seconds);
    const inserted = timestamp(args.day, Math.min(86_399, args.seconds + 600));
    this.add("Donations", {
      ID: id,
      Donor_ID: args.donorId,
      Payment_ID: args.paymentId,
      PaymentExternal_ID: args.externalId ? args.externalId(id) : null,
      sum_confirmed: money(args.amount),
      timestamp_confirmed: confirmed,
      transaction_cost: money(cost),
      KID_fordeling: args.KID,
      inserted,
      last_updated: inserted,
      Meta_owner_ID: args.ownerId ?? 3,
    });
    if (args.paymentId === PAYMENT.BANK || args.paymentId === PAYMENT.AVTALEGIRO) {
      this.stats.ocrDonations++;
      if (this.stats.ocrKids.length < 40) this.stats.ocrKids.push(args.KID);
    }
    return id;
  }

  private ocrReference(day: number, id: number): string {
    const { year, month, dom } = parts(day);
    const ddmmyy = `${String(dom).padStart(2, "0")}${String(month).padStart(2, "0")}${String(
      year % 100,
    ).padStart(2, "0")}`;
    return `${ddmmyy}.${String(1_000_000_000 + id)}`;
  }

  private externalId(paymentId: number, day: number): ((id: number) => string | null) | undefined {
    switch (paymentId) {
      case PAYMENT.BANK:
      case PAYMENT.AVTALEGIRO:
        return (id) => this.ocrReference(day, id);
      case PAYMENT.BANK_NO_KID:
        return (id) => `bank-${id}`;
      case PAYMENT.VIPPS:
        return (id) => String(4_000_000_000 + id);
      case PAYMENT.VIPPS_KID:
        return (id) => String(7_000_000_000 + id);
      case PAYMENT.FACEBOOK:
        return (id) => `FB${String(100_000_000 + id)}`;
      case PAYMENT.PAYPAL:
        return (id) => `PP${String(100_000_000 + id)}`;
      default:
        return undefined;
    }
  }

  /** One-off donation with donor selection, KID reuse, payment intent and Vipps order */
  private oneOff(
    rng: Rng,
    paymentId: number,
    amount: number,
    day: number,
    seconds: number,
    options: { isCompany?: boolean; preferCustom?: boolean } = {},
  ) {
    let donor: Donor | null = null;
    if (!options.isCompany && rng.chance(config.oneOff.returningDonor))
      donor = this.existingDonor(rng);
    const newDonor = donor === null;
    if (!donor)
      donor = this.newDonor(rng, day, seconds - 300, "oneOff", options.isCompany ?? false);

    let KID: string;
    let ownerId = 3;
    if (!newDonor && donor.oneOffKids.length > 0 && rng.chance(0.7)) {
      KID = rng.pick(donor.oneOffKids);
    } else {
      const created = this.newDistribution(rng, donor, day, seconds - 240, {
        split: options.preferCustom ? this.sampleSplit(rng, day, rng.chance(0.5)) : undefined,
      });
      KID = created.KID;
      ownerId = created.ownerId;
      donor.oneOffKids.push(KID);
    }

    const viaWidget = paymentId === PAYMENT.VIPPS || paymentId === PAYMENT.BANK;
    if (viaWidget) {
      this.add("Payment_intent", {
        Id: this.id("Payment_intent"),
        Payment_method: paymentId,
        Payment_amount: money(amount),
        KID_fordeling: KID,
        timestamp: timestamp(day, seconds - 180),
      });
    }

    // Bank transfers are booked on the next bank day
    const bookedDay =
      paymentId === PAYMENT.BANK || paymentId === PAYMENT.BANK_NO_KID ? nextBankDay(day) : day;
    const book = () => {
      const donationId = this.donation({
        donorId: donor!.id,
        KID,
        paymentId,
        amount,
        day: bookedDay,
        seconds: bookedDay === day && paymentId !== PAYMENT.BANK ? seconds : 0,
        ownerId,
        externalId: this.externalId(paymentId, bookedDay),
      });
      if (paymentId === PAYMENT.VIPPS) {
        this.add("Vipps_orders", {
          ID: this.id("Vipps_orders"),
          orderID: `${KID}-${donationId}`,
          donorID: donor!.id,
          donationID: donationId,
          KID,
          token: null,
          registered: timestamp(day, seconds - 60),
        });
      }
    };
    this.at(bookedDay, book);

    if (viaWidget && rng.chance(config.distributions.abandonedIntents)) {
      // Someone else filled in the widget but never paid
      const abandoner = rng.chance(0.3)
        ? this.newDonor(rng, day, seconds + 30, "oneOff")
        : this.existingDonor(rng)!;
      const { KID: abandonedKid } = this.newDistribution(rng, abandoner, day, seconds + 60);
      this.add("Payment_intent", {
        Id: this.id("Payment_intent"),
        Payment_method: rng.chance(0.7) ? PAYMENT.VIPPS : PAYMENT.BANK,
        Payment_amount: money(sampleAmount(rng, PAYMENT.VIPPS)),
        KID_fordeling: abandonedKid,
        timestamp: timestamp(day, seconds + 90),
      });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Recurring agreements

  private initialStock() {
    const rng = this.rng("stock");
    const ag = Math.round(config.avtaleGiro.initialStock * this.scale);
    const vipps = Math.round(config.vipps.initialStock * this.scale);
    const items: { kind: "ag" | "vipps"; day: number }[] = [];
    for (let i = 0; i < ag; i++) items.push({ kind: "ag", day: this.start - rng.int(30, 365) });
    for (let i = 0; i < vipps; i++)
      items.push({ kind: "vipps", day: this.start - rng.int(30, 365) });
    items.sort((a, b) => a.day - b.day);
    for (const item of items) {
      if (item.kind === "ag") this.newAvtaleGiro(item.day, true);
      else this.newVipps(item.day, true);
    }
  }

  private newAgreements() {
    const rng = this.rng("new-agreements", this.day);
    const g = this.growth(this.day);
    const ag = rng.poisson((config.avtaleGiro.newPerMonth * g) / DAYS_PER_MONTH);
    for (let i = 0; i < ag; i++) this.newAvtaleGiro(this.day, false);
    const vipps = rng.poisson((config.vipps.newPerMonth * g) / DAYS_PER_MONTH);
    for (let i = 0; i < vipps; i++) this.newVipps(this.day, false);
  }

  private agreementDonor(
    rng: Rng,
    day: number,
    seconds: number,
    kind: "avtaleGiro" | "vipps",
  ): Donor {
    if (rng.chance(0.15)) {
      const existing = this.existingDonor(rng);
      if (existing) return existing;
    }
    return this.newDonor(rng, day, seconds - 300, kind);
  }

  private newAvtaleGiro(day: number, stock: boolean) {
    const c = config.avtaleGiro;
    const id = this.id("Avtalegiro_agreements");
    const rng = this.rng("ag", id);
    const seconds = rng.int(7, 23) * 3600 + rng.int(0, 3599);
    const donor = this.agreementDonor(rng, day, seconds, "avtaleGiro");
    const { KID } = this.newDistribution(rng, donor, day, seconds - 120);
    const amount = rng.chance(c.oddAmountShare)
      ? Math.max(50, Math.round(Math.exp(Math.log(1000) + 0.8 * rng.normal()) / 25) * 25)
      : rng.weightedNum(c.amounts);

    const neverActivated = !stock && rng.chance(c.neverActivated);
    const activated = neverActivated ? null : day + rng.int(...c.activationDays);
    const monthsActive = rng.monthsUntil(c.monthlyChurn);
    const cancelled =
      activated === null || monthsActive === Infinity
        ? null
        : activated + Math.round(monthsActive * DAYS_PER_MONTH) + rng.int(0, 29);

    const agreement: AvtaleGiro = {
      id,
      KID,
      amount,
      paymentDay: rng.weightedNum(c.paymentDays),
      notice: rng.chance(c.notice),
      created: day,
      createdSeconds: seconds,
      activated,
      cancelled,
    };
    this.avtaleGiro.push(agreement);
    const list = this.agreementsByPaymentDay.get(agreement.paymentDay) ?? [];
    list.push(agreement);
    this.agreementsByPaymentDay.set(agreement.paymentDay, list);

    this.add("Payment_intent", {
      Id: this.id("Payment_intent"),
      Payment_method: PAYMENT.AVTALEGIRO,
      Payment_amount: money(amount),
      KID_fordeling: KID,
      timestamp: timestamp(day, seconds),
    });
    // Placeholder row, filled in by finalize() with the state as of `end`
    this.add("Avtalegiro_agreements", { ID: id });

    if (activated !== null) {
      this.at(activated, () => {
        this.activeAvtaleGiro++;
        this.stats.agActivated++;
      });
    }
    if (cancelled !== null) {
      this.at(cancelled, () => {
        this.activeAvtaleGiro--;
        this.stats.agTerminated++;
        this.stopFeedback(this.rng("ag-stop", id), { avtalegiroAgreementID: id }, cancelled);
        this.requestChargeDeletions(id, cancelled);
      });
    }
  }

  private avtaleGiroClaims() {
    const { dom } = parts(this.day);
    const due = [...(this.agreementsByPaymentDay.get(dom) ?? [])];
    if (isLastDayOfMonth(this.day)) due.push(...(this.agreementsByPaymentDay.get(0) ?? []));
    for (const agreement of due) {
      if (agreement.activated === null || agreement.activated > this.day - 3) continue;
      if (agreement.created >= this.day - 6) continue;
      if (agreement.cancelled !== null && agreement.cancelled <= this.day) continue;
      this.stats.agClaims++;
      if (agreement.notice) this.stats.agNoticed++;
      const rng = this.rng("ag-claim", agreement.id, this.day);
      if (rng.chance(config.avtaleGiro.missedClaim)) continue;
      const booked = nextBankDay(this.day);
      const due = this.day;
      this.at(booked, () => {
        const donationId = this.donation({
          donorId: this.distributionDonor(agreement.KID),
          KID: agreement.KID,
          paymentId: PAYMENT.AVTALEGIRO,
          amount: agreement.amount,
          day: booked,
          seconds: 0,
          externalId: this.externalId(PAYMENT.AVTALEGIRO, booked),
        });
        this.completeCharge(agreement.id, due, donationId, booked);
      });
    }
  }

  // AvtaleGiro charges: the claims job, deletions after a cancellation and OCR matching, as in
  // src/custom_modules/avtalegiro (see PRs #781/#782). Recorded from `chargesFrom` on.

  /** The banking day the claims for a due date are sent: `claimBankDaysAhead` banking days before */
  private claimDay(due: number): number {
    let day = due;
    for (let n = 0; n < config.avtaleGiro.claimBankDaysAhead;) {
      day--;
      if (isBankDay(day)) n++;
    }
    return day;
  }

  private claimShipment(day: number): Row {
    let shipment = this.claimShipments.get(day);
    if (!shipment) {
      shipment = this.add("Avtalegiro_shipment", {
        ID: this.id("Avtalegiro_shipment"),
        num_claims: 0,
        generated: timestamp(day, 10 * 3600),
      });
      this.claimShipments.set(day, shipment);
    }
    return shipment;
  }

  /** A shipment other than the day's claims shipment: a retry or a deletion file */
  private extraShipment(day: number, seconds: number, numClaims: number): number {
    const id = this.id("Avtalegiro_shipment");
    this.add("Avtalegiro_shipment", {
      ID: id,
      num_claims: numClaims,
      generated: timestamp(day, seconds),
    });
    return id;
  }

  private chargeRow(agreement: AvtaleGiro, due: number, shipmentId: number, at: string): Row {
    return this.add("Avtalegiro_agreement_charges", {
      ID: this.id("Avtalegiro_agreement_charges"),
      agreementID: agreement.id,
      shipmentID: shipmentId,
      KID: agreement.KID,
      due_date: isoDate(due),
      amount: agreement.amount * 100,
      status: "CLAIMED",
      donationID: null,
      deletion_shipmentID: null,
      last_updated: at,
      created: at,
    });
  }

  /** The 10:00 run on banking days: claims for the due dates whose claim day is today, then deletions */
  private avtaleGiroChargeRun() {
    const today = this.day;
    if (today < this.chargesFrom || !isBankDay(today)) return;

    const claims: { agreement: AvtaleGiro; due: number }[] = [];
    for (let due = today + 1; due <= today + 14; due++) {
      if (this.claimDay(due) !== today) continue;
      const { dom } = parts(due);
      const candidates = [...(this.agreementsByPaymentDay.get(dom) ?? [])];
      if (isLastDayOfMonth(due)) candidates.push(...(this.agreementsByPaymentDay.get(0) ?? []));
      for (const agreement of candidates) {
        // The same agreements avtaleGiroClaims() books a payment for on the due date
        if (agreement.activated === null || agreement.activated > due - 3) continue;
        if (agreement.created >= due - 6) continue;
        if (agreement.cancelled !== null && agreement.cancelled <= today) continue;
        claims.push({ agreement, due });
      }
    }

    if (claims.length > 0) {
      const shipment = this.claimShipment(today);
      const sent = timestamp(today, 8 * 3600 + 5);
      const rejected = this.rng("ag-shipment", today).chance(config.avtaleGiro.rejectedShipment);
      let shipmentId = shipment.ID as number;
      if (rejected) {
        // MPS never accepted the first file: the 11:00 retry supersedes it and sends a new one
        for (const { agreement, due } of claims) {
          const row = this.chargeRow(agreement, due, shipmentId, sent);
          row.status = "SUPERSEDED";
          row.last_updated = timestamp(today, 9 * 3600 + 5);
        }
        shipmentId = this.extraShipment(today, 11 * 3600, claims.length);
      }
      shipment.num_claims = claims.length;
      const at = rejected ? timestamp(today, 9 * 3600 + 5) : sent;
      for (const { agreement, due } of claims) {
        const charge = { row: this.chargeRow(agreement, due, shipmentId, at), agreement, due };
        this.agCharges.set(`${agreement.id}:${due}`, charge);
        const list = this.agChargesByAgreement.get(agreement.id) ?? [];
        list.push(charge);
        this.agChargesByAgreement.set(agreement.id, list);
      }
    }

    this.sendChargeDeletions();
  }

  /** A cancelled agreement's claims that aren't due yet are queued for deletion */
  private requestChargeDeletions(agreementId: number, cancelled: number) {
    for (const charge of this.agChargesByAgreement.get(agreementId) ?? []) {
      if (charge.row.status !== "CLAIMED" || charge.due <= cancelled) continue;
      charge.row.status = "DELETION_REQUESTED";
      charge.row.last_updated = timestamp(cancelled, 14 * 3600);
      this.agDeletionQueue.push({ charge, requested: cancelled });
    }
  }

  /**
   * Sends earlier days' deletion requests in one file, if MPS gets it by the banking day before the
   * due date; later ones go back to claimed. MPS accepts the file by the 11:00 retry, so only
   * today's file (the last day generated) is still waiting for its receipt.
   */
  private sendChargeDeletions() {
    const today = this.day;
    const ready = this.agDeletionQueue.filter((r) => r.requested < today);
    this.agDeletionQueue = this.agDeletionQueue.filter((r) => r.requested >= today);
    const inTime = ready.filter(({ charge }) => {
      let lastDay = nextBankDay(charge.due) - 1;
      while (!isBankDay(lastDay)) lastDay--;
      return today <= lastDay;
    });
    for (const { charge } of ready) {
      if (charge.row.status !== "DELETION_REQUESTED") continue;
      if (!inTime.some((r) => r.charge === charge)) {
        charge.row.status = "CLAIMED";
        charge.row.last_updated = timestamp(today, 8 * 3600 + 10);
      }
    }
    const toSend = inTime.filter(({ charge }) => charge.row.status === "DELETION_REQUESTED");
    if (toSend.length === 0) return;
    const shipmentId = this.extraShipment(today, 10 * 3600 + 10, toSend.length);
    for (const { charge } of toSend) {
      charge.row.deletion_shipmentID = shipmentId;
      charge.row.status = today === this.end ? "DELETION_SENT" : "DELETED";
      charge.row.last_updated = timestamp(today, today === this.end ? 8 * 3600 + 10 : 9 * 3600);
    }
  }

  /** The OCR import links the payment to its claim */
  private completeCharge(agreementId: number, due: number, donationId: number, day: number) {
    const charge = this.agCharges.get(`${agreementId}:${due}`);
    if (!charge || charge.row.donationID !== null || charge.row.status === "SUPERSEDED") return;
    charge.row.status = "COMPLETED";
    charge.row.donationID = donationId;
    charge.row.last_updated = timestamp(day, 18 * 3600);
  }

  private distributionDonor(KID: string): number {
    return this.kidDonor.get(KID)!;
  }

  private newVipps(day: number, stock: boolean) {
    const c = config.vipps;
    const genOrder = this.id("vipps-agreement");
    const rng = this.rng("vipps", genOrder);
    const seconds = rng.int(7, 23) * 3600 + rng.int(0, 3599);
    const donor = this.agreementDonor(rng, day, seconds, "vipps");
    const { KID } = this.newDistribution(rng, donor, day, seconds - 120);

    const neverAccepted = !stock && rng.chance(c.neverAccepted);
    const accepted = neverAccepted ? null : day + (rng.chance(0.75) ? 0 : rng.int(1, 4));
    const monthsActive = rng.monthsUntil(c.monthlyChurn);
    const stopped =
      accepted === null || monthsActive === Infinity
        ? null
        : accepted + Math.round(monthsActive * DAYS_PER_MONTH) + rng.int(0, 29);

    const agreement: VippsAgreement = {
      genOrder,
      id: vippsId(rng, "agr_", genOrder),
      donorId: donor.id,
      KID,
      amount: rng.weightedNum(c.amounts),
      chargeDay: rng.weightedNum(c.chargeDays),
      created: day,
      createdSeconds: seconds,
      accepted,
      stopped,
      hasCancellationDate: rng.chance(c.cancellationDateShare),
      urlCode: randomToken(rng, 32),
    };
    this.vipps.push(agreement);
    const list = this.vippsByChargeDay.get(agreement.chargeDay) ?? [];
    list.push(agreement);
    this.vippsByChargeDay.set(agreement.chargeDay, list);

    this.add("Payment_intent", {
      Id: this.id("Payment_intent"),
      Payment_method: PAYMENT.VIPPS_RECURRING,
      Payment_amount: money(agreement.amount),
      KID_fordeling: KID,
      timestamp: timestamp(day, seconds),
    });
    this.add("Vipps_agreements", { ID: agreement.id });

    if (accepted !== null) {
      this.at(accepted, () => {
        this.activeVipps++;
        if (!stock) this.initialCharge(agreement);
      });
    }
    if (stopped !== null) {
      this.at(stopped, () => {
        this.activeVipps--;
        this.stopFeedback(
          this.rng("vipps-stop", genOrder),
          { vippsAgreementID: agreement.id },
          stopped,
        );
      });
    }
  }

  private initialCharge(agreement: VippsAgreement) {
    const rng = this.rng("vipps-initial", agreement.genOrder);
    const outcome = rng.weighted(config.vipps.initialOutcome);
    this.charge(agreement, this.day, outcome, "INITIAL", agreement.createdSeconds + 120);
  }

  private charge(
    agreement: VippsAgreement,
    due: number,
    outcome: string,
    type: string,
    seconds: number,
  ) {
    const n = this.id("Vipps_agreement_charges");
    const chargeId = vippsId(this.rng("charge-id", n), "chr-", n);
    const row = this.add("Vipps_agreement_charges", {
      chargeID: chargeId,
      agreementID: agreement.id,
      amountNOK: agreement.amount,
      KID: agreement.KID,
      dueDate: isoDate(due),
      timestamp_created: timestamp(this.day, seconds),
      status: null,
      type,
    });
    this.charges.push({ row, due, outcome });
    if (outcome === "CHARGED") {
      this.at(due, () =>
        this.donation({
          donorId: agreement.donorId,
          KID: agreement.KID,
          paymentId: PAYMENT.VIPPS_RECURRING,
          amount: agreement.amount,
          day: due,
          seconds: type === "INITIAL" ? seconds + 60 : 6 * 3600 + (n % 3600),
          externalId: () => `${agreement.id}.${chargeId}`,
        }),
      );
    }
  }

  private vippsCharges() {
    const lead = config.vipps.chargeLeadDays;
    const due = this.day + lead;
    const { dom } = parts(due);
    const agreements = [...(this.vippsByChargeDay.get(dom) ?? [])];
    if (isLastDayOfMonth(due)) agreements.push(...(this.vippsByChargeDay.get(0) ?? []));
    for (const agreement of agreements) {
      if (agreement.accepted === null || agreement.accepted > due - 10) continue;
      if (agreement.stopped !== null && agreement.stopped <= this.day) continue;
      const rng = this.rng("vipps-charge", agreement.genOrder, due);
      this.stats.vippsCharges++;
      this.charge(
        agreement,
        due,
        rng.weighted(config.vipps.chargeOutcome),
        "RECURRING",
        5 * 3600 + rng.int(0, 1800),
      );
    }
  }

  private stopFeedback(
    rng: Rng,
    agreement: { avtalegiroAgreementID?: number; vippsAgreementID?: string },
    day: number,
  ) {
    if (!rng.chance(config.stopFeedback.share)) return;
    const reasonID = rng.weightedNum(config.stopFeedback.reasons);
    const at = timestamp(day, rng.int(8, 22) * 3600);
    this.add("Recurring_agreement_stopped", {
      ID: this.id("Recurring_agreement_stopped"),
      avtalegiroAgreementID: agreement.avtalegiroAgreementID ?? null,
      autoGiroAgreementID: null,
      vippsAgreementID: agreement.vippsAgreementID ?? null,
      reasonID,
      otherComment: reasonID === 11 ? rng.pick(STOP_OTHER_COMMENTS) : null,
      timestamp: at,
      last_updated: at,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // One-off gifts, fundraisers, big gifts

  private oneOffDonations() {
    const rng = this.rng("one-off", this.day);
    const { year, month, dom } = parts(this.day);
    const dim = daysInMonth(year, month);
    const seasonal = config.oneOff.seasonality[month];
    // December: the tax deduction deadline pulls gifts towards the end of the month
    const dayWeight = month === 12 ? decemberWeight(dom) / averageDecemberWeight() : 1;
    const perDay = ((config.oneOff.perMonth * this.growth(this.day) * seasonal) / dim) * dayWeight;

    const methods = config.oneOff.methods;
    const total = Object.values(methods).reduce((a, b) => a + b, 0);
    for (const [method, weight] of Object.entries(methods)) {
      const paymentId = Number(method);
      const count = rng.poisson((perDay * weight) / total);
      for (let i = 0; i < count; i++) {
        const seconds = rng.int(7, 23) * 3600 + rng.int(0, 3599);
        let amount = sampleAmount(rng, paymentId);
        if (month === 12 && rng.chance(config.oneOff.decemberTaxTopUp))
          amount = rng.pick([25000, 25000, 20000, 15000, 10000]);
        const isCompany = paymentId === PAYMENT.BANK && rng.chance(config.donors.companyShare);
        this.oneOff(rng, paymentId, amount, this.day, seconds, { isCompany });
      }
    }

    for (const retired of config.retiredMethods) {
      if (this.day < toDay(retired.from) || this.day > toDay(retired.to)) continue;
      const mult = month === 12 ? retired.decemberMultiplier : 1;
      const count = rng.poisson((retired.perMonth * this.scale * mult) / dim);
      for (let i = 0; i < count; i++) {
        this.oneOff(
          rng,
          retired.paymentId,
          sampleAmount(rng, PAYMENT.VIPPS),
          this.day,
          rng.int(8, 22) * 3600,
        );
      }
    }

    if (
      this.day >= toDay("2025-01-01") &&
      rng.chance((config.payrollPerMonth * this.scale) / dim)
    ) {
      this.oneOff(
        rng,
        PAYMENT.PAYROLL,
        Math.round(rng.int(2000, 10000) / 500) * 500,
        this.day,
        12 * 3600,
      );
    }
    if (rng.chance((config.influencedPerYear * this.scale) / 365)) {
      this.oneOff(
        rng,
        PAYMENT.INFLUENCED,
        Math.round(rng.int(1_000_000, 5_000_000) / 100_000) * 100_000,
        this.day,
        12 * 3600,
        {
          preferCustom: true,
        },
      );
    }
  }

  private bigGifts() {
    if (!isBankDay(this.day)) return;
    const rng = this.rng("big-gift", this.day);
    const { month } = parts(this.day);
    const mult = month === 12 ? config.bigGifts.decemberMultiplier : 1;
    const perBankDay =
      (config.bigGifts.perYear * this.growth(this.day) * mult) /
      (250 + 20 * (config.bigGifts.decemberMultiplier - 1));
    const count = rng.poisson(perBankDay);
    for (let i = 0; i < count; i++) {
      const amount = rng.chance(0.66)
        ? Math.round(Math.exp(Math.log(50_000) + rng.next() * Math.log(5)) / 5_000) * 5_000
        : Math.round(Math.exp(Math.log(250_000) + rng.next() * Math.log(8)) / 50_000) * 50_000;
      this.oneOff(rng, PAYMENT.BANK, amount, this.day, rng.int(9, 15) * 3600, {
        isCompany: rng.chance(config.bigGifts.companyShare),
        preferCustom: true,
      });
    }
  }

  /**
   * A large bank gift for the regranting history: registered on `day` (a new donor and KID with
   * the given split), booked on `arrival`.
   */
  private majorGift(
    tag: string,
    day: number,
    arrival: number,
    amount: number,
    split: SplitShare[],
    onArrival: (donationId: number) => void,
  ) {
    const rng = this.rng("major-gift", tag);
    const seconds = rng.int(9, 15) * 3600;
    const donor = this.newDonor(rng, day, seconds, "bigGift", rng.chance(0.5));
    const { KID, ownerId } = this.newDistribution(rng, donor, day, seconds + 60, {
      split: [{ causeAreaId: 1, standard: false, orgs: split }],
      ownerId: 3,
    });
    this.at(arrival, () => {
      const id = this.donation({
        donorId: donor.id,
        KID,
        paymentId: PAYMENT.BANK,
        amount,
        day: arrival,
        seconds: 0,
        ownerId,
        externalId: this.externalId(PAYMENT.BANK, arrival),
      });
      onArrival(id);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Pledges (tilsagn): decided gifts that haven't arrived yet, for the analysis overview

  /**
   * A handful of pledges around the anchor: open ones of different sizes and ages, received ones
   * linked to the bank donation that fulfilled them (one without a link), and one partly paid,
   * its sum lowered to what remains. Open pledges get no scheduled payment, so top-ups never
   * close them; that's for the developer to do in the admin.
   */
  private schedulePledges() {
    const A = this.anchor;
    const AMF = 6;
    const GD = 7;
    this.pledge("pl-amf", A - 430, 1_500_000, [{ orgId: AMF, pct: 100 }], [A - 380]);
    this.pledge("pl-company", A - 520, 250_000, [{ orgId: ORG.TCF, pct: 100 }], [A - 490], {
      link: false,
    });
    this.pledge(
      "pl-givewell",
      A - 230,
      600_000,
      [
        { orgId: ORG.TCF, pct: 50 },
        { orgId: ORG.AGF, pct: 50 },
      ],
      [A - 170],
    );
    // 2 MNOK, of which 800 000 arrived: 1 200 000 still open
    this.pledge("pl-partial", A - 120, 2_000_000, [{ orgId: GD, pct: 100 }], [A - 60], {
      amounts: [800_000],
    });
    this.pledge("pl-aging", A - 270, 750_000, [{ orgId: AMF, pct: 100 }], []);
    this.pledge("pl-large", A - 45, 2_500_000, [{ orgId: ORG.AGF, pct: 100 }], []);
    this.pledge("pl-recent", A - 9, 350_000, [{ orgId: AMF, pct: 100 }], []);
  }

  /**
   * A pledge decided on `decided`, paid by bank on the given days (the whole remaining sum on
   * the last one unless `amounts` says otherwise). Each payment lowers the pledge's sum to what
   * remains; the payment that clears it marks the pledge received, linked to that donation.
   */
  private pledge(
    tag: string,
    decided: number,
    sum: number,
    split: { orgId: number; pct: number }[],
    paymentDays: number[],
    { amounts = [], link = true }: { amounts?: number[]; link?: boolean } = {},
  ) {
    const day = nextBankDay(decided);
    if (day < this.start) return;
    this.at(day, () => {
      const rng = this.rng("pledge", tag);
      const id = this.id("Pledges");
      const row = this.add("Pledges", {
        ID: id,
        Sum: money(sum),
        Decided_date: isoDate(day),
        Received_date: null,
        Donation_ID: null,
        Inserted: timestamp(day, rng.int(9, 16) * 3600),
      });
      if (paymentDays.length === 0) return;

      // The donor and KID are registered the bank day before the first payment
      const first = nextBankDay(paymentDays[0]);
      let gift: { donorId: number; KID: string; ownerId: number } | null = null;
      this.at(first - 1, () => {
        const seconds = rng.int(9, 15) * 3600;
        const donor = this.newDonor(rng, first - 1, seconds, "bigGift", rng.chance(0.5));
        const { KID, ownerId } = this.newDistribution(rng, donor, first - 1, seconds + 60, {
          split: [{ causeAreaId: 1, standard: false, orgs: split }],
          ownerId: 3,
        });
        gift = { donorId: donor.id, KID, ownerId };
      });

      let remaining = sum;
      paymentDays.forEach((paymentDay, i) => {
        const arrival = nextBankDay(paymentDay);
        this.at(arrival, () => {
          const amount = Math.min(amounts[i] ?? remaining, remaining);
          const donationId = this.donation({
            donorId: gift!.donorId,
            KID: gift!.KID,
            paymentId: PAYMENT.BANK,
            amount,
            day: arrival,
            seconds: 0,
            ownerId: gift!.ownerId,
            externalId: this.externalId(PAYMENT.BANK, arrival),
          });
          remaining -= amount;
          if (remaining > 0) {
            row.Sum = money(remaining);
          } else {
            row.Sum = money(amount);
            row.Received_date = isoDate(arrival);
            row.Donation_ID = link ? donationId : null;
          }
        });
      });
    });
  }

  private fundraisers() {
    const c = config.fundraisers;
    const rng = this.rng("fundraisers", this.day);
    const { month, dom } = parts(this.day);
    const starts = rng.poisson((c.perMonth * this.growth(this.day)) / DAYS_PER_MONTH);
    let christmas = 0;
    if ((month === 11 && dom >= 20) || (month === 12 && dom <= 5)) {
      christmas = rng.poisson((c.christmasPerYear * this.growth(this.day)) / 16);
    }
    for (let i = 0; i < starts + christmas; i++) this.newFundraiser(i >= starts);
  }

  private newFundraiser(isChristmas: boolean) {
    const c = config.fundraisers;
    const id = this.id("Fundraisers");
    const rng = this.rng("fundraiser", id);
    const seconds = rng.int(8, 22) * 3600;
    const owner = rng.chance(0.4)
      ? (this.existingDonor(rng) ?? this.newDonor(rng, this.day, seconds, "oneOff"))
      : this.newDonor(rng, this.day, seconds, "oneOff");
    this.add("Fundraisers", {
      ID: id,
      Donor_ID: owner.id,
      Secret: randomToken(rng, 32),
      Inserted: timestamp(this.day, seconds),
      Last_updated: timestamp(this.day, seconds),
    });

    // Either the standard split or one organization the owner cares about
    const split: Split = rng.chance(0.4)
      ? [
          {
            causeAreaId: 1,
            standard: true,
            orgs: [{ orgId: this.standardOrg(this.day), pct: 100 }],
          },
        ]
      : [
          {
            causeAreaId: 1,
            standard: false,
            orgs: [{ orgId: rng.pick([3, 4, 5, 6, 7, 8]), pct: 100 }],
          },
        ];

    const startDay = this.day;
    const endDay = isChristmas
      ? toDay(`${parts(this.day).month === 12 ? parts(this.day).year : parts(this.day).year}-12-31`)
      : startDay + rng.int(...c.durationDays);
    const mean = isChristmas ? c.christmasTransactionsMean : c.transactionsMean;
    const total = Math.max(1, Math.round(mean * Math.exp(0.7 * rng.normal() - 0.25)));
    const length = endDay - startDay + 1;

    for (let d = startDay; d <= endDay; d++) {
      const position = (d - startDay) / length;
      // Most gifts come early, Christmas fundraisers peak towards Christmas Eve
      const weight = isChristmas
        ? 0.4 + 1.6 * Math.min(1, position * 1.4)
        : 2 * (1 - position) + 0.1;
      const dayRng = this.rng("fundraiser-day", id, d);
      const count = dayRng.poisson((total / length) * weight);
      if (count === 0) continue;
      this.at(d, () => {
        for (let i = 0; i < count; i++) this.fundraiserTransaction(dayRng, id, split, d);
      });
    }
  }

  private fundraiserTransaction(rng: Rng, fundraiserId: number, split: Split, day: number) {
    const c = config.fundraisers;
    const seconds = rng.int(7, 23) * 3600 + rng.int(0, 3599);
    const who = rng.weighted(c.donor);
    const donor =
      who === "anonymous"
        ? this.anonymousDonor()
        : who === "existing"
          ? this.existingDonor(rng)!
          : this.newDonor(rng, day, seconds - 200, "oneOff");
    const showName = rng.chance(c.showNameShare);
    const transactionId = this.id("Fundraiser_transactions");
    this.add("Fundraiser_transactions", {
      ID: transactionId,
      Fundraiser_ID: fundraiserId,
      Message: rng.chance(c.messageShare) ? rng.pick(FUNDRAISER_MESSAGES) : "",
      Message_sender_name: showName ? donor.name.split(" ")[0] : null,
      Show_name: showName ? 1 : 0,
      Inserted: timestamp(day, seconds - 100),
      Last_updated: timestamp(day, seconds - 100),
    });
    const { KID, ownerId } = this.newDistribution(rng, donor, day, seconds - 90, {
      split,
      fundraiserTransactionId: transactionId,
      ownerId: 3,
    });
    const paymentId = rng.chance(0.88) ? PAYMENT.VIPPS : PAYMENT.BANK;
    const amount = Math.min(10_000, sampleAmount(rng, PAYMENT.VIPPS));
    this.add("Payment_intent", {
      Id: this.id("Payment_intent"),
      Payment_method: paymentId,
      Payment_amount: money(amount),
      KID_fordeling: KID,
      timestamp: timestamp(day, seconds - 80),
    });
    const bookedDay = paymentId === PAYMENT.BANK ? nextBankDay(day) : day;
    this.at(bookedDay, () => {
      const donationId = this.donation({
        donorId: donor.id,
        KID,
        paymentId,
        amount,
        day: bookedDay,
        seconds: paymentId === PAYMENT.BANK ? 0 : seconds,
        ownerId,
        externalId: this.externalId(paymentId, bookedDay),
      });
      if (paymentId === PAYMENT.VIPPS) {
        this.add("Vipps_orders", {
          ID: this.id("Vipps_orders"),
          orderID: `${KID}-${donationId}`,
          donorID: donor.id,
          donationID: donationId,
          KID,
          token: null,
          registered: timestamp(day, seconds - 60),
        });
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Review queue and operational logs

  private reviewQueue() {
    if (this.day < this.reviewFrom) return;
    const rng = this.rng("review", this.day);
    const ocr = isBankDay(this.day) ? rng.poisson(((config.reviewQueue.perDay * 7) / 5) * 0.7) : 0;
    const vipps = rng.poisson(config.reviewQueue.perDay * 0.3);
    for (let i = 0; i < ocr + vipps; i++) {
      const source = i < ocr ? "ocr" : "vipps";
      const id = this.id("Review_queue_items");
      const itemRng = this.rng("review-item", id);
      const amount = sampleAmount(itemRng, source === "ocr" ? PAYMENT.BANK : PAYMENT.VIPPS_KID);
      const KID = itemRng.chance(0.8) ? unknownKid(itemRng) : null;
      const transactionDate = timestamp(this.day - (source === "ocr" ? 0 : itemRng.int(1, 3)), 0);
      const externalId =
        source === "ocr"
          ? this.ocrReference(this.day, 900_000_000 + id)
          : String(9_100_000_000 + id);
      const paymentId = source === "ocr" ? PAYMENT.BANK : PAYMENT.VIPPS_KID;
      const reason =
        source === "ocr"
          ? KID
            ? `NO_KID | KID ${KID} does not exist`
            : "NO_KID | KID null does not exist"
          : "Could not find valid KID or matching parsing rule";
      const payer = source === "vipps" ? fakePerson(itemRng, id).fullName : null;
      const message =
        source === "vipps"
          ? itemRng.pick(["Gave", "Donasjon", "Takk for det dere gjør", null])
          : null;
      const raw =
        source === "ocr"
          ? {
              KID,
              amount,
              date: `${isoDate(this.day)}T00:00:00.000Z`,
              transactionID: externalId,
              paymentMethod: paymentId,
            }
          : {
              KID,
              amount,
              date: `${transactionDate.replace(" ", "T")}.000Z`,
              transactionID: externalId,
              name: payer,
              message,
              location: "Gi Effektivt",
            };
      const created = timestamp(
        this.day,
        source === "ocr" ? 20 * 3600 + 5 * 60 : 9 * 3600 + itemRng.int(0, 3600),
      );

      const linger = itemRng.chance(config.reviewQueue.lingerShare);
      const resolved = this.day + (linger ? itemRng.int(10, 45) : itemRng.int(0, 6));
      const registered = itemRng.chance(config.reviewQueue.registeredShare);
      const row = this.add("Review_queue_items", {
        ID: id,
        Source: source,
        Reason: reason,
        KID,
        Amount: money(amount),
        Transaction_date: transactionDate,
        External_ID: externalId,
        Payment_ID: paymentId,
        Message: message,
        Payer_name: payer,
        Location: source === "vipps" ? "Gi Effektivt" : null,
        Raw: JSON.stringify(raw),
        Import_log_ID: null,
        Status: "open",
        Resolved_by: null,
        Resolved_at: null,
        Note: null,
        Donation_ID: null,
        Created: created,
      });
      const item: ReviewItem = { row, resolved, registered, donationId: null };
      this.reviewItems.push(item);
      if (source === "ocr") this.stats.reviewOcr.push(row);

      if (registered) {
        this.at(resolved, () => {
          const donor = this.existingDonor(itemRng)!;
          const targetKid =
            donor.oneOffKids[0] ?? this.newDistribution(itemRng, donor, resolved, 10 * 3600).KID;
          if (!donor.oneOffKids.includes(targetKid)) donor.oneOffKids.push(targetKid);
          item.donationId = this.donation({
            donorId: donor.id,
            KID: targetKid,
            paymentId,
            amount,
            day: resolved,
            seconds: 10 * 3600 + itemRng.int(0, 3600),
            externalId: () => externalId,
          });
        });
      }
    }
  }

  private operationalLogs() {
    if (this.day < this.operationalFrom) return;
    const day = this.day;
    const s = this.stats;

    // From chargesFrom on, the claims run fills in the shipment's claims
    const shipment = this.claimShipment(day);
    if (day < this.chargesFrom) shipment.num_claims = s.agClaims;
    this.add("Import_logs", {
      ID: this.id("Import_logs"),
      label: "AvtaleGiro",
      result: JSON.stringify({
        notifiedAgreements: { success: s.agNoticed, failed: 0 },
        file: s.agClaims > 0 ? `NY210020 (synthetic claim file, ${s.agClaims} claims)` : null,
      }),
      timestamp: timestamp(day, 10 * 3600 + 30),
    });
    this.add("Import_logs", {
      ID: this.id("Import_logs"),
      label: "VippsRecurring",
      result: JSON.stringify({
        activeAgreements: this.activeVipps,
        createdCharges: s.vippsCharges,
      }),
      timestamp: timestamp(day, 12 * 3600),
    });

    const ocrLogId = this.id("Import_logs");
    if (!isBankDay(day)) {
      this.add("Import_logs", {
        ID: ocrLogId,
        label: "OCR",
        result: JSON.stringify({ nofile: true }),
        timestamp: timestamp(day, 20 * 3600),
      });
      return;
    }
    const invalidTransactions = s.reviewOcr.map((row) => ({
      reason: row.Reason,
      transaction: JSON.parse(row.Raw as string),
    }));
    for (const row of s.reviewOcr) row.Import_log_ID = ocrLogId;
    this.add("Import_logs", {
      ID: ocrLogId,
      label: "OCR",
      result: JSON.stringify({
        addedDonations: {
          valid: s.ocrDonations,
          invalid: invalidTransactions.length,
          ignored: 0,
          invalidTransactions,
        },
        updatedAgreements: {
          activated: s.agActivated,
          updated: 0,
          added: 0,
          terminated: s.agTerminated,
          failed: [],
        },
        file: [
          "NY000010 (synthetic OCR file)",
          ...s.ocrKids.map((kid) => `NY091330 ${kid}`),
          "NY000089",
        ].join("\n"),
      }),
      timestamp: timestamp(day, 20 * 3600),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // State as of `end`

  private finalize() {
    const end = this.end;
    const agRows = new Map(this.tables.Avtalegiro_agreements.map((r) => [r.ID as number, r]));
    for (const a of this.avtaleGiro) {
      const row = agRows.get(a.id);
      if (!row) continue;
      const activated = a.activated !== null && a.activated <= end;
      const cancelled = a.cancelled !== null && a.cancelled <= end;
      const lastChange = cancelled ? a.cancelled! : activated ? a.activated! : a.created;
      Object.assign(row, {
        ID: a.id,
        KID: a.KID,
        amount: a.amount * 100,
        payment_date: a.paymentDay,
        notice: a.notice ? 1 : 0,
        active: activated && !cancelled ? 1 : 0,
        last_updated: timestamp(lastChange, lastChange === a.created ? a.createdSeconds : 6 * 3600),
        created: timestamp(a.created, a.createdSeconds),
        cancelled: cancelled ? isoDate(a.cancelled!) : null,
      });
    }

    const vippsRows = new Map(this.tables.Vipps_agreements.map((r) => [r.ID as string, r]));
    for (const v of this.vipps) {
      const row = vippsRows.get(v.id);
      if (!row) continue;
      let status: string;
      if (v.accepted === null || v.accepted > end)
        status = end - v.created >= 7 ? "EXPIRED" : "PENDING";
      else if (v.stopped !== null && v.stopped <= end) status = "STOPPED";
      else status = "ACTIVE";
      Object.assign(row, {
        ID: v.id,
        donorID: v.donorId,
        KID: v.KID,
        amount: v.amount,
        status,
        monthly_charge_day: v.chargeDay,
        paused_until_date: null,
        agreement_url_code: v.urlCode,
        timestamp_created: timestamp(v.created, v.createdSeconds),
        force_charge_date: null,
        cancellation_date:
          status === "STOPPED" && v.hasCancellationDate ? isoDate(v.stopped!) : null,
      });
    }

    for (const charge of this.charges) {
      charge.row.status = charge.due > end ? "DUE" : charge.outcome;
    }

    for (const item of this.reviewItems) {
      if (item.resolved > end) continue;
      Object.assign(item.row, {
        Status: item.registered ? "registered" : "ignored",
        Resolved_by: "dev-admin@example.org",
        Resolved_at: timestamp(item.resolved, 10 * 3600),
        Note: item.registered ? null : "Duplicate of an earlier transfer",
        Donation_ID: item.registered ? item.donationId : null,
      });
    }
  }
}

// -----------------------------------------------------------------------------------------------
// Sampling helpers

const NICE_AMOUNTS = [
  20, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 750, 800, 1000, 1200, 1500, 2000, 2500, 3000,
  4000, 5000, 6000, 7500, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000,
];

/** One-off amount in NOK from the method's bucket histogram, mostly rounded */
export function sampleAmount(rng: Rng, paymentId: number): number {
  const buckets =
    config.oneOff.amountBuckets[paymentId] ?? config.oneOff.amountBuckets[PAYMENT.VIPPS];
  const [from, to] = rng.weighted(buckets).split("-").map(Number);
  const raw = Math.exp(Math.log(from) + rng.next() * (Math.log(to) - Math.log(from)));
  if (rng.chance(config.oneOff.roundAmountShare)) {
    const inBucket = NICE_AMOUNTS.filter((n) => n >= from && n < to);
    if (inBucket.length > 0) {
      return inBucket.reduce((best, n) =>
        Math.abs(Math.log(n / raw)) < Math.abs(Math.log(best / raw)) ? n : best,
      );
    }
  }
  return Math.max(from, Math.round(raw));
}

/** Splits `total` percent into `count` integer shares */
function splitPercent(rng: Rng, total: number, count: number): number[] {
  if (count === 1) return [total];
  if (rng.chance(0.6)) {
    const base = Math.floor(total / count);
    const shares = Array.from({ length: count }, () => base);
    shares[0] += total - base * count;
    return shares;
  }
  // Random shares in steps of 5 (at least 5 each)
  const steps = Math.floor(total / 5);
  const shares = Array.from({ length: count }, () => 1);
  for (let i = count; i < steps; i++) shares[rng.int(0, count - 1)]++;
  const result = shares.map((s) => s * 5);
  result[0] += total - result.reduce((a, b) => a + b, 0);
  return result;
}

function decemberWeight(dom: number): number {
  return dom < 15 ? 0.6 : 0.6 + (dom - 14) * 0.3;
}
let decemberAverage: number | null = null;
function averageDecemberWeight(): number {
  if (decemberAverage === null) {
    let sum = 0;
    for (let d = 1; d <= 31; d++) sum += decemberWeight(d);
    decemberAverage = sum / 31;
  }
  return decemberAverage;
}
