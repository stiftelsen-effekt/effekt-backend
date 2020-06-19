const sqlString = require('sqlstring')
const distributions = require('./distributions.js')

var con
var DAO

/** @typedef Donation
 * @prop {number} id
 * @prop {string} donor Donor full name
 * @prop {string} email
 * @prop {number} sum 
 * @prop {number} transactionCost
 * @prop {Date} timestamp Timestamp of when the donation was recieved
 * @prop {string} method The name of the payment method used for the donation
 * @prop {number} KID
 */

//region Get
/**
 * Gets all donations, ordered by the specified column, limited by the limit, and starting at the specified cursor
 * @param {id: string, desc: boolean | null} sort If null, don't sort
 * @param {string | number | Date} cursor Used for pagination
 * @param {number=10} limit Defaults to 10
 * @param {object} filter Filtering object
 * @returns {[Array<IDonation & donorName: string>, nextcursor]} An array of donations pluss the donorname
 */
async function getAll(sort, page, limit = 10, filter = null) {
    try {
        if (sort) {
            const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1]

            let where = [];
            if (filter) {
                if (filter.sum) {
                    if (filter.sum.from) where.push(`sum_confirmed >= ${sqlString.escape(filter.sum.from)} `)
                    if (filter.sum.to) where.push(`sum_confirmed <= ${sqlString.escape(filter.sum.to)} `)
                }
    
                if (filter.date) {
                    if (filter.date.from) where.push(`timestamp_confirmed >= ${sqlString.escape(filter.date.from)} `)
                    if (filter.date.to) where.push(`timestamp_confirmed <= ${sqlString.escape(filter.date.to)} `)
                }
    
                if (filter.KID) where.push(` CAST(KID_fordeling as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `)
                if (filter.paymentMethodIDs) where.push(` Payment_ID IN (${filter.paymentMethodIDs.map((ID) => sqlString.escape(ID)).join(',')}) `)

                if (filter.donor) where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)} OR Donors.email LIKE ${sqlString.escape(`%${filter.donor}%`)}) `)
            }

            const [donations] = await con.query(`SELECT 
                    Donations.ID,
                    Donors.full_name,
                    Payment.payment_name,
                    Donations.sum_confirmed,
                    Donations.transaction_cost,
                    Donations.KID_fordeling,
                    Donations.timestamp_confirmed
                FROM Donations
                INNER JOIN Donors
                    ON Donations.Donor_ID = Donors.ID
                INNER JOIN Payment
                    ON Donations.Payment_ID = Payment.ID

                WHERE 
                    ${(where.length !== 0 ? where.join(" AND ") : '1')}

                ORDER BY ${sortColumn}
                ${sort.desc ? 'DESC' : ''} 
                LIMIT ? OFFSET ?`, [limit, page*limit])

            const [counter] = await con.query(`
                SELECT COUNT(*) as count FROM Donations

                INNER JOIN Donors
                    ON Donations.Donor_ID = Donors.ID
                
                WHERE 
                    ${(where.length !== 0 ? where.join(" AND ") : ' 1')}`)

            const pages = Math.ceil(counter[0].count / limit)

            return {
                rows: mapToJS(donations),
                pages
            }
        }
    } catch(ex) {
        throw ex
    }
}



/**
 * Gets a histogram of all donations by donation sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getHistogramBySum() {
    try {
        [results] = await con.query(`
            SELECT 
                floor(sum_confirmed/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Donations
            GROUP BY 1
            ORDER BY 1;
        `)

        return results
    } catch(ex) {
        throw ex;
    }
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
            var [getAggregateQuery] = await con.query("CALL `get_aggregate_donations_by_period`(?, ?)", [startTime, endTime])
            return fulfill(getAggregateQuery[0])
        } catch(ex) {
            return reject(ex)
        }
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

/**
 * Gets donation by ID
 * @param {numer} donationID 
 * @returns {Donation} A donation object
 */
function getByID(donationID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [getDonationFromIDquery] = await con.query(`
                SELECT 
                    Donation.ID,
                    Donation.sum_confirmed, 
                    Donation.KID_fordeling,
                    Donation.transaction_cost,
                    Donation.timestamp_confirmed,
                    Donor.full_name,
                    Donor.email,
                    Payment.payment_name
                
                FROM Donations as Donation
                    INNER JOIN Donors as Donor
                        ON Donation.Donor_ID = Donor.ID

                    INNER JOIN Payment
                        ON Donation.Payment_ID = Payment.ID
                
                WHERE 
                    Donation.ID = ?`, [donationID])


            if (getDonationFromIDquery.length != 1) reject(new Error("Could not find donation with ID " + donationID))

            let dbDonation = getDonationFromIDquery[0]

            /** @type Donation */
            let donation = {
                id: dbDonation.ID,
                donor: dbDonation.full_name,
                email: dbDonation.email,
                sum: dbDonation.sum_confirmed,
                transactionCost: dbDonation.transaction_cost,
                timestamp: dbDonation.timestamp_confirmed,
                method: dbDonation.payment_name,
                KID: dbDonation.KID_fordeling
            }

            //TODO: Standardize split object form
            let split = await distributions.getSplitByKID(donation.KID)
            
            donation.distribution = split.map((split) => ({
                abbriv: split.abbriv,
                share: split.percentage_share
            }))

            return fulfill(donation)
        } catch(ex) {
            return reject(ex)
        }
    })
}

/**
 * Fetches all the donations in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @param {Array<Integer>} [paymentMethodIDs=null] Provide optional PaymentMethodID to filter to a payment method
 */
function getFromRange(fromDate, toDate, paymentMethodIDs = null) {
    return new Promise(async (fulfill, reject) => {
        try {
            if (!fromDate) fromDate = new Date(2000,0, 1)
            if (!toDate) toDate = new Date()

                let [getFromRangeQuery] = await con.query(`
                    SELECT 
                        Donations.ID as Donation_ID,
                        Donations.timestamp_confirmed,  
                        Donations.Donor_ID, 
                        Donations.transaction_cost,
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
                    ${(paymentMethodIDs != null ? `
                        AND
                        Donations.Payment_ID IN (?)
                    ` : '')}
                    `, [fromDate, toDate, paymentMethodIDs])

                let donations = new Map()
                getFromRangeQuery.forEach((row) => {
                    if(!donations.get(row.Donation_ID)) donations.set(row.Donation_ID, {
                        ID: null,
                        time: null,
                        name: null,
                        donorID: null,
                        sum: null,
                        paymentMethod: null,
                        transactionCost: null,
                        split: []
                    })

                    donations.get(row.Donation_ID).ID = row.Donation_ID
                    donations.get(row.Donation_ID).time = row.timestamp_confirmed
                    donations.get(row.Donation_ID).name = row.donor_name
                    donations.get(row.Donation_ID).donorID = row.Donor_ID
                    donations.get(row.Donation_ID).sum = row.sum_confirmed
                    donations.get(row.Donation_ID).paymentMethod = row.payment_name
                    donations.get(row.Donation_ID).transactionCost = row.transaction_cost

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
 * Fetches median donation in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @returns {Number|null} The median donation sum if donations exist in range, null else
 */
async function getMedianFromRange(fromDate, toDate) {
    try {
        if (!fromDate) fromDate = new Date(2000,0, 1)
        if (!toDate) toDate = new Date()

        let [donations] = await con.query(`
            SELECT 
                Donations.sum_confirmed
            
            FROM Donations 
            
            WHERE 
                Donations.timestamp_confirmed >= Date(?)  
                AND 
                Donations.timestamp_confirmed < Date(Date_add(Date(?), interval 1 day))

            ORDER BY
                Donations.sum_confirmed
            `, [fromDate, toDate])

        if (donations.length == 0) return null

        // Ikke helt presist siden ved partall antall donasjoner vil denne funksjonen
        // returnere det største av de to midterste elementene (om de er ulike), 
        // men tenker det går greit
        const medianIndex = Math.floor(donations.length / 2)

        return parseFloat(donations[medianIndex].sum_confirmed);
    } catch(ex) {
        throw ex;
    }
}


//endregion

//region Add

/**
 * Adds a donation to the database
 * 
 * @param {Number} KID 
 * @param {Number} paymentMethodID 
 * @param {Number} sum The gross amount of the donation (net amount is calculated in the database)
 * @param {Date} [registeredDate=null] Date the transaction was confirmed
 * @param {String} [externalPaymentID=null] Used to track payments in external payment systems (paypal and vipps ex.)
 * @param {Number} [metaOwnerID=null] Specifies an owner that the data belongs to (e.g. The Effekt Foundation). Defaults to selection default from DB if none is provided.
 * @return {Number} The donations ID
 */
function add(KID, paymentMethodID, sum, registeredDate = null, externalPaymentID = null, metaOwnerID = null) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donorIDQuery] = await con.query("SELECT Donor_ID FROM Combining_table WHERE KID = ? LIMIT 1", [KID])

            if (donorIDQuery.length != 1) { 
                reject(new Error("NO_KID | KID " + KID + " does not exist"));
                return false;
            }

            /** The meta owner ID is the ID of the organization / group that
             *  are the owners of the data in the DB. If now ID is provided,
             *  fetch the default from the DB.
             */

            if (metaOwnerID == null) {
                metaOwnerID = await DAO.meta.getDefaultOwnerID()
            }

            /*  External transaction ID can be passed to prevent duplicates.
                For example if you upload the same vipps report multiple
                times, we must check the vipps transaction ID against the
                stored ones in the database, to ensure that we are not creating
                a duplicate donation. */
            if (externalPaymentID != null) {
                if (await ExternalPaymentIDExists(externalPaymentID,paymentMethodID)) {
                    reject(new Error("EXISTING_DONATION | Already a donation with ExternalPaymentID " + externalPaymentID + " and PaymentID " + paymentMethodID))
                    return false
                }
            }

            var donorID = donorIDQuery[0].Donor_ID

            var [addDonationQuery] = await con.query("INSERT INTO Donations (Donor_ID, Payment_ID, PaymentExternal_ID, sum_confirmed, timestamp_confirmed, KID_fordeling, Meta_owner_ID) VALUES (?,?,?,?,?,?,?)", [donorID, paymentMethodID, externalPaymentID, sum, registeredDate, KID, metaOwnerID])

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
const jsDBmapping = [
    ["id",              "ID"],
    ["donor",           "full_name"],
    ["paymentMethod",   "payment_name"],
    ["sum",             "sum_confirmed"],
    ["transactionCost", "transaction_cost"],
    ["kid",             "KID_fordeling"],
    ["timestamp",       "timestamp_confirmed"]
]

const mapToJS = (obj) => obj.map((donation) => {
    var returnObj = {}
    jsDBmapping.forEach((map) => {
        returnObj[map[0]] = donation[map[1]]
    })
    return returnObj
})
//endregion

module.exports = {
    getAll,
    getByID,
    getAggregateByTime,
    getFromRange,
    getMedianFromRange,
    ExternalPaymentIDExists,
    add,
    registerConfirmedByIDs,
    getHistogramBySum,

    setup: (dbPool, DAOObject) => { con = dbPool, DAO = DAOObject }
}