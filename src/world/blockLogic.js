// Logique des blocs : supports, gravité, croissance, propagation de l'herbe, dégradation des feuilles, fonte...
import { BLOCK as K, BLOCKS, B_SOLID, B_OPAQUE, B_FLUID } from '../blocks/blocks.js';
import { Fluids } from './fluids.js';
import { growTree } from './gen/features.js';
import { RNG } from '../util/noise.js';

const SOIL = new Set([K.grass_block, K.dirt, K.podzol, K.coarse_dirt, K.farmland, K.mud, K.moss_block, K.mycelium, K.snowy_grass_block]);
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACING_VEC = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // sud, ouest, nord, est

// blocs à tick aléatoire
for (const k of ['grass_block', 'mycelium', 'farmland', 'wheat', 'carrots', 'potatoes', 'nether_wart', 'sugar_cane', 'cactus', 'ice', 'snow',
  'sweet_berry_bush', 'kelp', 'bamboo', 'fire', 'soul_fire', 'oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves',
  'dark_oak_leaves', 'cherry_leaves', 'oak_sapling', 'spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling', 'dark_oak_sapling',
  'cherry_sapling', 'red_mushroom', 'brown_mushroom', 'chorus_flower']) if (BLOCKS[K[k]]) BLOCKS[K[k]].randomTick = true;

export class BlockLogic {
  constructor(game) { this.game = game; this.fluids = new Fluids(game); this.rng = new RNG(1234); }

  onBlockChanged(world, x, y, z, oldId, newId, oldMeta, newMeta) {
    // fluides voisins
    for (const [dx, dy, dz] of [[0, 0, 0], ...DIRS6]) {
      const id = world.getBlock(x + dx, y + dy, z + dz);
      if (B_FLUID[id]) world.schedule(x + dx, y + dy, z + dz, this.fluids.rate(world, id));
    }
    // supports des voisins
    for (const [dx, dy, dz] of DIRS6) this.checkSupport(world, x + dx, y + dy, z + dz);
    this.checkSupport(world, x, y, z);
    // gravité
    const up = world.getBlock(x, y + 1, z);
    if (BLOCKS[up] && BLOCKS[up].gravity) world.schedule(x, y + 1, z, 2);
    if (BLOCKS[newId] && BLOCKS[newId].gravity) world.schedule(x, y, z, 2);
    // portail du Nether cassé
    if ((oldId === K.obsidian || oldId === K.nether_portal) && newId !== K.nether_portal) {
      for (const [dx, dy, dz] of DIRS6) if (world.getBlock(x + dx, y + dy, z + dz) === K.nether_portal) world.schedule(x + dx, y + dy, z + dz, 1);
    }
    // TNT allumée par le feu ou la lave voisine : non (géré par l'interaction)
  }

  supported(world, x, y, z, id, meta) {
    const def = BLOCKS[id];
    const below = world.getBlock(x, y - 1, z);
    const sup = def.support;
    if (def.tallTop) return world.getBlock(x, y - 1, z) === K[def.tallTop];
    if (def.tall && world.getBlock(x, y + 1, z) !== K[def.key + '_top']) return false;
    switch (sup) {
      case 'plant':
        if (def.key.includes('mushroom')) return B_SOLID[below] && BLOCKS[below].shape !== 'model';
        if (def.waterlogged) return B_SOLID[below] || below === K.kelp_plant;
        return SOIL.has(below);
      case 'below': return B_SOLID[below] && (B_OPAQUE[below] || BLOCKS[below].shape === 'model');
      case 'torch': {
        const m = meta & 7;
        if (m === 0) return B_SOLID[below];
        const f = (m - 1) & 3; // la torche pointe vers f, le mur est derrière
        const [vx, vz] = FACING_VEC[f];
        return B_SOLID[world.getBlock(x - vx, y, z - vz)];
      }
      case 'wall': {
        const [vx, vz] = FACING_VEC[meta & 3];
        return B_SOLID[world.getBlock(x - vx, y, z - vz)];
      }
      case 'sand': {
        if (!(below === K.sand || below === K.red_sand || below === K.cactus)) return false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (B_SOLID[world.getBlock(x + dx, y, z + dz)]) return false;
        return true;
      }
      case 'cane': {
        if (below === id) return true;
        if (id === K.bamboo) return SOIL.has(below) || below === K.sand || below === K.gravel;
        if (!(SOIL.has(below) || below === K.sand || below === K.red_sand)) return false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = world.getBlock(x + dx, y - 1, z + dz); if (n === K.water || n === K.ice) return true; }
        return false;
      }
      case 'water': return below === K.water;
      case 'kelp': return B_SOLID[below] || below === K.kelp_plant || below === K.kelp;
      case 'farmland': return below === K.farmland;
      case 'soul_sand': return below === K.soul_sand;
      case 'nylium': return below === K.crimson_nylium || below === K.warped_nylium || below === K.netherrack || below === K.soul_soil;
      default: return true;
    }
  }

  checkSupport(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (!id) return;
    const def = BLOCKS[id];
    if (id === K.nether_portal) { if (!this.portalValid(world, x, y, z)) world.schedule(x, y, z, 1); return; }
    if (def.key === 'oak_door') {
      const m = world.getMeta(x, y, z);
      const other = (m & 8) ? world.getBlock(x, y - 1, z) : world.getBlock(x, y + 1, z);
      if (other !== K.oak_door) this.game.breakBlock(x, y, z, false, true);
      else if (!(m & 8) && !B_SOLID[world.getBlock(x, y - 1, z)]) this.game.breakBlock(x, y, z, true, true);
      return;
    }
    if (def.key === 'red_bed') {
      const m = world.getMeta(x, y, z);
      const [vx, vz] = FACING_VEC[m & 3];
      const s = (m & 8) ? -1 : 1;
      if (world.getBlock(x + vx * s, y, z + vz * s) !== K.red_bed) this.game.breakBlock(x, y, z, false, true);
      return;
    }
    if (!def.support && !def.tall && !def.tallTop) return;
    if (!this.supported(world, x, y, z, id, world.getMeta(x, y, z))) this.game.breakBlock(x, y, z, true, true);
  }

  portalValid(world, x, y, z) {
    const m = world.getMeta(x, y, z) & 1;
    const ax = m ? [0, 1] : [1, 0];
    const ok = (dx, dy, dz) => { const b = world.getBlock(x + dx, y + dy, z + dz); return b === K.obsidian || b === K.nether_portal; };
    return ok(0, 1, 0) && ok(0, -1, 0) && ok(ax[0], 0, ax[1]) && ok(-ax[0], 0, -ax[1]);
  }

  scheduledTick(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (!id) return;
    if (B_FLUID[id]) { this.fluids.tick(world, x, y, z); return; }
    const def = BLOCKS[id];
    if (def.gravity) {
      const b = world.getBlock(x, y - 1, z);
      if (y > 0 && (b === 0 || B_FLUID[b] || (BLOCKS[b].replaceable && !B_SOLID[b]))) {
        const m = world.getMeta(x, y, z);
        world.setBlock(x, y, z, 0);
        this.game.spawnFallingBlock(x, y, z, id, m);
      }
      return;
    }
    if (id === K.nether_portal && !this.portalValid(world, x, y, z)) { world.setBlock(x, y, z, 0); return; }
    if (id === K.fire || id === K.soul_fire) this.fireTick(world, x, y, z, id);
  }

  fireTick(world, x, y, z, id) {
    const below = world.getBlock(x, y - 1, z);
    const eternal = below === K.netherrack || below === K.magma_block || below === K.soul_sand || below === K.soul_soil || below === K.bedrock;
    if (!B_SOLID[below] && !this.flammableAround(world, x, y, z)) { world.setBlock(x, y, z, 0); return; }
    if (this.game.weather && this.game.weather.rain > 0.5 && world.getSkyLight(x, y, z) >= 14 && !eternal) { world.setBlock(x, y, z, 0); return; }
    const age = world.getMeta(x, y, z);
    if (!eternal && age > 10 + Math.random() * 10) {
      world.setBlock(x, y, z, 0);
      if (BLOCKS[below].flammable && Math.random() < 0.4) world.setBlock(x, y - 1, z, 0);
      return;
    }
    world.setMeta(x, y, z, Math.min(15, age + 1));
    // propagation
    if (!eternal) for (const [dx, dy, dz] of DIRS6) {
      const b = BLOCKS[world.getBlock(x + dx, y + dy, z + dz)];
      if (b && b.flammable && Math.random() < 0.08) {
        if (b.key === 'tnt') { world.setBlock(x + dx, y + dy, z + dz, 0); this.game.primeTnt(x + dx, y + dy, z + dz, 80); continue; }
        // brûle le bloc et propage le feu au-dessus
        if (Math.random() < 0.5) world.setBlock(x + dx, y + dy, z + dz, K.fire);
      }
    }
    world.schedule(x, y, z, 30 + Math.floor(Math.random() * 10));
  }
  flammableAround(world, x, y, z) {
    for (const [dx, dy, dz] of DIRS6) { const b = BLOCKS[world.getBlock(x + dx, y + dy, z + dz)]; if (b && b.flammable) return true; }
    return false;
  }

  randomTick(world, x, y, z, id, meta) {
    const r = Math.random();
    const light = () => Math.max(world.getBlockLight(x, y + 1, z), Math.round(world.getSkyLight(x, y + 1, z) * this.game.skyFactor()));
    switch (id) {
      case K.grass_block: case K.mycelium: {
        const up = world.getBlock(x, y + 1, z);
        if (B_OPAQUE[up] || B_FLUID[up]) { world.setBlock(x, y, z, K.dirt); return; }
        if (light() >= 9) {
          for (let i = 0; i < 4; i++) {
            const nx = x + Math.floor(Math.random() * 3) - 1, ny = y + Math.floor(Math.random() * 5) - 3, nz = z + Math.floor(Math.random() * 3) - 1;
            if (world.getBlock(nx, ny, nz) === K.dirt && world.getMeta(nx, ny, nz) === 0) {
              const u = world.getBlock(nx, ny + 1, nz);
              if (!B_OPAQUE[u] && !B_FLUID[u] && world.getLight(nx, ny + 1, nz) >> 4 >= 4) world.setBlock(nx, ny, nz, id);
            }
          }
        }
        return;
      }
      case K.farmland: {
        let wet = false;
        for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) if (world.getBlock(x + dx, y + dy, z + dz) === K.water) { wet = true; break; }
        if (wet || (this.game.weather && this.game.weather.rain > 0.5)) { if (meta !== 7) world.setMeta(x, y, z, 7); }
        else if (meta > 0) world.setMeta(x, y, z, meta - 1);
        else { const up = BLOCKS[world.getBlock(x, y + 1, z)]; if (!up || !up.crop) world.setBlock(x, y, z, K.dirt); }
        return;
      }
      case K.wheat: case K.carrots: case K.potatoes: case K.nether_wart: {
        const def = BLOCKS[id];
        if (meta >= def.crop.stages - 1) return;
        if (id !== K.nether_wart && light() < 9) return;
        const soil = world.getBlock(x, y - 1, z);
        const moist = soil === K.farmland && world.getMeta(x, y - 1, z) > 0;
        if (r < (moist ? 0.33 : 0.16)) world.setBlock(x, y, z, id, meta + 1, { notify: false });
        return;
      }
      case K.sweet_berry_bush: if (meta < 3 && r < 0.2 && light() >= 9) world.setMeta(x, y, z, meta + 1); return;
      case K.sugar_cane: case K.cactus: case K.bamboo: {
        let h = 1;
        while (world.getBlock(x, y - h, z) === id) h++;
        const max = id === K.bamboo ? 14 : 3;
        if (h < max && world.getBlock(x, y + 1, z) === 0 && r < 0.25) {
          world.setBlock(x, y + 1, z, id);
        }
        return;
      }
      case K.kelp: {
        if (world.getBlock(x, y + 1, z) === K.water && world.getBlock(x, y + 2, z) === K.water && r < 0.1) {
          world.setBlock(x, y, z, K.kelp_plant); world.setBlock(x, y + 1, z, K.kelp);
        }
        return;
      }
      case K.ice: if (world.getBlockLight(x, y, z) > 11 || world.dim === 1) world.setBlock(x, y, z, K.water); return;
      case K.snow: if (world.getBlockLight(x, y, z) > 11) this.game.breakBlock(x, y, z, false, true); return;
      case K.fire: case K.soul_fire: world.schedule(x, y, z, 1); return;
      case K.red_mushroom: case K.brown_mushroom: return;
      case K.chorus_flower: return;
    }
    const def = BLOCKS[id];
    if (def.sapling) {
      if (light() >= 9 && r < 0.12) this.growSapling(world, x, y, z, def.sapling);
      return;
    }
    if (def.key.endsWith('_leaves') && !(meta & 1)) {
      if (!this.logNearby(world, x, y, z, 5)) this.game.breakBlock(x, y, z, true, true);
    }
  }

  growSapling(world, x, y, z, kind) {
    world.setBlock(x, y, z, 0, 0, { notify: false });
    const ok = growTree(world, x, y, z, kind, new RNG((Math.random() * 1e9) | 0));
    if (!ok) world.setBlock(x, y, z, K[kind + '_sapling'], 0, { notify: false });
  }

  logNearby(world, x, y, z, r) {
    // recherche en largeur d'une bûche à moins de r blocs via les feuilles
    const seen = new Set();
    let frontier = [[x, y, z]];
    for (let d = 0; d <= r; d++) {
      const next = [];
      for (const [a, b, c] of frontier) {
        for (const [dx, dy, dz] of DIRS6) {
          const nx = a + dx, ny = b + dy, nz = c + dz;
          const key = nx + ',' + ny + ',' + nz;
          if (seen.has(key)) continue;
          seen.add(key);
          const id = world.getBlock(nx, ny, nz);
          const k = BLOCKS[id].key;
          if (k.endsWith('_log') || k.endsWith('_stem') || k === 'mushroom_stem') return true;
          if (k.endsWith('_leaves')) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return false;
  }

  // poudre d'os
  boneMeal(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (def.crop) {
      const m = world.getMeta(x, y, z);
      if (m >= def.crop.stages - 1) return false;
      world.setBlock(x, y, z, id, Math.min(def.crop.stages - 1, m + 2 + Math.floor(Math.random() * 3)), { notify: false });
      return true;
    }
    if (def.sapling) { if (Math.random() < 0.45) this.growSapling(world, x, y, z, def.sapling); return true; }
    if (id === K.sweet_berry_bush) { world.setMeta(x, y, z, Math.min(3, world.getMeta(x, y, z) + 1)); return true; }
    if (id === K.grass_block) {
      for (let i = 0; i < 40; i++) {
        const nx = x + Math.round((Math.random() - 0.5) * 7), nz = z + Math.round((Math.random() - 0.5) * 7);
        for (let dy = -1; dy <= 1; dy++) {
          if (world.getBlock(nx, y + dy, nz) === K.grass_block && world.getBlock(nx, y + dy + 1, nz) === 0) {
            const r = Math.random();
            world.setBlock(nx, y + dy + 1, nz, r < 0.8 ? K.short_grass : r < 0.9 ? K.dandelion : K.poppy);
          }
        }
      }
      return true;
    }
    if (id === K.short_grass && world.getBlock(x, y + 1, z) === 0) { world.setBlock(x, y, z, K.tall_grass); world.setBlock(x, y + 1, z, K.tall_grass_top); return true; }
    return false;
  }
}
