import { expect } from "chai";
import type { Request, Response } from "express";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";
import { appRouter } from "../../trpc/router";
import { createCallerFactory } from "../../trpc/trpc";

/**
 * Regrant_documents against a real MySQL: links on rounds, transfers and adjustments. Skipped
 * unless REGRANTING_TEST_DB_URL points at a local, migrated, otherwise unused database (see
 * regranting.db.spec.ts for how to start one). The spec deletes all rows in the tables it uses.
 */
const url = process.env.REGRANTING_TEST_DB_URL;
const isLocal = !!url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

const createCaller = createCallerFactory(appRouter);
const alice = createCaller({
  req: {} as Request,
  res: {} as Response,
  auth: {
    permissions: ["admin"],
    email: "alice@example.org",
    sub: "auth0|alice@example.org",
  } as any,
}).regranting;

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code, err.message).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

(isLocal ? describe : describe.skip)("regranting documents against MySQL", function () {
  this.timeout(30000);
  let pool: mysql.Pool;
  let originalPool: mysql.Pool | undefined;
  let sql: (q: string, p?: unknown[]) => Promise<any>;
  let draftRound: number, paidRound: number, transfer: number, adjustment: number;
  const dao = () => DAO.regranting;

  before(async () => {
    pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 5 });
    originalPool = DAO.dbPool;
    DAO.dbPool = pool;
    sql = async (q, p) => (await pool.query(q, p as any))[0];

    for (const table of [
      "Onward_allocations",
      "Onward_reports",
      "External_grantees",
      "Intermediary_payees",
      "Regranting_funds",
      "Regrant_documents",
      "Regrant_round_balances",
      "Regrant_round_recipients",
      "Regrant_round_donations",
      "Regrant_adjustments",
      "Regrant_transfer_lines",
      "Regrant_transfers",
      "Fund_grant_lines",
      "Fund_grants",
      "Regrant_rounds",
      "Regrant_holds",
      "Funds",
      "Organization_payees",
      "Payees",
      "Projects",
    ]) {
      await sql(`DELETE FROM ${table}`);
    }
    await sql(`INSERT IGNORE INTO Cause_areas (ID, name) VALUES (1, 'Global health')`);
    await sql(
      `INSERT IGNORE INTO Organizations (ID, cause_area_ID, full_name, abbriv, long_desc, is_active, ordering)
       VALUES (1, 1, 'GiveWell All Grants Fund', 'AGF', '', 1, 1)`,
    );
    const payee = (await sql(`INSERT INTO Payees (name, currency) VALUES ('GiveWell', 'USD')`))
      .insertId;
    const round = async (status: string) =>
      (
        await sql(
          `INSERT INTO Regrant_rounds (name, kind, cutoff, status, created_by, paid_at)
           VALUES (?, 'regular', '2016-03-31', ?, 'bob@example.org', ?)`,
          [`Q1 2016 ${status}`, status, status === "paid" ? "2016-04-10" : null],
        )
      ).insertId;
    draftRound = await round("draft");
    paidRound = await round("paid");
    transfer = (
      await sql(
        `INSERT INTO Regrant_transfers (Round_ID, Payee_ID, amount_nok, currency, paid_at)
         VALUES (?, ?, 1000, 'USD', '2016-04-10')`,
        [paidRound, payee],
      )
    ).insertId;
    adjustment = (
      await sql(
        `INSERT INTO Regrant_adjustments (Organization_ID, amount, type, reason, effective_at, created_by)
         VALUES (1, 500, 'opening', 'Opening balance', '2016-01-01', 'bob@example.org')`,
      )
    ).insertId;
  });

  after(async () => {
    DAO.dbPool = originalPool;
    await pool.end();
  });

  describe("DAO", () => {
    it("adds, lists and removes documents on a round, a transfer and an adjustment", async () => {
      const onRound = await dao().addDocument(
        { roundId: draftRound, url: drive("r1"), label: "Styrevedtak" },
        "alice@example.org",
      );
      const onTransfer1 = await dao().addDocument(
        { transferId: transfer, url: drive("t1"), label: "Bilag 16-043" },
        "alice@example.org",
      );
      const onTransfer2 = await dao().addDocument(
        { transferId: transfer, url: drive("t2"), label: null },
        "alice@example.org",
      );
      await dao().addDocument(
        { adjustmentId: adjustment, url: drive("a1"), label: null },
        "alice@example.org",
      );

      const roundDocs = await dao().listDocuments({ roundId: draftRound });
      expect(roundDocs.map((d) => d.id)).to.deep.equal([onRound]);
      expect(roundDocs[0]).to.deep.include({
        url: drive("r1"),
        label: "Styrevedtak",
        roundId: draftRound,
        transferId: null,
        adjustmentId: null,
        createdBy: "alice@example.org",
      });
      expect(roundDocs[0].createdAt).to.be.instanceOf(Date);

      // Returned with the transfer and the adjustment, oldest first
      const [t] = await dao().getTransfers(paidRound);
      expect(t.documents.map((d) => d.id)).to.deep.equal([onTransfer1, onTransfer2]);
      const a = await dao().getAdjustment(adjustment);
      expect(a!.documents.map((d) => d.url)).to.deep.equal([drive("a1")]);
      expect(
        (await dao().listAdjustments({})).find((x) => x.id === adjustment)!.documents,
      ).to.have.length(1);
      // A round's own list doesn't include its transfers' documents
      expect(await dao().listDocuments({ roundId: paidRound })).to.deep.equal([]);

      expect(await dao().deleteDocument(onTransfer1)).to.equal(true);
      expect(await dao().deleteDocument(onTransfer1)).to.equal(false);
      expect((await dao().listDocuments({ transferId: transfer })).map((d) => d.id)).to.deep.equal([
        onTransfer2,
      ]);
    });

    it("needs exactly one parent", async () => {
      for (const parent of [
        {},
        { roundId: draftRound, transferId: transfer },
        { roundId: draftRound, transferId: transfer, adjustmentId: adjustment },
      ]) {
        let error: Error | undefined;
        try {
          await dao().addDocument({ ...(parent as any), url: drive("x"), label: null }, "a");
        } catch (err) {
          error = err as Error;
        }
        expect(error?.message, JSON.stringify(parent)).to.match(/exactly one/);
      }
      let listError: Error | undefined;
      try {
        await dao().listDocuments({ roundId: draftRound, adjustmentId: adjustment } as any);
      } catch (err) {
        listError = err as Error;
      }
      expect(listError?.message).to.match(/exactly one/);
    });

    it("deletes a parent's documents with it", async () => {
      const temp = (
        await sql(
          `INSERT INTO Regrant_rounds (name, kind, cutoff, created_by) VALUES ('Temp', 'regular', '2016-06-30', 'a')`,
        )
      ).insertId;
      const id = await dao().addDocument({ roundId: temp, url: drive("tmp"), label: null }, "a");
      await sql(`DELETE FROM Regrant_rounds WHERE ID = ?`, [temp]);
      expect(await dao().getDocument(id)).to.equal(null);
    });
  });

  describe("tRPC", () => {
    it("adds and removes documents on a paid round and its transfers", async () => {
      const doc = await alice.documents.add({
        roundId: paidRound,
        url: `  ${drive("paid")}  `,
        label: "  ",
      });
      expect(doc).to.deep.include({ url: drive("paid"), label: null, roundId: paidRound });
      const onTransfer = await alice.documents.add({
        transferId: transfer,
        url: drive("bank"),
        label: "Bank confirmation",
      });

      const detail = await alice.rounds.get({ id: paidRound });
      expect(detail.documents.map((d) => d.id)).to.deep.equal([doc.id]);
      expect(detail.transfers[0].documents.map((d) => d.id)).to.include(onTransfer.id);
      expect((await alice.documents.list({ roundId: paidRound })).map((d) => d.id)).to.deep.equal([
        doc.id,
      ]);

      expect(await alice.documents.remove({ id: doc.id })).to.deep.equal({ id: doc.id });
      await expectTrpcError(alice.documents.remove({ id: doc.id }), "NOT_FOUND");
    });

    it("shows documents on the recipient statement", async () => {
      const s = await alice.statements.recipient({
        organizationId: 1,
        from: "2016-01-01",
        to: "2016-12-31",
      });
      const opening = s.entries.find((e) => e.adjustmentId === adjustment)!;
      expect(opening.documents.map((d) => d.url)).to.deep.equal([drive("a1")]);
    });

    it("rejects inputs without exactly one existing parent or with a non-link url", async () => {
      await expectTrpcError(alice.documents.add({ url: drive("x") } as any), "BAD_REQUEST");
      await expectTrpcError(
        alice.documents.add({ roundId: paidRound, transferId: transfer, url: drive("x") }),
        "BAD_REQUEST",
        /exactly one/,
      );
      await expectTrpcError(
        alice.documents.add({ roundId: paidRound, url: "Bilag 16-043" }),
        "BAD_REQUEST",
      );
      await expectTrpcError(
        alice.documents.add({ adjustmentId: 999999, url: drive("x") }),
        "BAD_REQUEST",
        /Adjustment #999999 doesn't exist/,
      );
      await expectTrpcError(alice.documents.list({}), "BAD_REQUEST");
    });
  });

  describe("notes", () => {
    it("sets and clears notes on rounds and transfers, also on a paid round", async () => {
      const text = "Calculation error in this round:\nAMF got ~1,065 kr more";
      const summary = await alice.rounds.setNotes({ id: paidRound, notes: `  ${text}  ` });
      expect(summary.notes).to.equal(text);
      expect((await dao().getRound(paidRound))?.notes).to.equal(text);
      expect((await dao().listRounds({})).find((r) => r.id === paidRound)?.notes).to.equal(text);
      expect((await dao().getRound(draftRound))?.notes).to.equal(null);

      const t = await alice.transfers.setNotes({ id: transfer, notes: "Held back 500 kr" });
      expect(t.notes).to.equal("Held back 500 kr");
      expect(t.bankRef).to.equal(null);
      expect((await dao().getTransfers(paidRound))[0].notes).to.equal("Held back 500 kr");

      expect((await alice.rounds.setNotes({ id: paidRound, notes: "" })).notes).to.equal(null);
      expect((await alice.transfers.setNotes({ id: transfer, notes: null })).notes).to.equal(null);
      expect((await dao().getTransfer(transfer))?.notes).to.equal(null);

      await expectTrpcError(alice.rounds.setNotes({ id: 999999, notes: "x" }), "NOT_FOUND");
      await expectTrpcError(alice.transfers.setNotes({ id: 999999, notes: "x" }), "NOT_FOUND");
    });
  });
});
