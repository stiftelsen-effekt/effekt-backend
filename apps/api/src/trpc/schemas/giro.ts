import { z } from "zod";
import { osloDayRange } from "../../custom_modules/osloDays";
import { isoDateSchema, paginationFields, sortSchema } from "./common";

/** ISO date (YYYY-MM-DD), converted to local midnight like the REST API's date strings were. */
export const isoDate = isoDateSchema;
export const toLocalDate = (isoDateString: string) => {
  const [year, month, day] = isoDateString.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const range = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ from: schema.optional(), to: schema.optional() });

/** Day of month an agreement is charged; 0 means the last day of the month. */
export const chargeDay = z.number().int().min(0).max(28);

/** Agreement `active` column: 1 active, 0 inactive (drafted or cancelled). */
const agreementStatus = z.union([z.literal(0), z.literal(1)]);

/** AvtaleGiro amounts are stored in øre in a signed int column; this is the largest whole NOK that fits. */
export const AVTALEGIRO_MAX_NOK = 21_474_836;

/** AutoGiro amounts are stored as whole SEK in a signed int column. */
export const AUTOGIRO_MAX_SEK = 2_147_483_647;

// region AvtaleGiro
/** Sort keys accepted by DAO.avtalegiroagreements.getAgreements (its jsDBmapping). */
const avtaleGiroSortId = [
  "id",
  "active",
  "kid",
  "paymentDate",
  "created",
  "cancelled",
  "lastUpdated",
  "notice",
  "full_name",
  "amount",
] as const;

const avtaleGiroFilter = z
  .strictObject({
    /** Agreement sum in NOK */
    amount: range(z.number()).optional(),
    paymentDate: range(chargeDay).optional(),
    /** Draft (created) date, inclusive whole Oslo days */
    created: range(isoDate).optional(),
    KID: z.string().optional(),
    donor: z.string().optional(),
    statuses: z.array(agreementStatus).optional(),
  })
  .transform(({ created, ...rest }) => ({ ...rest, createdRange: osloDayRange(created) }));

const avtaleGiroQuery = {
  sort: sortSchema(avtaleGiroSortId).optional(),
  filter: avtaleGiroFilter.optional(),
};

export const avtaleGiroListInput = z.strictObject({ ...paginationFields, ...avtaleGiroQuery });
export const avtaleGiroExportInput = z.strictObject(avtaleGiroQuery);
// endregion

// region AutoGiro
/** Columns DAO.autogiroagreements.getAgreements may ORDER BY (interpolated into SQL). */
const autoGiroSortId = [
  "id",
  "full_name",
  "active",
  "amount",
  "payment_date",
  "kid",
  "created",
  "last_updated",
  "cancelled",
  "notice",
] as const;

const autoGiroFilter = z
  .strictObject({
    /** Agreement sum in SEK */
    amount: range(z.number()).optional(),
    payment_date: range(chargeDay).optional(),
    /** Created date, inclusive whole Oslo days */
    created: range(isoDate).optional(),
    KID: z.string().optional(),
    donor: z.string().optional(),
    statuses: z.array(agreementStatus).optional(),
  })
  .transform(({ created, ...rest }) => ({ ...rest, createdRange: osloDayRange(created) }));

const autoGiroQuery = {
  sort: sortSchema(autoGiroSortId).optional(),
  filter: autoGiroFilter.optional(),
};

export const autoGiroListInput = z.strictObject({ ...paginationFields, ...autoGiroQuery });
export const autoGiroExportInput = z.strictObject(autoGiroQuery);

/** Columns DAO.autogiroagreements.getMandates may ORDER BY (interpolated into SQL). */
const mandateSortId = ["id", "kid", "status", "full_name", "created", "last_updated"] as const;

export const mandateStatus = z.enum([
  "DRAFTED",
  "NEW",
  "PENDING",
  "ACTIVE",
  "STOPPED",
  "REJECTED",
  "CANCELLED",
]);

export const mandateListInput = z.strictObject({
  ...paginationFields,
  sort: sortSchema(mandateSortId).optional(),
  filter: z
    .strictObject({
      KID: z.string().optional(),
      donor: z.string().optional(),
      statuses: z.array(mandateStatus).optional(),
    })
    .optional(),
});
// endregion
