import { h, clear } from './dom.js';
import { topology } from '../engine/topology.js';

const S = 40; // world units per hex edge
const SQ3 = Math.sqrt(3);
const px = (q, r) => ({ x: S * (SQ3 * q + (SQ3 / 2) * r), y: S * 1.5 * r });
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

/**
 * Renders the board from a view and turns taps/drags into onTap({kind:'i'|'e'|'h', id}).
 * Pan = one finger drag, zoom = pinch or wheel. Hit targets are generous (~36px) and only exist
 * for currently legal spots, so a stray tap can never place anything.
 */
export class BoardView {
  constructor(svg, { onTap }) {
    this.svg = svg;
    this.onTap = onTap;
    this.vb = null;
    this.full = null;
    this.key = null;
    this.pointers = new Map();
    this.drag = null;
    this.layers = {};
    this.bindGestures();
  }

  fit(topo) {
    const pts = topo.intersections.map((i) => px(i.q, i.r));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const pad = S * 1.3;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    this.full = { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
    this.vb = { ...this.full };
    this.applyVb();
  }

  applyVb() {
    const { x, y, w, h: hh } = this.vb;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${hh}`);
  }

  /** targets: { i:Set, e:Set, h:Set, ghost:{kind,id,type,player}|null } */
  update(view, cfg, targets = {}) {
    const topo = topology(view.board.rings);
    const key = `${view.game_id}:${view.board.rings}`;
    if (this.key !== key) { this.key = key; this.fit(topo); }
    clear(this.svg);

    const pos = topo.intersections.map((i) => px(i.q, i.r));
    const idx = (pid) => Math.max(0, view.player_order.indexOf(pid));
    const g = (cls, ...kids) => h('g', { class: cls }, ...kids);
    const small = view.board.rings > 5;

    const hexLayer = g('hexes');
    for (const hx of view.board.hexes) {
      const c = px(hx.q, hx.r);
      const pts = topo.hexIntersections[hx.id].map((i) => `${pos[i].x},${pos[i].y}`).join(' ');
      hexLayer.append(h('polygon', { points: pts, class: 'hex', style: { fill: `var(--t-${hx.terrain})` } }));
      if (!small) hexLayer.append(h('text', { x: c.x, y: c.y - S * 0.52, class: 'terrain-label' }, cfg.terrain_types[hx.terrain]?.name ?? hx.terrain));
      if (hx.number_token) {
        const red = hx.number_token === 6 || hx.number_token === 8;
        hexLayer.append(
          h('circle', { cx: c.x, cy: c.y, r: S * 0.36, class: 'token' }),
          h('text', { x: c.x, y: c.y + 1, class: 'token-num' + (red ? ' red' : '') }, hx.number_token),
        );
        if (!small) {
          const n = PIPS[hx.number_token] ?? 0;
          for (let k = 0; k < n; k++) hexLayer.append(h('circle', { cx: c.x + (k - (n - 1) / 2) * 4.2, cy: c.y + S * 0.26, r: 1.5, class: 'pip' + (red ? ' red' : '') }));
        }
      }
    }

    const portLayer = g('ports');
    for (const [a, b, type] of view.board.port_slots ?? []) {
      const m = { x: (pos[a].x + pos[b].x) / 2, y: (pos[a].y + pos[b].y) / 2 };
      const d = Math.hypot(m.x, m.y) || 1;
      const lab = { x: m.x + (m.x / d) * S * 0.62, y: m.y + (m.y / d) * S * 0.62 };
      const pt = cfg.port_types[type];
      const text = pt?.resource ? `2:1 ${cfg.resource_types[pt.resource].name.slice(0, 4)}` : '3:1';
      portLayer.append(
        h('line', { x1: lab.x, y1: lab.y, x2: pos[a].x, y2: pos[a].y, class: 'port-line' }),
        h('line', { x1: lab.x, y1: lab.y, x2: pos[b].x, y2: pos[b].y, class: 'port-line' }),
        h('circle', { cx: lab.x, cy: lab.y, r: S * 0.34, class: 'port-badge', style: pt?.resource ? { stroke: `var(--r-${pt.resource})` } : {} }),
        h('text', { x: lab.x, y: lab.y + 0.5, class: 'port-text' }, text),
      );
    }

    const roadLayer = g('roads');
    for (const [eid, b] of Object.entries(view.board.buildings.e)) {
      const e = topo.edges[eid];
      const l = { x1: pos[e.a].x, y1: pos[e.a].y, x2: pos[e.b].x, y2: pos[e.b].y };
      roadLayer.append(h('line', { ...l, class: 'road-edge' }), h('line', { ...l, class: 'road', style: { stroke: `var(--p${idx(b.player)})` } }));
    }

    const buildLayer = g('buildings');
    const drawPiece = (kind, p, type, ghost) => {
      const city = type === 'city';
      const s = city ? 1.35 : 1;
      const d = city
        ? `M${-9 * s * 0.75},${7} L${-9 * s * 0.75},${-3} L${-2},${-3} L${-2},${-8} L${3},${-12} L${8},${-8} L${8},${7} Z`
        : 'M-8,6 L-8,-2 L0,-9 L8,-2 L8,6 Z';
      return h('g', { transform: `translate(${p.x},${p.y})`, class: 'piece' + (ghost ? ' ghost' : '') },
        h('path', { d, class: 'piece-shape', style: { fill: `var(--p${idx(kind)})` } }));
    };
    for (const [iid, b] of Object.entries(view.board.buildings.i)) buildLayer.append(drawPiece(b.player, pos[iid], b.type, false));

    const robberLayer = g('robber');
    if (view.board.robber_hex !== null) {
      const c = px(view.board.hexes[view.board.robber_hex].q, view.board.hexes[view.board.robber_hex].r);
      robberLayer.append(h('g', { transform: `translate(${c.x + S * 0.38},${c.y + S * 0.22})` },
        h('circle', { cx: 0, cy: -9, r: 4.5, class: 'robber' }), h('path', { d: 'M-6,8 L-3.5,-4 L3.5,-4 L6,8 Z', class: 'robber' })));
    }

    const targetLayer = g('targets');
    for (const id of targets.h ?? []) {
      const hx = view.board.hexes[id];
      const pts = topo.hexIntersections[id].map((i) => `${pos[i].x},${pos[i].y}`).join(' ');
      const c = px(hx.q, hx.r);
      targetLayer.append(h('polygon', { points: pts, class: 'target-hex', dataset: { kind: 'h', id } }), h('circle', { cx: c.x, cy: c.y, r: S * 0.42, class: 'target-ring' }));
    }
    for (const id of targets.e ?? []) {
      const e = topo.edges[id];
      const l = { x1: pos[e.a].x, y1: pos[e.a].y, x2: pos[e.b].x, y2: pos[e.b].y };
      targetLayer.append(h('line', { ...l, class: 'target-edge-vis' }), h('line', { ...l, class: 'target-edge-hit', dataset: { kind: 'e', id } }));
    }
    for (const id of targets.i ?? []) {
      targetLayer.append(h('circle', { cx: pos[id].x, cy: pos[id].y, r: 7, class: 'target-dot' }), h('circle', { cx: pos[id].x, cy: pos[id].y, r: 18, class: 'target-hit', dataset: { kind: 'i', id } }));
    }
    const gh = targets.ghost;
    if (gh) {
      if (gh.kind === 'i') targetLayer.append(drawPiece(gh.player, pos[gh.id], gh.type, true));
      else if (gh.kind === 'e') {
        const e = topo.edges[gh.id];
        targetLayer.append(h('line', { x1: pos[e.a].x, y1: pos[e.a].y, x2: pos[e.b].x, y2: pos[e.b].y, class: 'road ghost', style: { stroke: `var(--p${idx(gh.player)})` } }));
      } else if (gh.kind === 'h') {
        const pts = topo.hexIntersections[gh.id].map((i) => `${pos[i].x},${pos[i].y}`).join(' ');
        targetLayer.append(h('polygon', { points: pts, class: 'target-hex selected' }));
      }
    }

    this.svg.append(hexLayer, portLayer, roadLayer, buildLayer, robberLayer, targetLayer);
  }

  // ---- gestures ----
  bindGestures() {
    const svg = this.svg;
    const clamp = () => {
      const f = this.full;
      this.vb.w = Math.min(Math.max(this.vb.w, f.w * 0.22), f.w * 1.25);
      this.vb.h = this.vb.w * (f.h / f.w);
    };
    const toWorld = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      return { x: this.vb.x + ((cx - r.left) / (r.width || 1)) * this.vb.w, y: this.vb.y + ((cy - r.top) / (r.height || 1)) * this.vb.h };
    };
    const zoomAt = (cx, cy, factor) => {
      const before = toWorld(cx, cy);
      this.vb.w *= factor;
      clamp();
      const r = svg.getBoundingClientRect();
      this.vb.x = before.x - ((cx - r.left) / (r.width || 1)) * this.vb.w;
      this.vb.y = before.y - ((cy - r.top) / (r.height || 1)) * this.vb.h;
      this.applyVb();
    };

    svg.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture?.(e.pointerId); } catch { /* not capturable (synthetic event) */ }
      this.drag = { moved: false, sx: e.clientX, sy: e.clientY, target: e.target, pinch: this.pointers.size > 1 ? this.dist() : null };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId) || !this.drag || !this.full) return;
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 8) this.drag.moved = true;
      if (!this.drag.moved) return;
      if (this.pointers.size >= 2) {
        const d = this.dist();
        if (this.drag.pinch) { const c = this.center(); zoomAt(c.x, c.y, this.drag.pinch / d); }
        this.drag.pinch = d;
      } else {
        const r = svg.getBoundingClientRect();
        this.vb.x -= ((e.clientX - prev.x) / (r.width || 1)) * this.vb.w;
        this.vb.y -= ((e.clientY - prev.y) / (r.height || 1)) * this.vb.h;
        this.applyVb();
      }
    });
    const end = (e) => {
      const d = this.drag;
      this.pointers.delete(e.pointerId);
      if (!d) return;
      if (!d.moved && e.type === 'pointerup') {
        // The SVG is rebuilt on every state update, so look up what is under the finger now.
        const under = document.elementFromPoint?.(e.clientX, e.clientY);
        const find = (n) => (n?.closest ? n.closest('[data-kind]') : null);
        const t = find(under) ?? find(e.target) ?? find(d.target);
        if (t) this.onTap({ kind: t.dataset.kind, id: Number(t.dataset.id) });
      }
      if (!this.pointers.size) this.drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); if (this.full) zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    svg.addEventListener('dblclick', () => { if (this.full) { this.vb = { ...this.full }; this.applyVb(); } });
  }

  dist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  center() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
