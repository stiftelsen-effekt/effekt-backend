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

/**
 * Add a new vipps recurring donation agreement
 * @param {string} agreementId Provided by vipps
 * @param {number} donorId The Donor the agreement concerns
 * @param {number} KID The KID used for recurring payments
 * @param {number} sum The SUM used for recurring payments (in NOK)
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status Whether the agreement has been activated. Defaults to false
 * @return {boolean} Success or not
 */
async function addAgreement(ID, donorId, KID, sum, status = "PENDING") {
    let con = await pool.getConnection()
    try {
        con.query(`
            INSERT INTO Vipps_agreements
                (ID, KID, donorID, sum, status)
            VALUES
                (?,?,?,?,?)`, 
            [ID, donorId, KID, sum, status])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}
//endregion

//region Modify
/**
 * Adds a Vipps order transaction status
 * @param {string} orderId
 * @param {Array<VippsTransactionLogItem>} transactionHistory
 * @return {boolean} Success or not
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

        await pool.commitTransaction(transaction)

        return true
    }
    catch(ex) {
        await pool.rollbackTransaction(transaction)
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

/**
 * Updates agreement status
 * @param {string} id The agreement ID
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status 
 * @return {boolean} Success
 */
async function updateAgreementStatus(id, status) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET status = ? WHERE ID = ?`, [status, id])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
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
    addAgreement,
    updateOrderTransactionStatusHistory,
    updateVippsOrderDonation,
    updateAgreementStatus,

    setup: (dbPool) => { pool = dbPool }
}