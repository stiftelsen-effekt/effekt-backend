import { Donors } from "@prisma/client";
import { Donor } from "../../schemas/types";
import { DAO } from "../DAO";
import * as sqlString from "sqlstring";
import { RequestLocale } from "../../middleware/locale";

//region Get

interface DonorFilters {
  donorId: number | null;
  name?: string;
  email?: string;
  query?: string; // For fulltext search over name and email
  newsletter?: boolean; // Filter by newsletter subscription status
  registeredDate?: { from?: Date; to?: Date };
  donationsDateRange?: { from?: Date; to?: Date };
  lastDonationDate?: { from?: Date; to?: Date };
  donationsCount?: { from?: number; to?: number };
  donationsSum?: { from?: number; to?: number };
  referralTypeIDs?: Array<number>; // List of Referral_types.ID
  recipientOrgIDs?: Array<number>; // List of Organizations.ID
}

interface DonorRow {
  id: number;
  name: string | null;
  email: string;
  registered: Date;
  lastDonation: Date | null;
  donationsCount: number;
  donationsSum: number;
  newsletter: boolean;
}

interface DonorStatistics {
  totalDonors: number;
  totalDonationSum: number;
  totalDonationCount: number;
}

// Mapping for sort fields from JS name to DB column/alias
const jsToDbDonorMapping: Array<[string, string]> = [
  ["id", "FD.ID"],
  ["name", "FD.full_name"],
  ["email", "FD.email"],
  ["registeredDate", "FD.date_registered"],
  ["lastDonationDate", "FD.last_donation_date"],
  ["donationsCount", "FD.donations_count"],
  ["donationsSum", "FD.donations_sum"],
];

async function getAll(
  sort: {
    id: string; // Corresponds to keys in jsToDbDonorMapping
    desc: boolean;
  } | null = {
    id: "id",
    desc: true, // Default to descending order
  },
  page: number,
  limit: number = 10,
  filter: DonorFilters | null = null,
  locale: RequestLocale, // Include if needed for any donor-specific localized data
): Promise<{
  rows: Array<DonorRow>;
  statistics: DonorStatistics;
  pages: number;
}> {
  if (!sort) {
    throw new Error("No sort provided for getAllDonors");
  }

  const sortColumnEntry = jsToDbDonorMapping.find((map) => map[0] === sort.id);
  if (!sortColumnEntry) {
    throw new Error(`Invalid sort column: ${sort.id}`);
  }
  const sortColumn = sortColumnEntry[1];

  let whereClauses: string[] = [];
  let joins: string[] = [];
  let donationDateFilterSqlForCTE = ""; // For filtering donations within the CTE
  let donationDateFilterSqlForSubqueries = ""; // For filtering donations within subqueries

  if (filter?.donationsDateRange) {
    const from = filter.donationsDateRange.from;
    const to = filter.donationsDateRange.to;
    let cteConditions: string[] = [];
    let subqueryConditions: string[] = [];

    if (from) {
      cteConditions.push(`Dons.timestamp_confirmed >= ${sqlString.escape(from)}`);
      subqueryConditions.push(`D_rec.timestamp_confirmed >= ${sqlString.escape(from)}`); // Assuming D_rec alias in subqueries
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1); // Make it inclusive of the whole 'to' day
      const toDateStr = sqlString.escape(toDate);
      cteConditions.push(`Dons.timestamp_confirmed < ${toDateStr}`);
      subqueryConditions.push(`D_rec.timestamp_confirmed < ${toDateStr}`);
    }
    if (cteConditions.length > 0) {
      donationDateFilterSqlForCTE = `AND ${cteConditions.join(" AND ")}`;
    }
    if (subqueryConditions.length > 0) {
      donationDateFilterSqlForSubqueries = `AND ${subqueryConditions.join(" AND ")}`;
    }
  }

  const donorAggregatesCTE = `
    DonorAggregates AS (
      SELECT
        Donors.ID as donor_id_agg,
        MAX(Dons.timestamp_confirmed) as last_donation_date,
        COUNT(DISTINCT Dons.ID) as donations_count,
        COALESCE(SUM(Dons.sum_confirmed), 0) as donations_sum
      FROM Donors
      LEFT JOIN Donations Dons ON Donors.ID = Dons.Donor_ID ${donationDateFilterSqlForCTE} -- Applied here
      GROUP BY Donors.ID
    )
  `;
  joins.push(`LEFT JOIN DonorAggregates Aggregates ON Donors.ID = Aggregates.donor_id_agg`);

  if (filter) {
    if (filter.donorId !== null) {
      whereClauses.push(`Donors.ID = ${sqlString.escape(filter.donorId)}`);
    }

    if (filter.name && filter.name.length > 0) {
      whereClauses.push(`Donors.full_name LIKE ${sqlString.escape(`%${filter.name}%`)}`);
    }

    if (filter.email && filter.email.length > 0) {
      whereClauses.push(`Donors.email LIKE ${sqlString.escape(`%${filter.email}%`)}`);
    }

    // Fulltext search query (matches both name and email)
    if (filter.query && filter.query.length > 0) {
      // Remove @ from query at all locations
      const matchSanitized = filter.query.replace(/@/g, " ");
      if (filter.query.match("^[0-9]+$")) {
        whereClauses.push(`Donors.ID = ${sqlString.escape(matchSanitized)}`);
      } else {
        whereClauses.push(
          `MATCH (Donors.full_name, Donors.email) AGAINST (${sqlString.escape(
            matchSanitized,
          )} IN BOOLEAN MODE)`,
        );
      }
    }

    if (filter.newsletter !== undefined) {
      whereClauses.push(`Donors.newsletter = ${filter.newsletter ? 1 : 0}`);
    }

    if (filter.registeredDate) {
      if (filter.registeredDate.from) {
        whereClauses.push(
          `Donors.date_registered >= ${sqlString.escape(filter.registeredDate.from)}`,
        );
      }
      if (filter.registeredDate.to) {
        const toDate = new Date(filter.registeredDate.to);
        toDate.setDate(toDate.getDate() + 1);
        whereClauses.push(`Donors.date_registered < ${sqlString.escape(toDate)}`);
      }
    }

    if (filter.lastDonationDate) {
      if (filter.lastDonationDate.from) {
        whereClauses.push(
          `Aggregates.last_donation_date >= ${sqlString.escape(filter.lastDonationDate.from)}`,
        );
      }
      if (filter.lastDonationDate.to) {
        const toDate = new Date(filter.lastDonationDate.to);
        toDate.setDate(toDate.getDate() + 1);
        whereClauses.push(`Aggregates.last_donation_date < ${sqlString.escape(toDate)}`);
      }
    }

    if (filter.donationsCount) {
      if (filter.donationsCount.from) {
        whereClauses.push(
          `Aggregates.donations_count >= ${sqlString.escape(filter.donationsCount.from)}`,
        );
      }
      if (filter.donationsCount.to) {
        whereClauses.push(
          `Aggregates.donations_count <= ${sqlString.escape(filter.donationsCount.to)}`,
        );
      }
    }

    if (filter.donationsSum) {
      if (filter.donationsSum.from) {
        whereClauses.push(
          `Aggregates.donations_sum >= ${sqlString.escape(filter.donationsSum.from)}`,
        );
      }
      if (filter.donationsSum.to) {
        whereClauses.push(
          `Aggregates.donations_sum <= ${sqlString.escape(filter.donationsSum.to)}`,
        );
      }
    }

    // Donor referral (a list of integers, matching any is fine for inclusion)
    if (filter.referralTypeIDs) {
      if (filter.referralTypeIDs.length === 0) {
        // No donor can match an empty set of referral IDs if the filter is meant to be inclusive
        return {
          rows: [],
          statistics: { totalDonors: 0, totalDonationCount: 0, totalDonationSum: 0 },
          pages: 0,
        };
      }
      joins.push(`LEFT JOIN Referral_records RR ON Donors.ID = RR.DonorID`);
      whereClauses.push(
        `RR.ReferralID IN (${filter.referralTypeIDs.map((id) => sqlString.escape(id)).join(",")})`,
      );
    }

    // Donation recipient (a list of integers, having any donation with a distribution to any of the orgs is fine for inclusion)
    if (filter.recipientOrgIDs) {
      if (filter.recipientOrgIDs.length === 0) {
        // No donor can match an empty set of org IDs if the filter is meant to be inclusive
        return {
          rows: [],
          statistics: { totalDonors: 0, totalDonationCount: 0, totalDonationSum: 0 },
          pages: 0,
        };
      }
      const recipientSubquery = `
        EXISTS (
          SELECT 1
          FROM Donations D_rec
          JOIN Distributions DIST_rec ON D_rec.KID_fordeling = DIST_rec.KID
          JOIN Distribution_cause_areas DCA_rec ON DIST_rec.KID = DCA_rec.Distribution_KID
          JOIN Distribution_cause_area_organizations DCAO_rec ON DCA_rec.ID = DCAO_rec.Distribution_cause_area_ID
          WHERE D_rec.Donor_ID = Donors.ID AND DCAO_rec.Organization_ID IN (${filter.recipientOrgIDs
            .map((id) => sqlString.escape(id))
            .join(",")})
          ${donationDateFilterSqlForSubqueries} -- Applied here
        )
      `;
      whereClauses.push(recipientSubquery);
    }
  }

  const whereStatement =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "WHERE 1";
  const joinStatement = joins.join(" \n ");

  const query = `
    WITH ${donorAggregatesCTE},
    FilteredDonors AS (
      SELECT DISTINCT
        Donors.ID,
        Donors.full_name,
        Donors.email,
        Donors.date_registered,
        Donors.newsletter,
        Aggregates.last_donation_date,
        Aggregates.donations_count,
        Aggregates.donations_sum
      FROM Donors
      ${joinStatement}
      ${whereStatement}
    ),
    TotalCount AS (
      SELECT COUNT(*) as total_donors_count FROM FilteredDonors
      
    ),
    TotalSum AS (
      SELECT 
        SUM(donations_sum) as total_donations_sum,
        SUM(donations_count) as total_donations_count
      FROM FilteredDonors
    )
    SELECT 
      FD.*,
      TC.total_donors_count,
      TS.total_donations_sum,
      TS.total_donations_count
    FROM FilteredDonors FD
    CROSS JOIN TotalCount TC
    CROSS JOIN TotalSum TS
    ORDER BY ${sortColumn} ${sort.desc ? "DESC" : "ASC"}
    LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(page * limit)};
  `;

  const [resultRows]: [any[], any] = await DAO.query(query, []);

  const totalDonors = resultRows.length > 0 ? resultRows[0]["total_donors_count"] : 0;
  const totalDonationSum = resultRows.length > 0 ? resultRows[0]["total_donations_sum"] : 0;
  const totalDonationCount = resultRows.length > 0 ? resultRows[0]["total_donations_count"] : 0;
  const pages = Math.ceil(totalDonors / limit);

  const mappedRows: DonorRow[] = resultRows.map((row) => ({
    id: row.ID,
    name: row.full_name,
    email: row.email,
    registered: row.date_registered,
    lastDonation: row.last_donation_date ? new Date(row.last_donation_date) : null,
    donationsCount: parseInt(row.donations_count, 10) || 0,
    donationsSum: parseFloat(row.donations_sum) || 0.0,
    newsletter: row.newsletter === 1,
  }));

  return {
    rows: mappedRows,
    statistics: {
      totalDonors,
      totalDonationSum,
      totalDonationCount,
    },
    pages,
  };
}

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
  getAll,
  getByID,
  getIDbyEmail,
  getByKID,
  getByFacebookPayment,
  getIDByMatchedNameFB,
  getKIDsWithOneTaxUnit,
  getIDByAgreementCode,
  getNumberOfDonationsByDonorID,
  search,
  add,
  updateNewsletter,
  updateName,
  update,
  mergeDonors,
  deleteById,
};
