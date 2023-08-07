import { Donations, Swish_orders } from "@prisma/client";
import { DAO } from "../DAO";

export const swish = {
  getOrderByID: async function (ID: Swish_orders["ID"]) {
    const [order] = await DAO.query<Swish_orders[]>(
      `
        SELECT * FROM Swish_orders WHERE ID = ?
      `,
      [ID],
    );
    return order?.[0];
  },
  getOrderByInstructionUUID: async function (instructionUUID: string) {
    const [order] = await DAO.query<Swish_orders[]>(
      `
        SELECT * FROM Swish_orders WHERE instructionUUID = ?
      `,
      [instructionUUID],
    );
    return order?.[0];
  },
  addOrder: async function (
    order: Pick<Swish_orders, "KID" | "donorID" | "reference" | "instructionUUID">,
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
  updateOrderStatus: async function (orderID: Swish_orders["ID"], status: Swish_orders["status"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET status = ? WHERE id = ?
      `,
      [status, orderID],
    );
  },
  updateOrderDonationId: async function (orderID: Swish_orders["ID"], donationID: Donations["ID"]) {
    await DAO.query(
      `
        UPDATE Swish_orders SET donationID = ? WHERE id = ?
      `,
      [donationID, orderID],
    );
  },
};
