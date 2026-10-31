import { Payment_follow_up, Payment_intent } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import Decimal from "decimal.js";

/**
 * Fetches all payment intents that were created in the last X days.
 * If a donor has multiple payment intents, only the most recent one is returned.
 */
async function getPaymentIntentsFromLastMonth() {
  const [paymentIntents] = await DAO.query<Payment_intent[]>(
    `
    SELECT pi.*
    FROM Payment_intent pi
    JOIN Distributions d ON pi.KID_fordeling = d.KID
    WHERE pi.timestamp > DATE_SUB(NOW(), INTERVAL 1 MONTH)
    AND pi.timestamp = (
        SELECT MAX(pi2.timestamp)
        FROM Payment_intent pi2
        JOIN Distributions d2 ON pi2.KID_fordeling = d2.KID
        WHERE d2.Donor_ID = d.Donor_ID
        AND pi2.timestamp > DATE_SUB(NOW(), INTERVAL 1 MONTH)
    )
    ORDER BY pi.timestamp DESC;
    `,
  );

  return paymentIntents.map(mapPaymentIntent);
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

  return followUps.map(mapPaymentFollowUp);
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

const mapPaymentIntent = (paymentIntent: SqlResult<Payment_intent>): Payment_intent => {
  return {
    Id: paymentIntent.Id,
    Payment_amount: new Decimal(paymentIntent.Payment_amount!),
    Payment_method: paymentIntent.Payment_method,
    KID_fordeling: paymentIntent.KID_fordeling,
    timestamp: new Date(paymentIntent.timestamp!),
  };
};

const mapPaymentFollowUp = (paymentFollowUp: SqlResult<Payment_follow_up>): Payment_follow_up => {
  return {
    Id: paymentFollowUp.Id,
    Payment_intent_id: paymentFollowUp.Payment_intent_id,
    Follow_up_date: new Date(paymentFollowUp.Follow_up_date),
  };
};

export const initialpaymentmethod = {
  getPaymentIntentsFromLastMonth,
  getFollowUpsForPaymentIntent,
  addPaymentIntent,
  addPaymentFollowUp,
};
