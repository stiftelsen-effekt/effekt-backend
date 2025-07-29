import { DAO, SqlResult } from "../DAO";

import {
  Distributions,
  Distribution_cause_areas,
  Distribution_cause_area_organizations,
  Donors,
  Organizations,
  Prisma,
} from "@prisma/client";
import { ResultSetHeader } from "mysql2";
import sqlString from "sqlstring";
import {
  Distribution,
  DistributionCauseArea,
  DistributionCauseAreaOrganization,
  DistributionInput,
} from "../../schemas/types";
import { PoolConnection } from "mysql2/promise";
import { sumWithPrecision } from "../rounding";

//region GET
export interface DistributionFilters {
  KID?: string;
  donor?: string;
}

/**
 * Represents a distribution row. It includes fixed properties and
 * dynamic properties for each organization's share, where the key
 * is the organization's abbreviation (e.g., 'EFF').
 */
export interface DistributionRow {
  KID: string;
  full_name: string;
  email: string;
  donation_sum: number;
  donation_count: number;
  // Index signature to allow for dynamic organization share properties
  [org_abbriv: string]: number | string;
}

export interface DistributionStatistics {
  numDistributions: number;
}

const jsDBmapping = [
  ["KID", "D.KID"],
  ["full_name", "Donors.full_name"],
  ["email", "Donors.email"],
  ["sum", "donation_sum"],
  ["count", "donation_count"],
];

/**
 * Fetches all distributions with sorting, filtering, and pagination.
 * This function dynamically includes columns for each active organization's share
 * in a given distribution.
 *
 * @param page - The current page number for pagination (0-indexed).
 * @param limit - The number of distributions per page.
 * @param sort - The sorting object, e.g., { id: 'sum', desc: true }.
 * @param filter - The filter object for querying distributions.
 * @returns A promise that resolves to an object containing the distribution rows, statistics, and total page count.
 */
export async function getAll(
  page: number = 0,
  limit: number = 10,
  sort: { id: string; desc?: boolean } | null = { id: "kid", desc: true },
  filter: DistributionFilters | null = null,
): Promise<{
  rows: Array<DistributionRow>;
  statistics: DistributionStatistics;
  pages: number;
}> {
  if (!sort) {
    throw new Error("No sort provided for getDistributions");
  }
  const sortColumnEntry = jsDBmapping.find((map) => map[0] === sort.id);
  if (!sortColumnEntry) {
    throw new Error(`Invalid sort column: ${sort.id}`);
  }
  const sortColumn = sortColumnEntry[1];
  const sortDirection = sort.desc ? "DESC" : "ASC";

  // 1. Dynamically fetch active organizations to build the pivot columns
  const [activeOrgs] = await DAO.query<{ abbriv: string }[]>(
    "SELECT abbriv FROM Organizations WHERE is_active = 1 ORDER BY ordering",
  );
  const pivotSelects = activeOrgs
    .map(
      (org) =>
        // The resulting column name will be, e.g., "EFF"
        `SUM(CASE WHEN O.abbriv = ${sqlString.escape(
          org.abbriv,
        )} THEN (DCA.Percentage_share * DCAO.Percentage_share / 100.0) ELSE 0 END) AS ${sqlString.escapeId(
          org.abbriv,
        )}`,
    )
    .join(",\n");

  // 2. Build WHERE clauses from the filter object
  const whereClauses: string[] = [];
  if (filter) {
    if (filter.KID) {
      whereClauses.push(`D.KID LIKE ${sqlString.escape(`%${filter.KID}%`)}`);
    }
    if (filter.donor) {
      const donorFilter = sqlString.escape(`%${filter.donor}%`);
      whereClauses.push(
        `(Donors.full_name LIKE ${donorFilter} OR Donors.email LIKE ${donorFilter})`,
      );
    }
  }
  const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // 3. Construct the main query using Common Table Expressions (CTEs)
  const query = `
    -- CTE to aggregate donation data per distribution (KID)
    WITH DonationStats AS (
      SELECT
        KID_fordeling,
        SUM(sum_confirmed) as sum,
        COUNT(*) as count
      FROM Donations
      GROUP BY KID_fordeling
    ),
    -- CTE to calculate and pivot the organization shares for each distribution
    PivotedOrgShares AS (
      SELECT
        DCA.Distribution_KID,
        ${pivotSelects}
      FROM Distribution_cause_areas DCA
      JOIN Distribution_cause_area_organizations DCAO ON DCA.ID = DCAO.Distribution_cause_area_ID
      JOIN Organizations O ON DCAO.Organization_ID = O.ID
      WHERE O.is_active = 1
      GROUP BY DCA.Distribution_KID
    ),
    -- CTE to filter the main distributions table and join all data together
    FilteredDistributions AS (
      SELECT
        D.KID,
        Donors.full_name,
        Donors.email,
        IFNULL(DS.sum, 0) as donation_sum,
        IFNULL(DS.count, 0) as donation_count,
        POS.* -- Selects all the pivoted organization share columns
      FROM Distributions D
      INNER JOIN Donors ON D.Donor_ID = Donors.ID
      LEFT JOIN DonationStats DS ON D.KID = DS.KID_fordeling
      LEFT JOIN PivotedOrgShares POS ON D.KID = POS.Distribution_KID
      ${whereStatement}
    ),
    -- CTE to get the total count for pagination
    TotalCount AS (
        SELECT COUNT(*) as total_rows FROM FilteredDistributions
    )
    -- Final SELECT to combine data, sort, and paginate
    SELECT
      FD.*,
      TC.total_rows
    FROM FilteredDistributions FD
    CROSS JOIN TotalCount TC
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(limit * page)};
  `;

  const [resultRows]: [any[], any] = await DAO.query(query);

  if (resultRows.length === 0) {
    return {
      rows: [],
      statistics: { numDistributions: 0 },
      pages: 0,
    };
  }

  const numDistributions = resultRows[0]["total_rows"] || 0;
  const pages = Math.ceil(numDistributions / limit);

  // 4. Map the raw SQL result to the strongly-typed DistributionRow array
  // The row from the DB is already flat, so we just need to parse numbers
  const mappedRows: DistributionRow[] = resultRows.map((row) => {
    const mappedRow: DistributionRow = {
      KID: row.KID,
      full_name: row.full_name,
      email: row.email,
      donation_sum: row.donation_sum,
      donation_count: row.donation_count,
    };

    for (const org of activeOrgs) {
      // The key is the org abbreviation (e.g., "EFF")
      // The value is the share, parsed from a decimal string to a number
      mappedRow[org.abbriv] = parseFloat(row[org.abbriv] || "0");
    }

    return mappedRow;
  });

  return {
    rows: mappedRows,
    statistics: {
      numDistributions,
    },
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
async function getAllByDonor(donorID: number) {
  var [res] = await DAO.query<DistributionDbResult>(
    `SELECT *,
      CAO.Percentage_share AS Organization_percentage_share,
      CA.Percentage_share AS Cause_area_percentage_share,
      C.name AS Cause_area_name,
      O.full_name AS Organization_name

    FROM 
      Distributions AS D
      LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
      LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
      INNER JOIN Cause_areas AS C ON C.ID = CA.Cause_area_ID
      INNER JOIN Organizations AS O ON O.ID = CAO.Organization_ID
    
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
 */
async function getByDonorId(donorId: number) {
  var [distributions] = await DAO.query<
    (Pick<Distributions, "KID"> &
      Pick<Donors, "full_name" | "email"> & { sum: number; count: number })[]
  >(
    `
        SELECT
            Distributions.KID,
            Donations.sum,
            Donations.count,
            Donors.full_name,
            Donors.email

            FROM Distributions

            LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
                ON Donations.KID_fordeling = Distributions.KID

            INNER JOIN Donors
                ON Distributions.Donor_ID = Donors.ID

            WHERE Distributions.Donor_ID = ?

            GROUP BY Distributions.KID, Donors.full_name, Donors.email
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
 * @param {number} maxKidLength Used to filter out distributions with KID longer than this
 * @returns {string | null} KID or null if no KID found
 */
async function getKIDbySplit(
  input: DistributionInput,
  minKidLength = 0,
  maxKidLength = Number.MAX_SAFE_INTEGER,
): Promise<string | null> {
  // TOOD? If donor only has one tax unit, always use that one?

  // Validate input
  // Must have one or more cause areas
  if (input.causeAreas.length === 0) {
    throw new Error("Must have one or more cause areas");
  }

  // Cause areas share must sum to 100
  const causeAreaShareSum = sumWithPrecision(
    input.causeAreas.map((causeArea) => causeArea.percentageShare),
  );
  if (causeAreaShareSum !== "100") {
    throw new Error(`Cause area share must sum to 100, but was ${causeAreaShareSum}`);
  }

  // Organization share must sum to 100 within each cause area
  input.causeAreas.forEach((causeArea) => {
    const orgShareSum = sumWithPrecision(causeArea.organizations.map((org) => org.percentageShare));
    if (orgShareSum !== "100") {
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
              SUM(CAO.Percentage_share) OVER (PARTITION BY CA.ID) * CA.Percentage_share / 100 AS CauseAreasOrgSum
          FROM 
              Distributions AS D
              LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
              LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
          WHERE 
              D.Donor_ID = ? 
              AND (D.Tax_unit_ID = ? OR (D.Tax_unit_ID IS NULL AND ? IS NULL))
              AND Fundraiser_transaction_ID IS NULL
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
                            AND CA.Standard_split = ${sqlString.escape(
                              causeArea.standardSplit ? 1 : 0,
                            )}
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

  const filteredDistributions = res.filter(
    (row) => row.KID.length >= minKidLength && row.KID.length <= maxKidLength,
  );

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
          CA.Percentage_share AS Cause_area_percentage_share,
          C.name AS Cause_area_name,
          O.full_name AS Organization_name,
          O.widget_display_name AS Organization_widget_display_name

        FROM 
          Distributions AS D
          LEFT JOIN Distribution_cause_areas AS CA ON CA.Distribution_KID = D.KID
          LEFT JOIN Distribution_cause_area_organizations AS CAO ON CAO.Distribution_cause_area_ID = CA.ID
          INNER JOIN Cause_areas AS C ON C.ID = CA.Cause_area_ID
          INNER JOIN Organizations AS O ON O.ID = CAO.Organization_ID
        
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
            full_name,
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
    name: row.full_name,
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

/**
 * Returns all KIDs that start with a given prefix
 * @param prefix
 * @returns
 */
async function getKIDsByPrefix(prefix: string): Promise<string[]> {
  let [res] = await DAO.query<{ KID: string }[]>(`SELECT KID FROM Distributions WHERE KID LIKE ?`, [
    prefix + "%",
  ]);

  return res.map((row) => row.KID);
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
  suppliedTransaction?: PoolConnection,
): Promise<boolean> {
  try {
    var transaction = suppliedTransaction ?? (await DAO.startTransaction());

    if (metaOwnerID == null) {
      metaOwnerID = await DAO.meta.getDefaultOwnerID();
    }

    console.log(distribution.fundraiserTransactionId);

    const [distributionResult] = await transaction.query<ResultSetHeader>(
      `INSERT INTO Distributions (KID, Donor_ID, Tax_unit_ID, Fundraiser_transaction_ID, Meta_Owner_ID) VALUES (?, ?, ?, ?, ?);`,
      [
        distribution.kid,
        distribution.donorId,
        distribution.taxUnitId,
        distribution.fundraiserTransactionId ?? null,
        metaOwnerID,
      ],
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
      if (!causeArea.standardSplit) {
        const orgs = causeArea.organizations;
        for (const org of orgs) {
          distributionCauseAreaOrganizationInsertsRowValues.push([
            causeAreaInsert.distributionCauseAreaId,
            org.id,
            org.percentageShare,
          ]);
        }
      } else {
        const orgs = await getStandardDistributionByCauseAreaID(causeArea.id);
        for (const org of orgs) {
          distributionCauseAreaOrganizationInsertsRowValues.push([
            causeAreaInsert.distributionCauseAreaId,
            org.id,
            org.percentageShare,
          ]);
        }
      }
    }

    const [distributionCauseAreaOrganizationInsert] = await transaction.query<ResultSetHeader>(
      `INSERT INTO Distribution_cause_area_organizations (Distribution_cause_area_ID, Organization_ID, Percentage_share) VALUES ?;`,
      [distributionCauseAreaOrganizationInsertsRowValues],
    );

    if (!suppliedTransaction) await DAO.commitTransaction(transaction);
    return true;
  } catch (ex) {
    if (!suppliedTransaction) await DAO.rollbackTransaction(transaction);
    throw ex;
  }
}
//endregion

//region modify
async function setTaxUnit(KID: string, taxUnitId: number) {
  const [donations] = await DAO.query(`SELECT * FROM Donations WHERE KID_fordeling = ?`, [KID]);

  if (donations.length > 0)
    throw new Error("KID is already associated with donations, cannot add tax unit");
  await DAO.query("UPDATE Distributions SET Tax_unit_ID = ? WHERE KID = ?", [taxUnitId, KID]);
}

/**
 * Sets a tax unit for all donations for a given donor
 * Note that this is not to be used outside of the tax module
 * This is because we need to make sure that donations with a distribution
 * given before the current year are then connected to a replacement
 * KID with no tax unit, since the donations are already reported to the
 * tax authorities.
 * @param donorId
 * @param taxUnitId
 */
async function connectFirstTaxUnit(donorId: number, taxUnitId: number) {
  const [res] = await DAO.query(
    `
    UPDATE Distributions
    SET Tax_unit_ID = ?
    WHERE Donor_ID = ?`,
    [taxUnitId, donorId],
  );
}

/**
 * CAUTION: Should only be used when we've made sure that the donations
 * for the given KID are not reported to the tax authorities
 * Sets a tax unit ID on a distribution
 * @param kid string
 * @param taxUnitId
 */
async function addTaxUnitToDistribution(kid: string, taxUnitId: number) {
  const [res] = await DAO.query(
    `
    UPDATE Distributions
    SET Tax_unit_ID = ?
    WHERE KID = ?`,
    [taxUnitId, kid],
  );
}

export type DistributionDbResultRow = Distributions &
  Omit<Distribution_cause_areas, "Percentage_share"> &
  Omit<Distribution_cause_area_organizations, "Percentage_share"> & {
    Cause_area_percentage_share: Prisma.Decimal;
    Organization_percentage_share: Prisma.Decimal;
    Cause_area_name: string;
    Organization_name: string;
    Organization_widget_display_name: string;
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
  if (result.length === 0) {
    throw new Error("No rows in result");
  }

  // Validate that all rows have the same KID
  const KIDsSet = new Set(result.map((row) => row.KID));
  if (KIDsSet.size !== 1) {
    throw new Error("Rows in result have different KIDs, multiple distributions found");
  }

  const distribution: Distribution = {
    kid: result[0].KID,
    donorId: result[0].Donor_ID,
    taxUnitId: result[0].Tax_unit_ID,
    causeAreas: result.reduce((acc: DistributionCauseArea[], row) => {
      const existingCauseArea = acc.find((item) => item.id === row.Cause_area_ID);

      const organization: DistributionCauseAreaOrganization = {
        id: row.Organization_ID,
        name: row.Organization_name,
        widgetDisplayName: row.Organization_widget_display_name,
        percentageShare: row.Organization_percentage_share,
      };

      if (existingCauseArea) {
        existingCauseArea.organizations.push(organization);
      } else {
        acc.push({
          id: row.Cause_area_ID,
          name: row.Cause_area_name,
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
  getKIDsByPrefix,
  add,
  setTaxUnit,
  addTaxUnitToDistribution,
  connectFirstTaxUnit,
};
