import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, legalActions, topology, SYSTEM } from '../../src/engine/index.js';
import { roadLength } from '../../src/engine/rules/achievements.js';
import { newGame } from './helpers.js';

// Fast-forward setup by always taking the first legal placement.
function toPlaying(seed = 1, opts = {}) {
  const g = newGame(seed, opts);
  let s = g.state;
  while (s.phase === 'setup') {
    const pid = s.player_order[s.setup_player_idx];
    const la = legalActions(g.cfg, s, pid)[0];
    const { type, ...params } = la;
    const r = reduce(g.cfg, s, { type, player_id: pid, params });
    assert.ok(r.ok, r.error);
    s = r.state;
  }
  return { cfg: g.cfg, s };
}
const act = (cfg, s, type, player_id, params = {}) => reduce(cfg, s, { type, player_id, params });
const give = (s, pid, res) => { for (const [k, n] of Object.entries(res)) s.players[pid].resources[k] += n; };

test('setup rejects a road before the settlement and a road away from the new settlement', () => {
  const g = newGame(2);
  const pid = g.state.player_order[0];
  assert.equal(act(g.cfg, g.state, 'build', pid, { building_type: 'road', location: 0 }).ok, false);
  const r1 = act(g.cfg, g.state, 'build', pid, { building_type: 'settlement', location: 0 });
  assert.ok(r1.ok);
  assert.equal(act(g.cfg, r1.state, 'build', pid, { building_type: 'settlement', location: 20 }).ok, false, 'second settlement');
  const topo = topology(3);
  const far = topo.edges.find((e) => e.a !== 0 && e.b !== 0).id;
  assert.equal(act(g.cfg, r1.state, 'build', pid, { building_type: 'road', location: far }).ok, false, 'far road');
  assert.equal(act(g.cfg, r1.state, 'build', pid, { building_type: 'road', location: topo.interEdges[0][0] }).ok, true);
});

test('road length: a straight chain counts, an opponent building cuts it', () => {
  const { s } = toPlaying(3);
  const topo = topology(3);
  s.board.buildings.e = {}; s.board.buildings.i = {};
  // find a simple path of 6 edges
  let path = null;
  const dfs = (node, used, nodes) => {
    if (used.length === 6) { path = [...used]; return true; }
    for (const e of topo.interEdges[node]) {
      const ed = topo.edges[e]; const nb = ed.a === node ? ed.b : ed.a;
      if (nodes.includes(nb) || used.includes(e)) continue;
      if (dfs(nb, [...used, e], [...nodes, nb])) return true;
    }
    return false;
  };
  dfs(0, [], [0]);
  assert.ok(path);
  for (const e of path) s.board.buildings.e[e] = { type: 'road', player: 'p1' };
  assert.equal(roadLength(s, 'p1'), 6);
  // opponent settlement on the node between edge 2 and 3 of the path
  const e2 = topo.edges[path[2]], e3 = topo.edges[path[3]];
  const mid = [e2.a, e2.b].find((n) => n === e3.a || n === e3.b);
  s.board.buildings.i[mid] = { type: 'settlement', player: 'p2' };
  assert.equal(roadLength(s, 'p1'), 3, 'split into 3 + 3 (the longer side wins)');
});

test('human offerer must confirm; counter-offers auto-finalize; bot offerers auto-finalize', () => {
  const { cfg, s } = toPlaying(4, { n: 3 });
  let st = s;
  const cur = st.player_order[st.current_player_idx];
  const [o1, o2] = st.player_order.filter((p) => p !== cur);
  st = act(cfg, st, 'roll_dice', cur).state;
  st.dice_rolled = true;
  give(st, cur, { wood: 1 }); give(st, o1, { clay: 1 }); give(st, o2, { clay: 1 });

  let r = act(cfg, st, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } });
  assert.ok(r.ok); st = r.state;
  const id = Object.keys(st.trade_offers)[0];

  r = act(cfg, st, 'trade_respond', o1, { trade_id: id, response: 'accept' });
  assert.ok(r.ok); st = r.state;
  assert.ok(st.trade_offers[id], 'not finalized until the human offerer confirms');
  assert.equal(r.events.some((e) => e.type === 'trade_completed'), false);

  assert.equal(act(cfg, st, 'trade_accept', o2, { trade_id: id, accepter_id: o1 }).ok, false, 'third party cannot finalize');
  const done = act(cfg, st, 'trade_accept', cur, { trade_id: id, accepter_id: o1 });
  assert.ok(done.ok);
  assert.equal(done.state.players[cur].resources.clay, st.players[cur].resources.clay + 1);
  assert.deepEqual(done.state.trade_offers, {});

  // counter-offer from o2: cur accepts it and it finalizes immediately
  give(st, o2, { sheep: 1 }); give(st, cur, { wheat: 1 });
  r = act(cfg, st, 'trade_offer', o2, { offering: { sheep: 1 }, requesting: { wheat: 1 }, counter_to: id });
  assert.ok(r.ok, r.error); st = r.state;
  assert.equal(st.trade_offers[id].responses[o2], 'countered');
  const cid = st.trade_offers[id].counter_ids[0];
  r = act(cfg, st, 'trade_respond', cur, { trade_id: cid, response: 'accept' });
  assert.ok(r.ok, r.error);
  assert.ok(r.events.some((e) => e.type === 'trade_completed'));
  assert.equal(r.state.trade_offers[cid], undefined);

  // a non-current player may not start a free-standing offer
  give(st, o1, { rock: 1 });
  assert.equal(act(cfg, st, 'trade_offer', o1, { offering: { rock: 1 }, requesting: { wood: 1 } }).ok, false);

  // bot offerer: accept finalizes immediately
  const bots = structuredClone(st);
  bots.trade_offers = {};
  bots.players[cur].is_ai = true;
  give(bots, cur, { wood: 1 });
  r = act(cfg, bots, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } });
  const bid = Object.keys(r.state.trade_offers)[0];
  give(r.state, o1, { clay: 1 });
  const fin = act(cfg, r.state, 'trade_respond', o1, { trade_id: bid, response: 'accept' });
  assert.ok(fin.events.some((e) => e.type === 'trade_completed'));
});

test('offers cannot be accepted after the offerer spent the goods; malformed resource maps are rejected', () => {
  const { cfg, s } = toPlaying(4, { n: 2 });
  let st = s;
  const cur = st.player_order[st.current_player_idx];
  const other = st.player_order.find((p) => p !== cur);
  st.dice_rolled = true;
  give(st, cur, { wood: 1 }); give(st, other, { clay: 1 });
  st = act(cfg, st, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } }).state;
  const id = Object.keys(st.trade_offers)[0];
  st.players[cur].resources.wood = 0;
  assert.equal(act(cfg, st, 'trade_respond', other, { trade_id: id, response: 'accept' }).ok, false);
  for (const bad of [{ wood: -1 }, { wood: 1.5 }, { gold: 1 }, {}, [], null]) {
    assert.equal(act(cfg, { ...st, trade_offers: {} }, 'trade_offer', cur, { offering: bad, requesting: { clay: 1 } }).ok, false);
  }
});

test('trade_expire is system-only and removes the offer; trade_cancel is offerer-only', () => {
  const { cfg, s } = toPlaying(4, { n: 2 });
  let st = s;
  const cur = st.player_order[st.current_player_idx];
  const other = st.player_order.find((p) => p !== cur);
  st.dice_rolled = true;
  give(st, cur, { wood: 2 });
  st = act(cfg, st, 'trade_offer', cur, { offering: { wood: 1 }, requesting: { clay: 1 } }).state;
  const id = Object.keys(st.trade_offers)[0];
  assert.equal(act(cfg, st, 'trade_expire', cur, { trade_id: id }).ok, false);
  assert.equal(act(cfg, st, 'trade_cancel', other, { trade_id: id }).ok, false);
  assert.ok(act(cfg, st, 'trade_cancel', cur, { trade_id: id }).ok);
  const ex = act(cfg, st, 'trade_expire', SYSTEM, { trade_id: id });
  assert.ok(ex.ok);
  assert.deepEqual(ex.state.trade_offers, {});
});

test('default trade timers: 70s between humans, 20s for bot offers, counters unchanged at 15s', () => {
  const { cfg } = toPlaying(1);
  assert.equal(cfg.trade_rules.human_response_timer, 70);
  assert.equal(cfg.trade_rules.bot_offer_timer, 20);
  assert.equal(cfg.trade_rules.counter_timer, 15);
});

test('friendly robber blocks stealing during the first turns only', () => {
  for (const [friendly, expectSteal] of [[true, false], [false, true]]) {
    const { cfg, s } = toPlaying(6, { n: 2, settings: { friendly_robber: friendly } });
    const cur = s.player_order[s.current_player_idx];
    const victim = s.player_order.find((p) => p !== cur);
    s.dice_rolled = true;
    s.pending_robber_move = true;
    s.players[victim].resources.wood = 3;
    const iid = Number(Object.entries(s.board.buildings.i).find(([, b]) => b.player === victim)[0]);
    s.players[cur].resources = Object.fromEntries(Object.keys(cfg.resource_types).map((k) => [k, 0]));
    const hex = topology(3).intersections[iid].hexIds.find((h) => h !== s.board.robber_hex);
    s.players[victim].resources = { ...s.players[victim].resources, wood: 3 };
    const r = act(cfg, s, 'move_robber', cur, { hex_id: hex });
    assert.ok(r.ok, r.error);
    const stolen = r.events.some((e) => e.type === 'resource_stolen');
    assert.equal(stolen || r.state.pending_robber_steal, expectSteal);
  }
});

test('randomize_order shuffles seats deterministically and everyone keeps their id', async () => {
  const { configFromSettings, createGame, addPlayer, startGame } = await import('../../src/engine/index.js');
  const cfg = configFromSettings({});
  const firsts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    let s = createGame(cfg, { game_id: 'o', seed });
    for (const n of ['A', 'B', 'C']) s = addPlayer(cfg, s, { name: n });
    const a = startGame(cfg, s, { randomize_order: true }).state;
    const b = startGame(cfg, s, { randomize_order: true }).state;
    assert.deepEqual(a.player_order, b.player_order);
    assert.deepEqual([...a.player_order].sort(), ['p1', 'p2', 'p3']);
    firsts.add(a.player_order[0]);
  }
  assert.equal(firsts.size, 3, 'every seat gets to go first');
});
