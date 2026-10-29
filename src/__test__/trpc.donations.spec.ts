import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as mail from "../custom_modules/mail";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const config = require("../config");

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

const distribution = {
  donorId: 7,
  taxUnitId: null,
  causeAreas: [
    {
      id: 1,
      percentageShare: "100",
      standardSplit: false,
      organizations: [
        { id: 2, percentageShare: "60" },
        { id: 3, percentageShare: "40" },
      ],
    },
  ],
};

const existingDonation = {
  id: 42,
  donorId: 7,
  KID: "12345678",
  sum: "100.00",
  paymentExternalRef: null,
};

/** Stubs the lookups the procedures validate references against */
const stubLookups = () => ({
  methods: sinon.stub(DAO.payment, "getMethods").resolves([{ id: 5 }] as any),
  owners: sinon
    .stub(DAO.meta, "getDataOwners")
    .resolves([{ id: 3, name: "Owner", default: true }] as any),
  externalRefExists: sinon.stub(DAO.donations, "externalRefExists").resolves(false),
  donor: sinon.stub(DAO.donors, "getByID").resolves({ id: 7 } as any),
  organizations: sinon.stub(DAO.organizations, "getByIDs").resolves([
    { ID: 2, cause_area_ID: 1 },
    { ID: 3, cause_area_ID: 1 },
  ] as any),
});

describe("tRPC donations router", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("auth and validation", () => {
    it("rejects anonymous callers", async () => {
      const stub = sinon.stub(DAO.donations, "getHistogramBySum").resolves([]);
      await expectTrpcError(callerWith().donations.histogram(), "UNAUTHORIZED");
      await expectTrpcError(callerWith().donations.distributions.get({ kid: "1" }), "UNAUTHORIZED");
      expect(stub.called).to.be.false;
    });

    it("rejects non-admin callers", async () => {
      const stub = sinon.stub(DAO.donations, "remove").resolves(true);
      await expectTrpcError(callerWith(["read:profile"]).donations.delete({ id: 1 }), "FORBIDDEN");
      expect(stub.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const getAll = sinon.stub(DAO.donations, "getAll");
      await expectTrpcError(admin().donations.list({ page: -1, limit: 10 }), "BAD_REQUEST");
      await expectTrpcError(
        admin().donations.list({ page: 0, limit: 10, sort: { id: "nope" as any, desc: true } }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().donations.list({ page: 0, limit: 10, filter: { date: { from: "yesterday" } } }),
        "BAD_REQUEST",
      );
      expect(getAll.called).to.be.false;
    });

    it("rejects distributions whose shares do not sum to 100", async () => {
      const add = sinon.stub(DAO.distributions, "add");
      await expectTrpcError(
        admin().donations.distributions.create({
          ...distribution,
          metaOwnerId: 1,
          causeAreas: [
            {
              ...distribution.causeAreas[0],
              organizations: [
                { id: 2, percentageShare: "60" },
                { id: 3, percentageShare: "30" },
              ],
            },
          ],
        }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().donations.distributions.create({
          ...distribution,
          metaOwnerId: 1,
          causeAreas: [{ ...distribution.causeAreas[0], percentageShare: "90" }],
        }),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });
  });

  describe("donations", () => {
    it("lists donations with converted filter, default sort and locale", async () => {
      const row = {
        id: 1,
        donor: "A",
        paymentMethod: "Bank",
        sum: "10.00",
        transactionCost: null,
        kid: "1",
        timestamp: new Date(),
        taxUnitType: "person",
      };
      const getAll = sinon.stub(DAO.donations, "getAll").resolves({
        rows: [row],
        pages: 1,
        statistics: { numDonations: 1, sumDonations: "10.00", avgDonation: "10.000000" },
      } as any);

      sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());
      const res = await admin().donations.list({
        page: 2,
        limit: 25,
        filter: {
          date: { from: "2025-01-01", to: "2025-12-31T23:59:59Z" },
          taxUnitTypes: ["person" as any, null],
          paymentMethodIDs: [4],
        },
      });

      expect(res).to.deep.equal({
        rows: [{ ...row, orgSplit: [] }],
        pages: 1,
        statistics: { numDonations: 1, sumDonations: "10.00", avgDonation: "10.000000" },
      });
      const [sort, page, limit, filter, locale] = getAll.firstCall.args;
      expect(sort).to.deep.equal({ id: "timestamp", desc: true });
      expect(page).to.equal(2);
      expect(limit).to.equal(25);
      // A date is the whole Oslo day; a date-time is the exact (inclusive) instant
      expect(filter!.date).to.deep.equal({
        from: new Date("2024-12-31T23:00:00.000Z"),
        before: new Date("2025-12-31T23:59:59.001Z"),
      });
      expect(filter!.taxUnitTypes).to.deep.equal(["person", null]);
      expect(locale).to.equal("NO");
    });

    it("returns string statistics when the page is empty", async () => {
      sinon.stub(DAO.donations, "getAll").resolves({
        rows: [],
        pages: 0,
        statistics: { numDonations: 0, sumDonations: 0, avgDonation: 0 },
      });
      const res = await admin().donations.list({ page: 0, limit: 10 });
      expect(res.statistics).to.deep.equal({
        numDonations: 0,
        sumDonations: "0",
        avgDonation: "0",
      });
    });

    it("exports donations as csv", async () => {
      const getAll = sinon.stub(DAO.donations, "getAll").resolves({
        rows: [{ id: 1, donor: "A, B", sum: 10 }],
        pages: 1,
        statistics: { numDonations: 1, sumDonations: "10", avgDonation: "10" },
      } as any);

      const res = await admin().donations.export({ locale: "SV" as any });

      expect(getAll.firstCall.args[2]).to.equal(Number.MAX_SAFE_INTEGER);
      expect(getAll.firstCall.args[4]).to.equal("SV");
      expect(res.filename).to.match(/^donations-.*\.csv$/);
      expect(res.csv).to.equal('﻿id,donor,sum\n1,"A, B",10');
    });

    it("gets a donation and maps missing ones to NOT_FOUND", async () => {
      const getByID = sinon.stub(DAO.donations, "getByID");
      getByID.withArgs(42).resolves(existingDonation as any);
      getByID.withArgs(43).rejects(new Error("Could not find donation with ID 43"));

      expect(await admin().donations.get({ id: 42 })).to.equal(existingDonation);
      await expectTrpcError(admin().donations.get({ id: 43 }), "NOT_FOUND");
    });

    it("updates fields and moves the donation to a matching KID", async () => {
      stubLookups();
      sinon.stub(DAO.donations, "getByID").resolves(existingDonation as any);
      const update = sinon.stub(DAO.donations, "update").resolves();
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({} as any);
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves("87654321");
      const updateKID = sinon.stub(DAO.donations, "updateKIDById").resolves(true);
      const updateDonor = sinon.stub(DAO.donations, "updateDonorId").resolves();

      await admin().donations.update({
        id: 42,
        sum: 200,
        timestamp: "2025-03-01T10:00:00Z",
        transactionCost: 0,
        distribution: { ...distribution, donorId: 8 },
      });

      expect(update.firstCall.args[0]).to.deep.include({ id: 42, sum: 200, transactionCost: 0 });
      expect(update.firstCall.args[0].timestamp!.toISOString()).to.equal(
        "2025-03-01T10:00:00.000Z",
      );
      expect(update.firstCall.args[0].paymentId).to.be.undefined;
      expect(updateKID.calledOnceWithExactly(42, "87654321")).to.be.true;
      expect(updateDonor.calledOnceWithExactly(42, 8)).to.be.true;
    });

    it("validates references and amounts before updating", async () => {
      const lookups = stubLookups();
      sinon.stub(DAO.donations, "getByID").resolves(existingDonation as any);
      const update = sinon.stub(DAO.donations, "update").resolves();

      await expectTrpcError(admin().donations.update({ id: 42, sum: 1.234 }), "BAD_REQUEST");
      await expectTrpcError(admin().donations.update({ id: 42, sum: 0 }), "BAD_REQUEST");
      await expectTrpcError(
        admin().donations.update({ id: 42, paymentExternalRef: "x".repeat(33) }),
        "BAD_REQUEST",
      );
      await expectTrpcError(admin().donations.update({ id: 42, paymentId: 6 }), "BAD_REQUEST");
      await expectTrpcError(admin().donations.update({ id: 42, metaOwnerId: 4 }), "BAD_REQUEST");
      // Organization 3 does not belong to cause area 1
      lookups.organizations.resolves([
        { ID: 2, cause_area_ID: 1 },
        { ID: 3, cause_area_ID: 2 },
      ] as any);
      await expectTrpcError(admin().donations.update({ id: 42, distribution }), "BAD_REQUEST");

      lookups.externalRefExists.withArgs("taken").resolves(true);
      await expectTrpcError(
        admin().donations.update({ id: 42, paymentExternalRef: "taken" }),
        "CONFLICT",
      );
      expect(update.called).to.be.false;
    });

    it("deletes a donation", async () => {
      const remove = sinon.stub(DAO.donations, "remove");
      remove.withArgs(42).resolves(true);
      remove.withArgs(43).resolves(false);

      await admin().donations.delete({ id: 42 });
      await expectTrpcError(admin().donations.delete({ id: 43 }), "NOT_FOUND");
    });

    it("resends a receipt, optionally to another address", async () => {
      const getByID = sinon.stub(DAO.donations, "getByID").resolves(existingDonation as any);
      getByID.withArgs(43).rejects(new Error("Could not find donation with ID 43"));
      const send = sinon.stub(mail, "sendDonationReceipt").resolves(true);

      await admin().donations.resendReceipt({ id: 42 });
      await admin().donations.resendReceipt({ id: 42, email: "other@example.org" });

      expect(send.firstCall.args).to.deep.equal([42, null]);
      expect(send.secondCall.args).to.deep.equal([42, "other@example.org"]);

      // A failed send is a mail service error with a message the admin can show
      send.resolves(401 as any);
      await expectTrpcError(admin().donations.resendReceipt({ id: 42 }), "BAD_GATEWAY");
      send.resolves(false as any);
      await expectTrpcError(admin().donations.resendReceipt({ id: 42 }), "BAD_GATEWAY");

      send.resetHistory();
      await expectTrpcError(admin().donations.resendReceipt({ id: 43 }), "NOT_FOUND");
      expect(send.called).to.be.false;
    });

    it("builds log-scale histogram buckets", async () => {
      const log = sinon.stub(DAO.donations, "getLogHistogramBySum").resolves([]);
      await admin().donations.histogram({ scale: "log" });
      await admin().donations.histogram({ scale: "log", buckets: 30 });
      expect(log.args).to.deep.equal([[20], [30]]);
      await expectTrpcError(
        admin().donations.histogram({ scale: "log", buckets: 4 }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().donations.histogram({ scale: "fixed", buckets: 20 } as any),
        "BAD_REQUEST",
      );

      const query = sinon.stub(DAO, "query");
      query
        .onFirstCall()
        .resolves([[{ min: "-100.00", minPositive: "10.00", max: "1000000.00" }]] as any);
      query.onSecondCall().resolves([
        [
          { idx: 0, items: 2 },
          { idx: 1, items: 50 },
          { idx: 5, items: 1 },
          // Sums equal to the last edge
          { idx: 6, items: 2 },
        ],
      ] as any);
      log.restore();
      const buckets = await admin().donations.histogram({ scale: "log", buckets: 5 });
      expect(query.secondCall.args[0]).to.match(
        /INTERVAL\(sum_confirmed, \?, \?, \?, \?, \?, \?\)/,
      );
      expect(query.secondCall.args[1]).to.deep.equal([10, 100, 1000, 10000, 100000, 1000000]);
      expect(buckets).to.deep.equal([
        { bucket: -100, bucketEnd: 10, items: 2, bar: 69 },
        { bucket: 10, bucketEnd: 100, items: 50, bar: 391 },
        { bucket: 100, bucketEnd: 1000, items: 0, bar: 0 },
        { bucket: 1000, bucketEnd: 10000, items: 0, bar: 0 },
        { bucket: 10000, bucketEnd: 100000, items: 0, bar: 0 },
        { bucket: 100000, bucketEnd: 1000000, items: 3, bar: 110 },
      ]);
    });

    it("returns histogram, transaction cost report, totals and donations by KID", async () => {
      const bucket = { bucket: "5000", items: 1, bar: 0 } as any;
      const report = { donationsCount: 1, costYTD: "1" } as any;
      const aggregate = { id: 1, orgName: "Org", chartColor: null, sum: "1.00" };
      const month = { year: 2025, month: 1, sum: "1.00" };
      sinon.stub(DAO.donations, "getHistogramBySum").resolves([bucket]);
      sinon.stub(DAO.donations, "getTransactionCostsReport").resolves(report);
      const total = sinon.stub(DAO.donations, "getAggregateByTime").resolves([aggregate]);
      sinon.stub(DAO.donations, "getAggregateLastYearByMonth").resolves([month]);
      const byKid = sinon.stub(DAO.donations, "getAllByKID").resolves([{ id: 1 }] as any);

      expect(await admin().donations.histogram()).to.deep.equal([
        { bucket: 5000, bucketEnd: 10000, items: 1, bar: 0 },
      ]);
      expect(await admin().donations.transactionCostsReport()).to.deep.equal(report);
      expect(
        await admin().donations.total({ fromDate: "2025-01-01", toDate: "2025-02-01" }),
      ).to.deep.equal([aggregate]);
      expect(total.firstCall.args[0]).to.be.instanceOf(Date);
      expect(await admin().donations.totalMonthly()).to.deep.equal([month]);
      expect(await admin().donations.byKid({ kid: "123" })).to.deep.equal([{ id: 1 }]);
      expect(byKid.calledOnceWithExactly("123")).to.be.true;
    });
  });

  describe("register", () => {
    const base = {
      sum: 500,
      timestamp: "2025-05-05T12:00:00Z",
      paymentId: 5,
      paymentExternalRef: "ext-1",
      metaOwnerId: 3,
      sendReceipt: true,
    };
    let originalEnv: string;

    let lookups: ReturnType<typeof stubLookups>;

    beforeEach(() => {
      originalEnv = config.env;
      lookups = stubLookups();
    });

    afterEach(() => {
      config.env = originalEnv;
    });

    it("registers a donation on an existing KID and sends a receipt in production", async () => {
      config.env = "production";
      const add = sinon.stub(DAO.donations, "add").resolves(99);
      const send = sinon.stub(mail, "sendDonationReceipt").resolves(true);

      const res = await admin().donations.register({ ...base, KID: "12345678" });

      expect(res).to.deep.equal({ donationId: 99, KID: "12345678", newDistribution: false });
      const [kid, method, sum, timestamp, ref, owner] = add.firstCall.args;
      expect([kid, method, sum, ref, owner]).to.deep.equal(["12345678", 5, 500, "ext-1", 3]);
      expect((timestamp as Date).toISOString()).to.equal("2025-05-05T12:00:00.000Z");
      expect(send.calledOnceWithExactly(99)).to.be.true;
    });

    it("does not send receipts outside production", async () => {
      config.env = "development";
      sinon.stub(DAO.donations, "add").resolves(99);
      const send = sinon.stub(mail, "sendDonationReceipt").resolves(true);

      await admin().donations.register({ ...base, KID: "12345678" });

      expect(send.called).to.be.false;
    });

    it("creates a distribution first when no KID is given", async () => {
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves(null);
      sinon.stub(donationHelpers, "createKID").resolves("11112222");
      const addDistribution = sinon.stub(DAO.distributions, "add").resolves(true);
      const add = sinon.stub(DAO.donations, "add").resolves(100);

      const res = await admin().donations.register({
        ...base,
        sendReceipt: false,
        distribution,
      });

      expect(res).to.deep.equal({ donationId: 100, KID: "11112222", newDistribution: true });
      expect(addDistribution.firstCall.args[0]).to.deep.include({ kid: "11112222", donorId: 7 });
      expect(addDistribution.firstCall.args[1]).to.equal(3);
      expect(addDistribution.calledBefore(add)).to.be.true;
      expect(add.firstCall.args[0]).to.equal("11112222");
    });

    it("requires exactly one of KID and distribution", async () => {
      const add = sinon.stub(DAO.donations, "add");
      await expectTrpcError(admin().donations.register(base), "BAD_REQUEST");
      await expectTrpcError(
        admin().donations.register({ ...base, KID: "1", distribution }),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });

    it("rejects unknown payment methods and data owners, and bad amounts and refs", async () => {
      const add = sinon.stub(DAO.donations, "add");
      const register = (
        input: Partial<Parameters<ReturnType<typeof admin>["donations"]["register"]>[0]>,
      ) => admin().donations.register({ ...base, KID: "12345678", ...input });
      await expectTrpcError(register({ paymentId: 6 }), "BAD_REQUEST");
      await expectTrpcError(register({ metaOwnerId: 4 }), "BAD_REQUEST");
      await expectTrpcError(register({ sum: 10.001 }), "BAD_REQUEST");
      await expectTrpcError(register({ paymentExternalRef: "x".repeat(33) }), "BAD_REQUEST");
      expect(add.called).to.be.false;
    });

    it("checks the distribution's references before creating it", async () => {
      lookups.donor.resolves(null);
      const addDistribution = sinon.stub(DAO.distributions, "add");
      await expectTrpcError(admin().donations.register({ ...base, distribution }), "BAD_REQUEST");
      expect(addDistribution.called).to.be.false;
    });

    it("returns CONFLICT for an external ref used by any payment method", async () => {
      lookups.externalRefExists.withArgs("ext-1").resolves(true);
      const add = sinon.stub(DAO.donations, "add");
      await expectTrpcError(admin().donations.register({ ...base, KID: "12345678" }), "CONFLICT");
      expect(add.called).to.be.false;
    });

    it("maps duplicate external refs to CONFLICT", async () => {
      sinon
        .stub(DAO.donations, "add")
        .rejects(new Error("EXISTING_DONATION | Already a donation with ExternalPaymentID"));
      await expectTrpcError(admin().donations.register({ ...base, KID: "12345678" }), "CONFLICT");
    });
  });

  describe("free text query", () => {
    it("matches id, KID, donor name or email, escaping wildcards", async () => {
      const query = sinon.stub(DAO, "query");
      query.resolves([[{ abbriv: "AMF" }], []] as any);
      await DAO.donations.getAll(
        { id: "timestamp", desc: true },
        0,
        10,
        { query: " 1234 ", paymentMethodIDs: [4] },
        "NO" as any,
      );
      const donationSql = query.lastCall.args[0] as string;
      expect(donationSql).to.contain(
        "(Donations.ID = 1234 OR Donations.KID_fordeling LIKE '%1234%' OR Donors.full_name LIKE '%1234%' OR Donors.email LIKE '%1234%')",
      );
      expect(donationSql).to.contain("Donations.Payment_ID IN (4)");

      await DAO.distributions.getAll(0, 10, { id: "KID", desc: true }, { query: "50%_ola" });
      const distributionSql = query.lastCall.args[0] as string;
      expect(distributionSql).to.contain(
        "(D.KID LIKE '%50\\\\%\\\\_ola%' OR Donors.full_name LIKE '%50\\\\%\\\\_ola%' OR Donors.email LIKE '%50\\\\%\\\\_ola%')",
      );
    });

    it("accepts query in the procedure filters", async () => {
      const getAll = sinon.stub(DAO.distributions, "getAll").resolves({
        rows: [],
        statistics: { numDistributions: 0 },
        pages: 0,
      });
      await admin().donations.distributions.list({ page: 0, limit: 10, filter: { query: " 77 " } });
      expect(getAll.firstCall.args[3]).to.deep.equal({ query: "77" });
    });
  });

  describe("distributions", () => {
    it("lists and exports distributions", async () => {
      const getAll = sinon.stub(DAO.distributions, "getAll").resolves({
        rows: [{ KID: "1", full_name: "A", email: "a@b", donation_sum: "1.00", donation_count: 1 }],
        statistics: { numDistributions: 1 },
        pages: 1,
      });

      sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());
      const list = await admin().donations.distributions.list({
        page: 0,
        limit: 10,
        filter: { donor: "a" },
      });
      expect(list.pages).to.equal(1);
      expect(getAll.firstCall.args).to.deep.equal([
        0,
        10,
        { id: "KID", desc: true },
        { donor: "a" },
      ]);

      const exported = await admin().donations.distributions.export({});
      expect(exported.csv).to.equal(
        "﻿KID,full_name,email,donation_sum,donation_count\n1,A,a@b,1.00,1",
      );
    });

    it("gets a distribution with donor and tax unit", async () => {
      const split = { kid: "123", donorId: 7, taxUnitId: 9, causeAreas: [] };
      const getSplit = sinon.stub(DAO.distributions, "getSplitByKID");
      getSplit.withArgs("123").resolves(split as any);
      getSplit.withArgs("404").rejects(new Error("NOT FOUND | No distribution with the KID 404"));
      sinon.stub(DAO.donors, "getByID").resolves({ id: 7 } as any);
      sinon.stub(DAO.tax, "getById").resolves({ id: 9 } as any);

      const res = await admin().donations.distributions.get({ kid: "123" });
      expect(res).to.deep.equal({ ...split, donor: { id: 7, trash: false }, taxUnit: { id: 9 } });

      await expectTrpcError(admin().donations.distributions.get({ kid: "404" }), "NOT_FOUND");
    });

    it("rejects a distribution whose references do not exist", async () => {
      const lookups = stubLookups();
      const add = sinon.stub(DAO.distributions, "add");
      await expectTrpcError(
        admin().donations.distributions.create({ ...distribution, metaOwnerId: 4 }),
        "BAD_REQUEST",
      );
      lookups.organizations.resolves([{ ID: 2, cause_area_ID: 1 }] as any);
      await expectTrpcError(
        admin().donations.distributions.create({ ...distribution, metaOwnerId: 3 }),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });

    it("creates a distribution or returns the KID of an existing split", async () => {
      stubLookups();
      const bySplit = sinon.stub(DAO.distributions, "getKIDbySplit").resolves("55556666");
      const add = sinon.stub(DAO.distributions, "add").resolves(true);

      expect(
        await admin().donations.distributions.create({ ...distribution, metaOwnerId: 3 }),
      ).to.deep.equal({ KID: "55556666", newDistribution: false });
      expect(add.called).to.be.false;

      bySplit.resolves(null);
      sinon.stub(donationHelpers, "createKID").resolves("77778888");
      expect(
        await admin().donations.distributions.create({ ...distribution, metaOwnerId: 3 }),
      ).to.deep.equal({ KID: "77778888", newDistribution: true });
      expect(add.firstCall.args[0]).to.deep.include({ kid: "77778888", taxUnitId: null });
      expect(add.firstCall.args[1]).to.equal(3);
    });
  });
});
