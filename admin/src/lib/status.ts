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

export const statusCatalogs = {
  agreementStatus,
  chargeStatus,
  avtaleGiroDayStatus,
  importStatus,
  reviewStatus,
  activeStatus,
  donorStatus,
  taxUnitStatus,

  ruleValidity,
};
