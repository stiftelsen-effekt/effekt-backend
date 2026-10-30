import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import type { ReviewQueueItemWithRaw } from "../custom_modules/DAO_modules/reviewqueue";
import * as donationsService from "../custom_modules/donationsService";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (auth?: Record<string, unknown>) =>
  createCaller({ req: {} as Request, res: {} as Response, auth: auth as any });

const admin = (claims: Record<string, unknown> = { sub: "auth0|admin" }) =>
  callerWith({ permissions: ["admin"], ...claims }).reports.reviewQueue;

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

const item = (overrides: Partial<ReviewQueueItemWithRaw> = {}): ReviewQueueItemWithRaw => ({
  id: 5,
  source: "vipps",
  reason: "Could not find valid KID or matching parsing rule",
  KID: null,
  amount: "250.00",
  date: new Date("2026-10-01T10:00:00.000Z"),
  externalId: "vipps.123",
  paymentId: 4,
  message: "gave",
  name: "Ola",
  location: "Gi Effektivt.",
  importLogId: null,
  metaOwnerId: null,
  status: "open",
  resolvedBy: null,
  resolvedAt: null,
  note: null,
  donationId: null,
  created: new Date("2026-10-02T00:00:00.000Z"),
  raw: { transactionID: "vipps.123" },
  ...overrides,
});

describe("tRPC reports.reviewQueue", () => {
  afterEach(() => sinon.restore());

  describe("auth and validation", () => {
    it("rejects anonymous and non-admin callers", async () => {
      const counts = sinon.stub(DAO.reviewqueue, "getCounts");
      await expectTrpcError(callerWith().reports.reviewQueue.counts(), "UNAUTHORIZED");
      await expectTrpcError(
        callerWith({ permissions: ["read:profile"] }).reports.reviewQueue.counts(),
        "FORBIDDEN",
      );
      expect(counts.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const list = sinon.stub(DAO.reviewqueue, "getList");
      await expectTrpcError(
        admin().list({ page: 0, limit: 10, filter: { statuses: ["done" as any] } }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().list({ page: 0, limit: 10, sort: { id: "Reason" as any, desc: true } }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().list({ page: 0, limit: 10, filter: { sources: [] } }),
        "BAD_REQUEST",
      );
      expect(list.called).to.be.false;
      await expectTrpcError(
        admin().register({ id: 5, metaOwnerId: 3, sendReceipt: false } as any),
        "BAD_REQUEST",
        /either a KID or a distribution/,
      );
      await expectTrpcError(admin().ignore({ id: 5, note: "  " }), "BAD_REQUEST");
    });
  });

  describe("list, get and counts", () => {
    it("lists with filters, paging and default sort", async () => {
      const result = {
        rows: [item()],
        total: 1,
        pages: 1,
        counts: { open: 1, registered: 0, ignored: 0 },
      };
      const list = sinon.stub(DAO.reviewqueue, "getList").resolves(result);

      expect(
        await admin().list({
          page: 2,
          limit: 25,
          filter: { statuses: ["open"], sources: ["ocr"] },
        }),
      ).to.deep.equal(result);
      expect(list.firstCall.args[0]).to.deep.equal({
        page: 2,
        limit: 25,
        statuses: ["open"],
        sources: ["ocr"],
        sort: { id: "id", desc: true },
      });

      await admin().list({ page: 0, limit: 10, sort: { id: "amount", desc: false } });
      expect(list.secondCall.args[0]).to.deep.include({
        statuses: undefined,
        sources: undefined,
        sort: { id: "amount", desc: false },
      });
    });

    it("returns counts per status", async () => {
      sinon.stub(DAO.reviewqueue, "getCounts").resolves({ open: 3, registered: 2, ignored: 1 });
      expect(await admin().counts()).to.deep.equal({ open: 3, registered: 2, ignored: 1 });
    });

    it("gets an item, NOT_FOUND when missing", async () => {
      const getById = sinon.stub(DAO.reviewqueue, "getById");
      getById.withArgs(5).resolves(item());
      getById.withArgs(6).resolves(null);
      expect(await admin().get({ id: 5 })).to.deep.equal(item());
      await expectTrpcError(admin().get({ id: 6 }), "NOT_FOUND");
    });
  });

  describe("DB-filled times", () => {
    it("reads Created and Resolved_at as UTC and sorts by the column", async () => {
      const query = sinon.stub(DAO, "query");
      query.onFirstCall().resolves([[], []] as any);
      query.onSecondCall().resolves([[{ total: 0 }], []] as any);
      query.onThirdCall().resolves([[], []] as any);
      await DAO.reviewqueue.getList({ page: 0, limit: 10, sort: { id: "created", desc: true } });
      const sql = query.firstCall.args[0] as string;
      expect(sql).to.contain("CONVERT_TZ(Created, @@session.time_zone, '+00:00') AS created");
      expect(sql).to.contain(
        "CONVERT_TZ(Resolved_at, @@session.time_zone, '+00:00') AS resolvedAt",
      );
      expect(sql).to.contain("ORDER BY Review_queue_items.Created DESC, ID DESC");
    });
  });

  describe("search", () => {
    it("passes the trimmed query and a default limit", async () => {
      const search = sinon.stub(DAO.reviewqueue, "search").resolves([item()]);
      expect(await admin().search({ query: "  Ola " })).to.deep.equal([item()]);
      expect(search.firstCall.args).to.deep.equal(["Ola", 10]);
      await admin().search({ query: "123", limit: 5 });
      expect(search.secondCall.args).to.deep.equal(["123", 5]);
    });

    it("rejects empty queries and large limits", async () => {
      const search = sinon.stub(DAO.reviewqueue, "search");
      await expectTrpcError(admin().search({ query: "  " }), "BAD_REQUEST");
      await expectTrpcError(admin().search({ query: "a", limit: 51 }), "BAD_REQUEST");
      expect(search.called).to.be.false;
    });

    it("matches the id exactly and the text columns with escaped LIKE patterns", async () => {
      const query = sinon.stub(DAO, "query").resolves([[], []] as any);
      await DAO.reviewqueue.search("12", 10);
      expect(query.firstCall.args[0]).to.match(
        /WHERE ID = \? OR KID LIKE \? OR External_ID LIKE \? OR Payer_name LIKE \? OR Message LIKE \?/,
      );
      expect(query.firstCall.args[1]).to.deep.equal([12, "%12%", "%12%", "%12%", "%12%", 12, 10]);

      await DAO.reviewqueue.search("50%_off\\", 3);
      expect(query.secondCall.args[1]).to.deep.equal([
        null,
        "%50\\%\\_off\\\\%",
        "%50\\%\\_off\\\\%",
        "%50\\%\\_off\\\\%",
        "%50\\%\\_off\\\\%",
        null,
        3,
      ]);
    });
  });

  describe("register", () => {
    let getById: sinon.SinonStub;
    let claim: sinon.SinonStub;
    let release: sinon.SinonStub;
    let setDonation: sinon.SinonStub;
    let confirm: sinon.SinonStub;

    beforeEach(() => {
      getById = sinon.stub(DAO.reviewqueue, "getById").resolves(item());
      claim = sinon.stub(DAO.reviewqueue, "claimForRegistration").resolves(true);
      release = sinon.stub(DAO.reviewqueue, "releaseRegistrationClaim").resolves();
      setDonation = sinon.stub(DAO.reviewqueue, "setDonation").resolves();
      sinon.stub(DAO.payment, "getMethods").resolves([{ id: 4 }, { id: 5 }] as any);
      sinon.stub(DAO.meta, "getDataOwners").resolves([{ id: 3 }] as any);
      sinon.stub(DAO.donations, "externalRefExists").resolves(false);
      confirm = sinon.stub(donationsService, "confirmDonation").resolves(99);
    });

    it("registers a donation from the item's values and marks the item", async () => {
      getById
        .onSecondCall()
        .resolves(item({ status: "registered", donationId: 99, resolvedBy: "admin@example.org" }));

      const result = await admin({
        sub: "auth0|1",
        "https://example.org/email": "admin@example.org",
      }).register({ id: 5, KID: "12345678", metaOwnerId: 3, sendReceipt: true });

      expect(claim.firstCall.args).to.deep.equal([5, "admin@example.org"]);
      expect(confirm.firstCall.args[0]).to.deep.equal({
        KID: "12345678",
        paymentMethodId: 4,
        sum: 250,
        timestamp: new Date("2026-10-01T10:00:00.000Z"),
        externalRef: "vipps.123",
        metaOwnerId: 3,
        sendReceipt: true,
      });
      expect(setDonation.firstCall.args).to.deep.equal([5, 99]);
      expect(release.called).to.be.false;
      expect(result).to.deep.include({ donationId: 99, KID: "12345678", newDistribution: false });
      expect(result.item.status).to.equal("registered");
    });

    it("uses overrides and the token subject without an email claim", async () => {
      await admin({ sub: "auth0|2" }).register({
        id: 5,
        KID: "12345678",
        sum: 300,
        timestamp: "2026-10-03",
        paymentId: 5,
        paymentExternalRef: null,
        metaOwnerId: 3,
        sendReceipt: false,
      });
      expect(claim.firstCall.args[1]).to.equal("auth0|2");
      expect(confirm.firstCall.args[0]).to.deep.include({
        paymentMethodId: 5,
        sum: 300,
        externalRef: null,
        timestamp: new Date("2026-10-03"),
      });
    });

    it("defaults the data owner to the item's, then the default owner", async () => {
      sinon.stub(DAO.meta, "getDefaultOwnerID").resolves(1);
      (DAO.meta.getDataOwners as sinon.SinonStub).resolves([{ id: 1 }, { id: 3 }] as any);

      getById.resolves(item({ metaOwnerId: 3 }));
      await admin().register({ id: 5, KID: "12345678", sendReceipt: false });
      expect(confirm.firstCall.args[0]).to.deep.include({ metaOwnerId: 3 });

      getById.resolves(item({ metaOwnerId: null }));
      await admin().register({ id: 5, KID: "12345678", sendReceipt: false });
      expect(confirm.secondCall.args[0]).to.deep.include({ metaOwnerId: 1 });

      getById.resolves(item({ metaOwnerId: 3 }));
      await admin().register({ id: 5, KID: "12345678", metaOwnerId: 1, sendReceipt: false });
      expect(confirm.thirdCall.args[0]).to.deep.include({ metaOwnerId: 1 });
    });

    it("creates a distribution like donations.register", async () => {
      sinon.stub(DAO.donors, "getByID").resolves({ id: 7 } as any);
      sinon.stub(DAO.organizations, "getByIDs").resolves([{ ID: 1, cause_area_ID: 1 }] as any);
      const create = sinon
        .stub(donationsService, "createDistribution")
        .resolves({ KID: "87654321", newDistribution: true });

      const result = await admin().register({
        id: 5,
        distribution: {
          donorId: 7,
          taxUnitId: null,
          causeAreas: [
            {
              id: 1,
              percentageShare: "100",
              standardSplit: false,
              organizations: [{ id: 1, percentageShare: "100" }],
            },
          ],
        },
        metaOwnerId: 3,
        sendReceipt: false,
      });

      expect(create.calledOnce).to.be.true;
      expect(confirm.firstCall.args[0].KID).to.equal("87654321");
      expect(result).to.deep.include({ KID: "87654321", newDistribution: true });
    });

    it("rejects already resolved items with CONFLICT", async () => {
      getById.resolves(item({ status: "ignored" }));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "CONFLICT",
        /already ignored/,
      );
      expect(claim.called).to.be.false;
      expect(confirm.called).to.be.false;
    });

    it("rejects with CONFLICT when another admin claims the item first", async () => {
      claim.resolves(false);
      getById.onSecondCall().resolves(item({ status: "registered" }));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "CONFLICT",
        /already registered/,
      );
      expect(confirm.called).to.be.false;
    });

    it("releases the claim when registering fails", async () => {
      confirm.rejects(new Error("NO_KID: KID 1 does not exist"));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "BAD_REQUEST",
        /NO_KID/,
      );
      expect(release.calledOnceWith(5)).to.be.true;
      expect(setDonation.called).to.be.false;
    });

    it("releases the claim when the external reference is taken", async () => {
      (DAO.donations.externalRefExists as sinon.SinonStub).resolves(true);
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "CONFLICT",
        /vipps.123 already exists/,
      );
      expect(release.calledOnceWith(5)).to.be.true;
      expect(confirm.called).to.be.false;
    });

    it("asks for values the item can't provide", async () => {
      getById.resolves(item({ date: null }));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "BAD_REQUEST",
        /no date/,
      );
      getById.resolves(item({ amount: "-10.00" }));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "BAD_REQUEST",
        /provide a sum/,
      );
      getById.resolves(item({ externalId: "x".repeat(40) }));
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "BAD_REQUEST",
        /paymentExternalRef/,
      );
      expect(claim.called).to.be.false;
    });

    it("returns NOT_FOUND for unknown items", async () => {
      getById.resolves(null);
      await expectTrpcError(
        admin().register({ id: 5, KID: "1", metaOwnerId: 3, sendReceipt: false }),
        "NOT_FOUND",
      );
    });
  });

  describe("ignore and reopen", () => {
    it("ignores an open item with a note", async () => {
      const ignore = sinon.stub(DAO.reviewqueue, "ignore").resolves(true);
      sinon.stub(DAO.reviewqueue, "getById").resolves(item({ status: "ignored", note: "test" }));

      const result = await admin({ email: "a@example.org" }).ignore({ id: 5, note: " test " });

      expect(ignore.firstCall.args).to.deep.equal([5, "a@example.org", "test"]);
      expect(result.status).to.equal("ignored");
    });

    it("ignores without a note", async () => {
      const ignore = sinon.stub(DAO.reviewqueue, "ignore").resolves(true);
      sinon.stub(DAO.reviewqueue, "getById").resolves(item({ status: "ignored" }));
      await admin().ignore({ id: 5 });
      expect(ignore.firstCall.args).to.deep.equal([5, "auth0|admin", null]);
    });

    it("rejects ignoring resolved or unknown items", async () => {
      sinon.stub(DAO.reviewqueue, "ignore").resolves(false);
      const getById = sinon.stub(DAO.reviewqueue, "getById");
      getById.withArgs(5).resolves(item({ status: "registered" }));
      getById.withArgs(6).resolves(null);
      await expectTrpcError(admin().ignore({ id: 5 }), "CONFLICT", /already registered/);
      await expectTrpcError(admin().ignore({ id: 6 }), "NOT_FOUND");
    });

    it("reopens an ignored item", async () => {
      const reopen = sinon.stub(DAO.reviewqueue, "reopen").resolves(true);
      sinon.stub(DAO.reviewqueue, "getById").resolves(item());
      expect((await admin().reopen({ id: 5 })).status).to.equal("open");
      expect(reopen.calledOnceWith(5)).to.be.true;
    });

    it("clears the resolver and the ignore note when reopening", async () => {
      const query = sinon.stub(DAO, "query").resolves([{ affectedRows: 1 }, []] as any);
      expect(await DAO.reviewqueue.reopen(5)).to.equal(true);
      expect(query.firstCall.args[0]).to.contain(
        "SET Status = 'open', Resolved_by = NULL, Resolved_at = NULL, Note = NULL",
      );
    });

    it("refuses to reopen open items and items whose donation exists", async () => {
      sinon.stub(DAO.reviewqueue, "reopen").resolves(false);
      const getById = sinon.stub(DAO.reviewqueue, "getById");
      getById.withArgs(5).resolves(item());
      getById.withArgs(6).resolves(item({ id: 6, status: "registered", donationId: 99 }));
      await expectTrpcError(admin().reopen({ id: 5 }), "CONFLICT", /already open/);
      await expectTrpcError(admin().reopen({ id: 6 }), "CONFLICT", /donation 99/);
    });
  });
});
