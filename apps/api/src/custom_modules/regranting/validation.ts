import { dateNo, krNo, sum } from "./money";
import type { ProposedPosition } from "./proposal";
import type {
  FundGrant,
  Issue,
  IssueCode,
  PayeeRef,
  RoundDonation,
  Transfer,
  Unassigned,
} from "./types";
import { dec } from "./money";

/**
 * "Validation before approval" from docs/regranting.md. Errors block approval; warnings are
 * shown but don't. Each issue points at what the admin should render it next to.
 *
 * Errors: an own fund in a transfer line; fund grants over the fund's balance at the cutoff; a
 * fund grant without rationale; a transfer whose lines don't sum to its amount; a project on a
 * line that belongs to another recipient. Also errors, because the first version doesn't allow
 * them: a fund grant to an own fund, and (major_donor) a donation another round already passed on.
 * Warnings: negative balances, recipients without a payee, an "Unassigned" balance.
 */
export type ValidationInput = {
  /** All positions of the round (recipients and own funds) with what is in the round */
  positions: ProposedPosition[];
  fundIds: Set<number>;
  transfers: Transfer[];
  fundGrants: FundGrant[];
  /** Project id → its organization, for every project on a line */
  projectOrganizations: Map<number, number>;
  /** Payee per recipient at the cutoff */
  payees: Map<number, PayeeRef>;
  unassigned: Unassigned;
  /** major_donor rounds: the chosen donations */
  donations: RoundDonation[];
  organizationNames: Map<number, string>;
  /** Project names for messages (falls back to the line's name, then the id) */
  projectNames?: Map<number, { name: string }>;
  /** Other rounds' names for messages (a donation passed on by another round) */
  roundNames?: Map<number, { name: string; cutoff: string }>;
};

const issue = (
  severity: Issue["severity"],
  code: IssueCode,
  message: string,
  refs: Partial<Omit<Issue, "severity" | "code" | "message">> = {},
): Issue => ({
  severity,
  code,
  message,
  organizationId: null,
  projectId: null,
  transferId: null,
  transferLineId: null,
  fundGrantId: null,
  fundGrantLineId: null,
  donationId: null,
  ...refs,
});

export function validateRound(input: ValidationInput): Issue[] {
  const issues: Issue[] = [];
  const name = (id: number) => input.organizationNames.get(id) ?? `Recipient #${id}`;
  const projectName = (id: number, fallback?: string | null) =>
    input.projectNames?.get(id)?.name ?? fallback ?? `Project #${id}`;
  const roundName = (id: number) => {
    const round = input.roundNames?.get(id);
    return round ? `${round.name} (cutoff ${dateNo(round.cutoff)})` : `round #${id}`;
  };

  // No own fund appears in a transfer line
  for (const transfer of input.transfers) {
    for (const line of transfer.lines) {
      if (input.fundIds.has(line.organizationId)) {
        issues.push(
          issue(
            "error",
            "own_fund_in_transfer",
            `${name(
              line.organizationId,
            )} is an own fund and can't be paid directly; grant from it instead`,
            {
              organizationId: line.organizationId,
              projectId: line.projectId,
              transferId: transfer.id,
              transferLineId: line.id,
            },
          ),
        );
      }
    }
  }

  // Fund grants don't exceed the fund's balance at the cutoff (less what other rounds committed)
  const grantedByFund = new Map<number, FundGrant[]>();
  for (const grant of input.fundGrants) {
    grantedByFund.set(grant.fundId, [...(grantedByFund.get(grant.fundId) ?? []), grant]);
  }
  for (const [fundId, grants] of grantedByFund) {
    const granted = sum(grants.map((g) => g.total));
    const fund = input.positions.filter((p) => p.organizationId === fundId);
    const balance = sum(
      fund.map((p) => p.balanceAtCutoff.minus(p.committed).plus(p.roundAdjustments)),
    );
    if (granted.greaterThan(balance)) {
      issues.push(
        issue(
          "error",
          "fund_grant_exceeds_balance",
          `Grants from ${name(fundId)} (${krNo(granted)}) exceed its balance at the cutoff (${krNo(
            balance,
          )})`,
          { organizationId: fundId, fundGrantId: grants.length === 1 ? grants[0].id : null },
        ),
      );
    }
  }

  for (const grant of input.fundGrants) {
    // Every fund grant has a rationale
    if (grant.rationale.trim() === "") {
      issues.push(
        issue(
          "error",
          "fund_grant_missing_rationale",
          `The grant from ${grant.fundName} needs a rationale`,
          {
            organizationId: grant.fundId,
            fundGrantId: grant.id,
          },
        ),
      );
    }
    for (const line of grant.lines) {
      // Fund-to-fund grants are not allowed in the first version
      if (input.fundIds.has(line.organizationId)) {
        issues.push(
          issue(
            "error",
            "fund_to_fund_grant",
            `${grant.fundName} can't grant to ${name(line.organizationId)}, another own fund`,
            {
              organizationId: line.organizationId,
              fundGrantId: grant.id,
              fundGrantLineId: line.id,
            },
          ),
        );
      }
      // Projects on lines belong to the line's recipient
      if (
        line.projectId !== null &&
        input.projectOrganizations.get(line.projectId) !== line.organizationId
      ) {
        issues.push(
          issue(
            "error",
            "project_recipient_mismatch",
            `${projectName(line.projectId, line.projectName)} is not a project at ${name(
              line.organizationId,
            )}`,
            {
              organizationId: line.organizationId,
              projectId: line.projectId,
              fundGrantId: grant.id,
              fundGrantLineId: line.id,
            },
          ),
        );
      }
    }
  }

  for (const transfer of input.transfers) {
    // Each transfer's lines sum to its amount
    const lines = sum(transfer.lines.map((l) => l.amountNok));
    if (!lines.equals(dec(transfer.amountNok))) {
      issues.push(
        issue(
          "error",
          "transfer_lines_mismatch",
          `The transfer to ${transfer.payee.name} is ${krNo(
            transfer.amountNok,
          )} but its lines sum to ${krNo(lines)}`,
          { transferId: transfer.id },
        ),
      );
    }
    for (const line of transfer.lines) {
      if (
        line.projectId !== null &&
        input.projectOrganizations.get(line.projectId) !== line.organizationId
      ) {
        issues.push(
          issue(
            "error",
            "project_recipient_mismatch",
            `${projectName(line.projectId, line.projectName)} is not a project at ${name(
              line.organizationId,
            )}`,
            {
              organizationId: line.organizationId,
              projectId: line.projectId,
              transferId: transfer.id,
              transferLineId: line.id,
            },
          ),
        );
      }
    }
  }

  // major_donor: a donation is passed on once
  for (const donation of input.donations) {
    if (donation.excludedReason === "passed_on") {
      const by =
        donation.passedOnByRoundId !== null
          ? `by ${roundName(donation.passedOnByRoundId)}`
          : "as a fronted amount";
      issues.push(
        issue(
          "error",
          "donation_already_passed_on",
          `Donation #${donation.donationId} of ${krNo(
            donation.sum,
          )} was already passed on ${by}; remove it from this round`,
          { donationId: donation.donationId },
        ),
      );
    }
  }

  // Warnings: negative balances after the round
  for (const p of input.positions) {
    if (input.fundIds.has(p.organizationId)) continue;
    const after = p.available.minus(p.inRound);
    if (after.isNegative()) {
      issues.push(
        issue(
          "warning",
          "negative_balance",
          `${name(p.organizationId)}${
            p.projectId !== null ? ` (${projectName(p.projectId)})` : ""
          } is at ${krNo(after)} after this round`,
          { organizationId: p.organizationId, projectId: p.projectId },
        ),
      );
    }
  }

  // Warnings: recipients with money (or lines) but no payee at the cutoff
  const orgsWithMoney = new Set<number>();
  for (const p of input.positions) {
    if (input.fundIds.has(p.organizationId)) continue;
    if (p.available.greaterThan(0) || p.inRound.greaterThan(0)) orgsWithMoney.add(p.organizationId);
  }
  for (const organizationId of orgsWithMoney) {
    if (!input.payees.has(organizationId)) {
      issues.push(
        issue(
          "warning",
          "recipient_without_payee",
          `${name(organizationId)} has no payee at the cutoff; add one under Payees`,
          { organizationId },
        ),
      );
    }
  }

  // Warnings: money in "Unassigned" (donations without a split)
  if (!dec(input.unassigned.amount).isZero()) {
    issues.push(
      issue(
        "warning",
        "unassigned_balance",
        `${krNo(input.unassigned.amount)} from ${
          input.unassigned.donationCount
        } donations has no split ("Unassigned"); set their split in the donation database`,
      ),
    );
  }

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");

/**
 * A recorded payment must add up: a foreign-currency transfer has the amount paid in that
 * currency and the FX rate, and amountForeign × fxRate is the transfer's NOK amount within
 * max(1 kr, 0.5 %); a NOK transfer has neither. The bank fee is not negative. Returns what is
 * wrong, in words, or null.
 */
export function paymentProblem(payment: {
  currency: string;
  amountNok: string;
  amountForeign: string | null;
  fxRate: string | null;
  bankFee: number | string | null;
}): string | null {
  const { currency } = payment;
  if (payment.bankFee !== null && dec(payment.bankFee).isNegative()) {
    return "The bank fee can't be negative";
  }
  if (currency === "NOK") {
    if (payment.amountForeign !== null || payment.fxRate !== null) {
      return "A NOK transfer has no foreign amount or FX rate; clear them, or set the currency the bank paid in";
    }
    return null;
  }
  if (payment.amountForeign === null || payment.fxRate === null) {
    const missing = [
      payment.amountForeign === null ? `the amount paid in ${currency}` : null,
      payment.fxRate === null ? `the FX rate (NOK per ${currency})` : null,
    ].filter(Boolean);
    return `A ${currency} transfer needs ${missing.join(" and ")}`;
  }
  const expected = dec(payment.amountNok);
  const converted = dec(payment.amountForeign).times(payment.fxRate);
  const tolerance = expected.abs().times("0.005");
  const allowed = tolerance.greaterThan(1) ? tolerance : dec(1);
  if (converted.minus(expected).abs().greaterThan(allowed)) {
    return `${payment.amountForeign} ${currency} at ${payment.fxRate} NOK/${currency} is ${krNo(
      converted,
    )}, but the transfer is ${krNo(expected)} (more than ${krNo(
      allowed,
    )} apart). Check the amount and the rate against the bank statement`;
  }
  return null;
}
