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
};
