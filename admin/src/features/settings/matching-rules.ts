import { format, parseISO } from "date-fns";
import type { RuleValidity } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import { cleanText } from "./drafts";

export type MatchingRule = RouterOutputs["vipps"]["matchingRules"]["list"][number];
type MatchingRuleInput = RouterInputs["vipps"]["matchingRules"]["create"];

/** The rule's calendar day (rules are stored at midnight local time). */
export const ruleDay = (value: string | Date) =>
  format(typeof value === "string" ? parseISO(value) : value, "yyyy-MM-dd");

export function ruleValidityOn(
  rule: Pick<MatchingRule, "periodFrom" | "periodTo">,
  today: string,
): RuleValidity {
  if (ruleDay(rule.periodFrom) > today) return "upcoming";
  if (ruleDay(rule.periodTo) < today) return "expired";
  return "current";
}

/** In effect first, then upcoming, then expired; highest precedence first within each. */
export function sortRules(rules: readonly MatchingRule[], today: string): MatchingRule[] {
  const rank: Record<RuleValidity, number> = { current: 0, upcoming: 1, expired: 2 };
  return [...rules].sort(
    (a, b) =>
      rank[ruleValidityOn(a, today)] - rank[ruleValidityOn(b, today)] ||
      (b.precedence ?? Number.MIN_SAFE_INTEGER) - (a.precedence ?? Number.MIN_SAFE_INTEGER) ||
      ruleDay(b.periodTo).localeCompare(ruleDay(a.periodTo)),
  );
}

export type MatchingRuleForm = {
  salesLocation: string;
  message: string;
  KID: string;
  from: string;
  to: string;
  precedence: string;
};

export function validateMatchingRule(form: MatchingRuleForm) {
  const precedence = form.precedence.trim();
  return {
    salesLocation:
      form.salesLocation.trim() === ""
        ? "Enter the sales location"
        : form.salesLocation.trim().length > 45
        ? "At most 45 characters"
        : undefined,
    message: form.message.trim().length > 45 ? "At most 45 characters" : undefined,
    resolveKID: /^\d{1,32}$/.test(form.KID.trim()) ? undefined : "Enter a KID (digits only)",
    periodTo:
      !form.from || !form.to
        ? "Choose the first and last day"
        : form.from >= form.to
        ? "The last day must be after the first"
        : undefined,
    precedence:
      precedence === "" || /^-?\d+$/.test(precedence) ? undefined : "Enter a whole number",
  };
}

/** Form → `vipps.matchingRules.create` input. Empty optional fields become null. */
export function matchingRuleInput(form: MatchingRuleForm): MatchingRuleInput {
  const precedence = form.precedence.trim();
  return {
    salesLocation: cleanText(form.salesLocation) ?? null,
    message: cleanText(form.message) ?? null,
    resolveKID: form.KID.trim(),
    periodFrom: form.from,
    periodTo: form.to,
    precedence: precedence === "" ? null : Number(precedence),
  };
}
