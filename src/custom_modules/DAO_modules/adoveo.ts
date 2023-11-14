import { Adoveo_fundraiser_transactions, Adoveo_giftcard_transactions } from "@prisma/client";
import { DAO } from "../DAO";

export const adoveo = {
  getFundraiserTransactionByID: async function (id: Adoveo_fundraiser_transactions["ID"]) {
    const [transaction] = await DAO.query<Adoveo_fundraiser_transactions[]>(
      `
            SELECT * FROM Adoveo_fundraiser_transactions WHERE ID = ?
        `,
      [id],
    );
    return transaction?.[0];
  },
  getFundraiserTransactionsByKID: async function (orderID: Adoveo_fundraiser_transactions["KID"]) {
    const [transactions] = await DAO.query<Adoveo_fundraiser_transactions[]>(
      `
            SELECT * FROM Adoveo_fundraiser_transactions WHERE KID = ?
        `,
      [orderID],
    );
    return transactions;
  },
  addFundraiserTransaction: async function (
    transaction: Omit<Adoveo_fundraiser_transactions, "ID">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_fundraiser_transactions (KID, Sum, Timestamp, Sender_email, Sender_phone, Status, Location, Hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        transaction.KID,
        transaction.Sum,
        transaction.Timestamp,
        transaction.Sender_email,
        transaction.Sender_phone,
        transaction.Status,
        transaction.Location,
        transaction.Hash,
      ],
    );

    return result.insertId;
  },
  updateFundraiserTransactionStatus: async function (
    id: Adoveo_fundraiser_transactions["ID"],
    status: string,
  ) {
    await DAO.query(
      `
            UPDATE Adoveo_fundraiser_transactions SET status = ? WHERE ID = ?
        `,
      [status, status],
    );
  },
  getGiftcardTransactionByID: async function (id: Adoveo_giftcard_transactions["ID"]) {
    const [transaction] = await DAO.query<Adoveo_giftcard_transactions[]>(
      `
            SELECT * FROM Adoveo_giftcard_transactions WHERE ID = ?
        `,
      [id],
    );
    return transaction?.[0];
  },
  getGiftcardTransactionsByKID: async function (orderID: Adoveo_giftcard_transactions["KID"]) {
    const [transactions] = await DAO.query<Adoveo_giftcard_transactions[]>(
      `
            SELECT * FROM Adoveo_giftcard_transactions WHERE KID = ?
        `,
      [orderID],
    );
    return transactions;
  },
  addGiftcardTransaction: async function (transaction: Omit<Adoveo_giftcard_transactions, "ID">) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_giftcard_transactions (KID, Sum, Timestamp, Sender_donor_ID, Sender_name, Sender_email, Sender_phone, Receiver_name, Receiver_phone, Message, Status, Location, CouponSend)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
      [
        transaction.KID,
        transaction.Sum,
        transaction.Timestamp,
        transaction.Sender_donor_ID,
        transaction.Sender_name,
        transaction.Sender_email,
        transaction.Sender_phone,
        transaction.Receiver_name,
        transaction.Receiver_phone,
        transaction.Message,
        transaction.Status,
        transaction.Location,
        transaction.CouponSend,
      ],
    );

    return result.insertId;
  },
  updateGiftcardTransactionStatus: async function (
    id: Adoveo_giftcard_transactions["ID"],
    status: string,
  ) {
    await DAO.query(
      `
            UPDATE Adoveo_giftcard_transactions SET status = ? WHERE ID = ?
        `,
      [status, status],
    );
  },
};
