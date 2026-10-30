import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as mail from "../custom_modules/mail";
import * as swish from "../custom_modules/swish";
import methods from "../enums/methods";
import { mountTrpc } from "../trpc/express";
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

/** What the donation widget sends for a one-off bank donation */
const widgetBody = () => ({
  distributionCauseAreas: [
    {
      id: 1,
      name: "Global health",
      standardSplit: false,
      percentageShare: "100",
      amount: 500,
      organizations: [
        { id: 1, percentageShare: "60", amount: 300 },
        { id: 2, percentageShare: "40", amount: 200 },
      ],
    },
  ],
  donor: { email: "donor@example.com", name: "Dina Donor", newsletter: false, ssn: "" },
  method: methods.BANK,
  amount: 500,
  recurring: 0 as 0 | 1,
});

/** Inputs the #861 hotfix rejects on REST; tRPC must reject them before touching the database */
const attacks: Array<[string, (body: any) => void]> = [
  ["an object as cause area id", (b) => (b.distributionCauseAreas[0].id = { id: 1 })],
  ["a string cause area id with an exponent", (b) => (b.distributionCauseAreas[0].id = "1.2e4")],
  ["a fractional organization id", (b) => (b.distributionCauseAreas[0].organizations[0].id = 1.5)],
  ["a huge organization id", (b) => (b.distributionCauseAreas[0].organizations[0].id = 1e300)],
  ["an object as share", (b) => (b.distributionCauseAreas[0].percentageShare = { a: 1 })],
  ["an exponent share", (b) => (b.distributionCauseAreas[0].percentageShare = "1.2e4")],
  ["an array as donor name", (b) => (b.donor.name = ["A"])],
  ["an object as ssn", (b) => (b.donor.ssn = { ssn: "1" })],
  ["an object as email", (b) => (b.donor.email = { $ne: "" })],
  ["a missing email", (b) => delete b.donor.email],
  ["an object as amount", (b) => (b.amount = { amount: 1 })],
  ["an exponent amount", (b) => (b.amount = "1.2e4")],
  ["a negative amount", (b) => (b.amount = -100)],
  ["an infinite amount", (b) => (b.amount = Infinity)],
  ["a string method that is not digits", (b) => (b.method = "bank")],
  ["a string as recurring", (b) => (b.recurring = "true")],
  ["no cause areas", (b) => (b.distributionCauseAreas = [])],
  ["a fundraiser without showName", (b) => (b.fundraiser = { id: 1 })],
  ["a non-object body", (b) => Object.keys(b).forEach((k) => delete b[k])],
];

describe("tRPC widget router", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("causeAreas", () => {
    it("returns the cause areas with their organizations, only the declared fields", async () => {
      sinon.stub(DAO.causeareas, "getAll").resolves([
        {
          id: 1,
          name: "Global health",
          widgetDisplayName: null,
          widgetContext: null,
          shortDescription: "Short",
          longDescription: "Long",
          informationUrl: "https://example.org",
          isActive: true,
          ordering: 1,
          standardPercentageShare: 100,
        },
      ] as any);
      sinon.stub(DAO.organizations, "getAll").resolves([
        {
          id: 3,
          name: "Against Malaria Foundation",
          widgetDisplayName: "AMF",
          widgetContext: null,
          abbreviation: "AMF",
          shortDescription: null,
          longDescription: "AMF",
          standardShare: 50,
          informationUrl: null,
          isActive: true,
          ordering: 2,
          causeAreaId: 1,
          chartColor: "chart-3",
        },
        { id: 4, name: "Elsewhere", causeAreaId: 2, isActive: true, ordering: 1 },
      ] as any);

      const causeAreas = await anonymous().causeAreas();
      expect(causeAreas).to.have.length(1);
      expect(causeAreas[0].organizations).to.deep.equal([
        {
          id: 3,
          causeAreaId: 1,
          name: "Against Malaria Foundation",
          widgetDisplayName: "AMF",
          widgetContext: null,
          abbreviation: "AMF",
          shortDescription: null,
          longDescription: "AMF",
          informationUrl: null,
          standardShare: 50,
          isActive: true,
          ordering: 2,
        },
      ]);
      expect(causeAreas[0].standardPercentageShare).to.equal(100);
    });

    it("accepts the Danish backend's cause areas (null descriptions, no abbreviation)", async () => {
      const { widgetCauseAreasOutput } = require("../trpc/shared/widget");
      const parsed = widgetCauseAreasOutput.safeParse([
        {
          id: 1,
          name: "Sundhed",
          widgetDisplayName: null,
          widgetContext: null,
          shortDescription: "x",
          longDescription: "x",
          informationUrl: "https://giveffektivt.dk",
          isActive: true,
          ordering: 1,
          standardPercentageShare: 100,
          organizations: [
            {
              id: 1,
              name: "Malaria",
              widgetDisplayName: "Malaria",
              widgetContext: null,
              shortDescription: "x",
              longDescription: "x",
              standardShare: 100,
              informationUrl: "https://x",
              isActive: true,
              ordering: 1,
              causeAreaId: 1,
            },
          ],
        },
      ]);
      expect(parsed.success).to.equal(true);
    });
  });

  describe("referralTypes", () => {
    it("returns the active referral types", async () => {
      const getTypes = sinon
        .stub(DAO.referrals, "getTypes")
        .resolves([{ id: 1, name: "Friend", ordering: 1 }]);
      expect(await anonymous().referralTypes()).to.deep.equal([
        { id: 1, name: "Friend", ordering: 1 },
      ]);
      expect(getTypes.calledOnce).to.equal(true);
    });
  });

  describe("registerDonation", () => {
    let getIDbyEmail: sinon.SinonStub;
    let addDonor: sinon.SinonStub;
    let addDistribution: sinon.SinonStub;
    let addPaymentIntent: sinon.SinonStub;

    beforeEach(() => {
      getIDbyEmail = sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
      addDonor = sinon.stub(DAO.donors, "add").resolves(42);
      sinon.stub(DAO.donors, "getByID").resolves(null);
      sinon.stub(DAO.tax, "addTaxUnit").resolves(5);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(null);
      sinon.stub(DAO.distributions, "getStandardDistributionByCauseAreaID").resolves([]);
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves(null);
      addDistribution = sinon.stub(DAO.distributions, "add").resolves();
      sinon.stub(donationHelpers, "createKID").resolves("12345678");
      addPaymentIntent = sinon.stub(DAO.initialpaymentmethod, "addPaymentIntent").resolves();
      sinon.stub(DAO.referrals, "getDonorAnswered").resolves(false);
      sinon.stub(DAO.donationReferralCodes, "add").resolves();
    });

    for (const [name, change] of attacks) {
      it(`rejects ${name} before touching the database`, async () => {
        const body = widgetBody();
        change(body);
        await expectTrpcError(anonymous().registerDonation(body as any), "BAD_REQUEST");
        expect(getIDbyEmail.called).to.equal(false);
      });
    }

    it("registers a bank donation and returns the KID", async () => {
      const result = await anonymous().registerDonation(widgetBody());
      expect(result).to.deep.equal({
        KID: "12345678",
        donorID: 42,
        hasAnsweredReferral: false,
        paymentProviderUrl: "",
        swishOrderID: null,
        swishPaymentRequestToken: null,
      });
      expect(
        addDonor.calledOnceWith({
          email: "donor@example.com",
          full_name: "Dina Donor",
          newsletter: false,
        }),
      ).to.equal(true);
      expect(addDistribution.calledOnce).to.equal(true);
      expect(addDistribution.firstCall.args[0].kid).to.equal("12345678");
      expect(addPaymentIntent.calledOnceWith(500, methods.BANK, "12345678")).to.equal(true);
    });

    it("does exactly what POST /donations/register does", async () => {
      const app = express();
      app.use(express.json());
      app.use("/donations", require("../routes/donations").default);
      const rest = await request(app).post("/donations/register").send(widgetBody()).expect(200);
      const restCalls = [addDonor, addDistribution, addPaymentIntent].map((s) =>
        s.getCalls().map((c) => c.args),
      );
      sinon.resetHistory();

      const trpc = await anonymous().registerDonation(widgetBody());
      expect(trpc).to.deep.equal(rest.body.content);
      expect(
        [addDonor, addDistribution, addPaymentIntent].map((s) => s.getCalls().map((c) => c.args)),
      ).to.deep.equal(restCalls);
    });

    it("starts a one-off Vipps payment and returns its URL", async () => {
      const initiateOrder = sinon
        .stub(vipps, "initiateOrder")
        .resolves({ orderId: "order-1", externalPaymentUrl: "https://vipps.example/pay" });
      const pollOrder = sinon.stub(vipps, "pollOrder");
      const result = await anonymous().registerDonation({ ...widgetBody(), method: methods.VIPPS });
      expect(initiateOrder.calledOnceWith("12345678", 500)).to.equal(true);
      expect(pollOrder.calledOnceWith("order-1")).to.equal(true);
      expect(result.paymentProviderUrl).to.equal("https://vipps.example/pay");
    });

    it("starts a one-off Swish payment and returns its order", async () => {
      const initiateOrder = sinon
        .stub(swish, "initiateOrder")
        .resolves({ orderID: "swish-1", paymentRequestToken: "token-1" } as any);
      const result = await anonymous().registerDonation({ ...widgetBody(), method: methods.SWISH });
      expect(initiateOrder.calledOnceWith("12345678", { amount: 500 })).to.equal(true);
      expect(result.swishOrderID).to.equal("swish-1");
      expect(result.swishPaymentRequestToken).to.equal("token-1");
    });

    it("refuses recurring Swish donations like REST, before any donor is created", async () => {
      await expectTrpcError(
        anonymous().registerDonation({ ...widgetBody(), method: methods.SWISH, recurring: 1 }),
        "BAD_REQUEST",
        "Recurring donations not supported with Swish",
      );
      expect(getIDbyEmail.called).to.equal(false);
    });

    it("refuses a referral code that is not a string or too long", async () => {
      await expectTrpcError(
        anonymous().registerDonation({ ...widgetBody(), referralCode: { a: 1 } }),
        "BAD_REQUEST",
        "Invalid referral code",
      );
      await expectTrpcError(
        anonymous().registerDonation({ ...widgetBody(), referralCode: "x".repeat(129) }),
        "BAD_REQUEST",
        "Referral code is too long",
      );
      expect(getIDbyEmail.called).to.equal(false);
    });

    it("answers INTERNAL_SERVER_ERROR without details when the database fails", async () => {
      addDistribution.rejects(new Error("connection lost"));
      await expectTrpcError(anonymous().registerDonation(widgetBody()), "INTERNAL_SERVER_ERROR");
    });
  });

  describe("registerBankPending", () => {
    let send: sinon.SinonStub;

    beforeEach(() => {
      send = sinon.stub(mail, "sendDonationRegistered").resolves(true);
    });

    for (const input of [
      { KID: { KID: 1 }, sum: 100 },
      { KID: 12345, sum: 100 },
      { KID: "12a45", sum: 100 },
      { KID: "1.2e4", sum: 100 },
      { KID: "", sum: 100 },
      { KID: "12345", sum: "100" },
      { KID: "12345", sum: Infinity },
      { KID: "12345" },
    ]) {
      it(`rejects ${JSON.stringify(input)}`, async () => {
        await expectTrpcError(anonymous().registerBankPending(input as any), "BAD_REQUEST");
        expect(send.called).to.equal(false);
      });
    }

    it("sends the bank donation email", async () => {
      expect(await anonymous().registerBankPending({ KID: "12345", sum: 100 })).to.equal(true);
      expect(send.calledOnceWith("12345", 100)).to.equal(true);
    });

    it("fails when the email could not be sent", async () => {
      send.resolves(false);
      await expectTrpcError(
        anonymous().registerBankPending({ KID: "12345", sum: 100 }),
        "INTERNAL_SERVER_ERROR",
      );
    });
  });

  describe("submitReferral", () => {
    let query: sinon.SinonStub;
    const valid = { referralID: 1, donorID: 2, active: true, session: "1730000000000" };

    beforeEach(() => {
      query = sinon.stub(DAO, "query").rejects(new Error("unexpected query"));
    });

    for (const [field, value] of [
      ["referralID", { ReferralID: 1 }],
      ["referralID", "1"],
      ["referralID", 1.5],
      ["referralID", 1e300],
      ["donorID", { DonorID: 1 }],
      ["donorID", -1],
      ["session", { website_session: 1 }],
      ["session", 0],
      ["session", ""],
      ["session", "x".repeat(46)],
      ["active", "false"],
      ["comment", { other_comment: "x" }],
      ["comment", "x".repeat(1001)],
    ] as const) {
      it(`rejects ${field} = ${JSON.stringify(value).slice(0, 40)}`, async () => {
        await expectTrpcError(
          anonymous().submitReferral({ ...valid, [field]: value } as any),
          "BAD_REQUEST",
        );
        expect(query.called).to.equal(false);
      });
    }

    it("adds a new answer", async () => {
      sinon.stub(DAO.referrals, "checkRecordExist").resolves(false);
      const add = sinon.stub(DAO.referrals, "addRecord").resolves(true);
      expect(await anonymous().submitReferral({ ...valid, comment: "Podcast" })).to.equal(true);
      expect(add.calledOnceWith(1, 2, "1730000000000", "Podcast")).to.equal(true);
    });

    it("stores a missing comment as null", async () => {
      sinon.stub(DAO.referrals, "checkRecordExist").resolves(false);
      const add = sinon.stub(DAO.referrals, "addRecord").resolves(true);
      await anonymous().submitReferral(valid);
      expect(add.calledOnceWith(1, 2, "1730000000000", null)).to.equal(true);
    });

    it("only updates the comment of an existing 'other' answer", async () => {
      sinon.stub(DAO.referrals, "checkRecordExist").resolves(true);
      const add = sinon.stub(DAO.referrals, "addRecord").resolves(true);
      const update = sinon.stub(DAO.referrals, "updateRecordComment").resolves(true);
      await anonymous().submitReferral({ ...valid, referralID: 10, comment: "Blog" });
      await anonymous().submitReferral(valid);
      expect(update.calledOnceWith(10, 2, "1730000000000", "Blog")).to.equal(true);
      expect(add.called).to.equal(false);
    });

    it("removes an answer that is no longer selected", async () => {
      const remove = sinon.stub(DAO.referrals, "deleteRecord").resolves(true);
      await anonymous().submitReferral({ ...valid, active: false });
      expect(remove.calledOnceWith(1, 2, "1730000000000")).to.equal(true);
    });
  });

  describe("over HTTP", () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      mountTrpc(app);
    });

    it("answers the public queries without a token", async () => {
      sinon.stub(DAO.referrals, "getTypes").resolves([{ id: 1, name: "Friend", ordering: null }]);
      const res = await request(app).get("/trpc/widget.referralTypes").expect(200);
      expect(res.body.result.data).to.deep.equal([{ id: 1, name: "Friend", ordering: null }]);
    });

    it("answers 400 to invalid mutation input without touching the database", async () => {
      const getIDbyEmail = sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
      const body = widgetBody();
      (body.distributionCauseAreas[0] as any).id = { id: 1 };
      await request(app).post("/trpc/widget.registerDonation").send(body).expect(400);
      expect(getIDbyEmail.called).to.equal(false);
    });

    it("refuses widget mutations in a batch", async () => {
      const send = sinon.stub(mail, "sendDonationRegistered").resolves(true);
      const input = { KID: "12345", sum: 100 };
      await request(app)
        .post("/trpc/widget.registerBankPending,widget.registerBankPending?batch=1")
        .send({ 0: input, 1: input })
        .expect(400);
      await request(app)
        .post("/trpc/widget.registerBankPending%2Cwidget.registerBankPending?batch=1")
        .send({ 0: input, 1: input })
        .expect(400);
      expect(send.called).to.equal(false);

      await request(app).post("/trpc/widget.registerBankPending").send(input).expect(200);
      expect(send.calledOnce).to.equal(true);
    });

    it("still batches queries", async () => {
      sinon.stub(DAO.referrals, "getTypes").resolves([]);
      sinon.stub(DAO.causeareas, "getAll").resolves([]);
      sinon.stub(DAO.organizations, "getAll").resolves([]);
      await request(app)
        .get("/trpc/widget.referralTypes,widget.causeAreas?batch=1&input={}")
        .expect(200);
    });
  });

  it("keeps the shared schemas free of backend imports (apps/web bundles them)", () => {
    const source = readFileSync(join(__dirname, "../trpc/shared/widget.ts"), "utf8");
    const imports = [...source.matchAll(/(?:from|import|require\()\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(imports).to.deep.equal(["zod"]);
  });
});
