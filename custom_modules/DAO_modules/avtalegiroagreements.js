var pool

//region Get
//endregion

//region Add
/**
 * Adds a new avtalegiroagreement to the database
 * @param {number} KID
 * @param {number} amount  
 * @param {Date} drawdate
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

async function getByKID(KID) {
    try {
        var con = await pool.getConnection()
        let [agreement] = await con.query(`SELECT    
            payment_date,
            amount, 
            KID,
            
            FROM Avtalegiro_agreements 

            WHERE KID_fordeling = ? 
            GROUP BY Donors.ID LIMIT 1`, [KID])

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
 * Returns all agreements with a given payment date
 * @param {Date} date 
 * @returns {Array<import("../parsers/avtalegiro").AvtalegiroAgreement>}
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
        if (agreements.length > 0) {
            return agreements.map((agreement) => (
                {
                    payment_date: agreement.payment_date,
                    notice: agreement.notice,
                    amount: agreement.amount,
                    KID: agreement.KID,
                }
            ))
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

module.exports = {
    add,
    setActive,
    isActive,
    updateNotification,
    remove,
    exists, 
    getByKID,
    getByPaymentDate,
    addShipment,

    setup: (dbPool) => { pool = dbPool }
}