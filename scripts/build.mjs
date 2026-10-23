// Bundles the UI into one self-contained HTML file (dist/settlers.html) for pasting into an artifact.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['games/settlers/client/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, define: { __ONLINE__: 'false' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('games/settlers/client/style.css', 'utf8');
const html = readFileSync('games/settlers/client/index.html', 'utf8')
  .replace('<!--STYLE-->', () => `<style>\n${css}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>\n${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/settlers.html', html);
console.log(`dist/settlers.html  ${(html.length / 1024).toFixed(0)} KB`);

// Artifact variant: the host supplies doctype/head/body and pads :root for safe areas.
const artifactCss = css + `
html,body,#app{height:100%}
.game{height:100%;padding-top:0}
.dock{padding-bottom:8px}
.lobby{padding-top:24px}
.sheet{padding-bottom:0}
`;
const artifact = `<title>Settlers</title>
<style>
${artifactCss}</style>
<div id="app"></div>
<script>
${js}</script>
`;
writeFileSync('dist/settlers-artifact.html', artifact);
console.log(`dist/settlers-artifact.html  ${(artifact.length / 1024).toFixed(0)} KB`);
