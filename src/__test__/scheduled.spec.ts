import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import sinon from "sinon";
import express from "express";
import { expect } from "chai";
import * as nets from "../custom_modules/nets";
import request from "supertest";

const avtalegiro = require("../custom_modules/avtalegiro");
const mail = require("../custom_modules/mail");
const config = require("../config");

describe("POST /scheduled/avtalegiro", function () {
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

  let server;

  let avtalegiroFileStub;
  let sendNotificationStub;
  let shipmentStub;
  let agreementsStub;
  let loggingStub;
  let sendFileStub;
  let sendMailBackupStub;
  let authStub;

  before(function () {
    authStub = sinon.replace(authMiddleware, "isAdmin", []);

    avtalegiroFileStub = sinon
      .stub(avtalegiro, "generateAvtaleGiroFile")
      .resolves(Buffer.from("", "utf-8"));

    sendNotificationStub = sinon.stub(mail, "sendAvtalegiroNotification").resolves(true);

    shipmentStub = sinon.stub(DAO.avtalegiroagreements, "addShipment").resolves(42);

    agreementsStub = sinon.stub(DAO.avtalegiroagreements, "getByPaymentDate");
    agreementsStub.withArgs(29).resolves([]);
    agreementsStub.withArgs(30).resolves([]);
    agreementsStub.withArgs(31).resolves([]);

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

  it("Does nothing with no agreements", async function () {
    agreementsStub.resolves([]);

    const response = await request(server)
      .post("/scheduled/avtalegiro?date=2021-10-04")
      .expect(200);

    expect(agreementsStub.calledOnce).to.be.true;
    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.called).to.be.false;
    expect(loggingStub.calledOnce).to.be.true;
    expect(sendMailBackupStub.calledOnce).to.be.true;
  });

  it("Generates claim file when provided a date", async function () {
    agreementsStub.resolves(mockAgreements);

    const response = await request(server)
      .post("/scheduled/avtalegiro/?date=2021-10-04")
      .expect(200);

    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.calledOnce).to.be.true;
  });

  /**
   * We are required to deliver files four banking days before the claim date.
   * This means that if the claim date is a saturday or sunday, we need to deliver
   * the file on the tuesday before. Same goes for the following monday.
   */
  it("Generates multiple claims files when provided a tuesday", async function () {
    agreementsStub.resolves(mockAgreements);

    const response = await request(server)
      .post("/scheduled/avtalegiro/?date=2021-10-05")
      .expect(200);

    expect(sendNotificationStub.called).to.be.false;
    expect(sendFileStub.callCount).to.be.eq(3);
  });

  it("Notifies claimants when they have asked for it", async function () {
    agreementsStub.resolves(mockAgreements);

    // Used to force mail to be sent (but method is stubbed)
    let tempEnv = config.env;
    config.env = "production";

    const response = await request(server)
      .post("/scheduled/avtalegiro/?date=2021-10-04&notify=true")
      .expect(200);

    config.env = tempEnv;

    expect(sendNotificationStub.callCount).to.be.equal(2);
    expect(sendFileStub.calledOnce).to.be.true;
  });

  it("Recognizes when claim date is last day of the month", async function () {
    agreementsStub.withArgs(0).resolves(mockAgreements);

    const response = await request(server)
      .post("/scheduled/avtalegiro/?date=2022-09-26&notify=true")
      .expect(200);

    sinon.assert.calledWithExactly(agreementsStub, 0);
    sinon.assert.calledWithExactly(shipmentStub, mockAgreements.length);
  });

  it("Includes the 28th when the 28th is last day of month", async function () {
    const respnse = await request(server)
      .post("/scheduled/avtalegiro/?date=2022-02-22&notify=true")
      .set("Authorization", "Bearer abc")
      .expect(200);

    sinon.assert.calledWithExactly(agreementsStub, 0);
    sinon.assert.calledWithExactly(agreementsStub, 28);
    // Should have 2x mock agreements, one x for the last of the month, one x for the 28th
    sinon.assert.calledWithExactly(shipmentStub, mockAgreements.length * 2);
  });

  after(function () {
    sinon.restore();
  });
});
