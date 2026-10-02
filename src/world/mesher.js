// Maillage des sections 16x16x16 : faces cachées, lumière lissée + occlusion ambiante,
// modèles à éléments, plantes en croix et fluides (hauteurs aux coins comme Minecraft).
import {
  BLOCKS, B_OPAQUE, B_RENDER, B_SHAPE, B_FLUID, B_WATERLOGGED, FACING_FACE,
} from '../blocks/blocks.js';
import { tileIndex } from '../gfx/textures.js';

export const PW = 18;
export const PA = PW * PW;
export const PV = PA * PW;
export const pidx = (x, y, z) => (y + 1) * PA + (z + 1) * PW + (x + 1);

const OFF = [1, -1, PA, -PA, PW, -PW];
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// Sommets des faces (BL, BR, TR, TL) en coordonnées 0/1
const FACE_V = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const FACE_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];
const AXES = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]]; // axes tangents par face

// Drapeaux de sommets (aFlags)
export const F_LEAVES = 1, F_PLANT = 2, F_LAVA = 8, F_FIRE = 16, F_UNDERWATER = 32, F_SEAPLANT = 64, F_CUTOUT = 128;
export const T_WATER = 1, T_GLASS = 2, T_PORTAL = 4, T_ENDPORTAL = 8, T_TOP = 16, T_FALL = 32;

class Buf {
  constructor() { this.cap = 0; this.n = 0; this.ni = 0; this.grow(8192); }
  grow(c) {
    const o = this;
    const np = new Int16Array(c * 3), nn = new Int8Array(c * 3), nu = new Uint16Array(c * 2), nt = new Uint16Array(c),
      nf = new Uint8Array(c), nl = new Uint8Array(c * 4), nc = new Uint8Array(c * 4), ni = new Uint32Array(Math.ceil(c * 1.5));
    if (o.cap) { np.set(o.pos); nn.set(o.nor); nu.set(o.uv); nt.set(o.tile); nf.set(o.flags); nl.set(o.light); nc.set(o.col); ni.set(o.idx); }
    o.pos = np; o.nor = nn; o.uv = nu; o.tile = nt; o.flags = nf; o.light = nl; o.col = nc; o.idx = ni; o.cap = c;
  }
  reset() { this.n = 0; this.ni = 0; }
  v(x, y, z, nx, ny, nz, u, v, tile, flags, sky, blk, ao, sway, r, g, b, a) {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    const i = this.n++;
    this.pos[i * 3] = Math.round(x * 16); this.pos[i * 3 + 1] = Math.round(y * 16); this.pos[i * 3 + 2] = Math.round(z * 16);
    this.nor[i * 3] = nx * 127; this.nor[i * 3 + 1] = ny * 127; this.nor[i * 3 + 2] = nz * 127;
    this.uv[i * 2] = Math.max(0, Math.min(65535, Math.round(u * 65535))); this.uv[i * 2 + 1] = Math.max(0, Math.min(65535, Math.round(v * 65535)));
    this.tile[i] = tile; this.flags[i] = flags;
    this.light[i * 4] = sky; this.light[i * 4 + 1] = blk; this.light[i * 4 + 2] = ao; this.light[i * 4 + 3] = sway;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    return i;
  }
  quad(flip) {
    if (this.ni + 6 > this.idx.length) { const ni = new Uint32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni; }
    const b = this.n - 4, I = this.idx;
    let k = this.ni;
    if (!flip) { I[k++] = b; I[k++] = b + 1; I[k++] = b + 2; I[k++] = b; I[k++] = b + 2; I[k++] = b + 3; }
    else { I[k++] = b + 1; I[k++] = b + 2; I[k++] = b + 3; I[k++] = b + 1; I[k++] = b + 3; I[k++] = b; }
    this.ni = k;
  }
  out() {
    if (!this.n) return null;
    const n = this.n;
    return {
      count: n,
      pos: this.pos.slice(0, n * 3), nor: this.nor.slice(0, n * 3), uv: this.uv.slice(0, n * 2), tile: this.tile.slice(0, n),
      flags: this.flags.slice(0, n), light: this.light.slice(0, n * 4), col: this.col.slice(0, n * 4),
      idx: n > 65535 ? this.idx.slice(0, this.ni) : Uint16Array.from(this.idx.subarray(0, this.ni)),
    };
  }
}

// ------------------------------------------------------- MODÈLES CUITS
const bakeCache = new Map();
function rotPoint(p, rot) {
  const a = (rot.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const o = rot.origin;
  let x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  if (rot.axis === 'y') { const nx = x * c + z * s, nz = -x * s + z * c; x = nx; z = nz; }
  else if (rot.axis === 'x') { const ny = y * c - z * s, nz = y * s + z * c; y = ny; z = nz; }
  else { const nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
  return [x + o[0], y + o[1], z + o[2]];
}
function rotDir(d, rot) { const p = rotPoint([d[0] + rot.origin[0], d[1] + rot.origin[1], d[2] + rot.origin[2]], rot); return [p[0] - rot.origin[0], p[1] - rot.origin[1], p[2] - rot.origin[2]]; }
function dirToFace(d) {
  let best = 0, bv = -2;
  for (let f = 0; f < 6; f++) { const v = d[0] * DIRS[f][0] + d[1] * DIRS[f][1] + d[2] * DIRS[f][2]; if (v > bv) { bv = v; best = f; } }
  return bv > 0.99 ? best : -1;
}
function autoUV(f, from, to) {
  switch (f) {
    case 0: return [16 - to[2], 16 - to[1], 16 - from[2], 16 - from[1]];
    case 1: return [from[2], 16 - to[1], to[2], 16 - from[1]];
    case 2: return [from[0], from[2], to[0], to[2]];
    case 3: return [from[0], 16 - to[2], to[0], 16 - from[2]];
    case 4: return [from[0], 16 - to[1], to[0], 16 - from[1]];
    default: return [16 - to[0], 16 - to[1], 16 - from[0], 16 - from[1]];
  }
}

export function bakeModel(def, meta, ctx) {
  const m = def.modelFn(meta, def, ctx, BLOCKS);
  const quads = [];
  const rotY = m.rotY ? { axis: 'y', angle: m.rotY, origin: [8, 8, 8] } : null;
  for (const el of m.els) {
    const { from, to } = el;
    for (let f = 0; f < 6; f++) {
      const fc = el.faces[f];
      if (!fc) continue;
      const verts = FACE_V[f].map((c) => {
        let p = [c[0] ? to[0] : from[0], c[1] ? to[1] : from[1], c[2] ? to[2] : from[2]];
        if (el.rot) p = rotPoint(p, el.rot);
        if (rotY) p = rotPoint(p, rotY);
        return [p[0] / 16, p[1] / 16, p[2] / 16];
      });
      let n = DIRS[f];
      if (el.rot) n = rotDir(n, el.rot);
      if (rotY) n = rotDir(n, rotY);
      const uvr = fc.uv || autoUV(f, from, to);
      const uv = [[uvr[0] / 16, uvr[3] / 16], [uvr[2] / 16, uvr[3] / 16], [uvr[2] / 16, uvr[1] / 16], [uvr[0] / 16, uvr[1] / 16]];
      let cull = -1;
      if (fc.cull) { cull = dirToFace(n); }
      quads.push({ verts, n, uv, tile: tileIndex(fc.t), cull, tint: fc.tint, emissive: el.emissive });
    }
  }
  return quads;
}

function getBaked(def, meta, ctx) {
  if (def.modelFn.dynamic) return bakeModel(def, meta, ctx);
  const key = def.id * 256 + meta;
  let q = bakeCache.get(key);
  if (!q) { q = bakeModel(def, meta, ctx); bakeCache.set(key, q); }
  return q;
}

// tuiles par face pour les cubes, mises en cache
const cubeTiles = [];
function faceTiles(def) {
  let t = cubeTiles[def.id];
  if (!t) {
    t = def.tex.map((n) => tileIndex(n));
    t.front = def.texFront ? tileIndex(def.texFront) : -1;
    cubeTiles[def.id] = t;
  }
  return t;
}

// teintes constantes
const TINT_CONST = { 4: [97, 153, 97], 5: [128, 167, 85], 6: [32, 128, 48] };

const solid = new Buf();
const trans = new Buf();

function fluidH(level) { return level >= 8 ? 1 : level === 0 ? 0.889 : (8 - level) / 9; }

// ================================================================ MAILLAGE
export function meshSection(inp) {
  const { blocks, meta, light, grass, foliage, water, wx, wy, wz } = inp;
  solid.reset(); trans.reset();
  const ctxObj = {
    px: 0, py: 0, pz: 0, hash: 0,
    id(dx, dy, dz) { return blocks[pidx(this.px + dx, this.py + dy, this.pz + dz)]; },
    meta(dx, dy, dz) { return meta[pidx(this.px + dx, this.py + dy, this.pz + dz)]; },
  };

  const lightAt = (i) => light[i];
  const sky = (l) => l >> 4, blk = (l) => l & 15;

  for (let y = 0; y < 16; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const pi = pidx(x, y, z);
        const id = blocks[pi];
        if (id === 0) continue;
        const shape = B_SHAPE[id];
        const def = BLOCKS[id];
        const m = meta[pi];
        const col = z * 16 + x;
        // couleur de teinte
        let tr = 255, tg = 255, tb = 255;
        if (def.tint === 1) { tr = grass[col * 3]; tg = grass[col * 3 + 1]; tb = grass[col * 3 + 2]; }
        else if (def.tint === 2) { tr = foliage[col * 3]; tg = foliage[col * 3 + 1]; tb = foliage[col * 3 + 2]; }
        else if (def.tint === 3) { tr = water[col * 3]; tg = water[col * 3 + 1]; tb = water[col * 3 + 2]; }
        else if (def.tint >= 4) { const c = TINT_CONST[def.tint]; tr = c[0]; tg = c[1]; tb = c[2]; }

        if (shape === 1) cube(pi, x, y, z, id, def, m, tr, tg, tb);
        else if (shape === 2) cross(pi, x, y, z, id, def, m, tr, tg, tb);
        else if (shape === 3) {
          ctxObj.px = x; ctxObj.py = y; ctxObj.pz = z;
          ctxObj.hash = hashPos(wx + x, wy + y, wz + z);
          model(pi, x, y, z, id, def, m, tr, tg, tb, ctxObj);
        } else if (shape === 4) fluid(pi, x, y, z, id, def, m, tr, tg, tb);
        if (B_WATERLOGGED[id]) {
          const wc = z * 16 + x;
          fluid(pi, x, y, z, BLOCK_WATER, BLOCKS[BLOCK_WATER], 0, water[wc * 3], water[wc * 3 + 1], water[wc * 3 + 2]);
        }
      }
    }
  }

  function cube(pi, x, y, z, id, def, m, tr, tg, tb) {
    const ren = B_RENDER[id];
    const buf = ren === 3 ? trans : solid;
    const tiles = faceTiles(def);
    const cutout = ren === 2;
    let flagsBase = cutout ? F_CUTOUT : 0;
    if (def.wave === 1) flagsBase |= F_LEAVES;
    const axis = def.axis ? (m & 3) : 0;
    const frontFace = def.facing ? FACING_FACE[m & 3] : -1;
    const isFluidCull = def.cullSame;
    for (let f = 0; f < 6; f++) {
      const ni = pi + OFF[f];
      const nb = blocks[ni];
      if (B_OPAQUE[nb]) continue;
      if (isFluidCull && nb === id) continue;
      if (ren === 3 && B_RENDER[nb] === 3 && BLOCKS[nb].shape === 'cube' && (nb === id || id === BLOCK_ICE)) continue;
      // tuile
      let tile, rot = 0;
      if (axis === 0) tile = f === frontFace ? tiles.front : tiles[f];
      else if (axis === 1) { // axe X
        if (f <= 1) tile = tiles[2]; else { tile = tiles[0]; rot = 1; }
      } else { // axe Z
        if (f >= 4) tile = tiles[2]; else { tile = tiles[0]; rot = f <= 1 ? 1 : 0; }
      }
      let flags = flagsBase;
      if (B_FLUID[nb] === 1 || B_WATERLOGGED[nb]) flags |= F_UNDERWATER;
      if (ren === 3) flags = def.fluid ? T_WATER : T_GLASS;
      emitFace(buf, pi, ni, x, y, z, f, tile, rot, flags, tr, tg, tb, !cutout || def.wave === 1);
    }
  }

  function emitFace(buf, pi, ni, x, y, z, f, tile, rot, flags, tr, tg, tb, doAO) {
    const [a1, a2] = AXES[f];
    const d = DIRS[f];
    const verts = FACE_V[f];
    const nx = d[0], ny = d[1], nz = d[2];
    const lsky = [0, 0, 0, 0], lblk = [0, 0, 0, 0], aos = [0, 0, 0, 0];
    const nl = lightAt(ni);
    for (let k = 0; k < 4; k++) {
      const v = verts[k];
      const s1o = v[a1] ? 1 : -1, s2o = v[a2] ? 1 : -1;
      const o1 = a1 === 0 ? s1o : a1 === 1 ? s1o * PA : s1o * PW;
      const o2 = a2 === 0 ? s2o : a2 === 1 ? s2o * PA : s2o * PW;
      const c1 = ni + o1, c2 = ni + o2, c3 = ni + o1 + o2;
      const op1 = B_OPAQUE[blocks[c1]], op2 = B_OPAQUE[blocks[c2]], op3 = B_OPAQUE[blocks[c3]];
      let ss = sky(nl), sb = blk(nl), cnt = 1;
      if (!op1) { const l = lightAt(c1); ss += sky(l); sb += blk(l); cnt++; }
      if (!op2) { const l = lightAt(c2); ss += sky(l); sb += blk(l); cnt++; }
      if (!op3 && !(op1 && op2)) { const l = lightAt(c3); ss += sky(l); sb += blk(l); cnt++; }
      lsky[k] = ss / cnt; lblk[k] = sb / cnt;
      aos[k] = doAO ? ((op1 && op2) ? 0 : 3 - (op1 + op2 + op3)) : 3;
    }
    const flip = (aos[0] + aos[2] + (lsky[0] + lsky[2]) * 0.01) < (aos[1] + aos[3] + (lsky[1] + lsky[3]) * 0.01);
    for (let k = 0; k < 4; k++) {
      const v = verts[k];
      let uv = FACE_UV[k];
      if (rot) uv = [uv[1], 1 - uv[0]];
      buf.v(x + v[0], y + v[1], z + v[2], nx, ny, nz, uv[0], uv[1], tile, flags,
        lsky[k] * 17, lblk[k] * 17, aos[k] * 85, 0, tr, tg, tb, 255);
    }
    buf.quad(flip);
  }

  function cross(pi, x, y, z, id, def, m, tr, tg, tb) {
    const l = lightAt(pi);
    const s = sky(l) * 17, b = blk(l) * 17;
    const h = hashPos(wx + x, wy + y, wz + z);
    let ox = 0, oz = 0;
    if (def.wave === 2 && !def.tall && !def.tallTop) { ox = ((h * 7.13) % 1 - 0.5) * 0.3; oz = ((h * 13.7) % 1 - 0.5) * 0.3; }
    const tile = tileIndex(def.tex[0]);
    let flags = F_CUTOUT;
    let swayB = 0, swayT = 0;
    if (def.wave === 2) { flags |= F_PLANT; swayB = def.tallTop ? 120 : 0; swayT = def.tall ? 120 : 255; }
    else if (def.wave === 3) { flags |= F_SEAPLANT; swayB = id === BLOCK_KELP_PLANT || id === BLOCK_KELP ? 140 : 0; swayT = 255; }
    if (def.waterlogged) flags |= F_UNDERWATER;
    const a = 0.1464, bb = 0.8536; // 2.34/16 .. 13.66/16
    const quads = [
      [[a, bb], [bb, a]], [[a, a], [bb, bb]],
    ];
    const hgt = 1;
    for (const [[x0, z0], [x1, z1]] of quads) {
      const nxv = z1 - z0, nzv = -(x1 - x0);
      const len = Math.hypot(nxv, nzv);
      for (let side = 0; side < 2; side++) {
        const sx0 = side ? x1 : x0, sz0 = side ? z1 : z0, sx1 = side ? x0 : x1, sz1 = side ? z0 : z1;
        const nn = side ? -1 : 1;
        // normale orientée vers le haut pour un éclairage doux des plantes
        const NX = (nxv / len) * nn * 0.6, NZ = (nzv / len) * nn * 0.6, NY = 0.8;
        buf2(solid, x + sx0 + ox, y, z + sz0 + oz, NX, NY, NZ, 0, 1, tile, flags, s, b, 255, swayB, tr, tg, tb);
        buf2(solid, x + sx1 + ox, y, z + sz1 + oz, NX, NY, NZ, 1, 1, tile, flags, s, b, 255, swayB, tr, tg, tb);
        buf2(solid, x + sx1 + ox, y + hgt, z + sz1 + oz, NX, NY, NZ, 1, 0, tile, flags, s, b, 255, swayT, tr, tg, tb);
        buf2(solid, x + sx0 + ox, y + hgt, z + sz0 + oz, NX, NY, NZ, 0, 0, tile, flags, s, b, 255, swayT, tr, tg, tb);
        solid.quad(false);
      }
    }
  }

  function buf2(buf, X, Y, Z, nx, ny, nz, u, v, tile, flags, s, b, ao, sway, tr, tg, tb) {
    buf.v(X, Y, Z, nx, ny, nz, u, v, tile, flags, s, b, ao, sway, tr, tg, tb, 255);
  }

  function model(pi, x, y, z, id, def, m, tr, tg, tb, ctx) {
    const quads = getBaked(def, m, ctx);
    const ren = B_RENDER[id];
    const buf = ren === 3 ? trans : solid;
    const own = lightAt(pi);
    let baseFlags = ren === 2 ? F_CUTOUT : 0;
    if (def.wave === 1) baseFlags |= F_LEAVES;
    if (def.key === 'fire' || def.key === 'soul_fire') baseFlags |= F_FIRE;
    if (ren === 3) baseFlags = def.portal === 'nether' ? T_PORTAL : def.portal === 'end' ? T_ENDPORTAL : T_GLASS;
    for (const q of quads) {
      let l = own;
      if (q.cull >= 0) {
        const nb = blocks[pi + OFF[q.cull]];
        if (B_OPAQUE[nb]) continue;
        l = lightAt(pi + OFF[q.cull]);
      } else if (B_OPAQUE[id]) {
        l = lightAt(pi + PA);
      }
      let s = sky(l), b = blk(l);
      if (def.lightEmit) b = Math.max(b, def.lightEmit);
      const r = q.tint ? tr : 255, g = q.tint ? tg : 255, bl = q.tint ? tb : 255;
      let flags = baseFlags;
      for (let k = 0; k < 4; k++) {
        const v = q.verts[k];
        buf.v(x + v[0], y + v[1], z + v[2], q.n[0], q.n[1], q.n[2], q.uv[k][0], q.uv[k][1], q.tile, flags,
          s * 17, b * 17, 255, def.wave === 1 ? 255 : 0, r, g, bl, 255);
      }
      buf.quad(false);
    }
  }

  function fluid(pi, x, y, z, id, def, m, tr, tg, tb) {
    const isWater = B_FLUID[id] === 1;
    const same = (nid) => (isWater ? (B_FLUID[nid] === 1 || B_WATERLOGGED[nid]) : B_FLUID[nid] === 2);
    const lvl = (i) => (B_WATERLOGGED[blocks[i]] ? 0 : meta[i]);
    const aboveSame = same(blocks[pi + PA]);
    // hauteurs aux 4 coins
    const cornerH = (cx, cz) => {
      let sum = 0, w = 0;
      for (let dz = cz - 1; dz <= cz; dz++) for (let dx = cx - 1; dx <= cx; dx++) {
        const i = pi + dx + dz * PW;
        const nid = blocks[i];
        if (same(nid)) {
          if (same(blocks[i + PA])) return 1;
          const lv = lvl(i);
          const h = fluidH(lv);
          const wt = lv === 0 || lv >= 8 ? 10 : 1;
          sum += h * wt; w += wt;
        } else if (!B_OPAQUE[nid] && !B_FLUID[nid]) { w += 1; }
      }
      return w ? sum / w : fluidH(m);
    };
    let h00, h10, h01, h11;
    if (aboveSame) { h00 = h10 = h01 = h11 = 1; }
    else { h00 = cornerH(0, 0); h10 = cornerH(1, 0); h01 = cornerH(0, 1); h11 = cornerH(1, 1); }
    const buf = isWater ? trans : solid;
    const fx = (h00 + h01) - (h10 + h11), fz = (h00 + h10) - (h01 + h11);
    const flen = Math.hypot(fx, fz);
    const ang = flen > 0.001 ? Math.atan2(fz, fx) : 0;
    const angB = Math.round(((ang / (Math.PI * 2)) + 1) % 1 * 255);
    const speed = Math.min(255, Math.round(flen * 300));
    const tile = tileIndex(def.tex[0]);
    const baseFlags = isWater ? T_WATER : F_LAVA;
    const own = lightAt(pi);
    const emitQ = (vs, nx, ny, nz, l, flags, spd, an) => {
      const s = sky(l) * 17, b = Math.max(blk(l), isWater ? 0 : 15) * 17;
      for (let k = 0; k < 4; k++) {
        const v = vs[k];
        buf.v(x + v[0], y + v[1], z + v[2], nx, ny, nz, v[3], v[4], tile, flags, s, b, 255, spd, tr, tg, tb, an);
      }
      buf.quad(false);
    };
    // dessus
    const up = blocks[pi + PA];
    if (!aboveSame && !(B_OPAQUE[up] && h00 === 1)) {
      const l = Math.max(own, lightAt(pi + PA));
      const fl = baseFlags | (isWater ? T_TOP : 0);
      emitQ([[0, h01, 1, 0, 1], [1, h11, 1, 1, 1], [1, h10, 0, 1, 0], [0, h00, 0, 0, 0]], 0, 1, 0, l, fl, speed, angB);
      if (isWater) // face inférieure de la surface (vue sous l'eau)
        emitQ([[0, h00, 0, 0, 0], [1, h10, 0, 1, 0], [1, h11, 1, 1, 1], [0, h01, 1, 0, 1]], 0, -1, 0, l, fl, speed, angB);
    }
    // dessous
    const dn = blocks[pi - PA];
    if (!same(dn) && !B_OPAQUE[dn]) emitQ([[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]], 0, -1, 0, lightAt(pi - PA), baseFlags, 0, 0);
    // côtés
    const sides = [
      [0, [[1, 0, 1], [1, 0, 0]], h11, h10, 1, 0, 0],
      [1, [[0, 0, 0], [0, 0, 1]], h00, h01, -1, 0, 0],
      [4, [[0, 0, 1], [1, 0, 1]], h01, h11, 0, 0, 1],
      [5, [[1, 0, 0], [0, 0, 0]], h10, h00, 0, 0, -1],
    ];
    for (const [f, [p0, p1], hA, hB, nx, ny, nz] of sides) {
      const ni = pi + OFF[f];
      const nb = blocks[ni];
      if (same(nb) || B_OPAQUE[nb]) continue;
      const l = Math.max(own, lightAt(ni));
      const fl = baseFlags | (isWater ? T_FALL : 0);
      emitQ([[p0[0], 0, p0[2], 0, 1], [p1[0], 0, p1[2], 1, 1], [p1[0], hB, p1[2], 1, 1 - hB], [p0[0], hA, p0[2], 0, 1 - hA]], nx, ny, nz, l, fl, 200, 0);
      if (isWater) emitQ([[p1[0], 0, p1[2], 1, 1], [p0[0], 0, p0[2], 0, 1], [p0[0], hA, p0[2], 0, 1 - hA], [p1[0], hB, p1[2], 1, 1 - hB]], -nx, -ny, -nz, l, fl, 200, 0);
    }
  }

  return { solid: solid.out(), trans: trans.out() };
}

export function hashPos(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let BLOCK_WATER = 0, BLOCK_ICE = 0, BLOCK_KELP = 0, BLOCK_KELP_PLANT = 0;
for (const b of BLOCKS) {
  if (b.key === 'water') BLOCK_WATER = b.id;
  if (b.key === 'ice') BLOCK_ICE = b.id;
  if (b.key === 'kelp') BLOCK_KELP = b.id;
  if (b.key === 'kelp_plant') BLOCK_KELP_PLANT = b.id;
}
