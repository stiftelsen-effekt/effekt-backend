import { describe, expect, it } from "vitest";
import { matchingRuleInput, ruleValidityOn, sortRules, validateMatchingRule } from "./matching-rules";

const rule = (id: number, from: string, to: string, precedence: number | null) => ({
  id,
  salesLocation: "Shop",
  message: null,
  resolveKID: "123",
  periodFrom: `${from}T00:00:00`,
  periodTo: `${to}T00:00:00`,
  precedence,
});

describe("matching rules", () => {
  it("knows whether a rule is in effect on a day", () => {
    const r = rule(1, "2026-10-01", "2026-10-31", null);
    expect(ruleValidityOn(r, "2026-10-31")).toBe("current");
    expect(ruleValidityOn(r, "2026-09-30")).toBe("upcoming");
    expect(ruleValidityOn(r, "2026-11-01")).toBe("expired");
  });

  it("sorts current rules first, by precedence", () => {
    const rules = [
      rule(1, "2020-01-01", "2020-12-31", 9),
      rule(2, "2026-01-01", "2026-12-31", null),
      rule(3, "2026-01-01", "2026-12-31", 5),
      rule(4, "2027-01-01", "2027-12-31", 1),
    ];
    expect(sortRules(rules, "2026-10-27").map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });

  it("validates and converts the form", () => {
    const form = {
      salesLocation: " Shop ",
      message: "",
      KID: " 12345 ",
      from: "2026-10-01",
      to: "2026-12-31",
      precedence: "",
    };
    expect(Object.values(validateMatchingRule(form)).filter(Boolean)).toEqual([]);
    expect(matchingRuleInput(form)).toEqual({
      salesLocation: "Shop",
      message: null,
      resolveKID: "12345",
      periodFrom: "2026-10-01",
      periodTo: "2026-12-31",
      precedence: null,
    });
    expect(matchingRuleInput({ ...form, precedence: "-2" }).precedence).toBe(-2);
    expect(validateMatchingRule({ ...form, to: "2026-09-01", KID: "abc", precedence: "1.5" })).toMatchObject({
      periodTo: "The last day must be after the first",
      resolveKID: "Enter a KID (digits only)",
      precedence: "Enter a whole number",
    });
  });
});
