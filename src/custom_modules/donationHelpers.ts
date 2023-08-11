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
  createKID: async (length = 8, donorId = null) => {
    //Create new valid KID
    let newKID = KID.generate(length, donorId);
    //If KID already exists, try new kid, call this function recursively
    if (await DAO.distributions.KIDexists(newKID))
      newKID = await donationHelpers.createKID(length, donorId);

    return newKID;
  },
};
