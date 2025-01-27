import { Donors } from "@prisma/client";
import { Donor } from "../../schemas/types";
import { DAO } from "../DAO";

//region Get
/**
 * Gets the ID of a Donor based on their email
 * @param {String} email An email
 * @returns {Number} An ID
 */
async function getIDbyEmail(email): Promise<number | null> {
  var [result] = await DAO.execute(`SELECT ID FROM Donors where email = ?`, [email]);

  if (result.length > 0) return result[0].ID;
  else return null;
}

/**
 * Selects a Donor object from the database with the given ID
 * @param {Number} ID The ID in the database for the donor
 * @returns {Donor | null} A donor object
 */
async function getByID(ID): Promise<Donor | null> {
  var [result] = await DAO.execute(`SELECT * FROM Donors where ID = ? LIMIT 1`, [ID]);

  if (result.length > 0)
    return {
      id: result[0].ID,
      name: result[0].full_name,
      email: result[0].email,
      registered: result[0].date_registered,
      newsletter: result[0].newsletter === 1,
      trash: result[0].trash,
    };
  else return null;
}

/**
 * Gets a donor based on KID
 * @param {Number} KID
 * @returns {Donor | null} A donor Object
 */
async function getByKID(KID) {
  let [dbDonor] = await DAO.query<Donors[]>(
    `SELECT    
            ID,
            email, 
            full_name,
            date_registered
            
            FROM Donors 
            
            INNER JOIN Distributions 
                ON Donor_ID = Donors.ID 
                
            WHERE KID = ? 
            GROUP BY Donors.ID LIMIT 1`,
    [KID],
  );

  if (dbDonor.length > 0) {
    return {
      id: dbDonor[0].ID,
      email: dbDonor[0].email,
      name: dbDonor[0].full_name,
      registered: dbDonor[0].date_registered,
    };
  } else {
    return null;
  }
}

/**
 * Gets a dummy donor by Facebook payment ID
 * @param {String} paymentID Facebook payment ID
 * @returns {Donor}
 */
async function getByFacebookPayment(paymentID) {
  var [result] = await DAO.execute(
    `
        SELECT Donors.ID, email, full_name FROM Donors
        INNER JOIN Donations on Donations.Donor_ID = Donors.ID
        where Donations.PaymentExternal_ID = ?
        and email like "donasjon%@gieffektivt.no"
      `,
    [paymentID],
  );

  return result[0];
}

/**
 * Gets donors based on their Facebook name
 * If multiple donors with same name exists, sort by the most recent confirmed donation
 * @param {String} name Donor name from Facebook
 * @returns {Array<Donor>}
 */
async function getIDByMatchedNameFB(name) {
  var [result] = await DAO.execute(
    `
          SELECT DR.ID, DR.full_name, DR.email, max(DN.timestamp_confirmed) as most_recent_donation FROM Donors as DR
          inner join Donations as DN on DR.ID = DN.Donor_ID
          where DR.full_name = ?
          and DR.email not like "donasjon%@gieffektivt.no"
          group by DR.ID
          order by most_recent_donation DESC
          `,
    [name],
  );

  // Query above does not find donors that have not donated before
  if (result.length == 0) {
    [result] = await DAO.execute(
      `
              SELECT ID FROM Donors
              where full_name = ?
          `,
      [name],
    );
  }

  if (result.length > 0) return result;
  else return null;
}

/**
 * Gets all the distributions that belong to a donor with only one active tax unit and at least one donation
 * after the provided year
 * @return {Array<{number, number}>} Array of all donor ID and tax unit pairs
 */
async function getKIDsWithOneTaxUnit(year: number) {
  let [res] = await DAO.query<{ KID: string; Donor_ID: number; Tax_unit_ID: number }[]>(
    `
    SELECT 
      DI.KID, 
      DI.Donor_ID, 
      (SELECT ID FROM Tax_unit WHERE Donor_ID = DI.Donor_ID AND Archived IS NULL) as Tax_unit_ID
      -- SUM(sum_confirmed), -- Used for debugging
      -- COUNT(D.ID) -- Used for debugging
      
      FROM Donations as D 
    INNER JOIN Distributions as DI
      ON D.KID_fordeling = DI.KID
      
      WHERE D.Donor_ID IN (
      -- Donors with exactly one (active) unit
      SELECT * FROM (
        SELECT Donor_ID AS unitCount
          FROM Tax_unit as T WHERE
          
          T.archived IS NULL
          
          GROUP BY Donor_ID
          
          HAVING COUNT(*) = 1
      ) ids
    )
      -- Donations where year is less than or equal
      AND YEAR(D.timestamp_confirmed) >= ?
      -- And is missing tax unit
      AND DI.Tax_unit_ID IS NULL
      
      GROUP BY DI.Donor_ID, DI.KID, DI.Tax_unit_ID
    `,
    [year],
  );

  return res;
}

/**
 * Gets donorID by agreement_url_code in Vipps_agreements
 * @property {string} agreementUrlCode
 * @return {number} donorID
 */
async function getIDByAgreementCode(agreementUrlCode) {
  let [res] = await DAO.query(
    `
        SELECT donorID FROM Vipps_agreements
        where agreement_url_code = ?
        `,
    [agreementUrlCode],
  );

  if (res.length === 0) return false;
  else return res[0].donorID;
}

/**
 * Searches for a user with either email or name matching the query
 * @param {object} filter                All query arguments
 * @param {string} filter.query          A query string trying to match agains full name, email and ID
 * @param {object} filter.registered     Object describing date range for user registered
 * @param {string} filter.registered.from Timestamp after which the user was registered
 * @param {string} filter.registered.to   Timestamp before which the user was registered
 * @param {object} filter.totalDonations Object describing value range for total donations
 * @param {number} filter.totalDonations.from Minimum total donation amount
 * @param {number} filter.totalDonations.to   Maximim total donation amount
 * @returns {Array<Donor>} An array of matching donor objects
 */
async function search(filter): Promise<Array<Donor>> {
  var wheres = [];
  var havings = [];
  var params = [];
  if (filter.query !== undefined && filter.query.length >= 1) {
    // Remove @ from query att all locations
    const matchSanitized = filter.query.replace(/@/g, " ");
    params.push(matchSanitized);
    if (filter.query.match("^[0-9]+$")) wheres.push("Donors.ID = ?");
    else wheres.push("MATCH (full_name, email) AGAINST (? IN BOOLEAN MODE)");
  }
  if (filter.registered !== undefined) {
    if (filter.registered.from) {
      params.push(filter.registered.from);
      wheres.push("date_registered >= ?");
    }
    if (filter.registered.to) {
      params.push(filter.registered.to);
      wheres.push("date_registered <= ?");
    }
  }
  if (filter.totalDonations !== undefined) {
    if (filter.totalDonations.from) {
      params.push(filter.totalDonations.from);
      havings.push("total_donations >= ?");
    }
    if (filter.totalDonations.to) {
      params.push(filter.totalDonations.to);
      havings.push("total_donations <= ?");
    }
  }
  var queryString = `
      SELECT Donors.*, SUM(Donations.sum_confirmed) AS total_donations
          FROM Donors LEFT JOIN Donations ON Donors.ID = Donations.Donor_ID`;
  if (wheres.length) queryString += ` WHERE\n` + wheres.join(" AND ");
  queryString += `
    GROUP BY Donors.ID`;
  if (havings.length) queryString += ` HAVING\n` + havings.join(" AND ");
  if (params.length == 0 || (params.length == 1 && filter.query == ""))
    queryString += `
      LIMIT 100`;
  var [result] = await DAO.execute(queryString, params);

  return result.map((donor) => {
    return {
      id: donor.ID,
      name: donor.full_name,
      email: donor.email,
      registered: donor.date_registered,
      total_donations: Number(donor.total_donations),
    };
  });
}

async function getNumberOfDonationsByDonorID(donorID: number) {
  let [res] = await DAO.query<{ count: number }>(
    `SELECT COUNT(*) as count FROM Donations WHERE Donor_ID = ?`,
    [donorID],
  );

  return parseInt(res[0].count);
}

async function getDonorsWithDonationsBeforeYearButNotAfter(year: number) {
  let [res] = await DAO.query<
    {
      ID: number;
      email: string;
      full_name: string;
      first_donation: Date;
      last_donation: Date;
      total_donations: number;
    }[]
  >(
    `WITH donor_stats AS (
        SELECT 
            d.Donor_ID,
            MIN(d.timestamp_confirmed) as first_donation,
            MAX(d.timestamp_confirmed) as last_donation,
            COUNT(*) as total_donations,
            SUM(CASE WHEN YEAR(d.timestamp_confirmed) >= ? THEN 1 ELSE 0 END) as donations_year_or_later
        FROM Donations d
        GROUP BY d.Donor_ID
    )
    SELECT DISTINCT 
        don.ID,
        don.email,
        don.full_name,
        ds.first_donation,
        ds.last_donation,
        ds.total_donations
    FROM Donors don
    JOIN donor_stats ds ON ds.Donor_ID = don.ID
    WHERE 
        don.email NOT LIKE '%@gieffektivt.no'
        AND YEAR(ds.first_donation) < ?
        AND ds.donations_year_or_later = 0
    ORDER BY RAND();`,
    [year, year],
  );

  return res;
}

/**
 * Gets donors who donated for the first time in December of the given year, excluding donors with active agreements
 * @param year
 * @returns
 */
async function getDecemberFirstTimeDonors2024() {
  let [res] = await DAO.query<
    {
      ID: number;
      email: string;
      full_name: string;
      first_donation: Date;
      last_donation: Date;
      total_donations: number;
    }[]
  >(`
    WITH DecemberFirstTimeDonors AS (
      SELECT DISTINCT d.ID as donor_id
      FROM Donors d
      JOIN Distributions dist ON d.ID = dist.Donor_ID
      JOIN Donations don ON dist.KID = don.KID_fordeling
      WHERE MONTH(don.timestamp_confirmed) = 12 
      AND YEAR(don.timestamp_confirmed) = 2024
      AND NOT EXISTS (
          SELECT 1 
          FROM Distributions dist2
          JOIN Donations don2 ON don2.KID_fordeling = dist2.KID
          WHERE dist2.Donor_ID = d.ID
          AND don2.timestamp_confirmed < '2024-12-01'
      )
    ),
    NoAgreements AS (
      SELECT dfd.donor_id
      FROM DecemberFirstTimeDonors dfd
      WHERE NOT EXISTS (
          SELECT 1 FROM Vipps_agreements va 
          WHERE dfd.donor_id = va.donorID 
          AND va.status = 'ACTIVE' 
          AND va.cancellation_date IS NULL
      )
      AND NOT EXISTS (
          SELECT 1 FROM Avtalegiro_agreements aa 
          WHERE aa.KID IN (
              SELECT KID FROM Distributions WHERE Donor_ID = dfd.donor_id
          )
          AND aa.active = 1 
          AND aa.cancelled IS NULL
      )
    ),
    DonorStats AS (
      SELECT 
          d.Donor_ID,
          MIN(d.timestamp_confirmed) as first_donation,
          MAX(d.timestamp_confirmed) as last_donation,
          COUNT(*) as total_donations
      FROM Donations d
      GROUP BY d.Donor_ID
    )
    SELECT DISTINCT
      d.ID,
      d.email,
      d.full_name,
      ds.first_donation,
      ds.last_donation,
      ds.total_donations
    FROM NoAgreements na
    JOIN Donors d ON na.donor_id = d.ID
    JOIN DonorStats ds ON ds.Donor_ID = d.ID
    WHERE d.email NOT LIKE '%@gieffektivt.no'
    ORDER BY ds.first_donation;
  `);

  return res;
}
//endregion

//region Add
/**
 * Adds a new Donor to the database
 * @returns {Number} The ID of the new Donor if successfull
 */
async function add(
  data: Pick<Partial<Donors>, "email" | "full_name" | "newsletter">,
): Promise<Donors["ID"]> {
  var res = await DAO.query(
    `INSERT INTO Donors (
        email,
        full_name, 
        newsletter
    ) VALUES (?,?,?)`,
    [data.email, data.full_name || null, data.newsletter || false],
  );

  return res[0].insertId;
}
//endregion

//region Modify

/**
 * Updates donor and sets new newsletter value
 * @param {number} donorID
 * @param {boolean} newsletter
 * @returns {boolean}
 */
async function updateNewsletter(donorID, newsletter) {
  let res = await DAO.query(`UPDATE Donors SET newsletter = ? where ID = ?`, [newsletter, donorID]);
  return true;
}

/**
 * Update donor and sets new name value
 * @param {number} donorID
 * @param {string} name
 * @returns {boolean}
 */
async function updateName(donorID, name) {
  let res = await DAO.query(`UPDATE Donors SET full_name = ? where ID = ?`, [name, donorID]);
  return true;
}

/**
 * Updates donor information
 * @param {number} donorID
 * @param {string} name
 * @param {boolean} newsletter
 * @returns {boolean}
 */
async function update(donorID, name, email, newsletter, trash?: boolean) {
  let isTrash = trash;
  if (typeof trash === "undefined") isTrash = (await getByID(donorID)).trash;

  let [res] = await DAO.query(
    `UPDATE Donors SET full_name = ?, email = ?, newsletter = ?, trash = ? where ID = ?`,
    [name, email, newsletter, isTrash, donorID],
  );

  if (res.affectedRows === 1) {
    return true;
  }
  return false;
}

async function mergeDonors(originDonorId: number, destinationDonorId: number) {
  await DAO.query(`CALL merge_donors(?, ?)`, [originDonorId, destinationDonorId]);
}
//endregion

//region Delete
/**
 * Deletes donor from database
 * @param {number} donorID
 */
async function deleteById(donorID) {
  await DAO.query(`DELETE FROM Donors WHERE ID = ?`, [donorID]);

  return;
}
//endregion

export const donors = {
  getByID,
  getIDbyEmail,
  getByKID,
  getByFacebookPayment,
  getIDByMatchedNameFB,
  getKIDsWithOneTaxUnit,
  getIDByAgreementCode,
  getNumberOfDonationsByDonorID,
  search,
  getDonorsWithDonationsBeforeYearButNotAfter,
  getDecemberFirstTimeDonors2024,
  add,
  updateNewsletter,
  updateName,
  update,
  mergeDonors,
  deleteById,
};
