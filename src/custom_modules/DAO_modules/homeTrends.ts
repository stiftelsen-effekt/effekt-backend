import { DateTime } from "luxon";
import sqlString from "sqlstring";
import { DAO } from "../DAO";
import { OSLO_ZONE, sqlInstant, type ColumnClock } from "../osloDays";

/**
 * Monthly series behind the sparklines on the admin's Home: donations, transaction costs, and
 * Vipps + AvtaleGiro agreements (active at each month's end, started, stopped). Months are
 * Europe/Oslo calendar months; the last one is the current month, so far.
 *
 * Each table is read once, grouped by a month index computed in SQL from the exact month
 * boundaries (luxon, so DST is right), which keeps this to three small grouped queries.
 */

export type TrendMonth = {
  /** "2026-10" */
  month: string;
  /** First instant of the Oslo month */
  start: Date;
  /** First instant of the next Oslo month */
  end: Date;
  /** First and last Oslo day (YYYY-MM-DD), for DATE columns */
  firstDay: string;
  nextFirstDay: string;
};

/** The last `count` Oslo months, oldest first, ending with the month `now` is in */
export function trendMonths(now: Date, count: number): TrendMonth[] {
  const current = DateTime.fromJSDate(now).setZone(OSLO_ZONE).startOf("month");
  return Array.from({ length: count }, (_, index) => {
    const start = current.minus({ months: count - 1 - index });
    const end = start.plus({ months: 1 });
    return {
      month: start.toFormat("yyyy-MM"),
      start: start.toJSDate(),
      end: end.toJSDate(),
      firstDay: start.toISODate()!,
      nextFirstDay: end.toISODate()!,
    };
  });
}

/**
 * SQL for the index of `column`'s month, given each month's start and the last month's end as
 * SQL values: -1 before the window, `months` from its end on, NULL when the column is.
 */
function monthIndexSql(column: string, bounds: string[]): string {
  const whens = bounds.map((bound, index) => `WHEN ${column} < ${bound} THEN ${index - 1}`);
  return `CASE WHEN ${column} IS NULL THEN NULL ${whens.join(" ")} ELSE ${bounds.length - 1} END`;
}

/** Month index for a timestamp column (month starts as instants) */
const instantIndex = (column: string, months: TrendMonth[], clock: ColumnClock) =>
  monthIndexSql(column, [
    ...months.map((month) => sqlInstant(month.start, clock)),
    sqlInstant(months.at(-1)!.end, clock),
  ]);

/** Month index for a DATE column (Oslo calendar dates) */
const dateIndex = (column: string, months: TrendMonth[]) =>
  monthIndexSql(column, [
    ...months.map((month) => sqlString.escape(month.firstDay)),
    sqlString.escape(months.at(-1)!.nextFirstDay),
  ]);

export type DonationMonthRow = {
  idx: number;
  count: number;
  /** Decimal strings */
  sum: string;
  /** Recorded costs plus estimates for donations without one */
  costs: string;
  /** The estimated part of `costs` */
  estimatedCosts: string;
  /** Donations whose cost was estimated */
  estimatedCount: number;
};

/** Agreement starts or stops per month index (-1: before the window) */
export type AgreementMonthRow = { idx: number; started: number; stopped: number };

async function rows<T>(sql: string): Promise<T[]> {
  const [result] = await DAO.query(sql);
  return result as T[];
}

/**
 * Donations per month, all payment methods (as Home's headline). A donation without a
 * recorded transaction_cost gets its method's fee rule from Payment: flat_fee + percentage_fee
 * percent of the sum, rounded to øre.
 */
async function getDonationMonths(months: TrendMonth[]): Promise<DonationMonthRow[]> {
  const idx = instantIndex("D.timestamp_confirmed", months, "app");
  const estimate =
    "ROUND(COALESCE(P.flat_fee, 0) + D.sum_confirmed * COALESCE(P.percentage_fee, 0) / 100, 2)";
  return rows<DonationMonthRow>(`
    SELECT ${idx} AS idx,
      COUNT(*) AS count,
      SUM(D.sum_confirmed) AS sum,
      SUM(COALESCE(D.transaction_cost, ${estimate})) AS costs,
      SUM(CASE WHEN D.transaction_cost IS NULL THEN ${estimate} ELSE 0 END) AS estimatedCosts,
      SUM(D.transaction_cost IS NULL) AS estimatedCount
    FROM Donations D
      INNER JOIN Payment P ON P.ID = D.Payment_ID
    WHERE D.timestamp_confirmed >= ${sqlInstant(months[0].start)}
      AND D.timestamp_confirmed < ${sqlInstant(months.at(-1)!.end)}
    GROUP BY idx`);
}

/**
 * Vipps agreements that were ever active (status ACTIVE, or STOPPED with a cancellation date,
 * as the Vipps report counts them): started by timestamp_created (a DB-clock column), stopped
 * by cancellation_date. Index -1 sums everything before the window.
 */
async function getVippsAgreementMonths(months: TrendMonth[]): Promise<AgreementMonthRow[]> {
  const everActive = `(status = 'ACTIVE' OR (status = 'STOPPED' AND cancellation_date IS NOT NULL))`;
  return rows<AgreementMonthRow>(`
    SELECT idx, SUM(started) AS started, SUM(stopped) AS stopped FROM (
      SELECT ${instantIndex("timestamp_created", months, "db")} AS idx, 1 AS started, 0 AS stopped
        FROM Vipps_agreements WHERE ${everActive} AND timestamp_created IS NOT NULL
      UNION ALL
      SELECT ${dateIndex("cancellation_date", months)} AS idx, 0, 1
        FROM Vipps_agreements WHERE status = 'STOPPED' AND cancellation_date IS NOT NULL
    ) AS events
    GROUP BY idx`);
}

/**
 * AvtaleGiro agreements that were ever active (active, or inactive with a cancelled date, as
 * the AvtaleGiro report counts them): started by `created` (DB clock), stopped by `cancelled`.
 */
async function getAvtaleGiroAgreementMonths(months: TrendMonth[]): Promise<AgreementMonthRow[]> {
  return rows<AgreementMonthRow>(`
    SELECT idx, SUM(started) AS started, SUM(stopped) AS stopped FROM (
      SELECT ${instantIndex("created", months, "db")} AS idx, 1 AS started, 0 AS stopped
        FROM Avtalegiro_agreements
        WHERE (active = 1 OR cancelled IS NOT NULL) AND created IS NOT NULL
      UNION ALL
      SELECT ${dateIndex("cancelled", months)} AS idx, 0, 1
        FROM Avtalegiro_agreements WHERE active = 0 AND cancelled IS NOT NULL
    ) AS events
    GROUP BY idx`);
}

export type TrendPoint<T> = { month: string; value: T };

export type TrendSeries<T> = {
  points: TrendPoint<T>[];
  /** Some values are inferred rather than recorded; `note` says how */
  estimated: boolean;
  note?: string;
};

export type HomeTrends = {
  months: string[];
  /** The last month is the current one, so far */
  partialLast: true;
  donations: TrendSeries<string> & { counts: number[] };
  transactionCosts: TrendSeries<string>;
  /** Vipps + AvtaleGiro agreements active at each month's end (for the last: now) */
  activeAgreements: TrendSeries<number>;
  agreementsStarted: TrendSeries<number>;
  agreementsStopped: TrendSeries<number>;
};

const toNumber = (value: unknown) => Number(value ?? 0);

/** Puts the grouped rows on the months; pure, so it is unit tested */
export function buildHomeTrends(
  months: TrendMonth[],
  donations: DonationMonthRow[],
  agreements: AgreementMonthRow[][],
): HomeTrends {
  const keys = months.map((month) => month.month);
  const donationAt = new Map(donations.map((row) => [toNumber(row.idx), row]));
  const started = new Map<number, number>();
  const stopped = new Map<number, number>();
  for (const row of agreements.flat()) {
    const idx = toNumber(row.idx);
    started.set(idx, (started.get(idx) ?? 0) + toNumber(row.started));
    stopped.set(idx, (stopped.get(idx) ?? 0) + toNumber(row.stopped));
  }

  let active = (started.get(-1) ?? 0) - (stopped.get(-1) ?? 0);
  const activeAt = keys.map((_, index) => {
    active += (started.get(index) ?? 0) - (stopped.get(index) ?? 0);
    return active;
  });

  // SUM over DECIMAL(16,2) comes back as a decimal string with two decimals; NULL means none
  const money = (value: unknown) => (value == null ? "0.00" : String(value));
  const estimatedCount = donations.reduce((sum, row) => sum + toNumber(row.estimatedCount), 0);
  const series = <T>(values: T[]): TrendPoint<T>[] =>
    keys.map((month, index) => ({ month, value: values[index] }));

  return {
    months: keys,
    partialLast: true,
    donations: {
      points: series(keys.map((_, index) => money(donationAt.get(index)?.sum))),
      counts: keys.map((_, index) => toNumber(donationAt.get(index)?.count)),
      estimated: false,
    },
    transactionCosts: {
      points: series(keys.map((_, index) => money(donationAt.get(index)?.costs))),
      estimated: estimatedCount > 0,
      note:
        estimatedCount > 0
          ? `${estimatedCount} donations have no recorded cost; their payment method's fee (flat + percentage) is used.`
          : undefined,
    },
    activeAgreements: {
      points: series(activeAt),
      estimated: true,
      note: "Vipps and AvtaleGiro. Agreements count from their creation date until their cancellation date.",
    },
    agreementsStarted: {
      points: series(keys.map((_, index) => started.get(index) ?? 0)),
      estimated: false,
      note: "Vipps and AvtaleGiro agreements created that month that became active.",
    },
    agreementsStopped: {
      points: series(keys.map((_, index) => stopped.get(index) ?? 0)),
      estimated: false,
      note: "Vipps and AvtaleGiro agreements cancelled that month.",
    },
  };
}

async function getHomeTrends(now: Date = new Date(), count = 13): Promise<HomeTrends> {
  const months = trendMonths(now, count);
  const [donations, vipps, avtaleGiro] = await Promise.all([
    // Through the exported object, so tests can stub one query
    homeTrends.getDonationMonths(months),
    homeTrends.getVippsAgreementMonths(months),
    homeTrends.getAvtaleGiroAgreementMonths(months),
  ]);
  return buildHomeTrends(months, donations, [vipps, avtaleGiro]);
}

export const homeTrends = {
  getHomeTrends,
  getDonationMonths,
  getVippsAgreementMonths,
  getAvtaleGiroAgreementMonths,
};
