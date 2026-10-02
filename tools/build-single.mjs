// Construit dist/UltraMinecraft.html : le jeu complet dans un seul fichier,
// ouvrable par double-clic sans serveur.
// Usage : npm i --no-save esbuild && node tools/build-single.mjs
//   (ou ESBUILD=/chemin/vers/esbuild/lib/main.js node tools/build-single.mjs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { build } = await import(process.env.ESBUILD || 'esbuild');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const three = join(root, 'lib/three.module.min.js');
const common = { bundle: true, minify: true, write: false, target: 'es2020', alias: { three }, legalComments: 'none', logLevel: 'warning' };

const worker = await build({ ...common, entryPoints: [join(root, 'src/world/genWorker.js')], format: 'iife' });
const game = await build({ ...common, entryPoints: [join(root, 'src/main.js')], format: 'esm' });

const safe = (js) => js.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${css}</style>`)
  .replace(/<script type="importmap">.*?<\/script>\n/s, '')
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () =>
    `<script>window.UMC_WORKER_SRC = ${JSON.stringify(worker.outputFiles[0].text).replace(/<\/script/gi, '<\\/script')};</script>\n` +
    `<script type="module">\n${safe(game.outputFiles[0].text)}</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/UltraMinecraft.html'), html);
console.log('dist/UltraMinecraft.html', (html.length / 1024 / 1024).toFixed(2), 'Mo');
