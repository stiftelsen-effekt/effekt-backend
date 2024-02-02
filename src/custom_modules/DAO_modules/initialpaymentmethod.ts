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
 * Finds all payment intents that require follow-up.
 * @param {number} daysPast - The number of days to check past since the payment intent timestamp.
 */
async function getPaymentIntentsToFollowUp(daysPast) {
  const followUpRequiredPaymentIntents = await DAO.query(
    `
    SELECT pi.*
    FROM Payment_intent pi
    LEFT JOIN Payment_follow_up pfu ON pi.Id = pfu.Payment_intent_id
    WHERE pi.Payment_is_confirmed = 0
      AND pi.timetamp < DATE_SUB(NOW(), INTERVAL ? DAY)
      AND pfu.Id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM Donations d
        WHERE d.timestamp_confirmed >= pi.timetamp AND d.Payment_id = pi.Payment_method
      )
    `,
    [daysPast],
  );

  console.log(followUpRequiredPaymentIntents[0]);

  const paymentIntentIds = followUpRequiredPaymentIntents[0].map((pi) => pi.Id);

  return paymentIntentIds;
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
/**
 * Updates the transaction confirmed status of a payment intent.
 * @param {number} paymentIntentId - The ID of the payment intent.
 */
async function setPaymentConfirmed(paymentIntentId) {
  await DAO.execute(
    `UPDATE Payment_intent
     SET Payment_is_confirmed = 1
     WHERE Id = ?`,
    [paymentIntentId],
  );
}
//endregion

//region Delete
//endregion

export const initialpaymentmethod = {
  getPaymentIntent,
  getPaymentIntentsToFollowUp,
  addPaymentIntent,
  addPaymentFollowUp,
  setPaymentConfirmed,
};
