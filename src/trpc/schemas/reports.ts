import { z } from "zod";
import { TRPC_MAX_BODY_SIZE } from "../reportsMultipart";

export const id = z.number().int().positive();

export const idInput = z.object({ id }).strict();

export const donorIdInput = z.object({ donorId: id }).strict();

//region FormData uploads

/**
 * Collects FormData entries into a plain object. A key sent more than once becomes an array, so
 * the object schema rejects e.g. two `report` files instead of silently picking one.
 */
const formDataToRecord = (formData: FormData) => {
  const record: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
};

/**
 * Input for a procedure called with a FormData body (multipart/form-data). The client must send
 * these through a non-batching link (`httpLink`), e.g. with `splitLink` +
 * `isNonJsonSerializable(op.input)`.
 */
export const formDataInput = <S extends z.ZodRawShape>(shape: S) =>
  z
    .instanceof(FormData)
    // `any` so the object schema below can declare its own input types
    .transform((formData): any => formDataToRecord(formData))
    .pipe(z.strictObject(shape));

export const reportFile = z
  .instanceof(File, { message: "Missing report file" })
  .refine((file) => file.size > 0, "Report file is empty")
  .refine((file) => file.size <= TRPC_MAX_BODY_SIZE, "Report file is larger than 10 MB");

/** Numeric FormData field, e.g. "3" */
const positiveIntField = z
  .string()
  .regex(/^[1-9]\d*$/, "Expected a positive integer")
  .transform(Number);

export const reportUploadInput = formDataInput({
  report: reportFile,
  metaOwnerID: positiveIntField,
});

export const bankSeUploadInput = formDataInput({
  report: reportFile,
  dryRun: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const fileOnlyUploadInput = formDataInput({
  report: reportFile,
});

export const ku65Input = formDataInput({
  report: reportFile.refine((file) => file.type === "text/csv", "Invalid file type, must be CSV"),
  year: z
    .string()
    .regex(/^\d{4}$/, "Invalid year")
    .transform(Number)
    .pipe(z.number().int().min(2000, "Invalid year").max(2100, "Invalid year")),
});

//endregion

//region Transaction report

export const transactionRangeInput = z
  .object({
    /** Inclusive */
    fromDate: z.iso.date(),
    /** Inclusive */
    toDate: z.iso.date(),
    /** All payment methods when omitted */
    paymentMethodIDs: z.array(id).min(1).optional(),
  })
  .strict();

//endregion

//region Logs

export const logsListInput = z
  .object({
    page: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(1000),
    filter: z
      .object({
        /** Fuzzy match in the `file` field of the log entry's result JSON */
        fileSearch: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

//endregion

//region Fundraisers

const dateRange = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();

const countRange = z
  .object({
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().nonnegative().optional(),
  })
  .strict();

const sumRange = z
  .object({
    from: z.number().nonnegative().optional(),
    to: z.number().nonnegative().optional(),
  })
  .strict();

/** Mirrors FundraiserListFilter in DAO_modules/fundraisers.ts */
export const fundraiserFilter = z
  .object({
    registrationDate: dateRange.optional(),
    fundraiserId: id.optional(),
    /** Fuzzy match on the fundraiser owner's name */
    donor: z.string().optional(),
    donationCount: countRange.optional(),
    donationSum: sumRange.optional(),
    /** Fundraisers with at least one donation to one of these organizations */
    organizationIDs: z.array(id).optional(),
  })
  .strict();

/** Sortable columns, see jsDBmapping in DAO_modules/fundraisers.ts */
export const fundraiserSort = z
  .object({
    id: z.enum(["id", "registered", "donor", "totalSum", "donationCount", "averageDonation"]),
    desc: z.boolean(),
  })
  .strict();

export const fundraisersListInput = z
  .object({
    page: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(1000),
    sort: fundraiserSort.optional(),
    filter: fundraiserFilter.optional(),
  })
  .strict();

//endregion
