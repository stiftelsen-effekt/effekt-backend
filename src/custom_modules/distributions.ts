import { components } from "../schemas/specs/distribution";

export function validateCauseAreaInput(
  causeAreas: components["schemas"]["DistributionCauseArea"][],
) {
  // Must have one or more cause areas
  if (causeAreas.length === 0) {
    throw new Error("Must have one or more cause areas");
  }

  // Cause areas share must sum to 100
  const causeAreaShareSum = causeAreas.reduce(
    (sum, causeArea) => sum + parseFloat(causeArea.percentageShare),
    0,
  );
  if (causeAreaShareSum !== 100) {
    throw new Error(`Cause area share must sum to 100, but was ${causeAreaShareSum}`);
  }

  // Organization share must sum to 100 within each cause area
  causeAreas.forEach((causeArea) => {
    if (causeArea.standardSplit) return;
    const orgShareSum = causeArea.organizations.reduce(
      (sum, org) => sum + parseFloat(org.percentageShare),
      0,
    );
    if (orgShareSum !== 100) {
      throw new Error(
        `Organization share must sum to 100 within each cause area, but was ${orgShareSum} for cause area ${causeArea.id}`,
      );
    }
  });
}
