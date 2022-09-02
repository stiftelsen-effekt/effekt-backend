import { DAO } from "../DAO";

const sqlString = require("sqlstring");

//region Get
/**
 * Gets all AG donations by KID
 * @param {string} KID KID number
 * @returns {Array<Donation>} Array of Donation objects
 */
async function getDonationsByKID(KID) {
  try {
    var [getDonationsByKIDQuery] = await DAO.query(
      `
          SELECT *, D.ID, payment_name FROM Donations as D
              INNER JOIN Payment as P on D.Payment_ID = P.ID
              WHERE KID_fordeling = ? AND Payment_ID = 7`,
      [KID]
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
  } catch (ex) {
    throw ex;
  }
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
  try {
    var res = await DAO.execute(
      `INSERT INTO Avtalegiro_agreements (
            KID,
            amount,
            payment_date, 
            notice
            ) VALUES (?,?,?,?)`,
      [KID, amount, paymentDate, notice]
    );

    return res.insertId;
  } catch (ex) {
    throw ex;
  }
}

async function updateNotification(KID, notice) {
  try {
    let res = await DAO.query(
      `UPDATE Avtalegiro_agreements SET notice = ? where KID = ?`,
      [notice, KID]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function updateAmount(KID, amount) {
  try {
    await DAO.query(
      `UPDATE Avtalegiro_agreements SET amount = ? where KID = ?`,
      [amount, KID]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function updatePaymentDate(KID, paymentDate) {
  try {
    if (paymentDate >= 0 && paymentDate <= 28) {
      await DAO.query(
        `UPDATE Avtalegiro_agreements SET payment_date = ? where KID = ?`,
        [paymentDate, KID]
      );
    } else {
      return false;
    }

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function replaceDistribution(
  replacementKID: string,
  originalKID: string,
  split,
  donorId,
  metaOwnerID,
  standardDistribution: boolean = false
) {
  try {
    if (replacementKID.length !== 15 || originalKID.length !== 15) {
      return false;
    }

    const taxUnit = await DAO.tax.getByKID(originalKID);

    // Replaces original KID with a new replacement KID
    await DAO.query(
      `
            UPDATE Combining_table
            SET KID = ?
            WHERE KID = ?
        `,
      [replacementKID, originalKID]
    );

    // Updates donations with the old distributions to use the replacement KID (preserves donation history)
    await DAO.query(
      `
            UPDATE Donations
            SET KID_fordeling = ?
            WHERE KID_fordeling = ?
        `,
      [replacementKID, originalKID]
    );

    // Add new distribution using the original KID
    await DAO.distributions.add(
      split,
      originalKID,
      donorId,
      taxUnit.id,
      standardDistribution,
      metaOwnerID
    );

    // Links the replacement KID to the original AvtaleGiro KID
    await DAO.query(
      `
            INSERT INTO AvtaleGiro_replaced_distributions(Replacement_KID, Original_AvtaleGiro_KID)
            VALUES (?, ?)
        `,
      [replacementKID, originalKID]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function setActive(KID, active) {
  try {
    let res = await DAO.query(
      `UPDATE Avtalegiro_agreements SET active = ? where KID = ?`,
      [active, KID]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function isActive(KID) {
  try {
    let [res] = await DAO.query(
      `SELECT active FROM Avtalegiro_agreements active where KID = ?`,
      [KID]
    );

    if (res[0].active == 1) return true;
    else return false;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Updates the cancellation date of a AvtaleGiro agreement
 * @param {string} KID
 * @param {Date} date
 * @return {boolean} Success
 */
async function cancelAgreement(KID) {
  const today = new Date();
  //YYYY-MM-DD format
  const mysqlDate = today.toISOString().slice(0, 19).replace("T", " ");

  try {
    DAO.query(
      `
            UPDATE Avtalegiro_agreements
            SET cancelled = ?, active = 0
            WHERE KID = ?
        `,
      [mysqlDate, KID]
    );

    return true;
  } catch (ex) {
    return false;
  }
}

async function remove(KID) {
  try {
    var result = await DAO.query(
      `DELETE FROM Avtalegiro_agreements WHERE KID = ?`,
      [KID]
    );

    if (result[0].affectedRows > 0) return true;
    else return false;
  } catch (ex) {
    throw ex;
  }
}

async function exists(KID) {
  try {
    var [res] = await DAO.query(
      "SELECT * FROM Avtalegiro_agreements WHERE KID = ?",
      [KID]
    );

    if (res.length > 0) return true;
    else return false;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Fetches all agreements with sorting and filtering
 * @param {column: string, desc: boolean} sort Sort object
 * @param {string | number | Date} page Used for pagination
 * @param {number=10} limit Agreement count limit per page, defaults to 10
 * @param {object} filter Filtering object
 * @return {[AvtaleGiro]} Array of AvtaleGiro agreements
 */
async function getAgreements(sort, page, limit, filter) {
  const sortColumn = jsDBmapping.find((map) => map[0] === sort.id)[1];
  const sortDirection = sort.desc ? "DESC" : "ASC";
  const offset = page * limit;

  let where = [];
  if (filter) {
    if (filter.amount) {
      if (filter.amount.from)
        where.push(`amount >= ${sqlString.escape(filter.amount.from * 100)} `);
      if (filter.amount.to)
        where.push(`amount <= ${sqlString.escape(filter.amount.to * 100)} `);
    }

    if (filter.KID)
      where.push(
        ` CAST(CT.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `
      );
    if (filter.donor)
      where.push(
        ` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `
      );
    if (filter.statuses.length > 0)
      where.push(
        ` AG.active IN (${filter.statuses
          .map((ID) => sqlString.escape(ID))
          .join(",")}) `
      );
  }

  const [agreements] = await DAO.query(
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
        INNER JOIN Combining_table as CT
            ON AG.KID = CT.KID
        INNER JOIN Donors 
            ON CT.Donor_ID = Donors.ID
        WHERE
            ${where.length !== 0 ? where.join(" AND ") : "1"}

        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
        `,
    [limit, offset]
  );

  const [counter] = await DAO.query(`
        SELECT COUNT(*) as count FROM Avtalegiro_agreements
    `);

  if (agreements.length === 0) return false;
  else
    return {
      pages: Math.ceil(counter[0].count / limit),
      rows: agreements,
    };
}

/**
 * Fetches a single AvtaleGiro agreement
 * @param {string} id AvtaleGiro ID
 * @return {AvtaleGiro} AvtaleGiro agreement
 */
async function getAgreement(id) {
  const result = await DAO.query(
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
        INNER JOIN Combining_table as CT
            ON AG.KID = CT.KID
        INNER JOIN Donors 
            ON CT.Donor_ID = Donors.ID
        WHERE AG.ID = ?
        `,
    [id]
  );

  if (result.length === 0) return false;

  const avtaleGiro = result[0][0];

  let split = await DAO.distributions.getSplitByKID(avtaleGiro.KID);

  avtaleGiro.distribution = split.map((split) => ({
    abbriv: split.abbriv,
    share: split.percentage_share,
  }));

  return avtaleGiro;
}

async function getByDonorId(donorId) {
  try {
    let [agreements] = await DAO.query(
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
            
            INNER JOIN Combining_table as CT
                ON AG.KID = CT.KID
            
            INNER JOIN Donors 
                ON CT.Donor_ID = Donors.ID
            
            WHERE Donors.ID = ?`,
      [donorId]
    );

    return agreements;
  } catch (ex) {
    throw ex;
  }
}

async function getByKID(KID) {
  try {
    let [agreement] = await DAO.query(
      `
            SELECT 
                payment_date,
                amount, 
                KID
            FROM Avtalegiro_agreements 
            WHERE KID = ?`,
      [KID]
    );

    if (agreement.length > 0) {
      return {
        payment_date: agreement[0].payment_date,
        amount: agreement[0].amount,
        KID: agreement[0].KID,
      };
    } else {
      return null;
    }
  } catch (ex) {
    throw ex;
  }
}

/**
 * Fetches key statistics of active agreements
 * @return {Object}
 */
async function getAgreementReport() {
  let [res] = await DAO.query(`
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
  try {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let dayOfMonth = date.getDate();

    let [res] = await DAO.query(
      "call get_avtalegiro_agreement_missing_donations_by_date(?,?,?)",
      [year, month, dayOfMonth]
    );

    return res[0];
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets all agreements we expected a donation for for a given date
 * @param {Date} date
 */
async function getExpectedDonationsForDate(date) {
  try {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let dayOfMonth = date.getDate();

    let [res] = await DAO.query(
      "call get_avtalegiro_agreement_expected_donations_by_date(?,?,?)",
      [year, month, dayOfMonth]
    );

    return res[0];
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets all donations we have recieved for agreements for a given date
 * @param {Date} date
 */
async function getRecievedDonationsForDate(date) {
  try {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let dayOfMonth = date.getDate();

    let [res] = await DAO.query(
      "call get_avtalegiro_agreement_recieved_donations_by_date(?,?,?)",
      [year, month, dayOfMonth]
    );

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
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets a histogram of all agreements by agreement sum
 * Creates buckets with 100 NOK spacing
 * Skips empty buckets
 * @returns {Array<Object>} Returns an array of buckets with items in bucket, bucket start value (ends at value +100), and bar height (logarithmic scale, ln)
 */
async function getAgreementSumHistogram() {
  try {
    let [results] = await DAO.query(`
            SELECT 
                floor(amount/500)*500/100 	AS bucket, 
                count(*) 						AS items,
                ROUND(100*LN(COUNT(*)))         AS bar
            FROM Avtalegiro_agreements
            GROUP BY 1
            ORDER BY 1;
        `);

    return results;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Returns all agreements with a given payment date
 * @param {Date} date
 * @returns {Array<AvtalegiroAgreement>}
 */
async function getByPaymentDate(dayInMonth) {
  try {
    let [agreements] = await DAO.query(
      `SELECT    
            payment_date,
            amount, 
            notice,
            KID
            
            FROM Avtalegiro_agreements 

            WHERE payment_date = ? AND active = 1`,
      [dayInMonth]
    );

    return agreements.map((agreement) => ({
      payment_date: agreement.payment_date,
      notice: agreement.notice,
      amount: agreement.amount,
      KID: agreement.KID,
    }));
  } catch (ex) {
    throw ex;
  }
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
  try {
    let [rows] = await DAO.query(
      `call EffektDonasjonDB.get_avtalegiro_validation()`
    );

    return rows[0];
  } catch (ex) {
    throw ex;
  }
}

/**
 * Adds a new shipment row to db
 * @param {Number} numClaims The number of claims in that shipment
 * @returns {Number} The shipment nr.
 */
async function addShipment(numClaims) {
  try {
    let [result] = await DAO.query(
      `INSERT INTO
            Avtalegiro_shipment
            
            (num_claims) VALUES (?)`,
      [numClaims]
    );

    return result.insertId;
  } catch (ex) {
    throw ex;
  }
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

  addShipment,
};
