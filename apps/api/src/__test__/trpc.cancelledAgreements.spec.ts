import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import type { CancelledAgreementRow } from "../custom_modules/DAO_modules/cancelledAgreements";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]).agreements;

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const row: CancelledAgreementRow = {
  provider: "avtalegiro",
  id: "12",
  KID: "000001125456929",
  amount: "250.50",
  created: new Date("2026-01-02T03:04:05.000Z"),
  cancelled: "2026-10-20",
  donorId: 7,
  donorName: "Ola Nordmann",
  hasOtherActiveAgreement: true,
  otherActiveProviders: ["vipps"],
  donorStats: {
    latestDonation: new Date("2026-09-15T10:00:00.000Z"),
    donationSum: "2505.00",
    donationCount: 10,
  },
  reasons: [
    {
      reasonId: 11,
      name: "Annet",
      comment: "Flytter",
      recorded: new Date("2026-10-20T08:00:00.000Z"),
    },
  ],
};

const summary = {
  count: 1,
  withOtherActiveCount: 1,
  withReasonCount: 1,
  reasons: [{ reasonId: 11, name: "Annet", count: 1 }],
};

describe("tRPC agreements.cancelled", () => {
  afterEach(() => sinon.restore());

  describe("procedure", () => {
    it("rejects anonymous and non-admin callers", async () => {
      const getList = sinon.stub(DAO.cancelledAgreements, "getList");
      await expectTrpcError(
        callerWith().agreements.cancelled({ page: 0, limit: 10 }),
        "UNAUTHORIZED",
      );
      await expectTrpcError(
        callerWith(["read:profile"]).agreements.cancelled({ page: 0, limit: 10 }),
        "FORBIDDEN",
      );
      expect(getList.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const getList = sinon.stub(DAO.cancelledAgreements, "getList");
      const invalid: unknown[] = [
        { page: 0, limit: 10, sort: { id: "status", desc: true } },
        { page: 0, limit: 10, filter: { providers: ["autogiro"] } },
        { page: 0, limit: 10, filter: { cancelled: { from: "01.02.2026" } } },
        { page: 0, limit: 10, filter: { reasonIds: [] } },
        { page: 0, limit: 10, filter: { reasonIds: ["1"] } },
        { page: 0, limit: 10, filter: { hasOtherActiveAgreement: "yes" } },
        { page: 0, limit: 10, filter: { donor: " " } },
        { page: 0, limit: 10, filter: { unknown: true } },
      ];
      for (const input of invalid) {
        await expectTrpcError(admin().cancelled(input as any), "BAD_REQUEST");
      }
      expect(getList.called).to.be.false;
    });

    it("defaults to newest cancellation first and returns ISO dates and the org split", async () => {
      const getList = sinon
        .stub(DAO.cancelledAgreements, "getList")
        .resolves({ rows: [row], summary, pages: 1 });
      const orgShares = sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());

      const result = await admin().cancelled({ page: 0, limit: 25 });

      expect(getList.firstCall.args[0]).to.deep.equal({
        filter: {},
        sort: { id: "cancelled", desc: true },
        page: 0,
        limit: 25,
      });
      expect(orgShares.firstCall.args[0]).to.deep.equal([row.KID]);
      expect(result.summary).to.deep.equal(summary);
      expect(result.rows[0]).to.deep.equal({
        ...row,
        created: "2026-01-02T03:04:05.000Z",
        donorStats: { ...row.donorStats, latestDonation: "2026-09-15T10:00:00.000Z" },
        reasons: [{ ...row.reasons[0], recorded: "2026-10-20T08:00:00.000Z" }],
        orgSplit: [],
      });
    });

    it("passes filters and sort through", async () => {
      const getList = sinon
        .stub(DAO.cancelledAgreements, "getList")
        .resolves({ rows: [], summary: { ...summary, count: 0, reasons: [] }, pages: 0 });
      sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());
      const filter = {
        providers: ["vipps" as const],
        cancelled: { from: "2026-01-01", to: "2026-01-31" },
        reasonIds: [1, 11],
        hasOtherActiveAgreement: false,
        donor: "ola",
      };
      await admin().cancelled({
        page: 2,
        limit: 10,
        sort: { id: "donationSum", desc: false },
        filter,
      });
      expect(getList.firstCall.args[0]).to.deep.equal({
        filter,
        sort: { id: "donationSum", desc: false },
        page: 2,
        limit: 10,
      });
    });
  });

  describe("DAO.cancelledAgreements.getList", () => {
    let query: sinon.SinonStub;

    /** Answers each query by what it selects, since the summary runs alongside the page */
    beforeEach(() => {
      query = sinon.stub(DAO, "query").callsFake((async (sql: string) => {
        if (sql.includes("AS withReasonCount"))
          return [[{ count: 3, withOtherActiveCount: "1", withReasonCount: "2" }], []];
        if (sql.includes("GROUP BY RS.ID"))
          return [
            [
              { reasonId: 1, name: "Økonomiske grunner", count: 2 },
              { reasonId: 11, name: "Annet", count: 1 },
            ],
            [],
          ];
        if (sql.includes("FROM Recurring_agreement_stopped R"))
          return [
            [
              {
                vippsAgreementID: null,
                avtalegiroAgreementID: 12,
                reasonId: 1,
                name: "Økonomiske grunner",
                isOther: 0,
                otherComment: "ignored: not the free-text reason",
                timestamp: null,
              },
              {
                vippsAgreementID: null,
                avtalegiroAgreementID: 12,
                reasonId: 11,
                name: "Annet",
                isOther: 1,
                otherComment: "  Flytter  ",
                timestamp: row.reasons[0].recorded,
              },
            ],
            [],
          ];
        if (sql.includes("FROM Donations"))
          return [
            [
              {
                donorId: 7,
                latestDonation: row.donorStats.latestDonation,
                donationSum: "2505.00",
                donationCount: 10,
              },
            ],
            [],
          ];
        return [
          [
            {
              provider: "avtalegiro",
              id: "12",
              KID: row.KID,
              donorId: 7,
              donorName: "Ola Nordmann",
              amount: "250.50",
              created: row.created,
              cancelled: "2026-10-20",
              otherVipps: 1,
              otherAvtalegiro: 0,
            },
            {
              provider: "vipps",
              id: "agr_X",
              KID: "000002",
              donorId: 8,
              donorName: null,
              amount: "100.00",
              created: null,
              cancelled: "2026-10-19",
              otherVipps: 0,
              otherAvtalegiro: 0,
            },
          ],
          [],
        ];
      }) as any);
    });

    const pageSql = () =>
      query.getCalls().find((call) => String(call.args[0]).includes("LIMIT ? OFFSET ?"))!.args;

    it("joins the page with reasons, donor stats and the summary", async () => {
      const result = await DAO.cancelledAgreements.getList({
        filter: {},
        sort: { id: "cancelled", desc: true },
        page: 0,
        limit: 2,
      });

      const [sql, params] = pageSql();
      expect(sql).to.contain("VA.cancellation_date IS NOT NULL");
      expect(sql).to.contain("AG.cancelled IS NOT NULL");
      expect(sql).not.to.contain("AutoGiro_agreements");
      expect(sql).to.match(/ORDER BY F\.cancelledDate DESC, F\.cancelledDate DESC, F\.provider/);
      expect(params).to.deep.equal([2, 0]);

      // Batched: one reasons query and one donor stats query for the whole page
      const reasonCalls = query
        .getCalls()
        .filter((call) => String(call.args[0]).includes("FROM Recurring_agreement_stopped R"));
      expect(reasonCalls).to.have.length(1);
      expect(reasonCalls[0].args[1]).to.deep.equal([["agr_X"], [12]]);
      const statsCalls = query
        .getCalls()
        .filter((call) => String(call.args[0]).includes("FROM Donations"));
      expect(statsCalls).to.have.length(1);
      expect(statsCalls[0].args[1]).to.deep.equal([[7, 8]]);

      expect(result.pages).to.equal(2);
      expect(result.summary).to.deep.equal({
        count: 3,
        withOtherActiveCount: 1,
        withReasonCount: 2,
        reasons: [
          { reasonId: 1, name: "Økonomiske grunner", count: 2 },
          { reasonId: 11, name: "Annet", count: 1 },
        ],
      });
      expect(result.rows[0]).to.deep.equal({
        ...row,
        reasons: [
          { reasonId: 1, name: "Økonomiske grunner", comment: null, recorded: null },
          row.reasons[0],
        ],
      });
      expect(result.rows[1]).to.include({
        provider: "vipps",
        hasOtherActiveAgreement: false,
      });
      expect(result.rows[1].otherActiveProviders).to.deep.equal([]);
      expect(result.rows[1].reasons).to.deep.equal([]);
      expect(result.rows[1].donorStats).to.deep.equal({
        latestDonation: null,
        donationSum: "0.00",
        donationCount: 0,
      });
    });

    it("passes filters as parameters and sorts by donor stats", async () => {
      await DAO.cancelledAgreements.getList({
        filter: {
          providers: ["vipps"],
          cancelled: { from: "2026-01-01", to: "2026-01-31" },
          reasonIds: [1, 11],
          hasOtherActiveAgreement: true,
          donor: "42",
        },
        sort: { id: "donationSum", desc: false },
        page: 1,
        limit: 10,
      });
      const [sql, params] = pageSql();
      expect(sql).not.to.contain("FROM Avtalegiro_agreements AG");
      expect(sql).to.contain("F.cancelledDate >= ?");
      expect(sql).to.contain("F.cancelledDate <= ?");
      expect(sql).to.contain("RK.reasonID IN (?)");
      expect(sql).to.contain("F.donorId = ?");
      expect(sql).to.match(/ORDER BY \(SELECT COALESCE\(SUM\(DS\.sum_confirmed\), 0\)/);
      expect(params).to.deep.equal([
        "2026-01-01",
        "2026-01-31",
        1,
        [1, 11],
        "%42%",
        "%42%",
        42,
        "%42%",
        10,
        10,
      ]);
    });

    it("doesn't match ids or KIDs for a text search", async () => {
      await DAO.cancelledAgreements.getList({
        filter: { donor: "50%_off" },
        sort: { id: "cancelled", desc: true },
        page: 0,
        limit: 10,
      });
      const [sql, params] = pageSql();
      expect(sql).not.to.contain("F.donorId = ?");
      expect(params.slice(0, 2)).to.deep.equal(["%50\\%\\_off%", "%50\\%\\_off%"]);
    });
  });
});
