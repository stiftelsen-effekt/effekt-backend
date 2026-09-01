export const MAX_REFERRAL_CODE_LENGTH = 128;

/**
 * Normalize a widget referral / campaign code. Empty or whitespace-only values
 * are treated as absent so we do not store blank rows.
 */
export function normalizeReferralCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
