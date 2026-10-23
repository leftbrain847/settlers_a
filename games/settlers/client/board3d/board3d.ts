import * as THREE from 'three';
import { buildBoard } from './scene.ts';
import type { Built, MakeCanvas } from './scene.ts';
import type { LightPreset, Palette, StylePreset } from './style.ts';
import type { GameConfig, GameView } from '../../engine/types.ts';

/** Final pass: soft tilt-shift blur toward the top and bottom edges, a warm/cool grade and a light vignette, plus tone mapping (the scene renders in linear HDR first). */
const POST_FRAG = `
  uniform sampler2D tDiffuse; uniform vec2 uPx; uniform float uBlur, uVig, uGrade;
  varying vec2 vUv;
  void main() {
    float away = smoothstep(0.28, 0.5, abs(vUv.y - 0.5));
    vec2 r = uPx * uBlur * away * 2.2;
    vec3 c = texture2D(tDiffuse, vUv).rgb * 0.28;
    c += (texture2D(tDiffuse, vUv + vec2(r.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(r.x, 0.0)).rgb) * 0.14;
    c += (texture2D(tDiffuse, vUv + vec2(0.0, r.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, r.y)).rgb) * 0.14;
    c += (texture2D(tDiffuse, vUv + r).rgb + texture2D(tDiffuse, vUv - r).rgb + texture2D(tDiffuse, vUv + vec2(r.x, -r.y)).rgb + texture2D(tDiffuse, vUv + vec2(-r.x, r.y)).rgb) * 0.07;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.0 + 0.1 * uGrade);
    c *= mix(vec3(0.97, 0.99, 1.04), vec3(1.04, 1.01, 0.96), smoothstep(0.0, 0.8, l)) * uGrade + (1.0 - uGrade);
    c *= 1.0 - uVig * smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.0, 1.15)));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const ELEVATION = 0.96; // radians above the table (about 55 degrees): the Civ-style three-quarter view
const FOV = 30;

export interface Board3DOptions {
  canvas: HTMLCanvasElement;
  /** supply a ready-made WebGL context (headless previews); browsers leave this out */
  context?: WebGLRenderingContext | WebGL2RenderingContext;
  width: number; height: number; pixelRatio: number;
  makeCanvas: MakeCanvas;
  /** previews only: run the post pass through an 8-bit target when the GPU has no float targets (clips highlights) */
  ldrPost?: boolean;
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
  /** realistic styles draw through a post pass when the GPU can render to float textures */
  post: { target: THREE.WebGLRenderTarget; quad: THREE.Mesh; cam: THREE.OrthographicCamera; scene: THREE.Scene; mat: THREE.ShaderMaterial } | null = null;
  private wantPost = false;

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
    this.wantPost = style.post;
    this.setupPost();
    this.refit();
  }

  private setupPost(): void {
    const r = this.renderer;
    if (!this.wantPost) { this.post?.target.dispose(); this.post = null; return; }
    if (this.post) { this.sizePost(); return; }
    const gl2 = (r.capabilities as { isWebGL2?: boolean }).isWebGL2;
    const half = gl2 ? r.extensions.has('EXT_color_buffer_half_float') || r.extensions.has('EXT_color_buffer_float') : r.extensions.has('OES_texture_half_float') && r.extensions.has('EXT_color_buffer_half_float');
    const flt = !half && (gl2 ? r.extensions.has('EXT_color_buffer_float') : r.extensions.has('OES_texture_float') && r.extensions.has('WEBGL_color_buffer_float'));
    if (!half && !flt && !this.opts.ldrPost) return; // no HDR target: draw straight to the screen
    const target = new THREE.WebGLRenderTarget(4, 4, { type: half ? THREE.HalfFloatType : flt ? THREE.FloatType : THREE.UnsignedByteType, depthBuffer: true, samples: gl2 ? 4 : 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: target.texture }, uPx: { value: new THREE.Vector2(1, 1) }, uBlur: { value: 1.6 }, uVig: { value: 0.22 }, uGrade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    });
    const scene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false; scene.add(quad);
    this.post = { target, quad, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene, mat };
    this.sizePost();
  }

  private sizePost(): void {
    const p = this.post; if (!p) return;
    const sz = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    p.target.setSize(sz.x, sz.y);
    (p.mat.uniforms.uPx!.value as THREE.Vector2).set(1 / sz.x, 1 / sz.y);
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
    this.sizePost();
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
    const p = this.post;
    if (p) {
      this.renderer.setRenderTarget(p.target);
      this.renderer.render(b.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(p.scene, p.cam);
    } else this.renderer.render(b.scene, this.camera);
  }

  start(): void {
    this.t0 = performance.now();
    const loop = (): void => { this.frame((performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  dispose(): void { this.stop(); this.post?.target.dispose(); this.built?.dispose(); this.renderer.dispose(); }
}
