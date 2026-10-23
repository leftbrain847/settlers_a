import { nextFloat, shuffle } from './rng.ts';
import type { RngSource } from './rng.ts';
import { topology } from './topology.ts';
import type { Topology } from './topology.ts';
import type { GameConfig, Hex } from './types.ts';

const RED = new Set([6, 8]);

export interface GeneratedBoard {
  hexes: Hex[]; ports: Record<number, string>; port_slots: [number, number, string][]; robber_hex: number | null;
}

/** Generate terrain, number tokens and ports. Consumes randomness from `src` (any {rng} holder). */
export function generateBoard(cfg: GameConfig, src: RngSource): GeneratedBoard {
  const tpl = cfg.board_template;
  const topo = topology(tpl.num_rings);

  const bag: string[] = [];
  for (const [terrain, n] of Object.entries(tpl.terrain_counts)) for (let i = 0; i < n; i++) bag.push(terrain);
  shuffle(src, bag);
  const first = Object.keys(tpl.terrain_counts)[0];
  while (bag.length < topo.hexes.length) bag.push(first);

  const hexes: Hex[] = topo.hexes.map((h, id) => ({
    id, terrain: bag[id] ?? 'desert', number_token: null, q: h.q, r: h.r,
  }));

  const producing: number[] = [];
  let desert: number | null = null;
  for (const h of hexes) {
    if (cfg.terrain_types[h.terrain]?.produces) producing.push(h.id);
    else desert = h.id;
  }

  const tryAssign = (): Map<number, number> | null => {
    const tokens = shuffle(src, [...tpl.number_tokens]);
    const assign = new Map<number, number>();
    for (let i = 0; i < Math.min(producing.length, tokens.length); i++) assign.set(producing[i], tokens[i]);
    for (const [hid, n] of assign) {
      if (!RED.has(n)) continue;
      for (const nb of topo.hexAdj[hid]) if (RED.has(assign.get(nb) ?? 0)) return null;
    }
    return assign;
  };
  let assignment: Map<number, number> | null = null;
  for (let i = 0; i < 100 && !assignment; i++) assignment = tryAssign();
  if (!assignment) {
    const tokens = shuffle(src, [...tpl.number_tokens]);
    assignment = new Map();
    for (let i = 0; i < Math.min(producing.length, tokens.length); i++) assignment.set(producing[i], tokens[i]);
  }
  for (const [hid, n] of assignment) hexes[hid].number_token = n;

  const { ports, port_slots } = assignPorts(cfg, topo, src);
  return { hexes, ports, port_slots, robber_hex: desert };
}

function assignPorts(cfg: GameConfig, topo: Topology, src: RngSource): { ports: Record<number, string>; port_slots: [number, number, string][] } {
  const tpl = cfg.board_template;
  const ports: Record<number, string> = {};
  const port_slots: [number, number, string][] = []; // [a, b, portType]: the two harbour intersections of each port
  const coastal = new Set(topo.intersections.filter((i) => i.hexIds.length < 3).map((i) => i.id));
  if (!coastal.size || !tpl.port_counts) return { ports, port_slots };

  const bag: string[] = [];
  for (const [id, n] of Object.entries(tpl.port_counts)) for (let i = 0; i < n; i++) bag.push(id);
  shuffle(src, bag);
  if (!bag.length) return { ports, port_slots };

  const exterior = topo.edges.filter((e) => coastal.has(e.a) && coastal.has(e.b));
  if (!exterior.length) return { ports, port_slots };

  const adj = new Map<number, [number, number][]>();
  for (const e of exterior) {
    const la = adj.get(e.a) ?? [];
    const lb = adj.get(e.b) ?? [];
    la.push([e.b, e.id]);
    lb.push([e.a, e.id]);
    adj.set(e.a, la);
    adj.set(e.b, lb);
  }

  let ordered: [number, number, number][] = [];
  const visited = new Set<number>();
  let current = exterior[0].a;
  for (let n = 0; n <= exterior.length; n++) {
    let moved = false;
    for (const [nb, eid] of adj.get(current) ?? []) {
      if (!visited.has(eid)) {
        ordered.push([eid, current, nb]);
        visited.add(eid);
        current = nb;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  if (!ordered.length) ordered = exterior.map((e) => [e.id, e.a, e.b]);

  const slots = ordered.length;
  const step = slots / bag.length;
  const offset = nextFloat(src) * step;
  const used = new Set<number>();
  let idx = 0;
  for (let i = 0; i < bag.length && idx < bag.length; i++) {
    const slot = Math.floor(offset + i * step) % slots;
    let found = false;
    for (let delta = 0; delta < slots && !found; delta++) {
      for (const dir of [delta, -delta]) {
        const [, a, b] = ordered[(((slot + dir) % slots) + slots) % slots];
        if (!used.has(a) && !used.has(b)) {
          const type = bag[idx]!;
          ports[a] = type;
          ports[b] = type;
          port_slots.push([a, b, type]);
          used.add(a); used.add(b);
          idx++;
          found = true;
          break;
        }
      }
    }
  }
  return { ports, port_slots };
}
