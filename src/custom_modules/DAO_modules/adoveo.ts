import {
  Adoveo_giftcard,
  Adoveo_fundraiser,
  Adoveo_fundraiser_org_shares,
  Adoveo_fundraiser_transactions,
  Adoveo_giftcard_org_shares,
  Adoveo_giftcard_transactions,
  Organizations,
} from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import { DateTime } from "luxon";
import { escape } from "mysql2";

type AdoveoFundraiserListFilter = {
  name?: string;
  fundraiserId?: number;
  adoveoId?: string;
  donorName?: string;
  createdDate?: { from?: Date; to?: Date };
  donationCount?: { from?: number; to?: number };
  donationSum?: { from?: number; to?: number };
  organizationIDs?: Organizations["ID"][];
} | null;

type AdoveoFundraiserStatsRow = {
  fundraiser_id: number;
  fundraiser_name: string;
  fundraiser_adoveo_id: number | null;
  fundraiser_created: Date;
  fundraiser_last_updated: Date;
  fundraiser_last_import: Date | null;
  donor_id: number | null;
  donor_name: string | null;
  total_donation_sum: number | string;
  total_donation_count: number | string;
  average_donation_sum: number | string | null;
  total_count: number | string;
};

interface AdoveoOverallStatsRow {
  total_fundraiser_count: number | string;
  overall_total_sum: number | string;
  overall_avg_donation: number | string | null;
}

type AdoveoFundraiserStatsRowWithOverall = AdoveoFundraiserStatsRow & AdoveoOverallStatsRow;

type PaginatedAdoveoFundraiserList = {
  rows: {
    id: number;
    name: string;
    adoveoId: number | null;
    created: Date;
    lastUpdated: Date;
    lastImport: Date | null;
    donor: { id: number; name: string } | null;
    statistics: {
      totalSum: number;
      donationCount: number;
      averageDonation: number;
    };
  }[];
  statistics: {
    totalCount: number;
    totalSum: number;
    avgDonation: number;
  };
  pages: number;
};

export const adoveo = {
  getList: async function (
    page: number,
    limit: number = 10,
    filter?: AdoveoFundraiserListFilter,
    sort?: { id: string; desc: boolean } | null,
  ): Promise<PaginatedAdoveoFundraiserList> {
    const parameters: any[] = [];
    const whereConditions: string[] = [];
    const havingConditions: string[] = [];
    let organizationCTE = "";
    let organizationJoin = "";

    let sortColumn = "fundraiser_created";
    if (sort) {
      sortColumn =
        adoveoJsDBmapping.find(([jsKey]) => jsKey === sort.id)?.[1] || "fundraiser_created";
    }

    // --- Handle Organization Filter ---
    if (filter?.organizationIDs && filter.organizationIDs.length > 0) {
      const orgPlaceholders = filter.organizationIDs.map(() => "?").join(",");
      filter.organizationIDs.forEach((id) => parameters.push(id));

      organizationCTE = `
      WITH RelevantFundraisers AS (
          SELECT DISTINCT fos.Fundraiser_ID AS ID
          FROM Adoveo_fundraiser_org_shares fos
          WHERE fos.Org_ID IN (${orgPlaceholders})
      )
      `;
      organizationJoin = `INNER JOIN RelevantFundraisers rf ON af.ID = rf.ID`;
    } else if (filter?.organizationIDs && filter.organizationIDs.length === 0) {
      return { rows: [], statistics: { totalCount: 0, totalSum: 0, avgDonation: 0 }, pages: 0 };
    }

    if (filter?.fundraiserId) {
      whereConditions.push(`af.ID = ?`);
      parameters.push(filter.fundraiserId);
    }
    if (filter?.name) {
      whereConditions.push(`af.Name LIKE ?`);
      parameters.push(`%${filter.name}%`);
    }
    if (filter?.adoveoId) {
      whereConditions.push(`af.Adoveo_ID = ?`);
      parameters.push(filter.adoveoId);
    }
    if (filter?.donorName) {
      whereConditions.push(`d.full_name LIKE ?`);
      parameters.push(`%${filter.donorName}%`);
    }
    if (filter?.createdDate) {
      if (filter.createdDate.from) {
        whereConditions.push(`af.Created >= ?`);
        parameters.push(filter.createdDate.from);
      }
      if (filter.createdDate.to) {
        const toDate = new Date(filter.createdDate.to);
        toDate.setDate(toDate.getDate() + 1);
        whereConditions.push(`af.Created < ?`);
        parameters.push(toDate);
      }
    }

    if (filter?.donationCount) {
      if (filter.donationCount.from !== undefined) {
        havingConditions.push(`total_donation_count >= ?`);
        parameters.push(filter.donationCount.from);
      }
      if (filter.donationCount.to !== undefined) {
        havingConditions.push(`total_donation_count <= ?`);
        parameters.push(filter.donationCount.to);
      }
    }
    if (filter?.donationSum) {
      if (filter.donationSum.from !== undefined) {
        havingConditions.push(`total_donation_sum >= ?`);
        parameters.push(filter.donationSum.from);
      }
      if (filter.donationSum.to !== undefined) {
        havingConditions.push(`total_donation_sum <= ?`);
        parameters.push(filter.donationSum.to);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
    const havingClause =
      havingConditions.length > 0 ? `HAVING ${havingConditions.join(" AND ")}` : "";

    const offset = page * limit;
    parameters.push(limit);
    parameters.push(offset);

    const secondCTEKeyword = organizationCTE ? "," : "WITH";

    const query = `
    ${organizationCTE}

    ${secondCTEKeyword} FilteredGroupedFundraisers AS (
        SELECT
            af.ID AS fundraiser_id,
            af.Name AS fundraiser_name,
            af.Adoveo_ID AS fundraiser_adoveo_id,
            af.Created AS fundraiser_created,
            af.Last_updated AS fundraiser_last_updated,
            af.Last_import AS fundraiser_last_import,
            d.ID AS donor_id,
            d.full_name AS donor_name,
            COALESCE(SUM(aft.Sum), 0) AS total_donation_sum,
            COUNT(DISTINCT aft.ID) AS total_donation_count,
            ROUND(COALESCE(SUM(aft.Sum), 0) / NULLIF(COUNT(DISTINCT aft.ID), 0), 2) AS average_donation_sum
        FROM
            Adoveo_fundraiser af
        LEFT JOIN
            Donors d ON af.Donor_ID = d.ID
        ${organizationJoin}
        LEFT JOIN
            Adoveo_fundraiser_transactions aft ON af.ID = aft.Fundraiser_ID
        ${whereClause}
        GROUP BY
            af.ID
        ${havingClause}
    ),
    OverallStats AS (
        SELECT
            COUNT(*) as total_fundraiser_count,
            COALESCE(SUM(fgf.total_donation_sum), 0) AS overall_total_sum,
            ROUND(COALESCE(SUM(fgf.total_donation_sum), 0) / NULLIF(SUM(fgf.total_donation_count), 0), 2) AS overall_avg_donation
        FROM FilteredGroupedFundraisers fgf
    )
    SELECT
        fgf.*,
        os.total_fundraiser_count,
        os.overall_total_sum,
        os.overall_avg_donation
    FROM
        FilteredGroupedFundraisers fgf
    CROSS JOIN
        OverallStats os
    ORDER BY
        ${sortColumn} ${sort?.desc ? "DESC" : "ASC"}
    LIMIT ? OFFSET ?;
    `;

    try {
      const [res] = await DAO.query<SqlResult<AdoveoFundraiserStatsRowWithOverall>[]>(
        query,
        parameters,
      );

      const totalCount = Number(res[0]?.total_fundraiser_count) || 0;
      const totalSum = Number(res[0]?.overall_total_sum) || 0;
      const totalAvgDonation = Number(res[0]?.overall_avg_donation) || 0;

      const pages = limit > 0 ? Math.ceil(totalCount / limit) : totalCount > 0 ? 1 : 0;

      const rows = res.map((row) => ({
        id: row.fundraiser_id,
        name: row.fundraiser_name,
        adoveoId: row.fundraiser_adoveo_id,
        created: row.fundraiser_created,
        lastUpdated: row.fundraiser_last_updated,
        lastImport: row.fundraiser_last_import,
        donor: row.donor_id ? { id: row.donor_id, name: row.donor_name ?? "N/A" } : null,
        statistics: {
          totalSum: Number(row.total_donation_sum),
          donationCount: Number(row.total_donation_count),
          averageDonation: Number(row.average_donation_sum) || 0,
        },
      }));

      return {
        rows,
        statistics: {
          totalCount,
          totalSum,
          avgDonation: totalAvgDonation,
        },
        pages,
      };
    } catch (error) {
      console.error("SQL Error in adoveo.getList:", error);
      throw error;
    }
  },

  getAdoveoByID: async function (id: Adoveo_fundraiser["ID"]) {
    const [fundraiserRows] = await DAO.query<Adoveo_fundraiser[]>(
      `SELECT * FROM Adoveo_fundraiser WHERE ID = ?`,
      [id],
    );
    const fundraiser = fundraiserRows?.[0];
    if (!fundraiser) return null;

    const [orgShares] = await DAO.query<(Adoveo_fundraiser_org_shares & { Org_name: string })[]>(
      `SELECT fos.*, o.full_name AS Org_name
       FROM Adoveo_fundraiser_org_shares fos
       LEFT JOIN Organizations o ON fos.Org_ID = o.ID
       WHERE fos.Fundraiser_ID = ?`,
      [id],
    );

    const [donorRows] = await DAO.query<{ ID: number; full_name: string }[]>(
      `SELECT ID, full_name FROM Donors WHERE ID = ?`,
      [fundraiser.Donor_ID],
    );

    const [statsRows] = await DAO.query<{ total_sum: string; donation_count: number }[]>(
      `SELECT COALESCE(SUM(Sum), 0) AS total_sum, COUNT(*) AS donation_count
       FROM Adoveo_fundraiser_transactions WHERE Fundraiser_ID = ?`,
      [id],
    );

    const donor = donorRows?.[0] ?? null;
    const stats = statsRows?.[0];

    return {
      id: fundraiser.ID,
      name: fundraiser.Name,
      adoveoId: fundraiser.Adoveo_ID,
      created: fundraiser.Created,
      lastUpdated: fundraiser.Last_updated,
      lastImport: fundraiser.Last_import,
      donor: donor ? { id: donor.ID, name: donor.full_name } : null,
      orgShares: orgShares.map((s) => ({
        orgId: s.Org_ID,
        orgName: s.Org_name,
        share: Number(s.Share),
        standardSplit: !!s.Standard_split,
      })),
      statistics: {
        totalSum: parseFloat(stats?.total_sum ?? "0"),
        donationCount: stats?.donation_count ?? 0,
        averageDonation:
          stats?.donation_count > 0 ? parseFloat(stats.total_sum) / stats.donation_count : 0,
      },
    };
  },

  createFundraiser: async function (
    name: string,
    donorId?: number | null,
    adoveoId?: number | null,
  ) {
    const [result] = await DAO.query(
      `INSERT INTO Adoveo_fundraiser (Name, Donor_ID, Adoveo_ID) VALUES (?, ?, ?)`,
      [name, donorId ?? null, adoveoId ?? null],
    );
    return result.insertId;
  },

  addFundraiserOrgShares: async function (
    fundraiserId: Adoveo_fundraiser["ID"],
    shares: { orgId: number; share: number; standardSplit: boolean }[],
  ) {
    for (const share of shares) {
      await DAO.query(
        `INSERT INTO Adoveo_fundraiser_org_shares (Fundraiser_ID, Org_ID, Share, Standard_split)
         VALUES (?, ?, ?, ?)`,
        [fundraiserId, share.orgId, share.share, share.standardSplit ? 1 : 0],
      );
    }
  },

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
      .map((id) => escape(id))
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
  getFundraiserVippsNumberLocationSum: async function (fundraiserId: Adoveo_fundraiser["ID"]) {
    const [vippsNumberLocationSum] = await DAO.query<
      { Vipps_number: string; Location: string; Sum: string }[]
    >(
      `
      SELECT COALESCE(sum(D.sum_confirmed), 0) as Sum
      FROM Adoveo_fundraiser_transactions F
      LEFT JOIN Donations D ON F.Donation_ID = D.ID
      WHERE F.Fundraiser_ID = ? AND F.Location = 'VippsNumber'
        `,
      [fundraiserId],
    );
    return parseFloat(vippsNumberLocationSum[0].Sum);
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

const adoveoJsDBmapping = [
  ["id", "fundraiser_id"],
  ["name", "fundraiser_name"],
  ["adoveoId", "fundraiser_adoveo_id"],
  ["created", "fundraiser_created"],
  ["donor", "donor_name"],
  ["totalSum", "total_donation_sum"],
  ["donationCount", "total_donation_count"],
];
