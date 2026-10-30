import { distributions } from "./distributions";
import { DAO } from "../DAO";
import sqlString from "sqlstring";
import { dbClockColumn, instantRangeClauses, type InstantRange } from "../osloDays";
import type { ResultSetHeader } from "mysql2";
import { Vipps_agreements, Vipps_order_transaction_statuses, Vipps_orders } from "@prisma/client";

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
  /** YYYY-MM-DD, null when not paused */
  paused_until_date: string | null;
  /** YYYY-MM-DD, null when no forced charge is scheduled */
  force_charge_date: string | null;
};

/** Key figures for Vipps agreements. Sums are DECIMAL strings, null when nothing matched. */
export type VippsAgreementReport = {
  activeAgreementCount: number;
  averageAgreementSum: string | null;
  totalAgreementSum: string | null;
  medianAgreementSum: string | null;
  activatedThisMonth: number;
  sumActivatedThisMonth: string | null;
  pendingThisMonth: number;
  sumPendingThisMonth: string | null;
  stoppedThisMonth: number;
  sumStoppedThisMonth: string | null;
  expiredThisMonth: number;
  sumExpiredThisMonth: string | null;
};

/** A histogram bucket: amounts in [bucket, bucket + 500) NOK */
export type VippsSumHistogramBucket = {
  bucket: number;
  items: number;
  /** 100 * ln(items), for a logarithmic bar height */
  bar: number;
};

export type VippsChargeRow = {
  chargeID: string;
  agreementID: string;
  status: string;
  type: string | null;
  amountNOK: number;
  KID: string;
  timestamp_created: Date | null;
  /** YYYY-MM-DD */
  dueDate: string;
  full_name: string | null;
  /** Window aggregates over the whole filtered result */
  full_count: number;
  /** DECIMAL string */
  full_sum: string;
  /** DECIMAL string */
  full_avg: string;
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
  // ID is a VARCHAR: MySQL coerces non-numeric IDs to 0, so `ID = false` matches every row
  if (!agreementID) return false;

  let [res] = await DAO.query(
    `
        SELECT ID, status, donorID, KID, ${dbClockColumn(
          "timestamp_created",
        )}, monthly_charge_day, force_charge_date, paused_until_date, amount, agreement_url_code FROM 
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
  /** Half-open instant range (osloDays.ts), used by tRPC; timestamp_created is filled by MySQL */
  createdRange?: InstantRange;
  chargeDay?: { from?: number; to?: number };
  KID?: string;
  donor?: string;
  statuses?: Array<string>;
  agreementID?: string;
}

export interface VippsAgreementRow {
  ID: string;
  status: string;
  amount: number;
  KID: string;
  monthly_charge_day: number;
  timestamp_created: Date;
  agreement_url_code: string;
  full_name: string;
}

export interface VippsAgreementStatistics {
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
    whereClauses.push(...instantRangeClauses("VA.timestamp_created", filter.createdRange, "db"));
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
    if (filter.agreementID && filter.agreementID.length > 0) {
      whereClauses.push(`VA.ID LIKE ${sqlString.escape(`%${filter.agreementID}%`)}`);
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
        ${dbClockColumn("VA.timestamp_created")},
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

  // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- filter values go through sqlString.escape, the sort column comes from the jsDBmapping allowlist
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

export type VippsAgreementPayments = {
  /** The agreement's current KID first, then other KIDs its charges were made under */
  KIDs: string[];
  /**
   * Donations of the agreement, newest first: Vipps recurring donations on any of the KIDs, and
   * donations registered from one of its charges (external id "<agreement>.<charge>")
   */
  donations: Array<{
    id: number;
    /** Decimal string */
    sum: string;
    /** Decimal string */
    transactionCost: string | null;
    timestamp: Date;
    paymentMethod: string;
    KID: string;
    /** The charge the donation was registered from, if any */
    chargeId: string | null;
  }>;
  /** The agreement's charges (Vipps_agreement_charges), newest due date first */
  charges: Array<{
    chargeId: string;
    /** Whole NOK */
    amount: number;
    KID: string;
    /** YYYY-MM-DD */
    dueDate: string;
    status: string;
    type: string | null;
    created: Date | null;
    /** The donation registered from the charge, if any */
    donationId: number | null;
  }>;
};

/**
 * Payments of a Vipps agreement: its charges and its donations, following KID changes (a
 * distribution change gives the agreement a new KID; earlier charges keep theirs).
 * @returns null if there is no agreement with the id
 */
async function getPaymentsByAgreementId(
  agreementId: string,
): Promise<VippsAgreementPayments | null> {
  const [agreements] = await DAO.query<Array<{ KID: string }>>(
    "SELECT KID FROM Vipps_agreements WHERE ID = ?",
    [agreementId],
  );
  if (agreements.length === 0) return null;

  const [chargeRows] = await DAO.query<
    Array<{
      chargeID: string;
      amountNOK: number;
      KID: string;
      dueDate: string;
      status: string;
      type: string | null;
      timestamp_created: Date | null;
    }>
  >(
    `SELECT chargeID, amountNOK, KID, dueDate, status, type, ${dbClockColumn("timestamp_created")}
     FROM Vipps_agreement_charges
     WHERE agreementID = ?
     ORDER BY dueDate DESC, Vipps_agreement_charges.timestamp_created DESC`,
    [agreementId],
  );

  const KIDs = [...new Set([agreements[0].KID, ...chargeRows.map((charge) => charge.KID)])];
  const chargePrefix = `${agreementId}.`;

  const [donationRows] = await DAO.query<
    Array<{
      ID: number;
      sum_confirmed: string;
      transaction_cost: string | null;
      timestamp_confirmed: Date;
      payment_name: string;
      KID_fordeling: string;
      PaymentExternal_ID: string | null;
    }>
  >(
    `SELECT D.ID, D.sum_confirmed, D.transaction_cost, D.timestamp_confirmed, P.payment_name,
       D.KID_fordeling, D.PaymentExternal_ID
     FROM Donations AS D
     INNER JOIN Payment AS P ON D.Payment_ID = P.ID
     WHERE (D.KID_fordeling IN (?) AND D.Payment_ID = 8)
       OR D.PaymentExternal_ID LIKE ?
     ORDER BY D.timestamp_confirmed DESC, D.ID DESC`,
    [KIDs, `${chargePrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );

  const chargeIdOf = (externalId: string | null) =>
    externalId?.startsWith(chargePrefix) ? externalId.slice(chargePrefix.length) : null;
  const donationByCharge = new Map<string, number>();
  for (const row of donationRows) {
    const chargeId = chargeIdOf(row.PaymentExternal_ID);
    if (chargeId !== null && !donationByCharge.has(chargeId))
      donationByCharge.set(chargeId, row.ID);
  }

  return {
    KIDs,
    donations: donationRows.map((row) => ({
      id: row.ID,
      sum: row.sum_confirmed,
      transactionCost: row.transaction_cost,
      timestamp: row.timestamp_confirmed,
      paymentMethod: row.payment_name,
      KID: row.KID_fordeling,
      chargeId: chargeIdOf(row.PaymentExternal_ID),
    })),
    charges: chargeRows.map((charge) => ({
      chargeId: charge.chargeID,
      amount: charge.amountNOK,
      KID: charge.KID,
      dueDate: charge.dueDate,
      status: charge.status,
      type: charge.type,
      created: charge.timestamp_created,
      donationId: donationByCharge.get(charge.chargeID) ?? null,
    })),
  };
}

/**
 * Fetches an agreement by donor id
 * @property {number} donorId
 * @return {VippsAgreement}
 */
async function getAgreementsByDonorId(
  donorId,
): Promise<(VippsAgreement & { full_name: string | null })[]> {
  const [agreements] = await DAO.query(
    `
            SELECT Vipps_agreements.ID, 
                status, 
                donorID,
                Donors.full_name,
                KID, 
                ${dbClockColumn("timestamp_created")}, 
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
  rows: VippsChargeRow[];
  statistics: {
    numCharges: number;
    sumCharges: string;
    avgCharge: string;
  };
}> {
  const mappedColumn = jsDBmapping.find((map) => map[0] === sort.id)![1];
  // The charge's own column, not the converted `timestamp_created` alias, so the sort can use an index
  const sortColumn = mappedColumn === "timestamp_created" ? "VC.timestamp_created" : mappedColumn;
  const sortDirection = sort.desc ? "DESC" : "ASC";
  const offset = page * limit;

  let where: string[] = [];
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
        where.push(`timestamp_created >= ${sqlString.escape(filter.timestamp.from)} `);
      if (filter.timestamp.to)
        where.push(`timestamp_created <= ${sqlString.escape(filter.timestamp.to)} `);
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
    if (filter.agreementID && filter.agreementID.length > 0) {
      where.push(` VC.agreementID LIKE ${sqlString.escape(`%${filter.agreementID}%`)} `);
    }
    if (filter.chargeID && filter.chargeID.length > 0) {
      where.push(` VC.chargeID LIKE ${sqlString.escape(`%${filter.chargeID}%`)} `);
    }
  }

  const columns = `
    VC.chargeID,
    VC.agreementID,
    VC.status,
    VC.type,
    VC.amountNOK,
    VC.KID,
    ${dbClockColumn("VC.timestamp_created")},
    VC.dueDate,
    Donors.full_name
  `;

  // The page and the totals are separate queries: totals as window functions over a grouped
  // join made MySQL sort and aggregate every charge before taking the page.
  const fromWhere = `
        FROM Vipps_agreement_charges as VC
        INNER JOIN Vipps_agreements as VA
            ON VA.ID = VC.agreementID
        INNER JOIN Donors
            ON Donors.ID = VA.donorID
        WHERE
            ${where.length !== 0 ? where.join(" AND ") : "1"}`;

  const [[charges], [statistics]] = await Promise.all([
    DAO.query<VippsChargeRow[]>(
      // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- filter values go through sqlString.escape, the sort column comes from the jsDBmapping allowlist
      `
        SELECT ${columns}
        ${fromWhere}
        ORDER BY ${sortColumn} ${sortDirection}, VC.chargeID ${sortDirection}
        LIMIT ? OFFSET ?
        `,
      [limit, offset],
    ),
    DAO.query<{ full_count: number; full_sum: string; full_avg: string }[]>(
      // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- filter values go through sqlString.escape, the sort column comes from the jsDBmapping allowlist
      `
        SELECT
          count(*) AS full_count,
          sum(amountNOK) AS full_sum,
          avg(amountNOK) AS full_avg
        ${fromWhere}
        `,
    ),
  ]);

  const numCharges = charges.length > 0 ? statistics[0]["full_count"] : 0;
  const sumCharges = charges.length > 0 ? statistics[0]["full_sum"] : "0";
  const avgCharge = charges.length > 0 ? statistics[0]["full_avg"] : "0";

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
      // Rows keep the totals as columns, as when they were window functions (REST shape)
      rows: charges.map((charge) => ({
        ...charge,
        full_count: numCharges,
        full_sum: sumCharges,
        full_avg: avgCharge,
      })),
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
 * @return {string | false} agreementId
 */
async function getAgreementIdByUrlCode(agreementUrlCode): Promise<string | false> {
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
  let [res] = await DAO.query<VippsAgreementReport[]>(`
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
async function getAgreementSumHistogram(): Promise<VippsSumHistogramBucket[]> {
  let [results] = await DAO.query<VippsSumHistogramBucket[]>(`
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
async function getChargeSumHistogram(): Promise<VippsSumHistogramBucket[]> {
  let [results] = await DAO.query<VippsSumHistogramBucket[]>(`
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
  precedence,
}) {
  try {
    const [result] = await DAO.query(
      `
            INSERT INTO Vipps_matching_rules
                (SalesLocation, Message, PeriodFrom, PeriodTo, ResolveKID, precedence)
            VALUES
                (?,?,?,?,?,?)`,
      [
        salesLocation,
        typeof message === "string" && message.length > 0 ? message : null,
        periodFrom,
        periodTo,
        resolveKID,
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
 * Replaces the fields of a Vipps matching rule
 * @returns false if there is no rule with the id
 */
async function updateMatchingRule(
  id: number,
  rule: {
    salesLocation: string | null;
    message: string | null;
    periodFrom: string;
    periodTo: string;
    resolveKID: string;
    precedence: number | null;
  },
): Promise<boolean> {
  const [res] = await DAO.query<ResultSetHeader>(
    `UPDATE Vipps_matching_rules
     SET SalesLocation = ?, Message = ?, PeriodFrom = ?, PeriodTo = ?, ResolveKID = ?, precedence = ?
     WHERE ID = ?`,
    [
      rule.salesLocation,
      // Same normalisation as addMatchingRule
      typeof rule.message === "string" && rule.message.length > 0 ? rule.message : null,
      rule.periodFrom,
      rule.periodTo,
      rule.resolveKID,
      rule.precedence,
      id,
    ],
  );
  // affectedRows counts matched rows (mysql2 sets FOUND_ROWS), so an unchanged rule is found too
  return res.affectedRows > 0;
}

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
    console.error("Failed to update order transaction history for orderId %s", orderId, ex);
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
    console.error("Error deleting matching rule with ID %s:", id, error);
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
  getPaymentsByAgreementId,
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
  updateMatchingRule,
};
