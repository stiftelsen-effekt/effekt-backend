import { Decimal } from "decimal.js";
import type { Money } from "./types";

/** Exact decimal arithmetic for ledger amounts; never use floats for money here */
export const dec = (value: string | number | Decimal | null | undefined): Decimal =>
  value === null || value === undefined ? new Decimal(0) : new Decimal(value);

export const ZERO = new Decimal(0);

/** Two-decimal string, no negative zero */
export const fmt = (value: Decimal): Money => {
  const fixed = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  return fixed === "-0.00" ? "0.00" : fixed;
};

export const sum = (values: (Decimal | string)[]): Decimal =>
  values.reduce<Decimal>((total, v) => total.plus(v), new Decimal(0));

export const max0 = (value: Decimal) => (value.isNegative() ? ZERO : value);

/** Today in Norway as an ISO date */
export const todayOslo = (): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());

/** The day before an ISO date */
export const dayBefore = (isoDate: string): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** An ISO date `days` days earlier */
export const daysBefore = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

//region Human-readable text (error and issue messages)

/** "2026-09-30" → "30.09.2026" (Norwegian date format) */
export const dateNo = (isoDate: string): string => {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
};

/** 1234.5 → "1 234,50 kr" (Norwegian number format, no-break spaces) */
export const krNo = (value: Decimal | string | number): string => {
  const fixed = fmt(dec(value));
  const negative = fixed.startsWith("-");
  const [int, frac] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "−" : ""}${grouped},${frac} kr`;
};

//endregion
