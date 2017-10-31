var con

//region Get
function getByIDs(IDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [organizations] = await con.execute("SELECT * FROM Organizations WHERE ID in (" + ("?,").repeat(IDs.length).slice(0,-1) + ")", IDs)
        }
        catch (ex) {
            reject(ex)
        }
        
        fulfill(organizations)
    })
}

function getActive() {
    return new Promise(async (fulfill, reject) => {
        try {
            var [organizations] = await con.execute(`SELECT * FROM Organizations WHERE is_active = 1`)
        }
        catch (ex) {
            return reject(ex)
        }

        fulfill(organizations.map((org) => {
            return {
                id: org.ID,
                name: org.full_name,
                abbriv: org.abbriv,
                shortDesc: org.short_desc,
                standardShare: org.std_percentage_share,
                infoUrl: org.info_url
            }
        }))
    })
}

function getStandardSplit() {
    return new Promise(async (fulfill, reject) => {
        try {
            var [standardSplit] = await con.execute(`SELECT * FROM Organizations WHERE std_percentage_share > 0 AND active = 1`)
        }
        catch(ex) {
            return reject(ex)
        }

        fulfill(standardSplit.map((org) => {
            return {
                organizationID: org.ID,
                name: org.org_full_name,
                share: org.std_percentage_share
            }
        }))
    })
}
//endregion

//region Add
//endregion

//region Modify
//endregion

//region Delete
//endregion

module.exports = function(dbPool) {
    con = dbPool

    return {
        getByIDs,
        getActive,
        getStandardSplit
    }
} 