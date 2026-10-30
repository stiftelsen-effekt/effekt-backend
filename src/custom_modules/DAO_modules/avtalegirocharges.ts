import { DateTime } from "luxon";
import { DAO } from "../DAO";
import {
  AvtaleGiroChargeStatus,
  AvtaleGiroOpenCharge,
  getMonthBounds,
  MONTHLY_CLAIM_STATUSES,
} from "../avtalegiro/charges";
import { AvtaleGiroAgreement } from "./avtalegiroagreements";

/**
 * Records the claims in a shipment, one row per agreement
 * @param shipmentID The shipment the claims are sent in
 * @param agreements The agreements being claimed
 * @param dueDate The due date of the claims
 */
async function addCharges(
  shipmentID: number,
  agreements: AvtaleGiroAgreement[],
  dueDate: DateTime,
): Promise<void> {
  if (agreements.length === 0) return;

  // Written from the app, not by the column default, so they are UTC (see docs/timestamps.md)
  const now = new Date();
  const rows = agreements.map((agreement) => [
    agreement.id,
    shipmentID,
    agreement.KID,
    dueDate.toISODate(),
    agreement.amount,
    AvtaleGiroChargeStatus.CLAIMED,
    now,
    now,
  ]);

  await DAO.query(
    `INSERT INTO Avtalegiro_agreement_charges
      (agreementID, shipmentID, KID, due_date, amount, status, created, last_updated)
      VALUES ?`,
    [rows],
  );
}

/**
 * Gets the KIDs that already have a claim with a due date in the same month as the given date.
 * Superseded claims don't count, since a retry sent them again in a new shipment.
 */
async function getClaimedKIDsForMonth(dueDate: DateTime): Promise<Set<string>> {
  const { start, end } = getMonthBounds(dueDate);

  const [rows] = await DAO.query<{ KID: string }[]>(
    `SELECT DISTINCT KID FROM Avtalegiro_agreement_charges
      WHERE due_date BETWEEN ? AND ? AND status IN (?)`,
    [start, end, MONTHLY_CLAIM_STATUSES],
  );

  return new Set(rows.map((row) => row.KID));
}

/**
 * Gets the shipments generated on a day that claim the given due date
 * @param dueDate The due date of the claims
 * @param generatedOn The day the shipments were generated
 */
async function getShipmentIDsForDueDate(
  dueDate: DateTime,
  generatedOn: DateTime,
): Promise<number[]> {
  const [rows] = await DAO.query<{ shipmentID: number }[]>(
    `SELECT DISTINCT C.shipmentID FROM Avtalegiro_agreement_charges C
      INNER JOIN Avtalegiro_shipment S ON S.ID = C.shipmentID
      WHERE C.due_date = ? AND DATE(S.generated) = ? AND C.status <> ?
      ORDER BY C.shipmentID`,
    [dueDate.toISODate(), generatedOn.toISODate(), AvtaleGiroChargeStatus.SUPERSEDED],
  );

  return rows.map((row) => row.shipmentID);
}

/**
 * Gets the shipments generated on a day that were sent before charges were recorded, i.e. by the
 * claims job as it was before this table existed. Only possible on the day of the deploy: every
 * later shipment is created right before its charges. A shipment created after the first recorded
 * one, but with no charges (because recording them failed), is not counted, since nothing was sent.
 */
async function getUntrackedShipmentIDs(generatedOn: DateTime): Promise<number[]> {
  const [rows] = await DAO.query<{ ID: number }[]>(
    `SELECT S.ID FROM Avtalegiro_shipment S
      WHERE DATE(S.generated) = ?
        AND NOT EXISTS (SELECT 1 FROM Avtalegiro_agreement_charges C WHERE C.shipmentID = S.ID)
        AND S.ID < COALESCE((SELECT MIN(shipmentID) FROM Avtalegiro_agreement_charges), 2147483647)
      ORDER BY S.ID`,
    [generatedOn.toISODate()],
  );

  return rows.map((row) => row.ID);
}

/**
 * Marks the claims in shipments as superseded, before a retry sends them again
 */
async function supersedeShipments(shipmentIDs: number[]): Promise<void> {
  if (shipmentIDs.length === 0) return;

  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP()
      WHERE shipmentID IN (?) AND status = ?`,
    [AvtaleGiroChargeStatus.SUPERSEDED, shipmentIDs, AvtaleGiroChargeStatus.CLAIMED],
  );
}

/**
 * Gets the claimed charges for a KID that have no payment yet
 */
async function getOpenChargesByKID(KID: string): Promise<AvtaleGiroOpenCharge[]> {
  const [rows] = await DAO.query<{ ID: number; due_date: string }[]>(
    `SELECT ID, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date FROM Avtalegiro_agreement_charges
      WHERE KID = ? AND status = ? AND donationID IS NULL`,
    [KID, AvtaleGiroChargeStatus.CLAIMED],
  );

  return rows.map((row) => ({ id: row.ID, dueDate: row.due_date }));
}

/**
 * Links a charge to the donation that paid it
 * @returns True if the charge was updated
 */
async function markCompleted(chargeID: number, donationID: number): Promise<boolean> {
  const [result] = await DAO.query(
    `UPDATE Avtalegiro_agreement_charges
      SET status = ?, donationID = ?, last_updated = UTC_TIMESTAMP()
      WHERE ID = ? AND status = ? AND donationID IS NULL`,
    [AvtaleGiroChargeStatus.COMPLETED, donationID, chargeID, AvtaleGiroChargeStatus.CLAIMED],
  );

  return result.affectedRows > 0;
}

export const avtalegirocharges = {
  addCharges,
  getClaimedKIDsForMonth,
  getShipmentIDsForDueDate,
  getUntrackedShipmentIDs,
  supersedeShipments,
  getOpenChargesByKID,
  markCompleted,
};
