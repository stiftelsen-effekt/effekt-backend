import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatMoneyInput, formatNumber, moneyDecimals } from "./format";

const nbsp = /[  ]/g;
const plain = (value: string) => value.replace(nbsp, " ").replace("−", "-");

describe("formatMoney", () => {
  it("formats NOK with grouping and kr", () => {
    expect(plain(formatMoney(1234567))).toBe("1 234 567 kr");
  });

  it("supports decimals and negative values", () => {
    expect(plain(formatMoney(-249.5))).toBe("-249,50 kr");
  });

  it("renders a dash for missing values", () => {
    expect(formatMoney(null)).toBe("–");
    expect(formatNumber(undefined)).toBe("–");
  });
});

describe("the money rule", () => {
  it("shows whole kroner without decimals and øre with two", () => {
    expect(plain(formatMoney("1500.00"))).toBe("1 500 kr");
    expect(plain(formatMoney(1500))).toBe("1 500 kr");
    expect(plain(formatMoney("1234.5"))).toBe("1 234,50 kr");
    expect(plain(formatMoney("0.30"))).toBe("0,30 kr");
    expect(plain(formatMoney("0.00"))).toBe("0 kr");
  });

  it("formats the same value the same way whatever its input form", () => {
    const forms = ["1500", "1500.0", "1500.00", 1500, 1500.0];
    expect(new Set(forms.map((value) => formatMoney(value))).size).toBe(1);
    expect(formatMoney("1234.50")).toBe(formatMoney(1234.5));
  });

  it("never rounds øre away", () => {
    // An average of 1234.50 must not read as 1 235 kr next to a sum with øre.
    expect(plain(formatMoney("1234.50"))).not.toBe("1 235 kr");
    expect(moneyDecimals("1234.50")).toBe(2);
    expect(moneyDecimals("1234.00")).toBe(0);
    expect(moneyDecimals(null)).toBe(0);
  });

  it("writes form inputs with the decimal comma and without grouping", () => {
    expect(formatMoneyInput("1000.00")).toBe("1000");
    expect(formatMoneyInput("249.5")).toBe("249,50");
    expect(formatMoneyInput(null)).toBe("");
  });
});

describe("formatDate", () => {
  it("uses the Norwegian date pattern", () => {
    expect(formatDate("2026-10-24")).toBe("24.10.2026");
  });

  it("shows instants in Oslo time", () => {
    // 22:30 UTC on 31 Dec is 23:30 in Oslo, still the 31st.
    expect(formatDate("2024-12-31T22:30:00Z", "datetime")).toBe("31.12.2024 23:30");
    // 23:30 UTC on 31 Dec is already 1 Jan in Oslo.
    expect(formatDate("2024-12-31T23:30:00Z")).toBe("01.01.2025");
    expect(formatDate("2024-07-01T12:00:00Z", "time")).toBe("14:00");
    expect(formatDate("2024-10-01T12:00:00Z", "month")).toBe("Oct 2024");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("not a date")).toBe("–");
  });
});
