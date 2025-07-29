import { DateTime } from "luxon";
import { DAO, SqlResult } from "../DAO";

import sqlString from "sqlstring";
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
async function getDonationsByKID(KID) {
  var [getDonationsByKIDQuery] = await DAO.query(
    `
          SELECT *, D.ID, payment_name FROM Donations as D
              INNER JOIN Payment as P on D.Payment_ID = P.ID
              WHERE KID_fordeling = ? AND Payment_ID = 7`,
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
  try {
    var transaction = await DAO.startTransaction();

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
    if (transaction) await DAO.rollbackTransaction(transaction);
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

async function remove(KID) {
  var result = await DAO.query(`DELETE FROM Avtalegiro_agreements WHERE KID = ?`, [KID]);

  if (result[0].affectedRows > 0) return true;
  else return false;
}

async function exists(KID) {
  var [res] = await DAO.query("SELECT * FROM Avtalegiro_agreements WHERE KID = ?", [KID]);

  if (res.length > 0) return true;
  else return false;
}

interface AvtaleGiroFilters {
  amount?: { from?: number; to?: number };
  KID?: string;
  paymentDate?: { from?: number; to?: number };
  created?: { from?: Date; to?: Date };
  donor?: string;
  statuses?: Array<number>;
}

interface AvtaleGiroRow {
  ID: number;
  active: number;
  KID: string;
  payment_date: number;
  created: Date;
  cancelled: Date | null;
  last_updated: Date;
  notice: string | null;
  full_name: string;
  amount: number;
}

interface AvtaleGiroStatistics {
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
        AG.created,
        AG.cancelled,
        AG.last_updated,
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
async function getAgreement(id: string) {
  const [result] = await DAO.query<Avtalegiro_agreements[]>(
    `
        SELECT DISTINCT
            AG.ID,
            AG.active,
            ROUND(AG.amount / 100, 0) as amount,
            AG.KID,
            AG.payment_date,
            AG.created,
            AG.cancelled,
            AG.last_updated,
            AG.notice,
            Donors.full_name,
            Donors.ID 
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
                AG.created,
                AG.cancelled,
                AG.last_updated,
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

async function getByKID(KID: string): Promise<AvtaleGiroAgreement> {
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

async function getByID(ID: number): Promise<Avtalegiro_agreements> {
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
async function getMissingForDate(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let dayOfMonth = date.getDate();

  let [res] = await DAO.query("call get_avtalegiro_agreement_missing_donations_by_date(?,?,?)", [
    year,
    month,
    dayOfMonth,
  ]);

  return res[0];
}

/**
 * Gets all agreements we expected a donation for for a given date
 * @param {Date} date
 */
async function getExpectedDonationsForDate(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let dayOfMonth = date.getDate();

  let [res] = await DAO.query("call get_avtalegiro_agreement_expected_donations_by_date(?,?,?)", [
    year,
    month,
    dayOfMonth,
  ]);

  return res[0];
}

/**
 * Gets all donations we have recieved for agreements for a given date
 * @param {Date} date
 */
async function getRecievedDonationsForDate(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let dayOfMonth = date.getDate();

  let [res] = await DAO.query("call get_avtalegiro_agreement_recieved_donations_by_date(?,?,?)", [
    year,
    month,
    dayOfMonth,
  ]);

  return res[0].map((donation) => ({
    id: donation.ID,
    kid: donation.KID_fordeling,
    paymentMethod: "AvtaleGiro",
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
async function getAgreementSumHistogram() {
  let [results] = await DAO.query(`
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

  return (agreements as any[]).map(
    (agreement): AvtaleGiroAgreement => ({
      id: agreement.ID,
      paymentDate: agreement.payment_date,
      notice: agreement.notice,
      amount: agreement.amount,
      KID: agreement.KID,
    }),
  );
}

/**
 * Returns an array of Avtalegiro validation values
 * This is used to check if avtalegiro payments were recieved
 * Expected is the expected amount of AvtaleGiro payments
 * Actual is the amount recieved
 * Diff is the difference between the two
 * @returns {Array<{ date: String, expected: number, actual: number, diff: number }>}
 */
async function getValidationTable() {
  let [rows] = await DAO.query(`call get_avtalegiro_validation()`);

  return rows[0];
}

/**
 * Gets all shipments for a given date
 * @param today The date to get shipments for
 * @returns A list of shipments IDs
 */
async function getShipmentIDs(today: DateTime): Promise<number[]> {
  let [rows] = await DAO.query(
    `SELECT ID FROM Avtalegiro_shipment WHERE day(\`generated\`) = ? AND month(\`generated\`) = ? AND year(\`generated\`) = ?`,
    [today.day, today.month, today.year],
  );

  return rows.map((row) => row.ID);
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
  setActive,
  isActive,
  cancelAgreement,
  updateNotification,
  updatePaymentDate,
  updateAmount,
  replaceDistribution,
  remove,
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
  getDonationsByKID,
  getShipmentIDs,
  getAgreementsWithKIDStartingWith,

  addShipment,
};
