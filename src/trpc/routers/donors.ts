import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import { generateCsv } from "../../custom_modules/csvexport";
import {
  DonorServiceError,
  archiveTaxUnit,
  createDonor,
  createTaxUnitForDonor,
  mergeDonors,
  validateTaxUnitSsn,
} from "../../custom_modules/donorService";
import { RequestLocale } from "../../middleware/locale";
import { adminProcedure, router } from "../trpc";
import {
  DonorFilterInput,
  createInput,
  donorIdInput,
  exportInput,
  listInput,
  mergeInput,
  searchInput,
  taxUnitArchiveInput,
  taxUnitCreateInput,
  taxUnitListInput,
  taxUnitUpdateInput,
  updateInput,
} from "../schemas/donors";

/** Turns an ISO date (YYYY-MM-DD) into local midnight, the way the old admin's date pickers did. */
const toDate = (isoDate: string): Date => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toDateRange = (range?: { from?: string; to?: string }) =>
  range && {
    from: range.from !== undefined ? toDate(range.from) : undefined,
    to: range.to !== undefined ? toDate(range.to) : undefined,
  };

/**
 * Maps the procedure filter to DAO.donors.getAll's filter. donorId must be null rather than
 * undefined when unset: getAll adds `Donors.ID = NULL` for anything !== null.
 */
const toDonorFilters = (filter: DonorFilterInput | undefined, query?: string) => ({
  ...filter,
  donorId: filter?.donorId ?? null,
  query,
  registered: toDateRange(filter?.registered),
  donationsDateRange: toDateRange(filter?.donationsDateRange),
  lastDonationDate: toDateRange(filter?.lastDonationDate),
});

const DEFAULT_SORT = { id: "id", desc: true };

/** Maps expected service failures to tRPC errors. */
const withServiceErrors = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DonorServiceError) {
      throw new TRPCError({ code: err.kind, message: err.message });
    }
    throw err;
  }
};

const isDuplicateEntry = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ER_DUP_ENTRY";

const getDonorOrThrow = async (donorId: number) => {
  const donor = await DAO.donors.getByID(donorId);
  if (!donor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No donor found with ID " + donorId });
  }
  return donor;
};

const assertValidSsn = (ssn: string, locale: RequestLocale) => {
  const error = validateTaxUnitSsn(ssn, locale);
  if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
};

const taxUnitsRouter = router({
  list: adminProcedure
    .input(taxUnitListInput)
    .query(({ input }) => DAO.tax.getByDonorId(input.donorId, input.locale)),

  create: adminProcedure.input(taxUnitCreateInput).mutation(async ({ input }) => {
    assertValidSsn(input.ssn, input.locale);
    const donor = await getDonorOrThrow(input.donorId);

    const existing = await DAO.tax.getByDonorIdAndSsn(donor.id, input.ssn);
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "The donor already has a tax unit with this ssn",
      });
    }

    const taxUnit = await createTaxUnitForDonor(donor.id, input.ssn, input.name, input.locale);
    if (!taxUnit) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create tax unit" });
    }
    return taxUnit;
  }),

  update: adminProcedure.input(taxUnitUpdateInput).mutation(async ({ input }) => {
    assertValidSsn(input.ssn, input.locale);

    const existing = await DAO.tax.getById(input.id);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No tax unit found with ID " + input.id });
    }
    if (existing.archived) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Archived tax units can't be edited" });
    }

    await DAO.tax.updateTaxUnit(input.id, { ...existing, name: input.name, ssn: input.ssn });
    return { ...existing, name: input.name, ssn: input.ssn };
  }),

  archive: adminProcedure.input(taxUnitArchiveInput).mutation(async ({ input }) => {
    if (input.transferId !== undefined) {
      if (input.transferId === input.taxUnitId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can't transfer donations to the tax unit being archived",
        });
      }
      const transferTo = await DAO.tax.getById(input.transferId);
      if (!transferTo || transferTo.donorId !== input.donorId || transferTo.archived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The transfer tax unit must be an active tax unit of the same donor",
        });
      }
    }

    const archived = await withServiceErrors(() =>
      archiveTaxUnit(input.donorId, input.taxUnitId, input.transferId),
    );
    if (!archived) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to archive tax unit" });
    }
    return true as const;
  }),
});

const recurringRouter = router({
  avtalegiro: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.avtalegiroagreements.getByDonorId(input.donorId)),
  autogiro: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.autogiroagreements.getAgreementsByDonorId(input.donorId)),
  vipps: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.vipps.getAgreementsByDonorId(input.donorId)),
});

export const donorsRouter = router({
  list: adminProcedure
    .input(listInput)
    .query(({ input }) =>
      DAO.donors.getAll(
        input.sort ?? DEFAULT_SORT,
        input.page,
        input.limit,
        toDonorFilters(input.filter),
        RequestLocale.NO,
      ),
    ),

  export: adminProcedure.input(exportInput).query(async ({ input }) => {
    const { rows } = await DAO.donors.getAll(
      input.sort ?? DEFAULT_SORT,
      0,
      Number.MAX_SAFE_INTEGER,
      toDonorFilters(input.filter),
      RequestLocale.NO,
    );
    return {
      filename: `donors-${new Date().toISOString()}.csv`,
      csv: generateCsv(rows),
    };
  }),

  /** The donor picker. See searchInput for the query syntax. */
  search: adminProcedure
    .input(searchInput)
    .query(({ input }) =>
      DAO.donors.getAll(
        input.sort ?? DEFAULT_SORT,
        input.page,
        input.limit,
        toDonorFilters(undefined, input.query),
        RequestLocale.NO,
      ),
    ),

  get: adminProcedure.input(donorIdInput).query(({ input }) => getDonorOrThrow(input.donorId)),

  create: adminProcedure.input(createInput).mutation(async ({ input }) => {
    const donorId = await withServiceErrors(() => createDonor(input.email, input.name));
    return getDonorOrThrow(donorId);
  }),

  update: adminProcedure.input(updateInput).mutation(async ({ input }) => {
    const donor = await getDonorOrThrow(input.donorId);
    try {
      const updated = await DAO.donors.update(
        donor.id,
        input.name,
        input.email ?? donor.email,
        input.newsletter ?? donor.newsletter,
        input.trash,
      );
      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not update donor" });
      }
    } catch (err) {
      if (isDuplicateEntry(err)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already belongs to another donor",
        });
      }
      throw err;
    }
    return getDonorOrThrow(donor.id);
  }),

  /** Moves everything from origin to destination and deletes origin. */
  merge: adminProcedure.input(mergeInput).mutation(async ({ input }) => {
    await withServiceErrors(() => mergeDonors(input.originId, input.destinationId));
    return true as const;
  }),

  donations: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.donations.getByDonorId(input.donorId)),

  /** Yearly sums per organization */
  donationsAggregated: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.donations.getYearlyAggregateByDonorId(input.donorId)),

  /** Distributions (KIDs) with donation sum and count */
  distributionsAggregated: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.distributions.getByDonorId(input.donorId)),

  referrals: adminProcedure
    .input(donorIdInput)
    .query(({ input }) => DAO.referrals.getDonorAnswers(input.donorId)),

  recurring: recurringRouter,

  taxUnits: taxUnitsRouter,
});
