import { OkPacket, Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { TaxUnit } from "../../schemas/types";
import { DAO } from "../DAO";
import { donationHelpers } from "../donationHelpers";
import { getTaxUnitsWithDeductions } from "../taxdeductions";
import { Distributions, Tax_unit } from "@prisma/client";
import { RequestLocale } from "../../middleware/locale";

//region Get
/**
 * Gets a tax unit by id
 * @param {number} id The id of the tax unit
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getById(id: number): Promise<TaxUnit | null> {
  const [result] = await DAO.execute<RowDataPacket[]>(`SELECT * FROM Tax_unit where ID = ?`, [id]);

  if (result.length > 0)
    return {
      id: result[0].ID,
      donorId: result[0].Donor_ID,
      name: result[0].full_name,
      ssn: result[0].ssn,
      archived: result[0].archived,
    };
  else return null;
}

/**
 * Gets all tax units associated with donor
 * @param {number} donorId The if of the donor
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getByDonorId(donorId: number, locale: RequestLocale): Promise<Array<TaxUnit>> {
  const [taxUnits] = await DAO.query<Tax_unit[]>(
    `SELECT *          
          FROM Tax_unit as T
        
          WHERE T.Donor_ID = ?`,
    [donorId],
  );

  // Get all donations for the donor with attached tax unit id
  const [donations] = await DAO.query<{ year: number; sum: string; taxUnitId: number }[]>(
    `SELECT YEAR(Donations.timestamp_confirmed) as year, Donations.sum_confirmed as sum, Tax_unit.ID as taxUnitId
      FROM Donations
      INNER JOIN Distributions ON Distributions.KID = Donations.KID_fordeling
      INNER JOIN Tax_unit ON Tax_unit.ID = Distributions.Tax_unit_ID
      WHERE Tax_unit.Donor_ID = ?`,
    [donorId],
  );

  const calculatedUnits = getTaxUnitsWithDeductions({
    taxUnits,
    donations: donations.map((d) => ({ ...d, sum: parseFloat(d.sum) })),
    locale,
  });

  return calculatedUnits;
}

/**
 * Gets active tax unit IDs by donor ID
 * @param {number} donorId The if of the donor
 * @returns {{id: number}[]} A tax unit if found
 */
async function getActiveTaxUnitIdsByDonorId(donorId: number): Promise<{ id: number }[]> {
  const [result] = await DAO.execute<{ id: number }[]>(
    `SELECT ID as id FROM Tax_unit WHERE Donor_ID = ? AND archived IS NULL`,
    [donorId],
  );

  return result;
}

/**
 * Gets a tax unit KID
 * @param {number} id The id of the tax unit
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getByKID(KID: string, locale: RequestLocale): Promise<TaxUnit | null> {
  const [idResult] = await DAO.query<Pick<Distributions, "Tax_unit_ID">[]>(
    `SELECT Tax_unit_ID FROM Distributions WHERE KID = ?;`,
    [KID],
  );

  // The KID might not exist, or the KID might not be associated with a tax unit
  if (idResult.length === 0 || !idResult[0].Tax_unit_ID) return null;

  const [taxUnits] = await DAO.query<Tax_unit[]>(`SELECT * FROM Tax_unit where ID = ?`, [
    idResult[0].Tax_unit_ID,
  ]);

  if (taxUnits.length === 0) return null;
  if (taxUnits.length > 1) throw new Error("Multiple tax units with same ID");

  const donor = await DAO.donors.getByKID(KID);

  if (!donor) return null;

  // Get all donations for the donor with attached tax unit id
  const [donations] = await DAO.query<{ year: number; sum: string; taxUnitId: number }[]>(
    `SELECT YEAR(Donations.timestamp_confirmed) as year, Donations.sum_confirmed as sum, Tax_unit.ID as taxUnitId
      FROM Donations
      INNER JOIN Distributions ON Distributions.KID = Donations.KID_fordeling
      INNER JOIN Tax_unit ON Tax_unit.ID = Distributions.Tax_unit_ID
      WHERE Tax_unit.Donor_ID = ?`,
    [donor.id],
  );

  const calculatedUnits = getTaxUnitsWithDeductions({
    taxUnits,
    donations: donations.map((d) => ({ ...d, sum: parseFloat(d.sum) })),
    locale,
  });

  return calculatedUnits[0];
}

/**
 * Gets a tax unit by donor id and ssn
 * @param {number} donorId The id of a donor
 * @param {string} ssn A social security number
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getByDonorIdAndSsn(donorId: number, ssn: string): Promise<TaxUnit | null> {
  const [result] = await DAO.execute<RowDataPacket[]>(
    `SELECT * FROM Tax_unit where Donor_ID = ? AND ssn = ?`,
    [donorId, ssn],
  );

  if (result.length > 0) {
    const mapped: TaxUnit = {
      id: result[0].ID as number,
      donorId: result[0].Donor_ID as number,
      name: result[0].full_name as string,
      ssn: result[0].ssn as string,
      archived: result[0].archived as string,
    };
    return mapped;
  } else return null;
}

export type EmailTaxUnitReport = {
  email: string;
  name: string;
  units: [{ name: string; sum: number }];
};
async function getReportsWithUserOnProfilePage(): Promise<EmailTaxUnitReport[]> {
  const [result] = await DAO.execute<RowDataPacket[]>(`
    SELECT TaxUnitName, \`SUM(sum_confirmed)\` as DonationsSum, DonorUserEmail, DonorUserName FROM v_Tax_deductions
      WHERE (SELECT COUNT(*) FROM Auth0_users WHERE Email = DonorUserEmail) = 1
  `);

  const mapped: EmailTaxUnitReport[] = [];
  for (const row of result) {
    const existing = mapped.find((m) => m.email === row.DonorUserEmail);

    if (existing) {
      existing.units.push({ name: row.TaxUnitName, sum: row.DonationsSum });
    } else {
      mapped.push({
        email: row.DonorUserEmail,
        name: row.DonorUserName,
        units: [{ name: row.TaxUnitName, sum: Math.round(row.DonationsSum) }],
      });
    }
  }

  return mapped;
}

async function getReportsWithoutUserOnProfilePage(): Promise<EmailTaxUnitReport[]> {
  const [result] = await DAO.execute<RowDataPacket[]>(`
    SELECT TaxUnitName, \`SUM(sum_confirmed)\` as DonationsSum, DonorUserEmail, DonorUserName FROM v_Tax_deductions
        WHERE (SELECT COUNT(*) FROM Auth0_users WHERE Email = DonorUserEmail) = 0
  `);

  const mapped: EmailTaxUnitReport[] = [];
  for (const row of result) {
    const existing = mapped.find((m) => m.email === row.DonorUserEmail);

    if (existing) {
      existing.units.push({ name: row.TaxUnitName, sum: row.DonationsSum });
    } else {
      mapped.push({
        email: row.DonorUserEmail,
        name: row.DonorUserName,
        units: [{ name: row.TaxUnitName, sum: Math.round(row.DonationsSum) }],
      });
    }
  }

  return mapped;
}
//endregion

//region Modify
/**
 * Adds a new tax unit for a donor
 * @param {number} donorId The id of the donor the tax unit is associated with
 * @param {String | null} ssn The social security number for the tax unit. Could be a personal number or an organization number.
 * @param {String} name The name of the tax unit. Could for example be Ola Normann, or Norske Bedrift AS
 * @returns {Number} The ID of the created tax unit
 */
async function addTaxUnit(donorId: number, ssn: string | null, name: string): Promise<number> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `INSERT INTO Tax_unit SET Donor_ID = ?, ssn = ?, full_name = ?`,
    [donorId, ssn, name],
  );

  return result.insertId;
}

/**
 *  Updates a tax unit
 * @param {number} id The id of the tax unit
 * @param {TaxUnit} taxUnit The new tax unit
 * @returns {number} The number of rows affected
 */
async function updateTaxUnit(id: number, taxUnit: TaxUnit): Promise<number> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `UPDATE Tax_unit SET full_name = ?, ssn = ? WHERE ID = ?`,
    [taxUnit.name, taxUnit.ssn, id],
  );

  return result.affectedRows;
}

/**
 *  Updates all KID numbers missing a tax unit for a single donor
 * @param {number} taxUnitID The id of the tax unit
 * @param {TaxUnit} donorID The donor ID
 * @returns {number} The number of rows affected
 */
async function updateKIDsMissingTaxUnit(taxUnitID: number, donorID: number): Promise<number> {
  const [result] = await DAO.execute<ResultSetHeader | OkPacket>(
    `
      UPDATE Distributions
      SET Tax_unit_ID = ?
      WHERE Tax_unit_ID IS NULL
      AND Donor_ID = ?
    `,
    [taxUnitID, donorID],
  );

  return result.affectedRows;
}
//endregion

//region Delete

type TransferKIDBinding = {
  origKID: string;
  origStandard: 1 | null;
  origDistKey: string;
  destKID: string | null;
  destStandard: 1 | null;
  destDistKey: string | null;
};

/**
 * Deletes a tax unit with an optional tax unit id to transfer donations in the current year to
 * @param {number} id The id of the tax unit
 * @param {number} donorId The id of the donor
 * @param {number?} transferId The id of the tax unit to transfer donations to
 * @returns {number} The number of rows affected
 */
async function deleteById(id: number, donorId: number, transferId?: number): Promise<number> {
  throw new Error("Not implemented");
  /*
  try {
    var transaction = await DAO.startTransaction();

    if (typeof transferId !== "undefined" && transferId !== null) {
      // Fetch donations in the current year for the tax unit to delete
      const [donations] = await transaction.execute<RowDataPacket[]>(
        `SELECT * FROM Donations 
          WHERE KID_fordeling IN (SELECT KID FROM Combining_table WHERE Tax_unit_ID = ? GROUP BY KID)
          AND YEAR(timestamp_confirmed) = YEAR(CURDATE())
          `,
        [id],
      );
      console.log(donations);

      const kidsToTransfer = new Set();
      donations.forEach((donation) => {
        kidsToTransfer.add(donation.KID_fordeling);
      });
      console.log(Array.from(kidsToTransfer));

      // Find matching distribution KIDs for the tax unit to transfer to
      // Concatinates distributions and groups by KID for both origin
      // and destination tax unit, then joins on the concatenated dist string

      // Where destination KID is null, there is no existing KID and the distribution
      // should be added to the destination tax unit
      // Where destination KID is not null, all donations for the current year with
      // the given KID may simply be transfered to the destination tax unit KID
      // which matches the origin KID distribution
      const [transferKIDs] = await transaction.execute(
        `
        SELECT * FROM 
        (
          SELECT 	
            C.KID as origKID, 
                  C.Standard_split as origStandard,
            CONCAT(IF(C.Standard_split, "s;", "c;"), GROUP_CONCAT(CONCAT(OrgID, "|", percentage_share)
              ORDER BY OrgID ASC
              SEPARATOR ';')) as origDistKey 
      
            FROM Combining_table as C
              INNER JOIN Distribution as D 
              ON C.Distribution_ID = D.ID
              
              WHERE C.KID IN (${"?,".repeat(kidsToTransfer.size).slice(0, -1)})
              
              GROUP BY KID, origStandard
        ) as Origin
                
        LEFT JOIN (
          SELECT CI.KID as destKID, 
            CI.Standard_split as destStandard,
            CONCAT(IF(CI.Standard_split, "s;", "c;"), GROUP_CONCAT(CONCAT(OrgID, "|", percentage_share)
              ORDER BY OrgID ASC
              SEPARATOR ';')) as destDistKey 
            
            FROM Combining_table as CI
              INNER JOIN Distribution as DI
              ON CI.Distribution_ID = DI.ID
              
              WHERE CI.Tax_unit_ID = ?
              
              GROUP BY KID, destStandard
        ) as Destination
        
        ON Origin.origDistKey = Destination.destDistKey
      `,
        [...Array.from(kidsToTransfer), transferId],
      );
      console.log(transferKIDs);

      for (let i = 0; i < (transferKIDs as TransferKIDBinding[]).length; i++) {
        const transferKID = transferKIDs[i] as TransferKIDBinding;
        let destinationKID = transferKID.destKID;
        if (destinationKID === null) {
          // No matching KID found, so we need to create a new one
          const split = transferKID.origDistKey.split(";").reduce((acc, cur) => {
            if (cur === "s" || cur === "c") return acc;

            const [orgId, percentage] = cur.split("|");
            acc.push({ id: orgId, share: percentage });
            return acc;
          }, [] as { id: string; share: string }[]);
          const KID = await donationHelpers.createKID(15, donorId);

          const res = await DAO.distributions.add(
            split,
            KID,
            donorId,
            transferId,
            transferKID.origStandard === 1,
          );

          if (!res) {
            throw new Error("Failed to add distribution");
          }

          destinationKID = KID;
        }

        // Updates all donations from the current year with the origin KID to the destionation KID
        await transaction.execute(
          `
          UPDATE Donations SET KID_fordeling = ? WHERE KID_fordeling = ? AND YEAR(timestamp_confirmed) = YEAR(CURDATE())
        `,
          [destinationKID, transferKID.origKID],
        );
      }
    }

    // Remove original tax unit name and ssn, and set archived field to current timestamp
    const [result] = await transaction.execute<ResultSetHeader>(
      `UPDATE Tax_unit SET full_name = 'Archived', ssn = 'Archived', archived = CURRENT_TIMESTAMP WHERE ID = ?`,
      [id],
    );

    DAO.commitTransaction(transaction);

    return result.affectedRows;
  } catch (ex) {
    try {
      await DAO.rollbackTransaction(transaction);
    } catch (ex) {
      console.error("FATAL ERROR: Could not rollback transaction");
      throw ex;
    }

    throw ex;
  }
  */
}

//endregion
export const tax = {
  getById,
  getByDonorId,
  getByKID,
  getByDonorIdAndSsn,
  getActiveTaxUnitIdsByDonorId,
  getReportsWithUserOnProfilePage,
  getReportsWithoutUserOnProfilePage,
  updateKIDsMissingTaxUnit,
  addTaxUnit,
  updateTaxUnit,
  deleteById,
};
