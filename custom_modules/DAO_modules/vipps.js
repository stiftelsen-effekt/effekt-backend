var con

//region Get

/**
 * @typedef VippsToken
 * @property {number} ID
 * @property {Date} expires
 * @property {string} type
 * @property {string} token
 */

 /**
  * Fetches the latest token, if available
  * @returns {VippsToken | boolean} The most recent vipps token, false if expiration is within 10 minutes
  */
async function getLatestToken() {
    let [res] = await con.query(`
        SELECT * FROM Vipps_token
            ORDER BY expires DESC
            LIMIT 1`)

    if (res.length == 0) return false
    if (res[0].expires - Date.now() < 10*60*1000) return false

    return ({
        ID: res[0].ID,
        expires: res[0].expires,
        type: res[0].type,
        token: res[0].token
    })
}

//endregion

//region Add

/**
 * Adds a Vipps access token
 * @param {VippsToken} token Does not need to have ID specified
 * @return {number} token ID in database
 */
async function addToken(token) {
    let [result] = await con.query(`
        INSERT INTO Vipps_token
            (expires, type, token)
            VALUES
            (?,?,?)
    `, [token.expires, token.type, token.token])

    return result.insertId
}
//endregion

//region Modify

//endregion

//region Delete

//endregion

//Helpers

module.exports = {
    getLatestToken,
    addToken,

    setup: (dbPool) => { con = dbPool }
}