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

function getByID(ID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [organization] = await con.execute("SELECT * FROM Organizations WHERE ID = ? LIMIT 1", [ID])
        }
        catch (ex) {
            reject(ex)
        }
        
        if (organization.length > 0) fulfill(organization[0])
        else fulfill(null)
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

        fulfill(organizations.map(mapOrganization))
    })
}

/**
 * Returns all organizations in the database
 * @returns {Array} All organizations in DB
 */
function getAll() {
    return new Promise(async (fulfill, reject) => {
        try {
            var [organizations] = await con.execute(`SELECT * FROM Organizations`)
        }
        catch (ex) {
            return reject(ex)
        }

        fulfill(organizations.map(mapOrganization))
    })
}

function getStandardSplit() {
    return new Promise(async (fulfill, reject) => {
        try {
            var [standardSplit] = await con.execute(`SELECT * FROM Organizations WHERE std_percentage_share > 0 AND is_active = 1`)
        }
        catch(ex) {
            return reject(ex)
        }

        if (standardSplit.reduce((acc, org) => acc+=org.std_percentage_share, 0) != 100) reject(Error("Standard split does not sum to 100 percent"))

        fulfill(standardSplit.map((org) => {
            return {
                organizationID: org.ID,
                name: org.full_name,
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

//region Helpers
/**
 * Used in array.map, used to map database rows to JS like naming
 * @param {Object} org A line from a database query representing an organization
 * @returns {Object} A mapping with JS like syntax instead of the db fields, camel case instead of underscore and so on 
 */
function mapOrganization(org) {
    return {
        id: org.ID,
        name: org.full_name,
        abbriv: org.abbriv,
        shortDesc: org.short_desc,
        standardShare: org.std_percentage_share,
        infoUrl: org.info_url
    }
}

module.exports = {
    getByIDs,
    getByID,
    getActive,
    getAll,
    getStandardSplit,

    setup: (dbPool) => { con = dbPool }
}