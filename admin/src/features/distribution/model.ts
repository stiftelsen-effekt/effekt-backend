/**
 * The distribution ("split") behind every KID: a share per cause area, and per cause area
 * either the standard split (organization shares from config) or custom organization
 * shares. Both levels must sum to exactly 100 (the API checks with fixed precision).
 *
 * The editor works on a DistributionDraft (numbers, every active cause area present, in
 * config order) and converts to/from the API shape at the edges.
 */
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type CauseAreaConfig = RouterOutputs["config"]["causeAreas"]["listAll"][number];
export type ApiDistribution = NonNullable<RouterInputs["donations"]["register"]["distribution"]>;
export type ApiCauseAreaShare = ApiDistribution["causeAreas"][number];
/** The read shape (agreement.get etc.): same fields, optional names. */
export type ApiDistributionRead = { causeAreas: ApiCauseAreaShare[] };

export type DraftOrganization = { id: number; share: number };
export type DraftCauseArea = {
  id: number;
  share: number;
  standardSplit: boolean;
  organizations: DraftOrganization[];
};
export type DistributionDraft = { causeAreas: DraftCauseArea[] };

const round = (value: number) => Math.round(value * 1e6) / 1e6;
export const sum = (values: number[]) => round(values.reduce((total, value) => total + value, 0));
const isHundred = (value: number) => Math.abs(value - 100) < 1e-6;

const activeOrganizations = (area: CauseAreaConfig) =>
  area.organizations.filter((org) => org.isActive);

/** Organization shares used when a cause area follows the standard split. */
export function standardOrganizations(area: CauseAreaConfig): DraftOrganization[] {
  return activeOrganizations(area).map((org) => ({ id: org.id, share: org.standardShare ?? 0 }));
}

/** Empty draft: every active cause area at 0 %, standard split on. */
export function emptyDraft(config: CauseAreaConfig[]): DistributionDraft {
  return {
    causeAreas: config
      .filter((area) => area.isActive)
      .map((area) => ({
        id: area.id,
        share: 0,
        standardSplit: true,
        organizations: standardOrganizations(area),
      })),
  };
}

/** The recommended distribution: cause area standard shares, standard split everywhere. */
export function standardDraft(config: CauseAreaConfig[]): DistributionDraft {
  const draft = emptyDraft(config);
  return {
    causeAreas: draft.causeAreas.map((area) => ({
      ...area,
      share: config.find((c) => c.id === area.id)?.standardPercentageShare ?? 0,
    })),
  };
}

/** Draft from an existing distribution (API strings), filling in unused cause areas. */
export function draftFromApi(
  config: CauseAreaConfig[],
  distribution: ApiDistributionRead,
): DistributionDraft {
  const draft = emptyDraft(config);
  return {
    causeAreas: draft.causeAreas.map((area) => {
      const existing = distribution.causeAreas.find((c) => c.id === area.id);
      if (!existing) return area;
      return {
        id: area.id,
        share: Number(existing.percentageShare),
        standardSplit: existing.standardSplit,
        organizations: existing.standardSplit
          ? area.organizations
          : area.organizations.map((org) => ({
              id: org.id,
              share: Number(
                existing.organizations.find((o) => o.id === org.id)?.percentageShare ?? 0,
              ),
            })),
      };
    }),
  };
}

export type DistributionValidation = {
  valid: boolean;
  total: number;
  /** 100 − total; negative when over-allocated. */
  remaining: number;
  /** Per cause area: organization total when custom and not 100. */
  causeAreas: Record<number, { total: number; error?: string }>;
  error?: string;
};

export function validateDraft(draft: DistributionDraft): DistributionValidation {
  const total = sum(draft.causeAreas.map((area) => area.share));
  const causeAreas: DistributionValidation["causeAreas"] = {};
  let valid = isHundred(total);
  for (const area of draft.causeAreas) {
    const orgTotal = sum(area.organizations.map((org) => org.share));
    const needsCheck = area.share > 0 && !area.standardSplit;
    const error =
      needsCheck && !isHundred(orgTotal)
        ? orgTotal > 100
          ? `Organizations add up to ${orgTotal} %, ${round(orgTotal - 100)} % too much`
          : `Organizations add up to ${orgTotal} %, ${round(100 - orgTotal)} % left to place`
        : undefined;
    if (error) valid = false;
    causeAreas[area.id] = { total: orgTotal, error };
  }
  const remaining = round(100 - total);
  const error = isHundred(total)
    ? undefined
    : total > 100
    ? `Cause areas add up to ${total} %, ${-remaining} % too much`
    : `Cause areas add up to ${total} %, ${remaining} % left to place`;
  return { valid, total, remaining, causeAreas, error };
}

/** API input: cause areas with a share, percentages as decimal strings. */
export function draftToApi(draft: DistributionDraft): ApiCauseAreaShare[] {
  return draft.causeAreas
    .filter((area) => area.share > 0)
    .map((area) => ({
      id: area.id,
      percentageShare: String(round(area.share)),
      standardSplit: area.standardSplit,
      organizations: area.organizations
        .filter((org) => area.standardSplit || org.share > 0)
        .map((org) => ({ id: org.id, percentageShare: String(round(org.share)) })),
    }));
}

/** Give a cause area whatever is left to reach 100. */
export function fillRemaining(draft: DistributionDraft, causeAreaId: number): DistributionDraft {
  const others = sum(draft.causeAreas.filter((a) => a.id !== causeAreaId).map((a) => a.share));
  return setShare(draft, causeAreaId, Math.max(0, round(100 - others)));
}

export function setShare(draft: DistributionDraft, causeAreaId: number, share: number) {
  return {
    causeAreas: draft.causeAreas.map((area) =>
      area.id === causeAreaId ? { ...area, share: clampShare(share) } : area,
    ),
  };
}

export function setOrganizationShare(
  draft: DistributionDraft,
  causeAreaId: number,
  organizationId: number,
  share: number,
) {
  return {
    causeAreas: draft.causeAreas.map((area) =>
      area.id === causeAreaId
        ? {
            ...area,
            organizations: area.organizations.map((org) =>
              org.id === organizationId ? { ...org, share: clampShare(share) } : org,
            ),
          }
        : area,
    ),
  };
}

/** Switching standard split on resets organization shares to the configured ones. */
export function setStandardSplit(
  draft: DistributionDraft,
  config: CauseAreaConfig[],
  causeAreaId: number,
  standardSplit: boolean,
): DistributionDraft {
  const areaConfig = config.find((c) => c.id === causeAreaId);
  return {
    causeAreas: draft.causeAreas.map((area) =>
      area.id === causeAreaId
        ? {
            ...area,
            standardSplit,
            organizations: areaConfig ? standardOrganizations(areaConfig) : area.organizations,
          }
        : area,
    ),
  };
}

const clampShare = (value: number) => round(Math.min(100, Math.max(0, value || 0)));
