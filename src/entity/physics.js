// Physique des entités : collisions AABB contre les blocs (algorithme de Minecraft), marche d'escalier
import { BLOCKS, getBoxes, B_FLUID, B_WATERLOGGED } from '../blocks/blocks.js';
import { HEIGHT } from '../constants.js';

const tmp = [];

export function collectBoxes(world, minX, minY, minZ, maxX, maxY, maxZ, out = tmp) {
  out.length = 0;
  const x0 = Math.floor(minX) - 1, x1 = Math.floor(maxX) + 1;
  const y0 = Math.max(-1, Math.floor(minY) - 1), y1 = Math.min(HEIGHT + 1, Math.floor(maxY) + 1);
  const z0 = Math.floor(minZ) - 1, z1 = Math.floor(maxZ) + 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const loaded = world.isLoaded(x, z);
    for (let y = y0; y <= y1; y++) {
      if (!loaded) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
      if (y < 0) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
      const id = world.getBlock(x, y, z);
      if (!id) continue;
      const bx = getBoxes(id, world.getMeta(x, y, z), world, x, y, z);
      if (!bx) continue;
      for (const b of bx) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
  }
  return out;
}

function clipY(b, e, dy) {
  if (e[3] <= b[0] || e[0] >= b[3] || e[5] <= b[2] || e[2] >= b[5]) return dy;
  if (dy > 0 && e[4] <= b[1]) { const d = b[1] - e[4]; if (d < dy) dy = d; }
  else if (dy < 0 && e[1] >= b[4]) { const d = b[4] - e[1]; if (d > dy) dy = d; }
  return dy;
}
function clipX(b, e, dx) {
  if (e[4] <= b[1] || e[1] >= b[4] || e[5] <= b[2] || e[2] >= b[5]) return dx;
  if (dx > 0 && e[3] <= b[0]) { const d = b[0] - e[3]; if (d < dx) dx = d; }
  else if (dx < 0 && e[0] >= b[3]) { const d = b[3] - e[0]; if (d > dx) dx = d; }
  return dx;
}
function clipZ(b, e, dz) {
  if (e[4] <= b[1] || e[1] >= b[4] || e[3] <= b[0] || e[0] >= b[3]) return dz;
  if (dz > 0 && e[5] <= b[2]) { const d = b[2] - e[5]; if (d < dz) dz = d; }
  else if (dz < 0 && e[2] >= b[5]) { const d = b[5] - e[2]; if (d > dz) dz = d; }
  return dz;
}

function sweep(boxes, e, dx, dy, dz) {
  for (const b of boxes) dy = clipY(b, e, dy);
  e[1] += dy; e[4] += dy;
  for (const b of boxes) dx = clipX(b, e, dx);
  e[0] += dx; e[3] += dx;
  for (const b of boxes) dz = clipZ(b, e, dz);
  e[2] += dz; e[5] += dz;
  return [dx, dy, dz];
}

// Déplace l'entité ; renvoie les collisions
export function moveEntity(world, ent, dx, dy, dz) {
  const hw = ent.w / 2;
  if (ent.noClip) { ent.x += dx; ent.y += dy; ent.z += dz; return { hx: false, hy: false, ground: false }; }
  // bord des blocs en mode furtif
  if (ent.sneaking && ent.onGround && !ent.flying) {
    const step = 0.05;
    const supported = (ox, oz) => {
      const bs = collectBoxes(world, ent.x - hw + ox, ent.y - 1.0, ent.z - hw + oz, ent.x + hw + ox, ent.y, ent.z + hw + oz, []);
      const e = [ent.x - hw + ox, ent.y - 1.0, ent.z - hw + oz, ent.x + hw + ox, ent.y - 0.001, ent.z + hw + oz];
      return bs.some((b) => b[3] > e[0] && b[0] < e[3] && b[5] > e[2] && b[2] < e[5] && b[4] > e[1] && b[1] < e[4]);
    };
    while (dx !== 0 && !supported(dx, 0)) { if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step; }
    while (dz !== 0 && !supported(0, dz)) { if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step; }
    while (dx !== 0 && dz !== 0 && !supported(dx, dz)) {
      if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step;
      if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step;
    }
  }
  const e = [ent.x - hw, ent.y, ent.z - hw, ent.x + hw, ent.y + ent.h, ent.z + hw];
  const minX = Math.min(e[0], e[0] + dx), maxX = Math.max(e[3], e[3] + dx);
  const minY = Math.min(e[1], e[1] + dy), maxY = Math.max(e[4], e[4] + dy) + (ent.stepHeight || 0);
  const minZ = Math.min(e[2], e[2] + dz), maxZ = Math.max(e[5], e[5] + dz);
  const boxes = collectBoxes(world, minX, minY, minZ, maxX, maxY, maxZ, []);
  const e0 = e.slice();
  let [rx, ry, rz] = sweep(boxes, e, dx, dy, dz);
  const hy = ry !== dy, hx = rx !== dx || rz !== dz;
  const ground = hy && dy < 0;
  // marche automatique (0.6 bloc)
  const sh = ent.stepHeight || 0;
  if (sh > 0 && hx && (ground || ent.onGround)) {
    const e2 = e0.slice();
    const [, uy] = sweep(boxes, e2, 0, sh, 0);
    const [sx, , sz] = sweep(boxes, e2, dx, 0, dz);
    const [, dy2] = sweep(boxes, e2, 0, -uy + (dy < 0 ? dy : 0), 0);
    if (sx * sx + sz * sz > rx * rx + rz * rz + 1e-6) {
      for (let i = 0; i < 6; i++) e[i] = e2[i];
      rx = sx; rz = sz; ry = uy + dy2;
    }
  }
  ent.x = (e[0] + e[3]) / 2; ent.y = e[1]; ent.z = (e[2] + e[5]) / 2;
  return { hx: rx !== dx || rz !== dz, hxX: rx !== dx, hxZ: rz !== dz, hy, ground, rx, ry, rz };
}

// État des fluides autour de l'entité
export function fluidState(world, ent) {
  const hw = ent.w / 2 - 0.001;
  let water = false, lava = false, eyeWater = false, eyeLava = false, waterTop = -1;
  const x0 = Math.floor(ent.x - hw), x1 = Math.floor(ent.x + hw);
  const y0 = Math.floor(ent.y + 0.01), y1 = Math.floor(ent.y + ent.h - 0.01);
  const z0 = Math.floor(ent.z - hw), z1 = Math.floor(ent.z + hw);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
    const id = world.getBlock(x, y, z);
    const f = B_FLUID[id] || (B_WATERLOGGED[id] ? 1 : 0);
    if (!f) continue;
    const m = world.getMeta(x, y, z);
    const h = (m >= 8 || B_WATERLOGGED[id]) ? 1 : m === 0 ? 0.889 : (8 - m) / 9;
    if (ent.y < y + h) { if (f === 1) { water = true; waterTop = Math.max(waterTop, y + h); } else lava = true; }
  }
  const ey = ent.y + (ent.eyeHeight || ent.h * 0.85);
  const ex = Math.floor(ent.x), ez = Math.floor(ent.z), eyY = Math.floor(ey);
  const eid = world.getBlock(ex, eyY, ez);
  const ef = B_FLUID[eid] || (B_WATERLOGGED[eid] ? 1 : 0);
  if (ef) {
    const m = world.getMeta(ex, eyY, ez);
    const h = (m >= 8 || B_WATERLOGGED[eid]) ? 1 : m === 0 ? 0.889 : (8 - m) / 9;
    if (ey < eyY + h) { if (ef === 1) eyeWater = true; else eyeLava = true; }
  }
  return { water, lava, eyeWater, eyeLava, waterTop };
}

// Bloc dans lequel se trouve l'entité (pour échelles, toiles, etc.)
export function blocksInside(world, ent, fn) {
  const hw = ent.w / 2 - 0.001;
  for (let x = Math.floor(ent.x - hw); x <= Math.floor(ent.x + hw); x++)
    for (let z = Math.floor(ent.z - hw); z <= Math.floor(ent.z + hw); z++)
      for (let y = Math.floor(ent.y); y <= Math.floor(ent.y + ent.h - 0.01); y++) {
        const id = world.getBlock(x, y, z);
        if (id) fn(BLOCKS[id], x, y, z, id);
      }
}

// Lancer de rayon voxel (DDA) — renvoie le bloc visé et la face
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
  if (!isFinite(tmx)) tmx = Infinity; if (!isFinite(tmy)) tmy = Infinity; if (!isFinite(tmz)) tmz = Infinity;
  let face = -1, t = 0;
  for (let i = 0; i < 200; i++) {
    const id = world.getBlock(x, y, z);
    if (id) {
      const def = BLOCKS[id];
      if (def.fluid) {
        if (opts.fluids && (!opts.sourceOnly || world.getMeta(x, y, z) === 0)) return { x, y, z, face, id, dist: t, fluid: true };
      } else {
        const boxes = opts.selection(id, world.getMeta(x, y, z), world, x, y, z);
        if (boxes) {
          let best = null;
          for (const b of boxes) {
            const r = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
            if (r && r.t <= maxDist && (!best || r.t < best.t)) best = r;
          }
          if (best) return { x, y, z, face: best.face, id, dist: best.t, hit: [ox + dx * best.t, oy + dy * best.t, oz + dz * best.t] };
        }
      }
    }
    if (tmx < tmy && tmx < tmz) { if (tmx > maxDist) break; x += sx; t = tmx; tmx += tdx; face = sx > 0 ? 1 : 0; }
    else if (tmy < tmz) { if (tmy > maxDist) break; y += sy; t = tmy; tmy += tdy; face = sy > 0 ? 3 : 2; }
    else { if (tmz > maxDist) break; z += sz; t = tmz; tmz += tdz; face = sz > 0 ? 5 : 4; }
    if (y < -1 || y > HEIGHT + 1) break;
  }
  return null;
}

export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const ax = [[ox, dx, x0, x1, 1, 0], [oy, dy, y0, y1, 3, 2], [oz, dz, z0, z1, 5, 4]];
  for (const [o, d, a, b, fn, fp] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d;
    let f1 = fn, f2 = fp;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; f1 = fp; f2 = fn; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), face };
}

export function aabbIntersects(a, b) {
  return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
}
