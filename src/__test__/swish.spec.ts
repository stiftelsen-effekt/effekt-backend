import { Swish_orders } from "@prisma/client";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import config from "../config";
import { DAO } from "../custom_modules/DAO";
import * as swish from "../custom_modules/swish";
import * as fetch from "node-fetch";
import * as mail from "../custom_modules/mail";
import { initiateOrder } from "../custom_modules/swish";
import swishRouter from "../routes/swish";
import paymentMethods from "../enums/paymentMethods";
import { DateTime } from "luxon";

describe("swish", () => {
  describe("initiateOrder()", () => {
    let fetchStub: sinon.SinonStub;
    let getByKIDStub: sinon.SinonStub;
    let addOrderStub: sinon.SinonStub;

    function withCreatePaymentRequestResponse(data: { status: number; token?: string }) {
      fetchStub.resolves({
        status: data.status,
        headers: new Map([["paymentrequesttoken", data.token]]) as any,
        json: () => Promise.resolve({}),
      } as Response);
    }

    function withDonor(donor: Partial<Awaited<ReturnType<typeof DAO.donors.getByKID>>>) {
      getByKIDStub.resolves(donor as any);
    }

    beforeEach(() => {
      fetchStub = sinon.stub(fetch, "default");
      getByKIDStub = sinon.stub(DAO.donors, "getByKID");
      addOrderStub = sinon.stub(DAO.swish, "addOrder");

      withDonor({ id: 1 });
      withCreatePaymentRequestResponse({ status: 201 });
    });

    it("should add order if donor has phone and payment request is successful", async () => {
      const KID = "1234567890";
      const donorId = 1323;

      withDonor({
        id: donorId,
      });

      await initiateOrder(KID, { amount: 100 });

      expect(addOrderStub.called).to.be.true;
      expect(addOrderStub.args[0][0]).to.contain({
        donorID: donorId,
        KID,
      });
    });

    it("should call swish payment request endpoint", async () => {
      const amount = 100;

      await initiateOrder("1234567890", { amount });

      expect(fetchStub.called).to.be.true;
      const body = JSON.parse(fetchStub.args[0][1].body);
      expect(body).to.contain({
        amount,
      });
    });

    it("should generate a reference number prefixed by current date", async () => {
      const date = new Date("2020-01-01T00:00:00.000Z");
      sinon.useFakeTimers(date.getTime());

      await initiateOrder("1234567890", { amount: 100 });

      expect(fetchStub.called).to.be.true;
      const body = JSON.parse(fetchStub.args[0][1].body);
      const reference = body.payeePaymentReference;
      expect(reference.slice(0, 6)).to.equal("200101");
      expect(reference.length).to.equal(11);
      expect(reference).to.match(/^[0-9]+$/);
    });

    it("should throw error if no donor found with KID", async () => {
      withDonor(null);

      try {
        await initiateOrder("1234567890", { amount: 100 });
        throw new Error("Promise did not reject as expected");
      } catch (err) {
        expect(err.message).to.contain("Could not find donor");
      }
    });

    it("should throw error if payment request is unsuccessful", async () => {
      withCreatePaymentRequestResponse({ status: 400 });

      try {
        await initiateOrder("1234567890", { amount: 100 });
        throw new Error("Promise did not reject as expected");
      } catch (err) {
        expect(err.message).to.contain("Could not initiate payment");
      }
    });
  });

  describe("handleOrderStatusUpdate()", () => {
    let getOrderByInstructionUUIDStub: sinon.SinonStub;
    let updateOrderStatusStub: sinon.SinonStub;
    let updateOrderDonationIdStub: sinon.SinonStub;
    let sendDonationReceiptStub: sinon.SinonStub;
    let addDonationStub: sinon.SinonStub;

    beforeEach(() => {
      getOrderByInstructionUUIDStub = sinon.stub(DAO.swish, "getOrderByInstructionUUID");
      updateOrderStatusStub = sinon.stub(DAO.swish, "updateOrderStatus");
      updateOrderDonationIdStub = sinon.stub(DAO.swish, "updateOrderDonationId");
      sendDonationReceiptStub = sinon.stub(mail, "sendDonationReceipt");
      addDonationStub = sinon.stub(DAO.donations, "add");
    });

    function withOrder(
      order: Partial<Awaited<ReturnType<typeof DAO.swish.getOrderByInstructionUUID>>> | null,
    ) {
      getOrderByInstructionUUIDStub.resolves(order as any);
    }

    function withAddedDonationId(id: number) {
      addDonationStub.resolves(id);
    }

    it("should update order status", async () => {
      const status = "CANCELLED";
      const orderId = 123;
      withOrder({ ID: orderId });

      await swish.handleOrderStatusUpdate("", { status, amount: 100 });

      expect(updateOrderStatusStub.called).to.be.true;
      expect(updateOrderStatusStub.args[0][0]).to.equal(orderId);
      expect(updateOrderStatusStub.args[0][1]).to.equal(status);
    });

    it('should create a donation if status is "PAID"', async () => {
      const order = {
        KID: "1234567890",
        registered: DateTime.fromISO("2020-01-01T00:00:00.000Z").toJSDate(),
        reference: "20010112345",
      };
      const amount = 123;
      withOrder(order);

      await swish.handleOrderStatusUpdate("", { status: "PAID", amount });

      expect(addDonationStub.called).to.be.true;
      expect(addDonationStub.args[0][0]).to.equal(order.KID);
      expect(addDonationStub.args[0][1]).to.equal(paymentMethods.swish);
      expect(addDonationStub.args[0][2]).to.equal(amount);
      expect(addDonationStub.args[0][3]).to.equal(order.registered);
      expect(addDonationStub.args[0][4]).to.equal(order.reference);
    });

    it('should send donation receipt if status is "PAID"', async () => {
      const donationId = 456;
      withOrder({ ID: 123 });
      withAddedDonationId(donationId);

      await swish.handleOrderStatusUpdate("", { status: "PAID", amount: 100 });

      expect(sendDonationReceiptStub.called).to.be.true;
      expect(sendDonationReceiptStub.args[0][0]).to.equal(donationId);
    });

    it('should update order donation ID if status is "PAID"', async () => {
      const orderId = 123;
      const donationId = 456;
      withOrder({ ID: orderId });
      withAddedDonationId(donationId);

      await swish.handleOrderStatusUpdate("", { status: "PAID", amount: 100 });

      expect(updateOrderDonationIdStub.called).to.be.true;
      expect(updateOrderDonationIdStub.args[0][0]).to.equal(orderId);
      expect(updateOrderDonationIdStub.args[0][1]).to.equal(donationId);
    });

    it('should not create a donation if status is "DECLINED"', async () => {
      withOrder({ ID: 123 });

      await swish.handleOrderStatusUpdate("", { status: "DECLINED", amount: 100 });

      expect(addDonationStub.called).to.be.false;
    });

    it("should not create a donation if status is unchanged", async () => {
      withOrder({ ID: 123, status: "PAID" });

      await swish.handleOrderStatusUpdate("", { status: "PAID", amount: 100 });

      expect(addDonationStub.called).to.be.false;
    });
  });

  describe("handleCallback()", () => {
    const instructionUUID = "11A86BE70EA346E4B1C39C874173F088";
    let fetchStub: sinon.SinonStub;
    let getOrderByInstructionUUIDStub: sinon.SinonStub;
    let updateOrderStatusStub: sinon.SinonStub;
    let addDonationStub: sinon.SinonStub;
    let sendDonationReceiptStub: sinon.SinonStub;

    beforeEach(() => {
      fetchStub = sinon.stub(fetch, "default");
      getOrderByInstructionUUIDStub = sinon.stub(DAO.swish, "getOrderByInstructionUUID");
      updateOrderStatusStub = sinon.stub(DAO.swish, "updateOrderStatus");
      sinon.stub(DAO.swish, "updateOrderDonationId");
      sendDonationReceiptStub = sinon.stub(mail, "sendDonationReceipt");
      addDonationStub = sinon.stub(DAO.donations, "add").resolves(456);
    });

    function withOrder(order: any) {
      getOrderByInstructionUUIDStub.resolves(order);
    }

    function withSwishPaymentRequest(paymentRequest: any) {
      fetchStub.resolves({ json: () => Promise.resolve(paymentRequest) } as any);
    }

    const order = {
      ID: 123,
      KID: "1234567890",
      status: "CREATED",
      registered: new Date("2026-01-01T00:00:00.000Z"),
      reference: "26010112345",
    };

    it("records the donation with the amount reported by Swish for a genuine callback", async () => {
      withOrder(order);
      withSwishPaymentRequest({ status: "PAID", amount: 250 });

      await swish.handleCallback(instructionUUID);

      expect(fetchStub.calledOnce).to.be.true;
      expect(String(fetchStub.args[0][0])).to.include(`/paymentrequests/${instructionUUID}`);
      expect(addDonationStub.calledOnce).to.be.true;
      expect(addDonationStub.args[0][0]).to.equal(order.KID);
      expect(addDonationStub.args[0][2]).to.equal(250);
      expect(sendDonationReceiptStub.calledOnceWith(456)).to.be.true;
    });

    it("does not record a donation when Swish does not report the payment as paid", async () => {
      // A forged callback claiming PAID: Swish still reports the request as CREATED
      withOrder(order);
      withSwishPaymentRequest({ status: "CREATED", amount: 250 });

      await swish.handleCallback(instructionUUID);

      expect(addDonationStub.called).to.be.false;
      expect(updateOrderStatusStub.called).to.be.false;
    });

    it("does not update the order when Swish returns an error", async () => {
      withOrder(order);
      withSwishPaymentRequest([{ errorCode: "RP04", errorMessage: "Not found" }]);

      let error: unknown;
      try {
        await swish.handleCallback(instructionUUID);
      } catch (ex) {
        error = ex;
      }

      expect(error).to.be.instanceOf(Error);
      expect(updateOrderStatusStub.called).to.be.false;
      expect(addDonationStub.called).to.be.false;
    });

    it("does not call Swish for orders already in a final state (idempotent)", async () => {
      withOrder({ ...order, status: "PAID" });

      await swish.handleCallback(instructionUUID);

      expect(fetchStub.called).to.be.false;
      expect(addDonationStub.called).to.be.false;
    });

    it("ignores callbacks with an invalid or unknown id", async () => {
      await swish.handleCallback(undefined);
      await swish.handleCallback({ $ne: 1 });
      expect(getOrderByInstructionUUIDStub.called).to.be.false;

      withOrder(null);
      await swish.handleCallback(instructionUUID);
      expect(fetchStub.called).to.be.false;
      expect(addDonationStub.called).to.be.false;
    });
  });

  describe("getSwishOrder()", () => {
    let getOrderByIDStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;
    let getOrderByInstructionUUIDStub: sinon.SinonStub;
    let updateOrderStatusStub: sinon.SinonStub;
    let updateOrderDonationIdStub: sinon.SinonStub;
    let sendDonationReceiptStub: sinon.SinonStub;
    let addDonationStub: sinon.SinonStub;

    beforeEach(() => {
      getOrderByIDStub = sinon.stub(DAO.swish, "getOrderByID");
      fetchStub = sinon.stub(fetch, "default");
      getOrderByInstructionUUIDStub = sinon.stub(DAO.swish, "getOrderByInstructionUUID");
      updateOrderStatusStub = sinon.stub(DAO.swish, "updateOrderStatus");
      updateOrderDonationIdStub = sinon.stub(DAO.swish, "updateOrderDonationId");
      sendDonationReceiptStub = sinon.stub(mail, "sendDonationReceipt");
      addDonationStub = sinon.stub(DAO.donations, "add");
    });

    function withOrder(order: Partial<Awaited<ReturnType<typeof DAO.swish.getOrderByID>>> | null) {
      getOrderByIDStub.resolves(order as any);
      getOrderByInstructionUUIDStub.resolves(order as any);
    }

    function withSwishPaymentRequest(paymentRequest: any) {
      fetchStub.resolves({
        json: () => Promise.resolve(paymentRequest),
      } as any);
    }

    it("should return order if it exists", async () => {
      const order = { ID: 123, status: "PAID" } as const;
      withOrder(order);
      withSwishPaymentRequest({});

      const result = await swish.getSwishOrder(order.ID);

      expect(result).to.deep.equal(order);
    });

    it("should handle order status update", async () => {
      const order = { ID: 3, status: undefined } as const;
      const swishPaymentRequest = { status: "PAID", amount: 100 };
      withOrder(order);
      withSwishPaymentRequest(swishPaymentRequest);

      await swish.getSwishOrder(order.ID);

      expect(updateOrderStatusStub.called).to.be.true;
      expect(updateOrderStatusStub.args[0][0]).to.equal(order.ID);
      expect(updateOrderStatusStub.args[0][1]).to.equal(swishPaymentRequest.status);
    });

    it("should return null if order doesn't exist", async () => {
      withOrder(null);

      const result = await swish.getSwishOrder(123);

      expect(result).to.be.null;
    });
  });

  describe("routes", () => {
    let server: express.Express;

    beforeEach(() => {
      server = express();
      server.use("/swish", swishRouter);
    });

    describe("GET /swish/orders/:id/status", async () => {
      let getOrderStub: sinon.SinonStub;

      beforeEach(() => {
        getOrderStub = sinon.stub(swish, "getSwishOrder");
      });

      function withOrder(order: Partial<Swish_orders> | null) {
        getOrderStub.resolves(order as any);
      }

      it("should return 200 if order exists", async () => {
        const ID = 123;
        withOrder({ ID });

        await request(server).get(`/swish/orders/${ID}/status`).expect(200);

        expect(getOrderStub.called).to.be.true;
        expect(getOrderStub.args[0][0]).to.equal(ID);
      });

      it("should return 404 if order does not exist", async () => {
        withOrder(null);

        await request(server).get(`/orders/123`).expect(404);
      });
    });

    describe("POST /swish/callback", () => {
      let handleOrderStatusUpdateStub: sinon.SinonStub;

      beforeEach(() => {
        handleOrderStatusUpdateStub = sinon.stub(swish, "handleCallback");
      });

      function withWhitelistedIp(ip?: string) {
        sinon.stub(config, "swish_whitelist").value(ip ? [ip] : []);
        // trust proxy is needed for X-Forwarded-For to be used
        server.enable("trust proxy");
      }

      it("should return 200 if valid ip", async () => {
        const ip = "1.2.3.4";
        withWhitelistedIp(ip);

        await request(server).post("/swish/callback").set("X-Forwarded-For", ip).expect(200);
      });

      it("should should call order status update handler", async () => {
        const ip = "1.2.3.4";
        const body = { status: "PAID", amount: 100, id: "123" };
        withWhitelistedIp(ip);

        await request(server).post("/swish/callback").set("X-Forwarded-For", ip).send(body);

        expect(handleOrderStatusUpdateStub.called).to.be.true;
        expect(handleOrderStatusUpdateStub.args[0][0]).to.equal(body.id);
        // Status and amount from the (unauthenticated) body must not be passed on
        expect(handleOrderStatusUpdateStub.args[0]).to.have.length(1);
      });

      it("should return 403 if invalid ip", async () => {
        const ip = "1.2.3.4";
        withWhitelistedIp(undefined);

        await request(server).post("/swish/callback").set("X-Forwarded-For", ip).expect(403);
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});
