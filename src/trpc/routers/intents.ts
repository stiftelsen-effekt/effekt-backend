import { DAO } from "../../custom_modules/DAO";
import type { IntentFilter, IntentRow } from "../../custom_modules/DAO_modules/paymentIntents";
import { osloDayRange } from "../../custom_modules/osloDays";
import paymentMethods from "../../enums/paymentMethods";
import { withOrgSplits } from "../orgSplits";
import {
  intentsAttentionInput,
  intentsForDonorInput,
  intentsListInput,
  type intentsFilter,
} from "../schemas/intents";
import type { z } from "zod";
import { adminProcedure, router } from "../trpc";

const DEFAULT_SORT = { id: "created", desc: true } as const;

/** Every intent of one donor; a donor has a handful, so no paging */
const RECORD_LIMIT = 500;

/** The methods the Home attention item watches: money the donor has to send themselves */
export const ATTENTION_METHOD_IDS = [paymentMethods.bank, paymentMethods.avtalegiro];
export const ATTENTION_DAYS = 30;

const toDaoFilter = (filter: z.infer<typeof intentsFilter> | undefined): IntentFilter => {
  const { created, ...rest } = filter ?? {};
  return created ? { ...rest, createdRange: osloDayRange(created) } : rest;
};

/** Dates as ISO strings, so the admin gets the same shape from every procedure */
const toApiRow = (row: IntentRow) => ({
  ...row,
  created: row.created.toISOString(),
  matchedDonation: row.matchedDonation && {
    ...row.matchedDonation,
    date: row.matchedDonation.date.toISOString(),
  },
  followUps: { count: row.followUps.count, last: row.followUps.last?.toISOString() ?? null },
});

/**
 * Payment intents: what donors said they'd give in the widget, and whether it arrived. See
 * DAO_modules/paymentIntents.ts for the status definition (shared with the follow-up job).
 */
export const intentsRouter = router({
  list: adminProcedure.input(intentsListInput).query(async ({ input }) => {
    const result = await DAO.paymentIntents.getList({
      filter: toDaoFilter(input.filter),
      sort: input.sort ?? DEFAULT_SORT,
      awaitingDays: input.awaitingDays,
      page: input.page,
      limit: input.limit,
    });
    return {
      ...result,
      rows: await withOrgSplits(result.rows.map(toApiRow), (row) => row.KID),
    };
  }),

  forDonor: adminProcedure.input(intentsForDonorInput).query(async ({ input }) => {
    const { rows } = await DAO.paymentIntents.getList({
      filter: { donorId: input.donorId },
      sort: DEFAULT_SORT,
      awaitingDays: input.awaitingDays,
      page: 0,
      limit: RECORD_LIMIT,
    });
    return rows.map(toApiRow);
  }),

  /** For Home: new donors waiting on their first bank or AvtaleGiro payment */
  attention: adminProcedure.input(intentsAttentionInput).query(async ({ input }) => {
    const days = input?.days ?? ATTENTION_DAYS;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const counts = await DAO.paymentIntents.countAwaitingNewDonors({
      methodIds: ATTENTION_METHOD_IDS,
      createdRange: { from },
      awaitingDays: days,
    });
    return { ...counts, days, methodIds: ATTENTION_METHOD_IDS };
  }),
});
