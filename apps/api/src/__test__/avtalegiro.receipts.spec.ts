import { describe, it } from "vitest";
import { expect } from "chai";
import {
  decideRetry,
  getReceiptFilesForShipment,
  getShipmentReceiptStatus,
  RetryPath,
  ShipmentReceiptStatus,
} from "../custom_modules/avtalegiro/receipts";

const file = (kind: string, transmission: string) =>
  `KV.${kind}.F${transmission}.D230509.T133148.K5552827.html`;

describe("AvtaleGiro receipts", () => {
  describe("getReceiptFilesForShipment", () => {
    it("Matches the transmission number exactly", () => {
      const files = [
        file("GODKJENT", "0000651"),
        file("GODKJENT", "0006510"),
        file("AVVIST", "0000652"),
        "DIRREM100523.160523.651",
      ];
      expect(getReceiptFilesForShipment(651, files)).to.deep.equal([file("GODKJENT", "0000651")]);
    });
  });

  describe("getShipmentReceiptStatus", () => {
    it("Is accepted with only accepted receipts", () => {
      expect(getShipmentReceiptStatus(651, [file("GODKJENT", "0000651")])).to.equal(
        ShipmentReceiptStatus.ACCEPTED,
      );
    });

    it("Is rejected with only rejected receipts", () => {
      expect(getShipmentReceiptStatus(651, [file("AVVIST", "0000651")])).to.equal(
        ShipmentReceiptStatus.REJECTED,
      );
    });

    it("Is ambiguous with both accepted and rejected receipts", () => {
      expect(
        getShipmentReceiptStatus(651, [file("GODKJENT", "0000651"), file("AVVIST", "0000651")]),
      ).to.equal(ShipmentReceiptStatus.AMBIGUOUS);
    });

    it("Is ambiguous with an unknown kind of receipt", () => {
      expect(getShipmentReceiptStatus(651, [file("DELVIS", "0000651")])).to.equal(
        ShipmentReceiptStatus.AMBIGUOUS,
      );
    });

    it("Is none without receipts", () => {
      expect(getShipmentReceiptStatus(651, [file("GODKJENT", "0000650")])).to.equal(
        ShipmentReceiptStatus.NONE,
      );
    });
  });

  describe("decideRetry", () => {
    it("Does nothing when a shipment was accepted", () => {
      expect(decideRetry([651], [file("GODKJENT", "0000651")], []).path).to.equal(
        RetryPath.ACCEPTED,
      );
    });

    it("Does nothing when one of several shipments was accepted", () => {
      expect(
        decideRetry([650, 651], [file("AVVIST", "0000650"), file("GODKJENT", "0000651")], []).path,
      ).to.equal(RetryPath.ACCEPTED);
    });

    it("Sends again when the shipment was rejected", () => {
      expect(decideRetry([651], [file("AVVIST", "0000651")], []).path).to.equal(RetryPath.RESEND);
    });

    it("Sends again when the upload failed and there is no receipt", () => {
      expect(decideRetry([651], [], [651]).path).to.equal(RetryPath.RESEND);
    });

    it("Sends when no shipment was recorded", () => {
      expect(decideRetry([], [], []).path).to.equal(RetryPath.NOT_SENT);
    });

    it("Alerts when there is no receipt yet", () => {
      const decision = decideRetry([651], [file("GODKJENT", "0000650")], []);
      expect(decision.path).to.equal(RetryPath.ALERT);
      expect(decision.shipments).to.deep.equal([
        {
          shipmentID: 651,
          receiptStatus: ShipmentReceiptStatus.NONE,
          uploadFailed: false,
          receiptFiles: [],
        },
      ]);
    });

    it("Alerts when the receipts are ambiguous, even if the upload failed", () => {
      expect(decideRetry([651], [file("DELVIS", "0000651")], [651]).path).to.equal(RetryPath.ALERT);
    });

    it("Alerts when only some shipments are known not to be charged", () => {
      expect(decideRetry([650, 651], [file("AVVIST", "0000650")], []).path).to.equal(
        RetryPath.ALERT,
      );
    });

    it("Sends again when a person asked for every shipment of the date", () => {
      expect(decideRetry([650, 651], [], [], [650, 651]).path).to.equal(RetryPath.MANUAL_RESEND);
      expect(decideRetry([650, 651], [], [], [651]).path).to.equal(RetryPath.ALERT);
    });

    it("Never sends an accepted shipment again, even when a person asks", () => {
      expect(decideRetry([651], [file("GODKJENT", "0000651")], [], [651]).path).to.equal(
        RetryPath.ACCEPTED,
      );
    });
  });
});
