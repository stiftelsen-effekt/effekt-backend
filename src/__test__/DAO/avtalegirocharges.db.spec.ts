import { expect } from "chai";
import { DateTime } from "luxon";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";

/**
 * Runs the AvtaleGiro charge queries against a real MySQL. Skipped unless AVTALEGIRO_TEST_DB_URL
 * points at a local, migrated database, e.g. the dev environment's:
 *
 *   AVTALEGIRO_TEST_DB_URL=mysql://root:effekt-local@127.0.0.1:3307/EffektDonasjonDB_Local \
 *     pnpm test:file src/__test__/DAO/avtalegirocharges.db.spec.ts
 *
 * The session zone is +02:00 like production. The spec adds a donor with two agreements and a few
 * shipments, and deletes them again.
 */
const url = process.env.AVTALEGIRO_TEST_DB_URL;
const isLocal = !!url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

const KID_A = "990000000000011";
const KID_B = "990000000000022";

(isLocal ? describe : describe.skip)("AvtaleGiro charges against MySQL", function () {
  this.timeout(30000);
  let pool: mysql.Pool;
  let originalPool: mysql.Pool | undefined;
  let donorID: number;
  let agreementA: number;
  let agreementB: number;
  const shipmentIDs: number[] = [];

  const agreement = (id: number, KID: string, paymentDate: number) => ({
    id,
    KID,
    amount: 50000,
    paymentDate,
    notice: false,
  });

  const cleanCharges = () =>
    pool.query("DELETE FROM Avtalegiro_agreement_charges WHERE KID IN (?)", [[KID_A, KID_B]]);

  before(async () => {
    pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 2 });
    pool.on("connection", (conn) => {
      (conn as any).query("SET time_zone = '+02:00'");
    });
    originalPool = DAO.dbPool;
    DAO.dbPool = pool;

    const [donor] = await pool.query<mysql.ResultSetHeader>(
      "INSERT INTO Donors (email, full_name) VALUES ('avtalegiro-charges-db-spec@example.org', 'Test')",
    );
    donorID = donor.insertId;
    for (const KID of [KID_A, KID_B]) {
      await pool.query(
        "INSERT INTO Distributions (KID, Donor_ID, Tax_unit_ID) VALUES (?, ?, NULL)",
        [KID, donorID],
      );
    }
    const [a] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO Avtalegiro_agreements (KID, amount, payment_date, notice, active, created)
        VALUES (?, 50000, 20, 0, 1, '2026-01-01')`,
      [KID_A],
    );
    agreementA = a.insertId;
    const [b] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO Avtalegiro_agreements (KID, amount, payment_date, notice, active, created)
        VALUES (?, 50000, 20, 0, 1, '2026-01-01')`,
      [KID_B],
    );
    agreementB = b.insertId;
  });

  afterEach(cleanCharges);

  after(async () => {
    if (!pool) return;
    await cleanCharges();
    if (shipmentIDs.length > 0) {
      await pool.query("DELETE FROM Avtalegiro_shipment WHERE ID IN (?)", [shipmentIDs]);
    }
    await pool.query("DELETE FROM Avtalegiro_agreements WHERE KID IN (?)", [[KID_A, KID_B]]);
    await pool.query("DELETE FROM Distributions WHERE KID IN (?)", [[KID_A, KID_B]]);
    if (donorID) await pool.query("DELETE FROM Donors WHERE ID = ?", [donorID]);
    DAO.dbPool = originalPool as any;
    await pool.end();
  });

  const addShipment = async (generated?: string) => {
    const [result] = await pool.query<mysql.ResultSetHeader>(
      generated
        ? "INSERT INTO Avtalegiro_shipment (num_claims, `generated`) VALUES (1, ?)"
        : "INSERT INTO Avtalegiro_shipment (num_claims) VALUES (1)",
      generated ? [generated] : [],
    );
    shipmentIDs.push(result.insertId);
    return result.insertId;
  };

  it("records charges with UTC timestamps and finds them for the month", async () => {
    const shipmentID = await addShipment();
    await DAO.avtalegirocharges.addCharges(
      shipmentID,
      [agreement(agreementA, KID_A, 5), agreement(agreementB, KID_B, 5)],
      DateTime.fromISO("2026-11-05"),
    );

    const [rows] = await pool.query<any[]>(
      "SELECT KID, DATE_FORMAT(due_date, '%Y-%m-%d') AS due, status, created FROM Avtalegiro_agreement_charges WHERE shipmentID = ? ORDER BY KID",
      [shipmentID],
    );
    expect(rows.map((r) => [r.KID, r.due, r.status])).to.deep.equal([
      [KID_A, "2026-11-05", "CLAIMED"],
      [KID_B, "2026-11-05", "CLAIMED"],
    ]);
    expect(Math.abs(new Date(rows[0].created).getTime() - Date.now())).to.be.below(60_000);

    const november = await DAO.avtalegirocharges.getClaimedKIDsForMonth(
      DateTime.fromISO("2026-11-30"),
    );
    expect([...november].filter((KID) => KID === KID_A || KID === KID_B).sort()).to.deep.equal([
      KID_A,
      KID_B,
    ]);
    const october = await DAO.avtalegirocharges.getClaimedKIDsForMonth(
      DateTime.fromISO("2026-10-31"),
    );
    expect(october.has(KID_A)).to.be.false;
  });

  it("finds today's shipments for a due date, and supersedes them", async () => {
    const shipmentID = await addShipment();
    await DAO.avtalegirocharges.addCharges(
      shipmentID,
      [agreement(agreementA, KID_A, 6)],
      DateTime.fromISO("2026-11-06"),
    );
    // The shipment's DB-clock day matches the app's day outside 22:00-24:00 UTC (the jobs run
    // 10:00-13:00 Oslo time)
    const [[{ day }]] = await pool.query<any[]>(
      "SELECT DATE_FORMAT(`generated`, '%Y-%m-%d') AS day FROM Avtalegiro_shipment WHERE ID = ?",
      [shipmentID],
    );
    const generatedOn = DateTime.fromISO(day);

    expect(
      await DAO.avtalegirocharges.getShipmentIDsForDueDate(
        DateTime.fromISO("2026-11-06"),
        generatedOn,
      ),
    ).to.deep.equal([shipmentID]);

    await DAO.avtalegirocharges.supersedeShipments([shipmentID]);

    expect(
      await DAO.avtalegirocharges.getShipmentIDsForDueDate(
        DateTime.fromISO("2026-11-06"),
        generatedOn,
      ),
    ).to.deep.equal([]);
    const claimed = await DAO.avtalegirocharges.getClaimedKIDsForMonth(
      DateTime.fromISO("2026-11-06"),
    );
    expect(claimed.has(KID_A)).to.be.false;
  });

  it("lists open charges by KID with ISO due dates", async () => {
    const shipmentID = await addShipment();
    await DAO.avtalegirocharges.addCharges(
      shipmentID,
      [agreement(agreementA, KID_A, 20)],
      DateTime.fromISO("2026-11-20"),
    );

    const open = await DAO.avtalegirocharges.getOpenChargesByKID(KID_A);
    expect(open.map((c) => c.dueDate)).to.deep.equal(["2026-11-20"]);
  });

  it("counts only shipments sent before the first recorded charge as untracked", async () => {
    const day = "2026-11-02";
    const [[{ minShipment }]] = await pool.query<any[]>(
      "SELECT MIN(shipmentID) AS minShipment FROM Avtalegiro_agreement_charges",
    );
    expect(minShipment, "no other charges in the test database").to.equal(null);

    const legacy = await addShipment(`${day} 10:00:00`);
    const tracked = await addShipment(`${day} 10:01:00`);
    await DAO.avtalegirocharges.addCharges(
      tracked,
      [agreement(agreementA, KID_A, 6)],
      DateTime.fromISO("2026-11-06"),
    );
    // Created after the first tracked one, but recording its charges failed: nothing was sent
    await addShipment(`${day} 10:02:00`);

    expect(
      await DAO.avtalegirocharges.getUntrackedShipmentIDs(DateTime.fromISO(day)),
    ).to.deep.equal([legacy]);
  });

  it("leaves agreements claimed on another date this month out of the missing list", async () => {
    const shipmentID = await addShipment();
    // KID_A was claimed on the 5th, then moved to the 20th; KID_B is due on the 20th
    await DAO.avtalegirocharges.addCharges(
      shipmentID,
      [agreement(agreementA, KID_A, 5)],
      DateTime.fromISO("2026-11-05"),
    );

    const missing = await DAO.avtalegiroagreements.getMissingForDate(new Date(2026, 10, 20));
    const KIDs = missing.map((row) => row.KID);
    expect(KIDs).to.include(KID_B);
    expect(KIDs).to.not.include(KID_A);

    // A superseded claim doesn't count
    await DAO.avtalegirocharges.supersedeShipments([shipmentID]);
    const afterSupersede = await DAO.avtalegiroagreements.getMissingForDate(new Date(2026, 10, 20));
    expect(afterSupersede.map((row) => row.KID)).to.include(KID_A);
  });
});
