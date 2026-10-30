/**
 * One status vocabulary for every lifecycle in the admin. Each domain status maps to a
 * label, a tone and a one-line meaning (shown as a tooltip). Tones mean the same
 * everywhere:
 *   success  – money flows / done as expected
 *   warning  – waiting on someone or something; may need a look
 *   danger   – failed or reversed; needs action
 *   neutral  – ended or inactive, nothing to do
 *   accent   – scheduled / about to happen
 */
export type StatusTone = "success" | "warning" | "danger" | "neutral" | "accent";
export type StatusDefinition = { label: string; tone: StatusTone; description: string };

function define<const T extends Record<string, StatusDefinition>>(catalog: T) {
  return catalog;
}

/**
 * Unified agreement status across providers, as `agreements.list` normalises it (see
 * DAO_modules/agreements.ts). The provider's own value is shown next to it as `providerStatus`.
 */
export const agreementStatus = define({
  active: {
    label: "Active",
    tone: "success",
    description: "Charged every month on the charge day",
  },
  paused: {
    label: "Paused",
    tone: "accent",
    description: "Active, but the donor paused charges until a date",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    description: "Waiting for the donor or bank to confirm",
  },
  stopped: {
    label: "Stopped",
    tone: "neutral",
    description: "Cancelled by the donor or by us, or never confirmed",
  },
});
export type AgreementStatus = keyof typeof agreementStatus;

/** Vipps recurring charges (chargeStatusSchema). */
export const chargeStatus = define({
  PENDING: { label: "Pending", tone: "warning", description: "Created, not yet sent to Vipps" },
  DUE: { label: "Due", tone: "accent", description: "Will be charged on the due date" },
  RESERVED: { label: "Reserved", tone: "accent", description: "Amount reserved, not captured" },
  PROCESSING: { label: "Processing", tone: "warning", description: "Vipps is charging the donor" },
  CHARGED: { label: "Charged", tone: "success", description: "Money received" },
  FAILED: { label: "Failed", tone: "danger", description: "The charge did not go through" },
  REFUNDED: { label: "Refunded", tone: "danger", description: "Fully refunded to the donor" },
  PARTIALLY_REFUNDED: {
    label: "Partly refunded",
    tone: "danger",
    description: "Part of the amount was refunded",
  },
  CANCELLED: { label: "Cancelled", tone: "neutral", description: "Cancelled before charging" },
});
export type ChargeStatus = keyof typeof chargeStatus;

/**
 * AvtaleGiro claims sent to Mastercard Payment Services (AvtaleGiroChargeStatus in the API's
 * avtalegiro/charges.ts).
 */
export const avtaleGiroChargeStatus = define({
  CLAIMED: {
    label: "Claimed",
    tone: "accent",
    description: "Sent to the bank; the payment hasn't been matched yet",
  },
  COMPLETED: {
    label: "Paid",
    tone: "success",
    description: "The payment arrived in an OCR file and is linked to its donation",
  },
  SUPERSEDED: {
    label: "Superseded",
    tone: "neutral",
    description: "The bank didn't accept the file; a retry sent the claim again",
  },
  DELETION_REQUESTED: {
    label: "Deletion requested",
    tone: "warning",
    description: "The agreement was cancelled; the claim goes in the next deletion file",
  },
  DELETION_SENT: {
    label: "Deletion sent",
    tone: "warning",
    description: "Sent in a deletion file; waiting for the bank to accept it",
  },
  DELETED: {
    label: "Deleted",
    tone: "neutral",
    description: "The bank accepted the deletion; the donor isn't charged",
  },
});
export type AvtaleGiroChargeStatus = keyof typeof avtaleGiroChargeStatus;

/** One charge day in the AvtaleGiro check: did the expected money come in? */
export const avtaleGiroDayStatus = define({
  complete: {
    label: "All received",
    tone: "success",
    description: "Received at least as expected",
  },
  partial: { label: "Some missing", tone: "warning", description: "Less received than expected" },
  none: {
    label: "Nothing received",
    tone: "danger",
    description: "No AvtaleGiro payments registered",
  },
});
export type AvtaleGiroDayStatus = keyof typeof avtaleGiroDayStatus;

/** Outcome of one transaction in an imported payment report. */
export const importStatus = define({
  registered: { label: "Registered", tone: "success", description: "Saved as a donation" },
  ignored: { label: "Ignored", tone: "neutral", description: "Already registered, skipped" },
  review: {
    label: "Needs review",
    tone: "warning",
    description: "Could not be matched automatically",
  },
  skipped: {
    label: "Skipped",
    tone: "neutral",
    description: "Dismissed during review, not registered",
  },
});
export type ImportStatus = keyof typeof importStatus;

/** Items in the shared review queue (reports.reviewQueue). */
export const reviewStatus = define({
  open: {
    label: "Needs review",
    tone: "warning",
    description: "Could not be matched automatically; waiting for someone to decide",
  },
  registered: { label: "Registered", tone: "success", description: "Registered as a donation" },
  ignored: { label: "Ignored", tone: "neutral", description: "Marked as not needing a donation" },
});
export type ReviewStatus = keyof typeof reviewStatus;

/** Configuration records (cause areas, organizations, referral types). */
export const activeStatus = define({
  active: { label: "Active", tone: "success", description: "Shown to donors" },
  inactive: {
    label: "Inactive",
    tone: "neutral",
    description: "Hidden from donors, kept for history",
  },
});

/**
 * Payment intents (what a donor said they'd give in the donation widget), as `intents.*`
 * decides them: received when the donor has a donation on or after the intent's day, the
 * same rule the follow-up email job uses (DAO_modules/paymentIntents.ts).
 */
export const intentStatus = define({
  awaiting: {
    label: "Awaiting payment",
    tone: "warning",
    description: "No donation from the donor since they said they'd give",
  },
  received: {
    label: "Received",
    tone: "success",
    description: "The donor has given on or after the day they said they would",
  },
  expired: {
    label: "Not received",
    tone: "neutral",
    description: "Nothing arrived within 30 days",
  },
});
export type IntentStatus = keyof typeof intentStatus;

/** Donors.trash: test data, spam and duplicates kept out of the way. */
export const donorStatus = define({
  trash: {
    label: "In trash",
    tone: "neutral",
    description: "Marked as test data, spam or a duplicate",
  },
});

/** A donor's tax units. Archived units keep their history but get no new donations. */
export const taxUnitStatus = define({
  active: { label: "Active", tone: "success", description: "Donations count towards deductions" },
  archived: {
    label: "Archived",
    tone: "neutral",
    description: "Kept for history; gets no new donations",
  },
});

/** Whether a dated rule (Vipps matching rule) applies today. */
export const ruleValidity = define({
  current: {
    label: "In effect",
    tone: "success",
    description: "Applied to imports covering today",
  },
  upcoming: { label: "Upcoming", tone: "accent", description: "Starts later" },
  expired: { label: "Expired", tone: "neutral", description: "Ended; kept for old imports" },
});
export type RuleValidity = keyof typeof ruleValidity;

/** Regranting rounds (regranting.rounds): draft → approved → paid. */
export const roundStatus = define({
  draft: {
    label: "Draft",
    tone: "warning",
    description: "Being prepared; a second person must approve it before anything is paid",
  },
  approved: {
    label: "Approved",
    tone: "accent",
    description: "Locked and approved; record each transfer's payment, then mark it paid",
  },
  paid: { label: "Paid", tone: "success", description: "Paid; the transfers are in the balances" },
});
export type RoundStatus = keyof typeof roundStatus;

/** Projects at a regranting recipient. */
export const projectStatus = define({
  proposed: { label: "Proposed", tone: "accent", description: "Not started; no agreement yet" },
  active: { label: "Active", tone: "success", description: "Running; can receive money" },
  completed: { label: "Completed", tone: "neutral", description: "Finished; kept for history" },
  cancelled: { label: "Cancelled", tone: "neutral", description: "Stopped before completion" },
});
export type ProjectStatus = keyof typeof projectStatus;

export const statusCatalogs = {
  agreementStatus,
  chargeStatus,
  avtaleGiroChargeStatus,
  avtaleGiroDayStatus,
  importStatus,
  reviewStatus,
  activeStatus,
  donorStatus,
  taxUnitStatus,

  ruleValidity,
  roundStatus,
  projectStatus,
};

/** Pledges (tilsagn): open until the money has come in. */
export const pledgeStatus = define({
  open: {
    label: "Open",
    tone: "warning",
    description: "Decided, not received: counts on top of the measured total",
  },
  received: {
    label: "Received",
    tone: "success",
    description: "The money came in and counts as measured",
  },
});
export type PledgeStatus = keyof typeof pledgeStatus;
