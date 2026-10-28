import { createContext, useContext } from "react";
import type * as React from "react";
import {
  formatDate,
  formatMoney,
  type MoneyPrecision,
  formatNumber,
  formatPercent,
  toDate,
  type DateInput,
} from "@/lib/format";
import { moneySign, toMoneyString, type MoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";

type SpanProps = Omit<React.ComponentProps<"span">, "children">;

const MoneyPrecisionContext = createContext<MoneyPrecision>("exact");

/**
 * Sets the default precision for every `Money` inside: `Stat` wraps its value in `whole`, so
 * headline figures round to kroner without each call site choosing.
 */
export function MoneyPrecisionProvider({
  precision,
  children,
}: {
  precision: MoneyPrecision;
  children: React.ReactNode;
}) {
  return <MoneyPrecisionContext value={precision}>{children}</MoneyPrecisionContext>;
}

/**
 * The only way to show an amount of money, in NOK. Digits are tabular so columns line up,
 * and negatives are red only when `signed`. `precision` follows the money rule
 * (`formatMoney`): `exact` (two decimals, the default) for tables, fields and anything
 * right-aligned; `whole` kroner for glanceable aggregates (inside `Stat` it is the default).
 * Missing amounts are "–". API amounts are decimal strings; pass them straight in.
 */
export function Money({
  value,
  currency = true,
  signed = false,
  precision,
  className,
  ...props
}: SpanProps & {
  value: MoneyInput | null | undefined;
  currency?: boolean;
  /** Show + / − and colour negatives (refunds, corrections). */
  signed?: boolean;
  /** Defaults to the surrounding `MoneyPrecisionProvider`, else `exact`. */
  precision?: MoneyPrecision;
}) {
  const inherited = useContext(MoneyPrecisionContext);
  const amount = toMoneyString(value);
  const sign = amount == null ? 0 : moneySign(amount);
  return (
    <span
      data-slot="money"
      className={cn("num whitespace-nowrap", signed && sign < 0 && "text-danger", className)}
      {...props}
    >
      {signed && sign > 0 ? "+" : ""}
      {formatMoney(amount, { currency, precision: precision ?? inherited })}
    </span>
  );
}

/** Counts, percentages and other plain numbers. */
export function Num({
  value,
  decimals,
  percent = false,
  className,
  ...props
}: SpanProps & { value: number | null | undefined; decimals?: number; percent?: boolean }) {
  return (
    <span data-slot="num" className={cn("num whitespace-nowrap", className)} {...props}>
      {percent ? formatPercent(value, { decimals }) : formatNumber(value, { decimals })}
    </span>
  );
}

export type DateTimeFormat = "date" | "datetime" | "relative" | "month";

/**
 * Dates. Tables and forms use absolute dates (`date` / `datetime`) because they scan and
 * sort; activity and "last seen" style facts use `relative`. Either way the other form is
 * in the tooltip, so both are always one hover away.
 */
export function DateTime({
  value,
  format = "date",
  className,
  ...props
}: Omit<React.ComponentProps<"time">, "children"> & { value: DateInput; format?: DateTimeFormat }) {
  const date = toDate(value);
  if (!date) {
    return (
      <span className={cn("text-faint-foreground", className)} aria-label="No date">
        –
      </span>
    );
  }
  const title =
    format === "relative"
      ? formatDate(date, "datetime")
      : `${formatDate(date, "datetime")} · ${formatDate(date, "relative")}`;
  return (
    <time
      data-slot="date-time"
      dateTime={date.toISOString()}
      title={title}
      className={cn("num whitespace-nowrap", className)}
      {...props}
    >
      {formatDate(date, format)}
    </time>
  );
}
