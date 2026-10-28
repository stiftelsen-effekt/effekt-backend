import { TRPCError } from "@trpc/server";
import { Decimal } from "decimal.js";
import { DAO } from "../DAO";
import type { LedgerEntryRow, TracedDonationRow } from "../DAO_modules/regrantingTrace";
import { osloDayEnd } from "../osloDays";
import { apportion, runFifo, type FifoEvent, type FifoInflow, type FifoTake } from "./fifo";
import { dateNo, dayBefore, dec, fmt, krNo, sum, todayOslo, ZERO } from "./money";
import { figuresFor } from "./service";
import type {
  AdjustmentType,
  IsoDate,
  LedgerFigures,
  Money,
  PaidBy,
  PayeeRef,
  RoundKind,
  RoundStatus,
} from "./types";

/**
 * Tracing the numbers (docs/regranting.md, "Tracing the numbers"): where a balance comes from
 * (getBalanceBreakdown), what each transfer line of a round contained (getRoundComposition, FIFO)
 * and the monthly check of allocations against the donations (getMonthlyReconciliation).
 * Every figure adds up exactly: sums are taken over exact decimals and rounded once, and lists of
 * parts are rounded so they add up to their total (apportion).
 */

const dao = () => DAO.regranting;
const trace = () => DAO.regrantingTrace;
const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

/** Date → "2026-07-31 22:00:00" (UTC wall clock, as timestamp_confirmed is compared) */
const utcWallClock = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

const lastDayOfMonth = (month: string): IsoDate => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m!, 0));
  return d.toISOString().slice(0, 10);
};
const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/** The admin's Donations list for one organization and an inclusive range of Oslo days */
export type DonationsListLink = { organizationId: number; from: IsoDate; to: IsoDate };

//region Balance breakdown

export type BreakdownScope = "all" | "unrestricted" | number;

export type BreakdownRound = {
  id: number;
  name: string;
  kind: RoundKind;
  status: RoundStatus;
  cutoff: IsoDate;
};

export type BreakdownEntry = {
  /** Signed as it affects the figure it is listed under */
  amount: Money;
  date: IsoDate | null;
  projectId: number | null;
  projectName: string | null;
  round: BreakdownRound | null;
  /** adjustments (incl. opening) */
  adjustmentId: number | null;
  adjustmentType: AdjustmentType | null;
  reason: string | null;
  documentRef: string | null;
  linkedTransferId: number | null;
  /** fund grants */
  fundGrantId: number | null;
  fundGrantLineId: number | null;
  /** fund_grant_in: the fund; fund_grant_out: the recipient */
  counterpartOrganizationId: number | null;
  counterpartName: string | null;
  rationale: string | null;
  /** transfers */
  transferId: number | null;
  transferLineId: number | null;
  payeeName: string | null;
  bankRef: string | null;
  paidBy: PaidBy | null;
};

export type CommittedReason =
  /** A transfer line of an approved round that isn't paid yet */
  | "approved_unpaid"
  /** A transfer line paid after the date */
  | "paid_later"
  /** An own fund's grant in a round with a later cutoff */
  | "granted_later"
  /** An adjustment of an approved/paid round dated after the date (negated) */
  | "adjusted_later";

export type CommittedEntry = BreakdownEntry & { committedReason: CommittedReason };

export type AllocationMonth = {
  /** "2026-08" */
  month: string;
  /** UTC days the month covers here (the last month ends at the date) */
  from: IsoDate;
  to: IsoDate;
  /** The recipient's share, rounded so the months add up to the total exactly */
  amount: Money;
  donationCount: number;
  /** The donations' whole sums (the recipient's share is part of them) */
  donationsSum: Money;
  /**
   * What the Donations list shows for the link (organization + these days as Oslo days, payment
   * methods except 15 and 16): donations and the sum of each one's share, rounded per donation.
   */
  list: {
    link: DonationsListLink;
    donationCount: number;
    sum: Money;
    /** list.sum − amount */
    difference: Money;
    /** Of the difference: rounding each donation's share to øre */
    rounding: Money;
    /** Of the difference: donations confirmed between midnight Oslo time and midnight UTC */
    timeZone: Money;
    timeZoneDonations: number;
  };
};

export type BalanceBreakdown = {
  organizationId: number;
  name: string;
  abbriv: string;
  isFund: boolean;
  scope: BreakdownScope;
  projectName: string | null;
  at: IsoDate;
  /** The round whose cutoff this is (round builder): its own entries are under `round` */
  round: BreakdownRound | null;
  opening: { total: Money; entries: BreakdownEntry[] };
  allocations: { total: Money; months: AllocationMonth[]; donationCount: number };
  fundGrantsIn: { total: Money; entries: BreakdownEntry[] };
  fundGrantsOut: { total: Money; entries: BreakdownEntry[] };
  transfers: { total: Money; entries: BreakdownEntry[] };
  adjustments: { total: Money; entries: BreakdownEntry[] };
  /** opening + allocations + fund grants in + fund grants out + transfers + adjustments */
  balance: Money;
  committed: { total: Money; entries: CommittedEntry[] };
  /** balance − committed */
  available: Money;
  /** Round builder only: this round's own figures, as the builder adds them */
  inRound: {
    fundGrants: { total: Money; entries: BreakdownEntry[] };
    adjustments: { total: Money; entries: BreakdownEntry[] };
    /** available + fund grants + adjustments: what the round can pay */
    available: Money;
    /** The round's saved transfer lines (Pay now) */
    payNow: { total: Money; entries: BreakdownEntry[] };
    /** available − pay now */
    carriesOver: Money;
  } | null;
  /** The same figures from the balance query; `matches` is false if anything differs */
  check: { ledger: LedgerFigures; matches: boolean; differences: string[] };
  /** Payment methods the Donations list links include (all but 15 and 16) */
  paymentMethodIds: number[];
};

const emptyEntry = (): BreakdownEntry => ({
  amount: "0.00",
  date: null,
  projectId: null,
  projectName: null,
  round: null,
  adjustmentId: null,
  adjustmentType: null,
  reason: null,
  documentRef: null,
  linkedTransferId: null,
  fundGrantId: null,
  fundGrantLineId: null,
  counterpartOrganizationId: null,
  counterpartName: null,
  rationale: null,
  transferId: null,
  transferLineId: null,
  payeeName: null,
  bankRef: null,
  paidBy: null,
});

const roundOf = (row: LedgerEntryRow): BreakdownRound | null =>
  row.roundId === null
    ? null
    : {
        id: row.roundId,
        name: row.roundName!,
        kind: row.roundKind!,
        status: row.roundStatus!,
        cutoff: row.roundCutoff!,
      };

/**
 * Where a balance comes from: every entry behind each figure of balances.list (or, with `roundId`,
 * behind the round builder's line at the round's cutoff), allocations by UTC month with what the
 * Donations list shows for each, and a check against the balance query.
 */
export async function getBalanceBreakdown(input: {
  organizationId: number;
  /** undefined = the recipient (all projects); null = unrestricted; a number = that project */
  projectId?: number | null;
  /** Default today (Oslo); with roundId, the round's cutoff */
  at?: IsoDate;
  roundId?: number;
}): Promise<BalanceBreakdown> {
  const [organizations, funds, projects] = await Promise.all([
    dao().getOrganizations(),
    dao().listFunds(),
    dao().getProjectNames(),
  ]);
  const org = organizations.find((o) => o.id === input.organizationId);
  if (!org) throw notFound(`Recipient #${input.organizationId} not found`);
  const names = new Map(organizations.map((o) => [o.id, o.name]));

  let round: BreakdownRound | null = null;
  if (input.roundId !== undefined) {
    const r = await dao().getRound(input.roundId);
    if (!r) throw notFound(`Round #${input.roundId} not found`);
    if (input.at !== undefined && input.at !== r.cutoff) {
      throw badRequest(
        `A breakdown for ${r.name} is at its cutoff (${dateNo(r.cutoff)}); leave out the date`,
      );
    }
    round = { id: r.id, name: r.name, kind: r.kind, status: r.status, cutoff: r.cutoff };
  }
  const at = round?.cutoff ?? input.at ?? todayOslo();
  const scope: BreakdownScope =
    input.projectId === undefined
      ? "all"
      : input.projectId === null
      ? "unrestricted"
      : input.projectId;
  if (typeof scope === "number") {
    const owners = await dao().getProjectOrganizations([scope]);
    if (owners.get(scope) !== org.id) {
      throw badRequest(`Project #${scope} isn't a project at ${org.name}`);
    }
  }
  const inScope = (projectId: number | null) =>
    scope === "all" || (scope === "unrestricted" ? projectId === null : projectId === scope);
  // Donations only ever allocate to the unrestricted balance
  const withAllocations = typeof scope !== "number";

  const [entries, months, ledgerRows, paymentMethodIds] = await Promise.all([
    trace().getLedgerEntries([org.id], { includeRoundId: round?.id }),
    withAllocations ? trace().getAllocationMonths(org.id, at) : Promise.resolve([]),
    dao().getBalances({ at, organizationIds: [org.id], excludeRoundId: round?.id }),
    trace().getIncludedPaymentMethodIds(),
  ]);

  const opening: BreakdownEntry[] = [];
  const fundGrantsIn: BreakdownEntry[] = [];
  const fundGrantsOut: BreakdownEntry[] = [];
  const transfers: BreakdownEntry[] = [];
  const adjustments: BreakdownEntry[] = [];
  const committed: CommittedEntry[] = [];
  const roundGrants: BreakdownEntry[] = [];
  const roundAdjustments: BreakdownEntry[] = [];
  const roundLines: BreakdownEntry[] = [];

  for (const row of entries) {
    if (!inScope(row.projectId)) continue;
    const base: BreakdownEntry = {
      ...emptyEntry(),
      date: row.date,
      projectId: row.projectId,
      projectName: row.projectId === null ? null : projects.get(row.projectId)?.name ?? null,
      round: roundOf(row),
    };
    const own = round !== null && row.roundId === round.id;
    const amount = dec(row.amount);
    switch (row.kind) {
      case "adjustment": {
        if (row.adjustmentType === "fronted") break; // a record: never in the balance
        const entry: BreakdownEntry = {
          ...base,
          amount: fmt(amount),
          adjustmentId: row.adjustmentId,
          adjustmentType: row.adjustmentType,
          reason: row.reason,
          documentRef: row.documentRef,
          linkedTransferId: row.linkedTransferId,
        };
        if (own) {
          if (row.date! <= at) roundAdjustments.push(entry);
        } else if (row.date! <= at) {
          (row.adjustmentType === "opening" ? opening : adjustments).push(entry);
        } else if (row.roundId !== null) {
          committed.push({
            ...entry,
            amount: fmt(amount.negated()),
            committedReason: "adjusted_later",
          });
        }
        break;
      }
      case "fund_grant_in":
      case "fund_grant_out": {
        const out = row.kind === "fund_grant_out";
        const entry: BreakdownEntry = {
          ...base,
          amount: fmt(out ? amount.negated() : amount),
          fundGrantId: row.fundGrantId,
          fundGrantLineId: row.fundGrantLineId,
          counterpartOrganizationId: row.counterpartOrganizationId,
          counterpartName:
            row.counterpartOrganizationId === null
              ? null
              : names.get(row.counterpartOrganizationId) ?? null,
          rationale: row.rationale,
        };
        if (own) roundGrants.push(entry);
        else if (row.date! <= at) (out ? fundGrantsOut : fundGrantsIn).push(entry);
        else if (out)
          committed.push({ ...entry, amount: fmt(amount), committedReason: "granted_later" });
        break;
      }
      case "transfer": {
        const entry: BreakdownEntry = {
          ...base,
          amount: fmt(amount.negated()),
          transferId: row.transferId,
          transferLineId: row.transferLineId,
          payeeName: row.payeeName,
          bankRef: row.bankRef,
          paidBy: row.paidBy,
        };
        if (own) roundLines.push({ ...entry, amount: fmt(amount) });
        else if (row.roundStatus === "approved")
          committed.push({ ...entry, amount: fmt(amount), committedReason: "approved_unpaid" });
        else if (row.date !== null && row.date <= at) transfers.push(entry);
        else committed.push({ ...entry, amount: fmt(amount), committedReason: "paid_later" });
        break;
      }
    }
  }

  // Allocations by UTC month, each with what the Donations list shows for it
  const exactMonths = months.map((m) => dec(m.amount));
  const roundedMonths = apportion(exactMonths);
  const monthDays = months.map((m) => ({
    month: m.month,
    from: `${m.month}-01`,
    to: minDate(lastDayOfMonth(m.month), at),
  }));
  const list = withAllocations
    ? await trace().getDonationsListMonths(org.id, {
        utcBefore: `${nextDay(at)} 00:00:00`,
        osloBefore: utcWallClock(osloDayEnd(at)),
      })
    : { utc: [], oslo: [] };
  const osloBy = new Map(list.oslo.map((m) => [m.month, m]));
  const utcBy = new Map(list.utc.map((m) => [m.month, m]));
  const allocationMonths: AllocationMonth[] = months.map((m, i) => {
    const days = monthDays[i]!;
    const oslo = osloBy.get(m.month);
    const utc = utcBy.get(m.month);
    const amount = roundedMonths[i]!;
    const osloSum = dec(oslo?.sum ?? 0);
    const utcSum = dec(utc?.sum ?? 0);
    return {
      month: m.month,
      from: days.from,
      to: days.to,
      amount: fmt(amount),
      donationCount: m.donationCount,
      donationsSum: fmt(dec(m.donationsSum)),
      list: {
        link: { organizationId: org.id, from: days.from, to: days.to },
        donationCount: oslo?.donationCount ?? 0,
        sum: fmt(osloSum),
        difference: fmt(osloSum.minus(amount)),
        rounding: fmt(utcSum.minus(amount)),
        timeZone: fmt(osloSum.minus(utcSum)),
        timeZoneDonations: (oslo?.donationCount ?? 0) - (utc?.donationCount ?? 0),
      },
    };
  });

  const total = (list: BreakdownEntry[]) => sum(list.map((e) => e.amount));
  const allocationsTotal = sum(roundedMonths);
  const balance = sum([
    total(opening),
    allocationsTotal,
    total(fundGrantsIn),
    total(fundGrantsOut),
    total(transfers),
    total(adjustments),
  ]);
  const committedTotal = total(committed);
  const available = balance.minus(committedTotal);

  const ledger = figuresFor(ledgerRows.filter((r) => inScope(r.projectId)));
  const mine: LedgerFigures = {
    opening: fmt(total(opening)),
    allocations: fmt(allocationsTotal),
    fundGrantsIn: fmt(total(fundGrantsIn)),
    fundGrantsOut: fmt(total(fundGrantsOut)),
    transfers: fmt(total(transfers)),
    adjustments: fmt(total(adjustments)),
    balance: fmt(balance),
    committed: fmt(committedTotal),
    available: fmt(available),
  };
  const differences = (Object.keys(mine) as (keyof LedgerFigures)[])
    .filter((k) => mine[k] !== ledger[k])
    .map((k) => `${k}: ${krNo(mine[k])} here, ${krNo(ledger[k])} in the balance query`);

  let inRound: BalanceBreakdown["inRound"] = null;
  if (round) {
    const grants = total(roundGrants);
    const adjusted = total(roundAdjustments);
    const roundAvailable = available.plus(grants).plus(adjusted);
    const payNow = total(roundLines);
    inRound = {
      fundGrants: { total: fmt(grants), entries: roundGrants },
      adjustments: { total: fmt(adjusted), entries: roundAdjustments },
      available: fmt(roundAvailable),
      payNow: { total: fmt(payNow), entries: roundLines },
      carriesOver: fmt(roundAvailable.minus(payNow)),
    };
  }

  return {
    organizationId: org.id,
    name: org.name,
    abbriv: org.abbriv,
    isFund: funds.some((f) => f.organizationId === org.id),
    scope,
    projectName: typeof scope === "number" ? projects.get(scope)?.name ?? null : null,
    at,
    round,
    opening: { total: mine.opening, entries: opening },
    allocations: {
      total: mine.allocations,
      months: allocationMonths,
      donationCount: months.reduce((n, m) => n + m.donationCount, 0),
    },
    fundGrantsIn: { total: mine.fundGrantsIn, entries: fundGrantsIn },
    fundGrantsOut: { total: mine.fundGrantsOut, entries: fundGrantsOut },
    transfers: { total: mine.transfers, entries: transfers },
    adjustments: { total: mine.adjustments, entries: adjustments },
    balance: mine.balance,
    committed: { total: mine.committed, entries: committed },
    available: mine.available,
    inRound,
    check: { ledger, matches: differences.length === 0, differences },
    paymentMethodIds,
  };
}

//endregion

//region Round composition

type InflowSource =
  | { kind: "opening"; adjustmentId: number; reason: string; documentRef: string | null }
  | { kind: "day"; organizationId: number; donationCount: number }
  | { kind: "donation"; donation: TracedDonationRow }
  | {
      kind: "fund_grant_in";
      fundGrantId: number;
      fundGrantLineId: number;
      fundId: number;
      round: BreakdownRound;
      rationale: string;
    }
  | {
      kind: "adjustment";
      adjustmentId: number;
      type: AdjustmentType;
      reason: string;
      round: BreakdownRound | null;
      documentRef: string | null;
      linkedTransferId: number | null;
    };

type OutflowTag = {
  round: BreakdownRound;
  transferId: number;
  transferLineId: number;
  payee: PayeeRef;
  paidAt: IsoDate | null;
  organizationId: number;
  projectId: number | null;
};

export type CompositionMonth = {
  month: string;
  from: IsoDate;
  to: IsoDate;
  amount: Money;
  /** Donations confirmed on the days taken (a shared first or last day counts whole) */
  donationCount: number;
  /** Only part of the month's allocations is in this payment */
  partial: boolean;
  link: DonationsListLink;
};

export type CompositionItem =
  | {
      kind: "donations";
      /** First and last UTC day taken */
      from: IsoDate;
      to: IsoDate;
      amount: Money;
      donationCount: number;
      /** The first day was partly paid before / the last day is partly left for later */
      partialStart: boolean;
      partialEnd: boolean;
      months: CompositionMonth[];
      link: DonationsListLink;
    }
  | {
      kind: "donation";
      reason: "chosen" | "fronted";
      donationId: number;
      donorId: number;
      donorName: string | null;
      date: IsoDate;
      timestampConfirmed: Date;
      /** The whole donation */
      sum: Money;
      /** Its share to this recipient taken here */
      amount: Money;
      roundId: number | null;
      adjustmentId: number | null;
    }
  | {
      kind: "opening";
      adjustmentId: number;
      date: IsoDate;
      reason: string;
      documentRef: string | null;
      amount: Money;
    }
  | {
      kind: "fund_grant_in";
      fundGrantId: number;
      fundGrantLineId: number;
      fundId: number;
      fundName: string;
      round: BreakdownRound;
      rationale: string;
      date: IsoDate;
      amount: Money;
    }
  | {
      kind: "adjustment";
      adjustmentId: number;
      type: AdjustmentType;
      reason: string;
      round: BreakdownRound | null;
      documentRef: string | null;
      linkedTransferId: number | null;
      date: IsoDate;
      amount: Money;
    };

export type CompositionGroup = { amount: Money; items: CompositionItem[] };

export type CompositionLine = {
  transferId: number;
  transferLineId: number;
  payee: PayeeRef;
  paidAt: IsoDate | null;
  organizationId: number;
  organizationName: string;
  projectId: number | null;
  projectName: string | null;
  /** The line's amount: thisRound + carriedOver + sinceLastTransfer + ahead */
  amount: Money;
  /** The recipient's (position's) previous transfer in another round */
  previous: {
    round: BreakdownRound;
    transferId: number;
    payeeName: string;
    paidAt: IsoDate | null;
  } | null;
  /** (previous transfer's cutoff, this cutoff]: what is "new since the last transfer" */
  window: { from: IsoDate | null; to: IsoDate };
  /** Passed on individually or decided in this round: chosen donations, its fund grants and adjustments */
  thisRound: CompositionGroup;
  /** Older money not paid in earlier rounds (dated on or before the previous transfer's cutoff) */
  carriedOver: CompositionGroup;
  /** Money that came in since the previous transfer's cutoff, oldest first */
  sinceLastTransfer: CompositionGroup;
  /** Paid before the money came in (the balance went negative), and what covered it later */
  ahead: { amount: Money; settledBy: CompositionItem[]; unsettled: Money } | null;
  /** Money up to the cutoff the round didn't pay: it carries over to the next round */
  leftAfter: { amount: Money; oldest: IsoDate | null };
};

export type RoundComposition = {
  round: BreakdownRound & { paidAt: IsoDate | null };
  lines: CompositionLine[];
  paymentMethodIds: number[];
};

const positionKey = (organizationId: number, projectId: number | null) =>
  `${organizationId}:${projectId ?? ""}`;

/** Far-future processing dates for rounds not paid yet: approved ones, then the round looked at */
const UNPAID_APPROVED = "9999-12-30";
const UNPAID_SELF = "9999-12-31";

/**
 * What each transfer line of a round contained, by FIFO (fifo.ts): first what the round passes on
 * itself (chosen donations, its fund grants and adjustments), then the oldest money not paid
 * before, split into money carried over from before the recipient's previous transfer and money
 * that came in since; whatever the line paid beyond that was paid ahead (fronted) and is shown
 * with the later inflows that covered it. Each line's parts add up to its amount exactly.
 */
export async function getRoundComposition(input: {
  roundId: number;
  organizationId?: number;
  projectId?: number | null;
}): Promise<RoundComposition> {
  const r = await dao().getRound(input.roundId);
  if (!r) throw notFound(`Round #${input.roundId} not found`);
  const self: BreakdownRound = {
    id: r.id,
    name: r.name,
    kind: r.kind,
    status: r.status,
    cutoff: r.cutoff,
  };
  const [lines, organizations, projects, paymentMethodIds] = await Promise.all([
    dao().getTransfers(r.id),
    dao().getOrganizations(),
    dao().getProjectNames(),
    trace().getIncludedPaymentMethodIds(),
  ]);
  const wanted = (organizationId: number, projectId: number | null) =>
    (input.organizationId === undefined || organizationId === input.organizationId) &&
    (input.projectId === undefined || projectId === input.projectId);
  const orgIds = [
    ...new Set(
      lines.flatMap((t) =>
        t.lines.filter((l) => wanted(l.organizationId, l.projectId)).map((l) => l.organizationId),
      ),
    ),
  ];
  const roundOut = { ...self, paidAt: r.paidAt };
  if (orgIds.length === 0) return { round: roundOut, lines: [], paymentMethodIds };

  const today = todayOslo();
  const [entries, traced, tracedIds] = await Promise.all([
    trace().getLedgerEntries(orgIds, { includeRoundId: r.id }),
    trace().getTracedDonations(orgIds, r.id),
    trace().getTracedDonationIds(r.id),
  ]);
  const days = await trace().getAllocationDays(orgIds, maxDate(today, r.cutoff), tracedIds);
  const names = new Map(organizations.map((o) => [o.id, o.name]));

  // Rounds with a processing slot: paid ones at their payment, approved ones and this one after
  // everything (in that order). Reservations exist only for rounds with a slot.
  const slots = new Map<number, { date: IsoDate; n: number }>();
  const approved = new Map<number, BreakdownRound>();
  for (const e of entries) {
    if (e.roundId === null || e.roundId === r.id) continue;
    if (e.roundStatus === "approved") approved.set(e.roundId, roundOf(e)!);
  }
  [...approved.values()]
    .sort((a, b) => (a.cutoff < b.cutoff ? -1 : a.cutoff > b.cutoff ? 1 : a.id - b.id))
    .forEach((round, i) => slots.set(round.id, { date: UNPAID_APPROVED, n: i }));
  const paidAtOfRound = new Map<number, IsoDate>();
  for (const e of entries) {
    if (e.kind === "transfer" && e.roundStatus === "paid" && e.date) {
      const prev = paidAtOfRound.get(e.roundId!);
      if (!prev || e.date > prev) paidAtOfRound.set(e.roundId!, e.date);
    }
  }
  for (const [id, date] of paidAtOfRound) slots.set(id, { date, n: id });
  slots.set(
    r.id,
    r.status === "paid" && r.paidAt ? { date: r.paidAt, n: r.id } : { date: UNPAID_SELF, n: 0 },
  );
  const reservable = (roundId: number | null) =>
    roundId !== null && slots.has(roundId) ? roundId : null;

  const events: FifoEvent<InflowSource, OutflowTag | null>[] = [];
  let seq = 0;
  const inflow = (
    position: string,
    date: IsoDate,
    amount: Decimal,
    reservedFor: number | null,
    source: InflowSource,
  ) => {
    const id = `i${seq++}`;
    if (amount.gt(0)) {
      events.push({
        type: "in",
        key: [date, 0, seq],
        inflow: { id, position, date, amount, reservedFor, source },
      });
    } else if (amount.lt(0)) {
      events.push({
        type: "out",
        key: [date, 1, seq],
        outflow: {
          id,
          position,
          amount: amount.negated(),
          eligibleUpTo: date,
          roundId: null,
          trace: false,
          tag: null,
        },
      });
    }
  };

  for (const d of days) {
    inflow(positionKey(d.organizationId, null), d.day, dec(d.amount), null, {
      kind: "day",
      organizationId: d.organizationId,
      donationCount: d.donationCount,
    });
  }
  for (const d of traced) {
    inflow(positionKey(d.organizationId, null), d.day, dec(d.amount), reservable(d.roundId), {
      kind: "donation",
      donation: d,
    });
  }
  for (const e of entries) {
    const position = positionKey(e.organizationId, e.projectId);
    const amount = dec(e.amount);
    const round = roundOf(e);
    if (e.kind === "adjustment") {
      if (e.adjustmentType === "fronted") continue;
      const source: InflowSource =
        e.adjustmentType === "opening" && amount.gt(0)
          ? {
              kind: "opening",
              adjustmentId: e.adjustmentId!,
              reason: e.reason!,
              documentRef: e.documentRef,
            }
          : {
              kind: "adjustment",
              adjustmentId: e.adjustmentId!,
              type: e.adjustmentType!,
              reason: e.reason!,
              round,
              documentRef: e.documentRef,
              linkedTransferId: e.linkedTransferId,
            };
      inflow(position, e.date!, amount, reservable(e.roundId), source);
    } else if (e.kind === "fund_grant_in") {
      inflow(position, e.date!, amount, reservable(e.roundId), {
        kind: "fund_grant_in",
        fundGrantId: e.fundGrantId!,
        fundGrantLineId: e.fundGrantLineId!,
        fundId: e.counterpartOrganizationId!,
        round: round!,
        rationale: e.rationale ?? "",
      });
    } else if (e.kind === "fund_grant_out") {
      events.push({
        type: "out",
        key: [e.date!, 1, seq++],
        outflow: {
          id: `g${e.fundGrantLineId}`,
          position,
          amount,
          eligibleUpTo: e.date!,
          roundId: null,
          trace: false,
          tag: null,
        },
      });
    } else {
      const slot = slots.get(e.roundId!)!;
      const date = e.roundStatus === "paid" && e.date ? e.date : slot.date;
      events.push({
        type: "out",
        key: [date, 2, slot.n * 1_000_000 + e.transferLineId!],
        outflow: {
          id: `t${e.transferLineId}`,
          position,
          amount,
          eligibleUpTo: e.roundCutoff!,
          roundId: e.roundId,
          trace: true,
          tag: {
            round: round!,
            transferId: e.transferId!,
            transferLineId: e.transferLineId!,
            payee: { id: e.payeeId!, name: e.payeeName!, currency: "" },
            paidAt: e.date,
            organizationId: e.organizationId,
            projectId: e.projectId,
          },
        },
      });
    }
  }
  for (const [roundId, slot] of slots) {
    events.push({ type: "release", key: [slot.date, 3, slot.n], roundId });
  }

  const results = runFifo(events).filter(
    (res) => res.outflow.roundId === r.id && res.outflow.tag !== null,
  );
  const payees = new Map(lines.map((t) => [t.id, t.payee]));

  const out: CompositionLine[] = [];
  for (const res of results) {
    const tag = res.outflow.tag!;
    if (!wanted(tag.organizationId, tag.projectId)) continue;
    const previous = res.previous?.tag ?? null;
    const prevCutoff = previous?.round.cutoff ?? null;

    // Leaves in display order; rounded together so they add up to the line amount
    const own: FifoTake<InflowSource>[] = [];
    const carried: FifoTake<InflowSource>[] = [];
    const recent: FifoTake<InflowSource>[] = [];
    for (const t of res.taken) {
      if (t.inflow.reservedFor === r.id) own.push(t);
      else if (prevCutoff !== null && t.inflow.date <= prevCutoff) carried.push(t);
      else recent.push(t);
    }
    const groups = [own, carried, recent].map((takes) => describeTakes(takes, names));
    const leaves = [...groups.flatMap((g) => g.leaves), res.ahead];
    const rounded = apportion(leaves, dec(res.outflow.amount));
    let k = 0;
    const [thisRound, carriedOver, sinceLast] = groups.map((g) => {
      const items = g.build(rounded.slice(k, k + g.leaves.length));
      const amount = sum(rounded.slice(k, k + g.leaves.length));
      k += g.leaves.length;
      return { amount: fmt(amount), items };
    });
    const aheadRounded = rounded[k]!;

    let ahead: CompositionLine["ahead"] = null;
    if (res.ahead.gt(0)) {
      const settled = describeTakes(res.settledBy, names);
      const unsettled = res.ahead.minus(sum(res.settledBy.map((t) => t.amount)));
      const parts = apportion([...settled.leaves, unsettled], aheadRounded);
      ahead = {
        amount: fmt(aheadRounded),
        settledBy: settled.build(parts.slice(0, -1)),
        unsettled: fmt(parts[parts.length - 1]!),
      };
    }

    out.push({
      transferId: tag.transferId,
      transferLineId: tag.transferLineId,
      payee: payees.get(tag.transferId) ?? tag.payee,
      paidAt: tag.paidAt,
      organizationId: tag.organizationId,
      organizationName: names.get(tag.organizationId) ?? `Recipient #${tag.organizationId}`,
      projectId: tag.projectId,
      projectName: tag.projectId === null ? null : projects.get(tag.projectId)?.name ?? null,
      amount: fmt(dec(res.outflow.amount)),
      previous: previous
        ? {
            round: previous.round,
            transferId: previous.transferId,
            payeeName: previous.payee.name,
            paidAt: previous.paidAt,
          }
        : null,
      window: {
        from: prevCutoff === null ? null : nextDay(prevCutoff),
        to: r.cutoff,
      },
      thisRound: thisRound!,
      carriedOver: carriedOver!,
      sinceLastTransfer: sinceLast!,
      ahead,
      leftAfter: { amount: fmt(res.leftAfter.amount), oldest: res.leftAfter.oldest },
    });
  }
  out.sort(
    (a, b) =>
      a.payee.name.localeCompare(b.payee.name) ||
      a.transferId - b.transferId ||
      a.organizationName.localeCompare(b.organizationName) ||
      (a.projectId ?? 0) - (b.projectId ?? 0),
  );
  return { round: roundOut, lines: out, paymentMethodIds };
}

const nextDay = (isoDate: IsoDate): IsoDate => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Turns takes into display items: allocations by day are merged into one "donations" item with a
 * month breakdown; everything else is one item each. Returns the exact leaf amounts (the months
 * for the donations item) and a builder that takes them rounded.
 */
function describeTakes(
  takes: FifoTake<InflowSource>[],
  names: Map<number, string>,
): { leaves: Decimal[]; build: (rounded: Decimal[]) => CompositionItem[] } {
  type Slot =
    | { kind: "days"; takes: FifoTake<InflowSource>[] }
    | { kind: "single"; take: FifoTake<InflowSource> };
  const slots: Slot[] = [];
  let days: Extract<Slot, { kind: "days" }> | null = null;
  for (const t of takes) {
    if (t.inflow.source && (t.inflow.source as InflowSource).kind === "day") {
      if (!days) slots.push((days = { kind: "days", takes: [] }));
      days.takes.push(t);
    } else {
      slots.push({ kind: "single", take: t });
    }
  }
  // Days in date order within the merged item
  if (days)
    days.takes.sort((a, b) =>
      a.inflow.date < b.inflow.date ? -1 : a.inflow.date > b.inflow.date ? 1 : 0,
    );

  const leaves: Decimal[] = [];
  const monthGroups = new Map<Slot, { month: string; takes: FifoTake<InflowSource>[] }[]>();
  for (const slot of slots) {
    if (slot.kind === "single") {
      leaves.push(slot.take.amount);
      continue;
    }
    const byMonth: { month: string; takes: FifoTake<InflowSource>[] }[] = [];
    for (const t of slot.takes) {
      const month = t.inflow.date.slice(0, 7);
      let m = byMonth[byMonth.length - 1];
      if (!m || m.month !== month) byMonth.push((m = { month, takes: [] }));
      m.takes.push(t);
    }
    monthGroups.set(slot, byMonth);
    for (const m of byMonth) leaves.push(sum(m.takes.map((t) => t.amount)));
  }

  const build = (rounded: Decimal[]): CompositionItem[] => {
    let i = 0;
    const items: CompositionItem[] = [];
    for (const slot of slots) {
      if (slot.kind === "single") {
        items.push(singleItem(slot.take, rounded[i++]!, names));
        continue;
      }
      const months = monthGroups.get(slot)!;
      const organizationId = (
        slot.takes[0]!.inflow.source as Extract<InflowSource, { kind: "day" }>
      ).organizationId;
      const isPartial = (t: FifoTake<InflowSource>) =>
        t.remainingBefore.lt(t.inflow.amount) || t.amount.lt(t.remainingBefore);
      const monthItems: CompositionMonth[] = months.map((m) => {
        const from = m.takes[0]!.inflow.date;
        const to = m.takes[m.takes.length - 1]!.inflow.date;
        return {
          month: m.month,
          from,
          to,
          amount: fmt(rounded[i++]!),
          donationCount: m.takes.reduce(
            (n, t) => n + (t.inflow.source as Extract<InflowSource, { kind: "day" }>).donationCount,
            0,
          ),
          partial: m.takes.some(isPartial),
          link: { organizationId, from, to },
        };
      });
      const first = slot.takes[0]!;
      const last = slot.takes[slot.takes.length - 1]!;
      items.push({
        kind: "donations",
        from: first.inflow.date,
        to: last.inflow.date,
        amount: fmt(sum(monthItems.map((m) => m.amount))),
        donationCount: monthItems.reduce((n, m) => n + m.donationCount, 0),
        partialStart: first.remainingBefore.lt(first.inflow.amount),
        partialEnd: last.amount.lt(last.remainingBefore),
        months: monthItems,
        link: { organizationId, from: first.inflow.date, to: last.inflow.date },
      });
    }
    return items;
  };
  return { leaves, build };
}

function singleItem(
  take: FifoTake<InflowSource>,
  amount: Decimal,
  names: Map<number, string>,
): CompositionItem {
  const source = take.inflow.source;
  const date = take.inflow.date;
  switch (source.kind) {
    case "donation":
      return {
        kind: "donation",
        reason: source.donation.reason,
        donationId: source.donation.donationId,
        donorId: source.donation.donorId,
        donorName: source.donation.donorName,
        date,
        timestampConfirmed: source.donation.timestampConfirmed,
        sum: fmt(dec(source.donation.sum)),
        amount: fmt(amount),
        roundId: source.donation.roundId,
        adjustmentId: source.donation.adjustmentId,
      };
    case "opening":
      return { ...source, kind: "opening", date, amount: fmt(amount) };
    case "fund_grant_in":
      return {
        kind: "fund_grant_in",
        fundGrantId: source.fundGrantId,
        fundGrantLineId: source.fundGrantLineId,
        fundId: source.fundId,
        fundName: names.get(source.fundId) ?? `Fund #${source.fundId}`,
        round: source.round,
        rationale: source.rationale,
        date,
        amount: fmt(amount),
      };
    case "adjustment":
      return { ...source, kind: "adjustment", date, amount: fmt(amount) };
    case "day":
      // Never single: merged by describeTakes
      throw new Error("allocation days are merged");
  }
}

//endregion

//region Monthly reconciliation

export type ReconciliationCell = {
  month: string;
  /** From the Regrant_allocations view (what balances use), rounded per cell */
  allocated: Money;
  /** Recomputed straight from Donations and the split tables, rounded per cell */
  recomputed: Money;
  /** recomputed − allocated (should be 0) */
  difference: Money;
  donationCount: number;
};

export type ReconciliationRecipient = {
  organizationId: number;
  name: string;
  abbriv: string;
  isActive: boolean;
  months: ReconciliationCell[];
  /** Σ over the period, rounded once */
  allocated: Money;
  recomputed: Money;
  difference: Money;
};

export type ReconciliationMonth = {
  month: string;
  /** Σ of every recipient's allocation (exact, rounded once) */
  allocated: Money;
  /** Donations without a split */
  unassigned: Money;
  unassignedCount: number;
  /** allocated + unassigned */
  accounted: Money;
  /** Σ confirmed donations, payments 15 and 16 excluded */
  donations: Money;
  donationCount: number;
  /** donations − accounted: should be 0 */
  difference: Money;
  /** Of the difference: donations whose split doesn't add up to 100 % */
  splitGap: Money;
  splitGapCount: number;
  /** difference − splitGap: not explained */
  unexplained: Money;
};

export type MonthlyReconciliation = {
  /** "2026-01" */
  from: string;
  to: string;
  months: string[];
  recipients: ReconciliationRecipient[];
  totals: ReconciliationMonth[];
  /** The whole period */
  total: Omit<ReconciliationMonth, "month">;
  /** KIDs whose split doesn't add up to 100 % with donations in the period (largest first) */
  splitGaps: {
    kid: string;
    sharePercent: string;
    donationCount: number;
    amount: Money;
    notAllocated: Money;
  }[];
  checks: {
    /** Every recipient-month: view = recomputation */
    allocationsMatch: boolean;
    mismatchedCells: number;
    /** Every month: donations = allocated + unassigned (+ split gaps) to the øre */
    totalsMatch: boolean;
    monthsWithDifference: number;
    monthsUnexplained: number;
  };
  /** Payment methods the Donations list links include (all but 15 and 16) */
  paymentMethodIds: number[];
};

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * The check Ruth does against Samlefila's overview, per recipient and UTC month: allocations from
 * the view vs an independent recomputation from the donation tables, and per month the
 * allocations plus Unassigned vs the confirmed donations (payments 15 and 16 excluded).
 */
export async function getMonthlyReconciliation(input: {
  from: string;
  to: string;
}): Promise<MonthlyReconciliation> {
  const months = monthsBetween(input.from, input.to);
  const from = `${input.from}-01 00:00:00`;
  const before = `${nextMonth(input.to)}-01 00:00:00`;
  const [organizations, view, direct, totals, splitGaps, paymentMethodIds] = await Promise.all([
    dao().getOrganizations(),
    trace().getViewMonthly(from, before),
    trace().getDirectMonthly(from, before),
    trace().getMonthlyTotals(from, before),
    trace().getSplitGaps(from, before),
    trace().getIncludedPaymentMethodIds(),
  ]);

  const key = (organizationId: number, month: string) => `${organizationId}:${month}`;
  const viewBy = new Map(view.map((v) => [key(v.organizationId, v.month), v]));
  const directBy = new Map(direct.map((v) => [key(v.organizationId, v.month), v]));
  const withData = new Set([...view, ...direct].map((v) => v.organizationId));

  let mismatchedCells = 0;
  const recipients: ReconciliationRecipient[] = organizations
    .filter((o) => o.isActive || withData.has(o.id))
    .map((o) => {
      let allocatedExact = ZERO;
      let recomputedExact = ZERO;
      const cells = months.map((month) => {
        const v = viewBy.get(key(o.id, month));
        const d = directBy.get(key(o.id, month));
        const allocated = dec(v?.amount ?? 0);
        const recomputed = dec(d?.amount ?? 0);
        allocatedExact = allocatedExact.plus(allocated);
        recomputedExact = recomputedExact.plus(recomputed);
        const a = fmt(allocated);
        const r = fmt(recomputed);
        if (a !== r) mismatchedCells++;
        return {
          month,
          allocated: a,
          recomputed: r,
          difference: fmt(dec(r).minus(a)),
          donationCount: v?.donationCount ?? 0,
        };
      });
      return {
        organizationId: o.id,
        name: o.name,
        abbriv: o.abbriv,
        isActive: o.isActive,
        months: cells,
        allocated: fmt(allocatedExact),
        recomputed: fmt(recomputedExact),
        difference: fmt(recomputedExact.minus(allocatedExact)),
      };
    });

  const totalsBy = new Map(totals.map((t) => [t.month, t]));
  const exactTotals = months.map((month) => {
    const allocated = sum(view.filter((v) => v.month === month).map((v) => v.amount));
    const t = totalsBy.get(month);
    return {
      month,
      allocated,
      unassigned: dec(t?.unassigned ?? 0),
      unassignedCount: t?.unassignedCount ?? 0,
      donations: dec(t?.donations ?? 0),
      donationCount: t?.donationCount ?? 0,
      splitGap: dec(t?.splitGap ?? 0),
      splitGapCount: t?.splitGapCount ?? 0,
    };
  });
  const describe = (e: (typeof exactTotals)[number]): Omit<ReconciliationMonth, "month"> => {
    const accounted = e.allocated.plus(e.unassigned);
    const difference = e.donations.minus(accounted);
    return {
      allocated: fmt(e.allocated),
      unassigned: fmt(e.unassigned),
      unassignedCount: e.unassignedCount,
      accounted: fmt(accounted),
      donations: fmt(e.donations),
      donationCount: e.donationCount,
      difference: fmt(difference),
      splitGap: fmt(e.splitGap),
      splitGapCount: e.splitGapCount,
      unexplained: fmt(difference.minus(e.splitGap)),
    };
  };
  const monthTotals = exactTotals.map((e) => ({ month: e.month, ...describe(e) }));
  const all = exactTotals.reduce(
    (acc, e) => ({
      month: "",
      allocated: acc.allocated.plus(e.allocated),
      unassigned: acc.unassigned.plus(e.unassigned),
      unassignedCount: acc.unassignedCount + e.unassignedCount,
      donations: acc.donations.plus(e.donations),
      donationCount: acc.donationCount + e.donationCount,
      splitGap: acc.splitGap.plus(e.splitGap),
      splitGapCount: acc.splitGapCount + e.splitGapCount,
    }),
    {
      month: "",
      allocated: ZERO,
      unassigned: ZERO,
      unassignedCount: 0,
      donations: ZERO,
      donationCount: 0,
      splitGap: ZERO,
      splitGapCount: 0,
    },
  );

  return {
    from: input.from,
    to: input.to,
    months,
    recipients,
    totals: monthTotals,
    total: describe(all),
    splitGaps: splitGaps.map((g) => ({
      kid: g.kid,
      sharePercent: dec(g.sharePercent).toDecimalPlaces(4).toString(),
      donationCount: g.donationCount,
      amount: fmt(dec(g.amount)),
      notAllocated: fmt(dec(g.notAllocated)),
    })),
    checks: {
      allocationsMatch: mismatchedCells === 0,
      mismatchedCells,
      totalsMatch: monthTotals.every((m) => m.difference === "0.00"),
      monthsWithDifference: monthTotals.filter((m) => m.difference !== "0.00").length,
      monthsUnexplained: monthTotals.filter((m) => m.unexplained !== "0.00").length,
    },
    paymentMethodIds,
  };
}

//endregion

export const _test = { monthsBetween, lastDayOfMonth, dayBefore };
