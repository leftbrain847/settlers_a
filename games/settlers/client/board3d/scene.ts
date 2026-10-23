// Builds the whole 3D board (tiles, dressing, pieces, ports, sea) from a GameView. Pure construction: no renderer needed.
import * as THREE from 'three';
import { topology } from '../../engine/topology.ts';
import { place } from './batch.ts';
import { hexTopGeometry, hexXZ, noise2, SQ3 } from './geometry.ts';
import { Kit, scaleSat, tint } from './kit.ts';
import { DRESS, hexNorm } from './props.ts';
import type { SheepRef } from './props.ts';
import type { LightPreset, Palette, StylePreset } from './style.ts';
import type { GameConfig, GameView } from '../../engine/types.ts';

export type MakeCanvas = (w: number, h: number) => HTMLCanvasElement;

export interface BuildOpts { view: GameView; cfg: GameConfig; style: StylePreset; light: LightPreset; pal: Palette; makeCanvas: MakeCanvas }

export interface Built {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  /** things that always face the camera (number chips) */
  chips: THREE.Object3D[];
  /** world points the camera must keep in frame */
  fit: THREE.Vector3[];
  radius: number;
  tick(t: number): void;
  hexPoint(id: number): THREE.Vector3;
  interPoint(id: number): THREE.Vector3;
  edgePoint(id: number): THREE.Vector3;
  dispose(): void;
}

const R = 0.975;
const BASE_TOP: Record<string, number> = { hills: 0.3, mountains: 0.36, forest: 0.2, fields: 0.14, pasture: 0.16, desert: 0.12 };
const RELIEF: Record<string, number> = { hills: 1.8, mountains: 1.6, forest: 1, fields: 0.35, pasture: 0.8, desert: 1.1 };
const DEPTH = 0.45;

function textureFrom(canvas: HTMLCanvasElement): THREE.DataTexture {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const src = ctx.getImageData(0, 0, w, h).data;
  const flipped = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) flipped.set(src.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  const tex = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function chipTexture(n: number, make: MakeCanvas): THREE.DataTexture {
  const c = make(128, 128);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fillStyle = '#f4ecd8'; g.fill();
  g.lineWidth = 5; g.strokeStyle = '#b9a77c'; g.stroke();
  const red = n === 6 || n === 8;
  g.fillStyle = red ? '#c0261e' : '#2b2a28';
  g.font = `bold ${n >= 10 ? 52 : 60}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 56);
  const pips = PIPS[n] ?? 0;
  for (let i = 0; i < pips; i++) { g.beginPath(); g.arc(64 + (i - (pips - 1) / 2) * 11, 96, 3.6, 0, Math.PI * 2); g.fill(); }
  return textureFrom(c);
}

function badgeTexture(label: string, ring: string, make: MakeCanvas): THREE.DataTexture {
  const c = make(128, 128);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fillStyle = '#fbf5e6'; g.fill();
  g.lineWidth = 14; g.strokeStyle = ring; g.stroke();
  g.fillStyle = '#2b2a28'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 64, 66);
  return textureFrom(c);
}

export function buildBoard(o: BuildOpts): Built {
  const { view, style, light, pal } = o;
  const topo = topology(view.board.rings);
  const kit = new Kit(style);
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [kit];
  const sheep: SheepRef[] = [];
  const chips: THREE.Object3D[] = [];
  const fit: THREE.Vector3[] = [];
  const tileTop: number[] = [];
  const tileXZ: { x: number; z: number }[] = [];

  scene.background = new THREE.Color(light.sky);
  scene.fog = new THREE.Fog(light.fog, light.fogNear, light.fogFar);

  // ---------------------------------------------------------------- tiles
  const tiles = new THREE.Group();
  const sideMats = new Map<string, THREE.MeshStandardMaterial>();
  const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: style.flat, roughness: 0.92, metalness: 0 });
  disposables.push(topMat);
  const hexById = new Map(view.board.hexes.map((h) => [h.id, h]));
  let maxR = 0;

  for (const hx of view.board.hexes) {
    const { x: cx, z: cz } = hexXZ(hx.q, hx.r);
    tileXZ[hx.id] = { x: cx, z: cz };
    maxR = Math.max(maxR, Math.hypot(cx, cz));
    const top = (BASE_TOP[hx.terrain] ?? 0.15) + (style.relief > 0 ? noise2(cx * 0.9, cz * 0.9, 5) * 0.025 : 0);
    tileTop[hx.id] = top;
    const hexColor = scaleSat(pal.terrain[hx.terrain] ?? '#88aa88', style.saturation);
    const relief = style.relief * (RELIEF[hx.terrain] ?? 1);
    const heightAt = (lx: number, lz: number, edge: number): number => (relief ? relief * noise2((cx + lx) * 1.7, (cz + lz) * 1.7, 11) * (1 - edge) ** 1.3 + relief * 0.4 * (1 - edge) : 0);
    const surface = (lx: number, lz: number): number => top + heightAt(lx, lz, Math.min(1, hexNorm(lx, lz)));

    const colorAt = (lx: number, lz: number, y: number): THREE.Color => {
      const n = noise2((cx + lx) * 2.3, (cz + lz) * 2.3, 3);
      return tint(hexColor, n * style.jitter * 0.25, n * style.jitter, n * style.jitter * 1.5 + (relief ? y * 0.5 : 0));
    };
    const topGeo = hexTopGeometry(R * style.lip, style.topDetail, heightAt, colorAt);
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(cx, top + 0.002, cz);
    topMesh.receiveShadow = style.shadows; topMesh.castShadow = style.shadows && relief > 0;
    tiles.add(topMesh);
    disposables.push(topGeo);

    let side = sideMats.get(hx.terrain);
    if (!side) {
      const sideColor = style.tray ? tint('#8a5e3a', 0, 0, 0.02) : tint(hexColor, 0, -0.1, -0.2);
      side = new THREE.MeshStandardMaterial({ color: sideColor, flatShading: style.flat, roughness: 0.95 });
      sideMats.set(hx.terrain, side);
    }
    const rim = new THREE.MeshStandardMaterial({ color: tint(hexColor, 0, -0.05, -0.1), flatShading: style.flat, roughness: 0.9 });
    disposables.push(rim);
    const sideGeo = new THREE.CylinderGeometry(R, R * 0.97, top + DEPTH, 6);
    const sideMesh = new THREE.Mesh(sideGeo, [side, rim, side]);
    sideMesh.position.set(cx, (top - DEPTH) / 2, cz);
    sideMesh.castShadow = style.shadows; sideMesh.receiveShadow = style.shadows;
    tiles.add(sideMesh);
    disposables.push(sideGeo);

    const hasChip = hx.number_token !== null;
    DRESS[hx.terrain]?.({ kit, preset: style, pal, hexId: hx.id, cx, cz, surface, hasChip, sheep });

    for (let k = 0; k < 6; k++) fit.push(new THREE.Vector3(cx + Math.sin((k * Math.PI) / 3), top, cz + Math.cos((k * Math.PI) / 3)));
  }
  scene.add(tiles);

  // ---------------------------------------------------------------- number chips
  const chipTex = new Map<number, THREE.DataTexture>();
  const discGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 28);
  const discMat = new THREE.MeshStandardMaterial({ color: '#efe5cb', roughness: 0.6 });
  disposables.push(discGeo, discMat);
  for (const hx of view.board.hexes) {
    if (hx.number_token === null) continue;
    const { x, z } = tileXZ[hx.id]!;
    let tex = chipTex.get(hx.number_token);
    if (!tex) { tex = chipTexture(hx.number_token, o.makeCanvas); chipTex.set(hx.number_token, tex); disposables.push(tex); }
    const g = new THREE.Group();
    g.position.set(x, tileTop[hx.id]! + 0.24, z);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = style.shadows;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: light.chipTint }));
    face.position.z = 0.03;
    disposables.push(face.geometry as THREE.BufferGeometry, face.material as THREE.Material);
    g.add(disc, face);
    scene.add(g);
    chips.push(g);
  }

  // ---------------------------------------------------------------- pieces
  const heightAtInter = (iid: number): number => Math.max(...topo.intersections[iid]!.hexIds.map((h) => tileTop[h] ?? 0.15));
  const interPoint = (iid: number): THREE.Vector3 => {
    const i = topo.intersections[iid]!;
    const { x, z } = hexXZ(i.q, i.r);
    return new THREE.Vector3(x, heightAtInter(iid), z);
  };
  const edgePoint = (eid: number): THREE.Vector3 => {
    const e = topo.edges[eid]!;
    return interPoint(e.a).add(interPoint(e.b)).multiplyScalar(0.5);
  };
  const hexPoint = (id: number): THREE.Vector3 => new THREE.Vector3(tileXZ[id]?.x ?? 0, tileTop[id] ?? 0.15, tileXZ[id]?.z ?? 0);

  const idx = (pid: string): number => Math.max(0, view.player_order.indexOf(pid));
  const playerColor = (pid: string): THREE.Color => scaleSat(pal.players[idx(pid) % pal.players.length]!, 1);
  const pieceMat = kit.std('piece', { rough: 0.55 });
  const roofMat = kit.std('roof', { rough: 0.7 });
  const windowMat = kit.material(`window-${light.windows}`, () => new THREE.MeshBasicMaterial({ color: light.windows > 0.3 ? '#ffd98a' : '#31465a' }));
  const bodies = kit.batch('house', 'cyl4', pieceMat), roofs = kit.batch('houseroof', 'pyramid', roofMat), towers = kit.batch('tower', 'cyl4', pieceMat);
  const windows = kit.batch('windows', 'box', windowMat, { castShadow: false });
  const smokeMat = kit.material('smoke', () => new THREE.MeshBasicMaterial({ color: light.windows > 0.3 ? '#8d97ad' : '#f1f1f1', transparent: true, opacity: 0.5, depthWrite: false }));
  const smoke = kit.batch('smoke', 'sphere', smokeMat, { castShadow: false });
  const smokers: { index: number; x: number; y: number; z: number; phase: number }[] = [];

  for (const [iid, b] of Object.entries(view.board.buildings.i)) {
    const p = interPoint(Number(iid));
    const col = playerColor(b.player), yaw = (Number(iid) % 4) * 0.4;
    const k = (style.propScale > 1.2 ? 1.2 : 1) * 1.55;
    if (b.type === 'city') {
      bodies.add(place(p.x - 0.05 * k, p.y, p.z, 0.3 * k, 0.17 * k, 0.2 * k, yaw), col);
      roofs.add(place(p.x - 0.05 * k, p.y + 0.17 * k, p.z, 0.32 * k, 0.12 * k, 0.24 * k, yaw), tint(col, 0, 0, -0.18));
      towers.add(place(p.x + 0.12 * k, p.y, p.z, 0.13 * k, 0.3 * k, 0.13 * k, yaw), tint(col, 0, 0, 0.04));
      roofs.add(place(p.x + 0.12 * k, p.y + 0.3 * k, p.z, 0.16 * k, 0.12 * k, 0.16 * k, yaw), tint(col, 0, 0, -0.18));
      windows.add(place(p.x - 0.05 * k, p.y + 0.07 * k, p.z + 0.1 * k, 0.05 * k, 0.05 * k, 0.012, yaw));
      windows.add(place(p.x + 0.12 * k, p.y + 0.18 * k, p.z + 0.067 * k, 0.04 * k, 0.05 * k, 0.012, yaw));
      smokers.push({ index: smoke.add(place(p.x, p.y + 0.45, p.z, 0.05, 0.05, 0.05)), x: p.x + 0.12 * k, y: p.y + 0.46 * k, z: p.z, phase: 0 });
    } else {
      bodies.add(place(p.x, p.y, p.z, 0.2 * k, 0.12 * k, 0.2 * k, yaw), col);
      roofs.add(place(p.x, p.y + 0.12 * k, p.z, 0.25 * k, 0.12 * k, 0.25 * k, yaw), tint(col, 0, 0, -0.18));
      windows.add(place(p.x, p.y + 0.05 * k, p.z + 0.101 * k, 0.05 * k, 0.045 * k, 0.012, yaw));
      smokers.push({ index: smoke.add(place(p.x, p.y + 0.3, p.z, 0.04, 0.04, 0.04)), x: p.x + 0.05 * k, y: p.y + 0.3 * k, z: p.z, phase: 0 });
    }
  }
  const roadMat = kit.std('road', { rough: 0.7 });
  const roads = kit.batch('road', 'box', roadMat);
  for (const [eid, b] of Object.entries(view.board.buildings.e)) {
    const e = topo.edges[Number(eid)]!;
    const a = interPoint(e.a), c = interPoint(e.b);
    const len = Math.hypot(c.x - a.x, c.z - a.z) * 0.8;
    const yaw = -Math.atan2(c.z - a.z, c.x - a.x);
    roads.add(place((a.x + c.x) / 2, Math.max(a.y, c.y) - 0.005, (a.z + c.z) / 2, len, 0.08, 0.15, yaw), playerColor(b.player));
  }

  // robber
  if (view.board.robber_hex !== null) {
    const hp = hexPoint(view.board.robber_hex);
    const hasChip = hexById.get(view.board.robber_hex)?.number_token !== null;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#1c1d22', roughness: 0.45, flatShading: style.flat });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 12), mat);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 12), mat); body.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat); head.position.y = 0.43;
    base.castShadow = body.castShadow = head.castShadow = style.shadows;
    g.add(base, body, head);
    g.position.set(hp.x + (hasChip ? 0.33 : 0), hp.y, hp.z + (hasChip ? 0.2 : 0));
    scene.add(g);
    disposables.push(mat, base.geometry as THREE.BufferGeometry, body.geometry as THREE.BufferGeometry, head.geometry as THREE.BufferGeometry);
  }

  // ---------------------------------------------------------------- ports
  const boats = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#8a5a33', flatShading: style.flat, roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f3efe6', flatShading: style.flat, roughness: 0.9, side: THREE.DoubleSide });
  const pierMat = new THREE.MeshStandardMaterial({ color: '#a87a4a', roughness: 0.85 });
  disposables.push(hullMat, sailMat, pierMat);
  for (const [a, b, type] of view.board.port_slots ?? []) {
    const pa = interPoint(a), pb = interPoint(b);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const out = new THREE.Vector3(mid.x, 0, mid.z).normalize();
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.2), hullMat); hull.position.y = 0.05;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), pierMat); mast.position.y = 0.32;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 3), sailMat); sail.position.set(0, 0.3, 0.0); sail.rotation.y = Math.PI / 2; sail.scale.z = 0.25;
    boat.add(hull, mast, sail);
    const pt = o.cfg.port_types[type];
    const ring = pt?.resource ? (pal.terrain[o.cfg.resource_types[pt.resource]?.terrain ?? ''] ?? '#d8a640') : '#e8e2d0';
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: badgeTexture(`${pt?.ratio ?? 3}:1`, ring, o.makeCanvas), transparent: true, depthWrite: false, color: light.chipTint }));
    badge.position.set(mid.x + out.x * 0.95, 1.0, mid.z + out.z * 0.95);
    scene.add(badge); // not a child of the boat: it must face the camera in world space
    chips.push(badge);
    disposables.push(hull.geometry as THREE.BufferGeometry, mast.geometry as THREE.BufferGeometry, sail.geometry as THREE.BufferGeometry, badge.geometry as THREE.BufferGeometry, badge.material as THREE.Material);
    boat.position.set(mid.x + out.x * 0.95, 0.0, mid.z + out.z * 0.95);
    boat.rotation.y = Math.atan2(out.x, out.z) + Math.PI / 2;
    boat.scale.setScalar(1.45);
    boats.add(boat);
    for (const p of [pa, pb]) {
      const dx = boat.position.x - p.x, dz = boat.position.z - p.z, len = Math.hypot(dx, dz);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.03, 0.05), pierMat);
      pier.position.set(p.x + dx * 0.5, 0.07, p.z + dz * 0.5);
      pier.rotation.y = -Math.atan2(dz, dx);
      boats.add(pier);
      disposables.push(pier.geometry as THREE.BufferGeometry);
    }
    fit.push(new THREE.Vector3(boat.position.x, 0.8, boat.position.z));
  }
  scene.add(boats);

  // ---------------------------------------------------------------- sea (or felt) and tray
  const seaR = maxR + 12;
  const seaGeo = new THREE.CircleGeometry(seaR, 120, 0, Math.PI * 2);
  seaGeo.rotateX(-Math.PI / 2);
  const sp = seaGeo.getAttribute('position');
  const seaCol: number[] = [];
  const sea = new THREE.Color(pal.sea), shore = new THREE.Color(pal.shore), deep = new THREE.Color(pal.deep);
  const tmp = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    let d = Infinity;
    for (const t of tileXZ) if (t) d = Math.min(d, Math.hypot(x - t.x, z - t.z));
    const edge = Math.max(0, d - 1);
    tmp.copy(shore).lerp(sea, Math.min(1, edge / 0.9)).lerp(deep, Math.min(1, Math.max(0, edge - 0.8) / 4));
    seaCol.push(tmp.r, tmp.g, tmp.b);
  }
  seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(seaCol, 3));
  const seaUniform = { value: 0 };
  const seaMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: light.waterTint, fog: true });
  seaMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor *= 0.93 + 0.07 * sin(position.x * 2.3 + uTime * 1.2) * sin(position.z * 1.9 - uTime * 0.9);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += (sin(position.x * 2.1 + uTime * 1.3) + sin(position.z * 1.7 - uTime * 1.1)) * 0.012;');
  };
  seaMat.customProgramCacheKey = () => 'sea-basic-wave';
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.position.y = 0;
  seaMesh.receiveShadow = style.shadows;
  scene.add(seaMesh);
  disposables.push(seaGeo, seaMat);

  if (style.tray) {
    // a felt-topped board inside a wooden frame: the felt takes the shoreline gradient, the frame is a base slab with six rails
    const trayR = maxR + 2.4;
    scene.remove(seaMesh);
    const felt = new THREE.Mesh(hexTopGeometry(trayR, 16, () => 0, (x, z) => {
      let d = Infinity;
      for (const tl of tileXZ) if (tl) d = Math.min(d, Math.hypot(x - tl.x, z - tl.z));
      const edge = Math.max(0, d - 1);
      return new THREE.Color(pal.shore).lerp(new THREE.Color(pal.sea), Math.min(1, edge / 0.9)).lerp(new THREE.Color(pal.deep), Math.min(1, Math.max(0, edge - 0.8) / 4));
    }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }));
    felt.position.y = 0.0; felt.receiveShadow = true;
    scene.add(felt);
    const wood = new THREE.MeshStandardMaterial({ color: '#7b5230', roughness: 0.65, flatShading: true });
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(trayR + 0.52, trayR + 0.6, 0.55, 6), wood);
    slab.position.y = -0.33; slab.castShadow = true; slab.receiveShadow = true;
    scene.add(slab);
    const railR = trayR + 0.04;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 6; // edge midpoints of a pointy-top hexagon
      const apothem = railR * Math.cos(Math.PI / 6);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railR + 0.5, 0.3, 0.5), wood);
      rail.position.set(Math.sin(a) * (apothem + 0.22), 0.08, Math.cos(a) * (apothem + 0.22));
      rail.rotation.y = a;
      rail.castShadow = true; rail.receiveShadow = true;
      scene.add(rail);
      disposables.push(rail.geometry as THREE.BufferGeometry);
    }
    disposables.push(wood, slab.geometry as THREE.BufferGeometry, felt.geometry as THREE.BufferGeometry, felt.material as THREE.Material);
    const far = trayR + 0.9;
    fit.push(new THREE.Vector3(0, 0.3, far), new THREE.Vector3(0, 0.3, -far), new THREE.Vector3(far, 0.3, 0), new THREE.Vector3(-far, 0.3, 0));
    for (let k = 0; k < 6; k++) fit.push(new THREE.Vector3(Math.sin((k * Math.PI) / 3) * (trayR + 0.7), 0.3, Math.cos((k * Math.PI) / 3) * (trayR + 0.7)));
  }

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(light.hemiSky, light.hemiGround, light.hemi);
  const sun = new THREE.DirectionalLight(light.sun, light.sunPower);
  sun.position.set(...light.sunPos);
  sun.target.position.set(0, 0, 0);
  if (style.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = maxR + 3;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  }
  scene.add(hemi, sun, sun.target);

  // ---------------------------------------------------------------- batches into the scene
  for (const b of kit.allBatches()) { const m = b.build(); if (m) scene.add(m); }

  // ---------------------------------------------------------------- motion
  const m4 = new THREE.Matrix4();
  const smokeBatch = smoke;
  const tick = (t: number): void => {
    kit.wind.value = t; seaUniform.value = t;
    for (const s of sheep) {
      const a = t * 0.22 + s.phase;
      const x = s.home.x + Math.cos(a) * s.radius, z = s.home.z + Math.sin(a) * s.radius;
      s.batch.set(s.index, place(x, s.home.y + Math.abs(Math.sin(t * 2 + s.phase)) * 0.006, z, s.scale, s.scale, s.scale, -a - Math.PI / 2));
    }
    smokers.forEach((p, i) => {
      const u = ((t * 0.35 + i * 0.37) % 1);
      m4.copy(place(p.x + Math.sin(t + i) * 0.03 + u * 0.12, p.y + u * 0.32, p.z, 0.03 + u * 0.07, 0.03 + u * 0.07, 0.03 + u * 0.07));
      smokeBatch.set(p.index, m4);
    });
  };
  tick(0);

  return {
    scene, sun, chips, fit, radius: maxR + 1.5, tick, hexPoint, interPoint, edgePoint,
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}
