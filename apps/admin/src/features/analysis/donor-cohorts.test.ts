import { describe, expect, it } from "vitest";
import {
  cohortIntensity,
  cohortScale,
  heatBackground,
  newDonorRows,
  sourceSeries,
  type Cohort,
  type NewDonors,
} from "./donor-cohorts";

const newDonors: NewDonors = {
  months: [
    { month: "2026-09", donors: 5, volume: "1500.50", bySource: { "ref-1": 2, other: 3 } },
    { month: "2026-10", donors: 1, volume: "0.00", bySource: { "ref-1": 0, other: 1 } },
  ],
  sources: [
    { key: "ref-1", label: "Bekjent" },
    { key: "other", label: "Other / unknown" },
  ],
  partialMonth: "2026-10",
};

const cohort = (year: number, cells: [number, number, string][]): Cohort => ({
  year,
  size: cells[0]![1],
  firstYearVolume: cells[0]![2],
  cells: cells.map(([y, donors, volume]) => ({
    year: y,
    donors,
    share: donors / cells[0]![1],
    volume,
  })),
});

describe("new donors", () => {
  it("spreads sources into chart columns, volume as a number", () => {
    expect(newDonorRows(newDonors)[0]).toEqual({
      month: "2026-09",
      donors: 5,
      volume: 1500.5,
      "ref-1": 2,
      other: 3,
    });
  });

  it("colours named sources in order and Other / unknown light grey", () => {
    expect(sourceSeries(newDonors).map((s) => s.color)).toEqual(["chart-1", "chart-5"]);
  });
});

describe("cohort heatmap", () => {
  const cohorts = [
    cohort(2024, [
      [2024, 100, "9000"],
      [2025, 40, "2000"],
      [2026, 20, "500"],
    ]),
    cohort(2025, [
      [2025, 50, "4000"],
      [2026, 10, "1000"],
    ]),
  ];

  it("scales to the largest later year, never the first", () => {
    expect(cohortScale(cohorts, "donors")).toBe(0.4);
    expect(cohortScale(cohorts, "volume")).toBe(2000);
  });

  it("leaves the first year uncoloured and maps later years to 0–1", () => {
    const [c2024] = cohorts;
    expect(cohortIntensity(c2024!, c2024!.cells[0]!, "donors", 0.4)).toBe(0);
    expect(cohortIntensity(c2024!, c2024!.cells[1]!, "donors", 0.4)).toBe(1);
    expect(cohortIntensity(c2024!, c2024!.cells[2]!, "volume", 2000)).toBe(0.25);
    expect(cohortIntensity(c2024!, c2024!.cells[2]!, "volume", 0)).toBe(0);
  });

  it("mixes chart-4 into the surface, nothing for zero", () => {
    expect(heatBackground(0)).toBeUndefined();
    expect(heatBackground(0.5)).toBe(
      "color-mix(in oklab, var(--chart-4) calc(var(--heat-max) * 0.500), var(--surface))",
    );
  });
});
