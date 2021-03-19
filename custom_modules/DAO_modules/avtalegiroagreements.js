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

//endregion

//region Modify
//endregion

//region Delete
//endregion

module.exports = {
    add,
    update,
    remove,

    setup: (dbPool) => { pool = dbPool }
}