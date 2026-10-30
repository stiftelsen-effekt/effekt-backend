import { DateTime } from "luxon";
import { AvtaleGiroAgreement } from "../DAO_modules/avtalegiroagreements";

export enum AvtaleGiroChargeStatus {
  /** Sent to Mastercard Payment Services (Nets) in a claims file */
  CLAIMED = "CLAIMED",
  /** The payment for the claim has arrived in an OCR file */
  COMPLETED = "COMPLETED",
  /** The shipment was not accepted, and a retry sent the claim again in a new shipment */
  SUPERSEDED = "SUPERSEDED",
}

/**
 * Statuses that count as "claimed this month": the agreement is not claimed again that month
 */
export const MONTHLY_CLAIM_STATUSES: AvtaleGiroChargeStatus[] = [
  AvtaleGiroChargeStatus.CLAIMED,
  AvtaleGiroChargeStatus.COMPLETED,
];

export type AvtaleGiroOpenCharge = {
  id: number;
  /** ISO date, e.g. 2026-10-27 */
  dueDate: string;
};

/**
 * How far from the due date we still match an AvtaleGiro payment to a charge.
 * Due dates on weekends and holidays are charged the next banking day, and the payer's bank
 * retries for up to four banking days after that, so payments can land well after the due date.
 */
export const MAX_DAYS_PAYMENT_AFTER_DUE_DATE = 14;
export const MAX_DAYS_PAYMENT_BEFORE_DUE_DATE = 3;

/**
 * The first and last day of the due date's month, as ISO dates
 */
export function getMonthBounds(dueDate: DateTime): { start: string; end: string } {
  return {
    start: dueDate.startOf("month").toISODate()!,
    end: dueDate.endOf("month").toISODate()!,
  };
}

/**
 * An agreement is charged at most once per month. If the donor moves their payment date after this
 * month's claim was sent, the new date would otherwise be claimed as well.
 * @param agreements Agreements with the payment date being claimed
 * @param claimedKIDs KIDs that already have a claim with a due date in the same month
 */
export function excludeAgreementsClaimedThisMonth(
  agreements: AvtaleGiroAgreement[],
  claimedKIDs: Set<string>,
): { toClaim: AvtaleGiroAgreement[]; alreadyClaimed: AvtaleGiroAgreement[] } {
  const toClaim: AvtaleGiroAgreement[] = [];
  const alreadyClaimed: AvtaleGiroAgreement[] = [];
  const seenKIDs = new Set<string>();

  for (const agreement of agreements) {
    // Also guards against the same KID appearing twice in the agreements passed in
    if (claimedKIDs.has(agreement.KID) || seenKIDs.has(agreement.KID)) {
      alreadyClaimed.push(agreement);
    } else {
      toClaim.push(agreement);
      seenKIDs.add(agreement.KID);
    }
  }

  return { toClaim, alreadyClaimed };
}

/**
 * Finds the open charge an AvtaleGiro payment belongs to: the one with the due date closest to the
 * payment date, within the matching window. Returns null if none fit, e.g. for payments claimed
 * before charges were tracked.
 * @param openCharges Claimed charges for the KID that have no payment yet
 * @param paymentDate The settlement date of the payment in the OCR file
 */
export function findChargeForPayment(
  openCharges: AvtaleGiroOpenCharge[],
  paymentDate: DateTime,
): AvtaleGiroOpenCharge | null {
  const paymentDay = paymentDate.startOf("day");
  let best: AvtaleGiroOpenCharge | null = null;
  let bestDistance = Infinity;

  for (const charge of openCharges) {
    const dueDate = DateTime.fromISO(charge.dueDate, { zone: paymentDate.zone });
    if (!dueDate.isValid) continue;

    const daysAfterDueDate = paymentDay.diff(dueDate.startOf("day"), "days").days;
    if (
      daysAfterDueDate > MAX_DAYS_PAYMENT_AFTER_DUE_DATE ||
      daysAfterDueDate < -MAX_DAYS_PAYMENT_BEFORE_DUE_DATE
    ) {
      continue;
    }

    const distance = Math.abs(daysAfterDueDate);
    // On a tie, prefer the earlier due date, since it has been waiting longest
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && charge.dueDate < best.dueDate)
    ) {
      best = charge;
      bestDistance = distance;
    }
  }

  return best;
}
