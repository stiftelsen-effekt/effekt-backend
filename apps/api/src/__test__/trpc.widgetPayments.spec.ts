import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express, { type Request, type Response } from "express";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { mountTrpc, publicMutations } from "../trpc/express";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as mail from "../custom_modules/mail";
import methods from "../enums/methods";
import {
  createRegistrationToken,
  REGISTRATION_TOKEN_TTL_MS,
} from "../custom_modules/registrationToken";
import { resetBankPendingMail } from "../custom_modules/bankPendingMail";

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
  return app;
};

const KID = "000123450012";

const tokenFor = (kid: string, method: number, amount = 300) =>
  createRegistrationToken({ kid, method, donorId: 42, amount });
const vippsToken = tokenFor(KID, methods.VIPPS);
const avtaleGiroToken = tokenFor(KID, methods.AVTALEGIRO);
const expiredToken = (method: number) =>
  createRegistrationToken(
    { kid: KID, method, donorId: 42, amount: 300 },
    Date.now() - REGISTRATION_TOKEN_TTL_MS - 1,
  );

/** Tokens that must not unlock a call for KID with the given method */
const wrongTokens = (method: number): Array<[string, string]> => [
  ["no token", ""],
  ["a token for another KID", tokenFor("999999990012", method)],
  [
    "a token for another method",
    tokenFor(KID, method === methods.BANK ? methods.VIPPS : methods.BANK),
  ],
  ["an expired token", expiredToken(method)],
  ["a forged token", `v1.${Buffer.from(JSON.stringify({ kid: KID })).toString("base64url")}.x`],
];

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
  [
    "an amount in fractions of øre",
    { KID, amount: 1.005, initialCharge: true, monthlyChargeDay: 5 },
  ],
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
  ["a zero amount", { KID, amount: 0, dueDay: 5 }],
  ["a huge amount", { KID, amount: 1e9, dueDay: 5 }],
  ["an amount in fractions of øre", { KID, amount: 300.001, dueDay: 5 }],
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
        const withToken =
          input && typeof input === "object" && !("donorId" in input)
            ? { ...input, registrationToken: vippsToken }
            : input;
        await expectTrpcError(anonymous().draftVippsAgreement(withToken as any), "BAD_REQUEST");
        expect(draftAgreement.called).to.equal(false);
      });
    }

    for (const [what, registrationToken] of wrongTokens(methods.VIPPS)) {
      it(`refuses ${what} without calling Vipps`, async () => {
        await expectTrpcError(
          anonymous().draftVippsAgreement({
            KID,
            amount: 300,
            initialCharge: true,
            monthlyChargeDay: 5,
            registrationToken,
          }),
          "BAD_REQUEST",
        );
        expect(draftAgreement.called).to.equal(false);
      });
    }

    it("drafts the agreement and returns only the confirmation URL", async () => {
      const result = await anonymous().draftVippsAgreement({
        KID,
        amount: 300,
        initialCharge: true,
        monthlyChargeDay: 5,
        registrationToken: vippsToken,
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
        registrationToken: vippsToken,
      });
      expect(draftAgreement.firstCall.args).to.deep.equal([KID, 300, false, 28]);
    });

    it("has no unauthenticated REST route any more", async () => {
      const body = { KID, amount: 450, initialCharge: true, monthlyChargeDay: 30 };
      await request(restApp()).post("/vipps/agreement/draft").send(body).expect(404);
      expect(draftAgreement.called).to.equal(false);
    });

    it("fails when Vipps or the database refused the draft (REST answers 200 with false)", async () => {
      draftAgreement.resolves(false);
      await expectTrpcError(
        anonymous().draftVippsAgreement({
          KID,
          amount: 300,
          initialCharge: true,
          monthlyChargeDay: 5,
          registrationToken: vippsToken,
        }),
        "INTERNAL_SERVER_ERROR",
        "Could not draft the Vipps agreement",
      );
    });
  });

  describe("draftAvtaleGiro", () => {
    let getDraftState: sinon.SinonStub;
    let addDraftIfNone: sinon.SinonStub;
    let updateDraft: sinon.SinonStub;
    let add: sinon.SinonStub;
    let setActive: sinon.SinonStub;

    beforeEach(() => {
      getDraftState = sinon
        .stub(DAO.avtalegiroagreements, "getDraftState")
        .resolves({ rows: 0, draft: false });
      addDraftIfNone = sinon.stub(DAO.avtalegiroagreements, "addDraftIfNone").resolves(true);
      updateDraft = sinon.stub(DAO.avtalegiroagreements, "updateDraft").resolves(true);
      add = sinon.stub(DAO.avtalegiroagreements, "add").resolves();
      setActive = sinon.stub(DAO.avtalegiroagreements, "setActive").resolves();
    });

    const noWrites = () => {
      expect(addDraftIfNone.called).to.equal(false);
      expect(updateDraft.called).to.equal(false);
      expect(add.called).to.equal(false);
      expect(setActive.called).to.equal(false);
    };

    for (const [what, input] of avtaleGiroAttacks) {
      it(`refuses ${what} without touching the database`, async () => {
        await expectTrpcError(
          anonymous().draftAvtaleGiro({ ...(input as any), registrationToken: avtaleGiroToken }),
          "BAD_REQUEST",
        );
        expect(getDraftState.called).to.equal(false);
        noWrites();
      });
    }

    for (const [what, registrationToken] of wrongTokens(methods.AVTALEGIRO)) {
      it(`refuses ${what} without touching the database`, async () => {
        await expectTrpcError(
          anonymous().draftAvtaleGiro({ KID, amount: 300, dueDay: 5, registrationToken }),
          "BAD_REQUEST",
        );
        expect(getDraftState.called).to.equal(false);
        noWrites();
      });
    }

    it("drafts the agreement in øre, with notice", async () => {
      expect(
        await anonymous().draftAvtaleGiro({
          KID,
          amount: 300,
          dueDay: 20,
          registrationToken: avtaleGiroToken,
        }),
      ).to.equal(true);
      expect(addDraftIfNone.firstCall.args).to.deep.equal([KID, 30000, 20]);
    });

    it("stores whole øre", async () => {
      await anonymous().draftAvtaleGiro({
        KID,
        amount: 125.55,
        dueDay: 20,
        registrationToken: avtaleGiroToken,
      });
      expect(addDraftIfNone.firstCall.args).to.deep.equal([KID, 12555, 20]);
    });

    it("uses the last day of the month without a due day", async () => {
      await anonymous().draftAvtaleGiro({ KID, amount: 300, registrationToken: avtaleGiroToken });
      expect(addDraftIfNone.firstCall.args).to.deep.equal([KID, 30000, 0]);
    });

    it("refuses a KID that has an active or ended agreement, without writing", async () => {
      for (const state of [
        { rows: 1, draft: false },
        { rows: 2, draft: false },
      ]) {
        getDraftState.resolves(state);
        await expectTrpcError(
          anonymous().draftAvtaleGiro({ KID, amount: 300, registrationToken: avtaleGiroToken }),
          "BAD_REQUEST",
          "Invalid or expired registration",
        );
      }
      noWrites();
    });

    it("updates its own draft when the widget sends it again, never adding a second row", async () => {
      getDraftState.resolves({ rows: 1, draft: true });
      const input = { KID, amount: 300, dueDay: 15, registrationToken: avtaleGiroToken };
      expect(await anonymous().draftAvtaleGiro(input)).to.equal(true);
      expect(await anonymous().draftAvtaleGiro({ ...input, dueDay: 20 })).to.equal(true);
      expect(updateDraft.getCalls().map((c) => c.args)).to.deep.equal([
        [KID, 30000, 15],
        [KID, 30000, 20],
      ]);
      expect(addDraftIfNone.called).to.equal(false);
      expect(add.called).to.equal(false);
    });

    it("treats losing a race with the same draft (a double click) as success", async () => {
      addDraftIfNone.resolves(false);
      getDraftState.onSecondCall().resolves({ rows: 1, draft: true });
      expect(
        await anonymous().draftAvtaleGiro({ KID, amount: 300, registrationToken: avtaleGiroToken }),
      ).to.equal(true);
      expect(addDraftIfNone.calledOnce).to.equal(true);
    });

    it("treats a lock conflict with a concurrent draft as success", async () => {
      addDraftIfNone.rejects(Object.assign(new Error("Deadlock"), { code: "ER_LOCK_DEADLOCK" }));
      getDraftState.onSecondCall().resolves({ rows: 1, draft: true });
      expect(
        await anonymous().draftAvtaleGiro({ KID, amount: 300, registrationToken: avtaleGiroToken }),
      ).to.equal(true);
    });

    it("has no unauthenticated REST route any more", async () => {
      await request(restApp())
        .post("/avtalegiro/draft")
        .send({ KID, amount: 300, dueDay: 20 })
        .expect(404);
      noWrites();
    });
  });

  describe("the widget flow: register, then draft or email", () => {
    beforeEach(() => {
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
      sinon.stub(DAO.donors, "add").resolves(42);
      sinon.stub(DAO.distributions, "getStandardDistributionByCauseAreaID").resolves([]);
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves(null);
      sinon.stub(DAO.distributions, "add").resolves();
      sinon.stub(DAO.initialpaymentmethod, "addPaymentIntent").resolves();
      sinon.stub(DAO.donationReferralCodes, "add").resolves();
      sinon.stub(donationHelpers, "createKID").resolves("12345678");
      sinon.stub(donationHelpers, "createAvtaleGiroKID").resolves(KID);
    });

    afterEach(() => resetBankPendingMail());

    const register = (method: number, amount = 300) =>
      anonymous().registerDonation({
        distributionCauseAreas: [
          {
            id: 1,
            standardSplit: false,
            percentageShare: "100",
            organizations: [{ id: 1, percentageShare: "100" }],
          },
        ],
        donor: { email: "donor@example.com", name: "Dina Donor", newsletter: false, ssn: "" },
        method,
        amount,
        recurring: method === methods.BANK ? 0 : 1,
      });

    it("drafts the AvtaleGiro agreement for the KID it registered", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getDraftState").resolves({ rows: 0, draft: false });
      const addDraftIfNone = sinon.stub(DAO.avtalegiroagreements, "addDraftIfNone").resolves(true);

      const registered = await register(methods.AVTALEGIRO);
      expect(registered.KID).to.equal(KID);
      await anonymous().draftAvtaleGiro({
        KID: registered.KID!,
        amount: 300,
        dueDay: 20,
        registrationToken: registered.registrationToken!,
      });
      expect(addDraftIfNone.calledOnceWith(KID, 30000, 20)).to.equal(true);

      // The same token is no good for any other KID
      await expectTrpcError(
        anonymous().draftAvtaleGiro({
          KID: "999999990012",
          amount: 300,
          registrationToken: registered.registrationToken!,
        }),
        "BAD_REQUEST",
      );
      expect(addDraftIfNone.calledOnce).to.equal(true);
    });

    it("emails the bank details for the KID it registered", async () => {
      const send = sinon.stub(mail, "sendDonationRegistered").resolves(true);
      const registered = await register(methods.BANK, 350);
      await anonymous().registerBankPending({
        KID: registered.KID!,
        sum: 350,
        registrationToken: registered.registrationToken!,
      });
      expect(send.calledOnceWith("12345678", 350)).to.equal(true);
    });

    it("drafts the Vipps agreement for the KID it registered", async () => {
      const draftAgreement = sinon.stub(vipps, "draftAgreement").resolves({ ...vippsDraft });
      const registered = await register(methods.VIPPS);
      await anonymous().draftVippsAgreement({
        KID: registered.KID!,
        amount: 300,
        initialCharge: true,
        monthlyChargeDay: 5,
        registrationToken: registered.registrationToken!,
      });
      expect(draftAgreement.calledOnceWith("12345678", 300, true, 5)).to.equal(true);
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
        "widget.submitReferral",
      ]);
    });

    it("refuses the drafts in a batch", async () => {
      const draftAgreement = sinon.stub(vipps, "draftAgreement").resolves({ ...vippsDraft });
      const add = sinon.stub(DAO.avtalegiroagreements, "addDraftIfNone").resolves(true);
      const vippsInput = {
        KID,
        amount: 300,
        initialCharge: true,
        monthlyChargeDay: 5,
        registrationToken: vippsToken,
      };
      await request(app)
        .post("/trpc/widget.draftVippsAgreement,widget.draftVippsAgreement?batch=1")
        .send({ 0: vippsInput, 1: vippsInput })
        .expect(400);
      await request(app)
        .post("/trpc/widget.draftAvtaleGiro%2Cwidget.draftAvtaleGiro?batch=1")
        .send({
          0: { KID, amount: 1, registrationToken: avtaleGiroToken },
          1: { KID, amount: 1, registrationToken: avtaleGiroToken },
        })
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
  });
});
