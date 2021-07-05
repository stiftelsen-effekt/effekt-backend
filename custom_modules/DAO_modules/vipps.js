var pool
const sqlString = require('sqlstring')

// Valid states for Vipps recurring charges
const chargeStatuses = ["PENDING", "DUE", "CHARGED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED", "RESERVED", "CANCELLED", "PROCESSING"]

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
 * @property {string} ID
 * @property {number} donorID
 * @property {string} KID
 * @property {number} sum
 * @property {string} status
 * @property {number} monthly_charge_day
 * @property {string} agreement_url_code
 * @property {string} paused_until_date
 * @property {string} force_charge_date
 */

/**
 * @typedef AgreementCharge
 * @property {string} chargeID
 * @property {string} agreementID
 * @property {number} amount
 * @property {string} dueDate
 * @property {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status
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
 * Fetches an agreement by agreementId
 * @property {string} agreementID
 * @return {Agreement} 
 */
 async function getAgreement(agreementID) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT ID, status, donorID, KID, monthly_charge_day, force_charge_date, paused_until_date, amount FROM 
            Vipps_agreements
        WHERE 
            ID = ?
        `, [agreementID])
    con.release()

    if (res.length === 0) return false
    else return res[0]
}

/**
 * Fetches all agreements
 * @param {column: string, desc: boolean} sort Sort object
 * @param {string | number | Date} page Used for pagination
 * @param {number=10} limit Agreement count limit per page, defaults to 10
 * @param {object} filter Filtering object
 * @return {[Agreement]} Array of agreements
 */
 async function getAgreements(sort, page, limit, filter) {
    let con = await pool.getConnection()

    const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1]
    const sortDirection = sort.desc ? "DESC" : "ASC"
    const offset = page*limit

    let where = [];
    if (filter) {
        if (filter.amount) {
            if (filter.amount.from) where.push(`amount >= ${sqlString.escape(filter.amount.from)} `)
            if (filter.amount.to) where.push(`amount <= ${sqlString.escape(filter.amount.to)} `)
        }

        if (filter.KID) where.push(` CAST(KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `)
        if (filter.donor) where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `)
        if (filter.status) where.push(` (status LIKE ${sqlString.escape(`%${filter.status}%`)}) `)
    }

    const [agreements] = await con.query(`
        SELECT
            VA.ID,
            VA.status,
            VA.amount,
            VA.KID,
            VA.monthly_charge_day,
            VA.timestamp_created,
            Donors.full_name 
        FROM Vipps_agreements as VA
        INNER JOIN Donors 
            ON VA.donorID = Donors.ID
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
        `, [limit, offset])

    const [counter] = await con.query(`
        SELECT COUNT(*) as count FROM Vipps_agreements
    `)
    
    con.release()

    if (agreements.length === 0) return false
    else return {
        pages: Math.ceil(counter[0].count / limit),
        rows: agreements
    }
}

/**
 * Fetches an agreement ID by agreementUrlCode
 * @property {string} agreementUrlCode The code used in the Vipps merchantAgreementUrl
 * @return {string} agreementId 
 */
 async function getAgreementIdByUrlCode(agreementUrlCode) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT ID FROM 
            Vipps_agreements
        WHERE 
            agreement_url_code = ?
        `, [agreementUrlCode])
    con.release()

    if (res.length === 0) return false
    else return res[0].ID
}

/**
 * Fetches an agreement charge by chargeID
 * @property {string} chargeID
 * @return {AgreementCharge} 
 */
 async function getCharge(chargeID) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM 
            Vipps_agreement_charges
        WHERE 
            chargeID = ?
        `, [chargeID])
    con.release()

    if (res.length === 0) return false
    else return res
}

/**
 * Fetches the inital charge of an agreement
 * @property {string} agreementID
 */
 async function getInitialCharge(agreementID) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM 
            Vipps_agreement_charges
        WHERE 
            agreementID = ? and status = "PENDING" && type = "INITIAL"
        `, [agreementID])
    con.release()

    if (res.length === 0) return false
    else return res[0]
}

/**
 * Fetches all active agreements
 * @property {number} monthly_charge_day
 * @return {[VippsAgreement]} 
 */
 async function getActiveAgreements() {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT * FROM 
            Vipps_agreements 
        WHERE 
            status = "ACTIVE"
        `)
    con.release()

    if (res.length === 0) return false
    else return res
}

/**
 * Gets a histogram of all agreements by agreement sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
 async function getAgreementSumHistogram() {
    try {
        var con = await pool.getConnection()
        let [results] = await con.query(`
            SELECT 
                floor(amount/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Vipps_agreements
            GROUP BY 1
            ORDER BY 1;
        `)

        con.release()
        return results
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets a histogram of all charges by charge sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
 async function getChargeSumHistogram() {
    try {
        var con = await pool.getConnection()
        let [results] = await con.query(`
            SELECT 
                floor(amountNOK/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Vipps_agreement_charges
            GROUP BY 1
            ORDER BY 1;
        `)

        con.release()
        return results
    } catch(ex) {
        con.release()
        throw ex
    }
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
async function addAgreement(agreementID, donorID, KID, amount, monthlyChargeDay, agreementUrlCode, status = "PENDING") {
    let con = await pool.getConnection()

    if (monthlyChargeDay < 0 || monthlyChargeDay > 28) {
        return false
    }

    try {
        con.query(`
            INSERT INTO Vipps_agreements
                (ID, donorID, KID, amount, monthly_charge_day, agreement_url_code, status)
            VALUES
                (?,?,?,?,?,?,?)`, 
            [agreementID, donorID, KID, amount, monthlyChargeDay, agreementUrlCode, status])
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
 * @param {string} chargeID
 * @param {string} agreementId Provided by vipps
 * @param {number} amountNOK The amount of money for each charge in NOK, not øre
 * @param {number} KID The KID of the agreement
 * @param {string} dueDate Due date of the charge 
 * @param {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status The status of the charge
 * @param {"INITIAL" | "RECURRING"} type
 * @return {boolean} Success or not
 */
 async function addCharge(chargeID, agreementID, amountNOK, KID, dueDate, status, type) {
    let con = await pool.getConnection()
    try {
        con.query(`
            INSERT INTO Vipps_agreement_charges
                (chargeID, agreementId, amountNOK, KID, dueDate, status, type)
            VALUES
                (?,?,?,?,?,?,?)`, 
            [chargeID, agreementID, amountNOK, KID, dueDate, status, type])

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
 * Updates price of a recurring agreement
 * @param {string} agreementId The agreement ID
 * @param {number} price 
 * @return {boolean} Success
 */
 async function updateAgreementPrice(agreementId, price) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET amount = ? WHERE ID = ?`, [price, agreementId])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updates status of a recurring agreement
 * @param {string} agreementID The agreement ID
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status 
 * @return {boolean} Success
 */
async function updateAgreementStatus(agreementID, status) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET status = ? WHERE ID = ?`, [status, agreementID])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updates the monthly_charge_day of an agreement
 * @param {string} agreementId The agreement ID
 * @param {number} chargeDay Any day between 1 and 28
 * @return {boolean} Success
 */
 async function updateAgreementChargeDay(agreementId, chargeDay) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET monthly_charge_day = ? WHERE ID = ?`, [chargeDay, agreementId])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updates the KID of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} KID KID
 * @return {boolean} Success
 */
 async function updateAgreementKID(agreementId, KID) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET KID = ? WHERE ID = ?`, [KID, agreementId])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updates the pause date of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} pausedUntilDate The date when the pause ends
 * @return {boolean} Success
 */
 async function updateAgreementPauseDate(agreementId, pausedUntilDate) {
    let con = await pool.getConnection()
    try {
        con.query(
            `UPDATE Vipps_agreements SET paused_until_date = ? WHERE ID = ?`, 
            [pausedUntilDate, agreementId])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updates the forced charge date of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} forceChargeDate The date of the forced charge
 * @return {boolean} Success
 */
 async function updateAgreementForcedCharge(agreementId, forceChargeDate) {
    let con = await pool.getConnection()
    try {
        con.query(`UPDATE Vipps_agreements SET force_charge_date = ? WHERE ID = ?`, [forceChargeDate, agreementId])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

/**
 * Updated status of a charge
 * @param {string} agreementID agreementID
 * @param {string} chargeID chargeID
 * @param {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} newStatus The new status of the charge
 */
 async function updateChargeStatus(newStatus, agreementID, chargeID) {
    let con = await pool.getConnection()

    if (!chargeStatuses.includes(newStatus)) {
        console.error(newStatus + " is not a valid charge state")
        return false
    }

    try {
        con.query(`
            UPDATE Vipps_agreement_charges
            SET status = ?
            WHERE agreementID = ?
            AND chargeID = ?
        `, 
        [newStatus, agreementID, chargeID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        console.error("Error setting charge status to CANCELLED")
        return false
    }
}

//endregion

//region Delete

//endregion

//Helpers

const jsDBmapping = [
    ["id", "ID"],
    ["full_name", "full_name"],
    ["kid", "KID"],
    ["amount", "amount"],
    ["chargeDay", "monthly_charge_day"],
    ["pausedUntilDate", "paused_until_date"],
    ["created", "timestamp_created"],
    ["status", "status"]
]

module.exports = {
    getLatestToken,
    getOrder,
    getRecentOrder,
    getAgreement,
    getAgreements,
    getCharge,
    getInitialCharge,
    getAgreementIdByUrlCode,
    getAgreementSumHistogram,
    getChargeSumHistogram,
    getActiveAgreements,
    addToken,
    addOrder,
    addAgreement,
    addCharge,
    updateOrderTransactionStatusHistory,
    updateVippsOrderDonation,
    updateAgreementPrice,
    updateAgreementStatus,
    updateAgreementChargeDay,
    updateAgreementKID,
    updateAgreementPauseDate,
    updateAgreementForcedCharge,
    updateChargeStatus,

    setup: (dbPool) => { pool = dbPool }
}