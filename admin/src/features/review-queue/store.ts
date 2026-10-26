/**
 * The manual review queue: transactions from imported payment reports that could not be
 * registered automatically. The API returns them once, in the upload response, so the
 * admin keeps them in a persistent store (survives reloads and closing the tab).
 * Open question for the product owner: move this to the server so the team shares one queue.
 */
import type { RouterOutputs } from "@/lib/trpc";
import { createPersistentStore } from "@/lib/persistent-store";

export type ManualReviewItem =
  RouterOutputs["reports"]["uploads"]["ocr"]["invalidTransactions"][number];

export type ImportSource = "ocr" | "vipps" | "bankNo" | "facebook" | "bankSe" | "autogiro";

export type ReviewEntry = ManualReviewItem & {
  /** Stable key: source + transaction id. Re-uploading a file does not duplicate entries. */
  key: string;
  source: ImportSource;
  importedAt: string;
  fileName: string;
  state: "open" | "registered" | "skipped";
  resolvedAt?: string;
  donationId?: number;
};

export const reviewQueue = createPersistentStore<ReviewEntry[]>("review-queue", []);

export function addToReviewQueue(
  items: ManualReviewItem[],
  meta: { source: ImportSource; fileName: string; importedAt?: string },
) {
  const importedAt = meta.importedAt ?? new Date().toISOString();
  reviewQueue.set((current) => {
    const existing = new Set(current.map((entry) => entry.key));
    const added = items
      .map<ReviewEntry>((item) => ({
        ...item,
        key: `${meta.source}:${item.transaction.transactionID}`,
        source: meta.source,
        importedAt,
        fileName: meta.fileName,
        state: "open",
      }))
      .filter((entry) => !existing.has(entry.key));
    return [...current, ...added];
  });
}

export function resolveReviewEntry(
  key: string,
  outcome: { state: "registered"; donationId: number } | { state: "skipped" },
) {
  reviewQueue.set((current) =>
    current.map((entry) =>
      entry.key === key ? { ...entry, ...outcome, resolvedAt: new Date().toISOString() } : entry,
    ),
  );
}

export function reopenReviewEntry(key: string) {
  reviewQueue.set((current) =>
    current.map((entry) =>
      entry.key === key
        ? { ...entry, state: "open", resolvedAt: undefined, donationId: undefined }
        : entry,
    ),
  );
}

export function useOpenReviewCount() {
  return reviewQueue.use().filter((entry) => entry.state === "open").length;
}
