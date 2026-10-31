import { describe, expect, it } from "vitest";
import { meanFromTrackClick } from "./meanFromTrackClick";

const rect = { left: 100, width: 200 };

describe("meanFromTrackClick", () => {
  it("moves the mean to the clicked position and keeps the stdv", () => {
    expect(meanFromTrackClick(150, rect, 0, 8, { mean: 4, stdv: 1 })).toEqual({ mean: 2, stdv: 1 });
    expect(meanFromTrackClick(250, rect, 2, 10, { mean: 4, stdv: 1.5 })).toEqual({
      mean: 8,
      stdv: 1.5,
    });
  });

  it("clamps clicks outside the track", () => {
    expect(meanFromTrackClick(50, rect, 0, 8, { mean: 4, stdv: 1 }).mean).toBe(0);
    expect(meanFromTrackClick(400, rect, 0, 8, { mean: 4, stdv: 1 }).mean).toBe(8);
  });

  it("keeps the value when the track has no width", () => {
    const value = { mean: 4, stdv: 1 };
    expect(meanFromTrackClick(150, { left: 0, width: 0 }, 0, 8, value)).toBe(value);
  });
});
