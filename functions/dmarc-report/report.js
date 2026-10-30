const { unzipSync, gunzipSync, strFromU8 } = require("fflate");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name, jpath) =>
    jpath === "feedback.record" ||
    jpath === "feedback.record.auth_results.dkim" ||
    jpath === "feedback.record.auth_results.spf",
});

// Reporters send reports as .zip, .gz or plain .xml attachments; detect by magic bytes rather than
// trusting the filename or content type, which vary between providers.
function extractXml(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return [strFromU8(gunzipSync(bytes))];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return Object.entries(unzipSync(bytes))
      .filter(([name]) => name.toLowerCase().endsWith(".xml"))
      .map(([, data]) => strFromU8(data));
  }
  const text = strFromU8(bytes).trimStart();
  return text.startsWith("<") ? [text] : [];
}

function parseReport(xml) {
  const feedback = parser.parse(xml).feedback;
  if (!feedback || !feedback.record) return null;
  const meta = feedback.report_metadata || {};
  return {
    reporter: meta.org_name || "unknown reporter",
    begin: Number(meta.date_range?.begin) * 1000,
    end: Number(meta.date_range?.end) * 1000,
    domain: feedback.policy_published?.domain,
    policy: feedback.policy_published?.p,
    rows: feedback.record.map((record) => ({
      ip: record.row.source_ip,
      count: Number(record.row.count),
      dkim: record.row.policy_evaluated?.dkim,
      spf: record.row.policy_evaluated?.spf,
      headerFrom: record.identifiers?.header_from,
      dkimAuth: record.auth_results?.dkim || [],
      spfAuth: record.auth_results?.spf || [],
    })),
  };
}

const dmarcPass = (row) => row.dkim === "pass" || row.spf === "pass";

// Our known senders, recognised by their DKIM selector or SPF (return-path) domain.
function classify(row) {
  const selectors = row.dkimAuth.map((d) => String(d.selector || ""));
  const spfDomains = row.spfAuth.map((s) => String(s.domain || "").toLowerCase());
  if (selectors.includes("google")) return "Google Workspace";
  if (selectors.some((s) => s.startsWith("mlsend")) || spfDomains.includes("mta.gieffektivt.no"))
    return "MailerSend";
  if (
    selectors.some((s) => /^hs[12]-/.test(s)) ||
    spfDomains.some((d) => d.endsWith("hubspotemail.net"))
  )
    return "HubSpot";
  if (
    selectors.includes("k1") ||
    spfDomains.some((d) => /(^|\.)(mcdlv|mcsv|rsgsv)\.net$|(^|\.)mandrillapp\.com$/.test(d))
  )
    return "Mailchimp";
  return "Other";
}

// Recipient-side mail filters that rewrite mail (links, banners) and hand it back to the recipient's
// mailbox provider, which then sees it fail SPF and DKIM. Recognised by the source IP's reverse DNS.
const GATEWAYS = [
  [/\.cloud-sec-av\.com$/, "Avanan"],
  [/\.mimecast\.com$/, "Mimecast"],
  [/\.pphosted\.com$/, "Proofpoint"],
  [/\.barracuda\.com$/, "Barracuda"],
  [/\.iphmx\.com$/, "Cisco Secure Email"],
];

function gateway(host) {
  const name = String(host || "")
    .toLowerCase()
    .replace(/\.$/, "");
  return GATEWAYS.find(([pattern]) => pattern.test(name))?.[1] || null;
}

// What the reporter saw: which domains signed the message and which return-path SPF checked. A failed
// signature from our own domain means it was our mail, altered in transit.
function authSummary(row) {
  const dkim = row.dkimAuth.length
    ? row.dkimAuth
        .map((d) => `${d.domain}${d.selector ? `/${d.selector}` : ""} ${d.result}`)
        .join(", ")
    : "none";
  const spf = row.spfAuth.map((s) => `${s.domain} ${s.result}`).join(", ") || "none";
  return `DKIM ${dkim}; SPF ${spf}`;
}

function summarize(reports) {
  const senders = new Map();
  const failures = [];
  for (const report of reports) {
    for (const row of report.rows) {
      const name = classify(row);
      const entry = senders.get(name) || { pass: 0, fail: 0 };
      if (dmarcPass(row)) entry.pass += row.count;
      else {
        entry.fail += row.count;
        failures.push({ ...row, sender: name, reporter: report.reporter });
      }
      senders.set(name, entry);
    }
  }
  return { senders, failures };
}

module.exports = {
  extractXml,
  parseReport,
  dmarcPass,
  classify,
  gateway,
  authSummary,
  summarize,
};
