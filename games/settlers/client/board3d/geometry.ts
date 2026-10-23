import * as THREE from 'three';

/** Deterministic pseudo-random stream (so a given hex always grows the same forest). */
export function rngFor(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x: number, z: number, seed = 0): number {
  const h = (ix: number, iz: number): number => {
    let n = Math.imul(ix * 374761393 + iz * 668265263 + seed * 1442695041, 1274126177);
    n = (n ^ (n >>> 13)) >>> 0;
    return (n / 4294967296) * 2 - 1;
  };
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(x0, z0) * (1 - u) + h(x0 + 1, z0) * u) * (1 - v) + (h(x0, z0 + 1) * (1 - u) + h(x0 + 1, z0 + 1) * u) * v;
}

/**
 * A hexagonal disc made of concentric rings (pointy-top, radius R), `sub` rings deep. Heights come from `heightAt`;
 * the rim is pinned to y=0 so neighbouring tiles meet flush. Vertex colors are filled by `colorAt`.
 */
export function hexTopGeometry(R: number, sub: number, heightAt: (x: number, z: number, edge: number) => number, colorAt: (x: number, z: number, y: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const corner = (k: number): [number, number] => [R * Math.sin((k * Math.PI) / 3), R * Math.cos((k * Math.PI) / 3)];
  const ringStart: number[] = [];
  const push = (x: number, z: number, edge: number): void => {
    const y = heightAt(x, z, edge);
    pos.push(x, y, z);
    const c = colorAt(x, z, y);
    col.push(c.r, c.g, c.b);
  };
  ringStart.push(0);
  push(0, 0, 0);
  for (let i = 1; i <= sub; i++) {
    ringStart.push(pos.length / 3);
    for (let k = 0; k < 6; k++) {
      const [ax, az] = corner(k), [bx, bz] = corner(k + 1);
      for (let j = 0; j < i; j++) {
        const t = j / i;
        push(((ax + (bx - ax) * t) * i) / sub, ((az + (bz - az) * t) * i) / sub, i / sub);
      }
    }
  }
  const ringCount = (i: number): number => (i === 0 ? 1 : 6 * i);
  for (let i = 1; i <= sub; i++) {
    const outer = ringStart[i]!, inner = ringStart[i - 1]!, nOut = ringCount(i), nIn = ringCount(i - 1);
    // walk both rings side by side, stitching triangles
    let a = 0, b = 0;
    while (a < nOut || b < nIn) {
      const oa = outer + (a % nOut), ob = outer + ((a + 1) % nOut), ia = inner + (b % nIn), ib = inner + ((b + 1) % nIn);
      const advanceOuter = a < nOut && (b >= nIn || (a + 1) / nOut <= (b + 1) / nIn);
      if (advanceOuter) { idx.push(oa, ob, ia); a++; } else { idx.push(ia, oa, ib); b++; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const SQ3 = Math.sqrt(3);
/** Hex center in world space (hex edge length = 1; +z points toward the camera). */
export const hexXZ = (q: number, r: number): { x: number; z: number } => ({ x: SQ3 * (q + r / 2), z: 1.5 * r });
