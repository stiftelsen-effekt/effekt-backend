import { TRPCError } from "@trpc/server";
import { DAO } from "../custom_modules/DAO";
import type { DistributionSplitInput } from "./schemas/common";

const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

// DAO.causeareas.getById throws when the cause area doesn't exist
const causeAreaExists = (id: number) =>
  DAO.causeareas.getById(id).then(
    () => true,
    () => false,
  );

/**
 * Checks what the schema can't: that the donor, tax unit, cause areas, organizations and data
 * owner exist, that the tax unit belongs to the donor, and that each organization belongs to the
 * cause area it is listed under.
 */
export const assertDistributionReferences = async (
  distribution: DistributionSplitInput & { donorId: number; metaOwnerId?: number | null },
) => {
  const donor = await DAO.donors.getByID(distribution.donorId);
  if (!donor) throw badRequest(`Donor ${distribution.donorId} does not exist`);

  if (distribution.taxUnitId !== null) {
    const taxUnit = await DAO.tax.getById(distribution.taxUnitId);
    if (!taxUnit) throw badRequest(`Tax unit ${distribution.taxUnitId} does not exist`);
    if (taxUnit.donorId !== distribution.donorId) {
      throw badRequest(`Tax unit ${taxUnit.id} belongs to another donor`);
    }
    if (taxUnit.archived) throw badRequest(`Tax unit ${taxUnit.id} is archived`);
  }

  const organizationIds = distribution.causeAreas.flatMap((c) => c.organizations.map((o) => o.id));
  const organizations = organizationIds.length
    ? await DAO.organizations.getByIDs(organizationIds)
    : [];
  const causeAreaByOrganization = new Map(organizations.map((o) => [o.ID, o.cause_area_ID]));

  for (const causeArea of distribution.causeAreas) {
    for (const organization of causeArea.organizations) {
      const organizationCauseArea = causeAreaByOrganization.get(organization.id);
      if (organizationCauseArea === undefined) {
        throw badRequest(`Organization ${organization.id} does not exist`);
      }
      if (organizationCauseArea !== causeArea.id) {
        if (!(await causeAreaExists(causeArea.id))) {
          throw badRequest(`Cause area ${causeArea.id} does not exist`);
        }
        throw badRequest(
          `Organization ${organization.id} does not belong to cause area ${causeArea.id}`,
        );
      }
    }
  }

  if (distribution.metaOwnerId != null) {
    const owners = await DAO.meta.getDataOwners();
    if (!owners.some((owner) => owner.id === distribution.metaOwnerId)) {
      throw badRequest(`Data owner ${distribution.metaOwnerId} does not exist`);
    }
  }
};
