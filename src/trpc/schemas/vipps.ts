import { z } from "zod";
import { idSchema, isoDateSchema, paginationFields, sortSchema } from "./common";

// Vipps agreement ids are strings like "agr_5kSeqz" (Vipps_agreements.ID is VARCHAR), as are
// charge ids, so these are not numeric ids.
export const agreementIdSchema = z.string().min(1).max(20);
export const chargeIdSchema = z.string().min(1).max(11);

export const agreementStatusSchema = z.enum(["ACTIVE", "PENDING", "EXPIRED", "STOPPED"]);

export const chargeStatusSchema = z.enum([
  "PENDING",
  "DUE",
  "CHARGED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "RESERVED",
  "CANCELLED",
  "PROCESSING",
]);

const numberRange = z.strictObject({
  from: z.number().optional(),
  to: z.number().optional(),
});

const chargeDaySchema = z.number().int().min(0).max(28);

const dateRange = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** Mirrors VippsAgreementFilters in DAO_modules/vipps.ts. */
export const agreementFilterSchema = z.strictObject({
  amount: numberRange.optional(),
  /** Draft (created) date range, inclusive of the whole `to` day */
  created: dateRange.optional(),
  chargeDay: z
    .strictObject({ from: chargeDaySchema.optional(), to: chargeDaySchema.optional() })
    .optional(),
  /** Partial match */
  KID: z.string().optional(),
  /** Partial match on donor full name */
  donor: z.string().optional(),
  /** An empty array matches nothing */
  statuses: z.array(agreementStatusSchema).optional(),
  /** Partial match */
  agreementID: z.string().optional(),
});

/**
 * Mirrors the filter read by DAO.vipps.getCharges. The DAO's `timestamp` branch is left out on
 * purpose: it reads filter.dueDate instead of filter.timestamp.
 */
export const chargeFilterSchema = z.strictObject({
  /** In NOK; 0 is ignored by the DAO */
  amount: numberRange.optional(),
  /** Inclusive. Vipps_agreement_charges.dueDate is a YYYY-MM-DD string column. */
  dueDate: dateRange.optional(),
  /** Partial match */
  KID: z.string().optional(),
  /** Partial match on donor full name */
  donor: z.string().optional(),
  /** An empty array matches nothing */
  statuses: z.array(chargeStatusSchema).optional(),
  /** Partial match */
  agreementID: z.string().optional(),
  /** Partial match */
  chargeID: z.string().optional(),
});

// Only columns present in each DAO query's select list are sortable.
const agreementSortSchema = sortSchema([
  "id",
  "full_name",
  "kid",
  "amount",
  "chargeDay",
  "created",
  "status",
] as const);

const chargeSortSchema = sortSchema([
  "full_name",
  "kid",
  "created",
  "status",
  "amountNOK",
  "dueDate",
] as const);

export const agreementListInput = z.strictObject({
  ...paginationFields,
  sort: agreementSortSchema.optional(),
  filter: agreementFilterSchema.optional(),
});

export const agreementExportInput = z.strictObject({
  sort: agreementSortSchema.optional(),
  filter: agreementFilterSchema.optional(),
});

export const chargeListInput = z.strictObject({
  ...paginationFields,
  sort: chargeSortSchema.optional(),
  filter: chargeFilterSchema.optional(),
});

export const chargeExportInput = z.strictObject({
  sort: chargeSortSchema.optional(),
  filter: chargeFilterSchema.optional(),
});

export const defaultChargeSort = { id: "dueDate", desc: true } as const;

export const matchingRuleCreateInput = z.strictObject({
  salesLocation: z.string().max(45).nullable(),
  message: z.string().max(45).nullable(),
  /** Inclusive first day of the period */
  periodFrom: isoDateSchema,
  /** Last day of the period, must be after periodFrom */
  periodTo: isoDateSchema,
  resolveKID: z.string().min(1).max(32),
  precedence: z.number().int().nullable(),
});

/** Same fields and validation as create */
export const matchingRuleUpdateInput = matchingRuleCreateInput.extend({ id: idSchema });

export const matchingRuleListInput = z
  .strictObject({
    /** Only rules whose period overlaps this one (inclusive) */
    period: z.strictObject({ from: isoDateSchema, to: isoDateSchema }),
  })
  .optional();

export const matchingRuleIdInput = z.strictObject({ id: idSchema });
