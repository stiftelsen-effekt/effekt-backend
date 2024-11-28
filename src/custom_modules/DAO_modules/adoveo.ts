import {
  Adoveo_giftcard,
  Adoveo_fundraiser,
  Adoveo_fundraiser_org_shares,
  Adoveo_fundraiser_transactions,
  Adoveo_giftcard_org_shares,
  Adoveo_giftcard_transactions,
} from "@prisma/client";
import { DAO } from "../DAO";
import { DateTime } from "luxon";
import { escape } from "mysql2";

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
  getFundraiserByAdoveoID: async function (adoveoId: Adoveo_fundraiser["Adoveo_ID"]) {
    const [fundraiser] = await DAO.query<Adoveo_fundraiser[]>(
      `
            SELECT * FROM Adoveo_fundraiser WHERE Adoveo_ID = ?
        `,
      [adoveoId],
    );
    return fundraiser?.[0];
  },
  getFundraiserDonationSumsByIDs: async function (ids: Adoveo_fundraiser["ID"][]) {
    const unionClauses = ids
      .map(escape)
      .map((id) => `SELECT ${id} as Fundraiser_ID`)
      .join(" UNION ALL ");

    const [sums] = await DAO.query<{ Fundraiser_ID: Adoveo_fundraiser["ID"]; Sum: number }[]>(
      `
      SELECT id.Fundraiser_ID,
             COALESCE(sum(D.sum_confirmed), 0) as Sum
      FROM (${unionClauses}) as id
      LEFT JOIN Adoveo_fundraiser_transactions F ON id.Fundraiser_ID = F.Fundraiser_ID
      LEFT JOIN Donations D ON F.Donation_ID = D.ID
      GROUP BY id.Fundraiser_ID
      ORDER BY id.Fundraiser_ID;
    `,
      [],
    );

    return sums.map(({ Fundraiser_ID, Sum }) => ({ fundraiserId: Fundraiser_ID, sum: Sum || 0 }));
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
  updateFundraiserLastImport: async function (id: Adoveo_fundraiser["ID"], lastImport: DateTime) {
    await DAO.query(
      `
            UPDATE Adoveo_fundraiser SET Last_import = ? WHERE ID = ?
        `,
      [lastImport.toJSDate(), id],
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
  getGiftcardByID: async function (id: Adoveo_giftcard["ID"]) {
    const [giftcard] = await DAO.query<Adoveo_giftcard[]>(
      `
            SELECT * FROM Adoveo_giftcard WHERE ID = ?
        `,
      [id],
    );
    return giftcard?.[0];
  },

  addGiftcard: async function (giftcard: Omit<Adoveo_giftcard, "ID" | "Created" | "Last_updated">) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_giftcard (Name)
        `,
      [giftcard.Name],
    );

    return result.insertId;
  },

  getGiftcardOrgShares: async function (giftcardId: Adoveo_giftcard["ID"]) {
    const [shares] = await DAO.query<Adoveo_giftcard_org_shares[]>(
      `
            SELECT * FROM Adoveo_giftcard_org_shares WHERE Giftcard_ID = ?
        `,
      [giftcardId],
    );
    return shares;
  },

  addGiftcardOrgShare: async function (
    share: Omit<Adoveo_giftcard_org_shares, "ID" | "Created" | "Last_updated">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_giftcard_org_shares (Giftcard_ID, Org_ID, Share, Standard_split)
            VALUES (?, ?, ?, ?)
        `,
      [share.Giftcard_ID, share.Org_ID, share.Share, share.Standard_split],
    );

    return result.insertId;
  },

  // Update the existing addGiftcardTransaction function to include Giftcard_ID
  addGiftcardTransaction: async function (
    transaction: Omit<Adoveo_giftcard_transactions, "ID" | "Created" | "Last_updated">,
  ) {
    const [result] = await DAO.query(
      `
            INSERT INTO Adoveo_giftcard_transactions (
              Donation_ID, Giftcard_ID, Sum, Timestamp,
              Sender_donor_ID, Sender_name, Sender_email, Sender_phone,
              Receiver_donor_ID, Receiver_name, Receiver_phone,
              Message, Status, Location, CouponSend, Hash
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
      [
        transaction.Donation_ID,
        transaction.Giftcard_ID,
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
};
