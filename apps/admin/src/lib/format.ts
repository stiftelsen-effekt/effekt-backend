import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { enGB } from "date-fns/locale";
import { osloParts, parseIsoDay } from "./dates";
import { toMoneyString, type MoneyInput } from "./money";

export type DateInput = Date | string | number | null | undefined;

/** Norwegian numbers, currency and date patterns; words stay English (the UI language). */
const intl = "nb-NO";
const currencyCode = "NOK";

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(options: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options);
  let nf = cache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(intl, options);
    cache.set(key, nf);
  }
  return nf;
}

/**
 * How an amount is shown (docs/admin-design.md › Money):
 * - `exact` (the default): always two decimals, `1 500,00 kr`. Tables, record fields, inputs,
 *   statements, confirmations: anything read as a figure or scanned in a right-aligned column.
 * - `whole`: rounded to whole kroner, `1 500 kr`. Aggregates meant to be glanced at: stat
 *   cards, chart axes and tooltips, overview headline figures.
 * Never mix the two within one table or column.
 */
export type MoneyPrecision = "exact" | "whole";

/**
 * Amounts as numbers or as the API's decimal strings. Strings are formatted exactly (Intl
 * takes decimal strings), so "12345678901234.56" doesn't pick up float error. Missing
 * amounts are "–".
 */
export function formatMoney(
  value: MoneyInput | null | undefined,
  { currency = true, precision = "exact" }: { currency?: boolean; precision?: MoneyPrecision } = {},
) {
  const amount = toMoneyString(value);
  if (amount == null) return "–";
  const decimals = precision === "whole" ? 0 : 2;
  return numberFormat({
    style: currency ? "currency" : "decimal",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount as Intl.StringNumericLiteral);
}

/**
 * An amount as the text of a form input: Norwegian decimal comma, no grouping, always two
 * decimals like every exact amount ("1000,00", "249,50"). `parseMoneyInput` reads it back.
 * Empty for nothing.
 */
export function formatMoneyInput(value: MoneyInput | null | undefined): string {
  const amount = toMoneyString(value);
  if (amount == null) return "";
  return amount.replace(".", ",");
}

export function formatNumber(
  value: number | null | undefined,
  { decimals = 0 }: { decimals?: number } = {},
) {
  if (value == null || Number.isNaN(value)) return "–";
  return numberFormat({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Axis labels and slider ends: 1,8M / 450k, Norwegian digits, units language-neutral. */
export function formatCompact(value: number) {
  const abs = Math.abs(value);
  // One decimal below 10k / 10M, and only when it isn't zero: "7,5k", "5k", "15k".
  const scaled = (divisor: number, suffix: string) => {
    const shown = value / divisor;
    const decimals = Math.abs(shown) < 10 && Math.round(shown * 10) % 10 !== 0 ? 1 : 0;
    return `${formatNumber(shown, { decimals })}${suffix}`;
  };
  if (abs >= 1e6) return scaled(1e6, "M");
  if (abs >= 1e3) return scaled(1e3, "k");
  return formatNumber(value);
}

export function formatPercent(
  value: number | null | undefined,
  { decimals = 1 }: { decimals?: number } = {},
) {
  if (value == null || Number.isNaN(value)) return "–";
  return numberFormat({
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    // A calendar day is that day, not an instant: midnight local, so pickers and
    // formatting agree whatever the browser's time zone.
    const day = parseIsoDay(value);
    if (day) return new Date(day.year, day.month - 1, day.day);
  }
  const date = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

export type DateStyle = "date" | "datetime" | "time" | "month" | "relative";

const pad = (value: number) => String(value).padStart(2, "0");
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Dates and times as Oslo wall time (`24.10.2026`, `24.10.2026 14:05`), whatever the
 * browser's time zone. A YYYY-MM-DD string is a calendar day and is shown as that day.
 */
export function formatDate(value: DateInput, style: DateStyle = "date") {
  const day = typeof value === "string" ? parseIsoDay(value) : null;
  const date = toDate(value);
  if (!date) return "–";
  if (style === "relative")
    return formatDistanceToNowStrict(date, { locale: enGB, addSuffix: true });
  const p = day ? { ...day, hour: 0, minute: 0 } : osloParts(date);
  const dayText = `${pad(p.day)}.${pad(p.month)}.${p.year}`;
  const timeText = `${pad(p.hour)}:${pad(p.minute)}`;
  switch (style) {
    case "date":
      return dayText;
    case "datetime":
      return `${dayText} ${timeText}`;
    case "time":
      return timeText;
    // Words follow the UI language (English); numeric patterns are Norwegian.
    case "month":
      return `${monthNames[p.month - 1]} ${p.year}`;
  }
}
