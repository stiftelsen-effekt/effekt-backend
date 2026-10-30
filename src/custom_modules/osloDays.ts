/**
 * Date ranges in whole Europe/Oslo days, for list filters and reports.
 *
 * How timestamps are stored:
 * - The mysql2 pool uses `timezone: "+00:00"`, so a JS Date is written as its UTC wall clock and
 *   a stored value is read back as UTC. The pool doesn't set the session time zone, so MySQL
 *   uses the server's: +02:00 in production and in the dev compose DB, often SYSTEM/UTC elsewhere.
 * - Values the app writes (Donations.timestamp_confirmed, review items, ...) therefore hold the
 *   UTC wall clock of the instant, and comparisons with Dates from the app are exact.
 * - Values filled by a column DEFAULT (CURRENT_TIMESTAMP) or by NOW() in SQL hold the *session*
 *   wall clock: in production UTC+2 all year. Donors.date_registered, the agreements' created
 *   columns, Payment_intent.timestamp and Import_logs.timestamp are such columns; the full list is
 *   in docs/timestamps.md. Read them with `dbClockColumn` (or `dbClockToUtc`), which converts them
 *   to the UTC wall clock the pool expects, and compare them with `clock: "db"`, which shifts the
 *   bound by the session's UTC offset in SQL.
 *
 * Date-only payments (OCR, bank, AvtaleGiro, Vipps recurring due dates) are stored as UTC
 * midnight of the payment day, which lies inside the Oslo day of the same date.
 */
import { DateTime } from "luxon";
import sqlString from "sqlstring";

export const OSLO_ZONE = "Europe/Oslo";

/** A half-open range of instants: `from` inclusive, `before` exclusive. Either may be open. */
export type InstantRange = { from?: Date; before?: Date };

/** How a column's values relate to instants, see the module comment */
export type ColumnClock = "app" | "db";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const osloDay = (isoDate: string) => {
  const day = DateTime.fromISO(isoDate, { zone: OSLO_ZONE });
  if (!day.isValid) throw new RangeError(`Invalid date: ${isoDate}`);
  return day.startOf("day");
};

/** The instant an Oslo calendar day (YYYY-MM-DD) starts */
export const osloDayStart = (isoDate: string): Date => osloDay(isoDate).toJSDate();

/** The instant the Oslo calendar day after `isoDate` starts */
export const osloDayEnd = (isoDate: string): Date =>
  osloDay(isoDate).plus({ days: 1 }).startOf("day").toJSDate();

/** Today's date in Oslo, YYYY-MM-DD */
export const osloToday = (): string => DateTime.now().setZone(OSLO_ZONE).toISODate()!;

/**
 * Turns an inclusive range of Oslo days (YYYY-MM-DD) into instants: from the start of `from` to
 * the start of the day after `to`. Undefined when the range is.
 */
export function osloDayRange(
  range: { from?: string | null; to?: string | null } | null | undefined,
): InstantRange | undefined {
  if (!range) return undefined;
  return {
    from: range.from ? osloDayStart(range.from) : undefined,
    before: range.to ? osloDayEnd(range.to) : undefined,
  };
}

/**
 * Like osloDayRange, but each bound may also be a date-time with offset, which is taken as the
 * exact instant (`to` inclusive).
 */
export function osloDateOrInstantRange(
  range: { from?: string | null; to?: string | null } | null | undefined,
): InstantRange | undefined {
  if (!range) return undefined;
  const bound = (value: string | null | undefined, end: boolean) => {
    if (!value) return undefined;
    if (ISO_DATE.test(value)) return end ? osloDayEnd(value) : osloDayStart(value);
    const instant = new Date(value);
    // Inclusive `to`: stored values have whole seconds, so "< to + 1 ms" equals "<= to"
    return end ? new Date(instant.getTime() + 1) : instant;
  };
  return { from: bound(range.from, false), before: bound(range.to, true) };
}

/**
 * SQL for an instant as a value of a column with the given clock. "db" columns hold the
 * session's wall clock, so the UTC wall clock the pool sends is shifted by the session offset.
 */
export const sqlInstant = (instant: Date, clock: ColumnClock = "app"): string => {
  // UTC wall clock like the pool's `timezone: "+00:00"` (sqlstring defaults to the process's zone)
  const utc = sqlString.escape(instant, false, "Z");
  return clock === "db"
    ? `(${utc} + INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)`
    : utc;
};

/**
 * SQL converting a "db"-clock column (or expression) to the UTC wall clock, so the pool reads it as
 * the right instant. Uses the session's own zone, so it stays right if the server's zone changes.
 * Don't use it in WHERE clauses (it hides the column from indexes): compare the raw column with
 * `sqlInstant(..., "db")` instead.
 */
export const dbClockToUtc = (column: string): string =>
  `CONVERT_TZ(${column}, @@session.time_zone, '+00:00')`;

/**
 * A select-list item reading a "db"-clock column as UTC, aliased to the column's own name (or
 * `alias`): `CONVERT_TZ(T.created, @@session.time_zone, '+00:00') AS created`.
 * ORDER BY resolves an unqualified name to this alias, so order by the qualified column (`T.created`)
 * to keep the index.
 */
export const dbClockColumn = (column: string, alias = column.split(".").pop()!): string =>
  `${dbClockToUtc(column)} AS ${alias}`;

/** WHERE clauses limiting `column` to the range (none for an open or missing range) */
export function instantRangeClauses(
  column: string,
  range: InstantRange | null | undefined,
  clock: ColumnClock = "app",
): string[] {
  const clauses: string[] = [];
  if (range?.from) clauses.push(`${column} >= ${sqlInstant(range.from, clock)}`);
  if (range?.before) clauses.push(`${column} < ${sqlInstant(range.before, clock)}`);
  return clauses;
}
