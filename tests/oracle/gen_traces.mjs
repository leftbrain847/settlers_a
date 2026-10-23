// usage: node tests/oracle/gen_traces.mjs <outDir> [count]
// Writes seeded random-game traces for tests/oracle/replay.py to replay through the Python engine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { playRandom } from '../unit/helpers.ts';
import { topology } from '../../games/settlers/engine/index.ts';
import { norm } from './norm.mjs';

const out = process.argv[2];
const count = Number(process.argv[3] ?? 30);
mkdirSync(out, { recursive: true });

for (let seed = 1; seed <= count; seed++) {
  const n = 2 + (seed % 3);
  const settings = { vp_to_win: 8, discard_threshold: seed % 2 ? 4 : 7 };
  const steps = [];
  let first = true, board, deck, topoDump;
  const { initial } = playRandom(seed, {
    n, settings, maxSteps: 700,
    onStep: (a, res, prev, cfg) => {
      if (first) {
        first = false;
        board = { hexes: prev.board.hexes, ports: prev.board.ports, robber_hex: prev.board.robber_hex };
        deck = prev.dev_card_deck;
        const t = topology(cfg.board_template.num_rings);
        topoDump = { n_inter: t.intersections.length, edges: t.edges.map((e) => [e.a, e.b]), coords: t.intersections.map((i) => [+i.q.toFixed(4), +i.r.toFixed(4)]), hex_inter: t.hexIntersections };
      }
      const ev = res.events;
      steps.push({
        action: a,
        rolls: ev.find((e) => e.type === 'dice_rolled')?.rolls ?? null,
        stolen: ev.filter((e) => e.type === 'resource_stolen').map((e) => e.resource),
        completed: ev.some((e) => e.type === 'trade_completed'),
        event_types: ev.map((e) => e.type),
        state: norm(res.state),
      });
    },
  });
  void initial;
  writeFileSync(`${out}/trace_${seed}.json`, JSON.stringify({ seed, n, settings, board, deck, topo: topoDump, init: norm(initial), steps }));
}
console.log(`wrote ${count} traces to ${out}`);
