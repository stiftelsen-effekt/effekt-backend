import { z } from "zod";
import {
  agreementProviders,
  agreementSortColumns,
  agreementStatuses,
} from "../../custom_modules/DAO_modules/agreements";
import { isoDateSchema, paginationFields, sortSchema } from "./common";
import { chargeDay } from "./giro";

const range = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ from: schema.optional(), to: schema.optional() });

export const agreementProviderSchema = z.enum(agreementProviders);
export const agreementStatusSchema = z.enum(agreementStatuses);

export const agreementsFilter = z.strictObject({
  /** All providers when omitted */
  providers: z.array(agreementProviderSchema).min(1).optional(),
  /** Normalised statuses, see DAO_modules/agreements.ts */
  statuses: z.array(agreementStatusSchema).min(1).optional(),
  /** Monthly amount in whole currency units, inclusive */
  amount: range(z.number().nonnegative()).optional(),
  chargeDay: range(chargeDay).optional(),
  /** Whole Oslo days, inclusive of the `to` day */
  created: range(isoDateSchema).optional(),
  /** Partial match on the donor's name or email */
  donor: z.string().trim().min(1).optional(),
  /** Partial match */
  KID: z.string().trim().min(1).optional(),
  /**
   * Exact provider table ids (Vipps "agr_…", AvtaleGiro/AutoGiro numeric ids as strings). Ids
   * are only unique per provider, so add `providers` to fetch one agreement row.
   */
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(1000).optional(),
});

export const agreementsSort = sortSchema(agreementSortColumns);

const agreementsQuery = {
  sort: agreementsSort.optional(),
  filter: agreementsFilter.optional(),
};

export const agreementsListInput = z.strictObject({ ...paginationFields, ...agreementsQuery });
export const agreementsExportInput = z.strictObject(agreementsQuery);
