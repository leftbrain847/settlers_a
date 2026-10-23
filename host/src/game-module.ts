import type { HostConfig } from './config.ts';

export interface SeatInfo { id: string; name: string; isBot: boolean }

export interface GameResult {
  winner: string | null;
  /** per seat id */
  seats: Record<string, { won: boolean; score: number; extras: Record<string, number> }>;
}

export interface BotDriver<A> {
  /** Decide the next actions for bot-controlled seats; [] = idle or waiting on a human/timer. */
  plan(botSeats: string[]): A[];
  delayMs(a: A): number;
}

/**
 * A turn-based game plugged into the host. State/Action/View are the game's own types; the host only ever
 * touches them through this interface. A game that needs a tick loop would add `tick` (not needed for Catan).
 */
export interface GameModule<Settings, State, Action, View, Event> {
  id: string;
  limits: { minPlayers: number; maxPlayers: number };
  /** Validate and clamp untrusted lobby settings. null = reject. */
  parseSettings(raw: unknown): Settings | null;
  defaultSettings(): Settings;
  /** Strict parse of an untrusted client action. null = reject. Clients can never author system actions. */
  parseAction(type: string, params: unknown, playerId: string): Action | null;
  init(settings: Settings, seats: SeatInfo[], seed: number): { state: State; events: Event[] };
  reduce(state: State, action: Action): { ok: true; state: State; events: Event[] } | { ok: false; error: string };
  viewFor(state: State, playerId: string): View;
  redactEvents(events: Event[], playerId: string): Event[];
  /** Static data the client needs once (rules, names, colors). */
  clientConfig(state: State): unknown;
  isOver(state: State): boolean;
  result(state: State): GameResult;
  /** Seats the game is currently waiting on (turn owner, pending discards): drives the per-room turn timer. */
  waitingOn(state: State): { key: string; seats: string[] };
  /** Flip a seat between human and bot control (updates any in-state flag the rules read). */
  setSeatBot(state: State, seatId: string, isBot: boolean): State;
  /** Timer deadlines the room must honor, and the system action that fires them. */
  timers: {
    sync(state: State, now: number, hostCfg: HostConfig): void;
    due(now: number): Action[];
    next(): number | null;
  };
  bots: {
    create(botSeats: string[]): void;
    plan(state: State, botSeats: string[]): Action[];
    delayMs(a: Action): number;
  };
}
