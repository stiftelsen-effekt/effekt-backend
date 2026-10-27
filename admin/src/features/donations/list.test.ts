import { describe, expect, it } from "vitest";
import { visiblePaymentMethods } from "./api";
import { histogramBins, toDistributionFilter, toDonationFilter } from "./list";

describe("toDonationFilter", () => {
  it("is undefined without filters", () => {
    expect(toDonationFilter({})).toBeUndefined();
  });

  it("maps every list filter to the donations.list filter", () => {
    expect(
      toDonationFilter({
        q: "kari",
        amount: { min: 100, max: 500 },
        method: [2, 4],
        id: "123",
        kid: "8812",
        fundraiser: "7",
        taxUnit: ["person", "none"],
        org: [1, 12],
        owner: [3],
      }),
    ).toEqual({
      query: "kari",
      sum: { from: 100, to: 500 },
      paymentMethodIDs: [2, 4],
      id: "123",
      KID: "8812",
      fundraiserId: "7",
      taxUnitTypes: ["person", null],
      organizationIDs: [1, 12],
      dataOwnerIDs: [3],
    });
  });

  it("sends date ranges as plain Oslo days", () => {
    const filter = toDonationFilter({ date: { from: "2026-01-01", to: "2026-01-31" } });
    expect(filter?.date).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(
      toDonationFilter({ date: { from: undefined, to: "2026-01-31" } })?.date?.from,
    ).toBeUndefined();
  });
});

describe("toDistributionFilter", () => {
  it("maps search to donor and the KID chip to KID", () => {
    expect(toDistributionFilter({})).toBeUndefined();
    expect(toDistributionFilter({ q: "ola", kid: "123" })).toEqual({ query: "ola", KID: "123" });
  });
});

describe("histogramBins", () => {
  it("turns bucket edges into bins", () => {
    expect(
      histogramBins([
        { bucket: 0, bucketEnd: 500, items: 10, bar: 1 },
        { bucket: 500, bucketEnd: 1000, items: 4, bar: 1 },
        { bucket: 1000, bucketEnd: 1500, items: 1, bar: 1 },
      ]),
    ).toEqual([
      { from: 0, to: 500, count: 10 },
      { from: 500, to: 1000, count: 4 },
      { from: 1000, to: 1500, count: 1 },
    ]);
  });

  it("folds the rare tail into the last bin", () => {
    const bins = histogramBins([
      { bucket: 0, bucketEnd: 5000, items: 990, bar: 1 },
      { bucket: 5000, bucketEnd: 10000, items: 8, bar: 1 },
      { bucket: 10000, bucketEnd: 15000, items: 1, bar: 1 },
      { bucket: 100000, bucketEnd: 105000, items: 1, bar: 1 },
    ]);
    expect(bins).toEqual([
      { from: 0, to: 5000, count: 990 },
      { from: 5000, to: 10000, count: 10 },
    ]);
  });
});

describe("visiblePaymentMethods", () => {
  const methods = [2, 3, 4, 7, 10, 11, 12, 13].map((id) => ({ id }));
  it("hides AutoGiro and Swish (ids 11–12)", () => {
    expect(visiblePaymentMethods(methods).map((m) => m.id)).toEqual([2, 3, 4, 7, 10, 13]);
  });
});
