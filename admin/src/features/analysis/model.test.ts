import { describe, expect, it } from "vitest";
import {
  countUpValue,
  milestoneLabel,
  pledgeCreateInput,
  progress,
  receivedInput,
  validatePledge,
  validateReceived,
  type Overview,
} from "./model";

const overview = (measured: string, open: string): Overview => ({
  thisYear: { year: 2026, sum: "27049175" },
  throughTime: { measured, donations: 1000, from: "2021-10-01" },
  pledges: { open, count: 3 },
  withPledges: { sum: "0", milestone: "200000000", remaining: "0", passed: false },
});

describe("overview", () => {
  it("lays out measured and pledges on the line to the milestone, never past it", () => {
    expect(progress(overview("150000000", "20000000"))).toEqual({ measured: 75, pledges: 10 });
    expect(progress(overview("190000000", "30000000"))).toEqual({ measured: 95, pledges: 5 });
    expect(progress(overview("210000000", "1000"))).toEqual({ measured: 100, pledges: 0 });
  });

  it("names the milestone in millions", () => {
    expect(milestoneLabel("200000000")).toBe("200 MNOK");
    expect(milestoneLabel("250000000.00")).toBe("250 MNOK");
    expect(milestoneLabel("7500000")).toBe("7,5 MNOK");
  });

  it("counts up fast at first and lands exactly on the value", () => {
    expect(countUpValue(1000, 0, 900)).toBe(0);
    expect(countUpValue(1000, 450, 900)).toBeGreaterThan(800);
    expect(countUpValue(170245588, 900, 900)).toBe(170245588);
    expect(countUpValue(170245588, 5000, 900)).toBe(170245588);
  });
});

describe("pledge forms", () => {
  it("adds a pledge with an amount (comma or point) and a decision date", () => {
    expect(validatePledge({ sum: "", decidedDate: "" })).toEqual({
      sum: "Enter the amount",
      decidedDate: "Enter the date it was decided",
    });
    expect(validatePledge({ sum: "1 350 000,5", decidedDate: "2026-10-23" })).toEqual({
      sum: undefined,
      decidedDate: undefined,
    });
    expect(validatePledge({ sum: "10,555", decidedDate: "2026-10-23" }).sum).toMatch(
      /two decimals/,
    );
    expect(pledgeCreateInput({ sum: "1 350 000,5", decidedDate: "2026-10-23" })).toEqual({
      sum: 1350000.5,
      decidedDate: "2026-10-23",
    });
  });

  it("marks received with an optional donation", () => {
    expect(validateReceived({ receivedDate: "", donationId: "x" })).toEqual({
      receivedDate: "Enter the date the money came in",
      donationId: "Enter a donation ID (digits)",
    });
    expect(receivedInput(4, { receivedDate: "2026-11-02", donationId: " " })).toEqual({
      id: 4,
      receivedDate: "2026-11-02",
      donationId: null,
    });
    expect(receivedInput(4, { receivedDate: "2026-11-02", donationId: "42" }).donationId).toBe(42);
  });
});
