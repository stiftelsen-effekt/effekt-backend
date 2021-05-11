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
 * @typedef VippsAgreement
 * @property {number} ID
 * @property {number} donorID
 * @property {string} KID
 * @property {number} sum
 * @property {string} status
 * @property {number} chargeDayOfMonth
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

/**
 * Fetches all active agreements that are due to be charged on the specified date
 * @property {number} chargeDayOfMonth
 * @return {[VippsAgreement]} 
 */
 async function getActiveAgreementsByChargeDay(chargeDayOfMonth) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM 
            Vipps_agreements 
        WHERE 
            status = "ACTIVE" and chargeDayOfMonth = ?
        `, [chargeDayOfMonth])
    con.release()

    if (res.length === 0) return false
    else return res
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
 * Add a new Vipps recurring donation agreement
 * @param {string} agreementID Provided by vipps
 * @param {number} donorID The Donor the agreement concerns
 * @param {number} KID The KID used for recurring payments
 * @param {number} sum The SUM used for recurring payments (in NOK)
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status Whether the agreement has been activated. Defaults to false
 * @return {boolean} Success or not
 */
async function addAgreement(agreementID, donorID, KID, sum, status = "PENDING") {
    let con = await pool.getConnection()

    let chargeDayOfMonth = String(new Date().getDate()).padStart(2, '0');

    // Set all dates above 28th to 28th for a simple solution to support leap years
    if (chargeDayOfMonth > 28) chargeDayOfMonth = 28

    try {
        con.query(`
            INSERT INTO Vipps_agreements
                (ID, donorID, KID, sum, chargeDayOfMonth, status)
            VALUES
                (?,?,?,?,?,?)`, 
            [agreementID, donorID, KID, sum, chargeDayOfMonth, status])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Add a charge to an agreement
 * @param {string} agreementId Provided by vipps
 * @param {number} sum The amount of money for each charge
 * @param {number} KID The KID of the agreement
 * @param {Date} due Due date of the charge 
 * @param {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status The new status of the charge
 * @return {boolean} Success or not
 */
 async function addCharge(chargeID, agreementID, amount, dueDate, status = "PENDING") {
    let con = await pool.getConnection()
    try {
        con.query(`
            INSERT INTO Vipps_agreement_charges
                (chargeID, agreementId, amount, dueDate, status)
            VALUES
                (?,?,?,?,?)`, 
            [chargeID, agreementID, amount, dueDate, status])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        console.error("Error inserting charge")
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
 * Updates agreement price
 * @param {string} id The agreement ID
 * @param {number} price 
 * @return {boolean} Success
 */
 async function updateAgreementPrice(id, price) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET sum = ? WHERE ID = ?`, [price, id])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
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
    getActiveAgreementsByChargeDay,
    addToken,
    addOrder,
    addAgreement,
    addCharge,
    updateOrderTransactionStatusHistory,
    updateVippsOrderDonation,
    updateAgreementPrice,
    updateAgreementStatus,

    setup: (dbPool) => { pool = dbPool }
}