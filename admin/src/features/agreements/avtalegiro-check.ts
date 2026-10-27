/**
 * The AvtaleGiro check: for a charge date, which agreements we expected a payment from,
 * which payments arrived, and which are missing. The validation overview lists the last
 * month by day of month.
 */
import { addMonths, format, isValid, parseISO } from "date-fns";
import { compareMoney, sumMoney } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

export type ExpectedRow = RouterOutputs["giro"]["avtalegiro"]["expected"][number];
export type ReceivedRow = RouterOutputs["giro"]["avtalegiro"]["received"][number];
export type MissingRow = RouterOutputs["giro"]["avtalegiro"]["missing"][number];
export type ValidationRow = RouterOutputs["giro"]["avtalegiro"]["validation"][number];

export const isoDay = (date: Date) => format(date, "yyyy-MM-dd");

/** A valid YYYY-MM-DD from the URL, or today. */
export function checkDate(raw: unknown, today: Date): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && isValid(parseISO(raw))) {
    return raw;
  }
  return isoDay(today);
}

/**
 * The calendar date a validation row is about. The overview covers the last month: days of
 * the month up to today are this month, later ones last month (as get_avtalegiro_validation
 * computes them). Day 0 ("last day") and days that don't exist in that month have no date.
 */
export function validationDate(dayOfMonth: number, today: Date): string | null {
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  const month = dayOfMonth <= today.getDate() ? today : addMonths(today, -1);
  const date = new Date(month.getFullYear(), month.getMonth(), dayOfMonth);
  return date.getMonth() === month.getMonth() ? isoDay(date) : null;
}

export type CheckSummary = {
  expectedCount: number;
  expectedSum: string;
  receivedCount: number;
  receivedSum: string;
  missingCount: number;
  missingSum: string;
};

export function summarizeCheck(
  expected: Pick<ExpectedRow, "amount">[],
  received: Pick<ReceivedRow, "sum">[],
  missing: Pick<MissingRow, "amount">[],
): CheckSummary {
  return {
    expectedCount: expected.length,
    expectedSum: sumMoney(expected.map((row) => row.amount)),
    receivedCount: received.length,
    receivedSum: sumMoney(received.map((row) => row.sum)),
    missingCount: missing.length,
    missingSum: sumMoney(missing.map((row) => row.amount)),
  };
}

/** How a validation row reads: everything in, some missing, or nothing yet. */
export function validationState(row: Pick<ValidationRow, "expected" | "actual">) {
  if (compareMoney(row.actual ?? 0, row.expected ?? 0) >= 0) return "complete" as const;
  if (compareMoney(row.actual ?? 0, 0) > 0) return "partial" as const;
  return "none" as const;
}
