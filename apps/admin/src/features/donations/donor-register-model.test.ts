import { describe, expect, it } from "vitest";
import type { CauseAreaConfig } from "@/features/distribution/model";
import {
  briefSplit,
  kidOptions,
  mostUsedKid,
  type DonorDistribution,
} from "./donor-register-model";

const kid = (KID: string, count: number, sum: string | null): DonorDistribution =>
  ({ KID, count, sum, full_name: "Kari Nordmann", email: "kari@example.org" }) as DonorDistribution;

const org = (id: number, abbreviation: string) =>
  ({
    id,
    name: `${abbreviation} full name`,
    abbreviation,
    isActive: true,
    standardShare: 50,
  }) as never;

const config = [
  { id: 1, name: "Global health", organizations: [org(11, "AMF"), org(12, "GD")] },
  { id: 2, name: "Animal welfare", organizations: [org(21, "THL")] },
] as unknown as CauseAreaConfig[];

describe("KIDs for registering from the donor page", () => {
  it("puts the most used KID first, then the largest total", () => {
    const options = kidOptions([
      kid("111", 2, "500.00"),
      kid("222", 7, "100.00"),
      kid("333", 2, "900.00"),
      kid("444", 0, null),
    ]);
    expect(options.map((o) => o.KID)).toEqual(["222", "333", "111", "444"]);
    expect(mostUsedKid([kid("111", 1, "5.00"), kid("222", 3, "1.00")])).toBe("222");
    expect(mostUsedKid([])).toBe("");
  });
});

describe("briefSplit", () => {
  it("names the organizations of a custom split in one cause area", () => {
    expect(
      briefSplit(
        {
          causeAreas: [
            {
              id: 1,
              percentageShare: "100",
              standardSplit: false,
              organizations: [
                { id: 11, percentageShare: "60" },
                { id: 12, percentageShare: "40" },
              ],
            },
          ],
        },
        config,
      ),
    ).toBe("AMF 60 %, GD 40 %");
  });

  it("names the cause areas when there are several, and the standard split", () => {
    expect(
      briefSplit(
        {
          causeAreas: [
            { id: 1, percentageShare: "80", standardSplit: true, organizations: [] },
            {
              id: 2,
              percentageShare: "20",
              standardSplit: false,
              organizations: [{ id: 21, percentageShare: "100" }],
            },
          ],
        },
        config,
      ),
    ).toBe("Global health 80 % (standard split), Animal welfare 20 % (THL 100 %)");
    expect(
      briefSplit(
        {
          causeAreas: [
            { id: 1, percentageShare: "100", standardSplit: true, organizations: [] },
            { id: 2, percentageShare: "0", standardSplit: true, organizations: [] },
          ],
        },
        config,
      ),
    ).toBe("Global health, standard split");
  });
});
