import { Donors, Referral_records, Referral_types } from "@prisma/client";
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
  let [types] = await DAO.query<Referral_types[]>(`
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
  let [aggregates] = await DAO.query<(Pick<Referral_types, "ID" | "name"> & { count: number })[]>(`
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
async function getDonorAnswered(donorID: Donors["ID"]) {
  let [answersCount] = await DAO.query<{ count: number }[]>(
    `
        SELECT count(UserID) as count
            FROM Referral_records
            
            WHERE UserID = ?
    `,
    [donorID],
  );

  if (answersCount[0].count > 0) return true;
  else return false;
}

/**
 * Gets all referrals for a user
 * @param {number} donorID
 */
async function getDonorAnswers(donorID: Donors["ID"]) {
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
    [donorID],
  );

  return answers;
}

//endregion

//region Add
/**
 * Adds a referral record
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} session Used to isolate referrals of the a single session in the widget. We need this to seperate anonymous donors.
 * @param {string} otherComment
 * @returns {boolean} Indicates whether the record was saved
 */
async function addRecord(referralTypeID, donorID, session, otherComment) {
  let result = await DAO.query(
    `INSERT INTO Referral_records (ReferralID, UserID, website_session, other_comment) VALUES (?,?,?,?)`,
    [referralTypeID, donorID, session, otherComment],
  );

  if (result[0].affectedRows > 0) return true;
  else return false;
}

/**
 * Checks whether a record with the given donor id and referral type id and session exists, return true or false
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} session Used to isolate referrals of the a single session in the widget. We need this to seperate anonymous donors.
 * @returns {boolean} Indicates whether the record is exist
 */
async function checkRecordExist(referralTypeID, donorID, session) {
  let [result] = await DAO.query(
    `select * from Referral_records where ReferralID = ? and UserID = ? and website_session = ?`,
    [referralTypeID, donorID, session],
  );

  if (result.length > 0) return true;
  else return false;
}
//endregion

//region Modify
/**
 * Updates the comment field for an existing referral record with a given donor id, referral type id and session
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} session Used to isolate referrals of the a single session in the widget. We need this to seperate anonymous donors.
 * @param {string} otherComment
 * @returns {boolean} Indicates whether the record was updated
 */
async function updateRecordComment(referralTypeID, donorID, session, otherComment) {
  let result = await DAO.query(
    `UPDATE Referral_records SET other_comment = ? WHERE UserID = ? AND ReferralID = ? AND website_session = ?`,
    [otherComment, donorID, referralTypeID, session],
  );

  if (result[0].affectedRows > 0) return true;
  else return false;
}
//endregion

//region Delete
/**
 * Removes a record with a given donor id and referral type id
 * @param {number} referralTypeID
 * @param {number} donorID
 * @param {string} session Used to isolate referrals of the a single session in the widget. We need this to seperate anonymous donors.
 * @returns {boolean} Indicates whether the record was deleted
 */
async function deleteRecord(referralTypeID, donorID, session) {
  let result = await DAO.query(
    `DELETE FROM Referral_records WHERE ReferralID = ? and UserID = ? and website_session = ?`,
    [referralTypeID, donorID, session],
  );

  if (result[0].affectedRows > 0) return true;
  else return false;
}

//endregion

//Helpers
export const referrals = {
  getTypes,
  getAggregate,
  getDonorAnswered,
  getDonorAnswers,
  addRecord,
  updateRecordComment,
  checkRecordExist,
  deleteRecord,
};
