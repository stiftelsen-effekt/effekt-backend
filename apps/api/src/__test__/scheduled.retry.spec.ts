import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import * as giroSftp from "../custom_modules/giroSftp";
import * as sftp from "../custom_modules/sftp";
import sinon from "sinon";
import express from "express";
import { expect } from "chai";
import request from "supertest";
import { DateTime } from "luxon";
import * as avtalegiroDeletions from "../custom_modules/avtalegiro/deletions";

const avtalegiro = require("../custom_modules/avtalegiro");
const mail = require("../custom_modules/mail");

describe("POST /scheduled/avtalegiro/retry", function () {
  const mockAgreements = [
    {
      id: 1,
      KID: "002556289731589",
      paymentDate: 16,
      amount: 50000,
      notice: true,
      active: true,
    },
    {
      id: 2,
      KID: "000638723319577",
      paymentDate: 16,
      amount: 340000,
      notice: false,
      active: true,
    },
    {
      id: 3,
      KID: "000675978627833",
      paymentDate: 16,
      amount: 5000000,
      notice: true,
      active: true,
    },
  ];

  const receipt = (shipmentID: number, kind = "GODKJENT") => ({
    name: `KV.${kind}.F${shipmentID.toString().padStart(7, "0")}.D230509.T133148.K5552827.html`,
  });

  let server;

  let avtalegiroFileStub;
  let sendNotificationStub;
  let shipmentStub;
  let agreementsStub;
  let loggingStub;
  let sendFileStub;
  let dueDateStub;
  let getConnectionStub;
  let shipmentsForDueDateStub;
  let supersedeStub;
  let claimedKIDsStub;
  let addChargesStub;
  let untrackedStub;
  let deletionsStub;
  let failedUploadsStub;
  let alertStub;

  const receiptsOnServer = (shipmentIDs: number[], rejectedShipmentIDs: number[] = []) => {
    getConnectionStub.resolves({
      list: sinon.fake.resolves([
        ...shipmentIDs.map((id) => receipt(id)),
        ...rejectedShipmentIDs.map((id) => receipt(id, "AVVIST")),
      ]),
      end: sinon.fake.resolves(true),
    });
  };

  beforeAll(function () {
    sinon.replace(authMiddleware, "isAdmin", []);

    deletionsStub = sinon
      .stub(avtalegiroDeletions, "processAvtaleGiroDeletions")
      .resolves({} as any);

    avtalegiroFileStub = sinon
      .stub(avtalegiro, "generateAvtaleGiroFile")
      .resolves(Buffer.from("", "utf-8"));

    sendNotificationStub = sinon.stub(mail, "sendAvtalegiroNotification").resolves(true);

    shipmentStub = sinon.stub(DAO.avtalegiroagreements, "addShipment").resolves(700);

    agreementsStub = sinon.stub(DAO.avtalegiroagreements, "getByPaymentDate");

    shipmentsForDueDateStub = sinon.stub(DAO.avtalegirocharges, "getShipmentIDsForDueDate");
    supersedeStub = sinon.stub(DAO.avtalegirocharges, "supersedeShipments").resolves();
    claimedKIDsStub = sinon.stub(DAO.avtalegirocharges, "getClaimedKIDsForMonth");
    addChargesStub = sinon.stub(DAO.avtalegirocharges, "addCharges").resolves();
    untrackedStub = sinon.stub(DAO.avtalegirocharges, "getUntrackedShipmentIDs");
    failedUploadsStub = sinon.stub(DAO.avtalegirocharges, "getFailedUploadShipmentIDs");
    alertStub = sinon.stub(mail, "sendAvtaleGiroRetryAlert").resolves(true);

    getConnectionStub = sinon.stub<any, "getConnection">(sftp, "getConnection");

    dueDateStub = sinon.stub(avtalegiro, "getDueDates");

    loggingStub = sinon.stub(DAO.logging, "add").resolves();

    sendFileStub = sinon.stub(giroSftp, "sendFile");

    const scheduledRoute = require("../routes/scheduled");
    server = express();
    server.use("/scheduled", scheduledRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
    // Tests set behaviour for specific calls and arguments, which resetHistory keeps
    agreementsStub.reset();
    shipmentsForDueDateStub.reset();
    agreementsStub.resolves(mockAgreements);
    claimedKIDsStub.resolves(new Set());
    shipmentsForDueDateStub.resolves([]);
    untrackedStub.resolves([]);
    failedUploadsStub.resolves([]);
    sendFileStub.resolves();
    receiptsOnServer([]);
  });

  it("Should not retry if no claim dates for date", async () => {
    dueDateStub.returns([]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(dueDateStub.calledOnce).to.be.true;
    expect(agreementsStub.called).to.be.false;
    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
  });

  it("Looks up today's shipments for the claim date", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([651]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    const [dueDate, generatedOn] = shipmentsForDueDateStub.firstCall.args;
    expect(dueDate.toISODate()).to.equal("2023-05-16");
    expect(generatedOn.toISODate()).to.equal("2023-05-10");
  });

  it("Should ignore the claim date if the reciept is present", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([649, 650, 651]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(agreementsStub.called).to.be.false;
    expect(supersedeStub.called).to.be.false;
    expect(addChargesStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
  });

  it("Should ignore the claim date if any of its shipments has a reciept", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([650, 651]);
    receiptsOnServer([651]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(supersedeStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
  });

  it("Should supersede the shipment and send the claims again if it was rejected", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([649, 650], [651]);

    const res = await request(server)
      .post("/scheduled/avtalegiro/retry?date=2023-05-10")
      .expect(200);

    sinon.assert.calledOnceWithExactly(supersedeStub, [651]);
    // Superseding first lets the claims in the old shipment be claimed again
    expect(supersedeStub.calledBefore(claimedKIDsStub)).to.be.true;
    sinon.assert.calledOnceWithExactly(shipmentStub, mockAgreements.length);
    expect(addChargesStub.firstCall.args[0]).to.equal(700);
    expect(addChargesStub.firstCall.args[1]).to.have.length(mockAgreements.length);
    expect(addChargesStub.calledBefore(sendFileStub)).to.be.true;
    expect(sendFileStub.calledOnce).to.be.true;
    expect(sendFileStub.firstCall.args[1]).to.equal("DIRREM100523.160523.700");
    expect(alertStub.called).to.be.false;
    expect(res.body.claimDates[0].path).to.equal("resend");
    const retryLog = loggingStub.withArgs("AvtaleGiro - Retry").firstCall.args[1];
    expect(retryLog.path).to.equal("resend");
    expect(retryLog.shipments[0].receiptStatus).to.equal("rejected");
    expect(retryLog.file).to.be.a("string");
  });

  it("Does not send again, and alerts, if there is no receipt yet", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([649, 650]);

    const res = await request(server)
      .post("/scheduled/avtalegiro/retry?date=2023-05-10")
      .expect(409);

    expect(supersedeStub.called).to.be.false;
    expect(addChargesStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
    sinon.assert.calledOnce(alertStub);
    const [date, claimDates, filesSeen] = alertStub.firstCall.args;
    expect(date).to.equal("2023-05-10");
    expect(claimDates).to.deep.equal([
      {
        claimDate: "2023-05-16",
        shipments: [
          { shipmentID: 651, receiptStatus: "none", uploadFailed: false, receiptFiles: [] },
        ],
      },
    ]);
    expect(filesSeen).to.equal(2);
    // Shipment numbers and receipt file names only, no donor data
    expect(JSON.stringify(alertStub.firstCall.args)).not.to.contain(mockAgreements[0].KID);
    expect(res.body.alerted).to.be.true;
    const retryLog = loggingStub.withArgs("AvtaleGiro - Retry").firstCall.args[1];
    expect(retryLog.path).to.equal("alert");
  });

  it("Does not send again, and alerts, if the receipts are ambiguous", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    getConnectionStub.resolves({
      list: sinon.fake.resolves([{ name: "KV.DELVIS.F0000651.D230509.T133148.K5552827.html" }]),
      end: sinon.fake.resolves(true),
    });

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(409);

    expect(supersedeStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
    sinon.assert.calledOnce(alertStub);
    expect(alertStub.firstCall.args[1][0].shipments[0]).to.deep.include({
      receiptStatus: "ambiguous",
      receiptFiles: ["KV.DELVIS.F0000651.D230509.T133148.K5552827.html"],
    });
  });

  it("Sends again if the upload of the shipment failed", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    failedUploadsStub.resolves([651]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    sinon.assert.calledOnceWithExactly(failedUploadsStub, [651]);
    sinon.assert.calledOnceWithExactly(supersedeStub, [651]);
    expect(sendFileStub.calledOnce).to.be.true;
    expect(alertStub.called).to.be.false;
  });

  it("Does not send again if the upload failed but a receipt arrived anyway", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    failedUploadsStub.resolves([651]);
    receiptsOnServer([651]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(supersedeStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
  });

  it("Sends again when a person asks for the shipment to be sent again", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);

    await request(server)
      .post("/scheduled/avtalegiro/retry?date=2023-05-10&resend=651")
      .expect(200);

    sinon.assert.calledOnceWithExactly(supersedeStub, [651]);
    expect(sendFileStub.calledOnce).to.be.true;
    expect(loggingStub.withArgs("AvtaleGiro - Retry").firstCall.args[1].path).to.equal(
      "manual-resend",
    );
  });

  it("Does not send an accepted shipment again even when a person asks", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([651]);

    await request(server)
      .post("/scheduled/avtalegiro/retry?date=2023-05-10&resend=651")
      .expect(200);

    expect(sendFileStub.called).to.be.false;
  });

  it("Should claim the date if no shipment was recorded for it", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(agreementsStub.called).to.be.true;
    expect(addChargesStub.calledOnce).to.be.true;
    expect(sendFileStub.calledOnce).to.be.true;
  });

  it("Should not claim agreements already claimed this month in another shipment", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    shipmentsForDueDateStub.resolves([651]);
    receiptsOnServer([], [651]);
    claimedKIDsStub.resolves(new Set([mockAgreements[0].KID]));

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(addChargesStub.firstCall.args[1].map((a) => a.KID)).to.deep.equal([
      mockAgreements[1].KID,
      mockAgreements[2].KID,
    ]);
  });

  it("Retries for all claim dates with rejected shipments", async () => {
    dueDateStub.returns([
      DateTime.fromISO("2023-05-16"),
      DateTime.fromISO("2023-05-17"),
      DateTime.fromISO("2023-05-18"),
    ]);
    shipmentsForDueDateStub.onCall(0).resolves([650]);
    shipmentsForDueDateStub.onCall(1).resolves([651]);
    shipmentsForDueDateStub.onCall(2).resolves([652]);
    receiptsOnServer([650], [651, 652]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(supersedeStub.callCount).to.equal(2);
    expect(supersedeStub.firstCall.args[0]).to.deep.equal([651]);
    expect(supersedeStub.secondCall.args[0]).to.deep.equal([652]);
    expect(sendFileStub.callCount).to.be.eq(2);
  });

  it("Continues to the next claim date when one has no agreements", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16"), DateTime.fromISO("2023-05-17")]);
    agreementsStub.withArgs(16).resolves([]);
    agreementsStub.withArgs(17).resolves(mockAgreements);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(sendFileStub.calledOnce).to.be.true;
    expect(sendFileStub.firstCall.args[1]).to.equal("DIRREM100523.170523.700");
    expect(loggingStub.withArgs("AvtaleGiro - Retry").callCount).to.equal(2);
  });

  it("Processes deletions and sends unaccepted deletion files again", async () => {
    dueDateStub.returns([]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(deletionsStub.calledOnce).to.be.true;
    expect(deletionsStub.firstCall.args[1]).to.be.true;
  });

  it("Skips the retry on the day of the deploy if shipments were sent before charges were recorded", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16"), DateTime.fromISO("2023-05-17")]);
    untrackedStub.resolves([640, 641]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(untrackedStub.firstCall.args[0].toISODate()).to.equal("2023-05-10");
    expect(shipmentsForDueDateStub.called).to.be.false;
    expect(supersedeStub.called).to.be.false;
    expect(addChargesStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
    const retryLogs = loggingStub.withArgs("AvtaleGiro - Retry");
    sinon.assert.calledOnce(retryLogs);
    expect(retryLogs.firstCall.args[1].untrackedShipmentIDs).to.deep.equal([640, 641]);
    // Deletions are still processed
    expect(deletionsStub.calledOnce).to.be.true;
  });

  it("Does not look for untracked shipments on days without claim dates", async () => {
    dueDateStub.returns([]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-13").expect(200);

    expect(untrackedStub.called).to.be.false;
  });

  it("Records a failed upload of the claims file, so the retry can send it again", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);
    sendFileStub.rejects(new Error("Connection reset"));

    await request(server).post("/scheduled/avtalegiro?date=2023-05-10").expect(500);

    const failedLogs = loggingStub.withArgs("AvtaleGiro - Upload failed");
    sinon.assert.calledOnce(failedLogs);
    expect(failedLogs.firstCall.args[1]).to.deep.equal({
      shipmentID: 700,
      claimDate: "2023-05-16",
      filename: "DIRREM100523.160523.700",
      error: "Connection reset",
    });
  });

  it("Does not notify donors again", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(sendNotificationStub.called).to.be.false;
  });

  afterAll(() => {
    sinon.restore();
  });
});
