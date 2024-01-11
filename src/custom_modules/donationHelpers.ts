import { DAO } from "./DAO";
import { KID } from "./KID";

export const donationHelpers = {
  /**
   * Generates a KID with a given length
   * For length 8 uses random numbers with a luhn chekcsum
   * For length
   * @param {8 | 15} length
   * @param {number | null} donorId Used for new KID format with 15 positions
   * @returns {string} The generated KID
   */
  createKID: async (length = 8, donorId = null): Promise<string> => {
    //Create new valid KID
    let newKID = KID.generate(length, donorId);
    //If KID already exists, try new kid, call this function recursively
    if (await DAO.distributions.KIDexists(newKID))
      newKID = await donationHelpers.createKID(length, donorId);

    return newKID;
  },

  createAvtaleGiroKID: async (depth = 0) => {
    let newKID = KID.generate(15);
    //If there is an existing agreement with the same first 6 digits, try new kid, call this function recursively
    const matchingPrefix = await DAO.avtalegiroagreements.getAgreementsWithKIDStartingWith(
      newKID.substr(0, 6),
    );
    if (matchingPrefix.length != 0) {
      console.log(`Retry ${depth} | ${newKID} | ${matchingPrefix.length} matches`);
      newKID = await donationHelpers.createAvtaleGiroKID(depth + 1);
    }

    return newKID;
  },
};
