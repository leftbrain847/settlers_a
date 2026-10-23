import { playerVp, totalResources } from './state.js';
import { legalActions } from './legal.js';

/**
 * THE trust boundary. This is the only function whose output may be sent to a client.
 * Hidden by construction: rng, dev_card_deck, other players' hands/dev cards/hidden VP, private log detail.
 * Built by explicit allow-list (never by deleting fields from a copy) so new state fields are private by default.
 */
export function viewFor(cfg, s, pid) {
  const over = s.phase === 'finished';
  const players = {};
  for (const id of s.player_order) {
    const p = s.players[id];
    const mine = id === pid;
    const v = {
      id: p.id, name: p.name, color: p.color, is_ai: p.is_ai,
      buildings_placed: p.buildings_placed, achievements: p.achievements,
      played_dev_cards: p.played_dev_cards, ports: p.ports,
      resource_count: totalResources(p), dev_card_count: p.dev_cards.length,
      vp: playerVp(cfg, s, id, mine || over),
    };
    if (mine || over) { v.resources = p.resources; v.dev_cards = p.dev_cards; v.hidden_vp = p.hidden_vp; }
    players[id] = v;
  }

  return structuredClone({
    me: pid,
    game_id: s.game_id, phase: s.phase, config_name: s.config_name,
    turn_number: s.turn_number, current_player: s.phase === 'setup' ? s.player_order[s.setup_player_idx] : s.player_order[s.current_player_idx] ?? null,
    dice_rolled: s.dice_rolled, last_roll: s.last_roll,
    pending_robber_move: s.pending_robber_move, pending_robber_steal: s.pending_robber_steal,
    robber_steal_candidates: s.robber_steal_candidates,
    pending_discards: s.pending_discards, pending_action: s.pending_action,
    winner: s.winner, dev_cards_remaining: s.dev_card_deck.length, player_order: s.player_order,
    setup: { round: s.setup_round, player_idx: s.setup_player_idx, settlements_placed: s.setup_settlements_placed, roads_placed: s.setup_roads_placed },
    board: {
      rings: s.board.rings,
      hexes: s.board.hexes.map((h) => ({ id: h.id, terrain: h.terrain, number_token: h.number_token, q: h.q, r: h.r })),
      ports: s.board.ports, robber_hex: s.board.robber_hex, buildings: s.board.buildings,
    },
    players,
    trade_offers: s.trade_offers,
    log: s.log.slice(-30),
    legal_actions: legalActions(cfg, s, pid),
  });
}

/** Per-recipient event redaction. Same rule as viewFor: allow-list what others may learn. */
export function redactEvents(events, pid) {
  return events.map((e) => {
    if (e.type === 'dev_card_bought' && e.player !== pid) return { type: e.type, player: e.player };
    if (e.type === 'resource_stolen' && pid !== e.stealer && pid !== e.target) {
      return { type: e.type, stealer: e.stealer, target: e.target };
    }
    if (e.type === 'discarded' && e.player !== pid) {
      return { type: e.type, player: e.player, count: Object.values(e.resources).reduce((a, b) => a + b, 0) };
    }
    return e;
  });
}
