import type { Action, Ctx, GameConfig, GameState } from '../types.ts';
import { topology } from '../topology.ts';
import { addLog, totalResources } from '../state.ts';
import { randInt } from '../rng.ts';
import { hasAll, sumVals, validResMap } from './common.ts';

export function discardError(cfg: GameConfig, s: GameState, a: Action<'discard'>): string | null {
  const need = s.pending_discards[a.player_id];
  if (need === undefined) return "You don't need to discard";
  const cards = a.params.resources;
  if (!validResMap(cfg, cards)) return 'Invalid discard';
  if (sumVals(cards) !== need) return `Must discard exactly ${need} cards`;
  if (!hasAll(s.players[a.player_id], cards)) return 'Not enough resources to discard';
  return null;
}

export function applyDiscard(ctx: Ctx, a: Action<'discard'>): void {
  const { s, events } = ctx;
  const p = s.players[a.player_id];
  for (const [r, n] of Object.entries(a.params.resources)) p.resources[r] -= n;
  delete s.pending_discards[a.player_id];
  events.push({ type: 'discarded', player: a.player_id, resources: a.params.resources });
  addLog(s, 'discard', { player: a.player_id, count: sumVals(a.params.resources) });
  if (!Object.keys(s.pending_discards).length) {
    s.pending_robber_move = true;
    events.push({ type: 'must_move_robber', player: s.player_order[s.current_player_idx] });
  }
}

export function moveRobberError(cfg: GameConfig, s: GameState, a: Action<'move_robber'>): string | null {
  if (!s.pending_robber_move) return 'Not waiting for robber move';
  if (a.player_id !== s.player_order[s.current_player_idx]) return 'Not your turn';
  const hid = a.params.hex_id;
  if (!Number.isInteger(hid) || hid < 0 || hid >= s.board.hexes.length) return 'Invalid hex';
  if (cfg.robber.must_move && hid === s.board.robber_hex) return 'Must move robber to a different hex';
  return null;
}

export function applyMoveRobber(ctx: Ctx, a: Action<'move_robber'>): void {
  const { cfg, s, events } = ctx;
  const pid = a.player_id;
  const hid = a.params.hex_id;
  s.board.robber_hex = hid;
  s.pending_robber_move = false;
  events.push({ type: 'robber_moved', player: pid, hex: hid });
  addLog(s, 'move_robber', { player: pid, hex: hid });

  if (!cfg.robber.steal_on_place) return;
  if (cfg.robber.friendly_turns && s.turn_number <= cfg.robber.friendly_turns) return;

  const topo = topology(s.board.rings);
  const found = new Set();
  for (const iid of topo.hexIntersections[hid]) {
    const b = s.board.buildings.i[iid];
    if (b && b.player !== pid && totalResources(s.players[b.player]) > 0) found.add(b.player);
  }
  const candidates = s.player_order.filter((p) => found.has(p));
  if (candidates.length === 1) {
    stealResource(ctx, pid, candidates[0]);
  } else if (candidates.length > 1) {
    s.pending_robber_steal = true;
    s.robber_steal_candidates = candidates;
    events.push({ type: 'choose_steal_target', player: pid, candidates });
  }
}

export function stealError(cfg: GameConfig, s: GameState, a: Action<'steal'>): string | null {
  if (!s.pending_robber_steal) return 'Not waiting for steal';
  if (a.player_id !== s.player_order[s.current_player_idx]) return 'Not your turn';
  if (!s.robber_steal_candidates.includes(a.params.target_player)) return 'Cannot steal from that player';
  return null;
}

export function applySteal(ctx: Ctx, a: Action<'steal'>): void {
  const { s } = ctx;
  s.pending_robber_steal = false;
  s.robber_steal_candidates = [];
  stealResource(ctx, a.player_id, a.params.target_player);
}

function stealResource(ctx: Ctx, stealerId: string, targetId: string): void {
  const { cfg, s, events } = ctx;
  const target = s.players[targetId];
  const stealer = s.players[stealerId];
  const pool = [];
  for (const [r, n] of Object.entries(target.resources)) for (let i = 0; i < n; i++) pool.push(r);
  for (let i = 0; i < cfg.robber.steal_count && pool.length; i++) {
    const idx = randInt(s, 0, pool.length - 1);
    const [res] = pool.splice(idx, 1);
    target.resources[res] -= 1;
    stealer.resources[res] = (stealer.resources[res] ?? 0) + 1;
    events.push({ type: 'resource_stolen', stealer: stealerId, target: targetId, resource: res });
  }
  addLog(s, 'steal', { stealer: stealerId, target: targetId });
}
