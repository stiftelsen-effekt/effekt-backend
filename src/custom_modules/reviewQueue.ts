/**
 * Turns the invalid transactions of a report import into manual review items and queues them
 * (Review_queue_items). Shared by the REST report routes, the tRPC uploads and the scheduled
 * OCR import.
 */
import { DateTime } from "luxon";
import moment from "moment";
import { DAO } from "./DAO";
import type { ReviewQueueSource } from "./DAO_modules/reviewqueue";

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

/**
 * Normalises an invalid transaction. AutoGiro amounts are in öre; review items are in whole
 * currency like the other sources.
 */
export const toReviewItem = (
  source: ReviewQueueSource,
  { reason, transaction: t }: SourceInvalidTransaction,
): ManualReviewItem => ({
  reason: reason ?? "Unknown error",
  transaction: {
    KID: t.KID == null ? null : String(t.KID),
    amount: source === "autogiro" ? t.amount / 100 : t.amount,
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
};

/**
 * Queues the invalid transactions of an import. Never throws: the donations of the import are
 * already registered, so a failure here is logged and reported as null instead of failing the
 * import.
 */
export async function enqueueInvalidTransactions(
  source: ReviewQueueSource,
  invalidTransactions: SourceInvalidTransaction[],
  importLogId: number | null = null,
): Promise<EnqueueResult | null> {
  if (invalidTransactions.length === 0) return { added: 0, existing: 0 };
  try {
    const items = invalidTransactions.map((invalid) => {
      const { reason, transaction } = toReviewItem(source, invalid);
      return {
        reason,
        KID: transaction.KID,
        amount: Math.round(transaction.amount * 100) / 100,
        date: transaction.date ? new Date(transaction.date) : null,
        externalId: transaction.transactionID ? String(transaction.transactionID) : null,
        paymentId: transaction.paymentID,
        message: transaction.message,
        name: transaction.name,
        location: transaction.location,
        raw: invalid.transaction,
      };
    });
    return await DAO.reviewqueue.add(source, items, importLogId);
  } catch (ex) {
    console.error(
      `Failed to queue ${invalidTransactions.length} ${source} transactions for review`,
    );
    console.error(ex);
    return null;
  }
}
