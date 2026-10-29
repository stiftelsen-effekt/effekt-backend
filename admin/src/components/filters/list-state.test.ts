import { describe, expect, it } from "vitest";
import { defineList, param, sortParam } from "./list-state";

describe("list param codecs", () => {
  it("round-trips ranges, including open ends", () => {
    expect(param.range.encode({ min: 100, max: 500 })).toBe("100..500");
    expect(param.range.encode({ min: 100 })).toBe("100..");
    expect(param.range.decode("..500")).toEqual({ min: undefined, max: 500 });
    expect(param.range.decode("garbage")).toBeUndefined();
  });

  it("round-trips date ranges and rejects malformed dates", () => {
    expect(param.dateRange.decode("2026-01-01..2026-03-31")).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(param.dateRange.decode("2026-1-1..")).toBeUndefined();
  });

  it("accepts values the router already parsed as JSON", () => {
    expect(param.numberList.decode(4)).toEqual([4]);
    expect(param.numberList.decode("4,8")).toEqual([4, 8]);
    expect(param.text.decode(1387)).toBe("1387");
    expect(param.text.decode(true)).toBe("true");
    expect(param.boolean.decode(false)).toBe(false);
  });

  it("limits lists to allowed values", () => {
    const status = param.list(["active", "stopped"] as const);
    expect(status.decode("active,bogus,stopped")).toEqual(["active", "stopped"]);
    expect(status.encode([])).toBeUndefined();
  });

  it("keeps only known keys in validateSearch", () => {
    const list = defineList({
      id: "t",
      filters: { q: param.text },
      sortable: ["id"],
      defaultSort: { id: "id", desc: true },
    });
    expect(list.validateSearch({ q: "kari", page: 2, junk: "x", sort: "-id" })).toEqual({
      q: "kari",
      page: 2,
      sort: "-id",
    });
  });
});

describe("sortParam", () => {
  const byDateDesc = { id: "timestamp", desc: true };

  it("omits the default sort from the URL", () => {
    expect(
      sortParam([{ id: "timestamp", desc: true }], { id: "timestamp", desc: false }, byDateDesc),
    ).toBeUndefined();
    expect(sortParam([], { id: "sum", desc: true }, byDateDesc)).toBeUndefined();
  });

  it("encodes other sorts", () => {
    expect(sortParam([{ id: "sum", desc: true }], byDateDesc, byDateDesc)).toBe("-sum");
    expect(sortParam([{ id: "timestamp", desc: false }], byDateDesc, byDateDesc)).toBe("timestamp");
  });

  it("flips the default column when the toggle would clear it", () => {
    // TanStack clears a column whose sort isn't its first direction; clearing the default
    // would leave it as it is, so the click flips it instead.
    expect(sortParam([], byDateDesc, byDateDesc)).toBe("timestamp");
    expect(sortParam([], { id: "id", desc: false }, { id: "id", desc: false })).toBe("-id");
  });

  it("toggles the default column both ways", () => {
    let current = byDateDesc;
    const decode = (raw: string | undefined) =>
      raw ? { id: raw.replace(/^-/, ""), desc: raw.startsWith("-") } : byDateDesc;
    // Whatever TanStack proposes (flip or clear), each click lands on the other direction.
    for (const proposal of [
      [],
      [{ id: "timestamp", desc: true }],
      [],
      [{ id: "timestamp", desc: true }],
    ]) {
      const before = current.desc;
      current = decode(sortParam(proposal, current, byDateDesc));
      expect(current).toEqual({ id: "timestamp", desc: !before });
    }
  });
});
