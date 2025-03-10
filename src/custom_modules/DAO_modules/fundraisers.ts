import { Donors, Fundraisers } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";

export const fundraisers = {
  addFundraiserTransaction: async function ({
    fundraiserId,
    message,
    showName,
  }: {
    fundraiserId: Fundraisers["ID"];
    message: string | null;
    showName: boolean;
  }): Promise<number> {
    const [res] = await DAO.query(
      `
        INSERT INTO Fundraiser_transactions (Fundraiser_ID, Message, Show_name)
        VALUES (?, ?, ?);
      `,
      [fundraiserId, message, showName ? 1 : 0],
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
        donor_email: string;
        donor_name: string;
      }[]
    >(
      `
        SELECT 
            ft.ID AS transaction_id,
            ft.Message AS message,
            ft.Show_name AS show_name,
            f.Donor_ID AS fundraiser_owner_id,
            d.KID AS distribution_kid,
            don.ID AS donation_id,
            don.sum_confirmed AS donation_amount,
            don.timestamp_confirmed AS donation_date,
            dr.email AS donor_email,
            dr.full_name AS donor_name
        FROM 
            Fundraiser_transactions ft
        JOIN 
            Fundraisers f ON ft.Fundraiser_ID = f.ID
        JOIN 
            Distributions d ON d.Fundraiser_transaction_ID = ft.ID
        JOIN 
            Donations don ON don.KID_fordeling = d.KID
        JOIN
            Donors dr ON don.Donor_ID = dr.ID
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
            f.ID = 1
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
        name: transaction.show_name === 1 ? transaction.donor_name : null,
        message: transaction.message,
        amount: parseFloat(transaction.donation_amount),
        date: transaction.donation_date,
      })),
    };
  },
  /**
   * Get all fundraisers
   */
  getList: async function (): Promise<
    {
      id: Fundraisers["ID"];
      registered: Fundraisers["Inserted"];
      lastUpdated: Fundraisers["Last_updated"];
      donor: {
        id: Donors["ID"];
        name: Donors["full_name"];
      };
    }[]
  > {
    const [res] = await DAO.query<
      SqlResult<{
        fundraiser_id: number;
        fundraiser_registered: Date;
        fundraiser_last_updated: Date;
        donor_id: number;
        donor_name: string;
      }>[]
    >(
      `
        SELECT 
            f.ID AS fundraiser_id,
            f.Inserted AS fundraiser_registered,
            f.Last_updated AS fundraiser_last_updated,
            d.ID AS donor_id,
            d.full_name AS donor_name
        FROM 
            Fundraisers f
        JOIN 
            Donors d ON f.Donor_ID = d.ID
      `,
      [],
    );

    return res.map((row) => ({
      id: row.fundraiser_id,
      registered: row.fundraiser_registered,
      lastUpdated: row.fundraiser_last_updated,
      donor: {
        id: row.donor_id,
        name: row.donor_name,
      },
    }));
  },
};
