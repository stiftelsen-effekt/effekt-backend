import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import type { Round, RoundSummary, Transfer } from "../custom_modules/regranting/types";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const callerWith = (auth?: Record<string, unknown>) =>
  createCaller({ req: {} as Request, res: {} as Response, auth: auth as any }).regranting;
const admin = (claims: Record<string, unknown> = { sub: "auth0|bob", email: "bob@example.org" }) =>
  callerWith({ permissions: ["admin"], ...claims });

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code, err.message).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

const arrayResults = new Set([
  "getBalances",
  "getOrganizations",
  "listFunds",
  "getFundGrants",
  "getTransfers",
  "listHolds",
  "getRoundDonations",
  "getFronted",
  "getLastTransfers",
  "listAdjustments",
  "getSnapshot",
  "listRoutings",
  "overlappingRoutings",
  "listProjects",
  "listPayees",
  "listRounds",
  "existingDonationIds",
  "getStatementRows",
  "getCommittedLines",
  "deleteRoundLinesFor",
]);
const mapResults = new Set([
  "getPayeesAt",
  "getIncludeDirectOverrides",
  "getProjectOrganizations",
  "getProjectNames",
]);

type Stubs = Record<keyof typeof DAO.regranting, sinon.SinonStub>;

/** Stubs every DAO.regranting function with an empty result; transactions run on a fake connection */
const stubDao = (): Stubs => {
  const stubs = {} as Stubs;
  for (const key of Object.keys(DAO.regranting) as (keyof typeof DAO.regranting)[]) {
    const stub = sinon.stub(DAO.regranting, key) as sinon.SinonStub;
    if (arrayResults.has(key)) stub.resolves([]);
    else if (mapResults.has(key)) stub.resolves(new Map());
    else stub.resolves(null);
    stubs[key] = stub;
  }
  stubs.inTransaction.callsFake((fn: (conn: unknown) => unknown) => fn({ fake: true }));
  stubs.getUnassigned.resolves({ amount: "0.00", donationCount: 0 });
  stubs.getOrganizations.resolves([
    { id: 1, name: "AGF", abbriv: "AGF", isActive: true, ordering: 1 },
    { id: 3, name: "MC", abbriv: "MC", isActive: true, ordering: 3 },
    { id: 4, name: "Fund", abbriv: "GEBF", isActive: true, ordering: 4 },
  ]);
  return stubs;
};

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 7,
  name: "Q3",
  kind: "regular",
  cutoff: "2026-09-30",
  status: "draft",
  minTransfer: "0.00",
  createdBy: "alice@example.org",
  createdAt: new Date("2026-10-01"),
  approvedBy: null,
  approvedAt: null,
  paidAt: null,
  ...overrides,
});
const summary = (r: Round): RoundSummary => ({
  ...r,
  totalNok: "0.00",
  transferCount: 0,
  fundGrantCount: 0,
  fundGrantTotal: "0.00",
});

const transfer = (overrides: Partial<Transfer> = {}): Transfer => ({
  id: 70,
  roundId: 7,
  payee: { id: 10, name: "GiveWell", currency: "NOK" },
  amountNok: "1000.00",
  currency: "NOK",
  amountForeign: null,
  fxRate: null,
  bankFee: null,
  paidAt: null,
  bankRef: null,
  paidBy: "foundation",
  lines: [
    {
      id: 700,
      transferId: 70,
      organizationId: 1,
      organizationName: "AGF",
      projectId: null,
      projectName: null,
      amountNok: "1000.00",
    },
  ],
  ...overrides,
});

const balanceRow = (organizationId: number, allocations: string) => ({
  organizationId,
  projectId: null,
  opening: "0.00",
  allocations,
  fundGrantsIn: "0.00",
  fundGrantsOut: "0.00",
  transfers: "0.00",
  adjustments: "0.00",
  committed: "0.00",
  laterDebits: "0.00",
  inflowSince: "0.00",
});

describe("tRPC regranting", () => {
  afterEach(() => sinon.restore());

  describe("auth and input", () => {
    it("rejects anonymous and non-admin callers", async () => {
      const stubs = stubDao();
      await expectTrpcError(callerWith().rounds.list(), "UNAUTHORIZED");
      await expectTrpcError(
        callerWith({ permissions: ["read:profile"] }).balances.list(),
        "FORBIDDEN",
      );
      expect(stubs.listRounds.called).to.be.false;
    });

    it("rejects unknown fields and invalid values", async () => {
      stubDao();
      await expectTrpcError(
        admin().rounds.list({ statuses: ["reconciled" as any] }),
        "BAD_REQUEST",
      );
      await expectTrpcError(admin().balances.list({ at: "30.09.2026" as any }), "BAD_REQUEST");
      await expectTrpcError(admin().holds.list({ extra: 1 } as any), "BAD_REQUEST");
      await expectTrpcError(
        admin().transfers.setLines({
          id: 1,
          lines: [
            { organizationId: 1, projectId: null, amountNok: 1 },
            { organizationId: 1, projectId: null, amountNok: 2 },
          ],
        }),
        "BAD_REQUEST",
        /appears twice/,
      );
      await expectTrpcError(
        admin().transfers.setLine({ id: 1, organizationId: 1, projectId: null, amountNok: 1.005 }),
        "BAD_REQUEST",
      );
    });

    it("major_donor rounds need donations and only they have them", async () => {
      stubDao();
      await expectTrpcError(
        admin().rounds.create({ name: "x", kind: "major_donor", cutoff: "2026-09-30" }),
        "BAD_REQUEST",
        /donationIds/,
      );
      await expectTrpcError(
        admin().rounds.create({
          name: "x",
          kind: "regular",
          cutoff: "2026-09-30",
          donationIds: [1],
        }),
        "BAD_REQUEST",
        /donationIds/,
      );
    });

    it("adjustment links match the type; fronted amounts are positive", async () => {
      stubDao();
      const base = { organizationId: 1, reason: "r", effectiveAt: "2026-09-30" };
      await expectTrpcError(
        admin().adjustments.create({ ...base, amount: 10, type: "fee", linkedTransferId: 1 }),
        "BAD_REQUEST",
        /Only corrections/,
      );
      await expectTrpcError(
        admin().adjustments.create({
          ...base,
          amount: 10,
          type: "correction",
          linkedDonationId: 1,
        }),
        "BAD_REQUEST",
        /Only fronted/,
      );
      await expectTrpcError(
        admin().adjustments.create({ ...base, amount: -10, type: "fronted" }),
        "BAD_REQUEST",
        /positive/,
      );
      await expectTrpcError(
        admin().adjustments.create({ ...base, amount: 0, type: "fee" }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        admin().adjustments.create({ ...base, amount: 5, type: "fee", reason: "   " }),
        "BAD_REQUEST",
      );
    });
  });

  describe("authors", () => {
    it("records the creator from the token's email claim, else its subject", async () => {
      const stubs = stubDao();
      stubs.createRound.resolves(7);
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round()));

      await admin().rounds.create({
        name: "Q3",
        kind: "regular",
        cutoff: "2026-09-30",
        propose: false,
      });
      expect(stubs.createRound.firstCall.args[2]).to.equal("bob@example.org");

      await admin({ sub: "auth0|carol" }).rounds.create({
        name: "Q3",
        kind: "regular",
        cutoff: "2026-09-30",
        propose: false,
      });
      expect(stubs.createRound.secondCall.args[2]).to.equal("auth0|carol");
      expect(stubs.createRound.firstCall.args[1]).to.deep.include({ minTransfer: 0 });
    });

    it("records who created an adjustment", async () => {
      const stubs = stubDao();
      stubs.createAdjustment.resolves(5);
      stubs.getAdjustment.resolves({ id: 5 });
      await admin({
        "https://gieffektivt.no/email": "nina@example.org",
        sub: "x",
      }).adjustments.create({
        organizationId: 1,
        amount: -100,
        type: "fee",
        reason: "Wire fee charged to recipient",
        effectiveAt: "2026-09-30",
      });
      expect(stubs.createAdjustment.firstCall.args[1]).to.equal("nina@example.org");
      expect(stubs.createAdjustment.firstCall.args[0]).to.deep.include({
        projectId: null,
        roundId: null,
        linkedTransferId: null,
        documentRef: null,
      });
    });
  });

  describe("approval", () => {
    it("requires someone other than the creator", async () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round({ createdBy: "bob@example.org" }));
      await expectTrpcError(admin().rounds.approve({ id: 7 }), "FORBIDDEN", /someone other/);
      expect(stubs.setRoundApproved.called).to.be.false;
    });

    it("returns the issues and changes nothing when validation finds errors", async () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round());
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round()));
      stubs.getTransfers.resolves([transfer({ amountNok: "999.00" })]);
      stubs.getBalances.resolves([balanceRow(1, "1000.00")]);
      stubs.getPayeesAt.resolves(new Map([[1, { id: 10, name: "GiveWell", currency: "NOK" }]]));

      const result = await admin().rounds.approve({ id: 7 });
      expect(result.approved).to.be.false;
      expect(result.issues.map((i) => i.code)).to.deep.equal(["transfer_lines_mismatch"]);
      expect(stubs.writeSnapshot.called).to.be.false;
      expect(stubs.setRoundApproved.called).to.be.false;
    });

    it("writes the snapshot and approves round and fund grants", async () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round());
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round({ status: "approved" })));
      stubs.getTransfers.resolves([transfer()]);
      stubs.getBalances.resolves([balanceRow(1, "1200.00")]);
      stubs.getPayeesAt.resolves(new Map([[1, { id: 10, name: "GiveWell", currency: "NOK" }]]));

      const result = await admin().rounds.approve({ id: 7 });
      expect(result.approved).to.be.true;
      expect(stubs.writeSnapshot.firstCall.args[2]).to.deep.equal([
        {
          organizationId: 1,
          projectId: null,
          balanceAtCutoff: "1200.00",
          committed: "0.00",
          fundGrants: "0.00",
          inRound: "1000.00",
          includedDirect: true,
        },
      ]);
      expect(stubs.setRoundApproved.firstCall.args.slice(1)).to.deep.equal([7, "bob@example.org"]);
      // balances at the cutoff exclude the round itself
      expect(stubs.getBalances.firstCall.args[0]).to.deep.equal({
        at: "2026-09-30",
        excludeRoundId: 7,
      });
    });

    it("only approves drafts", async () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round({ status: "paid" }));
      await expectTrpcError(admin().rounds.approve({ id: 7 }), "CONFLICT", /never edited/);
      stubs.lockRound.resolves(null);
      await expectTrpcError(admin().rounds.approve({ id: 7 }), "NOT_FOUND");
    });
  });

  describe("locking", () => {
    it("draft-only edits fail with CONFLICT on approved and paid rounds", async () => {
      const stubs = stubDao();
      stubs.getTransfer.resolves(transfer());
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        admin().transfers.setLine({ id: 70, organizationId: 1, projectId: null, amountNok: 5 }),
        "CONFLICT",
        /approved/,
      );
      stubs.lockRound.resolves(round({ status: "paid" }));
      await expectTrpcError(admin().transfers.delete({ id: 70 }), "CONFLICT", /paid/);
      await expectTrpcError(
        admin().rounds.setIncludeDirect({ roundId: 7, organizationId: 1, includeDirect: true }),
        "CONFLICT",
      );
      expect(stubs.replaceTransferLines.called).to.be.false;
      expect(stubs.deleteTransfer.called).to.be.false;
      expect(stubs.setIncludeDirect.called).to.be.false;
    });

    it("payments are recorded on approved rounds only, and all before marking paid", async () => {
      const stubs = stubDao();
      stubs.getTransfer.resolves(transfer());
      stubs.lockRound.resolves(round({ status: "draft" }));
      await expectTrpcError(
        admin().transfers.recordPayment({ id: 70, paidAt: "2026-10-05" }),
        "CONFLICT",
        /approve it first/,
      );
      stubs.lockRound.resolves(round({ status: "approved" }));
      await admin().transfers.recordPayment({
        id: 70,
        paidAt: "2026-10-05",
        fxRate: "11.52",
        bankFee: 30,
      });
      expect(stubs.recordPayment.firstCall.args[2]).to.deep.equal({
        paidAt: "2026-10-05",
        currency: "NOK",
        amountForeign: null,
        fxRate: "11.52",
        bankFee: 30,
        bankRef: null,
        paidBy: "foundation",
      });

      stubs.getTransfers.resolves([transfer(), transfer({ id: 71, paidAt: "2026-10-05" })]);
      await expectTrpcError(admin().rounds.markPaid({ id: 7 }), "PRECONDITION_FAILED", /70/);
      expect(stubs.setRoundPaid.called).to.be.false;
    });

    it("transfer setLine replaces just that line and syncs the amount", async () => {
      const stubs = stubDao();
      stubs.getTransfer.resolves(transfer());
      stubs.lockRound.resolves(round());
      await admin().transfers.setLine({
        id: 70,
        organizationId: 3,
        projectId: null,
        amountNok: 250,
      });
      expect(stubs.replaceTransferLines.firstCall.args.slice(1)).to.deep.equal([
        70,
        [
          { organizationId: 1, projectId: null, amount: "1000.00" },
          { organizationId: 3, projectId: null, amount: 250 },
        ],
        true,
      ]);
      await admin().transfers.setLine({ id: 70, organizationId: 1, projectId: null, amountNok: 0 });
      expect(stubs.replaceTransferLines.secondCall.args[2]).to.deep.equal([]);
    });

    it("adjustments in approved or paid rounds can't change", async () => {
      const stubs = stubDao();
      stubs.getAdjustment.resolves({ id: 5, roundId: 7, type: "correction" });
      stubs.getRound.resolves(round({ status: "approved" }));
      await expectTrpcError(admin().adjustments.delete({ id: 5 }), "CONFLICT");
      expect(stubs.deleteAdjustment.called).to.be.false;
    });

    it("fronted entries can be linked to their donation after the round is paid", async () => {
      const stubs = stubDao();
      stubs.getAdjustment.resolves({ id: 5, roundId: 7, type: "fronted" });
      stubs.existingDonationIds.resolves([123]);
      await admin().adjustments.linkDonation({ id: 5, donationId: 123 });
      expect(stubs.linkAdjustmentDonation.firstCall.args).to.deep.equal([5, 123]);
      stubs.getAdjustment.resolves({ id: 6, roundId: null, type: "fee" });
      await expectTrpcError(
        admin().adjustments.linkDonation({ id: 6, donationId: 123 }),
        "BAD_REQUEST",
      );
    });
  });

  describe("references", () => {
    it("own funds can't be on transfer lines or receive fund grants", async () => {
      const stubs = stubDao();
      stubs.listFunds.resolves([
        { organizationId: 4, name: "Fund", abbriv: "GEBF", maxHoldDays: null },
      ]);
      stubs.getFund.resolves({
        organizationId: 4,
        name: "Fund",
        abbriv: "GEBF",
        maxHoldDays: null,
      });
      await expectTrpcError(
        admin().transfers.setLine({ id: 70, organizationId: 4, projectId: null, amountNok: 5 }),
        "BAD_REQUEST",
        /own fund/,
      );
      await expectTrpcError(
        admin().fundGrants.create({
          roundId: 7,
          fundId: 4,
          rationale: "r",
          lines: [{ organizationId: 4, projectId: null, amount: 5 }],
        }),
        "BAD_REQUEST",
        /own fund/,
      );
      stubs.getFund.resolves(null);
      await expectTrpcError(
        admin().fundGrants.create({
          roundId: 7,
          fundId: 1,
          rationale: "r",
          lines: [{ organizationId: 3, projectId: null, amount: 5 }],
        }),
        "BAD_REQUEST",
        /not an own fund/,
      );
    });

    it("routings may not overlap for a recipient", async () => {
      const stubs = stubDao();
      stubs.getPayee.resolves({ id: 10 });
      stubs.overlappingRoutings.resolves([
        { id: 1, payeeName: "GiveWell", validFrom: "2020-01-01", validTo: null },
      ]);
      await expectTrpcError(
        admin().routings.create({ organizationId: 3, payeeId: 11, validFrom: "2026-08-01" }),
        "CONFLICT",
        /GiveWell/,
      );
      await expectTrpcError(
        admin().routings.create({
          organizationId: 3,
          payeeId: 11,
          validFrom: "2026-08-01",
          validTo: "2026-07-01",
        }),
        "BAD_REQUEST",
      );
      expect(stubs.createRouting.called).to.be.false;
    });
  });

  describe("major donor scoping in the builder", () => {
    it("leaves donations already passed on out of the chosen allocations", async () => {
      const stubs = stubDao();
      const md = round({ kind: "major_donor" });
      stubs.getRound.resolves(md);
      stubs.getRoundSummary.resolves(summary(md));
      stubs.getBalances.resolves([balanceRow(3, "15000.00")]);
      stubs.getPayeesAt.resolves(new Map([[3, { id: 10, name: "GiveWell", currency: "NOK" }]]));
      const donation = {
        donorId: 1,
        sum: "10000.00",
        timestampConfirmed: new Date("2026-09-01"),
        afterCutoff: false,
        passedOnByRoundId: null,
        frontedByAdjustmentId: null,
        allocations: [{ organizationId: 3, amount: "10000.00" }],
      };
      stubs.getRoundDonations.resolves([
        { ...donation, donationId: 1 },
        {
          ...donation,
          donationId: 2,
          sum: "4000.00",
          allocations: [{ organizationId: 3, amount: "4000.00" }],
          frontedByAdjustmentId: 9,
        },
        {
          ...donation,
          donationId: 3,
          sum: "500.00",
          allocations: [{ organizationId: 3, amount: "500.00" }],
          afterCutoff: true,
        },
      ]);

      const builder = await admin().rounds.builder({ id: 7 });
      const mc = builder.recipients.find((r) => r.organizationId === 3)!;
      expect(mc.chosenAllocations).to.equal("10000.00");
      expect(mc.totals.proposed).to.equal("10000.00");
      expect(
        builder.donations.map((d) => [d.donationId, d.inScope, d.excludedReason]),
      ).to.deep.equal([
        [1, true, null],
        [2, false, "passed_on"],
        [3, false, "after_cutoff"],
      ]);
      expect(builder.issues.map((i) => [i.code, i.donationId])).to.deep.equal([
        ["donation_already_passed_on", 2],
      ]);
    });
  });

  describe("DAO getBalances", () => {
    it("passes one parameter per placeholder, with and without a recipient filter", async () => {
      sinon.restore();
      const query = sinon.stub(DAO, "query").resolves([[], []] as any);
      await DAO.regranting.getBalances({ at: "2026-09-30" });
      await DAO.regranting.getBalances({
        at: "2026-09-30",
        organizationIds: [1, 2],
        excludeRoundId: 3,
        inflowSince: "2026-06-30",
      });
      for (const call of query.getCalls()) {
        const [sql, params] = call.args as [string, unknown[]];
        expect((sql.match(/\?/g) ?? []).length).to.equal(params.length);
      }
      const [, filtered] = query.secondCall.args as [string, unknown[]];
      expect(filtered[0]).to.equal("2026-06-30");
      expect(filtered.filter((p) => Array.isArray(p))).to.have.length(5);
      expect(filtered.filter((p) => p === 3)).to.have.length(3);
    });

    it("returns nothing for an empty recipient filter without querying", async () => {
      sinon.restore();
      const query = sinon.stub(DAO, "query");
      expect(
        await DAO.regranting.getBalances({ at: "2026-09-30", organizationIds: [] }),
      ).to.deep.equal([]);
      expect(query.called).to.be.false;
    });
  });
});
