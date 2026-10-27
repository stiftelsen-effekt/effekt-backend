/**
 * Regranting ("tildelinger"): shared constants and the shapes the DAO, the round logic and the
 * tRPC router return. See docs/regranting.md.
 *
 * Conventions: money is a decimal string with two decimals ("1234.50", NOK unless noted), DATE
 * columns are ISO dates ("2026-09-30"), timestamps are Date objects, flags are booleans.
 */

export const roundKinds = ["regular", "major_donor", "fund_grant", "extraordinary"] as const;
export type RoundKind = (typeof roundKinds)[number];

export const roundStatuses = ["draft", "approved", "paid"] as const;
export type RoundStatus = (typeof roundStatuses)[number];

export const adjustmentTypes = [
  "opening",
  "fee",
  "correction",
  "reallocation",
  "fronted",
  "own_funds",
] as const;
export type AdjustmentType = (typeof adjustmentTypes)[number];

export const projectStatuses = ["proposed", "active", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const paidByValues = ["foundation", "external"] as const;
export type PaidBy = (typeof paidByValues)[number];

/** Decimal string with two decimals, e.g. "1234.50" */
export type Money = string;
/** ISO date, e.g. "2026-09-30" */
export type IsoDate = string;

//region Reference data

export type Payee = {
  id: number;
  name: string;
  currency: string;
  bankAccount: string | null;
  iban: string | null;
  swift: string | null;
  wallet: string | null;
  paymentReferenceTemplate: string | null;
  isActive: boolean;
  createdAt: Date;
};

/** A payee as shown next to a recipient or transfer */
export type PayeeRef = { id: number; name: string; currency: string };

export type PayeeRouting = {
  id: number;
  organizationId: number;
  organizationName: string;
  payeeId: number;
  payeeName: string;
  validFrom: IsoDate;
  /** Inclusive; null = open-ended */
  validTo: IsoDate | null;
};

export type Project = {
  id: number;
  organizationId: number;
  organizationName: string;
  name: string;
  description: string | null;
  country: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: ProjectStatus;
  agreementRef: string | null;
  reportDue: IsoDate | null;
  documentsUrl: string | null;
  createdAt: Date;
};

export type Fund = {
  organizationId: number;
  name: string;
  abbriv: string;
  maxHoldDays: number | null;
};

export type Hold = {
  id: number;
  organizationId: number;
  /** null = the whole recipient */
  projectId: number | null;
  reason: string;
  /** Active for rounds/dates on or before this day; null = until removed */
  until: IsoDate | null;
  createdBy: string;
  createdAt: Date;
};

export type OrganizationRef = {
  id: number;
  name: string;
  abbriv: string;
  isActive: boolean;
  ordering: number | null;
};

//endregion

//region Ledger

/** The components of a (recipient, project) balance at a date. All signed as they affect it. */
export type LedgerFigures = {
  opening: Money;
  allocations: Money;
  fundGrantsIn: Money;
  /** Negative: granted out of an own fund */
  fundGrantsOut: Money;
  /** Negative: paid transfer lines */
  transfers: Money;
  /** Other adjustments (fee, correction, reallocation, own_funds); fronted entries don't count */
  adjustments: Money;
  /** Sum of the above, entries dated on or before the date */
  balance: Money;
  /**
   * Payments decided but not in the ledger at the date: transfer lines of approved, unpaid
   * rounds, and transfer lines / fund grants out of other rounds dated after it. Positive.
   */
  committed: Money;
  /** balance − committed */
  available: Money;
};

export type BalanceRow = {
  organizationId: number;
  projectId: number | null;
  opening: Money;
  allocations: Money;
  fundGrantsIn: Money;
  fundGrantsOut: Money;
  transfers: Money;
  adjustments: Money;
  /** Approved, unpaid transfer lines (positive) */
  committed: Money;
  /** Paid transfer lines and fund grants out dated after the date (positive) */
  laterDebits: Money;
  /** Allocations after the `inflowSince` date, up to the date */
  inflowSince: Money;
};

export type Unassigned = {
  /** Donations (excluding payments 15/16) up to the date whose KID has no split */
  amount: Money;
  donationCount: number;
};

export type LastTransfer = {
  organizationId: number;
  transferId: number;
  roundId: number;
  roundName: string;
  paidAt: IsoDate;
  /** The recipient's lines in that transfer */
  amountNok: Money;
};

export type FrontedEntry = {
  adjustmentId: number;
  organizationId: number;
  projectId: number | null;
  amount: Money;
  effectiveAt: IsoDate;
  roundId: number | null;
  linkedDonationId: number | null;
  /** True when the linked donation was confirmed on or before the date */
  offset: boolean;
};

//endregion

//region Rounds

export type Round = {
  id: number;
  name: string;
  kind: RoundKind;
  cutoff: IsoDate;
  status: RoundStatus;
  minTransfer: Money;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  paidAt: IsoDate | null;
};

export type RoundSummary = Round & {
  /** Sum of the round's transfers' amount_nok */
  totalNok: Money;
  transferCount: number;
  fundGrantCount: number;
  /** Sum of the round's fund grant lines */
  fundGrantTotal: Money;
};

export type TransferLine = {
  id: number;
  transferId: number;
  organizationId: number;
  organizationName: string;
  projectId: number | null;
  projectName: string | null;
  amountNok: Money;
};

export type Transfer = {
  id: number;
  roundId: number;
  payee: PayeeRef;
  amountNok: Money;
  currency: string;
  /** Up to 8 decimals (e.g. BTC) */
  amountForeign: string | null;
  /** NOK per unit of `currency`, up to 8 decimals */
  fxRate: string | null;
  bankFee: Money | null;
  paidAt: IsoDate | null;
  bankRef: string | null;
  paidBy: PaidBy;
  lines: TransferLine[];
};

export type FundGrantLine = {
  id: number;
  fundGrantId: number;
  organizationId: number;
  organizationName: string;
  projectId: number | null;
  projectName: string | null;
  amount: Money;
};

export type FundGrant = {
  id: number;
  fundId: number;
  fundName: string;
  roundId: number;
  rationale: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  /** Sum of the lines: what the fund is debited */
  total: Money;
  lines: FundGrantLine[];
};

export type RoundBalanceSnapshot = {
  organizationId: number;
  organizationName: string;
  projectId: number | null;
  projectName: string | null;
  balanceAtCutoff: Money;
  committed: Money;
  fundGrants: Money;
  inRound: Money;
  includedDirect: boolean;
};

export type Adjustment = {
  id: number;
  organizationId: number;
  organizationName: string;
  projectId: number | null;
  projectName: string | null;
  amount: Money;
  type: AdjustmentType;
  reason: string;
  effectiveAt: IsoDate;
  roundId: number | null;
  linkedTransferId: number | null;
  linkedDonationId: number | null;
  documentRef: string | null;
  createdBy: string;
  createdAt: Date;
  /** False for fronted entries, which are records only */
  affectsBalance: boolean;
};

/** A donation chosen for a major_donor round, with its allocations */
export type RoundDonation = {
  donationId: number;
  donorId: number;
  sum: Money;
  timestampConfirmed: Date;
  allocations: { organizationId: number; amount: Money }[];
  /** False when it is excluded from the proposal; see `excludedReason` */
  inScope: boolean;
  excludedReason: "after_cutoff" | "passed_on" | null;
  /** Another approved/paid round that passed it on, or the fronted adjustment linking it */
  passedOnByRoundId: number | null;
  frontedByAdjustmentId: number | null;
};

export type StatementEntryKind =
  | "allocations"
  | "fund_grant_in"
  | "fund_grant_out"
  | "transfer"
  | "adjustment";

//endregion

//region Validation

export const issueCodes = [
  // errors
  "own_fund_in_transfer",
  "fund_grant_exceeds_balance",
  "fund_grant_missing_rationale",
  "fund_to_fund_grant",
  "transfer_lines_mismatch",
  "project_recipient_mismatch",
  "donation_already_passed_on",
  // warnings
  "negative_balance",
  "recipient_without_payee",
  "unassigned_balance",
] as const;
export type IssueCode = (typeof issueCodes)[number];

export type Issue = {
  severity: "error" | "warning";
  code: IssueCode;
  message: string;
  organizationId: number | null;
  projectId: number | null;
  transferId: number | null;
  transferLineId: number | null;
  fundGrantId: number | null;
  fundGrantLineId: number | null;
  donationId: number | null;
};

//endregion
