/**
 * Reading the receipts Mastercard Payment Services (MPS) puts in the SFTP /Inbound folder for the AvtaleGiro files we
 * send, and deciding whether a claims shipment may be sent again.
 *
 * A receipt's file name names the transmission it is for, e.g.
 *   KV.GODKJENT.F0000651.D230509.T133148.K5552827.html   (accepted)
 *   KV.AVVIST.F0000651.D230509.T133148.K5552827.html     (rejected)
 * KV is a receipt ("kvittering"), F is the transmission number ("forsendelsesnummer") from the
 * start record of our file, which is the shipment ID padded to 7 digits (see
 * startRecordTransmission in filewriterutil.js), followed by the date and time of the receipt.
 */

/** What the receipts in /Inbound say about one shipment */
export enum ShipmentReceiptStatus {
  /** Only accepted (KV.GODKJENT) receipts */
  ACCEPTED = "accepted",
  /** Only rejected (KV.AVVIST) receipts: MPS did not process the file */
  REJECTED = "rejected",
  /** Receipts of another kind, or both accepted and rejected ones */
  AMBIGUOUS = "ambiguous",
  /** No receipt */
  NONE = "none",
}

/** The file names of the receipts for a shipment */
export function getReceiptFilesForShipment(shipmentID: number, fileNames: string[]): string[] {
  const transmission = `F${shipmentID.toString().padStart(7, "0")}`;
  return fileNames.filter(
    (name) => name.startsWith("KV.") && name.split(".").includes(transmission),
  );
}

export function getShipmentReceiptStatus(
  shipmentID: number,
  fileNames: string[],
): ShipmentReceiptStatus {
  const receipts = getReceiptFilesForShipment(shipmentID, fileNames);
  if (receipts.length === 0) return ShipmentReceiptStatus.NONE;

  const kinds = new Set(receipts.map((name) => name.split(".")[1]));
  if (kinds.size === 1 && kinds.has("GODKJENT")) return ShipmentReceiptStatus.ACCEPTED;
  if (kinds.size === 1 && kinds.has("AVVIST")) return ShipmentReceiptStatus.REJECTED;
  return ShipmentReceiptStatus.AMBIGUOUS;
}

/** What the retry does for a claim date */
export enum RetryPath {
  /** A shipment for the date was accepted, nothing to do */
  ACCEPTED = "accepted",
  /** No shipment was recorded for the date, so nothing was sent: the claims are sent */
  NOT_SENT = "not-sent",
  /** Every shipment was rejected, or its upload failed: the claims are sent again */
  RESEND = "resend",
  /** A person asked for the shipments to be sent again (the `resend` query parameter) */
  MANUAL_RESEND = "manual-resend",
  /** We can't tell whether MPS has the claims: nothing is sent, and the team is alerted */
  ALERT = "alert",
}

export type ShipmentRetryInfo = {
  shipmentID: number;
  receiptStatus: ShipmentReceiptStatus;
  uploadFailed: boolean;
  receiptFiles: string[];
};

export type RetryDecision = {
  path: RetryPath;
  shipments: ShipmentRetryInfo[];
};

/**
 * Decides whether the claims for a due date are sent again. They are only sent again when we know
 * MPS won't charge them: every shipment for the date was rejected, or never reached MPS because
 * the upload failed. Sending claims MPS may still process could charge donors twice, so when
 * there is no receipt yet, or the receipts are unclear, a person decides.
 * @param shipmentIDs Today's shipments for the due date, not superseded
 * @param receiptFileNames The file names in /Inbound
 * @param failedUploadShipmentIDs Shipments whose upload failed
 * @param manualResendShipmentIDs Shipments a person asked to send again
 */
export function decideRetry(
  shipmentIDs: number[],
  receiptFileNames: string[],
  failedUploadShipmentIDs: number[],
  manualResendShipmentIDs: number[] = [],
): RetryDecision {
  const shipments = shipmentIDs.map((shipmentID) => ({
    shipmentID,
    receiptStatus: getShipmentReceiptStatus(shipmentID, receiptFileNames),
    uploadFailed: failedUploadShipmentIDs.includes(shipmentID),
    receiptFiles: getReceiptFilesForShipment(shipmentID, receiptFileNames),
  }));

  if (shipments.length === 0) return { path: RetryPath.NOT_SENT, shipments };

  if (shipments.some((shipment) => shipment.receiptStatus === ShipmentReceiptStatus.ACCEPTED)) {
    return { path: RetryPath.ACCEPTED, shipments };
  }

  const knownNotCharged = shipments.every(
    (shipment) =>
      shipment.receiptStatus === ShipmentReceiptStatus.REJECTED ||
      (shipment.receiptStatus === ShipmentReceiptStatus.NONE && shipment.uploadFailed),
  );
  if (knownNotCharged) return { path: RetryPath.RESEND, shipments };

  if (shipmentIDs.every((shipmentID) => manualResendShipmentIDs.includes(shipmentID))) {
    return { path: RetryPath.MANUAL_RESEND, shipments };
  }

  return { path: RetryPath.ALERT, shipments };
}
