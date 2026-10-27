import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";

const nbsp = /[  ]/g;
const plain = (value: string) => value.replace(nbsp, " ").replace("−", "-");

describe("formatMoney", () => {
  it("formats NOK with grouping and kr", () => {
    expect(plain(formatMoney(1234567))).toBe("1 234 567 kr");
  });

  it("supports decimals and negative values", () => {
    expect(plain(formatMoney(-249.5, { decimals: 2 }))).toBe("-249,50 kr");
  });

  it("renders a dash for missing values", () => {
    expect(formatMoney(null)).toBe("–");
    expect(formatNumber(undefined)).toBe("–");
  });
});

describe("formatDate", () => {
  it("uses the Norwegian date pattern", () => {
    expect(formatDate("2026-10-24")).toBe("24.10.2026");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("not a date")).toBe("–");
  });
});
