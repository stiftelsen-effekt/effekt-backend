var pool

//region Get
//endregion

//region Add
/**
 * Adds a new payment intent to the database
 * @param {number} KID
 * @param {string} paymentMethod  
 */

async function addPaymentIntent(KID, paymentMethod) {
    try {
        var con = await pool.getConnection()

        var res = await con.execute(
            `INSERT INTO Payment_intent (
            Payment_method,
            KID_fordeling) VALUES (?,?)`, 
        [
            paymentMethod,
            KID
        ])

        con.release()
        return(res.insertId)
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
    addPaymentIntent,

    setup: (dbPool) => { pool = dbPool }
}