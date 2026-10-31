import { DateTime } from "luxon";
import { DAO, SqlResult } from "../DAO";

import sqlString from "sqlstring";
import { AvtaleGiroChargeStatus, CHARGING_STATUSES } from "../avtalegiro/charges";
import { dbClockColumn, instantRangeClauses, type InstantRange } from "../osloDays";
import { OkPacket, ResultSetHeader } from "mysql2/promise";
import { Avtalegiro_agreements } from "@prisma/client";
import { Distribution, DistributionInput } from "../../schemas/types";
import { RequestLocale } from "../../middleware/locale";

export type AvtaleGiroAgreement = {
  id: number;
  KID: string;
  amount: number;
  paymentDate: number;
  notice: boolean;
};

//region Get
/**
 * Gets all AG donations by KID
 * @param {string} KID KID number
 * @returns {Array<Donation>} Array of Donation objects
 */
export type AvtaleGiroDonation = {
  id: number;
  /** Decimal string */
  sum: string;
  /** Decimal string */
  transactionCost: string | null;
  timestamp: Date;
  paymentMethod: string;
  KID: string;
};

async function getDonationsByKID(KID: string): Promise<AvtaleGiroDonation[]> {
  var [getDonationsByKIDQuery] = await DAO.query<
    Array<{
      ID: number;
      sum_confirmed: string;
      transaction_cost: string | null;
      timestamp_confirmed: Date;
      payment_name: string;
      KID_fordeling: string;
    }>
  >(
    `
          SELECT *, D.ID, payment_name FROM Donations as D
              INNER JOIN Payment as P on D.Payment_ID = P.ID
              WHERE KID_fordeling = ? AND Payment_ID = 7`,
    [KID],
  );

  let donations: AvtaleGiroDonation[] = [];

  // The query has no donor columns; the donor/donorId/email keys were always undefined
  // (and so absent from the JSON), so they are left out.
  getDonationsByKIDQuery.forEach((donation) => {
    donations.push({
      id: donation.ID,
      sum: donation.sum_confirmed,
      transactionCost: donation.transaction_cost,
      timestamp: donation.timestamp_confirmed,
      paymentMethod: donation.payment_name,
      KID: donation.KID_fordeling,
    });
  });

  return donations;
}

export type AvtaleGiroAgreementPayments = {
  /**
   * Every KID the agreement's donations have been registered under: the agreement's current KID
   * first, then the KIDs that preserve earlier distributions (AvtaleGiro_replaced_distributions)
   */
  KIDs: string[];
  /** AvtaleGiro donations under any of the KIDs, newest first */
  donations: AvtaleGiroDonation[];
};

/**
 * AvtaleGiro donations of an agreement across distribution changes. replaceDistribution keeps
 * the agreement's KID for the new distribution and moves earlier donations to a replacement KID,
 * linked in AvtaleGiro_replaced_distributions. Because that link's original KID follows
 * Distributions.KID updates (ON UPDATE CASCADE), a later replacement re-points earlier links to
 * the newer replacement KID, so the links form a chain that is followed recursively.
 *
 * Donations moved by a tax unit change (tax.ts, updateKIDBeforeTimestamp) are not linked to the
 * agreement anywhere and are not included.
 * @returns null if there is no agreement with the id
 */
async function getPaymentsByAgreementId(
  agreementId: number,
): Promise<AvtaleGiroAgreementPayments | null> {
  const [kidRows] = await DAO.query<Array<{ KID: string; depth: number }>>(
    `WITH RECURSIVE agreement_kids (KID, depth) AS (
       SELECT CAST(KID AS CHAR(32)) COLLATE utf8mb4_0900_ai_ci, 0
       FROM Avtalegiro_agreements
       WHERE ID = ?
       UNION
       SELECT CAST(R.Replacement_KID AS CHAR(32)) COLLATE utf8mb4_0900_ai_ci, K.depth + 1
       FROM AvtaleGiro_replaced_distributions R
       INNER JOIN agreement_kids K ON R.Original_AvtaleGiro_KID = K.KID
       WHERE K.depth < 100
     )
     SELECT KID, MIN(depth) AS depth FROM agreement_kids GROUP BY KID ORDER BY depth, KID`,
    [agreementId],
  );
  if (kidRows.length === 0) return null;
  const KIDs = kidRows.map((row) => row.KID);

  const [rows] = await DAO.query<
    Array<{
      ID: number;
      sum_confirmed: string;
      transaction_cost: string | null;
      timestamp_confirmed: Date;
      payment_name: string;
      KID_fordeling: string;
    }>
  >(
    `SELECT D.ID, D.sum_confirmed, D.transaction_cost, D.timestamp_confirmed, P.payment_name,
       D.KID_fordeling
     FROM Donations AS D
     INNER JOIN Payment AS P ON D.Payment_ID = P.ID
     WHERE D.KID_fordeling IN (?) AND D.Payment_ID = 7
     ORDER BY D.timestamp_confirmed DESC, D.ID DESC`,
    [KIDs],
  );

  return {
    KIDs,
    donations: rows.map((donation) => ({
      id: donation.ID,
      sum: donation.sum_confirmed,
      transactionCost: donation.transaction_cost,
      timestamp: donation.timestamp_confirmed,
      paymentMethod: donation.payment_name,
      KID: donation.KID_fordeling,
    })),
  };
}

/*
 * Gets all active agreements
 * @return {Array<AvtaleGiro>} Array of AvtaleGiro agreements
 */
async function getActiveAgreements(): Promise<Avtalegiro_agreements[]> {
  let [agreements] = await DAO.query(
    `
            SELECT 
                *
            FROM Avtalegiro_agreements 
            WHERE active = 1`,
  );

  return agreements.map((agreement) => mapDbAgreementToJs(agreement));
}
//endregion

//region Add
/**
 * Adds a new avtalegiroagreement to the database
 * @param {number} KID
 * @param {number} amount
 * @param {Date} paymentDate
 * @param {boolean} notice
 */
async function add(KID, amount, paymentDate, notice) {
  await DAO.execute(
    `INSERT INTO Avtalegiro_agreements (
            KID,
            amount,
            payment_date, 
            notice
            ) VALUES (?,?,?,?)`,
    [KID, amount, paymentDate, notice],
  );
}

/**
 * The agreement rows for a KID as the widget's draft call sees them: how many there are and
 * whether the only one is a draft (not active and never cancelled)
 */
async function getDraftState(KID: string): Promise<{ rows: number; draft: boolean }> {
  const [rows] = await DAO.execute<any[]>(
    `SELECT active, cancelled FROM Avtalegiro_agreements WHERE KID = ?`,
    [KID],
  );
  return {
    rows: rows.length,
    draft: rows.length === 1 && !rows[0].active && rows[0].cancelled == null,
  };
}

/**
 * Adds a draft agreement (with notice) unless the KID already has an agreement row. Two
 * concurrent calls for the same KID cannot both insert: the loser inserts nothing or fails with
 * a lock conflict.
 * @returns Whether the draft was added
 */
async function addDraftIfNone(KID: string, amount: number, paymentDate: number): Promise<boolean> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `INSERT INTO Avtalegiro_agreements (KID, amount, payment_date, notice)
      SELECT ?, ?, ?, 1 FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM Avtalegiro_agreements WHERE KID = ?)`,
    [KID, amount, paymentDate, KID],
  );
  return result.affectedRows > 0;
}

/**
 * Updates the amount (øre) and payment date of an agreement that is still a draft
 * @returns Whether a draft was updated
 */
async function updateDraft(KID: string, amount: number, paymentDate: number): Promise<boolean> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `UPDATE Avtalegiro_agreements SET amount = ?, payment_date = ?
      WHERE KID = ? AND active = 0 AND cancelled IS NULL`,
    [amount, paymentDate, KID],
  );
  return result.affectedRows > 0;
}

/**
 * Marks that the "agreement registered" email was sent for the KID's agreement, unless it
 * already was
 * @returns True only for the call that marked it, so the email goes out at most once
 */
async function claimRegisteredMail(KID: string): Promise<boolean> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `UPDATE Avtalegiro_agreements SET registered_mail_sent = NOW()
      WHERE KID = ? AND registered_mail_sent IS NULL`,
    [KID],
  );
  return result.affectedRows > 0;
}

async function updateNotification(KID, notice) {
  let res = await DAO.query(`UPDATE Avtalegiro_agreements SET notice = ? where KID = ?`, [
    notice,
    KID,
  ]);

  return true;
}

/**
 * Updates the amount of an AvtaleGiro agreement
 * @param KID
 * @param amount The new amount in ore
 * @returns
 */
async function updateAmount(KID: string, amount: number) {
  await DAO.query(`UPDATE Avtalegiro_agreements SET amount = ? where KID = ?`, [amount, KID]);

  return true;
}

async function updatePaymentDate(KID, paymentDate) {
  if (paymentDate >= 0 && paymentDate <= 28) {
    await DAO.query(`UPDATE Avtalegiro_agreements SET payment_date = ? where KID = ?`, [
      paymentDate,
      KID,
    ]);
  } else {
    return false;
  }

  return true;
}

/**
 * When updating an AvtaleGiro distribution, we need to do some extra work to preserve donation history
 * This is because the KID is used as the active identifier for AvtaleGiro agreements, and we can't change it
 * Therefore, when the user wishes to update their AvtaleGiro distribution, we need to preserve the old distribution
 * We do this by preserving the old distribution with a new KID number, and then adding the new distribution with the original KID number
 * We also need to update all donations with the old distribution to use the new KID number
 * @param originalDistribution
 * @param newKid This is a KID used to store the historic distribution. Not the new distribution, as that one carries the original KID
 * @param newDistributionInput
 * @param metaOwnerID
 * @returns
 */
async function replaceDistribution(
  originalDistribution: Distribution,
  newKid: string,
  newDistributionInput: DistributionInput,
  metaOwnerID?: number,
) {
  if (!metaOwnerID) {
    metaOwnerID = await DAO.meta.getDefaultOwnerID();
  }

  const transaction = await DAO.startTransaction();
  try {
    // Replaces original KID with a new KID to preserve donation history
    await transaction.query(`UPDATE Distributions SET KID = ? WHERE KID = ?`, [
      newKid,
      originalDistribution.kid,
    ]);

    // Updates donations with the old distributions to use the replacement KID (preserves donation history)
    await transaction.query(`UPDATE Donations SET KID_fordeling = ? WHERE KID_fordeling = ?`, [
      newKid,
      originalDistribution.kid,
    ]);

    // Add new distribution using the original KID
    await DAO.distributions.add(
      {
        ...newDistributionInput,
        kid: originalDistribution.kid,
      },
      metaOwnerID,
      transaction,
    );

    // Links the replacement KID to the original AvtaleGiro KID
    await transaction.query(
      `
              INSERT INTO AvtaleGiro_replaced_distributions(Replacement_KID, Original_AvtaleGiro_KID)
              VALUES (?, ?)
          `,
      [newKid, originalDistribution.kid],
    );

    // Reset the AvtaleGiro agreement to use the new distribution KID
    // We need to do this because of a foreign key constraint that updates the agreement
    // KID when we edit the distribution
    await transaction.query(`UPDATE Avtalegiro_agreements SET KID = ? WHERE KID = ?`, [
      originalDistribution.kid,
      newKid,
    ]);

    await DAO.commitTransaction(transaction);
  } catch (ex) {
    await DAO.rollbackTransaction(transaction);
    throw ex;
  }

  return true;
}

async function setActive(KID, active) {
  const transaction = await DAO.startTransaction();
  try {
    let [res] = await transaction.query<ResultSetHeader | OkPacket>(
      `UPDATE Avtalegiro_agreements SET active = ? WHERE KID = ?`,
      [active, KID],
    );

    if (res.affectedRows === 0) {
      await DAO.rollbackTransaction(transaction);
      return false;
    }

    if (!active) {
      let [res] = await transaction.query<ResultSetHeader | OkPacket>(
        `UPDATE Avtalegiro_agreements SET cancelled = NOW() WHERE KID = ?`,
        [KID],
      );
      if (res.affectedRows === 0) {
        await DAO.rollbackTransaction(transaction);
        return false;
      }
    } else {
      let [res] = await transaction.query<ResultSetHeader | OkPacket>(
        `UPDATE Avtalegiro_agreements SET cancelled = NULL WHERE KID = ?`,
        [KID],
      );
      if (res.affectedRows === 0) {
        await DAO.rollbackTransaction(transaction);
        return false;
      }
    }

    await DAO.commitTransaction(transaction);

    return true;
  } catch (ex) {
    await DAO.rollbackTransaction(transaction);
    throw ex;
  }
}

async function isActive(KID) {
  let [res] = await DAO.query(`SELECT active FROM Avtalegiro_agreements active where KID = ?`, [
    KID,
  ]);

  if (res[0].active == 1) return true;
  else return false;
}

/**
 * Updates the cancellation date of a AvtaleGiro agreement
 * @param {string} KID
 * @param {Date} date
 * @return {boolean} Success
 */
async function cancelAgreement(KID) {
  DAO.query(
    `
            UPDATE Avtalegiro_agreements
            SET cancelled = NOW(), active = 0
            WHERE KID = ?
        `,
    [KID],
  );

  return true;
}

async function exists(KID) {
  var [res] = await DAO.query("SELECT * FROM Avtalegiro_agreements WHERE KID = ?", [KID]);

  if (res.length > 0) return true;
  else return false;
}

export interface AvtaleGiroFilters {
  amount?: { from?: number; to?: number };
  KID?: string;
  paymentDate?: { from?: number; to?: number };
  created?: { from?: Date; to?: Date };
  /** Half-open instant range (osloDays.ts), used by tRPC; `created` is filled by MySQL */
  createdRange?: InstantRange;
  donor?: string;
  statuses?: Array<number>;
}

export interface AvtaleGiroRow {
  ID: number;
  active: 0 | 1;
  KID: string;
  payment_date: number;
  created: Date;
  cancelled: Date | null;
  last_updated: Date;
  notice: 0 | 1;
  full_name: string;
  /** NOK */
  amount: number;
}

export interface AvtaleGiroStatistics {
  numAgreements: number;
  sumAgreements: number;
  avgAgreement: number;
}

async function getAgreements(
  sort: {
    id: string; // Corresponds to keys in jsToDbAvtaleGiroMapping
    desc: boolean;
  } | null = {
    id: "id",
    desc: true, // Default to descending order
  },
  page: number,
  limit: number = 10,
  filter: AvtaleGiroFilters | null = null,
  locale: RequestLocale, // Include if needed for any agreement-specific localized data
): Promise<{
  rows: Array<AvtaleGiroRow>;
  statistics: AvtaleGiroStatistics;
  pages: number;
}> {
  if (!sort) {
    throw new Error("No sort provided for getAgreements");
  }

  const sortColumnEntry = jsDBmapping.find((map) => map[0] === sort.id);
  if (!sortColumnEntry) {
    throw new Error(`Invalid sort column: ${sort.id}`);
  }
  const sortColumn = sortColumnEntry[1];

  let whereClauses: string[] = [];
  let joins: string[] = [
    `INNER JOIN Distributions D ON AG.KID = D.KID`,
    `INNER JOIN Donors ON D.Donor_ID = Donors.ID`,
  ];

  if (filter) {
    if (filter.amount) {
      if (filter.amount.from !== undefined) {
        whereClauses.push(`AG.amount >= ${sqlString.escape(filter.amount.from * 100)}`);
      }
      if (filter.amount.to !== undefined) {
        whereClauses.push(`AG.amount <= ${sqlString.escape(filter.amount.to * 100)}`);
      }
    }

    if (filter.paymentDate) {
      if (filter.paymentDate.from !== undefined) {
        whereClauses.push(`AG.payment_date >= ${sqlString.escape(filter.paymentDate.from)}`);
      }
      if (filter.paymentDate.to !== undefined) {
        whereClauses.push(`AG.payment_date <= ${sqlString.escape(filter.paymentDate.to)}`);
      }
    }

    if (filter.created) {
      if (filter.created.from) {
        whereClauses.push(`AG.created >= ${sqlString.escape(filter.created.from)}`);
      }
      if (filter.created.to) {
        const toDate = new Date(filter.created.to);
        toDate.setDate(toDate.getDate() + 1); // Make it inclusive of the whole 'to' day
        whereClauses.push(`AG.created < ${sqlString.escape(toDate)}`);
      }
    }
    whereClauses.push(...instantRangeClauses("AG.created", filter.createdRange, "db"));

    if (filter.KID && filter.KID.length > 0) {
      whereClauses.push(`CAST(AG.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)}`);
    }

    if (filter.donor && filter.donor.length > 0) {
      whereClauses.push(`Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}`);
    }

    if (filter.statuses) {
      if (filter.statuses.length === 0) {
        // No agreement can match an empty set of statuses if the filter is meant to be inclusive
        return {
          rows: [],
          statistics: { numAgreements: 0, sumAgreements: 0, avgAgreement: 0 },
          pages: 0,
        };
      }
      whereClauses.push(
        `AG.active IN (${filter.statuses.map((id) => sqlString.escape(id)).join(",")})`,
      );
    }
  }

  const whereStatement =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "WHERE 1";
  const joinStatement = joins.join(" \n ");

  const query = `
    WITH FilteredAgreements AS (
      SELECT DISTINCT
        AG.ID,
        AG.active,
        AG.KID,
        AG.payment_date,
        ${dbClockColumn("AG.created")},
        AG.cancelled,
        ${dbClockColumn("AG.last_updated")},
        AG.notice,
        Donors.full_name as full_name,
        AG.amount
      FROM Avtalegiro_agreements AG
      ${joinStatement}
      ${whereStatement}
    ),
    TotalCount AS (
      SELECT COUNT(*) as total_agreements_count FROM FilteredAgreements
    ),
    TotalStats AS (
      SELECT 
        SUM(amount) as total_agreements_sum,
        AVG(amount) as avg_agreement_amount
      FROM FilteredAgreements
    )
    SELECT 
      FA.*,
      TC.total_agreements_count,
      TS.total_agreements_sum,
      TS.avg_agreement_amount
    FROM FilteredAgreements FA
    CROSS JOIN TotalCount TC
    CROSS JOIN TotalStats TS
    ORDER BY ${sortColumn} ${sort.desc ? "DESC" : "ASC"}
    LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(page * limit)};
  `;

  // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- filter values go through sqlString.escape, the sort column comes from the jsDBmapping allowlist
  const [resultRows]: [any[], any] = await DAO.query(query, []);

  const numAgreements = resultRows.length > 0 ? resultRows[0]["total_agreements_count"] : 0;
  const sumAgreements =
    resultRows.length > 0 ? Math.round((resultRows[0]["total_agreements_sum"] || 0) / 100) : 0;
  const avgAgreement =
    resultRows.length > 0 ? Math.round((resultRows[0]["avg_agreement_amount"] || 0) / 100) : 0;
  const pages = Math.ceil(numAgreements / limit);

  const mappedRows: AvtaleGiroRow[] = resultRows.map((row) => ({
    ID: row.ID,
    full_name: row.full_name,
    active: row.active,
    amount: Math.round(row.amount / 100), // Convert from øre to kroner
    payment_date: row.payment_date,
    KID: row.KID,
    created: new Date(row.created),
    last_updated: new Date(row.last_updated),
    cancelled: row.cancelled ? new Date(row.cancelled) : null,
    notice: row.notice,
  }));

  return {
    rows: mappedRows,
    statistics: {
      numAgreements,
      sumAgreements,
      avgAgreement,
    },
    pages,
  };
}

/**
 * Fetches a single AvtaleGiro agreement
 * @param {string} id AvtaleGiro ID
 * @return {AvtaleGiro} AvtaleGiro agreement
 */
export type AvtaleGiroAgreementDetails = {
  ID: number;
  active: 0 | 1;
  /** Whole NOK, as a decimal string */
  amount: string;
  KID: string;
  payment_date: number;
  created: Date | null;
  cancelled: Date | null;
  last_updated: Date | null;
  notice: 0 | 1;
  full_name: string;
  donorId: number;
};

async function getAgreement(id: string | number): Promise<AvtaleGiroAgreementDetails | false> {
  const [result] = await DAO.query<AvtaleGiroAgreementDetails[]>(
    `
        SELECT DISTINCT
            AG.ID,
            AG.active,
            ROUND(AG.amount / 100, 0) as amount,
            AG.KID,
            AG.payment_date,
            ${dbClockColumn("AG.created")},
            AG.cancelled,
            ${dbClockColumn("AG.last_updated")},
            AG.notice,
            Donors.full_name,
            Donors.ID as donorId
        FROM Avtalegiro_agreements as AG
        INNER JOIN Distributions as D
            ON AG.KID = D.KID
        INNER JOIN Donors 
            ON D.Donor_ID = Donors.ID
        WHERE AG.ID = ?
        `,
    [id],
  );

  if (result.length === 0) return false;

  const avtaleGiro = result[0];

  return avtaleGiro;
}

async function getByDonorId(donorId) {
  let [agreements] = await DAO.query<(Avtalegiro_agreements & { full_name: string })[]>(
    `
            SELECT DISTINCT
                AG.ID,
                AG.active,
                ROUND(AG.amount / 100, 0) as amount,
                AG.KID,
                AG.payment_date,
                ${dbClockColumn("AG.created")},
                AG.cancelled,
                ${dbClockColumn("AG.last_updated")},
                AG.notice,
                Donors.full_name
            FROM Avtalegiro_agreements as AG
            
            INNER JOIN Distributions as D
                ON AG.KID = D.KID
            
            INNER JOIN Donors 
                ON D.Donor_ID = Donors.ID
            
            WHERE Donors.ID = ?`,
    [donorId],
  );

  return agreements;
}

async function getByKID(KID: string): Promise<AvtaleGiroAgreement | null> {
  let [agreement] = await DAO.query(
    `
            SELECT 
                ID,
                payment_date,
                amount, 
                KID,
                notice
            FROM Avtalegiro_agreements 
            WHERE KID = ?`,
    [KID],
  );

  if (agreement.length > 0) {
    return {
      id: agreement[0].ID,
      paymentDate: agreement[0].payment_date,
      amount: agreement[0].amount,
      KID: agreement[0].KID,
      notice: agreement[0].notice,
    };
  } else {
    return null;
  }
}

async function getByID(ID: number): Promise<Avtalegiro_agreements | null> {
  let [agreement] = await DAO.query<Avtalegiro_agreements[]>(
    `
            SELECT 
                *
            FROM Avtalegiro_agreements 
            WHERE ID = ?`,
    [ID],
  );

  if (agreement.length > 0) {
    return mapDbAgreementToJs(agreement[0]);
  } else {
    return null;
  }
}

export type AgreementReport = {
  activeAgreementCount: number;
  averageAgreementSum: number;
  totalAgreementSum: number;
  medianAgreementSum: string;
  draftedThisMonth: number;
  sumDraftedThisMonth: number;
  activatedThisMonth: number;
  sumActivatedThisMonth: number;
  stoppedThisMonth: number;
  sumStoppedThisMonth: number;
};

/**
 * Fetches key statistics of active agreements
 * @return {Object}
 */
async function getAgreementReport() {
  let [res] = await DAO.query<AgreementReport[]>(`
    SELECT 
        count(ID) as activeAgreementCount,
        round(avg(amount)/100, 0) as averageAgreementSum,
        round(sum(amount)/100, 0) as totalAgreementSum,
        round((
            SELECT AVG(subquery.amount) as median_val
                FROM (
                    SELECT AG.amount, @rownum:=@rownum+1 as 'row_number', @total_rows:=@rownum
                    FROM Avtalegiro_agreements as AG, (SELECT @rownum:=0) r
                        WHERE AG.amount is NOT NULL
                        AND AG.active = 1
                    ORDER BY AG.amount
                ) as subquery
            WHERE subquery.row_number IN ( FLOOR((@total_rows+1)/2), FLOOR((@total_rows+2)/2) )
        )/100, 0) as medianAgreementSum,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND year(created) = year(current_timestamp())
            AND active = 0
        ) as draftedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND year(created) = year(current_timestamp())
            AND active = 0
        ) as sumDraftedThisMonth,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND year(created) = year(current_timestamp())
            AND active = 1
        ) as activatedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(created) = month(current_timestamp())
            AND year(created) = year(current_timestamp())
            AND active = 1
        ) as sumActivatedThisMonth,
        (SELECT count(ID) 
            FROM Avtalegiro_agreements 
            WHERE month(cancelled) = month(current_timestamp())
            AND year(cancelled) = year(current_timestamp())
            AND active = 0
        ) as stoppedThisMonth,
        (SELECT round(sum(amount)/100)
            FROM Avtalegiro_agreements 
            WHERE month(cancelled) = month(current_timestamp())
            AND year(cancelled) = year(current_timestamp())
            AND active = 0
        ) as sumStoppedThisMonth
    FROM 
        Avtalegiro_agreements
    WHERE
        active = 1
        `);

  if (res.length === 0) return false;
  else return res[0];
}

/**
 * Gets all agreements that we have not yet recieved a payment for a given date
 * @param {Date} date
 */
export type MissingAvtaleGiroAgreement = {
  ID: number;
  email: string;
  full_name: string;
  /** Whole NOK */
  amount: number;
  KID: string;
  payment_date: number;
  created: Date | null;
  last_updated: Date | null;
  cancelled: Date | null;
  active: 0 | 1;
};

/**
 * Gets all agreements that we have not yet recieved a payment for a given date
 * (inline replacement for get_avtalegiro_agreement_missing_donations_by_date, which still
 * queries the Combining_table dropped in 20230731130928_multiple_cause_areas)
 * @param {Date} date
 */
async function getMissingForDate(date: Date): Promise<MissingAvtaleGiroAgreement[]> {
  const day = DateTime.fromJSDate(date).toISODate();

  const [res] = await DAO.query<MissingAvtaleGiroAgreement[]>(
    `
    SELECT
      AG.ID,
      Donors.email,
      Donors.full_name,
      CAST(ROUND(AG.amount / 100) AS SIGNED) as amount,
      AG.KID,
      AG.payment_date,
      ${dbClockColumn("AG.created")},
      ${dbClockColumn("AG.last_updated")},
      AG.cancelled,
      AG.active
    FROM Avtalegiro_agreements as AG
      INNER JOIN Distributions as D ON D.KID = AG.KID
      INNER JOIN Donors ON Donors.ID = D.Donor_ID
    WHERE
      AG.payment_date = DAY(?)
      # Created six days before payment date
      AND AG.created < DATE_SUB(DATE(?), interval 6 day)
      AND (
        # Is active, or cancelled after the claim was sent
        AG.active = 1
        OR AG.cancelled > DATE_SUB(DATE(?), interval 6 day)
      )
      AND NOT EXISTS (
        SELECT 1 FROM Donations
        WHERE
          Donations.KID_fordeling = AG.KID
          AND Donations.Payment_ID = 7
          AND Donations.timestamp_confirmed >= DATE(?)
          AND Donations.timestamp_confirmed < DATE_ADD(DATE(?), interval 1 month)
      )
      # Not claimed this month on another date, e.g. before the donor moved the payment date.
      # The claims job skips those (see avtalegiro/charges.ts)
      AND NOT EXISTS (
        SELECT 1 FROM Avtalegiro_agreement_charges AS C
        WHERE
          C.KID = AG.KID
          AND C.due_date BETWEEN DATE_FORMAT(DATE(?), '%Y-%m-01') AND LAST_DAY(DATE(?))
          AND C.due_date <> DATE(?)
          AND C.status IN (?)
      )
      # Not cancelled with the claim for this date deleted at MPS
      AND NOT EXISTS (
        SELECT 1 FROM Avtalegiro_agreement_charges AS C
        WHERE C.KID = AG.KID AND C.due_date = DATE(?) AND C.status = ?
      )
    ORDER BY AG.ID
    `,
    [...Array(8).fill(day), CHARGING_STATUSES, day, AvtaleGiroChargeStatus.DELETED],
  );

  return res;
}

export type ExpectedAvtaleGiroAgreement = {
  ID: number;
  KID: string;
  /** øre */
  amount: number;
  payment_date: number;
  notice: 0 | 1;
  active: 0 | 1;
  last_updated: Date | null;
  created: Date | null;
  cancelled: Date | null;
};

/**
 * Gets all agreements we expected a donation for for a given date
 * @param {Date} date
 */
async function getExpectedDonationsForDate(date: Date): Promise<ExpectedAvtaleGiroAgreement[]> {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let dayOfMonth = date.getDate();

  let [res] = await DAO.query<ExpectedAvtaleGiroAgreement[][]>(
    "call get_avtalegiro_agreement_expected_donations_by_date(?,?,?)",
    [year, month, dayOfMonth],
  );

  return res[0];
}

/** An AvtaleGiro claim as sent to Nets */
export type AvtaleGiroClaim = {
  KID: string;
  /** øre */
  amount: number;
};

/**
 * The claims sent to Nets for a due date, read from the claim file (DIRREM) the scheduled
 * AvtaleGiro job stores in Import_logs ("AvtaleGiro", or "AvtaleGiro - Retry" when it was sent
 * again; the latest file wins). Available since June 2021.
 * @param day YYYY-MM-DD
 * @returns null if no claim file for the date was logged
 */
async function getClaimsForDate(day: string): Promise<AvtaleGiroClaim[] | null> {
  const [year, month, date] = day.split("-");
  // First line of a claim: NY21 02 30, transaction number 0000001, due date DDMMYY
  const firstLine = `NY2102300000001${date}${month}${year.slice(2)}`;
  const [rows] = await DAO.query<Array<{ file: string }>>(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(result, '$.file')) AS file
     FROM Import_logs
     WHERE label IN ('AvtaleGiro', 'AvtaleGiro - Retry')
       AND timestamp >= DATE_SUB(?, INTERVAL 40 DAY)
       AND timestamp < DATE_ADD(?, INTERVAL 2 DAY)
       AND JSON_TYPE(JSON_EXTRACT(result, '$.file')) = 'STRING'
       AND JSON_UNQUOTE(JSON_EXTRACT(result, '$.file')) LIKE ?
     ORDER BY timestamp DESC, ID DESC
     LIMIT 1`,
    [day, day, `%${firstLine}%`],
  );
  if (rows.length === 0) return null;
  return parseClaimFile(rows[0].file, firstLine.slice(15));
}

/**
 * Claim lines (record NY210230) of a DIRREM file with the given due date (DDMMYY): amount in
 * øre at 32-49, KID right-aligned at 49-74 (see avtalegiro/filewriterutil.js).
 */
export const parseClaimFile = (file: string, dueDate: string): AvtaleGiroClaim[] =>
  file
    .split(/\r?\n/)
    .filter((line) => line.startsWith("NY210230") && line.substring(15, 21) === dueDate)
    .map((line) => ({
      KID: line.substring(49, 74).trim(),
      amount: parseInt(line.substring(32, 49), 10),
    }))
    .filter((claim) => claim.KID.length > 0 && Number.isFinite(claim.amount));

/**
 * Agreements with the claimed amounts of a past due date, in agreement order. Claims whose
 * KID no longer has an agreement are left out.
 * @returns null if no claim file for the date was logged
 */
async function getClaimedAgreementsForDate(
  day: string,
): Promise<ExpectedAvtaleGiroAgreement[] | null> {
  const claims = await getClaimsForDate(day);
  if (claims === null) return null;
  if (claims.length === 0) return [];
  const [agreements] = await DAO.query<ExpectedAvtaleGiroAgreement[]>(
    `SELECT * FROM Avtalegiro_agreements WHERE KID IN (?) ORDER BY ID`,
    [claims.map((claim) => claim.KID)],
  );
  const amountByKID = new Map(claims.map((claim) => [claim.KID, claim.amount]));
  return agreements.map((agreement) => ({
    ...agreement,
    amount: amountByKID.get(agreement.KID) ?? agreement.amount,
  }));
}

export type ReceivedAvtaleGiroDonation = {
  id: number;
  kid: string;
  paymentMethod: "AvtaleGiro";
  email: string;
  donor: string;
  /** Decimal string */
  sum: string;
  /** Decimal string */
  transactionCost: string | null;
  timestamp: Date;
};

/**
 * Gets all donations we have recieved for agreements for a given date
 * (inline replacement for get_avtalegiro_agreement_recieved_donations_by_date, which still
 * queries the Combining_table dropped in 20230731130928_multiple_cause_areas)
 * @param {Date} date
 */
async function getRecievedDonationsForDate(date: Date): Promise<ReceivedAvtaleGiroDonation[]> {
  const day = DateTime.fromJSDate(date).toISODate();

  const [res] = await DAO.query<
    Array<{
      ID: number;
      email: string;
      full_name: string;
      sum_confirmed: string;
      transaction_cost: string | null;
      KID_fordeling: string;
      timestamp_confirmed: Date;
    }>
  >(
    `
    SELECT
      Donations.ID,
      Donors.email,
      Donors.full_name,
      Donations.sum_confirmed,
      Donations.transaction_cost,
      Donations.KID_fordeling,
      Donations.timestamp_confirmed
    FROM Donations
      INNER JOIN Distributions as D ON D.KID = Donations.KID_fordeling
      INNER JOIN Donors ON Donors.ID = D.Donor_ID
    WHERE
      Donations.KID_fordeling IN (
        SELECT KID
        FROM Avtalegiro_agreements
        WHERE
          payment_date = DAY(?)
          # Created six days before payment date
          AND created < DATE_SUB(DATE(?), interval 6 day)
          AND (
            # Is active, or cancelled after payment date
            active = 1
            OR cancelled > DATE(?)
          )
      )
      AND Donations.Payment_ID = 7
      AND Donations.timestamp_confirmed >= DATE(?)
      AND Donations.timestamp_confirmed < DATE_ADD(DATE(?), interval 1 month)
    ORDER BY Donations.ID
    `,
    [day, day, day, day, day],
  );

  return res.map((donation) => ({
    id: donation.ID,
    kid: donation.KID_fordeling,
    paymentMethod: "AvtaleGiro" as const,
    email: donation.email,
    donor: donation.full_name,
    sum: donation.sum_confirmed,
    transactionCost: donation.transaction_cost,
    timestamp: donation.timestamp_confirmed,
  }));
}

/**
 * Gets a histogram of all agreements by agreement sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getAgreementSumHistogram(): Promise<
  Array<{ bucket: number; items: number; bar: number }>
> {
  let [results] = await DAO.query<Array<{ bucket: number; items: number; bar: number }>>(`
            SELECT 
                floor((amount/100)/500)*500 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Avtalegiro_agreements
            GROUP BY 1
            ORDER BY 1;
        `);

  return results;
}

/**
 * Returns all agreements with a given payment date
 * @param {Date} date
 * @returns {Array<AvtalegiroAgreement>}
 */
async function getByPaymentDate(dayInMonth): Promise<Array<AvtaleGiroAgreement>> {
  let [agreements] = await DAO.query(
    `SELECT
            ID,
            payment_date,
            amount, 
            notice,
            KID
            
            FROM Avtalegiro_agreements 

            WHERE payment_date = ? AND active = 1`,
    [dayInMonth],
  );

  return (agreements as any[]).map((agreement): AvtaleGiroAgreement => ({
    id: agreement.ID,
    paymentDate: agreement.payment_date,
    notice: agreement.notice,
    amount: agreement.amount,
    KID: agreement.KID,
  }));
}

/**
 * Returns an array of Avtalegiro validation values
 * This is used to check if avtalegiro payments were recieved
 * Expected is the expected amount of AvtaleGiro payments
 * Actual is the amount recieved
 * Diff is the difference between the two
 * @returns {Array<{ date: String, expected: number, actual: number, diff: number }>}
 */
export type AvtaleGiroValidationRow = {
  /** Day of month */
  date: number;
  /** Whole NOK, as decimal strings */
  expected: string;
  actual: string;
  diff: string;
};

async function getValidationTable(): Promise<AvtaleGiroValidationRow[]> {
  let [rows] = await DAO.query<AvtaleGiroValidationRow[][]>(`call get_avtalegiro_validation()`);

  return rows[0];
}

async function getAgreementsWithKIDStartingWith(prefix: string): Promise<AvtaleGiroAgreement[]> {
  let [rows] = await DAO.query(
    `SELECT ID, KID, amount, payment_date, notice FROM Avtalegiro_agreements WHERE KID LIKE ?`,
    [`${prefix}%`],
  );

  console.log("Matching prefix");
  console.log(rows);

  return rows.map((row) => ({
    id: row.ID,
    KID: row.KID,
    amount: row.amount,
    paymentDate: row.payment_date,
    notice: row.notice,
  }));
}

/**
 * Adds a new shipment row to db
 * @param {Number} numClaims The number of claims in that shipment
 * @returns {Number} The shipment nr.
 */
async function addShipment(numClaims) {
  let [result] = await DAO.query(
    `INSERT INTO
            Avtalegiro_shipment
            
            (num_claims) VALUES (?)`,
    [numClaims],
  );

  return result.insertId;
}

const mapDbAgreementToJs = (
  dbAgreement: SqlResult<Avtalegiro_agreements>,
): Avtalegiro_agreements => {
  return {
    ...dbAgreement,
    notice: dbAgreement.notice === 1,
    active: dbAgreement.active === 1,
    created: dbAgreement.created,
    last_updated: dbAgreement.last_updated,
    cancelled: dbAgreement.cancelled,
  };
};

const jsDBmapping: Array<[string, string]> = [
  ["id", "FA.ID"],
  ["active", "FA.active"],
  ["kid", "FA.KID"],
  ["paymentDate", "FA.payment_date"],
  ["created", "FA.created"],
  ["cancelled", "FA.cancelled"],
  ["lastUpdated", "FA.last_updated"],
  ["notice", "FA.notice"],
  ["full_name", "FA.full_name"],
  ["amount", "FA.amount"],
];

export const avtalegiroagreements = {
  add,
  getDraftState,
  addDraftIfNone,
  updateDraft,
  claimRegisteredMail,
  setActive,
  isActive,
  cancelAgreement,
  updateNotification,
  updatePaymentDate,
  updateAmount,
  replaceDistribution,
  getPaymentsByAgreementId,
  exists,
  getActiveAgreements,
  getByID,
  getByKID,
  getByDonorId,
  getAgreementSumHistogram,
  getAgreements,
  getAgreement,
  getAgreementReport,
  getByPaymentDate,
  getValidationTable,
  getMissingForDate,
  getRecievedDonationsForDate,
  getExpectedDonationsForDate,
  getClaimedAgreementsForDate,
  getDonationsByKID,
  getAgreementsWithKIDStartingWith,

  addShipment,
};
