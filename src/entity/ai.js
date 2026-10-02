// Recherche de chemin A* sur la grille de blocs (marche, saut d'un bloc, chute ≤ 3 blocs, nage)
import { BLOCKS, BLOCK as K, B_SOLID, B_FLUID } from '../blocks/blocks.js';

const DANGER = new Set([K.lava, K.fire, K.soul_fire, K.cactus, K.sweet_berry_bush, K.magma_block, K.campfire]);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function passable(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  if (!id) return true;
  if (DANGER.has(id)) return false;
  const d = BLOCKS[id];
  if (B_SOLID[id] && !(d.model === 'door' && (world.getMeta(x, y, z) & 4))) return false;
  return true;
}
function standable(world, x, y, z, h, swim) {
  for (let i = 0; i < h; i++) if (!passable(world, x, y + i, z)) return false;
  const below = world.getBlock(x, y - 1, z);
  if (DANGER.has(below)) return false;
  if (B_SOLID[below]) return true;
  if (swim && (B_FLUID[below] === 1 || B_FLUID[world.getBlock(x, y, z)] === 1)) return true;
  return false;
}

export function findPath(world, sx, sy, sz, tx, ty, tz, opts = {}) {
  const maxNodes = opts.maxNodes || 400, h = opts.height || 2, swim = opts.swim !== false;
  const key = (x, y, z) => x * 73856093 ^ y * 19349663 ^ z * 83492791;
  const open = [];
  const nodes = new Map();
  const start = { x: sx, y: sy, z: sz, g: 0, f: 0, parent: null, k: key(sx, sy, sz) };
  start.f = Math.hypot(tx - sx, ty - sy, tz - sz);
  open.push(start);
  nodes.set(start.k, start);
  let best = start, bestH = start.f, n = 0;
  while (open.length && n < maxNodes) {
    // tas binaire simplifié : extraction du minimum
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    cur.closed = true;
    n++;
    const hd = Math.abs(cur.x - tx) + Math.abs(cur.y - ty) * 0.5 + Math.abs(cur.z - tz);
    if (hd < bestH) { bestH = hd; best = cur; }
    if (Math.abs(cur.x - tx) <= (opts.reach || 1) && Math.abs(cur.z - tz) <= (opts.reach || 1) && Math.abs(cur.y - ty) <= 1) { best = cur; break; }
    for (const [dx, dz] of N4) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (dx && dz && (!passable(world, cur.x + dx, cur.y, cur.z) || !passable(world, cur.x, cur.y, cur.z + dz))) continue;
      let ny = null;
      if (standable(world, nx, cur.y, nz, h, swim)) ny = cur.y;
      else if (!dx || !dz) {
        if (standable(world, nx, cur.y + 1, nz, h, swim) && passable(world, cur.x, cur.y + h, cur.z)) ny = cur.y + 1;
        else for (let d = 1; d <= 3; d++) {
          if (!passable(world, nx, cur.y - d + h - 1, nz)) break;
          if (standable(world, nx, cur.y - d, nz, h, swim)) { ny = cur.y - d; break; }
        }
      }
      if (ny === null) continue;
      const k = key(nx, ny, nz);
      const cost = cur.g + (dx && dz ? 1.414 : 1) + (ny > cur.y ? 0.5 : 0) + (B_FLUID[world.getBlock(nx, ny, nz)] ? 2 : 0);
      let nd = nodes.get(k);
      if (nd && (nd.closed || nd.g <= cost)) continue;
      if (!nd) { nd = { x: nx, y: ny, z: nz, k }; nodes.set(k, nd); open.push(nd); }
      nd.g = cost; nd.parent = cur;
      nd.f = cost + Math.hypot(tx - nx, (ty - ny) * 1.5, tz - nz) * 1.1;
    }
  }
  const path = [];
  for (let c = best; c; c = c.parent) path.push([c.x, c.y, c.z]);
  path.reverse();
  return path.length > 1 ? path : null;
}

export function canSee(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  const steps = Math.ceil(d * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const id = world.getBlock(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t));
    if (B_SOLID[id] && BLOCKS[id].opaque) return false;
  }
  return true;
}

export { standable, passable };
