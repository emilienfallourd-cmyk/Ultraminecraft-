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
export const VILLAGE_REGION = 320;
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
  // près du point d'apparition, plusieurs essais pour presque toujours avoir un village à proximité
  const nearSpawn = Math.abs(rx + 0.5) <= 1.5 && Math.abs(rz + 0.5) <= 1.5;
  if (nearSpawn || rng.chance(0.75)) for (let attempt = 0; attempt < (nearSpawn ? 16 : 1) && !plan; attempt++) {
    const cx = rx * VILLAGE_REGION + 50 + rng.int(VILLAGE_REGION - 100), cz = rz * VILLAGE_REGION + 50 + rng.int(VILLAGE_REGION - 100);
    const col = gen.column(cx, cz);
    const near = Math.hypot(cx, cz) < 600 ? 1 : 0;
    if (VILLAGE_BIOMES.has(col.biome) && col.h > SEA_LEVEL && col.h < 95 && col.mount < 0.25 && (near || rng.chance(0.8))) {
      // vérification de la planéité
      let ok = true, minH = 999, maxH = -999;
      for (let i = -24; i <= 24; i += 8) for (let j = -24; j <= 24; j += 8) { const h = gen.column(cx + i, cz + j).h; minH = Math.min(minH, h); maxH = Math.max(maxH, h); if (h < SEA_LEVEL) ok = false; }
      if (ok && maxH - minH < 14) {
        const style = villageStyle(col.biome);
        const pieces = [];
        const cy = col.h;
        pieces.push({ type: 'well', x: cx, z: cz, y: cy });
        // routes en croix + maisons le long
        const roads = [];
        let plan_has_church = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const len = 18 + rng.int(20);
          roads.push({ x: cx, z: cz, dx, dz, len });
          for (let s = 8; s < len - 4; s += 9 + rng.int(4)) {
            for (const side of [1, -1]) {
              if (!rng.chance(0.75)) continue;
              const px = cx + dx * s + (dz !== 0 ? side * 6 : 0), pz = cz + dz * s + (dx !== 0 ? side * 6 : 0);
              let kind = rng.pick(['house', 'house', 'house', 'house_big', 'house_big', 'farm', 'farm', 'pen', 'smith', 'library', 'market', 'lamp', 'hay', 'tower']);
              if (!plan_has_church && s >= 12 && rng.chance(0.5)) { kind = 'church'; plan_has_church = true; }
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
// tourne l'orientation d'un bloc (escaliers, portes, lits, coffres, fours, bûches, torches) avec la structure
const DIR_MODELS = new Set(['door', 'ladder', 'stairs', 'bed', 'chest', 'skull', 'end_portal_frame']);
function rotMeta(id, m, f) {
  if (!f) return m;
  const b = BLOCKS[id];
  if (!b) return m;
  if (b.axis) { const a = m & 3; return (f & 1) && (a === 1 || a === 2) ? (m & ~3) | (3 - a) : m; }
  if (b.model === 'torch') { const t = m & 7; return t ? (m & ~7) | ((((t - 1) + f) & 3) + 1) : m; }
  if (b.facing || DIR_MODELS.has(b.model)) return (m & ~3) | (((m & 3) + f) & 3);
  return m;
}

const FLOWERS_V = [K.poppy, K.dandelion, K.cornflower, K.oxeye_daisy, K.azure_bluet].filter((x) => x !== undefined);
function buildVillagePiece(S, p, st, plan) {
  const rng = new RNG(p.seed || 7);
  const f = p.facing || 0;
  const W2 = (lx, lz) => { const [rx, rz] = rotXZ(lx, lz, f); return [p.x + rx, p.z + rz]; };
  const put = (lx, ly, lz, id, m = 0) => { const [x, z] = W2(lx, lz); S.set(x, p.y + ly, z, id, rotMeta(id, m, f)); };
  const fillL = (x0, y0, z0, x1, y1, z1, id, m = 0) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id, m); };
  const found = (x0, z0, x1, z1, id, clear = 10) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const [wx, wz] = W2(x, z); S.foundation(wx, p.y, wz, id); S.clearAbove(wx, p.y + 1, wz, clear); } };
  const mob = (lx, ly, lz, type) => { const [x, z] = W2(lx, lz); S.mob(x, p.y + ly, z, type); };
  const chest = (lx, ly, lz, table, facing = 0) => { const [x, z] = W2(lx, lz); S.chest(x, p.y + ly, z, table, rng, rotMeta(K.chest, facing, f)); };
  const stone = st.cobble ? K.cobblestone : st.planks === K.sandstone ? K.sandstone : K.cobblestone;
  const stoneStairs = st.planks === K.sandstone ? K.sandstone_stairs : K.cobblestone_stairs;
  // allée de la porte jusqu'à la route
  const pathTo = (fromZ) => { for (let z = fromZ; z <= 5; z++) { const [x, wz] = W2(0, z); const top = S.get(x, p.y, wz); if (top === K.grass_block || top === K.dirt || top === K.snowy_grass_block || top === K.sand || top === K.podzol) S.set(x, p.y, wz, st.planks === K.sandstone ? K.smooth_stone : K.dirt_path); S.clearAbove(x, p.y + 1, wz, 2); } };
  // toit à deux pans : faîtage le long de x, escaliers tournés vers le faîte, pignons pleins
  const roof = (W, D, H, mat = st.roofStairs, ridge = st.roof, gable = st.wall) => {
    for (let k = 0; k <= D + 1; k++) {
      const y = H + 1 + k, zz = D + 1 - k;
      for (let x = -W - 1; x <= W + 1; x++) {
        if (zz > 0) { put(x, y, zz, mat, 2); put(x, y, -zz, mat, 0); }
        else put(x, y, 0, ridge);
      }
      if (k <= D) for (let z = -(D - k); z <= D - k; z++) { put(-W, y, z, gable); put(W, y, z, gable); }
    }
    fillL(-W + 1, H + 1, -D + 1, W - 1, H + 1, D - 1, st.planks);  // plafond
  };
  // murs : poteaux d'angle en bûches, fenêtres, porte à l'avant (+z)
  const walls = (W, D, H, wall = st.wall, frame = st.frame) => {
    for (let x = -W; x <= W; x++) for (let z = -D; z <= D; z++) for (let y = 1; y <= H; y++) {
      const ex = Math.abs(x) === W, ez = Math.abs(z) === D;
      if (!ex && !ez) { put(x, y, z, 0); continue; }
      if (ex && ez) { put(x, y, z, frame, 0); continue; }
      const win = y === 2 || (y === 3 && H >= 4);
      const winSpot = (ez && x !== 0 && Math.abs(x) % 2 === 1 && Math.abs(x) < W) || (ex && Math.abs(z) % 2 === 0 && Math.abs(z) < D);
      put(x, y, z, win && winSpot ? K.glass : wall);
    }
    for (let x = -W; x <= W; x++) { put(x, 0, -D, frame, 1); put(x, 0, D, frame, 1); }
    put(0, 1, D, K.oak_door, 0); put(0, 2, D, K.oak_door, 8);
    put(0, 0, D + 1, stoneStairs, 2);
    put(1, 1, D + 1, rng.pick(FLOWERS_V)); put(-1, 1, D + 1, rng.pick(FLOWERS_V));
    put(1, 0, D + 1, K.grass_block); put(-1, 0, D + 1, K.grass_block);
  };
  const bed = (lx, lz) => { put(lx, 1, lz + 1, K.red_bed, 2); put(lx, 1, lz, K.red_bed, 2 | 8); };

  switch (p.type) {
    case 'well': {
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { S.foundation(p.x + x, p.y, p.z + z, K.cobblestone); S.clearAbove(p.x + x, p.y + 1, p.z + z, 6); if (Math.abs(x) === 3 || Math.abs(z) === 3) S.set(p.x + x, p.y, p.z + z, st.planks === K.sandstone ? K.smooth_stone : K.dirt_path); }
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { S.set(p.x + x, p.y, p.z + z, K.cobblestone); S.set(p.x + x, p.y + 1, p.z + z, x || z ? K.cobblestone : K.water); }
      for (let d = 1; d <= 4; d++) S.set(p.x, p.y - d, p.z, K.water);
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { S.set(p.x + x, p.y + 2, p.z + z, K.oak_fence); S.set(p.x + x, p.y + 3, p.z + z, K.oak_fence); }
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) S.set(p.x + x, p.y + 4, p.z + z, K.cobblestone_slab);
      S.set(p.x, p.y + 3, p.z, K.bell);
      for (const [x, z] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) { S.set(p.x + x, p.y + 1, p.z + z, K.oak_fence); S.set(p.x + x, p.y + 2, p.z + z, K.lantern); }
      S.mob(p.x + 3, p.y + 1, p.z, 'villager'); S.mob(p.x - 3, p.y + 1, p.z + 1, 'villager'); S.mob(p.x, p.y + 1, p.z + 4, 'iron_golem');
      break;
    }
    case 'house': case 'house_big': case 'library': {
      const big = p.type !== 'house';
      const W = big ? 3 : 2, D = big ? 3 : 2, H = big ? 4 : 3;
      found(-W - 1, -D - 1, W + 1, D + 1, stone, H + D + 4);
      fillL(-W, 0, -D, W, 0, D, st.floor);
      walls(W, D, H);
      roof(W, D, H);
      bed(W - 1, -D + 1);
      if (big) bed(W - 2, -D + 1);
      put(-W + 1, 1, -D + 1, K.crafting_table);
      put(-W + 1, 1, 0, K.barrel);
      put(-W + 1, 2, 0, K.lantern);
      if (rng.chance(0.7)) chest(-W + 1, 1, D - 1, 'village', 1);
      if (p.type === 'library') {
        for (let x = -W + 1; x <= W - 1; x++) for (let y = 1; y <= 3; y++) put(x, y, -D + 1, K.bookshelf);
        put(W - 1, 1, D - 1, K.lantern);
      } else if (big) put(W - 1, 1, D - 1, K.composter !== undefined ? K.composter : K.barrel);
      pathTo(D + 2);
      mob(0, 1, 0, 'villager');
      if (big) mob(1, 1, -1, 'villager');
      break;
    }
    case 'smith': {
      const W = 3, D = 3, H = 4;
      found(-W - 1, -D - 1, W + 1, D + 1, K.cobblestone, H + D + 4);
      fillL(-W, 0, -D, W, 0, D, K.cobblestone);
      // forge à demi ouverte : murs de pierre au fond, piliers à l'avant
      for (let y = 1; y <= H; y++) {
        for (let x = -W; x <= W; x++) put(x, y, -D, K.cobblestone);
        for (let z = -D; z <= D; z++) { put(-W, y, z, K.cobblestone); put(W, y, z, z === D || z === 0 ? st.frame : 0); }
        put(-1, y, D, st.frame); put(-W, y, D, st.frame);
      }
      roof(W, D, H, stoneStairs, K.cobblestone_slab, K.cobblestone);
      fillL(-W + 1, 1, -D + 1, -W + 2, 1, -D + 2, K.cobblestone);
      put(-W + 1, 1, -D + 1, K.lava); put(-W + 2, 2, -D + 1, K.iron_bars); put(-W + 1, 2, -D + 2, K.iron_bars);
      put(0, 1, -D + 1, K.furnace, 0); put(1, 1, -D + 1, K.furnace, 0);
      put(1, 1, 0, K.anvil); put(-1, 1, 1, K.cauldron !== undefined ? K.cauldron : K.barrel);
      chest(2, 1, -D + 1, 'village_smith', 0);
      pathTo(D + 1);
      mob(0, 1, 1, 'villager');
      break;
    }
    case 'church': {
      const W = 2, D = 4, H = 6, stn = K.stone_bricks !== undefined ? K.stone_bricks : K.cobblestone;
      found(-W - 1, -D - 4, W + 1, D + 1, stn, 18);
      fillL(-W, 0, -D, W, 0, D, stn);
      walls(W, D, H, stn, K.cobblestone);
      roof(W, D, H, stoneStairs, K.cobblestone_slab, stn);
      // clocher à l'arrière
      for (let y = 0; y <= 12; y++) for (let x = -2; x <= 2; x++) for (let z = -D - 4; z <= -D; z++) {
        const edge = Math.abs(x) === 2 || z === -D - 4 || z === -D;
        if (y === 0) put(x, y, z, stn);
        else if (edge) put(x, y, z, y >= 9 && y <= 10 && (x === 0 || z === -D - 2) ? 0 : stn);
        else put(x, y, z, x === 1 && z === -D - 3 && y < 9 ? K.ladder : 0, 2);
      }
      fillL(-2, 13, -D - 4, 2, 13, -D, K.cobblestone_slab);
      put(0, 12, -D - 2, K.bell);
      put(0, 1, -D, 0); put(0, 2, -D, 0);
      for (let z = -D + 1; z <= D - 2; z += 2) { put(-1, 1, z, K.oak_stairs, 0); put(1, 1, z, K.oak_stairs, 0); }
      put(0, 1, -D + 1, K.lantern !== undefined ? K.lantern : K.torch);
      chest(-1, 1, -D + 1, 'village', 0);
      pathTo(D + 2);
      mob(0, 1, 0, 'villager');
      break;
    }
    case 'farm': {
      found(-4, -3, 4, 3, st.log, 3);
      const crops = [K.wheat, K.carrots, K.potatoes].filter((c) => c !== undefined);
      const crop = rng.pick(crops);
      for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
        const edge = Math.abs(x) === 4 || Math.abs(z) === 3;
        if (edge) { put(x, 0, z, st.log, Math.abs(z) === 3 ? 1 : 2); put(x, 1, z, 0); continue; }
        if (x === 0) { put(x, 0, z, K.water); put(x, 1, z, 0); continue; }
        put(x, 0, z, K.farmland, 7);
        put(x, 1, z, crop, 3 + rng.int(5));
      }
      put(4, 1, 3, K.composter !== undefined ? K.composter : K.hay_block);
      mob(0, 1, 4, 'villager');
      break;
    }
    case 'pen': {
      found(-4, -4, 4, 4, K.dirt, 4);
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        const [wx, wz] = W2(x, z);
        if (S.get(wx, p.y, wz) !== K.grass_block) S.set(wx, p.y, wz, K.grass_block);
        if (Math.abs(x) === 4 || Math.abs(z) === 4) put(x, 1, z, x === 0 && z === 4 ? 0 : K.oak_fence);
      }
      put(-3, 1, -3, K.hay_block, 0); put(-2, 1, -3, K.hay_block, 1); put(-3, 2, -3, K.hay_block, 2);
      put(3, 0, -3, K.water);
      const animals = rng.pick([['cow', 'cow', 'cow'], ['sheep', 'sheep', 'sheep'], ['pig', 'pig'], ['chicken', 'chicken', 'chicken', 'chicken']]);
      animals.forEach((a, i) => mob(-1 + i, 1, 1 - (i % 2) * 2, a));
      break;
    }
    case 'market': {
      found(-2, -2, 2, 2, stone, 5);
      const cols = [K.red_wool, K.yellow_wool, K.blue_wool, K.white_wool].filter((c) => c !== undefined);
      const c1 = rng.pick(cols), c2 = K.white_wool !== undefined ? K.white_wool : c1;
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 1; y <= 3; y++) put(x, y, z, K.oak_fence);
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) put(x, 4, z, (x + 2) % 2 ? c1 : c2);
      for (let x = -1; x <= 1; x++) put(x, 1, -1, K.barrel);
      put(-1, 2, -1, K.melon !== undefined ? K.melon : K.hay_block); put(1, 2, -1, K.pumpkin !== undefined ? K.pumpkin : K.hay_block);
      chest(0, 2, -1, 'village', 0);
      mob(0, 1, 1, 'villager');
      break;
    }
    case 'hay': {
      found(-1, -1, 1, 1, K.dirt, 4);
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { put(x, 1, z, K.hay_block, rng.int(3)); if (rng.chance(0.4)) put(x, 2, z, K.hay_block, rng.int(3)); }
      break;
    }
    case 'lamp': {
      S.foundation(p.x, p.y, p.z, K.cobblestone);
      for (let y = 1; y <= 3; y++) S.set(p.x, p.y + y, p.z, K.oak_fence);
      S.set(p.x, p.y + 4, p.z, K.glowstone);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.set(p.x + dx, p.y + 4, p.z + dz, K.oak_fence);
      break;
    }
    case 'tower': {
      found(-2, -2, 2, 2, K.cobblestone, 12);
      for (let y = 0; y <= 9; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        const edge = Math.abs(x) === 2 || Math.abs(z) === 2;
        if (y === 0 || y === 9) put(x, y, z, K.cobblestone);
        else put(x, y, z, edge ? ((y % 4 === 2 && (x === 0 || z === 0)) ? K.glass : (Math.abs(x) === 2 && Math.abs(z) === 2 ? K.mossy_cobblestone || K.cobblestone : K.cobblestone)) : (x === 1 && z === -1 ? K.ladder : 0), x === 1 && z === -1 ? 2 : 0);
      }
      put(1, 9, -1, 0);
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if ((Math.abs(x) === 2 || Math.abs(z) === 2) && (x + z) % 2 === 0) put(x, 10, z, K.cobblestone_wall);
      put(0, 1, 2, K.oak_door, 0); put(0, 2, 2, K.oak_door, 8);
      put(0, 10, 0, K.torch); put(-1, 10, 1, K.torch);
      chest(-1, 1, -1, 'village', 0);
      pathTo(3);
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

// ================================================== NOUVELLES STRUCTURES
function cachedPlan(gen, key, make) {
  gen.planCache = gen.planCache || new Map();
  if (gen.planCache.has(key)) return gen.planCache.get(key);
  let plan = null;
  try { plan = make(); } catch (e) { plan = null; }
  gen.planCache.set(key, plan);
  return plan;
}
const seedOf = (gen, rx, rz, salt) => (hash2(rx, rz, gen.seed + salt) * 4294967296) | 0;

// ---------------------------------------------------- AVANT-POSTE DE PILLARDS
const OUTPOST_BIOMES = new Set([BI.plains, BI.sunflower_plains, BI.savanna, BI.desert, BI.taiga, BI.snowy_plains, BI.meadow, BI.snowy_taiga]);
function outpostPlan(gen, rx, rz) {
  return cachedPlan(gen, 'o' + rx + ',' + rz, () => {
    const rng = new RNG(seedOf(gen, rx, rz, 211));
    if (!rng.chance(0.45)) return null;
    const x = rx * 320 + 40 + rng.int(240), z = rz * 320 + 40 + rng.int(240);
    if (Math.hypot(x, z) < 220) return null;
    const col = gen.column(x, z);
    if (!OUTPOST_BIOMES.has(col.biome) || col.h <= SEA_LEVEL || col.h > 100 || col.mount > 0.3) return null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const v = villagePlan(gen, Math.floor(x / VILLAGE_REGION) + i, Math.floor(z / VILLAGE_REGION) + j); if (v && Math.hypot(v.cx - x, v.cz - z) < 150) return null; }
    return { x, z, y: col.h, seed: rng.int(1e9) };
  });
}
function buildOutpost(gen, S, P) {
  const { x, z, y } = P, rng = new RNG(P.seed);
  const DL = K.dark_oak_log, DP = K.dark_oak_planks, BP = K.birch_planks, C = K.cobblestone;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { S.foundation(x + dx, y, z + dz, C); S.clearAbove(x + dx, y + 1, z + dz, 26); }
  for (let dy = 0; dy <= 18; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const ex = Math.abs(dx) === 3, ez = Math.abs(dz) === 3, X = x + dx, Y = y + dy, Z = z + dz;
    if (ex && ez) { S.set(X, Y, Z, DL); continue; }
    if (dy === 0) { S.set(X, Y, Z, C); continue; }
    if (dy % 6 === 0) { S.set(X, Y, Z, ex || ez ? DP : (dx === 0 && dz === -2 ? K.ladder : DP), dx === 0 && dz === -2 ? 2 : 0); continue; }
    if (ex || ez) { const win = dy % 6 === 3 && (dx === 0 || dz === 0) && dy > 3; S.set(X, Y, Z, win ? 0 : dy < 6 ? (rng.chance(0.3) ? K.mossy_cobblestone : C) : BP); continue; }
    S.set(X, Y, Z, dx === 0 && dz === -2 ? K.ladder : 0, 2);
  }
  // porte
  S.set(x, y + 1, z + 3, 0); S.set(x, y + 2, z + 3, 0);
  // plate-forme du sommet avec garde-corps et toit
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    if (Math.abs(dx) <= 3 && Math.abs(dz) <= 3 && !(dx === 0 && dz === -2)) S.set(x + dx, y + 18, z + dz, DP);
    else if (Math.abs(dx) === 4 || Math.abs(dz) === 4) { S.set(x + dx, y + 18, z + dz, DP); S.set(x + dx, y + 19, z + dz, K.oak_fence); }
  }
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let dy = 19; dy <= 21; dy++) S.set(x + dx, y + dy, z + dz, DL);
  for (let l = 0; l < 3; l++) for (let dx = -4 + l; dx <= 4 - l; dx++) for (let dz = -4 + l; dz <= 4 - l; dz++) S.set(x + dx, y + 22 + l, z + dz, DP);
  S.chest(x + 2, y + 19, z + 2, 'pillager_outpost', rng, 2);
  S.mob(x + 1, y + 1, z + 1, 'pillager'); S.mob(x - 1, y + 7, z, 'pillager'); S.mob(x + 1, y + 13, z, 'pillager'); S.mob(x - 1, y + 19, z - 1, 'pillager');
  S.mob(x + 6, y + 1, z + 2, 'pillager'); S.mob(x - 5, y + 1, z + 6, 'vindicator');
  // tentes
  for (const [ox, oz] of [[10, 5], [-9, -7], [7, -10]]) {
    const ty = gen.column(x + ox, z + oz).h;
    for (let k = 0; k < 5; k++) for (let w = -2; w <= 2; w++) {
      const X = x + ox + k, Z = z + oz + w;
      S.foundation(X, ty, Z, K.dirt); S.clearAbove(X, ty + 1, Z, 4);
      const h = 3 - Math.abs(w);
      if (h >= 1) S.set(X, ty + h, Z, K.white_wool);
    }
    S.set(x + ox + 2, ty + 1, z + oz, K.hay_block);
  }
  // cage avec un golem de fer
  { const ox = -9, oz = 8, ty = gen.column(x + ox, z + oz).h;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      S.foundation(x + ox + dx, ty, z + oz + dz, DP); S.clearAbove(x + ox + dx, ty + 1, z + oz + dz, 5);
      for (let dy = 1; dy <= 3; dy++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) S.set(x + ox + dx, ty + dy, z + oz + dz, Math.abs(dx) === 2 && Math.abs(dz) === 2 ? DL : K.iron_bars);
      S.set(x + ox + dx, ty + 4, z + oz + dz, DP);
    }
    S.mob(x + ox, ty + 1, z + oz, 'iron_golem');
  }
  for (let k = 0; k < 4; k++) { const ox = rng.int(17) - 8, oz = rng.int(17) - 8; if (Math.abs(ox) < 6 && Math.abs(oz) < 6) continue; const ty = gen.column(x + ox, z + oz).h; S.set(x + ox, ty + 1, z + oz, rng.chance(0.5) ? K.pumpkin : K.hay_block); }
}

// ------------------------------------------------------- TEMPLE DE LA JUNGLE
function jungleTemplePlan(gen, rx, rz) {
  return cachedPlan(gen, 'j' + rx + ',' + rz, () => {
    const rng = new RNG(seedOf(gen, rx, rz, 307));
    if (!rng.chance(0.55)) return null;
    const x = rx * 256 + 30 + rng.int(196), z = rz * 256 + 30 + rng.int(196);
    const col = gen.column(x, z);
    if (col.biome !== BI.jungle || col.h <= SEA_LEVEL || col.h > 110) return null;
    return { x, z, y: col.h, seed: rng.int(1e9) };
  });
}
function buildJungleTemple(S, P) {
  const { x, z, y } = P, rng = new RNG(P.seed);
  const M = () => (rng.chance(0.45) ? K.mossy_cobblestone : K.cobblestone);
  for (let dx = -7; dx <= 6; dx++) for (let dz = -8; dz <= 8; dz++) { S.foundation(x + dx, y - 5, z + dz, K.mossy_cobblestone); S.clearAbove(x + dx, y + 1, z + dz, 16); }
  // sous-sol caché
  for (let dy = -5; dy <= 0; dy++) for (let dx = -6; dx <= 5; dx++) for (let dz = -7; dz <= 7; dz++) {
    const edge = dx === -6 || dx === 5 || dz === -7 || dz === 7 || dy === -5 || dy === 0;
    S.set(x + dx, y + dy, z + dz, edge ? M() : 0);
  }
  // trois niveaux en gradins
  for (let dy = 1; dy <= 11; dy++) {
    const inset = dy >= 9 ? 2 : dy >= 5 ? 1 : 0;
    for (let dx = -6 + inset; dx <= 5 - inset; dx++) for (let dz = -7 + inset; dz <= 7 - inset; dz++) {
      const edge = dx === -6 + inset || dx === 5 - inset || dz === -7 + inset || dz === 7 - inset;
      const floor = dy === 4 || dy === 8 || dy === 11;
      const win = !floor && edge && (dy === 2 || dy === 6) && (Math.abs(dz) % 3 === 1) && (dx === -6 + inset || dx === 5 - inset);
      S.set(x + dx, y + dy, z + dz, floor || (edge && !win) ? M() : 0);
    }
  }
  for (let dx = -2; dx <= 1; dx++) for (let dz = -3; dz <= 3; dz++) S.set(x + dx, y + 12, z + dz, (dx + dz) % 2 ? K.mossy_cobblestone : K.chiseled_stone_bricks || K.cobblestone);
  // entrée et escalier frontal
  for (let dy = 1; dy <= 3; dy++) for (const dx of [-1, 0]) S.set(x + dx, y + dy, z - 7, 0);
  for (const dx of [-1, 0]) { S.set(x + dx, y, z - 8, K.cobblestone_stairs, 0); }
  // échelles entre les étages et vers le sous-sol
  for (let dy = -4; dy <= 9; dy++) S.set(x + 4 - (dy > 4 ? 1 : 0), y + dy, z + 5 - (dy > 4 ? 1 : 0), K.ladder, 3);
  // piliers sculptés, toiles, coffres
  for (const [dx, dz] of [[-3, -3], [2, -3], [-3, 3], [2, 3]]) for (let dy = 1; dy <= 3; dy++) S.set(x + dx, y + dy, z + dz, K.chiseled_stone_bricks || K.stone_bricks);
  S.set(x - 4, y - 3, z - 4, K.cobweb); S.set(x + 3, y - 4, z - 5, K.cobweb); S.set(x - 5, y + 1, z + 6, K.cobweb);
  S.chest(x - 5, y - 4, z - 6, 'jungle_temple', rng, 0);
  S.chest(x + 4, y - 4, z + 6, 'jungle_temple', rng, 2);
  S.chest(x - 4, y + 5, z + 5, 'jungle_temple', rng, 3);
  // lianes sur les murs
  for (let k = 0; k < 40; k++) { const dz = rng.int(17) - 8, dy = 1 + rng.int(8); S.set(x + (rng.chance(0.5) ? -7 : 6), y + dy, z + dz, K.vine, rng.chance(0.5) ? 2 : 8); }
}

// -------------------------------------------------------------- MINE ABANDONNÉE
function mineshaftPlan(gen, rx, rz) {
  return cachedPlan(gen, 'm' + rx + ',' + rz, () => {
    const rng = new RNG(seedOf(gen, rx, rz, 401));
    if (!rng.chance(0.55)) return null;
    const x = rx * 160 + 40 + rng.int(80), z = rz * 160 + 40 + rng.int(80);
    const col = gen.column(x, z);
    if (col.h < SEA_LEVEL - 8) return null;
    const y = 16 + rng.int(Math.max(4, Math.min(30, col.h - 30)));
    const segs = [], chests = [], spawners = [];
    const room = { x, y, z };
    const grow = (sx, sz, dx, dz, depth) => {
      if (depth > 4 || segs.length > 24) return;
      const len = 12 + rng.int(28);
      const ex = sx + dx * len, ez = sz + dz * len;
      if (Math.abs(ex - x) > 70 || Math.abs(ez - z) > 70) return;
      segs.push({ x0: sx, z0: sz, x1: ex, z1: ez, dx, dz, y });
      if (rng.chance(0.35)) { const t = 3 + rng.int(len - 5); const side = rng.chance(0.5) ? 1 : -1; chests.push({ x: sx + dx * t + dz * side * 2, z: sz + dz * t - dx * side * 2, y: y + 1, f: rng.int(4) }); }
      if (rng.chance(0.12)) spawners.push({ x: sx + dx * Math.floor(len / 2), z: sz + dz * Math.floor(len / 2), y: y + 1 });
      const r = rng.next();
      if (r < 0.45) { grow(ex, ez, dz, dx, depth + 1); grow(ex, ez, -dz, -dx, depth + 1); }
      else if (r < 0.8) grow(ex, ez, rng.chance(0.5) ? dz : -dz, rng.chance(0.5) ? dx : -dx, depth + 1);
      else grow(ex, ez, dx, dz, depth + 1);
    };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rng.chance(0.85)) grow(x + dx * 4, z + dz * 4, dx, dz, 0);
    return { x, z, y, room, segs, chests, spawners, seed: rng.int(1e9) };
  });
}
function buildMineshaft(S, P) {
  const rng = new RNG(P.seed);
  const air = (X, Y, Z) => { const c = S.get(X, Y, Z); if (c === -1) return; if (BLOCKS[c] && BLOCKS[c].fluid) return; S.set(X, Y, Z, 0); };
  // salle centrale
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    if (!S.in(P.x + dx, P.z + dz)) continue;
    S.set(P.x + dx, P.y - 1, P.z + dz, K.dirt);
    for (let dy = 0; dy <= 4; dy++) air(P.x + dx, P.y + dy, P.z + dz);
  }
  for (const g of P.segs) {
    const n = Math.abs(g.x1 - g.x0) + Math.abs(g.z1 - g.z0);
    for (let i = 0; i <= n; i++) {
      const cx = g.x0 + g.dx * i, cz = g.z0 + g.dz * i;
      for (let w = -1; w <= 1; w++) {
        const X = cx + g.dz * w, Z = cz + g.dx * w;
        if (!S.in(X, Z)) continue;
        for (let dy = 0; dy <= 2; dy++) air(X, g.y + dy, Z);
        const below = S.get(X, g.y - 1, Z);
        if (below === 0 || (BLOCKS[below] && BLOCKS[below].fluid)) S.set(X, g.y - 1, Z, K.oak_planks);
        if (w === 0 && ((i * 7 + cx * 3 + cz) % 10) < 7) S.set(X, g.y, Z, K.rail, g.dx !== 0 ? 1 : 0);
        if (((i * 13 + X * 5 + Z * 11) & 31) === 0) S.set(X, g.y + 2, Z, K.cobweb);
      }
      // étais tous les 4 blocs : poteaux en barrière et poutre en planches
      if (i % 4 === 2) {
        for (const w of [-1, 1]) { const X = cx + g.dz * w, Z = cz + g.dx * w; if (S.in(X, Z)) { S.set(X, g.y, Z, K.oak_fence); S.set(X, g.y + 1, Z, K.oak_fence); S.set(X, g.y + 2, Z, K.oak_planks); } }
        if (S.in(cx, cz)) S.set(cx, g.y + 2, cz, K.oak_planks);
        if (i % 16 === 2 && S.in(cx + g.dz, cz + g.dx)) S.set(cx + g.dz, g.y + 1, cz + g.dx, K.torch);
      }
    }
  }
  for (const c of P.chests) if (S.in(c.x, c.z)) { S.set(c.x, c.y - 2, c.z, K.oak_planks); for (let dy = -1; dy <= 1; dy++) S.set(c.x, c.y + dy, c.z, 0); S.chest(c.x, c.y - 1, c.z, 'mineshaft', rng, c.f); }
  for (const sp of P.spawners) {
    if (!S.in(sp.x, sp.z)) continue;
    S.spawner(sp.x, sp.y, sp.z, 'cave_spider');
    for (let k = 0; k < 14; k++) { const X = sp.x + rng.int(7) - 3, Z = sp.z + rng.int(7) - 3, Y = sp.y - 1 + rng.int(3); if (S.in(X, Z) && S.get(X, Y, Z) === 0) S.set(X, Y, Z, K.cobweb); }
  }
}

// --------------------------------------------------------- MONUMENT OCÉANIQUE
function monumentPlan(gen, rx, rz) {
  return cachedPlan(gen, 'k' + rx + ',' + rz, () => {
    const rng = new RNG(seedOf(gen, rx, rz, 503));
    if (!rng.chance(0.6)) return null;
    const x = rx * 512 + 60 + rng.int(392), z = rz * 512 + 60 + rng.int(392);
    const col = gen.column(x, z);
    if (col.biome !== BI.deep_ocean && col.biome !== BI.ocean && col.biome !== BI.cold_ocean && col.biome !== BI.lukewarm_ocean) return null;
    if (col.h > SEA_LEVEL - 16) return null;
    for (const [i, j] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) if (gen.column(x + i, z + j).h > SEA_LEVEL - 8) return null;
    return { x, z, y: Math.max(8, col.h), seed: rng.int(1e9) };
  });
}
function buildMonument(S, P) {
  const { x, z, y } = P, rng = new RNG(P.seed);
  const PB = K.prismarine_bricks, PR = K.prismarine, DK = K.dark_prismarine, SL = K.sea_lantern;
  const R = 20, top = y + 16;
  // eau au-dessus et autour, socle
  for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) {
    const X = x + dx, Z = z + dz;
    if (!S.in(X, Z)) continue;
    for (let yy = y - 3; yy <= SEA_LEVEL; yy++) { const c = S.get(X, yy, Z); if (yy >= y && c !== 0) S.set(X, yy, Z, K.water); }
    S.set(X, y - 1, Z, PB);
    for (let yy = y - 2; yy > 2; yy--) { const c = S.get(X, yy, Z); if (c === K.water || c === 0) S.set(X, yy, Z, PR); else break; }
  }
  // corps principal en pyramide à gradins (creux, rempli d'eau)
  const shell = (x0, x1, z0, z1, y0, y1, steps) => {
    for (let yy = y0; yy <= y1; yy++) {
      const inset = Math.floor((yy - y0) / steps);
      for (let X = x0 + inset; X <= x1 - inset; X++) for (let Z = z0 + inset; Z <= z1 - inset; Z++) {
        if (!S.in(x + X, z + Z)) continue;
        const edge = X === x0 + inset || X === x1 - inset || Z === z0 + inset || Z === z1 - inset || yy === y1;
        const trim = edge && (yy % 4 === 0 || ((X + Z) & 7) === 0);
        S.set(x + X, y + yy, z + Z, edge ? (trim ? DK : (rng.chance(0.25) ? PR : PB)) : K.water);
      }
    }
  };
  shell(-14, 14, -14, 14, 0, 15, 3);
  // ailes avant et arrière
  shell(-R, -12, -R, R, 0, 7, 4); shell(12, R, -R, R, 0, 7, 4);
  // entrée
  for (let dx = -2; dx <= 2; dx++) for (let dy = 1; dy <= 5; dy++) for (let dz = -15; dz <= -12; dz++) if (S.in(x + dx, z + dz)) S.set(x + dx, y + dy, z + dz, K.water);
  // lanternes aquatiques en façade et au sommet
  for (let dx = -12; dx <= 12; dx += 6) for (const dz of [-14, 14]) if (S.in(x + dx, z + dz)) S.set(x + dx, y + 4, z + dz, SL);
  for (let dx = -2; dx <= 2; dx += 2) for (let dz = -2; dz <= 2; dz += 2) if (S.in(x + dx, z + dz)) S.set(x + dx, top - 1, z + dz, SL);
  // salle du trésor : blocs d'or dans un noyau de prismarine sombre
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 4; dy <= 8; dy++) {
    if (!S.in(x + dx, z + dz)) continue;
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 4 || dy === 8;
    S.set(x + dx, y + dy, z + dz, edge ? DK : (dy === 5 && Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && (dx + dz) % 2 === 0 ? K.gold_block : K.water));
  }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (S.in(x + dx, z + dz)) S.set(x + dx, y + 5, z + dz, K.gold_block);
  // salles aux éponges dans les ailes
  for (const sx of [-16, 16]) for (let k = 0; k < 10; k++) { const X = x + sx + rng.int(5) - 2, Z = z + rng.int(25) - 12; if (S.in(X, Z)) S.set(X, y + 6, Z, K.wet_sponge); }
  // gardiens
  S.mob(x, y + 6, z, 'elder_guardian'); S.mob(x - 16, y + 3, z, 'elder_guardian'); S.mob(x + 16, y + 3, z, 'elder_guardian');
  for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -17], [0, 12]]) S.mob(x + dx, y + 3, z + dz, 'guardian');
}

// zone occupée par une structure de surface (pas d'arbres à l'intérieur)
export function inSurfaceStructure(gen, x, z) {
  const VR = VILLAGE_REGION;
  for (let rx = Math.floor((x - 70) / VR); rx <= Math.floor((x + 70) / VR); rx++) for (let rz = Math.floor((z - 70) / VR); rz <= Math.floor((z + 70) / VR); rz++) {
    const v = villagePlan(gen, rx, rz);
    if (!v) continue;
    let r = 12;
    for (const rd of v.roads) r = Math.max(r, rd.len + 11);
    if (Math.abs(x - v.cx) < r && Math.abs(z - v.cz) < r) return true;
  }
  const o = outpostPlan(gen, Math.floor(x / 320), Math.floor(z / 320));
  if (o && Math.abs(x - o.x) < 16 && Math.abs(z - o.z) < 16) return true;
  const j = jungleTemplePlan(gen, Math.floor(x / 256), Math.floor(z / 256));
  if (j && Math.abs(x - j.x) < 11 && Math.abs(z - j.z) < 12) return true;
  return false;
}

export const _outpostPlan = outpostPlan;
export const _jungleTemplePlan = jungleTemplePlan;
export const _mineshaftPlan = mineshaftPlan;
export const _monumentPlan = monumentPlan;

// =============================================================== ENTRÉES
export function placeStructurePieces(gen, cx, cz, blocks, meta) {
  const bes = [];
  const S = new Clip(cx, cz, blocks, meta, bes);
  const bx = cx * 16, bz = cz * 16;
  // villages
  const vr = VILLAGE_REGION;
  for (let rx = Math.floor((bx - 80) / vr); rx <= Math.floor((bx + 96) / vr); rx++) for (let rz = Math.floor((bz - 80) / vr); rz <= Math.floor((bz + 96) / vr); rz++) {
    const plan = villagePlan(gen, rx, rz);
    if (plan && Math.abs(plan.cx - bx - 8) < 72 && Math.abs(plan.cz - bz - 8) < 72) buildVillage(gen, S, plan);
  }
  // forts
  for (const sh of strongholdPositions(gen.seed)) {
    if (Math.abs(sh[0] - bx - 8) < 64 && Math.abs(sh[2] - bz - 8) < 64) buildStronghold(S, sh[0], sh[1], sh[2], gen.seed ^ (sh[0] * 31 + sh[2]));
  }
  // avant-postes, temples de la jungle, mines abandonnées, monuments océaniques
  const near = (R, margin, planFn, build) => {
    for (let rx = Math.floor((bx - margin) / R); rx <= Math.floor((bx + 16 + margin) / R); rx++) for (let rz = Math.floor((bz - margin) / R); rz <= Math.floor((bz + 16 + margin) / R); rz++) {
      const plan = planFn(gen, rx, rz);
      if (plan && Math.abs(plan.x - bx - 8) < margin + 8 && Math.abs(plan.z - bz - 8) < margin + 8) build(plan);
    }
  };
  near(320, 24, outpostPlan, (P) => buildOutpost(gen, S, P));
  near(256, 16, jungleTemplePlan, (P) => buildJungleTemple(S, P));
  near(160, 80, mineshaftPlan, (P) => buildMineshaft(S, P));
  near(512, 26, monumentPlan, (P) => buildMonument(S, P));
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
