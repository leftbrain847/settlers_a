import { topology } from '../topology.js';

export const SYSTEM = '__system__';

export function validResMap(cfg, m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const entries = Object.entries(m);
  if (!entries.length) return false;
  return entries.every(([k, v]) => k in cfg.resource_types && Number.isInteger(v) && v > 0);
}

export function hasAll(player, map) {
  for (const [r, n] of Object.entries(map)) if ((player.resources[r] ?? 0) < n) return false;
  return true;
}

export const sumVals = (m) => Object.values(m).reduce((a, b) => a + b, 0);

export function owns(s, pid, kind, id) {
  return s.board.buildings[kind][id]?.player === pid;
}

/** Can `pid` extend their road network onto edge `eid`? (opponent buildings cut the network) */
export function edgeConnects(s, pid, eid) {
  const topo = topology(s.board.rings);
  const { a, b } = topo.edges[eid];
  for (const iid of [a, b]) {
    const occ = s.board.buildings.i[iid];
    if (occ?.player === pid) return true;
    for (const adj of topo.interEdges[iid]) {
      if (adj === eid) continue;
      if (s.board.buildings.e[adj]?.player === pid) {
        if (occ && occ.player !== pid) continue;
        return true;
      }
    }
  }
  return false;
}

export function tooCloseToBuilding(s, iid) {
  const topo = topology(s.board.rings);
  return topo.adjInter[iid].some((n) => s.board.buildings.i[n]);
}

/** Non-setup placement rules. Returns an error string or null. */
export function placementError(s, pid, bt, loc) {
  const topo = topology(s.board.rings);
  const pl = bt.placement;
  if (pl.location_type === 'intersection') {
    if (!Number.isInteger(loc) || loc < 0 || loc >= topo.intersections.length) return 'Invalid intersection';
    const occ = s.board.buildings.i[loc];
    if (pl.upgrades_from) {
      if (!occ || occ.type !== pl.upgrades_from) return `Must upgrade from ${pl.upgrades_from}`;
      if (occ.player !== pid) return 'Can only upgrade your own buildings';
      return null;
    }
    if (pl.must_be_empty && occ) return 'Intersection already occupied';
    if (pl.distance_rule > 0 && tooCloseToBuilding(s, loc)) return 'Too close to another building';
    if (pl.requires_connected_road && !topo.interEdges[loc].some((e) => s.board.buildings.e[e]?.player === pid)) {
      return 'Must be connected to your road network';
    }
    return null;
  }
  if (pl.location_type === 'edge') {
    if (!Number.isInteger(loc) || loc < 0 || loc >= topo.edges.length) return 'Invalid edge';
    if (pl.must_be_empty && s.board.buildings.e[loc]) return 'Edge already occupied';
    if (!edgeConnects(s, pid, loc)) return 'Road must connect to your network';
    return null;
  }
  return 'This cannot be placed';
}
