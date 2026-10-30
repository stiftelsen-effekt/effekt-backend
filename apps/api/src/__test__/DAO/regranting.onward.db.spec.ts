import { expect } from "chai";
import type { Request, Response } from "express";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";
import { appRouter } from "../../trpc/router";
import { createCallerFactory } from "../../trpc/trpc";

/**
 * Downstream regrants against a real MySQL: onward allocations, reports, the awaiting list and
 * the bulk `assumed` backfill. Skipped unless REGRANTING_TEST_DB_URL points at a local, migrated,
 * otherwise unused database (see regranting.db.spec.ts for how to start one). The spec deletes
 * all rows in the tables it uses.
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

(isLocal ? describe : describe.skip)("regranting onward against MySQL", function () {
  this.timeout(30000);
  let pool: mysql.Pool;
  let originalPool: mysql.Pool | undefined;
  let sql: (q: string, p?: unknown[]) => Promise<any>;
  let givewell: number, direct: number, vitaminA: number;
  /** Lines: 2024 transfer (AMF, TCF), 2025 transfer (AMF, HKI · Vitamin A, TCF), direct (MC), unpaid (AMF) */
  const L: Record<string, number> = {};

  const ORG = { TCF: 2, HKI: 3, MC: 5, AMF: 6 };

  before(async () => {
    pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 5 });
    originalPool = DAO.dbPool;
    DAO.dbPool = pool;
    // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- test helper; the spec passes literal SQL with bound parameters
    sql = async (q, p) => (await pool.query(q, p as any))[0];

    for (const table of [
      "Onward_allocations",
      "Regrant_documents",
      "Onward_reports",
      "External_grantees",
      "Intermediary_payees",
      "Regranting_funds",
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
       VALUES (2, 1, 'GiveWell Top Charities Fund', 'TCF', '', 1, 2),
              (3, 1, 'Helen Keller International', 'HKI', '', 1, 3),
              (5, 1, 'Malaria Consortium', 'MC', '', 1, 5),
              (6, 1, 'Against Malaria Foundation', 'AMF', '', 1, 6)`,
    );
    givewell = (await sql(`INSERT INTO Payees (name, currency) VALUES ('GiveWell', 'USD')`))
      .insertId;
    direct = (await sql(`INSERT INTO Payees (name, currency) VALUES ('Malaria Consortium', 'GBP')`))
      .insertId;
    await sql(`INSERT INTO Intermediary_payees (Payee_ID, currency) VALUES (?, 'USD')`, [givewell]);
    await sql(`INSERT INTO Regranting_funds (Organization_ID) VALUES (?)`, [ORG.TCF]);
    vitaminA = (
      await sql(
        `INSERT INTO Projects (Organization_ID, name) VALUES (?, 'Vitamin A Supplementation')`,
        [ORG.HKI],
      )
    ).insertId;

    const round = async (name: string, paidAt: string | null) =>
      (
        await sql(
          `INSERT INTO Regrant_rounds (name, kind, cutoff, status, created_by, approved_by, paid_at)
           VALUES (?, 'regular', ?, ?, 'bob@example.org', 'carol@example.org', ?)`,
          [name, paidAt ?? "2025-12-31", paidAt ? "paid" : "approved", paidAt],
        )
      ).insertId;
    const transfer = async (
      roundId: number,
      payeeId: number,
      currency: string,
      paidAt: string | null,
      fxRate: string | null,
      lines: [string, number, number | null, number][],
    ) => {
      const total = lines.reduce((s, l) => s + l[3], 0);
      const id = (
        await sql(
          `INSERT INTO Regrant_transfers (Round_ID, Payee_ID, amount_nok, currency, amount_foreign, fx_rate, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            roundId,
            payeeId,
            total,
            currency,
            fxRate ? total / Number(fxRate) : null,
            fxRate,
            paidAt,
          ],
        )
      ).insertId;
      for (const [key, org, project, amount] of lines) {
        L[key] = (
          await sql(
            `INSERT INTO Regrant_transfer_lines (Transfer_ID, Organization_ID, Project_ID, amount_nok) VALUES (?, ?, ?, ?)`,
            [id, org, project, amount],
          )
        ).insertId;
      }
      return id;
    };
    const r2024 = await round("Q1 2024", "2024-05-20");
    const r2025 = await round("Q1 2025", "2025-05-20");
    const open = await round("Q3 2025", null);
    await transfer(r2024, givewell, "USD", "2024-05-20", "10", [
      ["amf24", ORG.AMF, null, 100000],
      ["tcf24", ORG.TCF, null, 300000],
    ]);
    await transfer(r2025, givewell, "USD", "2025-05-20", "10.5", [
      ["amf25", ORG.AMF, null, 420000],
      ["hki25", ORG.HKI, vitaminA, 210000],
      ["tcf25", ORG.TCF, null, 1200000],
    ]);
    await transfer(r2025, direct, "NOK", "2025-05-20", null, [["mc25", ORG.MC, null, 50000]]);
    await transfer(open, givewell, "USD", null, null, [["amfOpen", ORG.AMF, null, 7000]]);
  });

  after(async () => {
    for (const table of [
      "Onward_allocations",
      "Regrant_documents",
      "Onward_reports",
      "External_grantees",
    ])
      await sql(`DELETE FROM ${table}`);
    DAO.dbPool = originalPool;
    await pool.end();
  });

  let report: number;

  it("shows every paid line to GiveWell as awaiting, and nothing for other payees", async () => {
    const groups = await alice.onward.awaiting();
    expect(groups).to.have.length(1);
    expect(groups[0]).to.deep.include({
      payeeName: "GiveWell",
      awaitingNok: "2230000.00",
      assumedNok: "0.00",
    });
    expect(groups[0]!.lines.map((l) => l.id)).to.deep.equal([
      L.amf24,
      L.tcf24,
      L.amf25,
      L.tcf25,
      L.hki25,
    ]);

    const mc = await alice.onward.transfer({
      transferId: (await DAO.regrantingOnward.getLine(L.mc25))!.transferId,
    });
    expect(mc).to.deep.include({ intermediary: false, lines: [] });
  });

  it("records a reported forward with a report, and returns warnings", async () => {
    report = (
      await alice.onward.reports.create({
        payeeId: givewell,
        reportedAt: "2025-07-20",
        reference: "GiveWell forwarding statement July 2025",
      })
    ).id;
    await alice.documents.add({
      onwardReportId: report,
      url: "https://drive.google.com/x",
      label: "Statement",
    });

    const prefill = await alice.onward.prefill({ transferLineId: L.hki25 });
    expect(prefill).to.deep.include({
      organizationId: ORG.HKI,
      projectId: vitaminA,
      amountForeign: "20000.00",
    });

    const first = await alice.onward.allocations.create({
      transferLineId: L.hki25,
      organizationId: ORG.HKI,
      projectId: vitaminA,
      currency: "USD",
      amountForeign: "15000",
      forwardedAt: "2025-07-15",
      reportId: report,
    });
    expect(first.warnings).to.deep.equal([]);
    expect(first.allocation).to.deep.include({
      amountNok: "157500.00",
      basis: "reported",
      createdBy: "alice@example.org",
    });
    expect(first.line).to.deep.include({ status: "partly_forwarded", awaitingNok: "52500.00" });

    const redirected = await alice.onward.allocations.create({
      transferLineId: L.hki25,
      organizationId: ORG.AMF,
      currency: "USD",
      amountForeign: "5000",
      forwardedAt: "2025-05-01",
      reportId: report,
      note: "Redirected by GiveWell",
    });
    expect(redirected.warnings).to.have.length(2);
    expect(redirected.line).to.deep.include({ status: "forwarded", awaitingNok: "0.00" });

    const fetched = await alice.onward.reports.get({ id: report });
    expect(fetched.report).to.deep.include({ allocationCount: 2, allocationTotalNok: "210000.00" });
    expect(fetched.report.documents.map((d) => d.label)).to.deep.equal(["Statement"]);
    expect(fetched.allocations[0]!.line.organizationId).to.equal(ORG.HKI);
  });

  it("rejects what the rules call errors", async () => {
    await expectTrpcError(
      alice.onward.allocations.create({
        transferLineId: L.mc25,
        organizationId: ORG.MC,
        currency: "NOK",
        amountNok: 100,
        forwardedAt: "2025-06-01",
        reportId: report,
      }),
      "BAD_REQUEST",
      /isn't an intermediary payee/,
    );
    await expectTrpcError(
      alice.onward.allocations.create({
        transferLineId: L.amfOpen,
        organizationId: ORG.AMF,
        currency: "USD",
        amountNok: 100,
        forwardedAt: "2025-06-01",
        reportId: report,
      }),
      "BAD_REQUEST",
      /isn't paid yet/,
    );
    await expectTrpcError(
      alice.onward.allocations.create({
        transferLineId: L.hki25,
        organizationId: ORG.HKI,
        currency: "USD",
        amountNok: 1,
        forwardedAt: "2025-09-01",
        reportId: report,
      }),
      "BAD_REQUEST",
      /more than the line's/,
    );
    await expectTrpcError(
      alice.onward.allocations.create({
        transferLineId: L.tcf25,
        basis: "assumed",
        organizationId: ORG.TCF,
        currency: "USD",
        amountNok: 1,
        forwardedAt: "2025-09-01",
      }),
      "BAD_REQUEST",
      /regrants by its own decision/,
    );
    await expectTrpcError(alice.onward.reports.delete({ id: report }), "CONFLICT");
  });

  it("splits a TCF line over our recipients and an external grantee", async () => {
    const grantee = await alice.onward.grantees.create({ name: "IDinsight RCT", country: "Kenya" });
    await alice.onward.allocations.create({
      transferLineId: L.tcf25,
      organizationId: ORG.MC,
      currency: "USD",
      amountForeign: "50000",
      forwardedAt: "2025-06-30",
      reportId: report,
    });
    const last = await alice.onward.allocations.create({
      transferLineId: L.tcf25,
      externalGranteeId: grantee.id,
      currency: "USD",
      amountForeign: "10000",
      forwardedAt: "2025-06-30",
      reportId: report,
    });
    expect(last.line).to.deep.include({
      status: "partly_forwarded",
      reportedNok: "630000.00",
      awaitingNok: "570000.00",
    });
    expect(last.allocation.externalGranteeName).to.equal("IDinsight RCT");
    await expectTrpcError(alice.onward.grantees.delete({ id: grantee.id }), "CONFLICT");
  });

  it("backfills assumed allocations for pass-through lines only, idempotently", async () => {
    const dry = await alice.onward.assume({ to: "2024-12-31", dryRun: true });
    expect(dry).to.deep.include({ dryRun: true, created: 0, totalNok: "100000.00" });
    expect(dry.lines.map((l) => l.transferLineId)).to.deep.equal([L.amf24]);
    expect(await DAO.regrantingOnward.listAllocations({ lineIds: [L.amf24] })).to.deep.equal([]);

    const first = await alice.onward.assume({});
    // amf24 and amf25; hki25 already has allocations, TCF lines are never assumed, mc25 is direct
    expect(first.created).to.equal(2);
    expect(first.lines.map((l) => l.transferLineId)).to.deep.equal([L.amf24, L.amf25]);
    expect(first.lines[1]).to.deep.include({
      currency: "USD",
      amountForeign: "40000.00",
      paidAt: "2025-05-20",
    });

    const again = await alice.onward.assume({});
    expect(again).to.deep.include({ created: 0, totalNok: "0.00", lines: [] });

    const line = await alice.onward.line({ transferLineId: L.amf25 });
    expect(line).to.deep.include({
      status: "forwarded_assumed",
      assumedNok: "420000.00",
      awaitingNok: "0.00",
    });
    expect(line.allocations[0]).to.deep.include({
      basis: "assumed",
      organizationId: ORG.AMF,
      forwardedAt: "2025-05-20",
      note: "Assumed forwarded in full; no report found",
    });

    // Assumed lines stay on the awaiting list, counted separately
    const groups = await alice.onward.awaiting();
    expect(groups[0]).to.deep.include({ assumedNok: "520000.00", awaitingNok: "870000.00" });
    expect(groups[0]!.lines.map((l) => l.id)).to.deep.equal([L.amf24, L.tcf24, L.amf25, L.tcf25]);

    // Replacing an assumed entry: delete it, enter the report
    const after = await alice.onward.allocations.delete({ id: line.allocations[0]!.id });
    expect(after.line.status).to.equal("awaiting");
  });
});
