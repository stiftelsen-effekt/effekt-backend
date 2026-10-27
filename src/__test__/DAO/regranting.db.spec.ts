import { expect } from "chai";
import type { Request, Response } from "express";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";
import { figuresFor } from "../../custom_modules/regranting/service";
import { appRouter } from "../../trpc/router";
import { createCallerFactory } from "../../trpc/trpc";

/**
 * Runs the regranting SQL against a real MySQL with exact fixtures. Skipped unless
 * REGRANTING_TEST_DB_URL points at a local, migrated, otherwise unused database, e.g.:
 *
 *   docker run --rm -d --name rg-mysql -p 3395:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=1 \
 *     -e MYSQL_DATABASE=rg_test mysql:8.4.11 --log_bin_trust_function_creators=1
 *   DB_URL=mysql://root@127.0.0.1:3395/rg_test pnpm exec prisma migrate deploy
 *   REGRANTING_TEST_DB_URL=mysql://root@127.0.0.1:3395/rg_test pnpm test -- --spec src/__test__/DAO/regranting.db.spec.ts
 *
 * The spec deletes all rows in the tables it uses.
 */
const url = process.env.REGRANTING_TEST_DB_URL;
const isLocal = !!url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

const createCaller = createCallerFactory(appRouter);
const as = (email: string) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: { permissions: ["admin"], email, sub: `auth0|${email}` } as any,
  }).regranting;
const alice = as("alice@example.org");
const bob = as("bob@example.org");

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code, err.message).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

// Organizations
const AGF = 1;
const TCF = 2;
const MC = 3;
const GEBF = 4; // own fund
const DRIFT = 5;
const GD = 6;
const NOPAYEE = 7;

(isLocal ? describe : describe.skip)("regranting against MySQL", function () {
  this.timeout(30000);
  let pool: mysql.Pool;
  let originalPool: mysql.Pool | undefined;
  let sql: (q: string, p?: unknown[]) => Promise<any>;

  const balanceOf = async (at: string, organizationId: number, projectId: number | null = null) => {
    const rows = await DAO.regranting.getBalances({ at, organizationIds: [organizationId] });
    return figuresFor(rows.filter((r) => r.projectId === projectId));
  };

  let givewell: number, mcDirect: number, gdPayee: number, ops: number;
  let moms: number, water: number;
  const donation: Record<string, number> = {};

  before(async () => {
    pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 5 });
    originalPool = DAO.dbPool;
    DAO.dbPool = pool;
    sql = async (q, p) => (await pool.query(q, p as any))[0];

    for (const table of [
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
      "Donations",
      "Distribution_cause_area_organizations",
      "Distribution_cause_areas",
      "Distributions",
      "Donors",
      "Payment",
      "Organizations",
      "Cause_areas",
      "Data_owner",
    ]) {
      await sql(`DELETE FROM ${table}`);
    }

    await sql(`INSERT INTO Data_owner (ID, owner, \`default\`) VALUES (3, 'Gi Effektivt', 1)`);
    await sql(`INSERT INTO Cause_areas (ID, name) VALUES (1, 'Global health')`);
    await sql(
      `INSERT INTO Organizations (ID, cause_area_ID, full_name, abbriv, long_desc, is_active, ordering) VALUES
       (1, 1, 'GiveWell All Grants Fund', 'AGF', '', 1, 1), (2, 1, 'GiveWell Top Charities Fund', 'TCF', '', 1, 2),
       (3, 1, 'Malaria Consortium', 'MC', '', 1, 3), (4, 1, 'Gi Effektivt Bistandsfond', 'GEBF', '', 1, 4),
       (5, 1, 'Drift av Gi Effektivt', 'Drift', '', 1, 5), (6, 1, 'GiveDirectly', 'GD', '', 1, 6),
       (7, 1, 'No Payee Org', 'NP', '', 1, 7)`,
    );
    await sql(
      `INSERT INTO Payment (ID, payment_name, abbriv) VALUES (4, 'Bank', 'Bank'), (15, 'Influenced', 'Influenced'),
       (16, 'AMF direkte', 'AMF')`,
    );
    await sql(`INSERT INTO Donors (ID, email) VALUES (1, 'donor@example.org')`);

    const split = async (kid: string, orgs: [number, number][]) => {
      await sql(`INSERT INTO Distributions (KID, Donor_ID, Tax_unit_ID) VALUES (?, 1, NULL)`, [
        kid,
      ]);
      if (orgs.length === 0) return;
      const ca = await sql(
        `INSERT INTO Distribution_cause_areas (Distribution_KID, Cause_area_ID, Percentage_share) VALUES (?, 1, 100)`,
        [kid],
      );
      for (const [org, share] of orgs) {
        await sql(
          `INSERT INTO Distribution_cause_area_organizations (Distribution_cause_area_ID, Organization_ID, Percentage_share)
           VALUES (?, ?, ?)`,
          [ca.insertId, org, share],
        );
      }
    };
    await split("A", [[AGF, 100]]);
    await split("B", [
      [TCF, 50],
      [MC, 50],
    ]);
    await split("C", [[GEBF, 100]]);
    await split("D", [[DRIFT, 100]]);
    await split("E", []); // no split: Unassigned
    await split("F", [[GD, 100]]);
    await split("G", [[MC, 100]]);
    await split("H", [[NOPAYEE, 100]]);

    const give = async (key: string, kid: string, sum: number, at: string, payment = 4) => {
      const r = await sql(
        `INSERT INTO Donations (Donor_ID, Payment_ID, sum_confirmed, timestamp_confirmed, KID_fordeling) VALUES (1, ?, ?, ?, ?)`,
        [payment, sum, at, kid],
      );
      donation[key] = r.insertId;
    };
    await give("d1", "A", 1000, "2026-01-10 12:00:00");
    await give("d2", "B", 2000, "2026-02-15 12:00:00");
    await give("d3", "C", 5000, "2026-03-01 12:00:00");
    await give("influenced", "A", 300, "2026-03-02 12:00:00", 15);
    await give("amfDirekte", "A", 400, "2026-03-02 12:00:00", 16);
    await give("drift", "D", 100, "2026-03-05 12:00:00");
    await give("unassigned", "E", 250, "2026-03-06 12:00:00");
    await give("gd", "F", 3000, "2026-03-10 12:00:00");
    await give("lastSecond", "A", 7, "2026-03-31 23:59:59");
    await give("nextDay", "A", 11, "2026-04-01 00:00:00");
    await give("major", "G", 10000, "2026-04-15 12:00:00");
    await give("noPayee", "H", 40, "2026-03-15 12:00:00");

    givewell = (
      await alice.payees.create({ name: "GiveWell", currency: "NOK", bankAccount: "1234.56.78901" })
    ).id;
    mcDirect = (
      await alice.payees.create({ name: "Malaria Consortium", currency: "EUR", iban: "GB00TEST" })
    ).id;
    gdPayee = (
      await alice.payees.create({ name: "GiveDirectly", currency: "NOK", bankAccount: "1" })
    ).id;
    ops = (await alice.payees.create({ name: "Driftskonto", currency: "NOK", bankAccount: "2" }))
      .id;
    for (const org of [AGF, TCF]) {
      await alice.routings.create({
        organizationId: org,
        payeeId: givewell,
        validFrom: "2020-01-01",
      });
    }
    await alice.routings.create({
      organizationId: MC,
      payeeId: givewell,
      validFrom: "2020-01-01",
      validTo: "2026-07-31",
    });
    await alice.routings.create({ organizationId: MC, payeeId: mcDirect, validFrom: "2026-08-01" });
    await alice.routings.create({ organizationId: GD, payeeId: gdPayee, validFrom: "2020-01-01" });
    await alice.routings.create({ organizationId: DRIFT, payeeId: ops, validFrom: "2020-01-01" });
    await alice.funds.create({ organizationId: GEBF, maxHoldDays: 30 });
    moms = (
      await alice.projects.create({ organizationId: GD, name: "Moms and babies", status: "active" })
    ).id;
    water = (await alice.projects.create({ organizationId: GD, name: "Water", status: "active" }))
      .id;
  });

  after(async () => {
    DAO.dbPool = originalPool;
    await pool.end();
  });

  describe("balances", () => {
    it("sums allocations dated on or before the day, excluding payments 15 and 16", async () => {
      expect((await balanceOf("2026-03-31", AGF)).balance).to.equal("1007.00");
      expect((await balanceOf("2026-04-01", AGF)).balance).to.equal("1018.00");
      expect((await balanceOf("2026-03-31", TCF)).allocations).to.equal("1000.00");
      expect((await balanceOf("2026-03-31", MC)).allocations).to.equal("1000.00");
      expect((await balanceOf("2026-03-31", DRIFT)).balance).to.equal("100.00");
      expect((await balanceOf("2026-01-09", AGF)).balance).to.equal("0.00");
    });

    it("reports donations without a split as Unassigned", async () => {
      expect(await DAO.regranting.getUnassigned("2026-03-31")).to.deep.equal({
        amount: "250.00",
        donationCount: 1,
      });
      expect((await DAO.regranting.getUnassigned("2026-03-05")).donationCount).to.equal(0);
    });

    it("counts adjustments by effective_at, except fronted ones", async () => {
      await alice.adjustments.create({
        organizationId: AGF,
        amount: 200,
        type: "opening",
        reason: "Carry-over from the sheet",
        effectiveAt: "2025-12-31",
      });
      await alice.adjustments.create({
        organizationId: TCF,
        amount: -50,
        type: "fee",
        reason: "Recipient fee charged by decision",
        effectiveAt: "2026-03-20",
      });
      await alice.adjustments.create({
        organizationId: TCF,
        amount: 1000,
        type: "own_funds",
        reason: "Board decision",
        effectiveAt: "2026-04-10",
      });
      await alice.adjustments.create({
        organizationId: GD,
        projectId: water,
        amount: 75,
        type: "reallocation",
        reason: "Earmarked by agreement",
        effectiveAt: "2026-03-01",
      });

      const agf = await balanceOf("2026-03-31", AGF);
      expect(agf.opening).to.equal("200.00");
      expect(agf.balance).to.equal("1207.00");
      expect((await balanceOf("2026-03-19", TCF)).balance).to.equal("1000.00");
      expect((await balanceOf("2026-03-20", TCF)).balance).to.equal("950.00");
      expect((await balanceOf("2026-04-10", TCF)).balance).to.equal("1950.00");
      // project vs unrestricted
      expect((await balanceOf("2026-03-31", GD, water)).balance).to.equal("75.00");
      expect((await balanceOf("2026-03-31", GD, null)).balance).to.equal("3000.00");
    });

    it("lists recipients on the Balances page with projects, funds and inflow", async () => {
      const view = await alice.balances.list({ at: "2026-03-31" });
      const gd = view.recipients.find((r) => r.organizationId === GD)!;
      expect(gd.total.balance).to.equal("3075.00");
      expect(gd.unrestricted.balance).to.equal("3000.00");
      expect(gd.projects.map((p) => [p.name, p.figures.balance])).to.deep.equal([
        ["Water", "75.00"],
      ]);
      expect(gd.payee?.name).to.equal("GiveDirectly");
      const fund = view.recipients.find((r) => r.organizationId === GEBF)!;
      expect(fund.isFund).to.be.true;
      // 5000 arrived 2026-03-01: 30 days old on 03-31 (not longer), too old by 04-15
      expect(fund.heldTooLong).to.equal("0.00");
      const later = await alice.balances.list({ at: "2026-04-15", organizationIds: [GEBF] });
      expect(later.recipients[0].heldTooLong).to.equal("5000.00");
      expect(view.unassigned.amount).to.equal("250.00");
      expect(view.lastRound).to.equal(null);
      expect(gd.inflowSinceLastRound).to.equal("3000.00");
    });
  });

  describe("a regular round with a fund grant", () => {
    let r1: number;

    it("creates a draft, grants from the own fund and proposes by payee", async () => {
      const created = await alice.rounds.create({
        name: "Q1 2026",
        kind: "regular",
        cutoff: "2026-03-31",
        propose: false,
      });
      r1 = created.round.id;
      expect(created.round.status).to.equal("draft");
      expect(created.round.createdBy).to.equal("alice@example.org");

      await alice.fundGrants.create({
        roundId: r1,
        fundId: GEBF,
        rationale: "Strong case for cash transfers to mothers",
        lines: [
          { organizationId: GD, projectId: moms, amount: 2000 },
          { organizationId: AGF, projectId: null, amount: 1000 },
        ],
      });
      await alice.holds.create({ organizationId: DRIFT, reason: "Paid with salaries" });

      const builder = await alice.rounds.propose({ id: r1 });
      const gw = builder.transfers.find((t) => t.payee.id === givewell)!;
      expect(gw.lines.map((l) => [l.organizationId, l.projectId, l.amountNok])).to.deep.equal([
        [AGF, null, "2207.00"],
        [TCF, null, "950.00"],
        [MC, null, "1000.00"],
      ]);
      expect(gw.amountNok).to.equal("4157.00");
      const gdTransfer = builder.transfers.find((t) => t.payee.id === gdPayee)!;
      expect(gdTransfer.lines.map((l) => [l.projectId, l.amountNok])).to.deep.equal([
        [null, "3000.00"],
        [moms, "2000.00"],
        [water, "75.00"],
      ]);
      // Drift is held, own funds are never paid, NOPAYEE has no payee
      expect(builder.transfers.some((t) => t.payee.id === ops)).to.be.false;
      expect(builder.transfers.flatMap((t) => t.lines).some((l) => l.organizationId === GEBF)).to.be
        .false;
      const drift = builder.recipients.find((r) => r.organizationId === DRIFT)!;
      expect(drift.totals.available).to.equal("100.00");
      expect(drift.totals.proposed).to.equal("0.00");
      expect(drift.hold?.reason).to.equal("Paid with salaries");

      const fund = builder.funds.find((f) => f.organizationId === GEBF)!;
      expect([fund.availableToGrant, fund.granted, fund.remaining]).to.deep.equal([
        "5000.00",
        "3000.00",
        "2000.00",
      ]);

      expect(
        builder.issues.map((i) => [i.severity, i.code, i.organizationId]),
      ).to.have.deep.members([
        ["warning", "recipient_without_payee", NOPAYEE],
        ["warning", "unassigned_balance", null],
      ]);
      const groups = builder.payeeGroups.map((g) => g.payee?.name ?? null);
      expect(groups).to.include.members(["GiveWell", "GiveDirectly", "Driftskonto", null]);
    });

    it("rejects own funds on transfer lines and projects of another recipient", async () => {
      const builder = await alice.rounds.builder({ id: r1 });
      const gw = builder.transfers.find((t) => t.payee.id === givewell)!;
      await expectTrpcError(
        alice.transfers.setLine({
          id: gw.id,
          organizationId: GEBF,
          projectId: null,
          amountNok: 10,
        }),
        "BAD_REQUEST",
        /own fund/,
      );
      await expectTrpcError(
        alice.transfers.setLine({ id: gw.id, organizationId: AGF, projectId: moms, amountNok: 10 }),
        "BAD_REQUEST",
        /doesn't belong/,
      );
    });

    it("flags a transfer whose amount differs from its lines", async () => {
      const builder = await alice.rounds.builder({ id: r1 });
      const gw = builder.transfers.find((t) => t.payee.id === givewell)!;
      await alice.transfers.update({ id: gw.id, amountNok: 4000 });
      const issues = await alice.rounds.validate({ id: r1 });
      expect(issues.find((i) => i.code === "transfer_lines_mismatch")?.transferId).to.equal(gw.id);
      const result = await bob.rounds.approve({ id: r1 });
      expect(result.approved).to.be.false;
      expect(result.round.status).to.equal("draft");
      await alice.transfers.update({ id: gw.id, amountNok: 4157 });
    });

    it("needs a second person to approve, then snapshots and commits", async () => {
      await expectTrpcError(alice.rounds.approve({ id: r1 }), "FORBIDDEN");
      const result = await bob.rounds.approve({ id: r1 });
      expect(result.approved).to.be.true;
      expect(result.round.status).to.equal("approved");
      expect(result.round.approvedBy).to.equal("bob@example.org");

      const detail = await alice.rounds.get({ id: r1 });
      expect(detail.fundGrants[0].approvedBy).to.equal("bob@example.org");
      const agf = detail.snapshot.find((s) => s.organizationId === AGF && s.projectId === null)!;
      expect(agf).to.include({
        balanceAtCutoff: "1207.00",
        fundGrants: "1000.00",
        inRound: "2207.00",
        includedDirect: true,
      });
      const fundSnap = detail.snapshot.find((s) => s.organizationId === GEBF)!;
      expect(fundSnap).to.include({ fundGrants: "-3000.00", includedDirect: false });

      // Approved: fund grants count from the cutoff, transfer lines are committed, not paid
      const agfAfter = await balanceOf("2026-04-30", AGF);
      expect(agfAfter.fundGrantsIn).to.equal("1000.00");
      expect(agfAfter.balance).to.equal("2218.00");
      expect(agfAfter.committed).to.equal("2207.00");
      expect(agfAfter.available).to.equal("11.00");
      expect((await balanceOf("2026-03-31", GEBF)).balance).to.equal("2000.00");
      expect((await balanceOf("2026-03-31", GD, moms)).balance).to.equal("2000.00");
    });

    it("locks an approved round", async () => {
      const builder = await alice.rounds.builder({ id: r1 });
      await expectTrpcError(
        alice.transfers.setLine({
          id: builder.transfers[0].id,
          organizationId: AGF,
          projectId: null,
          amountNok: 1,
        }),
        "CONFLICT",
        /approved/,
      );
      await expectTrpcError(alice.rounds.markPaid({ id: r1 }), "PRECONDITION_FAILED");
    });

    it("takes effect when paid, on each transfer's paid date", async () => {
      const { transfers } = await alice.rounds.get({ id: r1 });
      for (const t of transfers) {
        await alice.transfers.recordPayment({
          id: t.id,
          paidAt: "2026-04-20",
          bankRef: `ref-${t.id}`,
          bankFee: 25,
        });
      }
      await alice.rounds.markPaid({ id: r1 });

      const before = await balanceOf("2026-04-19", AGF);
      expect(before.transfers).to.equal("0.00");
      expect(before.committed).to.equal("2207.00"); // paid after the date
      const after = await balanceOf("2026-04-20", AGF);
      expect(after.transfers).to.equal("-2207.00");
      expect(after.balance).to.equal("11.00");
      expect(after.committed).to.equal("0.00");
      // bank fees are operations' cost
      expect((await balanceOf("2026-04-20", TCF)).balance).to.equal("1000.00");
      expect((await balanceOf("2026-04-20", GD, moms)).balance).to.equal("0.00");

      const view = await alice.balances.list({ at: "2026-04-30", organizationIds: [AGF] });
      expect(view.lastRound?.id).to.equal(r1);
      expect(view.recipients[0].lastTransfer).to.include({
        roundId: r1,
        amountNok: "2207.00",
        paidAt: "2026-04-20",
      });
      expect(view.recipients[0].inflowSinceLastRound).to.equal("11.00");
    });

    it("never edits a paid round", async () => {
      const { transfers } = await alice.rounds.get({ id: r1 });
      await expectTrpcError(
        alice.transfers.recordPayment({ id: transfers[0].id, paidAt: "2026-04-21" }),
        "CONFLICT",
        /paid rounds are never edited/,
      );
      await expectTrpcError(alice.rounds.reopen({ id: r1 }), "CONFLICT");
      await expectTrpcError(alice.rounds.delete({ id: r1 }), "CONFLICT");
      await expectTrpcError(
        alice.adjustments.create({
          organizationId: AGF,
          amount: -1,
          type: "correction",
          reason: "x",
          effectiveAt: "2026-04-21",
          roundId: r1,
        }),
        "CONFLICT",
      );
    });
  });

  describe("major donor rounds and fronted amounts", () => {
    let r2: number;

    it("passes on only the chosen donations, capped at the balance", async () => {
      const created = await bob.rounds.create({
        name: "Major donor April",
        kind: "major_donor",
        cutoff: "2026-04-30",
        donationIds: [donation.major],
      });
      r2 = created.round.id;
      const lines = created.transfers.flatMap((t) =>
        t.lines.map((l) => [t.payee.id, l.organizationId, l.amountNok]),
      );
      expect(lines).to.deep.equal([[givewell, MC, "10000.00"]]);
      expect(created.donations[0]).to.include({ donationId: donation.major, inScope: true });
      const mc = created.recipients.find((r) => r.organizationId === MC)!;
      expect(mc.chosenAllocations).to.equal("10000.00");
      expect(mc.includeDirect).to.be.false;

      await alice.rounds.approve({ id: r2 });
      const t = (await alice.rounds.get({ id: r2 })).transfers[0];
      await alice.transfers.recordPayment({ id: t.id, paidAt: "2026-05-02" });
      await alice.rounds.markPaid({ id: r2 });
    });

    it("fronts a payment before the donation is confirmed", async () => {
      const rf = await alice.rounds.create({
        name: "Fronted for expected gift",
        kind: "extraordinary",
        cutoff: "2026-05-10",
      });
      expect(rf.transfers).to.have.length(0); // extraordinary: nothing by default
      await alice.transfers.create({
        roundId: rf.round.id,
        payeeId: givewell,
        lines: [{ organizationId: MC, projectId: null, amountNok: 4000 }],
      });
      await alice.adjustments.create({
        organizationId: MC,
        amount: 4000,
        type: "fronted",
        reason: "Expected gift from a major donor in June",
        effectiveAt: "2026-05-10",
        roundId: rf.round.id,
      });
      const builder = await alice.rounds.builder({ id: rf.round.id });
      expect(builder.issues.find((i) => i.code === "negative_balance")?.organizationId).to.equal(
        MC,
      );
      expect(
        builder.recipients.find((r) => r.organizationId === MC)!.frontedOutstanding,
      ).to.have.length(1);
      await bob.rounds.approve({ id: rf.round.id });
      const t = (await alice.rounds.get({ id: rf.round.id })).transfers[0];
      await alice.transfers.recordPayment({ id: t.id, paidAt: "2026-05-12" });
      await alice.rounds.markPaid({ id: rf.round.id });

      expect((await balanceOf("2026-05-31", MC)).balance).to.equal("-4000.00");

      // The gift arrives and is linked to the fronted entry
      const r = await sql(
        `INSERT INTO Donations (Donor_ID, Payment_ID, sum_confirmed, timestamp_confirmed, KID_fordeling)
         VALUES (1, 4, 4000, '2026-06-01 09:00:00', 'G')`,
      );
      donation.fronted = r.insertId;
      const [fronted] = await alice.adjustments.list({ organizationId: MC, types: ["fronted"] });
      const linked = await alice.adjustments.linkDonation({
        id: fronted.id,
        donationId: donation.fronted,
      });
      expect(linked.linkedDonationId).to.equal(donation.fronted);
      expect(linked.affectsBalance).to.be.false;
      expect((await balanceOf("2026-06-01", MC)).balance).to.equal("0.00");
    });

    it("the next regular round doesn't pay the major donor's or the fronted gift again", async () => {
      const r3 = await alice.rounds.create({
        name: "Q2 2026",
        kind: "regular",
        cutoff: "2026-06-30",
      });
      const mc = r3.recipients.find((r) => r.organizationId === MC);
      expect(mc?.totals.available ?? "0.00").to.equal("0.00");
      expect(r3.transfers.flatMap((t) => t.lines).some((l) => l.organizationId === MC)).to.be.false;
      // what is left: AGF's 11 from 1 April, TCF's own_funds 1000
      const gw = r3.transfers.find((t) => t.payee.id === givewell)!;
      expect(gw.lines.map((l) => [l.organizationId, l.amountNok])).to.deep.equal([
        [AGF, "11.00"],
        [TCF, "1000.00"],
      ]);
      await alice.rounds.delete({ id: r3.round.id });
    });

    it("a round with an earlier cutoff doesn't pay what a later round already paid", async () => {
      // Built after the major donor round was paid (2 May), with a cutoff before that
      const late = await alice.rounds.create({
        name: "April (late)",
        kind: "regular",
        cutoff: "2026-04-30",
      });
      const mc = late.recipients.find((r) => r.organizationId === MC)!;
      expect(mc.totals.balanceAtCutoff).to.equal("10000.00");
      expect(mc.totals.committed).to.equal("14000.00");
      expect(mc.totals.proposed).to.equal("0.00");
      await alice.rounds.delete({ id: late.round.id });
    });

    it("a donation is passed on once", async () => {
      const again = await alice.rounds.create({
        name: "Major donor again",
        kind: "major_donor",
        cutoff: "2026-06-30",
        donationIds: [donation.major, donation.fronted],
      });
      expect(again.transfers).to.have.length(0);
      expect(again.donations.map((d) => [d.donationId, d.excludedReason])).to.deep.equal([
        [donation.major, "passed_on"],
        [donation.fronted, "passed_on"],
      ]);
      expect(again.issues.filter((i) => i.code === "donation_already_passed_on")).to.have.length(2);
      expect((await bob.rounds.approve({ id: again.round.id })).approved).to.be.false;
      await alice.rounds.delete({ id: again.round.id });
    });
  });

  describe("routing, include-direct and validation", () => {
    it("groups by the payee valid at the cutoff", async () => {
      await sql(
        `INSERT INTO Donations (Donor_ID, Payment_ID, sum_confirmed, timestamp_confirmed, KID_fordeling)
         VALUES (1, 4, 600, '2026-08-10 09:00:00', 'G')`,
      );
      const r = await alice.rounds.create({
        name: "August",
        kind: "regular",
        cutoff: "2026-08-31",
      });
      const mcTransfer = r.transfers.find((t) => t.payee.id === mcDirect)!;
      expect(mcTransfer.currency).to.equal("EUR");
      expect(mcTransfer.lines.map((l) => [l.organizationId, l.amountNok])).to.deep.equal([
        [MC, "600.00"],
      ]);
      await alice.rounds.delete({ id: r.round.id });
    });

    it("fund_grant rounds pay only granted amounts unless a recipient is switched on", async () => {
      const r = await alice.rounds.create({
        name: "Fund grant",
        kind: "fund_grant",
        cutoff: "2026-06-30",
      });
      expect(r.transfers).to.have.length(0);
      await alice.fundGrants.create({
        roundId: r.round.id,
        fundId: GEBF,
        rationale: "Top up",
        lines: [{ organizationId: GD, projectId: null, amount: 500 }],
      });
      let b = await alice.rounds.propose({ id: r.round.id });
      expect(
        b.transfers.flatMap((t) => t.lines.map((l) => [l.organizationId, l.amountNok])),
      ).to.deep.equal([[GD, "500.00"]]);
      await alice.rounds.setIncludeDirect({
        roundId: r.round.id,
        organizationId: TCF,
        includeDirect: true,
      });
      b = await alice.rounds.builder({ id: r.round.id });
      expect(b.recipients.find((x) => x.organizationId === TCF)!.includeDirectOverride).to.be.true;
      expect(
        b.transfers.flatMap((t) => t.lines.map((l) => [l.organizationId, l.amountNok])),
      ).to.have.deep.members([
        [GD, "500.00"],
        [TCF, "1000.00"],
      ]);

      // A grant over the fund's balance (2000 left) blocks approval
      await alice.fundGrants.create({
        roundId: r.round.id,
        fundId: GEBF,
        rationale: "Too much",
        lines: [{ organizationId: AGF, projectId: null, amount: 1600 }],
      });
      const issues = await alice.rounds.validate({ id: r.round.id });
      expect(issues.find((i) => i.code === "fund_grant_exceeds_balance")?.organizationId).to.equal(
        GEBF,
      );
      expect((await bob.rounds.approve({ id: r.round.id })).approved).to.be.false;
      await expectTrpcError(
        alice.fundGrants.create({
          roundId: r.round.id,
          fundId: GEBF,
          rationale: "Fund to fund",
          lines: [{ organizationId: GEBF, projectId: null, amount: 1 }],
        }),
        "BAD_REQUEST",
        /own fund/,
      );
      await alice.rounds.delete({ id: r.round.id });
    });

    it("applies minTransfer per recipient", async () => {
      const r = await alice.rounds.create({
        name: "Small leftovers",
        kind: "regular",
        cutoff: "2026-06-30",
        minTransfer: 500,
      });
      const lines = r.transfers.flatMap((t) => t.lines.map((l) => [l.organizationId, l.amountNok]));
      expect(lines).to.deep.equal([[TCF, "1000.00"]]); // AGF's 11 stays
      expect(r.recipients.find((x) => x.organizationId === AGF)!.totals.carriesOver).to.equal(
        "11.00",
      );
      await alice.rounds.delete({ id: r.round.id });
    });

    it("rejects overlapping routings", async () => {
      await expectTrpcError(
        alice.routings.create({ organizationId: MC, payeeId: gdPayee, validFrom: "2026-07-01" }),
        "CONFLICT",
      );
    });
  });

  describe("statements and projects", () => {
    it("lists every entry with a running balance", async () => {
      const s = await alice.statements.recipient({
        organizationId: MC,
        from: "2026-01-01",
        to: "2026-06-30",
      });
      expect(s.openingBalance).to.equal("0.00");
      expect(
        s.entries.map((e) => [e.date, e.kind, e.amount, e.affectsBalance, e.balanceAfter]),
      ).to.deep.equal([
        ["2026-02-15", "allocations", "1000.00", true, "1000.00"],
        ["2026-04-15", "allocations", "10000.00", true, "11000.00"],
        ["2026-04-20", "transfer", "-1000.00", true, "10000.00"],
        ["2026-05-02", "transfer", "-10000.00", true, "0.00"],
        ["2026-05-10", "adjustment", "4000.00", false, "0.00"],
        ["2026-05-12", "transfer", "-4000.00", true, "-4000.00"],
        ["2026-06-01", "allocations", "4000.00", true, "0.00"],
      ]);
      expect(s.closingBalance).to.equal("0.00");

      const fund = await alice.statements.recipient({
        organizationId: GEBF,
        from: "2026-03-01",
        to: "2026-03-31",
      });
      expect(fund.entries.map((e) => [e.kind, e.amount, e.counterpartName])).to.deep.equal([
        ["allocations", "5000.00", null],
        ["fund_grant_out", "-2000.00", "GiveDirectly"],
        ["fund_grant_out", "-1000.00", "GiveWell All Grants Fund"],
      ]);
    });

    it("shows a project's lines", async () => {
      const page = await alice.projects.get({ id: moms });
      expect(page.project.organizationName).to.equal("GiveDirectly");
      expect(page.fundGrantLines.map((l) => l.amount)).to.deep.equal(["2000.00"]);
      expect(page.transferLines.map((l) => [l.amountNok, l.roundStatus])).to.deep.equal([
        ["2000.00", "paid"],
      ]);
      expect(page.figures.balance).to.equal("0.00");
      await expectTrpcError(alice.projects.delete({ id: moms }), "CONFLICT");
    });
  });
});
