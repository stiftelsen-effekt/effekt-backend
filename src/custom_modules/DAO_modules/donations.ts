import { distributions } from "./distributions";
import { EA_NORGE_META_OWNER_ID } from "./meta";
import { DAO } from "../DAO";
import { Distribution, Donation } from "../../schemas/types";

import sqlString from "sqlstring";
import { instantRangeClauses, type InstantRange } from "../osloDays";
import { DateTime } from "luxon";
import { Donations, Prisma } from "@prisma/client";
import { RequestLocale } from "../../middleware/locale";
import { publishEvent } from "../daoEvents";
import { enqueueTidbytDonationConfirmed } from "../../tidbyt/tidbytWorkerEnqueue";

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
    /** `to` is inclusive (REST), or a half-open InstantRange with `before` (tRPC) */
    date?: { from?: Date; to?: Date } | InstantRange;
    KID?: string;
    paymentMethodIDs?: Array<number>;
    taxUnitTypes?: Array<TaxUnitType | null>;
    donor?: string;
    id?: string;
    fundraiserId?: string;
    organizationIDs?: Array<number>;
    dataOwnerIDs?: Array<number>;
  } | null = null,
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
    const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)![1];

    const taxUnitTypeFildDefinition = getTaxUnitTypeFieldDefinition(locale);

    let where: string[] = [];
    if (filter) {
      if (filter.sum) {
        if (filter.sum.from)
          where.push(`Donations.sum_confirmed >= ${sqlString.escape(filter.sum.from)} `);
        if (filter.sum.to)
          where.push(`Donations.sum_confirmed <= ${sqlString.escape(filter.sum.to)} `);
      }

      if (filter.date && "before" in filter.date) {
        // tRPC: a half-open instant range (osloDays.ts)
        where.push(...instantRangeClauses("Donations.timestamp_confirmed", filter.date));
      } else if (filter.date) {
        const date = filter.date as { from?: Date; to?: Date };
        if (date.from)
          where.push(`Donations.timestamp_confirmed >= ${sqlString.escape(date.from)} `);
        if (date.to) where.push(`Donations.timestamp_confirmed <= ${sqlString.escape(date.to)} `);
      }

      if (filter.KID)
        where.push(
          ` CAST(Donations.KID_fordeling as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `,
        );
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
          ` Donations.Payment_ID IN (${filter.paymentMethodIDs
            .map((ID) => sqlString.escape(ID))
            .join(",")}) `,
        );
      }

      if (filter.dataOwnerIDs) {
        if (filter.dataOwnerIDs.length == 0) {
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
          ` Donations.Meta_owner_ID IN (${filter.dataOwnerIDs
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

      if (filter.organizationIDs && filter.organizationIDs.length == 0) {
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
    }

    const organizationIDs = filter?.organizationIDs ?? [];
    const hasOrganizationFilter = organizationIDs.length > 0;
    // Shares are stored as 1-100. Pre-aggregate per KID so donations are not exploded
    // by org rows and both the table and stats use the amount to the selected orgs.
    const selectedOrgSharesCte = hasOrganizationFilter
      ? `selected_org_shares AS (
          SELECT
            Distribution_cause_areas.Distribution_KID,
            SUM(
              Distribution_cause_areas.Percentage_share / 100 *
              Distribution_cause_area_organizations.Percentage_share / 100
            ) AS selected_share
          FROM Distribution_cause_areas
          INNER JOIN Distribution_cause_area_organizations
            ON Distribution_cause_areas.ID = Distribution_cause_area_organizations.Distribution_cause_area_ID
          WHERE Distribution_cause_area_organizations.Organization_ID IN (${organizationIDs
            .map(sqlString.escape)
            .join(",")})
          GROUP BY Distribution_cause_areas.Distribution_KID
        ),
        `
      : "";

    const organizationJoin = hasOrganizationFilter
      ? `
        INNER JOIN selected_org_shares
          ON Distributions.KID = selected_org_shares.Distribution_KID`
      : "";

    const sumExpression = hasOrganizationFilter
      ? `ROUND(Donations.sum_confirmed * selected_org_shares.selected_share, 2)`
      : `Donations.sum_confirmed`;

    const fundraiserJoin = filter?.fundraiserId
      ? `
        LEFT JOIN Fundraiser_transactions FT
          ON Distributions.Fundraiser_transaction_ID = FT.ID`
      : "";

    const query = `
        WITH ${selectedOrgSharesCte}filtered_donations AS (
          SELECT
            Donations.ID,
            Donors.full_name,
            Payment.abbriv as payment_name,
            ${sumExpression} as sum_confirmed,
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

/** Rounded transaction cost sums (decimal strings, null when there are no donations in the period) */
export type TransactionCostsReport = {
  donationsCount: number;
  costPrevMonth: string | null;
  costPrevMonthPrevYear: string | null;
  costCurrentMonthToDate: string | null;
  costCurrentMonthToDatePrevYear: string | null;
  costYTD: string | null;
  costYTDPrevYear: string | null;
};

async function getTransactionCostsReport(): Promise<TransactionCostsReport | false> {
  let [res] = await DAO.query<TransactionCostsReport[]>(`
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

  let donations: Donation[] = [];

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
async function getHistogramBySum(): Promise<Array<{ bucket: number; items: number; bar: number }>> {
  let [results] = await DAO.query<Array<{ bucket: number; items: number; bar: number }>>(`
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

export type SumHistogramBucket = {
  /** Inclusive lower edge in whole currency units */
  bucket: number;
  /** Exclusive upper edge (the log histogram's last bucket includes it) */
  bucketEnd: number;
  items: number;
  /** ROUND(100 * LN(items)), 0 for empty buckets, as in getHistogramBySum */
  bar: number;
};

/** Rounds to two significant digits, e.g. 4642 -> 4600 */
const twoSignificant = (value: number) => Number(value.toPrecision(2));

/** Rounds down to two significant digits, e.g. 147 -> 140 */
const twoSignificantFloor = (value: number) => {
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.min(twoSignificant(Math.floor(value / magnitude) * magnitude), value);
};

/**
 * Bucket edges spaced evenly on a log scale from `min` to `max`, rounded to two significant
 * digits (e.g. 10, 22, 46, 100, …). The first edge is at most `min` and the last at least `max`,
 * so with the last bucket including its upper edge every value in [min, max] falls in a bucket.
 * Fewer than `count` buckets when rounding makes neighbouring edges equal.
 */
export function logBucketEdges(min: number, max: number, count: number): number[] {
  const lo = twoSignificantFloor(min);
  const ratio = max / lo;
  const edges = [lo];
  for (let i = 1; i <= count; i++) {
    const edge = twoSignificant(lo * ratio ** (i / count));
    if (edge > edges[edges.length - 1]) edges.push(edge);
  }
  // Rounding down can leave the last edge below max; a single value needs one bucket
  while (edges.length < 2 || edges[edges.length - 1] < max) {
    const last = edges[edges.length - 1];
    edges.push(twoSignificant(Math.max(last * 1.1, last + 0.01)));
  }
  return edges;
}

/**
 * Histogram of donation sums with `count` log-scale buckets (see logBucketEdges) between the
 * smallest positive and the largest sum, including empty buckets. `bucketEnd` is exclusive,
 * except for the last bucket, which includes the largest sum. Donations of zero or less, if any,
 * get one bucket of their own first (from the smallest sum up to the first edge).
 */
async function getLogHistogramBySum(count: number): Promise<SumHistogramBucket[]> {
  const [[range]] = await DAO.query<
    Array<{ min: string | null; minPositive: string | null; max: string | null }>
  >(
    `SELECT
       MIN(sum_confirmed) AS min,
       MIN(IF(sum_confirmed > 0, sum_confirmed, NULL)) AS minPositive,
       MAX(sum_confirmed) AS max
     FROM Donations`,
  );
  if (range.minPositive === null || range.max === null || range.min === null) return [];

  const edges = logBucketEdges(Number(range.minPositive), Number(range.max), count);
  // INTERVAL(N, e0, e1, …) is 0 for N < e0 and i for e(i-1) <= N < e(i)
  const [rows] = await DAO.query<Array<{ idx: number; items: number }>>(
    `SELECT INTERVAL(sum_confirmed, ${edges.map(() => "?").join(", ")}) AS idx, COUNT(*) AS items
     FROM Donations
     GROUP BY idx`,
    edges,
  );
  const itemsByIndex = new Map(rows.map((row) => [Number(row.idx), Number(row.items)]));
  const bar = (items: number) => (items > 0 ? Math.round(100 * Math.log(items)) : 0);

  const buckets: SumHistogramBucket[] = [];
  const below = itemsByIndex.get(0) ?? 0;
  if (below > 0) {
    buckets.push({ bucket: Number(range.min), bucketEnd: edges[0], items: below, bar: bar(below) });
  }
  for (let i = 1; i < edges.length; i++) {
    // Sums equal to the last edge (INTERVAL index edges.length) belong to the last bucket
    const items =
      (itemsByIndex.get(i) ?? 0) + (i === edges.length - 1 ? itemsByIndex.get(i + 1) ?? 0 : 0);
    buckets.push({ bucket: edges[i - 1], bucketEnd: edges[i], items, bar: bar(items) });
  }
  return buckets;
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
async function getAggregateByTime(
  startTime: Date,
  endTime: Date,
  /**
   * Compare instants: `startTime` inclusive, `endTime` exclusive (tRPC whole Oslo days). By
   * default (REST) both are calendar dates of the stored wall clock, inclusive.
   */
  options: { exclusiveEnd?: boolean } = {},
): Promise<Array<{ id: number; orgName: string; sum: string }>> {
  const range = options.exclusiveEnd
    ? "Donations.timestamp_confirmed >= ? AND Donations.timestamp_confirmed < ?"
    : "DATE(Donations.timestamp_confirmed) >= DATE(?) AND DATE(Donations.timestamp_confirmed) <= DATE(?)";
  // Inline replacement for the get_aggregate_donations_by_period procedure, which still
  // queries the Combining_table/Distribution tables dropped in 20230731130928_multiple_cause_areas.
  // An organization's share of a donation is its share within the cause area times the
  // cause area's share of the distribution.
  const [rows] = await DAO.query<Array<{ id: number; orgName: string; sum: string }>>(
    `
    SELECT
      Organizations.ID AS id,
      Organizations.full_name AS orgName,
      ROUND(
        SUM(
          Donations.sum_confirmed
          * Distribution_cause_areas.Percentage_share / 100
          * Distribution_cause_area_organizations.Percentage_share / 100
        ),
        2
      ) AS sum
    FROM Donations
      INNER JOIN Distribution_cause_areas
        ON Distribution_cause_areas.Distribution_KID = Donations.KID_fordeling
      INNER JOIN Distribution_cause_area_organizations
        ON Distribution_cause_area_organizations.Distribution_cause_area_ID = Distribution_cause_areas.ID
      INNER JOIN Organizations
        ON Organizations.ID = Distribution_cause_area_organizations.Organization_ID
    WHERE ${range}
    GROUP BY Organizations.ID, Organizations.full_name
    `,
    [startTime, endTime],
  );

  return rows;
}

/**
 * Gets the total amount of donations recieved er month for the last year, up to
 * and including the current time. Excludes current month in previous year.
 * @returns {Array<{year: number, month: number, sum: number}>}
 */
async function getAggregateLastYearByMonth(): Promise<
  Array<{ year: number; month: number; /** Decimal string */ sum: string }>
> {
  var [getAggregateQuery] = await DAO.query<Array<{ year: number; month: number; sum: string }>>(`
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

/**
 * Whether any donation, with any payment method, has the given external reference.
 * PaymentExternal_ID is unique across all payment methods in the database.
 */
async function externalRefExists(externalRef: string): Promise<boolean> {
  const [res] = await DAO.query<Array<{ ID: number }>>(
    "SELECT ID FROM Donations WHERE PaymentExternal_ID = ? LIMIT 1",
    [externalRef],
  );
  return res.length > 0;
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
export type DonationDetails = {
  id: number;
  donor: string;
  donorId: number;
  email: string;
  /** Decimal string */
  sum: string;
  /** Decimal string */
  transactionCost: string | null;
  timestamp: Date;
  paymentId: number;
  paymentExternalRef: string | null;
  paymentMethod: string;
  KID: string;
  metaOwnerId: number;
  fundraiserId: number | null;
  distribution: Distribution;
};

async function getByID(donationID: number | string): Promise<DonationDetails> {
  var [getDonationFromIDquery] = await DAO.query<
    Array<{
      ID: number;
      sum_confirmed: string;
      KID_fordeling: string;
      transaction_cost: string | null;
      timestamp_confirmed: Date;
      Payment_ID: number;
      PaymentExternal_ID: string | null;
      Meta_owner_ID: number;
      donorId: number;
      full_name: string;
      email: string;
      payment_name: string;
      Fundraiser_ID: number | null;
    }>
  >(
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

  const donation: Omit<DonationDetails, "distribution"> = {
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

  return { ...donation, distribution };
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
export type DonationInRange = {
  ID: number;
  time: Date;
  name: string;
  donorID: number;
  /** Decimal string */
  sum: string;
  paymentMethod: string;
  /** Decimal string */
  transactionCost: string | null;
  split: Array<{
    /** Organization id */
    id: number;
    name: string;
    /** The organization's share of the whole donation in percent (decimal string) */
    percentage: string;
    /** The organization's amount of the donation, rounded to øre (decimal string) */
    amount: string;
  }>;
};

async function getFromRange(
  fromDate?: Date | null,
  toDate?: Date | null,
  paymentMethodIDs: number[] | null = null,
  /**
   * Compare instants: `fromDate` inclusive, `toDate` exclusive (tRPC whole Oslo days). By
   * default (REST) both are truncated to calendar dates of the stored wall clock, inclusive.
   */
  options: { exclusiveEnd?: boolean } = {},
): Promise<DonationInRange[]> {
  if (!fromDate) fromDate = new Date(2000, 0, 1);
  if (!toDate) toDate = new Date();
  const range = options.exclusiveEnd
    ? "Donations.timestamp_confirmed >= ? AND Donations.timestamp_confirmed < ?"
    : "Donations.timestamp_confirmed >= Date(?) AND Donations.timestamp_confirmed < Date(Date_add(Date(?), interval 1 day))";

  // An organization's share of a donation is its share within the cause area times the
  // cause area's share of the distribution.
  let [getFromRangeQuery] = await DAO.query<
    Array<{
      Donation_ID: number;
      timestamp_confirmed: Date;
      Donor_ID: number;
      transaction_cost: string | null;
      donor_name: string;
      sum_confirmed: string;
      payment_name: string;
      Org_ID: number;
      org_name: string;
      percentage_share: string;
      actual_share: string;
    }>
  >(
    `
                SELECT 
                    Donations.ID as Donation_ID,
                    Donations.timestamp_confirmed,  
                    Donations.Donor_ID, 
                    Donations.transaction_cost,
                    Donors.full_name as donor_name, 
                    Donations.sum_confirmed, 
                    Payment.payment_name,
                    Organizations.ID as Org_ID, 
                    Organizations.full_name as org_name, 
                    ROUND(DCA.Percentage_share * DCAO.Percentage_share / 100, 12) as percentage_share,
                    ROUND(Donations.sum_confirmed * DCA.Percentage_share * DCAO.Percentage_share / 10000, 2) as actual_share

                FROM Donations
                    INNER JOIN Distribution_cause_areas as DCA
                        ON DCA.Distribution_KID = Donations.KID_fordeling
                    INNER JOIN Distribution_cause_area_organizations as DCAO
                        ON DCAO.Distribution_cause_area_ID = DCA.ID
                    INNER JOIN Donors 
                        ON Donors.ID = Donations.Donor_ID
                    INNER JOIN Organizations 
                        ON Organizations.ID = DCAO.Organization_ID
                    INNER JOIN Payment
                        ON Payment.ID = Donations.Payment_ID
                
                WHERE ${range}
                ${
                  paymentMethodIDs != null
                    ? `
                    AND
                    Donations.Payment_ID IN (?)
                `
                    : ""
                }
                ORDER BY Donations.ID, DCA.ID, DCAO.ID
                `,
    [fromDate, toDate, paymentMethodIDs],
  );

  const donations = new Map<number, DonationInRange>();
  getFromRangeQuery.forEach((row) => {
    let donation = donations.get(row.Donation_ID);
    if (!donation) {
      donation = {
        ID: row.Donation_ID,
        time: row.timestamp_confirmed,
        name: row.donor_name,
        donorID: row.Donor_ID,
        sum: row.sum_confirmed,
        paymentMethod: row.payment_name,
        transactionCost: row.transaction_cost,
        split: [],
      };
      donations.set(row.Donation_ID, donation);
    }

    donation.split.push({
      id: row.Org_ID,
      name: row.org_name,
      percentage: row.percentage_share,
      amount: row.actual_share,
    });
  });

  return [...donations.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
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

  const summary: any[] = [];
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
 * Gets monthly aggregate donations by organization for Google Sheets export
 * Excludes Payment_ID 15 and Organization_ID 11
 * @returns {Array<{Year: number, Month: number, Charity: string, Amount: number, Cause: string}>}
 */
async function getMonthlyAggregateByOrganization(): Promise<
  Array<{
    Year: number;
    Month: number;
    Charity: string;
    Amount: number;
    Cause: string;
  }>
> {
  const [res] = await DAO.query(
    `
    SELECT
      YEAR(d.timestamp_confirmed) AS Year,
      MONTH(d.timestamp_confirmed) AS Month,
      o.full_name AS Charity,
      ROUND(SUM(d.sum_confirmed * (dca.Percentage_share / 100) * (dcao.Percentage_share / 100)), 2) AS Amount,
      ca.name AS Cause
    FROM Donations d
    JOIN Distributions dist ON d.KID_fordeling = dist.KID
    JOIN Distribution_cause_areas dca ON dist.KID = dca.Distribution_KID
    JOIN Distribution_cause_area_organizations dcao ON dca.ID = dcao.Distribution_cause_area_ID
    JOIN Organizations o ON dcao.Organization_ID = o.ID
    JOIN Cause_areas ca ON o.Cause_area_ID = ca.ID
    WHERE d.Payment_ID != 15 # Exclude influenced donations (not going through our accounts, to avoid double counting)
      AND o.full_name NOT IN ('Drift', 'Drift av Gi Effektivt')
    GROUP BY
      YEAR(d.timestamp_confirmed),
      MONTH(d.timestamp_confirmed),
      o.full_name,
      ca.name
    ORDER BY
      o.full_name,
      YEAR(d.timestamp_confirmed),
      MONTH(d.timestamp_confirmed)
    LIMIT 10000
    `,
  );

  return res.map((row) => ({
    Year: row.Year,
    Month: row.Month,
    Charity: row.Charity,
    Amount: parseFloat(row.Amount),
    Cause: row.Cause,
  }));
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

  const history: Array<{
    donationID: any;
    donationSum: any;
    date: any;
    distributions: Array<{ organization: any; abbriv: any; sum: any }>;
  }> = [];
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
 * Fetches all donations recieved by a specific donor to EA funds, i.e. donations made
 * through EA Giverportal (Meta_owner_ID = EA Norge)
 */
async function getEAFundsDonations(donorId: number): Promise<
  Array<{
    id: number;
    donorId: number;
    taxUnitId: number | null;
    sum: string;
    timestamp: string;
    paymentExternalId: string;
  }>
> {
  const [res] = await DAO.query(
    `
  SELECT
    Donations.ID,
    Donations.Donor_ID,
    Distributions.Tax_unit_ID,
    Donations.sum_confirmed,
    Donations.timestamp_confirmed,
    Donations.PaymentExternal_ID

    FROM Donations
    INNER JOIN Distributions ON Distributions.KID = Donations.KID_fordeling

    WHERE Donations.Donor_ID = ? AND Donations.Meta_owner_ID = ?
  `,
    [donorId, EA_NORGE_META_OWNER_ID],
  );

  return res.map((row) => {
    return {
      id: row.ID,
      donorId: row.Donor_ID,
      taxUnitId: row.Tax_unit_ID,
      sum: parseFloat(row.sum_confirmed),
      timestamp: row.timestamp_confirmed,
      paymentExternalId: row.PaymentExternal_ID,
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
  registeredDate: Date | string | null = null,
  externalPaymentID: string | null = null,
  metaOwnerID: number | null = null,
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

  publishEvent("donation:confirmed", {
    donationId: addDonationQuery.insertId,
    KID,
    amount: sum,
    timestamp: registeredDate,
    donorId: donorID,
  });

  enqueueTidbytDonationConfirmed({
    donationId: addDonationQuery.insertId,
    amount: sum,
    timestamp: (registeredDate || new Date()).toISOString(),
  });

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

export enum TaxUnitType {
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
  externalRefExists,
  getAggregateLastYearByMonth,
  getFromRange,
  getMedianFromRange,
  getHasReplacedOrgs,
  getSummary,
  getSummaryByYear,
  getHistory,
  getTransactionCostsReport,
  getYearlyAggregateByDonorId,
  getMonthlyAggregateByOrganization,
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
  getLogHistogramBySum,
  transferDonationsFromDummy,
  updateKIDBeforeTimestamp,
  updateKIDById,
  remove,
};
