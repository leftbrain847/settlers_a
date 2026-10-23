import * as THREE from 'three';

/** Collects instances of one shape; becomes a single InstancedMesh (one draw call for every tree, say). */
export class Batch {
  private entries: { m: THREE.Matrix4; c: THREE.Color | null }[] = [];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  mesh: THREE.InstancedMesh | null = null;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}) {
    this.geometry = geometry; this.material = material;
    this.castShadow = opts.castShadow ?? true; this.receiveShadow = opts.receiveShadow ?? false;
  }

  get count(): number { return this.entries.length; }

  add(m: THREE.Matrix4, color?: THREE.Color | string): number {
    this.entries.push({ m: m.clone(), c: color === undefined ? null : new THREE.Color(color) });
    return this.entries.length - 1;
  }

  /** Builds the mesh. Batches that stay empty return null. */
  build(): THREE.InstancedMesh | null {
    if (!this.entries.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.entries.length);
    this.entries.forEach((e, i) => { mesh.setMatrixAt(i, e.m); if (e.c) mesh.setColorAt(i, e.c); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
    mesh.frustumCulled = false; // instances span the whole board; one bounding sphere per batch is not worth computing
    this.mesh = mesh;
    return mesh;
  }

  /** Rewrites one instance (used by the few things that move every frame). */
  set(i: number, m: THREE.Matrix4): void {
    this.entries[i]!.m.copy(m);
    this.mesh?.setMatrixAt(i, m);
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
/** Position + yaw + (non-uniform) scale -> matrix. */
export function place(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, yaw = 0, tilt = 0, roll = 0): THREE.Matrix4 {
  _p.set(x, y, z);
  _e.set(tilt, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Wind sway for foliage: vertices move more the higher they are, phase from each instance's position. */
export function windy(material: THREE.MeshStandardMaterial, uniform: { value: number }, amp: number, key: string): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float sway = sin(uTime * 1.7 + instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 2.3) * ${amp.toFixed(4)} * max(position.y, 0.0);
        transformed.x += sway; transformed.z += sway * 0.6;
        #endif`);
  };
  material.customProgramCacheKey = () => `wind-${key}-${amp}`;
}
