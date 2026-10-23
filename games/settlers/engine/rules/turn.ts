import type { Action, Ctx, GameConfig, GameState } from '../types.ts';
import { addLog } from '../state.ts';

export function endTurnError(cfg: GameConfig, s: GameState, a: Action<'end_turn'>): string | null {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (a.player_id !== s.player_order[s.current_player_idx]) return 'Not your turn';
  if (!s.dice_rolled) return 'Must roll dice first';
  if (Object.keys(s.pending_discards).length) return 'Waiting for players to discard';
  if (s.pending_robber_move || s.pending_robber_steal) return 'Must resolve robber first';
  if (s.pending_action) return 'Must resolve pending action first';
  return null;
}

export function applyEndTurn(ctx: Ctx, a: Action<'end_turn'>): void {
  const { s, events } = ctx;
  s.dice_rolled = false;
  s.last_roll = null;
  s.trade_offers = {};
  const p = s.players[a.player_id];
  p.has_played_dev_card_this_turn = false;
  p.dev_cards_bought_this_turn = [];
  s.current_player_idx = (s.current_player_idx + 1) % s.player_order.length;
  s.turn_number += 1;
  s.current_turn_phase = 0;
  const next = s.player_order[s.current_player_idx];
  events.push({ type: 'turn_ended', player: a.player_id });
  events.push({ type: 'turn_started', player: next });
  addLog(s, 'end_turn', { player: a.player_id, next_player: next });
}
