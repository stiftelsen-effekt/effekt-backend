import { DAO } from "../DAO";
import { dbClockColumn, instantRangeClauses, type InstantRange } from "../osloDays";

/**
 * Recurring agreements across providers (Vipps and AvtaleGiro in NO, AutoGiro in SE) in one
 * list, built as a UNION ALL of the provider tables with a shared projection.
 *
 * Amounts are in whole currency units. The stored units differ:
 * - Vipps_agreements.amount: whole NOK (the Vipps API gets øre, see vipps.draftAgreement)
 * - Avtalegiro_agreements.amount: øre
 * - AutoGiro_agreements.amount: whole SEK (the shipment file gets öre, see autogiro.ts)
 *
 * Statuses are normalised (see agreementStatuses), the provider's own value is kept in
 * `providerStatus`:
 *
 * | provider   | stored                                                 | status  |
 * |------------|--------------------------------------------------------|---------|
 * | vipps      | ACTIVE, paused_until_date after today                  | paused  |
 * | vipps      | ACTIVE                                                 | active  |
 * | vipps      | PENDING (donor hasn't accepted in the app yet)         | pending |
 * | vipps      | STOPPED, EXPIRED (never accepted)                      | stopped |
 * | avtalegiro | active = 1                                             | active  |
 * | avtalegiro | active = 0, cancelled set                              | stopped |
 * | avtalegiro | active = 0, not cancelled (awaiting bank confirmation) | pending |
 * | autogiro   | active = 1                                             | active  |
 * | autogiro   | cancelled set, or mandate CANCELLED/REJECTED           | stopped |
 * | autogiro   | active = 0, mandate DRAFTED (mandate never submitted)  | draft   |
 * | autogiro   | active = 0, mandate NEW/PENDING/ACTIVE                 | pending |
 */

export const agreementProviders = ["vipps", "avtalegiro", "autogiro"] as const;
export type AgreementProvider = (typeof agreementProviders)[number];

export const agreementStatuses = ["active", "paused", "pending", "draft", "stopped"] as const;
export type AgreementStatus = (typeof agreementStatuses)[number];

export const agreementSortColumns = [
  "provider",
  "id",
  "KID",
  "donorName",
  "amount",
  "chargeDay",
  "status",
  "created",
  "lastUpdated",
  "cancelled",
] as const;
export type AgreementSortColumn = (typeof agreementSortColumns)[number];

export type AgreementRow = {
  provider: AgreementProvider;
  /** The provider table's id; Vipps agreement ids are strings like "agr_…" */
  id: string;
  KID: string;
  donorId: number;
  donorName: string | null;
  /** Monthly amount in whole currency units (NOK/SEK) */
  amount: number;
  /** Day of month the agreement is charged; 0 is the last day of the month */
  chargeDay: number;
  status: AgreementStatus;
  /** The provider's own status, e.g. "ACTIVE" (Vipps) or "inactive, mandate PENDING" */
  providerStatus: string;
  created: Date | null;
  /** Not tracked for Vipps agreements */
  lastUpdated: Date | null;
  cancelled: Date | null;
  /** Vipps only, YYYY-MM-DD */
  pausedUntil: string | null;
};

export type AgreementFilter = {
  providers?: AgreementProvider[];
  statuses?: AgreementStatus[];
  /** Whole currency units, inclusive */
  amount?: { from?: number; to?: number };
  chargeDay?: { from?: number; to?: number };
  /** ISO dates (YYYY-MM-DD) of the stored wall clock, inclusive of the whole `to` day */
  created?: { from?: string; to?: string };
  /** Half-open instant range (osloDays.ts); the created columns are filled by MySQL defaults */
  createdRange?: InstantRange;
  /** Partial match on the donor's name or email */
  donor?: string;
  /** Partial match */
  KID?: string;
  /** Exact provider table ids; combine with `providers` to pick one provider's row */
  ids?: string[];
};

export type AgreementStatistics = {
  /** Agreements matching the filter */
  count: number;
  /** Matching agreements with status active */
  activeCount: number;
  /** Sum of the monthly amount of the matching active agreements, whole currency units */
  activeMonthlySum: number;
};

/** One collation for every string column, so the UNION works whatever the tables use */
const str = (expression: string) =>
  `CAST(${expression} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_0900_ai_ci`;

const providerQueries: Record<AgreementProvider, string> = {
  vipps: `
    SELECT
      ${str("'vipps'")} AS provider,
      ${str("VA.ID")} AS id,
      ${str("VA.KID")} AS KID,
      VA.donorID AS donorId,
      ${str("Donors.full_name")} AS donorName,
      ${str("Donors.email")} AS donorEmail,
      CAST(VA.amount AS DECIMAL(16, 2)) AS amount,
      VA.monthly_charge_day AS chargeDay,
      ${str(`CASE
        WHEN UPPER(VA.status) = 'ACTIVE' AND DATE(VA.paused_until_date) > CURDATE() THEN 'paused'
        WHEN UPPER(VA.status) = 'ACTIVE' THEN 'active'
        WHEN UPPER(VA.status) IN ('STOPPED', 'EXPIRED') THEN 'stopped'
        ELSE 'pending'
      END`)} AS status,
      ${str("COALESCE(VA.status, '')")} AS providerStatus,
      VA.timestamp_created AS createdDb,
      CAST(NULL AS DATETIME) AS lastUpdatedDb,
      CAST(VA.cancellation_date AS DATETIME) AS cancelled,
      ${str("VA.paused_until_date")} AS pausedUntil
    FROM Vipps_agreements VA
    INNER JOIN Donors ON Donors.ID = VA.donorID`,

  avtalegiro: `
    SELECT
      ${str("'avtalegiro'")} AS provider,
      ${str("AG.ID")} AS id,
      ${str("AG.KID")} AS KID,
      D.Donor_ID AS donorId,
      ${str("Donors.full_name")} AS donorName,
      ${str("Donors.email")} AS donorEmail,
      CAST(AG.amount / 100 AS DECIMAL(16, 2)) AS amount,
      AG.payment_date AS chargeDay,
      ${str(`CASE
        WHEN AG.active = 1 THEN 'active'
        WHEN AG.cancelled IS NOT NULL THEN 'stopped'
        ELSE 'pending'
      END`)} AS status,
      ${str("IF(AG.active = 1, 'active', 'inactive')")} AS providerStatus,
      AG.created AS createdDb,
      AG.last_updated AS lastUpdatedDb,
      CAST(AG.cancelled AS DATETIME) AS cancelled,
      ${str("NULL")} AS pausedUntil
    FROM Avtalegiro_agreements AG
    INNER JOIN Distributions D ON D.KID = AG.KID
    INNER JOIN Donors ON Donors.ID = D.Donor_ID`,

  autogiro: `
    SELECT
      ${str("'autogiro'")} AS provider,
      ${str("AG.ID")} AS id,
      ${str("AG.KID")} AS KID,
      D.Donor_ID AS donorId,
      ${str("Donors.full_name")} AS donorName,
      ${str("Donors.email")} AS donorEmail,
      CAST(AG.amount AS DECIMAL(16, 2)) AS amount,
      AG.payment_date AS chargeDay,
      ${str(`CASE
        WHEN AG.active = 1 THEN 'active'
        WHEN AG.cancelled IS NOT NULL OR M.status IN ('CANCELLED', 'REJECTED') THEN 'stopped'
        WHEN M.status = 'DRAFTED' THEN 'draft'
        ELSE 'pending'
      END`)} AS status,
      ${str(
        "CONCAT(IF(AG.active = 1, 'active', 'inactive'), ', mandate ', COALESCE(M.status, 'missing'))",
      )} AS providerStatus,
      AG.created AS createdDb,
      AG.last_updated AS lastUpdatedDb,
      CAST(AG.cancelled AS DATETIME) AS cancelled,
      ${str("NULL")} AS pausedUntil
    FROM AutoGiro_agreements AG
    INNER JOIN Distributions D ON D.KID = AG.KID
    INNER JOIN Donors ON Donors.ID = D.Donor_ID
    LEFT JOIN AutoGiro_mandates M ON M.ID = AG.mandateID`,
};

/** ORDER BY expressions per sort column. Ids are text; shorter ids first so numbers sort numerically */
const sortExpressions: Record<AgreementSortColumn, string[]> = {
  provider: ["provider"],
  id: ["CHAR_LENGTH(id)", "id"],
  KID: ["KID"],
  donorName: ["donorName"],
  amount: ["amount"],
  chargeDay: ["chargeDay"],
  status: ["status"],
  created: ["createdDb"],
  lastUpdated: ["lastUpdatedDb"],
  cancelled: ["cancelled"],
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The UNION of the requested providers and the WHERE clause over it, with parameters */
function buildQuery(filter: AgreementFilter) {
  const providers = filter.providers?.length ? filter.providers : [...agreementProviders];
  const union = providers.map((provider) => providerQueries[provider]).join("\nUNION ALL\n");

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, ...values: unknown[]) => {
    where.push(clause);
    params.push(...values);
  };

  if (filter.statuses?.length) add("status IN (?)", filter.statuses);
  if (filter.amount?.from !== undefined) add("amount >= ?", filter.amount.from);
  if (filter.amount?.to !== undefined) add("amount <= ?", filter.amount.to);
  if (filter.chargeDay?.from !== undefined) add("chargeDay >= ?", filter.chargeDay.from);
  if (filter.chargeDay?.to !== undefined) add("chargeDay <= ?", filter.chargeDay.to);
  if (filter.created?.from) add("createdDb >= ?", filter.created.from);
  if (filter.created?.to) add("createdDb < DATE_ADD(?, INTERVAL 1 DAY)", filter.created.to);
  for (const clause of instantRangeClauses("createdDb", filter.createdRange, "db")) add(clause);
  if (filter.donor) {
    const pattern = `%${escapeLike(filter.donor)}%`;
    add("(donorName LIKE ? OR donorEmail LIKE ?)", pattern, pattern);
  }
  if (filter.KID) add("KID LIKE ?", `%${escapeLike(filter.KID)}%`);
  if (filter.ids?.length) add("id IN (?)", filter.ids);

  return {
    from: `(${union}) AS A`,
    where: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

/** amount is a DECIMAL, which mysql2 returns as a string */
type AgreementQueryRow = Omit<AgreementRow, "amount"> & {
  amount: string;
  /** created and lastUpdated in the DB clock (column defaults), see osloDays.ts */
  createdDb: Date | null;
  lastUpdatedDb: Date | null;
};

async function getList(options: {
  filter: AgreementFilter;
  sort: { id: AgreementSortColumn; desc: boolean };
  /** Omit page and limit for all rows */
  page?: number;
  limit?: number;
}): Promise<{ rows: AgreementRow[]; statistics: AgreementStatistics; pages: number }> {
  const { from, where, params } = buildQuery(options.filter);
  const direction = options.sort.desc ? "DESC" : "ASC";
  const paging = options.limit !== undefined ? "LIMIT ? OFFSET ?" : "";
  const pagingParams =
    options.limit !== undefined ? [options.limit, (options.page ?? 0) * options.limit] : [];

  const [rows] = await DAO.query<AgreementQueryRow[]>(
    `SELECT *, ${dbClockColumn("createdDb", "created")}, ${dbClockColumn(
      "lastUpdatedDb",
      "lastUpdated",
    )}
     FROM ${from}
     ${where}
     ORDER BY ${[...sortExpressions[options.sort.id], "provider", "CHAR_LENGTH(id)", "id"]
       .map((expression) => `${expression} ${direction}`)
       .join(", ")}
     ${paging}`,
    [...params, ...pagingParams],
  );

  const [[stats]] = await DAO.query<
    { count: number; activeCount: string | null; activeMonthlySum: string | null }[]
  >(
    `SELECT
       COUNT(*) AS count,
       SUM(status = 'active') AS activeCount,
       SUM(IF(status = 'active', amount, 0)) AS activeMonthlySum
     FROM ${from}
     ${where}`,
    params,
  );

  const count = Number(stats.count);
  return {
    rows: rows.map(
      (row): AgreementRow => ({
        provider: row.provider,
        id: row.id,
        KID: row.KID,
        donorId: row.donorId,
        donorName: row.donorName,
        amount: Number(row.amount),
        chargeDay: row.chargeDay,
        status: row.status,
        providerStatus: row.providerStatus,
        created: row.created,
        lastUpdated: row.lastUpdated,
        cancelled: row.cancelled,
        pausedUntil: row.pausedUntil,
      }),
    ),
    statistics: {
      count,
      activeCount: Number(stats.activeCount ?? 0),
      activeMonthlySum: Number(stats.activeMonthlySum ?? 0),
    },
    pages: options.limit !== undefined ? Math.ceil(count / options.limit) : count > 0 ? 1 : 0,
  };
}

export const agreements = {
  getList,
};
