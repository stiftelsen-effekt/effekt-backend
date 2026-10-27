/**
 * Importing payment reports and the shared review queue (reports.uploads, reports.reviewQueue):
 * the sources people can import, what an upload result means, and an item → registration form.
 */
import { emptyDraft, type CauseAreaConfig } from "@/features/distribution/model";
import { toDateTimeInputs } from "@/features/donations/form";
import { formatMoneyInput } from "@/lib/format";
import {
  emptyRegisterDraft,
  registerInput,
  type RegisterDraft,
} from "@/features/donations/register-model";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type ReviewItem = RouterOutputs["reports"]["reviewQueue"]["list"]["rows"][number];
export type ReviewItemWithRaw = RouterOutputs["reports"]["reviewQueue"]["get"];
export type ReviewStatus = ReviewItem["status"];
export type ReviewSource = ReviewItem["source"];
export type ReviewRegisterInput = RouterInputs["reports"]["reviewQueue"]["register"];

/** Report types the import flow offers (Norway). */
export const importSources = ["ocr", "vipps", "bankNo", "facebook"] as const;
export type ImportSource = (typeof importSources)[number];

export const reviewStatuses = ["open", "registered", "ignored"] as const satisfies ReviewStatus[];

/** Sources that put transactions in the review queue (Facebook reports don't). */
export const queueSources = ["ocr", "vipps", "bankNo"] as const satisfies ReviewSource[];

const sourceLabels: Record<string, string> = {
  ocr: "Bank OCR",
  vipps: "Vipps",
  bankNo: "Bank account",
  facebook: "Facebook",
};

/** A parser's reason without its machine code ("NO_KID | KID 1 does not exist" → "KID 1 …"). */
export const reasonText = (reason: string) => reason.replace(/^[A-Z_]+ \| /, "");

/** Short name of a report source; unknown sources show as stored. */
export const sourceLabel = (source: string) => sourceLabels[source] ?? source;

//region Upload results

export type UploadResult =
  | { source: "ocr"; result: RouterOutputs["reports"]["uploads"]["ocr"] }
  | { source: "vipps"; result: RouterOutputs["reports"]["uploads"]["vipps"] }
  | { source: "bankNo"; result: RouterOutputs["reports"]["uploads"]["bankNo"] }
  | { source: "facebook"; result: RouterOutputs["reports"]["uploads"]["facebook"] };

export type FacebookCampaign =
  RouterOutputs["reports"]["uploads"]["facebook"]["fbCampaigns"][number];

/** What an upload did, the same for every payment source. */
export type UploadSummary =
  | {
      kind: "payments";
      /** Donations registered */
      registered: number;
      /** Transactions not registered and not sent to review: duplicates already registered */
      ignored: number;
      /** Transactions that need a decision */
      review: number;
      /** What happened in the review queue (reports.uploads.* `queue`). Null for a dry run. */
      queue: UploadQueue | null;
      /** The upload's import log entry (reports.logs.get); null if none was written. */
      importLogId: number | null;
    }
  | { kind: "facebook"; campaigns: FacebookCampaign[] };

export type UploadQueue = NonNullable<RouterOutputs["reports"]["uploads"]["ocr"]["queue"]>;

export type QueueOutcome = {
  /** The file's transactions still waiting for a decision */
  open: number;
  /** Queued by an earlier upload and since registered or ignored */
  handled: number;
  /** New in the queue with this upload */
  added: number;
  /** Couldn't be queued at all (no usable amount, failed insert) */
  skipped: number;
};

/**
 * "N need a decision, M already handled" for an upload's review transactions. Without per-status
 * counts every queued transaction counts as open.
 */
export function queueOutcome(queue: UploadQueue): QueueOutcome {
  const statuses = queue.statuses;
  return {
    open: statuses ? statuses.open : queue.added + queue.existing,
    handled: statuses ? statuses.registered + statuses.ignored : 0,
    added: queue.added,
    skipped: queue.skipped,
  };
}

export function summariseUpload(upload: UploadResult): UploadSummary {
  if (upload.source === "facebook") {
    return { kind: "facebook", campaigns: upload.result.fbCampaigns };
  }
  const { result } = upload;
  const review = result.invalidTransactions.length;
  return {
    kind: "payments",
    registered: result.valid,
    // OCR counts duplicates separately; the other sources count them in `invalid`.
    ignored: upload.source === "ocr" ? upload.result.ignored : Math.max(0, result.invalid - review),
    review,
    queue: result.queue,
    importLogId: result.importLogId ?? null,
  };
}

/** The FormData body for reports.uploads.* */
export function uploadForm(file: File, ownerId: string) {
  const form = new FormData();
  form.append("report", file);
  if (ownerId) form.append("metaOwnerID", ownerId);
  return form;
}

//endregion

//region Registering an item

/** The registration form, prefilled from the transaction. */
export function draftForItem(
  item: Pick<ReviewItem, "KID" | "amount" | "date" | "paymentId" | "externalId">,
  config: CauseAreaConfig[],
  ownerId: string,
): RegisterDraft {
  const when = item.date ? toDateTimeInputs(item.date) : { date: "", time: "" };
  return emptyRegisterDraft({
    mode: item.KID ? "kid" : "distribution",
    KID: item.KID ?? "",
    distribution: emptyDraft(config),
    sum: formatMoneyInput(item.amount),
    date: when.date,
    time: when.time,
    paymentId: String(item.paymentId),
    externalRef: item.externalId ?? "",
    ownerId,
  });
}

/** reports.reviewQueue.register input. Assumes validateRegister passed. */
export function reviewRegisterInput(id: number, draft: RegisterDraft): ReviewRegisterInput {
  return { id, ...registerInput(draft) };
}

/** CONFLICT from the queue itself (someone resolved the item first), not from the donation. */
export const isResolvedElsewhere = (message: string) => /^Review item \d+ /.test(message);

/**
 * The open item to go to after `currentId`: the next one in `openIds` (ascending), wrapping
 * around to the first. Null when nothing else is open.
 */
export function nextOpenId(openIds: readonly number[], currentId: number): number | null {
  const others = openIds.filter((id) => id !== currentId);
  return others.find((id) => id > currentId) ?? others[0] ?? null;
}

/** The open item before `currentId`, wrapping around to the last. */
export function previousOpenId(openIds: readonly number[], currentId: number): number | null {
  const others = openIds.filter((id) => id !== currentId);
  return [...others].reverse().find((id) => id < currentId) ?? others.at(-1) ?? null;
}

//endregion

/**
 * Who resolved an item, for people. The API records the admin's email or, for identities
 * without one, the token subject. The signed-in admin is shown by name; others by email,
 * or the id when that's all there is.
 */
export function resolverName(
  resolvedBy: string | null | undefined,
  user: { id: string; name?: string; email?: string } | null,
): string {
  if (!resolvedBy) return "someone";
  const isUser = user && (resolvedBy === user.id || (user.email && resolvedBy === user.email));
  if (isUser) return user.name ? `you (${user.name})` : "you";
  return resolvedBy;
}
