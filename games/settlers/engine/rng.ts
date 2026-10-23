// Deterministic PRNG (mulberry32). Any object with a numeric `rng` field
// (the game state, or a throwaway {rng: seed}) can be the source.

export interface RngSource { rng: number }

export function nextFloat(src: RngSource): number {
  src.rng = (src.rng + 0x6d2b79f5) >>> 0;
  let t = src.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(src: RngSource, lo: number, hi: number): number {
  return lo + Math.floor(nextFloat(src) * (hi - lo + 1));
}

export function shuffle<T>(src: RngSource, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(src) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick<T>(src: RngSource, arr: T[]): T {
  return arr[Math.floor(nextFloat(src) * arr.length)];
}

// Impure helper for callers (rooms, UI) that need a fresh seed. Never used inside the reducer.
export function newSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }
  return (Math.random() * 4294967296) >>> 0;
}
