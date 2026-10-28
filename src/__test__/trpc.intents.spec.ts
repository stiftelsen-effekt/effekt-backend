import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import type { IntentRow } from "../custom_modules/DAO_modules/paymentIntents";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]).intents;

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const row: IntentRow = {
  id: 12,
  KID: "000001125456929",
  donorId: 7,
  donorName: "Ola Nordmann",
  amount: "5000.00",
  methodId: 2,
  method: "Bank",
  created: new Date("2026-10-12T10:00:00.000Z"),
  status: "received",
  newDonor: true,
  matchedDonation: { id: 99, date: new Date("2026-10-14T00:00:00.000Z"), sum: "5000.00" },
  followUps: { count: 1, last: new Date("2026-10-19T06:00:00.000Z") },
};

const apiRow = {
  ...row,
  created: "2026-10-12T10:00:00.000Z",
  matchedDonation: { id: 99, date: "2026-10-14T00:00:00.000Z", sum: "5000.00" },
  followUps: { count: 1, last: "2026-10-19T06:00:00.000Z" },
};

describe("tRPC intents router", () => {
  afterEach(() => sinon.restore());

  it("rejects anonymous and non-admin callers", async () => {
    const getList = sinon.stub(DAO.paymentIntents, "getList");
    await expectTrpcError(callerWith().intents.list({ page: 0, limit: 10 }), "UNAUTHORIZED");
    await expectTrpcError(
      callerWith(["read:profile"]).intents.forDonor({ donorId: 1 }),
      "FORBIDDEN",
    );
    expect(getList.called).to.be.false;
  });

  it("rejects invalid input", async () => {
    const getList = sinon.stub(DAO.paymentIntents, "getList");
    const invalid: unknown[] = [
      { page: 0, limit: 10, sort: { id: "Payment_amount; DROP TABLE Donors", desc: true } },
      { page: 0, limit: 10, filter: { statuses: ["paid"] } },
      { page: 0, limit: 10, filter: { statuses: [] } },
      { page: 0, limit: 10, filter: { methodIds: [0] } },
      { page: 0, limit: 10, filter: { created: { from: "12.10.2026" } } },
      { page: 0, limit: 10, filter: { KID: "12a" } },
      { page: 0, limit: 10, filter: { unknown: true } },
      { page: 0, limit: 10, awaitingDays: 0 },
      { page: 0, limit: 10, extra: 1 },
    ];
    for (const input of invalid) {
      await expectTrpcError(admin().list(input as any), "BAD_REQUEST");
    }
    await expectTrpcError(admin().forDonor({ donorId: -1 }), "BAD_REQUEST");
    await expectTrpcError(admin().attention({ days: 0 }), "BAD_REQUEST");
    expect(getList.called).to.be.false;
  });

  it("lists with filters, sort and paging, dates as ISO strings and org splits", async () => {
    const getList = sinon
      .stub(DAO.paymentIntents, "getList")
      .resolves({ rows: [row], count: 1, pages: 1 });
    const split = [
      { organizationId: 1, organizationName: "AMF", causeAreaId: 1, share: "100.000000" },
    ];
    const shares = sinon
      .stub(DAO.distributions, "getOrgSharesByKIDs")
      .resolves(new Map([[row.KID, split]]));
    const filter = {
      statuses: ["awaiting" as const, "expired" as const],
      methodIds: [2, 7],
      created: { from: "2026-10-01", to: "2026-10-31" },
      newDonorsOnly: true,
      donor: "ola",
      KID: "000001125456929",
    };

    const result = await admin().list({
      page: 2,
      limit: 25,
      sort: { id: "amount", desc: false },
      filter,
      awaitingDays: 14,
    });

    expect(result).to.deep.equal({ rows: [{ ...apiRow, orgSplit: split }], count: 1, pages: 1 });
    expect(shares.firstCall.args[0]).to.deep.equal([row.KID]);
    const { created, ...rest } = filter;
    expect(getList.firstCall.args[0]).to.deep.equal({
      // Whole Oslo days: 1 October starts at 22:00 UTC the day before (CEST), 1 November at 23:00
      filter: {
        ...rest,
        createdRange: {
          from: new Date("2026-09-30T22:00:00Z"),
          before: new Date("2026-10-31T23:00:00Z"),
        },
      },
      sort: { id: "amount", desc: false },
      awaitingDays: 14,
      page: 2,
      limit: 25,
    });

    await admin().list({ page: 0, limit: 10 });
    expect(getList.secondCall.args[0]).to.deep.equal({
      filter: {},
      sort: { id: "created", desc: true },
      awaitingDays: undefined,
      page: 0,
      limit: 10,
    });
  });

  it("returns a donor's intents, newest first, without paging", async () => {
    const getList = sinon
      .stub(DAO.paymentIntents, "getList")
      .resolves({ rows: [row, { ...row, id: 13, matchedDonation: null }], count: 2, pages: 1 });

    const rows = await admin().forDonor({ donorId: 7 });

    expect(rows).to.deep.equal([apiRow, { ...apiRow, id: 13, matchedDonation: null }]);
    expect(getList.firstCall.args[0]).to.include({ page: 0, limit: 500 });
    expect(getList.firstCall.args[0].filter).to.deep.equal({ donorId: 7 });
    expect(getList.firstCall.args[0].sort).to.deep.equal({ id: "created", desc: true });
  });

  it("counts new donors awaiting a bank or AvtaleGiro payment", async () => {
    const clock = sinon.useFakeTimers(new Date("2026-10-28T12:00:00Z"));
    const count = sinon
      .stub(DAO.paymentIntents, "countAwaitingNewDonors")
      .resolves({ donors: 3, intents: 4 });

    expect(await admin().attention()).to.deep.equal({
      donors: 3,
      intents: 4,
      days: 30,
      methodIds: [2, 7],
    });
    expect(count.firstCall.args[0]).to.deep.equal({
      methodIds: [2, 7],
      createdRange: { from: new Date("2026-09-28T12:00:00Z") },
      awaitingDays: 30,
    });
    clock.restore();
  });
});

describe("DAO paymentIntents", () => {
  afterEach(() => sinon.restore());

  const dbRow = {
    id: 12,
    KID: "000001125456929",
    donorId: 7,
    donorName: "Ola Nordmann",
    amount: "5000.00",
    methodId: 2,
    method: "Bank",
    created: row.created,
    status: "awaiting",
    newDonor: 1,
    total: 41,
    matchedId: null,
    matchedDate: null,
    matchedSum: null,
    followUps: 0,
    lastFollowUp: null,
  };

  it("decides status from the donor's donations since the intent's day, like the follow-up job", async () => {
    const query = sinon.stub(DAO, "query").resolves([[dbRow], []] as any);

    const result = await DAO.paymentIntents.getList({
      filter: { statuses: ["awaiting"], newDonorsOnly: true, methodIds: [2, 7] },
      sort: { id: "created", desc: true },
      awaitingDays: 14,
      page: 1,
      limit: 20,
    });

    expect(query.calledOnce).to.be.true;
    const [sql, params] = query.firstCall.args as [string, unknown[]];
    // Received: a donation by the donor (any KID) confirmed on or after the intent's day
    expect(sql).to.contain("WHEN S.lastDonation >= DATE(PI.timestamp) THEN 'received'");
    expect(sql).to.contain("WHEN PI.timestamp < NOW() - INTERVAL ? DAY THEN 'expired'");
    // New donor: nothing confirmed before the intent's day
    expect(sql).to.contain("(S.firstDonation IS NULL OR S.firstDonation >= DATE(PI.timestamp))");
    expect(sql).to.contain("X.timestamp_confirmed >= DATE(P.created)");
    expect(sql).to.contain("I.status IN (?) AND I.newDonor = 1");
    expect(sql).to.contain("ORDER BY P.created DESC, P.id DESC");
    expect(params).to.deep.equal([14, [2, 7], ["awaiting"], 20, 20]);

    expect(result).to.deep.equal({
      rows: [
        {
          ...row,
          status: "awaiting",
          matchedDonation: null,
          followUps: { count: 0, last: null },
        },
      ],
      count: 41,
      pages: 3,
    });
  });

  it("scopes the donation aggregate to one donor", async () => {
    const query = sinon.stub(DAO, "query").resolves([[], []] as any);
    await DAO.paymentIntents.getList({
      filter: { donorId: 7 },
      sort: { id: "created", desc: true },
      page: 0,
      limit: 500,
    });
    const [sql, params] = query.firstCall.args as [string, unknown[]];
    expect(sql).to.match(/FROM Donations WHERE Donor_ID = \?\s+GROUP BY Donor_ID/);
    expect(params).to.deep.equal([30, 7, 7, 500, 0]);
  });

  it("counts again for an empty page past the end", async () => {
    const query = sinon.stub(DAO, "query");
    query.onFirstCall().resolves([[], []] as any);
    query.onSecondCall().resolves([[{ count: 41 }], []] as any);
    const result = await DAO.paymentIntents.getList({
      filter: {},
      sort: { id: "amount", desc: false },
      page: 9,
      limit: 20,
    });
    expect(result).to.deep.equal({ rows: [], count: 41, pages: 3 });
  });

  it("counts distinct new donors awaiting payment", async () => {
    const query = sinon.stub(DAO, "query").resolves([[{ donors: 3, intents: "4" }], []] as any);
    const from = new Date("2026-09-28T12:00:00Z");
    expect(
      await DAO.paymentIntents.countAwaitingNewDonors({
        methodIds: [2, 7],
        createdRange: { from },
      }),
    ).to.deep.equal({ donors: 3, intents: 4 });
    const [sql, params] = query.firstCall.args as [string, unknown[]];
    expect(sql).to.contain("COUNT(DISTINCT I.donorId)");
    expect(sql).to.contain("PI.timestamp >= ('2026-09-28 12:00:00.000'");
    expect(params).to.deep.equal([30, [2, 7], ["awaiting"]]);
  });
});
