import config from "../../config";
import { runReadOnlyQuery } from "../analysisDbPool";

/**
 * A small, dependency-free implementation of the Model Context Protocol (MCP)
 * over Streamable HTTP, exposing READ-ONLY SQL access to the anonymized analysis
 * database (EffektAnalysisDB) so Claude Tag (and other Claude custom connectors)
 * can answer analytics questions. Auth is an Auth0 JWT with analysis_mcp.
 *
 * We hand-roll the protocol rather than using @modelcontextprotocol/sdk because
 * the current SDK requires zod v4, whose type definitions cannot be parsed by
 * this repo's pinned TypeScript 4.9. The JSON-RPC surface for a stateless,
 * tools-only server is small and implemented here in full.
 *
 * Spec: https://modelcontextprotocol.io/specification (Streamable HTTP transport)
 */

const SCHEMA = config.mcp_db_name || "EffektAnalysisDB";

export const SERVER_INFO = { name: "effekt-analysis-mcp", version: "1.0.0" };

// Newest first. We echo the client's version if we support it, else the newest.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const MAX_RESULT_ROWS = 1000;
const MAX_RESULT_CHARS = 100_000;

/**
 * Residual-PII guardrails inside the (mostly anonymized) analysis DB.
 * Comparisons are done lower-cased with word boundaries.
 *
 * - Blocked TABLES/VIEWS are fully off-limits (queries referencing them fail).
 * - Blocked COLUMNS are rejected if referenced explicitly AND stripped from any
 *   result set (so `SELECT *` cannot leak them either).
 */
const BLOCKED_TABLES = [
  "mailersend_survey_responses",
  "v_mailersend_survey_responses_raw_enriched",
];
const BLOCKED_COLUMNS = ["paymentexternal_id", "other_comment", "answer"];

const INSTRUCTIONS = `This server gives read-only SQL access to Stiftelsen Effekt's anonymized analytics database "${SCHEMA}" (MySQL).

Effekt is a Norwegian effective-altruism nonprofit that routes donations to evidence-based charities. All monetary amounts are in Norwegian Kroner (NOK).

How to use:
1. Call list_tables to see available tables and views.
2. Call describe_table to inspect columns before writing SQL.
3. Call run_sql with a single read-only SELECT (or WITH ... SELECT). Prefer the pre-built v_* views for reporting.

Useful objects:
- Tables: Donors, Donations, Tax_unit, Referral_types, Referral_records, Recurring_donor_periods, Donor_LTV, Donor_LTV_predictions, Only_GE_Donations, Only_rec_orgs_Donations.
- Views (v_*): v_Daily_donations, v_Monthly_donations_per_org, v_Yearly_donations_per_org, v_Recurring_donations, plus referral-channel, fundraiser and sporadic->recurring conversion views.

Rules & privacy:
- Read-only. INSERT/UPDATE/DELETE/DDL and multiple statements are rejected.
- The data is pseudonymized: Donor_ID is a stable pseudonym, not a real identity. Do not attempt to re-identify individuals.
- Some residual-PII fields are blocked and cannot be queried; free-text survey responses are not accessible.
- Results are capped at ${MAX_RESULT_ROWS} rows. Add GROUP BY / aggregation for large questions.`;

/* --------------------------------- types --------------------------------- */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/* ------------------------------ tool schemas ----------------------------- */

const TOOLS = [
  {
    name: "list_tables",
    description:
      "List all tables and views available in the analysis database, with their type (BASE TABLE or VIEW).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "describe_table",
    description:
      "Return the columns (name, data type, nullability, comment) of a given table or view in the analysis database.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table or view name, e.g. 'Donations'." },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "run_sql",
    description:
      "Execute a single read-only SQL SELECT (or WITH ... SELECT) against the analysis database and return the rows as JSON. Only SELECT queries are permitted.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A single read-only SELECT statement." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

/* ---------------------------- SQL validation ----------------------------- */

class QueryRejected extends Error {}

const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

/** Strip -- line comments and /* *\/ block comments so keyword checks are reliable. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ");
}

function containsWord(haystackLower: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(haystackLower);
}

/**
 * Validate and normalize a user-supplied query. Returns the query to execute
 * (with a LIMIT appended if absent). Throws QueryRejected with a helpful message
 * on any violation.
 */
export function validateSelectQuery(rawQuery: string): string {
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    throw new QueryRejected("Query must be a non-empty string.");
  }

  let query = rawQuery.trim();
  // Allow a single trailing semicolon; reject any other semicolons (no stacking).
  query = query.replace(/;\s*$/, "");
  const stripped = stripComments(query);

  if (stripped.includes(";")) {
    throw new QueryRejected("Only a single statement is allowed (no ';').");
  }

  const lower = stripped.toLowerCase();

  if (!/^\s*(select|with)\b/.test(lower)) {
    throw new QueryRejected("Only read-only SELECT (or WITH ... SELECT) queries are allowed.");
  }

  const forbidden = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "truncate",
    "replace",
    "merge",
    "grant",
    "revoke",
    "rename",
    "call",
    "handler",
    "load",
    "load_file", // \bload\b does not match load_file (underscore is a word char)
    "outfile",
    "dumpfile",
    "lock",
    "unlock",
    "into", // blocks SELECT ... INTO OUTFILE/DUMPFILE/@var
  ];
  for (const kw of forbidden) {
    if (containsWord(lower, kw)) {
      throw new QueryRejected(`Query contains a disallowed keyword: '${kw}'.`);
    }
  }

  // No cross-database access; only the analysis schema is reachable.
  if (containsWord(lower, "effektdonasjondb")) {
    throw new QueryRejected("Access to the operational database is not permitted.");
  }

  for (const t of BLOCKED_TABLES) {
    if (containsWord(lower, t)) {
      throw new QueryRejected(`Table '${t}' is not accessible.`);
    }
  }
  for (const c of BLOCKED_COLUMNS) {
    if (containsWord(lower, c)) {
      throw new QueryRejected(`Column '${c}' contains restricted data and cannot be queried.`);
    }
  }

  if (!/\blimit\b/i.test(lower)) {
    query = `${query}\nLIMIT ${MAX_RESULT_ROWS}`;
  }

  return query;
}

/* ------------------------------ result utils ----------------------------- */

/** Remove any blocklisted columns from result rows (covers SELECT *). */
function stripBlockedColumns(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  return rows.map((row) => {
    if (row && typeof row === "object") {
      for (const key of Object.keys(row)) {
        if (BLOCKED_COLUMNS.includes(key.toLowerCase())) {
          delete row[key];
        }
      }
    }
    return row;
  });
}

function jsonStringifySafe(value: any): string {
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    },
    2,
  );
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

/* -------------------------------- tools ---------------------------------- */

async function toolListTables() {
  const { rows } = await runReadOnlyQuery<{ TABLE_NAME: string; TABLE_TYPE: string }>(
    `SELECT TABLE_NAME, TABLE_TYPE
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_TYPE, TABLE_NAME`,
    [SCHEMA],
  );
  const visible = rows.filter((r) => !BLOCKED_TABLES.includes(r.TABLE_NAME.toLowerCase()));
  return textResult(jsonStringifySafe(visible));
}

async function toolDescribeTable(args: any) {
  const table = args?.table;
  if (typeof table !== "string" || !IDENTIFIER_RE.test(table)) {
    return textResult("Invalid 'table' argument: must be a plain identifier.", true);
  }
  if (BLOCKED_TABLES.includes(table.toLowerCase())) {
    return textResult(`Table '${table}' is not accessible.`, true);
  }
  const { rows } = await runReadOnlyQuery(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [SCHEMA, table],
  );
  if (rows.length === 0) {
    return textResult(`No table or view named '${table}' found in ${SCHEMA}.`, true);
  }
  const visible = rows.filter(
    (r: any) => !BLOCKED_COLUMNS.includes(String(r.COLUMN_NAME).toLowerCase()),
  );
  return textResult(jsonStringifySafe(visible));
}

async function toolRunSql(args: any) {
  let query: string;
  try {
    query = validateSelectQuery(args?.query);
  } catch (ex) {
    if (ex instanceof QueryRejected) return textResult(`Query rejected: ${ex.message}`, true);
    throw ex;
  }

  let rows: any[];
  try {
    ({ rows } = await runReadOnlyQuery(query));
  } catch (ex: any) {
    return textResult(`SQL error: ${ex?.sqlMessage || ex?.message || String(ex)}`, true);
  }

  const truncated = rows.length > MAX_RESULT_ROWS;
  const limited = stripBlockedColumns(rows.slice(0, MAX_RESULT_ROWS));

  let body = jsonStringifySafe({ rowCount: limited.length, truncated, rows: limited });
  if (body.length > MAX_RESULT_CHARS) {
    body = jsonStringifySafe({
      rowCount: limited.length,
      truncated: true,
      note: "Result too large to return in full; add aggregation or a smaller LIMIT.",
      rows: limited.slice(0, 50),
    });
  }
  return textResult(body);
}

async function callTool(name: string, args: any) {
  switch (name) {
    case "list_tables":
      return toolListTables();
    case "describe_table":
      return toolDescribeTable(args);
    case "run_sql":
      return toolRunSql(args);
    default:
      return null; // unknown tool
  }
}

/* ---------------------------- JSON-RPC dispatch --------------------------- */

function ok(id: any, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: any, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * Handle one JSON-RPC message. Returns a response object for requests, or null
 * for notifications (which get no response body).
 */
export async function handleJsonRpcMessage(
  message: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return err(message?.id ?? null, -32600, "Invalid Request");
  }

  const isNotification = message.id === undefined || message.id === null;
  const { method, params, id } = message;

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
        return ok(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call": {
        const result = await callTool(params?.name, params?.arguments);
        if (result === null) return err(id, -32602, `Unknown tool: ${params?.name}`);
        return ok(id, result);
      }
      // Notifications we simply acknowledge with no response body.
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      // Advertised capability is tools-only; be explicit for probes.
      case "resources/list":
      case "prompts/list":
        return err(id, -32601, `Method not found: ${method}`);
      default:
        if (isNotification) return null;
        return err(id, -32601, `Method not found: ${method}`);
    }
  } catch (ex: any) {
    console.error("MCP handler error:", ex);
    if (isNotification) return null;
    return err(id, -32603, "Internal error");
  }
}
