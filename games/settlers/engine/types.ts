// Shared shapes for the Settlers engine. State is plain JSON: no Maps, Sets, classes or functions.

export type ResMap = Record<string, number>;
export type Phase = 'lobby' | 'setup' | 'playing' | 'finished';

// ---------------------------------------------------------------- config
export interface ResourceType { id: string; name: string; terrain: string | null }
export interface TerrainType { id: string; name: string; produces: string | null; color: string }
export interface PlacementRule {
  location_type: 'intersection' | 'edge' | 'none';
  must_be_empty: boolean;
  distance_rule: number;
  requires_connected_road: boolean;
  upgrades_from: string | null;
}
export interface BuildingType {
  id: string; name: string; cost: ResMap; vp: number; max_per_player: number;
  placement: PlacementRule; production_multiplier: number; counts_as_road: boolean;
}
export interface PortType { id: string; name: string; resource: string | null; ratio: number }
export interface DevCardEffect { type: string; params: { count?: number } }
export interface DevCardType {
  id: string; name: string; count_in_deck: number; is_victory_point: boolean; playable: boolean;
  effects: DevCardEffect[]; persistent: boolean; persistent_tag: string | null;
}
export interface DiceOutcomeHandler { action: string; params: Record<string, never> }
export interface TradeRules {
  player_trading_enabled: boolean; bank_trading_enabled: boolean; default_bank_ratio: number; counter_offers: boolean;
  human_response_timer: number; counter_timer: number; bot_offer_timer: number;
}
export interface TurnPhase { id: string; name: string; allowed_actions: string[]; auto_advance_after?: string }
export interface WinCondition { type: string; params: { threshold?: number } }
export interface Achievement { id: string; name: string; vp: number; metric: string; min_value: number }
export interface BoardTemplate {
  num_rings: number; terrain_counts: Record<string, number>; number_tokens: number[]; port_counts: Record<string, number>;
}
export interface SetupRules {
  min_players: number; max_players: number; initial_placements: number; placement_order: string; last_placement_gives_resources: boolean;
}
export interface RobberRules {
  enabled: boolean; discard_threshold: number; discard_fraction: number; steal_on_place: boolean;
  steal_count: number; must_move: boolean; friendly_turns: number;
}
export interface GameConfig {
  name: string;
  resource_types: Record<string, ResourceType>;
  terrain_types: Record<string, TerrainType>;
  building_types: Record<string, BuildingType>;
  port_types: Record<string, PortType>;
  dev_card_types: Record<string, DevCardType>;
  dice: { num_dice: number; sides_per_die: number };
  dice_outcomes: Record<number, DiceOutcomeHandler[]>;
  trade_rules: TradeRules;
  turn_phases: TurnPhase[];
  win_conditions: WinCondition[];
  achievements: Record<string, Achievement>;
  board_template: BoardTemplate;
  setup_rules: SetupRules;
  robber: RobberRules;
}

/** Lobby form values, loosely typed on purpose: they are validated by configFromSettings. */
export interface Settings {
  vp_to_win?: number; board_rings?: number; friendly_robber?: boolean; discard_threshold?: number;
  max_roads?: number; max_settlements?: number; max_cities?: number;
  dev_cards?: Record<string, number>; port_counts?: Record<string, number>;
  human_response_timer?: number; counter_timer?: number; bot_offer_timer?: number;
  starting_resources?: 'none' | 'some' | 'plenty';
}

// ---------------------------------------------------------------- state
export interface Hex { id: number; terrain: string; number_token: number | null; q: number; r: number }
export interface Placed { type: string; player: string }
export interface Player {
  id: string; name: string; color: string; is_ai: boolean;
  resources: ResMap; dev_cards: string[]; played_dev_cards: string[]; buildings_placed: Record<string, number>;
  achievements: string[]; has_played_dev_card_this_turn: boolean; dev_cards_bought_this_turn: string[];
  hidden_vp: number; ports: string[];
}
export interface TradeOffer {
  id: string; from_player: string; offering: ResMap; requesting: ResMap;
  responses: Record<string, 'accepted' | 'declined' | 'countered'>; counter_ids: string[];
}
export type PendingAction =
  | { type: 'choose_resources'; count: number; player: string }
  | { type: 'choose_monopoly_resource'; player: string }
  | { type: 'build_free_roads'; count: number; remaining: number; player: string };
export type LogEntry = { type: string; turn: number } & Record<string, unknown>;
export interface Board {
  rings: number; hexes: Hex[]; ports: Record<number, string>; port_slots: [number, number, string][];
  robber_hex: number | null; buildings: { i: Record<number, Placed>; e: Record<number, Placed> };
}
export interface GameState {
  v: 1; game_id: string; phase: Phase; config_name: string;
  /** PRNG state. SECRET: never leaves the server (see view.ts). */
  rng: number;
  board: Board;
  players: Record<string, Player>;
  player_order: string[];
  current_player_idx: number; current_turn_phase: number; turn_number: number;
  dice_rolled: boolean; last_roll: number[] | null;
  setup_round: number; setup_player_idx: number; setup_forward: boolean;
  setup_settlements_placed: number; setup_roads_placed: number; setup_last_settlement: number | null;
  /** SECRET */
  dev_card_deck: string[];
  trade_offers: Record<string, TradeOffer>; trade_counter: number;
  pending_robber_move: boolean; pending_robber_steal: boolean; robber_steal_candidates: string[];
  pending_discards: Record<string, number>;
  pending_action: PendingAction | null;
  winner: string | null;
  log: LogEntry[];
}

// ---------------------------------------------------------------- actions
export interface ActionParams {
  roll_dice: Record<string, never>;
  build: { building_type: string; location: number };
  buy_dev_card: Record<string, never>;
  play_dev_card: { card_type: string };
  dev_card_action: { resources?: ResMap; resource?: string; location?: number; skip?: boolean };
  trade_bank: { give_resource: string; want_resource: string };
  trade_offer: { offering: ResMap; requesting: ResMap; counter_to?: string };
  trade_respond: { trade_id: string; response: 'accept' | 'decline' };
  trade_accept: { trade_id: string; accepter_id?: string };
  trade_cancel: { trade_id: string };
  trade_expire: { trade_id: string };
  end_turn: Record<string, never>;
  discard: { resources: ResMap };
  move_robber: { hex_id: number };
  steal: { target_player: string };
}
export type ActionType = keyof ActionParams;
export type Action<T extends ActionType = ActionType> = { [K in T]: { type: K; player_id: string; params: ActionParams[K] } }[T];

export type GameEvent = { type: string } & Record<string, unknown>;
export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[]; error?: undefined }
  | { ok: false; error: string; state: GameState; events: [] };

/** What rule modules mutate: a draft state plus the event list being built. */
export interface Ctx { cfg: GameConfig; s: GameState; events: GameEvent[] }

// ---------------------------------------------------------------- views (the only thing a client ever sees)
export interface PlayerView {
  id: string; name: string; color: string; is_ai: boolean;
  buildings_placed: Record<string, number>; achievements: string[]; played_dev_cards: string[]; ports: string[];
  resource_count: number; dev_card_count: number; vp: number;
  resources?: ResMap; dev_cards?: string[]; hidden_vp?: number;
}
/** A legal move as listed to a player. Parametric moves (trade_offer, discard, Year of Plenty) list only their shape. */
export type LegalAction =
  | { type: 'roll_dice' } | { type: 'end_turn' } | { type: 'buy_dev_card' } | { type: 'trade_offer' }
  | { type: 'build'; building_type: string; location: number }
  | { type: 'play_dev_card'; card_type: string }
  | { type: 'trade_bank'; give_resource: string; want_resource: string }
  | { type: 'trade_respond'; trade_id: string }
  | { type: 'trade_accept'; trade_id: string; accepter_id: string }
  | { type: 'move_robber'; hex_id: number }
  | { type: 'steal'; target_player: string }
  | { type: 'discard'; count: number }
  | { type: 'dev_card_action'; location?: number; skip?: boolean; resource?: string; pending?: PendingAction };
export type LegalOf<T extends LegalAction['type']> = Extract<LegalAction, { type: T }>;
export interface GameView {
  me: string; game_id: string; phase: Phase; config_name: string; turn_number: number; current_player: string | null;
  dice_rolled: boolean; last_roll: number[] | null; pending_robber_move: boolean; pending_robber_steal: boolean;
  robber_steal_candidates: string[]; pending_discards: Record<string, number>; pending_action: PendingAction | null;
  winner: string | null; dev_cards_remaining: number; player_order: string[];
  setup: { round: number; player_idx: number; settlements_placed: number; roads_placed: number };
  board: { rings: number; hexes: Hex[]; ports: Record<number, string>; port_slots: [number, number, string][]; robber_hex: number | null; buildings: Board['buildings'] };
  players: Record<string, PlayerView>;
  trade_offers: Record<string, TradeOffer>;
  log: LogEntry[];
  legal_actions: LegalAction[];
}
