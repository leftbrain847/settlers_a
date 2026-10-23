import type { Action, Ctx, GameConfig, GameState } from '../types.ts';
import { addLog, roadType } from '../state.ts';
import { edgeConnects, hasAll, sumVals, validResMap } from './common.ts';

const isCurrent = (s: GameState, pid: string): boolean => pid === s.player_order[s.current_player_idx];

export function buyDevError(cfg: GameConfig, s: GameState, a: Action<'buy_dev_card'>): string | null {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (!isCurrent(s, a.player_id)) return 'Not your turn';
  if (!s.dice_rolled) return 'Must roll dice first';
  if (!s.dev_card_deck.length) return 'No development cards left';
  const cost = cfg.building_types.dev_card?.cost;
  if (cost && !hasAll(s.players[a.player_id], cost)) return 'Not enough resources';
  return null;
}

export function applyBuyDev(ctx: Ctx, a: Action<'buy_dev_card'>): void {
  const { cfg, s, events } = ctx;
  const p = s.players[a.player_id];
  for (const [r, n] of Object.entries(cfg.building_types.dev_card!.cost)) p.resources[r] = (p.resources[r] ?? 0) - n;
  const card = s.dev_card_deck.shift()!;
  p.dev_cards.push(card);
  p.dev_cards_bought_this_turn.push(card);
  const isVp = !!cfg.dev_card_types[card]!.is_victory_point;
  if (isVp) p.hidden_vp += 1;
  events.push({ type: 'dev_card_bought', player: a.player_id, card, is_vp: isVp });
  addLog(s, 'buy_dev_card', { player: a.player_id });
}

export function playDevError(cfg: GameConfig, s: GameState, a: Action<'play_dev_card'>): string | null {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (!isCurrent(s, a.player_id)) return 'Not your turn';
  const p = s.players[a.player_id];
  const card = a.params.card_type;
  if (!p.dev_cards.includes(card)) return "You don't have that card";
  const dc = cfg.dev_card_types[card];
  if (!dc) return `Unknown dev card: ${card}`;
  if (!dc.playable) return 'This card cannot be played';
  if (dc.is_victory_point) return 'Victory point cards are revealed automatically';
  if (p.has_played_dev_card_this_turn) return 'Already played a dev card this turn';
  if (p.dev_cards_bought_this_turn.includes(card)) return 'Cannot play a dev card the same turn you bought it';
  return null;
}

export function applyPlayDev(ctx: Ctx, a: Action<'play_dev_card'>): void {
  const { cfg, s, events } = ctx;
  const p = s.players[a.player_id];
  const card = a.params.card_type;
  const dc = cfg.dev_card_types[card];
  p.dev_cards.splice(p.dev_cards.indexOf(card), 1);
  p.has_played_dev_card_this_turn = true;
  if (dc.persistent) p.played_dev_cards.push(card);
  events.push({ type: 'dev_card_played', player: a.player_id, card });
  addLog(s, 'play_dev_card', { player: a.player_id, card });

  for (const eff of dc.effects) {
    if (eff.type === 'activate_robber') {
      s.pending_robber_move = true;
      events.push({ type: 'must_move_robber', player: a.player_id });
    } else if (eff.type === 'gain_resources') {
      const count = eff.params.count ?? 2;
      s.pending_action = { type: 'choose_resources', count, player: a.player_id };
      events.push({ type: 'choose_resources', player: a.player_id, count });
    } else if (eff.type === 'monopoly') {
      s.pending_action = { type: 'choose_monopoly_resource', player: a.player_id };
      events.push({ type: 'choose_monopoly_resource', player: a.player_id });
    } else if (eff.type === 'build_roads') {
      const count = eff.params.count ?? 2;
      s.pending_action = { type: 'build_free_roads', count, remaining: count, player: a.player_id };
      events.push({ type: 'build_free_roads', player: a.player_id, count });
    }
  }
}

export function devActionError(cfg: GameConfig, s: GameState, a: Action<'dev_card_action'>): string | null {
  const pa = s.pending_action;
  if (!pa) return 'No pending action';
  if (!isCurrent(s, a.player_id)) return 'Not your turn';
  const prm = a.params;
  if (pa.type === 'choose_resources') {
    if (!validResMap(cfg, prm.resources) || sumVals(prm.resources) !== pa.count) {
      return `Must choose exactly ${pa.count} resources`;
    }
  } else if (pa.type === 'choose_monopoly_resource') {
    if (typeof prm.resource !== 'string' || !(prm.resource in cfg.resource_types)) return 'Must choose a resource';
  } else {
    if (prm.skip || prm.location === -1) return null;
    const loc = prm.location;
    if (typeof loc !== 'number' || !Number.isInteger(loc) || loc < 0) return 'Invalid road location';
    if (s.board.buildings.e[loc]) return 'Invalid road location';
    if (!roadType(cfg)) return 'No road type';
    if (!edgeConnects(s, a.player_id, loc)) return 'Road must connect to your network';
  }
  return null;
}

export function applyDevAction(ctx: Ctx, a: Action<'dev_card_action'>): void {
  const { cfg, s, events } = ctx;
  const pa = s.pending_action;
  if (!pa) return;
  const pid = a.player_id;
  const p = s.players[pid]!;
  const prm = a.params;

  if (pa.type === 'choose_resources') {
    const gained = prm.resources ?? {};
    for (const [r, n] of Object.entries(gained)) p.resources[r] = (p.resources[r] ?? 0) + n;
    s.pending_action = null;
    events.push({ type: 'resources_gained', player: pid, resources: gained });
  } else if (pa.type === 'choose_monopoly_resource') {
    const res = prm.resource!;
    let stolen = 0;
    for (const id of s.player_order) {
      if (id === pid) continue;
      const victim = s.players[id]!;
      const n = victim.resources[res] ?? 0;
      if (n > 0) { victim.resources[res] = 0; p.resources[res] = (p.resources[res] ?? 0) + n; stolen += n; }
    }
    s.pending_action = null;
    events.push({ type: 'monopoly', player: pid, resource: res, stolen });
  } else {
    const rt = roadType(cfg);
    if (!rt) { s.pending_action = null; return; }
    const placed = p.buildings_placed[rt.id] ?? 0;
    if (prm.skip || prm.location === -1 || placed >= rt.max_per_player) {
      s.pending_action = null;
      events.push({ type: 'free_roads_skipped', player: pid, reason: 'max_roads' });
    } else {
      const loc = prm.location!;
      s.board.buildings.e[loc] = { type: rt.id, player: pid };
      p.buildings_placed[rt.id] = placed + 1;
      pa.remaining -= 1;
      events.push({ type: 'free_road_built', player: pid, location: loc });
      if (placed + 1 >= rt.max_per_player || pa.remaining <= 0) s.pending_action = null;
    }
  }
  addLog(s, 'dev_card_action', { player: pid, action_type: pa.type });
}
