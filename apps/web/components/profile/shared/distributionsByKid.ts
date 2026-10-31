import { Distribution } from "../../../models";

/**
 * The loaded distributions by KID. Empty when they were not needed or failed to load, so the lists
 * still render and only the rows' details say the distribution is missing.
 */
export const distributionsByKid = (
  distributions: Distribution[] | undefined,
  { fetched, failed }: { fetched: boolean; failed: boolean },
): Map<string, Distribution> =>
  new Map(
    fetched && !failed
      ? (distributions ?? []).map((distribution) => [distribution.kid, distribution])
      : [],
  );
