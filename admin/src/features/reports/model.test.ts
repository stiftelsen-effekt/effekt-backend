import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/download";
import { transactionCsvRows, transactionRangeInput, transactionTotals } from "./model";

const donation = {
  ID: 7,
  time: "2026-10-01T10:00:00.000Z",
  name: "Kari, Nordmann",
  donorID: 3,
  sum: "100.10",
  paymentMethod: "Vipps",
  transactionCost: "1.75",
  split: [
    { id: 1, name: "AMF", percentage: "60", amount: "60.06" },
    { id: 2, name: "GD", percentage: "40", amount: "40.04" },
  ],
};

describe("transaction report", () => {
  it("maps the form to input, all methods when none are chosen", () => {
    expect(
      transactionRangeInput({ from: "2026-01-01", to: "2026-01-31", paymentMethodIds: [] }),
    ).toEqual({
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });
    expect(
      transactionRangeInput({ from: "2026-01-01", to: "2026-01-31", paymentMethodIds: [4] })
        .paymentMethodIDs,
    ).toEqual([4]);
  });

  it("flattens the split into one CSV line per organization", () => {
    const rows = transactionCsvRows([donation, { ...donation, ID: 8, split: [] }]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ donationId: 7, organization: "GD", amount: "40.04" });
    expect(rows[2]).toMatchObject({ donationId: 8, organization: null });
    const csv = toCsv(rows).split("\r\n");
    expect(csv[0]).toBe(
      "donationId,time,donorId,donorName,sum,paymentMethod,transactionCost,organizationId,organization,percentage,amount",
    );
    expect(csv[1]).toBe(
      '7,2026-10-01T10:00:00.000Z,3,"Kari, Nordmann",100.10,Vipps,1.75,1,AMF,60,60.06',
    );
    expect(csv[3]).toBe('8,2026-10-01T10:00:00.000Z,3,"Kari, Nordmann",100.10,Vipps,1.75,,,,');
  });

  it("keeps spreadsheet formulas in names as text, but not negative amounts", () => {
    const csv = toCsv([{ name: "=HYPERLINK(1)", sum: "-100.00", other: "@x" }]).split("\r\n");
    expect(csv[1]).toBe("'=HYPERLINK(1),-100.00,'@x");
  });

  it("totals exactly", () => {
    expect(transactionTotals([donation, { ...donation, sum: "0.20" }])).toEqual({
      count: 2,
      sum: "100.30",
    });
  });
});
