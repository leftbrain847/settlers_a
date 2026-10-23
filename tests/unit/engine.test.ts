import test from 'node:test';
import assert from 'node:assert/strict';
import { topology } from '../../games/settlers/engine/index.ts';
import { newGame, playRandom } from './helpers.ts';

test('standard board has the right shape', () => {
  const { state, cfg } = newGame(1);
  const topo = topology(3);
  assert.equal(state.board.hexes.length, 19);
  assert.equal(topo.intersections.length, 54);
  assert.equal(topo.edges.length, 72);
  assert.equal(Object.keys(state.board.ports).length, 18); // 9 ports x 2 intersections
  const tokens = state.board.hexes.map((h) => h.number_token).filter((n): n is number => n !== null).sort((a, b) => a - b);
  assert.deepEqual(tokens, [...cfg.board_template.number_tokens].sort((a, b) => a - b));
  assert.equal(state.board.hexes[state.board.robber_hex!]!.terrain, 'desert');
  assert.equal(state.dev_card_deck.length, 25);
});

test('no adjacent 6/8 tokens on standard boards', () => {
  const topo = topology(3);
  let bad = 0;
  for (let seed = 0; seed < 200; seed++) {
    const { state } = newGame(seed);
    for (const h of state.board.hexes) {
      if (![6, 8].includes(h.number_token ?? 0)) continue;
      for (const nb of topo.hexAdj[h.id]!) if ([6, 8].includes(state.board.hexes[nb]!.number_token ?? 0)) bad++;
    }
  }
  assert.equal(bad, 0);
});

test('same seed + same actions => identical game (determinism)', () => {
  const a = playRandom(42);
  const b = playRandom(42);
  assert.deepEqual(a.state, b.state);
});

test('random games run to completion without stuck states and keep invariants', () => {
  let finished = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const n = 2 + (seed % 3);
    const { state, steps } = playRandom(seed, {
      n,
      onStep: (a, res, prev, cfg) => {
        const s = res.state;
        // resources never negative; piece limits respected
        for (const p of Object.values(s.players)) {
          for (const v of Object.values(p.resources)) assert.ok(v >= 0, `negative resource after ${a.type}`);
          for (const [bt, c] of Object.entries(p.buildings_placed)) assert.ok(c <= cfg.building_types[bt].max_per_player);
        }
        // input state never mutated
        assert.notEqual(prev, s);
      },
    });
    assert.ok(steps > 20);
    if (state.phase === 'finished') finished++;
  }
  assert.ok(finished > 20, `only ${finished}/60 games finished`);
});
