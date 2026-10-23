// Terrain dressing: what grows on each kind of tile. Everything is instanced and placed from a per-hex random stream.
import * as THREE from 'three';
import { place, windy } from './batch.ts';
import { rngFor, SQ3 } from './geometry.ts';
import { Kit, scaleSat, tint } from './kit.ts';
import type { Batch } from './batch.ts';
import type { Palette, StylePreset } from './style.ts';

export interface PropCtx {
  kit: Kit; preset: StylePreset; pal: Palette; hexId: number;
  cx: number; cz: number;
  /** tile surface height at a local offset */
  surface: (lx: number, lz: number) => number;
  hasChip: boolean;
  sheep: SheepRef[];
}
export interface SheepRef { batch: Batch; index: number; home: { x: number; z: number; y: number }; phase: number; radius: number; scale: number }

const HALF = SQ3 / 2;
/** Local coordinates -> hex norm (1 at the rim). */
export const hexNorm = (x: number, z: number): number => Math.max(Math.abs(x) / HALF, Math.abs(z) + Math.abs(x) / SQ3);

/** n scattered points inside the tile, away from the rim and the number chip, with a minimum spacing. */
export function scatter(rng: () => number, n: number, minGap: number, chip: boolean, rimMax = 0.8): [number, number][] {
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const x = (rng() * 2 - 1) * HALF * 0.9, z = (rng() * 2 - 1) * 0.9;
    if (hexNorm(x, z) > rimMax) continue;
    if (chip && Math.hypot(x, z) < 0.34) continue;
    if (out.some(([a, b]) => Math.hypot(a - x, b - z) < minGap)) continue;
    out.push([x, z]);
  }
  return out;
}

const count = (base: number, ctx: PropCtx): number => Math.max(1, Math.round(base * ctx.preset.propDensity));

export function forest(ctx: PropCtx): void {
  const { kit, preset, pal } = ctx;
  const rng = rngFor(ctx.hexId * 7 + 1);
  const k = preset.propScale;
  const wood = kit.std('bark', { color: '#6b4a2f' });
  const leaf = kit.std('leaf', {}) as THREE.MeshStandardMaterial;
  windy(leaf, kit.wind, 0.05, 'leaf');
  const trunks = kit.batch('trunk', 'cyl', wood), cones = kit.batch('foliage', 'cone', leaf);
  const base = scaleSat(pal.foliage, preset.saturation);
  for (const [x, z] of scatter(rng, count(8, ctx), 0.2 * k, ctx.hasChip)) {
    const y = ctx.surface(x, z), s = (0.85 + rng() * 0.5) * k, yaw = rng() * 6.28;
    const col = tint(base, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.1, -0.1 + (rng() - 0.5) * 0.12);
    trunks.add(place(ctx.cx + x, y, ctx.cz + z, 0.035 * s, 0.14 * s, 0.035 * s, yaw));
    const tiers: [number, number, number][] = preset.flat ? [[0.17, 0.24, 0.08], [0.13, 0.22, 0.2], [0.085, 0.18, 0.31]] : [[0.19, 0.27, 0.07], [0.15, 0.25, 0.19], [0.11, 0.22, 0.31], [0.07, 0.18, 0.42]];
    tiers.forEach(([r, h, off], i) => cones.add(place(ctx.cx + x, y + off * s, ctx.cz + z, r * s, h * s, r * s, yaw + i), tint(col, 0, 0, i * 0.025)));
  }
}

export function mountains(ctx: PropCtx): void {
  const { kit, preset, pal } = ctx;
  const rng = rngFor(ctx.hexId * 11 + 2);
  const k = preset.propScale;
  const rock = kit.std('rock', { rough: 0.95 }), snow = kit.std('snow', { color: '#f4f8fb', rough: 0.7 });
  const peaks = kit.batch('peak', 'cone', rock), caps = kit.batch('cap', 'cone', snow);
  const base = scaleSat(pal.terrain.mountains ?? '#7a8e99', preset.saturation);
  const spots: [number, number, number][] = [[-0.34, -0.24, 1], [0.3, -0.3, 0.85], [0.05, 0.42, 0.75], [-0.4, 0.34, 0.55], [0.46, 0.24, 0.5]];
  spots.slice(0, count(4, ctx)).forEach(([x, z, sc], i) => {
    const r = (0.26 + 0.1 * sc) * k, h = (0.4 + 0.5 * sc) * k * (0.9 + rng() * 0.25), y = ctx.surface(x, z), yaw = rng() * 6;
    peaks.add(place(ctx.cx + x, y, ctx.cz + z, r, h, r, yaw), tint(base, 0, 0, (rng() - 0.5) * 0.08 - i * 0.01));
    const capH = h * 0.38, capR = r * 0.38;
    caps.add(place(ctx.cx + x, y + h * 0.64, ctx.cz + z, capR * 1.02, capH, capR * 1.02, yaw));
  });
}

export function hills(ctx: PropCtx): void {
  const { kit, preset, pal } = ctx;
  const rng = rngFor(ctx.hexId * 13 + 3);
  const k = preset.propScale;
  const clay = kit.std('clay', { rough: 0.9 }), brick = kit.std('brick', { color: '#b0482f', rough: 0.8 });
  const domes = kit.batch('mound', 'dome', clay), bricks = kit.batch('brick', 'box', brick);
  const base = scaleSat(pal.terrain.hills ?? '#c8665a', preset.saturation);
  [[-0.36, -0.2, 0.42], [0.34, -0.26, 0.34], [0.12, 0.44, 0.36], [-0.34, 0.38, 0.26]].slice(0, count(3, ctx)).forEach(([x, z, r], i) => {
    const y = ctx.surface(x!, z!);
    domes.add(place(ctx.cx + x!, y - 0.02, ctx.cz + z!, r! * k, r! * 0.62 * k, r! * k, rng() * 6), tint(base, 0, -0.04, -0.08 + i * 0.02));
  });
  // a small stack of fired bricks beside the pit
  const bx = 0.28, bz = 0.22, by = ctx.surface(bx, bz);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
    bricks.add(place(ctx.cx + bx + (i - (2 - row) / 2) * 0.1 * k, by + row * 0.05 * k, ctx.cz + bz, 0.09 * k, 0.045 * k, 0.05 * k, 0.4), tint('#b0482f', (rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.08));
  }
}

export function fields(ctx: PropCtx): void {
  const { kit, preset, pal } = ctx;
  const rng = rngFor(ctx.hexId * 17 + 4);
  const k = preset.propScale;
  const stalk = kit.std('stalk', { rough: 0.8 }) as THREE.MeshStandardMaterial;
  windy(stalk, kit.wind, 0.08, 'stalk');
  const stalks = kit.batch('stalk', 'cyl', stalk), heads = kit.batch('wheathead', 'sphere', stalk);
  const furrow = kit.std('furrow', { color: '#7a5a2c', rough: 1 }), rows = kit.batch('furrow', 'box', furrow, { castShadow: false });
  const gold = scaleSat(pal.wheat, preset.saturation);
  const rowCount = Math.max(3, Math.round(4 * preset.propDensity));
  for (let r = 0; r < rowCount; r++) {
    const z = -0.5 + (r / (rowCount - 1)) * 1.0;
    const half = Math.min(HALF * 0.82, (1 - Math.abs(z)) * HALF * 1.5);
    if (half < 0.15) continue;
    rows.add(place(ctx.cx, ctx.surface(0, z) + 0.005, ctx.cz + z, half * 2, 0.012, 0.09 * k, 0));
    const n = Math.max(3, Math.round((half * 2) / (0.075 * k)));
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.5) / n) * half * 2;
      if (ctx.hasChip && Math.hypot(x, z) < 0.3) continue;
      const y = ctx.surface(x, z), h = (0.17 + rng() * 0.07) * k, col = tint(gold, (rng() - 0.5) * 0.02, 0, -0.05 + (rng() - 0.5) * 0.1);
      stalks.add(place(ctx.cx + x, y, ctx.cz + z, 0.013 * k, h, 0.013 * k), tint(col, 0, -0.1, -0.05));
      heads.add(place(ctx.cx + x, y + h, ctx.cz + z, 0.026 * k, 0.05 * k, 0.026 * k), col);
    }
  }
}

export function pasture(ctx: PropCtx): void {
  const { kit, preset } = ctx;
  const rng = rngFor(ctx.hexId * 19 + 5);
  const k = preset.propScale;
  const sheepMat = kit.std('sheep', { rough: 1, vertexColors: true });
  const flock = kit.batch('sheep', 'sheep', sheepMat);
  const grass = kit.std('tuft', { color: '#ffffff' }) as THREE.MeshStandardMaterial;
  windy(grass, kit.wind, 0.06, 'tuft');
  const tufts = kit.batch('tuft', 'cone', grass, { castShadow: false });
  const n = count(3, ctx);
  scatter(rng, n, 0.42, ctx.hasChip, 0.7).forEach(([x, z], i) => {
    const y = ctx.surface(x, z), s = (0.8 + rng() * 0.3) * k;
    const ref = flock.add(place(ctx.cx + x, y, ctx.cz + z, s, s, s, rng() * 6.28));
    ctx.sheep.push({ batch: flock, index: ref, home: { x: ctx.cx + x, z: ctx.cz + z, y }, phase: i * 2.1 + rng() * 6, radius: 0.09, scale: s });
  });
  const base = scaleSat(ctx.pal.grass, preset.saturation);
  for (const [x, z] of scatter(rng, count(9, ctx), 0.16, ctx.hasChip, 0.85)) {
    tufts.add(place(ctx.cx + x, ctx.surface(x, z), ctx.cz + z, 0.03 * k, 0.09 * k, 0.03 * k, rng() * 6), tint(base, 0, 0.02, -0.12 + rng() * 0.08));
  }
}

export function desert(ctx: PropCtx): void {
  const { kit, preset, pal } = ctx;
  const rng = rngFor(ctx.hexId * 23 + 6);
  const k = preset.propScale;
  const sand = kit.std('dune', { rough: 1 }), cactus = kit.std('cactus', { color: '#5f9a55', rough: 0.8 });
  const dunes = kit.batch('dune', 'dome', sand), cyl = kit.batch('cactus', 'cyl', cactus);
  const base = scaleSat(pal.terrain.desert ?? '#e8d29a', preset.saturation);
  [[-0.38, -0.25, 0.46], [0.36, 0.3, 0.4], [0.3, -0.38, 0.28]].forEach(([x, z, r], i) => {
    dunes.add(place(ctx.cx + x!, ctx.surface(x!, z!) - 0.015, ctx.cz + z!, r! * k * 1.1, r! * 0.22 * k, r! * k * 0.8, 0.5 + i), tint(base, 0, 0, 0.03 * i));
  });
  for (const [x, z] of scatter(rng, count(2, ctx), 0.5, false, 0.7)) {
    const y = ctx.surface(x, z), s = k * (0.9 + rng() * 0.3);
    cyl.add(place(ctx.cx + x, y, ctx.cz + z, 0.035 * s, 0.2 * s, 0.035 * s));
    cyl.add(place(ctx.cx + x + 0.05 * s, y + 0.09 * s, ctx.cz + z, 0.022 * s, 0.09 * s, 0.022 * s));
  }
}

export const DRESS: Record<string, (c: PropCtx) => void> = { forest, mountains, hills, fields, pasture, desert };
