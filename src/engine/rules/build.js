import { topology } from '../topology.js';
import { addLog, roadType, settlementType } from '../state.js';
import { hasAll, placementError, tooCloseToBuilding } from './common.js';

export function buildError(cfg, s, a) {
  if (s.phase === 'setup') return setupBuildError(cfg, s, a);
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (a.player_id !== s.player_order[s.current_player_idx]) return 'Not your turn';
  if (!s.dice_rolled) return 'Must roll dice first';
  if (Object.keys(s.pending_discards).length) return 'Waiting for players to discard';
  if (s.pending_robber_move || s.pending_robber_steal) return 'Must resolve robber first';

  const bt = cfg.building_types[a.params.building_type];
  if (!bt) return `Unknown building type: ${a.params.building_type}`;
  if (bt.placement.location_type === 'none') return 'That cannot be built on the board';
  const p = s.players[a.player_id];
  if ((p.buildings_placed[bt.id] ?? 0) >= bt.max_per_player) return `Maximum ${bt.name}s reached (${bt.max_per_player})`;
  if (!hasAll(p, bt.cost)) return 'Not enough resources';
  if (a.params.location === undefined || a.params.location === null) return 'No location specified';
  return placementError(s, a.player_id, bt, a.params.location);
}

function setupBuildError(cfg, s, a) {
  if (a.player_id !== s.player_order[s.setup_player_idx]) return 'Not your turn in setup';
  const bt = cfg.building_types[a.params.building_type];
  if (!bt) return `Unknown building type: ${a.params.building_type}`;
  const loc = a.params.location;
  if (loc === undefined || loc === null) return 'No location specified';
  const topo = topology(s.board.rings);

  if (bt.id === settlementType(cfg)?.id) {
    if (s.setup_settlements_placed >= 1) return 'Place your road next';
    if (!Number.isInteger(loc) || loc < 0 || loc >= topo.intersections.length) return 'Invalid intersection';
    if (s.board.buildings.i[loc]) return 'Intersection already occupied';
    if (bt.placement.distance_rule > 0 && tooCloseToBuilding(s, loc)) return 'Too close to another building';
    return null;
  }
  if (bt.id === roadType(cfg)?.id) {
    if (s.setup_settlements_placed < 1) return 'Place your settlement first';
    if (s.setup_roads_placed >= 1) return 'Already placed your road';
    if (!Number.isInteger(loc) || loc < 0 || loc >= topo.edges.length) return 'Invalid edge';
    if (s.board.buildings.e[loc]) return 'Edge already occupied';
    if (!topo.interEdges[s.setup_last_settlement].includes(loc)) return 'Road must touch your new settlement';
    return null;
  }
  return 'Cannot build that during setup';
}

export function applyBuild(ctx, a) {
  const { cfg, s, events } = ctx;
  const pid = a.player_id;
  const bt = cfg.building_types[a.params.building_type];
  const loc = a.params.location;
  const p = s.players[pid];
  const isSetup = s.phase === 'setup';

  if (!isSetup) for (const [r, n] of Object.entries(bt.cost)) p.resources[r] -= n;

  if (bt.placement.location_type === 'intersection') {
    let oldType = null;
    const occ = s.board.buildings.i[loc];
    if (bt.placement.upgrades_from && occ) {
      oldType = occ.type;
      p.buildings_placed[oldType] = (p.buildings_placed[oldType] ?? 0) - 1;
    }
    s.board.buildings.i[loc] = { type: bt.id, player: pid };
    const port = s.board.ports[loc];
    if (port && !p.ports.includes(port)) p.ports.push(port);
    events.push({ type: 'building_placed', player: pid, building: bt.id, location: loc, location_type: 'intersection', upgraded_from: oldType });
  } else {
    s.board.buildings.e[loc] = { type: bt.id, player: pid };
    events.push({ type: 'building_placed', player: pid, building: bt.id, location: loc, location_type: 'edge' });
  }
  p.buildings_placed[bt.id] = (p.buildings_placed[bt.id] ?? 0) + 1;

  if (isSetup) {
    if (bt.placement.location_type === 'intersection') {
      s.setup_settlements_placed += 1;
      s.setup_last_settlement = loc;
      if (s.setup_round === 1 && cfg.setup_rules.last_placement_gives_resources) {
        const topo = topology(s.board.rings);
        for (const hid of topo.intersections[loc].hexIds) {
          const res = cfg.terrain_types[s.board.hexes[hid].terrain]?.produces;
          if (res) p.resources[res] = (p.resources[res] ?? 0) + 1;
        }
        events.push({ type: 'setup_resources', player: pid, location: loc });
      }
    } else {
      s.setup_roads_placed += 1;
    }
  }
  addLog(s, 'build', { player: pid, building: bt.id, location: loc });
}
