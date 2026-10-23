// Builds the hosted client as separate files (the Worker's content policy allows only same-origin scripts and styles).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('host/public', { recursive: true });
await build({
  entryPoints: ['games/settlers/client/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  outfile: 'host/public/app.js', define: { __ONLINE__: 'true' }, legalComments: 'none',
});
copyFileSync('games/settlers/client/style.css', 'host/public/style.css');
const html = readFileSync('games/settlers/client/index.html', 'utf8')
  .replace('<!--STYLE-->', '<link rel="stylesheet" href="/style.css">')
  .replace('<!--SCRIPT-->', '<script src="/app.js" defer></script>');
writeFileSync('host/public/index.html', html);
console.log('host/public built');
