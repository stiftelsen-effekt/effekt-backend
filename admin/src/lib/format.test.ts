import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";
import { localeSettings } from "./locale";

const nbsp = /[  ]/g;
const plain = (value: string) => value.replace(nbsp, " ").replace("−", "-");

describe("formatMoney", () => {
  it("formats NOK and SEK with grouping and kr", () => {
    expect(plain(formatMoney(1234567, { settings: localeSettings.NO }))).toBe("1 234 567 kr");
    expect(plain(formatMoney(1234567, { settings: localeSettings.SV }))).toBe("1 234 567 kr");
  });

  it("supports decimals and negative values", () => {
    expect(plain(formatMoney(-249.5, { decimals: 2, settings: localeSettings.NO }))).toBe(
      "-249,50 kr",
    );
  });

  it("renders a dash for missing values", () => {
    expect(formatMoney(null)).toBe("–");
    expect(formatNumber(undefined)).toBe("–");
  });
});

describe("formatDate", () => {
  it("uses the locale's date pattern", () => {
    expect(formatDate("2026-10-24", "date", localeSettings.NO)).toBe("24.10.2026");
    expect(formatDate("2026-10-24", "date", localeSettings.SV)).toBe("2026-10-24");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("not a date")).toBe("–");
  });
});
