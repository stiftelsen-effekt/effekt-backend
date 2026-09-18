import { fnr } from "@navikt/fnrvalidator";
import { RequestLocale } from "../middleware/locale";
import { TaxUnit } from "../schemas/types";
import * as auth0 from "./auth0";
import { DAO } from "./DAO";
import { isValidPersonnummer } from "./ku65/ku65_lib";
import { connectDonationsForFirstTaxUnit } from "./tax";

/**
 * Donor and tax unit operations shared by the REST routes (src/routes/donors.ts)
 * and the tRPC donors router. Expected failures are thrown as DonorServiceError so
 * each transport can map them to its own status codes.
 */

export type DonorServiceErrorKind = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT";

const httpStatusByKind: Record<DonorServiceErrorKind, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export class DonorServiceError extends Error {
  constructor(public readonly kind: DonorServiceErrorKind, message: string) {
    super(message);
    this.name = "DonorServiceError";
  }

  get httpStatus(): number {
    return httpStatusByKind[this.kind];
  }
}

/**
 * Creates a donor, refusing emails that already belong to a donor.
 * @returns The new donor's id
 */
export async function createDonor(email: string, name: string): Promise<number> {
  const existing = await DAO.donors.getIDbyEmail(email);
  if (existing !== null) {
    throw new DonorServiceError("CONFLICT", "Email already exists");
  }
  return DAO.donors.add({ email, full_name: name });
}

/**
 * Merges the origin donor into the destination donor. merge_donors moves the origin
 * donor's rows over and then deletes the origin donor. Before that, Auth0 users whose
 * user_metadata points at the origin donor are re-pointed to the destination, so a
 * Min side login keeps working after the merge.
 */
export async function mergeDonors(originId: number, destinationId: number): Promise<void> {
  /**
   * With the same id on both sides merge_donors is a plain delete, and everything
   * hanging off the donor goes with it via cascade.
   */
  if (originId === destinationId) {
    throw new DonorServiceError("BAD_REQUEST", "Cannot merge a donor into itself");
  }

  const donorOrigin = await DAO.donors.getByID(originId);
  const donorDestination = await DAO.donors.getByID(destinationId);

  if (!donorOrigin || !donorDestination) {
    throw new DonorServiceError("NOT_FOUND", "Donor not found");
  }

  // The origin donor is deleted by merge_donors, so its email is read first.
  // Auth0 failures are logged and must not block the merge.
  try {
    await auth0.repointAuth0DonorIdOnMerge(originId, destinationId, donorOrigin.email);
  } catch (error) {
    console.error("Failed to re-point Auth0 donor ID on merge:", error);
  }

  await DAO.donors.mergeDonors(originId, destinationId);
}

/**
 * Adds a tax unit to a donor. If it is the donor's first tax unit (archived ones
 * count), the donor's distributions without a tax unit are connected to it.
 * Validation of the ssn is up to the caller.
 * @returns The created tax unit, or null if it could not be read back
 */
export async function createTaxUnitForDonor(
  donorId: number,
  ssn: string,
  name: string,
  locale: RequestLocale,
): Promise<TaxUnit | null> {
  const taxUnitId = await DAO.tax.addTaxUnit(donorId, ssn, name);
  const taxUnit = await DAO.tax.getById(taxUnitId);

  if (!taxUnit) return null;

  const taxUnits = await DAO.tax.getByDonorId(donorId, locale);
  if (taxUnits.length === 1) {
    // Update the donor's KID numbers missing a tax unit
    await connectDonationsForFirstTaxUnit(donorId, taxUnit.id);
  }

  return taxUnit;
}

/**
 * Archives a tax unit belonging to the donor, optionally transferring the current
 * year's donations to another of the donor's tax units.
 * @returns The number of rows affected
 */
export async function archiveTaxUnit(
  donorId: number,
  taxUnitId: number,
  transferId?: number,
): Promise<number> {
  const donor = await DAO.donors.getByID(donorId);
  if (!donor) {
    throw new DonorServiceError("NOT_FOUND", "No donor found with ID " + donorId);
  }

  const taxUnit = await DAO.tax.getById(taxUnitId);
  if (!taxUnit || taxUnit.donorId !== donor.id) {
    throw new DonorServiceError("NOT_FOUND", "No tax unit found with ID " + taxUnitId);
  }

  return DAO.tax.deleteById(taxUnit.id, donor.id, transferId);
}

/**
 * Norwegian organisasjonsnummer: 9 digits, mod 11 check digit.
 */
function isValidNorwegianOrgNr(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(value[i]), 0);
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  return check !== 10 && check === Number(value[8]);
}

/**
 * Validates a tax unit ssn for the given locale.
 * - NO: 11 digit fødselsnummer (validated with @navikt/fnrvalidator) or 9 digit
 *   organisasjonsnummer (mod 11).
 * - SV: 12 digit personnummer (YYYYMMDDNNNN) or organisationsnummer (16NNNNNNNNNN),
 *   optionally with a dash before the last four digits; Luhn checked.
 * @returns A human readable error, or null if the ssn is valid
 */
export function validateTaxUnitSsn(ssn: string, locale: RequestLocale): string | null {
  if (locale === RequestLocale.SV) {
    if (!/^\d{12}$/.test(ssn) && !/^\d{8}-\d{4}$/.test(ssn)) {
      return "Invalid personnummer / organisationsnummer (expected 12 digits, YYYYMMDDNNNN)";
    }
    const digits = ssn.replace("-", "");
    if (!["16", "19", "20"].includes(digits.slice(0, 2))) {
      return "Invalid personnummer / organisationsnummer (must start with 16, 19 or 20)";
    }
    if (!isValidPersonnummer(digits)) {
      return "Invalid personnummer / organisationsnummer (failed checksum)";
    }
    return null;
  }

  if (/^\d{11}$/.test(ssn)) {
    const validation = fnr(ssn);
    if (validation.status !== "valid") {
      return "Invalid fødselsnummer: the check digits or the birth date are wrong";
    }
    return null;
  }
  if (/^\d{9}$/.test(ssn)) {
    return isValidNorwegianOrgNr(ssn) ? null : "Invalid organization number (failed checksum)";
  }
  return "Invalid ssn (expected 11 digit fødselsnummer or 9 digit organization number)";
}
