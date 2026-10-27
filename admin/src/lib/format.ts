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
 * Fraction digits for an amount, by the one money rule (DESIGN.md › Numbers): whole kroner
 * have none, anything with øre has two. So 1500 is "1 500 kr", 1234.5 is "1 234,50 kr" and
 * 0.3 is "0,30 kr" – the same value always reads the same, wherever it is.
 */
export function moneyDecimals(value: MoneyInput | null | undefined): 0 | 2 {
  const amount = toMoneyString(value);
  return amount != null && !amount.endsWith(".00") ? 2 : 0;
}

/**
 * Amounts as numbers or as the API's decimal strings, by the money rule above. Strings are
 * formatted exactly (Intl takes decimal strings), so "12345678901234.56" doesn't pick up
 * float error. Missing amounts are "–".
 */
export function formatMoney(
  value: MoneyInput | null | undefined,
  { currency = true }: { currency?: boolean } = {},
) {
  const amount = toMoneyString(value);
  if (amount == null) return "–";
  const decimals = moneyDecimals(amount);
  return numberFormat({
    style: currency ? "currency" : "decimal",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount as Intl.StringNumericLiteral);
}

/**
 * An amount as the text of a form input: Norwegian decimal comma, no grouping, øre only when
 * there are any ("1000", "249,50"). `parseMoneyInput` reads it back. Empty for nothing.
 */
export function formatMoneyInput(value: MoneyInput | null | undefined): string {
  const amount = toMoneyString(value);
  if (amount == null) return "";
  return amount.endsWith(".00") ? amount.slice(0, -3) : amount.replace(".", ",");
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
  if (abs >= 1e6) return `${formatNumber(value / 1e6, { decimals: abs >= 1e7 ? 0 : 1 })}M`;
  if (abs >= 1e3) return `${formatNumber(value / 1e3, { decimals: abs >= 1e4 ? 0 : 1 })}k`;
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
