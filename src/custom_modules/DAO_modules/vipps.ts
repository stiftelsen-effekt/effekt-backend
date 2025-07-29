import { distributions } from "./distributions";
import { DAO } from "../DAO";
import sqlString from "sqlstring";
import { Vipps_agreements, Vipps_order_transaction_statuses, Vipps_orders } from "@prisma/client";
import { AgreementReport } from "./avtalegiroagreements";

// Valid states for Vipps recurring charges
const chargeStatuses = [
  "PENDING",
  "DUE",
  "CHARGED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "RESERVED",
  "CANCELLED",
  "PROCESSING",
];

//region Get

/**
 * @typedef VippsToken
 * @property {number} ID
 * @property {Date} expires
 * @property {string} type
 * @property {string} token
 */

/**
 * @typedef VippsOrder
 * @property {number} ID
 * @property {string} orderID
 * @property {number} donorID
 * @property {number} donationID
 * @property {string} KID
 * @property {string} token
 * @property {Date} registered
 */

export type VippsAgreement = {
  ID: string;
  donorID: number;
  KID: string;
  amount: number;
  status: "ACTIVE" | "PENDING" | "EXPIRED" | "STOPPED";
  monthly_charge_day: number;
  timestamp_created: string;
  agreement_url_code: string;
  paused_until_date: string;
  force_charge_date: string;
};

/**
 * @typedef AgreementCharge
 * @property {string} chargeID
 * @property {string} agreementID
 * @property {string} KID
 * @property {number} amountNOK
 * @property {string} dueDate
 * @property {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status
 */

/**
 * @typedef VippsTransactionLogItem
 * @property {number} amount In øre
 * @property {string} transactionText
 * @property {number} transactionId
 * @property {string} timestamp JSON timestamp
 * @property {string} operation
 * @property {number} requestId
 * @property {boolean} operationSuccess
 */

/**
 * Fetches the latest token, if available
 * @returns {VippsToken | boolean} The most recent vipps token, false if expiration is within 10 minutes
 */
async function getLatestToken() {
  let [res] = await DAO.query(`
        SELECT * FROM Vipps_tokens
            ORDER BY expires DESC
            LIMIT 1`);

  if (res.length === 0) return false;
  if (res[0].expires - Date.now() < 10 * 60 * 1000) return false;

  return {
    ID: res[0].ID,
    expires: res[0].expires,
    type: res[0].type,
    token: res[0].token,
  };
}

/**
 * Fetches a vipps order
 * @property {string} orderID
 * @return {VippsOrder | false}
 */
async function getOrder(orderID) {
  let [res] = await DAO.query<Vipps_orders[]>(
    `
        SELECT * FROM Vipps_orders
            WHERE
                orderID = ?
            LIMIT 1`,
    [orderID],
  );

  if (res.length === 0) return false;
  else return res[0];
}

/** Fetches vipps transaction statuses for a given orderID
 * @param {string} orderId
 * @return {Vipps_order_transaction_statuses[] | false} Array of transaction statuses ordered descendingly by timestamp, false if no statuses found
 * */
async function getOrderTransactionStatusHistory(orderId) {
  let [res] = await DAO.query<Vipps_order_transaction_statuses[]>(
    `
        SELECT * FROM Vipps_order_transaction_statuses
            WHERE
                orderID = ?
            ORDER BY timestamp DESC
        `,
    [orderId],
  );

  if (res.length === 0) return false;
  else return res;
}

/**
 * Fetches the most recent vipps order
 * @return {VippsOrder | false}
 */
async function getRecentOrder() {
  let [res] = await DAO.query<Vipps_orders[]>(`
        SELECT * FROM Vipps_orders
            ORDER BY 
                registered DESC
            LIMIT 1`);

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Fetches an agreement by agreementId
 * @property {string} agreementID
 * @return {VippsAgreement | false}
 */
async function getAgreement(agreementID): Promise<VippsAgreement | false> {
  let [res] = await DAO.query(
    `
        SELECT ID, status, donorID, KID, timestamp_created, monthly_charge_day, force_charge_date, paused_until_date, amount, agreement_url_code FROM 
            Vipps_agreements
        WHERE 
            ID = ?
        `,
    [agreementID],
  );

  if (res.length < 1) {
    console.error("Could not find agreement with ID " + agreementID);
    return false;
  }

  let agreement = res[0];

  agreement.distribution = await distributions.getSplitByKID(agreement.KID);

  return agreement;
}

interface VippsAgreementFilters {
  amount?: { from?: number; to?: number };
  created?: { from?: Date | null; to?: Date | null };
  chargeDay?: { from?: number; to?: number };
  KID?: string;
  donor?: string;
  statuses?: Array<string>;
}

interface VippsAgreementRow {
  ID: number;
  status: string;
  amount: number;
  KID: string;
  monthly_charge_day: number;
  timestamp_created: Date;
  agreement_url_code: string;
  full_name: string;
}

interface VippsAgreementStatistics {
  numAgreements: number;
  sumAgreements: number;
  avgAgreement: number;
}

/**
 * Fetches all Vipps agreements with sorting, filtering, and pagination.
 * @param sort - The sorting object { id: string, desc: boolean }.
 * @param page - The current page number for pagination.
 * @param limit - The number of agreements per page.
 * @param filter - The filter object for querying agreements.
 * @returns A promise that resolves to an object containing the agreement rows, statistics, and total page count.
 */
export async function getAgreements(
  sort: { id: string; desc: boolean } | null = { id: "id", desc: true },
  page: number,
  limit: number = 10,
  filter: VippsAgreementFilters | null = null,
  locale?: string,
): Promise<{
  rows: Array<VippsAgreementRow>;
  statistics: VippsAgreementStatistics;
  pages: number;
}> {
  if (!sort) {
    throw new Error("No sort provided for getVippsAgreements");
  }

  const sortColumnEntry = jsDBmapping.find((map) => map[0] === sort.id);
  if (!sortColumnEntry) {
    throw new Error(`Invalid sort column: ${sort.id}`);
  }
  const sortColumn = sortColumnEntry[1];
  const sortDirection = sort.desc ? "DESC" : "ASC";

  const whereClauses: string[] = [];
  const joins: string[] = [`INNER JOIN Donors ON VA.donorID = Donors.ID`];

  if (filter) {
    if (filter.amount) {
      if (filter.amount.from !== undefined)
        whereClauses.push(`VA.amount >= ${sqlString.escape(filter.amount.from)}`);
      if (filter.amount.to !== undefined)
        whereClauses.push(`VA.amount <= ${sqlString.escape(filter.amount.to)}`);
    }
    if (filter.created) {
      if (filter.created.from)
        whereClauses.push(`VA.timestamp_created >= ${sqlString.escape(filter.created.from)}`);
      if (filter.created.to) {
        const toDate = new Date(filter.created.to);
        toDate.setDate(toDate.getDate() + 1); // Make it inclusive of the whole 'to' day
        whereClauses.push(`VA.timestamp_created < ${sqlString.escape(toDate)}`);
      }
    }
    if (filter.chargeDay) {
      if (filter.chargeDay.from !== undefined)
        whereClauses.push(`VA.monthly_charge_day >= ${sqlString.escape(filter.chargeDay.from)}`);
      if (filter.chargeDay.to !== undefined)
        whereClauses.push(`VA.monthly_charge_day <= ${sqlString.escape(filter.chargeDay.to)}`);
    }
    if (filter.KID && filter.KID.length > 0) {
      whereClauses.push(`CAST(VA.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)}`);
    }
    if (filter.donor && filter.donor.length > 0) {
      whereClauses.push(`Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}`);
    }
    if (filter.statuses) {
      if (filter.statuses.length === 0) {
        return {
          rows: [],
          statistics: { numAgreements: 0, sumAgreements: 0, avgAgreement: 0 },
          pages: 0,
        };
      }
      whereClauses.push(
        `VA.status IN (${filter.statuses.map((status) => sqlString.escape(status)).join(",")})`,
      );
    }
  }

  const whereStatement =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "WHERE 1";
  const joinStatement = joins.join(" \n ");

  const query = `
    WITH FilteredAgreements AS (
      SELECT DISTINCT
        VA.ID,
        VA.status,
        VA.amount,
        VA.KID,
        VA.monthly_charge_day,
        VA.timestamp_created,
        VA.agreement_url_code,
        Donors.full_name
      FROM Vipps_agreements as VA
      ${joinStatement}
      ${whereStatement}
    ),
    TotalStats AS (
      SELECT 
        COUNT(*) as total_count,
        SUM(amount) as total_sum,
        AVG(amount) as total_avg
      FROM FilteredAgreements
    )
    SELECT 
      FA.*,
      TS.total_count,
      TS.total_sum,
      TS.total_avg
    FROM FilteredAgreements FA
    CROSS JOIN TotalStats TS
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(page * limit)};
  `;

  const [resultRows]: [any[], any] = await DAO.query(query);

  if (resultRows.length === 0) {
    return {
      rows: [],
      statistics: { numAgreements: 0, sumAgreements: 0, avgAgreement: 0 },
      pages: 0,
    };
  }

  const numAgreements = resultRows[0]["total_count"] || 0;
  const sumAgreements = resultRows[0]["total_sum"] || 0;
  const avgAgreement = resultRows[0]["total_avg"] || 0;
  const pages = Math.ceil(numAgreements / limit);

  const mappedRows: VippsAgreementRow[] = resultRows.map((row) => ({
    ID: row.ID,
    full_name: row.full_name,
    status: row.status,
    amount: row.amount,
    monthly_charge_day: row.monthly_charge_day,
    KID: row.KID,
    timestamp_created: new Date(row.timestamp_created),
    agreement_url_code: row.agreement_url_code,
  }));

  return {
    rows: mappedRows,
    statistics: {
      numAgreements: Number(numAgreements),
      sumAgreements: Number(sumAgreements),
      avgAgreement: Number(avgAgreement),
    },
    pages,
  };
}

/**
 * Fetches an agreement by donor id
 * @property {number} donorId
 * @return {VippsAgreement}
 */
async function getAgreementsByDonorId(donorId): Promise<VippsAgreement[]> {
  const [agreements] = await DAO.query(
    `
            SELECT Vipps_agreements.ID, 
                status, 
                donorID,
                Donors.full_name,
                KID, 
                timestamp_created, 
                monthly_charge_day, 
                force_charge_date, 
                paused_until_date, 
                amount, 
                agreement_url_code 
                
                FROM Vipps_agreements

                INNER JOIN Donors
                    ON Vipps_agreements.donorID = Donors.ID
            
                WHERE 
                    donorID = ?
            `,
    [donorId],
  );

  return agreements;
}

/**
 * Fetches all charges with sorting and filtering
 * @param {column: string, desc: boolean} sort Sort object
 * @param {string | number | Date} page Used for pagination
 * @param {number=10} limit Agreement count limit per page, defaults to 10
 * @param {object} filter Filtering object
 * @return {Agreement[]} Array of agreements
 */
async function getCharges(
  sort,
  page,
  limit,
  filter,
): Promise<{
  pages: number;
  rows: Array<any>;
  statistics: {
    numCharges: number;
    sumCharges: string;
    avgCharge: string;
  };
}> {
  const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1];
  const sortDirection = sort.desc ? "DESC" : "ASC";
  const offset = page * limit;

  let where = [];
  if (filter) {
    if (filter.amount) {
      if (filter.amount.from) where.push(`amountNOK >= ${sqlString.escape(filter.amount.from)} `);
      if (filter.amount.to) where.push(`amountNOK <= ${sqlString.escape(filter.amount.to)} `);
    }

    if (filter.dueDate) {
      if (filter.dueDate.from) where.push(`dueDate >= ${sqlString.escape(filter.dueDate.from)} `);
      if (filter.dueDate.to) where.push(`dueDate <= ${sqlString.escape(filter.dueDate.to)} `);
    }

    if (filter.timestamp) {
      if (filter.timestamp.from)
        where.push(`timestamp_created >= ${sqlString.escape(filter.dueDate.from)} `);
      if (filter.timestamp.to)
        where.push(`timestamp_created <= ${sqlString.escape(filter.dueDate.to)} `);
    }

    if (filter.KID)
      where.push(` CAST(VC.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
    if (filter.donor)
      where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `);
    if (filter.statuses) {
      if (filter.statuses.length == 0) {
        return {
          pages: 0,
          rows: [],
          statistics: {
            numCharges: 0,
            sumCharges: "0",
            avgCharge: "0",
          },
        };
      }
      where.push(` VC.status IN (${filter.statuses.map((ID) => sqlString.escape(ID)).join(",")}) `);
    }
  }

  const columns = `
    VC.chargeID,
    VC.agreementID,
    VC.status,
    VC.type,
    VC.amountNOK,
    VC.KID,
    VC.timestamp_created,
    VC.dueDate,
    Donors.full_name
  `;

  const [charges] = await DAO.query(
    `
        SELECT
          count(*) OVER() AS full_count,
          sum(amountNOK) OVER() AS full_sum,
          avg(amountNOK) OVER() AS full_avg,
          ${columns}

        FROM Vipps_agreement_charges as VC
        INNER JOIN Vipps_agreements as VA
            ON VA.ID = VC.agreementID
        INNER JOIN Donors
            ON Donors.ID = VA.donorID
        WHERE
            ${where.length !== 0 ? where.join(" AND ") : "1"}

        GROUP BY
          ${columns}

        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
        `,
    [limit, offset],
  );

  const numCharges = charges.length > 0 ? charges[0]["full_count"] : 0;
  const sumCharges = charges.length > 0 ? charges[0]["full_sum"] : 0;
  const avgCharge = charges.length > 0 ? charges[0]["full_avg"] : 0;

  if (charges.length === 0) {
    return {
      pages: 0,
      rows: [],
      statistics: {
        numCharges: 0,
        sumCharges: "0",
        avgCharge: "0",
      },
    };
  } else {
    return {
      pages: Math.ceil(numCharges / limit),
      rows: charges,
      statistics: {
        numCharges,
        sumCharges,
        avgCharge,
      },
    };
  }
}

/**
 * Fetches an agreement ID by agreementUrlCode
 * @property {string} agreementUrlCode The code used in the Vipps merchantAgreementUrl
 * @return {number | false} agreementId
 */
async function getAgreementIdByUrlCode(agreementUrlCode): Promise<number | false> {
  let [res] = await DAO.query(
    `
        SELECT ID FROM 
            Vipps_agreements
        WHERE 
            agreement_url_code = ?
        `,
    [agreementUrlCode],
  );

  if (res.length === 0) return false;
  else return res[0].ID;
}

/**
 * Fetches an agreement charge by chargeID
 * @param {string} agreementId
 * @param {string} chargeId
 * @return {AgreementCharge}
 */
async function getCharge(agreementId, chargeId) {
  let [res] = await DAO.query(
    `
        SELECT * FROM 
            Vipps_agreement_charges
        WHERE
            agreementID = ? AND chargeID = ?
        `,
    [agreementId, chargeId],
  );

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Fetches the inital charge of an agreement
 * @param {string} agreementID
 */
async function getInitialCharge(agreementID) {
  let [res] = await DAO.query(
    `
        SELECT * FROM 
            Vipps_agreement_charges
        WHERE 
            agreementID = ? and status = "PENDING" && type = "INITIAL"
        `,
    [agreementID],
  );

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Fetches all active agreements
 * @property {number} monthly_charge_day
 * @return {[VippsAgreement]}
 */
async function getActiveAgreements(): Promise<VippsAgreement[] | false> {
  let [res] = await DAO.query(`
        SELECT * FROM 
            Vipps_agreements 
        WHERE 
            status = "ACTIVE"
        `);

  if (res.length === 0) return false;
  else return res;
}

/**
 * Fetches key statistics of active agreements
 * @return {Object}
 */
async function getAgreementReport() {
  let [res] = await DAO.query<AgreementReport[]>(`
    SELECT 
        count(ID) as activeAgreementCount,
        round(avg(amount), 0) as averageAgreementSum,
        round(sum(amount), 0) as totalAgreementSum,
        round((
            SELECT AVG(dd.amount) as median_val
                FROM (
                    SELECT VA.amount, @rownum:=@rownum+1 as 'row_number', @total_rows:=@rownum
                    FROM Vipps_agreements as VA, (SELECT @rownum:=0) r
                        WHERE VA.amount is NOT NULL
                        AND VA.status = "ACTIVE"
                    ORDER BY VA.amount
                ) as dd
            WHERE dd.row_number IN ( FLOOR((@total_rows+1)/2), FLOOR((@total_rows+2)/2) )
        ), 0) as medianAgreementSum,
        (SELECT count(ID) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND (status='ACTIVE' OR (status='STOPPED' AND cancellation_date IS NOT NULL))
        ) as activatedThisMonth,
        (SELECT sum(amount) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND (status='ACTIVE' OR (status='STOPPED' AND cancellation_date IS NOT NULL))
        ) as sumActivatedThisMonth,
        (SELECT count(ID) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND status='PENDING'
        ) as pendingThisMonth,
        (SELECT sum(amount) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND status='PENDING'
        ) as sumPendingThisMonth,
        (SELECT count(ID) 
            FROM Vipps_agreements 
            WHERE month(cancellation_date) = month(current_timestamp())
            AND year(cancellation_date) = year(current_timestamp())
        ) as stoppedThisMonth,
        (SELECT sum(amount) 
            FROM Vipps_agreements 
            WHERE month(cancellation_date) = month(current_timestamp())
            AND year(cancellation_date) = year(current_timestamp())
            AND status='STOPPED'
        ) as sumStoppedThisMonth,
        (SELECT count(ID) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND status='EXPIRED'
        ) as expiredThisMonth,
        (SELECT sum(amount) 
            FROM Vipps_agreements 
            WHERE month(timestamp_created) = month(current_timestamp())
            AND year(timestamp_created) = year(current_timestamp())
            AND status='EXPIRED'
        ) as sumExpiredThisMonth
    FROM 
        Vipps_agreements
    WHERE
        status = "ACTIVE" and
    (paused_until_date < (SELECT current_timestamp()) or paused_until_date IS NULL) and amount >= 50
        `);

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Gets a histogram of all agreements by agreement sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getAgreementSumHistogram() {
  let [results] = await DAO.query(`
            SELECT 
                floor(amount/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Vipps_agreements
            GROUP BY 1
            ORDER BY 1;
        `);

  return results;
}

/**
 * Gets a histogram of all charges by charge sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getChargeSumHistogram() {
  let [results] = await DAO.query(`
            SELECT 
                floor(amountNOK/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Vipps_agreement_charges
            GROUP BY 1
            ORDER BY 1;
        `);

  return results;
}

/**
 * A list of all missing charges for the last 2 months
 * Calculated by looking at agreements where there is no charge corresponding to the monthly_charge_day
 * @returns {Array<Object>} Returns an array of missing charges
 */
async function getMissingCharges() {
  let [results] = await DAO.query<
    {
      agreementID: string;
      KID: string;
      amount: number;
      monthly_charge_day: number;
      missing_charge_date: string;
      timestamp_created: string;
      full_name: string;
      vipps_recurring_donations_last_2months: number;
    }[]
  >(`
        SELECT 
          MI.*, 
          D.full_name,
          (
              SELECT COUNT(*)
              FROM Donations d
              WHERE d.Donor_ID = D.ID
              AND d.Payment_ID = 7
              AND d.timestamp_confirmed >= DATE_SUB(CURRENT_DATE, INTERVAL 2 MONTH)
          ) as vipps_recurring_donations_last_2months
          
          FROM EffektDonasjonDB.v_Missing_vipps_charges as MI
          INNER JOIN Distributions as DIST
            ON MI.KID = DIST.KID
          INNER JOIN Donors as D
            ON DIST.Donor_ID = D.ID
        
          WHERE D.ID != 1464
        `);

  return results;
}

async function getMatchingRules(): Promise<
  {
    id: number;
    salesLocation: string | null;
    message: string | null;
    periodFrom: Date;
    periodTo: Date;
    resolveKID: string;
    resolveAdoveoFundraiserID: number | null;
    precedence: number | null;
  }[]
> {
  let [results] = await DAO.query(`
        SELECT 
            ID, 
            SalesLocation, 
            Message, 
            PeriodFrom, 
            PeriodTo, 
            ResolveKID, 
            ResolveAdoveoFundraiserID, 
            precedence
        FROM Vipps_matching_rules
    `);

  return results.map((row) => ({
    id: row.ID,
    salesLocation: row.SalesLocation,
    message: row.Message,
    periodFrom: row.PeriodFrom,
    periodTo: row.PeriodTo,
    resolveKID: row.ResolveKID,
    resolveAdoveoFundraiserID: row.ResolveAdoveoFundraiserID,
    precedence: row.precedence,
  }));
}
//endregion

//region Add

/**
 * Adds a Vipps access token
 * @param {VippsToken} token Does not need to have ID specified
 * @return {number} token ID in database
 */
async function addToken(token) {
  let [result] = await DAO.query(
    `
        INSERT INTO Vipps_tokens
            (expires, type, token)
            VALUES
            (?,?,?)
    `,
    [token.expires, token.type, token.token],
  );

  return result.insertId;
}

/**
 * Adds a Vipps order
 * @param {VippsOrder} order
 * @return {number} ID of inserted order
 */
async function addOrder(order) {
  let [result] = await DAO.query(
    `
            INSERT INTO Vipps_orders
                    (orderID, donorID, KID, token)
                    VALUES
                    (?,?,?,?)
        `,
    [order.orderID, order.donorID, order.KID, order.token],
  );

  return result.insertId;
}

/**
 * Add a new Vipps recurring donation agreement
 * @param {string} agreementID Provided by vipps
 * @param {number} donorID The Donor the agreement concerns
 * @param {number} KID The KID used for recurring payments
 * @param {number} sum The SUM used for recurring payments (in NOK)
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status Whether the agreement has been activated. Defaults to false
 * @return {boolean} Success or not
 */
async function addAgreement(
  agreementID,
  donorID,
  KID,
  amount,
  monthlyChargeDay,
  agreementUrlCode,
  status = "PENDING",
) {
  if (monthlyChargeDay < 0 || monthlyChargeDay > 28) {
    return false;
  }

  try {
    DAO.query(
      `
            INSERT IGNORE INTO Vipps_agreements
                (ID, donorID, KID, amount, monthly_charge_day, agreement_url_code, status)
            VALUES
                (?,?,?,?,?,?,?)`,
      [agreementID, donorID, KID, amount, monthlyChargeDay, agreementUrlCode, status],
    );

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Add a charge to an agreement
 * @param {string} chargeID
 * @param {string} agreementId Provided by vipps
 * @param {number} amountNOK The amount of money for each charge in NOK, not øre
 * @param {number} KID The KID of the agreement
 * @param {string} dueDate Due date of the charge
 * @param {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status The status of the charge
 * @param {"INITIAL" | "RECURRING"} type
 * @return {boolean} Success or not
 */
async function addCharge(chargeID, agreementID, amountNOK, KID, dueDate, status, type) {
  try {
    DAO.query(
      `
            INSERT IGNORE INTO Vipps_agreement_charges
                (chargeID, agreementId, amountNOK, KID, dueDate, status, type)
            VALUES
                (?,?,?,?,?,?,?)`,
      [chargeID, agreementID, amountNOK, KID, dueDate, status, type],
    );

    return true;
  } catch (ex) {
    console.error("Error inserting charge");
    return false;
  }
}

async function addMatchingRule({
  salesLocation,
  message,
  periodFrom,
  periodTo,
  resolveKID,
  resolveAdoveoFundraiserID,
  precedence,
}) {
  try {
    const [result] = await DAO.query(
      `
            INSERT INTO Vipps_matching_rules
                (SalesLocation, Message, PeriodFrom, PeriodTo, ResolveKID, ResolveAdoveoFundraiserID, precedence)
            VALUES
                (?,?,?,?,?,?,?)`,
      [
        salesLocation,
        message,
        periodFrom,
        periodTo,
        resolveKID,
        resolveAdoveoFundraiserID,
        precedence,
      ],
    );

    return result.insertId;
  } catch (ex) {
    console.error("Error inserting matching rule", ex);
    return false;
  }
}

//endregion

//region Modify
/**
 * Adds a Vipps order transaction status
 * @param {string} orderId
 * @param {Array<VippsTransactionLogItem>} transactionHistory
 * @return {boolean} Success or not
 */
async function updateOrderTransactionStatusHistory(orderId, transactionHistory) {
  let transaction = await DAO.startTransaction();
  try {
    await transaction.query(`DELETE FROM Vipps_order_transaction_statuses WHERE orderID = ?`, [
      orderId,
    ]);

    const mappedInsertValues = transactionHistory.map((logItem) => [
      orderId,
      logItem.transactionId,
      logItem.amount,
      logItem.operation,
      logItem.timeStamp,
      logItem.operationSuccess,
    ]);

    await transaction.query(
      `
            INSERT INTO Vipps_order_transaction_statuses
                    (orderID, transactionID, amount, operation, timestamp, success)
                    VALUES
                    ?
        `,
      [mappedInsertValues],
    );

    await DAO.commitTransaction(transaction);

    return true;
  } catch (ex) {
    await DAO.rollbackTransaction(transaction);
    console.error(`Failed to update order transaction history for orderId ${orderId}`, ex);
    return false;
  }
}

/**
 * Updates the donationID associated with a vipps order
 * @param {string} orderID
 * @param {number} donationID
 * @return {boolean} Success or failure
 */
async function updateVippsOrderDonation(orderID, donationID) {
  let [result] = await DAO.query(
    `
            UPDATE Vipps_orders
                SET donationID = ?
                WHERE orderID = ?
        `,
    [donationID, orderID],
  );

  return result.affectedRows != 0 ? true : false;
}

/**
 * Updates price of a recurring agreement
 * @param {string} agreementId The agreement ID
 * @param {number} price In NOK
 * @return {boolean} Success
 */
async function updateAgreementPrice(agreementId, price) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET amount = ? WHERE ID = ?`, [price, agreementId]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updates status of a recurring agreement
 * @param {string} agreementID The agreement ID
 * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status
 * @return {boolean} Success
 */
async function updateAgreementStatus(agreementID, status) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET status = ? WHERE ID = ?`, [status, agreementID]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Update the cancellation date of a Vipps agreement
 * @param {string} agreementID The agreement ID
 * @param {Date} date
 * @return {boolean} Success
 */
async function updateAgreementCancellationDate(agreementID) {
  const today = new Date();
  //YYYY-MM-DD format
  const mysqlDate = today.toISOString().split("T")[0];

  try {
    DAO.query(`UPDATE Vipps_agreements SET cancellation_date = ? WHERE ID = ?`, [
      mysqlDate,
      agreementID,
    ]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updates the monthly_charge_day of an agreement
 * @param {string} agreementId The agreement ID
 * @param {number} chargeDay Any day between 1 and 28
 * @return {boolean} Success
 */
async function updateAgreementChargeDay(agreementId, chargeDay) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET monthly_charge_day = ? WHERE ID = ?`, [
      chargeDay,
      agreementId,
    ]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updates the KID of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} KID KID
 * @return {boolean} Success
 */
async function updateAgreementKID(agreementId, KID) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET KID = ? WHERE ID = ?`, [KID, agreementId]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updates the pause date of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} pausedUntilDate The date when the pause ends
 * @return {boolean} Success
 */
async function updateAgreementPauseDate(agreementId, pausedUntilDate) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET paused_until_date = ? WHERE ID = ?`, [
      pausedUntilDate,
      agreementId,
    ]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updates the forced charge date of an agreement
 * @param {string} agreementId The agreement ID
 * @param {string} forceChargeDate The date of the forced charge
 * @return {boolean} Success
 */
async function updateAgreementForcedCharge(agreementId, forceChargeDate) {
  try {
    DAO.query(`UPDATE Vipps_agreements SET force_charge_date = ? WHERE ID = ?`, [
      forceChargeDate,
      agreementId,
    ]);

    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Updated status of a charge
 * @param {string} agreementID agreementID
 * @param {string} chargeID chargeID
 * @param {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} newStatus The new status of the charge
 */
async function updateChargeStatus(newStatus, agreementID, chargeID) {
  if (!chargeStatuses.includes(newStatus)) {
    console.error(newStatus + " is not a valid charge state");
    return false;
  }

  try {
    DAO.query(
      `
            UPDATE Vipps_agreement_charges
            SET status = ?
            WHERE agreementID = ?
            AND chargeID = ?
        `,
      [newStatus, agreementID, chargeID],
    );

    return true;
  } catch (ex) {
    console.error("Error setting charge status to CANCELLED");
    return false;
  }
}

//endregion

//region Delete
async function deleteMatchingRule(id: number): Promise<boolean> {
  try {
    const [res] = await DAO.query(
      `
            DELETE FROM Vipps_matching_rules
            WHERE ID = ?
        `,
      [id],
    );

    if (res.affectedRows === 0) {
      console.error(`No matching rule found with ID ${id}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error deleting matching rule with ID ${id}:`, error);
    return false;
  }
}
//endregion

//Helpers

const jsDBmapping = [
  ["id", "ID"],
  ["full_name", "full_name"],
  ["kid", "KID"],
  ["amount", "amount"],
  ["chargeDay", "monthly_charge_day"],
  ["pausedUntilDate", "paused_until_date"],
  ["created", "timestamp_created"],
  ["status", "status"],
  ["amountNOK", "amountNOK"],
  ["dueDate", "dueDate"],
];

export const vipps = {
  getLatestToken,
  getOrder,
  getRecentOrder,
  getOrderTransactionStatusHistory,
  getAgreement,
  getAgreements,
  getAgreementsByDonorId,
  getCharges,
  getCharge,
  getInitialCharge,
  getAgreementIdByUrlCode,
  getAgreementSumHistogram,
  getChargeSumHistogram,
  getActiveAgreements,
  getAgreementReport,
  getMissingCharges,
  getMatchingRules,
  addToken,
  addOrder,
  addAgreement,
  addCharge,
  addMatchingRule,
  updateOrderTransactionStatusHistory,
  updateVippsOrderDonation,
  updateAgreementPrice,
  updateAgreementStatus,
  updateAgreementChargeDay,
  updateAgreementKID,
  updateAgreementPauseDate,
  updateAgreementForcedCharge,
  updateChargeStatus,
  updateAgreementCancellationDate,
  deleteMatchingRule,
};
