import { describe, expect, it } from "vitest";
import { greeting, lastMonths, monthlyByOrganization, monthSum } from "./model";

describe("lastMonths", () => {
  it("returns 12 months oldest first, the current one ending today", () => {
    const months = lastMonths(new Date(2026, 9, 27));
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({
      key: "2025-11",
      fromDate: "2025-11-01",
      toDate: "2025-11-30",
    });
    expect(months.at(-1)).toMatchObject({
      key: "2026-10",
      year: 2026,
      month: 10,
      fromDate: "2026-10-01",
      toDate: "2026-10-27",
    });
  });

  it("handles February in a leap year", () => {
    const feb = lastMonths(new Date(2028, 2, 5)).at(-2)!;
    expect(feb.toDate).toBe("2028-02-29");
  });
});

describe("monthSum", () => {
  it("is exact and zero when the month has no row", () => {
    const rows = [
      { year: 2026, month: 10, sum: "0.10" },
      { year: 2026, month: 10, sum: "0.20" },
      { year: 2026, month: 9, sum: "5" },
    ];
    expect(monthSum(rows, 2026, 10)).toBe("0.30");
    expect(monthSum(rows, 2026, 8)).toBe("0.00");
    expect(monthSum(undefined, 2026, 8)).toBe("0.00");
  });
});

describe("monthlyByOrganization", () => {
  const months = lastMonths(new Date(2026, 9, 27), 2);

  it("stacks by organization, largest first, with exact monthly sums", () => {
    const { series, rows } = monthlyByOrganization(months, [
      [
        { id: 11, orgName: "AMF", chartColor: null, sum: "100.10" },
        { id: 11, orgName: "AMF", chartColor: null, sum: "0.20" },
        { id: 12, orgName: "GiveDirectly", chartColor: null, sum: "40" },
      ],
      [{ id: 21, orgName: "The Humane League", chartColor: null, sum: "50" }],
    ]);
    expect(series.map((s) => [s.key, s.label])).toEqual([
      ["org11", "AMF"],
      ["org21", "The Humane League"],
      ["org12", "GiveDirectly"],
    ]);
    expect(series.every((s) => s.color)).toBe(true);
    expect(rows).toEqual([
      { month: "2026-09", org11: 100.3, org21: 0, org12: 40 },
      { month: "2026-10", org11: 0, org21: 50, org12: 0 },
    ]);
  });

  it("groups the long tail as Other beyond the series limit", () => {
    const { series, rows } = monthlyByOrganization(
      months,
      [
        [1, 2, 3, 4, 5, 6, 7].map((id) => ({
          id,
          orgName: `Org ${id}`,
          chartColor: null,
          sum: String(id * 100),
        })),
        [{ id: 1, orgName: "Org 1", chartColor: null, sum: "7" }],
      ],
      6,
    );
    expect(series.map((s) => s.key)).toEqual(["org7", "org6", "org5", "org4", "org3", "other"]);
    expect(series.at(-1)).toMatchObject({ label: "Other", color: "chart-5" });
    expect(rows[0]!.other).toBe(300); // orgs 1 and 2
    expect(rows[1]!.other).toBe(7);
  });

  it("returns no series when there were no donations", () => {
    expect(monthlyByOrganization(months, [[], []]).series).toEqual([]);
  });
});

describe("greeting", () => {
  it("greets by first name when there is one", () => {
    expect(greeting("Kari", new Date(2026, 0, 1, 8))).toBe("Good morning, Kari");
    expect(greeting(undefined, new Date(2026, 0, 1, 12))).toBe("Hello");
    expect(greeting("Ola", new Date(2026, 0, 1, 19))).toBe("Good evening, Ola");
  });
});

describe("monthTick", () => {
  it("shows the year on January only", async () => {
    const { monthTick } = await import("./model");
    expect(monthTick("2026-10")).toBe("Oct");
    expect(monthTick("2026-01")).toBe("Jan 2026");
  });
});
