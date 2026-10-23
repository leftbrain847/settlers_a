import { topology } from '../engine/topology.js';
import { chance, choice, groupByType, legalToAction, maxBy, scoreIntersection, sumVals } from './util.js';
import { randomStrategy } from './random.js';

const GOAL_CITY = { rock: 3, wheat: 2 };
const GOAL_SETTLEMENT = { clay: 1, wood: 1, wheat: 1, sheep: 1 };
const GOAL_ROAD = { clay: 1, wood: 1 };
const GOAL_DEV = { rock: 1, wheat: 1, sheep: 1 };

function goalsFor(p) {
  const settlements = p.buildings_placed.settlement ?? 0;
  const cities = p.buildings_placed.city ?? 0;
  const goals = [];
  if (settlements > 0) goals.push(GOAL_CITY);
  if (settlements + cities < 5) goals.push(GOAL_SETTLEMENT);
  goals.push(GOAL_ROAD, GOAL_DEV);
  return goals;
}

const openSpot = (view, topo, iid) =>
  !view.board.buildings.i[iid] && !topo.adjInter[iid].some((n) => view.board.buildings.i[n]);

function nearbySpot(view, topo, start, depth) {
  const visited = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const iid of frontier) {
      for (const adj of topo.adjInter[iid]) {
        if (visited.has(adj)) continue;
        visited.add(adj);
        if (view.board.buildings.i[adj]) continue;
        if (openSpot(view, topo, adj)) return true;
        next.push(adj);
      }
    }
    frontier = next;
  }
  return false;
}

function roadScore(view, topo, a) {
  const e = topo.edges[a.location];
  let score = 0;
  for (const iid of [e.a, e.b]) if (openSpot(view, topo, iid)) score = Math.max(score, scoreIntersection(view, topo, iid));
  return score;
}

function chooseRoad(view, topo, roads, rng) {
  let best = null, bestScore = -1;
  for (const a of roads) {
    const s = roadScore(view, topo, a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best ?? choice(rng, roads);
}

function roadHasValue(view, topo, me, a) {
  if ((me.buildings_placed.road ?? 0) >= 13) return false;
  const e = topo.edges[a.location];
  return [e.a, e.b].some((i) => nearbySpot(view, topo, i, 2));
}

function chooseBankTrade(me, trades) {
  for (const goal of goalsFor(me)) {
    const missing = {};
    for (const [r, need] of Object.entries(goal)) {
      const deficit = need - (me.resources[r] ?? 0);
      if (deficit > 0) missing[r] = deficit;
    }
    if (!Object.keys(missing).length) continue;
    for (const want of Object.keys(missing).sort((x, y) => missing[x] - missing[y])) {
      const matching = trades.filter((t) => t.want_resource === want);
      if (!matching.length) continue;
      const value = (t) => (me.resources[t.give_resource] ?? 0) - (t.give_resource in goal ? goal[t.give_resource] : 0);
      const best = maxBy(matching, value);
      if (value(best) > 0) return best;
    }
  }
  if (sumVals(me.resources) >= 7) {
    for (const t of trades) if ((me.resources[t.give_resource] ?? 0) >= 5) return t;
  }
  return null;
}

function choosePlayerTrade(cfg, me) {
  for (const goal of goalsFor(me)) {
    const missing = {}, surplus = {};
    for (const r of Object.keys(cfg.resource_types)) {
      const have = me.resources[r] ?? 0, need = goal[r] ?? 0;
      if (need > have) missing[r] = need - have;
      else if (have > need + 1) surplus[r] = have - need - 1;
    }
    if (!Object.keys(missing).length || !Object.keys(surplus).length) continue;
    const want = maxBy(Object.keys(missing), (r) => missing[r]);
    const give = maxBy(Object.keys(surplus), (r) => surplus[r]);
    if (give === want) continue;
    return { offering: { [give]: 1 }, requesting: { [want]: 1 } };
  }
  return null;
}

function chooseRobberHex(view, topo, me, actions, rng) {
  let leader = null, leaderVp = -1;
  for (const pid of view.player_order) {
    if (pid === view.me) continue;
    const vp = view.players[pid].vp; // public VP only: a fair bot never sees hidden VP cards
    if (vp > leaderVp) { leaderVp = vp; leader = pid; }
  }
  let best = null, bestScore = -1;
  for (const a of actions) {
    const hex = view.board.hexes[a.hex_id];
    if (!hex?.number_token) continue;
    const prod = Math.max(0, 6 - Math.abs(7 - hex.number_token));
    let score = 0;
    for (const iid of topo.hexIntersections[a.hex_id]) {
      const b = view.board.buildings.i[iid];
      if (!b) continue;
      if (b.player === leader) score += prod * 2;
      else if (b.player !== view.me) score += prod;
    }
    if (score > bestScore) { bestScore = score; best = a; }
  }
  void me;
  return best ?? choice(rng, actions);
}

export const smartStrategy = {
  newMemory: () => ({ offeredTradeThisTurn: false }),

  chooseAction(cfg, view, rng, mem) {
    const legal = view.legal_actions;
    if (!legal.length) return null;
    const topo = topology(view.board.rings);
    const by = groupByType(legal);
    const me = view.players[view.me];
    const act = (la) => legalToAction(la, view.me);

    if (by.roll_dice) mem.offeredTradeThisTurn = false;

    if (by.roll_dice) return act(choice(rng, by.roll_dice));
    if (by.move_robber) return act(chooseRobberHex(view, topo, me, by.move_robber, rng));
    if (by.steal) {
      const best = maxBy(by.steal, (a) => view.players[a.target_player].resource_count);
      return act(best ?? choice(rng, by.steal));
    }
    if (by.discard) return act(choice(rng, by.discard));
    if (by.dev_card_action) return act(choice(rng, by.dev_card_action));

    if (by.play_dev_card) return act(choice(rng, by.play_dev_card));

    const builds = by.build ?? [];
    const cities = builds.filter((a) => a.building_type === 'city');
    const settlements = builds.filter((a) => a.building_type === 'settlement');
    const roads = builds.filter((a) => a.building_type === 'road');
    const settlementCount = me.buildings_placed.settlement ?? 0;
    const roadCount = me.buildings_placed.road ?? 0;

    if (cities.length) return act(maxBy(cities, (a) => scoreIntersection(view, topo, a.location)));
    if (settlements.length) return act(maxBy(settlements, (a) => scoreIntersection(view, topo, a.location)));

    if (roads.length) {
      const chosen = chooseRoad(view, topo, roads, rng);
      if (chosen && roadHasValue(view, topo, me, chosen)) {
        if (settlementCount < 4 || roadCount < 5) return act(chosen);
        if (chance(rng, 0.6)) return act(chosen);
      }
    }

    if (by.trade_bank) {
      const t = chooseBankTrade(me, by.trade_bank);
      if (t) return act(t);
    }

    if (by.buy_dev_card) {
      const knights = me.played_dev_cards.filter((c) => cfg.dev_card_types[c]?.persistent_tag === 'knight').length;
      if (knights >= 1 || sumVals(me.resources) >= 7 || (!roads.length && !settlements.length && !cities.length)) {
        return act(by.buy_dev_card[0]);
      }
    }

    if (roads.length) return act(chooseRoad(view, topo, roads, rng));

    if (by.trade_offer && !mem.offeredTradeThisTurn) {
      const t = choosePlayerTrade(cfg, me);
      if (t) { mem.offeredTradeThisTurn = true; return { type: 'trade_offer', player_id: view.me, params: t }; }
    }

    if (by.end_turn) return act(by.end_turn[0]);
    return act(choice(rng, legal));
  },

  chooseDiscard(cfg, view, count) {
    const me = view.players[view.me];
    const cards = Object.entries(me.resources).flatMap(([k, n]) => Array(n).fill(k));
    cards.sort((a, b) => me.resources[b] - me.resources[a]);
    const out = {};
    for (const c of cards.slice(0, count)) out[c] = (out[c] ?? 0) + 1;
    return out;
  },

  chooseYearOfPlenty(cfg, view, count) {
    const me = view.players[view.me];
    const needs = {};
    for (const [r, need] of Object.entries(GOAL_CITY)) {
      const d = need - (me.resources[r] ?? 0);
      if (d > 0) needs[r] = d;
    }
    const out = {};
    if (Object.keys(needs).length && sumVals(needs) <= count) {
      let remaining = count;
      for (const [r, d] of Object.entries(needs).sort((a, b) => b[1] - a[1])) {
        const take = Math.min(d, remaining);
        if (take > 0) { out[r] = take; remaining -= take; }
      }
      for (const r of Object.keys(cfg.resource_types)) {
        if (remaining <= 0) break;
        out[r] = (out[r] ?? 0) + 1;
        remaining--;
      }
      return out;
    }
    const kinds = Object.keys(cfg.resource_types).sort((a, b) => (me.resources[a] ?? 0) - (me.resources[b] ?? 0));
    for (let i = 0; i < count; i++) { const r = kinds[i % kinds.length]; out[r] = (out[r] ?? 0) + 1; }
    return out;
  },

  // Fair version: the Python bot read opponents' exact hands. Here it targets what it needs most.
  chooseMonopoly(cfg, view, rng) {
    const me = view.players[view.me];
    const want = {};
    for (const goal of goalsFor(me).slice(0, 2)) {
      for (const [r, need] of Object.entries(goal)) want[r] = (want[r] ?? 0) + Math.max(0, need - (me.resources[r] ?? 0));
    }
    const kinds = Object.keys(cfg.resource_types);
    const top = Math.max(...kinds.map((r) => want[r] ?? 0));
    return choice(rng, kinds.filter((r) => (want[r] ?? 0) === top));
  },

  evaluateTrade(cfg, view, offer, rng) {
    const me = view.players[view.me];
    for (const [r, n] of Object.entries(offer.requesting)) if ((me.resources[r] ?? 0) < n) return false;
    const give = sumVals(offer.requesting), get = sumVals(offer.offering);
    if (get > give) return true;
    if (get === give) return chance(rng, 0.4);
    return false;
  },

  counterOffer(cfg, view, offer) {
    const me = view.players[view.me];
    const theyGive = Object.keys(offer.offering).sort((a, b) => offer.offering[b] - offer.offering[a])[0];
    const theyWant = Object.keys(offer.requesting).sort((a, b) => offer.requesting[b] - offer.requesting[a])[0];
    if (!theyGive || !theyWant || (me.resources[theyWant] ?? 0) < 1) return null;
    return { offering: { [theyWant]: 1 }, requesting: { [theyGive]: 1 } };
  },
};

export { randomStrategy };
