import { describe, expect, it } from "vitest";
import { importLogRowCount, withoutFile } from "./model";

describe("import log", () => {
  it("counts rows from pages", () => {
    expect(importLogRowCount(0, 1, 50, 0)).toBe(0);
    expect(importLogRowCount(3, 1, 50, 50)).toBe(150);
    expect(importLogRowCount(3, 3, 50, 7)).toBe(107);
  });

  it("separates the stored file from the result", () => {
    expect(withoutFile({ file: "raw", filename: "a.txt", valid: 2 })).toEqual({
      result: { filename: "a.txt", valid: 2 },
      file: "raw",
      filename: "a.txt",
    });
    expect(withoutFile({ nofile: true })).toEqual({
      result: { nofile: true },
      file: null,
      filename: null,
    });
    expect(withoutFile(null).file).toBeNull();
  });
});
