// Générateur de l'End : île principale, piliers d'obsidienne, fontaine de sortie, îles extérieures et cités
import { HEIGHT } from '../../constants.js';
import { Simplex, RNG, hash2 } from '../../util/noise.js';
import { BLOCK as K } from '../../blocks/blocks.js';
import { BIOME as BI } from '../biomes.js';
import { placeEndStructures } from './structures.js';

const idx = (x, y, z) => x | (z << 4) | (y << 8);

export class EndGen {
  constructor(seed) {
    this.seed = seed;
    this.n = new Simplex(seed * 13 + 5);
    this.n2 = new Simplex(seed * 13 + 6);
    this.ni = new Simplex(seed * 13 + 7);
    this.fountainY = this.columnTop(0, 0);
  }
  // hauteur de l'île à (x, z) : [bas, haut] ou null
  column(x, z) {
    const d = Math.hypot(x, z);
    if (d < 140) {
      const t = d / 140;
      const top = 60 + this.n.fbm2(x / 40, z / 40, 3) * 3 - t * t * 8;
      const bot = 60 - (1 - t * t) * 38 + this.n2.fbm2(x / 25, z / 25, 2) * 6;
      if (bot < top) return [Math.floor(bot), Math.floor(top)];
      return null;
    }
    if (d > 750) {
      const v = this.ni.fbm2(x / 120, z / 120, 3);
      if (v > 0.18) {
        const k = (v - 0.18) / 0.82;
        const top = 55 + k * 14 + this.n.fbm2(x / 30, z / 30, 2) * 3;
        const bot = top - k * 30 - 4;
        return [Math.floor(bot), Math.floor(top)];
      }
    }
    return null;
  }
  columnTop(x, z) { const c = this.column(x, z); return c ? c[1] : -1; }
  surfaceAt(x, z) { return this.columnTop(x, z); }
  generate(cx, cz) {
    const blocks = new Uint16Array(16 * 16 * HEIGHT), meta = new Uint8Array(16 * 16 * HEIGHT), biomes = new Uint8Array(256).fill(BI.the_end);
    const bx = cx * 16, bz = cz * 16;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = this.column(bx + x, bz + z);
      if (!c) continue;
      for (let y = Math.max(1, c[0]); y <= Math.min(HEIGHT - 2, c[1]); y++) blocks[idx(x, y, z)] = K.end_stone;
    }
    const blockEntities = placeEndStructures(this, cx, cz, blocks, meta);
    return { blocks, meta, biomes, blockEntities };
  }
  findSpawn() { return [100.5, 49, 0.5]; }
}

// Plantes de chorus sur les îles extérieures
export function decorateEnd(world, chunk, gen) {
  const bx = chunk.cx * 16, bz = chunk.cz * 16;
  if (Math.hypot(bx, bz) < 700) return;
  const rng = new RNG((hash2(chunk.cx, chunk.cz, gen.seed + 55) * 4294967296) | 0);
  for (let n = 0; n < 3; n++) {
    if (!rng.chance(0.5)) continue;
    const x = bx + rng.int(16), z = bz + rng.int(16);
    const top = gen.columnTop(x, z);
    if (top < 0 || world.getBlock(x, top, z) !== K.end_stone) continue;
    growChorus(world, x, top + 1, z, rng, 0);
  }
}
function growChorus(world, x, y, z, rng, depth) {
  const h = 1 + rng.int(4 - Math.min(depth, 2));
  for (let i = 0; i < h; i++) { if (world.getBlock(x, y + i, z) !== 0) return; world.setRaw(x, y + i, z, K.chorus_plant); }
  const ty = y + h - 1;
  if (depth < 3 && rng.chance(0.75)) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!rng.chance(0.4)) continue;
      if (world.getBlock(x + dx, ty, z + dz) !== 0) continue;
      world.setRaw(x + dx, ty, z + dz, K.chorus_plant);
      growChorus(world, x + dx, ty + 1, z + dz, rng, depth + 1);
    }
  }
  if (world.getBlock(x, ty + 1, z) === 0) world.setRaw(x, ty + 1, z, K.chorus_flower);
}
