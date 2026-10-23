import { reduce, viewFor, SYSTEM } from '../engine/index.ts';
import type { Action, GameConfig, GameState, ReduceResult, RngSource } from '../engine/index.ts';
import { hasAll } from '../engine/rules/common.ts';
import type { BotMemory, Strategy } from './types.ts';
import { randomStrategy } from './random.ts';
import { smartStrategy } from './smart.ts';

export type StrategyName = 'random' | 'smart';
export const STRATEGIES: Record<StrategyName, Strategy> = { random: randomStrategy, smart: smartStrategy };

export interface Bot { name: StrategyName; impl: Strategy; mem: BotMemory }
export type Bots = Record<string, Bot>;

/** spec: seat id -> strategy name */
export function createBots(spec: Record<string, StrategyName>): Bots {
  const bots: Bots = {};
  for (const [pid, name] of Object.entries(spec)) bots[pid] = { name, impl: STRATEGIES[name], mem: STRATEGIES[name].newMemory() };
  return bots;
}

const counterIds = (s: GameState): Set<string> => new Set(Object.values(s.trade_offers).flatMap((o) => o.counter_ids));

/**
 * Decide what the bots do next. Returns actions to apply in order; [] means "nothing to do" (idle, or
 * waiting on a human / a trade timer). Pure apart from `rng` and bot memory. Bots only see viewFor().
 */
export function botPlan(cfg: GameConfig, s: GameState, bots: Bots, rng: RngSource): Action[] {
  if (s.phase !== 'setup' && s.phase !== 'playing') return [];
  const isBot = (pid: string): boolean => pid in bots;

  // 1. Discards: nothing else can happen until everyone has discarded.
  const pending = Object.entries(s.pending_discards);
  if (pending.length) {
    return pending.filter(([pid]) => isBot(pid)).map(([pid, count]): Action => {
      const bot = bots[pid]!;
      const view = viewFor(cfg, s, pid);
      return { type: 'discard', player_id: pid, params: { resources: bot.impl.chooseDiscard(cfg, view, count, rng) } };
    });
  }

  const counters = counterIds(s);
  if (s.phase === 'playing') {
    // 2. Bots answer open offers (never counters: those are addressed to the original offerer).
    for (const offer of Object.values(s.trade_offers)) {
      if (counters.has(offer.id)) continue;
      for (const pid of s.player_order) {
        if (!isBot(pid) || pid === offer.from_player || pid in offer.responses) continue;
        const bot = bots[pid]!;
        const view = viewFor(cfg, s, pid);
        const viable = hasAll(s.players[offer.from_player]!, offer.offering);
        if (viable && bot.impl.evaluateTrade(cfg, view, offer, rng)) {
          return [{ type: 'trade_respond', player_id: pid, params: { trade_id: offer.id, response: 'accept' } }];
        }
        const plan: Action[] = [{ type: 'trade_respond', player_id: pid, params: { trade_id: offer.id, response: 'decline' } }];
        const canCounter = viable && cfg.trade_rules.counter_offers && offer.from_player === s.player_order[s.current_player_idx];
        const counter = canCounter ? bot.impl.counterOffer(cfg, view, offer, rng) : null;
        if (counter) plan.push({ type: 'trade_offer', player_id: pid, params: { ...counter, counter_to: offer.id } });
        return plan;
      }
    }

    // 3. A bot's own offer that everyone declined is withdrawn at once.
    for (const offer of Object.values(s.trade_offers)) {
      if (counters.has(offer.id) || !isBot(offer.from_player)) continue;
      const others = s.player_order.filter((p) => p !== offer.from_player);
      if (others.every((p) => offer.responses[p] === 'declined' || offer.responses[p] === 'countered')) {
        return [{ type: 'trade_expire', player_id: SYSTEM, params: { trade_id: offer.id } }];
      }
    }
  }

  // 4. The bot whose turn it is.
  const mover = s.phase === 'setup' ? s.player_order[s.setup_player_idx] : s.player_order[s.current_player_idx];
  if (!mover || !isBot(mover)) return [];
  if (s.phase === 'playing' && Object.values(s.trade_offers).some((o) => o.from_player === mover && !counters.has(o.id))) return [];

  const bot = bots[mover]!;
  const view = viewFor(cfg, s, mover);
  const action = bot.impl.chooseAction(cfg, view, rng, bot.mem);
  if (!action) return [];

  if (action.type === 'dev_card_action' && s.pending_action) {
    const pa = s.pending_action;
    if (pa.type === 'choose_resources') action.params = { resources: bot.impl.chooseYearOfPlenty(cfg, view, pa.count, rng) };
    else if (pa.type === 'choose_monopoly_resource') action.params = { resource: bot.impl.chooseMonopoly(cfg, view, rng) };
  }
  return [action];
}

export function actionDelayMs(a: Action): number {
  if (['roll_dice', 'build', 'end_turn', 'buy_dev_card', 'play_dev_card'].includes(a.type)) return 800;
  if (a.type === 'move_robber' || a.type === 'steal') return 500;
  if (a.type.startsWith('trade_')) return 250;
  return 200;
}

/** Run bots to quiescence synchronously (tests, simulations). Returns the final state. */
export function runBotsSync(
  cfg: GameConfig, state: GameState, bots: Bots, rng: RngSource,
  { maxActions = 20000, onAction }: { maxActions?: number; onAction?: (a: Action, r: ReduceResult) => void } = {},
): GameState {
  let s = state;
  let n = 0;
  while (n < maxActions) {
    const plan = botPlan(cfg, s, bots, rng);
    if (!plan.length) break;
    let progressed = false;
    for (const a of plan) {
      const r = reduce(cfg, s, a);
      if (!r.ok) { onAction?.(a, r); continue; }
      onAction?.(a, r);
      s = r.state;
      progressed = true;
      n++;
    }
    if (!progressed) throw new Error(`bot stuck: ${JSON.stringify(plan[0])}`);
  }
  return s;
}
