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

/**
 * Checks if the donor has answered referral question before in the same website session
 * @param {number} donorID 
 */
 async function getWebsiteSessionReferral(websiteSession) {
    let [answersCount] = await con.query(`
        SELECT count(UserID) as count
        FROM Referral_records
        WHERE website_session = ?
    `, [websiteSession])

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
async function addRecord(referralTypeID, donorID, otherComment, websiteSession) {
    let [query] = await con.query(`
        INSERT INTO Referral_records
        (ReferralID, UserID, other_comment, website_session)
        VALUES (?,?,?,?)`, [referralTypeID, donorID, otherComment, websiteSession]
    )
    return true
}
//endregion

//region Modify
/**
 * Update a referral record (allows donors to correct a missclick in the widget)
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} otherComment
 */
 async function updateRecord(referralTypeID, donorID, otherComment, websiteSession) {
    if (websiteSession == "") return false

    let [query] = await con.query(`
        UPDATE Referral_records
        SET ReferralID = ?, other_comment = ?, website_session = ?
        WHERE (UserID = ? and UserID != 1464)
        OR (UserID = 1464 and website_session = ?)`,
        [referralTypeID, otherComment, websiteSession, donorID, websiteSession]
    )

    return query
}

//endregion

//region Delete
//endregion

//Helpers

module.exports = {
    getTypes,
    getAggregate,
    getDonorAnswered,
    getWebsiteSessionReferral,
    addRecord,
    updateRecord,

    setup: (dbPool) => { con = dbPool }
}