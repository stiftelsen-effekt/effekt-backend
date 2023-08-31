import { DAO, SqlResult } from "../DAO";

import sqlString from "sqlstring";
import {
  Distribution_cause_area_organizations,
  Distribution_cause_areas,
  Distributions,
  Donors,
  Organizations,
  Prisma,
} from "@prisma/client";
import { ResultSetHeader } from "mysql2";
import {
  Distribution,
  DistributionCauseArea,
  DistributionCauseAreaOrganization,
  DistributionInput,
} from "../../schemas/types";

export type DistributionsListFilter = {
  KID?: string;
  donor?: string;
  email?: string;
};
//region GET
async function getAll(
  page = 0,
  limit = 10,
  sort: { id: string; desc?: boolean },
  filter: null | DistributionsListFilter = null,
) {
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

  const queryFrom = `
    FROM Distributions

    LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
        ON Donations.KID_fordeling = Distributions.KID

    INNER JOIN Donors
        ON Distributions.Donor_ID = Donors.ID
  `;

  const queryGroupBy = `
    GROUP BY Distributions.KID, Donors.full_name, Donors.email
  `;

  const queryWhere = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

  const querySelectList = `
    Distributions.KID,
    IFNULL(Donations.sum, 0) as sum,
    IFNULL(Donations.count, 0) as count,
    Donors.full_name,
    Donors.email
  `;

  const queryString = `
        SELECT
            ${querySelectList}

            ${queryFrom}
            ${queryWhere}
            ${queryGroupBy}

            ORDER BY ${sort.id} ${sort.desc ? "DESC" : ""}

            LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(limit * page)}`;

  const [rows] = await DAO.query<
    (Pick<Distributions, "KID"> & { sum: number; count: number } & Pick<
        Donors,
        "full_name" | "email"
      >)[]
  >(queryString);

  const counterQueryString = `
  SELECT COUNT(*) as count FROM (SELECT 
      ${querySelectList}
      ${queryFrom}
      ${queryWhere}
      ${queryGroupBy}) as sub`;

  const [counter] = await DAO.query<{ count: number }[]>(counterQueryString);

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
 *  distributions: Distribution[]
 * }}
 */
async function getAllByDonor(donorID) {
  var [res] = await DAO.query<DistributionDbResult>(
    `SELECT *,
      CAO.Percentage_share AS Organization_percentage_share,
      CA.Percentage_share AS Cause_area_percentage_share

    FROM 
      Distributions AS D
      LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
      LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
    
    WHERE 
        D.Donor_ID = ?`,
    [donorID],
  );

  var distObj = {
    donorID: donorID,
    distributions: mapDbDistributionsToDistributions(res),
  };

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
  var [res] = await DAO.query("SELECT * FROM Distributions WHERE KID = ? LIMIT 1", [KID]);

  if (res.length > 0) return true;
  else return false;
}

/**
 * Takes in a candidate distribution and returns a KID if the distribution already exists
 * @param {DistributionInput} input
 * @param {number} minKidLength Used to filter out distributions with KID shorter than this
 * @returns {string | null} KID or null if no KID found
 */
async function getKIDbySplit(input: DistributionInput, minKidLength = 0): Promise<string | null> {
  // TOOD? If donor only has one tax unit, always use that one?

  // Validate input
  // Must have one or more cause areas
  if (input.causeAreas.length === 0) {
    throw new Error("Must have one or more cause areas");
  }

  // Cause areas share must sum to 100
  const causeAreaShareSum = input.causeAreas.reduce(
    (sum, causeArea) => sum + parseFloat(causeArea.percentageShare),
    0,
  );
  if (causeAreaShareSum !== 100) {
    throw new Error(`Cause area share must sum to 100, but was ${causeAreaShareSum}`);
  }

  // Organization share must sum to 100 within each cause area
  input.causeAreas.forEach((causeArea) => {
    const orgShareSum = causeArea.organizations.reduce(
      (sum, org) => sum + parseFloat(org.percentageShare),
      0,
    );
    if (orgShareSum !== 100) {
      throw new Error(
        `Organization share must sum to 100 within each cause area, but was ${orgShareSum} for cause area ${causeArea.id}`,
      );
    }
  });

  /**
   * This is a fairly complex query, so here's a breakdown of what it does:
   *
   * 1. Get all distributions that match the donor ID and tax unit ID
   * 2. Join with cause areas and cause area organizations
   * 3. Filter on only distribution that match the cause area ID and organization ID
   * 4. Filter on distributions that have cause areas with the correct percentage share and standard distribution
   * 5. Filter on distributions that have organizations within that cause area with the correct percentage share
   *
   * Steps 4 and 5 are what's going on with the doubly nested maps in the WHERE clause
   *
   * In the select clause we have a windowed sum for the percentage shares within a cause area
   * What this does is that it sums up the percentage shares for all the organizations within a cause area,
   * and multiplies it by the percentage share of the cause area itself.
   *
   * For example, if we have a distribution with 100% to cause area 1, we would expect the cause areasorgsum
   * to be 100. If we have a distribution with 50% to cause area 1 and 50% to cause area 2, we would expect
   * the cause areasorgsum to be 50 for each cause area.
   *
   *
   * This would yield a result something like this:
   *
   * | KID | Cause_area_ID | Percentage_share | Organization_ID | Percentage_share | CauseAreasOrgSum |
   * |-----|---------------|------------------|-----------------|------------------|------------------|
   * | 323 | 1             | 50               | 1               | 20               | 50               |
   * | 323 | 1             | 50               | 2               | 80               | 50               |
   * | 323 | 2             | 50               | 3               | 40               | 50               |
   * | 323 | 2             | 50               | 4               | 60               | 50               |
   * |-----|---------------|------------------|-----------------|------------------|------------------|
   *
   * The next step is to group this result by KID, cause area and cause area org sum. Notice that the cause
   * area org sum is the same for all rows within a cause area, so it does not affect the grouping by cause
   * area. This would yield a result something like this:
   *
   * | KID | Cause_area_ID | CauseAreasOrgSum |
   * |-----|---------------|------------------|
   * | 323 | 1             | 50               |
   * | 323 | 2             | 50               |
   * |-----|---------------|------------------|
   *
   * The next step is to group this result by KID and sum the cause area org sum. This would yield a result
   *
   * | KID | SUM(CauseAreasOrgSum) |
   * |-----|-----------------------|
   * | 323 | 100                   |
   * |-----|-----------------------|
   *
   * If the sum is 100, we know that the distribution already exists, and we can return the KID.
   * If it does not sum to 100, we know that the distribution does not exist, and we can return null.
   *
   * There might be distributions that partially match our criteria. For example, if we're looking for
   * a distribution with 100% to cause area 1, and 50% to organization 1 within cause area 1 and 50% to
   * organization 2 within cause area 1, we might find a distribution that has 100% to cause area 1 and
   * 50% to organization 1 within cause area 1 and 50% to organization 3 within cause area 1.
   *
   * This would look like this in the result:
   *
   * | KID | Cause_area_ID | Percentage_share | Organization_ID | Percentage_share | CauseAreasOrgSum |
   * |-----|---------------|------------------|-----------------|------------------|------------------|
   * | 878 | 1             | 100              | 1               | 50               | 50               |
   * |-----|---------------|------------------|-----------------|------------------|------------------|
   *
   * Which would yield this result after grouping on cause areas:
   *
   * | KID | Cause_area_ID | CauseAreasOrgSum |
   * |-----|---------------|------------------|
   * | 878 | 1             | 50               |
   * |-----|---------------|------------------|
   *
   * And finally after grouping on KID (distribution):
   *
   * | KID | SUM(CauseAreasOrgSum) |
   * |-----|-----------------------|
   * | 878 | 50                    |
   * |-----|-----------------------|
   *
   * Which does not have a sum for the cause areas of 100, so we know that this distribution does not match
   * our criteria.
   */

  const query = `
    SELECT 
      KID, 
      SUM(CauseAreasOrgSum) 
    FROM
    (
      SELECT 
          * 
      FROM 
      (
          SELECT
              KID,
              Cause_area_ID,
              ROUND(
                  SUM(CAO.Percentage_share) OVER (PARTITION BY CA.ID) * CA.Percentage_share / 100
              ) AS CauseAreasOrgSum
          FROM 
              Distributions AS D
              LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
              LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
          WHERE 
              D.Donor_ID = ? 
              AND (D.Tax_unit_ID = ? OR (D.Tax_unit_ID IS NULL AND ? IS NULL))
              AND 
              (
                  -- Map out the cause area distribution
                  ${input.causeAreas
                    .map((causeArea) => {
                      return `
                        (
                            CA.Cause_area_ID = ${sqlString.escape(causeArea.id)} 
                            AND CA.Percentage_share = ${sqlString.escape(
                              causeArea.percentageShare,
                            )} 
                            AND CA.Standard_split = ${
                              sqlString.escape(causeArea.standardSplit) ? 1 : 0
                            }
                            AND
                            (
                              ${causeArea.organizations
                                .map((organization) => {
                                  return `
                                  (Organization_ID = ${sqlString.escape(
                                    organization.id,
                                  )} AND CAO.Percentage_share = ${sqlString.escape(
                                    organization.percentageShare,
                                  )})
                                `;
                                })
                                .join(" OR ")}
                            )
                        )
                      `;
                    })
                    .join(" OR ")}
              )
      ) sub
      GROUP BY 
          KID, 
          Cause_area_ID, 
          CauseAreasOrgSum
    ) sub2
    GROUP BY 
      KID
      
    HAVING SUM(CauseAreasOrgSum) = 100;
  `;

  const [res] = await DAO.query(query, [input.donorId, input.taxUnitId, input.taxUnitId]);

  const filteredDistributions = res.filter((row) => row.KID.length > minKidLength);

  if (filteredDistributions.length > 0) {
    return filteredDistributions[0].KID;
  }

  return null;
}

/**
 * Gets organizaitons and distribution share from a KID
 * @param {number} KID
 * @returns {Distribution} A distributions, throws error if not found
 */
async function getSplitByKID(KID: string): Promise<Distribution> {
  let [result] = await DAO.query<DistributionDbResult>(
    `
        SELECT *,
          CAO.Percentage_share AS Organization_percentage_share,
          CA.Percentage_share AS Cause_area_percentage_share

        FROM 
          Distributions AS D
          LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
          LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
        
        WHERE 
            D.KID = ?`,
    [KID],
  );

  if (result.length == 0) throw new Error("NOT FOUND | No distribution with the KID " + KID);

  return mapDbDistributionToDistribution(result);
}

/**
 * Gets the standard distribution between organizations for a given cause area
 * @param {number} causeAreaID
 * @returns {DistributionCauseAreaOrganization[]} A list of organizations and their percentage share
 * @throws {Error} Throws error if no organizations are found or if the sum of the standard shares is not 100
 */
async function getStandardDistributionByCauseAreaID(
  causeAreaID: number,
): Promise<DistributionCauseAreaOrganization[]> {
  let [result] = await DAO.query<Organizations[]>(
    `
        SELECT
            ID,
            std_percentage_share

        FROM Organizations

        WHERE
            cause_area_ID = ?
            AND
            std_percentage_share IS NOT NULL
            AND
            std_percentage_share > 0
            AND 
            is_active = 1`,
    [causeAreaID],
  );

  if (result.length == 0)
    throw new Error(
      "NOT FOUND | No organizations with a standard share found for cause area with ID " +
        causeAreaID,
    );

  // Validate that they sum to 100
  const sum = result.reduce((acc, row) => acc + row.std_percentage_share, 0);
  if (sum !== 100)
    throw new Error(
      "INVALID | The sum of the standard shares for cause area with ID " +
        causeAreaID +
        " is not 100",
    );

  return result.map((row) => ({
    id: row.ID,
    percentageShare: row.std_percentage_share.toString(),
  }));
}

/**
 * Gets KIDs from historic paypal donors, matching them against a ReferenceTransactionId
 * @param {Array} transactions A list of transactions that must have a ReferenceTransactionId
 * @returns {Object} Returns an object with referenceTransactionId's as keys and KIDs as values
 */
async function getHistoricPaypalSubscriptionKIDS(
  referenceIDs: string[],
): Promise<{ [key: string]: string }> {
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
//endregion

//region add
/**
 * Adds a given distribution to the databse, connected to the supplied DonorID and the given KID
 * @param {Distribution} distribution
 * @param {number} metaOwnerID Optional meta owner ID, specifies who is the owner of the data
 * @return {boolean} Returns true if the distribution was added successfully, throws if fails
 */
async function add(
  distribution: Distribution,
  metaOwnerID: number | null = null,
): Promise<boolean> {
  try {
    var transaction = await DAO.startTransaction();

    if (metaOwnerID == null) {
      metaOwnerID = await DAO.meta.getDefaultOwnerID();
    }

    const [distributionResult] = await transaction.query<ResultSetHeader>(
      `INSERT INTO Distributions (KID, Donor_ID, Tax_unit_ID, Meta_Owner_ID) VALUES (?, ?, ?, ?);`,
      [distribution.kid, distribution.donorId, distribution.taxUnitId, metaOwnerID],
    );

    if (distributionResult.affectedRows !== 1) {
      throw new Error("Could not add distribution");
    }

    const distributionCauseAreaInserts = await Promise.all(
      distribution.causeAreas.map((causeArea) =>
        (async () => {
          const [result] = await transaction.query<ResultSetHeader>(
            `INSERT INTO Distribution_cause_areas (Distribution_KID, Cause_area_ID, Percentage_share, Standard_split) VALUES (?, ?, ?, ?);`,
            [
              distribution.kid,
              causeArea.id,
              causeArea.percentageShare,
              causeArea.standardSplit ? 1 : 0,
            ],
          );

          if (result.affectedRows !== 1) {
            throw new Error("Could not add distribution cause area");
          }

          return {
            causeAreaId: causeArea.id,
            distributionCauseAreaId: result.insertId,
          };
        })(),
      ),
    );

    const distributionCauseAreaOrganizationInsertsRowValues = [];
    for (const causeAreaInsert of distributionCauseAreaInserts) {
      const causeArea = distribution.causeAreas.find(
        (item) => item.id === causeAreaInsert.causeAreaId,
      );
      if (!causeArea) {
        throw new Error("Could not find cause area");
      }
      const orgs = causeArea.organizations;
      for (const org of orgs) {
        distributionCauseAreaOrganizationInsertsRowValues.push([
          causeAreaInsert.distributionCauseAreaId,
          org.id,
          org.percentageShare,
        ]);
      }
    }

    const [distributionCauseAreaOrganizationInsert] = await transaction.query<ResultSetHeader>(
      `INSERT INTO Distribution_cause_area_organizations (Distribution_cause_area_ID, Organization_ID, Percentage_share) VALUES ?;`,
      [distributionCauseAreaOrganizationInsertsRowValues],
    );

    await DAO.commitTransaction(transaction);
    return true;
  } catch (ex) {
    await DAO.rollbackTransaction(transaction);
    throw ex;
  }
}
//endregion
export type DistributionDbResultRow = Distributions &
  Omit<Distribution_cause_areas, "Percentage_share"> &
  Omit<Distribution_cause_area_organizations, "Percentage_share"> & {
    Cause_area_percentage_share: Prisma.Decimal;
    Organization_percentage_share: Prisma.Decimal;
  };
export type DistributionDbResult = DistributionDbResultRow[];

const mapDbDistributionsToDistributions = (
  result: SqlResult<DistributionDbResult>,
): Distribution[] => {
  /**
   * First we map the result to a map of KID -> DistributionDbResult
   * Such that we have a map of all the rows for a given KID
   */
  const map = new Map<string, SqlResult<DistributionDbResult>>();

  result.forEach((row) => {
    if (!map.has(row.KID)) {
      map.set(row.KID, []);
    }

    map.get(row.KID)?.push(row);
  });

  /**
   * Then we map each of the rows for a given KID to a Distribution
   */
  const distributions: Distribution[] = [];
  map.forEach((rows) => {
    distributions.push(mapDbDistributionToDistribution(rows));
  });

  return distributions;
};

/**
 * An important assumption here is that all the rows in the result have the same KID
 * If you have multiple distributions returned from DB, use mapDbDistributionsToDistributions
 */
const mapDbDistributionToDistribution = (result: SqlResult<DistributionDbResult>): Distribution => {
  const distribution: Distribution = {
    kid: result[0].KID,
    donorId: result[0].Donor_ID,
    taxUnitId: result[0].Tax_unit_ID,
    causeAreas: result.reduce((acc: DistributionCauseArea[], row) => {
      const existingCauseArea = acc.find((item) => item.id === row.Cause_area_ID);

      const organization: DistributionCauseAreaOrganization = {
        id: row.Organization_ID,
        percentageShare: row.Organization_percentage_share,
      };

      if (existingCauseArea) {
        existingCauseArea.organizations.push(organization);
      } else {
        acc.push({
          id: row.Cause_area_ID,
          percentageShare: row.Cause_area_percentage_share,
          standardSplit: row.Standard_split === 1,
          organizations: [organization],
        });
      }

      return acc;
    }, []),
  };

  return distribution;
};

export const distributions = {
  KIDexists,
  getKIDbySplit,
  getSplitByKID,
  getStandardDistributionByCauseAreaID,
  getHistoricPaypalSubscriptionKIDS,
  getAll,
  getAllByDonor,
  getByDonorId,
  add,
};
