import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { DAO } from "../DAO";
import { dbClockColumn } from "../osloDays";
import type {
  AdjustmentType,
  Adjustment,
  BalanceRow,
  FrontedEntry,
  Fund,
  FundGrant,
  FundGrantLine,
  Hold,
  IsoDate,
  LastTransfer,
  OrganizationRef,
  PaidBy,
  Payee,
  PayeeRef,
  PayeeRouting,
  Project,
  RegrantDocument,
  RegrantDocumentParent,
  ProjectStatus,
  Round,
  RoundBalanceSnapshot,
  RoundKind,
  RoundStatus,
  RoundSummary,
  StatementEntryKind,
  Transfer,
  TransferLine,
  Unassigned,
} from "../regranting/types";

/**
 * Regranting tables (docs/regranting.md). Allocations come from the Regrant_allocations view and
 * are never stored. Balances are computed by getBalances.
 *
 * Writes that must be atomic take a `conn` from inTransaction; everything else uses the pool.
 */

/** Anything with mysql2's query(sql, params) */
export type Queryable = Pick<PoolConnection, "query">;

const pool = (): Queryable => ({
  query: (sql: any, params?: any) => DAO.query(sql, params) as any,
});
const db = (conn?: Queryable) => conn ?? pool();

async function rows<T>(conn: Queryable | undefined, sql: string, params: unknown[] = []) {
  const [result] = await db(conn).query(sql, params);
  return result as unknown as T[];
}

async function exec(conn: Queryable | undefined, sql: string, params: unknown[] = []) {
  const [result] = await db(conn).query(sql, params);
  return result as unknown as ResultSetHeader;
}

/** Runs fn in a transaction; commits if it resolves, rolls back if it throws */
async function inTransaction<T>(fn: (conn: Queryable) => Promise<T>): Promise<T> {
  const conn = await DAO.startTransaction();
  try {
    const result = await fn(conn);
    await DAO.commitTransaction(conn);
    return result;
  } catch (ex) {
    await DAO.rollbackTransaction(conn);
    throw ex;
  }
}

const isoDate = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;
const money = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? "0.00" : fixed2(String(value));

/** Formats a decimal string from MySQL with exactly two decimals, without float rounding */
function fixed2(value: string): string {
  const negative = value.startsWith("-");
  const [int, frac = ""] = (negative ? value.slice(1) : value).split(".");
  if (frac.length > 2) {
    // Values from ROUND(x, 2) already have at most 2 decimals; anything longer is rounded here
    const n = Math.round(Number(value) * 100) / 100;
    return n.toFixed(2) === "-0.00" ? "0.00" : n.toFixed(2);
  }
  const out = `${int || "0"}.${frac.padEnd(2, "0")}`;
  return negative && out !== "0.00" ? `-${out}` : out;
}
const moneyOrNull = (value: string | null): string | null => (value === null ? null : money(value));

//region Organizations

async function getOrganizations(conn?: Queryable): Promise<OrganizationRef[]> {
  const result = await rows<any>(
    conn,
    `SELECT ID AS id, full_name AS name, abbriv, is_active AS isActive, ordering
     FROM Organizations ORDER BY ordering IS NULL, ordering, ID`,
  );
  return result.map((r) => ({ ...r, isActive: Boolean(r.isActive) }));
}

async function organizationExists(id: number): Promise<boolean> {
  const result = await rows<any>(undefined, `SELECT 1 FROM Organizations WHERE ID = ?`, [id]);
  return result.length > 0;
}

/** Donation ids among `ids` that exist */
async function existingDonationIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const result = await rows<{ ID: number }>(undefined, `SELECT ID FROM Donations WHERE ID IN (?)`, [
    ids,
  ]);
  return result.map((r) => r.ID);
}

//endregion

//region Ledger

export type BalanceQuery = {
  /** Entries dated on or before this day count */
  at: IsoDate;
  /** Only these recipients (all if omitted) */
  organizationIds?: number[];
  /** Leave this round's transfer lines, fund grants and adjustments out of everything (the round being built) */
  excludeRoundId?: number;
  /** inflowSince = allocations dated after this day (all allocations up to `at` if null) */
  inflowSince?: IsoDate | null;
};

/**
 * Balances per (recipient, project) at a date, from one grouped UNION ALL over the entry
 * sources. Only entries in effect count:
 * - allocations (as in the Regrant_allocations view) by timestamp_confirmed (UTC day) on or
 *   before `at`;
 * - fund grant lines of approved and paid rounds, dated at the round's cutoff (fund +, fund −);
 * - transfer lines of paid rounds, dated at the transfer's paid_at;
 * - adjustments by effective_at, except `fronted`, which are records only. An adjustment
 *   attached to a round counts only once that round is approved (like its fund grant lines), so
 *   an earmark made in a draft doesn't move balances until the round is approved.
 * Also returned, outside the balance: transfer lines of approved, unpaid rounds (`committed`)
 * and debits of paid/approved rounds dated after `at` (`laterDebits`: transfer lines, fund grants
 * out, and the rounds' adjustments negated), so a round built with an earlier cutoff never pays
 * what a later round already paid or earmarked.
 *
 * `excludeRoundId` leaves that round's transfer lines, fund grants and adjustments out: the
 * round builder adds them back as the round's own figures.
 *
 * Rows where every figure is zero may be returned; callers filter.
 */
async function getBalances(query: BalanceQuery, conn?: Queryable): Promise<BalanceRow[]> {
  const orgs = query.organizationIds;
  if (orgs && orgs.length === 0) return [];
  const exclude = query.excludeRoundId ?? 0;
  const orgFilter = (column: string) => (orgs ? `AND ${column} IN (?)` : "");
  const orgParam = orgs ? [orgs] : [];
  const at = query.at;
  const inflowSince = query.inflowSince ?? "0001-01-01";

  const sql = `
    SELECT e.Organization_ID AS organizationId,
           e.Project_ID AS projectId,
           ROUND(SUM(CASE WHEN e.kind = 'opening' THEN e.amount ELSE 0 END), 2) AS opening,
           ROUND(SUM(CASE WHEN e.kind = 'allocation' THEN e.amount ELSE 0 END), 2) AS allocations,
           ROUND(SUM(CASE WHEN e.kind = 'fund_grant_in' THEN e.amount ELSE 0 END), 2) AS fundGrantsIn,
           ROUND(SUM(CASE WHEN e.kind = 'fund_grant_out' THEN e.amount ELSE 0 END), 2) AS fundGrantsOut,
           ROUND(SUM(CASE WHEN e.kind = 'transfer' THEN e.amount ELSE 0 END), 2) AS transfers,
           ROUND(SUM(CASE WHEN e.kind = 'adjustment' THEN e.amount ELSE 0 END), 2) AS adjustments,
           ROUND(SUM(CASE WHEN e.kind = 'committed' THEN e.amount ELSE 0 END), 2) AS committed,
           ROUND(SUM(CASE WHEN e.kind = 'later_debit' THEN e.amount ELSE 0 END), 2) AS laterDebits,
           ROUND(SUM(e.inflow), 2) AS inflowSince
    FROM (
      -- Allocations: the same as summing Regrant_allocations (keep the filters in step with the
      -- view), but donations are summed per KID before the split is applied, which halves the
      -- time on production-sized data. The split is linear, so the result is identical.
      SELECT dcao.Organization_ID, NULL AS Project_ID, 'allocation' AS kind,
             SUM(k.amount * dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS amount,
             SUM(k.recent * dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS inflow
      FROM (
        SELECT d.KID_fordeling, SUM(d.sum_confirmed) AS amount,
               SUM(CASE WHEN d.timestamp_confirmed >= DATE_ADD(?, INTERVAL 1 DAY) THEN d.sum_confirmed ELSE 0 END) AS recent
        FROM Donations d
        WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
        GROUP BY d.KID_fordeling
      ) k
      JOIN Distribution_cause_areas dca ON dca.Distribution_KID = k.KID_fordeling
      JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
      WHERE TRUE ${orgFilter("dcao.Organization_ID")}
      GROUP BY dcao.Organization_ID

      UNION ALL
      SELECT l.Organization_ID, l.Project_ID, 'fund_grant_in', l.amount, 0
      FROM Fund_grant_lines l
      JOIN Fund_grants g ON g.ID = l.Fund_grant_ID
      JOIN Regrant_rounds r ON r.ID = g.Round_ID
      WHERE r.status IN ('approved', 'paid') AND r.cutoff <= ? AND r.ID <> ? ${orgFilter(
        "l.Organization_ID",
      )}

      UNION ALL
      SELECT g.Fund_ID, NULL,
             CASE WHEN r.cutoff <= ? THEN 'fund_grant_out' ELSE 'later_debit' END,
             CASE WHEN r.cutoff <= ? THEN -l.amount ELSE l.amount END, 0
      FROM Fund_grant_lines l
      JOIN Fund_grants g ON g.ID = l.Fund_grant_ID
      JOIN Regrant_rounds r ON r.ID = g.Round_ID
      WHERE r.status IN ('approved', 'paid') AND r.ID <> ? ${orgFilter("g.Fund_ID")}

      UNION ALL
      SELECT tl.Organization_ID, tl.Project_ID,
             CASE WHEN r.status = 'approved' THEN 'committed'
                  WHEN t.paid_at <= ? THEN 'transfer'
                  ELSE 'later_debit' END,
             CASE WHEN r.status = 'paid' AND t.paid_at <= ? THEN -tl.amount_nok ELSE tl.amount_nok END,
             0
      FROM Regrant_transfer_lines tl
      JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
      JOIN Regrant_rounds r ON r.ID = t.Round_ID
      WHERE r.status IN ('approved', 'paid') AND r.ID <> ? ${orgFilter("tl.Organization_ID")}

      UNION ALL
      SELECT adj.Organization_ID, adj.Project_ID,
             CASE WHEN adj.effective_at > ? THEN 'later_debit'
                  WHEN adj.type = 'opening' THEN 'opening' ELSE 'adjustment' END,
             CASE WHEN adj.effective_at > ? THEN -adj.amount ELSE adj.amount END,
             0
      FROM Regrant_adjustments adj
      LEFT JOIN Regrant_rounds ar ON ar.ID = adj.Round_ID
      WHERE adj.type <> 'fronted'
        AND ((adj.Round_ID IS NULL AND adj.effective_at <= ?)
             OR (ar.status IN ('approved', 'paid') AND ar.ID <> ?))
        ${orgFilter("adj.Organization_ID")}
    ) e
    GROUP BY e.Organization_ID, e.Project_ID
    ORDER BY e.Organization_ID, e.Project_ID IS NOT NULL, e.Project_ID`;

  const params = [
    inflowSince,
    at,
    ...orgParam,
    // fund grants in
    at,
    exclude,
    ...orgParam,
    // fund grants out
    at,
    at,
    exclude,
    ...orgParam,
    // transfer lines
    at,
    at,
    exclude,
    ...orgParam,
    // adjustments
    at,
    at,
    at,
    exclude,
    ...orgParam,
  ];
  const result = await rows<any>(conn, sql, params);
  return result.map((r) => ({
    organizationId: r.organizationId,
    projectId: r.projectId,
    opening: money(r.opening),
    allocations: money(r.allocations),
    fundGrantsIn: money(r.fundGrantsIn),
    fundGrantsOut: money(r.fundGrantsOut),
    transfers: money(r.transfers),
    adjustments: money(r.adjustments),
    committed: money(r.committed),
    laterDebits: money(r.laterDebits),
    inflowSince: money(r.inflowSince),
  }));
}

/**
 * Donations up to `at` (payments 15/16 excluded) whose KID has no split: "Unassigned". Summed per
 * KID first (from the covering KidTimestampPaymentSum index), so the split is looked up once per
 * KID rather than once per donation.
 */
async function getUnassigned(at: IsoDate): Promise<Unassigned> {
  const [row] = await rows<any>(
    undefined,
    `SELECT COALESCE(SUM(k.donationCount), 0) AS donationCount, ROUND(COALESCE(SUM(k.amount), 0), 2) AS amount
     FROM (
       SELECT d.KID_fordeling, COUNT(*) AS donationCount, SUM(d.sum_confirmed) AS amount
       FROM Donations d
       WHERE d.Payment_ID NOT IN (15, 16)
         AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY d.KID_fordeling
     ) k
     WHERE NOT EXISTS (
       SELECT 1 FROM Distribution_cause_areas dca
       JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
       WHERE dca.Distribution_KID = k.KID_fordeling)`,
    [at],
  );
  return { amount: money(row.amount), donationCount: Number(row.donationCount) };
}

/** Each recipient's latest paid transfer on or before `at` */
async function getLastTransfers(at: IsoDate): Promise<LastTransfer[]> {
  const result = await rows<any>(
    undefined,
    `SELECT organizationId, transferId, roundId, roundName, paidAt, amountNok FROM (
       SELECT tl.Organization_ID AS organizationId, t.ID AS transferId, r.ID AS roundId,
              r.name AS roundName, ${isoDate(
                "t.paid_at",
              )} AS paidAt, SUM(tl.amount_nok) AS amountNok,
              ROW_NUMBER() OVER (PARTITION BY tl.Organization_ID ORDER BY t.paid_at DESC, t.ID DESC) AS rn
       FROM Regrant_transfer_lines tl
       JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
       JOIN Regrant_rounds r ON r.ID = t.Round_ID
       WHERE r.status = 'paid' AND t.paid_at <= ?
       GROUP BY tl.Organization_ID, t.ID, r.ID, r.name, t.paid_at
     ) x WHERE rn = 1`,
    [at],
  );
  return result.map((r) => ({ ...r, amountNok: money(r.amountNok) }));
}

/** Allocations and positive adjustments (in effect) to a recipient in (from, at]: recent inflow */
async function getInflowBetween(
  organizationId: number,
  fromExclusive: IsoDate,
  at: IsoDate,
): Promise<string> {
  const [row] = await rows<any>(
    undefined,
    `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS amount FROM (
       SELECT a.amount FROM Regrant_allocations a
       WHERE a.Organization_ID = ? AND a.timestamp_confirmed >= DATE_ADD(?, INTERVAL 1 DAY)
         AND a.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
       UNION ALL
       SELECT adj.amount FROM Regrant_adjustments adj
       LEFT JOIN Regrant_rounds ar ON ar.ID = adj.Round_ID
       WHERE adj.Organization_ID = ? AND adj.type <> 'fronted' AND adj.amount > 0
         AND (adj.Round_ID IS NULL OR ar.status IN ('approved', 'paid'))
         AND adj.effective_at > ? AND adj.effective_at <= ?
     ) x`,
    [organizationId, fromExclusive, at, organizationId, fromExclusive, at],
  );
  return money(row.amount);
}

/** The latest approved or paid round of a kind with cutoff on or before `at` */
async function getLatestRound(
  at: IsoDate,
  kind: RoundKind = "regular",
): Promise<{ id: number; name: string; cutoff: IsoDate } | null> {
  const [row] = await rows<any>(
    undefined,
    `SELECT ID AS id, name, ${isoDate("cutoff")} AS cutoff FROM Regrant_rounds
     WHERE status IN ('approved', 'paid') AND kind = ? AND cutoff <= ?
     ORDER BY cutoff DESC, ID DESC LIMIT 1`,
    [kind, at],
  );
  return row ?? null;
}

/** Fronted adjustments effective on or before `at`, with whether their donation has arrived */
async function getFronted(at: IsoDate, organizationIds?: number[]): Promise<FrontedEntry[]> {
  if (organizationIds && organizationIds.length === 0) return [];
  const result = await rows<any>(
    undefined,
    `SELECT adj.ID AS adjustmentId, adj.Organization_ID AS organizationId, adj.Project_ID AS projectId,
            adj.amount, ${isoDate("adj.effective_at")} AS effectiveAt, adj.Round_ID AS roundId,
            adj.linked_donation_ID AS linkedDonationId,
            (d.ID IS NOT NULL AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)) AS offset
     FROM Regrant_adjustments adj
     LEFT JOIN Donations d ON d.ID = adj.linked_donation_ID
     WHERE adj.type = 'fronted' AND adj.effective_at <= ?
       ${organizationIds ? "AND adj.Organization_ID IN (?)" : ""}
     ORDER BY adj.effective_at, adj.ID`,
    organizationIds ? [at, at, organizationIds] : [at, at],
  );
  return result.map((r) => ({ ...r, amount: money(r.amount), offset: Boolean(r.offset) }));
}

//endregion

//region Payees and routing

const payeeColumns = `ID AS id, name, currency, bank_account AS bankAccount, iban, swift, wallet,
  payment_reference_template AS paymentReferenceTemplate, is_active AS isActive, ${dbClockColumn(
    "created_at",
    "createdAt",
  )}`;
const mapPayee = (r: any): Payee => ({ ...r, isActive: Boolean(r.isActive) });

export type PayeeInput = {
  name: string;
  currency: string;
  bankAccount: string | null;
  iban: string | null;
  swift: string | null;
  wallet: string | null;
  paymentReferenceTemplate: string | null;
  isActive: boolean;
};

async function listPayees(): Promise<Payee[]> {
  return (await rows<any>(undefined, `SELECT ${payeeColumns} FROM Payees ORDER BY name, ID`)).map(
    mapPayee,
  );
}

async function getPayee(id: number, conn?: Queryable): Promise<Payee | null> {
  const [row] = await rows<any>(conn, `SELECT ${payeeColumns} FROM Payees WHERE ID = ?`, [id]);
  return row ? mapPayee(row) : null;
}

const payeeValues = (p: PayeeInput) => [
  p.name,
  p.currency,
  p.bankAccount,
  p.iban,
  p.swift,
  p.wallet,
  p.paymentReferenceTemplate,
  p.isActive,
];

async function createPayee(input: PayeeInput): Promise<number> {
  const result = await exec(
    undefined,
    `INSERT INTO Payees (name, currency, bank_account, iban, swift, wallet, payment_reference_template, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    payeeValues(input),
  );
  return result.insertId;
}

async function updatePayee(id: number, input: PayeeInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE Payees SET name = ?, currency = ?, bank_account = ?, iban = ?, swift = ?, wallet = ?,
       payment_reference_template = ?, is_active = ? WHERE ID = ?`,
    [...payeeValues(input), id],
  );
}

async function deletePayee(id: number): Promise<boolean> {
  return (await exec(undefined, `DELETE FROM Payees WHERE ID = ?`, [id])).affectedRows === 1;
}

const routingSelect = `SELECT op.ID AS id, op.Organization_ID AS organizationId, o.full_name AS organizationName,
    op.Payee_ID AS payeeId, p.name AS payeeName, ${isoDate("op.valid_from")} AS validFrom,
    ${isoDate("op.valid_to")} AS validTo
  FROM Organization_payees op
  JOIN Organizations o ON o.ID = op.Organization_ID
  JOIN Payees p ON p.ID = op.Payee_ID`;

async function listRoutings(filter: {
  organizationId?: number;
  payeeId?: number;
}): Promise<PayeeRouting[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.organizationId !== undefined) {
    where.push("op.Organization_ID = ?");
    params.push(filter.organizationId);
  }
  if (filter.payeeId !== undefined) {
    where.push("op.Payee_ID = ?");
    params.push(filter.payeeId);
  }
  return rows<PayeeRouting>(
    undefined,
    `${routingSelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.full_name, op.valid_from`,
    params,
  );
}

async function getRouting(id: number): Promise<PayeeRouting | null> {
  const [row] = await rows<PayeeRouting>(undefined, `${routingSelect} WHERE op.ID = ?`, [id]);
  return row ?? null;
}

/** Routings of the organization overlapping [validFrom, validTo], other than `exceptId` */
async function overlappingRoutings(
  organizationId: number,
  validFrom: IsoDate,
  validTo: IsoDate | null,
  exceptId = 0,
): Promise<PayeeRouting[]> {
  return rows<PayeeRouting>(
    undefined,
    `${routingSelect}
     WHERE op.Organization_ID = ? AND op.ID <> ?
       AND (op.valid_to IS NULL OR op.valid_to >= ?)
       AND (? IS NULL OR op.valid_from <= ?)`,
    [organizationId, exceptId, validFrom, validTo, validTo],
  );
}

export type RoutingInput = {
  organizationId: number;
  payeeId: number;
  validFrom: IsoDate;
  validTo: IsoDate | null;
};

async function createRouting(input: RoutingInput): Promise<number> {
  return (
    await exec(
      undefined,
      `INSERT INTO Organization_payees (Organization_ID, Payee_ID, valid_from, valid_to) VALUES (?, ?, ?, ?)`,
      [input.organizationId, input.payeeId, input.validFrom, input.validTo],
    )
  ).insertId;
}

async function updateRouting(id: number, input: RoutingInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE Organization_payees SET Organization_ID = ?, Payee_ID = ?, valid_from = ?, valid_to = ? WHERE ID = ?`,
    [input.organizationId, input.payeeId, input.validFrom, input.validTo, id],
  );
}

async function deleteRouting(id: number): Promise<boolean> {
  return (
    (await exec(undefined, `DELETE FROM Organization_payees WHERE ID = ?`, [id])).affectedRows === 1
  );
}

/** The payee each recipient is routed to on a day (recipients without a routing are absent) */
async function getPayeesAt(at: IsoDate): Promise<Map<number, PayeeRef>> {
  const result = await rows<any>(
    undefined,
    `SELECT op.Organization_ID AS organizationId, p.ID AS id, p.name, p.currency
     FROM Organization_payees op JOIN Payees p ON p.ID = op.Payee_ID
     WHERE op.valid_from <= ? AND (op.valid_to IS NULL OR op.valid_to >= ?)
     ORDER BY op.valid_from`,
    [at, at],
  );
  return new Map(
    result.map((r) => [r.organizationId, { id: r.id, name: r.name, currency: r.currency }]),
  );
}

//endregion

//region Projects

const projectSelect = `SELECT pr.ID AS id, pr.Organization_ID AS organizationId, o.full_name AS organizationName,
    pr.name, pr.description, pr.country, ${isoDate("pr.start_date")} AS startDate,
    ${isoDate("pr.end_date")} AS endDate, pr.status, pr.agreement_ref AS agreementRef,
    ${isoDate("pr.report_due")} AS reportDue, pr.documents_url AS documentsUrl, ${dbClockColumn(
  "pr.created_at",
  "createdAt",
)}
  FROM Projects pr JOIN Organizations o ON o.ID = pr.Organization_ID`;

export type ProjectInput = {
  organizationId: number;
  name: string;
  description: string | null;
  country: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: ProjectStatus;
  agreementRef: string | null;
  reportDue: IsoDate | null;
  documentsUrl: string | null;
};

async function listProjects(filter: {
  organizationId?: number;
  statuses?: ProjectStatus[];
}): Promise<Project[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.organizationId !== undefined) {
    where.push("pr.Organization_ID = ?");
    params.push(filter.organizationId);
  }
  if (filter.statuses?.length) {
    where.push("pr.status IN (?)");
    params.push(filter.statuses);
  }
  return rows<Project>(
    undefined,
    `${projectSelect} ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY o.full_name, pr.name`,
    params,
  );
}

async function getProject(id: number, conn?: Queryable): Promise<Project | null> {
  const [row] = await rows<Project>(conn, `${projectSelect} WHERE pr.ID = ?`, [id]);
  return row ?? null;
}

/** Project id → organization id, for the given projects */
async function getProjectOrganizations(
  ids: number[],
  conn?: Queryable,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const result = await rows<any>(conn, `SELECT ID, Organization_ID FROM Projects WHERE ID IN (?)`, [
    ids,
  ]);
  return new Map(result.map((r) => [r.ID, r.Organization_ID]));
}

/** Project id → name for all projects */
async function getProjectNames(): Promise<Map<number, { name: string; status: ProjectStatus }>> {
  const result = await rows<any>(undefined, `SELECT ID, name, status FROM Projects`);
  return new Map(result.map((r) => [r.ID, { name: r.name, status: r.status }]));
}

const projectValues = (p: ProjectInput) => [
  p.organizationId,
  p.name,
  p.description,
  p.country,
  p.startDate,
  p.endDate,
  p.status,
  p.agreementRef,
  p.reportDue,
  p.documentsUrl,
];

async function createProject(input: ProjectInput): Promise<number> {
  return (
    await exec(
      undefined,
      `INSERT INTO Projects (Organization_ID, name, description, country, start_date, end_date, status,
         agreement_ref, report_due, documents_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectValues(input),
    )
  ).insertId;
}

async function updateProject(id: number, input: ProjectInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE Projects SET Organization_ID = ?, name = ?, description = ?, country = ?, start_date = ?,
       end_date = ?, status = ?, agreement_ref = ?, report_due = ?, documents_url = ? WHERE ID = ?`,
    [...projectValues(input), id],
  );
}

async function deleteProject(id: number): Promise<boolean> {
  return (await exec(undefined, `DELETE FROM Projects WHERE ID = ?`, [id])).affectedRows === 1;
}

/** Whether any ledger entry or line points at the project (moving it to another recipient would change balances) */
async function projectHasEntries(id: number): Promise<boolean> {
  const [row] = await rows<any>(
    undefined,
    `SELECT EXISTS(SELECT 1 FROM Regrant_transfer_lines WHERE Project_ID = ?)
         OR EXISTS(SELECT 1 FROM Fund_grant_lines WHERE Project_ID = ?)
         OR EXISTS(SELECT 1 FROM Regrant_adjustments WHERE Project_ID = ?) AS used`,
    [id, id, id],
  );
  return Boolean(row.used);
}

export type ProjectTransferLine = {
  lineId: number;
  transferId: number;
  roundId: number;
  roundName: string;
  roundStatus: RoundStatus;
  payee: PayeeRef;
  paidAt: IsoDate | null;
  amountNok: string;
};

export type ProjectFundGrantLine = {
  lineId: number;
  fundGrantId: number;
  fundId: number;
  fundName: string;
  roundId: number;
  roundName: string;
  roundStatus: RoundStatus;
  cutoff: IsoDate;
  rationale: string;
  amount: string;
};

async function getProjectLines(projectId: number): Promise<{
  transferLines: ProjectTransferLine[];
  fundGrantLines: ProjectFundGrantLine[];
}> {
  const transferLines = await rows<any>(
    undefined,
    `SELECT tl.ID AS lineId, t.ID AS transferId, r.ID AS roundId, r.name AS roundName, r.status AS roundStatus,
            p.ID AS payeeId, p.name AS payeeName, p.currency AS payeeCurrency,
            ${isoDate("t.paid_at")} AS paidAt, tl.amount_nok AS amountNok
     FROM Regrant_transfer_lines tl
     JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
     JOIN Regrant_rounds r ON r.ID = t.Round_ID
     JOIN Payees p ON p.ID = t.Payee_ID
     WHERE tl.Project_ID = ?
     ORDER BY r.cutoff, t.ID, tl.ID`,
    [projectId],
  );
  const fundGrantLines = await rows<any>(
    undefined,
    `SELECT l.ID AS lineId, g.ID AS fundGrantId, g.Fund_ID AS fundId, o.full_name AS fundName,
            r.ID AS roundId, r.name AS roundName, r.status AS roundStatus, ${isoDate(
              "r.cutoff",
            )} AS cutoff,
            g.rationale, l.amount
     FROM Fund_grant_lines l
     JOIN Fund_grants g ON g.ID = l.Fund_grant_ID
     JOIN Regrant_rounds r ON r.ID = g.Round_ID
     JOIN Organizations o ON o.ID = g.Fund_ID
     WHERE l.Project_ID = ?
     ORDER BY r.cutoff, g.ID, l.ID`,
    [projectId],
  );
  return {
    transferLines: transferLines.map((r) => ({
      lineId: r.lineId,
      transferId: r.transferId,
      roundId: r.roundId,
      roundName: r.roundName,
      roundStatus: r.roundStatus,
      payee: { id: r.payeeId, name: r.payeeName, currency: r.payeeCurrency },
      paidAt: r.paidAt,
      amountNok: money(r.amountNok),
    })),
    fundGrantLines: fundGrantLines.map((r) => ({ ...r, amount: money(r.amount) })),
  };
}

//endregion

//region Funds

async function listFunds(conn?: Queryable): Promise<Fund[]> {
  return rows<Fund>(
    conn,
    `SELECT f.Organization_ID AS organizationId, o.full_name AS name, o.abbriv, f.max_hold_days AS maxHoldDays
     FROM Funds f JOIN Organizations o ON o.ID = f.Organization_ID ORDER BY o.full_name`,
  );
}

async function getFund(organizationId: number): Promise<Fund | null> {
  const [row] = await rows<Fund>(
    undefined,
    `SELECT f.Organization_ID AS organizationId, o.full_name AS name, o.abbriv, f.max_hold_days AS maxHoldDays
     FROM Funds f JOIN Organizations o ON o.ID = f.Organization_ID WHERE f.Organization_ID = ?`,
    [organizationId],
  );
  return row ?? null;
}

async function createFund(organizationId: number, maxHoldDays: number | null): Promise<void> {
  await exec(undefined, `INSERT INTO Funds (Organization_ID, max_hold_days) VALUES (?, ?)`, [
    organizationId,
    maxHoldDays,
  ]);
}

async function updateFund(organizationId: number, maxHoldDays: number | null): Promise<void> {
  await exec(undefined, `UPDATE Funds SET max_hold_days = ? WHERE Organization_ID = ?`, [
    maxHoldDays,
    organizationId,
  ]);
}

async function deleteFund(organizationId: number): Promise<boolean> {
  return (
    (await exec(undefined, `DELETE FROM Funds WHERE Organization_ID = ?`, [organizationId]))
      .affectedRows === 1
  );
}

//endregion

//region Holds

const holdSelect = `SELECT ID AS id, Organization_ID AS organizationId, Project_ID AS projectId, reason,
  ${isoDate("until")} AS until, created_by AS createdBy, ${dbClockColumn(
  "created_at",
  "createdAt",
)} FROM Regrant_holds`;

export type HoldInput = {
  organizationId: number;
  projectId: number | null;
  reason: string;
  until: IsoDate | null;
};

/** All holds, or those active on `activeAt` (until null or on/after it) */
async function listHolds(
  filter: { activeAt?: IsoDate; organizationId?: number } = {},
): Promise<Hold[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.activeAt !== undefined) {
    where.push("(until IS NULL OR until >= ?)");
    params.push(filter.activeAt);
  }
  if (filter.organizationId !== undefined) {
    where.push("Organization_ID = ?");
    params.push(filter.organizationId);
  }
  return rows<Hold>(
    undefined,
    `${holdSelect} ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY Organization_ID, ID`,
    params,
  );
}

async function getHold(id: number): Promise<Hold | null> {
  const [row] = await rows<Hold>(undefined, `${holdSelect} WHERE ID = ?`, [id]);
  return row ?? null;
}

async function createHold(input: HoldInput, createdBy: string): Promise<number> {
  return (
    await exec(
      undefined,
      `INSERT INTO Regrant_holds (Organization_ID, Project_ID, reason, until, created_by) VALUES (?, ?, ?, ?, ?)`,
      [input.organizationId, input.projectId, input.reason, input.until, createdBy],
    )
  ).insertId;
}

async function updateHold(id: number, input: HoldInput): Promise<void> {
  await exec(
    undefined,
    `UPDATE Regrant_holds SET Organization_ID = ?, Project_ID = ?, reason = ?, until = ? WHERE ID = ?`,
    [input.organizationId, input.projectId, input.reason, input.until, id],
  );
}

async function deleteHold(id: number): Promise<boolean> {
  return (await exec(undefined, `DELETE FROM Regrant_holds WHERE ID = ?`, [id])).affectedRows === 1;
}

//endregion

//region Rounds

const roundColumns = (alias = "r") => `${alias}.ID AS id, ${alias}.name, ${alias}.kind,
  ${isoDate(`${alias}.cutoff`)} AS cutoff, ${alias}.status, ${alias}.min_transfer AS minTransfer,
  ${alias}.created_by AS createdBy, ${dbClockColumn(`${alias}.created_at`, "createdAt")},
  ${alias}.approved_by AS approvedBy, ${dbClockColumn(
  `${alias}.approved_at`,
  "approvedAt",
)}, ${isoDate(`${alias}.paid_at`)} AS paidAt`;
const mapRound = (r: any): Round => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  cutoff: r.cutoff,
  status: r.status,
  minTransfer: money(r.minTransfer),
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  approvedBy: r.approvedBy,
  approvedAt: r.approvedAt,
  paidAt: r.paidAt,
});

async function getRound(id: number, conn?: Queryable): Promise<Round | null> {
  const [row] = await rows<any>(
    conn,
    `SELECT ${roundColumns()} FROM Regrant_rounds r WHERE r.ID = ?`,
    [id],
  );
  return row ? mapRound(row) : null;
}

/** Locks the round row for the rest of the transaction and returns it */
async function lockRound(conn: Queryable, id: number): Promise<Round | null> {
  const [row] = await rows<any>(
    conn,
    `SELECT ${roundColumns()} FROM Regrant_rounds r WHERE r.ID = ? FOR UPDATE`,
    [id],
  );
  return row ? mapRound(row) : null;
}

async function listRounds(filter: {
  statuses?: RoundStatus[];
  kinds?: RoundKind[];
}): Promise<RoundSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.statuses?.length) {
    where.push("r.status IN (?)");
    params.push(filter.statuses);
  }
  if (filter.kinds?.length) {
    where.push("r.kind IN (?)");
    params.push(filter.kinds);
  }
  const result = await rows<any>(
    undefined,
    `SELECT ${roundColumns()},
       (SELECT COALESCE(SUM(t.amount_nok), 0) FROM Regrant_transfers t WHERE t.Round_ID = r.ID) AS totalNok,
       (SELECT COUNT(*) FROM Regrant_transfers t WHERE t.Round_ID = r.ID) AS transferCount,
       (SELECT COUNT(*) FROM Fund_grants g WHERE g.Round_ID = r.ID) AS fundGrantCount,
       (SELECT COALESCE(SUM(l.amount), 0) FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID
         WHERE g.Round_ID = r.ID) AS fundGrantTotal
     FROM Regrant_rounds r
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.cutoff DESC, r.ID DESC`,
    params,
  );
  return result.map((r) => ({
    ...mapRound(r),
    totalNok: money(r.totalNok),
    transferCount: Number(r.transferCount),
    fundGrantCount: Number(r.fundGrantCount),
    fundGrantTotal: money(r.fundGrantTotal),
  }));
}

async function getRoundSummary(id: number): Promise<RoundSummary | null> {
  // listRounds has no id filter; the round count is small, but keep it one query
  const result = await rows<any>(
    undefined,
    `SELECT ${roundColumns()},
       (SELECT COALESCE(SUM(t.amount_nok), 0) FROM Regrant_transfers t WHERE t.Round_ID = r.ID) AS totalNok,
       (SELECT COUNT(*) FROM Regrant_transfers t WHERE t.Round_ID = r.ID) AS transferCount,
       (SELECT COUNT(*) FROM Fund_grants g WHERE g.Round_ID = r.ID) AS fundGrantCount,
       (SELECT COALESCE(SUM(l.amount), 0) FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID
         WHERE g.Round_ID = r.ID) AS fundGrantTotal
     FROM Regrant_rounds r WHERE r.ID = ?`,
    [id],
  );
  const r = result[0];
  return r
    ? {
        ...mapRound(r),
        totalNok: money(r.totalNok),
        transferCount: Number(r.transferCount),
        fundGrantCount: Number(r.fundGrantCount),
        fundGrantTotal: money(r.fundGrantTotal),
      }
    : null;
}

export type RoundInput = { name: string; kind: RoundKind; cutoff: IsoDate; minTransfer: number };

async function createRound(conn: Queryable, input: RoundInput, createdBy: string): Promise<number> {
  return (
    await exec(
      conn,
      `INSERT INTO Regrant_rounds (name, kind, cutoff, min_transfer, created_by) VALUES (?, ?, ?, ?, ?)`,
      [input.name, input.kind, input.cutoff, input.minTransfer, createdBy],
    )
  ).insertId;
}

async function updateRound(
  conn: Queryable,
  id: number,
  input: { name: string; cutoff: IsoDate; minTransfer: number },
): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_rounds SET name = ?, cutoff = ?, min_transfer = ? WHERE ID = ?`,
    [input.name, input.cutoff, input.minTransfer, id],
  );
}

/**
 * Deletes a round. Its transfers, fund grants, chosen donations and overrides go with it (FK
 * cascades); its adjustments are deleted here, because the FK would only detach them and they
 * belong to the round's decision (callers allow this for drafts only).
 */
async function deleteRound(conn: Queryable, id: number): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_adjustments SET Paired_adjustment_ID = NULL WHERE Round_ID = ?`,
    [id],
  );
  await exec(conn, `DELETE FROM Regrant_adjustments WHERE Round_ID = ?`, [id]);
  await exec(conn, `DELETE FROM Regrant_rounds WHERE ID = ?`, [id]);
}

async function setRoundApproved(conn: Queryable, id: number, approvedBy: string): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_rounds SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE ID = ?`,
    [approvedBy, id],
  );
  await exec(
    conn,
    `UPDATE Fund_grants SET approved_by = ?, approved_at = NOW() WHERE Round_ID = ?`,
    [approvedBy, id],
  );
}

/** Back to draft: clears the approval and the snapshot */
async function setRoundDraft(conn: Queryable, id: number): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_rounds SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE ID = ?`,
    [id],
  );
  await exec(
    conn,
    `UPDATE Fund_grants SET approved_by = NULL, approved_at = NULL WHERE Round_ID = ?`,
    [id],
  );
  await exec(conn, `DELETE FROM Regrant_round_balances WHERE Round_ID = ?`, [id]);
}

async function setRoundPaid(conn: Queryable, id: number): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_rounds r
     SET r.status = 'paid', r.paid_at = (SELECT MAX(t.paid_at) FROM Regrant_transfers t WHERE t.Round_ID = r.ID)
     WHERE r.ID = ?`,
    [id],
  );
}

async function writeSnapshot(
  conn: Queryable,
  roundId: number,
  snapshot: Omit<RoundBalanceSnapshot, "organizationName" | "projectName">[],
): Promise<void> {
  await exec(conn, `DELETE FROM Regrant_round_balances WHERE Round_ID = ?`, [roundId]);
  if (snapshot.length === 0) return;
  await exec(
    conn,
    `INSERT INTO Regrant_round_balances (Round_ID, Organization_ID, Project_ID, balance_at_cutoff, committed,
       fund_grants, in_round, round_adjustments, included_direct) VALUES ?`,
    [
      snapshot.map((s) => [
        roundId,
        s.organizationId,
        s.projectId,
        s.balanceAtCutoff,
        s.committed,
        s.fundGrants,
        s.inRound,
        s.roundAdjustments,
        s.includedDirect,
      ]),
    ],
  );
}

async function getSnapshot(roundId: number): Promise<RoundBalanceSnapshot[]> {
  const result = await rows<any>(
    undefined,
    `SELECT b.Organization_ID AS organizationId, o.full_name AS organizationName, b.Project_ID AS projectId,
            pr.name AS projectName, b.balance_at_cutoff AS balanceAtCutoff, b.committed, b.fund_grants AS fundGrants,
            b.in_round AS inRound, b.round_adjustments AS roundAdjustments, b.included_direct AS includedDirect
     FROM Regrant_round_balances b
     JOIN Organizations o ON o.ID = b.Organization_ID
     LEFT JOIN Projects pr ON pr.ID = b.Project_ID
     WHERE b.Round_ID = ?
     ORDER BY o.full_name, b.Project_ID IS NOT NULL, pr.name`,
    [roundId],
  );
  return result.map((r) => ({
    ...r,
    balanceAtCutoff: money(r.balanceAtCutoff),
    committed: money(r.committed),
    fundGrants: money(r.fundGrants),
    inRound: money(r.inRound),
    roundAdjustments: money(r.roundAdjustments),
    includedDirect: Boolean(r.includedDirect),
  }));
}

/** Per-recipient include-direct overrides of a round */
async function getIncludeDirectOverrides(roundId: number): Promise<Map<number, boolean>> {
  const result = await rows<any>(
    undefined,
    `SELECT Organization_ID, include_direct FROM Regrant_round_recipients WHERE Round_ID = ?`,
    [roundId],
  );
  return new Map(result.map((r) => [r.Organization_ID, Boolean(r.include_direct)]));
}

async function setIncludeDirect(
  conn: Queryable,
  roundId: number,
  organizationId: number,
  includeDirect: boolean | null,
): Promise<void> {
  if (includeDirect === null) {
    await exec(
      conn,
      `DELETE FROM Regrant_round_recipients WHERE Round_ID = ? AND Organization_ID = ?`,
      [roundId, organizationId],
    );
  } else {
    await exec(
      conn,
      `INSERT INTO Regrant_round_recipients (Round_ID, Organization_ID, include_direct) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE include_direct = VALUES(include_direct)`,
      [roundId, organizationId, includeDirect],
    );
  }
}

async function setRoundDonations(conn: Queryable, roundId: number, donationIds: number[]) {
  await exec(conn, `DELETE FROM Regrant_round_donations WHERE Round_ID = ?`, [roundId]);
  if (donationIds.length === 0) return;
  await exec(conn, `INSERT INTO Regrant_round_donations (Round_ID, Donation_ID) VALUES ?`, [
    donationIds.map((d) => [roundId, d]),
  ]);
}

/**
 * The donations chosen for a round with their allocations, and whether each was already passed
 * on: chosen by another approved/paid round, or linked to a fronted adjustment.
 */
async function getRoundDonations(roundId: number): Promise<
  {
    donationId: number;
    donorId: number;
    sum: string;
    timestampConfirmed: Date;
    afterCutoff: boolean;
    passedOnByRoundId: number | null;
    frontedByAdjustmentId: number | null;
    allocations: { organizationId: number; amount: string }[];
  }[]
> {
  const donations = await rows<any>(
    undefined,
    `SELECT d.ID AS donationId, d.Donor_ID AS donorId, d.sum_confirmed AS sum,
            d.timestamp_confirmed AS timestampConfirmed,
            d.timestamp_confirmed >= DATE_ADD(r.cutoff, INTERVAL 1 DAY) AS afterCutoff,
            (SELECT MIN(o.Round_ID) FROM Regrant_round_donations o
              JOIN Regrant_rounds orr ON orr.ID = o.Round_ID
              WHERE o.Donation_ID = d.ID AND o.Round_ID <> r.ID AND orr.status IN ('approved', 'paid')) AS passedOnByRoundId,
            (SELECT MIN(adj.ID) FROM Regrant_adjustments adj
              WHERE adj.type = 'fronted' AND adj.linked_donation_ID = d.ID) AS frontedByAdjustmentId
     FROM Regrant_round_donations rd
     JOIN Regrant_rounds r ON r.ID = rd.Round_ID
     JOIN Donations d ON d.ID = rd.Donation_ID
     WHERE rd.Round_ID = ?
     ORDER BY d.timestamp_confirmed, d.ID`,
    [roundId],
  );
  if (donations.length === 0) return [];
  const allocations = await rows<any>(
    undefined,
    `SELECT Donation_ID AS donationId, Organization_ID AS organizationId, ROUND(SUM(amount), 2) AS amount
     FROM Regrant_allocations WHERE Donation_ID IN (?) GROUP BY Donation_ID, Organization_ID`,
    [donations.map((d) => d.donationId)],
  );
  return donations.map((d) => ({
    donationId: d.donationId,
    donorId: d.donorId,
    sum: money(d.sum),
    timestampConfirmed: d.timestampConfirmed,
    afterCutoff: Boolean(d.afterCutoff),
    passedOnByRoundId: d.passedOnByRoundId,
    frontedByAdjustmentId: d.frontedByAdjustmentId,
    allocations: allocations
      .filter((a) => a.donationId === d.donationId)
      .map((a) => ({ organizationId: a.organizationId, amount: money(a.amount) })),
  }));
}

//endregion

//region Transfers

const transferSelect = `SELECT t.ID AS id, t.Round_ID AS roundId, p.ID AS payeeId, p.name AS payeeName,
    p.currency AS payeeCurrency, t.amount_nok AS amountNok, t.currency, t.amount_foreign AS amountForeign,
    t.fx_rate AS fxRate, t.bank_fee AS bankFee, ${isoDate(
      "t.paid_at",
    )} AS paidAt, t.bank_ref AS bankRef,
    t.paid_by AS paidBy
  FROM Regrant_transfers t JOIN Payees p ON p.ID = t.Payee_ID`;

const lineSelect = `SELECT tl.ID AS id, tl.Transfer_ID AS transferId, tl.Organization_ID AS organizationId,
    o.full_name AS organizationName, tl.Project_ID AS projectId, pr.name AS projectName, tl.amount_nok AS amountNok
  FROM Regrant_transfer_lines tl
  JOIN Organizations o ON o.ID = tl.Organization_ID
  LEFT JOIN Projects pr ON pr.ID = tl.Project_ID`;

const trimDecimal = (value: string | null) =>
  value === null ? null : value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;

async function loadTransfers(
  where: string,
  params: unknown[],
  conn?: Queryable,
): Promise<Transfer[]> {
  const transfers = await rows<any>(
    conn,
    `${transferSelect} WHERE ${where} ORDER BY p.name, t.ID`,
    params,
  );
  if (transfers.length === 0) return [];
  const lines = await rows<any>(
    conn,
    `${lineSelect} WHERE tl.Transfer_ID IN (?) ORDER BY o.full_name, tl.Project_ID IS NOT NULL, pr.name, tl.ID`,
    [transfers.map((t) => t.id)],
  );
  const documents = await documentsFor(
    "transferId",
    transfers.map((t) => t.id),
    conn,
  );
  return transfers.map((t) => ({
    id: t.id,
    roundId: t.roundId,
    payee: { id: t.payeeId, name: t.payeeName, currency: t.payeeCurrency },
    amountNok: money(t.amountNok),
    currency: t.currency,
    amountForeign: trimDecimal(t.amountForeign),
    fxRate: trimDecimal(t.fxRate),
    bankFee: moneyOrNull(t.bankFee),
    paidAt: t.paidAt,
    bankRef: t.bankRef,
    paidBy: t.paidBy as PaidBy,
    lines: lines
      .filter((l) => l.transferId === t.id)
      .map((l): TransferLine => ({ ...l, amountNok: money(l.amountNok) })),
    documents: documents.get(t.id) ?? [],
  }));
}

async function getTransfers(roundId: number, conn?: Queryable): Promise<Transfer[]> {
  return loadTransfers("t.Round_ID = ?", [roundId], conn);
}

async function getTransfer(id: number, conn?: Queryable): Promise<Transfer | null> {
  return (await loadTransfers("t.ID = ?", [id], conn))[0] ?? null;
}

async function createTransfer(
  conn: Queryable,
  input: { roundId: number; payeeId: number; currency: string; amountNok: string | number },
): Promise<number> {
  return (
    await exec(
      conn,
      `INSERT INTO Regrant_transfers (Round_ID, Payee_ID, amount_nok, currency) VALUES (?, ?, ?, ?)`,
      [input.roundId, input.payeeId, input.amountNok, input.currency],
    )
  ).insertId;
}

async function updateTransfer(
  conn: Queryable,
  id: number,
  input: { payeeId: number; currency: string; amountNok: string | number },
): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_transfers SET Payee_ID = ?, currency = ?, amount_nok = ? WHERE ID = ?`,
    [input.payeeId, input.currency, input.amountNok, id],
  );
}

async function deleteTransfer(conn: Queryable, id: number): Promise<void> {
  await exec(conn, `DELETE FROM Regrant_transfers WHERE ID = ?`, [id]);
}

export type LineInput = {
  organizationId: number;
  projectId: number | null;
  amount: string | number;
};

/** Replaces a transfer's lines; sets amount_nok to their sum when syncAmount */
async function replaceTransferLines(
  conn: Queryable,
  transferId: number,
  lines: LineInput[],
  syncAmount: boolean,
): Promise<void> {
  await exec(conn, `DELETE FROM Regrant_transfer_lines WHERE Transfer_ID = ?`, [transferId]);
  if (lines.length > 0) {
    await exec(
      conn,
      `INSERT INTO Regrant_transfer_lines (Transfer_ID, Organization_ID, Project_ID, amount_nok) VALUES ?`,
      [lines.map((l) => [transferId, l.organizationId, l.projectId, l.amount])],
    );
  }
  if (syncAmount) await syncTransferAmount(conn, transferId);
}

async function syncTransferAmount(conn: Queryable, transferId: number): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_transfers t
     SET t.amount_nok = (SELECT COALESCE(SUM(tl.amount_nok), 0) FROM Regrant_transfer_lines tl WHERE tl.Transfer_ID = t.ID)
     WHERE t.ID = ?`,
    [transferId],
  );
}

/** Deletes the round's transfer lines for these recipients; returns the transfers touched */
async function deleteRoundLinesFor(
  conn: Queryable,
  roundId: number,
  organizationIds: number[] | null,
): Promise<number[]> {
  const touched = await rows<any>(
    conn,
    `SELECT DISTINCT tl.Transfer_ID AS id FROM Regrant_transfer_lines tl
     JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
     WHERE t.Round_ID = ? ${organizationIds ? "AND tl.Organization_ID IN (?)" : ""}`,
    organizationIds ? [roundId, organizationIds] : [roundId],
  );
  if (touched.length === 0) return [];
  await exec(
    conn,
    `DELETE tl FROM Regrant_transfer_lines tl JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
     WHERE t.Round_ID = ? ${organizationIds ? "AND tl.Organization_ID IN (?)" : ""}`,
    organizationIds ? [roundId, organizationIds] : [roundId],
  );
  return touched.map((t) => t.id);
}

async function addTransferLines(conn: Queryable, transferId: number, lines: LineInput[]) {
  if (lines.length === 0) return;
  await exec(
    conn,
    `INSERT INTO Regrant_transfer_lines (Transfer_ID, Organization_ID, Project_ID, amount_nok) VALUES ?`,
    [lines.map((l) => [transferId, l.organizationId, l.projectId, l.amount])],
  );
}

/** Deletes transfers of the round, among `ids`, that have no lines left */
async function deleteEmptyTransfers(
  conn: Queryable,
  roundId: number,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await exec(
    conn,
    `DELETE t FROM Regrant_transfers t
     WHERE t.Round_ID = ? AND t.ID IN (?)
       AND NOT EXISTS (SELECT 1 FROM Regrant_transfer_lines tl WHERE tl.Transfer_ID = t.ID)`,
    [roundId, ids],
  );
}

export type PaymentInput = {
  paidAt: IsoDate;
  currency: string;
  amountForeign: string | null;
  fxRate: string | null;
  bankFee: number | null;
  bankRef: string | null;
  paidBy: PaidBy;
};

async function recordPayment(conn: Queryable, transferId: number, input: PaymentInput) {
  await exec(
    conn,
    `UPDATE Regrant_transfers SET paid_at = ?, currency = ?, amount_foreign = ?, fx_rate = ?, bank_fee = ?,
       bank_ref = ?, paid_by = ? WHERE ID = ?`,
    [
      input.paidAt,
      input.currency,
      input.amountForeign,
      input.fxRate,
      input.bankFee,
      input.bankRef,
      input.paidBy,
      transferId,
    ],
  );
}

async function clearPayment(conn: Queryable, transferId: number) {
  await exec(
    conn,
    `UPDATE Regrant_transfers SET paid_at = NULL, amount_foreign = NULL, fx_rate = NULL, bank_fee = NULL,
       bank_ref = NULL, paid_by = 'foundation' WHERE ID = ?`,
    [transferId],
  );
}

//endregion

//region Fund grants

async function loadFundGrants(
  where: string,
  params: unknown[],
  conn?: Queryable,
): Promise<FundGrant[]> {
  const grants = await rows<any>(
    conn,
    `SELECT g.ID AS id, g.Fund_ID AS fundId, o.full_name AS fundName, g.Round_ID AS roundId, g.rationale,
            g.approved_by AS approvedBy, ${dbClockColumn("g.approved_at", "approvedAt")},
            g.created_by AS createdBy, ${dbClockColumn("g.created_at", "createdAt")}
     FROM Fund_grants g JOIN Organizations o ON o.ID = g.Fund_ID
     WHERE ${where} ORDER BY o.full_name, g.ID`,
    params,
  );
  if (grants.length === 0) return [];
  const lines = await rows<any>(
    conn,
    `SELECT l.ID AS id, l.Fund_grant_ID AS fundGrantId, l.Organization_ID AS organizationId,
            o.full_name AS organizationName, l.Project_ID AS projectId, pr.name AS projectName, l.amount
     FROM Fund_grant_lines l
     JOIN Organizations o ON o.ID = l.Organization_ID
     LEFT JOIN Projects pr ON pr.ID = l.Project_ID
     WHERE l.Fund_grant_ID IN (?)
     ORDER BY o.full_name, l.Project_ID IS NOT NULL, pr.name, l.ID`,
    [grants.map((g) => g.id)],
  );
  return grants.map((g) => {
    const own = lines
      .filter((l) => l.fundGrantId === g.id)
      .map((l): FundGrantLine => ({ ...l, amount: money(l.amount) }));
    const total = own.reduce((sum, l) => sum + Math.round(Number(l.amount) * 100), 0);
    return { ...g, total: (total / 100).toFixed(2), lines: own };
  });
}

async function getFundGrants(roundId: number, conn?: Queryable): Promise<FundGrant[]> {
  return loadFundGrants("g.Round_ID = ?", [roundId], conn);
}

async function getFundGrant(id: number, conn?: Queryable): Promise<FundGrant | null> {
  return (await loadFundGrants("g.ID = ?", [id], conn))[0] ?? null;
}

async function createFundGrant(
  conn: Queryable,
  input: { roundId: number; fundId: number; rationale: string },
  createdBy: string,
): Promise<number> {
  return (
    await exec(
      conn,
      `INSERT INTO Fund_grants (Fund_ID, Round_ID, rationale, created_by) VALUES (?, ?, ?, ?)`,
      [input.fundId, input.roundId, input.rationale, createdBy],
    )
  ).insertId;
}

async function updateFundGrantRationale(conn: Queryable, id: number, rationale: string) {
  await exec(conn, `UPDATE Fund_grants SET rationale = ? WHERE ID = ?`, [rationale, id]);
}

async function replaceFundGrantLines(conn: Queryable, fundGrantId: number, lines: LineInput[]) {
  await exec(conn, `DELETE FROM Fund_grant_lines WHERE Fund_grant_ID = ?`, [fundGrantId]);
  if (lines.length === 0) return;
  await exec(
    conn,
    `INSERT INTO Fund_grant_lines (Fund_grant_ID, Organization_ID, Project_ID, amount) VALUES ?`,
    [lines.map((l) => [fundGrantId, l.organizationId, l.projectId, l.amount])],
  );
}

async function deleteFundGrant(conn: Queryable, id: number) {
  await exec(conn, `DELETE FROM Fund_grants WHERE ID = ?`, [id]);
}

//endregion

//region Adjustments

const adjustmentSelect = `SELECT a.ID AS id, a.Organization_ID AS organizationId, o.full_name AS organizationName,
    a.Project_ID AS projectId, pr.name AS projectName, a.amount, a.type, a.reason,
    ${isoDate(
      "a.effective_at",
    )} AS effectiveAt, a.Round_ID AS roundId, a.linked_transfer_ID AS linkedTransferId,
    a.linked_donation_ID AS linkedDonationId, a.created_by AS createdBy,
    ${dbClockColumn(
      "a.created_at",
      "createdAt",
    )}, a.Paired_adjustment_ID AS pairedAdjustmentId, ar.status AS roundStatus
  FROM Regrant_adjustments a
  JOIN Organizations o ON o.ID = a.Organization_ID
  LEFT JOIN Projects pr ON pr.ID = a.Project_ID
  LEFT JOIN Regrant_rounds ar ON ar.ID = a.Round_ID`;

const mapAdjustment = (r: any, documents: Map<number, RegrantDocument[]>): Adjustment => {
  const pending = r.roundStatus === "draft";
  return {
    ...r,
    documents: documents.get(r.id) ?? [],
    amount: money(r.amount),
    roundStatus: r.roundStatus ?? null,
    pending,
    affectsBalance: r.type !== "fronted" && !pending,
  };
};

export type AdjustmentInput = {
  organizationId: number;
  projectId: number | null;
  amount: number;
  type: AdjustmentType;
  reason: string;
  effectiveAt: IsoDate;
  roundId: number | null;
  linkedTransferId: number | null;
  linkedDonationId: number | null;
};

async function listAdjustments(filter: {
  organizationId?: number;
  projectId?: number;
  roundId?: number;
  types?: AdjustmentType[];
  from?: IsoDate;
  to?: IsoDate;
}): Promise<Adjustment[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    where.push(sql);
    params.push(value);
  };
  if (filter.organizationId !== undefined) add("a.Organization_ID = ?", filter.organizationId);
  if (filter.projectId !== undefined) add("a.Project_ID = ?", filter.projectId);
  if (filter.roundId !== undefined) add("a.Round_ID = ?", filter.roundId);
  if (filter.types?.length) add("a.type IN (?)", filter.types);
  if (filter.from !== undefined) add("a.effective_at >= ?", filter.from);
  if (filter.to !== undefined) add("a.effective_at <= ?", filter.to);
  const result = await rows<any>(
    undefined,
    `${adjustmentSelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.effective_at DESC, a.ID DESC`,
    params,
  );
  const documents = await documentsFor(
    "adjustmentId",
    result.map((r) => r.id),
  );
  return result.map((r) => mapAdjustment(r, documents));
}

async function getAdjustment(id: number, conn?: Queryable): Promise<Adjustment | null> {
  const [row] = await rows<any>(conn, `${adjustmentSelect} WHERE a.ID = ?`, [id]);
  return row ? mapAdjustment(row, await documentsFor("adjustmentId", [id], conn)) : null;
}

const adjustmentValues = (a: AdjustmentInput) => [
  a.organizationId,
  a.projectId,
  a.amount,
  a.type,
  a.reason,
  a.effectiveAt,
  a.roundId,
  a.linkedTransferId,
  a.linkedDonationId,
];

async function createAdjustment(
  input: AdjustmentInput,
  createdBy: string,
  conn?: Queryable,
): Promise<number> {
  return (
    await exec(
      conn,
      `INSERT INTO Regrant_adjustments (Organization_ID, Project_ID, amount, type, reason, effective_at, Round_ID,
         linked_transfer_ID, linked_donation_ID, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...adjustmentValues(input), createdBy],
    )
  ).insertId;
}

async function updateAdjustment(id: number, input: AdjustmentInput, conn?: Queryable) {
  await exec(
    conn,
    `UPDATE Regrant_adjustments SET Organization_ID = ?, Project_ID = ?, amount = ?, type = ?, reason = ?,
       effective_at = ?, Round_ID = ?, linked_transfer_ID = ?, linked_donation_ID = ? WHERE ID = ?`,
    [...adjustmentValues(input), id],
  );
}

/** Links the two halves of an earmark to each other */
async function pairAdjustments(conn: Queryable, a: number, b: number): Promise<void> {
  await exec(conn, `UPDATE Regrant_adjustments SET Paired_adjustment_ID = ? WHERE ID = ?`, [b, a]);
  await exec(conn, `UPDATE Regrant_adjustments SET Paired_adjustment_ID = ? WHERE ID = ?`, [a, b]);
}

/** Deletes adjustments (e.g. both halves of an earmark); returns how many were deleted */
async function deleteAdjustments(conn: Queryable, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  await exec(conn, `UPDATE Regrant_adjustments SET Paired_adjustment_ID = NULL WHERE ID IN (?)`, [
    ids,
  ]);
  return (await exec(conn, `DELETE FROM Regrant_adjustments WHERE ID IN (?)`, [ids])).affectedRows;
}

/** A draft's cutoff moved: its earmarks (dated the cutoff) move with it */
async function moveRoundEarmarks(
  conn: Queryable,
  roundId: number,
  from: IsoDate,
  to: IsoDate,
): Promise<void> {
  await exec(
    conn,
    `UPDATE Regrant_adjustments SET effective_at = ?
     WHERE Round_ID = ? AND Paired_adjustment_ID IS NOT NULL AND effective_at = ?`,
    [to, roundId, from],
  );
}

async function linkAdjustmentDonation(id: number, donationId: number | null) {
  await exec(undefined, `UPDATE Regrant_adjustments SET linked_donation_ID = ? WHERE ID = ?`, [
    donationId,
    id,
  ]);
}

async function deleteAdjustment(id: number, conn?: Queryable): Promise<boolean> {
  return (
    (await exec(conn, `DELETE FROM Regrant_adjustments WHERE ID = ?`, [id])).affectedRows === 1
  );
}

//endregion

//region Documents

const documentSelect = `SELECT d.ID AS id, d.url, d.label, d.Round_ID AS roundId, d.Transfer_ID AS transferId,
    d.Adjustment_ID AS adjustmentId, d.created_by AS createdBy, ${dbClockColumn(
      "d.created_at",
      "createdAt",
    )}
  FROM Regrant_documents d`;

const documentParentColumns = {
  roundId: "Round_ID",
  transferId: "Transfer_ID",
  adjustmentId: "Adjustment_ID",
} as const;
type DocumentParentKey = keyof typeof documentParentColumns;

/** The one parent set, or an Error naming the problem */
function documentParent(parent: {
  roundId?: number | null;
  transferId?: number | null;
  adjustmentId?: number | null;
}): { key: DocumentParentKey; id: number } {
  const set = (Object.keys(documentParentColumns) as DocumentParentKey[]).filter(
    (k) => parent[k] !== undefined && parent[k] !== null,
  );
  if (set.length !== 1) {
    throw new Error(
      `A document belongs to exactly one round, transfer or adjustment (got ${
        set.length ? set.join(", ") : "none"
      })`,
    );
  }
  return { key: set[0], id: parent[set[0]] as number };
}

/** Documents of several rounds, transfers or adjustments, by parent id, oldest first */
async function documentsFor(
  key: DocumentParentKey,
  ids: number[],
  conn?: Queryable,
): Promise<Map<number, RegrantDocument[]>> {
  const byParent = new Map<number, RegrantDocument[]>();
  if (ids.length === 0) return byParent;
  const result = await rows<RegrantDocument>(
    conn,
    `${documentSelect} WHERE d.${documentParentColumns[key]} IN (?) ORDER BY d.ID`,
    [ids],
  );
  for (const d of result) {
    const parentId = d[key] as number;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), d]);
  }
  return byParent;
}

/** The documents of one round (the round's own, not its transfers'), transfer or adjustment */
async function listDocuments(
  parent: RegrantDocumentParent,
  conn?: Queryable,
): Promise<RegrantDocument[]> {
  const { key, id } = documentParent(parent);
  return (await documentsFor(key, [id], conn)).get(id) ?? [];
}

async function getDocument(id: number, conn?: Queryable): Promise<RegrantDocument | null> {
  const [row] = await rows<RegrantDocument>(conn, `${documentSelect} WHERE d.ID = ?`, [id]);
  return row ?? null;
}

export type DocumentInput = RegrantDocumentParent & { url: string; label: string | null };

/** Throws unless exactly one of roundId, transferId, adjustmentId is set */
async function addDocument(
  input: DocumentInput,
  createdBy: string,
  conn?: Queryable,
): Promise<number> {
  const { key, id } = documentParent(input);
  const parent = (k: DocumentParentKey) => (k === key ? id : null);
  return (
    await exec(
      conn,
      `INSERT INTO Regrant_documents (url, label, Round_ID, Transfer_ID, Adjustment_ID, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.url,
        input.label,
        parent("roundId"),
        parent("transferId"),
        parent("adjustmentId"),
        createdBy,
      ],
    )
  ).insertId;
}

async function deleteDocument(id: number, conn?: Queryable): Promise<boolean> {
  return (await exec(conn, `DELETE FROM Regrant_documents WHERE ID = ?`, [id])).affectedRows === 1;
}

//endregion

//region Statement

export type StatementRow = {
  date: IsoDate;
  kind: StatementEntryKind;
  projectId: number | null;
  amount: string;
  donationCount: number | null;
  roundId: number | null;
  roundName: string | null;
  transferId: number | null;
  transferLineId: number | null;
  payeeName: string | null;
  bankRef: string | null;
  fundGrantId: number | null;
  fundGrantLineId: number | null;
  /** The fund (for fund_grant_in) or the recipient (for fund_grant_out) */
  counterpartOrganizationId: number | null;
  rationale: string | null;
  adjustmentId: number | null;
  adjustmentType: AdjustmentType | null;
  reason: string | null;
  createdBy: string | null;
  /** Adjustments attached to a draft round: not in the balance until it is approved */
  pending: boolean;
};

/**
 * Every entry for a recipient in [from, to], allocations summed per day. Fronted adjustments
 * and adjustments attached to draft rounds (`pending`) are included; callers keep them out of
 * the running balance.
 */
async function getStatementRows(
  organizationId: number,
  from: IsoDate,
  to: IsoDate,
): Promise<StatementRow[]> {
  const nulls = (n: string[]) => n.map((c) => `NULL AS ${c}`).join(", ");
  const sql = `
    SELECT ${isoDate(
      "DATE(a.timestamp_confirmed)",
    )} AS date, 'allocations' AS kind, NULL AS projectId,
           ROUND(SUM(a.amount), 2) AS amount, COUNT(DISTINCT a.Donation_ID) AS donationCount,
           ${nulls([
             "roundId",
             "roundName",
             "transferId",
             "transferLineId",
             "payeeName",
             "bankRef",
             "fundGrantId",
             "fundGrantLineId",
             "counterpartOrganizationId",
             "rationale",
             "adjustmentId",
             "adjustmentType",
             "reason",
             "createdBy",
           ])},
           0 AS pending, 0 AS sortKind, 0 AS sortId
    FROM Regrant_allocations a
    WHERE a.Organization_ID = ? AND a.timestamp_confirmed >= ? AND a.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY ${isoDate("DATE(a.timestamp_confirmed)")}

    UNION ALL
    SELECT ${isoDate(
      "r.cutoff",
    )}, 'fund_grant_in', l.Project_ID, l.amount, NULL, r.ID, r.name, NULL, NULL, NULL, NULL,
           g.ID, l.ID, g.Fund_ID, g.rationale, NULL, NULL, NULL, g.created_by, 0, 1, l.ID
    FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID JOIN Regrant_rounds r ON r.ID = g.Round_ID
    WHERE l.Organization_ID = ? AND r.status IN ('approved', 'paid') AND r.cutoff BETWEEN ? AND ?

    UNION ALL
    SELECT ${isoDate(
      "r.cutoff",
    )}, 'fund_grant_out', l.Project_ID, -l.amount, NULL, r.ID, r.name, NULL, NULL, NULL, NULL,
           g.ID, l.ID, l.Organization_ID, g.rationale, NULL, NULL, NULL, g.created_by, 0, 2, l.ID
    FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID JOIN Regrant_rounds r ON r.ID = g.Round_ID
    WHERE g.Fund_ID = ? AND r.status IN ('approved', 'paid') AND r.cutoff BETWEEN ? AND ?

    UNION ALL
    SELECT ${isoDate(
      "adj.effective_at",
    )}, 'adjustment', adj.Project_ID, adj.amount, NULL, adj.Round_ID, rr.name, NULL, NULL,
           NULL, NULL, NULL, NULL, NULL, NULL, adj.ID, adj.type, adj.reason, adj.created_by,
           COALESCE(rr.status = 'draft', 0), 3, adj.ID
    FROM Regrant_adjustments adj LEFT JOIN Regrant_rounds rr ON rr.ID = adj.Round_ID
    WHERE adj.Organization_ID = ? AND adj.effective_at BETWEEN ? AND ?

    UNION ALL
    SELECT ${isoDate(
      "t.paid_at",
    )}, 'transfer', tl.Project_ID, -tl.amount_nok, NULL, r.ID, r.name, t.ID, tl.ID, p.name,
           t.bank_ref, NULL, NULL, NULL, NULL, NULL, NULL, NULL, r.approved_by, 0, 4, tl.ID
    FROM Regrant_transfer_lines tl JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
    JOIN Regrant_rounds r ON r.ID = t.Round_ID JOIN Payees p ON p.ID = t.Payee_ID
    WHERE tl.Organization_ID = ? AND r.status = 'paid' AND t.paid_at BETWEEN ? AND ?

    ORDER BY date, sortKind, sortId`;
  const params = [
    organizationId,
    from,
    to,
    organizationId,
    from,
    to,
    organizationId,
    from,
    to,
    organizationId,
    from,
    to,
    organizationId,
    from,
    to,
  ];
  const result = await rows<any>(undefined, sql, params);
  return result.map(({ sortKind, sortId, ...r }) => ({
    ...r,
    amount: money(r.amount),
    donationCount: r.donationCount === null ? null : Number(r.donationCount),
    pending: Boolean(Number(r.pending)),
  }));
}

/** Transfer lines of approved, unpaid rounds for a recipient */
async function getCommittedLines(organizationId: number): Promise<
  {
    roundId: number;
    roundName: string;
    transferId: number;
    transferLineId: number;
    payeeName: string;
    projectId: number | null;
    amountNok: string;
  }[]
> {
  const result = await rows<any>(
    undefined,
    `SELECT r.ID AS roundId, r.name AS roundName, t.ID AS transferId, tl.ID AS transferLineId, p.name AS payeeName,
            tl.Project_ID AS projectId, tl.amount_nok AS amountNok
     FROM Regrant_transfer_lines tl JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
     JOIN Regrant_rounds r ON r.ID = t.Round_ID JOIN Payees p ON p.ID = t.Payee_ID
     WHERE tl.Organization_ID = ? AND r.status = 'approved'
     ORDER BY r.cutoff, t.ID, tl.ID`,
    [organizationId],
  );
  return result.map((r) => ({ ...r, amountNok: money(r.amountNok) }));
}

//endregion

export const regranting = {
  inTransaction,
  // organizations / donations
  getOrganizations,
  organizationExists,
  existingDonationIds,
  // ledger
  getBalances,
  getUnassigned,
  getLastTransfers,
  getInflowBetween,
  getLatestRound,
  getFronted,
  // payees
  listPayees,
  getPayee,
  createPayee,
  updatePayee,
  deletePayee,
  listRoutings,
  getRouting,
  overlappingRoutings,
  createRouting,
  updateRouting,
  deleteRouting,
  getPayeesAt,
  // projects
  listProjects,
  getProject,
  getProjectOrganizations,
  getProjectNames,
  createProject,
  updateProject,
  deleteProject,
  projectHasEntries,
  getProjectLines,
  // funds
  listFunds,
  getFund,
  createFund,
  updateFund,
  deleteFund,
  // holds
  listHolds,
  getHold,
  createHold,
  updateHold,
  deleteHold,
  // rounds
  getRound,
  lockRound,
  listRounds,
  getRoundSummary,
  createRound,
  updateRound,
  deleteRound,
  setRoundApproved,
  setRoundDraft,
  setRoundPaid,
  writeSnapshot,
  getSnapshot,
  getIncludeDirectOverrides,
  setIncludeDirect,
  setRoundDonations,
  getRoundDonations,
  // transfers
  getTransfers,
  getTransfer,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  replaceTransferLines,
  syncTransferAmount,
  deleteRoundLinesFor,
  addTransferLines,
  deleteEmptyTransfers,
  recordPayment,
  clearPayment,
  // fund grants
  getFundGrants,
  getFundGrant,
  createFundGrant,
  updateFundGrantRationale,
  replaceFundGrantLines,
  deleteFundGrant,
  // adjustments
  listAdjustments,
  getAdjustment,
  createAdjustment,
  updateAdjustment,
  linkAdjustmentDonation,
  deleteAdjustment,
  pairAdjustments,
  deleteAdjustments,
  moveRoundEarmarks,
  // documents
  documentsFor,
  listDocuments,
  getDocument,
  addDocument,
  deleteDocument,
  // statements
  getStatementRows,
  getCommittedLines,
};
