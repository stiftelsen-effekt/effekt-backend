import { describe, expect, it } from "vitest";
import {
  decimalNo,
  donationsSearch,
  lineTotal,
  monthSpan,
  reconciliationCsv,
  summarizeLine,
  type CompositionLine,
  type Reconciliation,
} from "./trace-model";

const round = {
  id: 24,
  name: "Juli 2026",
  kind: "regular",
  status: "paid",
  cutoff: "2026-07-31",
} as const;

const line = (overrides: Partial<CompositionLine> = {}): CompositionLine =>
  ({
    transferId: 1,
    transferLineId: 2,
    payee: { id: 1, name: "GiveWell", currency: "USD" },
    paidAt: "2026-08-11",
    organizationId: 2,
    organizationName: "GiveWell Top Charities Fund",
    projectId: null,
    projectName: null,
    amount: "1500.50",
    previous: {
      round: { ...round, id: 23, cutoff: "2026-04-30" },
      transferId: 9,
      payeeName: "GiveWell",
      paidAt: "2026-05-12",
    },
    window: { from: "2026-05-01", to: "2026-07-31" },
    thisRound: { amount: "0.00", items: [] },
    carriedOver: {
      amount: "500.25",
      items: [
        {
          kind: "donations",
          from: "2026-02-03",
          to: "2026-04-30",
          amount: "500.25",
          donationCount: 12,
          partialStart: true,
          partialEnd: false,
          months: [],
          link: { organizationId: 2, from: "2026-02-03", to: "2026-04-30" },
        },
      ],
    },
    sinceLastTransfer: {
      amount: "1000.25",
      items: [
        {
          kind: "donations",
          from: "2026-05-01",
          to: "2026-07-30",
          amount: "1000.25",
          donationCount: 412,
          partialStart: false,
          partialEnd: true,
          months: [],
          link: { organizationId: 2, from: "2026-05-01", to: "2026-07-30" },
        },
      ],
    },
    ahead: null,
    leftAfter: { amount: "10.00", oldest: "2026-07-30" },
    ...overrides,
  } as CompositionLine);

describe("tracing", () => {
  it("links the Donations list to an organization, Oslo days and the counted payment methods", () => {
    expect(
      donationsSearch({ organizationId: 2, from: "2026-08-01", to: "2026-08-31" }, [2, 4, 7]),
    ).toEqual({
      org: "2",
      date: "2026-08-01..2026-08-31",
      method: "2,4,7",
    });
  });

  it("names a run of months", () => {
    expect(monthSpan("2026-05-01", "2026-07-30")).toMatch(/–/);
    expect(monthSpan("2026-05-01", "2026-05-30")).not.toMatch(/–/);
  });

  it("says in one line what a payment contained", () => {
    const text = summarizeLine(line());
    expect(text).toMatch(/^Carried over: donations/);
    expect(text).toMatch(/since the last transfer: donations .*412 donations/);
    expect(lineTotal(line())).toBe("1500.50");
    const major = line({
      thisRound: {
        amount: "1500.50",
        items: [
          {
            kind: "donation",
            reason: "chosen",
            donationId: 5,
            donorId: 1,
            donorName: "Kari",
            date: "2026-07-10",
            timestampConfirmed: "2026-07-10T00:00:00.000Z" as never,
            sum: "1500.50",
            amount: "1500.50",
            roundId: 24,
            adjustmentId: null,
          },
        ],
      },
      carriedOver: { amount: "0.00", items: [] },
      sinceLastTransfer: { amount: "0.00", items: [] },
    });
    expect(summarizeLine(major)).toBe("1 major donation");
  });

  it("exports the monthly check in Samlefila's layout with Norwegian decimals", () => {
    const check = {
      from: "2026-01",
      to: "2026-02",
      months: ["2026-01", "2026-02"],
      recipients: [
        {
          organizationId: 2,
          name: "GiveWell; Top Charities",
          abbriv: "TCF",
          isActive: true,
          allocated: "300.50",
          recomputed: "300.50",
          difference: "0.00",
          months: [
            {
              month: "2026-01",
              allocated: "100.25",
              recomputed: "100.25",
              difference: "0.00",
              donationCount: 1,
            },
            {
              month: "2026-02",
              allocated: "200.25",
              recomputed: "200.25",
              difference: "0.00",
              donationCount: 1,
            },
          ],
        },
      ],
      totals: ["2026-01", "2026-02"].map((month, i) => ({
        month,
        allocated: i ? "200.25" : "100.25",
        unassigned: "0.00",
        unassignedCount: 0,
        accounted: i ? "200.25" : "100.25",
        donations: i ? "200.25" : "100.25",
        donationCount: 1,
        difference: "0.00",
        splitGap: "0.00",
        splitGapCount: 0,
        unexplained: "0.00",
      })),
      total: {
        allocated: "300.50",
        unassigned: "0.00",
        unassignedCount: 0,
        accounted: "300.50",
        donations: "300.50",
        donationCount: 2,
        difference: "0.00",
        splitGap: "0.00",
        splitGapCount: 0,
        unexplained: "0.00",
      },
      splitGaps: [],
      checks: {
        allocationsMatch: true,
        mismatchedCells: 0,
        totalsMatch: true,
        monthsWithDifference: 0,
        monthsUnexplained: 0,
      },
      paymentMethodIds: [],
    } as Reconciliation;
    const lines = reconciliationCsv(check).trim().split("\r\n");
    expect(lines[0]).toMatch(/^Mottaker;Forkortelse;.+;.+;Totalt$/);
    expect(lines[1]).toBe('"GiveWell; Top Charities";TCF;100,25;200,25;300,50');
    expect(lines.at(-1)).toBe("Differanse;;0,00;0,00;0,00");
    expect(decimalNo("-12.50")).toBe("-12,50");
  });
});
