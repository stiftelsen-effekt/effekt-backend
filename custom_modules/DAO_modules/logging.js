const sqlString = require('sqlstring')

/**
 * @type {import('mysql2/promise').Pool}
 */
var pool

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
  try {
    var con = await pool.getConnection()

    let [res] = await con.query(`
      SELECT 
        ID, label, timestamp 
      
      FROM Import_logs 

      ${filesearch !== null ? "WHERE JSON_EXTRACT(result, \"$.file\") like '%" + sqlString.escape(filesearch) + "%'" : ""}
      
      ORDER BY timestamp DESC 
      LIMIT ? 
      OFFSET ?`, [limit, offset])

    let [counter] = await con.query(`
      SELECT COUNT(*) as count FROM Import_logs 
    `)

    const pages = Math.ceil(counter[0].count / limit)

    con.release()
    return {
      results: res,
      pages
    }
  }
  catch(ex) {
    con.release()
    throw ex
  }
}

/**
 * Fetches an entry in the import log with a given ID
 * @param {number} id 
 * @returns {ImportLogEntry}
 */
async function get(id) {
  try {
    var con = await pool.getConnection()

    let [res] = await con.query(`
      SELECT *
      
      FROM Import_logs
      
      WHERE ID = ?`, [id])

    con.release()

    if (res.length > 0)
      return res[0]
    else
      return null
  }
  catch(ex) {
    con.release()
    throw ex
  }
}
//endregion

//region Add
/**
 * Adds a log entry.
 * @param {string} label 
 * @param {object} result Results stored as JSON in DB
 */
async function add(label, result) {
  try {
    var con = await pool.getConnection()

    var res = await con.execute(
        `INSERT INTO Import_logs
          (label, result) 
          VALUES 
          (?,?)`, [label, JSON.stringify(result)])

    con.release()
    return(res.insertId)
  }catch(ex) {
    con.release()
    throw ex
  }
}
//endregion

//region Modify

//endregion

//region Delete

//endregion

//region Helpers

//endregion

module.exports = {
  add,
  get,
  getEntries,

  setup: (dbPool) => { pool = dbPool }
}