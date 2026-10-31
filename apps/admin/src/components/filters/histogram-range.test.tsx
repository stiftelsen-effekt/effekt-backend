import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { edgeIndex, HistogramRange, type HistogramBin } from "./histogram-range";

const bins = (edges: number[]): HistogramBin[] =>
  edges.slice(0, -1).map((from, index) => ({ from, to: edges[index + 1]!, count: 1 }));

const thumbs = () =>
  screen.getAllByRole("slider").map((thumb) => thumb.getAttribute("aria-valuenow"));

describe("edgeIndex", () => {
  it("finds the first edge at or above the amount", () => {
    expect(edgeIndex([0, 100, 200, 300], 150, 0)).toBe(2);
    expect(edgeIndex([0, 100, 200, 300], 100, 0)).toBe(1);
    expect(edgeIndex([0, 100, 200, 300], 999, 0)).toBe(3);
    expect(edgeIndex([0, 100, 200, 300], undefined, 3)).toBe(3);
  });
});

describe("HistogramRange", () => {
  it("moves the thumbs when the bin edges change but their count does not", () => {
    const value = { min: 200, max: undefined };
    const props = { label: "Amount", value, onChange: () => {} };
    const { rerender } = render(<HistogramRange {...props} bins={bins([0, 100, 200, 300])} />);
    expect(thumbs()).toEqual(["2", "3"]);

    rerender(<HistogramRange {...props} bins={bins([0, 500, 1000, 1500])} />);
    expect(thumbs()).toEqual(["1", "3"]);
  });

  it("follows outside changes to the value", () => {
    const props = { label: "Amount", bins: bins([0, 100, 200, 300]), onChange: () => {} };
    const { rerender } = render(<HistogramRange {...props} value={{}} />);
    expect(thumbs()).toEqual(["0", "3"]);

    rerender(<HistogramRange {...props} value={{ min: 100, max: 200 }} />);
    expect(thumbs()).toEqual(["1", "2"]);
  });
});
