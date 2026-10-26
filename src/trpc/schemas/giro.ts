import { z } from "zod";

/** ISO date (YYYY-MM-DD), converted to local midnight like the REST API's date strings were. */
export const isoDate = z.iso.date();
export const toLocalDate = (isoDateString: string) => {
  const [year, month, day] = isoDateString.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const range = <T extends z.ZodType>(schema: T) =>
  z.object({ from: schema.optional(), to: schema.optional() });

const toDateRange = (created: { from?: string; to?: string } | undefined) =>
  created && {
    from: created.from ? toLocalDate(created.from) : undefined,
    to: created.to ? toLocalDate(created.to) : undefined,
  };

const pagination = {
  page: z.number().int().min(0),
  limit: z.number().int().positive(),
};

/** Day of month an agreement is charged; 0 means the last day of the month. */
export const chargeDay = z.number().int().min(0).max(28);

/** Agreement `active` column: 1 active, 0 inactive (drafted or cancelled). */
const agreementStatus = z.union([z.literal(0), z.literal(1)]);

// region Distribution input (mirrors DistributionInput in src/schemas/specs/distribution.ts)
const distributionOrganizationInput = z.object({
  id: z.number().int().positive(),
  name: z.string().optional(),
  widgetDisplayName: z.string().optional(),
  percentageShare: z.string(),
});

const distributionCauseAreaInput = z.object({
  id: z.number().int().positive(),
  name: z.string().optional(),
  standardSplit: z.boolean(),
  percentageShare: z.string(),
  organizations: z.array(distributionOrganizationInput),
});

export const distributionInput = z.object({
  donorId: z.number().int().positive(),
  taxUnitId: z.number().int().positive().nullable(),
  fundraiserId: z.number().int().positive().optional(),
  causeAreas: z.array(distributionCauseAreaInput),
});
// endregion

// region AvtaleGiro
/** Sort keys accepted by DAO.avtalegiroagreements.getAgreements (its jsDBmapping). */
const avtaleGiroSortId = z.enum([
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
]);

const avtaleGiroFilter = z
  .object({
    /** Agreement sum in NOK */
    amount: range(z.number()).optional(),
    paymentDate: range(chargeDay).optional(),
    /** Draft (created) date, inclusive */
    created: range(isoDate).optional(),
    KID: z.string().optional(),
    donor: z.string().optional(),
    statuses: z.array(agreementStatus).optional(),
  })
  .transform(({ created, ...rest }) => ({ ...rest, created: toDateRange(created) }));

const avtaleGiroQuery = {
  sort: z.object({ id: avtaleGiroSortId, desc: z.boolean() }).optional(),
  filter: avtaleGiroFilter.optional(),
};

export const avtaleGiroListInput = z.object({ ...pagination, ...avtaleGiroQuery });
export const avtaleGiroExportInput = z.object(avtaleGiroQuery);
// endregion

// region AutoGiro
/** Columns DAO.autogiroagreements.getAgreements may ORDER BY (interpolated into SQL). */
const autoGiroSortId = z.enum([
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
]);

const autoGiroFilter = z
  .object({
    /** Agreement sum in SEK */
    amount: range(z.number()).optional(),
    payment_date: range(chargeDay).optional(),
    /** Created date */
    created: range(isoDate).optional(),
    KID: z.string().optional(),
    donor: z.string().optional(),
    statuses: z.array(agreementStatus).optional(),
  })
  .transform(({ created, ...rest }) => ({ ...rest, created: toDateRange(created) }));

const autoGiroQuery = {
  sort: z.object({ id: autoGiroSortId, desc: z.boolean() }).optional(),
  filter: autoGiroFilter.optional(),
};

export const autoGiroListInput = z.object({ ...pagination, ...autoGiroQuery });
export const autoGiroExportInput = z.object(autoGiroQuery);

/** Columns DAO.autogiroagreements.getMandates may ORDER BY (interpolated into SQL). */
const mandateSortId = z.enum(["id", "kid", "status", "full_name", "created", "last_updated"]);

export const mandateStatus = z.enum([
  "DRAFTED",
  "NEW",
  "PENDING",
  "ACTIVE",
  "STOPPED",
  "REJECTED",
  "CANCELLED",
]);

export const mandateListInput = z.object({
  ...pagination,
  sort: z.object({ id: mandateSortId, desc: z.boolean() }).optional(),
  filter: z
    .object({
      KID: z.string().optional(),
      donor: z.string().optional(),
      statuses: z.array(mandateStatus).optional(),
    })
    .optional(),
});
// endregion
