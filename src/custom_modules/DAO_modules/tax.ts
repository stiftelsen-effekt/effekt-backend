import { OkPacket, Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { TaxUnit } from "../../schemas/types";

var pool: Pool;

//region Get
/**
 * Gets a tax unit by id
 * @param {number} id The id of the tax unit
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getById(id: number): Promise<TaxUnit | null> {
  try {
    var con = await pool.getConnection();
    const [result] = await con.execute<RowDataPacket[]>(
      `SELECT * FROM Tax_unit where ID = ?`,
      [id]
    );

    con.release();
    if (result.length > 0)
      return {
        id: result[0].ID,
        donorId: result[0].Donor_ID,
        name: result[0].full_name,
        ssn: result[0].ssn,
      };
    else return null;
  } catch (ex) {
    con.release();
    throw ex;
  }
}

/**
 * Gets a tax unit KID
 * @param {number} id The id of the tax unit
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getByKID(KID: string): Promise<TaxUnit | null> {
  try {
    var con = await pool.getConnection();
    const [result] = await con.execute<RowDataPacket[]>(
      `SELECT Tax_unit_ID FROM EffektDonasjonDB_Tax.Combining_table WHERE KID = ?
        GROUP BY Tax_unit_ID;`,
      [KID]
    );

    con.release();
    if (result.length > 0) return result[0].Tax_unit_ID;
    else return null;
  } catch (ex) {
    con.release();
    throw ex;
  }
}

/**
 * Gets a tax unit by donor id and ssn
 * @param {number} donorId The id of a donor
 * @param {string} ssn A social security number
 * @returns {TaxUnit | null} A tax unit if found
 */
async function getByDonorIdAndSsn(
  donorId: number,
  ssn: string
): Promise<TaxUnit | null> {
  try {
    var con = await pool.getConnection();
    const [result] = await con.execute<RowDataPacket[]>(
      `SELECT * FROM Tax_unit where Donor_ID = ? AND ssn = ?`,
      [donorId, ssn]
    );

    con.release();
    if (result.length > 0) {
      const mapped: TaxUnit = {
        id: result[0].ID as number,
        donorId: result[0].Donor_ID as number,
        name: result[0].full_name as string,
        ssn: result[0].ssn as string,
      };
      return mapped;
    } else return null;
  } catch (ex) {
    con.release();
    throw ex;
  }
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
async function addTaxUnit(
  donorId: number,
  ssn: string | null,
  name: string
): Promise<number> {
  try {
    var con = await pool.getConnection();
    const [result] = await con.execute<ResultSetHeader | OkPacket>(
      `INSERT INTO Tax_unit SET Donor_ID = ?, ssn = ?, full_name = ?`,
      [donorId, ssn, name]
    );

    con.release();
    return result.insertId;
  } catch (ex) {
    con.release();
    throw ex;
  }
}
//endregion

//region Delete

//endregion
export const tax = {
  getById,
  getByKID,
  getByDonorIdAndSsn,
  addTaxUnit,

  setup: (dbPool: Pool) => {
    pool = dbPool;
  },
};
