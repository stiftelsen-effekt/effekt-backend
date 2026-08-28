import * as mysql from "mysql2/promise";
import config from "../config";

/**
 * A dedicated, read-only connection pool for the anonymized analysis database
 * (EffektAnalysisDB). This is intentionally SEPARATE from the main DAO pool in
 * DAO.ts: the DAO pool authenticates as a user that can write to the
 * operational database (EffektDonasjonDB), and must never be reused for the
 * public MCP endpoint.
 *
 * The primary security boundary is the database user itself (MCP_DB_USER should
 * only be granted SELECT on EffektAnalysisDB). Everything here is defense in
 * depth on top of that.
 */

const MAX_EXECUTION_TIME_MS = 15000;

let pool: mysql.Pool | undefined;

/**
 * Lazily create the read-only pool. Mirrors the socket-vs-host connection logic
 * in DAO.ts (Cloud Run uses a unix socket to Cloud SQL, detected via K_SERVICE).
 */
export function getAnalysisPool(): mysql.Pool {
  if (pool) return pool;

  const args: mysql.PoolOptions = {
    user: config.mcp_db_username,
    password: config.mcp_db_password,
    database: config.mcp_db_name,
    waitForConnections: true,
    connectionLimit: 4,
    enableKeepAlive: true,
    timezone: "+00:00",
    // Extra guard: never allow stacked/multiple statements over this pool.
    multipleStatements: false,
  };

  if (process.env.K_SERVICE != null) {
    (args as any).socketPath = `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
  } else {
    (args as any).host = config.db_host;
  }

  pool = mysql.createPool(args);
  return pool;
}

/**
 * Whether the MCP analysis DB is configured. If the env vars are missing we
 * treat the feature as disabled rather than crashing the whole backend.
 */
export function isAnalysisDbConfigured(): boolean {
  return Boolean(config.mcp_db_username && config.mcp_db_password && config.mcp_db_name);
}

/**
 * Run a query inside an explicit READ ONLY transaction with a server-side
 * execution timeout. Any attempt to write (even if the user somehow had the
 * grant) will be rejected by MySQL, and long-running queries are aborted.
 */
export async function runReadOnlyQuery<T = any>(
  sql: string,
  params?: any[],
): Promise<{ rows: T[]; fields: mysql.FieldPacket[] }> {
  const conn = await getAnalysisPool().getConnection();
  try {
    await conn.query(`SET SESSION max_execution_time = ${MAX_EXECUTION_TIME_MS}`);
    await conn.query("START TRANSACTION READ ONLY");
    try {
      const [rows, fields] = await conn.query(sql, params);
      await conn.query("COMMIT");
      return { rows: rows as T[], fields };
    } catch (ex) {
      try {
        await conn.query("ROLLBACK");
      } catch {
        /* ignore rollback failure */
      }
      throw ex;
    }
  } finally {
    conn.release();
  }
}
