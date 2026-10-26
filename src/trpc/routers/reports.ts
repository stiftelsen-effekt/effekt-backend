import { TRPCError } from "@trpc/server";
import { DateTime } from "luxon";
import moment from "moment";
import { DAO } from "../../custom_modules/DAO";
import { buildKu65Report } from "../../custom_modules/ku65";
import {
  processAutogiroReport,
  processBankNoReport,
  processBankSeReport,
  processFacebookReport,
  processOcrReport,
  processVippsReport,
} from "../../custom_modules/reportsService";
import {
  bankSeUploadInput,
  fileOnlyUploadInput,
  fundraisersListInput,
  donorIdInput,
  idInput,
  ku65Input,
  logsListInput,
  reportUploadInput,
  transactionRangeInput,
} from "../schemas/reports";
import { adminProcedure, router } from "../trpc";

//region Types

/**
 * A transaction from an uploaded report that could not be registered automatically. The admin
 * queues these for manual review (register with a KID / distribution, or discard).
 * Normalised across report sources.
 */
export type ManualReviewTransaction = {
  KID: string | null;
  amount: number;
  /** ISO 8601 */
  date: string | null;
  transactionID: string;
  /** Payment method ID to register the donation with */
  paymentID: number;
  message: string | null;
  /** Payer name (Vipps) or donor name (Swedish bank) */
  name: string | null;
  /** Vipps sales location */
  location: string | null;
};

export type ManualReviewItem = { reason: string; transaction: ManualReviewTransaction };

export type ReportUploadSummary = {
  /** Donations registered */
  valid: number;
  /** Transactions not registered, including ignored duplicates where the source counts them */
  invalid: number;
  /** Transactions that need manual review */
  invalidTransactions: ManualReviewItem[];
};

/** A file to download. `content` is text for text content types, base64 otherwise. */
export type FilePayload = {
  filename: string;
  contentType: string;
  content: string;
};

type DateLike = Date | moment.Moment | DateTime | null | undefined;

/** Same string the REST routes produce when JSON-serialising these dates */
const toIso = (date: DateLike): string | null => {
  if (date == null) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date.toISOString();
  if (DateTime.isDateTime(date)) return date.toISO();
  return date.isValid() ? date.toISOString() : null;
};

type SourceTransaction = {
  KID?: string | number | null;
  amount: number;
  date?: DateLike;
  transactionID: string;
  paymentID?: number;
  paymentMethod?: number;
  message?: string | null;
  name?: string | null;
  donorName?: string | null;
  location?: string | null;
};

type SourceInvalidTransaction = { reason: string | undefined; transaction: SourceTransaction };

const toReviewItem = ({ reason, transaction: t }: SourceInvalidTransaction): ManualReviewItem => ({
  reason: reason ?? "Unknown error",
  transaction: {
    KID: t.KID == null ? null : String(t.KID),
    amount: t.amount,
    date: toIso(t.date),
    transactionID: t.transactionID,
    // OCR transactions carry the payment method as `paymentMethod`
    paymentID: (t.paymentID ?? t.paymentMethod)!,
    message: t.message ?? null,
    name: t.name ?? t.donorName ?? null,
    location: t.location ?? null,
  },
});

const toSummary = (result: {
  valid: number;
  invalid: number;
  invalidTransactions: SourceInvalidTransaction[];
}): ReportUploadSummary => ({
  valid: result.valid,
  invalid: result.invalid,
  invalidTransactions: result.invalidTransactions.map(toReviewItem),
});

const readText = async (file: File) => Buffer.from(await file.arrayBuffer()).toString("utf8");
const readBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());

//endregion

const uploadsRouter = router({
  /** Nets OCR file (AvtaleGiro and KID bank payments, NO) */
  ocr: adminProcedure.input(reportUploadInput).mutation(async ({ input }) => {
    const result = await processOcrReport(await readText(input.report), input.metaOwnerID);
    return { ...toSummary(result), ignored: result.ignored };
  }),

  /** Vipps settlement report (CSV) */
  vipps: adminProcedure
    .input(reportUploadInput)
    .mutation(async ({ input }) =>
      toSummary(await processVippsReport(await readBuffer(input.report), input.metaOwnerID)),
    ),

  /** Norwegian bank export of payments without KID (CSV) */
  bankNo: adminProcedure
    .input(reportUploadInput)
    .mutation(async ({ input }) =>
      toSummary(await processBankNoReport(await readText(input.report), input.metaOwnerID)),
    ),

  /** Swedish bank file (CAMT.053 XML or TotalIn). `dryRun` writes nothing. */
  bankSe: adminProcedure.input(bankSeUploadInput).mutation(async ({ input }) => {
    const result = await processBankSeReport(await readText(input.report), input.dryRun);
    return {
      ...toSummary(result),
      dryRun:
        result.dryRun === true
          ? {
              fileFormat: result.fileFormat,
              postingDate: result.postingDate ?? null,
              totalParsed: result.totalParsed,
              skippedSwish: result.skippedSwish,
              skippedDuplicate: result.skippedDuplicate,
              validTransactions: result.validTransactions.map((t) => ({
                KID: t.KID ?? null,
                amount: t.amount,
                transactionID: t.transactionID,
                name: t.donorName ?? null,
                date: toIso(t.date),
                message: t.message,
              })),
            }
          : null,
    };
  }),

  /**
   * Facebook payout report. Returns the campaigns that have no organization shares registered.
   * Registering shares and donations from Facebook reports is not implemented (see report).
   */
  facebook: adminProcedure
    .input(fileOnlyUploadInput)
    .mutation(async ({ input }) => processFacebookReport(await readBuffer(input.report))),

  /** Bankgirot AutoGiro file (SE): payments, mandates, e-mandates or rejected charges */
  autogiro: adminProcedure.input(fileOnlyUploadInput).mutation(async ({ input }) => {
    const result = await processAutogiroReport(await readBuffer(input.report));
    if (result.type === "payments") {
      return { ...toSummary(result), type: result.type };
    }
    return result;
  }),
});

const transactionsRouter = router({
  /** Donations confirmed in an inclusive date range, with their split per organization */
  range: adminProcedure.input(transactionRangeInput).mutation(async ({ input }) => {
    const donations = await DAO.donations.getFromRange(
      new Date(input.fromDate),
      new Date(input.toDate),
      // The DAO's untyped `= null` default makes TS infer `null` for this parameter
      (input.paymentMethodIDs ?? null) as null,
    );
    const file: FilePayload = {
      filename: `transactions_${input.fromDate}_${input.toDate}.json`,
      contentType: "application/json",
      content: JSON.stringify(donations),
    };
    return file;
  }),
});

const taxRouter = router({
  /** Swedish KU65 XML (Skatteverket) from a CSV of donation sums per personnummer */
  ku65: adminProcedure.input(ku65Input).mutation(async ({ input }) => {
    let xml: string;
    try {
      xml = buildKu65Report(await readText(input.report), input.year);
    } catch (ex) {
      throw new TRPCError({ code: "BAD_REQUEST", message: ex.message, cause: ex });
    }
    const file: FilePayload = {
      filename: `ku65_${input.year}.xml`,
      contentType: "application/xml",
      content: xml,
    };
    return file;
  }),
});

const logsRouter = router({
  list: adminProcedure.input(logsListInput).query(async ({ input }) => {
    const entries = await DAO.logging.getEntries(
      input.limit,
      input.page * input.limit,
      input.filter?.fileSearch ?? null,
    );
    return { rows: entries.results, pages: entries.pages };
  }),

  get: adminProcedure.input(idInput).query(async ({ input }) => {
    const entry = await DAO.logging.get(input.id);
    if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
    return entry;
  }),
});

const fundraisersRouter = router({
  list: adminProcedure.input(fundraisersListInput).query(({ input }) => {
    const { filter } = input;
    return DAO.fundraisers.getList(
      input.page,
      input.limit,
      filter
        ? {
            ...filter,
            registrationDate: filter.registrationDate && {
              from: filter.registrationDate.from
                ? new Date(filter.registrationDate.from)
                : undefined,
              to: filter.registrationDate.to ? new Date(filter.registrationDate.to) : undefined,
            },
          }
        : undefined,
      input.sort,
      true,
    );
  }),

  /** Fundraiser with owner, secret, totals and transactions (names only where shown publicly) */
  get: adminProcedure.input(idInput).query(async ({ input }) => {
    const fundraiser = await DAO.fundraisers.getFundraiserWithSecret(input.id);
    if (!fundraiser) throw new TRPCError({ code: "NOT_FOUND" });
    const details = await DAO.fundraisers.getFundraiserByID(input.id);
    return {
      ...fundraiser,
      totalSum: details?.totalSum ?? 0,
      donationCount: details?.donationCount ?? 0,
      transactions: details?.transactions ?? [],
    };
  }),

  /** Creates a fundraiser owned by a donor */
  create: adminProcedure.input(donorIdInput).mutation(async ({ input }) => {
    const donor = await DAO.donors.getByID(input.donorId);
    if (!donor) throw new TRPCError({ code: "BAD_REQUEST", message: "Donor not found" });
    const { id: fundraiserId } = await DAO.fundraisers.createFundraiser(input.donorId);
    const fundraiser = await DAO.fundraisers.getFundraiserWithSecret(fundraiserId);
    if (!fundraiser) throw new Error(`Created fundraiser ${fundraiserId} not found`);
    return fundraiser;
  }),
});

export const reportsRouter = router({
  uploads: uploadsRouter,
  transactions: transactionsRouter,
  tax: taxRouter,
  logs: logsRouter,
  fundraisers: fundraisersRouter,
});
