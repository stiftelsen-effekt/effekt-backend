import type { Organizations } from "@prisma/client";
import type { CauseArea } from "../schemas/types";
import { DAO, type SqlResult } from "./DAO";
import { toOrgChartColor, type OrgChartColor } from "./orgChartColors";

/**
 * Shared create/update/toggle logic for cause areas and organizations, used by both the
 * REST routes (src/routes/causeareas.ts, src/routes/organizations.ts) and the tRPC
 * config router. These are pure builders: lookups and writes stay with the caller.
 */

export type CauseAreaCreateInput = {
  name: string;
  shortDescription?: string;
  longDescription?: string;
  informationUrl?: string;
  ordering?: number;
  standardPercentageShare?: number;
};

export type CauseAreaPatch = {
  name?: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  informationUrl?: string | null;
  isActive?: boolean;
  ordering?: number | null;
  standardPercentageShare?: number | null;
};

export const buildNewCauseArea = (input: CauseAreaCreateInput): Omit<CauseArea, "id"> => ({
  name: input.name,
  shortDescription: input.shortDescription || "",
  longDescription: input.longDescription || "",
  informationUrl: input.informationUrl || "",
  isActive: true,
  ordering: input.ordering || 99,
  standardPercentageShare: input.standardPercentageShare || 0,
});

export const mergeCauseAreaUpdate = (
  id: number,
  existing: CauseArea,
  patch: CauseAreaPatch,
): CauseArea => ({
  id,
  name: patch.name !== undefined ? patch.name : existing.name,
  shortDescription:
    patch.shortDescription !== undefined ? patch.shortDescription : existing.shortDescription,
  longDescription:
    patch.longDescription !== undefined ? patch.longDescription : existing.longDescription,
  informationUrl:
    patch.informationUrl !== undefined ? patch.informationUrl : existing.informationUrl,
  isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
  ordering: patch.ordering !== undefined ? patch.ordering : existing.ordering,
  standardPercentageShare:
    patch.standardPercentageShare !== undefined
      ? patch.standardPercentageShare
      : existing.standardPercentageShare,
});

export const toggleCauseAreaActive = (existing: CauseArea): CauseArea => ({
  ...existing,
  isActive: !existing.isActive,
});

export type OrganizationCreateInput = {
  name: string;
  abbreviation: string;
  shortDescription?: string;
  longDescription?: string;
  informationUrl?: string;
  ordering?: number;
  standardShare?: number;
  causeAreaId: number;
  chartColor?: OrgChartColor | null;
};

export type OrganizationPatch = {
  name?: string;
  abbreviation?: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  informationUrl?: string | null;
  isActive?: boolean;
  ordering?: number | null;
  standardShare?: number | null;
  causeAreaId?: number;
  chartColor?: OrgChartColor | null;
};

export const buildNewOrganization = (input: OrganizationCreateInput) => ({
  name: input.name,
  abbreviation: input.abbreviation,
  shortDescription: input.shortDescription || "",
  longDescription: input.longDescription || "",
  informationUrl: input.informationUrl || "",
  isActive: true,
  ordering: input.ordering || 99,
  standardShare: input.standardShare || 0,
  causeAreaId: input.causeAreaId,
  chartColor: input.chartColor ?? null,
});

/** Merges a patch onto an existing Organizations row (as returned by DAO.organizations.getByID). */
export const mergeOrganizationUpdate = (
  id: number,
  existing: SqlResult<Organizations>,
  patch: OrganizationPatch,
) => ({
  id,
  name: patch.name !== undefined ? patch.name : existing.full_name,
  abbreviation: patch.abbreviation !== undefined ? patch.abbreviation : existing.abbriv,
  shortDescription:
    patch.shortDescription !== undefined ? patch.shortDescription : existing.short_desc,
  longDescription: patch.longDescription !== undefined ? patch.longDescription : existing.long_desc,
  informationUrl: patch.informationUrl !== undefined ? patch.informationUrl : existing.info_url,
  isActive: patch.isActive !== undefined ? patch.isActive : existing.is_active === 1,
  ordering: patch.ordering !== undefined ? patch.ordering : existing.ordering,
  standardShare:
    patch.standardShare !== undefined ? patch.standardShare : existing.std_percentage_share,
  causeAreaId: patch.causeAreaId !== undefined ? patch.causeAreaId : existing.cause_area_ID,
  chartColor:
    patch.chartColor !== undefined ? patch.chartColor : toOrgChartColor(existing.chart_color),
});

export const toggleOrganizationActive = (id: number, existing: SqlResult<Organizations>) =>
  mergeOrganizationUpdate(id, existing, { isActive: !(existing.is_active === 1) });

/** All cause areas (active and inactive), each with all of its organizations. */
export const getAllCauseAreasWithOrganizations = async () => {
  const causeAreas = await DAO.causeareas.getAll();
  const organizations = await DAO.organizations.getAll();

  const causeAreasWithOrganizations: Array<
    (typeof causeAreas)[number] & { organizations: typeof organizations }
  > = [];
  for (let causeArea of causeAreas) {
    causeAreasWithOrganizations.push({
      ...causeArea,
      organizations: organizations.filter((org) => org.causeAreaId === causeArea.id),
    });
  }
  return causeAreasWithOrganizations;
};
