/**
 * Dates in Oslo time, whatever the browser's time zone. Gi Effektivt's days are Oslo days:
 * a donation at 23:30 on 31 December is in that year, and a "date" filter means whole Oslo
 * days. Two kinds of values move through the admin:
 *
 * - **Days** (`"2026-10-24"`): calendar dates in filters, forms and URLs. Sent to the API as
 *   they are, or, where a procedure compares instants, as the Oslo day's first/last instant
 *   (`osloDayStart` / `osloDayEnd`).
 * - **Instants** (ISO timestamps, `Date`): shown and edited as Oslo wall time.
 */

export const OSLO = "Europe/Oslo";

export type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: OSLO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** An instant as Oslo wall time. */
export function osloParts(date: Date): WallTime {
  const parts: Record<string, number> = {};
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** YYYY-MM-DD of an instant in Oslo (default: today in Oslo). */
export function osloDay(date: Date = new Date()): string {
  const { year, month, day } = osloParts(date);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** HH:mm of an instant in Oslo. */
export function osloTime(date: Date): string {
  const { hour, minute } = osloParts(date);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Oslo's offset from UTC at an instant, in minutes (60 in winter, 120 in summer). */
function osloOffsetMinutes(date: Date): number {
  const p = osloParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

const isoDayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Splits a YYYY-MM-DD into numbers; null unless it's a real calendar date. */
export function parseIsoDay(value: string): { year: number; month: number; day: number } | null {
  const match = isoDayPattern.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? { year, month, day }
    : null;
}

/** The instant an Oslo wall time happens. Null for an invalid day or time. */
export function osloInstant(isoDay: string, time = "00:00", seconds = 0, ms = 0): Date | null {
  const day = parseIsoDay(isoDay);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;
  const wall = Date.UTC(day.year, day.month - 1, day.day, hour, minute, seconds, ms);
  // Guess with the offset at the wall time read as UTC, then correct once around DST changes.
  let offset = osloOffsetMinutes(new Date(wall));
  offset = osloOffsetMinutes(new Date(wall - offset * 60_000));
  return new Date(wall - offset * 60_000);
}

/** First instant of an Oslo day, as ISO, for procedures that compare instants. */
export const osloDayStart = (isoDay: string) => osloInstant(isoDay)?.toISOString();
/** Last millisecond of an Oslo day, as ISO (inclusive "to"). */
export const osloDayEnd = (isoDay: string) => osloInstant(isoDay, "23:59", 59, 999)?.toISOString();

/** Calendar-day arithmetic on YYYY-MM-DD, independent of time zones. */
export function addDays(isoDay: string, days: number): string {
  const day = parseIsoDay(isoDay);
  if (!day) return isoDay;
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

/** A calendar Date (local midnight, as date pickers produce) as YYYY-MM-DD. */
export function dayOf(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD as a calendar Date (local midnight) for date pickers. */
export function dateOfDay(isoDay: string): Date | undefined {
  const day = parseIsoDay(isoDay);
  return day ? new Date(day.year, day.month - 1, day.day) : undefined;
}

/** "24.10.2026" for a YYYY-MM-DD; empty for nothing. */
export function formatDayText(isoDay: string | undefined | null): string {
  const day = isoDay ? parseIsoDay(isoDay) : null;
  return day ? `${pad(day.day)}.${pad(day.month)}.${pad(day.year, 4)}` : "";
}

/**
 * What people type for a date → YYYY-MM-DD, or null. Norwegian order: "24.10.2026",
 * "24.10.26", "24/10/2026", "24-10-2026", "24102026"; ISO "2026-10-24" too. Two-digit years
 * are 20xx.
 */
export function parseDayText(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  if (isoDayPattern.test(value)) return parseIsoDay(value) ? value : null;
  let match = /^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2}|\d{4})$/.exec(value);
  if (!match && /^\d{8}$/.test(value)) match = /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  if (!match && /^\d{6}$/.test(value)) match = /^(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return parseIsoDay(iso) ? iso : null;
}

/** An instant as Oslo local time for files people open in a spreadsheet: "2026-10-24 14:05:00". */
export function osloDateTimeText(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  const p = osloParts(date);
  return `${osloDay(date)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}
