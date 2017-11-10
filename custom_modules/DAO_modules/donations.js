//const rounding = require('./rounding.js')
const KID = require('../KID.js')
const sqlString = require('sqlstring')

var con

//region Get

function getByDonor(KID) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}

function getByID(ID) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}

function getAggregateByTime(startTime, endTime) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}

function KIDexists(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query("SELECT * FROM EffektDonasjonDB.Combining_table WHERE KID = ? LIMIT 1", [KID])
        } catch(ex) {
            reject(ex)
        }

        if (res.length > 0) fulfill(true)
        else fulfill(false)
    })
}

function getKIDbySplit(split) {
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
                query += `(OrgID = ${sqlString.escape(split[i].organizationID)} AND percentage_share = ${sqlString.escape(split[i].share)})`
                if (i < split.length-1) query += ` OR `
            }

            query += ` GROUP BY C.KID
            
            HAVING KID_count = ` + split.length

            var [res] = await con.execute(query)
        } catch(ex) {
            reject(ex)
        }

        if (res.length > 0) fulfill(res[0].KID)
        else fulfill(null)
    })
}

//endregion

//region Add
function addSplit(split, KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            let values = split.map((item) => {return [item.organizationID, item.share]})
            var res = await con.query("INSERT INTO Distribution (OrgID, percentage_share) VALUES ?", [values])
        } catch(ex) {
            reject(ex)
        }

        fulfill(true)
    })
}

function add(donationObject) {
    return new Promise(async (fulfill, reject) => {
        reject(Error("Not implemented"))
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
function generateKID() {

}
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