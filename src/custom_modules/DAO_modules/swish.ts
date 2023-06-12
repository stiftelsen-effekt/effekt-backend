import { Donations, Swish_order } from "@prisma/client";
import { DAO } from "../DAO";

export const swish = {
  getOrderByKID: async function (KID: Swish_order["KID"]) {
    const [order] = await DAO.query<Swish_order[]>(
      `
        SELECT * FROM Swish_orders WHERE KID = ?
      `,
      [KID],
    );
    return order?.[0];
  },
  getOrderByInstructionUUID: async function (instructionUUID: string) {
    const [order] = await DAO.query<Swish_order[]>(
      `
        SELECT * FROM Swish_orders WHERE instructionUUID = ?
      `,
      [instructionUUID],
    );
    return order?.[0];
  },
  addOrder: async function (
    order: Pick<Swish_order, "KID" | "donorID" | "reference" | "instructionUUID">,
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
  updateOrderStatus: async function (orderID: Swish_order["ID"], status: Swish_order["status"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET status = ? WHERE id = ?
      `,
      [status, orderID],
    );
  },
  updateOrderDonationId: async function (orderID: Swish_order["ID"], donationID: Donations["ID"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET donationID = ? WHERE id = ?
      `,
      [donationID, orderID],
    );
  },
};
