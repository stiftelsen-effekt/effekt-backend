import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { DAO } from "../DAO";
import sqlString from "sqlstring";
import { dbClockColumn } from "../osloDays";
import { ocrFileKey, type OCRImportState } from "../ocrFiles";

export type ImportLogSummary = {
  ID: number;
  label: string | null;
  timestamp: Date | null;
  /** Human-readable summary of known result shapes, empty string otherwise */
  meta: string | null;
};

/** Fields of an upload entry's result (tRPC uploads), read with `uploadDetails` */
export type ImportLogUploadDetails = {
  /** reportsRouter upload source, e.g. "ocr", "bankNo" */
  uploadSource: string | null;
  filename: string | null;
  /** { valid, invalid, ignored? } as logged */
  donations: { valid?: number; invalid?: number; ignored?: number } | null;
  /** Transactions sent to review */
  reviewCount: number | null;
  /** Facebook uploads: campaigns without organization shares */
  campaignsMissingShares: number | null;
};

export type ImportLogEntry = {
  ID: number;
  label: string | null;
  /** The JSON result column, parsed by mysql2 */
  result: unknown;
  timestamp: Date | null;
};

/**
 * @typedef ImportLogEntry
 * @property {number} ID
 * @property {string} timestamp
 * @property {object} result
 * @property {Date} timestamp
 */

//region Get
/**
 * Gets import logs
 * @param {number} limit How many objects to return
 * @param {number} offset By which offset in db
 * @param {string} filesearch A string to fuzzy match in the file in the log entry
 * @returns {{ results: Array<ImportLogEntry>, pages: number }}
 */
export type ImportLogSortColumn = "timestamp" | "label" | "id";

// Qualified: unqualified `timestamp` would sort by the converted select alias, without the index
const logSortColumns: Record<ImportLogSortColumn, string> = {
  timestamp: "Import_logs.timestamp",
  label: "label",
  id: "ID",
};

async function getEntries(
  limit = 10,
  offset = 0,
  filesearch: string | null = null,
  /** Newest first when omitted (without the ID tie-break, as REST has always sorted) */
  sort?: { id: ImportLogSortColumn; desc: boolean },
  options: {
    /** filesearch also matches the uploaded file's name (`filename`) */
    searchFilename?: boolean;
    /** Adds the ImportLogUploadDetails columns */
    uploadDetails?: boolean;
  } = {},
): Promise<{ results: ImportLogSummary[]; pages: number; total: number }> {
  const orderBy = sort
    ? `${logSortColumns[sort.id]} ${sort.desc ? "DESC" : "ASC"}, ID ${sort.desc ? "DESC" : "ASC"}`
    : "Import_logs.timestamp DESC";

  const pattern = sqlString.escape("%" + filesearch + "%");
  const where =
    filesearch !== null && filesearch !== ""
      ? 'WHERE JSON_EXTRACT(result, "$.file") LIKE ' +
        pattern +
        (options.searchFilename
          ? ` OR JSON_UNQUOTE(JSON_EXTRACT(result, "$.filename")) LIKE ${pattern}`
          : "")
      : "";

  const uploadDetailColumns = options.uploadDetails
    ? `,
        JSON_UNQUOTE(JSON_EXTRACT(result, "$.upload.source")) AS uploadSource,
        JSON_UNQUOTE(JSON_EXTRACT(result, "$.filename")) AS filename,
        JSON_EXTRACT(result, "$.donations") AS donations,
        JSON_LENGTH(result, "$.invalidTransactions") AS reviewCount,
        JSON_EXTRACT(result, "$.campaigns.missingShares") AS campaignsMissingShares`
    : "";

  let [res] = await DAO.query<ImportLogSummary[]>(
    `
      SELECT 
        ID, label, ${dbClockColumn("Import_logs.timestamp")},
        (CASE 
          WHEN JSON_CONTAINS_PATH(result, 'one', '$.upload') THEN 
            CONCAT(
              "Upload [",
              " File: ", COALESCE(JSON_UNQUOTE(JSON_EXTRACT(result, "$.filename")), ''),
              " Added: ", COALESCE(JSON_EXTRACT(result, "$.donations.valid"), 0),
              " Invalid: ", COALESCE(JSON_EXTRACT(result, "$.donations.invalid"), 0),
              " ]"
            )
          WHEN JSON_CONTAINS_PATH(result, 'one', '$.addedDonations') THEN 
            CONCAT(
              "Donations [",
              " Added: ", JSON_EXTRACT(result, "$.addedDonations.valid"),
              " Invalid: ", JSON_EXTRACT(result, "$.addedDonations.invalid"),
              " ] Agreements [",
              " Activated: ", JSON_EXTRACT(result, "$.updatedAgreements.activated"),
              " Terminated: ", JSON_EXTRACT(result, "$.updatedAgreements.terminated"),
              " ]"
            )
          WHEN JSON_CONTAINS_PATH(result, 'one', '$.notifiedAgreements') THEN 
            CONCAT(
              "Notified [",
              " Success: ", JSON_EXTRACT(result, "$.notifiedAgreements.success"),
              " Failed: ", JSON_EXTRACT(result, "$.notifiedAgreements.failed"),
              " ]"
            )
          WHEN JSON_CONTAINS_PATH(result, 'one', '$.createdCharges') THEN 
            CONCAT(
              "Agreements [",
              " Charges: ", JSON_EXTRACT(result, "$.createdCharges"),
              " Active: ", JSON_EXTRACT(result, "$.activeAgreements"),
              " ]"
            )
          ELSE ''
        END) as meta${uploadDetailColumns}
      
      FROM Import_logs 

      ${where}
      
      ORDER BY ${orderBy} 
      LIMIT ? 
      OFFSET ?`,
    [limit, offset],
  );

  // Same filter as above, so the page count matches the filtered entries
  let [counter] = await DAO.query<{ count: number }[]>(`
      SELECT COUNT(*) as count FROM Import_logs ${where}
    `);

  const total = Number(counter[0].count);
  const pages = Math.ceil(total / limit);

  return {
    results: res,
    pages,
    total,
  };
}

/**
 * Fetches an entry in the import log with a given ID
 * @param {number} id
 * @returns {ImportLogEntry}
 */
async function get(id: number): Promise<ImportLogEntry | null> {
  let [res] = await DAO.query<ImportLogEntry[]>(
    `
      SELECT ID, label, result, ${dbClockColumn("Import_logs.timestamp")}
      
      FROM Import_logs
      
      WHERE ID = ?`,
    [id],
  );

  if (res.length > 0) return res[0];
  else return null;
}

//endregion

/**
 * What the OCR import has already imported: the files recorded (filename and fileModifyTime) in
 * its import logs over the last 400 days. See selectOCRFilesToImport.
 */
async function getOcrImportState(): Promise<OCRImportState> {
  const [rows] = await DAO.query<RowDataPacket[]>(
    `SELECT
        JSON_UNQUOTE(JSON_EXTRACT(result, '$.filename')) AS filename,
        JSON_EXTRACT(result, '$.fileModifyTime') AS modifyTime
      FROM Import_logs
      WHERE label = 'OCR'
        AND timestamp > NOW() - INTERVAL 400 DAY
        AND JSON_EXTRACT(result, '$.filename') IS NOT NULL`,
  );

  const imported = new Set<string>();
  let trackedSince: number | null = null;
  for (const row of rows) {
    const modifyTime = Number(row.modifyTime);
    if (!row.filename || !Number.isFinite(modifyTime)) continue;
    imported.add(ocrFileKey({ name: row.filename, modifyTime }));
    if (trackedSince === null || modifyTime < trackedSince) trackedSince = modifyTime;
  }
  return { imported, trackedSince };
}

//region Add
/**
 * Adds a log entry.
 * @param {string} label
 * @param {object} result Results stored as JSON in DB
 * @returns The id of the new entry
 */
async function add(label, result): Promise<number> {
  const [insert] = await DAO.execute<ResultSetHeader>(
    `INSERT INTO Import_logs
          (label, result) 
          VALUES 
          (?,?)`,
    [label, JSON.stringify(result)],
  );
  return insert.insertId;
}
//endregion

//region Modify

//endregion

//region Delete

//endregion

//region Helpers

//endregion

export const logging = {
  add,
  get,
  getEntries,
  getOcrImportState,
};
