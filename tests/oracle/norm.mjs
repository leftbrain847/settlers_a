// Canonical state form shared (by hand) with replay.py. Keep the two in sync.
const nz = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0));

export function norm(s) {
  const players = {};
  for (const [id, p] of Object.entries(s.players)) {
    players[id] = {
      resources: nz(p.resources),
      dev_cards: [...p.dev_cards].sort(),
      played_dev_cards: [...p.played_dev_cards].sort(),
      buildings_placed: nz(p.buildings_placed),
      achievements: [...p.achievements].sort(),
      has_played: p.has_played_dev_card_this_turn,
      bought: [...p.dev_cards_bought_this_turn].sort(),
      hidden_vp: p.hidden_vp,
      ports: [...p.ports].sort(),
    };
  }
  const place = (m) => Object.fromEntries(Object.entries(m).map(([k, b]) => [k, [b.type, b.player]]));
  return {
    phase: s.phase,
    turn_number: s.turn_number,
    current_player_idx: s.current_player_idx,
    dice_rolled: s.dice_rolled,
    last_roll: s.last_roll,
    setup: [s.setup_round, s.setup_player_idx, s.setup_settlements_placed, s.setup_roads_placed, s.setup_last_settlement],
    robber_hex: s.board.robber_hex,
    pending_robber_move: s.pending_robber_move,
    pending_robber_steal: s.pending_robber_steal,
    steal_candidates: [...s.robber_steal_candidates].sort(),
    pending_discards: s.pending_discards,
    pending_action: s.pending_action,
    winner: s.winner,
    deck: s.dev_card_deck,
    players,
    bi: place(s.board.buildings.i),
    be: place(s.board.buildings.e),
    trade_offers: Object.fromEntries(Object.entries(s.trade_offers).map(([id, o]) => [id, {
      from: o.from_player, offering: o.offering, requesting: o.requesting, responses: o.responses, counter_ids: o.counter_ids,
    }])),
  };
}
