import { sendDonationRegistered } from "./mail";
import { REGISTRATION_TOKEN_TTL_MS } from "./registrationToken";

/** KIDs whose bank transfer email this instance sent, with when the entry can be forgotten */
const sentKIDs = new Map<string, number>();
const MAX_ENTRIES = 50_000;

/**
 * Sends the "how to pay your bank transfer" email for a KID the widget just registered, once
 * per KID for as long as its registration token is valid (per API instance). A repeated call
 * answers as if it was sent.
 * @param sum The amount registered with the KID
 */
export async function sendBankPendingOnce(KID: string, sum: number): Promise<boolean> {
  const now = Date.now();
  const forgetAt = sentKIDs.get(KID);
  if (forgetAt !== undefined && forgetAt > now) return true;

  if (sentKIDs.size >= MAX_ENTRIES) {
    for (const [kid, at] of sentKIDs) if (at <= now) sentKIDs.delete(kid);
    if (sentKIDs.size >= MAX_ENTRIES) sentKIDs.clear();
  }

  sentKIDs.set(KID, now + REGISTRATION_TOKEN_TTL_MS);
  const success = await sendDonationRegistered(KID, sum);
  if (!success) sentKIDs.delete(KID);
  return success;
}

/** Only for tests */
export const resetBankPendingMail = () => sentKIDs.clear();
