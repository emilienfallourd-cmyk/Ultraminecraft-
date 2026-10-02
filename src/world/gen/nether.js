// Générateur du Nether : cavernes 3D, océan de lave, forêts carmin et biscornues, vallées des âmes, deltas de basalte
import { HEIGHT } from '../../constants.js';
import { Simplex, RNG, hash2 } from '../../util/noise.js';
import { BLOCK as K, BLOCKS } from '../../blocks/blocks.js';
import { BIOME as BI } from '../biomes.js';
import { placeNetherStructures } from './structures.js';

const idx = (x, y, z) => x | (z << 4) | (y << 8);
const LAVA_Y = 31;

export class NetherGen {
  constructor(seed) {
    this.seed = seed;
    const s = (k) => new Simplex(seed * 17 + k * 7919);
    this.n1 = s(1); this.n2 = s(2); this.nb1 = s(3); this.nb2 = s(4); this.nd = s(5);
  }
  biomeAt(x, z) {
    const a = this.nb1.fbm2(x / 260, z / 260, 2), b = this.nb2.fbm2(x / 260 + 40, z / 260 - 40, 2);
    if (a > 0.25) return b > 0 ? BI.crimson_forest : BI.warped_forest;
    if (a < -0.3) return b > 0.1 ? BI.soul_sand_valley : BI.basalt_deltas;
    if (b > 0.45) return BI.crimson_forest;
    return BI.nether_wastes;
  }
  generate(cx, cz) {
    const blocks = new Uint16Array(16 * 16 * HEIGHT), meta = new Uint8Array(16 * 16 * HEIGHT), biomes = new Uint8Array(256);
    const bx = cx * 16, bz = cz * 16;
    const rng = new RNG((hash2(cx, cz, this.seed + 1) * 4294967296) | 0);
    // densité 3D interpolée
    const GX = 5, GY = HEIGHT / 8 + 1, GZ = 5;
    const g = new Float32Array(GX * GY * GZ);
    for (let gz = 0; gz < GZ; gz++) for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      const x = bx + gx * 4, y = gy * 8, z = bz + gz * 4;
      let d = this.n1.fbm3(x / 80, y / 50, z / 80, 3) + this.n2.noise3(x / 25, y / 18, z / 25) * 0.25;
      // plafond et sol plus denses
      const top = (y - 96) / 24, bot = (28 - y) / 20;
      if (top > 0) d += top * top * 1.5;
      if (bot > 0) d += bot * 1.2;
      d += -0.05;
      g[(gy * GZ + gz) * GX + gx] = d;
    }
    const tri = (x, y, z) => {
      const fx = x / 4, fy = y / 8, fz = z / 4;
      const x0 = Math.floor(fx), y0 = Math.min(GY - 2, Math.floor(fy)), z0 = Math.floor(fz);
      const tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const x1 = Math.min(x0 + 1, GX - 1), z1 = Math.min(z0 + 1, GZ - 1), y1 = y0 + 1;
      const G = (a, b, c) => g[(b * GZ + c) * GX + a];
      const c00 = G(x0, y0, z0) * (1 - tx) + G(x1, y0, z0) * tx, c10 = G(x0, y1, z0) * (1 - tx) + G(x1, y1, z0) * tx;
      const c01 = G(x0, y0, z1) * (1 - tx) + G(x1, y0, z1) * tx, c11 = G(x0, y1, z1) * (1 - tx) + G(x1, y1, z1) * tx;
      return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z;
      const bio = this.biomeAt(wx, wz);
      biomes[x | (z << 4)] = bio;
      for (let y = 0; y < HEIGHT; y++) {
        const i = idx(x, y, z);
        if (y === 0 || y === HEIGHT - 1 || (y < 4 && rng.next() < (4 - y) / 4) || (y > HEIGHT - 5 && rng.next() < (y - (HEIGHT - 5)) / 4)) { blocks[i] = K.bedrock; continue; }
        const d = tri(x, y, z);
        if (d > 0) {
          let id = K.netherrack;
          if (bio === BI.basalt_deltas) id = d > 0.25 ? K.basalt : (this.nd.noise3(wx / 9, y / 9, wz / 9) > 0.2 ? K.blackstone : K.basalt);
          else if (bio === BI.soul_sand_valley && d < 0.2) id = this.nd.noise3(wx / 12, y / 12, wz / 12) > 0 ? K.soul_sand : K.soul_soil;
          blocks[i] = id;
        } else if (y <= LAVA_Y) blocks[i] = K.lava;
      }
      // surfaces
      for (let y = HEIGHT - 6; y > 1; y--) {
        const i = idx(x, y, z);
        if (blocks[i] === 0 && blocks[idx(x, y - 1, z)] !== 0 && blocks[idx(x, y - 1, z)] !== K.lava && blocks[idx(x, y - 1, z)] !== K.bedrock) {
          const b = idx(x, y - 1, z);
          if (bio === BI.crimson_forest) blocks[b] = K.crimson_nylium;
          else if (bio === BI.warped_forest) blocks[b] = K.warped_nylium;
          else if (bio === BI.soul_sand_valley) blocks[b] = rng.chance(0.6) ? K.soul_sand : K.soul_soil;
          // végétation
          const r = rng.next();
          if (bio === BI.crimson_forest) { if (r < 0.15) blocks[i] = K.crimson_roots; else if (r < 0.2) blocks[i] = K.crimson_fungus; }
          else if (bio === BI.warped_forest) { if (r < 0.15) blocks[i] = K.warped_roots; else if (r < 0.2) blocks[i] = K.warped_fungus; }
          else if (bio === BI.nether_wastes) { if (r < 0.01) blocks[i] = K.fire; else if (r < 0.015) blocks[i] = rng.chance(0.5) ? K.red_mushroom : K.brown_mushroom; }
          else if (bio === BI.soul_sand_valley && r < 0.008) blocks[i] = K.soul_fire;
          else if (bio === BI.basalt_deltas && r < 0.02 && y - 1 > LAVA_Y) blocks[b] = K.magma_block;
        }
        // lianes pleureuses au plafond
        if (bio === BI.crimson_forest && blocks[i] === 0 && blocks[idx(x, y + 1, z)] === K.netherrack && rng.next() < 0.03) {
          const len = 1 + rng.int(6);
          for (let k = 0; k < len && y - k > LAVA_Y + 2 && blocks[idx(x, y - k, z)] === 0; k++) blocks[idx(x, y - k, z)] = K.weeping_vines;
        }
      }
      // magma au bord de la lave
      if (blocks[idx(x, LAVA_Y, z)] === K.netherrack && rng.next() < 0.3) blocks[idx(x, LAVA_Y, z)] = K.magma_block;
    }
    // minerais
    const vein = (id, count, y0, y1, size) => {
      for (let n = 0; n < count; n++) {
        let x = rng.int(16), y = y0 + rng.int(y1 - y0), z = rng.int(16);
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) { const i = idx(x, y, z); if (blocks[i] === K.netherrack || (id === K.ancient_debris && (blocks[i] === K.basalt || blocks[i] === K.blackstone))) blocks[i] = id; }
          x += rng.int(3) - 1; y += rng.int(3) - 1; z += rng.int(3) - 1;
        }
      }
    };
    vein(K.nether_quartz_ore, 14, 10, 118, 10);
    vein(K.nether_gold_ore, 8, 10, 118, 8);
    vein(K.ancient_debris, rng.chance(0.4) ? 1 : 0, 8, 24, 2);
    vein(K.gilded_blackstone, 2, 10, 100, 4);
    // grappes de pierre lumineuse
    for (let n = 0; n < 2; n++) {
      const x = rng.int(16), z = rng.int(16);
      for (let y = 120; y > 40; y--) {
        if (blocks[idx(x, y, z)] === 0 && BLOCKS[blocks[idx(x, y + 1, z)]].solid) {
          let px = x, py = y, pz = z;
          for (let k = 0; k < 25; k++) {
            if (px >= 0 && px < 16 && pz >= 0 && pz < 16 && blocks[idx(px, py, pz)] === 0) blocks[idx(px, py, pz)] = K.glowstone;
            px += rng.int(3) - 1; py -= rng.int(2); pz += rng.int(3) - 1;
          }
          break;
        }
      }
    }
    const blockEntities = placeNetherStructures(this, cx, cz, blocks, meta);
    return { blocks, meta, biomes, blockEntities };
  }
  findSpawn() { return [0.5, 64, 0.5]; }
}

// Champignons géants du Nether (décorateur)
export function decorateNether(world, chunk, gen) {
  const rng = new RNG((hash2(chunk.cx * 3 + 1, chunk.cz * 5 - 2, gen.seed) * 4294967296) | 0);
  const bx = chunk.cx * 16, bz = chunk.cz * 16;
  for (let n = 0; n < 8; n++) {
    const x = bx + rng.int(16), z = bz + rng.int(16);
    const bio = chunk.biomes[(x & 15) | ((z & 15) << 4)];
    if (bio !== BI.crimson_forest && bio !== BI.warped_forest) continue;
    const nyl = bio === BI.crimson_forest ? K.crimson_nylium : K.warped_nylium;
    // trouve une surface de nylium
    let y = 100;
    for (; y > LAVA_Y + 2; y--) if (world.getBlock(x, y - 1, z) === nyl && world.getBlock(x, y, z) !== K.netherrack && !BLOCKS[world.getBlock(x, y, z)].solid) break;
    if (y <= LAVA_Y + 2) continue;
    const stem = bio === BI.crimson_forest ? K.crimson_stem : K.warped_stem;
    const wart = bio === BI.crimson_forest ? K.nether_wart_block : K.warped_wart_block;
    const h = 5 + rng.int(9);
    let ok = true;
    for (let i = 0; i < h + 3; i++) if (world.getBlock(x, y + i, z) !== 0 && !BLOCKS[world.getBlock(x, y + i, z)].replaceable) { ok = false; break; }
    if (!ok) continue;
    for (let i = 0; i < h; i++) world.setRaw(x, y + i, z, stem);
    const r = 2 + rng.int(2);
    for (let dy = -3; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const rr = dy === 1 ? r - 1 : r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const edge = Math.abs(dx) === rr || Math.abs(dz) === rr || dy === 1;
      if (!edge && dy < 1) continue;
      if (rng.chance(0.15) && dy < 0) continue;
      const X = x + dx, Y = y + h + dy, Z = z + dz;
      if (world.getBlock(X, Y, Z) === 0) world.setRaw(X, Y, Z, rng.chance(0.08) ? K.shroomlight : wart);
    }
  }
}
