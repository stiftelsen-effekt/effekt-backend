var con

//region Get

/**
 * @typedef DataOwner 
 * @prop {Number} id
 * @prop {String} owner
 * @prop {Boolean} default
 */

/**
 * Gets the diferent data owner actors from the DB
 * @returns {Array<DataOwner>} An array of DataOwner objects
 */
async function getDataOwners() {
    var [res] = await con.query(`SELECT * FROM Data_owner`)
    return res.map((owner) => ({ 
            id: owner.ID,
            owner: owner.owner,
            default: (owner.default == 1 ? true : false)
        })
    )
}

//endregion

//region Add

//endregion

//region Modify

//endregion

//region Delete
//endregion

module.exports = {
    getDataOwners,

    setup: (dbPool) => { con = dbPool }
}