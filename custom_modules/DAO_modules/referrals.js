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
    let [types] = await con.query(`SELECT * FROM Referral_types`)

    return types
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
        SELECT count(DonorID) as count
            FROM Referral_records
            
            WHERE DonorID = ?
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
 */
async function addRecord(referralTypeID, donorID) {
    let [query] = await con.query(`INSERT INTO Referral_records (ReferralID, UserID) VALUES (?,?)`, [referralTypeID, donorID])

    console.log(query)

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