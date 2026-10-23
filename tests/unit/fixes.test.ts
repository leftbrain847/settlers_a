import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../games/settlers/engine/index.ts';
import type { GameConfig, GameState, ResMap } from '../../games/settlers/engine/index.ts';
import { updateAchievements } from '../../games/settlers/engine/rules/achievements.ts';
import { mk, toPlaying } from './helpers.ts';

const act = (cfg: GameConfig, s: GameState, type: string, pid: string, params: object = {}) => reduce(cfg, s, mk(type, pid, params));
const give = (s: GameState, pid: string, res: ResMap): void => { for (const [k, n] of Object.entries(res)) s.players[pid]!.resources[k] = (s.players[pid]!.resources[k] ?? 0) + n; };

// Largest Army is the easiest metric to drive directly: played knights.
function setKnights(s: GameState, pid: string, n: number): void { s.players[pid]!.played_dev_cards = Array<string>(n).fill('knight'); }
function run(cfg: GameConfig, s: GameState): void { updateAchievements({ cfg, s, events: [] }); }
const holder = (s: GameState): string | undefined => s.player_order.find((p) => s.players[p]!.achievements.includes('largest_army'));

test('achievements: holder keeps the card on a tie; a strictly higher count takes it', () => {
  const { cfg, s } = toPlaying(2, { n: 3 });
  const [a, b, c] = s.player_order as [string, string, string];
  setKnights(s, b, 3); run(cfg, s);
  assert.equal(holder(s), b);
  setKnights(s, a, 3); run(cfg, s);              // a is earlier in seat order but only ties
  assert.equal(holder(s), b, 'tie must not steal the card');
  setKnights(s, a, 4); run(cfg, s);
  assert.equal(holder(s), a);
  setKnights(s, c, 4); run(cfg, s);
  assert.equal(holder(s), a, 'holder keeps it when someone ties');
});

test('achievements: below the minimum, or overtaken by a tie of two others, returns the card to the bank', () => {
  const { cfg, s } = toPlaying(2, { n: 3 });
  const [a, b, c] = s.player_order as [string, string, string];
  setKnights(s, a, 3); run(cfg, s);
  assert.equal(holder(s), a);
  setKnights(s, a, 2); run(cfg, s);              // can only happen through a rule change, but must be handled
  assert.equal(holder(s), undefined);
  setKnights(s, a, 3); setKnights(s, b, 5); setKnights(s, c, 5); run(cfg, s);
  assert.equal(holder(s), undefined, 'nobody holds it when two others tie for the top');
});

test('pending decisions block buying, bank trades, and new offers', () => {
  const { cfg, s } = toPlaying(3, { n: 2 });
  const cur = s.player_order[s.current_player_idx]!;
  s.dice_rolled = true;
  give(s, cur, { rock: 3, wheat: 3, sheep: 3, wood: 4, clay: 4 });
  for (const setup of [(x: GameState) => { x.pending_robber_move = true; }, (x: GameState) => { x.pending_discards = { [cur]: 1 }; }, (x: GameState) => { x.pending_action = { type: 'choose_monopoly_resource', player: cur }; }]) {
    const st = structuredClone(s);
    setup(st);
    assert.equal(act(cfg, st, 'buy_dev_card', cur).ok, false);
    assert.equal(act(cfg, st, 'trade_bank', cur, { give_resource: 'wood', want_resource: 'rock' }).ok, false);
    assert.equal(act(cfg, st, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { rock: 1 } }).ok, false);
  }
  s.players[cur]!.dev_cards = ['knight'];
  const st = structuredClone(s);
  st.pending_robber_move = true;
  assert.equal(act(cfg, st, 'play_dev_card', cur, { card_type: 'knight' }).ok, false);
});

test('completing a counter-offer closes the original offer and sibling counters', () => {
  const { cfg, s } = toPlaying(4, { n: 3 });
  const cur = s.player_order[s.current_player_idx]!;
  const [o1, o2] = s.player_order.filter((p) => p !== cur) as [string, string];
  s.dice_rolled = true;
  give(s, cur, { wood: 1, wheat: 1 }); give(s, o1, { sheep: 1 }); give(s, o2, { rock: 1 });
  let r = act(cfg, s, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } });
  assert.ok(r.ok); let st = r.state;
  const id = Object.keys(st.trade_offers)[0]!;
  r = act(cfg, st, 'trade_offer', o1, { offering: { sheep: 1 }, requesting: { wood: 1 }, counter_to: id });
  assert.ok(r.ok, r.error); st = r.state;
  r = act(cfg, st, 'trade_offer', o2, { offering: { rock: 1 }, requesting: { wood: 1 }, counter_to: id });
  assert.ok(r.ok, r.error); st = r.state;
  assert.equal(Object.keys(st.trade_offers).length, 3);
  const c1 = st.trade_offers[id]!.counter_ids[0]!;
  const done = act(cfg, st, 'trade_respond', cur, { trade_id: c1, response: 'accept' });
  assert.ok(done.ok && done.events.some((e) => e.type === 'trade_completed'));
  assert.deepEqual(done.state.trade_offers, {}, 'nothing stale left open');
});

test('offer limits: one open offer per player, one counter per offer', () => {
  const { cfg, s } = toPlaying(4, { n: 3 });
  const cur = s.player_order[s.current_player_idx]!;
  const o1 = s.player_order.find((p) => p !== cur)!;
  s.dice_rolled = true;
  give(s, cur, { wood: 3 }); give(s, o1, { sheep: 3 });
  let r = act(cfg, s, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } });
  assert.ok(r.ok); let st = r.state;
  assert.equal(act(cfg, st, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { rock: 1 } }).ok, false, 'second open offer');
  const id = Object.keys(st.trade_offers)[0]!;
  r = act(cfg, st, 'trade_offer', o1, { offering: { sheep: 1 }, requesting: { wood: 1 }, counter_to: id });
  assert.ok(r.ok); st = r.state;
  assert.equal(act(cfg, st, 'trade_offer', o1, { offering: { sheep: 2 }, requesting: { wood: 1 }, counter_to: id }).ok, false, 'second counter');
});

