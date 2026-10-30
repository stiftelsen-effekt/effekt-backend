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
  "listDocuments",
]);
const mapResults = new Set([
  "getPayeesAt",
  "getIncludeDirectOverrides",
  "getProjectOrganizations",
  "getProjectNames",
  "documentsFor",
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
  notes: null,
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
  notes: null,
  documents: [],
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
          roundAdjustments: "0.00",
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

    it("notes can be set and cleared in any status, also on paid rounds", async () => {
      const stubs = stubDao();
      stubs.getRoundSummary.resolves(summary(round({ status: "paid", notes: "AMF got more" })));
      stubs.getTransfer.resolves(transfer({ paidAt: "2016-04-10", notes: "Held back 500 kr" }));
      stubs.lockRound.resolves(round({ status: "paid" }));

      const r = await admin().rounds.setNotes({ id: 7, notes: "  AMF got more\nsee bilag  " });
      expect(r.notes).to.equal("AMF got more");
      expect(stubs.setRoundNotes.firstCall.args.slice(0, 2)).to.deep.equal([
        7,
        "AMF got more\nsee bilag",
      ]);
      await admin().rounds.setNotes({ id: 7, notes: "   " });
      expect(stubs.setRoundNotes.secondCall.args.slice(0, 2)).to.deep.equal([7, null]);

      const t = await admin().transfers.setNotes({ id: 70, notes: "Held back 500 kr" });
      expect(t.notes).to.equal("Held back 500 kr");
      await admin().transfers.setNotes({ id: 70, notes: null });
      expect(stubs.setTransferNotes.args.map((a) => a.slice(0, 2))).to.deep.equal([
        [70, "Held back 500 kr"],
        [70, null],
      ]);
      // No round lock: notes are documentation, not money
      expect(stubs.lockRound.called).to.be.false;

      await expectTrpcError(
        admin().rounds.setNotes({ id: 7, notes: "x".repeat(5001) }),
        "BAD_REQUEST",
      );
      stubs.getRoundSummary.resolves(null);
      await expectTrpcError(admin().rounds.setNotes({ id: 8, notes: "x" }), "NOT_FOUND");
      stubs.getTransfer.resolves(null);
      await expectTrpcError(admin().transfers.setNotes({ id: 71, notes: "x" }), "NOT_FOUND");
    });

    it("draft transfers take notes on create and update", async () => {
      const stubs = stubDao();
      stubs.getPayee.resolves({ id: 10, name: "GiveWell", currency: "NOK" } as any);
      stubs.lockRound.resolves(round());
      stubs.createTransfer.resolves(70);
      stubs.getTransfer.resolves(transfer());
      await admin().transfers.create({ roundId: 7, payeeId: 10, notes: " Mis-keyed KID " });
      expect(stubs.createTransfer.firstCall.args[1].notes).to.equal("Mis-keyed KID");
      await admin().transfers.update({ id: 70, notes: "" });
      expect(stubs.setTransferNotes.firstCall.args.slice(0, 2)).to.deep.equal([70, null]);
      await admin().transfers.update({ id: 70, currency: "USD" });
      expect(stubs.setTransferNotes.calledOnce).to.be.true;
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
        currency: "EUR",
        amountForeign: "86.81",
        fxRate: "11.52",
        bankFee: 30,
      });
      expect(stubs.recordPayment.firstCall.args[2]).to.deep.equal({
        paidAt: "2026-10-05",
        currency: "EUR",
        amountForeign: "86.81",
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
      stubs.getAdjustment.resolves({
        id: 5,
        roundId: 7,
        type: "correction",
        pairedAdjustmentId: null,
      });
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        admin().adjustments.delete({ id: 5 }),
        "CONFLICT",
        /Q3 \(cutoff 30\.09\.2026\)/,
      );
      expect(stubs.deleteAdjustments.called).to.be.false;
      // Attaching a new adjustment to an approved round locks it and fails too
      await expectTrpcError(
        admin().adjustments.create({
          organizationId: 1,
          amount: -10,
          type: "correction",
          reason: "r",
          effectiveAt: "2026-09-30",
          roundId: 7,
        }),
        "CONFLICT",
        /approved/,
      );
      expect(stubs.createAdjustment.called).to.be.false;
    });

    it("half of an earmark is deleted with its pair and can't be edited alone", async () => {
      const stubs = stubDao();
      const half = {
        id: 5,
        roundId: 7,
        type: "reallocation",
        reason: "Earmarked for Water in Q3",
        pairedAdjustmentId: 6,
      };
      stubs.getAdjustment.resolves(half);
      stubs.lockRound.resolves(round());
      const result = await admin().adjustments.delete({ id: 5 });
      expect(result.deletedIds).to.deep.equal([5, 6]);
      expect(stubs.deleteAdjustments.firstCall.args[1]).to.deep.equal([5, 6]);
      await expectTrpcError(
        admin().adjustments.update({
          id: 5,
          organizationId: 1,
          amount: -5,
          type: "reallocation",
          reason: "smaller",
          effectiveAt: "2026-09-30",
          roundId: 7,
        }),
        "CONFLICT",
        /half of an earmark/,
      );
      expect(stubs.updateAdjustment.called).to.be.false;
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
        /AGF isn't an own fund/,
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

  describe("payments", () => {
    const record = (extra: Record<string, unknown>) =>
      admin().transfers.recordPayment({ id: 70, paidAt: "2026-10-05", ...extra } as any);

    it("needs the foreign amount and FX rate of a foreign-currency transfer, and they add up", async () => {
      const stubs = stubDao();
      stubs.getTransfer.resolves(transfer({ currency: "EUR" }));
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        record({}),
        "BAD_REQUEST",
        /EUR transfer needs the amount paid in EUR and the FX rate/,
      );
      await expectTrpcError(record({ amountForeign: "86.81" }), "BAD_REQUEST", /needs the FX rate/);
      // 86.81 × 12.52 = 1086.86, the transfer is 1000: more than 5 kr apart
      await expectTrpcError(
        record({ amountForeign: "86.81", fxRate: "12.52" }),
        "BAD_REQUEST",
        /86\.81 EUR at 12\.52 NOK\/EUR is 1\s086,86\skr, but the transfer is 1\s000,00\skr/,
      );
      expect(stubs.recordPayment.called).to.be.false;
      await record({ amountForeign: "86.81", fxRate: "11.52" }); // 1000.05: within 5 kr
      expect(stubs.recordPayment.calledOnce).to.be.true;
    });

    it("a NOK transfer has no foreign amount or FX rate", async () => {
      const stubs = stubDao();
      stubs.getTransfer.resolves(transfer());
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        record({ fxRate: "1" }),
        "BAD_REQUEST",
        /NOK transfer has no foreign amount/,
      );
      await expectTrpcError(record({ bankFee: -1 }), "BAD_REQUEST");
      // The currency in the input wins over the transfer's
      await expectTrpcError(record({ currency: "USD" }), "BAD_REQUEST", /USD transfer needs/);
      expect(stubs.recordPayment.called).to.be.false;
    });
  });

  describe("adjustments attached to a round", () => {
    const adjustment = (overrides: Record<string, unknown>) => ({
      id: 1,
      organizationId: 1,
      organizationName: "AGF",
      projectId: null,
      projectName: null,
      amount: "0.00",
      type: "reallocation",
      reason: "r",
      effectiveAt: "2026-09-30",
      roundId: 7,
      linkedTransferId: null,
      linkedDonationId: null,
      documents: [],
      createdBy: "alice@example.org",
      createdAt: new Date("2026-10-01"),
      pairedAdjustmentId: null,
      roundStatus: "draft",
      pending: true,
      affectsBalance: false,
      ...overrides,
    });

    it("count in the round's own positions and proposal, kept apart from the balance", async () => {
      const stubs = stubDao();
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round()));
      stubs.getBalances.resolves([balanceRow(1, "1000.00")]);
      stubs.getPayeesAt.resolves(new Map([[1, { id: 10, name: "GiveWell", currency: "NOK" }]]));
      stubs.getProjectNames.resolves(new Map([[61, { name: "Water", status: "active" }]]));
      stubs.listAdjustments.resolves([
        adjustment({ id: 1, amount: "-300.00", pairedAdjustmentId: 2 }),
        adjustment({
          id: 2,
          projectId: 61,
          projectName: "Water",
          amount: "300.00",
          pairedAdjustmentId: 1,
        }),
        adjustment({ id: 3, type: "fronted", amount: "50.00" }), // a record only
        adjustment({ id: 4, amount: "20.00", effectiveAt: "2026-10-05" }), // after the cutoff
      ]);

      const builder = await admin().rounds.builder({ id: 7 });
      const agf = builder.recipients.find((r) => r.organizationId === 1)!;
      expect(
        agf.lines.map((l) => [
          l.projectName,
          l.balanceAtCutoff,
          l.roundAdjustments,
          l.available,
          l.proposed,
        ]),
      ).to.deep.equal([
        [null, "1000.00", "-300.00", "700.00", "700.00"],
        ["Water", "0.00", "300.00", "300.00", "300.00"],
      ]);
      expect(stubs.listAdjustments.firstCall.args[0]).to.deep.equal({ roundId: 7 });
    });

    it("are paid in rounds without direct donations too", async () => {
      const stubs = stubDao();
      const r = round({ kind: "fund_grant" });
      stubs.getRound.resolves(r);
      stubs.getRoundSummary.resolves(summary(r));
      stubs.getBalances.resolves([balanceRow(1, "1000.00"), balanceRow(3, "500.00")]);
      stubs.getPayeesAt.resolves(
        new Map([
          [1, { id: 10, name: "GiveWell", currency: "NOK" }],
          [3, { id: 10, name: "GiveWell", currency: "NOK" }],
        ]),
      );
      stubs.listAdjustments.resolves([
        adjustment({ id: 1, amount: "-300.00", pairedAdjustmentId: 2 }),
        adjustment({ id: 2, projectId: 61, amount: "300.00", pairedAdjustmentId: 1 }),
      ]);
      const builder = await admin().rounds.builder({ id: 7 });
      const agf = builder.recipients.find((x) => x.organizationId === 1)!;
      expect(agf.lines.map((l) => [l.projectId, l.proposed])).to.deep.equal([
        [null, "0.00"],
        [61, "300.00"],
      ]);
      // In the round: AGF has adjustments here; MC only has a balance
      expect(builder.recipients.map((x) => [x.organizationId, x.inRound])).to.deep.equal([
        [1, true],
        [3, false],
      ]);
    });

    it("the snapshot keeps them apart", async () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round());
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round({ status: "approved" })));
      stubs.getBalances.resolves([balanceRow(1, "1000.00")]);
      stubs.getPayeesAt.resolves(new Map([[1, { id: 10, name: "GiveWell", currency: "NOK" }]]));
      stubs.getTransfers.resolves([
        transfer({ amountNok: "700.00", lines: [{ ...transfer().lines[0], amountNok: "700.00" }] }),
      ]);
      stubs.listAdjustments.resolves([adjustment({ amount: "-300.00" })]);
      await admin().rounds.approve({ id: 7 });
      expect(stubs.writeSnapshot.firstCall.args[2][0]).to.include({
        balanceAtCutoff: "1000.00",
        roundAdjustments: "-300.00",
        inRound: "700.00",
      });
    });
  });

  describe("builder scope", () => {
    it("flags recipients the round touches: lines, grant lines, chosen donations or an override", async () => {
      const stubs = stubDao();
      const r = round({ kind: "extraordinary" });
      stubs.getRound.resolves(r);
      stubs.getRoundSummary.resolves(summary(r));
      stubs.getBalances.resolves([balanceRow(1, "1000.00"), balanceRow(3, "500.00")]);
      stubs.getIncludeDirectOverrides.resolves(new Map([[3, false]]));
      let builder = await admin().rounds.builder({ id: 7 });
      expect(builder.recipients.map((x) => [x.organizationId, x.inRound])).to.deep.equal([
        [1, false],
        [3, true], // an override, even one that leaves direct donations out
      ]);
      stubs.getIncludeDirectOverrides.resolves(new Map());
      stubs.getTransfers.resolves([
        transfer({ lines: [{ ...transfer().lines[0], amountNok: "1.00" }], amountNok: "1.00" }),
      ]);
      builder = await admin().rounds.builder({ id: 7 });
      expect(builder.recipients.map((x) => [x.organizationId, x.inRound])).to.deep.equal([
        [1, true],
        [3, false],
      ]);
    });
  });

  describe("earmarks", () => {
    const project = (organizationId: number) => ({
      id: 61,
      organizationId,
      organizationName: organizationId === 1 ? "AGF" : "MC",
      name: "Water",
    });
    const setUp = () => {
      const stubs = stubDao();
      stubs.lockRound.resolves(round());
      stubs.getRound.resolves(round());
      stubs.getRoundSummary.resolves(summary(round()));
      stubs.getBalances.resolves([balanceRow(1, "1200.00")]);
      stubs.getPayeesAt.resolves(new Map([[1, { id: 10, name: "GiveWell", currency: "NOK" }]]));
      stubs.getTransfers.resolves([transfer()]); // AGF unrestricted pays 1000
      stubs.getProject.resolves(project(1));
      stubs.createAdjustment.onFirstCall().resolves(11).onSecondCall().resolves(12);
      return stubs;
    };

    it("writes the paired adjustments and moves Pay now, in one transaction", async () => {
      const stubs = setUp();
      await admin().rounds.earmark({
        roundId: 7,
        organizationId: 1,
        projectId: 61,
        amount: 400,
        note: "Grant letter 12",
      });
      expect(stubs.inTransaction.calledOnce).to.be.true;
      const [from, to] = stubs.createAdjustment.getCalls().map((c) => c.args);
      expect(from[0]).to.deep.include({
        organizationId: 1,
        projectId: null,
        amount: -400,
        type: "reallocation",
        effectiveAt: "2026-09-30",
        roundId: 7,
        reason: "Earmarked for Water in Q3: Grant letter 12",
      });
      expect(to[0]).to.deep.include({ projectId: 61, amount: 400, roundId: 7 });
      expect(from[1]).to.equal("bob@example.org");
      expect(from[2]).to.deep.equal({ fake: true });
      expect(stubs.pairAdjustments.firstCall.args.slice(1)).to.deep.equal([11, 12]);
      expect(stubs.replaceTransferLines.firstCall.args.slice(1)).to.deep.equal([
        70,
        [
          { organizationId: 1, projectId: null, amount: "600.00" },
          { organizationId: 1, projectId: 61, amount: "400.00" },
        ],
        true,
      ]);
    });

    it("moves at most what the unrestricted line pays", async () => {
      const stubs = setUp();
      await admin().rounds.earmark({ roundId: 7, organizationId: 1, projectId: 61, amount: 1200 });
      expect(stubs.replaceTransferLines.firstCall.args[2]).to.deep.equal([
        { organizationId: 1, projectId: 61, amount: "1000.00" },
      ]);
    });

    it("checks the project, the amount and that the round is a draft", async () => {
      const stubs = setUp();
      stubs.getProject.resolves(project(3));
      await expectTrpcError(
        admin().rounds.earmark({ roundId: 7, organizationId: 1, projectId: 61, amount: 100 }),
        "BAD_REQUEST",
        /Water is a project at MC, not at AGF/,
      );
      stubs.getProject.resolves(project(1));
      await expectTrpcError(
        admin().rounds.earmark({ roundId: 7, organizationId: 1, projectId: 61, amount: 1200.01 }),
        "BAD_REQUEST",
        /AGF has 1\s200,00\skr unrestricted available in Q3 \(cutoff 30\.09\.2026\)/,
      );
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        admin().rounds.earmark({ roundId: 7, organizationId: 1, projectId: 61, amount: 100 }),
        "CONFLICT",
        /Can't earmark money in Q3 \(cutoff 30\.09\.2026\): it is approved/,
      );
      expect(stubs.createAdjustment.called).to.be.false;
      expect(stubs.replaceTransferLines.called).to.be.false;
    });

    it("removing one deletes both halves and moves Pay now back", async () => {
      const stubs = setUp();
      const half = (id: number, projectId: number | null, amount: string, paired: number) => ({
        id,
        organizationId: 1,
        organizationName: "AGF",
        projectId,
        amount,
        type: "reallocation",
        roundId: 7,
        pairedAdjustmentId: paired,
      });
      stubs.getAdjustment.withArgs(11).resolves(half(11, null, "-400.00", 12));
      stubs.getAdjustment.withArgs(12).resolves(half(12, 61, "400.00", 11));
      stubs.getTransfers.resolves([
        transfer({
          lines: [
            { ...transfer().lines[0], amountNok: "600.00" },
            {
              ...transfer().lines[0],
              id: 701,
              projectId: 61,
              projectName: "Water",
              amountNok: "400.00",
            },
          ],
        }),
      ]);
      await admin().rounds.removeEarmark({ adjustmentId: 11 });
      expect(stubs.replaceTransferLines.firstCall.args[2]).to.deep.equal([
        { organizationId: 1, projectId: null, amount: "1000.00" },
      ]);
      expect(stubs.deleteAdjustments.firstCall.args[1]).to.deep.equal([11, 12]);

      stubs.getAdjustment
        .withArgs(13)
        .resolves({ ...half(13, null, "-5.00", 0), pairedAdjustmentId: null, type: "fee" });
      await expectTrpcError(
        admin().rounds.removeEarmark({ adjustmentId: 13 }),
        "BAD_REQUEST",
        /isn't an earmark/,
      );
    });
  });

  describe("messages", () => {
    it("name things and write dates as dd.mm.yyyy", async () => {
      const stubs = stubDao();
      stubs.getPayee.resolves({ id: 10 });
      stubs.overlappingRoutings.resolves([
        {
          id: 1,
          organizationName: "Malaria Consortium",
          payeeName: "GiveWell",
          validFrom: "2020-01-01",
          validTo: "2026-07-31",
        },
      ]);
      await expectTrpcError(
        admin().routings.create({ organizationId: 3, payeeId: 11, validFrom: "2026-07-01" }),
        "CONFLICT",
        /^Malaria Consortium is already routed to GiveWell from 01\.01\.2020 to 31\.07\.2026; end that routing first$/,
      );
      await expectTrpcError(
        admin().transfers.setLine({ id: 70, organizationId: 99, projectId: null, amountNok: 5 }),
        "BAD_REQUEST",
        /^Recipient #99 doesn't exist$/,
      );
      stubs.getTransfers.resolves([transfer()]);
      stubs.lockRound.resolves(round({ status: "approved" }));
      await expectTrpcError(
        admin().rounds.markPaid({ id: 7 }),
        "PRECONDITION_FAILED",
        /^Record the payment of the transfer to GiveWell \(1\s000,00\skr, #70\) first$/,
      );
    });

    it("turn a delete of something still in use into a CONFLICT that says what to do", async () => {
      const stubs = stubDao();
      stubs.getPayee.resolves({ id: 10, name: "GiveWell" });
      stubs.deletePayee.rejects(
        Object.assign(new Error("ER_ROW_IS_REFERENCED_2"), { errno: 1451 }),
      );
      await expectTrpcError(
        admin().payees.delete({ id: 10 }),
        "CONFLICT",
        /GiveWell is still used by routings or transfers; mark it inactive instead/,
      );
    });
  });

  describe("statements", () => {
    it("show adjustments of draft rounds as pending, outside the running balance", async () => {
      const stubs = stubDao();
      const row = {
        projectId: null,
        donationCount: null,
        roundId: null,
        roundName: null,
        transferId: null,
        transferLineId: null,
        payeeName: null,
        bankRef: null,
        transferNotes: null,
        fundGrantId: null,
        fundGrantLineId: null,
        counterpartOrganizationId: null,
        rationale: null,
        adjustmentId: null,
        adjustmentType: null,
        reason: null,
        createdBy: null,
        pending: false,
      };
      stubs.getStatementRows.resolves([
        { ...row, date: "2026-09-01", kind: "allocations", amount: "1000.00", donationCount: 3 },
        {
          ...row,
          date: "2026-09-30",
          kind: "adjustment",
          amount: "-300.00",
          adjustmentType: "reallocation",
          roundId: 7,
          pending: true,
        },
      ]);
      const s = await admin().statements.recipient({
        organizationId: 1,
        from: "2026-09-01",
        to: "2026-09-30",
      });
      expect(
        s.entries.map((e) => [e.amount, e.pending, e.affectsBalance, e.balanceAfter]),
      ).to.deep.equal([
        ["1000.00", false, true, "1000.00"],
        ["-300.00", true, false, "1000.00"],
      ]);
      expect(s.closingBalance).to.equal("1000.00");
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
      // excludeRoundId leaves the round's fund grants, transfer lines and adjustments out
      expect(filtered.filter((p) => p === 3)).to.have.length(4);
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
