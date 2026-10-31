import { DateTime } from "luxon";
import workdays from "norwegian-workdays";
import { AvtaleGiroAgreement } from "../DAO_modules/avtalegiroagreements";

export enum AvtaleGiroChargeStatus {
  /** Sent to Mastercard Payment Services in a claims file */
  CLAIMED = "CLAIMED",
  /** The payment for the claim has arrived in an OCR file */
  COMPLETED = "COMPLETED",
  /** The shipment was not accepted, and a retry sent the claim again in a new shipment */
  SUPERSEDED = "SUPERSEDED",
  /** The agreement was cancelled, and the claim will be deleted in the next deletion file */
  DELETION_REQUESTED = "DELETION_REQUESTED",
  /** A deletion request for the claim was sent, but MPS has not accepted the file yet */
  DELETION_SENT = "DELETION_SENT",
  /** MPS accepted the deletion request, and the payer's bank deletes the claim */
  DELETED = "DELETED",
}

/** Claims that have been or will be charged. Only these count as the month's claim for an agreement */
export const CHARGING_STATUSES = [AvtaleGiroChargeStatus.CLAIMED, AvtaleGiroChargeStatus.COMPLETED];

/**
 * Claims a payment can still be linked to. A deleted claim is included, since a payment arriving
 * anyway means the bank could not delete it.
 */
export const PAYABLE_STATUSES = [
  AvtaleGiroChargeStatus.CLAIMED,
  AvtaleGiroChargeStatus.DELETION_REQUESTED,
  AvtaleGiroChargeStatus.DELETION_SENT,
  AvtaleGiroChargeStatus.DELETED,
];

export type AvtaleGiroPendingCharge = {
  id: number;
  KID: string;
  /** In øre */
  amount: number;
  /** ISO date, e.g. 2026-10-27 */
  dueDate: string;
};

const OSLO = "Europe/Oslo";

/** MPS must receive deletion requests by 14:00 on the banking day before the due date */
export const DELETION_DEADLINE_HOUR = 14;
/**
 * Deletions are sent by the scheduled AvtaleGiro runs (10:00, then retries at 11:00, 12:00 and
 * 13:00), so a cancellation must come before the last run to be sent in time
 */
export const LAST_DELETION_RUN_HOUR = 13;
/** Margin before the MPS deadline, so a file sent by a run has time to arrive */
export const DELETION_SEND_MARGIN_MINUTES = 15;

// The backend runs luxon 1, where DateTime.fromObject ignores a separate zone option (the types are
// for luxon 3), so build the day from its ISO date instead
const asOsloDay = (date: DateTime) => DateTime.fromISO(date.toISODate()!, { zone: OSLO });

export const isBankingDay = (date: DateTime) =>
  workdays.isWorkingDay(new Date(date.year, date.month - 1, date.day));

/**
 * MPS uses the next banking day as the due date when the due date is a weekend or holiday
 */
export function getEffectiveDueDate(dueDate: DateTime): DateTime {
  let day = asOsloDay(dueDate);
  while (!isBankingDay(day)) day = day.plus({ days: 1 });
  return day;
}

/**
 * The latest time MPS accepts a deletion request for a claim: 14:00 Oslo time on the banking day
 * before the (effective) due date
 */
export function getDeletionDeadline(dueDate: DateTime): DateTime {
  let day = getEffectiveDueDate(dueDate).minus({ days: 1 });
  while (!isBankingDay(day)) day = day.minus({ days: 1 });
  return day.set({ hour: DELETION_DEADLINE_HOUR });
}

/**
 * Whether a cancellation made now can still stop the claim: it has to be in time for one of the
 * scheduled runs before the deadline
 */
export function canRequestDeletion(dueDate: string, now: DateTime): boolean {
  const deadline = getDeletionDeadline(DateTime.fromISO(dueDate, { zone: OSLO }));
  return now < deadline.set({ hour: LAST_DELETION_RUN_HOUR });
}

/**
 * Whether a deletion request can still be sent now and arrive before the deadline
 */
export function canSendDeletion(dueDate: string, now: DateTime): boolean {
  const deadline = getDeletionDeadline(DateTime.fromISO(dueDate, { zone: OSLO }));
  return now < deadline.minus({ minutes: DELETION_SEND_MARGIN_MINUTES });
}

/**
 * Splits a cancelled agreement's upcoming claims into those we can still delete and those that will
 * be charged anyway
 */
export function partitionChargesForDeletion<T extends { dueDate: string }>(
  charges: T[],
  now: DateTime,
): { deletable: T[]; tooLate: T[] } {
  const deletable: T[] = [];
  const tooLate: T[] = [];
  for (const charge of charges) {
    (canRequestDeletion(charge.dueDate, now) ? deletable : tooLate).push(charge);
  }
  return { deletable, tooLate };
}

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

  // A KID can have more than one active agreement row (older double submissions from the
  // widget). It is claimed once, with its most recent row (the highest id).
  const latestIdByKID = new Map<string, number>();
  for (const agreement of agreements) {
    const latest = latestIdByKID.get(agreement.KID);
    if (latest === undefined || agreement.id > latest)
      latestIdByKID.set(agreement.KID, agreement.id);
  }

  for (const agreement of agreements) {
    // Also guards against the same KID appearing twice in the agreements passed in
    if (
      claimedKIDs.has(agreement.KID) ||
      seenKIDs.has(agreement.KID) ||
      agreement.id !== latestIdByKID.get(agreement.KID)
    ) {
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
