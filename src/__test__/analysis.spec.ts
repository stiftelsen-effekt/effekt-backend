import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import { AnalysisOverviewTotals, buildOverview } from "../custom_modules/DAO_modules/analysis";

const totals: AnalysisOverviewTotals = {
  year: 2026,
  thisYearSum: 1_234_567.89,
  throughTimeMeasured: 171_237_465.4,
  throughTimeDonations: 1000,
  throughTimeFrom: new Date("2015-06-01T10:00:00Z"),
  openPledgesSum: 27_350_000,
  openPledgesCount: 3,
};

describe("analysis overview", () => {
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

  describe("GET /analysis/overview", () => {
    let server: express.Express;

    beforeEach(() => {
      sinon.replace(authMiddleware, "isAdmin", [] as any);
      delete require.cache[require.resolve("../routes/analysis")];
      const { analysisRouter } = require("../routes/analysis");
      server = express();
      server.use("/analysis", analysisRouter);
    });

    afterEach(() => {
      sinon.restore();
      delete require.cache[require.resolve("../routes/analysis")];
    });

    it("returns the overview", async () => {
      sinon.stub(DAO.analysis, "getOverviewTotals").resolves(totals);
      const res = await request(server).get("/analysis/overview");
      expect(res.status).to.equal(200);
      expect(res.body.content.withPledges.sum).to.equal(198_587_465);
    });

    it("passes database errors on", async () => {
      sinon.stub(DAO.analysis, "getOverviewTotals").rejects(new Error("db down"));
      server.use((err, req, res, next) => res.status(500).send(err.message));
      const res = await request(server).get("/analysis/overview");
      expect(res.status).to.equal(500);
    });
  });
});
