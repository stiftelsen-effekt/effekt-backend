import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import { validateXml, writeXMLTaxReport } from "../custom_modules/tax";

const DATA_DIR = path.join(__dirname, "data", "tax");
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

// Copy of the Skatteetaten schema fetched at runtime by createXMLReportToTaxAuthorities
const xsd = fs.readFileSync(path.join(DATA_DIR, "gavefrivilligorganisasjon_v2_0.xsd"), "utf8");
// Inputs and the output libxmljs (on Node 22) produced for them
const inputs = readJson("report_inputs.json");
const baseline: {
  xml: Record<string, string>;
  validity: Record<string, { valid: boolean; errors: string[] }>;
} = readJson("libxmljs_baseline.json");

describe("Tax report XML (Skatteetaten)", () => {
  let clock: sinon.SinonFakeTimers;
  beforeEach(() => {
    // The baseline was generated with Date.now() === 1735689600000
    clock = sinon.useFakeTimers({ now: 1735689600000, toFake: ["Date"] });
  });
  afterEach(() => clock.restore());

  for (const name of Object.keys(inputs)) {
    it(`serializes "${name}" identically to the libxmljs implementation`, () => {
      const { entities, contact, year } = inputs[name];
      expect(writeXMLTaxReport(entities, contact, year)).to.equal(baseline.xml[name]);
    });

    it(`validates "${name}" against the XSD like libxmljs`, async () => {
      const { valid, errors } = await validateXml(baseline.xml[name], xsd);
      expect(valid).to.equal(baseline.validity[name].valid);
      expect(errors).to.deep.equal(baseline.validity[name].errors);
    });
  }

  it("accepts a valid document", async () => {
    const result = await validateXml(baseline.xml.typical, xsd);
    expect(result).to.deep.equal({ valid: true, errors: [] });
  });

  it("rejects an invalid document with the schema error", async () => {
    const invalid = baseline.xml.typical.replace(
      "<leveransetype>ordinaer</leveransetype>",
      "<leveransetype>ukjent</leveransetype>",
    );
    const result = await validateXml(invalid, xsd);
    expect(result.valid).to.equal(false);
    expect(result.errors).to.have.length(1);
    expect(result.errors[0]).to.contain("leveransetype");
  });

  it("does not resolve external entities (XXE)", async () => {
    const xxe = baseline.xml.typical
      .replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE melding [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      )
      .replace("<navn>Ola Nordmann</navn>", "<navn>&xxe;</navn>");
    const result = await validateXml(xxe, xsd);
    expect(result.valid).to.equal(false);
    expect(result.errors.join("\n")).to.not.contain("root:");
  });
});
