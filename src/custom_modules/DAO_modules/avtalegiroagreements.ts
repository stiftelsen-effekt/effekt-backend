import { DateTime } from "luxon";
import { DAO } from "../DAO";

import sqlString from "sqlstring";
import { OkPacket, ResultSetHeader } from "mysql2/promise";
import { Avtalegiro_agreements } from "@prisma/client";
import { Distribution, DistributionInput } from "../../schemas/types";

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

async function updateAmount(KID, amount) {
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

/**
 * Fetches all agreements with sorting and filtering
 * @param {column: string, desc: boolean} sort Sort object
 * @param {string | number | Date} page Used for pagination
 * @param {number=10} limit Agreement count limit per page, defaults to 10
 * @param {object} filter Filtering object
 * @return {[AvtaleGiro]} Array of AvtaleGiro agreements
 */
async function getAgreements(
  sort,
  page,
  limit,
  filter,
): Promise<{
  pages: number;
  rows: Avtalegiro_agreements[];
  statistics: {
    numAgreements: number;
    sumAgreements: number;
    avgAgreement: number;
  };
}> {
  const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1];
  const sortDirection = sort.desc ? "DESC" : "ASC";
  const offset = page * limit;

  let where = [];
  if (filter) {
    if (filter.amount) {
      if (filter.amount.from)
        where.push(`amount >= ${sqlString.escape(filter.amount.from * 100)} `);
      if (filter.amount.to) where.push(`amount <= ${sqlString.escape(filter.amount.to * 100)} `);
    }
    if (filter.paymentDate) {
      if (filter.paymentDate.from !== undefined)
        where.push(`AG.payment_date >= ${sqlString.escape(filter.paymentDate.from)} `);
      if (filter.paymentDate.to !== undefined)
        where.push(`AG.payment_date <= ${sqlString.escape(filter.paymentDate.to)} `);
    }
    if (filter.created) {
      if (filter.created.from)
        where.push(`AG.created >= ${sqlString.escape(filter.created.from)} `);
      if (filter.created.to) where.push(`AG.created <= ${sqlString.escape(filter.created.to)} `);
    }

    if (filter.KID) where.push(` CAST(D.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
    if (filter.donor)
      where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `);
    if (filter.statuses) {
      if (filter.statuses.length === 0) {
        return {
          pages: 0,
          rows: [],
          statistics: {
            numAgreements: 0,
            sumAgreements: 0,
            avgAgreement: 0,
          },
        };
      }
      where.push(` AG.active IN (${filter.statuses.map((ID) => sqlString.escape(ID)).join(",")}) `);
    }
  }

  const columns = `
    AG.ID,
    AG.active,
    AG.KID,
    AG.payment_date,
    AG.created,
    AG.cancelled,
    AG.last_updated,
    AG.notice,
    Donors.full_name 
  `;

  const query = `
    SELECT
      count(*) OVER() AS full_count,
      ROUND(sum(AG.amount) OVER() / 100, 0) AS full_sum,
      ROUND(avg(AG.amount) OVER() / 100, 0) AS full_avg,
      ROUND(AG.amount / 100, 0) as amount,
      ${columns}
    FROM Avtalegiro_agreements as AG
    INNER JOIN Distributions as D
        ON AG.KID = D.KID
    INNER JOIN Donors 
        ON D.Donor_ID = Donors.ID
    WHERE
        ${where.length !== 0 ? where.join(" AND ") : "1"}

    GROUP BY
      ${columns}

    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ? OFFSET ?
  `;

  const [agreements] = await DAO.query(query, [limit, offset]);

  const numAgreements = agreements.length > 0 ? agreements[0].full_count : 0;
  const sumAgreements = agreements.length > 0 ? agreements[0].full_sum : 0;
  const avgAgreement = agreements.length > 0 ? agreements[0].full_avg : 0;

  return {
    pages: Math.ceil(numAgreements / limit),
    rows: agreements,
    statistics: {
      numAgreements,
      sumAgreements,
      avgAgreement,
    },
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
  let [agreements] = await DAO.query<Avtalegiro_agreements & { full_name: string }>(
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

/**
 * Fetches key statistics of active agreements
 * @return {Object}
 */
async function getAgreementReport() {
  let [res] = await DAO.query<
    {
      activeAgreementCount: number;
      averageAgreementSum: number;
      totalAgreementSum: number;
      medianAgreementSum: number;
      draftedThisMonth: number;
      sumDraftedThisMonth: number;
      activatedThisMonth: number;
      sumActivatedThisMonth: number;
      stoppedThisMonth: number;
      sumStoppedThisMonth: number;
    }[]
  >(`
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

const jsDBmapping = [
  ["id", "ID"],
  ["full_name", "full_name"],
  ["kid", "KID"],
  ["amount", "amount"],
  ["paymentDate", "payment_date"],
  ["notice", "notice"],
  ["active", "active"],
  ["created", "created"],
  ["lastUpdated", "last_updated"],
  ["sum", "sum_confirmed"],
  ["confirmed", "timestamp_confirmed"],
  ["kidFordeling", "KID_fordeling"],
  ["cancelled", "cancelled"],
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
