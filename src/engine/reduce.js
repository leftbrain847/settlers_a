import { SYSTEM } from './rules/common.js';
import { applyBuild, buildError } from './rules/build.js';
import { applyRoll, rollError } from './rules/roll.js';
import { advanceSetup } from './rules/setup.js';
import { checkWin, updateAchievements } from './rules/achievements.js';
import { applyBuyDev, applyDevAction, applyPlayDev, buyDevError, devActionError, playDevError } from './rules/devcards.js';
import {
  acceptError, applyAccept, applyBank, applyCancel, applyOffer, applyRespond,
  bankError, cancelError, expireError, offerError, respondError,
} from './rules/trade.js';
import { applyDiscard, applyMoveRobber, applySteal, discardError, moveRobberError, stealError } from './rules/robber.js';
import { applyEndTurn, endTurnError } from './rules/turn.js';

const TABLE = {
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

export const ACTION_TYPES = Object.keys(TABLE);

/**
 * The one entry point for game mutation. Pure: never mutates `state`; on failure returns it untouched.
 * Callers (room/transport) must set `player_id` from the authenticated connection, never from the payload.
 * @returns {import('./types.js').ReduceResult}
 */
export function reduce(cfg, state, action) {
  const fail = (error) => ({ ok: false, error, state, events: [] });
  if (!action || typeof action.type !== 'string' || typeof action.player_id !== 'string') return fail('Malformed action');
  const entry = TABLE[action.type];
  if (!entry) return fail(`Unknown action: ${action.type}`);
  if (action.player_id !== SYSTEM && !state.players[action.player_id]) return fail('Unknown player');
  const a = { type: action.type, player_id: action.player_id, params: action.params ?? {} };
  if (typeof a.params !== 'object' || Array.isArray(a.params)) return fail('Malformed action');

  const [validate, apply] = entry;
  const err = validate(cfg, state, a);
  if (err) return fail(err);

  const s = structuredClone(state);
  const ctx = { cfg, s, events: [] };
  apply(ctx, a);
  if (s.phase === 'setup') {
    advanceSetup(ctx, a);
  } else {
    updateAchievements(ctx);
    checkWin(ctx);
  }
  return { ok: true, state: s, events: ctx.events };
}
