/**
 * Deterministic data for the full-stack e2e tests (compose.e2e.yml, apps/web/cypress/e2e/fullstack).
 *
 * Writes one donor with fixed ids, KIDs and dates: agreements of every type (Vipps active and
 * stopped, AvtaleGiro, AutoGiro), donations across several years and tax units. The generated
 * dev data (prisma/devdata) is date-relative and random, so tests assert against this donor only.
 *
 * Idempotent: deletes the donor's rows first, so the Cypress `resetE2EData` task can call it
 * before each test. Never run it against anything but a throwaway local database.
 *
 *   DB_URL=mysql://root:effekt-local@127.0.0.1:3317/EffektDonasjonDB_Local node prisma/e2e/seed.mjs
 *
 * Ids, KIDs and amounts the tests assert on live in ./data.mjs (imported by the Cypress specs).
 */
import mysql from "mysql2/promise";
import { AGF, AMF, DONOR_ID, HKI, KIDS, NI, RESULTS, TAX_UNITS } from "./data.mjs";

/** [KID, [[causeAreaId, percent, standardSplit, [[orgId, percent], ...]], ...]] */
const DISTRIBUTIONS = [
  [
    KIDS.vippsCustom,
    [
      [
        1,
        100,
        false,
        [
          [AGF, 30],
          [HKI, 15],
          [NI, 25],
          [AMF, 30],
        ],
      ],
    ],
  ],
  [KIDS.vippsStandard, [[1, 100, true, [[AGF, 100]]]]],
  [KIDS.vippsStopped, [[1, 100, true, [[AGF, 100]]]]],
  [KIDS.avtalegiro, [[1, 100, true, [[AGF, 100]]]]],
  [KIDS.avtalegiroToCancel, [[1, 100, true, [[AGF, 100]]]]],
  [KIDS.autogiro, [[1, 100, true, [[AGF, 100]]]]],
  [KIDS.bank, [[1, 100, true, [[AGF, 100]]]]],
];

// Payment method ids from prisma/devdata/reference.ts
const BANK = 2;
const AVTALEGIRO = 7;
const VIPPS_RECURRING = 8;

/** [id, sum, timestamp, KID, paymentId] */
const DONATIONS = [
  [900001, 500, "2022-03-15 12:00:00", KIDS.bank, BANK],
  [900002, 1000, "2023-06-15 12:00:00", KIDS.bank, BANK],
  [900003, 100, "2024-01-10 08:00:00", KIDS.vippsCustom, VIPPS_RECURRING],
  [900004, 100, "2024-02-10 08:00:00", KIDS.vippsCustom, VIPPS_RECURRING],
  [900005, 500, "2024-05-15 06:00:00", KIDS.avtalegiro, AVTALEGIRO],
  [900006, 2500, "2025-09-01 12:00:00", KIDS.bank, BANK],
  [900007, 500, "2025-10-15 06:00:00", KIDS.avtalegiro, AVTALEGIRO],
];

// Tables that hold rows for the e2e donor, children before parents
const CLEANUP = [
  ["DELETE FROM Donations WHERE Donor_ID = ?"],
  [
    "DELETE FROM Recurring_agreement_stopped WHERE vippsAgreementID IN (SELECT ID FROM Vipps_agreements WHERE donorID = ?)",
  ],
  ["DELETE FROM Vipps_agreements WHERE donorID = ?"],
  [
    "DELETE FROM Avtalegiro_agreements WHERE KID IN (SELECT KID FROM Distributions WHERE Donor_ID = ?)",
  ],
  [
    "DELETE FROM AutoGiro_agreements WHERE KID IN (SELECT KID FROM Distributions WHERE Donor_ID = ?)",
  ],
  ["DELETE FROM AutoGiro_mandates WHERE KID IN (SELECT KID FROM Distributions WHERE Donor_ID = ?)"],
  [
    `DELETE o FROM Distribution_cause_area_organizations o
       JOIN Distribution_cause_areas c ON c.ID = o.Distribution_cause_area_ID
       JOIN Distributions d ON d.KID = c.Distribution_KID
      WHERE d.Donor_ID = ?`,
  ],
  [
    `DELETE c FROM Distribution_cause_areas c
       JOIN Distributions d ON d.KID = c.Distribution_KID
      WHERE d.Donor_ID = ?`,
  ],
  ["DELETE FROM Distributions WHERE Donor_ID = ?"],
  ["DELETE FROM Tax_unit WHERE Donor_ID = ?"],
  ["DELETE FROM Referral_records WHERE DonorID = ?"],
  ["DELETE FROM Donors WHERE ID = ?"],
];

export async function seedE2E(conn) {
  await conn.beginTransaction();
  try {
    for (const [sql] of CLEANUP) await conn.query(sql, [DONOR_ID]);

    await conn.query(
      `INSERT INTO Donors (ID, email, full_name, date_registered, newsletter)
       VALUES (?, 'e2e-donor@example.invalid', 'E2E Testgiver', '2022-01-10 10:00:00', 0)`,
      [DONOR_ID],
    );

    const { main, spouse } = TAX_UNITS;
    await conn.query(
      `INSERT INTO Tax_unit (ID, Donor_ID, ssn, full_name, registered, archived) VALUES
         (?, ?, ?, ?, '2022-01-10 10:00:00', NULL),
         (?, ?, ?, ?, '2023-01-10 10:00:00', NULL)`,
      [main.id, DONOR_ID, main.ssn, main.name, spouse.id, DONOR_ID, spouse.ssn, spouse.name],
    );

    for (const [KID, causeAreas] of DISTRIBUTIONS) {
      const taxUnitId = KID === KIDS.bank ? spouse.id : main.id;
      await conn.query(
        `INSERT INTO Distributions (KID, Donor_ID, Tax_unit_ID, inserted, last_updated)
         VALUES (?, ?, ?, '2022-01-10 10:00:00', '2022-01-10 10:00:00')`,
        [KID, DONOR_ID, taxUnitId],
      );
      for (const [causeAreaId, share, standardSplit, orgs] of causeAreas) {
        const [res] = await conn.query(
          `INSERT INTO Distribution_cause_areas
             (Distribution_KID, Cause_area_ID, Percentage_share, Standard_split)
           VALUES (?, ?, ?, ?)`,
          [KID, causeAreaId, share, standardSplit ? 1 : 0],
        );
        for (const [orgId, orgShare] of orgs) {
          await conn.query(
            `INSERT INTO Distribution_cause_area_organizations
               (Distribution_cause_area_ID, Organization_ID, Percentage_share)
             VALUES (?, ?, ?)`,
            [res.insertId, orgId, orgShare],
          );
        }
      }
    }

    await conn.query(
      `INSERT INTO Vipps_agreements
         (ID, donorID, KID, amount, status, monthly_charge_day, agreement_url_code,
          timestamp_created, cancellation_date)
       VALUES
         ('agr_E2ECUSTOM', ?, ?, 100, 'ACTIVE', 10, 'e2e-custom', '2024-01-02 10:00:00', NULL),
         ('agr_E2ESTANDARD', ?, ?, 250, 'ACTIVE', 20, 'e2e-standard', '2024-03-02 10:00:00', NULL),
         ('agr_E2ESTOPPED', ?, ?, 400, 'STOPPED', 11, 'e2e-stopped', '2023-02-02 10:00:00', '2023-12-01')`,
      [DONOR_ID, KIDS.vippsCustom, DONOR_ID, KIDS.vippsStandard, DONOR_ID, KIDS.vippsStopped],
    );

    // AvtaleGiro amounts are in øre
    await conn.query(
      `INSERT INTO Avtalegiro_agreements
         (ID, KID, amount, payment_date, notice, active, created, last_updated, cancelled)
       VALUES
         (900001, ?, 50000, 15, 1, 1, '2024-04-01 10:00:00', '2024-04-01 10:00:00', NULL),
         (900002, ?, 30000, 5, 1, 1, '2024-06-01 10:00:00', '2024-06-01 10:00:00', NULL)`,
      [KIDS.avtalegiro, KIDS.avtalegiroToCancel],
    );

    await conn.query(
      `INSERT INTO AutoGiro_mandates
         (ID, status, created, last_updated, bank_account, name_and_address, postal_code, postal_label, KID)
       VALUES (900001, 'ACTIVE', '2024-08-01 10:00:00', '2024-08-01 10:00:00', '832712345678',
               'E2E Testgiver', '11122', 'Stockholm', ?)`,
      [KIDS.autogiro],
    );
    await conn.query(
      `INSERT INTO AutoGiro_agreements
         (ID, mandateID, KID, amount, payment_date, notice, active, created, last_updated, cancelled)
       VALUES (900001, 900001, ?, 200, 25, 0, 1, '2024-08-01 10:00:00', '2024-08-01 10:00:00', NULL)`,
      [KIDS.autogiro],
    );

    for (const [id, sum, timestamp, KID, paymentId] of DONATIONS) {
      await conn.query(
        `INSERT INTO Donations
           (ID, Donor_ID, Payment_ID, PaymentExternal_ID, sum_confirmed, timestamp_confirmed,
            transaction_cost, KID_fordeling, inserted, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, DONOR_ID, paymentId, `e2e-${id}`, sum, timestamp, KID, timestamp, timestamp],
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

/** The referral columns of EffektAnalysisDB.OP_ref_data (all but Year, Inserted and Updated) */
const REFERRAL_COLUMNS = [
  "Num_Donors",
  "Total_sum",
  "Num_Donors_ref",
  "Total_sum_ref",
  "Num_Donors_EA_ref",
  "Total_sum_EA_ref",
  "Median_yearly_ds_EA_ref",
  "Avg_yearly_ds_EA_ref",
  "Max_yearly_ds_EA_ref",
  "Num_Donors_ac_ref",
  "Total_sum_ac_ref",
  "Num_Donors_some_ref",
  "Total_sum_some_ref",
  "Num_Donors_pod_ref",
  "Total_sum_pod_ref",
  "Num_Donors_tvr_ref",
  "Total_sum_tvr_ref",
  "Num_Donors_news_ref",
  "Total_sum_news_ref",
  "Num_Donors_web_ref",
  "Total_sum_web_ref",
  "Num_Donors_oth_ref",
  "Total_sum_oth_ref",
];

/**
 * A small EffektAnalysisDB with the tables the results routes read (in production they are views
 * filled by the nightly analysis jobs). Fixed rows from RESULTS, replaced on every run. DDL commits
 * implicitly, so this runs outside seedE2E's transaction.
 */
export async function seedAnalysisDb(conn) {
  await conn.query("CREATE DATABASE IF NOT EXISTS EffektAnalysisDB");
  await conn.query(
    `CREATE TABLE IF NOT EXISTS EffektAnalysisDB.Only_rec_orgs_Donations
       (Donor_ID INT NOT NULL, Sum_confirmed DECIMAL(15,2) NOT NULL, Inserted DATETIME NOT NULL)`,
  );
  await conn.query(
    "CREATE TABLE IF NOT EXISTS EffektAnalysisDB.v_Daily_donations (date DATE NOT NULL, sum DECIMAL(15,2) NOT NULL)",
  );
  await conn.query(
    `CREATE TABLE IF NOT EXISTS EffektAnalysisDB.OP_ref_data
       (Year INT NOT NULL, ${REFERRAL_COLUMNS.map((c) => `${c} INT NOT NULL`).join(", ")},
        Inserted DATETIME NOT NULL, Updated DATETIME NOT NULL)`,
  );
  await conn.query(
    `CREATE TABLE IF NOT EXISTS EffektAnalysisDB.v_Monthly_donations_per_org
       (Org VARCHAR(32) NOT NULL, DonationMonth VARCHAR(7) NOT NULL, TotalDonations DECIMAL(15,2) NOT NULL)`,
  );

  await conn.query("DELETE FROM EffektAnalysisDB.Only_rec_orgs_Donations");
  for (const [donorId, sum] of RESULTS.recommendedOrgDonations) {
    await conn.query("INSERT INTO EffektAnalysisDB.Only_rec_orgs_Donations VALUES (?, ?, ?)", [
      donorId,
      sum,
      RESULTS.inserted,
    ]);
  }
  await conn.query("DELETE FROM EffektAnalysisDB.v_Daily_donations");
  for (const [date, sum] of RESULTS.daily) {
    await conn.query("INSERT INTO EffektAnalysisDB.v_Daily_donations VALUES (?, ?)", [date, sum]);
  }
  await conn.query("DELETE FROM EffektAnalysisDB.OP_ref_data");
  for (const year of RESULTS.referralYears) {
    await conn.query(
      `INSERT INTO EffektAnalysisDB.OP_ref_data VALUES (?, ${REFERRAL_COLUMNS.map(() => "?").join(", ")}, ?, ?)`,
      [
        year,
        ...REFERRAL_COLUMNS.map(() => RESULTS.referralValue),
        RESULTS.inserted,
        RESULTS.inserted,
      ],
    );
  }
  await conn.query("DELETE FROM EffektAnalysisDB.v_Monthly_donations_per_org");
  for (const [org, month, total] of RESULTS.monthly) {
    await conn.query("INSERT INTO EffektAnalysisDB.v_Monthly_donations_per_org VALUES (?, ?, ?)", [
      org,
      month,
      total,
    ]);
  }
}

async function main() {
  if (!process.env.DB_URL) throw new Error("DB_URL is not set");
  const conn = await mysql.createConnection(process.env.DB_URL);
  try {
    await seedE2E(conn);
    await seedAnalysisDb(conn);
    console.log(`Seeded e2e donor ${DONOR_ID} and the results figures`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e?.sqlMessage ? `${e.code}: ${e.sqlMessage}` : e);
  process.exit(1);
});
