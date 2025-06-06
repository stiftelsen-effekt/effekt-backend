import { distributions } from "./distributions";
import { DAO } from "../DAO";
import { Donation } from "../../schemas/types";

import sqlString from "sqlstring";
import { DateTime } from "luxon";
import { Donations, Prisma } from "@prisma/client";
import { RequestLocale } from "../../middleware/locale";
import { get } from "request";

/** @typedef Donation
 * @prop {number} id
 * @prop {string} donor Donor full name
 * @prop {number} donorId
 * @prop {string} email
 * @prop {number} sum
 * @prop {number} transactionCost
 * @prop {Date} timestamp Timestamp of when the donation was recieved
 * @prop {string} method The name of the payment method used for the donation
 * @prop {string} KID
 */

/** @typedef DonationSummary
 * @prop {string} organization Name of organization
 * @prop {number} sum
 */

/** @typedef DonationSummary
 * @prop {string} year Year
 * @prop {number} yearSum Sum of donations per year
 */

/** @typedef DonationDistributions
 * @prop {number} donationID
 * @prop {Date} date
 * @prop {Array} distributions
 */

//region Get
/**
 * Gets all donations, ordered by the specified column, limited by the limit, and starting at the specified cursor
 * @param {id: string, desc: boolean | null} sort If null, don't sort
 * @param {string | number | Date} cursor Used for pagination
 * @param {number=10} limit Defaults to 10
 * @param {object} filter Filtering object
 * @returns {[Array<IDonation & donorName: string>, nextcursor]} An array of donations pluss the donorname
 */
async function getAll(
  sort: {
    id: string;
    desc: boolean;
  } | null,
  page,
  limit = 10,
  filter: {
    sum?: { from?: number; to?: number };
    date?: { from?: Date; to?: Date };
    KID?: string;
    paymentMethodIDs?: Array<number>;
    taxUnitTypes?: Array<TaxUnitType | null>;
    donor?: string;
    id?: string;
    fundraiserId?: string;
    organizationIDs?: Array<number>;
  } = null,
  locale: RequestLocale,
): Promise<{
  rows: Array<{
    id: number;
    donor: string;
    paymentMethod: string;
    sum: number;
    transactionCost: number;
    kid: string;
    timestamp: Date;
  }>;
  statistics: {
    numDonations: number;
    sumDonations: number;
    avgDonation: number;
  };
  pages: number;
}> {
  if (sort) {
    const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1];

    const taxUnitTypeFildDefinition = getTaxUnitTypeFieldDefinition(locale);

    let where = [];
    if (filter) {
      if (filter.sum) {
        if (filter.sum.from) where.push(`sum_confirmed >= ${sqlString.escape(filter.sum.from)} `);
        if (filter.sum.to) where.push(`sum_confirmed <= ${sqlString.escape(filter.sum.to)} `);
      }

      if (filter.date) {
        if (filter.date.from)
          where.push(`timestamp_confirmed >= ${sqlString.escape(filter.date.from)} `);
        if (filter.date.to)
          where.push(`timestamp_confirmed <= ${sqlString.escape(filter.date.to)} `);
      }

      if (filter.KID)
        where.push(` CAST(KID_fordeling as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
      if (filter.paymentMethodIDs) {
        if (filter.paymentMethodIDs.length == 0) {
          return {
            rows: [],
            statistics: {
              numDonations: 0,
              sumDonations: 0,
              avgDonation: 0,
            },
            pages: 0,
          };
        }
        where.push(
          ` Payment_ID IN (${filter.paymentMethodIDs
            .map((ID) => sqlString.escape(ID))
            .join(",")}) `,
        );
      }

      if (filter.donor)
        where.push(
          ` (Donors.full_name LIKE ${sqlString.escape(
            `%${filter.donor}%`,
          )} OR Donors.email LIKE ${sqlString.escape(`%${filter.donor}%`)}) `,
        );

      if (filter.id) where.push(` Donations.ID LIKE ${sqlString.escape(`${filter.id}%`)} `);

      if (filter.fundraiserId) {
        // Ensure the join happens below if filter.fundraiserId is present
        // Using FT as alias for Fundraiser_transactions table
        where.push(` FT.Fundraiser_ID = ${sqlString.escape(filter.fundraiserId)} `);
      }

      if (filter.taxUnitTypes) {
        if (filter.taxUnitTypes.length == 0) {
          return {
            rows: [],
            statistics: {
              numDonations: 0,
              sumDonations: 0,
              avgDonation: 0,
            },
            pages: 0,
          };
        }
        const types = filter.taxUnitTypes
          .filter((type) => type)
          .map((type) => sqlString.escape(type));
        const hasTypes = types.length > 0;
        const includeUnknown = filter.taxUnitTypes.includes(null);
        const or = hasTypes && includeUnknown ? " OR " : "";

        const typesQuery = hasTypes ? `${taxUnitTypeFildDefinition} IN (${types.join(",")})` : "";
        const unknownQuery = includeUnknown ? `${or} Tax_unit.ID IS NULL` : "";

        where.push(
          ` (
            ${typesQuery}
            ${unknownQuery}
          ) `,
        );
      }

      if (filter.organizationIDs) {
        if (filter.organizationIDs.length == 0) {
          return {
            rows: [],
            statistics: {
              numDonations: 0,
              sumDonations: 0,
              avgDonation: 0,
            },
            pages: 0,
          };
        }
        where.push(
          ` Distribution_cause_area_organizations.Organization_ID IN (${filter.organizationIDs
            .map(sqlString.escape)
            .join(",")}) `,
        );
      }
    }

    // Only apply this join when filtering by organizationIDs.
    const organizationJoin = filter?.organizationIDs
      ? `
        LEFT JOIN Distribution_cause_areas
          ON Distributions.KID = Distribution_cause_areas.Distribution_KID
        LEFT JOIN Distribution_cause_area_organizations
          ON Distribution_cause_areas.ID = Distribution_cause_area_organizations.Distribution_cause_area_ID`
      : "";

    const fundraiserJoin = filter.fundraiserId
      ? `
        LEFT JOIN Fundraiser_transactions FT
          ON Distributions.Fundraiser_transaction_ID = FT.ID`
      : "";

    const query = `
        WITH filtered_donations AS (
          SELECT DISTINCT
            Donations.ID,
            Donors.full_name,
            Payment.abbriv as payment_name,
            Donations.sum_confirmed,
            Donations.transaction_cost,
            Donations.KID_fordeling,
            Donations.timestamp_confirmed,
            ${taxUnitTypeFildDefinition} as tax_unit_type
          FROM Donations
          INNER JOIN Donors
            ON Donations.Donor_ID = Donors.ID
          INNER JOIN Payment
            ON Donations.Payment_ID = Payment.ID  
          INNER JOIN Distributions
            ON Donations.KID_fordeling = Distributions.KID
          LEFT JOIN Tax_unit
            ON Distributions.Tax_unit_ID = Tax_unit.ID
          ${organizationJoin}
          ${fundraiserJoin}
          WHERE ${where.length !== 0 ? where.join(" AND ") : "1"}
        ),
        statistics AS (
          SELECT 
            COUNT(*) as full_count,
            SUM(sum_confirmed) as full_sum,
            AVG(sum_confirmed) as full_avg
          FROM filtered_donations
        )
        SELECT 
          d.*,
          s.full_count,
          s.full_sum,
          s.full_avg
        FROM filtered_donations d
        CROSS JOIN statistics s
        ORDER BY ${sortColumn} ${sort.desc ? "DESC" : ""} 
        LIMIT ? OFFSET ?`;

    const [donations] = await DAO.query(query, [limit, page * limit]);

    const numDonations = donations.length > 0 ? donations[0]["full_count"] : 0;
    const sumDonations = donations.length > 0 ? donations[0]["full_sum"] : 0;
    const avgDonation = donations.length > 0 ? donations[0]["full_avg"] : 0;

    const pages = Math.ceil(numDonations / limit);

    return {
      rows: mapToJS(donations),
      statistics: {
        numDonations,
        sumDonations,
        avgDonation,
      },
      pages,
    };
  } else {
    throw new Error("No sort provided");
  }
}

async function getTransactionCostsReport() {
  let [res] = await DAO.query(`
    SELECT count(ID) as donationsCount,
      (SELECT round(sum(transaction_cost)) FROM Donations
        WHERE YEAR(timestamp_confirmed) = YEAR(CURRENT_DATE)
        AND MONTH(timestamp_confirmed) = MONTH(CURRENT_DATE) - 1) as costPrevMonth,
      (SELECT round(sum(transaction_cost)) FROM Donations
        WHERE YEAR(timestamp_confirmed) = YEAR(CURRENT_DATE) - 1
        AND MONTH(timestamp_confirmed) = MONTH(CURRENT_DATE) - 1) as costPrevMonthPrevYear,
      (SELECT round(sum(transaction_cost)) FROM Donations
        WHERE YEAR(timestamp_confirmed) = YEAR(CURRENT_DATE)
        AND MONTH(timestamp_confirmed) = MONTH(CURRENT_DATE)) as costCurrentMonthToDate,
      (SELECT round(sum(transaction_cost)) FROM Donations
            WHERE YEAR(timestamp_confirmed) = YEAR(CURRENT_DATE) - 1
            AND MONTH(timestamp_confirmed) = MONTH(CURRENT_DATE)
            AND DAYOFMONTH(timestamp_confirmed) <= DAYOFMONTH(CURRENT_DATE)) as costCurrentMonthToDatePrevYear,
      (SELECT round(sum(transaction_cost)) FROM Donations
            WHERE YEAR(timestamp_confirmed) = YEAR(CURRENT_DATE)) as costYTD,
      (SELECT round(sum(transaction_cost)) FROM Donations 
            WHERE 
              DATE(timestamp_confirmed) BETWEEN DATE(CONCAT(YEAR(CURRENT_TIMESTAMP) - 1, '-01-01')) 
            AND 
              DATE(CONCAT(YEAR(CURRENT_TIMESTAMP) - 1, '-', MONTH(CURRENT_TIMESTAMP), '-', DAY(CURRENT_TIMESTAMP)))) as costYTDPrevYear
    FROM
      Donations
    `);

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Gets all donations by KID
 * @param {string} KID KID number
 * @returns {Array<Donation>} Array of Donation objects
 */
async function getAllByKID(KID): Promise<Array<Donation>> {
  var [getDonationsByKIDQuery] = await DAO.query(
    `
            SELECT *, D.ID, payment_name FROM Donations as D
                INNER JOIN Payment as P on D.Payment_ID = P.ID
                WHERE KID_fordeling = ?`,
    [KID],
  );

  let donations = [];

  getDonationsByKIDQuery.forEach((donation) => {
    donations.push({
      id: donation.ID,
      donor: donation.full_name,
      donorId: donation.donorId,
      email: donation.email,
      sum: donation.sum_confirmed,
      transactionCost: donation.transaction_cost,
      timestamp: donation.timestamp_confirmed,
      paymentMethod: donation.payment_name,
      KID: donation.KID_fordeling,
    });
  });

  return donations;
}

/**
 * Gets a histogram of all donations by donation sum
 * Creates buckets with 5 000 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getHistogramBySum() {
  let [results] = await DAO.query(`
            SELECT 
                floor(sum_confirmed/5000)*5000 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Donations
            GROUP BY 1
            ORDER BY 1;
        `);

  return results;
}

/**
 * Fetches the latest donation with a given KID
 * @param {string} KID
 * @returns {Donation | null} Donation of found, null if not
 */
async function getLatestByKID(KID) {
  let [results] = await DAO.query(
    `
            SELECT 
                Donation.ID,
                Donation.sum_confirmed, 
                Donation.KID_fordeling,
                Donation.transaction_cost,
                Donation.timestamp_confirmed,
                Donor.full_name,
                Donor.email,
                Payment.payment_name
            
            FROM Donations as Donation
                INNER JOIN Donors as Donor
                    ON Donation.Donor_ID = Donor.ID

                INNER JOIN Payment
                    ON Donation.Payment_ID = Payment.ID
            
            WHERE 
                Donation.KID_fordeling = ?

            ORDER BY timestamp_confirmed DESC

            LIMIT 1
        `,
    [KID],
  );

  if (results.length == 0) return null;

  const dbDonation = results[0];

  /** @type Donation */
  let donation = {
    id: dbDonation.ID,
    donor: dbDonation.full_name,
    email: dbDonation.email,
    sum: dbDonation.sum_confirmed,
    transactionCost: dbDonation.transaction_cost,
    timestamp: dbDonation.timestamp_confirmed,
    method: dbDonation.payment_name,
    KID: dbDonation.KID_fordeling,
  };

  return donation;
}

/**
 * Gets aggregate donations from a spesific time period
 * @param {Date} startTime
 * @param {Date} endTime
 * @returns {Array} Returns an array of organizations names and their aggregate donations
 */
async function getAggregateByTime(startTime, endTime) {
  var [getAggregateQuery] = await DAO.query("CALL `get_aggregate_donations_by_period`(?, ?)", [
    startTime,
    endTime,
  ]);

  return getAggregateQuery[0];
}

/**
 * Gets the total amount of donations recieved er month for the last year, up to
 * and including the current time. Excludes current month in previous year.
 * @returns {Array<{year: number, month: number, sum: number}>}
 */
async function getAggregateLastYearByMonth() {
  var [getAggregateQuery] = await DAO.query(`
            SELECT 
                extract(YEAR from timestamp_confirmed) as \`year\`,
                extract(MONTH from timestamp_confirmed) as \`month\`, 
                sum(sum_confirmed) as \`sum\`
                
                    FROM Donations
                
                WHERE timestamp_confirmed >= DATE_ADD(DATE_SUB(LAST_DAY(now()), interval 1 YEAR), interval 1 DAY)
                
                GROUP BY \`month\`, \`year\`
                
                ORDER BY \`year\`, \`month\`;
        `);

  return getAggregateQuery;
}

async function externalPaymentIDExists(externalPaymentID, paymentID) {
  var [res] = await DAO.query(
    "SELECT * FROM Donations WHERE PaymentExternal_ID = ? AND Payment_ID = ? LIMIT 1",
    [externalPaymentID, paymentID],
  );

  if (res.length > 0) return true;
  else return false;
}

async function getByExternalPaymentID(externalPaymentID, paymentID) {
  var [res] = await DAO.query(
    "SELECT * FROM Donations WHERE PaymentExternal_ID = ? AND Payment_ID = ?",
    [externalPaymentID, paymentID],
  );

  if (res.length > 0) return res[0];
  else return false;
}

/**
 * Gets donation by ID
 * @param {number} donationID
 * @returns {Donation} A donation object
 */
async function getByID(donationID) {
  var [getDonationFromIDquery] = await DAO.query(
    `
            SELECT 
                Donation.ID,
                Donation.sum_confirmed, 
                Donation.KID_fordeling,
                Donation.transaction_cost,
                Donation.timestamp_confirmed,
                Donation.Payment_ID,
                Donation.PaymentExternal_ID,
                Donation.Meta_owner_ID,
                Donor.ID as donorId,
                Donor.full_name,
                Donor.email,
                Payment.payment_name,
                Fundraiser_transactions.Fundraiser_ID
            
            FROM Donations as Donation
                INNER JOIN Donors as Donor
                    ON Donation.Donor_ID = Donor.ID

                INNER JOIN Payment
                    ON Donation.Payment_ID = Payment.ID

                INNER JOIN Distributions
                    ON Donation.KID_fordeling = Distributions.KID

                LEFT JOIN Fundraiser_transactions
                    ON Distributions.Fundraiser_transaction_ID = Fundraiser_transactions.ID
            
            WHERE 
                Donation.ID = ?`,
    [donationID],
  );

  if (getDonationFromIDquery.length != 1) {
    throw new Error("Could not find donation with ID " + donationID);
  }

  let dbDonation = getDonationFromIDquery[0];

  /** @type Donation */
  let donation = {
    id: dbDonation.ID,
    donor: dbDonation.full_name,
    donorId: dbDonation.donorId,
    email: dbDonation.email,
    sum: dbDonation.sum_confirmed,
    transactionCost: dbDonation.transaction_cost,
    timestamp: dbDonation.timestamp_confirmed,
    paymentId: dbDonation.Payment_ID,
    paymentExternalRef: dbDonation.PaymentExternal_ID,
    paymentMethod: dbDonation.payment_name,
    KID: dbDonation.KID_fordeling,
    metaOwnerId: dbDonation.Meta_owner_ID,
    fundraiserId: dbDonation.Fundraiser_ID,
  };

  const distribution = await distributions.getSplitByKID(donation.KID);

  donation["distribution"] = distribution;

  return donation;
}

/**
 * Gets all donations by donor ID
 * @param donorId
 * @param from Optional date to filter donations to donations after this date
 * @returns {Array<Donation>} An array of donation objects
 */
async function getByDonorId(donorId: number | string, from?: Date): Promise<Array<Donation>> {
  var [donations] = await DAO.query(
    `
    SELECT 
      Donation.ID,
      Donation.sum_confirmed, 
      Donation.KID_fordeling,
      Donation.transaction_cost,
      Donation.timestamp_confirmed,
      Donation.Meta_owner_ID,
      Donor.ID as donorId,
      Donor.full_name,
      Donor.email,
      Payment.payment_name,
      Distributions.Tax_unit_ID

    FROM Donations as Donation

    INNER JOIN Donors as Donor
        ON Donation.Donor_ID = Donor.ID

    INNER JOIN Payment
        ON Donation.Payment_ID = Payment.ID
        
    INNER JOIN Distributions
      ON KID = KID_fordeling

    WHERE 
        Donation.Donor_ID = ?
        ${from ? "AND DATE(Donation.timestamp_confirmed) >= DATE(?)" : ""}
        `,
    from ? [donorId, from] : [donorId],
  );

  /** @type Array<Donation> */
  donations = donations.map((dbDonation) => ({
    id: dbDonation.ID,
    donor: dbDonation.full_name,
    donorId: dbDonation.donorId,
    email: dbDonation.email,
    sum: dbDonation.sum_confirmed,
    transactionCost: dbDonation.transaction_cost,
    timestamp: dbDonation.timestamp_confirmed,
    paymentMethod: dbDonation.payment_name,
    KID: dbDonation.KID_fordeling,
    taxUnitId: dbDonation.Tax_unit_ID,
    metaOwnerId: dbDonation.Meta_owner_ID,
  }));

  return donations;
}

/**
 * Gets whether or not a donation has replaced inactive organizations
 * @param {number} donationID
 * @returns {number} zero or one
 */
async function getHasReplacedOrgs(donationID) {
  if (donationID) {
    let [result] = await DAO.query(
      `
                select Replaced_old_organizations from Donations as D
                inner join Combining_table as CT on CT.KID = D.KID_fordeling
                where Replaced_old_organizations = 1
                and iD = ?
            `,
      [donationID],
    );

    return result[0]?.Replaced_old_organizations || 0;
  }
}

/**
 * Fetches all the donations in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @param {Array<Integer>} [paymentMethodIDs=null] Provide optional PaymentMethodID to filter to a payment method
 */
async function getFromRange(fromDate, toDate, paymentMethodIDs = null) {
  if (!fromDate) fromDate = new Date(2000, 0, 1);
  if (!toDate) toDate = new Date();

  let [getFromRangeQuery] = await DAO.query(
    `
                SELECT 
                    Donations.ID as Donation_ID,
                    Donations.timestamp_confirmed,  
                    Donations.Donor_ID, 
                    Donations.transaction_cost,
                    Donors.full_name as donor_name, 
                    Donations.sum_confirmed, 
                    Payment.payment_name,
                    Distribution.OrgID as Org_ID, 
                    Organizations.full_name as org_name, 
                    Distribution.percentage_share, 
                    (Donations.sum_confirmed*Distribution.percentage_share)/100 as actual_share 

                FROM Donations
                    INNER JOIN Combining_table 
                        ON Donations.KID_fordeling = Combining_table.KID
                    INNER JOIN Distribution 
                        ON Combining_table.Distribution_ID = Distribution.ID
                    INNER JOIN Donors 
                        ON Donors.ID = Donations.Donor_ID
                    INNER JOIN Organizations 
                        ON Organizations.ID = Distribution.OrgID
                    INNER JOIN Payment
                        ON Payment.ID = Donations.Payment_ID
                
                WHERE 
                    Donations.timestamp_confirmed >= Date(?)  
                    AND 
                    Donations.timestamp_confirmed < Date(Date_add(Date(?), interval 1 day))
                ${
                  paymentMethodIDs != null
                    ? `
                    AND
                    Donations.Payment_ID IN (?)
                `
                    : ""
                }
                `,
    [fromDate, toDate, paymentMethodIDs],
  );

  let donations = new Map();
  getFromRangeQuery.forEach((row) => {
    if (!donations.get(row.Donation_ID))
      donations.set(row.Donation_ID, {
        ID: null,
        time: null,
        name: null,
        donorID: null,
        sum: null,
        paymentMethod: null,
        transactionCost: null,
        split: [],
      });

    donations.get(row.Donation_ID).ID = row.Donation_ID;
    donations.get(row.Donation_ID).time = row.timestamp_confirmed;
    donations.get(row.Donation_ID).name = row.donor_name;
    donations.get(row.Donation_ID).donorID = row.Donor_ID;
    donations.get(row.Donation_ID).sum = row.sum_confirmed;
    donations.get(row.Donation_ID).paymentMethod = row.payment_name;
    donations.get(row.Donation_ID).transactionCost = row.transaction_cost;

    donations.get(row.Donation_ID).split.push({
      id: row.Org_ID,
      name: row.org_name,
      percentage: row.percentage_share,
      amount: row.actual_share,
    });
  });

  let returnDonations = [...donations.values()].sort((a, b) => a.time - b.time);

  return returnDonations;
}

/**
 * Fetches median donation in the database for a given inclusive range. If passed two equal dates, returns given day.
 * @param {Date} [fromDate=1. Of January 2000] The date in which to start the selection, inclusive interval.
 * @param {Date} [toDate=Today] The date in which to end the selection, inclusive interval.
 * @returns {Number|null} The median donation sum if donations exist in range, null else
 */
async function getMedianFromRange(fromDate, toDate) {
  if (!fromDate) fromDate = new Date(2000, 0, 1);
  if (!toDate) toDate = new Date();

  let [donations] = await DAO.query(
    `
            SELECT 
                Donations.sum_confirmed
            
            FROM Donations 
            
            WHERE 
                Donations.timestamp_confirmed >= Date(?)  
                AND 
                Donations.timestamp_confirmed < Date(Date_add(Date(?), interval 1 day))

            ORDER BY
                Donations.sum_confirmed
            `,
    [fromDate, toDate],
  );

  if (donations.length === 0) {
    return null;
  }

  // Ikke helt presist siden ved partall antall donasjoner vil denne funksjonen
  // returnere det største av de to midterste elementene (om de er ulike),
  // men tenker det går greit
  const medianIndex = Math.floor(donations.length / 2);

  return parseFloat(donations[medianIndex].sum_confirmed);
}

/**
 * Fetches the total amount of money donated to each organization by a specific donor
 * @param {Number} donorID
 * @returns {Array<DonationSummary>} Array of DonationSummary objects
 */
async function getSummary(donorID) {
  var [res] = await DAO.query(
    `SELECT
            Organizations.full_name, 
            (Donations.sum_confirmed * percentage_share / 100) as sum_distribution, 
            transaction_cost, 
            Donations.Donor_ID
        
        FROM Donations
            INNER JOIN Combining_table 
                ON Combining_table.KID = Donations.KID_fordeling
            INNER JOIN Distribution 
                ON Combining_table.Distribution_ID = Distribution.ID
            INNER JOIN Organizations 
                ON Organizations.ID = Distribution.OrgID
        WHERE 
            Donations.Donor_ID = ? 
            
        ORDER BY timestamp_confirmed DESC
         
        LIMIT 10000`,
    [donorID],
  );

  const summary = [];
  const map = new Map();
  for (const item of res) {
    if (!map.has(item.full_name)) {
      map.set(item.full_name, true);
      summary.push({
        organization: item.full_name,
        sum: 0,
      });
    }
  }
  res.forEach((row) => {
    summary.forEach((obj) => {
      if (row.full_name == obj.organization) {
        obj.sum += parseFloat(row.sum_distribution);
      }
    });
  });

  summary.push({ donorID: donorID });

  return summary;
}

/**
 * Fetches the total amount of money donated per year by a specific donor
 * @param {Number} donorID
 * @returns {Array<YearlyDonationSummary>} Array of YearlyDonationSummary objects
 */
async function getSummaryByYear(donorID) {
  var [res] = await DAO.query(
    `
            SELECT SUM(sum_confirmed) AS yearSum, YEAR(timestamp_confirmed) as year
            FROM Donations 
            WHERE Donor_ID = ? 
            GROUP BY year
            ORDER BY year DESC`,
    [donorID],
  );

  return res;
}

async function getYearlyAggregateByDonorId(donorId) {
  const [res] = await DAO.query<
    {
      ID: number;
      organization: string;
      abbriv: string;
      causeAreaID: number;
      value: string;
      year: number;
    }[]
  >(
    `
    SELECT
    O.ID as ID,
    O.full_name as organization,
    O.abbriv,
    O.Cause_area_ID as causeAreaID,
    SUM(Donations.sum_confirmed * (CA.percentage_share / 100) * (CAO.percentage_share / 100)) as value, 
    YEAR(Donations.timestamp_confirmed) as \`year\`

    FROM Donations
        INNER JOIN Distributions as D
            ON D.KID = Donations.KID_fordeling
        LEFT JOIN Distribution_cause_areas as CA
            ON CA.Distribution_KID = D.KID
        LEFT JOIN Distribution_cause_area_organizations as CAO
            ON CAO.Distribution_cause_area_ID = CA.ID
    LEFT JOIN Organizations as O
    ON O.ID = CAO.Organization_ID
    WHERE 
        Donations.Donor_ID = ?
        
    GROUP BY O.ID, \`year\``,
    [donorId],
  );

  return res;
}

/**
 * Fetches all donations recieved by a specific donor
 * @param {Number} donorID
 * @returns {Array<DonationDistributions>}
 */
async function getHistory(donorID) {
  var [res] = await DAO.query(
    `
            SELECT
                Organizations.full_name,
                Organizations.abbriv,
                Donations.timestamp_confirmed,
                Donations.ID as donation_id,
                Donations.sum_confirmed as sum_donation,
                Distribution.ID as distribution_id,
                (Donations.sum_confirmed * percentage_share / 100) as sum_distribution
            
            FROM Donations
                INNER JOIN Combining_table ON Combining_table.KID = Donations.KID_fordeling
                INNER JOIN Distribution ON Combining_table.Distribution_ID = Distribution.ID
                INNER JOIN Organizations ON Organizations.ID = Distribution.OrgID

            WHERE Donations.Donor_ID = ?
            
            ORDER BY timestamp_confirmed DESC
            
            LIMIT 10000`,
    [donorID],
  );

  const history = [];
  const map = new Map();
  for (const item of res) {
    if (!map.has(item.donation_id)) {
      map.set(item.donation_id, true);
      history.push({
        donationID: item.donation_id,
        donationSum: item.sum_donation,
        date: item.timestamp_confirmed,
        distributions: [],
      });
    }
  }

  res.forEach((row) => {
    history.forEach((obj) => {
      if (obj.donationID == row.donation_id) {
        obj.distributions.push({
          organization: row.full_name,
          abbriv: row.abbriv,
          sum: row.sum_distribution,
        });
      }
    });
  });

  return history;
}

/**
 * Fetches all donations recieved by a specific donor to EA funds
 */
async function getEAFundsDonations(donorId: number): Promise<
  Array<{
    id: number;
    donorId: number;
    taxUnitId: number;
    sum: string;
    timestamp: string;
    paymentExternalId: string;
  }>
> {
  const [res] = await DAO.query(
    `
  SELECT * FROM Funds_donations WHERE DonorID = ?
  `,
    [donorId],
  );

  return res.map((row) => {
    return {
      id: row.ID,
      donorId: row.DonorID,
      taxUnitId: row.TaxUnitID,
      sum: parseFloat(row.Sum),
      timestamp: row.Timestamp,
      paymentExternalId: row.PaymentExternalID,
    };
  });
}

async function getLatestByLegacySeDistribution(legacyKID: string): Promise<Donations | null> {
  const [res] = await DAO.query<Donations[]>(
    `
    SELECT * FROM LegacySeDistributionConnection
      INNER JOIN Donations
        ON Donations.PaymentExternal_ID = LegacySeDistributionConnection.paymentID

      WHERE legacyKID = ?

      ORDER BY Donations.timestamp_confirmed DESC
      
      LIMIT 1
    `,
    [legacyKID],
  );

  if (res.length === 0) return null;

  return {
    ...res[0],
    sum_confirmed: res[0].sum_confirmed as unknown as Prisma.Decimal,
    transaction_cost: res[0].transaction_cost as unknown as Prisma.Decimal,
  };
}

//endregion

//region Add

/**
 * Adds a donation to the database
 *
 * @param {Number} KID
 * @param {Number} paymentMethodID
 * @param {Number} sum The gross amount of the donation (net amount is calculated in the database)
 * @param {Date} [registeredDate=null] Date the transaction was confirmed
 * @param {String} [externalPaymentID=null] Used to track payments in external payment systems (paypal and vipps ex.)
 * @param {Number} [metaOwnerID=null] Specifies an owner that the data belongs to (e.g. The Effekt Foundation). Defaults to selection default from DB if none is provided.
 * @return {Number} The donations ID
 */
async function add(
  KID,
  paymentMethodID,
  sum,
  registeredDate = null,
  externalPaymentID = null,
  metaOwnerID = null,
): Promise<number> {
  var [donorIDQuery] = await DAO.query("SELECT Donor_ID FROM Distributions WHERE KID = ? LIMIT 1", [
    KID,
  ]);

  if (donorIDQuery.length != 1) {
    throw new Error("NO_KID | KID " + KID + " does not exist");
  }

  /** The meta owner ID is the ID of the organization / group that
   *  are the owners of the data in the DB. If now ID is provided,
   *  fetch the default from the DB.
   */

  if (metaOwnerID == null) {
    metaOwnerID = await DAO.meta.getDefaultOwnerID();
  }

  /*  External transaction ID can be passed to prevent duplicates.
          For example if you upload the same vipps report multiple
          times, we must check the vipps transaction ID against the
          stored ones in the database, to ensure that we are not creating
          a duplicate donation. */
  if (externalPaymentID != null) {
    if (await externalPaymentIDExists(externalPaymentID, paymentMethodID)) {
      throw new Error(
        "EXISTING_DONATION | Already a donation with ExternalPaymentID " +
          externalPaymentID +
          " and PaymentID " +
          paymentMethodID,
      );
    }
  }

  if (typeof registeredDate === "string") registeredDate = new Date(registeredDate);

  var donorID = donorIDQuery[0].Donor_ID;

  var [addDonationQuery] = await DAO.query(
    "INSERT INTO Donations (Donor_ID, Payment_ID, PaymentExternal_ID, sum_confirmed, timestamp_confirmed, KID_fordeling, Meta_owner_ID) VALUES (?,?,?,?,?,?,?)",
    [donorID, paymentMethodID, externalPaymentID, sum, registeredDate, KID, metaOwnerID],
  );

  return addDonationQuery.insertId;
}

async function addLegacySeDonationDistribution(
  legacyDistributionReference: string,
  paymentExternalId: string,
): Promise<number> {
  const [res] = await DAO.query(
    `
    INSERT INTO LegacySeDistributionConnection (paymentID, legacyKID)
    VALUES (?, ?)
  `,
    [paymentExternalId, legacyDistributionReference],
  );

  return res.insertId;
}
//endregion

//region Modify
async function update(donation: {
  id: number;
  paymentId?: number;
  paymentExternalRef?: string;
  sum?: number;
  transactionCost?: number;
  timestamp?: Date;
  metaOwnerId?: number;
}) {
  const existingDonation = await DAO.donations.getByID(donation.id);

  const paymentId = donation.paymentId ?? existingDonation.paymentId;
  const paymentExternalRef = donation.paymentExternalRef ?? existingDonation.paymentExternalRef;
  const sum = donation.sum ?? existingDonation.sum;
  const transactionCost = donation.transactionCost ?? existingDonation.transactionCost;
  const timestamp = donation.timestamp ?? existingDonation.timestamp;
  const metaOwnerId = donation.metaOwnerId ?? existingDonation.metaOwnerId;

  await DAO.execute(
    `UPDATE Donations SET
      Payment_ID = ?,
      PaymentExternal_ID = ?,
      sum_confirmed = ?,
      transaction_cost = ?,
      timestamp_confirmed = ?,
      Meta_owner_ID = ?
    WHERE ID = ?`,
    [paymentId, paymentExternalRef, sum, transactionCost, timestamp, metaOwnerId, donation.id],
  );
}

async function updateDonorId(donationId: number, donorId: number) {
  await DAO.execute(
    `
    UPDATE Donations
    SET Donor_ID = ?
    WHERE ID = ?
  `,
    [donorId, donationId],
  );
}

async function registerConfirmedByIDs(IDs) {
  var [donations] = await DAO.execute(
    `UPDATE Donations 
            SET date_confirmed = NOW()
            WHERE 
            ID IN (` +
      "?,".repeat(IDs.length).slice(0, -1) +
      `)`,
    IDs,
  );

  return true;
}

async function updateTransactionCost(transactionCost, donationID) {
  await DAO.execute(
    `
            UPDATE Donations
            SET transaction_cost = ?
            WHERE ID = ?`,
    [transactionCost, donationID],
  );

  return true;
}

async function transferDonationsFromDummy(targetDonorID, dummyDonorID, newTaxUnit) {
  await DAO.execute(
    `
      UPDATE Donations
      SET Donor_ID = ?
      WHERE Donor_ID = ?
      AND Payment_ID = 9
    `,
    [targetDonorID, dummyDonorID],
  );

  await DAO.execute(
    `
      UPDATE Combining_table
      SET Donor_ID = ?, Tax_unit_ID = ?
      WHERE Donor_ID = ?
    `,
    [targetDonorID, newTaxUnit, dummyDonorID],
  );

  return true;
}

async function updateKIDBeforeTimestamp(originalKID: string, newKID: string, timestamp: DateTime) {
  await DAO.execute(
    `
      UPDATE Donations
      SET KID_fordeling = ?
      WHERE KID_fordeling = ?
      AND timestamp_confirmed < ?
    `,
    [newKID, originalKID, timestamp.toISO()],
  );

  return true;
}

async function updateKIDById(donationId: number, newKID: string) {
  const [res] = await DAO.query(
    `
    UPDATE Donations
    SET KID_fordeling = ?
    WHERE ID = ?
  `,
    [newKID, donationId],
  );

  return res.affectedRows > 0;
}

//endregion

//region Delete
/**
 * Deletes a donation from the database
 * @param {number} donationId
 * @returns {boolean} Returns true if a donation was deleted, false else
 */
async function remove(donationId) {
  var result = await DAO.query(`DELETE FROM Donations WHERE ID = ?`, [donationId]);

  if (result[0].affectedRows > 0) return true;
  else return false;
}
//endregion

//region Helpers
const jsDBmapping = [
  ["id", "ID"],
  ["donor", "full_name"],
  ["paymentMethod", "payment_name"],
  ["sum", "sum_confirmed"],
  ["transactionCost", "transaction_cost"],
  ["kid", "KID_fordeling"],
  ["timestamp", "timestamp_confirmed"],
  ["taxUnitType", "tax_unit_type"],
];

const mapToJS = (obj) =>
  obj.map((donation) => {
    var returnObj = {};
    jsDBmapping.forEach((map) => {
      returnObj[map[0]] = donation[map[1]];
    });
    return returnObj;
  });

enum TaxUnitType {
  PERSON = "person",
  ORGANIZATION = "organization",
}

const getTaxUnitTypeFieldDefinition = (locale: RequestLocale) => {
  if (locale === RequestLocale.NO) {
    return `IF (Tax_unit.ID IS NULL, NULL, IF (LENGTH(Tax_unit.ssn) = 9, "organization", "person"))`;
  } else if (locale === RequestLocale.SV) {
    return `IF (Tax_unit.ID IS NULL, NULL, 
      IF(Tax_unit.ssn REGEXP '^[0-9]{6}-' AND CAST(SUBSTRING(Tax_unit.ssn, 3, 2) AS UNSIGNED) > 20,
        'organization',
        'person'
      )
    )`;
  } else {
    throw new Error("Unsupported locale");
  }
};

//endregion

export const donations = {
  getAll,
  getByID,
  getAllByKID,
  getAggregateByTime,
  getAggregateLastYearByMonth,
  getFromRange,
  getMedianFromRange,
  getHasReplacedOrgs,
  getSummary,
  getSummaryByYear,
  getHistory,
  getTransactionCostsReport,
  getYearlyAggregateByDonorId,
  getByDonorId,
  getLatestByKID,
  getByExternalPaymentID,
  getEAFundsDonations,
  getLatestByLegacySeDistribution,
  externalPaymentIDExists,
  updateTransactionCost,
  update,
  updateDonorId,
  add,
  addLegacySeDonationDistribution,
  registerConfirmedByIDs,
  getHistogramBySum,
  transferDonationsFromDummy,
  updateKIDBeforeTimestamp,
  updateKIDById,
  remove,
};
