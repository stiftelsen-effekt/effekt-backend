import { DAO } from "../DAO";

//region Get
/**
 * Fetches a single payment intent by ID.
 * @param {number} paymentIntentId - The ID of the payment intent.
 */
async function getPaymentIntent(paymentIntentId) {
  const [paymentIntent] = await DAO.query(
    `
    SELECT *
    FROM Payment_intent
    WHERE Id = ?
    `,
    [paymentIntentId],
  );

  return paymentIntent[0];
}

/**
 * Fetches all payment intents that require follow-up.
 * @param {number} daysBeforeFollowUp - The number of days to wait before following up.
 * @param {number} maxFollowUps - The maximum number of follow-ups allowed.
 * @returns {Array<Object>} An array of payment intents that require follow-up.
 */
async function getPaymentIntentsForFollowUp(daysBeforeFollowUp, maxFollowUps) {
  const [paymentIntents] = await DAO.query(
    `
    SELECT 
      Payment_intent.Id,
      Payment_intent.Payment_amount,
      Payment_intent.Payment_method,
      Payment_intent.KID_fordeling,
      Payment_intent.Timestamp,
      Payment_intent.Transaction_confirmed,
      COUNT(Payment_follow_up.Payment_intent_id) AS follow_up_count
    FROM Payment_intent
    LEFT JOIN Payment_follow_up
      ON Payment_intent.Id = Payment_follow_up.Payment_intent_id
    WHERE 
      Payment_intent.Transaction_confirmed = 0 AND
      Payment_intent.Timestamp <= DATE_SUB(NOW(), INTERVAL ? DAY) AND
      COUNT(Payment_follow_up.Payment_intent_id) < ?
    GROUP BY Payment_intent.Id
    `,
    [daysBeforeFollowUp, maxFollowUps],
  );

  return paymentIntents;
}

/**
 * Checks if a donation has been received within x days after the payment intent was registered.
 * @param {number} paymentIntentId - The ID of the payment intent.
 * @param {number} days - The number of days to check for a donation.
 * @returns {boolean} True if a donation has been received, otherwise false.
 */
async function checkDonationReceived(paymentIntentId, days) {
  const [result] = await DAO.query(
    `
    SELECT EXISTS(
      SELECT 1
      FROM Donations
      WHERE 
        Donations.KID_fordeling = (
          SELECT KID_fordeling
          FROM Payment_intent
          WHERE Id = ?
        ) AND
        Donations.timestamp_confirmed >= DATE_SUB(
          (SELECT Timestamp
           FROM Payment_intent
           WHERE Id = ?),
          INTERVAL ? DAY)
    ) AS donation_received
    `,
    [paymentIntentId, paymentIntentId, days],
  );

  return result[0].donation_received === 1;
}
//endregion

//region Add
/**
 * Adds a new payment intent to the database.
 * @param {number} paymentAmount - The amount of the intended donation.
 * @param {string} paymentMethod - The chosen payment method.
 * @param {number} KID - The KID of the donation distribution.
 */
async function addPaymentIntent(paymentAmount, paymentMethod, KID) {
  await DAO.execute(
    `INSERT INTO Payment_intent (
            Payment_amount,
            Payment_method,
            KID_fordeling,
            Timestamp,
        ) VALUES (?, ?, ?, NOW())`,
    [paymentAmount, paymentMethod, KID],
  );
}

/**
 * Adds a follow-up entry for a payment intent.
 * @param {number} paymentIntentId - The ID of the payment intent.
 * @param {Date} followUpDate - The date when the follow-up was made.
 */
async function addPaymentFollowUp(paymentIntentId, followUpDate) {
  await DAO.execute(
    `INSERT INTO Payment_follow_up (
            Payment_intent_id,
            Follow_up_date
        ) VALUES (?, ?)`,
    [paymentIntentId, followUpDate],
  );
}
//endregion

//region Modify
/**
 * Updates the transaction confirmed status of a payment intent.
 * @param {number} paymentIntentId - The ID of the payment intent.
 * @param {boolean} transactionConfirmed - The new transaction confirmed status.
 */
async function updateTransactionConfirmed(paymentIntentId, transactionConfirmed) {
  await DAO.execute(
    `UPDATE Payment_intent
     SET Transaction_confirmed = ?
     WHERE Id = ?`,
    [transactionConfirmed ? 1 : 0, paymentIntentId],
  );
}
//endregion

//region Delete
//endregion

export const initialpaymentmethod = {
  getPaymentIntent,
  getPaymentIntentsForFollowUp,
  addPaymentIntent,
  addPaymentFollowUp,
  checkDonationReceived,
  updateTransactionConfirmed,
};
