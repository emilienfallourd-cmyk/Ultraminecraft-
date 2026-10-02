// Gestionnaire de génération : workers si possible, sinon génération synchrone étalée
import { makeGenerator } from './gen/index.js';

let sharedWorkers = null;
let workersFailed = false;

function spawnWorkers() {
  if (sharedWorkers || workersFailed) return sharedWorkers;
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    sharedWorkers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./genWorker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onerror = (e) => { console.warn('Worker de génération indisponible, repli synchrone', e.message || e); workersFailed = true; };
      sharedWorkers.push(w);
    }
  } catch (e) {
    console.warn('Workers indisponibles :', e);
    workersFailed = true; sharedWorkers = null;
  }
  return sharedWorkers;
}

export class GenManager {
  constructor(dim, seed) {
    this.dim = dim; this.seed = seed;
    this.local = makeGenerator(dim, seed);
    this.results = [];
    this.queue = [];
    this.inflight = new Map();
    this.workers = spawnWorkers();
    this.maxInFlight = this.workers ? this.workers.length * 3 : 2;
    this.handler = (e) => {
      const m = e.data;
      if (m.type !== 'chunk') return;
      e.target.busy--;
      if (m.dim !== this.dim || m.seed !== this.seed) return;
      this.inflight.delete(m.cx + ',' + m.cz);
      this.results.push(m);
    };
    if (this.workers) for (const w of this.workers) w.addEventListener('message', this.handler);
  }
  request(cx, cz) {
    if (this.workers && !workersFailed) {
      let best = this.workers[0];
      for (const w of this.workers) if (w.busy < best.busy) best = w;
      best.busy++;
      this.inflight.set(cx + ',' + cz, performance.now());
      best.postMessage({ type: 'gen', dim: this.dim, seed: this.seed, cx, cz });
    } else this.queue.push([cx, cz]);
  }
  poll(budgetMs = 6) {
    if (workersFailed && this.inflight.size) {
      for (const k of this.inflight.keys()) { const [x, z] = k.split(',').map(Number); this.queue.push([x, z]); }
      this.inflight.clear();
      this.maxInFlight = 2;
    }
    if (this.queue.length) {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) {
        const [cx, cz] = this.queue.shift();
        const r = this.local.generate(cx, cz);
        this.results.push({ cx, cz, blocks: r.blocks, meta: r.meta, biomes: r.biomes, bes: r.blockEntities || null });
      }
    }
    const out = this.results;
    this.results = [];
    return out;
  }
  get pendingCount() { return this.inflight.size + this.queue.length; }
  dispose() { if (this.workers) for (const w of this.workers) w.removeEventListener('message', this.handler); }
}
