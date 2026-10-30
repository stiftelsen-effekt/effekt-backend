import { DateTime } from "luxon";
import { DAO } from "../DAO";
import {
  AvtaleGiroChargeStatus,
  AvtaleGiroOpenCharge,
  AvtaleGiroPendingCharge,
  CHARGING_STATUSES,
  getMonthBounds,
  PAYABLE_STATUSES,
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
 * Only claims that have been or will be charged count: superseded claims were sent again in a new
 * shipment, and deleted claims won't be charged.
 */
async function getClaimedKIDsForMonth(dueDate: DateTime): Promise<Set<string>> {
  const { start, end } = getMonthBounds(dueDate);

  const [rows] = await DAO.query<{ KID: string }[]>(
    `SELECT DISTINCT KID FROM Avtalegiro_agreement_charges
      WHERE due_date BETWEEN ? AND ? AND status IN (?)`,
    [start, end, CHARGING_STATUSES],
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
        AND NOT EXISTS (
          SELECT 1 FROM Avtalegiro_agreement_charges C
          WHERE C.shipmentID = S.ID OR C.deletion_shipmentID = S.ID
        )
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
 * Gets the charges for a KID that a payment can still be linked to
 */
async function getOpenChargesByKID(KID: string): Promise<AvtaleGiroOpenCharge[]> {
  const [rows] = await DAO.query<{ ID: number; due_date: string }[]>(
    `SELECT ID, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date FROM Avtalegiro_agreement_charges
      WHERE KID = ? AND status IN (?) AND donationID IS NULL`,
    [KID, PAYABLE_STATUSES],
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
      WHERE ID = ? AND status IN (?) AND donationID IS NULL`,
    [AvtaleGiroChargeStatus.COMPLETED, donationID, chargeID, PAYABLE_STATUSES],
  );

  return result.affectedRows > 0;
}

const mapPendingCharge = (row: {
  ID: number;
  KID: string;
  amount: number;
  due_date: string;
}): AvtaleGiroPendingCharge => ({
  id: row.ID,
  KID: row.KID,
  amount: row.amount,
  dueDate: row.due_date,
});

/**
 * Gets a KID's claimed charges due on or after a date, which a cancellation may still delete
 */
async function getUpcomingChargesByKID(
  KID: string,
  from: DateTime,
): Promise<AvtaleGiroPendingCharge[]> {
  const [rows] = await DAO.query<{ ID: number; KID: string; amount: number; due_date: string }[]>(
    `SELECT ID, KID, amount, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
      FROM Avtalegiro_agreement_charges
      WHERE KID = ? AND status = ? AND due_date >= ?
      ORDER BY due_date`,
    [KID, AvtaleGiroChargeStatus.CLAIMED, from.toISODate()],
  );

  return rows.map(mapPendingCharge);
}

/**
 * Marks claimed charges to be deleted in the next deletion file
 */
async function requestDeletions(chargeIDs: number[]): Promise<void> {
  if (chargeIDs.length === 0) return;

  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP() WHERE ID IN (?) AND status = ?`,
    [AvtaleGiroChargeStatus.DELETION_REQUESTED, chargeIDs, AvtaleGiroChargeStatus.CLAIMED],
  );
}

/**
 * Gets the charges waiting to be sent in a deletion file
 */
async function getDeletionRequests(): Promise<AvtaleGiroPendingCharge[]> {
  const [rows] = await DAO.query<{ ID: number; KID: string; amount: number; due_date: string }[]>(
    `SELECT ID, KID, amount, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
      FROM Avtalegiro_agreement_charges
      WHERE status = ?
      ORDER BY due_date, ID`,
    [AvtaleGiroChargeStatus.DELETION_REQUESTED],
  );

  return rows.map(mapPendingCharge);
}

/**
 * Puts deletion requests back to claimed, when it's too late to send them
 */
async function restoreDeletionRequests(chargeIDs: number[]): Promise<void> {
  if (chargeIDs.length === 0) return;

  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP() WHERE ID IN (?) AND status = ?`,
    [AvtaleGiroChargeStatus.CLAIMED, chargeIDs, AvtaleGiroChargeStatus.DELETION_REQUESTED],
  );
}

/**
 * Puts a KID's unsent deletion requests back to claimed, when the agreement is reactivated
 */
async function restoreDeletionRequestsByKID(KID: string): Promise<void> {
  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP() WHERE KID = ? AND status = ?`,
    [AvtaleGiroChargeStatus.CLAIMED, KID, AvtaleGiroChargeStatus.DELETION_REQUESTED],
  );
}

/**
 * Marks deletion requests as sent in a deletion shipment
 */
async function markDeletionsSent(chargeIDs: number[], deletionShipmentID: number): Promise<void> {
  if (chargeIDs.length === 0) return;

  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP(), deletion_shipmentID = ?
      WHERE ID IN (?) AND status = ?`,
    [
      AvtaleGiroChargeStatus.DELETION_SENT,
      deletionShipmentID,
      chargeIDs,
      AvtaleGiroChargeStatus.DELETION_REQUESTED,
    ],
  );
}

/**
 * Gets the deletion shipments that MPS has not accepted yet
 */
async function getSentDeletionShipmentIDs(): Promise<number[]> {
  const [rows] = await DAO.query<{ deletion_shipmentID: number }[]>(
    `SELECT DISTINCT deletion_shipmentID FROM Avtalegiro_agreement_charges
      WHERE status = ? AND deletion_shipmentID IS NOT NULL
      ORDER BY deletion_shipmentID`,
    [AvtaleGiroChargeStatus.DELETION_SENT],
  );

  return rows.map((row) => row.deletion_shipmentID);
}

/**
 * Marks the deletions in a shipment as deleted, once MPS has accepted the file
 */
async function confirmDeletionShipment(deletionShipmentID: number): Promise<void> {
  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP()
      WHERE deletion_shipmentID = ? AND status = ?`,
    [AvtaleGiroChargeStatus.DELETED, deletionShipmentID, AvtaleGiroChargeStatus.DELETION_SENT],
  );
}

/**
 * Puts the deletions in an unaccepted shipment back in the queue, to be sent again
 */
async function requeueDeletionShipment(deletionShipmentID: number): Promise<void> {
  await DAO.query(
    `UPDATE Avtalegiro_agreement_charges SET status = ?, last_updated = UTC_TIMESTAMP(), deletion_shipmentID = NULL
      WHERE deletion_shipmentID = ? AND status = ?`,
    [
      AvtaleGiroChargeStatus.DELETION_REQUESTED,
      deletionShipmentID,
      AvtaleGiroChargeStatus.DELETION_SENT,
    ],
  );
}

export const avtalegirocharges = {
  addCharges,
  getClaimedKIDsForMonth,
  getShipmentIDsForDueDate,
  getUntrackedShipmentIDs,
  supersedeShipments,
  getOpenChargesByKID,
  markCompleted,
  getUpcomingChargesByKID,
  requestDeletions,
  getDeletionRequests,
  restoreDeletionRequests,
  restoreDeletionRequestsByKID,
  markDeletionsSent,
  getSentDeletionShipmentIDs,
  confirmDeletionShipment,
  requeueDeletionShipment,
};
