import { DAO } from "../DAO";

/**
 * Donor acquisition and retention for the admin's analysis pages: new (first-time) donors per
 * month, and yearly cohorts by the year of the first donation.
 *
 * Definitions, shared by both:
 * - A donor's first donation is their earliest confirmed donation (timestamp_confirmed), in
 *   Oslo time. Payment methods 15 (Influenced) and 16 (AMF direkte) are left out, as in the
 *   regranting balances: that money never passes through our accounts.
 * - A donor's referral is the earliest Referral_records row ("how did you hear about us").
 *
 * The queries group per donor and month (or year) in a derived table and group that again,
 * so the work stays in MySQL; the shaping into series and matrices is in donorCohortsModel.ts.
 */

/** Payment methods that aren't donor money through our accounts (see docs/regranting.md) */
export const EXCLUDED_PAYMENT_IDS = [15, 16] as const;

/**
 * The Oslo calendar month (YYYY-MM) of a timestamp_confirmed stored as UTC wall clock. Norway
 * is UTC+2 from the last Sunday of March to the last Sunday of October, so a month starts at
 * 22:00 UTC the day before for April–October and 23:00 UTC otherwise (as regrantingTrace).
 */
const osloMonthOf = (column: string) =>
  `DATE_FORMAT(DATE_ADD(${column}, INTERVAL (CASE WHEN MONTH(DATE_ADD(${column}, INTERVAL 2 HOUR)) BETWEEN 4 AND 10 THEN 2 ELSE 1 END) HOUR), '%Y-%m')`;

const donationFilter = `d.Payment_ID NOT IN (${EXCLUDED_PAYMENT_IDS.join(", ")})
    AND d.timestamp_confirmed IS NOT NULL`;

export type NewDonorRow = {
  /** YYYY-MM, Oslo time */
  month: string;
  /** Referral type of the donor's earliest referral record; null without one */
  referralId: number | null;
  donors: number;
  /** Sum of these donors' donations in their first month, decimal string */
  volume: string;
};

/** New donors per first month (from `fromMonth`, YYYY-MM) and referral type */
async function getNewDonorRows(fromMonth: string): Promise<NewDonorRow[]> {
  const [rows] = await DAO.query<any[]>(
    `
    WITH donor_months AS (
      SELECT d.Donor_ID, ${osloMonthOf("d.timestamp_confirmed")} AS month,
             SUM(d.sum_confirmed) AS volume
      FROM Donations d
      WHERE ${donationFilter}
      GROUP BY d.Donor_ID, month
    ), firsts AS (
      SELECT Donor_ID, MIN(month) AS first_month FROM donor_months GROUP BY Donor_ID
    ), referrals AS (
      SELECT DonorID, ReferralID FROM (
        SELECT DonorID, ReferralID,
               ROW_NUMBER() OVER (PARTITION BY DonorID ORDER BY Registered, ID) AS n
        FROM Referral_records
        WHERE DonorID IS NOT NULL
      ) r
      WHERE n = 1
    )
    SELECT f.first_month AS month, r.ReferralID AS referralId,
           COUNT(*) AS donors, SUM(dm.volume) AS volume
    FROM firsts f
    JOIN donor_months dm ON dm.Donor_ID = f.Donor_ID AND dm.month = f.first_month
    LEFT JOIN referrals r ON r.DonorID = f.Donor_ID
    WHERE f.first_month >= ?
    GROUP BY f.first_month, r.ReferralID
    `,
    [fromMonth],
  );
  return rows.map((r) => ({
    month: String(r.month),
    referralId: r.referralId === null ? null : Number(r.referralId),
    donors: Number(r.donors),
    volume: String(r.volume ?? "0"),
  }));
}

export type CohortRow = {
  /** Year of the donors' first donation */
  cohort: number;
  /** Calendar year (Oslo) the cohort's donors gave in */
  year: number;
  /** Cohort donors who gave at least once that year */
  donors: number;
  /** The cohort's donations that year, decimal string */
  volume: string;
};

/** Per cohort (from `fromYear`) and calendar year: donors who gave, and their volume */
async function getCohortRows(fromYear: number): Promise<CohortRow[]> {
  const [rows] = await DAO.query<any[]>(
    `
    WITH donor_years AS (
      SELECT d.Donor_ID, CAST(LEFT(${osloMonthOf("d.timestamp_confirmed")}, 4) AS UNSIGNED) AS year,
             SUM(d.sum_confirmed) AS volume
      FROM Donations d
      WHERE ${donationFilter}
      GROUP BY d.Donor_ID, year
    ), cohorts AS (
      SELECT Donor_ID, MIN(year) AS cohort FROM donor_years GROUP BY Donor_ID
    )
    SELECT c.cohort, dy.year, COUNT(*) AS donors, SUM(dy.volume) AS volume
    FROM donor_years dy
    JOIN cohorts c ON c.Donor_ID = dy.Donor_ID
    WHERE c.cohort >= ?
    GROUP BY c.cohort, dy.year
    `,
    [fromYear],
  );
  return rows.map((r) => ({
    cohort: Number(r.cohort),
    year: Number(r.year),
    donors: Number(r.donors),
    volume: String(r.volume ?? "0"),
  }));
}

export type ReferralType = { id: number; name: string };

async function getReferralTypes(): Promise<ReferralType[]> {
  const [rows] = await DAO.query<any[]>(`SELECT ID, name FROM Referral_types ORDER BY ID`);
  return rows.map((r) => ({ id: Number(r.ID), name: String(r.name) }));
}

export const donorCohorts = {
  getNewDonorRows,
  getCohortRows,
  getReferralTypes,
};
