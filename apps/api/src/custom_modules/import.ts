import { DAO } from "./DAO";
import { parseSwedishDonationsReport } from "./parsers/sedonations";

export const connectLegacySwedishDistributions = async (report) => {
  // Assumes that all donations have been imported
  const data = parseSwedishDonationsReport(report);

  for (const donor of data) {
    for (const donation of donor.donations) {
      const legacyReference = donation.referenceNumber.trim().toLowerCase().substring(0, 16);
      const paymentId = donation.finalBankId.trim().toLowerCase();

      try {
        await DAO.donations.addLegacySeDonationDistribution(legacyReference, paymentId);
      } catch (ex) {
        if (ex.code.indexOf("ER_DUP_ENTRY") !== -1) {
          console.log("Existing legacy distribution, skipping");
          continue;
        } else {
          throw ex;
        }
      }
    }
  }

  return true;
};
