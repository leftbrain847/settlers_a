import type { Action, ActionType, GameConfig, GameEvent, GameView, Settings } from '../games/settlers/engine/types.ts';

export type StrategyName = 'random' | 'smart';

/** Everything the UI needs to draw one frame. Produced by a transport; never mutated by the UI. */
export interface Snapshot {
  view: GameView;
  events: GameEvent[];
  cfg: GameConfig;
  /** trade id -> epoch ms at which the offer expires */
  deadlines: Record<string, number>;
  now: number;
  autopilot: boolean;
  speed: number;
  thinking?: string | null;
  error?: string;
}

/** The UI's only door to a game: a local in-tab game now, a WebSocket room later. */
export interface Transport {
  subscribe(fn: (s: Snapshot) => void): () => void;
  start(): void;
  send(type: ActionType, params?: object): void;
  setAutopilot(on: boolean): void;
  setSpeed(x: number): void;
  destroy(): void;
  save?(): unknown;
}

export interface TransportOptions {
  settings?: Settings;
  name?: string;
  numBots?: number;
  seed: number;
  strategy?: StrategyName;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Action[];
  autopilot?: boolean;
  speed?: number;
}

/** What LocalTransport.save() returns and the lobby reads back to resume. */
export interface SaveData {
  v: 1;
  settings: Settings;
  name: string;
  numBots: number;
  seed: number;
  strategy: StrategyName;
  log: Action[];
  autopilot: boolean;
  speed: number;
}

/** Minimal storage surface (localStorage satisfies it; so does an in-memory fake). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
