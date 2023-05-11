import { DAO } from "../DAO";

//region Get
//endregion

//region Add
/**
 * Adds a new payment intent to the database
 * @param {number} KID
 * @param {string} paymentMethod
 */

async function addPaymentIntent(KID, paymentMethod) {
  var res = await DAO.execute(
    `INSERT INTO Payment_intent (
            Payment_method,
            KID_fordeling) VALUES (?,?)`,
    [paymentMethod, KID],
  );

  return res.insertId;
}
//endregion

//region Modify
//endregion

//region Delete
//endregion

export const initialpaymentmethod = {
  addPaymentIntent,
};
