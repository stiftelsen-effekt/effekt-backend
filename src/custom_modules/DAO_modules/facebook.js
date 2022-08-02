var con
import paymentMethodIDs from "./../../enums/paymentMethods"

//region Get

async function getAllFacebookDonations() {
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

async function getAllFacebookCampaignIDs() {
    try {
        let [results] = await con.query(`
            SELECT ID
            FROM FB_campaigns`
        )

        return results
    }
    catch (ex) {
        throw ex
    }
}

async function getFacebookReports() {
    try {
        let [results] = await con.query(`
            SELECT FB_report
            FROM FB_donation_reports`
        )

        return results
    }
    catch (ex) {
        throw ex
    }
}

async function getFacebookCampaignOrgShares(ID) {
    try {
        let [results] = await con.query(`
            SELECT FB_campaign_ID, Org_ID, Share
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            `, [ID]
        )

        return results
    }
    catch (ex) {
        throw ex
    }
}

async function isCampaignRegistered(ID) {
    try {
        let [results] = await con.query(`
            SELECT FB_campaign_ID
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            LIMIT 1
            `, [ID]
        )

        return results.length > 0
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

async function registerFacebookCampaign(ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type) {
    try {
        await con.query(`
            INSERT INTO FB_campaigns (ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type)
            VALUES (?, ?, ?, ?, ?, ?)`, [ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type]
        )

        return true
    }
    catch (ex) {
        throw ex
    }
}

async function registerFacebookReport(report) {
    try {
        await con.query(`
            INSERT INTO FB_donation_reports (FB_report)
            VALUES (?)`, [report]
        )

        return true
    }
    catch (ex) {
        throw ex
    }
}

async function registerFacebookCampaignOrgShare(FB_campaign_ID, Org_ID, Share) {
    try {
        await con.query(`
            INSERT INTO FB_campaign_org_shares (FB_campaign_ID, Org_ID, Share)
            VALUES (?, ?, ?)`, [FB_campaign_ID, Org_ID, Share]
        )

        return true
    }
    catch (ex) {
        throw ex
    }
}

//region Delete

async function removeAllFacebookReports() {
    try {
        await con.query(`
            DELETE FROM FB_donation_reports`
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
    getAllFacebookCampaignIDs,
    registerFacebookCampaign,
    getFacebookReports, 
    getFacebookCampaignOrgShares,
    registerFacebookCampaignOrgShare,
    removeAllFacebookReports,
    registerFacebookReport,
    isCampaignRegistered,
    setup: (dbPool) => { con = dbPool }
}