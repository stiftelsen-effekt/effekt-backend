/**
 * Calendar helpers on whole days. A day is an integer (days since 1970-01-01) and dates are
 * Norwegian wall-clock strings; no time zones are involved anywhere in the generator.
 */

const MS_PER_DAY = 86_400_000;

export function toDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function parts(day: number): { year: number; month: number; dom: number; dow: number } {
  const date = new Date(day * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    dom: date.getUTCDate(),
    /** 0 = Sunday */
    dow: date.getUTCDay(),
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isoDate(day: number): string {
  const { year, month, dom } = parts(day);
  return `${year}-${pad(month)}-${pad(dom)}`;
}

/** "YYYY-MM-DD HH:MM:SS" for a day and a number of seconds into it */
export function timestamp(day: number, seconds = 0): string {
  const s = Math.max(0, Math.min(86_399, Math.floor(seconds)));
  return `${isoDate(day)} ${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(
    s % 60,
  )}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstOfMonth(year: number, month: number): number {
  return Date.UTC(year, month - 1, 1) / MS_PER_DAY;
}

export function isLastDayOfMonth(day: number): boolean {
  return parts(day + 1).dom === 1;
}

/** Today in Norway, or SEED_NOW (YYYY-MM-DD) when set */
export function todayInNorway(): number {
  const override = process.env.SEED_NOW;
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override))
      throw new Error(`SEED_NOW must be YYYY-MM-DD, got ${override}`);
    return toDay(override);
  }
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return toDay(formatted);
}

function easterSunday(year: number): number {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, dayOfMonth) / MS_PER_DAY;
}

const holidayCache = new Map<number, Set<number>>();
function holidays(year: number): Set<number> {
  let set = holidayCache.get(year);
  if (!set) {
    const easter = easterSunday(year);
    set = new Set([
      toDay(`${year}-01-01`),
      easter - 3,
      easter - 2,
      easter + 1,
      toDay(`${year}-05-01`),
      toDay(`${year}-05-17`),
      easter + 39,
      easter + 50,
      toDay(`${year}-12-25`),
      toDay(`${year}-12-26`),
    ]);
    holidayCache.set(year, set);
  }
  return set;
}

/** Norwegian bank day: not a weekend or public holiday */
export function isBankDay(day: number): boolean {
  const { year, dow } = parts(day);
  return dow !== 0 && dow !== 6 && !holidays(year).has(day);
}

export function nextBankDay(day: number): number {
  let d = day;
  while (!isBankDay(d)) d++;
  return d;
}
