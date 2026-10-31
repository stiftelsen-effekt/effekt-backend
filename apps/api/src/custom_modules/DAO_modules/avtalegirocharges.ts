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

/** Import_logs label for a claims file that failed to upload, read by getFailedUploadShipmentIDs */
export const AVTALEGIRO_UPLOAD_FAILED_LOG_LABEL = "AvtaleGiro - Upload failed";

/**
 * Gets the shipments, of those given, whose upload to MPS failed (logged by the claims job)
 */
async function getFailedUploadShipmentIDs(shipmentIDs: number[]): Promise<number[]> {
  if (shipmentIDs.length === 0) return [];

  const [rows] = await DAO.query<{ shipmentID: number }[]>(
    `SELECT DISTINCT CAST(JSON_EXTRACT(result, '$.shipmentID') AS UNSIGNED) AS shipmentID
      FROM Import_logs
      WHERE label = ? AND CAST(JSON_EXTRACT(result, '$.shipmentID') AS UNSIGNED) IN (?)`,
    [AVTALEGIRO_UPLOAD_FAILED_LOG_LABEL, shipmentIDs],
  );

  return rows.map((row) => Number(row.shipmentID));
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

// region Admin list

/** The statuses as plain strings, as the admin API sends and receives them */
export type AvtaleGiroChargeStatusValue = `${AvtaleGiroChargeStatus}`;

export const avtaleGiroChargeStatuses = [
  "CLAIMED",
  "COMPLETED",
  "SUPERSEDED",
  "DELETION_REQUESTED",
  "DELETION_SENT",
  "DELETED",
] as const satisfies readonly AvtaleGiroChargeStatusValue[];

export const avtaleGiroChargeSortColumns = [
  "dueDate",
  "amount",
  "status",
  "created",
  "donorName",
  "kid",
] as const;
export type AvtaleGiroChargeSortColumn = (typeof avtaleGiroChargeSortColumns)[number];

export type AvtaleGiroChargeFilter = {
  /** An empty array matches nothing */
  statuses?: AvtaleGiroChargeStatusValue[];
  /** Due date range, inclusive (YYYY-MM-DD) */
  dueDate?: { from?: string; to?: string };
  /** Amount range in NOK, inclusive */
  amount?: { from?: number; to?: number };
  /** Partial match */
  KID?: string;
  agreementId?: number;
  /** Partial match on the donor's name */
  donor?: string;
  donorId?: number;
  /** The claims shipment or the deletion shipment */
  shipmentId?: number;
  /** Only charges linked to a donation (true) or not (false) */
  matched?: boolean;
};

export type AvtaleGiroChargeListRow = {
  id: number;
  agreementId: number;
  KID: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** NOK, two decimals */
  amount: string;
  status: AvtaleGiroChargeStatusValue;
  shipmentId: number;
  deletionShipmentId: number | null;
  donationId: number | null;
  donorId: number | null;
  donorName: string | null;
  created: Date | null;
  lastUpdated: Date | null;
};

export type AvtaleGiroChargeSummary = {
  count: number;
  /** NOK, two decimals */
  sum: string;
  /** Per status, under every filter except `statuses`, so each status shows what it would add */
  byStatus: { status: AvtaleGiroChargeStatusValue; count: number; sum: string }[];
};

/** øre (integer, or a decimal string from SUM) → NOK with two decimals */
export const oreToNok = (ore: number | string | null): string => {
  const value = BigInt(String(ore ?? 0).split(".")[0]);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const chargeSortExpressions: Record<AvtaleGiroChargeSortColumn, string> = {
  dueDate: "C.due_date",
  amount: "C.amount",
  status: "C.status",
  created: "C.created",
  donorName: "Donors.full_name",
  kid: "C.KID",
};

const chargeFrom = `
  FROM Avtalegiro_agreement_charges C
  LEFT JOIN Distributions D ON D.KID = C.KID
  LEFT JOIN Donors ON Donors.ID = D.Donor_ID`;

/** WHERE clause and parameters for a filter; `statuses` can be left out for the per-status summary */
function chargeWhere(filter: AvtaleGiroChargeFilter, withStatuses = true) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, ...values: unknown[]) => {
    where.push(clause);
    params.push(...values);
  };

  if (withStatuses && filter.statuses) add("C.status IN (?)", filter.statuses);
  if (filter.dueDate?.from) add("C.due_date >= ?", filter.dueDate.from);
  if (filter.dueDate?.to) add("C.due_date <= ?", filter.dueDate.to);
  // The column is in øre
  if (filter.amount?.from !== undefined) add("C.amount >= ?", Math.round(filter.amount.from * 100));
  if (filter.amount?.to !== undefined) add("C.amount <= ?", Math.round(filter.amount.to * 100));
  if (filter.KID) add("C.KID LIKE ?", `%${escapeLike(filter.KID)}%`);
  if (filter.agreementId !== undefined) add("C.agreementID = ?", filter.agreementId);
  if (filter.donor) add("Donors.full_name LIKE ?", `%${escapeLike(filter.donor)}%`);
  if (filter.donorId !== undefined) add("D.Donor_ID = ?", filter.donorId);
  if (filter.shipmentId !== undefined) {
    add("(C.shipmentID = ? OR C.deletion_shipmentID = ?)", filter.shipmentId, filter.shipmentId);
  }
  if (filter.matched !== undefined) {
    where.push(filter.matched ? "C.donationID IS NOT NULL" : "C.donationID IS NULL");
  }

  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

type ChargeDbRow = {
  ID: number;
  agreementID: number;
  KID: string;
  due_date: string;
  amount: number;
  status: AvtaleGiroChargeStatusValue;
  shipmentID: number;
  deletion_shipmentID: number | null;
  donationID: number | null;
  donorId: number | null;
  donorName: string | null;
  created: Date | null;
  last_updated: Date | null;
};

const chargeColumns = `C.ID, C.agreementID, C.KID, DATE_FORMAT(C.due_date, '%Y-%m-%d') AS due_date,
  C.amount, C.status, C.shipmentID, C.deletion_shipmentID, C.donationID,
  D.Donor_ID AS donorId, Donors.full_name AS donorName, C.created, C.last_updated`;

const mapChargeRow = (row: ChargeDbRow): AvtaleGiroChargeListRow => ({
  id: row.ID,
  agreementId: row.agreementID,
  KID: row.KID,
  dueDate: row.due_date,
  amount: oreToNok(row.amount),
  status: row.status,
  shipmentId: row.shipmentID,
  deletionShipmentId: row.deletion_shipmentID,
  donationId: row.donationID,
  donorId: row.donorId,
  donorName: row.donorName,
  // created and last_updated are written from the app in UTC (docs/timestamps.md)
  created: row.created,
  lastUpdated: row.last_updated,
});

/**
 * A page of charges with the summary for the whole filter. Every filter value is a parameter;
 * the sort column comes from chargeSortExpressions.
 */
async function getList(options: {
  filter: AvtaleGiroChargeFilter;
  sort: { id: AvtaleGiroChargeSortColumn; desc: boolean };
  page: number;
  limit: number;
}): Promise<{ rows: AvtaleGiroChargeListRow[]; summary: AvtaleGiroChargeSummary; pages: number }> {
  const { filter, sort, page, limit } = options;
  const direction = sort.desc ? "DESC" : "ASC";
  const order = [chargeSortExpressions[sort.id], "C.ID"]
    .map((expression) => `${expression} ${direction}`)
    .join(", ");
  const { where, params } = chargeWhere(filter);
  const facet = chargeWhere(filter, false);
  const noStatuses = filter.statuses !== undefined && filter.statuses.length === 0;

  const [[rows], [[totals]], [byStatus]] = await Promise.all([
    noStatuses
      ? Promise.resolve([[] as ChargeDbRow[]] as const)
      : DAO.query<ChargeDbRow[]>(
          `SELECT ${chargeColumns}
            ${chargeFrom}
            ${where}
            ORDER BY ${order}
            LIMIT ? OFFSET ?`,
          [...params, limit, page * limit],
        ),
    noStatuses
      ? Promise.resolve([[{ count: 0, sum: null }]] as const)
      : DAO.query<{ count: number; sum: string | null }[]>(
          `SELECT COUNT(*) AS count, SUM(C.amount) AS sum ${chargeFrom} ${where}`,
          params,
        ),
    DAO.query<{ status: AvtaleGiroChargeStatusValue; count: number; sum: string | null }[]>(
      `SELECT C.status, COUNT(*) AS count, SUM(C.amount) AS sum
        ${chargeFrom}
        ${facet.where}
        GROUP BY C.status`,
      facet.params,
    ),
  ]);

  const count = Number(totals?.count ?? 0);
  const counted = new Map(byStatus.map((row) => [row.status, row]));
  return {
    rows: rows.map(mapChargeRow),
    summary: {
      count,
      sum: oreToNok(totals?.sum ?? 0),
      byStatus: avtaleGiroChargeStatuses.map((status) => ({
        status,
        count: Number(counted.get(status)?.count ?? 0),
        sum: oreToNok(counted.get(status)?.sum ?? 0),
      })),
    },
    pages: Math.ceil(count / limit),
  };
}

/** Every charge on an agreement, newest due date first */
async function getByAgreementId(agreementId: number): Promise<AvtaleGiroChargeListRow[]> {
  const [rows] = await DAO.query<ChargeDbRow[]>(
    `SELECT ${chargeColumns}
      ${chargeFrom}
      WHERE C.agreementID = ?
      ORDER BY C.due_date DESC, C.ID DESC`,
    [agreementId],
  );
  return rows.map(mapChargeRow);
}

// endregion

export const avtalegirocharges = {
  addCharges,
  getClaimedKIDsForMonth,
  getShipmentIDsForDueDate,
  getUntrackedShipmentIDs,
  getFailedUploadShipmentIDs,
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
  getList,
  getByAgreementId,
};
