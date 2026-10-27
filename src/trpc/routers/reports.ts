import { TRPCError } from "@trpc/server";
import type { JWTPayload } from "express-oauth2-jwt-bearer";
import { DAO } from "../../custom_modules/DAO";
import { buildKu65Report } from "../../custom_modules/ku65";
import {
  processAutogiroReport,
  processBankNoReport,
  processBankSeReport,
  processFacebookReport,
  processOcrReport,
  processVippsReport,
  ReportParseError,
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
  reviewQueueIgnoreInput,
  reviewQueueListInput,
  reviewQueueRegisterInput,
  transactionRangeInput,
} from "../schemas/reports";
import { adminProcedure, router } from "../trpc";
import type {
  ReviewQueueItemWithRaw,
  ReviewQueueSource,
} from "../../custom_modules/DAO_modules/reviewqueue";
import { registerDonation } from "../donationRegistration";
import { moneySchema } from "../schemas/common";
import { paymentExternalRefSchema } from "../schemas/donations";
import {
  enqueueInvalidTransactions,
  toIso,
  toReviewItem,
  type EnqueueResult,
  type ManualReviewItem,
  type SourceInvalidTransaction,
} from "../../custom_modules/reviewQueue";

//region Types

export type { ManualReviewItem, ManualReviewTransaction } from "../../custom_modules/reviewQueue";

export type ReportUploadSummary = {
  /** Donations registered */
  valid: number;
  /** Transactions not registered, including ignored duplicates where the source counts them */
  invalid: number;
  /** Transactions that need manual review */
  invalidTransactions: ManualReviewItem[];
  /**
   * What happened to `invalidTransactions` in the review queue (reports.reviewQueue). Null when
   * nothing was queued: a dry run, or writing to the queue failed (the upload itself succeeded).
   */
  queue: EnqueueResult | null;
  /**
   * The import log entry of the upload (reports.logs.get), which the queued items link to. Null
   * for a dry run, or if writing the log failed (the upload itself succeeded).
   */
  importLogId: number | null;
};

/** A file to download. `content` is text for text content types, base64 otherwise. */
export type FilePayload = {
  filename: string;
  contentType: string;
  content: string;
};

/** Import_logs labels of the uploads that write their own log entry (AutoGiro's module logs) */
export const uploadLogLabels = {
  ocr: "OCR - Upload",
  vipps: "Vipps - Upload",
  bankNo: "Bank NO - Upload",
  bankSe: "Bank SE - Upload",
} as const satisfies Partial<Record<ReviewQueueSource, string>>;

type UploadContext = {
  /** The uploaded file's name */
  filename: string;
  /** The file content as stored in the log (`file`), searchable with logs.list fileSearch */
  file: string;
  /** Null for the default owner */
  metaOwnerID: number | null;
  uploadedBy: string;
};

type ProcessResult = {
  valid: number;
  invalid: number;
  ignored?: number;
  invalidTransactions: SourceInvalidTransaction[];
};

/**
 * Writes the upload's Import_logs entry, like the scheduled OCR import does. Never throws: the
 * donations are already registered, so a failure is logged and the entry id reported as null.
 */
async function logUpload(
  source: keyof typeof uploadLogLabels,
  upload: UploadContext,
  result: ProcessResult,
): Promise<number | null> {
  try {
    return await DAO.logging.add(uploadLogLabels[source], {
      upload: {
        source,
        metaOwnerID: upload.metaOwnerID,
        uploadedBy: upload.uploadedBy,
      },
      donations: {
        valid: result.valid,
        invalid: result.invalid,
        ...(result.ignored !== undefined && { ignored: result.ignored }),
      },
      invalidTransactions: result.invalidTransactions.map((item) => toReviewItem(source, item)),
      filename: upload.filename,
      file: upload.file,
    });
  } catch (ex) {
    console.error(`Failed to write the import log of a ${source} upload`);
    console.error(ex);
    return null;
  }
}

/** Queues the invalid transactions, linked to the import log and the chosen data owner */
async function summarise(
  source: ReviewQueueSource,
  result: { valid: number; invalid: number; invalidTransactions: SourceInvalidTransaction[] },
  options: { dryRun?: boolean; importLogId?: number | null; metaOwnerID?: number | null } = {},
): Promise<ReportUploadSummary> {
  const importLogId = options.importLogId ?? null;
  return {
    valid: result.valid,
    invalid: result.invalid,
    invalidTransactions: result.invalidTransactions.map((item) => toReviewItem(source, item)),
    queue: options.dryRun
      ? null
      : await enqueueInvalidTransactions(
          source,
          result.invalidTransactions,
          importLogId,
          options.metaOwnerID ?? null,
        ),
    importLogId,
  };
}

/** Logs a (non dry run) upload, then queues its invalid transactions linked to the log entry */
async function logAndSummarise(
  source: keyof typeof uploadLogLabels,
  upload: UploadContext,
  result: ProcessResult,
): Promise<ReportUploadSummary> {
  const importLogId = await logUpload(source, upload, result);
  return summarise(source, result, { importLogId, metaOwnerID: upload.metaOwnerID });
}

const readText = async (file: File) => Buffer.from(await file.arrayBuffer()).toString("utf8");
const readBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());

/** Unreadable files (wrong type, malformed) are client errors; nothing has been written */
async function processFile<T>(process: () => Promise<T>): Promise<T> {
  try {
    return await process();
  } catch (ex) {
    if (ex instanceof ReportParseError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: ex.message, cause: ex });
    }
    throw ex;
  }
}

/** Checks an optional metaOwnerID against the data owners; null means the default owner */
async function checkedMetaOwner(metaOwnerID: number | undefined): Promise<number | null> {
  if (metaOwnerID === undefined) return null;
  const owners = await DAO.meta.getDataOwners();
  if (!owners.some((owner) => owner.id === metaOwnerID)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Data owner ${metaOwnerID} does not exist`,
    });
  }
  return metaOwnerID;
}

const uploadContext = (
  report: File,
  file: string,
  metaOwnerID: number | null,
  auth: JWTPayload,
): UploadContext => ({ filename: report.name, file, metaOwnerID, uploadedBy: adminIdentity(auth) });

/**
 * Who resolved a review item or uploaded a report: the token's email claim (plain or
 * namespaced, if the Auth0 tenant adds one), otherwise its subject.
 */
const adminIdentity = (auth: JWTPayload): string => {
  const emailClaim = Object.entries(auth).find(
    ([key, value]) => (key === "email" || key.endsWith("/email")) && typeof value === "string",
  );
  return (emailClaim?.[1] as string | undefined) ?? auth.sub ?? "unknown";
};

//endregion

/**
 * Each upload (except dry runs and Facebook, which register nothing) writes an Import_logs entry
 * labelled per source (see uploadLogLabels; AutoGiro payments use the entry its processing
 * writes) and returns its id as `importLogId`. Invalid transactions are queued for review linked
 * to that entry and with the chosen data owner, which reviewQueue.register defaults to.
 */
const uploadsRouter = router({
  /** Nets OCR file (AvtaleGiro and KID bank payments, NO) */
  ocr: adminProcedure.input(reportUploadInput).mutation(async ({ input, ctx }) => {
    const metaOwnerID = await checkedMetaOwner(input.metaOwnerID);
    const data = await readText(input.report);
    const result = await processFile(() => processOcrReport(data, metaOwnerID));
    const upload = uploadContext(input.report, data, metaOwnerID, ctx.auth);
    return { ...(await logAndSummarise("ocr", upload, result)), ignored: result.ignored };
  }),

  /** Vipps settlement report (CSV) */
  vipps: adminProcedure.input(reportUploadInput).mutation(async ({ input, ctx }) => {
    const metaOwnerID = await checkedMetaOwner(input.metaOwnerID);
    const data = await readBuffer(input.report);
    const result = await processFile(() => processVippsReport(data, metaOwnerID));
    const upload = uploadContext(input.report, data.toString("utf8"), metaOwnerID, ctx.auth);
    return logAndSummarise("vipps", upload, result);
  }),

  /** Norwegian bank export of payments without KID (CSV) */
  bankNo: adminProcedure.input(reportUploadInput).mutation(async ({ input, ctx }) => {
    const metaOwnerID = await checkedMetaOwner(input.metaOwnerID);
    const data = await readText(input.report);
    const result = await processFile(() => processBankNoReport(data, metaOwnerID));
    const upload = uploadContext(input.report, data, metaOwnerID, ctx.auth);
    return logAndSummarise("bankNo", upload, result);
  }),

  /** Swedish bank file (CAMT.053 XML or TotalIn). `dryRun` writes nothing, not even a log. */
  bankSe: adminProcedure.input(bankSeUploadInput).mutation(async ({ input, ctx }) => {
    const metaOwnerID = await checkedMetaOwner(input.metaOwnerID);
    const data = await readText(input.report);
    const result = await processFile(() => processBankSeReport(data, input.dryRun, metaOwnerID));
    const summary =
      result.dryRun === true
        ? await summarise("bankSe", result, { dryRun: true })
        : await logAndSummarise(
            "bankSe",
            uploadContext(input.report, data, metaOwnerID, ctx.auth),
            result,
          );
    return {
      ...summary,
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
   * No donations are registered, so `metaOwnerID` is only validated and nothing is logged.
   */
  facebook: adminProcedure.input(fileOnlyUploadInput).mutation(async ({ input }) => {
    await checkedMetaOwner(input.metaOwnerID);
    const data = await readBuffer(input.report);
    return processFile(() => processFacebookReport(data));
  }),

  /**
   * Bankgirot AutoGiro file (SE): payments, mandates, e-mandates or rejected charges.
   * `metaOwnerID` is validated and stored on queued review items, but the donations themselves
   * are registered under the default data owner (custom_modules/autogiro.ts doesn't take an
   * owner). AutoGiro processing writes its own log entries (without the file name); for payments
   * its id is returned as `importLogId`.
   */
  autogiro: adminProcedure.input(fileOnlyUploadInput).mutation(async ({ input }) => {
    const metaOwnerID = await checkedMetaOwner(input.metaOwnerID);
    const data = await readBuffer(input.report);
    const result = await processFile(() => processAutogiroReport(data));
    if (result.type === "payments") {
      // AutoGiro amounts are in öre; review items are in whole currency like other sources
      return {
        ...(await summarise("autogiro", result, {
          importLogId: result.importLogId,
          metaOwnerID,
        })),
        type: result.type,
      };
    }
    return result;
  }),
});

const transactionsRouter = router({
  /**
   * Donations confirmed in an inclusive date range, with their split per organization. The
   * client turns `rows` into a JSON or CSV download named `filename` (without extension).
   */
  range: adminProcedure.input(transactionRangeInput).mutation(async ({ input }) => {
    const rows = await DAO.donations.getFromRange(
      new Date(input.fromDate),
      new Date(input.toDate),
      input.paymentMethodIDs ?? null,
    );
    return { filename: `transactions_${input.fromDate}_${input.toDate}`, rows };
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

const getReviewItemOrThrow = async (id: number) => {
  const item = await DAO.reviewqueue.getById(id);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: `Review item ${id} not found` });
  return item;
};

const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message });

/** Throws CONFLICT for an item that isn't open; NOT_FOUND if it has disappeared */
const throwNotOpen = async (id: number): Promise<never> => {
  const item = await getReviewItemOrThrow(id);
  throw conflict(`Review item ${id} is already ${item.status}`);
};

/**
 * The shared queue of transactions from report imports that could not be registered
 * automatically. Uploads (REST and tRPC) and the scheduled OCR import add to it.
 */
const reviewQueueRouter = router({
  list: adminProcedure.input(reviewQueueListInput).query(({ input }) =>
    DAO.reviewqueue.getList({
      page: input.page,
      limit: input.limit,
      statuses: input.filter?.statuses,
      sources: input.filter?.sources,
      sort: input.sort ?? { id: "id", desc: true },
    }),
  ),

  /** Items per status, e.g. for a badge with the number of open items */
  counts: adminProcedure.query(() => DAO.reviewqueue.getCounts()),

  /** An item with the transaction as the parser produced it (`raw`) */
  get: adminProcedure
    .input(idInput)
    .query(({ input }): Promise<ReviewQueueItemWithRaw> => getReviewItemOrThrow(input.id)),

  /**
   * Registers a donation from an open item, the same way donations.register does, and marks the
   * item registered with the donation. CONFLICT if the item is already resolved.
   */
  register: adminProcedure.input(reviewQueueRegisterInput).mutation(async ({ input, ctx }) => {
    const item = await getReviewItemOrThrow(input.id);
    if (item.status !== "open") throw conflict(`Review item ${item.id} is already ${item.status}`);

    const sum = input.sum ?? Number(item.amount);
    if (!moneySchema.safeParse(sum).success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `The item's amount ${item.amount} can't be registered; provide a sum`,
      });
    }
    const timestamp = input.timestamp ?? item.date?.toISOString();
    if (timestamp === undefined) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The item has no date; provide one" });
    }
    const paymentExternalRef =
      input.paymentExternalRef !== undefined ? input.paymentExternalRef : item.externalId;
    if (
      paymentExternalRef !== null &&
      !paymentExternalRefSchema.safeParse(paymentExternalRef).success
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The item's external id is too long for a donation; provide paymentExternalRef",
      });
    }

    const metaOwnerId =
      input.metaOwnerId ?? item.metaOwnerId ?? (await DAO.meta.getDefaultOwnerID());

    // Claim the item first so two admins can't register it twice
    if (!(await DAO.reviewqueue.claimForRegistration(item.id, adminIdentity(ctx.auth)))) {
      await throwNotOpen(item.id);
    }

    let registered: Awaited<ReturnType<typeof registerDonation>>;
    try {
      registered = await registerDonation({
        KID: input.KID,
        distribution: input.distribution,
        sum,
        timestamp,
        paymentId: input.paymentId ?? item.paymentId,
        paymentExternalRef,
        metaOwnerId,
        sendReceipt: input.sendReceipt,
      });
    } catch (ex) {
      await DAO.reviewqueue.releaseRegistrationClaim(item.id);
      throw ex;
    }

    await DAO.reviewqueue.setDonation(item.id, registered.donationId);
    return { ...registered, item: await getReviewItemOrThrow(item.id) };
  }),

  /** Marks an open item as not needing a donation. CONFLICT if it is already resolved. */
  ignore: adminProcedure.input(reviewQueueIgnoreInput).mutation(async ({ input, ctx }) => {
    if (!(await DAO.reviewqueue.ignore(input.id, adminIdentity(ctx.auth), input.note ?? null))) {
      await throwNotOpen(input.id);
    }
    return getReviewItemOrThrow(input.id);
  }),

  /**
   * Reopens an ignored item, or a registered one whose donation has been deleted. CONFLICT for
   * open items and for registered items whose donation still exists.
   */
  reopen: adminProcedure.input(idInput).mutation(async ({ input }) => {
    if (!(await DAO.reviewqueue.reopen(input.id))) {
      const item = await getReviewItemOrThrow(input.id);
      throw conflict(
        item.status === "open"
          ? `Review item ${item.id} is already open`
          : `Review item ${item.id} has donation ${item.donationId}; delete the donation first`,
      );
    }
    return getReviewItemOrThrow(input.id);
  }),
});

export const reportsRouter = router({
  uploads: uploadsRouter,
  reviewQueue: reviewQueueRouter,
  transactions: transactionsRouter,
  tax: taxRouter,
  logs: logsRouter,
  fundraisers: fundraisersRouter,
});
