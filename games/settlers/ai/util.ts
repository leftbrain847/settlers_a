import { nextFloat, randInt } from '../engine/rng.ts';
import type { RngSource } from '../engine/rng.ts';
import type { Topology } from '../engine/topology.ts';
import type { Action, GameView, LegalAction, LegalOf, PlayerView, ResMap } from '../engine/types.ts';

export type SelfView = PlayerView & { resources: ResMap; dev_cards: string[]; hidden_vp: number };

/** The bot's own seat, which a view always shows in full. */
export function selfView(view: GameView): SelfView {
  const p = view.players[view.me];
  if (!p || !p.resources || !p.dev_cards) throw new Error('view has no private data for the viewer');
  return p as SelfView;
}

export const chance = (rng: RngSource, p: number): boolean => nextFloat(rng) < p;
export const choice = <T>(rng: RngSource, arr: T[]): T => arr[randInt(rng, 0, arr.length - 1)]!;

export function legalToAction(la: LegalAction, pid: string): Action {
  const { type, ...params } = la;
  return { type, player_id: pid, params } as Action;
}

export type Grouped = { [K in LegalAction['type']]?: LegalOf<K>[] };

export function groupByType(legal: LegalAction[]): Grouped {
  const by: Record<string, LegalAction[]> = {};
  for (const a of legal) (by[a.type] ??= []).push(a);
  return by as Grouped;
}

export function sumVals(m: ResMap): number {
  return Object.values(m).reduce((a, b) => a + b, 0);
}

// Pip count: 5 for a 6/8 ... 1 for a 2/12.
export function hexValue(view: GameView, hid: number): number {
  const h = view.board.hexes[hid];
  if (!h || !h.number_token || view.board.robber_hex === hid) return 0;
  return Math.max(0, 6 - Math.abs(7 - h.number_token));
}

export function scoreIntersection(view: GameView, topo: Topology, iid: number): number {
  return topo.intersections[iid]!.hexIds.reduce((acc, hid) => acc + hexValue(view, hid), 0);
}

export function maxBy<T>(arr: T[], key: (x: T) => number): T | null {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const x of arr) { const v = key(x); if (v > bestV) { bestV = v; best = x; } }
  return best;
}
