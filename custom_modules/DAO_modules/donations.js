const sqlString = require('sqlstring')

var con

//region Get

function getByDonor(KID) {
    return new Promise(async (fulfill, reject) => {
        return reject(new Error("Not implemented"))
    })
}

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
            var [res] = await con.query("SELECT * FROM EffektDonasjonDB.Combining_table WHERE KID = ? LIMIT 1", [KID])
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
            let query = `SELECT KID, Count(KID) as KID_count FROM EffektDonasjonDB.Distribution as D
            
            INNER JOIN Combining_table as C 
            ON C.Distribution_ID = D.ID
            
            WHERE
            `;
            
            for (let i = 0; i < split.length; i++) {
                query += `(OrgID = ${sqlString.escape(split[i].organizationID)} AND percentage_share = ${sqlString.escape(split[i].share)} AND Donor_ID = ${sqlString.escape(donorID)})`
                if (i < split.length-1) query += ` OR `
            }

            query += ` GROUP BY C.KID
            
            HAVING KID_count = ` + split.length

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

            var [getDonationFromIDquery] = await con.execute(`SELECT 
                Donation.sum_confirmed, 
                Donation.KID_fordeling,
                Donor.full_name,
                Donor.email
                FROM 
                    Donations as Donation
                INNER JOIN 
                    Donors as Donor
                ON 
                    Donation.Donor_ID = Donor.ID
                WHERE Donation.ID = ${sqlString.escape(donationID)}`)


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
            let [getOrganizationsSplitByKIDQuery] = await con.execute(`SELECT 
            Organizations.full_name, Distribution.percentage_share
            FROM Combining_table as Combining
            INNER JOIN Distribution as Distribution
            ON Combining.Distribution_ID = Distribution.ID
            INNER JOIN Organizations as Organizations
            ON Organizations.ID = Distribution.OrgID
            WHERE KID = ${sqlString.escape(KID)}`)

            if (getOrganizationsSplitByKIDQuery.length == 0) return reject("No split with the KID " + KID)

            return fulfill(getOrganizationsSplitByKIDQuery)
        } catch(ex) {
            reject(ex)
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

function add(KID, paymentMethodID, sum) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donorIDQuery] = await con.query("SELECT Donor_ID FROM Combining_table WHERE KID = ? LIMIT 1", [KID])

            if (donorIDQuery.length != 1) { 
                reject("KID " + KID + " does not exist");
                return false;
            }

            var donorID = donorIDQuery[0].Donor_ID

            var [addDonationQuery] = await con.query("INSERT INTO Donations (Donor_ID, Payment_ID, sum_confirmed, KID_fordeling) VALUES (?,?,?,?)", [donorID, paymentMethodID, sum, KID])

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

module.exports = function(dbPool) {
    con = dbPool

    return {
        getByID,
        getByDonor,
        getAggregateByTime,
        getKIDbySplit,
        KIDexists,
        addSplit,
        add,
        registerConfirmedByIDs
    }
}