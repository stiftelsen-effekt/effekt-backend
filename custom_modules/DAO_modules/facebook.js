var con
let donorsDAO = require('./donors')

async function registerPaymentFB(paymentID, email) {
    try {
        let ID = await donorsDAO.getIDbyEmail(email)

        // If donor does not exist, create new donor
        if (!ID) {
            let donorID = await donorsDAO.add(email, "", "")
            await con.query(`
                INSERT INTO FB_payment_id (donorID, fb_paymentID)
                VALUES (?, ?)`, [donorID, paymentID]
            )
            return { isNewDonor: true }
        } else if (ID) {
            let donorID = ID
            await con.query(`
                INSERT INTO FB_payment_id (donorID, fb_paymentID)
                VALUES (?, ?)`, [donorID, paymentID]
            )
            return { isNewDonor: false }
        }
    }
    catch (ex) {
        throw ex
    }
}

//endregion

//region Add

//endregion

//region Modify

//endregion

//region Delete

//endregion

//Helpers

module.exports = {
    registerPaymentFB,
    setup: (dbPool) => { con = dbPool }
}