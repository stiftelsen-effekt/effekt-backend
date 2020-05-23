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
 * @typedef VippsOrder
 * @property {number} ID
 * @property {string} orderID
 * @property {number} donorID
 * @property {string} KID
 * @property {string} token
 * @property {Date} registered
 */

/**
 * @typedef VippsOrderTransactionStatus
 * @property {number} ID
 * @property {string} orderID
 * @property {string} transactionID
 * @property {number} amount
 * @property {string} status
 * @property {Date} timestamp
 */

 /**
  * Fetches the latest token, if available
  * @returns {VippsToken | boolean} The most recent vipps token, false if expiration is within 10 minutes
  */
async function getLatestToken() {
    let [res] = await con.query(`
        SELECT * FROM Vipps_tokens
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
        INSERT INTO Vipps_tokens
            (expires, type, token)
            VALUES
            (?,?,?)
    `, [token.expires, token.type, token.token])

    return result.insertId
}

/**
 * Adds a Vipps order
 * @param {VippsOrder} order
 * @return {number} ID of inserted order
 */
async function addOrder(order) {
    let [result] = await con.query(`
            INSERT INTO Vipps_orders
                    (orderID, donorID, KID, token)
                    VALUES
                    (?,?,?)
        `, [order.orderID, order.donorID, order.KID, order.token])

    return result.insertId
}

/**
 * Adds a Vipps order transaction status
 * @param {VippsOrderTransactionStatus} status
 * @return {number} ID of inserted order
 */
async function addOrderTransactionStatus(status) {
    let [result] = await con.query(`
            INSERT INTO Vipps_orders
                    (orderID, transactionID, amount, status, timestamp)
                    VALUES
                    (?,?,?,?,?)
        `, [status.orderID, status.transactionID, status.amount, status.status, status.timestamp])

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
    addOrder,
    addOrderTransactionStatus,

    setup: (dbPool) => { con = dbPool }
}