import { describe, it, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import * as autogiro from "../custom_modules/autogiro";
import { AutoGiroParser, AutoGiroContent } from "../custom_modules/parsers/autogiro";
import paymentMethods from "../enums/paymentMethods";
import config from "../config";

const reportDate = DateTime.fromISO("2026-03-02");
const payment = {
  payerNumber: "1234567",
  paymentDate: "20260228",
  amount: 30000,
  paymentReference: " 555 ",
};

describe("processAutogiroDeposit()", () => {
  let getChargeStub: sinon.SinonStub;
  let completeStub: sinon.SinonStub;
  let addDonationStub: sinon.SinonStub;
  let legacyExistsStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(DAO.distributions, "KIDexists").resolves(true);
    getChargeStub = sinon.stub(DAO.autogiroagreements, "getAgreementChargeById");
    sinon.stub(DAO.autogiroagreements, "getAgreementById").resolves({ KID: "1234567" } as any);
    completeStub = sinon
      .stub(DAO.autogiroagreements, "completeAgreementChargeWithDonation")
      .resolves(99);
    addDonationStub = sinon.stub(DAO.donations, "add").resolves(98);
    legacyExistsStub = sinon.stub(DAO.donations, "externalPaymentIDExists").resolves(false);
  });

  afterEach(() => sinon.restore());

  it("records a charge's payment under a key that doesn't depend on the report date", async () => {
    getChargeStub.resolves({ ID: 555, agreementID: 1, status: "PENDING" });

    const result = await autogiro.processAutogiroDeposit(payment, reportDate);

    expect(result.valid).to.be.true;
    expect(completeStub.calledOnce).to.be.true;
    expect(completeStub.args[0][0]).to.equal(555);
    expect(completeStub.args[0][1]).to.deep.include({
      KID: "1234567",
      amount: 300,
      externalPaymentID: "autogiro.charge.555",
    });
    expect(addDonationStub.called).to.be.false;
  });

  it("skips a charge that is already completed", async () => {
    getChargeStub.resolves({ ID: 555, agreementID: 1, status: "COMPLETED" });

    const result = await autogiro.processAutogiroDeposit(payment, reportDate);

    expect(result).to.deep.equal({ valid: false, reason: "EXISTING_DONATION" });
    expect(completeStub.called).to.be.false;
  });

  it("skips a payment already recorded under the old report-date key", async () => {
    getChargeStub.resolves({ ID: 555, agreementID: 1, status: "PENDING" });
    legacyExistsStub.resolves(true);

    const result = await autogiro.processAutogiroDeposit(payment, reportDate);

    expect(legacyExistsStub.args[0]).to.deep.equal([
      "autogiro.20260302.555",
      paymentMethods.autoGiro,
    ]);
    expect(result).to.deep.equal({ valid: false, reason: "EXISTING_DONATION" });
    expect(completeStub.called).to.be.false;
  });

  it("uses the old key when the reference is not one of this payer's charges", async () => {
    getChargeStub.resolves({ ID: 555, agreementID: 2, status: "COMPLETED" });
    (DAO.autogiroagreements.getAgreementById as sinon.SinonStub).resolves({ KID: "999" });

    const result = await autogiro.processAutogiroDeposit(payment, reportDate);

    expect(result.valid).to.be.true;
    expect(completeStub.called).to.be.false;
    expect(addDonationStub.args[0][4]).to.equal("autogiro.20260302.555");
  });
});

describe("processAutogiroInputFile() rejected charges", () => {
  afterEach(() => sinon.restore());

  it("counts an unknown charge instead of failing on it", async () => {
    sinon.stub(AutoGiroParser, "parse").returns({
      reportContents: AutoGiroContent.REJECTED_CHARGES,
      openingRecord: {},
      rejectedCharges: [{ paymentReference: 404 }],
    } as any);
    sinon.stub(DAO.autogiroagreements, "getAgreementChargeById").resolves(undefined);
    const failedStub = sinon.stub(DAO.autogiroagreements, "setAgreementChargeFailed");

    const result: any = await autogiro.processAutogiroInputFile("");

    expect(result.results).to.deep.equal({ rejectedCharges: 1, failedRejectedCharges: 0 });
    expect(failedStub.called).to.be.false;
  });
});

describe("createAutoGiroShipment()", () => {
  let connection: { query: sinon.SinonStub; release: sinon.SinonStub };
  let addChargeStub: sinon.SinonStub;

  function withLock(acquired: number) {
    connection.query.withArgs(sinon.match(/GET_LOCK/)).resolves([[{ acquired }]]);
  }

  beforeEach(() => {
    connection = { query: sinon.stub().resolves([[]]), release: sinon.stub() };
    sinon.stub(config, "autogiro_customer_number").value("123456");
    sinon.stub(config, "autogiro_bankgiro_number").value("1234567");
    sinon.stub(DAO, "startTransaction").resolves(connection as any);
    sinon.stub(DAO.logging, "add").resolves(1 as any);
    sinon
      .stub(DAO.autogiroagreements, "getAgreementsToCharge")
      .resolves([
        { ID: 1, KID: "1234567", amount: 300, payment_date: 25, created: new Date("2025-01-01") },
      ] as any);
    sinon.stub(DAO.autogiroagreements, "getMandatesByStatus").resolves([]);
    sinon.stub(DAO.autogiroagreements, "getAmendmentCandidates").resolves([]);
    sinon
      .stub(DAO.autogiroagreements, "getAgreementChargeByAgreementIdAndClaimDate")
      .resolves(undefined);
    sinon.stub(DAO.autogiroagreements, "addShipment").resolves(7);
    addChargeStub = sinon.stub(DAO.autogiroagreements, "addAgreementCharge").resolves(70);
  });

  afterEach(() => sinon.restore());

  const queries = () => connection.query.args.map((args) => String(args[0]));

  it("writes the shipment and charges on one transaction and commits", async () => {
    withLock(1);

    const result = await autogiro.createAutoGiroShipment();

    expect(result.shipmentID).to.equal(7);
    expect((DAO.autogiroagreements.addShipment as sinon.SinonStub).args[0][1]).to.equal(connection);
    expect(addChargeStub.args[0][1]).to.equal(connection);
    expect(queries()).to.include("COMMIT");
    expect(queries().some((q) => q.includes("RELEASE_LOCK"))).to.be.true;
    expect(connection.release.calledOnce).to.be.true;
  });

  it("refuses to run while another shipment is being created", async () => {
    withLock(0);

    let error: unknown;
    try {
      await autogiro.createAutoGiroShipment();
    } catch (ex) {
      error = ex;
    }

    expect(error).to.be.instanceOf(Error);
    expect((DAO.autogiroagreements.addShipment as sinon.SinonStub).called).to.be.false;
    expect(queries().some((q) => q.includes("RELEASE_LOCK"))).to.be.false;
    expect(connection.release.calledOnce).to.be.true;
  });

  it("rolls back everything if the file can't be generated", async () => {
    withLock(1);
    addChargeStub.rejects(new Error("insert failed"));

    let error: unknown;
    try {
      await autogiro.createAutoGiroShipment();
    } catch (ex) {
      error = ex;
    }

    expect(error).to.be.instanceOf(Error);
    expect(queries()).to.include("ROLLBACK");
    expect(queries()).not.to.include("COMMIT");
    expect(queries().some((q) => q.includes("RELEASE_LOCK"))).to.be.true;
    expect(connection.release.calledOnce).to.be.true;
  });
});

describe("AutoGiro agreement routes", () => {
  let server: express.Express;
  let setBothStub: sinon.SinonStub;
  let setAmountStub: sinon.SinonStub;
  let replaceStub: sinon.SinonStub;

  beforeAll(() => {
    sinon.stub(authMiddleware, "auth").returns([]);
    sinon.replace(authMiddleware, "isAdmin", [] as any);
    sinon
      .stub(authMiddleware, "checkDonorOwnsDistribution")
      .callsFake((_kid, _req, _res, next) => next());
    const router = require("../routes/autogiro");
    server = express();
    server.use(express.json());
    server.use("/autogiro", router);
  });

  afterAll(() => sinon.restore());

  beforeEach(() => {
    setBothStub = sinon
      .stub(DAO.autogiroagreements, "setAgreementAmountAndPaymentDateByKID")
      .resolves(true);
    setAmountStub = sinon.stub(DAO.autogiroagreements, "setAgreementAmountByKID").resolves(true);
    replaceStub = sinon.stub(DAO.autogiroagreements, "replaceAgreementDistribution");
    sinon.stub(DAO.autogiroagreements, "getAgreementByKID").resolves({ KID: "123" } as any);
  });

  afterEach(() => {
    setBothStub.restore();
    setAmountStub.restore();
    replaceStub.restore();
    (DAO.autogiroagreements.getAgreementByKID as sinon.SinonStub).restore();
  });

  it("PUT updates the amount without a distribution in the body", async () => {
    await request(server).put("/autogiro/123/").send({ amount: 300 }).expect(200);

    expect(setBothStub.calledOnceWith("123", { amount: 300, paymentDate: null })).to.be.true;
    expect(replaceStub.called).to.be.false;
  });

  it("PUT changes nothing if any value is invalid", async () => {
    await request(server).put("/autogiro/123/").send({ amount: 300, paymentDate: 31 }).expect(400);

    expect(setBothStub.called).to.be.false;
  });

  it("POST /:KID/amount rejects a missing or non-numeric amount", async () => {
    await request(server).post("/autogiro/123/amount").send({}).expect(400);
    await request(server).post("/autogiro/123/amount").send({ amount: "abc" }).expect(400);

    expect(setAmountStub.called).to.be.false;
  });

  it("POST /:KID/amount stores øre as kroner", async () => {
    await request(server).post("/autogiro/123/amount").send({ amount: 30000 }).expect(200);

    expect(setAmountStub.calledOnceWith("123", 300)).to.be.true;
  });
});
