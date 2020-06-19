var con 

function getSummary(donorID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query(`SELECT
            Organizations.full_name, (Donations.sum_confirmed * percentage_share / 100) as sum_distribution, transaction_cost
            FROM Donations
            INNER JOIN Combining_table ON Combining_table.KID = Donations.KID_fordeling
            INNER JOIN Distribution ON Combining_table.Distribution_ID = Distribution.ID
            INNER JOIN Organizations ON Organizations.ID = Distribution.OrgID
            where Donations.Donor_ID = ` + donorID + ` ORDER BY timestamp_confirmed DESC limit 10000`)

            var summary = {}
            
            res.forEach(row => {
                if(row.full_name in summary) {
                    summary[row.full_name] += parseInt(row.sum_distribution)
                }
                else {
                    summary[row.full_name] = parseInt(row.sum_distribution)
                }
            })
            console.log(summary)

            if (res.length > 0) {
                fulfill(summary)
            } else {
                fulfill(null)
            }
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}

function getHistory(donorID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query(`SELECT
            Organizations.full_name organizationName,
            Donations.timestamp_confirmed,
            Donations.ID as donation_id,
            Distribution.ID as distribution_id,
            (Donations.sum_confirmed * percentage_share / 100) as sum_distribution
            FROM Donations
            INNER JOIN Combining_table ON Combining_table.KID = Donations.KID_fordeling
            INNER JOIN Distribution ON Combining_table.Distribution_ID = Distribution.ID
            INNER JOIN Organizations ON Organizations.ID = Distribution.OrgID
            where Donations.Donor_ID = ` + donorID + ` ORDER BY timestamp_confirmed DESC limit 10000`)

            console.log(res)
            console.log(res[0].donation_id)
            history = {}

            // [{
            //   date: "", 
            //    donationID: "", 
            //    distributions: [{
            //        Organizations.full_name: "", 
            //        sumDistribution: ""
            //    }]
            // }]

            res.forEach(row => {
                console.log(row.donation_id)
                if(row.donation_id in history) {
                    history[row.donation_id].push({date: row.timestamp_confirmed, organization: row.organizationName, sum: row.sum_distribution})
                }
                else {
                    history[row.donation_id] = []
                    history[row.donation_id].push({date: row.timestamp_confirmed, organization: row.organizationName, sum: row.sum_distribution})
                }
            })

            if (res.length > 0) {
                fulfill(history)
            } else {
                fulfill(null)
            }
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}

//region Helpers
function mapHistory(historyObject) {
    return historyObject.map((dist) => {
        return {
            fullName: dist.full_name,
            timestampConfirmed: dist.timestamp_confirmed,
            sumDistribution: dist.sum_distribution
        }
    })
}

module.exports = {
    getHistory,
    getSummary,
    setup: (dbPool) => { con = dbPool }
}