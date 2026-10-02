// Décoration (thread principal) : arbres, champignons géants, donjons, puits, igloos, pyramides...
// Les éléments peuvent déborder dans les chunks voisins (déjà générés).
import { HEIGHT, SEA_LEVEL } from '../../constants.js';
import { RNG, hash2 } from '../../util/noise.js';
import { BLOCK as K, BLOCKS, B_SOLID } from '../../blocks/blocks.js';
import { BIOME as BI } from '../biomes.js';
import { lootChest } from './loot.js';

const REPLACEABLE = new Set([0, K.short_grass, K.fern, K.tall_grass, K.tall_grass_top, K.large_fern, K.large_fern_top, K.snow, K.dead_bush, K.vine, K.pink_petals]);
const isLeaf = (id) => BLOCKS[id] && BLOCKS[id].key.endsWith('_leaves');
const SOIL = new Set([K.grass_block, K.dirt, K.podzol, K.coarse_dirt, K.snowy_grass_block, K.mud, K.moss_block, K.mycelium]);

class W {
  constructor(world, live = false) { this.w = world; this.live = live; }
  get(x, y, z) { return this.w.getBlock(x, y, z); }
  set(x, y, z, id, m = 0) {
    if (y <= 0 || y >= HEIGHT) return;
    if (this.live) this.w.setBlock(x, y, z, id, m, { notify: false }); else this.w.setRaw(x, y, z, id, m);
  }
  leaf(x, y, z, id) { const c = this.get(x, y, z); if (REPLACEABLE.has(c)) this.set(x, y, z, id); }
  log(x, y, z, id, axis = 0) { const c = this.get(x, y, z); if (REPLACEABLE.has(c) || isLeaf(c) ) this.set(x, y, z, id, axis); }
  free(x, y, z) { const c = this.get(x, y, z); return REPLACEABLE.has(c) || isLeaf(c); }
}

// ------------------------------------------------------------------ ARBRES
function blob(w, x, y, z, leaves, r, rng, squash = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const d = dx * dx + (dy * dy) / (squash * squash) + dz * dz;
    if (d <= r * r + 0.5 - rng.next() * 1.2) w.leaf(x + dx, y + dy, z + dz, leaves);
  }
}

function oak(w, x, y, z, rng, logId = K.oak_log, leafId = K.oak_leaves, hmin = 4, hmax = 6, vines = false) {
  const h = hmin + rng.int(hmax - hmin + 1);
  if (y + h + 2 >= HEIGHT) return;
  const top = y + h;
  for (let yy = top - 3; yy <= top; yy++) {
    const dy = yy - top;
    const r = dy >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 0 || rng.next() < 0.5)) continue;
      w.leaf(x + dx, yy, z + dz, leafId);
    }
  }
  for (let i = 0; i < h; i++) w.log(x, y + i, z, logId);
  w.set(x, y - 1, z, K.dirt);
  if (vines) addVines(w, x, top, z, 3, rng);
}

function fancyOak(w, x, y, z, rng) {
  const h = 9 + rng.int(5);
  if (y + h + 4 >= HEIGHT) return oak(w, x, y, z, rng);
  for (let i = 0; i < h; i++) w.log(x, y + i, z, K.oak_log);
  const branches = 3 + rng.int(3);
  for (let b = 0; b < branches; b++) {
    const by = y + Math.floor(h * 0.5) + rng.int(Math.ceil(h * 0.45));
    const a = rng.next() * Math.PI * 2, len = 3 + rng.int(3);
    let bx = x, bz = z, yy = by;
    for (let k = 0; k < len; k++) {
      bx = x + Math.round(Math.cos(a) * k); bz = z + Math.round(Math.sin(a) * k); yy = by + Math.floor(k / 2);
      w.log(bx, yy, bz, K.oak_log, Math.abs(Math.cos(a)) > 0.7 ? 1 : Math.abs(Math.sin(a)) > 0.7 ? 2 : 0);
    }
    blob(w, bx, yy + 1, bz, K.oak_leaves, 2, rng, 0.8);
  }
  blob(w, x, y + h, z, K.oak_leaves, 3, rng, 0.75);
  w.set(x, y - 1, z, K.dirt);
}

function spruce(w, x, y, z, rng, snowy = false) {
  const h = 7 + rng.int(5);
  if (y + h + 2 >= HEIGHT) return;
  const leafStart = 1 + rng.int(2);
  let r = 0, maxR = 2 + rng.int(2), rr = 1;
  for (let yy = y + h; yy >= y + leafStart; yy--) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
      w.leaf(x + dx, yy, z + dz, K.spruce_leaves);
      if (snowy && rng.next() < 0.3 && w.get(x + dx, yy + 1, z + dz) === 0) w.set(x + dx, yy + 1, z + dz, K.snow);
    }
    if (r >= rr) { r = 1; rr = Math.min(rr + 1, maxR); } else r++;
  }
  w.leaf(x, y + h + 1, z, K.spruce_leaves);
  for (let i = 0; i < h; i++) w.log(x, y + i, z, K.spruce_log);
  w.set(x, y - 1, z, K.dirt);
}

function megaJungle(w, x, y, z, rng) {
  const h = 16 + rng.int(10);
  if (y + h + 4 >= HEIGHT) return oak(w, x, y, z, rng, K.jungle_log, K.jungle_leaves, 5, 8, true);
  for (let i = 0; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.log(x + dx, y + i, z + dz, K.jungle_log);
  for (let k = 0; k < 3; k++) {
    const yy = y + h - 2 - k * 2;
    blob(w, x + (k % 2), yy, z + (k === 1 ? 1 : 0), K.jungle_leaves, 4 - k, rng, 0.45);
  }
  // branches latérales
  for (let b = 0; b < 3; b++) {
    const by = y + Math.floor(h * 0.5) + rng.int(Math.floor(h * 0.35));
    const a = rng.next() * Math.PI * 2;
    const bx = x + Math.round(Math.cos(a) * 3), bz = z + Math.round(Math.sin(a) * 3);
    w.log(x + Math.round(Math.cos(a) * 2), by, z + Math.round(Math.sin(a) * 2), K.jungle_log);
    w.log(bx, by + 1, bz, K.jungle_log);
    blob(w, bx, by + 2, bz, K.jungle_leaves, 2, rng, 0.6);
  }
  // lianes sur le tronc
  for (let i = 1; i < h; i++) {
    if (rng.next() < 0.5 && w.get(x - 1, y + i, z) === 0) w.set(x - 1, y + i, z, K.vine, 8);
    if (rng.next() < 0.5 && w.get(x + 2, y + i, z + 1) === 0) w.set(x + 2, y + i, z + 1, K.vine, 2);
    if (rng.next() < 0.5 && w.get(x, y + i, z - 1) === 0) w.set(x, y + i, z - 1, K.vine, 1);
  }
  addVines(w, x, y + h - 2, z, 5, rng);
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(x + dx, y - 1, z + dz, K.dirt);
}

function jungleBush(w, x, y, z, rng) {
  w.log(x, y, z, K.jungle_log);
  for (let dy = 0; dy <= 2; dy++) {
    const r = 2 - dy;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0 && rng.next() < 0.6) continue;
      w.leaf(x + dx, y + dy, z + dz, K.oak_leaves);
    }
  }
}

function acacia(w, x, y, z, rng) {
  const h = 5 + rng.int(3);
  if (y + h + 3 >= HEIGHT) return;
  const dir = rng.int(4), dxs = [1, -1, 0, 0][dir], dzs = [0, 0, 1, -1][dir];
  const bendAt = 2 + rng.int(2);
  let tx = x, tz = z, ty = y;
  for (let i = 0; i < h; i++) {
    if (i >= bendAt && i < bendAt + 3) { tx += dxs; tz += dzs; }
    w.log(tx, ty, tz, K.acacia_log); ty++;
  }
  const canopy = (cx, cy, cz) => {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > 4) continue;
      w.leaf(cx + dx, cy, cz + dz, K.acacia_leaves);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.leaf(cx + dx, cy + 1, cz + dz, K.acacia_leaves);
  };
  canopy(tx, ty, tz);
  // seconde branche
  if (rng.next() < 0.6) {
    let bx = x, bz = z, by = y + bendAt;
    const d2 = (dir + 1 + rng.int(3)) % 4, ex = [1, -1, 0, 0][d2], ez = [0, 0, 1, -1][d2];
    for (let i = 0; i < 3; i++) { bx += ex; bz += ez; by++; w.log(bx, by, bz, K.acacia_log); }
    canopy(bx, by + 1, bz);
  }
  w.set(x, y - 1, z, K.dirt);
}

function darkOak(w, x, y, z, rng) {
  const h = 6 + rng.int(3);
  if (y + h + 3 >= HEIGHT) return;
  for (let i = 0; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.log(x + dx, y + i, z + dz, K.dark_oak_log);
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy === 1 ? 2 : dy === -2 ? 3 : 4;
    for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
      const ex = dx < 0 ? -dx : dx - 1, ez = dz < 0 ? -dz : dz - 1;
      if (ex + ez > r + 1 || (ex === r && ez === r && rng.next() < 0.7)) continue;
      w.leaf(x + dx, y + h + dy, z + dz, K.dark_oak_leaves);
    }
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(x + dx, y - 1, z + dz, K.dirt);
}

function cherry(w, x, y, z, rng) {
  const h = 5 + rng.int(3);
  if (y + h + 4 >= HEIGHT) return;
  const dir = rng.int(4), dxs = [1, -1, 0, 0][dir], dzs = [0, 0, 1, -1][dir];
  let tx = x, tz = z;
  for (let i = 0; i < h; i++) { if (i === h - 2) { tx += dxs; tz += dzs; } w.log(tx, y + i, tz, K.cherry_log); }
  for (let dy = -1; dy <= 2; dy++) {
    const r = dy === 2 ? 2 : dy === -1 ? 3 : 4;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 1 - rng.next() * 2) continue;
      w.leaf(tx + dx, y + h + dy, tz + dz, K.cherry_leaves);
      if (dy === -1 && rng.next() < 0.15) w.leaf(tx + dx, y + h - 2, tz + dz, K.cherry_leaves);
    }
  }
  w.set(x, y - 1, z, K.dirt);
}

function hugeMushroom(w, x, y, z, rng) {
  const red = rng.next() < 0.5;
  const h = 5 + rng.int(3);
  if (y + h + 2 >= HEIGHT) return;
  for (let i = 0; i < h; i++) w.log(x, y + i, z, K.mushroom_stem);
  if (red) {
    for (let dy = -3; dy <= 0; dy++) {
      const r = dy === 0 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dy < 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && dy < 0) continue;
        w.leaf(x + dx, y + h + dy, z + dz, K.red_mushroom_block);
      }
    }
  } else {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
      w.leaf(x + dx, y + h, z + dz, K.brown_mushroom_block);
    }
  }
}

function iceSpike(w, x, y, z, rng) {
  const h = 6 + rng.int(rng.next() < 0.1 ? 25 : 8);
  for (let i = 0; i < h; i++) {
    const r = Math.max(0, Math.round((1 - i / h) * 2.2));
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 0.5) continue;
      if (y + i < HEIGHT - 1) w.set(x + dx, y + i, z + dz, K.packed_ice);
    }
  }
}

function addVines(w, x, y, z, r, rng) {
  for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) {
    for (let dy = -2; dy <= 2; dy++) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (w.get(X, Y, Z) !== 0 || rng.next() > 0.25) continue;
      let m = 0;
      if (isLeaf(w.get(X, Y, Z + 1))) m |= 1;
      if (isLeaf(w.get(X - 1, Y, Z))) m |= 2;
      if (isLeaf(w.get(X, Y, Z - 1))) m |= 4;
      if (isLeaf(w.get(X + 1, Y, Z))) m |= 8;
      if (!m) continue;
      const len = 1 + rng.int(5);
      for (let k = 0; k < len; k++) { if (w.get(X, Y - k, Z) !== 0) break; w.set(X, Y - k, Z, K.vine, m); }
    }
  }
}

// --------------------------------------------------------- PETITES STRUCTURES
function dungeon(w, x, y, z, rng) {
  const rx = 3 + rng.int(2), rz = 3 + rng.int(2);
  for (let dx = -rx; dx <= rx; dx++) for (let dz = -rz; dz <= rz; dz++) for (let dy = -1; dy <= 4; dy++) {
    const wall = Math.abs(dx) === rx || Math.abs(dz) === rz || dy === -1 || dy === 4;
    if (wall) {
      if (dy === -1) w.set(x + dx, y + dy, z + dz, rng.next() < 0.6 ? K.mossy_cobblestone : K.cobblestone);
      else if (B_SOLID[w.get(x + dx, y + dy, z + dz)]) w.set(x + dx, y + dy, z + dz, rng.next() < 0.3 ? K.mossy_cobblestone : K.cobblestone);
    } else w.set(x + dx, y + dy, z + dz, 0);
  }
  w.set(x, y, z, K.spawner);
  const mob = ['zombie', 'zombie', 'skeleton', 'spider'][rng.int(4)];
  w.w.setBlockEntity(x, y, z, { type: 'spawner', mob, delay: 200 });
  const chests = 1 + rng.int(2);
  for (let i = 0; i < chests; i++) {
    const cx = x + (i ? -rx + 1 : rx - 1), cz = z + rng.range(-rz + 1, rz - 1);
    w.set(cx, y, cz, K.chest, i ? 3 : 1);
    w.w.setBlockEntity(cx, y, cz, { type: 'chest', items: lootChest('dungeon', rng) });
  }
}

function desertWell(w, x, y, z) {
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    w.set(x + dx, y - 1, z + dz, K.sandstone);
    if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) w.set(x + dx, y, z + dz, dx === 0 && dz === 0 ? K.water : K.sandstone);
    else w.set(x + dx, y, z + dz, K.sandstone_slab);
  }
  w.set(x, y, z, K.water);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(x + dx, y, z + dz, K.water);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { w.set(x + dx, y + 1, z + dz, K.sandstone); w.set(x + dx, y + 2, z + dz, K.sandstone); }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.set(x + dx, y + 3, z + dz, K.sandstone_slab);
  w.set(x, y + 3, z, K.sandstone);
}

function igloo(w, x, y, z, rng) {
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 4; dy++) {
    const d = Math.sqrt(dx * dx + dz * dz + (dy * 1.3) * (dy * 1.3));
    if (d <= 4.6 && d >= 3.6) w.set(x + dx, y + dy, z + dz, K.snow_block);
    else if (d < 3.6) w.set(x + dx, y + dy, z + dz, 0);
  }
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= 10) w.set(x + dx, y - 1, z + dz, K.white_wool);
  for (let dy = 0; dy < 2; dy++) for (let dz = 4; dz <= 5; dz++) w.set(x, y + dy, z + dz, 0);
  w.set(x - 2, y, z - 1, K.red_bed, 1 | 8); w.set(x - 2, y, z, K.red_bed, 1);
  w.set(x + 2, y, z - 2, K.crafting_table); w.set(x + 2, y, z, K.furnace, 1);
  w.set(x, y + 3, z, K.torch);
  w.set(x + 2, y, z + 1, K.chest, 1);
  w.w.setBlockEntity(x + 2, y, z + 1, { type: 'chest', items: lootChest('igloo', rng) });
}

function witchHut(w, x, y, z) {
  const P = K.spruce_planks, L = K.oak_log;
  for (const [dx, dz] of [[0, 0], [4, 0], [0, 6], [4, 6]]) for (let dy = -4; dy < 2; dy++) w.set(x + dx, y + dy, z + dz, L);
  for (let dx = 0; dx <= 4; dx++) for (let dz = 0; dz <= 6; dz++) {
    w.set(x + dx, y + 1, z + dz, P);
    const wall = dx === 0 || dx === 4 || dz === 0 || dz === 6;
    for (let dy = 2; dy <= 4; dy++) w.set(x + dx, y + dy, z + dz, wall ? (dy === 3 && (dz === 3) ? K.glass : P) : 0);
    w.set(x + dx, y + 5, z + dz, K.spruce_planks);
  }
  for (let dz = -1; dz <= 7; dz++) { w.set(x - 1, y + 5, z + dz, K.spruce_stairs, 3); w.set(x + 5, y + 5, z + dz, K.spruce_stairs, 1); w.set(x + 2, y + 6, z + dz, K.oak_slab); w.set(x + 1, y + 6, z + dz, K.spruce_stairs, 3); w.set(x + 3, y + 6, z + dz, K.spruce_stairs, 1); }
  w.set(x + 2, y + 2, z, 0); w.set(x + 2, y + 3, z, 0);
  w.set(x + 3, y + 2, z + 5, K.cauldron); w.set(x + 1, y + 2, z + 5, K.crafting_table);
}

function desertPyramid(w, x, y, z, rng) {
  const S = K.sandstone, C = K.cut_sandstone, O = K.orange_terracotta;
  for (let l = 0; l <= 10; l++) {
    for (let dx = -10 + l; dx <= 10 - l; dx++) for (let dz = -10 + l; dz <= 10 - l; dz++) {
      const edge = Math.abs(dx) === 10 - l || Math.abs(dz) === 10 - l;
      w.set(x + dx, y + l, z + dz, edge || l === 0 ? S : 0);
    }
  }
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) for (let dy = -6; dy < 0; dy++) w.set(x + dx, y + dy, z + dz, S);
  // entrée
  for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) w.set(x + dx, y + dy, z - 10 + (dy - 1), 0);
  // tours
  for (const sx of [-8, 8]) for (let dy = 0; dy <= 12; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
    w.set(x + sx + dx, y + dy, z - 8 + dz, edge ? (dy % 4 === 2 ? O : C) : 0);
  }
  // motif central au sol + salle piégée
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.set(x + dx, y, z + dz, (Math.abs(dx) + Math.abs(dz)) % 2 ? O : K.blue_terracotta);
  w.set(x, y, z, K.blue_terracotta);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -12; dy < 0; dy++) w.set(x + dx, y + dy, z + dz, dy === -12 ? S : 0);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.set(x + dx, y - 13, z + dz, K.tnt);
  w.set(x, y - 12, z, K.stone);
  const chestPos = [[2, 0, 1], [-2, 0, 3], [0, 2, 0], [0, -2, 2]];
  for (const [dx, dz, f] of chestPos) {
    w.set(x + dx, y - 11, z + dz, K.chest, f);
    w.w.setBlockEntity(x + dx, y - 11, z + dz, { type: 'chest', items: lootChest('desert_pyramid', rng) });
  }
  w.set(x, y + 1, z, 0);
}

function ruinedPortal(w, x, y, z, rng) {
  const frame = [];
  for (let dy = 0; dy < 5; dy++) { frame.push([0, dy]); frame.push([3, dy]); }
  for (let dx = 1; dx < 3; dx++) { frame.push([dx, 0]); frame.push([dx, 4]); }
  for (const [dx, dy] of frame) {
    if (rng.next() < 0.22) continue;
    w.set(x + dx, y + dy, z, rng.next() < 0.15 ? K.crying_obsidian : K.obsidian);
  }
  for (let dx = -3; dx <= 6; dx++) for (let dz = -3; dz <= 3; dz++) {
    if (rng.next() < 0.55) {
      const gy = y - 1;
      w.set(x + dx, gy, z + dz, rng.next() < 0.7 ? K.netherrack : rng.next() < 0.5 ? K.magma_block : K.blackstone);
    }
  }
  w.set(x + 5, y, z + 2, K.chest, 1);
  w.w.setBlockEntity(x + 5, y, z + 2, { type: 'chest', items: lootChest('ruined_portal', rng) });
}

function fossil(w, x, y, z, rng) {
  const len = 6 + rng.int(5);
  for (let i = 0; i < len; i++) {
    w.set(x + i, y, z, K.bone_block, 1);
    if (i % 2 === 0) for (let k = -2; k <= 2; k++) { if (k) w.set(x + i, y + Math.abs(k) - 2, z + k, K.bone_block, 2); }
  }
}

function shipwreck(w, x, y, z, rng) {
  const P = K.spruce_planks, L = K.spruce_log;
  const len = 14, half = 3;
  for (let i = 0; i < len; i++) {
    const t = i / (len - 1), wd = Math.round(half * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)));
    for (let dz = -wd; dz <= wd; dz++) {
      w.set(x + i, y, z + dz, P);
      if (Math.abs(dz) === wd) for (let dy = 1; dy <= 3; dy++) if (rng.next() < 0.8) w.set(x + i, y + dy, z + dz, P);
    }
    for (let dz = -wd + 1; dz < wd; dz++) for (let dy = 1; dy <= 3; dy++) w.set(x + i, y + dy, z + dz, K.water);
  }
  for (let dy = 1; dy < 9; dy++) if (rng.next() < 0.9) w.set(x + 5, y + dy, z, L);
  w.set(x + 2, y + 1, z, K.chest, 3);
  w.w.setBlockEntity(x + 2, y + 1, z, { type: 'chest', items: lootChest('shipwreck', rng) });
}

// ------------------------------------------------------------ DÉCORATEUR
export function decorateOverworld(world, chunk, gen) {
  const w = new W(world);
  const cx = chunk.cx, cz = chunk.cz, bx = cx * 16, bz = cz * 16;
  const rng = new RNG((hash2(cx * 7 + 3, cz * 13 - 5, gen.seed) * 4294967296) | 0);
  const bio = chunk.biomes[8 | (8 << 4)];
  const col = gen.column(bx + 8, bz + 8);

  // arbres
  const density = {
    [BI.forest]: 9, [BI.flower_forest]: 5, [BI.birch_forest]: 8, [BI.dark_forest]: 14, [BI.taiga]: 8, [BI.snowy_taiga]: 6,
    [BI.jungle]: 22, [BI.plains]: 0.25, [BI.sunflower_plains]: 0.15, [BI.savanna]: 1.2, [BI.swamp]: 2, [BI.cherry_grove]: 4,
    [BI.meadow]: 0.15, [BI.windswept_hills]: 1.5, [BI.snowy_plains]: 0.15, [BI.mushroom_fields]: 0.6, [BI.ice_spikes]: 1.5,
  };
  let n = density[bio] || 0;
  let count = Math.floor(n) + (rng.next() < n - Math.floor(n) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const x = bx + rng.int(16), z = bz + rng.int(16);
    const b = chunk.biomes[(x & 15) | ((z & 15) << 4)];
    let y = world.getSurfaceY(x, z);
    if (y < SEA_LEVEL - 1 || y > HEIGHT - 20) continue;
    let ground = world.getBlock(x, y, z);
    if (BLOCKS[ground].shape === 'cross' || ground === K.snow) { y--; ground = world.getBlock(x, y, z); }
    if (b === BI.ice_spikes) { if (ground === K.snow_block || ground === K.snowy_grass_block) iceSpike(w, x, y + 1, z, rng); continue; }
    if (!SOIL.has(ground)) continue;
    if (!w.free(x, y + 1, z)) continue;
    const ty = y + 1;
    const r = rng.next();
    switch (b) {
      case BI.forest: case BI.flower_forest:
        if (r < 0.2) oak(w, x, ty, z, rng, K.birch_log, K.birch_leaves, 5, 7);
        else if (r < 0.3) fancyOak(w, x, ty, z, rng);
        else oak(w, x, ty, z, rng); break;
      case BI.plains: case BI.sunflower_plains: case BI.meadow:
        if (r < 0.15) fancyOak(w, x, ty, z, rng); else oak(w, x, ty, z, rng); break;
      case BI.birch_forest: oak(w, x, ty, z, rng, K.birch_log, K.birch_leaves, 5, r < 0.3 ? 9 : 7); break;
      case BI.dark_forest:
        if (r < 0.06) hugeMushroom(w, x, ty, z, rng);
        else if (r < 0.75) darkOak(w, x, ty, z, rng);
        else oak(w, x, ty, z, rng); break;
      case BI.taiga: case BI.snowy_taiga: case BI.snowy_plains:
        spruce(w, x, ty, z, rng, b !== BI.taiga); break;
      case BI.windswept_hills:
        if (r < 0.6) spruce(w, x, ty, z, rng); else oak(w, x, ty, z, rng); break;
      case BI.jungle:
        if (r < 0.18) megaJungle(w, x, ty, z, rng);
        else if (r < 0.55) jungleBush(w, x, ty, z, rng);
        else if (r < 0.7) fancyOak(w, x, ty, z, rng);
        else oak(w, x, ty, z, rng, K.jungle_log, K.jungle_leaves, 5, 9, true); break;
      case BI.savanna: acacia(w, x, ty, z, rng); break;
      case BI.swamp: oak(w, x, ty, z, rng, K.oak_log, K.oak_leaves, 5, 6, true); break;
      case BI.cherry_grove: cherry(w, x, ty, z, rng); break;
      case BI.mushroom_fields: hugeMushroom(w, x, ty, z, rng); break;
      default: oak(w, x, ty, z, rng);
    }
  }

  // petites structures
  const sr = rng.next();
  if (sr < 0.07) {
    const x = bx + 4 + rng.int(8), z = bz + 4 + rng.int(8), y = 12 + rng.int(35);
    if (y < world.getSurfaceY(x, z) - 8) dungeon(w, x, y, z, rng);
  }
  const s2 = rng.next();
  if (bio === BI.desert && s2 < 0.02) {
    const x = bx + 8, z = bz + 8, y = world.getSurfaceY(x, z);
    if (world.getBlock(x, y, z) === K.sand) desertWell(w, x, y, z);
  } else if (bio === BI.desert && s2 > 0.994) {
    const x = bx + 8, z = bz + 8, y = world.getSurfaceY(x, z);
    if (y > SEA_LEVEL) desertPyramid(w, x, y, z, rng);
  } else if ((bio === BI.snowy_plains || bio === BI.snowy_taiga) && s2 < 0.008) {
    const x = bx + 8, z = bz + 8, y = world.getSurfaceY(x, z);
    if (y > SEA_LEVEL) igloo(w, x, world.getBlock(x, y, z) === K.snow ? y : y + 1, z, rng);
  } else if (bio === BI.swamp && s2 < 0.01) {
    const x = bx + 6, z = bz + 6, y = world.getSurfaceY(x, z);
    witchHut(w, x, Math.max(y, SEA_LEVEL) + 2, z);
  } else if (s2 > 0.996 && col.h > SEA_LEVEL) {
    const x = bx + 6, z = bz + 8, y = world.getSurfaceY(x, z);
    ruinedPortal(w, x, y + 1, z, rng);
  } else if ((bio === BI.ocean || bio === BI.cold_ocean || bio === BI.lukewarm_ocean || bio === BI.warm_ocean) && s2 < 0.006) {
    const x = bx + 2, z = bz + 8;
    let y = SEA_LEVEL;
    while (y > 5 && world.getBlock(x, y, z) === K.water) y--;
    if (y < SEA_LEVEL - 5) shipwreck(w, x, y + 1, z, rng);
  }
  if (rng.next() < 0.01 && (bio === BI.desert || bio === BI.swamp)) {
    const x = bx + 5, z = bz + 5, y = 30 + rng.int(20);
    fossil(w, x, y, z, rng);
  }
}

// Croissance d'une pousse dans le monde vivant
export function growTree(world, x, y, z, kind, rng) {
  const w = new W(world, true);
  for (let i = 1; i < 5; i++) if (!w.free(x, y + i, z)) return false;
  switch (kind) {
    case 'oak': if (rng.next() < 0.1) fancyOak(w, x, y, z, rng); else oak(w, x, y, z, rng); break;
    case 'birch': oak(w, x, y, z, rng, K.birch_log, K.birch_leaves, 5, 7); break;
    case 'spruce': spruce(w, x, y, z, rng); break;
    case 'jungle': oak(w, x, y, z, rng, K.jungle_log, K.jungle_leaves, 5, 9, true); break;
    case 'acacia': acacia(w, x, y, z, rng); break;
    case 'dark_oak': darkOak(w, x, y, z, rng); break;
    case 'cherry': cherry(w, x, y, z, rng); break;
    default: oak(w, x, y, z, rng);
  }
  return true;
}
