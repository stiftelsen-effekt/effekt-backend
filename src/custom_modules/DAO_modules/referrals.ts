import { DAO } from "../DAO";

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
  let [types] = await DAO.query(`
        SELECT * FROM Referral_types 
            WHERE is_active = 1
            ORDER BY ordering`);

  return types.map((type) => ({
    id: type.ID,
    name: type.name,
    ordering: type.ordering,
  }));
}

/**
 * Counts up all the referrals from the referral records
 * @returns {Array<ReferralTypeAggregate>}
 */
async function getAggregate() {
  let [aggregates] = await DAO.query(`
        SELECT Referral_types.ID, Referral_types.name, count(ReferralID) as count
            FROM Referral_records
            
            INNER JOIN Referral_types
                ON Referral_records.ReferralID = Referral_types.ID
            
            GROUP BY Referral_records.ReferralID`);

  return aggregates;
}

/**
 * Checks if the donor has answered referral question before
 * @param {number} donorID
 */
async function getDonorAnswered(donorID) {
  let [answersCount] = await DAO.query(
    `
        SELECT count(UserID) as count
            FROM Referral_records
            
            WHERE UserID = ?
    `,
    [donorID]
  );

  if (answersCount[0].count > 0) return true;
  else return false;
}

/**
 * Gets all referrals for a user
 * @param {number} donorID
 */
async function getDonorAnswers(donorID) {
  let [answers] = await DAO.query(
    `
        SELECT
          r.id AS id, t.id AS typeId, r.UserId AS donorId, r.Registered AS timestamp, r.website_session AS session, t.is_active AS active,
          CASE r.ReferralID
            WHEN 10 THEN r.other_comment
            ELSE t.name END
              AS answer
          FROM Referral_records r
            JOIN Referral_types t
              ON r.ReferralID = t.ID
          WHERE r.UserId = ?
          ORDER BY id;
    `,
    [donorID]
  );

  return answers;
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
  let [query] = await DAO.query(
    `INSERT INTO Referral_records (ReferralID, UserID, other_comment) VALUES (?,?,?)`,
    [referralTypeID, donorID, otherComment]
  );

  return true;
}
//endregion

//region Modify

//endregion

//region Delete
//endregion

//Helpers
export const referrals = {
  getTypes,
  getAggregate,
  getDonorAnswered,
  getDonorAnswers,
  addRecord,
};
