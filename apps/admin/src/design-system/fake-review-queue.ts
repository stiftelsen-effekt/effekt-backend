/**
 * The /design flow demo's review queue: fake items in a per-browser store, so the demo works
 * without the API. The real queue is server-side (reports.reviewQueue).
 */
import type { ReviewItem } from "@/features/review-queue/model";
import { createPersistentStore } from "@/lib/persistent-store";
import { NOW } from "./fake-data";

export const demoReviewQueue = createPersistentStore<ReviewItem[]>("design-review-queue", []);

/** Adds items, skipping ids already queued (like the server, which dedupes per transaction). */
export function addDemoItems(items: ReviewItem[]) {
  demoReviewQueue.set((current) => {
    const existing = new Set(current.map((item) => item.id));
    return [...current, ...items.filter((item) => !existing.has(item.id))];
  });
}

export function resolveDemoItem(
  id: number,
  outcome: { status: "registered"; donationId: number } | { status: "ignored"; note?: string },
) {
  demoReviewQueue.set((current) =>
    current.map((item) =>
      item.id === id
        ? {
            ...item,
            status: outcome.status,
            donationId: outcome.status === "registered" ? outcome.donationId : null,
            note: outcome.status === "ignored" ? (outcome.note ?? null) : null,
            resolvedBy: "you@gieffektivt.no",
            resolvedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
}

export function reopenDemoItem(id: number) {
  demoReviewQueue.set((current) =>
    current.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "open",
            resolvedBy: null,
            resolvedAt: null,
            note: null,
            donationId: null,
          }
        : item,
    ),
  );
}

export function useDemoOpenCount() {
  return demoReviewQueue.use().filter((item) => item.status === "open").length;
}
