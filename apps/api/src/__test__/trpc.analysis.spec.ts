import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { AnalysisOverviewTotals, buildOverview } from "../custom_modules/DAO_modules/analysis";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

/**
 * The analysis router: the overview and pledges (tilsagn). Ported from Nicolai's REST tests
 * (effekt-backend #825 analysis.spec.ts, #826 pledges.spec.ts): buildOverview unchanged, the
 * route and parsePledgeInput cases as procedure calls.
 */
const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]);

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const totals: AnalysisOverviewTotals = {
  year: 2026,
  thisYearSum: 1_234_567.89,
  throughTimeMeasured: 171_237_465.4,
  throughTimeDonations: 1000,
  throughTimeFrom: new Date("2015-06-01T10:00:00Z"),
  openPledgesSum: 27_350_000,
  openPledgesCount: 3,
};

const pledge = {
  id: 1,
  sum: 1_350_000,
  decidedDate: "2026-10-23",
  receivedDate: null,
  donationId: null,
};

describe("analysis", () => {
  afterEach(() => sinon.restore());

  describe("buildOverview", () => {
    it("keeps measured and pledges apart, and adds them only in withPledges", () => {
      const overview = buildOverview(totals);
      expect(overview.throughTime.measured).to.equal(171_237_465);
      expect(overview.pledges.open).to.equal(27_350_000);
      expect(overview.withPledges.sum).to.equal(198_587_465);
      expect(overview.thisYear).to.deep.equal({ year: 2026, sum: 1_234_568 });
      expect(overview.throughTime.from).to.equal("2015-06-01");
    });

    it("counts down to the milestone with pledges", () => {
      const overview = buildOverview(totals, 200_000_000);
      expect(overview.withPledges.remaining).to.equal(1_412_535);
      expect(overview.withPledges.passed).to.be.false;
    });

    it("stops at zero once the milestone is passed", () => {
      const overview = buildOverview({ ...totals, openPledgesSum: 30_000_000 }, 200_000_000);
      expect(overview.withPledges.remaining).to.equal(0);
      expect(overview.withPledges.passed).to.be.true;
    });

    it("handles no pledges and no donations", () => {
      const overview = buildOverview({
        ...totals,
        thisYearSum: 0,
        throughTimeMeasured: 0,
        throughTimeDonations: 0,
        throughTimeFrom: null,
        openPledgesSum: 0,
        openPledgesCount: 0,
      });
      expect(overview.withPledges.sum).to.equal(0);
      expect(overview.throughTime.from).to.be.null;
    });
  });

  describe("access", () => {
    it("rejects anonymous callers and non-admins", async () => {
      const stub = sinon.stub(DAO.analysis, "getOverviewTotals").resolves(totals);
      const add = sinon.stub(DAO.pledges, "add").resolves(1);
      await expectCode(callerWith().analysis.overview(), "UNAUTHORIZED");
      await expectCode(callerWith(["read:profile"]).analysis.overview(), "FORBIDDEN");
      await expectCode(
        callerWith(["read:profile"]).analysis.pledges.create({ sum: 1, decidedDate: "2026-10-23" }),
        "FORBIDDEN",
      );
      expect(stub.called).to.be.false;
      expect(add.called).to.be.false;
    });
  });

  describe("overview", () => {
    it("returns the same numbers as GET /analysis/overview, money as decimal strings", async () => {
      sinon.stub(DAO.analysis, "getOverviewTotals").resolves(totals);
      expect(await admin().analysis.overview()).to.deep.equal({
        thisYear: { year: 2026, sum: "1234568" },
        throughTime: { measured: "171237465", donations: 1000, from: "2015-06-01" },
        pledges: { open: "27350000", count: 3 },
        withPledges: {
          sum: "198587465",
          milestone: "200000000",
          remaining: "1412535",
          passed: false,
        },
      });
    });

    it("passes database errors on", async () => {
      sinon.stub(DAO.analysis, "getOverviewTotals").rejects(new Error("db down"));
      await expectCode(admin().analysis.overview(), "INTERNAL_SERVER_ERROR");
    });
  });

  describe("pledges", () => {
    it("lists pledges with the sum as a decimal string", async () => {
      sinon.stub(DAO.pledges, "getAll").resolves([pledge, { ...pledge, id: 2, sum: 100.5 }]);
      expect(await admin().analysis.pledges.list()).to.deep.equal([
        { ...pledge, sum: "1350000.00" },
        { ...pledge, id: 2, sum: "100.50" },
      ]);
    });

    it("adds an open pledge with only sum and decided date", async () => {
      const add = sinon.stub(DAO.pledges, "add").resolves(1);
      sinon.stub(DAO.pledges, "getById").resolves(pledge);
      const created = await admin().analysis.pledges.create({
        sum: 1_350_000,
        decidedDate: "2026-10-23",
      });
      expect(add.firstCall.args[0]).to.deep.equal({
        sum: 1_350_000,
        decidedDate: "2026-10-23",
        receivedDate: null,
        donationId: null,
      });
      expect(created).to.deep.equal({ ...pledge, sum: "1350000.00" });
    });

    it("rejects any other field, so nothing about the giver is stored", async () => {
      const add = sinon.stub(DAO.pledges, "add").resolves(1);
      await expectCode(
        admin().analysis.pledges.create({
          sum: 100,
          decidedDate: "2026-10-23",
          name: "Someone",
        } as never),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });

    it("accepts a received pledge with a donation", async () => {
      sinon.stub(DAO.pledges, "donationExists").resolves(true);
      const add = sinon.stub(DAO.pledges, "add").resolves(4);
      sinon.stub(DAO.pledges, "getById").resolves({
        ...pledge,
        id: 4,
        sum: 100.5,
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      await admin().analysis.pledges.create({
        sum: 100.5,
        decidedDate: "2026-10-23",
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      expect(add.firstCall.args[0]).to.include({ receivedDate: "2026-11-02", donationId: 42 });
    });

    it("rejects invalid input without touching the database", async () => {
      const add = sinon.stub(DAO.pledges, "add").resolves(1);
      const invalid: unknown[] = [
        { sum: 0, decidedDate: "2026-10-23" },
        { sum: -5, decidedDate: "2026-10-23" },
        { sum: 10.555, decidedDate: "2026-10-23" },
        { sum: "abc", decidedDate: "2026-10-23" },
        { sum: 100, decidedDate: "23.10.2026" },
        { sum: 100, decidedDate: "2026-02-30" },
        { sum: 100 },
        { sum: 100, decidedDate: "2026-10-23", receivedDate: "soon" },
        // A donation without a received date
        { sum: 100, decidedDate: "2026-10-23", donationId: 42 },
      ];
      for (const input of invalid) {
        await expectCode(admin().analysis.pledges.create(input as never), "BAD_REQUEST");
      }
      expect(add.called).to.be.false;
    });

    it("says which field is wrong", async () => {
      try {
        await admin().analysis.pledges.create({
          sum: 10.555,
          decidedDate: "2026-10-23",
          donationId: 42,
        });
        expect.fail("expected BAD_REQUEST");
      } catch (err: any) {
        expect(err.code).to.equal("BAD_REQUEST");
        expect(err.message).to.contain("at most two decimals");
      }
    });

    it("rejects a donation that does not exist", async () => {
      sinon.stub(DAO.pledges, "getById").resolves(pledge);
      sinon.stub(DAO.pledges, "donationExists").resolves(false);
      const update = sinon.stub(DAO.pledges, "update");
      const add = sinon.stub(DAO.pledges, "add");
      await expectCode(
        admin().analysis.pledges.markReceived({
          id: 1,
          receivedDate: "2026-11-02",
          donationId: 999,
        }),
        "BAD_REQUEST",
      );
      await expectCode(
        admin().analysis.pledges.create({
          sum: 100,
          decidedDate: "2026-10-23",
          receivedDate: "2026-11-02",
          donationId: 999,
        }),
        "BAD_REQUEST",
      );
      expect(update.called).to.be.false;
      expect(add.called).to.be.false;
    });

    it("marks a pledge as received with a donation, keeping its sum and decision", async () => {
      sinon.stub(DAO.pledges, "donationExists").resolves(true);
      const update = sinon.stub(DAO.pledges, "update").resolves(true);
      sinon
        .stub(DAO.pledges, "getById")
        .onFirstCall()
        .resolves(pledge)
        .onSecondCall()
        .resolves({ ...pledge, receivedDate: "2026-11-02", donationId: 42 });
      const result = await admin().analysis.pledges.markReceived({
        id: 1,
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      expect(update.firstCall.args).to.deep.equal([
        1,
        { sum: 1_350_000, decidedDate: "2026-10-23", receivedDate: "2026-11-02", donationId: 42 },
      ]);
      expect(result).to.include({ receivedDate: "2026-11-02", donationId: 42 });
    });

    it("marks a pledge as received without a donation", async () => {
      const exists = sinon.stub(DAO.pledges, "donationExists").resolves(true);
      const update = sinon.stub(DAO.pledges, "update").resolves(true);
      sinon.stub(DAO.pledges, "getById").resolves(pledge);
      await admin().analysis.pledges.markReceived({ id: 1, receivedDate: "2026-11-02" });
      expect(update.firstCall.args[1]).to.include({ receivedDate: "2026-11-02", donationId: null });
      expect(exists.called).to.be.false;
    });

    it("lowers the sum after a partial payment and leaves the rest as it was", async () => {
      const update = sinon.stub(DAO.pledges, "update").resolves(true);
      sinon.stub(DAO.pledges, "getById").resolves(pledge);
      await admin().analysis.pledges.update({ id: 1, sum: 850_000.5 });
      expect(update.firstCall.args).to.deep.equal([
        1,
        { sum: 850_000.5, decidedDate: "2026-10-23", receivedDate: null, donationId: null },
      ]);
      await expectCode(admin().analysis.pledges.update({ id: 1 }), "BAD_REQUEST");
      await expectCode(admin().analysis.pledges.update({ id: 1, sum: 0 }), "BAD_REQUEST");
    });

    it("reopens a received pledge and drops the donation link", async () => {
      const update = sinon.stub(DAO.pledges, "update").resolves(true);
      sinon
        .stub(DAO.pledges, "getById")
        .resolves({ ...pledge, receivedDate: "2026-11-02", donationId: 42 });
      await admin().analysis.pledges.reopen({ id: 1 });
      expect(update.firstCall.args[1]).to.deep.equal({
        sum: 1_350_000,
        decidedDate: "2026-10-23",
        receivedDate: null,
        donationId: null,
      });
    });

    it("returns NOT_FOUND for an unknown pledge", async () => {
      sinon.stub(DAO.pledges, "getById").resolves(null);
      sinon.stub(DAO.pledges, "remove").resolves(false);
      const update = sinon.stub(DAO.pledges, "update");
      await expectCode(admin().analysis.pledges.update({ id: 77, sum: 100 }), "NOT_FOUND");
      await expectCode(
        admin().analysis.pledges.markReceived({ id: 77, receivedDate: "2026-11-02" }),
        "NOT_FOUND",
      );
      await expectCode(admin().analysis.pledges.reopen({ id: 77 }), "NOT_FOUND");
      await expectCode(admin().analysis.pledges.delete({ id: 77 }), "NOT_FOUND");
      expect(update.called).to.be.false;
    });

    it("deletes a pledge", async () => {
      const remove = sinon.stub(DAO.pledges, "remove").resolves(true);
      expect(await admin().analysis.pledges.delete({ id: 1 })).to.deep.equal({ id: 1 });
      expect(remove.firstCall.args[0]).to.equal(1);
    });
  });
});
