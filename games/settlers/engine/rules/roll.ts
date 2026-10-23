import type { Action, Ctx, GameConfig, GameState } from '../types.ts';
import { topology } from '../topology.ts';
import { addLog, totalResources } from '../state.ts';
import { randInt } from '../rng.ts';

export function rollError(cfg: GameConfig, s: GameState, a: Action<'roll_dice'>): string | null {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (a.player_id !== s.player_order[s.current_player_idx]) return 'Not your turn';
  if (s.dice_rolled) return 'Dice already rolled this turn';
  if (Object.keys(s.pending_discards).length) return 'Waiting for players to discard';
  if (s.pending_robber_move) return 'Must move robber first';
  return null;
}

export function applyRoll(ctx: Ctx, a: Action<'roll_dice'>): void {
  const { cfg, s, events } = ctx;
  const rolls = [];
  for (let i = 0; i < cfg.dice.num_dice; i++) rolls.push(randInt(s, 1, cfg.dice.sides_per_die));
  const total = rolls.reduce((x, y) => x + y, 0);
  s.dice_rolled = true;
  s.last_roll = rolls;
  events.push({ type: 'dice_rolled', player: a.player_id, rolls, total });
  addLog(s, 'dice_rolled', { player: a.player_id, rolls, total });

  const handlers = cfg.dice_outcomes[total] ?? [];
  for (const h of handlers) {
    if (h.action === 'produce_resources') produce(ctx, total);
    else if (h.action === 'activate_robber') activateRobber(ctx, a.player_id);
  }
  if (!handlers.length) produce(ctx, total);
}

function produce(ctx: Ctx, roll: number): void {
  const { cfg, s, events } = ctx;
  const topo = topology(s.board.rings);
  for (const hex of s.board.hexes) {
    if (hex.number_token !== roll || s.board.robber_hex === hex.id) continue;
    const res = cfg.terrain_types[hex.terrain]?.produces;
    if (!res) continue;
    for (const iid of topo.hexIntersections[hex.id]) {
      const b = s.board.buildings.i[iid];
      if (!b) continue;
      const mult = cfg.building_types[b.type]?.production_multiplier ?? 0;
      if (mult <= 0) continue;
      const p = s.players[b.player];
      p.resources[res] = (p.resources[res] ?? 0) + mult;
      events.push({ type: 'resource_produced', player: b.player, resource: res, amount: mult, hex: hex.id });
    }
  }
}

function activateRobber(ctx: Ctx, pid: string): void {
  const { cfg, s, events } = ctx;
  if (!cfg.robber.enabled) return;
  for (const id of s.player_order) {
    const hand = totalResources(s.players[id]);
    if (hand > cfg.robber.discard_threshold) {
      const n = Math.floor(hand * cfg.robber.discard_fraction);
      s.pending_discards[id] = n;
      events.push({ type: 'must_discard', player: id, count: n });
    }
  }
  if (!Object.keys(s.pending_discards).length) {
    s.pending_robber_move = true;
    events.push({ type: 'must_move_robber', player: pid });
  }
}

export { activateRobber };
