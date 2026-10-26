import { z } from "zod";

// Vipps agreement ids are strings like "agr_5kSeqz" (Vipps_agreements.ID is VARCHAR), as are
// charge ids, so these are not numeric ids.
export const agreementIdSchema = z.string().min(1);
export const chargeIdSchema = z.string().min(1);

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

const numberRange = z.object({
  from: z.number().optional(),
  to: z.number().optional(),
});

const chargeDaySchema = z.number().int().min(0).max(28);

const dateRange = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

/** Mirrors VippsAgreementFilters in DAO_modules/vipps.ts. */
export const agreementFilterSchema = z.object({
  amount: numberRange.optional(),
  /** Draft (created) date range, inclusive of the whole `to` day */
  created: dateRange.optional(),
  chargeDay: z
    .object({ from: chargeDaySchema.optional(), to: chargeDaySchema.optional() })
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
export const chargeFilterSchema = z.object({
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
const agreementSortSchema = z.object({
  id: z.enum(["id", "full_name", "kid", "amount", "chargeDay", "created", "status"]),
  desc: z.boolean(),
});

const chargeSortSchema = z.object({
  id: z.enum(["full_name", "kid", "created", "status", "amountNOK", "dueDate"]),
  desc: z.boolean(),
});

const pagination = {
  page: z.number().int().min(0),
  limit: z.number().int().positive(),
};

export const agreementListInput = z.object({
  ...pagination,
  sort: agreementSortSchema.optional(),
  filter: agreementFilterSchema.optional(),
});

export const agreementExportInput = z.object({
  sort: agreementSortSchema.optional(),
  filter: agreementFilterSchema.optional(),
});

export const chargeListInput = z.object({
  ...pagination,
  sort: chargeSortSchema.optional(),
  filter: chargeFilterSchema.optional(),
});

export const chargeExportInput = z.object({
  sort: chargeSortSchema.optional(),
  filter: chargeFilterSchema.optional(),
});

export const defaultChargeSort = { id: "dueDate", desc: true } as const;

const percentageShare = z.string().regex(/^\d{1,3}(\.\d+)?$/, "Must be a decimal percentage");

/** A distribution for an agreement; the donor is always the agreement's donor. */
export const agreementDistributionSchema = z.object({
  taxUnitId: z.number().int().positive().nullable(),
  causeAreas: z
    .array(
      z.object({
        id: z.number().int().positive(),
        standardSplit: z.boolean(),
        percentageShare,
        organizations: z
          .array(z.object({ id: z.number().int().positive(), percentageShare }))
          .min(1),
      }),
    )
    .min(1),
});

export const matchingRuleCreateInput = z.object({
  salesLocation: z.string().max(45).nullable(),
  message: z.string().max(45).nullable(),
  /** Inclusive first day of the period */
  periodFrom: z.iso.date(),
  /** Last day of the period, must be after periodFrom */
  periodTo: z.iso.date(),
  resolveKID: z.string().min(1),
  precedence: z.number().int().nullable(),
});

export const matchingRuleListInput = z
  .object({
    /** Only rules whose period overlaps this one (inclusive) */
    period: z.object({ from: z.iso.date(), to: z.iso.date() }),
  })
  .optional();
