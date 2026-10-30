/**
 * Registering a donation from the donor page: the KID is picked from the donor's own
 * distributions (never typed), so it can't be mistyped or belong to someone else.
 */
import type { ApiDistributionRead, CauseAreaConfig } from "@/features/distribution/model";
import { formatNumber } from "@/lib/format";
import { compareMoney } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

export type DonorDistribution = RouterOutputs["donors"]["distributionsAggregated"][number];

/** The donor's KIDs, most used first (then the largest total), so the usual one is on top. */
export function kidOptions(distributions: readonly DonorDistribution[]): DonorDistribution[] {
  return [...distributions].sort(
    (a, b) =>
      b.count - a.count || compareMoney(b.sum ?? "0", a.sum ?? "0") || a.KID.localeCompare(b.KID),
  );
}

/** The KID the form starts with: the one the donor has used most. */
export const mostUsedKid = (distributions: readonly DonorDistribution[]) =>
  kidOptions(distributions)[0]?.KID ?? "";

const percent = (value: string | number) => {
  const n = Number(value);
  return `${formatNumber(n, { decimals: Number.isInteger(n) ? 0 : 2 })} %`;
};

/**
 * A split in one line, for a picker: "AMF 60 %, GiveDirectly 40 %" for one cause area,
 * "Global health 80 % (standard split), Animal welfare 20 % (THL 100 %)" for several.
 */
export function briefSplit(distribution: ApiDistributionRead, config: CauseAreaConfig[]): string {
  const areas = distribution.causeAreas.filter((area) => Number(area.percentageShare) > 0);
  const parts = areas.map((area) => {
    const areaConfig = config.find((c) => c.id === area.id);
    const name = areaConfig?.name ?? `Cause area ${area.id}`;
    const organizations = area.standardSplit
      ? "standard split"
      : area.organizations
          .filter((org) => Number(org.percentageShare) > 0)
          .map((org) => {
            const orgConfig = areaConfig?.organizations.find((o) => o.id === org.id);
            const orgName = orgConfig?.abbreviation || orgConfig?.name || `#${org.id}`;
            return `${orgName} ${percent(org.percentageShare)}`;
          })
          .join(", ");
    if (areas.length === 1) return area.standardSplit ? `${name}, ${organizations}` : organizations;
    return `${name} ${percent(area.percentageShare)} (${organizations})`;
  });
  return parts.join(", ");
}
