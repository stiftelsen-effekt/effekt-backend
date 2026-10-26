import { z } from "zod";
import { RequestLocale } from "../../middleware/locale";

export const id = z.number().int().positive();

export const donorIdInput = z.object({ donorId: id }).strict();

export const locale = z.enum(RequestLocale).default(RequestLocale.NO);

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

/**
 * Mirrors DonorFilters in DAO_modules/donors.ts (minus the Adoveo fundraiser type and the
 * free text `query`, which `search` exposes).
 */
export const donorFilter = z
  .object({
    donorId: id.optional(),
    name: z.string().optional(),
    email: z.string().optional(),
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
  })
  .strict();

export type DonorFilterInput = z.infer<typeof donorFilter>;

export const donorSort = z
  .object({
    id: z.enum([
      "id",
      "name",
      "email",
      "registered",
      "lastDonationDate",
      "donationsCount",
      "donationsSum",
    ]),
    desc: z.boolean(),
  })
  .strict();

export const listInput = z
  .object({
    page: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(1000),
    sort: donorSort.optional(),
    filter: donorFilter.optional(),
  })
  .strict();

export const exportInput = z
  .object({
    sort: donorSort.optional(),
    filter: donorFilter.optional(),
  })
  .strict();

export const searchInput = z
  .object({
    /**
     * MySQL boolean mode full text search over name and email: `+term` must match,
     * `-term` must not match, bare terms are OR-ed. An all-digit query matches the donor id.
     */
    query: z.string().min(1).max(200),
    page: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().max(100).default(25),
    sort: donorSort.optional(),
  })
  .strict();

export const createInput = z
  .object({
    email: z.email(),
    name: z.string().min(1),
  })
  .strict();

export const updateInput = z
  .object({
    donorId: id,
    name: z.string().min(1),
    email: z.email().optional(),
    newsletter: z.boolean().optional(),
    trash: z.boolean().optional(),
  })
  .strict();

export const mergeInput = z
  .object({
    originId: id,
    destinationId: id,
  })
  .strict();

export const taxUnitListInput = z.object({ donorId: id, locale }).strict();

export const taxUnitCreateInput = z
  .object({
    donorId: id,
    name: z.string().min(1),
    ssn: z.string(),
    locale,
  })
  .strict();

export const taxUnitUpdateInput = z
  .object({
    id,
    name: z.string().min(1),
    ssn: z.string(),
    locale,
  })
  .strict();

export const taxUnitArchiveInput = z
  .object({
    donorId: id,
    taxUnitId: id,
    /** Tax unit to move the current year's donations to */
    transferId: id.optional(),
  })
  .strict();
