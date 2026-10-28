import { describe, expect, it } from "vitest";
import {
  MAX_PANELS,
  matchPanelPath,
  panelPath,
  parsePanels,
  serializePanels,
  validatePanelSearch,
  type PanelKind,
} from "./stack";

const kinds: PanelKind[] = [
  { kind: "donor", path: "/donors/$id", label: ([id]) => `Donor #${id}` },
  { kind: "donation", path: "/donations/$id/", label: ([id]) => `Donation #${id}` },
  { kind: "agreement", path: "/agreements/$provider/$id", label: ([, id]) => `Agreement ${id}` },
  { kind: "demo", path: "/design/detail", label: () => "Demo" },
];

describe("panel stack ↔ search param", () => {
  it("round-trips a stack", () => {
    const stack = [
      { kind: "donor", params: ["12"] },
      { kind: "donation", params: ["345"] },
      { kind: "agreement", params: ["vipps", "agr_X1"] },
      { kind: "demo", params: [] },
    ];
    const raw = serializePanels(stack);
    expect(raw).toBe("donor:12,donation:345,agreement:vipps:agr_X1,demo");
    expect(parsePanels(raw, kinds)).toEqual(stack);
  });

  it("encodes separators inside ids", () => {
    const stack = [{ kind: "agreement", params: ["vipps", "a:b,c"] }];
    const raw = serializePanels(stack)!;
    expect(raw).toBe("agreement:vipps:a%3Ab%2Cc");
    expect(parsePanels(raw, kinds)).toEqual(stack);
  });

  it("is empty for no panels", () => {
    expect(serializePanels([])).toBeUndefined();
    expect(parsePanels(undefined, kinds)).toEqual([]);
    expect(parsePanels("", kinds)).toEqual([]);
  });

  it("drops unknown kinds, wrong param counts, empty and malformed values", () => {
    expect(
      parsePanels("nope:1,donor,donor:1:2,donor:,donor:%E0%A4%A,donor:7,agreement:vipps", kinds),
    ).toEqual([{ kind: "donor", params: ["7"] }]);
    expect(validatePanelSearch({ panel: "nope:1,donor:7", q: "x" }, kinds)).toEqual({
      panel: "donor:7",
    });
    expect(validatePanelSearch({ panel: { donor: 1 } }, kinds)).toEqual({});
    expect(validatePanelSearch({}, kinds)).toEqual({});
  });

  it("accepts a number-parsed param and caps the depth", () => {
    expect(parsePanels(5, [{ kind: "5", path: "/x", label: () => "" }])).toEqual([
      { kind: "5", params: [] },
    ]);
    const many = Array.from({ length: MAX_PANELS + 3 }, (_, i) => `donor:${i}`).join(",");
    const parsed = parsePanels(many, kinds);
    expect(parsed).toHaveLength(MAX_PANELS);
    expect(parsed.at(-1)).toEqual({ kind: "donor", params: [String(MAX_PANELS + 2)] });
  });
});

describe("panel ↔ path", () => {
  it("builds the record's page", () => {
    expect(panelPath({ kind: "donor", params: ["12"] }, kinds)).toBe("/donors/12");
    expect(panelPath({ kind: "donation", params: ["3"] }, kinds)).toBe("/donations/3/");
    expect(panelPath({ kind: "agreement", params: ["vipps", "a b"] }, kinds)).toBe(
      "/agreements/vipps/a%20b",
    );
  });

  it("matches a path to a kind", () => {
    expect(matchPanelPath("/donors/12", kinds)).toEqual({ kind: "donor", params: ["12"] });
    expect(matchPanelPath("/donations/3", kinds)).toEqual({ kind: "donation", params: ["3"] });
    expect(matchPanelPath("/donations/3/", kinds)).toEqual({ kind: "donation", params: ["3"] });
    expect(matchPanelPath("/agreements/vipps/a%20b", kinds)).toEqual({
      kind: "agreement",
      params: ["vipps", "a b"],
    });
    expect(matchPanelPath("/design/detail", kinds)).toEqual({ kind: "demo", params: [] });
    expect(matchPanelPath("/donations/3/edit", kinds)).toBeNull();
    expect(matchPanelPath("/donors", kinds)).toBeNull();
    expect(matchPanelPath("/charges", kinds)).toBeNull();
  });
});
