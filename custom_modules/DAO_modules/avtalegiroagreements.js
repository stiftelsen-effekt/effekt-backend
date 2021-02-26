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

async function add(KID, amount, drawdate, notice) {
    try {
        var con = await pool.getConnection()

        var res = await con.execute(
            `INSERT INTO Avtalegiro_agreement (
            KID,
            amount,
            drawdate, 
            notice
            ) VALUES (?,?,?,?)`, 
        [
            KID,
            amount, 
            drawdate,
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

        if (await DAO.distributions.KIDexists(KID)){
            let res = await con.query(`UPDATE avtalegiro_agreement SET notice = ? where KID = ?`, [notice, KID])
        } else {

        }

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function remove(donationId) {
    try {
        var con = await pool.getConnection()
        var result = await con.query(`DELETE FROM avtalegiro_agreement WHERE ID = ?`, [donationId])

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