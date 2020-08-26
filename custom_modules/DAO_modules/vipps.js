var pool

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
 * @property {number} donationID
 * @property {string} KID
 * @property {string} token
 * @property {Date} registered
 */

/**
 * @typedef VippsTransactionLogItem
 * @property {number} amount In øre
 * @property {string} transactionText
 * @property {number} transactionId
 * @property {string} timestamp JSON timestamp
 * @property {string} operation
 * @property {number} requestId 
 * @property {boolean} operationSuccess
 */    

 /**
  * Fetches the latest token, if available
  * @returns {VippsToken | boolean} The most recent vipps token, false if expiration is within 10 minutes
  */
async function getLatestToken() {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM Vipps_tokens
            ORDER BY expires DESC
            LIMIT 1`)
    con.release()

    if (res.length === 0) return false
    if (res[0].expires - Date.now() < 10*60*1000) return false

    return ({
        ID: res[0].ID,
        expires: res[0].expires,
        type: res[0].type,
        token: res[0].token
    })
}

/**
 * Fetches a vipps order
 * @property {string} orderID
 * @return {VippsOrder | false} 
 */
async function getOrder(orderID) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM Vipps_orders
            WHERE
                orderID = ?
            LIMIT 1`, [orderID])
    con.release()
    
    if (res.length === 0) return false
    else return res[0]
}

/**
 * Fetches the most recent vipps order
 * @return {VippsOrder | false} 
 */
async function getRecentOrder() {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM Vipps_orders
            ORDER BY 
                registered DESC
            LIMIT 1`)
    con.release()
    
    if (res.length === 0) return false
    else return res[0]
}

//endregion

//region Add

/**
 * Adds a Vipps access token
 * @param {VippsToken} token Does not need to have ID specified
 * @return {number} token ID in database
 */
async function addToken(token) {
    let con = await pool.getConnection()
    let [result] = await con.query(`
        INSERT INTO Vipps_tokens
            (expires, type, token)
            VALUES
            (?,?,?)
    `, [token.expires, token.type, token.token])
    con.release()

    return result.insertId
}

/**
 * Adds a Vipps order
 * @param {VippsOrder} order
 * @return {number} ID of inserted order
 */
async function addOrder(order) {
    let con = await pool.getConnection()
    let [result] = await con.query(`
            INSERT INTO Vipps_orders
                    (orderID, donorID, KID, token)
                    VALUES
                    (?,?,?,?)
        `, [order.orderID, order.donorID, order.KID, order.token])
    con.release()

    return result.insertId
}
//endregion

//region Modify
/**
 * Adds a Vipps order transaction status
 * @param {string} orderId
 * @param {Array<VippsTransactionLogItem>} transactionHistory
 * @return {boolean} Success
 */
async function updateOrderTransactionStatusHistory(orderId,transactionHistory) {
    let transaction = await pool.startTransaction()
    try {
        await transaction.query(`DELETE FROM Vipps_order_transaction_statuses WHERE orderID = ?`, [orderId])

        const mappedInsertValues = transactionHistory.map((logItem) => ([orderId, logItem.transactionId, logItem.amount, logItem.operation, logItem.timeStamp, logItem.operationSuccess]))

        await transaction.query(`
            INSERT INTO Vipps_order_transaction_statuses
                    (orderID, transactionID, amount, operation, timestamp, success)
                    VALUES
                    ?
        `, [mappedInsertValues])

        await con.commitTransaction(transaction)

        return true
    }
    catch(ex) {
        await con.rollbackTransaction(transaction)
        console.error(`Failed to update order transaction history for orderId ${orderId}`,ex)
        return false
    }
}

/**
 * Updates the donationID associated with a vipps order
 * @param {string} orderID
 * @param {number} donationID
 * @return {boolean} Success or failure
 */
async function updateVippsOrderDonation(orderID, donationID) {
    let con = await pool.getConnection()
    let [result] = await con.query(`
            UPDATE Vipps_orders
                SET donationID = ?
                WHERE orderID = ?
        `, [donationID, orderID])
    con.release()

    return (result.affectedRows != 0 ? true : false)
}
//endregion

//region Delete

//endregion

//Helpers

module.exports = {
    getLatestToken,
    getOrder,
    getRecentOrder,
    addToken,
    addOrder,
    updateOrderTransactionStatusHistory,
    updateVippsOrderDonation,

    setup: (dbPool) => { pool = dbPool }
}