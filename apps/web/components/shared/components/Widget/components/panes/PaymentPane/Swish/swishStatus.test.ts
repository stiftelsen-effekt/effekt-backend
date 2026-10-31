import { describe, expect, it } from "vitest";
import { swishStatusRefreshInterval } from "./swishStatus";

describe("swishStatusRefreshInterval", () => {
  it("polls while the order is pending", () => {
    expect(swishStatusRefreshInterval(undefined)).toBe(1000);
    expect(swishStatusRefreshInterval({ status: null })).toBe(1000);
    expect(swishStatusRefreshInterval({ status: "CREATED" })).toBe(1000);
  });

  it.each(["PAID", "DECLINED", "ERROR", "CANCELLED"])("stops polling once %s", (status) => {
    expect(swishStatusRefreshInterval({ status })).toBe(0);
  });
});
