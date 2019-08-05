const sqlString = require('sqlstring')

var con

//region GET

/**
 * Checks whether given KID exists in DB
 * @param {number} KID 
 * @returns {boolean}
 */
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

/**
 * Takes in a distribution array and a Donor ID, and returns the KID if the specified distribution exists for the given donor.
 * @param {array<object>} split 
 * @param {number} donorID 
 * @returns {number | null} KID or null if no KID found
 */
function getKIDbySplit(split, donorID) {
    return new Promise(async (fulfill, reject) => {
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

/**
 * Gets organizaitons and distribution share from a KID
 * @param {number} KID 
 */
function getSplitByKID(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            let [result] = await con.query(`
                SELECT 
                    Organizations.full_name,
                    Organizations.abbriv, 
                    Distribution.percentage_share
                
                FROM Combining_table as Combining
                    INNER JOIN Distribution as Distribution
                        ON Combining.Distribution_ID = Distribution.ID
                    INNER JOIN Organizations as Organizations
                        ON Organizations.ID = Distribution.OrgID
                
                WHERE 
                    KID = ?`, [KID])

            if (result.length == 0) return reject(new Error("No distribution with the KID " + KID))

            return fulfill(result)
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

//region add
/**
 * Adds a given distribution to the databse, connected to the supplied DonorID and the given KID
 * @param {Array<object>} split 
 * @param {number} KID 
 * @param {number} donorID 
 */
function add(split, KID, donorID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var transaction = await con.startTransaction()

            let distribution_table_values = split.map((item) => {return [item.organizationID, item.share]})
            var res = await transaction.query("INSERT INTO Distribution (OrgID, percentage_share) VALUES ?", [distribution_table_values])

            let first_inserted_id = res[0].insertId
            var combining_table_values = Array.apply(null, Array(split.length)).map((item, i) => {return [donorID, first_inserted_id+i, KID]})

            //Update combining table
            var res = await transaction.query("INSERT INTO Combining_table (Donor_ID, Distribution_ID, KID) VALUES ?", [combining_table_values])

            con.commitTransaction(transaction)
            fulfill(true)
        } catch(ex) {
            con.rollbackTransaction(transaction)
            reject(ex)
        }
    })
}
//endregion

module.exports = {
    KIDexists,
    getKIDbySplit,
    getSplitByKID,
    getHistoricPaypalSubscriptionKIDS,

    add,

    setup: (dbPool) => { con = dbPool }
}