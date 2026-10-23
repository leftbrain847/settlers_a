import { nextFloat, randInt } from '../engine/rng.js';

export const chance = (rng, p) => nextFloat(rng) < p;
export const choice = (rng, arr) => arr[randInt(rng, 0, arr.length - 1)];

export function legalToAction(la, pid) {
  const { type, ...params } = la;
  return { type, player_id: pid, params };
}

export function groupByType(legal) {
  const by = {};
  for (const a of legal) (by[a.type] ??= []).push(a);
  return by;
}

export function sumVals(m) {
  return Object.values(m).reduce((a, b) => a + b, 0);
}

// Pip count: 5 for a 6/8 ... 1 for a 2/12.
export function hexValue(view, hid) {
  const h = view.board.hexes[hid];
  if (!h || !h.number_token || view.board.robber_hex === hid) return 0;
  return Math.max(0, 6 - Math.abs(7 - h.number_token));
}

export function scoreIntersection(view, topo, iid) {
  return topo.intersections[iid].hexIds.reduce((acc, hid) => acc + hexValue(view, hid), 0);
}

export function maxBy(arr, key) {
  let best = null, bestV = -Infinity;
  for (const x of arr) { const v = key(x); if (v > bestV) { bestV = v; best = x; } }
  return best;
}
