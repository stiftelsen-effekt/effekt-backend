const sqlString = require('sqlstring')

var con

//region Get

function getByDonor(KID) {
    return new Promise(async (fulfill, reject) => {
        return reject(new Error("Not implemented"))
    })
}

/**
 * Gets aggregate donations from a spesific time period
 * @param {Date} startTime 
 * @param {Date} endTime
 * @returns {Array} Returns an array of organizations names and their aggregate donations
 */
function getAggregateByTime(startTime, endTime) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [getAggregateQuery] = await con.query("CALL `EffektDonasjonDB`.`get_aggregate_donations_by_period`(?, ?)", [startTime, endTime])
            return fulfill(getAggregateQuery[0])
        } catch(ex) {
            return reject(ex)
        }
    })
}

function KIDexists(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query("SELECT * FROM Combining_table WHERE KID = ? LIMIT 1", [KID])
        } catch(ex) {
            return reject(ex)
        }

        if (res.length > 0) fulfill(true)
        else fulfill(false)
    })
}

function ExternalPaymentIDExists(externalPaymentID, paymentID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query("SELECT * FROM Donations WHERE PaymentExternal_ID = ? AND Payment_ID = ? LIMIT 1", [externalPaymentID, paymentID])
        } catch(ex) {
            return reject(ex)
        }

        if (res.length > 0) fulfill(true)
        else fulfill(false)
    })
}

function getKIDbySplit(split, donorID) {
    return new Promise(async (fulfill, reject) => {
        let KID = null
        //Check if existing KID
        try {
            //Construct query
            let query = `
            SELECT 
                KID, 
                Count(KID) as KID_count 
                
            FROM EffektDonasjonDB.Distribution as D
                INNER JOIN Combining_table as C 
                    ON C.Distribution_ID = D.ID
            
            WHERE
            `;
            
            for (let i = 0; i < split.length; i++) {
                query += `(OrgID = ${sqlString.escape(split[i].organizationID)} AND percentage_share = ${sqlString.escape(split[i].share)} AND Donor_ID = ${sqlString.escape(donorID)})`
                if (i < split.length-1) query += ` OR `
            }

            query += ` GROUP BY C.KID
            
            HAVING 
                KID_count = ` + split.length

            var [res] = await con.execute(query)
        } catch(ex) {
            return reject(ex)
        }

        if (res.length > 0) fulfill(res[0].KID)
        else fulfill(null)
    })
}

function getByID(donationID) {
    return new Promise(async (fulfill, reject) => {
        try {
            let donation = {}

            var [getDonationFromIDquery] = await con.execute(`
                SELECT 
                    Donation.sum_confirmed, 
                    Donation.KID_fordeling,
                    Donor.full_name,
                    Donor.email
                
                FROM Donations as Donation
                    INNER JOIN Donors as Donor
                        ON Donation.Donor_ID = Donor.ID
                
                WHERE 
                    Donation.ID = ${sqlString.escape(donationID)}`)


            if (getDonationFromIDquery.length != 1) reject("Could not find donation with ID " + donationID)

            donation.donorName = getDonationFromIDquery[0].full_name
            donation.sum = getDonationFromIDquery[0].sum_confirmed
            donation.mail = getDonationFromIDquery[0].email
            donation.KID = getDonationFromIDquery[0].KID_fordeling

            donation.organizations = await getSplitByKID(donation.KID)

            return fulfill(donation)
        } catch(ex) {
            return reject(ex)
        }
    })
}

function getSplitByKID(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            let [getOrganizationsSplitByKIDQuery] = await con.execute(`
            SELECT 
                Organizations.full_name, 
                Distribution.percentage_share
            
            FROM Combining_table as Combining
                INNER JOIN Distribution as Distribution
                    ON Combining.Distribution_ID = Distribution.ID
                INNER JOIN Organizations as Organizations
                    ON Organizations.ID = Distribution.OrgID
            
            WHERE 
                KID = ${sqlString.escape(KID)}`)

            if (getOrganizationsSplitByKIDQuery.length == 0) return reject("No split with the KID " + KID)

            return fulfill(getOrganizationsSplitByKIDQuery)
        } catch(ex) {
            reject(ex)
        }
    })
}

/**
 * Fetches all the donations in the database for a given inclusive range. Passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 */
function getFromRange(fromDate, toDate) {
    return new Promise(async (fulfill, reject) => {
        try {
            if (!fromDate) fromDate = new Date(2000,0, 1)
            if (!toDate) toDate = new Date()

                let [getFromRangeQuery] = await con.query(`
                    SELECT 
                        Donations.ID as Donation_ID,
                        Donations.timestamp_confirmed,  
                        Donations.Donor_ID, 
                        Donors.full_name as donor_name, 
                        Donations.sum_confirmed, 
                        Payment.payment_name,
                        Distribution.OrgID as Org_ID, 
                        Organizations.full_name as org_name, 
                        Distribution.percentage_share, 
                        (Donations.sum_confirmed*Distribution.percentage_share)/100 as actual_share 

                    FROM Donations
                        INNER JOIN Combining_table 
                            ON Donations.KID_fordeling = Combining_table.KID
                        INNER JOIN Distribution 
                            ON Combining_table.Distribution_ID = Distribution.ID
                        INNER JOIN Donors 
                            ON Donors.ID = Donations.Donor_ID
                        INNER JOIN Organizations 
                            ON Organizations.ID = Distribution.OrgID
                        INNER JOIN Payment
                            ON Payment.ID = Donations.Payment_ID
                    
                    WHERE 
                        Donations.timestamp_confirmed >= Date(?)  
                        AND 
                        Donations.timestamp_confirmed < Date(Date_add(Date(?), interval 1 day))
                    `, [fromDate, toDate])

                let donations = new Map()
                getFromRangeQuery.forEach((row) => {
                    if(!donations.get(row.Donation_ID)) donations.set(row.Donation_ID, {
                        ID: null,
                        time: null,
                        name: null,
                        donorID: null,
                        sum: null,
                        paymentMethod: null,
                        split: []
                    })

                    donations.get(row.Donation_ID).ID = row.Donation_ID
                    donations.get(row.Donation_ID).time = row.timestamp_confirmed
                    donations.get(row.Donation_ID).name = row.donor_name
                    donations.get(row.Donation_ID).donorID = row.Donor_ID
                    donations.get(row.Donation_ID).sum = row.sum_confirmed
                    donations.get(row.Donation_ID).paymentMethod = row.payment_name

                    donations.get(row.Donation_ID).split.push({
                        id: row.Org_ID,
                        name: row.org_name,
                        percentage: row.percentage_share,
                        amount: row.actual_share
                    })
                })

                donations = [...donations.values()].sort((a,b) => a.time - b.time)

                fulfill(donations)
        } catch(ex) {
            reject(ex)
        }
    })
}

/**
 * Gets KIDs from historic paypal donors, matching them against a ReferenceTransactionId
 * @param {Array} transactions A list of transactions that must have a ReferenceTransactionId 
 * @returns {Object} Returns an object with referenceTransactionId's as keys and KIDs as values
 */
function getHistoricPaypalSubscriptionKIDS(referenceIDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            let [res] = await con.query(`SELECT 
                ReferenceTransactionNumber,
                KID 
                
                FROM Paypal_historic_distributions 

                WHERE 
                    ReferenceTransactionNumber IN (?);`, [referenceIDs])

            let mapping = res.reduce((acc, row) => {
                acc[row.ReferenceTransactionNumber] = row.KID
                return acc
            }, {})

            fulfill(mapping)
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}


//endregion

//region Add
function addSplit(donationObject) {
    return new Promise(async (fulfill, reject) => {
        try {
            var transaction = await con.startTransaction()

            let split = donationObject.split
            let KID = donationObject.KID
            let donorID = donationObject.donorID

            let distribution_table_values = split.map((item) => {return [item.organizationID, item.share]})
            var res = await transaction.query("INSERT INTO Distribution (OrgID, percentage_share) VALUES ?", [distribution_table_values])

            let first_inserted_id = res[0].insertId
            var combining_table_values = Array.apply(null, Array(split.length)).map((item, i) => {return [donorID, first_inserted_id+i, KID]})

            //Update combining table
            var res = await transaction.query("INSERT INTO Combining_table (Donor_ID, Distribution_ID, KID) VALUES ?", [combining_table_values])

            con.commitTransaction(transaction)
        } catch(ex) {
            con.rollbackTransaction(transaction)
            return reject(ex)
        }

        fulfill(true)
    })
}

function add(KID, paymentMethodID, sum, registeredDate = null, externalPaymentID = null) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donorIDQuery] = await con.query("SELECT Donor_ID FROM Combining_table WHERE KID = ? LIMIT 1", [KID])

            if (donorIDQuery.length != 1) { 
                reject("KID " + KID + " does not exist");
                return false;
            }

            /*  External transaction ID can be passed to prevent duplicates.
                For example if you upload the same vipps report multiple
                times, we must check the vipps transaction ID against the
                stored ones in the database, to ensure that we are not creating
                a duplicate donation. */
            if (externalPaymentID != null) {
                if (await ExternalPaymentIDExists(externalPaymentID,paymentMethodID)) {
                    reject("Already a donation with ExternalPaymentID " + externalPaymentID + " and PaymentID " + paymentMethodID)
                    return false
                }
            }

            var donorID = donorIDQuery[0].Donor_ID

            var [addDonationQuery] = await con.query("INSERT INTO Donations (Donor_ID, Payment_ID, PaymentExternal_ID, sum_confirmed, timestamp_confirmed, KID_fordeling) VALUES (?,?,?,?,?,?)", [donorID, paymentMethodID, externalPaymentID, sum, registeredDate, KID])

            return fulfill(addDonationQuery.insertId)
        } catch(ex) {
            return reject(ex)
        }
    })
}
//endregion

//region Modify
function registerConfirmedByIDs(IDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donations] = await con.execute(`UPDATE EffektDonasjonDB.Donations 
                SET date_confirmed = NOW()
                WHERE 
                ID IN (` + ("?,").repeat(IDs.length).slice(0,-1) + `)`, IDs)
        }
        catch(ex) {
            reject(ex)
        }

        fulfill()
    })
}
//endregion

//region Delete

//endregion

//region Helpers

//endregion

module.exports = {
    getByID,
    getByDonor,
    getAggregateByTime,
    getKIDbySplit,
    getFromRange,
    getHistoricPaypalSubscriptionKIDS,
    KIDexists,
    ExternalPaymentIDExists,
    addSplit,
    add,
    registerConfirmedByIDs,

    setup: (dbPool) => { con = dbPool }
}