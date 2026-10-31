/**
 * Chart colours an organization can have in the admin (`Organizations.chart_color`), as the
 * admin's palette token names (apps/admin/src/styles/app.css). Tokens, not hex values, so light and
 * dark themes keep working. `chart-5` (light grey) is missing on purpose: it means "Other".
 *
 * The order is the backfill's preference order (prisma/migrations/20261029120000_organization_chart_color):
 * the strong colours first, then their softer versions.
 */
export const ORG_CHART_COLORS = [
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
] as const;

export type OrgChartColor = (typeof ORG_CHART_COLORS)[number];

const isOrgChartColor = (value: unknown): value is OrgChartColor =>
  typeof value === "string" && (ORG_CHART_COLORS as readonly string[]).includes(value);

/** A stored value as the API returns it: unknown tokens (never written by the API) read as null. */
export const toOrgChartColor = (value: string | null | undefined): OrgChartColor | null =>
  isOrgChartColor(value) ? value : null;
