import { SwishOrder } from "@prisma/client";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import config from "../config";
import { DAO } from "../custom_modules/DAO";
import * as swish from "../custom_modules/swish";
import * as mail from "../custom_modules/mail";
import { initiateOrder } from "../custom_modules/swish";
import swishRouter from "../routes/swish";
import paymentMethods from "../enums/paymentMethods";

describe("swish", () => {
  describe("initiateOrder()", () => {
    let fetchStub: sinon.SinonStub;
    let getByKIDStub: sinon.SinonStub;
    let addOrderStub: sinon.SinonStub;

    beforeEach(() => {
      fetchStub = sinon.stub(global, "fetch");
      getByKIDStub = sinon.stub(DAO.donors, "getByKID");
      addOrderStub = sinon.stub(DAO.swish, "addOrder");
    });

    function withPaymentRequestStatus(status: number) {
      fetchStub.resolves({
        status,
      } as Response);
    }

    function withDonor(donor: Partial<Awaited<ReturnType<typeof DAO.donors.getByKID>>>) {
      getByKIDStub.resolves(donor as any);
    }

    it("should add order if donor has phone and payment request is successful", async () => {
      const KID = "1234567890";
      const donorId = 1323;

      withPaymentRequestStatus(201);
      withDonor({
        id: donorId,
        phone: "46707074730",
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
      const phone = "46707074730";

      withDonor({ phone });
      withPaymentRequestStatus(201);

      await initiateOrder("1234567890", { amount });

      expect(fetchStub.called).to.be.true;
      expect(fetchStub.args[0][0]).to.contain("");
      const body = JSON.parse(fetchStub.args[0][1].body);
      expect(body).to.contain({
        amount,
        payerAlias: phone,
      });
    });

    it("should generate a reference number prefixed by current date", async () => {
      const date = new Date("2020-01-01T00:00:00.000Z");
      sinon.useFakeTimers(date.getTime());

      withDonor({ phone: "46707074730" });
      withPaymentRequestStatus(201);

      await initiateOrder("1234567890", { amount: 100 });

      expect(fetchStub.called).to.be.true;
      const body = JSON.parse(fetchStub.args[0][1].body);
      const reference = body.payeePaymentReference;
      expect(reference.slice(0, 6)).to.equal("200101");
      expect(reference.length).to.equal(11);
      expect(reference).to.match(/^[0-9]+$/);
    });

    it("should throw error if donor has no phone", async () => {
      withDonor({ phone: null });

      await initiateOrder("1234567890", { amount: 100 }).catch((err) => {
        expect(err.message).to.contain("Missing phone number");
      });
    });

    it("should throw error if payment request is unsuccessful", async () => {
      withDonor({ phone: "46707074730" });
      withPaymentRequestStatus(400);

      await initiateOrder("1234567890", { amount: 100 }).catch((err) => {
        expect(err.message).to.contain("Could not initiate payment");
      });
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
      order: Partial<Awaited<ReturnType<typeof DAO.swish.getOrderByInstructionUUID>>>,
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
        registered: "2020-01-01T00:00:00.000Z",
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

  describe("getSwishOrder()", () => {
    let getOrderStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;
    let getOrderByInstructionUUIDStub: sinon.SinonStub;
    let updateOrderStatusStub: sinon.SinonStub;
    let updateOrderDonationIdStub: sinon.SinonStub;
    let sendDonationReceiptStub: sinon.SinonStub;
    let addDonationStub: sinon.SinonStub;

    beforeEach(() => {
      getOrderStub = sinon.stub(DAO.swish, "getOrder");
      fetchStub = sinon.stub(global, "fetch");
      getOrderByInstructionUUIDStub = sinon.stub(DAO.swish, "getOrderByInstructionUUID");
      updateOrderStatusStub = sinon.stub(DAO.swish, "updateOrderStatus");
      updateOrderDonationIdStub = sinon.stub(DAO.swish, "updateOrderDonationId");
      sendDonationReceiptStub = sinon.stub(mail, "sendDonationReceipt");
      addDonationStub = sinon.stub(DAO.donations, "add");
    });

    function withOrder(order: Partial<Awaited<ReturnType<typeof DAO.swish.getOrder>>>) {
      getOrderStub.resolves(order as any);
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
      const order = { ID: 123, status: undefined } as const;
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

    describe("GET /swish/orders/:id", async () => {
      let getOrderStub: sinon.SinonStub;

      beforeEach(() => {
        getOrderStub = sinon.stub(swish, "getSwishOrder");
      });

      function withOrder(order: Partial<SwishOrder>) {
        getOrderStub.resolves(order as any);
      }

      it("should return 200 if order exists", async () => {
        const id = 123;
        withOrder({ ID: id });

        await request(server).get(`/swish/orders/${id}`).expect(200);

        expect(getOrderStub.called).to.be.true;
        expect(getOrderStub.args[0][0]).to.equal(id);
      });

      it("should return 404 if order does not exist", async () => {
        withOrder(null);

        await request(server).get(`/orders/123`).expect(404);
      });
    });

    describe("POST /swish/callback", () => {
      let handleOrderStatusUpdateStub: sinon.SinonStub;

      beforeEach(() => {
        handleOrderStatusUpdateStub = sinon.stub(swish, "handleOrderStatusUpdate");
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
        expect(handleOrderStatusUpdateStub.args[0][1]).to.deep.equal({
          status: body.status,
          amount: body.amount,
        });
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