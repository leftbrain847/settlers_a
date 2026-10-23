import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, requestAnimationFrame: () => 0 });
const { startGallery } = await import('../../games/settlers/client/board3d/gallery.ts');

const chip = (v: string): HTMLElement => document.querySelector(`.chip[data-v="${v}"]`) as HTMLElement;

test('the gallery drives the board: style, time, palette and calm are separate switches', () => {
  document.getElementById('app')!.innerHTML = '';
  const calls: { style: string; light: string }[] = [];
  const board = { calm: false, zoom: 1, camera: null as never, built: null, resize() {}, setZoom() {}, focusOn() {}, start() {}, setBoard(_v: unknown, _c: unknown, s: { id: string }, l: { id: string }) { calls.push({ style: s.id, light: l.id }); } };
  startGallery({ root: document.getElementById('app')!, createBoard: () => board as never });
  assert.deepEqual(calls.at(-1), { style: 'civ', light: 'day' });
  chip('realistic').click();
  assert.deepEqual(calls.at(-1), { style: 'realistic', light: 'day' });
  chip('night').click(); // the Time row has Night; the palette row's Night shares the id, so click the first
  assert.equal(calls.at(-1)?.style, 'realistic');
  chip('tabletop').click();
  chip('dusk').click();
  assert.deepEqual(calls.at(-1), { style: 'tabletop', light: 'dusk' });
  chip('calm').click();
  assert.equal(board.calm, true);
  assert.equal(document.querySelectorAll('.chip.on').length, 4, 'one selected chip per row plus calm');
});

test('if WebGL cannot start, the rendered previews are shown instead', () => {
  document.getElementById('app')!.innerHTML = '';
  startGallery({ root: document.getElementById('app')!, fallbackImages: { civ: 'data:image/png;base64,AA', realistic: 'data:image/png;base64,AA' }, createBoard: () => { throw new Error('no webgl'); } });
  assert.equal(document.querySelectorAll('.fallback img').length, 2);
  assert.match(document.querySelector('.fallback')!.textContent!, /no webgl/);
});
