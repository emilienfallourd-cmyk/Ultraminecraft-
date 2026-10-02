// Worker de génération de terrain
import { makeGenerator } from './gen/index.js';
const gens = new Map();
self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== 'gen') return;
  const key = m.dim + ':' + m.seed;
  let g = gens.get(key);
  if (!g) { g = makeGenerator(m.dim, m.seed); gens.set(key, g); }
  const r = g.generate(m.cx, m.cz);
  self.postMessage({ type: 'chunk', dim: m.dim, seed: m.seed, cx: m.cx, cz: m.cz, blocks: r.blocks, meta: r.meta, biomes: r.biomes, bes: r.blockEntities || null },
    [r.blocks.buffer, r.meta.buffer, r.biomes.buffer]);
};
self.postMessage({ type: 'ready' });
