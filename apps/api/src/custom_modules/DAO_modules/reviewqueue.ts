import type { ResultSetHeader } from "mysql2";
import { DAO } from "../DAO";
import { dbClockColumn } from "../osloDays";

/**
 * Review_queue_items: transactions from payment reports that could not be registered
 * automatically, shared by all admins. See custom_modules/reviewQueue.ts for how report
 * results are turned into items.
 */

/** "autogiro" (Sweden, discontinued) is kept so existing items still read; nothing adds new ones */
export const reviewQueueSources = ["ocr", "vipps", "bankNo", "bankSe", "autogiro"] as const;
export type ReviewQueueSource = (typeof reviewQueueSources)[number];

export const reviewQueueStatuses = ["open", "registered", "ignored"] as const;
export type ReviewQueueStatus = (typeof reviewQueueStatuses)[number];

export type ReviewQueueStatusCounts = Record<ReviewQueueStatus, number>;

export type NewReviewQueueItem = {
  reason: string;
  KID: string | null;
  /** Whole currency units (NOK/SEK), at most two decimals */
  amount: number;
  date: Date | null;
  /** Transaction id in the source; items with the same source and id are only queued once */
  externalId: string | null;
  paymentId: number;
  message: string | null;
  name: string | null;
  location: string | null;
  /** The transaction as the parser produced it */
  raw: unknown;
};

export type ReviewQueueItem = {
  id: number;
  source: ReviewQueueSource;
  reason: string;
  KID: string | null;
  /** Decimal string in whole currency units, e.g. "250.00" */
  amount: string;
  /** When the transaction happened, as read from the report */
  date: Date | null;
  externalId: string | null;
  /** Payment method the donation is registered with */
  paymentId: number;
  message: string | null;
  /** Payer name (Vipps) or donor name (Swedish bank) */
  name: string | null;
  /** Vipps sales location */
  location: string | null;
  /** The import log entry (Import_logs) of the import that queued the item */
  importLogId: number | null;
  /**
   * Data owner chosen when the report was uploaded through tRPC; null for the default owner and
   * for items from REST uploads and the scheduled import
   */
  metaOwnerId: number | null;
  status: ReviewQueueStatus;
  /** Admin (JWT email or subject) who registered or ignored the item */
  resolvedBy: string | null;
  resolvedAt: Date | null;
  note: string | null;
  /** The donation registered from the item; null if none or if it was deleted */
  donationId: number | null;
  created: Date;
};

export type ReviewQueueItemWithRaw = ReviewQueueItem & { raw: unknown };

export type ReviewQueueSortColumn = "id" | "created" | "date" | "amount" | "source" | "status";

const sortColumns: Record<ReviewQueueSortColumn, string> = {
  id: "ID",
  // Qualified, so it sorts by the column (indexed) rather than the converted `created` alias
  created: "Review_queue_items.Created",
  date: "Transaction_date",
  amount: "Amount",
  source: "Source",
  status: "Status",
};

const itemColumns = `
  ID AS id,
  Source AS source,
  Reason AS reason,
  KID,
  Amount AS amount,
  Transaction_date AS date,
  External_ID AS externalId,
  Payment_ID AS paymentId,
  Message AS message,
  Payer_name AS name,
  Location AS location,
  Import_log_ID AS importLogId,
  Meta_owner_ID AS metaOwnerId,
  Status AS status,
  Resolved_by AS resolvedBy,
  ${dbClockColumn("Resolved_at", "resolvedAt")},
  Note AS note,
  Donation_ID AS donationId,
  ${dbClockColumn("Created", "created")}`;

const emptyCounts = (): ReviewQueueStatusCounts => ({ open: 0, registered: 0, ignored: 0 });

/** Truncates to the column length, so one long value doesn't fail the whole batch insert */
const fit = (value: string | null, length: number) =>
  value === null ? null : value.length > length ? value.slice(0, length) : value;

const toJson = (value: unknown): string | null => {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
};

//region Add

/**
 * Queues items from one source. Items whose external id is already queued for the source (from
 * an earlier upload of the same file, whatever their status) are skipped.
 */
async function add(
  source: ReviewQueueSource,
  items: NewReviewQueueItem[],
  importLogId: number | null = null,
  metaOwnerId: number | null = null,
): Promise<{ added: number; existing: number }> {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (item.externalId === null) return true;
    const externalId = fit(item.externalId, 64)!;
    if (seen.has(externalId)) return false;
    seen.add(externalId);
    return true;
  });

  const externalIds = [...seen];
  const queued = new Set<string>();
  if (externalIds.length > 0) {
    const [rows] = await DAO.query<{ External_ID: string }[]>(
      `SELECT External_ID FROM Review_queue_items WHERE Source = ? AND External_ID IN (?)`,
      [source, externalIds],
    );
    for (const row of rows) queued.add(row.External_ID);
  }

  const toInsert = unique.filter(
    (item) => item.externalId === null || !queued.has(fit(item.externalId, 64)!),
  );

  if (toInsert.length > 0) {
    const values = toInsert.map((item) => [
      source,
      item.reason,
      fit(item.KID, 64),
      item.amount.toFixed(2),
      item.date,
      fit(item.externalId, 64),
      item.paymentId,
      item.message,
      fit(item.name, 255),
      fit(item.location, 255),
      toJson(item.raw),
      importLogId,
      metaOwnerId,
    ]);
    // A concurrent upload of the same file may have queued an item since the check above
    await DAO.query(
      `INSERT INTO Review_queue_items
        (Source, Reason, KID, Amount, Transaction_date, External_ID, Payment_ID, Message,
         Payer_name, Location, Raw, Import_log_ID, Meta_owner_ID)
       VALUES ?
       ON DUPLICATE KEY UPDATE ID = ID`,
      [values],
    );
  }

  return { added: toInsert.length, existing: items.length - toInsert.length };
}

//endregion

//region Get

async function getById(id: number): Promise<ReviewQueueItemWithRaw | null> {
  const [rows] = await DAO.query<ReviewQueueItemWithRaw[]>(
    `SELECT ${itemColumns}, Raw AS raw FROM Review_queue_items WHERE ID = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function getList(options: {
  page: number;
  limit: number;
  statuses?: ReviewQueueStatus[];
  sources?: ReviewQueueSource[];
  sort: { id: ReviewQueueSortColumn; desc: boolean };
}): Promise<{
  rows: ReviewQueueItem[];
  total: number;
  pages: number;
  /** Items per status, with the source filter applied but not the status filter */
  counts: ReviewQueueStatusCounts;
}> {
  const sourceClause = options.sources?.length ? "Source IN (?)" : "1";
  const sourceParams = options.sources?.length ? [options.sources] : [];
  const statusClause = options.statuses?.length ? "Status IN (?)" : "1";
  const statusParams = options.statuses?.length ? [options.statuses] : [];
  const where = `WHERE ${sourceClause} AND ${statusClause}`;
  const params = [...sourceParams, ...statusParams];

  const direction = options.sort.desc ? "DESC" : "ASC";
  const [rows] = await DAO.query<ReviewQueueItem[]>(
    `SELECT ${itemColumns}
     FROM Review_queue_items
     ${where}
     ORDER BY ${sortColumns[options.sort.id]} ${direction}, ID ${direction}
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.page * options.limit],
  );

  const [[{ total }]] = await DAO.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM Review_queue_items ${where}`,
    params,
  );

  const [countRows] = await DAO.query<{ status: string; count: number }[]>(
    `SELECT Status AS status, COUNT(*) AS count
     FROM Review_queue_items
     WHERE ${sourceClause}
     GROUP BY Status`,
    sourceParams,
  );

  return {
    rows,
    total: Number(total),
    pages: Math.ceil(Number(total) / options.limit),
    counts: toCounts(countRows),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Items whose id equals the query (when it is a number), or whose KID, external id, payer name
 * or message contains it. An exact id match comes first, then open items, then the newest.
 */
async function search(query: string, limit: number): Promise<ReviewQueueItem[]> {
  const pattern = `%${escapeLike(query)}%`;
  const id = /^\d+$/.test(query) && query.length <= 10 ? Number(query) : null;
  const [rows] = await DAO.query<ReviewQueueItem[]>(
    `SELECT ${itemColumns}
     FROM Review_queue_items
     WHERE ID = ? OR KID LIKE ? OR External_ID LIKE ? OR Payer_name LIKE ? OR Message LIKE ?
     ORDER BY ID = ? DESC, Status = 'open' DESC, ID DESC
     LIMIT ?`,
    [id, pattern, pattern, pattern, pattern, id, limit],
  );
  return rows;
}

/** Items per status across all sources */
async function getCounts(): Promise<ReviewQueueStatusCounts> {
  const [rows] = await DAO.query<{ status: string; count: number }[]>(
    `SELECT Status AS status, COUNT(*) AS count FROM Review_queue_items GROUP BY Status`,
  );
  return toCounts(rows);
}

/**
 * Items per status among the given transactions of one source: those with one of the external
 * ids, plus (with an import log id) the items without external id queued by that import. Tells
 * an upload how many of its transactions are still open and how many were already handled.
 */
async function getCountsForImport(
  source: ReviewQueueSource,
  externalIds: string[],
  importLogId: number | null,
): Promise<ReviewQueueStatusCounts> {
  const ids = [...new Set(externalIds.map((id) => fit(id, 64)!))];
  const conditions: string[] = [];
  const params: unknown[] = [source];
  if (ids.length > 0) {
    conditions.push("External_ID IN (?)");
    params.push(ids);
  }
  if (importLogId !== null) {
    conditions.push("(External_ID IS NULL AND Import_log_ID = ?)");
    params.push(importLogId);
  }
  if (conditions.length === 0) return emptyCounts();
  const [rows] = await DAO.query<{ status: string; count: number }[]>(
    `SELECT Status AS status, COUNT(*) AS count FROM Review_queue_items
     WHERE Source = ? AND (${conditions.join(" OR ")})
     GROUP BY Status`,
    params,
  );
  return toCounts(rows);
}

const toCounts = (rows: { status: string; count: number }[]) => {
  const counts = emptyCounts();
  for (const row of rows) {
    if ((reviewQueueStatuses as readonly string[]).includes(row.status)) {
      counts[row.status as ReviewQueueStatus] = Number(row.count);
    }
  }
  return counts;
};

//endregion

//region Modify

const affected = (result: ResultSetHeader) => result.affectedRows === 1;

/**
 * Marks an open item as registered before its donation is created, so two admins can't
 * register the same item. Returns false if the item isn't open.
 */
async function claimForRegistration(id: number, resolvedBy: string): Promise<boolean> {
  const [result] = await DAO.query<ResultSetHeader>(
    `UPDATE Review_queue_items
     SET Status = 'registered', Resolved_by = ?, Resolved_at = NOW(), Donation_ID = NULL
     WHERE ID = ? AND Status = 'open'`,
    [resolvedBy, id],
  );
  return affected(result);
}

/** Undoes claimForRegistration when registering the donation failed */
async function releaseRegistrationClaim(id: number): Promise<void> {
  await DAO.query(
    `UPDATE Review_queue_items
     SET Status = 'open', Resolved_by = NULL, Resolved_at = NULL, Note = NULL
     WHERE ID = ? AND Status = 'registered' AND Donation_ID IS NULL`,
    [id],
  );
}

async function setDonation(id: number, donationId: number): Promise<void> {
  await DAO.query(
    `UPDATE Review_queue_items SET Status = 'registered', Donation_ID = ? WHERE ID = ?`,
    [donationId, id],
  );
}

/** Returns false if the item isn't open */
async function ignore(id: number, resolvedBy: string, note: string | null): Promise<boolean> {
  const [result] = await DAO.query<ResultSetHeader>(
    `UPDATE Review_queue_items
     SET Status = 'ignored', Resolved_by = ?, Resolved_at = NOW(), Note = ?
     WHERE ID = ? AND Status = 'open'`,
    [resolvedBy, note, id],
  );
  return affected(result);
}

/**
 * Ignores the given items in one statement, e.g. after a wrong upload. Items that aren't open
 * (already registered or ignored, perhaps by someone else meanwhile) are left alone. Returns how
 * many were ignored.
 */
async function ignoreMany(ids: number[], resolvedBy: string, note: string | null): Promise<number> {
  if (ids.length === 0) return 0;
  const [result] = await DAO.query<ResultSetHeader>(
    `UPDATE Review_queue_items
     SET Status = 'ignored', Resolved_by = ?, Resolved_at = NOW(), Note = ?
     WHERE ID IN (?) AND Status = 'open'`,
    [resolvedBy, note, ids],
  );
  return result.affectedRows;
}

/** Ignores every open item queued by one import (all pages). Returns how many were ignored. */
async function ignoreImport(
  importLogId: number,
  resolvedBy: string,
  note: string | null,
): Promise<number> {
  const [result] = await DAO.query<ResultSetHeader>(
    `UPDATE Review_queue_items
     SET Status = 'ignored', Resolved_by = ?, Resolved_at = NOW(), Note = ?
     WHERE Import_log_ID = ? AND Status = 'open'`,
    [resolvedBy, note, importLogId],
  );
  return result.affectedRows;
}

/** How many items from one import are still open */
async function getOpenCountForImport(importLogId: number): Promise<number> {
  const [[{ count }]] = await DAO.query<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM Review_queue_items WHERE Import_log_ID = ? AND Status = 'open'`,
    [importLogId],
  );
  return Number(count);
}

/**
 * Reopens an ignored item, or a registered one whose donation has since been deleted, clearing
 * who resolved it and the ignore note. Returns false otherwise (open items, and registered
 * items whose donation still exists).
 */
async function reopen(id: number): Promise<boolean> {
  const [result] = await DAO.query<ResultSetHeader>(
    `UPDATE Review_queue_items
     SET Status = 'open', Resolved_by = NULL, Resolved_at = NULL, Note = NULL
     WHERE ID = ? AND (Status = 'ignored' OR (Status = 'registered' AND Donation_ID IS NULL))`,
    [id],
  );
  return affected(result);
}

//endregion

export const reviewqueue = {
  add,
  getById,
  getList,
  search,
  getCounts,
  getCountsForImport,
  claimForRegistration,
  releaseRegistrationClaim,
  setDonation,
  ignore,
  ignoreMany,
  ignoreImport,
  getOpenCountForImport,
  reopen,
};
