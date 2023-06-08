import Decimal from "decimal.js";
import { DAO } from "../DAO";

import sqlString from "sqlstring";
import { Distribution, Organizations } from "@prisma/client";

//region GET
async function getAll(page = 0, limit = 10, sort, filter = null) {
  let where = [];
  if (filter) {
    if (filter.KID) where.push(` CAST(KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
    if (filter.donor)
      where.push(
        ` (full_name LIKE ${sqlString.escape(`%${filter.donor}%`)} or email LIKE ${sqlString.escape(
          `%${filter.donor}%`,
        )}) `,
      );
  }

  let queryString = `
        SELECT
            Combining.KID,
            Donations.sum,
            Donations.count,
            Donors.full_name,
            Donors.email

            FROM Combining_table as Combining

            LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
                ON Donations.KID_fordeling = Combining.KID

            INNER JOIN Donors
                ON Combining.Donor_ID = Donors.ID

            ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}

            GROUP BY Combining.KID, Donors.full_name, Donors.email

            ORDER BY ${sort.id} ${sort.desc ? " DESC" : ""}

            LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(limit * page)}`;

  const [rows] = await DAO.query(queryString);

  const [counter] = await DAO.query(`
        SELECT COUNT(*) as count 
            FROM Combining_table as Combining

            LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
                ON Donations.KID_fordeling = Combining.KID

            INNER JOIN Donors
                ON Combining.Donor_ID = Donors.ID

            ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}`);

  const pages = Math.ceil(counter[0].count / limit);

  return {
    rows,
    pages,
  };
}

/**
 * Fetches all distributions belonging to a specific donor
 * @param {Number} donorID
 * @returns {{
 *  donorID: number,
 *  distributions: [{
 *      KID: number,
 *      organizations: [{
 *          name: string,
 *          share: number
 *      }]}]}}
 */
async function getAllByDonor(donorID) {
  var [res] = await DAO.query(
    `select Donors.ID as donID, Combining_table.KID as KID, Distribution.ID, Organizations.ID as orgId, Organizations.full_name, Distribution.percentage_share 
    from Donors
    inner join Combining_table on Combining_table.Donor_ID = Donors.ID
    inner join Distribution on Distribution.ID = Combining_table.Distribution_ID
    inner join Organizations on Organizations.ID = Distribution.OrgID
    where Donors.ID = ?`,
    [donorID],
  );

  var distObj = {
    donorID: donorID,
    distributions: [],
  };

  // Finds all unique KID numbers
  const map = new Map();
  for (const item of res) {
    if (!map.has(item.KID)) {
      map.set(item.KID, true);
      distObj.distributions.push({
        kid: item.KID,
        shares: [],
      });
    }
  }
  // Adds organization and shares to each KID number
  res.forEach((row) => {
    distObj.distributions.forEach((obj) => {
      if (row.KID == obj.kid) {
        obj.shares.push({
          id: row.orgId,
          name: row.full_name,
          share: row.percentage_share,
        });
      }
    });
  });

  return distObj;
}

/**
 * Returns the flat distributions (not the actual split between organizations)
 * for a given donor id, with number of donations and donation sum.
 * @param {Number} donorId
 * @returns {Array<{
 *  kid: number,
 *  count: number,
 *  sum: number,
 *  full_name: string,
 *  email: string,
 * }>}
 */
async function getByDonorId(donorId) {
  var [distributions] = await DAO.query(
    `
            SELECT
            Combining.KID,
            Donations.sum,
            Donations.count,
            Donors.full_name,
            Donors.email

            FROM Combining_table as Combining

            LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
                ON Donations.KID_fordeling = Combining.KID

            INNER JOIN Donors
                ON Combining.Donor_ID = Donors.ID

            WHERE Donors.ID = ?

            GROUP BY Combining.KID, Donors.full_name, Donors.email
        `,
    [donorId],
  );

  return distributions;
}

/**
 * Checks whether given KID exists in DB
 * @param {number} KID
 * @returns {boolean}
 */
async function KIDexists(KID) {
  var [res] = await DAO.query("SELECT * FROM Combining_table WHERE KID = ? LIMIT 1", [KID]);

  if (res.length > 0) return true;
  else return false;
}

/**
 * Takes in a distribution array and a Donor ID, and returns the KID if the specified distribution exists for the given donor.
 * @param {array<object>} split
 * @param {number} donorID
 * @param {boolean} standardDistribution
 * @param {number} taxUnitId The ID of the associated tax unit for a distribution. Can be undefined if the distribution is not associated with a tax unit.
 * @param {number} minKidLength Specify a minimum length of KID to match against
 * @returns {number | null} KID or null if no KID found
 */
async function getKIDbySplit(
  split,
  donorID: number,
  standardDistribution: boolean,
  taxUnitId?: number,
  minKidLength = 0,
) {
  let query = `
        SELECT 
            KID, 
            Count(KID) as KID_count 
            
        FROM Distribution as D
            INNER JOIN Combining_table as C 
                ON C.Distribution_ID = D.ID
        
        WHERE

        (Standard_split = ${standardDistribution ? "1)" : "0 OR Standard_split IS NULL)"}

        AND
        `;

  for (let i = 0; i < split.length; i++) {
    query += `(OrgID = ${sqlString.escape(split[i].id)} AND percentage_share = ${sqlString.escape(
      split[i].share,
    )} AND C.Donor_ID = ${sqlString.escape(donorID)} AND ${
      taxUnitId ? "C.Tax_unit_ID = " + sqlString.escape(taxUnitId) : "C.Tax_unit_ID IS NULL"
    })`;
    if (i < split.length - 1) query += ` OR `;
  }

  query += ` GROUP BY C.KID
        
        HAVING 
            KID_count = ${split.length}
            AND
            LENGTH(KID) >= ${sqlString.escape(minKidLength)}`;

  var [res] = await DAO.execute(query);

  if (res.length > 0) return res[0].KID;
  else return null;
}

/**
 * Gets organizaitons and distribution share from a KID
 * @param {number} KID
 * @returns {[{
 *  id: number,
 *  full_name: string,
 *  abbriv: string,
 *  share: string
 * }]}
 */
async function getSplitByKID(KID) {
  let [result] = await DAO.query<
    (Pick<Organizations, "full_name" | "abbriv"> & {
      id: Organizations["ID"];
      share: Distribution["percentage_share"];
    })[]
  >(
    `
            SELECT 
                Organizations.ID as id,
                Organizations.full_name,
                Organizations.abbriv, 
                Distribution.percentage_share as share
            
            FROM Combining_table as Combining
                INNER JOIN Distribution as Distribution
                    ON Combining.Distribution_ID = Distribution.ID
                INNER JOIN Organizations as Organizations
                    ON Organizations.ID = Distribution.OrgID
            
            WHERE 
                KID = ?`,
    [KID],
  );

  if (result.length == 0) throw new Error("NOT FOUND | No distribution with the KID " + KID);
  return result;
}

/**
 * Gets KIDs from historic paypal donors, matching them against a ReferenceTransactionId
 * @param {Array} transactions A list of transactions that must have a ReferenceTransactionId
 * @returns {Object} Returns an object with referenceTransactionId's as keys and KIDs as values
 */
async function getHistoricPaypalSubscriptionKIDS(referenceIDs) {
  let [res] = await DAO.query(
    `SELECT 
            ReferenceTransactionNumber,
            KID 
            
            FROM Paypal_historic_distributions 

            WHERE 
                ReferenceTransactionNumber IN (?);`,
    [referenceIDs],
  );

  let mapping = res.reduce((acc, row) => {
    acc[row.ReferenceTransactionNumber] = row.KID;
    return acc;
  }, {});

  return mapping;
}

/**
 * Checks whether a given distribution has standard split
 * @param {number} KID
 * @returns {boolean}
 */
async function isStandardDistribution(KID) {
  var [res] = await DAO.query(
    "SELECT KID, Standard_split FROM Combining_table WHERE KID = ? GROUP BY KID, Standard_split;",
    [KID],
  );

  if (res.length > 0 && res[0]["Standard_split"] === 1) return true;
  else return false;
}
//endregion

//region add
/**
 * Adds a given distribution to the databse, connected to the supplied DonorID and the given KID
 * @param {Array<object>} split
 * @param {number} KID
 * @param {number} donorID
 * @param {number | null} taxUnitId The id of the tax unit to associate the distribution with. Can be null if no tax unit is associated.
 * @param {boolean} standardDistribution
 * @param {number | null} [metaOwnerID=null] Specifies an owner that the data belongs to (e.g. The Effekt Foundation). Defaults to selection default from DB if none is provided.
 */
async function add(
  split,
  KID,
  donorID,
  taxUnitId = null,
  standardDistribution = false,
  metaOwnerID = null,
) {
  try {
    var transaction = await DAO.startTransaction();

    if (metaOwnerID == null) {
      metaOwnerID = await DAO.meta.getDefaultOwnerID();
    }

    let distribution_table_values = split.map((item) => {
      return [item.id, item.share];
    });
    var res = await transaction.query(
      "INSERT INTO Distribution (OrgID, percentage_share) VALUES ?",
      [distribution_table_values],
    );

    let first_inserted_id = (res[0] as any).insertId;
    var combining_table_values = Array.apply(null, Array(split.length)).map((item, i) => {
      return [donorID, taxUnitId, standardDistribution, first_inserted_id + i, KID, metaOwnerID];
    });

    //Update combining table
    var res = await transaction.query(
      "INSERT INTO Combining_table (Donor_ID, Tax_unit_ID, Standard_split, Distribution_ID, KID, Meta_owner_ID) VALUES ?",
      [combining_table_values],
    );

    await DAO.commitTransaction(transaction);
    return true;
  } catch (ex) {
    await DAO.rollbackTransaction(transaction);
    throw ex;
  }
}
//endregion

export const distributions = {
  KIDexists,
  getKIDbySplit,
  getSplitByKID,
  getHistoricPaypalSubscriptionKIDS,
  getAll,
  getAllByDonor,
  getByDonorId,
  isStandardDistribution,
  add,
};
