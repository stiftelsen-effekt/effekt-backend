import type { Decimal } from "decimal.js";
import { max0, sum, ZERO } from "./money";
import type { PayeeRef, RoundKind } from "./types";

/**
 * The proposal rules of docs/regranting.md ("Proposal rules"), as a pure function so they can
 * be tested without a database.
 */

/** One (recipient, project) balance as a round sees it */
export type Position = {
  organizationId: number;
  /** null = unrestricted */
  projectId: number | null;
  /** Ledger balance at the cutoff, leaving this round (and its adjustments) out */
  balanceAtCutoff: Decimal;
  /** Other rounds' payments not in the ledger at the cutoff (approved, or paid/granted later) */
  committed: Decimal;
  /** This round's fund grant lines: + for recipients, − (the total granted) for own funds */
  fundGrants: Decimal;
  /**
   * This round's adjustments dated on or before the cutoff (e.g. an earmark: unrestricted −X,
   * project +X). Counted in the round while it is a draft; in the ledger once it is approved.
   */
  roundAdjustments: Decimal;
  /** This round's transfer lines as they stand */
  inRound: Decimal;
};

export type ProposedPosition = Position & {
  /** balanceAtCutoff − committed + fundGrants + roundAdjustments: what this round can pay */
  available: Decimal;
  /** What the rules propose paying in this round */
  proposed: Decimal;
  includeDirect: boolean;
  /** Under an active hold: shown, proposed as 0 */
  held: boolean;
};

export type ProposedTransfer = {
  payee: PayeeRef;
  currency: string;
  lines: { organizationId: number; projectId: number | null; amount: Decimal }[];
};

export type ProposalInput = {
  kind: RoundKind;
  /** A recipient whose proposed total is under this gets 0 (it stays in the balance) */
  minTransfer: Decimal;
  positions: Position[];
  /** Own funds: never paid directly, never proposed */
  fundIds: Set<number>;
  /** major_donor: the chosen donations' allocations per recipient (already-passed-on excluded) */
  chosenAllocations: Map<number, Decimal>;
  /** Per-recipient Include direct donations switch; overrides the kind's default */
  includeDirectOverrides: Map<number, boolean>;
  /** Active holds: projectId null holds the whole recipient */
  holds: { organizationId: number; projectId: number | null }[];
  /** Payee each recipient is routed to at the cutoff */
  payees: Map<number, PayeeRef>;
};

/** Direct (unrestricted) balances are included by default only in regular rounds */
export const defaultIncludeDirect = (kind: RoundKind) => kind === "regular";

export const positionKey = (organizationId: number, projectId: number | null) =>
  `${organizationId}:${projectId ?? ""}`;

/**
 * 1. Each recipient in scope: propose its unrestricted balance plus every project balance.
 * 2. Direct donations by kind: regular includes them; fund_grant and extraordinary only pay this
 *    round's fund grants (and adjustments, e.g. earmarks); major_donor pays the chosen donations'
 *    allocations (plus this round's fund grants and adjustments), capped at the balance. The per-recipient switch overrides the default; when
 *    on, the whole balance is proposed.
 * 3. Grouped by the payee valid at the cutoff: one transfer per payee and currency.
 * 4. Anything not proposed stays in the balance.
 * 5. Held balances are proposed as 0. So is a recipient whose total is under minTransfer.
 * Own funds are never proposed. Nothing is proposed above what is available, or below 0.
 */
export function proposeRound(input: ProposalInput): {
  positions: ProposedPosition[];
  transfers: ProposedTransfer[];
} {
  const positions = [...input.positions];
  // A recipient with chosen allocations always has an unrestricted position
  const keys = new Set(positions.map((p) => positionKey(p.organizationId, p.projectId)));
  for (const organizationId of input.chosenAllocations.keys()) {
    if (!keys.has(positionKey(organizationId, null))) {
      positions.push({
        organizationId,
        projectId: null,
        balanceAtCutoff: ZERO,
        committed: ZERO,
        fundGrants: ZERO,
        roundAdjustments: ZERO,
        inRound: ZERO,
      });
    }
  }

  const heldOrgs = new Set(
    input.holds.filter((h) => h.projectId === null).map((h) => h.organizationId),
  );
  const heldProjects = new Set(
    input.holds
      .filter((h) => h.projectId !== null)
      .map((h) => positionKey(h.organizationId, h.projectId)),
  );

  const proposed: ProposedPosition[] = positions.map((p) => {
    const available = p.balanceAtCutoff
      .minus(p.committed)
      .plus(p.fundGrants)
      .plus(p.roundAdjustments);
    const includeDirect =
      input.includeDirectOverrides.get(p.organizationId) ?? defaultIncludeDirect(input.kind);
    const held =
      heldOrgs.has(p.organizationId) ||
      heldProjects.has(positionKey(p.organizationId, p.projectId));
    const base = { ...p, available, includeDirect, held };

    if (input.fundIds.has(p.organizationId) || held) return { ...base, proposed: ZERO };

    // Without direct donations a round pays what it decides itself: its fund grants and its
    // adjustments (an earmark moves money from the unrestricted line to the project line)
    const decided = p.fundGrants.plus(p.roundAdjustments);
    let target: Decimal;
    if (includeDirect) {
      target = available;
    } else if (input.kind === "major_donor" && p.projectId === null) {
      target = (input.chosenAllocations.get(p.organizationId) ?? ZERO).plus(decided);
    } else {
      target = decided;
    }
    return { ...base, proposed: max0(target.lessThan(available) ? target : available) };
  });

  // minTransfer applies to the recipient's total across its projects
  if (input.minTransfer.greaterThan(0)) {
    const totals = new Map<number, Decimal>();
    for (const p of proposed) {
      totals.set(p.organizationId, (totals.get(p.organizationId) ?? ZERO).plus(p.proposed));
    }
    for (const p of proposed) {
      const total = totals.get(p.organizationId)!;
      if (total.greaterThan(0) && total.lessThan(input.minTransfer)) p.proposed = ZERO;
    }
  }

  const transfers = new Map<string, ProposedTransfer>();
  for (const p of proposed) {
    if (!p.proposed.greaterThan(0)) continue;
    const payee = input.payees.get(p.organizationId);
    if (!payee) continue; // shown in the builder; a warning at validation
    const key = `${payee.id}:${payee.currency}`;
    if (!transfers.has(key)) transfers.set(key, { payee, currency: payee.currency, lines: [] });
    transfers.get(key)!.lines.push({
      organizationId: p.organizationId,
      projectId: p.projectId,
      amount: p.proposed,
    });
  }
  for (const t of transfers.values()) {
    t.lines.sort(
      (a, b) =>
        a.organizationId - b.organizationId ||
        (a.projectId === null ? -1 : b.projectId === null ? 1 : a.projectId - b.projectId),
    );
  }

  return { positions: proposed, transfers: [...transfers.values()] };
}

/** Sum of a recipient's proposed amounts */
export const proposedTotal = (positions: ProposedPosition[], organizationId: number) =>
  sum(positions.filter((p) => p.organizationId === organizationId).map((p) => p.proposed));
