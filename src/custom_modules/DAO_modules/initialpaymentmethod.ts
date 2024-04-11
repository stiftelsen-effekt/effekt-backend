import { Payment_follow_up, Payment_intent } from "@prisma/client";
import { DAO } from "../DAO";
import { KID } from "../KID";

//region Get
/**
 * Fetches a single payment intent by ID.
 */
async function getPaymentIntent(paymentIntentId) {
  const [paymentIntent] = await DAO.query<Payment_intent[]>(
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
 * Fetches all payment intents that were created in the last X days.
 */
async function getPaymentIntentsFromLastMonth() {
  const [paymentIntents] = await DAO.query<Payment_intent[]>(
    `
    SELECT *
    FROM Payment_intent
    WHERE timestamp > DATE_SUB(NOW(), INTERVAL 1 MONTH)
    `,
  );

  return paymentIntents;
}

/**
 * Fetches all follow-ups made for a payment intent.
 * @param {number} paymentIntentId - The IDs of the payment intents.
 * @returns {Promise<object[]>} - The follow-up entries.
 */
async function getFollowUpsForPaymentIntent(paymentIntentId) {
  const [followUps] = await DAO.query<Payment_follow_up[]>(
    `
    SELECT *
    FROM Payment_follow_up
    WHERE Payment_intent_id = ?
    `,
    [paymentIntentId],
  );

  return followUps;
}

/**
 * Checks if a donation has been received for a payment intent.
 * @param {number} paymentIntentId - The ID of the payment intent.
 * @returns {Promise<boolean>} - Whether a donation has been received.
 */
async function checkIfDonationReceived(paymentIntentId) {
  const paymentIntent = await getPaymentIntent(paymentIntentId);
  const paymentMethod = paymentIntent.Payment_method;
  const paymentIntentDate = paymentIntent.timestamp;
  const paymentKID = paymentIntent.KID_fordeling;

  // To determine if the payment intent is paid, check if there have been any donations with the same payment method since the date of the payment intent.
  const [donation] = await DAO.query(
    `
    SELECT * from Donations
    WHERE Payment_ID = ? AND timestamp_confirmed >= ? AND KID_fordeling = ?
    `,
    [paymentMethod, paymentIntentDate, paymentKID],
  );

  return donation.length > 0;
}

//endregion

//region Add
/**
 * Adds a new payment intent to the database
 * @param {number} KID
 * @param {string} paymentMethod
 */
async function addPaymentIntent(paymentAmount, paymentMethod, KID) {
  await DAO.execute(
    `INSERT INTO Payment_intent (
      Payment_amount,
      Payment_method,
      KID_fordeling
      ) VALUES (?, ?, ?)`,
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
//endregion

//region Delete
//endregion

export const initialpaymentmethod = {
  getPaymentIntent,
  getPaymentIntentsFromLastMonth,
  getFollowUpsForPaymentIntent,
  checkIfDonationReceived,
  addPaymentIntent,
  addPaymentFollowUp,
};
