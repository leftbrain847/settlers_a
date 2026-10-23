import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { GameConfig, GameEvent, GameView } from '../../games/settlers/engine/index.ts';
import type { FxAnchors } from '../../games/settlers/client/fx.ts';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement });
// jsdom has no Web Animations: provide a stand-in that records calls and completes immediately when asked.
let animations = 0;
(dom.window.HTMLElement.prototype as unknown as { animate: () => { onfinish: (() => void) | null } }).animate = function animate() { animations++; return { onfinish: null }; };
const { Fx } = await import('../../games/settlers/client/fx.ts');
const { baseGame } = await import('../../games/settlers/engine/index.ts');

const cfg: GameConfig = baseGame();
const view = { me: 'p1', player_order: ['p1', 'p2', 'p3'] } as unknown as GameView;
const anchors: FxAnchors = {
  seat: (id, res) => ({ x: id === 'p1' ? 10 : 100, y: res ? 5 : 20 }),
  bank: () => ({ x: 50, y: 50 }), center: () => ({ x: 60, y: 60 }), board: () => ({ x: 70, y: 70 }), bump: () => undefined,
};
const run = (events: GameEvent[], speed = 1) => {
  animations = 0;
  const layer = document.createElement('div');
  document.body.append(layer);
  new Fx(layer).play(events, view, cfg, anchors, speed);
  return layer;
};

test('production sends one card per resource from the hex to its owner', () => {
  const layer = run([{ type: 'resource_produced', player: 'p2', resource: 'wood', amount: 2, hex: 3 }, { type: 'resource_produced', player: 'p1', resource: 'clay', amount: 1, hex: 4 }]);
  assert.equal(layer.querySelectorAll('.fxcard').length, 3);
  assert.equal(animations, 3);
});

test('a steal between two other players shows a face-down card; the thief and the victim see which one', () => {
  const hidden = run([{ type: 'resource_stolen', stealer: 'p2', target: 'p3' }]);
  assert.equal(hidden.querySelectorAll('.fxcard.back').length, 1);
  const known = run([{ type: 'resource_stolen', stealer: 'p1', target: 'p3', resource: 'rock' }]);
  assert.equal(known.querySelectorAll('.fxcard.back').length, 0);
  assert.equal(known.querySelectorAll('.fxcard').length, 1);
});

test('a trade moves cards both ways; a bank trade goes through the bank', () => {
  const trade = run([{ type: 'trade_completed', from: 'p1', to: 'p2', offering: { wood: 2 }, requesting: { clay: 1 } }]);
  assert.equal(trade.querySelectorAll('.fxcard').length, 3);
  const bank = run([{ type: 'bank_trade', player: 'p1', gave: { wood: 4 }, received: { rock: 1 } }]);
  assert.equal(bank.querySelectorAll('.fxcard').length, 5);
});

test('building costs only fly when they were actually paid for; played dev cards show themselves', () => {
  assert.equal(run([{ type: 'building_placed', player: 'p1', building: 'road', location: 4, location_type: 'edge', paid: false }]).querySelectorAll('.fxcard').length, 0);
  assert.equal(run([{ type: 'building_placed', player: 'p1', building: 'road', location: 4, location_type: 'edge', paid: true }]).querySelectorAll('.fxcard').length, 2);
  assert.equal(run([{ type: 'dev_card_played', player: 'p2', card: 'knight' }]).querySelectorAll('.fxbig').length, 1);
});

test('fast playback and large bursts stay cheap', () => {
  assert.equal(run([{ type: 'resource_produced', player: 'p2', resource: 'wood', amount: 2, hex: 3 }], 4).children.length, 0);
  const burst: GameEvent[] = Array.from({ length: 40 }, (_, i) => ({ type: 'resource_produced', player: 'p2', resource: 'wood', amount: 2, hex: i }));
  assert.ok(run(burst).children.length <= 28);
});
