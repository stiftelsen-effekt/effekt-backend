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

/** Unified agreement status across Vipps, AvtaleGiro and AutoGiro. */
export const agreementStatus = define({
  active: {
    label: "Active",
    tone: "success",
    description: "Charged every month on the charge day",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    description: "Waiting for the donor or bank to confirm",
  },
  stopped: { label: "Stopped", tone: "neutral", description: "Cancelled by the donor or by us" },
  expired: {
    label: "Expired",
    tone: "neutral",
    description: "Never confirmed, or the mandate lapsed",
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

/** Configuration records (cause areas, organizations, referral types). */
export const activeStatus = define({
  active: { label: "Active", tone: "success", description: "Shown to donors" },
  inactive: {
    label: "Inactive",
    tone: "neutral",
    description: "Hidden from donors, kept for history",
  },
});

/** Whether a dated rule (Vipps matching rule) applies today. */
export const ruleValidity = define({
  current: { label: "In effect", tone: "success", description: "Applied to imports covering today" },
  upcoming: { label: "Upcoming", tone: "accent", description: "Starts later" },
  expired: { label: "Expired", tone: "neutral", description: "Ended; kept for old imports" },
});
export type RuleValidity = keyof typeof ruleValidity;

export const statusCatalogs = {
  agreementStatus,
  chargeStatus,
  importStatus,
  activeStatus,
  ruleValidity,
};
