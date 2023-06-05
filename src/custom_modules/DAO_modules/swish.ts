import { Donations, SwishOrder } from "@prisma/client";
import { DAO } from "../DAO";

/**
 * Adds a Vipps order
 * @param {VippsOrder} order
 * @return {number} ID of inserted order
 */
export const swish = {
  getOrder: async function (ID: SwishOrder["ID"]) {
    const [order] = await DAO.query<SwishOrder[]>(
      `
        SELECT * FROM Swish_orders WHERE ID = ?
      `,
      [ID],
    );
    return order?.[0];
  },
  getOrderByInstructionUUID: async function (instructionUUID: string) {
    const [order] = await DAO.query<SwishOrder[]>(
      `
        SELECT * FROM Swish_orders WHERE instructionUUID = ?
      `,
      [instructionUUID],
    );
    return order?.[0];
  },
  addOrder: async function (
    order: Pick<SwishOrder, "KID" | "donorID" | "reference" | "instructionUUID">,
  ) {
    const [result] = await DAO.query(
      `
        INSERT INTO Swish_orders (KID, donorID, reference, instructionUUID)
        VALUES (?, ?, ?, ?)
      `,
      [order.KID, order.donorID, order.reference, order.instructionUUID],
    );

    return result.insertId;
  },
  updateOrderStatus: async function (orderID: SwishOrder["ID"], status: SwishOrder["status"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET status = ? WHERE id = ?
      `,
      [status, orderID],
    );
  },
  updateOrderDonationId: async function (orderID: SwishOrder["ID"], donationID: Donations["ID"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET donationID = ? WHERE id = ?
      `,
      [donationID, orderID],
    );
  },
};
