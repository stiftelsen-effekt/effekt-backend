import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import {
  DonorServiceError,
  archiveTaxUnit,
  createDonor,
  createTaxUnitForDonor,
  mergeDonors,
  validateTaxUnitSsn,
} from "../../custom_modules/donorService";
import { RequestLocale } from "../../middleware/locale";
import { osloDayRange } from "../../custom_modules/osloDays";
import { csvExport } from "../csv";
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

/**
 * Maps the procedure filter to DAO.donors.getAll's filter. Date ranges are whole Oslo days
 * (osloDays.ts). donorId must be null rather than undefined when unset: getAll adds
 * `Donors.ID = NULL` for anything !== null.
 */
const toDonorFilters = (filter: DonorFilterInput | undefined, query?: string) => {
  const { registered, donationsDateRange, lastDonationDate, ...rest } = filter ?? {};
  return {
    ...rest,
    // Fundraiser types alone mean "gave to a fundraiser of these types"
    fundraiserGiving:
      rest.fundraiserGiving ?? (rest.fundraiserTypes ? ("atLeastOnce" as const) : undefined),
    donorId: filter?.donorId ?? null,
    query,
    registeredRange: osloDayRange(registered),
    donationsRange: osloDayRange(donationsDateRange),
    lastDonationRange: osloDayRange(lastDonationDate),
  };
};

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

/**
 * CONFLICT if another donor has the email. The message ends with "(donor <id>)", so the admin
 * can link to the existing donor.
 */
const assertEmailUnused = async (email: string, exceptDonorId?: number) => {
  const existing = await DAO.donors.getIDbyEmail(email);
  if (existing !== null && existing !== exceptDonorId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Email already belongs to another donor (donor ${existing})`,
    });
  }
};

const getDonorOrThrow = async (donorId: number) => {
  const donor = await DAO.donors.getByID(donorId);
  if (!donor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No donor found with ID " + donorId });
  }
  return donor;
};

/**
 * Validates the ssn and returns it in the form we store: Swedish personnummer /
 * organisationsnummer without the dash (YYYYMMDDNNNN), everything else as given.
 */
const normalizeValidSsn = (ssn: string, locale: RequestLocale): string => {
  const error = validateTaxUnitSsn(ssn, locale);
  if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
  return locale === RequestLocale.SV ? ssn.replace("-", "") : ssn;
};

/** The stored forms an ssn may have; older Swedish tax units can have the dash */
const storedSsnForms = (ssn: string, locale: RequestLocale): string[] =>
  locale === RequestLocale.SV ? [ssn, `${ssn.slice(0, 8)}-${ssn.slice(8)}`] : [ssn];

/** Throws CONFLICT if the donor has another tax unit (archived ones included) with this ssn */
const assertSsnUnused = async (
  donorId: number,
  ssn: string,
  locale: RequestLocale,
  exceptTaxUnitId?: number,
) => {
  for (const form of storedSsnForms(ssn, locale)) {
    const existing = await DAO.tax.getByDonorIdAndSsn(donorId, form);
    if (existing && existing.id !== exceptTaxUnitId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "The donor already has a tax unit with this ssn",
      });
    }
  }
};

/**
 * Makes a free text query safe for MATCH ... AGAINST (... IN BOOLEAN MODE). Keeps the
 * documented syntax (leading + or -, "quoted phrases", trailing * for prefixes) and drops
 * every other operator character, so malformed input can't cause a syntax error.
 * Returns an empty string when nothing searchable is left.
 */
export const sanitizeBooleanQuery = (query: string): string => {
  const operatorChars = /[+\-<>()~*"@]/g;
  const terms: string[] = [];
  for (const match of query.matchAll(/([+-]?)"([^"]*)"|(\S+)/g)) {
    const [, phrasePrefix, phrase, bare] = match;
    if (phrase !== undefined) {
      const words = phrase.replace(operatorChars, " ").trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) terms.push(`${phrasePrefix}"${words.join(" ")}"`);
      continue;
    }
    const prefix = bare[0] === "+" || bare[0] === "-" ? bare[0] : "";
    const truncate = bare.length > 1 && bare.endsWith("*");
    const words = bare.replace(operatorChars, " ").trim().split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      terms.push(`${prefix}${word}${truncate && i === words.length - 1 ? "*" : ""}`);
    });
  }
  return terms.join(" ");
};

/** Input that looks like (part of) an email address: one token containing @ */
const isEmailLike = (query: string) => /^\S*@\S*$/.test(query);

/** The query uses the boolean mode syntax: a +/- prefixed token, a quote or a trailing * */
const usesBooleanSyntax = (query: string) => /(^|\s)[+-]|"|\*(\s|$)/.test(query);

/**
 * How donors.search matches a query: an all-digit query is a donor id; email-like input is a
 * partial match on the email (MySQL full text search can't match across @ and dots); explicit
 * boolean syntax is passed through; plain words must all match, as prefixes.
 */
export const toDonorSearch = (
  query: string,
): { query: string } | { nameOrEmail: string } | { error: string } => {
  const trimmed = query.trim();
  if (/^\d+$/.test(trimmed)) return { query: trimmed };
  if (isEmailLike(trimmed)) return { nameOrEmail: trimmed };
  const sanitized = sanitizeBooleanQuery(trimmed);
  if (sanitized.length === 0) return { error: "The search query has no search terms" };
  if (usesBooleanSyntax(trimmed)) return { query: sanitized };
  return {
    query: sanitized
      .split(" ")
      .map((word) => `+${word}*`)
      .join(" "),
  };
};

const isMysqlParseError = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { errno?: unknown }).errno === 1064;

type DonorListResult = Awaited<ReturnType<typeof DAO.donors.getAll>>;

/** Statistics are aggregate strings from MySQL when there are rows, 0 otherwise */
const withNumericStatistics = ({ statistics, ...result }: DonorListResult) => ({
  ...result,
  statistics: {
    totalDonors: Number(statistics.totalDonors),
    totalDonationSum: Number(statistics.totalDonationSum),
    totalDonationCount: Number(statistics.totalDonationCount),
  },
});

/** Donors.trash is a nullable TINYINT */
const toDonorOutput = (donor: NonNullable<Awaited<ReturnType<typeof DAO.donors.getByID>>>) => ({
  ...donor,
  trash: Boolean(donor.trash),
});

const taxUnitsRouter = router({
  list: adminProcedure
    .input(taxUnitListInput)
    .query(({ input }) => DAO.tax.getByDonorId(input.donorId, input.locale)),

  create: adminProcedure.input(taxUnitCreateInput).mutation(async ({ input }) => {
    const ssn = normalizeValidSsn(input.ssn, input.locale);
    const donor = await getDonorOrThrow(input.donorId);
    await assertSsnUnused(donor.id, ssn, input.locale);

    const taxUnit = await createTaxUnitForDonor(donor.id, ssn, input.name, input.locale);
    if (!taxUnit) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create tax unit" });
    }
    return taxUnit;
  }),

  update: adminProcedure.input(taxUnitUpdateInput).mutation(async ({ input }) => {
    const ssn = normalizeValidSsn(input.ssn, input.locale);

    const existing = await DAO.tax.getById(input.id);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No tax unit found with ID " + input.id });
    }
    if (existing.archived) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Archived tax units can't be edited" });
    }

    await assertSsnUnused(existing.donorId, ssn, input.locale, existing.id);

    await DAO.tax.updateTaxUnit(input.id, { ...existing, name: input.name, ssn });
    return { ...existing, name: input.name, ssn };
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
  /** amount is in whole kroner */
  avtalegiro: adminProcedure.input(donorIdInput).query(async ({ input }) =>
    (await DAO.avtalegiroagreements.getByDonorId(input.donorId)).map((agreement) => ({
      ...agreement,
      // ROUND(amount / 100, 0) arrives as a decimal string
      amount: Number(agreement.amount),
      active: Boolean(agreement.active),
      notice: Boolean(agreement.notice),
    })),
  ),
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
    .query(async ({ input }) =>
      withNumericStatistics(
        await DAO.donors.getAll(
          input.sort ?? DEFAULT_SORT,
          input.page,
          input.limit,
          toDonorFilters(input.filter),
          RequestLocale.NO,
        ),
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
    return csvExport("donors", rows);
  }),

  /**
   * The donor picker. See searchInput for the query syntax. Donors whose id, email or name
   * equals the query come first, then the sort order.
   */
  search: adminProcedure.input(searchInput).query(async ({ input }) => {
    const search = toDonorSearch(input.query);
    if ("error" in search) throw new TRPCError({ code: "BAD_REQUEST", message: search.error });
    const filter = {
      ...toDonorFilters(
        "nameOrEmail" in search ? { nameOrEmail: search.nameOrEmail } : undefined,
        "query" in search ? search.query : undefined,
      ),
      exactMatchFirst: input.query.trim(),
    };
    try {
      return withNumericStatistics(
        await DAO.donors.getAll(
          input.sort ?? DEFAULT_SORT,
          input.page,
          input.limit,
          filter,
          RequestLocale.NO,
        ),
      );
    } catch (err) {
      if (isMysqlParseError(err)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid search query", cause: err });
      }
      throw err;
    }
  }),

  get: adminProcedure
    .input(donorIdInput)
    .query(async ({ input }) => toDonorOutput(await getDonorOrThrow(input.donorId))),

  /** Creates a donor, and a tax unit named after the donor if ssn is given (like POST /donors) */
  create: adminProcedure.input(createInput).mutation(async ({ input }) => {
    const ssn = input.ssn !== undefined ? normalizeValidSsn(input.ssn, input.locale) : undefined;
    await assertEmailUnused(input.email);
    const donorId = await withServiceErrors(() => createDonor(input.email, input.name));
    if (ssn !== undefined) {
      const taxUnit = await createTaxUnitForDonor(donorId, ssn, input.name, input.locale);
      if (!taxUnit) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create tax unit",
        });
      }
    }
    return toDonorOutput(await getDonorOrThrow(donorId));
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
        const existing =
          input.email !== undefined
            ? await DAO.donors.getIDbyEmail(input.email).catch(() => null)
            : null;
        throw new TRPCError({
          code: "CONFLICT",
          message: `Email already belongs to another donor${
            existing ? ` (donor ${existing})` : ""
          }`,
        });
      }
      throw err;
    }
    return toDonorOutput(await getDonorOrThrow(donor.id));
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

  /**
   * Distributions (KIDs) with donation sum and count. sum is a decimal string, null when the
   * distribution has no donations.
   */
  distributionsAggregated: adminProcedure.input(donorIdInput).query(async ({ input }) =>
    (await DAO.distributions.getByDonorId(input.donorId)).map((distribution) => {
      const { sum, count } = distribution as { sum: unknown; count: unknown };
      return {
        ...distribution,
        sum: sum === null || sum === undefined ? null : String(sum),
        count: Number(count ?? 0),
      };
    }),
  ),

  referrals: adminProcedure.input(donorIdInput).query(async ({ input }) =>
    (await DAO.referrals.getDonorAnswers(input.donorId)).map((answer) => ({
      ...answer,
      active: Boolean(answer.active),
    })),
  ),

  recurring: recurringRouter,

  taxUnits: taxUnitsRouter,
});
