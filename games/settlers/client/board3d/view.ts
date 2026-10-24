// The 3D board as a game widget: owns a canvas, builds/refreshes the scene from views, turns touches into taps, pans and zooms.
import * as THREE from 'three';
import { Board3D } from './board3d.ts';
import { Pieces } from './pieces.ts';
import { LIGHTS, STYLES, paletteOf } from './style.ts';
import type { LightId, PaletteId, StyleId } from './style.ts';
import type { BoardTap } from '../board-svg.ts';
import type { BoardRenderer, BoardTargets, Kind } from '../ui-types.ts';
import type { GameConfig, GameView } from '../../engine/types.ts';

export interface Look { style: StyleId; light: LightId; palette: PaletteId }

/** True when this browser can make a WebGL context (the 3D board needs one; otherwise the SVG board is used). */
export function webglAvailable(): boolean {
  try {
    if (typeof document === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch { return false; }
}

const makeCanvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Board3DView implements BoardRenderer {
  el: HTMLCanvasElement;
  private gl: Board3D;
  private key = '';
  private last: { view: GameView; cfg: GameConfig; targets: BoardTargets } | null = null;
  private ro: ResizeObserver | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { moved: boolean; sx: number; sy: number; pinch: number | null } | null = null;
  private ray = new THREE.Raycaster();

  private o: { onTap: (t: BoardTap) => void; look: () => Look };

  constructor(canvas: HTMLCanvasElement, o: { onTap: (t: BoardTap) => void; look: () => Look }) {
    this.o = o;
    this.el = canvas;
    const { w, h } = this.size();
    this.gl = new Board3D({ canvas, width: w, height: h, pixelRatio: this.pixelRatio(), makeCanvas });
    this.bind();
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => { const s = this.size(); this.gl.resize(s.w, s.h, this.pixelRatio()); this.gl.boost(); });
      this.ro.observe(canvas);
    }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) this.gl.calm = true;
    this.gl.start();
  }

  private size(): { w: number; h: number } { return { w: Math.max(200, this.el.clientWidth), h: Math.max(200, this.el.clientHeight) }; }
  private pixelRatio(): number { return Math.min(window.devicePixelRatio || 1, this.o.look().style === 'realistic' ? 1.5 : 2); }

  update(view: GameView, cfg: GameConfig, targets: BoardTargets = {}): void {
    this.last = { view, cfg, targets };
    const look = this.o.look();
    const key = `${view.game_id}:${view.board.rings}:${look.style}:${look.light}:${look.palette}`;
    if (key !== this.key) {
      this.key = key;
      const s = this.size();
      this.gl.resize(s.w, s.h, this.pixelRatio());
      this.gl.setBoard(view, cfg, STYLES[look.style], LIGHTS[look.light], paletteOf(look.palette));
    }
    this.gl.built?.pieces.set(view, targets);
    this.gl.boost();
  }

  clientPoint(kind: Kind, id: number): { x: number; y: number } | null {
    const b = this.gl.built;
    if (!b) return null;
    const p = (kind === 'h' ? b.hexPoint(id) : kind === 'i' ? b.interPoint(id) : b.edgePoint(id)).clone();
    p.y += 0.2;
    p.project(this.gl.camera);
    const r = this.el.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  resetZoom(): void { this.gl.focusOn(null); }

  destroy(): void { this.ro?.disconnect(); this.gl.dispose(); }

  private tapAt(cx: number, cy: number): void {
    const b = this.gl.built;
    if (!b) return;
    const r = this.el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.gl.camera);
    const hit = this.ray.intersectObjects(b.pieces.hits, false)[0];
    const t = hit && Pieces.hitOf(hit.object);
    if (t) this.o.onTap(t);
  }

  private bind(): void {
    const c = this.el;
    const dist = (): number => { const [a, b] = [...this.pointers.values()]; return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1; };
    c.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { c.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
      this.drag = { moved: false, sx: e.clientX, sy: e.clientY, pinch: this.pointers.size > 1 ? dist() : null };
      this.gl.boost();
    });
    c.addEventListener('pointermove', (e: PointerEvent) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev || !this.drag) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 8) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.gl.boost();
      if (this.pointers.size >= 2) {
        const d = dist();
        if (this.drag.pinch) this.gl.setZoom(this.gl.zoom * (this.drag.pinch / d));
        this.drag.pinch = d;
      } else this.gl.panBy(e.clientX - prev.x, e.clientY - prev.y);
    });
    const end = (e: PointerEvent): void => {
      const d = this.drag;
      this.pointers.delete(e.pointerId);
      if (!d) return;
      if (!d.moved && e.type === 'pointerup') this.tapAt(e.clientX, e.clientY);
      if (!this.pointers.size) this.drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e: WheelEvent) => { e.preventDefault(); this.gl.setZoom(this.gl.zoom * (e.deltaY > 0 ? 1.1 : 1 / 1.1)); this.gl.boost(); }, { passive: false });
    c.addEventListener('dblclick', () => this.resetZoom());
  }
}
