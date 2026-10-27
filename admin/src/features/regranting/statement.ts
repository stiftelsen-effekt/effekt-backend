/**
 * Recipient statement: entry descriptions and the CSV export (client-side, Oslo dates). The
 * API sends days as YYYY-MM-DD (already Oslo days) and amounts as decimal strings, which are
 * written as they are.
 */
import { toCsv } from "@/lib/download";
import { adjustmentTypeLabels, type Statement, type StatementEntry } from "./model";

export const entryKindLabels: Record<StatementEntry["kind"], string> = {
  allocations: "Donations",
  fund_grant_in: "Fund grant in",
  fund_grant_out: "Fund grant out",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

/** One line of text saying what an entry is. */
export function describeEntry(entry: StatementEntry): string {
  switch (entry.kind) {
    case "allocations":
      return entry.donationCount === 1 ? "1 donation" : `${entry.donationCount ?? 0} donations`;
    case "fund_grant_in":
      return `From ${entry.counterpartName ?? "own fund"}${
        entry.rationale ? `: ${entry.rationale}` : ""
      }`;
    case "fund_grant_out":
      return `To ${entry.counterpartName ?? "recipient"}${
        entry.rationale ? `: ${entry.rationale}` : ""
      }`;
    case "transfer":
      return [entry.payeeName && `To ${entry.payeeName}`, entry.bankRef && `ref ${entry.bankRef}`]
        .filter(Boolean)
        .join(" · ");
    case "adjustment":
      return [entry.adjustmentType && adjustmentTypeLabels[entry.adjustmentType], entry.reason]
        .filter(Boolean)
        .join(": ");
  }
}

export type ProjectFilter = "all" | "unrestricted" | number;

/** The statement procedure's projectId: omitted for all, null for unrestricted. */
export const toProjectInput = (filter: ProjectFilter): { projectId?: number | null } =>
  filter === "all" ? {} : { projectId: filter === "unrestricted" ? null : filter };

export function statementCsv(statement: Statement): string {
  const rows: Record<string, unknown>[] = [
    {
      date: statement.from,
      type: "Opening balance",
      project: "",
      description: "",
      amount: "",
      balance: statement.openingBalance,
      counts_in_balance: "",
      round: "",
      reference: "",
    },
    ...statement.entries.map((e) => ({
      date: e.date,
      type:
        e.kind === "adjustment" && e.adjustmentType
          ? adjustmentTypeLabels[e.adjustmentType]
          : entryKindLabels[e.kind],
      project: e.projectId === null ? "Unrestricted" : e.projectName ?? `Project ${e.projectId}`,
      description: describeEntry(e),
      amount: e.amount,
      balance: e.balanceAfter,
      counts_in_balance: e.affectsBalance ? "yes" : e.pending ? "pending" : "no",
      round: e.roundName ?? "",
      reference: e.bankRef ?? "",
    })),
    {
      date: statement.to,
      type: "Closing balance",
      project: "",
      description: "",
      amount: "",
      balance: statement.closingBalance,
      counts_in_balance: "",
      round: "",
      reference: "",
    },
  ];
  return toCsv(rows);
}

export const statementFilename = (statement: Statement, abbriv?: string) =>
  `statement-${(abbriv || statement.name).replace(/[^\w-]+/g, "-")}-${statement.from}-${
    statement.to
  }.csv`;
