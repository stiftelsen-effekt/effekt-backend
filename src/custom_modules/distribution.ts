import { Distribution, DistributionInput } from "../schemas/types";
import { sumWithPrecision } from "./rounding";

const Decimal = require("decimal.js");

export const GLOBAL_HEALTH_CAUSE_AREA_ID = 1;

export function findGlobalHealthCauseAreaOrThrow(distribution: Distribution) {
  if (distribution.causeAreas.length !== 1) {
    throw new Error(
      `Distribution ${distribution.kid} has unexpected number of cause areas (${distribution.causeAreas.length})`,
    );
  }

  const causeArea = distribution.causeAreas.find(
    (causeArea) => causeArea.id === GLOBAL_HEALTH_CAUSE_AREA_ID,
  );

  if (!causeArea) {
    throw new Error(`Distribution ${distribution.kid} does not have a global health cause area`);
  }

  return causeArea;
}

export function validateDistribution(
  distribution: DistributionInput | Distribution,
): Distribution | DistributionInput {
  if (typeof distribution !== "object") {
    throw new Error(`Distribution is not an object`);
  }

  // Distribution has donor id
  if (!distribution.donorId) {
    throw new Error(`Distribution does not have donor id`);
  }

  // Donor ID is number
  if (typeof distribution.donorId !== "number") {
    throw new Error(`Distribution donor id is not a number`);
  }

  // Distribution has cause areas
  if (!distribution.causeAreas) {
    throw new Error(`Distribution does not have cause areas`);
  }

  // Distribution has at least one cause area
  if (distribution.causeAreas.length === 0) {
    throw new Error(`Distribution does not have any cause areas`);
  }

  // Cause areas sum to 100
  const sum = sumWithPrecision(
    distribution.causeAreas.map((causeArea) => causeArea.percentageShare),
  );

  if (sum !== "100") {
    throw new Error(`Distribution cause areas do not sum to 100`);
  }

  // No dublicate cause area ids
  const causeAreaIds = distribution.causeAreas.map((causeArea) => causeArea.id);
  const uniqueCauseAreaIds = [...new Set(causeAreaIds)];

  if (uniqueCauseAreaIds.length !== causeAreaIds.length) {
    throw new Error(`Distribution cause areas have duplicate ids`);
  }

  // All cause areas organizations sum to 100
  for (const causeArea of distribution.causeAreas) {
    // Cause area has organizations
    if (!causeArea.organizations) {
      throw new Error(`Distribution cause area ${causeArea.id} does not have organizations`);
    }

    // Cause area has at least one organization
    if (causeArea.organizations.length === 0) {
      throw new Error(`Distribution cause area ${causeArea.id} does not have any organizations`);
    }

    // Cause area has standard split boolean
    if (causeArea.standardSplit === undefined) {
      throw new Error(`Distribution cause area ${causeArea.id} does not have standard split`);
    }

    // No duplicate organization ids
    const organizationIds = causeArea.organizations.map((organization) => organization.id);
    const uniqueOrganizationIds = [...new Set(organizationIds)];

    if (uniqueOrganizationIds.length !== organizationIds.length) {
      throw new Error(`Distribution cause area ${causeArea.id} organizations have duplicate ids`);
    }

    // All organizations sum to 100
    const sum = sumWithPrecision(
      causeArea.organizations.map((organization) => organization.percentageShare),
    );

    if (sum !== "100") {
      throw new Error(`Distribution cause area ${causeArea.id}'s organizations do not sum to 100`);
    }
  }

  // Remove cause areas with zero percentage share
  const causeAreas = distribution.causeAreas.filter(
    (causeArea) => new Decimal(causeArea.percentageShare).equals(0) === false,
  );

  // Remove organizations with zero percentage share
  for (const causeArea of causeAreas) {
    causeArea.organizations = causeArea.organizations.filter(
      (organization) => new Decimal(organization.percentageShare).equals(0) === false,
    );
  }

  return {
    ...distribution,
    causeAreas,
  };
}
