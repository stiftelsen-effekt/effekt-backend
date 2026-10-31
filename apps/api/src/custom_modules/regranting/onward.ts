import { Decimal } from "decimal.js";
import { dateNo, dec, fmt, krNo, sum, ZERO } from "./money";
import type {
  IsoDate,
  Money,
  OnwardBasis,
  OnwardFigures,
  OnwardKind,
  OnwardLineRef,
  OnwardStatus,
} from "./types";

/**
 * Downstream regrants (docs/regranting-downstream.md): the onward status of a line and the
 * validation of onward allocations. Pure functions; the router loads the data. Onward records
 * sit beside the ledger and never change a balance.
 */

/** Note on every allocation the bulk backfill creates */
export const ASSUMED_NOTE = "Assumed forwarded in full; no report found";

/** reported, assumed and awaiting NOK of a paid line to an intermediary payee, and its status */
export function onwardFigures(
  lineAmountNok: Money,
  allocations: { basis: OnwardBasis; amountNok: Money }[],
): OnwardFigures {
  const reported = sum(allocations.filter((a) => a.basis === "reported").map((a) => a.amountNok));
  const assumed = sum(allocations.filter((a) => a.basis === "assumed").map((a) => a.amountNok));
  const awaiting = dec(lineAmountNok).minus(reported).minus(assumed);
  let status: OnwardStatus;
  if (allocations.length === 0) status = "awaiting";
  else if (awaiting.greaterThan(0)) status = "partly_forwarded";
  else status = assumed.greaterThan(0) ? "forwarded_assumed" : "forwarded";
  return {
    reportedNok: fmt(reported),
    assumedNok: fmt(assumed),
    awaitingNok: fmt(awaiting),
    status,
  };
}

/** An allocation being created or updated, with what the router looked up about it */
export type AllocationDraft = {
  kind: OnwardKind;
  basis: OnwardBasis;
  organizationId: number | null;
  externalGranteeId: number | null;
  projectId: number | null;
  /** The recipient the project belongs to (null without a project) */
  projectOrganizationId: number | null;
  currency: string;
  amountForeign: string | null;
  /** null: calculated from amountForeign (see resolveAmountNok) */
  amountNok: Money | null;
  forwardedAt: IsoDate;
  reportId: number | null;
  /** The payee of the report (null without a report) */
  reportPayeeId: number | null;
  note: string | null;
};

/** The line's other allocations (not the one being edited) */
export type OtherAllocation = {
  basis: OnwardBasis;
  currency: string;
  amountForeign: string | null;
  amountNok: Money;
};

export type AllocationCheck = {
  /** amount_nok to store; null when an error prevents calculating it */
  amountNok: Money | null;
  errors: string[];
  warnings: string[];
};

/**
 * NOK share of the line: entered directly, or amount_foreign × the transfer's fx_rate when the
 * allocation is in the transfer's currency (NOK: the same amount). When that brings the line's
 * allocations to within rounding of the whole line, the remainder is used so they add up to the
 * line exactly.
 */
function resolveAmountNok(
  line: OnwardLineRef,
  draft: Pick<AllocationDraft, "currency" | "amountForeign" | "amountNok">,
  others: OtherAllocation[],
): Decimal | null {
  if (draft.amountNok !== null) return dec(draft.amountNok);
  if (draft.amountForeign === null) return null;
  let exact: Decimal;
  if (draft.currency === "NOK") exact = dec(draft.amountForeign);
  else if (draft.currency === line.transferCurrency && line.fxRate)
    exact = dec(draft.amountForeign).times(line.fxRate);
  else return null;
  const rounded = exact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const remainder = dec(line.amountNok).minus(sum(others.map((o) => o.amountNok)));
  // Within rounding of covering the line (half a cent of the foreign amount at the rate, plus 1
  // øre, per allocation): take the remainder, so the line's NOK shares add up exactly
  const perAllocation =
    draft.currency === "NOK" || !line.fxRate
      ? new Decimal("0.01")
      : new Decimal("0.005").times(line.fxRate).plus("0.01");
  const tolerance = perAllocation.times(others.length + 1);
  if (remainder.minus(rounded).abs().lessThanOrEqualTo(tolerance) && remainder.greaterThan(0))
    return remainder;
  return rounded;
}

/**
 * The validation rules of docs/regranting-downstream.md › Validation. Errors block the save;
 * warnings are returned with it.
 */
export function checkAllocation(
  line: OnwardLineRef,
  draft: AllocationDraft,
  others: OtherAllocation[],
): AllocationCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const target = line.projectName
    ? `${line.organizationName} (${line.projectName})`
    : line.organizationName;

  if (!line.intermediary)
    errors.push(
      `${line.payeeName} isn't an intermediary payee; lines paid to it need no onward records`,
    );
  if (!line.paidAt) errors.push(`Transfer #${line.transferId} isn't paid yet`);

  // Target
  if (draft.kind === "grant") {
    const targets = [draft.organizationId, draft.externalGranteeId].filter((t) => t !== null);
    if (targets.length !== 1)
      errors.push("A grant goes to exactly one recipient or external grantee");
  } else {
    if (
      draft.organizationId !== null ||
      draft.externalGranteeId !== null ||
      draft.projectId !== null
    )
      errors.push("A retained amount has no recipient, grantee or project");
    if (!draft.note) errors.push("Say why the intermediary kept it in the note");
  }
  if (draft.projectId !== null) {
    if (draft.organizationId === null)
      errors.push("A project can only be given with one of our recipients");
    else if (draft.projectOrganizationId !== draft.organizationId)
      errors.push("The project belongs to another recipient");
  }

  // Basis
  if (draft.basis === "reported") {
    if (draft.reportId === null) errors.push("Pick the report this comes from");
    else if (draft.reportPayeeId !== line.payeeId)
      errors.push(`The report is from another payee than ${line.payeeName}`);
  } else {
    if (line.regrantingFund)
      errors.push(
        `${line.organizationName} regrants by its own decision; enter only what ${line.payeeName} reported`,
      );
    if (
      draft.kind !== "grant" ||
      draft.organizationId !== line.organizationId ||
      draft.projectId !== line.projectId
    )
      errors.push(`An assumed allocation goes to the line's own recipient, ${target}`);
  }

  // Pass-through redirected: a warning, with the note explaining it
  if (
    !line.regrantingFund &&
    draft.basis === "reported" &&
    draft.kind === "grant" &&
    (draft.organizationId !== line.organizationId ||
      (draft.projectId !== null && draft.projectId !== line.projectId))
  ) {
    if (!draft.note) errors.push(`Explain in the note why this didn't go to ${target}`);
    else warnings.push(`Forwarded to someone other than the line's recipient, ${target}`);
  }

  // Amounts
  const amountNok = resolveAmountNok(line, draft, others);
  if (amountNok === null) {
    errors.push(
      draft.amountForeign === null
        ? "Enter the amount"
        : `Enter the NOK amount: ${draft.currency} isn't the transfer's currency (${line.transferCurrency})`,
    );
  } else if (!amountNok.greaterThan(0)) {
    errors.push("The amount must be more than 0");
  } else {
    const total = sum(others.map((o) => o.amountNok)).plus(amountNok);
    if (total.greaterThan(line.amountNok))
      errors.push(
        `The line's allocations would add up to ${krNo(total)}, more than the line's ${krNo(
          line.amountNok,
        )}`,
      );
  }

  if (draft.currency !== line.transferCurrency)
    warnings.push(
      `${draft.currency} differs from the transfer's currency (${line.transferCurrency}); the NOK amount is entered directly`,
    );

  if (line.transferAmountForeign && line.fxRate && draft.basis === "reported") {
    const reportedForeign = [
      ...others.filter((o) => o.basis === "reported"),
      { currency: draft.currency, amountForeign: draft.amountForeign },
    ]
      .filter((o) => o.currency === line.transferCurrency && o.amountForeign !== null)
      .map((o) => dec(o.amountForeign));
    const lineForeign = dec(line.amountNok).div(line.fxRate);
    const reportedTotal = reportedForeign.reduce((s, v) => s.plus(v), ZERO);
    if (
      reportedTotal.greaterThan(lineForeign.plus(new Decimal("0.01").times(reportedForeign.length)))
    )
      warnings.push(
        `Reported ${line.transferCurrency} amounts add up to ${reportedTotal.toFixed(
          2,
        )}, more than the line's ${lineForeign.toFixed(2)}`,
      );
  }

  if (line.paidAt && draft.forwardedAt < line.paidAt)
    warnings.push(
      `Forwarded ${dateNo(draft.forwardedAt)}, before we paid ${line.payeeName} on ${dateNo(
        line.paidAt,
      )}`,
    );

  return { amountNok: amountNok && errors.length === 0 ? fmt(amountNok) : null, errors, warnings };
}

/**
 * The allocation "Confirm forwarded" proposes for a line: a pass-through line in full to its own
 * recipient (and project), in our transfer's currency, net of what's already entered
 */
export function prefillForwarded(
  line: OnwardLineRef,
  awaitingNok: Money,
): {
  kind: "grant";
  basis: "reported";
  organizationId: number;
  projectId: number | null;
  currency: string;
  amountForeign: string | null;
  amountNok: Money;
} {
  const awaiting = dec(awaitingNok);
  const foreign =
    line.transferCurrency !== "NOK" && line.fxRate
      ? awaiting.div(line.fxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
      : null;
  return {
    kind: "grant",
    basis: "reported",
    organizationId: line.organizationId,
    projectId: line.projectId,
    currency: line.transferCurrency,
    amountForeign: foreign,
    amountNok: fmt(awaiting),
  };
}
