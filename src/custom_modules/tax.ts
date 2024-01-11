import { DateTime } from "luxon";
import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";

export async function connectDonationsForFirstTaxUnit(donorId: number, taxUnitId: number) {
  /**
   * If we add the donors first tax unit, we want to connect all donations for the
   * current year and the previous year to the new tax unit. We should avoid connecting
   * donations from previous years, as we have already reported them to the tax authorities.
   */

  // Get all distributions for the donor
  const { distributions } = await DAO.distributions.getAllByDonor(donorId);

  // Update the distributions to have the new tax unit
  await DAO.distributions.connectFirstTaxUnit(donorId, taxUnitId);

  // Get all the donations given before the current year
  const donations = await DAO.donations.getByDonorId(donorId);

  const filteredDonations = donations.filter((donation) => {
    const donationDate = new Date(donation.timestamp);
    const currentYear = new Date().getFullYear();
    return donationDate.getFullYear() < currentYear;
  });
  console.log(filteredDonations);

  const distributionsNeedingReplacement = new Set(
    filteredDonations.map((donation) => donation.KID),
  );
  console.log(distributionsNeedingReplacement);

  for (const KID of distributionsNeedingReplacement) {
    /**
     * First we make a copy of the old distribution (without a tax unit)
     * and add it with a new KID
     */
    const replacementKID = await donationHelpers.createKID(15, donorId);
    const oldDistribution = distributions.find((distribution) => distribution.kid === KID);

    const newDistribution = {
      ...oldDistribution,
      kid: replacementKID,
    };

    await DAO.distributions.add(newDistribution);

    /**
     * Then we update the donations from before the current year to use the new KID
     * for the distribution that has no tax unit (since those donations are already reported)
     */
    const previousYearStart = DateTime.now().minus({ years: 1 }).startOf("year");
    await DAO.donations.updateKIDBeforeTimestamp(KID, replacementKID, previousYearStart);

    console.log("Updated KID for donations before current year", KID, replacementKID);
  }
}
