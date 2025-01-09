import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import sinon from "sinon";
import express from "express";
import { expect } from "chai";
import * as nets from "../custom_modules/nets";
import request from "supertest";
import { initialpaymentmethod } from "../custom_modules/DAO_modules/initialpaymentmethod";
import { donations } from "../custom_modules/DAO_modules/donations";
import paymentMethods from "../enums/paymentMethods";
import Decimal from "decimal.js";
import { donors } from "../custom_modules/DAO_modules/donors";

const avtalegiro = require("../custom_modules/avtalegiro");
const mail = require("../custom_modules/mail");
const config = require("../config");

describe("POST /scheduled/avtalegiro", function () {
  const mockAgreements = [
    {
      id: 1,
      KID: "002556289731589",
      paymentDate: 10,
      amount: 50000,
      notice: true,
      active: true,
    },
    {
      id: 2,
      KID: "000638723319577",
      paymentDate: 10,
      amount: 340000,
      notice: false,
      active: true,
    },
    {
      id: 3,
      KID: "000675978627833",
      paymentDate: 10,
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
    this.timeout(5000);

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

describe("POST /initiate-follow-ups", function () {
  let server;
  let getPaymentIntentsFromLastMonthStub;
  let getFollowUpsForPaymentIntentStub;
  let addPaymentFollowUpStub;
  let sendDonationFollowUpStub;
  let getDonorByKidStub;
  let donorDonationsStub;

  before(function () {
    this.timeout(5000);

    server = express();
    const scheduledRoute = require("../routes/scheduled");
    server = express();
    server.use("/scheduled", scheduledRoute);

    getPaymentIntentsFromLastMonthStub = sinon.stub(
      initialpaymentmethod,
      "getPaymentIntentsFromLastMonth",
    );
    getFollowUpsForPaymentIntentStub = sinon.stub(
      initialpaymentmethod,
      "getFollowUpsForPaymentIntent",
    );
    donorDonationsStub = sinon.stub(donations, "getByDonorId");
    addPaymentFollowUpStub = sinon.stub(initialpaymentmethod, "addPaymentFollowUp");
    sendDonationFollowUpStub = sinon.stub(mail, "sendPaymentIntentFollowUp");
    getDonorByKidStub = sinon.stub(donors, "getByKID");

    const donor = {
      id: 1,
      email: "donor@mcdonorson.com",
      name: "Donor mc donorson",
      registered: new Date(),
    };

    getDonorByKidStub.resolves(donor);
  });

  afterEach(function () {
    // Reset the history of stubs after each test
    sinon.resetHistory();
  });

  after(function () {
    // Restore the original functions after all tests
    sinon.restore();
  });

  it("should initiate follow-ups for eligible payment intents", async function () {
    // Mock data
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        Id: 2,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(20000),
        KID_fordeling: "002",
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    donorDonationsStub.resolves([]);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");
    expect(sendDonationFollowUpStub.callCount).to.equal(2);
    expect(addPaymentFollowUpStub.callCount).to.equal(2);
  });

  it("should not initiate follow-ups for payment intents with received donations", async function () {
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];

    const recievedDonations = [
      {
        id: 1,
        donor: "Donor mc donorson",
        donorId: 1,
        email: "donor@mcdonorson.com",
        sum: 15000,
        transactionCost: 2,
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        paymentMethod: 2,
        KID: "001",
        taxUnitId: 321,
        metaOwnerId: 1,
      },
    ];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    donorDonationsStub.resolves(recievedDonations);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");
    expect(addPaymentFollowUpStub.called).to.be.false;
    expect(sendDonationFollowUpStub.called).to.be.false;
  });

  it("should not initiate follow-ups for payment intents where the donor has donated any donations after the intent", async function () {
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];

    // A donation that was made after the payment intent, but with a different KID
    const recievedDonations = [
      {
        id: 1,
        donor: "Donor mc donorson",
        donorId: 1,
        email: "donor@mcdonorson.com",
        sum: 120,
        transactionCost: 2,
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        paymentMethod: 5,
        KID: "123",
        taxUnitId: null,
        metaOwnerId: 1,
      },
    ];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    donorDonationsStub.resolves(recievedDonations);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");
    expect(addPaymentFollowUpStub.called).to.be.false;
    expect(sendDonationFollowUpStub.called).to.be.false;
  });

  it("should not initiate follow-ups for payment intents that are not due yet", async function () {
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(),
      },
    ];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");
    expect(addPaymentFollowUpStub.called).to.be.false;
    expect(sendDonationFollowUpStub.called).to.be.false;
  });

  it("should not initiate follow-ups for payment intents that have reached the max follow-ups", async function () {
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];
    const followUps = [{ Follow_up_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves(followUps);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");
    expect(addPaymentFollowUpStub.called).to.be.false;
    expect(sendDonationFollowUpStub.called).to.be.false;
  });

  it("should initiate only one follow-up for multiple intents with the same KID within 30 days", async function () {
    // Mock data with two payment intents for the same KID
    const paymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      },
      {
        Id: 2,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(20000),
        KID_fordeling: "001", // Same KID as the first intent
        timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      },
      {
        Id: 3,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(10000),
        KID_fordeling: "002", // Different KID
        timestamp: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000), // 22 days ago
      },
    ];

    getPaymentIntentsFromLastMonthStub.resolves(paymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    donorDonationsStub.resolves([]);
    sendDonationFollowUpStub.resolves(true);

    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");

    // Check that only two follow-ups were initiated (one for KID "001" and one for KID "002")
    expect(sendDonationFollowUpStub.callCount).to.equal(2);
    expect(addPaymentFollowUpStub.callCount).to.equal(2);

    // Verify that the follow-up was sent for the most recent intent with KID "001"
    const followUpCalls = sendDonationFollowUpStub.getCalls();
    const followUpForKID001 = followUpCalls.find((call) => call.args[0] === "001");
    expect(followUpForKID001).to.exist;
    expect(followUpForKID001.args[1]).to.equal(20000); // Amount of the most recent intent

    // Verify that a follow-up was also sent for KID "002"
    const followUpForKID002 = followUpCalls.find((call) => call.args[0] === "002");
    expect(followUpForKID002).to.exist;
    expect(followUpForKID002.args[1]).to.equal(10000);
  });

  it("should not send follow-ups for older intents of a KID after sending one for the most recent", async function () {
    // Mock data with two payment intents for the same KID
    const initialPaymentIntents = [
      {
        Id: 1,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(15000),
        KID_fordeling: "001",
        timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      },
      {
        Id: 2,
        Payment_method: paymentMethods.bank,
        Payment_amount: new Decimal(20000),
        KID_fordeling: "001", // Same KID as the first intent
        timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      },
    ];

    // Set up initial conditions
    getPaymentIntentsFromLastMonthStub.resolves(initialPaymentIntents);
    getFollowUpsForPaymentIntentStub.resolves([]);
    donorDonationsStub.resolves([]);
    sendDonationFollowUpStub.resolves(true);

    // First run of the follow-up process
    await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    // Verify that only one follow-up was sent (for the most recent intent)
    expect(sendDonationFollowUpStub.callCount).to.equal(1);
    expect(addPaymentFollowUpStub.callCount).to.equal(1);
    expect(sendDonationFollowUpStub.firstCall.args[1]).to.equal(20000); // Amount of the most recent intent

    // Reset call counts
    sendDonationFollowUpStub.resetHistory();
    addPaymentFollowUpStub.resetHistory();

    // Set up conditions for the second run

    // The newer intent now has a follow-up recorded
    getFollowUpsForPaymentIntentStub.withArgs(2).resolves([{ Follow_up_date: new Date() }]);

    // Second run of the follow-up process
    const response = await request(server).post("/scheduled/initiate-follow-ups").expect(200);

    expect(response.body.message).to.equal("Follow-up process initiated successfully.");

    // Check that no new follow-ups were sent
    expect(sendDonationFollowUpStub.callCount).to.equal(0);
    expect(addPaymentFollowUpStub.callCount).to.equal(0);
  });
});
