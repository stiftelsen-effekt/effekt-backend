import { describe, expect, it } from "vitest";
import { openReviewCount } from "./review-queue-counts";

describe("openReviewCount", () => {
  it("reads a number, { open } or { total }", () => {
    expect(openReviewCount(4)).toBe(4);
    expect(openReviewCount({ open: 3, skipped: 1 })).toBe(3);
    expect(openReviewCount({ total: 2 })).toBe(2);
    expect(openReviewCount({ other: 1 })).toBeUndefined();
    expect(openReviewCount(null)).toBeUndefined();
  });
});
