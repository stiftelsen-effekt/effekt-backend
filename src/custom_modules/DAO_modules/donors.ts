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
            
            INNER JOIN Combining_table 
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
 * Gets all donor ID's with only one tax unit
 * @return {Array<{number, number}>} Array of all donor ID and tax unit pairs
 */
async function getIDsWithOneTaxUnit() {
  let [res] = await DAO.query(
    `
    select Donor_ID, ID from Tax_unit where
    Donor_ID in 
      (select DonorID from (
      SELECT TU.Donor_ID as DonorID, count(TU.ID) as TaxUnitCount, count(DN.ID) as DonationsCount FROM Tax_unit as TU
      inner join Donors as D on D.ID = TU.Donor_ID
      inner join Donations as DN on DN.Donor_ID = D.ID
      group by TU.Donor_ID) as Data
    where TaxUnitCount = 1 and DonationsCount > 0)
    `,
  );

  if (res.length === 0) return false;
  else return res;
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
async function update(donorID, name, newsletter, trash?: boolean) {
  let isTrash = trash;
  if (typeof trash === "undefined") isTrash = (await getByID(donorID)).trash;

  let [res] = await DAO.query(
    `UPDATE Donors SET full_name = ?, newsletter = ?, trash = ? where ID = ?`,
    [name, newsletter, isTrash, donorID],
  );

  if (res.affectedRows === 1) {
    return true;
  }
  return false;
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
  getIDsWithOneTaxUnit,
  getIDByAgreementCode,
  search,
  add,
  updateNewsletter,
  updateName,
  update,
  deleteById,
};
