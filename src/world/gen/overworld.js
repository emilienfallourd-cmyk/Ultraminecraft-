// Générateur de la Surface : continents, montagnes, rivières, biomes, grottes, minerais, végétation
import { HEIGHT, SEA_LEVEL } from '../../constants.js';
import { Simplex, RNG, hash2, smoothstep, lerp, clamp } from '../../util/noise.js';
import { BLOCK as K, FLOWER_KEYS, CORAL_KEYS } from '../../blocks/blocks.js';
import { BIOME as BI } from '../biomes.js';
import { placeStructurePieces } from './structures.js';

const idx = (x, y, z) => x | (z << 4) | (y << 8);

export class OverworldGen {
  constructor(seed) {
    this.seed = seed;
    const s = (k) => new Simplex(seed * 31 + k * 1013);
    this.nCont = s(1); this.nEro = s(2); this.nPeak = s(3); this.nHill = s(4); this.nTemp = s(5); this.nHum = s(6);
    this.nRiver = s(7); this.nDetail = s(8); this.nCave1 = s(9); this.nCave2 = s(10); this.nCheese = s(11);
    this.nOver = s(12); this.nSurf = s(13); this.nWeird = s(14); this.nDeep = s(15); this.nBand = s(16);
    this.colCache = new Map();
  }

  // Informations de colonne (fonction pure, déterministe)
  column(x, z) {
    const key = x * 100003 + z;
    const cached = this.colCache.get(key);
    if (cached) return cached;
    // déformation du domaine
    const wx = x + this.nDetail.noise2(x / 300, z / 300) * 40;
    const wz = z + this.nDetail.noise2(x / 300 + 50, z / 300 + 50) * 40;
    let cont = this.nCont.fbm2(wx / 1400, wz / 1400, 4) * 1.35 + 0.12;
    // zone de départ sur terre ferme
    const dSpawn = Math.sqrt(x * x + z * z);
    if (dSpawn < 400) cont = lerp(Math.max(cont, 0.12), cont, smoothstep(150, 400, dSpawn));
    const ero = this.nEro.fbm2(wx / 700, wz / 700, 3);
    const temp = this.nTemp.fbm2(x / 1100, z / 1100, 3) * 1.6;
    const hum = this.nHum.fbm2(x / 950 + 300, z / 950 - 200, 3) * 1.6;
    const weird = this.nWeird.noise2(x / 500, z / 500);

    let base;
    if (cont < -0.5) base = lerp(30, 40, (cont + 1) / 0.5);
    else if (cont < -0.2) base = lerp(40, 56, (cont + 0.5) / 0.3);
    else if (cont < -0.08) base = lerp(56, 63.5, (cont + 0.2) / 0.12);
    else base = 63.5 + (cont + 0.08) * 16;
    const land = smoothstep(-0.12, 0.05, cont);
    // collines
    const hillAmp = 4 + 10 * smoothstep(0.3, -0.5, ero);
    const hills = this.nHill.fbm2(x / 140, z / 140, 4) * hillAmp * land;
    // montagnes
    const mount = smoothstep(0.02, 0.45, cont) * smoothstep(0.15, -0.45, ero);
    const r = this.nPeak.ridged2(wx / 320, wz / 320, 4);
    const peaks = Math.pow(Math.max(0, r - 0.35) / 0.65, 2.2) * 75 * mount + mount * 8;
    let h = base + hills + peaks;
    // rivières
    const rv = Math.abs(this.nRiver.fbm2(wx / 650, wz / 650, 3));
    let river = 0;
    if (cont > -0.15) {
      river = smoothstep(0.055, 0.015, rv) * (1 - smoothstep(0.3, 0.8, mount));
      if (river > 0) h = lerp(h, Math.min(h, SEA_LEVEL - 3 + rv * 40), river);
    }
    h = clamp(Math.round(h), 4, HEIGHT - 6);

    // biome
    let biome;
    const t = temp, u = hum;
    if (h < SEA_LEVEL) {
      if (river > 0.5) biome = t < -0.55 ? BI.frozen_river : BI.river;
      else if (t < -0.55) biome = BI.frozen_ocean;
      else if (t < -0.25) biome = BI.cold_ocean;
      else if (t > 0.6) biome = BI.warm_ocean;
      else if (t > 0.3) biome = BI.lukewarm_ocean;
      else biome = h < 42 ? BI.deep_ocean : BI.ocean;
    } else if (h <= SEA_LEVEL + 2 && cont < -0.04 && river < 0.3) {
      biome = mount > 0.3 ? BI.stony_shore : t < -0.55 ? BI.snowy_beach : BI.beach;
    } else if (mount > 0.45 && h > 100) {
      biome = t < 0.25 ? BI.snowy_slopes : BI.stony_peaks;
    } else if (mount > 0.3 && h > 82) {
      biome = weird > 0.35 ? BI.cherry_grove : weird < -0.4 ? BI.meadow : (t < -0.4 ? BI.snowy_slopes : BI.windswept_hills);
    } else if (t < -0.55) {
      biome = u > 0.1 ? BI.snowy_taiga : weird > 0.55 ? BI.ice_spikes : BI.snowy_plains;
    } else if (t < -0.2) {
      biome = u > -0.15 ? BI.taiga : BI.plains;
    } else if (t < 0.25) {
      if (t < 0.1 && u > -0.3 && u < 0.4 && weird < -0.05) biome = BI.autumn_forest;
      else if (u < -0.35) biome = weird > 0.5 ? BI.sunflower_plains : BI.plains;
      else if (u < 0.05) biome = weird > 0.45 ? BI.flower_forest : BI.forest;
      else if (u < 0.35) biome = BI.birch_forest;
      else biome = h <= SEA_LEVEL + 4 ? BI.swamp : BI.dark_forest;
    } else if (t < 0.55) {
      if (u < -0.3) biome = BI.plains;
      else if (u < 0.2) biome = weird > 0.6 ? BI.mushroom_fields : BI.forest;
      else biome = h <= SEA_LEVEL + 4 ? BI.swamp : BI.jungle;
    } else {
      if (u < -0.2) biome = t > 0.8 && weird < -0.2 ? BI.badlands : BI.desert;
      else if (u < 0.25) biome = BI.savanna;
      else biome = BI.jungle;
    }
    if (river > 0.6 && h >= SEA_LEVEL && h <= SEA_LEVEL + 1) biome = t < -0.55 ? BI.frozen_river : BI.river;
    const res = { h, biome, mount, river, temp: t, hum: u, weird };
    if (this.colCache.size > 20000) this.colCache.clear();
    this.colCache.set(key, res);
    return res;
  }

  heightAt(x, z) { return this.column(x, z).h; }
  biomeAt(x, z) { return this.column(x, z).biome; }

  generate(cx, cz) {
    const blocks = new Uint16Array(16 * 16 * HEIGHT);
    const meta = new Uint8Array(16 * 16 * HEIGHT);
    const biomes = new Uint8Array(256);
    const bx = cx * 16, bz = cz * 16;
    const rng = new RNG((hash2(cx, cz, this.seed) * 4294967296) | 0);
    const cols = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = this.column(bx + x, bz + z);
      cols.push(c);
      biomes[x | (z << 4)] = c.biome;
    }
    // pente (pour roche sur les falaises)
    const slope = (x, z) => {
      const hx = this.column(bx + x + 1, bz + z).h - this.column(bx + x - 1, bz + z).h;
      const hz = this.column(bx + x, bz + z + 1).h - this.column(bx + x, bz + z - 1).h;
      return Math.abs(hx) + Math.abs(hz);
    };

    // ---- grille 3D grossière pour surplombs et grottes (interpolation trilinéaire)
    const GX = 5, GY = HEIGHT / 4 + 1, GZ = 5;
    let maxMount = 0;
    for (const c of cols) if (c.mount > maxMount) maxMount = c.mount;
    const over = maxMount > 0.25 ? new Float32Array(GX * GY * GZ) : null;
    const caveA = new Float32Array(GX * GY * GZ), caveB = new Float32Array(GX * GY * GZ), cheese = new Float32Array(GX * GY * GZ);
    for (let gz = 0; gz < GZ; gz++) for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      const wx = bx + gx * 4, wy = gy * 4, wz = bz + gz * 4;
      const i = (gy * GZ + gz) * GX + gx;
      caveA[i] = this.nCave1.noise3(wx / 48, wy / 32, wz / 48);
      caveB[i] = this.nCave2.noise3(wx / 48, wy / 32, wz / 48);
      cheese[i] = this.nCheese.fbm3(wx / 90, wy / 50, wz / 90, 2);
      if (over) over[i] = this.nOver.fbm3(wx / 50, wy / 34, wz / 50, 2);
    }
    const tri = (arr, x, y, z) => {
      const fx = x / 4, fy = y / 4, fz = z / 4;
      const x0 = Math.floor(fx), y0 = Math.min(GY - 2, Math.floor(fy)), z0 = Math.floor(fz);
      const tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const x1 = Math.min(x0 + 1, GX - 1), z1 = Math.min(z0 + 1, GZ - 1), y1 = y0 + 1;
      const g = (a, b, c) => arr[(b * GZ + c) * GX + a];
      const c00 = g(x0, y0, z0) * (1 - tx) + g(x1, y0, z0) * tx;
      const c10 = g(x0, y1, z0) * (1 - tx) + g(x1, y1, z0) * tx;
      const c01 = g(x0, y0, z1) * (1 - tx) + g(x1, y0, z1) * tx;
      const c11 = g(x0, y1, z1) * (1 - tx) + g(x1, y1, z1) * tx;
      return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    };

    const deepNoise = this.nDeep;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = cols[x + z * 16];
      const wx = bx + x, wz = bz + z;
      const h = c.h, bio = c.biome;
      const sl = slope(x, z);
      const overAmp = over ? Math.max(0, c.mount - 0.25) * 30 : 0;
      const topY = Math.min(HEIGHT - 2, h + Math.ceil(overAmp));
      const deepY = 10 + Math.floor(deepNoise.noise2(wx / 30, wz / 30) * 3);
      const underwater = h < SEA_LEVEL;
      // remplissage pierre
      for (let y = 0; y <= topY; y++) {
        let solid = y <= h;
        if (overAmp > 0 && y > h - overAmp) {
          const d = (h - y) / overAmp + tri(over, x, y, z) * 1.3;
          solid = d > 0;
        }
        if (!solid) continue;
        let id;
        if (y === 0) id = K.bedrock;
        else if (y < 4 && rng.next() < (4 - y) / 4) id = K.bedrock;
        else if (y < deepY) id = K.deepslate;
        else id = K.stone;
        blocks[idx(x, y, z)] = id;
      }
      // surface
      let surfTop = h;
      if (overAmp > 0) { for (let y = topY; y > 0; y--) if (blocks[idx(x, y, z)]) { surfTop = y; break; } }
      const steep = sl > 7 || (overAmp > 0 && surfTop > h + 2);
      const sn = this.nSurf.noise2(wx / 12, wz / 12);
      let top = K.grass_block, fill = K.dirt, depth = 3 + Math.floor(rng.next() * 2);
      switch (bio) {
        case BI.desert: top = K.sand; fill = K.sand; depth = 4; break;
        case BI.beach: top = K.sand; fill = K.sand; break;
        case BI.snowy_beach: top = K.sand; fill = K.sand; break;
        case BI.stony_shore: top = K.stone; fill = K.stone; break;
        case BI.badlands: top = K.red_sand; fill = K.terracotta; depth = 1; break;
        case BI.snowy_slopes: top = K.snow_block; fill = K.snow_block; depth = 2; break;
        case BI.stony_peaks: top = sn > 0.3 ? K.calcite : K.stone; fill = K.stone; break;
        case BI.taiga: case BI.snowy_taiga: if (sn > 0.25) top = K.podzol; break;
        case BI.savanna: if (sn > 0.45) top = K.coarse_dirt; break;
        case BI.mushroom_fields: top = K.mycelium; break;
        case BI.swamp: if (sn > 0.5) top = K.mud; break;
        case BI.windswept_hills: if (sn > 0.4) top = K.stone; else if (sn < -0.5) top = K.gravel; break;
      }
      if (underwater) {
        const deep = h < 45;
        if (bio === BI.river || bio === BI.frozen_river) { top = sn > 0.3 ? K.gravel : sn < -0.4 ? K.clay : K.sand; fill = top === K.clay ? K.clay : K.sand; }
        else if (bio === BI.warm_ocean || bio === BI.lukewarm_ocean) { top = K.sand; fill = K.sand; }
        else if (deep) { top = sn > -0.2 ? K.gravel : K.sand; fill = K.gravel; }
        else { top = sn > 0.35 ? K.gravel : sn < -0.45 ? K.clay : K.sand; fill = K.sand; }
        if (bio === BI.swamp) { top = K.dirt; fill = K.dirt; }
      } else if (steep && bio !== BI.desert && bio !== BI.badlands && bio !== BI.snowy_slopes) {
        top = K.stone; fill = K.stone;
      }
      if (!underwater && surfTop > 105 && (bio === BI.windswept_hills || bio === BI.stony_peaks || bio === BI.snowy_slopes || bio === BI.meadow || bio === BI.cherry_grove)) {
        top = K.snow_block; fill = K.snow_block;
      }
      // applique la surface sur chaque bloc exposé (gère les surplombs)
      let run = -1;
      for (let y = surfTop; y > 0; y--) {
        const i = idx(x, y, z);
        const id = blocks[i];
        if (!id) { run = -1; continue; }
        if (id !== K.stone) { run = 99; continue; }
        if (run === -1) {
          run = 0;
          let t = top;
          if (t === K.grass_block && y < SEA_LEVEL) t = K.dirt;
          blocks[i] = t;
        } else if (run < depth) {
          run++;
          blocks[i] = fill === K.sand && run >= 3 && (bio === BI.desert || bio === BI.beach) ? K.sandstone : fill;
        } else run = 99;
        if (bio === BI.badlands && run >= 0 && run < 99 && y > SEA_LEVEL - 2) {
          const band = Math.floor(y + this.nBand.noise2(wx / 60, wz / 60) * 3) % 9;
          if (run > 0 || blocks[i] === K.terracotta) blocks[i] = [K.terracotta, K.orange_terracotta, K.terracotta, K.yellow_terracotta, K.white_terracotta, K.brown_terracotta, K.terracotta, K.red_terracotta, K.light_gray_terracotta][(band + 9) % 9];
        }
      }
      if (bio === BI.badlands) {
        for (let y = surfTop - 1; y > Math.max(SEA_LEVEL - 4, surfTop - 30); y--) {
          const i = idx(x, y, z);
          if (blocks[i] === K.stone) {
            const band = Math.floor(y + this.nBand.noise2(wx / 60, wz / 60) * 3) % 9;
            blocks[i] = [K.terracotta, K.orange_terracotta, K.terracotta, K.yellow_terracotta, K.white_terracotta, K.brown_terracotta, K.terracotta, K.red_terracotta, K.light_gray_terracotta][(band + 9) % 9];
          }
        }
      }
      // grottes
      const carveTop = underwater ? h - 6 : surfTop + 1;
      for (let y = 5; y < Math.min(carveTop, HEIGHT - 1); y++) {
        const i = idx(x, y, z);
        const id = blocks[i];
        if (!id || id === K.bedrock) continue;
        const depthBelow = surfTop - y;
        const a = tri(caveA, x, y, z), b = tri(caveB, x, y, z);
        const w = 0.075 + (y < 30 ? 0.02 : 0);
        let carve = Math.abs(a) < w && Math.abs(b) < w;
        if (!carve && depthBelow > 8) {
          const ch = tri(cheese, x, y, z);
          carve = ch > 0.42 + Math.max(0, (y - 40) / 60);
        }
        if (carve) {
          if (depthBelow < 4 && (c.river > 0.1 || bio === BI.beach)) continue;
          blocks[i] = y <= 10 ? K.lava : 0;
        }
      }
      // eau
      if (h < SEA_LEVEL || c.river > 0.3) {
        for (let y = SEA_LEVEL; y > 0; y--) {
          const i = idx(x, y, z);
          if (blocks[i]) break;
          blocks[i] = K.water;
        }
        if ((bio === BI.frozen_ocean || bio === BI.frozen_river || (c.temp < -0.55 && bio !== BI.deep_ocean)) && blocks[idx(x, SEA_LEVEL, z)] === K.water) {
          if (bio === BI.frozen_ocean && this.nSurf.noise2(wx / 25, wz / 25) > 0.6) {
            const ph = 2 + Math.floor((this.nSurf.noise2(wx / 9, wz / 9) + 1) * 4);
            for (let y = SEA_LEVEL; y < SEA_LEVEL + ph; y++) blocks[idx(x, y, z)] = K.packed_ice;
          } else blocks[idx(x, SEA_LEVEL, z)] = K.ice;
        }
      }
    }

    // ---- minerais et blocs variés
    const vein = (id, count, y0, y1, size, replace) => {
      for (let n = 0; n < count; n++) {
        let x = rng.next() * 16, y = y0 + rng.next() * (y1 - y0), z = rng.next() * 16;
        const dx = rng.next() - 0.5, dy = (rng.next() - 0.5) * 0.5, dz = rng.next() - 0.5;
        for (let k = 0; k < size; k++) {
          const r = 0.6 + rng.next() * (size > 12 ? 1.6 : 0.8);
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
            if (ox * ox + oy * oy + oz * oz > r * r * 1.2) continue;
            const X = Math.floor(x + ox), Y = Math.floor(y + oy), Z = Math.floor(z + oz);
            if (X < 0 || X > 15 || Z < 0 || Z > 15 || Y < 1 || Y >= HEIGHT) continue;
            const i = idx(X, Y, Z);
            const cur = blocks[i];
            if (cur === K.stone) blocks[i] = id;
            else if (cur === K.deepslate && replace) blocks[i] = replace;
          }
          x += dx * 1.5 + (rng.next() - 0.5); y += dy + (rng.next() - 0.5) * 0.5; z += dz * 1.5 + (rng.next() - 0.5);
        }
      }
    };
    vein(K.dirt, 3, 10, 100, 24); vein(K.gravel, 3, 5, 100, 24);
    vein(K.granite, 2, 10, 90, 30); vein(K.diorite, 2, 10, 90, 30); vein(K.andesite, 2, 10, 90, 30);
    vein(K.tuff, 2, 1, 16, 26, K.tuff);
    vein(K.coal_ore, 18, 8, 127, 12, K.deepslate_coal_ore);
    vein(K.iron_ore, 12, 4, 72, 8, K.deepslate_iron_ore);
    vein(K.copper_ore, 7, 20, 90, 10, K.deepslate_copper_ore);
    vein(K.gold_ore, 3, 4, 34, 8, K.deepslate_gold_ore);
    vein(K.redstone_ore, 6, 2, 18, 7, K.deepslate_redstone_ore);
    vein(K.lapis_ore, 2, 4, 32, 6, K.deepslate_lapis_ore);
    vein(K.diamond_ore, 2, 2, 16, 6, K.deepslate_diamond_ore);
    vein(K.amethyst_block, rng.chance(0.04) ? 1 : 0, 10, 40, 14);
    if (cols.some((c) => c.mount > 0.3)) vein(K.emerald_ore, 3, 40, 120, 2);
    if (cols.some((c) => c.biome === BI.badlands)) vein(K.gold_ore, 6, 30, 80, 8);

    // ---- abîmes (sculk)
    const deepDark = this.nDeep.noise2(bx / 400 + 7, bz / 400 - 3) > 0.45;
    if (deepDark) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 6; y < 30; y++) {
        const i = idx(x, y, z);
        const id = blocks[i];
        if (id !== K.deepslate && id !== K.stone && id !== K.tuff) continue;
        if (blocks[idx(x, y + 1, z)] === 0 && rng.next() < 0.75) {
          blocks[i] = K.sculk;
          const r = rng.next();
          if (r < 0.012) blocks[idx(x, y + 1, z)] = K.sculk_sensor;
          else if (r < 0.018) blocks[idx(x, y + 1, z)] = K.sculk_shrieker;
          else if (r < 0.02) blocks[i] = K.sculk_catalyst;
        } else if (blocks[idx(x, y - 1, z)] === 0 && rng.next() < 0.4) blocks[i] = K.sculk;
      }
    }

    // ---- végétation au sol (dans la colonne)
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = cols[x + z * 16];
      const wx = bx + x, wz = bz + z;
      let y = HEIGHT - 2;
      while (y > 0 && blocks[idx(x, y, z)] === 0) y--;
      const ground = blocks[idx(x, y, z)];
      const above = idx(x, y + 1, z);
      const r = rng.next();
      const bio = c.biome;
      const snowy = c.temp < -0.55 || bio === BI.snowy_slopes || bio === BI.snowy_plains || bio === BI.snowy_taiga || bio === BI.ice_spikes;
      if (ground === K.water) {
        // fond marin
        let fy = y;
        while (fy > 0 && blocks[idx(x, fy, z)] === K.water) fy--;
        const depth = y - fy;
        const fa = idx(x, fy + 1, z);
        if (bio === BI.warm_ocean && depth > 2 && depth < 14) {
          const cn = this.nSurf.noise2(wx / 8, wz / 8);
          if (cn > 0.1) {
            const ck = CORAL_KEYS[Math.floor((this.nWeird.noise2(wx / 6, wz / 6) + 1) * 2.5) % 5];
            blocks[idx(x, fy, z)] = K[ck + '_coral_block'];
            if (cn > 0.4 && rng.next() < 0.6) { const hh = 1 + Math.floor(rng.next() * 3); for (let k = 0; k < hh; k++) blocks[idx(x, fy + 1 + k, z)] = K[ck + '_coral_block']; blocks[idx(x, fy + 1 + hh, z)] = K[ck + '_coral']; }
            else if (rng.next() < 0.5) blocks[fa] = K[CORAL_KEYS[Math.floor(rng.next() * 5)] + '_coral'];
            continue;
          }
        }
        if (bio !== BI.frozen_ocean && bio !== BI.frozen_river) {
          if (depth > 3 && r < (bio === BI.ocean || bio === BI.cold_ocean || bio === BI.deep_ocean || bio === BI.lukewarm_ocean ? 0.06 : 0.01)) {
            const kh = Math.min(depth - 2, 4 + Math.floor(rng.next() * 12));
            for (let k = 0; k < kh; k++) blocks[idx(x, fy + 1 + k, z)] = k === kh - 1 ? K.kelp : K.kelp_plant;
          } else if (r < 0.28 && depth > 1) blocks[fa] = K.seagrass;
        }
        if (bio === BI.swamp && depth <= 2 && r > 0.9) blocks[idx(x, y + 1, z)] = K.lily_pad;
        continue;
      }
      if (y + 1 >= HEIGHT - 1) continue;
      if (snowy && (ground === K.grass_block || ground === K.podzol || ground === K.dirt || ground === K.stone || ground === K.snow_block || ground === K.coarse_dirt)) {
        if (ground === K.grass_block || ground === K.podzol) blocks[idx(x, y, z)] = K.snowy_grass_block;
        if (ground !== K.snow_block) { blocks[above] = K.snow; meta[above] = rng.next() < 0.2 ? 1 : 0; }
        continue;
      }
      if (ground === K.grass_block || ground === K.podzol || ground === K.coarse_dirt || ground === K.mud) {
        // canne à sucre près de l'eau
        if (r < 0.1 && (ground === K.grass_block || ground === K.mud) && this.nearWater(blocks, x, y, z)) {
          const hh = 2 + Math.floor(rng.next() * 3);
          for (let k = 1; k <= hh && y + k < HEIGHT - 1; k++) blocks[idx(x, y + k, z)] = K.sugar_cane;
          continue;
        }
        let gChance = 0.25, fChance = 0.015, tallChance = 0.04;
        if (bio === BI.plains || bio === BI.sunflower_plains || bio === BI.meadow) { gChance = 0.42; fChance = bio === BI.meadow ? 0.12 : 0.03; tallChance = 0.08; }
        else if (bio === BI.flower_forest) { gChance = 0.15; fChance = 0.25; }
        else if (bio === BI.jungle) { gChance = 0.5; tallChance = 0.15; }
        else if (bio === BI.savanna) { gChance = 0.45; tallChance = 0.12; fChance = 0.004; }
        else if (bio === BI.dark_forest || bio === BI.taiga || bio === BI.snowy_taiga) { gChance = 0.18; fChance = 0.004; }
        else if (bio === BI.cherry_grove) { gChance = 0.25; fChance = 0.0; }
        else if (bio === BI.windswept_hills) { gChance = 0.15; }
        else if (bio === BI.mushroom_fields) { gChance = 0; fChance = 0; }
        else if (bio === BI.autumn_forest) { gChance = 0.12; fChance = 0.003; tallChance = 0.02; }
        if (bio === BI.cherry_grove && r < 0.12) { blocks[above] = K.pink_petals; continue; }
        if (bio === BI.autumn_forest) {
          if (r < 0.3) { blocks[above] = K.leaf_litter; continue; }
          if (r > 0.986) { const q = rng.next(); blocks[above] = q < 0.55 ? K.pumpkin : q < 0.8 ? K.brown_mushroom : K.red_mushroom; continue; }
          if (r > 0.975 && r <= 0.986) { blocks[above] = K.sweet_berry_bush; meta[above] = 3; continue; }
        }
        if (r < fChance) {
          const fk = this.flowerFor(bio, wx, wz, rng);
          if (fk.endsWith('_top')) continue;
          if (fk === 'rose_bush' || fk === 'lilac') { blocks[above] = K[fk]; blocks[idx(x, y + 2, z)] = K[fk + '_top']; }
          else blocks[above] = K[fk];
        } else if (r < fChance + tallChance * gChance * 2 && y + 2 < HEIGHT) {
          const fern = (bio === BI.taiga || bio === BI.snowy_taiga || bio === BI.jungle) && rng.next() < 0.6;
          blocks[above] = fern ? K.large_fern : K.tall_grass; blocks[idx(x, y + 2, z)] = fern ? K.large_fern_top : K.tall_grass_top;
        } else if (r < fChance + gChance) {
          blocks[above] = (bio === BI.taiga || bio === BI.snowy_taiga || bio === BI.jungle) && rng.next() < 0.4 ? K.fern : K.short_grass;
        } else if (r > 0.997 && bio !== BI.mushroom_fields) {
          blocks[above] = rng.next() < 0.5 ? K.pumpkin : K.brown_mushroom;
        } else if (bio === BI.jungle && r > 0.99) {
          blocks[above] = K.melon;
        } else if (bio === BI.jungle && r > 0.975) {
          const hh = 6 + Math.floor(rng.next() * 8);
          for (let k = 1; k <= hh && y + k < HEIGHT - 1; k++) blocks[idx(x, y + k, z)] = K.bamboo;
        } else if ((bio === BI.taiga || bio === BI.snowy_taiga) && r > 0.985) {
          blocks[above] = K.sweet_berry_bush;
        } else if (bio === BI.mushroom_fields && r > 0.95) {
          blocks[above] = rng.next() < 0.5 ? K.red_mushroom : K.brown_mushroom;
        } else if (bio === BI.dark_forest && r > 0.97) {
          blocks[above] = rng.next() < 0.5 ? K.red_mushroom : K.brown_mushroom;
        }
      } else if (ground === K.sand && (bio === BI.desert)) {
        if (r < 0.006) {
          const hh = 1 + Math.floor(rng.next() * 3);
          if (x > 0 && x < 15 && z > 0 && z < 15) for (let k = 1; k <= hh; k++) blocks[idx(x, y + k, z)] = K.cactus;
        } else if (r < 0.014) blocks[above] = K.dead_bush;
      } else if (ground === K.sand && (bio === BI.beach) && r < 0.05 && this.nearWater(blocks, x, y, z)) {
        const hh = 1 + Math.floor(rng.next() * 3);
        for (let k = 1; k <= hh; k++) blocks[idx(x, y + k, z)] = K.sugar_cane;
      } else if ((ground === K.red_sand || ground === K.terracotta || ground === K.orange_terracotta) && r < 0.012) {
        blocks[above] = K.dead_bush;
      }
    }

    // ---- grandes structures (pièces découpées par chunk)
    const blockEntities = placeStructurePieces(this, cx, cz, blocks, meta);

    return { blocks, meta, biomes, blockEntities };
  }

  nearWater(blocks, x, y, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Z = z + dz;
      if (X < 0 || X > 15 || Z < 0 || Z > 15) continue;
      if (blocks[idx(X, y, Z)] === K.water) return true;
    }
    return false;
  }

  flowerFor(bio, x, z, rng) {
    if (bio === BI.swamp) return 'blue_orchid';
    if (bio === BI.flower_forest || bio === BI.meadow) {
      const n = (this.nWeird.noise2(x / 20, z / 20) + 1) / 2;
      const list = ['allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'lilac', 'rose_bush', 'dandelion', 'poppy'];
      return list[Math.floor(n * list.length) % list.length];
    }
    if (bio === BI.plains || bio === BI.sunflower_plains) {
      const r = rng.next();
      return r < 0.3 ? 'dandelion' : r < 0.55 ? 'poppy' : r < 0.65 ? 'azure_bluet' : r < 0.75 ? 'oxeye_daisy' : r < 0.85 ? 'cornflower' : ['red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip'][Math.floor(rng.next() * 4)];
    }
    if (bio === BI.forest || bio === BI.birch_forest) {
      const r = rng.next();
      return r < 0.4 ? 'dandelion' : r < 0.75 ? 'poppy' : r < 0.85 ? 'lily_of_the_valley' : r < 0.93 ? 'lilac' : 'rose_bush';
    }
    return rng.next() < 0.5 ? 'dandelion' : 'poppy';
  }

  findSpawn() {
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        const c = this.column(x, z);
        if (c.h >= SEA_LEVEL + 1 && c.h < 90 && c.mount < 0.3 && c.river < 0.1) return [x + 0.5, c.h + 1, z + 0.5];
      }
    }
    return [0.5, this.column(0, 0).h + 2, 0.5];
  }
}

export const FLOWERS = FLOWER_KEYS;
