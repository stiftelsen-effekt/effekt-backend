var con

//region Get

/**
 * @typedef ReferralType
 * @property {number} ID
 * @property {string} name
 */

/**
 * @typedef ReferralTypeAggregateAugmentation
 * @property {number} count 
 * 
 * @typedef {ReferralType & ReferralTypeAggregateAugmentation} ReferralTypeAggregate
 */

/**
 * Gets all referral types
 * @returns {Array<ReferralType>} An array of payment method objects
 */
async function getTypes() {
    let [types] = await con.query(`
        SELECT * FROM Referral_types 
            WHERE is_active = 1
            ORDER BY ordering`)

    return types.map((type) => ({
        id: type.ID, 
        name: type.name, 
        ordering: type.ordering
    }))
}

/**
 * Counts up all the referrals from the referral records
 * @returns {Array<ReferralTypeAggregate>}
 */
async function getAggregate() {
    let [aggregates] = await con.query(`
        SELECT Referral_types.ID, Referral_types.name, count(ReferralID) as count
            FROM Referral_records
            
            INNER JOIN Referral_types
                ON Referral_records.ReferralID = Referral_types.ID
            
            GROUP BY Referral_records.ReferralID`)

    return aggregates
}

/**
 * Checks if the donor has answered referral question before
 * @param {number} donorID 
 */
async function getDonorAnswered(donorID) {
    let [answersCount] = await con.query(`
        SELECT count(UserID) as count
            FROM Referral_records
            
            WHERE UserID = ?
    `, [donorID])

    if (answersCount[0].count > 0) return true
    else return false
}

//endregion

//region Add
/**
 * Adds a referral record
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} otherComment
 */
async function addRecord(referralTypeID, donorID, otherComment) {
    let [query] = await con.query(`INSERT INTO Referral_records (ReferralID, UserID, other_comment) VALUES (?,?,?)`, [referralTypeID, donorID, otherComment])

    return true
}
//endregion

//region Modify

//endregion

//region Delete
//endregion

//Helpers

module.exports = {
    getTypes,
    getAggregate,
    getDonorAnswered,
    addRecord,

    setup: (dbPool) => { con = dbPool }
}