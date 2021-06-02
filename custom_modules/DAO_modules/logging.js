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
 * @returns {Array<ImportLogEntry>}
 */
async function getEntries(limit = 10, offset = 0) {
  /**
   * TODO: Add filtering
   */
  try {
    var con = await pool.getConnection()

    let [res] = await con.query(`
      SELECT 
        ID, label, timestamp 
      
      FROM EffektDonasjonDB_Dev.ImportLog 
      
      ORDER BY timestamp DESC 
      LIMIT ? 
      OFFSET ?`, [limit, offset])

    con.release()
    return res
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
      
      FROM EffektDonasjonDB_Dev.ImportLog 
      
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
        `INSERT INTO Avtalegiro_agreements 
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