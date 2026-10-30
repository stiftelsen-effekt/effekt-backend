import { expect } from "chai";
import type { Request, Response } from "express";
import * as mysql from "mysql2/promise";
import { DAO } from "../../custom_modules/DAO";
import { dec, fmt, sum } from "../../custom_modules/regranting/money";
import type {
  BalanceBreakdown,
  CompositionGroup,
  CompositionItem,
  CompositionLine,
} from "../../custom_modules/regranting/trace";
import { appRouter } from "../../trpc/router";
import { createCallerFactory } from "../../trpc/trpc";

/**
 * Tracing on the seeded history (prisma/devdata): every breakdown adds up to the balance query,
 * every round's composition adds up to its lines, and the monthly check finds nothing wrong.
 * Read-only. Skipped unless REGRANTING_SEED_DB_URL points at a local database seeded with the dev
 * data generator, e.g.:
 *
 *   docker run --rm -d --name trace-mysql -p 3390:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=1 \
 *     -e MYSQL_DATABASE=trace mysql:8.4.11 --log_bin_trust_function_creators=1
 *   DB_URL=mysql://root@127.0.0.1:3390/trace pnpm exec prisma migrate deploy
 *   DB_URL=mysql://root@127.0.0.1:3390/trace SEED_NOW=2026-10-28 pnpm exec prisma db seed
 *   REGRANTING_SEED_DB_URL=mysql://root@127.0.0.1:3390/trace pnpm test -- --spec src/__test__/DAO/regranting.trace.db.spec.ts
 */
const url = process.env.REGRANTING_SEED_DB_URL;
const isLocal = !!url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

const api = createCallerFactory(appRouter)({
  req: {} as Request,
  res: {} as Response,
  auth: { permissions: ["admin"], email: "check@example.org", sub: "auth0|check" } as any,
}).regranting;

const total = (amounts: string[]) => fmt(sum(amounts));

const itemSum = (items: CompositionItem[]) => total(items.map((i) => i.amount));

/** A group's amount is the sum of its items; a donations item's the sum of its months */
const expectGroupAddsUp = (group: CompositionGroup, where: string) => {
  expect(itemSum(group.items), where).to.equal(group.amount);
  for (const item of group.items) {
    if (item.kind === "donations") {
      expect(total(item.months.map((m) => m.amount)), `${where} months`).to.equal(item.amount);
      expect(item.from <= item.to, `${where} period`).to.equal(true);
    }
  }
};

const expectBreakdownAddsUp = (b: BalanceBreakdown, where: string) => {
  expect(b.check.differences, where).to.deep.equal([]);
  expect(b.check.matches, where).to.equal(true);
  expect(total(b.allocations.months.map((m) => m.amount)), `${where} months`).to.equal(
    b.allocations.total,
  );
  for (const part of [
    "opening",
    "fundGrantsIn",
    "fundGrantsOut",
    "transfers",
    "adjustments",
  ] as const) {
    expect(total(b[part].entries.map((e) => e.amount)), `${where} ${part}`).to.equal(b[part].total);
  }
  expect(
    total([
      b.opening.total,
      b.allocations.total,
      b.fundGrantsIn.total,
      b.fundGrantsOut.total,
      b.transfers.total,
      b.adjustments.total,
    ]),
    `${where} balance`,
  ).to.equal(b.balance);
  expect(total(b.committed.entries.map((e) => e.amount)), `${where} committed`).to.equal(
    b.committed.total,
  );
  expect(fmt(dec(b.balance).minus(b.committed.total)), `${where} available`).to.equal(b.available);
};

const expectLineAddsUp = (line: CompositionLine, where: string) => {
  for (const [name, group] of [
    ["this round", line.thisRound],
    ["carried over", line.carriedOver],
    ["since last transfer", line.sinceLastTransfer],
  ] as const) {
    expectGroupAddsUp(group, `${where} ${name}`);
  }
  const ahead = line.ahead?.amount ?? "0.00";
  expect(
    total([line.thisRound.amount, line.carriedOver.amount, line.sinceLastTransfer.amount, ahead]),
    `${where} parts`,
  ).to.equal(line.amount);
  if (line.ahead) {
    expect(
      total([...line.ahead.settledBy.map((i) => i.amount), line.ahead.unsettled]),
      where,
    ).to.equal(line.ahead.amount);
  }
  // Carried-over money is older than the window; money since the last transfer is inside it
  for (const item of line.carriedOver.items) {
    const date = item.kind === "donations" ? item.to : item.date;
    expect(
      line.window.from !== null && date < line.window.from,
      `${where} carried ${date}`,
    ).to.equal(true);
  }
  for (const item of line.sinceLastTransfer.items) {
    const from = item.kind === "donations" ? item.from : item.date;
    const to = item.kind === "donations" ? item.to : item.date;
    expect(
      line.window.from === null || from >= line.window.from,
      `${where} since ${from}`,
    ).to.equal(true);
    expect(to <= line.window.to, `${where} since ${to}`).to.equal(true);
  }
};

(isLocal ? describe : describe.skip)("regranting tracing on the seeded history", function () {
  this.timeout(600_000);
  let pool: mysql.Pool;
  let originalPool: mysql.Pool | undefined;
  let rounds: Awaited<ReturnType<typeof api.rounds.list>>;
  let organizations: { id: number; name: string }[];

  before(async () => {
    pool = mysql.createPool({ uri: url!, timezone: "+00:00", connectionLimit: 5 });
    originalPool = DAO.dbPool;
    DAO.dbPool = pool;
    rounds = (await api.rounds.list()).sort((a, b) => a.id - b.id);
    organizations = (await DAO.regranting.getOrganizations()).map((o) => ({
      id: o.id,
      name: o.name,
    }));
    expect(rounds.length, "the seed's rounds").to.be.greaterThanOrEqual(20);
  });

  after(async () => {
    DAO.dbPool = originalPool;
    await pool.end();
  });

  it("breaks every balance down into entries that add up to the balance query", async () => {
    const dates = [
      ...new Set([
        ...rounds.map((r) => r.cutoff),
        // a payment day of each kind of round: committed and later debits change there
        ...rounds.filter((r) => r.paidAt && r.kind !== "regular").map((r) => r.paidAt!),
        "2026-10-28",
      ]),
    ].sort();
    let checked = 0;
    const started = Date.now();
    for (const at of dates) {
      const view = await api.balances.list({ at });
      for (const recipient of view.recipients) {
        const all = await api.balances.breakdown({ organizationId: recipient.organizationId, at });
        expectBreakdownAddsUp(all, `${recipient.name} at ${at}`);
        expect(all.balance).to.equal(recipient.total.balance);
        expect(all.available).to.equal(recipient.total.available);
        checked++;
        if (recipient.projects.length > 0) {
          const unrestricted = await api.balances.breakdown({
            organizationId: recipient.organizationId,
            projectId: null,
            at,
          });
          expectBreakdownAddsUp(unrestricted, `${recipient.name} unrestricted at ${at}`);
          expect(unrestricted.balance).to.equal(recipient.unrestricted.balance);
          for (const project of recipient.projects) {
            const p = await api.balances.breakdown({
              organizationId: recipient.organizationId,
              projectId: project.projectId,
              at,
            });
            expectBreakdownAddsUp(p, `${recipient.name} / ${project.name} at ${at}`);
            expect(p.balance).to.equal(project.figures.balance);
            expect(p.allocations.months).to.deep.equal([]);
            checked += 2;
          }
        }
      }
    }
    console.log(
      `      ${checked} breakdowns at ${dates.length} dates, ${Math.round(
        (Date.now() - started) / checked,
      )} ms each`,
    );
  });

  it("explains each month against the Donations list", async () => {
    const tcf = await api.balances.breakdown({ organizationId: 2, at: "2026-10-28" });
    for (const m of tcf.allocations.months) {
      // The list's figure = the allocation + rounding per donation + donations that fall in the
      // neighbouring month in Oslo time
      expect(fmt(sum([m.amount, m.list.rounding, m.list.timeZone])), m.month).to.equal(m.list.sum);
      expect(dec(m.list.rounding).abs().lte(dec(m.donationCount).times("0.01")), m.month).to.equal(
        true,
      );
    }
    // The seed has Vipps donations late in the evening: some months differ by time zone
    expect(tcf.allocations.months.some((m) => m.list.timeZoneDonations !== 0)).to.equal(true);
  });

  it("shows the round builder's lines at the cutoff the way the builder adds them up", async () => {
    for (const round of rounds) {
      const builder = await api.rounds.builder({ id: round.id });
      for (const recipient of builder.recipients) {
        for (const line of recipient.lines) {
          const b = await api.balances.breakdown({
            organizationId: recipient.organizationId,
            projectId: line.projectId,
            roundId: round.id,
          });
          const where = `${round.name}: ${recipient.name} ${line.projectName ?? "unrestricted"}`;
          expectBreakdownAddsUp(b, where);
          expect(b.balance, where).to.equal(line.balanceAtCutoff);
          expect(b.committed.total, where).to.equal(line.committed);
          expect(b.inRound!.fundGrants.total, where).to.equal(line.fundGrants);
          expect(b.inRound!.adjustments.total, where).to.equal(line.roundAdjustments);
          expect(b.inRound!.available, where).to.equal(line.available);
          expect(b.inRound!.payNow.total, where).to.equal(line.inRound);
          expect(b.inRound!.carriesOver, where).to.equal(line.carriesOver);
        }
      }
    }
  });

  it("splits every transfer line of every round into parts that add up to it", async () => {
    let lines = 0;
    const started = Date.now();
    for (const round of rounds) {
      const t0 = Date.now();
      const composition = await api.rounds.composition({ roundId: round.id });
      const detail = await api.rounds.get({ id: round.id });
      const expected = detail.transfers.flatMap((t) => t.lines);
      expect(composition.lines.length, round.name).to.equal(expected.length);
      for (const line of composition.lines) {
        const saved = expected.find((l) => l.id === line.transferLineId)!;
        expect(line.amount, round.name).to.equal(saved.amountNok);
        expectLineAddsUp(line, `${round.name}: ${line.organizationName} ${line.projectName ?? ""}`);
        lines++;
      }
      if (round.kind === "major_donor") {
        // The donations it passes on are listed one by one
        const chosen = composition.lines.flatMap((l) =>
          l.thisRound.items.filter((i) => i.kind === "donation" && i.reason === "chosen"),
        );
        expect(chosen.length, round.name).to.be.greaterThan(0);
      }
      if (Date.now() - t0 > 3000) console.log(`      slow: ${round.name} ${Date.now() - t0} ms`);
    }
    console.log(
      `      ${lines} lines in ${rounds.length} rounds, ${Math.round(
        (Date.now() - started) / rounds.length,
      )} ms per round`,
    );
  });

  it("doesn't count a passed-on donation again in the next regular round", async () => {
    const major = rounds.filter((r) => r.kind === "major_donor" && r.status === "paid");
    for (const round of major) {
      const composition = await api.rounds.composition({ roundId: round.id });
      const chosenDays = composition.lines.flatMap((l) =>
        l.thisRound.items.flatMap((i) =>
          i.kind === "donation" ? [{ org: l.organizationId, i }] : [],
        ),
      );
      const next = rounds.find((r) => r.kind === "regular" && r.cutoff > round.cutoff);
      if (!next) continue;
      const after = await api.rounds.composition({ roundId: next.id });
      for (const { org, i } of chosenDays) {
        for (const line of after.lines.filter((l) => l.organizationId === org)) {
          const all = [
            ...line.thisRound.items,
            ...line.carriedOver.items,
            ...line.sinceLastTransfer.items,
          ];
          expect(
            all.some((x) => x.kind === "donation" && x.donationId === i.donationId),
            `${next.name} pays donation #${i.donationId} again`,
          ).to.equal(false);
        }
      }
    }
  });

  it("shows a fronted payment as paid ahead, covered by the donation when it arrived", async () => {
    const fronted = rounds.find((r) => r.kind === "extraordinary" && r.status === "paid");
    if (!fronted) return;
    const composition = await api.rounds.composition({ roundId: fronted.id });
    const ahead = composition.lines.filter((l) => l.ahead !== null);
    expect(ahead.length, fronted.name).to.be.greaterThan(0);
    const settled = ahead.flatMap((l) => l.ahead!.settledBy);
    expect(settled.some((i) => i.kind === "donation" && i.reason === "fronted")).to.equal(true);
  });

  it("finds the view and the recomputation equal, and every month's donations accounted for", async () => {
    const started = Date.now();
    const check = await api.reconciliation.monthly({ from: "2022-01", to: "2026-10" });
    console.log(`      reconciliation 2022-01..2026-10 in ${Date.now() - started} ms`);
    expect(check.checks.mismatchedCells).to.equal(0);
    expect(check.checks.monthsUnexplained).to.equal(0);
    for (const m of check.totals) {
      expect(fmt(sum([m.allocated, m.unassigned, m.difference])), m.month).to.equal(m.donations);
    }
    // Σ months per recipient = the balance query's allocations in the same period
    const fromBalance = await DAO.regranting.getBalances({
      at: "2026-10-31",
      inflowSince: "2021-12-31",
    });
    for (const r of check.recipients) {
      const inflow = sum(
        fromBalance.filter((b) => b.organizationId === r.organizationId).map((b) => b.inflowSince),
      );
      expect(r.allocated, r.name).to.equal(fmt(inflow));
    }
    expect(organizations.length).to.be.greaterThan(0);
  });
});
