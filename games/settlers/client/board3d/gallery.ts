// The style gallery: the real 3D board on a sample game, with a picker for style, time of day and palette.
import { Board3D } from './board3d.ts';
import { sampleGame } from './sample.ts';
import { LIGHTS, PALETTE_IDS, STYLES, paletteOf } from './style.ts';
import type { LightId, PaletteId, StyleId } from './style.ts';
import { h, mount } from '../dom.ts';
import * as THREE from 'three';

export interface BoardLike {
  setBoard(view: never, cfg: never, style: never, light: never, pal: never): void;
  resize(w: number, h: number, pr?: number): void;
  setZoom(z: number): void;
  focusOn(p: THREE.Vector3 | null, zoom?: number): void;
  start(): void;
  calm: boolean;
  zoom: number;
  camera: THREE.PerspectiveCamera;
  built: { hexPoint(id: number): THREE.Vector3 } | null;
}

export interface GalleryDeps {
  root: HTMLElement;
  fallbackImages?: Record<string, string>;
  createBoard?: (canvas: HTMLCanvasElement, w: number, h: number, pr: number) => BoardLike;
}

const PALETTE_LABEL: Record<PaletteId, string> = { natural: 'Natural', ocean: 'Sand', nord: 'Nordic', pastel: 'Pastel', night: 'Night' };

export function startGallery({ root, fallbackImages = {}, createBoard }: GalleryDeps): { select(o: { style?: StyleId; light?: LightId; palette?: PaletteId }): void } {
  const sample = sampleGame();
  const state = { style: 'civ' as StyleId, light: 'day' as LightId, palette: 'natural' as PaletteId, calm: false };
  const canvas = h<HTMLCanvasElement>('canvas.gl');
  const fps = h('span.fps', '');
  const msg = h('div.glmsg');
  let board: BoardLike | null = null;
  let focusHex: number | null = null;

  const pixelRatio = (): number => Math.min(window.devicePixelRatio || 1, state.style === 'realistic' ? 1.5 : 2);
  const size = (): { w: number; h: number } => ({ w: Math.max(200, canvas.clientWidth), h: Math.max(200, canvas.clientHeight) });

  const apply = (): void => {
    if (!board) return;
    board.calm = state.calm;
    board.setBoard(sample.view as never, sample.cfg as never, STYLES[state.style] as never, LIGHTS[state.light] as never, paletteOf(state.palette) as never);
    const { w, h: hh } = size();
    board.resize(w, hh, pixelRatio());
    focusHex = null;
  };

  const group = <T extends string>(label: string, items: [T, string][], current: () => T, set: (v: T) => void): HTMLElement => {
    const buttons = items.map(([id, text]) => h('button.chip' + (current() === id ? '.on' : ''), { dataset: { v: id }, onclick: () => { set(id); render(); } }, text));
    return h('div.row', h('span.lab', label), h('div.chips', buttons));
  };

  const ui = h('div.ui');
  const render = (): void => {
    mount(ui,
      group('Style', (Object.keys(STYLES) as StyleId[]).map((s) => [s, STYLES[s].label]), () => state.style, (v) => { state.style = v; apply(); }),
      group('Time', (Object.keys(LIGHTS) as LightId[]).map((l) => [l, LIGHTS[l].label]), () => state.light, (v) => { state.light = v; apply(); }),
      group('Palette', PALETTE_IDS.map((p) => [p, PALETTE_LABEL[p]]), () => state.palette, (v) => { state.palette = v; apply(); }),
      h('div.row', h('button.chip' + (state.calm ? '.on' : ''), { dataset: { v: 'calm' }, onclick: () => { state.calm = !state.calm; if (board) board.calm = state.calm; render(); } }, 'Calm motion'), fps));
  };

  const fallback = (why: string): void => {
    const imgs = Object.entries(fallbackImages).map(([k, src]) => h('figure', h('img', { src, alt: k }), h('figcaption', k)));
    mount(root, h('div.fallback', h('p', `Live 3D is not available here (${why}). These are renders of the three styles.`), h('div.imgs', imgs)));
  };

  mount(root, h('div.stage', canvas, msg, ui));
  try {
    const { w, h: hh } = size();
    board = createBoard
      ? createBoard(canvas, w, hh, pixelRatio())
      : new Board3D({ canvas, width: w, height: hh, pixelRatio: pixelRatio(), makeCanvas: (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; } }) as unknown as BoardLike;
    apply();
    render();
    board.start();
  } catch (e) {
    fallback(e instanceof Error ? e.message : 'WebGL error');
    return { select: () => undefined };
  }

  // pinch / wheel zoom, tap a hex to fly in
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0, moved = false, startX = 0, startY = 0;
  const dist = (): number => { const [a, b] = [...pointers.values()]; return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1; };
  canvas.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; startX = e.clientX; startY = e.clientY; if (pointers.size === 2) pinch = dist(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !board) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
    if (pointers.size === 2) { const d = dist(); board.setZoom(board.zoom * (pinch / d)); pinch = d; focusHex = null; }
  });
  const up = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (!board || moved || pointers.size) return;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, board.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2), hit) || !board.built) return;
    let best = -1, bd = 1.05;
    for (const hx of sample.view.board.hexes) { const p = board.built.hexPoint(hx.id); const d = Math.hypot(p.x - hit.x, p.z - hit.z); if (d < bd) { bd = d; best = hx.id; } }
    if (best < 0 || best === focusHex) { board.focusOn(null); focusHex = null; } else { board.focusOn(board.built.hexPoint(best), 0.34); focusHex = best; }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); board?.setZoom((board?.zoom ?? 1) * (e.deltaY > 0 ? 1.08 : 0.92)); focusHex = null; }, { passive: false });
  window.addEventListener('resize', () => { if (board) { const { w, h: hh } = size(); board.resize(w, hh, pixelRatio()); } });

  // frame-rate readout, so the cost of each style is visible on this device
  let frames = 0, last = performance.now();
  const tickFps = (): void => { frames++; const now = performance.now(); if (now - last > 1000) { fps.textContent = `${Math.round((frames * 1000) / (now - last))} fps`; frames = 0; last = now; } requestAnimationFrame(tickFps); };
  requestAnimationFrame(tickFps);

  return { select: (o) => { Object.assign(state, o); apply(); render(); } };
}
