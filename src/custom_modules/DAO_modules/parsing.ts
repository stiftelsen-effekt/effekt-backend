import { DAO } from "../DAO";

/**
 * Gets the parsing rules for vipps for a given period
 * @param {Date} periodStart The starting point of the period
 * @param {Date} periodEnd The ending point of the period
 * @returns {Array} Returns an array with matching rules
 */
async function getVippsParsingRules(periodStart, periodEnd) {
  var [res] = await DAO.query(
    "SELECT * FROM Vipps_matching_rules WHERE PeriodFrom <= ? and PeriodTo >= ? ORDER BY precedence DESC",
    [periodStart, periodEnd]
  );

  return res.map((res) => {
    return {
      salesLocation: res.SalesLocation,
      message: res.Message,
      resolveKID: res.ResolveKID,
    };
  });
}

export const parsing = {
  getVippsParsingRules,
};
