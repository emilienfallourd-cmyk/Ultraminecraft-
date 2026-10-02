// Grandes structures générées par morceaux découpés par chunk (déterministes) :
// villages, forts (portail de l'End), cités antiques, forteresses du Nether, bastions, cités de l'End, piliers de l'End
import { HEIGHT, SEA_LEVEL } from '../../constants.js';
import { RNG, hash2 } from '../../util/noise.js';
import { BLOCK as K, BLOCKS } from '../../blocks/blocks.js';
import { BIOME as BI } from '../biomes.js';
import { lootChest } from './loot.js';

const idx = (x, y, z) => x | (z << 4) | (y << 8);

// Écrivain découpé au chunk courant
class Clip {
  constructor(cx, cz, blocks, meta, bes) { this.bx = cx * 16; this.bz = cz * 16; this.b = blocks; this.m = meta; this.bes = bes; }
  in(x, z) { return x >= this.bx && x < this.bx + 16 && z >= this.bz && z < this.bz + 16; }
  set(x, y, z, id, m = 0) {
    if (y < 1 || y >= HEIGHT || !this.in(x, z)) return;
    const i = idx(x - this.bx, y, z - this.bz);
    this.b[i] = id; this.m[i] = m;
  }
  get(x, y, z) { if (y < 0 || y >= HEIGHT || !this.in(x, z)) return -1; return this.b[idx(x - this.bx, y, z - this.bz)]; }
  fill(x0, y0, z0, x1, y1, z1, id, m = 0) {
    const ax = Math.max(x0, this.bx), bx = Math.min(x1, this.bx + 15), az = Math.max(z0, this.bz), bz = Math.min(z1, this.bz + 15);
    for (let x = ax; x <= bx; x++) for (let z = az; z <= bz; z++) for (let y = y0; y <= y1; y++) this.set(x, y, z, id, m);
  }
  hollow(x0, y0, z0, x1, y1, z1, wall, inner = 0) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (!this.in(x, z)) continue;
      for (let y = y0; y <= y1; y++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
        this.set(x, y, z, edge ? wall : inner);
      }
    }
  }
  be(x, y, z, data) { if (this.in(x, z)) this.bes.push([idx(x - this.bx, y, z - this.bz), data]); }
  chest(x, y, z, table, rng, facing = 0) { if (!this.in(x, z)) { rng.next(); return; } this.set(x, y, z, K.chest, facing); this.be(x, y, z, { type: 'chest', items: lootChest(table, rng) }); }
  spawner(x, y, z, mob) { this.set(x, y, z, K.spawner); this.be(x, y, z, { type: 'spawner', mob, delay: 100 }); }
  mob(x, y, z, mob) { this.be(x, y, z, { type: 'spawnMarker', mob }); }
  // fondations : remplit vers le bas jusqu'au sol
  foundation(x, y, z, id) {
    if (!this.in(x, z)) return;
    for (let yy = y; yy > 1; yy--) {
      const cur = this.get(x, yy, z);
      if (cur !== 0 && cur !== K.water && cur !== K.lava && !(BLOCKS[cur] && BLOCKS[cur].replaceable)) break;
      this.set(x, yy, z, id);
    }
  }
  clearAbove(x, y, z, h = 8) { if (!this.in(x, z)) return; for (let yy = y; yy < Math.min(HEIGHT, y + h); yy++) { const c = this.get(x, yy, z); if (c !== 0 && !(BLOCKS[c] && BLOCKS[c].fluid)) this.set(x, yy, z, 0); } }
}

// ============================================================ VILLAGES
const VILLAGE_BIOMES = new Set([BI.plains, BI.sunflower_plains, BI.savanna, BI.desert, BI.taiga, BI.snowy_plains, BI.meadow]);
function villageStyle(b) {
  if (b === BI.desert) return { wall: K.cut_sandstone, frame: K.sandstone, floor: K.smooth_stone, roof: K.sandstone_slab, roofStairs: K.sandstone_stairs, path: K.dirt_path, door: true, log: K.sandstone, planks: K.sandstone };
  if (b === BI.savanna) return { wall: K.acacia_planks, frame: K.acacia_log, floor: K.acacia_planks, roof: K.oak_slab, roofStairs: K.oak_stairs, path: K.dirt_path, door: true, log: K.acacia_log, planks: K.acacia_planks };
  if (b === BI.taiga || b === BI.snowy_plains) return { wall: K.spruce_planks, frame: K.spruce_log, floor: K.spruce_planks, roof: K.spruce_planks, roofStairs: K.spruce_stairs, path: K.dirt_path, door: true, log: K.spruce_log, planks: K.spruce_planks };
  return { wall: K.oak_planks, frame: K.oak_log, floor: K.oak_planks, roof: K.oak_slab, roofStairs: K.oak_stairs, path: K.dirt_path, door: true, log: K.oak_log, planks: K.oak_planks, cobble: true };
}

function villagePlan(gen, rx, rz) {
  const key = 'v' + rx + ',' + rz;
  if (gen.planCache && gen.planCache.has(key)) return gen.planCache.get(key);
  gen.planCache = gen.planCache || new Map();
  const rng = new RNG((hash2(rx, rz, gen.seed + 101) * 4294967296) | 0);
  let plan = null;
  if (rng.chance(0.6)) {
    const cx = rx * 400 + 60 + rng.int(280), cz = rz * 400 + 60 + rng.int(280);
    const col = gen.column(cx, cz);
    const near = Math.hypot(cx, cz) < 600 ? 1 : 0;
    if (VILLAGE_BIOMES.has(col.biome) && col.h > SEA_LEVEL && col.h < 95 && col.mount < 0.25 && (near || rng.chance(0.8))) {
      // vérification de la planéité
      let ok = true, minH = 999, maxH = -999;
      for (let i = -24; i <= 24; i += 8) for (let j = -24; j <= 24; j += 8) { const h = gen.column(cx + i, cz + j).h; minH = Math.min(minH, h); maxH = Math.max(maxH, h); if (h < SEA_LEVEL) ok = false; }
      if (ok && maxH - minH < 12) {
        const style = villageStyle(col.biome);
        const pieces = [];
        const cy = col.h;
        pieces.push({ type: 'well', x: cx, z: cz, y: cy });
        // routes en croix + maisons le long
        const roads = [];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const len = 18 + rng.int(20);
          roads.push({ x: cx, z: cz, dx, dz, len });
          for (let s = 8; s < len - 4; s += 9 + rng.int(4)) {
            for (const side of [1, -1]) {
              if (!rng.chance(0.75)) continue;
              const px = cx + dx * s + (dz !== 0 ? side * 6 : 0), pz = cz + dz * s + (dx !== 0 ? side * 6 : 0);
              const kind = rng.pick(['house', 'house', 'house_big', 'farm', 'farm', 'smith', 'library', 'lamp', 'tower']);
              const facing = dx !== 0 ? (side > 0 ? 2 : 0) : (side > 0 ? 1 : 3);
              pieces.push({ type: kind, x: px, z: pz, y: gen.column(px, pz).h, facing, seed: rng.int(1e9) });
            }
          }
        }
        plan = { cx, cz, cy, style, pieces, roads };
      }
    }
  }
  gen.planCache.set(key, plan);
  return plan;
}

function buildVillage(gen, S, plan) {
  const st = plan.style;
  // routes
  for (const r of plan.roads) {
    for (let s = -2; s <= r.len; s++) for (let w = -1; w <= 1; w++) {
      const x = r.x + r.dx * s + (r.dz !== 0 ? w : 0), z = r.z + r.dz * s + (r.dx !== 0 ? w : 0);
      if (!S.in(x, z)) continue;
      const h = gen.column(x, z).h;
      const cur = S.get(x, h, z);
      if (cur === K.water) { S.set(x, h, z, st.planks === K.sandstone ? K.sandstone : K.oak_planks); continue; }
      if (cur === K.grass_block || cur === K.dirt || cur === K.sand || cur === K.snowy_grass_block || cur === K.podzol || cur === K.coarse_dirt) S.set(x, h, z, plan.style.planks === K.sandstone ? K.smooth_stone : K.dirt_path);
      S.clearAbove(x, h + 1, z, 3);
    }
  }
  for (const p of plan.pieces) buildVillagePiece(S, p, st, plan);
}

function rotXZ(x, z, f) { // f: 0 sud, 1 ouest, 2 nord, 3 est
  switch (f) { case 1: return [-z, x]; case 2: return [-x, -z]; case 3: return [z, -x]; default: return [x, z]; }
}

function buildVillagePiece(S, p, st, plan) {
  const rng = new RNG(p.seed || 7);
  const put = (lx, ly, lz, id, m = 0) => { const [rx, rz] = rotXZ(lx, lz, p.facing || 0); S.set(p.x + rx, p.y + ly, p.z + rz, id, m); };
  const fillL = (x0, y0, z0, x1, y1, z1, id, m = 0) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id, m); };
  const found = (x0, z0, x1, z1) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const [rx, rz] = rotXZ(x, z, p.facing || 0); S.foundation(p.x + rx, p.y, p.z + rz, st.cobble ? K.cobblestone : st.frame); S.clearAbove(p.x + rx, p.y + 1, p.z + rz, 9); } };
  switch (p.type) {
    case 'well': {
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { S.foundation(p.x + x, p.y, p.z + z, K.cobblestone); S.clearAbove(p.x + x, p.y + 1, p.z + z, 6); }
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { S.set(p.x + x, p.y, p.z + z, K.cobblestone); S.set(p.x + x, p.y + 1, p.z + z, x || z ? K.cobblestone : K.water); }
      S.set(p.x, p.y - 1, p.z, K.water); S.set(p.x, p.y - 2, p.z, K.water);
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { S.set(p.x + x, p.y + 2, p.z + z, K.oak_fence); S.set(p.x + x, p.y + 3, p.z + z, K.oak_fence); }
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) S.set(p.x + x, p.y + 4, p.z + z, K.cobblestone_slab);
      S.set(p.x, p.y + 3, p.z, K.bell);
      S.mob(p.x + 3, p.y + 1, p.z, 'villager'); S.mob(p.x - 3, p.y + 1, p.z + 1, 'villager'); S.mob(p.x, p.y + 1, p.z + 4, 'iron_golem');
      break;
    }
    case 'house': case 'house_big': case 'library': case 'smith': {
      const W = p.type === 'house' ? 2 : 3, D = p.type === 'house' ? 2 : 3, H = 4;
      found(-W, -D, W, D);
      fillL(-W, 0, -D, W, 0, D, st.floor);
      for (let x = -W; x <= W; x++) for (let z = -D; z <= D; z++) for (let y = 1; y <= H; y++) {
        const edge = Math.abs(x) === W || Math.abs(z) === D;
        const corner = Math.abs(x) === W && Math.abs(z) === D;
        if (!edge) { put(x, y, z, 0); continue; }
        if (corner) put(x, y, z, st.frame, 0);
        else if (y === 2 && (x === 0 || z === 0)) put(x, y, z, K.glass);
        else put(x, y, z, st.wall);
      }
      // toit
      for (let k = 0; k <= W + 1; k++) for (let z = -D - 1; z <= D + 1; z++) {
        const y = H + 1 + Math.floor(k / 1);
        if (k <= W) { put(-W - 1 + k, H + 1 + k - (k > W ? 1 : 0), z, st.roofStairs, 3); put(W + 1 - k, H + 1 + k, z, st.roofStairs, 1); }
        void y;
      }
      fillL(0, H + W + 2, -D - 1, 0, H + W + 2, D + 1, st.planks);
      for (let k = 1; k <= W; k++) for (let z of [-D, D]) for (let x = -W + k; x <= W - k; x++) put(x, H + k, z, st.wall);
      // porte
      put(0, 1, D, K.oak_door, 0); put(0, 2, D, K.oak_door, 8);
      put(0, 0, D + 1, st.path === K.dirt_path ? K.cobblestone_stairs : st.floor, 2);
      // mobilier
      put(-W + 1, 1, -D + 1, p.type === 'smith' ? K.furnace : K.crafting_table, 0);
      put(W - 1, 1, -D + 1, K.red_bed, 2); put(W - 1, 1, -D + 2, K.red_bed, 2 | 8);
      put(0, 3, 0, K.lantern);
      if (p.type === 'library') { for (let x = -W + 1; x <= W - 1; x++) { put(x, 1, -D + 1, K.bookshelf); put(x, 2, -D + 1, K.bookshelf); } }
      if (p.type === 'smith') { put(-W + 1, 1, 0, K.anvil, 1); put(1, 1, -D + 1, K.lava); }
      const [cx, cz] = rotXZ(W - 1, 0, p.facing || 0);
      if (rng.chance(0.6)) S.chest(p.x + cx, p.y + 1, p.z + cz, 'village', rng, (p.facing + 2) % 4);
      const [mx, mz] = rotXZ(0, 0, p.facing || 0);
      S.mob(p.x + mx, p.y + 1, p.z + mz, 'villager');
      break;
    }
    case 'farm': {
      found(-4, -3, 4, 3);
      for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
        const edge = Math.abs(x) === 4 || Math.abs(z) === 3;
        if (edge) { put(x, 0, z, st.log, 1); put(x, 1, z, 0); continue; }
        if (x === 0) { put(x, 0, z, K.water); put(x, 1, z, 0); continue; }
        put(x, 0, z, K.farmland, 7);
        const crop = rng.pick([K.wheat, K.wheat, K.carrots, K.potatoes]);
        put(x, 1, z, crop, 3 + rng.int(5));
      }
      break;
    }
    case 'lamp': {
      S.foundation(p.x, p.y, p.z, K.cobblestone);
      for (let y = 1; y <= 3; y++) S.set(p.x, p.y + y, p.z, K.oak_fence);
      S.set(p.x, p.y + 4, p.z, K.glowstone);
      break;
    }
    case 'tower': {
      found(-2, -2, 2, 2);
      for (let y = 0; y <= 9; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        const edge = Math.abs(x) === 2 || Math.abs(z) === 2;
        if (y === 0 || y === 9) put(x, y, z, K.cobblestone);
        else put(x, y, z, edge ? ((y % 4 === 2 && (x === 0 || z === 0)) ? K.glass : K.cobblestone) : (x === 1 && z === 1 ? K.ladder : 0), x === 1 && z === 1 ? 2 : 0);
      }
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if ((x + z) % 2 === 0 && (Math.abs(x) === 2 || Math.abs(z) === 2)) put(x, 10, z, K.cobblestone_wall);
      put(0, 1, 2, K.oak_door, 0); put(0, 2, 2, K.oak_door, 8);
      put(0, 10, 0, K.torch);
      break;
    }
  }
}

// ============================================================== FORTS
export function strongholdPositions(seed) {
  const r = new RNG((seed ^ 0x5157) | 0);
  const base = r.next() * Math.PI * 2;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = base + i * Math.PI * 2 / 3;
    const d = 380 + r.next() * 260;
    out.push([Math.floor(Math.cos(a) * d / 16) * 16 + 8, 28, Math.floor(Math.sin(a) * d / 16) * 16 + 8]);
  }
  return out;
}

function buildStronghold(S, sx, sy, sz, seed) {
  const rng = new RNG(seed);
  const B = () => { const r = rng.next(); return r < 0.6 ? K.stone_bricks : r < 0.8 ? K.mossy_stone_bricks : K.cracked_stone_bricks; };
  const room = (x0, y0, z0, x1, y1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
      S.set(x, y, z, edge ? B() : 0);
    }
  };
  // salle du portail (11 x 16)
  room(sx - 5, sy, sz - 8, sx + 5, sy + 8, sz + 8);
  // bassin de lave et escalier
  for (let x = sx - 2; x <= sx + 2; x++) for (let z = sz + 1; z <= sz + 5; z++) S.set(x, sy, z, K.lava);
  for (let x = sx - 4; x <= sx + 4; x++) for (let z = sz - 7; z <= sz - 3; z++) S.set(x, sy + 1, z, B());
  for (let x = sx - 1; x <= sx + 1; x++) for (let z = sz - 2; z <= sz - 1; z++) S.set(x, sy + 1, z, K.stone_brick_stairs, 2);
  // cadre du portail de l'End (au-dessus de la lave)
  const fy = sy + 3;
  for (let x = sx - 2; x <= sx + 2; x++) for (let z = sz + 1; z <= sz + 5; z++) S.set(x, fy - 1, z, B());
  for (let x = sx - 1; x <= sx + 1; x++) for (let z = sz + 2; z <= sz + 4; z++) S.set(x, fy - 1, z, 0);
  for (let x = sx - 1; x <= sx + 1; x++) for (let z = sz + 2; z <= sz + 4; z++) S.set(x, fy - 2, z, K.lava);
  const frames = [];
  for (let i = -1; i <= 1; i++) {
    frames.push([sx + i, sz + 1, 0], [sx + i, sz + 5, 2], [sx - 2, sz + 3 + i, 3], [sx + 2, sz + 3 + i, 1]);
  }
  for (const [x, z, f] of frames) S.set(x, fy, z, K.end_portal_frame, f | (rng.chance(0.1) ? 4 : 0));
  S.spawner(sx, sy + 2, sz - 5, 'silverfish');
  for (let i = 0; i < 4; i++) { S.set(sx - 4, sy + 4, sz - 6 + i * 4, K.iron_bars); S.set(sx + 4, sy + 4, sz - 6 + i * 4, K.iron_bars); }
  for (const z of [sz - 6, sz, sz + 6]) { S.set(sx - 4, sy + 6, z, K.torch); S.set(sx + 4, sy + 6, z, K.torch); }
  // couloirs
  const corridor = (x0, z0, dx, dz, len) => {
    for (let s = 0; s < len; s++) {
      const x = x0 + dx * s, z = z0 + dz * s;
      for (let w = -2; w <= 2; w++) for (let y = 0; y <= 4; y++) {
        const xx = x + (dz ? w : 0), zz = z + (dx ? w : 0);
        const edge = Math.abs(w) === 2 || y === 0 || y === 4;
        S.set(xx, sy + y, zz, edge ? B() : 0);
      }
      if (s % 8 === 4) S.set(x + (dz ? 1 : 0), sy + 3, z + (dx ? 1 : 0), K.torch);
    }
  };
  corridor(sx, sz - 9, 0, -1, 30);
  corridor(sx - 6, sz, -1, 0, 26);
  corridor(sx + 6, sz, 1, 0, 26);
  // bibliothèque
  const lx = sx + 32, lz = sz;
  room(lx - 6, sy, lz - 7, lx + 6, sy + 7, lz + 7);
  for (let x = lx - 5; x <= lx + 5; x++) for (const z of [lz - 6, lz + 6]) for (let y = 1; y <= 5; y++) S.set(x, sy + y, z, K.bookshelf);
  for (let z = lz - 5; z <= lz + 5; z++) for (let y = 1; y <= 5; y++) { if (Math.abs(z - lz) > 1) S.set(lx + 5, sy + y, z, K.bookshelf); }
  S.set(lx - 5, sy + 1, lz, 0); S.set(lx - 5, sy + 2, lz, 0); S.set(lx - 6, sy + 1, lz, 0); S.set(lx - 6, sy + 2, lz, 0);
  S.chest(lx + 4, sy + 1, lz + 3, 'stronghold', rng, 1);
  S.chest(lx + 4, sy + 1, lz - 3, 'stronghold', rng, 1);
  S.set(lx, sy + 6, lz, K.lantern);
  // cellules de prison
  const px = sx - 32, pz = sz;
  room(px - 5, sy, pz - 5, px + 5, sy + 5, pz + 5);
  for (let x = px - 4; x <= px + 4; x++) S.set(x, sy + 1, pz, K.iron_bars), S.set(x, sy + 2, pz, K.iron_bars), S.set(x, sy + 3, pz, K.iron_bars);
  S.set(px + 5, sy + 1, pz + 2, 0); S.set(px + 5, sy + 2, pz + 2, 0); S.set(px + 6, sy + 1, pz, 0); S.set(px + 6, sy + 2, pz, 0);
  S.chest(px - 3, sy + 1, pz - 3, 'stronghold', rng, 0);
  // escalier de surface (puits)
  const tz = sz - 40;
  for (let y = sy; y < sy + 50; y++) {
    for (let x = sx - 2; x <= sx + 2; x++) for (let z = tz - 2; z <= tz + 2; z++) {
      const edge = Math.abs(x - sx) === 2 || Math.abs(z - tz) === 2;
      if (S.get(x, y, z) === 0 && y > sy + 4 && !edge) continue;
      S.set(x, y, z, edge ? B() : 0);
    }
    const a = (y - sy) % 4;
    const sp = [[sx - 1, tz - 1], [sx + 1, tz - 1], [sx + 1, tz + 1], [sx - 1, tz + 1]][a];
    S.set(sp[0], y, sp[1], K.stone_brick_slab);
    S.set(sx, y, tz, K.stone_bricks);
  }
}

// ======================================================== CITÉ ANTIQUE
function ancientCityPlan(gen, rx, rz) {
  const key = 'a' + rx + ',' + rz;
  gen.planCache = gen.planCache || new Map();
  if (gen.planCache.has(key)) return gen.planCache.get(key);
  const rng = new RNG((hash2(rx, rz, gen.seed + 303) * 4294967296) | 0);
  let plan = null;
  if (rng.chance(0.55)) {
    const x = rx * 512 + 80 + rng.int(350), z = rz * 512 + 80 + rng.int(350);
    if (gen.nDeep.noise2(x / 400 + 7, z / 400 - 3) > 0.35 || Math.hypot(x, z) < 900) plan = { x, y: 12, z, seed: rng.int(1e9) };
  }
  gen.planCache.set(key, plan);
  return plan;
}

function buildAncientCity(S, p) {
  const rng = new RNG(p.seed);
  const { x: cx, y: cy, z: cz } = p;
  const R = 34;
  const brick = () => { const r = rng.next(); return r < 0.55 ? K.deepslate_bricks : r < 0.85 ? K.deepslate_tiles : K.cobbled_deepslate; };
  // grande caverne
  for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) {
    if (!S.in(x, z)) continue;
    const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    const ceil = 18 - Math.floor(d / 6);
    for (let y = cy - 1; y <= cy + ceil; y++) {
      if (y === cy - 1) S.set(x, y, z, (x + z) % 7 === 0 ? K.sculk : brick());
      else S.set(x, y, z, 0);
    }
    S.set(x, cy + ceil + 1, z, K.deepslate);
    // sculk au sol
    if (rng.chance(0.25)) S.set(x, cy - 1, z, K.sculk);
    if (rng.chance(0.01)) S.set(x, cy, z, K.sculk_sensor);
    else if (rng.chance(0.006)) S.set(x, cy, z, K.sculk_shrieker);
    else if (rng.chance(0.004)) S.set(x, cy, z, K.soul_lantern);
  }
  // le « portail » central en ardoise renforcée
  const pz = cz - 10;
  for (let x = cx - 9; x <= cx + 9; x++) for (let y = cy; y <= cy + 14; y++) for (let z = pz - 1; z <= pz + 1; z++) {
    const ax = Math.abs(x - cx);
    const frame = (ax >= 7 && ax <= 9) || (y >= cy + 11);
    const arch = ax < 7 && y < cy + 11;
    if (frame && !(arch)) S.set(x, y, z, y === cy + 14 || ax === 9 ? K.reinforced_deepslate : K.deepslate_bricks);
  }
  for (let x = cx - 6; x <= cx + 6; x++) S.set(x, cy - 1, pz, K.reinforced_deepslate);
  // piliers et pièces latérales
  for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) {
    const x = cx + i * 8, z = cz + side * 18;
    for (let y = cy; y < cy + 9; y++) { S.set(x, y, z, K.deepslate_tiles); S.set(x + 1, y, z, K.deepslate_tiles); }
    S.set(x, cy + 9, z, K.soul_lantern);
  }
  // salles avec coffres
  for (const [ox, oz] of [[-22, 6], [22, 6], [-22, -16], [22, -16], [0, 20]]) {
    const x0 = cx + ox - 4, z0 = cz + oz - 3;
    for (let x = x0; x <= x0 + 8; x++) for (let z = z0; z <= z0 + 6; z++) for (let y = cy; y <= cy + 5; y++) {
      const edge = x === x0 || x === x0 + 8 || z === z0 || z === z0 + 6 || y === cy + 5;
      if (edge) S.set(x, y, z, brick());
    }
    S.set(x0 + 4, cy, z0, 0); S.set(x0 + 4, cy + 1, z0, 0); S.set(x0 + 4, cy + 2, z0, 0);
    S.chest(x0 + 2, cy, z0 + 4, 'ancient_city', rng, 2);
    S.chest(x0 + 6, cy, z0 + 4, 'ancient_city', rng, 2);
    S.set(x0 + 4, cy, z0 + 3, K.sculk_shrieker);
  }
}

// ======================================================= NETHER
function fortressPlan(gen, rx, rz) {
  const key = 'f' + rx + ',' + rz;
  gen.planCache = gen.planCache || new Map();
  if (gen.planCache.has(key)) return gen.planCache.get(key);
  const rng = new RNG((hash2(rx, rz, gen.seed + 707) * 4294967296) | 0);
  let plan = null;
  if (rng.chance(0.7) || (rx === 0 && rz === 0)) {
    const x = rx * 288 + 40 + rng.int(200), z = rz * 288 + 40 + rng.int(200);
    plan = { kind: rng.chance(0.75) || (rx === 0 && rz === 0) ? 'fortress' : 'bastion', x, z, y: 64, seed: rng.int(1e9) };
    if (rx === 0 && rz === 0) { plan.x = 30; plan.z = 30; }
  }
  gen.planCache.set(key, plan);
  return plan;
}

function buildFortress(S, p) {
  const rng = new RNG(p.seed);
  const y0 = p.y;
  const NB = K.nether_bricks;
  // ponts en croix
  const bridge = (x0, z0, dx, dz, len) => {
    for (let s = 0; s < len; s++) {
      const x = x0 + dx * s, z = z0 + dz * s;
      for (let w = -2; w <= 2; w++) {
        const xx = x + (dz ? w : 0), zz = z + (dx ? w : 0);
        S.set(xx, y0, zz, NB);
        S.set(xx, y0 - 1, zz, Math.abs(w) <= 1 ? NB : 0);
        for (let y = y0 + 1; y <= y0 + 4; y++) S.set(xx, y, zz, 0);
        if (Math.abs(w) === 2) S.set(xx, y0 + 1, zz, K.nether_brick_fence);
      }
      // piliers de soutien
      if (s % 10 === 0) for (const w of [-1, 0, 1]) for (let y = y0 - 2; y > 1; y--) {
        const xx = x + (dz ? w : 0), zz = z + (dx ? w : 0);
        const cur = S.get(xx, y, zz);
        if (cur === K.netherrack || cur === K.bedrock || cur === K.soul_sand || cur === K.basalt || cur === K.blackstone || cur === K.soul_soil) break;
        S.set(xx, y, zz, NB);
      }
    }
  };
  bridge(p.x - 40, p.z, 1, 0, 81);
  bridge(p.x, p.z - 40, 0, 1, 81);
  // salle centrale couverte avec plate-forme à blazes
  for (let x = p.x - 6; x <= p.x + 6; x++) for (let z = p.z - 6; z <= p.z + 6; z++) for (let y = y0; y <= y0 + 7; y++) {
    const edge = Math.abs(x - p.x) === 6 || Math.abs(z - p.z) === 6;
    if (y === y0) S.set(x, y, z, NB);
    else if (y === y0 + 7) S.set(x, y, z, NB);
    else if (edge) S.set(x, y, z, (y === y0 + 3 && (x - p.x) % 3 === 0) || (y === y0 + 3 && (z - p.z) % 3 === 0) ? K.nether_brick_fence : NB);
    else S.set(x, y, z, 0);
  }
  for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) for (let w = -1; w <= 1; w++) for (let y = 1; y <= 3; y++) S.set(p.x + dx + (dz ? w : 0), y0 + y, p.z + dz + (dx ? w : 0), 0);
  S.spawner(p.x, y0 + 1, p.z, 'blaze');
  for (let x = p.x - 1; x <= p.x + 1; x++) for (let z = p.z - 1; z <= p.z + 1; z++) if (x !== p.x || z !== p.z) S.set(x, y0 + 1, z, K.nether_brick_stairs, 0);
  // bouts de pont : salles de verrues et coffres
  for (const [ex, ez, f] of [[p.x + 40, p.z, 1], [p.x - 40, p.z, 3], [p.x, p.z + 40, 2], [p.x, p.z - 40, 0]]) {
    for (let x = ex - 4; x <= ex + 4; x++) for (let z = ez - 4; z <= ez + 4; z++) for (let y = y0; y <= y0 + 6; y++) {
      const edge = Math.abs(x - ex) === 4 || Math.abs(z - ez) === 4;
      if (y === y0 || y === y0 + 6) S.set(x, y, z, NB);
      else S.set(x, y, z, edge ? NB : 0);
    }
    for (let x = ex - 2; x <= ex + 2; x++) { S.set(x, y0 + 1, ez + 2, K.soul_sand); S.set(x, y0 + 2, ez + 2, K.nether_wart, 2); }
    S.chest(ex - 3, y0 + 1, ez - 3, 'nether_fortress', rng, f);
    S.mob(ex, y0 + 1, ez, 'wither_skeleton');
    for (let w = -1; w <= 1; w++) for (let y = 1; y <= 3; y++) { S.set(ex + (f % 2 ? 4 * (f === 1 ? -1 : 1) : w), y0 + y, ez + (f % 2 ? w : 4 * (f === 2 ? -1 : 1)), 0); }
  }
  S.mob(p.x + 10, y0 + 1, p.z, 'blaze'); S.mob(p.x, y0 + 1, p.z + 12, 'wither_skeleton');
}

function buildBastion(S, p) {
  const rng = new RNG(p.seed);
  const y0 = 40;
  const BS = () => (rng.next() < 0.7 ? K.polished_blackstone_bricks : K.blackstone);
  for (let x = p.x - 12; x <= p.x + 12; x++) for (let z = p.z - 12; z <= p.z + 12; z++) {
    for (let y = y0; y <= y0 + 22; y++) {
      const edge = Math.abs(x - p.x) === 12 || Math.abs(z - p.z) === 12;
      const floor = (y - y0) % 7 === 0;
      if (floor || edge) S.set(x, y, z, edge && (y - y0) % 7 === 3 && (x + z) % 4 === 0 ? 0 : BS());
      else S.set(x, y, z, 0);
    }
    for (let y = y0 - 1; y > 5; y--) { const c = S.get(x, y, z); if (c !== 0 && c !== K.lava) break; S.set(x, y, z, K.blackstone); }
  }
  // trésor central
  for (let x = p.x - 2; x <= p.x + 2; x++) for (let z = p.z - 2; z <= p.z + 2; z++) S.set(x, y0 + 7, z, (x + z) % 2 ? K.gold_block : K.gilded_blackstone);
  S.chest(p.x, y0 + 8, p.z, 'bastion', rng, 0);
  S.chest(p.x + 8, y0 + 1, p.z + 8, 'bastion', rng, 0);
  S.chest(p.x - 8, y0 + 15, p.z - 8, 'bastion', rng, 0);
  // escaliers entre étages
  for (let lvl = 0; lvl < 3; lvl++) for (let i = 0; i < 7; i++) S.set(p.x - 10 + i, y0 + lvl * 7 + i + 1, p.z - 10 + lvl * 2, K.polished_blackstone_bricks);
  for (let i = 0; i < 6; i++) S.mob(p.x + (i % 3 - 1) * 5, y0 + 1 + Math.floor(i / 3) * 7, p.z + 4, i % 2 ? 'piglin' : 'hoglin');
}

// ========================================================== END
export function endPillars(seed) {
  const r = new RNG((seed ^ 0xe11d) | 0);
  const order = [...Array(10).keys()];
  for (let i = 9; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const out = [];
  for (let i = 0; i < 10; i++) {
    const a = 2 * (-Math.PI + Math.PI / 10 * i);
    const o = order[i];
    out.push({ x: Math.floor(42 * Math.cos(a)), z: Math.floor(42 * Math.sin(a)), r: 2 + Math.floor(o / 3), h: 76 + o * 3, caged: o === 1 || o === 2 });
  }
  return out;
}

function buildEndPillars(S, gen) {
  for (const pl of endPillars(gen.seed)) {
    for (let x = pl.x - pl.r - 1; x <= pl.x + pl.r + 1; x++) for (let z = pl.z - pl.r - 1; z <= pl.z + pl.r + 1; z++) {
      if (!S.in(x, z)) continue;
      const d2 = (x - pl.x) ** 2 + (z - pl.z) ** 2;
      if (d2 <= pl.r * pl.r + 1) for (let y = 40; y < pl.h; y++) S.set(x, y, z, K.obsidian);
      if (pl.caged) {
        const dx = Math.abs(x - pl.x), dz = Math.abs(z - pl.z);
        if (dx <= 2 && dz <= 2) for (let y = pl.h; y <= pl.h + 3; y++) if ((dx === 2 || dz === 2 || y === pl.h + 3)) S.set(x, y, z, K.iron_bars);
      }
    }
    S.set(pl.x, pl.h, pl.z, K.bedrock);
  }
}

function buildExitFountain(S, y) {
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const d2 = x * x + z * z;
    if (d2 <= 12.5) {
      S.set(x, y - 1, z, K.bedrock);
      if (d2 > 6.5) S.set(x, y, z, K.bedrock);
      else S.set(x, y, z, K.bedrock);
      for (let yy = y + 1; yy <= y + 4; yy++) S.set(x, yy, z, 0);
      if (d2 > 6.5 && d2 <= 12.5) S.set(x, y + 1, z, K.bedrock);
    }
  }
  for (let yy = y + 1; yy <= y + 3; yy++) S.set(0, yy, 0, K.bedrock);
  S.set(1, y + 2, 0, K.torch, 4); S.set(-1, y + 2, 0, K.torch, 2); S.set(0, y + 2, 1, K.torch, 1); S.set(0, y + 2, -1, K.torch, 3);
}

function endCityPlan(gen, rx, rz) {
  const key = 'e' + rx + ',' + rz;
  gen.planCache = gen.planCache || new Map();
  if (gen.planCache.has(key)) return gen.planCache.get(key);
  const rng = new RNG((hash2(rx, rz, gen.seed + 909) * 4294967296) | 0);
  let plan = null;
  const x = rx * 320 + 60 + rng.int(200), z = rz * 320 + 60 + rng.int(200);
  if (Math.hypot(x, z) > 850 && rng.chance(0.6)) {
    const top = gen.surfaceAt ? gen.surfaceAt(x, z) : -1;
    if (top > 30) plan = { x, z, y: top + 1, seed: rng.int(1e9) };
  }
  gen.planCache.set(key, plan);
  return plan;
}

function buildEndCity(S, p) {
  const rng = new RNG(p.seed);
  const P = K.purpur_block, PP = K.purpur_pillar, EB = K.end_stone_bricks;
  let y = p.y;
  const floors = 4 + rng.int(3);
  for (let f = 0; f < floors; f++) {
    const r = f === floors - 1 ? 5 : 3 + (f % 2);
    for (let x = p.x - r; x <= p.x + r; x++) for (let z = p.z - r; z <= p.z + r; z++) for (let yy = y; yy <= y + 5; yy++) {
      const edge = Math.abs(x - p.x) === r || Math.abs(z - p.z) === r;
      const corner = Math.abs(x - p.x) === r && Math.abs(z - p.z) === r;
      if (yy === y) S.set(x, yy, z, (x + z) % 2 ? P : EB);
      else if (corner) S.set(x, yy, z, PP);
      else if (edge) S.set(x, yy, z, yy === y + 3 && (x === p.x || z === p.z) ? K.magenta_stained_glass || K.purple_stained_glass : P);
      else S.set(x, yy, z, 0);
    }
    S.set(p.x + r - 1, y + 4, p.z, K.end_rod);
    S.set(p.x - r + 1, y + 4, p.z, K.end_rod);
    // escalier central
    for (let k = 0; k < 5; k++) S.set(p.x + [1, 1, 0, -1, -1][k], y + 1 + k, p.z + [0, 1, 1, 1, 0][k], K.purpur_stairs, k % 4);
    y += 6;
  }
  for (let x = p.x - 5; x <= p.x + 5; x++) for (let z = p.z - 5; z <= p.z + 5; z++) if ((x + z) % 3 === 0 && (Math.abs(x - p.x) === 5 || Math.abs(z - p.z) === 5)) S.set(x, y, z, K.end_rod);
  // trésor : coffre avec élytres garanties
  const cy = y - 5;
  if (S.in(p.x + 3, p.z + 3)) {
    S.set(p.x + 3, cy, p.z + 3, K.chest, 0);
    const items = lootChest('end_city', rng);
    items[13] = { id: 'elytra', count: 1 };
    S.be(p.x + 3, cy, p.z + 3, { type: 'chest', items });
  }
  S.mob(p.x, p.y + 7, p.z, 'shulker'); S.mob(p.x + 2, p.y + 13, p.z - 2, 'shulker');
}

// =============================================================== ENTRÉES
export function placeStructurePieces(gen, cx, cz, blocks, meta) {
  const bes = [];
  const S = new Clip(cx, cz, blocks, meta, bes);
  const bx = cx * 16, bz = cz * 16;
  // villages
  const vr = 400;
  for (let rx = Math.floor((bx - 80) / vr); rx <= Math.floor((bx + 96) / vr); rx++) for (let rz = Math.floor((bz - 80) / vr); rz <= Math.floor((bz + 96) / vr); rz++) {
    const plan = villagePlan(gen, rx, rz);
    if (plan && Math.abs(plan.cx - bx - 8) < 72 && Math.abs(plan.cz - bz - 8) < 72) buildVillage(gen, S, plan);
  }
  // forts
  for (const sh of strongholdPositions(gen.seed)) {
    if (Math.abs(sh[0] - bx - 8) < 64 && Math.abs(sh[2] - bz - 8) < 64) buildStronghold(S, sh[0], sh[1], sh[2], gen.seed ^ (sh[0] * 31 + sh[2]));
  }
  // cités antiques
  const ar = 512;
  for (let rx = Math.floor((bx - 48) / ar); rx <= Math.floor((bx + 64) / ar); rx++) for (let rz = Math.floor((bz - 48) / ar); rz <= Math.floor((bz + 64) / ar); rz++) {
    const plan = ancientCityPlan(gen, rx, rz);
    if (plan && Math.abs(plan.x - bx - 8) < 48 && Math.abs(plan.z - bz - 8) < 48) buildAncientCity(S, plan);
  }
  return bes;
}

export function placeNetherStructures(gen, cx, cz, blocks, meta) {
  const bes = [];
  const S = new Clip(cx, cz, blocks, meta, bes);
  const bx = cx * 16, bz = cz * 16, R = 288;
  for (let rx = Math.floor((bx - 64) / R); rx <= Math.floor((bx + 80) / R); rx++) for (let rz = Math.floor((bz - 64) / R); rz <= Math.floor((bz + 80) / R); rz++) {
    const plan = fortressPlan(gen, rx, rz);
    if (!plan || Math.abs(plan.x - bx - 8) > 64 || Math.abs(plan.z - bz - 8) > 64) continue;
    if (plan.kind === 'fortress') buildFortress(S, plan); else buildBastion(S, plan);
  }
  return bes;
}

export function placeEndStructures(gen, cx, cz, blocks, meta) {
  const bes = [];
  const S = new Clip(cx, cz, blocks, meta, bes);
  const bx = cx * 16, bz = cz * 16;
  if (Math.abs(bx) < 64 && Math.abs(bz) < 64) {
    buildEndPillars(S, gen);
    if (S.in(0, 0) || S.in(4, 4) || S.in(-4, -4) || S.in(4, -4) || S.in(-4, 4)) buildExitFountain(S, gen.fountainY || 64);
  }
  const R = 320;
  for (let rx = Math.floor((bx - 32) / R); rx <= Math.floor((bx + 48) / R); rx++) for (let rz = Math.floor((bz - 32) / R); rz <= Math.floor((bz + 48) / R); rz++) {
    const plan = endCityPlan(gen, rx, rz);
    if (plan && Math.abs(plan.x - bx - 8) < 24 && Math.abs(plan.z - bz - 8) < 24) buildEndCity(S, plan);
  }
  return bes;
}

export { Clip };
export const _villagePlan = villagePlan;
export const _ancientPlan = ancientCityPlan;
export const _fortressPlan = fortressPlan;
