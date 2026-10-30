/**
 * Organizations as the visual focus of a split (DESIGN.md › Distributions): the effective
 * share of each organization, each organization's colour (`orgColor`), the long tail grouped
 * as "Other", and whether the cause area adds anything worth showing.
 *
 * Gi Effektivt gives almost everything through Global Health, so "100 % Global Health" says
 * nothing; the organizations inside it are what people want to see.
 */
import type { ChartColor, ChartSeries } from "@/components/charts/chart";
import { percentOfMoney, toMinorUnits, fromMinorUnits, type MoneyInput } from "@/lib/money";
import type { CauseAreaConfig, DistributionDraft } from "./model";

/**
 * Colours an organization can have, as stored on it (`Organizations.chart_color`, chosen in
 * Settings → Cause areas). Same tokens and order as the API's `ORG_CHART_COLORS`: strong
 * colours first, then their softer versions. `chart-5` (light grey) is kept for Other.
 */
export const ORG_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-10",
  "chart-11",
  "chart-12",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
  "chart-13",
  "chart-14",
  "chart-15",
] as const satisfies readonly ChartColor[];
export type OrgColor = (typeof ORG_COLORS)[number];
export const OTHER_COLOR: ChartColor = "chart-5";
export const OTHER_KEY = "other";
export const OTHER_LABEL = "Other";

/** Colours for organizations without a stored one, by id (the colours before they were stored). */
const FALLBACK_COLORS: readonly OrgColor[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
];

export const isOrgColor = (value: unknown): value is OrgColor =>
  typeof value === "string" && (ORG_COLORS as readonly string[]).includes(value);

/** An organization as the API returns it: anything with its id and stored colour. */
export type ColoredOrg = { id: number; chartColor?: string | null };

/**
 * An organization's colour, the same on every page: the one stored on it, or, when none is
 * stored, one derived from its id. Never depends on which other organizations are shown.
 */
export function orgColor(org: ColoredOrg): OrgColor {
  if (isOrgColor(org.chartColor)) return org.chartColor;
  const n = FALLBACK_COLORS.length;
  return FALLBACK_COLORS[((org.id % n) + n) % n]!;
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
  const slices: OrgSlice[] = [];
  for (const area of draft.causeAreas) {
    if (area.share <= 0) continue;
    const areaConfig = config.find((c) => c.id === area.id);
    for (const org of area.organizations) {
      if (org.share <= 0) continue;
      const orgConfig = areaConfig?.organizations.find((o) => o.id === org.id);
      slices.push({
        id: org.id,
        name: orgConfig?.name ?? `#${org.id}`,
        share: round((area.share * org.share) / 100),
        causeAreaId: area.id,
        causeAreaName: areaConfig?.name ?? null,
        color: orgColor({ id: org.id, chartColor: orgConfig?.chartColor }),
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
  return slices;
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
 * series (in the organization's colour), the rest go to "Other". `keyOf` maps an
 * organization id to its series key.
 */
export function orgChartSeries(
  totals: readonly { id: number; label: string; total: number; chartColor?: string | null }[],
  max = 6,
): { series: ChartSeries[]; keyOf: (id: number) => string } {
  const ranked = [...totals].filter((t) => t.total !== 0).sort((a, b) => b.total - a.total);
  const grouped = ranked.length > max;
  const named = grouped ? ranked.slice(0, max - 1) : ranked;
  const namedIds = new Set(named.map((t) => t.id));
  const series: ChartSeries[] = named.map((t) => ({
    key: `org${t.id}`,
    label: t.label,
    color: orgColor(t),
  }));
  if (grouped) series.push({ key: OTHER_KEY, label: OTHER_LABEL, color: OTHER_COLOR });
  return { series, keyOf: (id) => (namedIds.has(id) ? `org${id}` : OTHER_KEY) };
}

/** One organization's share of a distribution's split, as the list procedures return it. */
export type OrgSplitRow = {
  organizationId: number;
  organizationName: string;
  causeAreaId: number;
  /** The organization's stored colour; null: derived from the id */
  chartColor?: string | null;
  /** Percent of the whole split, a decimal string */
  share: string;
};

/**
 * List rows' `orgSplit` as OrgSlices for OrgSparkline, in each organization's colour. The rows
 * come largest first; cause area names aren't in them, so they are null.
 */
export function orgSlicesFromSplit(split: readonly OrgSplitRow[]): OrgSlice[] {
  return split.map((row) => ({
    id: row.organizationId,
    name: row.organizationName,
    share: Number(row.share),
    causeAreaId: row.causeAreaId,
    causeAreaName: null,
    color: orgColor({ id: row.organizationId, chartColor: row.chartColor }),
  }));
}
