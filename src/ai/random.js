import { randInt, shuffle } from '../engine/rng.js';
import { chance, choice, groupByType, legalToAction } from './util.js';

const PRIORITY = ['build', 'buy_dev_card', 'roll_dice', 'move_robber', 'steal', 'dev_card_action', 'discard', 'end_turn'];

function hand(p) {
  return Object.entries(p.resources).flatMap(([k, n]) => Array(n).fill(k));
}

export const randomStrategy = {
  newMemory: () => ({}),

  chooseAction(cfg, view, rng) {
    const legal = view.legal_actions;
    if (!legal.length) return null;
    const by = groupByType(legal);
    for (const t of PRIORITY) if (by[t]) return legalToAction(choice(rng, by[t]), view.me);
    return legalToAction(choice(rng, legal), view.me);
  },

  chooseDiscard(cfg, view, count, rng) {
    const cards = shuffle(rng, hand(view.players[view.me])).slice(0, count);
    const out = {};
    for (const c of cards) out[c] = (out[c] ?? 0) + 1;
    return out;
  },

  chooseYearOfPlenty(cfg, view, count, rng) {
    const kinds = Object.keys(cfg.resource_types);
    const out = {};
    for (let i = 0; i < count; i++) { const k = kinds[randInt(rng, 0, kinds.length - 1)]; out[k] = (out[k] ?? 0) + 1; }
    return out;
  },

  chooseMonopoly(cfg, view, rng) {
    return choice(rng, Object.keys(cfg.resource_types));
  },

  evaluateTrade(cfg, view, offer, rng) {
    const me = view.players[view.me];
    for (const [r, n] of Object.entries(offer.requesting)) if ((me.resources[r] ?? 0) < n) return false;
    return chance(rng, 0.25);
  },

  counterOffer: () => null,
};
