const sqlString = require("sqlstring")
const distributions = require('./distributions.js')
var pool

//region Get
//endregion

//region Add
/**
 * Adds a new avtalegiroagreement to the database
 * @param {number} KID
 * @param {number} amount  
 * @param {Date} paymentDate
 * @param {boolean} notice
 */
async function add(KID, amount, paymentDate, notice) {
    try {
        var con = await pool.getConnection()

        var res = await con.execute(
            `INSERT INTO Avtalegiro_agreements (
            KID,
            amount,
            payment_date, 
            notice
            ) VALUES (?,?,?,?)`, 
        [
            KID,
            amount, 
            paymentDate,
            notice
        ])

        con.release()
        return(res.insertId)
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function updateNotification(KID, notice) {
    try {
        var con = await pool.getConnection()

        let res = await con.query(`UPDATE Avtalegiro_agreements SET notice = ? where KID = ?`, [notice, KID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function updateAmount(KID, amount) {
    try {
        var con = await pool.getConnection()

        await con.query(`UPDATE Avtalegiro_agreements SET amount = ? where KID = ?`, [amount, KID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function updatePaymentDate(KID, paymentDate) {
    try {
        var con = await pool.getConnection()

        if (paymentDate >= 0 && paymentDate <= 28) {
            await con.query(`UPDATE Avtalegiro_agreements SET payment_date = ? where KID = ?`, [paymentDate, KID])
        } else {
            con.release()
            return false
        }

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function replaceDistribution(replacementKID, originalKID, split, donorId, metaOwnerID) {
    try {
        var con = await pool.getConnection()

        if (replacementKID.length !== 15 || originalKID.length !== 15) {
            con.release()
            return false
        }

        // Replaces original KID with a new replacement KID
        await con.query(`
            UPDATE Combining_table
            SET KID = ?
            WHERE KID = ?
        `, [replacementKID, originalKID])

        // Updates donations with the old distributions to use the replacement KID (preserves donation history)
        await con.query(`
            UPDATE Donations
            SET KID_fordeling = ?
            WHERE KID_fordeling = ?
        `, [replacementKID, originalKID])

        // Add new distribution using the original KID
        await distributions.add(split, originalKID, donorId, metaOwnerID)

        // Links the replacement KID to the original AvtaleGiro KID
        await con.query(`
            INSERT INTO AvtaleGiro_replaced_distributions(Replacement_KID, Original_AvtaleGiro_KID)
            VALUES (?, ?)
        `, [replacementKID, originalKID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function setActive(KID, active) {
    try {
        var con = await pool.getConnection()

        let res = await con.query(`UPDATE Avtalegiro_agreements SET active = ? where KID = ?`, [active, KID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function isActive(KID) {
    try {
        var con = await pool.getConnection()

        let [res] = await con.query(`SELECT active FROM Avtalegiro_agreements active where KID = ?`, [KID])

        con.release()

        if (res[0].active == 1)
            return true
        else
            return false
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Updates the cancellation date of a AvtaleGiro agreement
 * @param {string} KID
 * @param {Date} date
 * @return {boolean} Success
 */
 async function cancelAgreement(KID) {
    let con = await pool.getConnection()

    const today = new Date()
    //YYYY-MM-DD format
    const mysqlDate = today.toISOString().slice(0, 19).replace('T', ' ');

    try {
        con.query(`
            UPDATE Avtalegiro_agreements
            SET cancelled = ?, active = 0
            WHERE KID = ?
        `, [mysqlDate, KID])
        con.release()
        return true
    }
    catch(ex) {
        con.release()
        return false
    }
}

async function remove(KID) {
    try {
        var con = await pool.getConnection()
        var result = await con.query(`DELETE FROM Avtalegiro_agreements WHERE KID = ?`, [KID])

        con.release()
        if (result[0].affectedRows > 0) return true
        else return false
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function exists(KID) {
    try {
        var con = await pool.getConnection()

        var [res] = await con.query("SELECT * FROM Avtalegiro_agreements WHERE KID = ?", [KID])

        con.release()
        if (res.length > 0) return true
        else return false
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches all agreements with sorting and filtering
 * @param {column: string, desc: boolean} sort Sort object
 * @param {string | number | Date} page Used for pagination
 * @param {number=10} limit Agreement count limit per page, defaults to 10
 * @param {object} filter Filtering object
 * @return {[AvtaleGiro]} Array of AvtaleGiro agreements
 */
 async function getAgreements(sort, page, limit, filter) {
    let con = await pool.getConnection()

    const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1]
    const sortDirection = sort.desc ? "DESC" : "ASC"
    const offset = page*limit

    let where = [];
    if (filter) {
        if (filter.amount) {
            if (filter.amount.from) where.push(`amount >= ${sqlString.escape(filter.amount.from*100)} `)
            if (filter.amount.to) where.push(`amount <= ${sqlString.escape(filter.amount.to*100)} `)
        }

        if (filter.KID) where.push(` CAST(CT.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `)
        if (filter.donor) where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `)
        if (filter.statuses.length > 0) where.push(` AG.active IN (${filter.statuses.map((ID) => sqlString.escape(ID)).join(',')}) `)
    }

    const [agreements] = await con.query(`
        SELECT DISTINCT
            AG.ID,
            AG.active,
            ROUND(AG.amount / 100, 0) as amount,
            AG.KID,
            AG.payment_date,
            AG.created,
            AG.cancelled,
            AG.last_updated,
            AG.notice,
            Donors.full_name 
        FROM Avtalegiro_agreements as AG
        INNER JOIN Combining_table as CT
            ON AG.KID = CT.KID
        INNER JOIN Donors 
            ON CT.Donor_ID = Donors.ID
        WHERE
            ${(where.length !== 0 ? where.join(" AND ") : '1')}

        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
        `, [limit, offset])

    const [counter] = await con.query(`
        SELECT COUNT(*) as count FROM Avtalegiro_agreements
    `)
    
    con.release()

    if (agreements.length === 0) return false
    else return {
        pages: Math.ceil(counter[0].count / limit),
        rows: agreements
    }
}

/**
 * Fetches a single AvtaleGiro agreement
 * @param {string} id AvtaleGiro ID
 * @return {AvtaleGiro} AvtaleGiro agreement
 */
 async function getAgreement(id) {
    let con = await pool.getConnection()

    const result = await con.query(`
        SELECT DISTINCT
            AG.ID,
            AG.active,
            ROUND(AG.amount / 100, 0) as amount,
            AG.KID,
            AG.payment_date,
            AG.created,
            AG.cancelled,
            AG.last_updated,
            AG.notice,
            Donors.full_name,
            Donors.ID 
        FROM Avtalegiro_agreements as AG
        INNER JOIN Combining_table as CT
            ON AG.KID = CT.KID
        INNER JOIN Donors 
            ON CT.Donor_ID = Donors.ID
        WHERE AG.ID = ?
        `, [id])
    
    con.release()

    if (result.length === 0) return false

    const avtaleGiro = result[0][0]

    let split = await distributions.getSplitByKID(avtaleGiro.KID)
        
    avtaleGiro.distribution = split.map((split) => ({
        abbriv: split.abbriv,
        share: split.percentage_share
    }))

    return avtaleGiro
}

async function getByDonorId(donorId) {
    try {
        var con = await pool.getConnection()
        let [agreements] = await con.query(`
            SELECT DISTINCT
                AG.ID,
                AG.active,
                ROUND(AG.amount / 100, 0) as amount,
                AG.KID,
                AG.payment_date,
                AG.created,
                AG.cancelled,
                AG.last_updated,
                AG.notice,
                Donors.full_name
            FROM Avtalegiro_agreements as AG
            
            INNER JOIN Combining_table as CT
                ON AG.KID = CT.KID
            
            INNER JOIN Donors 
                ON CT.Donor_ID = Donors.ID
            
            WHERE Donors.ID = ?`, [donorId])

        con.release()
        
        return agreements;
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

async function getByKID(KID) {
    try {
        var con = await pool.getConnection()
        let [agreement] = await con.query(`
            SELECT 
                payment_date,
                amount, 
                KID
            FROM Avtalegiro_agreements 
            WHERE KID = ?`, [KID])

        con.release()
        if (agreement.length > 0) {
            return {
                payment_date: agreement[0].payment_date,
                amount: agreement[0].amount,
                KID: agreement[0].KID,
            }
        }
        else {
            return null
        }
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches key statistics of active agreements
 * @return {Object} 
 */
 async function getAgreementReport() {
    let con = await pool.getConnection()
    let [res] = await con.query(`
    SELECT 
        count(ID) as activeAgreementCount,
        round(avg(amount)/100, 0) as averageAgreementSum,
        round(sum(amount)/100, 0) as totalAgreementSum,
        round((
            SELECT AVG(subquery.amount) as median_val
                FROM (
                    SELECT AG.amount, @rownum:=@rownum+1 as 'row_number', @total_rows:=@rownum
                    FROM Avtalegiro_agreements as AG, (SELECT @rownum:=0) r
                        WHERE AG.amount is NOT NULL
                        AND active = 1
                    ORDER BY AG.amount
                ) as subquery
            WHERE subquery.row_number IN ( FLOOR((@total_rows+1)/2), FLOOR((@total_rows+2)/2) )
        )/100, 0) as medianAgreementSum,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND active = 0
        ) as draftedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND active = 0
        ) as sumDraftedThisMonth,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND active = 1
        ) as activatedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND active = 1
        ) as sumActivatedThisMonth,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(cancelled) = month(current_timestamp())
            AND active = 0
        ) as stoppedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(cancelled) = month(current_timestamp())
            AND active = 0
        ) as sumStoppedThisMonth
    FROM 
        Avtalegiro_agreements
    WHERE
        active = 1
        `)
    con.release()

    if (res.length === 0) return false
    else return res[0]
}

/**
 * Gets all agreements that we have not yet recieved a payment for a given date
 * @param {Date} date 
 */
async function getMissingForDate(date) {
    try {
        var con = await pool.getConnection()

        let year = date.getFullYear()
        let month = date.getMonth()+1
        let dayOfMonth = date.getDate()

        let [res] = await con.query('call get_avtalegiro_agreement_missing_donations_by_date(?,?,?)', 
            [year, month, dayOfMonth])

        con.release()

        return res[0]
    } catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets all agreements we expected a donation for for a given date
 * @param {Date} date 
 */
 async function getExpectedDonationsForDate(date) {
    try {
        var con = await pool.getConnection()

        let year = date.getFullYear()
        let month = date.getMonth()+1
        let dayOfMonth = date.getDate()

        let [res] = await con.query('call get_avtalegiro_agreement_expected_donations_by_date(?,?,?)', 
            [year, month, dayOfMonth])

        con.release()

        return res[0]
    } catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets all donations we have recieved for agreements for a given date
 * @param {Date} date 
 */
 async function getRecievedDonationsForDate(date) {
    try {
        var con = await pool.getConnection()

        let year = date.getFullYear()
        let month = date.getMonth()+1
        let dayOfMonth = date.getDate()

        let [res] = await con.query('call get_avtalegiro_agreement_recieved_donations_by_date(?,?,?)', 
            [year, month, dayOfMonth])

        con.release()

        return res[0].map((donation) => ({
            id: donation.ID,
            kid: donation.KID_fordeling,
            paymentMethod: 'AvtaleGiro',
            email: donation.email,
            donor: donation.full_name,
            sum: donation.sum_confirmed,
            transactionCost: donation.transaction_cost,
            timestamp: donation.timestamp_confirmed
        }))
    } catch (ex) {
        con.release()
        throw ex
    }
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
                floor(amount/500)*500/100 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Avtalegiro_agreements
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
 * Returns all agreements with a given payment date
 * @param {Date} date 
 * @returns {Array<AvtalegiroAgreement>}
 */
async function getByPaymentDate(dayInMonth) {
    try {
        var con = await pool.getConnection()

        let [agreements] = await con.query(`SELECT    
            payment_date,
            amount, 
            notice,
            KID
            
            FROM Avtalegiro_agreements 

            WHERE payment_date = ? AND active = 1`, [dayInMonth])

        con.release()
        
        return agreements.map((agreement) => (
            {
                payment_date: agreement.payment_date,
                notice: agreement.notice,
                amount: agreement.amount,
                KID: agreement.KID,
            }
        ))
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Returns an array of Avtalegiro validation values
 * This is used to check if avtalegiro payments were recieved
 * Expected is the expected amount of AvtaleGiro payments
 * Actual is the amount recieved
 * Diff is the difference between the two
 * @returns {Array<{ date: String, expected: number, actual: number, diff: number }>}
 */
 async function getValidationTable() {
    try {
        var con = await pool.getConnection()

        let [rows] = await con.query(`call EffektDonasjonDB.get_avtalegiro_validation()`)

        con.release()
        
        return rows[0]
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Adds a new shipment row to db
 * @param {Number} numClaims The number of claims in that shipment
 * @returns {Number} The shipment nr.
 */
async function addShipment(numClaims) {
    try {
        var con = await pool.getConnection()
        let [result] = await con.query(`INSERT INTO
            Avtalegiro_shipment
            
            (num_claims) VALUES (?)`, [numClaims])

        con.release()
        return result.insertId
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

const jsDBmapping = [
    ["id", "ID"],
    ["full_name", "full_name"],
    ["kid", "KID"],
    ["amount", "amount"],
    ["paymentDate", "payment_date"],
    ["notice", "notice"],
    ["active", "active"],
    ["created", "created"],
    ["lastUpdated", "last_updated"],
    ["sum", "sum_confirmed"],
    ["confirmed", "timestamp_confirmed"],
    ["kidFordeling", "KID_fordeling"],
    ["cancelled", "cancelled"]
]

module.exports = {
    add,
    setActive,
    isActive,
    cancelAgreement,
    updateNotification,
    updatePaymentDate,
    updateAmount,
    replaceDistribution,
    remove,
    exists, 
    getByKID,
    getByDonorId,
    getAgreementSumHistogram,
    getAgreements,
    getAgreement,
    getAgreementReport,
    getByPaymentDate,
    getValidationTable,
    getMissingForDate,
    getRecievedDonationsForDate,
    getExpectedDonationsForDate,

    addShipment,
    setup: (dbPool) => { pool = dbPool }
}