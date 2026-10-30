import type { ResultSetHeader } from "mysql2";
import { DAO } from "../DAO";
import { dbClockColumn } from "../osloDays";
import { ASSUMED_NOTE } from "../regranting/onward";
import type {
  ExternalGrantee,
  IntermediaryPayee,
  IsoDate,
  OnwardAllocation,
  OnwardBasis,
  OnwardKind,
  OnwardLineRef,
  OnwardReport,
  RegrantingFund,
} from "../regranting/types";
import { regranting, type Queryable } from "./regranting";

/**
 * Downstream regrants (docs/regranting-downstream.md): intermediary payees, regranting funds,
 * external grantees, onward reports and onward allocations. Records beside the ledger: nothing
 * here is read by balances, rounds or the FIFO composition.
 */

const pool = (): Queryable => ({
  // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- pass-through wrapper; callers build SQL from constant fragments and bind values as parameters
  query: (sql: any, params?: any) => DAO.query(sql, params) as any,
});
const db = (conn?: Queryable) => conn ?? pool();

async function rows<T>(conn: Queryable | undefined, sql: string, params: unknown[] = []) {
  // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- pass-through wrapper; callers build SQL from constant fragments and bind values as parameters
  const [result] = await db(conn).query(sql, params);
  return result as unknown as T[];
}

async function exec(conn: Queryable | undefined, sql: string, params: unknown[] = []) {
  // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli -- pass-through wrapper; callers build SQL from constant fragments and bind values as parameters
  const [result] = await db(conn).query(sql, params);
  return result as unknown as ResultSetHeader;
}

const isoDate = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;

/** "1234.5" → "1234.50"; MySQL returns DECIMAL as strings */
const money = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "0.00";
  const [int, frac = ""] = String(value).split(".");
  return `${int}.${(frac + "00").slice(0, 2)}`;
};

const trimDecimal = (value: string | null) =>
  value === null ? null : value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;

//region Markers

async function listIntermediaries(conn?: Queryable): Promise<IntermediaryPayee[]> {
  return rows<IntermediaryPayee>(
    conn,
    `SELECT ip.Payee_ID AS payeeId, p.name, ip.currency, ip.notes
     FROM Intermediary_payees ip JOIN Payees p ON p.ID = ip.Payee_ID ORDER BY p.name`,
  );
}

async function listRegrantingFunds(conn?: Queryable): Promise<RegrantingFund[]> {
  return rows<RegrantingFund>(
    conn,
    `SELECT rf.Organization_ID AS organizationId, o.full_name AS name, rf.notes
     FROM Regranting_funds rf JOIN Organizations o ON o.ID = rf.Organization_ID ORDER BY o.full_name`,
  );
}

async function isRegrantingFund(organizationId: number, conn?: Queryable): Promise<boolean> {
  const [row] = await rows<{ n: number }>(
    conn,
    `SELECT COUNT(*) AS n FROM Regranting_funds WHERE Organization_ID = ?`,
    [organizationId],
  );
  return Number(row?.n ?? 0) > 0;
}

//endregion

//region Lines

const lineSelect = `SELECT tl.ID AS id, tl.Transfer_ID AS transferId, t.Round_ID AS roundId, r.name AS roundName,
    p.ID AS payeeId, p.name AS payeeName, ip.Payee_ID IS NOT NULL AS intermediary,
    ${isoDate("t.paid_at")} AS paidAt, t.currency AS transferCurrency,
    t.amount_foreign AS transferAmountForeign, t.fx_rate AS fxRate,
    tl.Organization_ID AS organizationId, o.full_name AS organizationName,
    tl.Project_ID AS projectId, pr.name AS projectName, tl.amount_nok AS amountNok,
    rf.Organization_ID IS NOT NULL AS regrantingFund
  FROM Regrant_transfer_lines tl
  JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
  JOIN Regrant_rounds r ON r.ID = t.Round_ID
  JOIN Payees p ON p.ID = t.Payee_ID
  LEFT JOIN Intermediary_payees ip ON ip.Payee_ID = p.ID
  JOIN Organizations o ON o.ID = tl.Organization_ID
  LEFT JOIN Projects pr ON pr.ID = tl.Project_ID
  LEFT JOIN Regranting_funds rf ON rf.Organization_ID = tl.Organization_ID`;

const mapLine = (r: any): OnwardLineRef => ({
  ...r,
  intermediary: Boolean(r.intermediary),
  regrantingFund: Boolean(r.regrantingFund),
  transferAmountForeign: trimDecimal(r.transferAmountForeign),
  fxRate: trimDecimal(r.fxRate),
  amountNok: money(r.amountNok),
});

async function getLine(id: number, conn?: Queryable): Promise<OnwardLineRef | null> {
  const [row] = await rows<any>(conn, `${lineSelect} WHERE tl.ID = ?`, [id]);
  return row ? mapLine(row) : null;
}

/** The lines of one transfer, in the order the round page shows them */
async function getTransferLines(transferId: number, conn?: Queryable): Promise<OnwardLineRef[]> {
  return (
    await rows<any>(
      conn,
      `${lineSelect} WHERE tl.Transfer_ID = ?
       ORDER BY o.full_name, tl.Project_ID IS NOT NULL, pr.name, tl.ID`,
      [transferId],
    )
  ).map(mapLine);
}

export type OnwardLineFilter = { from?: IsoDate; to?: IsoDate; payeeId?: number };

const lineFilter = (f: OnwardLineFilter) => {
  const where = ["ip.Payee_ID IS NOT NULL", "t.paid_at IS NOT NULL"];
  const params: unknown[] = [];
  if (f.from) {
    where.push("t.paid_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("t.paid_at <= ?");
    params.push(f.to);
  }
  if (f.payeeId) {
    where.push("t.Payee_ID = ?");
    params.push(f.payeeId);
  }
  return { where, params };
};

/**
 * Paid lines to intermediary payees with something not reported (awaiting or assumed), oldest
 * payment first
 */
async function getUnreportedLines(f: OnwardLineFilter, conn?: Queryable): Promise<OnwardLineRef[]> {
  const { where, params } = lineFilter(f);
  return (
    await rows<any>(
      conn,
      `${lineSelect}
       WHERE ${where.join(" AND ")}
         AND tl.amount_nok > (SELECT COALESCE(SUM(a.amount_nok), 0) FROM Onward_allocations a
                              WHERE a.Transfer_line_ID = tl.ID AND a.basis = 'reported')
       ORDER BY t.paid_at, p.name, t.ID, o.full_name, tl.ID`,
      params,
    )
  ).map(mapLine);
}

//endregion

//region Allocations

const allocationSelect = `SELECT a.ID AS id, a.Transfer_line_ID AS transferLineId, tl.Transfer_ID AS transferId,
    a.kind, a.basis, a.Organization_ID AS organizationId, o.full_name AS organizationName,
    a.External_grantee_ID AS externalGranteeId, eg.name AS externalGranteeName,
    a.Project_ID AS projectId, pr.name AS projectName, a.currency, a.amount_foreign AS amountForeign,
    a.amount_nok AS amountNok, ${isoDate("a.forwarded_at")} AS forwardedAt, a.Report_ID AS reportId,
    rep.reference AS reportReference, ${isoDate(
      "rep.reported_at",
    )} AS reportedAt, a.purpose, a.note,
    a.created_by AS createdBy, ${dbClockColumn("a.created_at", "createdAt")},
    a.updated_by AS updatedBy, ${dbClockColumn("a.updated_at", "updatedAt")}
  FROM Onward_allocations a
  JOIN Regrant_transfer_lines tl ON tl.ID = a.Transfer_line_ID
  LEFT JOIN Organizations o ON o.ID = a.Organization_ID
  LEFT JOIN External_grantees eg ON eg.ID = a.External_grantee_ID
  LEFT JOIN Projects pr ON pr.ID = a.Project_ID
  LEFT JOIN Onward_reports rep ON rep.ID = a.Report_ID`;

const mapAllocation = (r: any): OnwardAllocation => ({
  ...r,
  kind: r.kind as OnwardKind,
  basis: r.basis as OnwardBasis,
  amountForeign: trimDecimal(r.amountForeign),
  amountNok: money(r.amountNok),
});

/** Allocations of some lines, or of one report, oldest forward first */
async function listAllocations(
  f: { lineIds?: number[]; reportId?: number },
  conn?: Queryable,
): Promise<OnwardAllocation[]> {
  if (f.lineIds && f.lineIds.length === 0) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.lineIds) {
    where.push("a.Transfer_line_ID IN (?)");
    params.push(f.lineIds);
  }
  if (f.reportId !== undefined) {
    where.push("a.Report_ID = ?");
    params.push(f.reportId);
  }
  return (
    await rows<any>(
      conn,
      `${allocationSelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY a.forwarded_at, a.ID`,
      params,
    )
  ).map(mapAllocation);
}

async function getAllocation(id: number, conn?: Queryable): Promise<OnwardAllocation | null> {
  const [row] = await rows<any>(conn, `${allocationSelect} WHERE a.ID = ?`, [id]);
  return row ? mapAllocation(row) : null;
}

export type AllocationInput = {
  transferLineId: number;
  kind: OnwardKind;
  basis: OnwardBasis;
  organizationId: number | null;
  externalGranteeId: number | null;
  projectId: number | null;
  currency: string;
  amountForeign: string | null;
  amountNok: string;
  forwardedAt: IsoDate;
  reportId: number | null;
  purpose: string | null;
  note: string | null;
};

const allocationValues = (a: AllocationInput) => [
  a.kind,
  a.basis,
  a.organizationId,
  a.externalGranteeId,
  a.projectId,
  a.currency,
  a.amountForeign,
  a.amountNok,
  a.forwardedAt,
  a.reportId,
  a.purpose,
  a.note,
];

async function createAllocation(
  input: AllocationInput,
  createdBy: string,
  conn?: Queryable,
): Promise<number> {
  return (
    await exec(
      conn,
      `INSERT INTO Onward_allocations (kind, basis, Organization_ID, External_grantee_ID, Project_ID,
         currency, amount_foreign, amount_nok, forwarded_at, Report_ID, purpose, note,
         Transfer_line_ID, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...allocationValues(input), input.transferLineId, createdBy],
    )
  ).insertId;
}

async function updateAllocation(
  id: number,
  input: AllocationInput,
  updatedBy: string,
  conn?: Queryable,
): Promise<void> {
  await exec(
    conn,
    `UPDATE Onward_allocations SET kind = ?, basis = ?, Organization_ID = ?, External_grantee_ID = ?,
       Project_ID = ?, currency = ?, amount_foreign = ?, amount_nok = ?, forwarded_at = ?,
       Report_ID = ?, purpose = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE ID = ?`,
    [...allocationValues(input), updatedBy, id],
  );
}

async function deleteAllocation(id: number, conn?: Queryable): Promise<boolean> {
  return (await exec(conn, `DELETE FROM Onward_allocations WHERE ID = ?`, [id])).affectedRows === 1;
}

export type AssumedLine = {
  transferLineId: number;
  transferId: number;
  roundName: string;
  payeeName: string;
  paidAt: IsoDate;
  organizationName: string;
  projectName: string | null;
  currency: string;
  amountForeign: string | null;
  amountNok: string;
};

/**
 * The backfill (docs/regranting-downstream.md › Backfill): one `assumed` allocation per paid
 * pass-through line to an intermediary payee that has no onward allocation at all — the line's
 * recipient (and project), in full, forwarded on our paid_at, in our transfer's currency.
 * Regranting-fund lines are never assumed. Idempotent: a second run finds nothing. With
 * `dryRun`, returns what it would create and writes nothing.
 */
async function assumeMissing(
  conn: Queryable,
  f: OnwardLineFilter & { dryRun?: boolean },
  createdBy: string,
): Promise<AssumedLine[]> {
  const { where, params } = lineFilter(f);
  const candidates = await rows<any>(
    conn,
    `SELECT tl.ID AS transferLineId, tl.Transfer_ID AS transferId, r.name AS roundName,
       p.name AS payeeName, ${isoDate("t.paid_at")} AS paidAt, o.full_name AS organizationName,
       pr.name AS projectName, t.currency,
       CASE WHEN t.currency <> 'NOK' AND t.fx_rate > 0 THEN ROUND(tl.amount_nok / t.fx_rate, 2) END
         AS amountForeign,
       tl.amount_nok AS amountNok, tl.Organization_ID AS organizationId, tl.Project_ID AS projectId
     FROM Regrant_transfer_lines tl
     JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
     JOIN Regrant_rounds r ON r.ID = t.Round_ID
     JOIN Payees p ON p.ID = t.Payee_ID
     LEFT JOIN Intermediary_payees ip ON ip.Payee_ID = p.ID
     JOIN Organizations o ON o.ID = tl.Organization_ID
     LEFT JOIN Projects pr ON pr.ID = tl.Project_ID
     WHERE ${where.join(" AND ")}
       AND tl.amount_nok > 0
       AND NOT EXISTS (SELECT 1 FROM Regranting_funds rf WHERE rf.Organization_ID = tl.Organization_ID)
       AND NOT EXISTS (SELECT 1 FROM Onward_allocations a WHERE a.Transfer_line_ID = tl.ID)
     ORDER BY t.paid_at, t.ID, tl.ID
     FOR UPDATE`,
    params,
  );
  const lines: AssumedLine[] = candidates.map((c) => ({
    transferLineId: c.transferLineId,
    transferId: c.transferId,
    roundName: c.roundName,
    payeeName: c.payeeName,
    paidAt: c.paidAt,
    organizationName: c.organizationName,
    projectName: c.projectName,
    currency: c.currency,
    amountForeign: c.amountForeign === null ? null : money(c.amountForeign),
    amountNok: money(c.amountNok),
  }));
  if (f.dryRun || candidates.length === 0) return lines;
  await exec(
    conn,
    `INSERT INTO Onward_allocations (Transfer_line_ID, kind, basis, Organization_ID, Project_ID,
       currency, amount_foreign, amount_nok, forwarded_at, note, created_by) VALUES ?`,
    [
      candidates.map((c) => [
        c.transferLineId,
        "grant",
        "assumed",
        c.organizationId,
        c.projectId,
        c.currency,
        c.amountForeign,
        c.amountNok,
        c.paidAt,
        ASSUMED_NOTE,
        createdBy,
      ]),
    ],
  );
  return lines;
}

//endregion

//region Reports

const reportSelect = `SELECT rep.ID AS id, rep.Payee_ID AS payeeId, p.name AS payeeName,
    ${isoDate(
      "rep.reported_at",
    )} AS reportedAt, rep.reference, rep.notes, rep.created_by AS createdBy,
    ${dbClockColumn("rep.created_at", "createdAt")},
    (SELECT COUNT(*) FROM Onward_allocations a WHERE a.Report_ID = rep.ID) AS allocationCount,
    (SELECT COALESCE(SUM(a.amount_nok), 0) FROM Onward_allocations a WHERE a.Report_ID = rep.ID)
      AS allocationTotalNok
  FROM Onward_reports rep JOIN Payees p ON p.ID = rep.Payee_ID`;

async function loadReports(
  where: string,
  params: unknown[],
  conn?: Queryable,
): Promise<OnwardReport[]> {
  const result = await rows<any>(
    conn,
    `${reportSelect} ${where ? `WHERE ${where}` : ""} ORDER BY rep.reported_at DESC, rep.ID DESC`,
    params,
  );
  const documents = await regranting.documentsFor(
    "onwardReportId",
    result.map((r) => r.id),
    conn,
  );
  return result.map((r) => ({
    ...r,
    allocationCount: Number(r.allocationCount),
    allocationTotalNok: money(r.allocationTotalNok),
    documents: documents.get(r.id) ?? [],
  }));
}

async function listReports(f: { payeeId?: number }, conn?: Queryable): Promise<OnwardReport[]> {
  return f.payeeId ? loadReports("rep.Payee_ID = ?", [f.payeeId], conn) : loadReports("", [], conn);
}

async function getReport(id: number, conn?: Queryable): Promise<OnwardReport | null> {
  return (await loadReports("rep.ID = ?", [id], conn))[0] ?? null;
}

export type ReportInput = {
  payeeId: number;
  reportedAt: IsoDate;
  reference: string | null;
  notes: string | null;
};

async function createReport(input: ReportInput, createdBy: string): Promise<number> {
  return (
    await exec(
      undefined,
      `INSERT INTO Onward_reports (Payee_ID, reported_at, reference, notes, created_by) VALUES (?, ?, ?, ?, ?)`,
      [input.payeeId, input.reportedAt, input.reference, input.notes, createdBy],
    )
  ).insertId;
}

async function updateReport(id: number, input: ReportInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE Onward_reports SET Payee_ID = ?, reported_at = ?, reference = ?, notes = ? WHERE ID = ?`,
    [input.payeeId, input.reportedAt, input.reference, input.notes, id],
  );
}

/** Fails with MySQL 1451 while allocations point at it; its documents go with it */
async function deleteReport(id: number): Promise<boolean> {
  return (
    (await exec(undefined, `DELETE FROM Onward_reports WHERE ID = ?`, [id])).affectedRows === 1
  );
}

//endregion

//region External grantees

const granteeSelect = `SELECT eg.ID AS id, eg.name, eg.country, eg.url, eg.notes, eg.created_by AS createdBy,
    ${dbClockColumn("eg.created_at", "createdAt")},
    (SELECT COUNT(*) FROM Onward_allocations a WHERE a.External_grantee_ID = eg.ID) AS allocationCount
  FROM External_grantees eg`;

const mapGrantee = (r: any): ExternalGrantee => ({
  ...r,
  allocationCount: Number(r.allocationCount),
});

async function listGrantees(): Promise<ExternalGrantee[]> {
  return (await rows<any>(undefined, `${granteeSelect} ORDER BY eg.name`)).map(mapGrantee);
}

async function getGrantee(id: number, conn?: Queryable): Promise<ExternalGrantee | null> {
  const [row] = await rows<any>(conn, `${granteeSelect} WHERE eg.ID = ?`, [id]);
  return row ? mapGrantee(row) : null;
}

async function getGranteeByName(name: string): Promise<ExternalGrantee | null> {
  const [row] = await rows<any>(undefined, `${granteeSelect} WHERE eg.name = ?`, [name]);
  return row ? mapGrantee(row) : null;
}

export type GranteeInput = {
  name: string;
  country: string | null;
  url: string | null;
  notes: string | null;
};

async function createGrantee(input: GranteeInput, createdBy: string): Promise<number> {
  return (
    await exec(
      undefined,
      `INSERT INTO External_grantees (name, country, url, notes, created_by) VALUES (?, ?, ?, ?, ?)`,
      [input.name, input.country, input.url, input.notes, createdBy],
    )
  ).insertId;
}

async function updateGrantee(id: number, input: GranteeInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE External_grantees SET name = ?, country = ?, url = ?, notes = ? WHERE ID = ?`,
    [input.name, input.country, input.url, input.notes, id],
  );
}

/** Fails with MySQL 1451 while allocations point at it */
async function deleteGrantee(id: number): Promise<boolean> {
  return (
    (await exec(undefined, `DELETE FROM External_grantees WHERE ID = ?`, [id])).affectedRows === 1
  );
}

//endregion

export const regrantingOnward = {
  listIntermediaries,
  listRegrantingFunds,
  isRegrantingFund,
  getLine,
  getTransferLines,
  getUnreportedLines,
  listAllocations,
  getAllocation,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  assumeMissing,
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  listGrantees,
  getGrantee,
  getGranteeByName,
  createGrantee,
  updateGrantee,
  deleteGrantee,
};
