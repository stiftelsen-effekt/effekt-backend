import { describe, expect, it } from "vitest";
import { greeting, lastMonths, monthlyByCauseArea, monthSum } from "./model";

const area = (id: number, name: string, ordering: number, orgIds: number[]) =>
  ({
    id,
    name,
    ordering,
    isActive: true,
    standardPercentageShare: 0,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    organizations: orgIds.map((orgId) => ({ id: orgId })),
  }) as never;

describe("lastMonths", () => {
  it("returns 12 months oldest first, the current one ending today", () => {
    const months = lastMonths(new Date(2026, 9, 27));
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ key: "2025-11", fromDate: "2025-11-01", toDate: "2025-11-30" });
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

describe("monthlyByCauseArea", () => {
  const months = lastMonths(new Date(2026, 9, 27), 2);

  it("sums organizations into their cause areas, in cause area order", () => {
    const areas = [area(2, "Animals", 2, [21]), area(1, "Health", 1, [11, 12])];
    const { series, rows } = monthlyByCauseArea(
      months,
      [
        [{ id: 11, orgName: "A", sum: "100.10" }, { id: 12, orgName: "B", sum: "0.20" }],
        [{ id: 21, orgName: "C", sum: "50" }],
      ],
      areas,
    );
    expect(series).toEqual([
      { key: "area-1", label: "Health" },
      { key: "area-2", label: "Animals" },
    ]);
    expect(rows).toEqual([
      { month: "2026-09", "area-1": 100.3, "area-2": 0 },
      { month: "2026-10", "area-1": 0, "area-2": 50 },
    ]);
  });

  it("puts unknown organizations in Other and folds the smallest areas beyond five series", () => {
    const areas = [1, 2, 3, 4, 5, 6].map((id) => area(id, `Area ${id}`, id, [id * 10]));
    const { series, rows } = monthlyByCauseArea(
      months,
      [
        [1, 2, 3, 4, 5, 6].map((id) => ({ id: id * 10, orgName: "", sum: String(id * 100) })),
        [{ id: 999, orgName: "Gone", sum: "7" }],
      ],
      areas,
    );
    expect(series.map((s) => s.key)).toEqual(["area-3", "area-4", "area-5", "area-6", "other"]);
    expect(rows[0]!.other).toBe(300); // areas 1 and 2
    expect(rows[1]!.other).toBe(7);
  });

  it("returns no series when there were no donations", () => {
    expect(monthlyByCauseArea(months, [[], []], [area(1, "Health", 1, [11])]).series).toEqual([]);
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
