/**
 * Turns the invalid transactions of a report import into manual review items and queues them
 * (Review_queue_items). Shared by the REST report routes, the tRPC uploads and the scheduled
 * OCR import.
 */
import { DateTime } from "luxon";
import moment from "moment";
import { DAO } from "./DAO";
import type {
  NewReviewQueueItem,
  ReviewQueueSource,
  ReviewQueueStatusCounts,
} from "./DAO_modules/reviewqueue";

/**
 * A transaction from an uploaded report that could not be registered automatically.
 * Normalised across report sources.
 */
export type ManualReviewTransaction = {
  KID: string | null;
  /** In whole currency units (NOK/SEK), like the donation that would be registered */
  amount: number;
  /** ISO 8601 */
  date: string | null;
  transactionID: string;
  /** Payment method ID to register the donation with */
  paymentID: number;
  message: string | null;
  /** Payer name (Vipps) or donor name (Swedish bank) */
  name: string | null;
  /** Vipps sales location */
  location: string | null;
};

export type ManualReviewItem = { reason: string; transaction: ManualReviewTransaction };

type DateLike = Date | moment.Moment | DateTime | null | undefined;

/** Same string the REST routes produce when JSON-serialising these dates */
export const toIso = (date: DateLike): string | null => {
  if (date == null) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date.toISOString();
  if (DateTime.isDateTime(date)) return date.toISO();
  return date.isValid() ? date.toISOString() : null;
};

/** An invalid transaction as the report processing functions return it */
export type SourceTransaction = {
  KID?: string | number | null;
  amount: number;
  date?: DateLike;
  transactionID: string;
  paymentID?: number;
  paymentMethod?: number;
  message?: string | null;
  name?: string | null;
  donorName?: string | null;
  location?: string | null;
};

export type SourceInvalidTransaction = {
  reason: string | undefined;
  transaction: SourceTransaction;
};

/** Normalises an invalid transaction from a report into a review item */
export const toReviewItem = (
  source: ReviewQueueSource,
  { reason, transaction: t }: SourceInvalidTransaction,
): ManualReviewItem => ({
  reason: reason ?? "Unknown error",
  transaction: {
    KID: t.KID == null ? null : String(t.KID),
    amount: t.amount,
    date: toIso(t.date),
    transactionID: t.transactionID,
    // OCR transactions carry the payment method as `paymentMethod`
    paymentID: (t.paymentID ?? t.paymentMethod)!,
    message: t.message ?? null,
    name: t.name ?? t.donorName ?? null,
    location: t.location ?? null,
  },
});

export type EnqueueResult = {
  /** Items added to the queue */
  added: number;
  /** Items already in the queue from an earlier import of the same transactions */
  existing: number;
  /**
   * Transactions that could not be queued: no usable amount or payment method, or the insert
   * failed. They are listed in the upload result and the import log, but not in the queue.
   */
  skipped: number;
  /**
   * The file's queued transactions by their status now, including ones queued by an earlier
   * upload and since registered or ignored ("N new, M already handled"). Null if they couldn't
   * be counted.
   */
  statuses: ReviewQueueStatusCounts | null;
};

/**
 * Turns an invalid transaction into a queue row, or null if it can't be queued (the amount or
 * payment method is missing or not a number). An unreadable date is queued as null.
 */
const toQueueRow = (
  source: ReviewQueueSource,
  invalid: SourceInvalidTransaction,
): NewReviewQueueItem | null => {
  let item: ManualReviewItem;
  try {
    item = toReviewItem(source, invalid);
  } catch {
    return null;
  }
  const { reason, transaction } = item;
  const amount = Number(transaction.amount);
  const paymentId = Number(transaction.paymentID);
  if (!Number.isFinite(amount) || !Number.isInteger(paymentId) || paymentId <= 0) return null;
  const date = transaction.date ? new Date(transaction.date) : null;
  return {
    reason,
    KID: transaction.KID,
    amount: Math.round(amount * 100) / 100,
    date: date && !isNaN(date.getTime()) ? date : null,
    externalId: transaction.transactionID ? String(transaction.transactionID) : null,
    paymentId,
    message: transaction.message,
    name: transaction.name,
    location: transaction.location,
    raw: invalid.transaction,
  };
};

/** Statuses of an import's queue items; null (logged) if they can't be read */
async function countStatuses(
  source: ReviewQueueSource,
  items: NewReviewQueueItem[],
  importLogId: number | null,
): Promise<ReviewQueueStatusCounts | null> {
  try {
    const externalIds = items.flatMap((item) =>
      item.externalId === null ? [] : [item.externalId],
    );
    return await DAO.reviewqueue.getCountsForImport(source, externalIds, importLogId);
  } catch (ex) {
    console.error(`Failed to count the queued ${source} transactions`);
    console.error(ex);
    return null;
  }
}

/**
 * Queues the invalid transactions of an import, linked to its import log entry and with the data
 * owner chosen for the import (null: the default owner). Transactions that can't be queued are
 * skipped and counted; if the batch insert fails, the rows are inserted one by one so one bad
 * row doesn't lose the others. Never throws: the donations of the import are already
 * registered, so an unexpected failure is logged and reported as null instead of failing the
 * import.
 */
export async function enqueueInvalidTransactions(
  source: ReviewQueueSource,
  invalidTransactions: SourceInvalidTransaction[],
  importLogId: number | null = null,
  metaOwnerId: number | null = null,
): Promise<EnqueueResult | null> {
  if (invalidTransactions.length === 0) {
    return { added: 0, existing: 0, skipped: 0, statuses: { open: 0, registered: 0, ignored: 0 } };
  }
  try {
    const rows = invalidTransactions.map((invalid) => toQueueRow(source, invalid));
    const items = rows.filter((row): row is NewReviewQueueItem => row !== null);
    const result = { added: 0, existing: 0, skipped: rows.length - items.length };

    if (items.length > 0) {
      try {
        const added = await DAO.reviewqueue.add(source, items, importLogId, metaOwnerId);
        result.added = added.added;
        result.existing = added.existing;
      } catch (ex) {
        console.error(
          `Failed to queue ${items.length} ${source} transactions at once, retrying one by one`,
        );
        console.error(ex);
        for (const item of items) {
          try {
            const one = await DAO.reviewqueue.add(source, [item], importLogId, metaOwnerId);
            result.added += one.added;
            result.existing += one.existing;
          } catch (ex) {
            console.error(`Failed to queue a ${source} transaction for review`);
            console.error(ex);
            result.skipped++;
          }
        }
      }
    }

    return { ...result, statuses: await countStatuses(source, items, importLogId) };
  } catch (ex) {
    console.error(
      `Failed to queue ${invalidTransactions.length} ${source} transactions for review`,
    );
    console.error(ex);
    return null;
  }
}
