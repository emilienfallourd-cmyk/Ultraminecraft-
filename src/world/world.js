// Monde : stockage des chunks, lumière (ciel + blocs), pipeline de chargement et maillage
import { HEIGHT, SECTIONS } from '../constants.js';
import {
  BLOCKS, BLOCK, B_OPAQUE, B_FILTER, B_EMIT, B_SOLID,
} from '../blocks/blocks.js';
import { meshSection, PW, PA, PV } from './mesher.js';
import { BIOME_GRASS, BIOME_FOLIAGE, BIOME_WATER } from './biomes.js';

export const ST_TERRAIN = 1, ST_DECORATED = 2, ST_LIT = 3;
export const ckey = (cx, cz) => (cx + 0x8000) * 0x10000 + (cz + 0x8000);
const CSIZE = 16 * 16 * HEIGHT;
const BEDROCK = BLOCK.bedrock;

export class Chunk {
  constructor(cx, cz, data) {
    this.cx = cx; this.cz = cz; this.key = ckey(cx, cz);
    this.blocks = data && data.blocks ? data.blocks : new Uint16Array(CSIZE);
    this.meta = data && data.meta ? data.meta : new Uint8Array(CSIZE);
    this.biomes = data && data.biomes ? data.biomes : new Uint8Array(256);
    this.light = new Uint8Array(CSIZE);
    this.hmap = new Uint8Array(256);
    this.state = ST_TERRAIN;
    this.sections = [];
    for (let i = 0; i < SECTIONS; i++) this.sections.push({ solid: null, trans: null, dirty: true, count: 0 });
    this.modified = false;
    this.fromSave = false;
    this.blockEntities = new Map();
    this.meshedOnce = false;
    this.countSections();
  }
  countSections() {
    const b = this.blocks;
    for (let s = 0; s < SECTIONS; s++) {
      let n = 0;
      const o = s * 4096;
      for (let i = 0; i < 4096; i++) if (b[o + i] !== 0) n++;
      this.sections[s].count = n;
    }
  }
  computeHeightmap() {
    const b = this.blocks;
    for (let c = 0; c < 256; c++) {
      let y = HEIGHT - 1;
      for (; y >= 0; y--) if (B_FILTER[b[c | (y << 8)]] > 0) break;
      this.hmap[c] = y + 1;
    }
  }
}

class Queue {
  constructor() { this.a = new Int32Array(3 * 65536); this.h = 0; this.t = 0; }
  push(x, y, z) {
    if (this.t + 3 > this.a.length) {
      if (this.h > 0) { this.a.copyWithin(0, this.h, this.t); this.t -= this.h; this.h = 0; }
      if (this.t + 3 > this.a.length) { const n = new Int32Array(this.a.length * 2); n.set(this.a); this.a = n; }
    }
    this.a[this.t++] = x; this.a[this.t++] = y; this.a[this.t++] = z;
  }
  get empty() { return this.h >= this.t; }
  reset() { this.h = 0; this.t = 0; }
}
class Queue4 extends Queue {
  push4(x, y, z, l) {
    if (this.t + 4 > this.a.length) {
      if (this.h > 0) { this.a.copyWithin(0, this.h, this.t); this.t -= this.h; this.h = 0; }
      if (this.t + 4 > this.a.length) { const n = new Int32Array(this.a.length * 2); n.set(this.a); this.a = n; }
    }
    this.a[this.t++] = x; this.a[this.t++] = y; this.a[this.t++] = z; this.a[this.t++] = l;
  }
}

const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

export class World {
  constructor(opts) {
    this.dim = opts.dim;
    this.seed = opts.seed;
    this.hasSky = opts.hasSky !== false;
    this.chunks = new Map();
    this.sink = opts.sink || null;       // (chunk, sy, result) => void
    this.unsink = opts.unsink || null;   // (chunk) => void
    this.decorator = opts.decorate || null;
    this.generator = opts.generator;     // { request(cx,cz), poll() }
    this.logic = opts.logic || null;
    this.loadSaved = opts.loadSaved || null; // (cx, cz) => data | null
    this.saveChunk = opts.saveChunk || null;
    this.onLit = opts.onLit || null;
    this.blockDefs = BLOCKS;
    this.pending = new Set();
    this.dirty = new Set();
    this.addQ = new Queue(); this.skyQ = new Queue(); this.remQ = new Queue4(); this.remSkyQ = new Queue4();
    this.tick = 0;
    this.buckets = new Map();
    this.scheduledSet = new Set();
    this.center = [0, 0];
    this.radius = 8;
    this.centerSy = 4;
    this._lc = null;
    this.stats = { meshed: 0, lit: 0, decorated: 0, gen: 0 };
    // tampons de collecte pour le mailleur
    this.gB = new Uint16Array(PV); this.gM = new Uint8Array(PV); this.gL = new Uint8Array(PV);
    this.gBio = new Uint8Array(PW * PW);
    this.gGrass = new Uint8Array(768); this.gFol = new Uint8Array(768); this.gWat = new Uint8Array(768);
  }

  // ------------------------------------------------------------ ACCÈS
  getChunk(cx, cz) {
    const lc = this._lc;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get(ckey(cx, cz));
    if (c) this._lc = c;
    return c;
  }
  chunkAt(x, z) { return this.getChunk(x >> 4, z >> 4); }
  isLoaded(x, z) { const c = this.chunkAt(x, z); return !!c && c.state >= ST_DECORATED; }
  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  getLight(x, y, z) {
    if (y >= HEIGHT) return this.hasSky ? 0xF0 : 0;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return this.hasSky ? 0xF0 : 0;
    return c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  getSkyLight(x, y, z) { return this.getLight(x, y, z) >> 4; }
  getBlockLight(x, y, z) { return this.getLight(x, y, z) & 15; }
  getBiome(x, z) { const c = this.chunkAt(x, z); return c ? c.biomes[(x & 15) | ((z & 15) << 4)] : 0; }
  getHeight(x, z) { const c = this.chunkAt(x, z); return c ? c.hmap[(x & 15) | ((z & 15) << 4)] : 0; }
  // hauteur du sol réel (premier bloc solide en partant du haut)
  getSurfaceY(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return -1;
    const i0 = (x & 15) | ((z & 15) << 4);
    for (let y = HEIGHT - 1; y >= 0; y--) { const id = c.blocks[i0 | (y << 8)]; if (B_SOLID[id] || BLOCKS[id].fluid) return y; }
    return -1;
  }

  // Écriture brute (génération / décoration) — pas de mise à jour de lumière
  setRaw(x, y, z, id, meta = 0) {
    if (y < 0 || y >= HEIGHT) return;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const old = c.blocks[i];
    if (old === 0 && id !== 0) c.sections[y >> 4].count++;
    else if (old !== 0 && id === 0) c.sections[y >> 4].count--;
    c.blocks[i] = id; c.meta[i] = meta;
  }

  // Écriture complète avec lumière, maillage et mises à jour voisines
  setBlock(x, y, z, id, meta = 0, opts) {
    if (y < 0 || y >= HEIGHT) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || c.state < ST_DECORATED) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const old = c.blocks[i], oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return false;
    if (old === 0 && id !== 0) c.sections[y >> 4].count++;
    else if (old !== 0 && id === 0) c.sections[y >> 4].count--;
    c.blocks[i] = id; c.meta[i] = meta;
    c.modified = true;
    // carte des hauteurs
    const col = (x & 15) | ((z & 15) << 4);
    if (B_FILTER[id] > 0 && y + 1 > c.hmap[col]) c.hmap[col] = y + 1;
    else if (B_FILTER[id] === 0 && y + 1 === c.hmap[col]) {
      let yy = y - 1;
      for (; yy >= 0; yy--) if (B_FILTER[c.blocks[col | (yy << 8)]] > 0) break;
      c.hmap[col] = yy + 1;
    }
    if (c.state >= ST_LIT) this.updateLightAt(x, y, z, old, id);
    this.markAround(x, y, z);
    if (!opts || opts.notify !== false) {
      if (this.logic) this.logic.onBlockChanged(this, x, y, z, old, id, oldMeta, meta);
    }
    if (old !== id && c.blockEntities.has(i) && !(opts && opts.keepEntity)) c.blockEntities.delete(i);
    return true;
  }
  setMeta(x, y, z, meta) {
    const c = this.chunkAt(x, z);
    if (!c) return;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    if (c.meta[i] === meta) return;
    c.meta[i] = meta; c.modified = true;
    this.markAround(x, y, z);
  }

  getBlockEntity(x, y, z) {
    const c = this.chunkAt(x, z);
    return c ? c.blockEntities.get((x & 15) | ((z & 15) << 4) | (y << 8)) : undefined;
  }
  setBlockEntity(x, y, z, data) {
    const c = this.chunkAt(x, z);
    if (!c) return;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    if (data) c.blockEntities.set(i, data); else c.blockEntities.delete(i);
    c.modified = true;
  }

  // -------------------------------------------------------- MARQUAGE
  markSection(cx, cz, sy) {
    if (sy < 0 || sy >= SECTIONS) return;
    const c = this.getChunk(cx, cz);
    if (!c || c.state < ST_LIT) return;
    c.sections[sy].dirty = true;
    this.dirty.add(c.key * 16 + sy);
  }
  markAround(x, y, z) {
    const cx = x >> 4, cz = z >> 4, sy = y >> 4, lx = x & 15, lz = z & 15, ly = y & 15;
    this.markSection(cx, cz, sy);
    const xs = lx === 0 ? -1 : lx === 15 ? 1 : 0, zs = lz === 0 ? -1 : lz === 15 ? 1 : 0, ys = ly === 0 ? -1 : ly === 15 ? 1 : 0;
    if (xs) this.markSection(cx + xs, cz, sy);
    if (zs) this.markSection(cx, cz + zs, sy);
    if (ys) this.markSection(cx, cz, sy + ys);
    if (xs && zs) this.markSection(cx + xs, cz + zs, sy);
    if (xs && ys) this.markSection(cx + xs, cz, sy + ys);
    if (zs && ys) this.markSection(cx, cz + zs, sy + ys);
  }

  // ---------------------------------------------------------- LUMIÈRE
  _lget(c, i, sky) { return sky ? c.light[i] >> 4 : c.light[i] & 15; }

  propagate(q, sky) {
    const a = q;
    while (a.h < a.t) {
      const x = a.a[a.h++], y = a.a[a.h++], z = a.a[a.h++];
      const c = this.getChunk(x >> 4, z >> 4);
      if (!c) continue;
      const l = sky ? c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] >> 4 : c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] & 15;
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        if (ny < 0 || ny >= HEIGHT) continue;
        const nc = (nx >> 4 === c.cx && nz >> 4 === c.cz) ? c : this.getChunk(nx >> 4, nz >> 4);
        if (!nc || nc.state < ST_LIT) continue;
        const ni = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        const f = B_FILTER[nc.blocks[ni]];
        if (f >= 15) continue;
        let nl = l - (f > 1 ? f : 1);
        if (sky && d === 3 && l === 15 && f === 0) nl = 15;
        const cur = nc.light[ni];
        const cl = sky ? cur >> 4 : cur & 15;
        if (cl < nl) {
          nc.light[ni] = sky ? (cur & 0x0F) | (nl << 4) : (cur & 0xF0) | nl;
          a.push(nx, ny, nz);
          if (nc.meshedOnce) this.markAround(nx, ny, nz);
        }
      }
    }
    a.reset();
  }

  unpropagate(rq, aq, sky) {
    while (rq.h < rq.t) {
      const x = rq.a[rq.h++], y = rq.a[rq.h++], z = rq.a[rq.h++], lvl = rq.a[rq.h++];
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        if (ny < 0 || ny >= HEIGHT) continue;
        const nc = this.getChunk(nx >> 4, nz >> 4);
        if (!nc || nc.state < ST_LIT) continue;
        const ni = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        const cur = nc.light[ni];
        const nl = sky ? cur >> 4 : cur & 15;
        if (nl !== 0 && (nl < lvl || (sky && d === 3 && lvl === 15 && nl === 15))) {
          nc.light[ni] = sky ? cur & 0x0F : cur & 0xF0;
          rq.push4(nx, ny, nz, nl);
          if (nc.meshedOnce) this.markAround(nx, ny, nz);
          if (!sky) {
            const e = B_EMIT[nc.blocks[ni]];
            if (e) { nc.light[ni] = (nc.light[ni] & 0xF0) | e; aq.push(nx, ny, nz); }
          }
        } else if (nl >= lvl) {
          aq.push(nx, ny, nz);
        }
      }
    }
    rq.reset();
    this.propagate(aq, sky);
  }

  updateLightAt(x, y, z, oldId, newId) {
    const c = this.getChunk(x >> 4, z >> 4);
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const of = B_FILTER[oldId], nf = B_FILTER[newId], oe = B_EMIT[oldId], ne = B_EMIT[newId];
    // lumière de bloc
    const curB = c.light[i] & 15;
    if (nf > of || ne < oe) {
      c.light[i] &= 0xF0;
      this.remQ.push4(x, y, z, curB);
      this.unpropagate(this.remQ, this.addQ, false);
    }
    if (ne > 0) {
      if ((c.light[i] & 15) < ne) { c.light[i] = (c.light[i] & 0xF0) | ne; this.addQ.push(x, y, z); }
    }
    if (nf < of || nf < 15) {
      for (let d = 0; d < 6; d++) this.addQ.push(x + DX[d], y + DY[d], z + DZ[d]);
    }
    this.propagate(this.addQ, false);
    // lumière du ciel
    if (!this.hasSky) return;
    const curS = c.light[i] >> 4;
    if (nf > of) {
      c.light[i] &= 0x0F;
      this.remSkyQ.push4(x, y, z, curS);
      this.unpropagate(this.remSkyQ, this.skyQ, true);
    }
    if (nf < 15) {
      for (let d = 0; d < 6; d++) {
        const yy = y + DY[d];
        if (yy >= HEIGHT) {
          // exposé au ciel
          c.light[i] = (c.light[i] & 0x0F) | ((15 - (nf > 0 ? nf : 0)) << 4);
          this.skyQ.push(x, y, z);
        } else this.skyQ.push(x + DX[d], yy, z + DZ[d]);
      }
      this.propagate(this.skyQ, true);
    }
  }

  initLight(c) {
    c.state = ST_LIT;
    const L = c.light, B = c.blocks;
    L.fill(0);
    c.computeHeightmap();
    const bx = c.cx * 16, bz = c.cz * 16;
    if (this.hasSky) {
      for (let col = 0; col < 256; col++) {
        let l = 15;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const i = col | (y << 8);
          const f = B_FILTER[B[i]];
          if (f >= 15) { l = 0; break; }
          if (f > 0) l = Math.max(0, l - f);
          L[i] = l << 4;
          if (l === 0) break;
        }
      }
      // graines : cellules éclairées à côté de colonnes plus hautes
      const nbH = (x, z) => {
        if (x >= 0 && x < 16 && z >= 0 && z < 16) return c.hmap[x | (z << 4)];
        const nc = this.getChunk((bx + x) >> 4, (bz + z) >> 4);
        if (!nc) return 0;
        return nc.hmap[((bx + x) & 15) | (((bz + z) & 15) << 4)];
      };
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const col = x | (z << 4);
        const h = c.hmap[col];
        const mh = Math.max(nbH(x + 1, z), nbH(x - 1, z), nbH(x, z + 1), nbH(x, z - 1));
        for (let y = Math.max(0, h - 1); y < mh && y < HEIGHT; y++) {
          if ((L[col | (y << 8)] >> 4) > 1) this.skyQ.push(bx + x, y, bz + z);
        }
      }
    }
    // émetteurs
    for (let i = 0; i < CSIZE; i++) {
      const e = B_EMIT[B[i]];
      if (e) { L[i] |= e; this.addQ.push(bx + (i & 15), i >> 8, bz + ((i >> 4) & 15)); }
    }
    // graines depuis les bords des voisins éclairés
    const seedEdge = (nc, xs, zs) => {
      if (!nc || nc.state < ST_LIT) return;
      for (let y = 0; y < HEIGHT; y++) for (let k = 0; k < 16; k++) {
        const lx = xs !== null ? xs : k, lz = zs !== null ? zs : k;
        const v = nc.light[lx | (lz << 4) | (y << 8)];
        const wx = nc.cx * 16 + lx, wz = nc.cz * 16 + lz;
        if ((v & 15) > 1) this.addQ.push(wx, y, wz);
        if ((v >> 4) > 1) this.skyQ.push(wx, y, wz);
      }
    };
    seedEdge(this.getChunk(c.cx - 1, c.cz), 15, null);
    seedEdge(this.getChunk(c.cx + 1, c.cz), 0, null);
    seedEdge(this.getChunk(c.cx, c.cz - 1), null, 15);
    seedEdge(this.getChunk(c.cx, c.cz + 1), null, 0);
    this.propagate(this.addQ, false);
    if (this.hasSky) this.propagate(this.skyQ, true);
    for (let s = 0; s < SECTIONS; s++) { c.sections[s].dirty = true; this.dirty.add(c.key * 16 + s); }
    // les voisins déjà maillés doivent remailler leurs bords (rare : on attend
    // normalement que tous les voisins soient éclairés avant de mailler)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = this.getChunk(c.cx + dx, c.cz + dz);
      if (nc && nc.state >= ST_LIT && nc.meshedOnce) for (let s = 0; s < SECTIONS; s++) if (nc.sections[s].count) this.markSection(nc.cx, nc.cz, s);
    }
    this.stats.lit++;
    if (this.onLit) this.onLit(c);
  }

  // ------------------------------------------------------- MAILLAGE
  gather(c, sy) {
    const B = this.gB, M = this.gM, L = this.gL;
    const cs = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(this.getChunk(c.cx + dx, c.cz + dz) || null);
    const skyTop = this.hasSky ? 0xF0 : 0;
    let p = 0;
    for (let y = -1; y <= 16; y++) {
      const wy = sy * 16 + y;
      if (wy < 0 || wy >= HEIGHT) {
        const id = wy < 0 ? BEDROCK : 0, l = wy < 0 ? 0 : skyTop;
        for (let k = 0; k < PA; k++) { B[p] = id; M[p] = 0; L[p] = l; p++; }
        continue;
      }
      const yo = wy << 8;
      for (let z = -1; z <= 16; z++) {
        const zz = z < 0 ? 0 : z > 15 ? 2 : 1, lz = (z & 15) << 4;
        for (let x = -1; x <= 16; x++) {
          const xx = x < 0 ? 0 : x > 15 ? 2 : 1;
          const ch = cs[zz * 3 + xx];
          if (ch) {
            const i = (x & 15) | lz | yo;
            B[p] = ch.blocks[i]; M[p] = ch.meta[i]; L[p] = ch.state >= ST_LIT ? ch.light[i] : skyTop;
          } else { B[p] = BEDROCK; M[p] = 0; L[p] = 0; }
          p++;
        }
      }
    }
    // biomes et teintes mélangées 3x3
    const bio = this.gBio;
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
      const zz = z < 0 ? 0 : z > 15 ? 2 : 1, xx = x < 0 ? 0 : x > 15 ? 2 : 1;
      const ch = cs[zz * 3 + xx];
      bio[(z + 1) * PW + (x + 1)] = ch ? ch.biomes[(x & 15) | ((z & 15) << 4)] : c.biomes[(Math.max(0, Math.min(15, x))) | (Math.max(0, Math.min(15, z)) << 4)];
    }
    const G = this.gGrass, F = this.gFol, W = this.gWat;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0;
      for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
        const b = bio[(z + dz) * PW + (x + dx)] * 3;
        gr += BIOME_GRASS[b]; gg += BIOME_GRASS[b + 1]; gb += BIOME_GRASS[b + 2];
        fr += BIOME_FOLIAGE[b]; fg += BIOME_FOLIAGE[b + 1]; fb += BIOME_FOLIAGE[b + 2];
        wr += BIOME_WATER[b]; wg += BIOME_WATER[b + 1]; wb += BIOME_WATER[b + 2];
      }
      const o = (z * 16 + x) * 3;
      G[o] = gr / 9; G[o + 1] = gg / 9; G[o + 2] = gb / 9;
      F[o] = fr / 9; F[o + 1] = fg / 9; F[o + 2] = fb / 9;
      W[o] = wr / 9; W[o + 1] = wg / 9; W[o + 2] = wb / 9;
    }
    return { blocks: B, meta: M, light: L, grass: G, foliage: F, water: W, wx: c.cx * 16, wy: sy * 16, wz: c.cz * 16 };
  }

  meshNow(c, sy) {
    const s = c.sections[sy];
    s.dirty = false;
    let res = null;
    // une section vide n'a rien à afficher (les faces appartiennent aux blocs pleins)
    if (s.count > 0) res = meshSection(this.gather(c, sy));
    else res = { solid: null, trans: null };
    if (this.sink) this.sink(c, sy, res);
    c.meshedOnce = true;
    this.stats.meshed++;
  }

  // -------------------------------------------------------- CHARGEMENT
  setCenter(cx, cz, radius, sy = 4) { this.center = [cx, cz]; this.radius = radius; this.centerSy = sy; }

  neighborsAtLeast(c, st) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n || n.state < st) return false;
    }
    return true;
  }

  update(budgetMs = 8) {
    const t0 = performance.now();
    const [pcx, pcz] = this.center, R = this.radius;
    // 1) demandes de génération
    const want = [];
    const RG = R + 2;
    for (let dz = -RG; dz <= RG; dz++) for (let dx = -RG; dx <= RG; dx++) {
      if (dx * dx + dz * dz > (RG + 0.5) * (RG + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz, k = ckey(cx, cz);
      if (this.chunks.has(k) || this.pending.has(k)) continue;
      want.push([dx * dx + dz * dz, cx, cz, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz, k] of want) {
      if (this.pending.size >= (this.generator.maxInFlight || 8)) break;
      const saved = this.loadSaved ? this.loadSaved(cx, cz) : null;
      if (saved) {
        const ch = new Chunk(cx, cz, saved);
        ch.state = ST_DECORATED; ch.fromSave = true;
        if (saved.blockEntities) ch.blockEntities = saved.blockEntities;
        ch.computeHeightmap();
        this.chunks.set(k, ch);
        continue;
      }
      this.pending.add(k);
      this.generator.request(cx, cz);
    }
    // 2) réception
    for (const r of this.generator.poll()) {
      const k = ckey(r.cx, r.cz);
      this.pending.delete(k);
      if (this.chunks.has(k)) continue;
      const dx = r.cx - pcx, dz = r.cz - pcz;
      if (dx * dx + dz * dz > (R + 4) * (R + 4)) continue;
      const ch = new Chunk(r.cx, r.cz, r);
      if (r.bes && r.bes.length) ch.blockEntities = new Map(r.bes);
      ch.computeHeightmap();
      this.chunks.set(k, ch);
      this.stats.gen++;
    }
    // 3) décoration / 4) lumière
    const list = [];
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      list.push([dx * dx + dz * dz, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (const [d2, c] of list) {
      if (performance.now() - t0 > budgetMs) break;
      if (c.state === ST_TERRAIN && d2 <= (R + 1.5) * (R + 1.5) && this.neighborsAtLeast(c, ST_TERRAIN)) {
        if (this.decorator) this.decorator(this, c);
        c.state = ST_DECORATED;
        c.computeHeightmap();
        c.countSections();
        this.stats.decorated++;
      }
    }
    for (const [d2, c] of list) {
      if (performance.now() - t0 > budgetMs) break;
      if (c.state === ST_DECORATED && d2 <= (R + 0.5) * (R + 0.5) && this.neighborsAtLeast(c, ST_DECORATED)) {
        this.initLight(c);
      }
    }
    // 5) maillage des sections sales — une section n'est maillée que lorsque ses
    // voisins sont définitifs, pour ne pas la reconstruire à chaque voisin chargé
    if (this.dirty.size) {
      const arr = [];
      const ready = new Map();
      const lightR2 = (R - 0.5) * (R - 0.5);
      for (const k of this.dirty) {
        const ck = Math.floor(k / 16), sy = k - ck * 16;
        let ok = ready.get(ck);
        const cx = Math.floor(ck / 0x10000) - 0x8000, cz = (ck % 0x10000) - 0x8000;
        const dx = cx - pcx, dz = cz - pcz, d2 = dx * dx + dz * dz;
        if (ok === undefined) {
          const c = this.getChunk(cx, cz);
          if (!c) ok = -1;
          else if (c.state < ST_LIT) ok = 0;
          else ok = (c.meshedOnce || this.neighborsAtLeast(c, d2 <= lightR2 ? ST_LIT : ST_DECORATED)) ? 1 : 0;
          ready.set(ck, ok);
        }
        if (ok < 0) { this.dirty.delete(k); continue; }
        if (!ok) continue;
        arr.push([d2 + Math.abs(sy - this.centerSy) * 0.3, k, cx, cz, sy]);
      }
      arr.sort((a, b) => a[0] - b[0]);
      for (const [, k, cx, cz, sy] of arr) {
        if (performance.now() - t0 > budgetMs * 1.8) break;
        this.dirty.delete(k);
        const c = this.getChunk(cx, cz);
        if (!c || c.state < ST_LIT) continue;
        this.meshNow(c, sy);
      }
    }
    // 6) déchargement
    const RU = R + 4;
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > RU * RU) this.unload(c);
    }
  }

  unload(c) {
    if (c.modified && this.saveChunk) this.saveChunk(c);
    if (this.unsink) this.unsink(c);
    this.chunks.delete(c.key);
    if (this._lc === c) this._lc = null;
    for (let s = 0; s < SECTIONS; s++) this.dirty.delete(c.key * 16 + s);
  }

  dispose() {
    for (const c of [...this.chunks.values()]) this.unload(c);
  }

  // ----------------------------------------------------- TICKS PLANIFIÉS
  schedule(x, y, z, delay) {
    const key = x + ',' + y + ',' + z;
    if (this.scheduledSet.has(key)) return;
    this.scheduledSet.add(key);
    const due = this.tick + Math.max(1, delay | 0);
    let b = this.buckets.get(due);
    if (!b) { b = []; this.buckets.set(due, b); }
    b.push(x, y, z);
  }

  runTicks() {
    this.tick++;
    const b = this.buckets.get(this.tick);
    if (b) {
      this.buckets.delete(this.tick);
      for (let i = 0; i < b.length; i += 3) {
        const x = b[i], y = b[i + 1], z = b[i + 2];
        this.scheduledSet.delete(x + ',' + y + ',' + z);
        if (!this.isLoaded(x, z)) continue;
        if (this.logic) this.logic.scheduledTick(this, x, y, z);
      }
    }
  }

  randomTicks(px, pz, radius = 6, perSection = 3) {
    if (!this.logic) return;
    const pcx = px >> 4, pcz = pz >> 4;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || c.state < ST_LIT) continue;
      for (let s = 0; s < SECTIONS; s++) {
        if (!c.sections[s].count) continue;
        for (let k = 0; k < perSection; k++) {
          const r = (Math.random() * 4096) | 0;
          const i = s * 4096 + r;
          const id = c.blocks[i];
          if (id && BLOCKS[id].randomTick) this.logic.randomTick(this, c.cx * 16 + (r & 15), i >> 8, c.cz * 16 + ((r >> 4) & 15), id, c.meta[i]);
        }
      }
    }
  }
}
