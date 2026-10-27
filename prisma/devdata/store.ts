/**
 * Writes generated dev data to MySQL: the first seed, and top-ups that bring an existing local
 * database up to "today" without touching records created by hand.
 *
 * How a top-up works: the generator is causal and gives rows stable ids (see generate.ts), so
 * the database holds generate(start, previousEnd). We regenerate that snapshot, check its hash
 * against the one stored at the last write (to detect generator changes), generate the snapshot
 * for today, and apply the difference:
 * - rows that are new since the last run are inserted,
 * - columns that changed in earlier rows (an agreement that was cancelled in the meantime, a
 *   charge that went from DUE to CHARGED, a review item that was handled) are updated, and only
 *   those columns, so manual edits to other columns survive.
 * Integer ids of new rows are placed after the highest id in each table, so they never clash
 * with rows created in the admin. The mapping from generated ids to database ids is kept as
 * id segments in the metadata.
 * Tables with a BEFORE UPDATE trigger on last_updated (agreements, distributions...) get the
 * time of the top-up in that column for the rows it updates; everything else matches a fresh
 * seed for the same day exactly.
 *
 * The metadata lives in a separate schema (`dev_seed_meta`), keyed by database name, so Prisma
 * never sees an unknown table in the application schema (no drift for `prisma migrate dev`).
 */
import crypto from "crypto";
import mysql from "mysql2/promise";
import { config } from "./config";
import { firstOfMonth, isoDate, parts, todayInNorway, toDay } from "./calendar";
import { Dataset, GENERATED_TABLES, generate, Row, TableName } from "./generate";
import {
  CAUSE_AREAS,
  DATA_OWNERS,
  ORGANIZATIONS,
  PAYMENT_METHODS,
  REFERRAL_TYPES,
  STOP_REASONS,
} from "./reference";

const META_SCHEMA = "dev_seed_meta";
/** Bump to invalidate stored metadata when its format changes */
const META_VERSION = 1;

type TableMeta = { key: string; numericKey: boolean; fks?: Record<string, TableName> };

const TABLES: Record<TableName, TableMeta> = {
  Donors: { key: "ID", numericKey: true },
  Tax_unit: { key: "ID", numericKey: true, fks: { Donor_ID: "Donors" } },
  Fundraisers: { key: "ID", numericKey: true, fks: { Donor_ID: "Donors" } },
  Fundraiser_transactions: { key: "ID", numericKey: true, fks: { Fundraiser_ID: "Fundraisers" } },
  Distributions: {
    key: "KID",
    numericKey: false,
    fks: {
      Donor_ID: "Donors",
      Tax_unit_ID: "Tax_unit",
      Fundraiser_transaction_ID: "Fundraiser_transactions",
    },
  },
  Distribution_cause_areas: { key: "ID", numericKey: true },
  Distribution_cause_area_organizations: {
    key: "ID",
    numericKey: true,
    fks: { Distribution_cause_area_ID: "Distribution_cause_areas" },
  },
  Avtalegiro_agreements: { key: "ID", numericKey: true },
  Vipps_agreements: { key: "ID", numericKey: false, fks: { donorID: "Donors" } },
  Vipps_agreement_charges: { key: "chargeID", numericKey: false },
  AutoGiro_mandates: { key: "ID", numericKey: true },
  AutoGiro_agreements: { key: "ID", numericKey: true, fks: { mandateID: "AutoGiro_mandates" } },
  AutoGiro_shipments: { key: "ID", numericKey: true },
  Donations: { key: "ID", numericKey: true, fks: { Donor_ID: "Donors" } },
  Payment_intent: { key: "Id", numericKey: true },
  Vipps_orders: {
    key: "ID",
    numericKey: true,
    fks: { donorID: "Donors", donationID: "Donations" },
  },
  Referral_records: { key: "ID", numericKey: true, fks: { DonorID: "Donors" } },
  Recurring_agreement_stopped: {
    key: "ID",
    numericKey: true,
    fks: { avtalegiroAgreementID: "Avtalegiro_agreements" },
  },
  Import_logs: { key: "ID", numericKey: true },
  Review_queue_items: {
    key: "ID",
    numericKey: true,
    fks: { Import_log_ID: "Import_logs", Donation_ID: "Donations" },
  },
  Avtalegiro_shipment: { key: "ID", numericKey: true },
};

/** Generated ids from..to are stored as id + offset */
type Segment = { from: number; to: number; offset: number };

type Meta = {
  version: number;
  seed: string;
  scale: number;
  start: string;
  end: string;
  /** Hash of generate(start, end), to detect generator changes */
  hash: string;
  counts: Record<string, number>;
  segments: Record<string, Segment[]>;
};

export type Settings = { seed: string; scale: number; start: number; end: number };

// -------------------------------------------------------------------------------------------------
// Connection and metadata

export async function connect(): Promise<mysql.Connection> {
  const url = process.env.DB_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DB_URL (mysql://user:pass@host:port/database)");
  return mysql.createConnection({ uri: url, dateStrings: true, supportBigNumbers: true });
}

async function databaseName(conn: mysql.Connection): Promise<string> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  return rows[0].db;
}

async function ensureMetaTable(conn: mysql.Connection) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${META_SCHEMA}\``);
  await conn.query(
    `CREATE TABLE IF NOT EXISTS \`${META_SCHEMA}\`.state (
      db_name VARCHAR(64) PRIMARY KEY,
      data JSON NOT NULL,
      updated DATETIME NOT NULL
    )`,
  );
}

export async function readMeta(conn: mysql.Connection): Promise<Meta | null> {
  const [schemas] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'state'",
    [META_SCHEMA],
  );
  if (schemas.length === 0) return null;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT data FROM \`${META_SCHEMA}\`.state WHERE db_name = ?`,
    [await databaseName(conn)],
  );
  if (rows.length === 0) return null;
  const data = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
  return data.version === META_VERSION ? (data as Meta) : null;
}

async function writeMeta(conn: mysql.Connection, meta: Meta) {
  await conn.query(
    `REPLACE INTO \`${META_SCHEMA}\`.state (db_name, data, updated) VALUES (?, ?, NOW())`,
    [await databaseName(conn), JSON.stringify(meta)],
  );
}

// -------------------------------------------------------------------------------------------------
// Settings

/** Seed settings from the environment: SEED, SEED_SCALE, SEED_NOW, SEED_START */
export function settingsFromEnv(): Settings {
  const end = todayInNorway();
  const { year, month } = parts(end);
  const start = process.env.SEED_START
    ? toDay(process.env.SEED_START)
    : firstOfMonth(year - config.years, month);
  const scale = Number(process.env.SEED_SCALE ?? 1);
  if (!(scale > 0)) throw new Error("SEED_SCALE must be a positive number");
  return { seed: process.env.SEED ?? "effekt-dev", scale, start, end };
}

function datasetHash(dataset: Dataset): string {
  const hash = crypto.createHash("sha256");
  for (const table of GENERATED_TABLES) {
    hash.update(table);
    for (const row of dataset[table]) hash.update(JSON.stringify(row));
  }
  return hash.digest("hex");
}

// -------------------------------------------------------------------------------------------------
// Writing

async function insertRows(conn: mysql.Connection, table: string, rows: Row[], ignore: boolean) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const chunk = 2000;
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((row) => columns.map((c) => row[c] ?? null));
    await conn.query(`INSERT ${ignore ? "IGNORE " : ""}INTO ?? (??) VALUES ?`, [
      table,
      columns,
      values,
    ]);
  }
}

async function upsertReference(conn: mysql.Connection) {
  const upsert = async (table: string, rows: Record<string, unknown>[]) => {
    const columns = Object.keys(rows[0]);
    const values = rows.map((row) => columns.map((c) => row[c]));
    const updates = columns.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
    await conn.query(`INSERT INTO ?? (??) VALUES ? ON DUPLICATE KEY UPDATE ${updates}`, [
      table,
      columns,
      values,
    ]);
  };
  await upsert("Data_owner", DATA_OWNERS);
  await upsert("Payment", PAYMENT_METHODS);
  await upsert("Cause_areas", CAUSE_AREAS);
  await upsert(
    "Organizations",
    ORGANIZATIONS.map(({ customWeight: _weight, ...org }) => ({
      ...org,
      short_desc: org.full_name,
      long_desc: org.abbriv,
      info_url: "https://gieffektivt.no/organisasjoner",
      widget_display_name: org.full_name,
    })),
  );
  await upsert(
    "Referral_types",
    REFERRAL_TYPES.map(({ weight: _weight, ...type }) => type),
  );
  await upsert("Recurring_agreement_stopped_reasons", STOP_REASONS);
}

function mapId(segments: Segment[] | undefined, genId: number): number {
  for (const s of segments ?? []) if (genId >= s.from && genId <= s.to) return genId + s.offset;
  return genId;
}

function toDatabase(table: TableName, row: Row, segments: Record<string, Segment[]>): Row {
  const meta = TABLES[table];
  const out: Row = { ...row };
  if (meta.numericKey) out[meta.key] = mapId(segments[table], row[meta.key] as number);
  for (const [column, target] of Object.entries(meta.fks ?? {})) {
    if (out[column] != null) out[column] = mapId(segments[target], out[column] as number);
  }
  return out;
}

/**
 * Applies the difference between two snapshots. `previous` is null for the first seed.
 * Returns the new metadata.
 */
async function apply(
  conn: mysql.Connection,
  settings: Settings,
  previous: { dataset: Dataset; meta: Meta } | null,
  next: Dataset,
): Promise<{ meta: Meta; inserted: number; updated: number }> {
  const segments: Record<string, Segment[]> = structuredClone(previous?.meta.segments ?? {});
  const counts: Record<string, number> = {};
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, { key: Row; changes: Row }[]> = {};

  // First pass: what is new, what changed, and where new integer ids go
  for (const table of GENERATED_TABLES) {
    const meta = TABLES[table];
    const oldRows = previous?.dataset[table] ?? [];
    const newRows = next[table];
    counts[table] = newRows.length;
    inserts[table] = [];
    updates[table] = [];

    const oldByKey = new Map(oldRows.map((r) => [r[meta.key], r]));
    for (const row of newRows) {
      const old = oldByKey.get(row[meta.key]);
      if (!old) {
        inserts[table].push(row);
        continue;
      }
      const changes: Row = {};
      for (const [column, value] of Object.entries(row)) {
        if (old[column] !== value) changes[column] = value;
      }
      if (Object.keys(changes).length > 0) updates[table].push({ key: row, changes });
    }

    if (meta.numericKey && inserts[table].length > 0) {
      const from = oldRows.length + 1;
      const to = newRows.length;
      // Generated ids are sequential, so new rows must be exactly from..to
      inserts[table].forEach((row, i) => {
        if (row[meta.key] !== from + i) throw new Error(`Unexpected id order in ${table}`);
      });
      const [[{ maxId }]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COALESCE(MAX(??), 0) AS maxId FROM ??`,
        [meta.key, table],
      );
      const previousTop = (segments[table] ?? []).reduce(
        (top, s) => Math.max(top, s.to + s.offset),
        0,
      );
      const offset = Math.max(Number(maxId), previousTop) - (from - 1);
      (segments[table] ??= []).push({ from, to, offset });
    }
  }

  // Second pass: write in foreign key order
  let inserted = 0;
  let updated = 0;
  for (const table of GENERATED_TABLES) {
    const meta = TABLES[table];
    const rows = inserts[table].map((row) => toDatabase(table, row, segments));
    await insertRows(conn, table, rows, previous !== null);
    inserted += rows.length;

    for (const { key, changes } of updates[table]) {
      const dbRow = toDatabase(table, { ...changes, [meta.key]: key[meta.key] }, segments);
      const keyValue = dbRow[meta.key];
      delete dbRow[meta.key];
      if (Object.keys(dbRow).length === 0) continue;
      await conn.query(`UPDATE ?? SET ? WHERE ?? = ?`, [table, dbRow, meta.key, keyValue]);
      updated++;
    }
  }

  return {
    meta: {
      version: META_VERSION,
      seed: settings.seed,
      scale: settings.scale,
      start: isoDate(settings.start),
      end: isoDate(settings.end),
      hash: datasetHash(next),
      counts,
      segments,
    },
    inserted,
    updated,
  };
}

// -------------------------------------------------------------------------------------------------
// Entry points

/** Seeds an empty database. Refuses to touch a database that already has donors. */
export async function seed(conn: mysql.Connection, settings: Settings) {
  const [[{ n }]] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM Donors");
  if (Number(n) > 0) throw new Error("The database already has donors; refusing to seed it");

  const started = Date.now();
  console.log(
    `Generating dev data ${isoDate(settings.start)} .. ${isoDate(settings.end)} (seed "${
      settings.seed
    }", scale ${settings.scale})`,
  );
  const dataset = generate(settings);
  await ensureMetaTable(conn);
  await conn.beginTransaction();
  try {
    await upsertReference(conn);
    const { meta, inserted } = await apply(conn, settings, null, dataset);
    await writeMeta(conn, meta);
    await conn.commit();
    console.log(`Inserted ${inserted} rows in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    await conn.rollback();
    throw e;
  }
  printSummary(dataset);
}

export type TopUpResult = "up-to-date" | "topped-up" | "not-generated" | "generator-changed";

/** Brings a generated database forward to `end` (today unless SEED_NOW is set) */
export async function topUp(conn: mysql.Connection, end: number): Promise<TopUpResult> {
  const meta = await readMeta(conn);
  if (!meta) {
    console.log(
      "This database was not seeded by prisma/devdata (no dev_seed_meta entry); nothing to top up.\n" +
        "Run `pnpm dev:env:reset` for a fresh, current dataset.",
    );
    return "not-generated";
  }
  const previousEnd = toDay(meta.end);
  if (end <= previousEnd) {
    console.log(`Dev data is up to date (generated through ${meta.end}).`);
    return "up-to-date";
  }

  const started = Date.now();
  const base = { seed: meta.seed, scale: meta.scale, start: toDay(meta.start) };
  const previous = generate({ ...base, end: previousEnd });
  if (datasetHash(previous) !== meta.hash) {
    console.log(
      "The dev data generator has changed since this database was seeded, so it cannot be topped up.\n" +
        "Run `pnpm dev:env:reset` to regenerate (this discards local changes).",
    );
    return "generator-changed";
  }
  const next = generate({ ...base, end });
  await conn.beginTransaction();
  let inserted: number;
  let updated: number;
  try {
    const result = await apply(conn, { ...base, end }, { dataset: previous, meta }, next);
    ({ inserted, updated } = result);
    await writeMeta(conn, result.meta);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  }
  console.log(
    `Topped up dev data from ${meta.end} to ${isoDate(
      end,
    )}: ${inserted} rows inserted, ${updated} updated ` +
      `(${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  return "topped-up";
}

function printSummary(dataset: Dataset) {
  const byMonth = new Map<string, { count: number; sum: number }>();
  for (const d of dataset.Donations) {
    const month = String(d.timestamp_confirmed).slice(0, 7);
    const entry = byMonth.get(month) ?? { count: 0, sum: 0 };
    entry.count++;
    entry.sum += Number(d.sum_confirmed);
    byMonth.set(month, entry);
  }
  const months = [...byMonth.keys()].sort().slice(-13);
  console.log("Donations in the last 13 months:");
  for (const month of months) {
    const { count, sum } = byMonth.get(month)!;
    console.log(
      `  ${month}  ${String(count).padStart(5)}  ${Math.round(sum)
        .toLocaleString("nb-NO")
        .padStart(12)} kr`,
    );
  }
}
