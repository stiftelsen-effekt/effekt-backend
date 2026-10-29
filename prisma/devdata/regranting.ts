/**
 * Regranting history for the dev data (docs/regranting.md): payees and dated routings, projects,
 * the own fund GEBF, holds, adjustments and rounds, as if Gi Effektivt had used the system since
 * the start of the donation history.
 *
 * Rounds are built the way the admin builds them: the balances are computed from the generated
 * donations and earlier rounds exactly as DAO.regranting.getBalances does, the amounts come from
 * the backend's own proposal rules (proposeRound), then a few deterministic human edits are
 * applied (holds, a deferral, earmarks, fund grants, a hand-entered fronted payment), and every
 * round is checked with the backend's validateRound before it is approved.
 *
 * Timeline (all relative to the start of the history and the anchor, the day of the first seed):
 * - a paid `regular` round every three months, cutoff at a month end, the last one at the month
 *   end closest to anchor − 91 days, so the last ~3 months of donations are not regranted yet;
 * - `major_donor` rounds passing on scheduled large bank gifts a few days after they arrive, an
 *   `extraordinary` round paying a pledged gift before it arrived (`fronted`), an off-schedule
 *   `fund_grant` round from GEBF, yearly GEBF grants inside regular rounds;
 * - around the anchor: an approved, unpaid `major_donor` round and a `fund_grant` draft in
 *   progress, so every lifecycle state exists and a new regular round can still be opened today.
 * Nothing is scheduled after the anchor: top-ups add donations, and new rounds are the
 * developer's to run in the admin.
 *
 * Like the rest of the generator, everything here is causal (decided on its day from earlier
 * days only) and rows get sequential ids in the order they are created.
 */
import { Decimal } from "decimal.js";
import { proposeRound, type Position } from "../../src/custom_modules/regranting/proposal";
import { validateRound } from "../../src/custom_modules/regranting/validation";
import type {
  FundGrant,
  Issue,
  PayeeRef,
  RoundDonation,
  RoundKind,
  RoundStatus,
  Transfer,
} from "../../src/custom_modules/regranting/types";
import {
  daysInMonth,
  firstOfMonth,
  isoDate,
  nextBankDay,
  parts,
  timestamp,
  toDay,
} from "./calendar";
import type { Row, TableName } from "./generate";
import { Rng } from "./random";
import { ORGANIZATIONS } from "./reference";

/** Organizations the history refers to (prisma/devdata/reference.ts) */
export const RG_ORG = {
  AGF: 1,
  TCF: 2,
  HKI: 3,
  NI: 4,
  MC: 5,
  AMF: 6,
  GD: 7,
  GDMB: 8,
  FEM: 9,
  GDZF: 10,
  DRIFT: 11,
  THL: 13,
  GFI: 14,
  ACE: 15,
  CATF: 16,
  CE: 17,
  GEBF: 18,
} as const;
const O = RG_ORG;

/** Fake staff identities: rounds are created by one person and approved by another */
const OPS = "ops@example.org";
const FINANCE = "finance@example.org";
const APPROVER = "approver@example.org";
const MANAGER = "daglig.leder@example.org";

const MIN_TRANSFER = 500_000; // cents: 5 000 kr

export type SplitShare = { orgId: number; pct: number };

/** What the regranting history needs from the simulation */
export type RegrantingHost = {
  id(table: string): number;
  add(table: TableName, row: Row): Row;
  /** The Donations rows generated so far (live) */
  donations: Row[];
  /** Organization shares of a KID: pct of cause area × pct of organization (sums to 10 000) */
  kidShares(KID: string): { orgId: number; share: number }[] | undefined;
  /**
   * A large bank gift registered on `day` (donor and KID) and booked on `arrival`, a bank day.
   * `onArrival` gets the donation id when the donation is booked.
   */
  majorGift(
    tag: string,
    day: number,
    arrival: number,
    amount: number,
    split: SplitShare[],
    onArrival: (donationId: number) => void,
  ): void;
};

type Line = { orgId: number; projectId: number | null; cents: number };

type TransferState = {
  id: number;
  payee: PayeeState;
  row: Row;
  lines: (Line & { id: number })[];
  paidDay: number | null;
};

type FundGrantState = {
  id: number;
  fundId: number;
  rationale: string;
  row: Row;
  lines: (Line & { id: number })[];
};

type RoundState = {
  id: number;
  name: string;
  kind: RoundKind;
  cutoff: number;
  status: RoundStatus;
  minTransfer: number;
  row: Row;
  transfers: TransferState[];
  fundGrants: FundGrantState[];
  donationIds: number[];
  overrides: Map<number, boolean>;
  createdBy: string;
};

type AdjustmentState = {
  id: number;
  orgId: number;
  projectId: number | null;
  cents: number;
  type: string;
  effective: number;
  roundId: number | null;
  row: Row;
};

type PayeeState = { id: number; name: string; currency: string };
type RoutingState = {
  orgId: number;
  payee: PayeeState;
  from: number;
  to: number | null;
  row: Row;
};
type HoldState = { orgId: number; projectId: number | null; until: number | null };
type ProjectState = { id: number; orgId: number; name: string; row: Row };

type RoundPlan = {
  name: string;
  kind: RoundKind;
  cutoff: number;
  created: number;
  /** null: stays a draft */
  approved: number | null;
  /** null: not paid */
  paid: number | null;
  minTransfer?: number;
  createdBy?: string;
  approvedBy?: string;
  /** Chosen donations (major_donor), resolved when the round is created */
  donations?: () => number[];
  overrides?: [number, boolean][];
  /** Runs before the proposal: adjustments and fund grants that belong to the round */
  prepare?: (round: RoundState) => void;
  /** Human edits to the proposed lines */
  edit?: (lines: Line[], round: RoundState) => Line[];
  /** Hand-entered lines, added after the (edited) proposal */
  manualLines?: (round: RoundState) => Line[];
  /** Runs after the round is paid */
  afterPaid?: (round: RoundState) => void;
};

const nok = (cents: number): string => {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `-${s}` : s;
};
const toCents = (d: Decimal) => Math.round(d.times(100).toNumber());
const dec = (cents: number) => new Decimal(cents).div(100);
/** MySQL ROUND(x, 2) of a positive or negative amount in micro-NOK (1e-6) */
const microToCents = (micro: number) =>
  micro >= 0 ? Math.floor((micro + 5000) / 10000) : -Math.floor((-micro + 5000) / 10000);

const MONTHS_NB = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];
const monthYear = (day: number) => {
  const { year, month } = parts(day);
  return `${MONTHS_NB[month - 1]} ${year}`;
};

/** The last day of the month `months` months after the month of `day` */
function monthEnd(day: number, months = 0): number {
  const { year, month } = parts(day);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return firstOfMonth(y, m) + daysInMonth(y, m) - 1;
}

/** The n-th bank day after `day` (n = 0: `day` itself if it is a bank day) */
function bankDays(day: number, n: number): number {
  let d = nextBankDay(day);
  for (let i = 0; i < n; i++) d = nextBankDay(d + 1);
  return d;
}

/** Regular round cutoffs: month ends three months apart, the last near anchor − 91 days */
export function regularCutoffs(start: number, anchor: number): number[] {
  const target = anchor - 91;
  const candidates = [monthEnd(target, -1), monthEnd(target)];
  const last = candidates.reduce((best, c) =>
    Math.abs(c - target) < Math.abs(best - target) ? c : best,
  );
  const cutoffs: number[] = [];
  for (let k = 0; ; k++) {
    const cutoff = monthEnd(last, -3 * k);
    if (cutoff < start + 80) break;
    cutoffs.unshift(cutoff);
  }
  return cutoffs.filter((c) => c < anchor);
}

/**
 * The day GiveDirectly's Zakat fund (GDZF) closed: new splits stop choosing it, the leftover is
 * reallocated to GiveDirectly. Also used by the donation generator.
 */
export function gdzfClosedDay(start: number, anchor: number): number | null {
  const cutoffs = regularCutoffs(start, anchor);
  return cutoffs.length > 9 ? cutoffs[9] + 30 : null;
}

export class RegrantingHistory {
  private readonly events = new Map<number, { prio: number; fn: () => void }[]>();
  private readonly rounds: RoundState[] = [];
  private readonly adjustments: AdjustmentState[] = [];
  private readonly routings: RoutingState[] = [];
  private readonly holds: HoldState[] = [];
  private readonly projects = new Map<string, ProjectState>();
  private readonly payees = new Map<string, PayeeState>();
  private readonly fundIds = new Set<number>([O.GEBF]);
  private readonly orgNames = new Map(ORGANIZATIONS.map((o) => [o.ID, o.full_name]));
  private readonly orgAbbriv = new Map(ORGANIZATIONS.map((o) => [o.ID, o.abbriv]));

  /** Allocations per day and organization, in micro-NOK (exact) */
  private readonly allocations = new Map<number, Map<number, number>>();
  private consumed = 0;
  private readonly donationDay = new Map<number, number>();
  private readonly fronted: { adjustment: AdjustmentState; donationId: number | null }[] = [];
  private readonly gifts = new Map<string, number>();

  readonly cutoffs: number[];

  constructor(
    private readonly host: RegrantingHost,
    private readonly seed: string,
    private readonly start: number,
    private readonly anchor: number,
  ) {
    this.cutoffs = regularCutoffs(start, anchor);
    this.plan();
  }

  /** Runs the day's events; call once per simulated day, after the day's donations */
  step(day: number) {
    const list = this.events.get(day);
    if (!list) return;
    this.events.delete(day);
    list.sort((a, b) => a.prio - b.prio);
    for (const event of list) event.fn();
  }

  // ---------------------------------------------------------------------------------------------
  // Plan

  private at(day: number, prio: number, fn: () => void) {
    const list = this.events.get(day);
    if (list) list.push({ prio, fn });
    else this.events.set(day, [{ prio, fn }]);
  }

  private rng(...parts: (string | number)[]) {
    return new Rng(this.seed, "regranting", ...parts);
  }

  private plan() {
    const S = this.start;
    const A = this.anchor;
    const C = this.cutoffs;
    const n = C.length;
    const has = (j: number) => j < n;

    // Reference data and opening balances on the first day
    this.at(S, 0, () => this.setUp());

    // Projects
    if (has(1)) {
      this.at(C[1] + 20, 0, () =>
        this.project("kenya", O.GD, {
          name: "Kenya: basic income in Siaya",
          description:
            "Monthly cash transfers to every adult in selected villages in Siaya county, as part of GiveDirectly's long-term basic income study.",
          country: "Kenya",
          start_date: isoDate(C[1] + 30),
          end_date: isoDate(Math.max(A + 400, C[1] + 1500)),
          status: "active",
          agreement_ref: `GD-NO-${parts(C[1]).year}-01`,
          report_due: isoDate(A + 45),
          documents_url: "https://drive.example.org/regranting/projects/gd-kenya",
        }),
      );
    }
    if (has(6)) {
      this.at(C[6] + 20, 0, () =>
        this.project("nigeria", O.HKI, {
          name: "Nigeria: vitamin A supplementation",
          description:
            "Twice-yearly vitamin A supplementation campaigns for children aged 6-59 months in Kano and Kaduna.",
          country: "Nigeria",
          start_date: isoDate(C[6] + 30),
          end_date: isoDate(Math.max(A + 200, C[6] + 1100)),
          status: "active",
          agreement_ref: `HKI-NO-${parts(C[6]).year}-02`,
          report_due: isoDate(A + 75),
          documents_url: "https://drive.example.org/regranting/projects/hki-nigeria",
        }),
      );
    }

    // Board decision: the foundation adds its own money to GiveWell's Top Charities Fund
    if (has(2)) {
      this.at(C[1] + 30, 0, () =>
        this.adjustment(C[1] + 30, {
          orgId: O.TCF,
          cents: 5_000_000,
          type: "own_funds",
          reason:
            "Board decision: the foundation adds 50 000 kr of its own funds to GiveWell's Top Charities Fund",
          documentRef: `Styrevedtak ${parts(C[1] + 30).year}-${String(
            parts(C[1] + 30).month,
          ).padStart(2, "0")}`,
          createdBy: MANAGER,
        }),
      );
    }

    // A hold that deferred CATF for two rounds
    if (has(8)) {
      this.at(C[5] + 20, 0, () =>
        this.hold(C[5] + 20, O.CATF, null, C[7] + 5, {
          reason:
            "Due diligence: CATF moved its European donations to a new legal entity; wait for updated bank details and the new grant agreement",
        }),
      );
    }

    // GDZF closes: the leftover goes to GiveDirectly unrestricted
    const gdzfClosed = gdzfClosedDay(S, A);
    if (gdzfClosed !== null) {
      this.at(gdzfClosed, 0, () => {
        const cents = this.positionsAt(gdzfClosed, null).get(key(O.GDZF, null))?.balance ?? 0;
        if (cents <= 0) return;
        const reason =
          "GiveDirectly's Zakat fund has closed; the leftover is passed on as GiveDirectly unrestricted (board decision)";
        this.adjustment(gdzfClosed, { orgId: O.GDZF, cents: -cents, type: "reallocation", reason });
        this.adjustment(gdzfClosed, { orgId: O.GD, cents, type: "reallocation", reason });
      });
    }

    // Malaria Consortium goes direct: a new payee, the GiveWell routing ends
    if (has(13)) {
      const day = firstOfMonth(parts(C[12] + 40).year, parts(C[12] + 40).month);
      this.at(day - 10, 0, () => {
        const mc = this.payee(day - 10, "mc", {
          name: "Malaria Consortium",
          currency: "GBP",
          bank_account: "20-00-00 00000000",
          iban: "GB33BUKB20201555555555",
          swift: "BUKBGB22",
          payment_reference_template: "Gi Effektivt {round} - Malaria Consortium",
        });
        const old = this.routings.find((r) => r.orgId === O.MC && r.to === null)!;
        old.to = day - 1;
        old.row.valid_to = isoDate(day - 1);
        this.routing(O.MC, mc, day);
      });
    }

    // Regular rounds
    C.forEach((cutoff, j) => this.regular(j, cutoff));

    // Major-donor rounds passing on scheduled large gifts
    const majorGift = (
      tag: string,
      afterRound: number,
      amount: number,
      split: SplitShare[],
      extra: Partial<RoundPlan> = {},
    ) => {
      if (!has(afterRound + 1)) return;
      const arrival = bankDays(C[afterRound] + 40, 0);
      this.majorDonorRound(tag, arrival, amount, split, true, extra);
    };
    majorGift("mg-amf", 3, 1_000_000, [{ orgId: O.AMF, pct: 100 }]);
    majorGift(
      "mg-mc-gd",
      8,
      750_000,
      [
        { orgId: O.MC, pct: 60 },
        { orgId: O.GD, pct: 40 },
      ],
      { overrides: [[O.MC, true]] },
    );
    majorGift("mg-givewell", 15, 1_200_000, [
      { orgId: O.TCF, pct: 50 },
      { orgId: O.AGF, pct: 50 },
    ]);

    // Paid before the pledged gift arrived: a hand-entered line and a fronted record
    if (has(14)) this.frontedRound(C[13] + 30);

    // An off-schedule grant from GEBF for flood relief in Malawi
    if (has(11)) this.malawiFundGrant(C[10]);

    // A recipient charged a fee by decision, and a correction of an earlier transfer
    if (has(16)) {
      this.at(C[15] + 30, 0, () => {
        const transfer = this.lastTransferWith(O.CATF);
        this.adjustment(C[15] + 30, {
          orgId: O.CATF,
          cents: -35_000,
          type: "fee",
          reason:
            "Returned payment: CATF gave us a closed account; the bank's return and resend charges are charged to CATF by decision",
          linkedTransferId: transfer?.id ?? null,
          documentRef: `Bilag ${parts(C[15] + 30).year}/${400 + (C[15] % 97)}`,
        });
      });
    }

    // Around the anchor: an approved, unpaid major-donor round and a fund grant draft
    this.majorDonorRound(
      "mg-pending",
      bankDays(A - 12, 0),
      500_000,
      [
        { orgId: O.AMF, pct: 60 },
        { orgId: O.MC, pct: 40 },
      ],
      false,
    );
    this.at(A - 30, 0, () =>
      this.hold(A - 30, O.THL, null, null, {
        reason:
          "The Humane League changed banks; hold until the new account is confirmed by phone (fraud check)",
      }),
    );
    this.at(A - 20, 0, () =>
      this.project("drc", O.GD, {
        name: "DR Congo: cash for displaced families",
        description:
          "One-off transfers to families displaced by fighting in North Kivu, delivered by mobile money.",
        country: "DR Congo",
        start_date: isoDate(A + 30),
        end_date: isoDate(A + 395),
        status: "proposed",
        agreement_ref: null,
        report_due: null,
        documents_url: "https://drive.example.org/regranting/projects/gd-drc",
      }),
    );
    const draftDay = bankDays(A - 4, 0) <= A ? bankDays(A - 4, 0) : A;
    this.round({
      name: `GEBF: kontanter til fordrevne i DR Kongo`,
      kind: "fund_grant",
      cutoff: draftDay - 1,
      created: draftDay,
      approved: null,
      paid: null,
      createdBy: FINANCE,
      prepare: (round) =>
        this.fundGrant(
          round,
          0.5,
          [{ orgId: O.GD, project: "drc", pct: 100 }],
          "Emergency grant from GEBF to GiveDirectly's DR Congo response, pending the board's approval of the project and a signed agreement.",
        ),
    });
  }

  /** One regular round with the human edits for its position in the history */
  private regular(j: number, cutoff: number) {
    const created = bankDays(cutoff + 3, 0);
    const approved = bankDays(created + 1, 2);
    const paid = bankDays(approved + 1, 2);
    const yearlyGrant = j % 4 === 3;
    const earmark = j % 4 === 2 && j >= 2;
    const grantTargets: { orgId: number; project?: string; pct: number }[][] = [
      [
        { orgId: O.HKI, pct: 50 },
        { orgId: O.NI, pct: 30 },
        { orgId: O.GD, project: "kenya", pct: 20 },
      ],
      [
        { orgId: O.HKI, project: "nigeria", pct: 45 },
        { orgId: O.NI, pct: 35 },
        { orgId: O.GD, project: "kenya", pct: 20 },
      ],
      [
        { orgId: O.HKI, project: "nigeria", pct: 40 },
        { orgId: O.AMF, pct: 30 },
        { orgId: O.GD, project: "kenya", pct: 30 },
      ],
      [
        { orgId: O.HKI, project: "nigeria", pct: 30 },
        { orgId: O.MC, pct: 40 },
        { orgId: O.GD, project: "kenya", pct: 30 },
      ],
    ];
    const year = parts(cutoff).year;

    this.round({
      name: `Kvartalstildeling ${monthYear(cutoff)}`,
      kind: "regular",
      cutoff,
      created,
      approved,
      paid,
      minTransfer: MIN_TRANSFER,
      createdBy: j % 3 === 2 ? FINANCE : OPS,
      approvedBy: j % 5 === 4 ? MANAGER : APPROVER,
      prepare: (round) => {
        if (yearlyGrant) {
          const targets = grantTargets[Math.min(Math.floor(j / 4), grantTargets.length - 1)];
          this.fundGrant(
            round,
            0.7,
            targets,
            `Annual GEBF grant ${year}: ${targets
              .map((t) => `${t.pct} % ${this.targetName(t)}`)
              .join(
                ", ",
              )}, following the board's ${year} review of cost-effectiveness and room for more funding. The rest stays in the fund.`,
          );
        }
        if (earmark && this.projects.has("kenya")) {
          // Earmark part of GiveDirectly's unrestricted balance for the Kenya project
          const gd = this.positionsAt(cutoff, round.id).get(key(O.GD, null));
          const available = gd ? gd.balance - gd.committed : 0;
          const amount = Math.floor((available * 0.4) / 100_000) * 100_000;
          if (amount >= 1_000_000) {
            const project = this.projects.get("kenya")!;
            const reason = `Earmarked for ${project.name} under agreement ${project.row.agreement_ref}`;
            this.adjustment(created, {
              orgId: O.GD,
              cents: -amount,
              type: "reallocation",
              reason,
              effective: cutoff,
              roundId: round.id,
            });
            this.adjustment(created, {
              orgId: O.GD,
              projectId: project.id,
              cents: amount,
              type: "reallocation",
              reason,
              effective: cutoff,
              roundId: round.id,
            });
          }
        }
        if (j === 16 && this.cutoffs.length > 16) this.correction(round);
      },
      edit: (lines) => {
        // Waiting for GiveDirectly's Moms & Babies report: deferred to the next round
        if (j === 5) return lines.filter((l) => l.orgId !== O.GDMB);
        // GDZF is closing: keep its leftover for the reallocation
        if (j === 9) return lines.filter((l) => l.orgId !== O.GDZF);
        return lines;
      },
    });
  }

  private majorDonorRound(
    tag: string,
    arrival: number,
    amount: number,
    split: SplitShare[],
    pay: boolean,
    extra: Partial<RoundPlan> = {},
  ) {
    const registered = arrival - 1;
    this.at(registered, 0, () =>
      this.host.majorGift(tag, registered, arrival, amount, split, (donationId) => {
        this.gifts.set(tag, donationId);
      }),
    );
    const created = bankDays(arrival + 1, 1);
    const approved = bankDays(created + 1, 0);
    const paid = pay ? bankDays(approved + 1, 1) : null;
    this.round({
      name: `Storgiver: ${split.map((s) => this.orgAbbriv.get(s.orgId)).join(" og ")} ${monthYear(
        arrival,
      )}`,
      kind: "major_donor",
      cutoff: arrival,
      created,
      approved,
      paid,
      createdBy: OPS,
      approvedBy: MANAGER,
      donations: () => [this.gifts.get(tag)!],
      ...extra,
    });
  }

  /** An extraordinary round paying New Incentives a pledged gift before it arrived */
  private frontedRound(day: number) {
    const tag = "pledge-ni";
    const amount = 400_000;
    const pledged = bankDays(day, 0);
    const created = bankDays(pledged + 1, 0);
    const approved = bankDays(created + 1, 0);
    const paid = bankDays(approved + 1, 1);
    const arrival = bankDays(paid + 14, 0);
    let fronted: AdjustmentState | null = null;
    this.at(pledged, 0, () =>
      this.host.majorGift(tag, pledged, arrival, amount, [{ orgId: O.NI, pct: 100 }], (id) => {
        // Linked when the donation is registered
        this.gifts.set(tag, id);
        if (fronted) {
          fronted.row.linked_donation_ID = id;
          this.fronted.find((f) => f.adjustment === fronted)!.donationId = id;
        }
      }),
    );
    this.round({
      name: `Forskuttert storgave til New Incentives ${monthYear(pledged)}`,
      kind: "extraordinary",
      cutoff: created - 1,
      created,
      approved,
      paid,
      createdBy: FINANCE,
      approvedBy: MANAGER,
      manualLines: () => [{ orgId: O.NI, projectId: null, cents: amount * 100 }],
      afterPaid: (round) => {
        fronted = this.adjustment(paid, {
          orgId: O.NI,
          cents: amount * 100,
          type: "fronted",
          reason:
            "Paid to New Incentives ahead of a pledged gift of 400 000 kr (the donor asked us to pass it on before the year's distribution); link the donation when it arrives",
          roundId: round.id,
          createdBy: FINANCE,
        });
        this.fronted.push({ adjustment: fronted, donationId: null });
      },
    });
  }

  private malawiFundGrant(afterCutoff: number) {
    const created = bankDays(afterCutoff + 45, 0);
    this.at(created - 25, 0, () =>
      this.project("malawi", O.GD, {
        name: "Malawi: flood recovery cash transfers",
        description:
          "Emergency cash transfers to households in Chikwawa and Nsanje after the floods, followed by a recovery transfer three months later.",
        country: "Malawi",
        start_date: isoDate(created + 20),
        end_date: isoDate(created + 300),
        status: "proposed",
        agreement_ref: `GD-NO-${parts(created).year}-04`,
        report_due: isoDate(created + 360),
        documents_url: "https://drive.example.org/regranting/projects/gd-malawi",
      }),
    );
    const approved = bankDays(created + 1, 1);
    const paid = bankDays(approved + 1, 1);
    this.at(approved, 0, () => (this.projects.get("malawi")!.row.status = "active"));
    this.at(created + 300, 0, () => (this.projects.get("malawi")!.row.status = "completed"));
    this.round({
      name: `GEBF: flomhjelp Malawi`,
      kind: "fund_grant",
      cutoff: created - 1,
      created,
      approved,
      paid,
      createdBy: OPS,
      approvedBy: APPROVER,
      prepare: (round) =>
        this.fundGrant(
          round,
          0.6,
          [{ orgId: O.GD, project: "malawi", pct: 100 }],
          "Off-schedule grant from GEBF after the floods in southern Malawi: GiveDirectly can reach affected households within weeks, and the fund had more than a year's inflow waiting.",
        ),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Reference data

  private setUp() {
    const S = this.start;
    const since = S - 400;
    const payee = (key: string, fields: Partial<Row> & { name: string; currency: string }) =>
      this.payee(S, key, fields);

    const givewell = payee("givewell", {
      name: "GiveWell",
      currency: "USD",
      bank_account: "000000000000 (ABA 000000000)",
      swift: "EXAMPLUS",
      payment_reference_template: "Gi Effektivt {round}: {lines}",
    });
    const gd = payee("gd", {
      name: "GiveDirectly",
      currency: "USD",
      bank_account: "000000000001 (ABA 000000000)",
      swift: "EXAMPLUS",
      payment_reference_template: "Gi Effektivt {round}: {lines}",
    });
    const fem = payee("fem", {
      name: "Family Empowerment Media",
      currency: "EUR",
      iban: "DE89370400440532013000",
      swift: "COBADEFF",
    });
    const thl = payee("thl", {
      name: "The Humane League",
      currency: "USD",
      bank_account: "000000000002",
    });
    const gfi = payee("gfi", {
      name: "Good Food Institute",
      currency: "USD",
      bank_account: "000000000003",
    });
    const ace = payee("ace", {
      name: "Animal Charity Evaluators",
      currency: "USD",
      bank_account: "000000000004",
    });
    const catf = payee("catf", {
      name: "Clean Air Task Force",
      currency: "USD",
      bank_account: "000000000005",
    });
    const ce = payee("ce", {
      name: "Cool Earth",
      currency: "GBP",
      iban: "GB94BARC10201530093459",
      swift: "BARCGB22",
    });
    const ops = payee("ops", {
      name: "Operating account (Driftskonto)",
      currency: "NOK",
      bank_account: "1506.12.34567",
      iban: "NO9386011117947",
      payment_reference_template: "Drift {round}",
    });

    for (const org of [O.AGF, O.TCF, O.HKI, O.NI, O.MC, O.AMF]) this.routing(org, givewell, since);
    for (const org of [O.GD, O.GDMB, O.GDZF]) this.routing(org, gd, since);
    this.routing(O.FEM, fem, since);
    this.routing(O.THL, thl, since);
    this.routing(O.GFI, gfi, since);
    this.routing(O.ACE, ace, since);
    this.routing(O.CATF, catf, since);
    this.routing(O.CE, ce, since);
    this.routing(O.DRIFT, ops, since);

    this.host.add("Funds", { Organization_ID: O.GEBF, max_hold_days: 365 });

    // Carry-over from the sheet into the history
    const rng = this.rng("opening");
    const scale: Record<number, number> = { [O.AGF]: 4, [O.TCF]: 3, [O.DRIFT]: 2 };
    for (const org of [
      O.AGF,
      O.TCF,
      O.HKI,
      O.NI,
      O.MC,
      O.AMF,
      O.GD,
      O.GDMB,
      O.FEM,
      O.GDZF,
      O.DRIFT,
      O.THL,
      O.GFI,
      O.CATF,
    ]) {
      const cents = rng.int(2_000, 40_000) * (scale[org] ?? 1) * 100 + rng.int(0, 99);
      this.adjustment(S, {
        orgId: org,
        cents,
        type: "opening",
        reason:
          'Not yet transferred ("Ikke overført") in Samlefila\'s Tildelinger tab when the history starts',
        effective: S - 1,
        documentRef: "Samlefila / Tildelinger",
      });
    }
  }

  private payee(
    day: number,
    key: string,
    fields: Partial<Row> & { name: string; currency: string },
  ) {
    const id = this.host.id("Payees");
    this.host.add("Payees", {
      ID: id,
      name: fields.name,
      currency: fields.currency,
      bank_account: fields.bank_account ?? null,
      iban: fields.iban ?? null,
      swift: fields.swift ?? null,
      wallet: null,
      payment_reference_template: fields.payment_reference_template ?? null,
      is_active: 1,
      created_at: timestamp(day, 9 * 3600),
    });
    const payee = { id, name: String(fields.name), currency: String(fields.currency) };
    this.payees.set(key, payee);
    return payee;
  }

  private routing(orgId: number, payee: PayeeState, from: number) {
    const row = this.host.add("Organization_payees", {
      ID: this.host.id("Organization_payees"),
      Organization_ID: orgId,
      Payee_ID: payee.id,
      valid_from: isoDate(from),
      valid_to: null,
    });
    this.routings.push({ orgId, payee, from, to: null, row });
  }

  private project(key: string, orgId: number, fields: Record<string, string | null>) {
    const id = this.host.id("Projects");
    const row = this.host.add("Projects", {
      ID: id,
      Organization_ID: orgId,
      name: fields.name,
      description: fields.description,
      country: fields.country,
      start_date: fields.start_date,
      end_date: fields.end_date,
      status: fields.status,
      agreement_ref: fields.agreement_ref,
      report_due: fields.report_due,
      documents_url: fields.documents_url,
      created_at: timestamp(this.dayOf(fields.start_date) - 30, 11 * 3600),
    });
    this.projects.set(key, { id, orgId, name: String(fields.name), row });
  }

  private dayOf(iso: string | null) {
    return iso ? toDay(iso) : this.anchor;
  }

  /** A fund grant target as named in a rationale: the project, else the recipient */
  private targetName(t: { orgId: number; project?: string }) {
    const project = t.project ? this.projects.get(t.project) : undefined;
    return project ? `${this.orgAbbriv.get(t.orgId)} ${project.name}` : this.orgAbbriv.get(t.orgId);
  }

  private hold(
    day: number,
    orgId: number,
    projectId: number | null,
    until: number | null,
    fields: { reason: string },
  ) {
    this.host.add("Regrant_holds", {
      ID: this.host.id("Regrant_holds"),
      Organization_ID: orgId,
      Project_ID: projectId,
      reason: fields.reason,
      until: until === null ? null : isoDate(until),
      created_by: OPS,
      created_at: timestamp(day, 13 * 3600),
    });
    this.holds.push({ orgId, projectId, until });
  }

  private adjustment(
    day: number,
    a: {
      orgId: number;
      projectId?: number | null;
      cents: number;
      type: string;
      reason: string;
      effective?: number;
      roundId?: number | null;
      linkedTransferId?: number | null;
      documentRef?: string | null;
      createdBy?: string;
    },
  ): AdjustmentState {
    const id = this.host.id("Regrant_adjustments");
    const effective = a.effective ?? day;
    const row = this.host.add("Regrant_adjustments", {
      ID: id,
      Organization_ID: a.orgId,
      Project_ID: a.projectId ?? null,
      amount: nok(a.cents),
      type: a.type,
      reason: a.reason,
      effective_at: isoDate(effective),
      Round_ID: a.roundId ?? null,
      linked_transfer_ID: a.linkedTransferId ?? null,
      linked_donation_ID: null,
      created_by: a.createdBy ?? OPS,
      created_at: timestamp(day, 11 * 3600 + (id % 3600)),
    });
    if (a.documentRef) {
      this.host.add("Regrant_documents", {
        ID: this.host.id("Regrant_documents"),
        url: `https://example.org/bilag/${encodeURIComponent(a.documentRef)}`,
        label: a.documentRef,
        Round_ID: null,
        Transfer_ID: null,
        Adjustment_ID: id,
        created_by: a.createdBy ?? OPS,
        created_at: timestamp(day, 11 * 3600 + (id % 3600)),
      });
    }
    const state: AdjustmentState = {
      id,
      orgId: a.orgId,
      projectId: a.projectId ?? null,
      cents: a.cents,
      type: a.type,
      effective,
      roundId: a.roundId ?? null,
      row,
    };
    this.adjustments.push(state);
    return state;
  }

  /** Correction of the HKI line in the previous regular round's GiveWell transfer */
  private correction(round: RoundState) {
    const previous = [...this.rounds]
      .reverse()
      .find((r) => r.kind === "regular" && r.status === "paid" && r.id !== round.id);
    const transfer = previous?.transfers.find((t) => t.lines.some((l) => l.orgId === O.HKI));
    if (!previous || !transfer) return;
    this.adjustment(bankDays(round.cutoff + 1, 0), {
      orgId: O.HKI,
      cents: -180_000,
      type: "correction",
      reason: `The payment order for transfer ${transfer.id} (${previous.name}) sent HKI 1 800 kr more than its line (typo in the bank); GiveWell confirmed the higher amount`,
      effective: round.cutoff,
      roundId: round.id,
      linkedTransferId: transfer.id,
      documentRef: `Bilag ${parts(round.cutoff).year}/${200 + (transfer.id % 97)}`,
      createdBy: FINANCE,
    });
  }

  private lastTransferWith(orgId: number): TransferState | null {
    for (const round of [...this.rounds].reverse()) {
      if (round.status !== "paid") continue;
      const t = round.transfers.find((tr) => tr.lines.some((l) => l.orgId === orgId));
      if (t) return t;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // Ledger (mirrors DAO.regranting.getBalances)

  private consume() {
    const rows = this.host.donations;
    for (; this.consumed < rows.length; this.consumed++) {
      const d = rows[this.consumed];
      const day = toDay(String(d.timestamp_confirmed).slice(0, 10));
      this.donationDay.set(d.ID as number, day);
      if (d.Payment_ID === 15 || d.Payment_ID === 16) continue;
      const cents = Math.round(Number(d.sum_confirmed) * 100);
      let byOrg = this.allocations.get(day);
      if (!byOrg) this.allocations.set(day, (byOrg = new Map()));
      for (const { orgId, share } of this.host.kidShares(String(d.KID_fordeling)) ?? []) {
        byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + cents * share);
      }
    }
  }

  /** A donation's allocations in cents, as Regrant_allocations rounds them per organization */
  private donationAllocations(donationId: number): Map<number, number> {
    const d = this.host.donations[donationId - 1];
    if (!d || d.ID !== donationId) throw new Error(`Donation ${donationId} not found`);
    const cents = Math.round(Number(d.sum_confirmed) * 100);
    const out = new Map<number, number>();
    const micro = new Map<number, number>();
    for (const { orgId, share } of this.host.kidShares(String(d.KID_fordeling)) ?? []) {
      micro.set(orgId, (micro.get(orgId) ?? 0) + cents * share);
    }
    for (const [org, m] of micro) out.set(org, microToCents(m));
    return out;
  }

  /**
   * Balances per (recipient, project) at `cutoff` as the system sees them now, leaving round
   * `excludeRoundId` out (the round being built). Same components as getBalances.
   */
  private positionsAt(
    cutoff: number,
    excludeRoundId: number | null,
  ): Map<string, { orgId: number; projectId: number | null; balance: number; committed: number }> {
    this.consume();
    type Acc = {
      orgId: number;
      projectId: number | null;
      micro: number;
      cents: number;
      committed: number;
      touched: boolean;
    };
    const acc = new Map<string, Acc>();
    const get = (orgId: number, projectId: number | null) => {
      const k = key(orgId, projectId);
      let a = acc.get(k);
      if (!a)
        acc.set(k, (a = { orgId, projectId, micro: 0, cents: 0, committed: 0, touched: false }));
      a.touched = true;
      return a;
    };

    for (const [day, byOrg] of this.allocations) {
      if (day > cutoff) continue;
      for (const [org, micro] of byOrg) get(org, null).micro += micro;
    }
    // As getBalances: an adjustment attached to a round counts once the round is approved (and
    // not for the round itself); approved rounds' adjustments dated later are later debits
    const roundStatus = new Map(this.rounds.map((r) => [r.id, r.status]));
    for (const a of this.adjustments) {
      if (a.type === "fronted") continue;
      if (a.roundId === null) {
        if (a.effective <= cutoff) get(a.orgId, a.projectId).cents += a.cents;
        continue;
      }
      if (a.roundId === excludeRoundId || roundStatus.get(a.roundId) === "draft") continue;
      if (a.effective <= cutoff) get(a.orgId, a.projectId).cents += a.cents;
      else get(a.orgId, a.projectId).committed -= a.cents;
    }
    for (const round of this.rounds) {
      if (round.id === excludeRoundId || round.status === "draft") continue;
      for (const grant of round.fundGrants) {
        for (const line of grant.lines) {
          if (round.cutoff <= cutoff) {
            get(line.orgId, line.projectId).cents += line.cents;
            get(grant.fundId, null).cents -= line.cents;
          } else {
            get(grant.fundId, null).committed += line.cents;
          }
        }
      }
      for (const transfer of round.transfers) {
        for (const line of transfer.lines) {
          const p = get(line.orgId, line.projectId);
          if (round.status === "approved") p.committed += line.cents;
          else if (transfer.paidDay! <= cutoff) p.cents -= line.cents;
          else p.committed += line.cents;
        }
      }
    }

    const out = new Map<
      string,
      { orgId: number; projectId: number | null; balance: number; committed: number }
    >();
    for (const [k, a] of acc) {
      out.set(k, {
        orgId: a.orgId,
        projectId: a.projectId,
        balance: microToCents(a.micro) + a.cents,
        committed: a.committed,
      });
    }
    return out;
  }

  private payeesAt(day: number): Map<number, PayeeRef> {
    const out = new Map<number, PayeeRef>();
    for (const r of [...this.routings].sort((a, b) => a.from - b.from)) {
      if (r.from <= day && (r.to === null || r.to >= day)) out.set(r.orgId, r.payee);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Rounds

  private round(plan: RoundPlan) {
    let round: RoundState;
    this.at(plan.created, 3, () => {
      round = this.createRound(plan);
    });
    if (plan.approved !== null) {
      const approved = plan.approved;
      this.at(approved, 2, () => this.approveRound(round, approved, plan.approvedBy ?? APPROVER));
    }
    if (plan.paid !== null) {
      const paid = plan.paid;
      this.at(paid, 1, () => {
        this.payRound(round, paid);
        plan.afterPaid?.(round);
      });
    }
  }

  private createRound(plan: RoundPlan): RoundState {
    const id = this.host.id("Regrant_rounds");
    const createdBy = plan.createdBy ?? OPS;
    const row = this.host.add("Regrant_rounds", {
      ID: id,
      name: plan.name,
      kind: plan.kind,
      cutoff: isoDate(plan.cutoff),
      status: "draft",
      min_transfer: nok(plan.minTransfer ?? 0),
      created_by: createdBy,
      created_at: timestamp(plan.created, 9 * 3600 + 15 * 60 + (id % 1800)),
      approved_by: null,
      approved_at: null,
      paid_at: null,
    });
    const round: RoundState = {
      id,
      name: plan.name,
      kind: plan.kind,
      cutoff: plan.cutoff,
      status: "draft",
      minTransfer: plan.minTransfer ?? 0,
      row,
      transfers: [],
      fundGrants: [],
      donationIds: plan.donations?.() ?? [],
      overrides: new Map(plan.overrides ?? []),
      createdBy,
    };
    this.rounds.push(round);
    for (const donationId of round.donationIds) {
      this.host.add("Regrant_round_donations", { Round_ID: id, Donation_ID: donationId });
    }
    for (const [orgId, includeDirect] of round.overrides) {
      this.host.add("Regrant_round_recipients", {
        Round_ID: id,
        Organization_ID: orgId,
        include_direct: includeDirect ? 1 : 0,
      });
    }

    plan.prepare?.(round);

    // The proposal, as rounds.create/propose would make it
    const { transfers } = this.propose(round);
    const byPayee = new Map<number, { payee: PayeeRef; lines: Line[] }>();
    for (const t of transfers) {
      byPayee.set(t.payee.id, {
        payee: t.payee,
        lines: t.lines.map((l) => ({
          orgId: l.organizationId,
          projectId: l.projectId,
          cents: toCents(l.amount),
        })),
      });
    }
    // Human edits, then hand-entered lines
    for (const [payeeId, t] of byPayee) {
      t.lines = plan.edit ? plan.edit(t.lines, round) : t.lines;
      if (t.lines.length === 0) byPayee.delete(payeeId);
    }
    const payees = this.payeesAt(round.cutoff);
    for (const line of plan.manualLines?.(round) ?? []) {
      const payee = payees.get(line.orgId)!;
      if (!byPayee.has(payee.id)) byPayee.set(payee.id, { payee, lines: [] });
      byPayee.get(payee.id)!.lines.push(line);
    }

    for (const { payee, lines } of byPayee.values()) {
      const transferId = this.host.id("Regrant_transfers");
      const total = lines.reduce((s, l) => s + l.cents, 0);
      const transferRow = this.host.add("Regrant_transfers", {
        ID: transferId,
        Round_ID: id,
        Payee_ID: payee.id,
        amount_nok: nok(total),
        currency: payee.currency,
        amount_foreign: null,
        fx_rate: null,
        bank_fee: null,
        paid_at: null,
        bank_ref: null,
        paid_by: "foundation",
      });
      const transfer: TransferState = {
        id: transferId,
        payee: payee as PayeeState,
        row: transferRow,
        lines: [],
        paidDay: null,
      };
      for (const line of lines) {
        const lineId = this.host.id("Regrant_transfer_lines");
        this.host.add("Regrant_transfer_lines", {
          ID: lineId,
          Transfer_ID: transferId,
          Organization_ID: line.orgId,
          Project_ID: line.projectId,
          amount_nok: nok(line.cents),
        });
        transfer.lines.push({ ...line, id: lineId });
      }
      round.transfers.push(transfer);
    }
    return round;
  }

  /** Positions of a round at its cutoff, with what is in it, through the backend's proposal */
  private propose(round: RoundState) {
    const positions = new Map<string, Position>();
    const position = (orgId: number, projectId: number | null) => {
      const k = key(orgId, projectId);
      if (!positions.has(k)) {
        positions.set(k, {
          organizationId: orgId,
          projectId,
          balanceAtCutoff: new Decimal(0),
          committed: new Decimal(0),
          fundGrants: new Decimal(0),
          roundAdjustments: new Decimal(0),
          inRound: new Decimal(0),
        });
      }
      return positions.get(k)!;
    };
    for (const p of this.positionsAt(round.cutoff, round.id).values()) {
      if (p.balance === 0 && p.committed === 0) continue;
      const pos = position(p.orgId, p.projectId);
      pos.balanceAtCutoff = dec(p.balance);
      pos.committed = dec(p.committed);
    }
    for (const grant of round.fundGrants) {
      for (const line of grant.lines) {
        const fund = position(grant.fundId, null);
        fund.fundGrants = fund.fundGrants.minus(dec(line.cents));
        const p = position(line.orgId, line.projectId);
        p.fundGrants = p.fundGrants.plus(dec(line.cents));
      }
    }
    for (const transfer of round.transfers) {
      for (const line of transfer.lines) {
        const p = position(line.orgId, line.projectId);
        p.inRound = p.inRound.plus(dec(line.cents));
      }
    }
    for (const a of this.adjustments) {
      if (a.roundId !== round.id || a.type === "fronted" || a.effective > round.cutoff) continue;
      const p = position(a.orgId, a.projectId);
      p.roundAdjustments = p.roundAdjustments.plus(dec(a.cents));
    }

    const chosen = new Map<number, Decimal>();
    for (const d of this.roundDonations(round).filter((x) => x.inScope)) {
      for (const a of d.allocations) {
        chosen.set(
          a.organizationId,
          (chosen.get(a.organizationId) ?? new Decimal(0)).plus(a.amount),
        );
      }
    }
    const holds = this.holds
      .filter((h) => h.until === null || h.until >= round.cutoff)
      .map((h) => ({ organizationId: h.orgId, projectId: h.projectId }));

    return proposeRound({
      kind: round.kind,
      minTransfer: dec(round.minTransfer),
      positions: [...positions.values()],
      fundIds: this.fundIds,
      chosenAllocations: chosen,
      includeDirectOverrides: round.overrides,
      holds,
      payees: this.payeesAt(round.cutoff),
    });
  }

  private roundDonations(round: RoundState): RoundDonation[] {
    return round.donationIds.map((donationId) => {
      const passedOnBy = this.rounds.find(
        (r) => r.id !== round.id && r.status !== "draft" && r.donationIds.includes(donationId),
      );
      const fronted = this.fronted.find((f) => f.donationId === donationId);
      const day = this.donationDay.get(donationId)!;
      const excludedReason =
        passedOnBy || fronted ? "passed_on" : day > round.cutoff ? "after_cutoff" : null;
      const allocations = [...this.donationAllocations(donationId)].map(([org, cents]) => ({
        organizationId: org,
        amount: nok(cents),
      }));
      return {
        donationId,
        donorId: 0,
        sum: "0.00",
        timestampConfirmed: new Date(0),
        allocations,
        inScope: excludedReason === null,
        excludedReason,
        passedOnByRoundId: passedOnBy?.id ?? null,
        frontedByAdjustmentId: fronted?.adjustment.id ?? null,
      };
    });
  }

  /** A grant from GEBF in the round: `fraction` of what the fund can grant, in whole thousands */
  private fundGrant(
    round: RoundState,
    fraction: number,
    targets: { orgId: number; project?: string; pct: number }[],
    rationale: string,
  ) {
    const fund = this.positionsAt(round.cutoff, round.id).get(key(O.GEBF, null));
    const available = fund ? fund.balance - fund.committed : 0;
    const total = Math.floor((available * fraction) / 100_000) * 100_000;
    if (total < 2_000_000) return;
    const lines: Line[] = [];
    let rest = total;
    targets.forEach((t, i) => {
      const projectId = t.project ? this.projects.get(t.project)?.id ?? null : null;
      const cents =
        i === targets.length - 1 ? rest : Math.floor((total * t.pct) / 100 / 100_000) * 100_000;
      rest -= cents;
      // A project that doesn't exist yet: the recipient's unrestricted balance
      const existing = lines.find((l) => l.orgId === t.orgId && l.projectId === projectId);
      if (existing) existing.cents += cents;
      else lines.push({ orgId: t.orgId, projectId, cents });
    });

    const id = this.host.id("Fund_grants");
    const createdAt = timestamp(this.dayOfRow(round.row.created_at), 10 * 3600);
    const row = this.host.add("Fund_grants", {
      ID: id,
      Fund_ID: O.GEBF,
      Round_ID: round.id,
      rationale,
      approved_by: null,
      approved_at: null,
      created_by: round.createdBy,
      created_at: createdAt,
    });
    const grant: FundGrantState = { id, fundId: O.GEBF, rationale, row, lines: [] };
    for (const line of lines) {
      const lineId = this.host.id("Fund_grant_lines");
      this.host.add("Fund_grant_lines", {
        ID: lineId,
        Fund_grant_ID: id,
        Organization_ID: line.orgId,
        Project_ID: line.projectId,
        amount: nok(line.cents),
      });
      grant.lines.push({ ...line, id: lineId });
    }
    round.fundGrants.push(grant);
  }

  private dayOfRow(ts: Row[string]) {
    return toDay(String(ts).slice(0, 10));
  }

  /** draft → approved: validation must pass, then the balance snapshot is written */
  private approveRound(round: RoundState, day: number, approver: string) {
    if (approver === round.createdBy) throw new Error(`Round ${round.name}: approver = creator`);
    const { positions } = this.propose(round);
    const issues = this.validate(round, positions);
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `Seeded round "${round.name}" doesn't validate: ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    for (const p of positions) {
      const anything =
        !p.balanceAtCutoff.isZero() ||
        !p.committed.isZero() ||
        !p.fundGrants.isZero() ||
        !p.roundAdjustments.isZero() ||
        !p.inRound.isZero() ||
        !p.proposed.isZero();
      if (!anything) continue;
      this.host.add("Regrant_round_balances", {
        ID: this.host.id("Regrant_round_balances"),
        Round_ID: round.id,
        Organization_ID: p.organizationId,
        Project_ID: p.projectId,
        balance_at_cutoff: nok(toCents(p.balanceAtCutoff)),
        committed: nok(toCents(p.committed)),
        fund_grants: nok(toCents(p.fundGrants)),
        in_round: nok(toCents(p.inRound)),
        round_adjustments: nok(toCents(p.roundAdjustments)),
        included_direct: this.fundIds.has(p.organizationId) ? 0 : p.includeDirect ? 1 : 0,
      });
    }
    const approvedAt = timestamp(day, 14 * 3600 + 20 * 60 + (round.id % 1800));
    round.status = "approved";
    Object.assign(round.row, {
      status: "approved",
      approved_by: approver,
      approved_at: approvedAt,
    });
    for (const grant of round.fundGrants) {
      Object.assign(grant.row, { approved_by: approver, approved_at: approvedAt });
    }
  }

  private validate(
    round: RoundState,
    positions: ReturnType<typeof proposeRound>["positions"],
  ): Issue[] {
    const transfers: Transfer[] = round.transfers.map((t) => ({
      id: t.id,
      roundId: round.id,
      payee: { id: t.payee.id, name: t.payee.name, currency: t.payee.currency },
      amountNok: String(t.row.amount_nok),
      currency: String(t.row.currency),
      amountForeign: null,
      fxRate: null,
      bankFee: null,
      paidAt: null,
      bankRef: null,
      paidBy: "foundation",
      documents: [],
      lines: t.lines.map((l) => ({
        id: l.id,
        transferId: t.id,
        organizationId: l.orgId,
        organizationName: this.orgNames.get(l.orgId) ?? "",
        projectId: l.projectId,
        projectName: null,
        amountNok: nok(l.cents),
      })),
    }));
    const fundGrants: FundGrant[] = round.fundGrants.map((g) => ({
      id: g.id,
      fundId: g.fundId,
      fundName: this.orgNames.get(g.fundId) ?? "",
      roundId: round.id,
      rationale: g.rationale,
      approvedBy: null,
      approvedAt: null,
      createdBy: round.createdBy,
      createdAt: new Date(0),
      total: nok(g.lines.reduce((s, l) => s + l.cents, 0)),
      lines: g.lines.map((l) => ({
        id: l.id,
        fundGrantId: g.id,
        organizationId: l.orgId,
        organizationName: this.orgNames.get(l.orgId) ?? "",
        projectId: l.projectId,
        projectName: null,
        amount: nok(l.cents),
      })),
    }));
    const projectOrganizations = new Map([...this.projects.values()].map((p) => [p.id, p.orgId]));
    return validateRound({
      positions,
      fundIds: this.fundIds,
      transfers,
      fundGrants,
      projectOrganizations,
      payees: this.payeesAt(round.cutoff),
      unassigned: { amount: "0.00", donationCount: 0 },
      donations: this.roundDonations(round),
      organizationNames: this.orgNames,
    });
  }

  /** Records each transfer's payment (FX, fee, bank reference) and marks the round paid */
  private payRound(round: RoundState, day: number) {
    const rng = this.rng("payment", round.id);
    const externalUntil = this.cutoffs.length > 6 ? this.cutoffs[6] : this.start - 1;
    let last = day;
    round.transfers.forEach((t, i) => {
      // NOK transfers go out the day before the foreign ones
      const paidDay = t.payee.currency === "NOK" ? Math.min(day, bankDays(day - 2, 0)) : day;
      const external = t.payee.name === "Family Empowerment Media" && round.cutoff <= externalUntil;
      const amount = Number(t.row.amount_nok);
      let fx: number | null = null;
      if (t.payee.currency !== "NOK" && !external) fx = this.fxRate(t.payee.currency, paidDay, rng);
      Object.assign(t.row, {
        paid_at: isoDate(paidDay),
        amount_foreign: fx === null ? null : (amount / fx).toFixed(2),
        fx_rate: fx === null ? null : fx.toFixed(4),
        bank_fee: fx === null ? null : nok(rng.int(120, 260) * 100),
        bank_ref: external
          ? "Paid by EA Norway from its FEM account"
          : `DNB ${isoDate(paidDay).replace(/-/g, "")}-${String(
              1000 + ((round.id * 37 + i * 11) % 9000),
            )}`,
        paid_by: external ? "external" : "foundation",
      });
      t.paidDay = paidDay;
      last = Math.max(last, paidDay);
    });
    round.status = "paid";
    Object.assign(round.row, { status: "paid", paid_at: isoDate(last) });
  }

  /** NOK per unit, drifting slowly over the history */
  private fxRate(currency: string, day: number, rng: Rng): number {
    const years = (day - this.start) / 365.25;
    const usd = 9.2 + 0.35 * years + 0.45 * Math.sin(day / 97) + (rng.next() - 0.5) * 0.08;
    const factor: Record<string, number> = { USD: 1, EUR: 1.09, GBP: 1.27 };
    return Math.round(usd * (factor[currency] ?? 1) * 10_000) / 10_000;
  }
}

const key = (orgId: number, projectId: number | null) => `${orgId}:${projectId ?? ""}`;
