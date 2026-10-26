import { describe, expect, it } from "vitest";
import {
  draftFromApi,
  draftToApi,
  fillRemaining,
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
