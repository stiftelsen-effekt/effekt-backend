import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import {
  buildCohorts,
  buildNewDonors,
  monthsEndingWith,
} from "../custom_modules/DAO_modules/donorCohortsModel";
import type { NewDonorRow } from "../custom_modules/DAO_modules/donorCohorts";
import { appRouter } from "../trpc/router";
import { clearAnalysisCache } from "../trpc/routers/analysis";
import { createCallerFactory } from "../trpc/trpc";

/** analysis.newDonors and analysis.cohorts: donor acquisition and retention */
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

const types = [
  { id: 1, name: "Bekjent" },
  { id: 6, name: "Internettsøk" },
  { id: 7, name: "Effektiv altruisme" },
  { id: 8, name: "Annet" },
  { id: 10, name: "Podkast" },
  { id: 11, name: "Avis" },
  { id: 12, name: "Sosiale medier" },
  { id: 13, name: "Sommer i P2" },
];

describe("analysis: donor cohorts", () => {
  afterEach(() => {
    sinon.restore();
    clearAnalysisCache();
  });

  describe("monthsEndingWith", () => {
    it("counts back across year ends", () => {
      expect(monthsEndingWith("2026-02", 4)).to.deep.equal([
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
      ]);
    });
  });

  describe("buildNewDonors", () => {
    const row = (month: string, referralId: number | null, donors: number, volume: string) =>
      ({ month, referralId, donors, volume }) as NewDonorRow;

    it("fills every month, adds volume exactly and keeps the top six named sources", () => {
      const rows = [
        row("2026-09", 1, 10, "100.10"),
        row("2026-09", 6, 9, "0.20"),
        row("2026-09", 7, 8, "1"),
        row("2026-09", 10, 7, "1"),
        row("2026-09", 11, 6, "1"),
        row("2026-09", 12, 5, "1"),
        row("2026-09", 13, 1, "1"),
        row("2026-09", 8, 20, "1"),
        row("2026-09", null, 30, "1000000000000.01"),
        row("2026-07", 1, 99, "1"), // before the window
      ];
      const result = buildNewDonors(rows, types, { currentMonth: "2026-10", months: 2 });
      expect(result.partialMonth).to.equal("2026-10");
      expect(result.months.map((m) => m.month)).to.deep.equal(["2026-09", "2026-10"]);
      // Annet is never a named source; Sommer i P2 is the seventh, so it's in Other
      expect(result.sources.map((s) => s.label)).to.deep.equal([
        "Bekjent",
        "Internettsøk",
        "Effektiv altruisme",
        "Podkast",
        "Avis",
        "Sosiale medier",
        "Other / unknown",
      ]);
      const [september, october] = result.months;
      expect(september!.donors).to.equal(96);
      expect(september!.volume).to.equal("1000000000106.31");
      expect(september!.bySource).to.include({ "ref-1": 10, other: 51 });
      expect(october).to.deep.include({ donors: 0, volume: "0.00" });
      expect(Object.values(october!.bySource).every((n) => n === 0)).to.be.true;
    });
  });

  describe("buildCohorts", () => {
    it("builds a triangle from the first cohort year, shares against the cohort size", () => {
      const result = buildCohorts(
        [
          { cohort: 2024, year: 2024, donors: 200, volume: "1000.50" },
          { cohort: 2024, year: 2026, donors: 50, volume: "300" },
          { cohort: 2025, year: 2025, donors: 100, volume: "800" },
          { cohort: 2025, year: 2026, donors: 60, volume: "900" },
        ],
        2026,
      );
      expect(result.years).to.deep.equal([2024, 2025, 2026]);
      expect(result.partialYear).to.equal(2026);
      // 2026 has no first-time donors here, so no row
      expect(result.cohorts.map((c) => c.year)).to.deep.equal([2024, 2025]);
      const [c2024] = result.cohorts;
      expect(c2024).to.deep.include({ size: 200, firstYearVolume: "1000.50" });
      expect(c2024!.cells).to.deep.equal([
        { year: 2024, donors: 200, share: 1, volume: "1000.50" },
        { year: 2025, donors: 0, share: 0, volume: "0.00" },
        { year: 2026, donors: 50, share: 0.25, volume: "300.00" },
      ]);
    });

    it("starts at 2016 at the earliest and handles no data", () => {
      expect(
        buildCohorts([{ cohort: 2015, year: 2015, donors: 1, volume: "1" }], 2017).years,
      ).to.deep.equal([2016, 2017]);
      expect(buildCohorts([], 2026)).to.deep.equal({
        years: [2026],
        partialYear: 2026,
        cohorts: [],
      });
    });
  });

  describe("SQL", () => {
    it("groups per donor in MySQL, without payments 15 and 16, earliest referral per donor", async () => {
      const query = sinon.stub(DAO, "query").resolves([[]] as any);
      await DAO.donorCohorts.getNewDonorRows("2024-11");
      await DAO.donorCohorts.getCohortRows(2016);

      const [newSql, newParams] = query.firstCall.args as [string, unknown[]];
      expect(newSql).to.match(/Payment_ID NOT IN \(15, 16\)/);
      expect(newSql).to.match(/GROUP BY d\.Donor_ID, month/);
      expect(newSql).to.match(/MIN\(month\) AS first_month/);
      expect(newSql).to.match(
        /ROW_NUMBER\(\) OVER \(PARTITION BY DonorID ORDER BY Registered, ID\)/,
      );
      expect(newSql).to.match(/dm\.month = f\.first_month/);
      expect(newSql).not.to.match(/Donation_referral_codes/);
      expect(newParams).to.deep.equal(["2024-11"]);

      const [cohortSql, cohortParams] = query.secondCall.args as [string, unknown[]];
      expect(cohortSql).to.match(/Payment_ID NOT IN \(15, 16\)/);
      expect(cohortSql).to.match(/MIN\(year\) AS cohort/);
      expect(cohortSql).to.match(/GROUP BY c\.cohort, dy\.year/);
      expect(cohortParams).to.deep.equal([2016]);
    });
  });

  describe("procedures", () => {
    it("rejects anonymous callers and non-admins before querying", async () => {
      const rows = sinon.stub(DAO.donorCohorts, "getNewDonorRows").resolves([]);
      const cohorts = sinon.stub(DAO.donorCohorts, "getCohortRows").resolves([]);
      await expectCode(callerWith().analysis.newDonors({ months: 12 }), "UNAUTHORIZED");
      await expectCode(callerWith(["read:profile"]).analysis.cohorts(), "FORBIDDEN");
      expect(rows.called).to.be.false;
      expect(cohorts.called).to.be.false;
    });

    it("rejects unknown fields and out-of-range months", async () => {
      await expectCode(admin().analysis.newDonors({ months: 0 }), "BAD_REQUEST");
      await expectCode(admin().analysis.newDonors({ months: 12, x: 1 } as any), "BAD_REQUEST");
    });

    it("asks from the first month of the window and caches the result", async () => {
      const rows = sinon.stub(DAO.donorCohorts, "getNewDonorRows").resolves([]);
      sinon.stub(DAO.donorCohorts, "getReferralTypes").resolves(types);
      const first = await admin().analysis.newDonors({ months: 24 });
      expect(first.months).to.have.length(24);
      expect(rows.firstCall.args[0]).to.equal(first.months[0]!.month);
      await admin().analysis.newDonors({ months: 24 });
      expect(rows.callCount).to.equal(1);
      await admin().analysis.newDonors();
      expect(rows.callCount, "the default is 24 months, same entry").to.equal(1);
    });

    it("returns cohorts from 2016 with money as decimal strings", async () => {
      const stub = sinon
        .stub(DAO.donorCohorts, "getCohortRows")
        .resolves([{ cohort: 2016, year: 2016, donors: 3, volume: "1500" }]);
      const result = await admin().analysis.cohorts();
      expect(stub.firstCall.args[0]).to.equal(2016);
      expect(result.years[0]).to.equal(2016);
      expect(result.cohorts[0]).to.deep.include({
        year: 2016,
        size: 3,
        firstYearVolume: "1500.00",
      });
    });
  });
});
