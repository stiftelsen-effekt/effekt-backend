import { describe, expect, it } from "vitest";
import {
  applyPatches,
  byOrdering,
  changedFields,
  move,
  pendingChanges,
  shareProblems,
} from "./drafts";

const items = [
  { id: 1, ordering: 2, name: "B" },
  { id: 2, ordering: 1, name: "A" },
  { id: 3, ordering: null, name: "C" },
];

describe("drafts", () => {
  it("orders by ordering, unordered last", () => {
    expect(byOrdering(items).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("applies patches and reports only real changes", () => {
    const patches = { 1: { name: "B" }, 2: { name: "AA" } };
    expect(applyPatches(items, patches).map((i) => i.name)).toEqual(["B", "AA", "C"]);
    expect(changedFields(items[0]!, patches[1])).toEqual({});
    expect(pendingChanges(items, patches)).toEqual([{ id: 2, changes: { name: "AA" } }]);
  });

  it("moves an item and renumbers the list", () => {
    const ordered = byOrdering(items);
    expect(move(ordered, 3, -1)).toEqual({
      2: { ordering: 1 },
      3: { ordering: 2 },
      1: { ordering: 3 },
    });
    expect(move(ordered, 2, -1)).toEqual({});
  });
});

describe("shareProblems", () => {
  const org = (standardShare: number, isActive = true) => ({ standardShare, isActive });

  it("accepts a split that adds up", () => {
    expect(
      shareProblems([
        {
          name: "Health",
          isActive: true,
          standardPercentageShare: 90,
          organizations: [org(60), org(40)],
        },
        { name: "Climate", isActive: true, standardPercentageShare: 10, organizations: [org(100)] },
        { name: "Old", isActive: false, standardPercentageShare: 50, organizations: [] },
      ]),
    ).toEqual([]);
  });

  it("ignores inactive organizations and names each problem", () => {
    expect(
      shareProblems([
        {
          name: "Health",
          isActive: true,
          standardPercentageShare: 80,
          organizations: [org(60), org(40, false)],
        },
        {
          name: "Empty",
          isActive: true,
          standardPercentageShare: 10,
          organizations: [org(100, false)],
        },
      ]),
    ).toEqual([
      "Active cause areas add up to 90 %",
      "Health: organizations add up to 60 %",
      "Empty has no active organizations",
    ]);
  });
});
