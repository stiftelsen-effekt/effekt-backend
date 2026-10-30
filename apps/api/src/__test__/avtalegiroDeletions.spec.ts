import { describe, it, beforeEach, afterEach } from "vitest";
import sinon from "sinon";
import { expect } from "chai";
import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import * as nets from "../custom_modules/nets";
import {
  processAvtaleGiroDeletions,
  requestDeletionOfUpcomingCharges,
} from "../custom_modules/avtalegiro/deletions";

const avtalegiro = require("../custom_modules/avtalegiro");

const oslo = (iso: string) => DateTime.fromISO(iso, { zone: "Europe/Oslo" });

const charge = (id: number, dueDate: string, KID = "111", amount = 50000) => ({
  id,
  KID,
  amount,
  dueDate,
});

describe("AvtaleGiro deletions", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("requestDeletionOfUpcomingCharges", () => {
    let upcomingStub: sinon.SinonStub;
    let requestStub: sinon.SinonStub;

    beforeEach(() => {
      upcomingStub = sinon.stub(DAO.avtalegirocharges, "getUpcomingChargesByKID");
      requestStub = sinon.stub(DAO.avtalegirocharges, "requestDeletions").resolves();
    });

    it("requests deletion of claims that can still be stopped", async () => {
      upcomingStub.resolves([charge(9, "2026-10-27")]);

      const result = await requestDeletionOfUpcomingCharges("111", oslo("2026-10-22T15:00"));

      sinon.assert.calledOnceWithExactly(requestStub, [9]);
      expect(result.deletable.map((c) => c.id)).to.deep.equal([9]);
      expect(result.tooLate).to.be.empty;
    });

    it("leaves claims too close to their due date to be charged", async () => {
      upcomingStub.resolves([charge(8, "2026-10-23"), charge(9, "2026-10-27")]);

      // Thursday afternoon: too late for Friday's claim, in time for Tuesday's
      const result = await requestDeletionOfUpcomingCharges("111", oslo("2026-10-22T15:00"));

      sinon.assert.calledOnceWithExactly(requestStub, [9]);
      expect(result.tooLate.map((c) => c.id)).to.deep.equal([8]);
    });

    it("looks up claims due from today in Oslo", async () => {
      upcomingStub.resolves([]);

      // 23:30 UTC on the 22nd is the 23rd in Oslo
      await requestDeletionOfUpcomingCharges(
        "111",
        DateTime.fromISO("2026-10-22T23:30:00Z", { zone: "utc" }),
      );

      const [KID, from] = upcomingStub.firstCall.args;
      expect(KID).to.equal("111");
      expect(from.toISODate()).to.equal("2026-10-23");
    });

    it("requests nothing when the agreement has no upcoming claims", async () => {
      upcomingStub.resolves([]);

      const result = await requestDeletionOfUpcomingCharges("111", oslo("2026-10-22T15:00"));

      sinon.assert.calledOnceWithExactly(requestStub, []);
      expect(result).to.deep.equal({ deletable: [], tooLate: [] });
    });
  });

  describe("processAvtaleGiroDeletions", () => {
    let sentShipmentsStub: sinon.SinonStub;
    let receiptStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;
    let requeueStub: sinon.SinonStub;
    let requestsStub: sinon.SinonStub;
    let restoreStub: sinon.SinonStub;
    let shipmentStub: sinon.SinonStub;
    let markSentStub: sinon.SinonStub;
    let fileStub: sinon.SinonStub;
    let sendFileStub: sinon.SinonStub;

    // Thursday 22 October 2026, during the 10:00 run
    const tenOClock = oslo("2026-10-22T10:00:05");

    beforeEach(() => {
      sentShipmentsStub = sinon
        .stub(DAO.avtalegirocharges, "getSentDeletionShipmentIDs")
        .resolves([]);
      receiptStub = sinon.stub(nets, "checkIfAcceptedReciept").resolves(false);
      confirmStub = sinon.stub(DAO.avtalegirocharges, "confirmDeletionShipment").resolves();
      requeueStub = sinon.stub(DAO.avtalegirocharges, "requeueDeletionShipment").resolves();
      requestsStub = sinon.stub(DAO.avtalegirocharges, "getDeletionRequests").resolves([]);
      restoreStub = sinon.stub(DAO.avtalegirocharges, "restoreDeletionRequests").resolves();
      shipmentStub = sinon.stub(DAO.avtalegiroagreements, "addShipment").resolves(800);
      markSentStub = sinon.stub(DAO.avtalegirocharges, "markDeletionsSent").resolves();
      fileStub = sinon
        .stub(avtalegiro, "generateAvtaleGiroDeletionFile")
        .resolves(Buffer.from("deletions", "utf-8"));
      sendFileStub = sinon.stub(nets, "sendFile").resolves();
    });

    it("sends the requested deletions in one file", async () => {
      requestsStub.resolves([charge(9, "2026-10-27"), charge(12, "2026-10-28", "222", 20000)]);

      const result = await processAvtaleGiroDeletions(tenOClock, false);

      sinon.assert.calledOnceWithExactly(shipmentStub, 2);
      sinon.assert.calledOnceWithExactly(markSentStub, [9, 12], 800);
      const [shipmentID, deletions] = fileStub.firstCall.args;
      expect(shipmentID).to.equal(800);
      expect(
        deletions.map((d) => ({ KID: d.KID, amount: d.amount, dueDate: d.dueDate.toISODate() })),
      ).to.deep.equal([
        { KID: "111", amount: 50000, dueDate: "2026-10-27" },
        { KID: "222", amount: 20000, dueDate: "2026-10-28" },
      ]);
      expect(result.sentChargeIDs).to.deep.equal([9, 12]);
      expect(result.shipmentID).to.equal(800);
      expect(result.file).to.equal("deletions");
    });

    it("names the file like claims files, with the earliest due date", async () => {
      requestsStub.resolves([charge(12, "2026-10-28"), charge(9, "2026-10-27")]);

      await processAvtaleGiroDeletions(tenOClock, false);

      expect(sendFileStub.firstCall.args[1]).to.equal("DIRREM221026.271026.800");
    });

    it("records the deletions as sent before sending the file", async () => {
      requestsStub.resolves([charge(9, "2026-10-27")]);

      await processAvtaleGiroDeletions(tenOClock, false);

      expect(markSentStub.calledBefore(sendFileStub)).to.be.true;
    });

    it("sends nothing when no deletions are requested", async () => {
      const result = await processAvtaleGiroDeletions(tenOClock, false);

      expect(shipmentStub.called).to.be.false;
      expect(sendFileStub.called).to.be.false;
      expect(result.shipmentID).to.be.null;
    });

    it("puts requests past the deadline back to claimed", async () => {
      // Friday's claim had to be deleted by Thursday 14:00
      requestsStub.resolves([charge(8, "2026-10-23"), charge(9, "2026-10-27")]);

      const result = await processAvtaleGiroDeletions(oslo("2026-10-22T13:50"), true);

      sinon.assert.calledOnceWithExactly(restoreStub, [8]);
      sinon.assert.calledOnceWithExactly(markSentStub, [9], 800);
      expect(result.expiredChargeIDs).to.deep.equal([8]);
    });

    it("sends a request made just before the last run", async () => {
      requestsStub.resolves([charge(8, "2026-10-23")]);

      await processAvtaleGiroDeletions(oslo("2026-10-22T13:00:05"), true);

      sinon.assert.calledOnceWithExactly(markSentStub, [8], 800);
      expect(restoreStub.firstCall.args[0]).to.deep.equal([]);
    });

    it("confirms deletion files that MPS accepted", async () => {
      sentShipmentsStub.resolves([798, 799]);
      receiptStub.withArgs(798).resolves(true);
      receiptStub.withArgs(799).resolves(false);

      const result = await processAvtaleGiroDeletions(tenOClock, false);

      sinon.assert.calledOnceWithExactly(confirmStub, 798);
      expect(result.confirmedShipmentIDs).to.deep.equal([798]);
    });

    it("waits for receipts in the 10:00 run", async () => {
      sentShipmentsStub.resolves([799]);

      const result = await processAvtaleGiroDeletions(tenOClock, false);

      expect(requeueStub.called).to.be.false;
      expect(result.requeuedShipmentIDs).to.be.empty;
    });

    it("sends unaccepted deletion files again in the retry runs", async () => {
      sentShipmentsStub.resolves([799]);
      // Requeued requests come back from the queue
      requestsStub.resolves([charge(9, "2026-10-27")]);

      const result = await processAvtaleGiroDeletions(oslo("2026-10-22T11:00:05"), true);

      sinon.assert.calledOnceWithExactly(requeueStub, 799);
      expect(requeueStub.calledBefore(requestsStub)).to.be.true;
      expect(result.requeuedShipmentIDs).to.deep.equal([799]);
      expect(sendFileStub.calledOnce).to.be.true;
    });

    it("does nothing on weekends and holidays", async () => {
      requestsStub.resolves([charge(9, "2026-10-27")]);

      const saturday = await processAvtaleGiroDeletions(oslo("2026-10-24T10:00"), true);
      const goodFriday = await processAvtaleGiroDeletions(oslo("2026-04-03T10:00"), true);

      expect(saturday.skipped).to.be.true;
      expect(goodFriday.skipped).to.be.true;
      expect(sentShipmentsStub.called).to.be.false;
      expect(requestsStub.called).to.be.false;
      expect(sendFileStub.called).to.be.false;
    });

    it("sends weekend cancellations on the next banking day", async () => {
      // Cancelled on Saturday for Tuesday's claim, sent in Monday's 10:00 run
      requestsStub.resolves([charge(9, "2026-10-27")]);

      await processAvtaleGiroDeletions(oslo("2026-10-26T10:00:05"), false);

      sinon.assert.calledOnceWithExactly(markSentStub, [9], 800);
    });
  });
});
