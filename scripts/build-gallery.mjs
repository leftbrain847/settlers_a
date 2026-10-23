// Builds dist/gallery.html: the 3D style gallery as one self-contained page (for an artifact).
// Rendered previews (from tools/preview3d.ts) are embedded as the fallback when WebGL is unavailable.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const previews = process.argv[2];
const fallbacks = {};
if (previews) {
  for (const id of ['civ', 'realistic', 'tabletop']) {
    const f = `${previews}/${id}-day-natural.png`;
    if (existsSync(f)) fallbacks[id] = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
  }
}
const r = await build({ entryPoints: ['games/settlers/client/board3d/gallery-main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('games/settlers/client/board3d/gallery.css', 'utf8');
const html = readFileSync('games/settlers/client/board3d/gallery.html', 'utf8')
  .replace('<!--STYLE-->', () => css).replace('<!--FALLBACKS-->', () => JSON.stringify(fallbacks)).replace('<!--SCRIPT-->', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/gallery.html', html);
console.log(`dist/gallery.html ${(html.length / 1024).toFixed(0)} KB (${Object.keys(fallbacks).length} fallback images)`);
