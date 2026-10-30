import { expect } from "chai";
import { toDay } from "../../prisma/devdata/calendar";
import { generate, type Dataset } from "../../prisma/devdata/generate";
import { onwardFigures } from "../custom_modules/regranting/onward";
import type { OnwardBasis } from "../custom_modules/regranting/types";

/**
 * The regranting history in the local dev data (prisma/devdata/regranting.ts). The generator
 * runs the backend's proposal and validation rules while it builds the rounds, so a change to
 * those rules that breaks the seeded history shows up here instead of in `pnpm dev:env:reset`.
 */
describe("dev data: regranting history", function () {
  this.timeout(20000);
  const start = toDay("2021-10-01");
  const end = toDay("2026-10-27");
  let data: Dataset;

  before(() => {
    data = generate({ seed: "effekt-dev", start, end, scale: 0.3 });
  });

  const rounds = () => data.Regrant_rounds;
  const sum = (values: (string | number | null)[]) =>
    Math.round(values.reduce<number>((s, v) => s + Number(v), 0) * 100);

  it("has paid regular rounds every three months, the last about three months ago", () => {
    const regular = rounds().filter((r) => r.kind === "regular");
    expect(regular.length).to.be.greaterThan(15);
    expect(regular.every((r) => r.status === "paid")).to.be.true;
    const last = toDay(String(regular[regular.length - 1].cutoff));
    expect(end - last).to.be.within(75, 110);
  });

  it("covers every round kind and lifecycle state", () => {
    expect(new Set(rounds().map((r) => r.kind))).to.deep.equal(
      new Set(["regular", "major_donor", "fund_grant", "extraordinary"]),
    );
    const open = rounds().filter((r) => r.status !== "paid");
    expect(open.map((r) => [r.kind, r.status])).to.deep.equal([
      ["major_donor", "approved"],
      ["fund_grant", "draft"],
    ]);
    for (const r of rounds().filter((x) => x.approved_by !== null)) {
      expect(r.approved_by).to.not.equal(r.created_by);
    }
  });

  it("writes transfers whose lines add up, never to an own fund", () => {
    for (const t of data.Regrant_transfers) {
      const lines = data.Regrant_transfer_lines.filter((l) => l.Transfer_ID === t.ID);
      expect(sum(lines.map((l) => l.amount_nok)), `transfer ${t.ID}`).to.equal(sum([t.amount_nok]));
      expect(lines.some((l) => l.Organization_ID === 18)).to.be.false;
    }
  });

  it("links the fronted payment to the donation that arrived later", () => {
    const fronted = data.Regrant_adjustments.filter((a) => a.type === "fronted");
    expect(fronted).to.have.length(1);
    const donation = data.Donations.find((d) => d.ID === fronted[0].linked_donation_ID)!;
    expect(String(donation.timestamp_confirmed).slice(0, 10) > String(fronted[0].effective_at)).to
      .be.true;
  });

  it("covers the adjustment types", () => {
    expect(new Set(data.Regrant_adjustments.map((a) => a.type))).to.deep.equal(
      new Set(["opening", "own_funds", "reallocation", "fronted", "fee", "correction"]),
    );
  });

  it("has GiveWell lines forwarded, partly forwarded, assumed and awaiting, and one TCF split", () => {
    const givewell = data.Intermediary_payees.map((i) => i.Payee_ID);
    expect(givewell).to.have.length(1);
    const paid = data.Regrant_transfers.filter((t) => t.Payee_ID === givewell[0] && t.paid_at);
    const lines = data.Regrant_transfer_lines.filter((l) =>
      paid.some((t) => t.ID === l.Transfer_ID),
    );
    const statuses = new Map<string, number>();
    for (const line of lines) {
      const allocations = data.Onward_allocations.filter((a) => a.Transfer_line_ID === line.ID);
      const figures = onwardFigures(
        Number(line.amount_nok).toFixed(2),
        allocations.map((a) => ({
          basis: a.basis as OnwardBasis,
          amountNok: String(a.amount_nok),
        })),
      );
      expect(Number(figures.awaitingNok), `line ${line.ID}`).to.be.at.least(0);
      statuses.set(figures.status, (statuses.get(figures.status) ?? 0) + 1);
    }
    expect([...statuses.keys()].sort()).to.deep.equal([
      "awaiting",
      "forwarded",
      "forwarded_assumed",
      "partly_forwarded",
    ]);
    const grantee = data.Onward_allocations.filter((a) => a.External_grantee_ID !== null);
    expect(grantee).to.have.length(1);
    const tcfLine = data.Regrant_transfer_lines.find((l) => l.ID === grantee[0].Transfer_line_ID)!;
    expect(tcfLine.Organization_ID).to.equal(2);
    expect(data.Onward_allocations.filter((a) => a.Transfer_line_ID === tcfLine.ID)).to.have.length(
      5,
    );
    expect(data.Onward_allocations.every((a) => a.basis === "reported" || a.Report_ID === null)).to
      .be.true;
    expect(data.Regrant_documents.filter((d) => d.Onward_report_ID !== null)).to.have.length(
      data.Onward_reports.length,
    );
  });

  it("reproduces the same history when topped up later", () => {
    const later = generate({ seed: "effekt-dev", start, end: end + 30, scale: 0.3, anchor: end });
    for (const table of [
      "Regrant_rounds",
      "Regrant_transfers",
      "Regrant_adjustments",
      "Onward_reports",
      "Onward_allocations",
    ]) {
      expect(later[table], table).to.deep.equal(data[table]);
    }
  });
});
