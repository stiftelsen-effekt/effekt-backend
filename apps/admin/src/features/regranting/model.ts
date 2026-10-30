/**
 * Regranting ("tildelinger"): shared shapes, labels and small helpers for the pages under
 * /regranting. The API (regranting.*) calculates every balance; the admin only shows them and
 * edits what people decide. See docs/regranting.md.
 */
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type BalancesView = RouterOutputs["regranting"]["balances"]["list"];
export type BalancesRecipient = BalancesView["recipients"][number];
export type LedgerFigures = BalancesRecipient["total"];
export type Builder = RouterOutputs["regranting"]["rounds"]["builder"];
export type BuilderRecipient = Builder["recipients"][number];
export type BuilderLine = BuilderRecipient["lines"][number];
export type BuilderFund = Builder["funds"][number];
export type Transfer = Builder["transfers"][number];
export type FundGrant = Builder["fundGrants"][number];
export type Issue = Builder["issues"][number];
export type RoundSummary = RouterOutputs["regranting"]["rounds"]["list"][number];
export type RoundDetail = RouterOutputs["regranting"]["rounds"]["get"];
export type RoundKind = RoundSummary["kind"];
export type Project = RouterOutputs["regranting"]["projects"]["list"][number];
export type ProjectPage = RouterOutputs["regranting"]["projects"]["get"];
export type Adjustment = RouterOutputs["regranting"]["adjustments"]["list"][number];
export type AdjustmentType = Adjustment["type"];
export type AdjustmentInput = RouterInputs["regranting"]["adjustments"]["create"];
export type Payee = RouterOutputs["regranting"]["payees"]["list"][number];
export type Routing = RouterOutputs["regranting"]["routings"]["list"][number];
export type Hold = RouterOutputs["regranting"]["holds"]["list"][number];
export type Fund = RouterOutputs["regranting"]["funds"]["list"][number];
export type Statement = RouterOutputs["regranting"]["statements"]["recipient"];
export type StatementEntry = Statement["entries"][number];

export const roundKinds = ["regular", "major_donor", "fund_grant", "extraordinary"] as const;

export const roundKindLabels: Record<RoundKind, string> = {
  regular: "Regular",
  major_donor: "Major donor",
  fund_grant: "Fund grants",
  extraordinary: "Extraordinary",
};

/** One sentence per kind, for the New round dialog (ChoiceCards). */
export const roundKindDescriptions: Record<RoundKind, string> = {
  regular: "Every few months: pays each recipient's balance at the cutoff.",
  major_donor:
    "Passes on chosen donations before the next regular round, capped at what's available.",
  fund_grant: "Grants from our own funds. Direct balances wait for the next regular round.",
  extraordinary: "Anything else outside the schedule. Pays only fund grants unless switched on.",
};

export const adjustmentTypes = [
  "opening",
  "fee",
  "correction",
  "reallocation",
  "fronted",
  "own_funds",
] as const satisfies readonly AdjustmentType[];

export const adjustmentTypeLabels: Record<AdjustmentType, string> = {
  opening: "Opening balance",
  fee: "Fee",
  correction: "Correction",
  reallocation: "Reallocation",
  fronted: "Fronted",
  own_funds: "Own funds",
};

export const adjustmentTypeHints: Record<AdjustmentType, string> = {
  opening: "The balance carried in from before the system (the sheet's carry-over).",
  fee: "A fee deliberately charged to the recipient. Bank fees go on the transfer instead.",
  correction: "Fixes a paid transfer. Link the transfer it corrects.",
  reallocation: "Moves money between recipients or projects, outside the donation data.",
  fronted:
    "A record of money paid before the donation arrived. Doesn't change the balance; link the donation when it's registered.",
  own_funds: "Money the foundation adds from its own funds (e.g. by board decision).",
};

export const projectStatuses = ["proposed", "active", "completed", "cancelled"] as const;

/** The name a recipient is known by in lists: "GiveWell All Grants Fund (AGF)". */
export const recipientLabel = (r: { name: string; abbriv?: string | null }) =>
  r.abbriv && r.abbriv !== r.name ? `${r.name} (${r.abbriv})` : r.name;

/** "Unrestricted" or the project's name, for a line. */
export const lineLabel = (line: { projectId: number | null; projectName: string | null }) =>
  line.projectId === null ? "Unrestricted" : (line.projectName ?? `Project #${line.projectId}`);

export type IssueTarget = {
  organizationId?: number | null;
  projectId?: number | null;
  transferId?: number | null;
  fundGrantId?: number | null;
  donationId?: number | null;
};

/**
 * Issues about one place in the builder. A target field left out matches anything; a field set
 * (also to null) must match. So `{ organizationId: 5, projectId: null }` is the unrestricted line
 * of recipient 5, and `{ organizationId: 5 }` is everything about it.
 */
export function issuesFor(issues: readonly Issue[], target: IssueTarget): Issue[] {
  return issues.filter((issue) =>
    (Object.keys(target) as (keyof IssueTarget)[]).every(
      (key) => target[key] === undefined || issue[key] === target[key],
    ),
  );
}

/** Issues the builder can't show next to a row: round-wide ones (Unassigned) and unknown targets. */
export function generalIssues(issues: readonly Issue[]): Issue[] {
  return issues.filter(
    (i) =>
      i.organizationId === null &&
      i.transferId === null &&
      i.fundGrantId === null &&
      i.donationId === null,
  );
}

export const countIssues = (issues: readonly Issue[]) => ({
  errors: issues.filter((i) => i.severity === "error").length,
  warnings: issues.filter((i) => i.severity === "warning").length,
});

/** "who" as the API records it: the token's email, else its subject (src/trpc/identity.ts). */
export const identityOf = (user: { id: string; email?: string } | null | undefined) =>
  user ? (user.email ?? user.id) : null;
