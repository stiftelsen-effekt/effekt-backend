import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";
import {
  averageMoney,
  compareMoney,
  fromMinorUnits,
  medianMoney,
  moneySign,
  moneyToNumber,
  percentOfMoney,
  sumMoney,
  toMinorUnits,
  toMoneyString,
} from "./money";

const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ").replace("−", "-");

describe("toMinorUnits / fromMinorUnits", () => {
  it("parses API decimal strings and numbers into øre", () => {
    expect(toMinorUnits("1234.50")).toBe(123450n);
    expect(toMinorUnits("500")).toBe(50000n);
    expect(toMinorUnits("0.5")).toBe(50n);
    expect(toMinorUnits(".5")).toBe(50n);
    expect(toMinorUnits("-12.34")).toBe(-1234n);
    expect(toMinorUnits(" 7 ")).toBe(700n);
    expect(toMinorUnits(249.5)).toBe(24950n);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30n);
  });

  it("rounds a third fraction digit half away from zero", () => {
    expect(toMinorUnits("1.005")).toBe(101n);
    expect(toMinorUnits("1.004")).toBe(100n);
    expect(toMinorUnits("-1.005")).toBe(-101n);
  });

  it("keeps amounts beyond float precision exact", () => {
    expect(fromMinorUnits(toMinorUnits("90071992547409.93"))).toBe("90071992547409.93");
  });

  it("rejects anything that is not a plain decimal", () => {
    expect(() => toMinorUnits("12,50")).toThrow(TypeError);
    expect(() => toMinorUnits("")).toThrow(TypeError);
    expect(() => toMinorUnits(Number.NaN)).toThrow(TypeError);
    expect(toMoneyString("abc")).toBeNull();
    expect(toMoneyString(null)).toBeNull();
  });

  it("formats minor units with two fraction digits", () => {
    expect(fromMinorUnits(5n)).toBe("0.05");
    expect(fromMinorUnits(-5n)).toBe("-0.05");
    expect(fromMinorUnits(123450n)).toBe("1234.50");
  });
});

describe("arithmetic", () => {
  it("sums without float drift", () => {
    const tenOre = Array.from({ length: 10 }, () => "0.10");
    expect(tenOre.reduce((sum, value) => sum + Number(value), 0)).not.toBe(1);
    expect(sumMoney(tenOre)).toBe("1.00");
    expect(sumMoney(["0.10", null, "0.20", undefined, 3])).toBe("3.30");
    expect(sumMoney([])).toBe("0.00");
  });

  it("averages and takes medians rounded to øre", () => {
    expect(averageMoney(["10.00", "20.00", "20.00"])).toBe("16.67");
    expect(averageMoney([])).toBe("0.00");
    expect(medianMoney(["300", "100", "200"])).toBe("200.00");
    expect(medianMoney(["100", "200", "0.01", "0.02"])).toBe("50.01");
    expect(medianMoney([])).toBe("0.00");
  });

  it("takes percentages exactly", () => {
    expect(percentOfMoney("52710", 95)).toBe("50074.50");
    expect(percentOfMoney("100.00", "12.5")).toBe("12.50");
    expect(percentOfMoney("0.03", "50")).toBe("0.02");
  });

  it("compares numerically, not as text", () => {
    expect(compareMoney("1000", "200")).toBeGreaterThan(0);
    expect(compareMoney("99.99", 100)).toBeLessThan(0);
    expect(compareMoney("5.0", "5.00")).toBe(0);
    expect(["1000", "200", "30.5"].sort(compareMoney)).toEqual(["30.5", "200", "1000"]);
    expect(moneySign("-0.01")).toBe(-1);
    expect(moneySign("0.00")).toBe(0);
    expect(moneySign("3")).toBe(1);
  });

  it("converts to a float for charts", () => {
    expect(moneyToNumber("1234.50")).toBe(1234.5);
    expect(moneyToNumber(null)).toBeNaN();
  });
});

describe("formatMoney with decimal strings", () => {
  it("formats strings exactly", () => {
    expect(plain(formatMoney("1234.50"))).toBe("1 234,50 kr");
    expect(plain(formatMoney("90071992547409.93"))).toBe("90 071 992 547 409,93 kr");
    expect(formatMoney("not money")).toBe("–");
  });
});
