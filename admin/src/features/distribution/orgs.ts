/**
 * Organizations as the visual focus of a split (DESIGN.md › Distributions): the effective
 * share of each organization, a stable organization → colour mapping, the long tail grouped
 * as "Other", and whether the cause area adds anything worth showing.
 *
 * Gi Effektivt gives almost everything through Global Health, so "100 % Global Health" says
 * nothing; the organizations inside it are what people want to see.
 */
import type { ChartColor, ChartSeries } from "@/components/charts/chart";
import { percentOfMoney, toMinorUnits, fromMinorUnits, type MoneyInput } from "@/lib/money";
import type { CauseAreaConfig, DistributionDraft } from "./model";

/** Colours for organizations, in preference order. `chart-5` (light grey) is kept for Other. */
export const ORG_COLORS: readonly ChartColor[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
];
export const OTHER_COLOR: ChartColor = "chart-5";
export const OTHER_KEY = "other";
export const OTHER_LABEL = "Other";

/**
 * Colour per organization: each id has a home colour (`id mod 8`), so an organization looks
 * the same on every page. When organizations shown together share a home colour, the one
 * with the lower id keeps it and the other takes the next free colour; the result depends
 * only on which organizations are shown, never on their order or shares. Beyond eight,
 * colours repeat.
 */
export function orgColors(ids: readonly number[]): Map<number, ChartColor> {
  const colors = new Map<number, ChartColor>();
  const taken = new Set<ChartColor>();
  const n = ORG_COLORS.length;
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const home = ((id % n) + n) % n;
    let color = ORG_COLORS[home]!;
    for (let step = 1; step < n && taken.has(color); step++) color = ORG_COLORS[(home + step) % n]!;
    colors.set(id, color);
    taken.add(color);
  }
  return colors;
}

export type OrgSlice = {
  /** Organization id; `null` for the grouped "Other". */
  id: number | null;
  name: string;
  /** Percent of the whole split (0–100). */
  share: number;
  /** This organization's part of `amount`, when one was given. Exact; the parts add up. */
  amount?: string;
  causeAreaId: number | null;
  causeAreaName: string | null;
  color: ChartColor;
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The organizations a split gives to, largest first, with their share of the whole (cause
 * area share × organization share) and, given an amount, their part of it. The parts are
 * rounded to øre with the remainder on the largest, so they add up to the amount exactly.
 */
export function orgSlices(
  draft: DistributionDraft,
  config: CauseAreaConfig[],
  amount?: MoneyInput | null,
): OrgSlice[] {
  const slices: Omit<OrgSlice, "color">[] = [];
  for (const area of draft.causeAreas) {
    if (area.share <= 0) continue;
    const areaConfig = config.find((c) => c.id === area.id);
    for (const org of area.organizations) {
      if (org.share <= 0) continue;
      slices.push({
        id: org.id,
        name: areaConfig?.organizations.find((o) => o.id === org.id)?.name ?? `#${org.id}`,
        share: round((area.share * org.share) / 100),
        causeAreaId: area.id,
        causeAreaName: areaConfig?.name ?? null,
      });
    }
  }
  slices.sort((a, b) => b.share - a.share);
  if (amount != null && slices.length > 0) {
    const parts = slices.map((slice) => toMinorUnits(percentOfMoney(amount, slice.share)));
    const rest = toMinorUnits(amount) - parts.reduce((total, part) => total + part, 0n);
    parts[0]! += rest;
    slices.forEach((slice, index) => (slice.amount = fromMinorUnits(parts[index]!)));
  }
  const colors = orgColors(slices.map((slice) => slice.id!));
  return slices.map((slice) => ({ ...slice, color: colors.get(slice.id!)! }));
}

/** At most `max` slices: the largest `max − 1` and the rest summed as "Other". */
export function groupOther(slices: OrgSlice[], max: number): OrgSlice[] {
  if (slices.length <= max) return slices;
  const kept = slices.slice(0, max - 1);
  const rest = slices.slice(max - 1);
  const amounts = rest.map((slice) => slice.amount);
  return [
    ...kept,
    {
      id: null,
      name: OTHER_LABEL,
      share: round(rest.reduce((total, slice) => total + slice.share, 0)),
      amount: amounts.every((a) => a != null)
        ? fromMinorUnits(amounts.reduce((total, a) => total + toMinorUnits(a!), 0n))
        : undefined,
      causeAreaId: null,
      causeAreaName: null,
      color: OTHER_COLOR,
    },
  ];
}

export const isGlobalHealth = (name: string | null | undefined) =>
  /^global\s+(health|helse)$/i.test((name ?? "").trim());

/**
 * Whether the cause area adds information: more than one cause area is used, or the one used
 * isn't Global Health. Otherwise show only the organizations.
 */
export function showCauseAreas(draft: DistributionDraft, config: CauseAreaConfig[]): boolean {
  const used = draft.causeAreas.filter((area) => area.share > 0);
  if (used.length > 1) return true;
  if (used.length === 0) return false;
  return !isGlobalHealth(config.find((c) => c.id === used[0]!.id)?.name);
}

/**
 * Series for a chart stacked by organization: the largest `max − 1` by total get their own
 * series (coloured like everywhere else), the rest go to "Other". `keyOf` maps an
 * organization id to its series key.
 */
export function orgChartSeries(
  totals: readonly { id: number; label: string; total: number }[],
  max = 6,
): { series: ChartSeries[]; keyOf: (id: number) => string } {
  const ranked = [...totals].filter((t) => t.total !== 0).sort((a, b) => b.total - a.total);
  const grouped = ranked.length > max;
  const named = grouped ? ranked.slice(0, max - 1) : ranked;
  const colors = orgColors(named.map((t) => t.id));
  const namedIds = new Set(named.map((t) => t.id));
  const series: ChartSeries[] = named.map((t) => ({
    key: `org${t.id}`,
    label: t.label,
    color: colors.get(t.id),
  }));
  if (grouped) series.push({ key: OTHER_KEY, label: OTHER_LABEL, color: OTHER_COLOR });
  return { series, keyOf: (id) => (namedIds.has(id) ? `org${id}` : OTHER_KEY) };
}
