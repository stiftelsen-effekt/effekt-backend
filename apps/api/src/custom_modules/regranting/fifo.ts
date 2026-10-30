import { Decimal } from "decimal.js";
import type { IsoDate } from "./types";

/**
 * FIFO attribution of payments to the money that came in (docs/regranting.md, "What a transfer
 * contained"). A pure function over the ledger of one or more positions (recipient + project):
 *
 * - Every position has a pool of inflows (opening balance, allocations per day, donations passed
 *   on individually, fund grants in, positive adjustments) in date order.
 * - An outflow (transfer line, fund grant out, negative adjustment or refunds) first takes the
 *   inflows reserved for its own round (the donations a major-donor round passes on, the round's
 *   fund grants and adjustments, a fronted payment's donation), then the **oldest** unreserved
 *   inflow, never anything dated after its `eligibleUpTo` (a round's cutoff).
 * - What an outflow can't cover is paid ahead (a deficit: the balance went negative, e.g. a
 *   fronted payment). Money that arrived after the cutoff but before the payment covers it at
 *   once; after that the next inflows settle deficits before anything else, an inflow reserved
 *   for that outflow's round first.
 * - A reservation ends when its round is processed (`release`): what the round didn't use is
 *   ordinary money from then on.
 *
 * Amounts are exact Decimals; nothing is rounded here.
 */

export type FifoInflow<S = unknown> = {
  id: string;
  position: string;
  date: IsoDate;
  /** Positive */
  amount: Decimal;
  /** Only this round's outflows may take it until the round is released */
  reservedFor: number | null;
  source: S;
};

export type FifoOutflow<T = unknown> = {
  id: string;
  position: string;
  /** Positive */
  amount: Decimal;
  /** Inflows dated after this day can't be used (a round's cutoff; the entry's date otherwise) */
  eligibleUpTo: IsoDate;
  /** Takes the inflows reserved for this round first */
  roundId: number | null;
  /** Returned in the results (transfer lines); other outflows only consume */
  trace: boolean;
  tag: T;
};

/** Processing order: date, then phase (inflows 0 … releases last), then n */
export type FifoKey = [date: string, phase: number, n: number];

export type FifoEvent<S, T> =
  | { type: "in"; key: FifoKey; inflow: FifoInflow<S> }
  | { type: "out"; key: FifoKey; outflow: FifoOutflow<T> }
  | { type: "release"; key: FifoKey; roundId: number };

export type FifoTake<S> = {
  inflow: FifoInflow<S>;
  amount: Decimal;
  /** What was left of the inflow before this take (less than its amount: shared with an earlier outflow) */
  remainingBefore: Decimal;
};

export type FifoResult<S, T> = {
  outflow: FifoOutflow<T>;
  /** Inflows it took, in the order taken (reserved first, then oldest first) */
  taken: FifoTake<S>[];
  /** Paid ahead of the money: amount − Σ taken */
  ahead: Decimal;
  /** Later inflows that settled the amount paid ahead, in order */
  settledBy: FifoTake<S>[];
  /** The previous traced outflow at the position from another round (null for the first) */
  previous: FifoOutflow<T> | null;
  /** Eligible money left at the position after its round was processed: carries over */
  leftAfter: { amount: Decimal; oldest: IsoDate | null };
};

type Chunk<S> = { inflow: FifoInflow<S>; remaining: Decimal };
type Deficit<S, T> = { result: FifoResult<S, T>; remaining: Decimal };

const compareKeys = (a: FifoKey, b: FifoKey) =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2];

export function runFifo<S, T>(events: FifoEvent<S, T>[]): FifoResult<S, T>[] {
  const sorted = [...events].sort((a, b) => compareKeys(a.key, b.key));
  const pools = new Map<string, Chunk<S>[]>();
  const deficits = new Map<string, Deficit<S, T>[]>();
  const lastTraced = new Map<string, FifoOutflow<T>>();
  const released = new Set<number>();
  const results: FifoResult<S, T>[] = [];
  /** Traced results waiting for their round's release to know what's left over */
  const awaitingRelease = new Map<number, FifoResult<S, T>[]>();

  const pool = (position: string) => {
    let p = pools.get(position);
    if (!p) pools.set(position, (p = []));
    return p;
  };
  const free = (chunk: Chunk<S>) =>
    chunk.inflow.reservedFor === null || released.has(chunk.inflow.reservedFor);

  const take = (chunk: Chunk<S>, need: Decimal, into: FifoTake<S>[]): Decimal => {
    const amount = Decimal.min(chunk.remaining, need);
    if (amount.lte(0)) return need;
    into.push({ inflow: chunk.inflow, amount, remainingBefore: chunk.remaining });
    chunk.remaining = chunk.remaining.minus(amount);
    return need.minus(amount);
  };

  const leftOver = (position: string, upTo: IsoDate) => {
    let amount = new Decimal(0);
    let oldest: IsoDate | null = null;
    for (const chunk of pools.get(position) ?? []) {
      if (chunk.inflow.date > upTo || !free(chunk) || chunk.remaining.lte(0)) continue;
      amount = amount.plus(chunk.remaining);
      if (oldest === null || chunk.inflow.date < oldest) oldest = chunk.inflow.date;
    }
    return { amount, oldest };
  };

  for (const event of sorted) {
    if (event.type === "release") {
      released.add(event.roundId);
      for (const result of awaitingRelease.get(event.roundId) ?? []) {
        result.leftAfter = leftOver(result.outflow.position, result.outflow.eligibleUpTo);
      }
      awaitingRelease.delete(event.roundId);
      continue;
    }

    if (event.type === "in") {
      const inflow = event.inflow;
      let amount = inflow.amount;
      const reservedPending = inflow.reservedFor !== null && !released.has(inflow.reservedFor);
      const open = deficits.get(inflow.position) ?? [];
      // A reserved inflow settles only its own round's deficits until the round is released
      const order = [
        ...open.filter(
          (d) => inflow.reservedFor !== null && d.result.outflow.roundId === inflow.reservedFor,
        ),
        ...(reservedPending
          ? []
          : open.filter(
              (d) => inflow.reservedFor === null || d.result.outflow.roundId !== inflow.reservedFor,
            )),
      ];
      for (const deficit of order) {
        if (amount.lte(0)) break;
        const part = Decimal.min(amount, deficit.remaining);
        deficit.result.settledBy.push({ inflow, amount: part, remainingBefore: amount });
        deficit.remaining = deficit.remaining.minus(part);
        amount = amount.minus(part);
      }
      deficits.set(
        inflow.position,
        open.filter((d) => d.remaining.gt(0)),
      );
      if (amount.gt(0)) pool(inflow.position).push({ inflow, remaining: amount });
      continue;
    }

    const outflow = event.outflow;
    const chunks = pool(outflow.position);
    const result: FifoResult<S, T> = {
      outflow,
      taken: [],
      ahead: new Decimal(0),
      settledBy: [],
      previous: null,
      leftAfter: { amount: new Decimal(0), oldest: null },
    };
    let need = outflow.amount;
    if (outflow.roundId !== null) {
      for (const chunk of chunks) {
        if (need.lte(0)) break;
        if (chunk.inflow.reservedFor !== outflow.roundId || released.has(outflow.roundId)) continue;
        if (chunk.inflow.date > outflow.eligibleUpTo) continue;
        need = take(chunk, need, result.taken);
      }
    }
    for (const chunk of chunks) {
      if (need.lte(0)) break;
      if (chunk.inflow.date > outflow.eligibleUpTo) break;
      if (!free(chunk)) continue;
      need = take(chunk, need, result.taken);
    }
    if (need.gt(0)) {
      result.ahead = need;
      // Money that came in after the cutoff but before the payment covers it straight away
      for (const chunk of chunks) {
        if (need.lte(0)) break;
        if (chunk.inflow.date <= outflow.eligibleUpTo || !free(chunk)) continue;
        need = take(chunk, need, result.settledBy);
      }
      if (need.gt(0)) {
        const open = deficits.get(outflow.position) ?? [];
        open.push({ result, remaining: need });
        deficits.set(outflow.position, open);
      }
    }
    pools.set(
      outflow.position,
      chunks.filter((c) => c.remaining.gt(0)),
    );
    if (outflow.trace) {
      const previous = lastTraced.get(outflow.position) ?? null;
      result.previous =
        previous && previous.roundId === outflow.roundId
          ? (results.find((r) => r.outflow === previous)?.previous ?? null)
          : previous;
      lastTraced.set(outflow.position, outflow);
      results.push(result);
      if (outflow.roundId !== null && !released.has(outflow.roundId)) {
        const waiting = awaitingRelease.get(outflow.roundId) ?? [];
        waiting.push(result);
        awaitingRelease.set(outflow.roundId, waiting);
      } else {
        result.leftAfter = leftOver(outflow.position, outflow.eligibleUpTo);
      }
    }
  }
  // Rounds never released (shouldn't happen): what's left now
  for (const waiting of awaitingRelease.values()) {
    for (const result of waiting) {
      result.leftAfter = leftOver(result.outflow.position, result.outflow.eligibleUpTo);
    }
  }
  return results;
}

/**
 * Rounds exact amounts to øre so they add up to `total` exactly (largest remainder): each is
 * within 1 øre of its exact value. `total` defaults to the rounded exact sum.
 */
export function apportion(exact: Decimal[], total?: Decimal): Decimal[] {
  const target = (total ?? exact.reduce((s, v) => s.plus(v), new Decimal(0))).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
  const rounded = exact.map((v) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  let diff = target.minus(rounded.reduce((s, v) => s.plus(v), new Decimal(0)));
  if (diff.isZero() || exact.length === 0) return rounded;
  const step = new Decimal(diff.isPositive() ? "0.01" : "-0.01");
  // Who gets the øre: the largest gap between exact and rounded, in the direction needed
  const order = exact
    .map((v, i) => ({ i, gap: v.minus(rounded[i]!) }))
    .sort((a, b) => (step.isPositive() ? b.gap.comparedTo(a.gap) : a.gap.comparedTo(b.gap)));
  let k = 0;
  while (!diff.isZero() && order.length > 0) {
    const { i } = order[k % order.length]!;
    rounded[i] = rounded[i]!.plus(step);
    diff = diff.minus(step);
    k++;
  }
  return rounded;
}
