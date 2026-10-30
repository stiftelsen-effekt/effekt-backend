import { describe, expect, it } from "vitest";
import { otherActiveShare, reasonText, toCancelledFilter } from "./cancelled";

describe("toCancelledFilter", () => {
  it("leaves out empty filters", () => {
    expect(toCancelledFilter({})).toEqual({});
    expect(toCancelledFilter({ q: "  ", provider: [], reason: [] })).toEqual({});
  });

  it("maps URL filters to the API filter", () => {
    expect(
      toCancelledFilter({
        q: " ola ",
        cancelled: { from: "2026-01-01", to: "2026-03-31" },
        provider: ["vipps"],
        reason: [1, 11],
        otherActive: false,
      }),
    ).toEqual({
      donor: "ola",
      cancelled: { from: "2026-01-01", to: "2026-03-31" },
      providers: ["vipps"],
      reasonIds: [1, 11],
      hasOtherActiveAgreement: false,
    });
  });
});

describe("reasonText", () => {
  it("joins reasons and quotes the donor's own words", () => {
    expect(
      reasonText([
        { reasonId: 1, name: "Økonomiske grunner", comment: null, recorded: null },
        { reasonId: 11, name: "Annet", comment: "Flytter", recorded: null },
      ]),
    ).toBe("Økonomiske grunner · Annet: “Flytter”");
    expect(reasonText([])).toBe("");
  });
});

describe("otherActiveShare", () => {
  it("is a fraction, and null without cancellations", () => {
    expect(otherActiveShare({ count: 4, withOtherActiveCount: 1 })).toBe(0.25);
    expect(otherActiveShare({ count: 0, withOtherActiveCount: 0 })).toBeNull();
  });
});
