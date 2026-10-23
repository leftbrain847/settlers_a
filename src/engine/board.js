import { nextFloat, shuffle } from './rng.js';
import { topology } from './topology.js';

const RED = new Set([6, 8]);

/**
 * Generate terrain, number tokens and ports. Consumes randomness from `src` (any {rng} holder).
 * @returns {{ hexes: import('./types.js').Hex[], ports: Record<number,string>, robber_hex: number|null }}
 */
export function generateBoard(cfg, src) {
  const tpl = cfg.board_template;
  const topo = topology(tpl.num_rings);

  const bag = [];
  for (const [terrain, n] of Object.entries(tpl.terrain_counts)) for (let i = 0; i < n; i++) bag.push(terrain);
  shuffle(src, bag);
  const first = Object.keys(tpl.terrain_counts)[0];
  while (bag.length < topo.hexes.length) bag.push(first);

  const hexes = topo.hexes.map((h, id) => ({
    id, terrain: bag[id] ?? 'desert', number_token: null, q: h.q, r: h.r,
  }));

  const producing = [];
  let desert = null;
  for (const h of hexes) {
    if (cfg.terrain_types[h.terrain]?.produces) producing.push(h.id);
    else desert = h.id;
  }

  const tryAssign = () => {
    const tokens = shuffle(src, [...tpl.number_tokens]);
    const assign = new Map();
    for (let i = 0; i < Math.min(producing.length, tokens.length); i++) assign.set(producing[i], tokens[i]);
    for (const [hid, n] of assign) {
      if (!RED.has(n)) continue;
      for (const nb of topo.hexAdj[hid]) if (RED.has(assign.get(nb))) return null;
    }
    return assign;
  };
  let assignment = null;
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

function assignPorts(cfg, topo, src) {
  const tpl = cfg.board_template;
  const ports = {};
  const port_slots = []; // [a, b, portType]: the two harbour intersections of each port
  const coastal = new Set(topo.intersections.filter((i) => i.hexIds.length < 3).map((i) => i.id));
  if (!coastal.size || !tpl.port_counts) return { ports, port_slots };

  const bag = [];
  for (const [id, n] of Object.entries(tpl.port_counts)) for (let i = 0; i < n; i++) bag.push(id);
  shuffle(src, bag);
  if (!bag.length) return { ports, port_slots };

  const exterior = topo.edges.filter((e) => coastal.has(e.a) && coastal.has(e.b));
  if (!exterior.length) return { ports, port_slots };

  const adj = new Map();
  for (const e of exterior) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push([e.b, e.id]);
    adj.get(e.b).push([e.a, e.id]);
  }

  let ordered = [];
  const visited = new Set();
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
  const used = new Set();
  let idx = 0;
  for (let i = 0; i < bag.length && idx < bag.length; i++) {
    const slot = Math.floor(offset + i * step) % slots;
    let found = false;
    for (let delta = 0; delta < slots && !found; delta++) {
      for (const dir of [delta, -delta]) {
        const [, a, b] = ordered[(((slot + dir) % slots) + slots) % slots];
        if (!used.has(a) && !used.has(b)) {
          ports[a] = bag[idx];
          ports[b] = bag[idx];
          port_slots.push([a, b, bag[idx]]);
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
