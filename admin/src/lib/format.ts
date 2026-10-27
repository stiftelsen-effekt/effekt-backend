import { format as formatDateFns, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { enGB } from "date-fns/locale";
import { appLocale, type LocaleSettings } from "./locale";
import { toMoneyString, type MoneyInput } from "./money";

export type DateInput = Date | string | number | null | undefined;

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(intl: string, options: Intl.NumberFormatOptions) {
  const key = intl + JSON.stringify(options);
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
  {
    decimals = 0,
    currency = true,
    settings = appLocale,
  }: {
    decimals?: number;
    currency?: boolean;
    settings?: LocaleSettings;
  } = {},
) {
  const amount = toMoneyString(value);
  if (amount == null) return "–";
  return numberFormat(settings.intl, {
    style: currency ? "currency" : "decimal",
    currency: settings.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount as Intl.StringNumericLiteral);
}

export function formatNumber(
  value: number | null | undefined,
  { decimals = 0, settings = appLocale }: { decimals?: number; settings?: LocaleSettings } = {},
) {
  if (value == null || Number.isNaN(value)) return "–";
  return numberFormat(settings.intl, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Axis labels and slider ends: 1,8M / 450k, digits per locale, units language-neutral. */
export function formatCompact(value: number, settings: LocaleSettings = appLocale) {
  const abs = Math.abs(value);
  if (abs >= 1e6)
    return `${formatNumber(value / 1e6, { decimals: abs >= 1e7 ? 0 : 1, settings })}M`;
  if (abs >= 1e3)
    return `${formatNumber(value / 1e3, { decimals: abs >= 1e4 ? 0 : 1, settings })}k`;
  return formatNumber(value, { settings });
}

export function formatPercent(
  value: number | null | undefined,
  { decimals = 1, settings = appLocale }: { decimals?: number; settings?: LocaleSettings } = {},
) {
  if (value == null || Number.isNaN(value)) return "–";
  return numberFormat(settings.intl, {
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

export function formatDate(
  value: DateInput,
  style: DateStyle = "date",
  settings: LocaleSettings = appLocale,
) {
  const date = toDate(value);
  if (!date) return "–";
  const locale = settings.dateFns;
  switch (style) {
    case "date":
      return formatDateFns(date, settings.datePattern, { locale });
    case "datetime":
      return formatDateFns(date, `${settings.datePattern} HH:mm`, { locale });
    case "time":
      return formatDateFns(date, "HH:mm", { locale });
    // Words follow the UI language (English); numeric patterns follow the country.
    case "month":
      return formatDateFns(date, "LLL yyyy", { locale: enGB });
    case "relative":
      return formatDistanceToNowStrict(date, { locale: enGB, addSuffix: true });
  }
}
