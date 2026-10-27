import { format as formatDateFns, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { enGB, nb } from "date-fns/locale";
import { toMoneyString, type MoneyInput } from "./money";

export type DateInput = Date | string | number | null | undefined;

/** Norwegian numbers, currency and date patterns; words stay English (the UI language). */
const intl = "nb-NO";
const currencyCode = "NOK";
const datePattern = "dd.MM.yyyy";

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
 * Amounts as numbers or as the API's decimal strings. Strings are formatted exactly (Intl
 * takes decimal strings), so "12345678901234.56" doesn't pick up float error.
 */
export function formatMoney(
  value: MoneyInput | null | undefined,
  { decimals = 0, currency = true }: { decimals?: number; currency?: boolean } = {},
) {
  const amount = toMoneyString(value);
  if (amount == null) return "–";
  return numberFormat({
    style: currency ? "currency" : "decimal",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount as Intl.StringNumericLiteral);
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
  const date = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

export type DateStyle = "date" | "datetime" | "time" | "month" | "relative";

export function formatDate(value: DateInput, style: DateStyle = "date") {
  const date = toDate(value);
  if (!date) return "–";
  switch (style) {
    case "date":
      return formatDateFns(date, datePattern, { locale: nb });
    case "datetime":
      return formatDateFns(date, `${datePattern} HH:mm`, { locale: nb });
    case "time":
      return formatDateFns(date, "HH:mm", { locale: nb });
    // Words follow the UI language (English); numeric patterns are Norwegian.
    case "month":
      return formatDateFns(date, "LLL yyyy", { locale: enGB });
    case "relative":
      return formatDistanceToNowStrict(date, { locale: enGB, addSuffix: true });
  }
}
