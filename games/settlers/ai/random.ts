import { randInt, shuffle } from '../engine/rng.ts';
import type { LegalAction, ResMap } from '../engine/types.ts';
import type { Strategy } from './types.ts';
import { chance, choice, groupByType, legalToAction, selfView } from './util.ts';
import type { SelfView } from './util.ts';

const PRIORITY: LegalAction['type'][] = ['build', 'buy_dev_card', 'roll_dice', 'move_robber', 'steal', 'dev_card_action', 'discard', 'end_turn'];

function hand(p: SelfView): string[] {
  return Object.entries(p.resources).flatMap(([k, n]) => Array(n).fill(k));
}

export const randomStrategy: Strategy = {
  newMemory: () => ({ offeredTradeThisTurn: false }),

  chooseAction(cfg, view, rng) {
    const legal = view.legal_actions;
    if (!legal.length) return null;
    const by = groupByType(legal);
    for (const t of PRIORITY) {
      const group = by[t];
      if (group?.length) return legalToAction(choice<LegalAction>(rng, group), view.me);
    }
    return legalToAction(choice(rng, legal), view.me);
  },

  chooseDiscard(cfg, view, count, rng) {
    const cards = shuffle(rng, hand(selfView(view))).slice(0, count);
    const out: ResMap = {};
    for (const c of cards) out[c] = (out[c] ?? 0) + 1;
    return out;
  },

  chooseYearOfPlenty(cfg, view, count, rng) {
    const kinds = Object.keys(cfg.resource_types);
    const out: ResMap = {};
    for (let i = 0; i < count; i++) { const k = kinds[randInt(rng, 0, kinds.length - 1)]!; out[k] = (out[k] ?? 0) + 1; }
    return out;
  },

  chooseMonopoly(cfg, view, rng) {
    return choice(rng, Object.keys(cfg.resource_types));
  },

  evaluateTrade(cfg, view, offer, rng) {
    const me = selfView(view);
    for (const [r, n] of Object.entries(offer.requesting)) if ((me.resources[r] ?? 0) < n) return false;
    return chance(rng, 0.25);
  },

  counterOffer: () => null,
};
