import { configFromSettings, createGame, addPlayer, startGame, reduce, legalActions, SYSTEM } from '../../games/settlers/engine/index.ts';
import type { Action, GameConfig, GameState, LegalAction, ReduceResult, ResMap, Settings } from '../../games/settlers/engine/index.ts';
import { nextFloat, randInt } from '../../games/settlers/engine/rng.ts';
import type { RngSource } from '../../games/settlers/engine/rng.ts';

export function newGame(seed: number, { n = 3, settings = {}, ai = false }: { n?: number; settings?: Settings; ai?: boolean } = {}) {
  const cfg = configFromSettings(settings);
  let s = createGame(cfg, { game_id: `g${seed}`, seed });
  for (let i = 0; i < n; i++) s = addPlayer(cfg, s, { name: `P${i + 1}`, is_ai: ai });
  const started = startGame(cfg, s, {});
  return { cfg, state: started.state, events: started.events };
}

/** Tests build actions from loose parts; this is the one place that asserts they are well-formed. */
export const mk = (type: string, player_id: string, params: object = {}): Action => ({ type, player_id, params }) as Action;

// A legal move plus the extras a generic one leaves open (e.g. a counter target for trade_offer).
type Candidate = LegalAction | { type: 'trade_offer'; counter_to: string };

// Fill in the parameters a generic legal action leaves open. `r` is the harness's own RNG ({rng}).
function concretize(cfg: GameConfig, s: GameState, pid: string, la: Candidate, r: RngSource): Action | null {
  const p = s.players[pid]!;
  const hand = (): string[] => Object.entries(p.resources).flatMap(([k, n]) => Array<string>(n).fill(k));
  const kinds = Object.keys(cfg.resource_types);
  const { type, ...params } = la;
  if (la.type === 'discard') {
    const h = hand();
    const res: ResMap = {};
    for (let i = 0; i < la.count; i++) {
      const k = h.splice(randInt(r, 0, h.length - 1), 1)[0]!;
      res[k] = (res[k] ?? 0) + 1;
    }
    return mk(type, pid, { resources: res });
  }
  if (la.type === 'dev_card_action' && la.pending?.type === 'choose_resources') {
    const res: ResMap = {};
    for (let i = 0; i < la.pending.count; i++) { const k = kinds[randInt(r, 0, kinds.length - 1)]!; res[k] = (res[k] ?? 0) + 1; }
    return mk(type, pid, { resources: res });
  }
  if (la.type === 'trade_offer') {
    const h = hand();
    if (!h.length) return null;
    const give = h[randInt(r, 0, h.length - 1)]!;
    const want = kinds.filter((k) => k !== give)[randInt(r, 0, kinds.length - 2)]!;
    const counter_to = 'counter_to' in la ? la.counter_to : undefined;
    return mk(type, pid, { offering: { [give]: 1 }, requesting: { [want]: 1 }, ...(counter_to ? { counter_to } : {}) });
  }
  if (la.type === 'trade_respond') {
    return mk(type, pid, { trade_id: la.trade_id, response: nextFloat(r) < 0.5 ? 'accept' : 'decline' });
  }
  return mk(type, pid, params);
}

const WEIGHT: Record<string, number> = { roll_dice: 100, build: 8, buy_dev_card: 6, play_dev_card: 5, trade_bank: 1, trade_offer: 1, trade_accept: 20, end_turn: 0.6 };

/** Pick the next action for a random-policy game, or null if nobody can move. */
export function pickAction(cfg: GameConfig, s: GameState, r: RngSource): Action | null {
  const current = s.player_order[s.current_player_idx]!;
  const movers = new Set(Object.keys(s.pending_discards));
  if (!movers.size) {
    movers.add(s.phase === 'setup' ? s.player_order[s.setup_player_idx]! : current);
    if (s.phase === 'playing') for (const o of Object.values(s.trade_offers)) for (const p of s.player_order) if (p !== o.from_player) movers.add(p);
  }
  const options: [string, Candidate, number][] = [];
  for (const pid of movers) {
    for (const la of legalActions(cfg, s, pid)) {
      if (la.type === 'trade_offer' && pid !== current) continue;
      if (la.type === 'trade_respond' && nextFloat(r) > 0.5) continue;
      options.push([pid, la, WEIGHT[la.type] ?? 1]);
    }
    // Non-current players may counter an active offer from the current player.
    if (s.phase === 'playing' && pid !== current) {
      for (const o of Object.values(s.trade_offers)) {
        if (o.from_player === current && !(pid in o.responses)) options.push([pid, { type: 'trade_offer', counter_to: o.id }, 0.5]);
      }
    }
  }
  const concrete = options.map(([pid, la, w]) => [concretize(cfg, s, pid, la, r), w] as const).filter((x): x is readonly [Action, number] => x[0] !== null);
  if (!concrete.length) return null;
  const total = concrete.reduce((acc, o) => acc + o[1], 0);
  let x = nextFloat(r) * total;
  for (const [a, w] of concrete) { x -= w; if (x <= 0) return a; }
  return concrete[concrete.length - 1]![0];
}

export interface PlayOptions {
  n?: number; maxSteps?: number; settings?: Settings;
  onStep?: (a: Action, res: Extract<ReduceResult, { ok: true }>, prev: GameState, cfg: GameConfig) => void;
}

/** Play a random game, calling `onStep(action, result, prevState, cfg)` for each applied action. */
export function playRandom(seed: number, { n = 3, maxSteps = 4000, settings = { vp_to_win: 6 }, onStep }: PlayOptions = {}) {
  const g = newGame(seed, { n, settings });
  let s = g.state;
  const r = { rng: (seed * 7919 + 13) >>> 0 };
  let steps = 0, rejected = 0;
  while (s.phase !== 'finished' && steps < maxSteps) {
    const a = pickAction(g.cfg, s, r);
    if (!a) break;
    const res = reduce(g.cfg, s, a);
    if (!res.ok) { rejected++; if (rejected > 50) throw new Error(`stuck: ${res.error} ${JSON.stringify(a)}`); continue; }
    rejected = 0;
    onStep?.(a, res, s, g.cfg);
    s = res.state;
    steps++;
  }
  return { cfg: g.cfg, state: s, steps, initial: g.state };
}

export { SYSTEM };
