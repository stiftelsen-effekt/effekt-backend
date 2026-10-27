import { DAO } from "../../custom_modules/DAO";
import { csvExport } from "../csv";
import { agreementsExportInput, agreementsListInput } from "../schemas/agreements";
import { adminProcedure, router } from "../trpc";

const DEFAULT_SORT = { id: "created", desc: true } as const;

/**
 * Recurring agreements across Vipps, AvtaleGiro and AutoGiro in one list, with normalised
 * statuses and amounts in whole currency units. See DAO_modules/agreements.ts for the status
 * mapping. The provider routers (vipps.agreements, giro.*) have the provider-specific details.
 */
export const agreementsRouter = router({
  list: adminProcedure.input(agreementsListInput).query(({ input }) =>
    DAO.agreements.getList({
      filter: input.filter ?? {},
      sort: input.sort ?? DEFAULT_SORT,
      page: input.page,
      limit: input.limit,
    }),
  ),

  export: adminProcedure.input(agreementsExportInput).query(async ({ input }) => {
    const { rows } = await DAO.agreements.getList({
      filter: input.filter ?? {},
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
