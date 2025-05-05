import { Donors, Fundraisers, Organizations } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";

// Define the filter type (remains the same)
type FundraiserListFilter = {
  registrationDate?: { from?: Date; to?: Date };
  fundraiserId?: Fundraisers["ID"];
  donor?: string;
  donationCount?: { from?: number; to?: number };
  donationSum?: { from?: number; to?: number };
  organizationIDs?: Organizations["ID"][];
} | null;

// Define the shape of the raw SQL result row, now including total_count
type FundraiserStatsRow = {
  fundraiser_id: number;
  fundraiser_registered: Date;
  fundraiser_last_updated: Date;
  donor_id: number;
  donor_name: string | null;
  total_donation_sum: number | string;
  total_donation_count: number | string;
  average_donation_sum: number | string | null;
  total_count: number | string; // Total matching fundraisers before pagination
};

interface OverallStatsRow {
  total_fundraiser_count: number | string; // Depending on DB driver, might be string
  overall_total_sum: number | string;
  overall_total_donation_count: number | string;
  overall_avg_donation: number | string | null;
}

// Adjust the main result type combining per-row data and overall stats
type FundraiserStatsRowWithOverall = FundraiserStatsRow & OverallStatsRow;

// Define the final return structure including pagination
type PaginatedFundraiserList = {
  rows: {
    id: Fundraisers["ID"];
    registered: Fundraisers["Inserted"];
    lastUpdated: Fundraisers["Last_updated"];
    donor: {
      id: Donors["ID"];
      name: Donors["full_name"];
    };
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
  pages: number; // Total number of pages
};

export const fundraisers = {
  addFundraiserTransaction: async function ({
    fundraiserId,
    message,
    messageSenderName,
    showName,
  }: {
    fundraiserId: Fundraisers["ID"];
    message: string | null;
    messageSenderName: string | null;
    showName: boolean;
  }): Promise<number> {
    const [res] = await DAO.query(
      `
        INSERT INTO Fundraiser_transactions (Fundraiser_ID, Message, Message_sender_name, Show_name)
        VALUES (?, ?, ?, ?);
      `,
      [fundraiserId, message, messageSenderName, showName ? 1 : 0],
    );
    if (res.affectedRows === 0) {
      throw new Error("Failed to add fundraiser transaction");
    } else {
      return res.insertId;
    }
  },
  getFundraiserByID: async function (id: Fundraisers["ID"]): Promise<{
    totalSum: number;
    donationCount: number;
    transactions: {
      name: string | null;
      message: string | null;
      amount: number;
      date: Date;
    }[];
  } | null> {
    const [transactions] = await DAO.query<
      {
        transaction_id: number;
        message: string;
        show_name: number;
        fundraiser_owner_id: number;
        distribution_kid: string;
        donation_id: number;
        donation_amount: string;
        donation_date: Date;
        name: string;
      }[]
    >(
      `
        SELECT 
            ft.ID AS transaction_id,
            ft.Message AS message,
            ft.Message_sender_name AS name,
            ft.Show_name AS show_name,
            f.Donor_ID AS fundraiser_owner_id,
            d.KID AS distribution_kid,
            don.ID AS donation_id,
            don.sum_confirmed AS donation_amount,
            don.timestamp_confirmed AS donation_date
        FROM 
            Fundraiser_transactions ft
        JOIN 
            Fundraisers f ON ft.Fundraiser_ID = f.ID
        JOIN 
            Distributions d ON d.Fundraiser_transaction_ID = ft.ID
        JOIN 
            Donations don ON don.KID_fordeling = d.KID
        WHERE 
            ft.Fundraiser_ID = ?
        ORDER BY 
            don.timestamp_confirmed DESC;
        `,
      [id],
    );

    const [aggregated] = await DAO.query<
      {
        fundraiser_id: number;
        total_donation_amount: string;
        donation_count: number;
      }[]
    >(
      `
        SELECT 
            f.ID AS fundraiser_id,
            COALESCE(SUM(don.sum_confirmed), 0) AS total_donation_amount,
            COUNT(don.ID) AS donation_count
        FROM 
            Fundraisers f
        LEFT JOIN 
            Fundraiser_transactions ft ON f.ID = ft.Fundraiser_ID
        LEFT JOIN 
            Distributions d ON d.Fundraiser_transaction_ID = ft.ID
        LEFT JOIN 
            Donations don ON don.KID_fordeling = d.KID
        WHERE 
            f.ID = ?
        GROUP BY 
            f.ID;
      `,
      [id],
    );
    if (aggregated.length === 0) {
      return null;
    }

    return {
      totalSum: parseFloat(aggregated[0].total_donation_amount),
      donationCount: aggregated[0].donation_count,
      transactions: transactions.map((transaction) => ({
        id: transaction.transaction_id,
        name: transaction.show_name === 1 ? transaction.name : null,
        message: transaction.message,
        amount: parseFloat(transaction.donation_amount),
        date: transaction.donation_date,
      })),
    };
  },
  getFundraiserTransactionsBySecret: async function (
    secret: Fundraisers["Secret"],
    viewLevel: "public" | "owner" | "admin",
  ): Promise<
    {
      id: number;
      message: string | null;
      name: string | null;
      amount: number;
      date: Date;
      donorName: string;
      donorEmail: string;
    }[]
  > {
    const [transactions] = await DAO.query<
      {
        transaction_id: number;
        message: string;
        show_name: number;
        name: string;
        donation_amount: string;
        donation_date: Date;
        donor_name: string;
        donor_email: string;
      }[]
    >(
      `
        SELECT 
            ft.ID AS transaction_id,
            ft.Message AS message,
            ft.Message_sender_name AS name,
            ft.Show_name AS show_name,
            don.sum_confirmed AS donation_amount,
            don.timestamp_confirmed AS donation_date,
            donors.full_name AS donor_name,
            donors.email AS donor_email
        FROM 
            Fundraiser_transactions ft
        JOIN 
            Fundraisers f ON ft.Fundraiser_ID = f.ID
        JOIN 
            Distributions d ON d.Fundraiser_transaction_ID = ft.ID
        JOIN 
            Donations don ON don.KID_fordeling = d.KID
        JOIN
            Donors donors ON d.Donor_ID = donors.ID
        WHERE 
            f.Secret = ?
        ORDER BY 
            don.timestamp_confirmed DESC;
      `,
      [secret],
    );

    return transactions.map((transaction) => {
      let name = null;
      if (viewLevel === "admin") {
        name = transaction.name;
      } else if (viewLevel === "owner") {
        // TODO: If we add a checkbox for sharing with the owner, we can use that here
        // For now, we assume the owner can see all names
        name = transaction.name;
      } else if (viewLevel === "public") {
        name = transaction.show_name === 1 ? transaction.name : null;
      }
      return {
        id: transaction.transaction_id,
        name: name,
        message: transaction.message,
        amount: parseFloat(transaction.donation_amount),
        date: transaction.donation_date,
        donorName: transaction.donor_name,
        donorEmail: transaction.donor_email,
      };
    });
  },
  getList: async function (
    page: number,
    limit: number = 10,
    filter?: FundraiserListFilter,
    sort?: {
      id: string;
      desc: boolean;
    } | null,
  ): Promise<PaginatedFundraiserList> {
    const parameters: any[] = [];
    const whereConditions: string[] = [];
    const havingConditions: string[] = [];
    let organizationCTE = "";
    let organizationJoin = "";

    let sortColumn = "fundraiser_registered";
    if (sort) {
      sortColumn = jsDBmapping.find(([jsKey]) => jsKey === sort.id)?.[1] || "fundraiser_registered";
    }

    // --- Handle Organization Filter ---
    if (filter?.organizationIDs && filter.organizationIDs.length > 0) {
      const orgPlaceholders = filter.organizationIDs.map(() => "?").join(",");
      filter.organizationIDs.forEach((id) => parameters.push(id));

      organizationCTE = `
      WITH RelevantFundraisers AS (
          SELECT DISTINCT f_sub.ID
          FROM Fundraisers f_sub
          INNER JOIN Fundraiser_transactions ft_sub ON f_sub.ID = ft_sub.Fundraiser_ID
          INNER JOIN Distributions dist_sub ON ft_sub.ID = dist_sub.Fundraiser_transaction_ID
          INNER JOIN Distribution_cause_areas dca_sub ON dist_sub.KID = dca_sub.Distribution_KID
          INNER JOIN Distribution_cause_area_organizations dcao_sub ON dca_sub.ID = dcao_sub.Distribution_cause_area_ID
          WHERE dcao_sub.Organization_ID IN (${orgPlaceholders})
      )
      `;
      organizationJoin = `INNER JOIN RelevantFundraisers rf ON f.ID = rf.ID`;
    } else if (filter?.organizationIDs && filter.organizationIDs.length === 0) {
      return { rows: [], statistics: { totalCount: 0, totalSum: 0, avgDonation: 0 }, pages: 0 };
    }

    // --- Build WHERE conditions ---
    // (Keep your existing WHERE logic - ensure parameters are pushed)
    if (filter?.fundraiserId) {
      whereConditions.push(`f.ID = ?`);
      parameters.push(filter.fundraiserId);
    }
    if (filter?.registrationDate) {
      if (filter.registrationDate.from) {
        whereConditions.push(`f.Inserted >= ?`);
        parameters.push(filter.registrationDate.from);
      }
      if (filter.registrationDate.to) {
        const toDate = new Date(filter.registrationDate.to);
        toDate.setDate(toDate.getDate() + 1);
        whereConditions.push(`f.Inserted < ?`);
        parameters.push(toDate);
      }
    }
    if (filter?.donor) {
      whereConditions.push(`d.full_name LIKE ?`);
      parameters.push(`%${filter.donor}%`);
    }

    // --- Build HAVING conditions ---
    // (Keep your existing HAVING logic - ensure parameters are pushed)
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

    // --- Construct Final Query with Pagination ---
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
    const havingClause =
      havingConditions.length > 0 ? `HAVING ${havingConditions.join(" AND ")}` : "";

    // Add LIMIT and OFFSET parameters *last*
    const offset = page * limit;
    parameters.push(limit); // LIMIT value
    parameters.push(offset); // OFFSET value

    // Determine the keyword for the second CTE
    const secondCTEKeyword = organizationCTE ? "," : "WITH";

    // Assemble the full SQL query string
    const query = `
    ${organizationCTE} -- Optional: WITH RelevantFundraisers AS (...)

    ${secondCTEKeyword} FilteredGroupedFundraisers AS ( -- Use ',' or 'WITH'
        -- This CTE calculates per-fundraiser stats and applies filters
        SELECT
            f.ID AS fundraiser_id,
            f.Inserted AS fundraiser_registered,
            f.Last_updated AS fundraiser_last_updated,
            d.ID AS donor_id,
            d.full_name AS donor_name,
            COALESCE(SUM(dn.sum_confirmed), 0) AS total_donation_sum, -- Sum per fundraiser
            COUNT(DISTINCT dn.ID) AS total_donation_count, -- Count per fundraiser
            ROUND(COALESCE(SUM(dn.sum_confirmed), 0) / NULLIF(COUNT(DISTINCT dn.ID), 0), 2) AS average_donation_sum -- Average per fundraiser
        FROM
            Fundraisers f
        INNER JOIN
            Donors d ON f.Donor_ID = d.ID
        ${organizationJoin} -- Optional join for organization filter
        LEFT JOIN
            Fundraiser_transactions ft ON f.ID = ft.Fundraiser_ID
        LEFT JOIN
            Distributions dist ON ft.ID = dist.Fundraiser_transaction_ID
        LEFT JOIN
            Donations dn ON dist.KID = dn.KID_fordeling
        ${whereClause} -- Apply pre-aggregation filters
        GROUP BY
            f.ID -- Group by the fundraiser
        ${havingClause} -- Apply post-aggregation filters
    ),
    OverallStats AS (
        -- This CTE calculates aggregates over ALL filtered fundraisers
        SELECT
            COUNT(*) as total_fundraiser_count, -- Total number of fundraisers matching filters
            COALESCE(SUM(fgf.total_donation_sum), 0) AS overall_total_sum, -- Grand total sum
            COALESCE(SUM(fgf.total_donation_count), 0) AS overall_total_donation_count, -- Grand total donation count
            ROUND(COALESCE(SUM(fgf.total_donation_sum), 0) / NULLIF(SUM(fgf.total_donation_count), 0), 2) AS overall_avg_donation -- Overall average donation
        FROM FilteredGroupedFundraisers fgf
    )
    -- Final SELECT combining paginated data and overall stats
    SELECT
        fgf.*, -- Select all columns from the filtered/grouped data (for the current page)
        os.total_fundraiser_count,
        os.overall_total_sum,
        os.overall_total_donation_count
    FROM
        FilteredGroupedFundraisers fgf
    CROSS JOIN -- Attach the single row of overall stats to each paginated row
        OverallStats os
    ORDER BY
        ${sortColumn} ${sort?.desc ? "DESC" : "ASC"} -- Sort by the specified column
    LIMIT ? OFFSET ?; -- Apply pagination
  `;

    try {
      // Update the expected result type for DAO.query
      const [res] = await DAO.query<SqlResult<FundraiserStatsRowWithOverall>[]>(query, parameters);

      // --- Process Results ---

      const totalCount = Number(res[0]?.total_fundraiser_count) || 0;
      const totalSum = Number(res[0]?.overall_total_sum) || 0;
      const totalAvgDonation = Number(res[0]?.overall_avg_donation) || 0;

      const pages = limit > 0 ? Math.ceil(totalCount / limit) : totalCount > 0 ? 1 : 0;

      // Map the rows for the current page (extracting per-fundraiser data)
      const rows = res.map((row) => {
        const fundraiserTotalSum = Number(row.total_donation_sum);
        const fundraiserDonationCount = Number(row.total_donation_count);
        const fundraiserAverageDonation = Number(row.average_donation_sum) || 0;

        return {
          id: row.fundraiser_id,
          registered: row.fundraiser_registered,
          lastUpdated: row.fundraiser_last_updated,
          donor: {
            id: row.donor_id,
            name: row.donor_name ?? "N/A",
          },
          statistics: {
            // Statistics for *this specific* fundraiser row
            totalSum: fundraiserTotalSum,
            donationCount: fundraiserDonationCount,
            averageDonation: fundraiserAverageDonation, // Per-fundraiser average
          },
        };
      });

      // Return the paginated structure with TRUE OVERALL statistics
      return {
        rows: rows, // The fundraisers for the current page
        statistics: {
          totalCount: totalCount, // Total fundraisers matching filter
          totalSum: totalSum, // Sum across ALL matching fundraisers
          avgDonation: totalAvgDonation, // Average across ALL matching fundraisers/donations
        },
        pages: pages, // Total number of pages
      };
    } catch (error) {
      console.error("SQL Error in getList:", error);
      throw error; // Re-throw the error after logging
    }
  },
};

const jsDBmapping = [
  ["id", "fundraiser_id"],
  ["registered", "fundraiser_registered"],
  ["donor", "donor_name"],
  ["totalSum", "total_donation_sum"],
  ["donationCount", "total_donation_count"],
  ["averageDonation", "average_donation_sum"],
];
