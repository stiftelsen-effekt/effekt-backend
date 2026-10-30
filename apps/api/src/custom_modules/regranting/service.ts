import { TRPCError } from "@trpc/server";
import type { Decimal } from "decimal.js";
import { DAO } from "../DAO";
import type { Queryable } from "../DAO_modules/regranting";
import { dateNo, dayBefore, daysBefore, dec, fmt, krNo, max0, sum, todayOslo, ZERO } from "./money";
import {
  defaultIncludeDirect,
  positionKey,
  proposeRound,
  type Position,
  type ProposedPosition,
} from "./proposal";
import type {
  BalanceRow,
  FrontedEntry,
  FundGrant,
  Hold,
  Issue,
  IsoDate,
  LastTransfer,
  LedgerFigures,
  Money,
  OrganizationRef,
  PayeeRef,
  ProjectStatus,
  Round,
  RoundBalanceSnapshot,
  RoundDonation,
  RoundSummary,
  Transfer,
  Unassigned,
  Adjustment,
  RegrantDocument,
  StatementEntryKind,
} from "./types";
import { hasErrors, validateRound } from "./validation";

/**
 * Regranting use cases on top of DAO.regranting: the Balances page, the round builder
 * (state, proposal, validation), round transitions and statements. Errors are TRPCErrors so the
 * router can pass them through.
 */

const dao = () => DAO.regranting;

const conflict = (message: string, cause?: unknown) =>
  new TRPCError({ code: "CONFLICT", message, cause: cause as Error | undefined });
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });

/** A round as messages name it: "Kvartalstildeling Q3 2026 (cutoff 30.09.2026)" */
export const roundLabel = (round: { name: string; cutoff: IsoDate }) =>
  `${round.name} (cutoff ${dateNo(round.cutoff)})`;

//region Ledger figures

/** Ledger figures summed over balance rows */
export const figuresFor = (rows: BalanceRow[]): LedgerFigures => {
  const total = (field: keyof BalanceRow) => sum(rows.map((r) => String(r[field])));
  const balance = sum([
    total("opening"),
    total("allocations"),
    total("fundGrantsIn"),
    total("fundGrantsOut"),
    total("transfers"),
    total("adjustments"),
  ]);
  const committed = total("committed").plus(total("laterDebits"));
  return {
    opening: fmt(total("opening")),
    allocations: fmt(total("allocations")),
    fundGrantsIn: fmt(total("fundGrantsIn")),
    fundGrantsOut: fmt(total("fundGrantsOut")),
    transfers: fmt(total("transfers")),
    adjustments: fmt(total("adjustments")),
    balance: fmt(balance),
    committed: fmt(committed),
    available: fmt(balance.minus(committed)),
  };
};

const rowBalance = (r: BalanceRow) =>
  sum([r.opening, r.allocations, r.fundGrantsIn, r.fundGrantsOut, r.transfers, r.adjustments]);

const isZeroRow = (r: BalanceRow) =>
  [
    r.opening,
    r.allocations,
    r.fundGrantsIn,
    r.fundGrantsOut,
    r.transfers,
    r.adjustments,
    r.committed,
    r.laterDebits,
  ].every((v) => dec(v).isZero());

//endregion

//region Balances page

export type BalancesProject = {
  projectId: number;
  name: string;
  status: ProjectStatus | null;
  hold: Hold | null;
  figures: LedgerFigures;
};

export type BalancesRecipient = {
  organizationId: number;
  name: string;
  abbriv: string;
  isActive: boolean;
  isFund: boolean;
  /** Own funds only */
  maxHoldDays: number | null;
  /**
   * Own funds with max_hold_days: the part of the balance older than that (oldest money spent
   * first). "0.00" when nothing has waited too long; null when not applicable.
   */
  heldTooLong: Money | null;
  payee: PayeeRef | null;
  /** Active hold on the whole recipient */
  hold: Hold | null;
  /** Unrestricted + all projects */
  total: LedgerFigures;
  unrestricted: LedgerFigures;
  /** Allocations after the last regular round's cutoff */
  inflowSinceLastRound: Money;
  lastTransfer: LastTransfer | null;
  /** Fronted amounts whose donation hasn't arrived by the date */
  frontedOutstanding: Money;
  projects: BalancesProject[];
};

export type BalancesView = {
  at: IsoDate;
  lastRound: { id: number; name: string; cutoff: IsoDate } | null;
  unassigned: Unassigned;
  recipients: BalancesRecipient[];
};

export async function getBalancesView(input: {
  at?: IsoDate;
  organizationIds?: number[];
}): Promise<BalancesView> {
  const at = input.at ?? todayOslo();
  const lastRound = await dao().getLatestRound(at, "regular");
  const [rows, organizations, projects, funds, holds, payees, lastTransfers, unassigned, fronted] =
    await Promise.all([
      dao().getBalances({
        at,
        organizationIds: input.organizationIds,
        inflowSince: lastRound?.cutoff ?? null,
      }),
      dao().getOrganizations(),
      dao().getProjectNames(),
      dao().listFunds(),
      dao().listHolds({ activeAt: at }),
      dao().getPayeesAt(at),
      dao().getLastTransfers(at),
      dao().getUnassigned(at),
      dao().getFronted(at, input.organizationIds),
    ]);

  const fundById = new Map(funds.map((f) => [f.organizationId, f]));
  const wanted = input.organizationIds ? new Set(input.organizationIds) : null;
  const recipients: BalancesRecipient[] = [];

  // Inflow in the last maxHoldDays days (inclusive) per fund, fetched side by side rather
  // than one query per fund in the loop below
  const recentInflow = new Map(
    await Promise.all(
      funds
        .filter((fund) => fund.maxHoldDays && (!wanted || wanted.has(fund.organizationId)))
        .map(
          async (fund) =>
            [
              fund.organizationId,
              await dao().getInflowBetween(
                fund.organizationId,
                daysBefore(at, fund.maxHoldDays! + 1),
                at,
              ),
            ] as const,
        ),
    ),
  );

  for (const org of organizations) {
    if (wanted && !wanted.has(org.id)) continue;
    const own = rows.filter((r) => r.organizationId === org.id);
    const fund = fundById.get(org.id);
    if (!wanted && !org.isActive && !fund && own.every(isZeroRow)) continue;

    const unrestrictedRows = own.filter((r) => r.projectId === null);
    const total = figuresFor(own);
    let heldTooLong: Money | null = null;
    if (fund?.maxHoldDays) {
      // Older money than the last maxHoldDays days' inflow has waited too long
      const recent = dec(recentInflow.get(org.id)!);
      heldTooLong = fmt(max0(dec(total.balance).minus(recent)));
    }
    recipients.push({
      organizationId: org.id,
      name: org.name,
      abbriv: org.abbriv,
      isActive: org.isActive,
      isFund: Boolean(fund),
      maxHoldDays: fund?.maxHoldDays ?? null,
      heldTooLong,
      payee: payees.get(org.id) ?? null,
      hold: holds.find((h) => h.organizationId === org.id && h.projectId === null) ?? null,
      total,
      unrestricted: figuresFor(unrestrictedRows),
      inflowSinceLastRound: fmt(sum(own.map((r) => r.inflowSince))),
      lastTransfer: lastTransfers.find((t) => t.organizationId === org.id) ?? null,
      frontedOutstanding: fmt(
        sum(fronted.filter((f) => f.organizationId === org.id && !f.offset).map((f) => f.amount)),
      ),
      projects: own
        .filter((r) => r.projectId !== null && !isZeroRow(r))
        .map((r) => ({
          projectId: r.projectId!,
          name: projects.get(r.projectId!)?.name ?? `Project ${r.projectId}`,
          status: projects.get(r.projectId!)?.status ?? null,
          hold:
            holds.find((h) => h.organizationId === org.id && h.projectId === r.projectId) ?? null,
          figures: figuresFor([r]),
        })),
    });
  }

  return { at, lastRound, unassigned, recipients };
}

//endregion

//region Round state

type RawRoundDonation = Awaited<ReturnType<typeof DAO.regranting.getRoundDonations>>[number];

/** A chosen donation is out of scope if already passed on, or confirmed after the cutoff */
export const toRoundDonations = (raw: RawRoundDonation[]): RoundDonation[] =>
  raw.map((d) => {
    const passedOn = d.passedOnByRoundId !== null || d.frontedByAdjustmentId !== null;
    const excludedReason = passedOn ? "passed_on" : d.afterCutoff ? "after_cutoff" : null;
    return {
      donationId: d.donationId,
      donorId: d.donorId,
      sum: d.sum,
      timestampConfirmed: d.timestampConfirmed,
      allocations: d.allocations,
      inScope: excludedReason === null,
      excludedReason,
      passedOnByRoundId: d.passedOnByRoundId,
      frontedByAdjustmentId: d.frontedByAdjustmentId,
    };
  });

export type RoundState = {
  round: Round;
  organizations: OrganizationRef[];
  organizationNames: Map<number, string>;
  projectNames: Map<number, { name: string; status: ProjectStatus }>;
  fundIds: Set<number>;
  funds: { organizationId: number; name: string; abbriv: string; maxHoldDays: number | null }[];
  fundGrants: FundGrant[];
  transfers: Transfer[];
  /** Adjustments attached to the round (all, including fronted records and later-dated ones) */
  adjustments: Adjustment[];
  overrides: Map<number, boolean>;
  holds: Hold[];
  payees: Map<number, PayeeRef>;
  donations: RoundDonation[];
  chosenAllocations: Map<number, Decimal>;
  unassigned: Unassigned;
  fronted: FrontedEntry[];
  positions: ProposedPosition[];
  proposedTransfers: ReturnType<typeof proposeRound>["transfers"];
  issues: Issue[];
};

export async function getRoundOrThrow(id: number, conn?: Queryable): Promise<Round> {
  const round = await dao().getRound(id, conn);
  if (!round) throw notFound(`Round ${id} not found`);
  return round;
}

/** Everything the builder, the proposal and validation need, computed at the round's cutoff */
export async function loadRoundState(roundId: number): Promise<RoundState> {
  const round = await getRoundOrThrow(roundId);
  const at = round.cutoff;
  const [
    balances,
    organizations,
    projectNames,
    funds,
    fundGrants,
    transfers,
    adjustments,
    overrides,
    holds,
    payees,
    rawDonations,
    unassigned,
    fronted,
  ] = await Promise.all([
    dao().getBalances({ at, excludeRoundId: round.id }),
    dao().getOrganizations(),
    dao().getProjectNames(),
    dao().listFunds(),
    dao().getFundGrants(round.id),
    dao().getTransfers(round.id),
    dao().listAdjustments({ roundId: round.id }),
    dao().getIncludeDirectOverrides(round.id),
    dao().listHolds({ activeAt: at }),
    dao().getPayeesAt(at),
    round.kind === "major_donor" ? dao().getRoundDonations(round.id) : Promise.resolve([]),
    dao().getUnassigned(at),
    dao().getFronted(at),
  ]);

  const fundIds = new Set(funds.map((f) => f.organizationId));
  const positionMap = new Map<string, Position>();
  const position = (organizationId: number, projectId: number | null) => {
    const key = positionKey(organizationId, projectId);
    if (!positionMap.has(key)) {
      positionMap.set(key, {
        organizationId,
        projectId,
        balanceAtCutoff: ZERO,
        committed: ZERO,
        fundGrants: ZERO,
        roundAdjustments: ZERO,
        inRound: ZERO,
      });
    }
    return positionMap.get(key)!;
  };
  for (const row of balances) {
    if (isZeroRow(row)) continue;
    const p = position(row.organizationId, row.projectId);
    p.balanceAtCutoff = rowBalance(row);
    p.committed = dec(row.committed).plus(row.laterDebits);
  }
  for (const grant of fundGrants) {
    const fund = position(grant.fundId, null);
    for (const line of grant.lines) {
      fund.fundGrants = fund.fundGrants.minus(line.amount);
      const p = position(line.organizationId, line.projectId);
      p.fundGrants = p.fundGrants.plus(line.amount);
    }
  }
  for (const transfer of transfers) {
    for (const line of transfer.lines) {
      const p = position(line.organizationId, line.projectId);
      p.inRound = p.inRound.plus(line.amountNok);
    }
  }
  // The round's own adjustments (e.g. earmarks) count in it, also while it is a draft; the
  // ledger counts them once the round is approved
  for (const a of adjustments) {
    if (a.type === "fronted" || a.effectiveAt > at) continue;
    const p = position(a.organizationId, a.projectId);
    p.roundAdjustments = p.roundAdjustments.plus(a.amount);
  }

  const donations = toRoundDonations(rawDonations);
  const chosenAllocations = new Map<number, Decimal>();
  for (const d of donations.filter((d) => d.inScope)) {
    for (const a of d.allocations) {
      chosenAllocations.set(
        a.organizationId,
        (chosenAllocations.get(a.organizationId) ?? ZERO).plus(a.amount),
      );
    }
  }

  const proposal = proposeRound({
    kind: round.kind,
    minTransfer: dec(round.minTransfer),
    positions: [...positionMap.values()],
    fundIds,
    chosenAllocations,
    includeDirectOverrides: overrides,
    holds,
    payees,
  });

  const lineProjects = [
    ...transfers.flatMap((t) => t.lines.map((l) => l.projectId)),
    ...fundGrants.flatMap((g) => g.lines.map((l) => l.projectId)),
  ].filter((id): id is number => id !== null);
  const projectOrganizations = await dao().getProjectOrganizations([...new Set(lineProjects)]);
  const organizationNames = new Map(organizations.map((o) => [o.id, o.name]));
  const roundNames = donations.some((d) => d.passedOnByRoundId !== null)
    ? new Map((await dao().listRounds({})).map((r) => [r.id, r]))
    : undefined;

  // Only drafts are validated. Once approved, the decision and its balance snapshot are fixed;
  // re-validating against today's ledger would count later rounds' grants against it.
  const issues: Issue[] =
    round.status !== "draft"
      ? []
      : validateRound({
          positions: proposal.positions,
          fundIds,
          transfers,
          fundGrants,
          projectOrganizations,
          payees,
          unassigned,
          donations,
          organizationNames,
          projectNames,
          roundNames,
        });

  return {
    round,
    organizations,
    organizationNames,
    projectNames,
    fundIds,
    funds,
    fundGrants,
    transfers,
    adjustments,
    overrides,
    holds,
    payees,
    donations,
    chosenAllocations,
    unassigned,
    fronted,
    positions: proposal.positions,
    proposedTransfers: proposal.transfers,
    issues,
  };
}

//endregion

//region Builder view

export type BuilderAmounts = {
  /** Ledger balance at the cutoff, without this round (its fund grants and adjustments) */
  balanceAtCutoff: Money;
  /** Other rounds' approved or later payments not in the ledger at the cutoff */
  committed: Money;
  /** This round's fund grant lines (+ to recipients) */
  fundGrants: Money;
  /**
   * This round's adjustments dated on or before the cutoff, e.g. an earmark (unrestricted −X,
   * project +X). They count here while the round is a draft, and in balances once it is approved.
   */
  roundAdjustments: Money;
  /** balanceAtCutoff − committed + fundGrants + roundAdjustments */
  available: Money;
  /** What the proposal rules would put in the round now */
  proposed: Money;
  /** This round's transfer lines as they stand ("Pay now") */
  inRound: Money;
  /** available − inRound: stays in the balance ("Carries over") */
  carriesOver: Money;
};

export type BuilderLine = BuilderAmounts & {
  projectId: number | null;
  projectName: string | null;
  projectStatus: ProjectStatus | null;
  /** Active hold on this project (projectId set) */
  hold: Hold | null;
  held: boolean;
};

export type BuilderRecipient = {
  organizationId: number;
  name: string;
  abbriv: string;
  /**
   * Part of this round: it has transfer lines, fund grant lines, adjustments or chosen donations
   * here, or an Include direct donations override. Rounds that leave direct donations out
   * (fund_grant, extraordinary, major_donor) still list every recipient with a balance; the
   * others have inRound false.
   */
  inRound: boolean;
  /** Routing at the cutoff */
  payee: PayeeRef | null;
  /** Effective Include direct donations switch */
  includeDirect: boolean;
  /** The per-round override, null when the kind's default applies */
  includeDirectOverride: boolean | null;
  /** Active hold on the whole recipient */
  hold: Hold | null;
  /** major_donor: the in-scope chosen donations' allocations; null for other kinds */
  chosenAllocations: Money | null;
  /** Fronted amounts whose donation hasn't arrived by the cutoff */
  frontedOutstanding: FrontedEntry[];
  /** Unrestricted first, then projects */
  lines: BuilderLine[];
  totals: BuilderAmounts;
};

export type BuilderFund = {
  organizationId: number;
  name: string;
  abbriv: string;
  maxHoldDays: number | null;
  balanceAtCutoff: Money;
  committed: Money;
  /** balanceAtCutoff − committed + this round's adjustments to it: what this round can grant */
  availableToGrant: Money;
  /** This round's grants from it */
  granted: Money;
  /** availableToGrant − granted */
  remaining: Money;
};

export type BuilderPayeeGroup = {
  /** null: recipients without a payee at the cutoff */
  payee: PayeeRef | null;
  /** Recipients routed to this payee at the cutoff (that appear in `recipients`) */
  organizationIds: number[];
  /** The round's transfers to this payee */
  transferIds: number[];
  proposed: Money;
  inRound: Money;
};

export type RoundBuilder = {
  round: RoundSummary;
  defaultIncludeDirect: boolean;
  /** Step 1 */
  funds: BuilderFund[];
  fundGrants: FundGrant[];
  /** Step 2, one per recipient (own funds excluded) */
  recipients: BuilderRecipient[];
  payeeGroups: BuilderPayeeGroup[];
  transfers: Transfer[];
  /** major_donor only */
  donations: RoundDonation[];
  unassigned: Unassigned;
  issues: Issue[];
  totals: { proposed: Money; inRound: Money; fundGranted: Money; transferCount: number };
};

const amounts = (positions: ProposedPosition[]): BuilderAmounts => {
  const s = (f: (p: ProposedPosition) => Decimal) => sum(positions.map(f));
  const available = s((p) => p.available);
  const inRound = s((p) => p.inRound);
  return {
    balanceAtCutoff: fmt(s((p) => p.balanceAtCutoff)),
    committed: fmt(s((p) => p.committed)),
    fundGrants: fmt(s((p) => p.fundGrants)),
    roundAdjustments: fmt(s((p) => p.roundAdjustments)),
    available: fmt(available),
    proposed: fmt(s((p) => p.proposed)),
    inRound: fmt(inRound),
    carriesOver: fmt(available.minus(inRound)),
  };
};

const hasAnything = (p: ProposedPosition) =>
  !p.balanceAtCutoff.isZero() ||
  !p.committed.isZero() ||
  !p.fundGrants.isZero() ||
  !p.roundAdjustments.isZero() ||
  !p.inRound.isZero() ||
  !p.proposed.isZero();

export async function getRoundBuilder(roundId: number): Promise<RoundBuilder> {
  const state = await loadRoundState(roundId);
  const summary = (await dao().getRoundSummary(roundId))!;
  const { round } = state;
  const holdFor = (organizationId: number, projectId: number | null) =>
    state.holds.find((h) => h.organizationId === organizationId && h.projectId === projectId) ??
    null;

  const funds: BuilderFund[] = state.funds.map((f) => {
    const own = state.positions.filter((p) => p.organizationId === f.organizationId);
    const balance = sum(own.map((p) => p.balanceAtCutoff));
    const committed = sum(own.map((p) => p.committed));
    const adjusted = sum(own.map((p) => p.roundAdjustments));
    const granted = sum(own.map((p) => p.fundGrants)).negated();
    const availableToGrant = balance.minus(committed).plus(adjusted);
    return {
      organizationId: f.organizationId,
      name: f.name,
      abbriv: f.abbriv,
      maxHoldDays: f.maxHoldDays,
      balanceAtCutoff: fmt(balance),
      committed: fmt(committed),
      availableToGrant: fmt(availableToGrant),
      granted: fmt(granted),
      remaining: fmt(availableToGrant.minus(granted)),
    };
  });

  const recipientIds = new Set<number>();
  for (const p of state.positions) {
    if (!state.fundIds.has(p.organizationId) && hasAnything(p)) recipientIds.add(p.organizationId);
  }
  for (const id of state.overrides.keys()) if (!state.fundIds.has(id)) recipientIds.add(id);
  for (const id of state.chosenAllocations.keys()) if (!state.fundIds.has(id)) recipientIds.add(id);

  // What the round itself touches, per recipient (the admin hides the rest on request)
  const touched = new Set<number>([
    ...state.transfers.flatMap((t) => t.lines.map((l) => l.organizationId)),
    ...state.fundGrants.flatMap((g) => g.lines.map((l) => l.organizationId)),
    ...state.adjustments.filter((a) => a.type !== "fronted").map((a) => a.organizationId),
    ...state.chosenAllocations.keys(),
    ...state.overrides.keys(),
  ]);

  const recipients: BuilderRecipient[] = state.organizations
    .filter((o) => recipientIds.has(o.id))
    .map((org) => {
      const own = state.positions.filter((p) => p.organizationId === org.id);
      const unrestricted = own.find((p) => p.projectId === null);
      const projects = own
        .filter((p) => p.projectId !== null && hasAnything(p))
        .sort((a, b) =>
          (state.projectNames.get(a.projectId!)?.name ?? "").localeCompare(
            state.projectNames.get(b.projectId!)?.name ?? "",
          ),
        );
      const lines = [...(unrestricted ? [unrestricted] : []), ...projects].map(
        (p): BuilderLine => ({
          ...amounts([p]),
          projectId: p.projectId,
          projectName:
            p.projectId === null ? null : (state.projectNames.get(p.projectId)?.name ?? null),
          projectStatus:
            p.projectId === null ? null : (state.projectNames.get(p.projectId)?.status ?? null),
          hold: p.projectId === null ? null : holdFor(org.id, p.projectId),
          held: p.held,
        }),
      );
      if (!unrestricted) {
        lines.unshift({
          ...amounts([]),
          projectId: null,
          projectName: null,
          projectStatus: null,
          hold: null,
          held: Boolean(holdFor(org.id, null)),
        });
      }
      return {
        organizationId: org.id,
        name: org.name,
        abbriv: org.abbriv,
        inRound: touched.has(org.id),
        payee: state.payees.get(org.id) ?? null,
        includeDirect: state.overrides.get(org.id) ?? defaultIncludeDirect(round.kind),
        includeDirectOverride: state.overrides.get(org.id) ?? null,
        hold: holdFor(org.id, null),
        chosenAllocations:
          round.kind === "major_donor" ? fmt(state.chosenAllocations.get(org.id) ?? ZERO) : null,
        frontedOutstanding: state.fronted.filter((f) => f.organizationId === org.id && !f.offset),
        lines,
        totals: amounts(own),
      };
    });

  const groups = new Map<string, BuilderPayeeGroup>();
  const group = (payee: PayeeRef | null) => {
    const key = payee ? String(payee.id) : "none";
    if (!groups.has(key)) {
      groups.set(key, {
        payee,
        organizationIds: [],
        transferIds: [],
        proposed: "0.00",
        inRound: "0.00",
      });
    }
    return groups.get(key)!;
  };
  for (const r of recipients) {
    const g = group(r.payee);
    g.organizationIds.push(r.organizationId);
    g.proposed = fmt(dec(g.proposed).plus(r.totals.proposed));
  }
  for (const t of state.transfers) {
    const g = group(t.payee);
    g.transferIds.push(t.id);
    g.inRound = fmt(dec(g.inRound).plus(t.amountNok));
  }
  const payeeGroups = [...groups.values()].sort((a, b) =>
    a.payee === null ? 1 : b.payee === null ? -1 : a.payee.name.localeCompare(b.payee.name),
  );

  const nonFund = state.positions.filter((p) => !state.fundIds.has(p.organizationId));
  return {
    round: summary,
    defaultIncludeDirect: defaultIncludeDirect(round.kind),
    funds,
    fundGrants: state.fundGrants,
    recipients,
    payeeGroups,
    transfers: state.transfers,
    donations: state.donations,
    unassigned: state.unassigned,
    issues: state.issues,
    totals: {
      proposed: fmt(sum(nonFund.map((p) => p.proposed))),
      inRound: fmt(sum(state.transfers.map((t) => t.amountNok))),
      fundGranted: fmt(sum(state.fundGrants.map((g) => g.total))),
      transferCount: state.transfers.length,
    },
  };
}

//endregion

//region Round transitions

/** Locks the round for the transaction; CONFLICT unless it has one of the statuses */
export async function lockRoundIn(
  conn: Queryable,
  roundId: number,
  statuses: Round["status"][],
  action: string,
): Promise<Round> {
  const round = await dao().lockRound(conn, roundId);
  if (!round) throw notFound(`Round #${roundId} not found`);
  if (!statuses.includes(round.status)) {
    const why =
      round.status === "paid"
        ? "it is paid; paid rounds are never edited (record a correction adjustment in a later round)"
        : round.status === "approved"
          ? "it is approved (reopen it as a draft first)"
          : "it is still a draft (approve it first)";
    throw conflict(`Can't ${action} ${roundLabel(round)}: ${why}`, {
      roundId: round.id,
      status: round.status,
    });
  }
  return round;
}

/**
 * Writes the proposal into the draft: replaces the round's transfer lines for the recipients
 * (all if organizationIds is null) with the proposed ones, reusing the round's transfer for the
 * same payee and currency, creating one if needed, and deleting transfers left empty. Transfer
 * amounts are set to the sum of their lines.
 */
export async function applyProposal(
  roundId: number,
  organizationIds: number[] | null,
): Promise<void> {
  await dao().inTransaction(async (conn) => {
    await lockRoundIn(conn, roundId, ["draft"], "propose amounts for");
    const state = await loadRoundState(roundId);
    const scope = organizationIds ? new Set(organizationIds) : null;
    const touched = new Set(await dao().deleteRoundLinesFor(conn, roundId, organizationIds));

    for (const proposed of state.proposedTransfers) {
      const lines = proposed.lines.filter((l) => !scope || scope.has(l.organizationId));
      if (lines.length === 0) continue;
      const existing = state.transfers.find(
        (t) => t.payee.id === proposed.payee.id && t.currency === proposed.currency,
      );
      const transferId =
        existing?.id ??
        (await dao().createTransfer(conn, {
          roundId,
          payeeId: proposed.payee.id,
          currency: proposed.currency,
          amountNok: 0,
        }));
      await dao().addTransferLines(
        conn,
        transferId,
        lines.map((l) => ({
          organizationId: l.organizationId,
          projectId: l.projectId,
          amount: fmt(l.amount),
        })),
      );
      touched.add(transferId);
    }
    for (const id of touched) await dao().syncTransferAmount(conn, id);
    await dao().deleteEmptyTransfers(conn, roundId, [...touched]);
  });
}

export type ApproveResult = { approved: boolean; issues: Issue[]; round: RoundSummary };

/**
 * Approves a draft if validation finds no errors: writes the balance snapshot, marks the round
 * and its fund grants approved. The approver must not be the round's creator. With errors,
 * nothing changes and the issues are returned (approved: false).
 */
export async function approveRound(roundId: number, approver: string): Promise<ApproveResult> {
  const result = await dao().inTransaction(async (conn) => {
    const round = await lockRoundIn(conn, roundId, ["draft"], "approve");
    if (round.createdBy === approver) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "A round must be approved by someone other than the person who created it",
      });
    }
    // Edits lock the round too, so the state read here is what gets approved
    const state = await loadRoundState(roundId);
    if (hasErrors(state.issues)) return { approved: false, issues: state.issues };

    const snapshot: Omit<RoundBalanceSnapshot, "organizationName" | "projectName">[] =
      state.positions.filter(hasAnything).map((p) => ({
        organizationId: p.organizationId,
        projectId: p.projectId,
        balanceAtCutoff: fmt(p.balanceAtCutoff),
        committed: fmt(p.committed),
        fundGrants: fmt(p.fundGrants),
        inRound: fmt(p.inRound),
        roundAdjustments: fmt(p.roundAdjustments),
        includedDirect: state.fundIds.has(p.organizationId) ? false : p.includeDirect,
      }));
    await dao().writeSnapshot(conn, roundId, snapshot);
    await dao().setRoundApproved(conn, roundId, approver);
    return { approved: true, issues: state.issues };
  });
  return { ...result, round: (await dao().getRoundSummary(roundId))! };
}

/** approved → draft, before any payment is recorded. Clears the approval and snapshot. */
export async function reopenRound(roundId: number): Promise<void> {
  await dao().inTransaction(async (conn) => {
    const round = await lockRoundIn(conn, roundId, ["approved"], "reopen");
    const transfers = await dao().getTransfers(roundId, conn);
    const paid = transfers.filter((t) => t.paidAt !== null);
    if (paid.length > 0) {
      throw conflict(
        `${roundLabel(round)} has recorded payments (${paid
          .map((t) => `${t.payee.name}, paid ${dateNo(t.paidAt!)}`)
          .join("; ")}); clear them first`,
        { transferIds: paid.map((t) => t.id) },
      );
    }
    await dao().setRoundDraft(conn, roundId);
  });
}

/** approved → paid, once every transfer has its payment recorded. Ledger entries take effect. */
export async function markRoundPaid(roundId: number): Promise<void> {
  await dao().inTransaction(async (conn) => {
    await lockRoundIn(conn, roundId, ["approved"], "mark paid");
    const transfers = await dao().getTransfers(roundId, conn);
    const unpaid = transfers.filter((t) => t.paidAt === null);
    if (unpaid.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Record the payment of the transfer${unpaid.length > 1 ? "s" : ""} to ${unpaid
          .map((t) => `${t.payee.name} (${krNo(t.amountNok)}, #${t.id})`)
          .join(", ")} first`,
      });
    }
    await dao().setRoundPaid(conn, roundId);
  });
}

//endregion

//region Earmarks

export type EarmarkInput = {
  roundId: number;
  organizationId: number;
  projectId: number;
  /** Kroner, positive */
  amount: number;
  /** Optional note added to the reason (e.g. the grant letter) */
  note?: string | null;
};

export type EarmarkResult = {
  /** The pair: unrestricted −amount, project +amount */
  fromAdjustmentId: number;
  toAdjustmentId: number;
  /** Pay now moved from the unrestricted line to the project line (≤ amount) */
  movedNok: Money;
};

/** One transfer's lines with `delta` moved from one (recipient, project) line to another */
const moveBetweenLines = (
  transfer: Transfer,
  organizationId: number,
  from: number | null,
  to: number | null,
  amount: Decimal,
) => {
  const lines = transfer.lines.map((l) => ({
    organizationId: l.organizationId,
    projectId: l.projectId,
    amount: dec(l.amountNok),
  }));
  const line = (projectId: number | null) => {
    let found = lines.find((l) => l.organizationId === organizationId && l.projectId === projectId);
    if (!found) lines.push((found = { organizationId, projectId, amount: ZERO }));
    return found;
  };
  line(from).amount = line(from).amount.minus(amount);
  line(to).amount = line(to).amount.plus(amount);
  return lines.filter((l) => l.amount.greaterThan(0)).map((l) => ({ ...l, amount: fmt(l.amount) }));
};

/**
 * Earmarks part of a recipient's unrestricted balance to one of its projects, in a draft: two
 * reallocation adjustments attached to the round and dated its cutoff (unrestricted −X, project
 * +X, paired), and the same amount of Pay now moved from the unrestricted line to the project
 * line in the transfer that has it (as much as that line pays). One transaction. Like the round,
 * the earmark counts in balances only once the round is approved.
 */
export async function earmark(input: EarmarkInput, createdBy: string): Promise<EarmarkResult> {
  const amount = dec(input.amount);
  if (!amount.greaterThan(0)) throw badRequest("Earmark a positive amount");
  return dao().inTransaction(async (conn) => {
    const round = await lockRoundIn(conn, input.roundId, ["draft"], "earmark money in");
    const [project, organizations, funds] = await Promise.all([
      dao().getProject(input.projectId, conn),
      dao().getOrganizations(conn),
      dao().listFunds(conn),
    ]);
    const organization = organizations.find((o) => o.id === input.organizationId);
    if (!organization) throw badRequest(`Recipient #${input.organizationId} does not exist`);
    if (!project) throw badRequest(`Project #${input.projectId} does not exist`);
    if (project.organizationId !== organization.id) {
      throw badRequest(
        `${project.name} is a project at ${project.organizationName}, not at ${organization.name}`,
      );
    }
    if (funds.some((f) => f.organizationId === organization.id)) {
      throw badRequest(
        `${organization.name} is an own fund; grant to the project with a fund grant instead`,
      );
    }

    // Edits lock the round, so the state read here is what the earmark applies to
    const state = await loadRoundState(round.id);
    const unrestricted = state.positions.find(
      (p) => p.organizationId === organization.id && p.projectId === null,
    );
    const available = unrestricted?.available ?? ZERO;
    if (amount.greaterThan(available)) {
      throw badRequest(
        `${organization.name} has ${krNo(available)} unrestricted available in ${roundLabel(
          round,
        )}; you can't earmark ${krNo(amount)}`,
      );
    }

    const note = input.note?.trim();
    const common = {
      organizationId: organization.id,
      type: "reallocation" as const,
      reason: `Earmarked for ${project.name} in ${round.name}${note ? `: ${note}` : ""}`,
      effectiveAt: round.cutoff,
      roundId: round.id,
      linkedTransferId: null,
      linkedDonationId: null,
    };
    const fromAdjustmentId = await dao().createAdjustment(
      { ...common, projectId: null, amount: amount.negated().toNumber() },
      createdBy,
      conn,
    );
    const toAdjustmentId = await dao().createAdjustment(
      { ...common, projectId: project.id, amount: amount.toNumber() },
      createdBy,
      conn,
    );
    await dao().pairAdjustments(conn, fromAdjustmentId, toAdjustmentId);

    // Pay now follows the money, within the transfer that pays the unrestricted line
    let moved = ZERO;
    const transfer = state.transfers.find((t) =>
      t.lines.some((l) => l.organizationId === organization.id && l.projectId === null),
    );
    if (transfer) {
      const payNow = dec(
        transfer.lines.find((l) => l.organizationId === organization.id && l.projectId === null)!
          .amountNok,
      );
      moved = amount.lessThan(payNow) ? amount : payNow;
      await dao().replaceTransferLines(
        conn,
        transfer.id,
        moveBetweenLines(transfer, organization.id, null, project.id, moved),
        true,
      );
    }
    return { fromAdjustmentId, toAdjustmentId, movedNok: fmt(moved) };
  });
}

/**
 * Undoes an earmark in a draft (either half's id): deletes both adjustments and moves the Pay
 * now back from the project line to the unrestricted line, as much as the project line pays.
 */
export async function removeEarmark(adjustmentId: number): Promise<{ roundId: number }> {
  return dao().inTransaction(async (conn) => {
    const adjustment = await dao().getAdjustment(adjustmentId, conn);
    if (!adjustment) throw notFound(`Adjustment #${adjustmentId} not found`);
    if (adjustment.pairedAdjustmentId === null || adjustment.roundId === null) {
      throw badRequest(
        `The ${adjustment.type} entry for ${adjustment.organizationName} isn't an earmark; delete it instead`,
      );
    }
    const round = await lockRoundIn(conn, adjustment.roundId, ["draft"], "remove an earmark from");
    const pair = await dao().getAdjustment(adjustment.pairedAdjustmentId, conn);
    const halves = [adjustment, ...(pair ? [pair] : [])];
    const projectHalf = halves.find((a) => a.projectId !== null);

    if (projectHalf) {
      const amount = dec(projectHalf.amount);
      const transfers = await dao().getTransfers(round.id, conn);
      const transfer = transfers.find((t) =>
        t.lines.some(
          (l) =>
            l.organizationId === projectHalf.organizationId &&
            l.projectId === projectHalf.projectId,
        ),
      );
      if (transfer && amount.greaterThan(0)) {
        const payNow = dec(
          transfer.lines.find(
            (l) =>
              l.organizationId === projectHalf.organizationId &&
              l.projectId === projectHalf.projectId,
          )!.amountNok,
        );
        const moved = amount.lessThan(payNow) ? amount : payNow;
        await dao().replaceTransferLines(
          conn,
          transfer.id,
          moveBetweenLines(
            transfer,
            projectHalf.organizationId,
            projectHalf.projectId,
            null,
            moved,
          ),
          true,
        );
      }
    }
    await dao().deleteAdjustments(
      conn,
      halves.map((a) => a.id),
    );
    return { roundId: round.id };
  });
}

//endregion

//region Statement

export type StatementEntry = {
  date: IsoDate;
  kind: StatementEntryKind;
  projectId: number | null;
  projectName: string | null;
  /** Signed as it affects the balance */
  amount: Money;
  /** False for fronted adjustments (records only) and pending ones */
  affectsBalance: boolean;
  /** An adjustment attached to a draft round: shown, but in the balance only once it is approved */
  pending: boolean;
  /** Running balance after this entry (of the selected project filter) */
  balanceAfter: Money;
  /** allocations: donations that day */
  donationCount: number | null;
  roundId: number | null;
  roundName: string | null;
  transferId: number | null;
  transferLineId: number | null;
  payeeName: string | null;
  bankRef: string | null;
  /** Transfers: the transfer's notes */
  transferNotes: string | null;
  fundGrantId: number | null;
  fundGrantLineId: number | null;
  /** fund_grant_in: the fund; fund_grant_out: the recipient */
  counterpartOrganizationId: number | null;
  counterpartName: string | null;
  rationale: string | null;
  adjustmentId: number | null;
  adjustmentType: Adjustment["type"] | null;
  reason: string | null;
  /** Adjustments and fund grants: who entered them; transfers: who approved the round */
  createdBy: string | null;
  /** Transfers and adjustments: their documents (bilag, bank confirmations) */
  documents: RegrantDocument[];
};

export type Statement = {
  organizationId: number;
  name: string;
  isFund: boolean;
  /** undefined in the input = all; null = unrestricted only */
  projectId: number | null | "all";
  from: IsoDate;
  to: IsoDate;
  /** Balance at the end of the day before `from` */
  openingBalance: Money;
  entries: StatementEntry[];
  closingBalance: Money;
  /** Approved, unpaid transfer lines (not in the balance yet) */
  committed: {
    roundId: number;
    roundName: string;
    transferId: number;
    transferLineId: number;
    payeeName: string;
    projectId: number | null;
    amountNok: Money;
  }[];
};

export async function getStatement(input: {
  organizationId: number;
  from: IsoDate;
  to?: IsoDate;
  /** undefined = all; null = unrestricted only; a number = that project */
  projectId?: number | null;
}): Promise<Statement> {
  const to = input.to ?? todayOslo();
  const organizations = await dao().getOrganizations();
  const org = organizations.find((o) => o.id === input.organizationId);
  if (!org) throw notFound(`Organization ${input.organizationId} not found`);
  const inProject = (projectId: number | null) =>
    input.projectId === undefined || projectId === input.projectId;

  const [openingRows, rows, projectNames, fund, committed] = await Promise.all([
    dao().getBalances({ at: dayBefore(input.from), organizationIds: [org.id] }),
    dao().getStatementRows(org.id, input.from, to),
    dao().getProjectNames(),
    dao().getFund(org.id),
    dao().getCommittedLines(org.id),
  ]);
  const names = new Map(organizations.map((o) => [o.id, o.name]));
  const ids = (key: "transferId" | "adjustmentId") => [
    ...new Set(rows.map((r) => r[key]).filter((id): id is number => id !== null)),
  ];
  const [transferDocuments, adjustmentDocuments] = await Promise.all([
    dao().documentsFor("transferId", ids("transferId")),
    dao().documentsFor("adjustmentId", ids("adjustmentId")),
  ]);

  const opening = sum(openingRows.filter((r) => inProject(r.projectId)).map(rowBalance));
  let running = opening;
  const entries: StatementEntry[] = rows
    .filter((r) => inProject(r.projectId))
    .map((r) => {
      const affectsBalance = r.adjustmentType !== "fronted" && !r.pending;
      if (affectsBalance) running = running.plus(r.amount);
      return {
        ...r,
        projectName: r.projectId === null ? null : (projectNames.get(r.projectId)?.name ?? null),
        affectsBalance,
        balanceAfter: fmt(running),
        counterpartName:
          r.counterpartOrganizationId === null
            ? null
            : (names.get(r.counterpartOrganizationId) ?? null),
        documents:
          (r.transferId !== null
            ? transferDocuments.get(r.transferId)
            : r.adjustmentId !== null
              ? adjustmentDocuments.get(r.adjustmentId)
              : undefined) ?? [],
      };
    });

  return {
    organizationId: org.id,
    name: org.name,
    isFund: Boolean(fund),
    projectId: input.projectId === undefined ? "all" : input.projectId,
    from: input.from,
    to,
    openingBalance: fmt(opening),
    entries,
    closingBalance: fmt(running),
    committed: committed.filter((c) => inProject(c.projectId)),
  };
}

//endregion
