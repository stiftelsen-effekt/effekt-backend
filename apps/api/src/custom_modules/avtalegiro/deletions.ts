import { DateTime } from "luxon";
import { DAO } from "../DAO";
import * as avtalegiro from "../avtalegiro";
import { checkIfAcceptedReciept, sendFile } from "../giroSftp";
import {
  AvtaleGiroPendingCharge,
  canSendDeletion,
  isBankingDay,
  partitionChargesForDeletion,
} from "./charges";

const OSLO = "Europe/Oslo";

/**
 * When an agreement is cancelled, requests deletion of the claims we have already sent for it.
 * Claims too close to their due date to delete will be charged.
 * @param KID The cancelled agreement's KID
 * @param now The time of the cancellation
 */
export async function requestDeletionOfUpcomingCharges(
  KID: string,
  now: DateTime,
): Promise<{ deletable: AvtaleGiroPendingCharge[]; tooLate: AvtaleGiroPendingCharge[] }> {
  const osloNow = now.setZone(OSLO);
  const upcoming = await DAO.avtalegirocharges.getUpcomingChargesByKID(KID, osloNow);
  const { deletable, tooLate } = partitionChargesForDeletion(upcoming, osloNow);

  await DAO.avtalegirocharges.requestDeletions(deletable.map((charge) => charge.id));

  return { deletable, tooLate };
}

export type ProcessDeletionsResult = {
  skipped: boolean;
  confirmedShipmentIDs: number[];
  requeuedShipmentIDs: number[];
  expiredChargeIDs: number[];
  sentChargeIDs: number[];
  shipmentID: number | null;
  file: string | null;
};

/**
 * Sends requested deletions to MPS and follows up earlier deletion files. Runs in the scheduled
 * AvtaleGiro jobs, which all run before the 14:00 deletion deadline.
 * @param now The time of the run
 * @param requeueUnconfirmed Whether to send deletion files without an accepted receipt again. The
 * retry runs do this, an hour after the previous run, like they do for claims.
 */
export async function processAvtaleGiroDeletions(
  now: DateTime,
  requeueUnconfirmed: boolean,
): Promise<ProcessDeletionsResult> {
  const osloNow = now.setZone(OSLO);
  const result: ProcessDeletionsResult = {
    skipped: false,
    confirmedShipmentIDs: [],
    requeuedShipmentIDs: [],
    expiredChargeIDs: [],
    sentChargeIDs: [],
    shipmentID: null,
    file: null,
  };

  // MPS only processes files on banking days, so requests wait for the next one
  if (!isBankingDay(osloNow)) {
    result.skipped = true;
    return result;
  }

  /**
   * Follow up deletion files we have sent
   */
  for (const shipmentID of await DAO.avtalegirocharges.getSentDeletionShipmentIDs()) {
    if (await checkIfAcceptedReciept(shipmentID)) {
      await DAO.avtalegirocharges.confirmDeletionShipment(shipmentID);
      result.confirmedShipmentIDs.push(shipmentID);
    } else if (requeueUnconfirmed) {
      await DAO.avtalegirocharges.requeueDeletionShipment(shipmentID);
      result.requeuedShipmentIDs.push(shipmentID);
    }
  }

  /**
   * Send the requested deletions that can still arrive before the deadline. The rest will be
   * charged, so they go back to claimed.
   */
  const requests = await DAO.avtalegirocharges.getDeletionRequests();
  const inTime = requests.filter((request) => canSendDeletion(request.dueDate, osloNow));
  const expired = requests.filter((request) => !canSendDeletion(request.dueDate, osloNow));

  result.expiredChargeIDs = expired.map((request) => request.id);
  await DAO.avtalegirocharges.restoreDeletionRequests(result.expiredChargeIDs);

  if (inTime.length === 0) return result;

  const deletions = inTime.map((request) => ({
    KID: request.KID,
    amount: request.amount,
    dueDate: DateTime.fromISO(request.dueDate, { zone: OSLO }),
  }));

  const shipmentID = await DAO.avtalegiroagreements.addShipment(deletions.length);
  // Recorded before sending: a file that fails to send has no receipt, so a retry sends it again
  await DAO.avtalegirocharges.markDeletionsSent(
    inTime.map((request) => request.id),
    shipmentID,
  );
  const file = await avtalegiro.generateAvtaleGiroDeletionFile(shipmentID, deletions);

  const earliestDueDate = DateTime.min(...deletions.map((deletion) => deletion.dueDate));
  const filename =
    "DIRREM" +
    osloNow.toFormat("ddLLyy") +
    "." +
    earliestDueDate.toFormat("ddLLyy") +
    "." +
    shipmentID;
  await sendFile(file, filename);

  result.sentChargeIDs = inTime.map((request) => request.id);
  result.shipmentID = shipmentID;
  result.file = file.toString();
  return result;
}
