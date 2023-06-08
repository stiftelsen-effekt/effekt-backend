import { DAO } from "./DAO";

export const KID = {
  /**
   * Generates a new KID
   * Uses donorID for new KID format
   * @param {8 | 15} length
   * @param {number | null} donorID
   * @returns {string} The KID
   */
  generate: function (length = 8, donorID = null) {
    let KID;

    // Legacy KID format
    if (length == 8) {
      KID = this.getRandomNumbers(7);
    }
    //New KID format
    else if (length == 15 && donorID != null) {
      // The format is
      // 6 positions for donor ID right aligned
      // 8 positions of random numbers
      // 1 position for checksum
      // Total length 15
      KID = `${donorID.toString().padStart(6, "0")}${this.getRandomNumbers(8)}`;
    } else {
      throw new Error(`Unknown KID generate input. Length: ${length}, DonorID: ${donorID}`);
    }

    // Add checksum
    KID = `${KID}${this.luhn_caclulate(KID)}`;

    return KID;
  },

  /**
   * Generates a string of random numbers
   * @param {number} length
   * @returns {string} Random numbers
   */
  getRandomNumbers(length = 7) {
    return Array.from({ length: length }, () => {
      return Math.floor(9 * Math.random()) + 1;
    }).join("");
  },

  luhn_checksum: function (code) {
    const length = code.length;
    const parity = length % 2;
    var sum = 0;
    for (var i = length - 1; i >= 0; i--) {
      var d = parseInt(code.charAt(i));
      if (i % 2 == parity) {
        d *= 2;
      }
      if (d > 9) {
        d -= 9;
      }
      sum += d;
    }
    return sum % 10;
  },

  luhn_caclulate: function (partcode) {
    const checksum = this.luhn_checksum(partcode + "0");
    return checksum == 0 ? 0 : 10 - checksum;
  },
};
