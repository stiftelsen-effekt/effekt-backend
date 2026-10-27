import { z } from "zod";
import {
  idSchema as id,
  isoDateSchema,
  localeSchema as locale,
  paginationFields,
  sortSchema,
} from "./common";

export const donorIdInput = z.strictObject({ donorId: id });

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

/** Donors.full_name and email are TINYTEXT */
const donorName = z.string().min(1).max(255);
const donorEmail = z.email().max(255);

/** Tax_unit.full_name is VARCHAR(128) */
const taxUnitName = z.string().min(1).max(128);
const ssn = z.string().max(32);

/**
 * Mirrors DonorFilters in DAO_modules/donors.ts (minus the free text `query`, which `search`
 * exposes). Without `fundraiserTypes`, `fundraiserGiving` counts every fundraiser type,
 * including historical Adoveo fundraisers.
 */
export const donorFilter = z.strictObject({
  donorId: id.optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  /** Partial match on name OR email (wildcards matched literally); combines with the others */
  nameOrEmail: z.string().trim().min(1).max(255).optional(),
  newsletter: z.boolean().optional(),
  registered: dateRange.optional(),
  donationsDateRange: dateRange.optional(),
  lastDonationDate: dateRange.optional(),
  donationsCount: countRange.optional(),
  donationsSum: sumRange.optional(),
  fundraiserGiving: z.enum(["only", "atLeastOnce", "never"]).optional(),
  fundraiserTypes: z.array(z.enum(["facebook", "homebrew"])).optional(),
  referralTypeIDs: z.array(id).optional(),
  recipientOrgIDs: z.array(id).optional(),
});

export type DonorFilterInput = z.infer<typeof donorFilter>;

export const donorSort = sortSchema([
  "id",
  "name",
  "email",
  "registered",
  "lastDonationDate",
  "donationsCount",
  "donationsSum",
]);

export const listInput = z.strictObject({
  ...paginationFields,
  sort: donorSort.optional(),
  filter: donorFilter.optional(),
});

export const exportInput = z.strictObject({
  sort: donorSort.optional(),
  filter: donorFilter.optional(),
});

export const searchInput = z.strictObject({
  /**
   * MySQL boolean mode full text search over name and email: `+term` must match,
   * `-term` must not match, `"a phrase"` matches the phrase, `term*` matches the prefix,
   * bare terms are OR-ed. Other operators are ignored. An all-digit query matches the donor id.
   */
  query: z.string().min(1).max(200),
  page: paginationFields.page.default(0),
  limit: paginationFields.limit.max(100).default(25),
  sort: donorSort.optional(),
});

export const createInput = z.strictObject({
  email: donorEmail,
  name: donorName,
  /** Optional ssn / organization number; creates a tax unit named after the donor */
  ssn: ssn.optional(),
  /** Locale used to validate ssn */
  locale,
});

export const updateInput = z.strictObject({
  donorId: id,
  name: donorName,
  email: donorEmail.optional(),
  newsletter: z.boolean().optional(),
  trash: z.boolean().optional(),
});

export const mergeInput = z.strictObject({
  originId: id,
  destinationId: id,
});

export const taxUnitListInput = z.strictObject({ donorId: id, locale });

export const taxUnitCreateInput = z.strictObject({
  donorId: id,
  name: taxUnitName,
  ssn,
  locale,
});

export const taxUnitUpdateInput = z.strictObject({
  id,
  name: taxUnitName,
  ssn,
  locale,
});

export const taxUnitArchiveInput = z.strictObject({
  donorId: id,
  taxUnitId: id,
  /** Tax unit to move the current year's donations to */
  transferId: id.optional(),
});
