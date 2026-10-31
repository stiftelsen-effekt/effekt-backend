import { Swish_orders } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import paymentMethods from "../../enums/paymentMethods";

/** Swish statuses after which an order never changes again */
export const FINAL_SWISH_ORDER_STATUSES = ["PAID", "DECLINED", "ERROR", "CANCELLED"];

export const swish = {
  getOrderByID: async function (
    ID: Swish_orders["ID"],
  ): Promise<SqlResult<Swish_orders> | undefined> {
    const [order] = await DAO.query<Swish_orders[]>(
      `
        SELECT * FROM Swish_orders WHERE ID = ?
      `,
      [ID],
    );
    return order?.[0];
  },
  getOrderByInstructionUUID: async function (
    instructionUUID: string,
  ): Promise<SqlResult<Swish_orders> | undefined> {
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
  /**
   * Sets a non-final status. Does nothing if the order already has a final status (another
   * request got there first). Returns whether the order was updated.
   */
  updateOrderStatus: async function (
    orderID: Swish_orders["ID"],
    status: Swish_orders["status"],
  ): Promise<boolean> {
    const [result] = await DAO.query(
      `
        UPDATE Swish_orders SET status = ?
        WHERE ID = ? AND (status IS NULL OR status NOT IN (?))
      `,
      [status, orderID, FINAL_SWISH_ORDER_STATUSES],
    );
    return result.affectedRows === 1;
  },
  /**
   * Records the donation for a paid order and marks the order PAID, in one transaction.
   * The order row is locked first, so the Swish callback and the status polling can't both
   * record it. Returns the new donation's ID, or null if the order already had a final status.
   * If anything fails, nothing is changed and the next callback or poll can try again.
   */
  completePaidOrder: async function (
    orderID: Swish_orders["ID"],
    donation: { amount: number; timestamp: Date },
  ): Promise<number | null> {
    const transaction = await DAO.startTransaction();
    try {
      const [rows] = await transaction.query<any[]>(
        `SELECT ID, KID, status, instructionUUID FROM Swish_orders WHERE ID = ? FOR UPDATE`,
        [orderID],
      );
      const order = rows[0] as
        Pick<Swish_orders, "ID" | "KID" | "status" | "instructionUUID"> | undefined;
      if (!order || (order.status && FINAL_SWISH_ORDER_STATUSES.includes(order.status))) {
        await DAO.rollbackTransaction(transaction);
        return null;
      }

      // The instruction UUID is unique per payment request, so it is used as the donation's
      // external ID (the payee reference shown in Swish is only random digits and can repeat)
      const donationID = await DAO.donations.add(
        order.KID,
        paymentMethods.swish,
        donation.amount,
        donation.timestamp,
        order.instructionUUID,
        null,
        transaction,
      );
      await transaction.query(
        `UPDATE Swish_orders SET status = 'PAID', donationID = ? WHERE ID = ?`,
        [donationID, orderID],
      );
      await DAO.commitTransaction(transaction);
      return donationID;
    } catch (ex) {
      await DAO.rollbackTransaction(transaction);
      throw ex;
    }
  },
};
