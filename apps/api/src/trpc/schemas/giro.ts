import { z } from "zod";
import { osloDayRange } from "../../custom_modules/osloDays";
import {
  avtaleGiroChargeSortColumns,
  avtaleGiroChargeStatuses,
} from "../../custom_modules/DAO_modules/avtalegirocharges";
import { idSchema, isoDateSchema, paginationFields, sortSchema } from "./common";

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

// region AvtaleGiro charges
const chargeStatusSchema = z.enum(avtaleGiroChargeStatuses);

/** Mirrors AvtaleGiroChargeFilter in DAO_modules/avtalegirocharges.ts */
export const avtaleGiroChargeFilter = z.strictObject({
  /** An empty array matches nothing */
  statuses: z.array(chargeStatusSchema).optional(),
  /** Due date, inclusive. The column is a plain date, so no time zone is involved. */
  dueDate: range(isoDate).optional(),
  /** In NOK */
  amount: range(z.number().min(0)).optional(),
  /** Partial match */
  KID: z.string().max(32).optional(),
  agreementId: idSchema.optional(),
  /** Partial match on the donor's name */
  donor: z.string().max(255).optional(),
  donorId: idSchema.optional(),
  /** The shipment that sent the claim or its deletion */
  shipmentId: idSchema.optional(),
  /** Linked to a donation (an OCR payment) or not */
  matched: z.boolean().optional(),
});

export const avtaleGiroChargeListInput = z.strictObject({
  ...paginationFields,
  sort: sortSchema(avtaleGiroChargeSortColumns).optional(),
  filter: avtaleGiroChargeFilter.optional(),
});

export const defaultAvtaleGiroChargeSort = { id: "dueDate", desc: true } as const;

/** NOK with two decimals, e.g. "500.00" */
const nokString = z.string().regex(/^-?\d+\.\d{2}$/);

export const avtaleGiroChargeRow = z.strictObject({
  id: z.number().int(),
  agreementId: z.number().int(),
  KID: z.string(),
  /** YYYY-MM-DD */
  dueDate: z.string(),
  amount: nokString,
  status: chargeStatusSchema,
  /** The claims shipment that sent the charge */
  shipmentId: z.number().int(),
  /** The shipment that sent its deletion, once sent */
  deletionShipmentId: z.number().int().nullable(),
  /** The donation that paid it, once the payment is in an OCR file */
  donationId: z.number().int().nullable(),
  donorId: z.number().int().nullable(),
  donorName: z.string().nullable(),
  /** ISO instant */
  created: z.string().nullable(),
  /** ISO instant */
  lastUpdated: z.string().nullable(),
});

export const avtaleGiroChargeListOutput = z.strictObject({
  rows: z.array(avtaleGiroChargeRow),
  pages: z.number().int(),
  summary: z.strictObject({
    count: z.number().int(),
    sum: nokString,
    byStatus: z.array(
      z.strictObject({
        status: chargeStatusSchema,
        count: z.number().int(),
        sum: nokString,
      }),
    ),
  }),
});

export const avtaleGiroAgreementChargesInput = z.strictObject({ agreementId: idSchema });
export const avtaleGiroAgreementChargesOutput = z.array(avtaleGiroChargeRow);
// endregion
