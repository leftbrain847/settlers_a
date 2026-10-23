// Renders the 3D board to PNG files without a browser: headless WebGL (run under xvfb) + a Node canvas for textures.
// usage: xvfb-run -a node tools/preview3d.ts <outDir> [style,style] [light,light] [palette] [width] [height]
import createGL from 'gl';
import { PNG } from 'pngjs';
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Board3D } from '../games/settlers/client/board3d/board3d.ts';
import { sampleGame } from '../games/settlers/client/board3d/sample.ts';
import { LIGHTS, STYLES, paletteOf } from '../games/settlers/client/board3d/style.ts';
import type { LightId, PaletteId, StyleId } from '../games/settlers/client/board3d/style.ts';

const [out = '.', styleArg = 'civ,realistic,tabletop', lightArg = 'day', palArg = 'natural', wArg = '450', hArg = '760', tArg = '0.6', zoomArg = '1', focusArg = ''] = process.argv.slice(2);
const w = Number(wArg), h = Number(hArg);
mkdirSync(out, { recursive: true });
const gl = createGL(w, h, { preserveDrawingBuffer: true, antialias: false, stencil: true });
if (!gl) throw new Error('no GL context (run under xvfb-run)');
const canvas = { width: w, height: h, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => gl, clientWidth: w, clientHeight: h } as unknown as HTMLCanvasElement;
const board = new Board3D({ canvas, context: gl as unknown as WebGLRenderingContext, width: w, height: h, pixelRatio: 1, ldrPost: true, makeCanvas: ((cw: number, ch: number) => createCanvas(cw, ch)) as unknown as (w: number, h: number) => HTMLCanvasElement });
const { cfg, view } = sampleGame();

for (const styleId of styleArg.split(',') as StyleId[]) for (const lightId of lightArg.split(',') as LightId[]) {
  const t0 = Date.now();
  board.setBoard(view, cfg, STYLES[styleId], LIGHTS[lightId], paletteOf(palArg as PaletteId));
  if (focusArg !== '' && board.built) { board.target.copy(board.built.hexPoint(Number(focusArg))); }
  board.setZoom(Number(zoomArg));
  board.frame(Number(tArg));
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
    png.data[d] = px[s]!; png.data[d + 1] = px[s + 1]!; png.data[d + 2] = px[s + 2]!; png.data[d + 3] = 255;
  }
  const file = `${out}/${styleId}-${lightId}-${palArg}.png`;
  writeFileSync(file, PNG.sync.write(png));
  console.log(file, `${Date.now() - t0}ms`);
}
