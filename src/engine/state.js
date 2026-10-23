import { generateBoard } from './board.js';
import { shuffle, pick } from './rng.js';

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#ecf0f1', '#f39c12', '#9b59b6', '#1abc9c'];

export function addLog(s, type, data = {}) {
  s.log.push({ type, turn: s.turn_number, ...data });
}

export function createGame(cfg, { game_id, seed }) {
  return {
    v: 1,
    game_id,
    phase: 'lobby',
    config_name: cfg.name,
    rng: seed >>> 0,
    board: { rings: cfg.board_template.num_rings, hexes: [], ports: {}, port_slots: [], robber_hex: null, buildings: { i: {}, e: {} } },
    players: {},
    player_order: [],
    current_player_idx: 0,
    current_turn_phase: 0,
    turn_number: 0,
    dice_rolled: false,
    last_roll: null,
    setup_round: 0,
    setup_player_idx: 0,
    setup_forward: true,
    setup_settlements_placed: 0,
    setup_roads_placed: 0,
    setup_last_settlement: null,
    dev_card_deck: [],
    trade_offers: {},
    trade_counter: 0,
    pending_robber_move: false,
    pending_robber_steal: false,
    robber_steal_candidates: [],
    pending_discards: {},
    pending_action: null,
    winner: null,
    log: [],
  };
}

/** Lobby mutation. Returns a new state; throws on misuse (callers are trusted: room/UI code, not clients). */
export function addPlayer(cfg, state, { name, id, is_ai = false }) {
  if (state.phase !== 'lobby') throw new Error('Can only add players in lobby phase');
  if (state.player_order.length >= cfg.setup_rules.max_players) throw new Error('Maximum players reached');
  const s = structuredClone(state);
  const pid = id ?? `p${s.player_order.length + 1}`;
  if (s.players[pid]) throw new Error('Duplicate player id');
  const resources = {};
  for (const r of Object.keys(cfg.resource_types)) resources[r] = 0;
  s.players[pid] = {
    id: pid, name, color: PLAYER_COLORS[s.player_order.length % PLAYER_COLORS.length], is_ai,
    resources, dev_cards: [], played_dev_cards: [], buildings_placed: {}, achievements: [],
    has_played_dev_card_this_turn: false, dev_cards_bought_this_turn: [], hidden_vp: 0, ports: [],
  };
  s.player_order.push(pid);
  addLog(s, 'player_joined', { player: pid, name, is_ai });
  return s;
}

export function removePlayer(state, pid) {
  if (state.phase !== 'lobby') throw new Error('Can only remove players in lobby phase');
  const s = structuredClone(state);
  delete s.players[pid];
  s.player_order = s.player_order.filter((p) => p !== pid);
  return s;
}

/**
 * @param {{starting_resources?: number, randomize_order?: boolean}} [opts] random resources dealt to each player at start
 * @returns {{state: any, events: any[]}}
 */
export function startGame(cfg, state, opts = {}) {
  if (state.phase !== 'lobby') throw new Error('Game already started');
  if (state.player_order.length < cfg.setup_rules.min_players) {
    throw new Error(`Need at least ${cfg.setup_rules.min_players} players`);
  }
  const s = structuredClone(state);
  if (opts.randomize_order) shuffle(s, s.player_order);

  const b = generateBoard(cfg, s);
  s.board.hexes = b.hexes;
  s.board.ports = b.ports;
  s.board.port_slots = b.port_slots;
  s.board.robber_hex = b.robber_hex;

  const deck = [];
  for (const [id, dc] of Object.entries(cfg.dev_card_types)) for (let i = 0; i < dc.count_in_deck; i++) deck.push(id);
  s.dev_card_deck = shuffle(s, deck);

  if (opts.starting_resources) {
    const kinds = Object.keys(cfg.resource_types);
    for (const pid of s.player_order) {
      for (let i = 0; i < opts.starting_resources; i++) s.players[pid].resources[pick(s, kinds)] += 1;
    }
  }

  s.phase = 'setup';
  s.setup_round = 0;
  s.setup_player_idx = 0;
  s.setup_forward = true;
  const events = [
    { type: 'game_started', players: [...s.player_order] },
    { type: 'setup_turn', player: s.player_order[0], round: 0 },
  ];
  addLog(s, 'game_started');
  return { state: s, events };
}

export const currentPlayerId = (s) => (s.player_order.length ? s.player_order[s.current_player_idx] : null);

export function totalResources(p) {
  let n = 0;
  for (const v of Object.values(p.resources)) n += v;
  return n;
}

/** includeHidden=true for win checks and the owner's own UI. */
export function playerVp(cfg, s, pid, includeHidden = true) {
  const p = s.players[pid];
  let vp = 0;
  for (const b of Object.values(s.board.buildings.i)) if (b.player === pid) vp += cfg.building_types[b.type]?.vp ?? 0;
  for (const b of Object.values(s.board.buildings.e)) if (b.player === pid) vp += cfg.building_types[b.type]?.vp ?? 0;
  for (const a of p.achievements) vp += cfg.achievements[a]?.vp ?? 0;
  if (includeHidden) vp += p.hidden_vp;
  return vp;
}

export function bankRatio(cfg, player, give) {
  let ratio = cfg.trade_rules.default_bank_ratio;
  for (const portId of player.ports) {
    const pt = cfg.port_types[portId];
    if (pt && (pt.resource === null || pt.resource === give)) ratio = Math.min(ratio, pt.ratio);
  }
  return ratio;
}

export function roadType(cfg) {
  return Object.values(cfg.building_types).find((b) => b.counts_as_road) ?? null;
}

export function settlementType(cfg) {
  return Object.values(cfg.building_types).find(
    (b) => b.placement.location_type === 'intersection' && !b.placement.upgrades_from) ?? null;
}
