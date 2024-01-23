import { DistributionInput } from "../schemas/types";
import { DAO } from "./DAO";

export const mapPureOrgSharesToDistributionInputCauseAreas = async (
  shares: { orgId: number; percentageShare: number }[],
) => {
  if (!shares.length) {
    throw new Error("No shares");
  }
  if (shares.reduce((sum, share) => sum + share.percentageShare, 0) !== 100) {
    throw new Error("Shares do not add up to 100");
  }

  /**
   * Construct distribution input cause areas from fundraiser shares
   */
  const extendedShares: ((typeof shares)[number] & { causeAreaId: number })[] = [];
  const causeAreaShares: { [causeAreaId: number]: number } = {};
  for (let share of shares) {
    const dbOrg = await DAO.organizations.getByID(share.orgId);
    if (!dbOrg) {
      throw new Error("Organization not found");
    }
    extendedShares.push({
      ...share,
      causeAreaId: dbOrg.cause_area_ID,
    });
    if (dbOrg.cause_area_ID in causeAreaShares) {
      causeAreaShares[dbOrg.cause_area_ID] += share.percentageShare;
    } else {
      causeAreaShares[dbOrg.cause_area_ID] = share.percentageShare;
    }
  }

  const causeAreas: DistributionInput["causeAreas"] = [];
  for (let causeAreaId in causeAreaShares) {
    causeAreas.push({
      id: parseInt(causeAreaId),
      percentageShare: causeAreaShares[causeAreaId].toString(),
      standardSplit: false,
      organizations: extendedShares
        .filter((s) => s.causeAreaId === parseInt(causeAreaId))
        .map((s) => ({
          id: s.orgId,
          percentageShare: ((s.percentageShare / causeAreaShares[causeAreaId]) * 100).toString(),
        })),
    });
  }

  return causeAreas;
};
