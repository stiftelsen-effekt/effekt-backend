/**
 * Pure helpers for editing an agreement: parsing a new monthly amount, the charge day
 * options, and the before → after lines of a confirmation.
 */
import type { CauseAreaConfig, DistributionDraft } from "@/features/distribution/model";
import { describeChargeDay, ordinal } from "./model";

export type Change = { label: string; before: string; after: string };

/** Whole kroner as people type them ("1 500", "1500 kr"). Null unless a whole number ≥ 1 and ≤ max. */
export function parseWholeKroner(text: string, max: number): number | null {
  const cleaned = text.replace(/[\s  ]|kr$/gi, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= 1 && value <= max ? value : null;
}

/** 1st … 28th, then "Last day of the month" (0), for a charge day select. */
export const chargeDayOptions = [
  ...Array.from({ length: 28 }, (_, index) => ({
    value: index + 1,
    label: ordinal(index + 1),
  })),
  { value: 0, label: describeChargeDay(0) },
];

const percent = (value: number) => `${Number(value.toFixed(2))} %`;

/**
 * What changes between two splits, one line per cause area: its share, and whether it
 * follows the standard split or which organizations get what.
 */
export function splitChanges(
  config: CauseAreaConfig[],
  before: DistributionDraft,
  after: DistributionDraft,
): Change[] {
  const changes: Change[] = [];
  type Area = DistributionDraft["causeAreas"][number] | undefined;
  const share = (area: Area) => percent(area?.share ?? 0);
  const orgs = (area: Area) => {
    if (!area || area.share === 0) return "";
    if (area.standardSplit) return "standard split";
    const areaConfig = config.find((c) => c.id === area.id);
    return area.organizations
      .filter((org) => org.share > 0)
      .map((org) => {
        const name = areaConfig?.organizations.find((o) => o.id === org.id)?.name ?? `#${org.id}`;
        return `${name} ${percent(org.share)}`;
      })
      .join(", ");
  };
  const ids = [...new Set([...before.causeAreas, ...after.causeAreas].map((area) => area.id))];
  for (const id of ids) {
    const was = before.causeAreas.find((area) => area.id === id);
    const now = after.causeAreas.find((area) => area.id === id);
    const label = config.find((c) => c.id === id)?.name ?? `Cause area #${id}`;
    // The organizations only matter when they changed and the area still gets a share.
    const orgsChanged = orgs(was) !== orgs(now) && (now?.share ?? 0) > 0;
    const describe = (area: Area) =>
      orgsChanged && orgs(area) ? `${share(area)} (${orgs(area)})` : share(area);
    if (share(was) !== share(now) || orgsChanged) {
      changes.push({ label, before: describe(was), after: describe(now) });
    }
  }
  return changes;
}
