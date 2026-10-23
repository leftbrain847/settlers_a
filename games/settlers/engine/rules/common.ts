import { topology } from '../topology.ts';
import type { BuildingType, GameConfig, GameState, Player, ResMap } from '../types.ts';

export const SYSTEM = '__system__';

/** Nothing but the pending decision may happen while discards, a robber move/steal or a card choice is outstanding. */
export function pendingError(s: GameState): string | null {
  if (Object.keys(s.pending_discards).length) return 'Waiting for players to discard';
  if (s.pending_robber_move || s.pending_robber_steal) return 'Must resolve robber first';
  if (s.pending_action) return 'Must resolve pending action first';
  return null;
}

export function validResMap(cfg: GameConfig, m: unknown): m is ResMap {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const entries = Object.entries(m as Record<string, unknown>);
  if (!entries.length) return false;
  return entries.every(([k, v]) => k in cfg.resource_types && typeof v === 'number' && Number.isInteger(v) && v > 0);
}

export function hasAll(player: Pick<Player, 'resources'>, map: ResMap): boolean {
  for (const [r, n] of Object.entries(map)) if ((player.resources[r] ?? 0) < n) return false;
  return true;
}

export const sumVals = (m: ResMap): number => Object.values(m).reduce((a, b) => a + b, 0);

export function owns(s: GameState, pid: string, kind: 'i' | 'e', id: number): boolean {
  return s.board.buildings[kind][id]?.player === pid;
}

/** Can `pid` extend their road network onto edge `eid`? (opponent buildings cut the network) */
export function edgeConnects(s: GameState, pid: string, eid: number): boolean {
  const topo = topology(s.board.rings);
  const { a, b } = topo.edges[eid]!;
  for (const iid of [a, b]) {
    const occ = s.board.buildings.i[iid];
    if (occ?.player === pid) return true;
    for (const adj of topo.interEdges[iid]!) {
      if (adj === eid) continue;
      if (s.board.buildings.e[adj]?.player === pid) {
        if (occ && occ.player !== pid) continue;
        return true;
      }
    }
  }
  return false;
}

export function tooCloseToBuilding(s: GameState, iid: number): boolean {
  const topo = topology(s.board.rings);
  return topo.adjInter[iid]!.some((n) => s.board.buildings.i[n]);
}

/** Non-setup placement rules. Returns an error string or null. */
export function placementError(s: GameState, pid: string, bt: BuildingType, loc: unknown): string | null {
  const topo = topology(s.board.rings);
  const pl = bt.placement;
  if (pl.location_type === 'intersection') {
    if (typeof loc !== 'number' || !Number.isInteger(loc) || loc < 0 || loc >= topo.intersections.length) return 'Invalid intersection';
    const occ = s.board.buildings.i[loc];
    if (pl.upgrades_from) {
      if (!occ || occ.type !== pl.upgrades_from) return `Must upgrade from ${pl.upgrades_from}`;
      if (occ.player !== pid) return 'Can only upgrade your own buildings';
      return null;
    }
    if (pl.must_be_empty && occ) return 'Intersection already occupied';
    if (pl.distance_rule > 0 && tooCloseToBuilding(s, loc)) return 'Too close to another building';
    if (pl.requires_connected_road && !topo.interEdges[loc]!.some((e) => s.board.buildings.e[e]?.player === pid)) {
      return 'Must be connected to your road network';
    }
    return null;
  }
  if (pl.location_type === 'edge') {
    if (typeof loc !== 'number' || !Number.isInteger(loc) || loc < 0 || loc >= topo.edges.length) return 'Invalid edge';
    if (pl.must_be_empty && s.board.buildings.e[loc]) return 'Edge already occupied';
    if (!edgeConnects(s, pid, loc)) return 'Road must connect to your network';
    return null;
  }
  return 'This cannot be placed';
}
