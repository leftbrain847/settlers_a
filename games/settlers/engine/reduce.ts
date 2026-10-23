import { SYSTEM } from './rules/common.ts';
import type { Action, ActionType, Ctx, GameConfig, GameState, ReduceResult } from './types.ts';
import { applyBuild, buildError } from './rules/build.ts';
import { applyRoll, rollError } from './rules/roll.ts';
import { advanceSetup } from './rules/setup.ts';
import { checkWin, updateAchievements } from './rules/achievements.ts';
import { applyBuyDev, applyDevAction, applyPlayDev, buyDevError, devActionError, playDevError } from './rules/devcards.ts';
import {
  acceptError, applyAccept, applyBank, applyCancel, applyOffer, applyRespond,
  bankError, cancelError, expireError, offerError, respondError,
} from './rules/trade.ts';
import { applyDiscard, applyMoveRobber, applySteal, discardError, moveRobberError, stealError } from './rules/robber.ts';
import { applyEndTurn, endTurnError } from './rules/turn.ts';

type Entry<T extends ActionType> = [
  (cfg: GameConfig, s: GameState, a: Action<T>) => string | null,
  (ctx: Ctx, a: Action<T>) => void,
];
type Table = { [K in ActionType]: Entry<K> };

const TABLE: Table = {
  roll_dice: [rollError, applyRoll],
  build: [buildError, applyBuild],
  buy_dev_card: [buyDevError, applyBuyDev],
  play_dev_card: [playDevError, applyPlayDev],
  dev_card_action: [devActionError, applyDevAction],
  trade_bank: [bankError, applyBank],
  trade_offer: [offerError, applyOffer],
  trade_respond: [respondError, applyRespond],
  trade_accept: [acceptError, applyAccept],
  trade_cancel: [cancelError, applyCancel],
  trade_expire: [expireError, applyCancel],
  end_turn: [endTurnError, applyEndTurn],
  discard: [discardError, applyDiscard],
  move_robber: [moveRobberError, applyMoveRobber],
  steal: [stealError, applySteal],
};

export const ACTION_TYPES = Object.keys(TABLE) as ActionType[];

/**
 * The one entry point for game mutation. Pure: never mutates `state`; on failure returns it untouched.
 * Callers (room/transport) must set `player_id` from the authenticated connection, never from the payload.
 */
export function reduce(cfg: GameConfig, state: GameState, action: Action): ReduceResult {
  const fail = (error: string): ReduceResult => ({ ok: false, error, state, events: [] });
  if (!action || typeof action.type !== 'string' || typeof action.player_id !== 'string') return fail('Malformed action');
  const entry = (TABLE as Record<string, unknown>)[action.type] as Entry<ActionType> | undefined;
  if (!entry) return fail(`Unknown action: ${action.type}`);
  if (action.player_id !== SYSTEM && !state.players[action.player_id]) return fail('Unknown player');
  const a = { type: action.type, player_id: action.player_id, params: action.params ?? {} } as Action;
  if (typeof a.params !== 'object' || Array.isArray(a.params)) return fail('Malformed action');

  const [validate, apply] = entry;
  const err = validate(cfg, state, a);
  if (err) return fail(err);

  const s = structuredClone(state);
  const ctx: Ctx = { cfg, s, events: [] };
  apply(ctx, a);
  if (s.phase === 'setup') {
    advanceSetup(ctx, a);
  } else {
    updateAchievements(ctx);
    checkWin(ctx);
  }
  return { ok: true, state: s, events: ctx.events };
}
