import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const admin = () =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: { permissions: ["admin"] },
  });

const split = [
  { organizationId: 3, organizationName: "GiveDirectly", causeAreaId: 1, share: "62.500000" },
  { organizationId: 5, organizationName: "The Humane League", causeAreaId: 2, share: "37.500000" },
];

describe("tRPC list procedures with organization splits", () => {
  afterEach(() => sinon.restore());

  it("adds orgSplit to each distributions row from one batched query per page", async () => {
    sinon.stub(DAO.distributions, "getAll").resolves({
      rows: [
        {
          KID: "111",
          full_name: "Ola",
          email: "o@example.org",
          donation_sum: "10",
          donation_count: 1,
        },
        {
          KID: "222",
          full_name: "Kari",
          email: "k@example.org",
          donation_sum: "0",
          donation_count: 0,
        },
      ] as any,
      statistics: { numDistributions: 2 },
      pages: 1,
    });
    const getShares = sinon
      .stub(DAO.distributions, "getOrgSharesByKIDs")
      .resolves(new Map([["111", split]]));

    const result = await admin().donations.distributions.list({ page: 0, limit: 10 });

    expect(getShares.calledOnce).to.be.true;
    expect(getShares.firstCall.args[0]).to.deep.equal(["111", "222"]);
    expect(result.rows.map((row: any) => row.orgSplit)).to.deep.equal([split, []]);
    expect(result.pages).to.equal(1);
    expect(result.statistics).to.deep.equal({ numDistributions: 2 });
  });

  it("adds orgSplit to agreements rows keyed by KID", async () => {
    sinon.stub(DAO.agreements, "getList").resolves({
      rows: [{ KID: "333", id: "1", provider: "avtalegiro" }] as any,
      statistics: { count: 1, activeCount: 1, activeMonthlySum: 0 },
      pages: 1,
    });
    const getShares = sinon
      .stub(DAO.distributions, "getOrgSharesByKIDs")
      .resolves(new Map([["333", split]]));

    const result = await admin().agreements.list({ page: 0, limit: 10 });

    expect(getShares.firstCall.args[0]).to.deep.equal(["333"]);
    expect((result.rows[0] as any).orgSplit).to.deep.equal(split);
  });

  it("does not query splits when a page is empty", async () => {
    sinon.stub(DAO.distributions, "getAll").resolves({
      rows: [],
      statistics: { numDistributions: 0 },
      pages: 0,
    });
    const getShares = sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());

    await admin().donations.distributions.list({ page: 0, limit: 10 });

    expect(getShares.calledOnce).to.be.true;
    expect(getShares.firstCall.args[0]).to.deep.equal([]);
  });
});
