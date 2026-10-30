import { z } from "zod";
import { DAO } from "../custom_modules/DAO";
import { ORG_CHART_COLORS } from "../custom_modules/orgChartColors";

/**
 * A distribution's organization split on a list row (`orgSplit`): each organization's share of
 * the whole distribution. `share` is a percent as a decimal string, so `"62.500000"` is 62.5 %.
 */
export const orgSplitSchema = z.array(
  z.strictObject({
    organizationId: z.number().int().positive(),
    organizationName: z.string(),
    causeAreaId: z.number().int().positive(),
    /** The organization's chart colour token; null: derived from the id */
    chartColor: z.enum(ORG_CHART_COLORS).nullable(),
    share: z.string(),
  }),
);

export type OrgSplit = z.infer<typeof orgSplitSchema>;

/**
 * Adds `orgSplit` to list rows with one query for the whole page. `kidOf` picks the row's KID.
 * REST responses are unaffected: only tRPC list procedures call this.
 */
export async function withOrgSplits<T>(
  rows: T[],
  kidOf: (row: T) => string,
): Promise<(T & { orgSplit: OrgSplit })[]> {
  const splits = await DAO.distributions.getOrgSharesByKIDs(rows.map(kidOf));
  return rows.map((row) => ({ ...row, orgSplit: splits.get(kidOf(row)) ?? [] }));
}
