import { addLog } from '../state.ts';
import type { Action, Ctx } from '../types.ts';

/** After a setup build: once settlement+road are down, move to the next seat / finish setup. */
export function advanceSetup(ctx: Ctx, a: Action): void {
  const { cfg, s, events } = ctx;
  if (a.type !== 'build') return;
  if (!(s.setup_settlements_placed >= 1 && s.setup_roads_placed >= 1)) return;

  s.setup_settlements_placed = 0;
  s.setup_roads_placed = 0;
  const n = s.player_order.length;

  if (cfg.setup_rules.placement_order === 'forward_reverse') {
    if (s.setup_round === 0) {
      s.setup_player_idx += 1;
      if (s.setup_player_idx >= n) { s.setup_round = 1; s.setup_player_idx = n - 1; }
    } else if (s.setup_round === 1) {
      s.setup_player_idx -= 1;
      if (s.setup_player_idx < 0) s.setup_round = 2;
    }
  } else {
    s.setup_player_idx += 1;
    if (s.setup_player_idx >= n) { s.setup_round += 1; s.setup_player_idx = 0; }
  }

  if (s.setup_round >= cfg.setup_rules.initial_placements) {
    s.phase = 'playing';
    s.current_player_idx = 0;
    s.turn_number = 1;
    events.push({ type: 'setup_complete' });
    events.push({ type: 'turn_started', player: s.player_order[0] });
    addLog(s, 'setup_complete');
  } else {
    events.push({ type: 'setup_turn', player: s.player_order[s.setup_player_idx], round: s.setup_round });
  }
}
