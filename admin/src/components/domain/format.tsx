import type * as React from "react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  toDate,
  type DateInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SpanProps = Omit<React.ComponentProps<"span">, "children">;

/**
 * The only way to show an amount of money. Currency comes from the build locale (NOK/SEK),
 * digits are tabular so columns line up, negatives are red only when `signed`.
 * API amounts are sometimes decimal strings; pass them straight in.
 */
export function Money({
  value,
  decimals,
  currency = true,
  signed = false,
  className,
  ...props
}: SpanProps & {
  value: number | string | null | undefined;
  decimals?: number;
  currency?: boolean;
  /** Show + / − and colour negatives (refunds, corrections). */
  signed?: boolean;
}) {
  const amount = typeof value === "string" ? Number(value) : value;
  const negative = amount != null && amount < 0;
  return (
    <span
      data-slot="money"
      className={cn("num whitespace-nowrap", signed && negative && "text-danger", className)}
      {...props}
    >
      {signed && amount != null && amount > 0 ? "+" : ""}
      {formatMoney(amount, { decimals, currency })}
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
