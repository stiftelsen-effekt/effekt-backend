import { format as formatDateFns, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { appLocale, type LocaleSettings } from "./locale";

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

export function formatMoney(
  value: number | null | undefined,
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
  if (value == null || Number.isNaN(value)) return "–";
  return numberFormat(settings.intl, {
    style: currency ? "currency" : "decimal",
    currency: settings.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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

export function formatCompact(value: number, settings: LocaleSettings = appLocale) {
  return numberFormat(settings.intl, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
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
    case "month":
      return formatDateFns(date, "LLL yyyy", { locale });
    case "relative":
      return formatDistanceToNowStrict(date, { locale, addSuffix: true });
  }
}
