/**
 * Seeds an empty local database with generated, current-looking fake data (prisma/devdata).
 * Run by `prisma db seed` (configured in prisma.config.ts) and the compose `migrate` step.
 *
 * Environment: DB_URL (required), SEED_NOW=YYYY-MM-DD (pretend today is another day),
 * SEED_SCALE (volume multiplier, default 1), SEED (random seed), SEED_START (first day).
 */
import { connect, seed, settingsFromEnv } from "./devdata/store";

async function main() {
  const conn = await connect();
  try {
    await seed(conn, settingsFromEnv());
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e?.sqlMessage ? `${e.code}: ${e.sqlMessage}` : e);
  process.exit(1);
});
