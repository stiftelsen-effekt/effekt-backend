import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express, { type Request, type Response } from "express";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import * as swish from "../custom_modules/swish";
import { mountTrpc, publicMutations } from "../trpc/express";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const vipps = require("../custom_modules/vipps");

const createCaller = createCallerFactory(appRouter);
const anonymous = () =>
  createCaller({ req: {} as Request, res: {} as Response, auth: undefined }).widget;

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
    if (message) expect(err.message).to.equal(message);
  }
};

/** An app with the REST routers the widget used before, for parity checks */
const restApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/vipps", require("../routes/vipps"));
  app.use("/avtalegiro", require("../routes/avtalegiro"));
  app.use("/autogiro", require("../routes/autogiro"));
  app.use("/swish", require("../routes/swish").default);
  return app;
};

const KID = "000123450012";

/** What the widget gets back from Vipps' draft call (vipps.draftAgreement) */
const vippsDraft = {
  agreementId: "agr_123",
  vippsConfirmationUrl: "https://api.vipps.no/v2/register/U6JUjQXq8HQmmV",
  chargeId: "chr_1",
  agreementUrlCode: "secretcode",
};

/** [what, input] pairs that must be refused before anything is called */
const vippsAttacks: Array<[string, unknown]> = [
  ["a numeric KID", { KID: 123, amount: 300, initialCharge: true, monthlyChargeDay: 5 }],
  ["a KID with letters", { KID: "12a", amount: 300, initialCharge: true, monthlyChargeDay: 5 }],
  [
    "a 33 digit KID",
    { KID: "1".repeat(33), amount: 300, initialCharge: true, monthlyChargeDay: 5 },
  ],
  ["a KID object", { KID: { $ne: "" }, amount: 300, initialCharge: true, monthlyChargeDay: 5 }],
  ["a string amount", { KID, amount: "300", initialCharge: true, monthlyChargeDay: 5 }],
  ["a negative amount", { KID, amount: -300, initialCharge: true, monthlyChargeDay: 5 }],
  ["a zero amount", { KID, amount: 0, initialCharge: true, monthlyChargeDay: 5 }],
  ["an infinite amount", { KID, amount: Infinity, initialCharge: true, monthlyChargeDay: 5 }],
  ["a huge amount", { KID, amount: 1e300, initialCharge: true, monthlyChargeDay: 5 }],
  ["a string initialCharge", { KID, amount: 300, initialCharge: "true", monthlyChargeDay: 5 }],
  ["a fractional charge day", { KID, amount: 300, initialCharge: true, monthlyChargeDay: 5.5 }],
  ["a charge day of 32", { KID, amount: 300, initialCharge: true, monthlyChargeDay: 32 }],
  ["a negative charge day", { KID, amount: 300, initialCharge: true, monthlyChargeDay: -1 }],
  ["a missing charge day", { KID, amount: 300, initialCharge: true }],
  ["an extra field", { KID, amount: 300, initialCharge: true, monthlyChargeDay: 5, donorId: 1 }],
  ["no body", undefined],
];

const avtaleGiroAttacks: Array<[string, unknown]> = [
  ["a numeric KID", { KID: 123, amount: 300, dueDay: 5 }],
  ["a KID with letters", { KID: "12a", amount: 300, dueDay: 5 }],
  ["a string amount", { KID, amount: "300", dueDay: 5 }],
  ["a negative amount", { KID, amount: -1, dueDay: 5 }],
  ["an infinite amount", { KID, amount: Infinity, dueDay: 5 }],
  ["a due day of 29", { KID, amount: 300, dueDay: 29 }],
  ["a fractional due day", { KID, amount: 300, dueDay: 1.5 }],
  ["a string due day", { KID, amount: 300, dueDay: "5" }],
  ["an extra field", { KID, amount: 300, dueDay: 5, active: 1 }],
];

describe("tRPC widget payment procedures", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("draftVippsAgreement", () => {
    let draftAgreement: sinon.SinonStub;

    beforeEach(() => {
      draftAgreement = sinon.stub(vipps, "draftAgreement").resolves({ ...vippsDraft });
    });

    for (const [what, input] of vippsAttacks) {
      it(`refuses ${what} without calling Vipps`, async () => {
        await expectTrpcError(anonymous().draftVippsAgreement(input as any), "BAD_REQUEST");
        expect(draftAgreement.called).to.equal(false);
      });
    }

    it("drafts the agreement and returns only the confirmation URL", async () => {
      const result = await anonymous().draftVippsAgreement({
        KID,
        amount: 300,
        initialCharge: true,
        monthlyChargeDay: 5,
      });
      expect(result).to.deep.equal({ vippsConfirmationUrl: vippsDraft.vippsConfirmationUrl });
      expect(draftAgreement.firstCall.args).to.deep.equal([KID, 300, true, 5]);
    });

    it("caps the charge day at 28, like REST", async () => {
      await anonymous().draftVippsAgreement({
        KID,
        amount: 300,
        initialCharge: false,
        monthlyChargeDay: 31,
      });
      expect(draftAgreement.firstCall.args).to.deep.equal([KID, 300, false, 28]);
    });

    it("makes the same Vipps call as POST /vipps/agreement/draft", async () => {
      const body = { KID, amount: 450, initialCharge: true, monthlyChargeDay: 30 };
      const rest = await request(restApp()).post("/vipps/agreement/draft").send(body).expect(200);
      const restArgs = draftAgreement.firstCall.args;
      draftAgreement.resetHistory();

      const trpc = await anonymous().draftVippsAgreement(body);
      expect(draftAgreement.firstCall.args).to.deep.equal(restArgs);
      expect(trpc.vippsConfirmationUrl).to.equal(rest.body.content.vippsConfirmationUrl);
    });

    it("fails when Vipps or the database refused the draft (REST answers 200 with false)", async () => {
      draftAgreement.resolves(false);
      await expectTrpcError(
        anonymous().draftVippsAgreement({
          KID,
          amount: 300,
          initialCharge: true,
          monthlyChargeDay: 5,
        }),
        "INTERNAL_SERVER_ERROR",
        "Could not draft the Vipps agreement",
      );
    });
  });

  describe("draftAvtaleGiro", () => {
    let add: sinon.SinonStub;

    beforeEach(() => {
      add = sinon.stub(DAO.avtalegiroagreements, "add").resolves(true as any);
    });

    for (const [what, input] of avtaleGiroAttacks) {
      it(`refuses ${what} without touching the database`, async () => {
        await expectTrpcError(anonymous().draftAvtaleGiro(input as any), "BAD_REQUEST");
        expect(add.called).to.equal(false);
      });
    }

    it("drafts the agreement in øre, with notice", async () => {
      expect(await anonymous().draftAvtaleGiro({ KID, amount: 300, dueDay: 20 })).to.equal(true);
      expect(add.firstCall.args).to.deep.equal([KID, 30000, 20, true]);
    });

    it("uses the last day of the month without a due day, like REST", async () => {
      await anonymous().draftAvtaleGiro({ KID, amount: 300 });
      expect(add.firstCall.args).to.deep.equal([KID, 30000, 0, true]);
    });

    it("writes exactly what POST /avtalegiro/draft writes", async () => {
      for (const body of [
        { KID, amount: 300, dueDay: 20 },
        { KID, amount: 125.5, dueDay: 0 },
        { KID, amount: 300 },
      ]) {
        add.resetHistory();
        await request(restApp()).post("/avtalegiro/draft").send(body).expect(200);
        const restArgs = add.firstCall.args;
        add.resetHistory();
        await anonymous().draftAvtaleGiro(body);
        expect(add.firstCall.args).to.deep.equal(restArgs);
      }
    });
  });

  describe("swishOrderStatus", () => {
    it("returns the order's status", async () => {
      const getSwishOrder = sinon
        .stub(swish, "getSwishOrder")
        .resolves({ ID: 42, status: "PAID", instructionUUID: "secret" } as any);
      expect(await anonymous().swishOrderStatus({ orderId: "42" })).to.deep.equal({
        status: "PAID",
      });
      expect(getSwishOrder.firstCall.args).to.deep.equal([42]);
    });

    it("answers NOT_FOUND for an unknown order", async () => {
      sinon.stub(swish, "getSwishOrder").resolves(null);
      await expectTrpcError(anonymous().swishOrderStatus({ orderId: "42" }), "NOT_FOUND");
    });

    it("answers what GET /swish/orders/:id/status answers", async () => {
      sinon.stub(swish, "getSwishOrder").resolves({ ID: 7, status: null } as any);
      const rest = await request(restApp()).get("/swish/orders/7/status").expect(200);
      expect(await anonymous().swishOrderStatus({ orderId: "7" })).to.deep.equal(rest.body);
    });

    for (const orderId of ["", "1e3", "12abc", "-1", "12345678901", { $gt: 0 } as any, 42 as any]) {
      it(`refuses the order id ${JSON.stringify(orderId)} without looking it up`, async () => {
        const getSwishOrder = sinon.stub(swish, "getSwishOrder").resolves(null);
        await expectTrpcError(anonymous().swishOrderStatus({ orderId }), "BAD_REQUEST");
        expect(getSwishOrder.called).to.equal(false);
      });
    }
  });

  describe("setAutoGiroDraftPaymentDate", () => {
    let getAgreementByKID: sinon.SinonStub;
    let setPaymentDate: sinon.SinonStub;

    beforeEach(() => {
      getAgreementByKID = sinon
        .stub(DAO.autogiroagreements, "getAgreementByKID")
        .resolves({ KID, active: false } as any);
      setPaymentDate = sinon
        .stub(DAO.autogiroagreements, "setAgreementPaymentDateByKID")
        .resolves(true as any);
    });

    for (const [what, input] of [
      ["a payment date of 29", { KID, paymentDate: 29 }],
      ["a negative payment date", { KID, paymentDate: -1 }],
      ["a string payment date", { KID, paymentDate: "27" }],
      ["a fractional payment date", { KID, paymentDate: 27.5 }],
      ["a KID with letters", { KID: "1a", paymentDate: 27 }],
      ["a numeric KID", { KID: 123, paymentDate: 27 }],
    ] as Array<[string, unknown]>) {
      it(`refuses ${what} without touching the database`, async () => {
        await expectTrpcError(anonymous().setAutoGiroDraftPaymentDate(input as any), "BAD_REQUEST");
        expect(getAgreementByKID.called).to.equal(false);
      });
    }

    it("sets the payment date of a drafted agreement", async () => {
      expect(await anonymous().setAutoGiroDraftPaymentDate({ KID, paymentDate: 27 })).to.equal(
        true,
      );
      expect(setPaymentDate.firstCall.args).to.deep.equal([KID, 27]);
    });

    it("leaves an active agreement alone", async () => {
      getAgreementByKID.resolves({ KID, active: true });
      await expectTrpcError(
        anonymous().setAutoGiroDraftPaymentDate({ KID, paymentDate: 27 }),
        "BAD_REQUEST",
        "Agreement is not in drafted state",
      );
      expect(setPaymentDate.called).to.equal(false);
    });

    it("answers NOT_FOUND for an unknown KID", async () => {
      getAgreementByKID.resolves(null);
      await expectTrpcError(
        anonymous().setAutoGiroDraftPaymentDate({ KID, paymentDate: 27 }),
        "NOT_FOUND",
        "Agreement not found",
      );
    });

    it("does what PUT /autogiro/:KID/drafted/paymentdate does", async () => {
      for (const agreement of [{ KID, active: false }, { KID, active: true }, null]) {
        getAgreementByKID.resolves(agreement);
        setPaymentDate.resetHistory();
        const rest = await request(restApp())
          .put(`/autogiro/${KID}/drafted/paymentdate`)
          .send({ paymentDate: 27 });
        const restWrites = setPaymentDate.getCalls().map((c) => c.args);
        setPaymentDate.resetHistory();

        const trpc = await anonymous()
          .setAutoGiroDraftPaymentDate({ KID, paymentDate: 27 })
          .then(
            () => ({ status: 200, content: "OK" }),
            (err) => ({ status: err.code === "NOT_FOUND" ? 404 : 400, content: err.message }),
          );
        expect(trpc).to.deep.equal({ status: rest.status, content: rest.body.content });
        expect(setPaymentDate.getCalls().map((c) => c.args)).to.deep.equal(restWrites);
      }
    });
  });

  describe("over HTTP", () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      mountTrpc(app);
    });

    it("counts every widget mutation as one that may not be batched", () => {
      expect([...publicMutations].sort()).to.deep.equal([
        "widget.draftAvtaleGiro",
        "widget.draftVippsAgreement",
        "widget.registerBankPending",
        "widget.registerDonation",
        "widget.setAutoGiroDraftPaymentDate",
        "widget.submitReferral",
      ]);
    });

    it("refuses the drafts in a batch", async () => {
      const draftAgreement = sinon.stub(vipps, "draftAgreement").resolves({ ...vippsDraft });
      const add = sinon.stub(DAO.avtalegiroagreements, "add").resolves(true as any);
      const vippsInput = { KID, amount: 300, initialCharge: true, monthlyChargeDay: 5 };
      await request(app)
        .post("/trpc/widget.draftVippsAgreement,widget.draftVippsAgreement?batch=1")
        .send({ 0: vippsInput, 1: vippsInput })
        .expect(400);
      await request(app)
        .post("/trpc/widget.draftAvtaleGiro%2Cwidget.draftAvtaleGiro?batch=1")
        .send({ 0: { KID, amount: 1 }, 1: { KID, amount: 1 } })
        .expect(400);
      expect(draftAgreement.called).to.equal(false);
      expect(add.called).to.equal(false);

      const res = await request(app)
        .post("/trpc/widget.draftVippsAgreement")
        .send(vippsInput)
        .expect(200);
      expect(res.body.result.data).to.deep.equal({
        vippsConfirmationUrl: vippsDraft.vippsConfirmationUrl,
      });
    });

    it("answers 400 to an invalid draft without calling Vipps", async () => {
      const draftAgreement = sinon.stub(vipps, "draftAgreement").resolves({ ...vippsDraft });
      await request(app)
        .post("/trpc/widget.draftVippsAgreement")
        .send({ KID: "1; DROP TABLE", amount: 1, initialCharge: true, monthlyChargeDay: 1 })
        .expect(400);
      expect(draftAgreement.called).to.equal(false);
    });

    it("polls the Swish status with a GET and no token", async () => {
      sinon.stub(swish, "getSwishOrder").resolves({ ID: 3, status: "CREATED" } as any);
      const res = await request(app)
        .get(`/trpc/widget.swishOrderStatus?input=${encodeURIComponent('{"orderId":"3"}')}`)
        .expect(200);
      expect(res.body.result.data).to.deep.equal({ status: "CREATED" });
    });
  });
});
