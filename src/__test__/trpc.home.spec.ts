import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { buildHomeTrends, trendMonths } from "../custom_modules/DAO_modules/homeTrends";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const donationRow = (idx: number, sum: string, costs: string, estimatedCount = 0) => ({
  idx,
  count: 2,
  sum,
  costs,
  estimatedCosts: estimatedCount ? "1.00" : "0.00",
  estimatedCount,
});

describe("home.trends", () => {
  afterEach(() => sinon.restore());

  describe("trendMonths", () => {
    it("gives Oslo months, oldest first, ending with the current month", () => {
      // 29 Oct 2026 in Oslo; the month after starts on Oslo's winter time
      const months = trendMonths(new Date("2026-10-29T08:00:00Z"), 13);
      expect(months).to.have.length(13);
      expect(months[0].month).to.equal("2025-10");
      expect(months.at(-1)!.month).to.equal("2026-10");
      expect(months.at(-1)!.start.toISOString()).to.equal("2026-09-30T22:00:00.000Z");
      expect(months.at(-1)!.end.toISOString()).to.equal("2026-10-31T23:00:00.000Z");
      expect(months.at(-1)!.firstDay).to.equal("2026-10-01");
      expect(months.at(-1)!.nextFirstDay).to.equal("2026-11-01");
    });

    it("puts an instant late on the last UTC day of a month in the next Oslo month", () => {
      const months = trendMonths(new Date("2026-10-31T23:30:00Z"), 2);
      expect(months.map((month) => month.month)).to.deep.equal(["2026-10", "2026-11"]);
    });
  });

  describe("buildHomeTrends", () => {
    const months = trendMonths(new Date("2026-10-29T08:00:00Z"), 3);

    it("fills empty months with zero and keeps money as decimal strings", () => {
      const trends = buildHomeTrends(months, [donationRow(2, "1500.00", "30.50")], []);
      expect(trends.months).to.deep.equal(["2026-08", "2026-09", "2026-10"]);
      expect(trends.partialLast).to.be.true;
      expect(trends.donations.points.map((point) => point.value)).to.deep.equal([
        "0.00",
        "0.00",
        "1500.00",
      ]);
      expect(trends.donations.counts).to.deep.equal([0, 0, 2]);
      expect(trends.transactionCosts.points[2]).to.deep.equal({ month: "2026-10", value: "30.50" });
      expect(trends.transactionCosts.estimated).to.be.false;
    });

    it("marks costs estimated when some were inferred from the fee rule", () => {
      const trends = buildHomeTrends(
        months,
        [donationRow(0, "100.00", "3.99", 1), donationRow(1, "100.00", "2.00", 2)],
        [],
      );
      expect(trends.transactionCosts.estimated).to.be.true;
      expect(trends.transactionCosts.note).to.match(/^3 donations have no recorded cost/);
    });

    it("counts active agreements from those before the window, across Vipps and AvtaleGiro", () => {
      const vipps = [
        { idx: -1, started: 10, stopped: 4 },
        { idx: 0, started: 2, stopped: 0 },
        { idx: 2, started: 1, stopped: 3 },
      ];
      const avtaleGiro = [
        { idx: -1, started: 20, stopped: 5 },
        { idx: 1, started: 3, stopped: 1 },
      ];
      const trends = buildHomeTrends(months, [], [vipps, avtaleGiro]);
      // 21 before the window, then +2, +2, -2
      expect(trends.activeAgreements.points.map((point) => point.value)).to.deep.equal([
        23, 25, 23,
      ]);
      expect(trends.agreementsStarted.points.map((point) => point.value)).to.deep.equal([2, 3, 1]);
      expect(trends.agreementsStopped.points.map((point) => point.value)).to.deep.equal([0, 1, 3]);
    });

    it("reads counts that MySQL returns as strings", () => {
      const trends = buildHomeTrends(
        months,
        [],
        [[{ idx: "0", started: "4", stopped: "1" } as any]],
      );
      expect(trends.agreementsStarted.points[0].value).to.equal(4);
      expect(trends.activeAgreements.points.map((point) => point.value)).to.deep.equal([3, 3, 3]);
    });
  });

  describe("procedure", () => {
    it("requires admin", async () => {
      await expectCode(callerWith().home.trends(), "UNAUTHORIZED");
      await expectCode(callerWith(["read:profile"]).home.trends(), "FORBIDDEN");
    });

    it("runs the three grouped queries and assembles 13 months", async () => {
      const donations = sinon
        .stub(DAO.homeTrends, "getDonationMonths")
        .resolves([donationRow(12, "250.00", "8.48")]);
      const vipps = sinon
        .stub(DAO.homeTrends, "getVippsAgreementMonths")
        .resolves([{ idx: -1, started: 5, stopped: 1 }]);
      const avtaleGiro = sinon
        .stub(DAO.homeTrends, "getAvtaleGiroAgreementMonths")
        .resolves([{ idx: 12, started: 1, stopped: 0 }]);

      const trends = await callerWith(["admin"]).home.trends();
      expect(donations.calledOnce && vipps.calledOnce && avtaleGiro.calledOnce).to.be.true;
      expect(trends.months).to.have.length(13);
      expect(trends.donations.points.at(-1)!.value).to.equal("250.00");
      expect(trends.activeAgreements.points.at(-1)!.value).to.equal(5);
      expect(trends.activeAgreements.points[0].value).to.equal(4);
    });
  });
});
