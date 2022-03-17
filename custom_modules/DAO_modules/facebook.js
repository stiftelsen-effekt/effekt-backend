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

async function sendQueryFromPython(sqlstring) {
    try {
        result = await con.query(sqlstring)

        return result
    }
    catch (ex) {
        throw ex
    }
}

//endregion

module.exports = {
    registerPaymentFB,
    sendQueryFromPython,
    setup: (dbPool) => { con = dbPool }
}