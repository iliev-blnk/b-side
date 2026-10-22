export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [lo, hi], both inclusive. */
  int(lo: number, hi: number): number;
  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  /** An independent stream, so adding a part never shifts another part's notes. */
  fork(label: string): Rng;
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function rng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const next = () => {
    // sfc32
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (xs) => {
      if (xs.length === 0) throw new Error("pick from empty list");
      return xs[Math.floor(next() * xs.length)]!;
    },
    chance: (p) => next() < p,
    fork: (label) => rng(`${seed}/${label}`),
  };
}
