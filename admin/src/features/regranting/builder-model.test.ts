import { describe, expect, it } from "vitest";
import {
  defaultTransferFor,
  lineFigures,
  lineKey,
  paymentFor,
  planSave,
  recipientLines,
  recipientTotals,
  savedPayments,
  setPayment,
  summarizeEdits,
  totalToPay,
  transferCountAfter,
  type LineEdit,
} from "./builder-model";
import type { BuilderLine, BuilderRecipient, Transfer } from "./model";

const givewell = { id: 1, name: "GiveWell", currency: "NOK" };
const gd = { id: 2, name: "GiveDirectly", currency: "USD" };

const line = (projectId: number | null, available: string, inRound = "0.00"): BuilderLine => ({
  balanceAtCutoff: available,
  committed: "0.00",
  fundGrants: "0.00",
  roundAdjustments: "0.00",
  available,
  proposed: available,
  inRound,
  carriesOver: "0.00",
  projectId,
  projectName: projectId === null ? null : `Project ${projectId}`,
  projectStatus: projectId === null ? null : "active",
  hold: null,
  held: false,
});

const recipient = (
  organizationId: number,
  payee: typeof givewell | null,
  lines: BuilderLine[],
): BuilderRecipient => ({
  organizationId,
  name: `Org ${organizationId}`,
  abbriv: `O${organizationId}`,
  inRound: true,
  payee,
  includeDirect: true,
  includeDirectOverride: null,
  hold: null,
  chosenAllocations: null,
  frontedOutstanding: [],
  lines,
  totals: {
    balanceAtCutoff: "0.00",
    committed: "0.00",
    fundGrants: "0.00",
    roundAdjustments: "0.00",
    available: "0.00",
    proposed: "0.00",
    inRound: "0.00",
    carriesOver: "0.00",
  },
});

const transfer = (
  id: number,
  payee: typeof givewell,
  lines: [number, number | null, string][],
): Transfer => ({
  id,
  roundId: 1,
  payee,
  amountNok: lines.reduce((s, l) => s + Number(l[2]), 0).toFixed(2),
  currency: payee.currency,
  amountForeign: null,
  fxRate: null,
  bankFee: null,
  paidAt: null,
  bankRef: null,
  paidBy: "foundation",
  documents: [],
  lines: lines.map(([organizationId, projectId, amountNok], i) => ({
    id: id * 100 + i,
    transferId: id,
    organizationId,
    organizationName: `Org ${organizationId}`,
    projectId,
    projectName: projectId === null ? null : `Project ${projectId}`,
    amountNok,
  })),
});

const builder = {
  recipients: [
    recipient(10, givewell, [line(null, "1000.10", "1000.10"), line(7, "250.00", "250.00")]),
    recipient(11, givewell, [line(null, "0.30", "0.30")]),
    recipient(20, gd, [line(null, "500.00")]),
    recipient(30, null, [line(null, "99.99")]),
  ],
  transfers: [
    transfer(100, givewell, [
      [10, null, "1000.10"],
      [10, 7, "250.00"],
      [11, null, "0.30"],
    ]),
  ],
};
const saved = savedPayments(builder.transfers);

describe("saved payments and line figures", () => {
  it("reads Pay now per line from the transfers", () => {
    expect(saved.get(lineKey(10, null))).toEqual({ amount: "1000.10", transferId: 100 });
    expect(paymentFor(saved, new Map(), 20, null)).toEqual({ amount: "0.00", transferId: null });
  });

  it("carries over what isn't paid, exactly", () => {
    const edits = setPayment(new Map(), saved, 10, null, { amount: "600.05", transferId: 100 });
    const figures = lineFigures(
      line(null, "1000.10"),
      paymentFor(saved, edits, 10, null),
      saved.get(lineKey(10, null))!.amount,
    );
    expect(figures).toEqual({
      available: "1000.10",
      payNow: "600.05",
      carriesOver: "400.05",
      changed: true,
    });
  });

  it("goes negative when paying more than available", () => {
    const figures = lineFigures(line(null, "0.10"), { amount: "0.30", transferId: 100 }, "0.10");
    expect(figures.carriesOver).toBe("-0.20");
  });

  it("totals a recipient over its lines", () => {
    const edits = setPayment(new Map(), saved, 10, 7, { amount: "100.00", transferId: 100 });
    expect(recipientTotals(builder.recipients[0]!, saved, edits, builder.transfers)).toEqual({
      available: "1250.10",
      payNow: "1100.10",
      carriesOver: "150.00",
    });
  });
});

describe("editing", () => {
  it("drops an edit that sets the saved value back", () => {
    let edits = setPayment(new Map(), saved, 10, null, { amount: "1.00", transferId: 100 });
    expect(edits.size).toBe(1);
    edits = setPayment(edits, saved, 10, null, { amount: "1000.10", transferId: 100 });
    expect(edits.size).toBe(0);
  });

  it("updates the round total and transfer count", () => {
    let edits = setPayment(new Map(), saved, 11, null, { amount: "0.00", transferId: 100 });
    edits = setPayment(edits, saved, 20, null, { amount: "500.00", transferId: null });
    expect(totalToPay(builder, edits)).toBe("1750.10");
    // GiveDirectly has no transfer yet: one more
    expect(transferCountAfter(builder, edits)).toBe(2);
  });

  it("shows locally added project lines", () => {
    const edits = setPayment(new Map(), saved, 20, 9, {
      amount: "10.00",
      transferId: null,
      projectName: "Cash in Malawi",
    });
    const lines = recipientLines(builder.recipients[2]!, saved, edits, builder.transfers);
    expect(lines.map((l) => [l.projectId, l.projectName])).toEqual([
      [null, null],
      [9, "Cash in Malawi"],
    ]);
  });
});

describe("planSave", () => {
  it("sends the whole line set of each changed transfer, and creates missing ones", () => {
    let edits: Map<string, LineEdit> = setPayment(new Map(), saved, 11, null, {
      amount: "0.00",
      transferId: 100,
    });
    edits = setPayment(edits, saved, 10, null, { amount: "900.00", transferId: 100 });
    edits = setPayment(edits, saved, 20, null, { amount: "123.45", transferId: null });
    const plan = planSave(builder, edits);
    expect(plan.setLines).toEqual([
      {
        id: 100,
        lines: [
          { organizationId: 10, projectId: 7, amountNok: 250 },
          { organizationId: 10, projectId: null, amountNok: 900 },
        ],
      },
    ]);
    expect(plan.create).toEqual([
      { payeeId: 2, lines: [{ organizationId: 20, projectId: null, amountNok: 123.45 }] },
    ]);
  });

  it("refuses to pay a recipient without a payee", () => {
    const edits = setPayment(new Map(), saved, 30, null, { amount: "1.00", transferId: null });
    expect(() => planSave(builder, edits)).toThrow(/no payee/);
  });

  it("summarizes before → after", () => {
    const edits = setPayment(new Map(), saved, 10, 7, { amount: "0.00", transferId: 100 });
    expect(summarizeEdits(builder, edits)).toEqual([
      {
        organizationId: 10,
        recipient: "Org 10",
        line: "Project 7",
        before: "250.00",
        after: "0.00",
      },
    ]);
  });
});

describe("transfers", () => {
  it("puts a line in the payee's transfer in its currency", () => {
    expect(defaultTransferFor(builder, givewell, null)).toBe(100);
    expect(defaultTransferFor(builder, gd, null)).toBeNull();
    expect(defaultTransferFor(builder, givewell, 999)).toBe(100);
  });
});
