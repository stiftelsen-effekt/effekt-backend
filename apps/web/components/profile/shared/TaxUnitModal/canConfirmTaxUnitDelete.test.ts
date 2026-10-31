import { expect, it } from "vitest";
import { canConfirmTaxUnitDelete } from "./canConfirmTaxUnitDelete";

it("allows deleting without moving the donations", () => {
  expect(canConfirmTaxUnitDelete(false, null)).toBe(true);
});

it("needs a unit to move the donations to", () => {
  expect(canConfirmTaxUnitDelete(true, null)).toBe(false);
  expect(canConfirmTaxUnitDelete(true, { id: 2 })).toBe(true);
});
