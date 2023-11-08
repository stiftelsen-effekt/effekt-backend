import { Distribution } from "../schemas/types";

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
