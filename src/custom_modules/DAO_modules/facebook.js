var con
import paymentMethodIDs from "./../../enums/paymentMethods"

//region Get

async function getAllFacebookDonations(donorID, paymentID) {
    try {
        let [results] = await con.query(`
            SELECT PaymentExternal_ID, sum_confirmed, timestamp_confirmed
            FROM Donations
            WHERE Payment_ID = ${paymentMethodIDs.facebook}`
        )

        return results
    }
    catch (ex) {
        throw ex
    }
}


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
    getAllFacebookDonations,
    registerPaymentFB,
    setup: (dbPool) => { con = dbPool }
}