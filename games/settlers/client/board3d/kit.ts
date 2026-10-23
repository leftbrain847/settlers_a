import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from './batch.ts';
import type { StylePreset } from './style.ts';

const unit = (g: THREE.BufferGeometry): THREE.BufferGeometry => { g.translate(0, 0.5, 0); return g; };

/** Shared geometries and materials, so a board of 100 hexes still draws with a handful of draw calls. */
export class Kit {
  preset: StylePreset;
  wind = { value: 0 };
  geo: Record<'cone' | 'cone4' | 'cyl' | 'cyl4' | 'sphere' | 'dome' | 'box' | 'pyramid' | 'sheep', THREE.BufferGeometry>;
  private mats = new Map<string, THREE.Material>();
  private batches = new Map<string, Batch>();

  constructor(preset: StylePreset) {
    this.preset = preset;
    const seg = preset.flat ? 6 : 9;
    this.geo = {
      cone: unit(new THREE.ConeGeometry(1, 1, seg)),
      cone4: unit(new THREE.ConeGeometry(1, 1, 4)),
      cyl: unit(new THREE.CylinderGeometry(1, 1, 1, seg)),
      cyl4: unit(new THREE.CylinderGeometry(0.7071, 0.7071, 1, 4).rotateY(Math.PI / 4)),
      sphere: new THREE.SphereGeometry(1, preset.flat ? 8 : 12, preset.flat ? 6 : 9),
      dome: new THREE.SphereGeometry(1, preset.flat ? 8 : 14, preset.flat ? 4 : 7, 0, Math.PI * 2, 0, Math.PI / 2),
      box: unit(new THREE.BoxGeometry(1, 1, 1)),
      pyramid: unit(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4)),
      sheep: sheepGeometry(preset.flat),
    };
  }

  material(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.mats.get(key);
    if (!m) { m = make(); this.mats.set(key, m); }
    return m;
  }

  /** A standard material whose per-instance colors come from the batch. */
  std(key: string, o: { color?: string; rough?: number; metal?: number; emissive?: string; vertexColors?: boolean } = {}): THREE.MeshStandardMaterial {
    return this.material(key, () => new THREE.MeshStandardMaterial({
      color: o.color ?? '#ffffff', roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, flatShading: this.preset.flat,
      ...(o.emissive ? { emissive: new THREE.Color(o.emissive) } : {}), vertexColors: o.vertexColors ?? false,
    })) as THREE.MeshStandardMaterial;
  }

  batch(key: string, geo: keyof Kit['geo'], mat: THREE.Material, opts?: { castShadow?: boolean; receiveShadow?: boolean }): Batch {
    let b = this.batches.get(key);
    if (!b) { b = new Batch(this.geo[geo], mat, opts); this.batches.set(key, b); }
    return b;
  }

  allBatches(): Batch[] { return [...this.batches.values()]; }

  dispose(): void {
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}

// Colors are adjusted in sRGB (perceptual) space: three's working space is linear, where a mid green has lightness ~0.13.
const _hsl = { h: 0, s: 0, l: 0 };
export function tint(hex: string | THREE.Color, dh = 0, ds = 0, dl = 0): THREE.Color {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  return c.setHSL(((_hsl.h + dh) % 1 + 1) % 1, Math.min(1, Math.max(0, _hsl.s + ds)), Math.min(1, Math.max(0, _hsl.l + dl)), THREE.SRGBColorSpace);
}
export function scaleSat(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  return c.setHSL(_hsl.h, Math.min(1, _hsl.s * k), _hsl.l, THREE.SRGBColorSpace);
}

/** One merged sheep (wool body, dark face and legs), about 0.3 long, nose toward +z, feet on y=0. */
function sheepGeometry(flat: boolean): THREE.BufferGeometry {
  const part = (g: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry => {
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => rgb).flat(), 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const w: [number, number, number] = [0.95, 0.93, 0.88], d: [number, number, number] = [0.11, 0.11, 0.12];
  const seg = flat ? 7 : 12;
  const parts = [
    part(new THREE.SphereGeometry(0.1, seg, seg - 2).scale(1, 0.85, 1.35).translate(0, 0.12, 0), w),
    part(new THREE.SphereGeometry(0.07, seg, seg - 2).translate(0.045, 0.19, -0.02), w),
    part(new THREE.SphereGeometry(0.07, seg, seg - 2).translate(-0.045, 0.19, 0.04), w),
    part(new THREE.SphereGeometry(0.046, seg, seg - 2).scale(0.9, 1, 1.15).translate(0, 0.17, 0.16), d),
    ...[[-0.05, 0.07], [0.05, 0.07], [-0.05, -0.07], [0.05, -0.07]].map(([x, z]) => part(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 5).translate(x!, 0.04, z!), d)),
  ];
  return mergeGeometries(parts, false) ?? parts[0]!;
}
