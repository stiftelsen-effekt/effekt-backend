import { describe, expect, it } from "vitest";
import {
  draftFromApi,
  draftToApi,
  fillRemaining,
  sameDistribution,
  setOrganizationShare,
  setShare,
  setStandardSplit,
  standardDraft,
  validateDraft,
  type CauseAreaConfig,
} from "./model";

const org = (id: number, causeAreaId: number, standardShare: number) => ({
  id,
  causeAreaId,
  name: `Org ${id}`,
  standardShare,
  isActive: true,
  ordering: id,
});

const config: CauseAreaConfig[] = [
  {
    id: 1,
    name: "Global health",
    standardPercentageShare: 80,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 1,
    organizations: [org(11, 1, 60), org(12, 1, 40)],
  },
  {
    id: 2,
    name: "Animal welfare",
    standardPercentageShare: 20,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 2,
    organizations: [org(21, 2, 100)],
  },
];

describe("distribution model", () => {
  it("starts from the configured standard distribution and is valid", () => {
    const draft = standardDraft(config);
    expect(draft.causeAreas.map((a) => a.share)).toEqual([80, 20]);
    expect(validateDraft(draft)).toMatchObject({ valid: true, total: 100, remaining: 0 });
  });

  it("reports what is left or over at the cause area level", () => {
    const under = setShare(standardDraft(config), 1, 50);
    expect(validateDraft(under)).toMatchObject({ valid: false, remaining: 30 });
    expect(validateDraft(under).error).toContain("30 % left");
    const over = setShare(standardDraft(config), 1, 95);
    expect(validateDraft(over).error).toContain("15 % too much");
  });

  it("validates custom organization shares only for used cause areas", () => {
    let draft = setStandardSplit(standardDraft(config), config, 1, false);
    draft = setOrganizationShare(draft, 1, 11, 70);
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.causeAreas[1]?.error).toContain("110 %");
  });

  it("fills the remainder into one cause area", () => {
    const draft = fillRemaining(setShare(standardDraft(config), 1, 33.3), 2);
    expect(draft.causeAreas[1]?.share).toBe(66.7);
    expect(validateDraft(draft).valid).toBe(true);
  });

  it("round-trips through the API shape, dropping unused cause areas", () => {
    const draft = setShare(setShare(standardDraft(config), 1, 100), 2, 0);
    const api = draftToApi(draft);
    expect(api).toEqual([
      {
        id: 1,
        percentageShare: "100",
        standardSplit: true,
        organizations: [
          { id: 11, percentageShare: "60" },
          { id: 12, percentageShare: "40" },
        ],
      },
    ]);
    const back = draftFromApi(config, { causeAreas: api });
    expect(back.causeAreas.map((a) => a.share)).toEqual([100, 0]);
  });
});

describe("draftToApi (the distributionSchema input)", () => {
  const thirds = {
    causeAreas: [
      { id: 1, share: 100 / 3, standardSplit: false, organizations: [
        { id: 11, share: 100 / 3 }, { id: 12, share: 0 }, { id: 13, share: 200 / 3 },
      ] },
      { id: 2, share: 100 / 3, standardSplit: true, organizations: [{ id: 21, share: 100 }] },
      { id: 3, share: 100 / 3, standardSplit: true, organizations: [{ id: 31, share: 100 }] },
      { id: 4, share: 0, standardSplit: true, organizations: [{ id: 41, share: 100 }] },
    ],
  };

  it("sends decimal strings that sum to exactly 100 at both levels", () => {
    const api = draftToApi(thirds);
    const micro = (s: string) => Math.round(Number(s) * 1e6);
    expect(api.map((a) => a.percentageShare)).toEqual(["33.333334", "33.333333", "33.333333"]);
    expect(api.reduce((t, a) => t + micro(a.percentageShare), 0)).toBe(100e6);
    expect(api[0]!.organizations).toEqual([
      { id: 11, percentageShare: "33.333333" },
      { id: 13, percentageShare: "66.666667" },
    ]);
    for (const area of api) expect(area.percentageShare).toMatch(/^\d+(\.\d+)?$/);
  });

  it("drops zero-share cause areas and organizations, also under standard split", () => {
    const draft = setShare(setShare(standardDraft(config), 1, 100), 2, 0);
    const withZeroOrg = {
      causeAreas: draft.causeAreas.map((a) =>
        a.id === 1 ? { ...a, organizations: [...a.organizations, { id: 13, share: 0 }] } : a,
      ),
    };
    expect(draftToApi(withZeroOrg)).toEqual([
      {
        id: 1,
        percentageShare: "100",
        standardSplit: true,
        organizations: [
          { id: 11, percentageShare: "60" },
          { id: 12, percentageShare: "40" },
        ],
      },
    ]);
  });

  it("keeps the standardSplit flag and leaves real errors for the API to report", () => {
    const api = draftToApi(setShare(standardDraft(config), 1, 50));
    expect(api.map((a) => [a.id, a.percentageShare, a.standardSplit])).toEqual([
      [1, "50", true],
      [2, "20", true],
    ]);
  });

  it("reads API strings with 15 decimals and sends them back unchanged in meaning", () => {
    const read = draftFromApi(config, {
      causeAreas: [
        {
          id: 1,
          percentageShare: "33.333333333333333",
          standardSplit: false,
          organizations: [
            { id: 11, percentageShare: "50.000000000000000" },
            { id: 12, percentageShare: "50.000000000000000" },
          ],
        },
        { id: 2, percentageShare: "66.666666666666667", standardSplit: true, organizations: [] },
      ],
    });
    expect(validateDraft(read).valid).toBe(true);
    expect(draftToApi(read).map((a) => a.percentageShare)).toEqual(["33.333333", "66.666667"]);
    expect(sameDistribution(read, read)).toBe(true);
    expect(sameDistribution(read, standardDraft(config))).toBe(false);
  });

  it("keeps deactivated cause areas and organizations an existing split uses", () => {
    const withInactive: CauseAreaConfig[] = [
      { ...config[0]!, organizations: [org(11, 1, 100), { ...org(12, 1, 0), isActive: false }] },
      { ...config[1]!, isActive: false },
    ];
    const read = draftFromApi(withInactive, {
      causeAreas: [
        {
          id: 1,
          percentageShare: "100",
          standardSplit: false,
          organizations: [{ id: 12, percentageShare: "100" }],
        },
      ],
    });
    expect(read.causeAreas.map((a) => a.id)).toEqual([1]);
    expect(read.causeAreas[0]!.organizations).toEqual([
      { id: 11, share: 0 },
      { id: 12, share: 100 },
    ]);
  });
});
