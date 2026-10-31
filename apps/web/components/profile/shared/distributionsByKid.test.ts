import { describe, expect, it } from "vitest";
import { Distribution } from "../../../models";
import { distributionsByKid } from "./distributionsByKid";

const distribution = (kid: string) =>
  ({ kid, donorId: 1, taxUnitId: null, causeAreas: [] }) as unknown as Distribution;

describe("distributionsByKid", () => {
  it("maps the loaded distributions by KID", () => {
    const map = distributionsByKid([distribution("1"), distribution("2")], {
      fetched: true,
      failed: false,
    });
    expect(Array.from(map.keys())).toEqual(["1", "2"]);
  });

  it("is empty instead of throwing when loading failed", () => {
    expect(distributionsByKid(undefined, { fetched: true, failed: true }).size).toBe(0);
  });

  it("is empty when nothing was fetched", () => {
    expect(distributionsByKid(undefined, { fetched: false, failed: false }).size).toBe(0);
  });
});
