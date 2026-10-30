import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { AvtaleGiroChargeStatus } from "../custom_modules/avtalegiro/charges";
import {
  avtalegirocharges,
  oreToNok,
  type AvtaleGiroChargeListRow,
} from "../custom_modules/DAO_modules/avtalegirocharges";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]);

const expectTRPCError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const created = new Date("2026-10-23T08:00:12Z");

const daoRow: AvtaleGiroChargeListRow = {
  id: 7,
  agreementId: 12,
  KID: "000000120000014",
  dueDate: "2026-10-28",
  amount: "500.00",
  status: AvtaleGiroChargeStatus.COMPLETED,
  shipmentId: 301,
  deletionShipmentId: null,
  donationId: 9001,
  donorId: 44,
  donorName: "Kari Nordmann",
  created,
  lastUpdated: null,
};

const emptySummary = {
  count: 0,
  sum: "0.00",
  byStatus: Object.values(AvtaleGiroChargeStatus).map((status) => ({
    status,
    count: 0,
    sum: "0.00",
  })),
};

describe("tRPC giro.avtalegiro.charges", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("auth and input", () => {
    it("rejects anonymous and non-admin callers before touching the DAO", async () => {
      const list = sinon.stub(DAO.avtalegirocharges, "getList");
      const byAgreement = sinon.stub(DAO.avtalegirocharges, "getByAgreementId");
      const input = { page: 0, limit: 25 };
      await expectTRPCError(callerWith().giro.avtalegiro.charges.list(input), "UNAUTHORIZED");
      await expectTRPCError(
        callerWith(["read:profile", "write:agreements"]).giro.avtalegiro.charges.list(input),
        "FORBIDDEN",
      );
      await expectTRPCError(
        callerWith(["read:profile"]).giro.avtalegiro.charges.byAgreement({ agreementId: 12 }),
        "FORBIDDEN",
      );
      expect(list.called).to.be.false;
      expect(byAgreement.called).to.be.false;
    });

    it("rejects unknown sort columns, statuses and filter keys", async () => {
      const list = sinon.stub(DAO.avtalegirocharges, "getList");
      const page = { page: 0, limit: 25 };
      await expectTRPCError(
        admin().giro.avtalegiro.charges.list({
          ...page,
          sort: { id: "C.ID; DROP TABLE Donors" as any, desc: true },
        }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.charges.list({
          ...page,
          filter: { statuses: ["PAID" as any] },
        }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.charges.list({
          ...page,
          filter: { dueDate: { from: "28.10.2026" } },
        }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.charges.list({ ...page, filter: { kid: "1" } } as any),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.charges.list({ page: 0, limit: 5000 }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.charges.byAgreement({ agreementId: 0 }),
        "BAD_REQUEST",
      );
      expect(list.called).to.be.false;
    });
  });

  describe("list", () => {
    it("defaults to newest due date first and returns ISO instants", async () => {
      const list = sinon
        .stub(DAO.avtalegirocharges, "getList")
        .resolves({ rows: [daoRow], pages: 1, summary: { ...emptySummary, count: 1 } });

      const result = await admin().giro.avtalegiro.charges.list({ page: 0, limit: 25 });

      expect(list.firstCall.args[0]).to.deep.equal({
        filter: {},
        sort: { id: "dueDate", desc: true },
        page: 0,
        limit: 25,
      });
      expect(result.pages).to.equal(1);
      expect(result.rows).to.deep.equal([
        { ...daoRow, created: "2026-10-23T08:00:12.000Z", lastUpdated: null },
      ]);
      expect(result.summary.count).to.equal(1);
      expect(result.summary.byStatus.map((s) => s.status)).to.deep.equal([
        "CLAIMED",
        "COMPLETED",
        "SUPERSEDED",
        "DELETION_REQUESTED",
        "DELETION_SENT",
        "DELETED",
      ]);
    });

    it("passes filters, sort and page through", async () => {
      const list = sinon
        .stub(DAO.avtalegirocharges, "getList")
        .resolves({ rows: [], pages: 0, summary: emptySummary });
      const filter = {
        statuses: [AvtaleGiroChargeStatus.CLAIMED, AvtaleGiroChargeStatus.DELETED],
        dueDate: { from: "2026-10-01", to: "2026-10-31" },
        amount: { from: 100, to: 1000 },
        KID: "0000001",
        agreementId: 12,
        donor: "Kari",
        donorId: 44,
        shipmentId: 301,
        matched: false,
      };

      await admin().giro.avtalegiro.charges.list({
        page: 2,
        limit: 50,
        sort: { id: "amount", desc: false },
        filter,
      });

      expect(list.firstCall.args[0]).to.deep.equal({
        filter,
        sort: { id: "amount", desc: false },
        page: 2,
        limit: 50,
      });
    });
  });

  describe("byAgreement", () => {
    it("returns the agreement's charges", async () => {
      const byAgreement = sinon.stub(DAO.avtalegirocharges, "getByAgreementId").resolves([daoRow]);
      const getAgreement = sinon.stub(DAO.avtalegiroagreements, "getAgreement");

      const rows = await admin().giro.avtalegiro.charges.byAgreement({ agreementId: 12 });

      expect(byAgreement.firstCall.args).to.deep.equal([12]);
      expect(rows).to.have.length(1);
      expect(rows[0].created).to.equal("2026-10-23T08:00:12.000Z");
      // Rows prove the agreement exists; no extra lookup
      expect(getAgreement.called).to.be.false;
    });

    it("returns an empty list for an agreement without charges", async () => {
      sinon.stub(DAO.avtalegirocharges, "getByAgreementId").resolves([]);
      sinon.stub(DAO.avtalegiroagreements, "getAgreement").resolves({ ID: 12 } as any);

      expect(await admin().giro.avtalegiro.charges.byAgreement({ agreementId: 12 })).to.deep.equal(
        [],
      );
    });

    it("is NOT_FOUND for an unknown agreement", async () => {
      sinon.stub(DAO.avtalegirocharges, "getByAgreementId").resolves([]);
      sinon.stub(DAO.avtalegiroagreements, "getAgreement").resolves(null as any);

      await expectTRPCError(
        admin().giro.avtalegiro.charges.byAgreement({ agreementId: 999 }),
        "NOT_FOUND",
      );
    });
  });
});

describe("DAO.avtalegirocharges list queries", () => {
  let query: sinon.SinonStub;

  const dbRow = {
    ID: 7,
    agreementID: 12,
    KID: "000000120000014",
    due_date: "2026-10-28",
    amount: 50050,
    status: "COMPLETED",
    shipmentID: 301,
    deletion_shipmentID: null,
    donationID: 9001,
    donorId: 44,
    donorName: "Kari Nordmann",
    created,
    last_updated: created,
  };

  /** Answers each query by what it selects, since the three run in parallel */
  beforeEach(() => {
    query = sinon.stub(DAO, "query").callsFake((async (sql: string) => {
      if (sql.includes("GROUP BY C.status"))
        return [
          [
            { status: "COMPLETED", count: 3, sum: "150050" },
            { status: "DELETED", count: 1, sum: "20000" },
          ],
          [],
        ];
      if (sql.includes("COUNT(*) AS count")) return [[{ count: 3, sum: "150050" }], []];
      return [[dbRow], []];
    }) as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  const call = (part: string) =>
    query.getCalls().find((c) => String(c.args[0]).includes(part))!.args as [string, unknown[]];

  it("maps rows and summarises the filter, with per-status counts", async () => {
    const result = await avtalegirocharges.getList({
      filter: {},
      sort: { id: "dueDate", desc: true },
      page: 0,
      limit: 2,
    });

    expect(result.rows).to.deep.equal([
      {
        id: 7,
        agreementId: 12,
        KID: "000000120000014",
        dueDate: "2026-10-28",
        amount: "500.50",
        status: "COMPLETED",
        shipmentId: 301,
        deletionShipmentId: null,
        donationId: 9001,
        donorId: 44,
        donorName: "Kari Nordmann",
        created,
        lastUpdated: created,
      },
    ]);
    expect(result.pages).to.equal(2);
    expect(result.summary.count).to.equal(3);
    expect(result.summary.sum).to.equal("1500.50");
    expect(result.summary.byStatus).to.deep.include({
      status: "DELETED",
      count: 1,
      sum: "200.00",
    });
    expect(result.summary.byStatus).to.deep.include({ status: "CLAIMED", count: 0, sum: "0.00" });

    const [sql, params] = call("LIMIT ? OFFSET ?");
    expect(sql).to.contain("ORDER BY C.due_date DESC, C.ID DESC");
    expect(sql).not.to.contain("WHERE");
    expect(params).to.deep.equal([2, 0]);
  });

  it("binds every filter value as a parameter", async () => {
    await avtalegirocharges.getList({
      filter: {
        statuses: [AvtaleGiroChargeStatus.CLAIMED],
        dueDate: { from: "2026-10-01", to: "2026-10-31" },
        amount: { from: 100.5, to: 1000 },
        KID: "12%_",
        agreementId: 12,
        donor: "Kari",
        donorId: 44,
        shipmentId: 301,
        matched: true,
      },
      sort: { id: "donorName", desc: false },
      page: 3,
      limit: 25,
    });

    const [sql, params] = call("LIMIT ? OFFSET ?");
    expect(sql).to.contain("C.status IN (?)");
    expect(sql).to.contain("C.donationID IS NOT NULL");
    expect(sql).to.contain("(C.shipmentID = ? OR C.deletion_shipmentID = ?)");
    expect(sql).to.contain("ORDER BY Donors.full_name ASC, C.ID ASC");
    expect(sql).not.to.contain("Kari");
    expect(params).to.deep.equal([
      ["CLAIMED"],
      "2026-10-01",
      "2026-10-31",
      10050,
      100000,
      "%12\\%\\_%",
      12,
      "%Kari%",
      44,
      301,
      301,
      25,
      75,
    ]);

    // The per-status counts leave out the status filter, the totals keep it
    const [facetSql, facetParams] = call("GROUP BY C.status");
    expect(facetSql).not.to.contain("C.status IN");
    expect(facetParams[0]).to.equal("2026-10-01");
    const [, totalParams] = call("COUNT(*) AS count, SUM");
    expect(totalParams[0]).to.deep.equal(["CLAIMED"]);
  });

  it("matches nothing for an empty status list but still counts per status", async () => {
    const result = await avtalegirocharges.getList({
      filter: { statuses: [] },
      sort: { id: "dueDate", desc: true },
      page: 0,
      limit: 25,
    });

    expect(result.rows).to.deep.equal([]);
    expect(result.summary.count).to.equal(0);
    expect(result.pages).to.equal(0);
    expect(query.callCount).to.equal(1);
    expect(result.summary.byStatus.find((s) => s.status === "COMPLETED")?.count).to.equal(3);
  });

  it("gets an agreement's charges by id, newest first", async () => {
    const rows = await avtalegirocharges.getByAgreementId(12);

    const [sql, params] = query.firstCall.args;
    expect(sql).to.contain("WHERE C.agreementID = ?");
    expect(sql).to.contain("ORDER BY C.due_date DESC, C.ID DESC");
    expect(params).to.deep.equal([12]);
    expect(rows[0].amount).to.equal("500.50");
  });
});

describe("oreToNok", () => {
  it("formats øre as NOK with two decimals, exactly", () => {
    expect(oreToNok(0)).to.equal("0.00");
    expect(oreToNok(5)).to.equal("0.05");
    expect(oreToNok(50000)).to.equal("500.00");
    expect(oreToNok("2147483647")).to.equal("21474836.47");
    expect(oreToNok("123456789012345")).to.equal("1234567890123.45");
    expect(oreToNok(-150)).to.equal("-1.50");
    expect(oreToNok(null)).to.equal("0.00");
  });
});
