import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import type { AgreementRow } from "../custom_modules/DAO_modules/agreements";
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

const row: AgreementRow = {
  provider: "avtalegiro",
  id: "12",
  KID: "000001125456929",
  donorId: 7,
  donorName: "Ola Nordmann",
  amount: 250.5,
  chargeDay: 15,
  status: "active",
  providerStatus: "active",
  created: new Date("2026-01-02T03:04:05.000Z"),
  lastUpdated: new Date("2026-02-02T03:04:05.000Z"),
  cancelled: null,
  pausedUntil: null,
};

describe("tRPC agreements router", () => {
  afterEach(() => sinon.restore());

  describe("procedures", () => {
    it("rejects anonymous and non-admin callers", async () => {
      const getList = sinon.stub(DAO.agreements, "getList");
      await expectTrpcError(callerWith().agreements.list({ page: 0, limit: 10 }), "UNAUTHORIZED");
      await expectTrpcError(
        callerWith(["read:profile"]).agreements.list({ page: 0, limit: 10 }),
        "FORBIDDEN",
      );
      expect(getList.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const getList = sinon.stub(DAO.agreements, "getList");
      const invalid: unknown[] = [
        { page: 0, limit: 10, sort: { id: "full_name; DROP TABLE Donors", desc: true } },
        { page: 0, limit: 10, filter: { providers: ["paypal"] } },
        { page: 0, limit: 10, filter: { statuses: ["ACTIVE"] } },
        { page: 0, limit: 10, filter: { providers: [] } },
        { page: 0, limit: 10, filter: { chargeDay: { from: 32 } } },
        { page: 0, limit: 10, filter: { created: { from: "01.02.2026" } } },
        { page: 0, limit: 10, filter: { amount: { from: -1 } } },
        { page: 0, limit: 10, filter: { unknown: true } },
        { page: 0, limit: 10, filter: { ids: [] } },
        { page: 0, limit: 10, filter: { ids: [""] } },
        { page: 0, limit: 10, filter: { ids: [12] } },
      ];
      for (const input of invalid) {
        await expectTrpcError(admin().list(input as any), "BAD_REQUEST");
      }
      expect(getList.called).to.be.false;
    });

    it("lists with filters, sort and paging", async () => {
      const result = {
        rows: [row],
        statistics: { count: 1, activeCount: 1, activeMonthlySum: 250.5 },
        pages: 1,
      };
      const getList = sinon.stub(DAO.agreements, "getList").resolves(result);
      sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());
      const withSplit = { ...result, rows: [{ ...row, orgSplit: [] }] };
      const filter = {
        providers: ["vipps" as const, "avtalegiro" as const],
        statuses: ["active" as const, "paused" as const],
        amount: { from: 100, to: 500 },
        chargeDay: { from: 1, to: 20 },
        created: { from: "2026-01-01", to: "2026-01-31" },
        donor: "ola",
        KID: "1125",
      };

      expect(
        await admin().list({ page: 1, limit: 20, sort: { id: "amount", desc: false }, filter }),
      ).to.deep.equal(withSplit);
      const { created, ...rest } = filter;
      expect(getList.firstCall.args[0]).to.deep.equal({
        // Whole Oslo days: 1 January starts at 23:00 UTC the day before (CET)
        filter: {
          ...rest,
          createdRange: {
            from: new Date("2025-12-31T23:00:00Z"),
            before: new Date("2026-01-31T23:00:00Z"),
          },
        },
        sort: { id: "amount", desc: false },
        page: 1,
        limit: 20,
      });

      await admin().list({ page: 0, limit: 10 });
      expect(getList.secondCall.args[0]).to.deep.equal({
        filter: {},
        sort: { id: "created", desc: true },
        page: 0,
        limit: 10,
      });
    });

    it("exports all matching rows as CSV", async () => {
      const getList = sinon.stub(DAO.agreements, "getList").resolves({
        rows: [row, { ...row, provider: "vipps", id: "agr_1", cancelled: new Date("2026-03-01") }],
        statistics: { count: 2, activeCount: 2, activeMonthlySum: 501 },
        pages: 1,
      });

      const result = await admin().export({ filter: { providers: ["vipps"] } });

      expect(getList.firstCall.args[0]).to.deep.equal({
        filter: { providers: ["vipps"] },
        sort: { id: "created", desc: true },
      });
      expect(result.filename).to.match(/^agreements-.*\.csv$/);
      const lines = result.csv.replace(/^﻿/, "").trim().split("\n");
      expect(lines[0]).to.equal(
        "provider,id,KID,donorId,donorName,amount,chargeDay,status,providerStatus,created,lastUpdated,cancelled,pausedUntil",
      );
      expect(lines).to.have.length(3);
      expect(lines[2]).to.contain("vipps,agr_1");
      expect(lines[2]).to.contain(",2026-03-01,");
    });
  });

  describe("DAO.agreements.getList", () => {
    let query: sinon.SinonStub;

    beforeEach(() => {
      query = sinon.stub(DAO, "query");
      query.onFirstCall().resolves([
        [
          {
            ...row,
            amount: "250.50",
          },
        ],
        [],
      ] as any);
      query
        .onSecondCall()
        .resolves([[{ count: 3, activeCount: "2", activeMonthlySum: "400.50" }], []] as any);
    });

    it("unions all providers and converts AvtaleGiro øre to kroner", async () => {
      const result = await DAO.agreements.getList({
        filter: {},
        sort: { id: "created", desc: true },
        page: 0,
        limit: 10,
      });

      const [sql, params] = query.firstCall.args;
      expect(sql).to.contain("FROM Vipps_agreements VA");
      expect(sql).to.contain("FROM Avtalegiro_agreements AG");
      expect(sql).to.contain("FROM AutoGiro_agreements AG");
      expect(sql.match(/UNION ALL/g)).to.have.length(2);
      expect(sql).to.contain("CAST(AG.amount / 100 AS DECIMAL(16, 2))");
      expect(sql).to.match(/ORDER BY createdDb DESC, provider DESC/);
      // The created columns are filled by MySQL defaults (DB clock), returned as UTC
      expect(sql).to.contain("VA.timestamp_created AS createdDb");
      expect(sql).to.contain("CONVERT_TZ(createdDb, @@session.time_zone, '+00:00') AS created");
      expect(sql).to.contain(
        "CONVERT_TZ(lastUpdatedDb, @@session.time_zone, '+00:00') AS lastUpdated",
      );
      expect(params).to.deep.equal([10, 0]);

      expect(result).to.deep.equal({
        rows: [{ ...row, amount: 250.5 }],
        statistics: { count: 3, activeCount: 2, activeMonthlySum: 400.5 },
        pages: 1,
      });
    });

    it("only queries the requested providers and passes filters as parameters", async () => {
      await DAO.agreements.getList({
        filter: {
          providers: ["autogiro"],
          statuses: ["draft", "pending"],
          amount: { from: 100, to: 500 },
          chargeDay: { from: 1, to: 20 },
          created: { from: "2026-01-01", to: "2026-01-31" },
          donor: "50%_off",
          KID: "123",
        },
        sort: { id: "id", desc: false },
        page: 2,
        limit: 25,
      });

      const [sql, params] = query.firstCall.args;
      expect(sql).to.contain("FROM AutoGiro_agreements AG");
      expect(sql).to.not.contain("Vipps_agreements");
      expect(sql).to.not.contain("Avtalegiro_agreements");
      expect(sql).to.not.contain("UNION ALL");
      expect(sql).to.not.contain("50%");
      expect(sql).to.match(/ORDER BY CHAR_LENGTH\(id\) ASC, id ASC/);
      expect(params).to.deep.equal([
        ["draft", "pending"],
        100,
        500,
        1,
        20,
        "2026-01-01",
        "2026-01-31",
        "%50\\%\\_off%",
        "%50\\%\\_off%",
        "%123%",
        25,
        50,
      ]);
      // The statistics query uses the same filter without paging
      expect(query.secondCall.args[1]).to.deep.equal(params.slice(0, -2));
    });

    it("filters on exact ids, combined with the provider", async () => {
      await DAO.agreements.getList({
        filter: { providers: ["avtalegiro"], ids: ["12"] },
        sort: { id: "created", desc: true },
        page: 0,
        limit: 1,
      });
      const [sql, params] = query.firstCall.args;
      expect(sql).to.contain("WHERE id IN (?)");
      expect(sql).to.not.contain("Vipps_agreements");
      expect(params).to.deep.equal([["12"], 1, 0]);
    });

    it("returns all rows without paging for exports", async () => {
      const result = await DAO.agreements.getList({
        filter: {},
        sort: { id: "amount", desc: true },
      });
      const [sql, params] = query.firstCall.args;
      expect(sql).to.not.contain("LIMIT");
      expect(params).to.deep.equal([]);
      expect(result.pages).to.equal(1);
    });

    it("maps every provider status to the normalised vocabulary", async () => {
      await DAO.agreements.getList({ filter: {}, sort: { id: "status", desc: true } });
      const [sql] = query.firstCall.args;
      for (const status of ["active", "paused", "pending", "draft", "stopped"]) {
        expect(sql).to.contain(`'${status}'`);
      }
      expect(sql).to.contain("DATE(VA.paused_until_date) > CURDATE()");
      expect(sql).to.contain("M.status = 'DRAFTED'");
    });
  });
});
