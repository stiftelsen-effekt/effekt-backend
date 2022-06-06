const sqlString = require('sqlstring')
const distributions = require('./distributions.js')

/**
 * @type {import('mysql2/promise').Pool}
 */
var pool
var DAO

/** @typedef Donation
 * @prop {number} id
 * @prop {string} donor Donor full name
 * @prop {number} donorId
 * @prop {string} email
 * @prop {number} sum 
 * @prop {number} transactionCost
 * @prop {Date} timestamp Timestamp of when the donation was recieved
 * @prop {string} method The name of the payment method used for the donation
 * @prop {string} KID
 */

 /** @typedef DonationSummary
  * @prop {string} organization Name of organization
  * @prop {number} sum
  */

   /** @typedef DonationSummary
  * @prop {string} year Year
  * @prop {number} yearSum Sum of donations per year 
  */

 /** @typedef DonationDistributions
  * @prop {number} donationID
  * @prop {Date} date
  * @prop {Array} distributions
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
        var con = await pool.getConnection()

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

            con.release()
            return {
                rows: mapToJS(donations),
                pages
            }
        }
        else {
            throw new Error("No sort provided")
        }
    } catch(ex) {
        con.release()
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
        var con = await pool.getConnection()
        let [results] = await con.query(`
            SELECT 
                floor(sum_confirmed/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Donations
            GROUP BY 1
            ORDER BY 1;
        `)

        con.release()
        return results
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches the latest donation with a given KID
 * @param {string} KID
 * @returns {Donation | null} Donation of found, null if not 
 */
 async function getLatestByKID(KID) {
    try {
        var con = await pool.getConnection()
        let [results] = await con.query(`
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
                Donation.KID_fordeling = ?

            ORDER BY timestamp_confirmed DESC

            LIMIT 1
        `, [KID])
        con.release()

        if (results.length == 0)
            return null

        const dbDonation = results[0]

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

        return donation
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets all donations by KID
 * @param {string} KID KID number
 * @returns {Array<Donation>} Array of Donation objects
 */
 async function getAllByKID(KID) {
    try {
        var con = await pool.getConnection()

        var [getDonationsByKIDQuery] = await con.query(`
            SELECT *, payment_name FROM Donations as D
                INNER JOIN Payment as P on D.Payment_ID = P.ID
                WHERE KID_fordeling = ?`, 
        [KID])

        if (getDonationsByKIDQuery.length < 1) {
            throw new Error("Could not find any donations with KID " + KID)
        }
        
        let donations = []

        getDonationsByKIDQuery.forEach(donation => {
            donations.push({
                id: donation.ID,
                donor: donation.full_name,
                donorId: donation.donorId,
                email: donation.email,
                sum: donation.sum_confirmed,
                transactionCost: donation.transaction_cost,
                timestamp: donation.timestamp_confirmed,
                paymentMethod: donation.payment_name,
                KID: donation.KID_fordeling
            })
        })

        con.release()
        return donations
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets aggregate donations from a specific time period
 * @param {Date} startTime 
 * @param {Date} endTime
 * @returns {Array} Returns an array of organizations names and their aggregate donations
 */
async function getAggregateByTime(startTime, endTime) {
    try {
        var con = await pool.getConnection()
        var [getAggregateQuery] = await con.query("CALL `get_aggregate_donations_by_period`(?, ?)", [startTime, endTime])

        con.release()
        return getAggregateQuery[0]
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets the total amount of donations recieved er month for the last year, up to
 * and including the current time. Excludes current month in previous year.
 * @returns {Array<{year: number, month: number, sum: number}>}
 */
async function getAggregateLastYearByMonth() {
    try {
        var con = await pool.getConnection()
        var [getAggregateQuery] = await con.query(`
            SELECT 
                extract(YEAR from timestamp_confirmed) as \`year\`,
                extract(MONTH from timestamp_confirmed) as \`month\`, 
                sum(sum_confirmed) as \`sum\`
                
                    FROM EffektDonasjonDB.Donations
                
                WHERE timestamp_confirmed > DATE_SUB(LAST_DAY(now()), interval 1 YEAR)
                
                GROUP BY \`month\`, \`year\`
                
                ORDER BY \`year\`, \`month\`;
        `)

        con.release()
        return getAggregateQuery
    } catch(ex) {
        con.release()
        throw ex
    }
}

async function ExternalPaymentIDExists(externalPaymentID, paymentID) {
    try {
        var con = await pool.getConnection()
        var [res] = await con.query("SELECT * FROM Donations WHERE PaymentExternal_ID = ? AND Payment_ID = ? LIMIT 1", [externalPaymentID, paymentID])
    } catch(ex) {
        con.release()
        throw ex
    }

    con.release()
    if (res.length > 0) return true
    else return false
}

async function GetByExternalPaymentID(externalPaymentID, paymentID) {
    try {
        var con = await pool.getConnection()
        var [res] = await con.query("SELECT * FROM Donations WHERE PaymentExternal_ID = ? AND Payment_ID = ?", [externalPaymentID, paymentID])
    } catch(ex) {
        con.release()
        throw ex
    }

    con.release()
    if (res.length > 0) return res[0]
    else return false
}

/**
 * Gets donation by ID
 * @param {number} donationID 
 * @returns {Donation} A donation object
 */
async function getByID(donationID) {
    try {
        var con = await pool.getConnection()

        var [getDonationFromIDquery] = await con.query(`
            SELECT 
                Donation.ID,
                Donation.sum_confirmed, 
                Donation.KID_fordeling,
                Donation.transaction_cost,
                Donation.timestamp_confirmed,
                Donor.ID as donorId,
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


        if (getDonationFromIDquery.length != 1) {
            throw new Error("Could not find donation with ID " + donationID)
        }

        let dbDonation = getDonationFromIDquery[0]

        /** @type Donation */
        let donation = {
            id: dbDonation.ID,
            donor: dbDonation.full_name,
            donorId: dbDonation.donorId,
            email: dbDonation.email,
            sum: dbDonation.sum_confirmed,
            transactionCost: dbDonation.transaction_cost,
            timestamp: dbDonation.timestamp_confirmed,
            paymentMethod: dbDonation.payment_name,
            KID: dbDonation.KID_fordeling
        }

        //TODO: Standardize split object form
        let split = await distributions.getSplitByKID(donation.KID)
        
        donation.distribution = split.map((split) => ({
            abbriv: split.abbriv,
            share: split.percentage_share
        }))

        con.release()
        return donation
    } catch(ex) {
        con.release()
        throw ex
    }
}

async function getByDonorId(donorId) {
    try {
        var con = await pool.getConnection()
        
        var [donations] = await con.query(`
            SELECT 
                Donation.ID,
                Donation.sum_confirmed, 
                Donation.KID_fordeling,
                Donation.transaction_cost,
                Donation.timestamp_confirmed,
                Donor.ID as donorId,
                Donor.full_name,
                Donor.email,
                Payment.payment_name
            
            FROM Donations as Donation

            INNER JOIN Donors as Donor
                ON Donation.Donor_ID = Donor.ID

            INNER JOIN Payment
                ON Donation.Payment_ID = Payment.ID
            
            WHERE 
                Donation.Donor_ID = ?`, [donorId])

        /** @type Array<Donation> */
        donations = donations.map((dbDonation) => ({
            id: dbDonation.ID,
            donor: dbDonation.full_name,
            donorId: dbDonation.donorId,
            email: dbDonation.email,
            sum: dbDonation.sum_confirmed,
            transactionCost: dbDonation.transaction_cost,
            timestamp: dbDonation.timestamp_confirmed,
            paymentMethod: dbDonation.payment_name,
            KID: dbDonation.KID_fordeling
        }))

        con.release()
        return donations
    } catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets whether or not a donation has replaced inactive organizations
 * @param {number} donationID 
 * @returns {number} zero or one
 */
async function getHasReplacedOrgs(donationID) {
    try {
        var con = await pool.getConnection()

        if (donationID) {
            let [result] = await con.query(`
                select Replaced_old_organizations from Donations as D
                inner join Combining_table as CT on CT.KID = D.KID_fordeling
                where Replaced_old_organizations = 1
                and iD = ?
            `, [donationID])

            con.release()
            return result[0]?.Replaced_old_organizations || 0
        }
    } 
    catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches all the donations in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @param {Array<Integer>} [paymentMethodIDs=null] Provide optional PaymentMethodID to filter to a payment method
 */
async function getFromRange(fromDate, toDate, paymentMethodIDs = null) {
    try {
        var con = await pool.getConnection()

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

            con.release()
            return donations
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches median donation in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @returns {Number|null} The median donation sum if donations exist in range, null else
 */
async function getMedianFromRange(fromDate, toDate) {
    try {
        var con = await pool.getConnection()

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

        if (donations.length === 0) {
            con.release()
            return null
        }

        // Ikke helt presist siden ved partall antall donasjoner vil denne funksjonen
        // returnere det største av de to midterste elementene (om de er ulike), 
        // men tenker det går greit
        const medianIndex = Math.floor(donations.length / 2)

        con.release()
        return parseFloat(donations[medianIndex].sum_confirmed)
    } catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches the total amount of money donated to each organization by a specific donor
 * @param {Number} donorID
 * @returns {Array<DonationSummary>} Array of DonationSummary objects
 */
async function getSummary(donorID) {
    try {
        var con = await pool.getConnection()

        var [res] = await con.query(`SELECT
            Organizations.full_name, 
            (Donations.sum_confirmed * percentage_share / 100) as sum_distribution, 
            transaction_cost, 
            Donations.Donor_ID
        
        FROM Donations
            INNER JOIN Combining_table 
                ON Combining_table.KID = Donations.KID_fordeling
            INNER JOIN Distribution 
                ON Combining_table.Distribution_ID = Distribution.ID
            INNER JOIN Organizations 
                ON Organizations.ID = Distribution.OrgID
        WHERE 
            Donations.Donor_ID = ? 
            
        ORDER BY timestamp_confirmed DESC
         
        LIMIT 10000`, [donorID])

        const summary = []
        const map = new Map()
        for (const item of res) {
            if(!map.has(item.full_name)){
                map.set(item.full_name, true)
                summary.push({
                    organization: item.full_name,
                    sum: 0
                })
            }
        }
        res.forEach(row => {
            summary.forEach(obj => {
                if(row.full_name == obj.organization) {
                    obj.sum += parseFloat(row.sum_distribution)
                }
            })
        })
        
        summary.push({donorID: donorID})

        con.release()
        return summary
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches the total amount of money donated per year by a specific donor
 * @param {Number} donorID
 * @returns {Array<YearlyDonationSummary>} Array of YearlyDonationSummary objects
 */
async function getSummaryByYear(donorID) {
    try {
        var con = await pool.getConnection()

        var [res] = await con.query(`
            SELECT SUM(sum_confirmed) AS yearSum, YEAR(timestamp_confirmed) as year
            FROM Donations 
            WHERE Donor_ID = ? 
            GROUP BY year
            ORDER BY year DESC`, 
            [donorID])

        summary = res;

        con.release()
        return summary
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function getYearlyAggregateByDonorId(donorId) {
    try {
        var con = await pool.getConnection()

        const [res] = await con.query(`
            SELECT
                Organizations.ID as organizationId,
                Organizations.full_name as organization,
                Organizations.abbriv,
                SUM(Donations.sum_confirmed * percentage_share / 100) as value, 
                year(Donations.timestamp_confirmed) as \`year\`

            FROM Donations
                INNER JOIN Combining_table 
                    ON Combining_table.KID = Donations.KID_fordeling
                INNER JOIN Distribution 
                    ON Combining_table.Distribution_ID = Distribution.ID
                INNER JOIN Organizations 
                    ON Organizations.ID = Distribution.OrgID
            WHERE 
                Donations.Donor_ID = ?
                
            GROUP BY Organizations.id, \`year\`
        `, [donorId])

        con.release()
        
        return res
    } catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Fetches all donations recieved by a specific donor
 * @param {Number} donorID
 * @returns {Array<DonationDistributions>}
 */
async function getHistory(donorID) {
    try {
        var con = await pool.getConnection()
        var [res] = await con.query(`
            SELECT
                Organizations.full_name,
                Organizations.abbriv,
                Donations.timestamp_confirmed,
                Donations.ID as donation_id,
                Donations.sum_confirmed as sum_donation,
                Distribution.ID as distribution_id,
                (Donations.sum_confirmed * percentage_share / 100) as sum_distribution
            
            FROM Donations
                INNER JOIN Combining_table ON Combining_table.KID = Donations.KID_fordeling
                INNER JOIN Distribution ON Combining_table.Distribution_ID = Distribution.ID
                INNER JOIN Organizations ON Organizations.ID = Distribution.OrgID

            WHERE Donations.Donor_ID = ?
            
            ORDER BY timestamp_confirmed DESC
            
            LIMIT 10000`, [donorID])

        const history = []
        const map = new Map()
        for (const item of res) {
            if(!map.has(item.donation_id)){
                map.set(item.donation_id, true)
                history.push({
                    donationID: item.donation_id,
                    donationSum: item.sum_donation,
                    date: item.timestamp_confirmed,
                    distributions: []
                })
            }
        }

        res.forEach(row => {
            history.forEach(obj => {
                if(obj.donationID == row.donation_id) {
                    obj.distributions.push({organization: row.full_name, abbriv: row.abbriv, sum: row.sum_distribution})
                }
            })
        })

        con.release()
        return history
    }
    catch(ex) {
        con.release()
        throw ex
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
async function add(KID, paymentMethodID, sum, registeredDate = null, externalPaymentID = null, metaOwnerID = null) {
    try {
        var con = await pool.getConnection()
        var [donorIDQuery] = await con.query("SELECT Donor_ID FROM Combining_table WHERE KID = ? LIMIT 1", [KID])

        if (donorIDQuery.length != 1) { 
            throw new Error("NO_KID | KID " + KID + " does not exist");
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
                throw new Error("EXISTING_DONATION | Already a donation with ExternalPaymentID " + externalPaymentID + " and PaymentID " + paymentMethodID)
            }
        }

        if (typeof registeredDate === "string")
            registeredDate = new Date(registeredDate)


        var donorID = donorIDQuery[0].Donor_ID

        var [addDonationQuery] = await con.query("INSERT INTO Donations (Donor_ID, Payment_ID, PaymentExternal_ID, sum_confirmed, timestamp_confirmed, KID_fordeling, Meta_owner_ID) VALUES (?,?,?,?,?,?,?)", [donorID, paymentMethodID, externalPaymentID, sum, registeredDate, KID, metaOwnerID])

        con.release()
        return addDonationQuery.insertId
    } catch(ex) {
        con.release()
        throw ex
    }
}
//endregion

//region Modify
async function registerConfirmedByIDs(IDs) {
    try {
        var con = await pool.getConnection()
        
        var [donations] = await con.execute(`UPDATE EffektDonasjonDB.Donations 
            SET date_confirmed = NOW()
            WHERE 
            ID IN (` + ("?,").repeat(IDs.length).slice(0,-1) + `)`, IDs)

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

async function updateTransactionCost(transactionCost, donationID) {
    try {
        var con = await pool.getConnection()
        
        await con.execute(`
            UPDATE Donations
            SET transaction_cost = ?
            WHERE ID = ?`, [transactionCost, donationID])

        con.release()
        return true
    }
    catch(ex) {
        con.release()
        throw ex
    }
}

//endregion

//region Delete
/**
 * Deletes a donation from the database
 * @param {number} donationId
 * @returns {boolean} Returns true if a donation was deleted, false else
 */
async function remove(donationId) {
    try {
        var con = await pool.getConnection()
        var result = await con.query(`DELETE FROM Donations WHERE ID = ?`, [donationId])

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
    getAggregateLastYearByMonth,
    getFromRange,
    getMedianFromRange,
    getHasReplacedOrgs,
    getSummary,
    getSummaryByYear,
    getHistory,
    getYearlyAggregateByDonorId,
    getByDonorId,
    getLatestByKID,
    getAllByKID,
    GetByExternalPaymentID,
    ExternalPaymentIDExists,
    updateTransactionCost,
    add,
    registerConfirmedByIDs,
    getHistogramBySum,
    remove,

    setup: (dbPool, DAOObject) => { pool = dbPool, DAO = DAOObject }
}