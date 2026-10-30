import { describe, expect, it } from "vitest";
import { sumMoney } from "@/lib/money";
import type { CauseAreaConfig, DistributionDraft } from "./model";
import {
  groupOther,
  isGlobalHealth,
  ORG_COLORS,
  orgChartSeries,
  orgColor,
  orgSlices,
  orgSlicesFromSplit,
  OTHER_COLOR,
  showCauseAreas,
} from "./orgs";

const org = (id: number, name: string, chartColor: string | null = null) =>
  ({ id, name, isActive: true, standardShare: 0, ordering: id, chartColor } as never);
const config = [
  {
    id: 1,
    name: "Global Health",
    isActive: true,
    organizations: [
      org(1, "AMF", "chart-11"),
      org(2, "Malaria Consortium"),
      org(3, "GiveDirectly", "chart-11"),
    ],
  },
  { id: 2, name: "Animal welfare", isActive: true, organizations: [org(21, "The Humane League")] },
] as unknown as CauseAreaConfig[];

const healthOnly: DistributionDraft = {
  causeAreas: [
    {
      id: 1,
      share: 100,
      standardSplit: false,
      organizations: [
        { id: 1, share: 50 },
        { id: 2, share: 30 },
        { id: 3, share: 20 },
      ],
    },
    { id: 2, share: 0, standardSplit: true, organizations: [{ id: 21, share: 100 }] },
  ],
};

const mixed: DistributionDraft = {
  causeAreas: [
    { ...healthOnly.causeAreas[0]!, share: 80 },
    { id: 2, share: 20, standardSplit: true, organizations: [{ id: 21, share: 100 }] },
  ],
};

describe("orgColor", () => {
  it("uses the organization's stored colour", () => {
    expect(orgColor({ id: 1, chartColor: "chart-12" })).toBe("chart-12");
    expect(orgColor({ id: 1, chartColor: "chart-3" })).toBe("chart-3");
  });

  it("falls back to a colour derived from the id when none is stored", () => {
    // The colours organizations had before they were stored: id mod 8 over chart-1…4, 6…9.
    expect(orgColor({ id: 1, chartColor: null })).toBe("chart-2");
    expect(orgColor({ id: 4 })).toBe("chart-6");
    expect(orgColor({ id: 9 })).toBe(orgColor({ id: 1 }));
  });

  it("ignores stored values outside the palette, including Other's grey", () => {
    expect(orgColor({ id: 1, chartColor: "chart-5" })).toBe("chart-2");
    expect(orgColor({ id: 1, chartColor: "#ff0000" })).toBe("chart-2");
  });

  it("never uses the Other colour", () => {
    expect(ORG_COLORS).not.toContain(OTHER_COLOR);
    const derived = Array.from({ length: 20 }, (_, id) => orgColor({ id }));
    expect(derived).not.toContain(OTHER_COLOR);
  });
});

describe("orgSlices", () => {
  it("colours each organization as stored, with no per-view reassignment", () => {
    const colors = orgSlices(healthOnly, config).map((slice) => [slice.id, slice.color]);
    // AMF and GiveDirectly share a stored colour and keep it; MC has none and derives one.
    expect(colors).toEqual([
      [1, "chart-11"],
      [2, orgColor({ id: 2 })],
      [3, "chart-11"],
    ]);
  });

  it("multiplies cause area and organization shares, largest first", () => {
    const slices = orgSlices(mixed, config);
    expect(slices.map((s) => [s.name, s.share, s.causeAreaName])).toEqual([
      ["AMF", 40, "Global Health"],
      ["Malaria Consortium", 24, "Global Health"],
      ["The Humane League", 20, "Animal welfare"],
      ["GiveDirectly", 16, "Global Health"],
    ]);
  });

  it("splits an amount so the parts add up exactly", () => {
    const thirds: DistributionDraft = {
      causeAreas: [
        {
          id: 1,
          share: 100,
          standardSplit: false,
          organizations: [
            { id: 1, share: 33.333333 },
            { id: 2, share: 33.333333 },
            { id: 3, share: 33.333334 },
          ],
        },
      ],
    };
    const slices = orgSlices(thirds, config, "100.00");
    expect(sumMoney(slices.map((s) => s.amount))).toBe("100.00");
    expect(slices.map((s) => s.amount).sort()).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("leaves amounts out when there is none", () => {
    expect(orgSlices(healthOnly, config)[0]!.amount).toBeUndefined();
  });
});

describe("groupOther", () => {
  it("keeps the largest and sums the tail as Other", () => {
    const slices = orgSlices(mixed, config, "1000");
    const grouped = groupOther(slices, 3);
    expect(grouped.map((s) => s.name)).toEqual(["AMF", "Malaria Consortium", "Other"]);
    expect(grouped[2]).toMatchObject({ id: null, share: 36, amount: "360.00", color: OTHER_COLOR });
  });

  it("leaves short lists alone", () => {
    const slices = orgSlices(healthOnly, config);
    expect(groupOther(slices, 3)).toBe(slices);
  });
});

describe("showCauseAreas", () => {
  it("hides a lone Global Health", () => {
    expect(showCauseAreas(healthOnly, config)).toBe(false);
    expect(isGlobalHealth("Global helse")).toBe(true);
  });

  it("shows cause areas when there are several, or the one isn't Global Health", () => {
    expect(showCauseAreas(mixed, config)).toBe(true);
    const animalsOnly: DistributionDraft = {
      causeAreas: [{ ...mixed.causeAreas[1]!, share: 100 }],
    };
    expect(showCauseAreas(animalsOnly, config)).toBe(true);
  });
});

describe("orgChartSeries", () => {
  it("names the largest organizations and maps the rest to Other", () => {
    const { series, keyOf } = orgChartSeries(
      [
        { id: 1, label: "AMF", total: 10 },
        { id: 2, label: "GD", total: 30 },
        { id: 3, label: "MC", total: 20 },
        { id: 4, label: "NI", total: 5 },
      ],
      3,
    );
    expect(series.map((s) => s.key)).toEqual(["org2", "org3", "other"]);
    expect(series[0]!.color).toBe(orgColor({ id: 2 }));
    expect(keyOf(1)).toBe("other");
    expect(keyOf(3)).toBe("org3");
  });

  it("colours a series with the organization's stored colour, whatever else is shown", () => {
    const alone = orgChartSeries([{ id: 5, label: "AMF", total: 1, chartColor: "chart-4" }]);
    const together = orgChartSeries([
      { id: 5, label: "AMF", total: 1, chartColor: "chart-4" },
      { id: 6, label: "MC", total: 2, chartColor: "chart-4" },
    ]);
    expect(alone.series[0]!.color).toBe("chart-4");
    expect(together.series.map((s) => s.color)).toEqual(["chart-4", "chart-4"]);
  });
});

describe("orgSlicesFromSplit", () => {
  it("turns list rows into slices in each organization's colour", () => {
    const slices = orgSlicesFromSplit([
      {
        organizationId: 3,
        organizationName: "GiveDirectly",
        causeAreaId: 1,
        chartColor: "chart-10",
        share: "62.500000",
      },
      { organizationId: 9, organizationName: "The Humane League", causeAreaId: 2, share: "37.5" },
    ]);
    expect(slices).toEqual([
      {
        id: 3,
        name: "GiveDirectly",
        share: 62.5,
        causeAreaId: 1,
        causeAreaName: null,
        color: "chart-10",
      },
      {
        id: 9,
        name: "The Humane League",
        share: 37.5,
        causeAreaId: 2,
        causeAreaName: null,
        color: orgColor({ id: 9 }),
      },
    ]);
  });

  it("is empty for a KID without a split", () => {
    expect(orgSlicesFromSplit([])).toEqual([]);
  });
});
