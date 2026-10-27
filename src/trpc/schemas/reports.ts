import { z } from "zod";
import { TRPC_MAX_BODY_SIZE } from "../reportsMultipart";
import {
  reviewQueueSources,
  reviewQueueStatuses,
} from "../../custom_modules/DAO_modules/reviewqueue";
import {
  distributionSchema,
  idSchema as id,
  isoDateOrDateTimeSchema,
  isoDateSchema,
  moneySchema,
  paginationFields,
  sortSchema,
} from "./common";
import { paymentExternalRefSchema } from "./donations";

export const idInput = z.strictObject({ id });

export const donorIdInput = z.strictObject({ donorId: id });

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

const singleFile = z
  .unknown()
  .refine((value) => !Array.isArray(value), "Upload one report file at a time")
  .pipe(z.instanceof(File, { message: "Missing report file" }));

export const reportFile = singleFile
  .refine((file) => file.size > 0, "Report file is empty")
  .refine((file) => file.size <= TRPC_MAX_BODY_SIZE, "Report file is larger than 10 MB");

/** Numeric FormData field, e.g. "3" */
const positiveIntField = z
  .string()
  .regex(/^[1-9]\d*$/, "Expected a positive integer")
  .transform(Number);

/** Data owner to register the donations under; the default owner when omitted */
const metaOwnerIDField = positiveIntField.optional();

export const reportUploadInput = formDataInput({
  report: reportFile,
  metaOwnerID: metaOwnerIDField,
});

export const bankSeUploadInput = formDataInput({
  report: reportFile,
  metaOwnerID: metaOwnerIDField,
  dryRun: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const fileOnlyUploadInput = formDataInput({
  report: reportFile,
  /** Accepted for consistency with the other uploads; validated, see the procedures */
  metaOwnerID: metaOwnerIDField,
});

/** Windows browsers send .csv files as application/vnd.ms-excel or application/octet-stream */
const isCsv = (file: File) =>
  file.type === "text/csv" ||
  (["application/vnd.ms-excel", "application/octet-stream", ""].includes(file.type) &&
    file.name.toLowerCase().endsWith(".csv"));

export const ku65Input = formDataInput({
  report: reportFile.refine(isCsv, "Invalid file type, must be CSV"),
  year: z
    .string()
    .regex(/^\d{4}$/, "Invalid year")
    .transform(Number)
    .pipe(z.number().int().min(2000, "Invalid year").max(2100, "Invalid year")),
});

//endregion

//region Transaction report

export const transactionRangeInput = z
  .strictObject({
    /** Inclusive */
    fromDate: isoDateSchema,
    /** Inclusive */
    toDate: isoDateSchema,
    /** All payment methods when omitted */
    paymentMethodIDs: z.array(id).min(1).optional(),
  })
  .refine((input) => input.fromDate <= input.toDate, {
    message: "fromDate must not be after toDate",
    path: ["toDate"],
  });

//endregion

//region Logs

export const logsSort = sortSchema(["timestamp", "label", "id"] as const);

export const logsListInput = z.strictObject({
  ...paginationFields,
  /** Newest first when omitted */
  sort: logsSort.optional(),
  filter: z
    .strictObject({
      /** Fuzzy match in the `file` field of the log entry's result JSON */
      fileSearch: z.string().optional(),
    })
    .optional(),
});

//endregion

//region Fundraisers

const dateRange = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const countRange = z.strictObject({
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
});

const sumRange = z.strictObject({
  from: z.number().nonnegative().optional(),
  to: z.number().nonnegative().optional(),
});

/** Mirrors FundraiserListFilter in DAO_modules/fundraisers.ts */
export const fundraiserFilter = z.strictObject({
  registrationDate: dateRange.optional(),
  fundraiserId: id.optional(),
  /** Fuzzy match on the fundraiser owner's name */
  donor: z.string().optional(),
  donationCount: countRange.optional(),
  donationSum: sumRange.optional(),
  /** Fundraisers with at least one donation to one of these organizations */
  organizationIDs: z.array(id).optional(),
});

/** Sortable columns, see jsDBmapping in DAO_modules/fundraisers.ts */
export const fundraiserSort = sortSchema([
  "id",
  "registered",
  "donor",
  "totalSum",
  "donationCount",
  "averageDonation",
] as const);

export const fundraisersListInput = z.strictObject({
  ...paginationFields,
  sort: fundraiserSort.optional(),
  filter: fundraiserFilter.optional(),
});

//endregion

//region Review queue

export const reviewQueueSourceSchema = z.enum(reviewQueueSources);
export const reviewQueueStatusSchema = z.enum(reviewQueueStatuses);

export const reviewQueueSort = sortSchema([
  "id",
  "created",
  "date",
  "amount",
  "source",
  "status",
] as const);

export const reviewQueueListInput = z.strictObject({
  ...paginationFields,
  sort: reviewQueueSort.optional(),
  filter: z
    .strictObject({
      statuses: z.array(reviewQueueStatusSchema).min(1).optional(),
      sources: z.array(reviewQueueSourceSchema).min(1).optional(),
    })
    .optional(),
});

export const reviewQueueSearchInput = z.strictObject({
  /** An item id, or part of a KID, external id, payer name or message */
  query: z.string().trim().min(1).max(255),
  limit: z.number().int().positive().max(50).default(10),
});

/**
 * Registers a donation from a queued item. The amount, date, payment method, external reference
 * and data owner default to the item's; the admin supplies the KID or a distribution.
 */
export const reviewQueueRegisterInput = z
  .strictObject({
    id,
    KID: z.string().min(1).optional(),
    distribution: distributionSchema.optional(),
    sum: moneySchema.optional(),
    timestamp: isoDateOrDateTimeSchema.optional(),
    paymentId: id.optional(),
    /** null registers the donation without an external reference */
    paymentExternalRef: paymentExternalRefSchema.nullable().optional(),
    /** Defaults to the data owner chosen at upload (the item's metaOwnerId), else the default owner */
    metaOwnerId: id.optional(),
    sendReceipt: z.boolean(),
  })
  .refine((input) => (input.KID === undefined) !== (input.distribution === undefined), {
    message: "Provide either a KID or a distribution, not both",
  });

export const reviewQueueIgnoreInput = z.strictObject({
  id,
  note: z.string().trim().min(1).max(2000).optional(),
});

//endregion
