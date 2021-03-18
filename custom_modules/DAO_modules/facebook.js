var con

//region Add

async function registerPaymentFB(donorID, paymentID) {
    try {
        await con.query(`
            INSERT INTO FB_payment_ID (donorID, paymentID)
            VALUES (?, ?)`, [donorID, paymentID]
        )

        return true
    }
    catch (ex) {
        throw ex
    }
}

//endregion

module.exports = {
    registerPaymentFB,
    setup: (dbPool) => { con = dbPool }
}