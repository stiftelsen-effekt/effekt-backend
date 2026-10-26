import { DAO } from "../DAO";
import sqlString from "sqlstring";

export type ImportLogSummary = {
  ID: number;
  label: string | null;
  timestamp: Date | null;
  /** Human-readable summary of known result shapes, empty string otherwise */
  meta: string | null;
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
async function getEntries(
  limit = 10,
  offset = 0,
  filesearch: string | null = null,
): Promise<{ results: ImportLogSummary[]; pages: number }> {
  const where =
    filesearch !== null && filesearch !== ""
      ? 'WHERE JSON_EXTRACT(result, "$.file") LIKE ' + sqlString.escape("%" + filesearch + "%")
      : "";

  let [res] = await DAO.query<ImportLogSummary[]>(
    `
      SELECT 
        ID, label, timestamp,
        (CASE 
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
        END) as meta
      
      FROM Import_logs 

      ${where}
      
      ORDER BY timestamp DESC 
      LIMIT ? 
      OFFSET ?`,
    [limit, offset],
  );

  // Same filter as above, so the page count matches the filtered entries
  let [counter] = await DAO.query<{ count: number }[]>(`
      SELECT COUNT(*) as count FROM Import_logs ${where}
    `);

  const pages = Math.ceil(counter[0].count / limit);

  return {
    results: res,
    pages,
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
      SELECT *
      
      FROM Import_logs
      
      WHERE ID = ?`,
    [id],
  );

  if (res.length > 0) return res[0];
  else return null;
}

/**
 * Fetches the file contents of an AutoGiro shipment
 * @param id
 * @returns
 */
async function getAutoGiroShipmentFile(id: number) {
  let [res] = await DAO.query(
    `
    SELECT 
      JSON_EXTRACT(result, '$.file') as fileContents,
      JSON_EXTRACT(result, '$.filename') as filename
      
    FROM Import_logs
    WHERE label = "AutoGiro" AND JSON_EXTRACT(result, '$.shipmentID') = ?`,
    [id],
  );

  if (res.length > 0) return res[0];
  else return null;
}
//endregion

//region Add
/**
 * Adds a log entry.
 * @param {string} label
 * @param {object} result Results stored as JSON in DB
 */
async function add(label, result) {
  await DAO.execute(
    `INSERT INTO Import_logs
          (label, result) 
          VALUES 
          (?,?)`,
    [label, JSON.stringify(result)],
  );
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
  getAutoGiroShipmentFile,
};
