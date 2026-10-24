const dns = require("node:dns").promises;
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { extractXml, parseReport, summarize } = require("./report");

const PROCESSED = "Processed";
const UNPARSED = "Unparsed";

/**
 * Called by Cloud Scheduler with ?mode=daily (alert on DMARC failures in new reports, then archive
 * them) or ?mode=weekly (summary of the last 7 days of archived reports).
 */
exports.default = async (req, res) => {
  const mode = req.query.mode === "weekly" ? "weekly" : "daily";
  const client = new ImapFlow({
    host: "imap.domeneshop.no",
    port: 993,
    secure: true,
    auth: { user: process.env.DMARC_MAILBOX_USER, pass: process.env.DMARC_MAILBOX_PASSWORD },
    logger: false,
  });
  try {
    await client.connect();
    const result = mode === "weekly" ? await weekly(client) : await daily(client);
    res.status(200).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send("DMARC report run failed");
  } finally {
    await client.logout().catch(() => {});
  }
};

async function daily(client) {
  await ensureMailbox(client, PROCESSED);
  await ensureMailbox(client, UNPARSED);
  const lock = await client.getMailboxLock("INBOX");
  try {
    const { reports, parsedUids, unparsedUids } = await readReports(client, { all: true });
    if (unparsedUids.length) await client.messageMove(unparsedUids, UNPARSED, { uid: true });
    if (parsedUids.length) {
      const { failures } = summarize(reports);
      if (failures.length) await postSlack(await failureMessage(failures));
      // Move only after alerting, so a failed Slack post leaves the reports to be retried.
      await client.messageMove(parsedUids, PROCESSED, { uid: true });
    }
    return `daily: ${parsedUids.length} reports, ${unparsedUids.length} unparsed`;
  } finally {
    lock.release();
  }
}

async function weekly(client) {
  await ensureMailbox(client, PROCESSED);
  const lock = await client.getMailboxLock(PROCESSED);
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { reports } = await readReports(client, { since });
    await postSlack(weeklyMessage(reports, since));
    return `weekly: ${reports.length} reports`;
  } finally {
    lock.release();
  }
}

async function readReports(client, query) {
  const reports = [];
  const parsedUids = [];
  const unparsedUids = [];
  const uids = (await client.search(query, { uid: true })) || [];
  for (const uid of uids) {
    const message = await client.fetchOne(uid, { source: true }, { uid: true });
    const mail = await simpleParser(message.source);
    const found = mail.attachments
      .flatMap((a) => extractXml(a.content))
      .map((xml) => {
        try {
          return parseReport(xml);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (found.length) {
      reports.push(...found);
      parsedUids.push(uid);
    } else {
      unparsedUids.push(uid);
    }
  }
  return { reports, parsedUids, unparsedUids };
}

async function ensureMailbox(client, path) {
  const boxes = await client.list();
  if (!boxes.some((box) => box.path === path)) await client.mailboxCreate(path);
}

async function failureMessage(failures) {
  const byIp = new Map();
  for (const f of failures) {
    const entry = byIp.get(f.ip) || {
      count: 0,
      sender: f.sender,
      from: new Set(),
      reporters: new Set(),
    };
    entry.count += f.count;
    entry.from.add(f.headerFrom);
    entry.reporters.add(f.reporter);
    byIp.set(f.ip, entry);
  }
  const lines = [];
  for (const [ip, e] of [...byIp].sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
    const host = await reverseDns(ip);
    lines.push(
      `• ${e.count} from \`${ip}\`${host ? ` (${host})` : ""}: ${e.sender}, From ${[...e.from].join(
        ", ",
      )}, reported by ${[...e.reporters].join(", ")}`,
    );
  }
  const total = failures.reduce((n, f) => n + f.count, 0);
  return `:warning: *DMARC failures*: ${total} message(s) claiming our domains failed SPF and DKIM alignment.\n${lines.join(
    "\n",
  )}`;
}

function weeklyMessage(reports, since) {
  if (!reports.length) return ":email: *DMARC weekly*: no reports received in the last 7 days.";
  const { senders, failures } = summarize(reports);
  const domains = [...new Set(reports.map((r) => `${r.domain} (p=${r.policy})`))].join(", ");
  const lines = [...senders]
    .sort((a, b) => b[1].pass + b[1].fail - (a[1].pass + a[1].fail))
    .map(
      ([name, s]) =>
        `${s.fail ? ":x:" : ":white_check_mark:"} ${name}: ${s.pass} passed${
          s.fail ? `, ${s.fail} failed` : ""
        }`,
    );
  const from = since.toISOString().slice(0, 10);
  const verdict = failures.length
    ? "Some mail failed DMARC; check the failures before tightening the policy."
    : "Everything passed DMARC.";
  return `:email: *DMARC weekly* since ${from}: ${
    reports.length
  } reports for ${domains}\n${lines.join("\n")}\n${verdict}`;
}

async function reverseDns(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((_, reject) => setTimeout(reject, 2000)),
    ]);
    return names[0];
  } catch {
    return null;
  }
}

async function postSlack(text) {
  const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`);
}
