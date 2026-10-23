import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFor, redactEvents, reduce } from '../../games/settlers/engine/index.ts';
import type { GameState } from '../../games/settlers/engine/index.ts';
import { mk, playRandom } from './helpers.ts';

// A mid-game state with hands, dev cards, a deck and RNG state worth protecting.
function midGame(seed: number, stopAfter = 220): { state: GameState } {
  let count = 0;
  let snap: { state: GameState } | undefined;
  playRandom(seed, { n: 3, settings: { vp_to_win: 50 }, maxSteps: stopAfter, onStep: (_a, res) => { if (++count === stopAfter) snap = res; } });
  if (!snap) throw new Error('game ended before the snapshot point');
  return snap;
}

test('viewFor never exposes rng or the deck order', () => {
  const { state } = midGame(5);
  const cfg = playRandom(5, { maxSteps: 1 }).cfg;
  for (const pid of state.player_order) {
    const json = JSON.stringify(viewFor(cfg, state, pid));
    assert.ok(!json.includes('"rng"'));
    assert.ok(!json.includes('dev_card_deck'));
    assert.ok(json.includes('dev_cards_remaining'));
  }
});

test('non-interference: changing a player\'s private data does not change anyone else\'s view', () => {
  for (const seed of [3, 5, 8, 13]) {
    const { state } = midGame(seed);
    const cfg = playRandom(seed, { maxSteps: 1 }).cfg;
    const [A, B] = state.player_order as [string, string];
    const mutated = structuredClone(state);
    const pB = mutated.players[B]!;

    // same hand SIZE, different composition
    const total = Object.values(pB.resources).reduce((x: number, y: number) => x + y, 0);
    for (const k of Object.keys(pB.resources)) pB.resources[k] = 0;
    pB.resources.wheat = total;
    // same dev-card COUNT, different cards
    pB.dev_cards = pB.dev_cards.map(() => 'victory_point');
    pB.hidden_vp += 3;
    // deck order and rng are secret
    mutated.dev_card_deck = [...mutated.dev_card_deck].reverse();
    mutated.rng = (mutated.rng + 12345) >>> 0;

    assert.deepEqual(viewFor(cfg, mutated, A), viewFor(cfg, state, A), `seed ${seed}: A's view leaked B's private data`);
    // ...and B's own view does see the change (so the test can fail)
    assert.notDeepEqual(viewFor(cfg, mutated, B), viewFor(cfg, state, B));
  }
});

test('other players\' hands are counts only; own hand is full; game over reveals everything', () => {
  const { state } = midGame(5);
  const cfg = playRandom(5, { maxSteps: 1 }).cfg;
  const [A, B] = state.player_order as [string, string];
  const v = viewFor(cfg, state, A);
  assert.ok(v.players[A]!.resources && v.players[A]!.dev_cards && 'hidden_vp' in v.players[A]!);
  for (const k of ['resources', 'dev_cards', 'hidden_vp']) assert.ok(!(k in v.players[B]!), `${k} leaked`);
  assert.equal(v.players[B].resource_count, Object.values(state.players[B].resources).reduce((x, y) => x + y, 0));

  const over = structuredClone(state);
  over.phase = 'finished';
  assert.ok('resources' in viewFor(cfg, over, A).players[B]);
});

test('views are detached copies (a UI cannot corrupt engine state)', () => {
  const { state } = midGame(5);
  const cfg = playRandom(5, { maxSteps: 1 }).cfg;
  const before = JSON.stringify(state);
  const v = viewFor(cfg, state, state.player_order[0]!);
  v.board.hexes[0]!.terrain = 'hacked';
  v.players[state.player_order[0]!]!.resources!.wood = 999;
  assert.equal(JSON.stringify(state), before);
});

test('event redaction hides purchased card, stolen resource and discard contents from non-involved players', () => {
  const ev = [
    { type: 'dev_card_bought', player: 'p1', card: 'knight', is_vp: false },
    { type: 'resource_stolen', stealer: 'p1', target: 'p2', resource: 'wood' },
    { type: 'discarded', player: 'p1', resources: { wood: 2, clay: 1 } },
  ];
  const p3 = JSON.stringify(redactEvents(ev, 'p3'));
  assert.ok(!/knight|wood|clay|is_vp/.test(p3), p3);
  assert.ok(JSON.stringify(redactEvents(ev, 'p1')).includes('knight'));
  assert.ok(JSON.stringify(redactEvents(ev, 'p2')).includes('wood'));
  assert.ok(JSON.stringify(redactEvents(ev, 'p1')).includes('clay'));
});

test('clients cannot forge system actions or act as other players', () => {
  const { state } = midGame(5);
  const cfg = playRandom(5, { maxSteps: 1 }).cfg;
  const offerId = Object.keys(state.trade_offers)[0] ?? 'nope';
  assert.equal(reduce(cfg, state, mk('trade_expire', 'p1', { trade_id: offerId })).ok, false);
  assert.equal(reduce(cfg, state, mk('end_turn', '__system__')).ok, false);
  assert.equal(reduce(cfg, state, mk('end_turn', 'nobody')).ok, false);
  assert.equal(reduce(cfg, state, mk('roll_dice', 'p1', 'x' as unknown as object)).ok, false);
});
