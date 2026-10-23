import { topology } from './topology.js';
import { bankRatio, roadType, settlementType } from './state.js';
import { buildError } from './rules/build.js';
import { edgeConnects, hasAll } from './rules/common.js';

/** All legal moves for `pid`. Parametric moves (trade_offer, discard, year of plenty) are listed generically. */
export function legalActions(cfg, s, pid) {
  const legal = [];
  const topo = topology(s.board.rings);

  if (s.phase === 'setup') return setupActions(cfg, s, pid, topo);
  if (s.phase !== 'playing') return legal;

  if (pid in s.pending_discards) return [{ type: 'discard', count: s.pending_discards[pid] }];

  const current = s.player_order[s.current_player_idx];
  if (pid !== current) {
    for (const [tid, offer] of Object.entries(s.trade_offers)) {
      if (offer.from_player !== pid && !(pid in offer.responses)) legal.push({ type: 'trade_respond', trade_id: tid });
    }
    return legal;
  }

  if (s.pending_robber_move) {
    for (const h of s.board.hexes) if (h.id !== s.board.robber_hex || !cfg.robber.must_move) legal.push({ type: 'move_robber', hex_id: h.id });
    return legal;
  }
  if (s.pending_robber_steal) return s.robber_steal_candidates.map((t) => ({ type: 'steal', target_player: t }));

  const player = s.players[pid];
  if (s.pending_action) {
    const pa = s.pending_action;
    if (pa.type === 'build_free_roads') {
      const rt = roadType(cfg);
      if (rt) {
        if ((player.buildings_placed[rt.id] ?? 0) >= rt.max_per_player) return [{ type: 'dev_card_action', location: -1, skip: true }];
        for (const e of topo.edges) {
          if (!s.board.buildings.e[e.id] && edgeConnects(s, pid, e.id)) legal.push({ type: 'dev_card_action', location: e.id });
        }
        if (!legal.length) legal.push({ type: 'dev_card_action', location: -1, skip: true });
      }
    } else if (pa.type === 'choose_monopoly_resource') {
      for (const r of Object.keys(cfg.resource_types)) legal.push({ type: 'dev_card_action', resource: r });
    } else {
      legal.push({ type: 'dev_card_action', pending: pa });
    }
    return legal;
  }

  const playable = (cards) => {
    if (player.has_played_dev_card_this_turn) return;
    for (const c of new Set(cards)) {
      const dc = cfg.dev_card_types[c];
      if (dc?.playable && !dc.is_victory_point) legal.push({ type: 'play_dev_card', card_type: c });
    }
  };

  if (!s.dice_rolled) {
    legal.push({ type: 'roll_dice' });
    playable(player.dev_cards);
    return legal;
  }

  legal.push({ type: 'end_turn' });

  for (const [id, bt] of Object.entries(cfg.building_types)) {
    const canAfford = hasAll(player, bt.cost);
    if (id === 'dev_card') {
      if (canAfford && s.dev_card_deck.length) legal.push({ type: 'buy_dev_card' });
      continue;
    }
    if ((player.buildings_placed[id] ?? 0) >= bt.max_per_player || !canAfford) continue;
    const n = bt.placement.location_type === 'intersection' ? topo.intersections.length : topo.edges.length;
    for (let loc = 0; loc < n; loc++) {
      if (!buildError(cfg, s, { type: 'build', player_id: pid, params: { building_type: id, location: loc } })) {
        legal.push({ type: 'build', building_type: id, location: loc });
      }
    }
  }

  if (cfg.trade_rules.bank_trading_enabled) {
    for (const give of Object.keys(cfg.resource_types)) {
      if ((player.resources[give] ?? 0) >= bankRatio(cfg, player, give)) {
        for (const want of Object.keys(cfg.resource_types)) {
          if (want !== give) legal.push({ type: 'trade_bank', give_resource: give, want_resource: want });
        }
      }
    }
  }

  if (cfg.trade_rules.player_trading_enabled) {
    legal.push({ type: 'trade_offer' });
    for (const [tid, offer] of Object.entries(s.trade_offers)) {
      if (offer.from_player !== pid) continue;
      for (const [who, r] of Object.entries(offer.responses)) {
        if (r === 'accepted') legal.push({ type: 'trade_accept', trade_id: tid, accepter_id: who });
      }
    }
  }

  playable(player.dev_cards.filter((c) => !player.dev_cards_bought_this_turn.includes(c)));
  return legal;
}

function setupActions(cfg, s, pid, topo) {
  const legal = [];
  if (pid !== s.player_order[s.setup_player_idx]) return legal;
  if (s.setup_settlements_placed < 1) {
    const st = settlementType(cfg);
    if (st) {
      for (const i of topo.intersections) {
        if (!buildError(cfg, s, { type: 'build', player_id: pid, params: { building_type: st.id, location: i.id } })) {
          legal.push({ type: 'build', building_type: st.id, location: i.id });
        }
      }
    }
  } else if (s.setup_roads_placed < 1) {
    const rt = roadType(cfg);
    if (rt && s.setup_last_settlement !== null) {
      for (const eid of topo.interEdges[s.setup_last_settlement]) {
        if (!s.board.buildings.e[eid]) legal.push({ type: 'build', building_type: rt.id, location: eid });
      }
    }
  }
  return legal;
}
