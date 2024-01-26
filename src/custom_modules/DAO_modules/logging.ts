import { DAO } from "../DAO";
import sqlString from "sqlstring";

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
async function getEntries(limit = 10, offset = 0, filesearch = null) {
  /**
   * TODO: Add filtering
   */
  let [res] = await DAO.query(
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

      ${
        filesearch !== null && filesearch !== ""
          ? 'WHERE JSON_EXTRACT(result, "$.file") LIKE ' + sqlString.escape("%" + filesearch + "%")
          : ""
      }
      
      ORDER BY timestamp DESC 
      LIMIT ? 
      OFFSET ?`,
    [limit, offset],
  );

  let [counter] = await DAO.query(`
      SELECT COUNT(*) as count FROM Import_logs 
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
async function get(id) {
  let [res] = await DAO.query(
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
    SELECT JSON_EXTRACT(result, '$.file') as fileContents FROM Import_logs
    WHERE label = "AutoGiro" AND JSON_EXTRACT(result, '$.shipmentID') = ?`,
    [id],
  );

  if (res.length > 0) return res[0].fileContents;
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
