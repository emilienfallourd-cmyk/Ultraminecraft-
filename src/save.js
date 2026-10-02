// Sauvegarde : IndexedDB (mondes, chunks modifiés, joueur). Repli en mémoire si indisponible.
const DB_NAME = 'ultraminecraft';
const VERSION = 1;

function rleEncode16(a) {
  const out = [];
  let v = a[0], n = 1;
  for (let i = 1; i < a.length; i++) {
    if (a[i] === v && n < 65535) n++;
    else { out.push(v, n); v = a[i]; n = 1; }
  }
  out.push(v, n);
  return Uint16Array.from(out);
}
function rleDecode16(r, len, Type) {
  const a = new Type(len);
  let p = 0;
  for (let i = 0; i < r.length; i += 2) { a.fill(r[i], p, p + r[i + 1]); p += r[i + 1]; }
  return a;
}

export class SaveStore {
  constructor() { this.db = null; this.mem = { worlds: new Map(), chunks: new Map() }; this.cache = new Map(); this.dirty = new Set(); }
  async open() {
    try {
      if (!('indexedDB' in window)) throw new Error('pas d\'IndexedDB');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        setTimeout(() => rej(new Error('timeout IndexedDB')), 4000);
      });
    } catch (e) { console.warn('Sauvegarde en mémoire uniquement :', e.message); this.db = null; }
    return this;
  }
  tx(store, mode) { return this.db.transaction(store, mode).objectStore(store); }
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  async listWorlds() {
    if (!this.db) return [...this.mem.worlds.values()];
    try { return await this.req(this.tx('worlds', 'readonly').getAll()); } catch (e) { return []; }
  }
  async saveWorld(meta) {
    if (!this.db) { this.mem.worlds.set(meta.id, JSON.parse(JSON.stringify(meta))); return; }
    try { await this.req(this.tx('worlds', 'readwrite').put(JSON.parse(JSON.stringify(meta)))); } catch (e) { console.warn(e); }
  }
  async deleteWorld(id) {
    if (!this.db) { this.mem.worlds.delete(id); for (const k of [...this.mem.chunks.keys()]) if (k.startsWith(id + '|')) this.mem.chunks.delete(k); return; }
    await this.req(this.tx('worlds', 'readwrite').delete(id));
    const store = this.tx('chunks', 'readwrite');
    const range = IDBKeyRange.bound(id + '|', id + '|￿');
    await this.req(store.delete(range));
  }
  // précharge tous les chunks sauvegardés d'une dimension
  async preload(worldId, dim) {
    this.cache.clear();
    const prefix = worldId + '|' + dim + '|';
    if (!this.db) {
      for (const [k, v] of this.mem.chunks) if (k.startsWith(prefix)) this.cache.set(k.slice(prefix.length), v);
      return;
    }
    try {
      const store = this.tx('chunks', 'readonly');
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const keys = await this.req(store.getAllKeys(range));
      const vals = await this.req(store.getAll(range));
      keys.forEach((k, i) => this.cache.set(k.slice(prefix.length), vals[i]));
    } catch (e) { console.warn('préchargement', e); }
    this.prefix = prefix;
  }
  getChunk(cx, cz, size) {
    const r = this.cache.get(cx + ',' + cz);
    if (!r) return null;
    const blocks = rleDecode16(r.b, size, Uint16Array);
    const meta = rleDecode16(r.m, size, Uint8Array);
    const biomes = new Uint8Array(r.bio);
    const be = new Map();
    if (r.be) for (const [k, v] of r.be) be.set(k, v);
    return { blocks, meta, biomes, blockEntities: be };
  }
  putChunk(worldId, dim, chunk) {
    const rec = {
      b: rleEncode16(chunk.blocks), m: rleEncode16(chunk.meta), bio: Array.from(chunk.biomes),
      be: [...chunk.blockEntities.entries()],
    };
    const k = chunk.cx + ',' + chunk.cz;
    this.cache.set(k, rec);
    this.dirty.add(worldId + '|' + dim + '|' + k);
    this.pending = this.pending || new Map();
    this.pending.set(worldId + '|' + dim + '|' + k, rec);
  }
  async flush() {
    if (!this.pending || !this.pending.size) return;
    const items = [...this.pending.entries()];
    this.pending.clear();
    if (!this.db) { for (const [k, v] of items) this.mem.chunks.set(k, v); return; }
    try {
      const store = this.tx('chunks', 'readwrite');
      for (const [k, v] of items) store.put(v, k);
      await new Promise((res) => { store.transaction.oncomplete = res; store.transaction.onerror = res; });
    } catch (e) { console.warn('flush', e); }
  }
}
