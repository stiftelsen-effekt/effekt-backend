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
};
