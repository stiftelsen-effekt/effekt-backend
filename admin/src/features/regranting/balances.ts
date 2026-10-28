/**
 * The Balances page: one row per recipient, expandable to its projects, plus Unassigned. Flags
 * say what needs a look; sorting is client-side (the API returns every recipient at once).
 */
import { compareMoney, moneySign } from "@/lib/money";
import type { BalancesRecipient, BalancesView, LedgerFigures } from "./model";

export type BalanceFlag = {
  id: "held-too-long" | "hold" | "fronted" | "inactive" | "negative" | "no-payee";
  label: string;
  tone: "warning" | "danger" | "neutral";
  title: string;
};

export function recipientFlags(r: BalancesRecipient): BalanceFlag[] {
  const flags: BalanceFlag[] = [];
  if (r.heldTooLong && moneySign(r.heldTooLong) > 0)
    flags.push({
      id: "held-too-long",
      label: "Held too long",
      tone: "warning",
      title: `Part of the fund's balance is older than ${r.maxHoldDays} days`,
    });
  if (r.hold)
    flags.push({
      id: "hold",
      label: "On hold",
      tone: "warning",
      title: `${r.hold.reason}${r.hold.until ? ` (until ${r.hold.until})` : ""}`,
    });
  if (moneySign(r.frontedOutstanding) > 0)
    flags.push({
      id: "fronted",
      label: "Fronted",
      tone: "warning",
      title: "Paid before the donation arrived; the donation isn't registered yet",
    });
  if (!r.isActive && moneySign(r.total.balance) !== 0)
    flags.push({
      id: "inactive",
      label: "Inactive",
      tone: "neutral",
      title: "No longer shown to donors, but still has a balance",
    });
  if (moneySign(r.total.balance) < 0)
    flags.push({
      id: "negative",
      label: "Negative",
      tone: "danger",
      title: "Balance is below zero",
    });
  if (!r.isFund && !r.payee && moneySign(r.total.available) > 0)
    flags.push({
      id: "no-payee",
      label: "No payee",
      tone: "warning",
      title: "Has money but no payee today; add a routing under Payees",
    });
  return flags;
}

export type BalanceRow =
  | { kind: "recipient"; id: string; recipient: BalancesRecipient; figures: LedgerFigures }
  | {
      kind: "project";
      id: string;
      recipient: BalancesRecipient;
      project: BalancesRecipient["projects"][number];
      figures: LedgerFigures;
    }
  | { kind: "unassigned"; id: string; amount: string; donationCount: number };

export const balanceSorts = [
  "name",
  "balance",
  "available",
  "committed",
  "inflow",
  "lastTransfer",
] as const;
export type BalanceSort = (typeof balanceSorts)[number];

function compareRecipients(a: BalancesRecipient, b: BalancesRecipient, sort: BalanceSort) {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name, "nb");
    case "balance":
      return compareMoney(a.total.balance, b.total.balance);
    case "available":
      return compareMoney(a.total.available, b.total.available);
    case "committed":
      return compareMoney(a.total.committed, b.total.committed);
    case "inflow":
      return compareMoney(a.inflowSinceLastRound, b.inflowSinceLastRound);
    case "lastTransfer":
      return (a.lastTransfer?.paidAt ?? "").localeCompare(b.lastTransfer?.paidAt ?? "");
  }
}

/**
 * Rows in display order: recipients (own funds first, then by the sort), each followed by its
 * projects when expanded; Unassigned last when it has money. `q` matches name or abbreviation.
 */
export function balanceRows(
  view: BalancesView,
  {
    sort,
    desc,
    expanded,
    q,
    hideEmpty,
  }: {
    sort: BalanceSort;
    desc: boolean;
    expanded: ReadonlySet<number>;
    q?: string;
    hideEmpty?: boolean;
  },
): BalanceRow[] {
  const needle = q?.trim().toLowerCase();
  const recipients = view.recipients
    .filter(
      (r) =>
        !needle || r.name.toLowerCase().includes(needle) || r.abbriv.toLowerCase().includes(needle),
    )
    .filter(
      (r) =>
        !hideEmpty ||
        moneySign(r.total.balance) !== 0 ||
        moneySign(r.total.committed) !== 0 ||
        r.projects.length > 0,
    )
    .sort(
      (a, b) =>
        Number(b.isFund) - Number(a.isFund) ||
        (desc ? -1 : 1) * compareRecipients(a, b, sort) ||
        a.name.localeCompare(b.name, "nb"),
    );
  const rows: BalanceRow[] = [];
  for (const recipient of recipients) {
    rows.push({
      kind: "recipient",
      id: `r${recipient.organizationId}`,
      recipient,
      figures: recipient.total,
    });
    if (expanded.has(recipient.organizationId)) {
      if (recipient.projects.length > 0)
        rows.push({
          kind: "project",
          id: `r${recipient.organizationId}-u`,
          recipient,
          project: {
            projectId: 0,
            name: "Unrestricted",
            status: null,
            hold: recipient.hold,
            figures: recipient.unrestricted,
          },
          figures: recipient.unrestricted,
        });
      for (const project of recipient.projects)
        rows.push({
          kind: "project",
          id: `r${recipient.organizationId}-p${project.projectId}`,
          recipient,
          project,
          figures: project.figures,
        });
    }
  }
  if (!needle && moneySign(view.unassigned.amount) !== 0)
    rows.push({
      kind: "unassigned",
      id: "unassigned",
      amount: view.unassigned.amount,
      donationCount: view.unassigned.donationCount,
    });
  return rows;
}
