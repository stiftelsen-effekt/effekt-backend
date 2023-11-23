import {
  Adoveo_fundraiser,
  Adoveo_fundraiser_org_shares,
  Adoveo_fundraiser_transactions,
  Adoveo_giftcard_transactions,
} from "@prisma/client";
import { DAO } from "../DAO";

export const adoveo = {
  getFundraiserByID: async function (id: Adoveo_fundraiser["ID"]) {
    const [fundraiser] = await DAO.query<Adoveo_fundraiser[]>(
      `
            SELECT * FROM Adoveo_fundraiser WHERE ID = ?
        `,
      [id],
    );
    return fundraiser?.[0];
  },
  addFundraiser: async function (fundraiser: Omit<Adoveo_fundraiser, "ID">) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_fundraiser (Name, Donor_ID)
            VALUES (?, ?)
        `,
      [fundraiser.Name, fundraiser.Donor_ID],
    );

    return result.insertId;
  },
  getFundraiserOrgShares: async function (fundraiserId: Adoveo_fundraiser["ID"]) {
    const [shares] = await DAO.query<Adoveo_fundraiser_org_shares[]>(
      `
            SELECT * FROM Adoveo_fundraiser_org_shares WHERE Fundraiser_ID = ?
        `,
      [fundraiserId],
    );
    return shares;
  },
  addFundraiserOrgShare: async function (
    share: Omit<Adoveo_fundraiser_org_shares, "ID" | "Created" | "Last_updated">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_fundraiser_org_shares (Fundraiser_ID, Org_ID, Share)
            VALUES (?, ?, ?)
        `,
      [share.Fundraiser_ID, share.Org_ID, share.Share],
    );

    return result.insertId;
  },
  getFundraiserTransactionByID: async function (id: Adoveo_fundraiser_transactions["ID"]) {
    const [transaction] = await DAO.query<Adoveo_fundraiser_transactions[]>(
      `
            SELECT * FROM Adoveo_fundraiser_transactions WHERE ID = ?
        `,
      [id],
    );
    return transaction?.[0];
  },
  getFundraiserTransactionByHash: async function (hash: Adoveo_fundraiser_transactions["Hash"]) {
    const [transaction] = await DAO.query<Adoveo_fundraiser_transactions[]>(
      `
            SELECT * FROM Adoveo_fundraiser_transactions WHERE Hash = ?
        `,
      [hash],
    );
    return transaction?.[0];
  },
  addFundraiserTransaction: async function (
    transaction: Omit<Adoveo_fundraiser_transactions, "ID" | "Created" | "Last_updated">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_fundraiser_transactions (Fundraiser_ID, Donation_ID, Sum, Timestamp, Sender_email, Sender_phone, Status, Location, Hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        transaction.Fundraiser_ID,
        transaction.Donation_ID,
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
      [status, id],
    );
  },
  updateFundraiserTransactionDonationID: async function (
    id: Adoveo_fundraiser_transactions["ID"],
    donationId: Adoveo_fundraiser_transactions["Donation_ID"],
  ) {
    await DAO.query(
      `
            UPDATE Adoveo_fundraiser_transactions SET Donation_ID = ? WHERE ID = ?
        `,
      [donationId, id],
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
  getGiftcardTransactionByHash: async function (hash: Adoveo_giftcard_transactions["Hash"]) {
    const [transaction] = await DAO.query<Adoveo_giftcard_transactions[]>(
      `
            SELECT * FROM Adoveo_giftcard_transactions WHERE Hash = ?
        `,
      [hash],
    );
    return transaction?.[0];
  },
  addGiftcardTransaction: async function (
    transaction: Omit<Adoveo_giftcard_transactions, "ID" | "Created" | "Last_updated">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_giftcard_transactions (Donation_ID, Sum, Timestamp, Sender_donor_ID, Sender_name, Sender_email, Sender_phone, Receiver_donor_ID, Receiver_name, Receiver_phone, Message, Status, Location, CouponSend, Hash)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
      [
        transaction.Donation_ID,
        transaction.Sum,
        transaction.Timestamp,
        transaction.Sender_donor_ID,
        transaction.Sender_name,
        transaction.Sender_email,
        transaction.Sender_phone,
        transaction.Receiver_donor_ID,
        transaction.Receiver_name,
        transaction.Receiver_phone,
        transaction.Message,
        transaction.Status,
        transaction.Location,
        transaction.CouponSend,
        transaction.Hash,
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
      [status, id],
    );
  },
  updateGiftcardTransactionDonationID: async function (
    id: Adoveo_giftcard_transactions["ID"],
    donationId: Adoveo_giftcard_transactions["Donation_ID"],
  ) {
    await DAO.query(
      `
            UPDATE Adoveo_giftcard_transactions SET Donation_ID = ? WHERE ID = ?
        `,
      [donationId, id],
    );
  },
};
