import * as THREE from 'three';
import { buildBoard } from './scene.ts';
import type { Built, MakeCanvas } from './scene.ts';
import type { LightPreset, Palette, StylePreset } from './style.ts';
import type { GameConfig, GameView } from '../../engine/types.ts';

export const ELEVATION = 0.96; // radians above the table (about 55 degrees): the Civ-style three-quarter view
const FOV = 30;

export interface Board3DOptions {
  canvas: HTMLCanvasElement;
  /** supply a ready-made WebGL context (headless previews); browsers leave this out */
  context?: WebGLRenderingContext | WebGL2RenderingContext;
  width: number; height: number; pixelRatio: number;
  makeCanvas: MakeCanvas;
}

/** Point the camera at the board from a fixed three-quarter angle, as close as keeps every point in frame. */
export function fitCamera(camera: THREE.PerspectiveCamera, points: THREE.Vector3[], target: THREE.Vector3, margin = 0.94): number {
  const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  let dist = 12;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 2, hi = 200;
    for (let i = 0; i < 28; i++) {
      dist = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      let worst = 0;
      for (const p of points) { const n = p.clone().applyMatrix4(view); worst = Math.max(worst, Math.abs(n.x), Math.abs(n.y)); }
      if (worst > margin) lo = dist; else hi = dist;
    }
    // re-centre: shift the target so the projected bounds sit in the middle of the frame
    const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const p of points) { const n = p.clone().applyMatrix4(view); minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const halfH = dist * Math.tan((FOV * Math.PI) / 360), halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, ((minX + maxX) / 2) * halfW).addScaledVector(up, ((minY + maxY) / 2) * halfH);
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return dist;
}

export class Board3D {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  built: Built | null = null;
  target = new THREE.Vector3();
  private goal = new THREE.Vector3();
  private goalZoom = 1;
  private lastT = 0;
  zoom = 1;
  private fitDist = 12;
  private fogK: [number, number] | null = null;
  private opts: Board3DOptions;
  private raf = 0;
  private t0 = 0;
  private lastStyle: StylePreset | null = null;
  calm = false;

  constructor(o: Board3DOptions) {
    this.opts = o;
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance', ...(o.context ? { context: o.context } : {}) });
    this.renderer.setPixelRatio(o.pixelRatio);
    this.renderer.setSize(o.width, o.height, false);
    this.camera = new THREE.PerspectiveCamera(FOV, o.width / o.height, 0.1, 400);
  }

  /** (Re)build the scene for a view. Cheap enough to call when the board changes; the camera keeps its framing. */
  setBoard(view: GameView, cfg: GameConfig, style: StylePreset, light: LightPreset, pal: Palette): void {
    this.built?.dispose();
    this.built = buildBoard({ view, cfg, style, light, pal, makeCanvas: this.opts.makeCanvas });
    const r = this.renderer;
    r.shadowMap.enabled = style.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = style.tone === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = light.exposure;
    r.setClearColor(new THREE.Color(light.sky));
    this.fogK = [light.fogNear, light.fogFar];
    if (this.lastStyle?.id !== style.id || !this.lastStyle) this.refit();
    this.lastStyle = style;
    this.refit();
  }

  refit(): void {
    if (!this.built) return;
    this.target.set(0, 0.2, 0);
    this.fitDist = fitCamera(this.camera, this.built.fit, this.target);
    this.home = this.target.clone();
    this.goal.copy(this.target);
    this.applyZoom();
  }

  private home = new THREE.Vector3();

  /** Glide the camera to a point at a zoom level (null = back to the whole board). */
  focusOn(p: THREE.Vector3 | null, zoom = 1): void {
    this.goal.copy(p ?? this.home);
    this.goalZoom = p ? zoom : 1;
  }

  private applyZoom(): void {
    const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    this.camera.position.copy(this.target).addScaledVector(dir, this.fitDist * this.zoom);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    const fog = this.built?.scene.fog as THREE.Fog | null | undefined;
    if (fog && this.fogK) { fog.near = this.fitDist * this.zoom * this.fogK[0]; fog.far = this.fitDist * this.zoom * this.fogK[1]; }
  }

  setZoom(z: number): void { this.zoom = Math.min(1.15, Math.max(0.25, z)); this.goalZoom = this.zoom; this.applyZoom(); }

  resize(w: number, h: number, pixelRatio = this.opts.pixelRatio): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.refit();
  }

  /** Draw one frame at time t (seconds). */
  frame(t: number): void {
    const b = this.built;
    if (!b) return;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const k = 1 - Math.exp(-dt * 6);
    if (this.target.distanceToSquared(this.goal) > 1e-6 || Math.abs(this.zoom - this.goalZoom) > 1e-4) {
      this.target.lerp(this.goal, k);
      this.zoom += (this.goalZoom - this.zoom) * k;
      this.applyZoom();
    }
    b.tick(this.calm ? 0 : t);
    for (const c of b.chips) c.quaternion.copy(this.camera.quaternion);
    this.renderer.render(b.scene, this.camera);
  }

  start(): void {
    this.t0 = performance.now();
    const loop = (): void => { this.frame((performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  dispose(): void { this.stop(); this.built?.dispose(); this.renderer.dispose(); }
}
