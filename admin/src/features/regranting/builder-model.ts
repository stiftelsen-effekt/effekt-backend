/**
 * The round builder's client-side state: "Pay now" edits held locally until saved, and the
 * figures that follow from them (carries over, totals per recipient, payee and round). All
 * money is exact (lib/money.ts); the API's figures are the starting point and the save sends
 * whole line sets per transfer (regranting.transfers.setLines / create).
 */
import { compareMoney, fromMinorUnits, moneySign, sumMoney, toMinorUnits } from "@/lib/money";
import type { Builder, BuilderLine, BuilderRecipient, Transfer } from "./model";

export const lineKey = (organizationId: number, projectId: number | null) =>
  `${organizationId}:${projectId ?? ""}`;

/** What one (recipient, project) line pays now, and from which transfer. */
export type LinePayment = {
  /** Canonical decimal string ("1234.50") */
  amount: string;
  /** The transfer the line is (or goes) in; null = a new transfer to the recipient's payee */
  transferId: number | null;
};

/** A local edit. `projectName` names project lines that aren't in the builder yet. */
export type LineEdit = LinePayment & { projectName?: string | null };

export type Edits = ReadonlyMap<string, LineEdit>;

const subtract = (a: string, b: string) => fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
const max0 = (value: string) => (moneySign(value) < 0 ? "0.00" : value);

/** The round's lines as saved: amount per (recipient, project), summed over transfers. */
export function savedPayments(transfers: readonly Transfer[]): Map<string, LinePayment> {
  const result = new Map<string, LinePayment>();
  for (const transfer of transfers) {
    for (const line of transfer.lines) {
      const key = lineKey(line.organizationId, line.projectId);
      const current = result.get(key);
      result.set(key, {
        amount: sumMoney([current?.amount, line.amountNok]),
        transferId: current?.transferId ?? transfer.id,
      });
    }
  }
  return result;
}

/** A line's payment with local edits applied. */
export function paymentFor(
  saved: ReadonlyMap<string, LinePayment>,
  edits: Edits,
  organizationId: number,
  projectId: number | null,
): LinePayment {
  const key = lineKey(organizationId, projectId);
  const edit = edits.get(key);
  if (edit) return { amount: edit.amount, transferId: edit.transferId };
  return saved.get(key) ?? { amount: "0.00", transferId: null };
}

export type LineFigures = {
  available: string;
  payNow: string;
  /** available − payNow: what stays in the balance */
  carriesOver: string;
  /** Pay now differs from the saved value */
  changed: boolean;
};

export function lineFigures(
  line: Pick<BuilderLine, "available">,
  payment: LinePayment,
  savedAmount: string,
): LineFigures {
  return {
    available: line.available,
    payNow: payment.amount,
    carriesOver: subtract(line.available, payment.amount),
    changed: compareMoney(payment.amount, savedAmount) !== 0,
  };
}

const zeroLine = (projectId: number | null, projectName: string | null): BuilderLine => ({
  balanceAtCutoff: "0.00",
  committed: "0.00",
  fundGrants: "0.00",
  available: "0.00",
  proposed: "0.00",
  inRound: "0.00",
  carriesOver: "0.00",
  projectId,
  projectName,
  projectStatus: null,
  hold: null,
  held: false,
});

/**
 * A recipient's rows: the builder's lines, plus project lines added locally (or present only in
 * the transfers) so they can be edited.
 */
export function recipientLines(
  recipient: BuilderRecipient,
  saved: ReadonlyMap<string, LinePayment>,
  edits: Edits,
  transfers: readonly Transfer[],
): BuilderLine[] {
  const lines = [...recipient.lines];
  const known = new Set(lines.map((l) => lineKey(recipient.organizationId, l.projectId)));
  const names = new Map<number, string | null>();
  for (const t of transfers)
    for (const l of t.lines)
      if (l.organizationId === recipient.organizationId && l.projectId !== null)
        names.set(l.projectId, l.projectName);
  for (const [key, edit] of edits) {
    const [org, project] = key.split(":");
    if (Number(org) !== recipient.organizationId || !project) continue;
    names.set(Number(project), edit.projectName ?? names.get(Number(project)) ?? null);
  }
  for (const key of saved.keys()) {
    const [org, project] = key.split(":");
    if (Number(org) === recipient.organizationId && project && !names.has(Number(project)))
      names.set(Number(project), null);
  }
  for (const [projectId, name] of names) {
    const key = lineKey(recipient.organizationId, projectId);
    if (!known.has(key)) {
      known.add(key);
      lines.push(zeroLine(projectId, name));
    }
  }
  return lines;
}

export type Totals = { available: string; payNow: string; carriesOver: string };

export function recipientTotals(
  recipient: BuilderRecipient,
  saved: ReadonlyMap<string, LinePayment>,
  edits: Edits,
  transfers: readonly Transfer[],
): Totals {
  const lines = recipientLines(recipient, saved, edits, transfers);
  const payNow = sumMoney(
    lines.map((l) => paymentFor(saved, edits, recipient.organizationId, l.projectId).amount),
  );
  const available = sumMoney(lines.map((l) => l.available));
  return { available, payNow, carriesOver: subtract(available, payNow) };
}

export const sumTotals = (totals: readonly Totals[]): Totals => ({
  available: sumMoney(totals.map((t) => t.available)),
  payNow: sumMoney(totals.map((t) => t.payNow)),
  carriesOver: sumMoney(totals.map((t) => t.carriesOver)),
});

/**
 * The transfer a line goes in when its Pay now is set: where it already is, else the first of
 * the round's transfers to the recipient's payee (in the payee's currency if there is one),
 * else null (a new transfer is created on save).
 */
export function defaultTransferFor(
  builder: Pick<Builder, "transfers">,
  payee: { id: number; currency: string } | null,
  current: number | null,
): number | null {
  if (current !== null && builder.transfers.some((t) => t.id === current)) return current;
  if (!payee) return null;
  const toPayee = builder.transfers.filter((t) => t.payee.id === payee.id);
  return (toPayee.find((t) => t.currency === payee.currency) ?? toPayee[0])?.id ?? null;
}

/** Sets a line's Pay now (and transfer). Returns new edits; an edit equal to the saved line is dropped. */
export function setPayment(
  edits: Edits,
  saved: ReadonlyMap<string, LinePayment>,
  organizationId: number,
  projectId: number | null,
  next: LineEdit,
): Map<string, LineEdit> {
  const key = lineKey(organizationId, projectId);
  const result = new Map(edits);
  const before = saved.get(key) ?? { amount: "0.00", transferId: null };
  const same =
    compareMoney(before.amount, next.amount) === 0 &&
    (before.transferId === next.transferId || moneySign(next.amount) === 0);
  if (same && next.projectName === undefined) result.delete(key);
  else if (same && saved.has(key)) result.delete(key);
  else result.set(key, next);
  return result;
}

export type SavePlan = {
  /** Existing transfers whose lines change: the full new line set */
  setLines: {
    id: number;
    lines: { organizationId: number; projectId: number | null; amountNok: number }[];
  }[];
  /** New transfers, one per payee (in the payee's currency) */
  create: {
    payeeId: number;
    lines: { organizationId: number; projectId: number | null; amountNok: number }[];
  }[];
};

/**
 * Turns local edits into API calls: each edited line is removed from every transfer and put in
 * its target transfer (or a new one to the recipient's payee). Lines at 0 are dropped. The API
 * takes amounts as numbers; a canonical two-decimal string converts exactly.
 */
export function planSave(
  builder: Pick<Builder, "transfers" | "recipients">,
  edits: Edits,
): SavePlan {
  const payeeOf = new Map(builder.recipients.map((r) => [r.organizationId, r.payee]));
  const lines = new Map<
    number,
    Map<string, { organizationId: number; projectId: number | null; amount: string }>
  >();
  const touched = new Set<number>();
  for (const t of builder.transfers) {
    lines.set(
      t.id,
      new Map(
        t.lines.map((l) => [
          lineKey(l.organizationId, l.projectId),
          { organizationId: l.organizationId, projectId: l.projectId, amount: l.amountNok },
        ]),
      ),
    );
  }
  const created = new Map<
    number,
    Map<string, { organizationId: number; projectId: number | null; amount: string }>
  >();

  for (const [key, edit] of edits) {
    const [orgText, projectText] = key.split(":");
    const organizationId = Number(orgText);
    const projectId = projectText ? Number(projectText) : null;
    for (const [id, set] of lines) {
      if (set.delete(key)) touched.add(id);
    }
    if (moneySign(edit.amount) <= 0) continue;
    const line = { organizationId, projectId, amount: edit.amount };
    if (edit.transferId !== null && lines.has(edit.transferId)) {
      lines.get(edit.transferId)!.set(key, line);
      touched.add(edit.transferId);
      continue;
    }
    const payee = payeeOf.get(organizationId);
    if (!payee) throw new Error(`Recipient ${organizationId} has no payee; it can't be paid`);
    if (!created.has(payee.id)) created.set(payee.id, new Map());
    created.get(payee.id)!.set(key, line);
  }

  const toApi = (
    set: Map<string, { organizationId: number; projectId: number | null; amount: string }>,
  ) =>
    [...set.values()].map((l) => ({
      organizationId: l.organizationId,
      projectId: l.projectId,
      amountNok: Number(l.amount),
    }));
  return {
    setLines: [...touched].map((id) => ({ id, lines: toApi(lines.get(id)!) })),
    create: [...created].map(([payeeId, set]) => ({ payeeId, lines: toApi(set) })),
  };
}

export type EditSummary = {
  organizationId: number;
  recipient: string;
  line: string;
  before: string;
  after: string;
};

/** Before → after per changed line, for the save confirmation. */
export function summarizeEdits(
  builder: Pick<Builder, "transfers" | "recipients">,
  edits: Edits,
): EditSummary[] {
  const saved = savedPayments(builder.transfers);
  const names = new Map(builder.recipients.map((r) => [r.organizationId, r.name]));
  const result: EditSummary[] = [];
  for (const [key, edit] of edits) {
    const [orgText, projectText] = key.split(":");
    const organizationId = Number(orgText);
    const before = saved.get(key)?.amount ?? "0.00";
    const projectName =
      edit.projectName ??
      builder.recipients
        .find((r) => r.organizationId === organizationId)
        ?.lines.find((l) => String(l.projectId ?? "") === projectText)?.projectName ??
      builder.transfers
        .flatMap((t) => t.lines)
        .find((l) => lineKey(l.organizationId, l.projectId) === key)?.projectName ??
      null;
    result.push({
      organizationId,
      recipient: names.get(organizationId) ?? `Recipient #${organizationId}`,
      line: projectText ? projectName ?? `Project #${projectText}` : "Unrestricted",
      before,
      after: edit.amount,
    });
  }
  return result.sort(
    (a, b) => a.recipient.localeCompare(b.recipient) || a.line.localeCompare(b.line),
  );
}

/** Total to pay with edits applied: the saved transfers' total plus every edit's difference. */
export function totalToPay(builder: Pick<Builder, "transfers">, edits: Edits): string {
  const saved = savedPayments(builder.transfers);
  let total = toMinorUnits(sumMoney(builder.transfers.map((t) => t.amountNok)));
  for (const [key, edit] of edits) {
    total += toMinorUnits(edit.amount) - toMinorUnits(saved.get(key)?.amount ?? "0");
  }
  return fromMinorUnits(total);
}

/** Bank transfers after saving: existing ones that still have lines, plus new ones per payee. */
export function transferCountAfter(
  builder: Pick<Builder, "transfers" | "recipients">,
  edits: Edits,
): number {
  if (edits.size === 0) return builder.transfers.length;
  const plan = planSave(builder, edits);
  const emptied = new Set(plan.setLines.filter((s) => s.lines.length === 0).map((s) => s.id));
  return builder.transfers.filter((t) => !emptied.has(t.id)).length + plan.create.length;
}

/**
 * Earmarking part of an unrestricted balance to a project: the money moves (two reallocation
 * adjustments, made by the caller) and so does the payment, so Pay now in total stays the
 * same. Returns the edits that move up to `amount` of the unrestricted line's Pay now to the
 * project line, in the same transfer.
 */
export function earmarkEdits(
  edits: Edits,
  saved: ReadonlyMap<string, LinePayment>,
  organizationId: number,
  project: { id: number; name: string },
  amount: string,
): Map<string, LineEdit> {
  const unrestricted = paymentFor(saved, edits, organizationId, null);
  const projectPayment = paymentFor(saved, edits, organizationId, project.id);
  const moved = compareMoney(amount, unrestricted.amount) > 0 ? unrestricted.amount : amount;
  if (moneySign(moved) <= 0) return new Map(edits);
  let next = setPayment(edits, saved, organizationId, null, {
    ...unrestricted,
    amount: max0(subtract(unrestricted.amount, moved)),
  });
  next = setPayment(next, saved, organizationId, project.id, {
    amount: sumMoney([projectPayment.amount, moved]),
    transferId: projectPayment.transferId ?? unrestricted.transferId,
    projectName: project.name,
  });
  return next;
}
