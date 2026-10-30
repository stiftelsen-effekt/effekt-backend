/**
 * Deterministic randomness for the dev data generator.
 *
 * Every random decision draws from a stream derived from (seed, purpose, ids...), never from a
 * shared sequence. That keeps the output for a given day independent of how far the simulation
 * runs, which is what lets `topup` regenerate an earlier snapshot exactly.
 */

/** 32-bit FNV-1a over the joined parts */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(...parts: (string | number)[]) {
    // sfc32 seeded from four independent hashes
    this.a = hash32("a", ...parts);
    this.b = hash32("b", ...parts);
    this.c = hash32("c", ...parts);
    this.d = hash32("d", ...parts) | 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform in [0, 1) */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Picks a key of `weights` proportionally to its value (keys come back as strings) */
  weighted(weights: Readonly<Record<string | number, number>>): string {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = this.next() * total;
    for (const [key, w] of entries) {
      r -= w;
      if (r < 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  /** `weighted` for numeric keys */
  weightedNum(weights: Readonly<Record<number, number>>): number {
    return Number(this.weighted(weights));
  }

  /** Standard normal (Box-Muller) */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Poisson-distributed count (Knuth for small means, normal approximation above 30) */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.normal()));
    const limit = Math.exp(-mean);
    let k = 0;
    let p = this.next();
    while (p > limit) {
      k++;
      p *= this.next();
    }
    return k;
  }

  /** Geometric number of whole months survived with a constant monthly hazard */
  monthsUntil(monthlyHazard: number): number {
    if (monthlyHazard <= 0) return Infinity;
    return Math.floor(Math.log(Math.max(this.next(), 1e-12)) / Math.log(1 - monthlyHazard));
  }
}
