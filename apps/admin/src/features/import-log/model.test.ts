import { describe, expect, it } from "vitest";
import { withoutFile } from "./model";

describe("import log", () => {
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
