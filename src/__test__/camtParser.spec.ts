import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { parseCamtFile, isCamtXml } from "../custom_modules/parsers/camtParser";

const DATA_DIR = path.join(__dirname, "data", "camt");

/**
 * libxmljs_baseline.json holds the output of the previous libxmljs based
 * parser (on Node 22) for every fixture in data/camt, plus a few derived
 * variants. The new parser must produce identical results.
 *
 * The one intentional difference: libxmljs silently dropped references to
 * external entities, the new parser rejects the file instead (see XXE test).
 */
const INTENTIONAL_DIFFERENCES = new Set(["camt053_xxe.xml"]);
const baseline: Record<string, { result?: unknown; error?: string }> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "libxmljs_baseline.json"), "utf8"),
);

const loadInput = (key: string): string => {
  const [file, variant] = key.split("#");
  const content = fs.readFileSync(path.join(DATA_DIR, file)).toString();
  if (variant === "bom") return "﻿" + content;
  if (variant === "leading-ws") return "\n  " + content;
  return content;
};

describe("CAMT.053 parser", () => {
  it("has a baseline entry for every fixture", () => {
    const fixtures = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".xml"));
    expect(fixtures.length).to.be.greaterThan(0);
    for (const f of fixtures) {
      expect(baseline, f).to.have.property(f);
    }
  });

  for (const [key, expected] of Object.entries(baseline)) {
    if (INTENTIONAL_DIFFERENCES.has(key)) continue;
    if (expected.error !== undefined) {
      it(`rejects ${key} like the libxmljs implementation`, () => {
        expect(() => parseCamtFile(loadInput(key))).to.throw();
      });
    } else {
      it(`parses ${key} identically to the libxmljs implementation`, () => {
        const actual = JSON.parse(JSON.stringify(parseCamtFile(loadInput(key))));
        expect(actual).to.deep.equal(expected.result);
      });
    }
  }

  it("keeps the same error message for a statement-less file", () => {
    expect(() => parseCamtFile(loadInput("camt053_wrong_namespace.xml"))).to.throw(
      "No statement found in CAMT file",
    );
  });

  it("does not resolve external entities (XXE)", () => {
    // libxmljs left the entity unexpanded ("before  after"); we now reject the file outright.
    expect(baseline["camt053_xxe.xml"].result).to.deep.include({ postingDate: "2025-01-01" });
    expect(() => parseCamtFile(loadInput("camt053_xxe.xml"))).to.throw(/entity not found/);
  });

  it("detects CAMT XML", () => {
    expect(isCamtXml(loadInput("camt053_mixed.xml"))).to.equal(true);
    expect(isCamtXml("not xml")).to.equal(false);
  });
});
