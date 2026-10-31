import { describe, expect, it } from "vitest";
import { isProcedureAvailable } from "./client";

describe("isProcedureAvailable", () => {
  it("has every procedure on the sites that use our tRPC API", () => {
    expect(isProcedureAvailable("no", "minside.updateProfile")).toBe(true);
    expect(isProcedureAvailable("sv", "minside.updateProfile")).toBe(true);
  });

  it("has only the procedures restLink maps on the Danish site", () => {
    expect(isProcedureAvailable("dk", "minside.profile")).toBe(true);
    // The Danish backend has no route for saving the donor's profile
    expect(isProcedureAvailable("dk", "minside.updateProfile")).toBe(false);
    expect(isProcedureAvailable("dk", "toString")).toBe(false);
  });
});
