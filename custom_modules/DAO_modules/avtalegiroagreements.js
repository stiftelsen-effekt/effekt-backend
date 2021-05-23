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

async function update(KID, notice) {
    try {
        var con = await pool.getConnection()

        let res = await con.query(`UPDATE avtalegiro_agreement SET notice = ? where KID = ?`, [notice, KID])

        con.release()
        return true
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

async function avtaleGiroAgreementExists(KID) {
    try {
        var con = await pool.getConnection()

        var [res] = await con.query("SELECT * FROM Distribution WHERE KID = ? LIMIT 1", [KID])

        con.release()
        if (res.length > 0) return true
        else return false
    } catch(ex) {
        con.release()
        throw ex
    }
}

async function getByAvtalegiroKID(KID) {
    try {
        var con = await pool.getConnection()
        let [dbDonor] = await con.query(`SELECT    
            payment_date,
            amount, 
            KID,
            
            FROM Avtalegiro_agreements 

            WHERE KID_fordeling = ? 
            GROUP BY Donors.ID LIMIT 1`, [KID])

        con.release()
        if (dbDonor.length > 0) {
            return {
                payment_date: dbDonor[0].payment_date,
                amount: dbDonor[0].amount,
                KID: dbDonor[0].KID,
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

module.exports = {
    add,
    update,
    remove,
    avtaleGiroAgreementExists, 
    getByAvtalegiroKID,

    setup: (dbPool) => { pool = dbPool }
}