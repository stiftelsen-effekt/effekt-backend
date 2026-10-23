import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";

const vipps = require("../custom_modules/vipps");

describe("POST /vipps/v2/payments/:orderId (eCom v2 callback)", () => {
  const orderId = "12345678-1700000000000";
  const authToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  let server: express.Express;
  let getOrderStub: sinon.SinonStub;
  let getOrderDetailsStub: sinon.SinonStub;
  let captureOrderStub: sinon.SinonStub;

  const reserveLogItem = {
    operation: "RESERVE",
    operationSuccess: true,
    amount: 100000,
    transactionId: "t1",
    timeStamp: new Date("2026-01-01T00:00:00Z"),
  };

  const callbackBody = (status: string, amount = 100) => ({
    orderId,
    transactionInfo: { status, amount, transactionId: "t1", timeStamp: "2026-01-01T00:00:00Z" },
  });

  beforeEach(() => {
    getOrderStub = sinon.stub(DAO.vipps, "getOrder");
    getOrderStub.resolves(false);
    getOrderStub
      .withArgs(orderId)
      .resolves({ orderID: orderId, KID: "12345678", token: authToken });
    getOrderDetailsStub = sinon
      .stub(vipps, "getOrderDetails")
      .resolves({ transactionLogHistory: [reserveLogItem] });
    captureOrderStub = sinon.stub(vipps, "captureOrder").resolves(true);

    const vippsRouter = require("../routes/vipps");
    server = express();
    server.use("/vipps", vippsRouter);
    server.use((err, req, res, next) => res.status(500).json({ status: 500 }));
  });

  afterEach(() => sinon.restore());

  it("captures the amount reserved at Vipps for a genuine callback, ignoring the body amount", async () => {
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", authToken)
      .send(callbackBody("RESERVED", 1))
      .expect(200);

    expect(getOrderDetailsStub.calledOnceWith(orderId)).to.be.true;
    expect(captureOrderStub.calledOnce).to.be.true;
    expect(captureOrderStub.args[0][0]).to.equal(orderId);
    expect(captureOrderStub.args[0][1].amount).to.equal(100000);
  });

  it("rejects callbacks without the order's auth token", async () => {
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .send(callbackBody("RESERVED"))
      .expect(401);
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", "not-the-token")
      .send(callbackBody("RESERVED"))
      .expect(401);

    expect(getOrderDetailsStub.called).to.be.false;
    expect(captureOrderStub.called).to.be.false;
  });

  it("rejects callbacks for orders without a stored auth token", async () => {
    getOrderStub.withArgs(orderId).resolves({ orderID: orderId, KID: "12345678", token: null });
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", "")
      .send(callbackBody("RESERVED"))
      .expect(401);
    expect(captureOrderStub.called).to.be.false;
  });

  it("returns 404 for unknown orders", async () => {
    await request(server)
      .post(`/vipps/v2/payments/99999999-1`)
      .set("Authorization", authToken)
      .send({ ...callbackBody("RESERVED"), orderId: "99999999-1" })
      .expect(404);
    expect(captureOrderStub.called).to.be.false;
  });

  it("returns 400 for malformed callbacks instead of crashing", async () => {
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", authToken)
      .send({ orderId })
      .expect(400);
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", authToken)
      .send({ ...callbackBody("RESERVED"), orderId: "other" })
      .expect(400);
    expect(captureOrderStub.called).to.be.false;
  });

  it("does not capture when Vipps has no reservation for the order", async () => {
    getOrderDetailsStub.resolves({ transactionLogHistory: [] });
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", authToken)
      .send(callbackBody("RESERVED"))
      .expect(200);
    expect(captureOrderStub.called).to.be.false;
  });

  it("acknowledges other statuses without capturing", async () => {
    await request(server)
      .post(`/vipps/v2/payments/${orderId}`)
      .set("Authorization", authToken)
      .send(callbackBody("CANCELLED"))
      .expect(200);
    expect(getOrderDetailsStub.called).to.be.false;
    expect(captureOrderStub.called).to.be.false;
  });
});
