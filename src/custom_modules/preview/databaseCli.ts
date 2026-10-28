/**
 * Database steps of a preview deploy, run by scripts/preview/migrate-and-seed.sh inside the
 * preview image (as a Cloud Run Job, or locally against a throwaway MySQL):
 *
 *   node dist/custom_modules/preview/databaseCli.js guard          startup guard only
 *   node dist/custom_modules/preview/databaseCli.js url prisma     DB_URL for the Prisma CLI
 *   node dist/custom_modules/preview/databaseCli.js url mysql2     DB_URL for the seed (mysql2)
 *   node dist/custom_modules/preview/databaseCli.js reset          drop + create DB_NAME
 *   node dist/custom_modules/preview/databaseCli.js analyze        refresh table statistics
 *   node dist/custom_modules/preview/databaseCli.js drop           drop DB_NAME (teardown)
 *
 * Every command runs the startup guard first, so it can only ever touch a preview_* database
 * on the previews instance.
 */
import * as mysql from "mysql2/promise";
import { checkPreviewEnvironment, formatViolations } from "./environmentGuard";

// Stricter than the guard's prefix check: the name is interpolated into DDL.
const SAFE_PREVIEW_DB_NAME = /^preview_[a-z0-9_]{1,56}$/;

const socketPathFor = (env: NodeJS.ProcessEnv) =>
  env.CLOUD_SQL_CONNECTION_NAME ? `/cloudsql/${env.CLOUD_SQL_CONNECTION_NAME}` : undefined;

export const databaseUrl = (env: NodeJS.ProcessEnv, flavour: "prisma" | "mysql2") => {
  const user = encodeURIComponent(env.DB_USER ?? "");
  const password = encodeURIComponent(env.DB_PASS ?? "");
  const database = encodeURIComponent(env.DB_NAME ?? "");
  const socketPath = socketPathFor(env);
  if (socketPath) {
    // Prisma reads `socket`, mysql2 reads `socketPath`; the host is ignored by both.
    const param = flavour === "prisma" ? "socket" : "socketPath";
    return `mysql://${user}:${password}@localhost/${database}?${param}=${socketPath}`;
  }
  const host = env.DB_HOST || "localhost";
  const port = env.DB_PORT ? `:${env.DB_PORT}` : "";
  return `mysql://${user}:${password}@${host}${port}/${database}`;
};

const guard = (env: NodeJS.ProcessEnv) => {
  if (env.PREVIEW_MODE !== "true") {
    throw new Error("PREVIEW_MODE must be true for preview database commands");
  }
  const violations = checkPreviewEnvironment(env);
  if (violations.length > 0) throw new Error(formatViolations(violations));
  const name = env.DB_NAME ?? "";
  if (!SAFE_PREVIEW_DB_NAME.test(name)) {
    throw new Error(`DB_NAME "${name}" must match ${SAFE_PREVIEW_DB_NAME}`);
  }
  return name;
};

const serverConnection = (env: NodeJS.ProcessEnv) => {
  const socketPath = socketPathFor(env);
  return mysql.createConnection({
    user: env.DB_USER,
    password: env.DB_PASS,
    ...(socketPath
      ? { socketPath }
      : { host: env.DB_HOST || "localhost", port: Number(env.DB_PORT || 3306) }),
  });
};

const withRetries = async <T>(fn: () => Promise<T>, attempts = 10): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.log(`Database not reachable yet (attempt ${attempt}/${attempts}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

export const run = async (args: string[], env: NodeJS.ProcessEnv = process.env) => {
  const [command, flavour] = args;
  const name = guard(env);
  switch (command) {
    case "guard":
      console.log(`Preview guard passed for ${name}`);
      return;
    case "url":
      if (flavour !== "prisma" && flavour !== "mysql2") throw new Error("url prisma|mysql2");
      process.stdout.write(databaseUrl(env, flavour));
      return;
    case "reset":
    case "drop": {
      const conn = await withRetries(() => serverConnection(env));
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
        console.log(`Dropped ${name}`);
        if (command === "reset") {
          await conn.query(`CREATE DATABASE \`${name}\``);
          console.log(`Created ${name}`);
        }
      } finally {
        await conn.end();
      }
      return;
    }
    case "analyze": {
      // Right after a bulk seed InnoDB's statistics are still empty, and some queries (the
      // regranting balances) pick a plan that runs for minutes until they are refreshed.
      const conn = await withRetries(() => serverConnection(env));
      try {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
          [name],
        );
        const tables = rows.map((row) => `\`${name}\`.\`${String(row.name).replace(/`/g, "``")}\``);
        if (tables.length > 0) await conn.query(`ANALYZE TABLE ${tables.join(", ")}`);
        console.log(`Analyzed ${tables.length} tables in ${name}`);
      } finally {
        await conn.end();
      }
      return;
    }
    default:
      throw new Error(
        `Unknown command "${command}" (guard | url prisma|mysql2 | reset | analyze | drop)`,
      );
  }
};

if (require.main === module) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
