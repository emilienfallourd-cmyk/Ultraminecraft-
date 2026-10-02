// Écoulement des fluides façon Minecraft : sources, niveaux 1-7, chutes, sources infinies,
// recherche du chemin le plus court vers un trou, réactions eau/lave (obsidienne, pierre).
import { BLOCK as K, BLOCKS, B_SOLID, B_FLUID, B_WATERLOGGED } from '../blocks/blocks.js';

const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Fluids {
  constructor(game) { this.game = game; }
  rate(world, id) { return id === K.lava ? (world.dim === 1 ? 10 : 30) : 5; }
  drop(world, id) { return id === K.lava && world.dim !== 1 ? 2 : 1; }

  isSame(world, x, y, z, fid) {
    const id = world.getBlock(x, y, z);
    return id === fid || (fid === K.water && B_WATERLOGGED[id]);
  }
  levelAt(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (B_WATERLOGGED[id]) return 0;
    const m = world.getMeta(x, y, z);
    return m >= 8 ? 0 : m;
  }

  // le fluide peut-il occuper cette case ?
  canFlowInto(world, x, y, z, fid, newLevel) {
    const id = world.getBlock(x, y, z);
    if (id === 0) return true;
    if (id === fid) {
      const m = world.getMeta(x, y, z);
      if (m === 0) return false;
      return m >= 8 ? false : m > newLevel;
    }
    if (B_WATERLOGGED[id]) return false;
    const def = BLOCKS[id];
    if (def.fluid) return true; // réaction
    if (id === K.nether_portal || id === K.end_portal) return false;
    if (def.replaceable || (!def.solid && (def.shape === 'cross' || def.model === 'torch' || def.model === 'crop' || def.model === 'fire' || def.model === 'petals'))) return def.key !== 'ladder';
    return false;
  }

  place(world, x, y, z, fid, meta) {
    const id = world.getBlock(x, y, z);
    if (id && id !== fid) {
      const def = BLOCKS[id];
      if (def.fluid) {
        // réactions eau / lave
        const tgtMeta = world.getMeta(x, y, z);
        if (fid === K.water && id === K.lava) { world.setBlock(x, y, z, tgtMeta === 0 ? K.obsidian : K.cobblestone); this.fizz(x, y, z); return; }
        if (fid === K.lava && id === K.water) { world.setBlock(x, y, z, K.stone); this.fizz(x, y, z); return; }
      } else if (!def.solid || def.replaceable) {
        if (this.game.breakBlock) this.game.breakBlock(x, y, z, true, true);
      }
    }
    world.setBlock(x, y, z, fid, meta);
  }

  fizz(x, y, z) {
    const g = this.game;
    if (g.audio) g.audio.play('fizz', x + 0.5, y + 0.5, z + 0.5);
    if (g.particles) for (let i = 0; i < 8; i++) g.particles.smoke(x + Math.random(), y + 1, z + Math.random(), 0.6);
  }

  tick(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (id !== K.water && id !== K.lava) return;
    const isLava = id === K.lava;
    let meta = world.getMeta(x, y, z);
    // réaction lave au contact de l'eau
    if (isLava) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (this.isSame(world, x + dx, y + dy, z + dz, K.water)) {
          world.setBlock(x, y, z, meta === 0 ? K.obsidian : K.cobblestone);
          this.fizz(x, y, z);
          return;
        }
      }
    }
    const drop = this.drop(world, id);
    // recalcul de l'état d'un bloc qui coule
    if (meta !== 0) {
      let best = 99, sources = 0;
      for (const [dx, dz] of H4) {
        if (!this.isSame(world, x + dx, y, z + dz, id)) continue;
        const l = this.levelAt(world, x + dx, y, z + dz);
        const nm = B_WATERLOGGED[world.getBlock(x + dx, y, z + dz)] ? 0 : world.getMeta(x + dx, y, z + dz);
        if (nm === 0) sources++;
        if (l < best) best = l;
      }
      let ns;
      const below = world.getBlock(x, y - 1, z);
      if (!isLava && sources >= 2 && (B_SOLID[below] || (below === K.water && world.getMeta(x, y - 1, z) === 0))) ns = 0;
      else if (this.isSame(world, x, y + 1, z, id)) ns = 8;
      else {
        ns = best + drop;
        if (ns > 7) ns = -1;
      }
      if (ns === -1) { world.setBlock(x, y, z, 0); return; }
      if (ns !== meta) {
        world.setBlock(x, y, z, id, ns);
        meta = ns;
        // un changement relance un tick ultérieur pour continuer à se propager
      }
    }
    // écoulement
    const level = meta >= 8 ? 0 : meta;
    if (this.canFlowInto(world, x, y - 1, z, id, 8) && y > 0) {
      if (!(world.getBlock(x, y - 1, z) === id && world.getMeta(x, y - 1, z) >= 8)) this.place(world, x, y - 1, z, id, 8);
      if (meta !== 0) return;
    }
    const nl = level + drop;
    if (nl > 7) return;
    // pas d'étalement si posé sur un fluide identique en cascade (évite les nappes)
    const belowId = world.getBlock(x, y - 1, z);
    if (meta !== 0 && belowId === id) return;
    const dirs = this.spreadDirs(world, x, y, z, id, nl);
    for (const [dx, dz] of dirs) {
      if (this.canFlowInto(world, x + dx, y, z + dz, id, nl)) this.place(world, x + dx, y, z + dz, id, nl);
    }
  }

  spreadDirs(world, x, y, z, id, nl) {
    const maxD = id === K.lava && world.dim !== 1 ? 2 : 4;
    let best = 1000;
    const res = [];
    for (const [dx, dz] of H4) {
      const nx = x + dx, nz = z + dz;
      if (!this.canFlowInto(world, nx, y, nz, id, nl)) continue;
      let cost;
      if (this.canFlowInto(world, nx, y - 1, nz, id, 8)) cost = 0;
      else cost = this.slopeDist(world, nx, y, nz, id, 1, maxD, -dx, -dz);
      if (cost < best) { best = cost; res.length = 0; }
      if (cost === best) res.push([dx, dz]);
    }
    return res;
  }

  slopeDist(world, x, y, z, id, depth, maxD, fx, fz) {
    let best = 1000;
    for (const [dx, dz] of H4) {
      if (dx === fx && dz === fz) continue;
      const nx = x + dx, nz = z + dz;
      if (!this.canFlowInto(world, nx, y, nz, id, 7)) continue;
      if (this.canFlowInto(world, nx, y - 1, nz, id, 8)) return depth;
      if (depth < maxD) {
        const d = this.slopeDist(world, nx, y, nz, id, depth + 1, maxD, -dx, -dz);
        if (d < best) best = d;
      }
    }
    return best;
  }
}

export function isFluidId(id) { return B_FLUID[id] !== 0; }
