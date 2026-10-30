import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDayText,
  osloDay,
  osloDayEnd,
  osloDayStart,
  osloInstant,
  parseDayText,
} from "./dates";

describe("Oslo days", () => {
  it("starts and ends a day in Oslo time, across DST", () => {
    expect(osloDayStart("2024-10-01")).toBe("2024-09-30T22:00:00.000Z");
    expect(osloDayEnd("2024-10-31")).toBe("2024-10-31T22:59:59.999Z");
    expect(osloDayStart("2025-01-01")).toBe("2024-12-31T23:00:00.000Z");
    expect(osloInstant("2024-03-31", "03:30")?.toISOString()).toBe("2024-03-31T01:30:00.000Z");
  });

  it("reads an instant's Oslo day", () => {
    expect(osloDay(new Date("2024-12-31T23:30:00Z"))).toBe("2025-01-01");
    expect(osloDay(new Date("2024-12-31T22:59:00Z"))).toBe("2024-12-31");
  });

  it("rejects impossible dates and times", () => {
    expect(osloInstant("2024-02-30")).toBeNull();
    expect(osloInstant("2024-02-01", "24:00")).toBeNull();
  });

  it("adds calendar days", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
});

describe("typed dates", () => {
  it("reads Norwegian day-first dates", () => {
    expect(parseDayText("24.10.2026")).toBe("2026-10-24");
    expect(parseDayText("1.2.2024")).toBe("2024-02-01");
    expect(parseDayText("24.10.26")).toBe("2026-10-24");
    expect(parseDayText("24/10/2026")).toBe("2026-10-24");
    expect(parseDayText("24102026")).toBe("2026-10-24");
    expect(parseDayText("2026-10-24")).toBe("2026-10-24");
  });

  it("rejects what isn't a date", () => {
    expect(parseDayText("31.02.2024")).toBeNull();
    expect(parseDayText("10/24/2026")).toBeNull();
    expect(parseDayText("soon")).toBeNull();
    expect(parseDayText("")).toBeNull();
  });

  it("writes days as dd.mm.yyyy", () => {
    expect(formatDayText("2026-10-24")).toBe("24.10.2026");
    expect(formatDayText(undefined)).toBe("");
  });
});
