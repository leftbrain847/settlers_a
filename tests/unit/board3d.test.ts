import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCanvas } from '@napi-rs/canvas';
import { buildBoard } from '../../games/settlers/client/board3d/scene.ts';
import { fitCamera } from '../../games/settlers/client/board3d/board3d.ts';
import { hexTopGeometry } from '../../games/settlers/client/board3d/geometry.ts';
import { windy } from '../../games/settlers/client/board3d/batch.ts';
import { sampleGame } from '../../games/settlers/client/board3d/sample.ts';
import { LIGHTS, PALETTE_IDS, STYLES, paletteOf } from '../../games/settlers/client/board3d/style.ts';
import type { StyleId } from '../../games/settlers/client/board3d/style.ts';

const makeCanvas = ((w: number, h: number) => createCanvas(w, h)) as unknown as (w: number, h: number) => HTMLCanvasElement;
const { cfg, view } = sampleGame();
const build = (style: StyleId, pal = paletteOf('natural')) => buildBoard({ view, cfg, style: STYLES[style], light: LIGHTS.day, pal, makeCanvas });

test('tile tops: normals point up, the rim is flush, no NaN', () => {
  for (const sub of [1, 2, 5]) {
    const g = hexTopGeometry(1, sub, (x, z, edge) => 0.1 * Math.sin(x * 3) * (1 - edge), () => new THREE.Color('#fff'));
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    assert.equal(pos.count, 1 + 3 * sub * (sub + 1));
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getY(i)) && Number.isFinite(nor.getY(i)));
      assert.ok(nor.getY(i) > 0.5, `normal ${i} points down at sub ${sub}`);
      if (Math.max(Math.abs(pos.getX(i)) / (Math.sqrt(3) / 2), Math.abs(pos.getZ(i)) + Math.abs(pos.getX(i)) / Math.sqrt(3)) > 0.999) assert.ok(Math.abs(pos.getY(i)) < 1e-9, 'rim must be flush');
    }
  }
});

test('every style builds the sample board with finite transforms and the right amount of stuff', () => {
  for (const style of Object.keys(STYLES) as StyleId[]) {
    const b = build(style);
    let instances = 0;
    b.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh) return;
      instances += m.count;
      for (let i = 0; i < m.count; i++) { const e = new THREE.Matrix4(); m.getMatrixAt(i, e); assert.ok(e.elements.every(Number.isFinite), `${style}: non-finite instance`); }
    });
    assert.ok(instances > 400, `${style}: only ${instances} instances`);
    const numbered = view.board.hexes.filter((h) => h.number_token !== null).length;
    assert.equal(b.chips.length, numbered + view.board.port_slots.length, 'one chip per number plus one badge per port');
    assert.ok(b.fit.length >= 19 * 6);
    b.tick(1.3);
    b.dispose();
  }
});

test('the fixed camera keeps the whole board in frame on phones, squares and wide screens', () => {
  for (const style of ['civ', 'tabletop'] as StyleId[]) {
    const b = build(style);
    for (const aspect of [0.45, 0.6, 1, 1.8]) {
      const cam = new THREE.PerspectiveCamera(30, aspect, 0.1, 400);
      const target = new THREE.Vector3(0, 0.2, 0);
      fitCamera(cam, b.fit, target);
      const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      for (const p of b.fit) { const n = p.clone().applyMatrix4(m); assert.ok(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1, `${style} @${aspect}: ${n.x.toFixed(2)},${n.y.toFixed(2)} off screen`); }
    }
    b.dispose();
  }
});

test('shader patches target chunks that exist in three\'s standard shader', () => {
  const src = THREE.ShaderLib.standard.vertexShader;
  assert.ok(src.includes('#include <common>') && src.includes('#include <begin_vertex>'));
  const mat = new THREE.MeshStandardMaterial();
  windy(mat, { value: 0 }, 0.05, 'test');
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: src } as unknown as THREE.WebGLProgramParametersWithUniforms;
  mat.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  assert.ok(shader.vertexShader.includes('uniform float uTime;') && shader.vertexShader.includes('instanceMatrix[3].x') && shader.vertexShader.includes('transformed.x += sway'));
  assert.ok('uTime' in shader.uniforms);
  const basic = THREE.ShaderLib.basic.vertexShader;
  for (const chunk of ['#include <common>', '#include <color_vertex>', '#include <begin_vertex>']) assert.ok(basic.includes(chunk), `basic shader lacks ${chunk}`);
});

test('palettes cover every terrain and have enough player colors', () => {
  for (const id of PALETTE_IDS) {
    const p = paletteOf(id);
    for (const t of ['hills', 'forest', 'mountains', 'fields', 'pasture', 'desert']) assert.ok(p.terrain[t], `${id} lacks ${t}`);
    assert.ok(p.players.length >= 4 && p.foliage && p.grass && p.wheat && p.sea);
    assert.ok(build('civ', p).scene.children.length > 5);
  }
});

test('animation moves sheep and smoke, and nothing else drifts', () => {
  const b = build('civ');
  const flock = b.scene.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh).map((o) => o as THREE.InstancedMesh);
  const snap = () => flock.map((m) => Array.from(m.instanceMatrix.array as Float32Array).join(','));
  const a = snap();
  b.tick(5);
  const c = snap();
  const changed = a.filter((x, i) => x !== c[i]).length;
  assert.ok(changed >= 1 && changed <= 3, `${changed} instanced meshes moved (expected sheep and smoke only)`);
});
