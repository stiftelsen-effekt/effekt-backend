/**
 * Tracing regranting numbers (docs/regranting.md, "Tracing the numbers"): types of the trace
 * procedures, the Donations list search for a link, one-line summaries of what a payment
 * contained, and the CSV of the monthly check (Samlefila's overview layout).
 */
import { formatDate } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

export type Breakdown = RouterOutputs["regranting"]["balances"]["breakdown"];
export type BreakdownEntry = Breakdown["transfers"]["entries"][number];
export type CommittedEntry = Breakdown["committed"]["entries"][number];
export type AllocationMonth = Breakdown["allocations"]["months"][number];
export type Composition = RouterOutputs["regranting"]["rounds"]["composition"];
export type CompositionLine = Composition["lines"][number];
export type CompositionItem = CompositionLine["thisRound"]["items"][number];
export type Reconciliation = RouterOutputs["regranting"]["reconciliation"]["monthly"];

export type DonationsLink = { organizationId: number; from: string; to: string };

/**
 * Search params of the Donations list for an organization and an inclusive range of Oslo days,
 * restricted to the payment methods allocations count (all but Influenced and AMF direkte).
 */
export const donationsSearch = (link: DonationsLink, paymentMethodIds: readonly number[]) => ({
  org: String(link.organizationId),
  date: `${link.from}..${link.to}`,
  ...(paymentMethodIds.length ? { method: paymentMethodIds.join(",") } : {}),
});

/** "01.08.2026–31.10.2026" (or one day) */
export const dayRange = (from: string, to: string) =>
  from === to ? formatDate(from) : `${formatDate(from)}–${formatDate(to)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "August 2026", "Aug–Oct 2026", "Nov 2025–Jan 2026" for a run of months */
export function monthSpan(from: string, to: string): string {
  const a = formatDate(`${from.slice(0, 7)}-01`, "month");
  const b = formatDate(`${to.slice(0, 7)}-01`, "month");
  if (a === b) return a;
  const [aMonth, aYear] = a.split(" ");
  const [bMonth, bYear] = b.split(" ");
  return aYear === bYear ? `${aMonth}–${bMonth} ${bYear}` : `${a}–${b}`;
}

const itemSummary = (item: CompositionItem): string => {
  switch (item.kind) {
    case "donations":
      return `donations ${monthSpan(item.from, item.to)} (${plural(
        item.donationCount,
        "donation",
      )})`;
    case "donation":
      return item.reason === "chosen" ? "1 major donation" : "the fronted donation";
    case "opening":
      return "the opening balance";
    case "fund_grant_in":
      return `a fund grant from ${item.fundName}`;
    case "adjustment":
      return `an adjustment (${item.type.replace("_", " ")})`;
  }
};

/**
 * One line saying what a payment contained, in order: "2 major donations; carried over:
 * donations Feb–Apr 2026; since the last transfer: donations May–Jul 2026 (412 donations)".
 */
export function summarizeLine(line: CompositionLine): string {
  const parts: string[] = [];
  const chosen = line.thisRound.items.filter((i) => i.kind === "donation" && i.reason === "chosen");
  const own = [
    ...(chosen.length
      ? [chosen.length === 1 ? "1 major donation" : `${chosen.length} major donations`]
      : []),
    ...line.thisRound.items
      .filter((i) => !(i.kind === "donation" && i.reason === "chosen"))
      .map(itemSummary),
  ];
  if (own.length) parts.push(own.join(", "));
  if (line.carriedOver.items.length)
    parts.push(`carried over: ${line.carriedOver.items.map(itemSummary).join(", ")}`);
  if (line.sinceLastTransfer.items.length)
    parts.push(
      `${
        line.previous ? "since the last transfer" : "since the start"
      }: ${line.sinceLastTransfer.items.map(itemSummary).join(", ")}`,
    );
  if (line.ahead) parts.push("paid ahead of the money");
  const text = parts.join("; ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Nothing";
}

/** Each line's parts, as the API returns them, add up to its amount (shown as a check) */
export const lineTotal = (line: CompositionLine) =>
  sumMoney([
    line.thisRound.amount,
    line.carriedOver.amount,
    line.sinceLastTransfer.amount,
    line.ahead?.amount ?? "0.00",
  ]);

//region CSV of the monthly check

/** "1234.50" → "1234,50": Norwegian decimal comma, no grouping (spreadsheets parse it) */
export const decimalNo = (value: string) => value.replace(".", ",");

const csvCellNo = (value: string) =>
  /[";\r\n]/.test(value) || (/^[=+\-@]/.test(value) && !/^-?\d+(,\d+)?$/.test(value))
    ? `"${(/^[=+\-@]/.test(value) && !/^-?\d+(,\d+)?$/.test(value) ? `'${value}` : value).replace(
        /"/g,
        '""',
      )}"`
    : value;

const monthHeader = (month: string) => formatDate(`${month}-01`, "month");

/**
 * Samlefila's monthly overview: one row per recipient, one column per month and a total, then
 * the sum, Unassigned, confirmed donations and the difference. Semicolon-separated, Norwegian
 * decimals, months by name (UTC months, as the allocations).
 */
export function reconciliationCsv(check: Reconciliation): string {
  const header = ["Mottaker", "Forkortelse", ...check.months.map(monthHeader), "Totalt"];
  const rows: string[][] = [header];
  for (const r of check.recipients) {
    if (r.months.every((m) => m.allocated === "0.00")) continue;
    rows.push([
      r.name,
      r.abbriv,
      ...r.months.map((m) => decimalNo(m.allocated)),
      decimalNo(r.allocated),
    ]);
  }
  const totalsRow = (
    label: string,
    pick: (m: Reconciliation["totals"][number]) => string,
    all: string,
  ) => [label, "", ...check.totals.map((m) => decimalNo(pick(m))), decimalNo(all)];
  rows.push(totalsRow("Sum mottakere", (m) => m.allocated, check.total.allocated));
  rows.push(totalsRow("Uten fordeling (Unassigned)", (m) => m.unassigned, check.total.unassigned));
  rows.push(totalsRow("Sum inkl. uten fordeling", (m) => m.accounted, check.total.accounted));
  rows.push(
    totalsRow(
      "Bekreftede donasjoner (uten Influenced og AMF direkte)",
      (m) => m.donations,
      check.total.donations,
    ),
  );
  rows.push(totalsRow("Differanse", (m) => m.difference, check.total.difference));
  return `${rows.map((row) => row.map(csvCellNo).join(";")).join("\r\n")}\r\n`;
}

export const reconciliationFilename = (check: Reconciliation) =>
  `tildelinger-kontroll-${check.from}-${check.to}.csv`;

//endregion
