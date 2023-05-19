import { Payment } from "@prisma/client";
import { DAO, PrismaType } from "../DAO";

//region Get
/**
 * Get payment methods from database
 * @returns {Array} An array of payment method objects
 */
async function getMethods() {
  var [res] = await DAO.query<Payment[]>(`SELECT * FROM Payment`);

  if (res.length > 0) {
    return mapDBpaymentToObject(res);
  } else {
    return null;
  }
}

/**
 * Gets payment methods filtered by provided ID's
 * @param paymentMethodIDs The payment method ID's to filter on
 * @returns {Array} An array of payment method objects
 */
async function getPaymentMethodsByIDs(paymentMethodIDs) {
  var [res] = await DAO.query<Payment[]>(
    `SELECT * FROM Payment 
                                        WHERE ID IN (?)`,
    [paymentMethodIDs],
  );

  if (res.length > 0) {
    return mapDBpaymentToObject(res);
  } else {
    return null;
  }
}

//endregion

//region Add

//endregion

//region Modify

//endregion

//region Delete
//endregion

//Helpers
function mapDBpaymentToObject(dbPaymentObject: PrismaType<Payment>[]) {
  return dbPaymentObject.map((method) => {
    return {
      id: method.ID,
      name: method.payment_name,
      abbriviation: method.abbriv,
      shortDescription: method.short_desc,
      flatFee: method.flat_fee,
      percentageFee: method.percentage_fee,
      lastUpdated: method.lastUpdated,
    };
  });
}

export const payment = {
  getMethods,
  getPaymentMethodsByIDs,
};
