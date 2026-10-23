import { expect } from "chai";
import { roundSum } from "../custom_modules/parsers/facebook";

describe("Facebook import rounding tests", () => {
  it("Should round to within 5.1% error from actual sum", () => {
    // Testing 3% error margin rounding with random numbers gradually increasing in order of magnitude
    expect(roundSum(10.2)).to.equal(10);
    expect(roundSum(47.5)).to.equal(50);
    expect(roundSum(87)).to.equal(90);
    expect(roundSum(103.2)).to.equal(100);
    expect(roundSum(134.2)).to.equal(130);
    expect(roundSum(251.2)).to.equal(250);
    expect(roundSum(289.2)).to.equal(300);
    expect(roundSum(934.2)).to.equal(900);
    expect(roundSum(1020.2)).to.equal(1000);
  });
});

describe("POST /facebook/register/payment", () => {
  // Lazily required so that authMiddleware.auth can be stubbed before the router is built
  const express = require("express");
  const request = require("supertest");
  const sinon = require("sinon");
  const authMiddleware = require("../custom_modules/authorization/authMiddleware");
  const { DAO } = require("../custom_modules/DAO");
  const config = require("../config");

  let server;
  let registerStub;
  let addTaxUnitStub;
  let transferStub;

  const payloadFor = (donorId: number | null, permissions: string[] = ["write:profile"]) =>
    JSON.stringify({ [String(config.authUserIdClaim)]: donorId, permissions });

  const body = {
    paymentID: "1234567890123456",
    email: "jack@example.test",
    name: "Jack",
    ssn: "1",
  };

  beforeEach(() => {
    // Fake JWT verification: the test passes the decoded payload in a header
    sinon.stub(authMiddleware, "auth").returns([
      (req, res, next) => {
        const header = req.headers["x-test-jwt-payload"];
        if (!header) return res.status(401).json({ status: 401 });
        req.auth = { payload: JSON.parse(header) };
        next();
      },
    ]);
    delete require.cache[require.resolve("../routes/facebook")];
    const facebookRouter = require("../routes/facebook");
    server = express();
    server.use(express.json());
    server.use("/facebook", facebookRouter);

    sinon
      .stub(DAO.donors, "getIDbyEmail")
      .callsFake(async (email) => (email === body.email ? 237 : null));
    sinon.stub(DAO.donors, "getByID").resolves({ id: 237 });
    sinon.stub(DAO.donors, "add").resolves(500);
    sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves({ id: 10 });
    addTaxUnitStub = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
    registerStub = sinon.stub(DAO.facebook, "registerPaymentFB").resolves();
    sinon.stub(DAO.donors, "getByFacebookPayment").resolves(null);
    transferStub = sinon.stub(DAO.donations, "transferDonationsFromDummy").resolves();
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[require.resolve("../routes/facebook")];
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(server).post("/facebook/register/payment").send(body);
    expect(res.status).to.equal(401);
    expect(registerStub.called).to.be.false;
  });

  it("registers the payment for the logged-in donor's own email", async () => {
    const res = await request(server)
      .post("/facebook/register/payment")
      .set("x-test-jwt-payload", payloadFor(237))
      .send(body);
    expect(res.status).to.equal(200);
    expect(registerStub.calledOnceWith(237, body.paymentID, 10)).to.be.true;
  });

  it("rejects registering a payment on another donor's email", async () => {
    const res = await request(server)
      .post("/facebook/register/payment")
      .set("x-test-jwt-payload", payloadFor(999))
      .send(body);
    expect(res.status).to.equal(403);
    expect(registerStub.called).to.be.false;
    expect(addTaxUnitStub.called).to.be.false;
    expect(transferStub.called).to.be.false;
  });

  it("rejects non-admins registering a payment for an unknown email", async () => {
    const res = await request(server)
      .post("/facebook/register/payment")
      .set("x-test-jwt-payload", payloadFor(237))
      .send({ ...body, email: "someone-new@example.test" });
    expect(res.status).to.equal(403);
    expect(registerStub.called).to.be.false;
  });

  it("allows admins to register on behalf of other donors", async () => {
    const res = await request(server)
      .post("/facebook/register/payment")
      .set("x-test-jwt-payload", payloadFor(null, ["admin"]))
      .send(body);
    expect(res.status).to.equal(200);
    expect(registerStub.calledOnce).to.be.true;
  });
});
