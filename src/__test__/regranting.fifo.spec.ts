import { expect } from "chai";
import { Decimal } from "decimal.js";
import {
  apportion,
  runFifo,
  type FifoEvent,
  type FifoKey,
} from "../custom_modules/regranting/fifo";

type Source = { label: string };
type Tag = { label: string };
type Ev = FifoEvent<Source, Tag>;

const P = "1:";
let n = 0;
const inflow = (
  date: string,
  amount: string,
  label: string,
  reservedFor: number | null = null,
): Ev => ({
  type: "in",
  key: [date, 0, n++] as FifoKey,
  inflow: {
    id: label,
    position: P,
    date,
    amount: new Decimal(amount),
    reservedFor,
    source: { label },
  },
});
const transfer = (
  date: string,
  amount: string,
  roundId: number,
  cutoff: string,
  label = `r${roundId}`,
): Ev => ({
  type: "out",
  key: [date, 2, n++] as FifoKey,
  outflow: {
    id: label,
    position: P,
    amount: new Decimal(amount),
    eligibleUpTo: cutoff,
    roundId,
    trace: true,
    tag: { label },
  },
});
const release = (date: string, roundId: number): Ev => ({
  type: "release",
  key: [date, 3, n++] as FifoKey,
  roundId,
});

const takes = (result: ReturnType<typeof runFifo<Source, Tag>>[number]) =>
  result.taken.map((t) => `${t.inflow.source.label}:${t.amount.toFixed(2)}`);

describe("regranting FIFO attribution", () => {
  it("pays the oldest money first and carries the rest over", () => {
    const [q1, q2] = runFifo<Source, Tag>([
      inflow("2026-01-15", "100", "jan"),
      inflow("2026-02-15", "200", "feb"),
      inflow("2026-03-15", "300", "mar"),
      transfer("2026-04-10", "250", 1, "2026-03-31"),
      release("2026-04-10", 1),
      inflow("2026-04-15", "400", "apr"),
      transfer("2026-07-10", "750", 2, "2026-06-30"),
      release("2026-07-10", 2),
    ]);
    expect(takes(q1!)).to.deep.equal(["jan:100.00", "feb:150.00"]);
    expect(q1!.leftAfter.amount.toFixed(2)).to.equal("350.00");
    expect(q1!.leftAfter.oldest).to.equal("2026-02-15");
    expect(takes(q2!)).to.deep.equal(["feb:50.00", "mar:300.00", "apr:400.00"]);
    expect(q2!.previous?.tag.label).to.equal("r1");
    expect(q2!.ahead.isZero()).to.equal(true);
  });

  it("never uses money that came in after the cutoff", () => {
    const [q] = runFifo<Source, Tag>([
      inflow("2026-03-15", "100", "mar"),
      inflow("2026-04-02", "500", "apr"),
      transfer("2026-04-10", "150", 1, "2026-03-31"),
      release("2026-04-10", 1),
    ]);
    expect(takes(q!)).to.deep.equal(["mar:100.00"]);
    expect(q!.ahead.toFixed(2)).to.equal("50.00");
    // April money that was already in when it was paid covers what was paid ahead
    expect(
      q!.settledBy.map((t) => `${t.inflow.source.label}:${t.amount.toFixed(2)}`),
    ).to.deep.equal(["apr:50.00"]);
  });

  it("settles a payment made ahead with the next money, its own donation first", () => {
    const [fronted] = runFifo<Source, Tag>([
      inflow("2026-05-01", "10", "small"),
      transfer("2026-06-05", "1000", 9, "2026-06-01"),
      release("2026-06-05", 9),
      inflow("2026-06-10", "40", "other"),
      inflow("2026-06-20", "1000", "pledged", 9),
    ]);
    expect(takes(fronted!)).to.deep.equal(["small:10.00"]);
    expect(fronted!.ahead.toFixed(2)).to.equal("990.00");
    expect(
      fronted!.settledBy.map((t) => `${t.inflow.source.label}:${t.amount.toFixed(2)}`),
    ).to.deep.equal(["other:40.00", "pledged:950.00"]);
  });

  it("passes on a major donor's donation first and doesn't pay it again later", () => {
    const [major, regular] = runFifo<Source, Tag>([
      inflow("2026-08-10", "300", "aug"),
      inflow("2026-09-28", "5000", "major", 5),
      inflow("2026-09-29", "200", "sep"),
      transfer("2026-10-02", "5000", 5, "2026-10-01"),
      release("2026-10-02", 5),
      transfer("2026-10-15", "500", 6, "2026-09-30"),
      release("2026-10-15", 6),
    ]);
    expect(takes(major!)).to.deep.equal(["major:5000.00"]);
    expect(takes(regular!)).to.deep.equal(["aug:300.00", "sep:200.00"]);
  });

  it("keeps a reserved donation away from other rounds until its round is done", () => {
    const [other, major, later] = runFifo<Source, Tag>([
      inflow("2026-09-01", "5000", "major", 5),
      inflow("2026-09-02", "100", "small"),
      transfer("2026-09-20", "100", 4, "2026-09-15"),
      release("2026-09-20", 4),
      // The major-donor round is capped: it passes on only 3000
      transfer("2026-09-25", "3000", 5, "2026-09-24"),
      release("2026-09-25", 5),
      transfer("2026-12-10", "2000", 6, "2026-11-30"),
      release("2026-12-10", 6),
    ]);
    expect(takes(other!)).to.deep.equal(["small:100.00"]);
    expect(takes(major!)).to.deep.equal(["major:3000.00"]);
    // What it didn't use is ordinary money afterwards
    expect(takes(later!)).to.deep.equal(["major:2000.00"]);
  });

  it("handles a skipped round (min transfer, hold) as carry-over", () => {
    const [first, third] = runFifo<Source, Tag>([
      inflow("2026-01-10", "100", "jan"),
      transfer("2026-02-10", "100", 1, "2026-01-31"),
      release("2026-02-10", 1),
      inflow("2026-02-10", "50", "feb"),
      // round 2 (April) didn't pay this recipient
      release("2026-05-10", 2),
      inflow("2026-05-10", "70", "may"),
      transfer("2026-08-10", "120", 3, "2026-07-31"),
      release("2026-08-10", 3),
    ]);
    expect(takes(first!)).to.deep.equal(["jan:100.00"]);
    expect(third!.previous?.tag.label).to.equal("r1");
    expect(takes(third!)).to.deep.equal(["feb:50.00", "may:70.00"]);
  });
});

describe("apportion", () => {
  const d = (values: string[]) => values.map((v) => new Decimal(v));
  const sumOf = (values: Decimal[]) =>
    values.reduce((s, v) => s.plus(v), new Decimal(0)).toFixed(2);

  it("rounds parts so they add up to the rounded total", () => {
    const parts = apportion(d(["0.333333", "0.333333", "0.333334"]));
    expect(sumOf(parts)).to.equal("1.00");
    expect(parts.map((p) => p.toFixed(2))).to.deep.equal(["0.33", "0.33", "0.34"]);
  });

  it("hits a given total exactly, each part within an øre", () => {
    const exact = d(["10.005", "20.005", "30.005", "-5.005"]);
    const parts = apportion(exact, new Decimal("55.01"));
    expect(sumOf(parts)).to.equal("55.01");
    parts.forEach((p, i) => expect(p.minus(exact[i]!).abs().lte("0.01")).to.equal(true));
  });

  it("leaves already-exact amounts alone", () => {
    expect(apportion(d(["1.50", "2.25"])).map((p) => p.toFixed(2))).to.deep.equal(["1.50", "2.25"]);
  });
});
