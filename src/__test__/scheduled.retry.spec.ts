import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import * as nets from "../custom_modules/nets";
import * as sftp from "../custom_modules/sftp";
import sinon, { SinonFake, SinonSpy } from "sinon";
import express from "express";
import { expect } from "chai";
import request from "supertest";
import { DateTime } from "luxon";

const avtalegiro = require("../custom_modules/avtalegiro");
const mail = require("../custom_modules/mail");

describe("POST /scheduled/avtalegiro/retry", function () {
  const mockAgreements = [
    {
      id: 1,
      KID: "002556289731589",
      claimDate: 10,
      amount: 50000,
      notice: true,
      active: true,
    },
    {
      id: 2,
      KID: "000638723319577",
      claimDate: 10,
      amount: 340000,
      notice: false,
      active: true,
    },
    {
      id: 3,
      KID: "000675978627833",
      claimDate: 10,
      amount: 5000000,
      notice: true,
      active: true,
    },
  ];

  const fakeFiles = [
    {
      name: "KV.GODKJENT.F0000649.D230509.T133148.K5552827.html",
    },
    {
      name: "KV.GODKJENT.F0000650.D230509.T133148.K5552827.html",
    },
    {
      name: "KV.GODKJENT.F0000651.D230509.T133148.K5552827.html",
    },
  ];

  let server;

  let avtalegiroFileStub;
  let sendNotificationStub;
  let shipmentStub;
  let agreementsStub;
  let loggingStub;
  let sendFileStub;
  let getShipmentIdsStub;
  let sendMailBackupStub;
  let authStub;
  let dueDateStub;
  let getConnectionStub;
  let sftpListFake: SinonSpy;
  let sftpEndFake;

  before(function () {
    authStub = sinon.replace(authMiddleware, "isAdmin", []);

    avtalegiroFileStub = sinon
      .stub(avtalegiro, "generateAvtaleGiroFile")
      .resolves(Buffer.from("", "utf-8"));

    sendNotificationStub = sinon.stub(mail, "sendAvtalegiroNotification").resolves(true);

    shipmentStub = sinon.stub(DAO.avtalegiroagreements, "addShipment").resolves(42);

    getShipmentIdsStub = sinon.stub(DAO.avtalegiroagreements, "getShipmentIDs");

    agreementsStub = sinon.stub(DAO.avtalegiroagreements, "getByPaymentDate");

    sftpListFake = sinon.fake.resolves([]);
    sftpEndFake = sinon.fake.resolves(true);
    getConnectionStub = sinon.stub(sftp, "getConnection").resolves({
      list: sftpListFake,
      end: sftpEndFake,
    });

    dueDateStub = sinon.stub(avtalegiro, "getDueDates");

    loggingStub = sinon.stub(DAO.logging, "add").resolves();

    sendFileStub = sinon.stub(nets, "sendFile");

    sendMailBackupStub = sinon.stub(mail, "sendOcrBackup");

    const scheduledRoute = require("../routes/scheduled");
    server = express();
    server.use("/scheduled", scheduledRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should not retry if no claim dates for date", async () => {
    dueDateStub.returns([]);
    getShipmentIdsStub.resolves([]);

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(dueDateStub.calledOnce).to.be.true;
    expect(agreementsStub.called).to.be.false;
    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
  });

  it("Should attempt retry if claim dates for date, but ignore if reciept is present", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);

    agreementsStub.resolves(mockAgreements);
    getShipmentIdsStub.resolves([651]);
    sftpListFake = sinon.fake(() => [fakeFiles[0], fakeFiles[1], fakeFiles[2]]);
    getConnectionStub.resolves({
      list: sftpListFake,
      end: sftpEndFake,
    });

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(dueDateStub.calledOnce).to.be.true;
    expect(agreementsStub.calledOnce).to.be.false;
    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
    expect(sftpListFake.called).to.be.true;
    expect(sftpListFake.callCount).to.be.eq(1);
  });

  it("Should attempt retry if claim dates for date and send new file if reciept is missing", async () => {
    dueDateStub.returns([DateTime.fromISO("2023-05-16")]);

    agreementsStub.resolves(mockAgreements);
    getShipmentIdsStub.resolves([651]);
    sftpListFake = sinon.fake(() => [fakeFiles[0], fakeFiles[1]]);
    getConnectionStub.resolves({
      list: sftpListFake,
      end: sftpEndFake,
    });

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(dueDateStub.calledOnce).to.be.true;
    expect(agreementsStub.calledOnce).to.be.true;
    expect(sendFileStub.called).to.be.true;
    expect(sendFileStub.callCount).to.be.eq(1);
    expect(sftpListFake.called).to.be.true;
    expect(sftpListFake.callCount).to.be.eq(1);
  });

  it("Retries for all claim dates missing reciept", async () => {
    dueDateStub.returns([
      DateTime.fromISO("2023-05-16"),
      DateTime.fromISO("2023-05-17"),
      DateTime.fromISO("2023-05-18"),
    ]);

    agreementsStub.resolves(mockAgreements);
    getShipmentIdsStub.resolves([650, 651, 652]);
    sftpListFake = sinon.fake(() => [fakeFiles[0], fakeFiles[1]]);
    getConnectionStub.resolves({
      list: sftpListFake,
      end: sftpEndFake,
    });

    await request(server).post("/scheduled/avtalegiro/retry?date=2023-05-10").expect(200);

    expect(dueDateStub.calledOnce).to.be.true;
    expect(agreementsStub.called).to.be.true;
    expect(sendFileStub.callCount).to.be.eq(2);
    expect(sftpListFake.called).to.be.true;
    expect(sftpListFake.callCount).to.be.eq(3);
  });

  after(() => {
    sinon.restore();
  });
});
