import { DAO } from "../DAO";

export const results = {
  getDailyDonations: async () => {
    const [res] = await DAO.query("SELECT * FROM EffektAnalysisDB.v_Daily_donations");
    return res;
  },
  getReferralSums: async () => {
    const [res] = await DAO.query("SELECT * FROM EffektAnalysisDB.OP_ref_data");
    return res;
  },
  getMonthlyDonationsPerOrg: async () => {
    const [res] = await DAO.query<{ Org: string; DonationMonth: string; TotalDonations: string }[]>(
      "SELECT * FROM EffektAnalysisDB.v_Monthly_donations_per_org",
    );
    return res;
  },
  /**
   * Get the overall number of donors and all time donations to recommended organizations
   */
  getHeadlineFigures: async () => {
    const [donations] = await DAO.query<
      {
        totalDonationsToRecommendedOrgs: number;
      }[]
    >(
      "SELECT SUM(Sum_confirmed) as totalDonationsToRecommendedOrgs FROM EffektAnalysisDB.Only_rec_orgs_Donations",
    );

    const [donors] = await DAO.query<{ numberOfDonors: number }[]>(
      "SELECT COUNT(DISTINCT Donor_ID) as numberOfDonors FROM EffektAnalysisDB.Only_rec_orgs_Donations",
    );

    // Get any row from Only_rec_orgs_Donations and look at Inserted to find the last updated date
    const [updated] = await DAO.query<{ Inserted: string }[]>(
      "SELECT Inserted FROM EffektAnalysisDB.Only_rec_orgs_Donations LIMIT 1",
    );

    if (donations.length === 0 || donors.length === 0 || updated.length === 0) {
      return null;
    }

    return {
      totalDonationsToRecommendedOrgs: donations[0].totalDonationsToRecommendedOrgs,
      numberOfDonors: donors[0].numberOfDonors,
      lastUpdated: updated[0].Inserted,
    };
  },
  /*
   * Get the number of donors all time
   */
  getNumberOfDonors: async () => {
    const [res] = await DAO.query<{ numberOfDonors: number }[]>(
      "SELECT COUNT(DISTINCT Donor_ID) as numberOfDonors FROM EffektAnalysisDB.Only_rec_orgs_Donations",
    );
    return res[0].numberOfDonors;
  },
  /**
   * Get latest available LTV estimate for AvtaleGiro and Vipps recurring donors
   */
  getRecentLTV: async () => {
    const [res] = await DAO.query<{ Label: string; Expected_LTV: number }[]>(`
        WITH LatestDates AS (
          SELECT 
              Label,
              MAX(Cutoff_date) as latest_date
          FROM EffektAnalysisDB.Donor_LTV
          WHERE Label IN ('Vipps', 'AvtaleGiro')
          GROUP BY Label
      )
      SELECT 
          d.Label,
          d.Expected_LTV
      FROM EffektAnalysisDB.Donor_LTV d
      INNER JOIN LatestDates l
          ON d.Label = l.Label
          AND d.Cutoff_date = l.latest_date
      WHERE d.Label IN ('Vipps', 'AvtaleGiro')
    `);

    return res;
  },
};
