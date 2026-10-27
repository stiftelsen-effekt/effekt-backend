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

/** A cause area a new split can use: active, with at least one active organization. */
const isUsable = (area: CauseAreaConfig) => area.isActive && activeOrganizations(area).length > 0;

/** Organization shares used when a cause area follows the standard split. */
export function standardOrganizations(area: CauseAreaConfig): DraftOrganization[] {
  return activeOrganizations(area).map((org) => ({ id: org.id, share: org.standardShare ?? 0 }));
}

/** Empty draft: every usable cause area at 0 %, standard split on. */
export function emptyDraft(config: CauseAreaConfig[]): DistributionDraft {
  return {
    causeAreas: config
      .filter(isUsable)
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

/**
 * Draft from an existing distribution (API strings), filling in unused cause areas. Cause
 * areas and organizations the distribution uses stay in the draft even when they have been
 * deactivated since (pass the full config, `config.causeAreas.listAll`, when editing), so
 * opening an old split never silently drops part of it.
 */
export function draftFromApi(
  config: CauseAreaConfig[],
  distribution: ApiDistributionRead,
): DistributionDraft {
  const usedArea = (id: number) => distribution.causeAreas.find((c) => c.id === id);
  return {
    causeAreas: config
      .filter((area) => isUsable(area) || usedArea(area.id))
      .map((area) => {
        const existing = usedArea(area.id);
        const standard = standardOrganizations(area);
        if (!existing) return { id: area.id, share: 0, standardSplit: true, organizations: standard };
        const usedShare = (orgId: number) =>
          existing.organizations.find((o) => o.id === orgId)?.percentageShare;
        return {
          id: area.id,
          share: Number(existing.percentageShare),
          standardSplit: existing.standardSplit,
          organizations: existing.standardSplit
            ? standard
            : area.organizations
                .filter((org) => org.isActive || usedShare(org.id) !== undefined)
                .map((org) => ({ id: org.id, share: Number(usedShare(org.id) ?? 0) })),
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

/** Shares are sent with at most six decimals (the API keeps 15; six is finer than any input). */
const MICRO = 1_000_000;

function microToString(micro: number) {
  const whole = Math.floor(micro / MICRO);
  const fraction = micro % MICRO;
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(6, "0").replace(/0+$/, "")}`;
}

/**
 * Percentages as decimal strings that add up to exactly "100" whenever the draft is valid.
 * The API sums the strings exactly, so 33.333333 × 3 would be rejected: the rounding drift
 * (at most one millionth per share) goes to the largest share.
 */
export function exactShares(values: number[]): string[] {
  const micro = values.map((value) => Math.round(value * MICRO));
  const drift = 100 * MICRO - micro.reduce((total, value) => total + value, 0);
  if (drift !== 0 && Math.abs(drift) <= micro.length) {
    const largest = micro.indexOf(Math.max(...micro));
    micro[largest]! += drift;
  }
  return micro.map(microToString);
}

/**
 * The `causeAreas` of the API's distribution input (distributionSchema): only cause areas
 * and organizations with a share above zero, percentages as decimal strings, the
 * standardSplit flag per cause area. Standard split areas carry the configured
 * organization shares (the API requires organizations that sum to 100 for every area).
 */
export function draftToApi(draft: DistributionDraft): ApiCauseAreaShare[] {
  const areas = draft.causeAreas.filter((area) => area.share > 0);
  const areaShares = exactShares(areas.map((area) => area.share));
  return areas.map((area, index) => {
    const organizations = area.organizations.filter((org) => org.share > 0);
    const orgShares = exactShares(organizations.map((org) => org.share));
    return {
      id: area.id,
      percentageShare: areaShares[index]!,
      standardSplit: area.standardSplit,
      organizations: organizations.map((org, i) => ({ id: org.id, percentageShare: orgShares[i]! })),
    };
  });
}

/** Whether two drafts mean the same split (compares what would be sent to the API). */
export function sameDistribution(a: DistributionDraft, b: DistributionDraft) {
  return JSON.stringify(draftToApi(a)) === JSON.stringify(draftToApi(b));
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
