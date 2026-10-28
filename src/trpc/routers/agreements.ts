import { DAO } from "../../custom_modules/DAO";
import type { AgreementFilter } from "../../custom_modules/DAO_modules/agreements";
import { osloDayRange } from "../../custom_modules/osloDays";
import { csvExport } from "../csv";
import { z } from "zod";
import {
  agreementsExportInput,
  agreementsFilter,
  agreementsListInput,
} from "../schemas/agreements";
import { withOrgSplits } from "../orgSplits";
import { adminProcedure, router } from "../trpc";

const DEFAULT_SORT = { id: "created", desc: true } as const;

/** `created` is a range of whole Oslo days */
const toDaoFilter = (filter: z.infer<typeof agreementsFilter> | undefined): AgreementFilter => {
  const { created, ...rest } = filter ?? {};
  return created ? { ...rest, createdRange: osloDayRange(created) } : rest;
};

/**
 * Recurring agreements across Vipps, AvtaleGiro and AutoGiro in one list, with normalised
 * statuses and amounts in whole currency units. See DAO_modules/agreements.ts for the status
 * mapping. The provider routers (vipps.agreements, giro.*) have the provider-specific details.
 */
export const agreementsRouter = router({
  list: adminProcedure.input(agreementsListInput).query(async ({ input }) => {
    const result = await DAO.agreements.getList({
      filter: toDaoFilter(input.filter),
      sort: input.sort ?? DEFAULT_SORT,
      page: input.page,
      limit: input.limit,
    });
    return { ...result, rows: await withOrgSplits(result.rows, (row) => row.KID) };
  }),

  export: adminProcedure.input(agreementsExportInput).query(async ({ input }) => {
    const { rows } = await DAO.agreements.getList({
      filter: toDaoFilter(input.filter),
      sort: input.sort ?? DEFAULT_SORT,
    });
    return csvExport(
      "agreements",
      rows.map((row) => ({
        ...row,
        created: row.created?.toISOString() ?? null,
        lastUpdated: row.lastUpdated?.toISOString() ?? null,
        cancelled: row.cancelled?.toISOString().slice(0, 10) ?? null,
      })),
    );
  }),
});
