import { describe, it, beforeAll, afterAll } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";
import { appRouter } from "../../trpc/router";
import { createCallerFactory } from "../../trpc/trpc";

/**
 * Checks that rows timestamped by MySQL (column DEFAULT) come out of tRPC as the right instant when
 * the server's zone is +02:00, as on production Cloud SQL (`default_time_zone=+02:00`). See
 * docs/timestamps.md. Skipped unless TIMESTAMPS_TEST_DB_URL points at a local, migrated and seeded
 * database, e.g. the dev environment's:
 *
 *   TIMESTAMPS_TEST_DB_URL=mysql://root:effekt-local@127.0.0.1:3307/EffektDonasjonDB_Local \
 *     pnpm test src/__test__/DAO/timestamps.db.spec.ts
 *
 * Each connection sets its session zone to +02:00, so this reproduces production whatever the
 * server's global zone is. The spec adds one Import_logs row and one Payment_intent row and deletes
 * them again.
 */
const url = process.env.TIMESTAMPS_TEST_DB_URL;
const isLocal = !!url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

const createCaller = createCallerFactory(appRouter);
const admin = () =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: { permissions: ["admin"], email: "test@example.org", sub: "auth0|test" } as any,
  });

/** Within a minute of now: the 2-hour error this guards against is far outside that */
const expectNow = (iso: string | Date | null | undefined) => {
  expect(iso, "timestamp").to.not.equal(null);
  const ms = new Date(iso as string).getTime();
  expect(Math.abs(ms - Date.now()), `${new Date(ms).toISOString()} vs now`).to.be.below(60_000);
};

(isLocal ? describe : describe.skip)(
  "DB-filled timestamps against MySQL at +02:00",
  { timeout: 30000 },
  function () {
    let pool: mysql.Pool;
    let originalPool: mysql.Pool | undefined;
    let logId: number | undefined;
    let intentId: number | undefined;

    beforeAll(async () => {
      // Like DAO.ts: the app pool only sets mysql2's conversion zone, not the session's
      pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 2 });
      pool.on("connection", (conn) => {
        // Callback connection on the pool's event
        (conn as any).query("SET time_zone = '+02:00'");
      });
      originalPool = DAO.dbPool;
      DAO.dbPool = pool;
      const [[zone]] = await pool.query<any[]>(
        "SELECT @@session.time_zone AS tz, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset",
      );
      expect(zone.offset, `session zone ${zone.tz}`).to.equal(120);
    });

    afterAll(async () => {
      if (logId !== undefined) await pool.query("DELETE FROM Import_logs WHERE ID = ?", [logId]);
      if (intentId !== undefined)
        await pool.query("DELETE FROM Payment_intent WHERE Id = ?", [intentId]);
      DAO.dbPool = originalPool!;
      await pool.end();
    });

    it("shows a fresh import log entry at the current time (list and detail)", async () => {
      logId = await DAO.logging.add("Timestamp check", { check: true });
      const [[raw]] = await pool.query<any[]>("SELECT timestamp FROM Import_logs WHERE ID = ?", [
        logId,
      ]);
      // Stored in the session's clock: read naively it is two hours ahead
      expect(Math.round((raw.timestamp.getTime() - Date.now()) / 3_600_000)).to.equal(2);

      const entry = await admin().reports.logs.get({ id: logId });
      expectNow(entry.timestamp);

      const list = await admin().reports.logs.list({
        page: 0,
        limit: 5,
        sort: { id: "timestamp", desc: true },
      });
      const row = list.rows.find((r: any) => r.ID === logId);
      expect(row, "new entry first in the list").to.not.equal(undefined);
      expectNow(row!.timestamp);
    });

    it("shows a fresh payment intent at the current time", async () => {
      const [[dist]] = await pool.query<any[]>(
        "SELECT KID FROM Distributions WHERE Donor_ID IS NOT NULL ORDER BY KID LIMIT 1",
      );
      expect(dist, "a seeded distribution").to.not.equal(undefined);
      const [insert] = await pool.query<mysql.ResultSetHeader>(
        "INSERT INTO Payment_intent (Payment_amount, Payment_method, KID_fordeling) VALUES (100, 2, ?)",
        [dist.KID],
      );
      intentId = insert.insertId;

      const result = await admin().intents.list({
        page: 0,
        limit: 50,
        filter: { KID: dist.KID },
        sort: { id: "created", desc: true },
      });
      const row = result.rows.find((r: any) => r.id === intentId);
      expect(row, "new intent in the list").to.not.equal(undefined);
      expectNow(row!.created);
    });

    // The other converted reads: the SQL must run (ONLY_FULL_GROUP_BY, aliases) and return Dates
    it("runs every converted read against the seeded data", async () => {
      const t = admin();
      const sortCreated = { id: "created", desc: true } as const;
      const page = { page: 0, limit: 5 };
      const [[donor]] = await pool.query<any[]>(
        `SELECT AG.ID, D.KID FROM Distributions D
       JOIN Avtalegiro_agreements AG ON AG.KID = D.KID LIMIT 1`,
      );
      const [[vipps]] = await pool.query<any[]>("SELECT ID, donorID FROM Vipps_agreements LIMIT 1");

      const agreements = await t.agreements.list({ ...page, sort: sortCreated });
      expect(agreements.rows.length).to.be.greaterThan(0);
      await t.agreements.cancelled({ ...page });
      const donors = await t.donors.list({ ...page, sort: { id: "registered", desc: true } });
      expect(donors.rows.length).to.be.greaterThan(0);
      await t.donors.referrals({ donorId: donors.rows[0].id });
      await t.giro.avtalegiro.list({ ...page, sort: sortCreated });
      await t.reports.reviewQueue.list({ ...page, sort: sortCreated });
      await t.vipps.agreements.list({ ...page, sort: sortCreated });
      await t.vipps.charges.list({ ...page, sort: sortCreated });
      await t.reports.fundraisers.list({ ...page });
      await t.regranting.rounds.list({});
      await t.regranting.holds.list({});
      if (donor) {
        await t.donors.recurring.avtalegiro({
          donorId: (await DAO.donors.getByKID(donor.KID))!.id,
        });
        await DAO.avtalegiroagreements.getAgreement(donor.ID);
      }
      if (vipps) {
        await DAO.vipps.getAgreement(vipps.ID); // tRPC get also calls the Vipps API
        await t.donors.recurring.vipps({ donorId: vipps.donorID });
        await DAO.vipps.getPaymentsByAgreementId(vipps.ID);
      }
      const registered = (await DAO.donors.getByID(donors.rows[0].id))!.registered;
      expect(registered).to.be.instanceOf(Date);
    });
  },
);
