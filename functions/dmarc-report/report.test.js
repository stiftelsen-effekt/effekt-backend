const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gzipSync, zipSync, strToU8 } = require("fflate");
const { extractXml, parseReport, classify, summarize } = require("./report");

const record = (ip, count, dkim, spf, selector, spfDomain) => `
  <record>
    <row><source_ip>${ip}</source_ip><count>${count}</count>
      <policy_evaluated><disposition>none</disposition><dkim>${dkim}</dkim><spf>${spf}</spf></policy_evaluated></row>
    <identifiers><header_from>gieffektivt.no</header_from></identifiers>
    <auth_results>
      ${selector ? `<dkim><domain>gieffektivt.no</domain><selector>${selector}</selector><result>${dkim}</result></dkim>` : ""}
      <spf><domain>${spfDomain}</domain><result>${spf}</result></spf>
    </auth_results>
  </record>`;

const xml = `<?xml version="1.0"?>
<feedback>
  <report_metadata><org_name>google.com</org_name><date_range><begin>1792800000</begin><end>1792886399</end></date_range></report_metadata>
  <policy_published><domain>gieffektivt.no</domain><p>none</p></policy_published>
  ${record("209.85.220.41", 10, "pass", "pass", "google", "gieffektivt.no")}
  ${record("1.2.3.4", 3, "pass", "fail", "mlsend2", "mta.gieffektivt.no")}
  ${record("5.6.7.8", 2, "pass", "fail", "hs1-8642229", "bounce.hubspotemail.net")}
  ${record("203.0.113.9", 4, "fail", "fail", null, "evil.example")}
</feedback>`;

test("extracts XML from gzip, zip and plain attachments", () => {
  assert.deepEqual(extractXml(Buffer.from(gzipSync(strToU8(xml)))), [xml]);
  assert.deepEqual(extractXml(Buffer.from(zipSync({ "report.xml": strToU8(xml), "readme.txt": strToU8("x") }))), [xml]);
  assert.deepEqual(extractXml(Buffer.from(xml)), [xml]);
  assert.deepEqual(extractXml(Buffer.from("not a report")), []);
});

test("parses a single-record report", () => {
  const single = xml.replace(/<record>[\s\S]*<\/record>/, record("209.85.220.41", 1, "pass", "pass", "google", "gieffektivt.no"));
  const report = parseReport(single);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].count, 1);
});

test("classifies known senders", () => {
  const rows = parseReport(xml).rows;
  assert.deepEqual(rows.map(classify), ["Google Workspace", "MailerSend", "HubSpot", "Other"]);
});

test("counts DMARC passes and lists failures", () => {
  const { senders, failures } = summarize([parseReport(xml)]);
  assert.deepEqual(senders.get("Google Workspace"), { pass: 10, fail: 0 });
  assert.deepEqual(senders.get("HubSpot"), { pass: 2, fail: 0 });
  assert.deepEqual(senders.get("Other"), { pass: 0, fail: 4 });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].ip, "203.0.113.9");
  assert.equal(failures[0].reporter, "google.com");
});
