import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as mail from "../custom_modules/mail";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const vipps = require("../custom_modules/vipps");

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]);

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const dbAgreement = {
  ID: "agr_TEST1",
  donorID: 42,
  KID: "12345678",
  amount: 300,
  status: "ACTIVE",
  monthly_charge_day: 5,
  timestamp_created: "2026-01-01 10:00:00",
  agreement_url_code: "urlcode-abc",
  paused_until_date: null,
  force_charge_date: null,
} as any;

const distribution = {
  taxUnitId: null,
  causeAreas: [
    {
      id: 1,
      standardSplit: false,
      percentageShare: "100",
      organizations: [
        { id: 5, percentageShare: "60" },
        { id: 6, percentageShare: "40" },
      ],
    },
  ],
};

describe("tRPC vipps router", () => {
  let changeMailStub: sinon.SinonStub;

  beforeEach(() => {
    changeMailStub = sinon.stub(mail, "sendVippsAgreementChange").resolves(false);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("auth and validation", () => {
    it("rejects anonymous callers", async () => {
      const stub = sinon.stub(DAO.vipps, "getAgreementReport");
      await expectTrpcError(callerWith().vipps.agreements.report(), "UNAUTHORIZED");
      expect(stub.called).to.be.false;
    });

    it("rejects callers without the admin permission", async () => {
      const stub = sinon.stub(vipps, "refundCharge");
      await expectTrpcError(
        callerWith(["read:profile"]).vipps.charges.refund({ agreementId: "a", chargeId: "c" }),
        "FORBIDDEN",
      );
      expect(stub.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const stub = sinon.stub(DAO.vipps, "getAgreement");
      await expectTrpcError(
        admin().vipps.agreements.updateChargeDay({ id: "agr_TEST1", chargeDay: 29 }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().vipps.agreements.list({
          page: 0,
          limit: 10,
          sort: { id: "pausedUntilDate" as any, desc: true },
        }),
        "BAD_REQUEST",
      );
      expect(stub.called).to.be.false;
    });
  });

  describe("agreements", () => {
    it("lists agreements with the filter converted for the DAO", async () => {
      const result = { rows: [], statistics: {}, pages: 0 } as any;
      const stub = sinon.stub(DAO.vipps, "getAgreements").resolves(result);

      const res = await admin().vipps.agreements.list({
        page: 1,
        limit: 25,
        sort: { id: "created", desc: true },
        filter: {
          amount: { from: 100, to: 500 },
          created: { from: "2026-01-01", to: "2026-01-31" },
          statuses: ["ACTIVE"],
          donor: "Ola",
        },
      });

      expect(res).to.equal(result);
      const [sort, page, limit, filter] = stub.firstCall.args;
      expect(sort).to.deep.equal({ id: "created", desc: true });
      expect(page).to.equal(1);
      expect(limit).to.equal(25);
      expect(filter!.created!.from).to.be.instanceOf(Date);
      expect(filter!.created!.to).to.be.instanceOf(Date);
      expect(filter!.statuses).to.deep.equal(["ACTIVE"]);
      expect(filter!.donor).to.equal("Ola");
    });

    it("exports agreements as CSV", async () => {
      sinon.stub(DAO.vipps, "getAgreements").resolves({
        rows: [{ ID: "agr_1", full_name: "Ola Nordmann", amount: 300 } as any],
        statistics: {} as any,
        pages: 1,
      });

      const res = await admin().vipps.agreements.export({});

      expect(res.filename).to.match(/^vipps-agreements-.*\.csv$/);
      expect(res.csv).to.equal("\uFEFFID,full_name,amount\nagr_1,Ola Nordmann,300");
    });

    it("gets an agreement synced with Vipps", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon
        .stub(vipps, "getAgreement")
        .resolves({ id: "agr_TEST1", status: "ACTIVE", pricing: { amount: 30000 } });
      const statusStub = sinon.stub(DAO.vipps, "updateAgreementStatus").resolves(true);
      const priceStub = sinon.stub(DAO.vipps, "updateAgreementPrice").resolves(true);

      const res = await admin().vipps.agreements.get({ id: "agr_TEST1" });

      expect(statusStub.calledWith("agr_TEST1", "ACTIVE")).to.be.true;
      expect(priceStub.calledWith("agr_TEST1", 300)).to.be.true;
      expect(res.agreement_url_code).to.equal("urlcode-abc");
      expect(res.pricing.amount).to.equal(30000);
    });

    it("returns NOT_FOUND for unknown agreements without calling Vipps", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(false);
      const vippsStub = sinon.stub(vipps, "getAgreement");

      await expectTrpcError(admin().vipps.agreements.get({ id: "agr_NOPE" }), "NOT_FOUND");
      expect(vippsStub.called).to.be.false;
    });

    it("does not touch the DB when Vipps cannot be reached", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(vipps, "getAgreement").resolves(false);
      const statusStub = sinon.stub(DAO.vipps, "updateAgreementStatus");

      await expectTrpcError(admin().vipps.agreements.get({ id: "agr_TEST1" }), "BAD_GATEWAY");
      expect(statusStub.called).to.be.false;
    });

    it("returns BAD_GATEWAY without the upstream error text when Vipps fails", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(console, "error");
      sinon.stub(vipps, "getAgreement").rejects(new Error("401 client_secret=hunter2"));

      try {
        await admin().vipps.agreements.get({ id: "agr_TEST1" });
        expect.fail("expected BAD_GATEWAY");
      } catch (err: any) {
        expect(err.code).to.equal("BAD_GATEWAY");
        expect(err.message).to.equal("Vipps could not fetch the agreement");
      }
    });

    it("returns the agreement report", async () => {
      sinon.stub(DAO.vipps, "getAgreementReport").resolves({ activeAgreementCount: 3 } as any);
      const res = await admin().vipps.agreements.report();
      expect(res).to.deep.equal({ activeAgreementCount: 3 });
    });

    it("returns the agreement histogram", async () => {
      const buckets = [{ bucket: 0, items: 2, bar: 69 }];
      sinon.stub(DAO.vipps, "getAgreementSumHistogram").resolves(buckets);
      const res = await admin().vipps.agreements.histogram();
      expect(res).to.deep.equal(buckets);
    });

    it("updates the price in øre with Vipps and in NOK in the DB", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      const vippsStub = sinon.stub(vipps, "updateAgreementPrice").resolves(true);
      const dbStub = sinon.stub(DAO.vipps, "updateAgreementPrice").resolves(true);

      await admin().vipps.agreements.updatePrice({ id: "agr_TEST1", amountNok: 250 });

      expect(vippsStub.calledWith("agr_TEST1", 25000)).to.be.true;
      expect(dbStub.calledWith("agr_TEST1", 250)).to.be.true;
      expect(changeMailStub.calledWith("urlcode-abc", "AMOUNT", 250)).to.be.true;
    });

    it("does not update the DB price when Vipps rejects it", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(vipps, "updateAgreementPrice").resolves(false);
      const dbStub = sinon.stub(DAO.vipps, "updateAgreementPrice");

      await expectTrpcError(
        admin().vipps.agreements.updatePrice({ id: "agr_TEST1", amountNok: 250 }),
        "BAD_GATEWAY",
      );
      expect(dbStub.called).to.be.false;
      expect(changeMailStub.called).to.be.false;
    });

    it("returns BAD_GATEWAY when Vipps throws on a price update", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(console, "error");
      sinon.stub(vipps, "updateAgreementPrice").rejects(new Error("Vipps is not configured"));

      await expectTrpcError(
        admin().vipps.agreements.updatePrice({ id: "agr_TEST1", amountNok: 250 }),
        "BAD_GATEWAY",
      );
    });

    it("rejects cancelling an agreement that is already stopped", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves({ ...dbAgreement, status: "STOPPED" });
      const vippsStub = sinon.stub(vipps, "updateAgreementStatus");

      await expectTrpcError(admin().vipps.agreements.cancel({ id: "agr_TEST1" }), "BAD_REQUEST");
      expect(vippsStub.called).to.be.false;
    });

    it("returns BAD_GATEWAY when Vipps does not cancel", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(vipps, "updateAgreementStatus").resolves(false);
      const statusStub = sinon.stub(DAO.vipps, "updateAgreementStatus");

      await expectTrpcError(admin().vipps.agreements.cancel({ id: "agr_TEST1" }), "BAD_GATEWAY");
      expect(statusStub.called).to.be.false;
    });

    it("cancels an agreement", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      const vippsStub = sinon.stub(vipps, "updateAgreementStatus").resolves(true);
      const statusStub = sinon.stub(DAO.vipps, "updateAgreementStatus").resolves(true);
      const cancelDateStub = sinon
        .stub(DAO.vipps, "updateAgreementCancellationDate")
        .resolves(true);

      await admin().vipps.agreements.cancel({ id: "agr_TEST1" });

      expect(vippsStub.calledWith("agr_TEST1", "STOPPED")).to.be.true;
      expect(statusStub.calledWith("agr_TEST1", "STOPPED")).to.be.true;
      expect(cancelDateStub.calledWith("agr_TEST1")).to.be.true;
      expect(changeMailStub.calledWith("urlcode-abc", "STOPPED")).to.be.true;
    });

    it("updates the charge day", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      const stub = sinon.stub(DAO.vipps, "updateAgreementChargeDay").resolves(true);

      await admin().vipps.agreements.updateChargeDay({ id: "agr_TEST1", chargeDay: 0 });

      expect(stub.calledWith("agr_TEST1", 0)).to.be.true;
      expect(changeMailStub.calledWith("urlcode-abc", "CHARGEDAY", 0)).to.be.true;
    });

    const stubReferences = () => {
      sinon.stub(DAO.donors, "getByID").resolves({ id: 42 } as any);
      sinon.stub(DAO.organizations, "getByIDs").resolves([
        { ID: 5, cause_area_ID: 1 },
        { ID: 6, cause_area_ID: 1 },
      ] as any);
    };

    it("updates the distribution, creating a new KID for the agreement's donor", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      stubReferences();
      sinon.stub(DAO.donors, "getIDByAgreementCode").resolves(42);
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves(null);
      sinon.stub(donationHelpers, "createKID").resolves("87654321");
      const addStub = sinon.stub(DAO.distributions, "add").resolves(true as any);
      const kidStub = sinon.stub(DAO.vipps, "updateAgreementKID").resolves(true);

      const res = await admin().vipps.agreements.updateDistribution({
        id: "agr_TEST1",
        distribution,
      });

      expect(res).to.deep.equal({ KID: "87654321" });
      expect(addStub.firstCall.args[0]).to.include({ donorId: 42, kid: "87654321" });
      expect(kidStub.calledWith("agr_TEST1", "87654321")).to.be.true;
      expect(changeMailStub.calledWith("urlcode-abc", "SHARES", "87654321")).to.be.true;
    });

    it("rejects another donor's tax unit", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      stubReferences();
      sinon.stub(DAO.tax, "getById").resolves({ id: 9, donorId: 7, archived: null } as any);
      const kidStub = sinon.stub(DAO.vipps, "updateAgreementKID");
      const addStub = sinon.stub(DAO.distributions, "add");

      await expectTrpcError(
        admin().vipps.agreements.updateDistribution({
          id: "agr_TEST1",
          distribution: { ...distribution, taxUnitId: 9 },
        }),
        "BAD_REQUEST",
      );
      expect(kidStub.called).to.be.false;
      expect(addStub.called).to.be.false;
    });

    it("rejects an organization outside its cause area", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(DAO.donors, "getByID").resolves({ id: 42 } as any);
      sinon.stub(DAO.organizations, "getByIDs").resolves([
        { ID: 5, cause_area_ID: 1 },
        { ID: 6, cause_area_ID: 2 },
      ] as any);
      const kidStub = sinon.stub(DAO.vipps, "updateAgreementKID");

      await expectTrpcError(
        admin().vipps.agreements.updateDistribution({ id: "agr_TEST1", distribution }),
        "BAD_REQUEST",
      );
      expect(kidStub.called).to.be.false;
    });

    it("rejects a distribution that does not sum to 100", async () => {
      sinon.stub(DAO.vipps, "getAgreement").resolves(dbAgreement);
      sinon.stub(DAO.donors, "getIDByAgreementCode").resolves(42);
      const kidStub = sinon.stub(DAO.vipps, "updateAgreementKID");

      await expectTrpcError(
        admin().vipps.agreements.updateDistribution({
          id: "agr_TEST1",
          distribution: {
            ...distribution,
            causeAreas: [{ ...distribution.causeAreas[0], percentageShare: "90" }],
          },
        }),
        "BAD_REQUEST",
      );
      expect(kidStub.called).to.be.false;
    });
  });

  describe("charges", () => {
    it("lists charges with the default sort, without the window aggregates", async () => {
      const row = {
        full_count: 1,
        full_sum: "300",
        full_avg: "300.0000",
        chargeID: "chr1",
        amountNOK: 300,
      } as any;
      const statistics = { numCharges: 1, sumCharges: "300", avgCharge: "300.0000" };
      const stub = sinon
        .stub(DAO.vipps, "getCharges")
        .resolves({ rows: [row], statistics, pages: 1 });

      const res = await admin().vipps.charges.list({
        page: 0,
        limit: 25,
        filter: { dueDate: { from: "2026-01-01" }, statuses: ["CHARGED"] },
      });

      expect(res).to.deep.equal({
        rows: [{ chargeID: "chr1", amountNOK: 300 }],
        statistics,
        pages: 1,
      });
      expect(stub.firstCall.args).to.deep.equal([
        { id: "dueDate", desc: true },
        0,
        25,
        { dueDate: { from: "2026-01-01" }, statuses: ["CHARGED"] },
      ]);
    });

    it("exports charges as CSV without the window aggregates", async () => {
      sinon.stub(DAO.vipps, "getCharges").resolves({
        rows: [
          { full_count: 1, full_sum: "300", full_avg: "300", chargeID: "chr1", amountNOK: 300 },
        ] as any,
        statistics: {} as any,
        pages: 1,
      });

      const res = await admin().vipps.charges.export({});

      expect(res.filename).to.match(/^vipps-charges-.*\.csv$/);
      expect(res.csv).to.equal("\uFEFFchargeID,amountNOK\nchr1,300");
    });

    it("returns the charge histogram", async () => {
      const buckets = [{ bucket: 500, items: 1, bar: 0 }];
      sinon.stub(DAO.vipps, "getChargeSumHistogram").resolves(buckets);
      const res = await admin().vipps.charges.histogram();
      expect(res).to.deep.equal(buckets);
    });

    const charge = (status: string) => ({
      chargeID: "chr1",
      agreementID: "agr_TEST1",
      status,
      amountNOK: 300,
    });

    it("refunds a charge and marks it REFUNDED", async () => {
      sinon.stub(DAO.vipps, "getCharge").resolves(charge("CHARGED"));
      sinon.stub(vipps, "refundCharge").resolves(true);
      const statusStub = sinon.stub(DAO.vipps, "updateChargeStatus").resolves(true);

      await admin().vipps.charges.refund({ agreementId: "agr_TEST1", chargeId: "chr1" });

      expect(statusStub.calledWith("REFUNDED", "agr_TEST1", "chr1")).to.be.true;
    });

    it("reports a refund Vipps refused", async () => {
      sinon.stub(DAO.vipps, "getCharge").resolves(charge("CHARGED"));
      sinon.stub(vipps, "refundCharge").resolves(false);
      const statusStub = sinon.stub(DAO.vipps, "updateChargeStatus");

      await expectTrpcError(
        admin().vipps.charges.refund({ agreementId: "agr_TEST1", chargeId: "chr1" }),
        "BAD_GATEWAY",
      );
      expect(statusStub.called).to.be.false;
    });

    it("returns NOT_FOUND for an unknown charge", async () => {
      sinon.stub(DAO.vipps, "getCharge").resolves(false);
      const refundStub = sinon.stub(vipps, "refundCharge");

      await expectTrpcError(
        admin().vipps.charges.refund({ agreementId: "agr_TEST1", chargeId: "chr1" }),
        "NOT_FOUND",
      );
      expect(refundStub.called).to.be.false;
    });

    it("only refunds CHARGED charges", async () => {
      sinon.stub(DAO.vipps, "getCharge").resolves(charge("PENDING"));
      const refundStub = sinon.stub(vipps, "refundCharge");

      await expectTrpcError(
        admin().vipps.charges.refund({ agreementId: "agr_TEST1", chargeId: "chr1" }),
        "BAD_REQUEST",
      );
      expect(refundStub.called).to.be.false;
    });
  });

  describe("matching rules", () => {
    const rules = [
      {
        id: 1,
        salesLocation: "Stand",
        message: null,
        periodFrom: new Date(2026, 0, 1),
        periodTo: new Date(2026, 0, 31),
        resolveKID: "111",
        precedence: 1,
      },
      {
        id: 2,
        salesLocation: null,
        message: "Julegave",
        periodFrom: new Date(2026, 11, 1),
        periodTo: new Date(2026, 11, 31),
        resolveKID: "222",
        precedence: null,
      },
    ];

    it("lists all rules", async () => {
      sinon.stub(DAO.vipps, "getMatchingRules").resolves(rules);
      const res = await admin().vipps.matchingRules.list();
      expect(res.map((r) => r.id)).to.deep.equal([1, 2]);
    });

    it("lists rules overlapping a period", async () => {
      sinon.stub(DAO.vipps, "getMatchingRules").resolves(rules);
      const res = await admin().vipps.matchingRules.list({
        period: { from: "2026-01-31", to: "2026-02-15" },
      });
      expect(res.map((r) => r.id)).to.deep.equal([1]);
    });

    it("creates a rule", async () => {
      sinon.stub(DAO.distributions, "KIDexists").resolves(true);
      const addStub = sinon.stub(DAO.vipps, "addMatchingRule").resolves(9);

      const res = await admin().vipps.matchingRules.create({
        salesLocation: "Stand",
        message: null,
        periodFrom: "2026-03-01",
        periodTo: "2026-03-31",
        resolveKID: "111",
        precedence: 2,
      });

      expect(res).to.deep.equal({ id: 9 });
      expect(addStub.firstCall.args[0]).to.include({
        resolveKID: "111",
        periodFrom: "2026-03-01",
      });
    });

    it("rejects a rule for an unknown KID", async () => {
      sinon.stub(DAO.distributions, "KIDexists").resolves(false);
      const addStub = sinon.stub(DAO.vipps, "addMatchingRule");

      await expectTrpcError(
        admin().vipps.matchingRules.create({
          salesLocation: null,
          message: null,
          periodFrom: "2026-03-01",
          periodTo: "2026-03-31",
          resolveKID: "999",
          precedence: null,
        }),
        "BAD_REQUEST",
      );
      expect(addStub.called).to.be.false;
    });

    it("updates a rule with the create validation, NOT_FOUND when missing", async () => {
      const kidExists = sinon.stub(DAO.distributions, "KIDexists").resolves(true);
      const update = sinon
        .stub(DAO.vipps, "updateMatchingRule")
        .callsFake(async (ruleId) => ruleId === 4);
      const rule = {
        id: 4,
        salesLocation: "Stand",
        message: "gave",
        periodFrom: "2026-03-01",
        periodTo: "2026-03-31",
        resolveKID: "111",
        precedence: 2,
      };

      expect(await admin().vipps.matchingRules.update(rule)).to.deep.equal({ id: 4 });
      const { id, ...fields } = rule;
      expect(update.firstCall.args).to.deep.equal([id, fields]);

      await expectTrpcError(admin().vipps.matchingRules.update({ ...rule, id: 5 }), "NOT_FOUND");
      await expectTrpcError(
        admin().vipps.matchingRules.update({ ...rule, periodTo: "2026-03-01" }),
        "BAD_REQUEST",
      );
      kidExists.resolves(false);
      await expectTrpcError(admin().vipps.matchingRules.update(rule), "BAD_REQUEST");
      await expectTrpcError(
        admin().vipps.matchingRules.update({ ...rule, salesLocation: "x".repeat(46) }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().vipps.matchingRules.update({ ...rule, id: undefined } as any),
        "BAD_REQUEST",
      );
      expect(update.callCount).to.equal(2);
    });

    it("deletes a rule, NOT_FOUND when missing", async () => {
      const stub = sinon.stub(DAO.vipps, "deleteMatchingRule");
      stub.withArgs(1).resolves(true);
      stub.withArgs(2).resolves(false);

      await admin().vipps.matchingRules.delete({ id: 1 });
      await expectTrpcError(admin().vipps.matchingRules.delete({ id: 2 }), "NOT_FOUND");
    });
  });
});
