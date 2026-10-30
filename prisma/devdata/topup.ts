/**
 * Brings a database seeded by prisma/devdata up to today (or SEED_NOW): generates the days since
 * the last seed/top-up and applies them without touching records created by hand.
 * Safe to run any time; does nothing if the data is current or was not generated.
 *
 *   DB_URL=mysql://root:effekt-local@127.0.0.1:3307/EffektDonasjonDB_Local \
 *     pnpm exec ts-node prisma/devdata/topup.ts
 */
import { todayInNorway } from "./calendar";
import { connect, topUp } from "./store";

async function main() {
  const conn = await connect();
  try {
    await topUp(conn, todayInNorway());
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e?.sqlMessage ? `${e.code}: ${e.sqlMessage}` : e);
  process.exit(1);
});
