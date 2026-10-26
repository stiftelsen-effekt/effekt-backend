import type * as React from "react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  toDate,
  type DateInput,
  type DateStyle,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SpanProps = Omit<React.ComponentProps<"span">, "children">;

export function Money({
  value,
  decimals,
  currency = true,
  signed = false,
  className,
  ...props
}: SpanProps & {
  value: number | null | undefined;
  decimals?: number;
  currency?: boolean;
  signed?: boolean;
}) {
  const negative = value != null && value < 0;
  return (
    <span
      data-slot="money"
      className={cn("num whitespace-nowrap", signed && negative && "text-destructive", className)}
      {...props}
    >
      {signed && value != null && value > 0 ? "+" : ""}
      {formatMoney(value, { decimals, currency })}
    </span>
  );
}

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

export function DateTime({
  value,
  format = "date",
  className,
  ...props
}: Omit<React.ComponentProps<"time">, "children"> & { value: DateInput; format?: DateStyle }) {
  const date = toDate(value);
  if (!date) {
    return (
      <time className={cn("text-muted-foreground", className)} {...props}>
        –
      </time>
    );
  }
  return (
    <time
      data-slot="date-time"
      dateTime={date.toISOString()}
      title={format === "relative" ? formatDate(date, "datetime") : undefined}
      className={cn("num whitespace-nowrap", className)}
      {...props}
    >
      {formatDate(date, format)}
    </time>
  );
}
