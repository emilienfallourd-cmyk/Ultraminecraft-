// Génération procédurale des textures de blocs (32x32, style Minecraft "HD")
// Chaque tuile produit : albédo (sRGB + alpha), hauteur (normal map), lissé (spéculaire), émissif.
import { mulberry32, RNG } from '../util/noise.js';
import { COLOR_KEYS, CORAL_KEYS, FLOWER_KEYS } from '../blocks/blocks.js';

export const S = 32;
const N = S * S;

export const TILE_INDEX = Object.create(null);
export const TILE_NAMES = [];
const PAINTERS = new Map();

const hex = (h) => {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap = (v) => ((v % S) + S) % S;

class PNoise {
  constructor(seed) { this.r = mulberry32(seed); this.g = {}; }
  grid(p) {
    let g = this.g[p];
    if (!g) { g = this.g[p] = new Float32Array(p * p); for (let i = 0; i < p * p; i++) g[i] = this.r(); }
    return g;
  }
  at(x, y, p) {
    const g = this.grid(p);
    const fx = (x / S) * p, fy = (y / S) * p;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  // bruit anisotrope (périodes différentes en x et y)
  at2(x, y, px, py) {
    const key = 'a' + px + '_' + py;
    let g = this.g[key];
    if (!g) { g = this.g[key] = new Float32Array(px * py); for (let i = 0; i < px * py; i++) g[i] = this.r(); }
    const fx = (x / S) * px, fy = (y / S) * py;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const idx = (xx, yy) => (((yy % py) + py) % py) * px + (((xx % px) + px) % px);
    const a = g[idx(ix, iy)], b = g[idx(ix + 1, iy)], c = g[idx(ix, iy + 1)], d = g[idx(ix + 1, iy + 1)];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  fbm(x, y, p0 = 4, oct = 3) {
    let s = 0, a = 1, n = 0, p = p0;
    for (let i = 0; i < oct; i++) { s += this.at(x, y, p) * a; n += a; a *= 0.5; p *= 2; if (p > S) p = S; }
    return s / n;
  }
}

class Tile {
  constructor(name, seed) {
    this.name = name;
    this.c = new Float32Array(N * 4);
    this.h = new Float32Array(N).fill(0.5);
    this.sm = new Float32Array(N).fill(0.1);
    this.em = new Float32Array(N);
    this.rng = new RNG(seed);
    this.seed = seed;
    this._n = [];
    this.normalStrength = 1;
    this.flatNormal = false;
  }
  n(k = 0) { return this._n[k] || (this._n[k] = new PNoise(this.seed * 31 + k * 7919 + 13)); }
  r() { return this.rng.next(); }
  set(x, y, col, a = 1) {
    x = wrap(Math.round(x)); y = wrap(Math.round(y));
    const i = (y * S + x) * 4;
    this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2]; this.c[i + 3] = a;
  }
  setH(x, y, v) { this.h[wrap(Math.round(y)) * S + wrap(Math.round(x))] = v; }
  setS(x, y, v) { this.sm[wrap(Math.round(y)) * S + wrap(Math.round(x))] = v; }
  setE(x, y, v) { this.em[wrap(Math.round(y)) * S + wrap(Math.round(x))] = v; }
  get(x, y) { const i = (wrap(Math.round(y)) * S + wrap(Math.round(x))) * 4; return [this.c[i], this.c[i + 1], this.c[i + 2], this.c[i + 3]]; }
  getA(x, y) { return this.c[(wrap(Math.round(y)) * S + wrap(Math.round(x))) * 4 + 3]; }
  getH(x, y) { return this.h[wrap(Math.round(y)) * S + wrap(Math.round(x))]; }
  clear() { this.c.fill(0); this.h.fill(0.5); }
  each(fn) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fn(x, y); }
  // pixel avec teinte de biome (alpha 0.62 = masque de teinte)
  tint(x, y, col) { this.set(x, y, col, 0.62); }
  copyFrom(o) { this.c.set(o.c); this.h.set(o.h); this.sm.set(o.sm); this.em.set(o.em); }
  fill(col, a = 1) { this.each((x, y) => this.set(x, y, col, a)); }
  rect(x0, y0, x1, y1, col, a = 1, h) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { this.set(x, y, col, a); if (h !== undefined) this.setH(x, y, h); }
  }
  shadePix(x, y, f) { const c = this.get(x, y); this.set(x, y, mul(c, f), c[3]); }
}

function P(name, fn) { PNAMES.push(name); PAINTERS.set(name, fn); }
const PNAMES = [];

// Choisit une couleur dans une palette selon v (0..1)
function pal(colors, v) {
  const i = Math.max(0, Math.min(colors.length - 1, Math.floor(v * colors.length)));
  return colors[i];
}
const palette = (base, n = 5, spread = 0.28) => {
  const b = hex(base), out = [];
  for (let i = 0; i < n; i++) out.push(mul(b, 1 - spread / 2 + (spread * i) / (n - 1)));
  return out;
};

// ---------------------------------------------------------------- MOTIFS
function noisy(t, base, o = {}) {
  const pl = o.pal || palette(base, o.steps || 5, o.spread || 0.3);
  const p0 = o.p || 4, oct = o.oct || 3, jit = o.jitter !== undefined ? o.jitter : 0.18;
  t.each((x, y) => {
    let v = t.n(o.k || 0).fbm(x, y, p0, oct);
    v = clamp01((v - 0.5) * (o.contrast || 1.6) + 0.5 + (t.r() - 0.5) * jit);
    t.set(x, y, pal(pl, v));
    t.setH(x, y, 0.35 + v * 0.4);
    t.setS(x, y, o.smooth !== undefined ? o.smooth : 0.12);
  });
}

function speckle(t, cols, density, o = {}) {
  t.each((x, y) => {
    if (t.r() < density) {
      t.set(x, y, cols[Math.floor(t.r() * cols.length)]);
      t.setH(x, y, o.h !== undefined ? o.h : t.getH(x, y) + (o.dh || 0.1));
      if (o.smooth !== undefined) t.setS(x, y, o.smooth);
    }
  });
}

function voronoiPts(t, count, jitter = 1) {
  const pts = [];
  const g = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const gx = i % g, gy = Math.floor(i / g);
    pts.push([((gx + 0.5 + (t.r() - 0.5) * jitter) * S) / g, ((gy + 0.5 + (t.r() - 0.5) * jitter) * S) / g, t.r()]);
  }
  return pts;
}
function voronoiAt(pts, x, y) {
  let d1 = 1e9, d2 = 1e9, best = 0;
  for (let i = 0; i < pts.length; i++) {
    let dx = Math.abs(x - pts[i][0]); if (dx > S / 2) dx = S - dx;
    let dy = Math.abs(y - pts[i][1]); if (dy > S / 2) dy = S - dy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
  }
  return [best, d1, d2];
}

function cobble(t, base, o = {}) {
  const pts = voronoiPts(t, o.count || 14, 0.9);
  const pl = o.pal || palette(base, 6, 0.5);
  const mortar = o.mortar ? hex(o.mortar) : mul(hex(base), 0.5);
  t.each((x, y) => {
    const [i, d1, d2] = voronoiAt(pts, x + 0.5, y + 0.5);
    const edge = d2 - d1;
    if (edge < (o.gap || 1.3)) {
      t.set(x, y, mix(mortar, mul(mortar, 0.8), t.r()));
      t.setH(x, y, 0.1);
    } else {
      const s = pts[i][2];
      const shade = clamp01(s * 0.7 + t.n(1).at(x, y, 8) * 0.4 - d1 / 30 + 0.1 + (t.r() - 0.5) * 0.15);
      t.set(x, y, pal(pl, shade));
      t.setH(x, y, 0.45 + Math.min(edge, 5) / 10);
    }
    t.setS(x, y, o.smooth || 0.1);
  });
}

function bricks(t, o) {
  const rows = o.rows || 4, rh = S / rows;
  const bw = o.bw || 16, mortar = hex(o.mortar), pl = o.pal || palette(o.base, 5, 0.35);
  const mw = o.mw || 2;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (o.offset !== undefined ? o.offset : bw / 2);
    const shades = [];
    for (let b = 0; b < S / bw + 1; b++) shades.push(t.r());
    for (let y = r * rh; y < (r + 1) * rh; y++) {
      for (let x = 0; x < S; x++) {
        const lx = wrap(x - off) % bw, ly = y - r * rh;
        const bi = Math.floor(wrap(x - off) / bw);
        if (ly >= rh - mw || lx >= bw - mw) {
          t.set(x, y, mix(mortar, mul(mortar, 0.85), t.r()));
          t.setH(x, y, 0.15);
        } else {
          let v = clamp01(shades[bi] * 0.5 + t.n(0).fbm(x, y, 8, 2) * 0.5 + (t.r() - 0.5) * 0.2);
          let c = pal(pl, v);
          if (o.bevel) {
            if (ly === 0 || lx === 0) c = mul(c, 1.12);
            else if (ly === rh - mw - 1 || lx === bw - mw - 1) c = mul(c, 0.82);
          }
          t.set(x, y, c);
          t.setH(x, y, 0.6 + v * 0.15 - (ly === 0 || lx === 0 ? 0.05 : 0));
        }
        t.setS(x, y, o.smooth || 0.12);
      }
    }
  }
}

function planks(t, base, o = {}) {
  const pl = palette(base, 6, 0.32);
  const dark = mul(hex(base), 0.55);
  const rows = 4, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const seam = Math.floor(t.r() * S);
    const tone = (t.r() - 0.5) * 0.25;
    for (let y = r * rh; y < (r + 1) * rh; y++) {
      for (let x = 0; x < S; x++) {
        const ly = y - r * rh;
        const grain = t.n(r).at2(x, y * 1.0, 2, 16) * 0.6 + t.n(9).at2(x, y, 4, 32) * 0.4;
        let v = clamp01(grain + tone + (t.r() - 0.5) * 0.12);
        let c = pal(pl, v);
        let h = 0.5 + v * 0.2;
        if (ly === rh - 1) { c = mix(dark, c, 0.25); h = 0.15; }
        else if (ly === 0) { c = mul(c, 1.06); }
        if (x === seam) { c = mix(dark, c, 0.35); h = 0.2; }
        t.set(x, y, c); t.setH(x, y, h); t.setS(x, y, o.smooth || 0.18);
      }
    }
  }
}

function logSide(t, base, o = {}) {
  const pl = palette(base, 6, o.spread || 0.55);
  t.each((x, y) => {
    const v = t.n(0).at2(x, y, 16, 2) * 0.7 + t.n(1).at2(x, y, 32, 8) * 0.3;
    let c = pal(pl, clamp01(v + (t.r() - 0.5) * 0.15));
    let h = 0.4 + v * 0.4;
    const furrow = t.n(2).at2(x, y, 8, 1);
    if (furrow < 0.3) { c = mul(c, 0.72); h -= 0.25; }
    t.set(x, y, c); t.setH(x, y, h); t.setS(x, y, 0.08);
  });
  t.normalStrength = 1.6;
}

function logTop(t, bark, inner, o = {}) {
  const pi = palette(inner, 4, 0.3), pb = palette(bark, 4, 0.4);
  t.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5;
    const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + Math.sqrt(dx * dx + dy * dy) * 0.4;
    if (d > 14.2) {
      t.set(x, y, pal(pb, t.r())); t.setH(x, y, 0.5);
    } else {
      const ring = (d + t.n(0).at(x, y, 4) * 1.6) / 2.6;
      const v = (Math.floor(ring) % 2 === 0 ? 0.65 : 0.35) + (t.r() - 0.5) * 0.12;
      t.set(x, y, pal(pi, clamp01(v))); t.setH(x, y, 0.55 + (v - 0.5) * 0.1);
    }
    t.setS(x, y, 0.12);
  });
}

function leaves(t, base, o = {}) {
  const pl = o.pal || [[118, 118, 118], [138, 138, 138], [160, 160, 160], [182, 182, 182], [205, 205, 205]];
  const col = o.color ? hex(o.color) : null;
  t.each((x, y) => {
    const v = t.n(0).fbm(x, y, 8, 2);
    const hole = t.n(1).at(x, y, 16) * 0.6 + t.r() * 0.4;
    if (hole < (o.holes || 0.27)) { t.set(x, y, [40, 60, 30], 0); t.setH(x, y, 0); return; }
    const leaf = t.n(2).at(x, y, 16);
    let s = clamp01(v * 0.6 + leaf * 0.5 + (t.r() - 0.5) * 0.25);
    const c = col ? mul(pal(palette(o.color, 5, 0.5), s), 1) : pal(pl, s);
    if (col) t.set(x, y, c); else t.tint(x, y, c);
    t.setH(x, y, 0.3 + s * 0.6);
    t.setS(x, y, 0.25);
  });
  // bords sombres des amas
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (t.getA(x, y) > 0 && t.getA(x, y + 1) === 0) t.shadePix(x, y, 0.82);
  }
  t.normalStrength = 2;
}

function oreOn(t, baseFn, oreCols, o = {}) {
  baseFn(t);
  const clusters = o.clusters || 5;
  for (let c = 0; c < clusters; c++) {
    const cx = Math.floor(t.r() * S), cy = Math.floor(t.r() * S);
    const size = (o.size || 6) + Math.floor(t.r() * 4);
    let x = cx, y = cy;
    const cells = [];
    for (let i = 0; i < size; i++) {
      cells.push([x, y]);
      const d = Math.floor(t.r() * 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
    }
    for (const [px, py] of cells) {
      // contour sombre
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        if (!cells.some(([qx, qy]) => qx === px + dx && qy === py + dy)) t.shadePix(px + dx, py + dy, 0.7);
      }
    }
    for (const [px, py] of cells) {
      const k = t.r();
      const col = k < 0.2 ? oreCols[2] || oreCols[0] : k < 0.6 ? oreCols[0] : oreCols[1];
      t.set(px, py, col);
      t.setH(px, py, 0.85);
      t.setS(px, py, o.smooth || 0.5);
      if (o.emit) t.setE(px, py, o.emit);
    }
  }
}

function crossPlant(t, draw) { t.clear(); t.each((x, y) => t.set(x, y, [60, 80, 40], 0)); draw(); t.flatNormal = true; }

function blade(t, x0, len, col, o = {}) {
  let x = x0;
  const lean = (t.r() - 0.5) * (o.lean || 0.6);
  for (let i = 0; i < len; i++) {
    const y = S - 1 - i;
    const xx = Math.round(x);
    const c = mul(col, 0.75 + (i / len) * 0.4);
    if (o.tint) t.tint(xx, y, c); else t.set(xx, y, c);
    if (o.wide && i < len * 0.6) { if (o.tint) t.tint(xx + 1, y, mul(c, 0.9)); else t.set(xx + 1, y, mul(c, 0.9)); }
    x += lean * (i / len);
  }
}

function flowerHead(t, cx, cy, petal, center, r = 3) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d <= r + 0.2 && (d > 1.2 || r < 2)) t.set(cx + x, cy + y, mul(petal, 0.85 + 0.25 * (1 - d / (r + 0.5)) + (t.r() - 0.5) * 0.1));
  }
  if (center) { t.set(cx, cy, center); t.set(cx + 1, cy, center); t.set(cx, cy + 1, center); t.set(cx + 1, cy + 1, mul(center, 0.85)); }
}

function stem(t, x, y0, y1, col) {
  for (let y = y0; y <= y1; y++) { t.set(x, y, mul(col, 0.9 + t.r() * 0.2)); t.set(x + 1, y, mul(col, 0.75)); }
}

function leafPair(t, x, y, col, dir) {
  for (let i = 0; i < 4; i++) { t.set(x + dir * (i + 1), y - Math.floor(i / 2), mul(col, 0.9 - i * 0.05)); t.set(x + dir * (i + 1), y - Math.floor(i / 2) + 1, mul(col, 0.75)); }
}

function frame(t, col, w = 1, o = {}) {
  for (let i = 0; i < S; i++) for (let k = 0; k < w; k++) {
    t.set(i, k, col); t.set(i, S - 1 - k, mul(col, o.dark || 0.85)); t.set(k, i, col); t.set(S - 1 - k, i, mul(col, o.dark || 0.85));
    t.setH(i, k, 0.8); t.setH(i, S - 1 - k, 0.8); t.setH(k, i, 0.8); t.setH(S - 1 - k, i, 0.8);
  }
}

// police pixel 3x5 pour TNT
const FONT = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '111', '101'] };
function text(t, str, x0, y0, col, scale = 2) {
  let x = x0;
  for (const ch of str) {
    const g = FONT[ch];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') t.rect(x + c * scale, y0 + r * scale, x + c * scale + scale, y0 + r * scale + scale, col, 1, 0.3);
    x += 4 * scale;
  }
}

// ============================================================ DÉFINITIONS
const STONE = (t) => {
  noisy(t, '#7d7d7d', { p: 4, oct: 3, spread: 0.3, contrast: 1.8 });
  t.each((x, y) => {
    const cr = Math.abs(t.n(5).at2(x, y, 4, 8) - 0.5);
    if (cr < 0.025) { t.shadePix(x, y, 0.78); t.setH(x, y, 0.2); }
  });
};
P('stone', STONE);
P('smooth_stone', (t) => { noisy(t, '#a0a0a0', { p: 8, spread: 0.12, contrast: 1 }); frame(t, hex('#7f7f7f'), 1, { dark: 0.9 }); });
const DEEPSLATE = (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).at2(x, y, 4, 16) * 0.65 + t.n(1).at(x, y, 16) * 0.35 + (t.r() - 0.5) * 0.15);
    t.set(x, y, pal(palette('#4d4d55', 5, 0.45), v)); t.setH(x, y, 0.3 + v * 0.5); t.setS(x, y, 0.15);
  });
};
P('deepslate', DEEPSLATE);
P('deepslate_top', (t) => {
  t.each((x, y) => {
    const dx = x - 16, dy = y - 16;
    const v = clamp01(Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.6 + t.n(0).at(x, y, 4) * 3) * 0.3 + 0.5 + (t.r() - 0.5) * 0.2);
    t.set(x, y, pal(palette('#4f4f57', 5, 0.4), v)); t.setH(x, y, 0.3 + v * 0.4);
  });
});
P('cobblestone', (t) => cobble(t, '#7a7a7a', { mortar: '#4a4a4a' }));
P('mossy_cobblestone', (t) => {
  cobble(t, '#7a7a7a', { mortar: '#4a4a4a' });
  t.each((x, y) => { const m = t.n(3).fbm(x, y, 4, 2); if (m > 0.55) t.set(x, y, pal(palette('#5c7a33', 4, 0.4), clamp01((m - 0.55) * 3 + t.r() * 0.3))); });
});
P('cobbled_deepslate', (t) => cobble(t, '#505058', { mortar: '#26262b', count: 16 }));
P('bedrock', (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 4, 3) * 1.4 - 0.2 + (t.r() - 0.5) * 0.3);
    t.set(x, y, pal([[30, 30, 30], [58, 58, 58], [85, 85, 85], [115, 115, 115], [150, 150, 150]], v)); t.setH(x, y, v);
  });
  t.normalStrength = 2;
});
P('granite', (t) => { noisy(t, '#9a6c5b', { p: 8, spread: 0.3 }); speckle(t, [hex('#c19a87'), hex('#73483b'), hex('#b0827a')], 0.18); });
P('diorite', (t) => { noisy(t, '#bdbdbd', { p: 8, spread: 0.2 }); speckle(t, [hex('#ffffff'), hex('#7c7c7c'), hex('#5e5e5e')], 0.12); });
P('andesite', (t) => { noisy(t, '#878787', { p: 8, spread: 0.25 }); speckle(t, [hex('#a0a0a0'), hex('#6a6a6a')], 0.15); });
const polished = (base) => (t) => {
  noisy(t, base, { p: 8, spread: 0.12, contrast: 1, smooth: 0.35 });
  frame(t, mul(hex(base), 1.15), 1, { dark: 0.7 });
};
P('polished_granite', polished('#9a6c5b'));
P('polished_diorite', polished('#c4c4c6'));
P('polished_andesite', polished('#848686'));
P('tuff', (t) => { noisy(t, '#6c6d66', { p: 4, spread: 0.3 }); speckle(t, [hex('#8a8b80'), hex('#55574f')], 0.2); });
P('calcite', (t) => { noisy(t, '#dfe0dc', { p: 8, spread: 0.12 }); speckle(t, [hex('#c3c6c0'), hex('#f2f2f0')], 0.1); });
P('stone_bricks', (t) => bricks(t, { base: '#7b7b7b', mortar: '#4f4f4f', rows: 2, bw: 32, offset: 16, bevel: true, mw: 2 }));
P('mossy_stone_bricks', (t) => {
  bricks(t, { base: '#7b7b7b', mortar: '#4f4f4f', rows: 2, bw: 32, offset: 16, bevel: true, mw: 2 });
  t.each((x, y) => { const m = t.n(3).fbm(x, y, 4, 2) + (y > 14 ? 0.08 : 0); if (m > 0.55) t.set(x, y, pal(palette('#5a7a30', 4, 0.4), clamp01((m - 0.55) * 3 + t.r() * 0.3))); });
});
P('cracked_stone_bricks', (t) => {
  bricks(t, { base: '#767676', mortar: '#4c4c4c', rows: 2, bw: 32, offset: 16, bevel: true, mw: 2 });
  let x = 4 + t.r() * 8, y = 0;
  for (let i = 0; i < 40; i++) { t.set(x, y, [55, 55, 55]); t.setH(x, y, 0); x += Math.round(t.r() * 2 - 0.6); y += 1; if (y >= S) break; }
});
P('chiseled_stone_bricks', (t) => {
  noisy(t, '#7b7b7b', { p: 8, spread: 0.2 }); frame(t, hex('#9a9a9a'), 2, { dark: 0.55 });
  for (let r = 4; r <= 12; r += 4) for (let i = 16 - r; i < 16 + r; i++) {
    for (const [a, b] of [[i, 16 - r], [i, 15 + r], [16 - r, i], [15 + r, i]]) { t.set(a, b, mul(t.get(a, b), r === 8 ? 0.65 : 1.15)); t.setH(a, b, r === 8 ? 0.2 : 0.8); }
  }
});
P('bricks', (t) => bricks(t, { base: '#985a48', mortar: '#a9a59b', rows: 4, bw: 16, bevel: true, pal: [hex('#7e4535'), hex('#8e5040'), hex('#9c5947'), hex('#a8624f'), hex('#b4705b')] }));
P('deepslate_bricks', (t) => bricks(t, { base: '#4a4a50', mortar: '#2a2a2e', rows: 4, bw: 16, bevel: true }));
P('deepslate_tiles', (t) => bricks(t, { base: '#3e3e44', mortar: '#202024', rows: 4, bw: 8, offset: 0, bevel: true }));
P('reinforced_deepslate_side', (t) => { DEEPSLATE(t); frame(t, hex('#7e7357'), 3, { dark: 0.6 }); t.rect(14, 0, 18, 32, hex('#a39672'), 1, 0.8); });
P('reinforced_deepslate_top', (t) => { DEEPSLATE(t); frame(t, hex('#7e7357'), 3); t.rect(10, 10, 22, 22, hex('#3a3a40'), 1, 0.3); t.rect(13, 13, 19, 19, hex('#5ce1e6'), 1, 0.7); for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) t.setE(x, y, 0.5); });
const SAND = (base) => (t) => { noisy(t, base, { p: 8, oct: 2, spread: 0.16, jitter: 0.35 }); speckle(t, [mul(hex(base), 0.82), mul(hex(base), 1.08)], 0.08); };
P('sand', SAND('#dbcf9f'));
P('red_sand', SAND('#bf6a2c'));
const SANDSTONE = (base, red) => {
  P(red + 'sandstone', (t) => {
    t.each((x, y) => {
      const band = y < 4 ? 0.85 : y > 26 ? 0.92 : 1;
      const v = clamp01(t.n(0).at2(x, y, 4, 16) * 0.6 + 0.2 + (t.r() - 0.5) * 0.25);
      t.set(x, y, mul(pal(palette(base, 5, 0.18), v), band));
      t.setH(x, y, y === 4 || y === 26 ? 0.2 : 0.5 + v * 0.1);
    });
    for (let x = 0; x < S; x++) { t.set(x, 4, mul(hex(base), 0.72)); t.set(x, 26, mul(hex(base), 0.8)); }
  });
  P(red + 'sandstone_top', (t) => { noisy(t, base, { p: 8, spread: 0.12, jitter: 0.2 }); });
  P(red + 'sandstone_bottom', (t) => { noisy(t, base, { p: 4, spread: 0.2, jitter: 0.35 }); speckle(t, [mul(hex(base), 0.8)], 0.1); });
};
SANDSTONE('#d8cb94', '');
SANDSTONE('#b8612a', 'red_');
P('cut_sandstone', (t) => { noisy(t, '#d8cb94', { p: 8, spread: 0.1 }); frame(t, hex('#e3d8a5'), 2, { dark: 0.75 }); });
P('chiseled_sandstone', (t) => {
  noisy(t, '#d8cb94', { p: 8, spread: 0.1 });
  frame(t, hex('#c2b47c'), 2, { dark: 0.75 });
  const d = hex('#a8986a');
  t.rect(10, 6, 22, 9, d, 1, 0.2); t.rect(14, 9, 18, 26, d, 1, 0.2); t.rect(9, 14, 23, 17, d, 1, 0.2); t.rect(12, 21, 20, 23, d, 1, 0.2);
});
P('dirt', (t) => {
  noisy(t, '#7c5639', { p: 8, oct: 3, spread: 0.38, jitter: 0.3 });
  speckle(t, [hex('#5d3e27'), hex('#9a7454'), hex('#8c8278')], 0.05, { dh: 0.2 });
});
P('coarse_dirt', (t) => {
  noisy(t, '#6f4c33', { p: 8, oct: 3, spread: 0.4, jitter: 0.3 });
  speckle(t, [hex('#8b8178'), hex('#5a5550'), hex('#4b3220')], 0.14, { dh: 0.3 });
});
P('mud', (t) => { noisy(t, '#3c3837', { p: 8, spread: 0.2, smooth: 0.6 }); });
P('clay', (t) => { noisy(t, '#a0a6b4', { p: 8, spread: 0.12, smooth: 0.3 }); });
P('gravel', (t) => cobble(t, '#827b78', { count: 30, gap: 0.8, mortar: '#5e5654', pal: [hex('#5f5a58'), hex('#77706d'), hex('#8a8380'), hex('#9b938f'), hex('#7a6d63'), hex('#a8a3a0')] }));

const GRASS_TINT = [[150, 150, 150], [165, 165, 165], [180, 180, 180], [196, 196, 196], [212, 212, 212]];
const grassTop = (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 8, 3) * 0.7 + t.r() * 0.45 - 0.05);
    t.tint(x, y, pal(GRASS_TINT, v));
    t.setH(x, y, 0.4 + v * 0.4);
    t.setS(x, y, 0.2);
  });
  t.normalStrength = 1.5;
};
P('grass_top', grassTop);
P('grass_side', (t) => {
  PAINTERS.get('dirt')(t);
  for (let x = 0; x < S; x++) {
    const d = 5 + Math.floor(t.n(4).at(x, 0, 16) * 5 + t.r() * 3);
    for (let y = 0; y < d; y++) {
      const v = clamp01(t.r() * 0.6 + 0.3 - y * 0.03);
      t.tint(x, y, pal(GRASS_TINT, v)); t.setH(x, y, 0.75);
    }
    t.setH(x, d, 0.3);
  }
});
P('grass_snow_side', (t) => {
  PAINTERS.get('dirt')(t);
  for (let x = 0; x < S; x++) {
    const d = 6 + Math.floor(t.n(4).at(x, 0, 16) * 5 + t.r() * 2);
    for (let y = 0; y < d; y++) { t.set(x, y, pal(palette('#f0f6f8', 3, 0.1), t.r())); t.setH(x, y, 0.75); t.setS(x, y, 0.35); }
  }
});
P('snow', (t) => { noisy(t, '#f2f7f9', { p: 8, spread: 0.08, jitter: 0.25, smooth: 0.4 }); speckle(t, [hex('#ffffff'), hex('#dfe8ee')], 0.08); });
P('podzol_top', (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 0.7 + t.r() * 0.4);
    t.set(x, y, pal([hex('#4a2f13'), hex('#5c3c1a'), hex('#6b4a22'), hex('#7c5a2b'), hex('#8d6c35')], v)); t.setH(x, y, v);
  });
  speckle(t, [hex('#3a6b23'), hex('#9a7c40')], 0.06);
});
P('podzol_side', (t) => {
  PAINTERS.get('dirt')(t);
  for (let x = 0; x < S; x++) { const d = 5 + Math.floor(t.r() * 4); for (let y = 0; y < d; y++) t.set(x, y, pal([hex('#4a2f13'), hex('#5c3c1a'), hex('#6b4a22')], t.r())); }
});
P('mycelium_top', (t) => { noisy(t, '#6f6265', { p: 8, spread: 0.3, jitter: 0.4 }); speckle(t, [hex('#8c7c86'), hex('#a698a2')], 0.12); });
P('mycelium_side', (t) => {
  PAINTERS.get('dirt')(t);
  for (let x = 0; x < S; x++) { const d = 5 + Math.floor(t.r() * 5); for (let y = 0; y < d; y++) t.set(x, y, pal(palette('#6f6265', 4, 0.3), t.r())); }
});
P('moss_block', (t) => { noisy(t, '#596e2d', { p: 8, spread: 0.4, jitter: 0.35 }); speckle(t, [hex('#6e8a37'), hex('#4a5d24')], 0.1); t.normalStrength = 1.5; });
P('farmland', (t) => {
  t.each((x, y) => {
    const ridge = (y % 8) < 2;
    const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 0.6 + t.r() * 0.35);
    t.set(x, y, mul(pal(palette('#5b3b22', 5, 0.35), v), ridge ? 0.7 : 1));
    t.setH(x, y, ridge ? 0.2 : 0.6); t.setS(x, y, 0.3);
  });
});
P('dirt_path_top', (t) => { noisy(t, '#94793f', { p: 8, spread: 0.3, jitter: 0.3 }); speckle(t, [hex('#7c6334'), hex('#a8904f')], 0.1); });
P('dirt_path_side', (t) => {
  PAINTERS.get('dirt')(t);
  for (let x = 0; x < S; x++) for (let y = 2; y < 6; y++) t.set(x, y, pal(palette('#94793f', 4, 0.3), t.r()));
  for (let x = 0; x < S; x++) for (let y = 0; y < 2; y++) t.set(x, y, [0, 0, 0], 0);
});
P('ice', (t) => {
  t.each((x, y) => {
    const v = t.n(0).fbm(x, y, 4, 2);
    t.set(x, y, mix(hex('#7fa8ec'), hex('#c9dbff'), v), 0.62);
    t.setS(x, y, 0.95); t.setH(x, y, 0.5);
  });
  for (let k = 0; k < 4; k++) {
    let x = t.r() * S, y = t.r() * S;
    const dx = t.r() - 0.5, dy = t.r() - 0.5;
    for (let i = 0; i < 10; i++) { t.set(x, y, hex('#e8f0ff'), 0.85); x += dx * 2; y += dy * 2; }
  }
  t.flatNormal = true;
});
P('packed_ice', (t) => { noisy(t, '#8db4f4', { p: 8, spread: 0.18, smooth: 0.85 }); speckle(t, [hex('#b8d0ff')], 0.06); });
P('blue_ice', (t) => { noisy(t, '#74a8fd', { p: 8, spread: 0.2, smooth: 0.9 }); speckle(t, [hex('#9cc2ff'), hex('#5a8de8')], 0.08); });

// ------------------------------------------------------------ FLUIDES
P('water_still', (t) => { t.each((x, y) => { const v = t.n(0).fbm(x, y, 4, 3); t.set(x, y, mix([150, 150, 150], [220, 220, 220], v), 0.7); t.setS(x, y, 1); }); });
P('lava_still', (t) => {
  t.each((x, y) => {
    const v = t.n(0).fbm(x, y, 4, 3), w = t.n(1).fbm(x, y, 8, 2);
    const c = v > 0.62 ? mix(hex('#ffd54a'), hex('#fff2a8'), (v - 0.62) * 2.5) : v > 0.42 ? mix(hex('#e8590c'), hex('#ffb32b'), (v - 0.42) * 5) : mix(hex('#8a1d06'), hex('#d4400a'), v * 2.4);
    t.set(x, y, mul(c, 0.9 + w * 0.2)); t.setE(x, y, 0.55 + v * 0.45); t.setH(x, y, 1 - v); t.setS(x, y, 0.3);
  });
});

// ------------------------------------------------------------- MINERAIS
const ORES = {
  coal_ore: [[hex('#2b2b2b'), hex('#404040'), hex('#151515')], {}],
  iron_ore: [[hex('#d8af93'), hex('#bf8e6f'), hex('#ecd0b9')], {}],
  copper_ore: [[hex('#e0754d'), hex('#a8532f'), hex('#5fae8f')], {}],
  gold_ore: [[hex('#fcdc4c'), hex('#e0a929'), hex('#fff6a3')], { smooth: 0.8 }],
  redstone_ore: [[hex('#e01a1a'), hex('#9b0606'), hex('#ff6060')], { emit: 0.35 }],
  lapis_ore: [[hex('#2152b4'), hex('#163a87'), hex('#4b7bd8')], {}],
  diamond_ore: [[hex('#5fe5e0'), hex('#2db1ab'), hex('#c4fff7')], { smooth: 0.95 }],
  emerald_ore: [[hex('#2bd96a'), hex('#139442'), hex('#a7ffc4')], { smooth: 0.9, clusters: 3 }],
};
for (const [k, [cols, o]] of Object.entries(ORES)) {
  P(k, (t) => oreOn(t, STONE, cols, o));
  P('deepslate_' + k, (t) => oreOn(t, DEEPSLATE, cols, o));
}
const NETHERRACK = (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 4, 3) * 1.2 - 0.1 + (t.r() - 0.5) * 0.25);
    t.set(x, y, pal([hex('#4e1f1f'), hex('#622727'), hex('#6f2e2e'), hex('#7d3535'), hex('#8c3f3f')], v)); t.setH(x, y, v);
    const vein = Math.abs(t.n(2).at(x, y, 8) - 0.5);
    if (vein < 0.04) { t.set(x, y, hex('#9a4a45')); t.setH(x, y, 0.8); }
  });
  t.normalStrength = 1.4;
};
P('netherrack', NETHERRACK);
P('nether_quartz_ore', (t) => oreOn(t, NETHERRACK, [hex('#ece6dc'), hex('#c9bfb1'), hex('#ffffff')], { smooth: 0.7, size: 5, clusters: 6 }));
P('nether_gold_ore', (t) => oreOn(t, NETHERRACK, [hex('#fcdc4c'), hex('#e0a929'), hex('#fff6a3')], { smooth: 0.8, size: 3, clusters: 9 }));
P('ancient_debris_side', (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).at2(x, y, 16, 4) * 0.8 + (t.r() - 0.5) * 0.3);
    t.set(x, y, pal([hex('#4a3530'), hex('#5e4239'), hex('#6e4c41'), hex('#82604f')], v)); t.setH(x, y, v);
    if (Math.abs(t.n(1).at2(x, y, 16, 2) - 0.5) < 0.05) t.set(x, y, hex('#3a2a26'));
  });
});
P('ancient_debris_top', (t) => {
  t.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy);
    const v = clamp01(Math.sin(d * 0.9 + t.n(0).at(x, y, 4) * 2) * 0.4 + 0.5);
    t.set(x, y, pal([hex('#4a3530'), hex('#5e4239'), hex('#6e4c41'), hex('#82604f')], v)); t.setH(x, y, v);
  });
});

// ------------------------------------------------------------------ BOIS
const WOOD = {
  oak: { planks: '#a8864f', bark: '#6b5130', inner: '#b2925a' },
  spruce: { planks: '#735433', bark: '#3d2b17', inner: '#7a5a37' },
  birch: { planks: '#cdb878', bark: '#d8d7d2', inner: '#d4c48a' },
  jungle: { planks: '#a5734b', bark: '#5a4a1e', inner: '#b0804e' },
  acacia: { planks: '#ad5c32', bark: '#696159', inner: '#b8653a' },
  dark_oak: { planks: '#4b3118', bark: '#3b2c1a', inner: '#55391e' },
  cherry: { planks: '#e2b2a6', bark: '#3b1e24', inner: '#e8b9ad' },
  crimson: { planks: '#6d3550', bark: '#5c1d2e', inner: '#8a3b55' },
  warped: { planks: '#2c6b66', bark: '#3a3b4e', inner: '#38857f' },
};
for (const [w, c] of Object.entries(WOOD)) {
  P(w + '_planks', (t) => planks(t, c.planks));
  const logName = w === 'crimson' || w === 'warped' ? w + '_stem' : w + '_log';
  P(logName, (t) => {
    if (w === 'birch') {
      logSide(t, '#d6d5cf', { spread: 0.18 });
      for (let k = 0; k < 9; k++) {
        const x0 = Math.floor(t.r() * S), y0 = Math.floor(t.r() * S), len = 2 + Math.floor(t.r() * 6);
        for (let i = 0; i < len; i++) { t.set(x0 + i, y0, hex('#2a2a26')); t.set(x0 + i, y0 + 1, hex('#45443d')); t.setH(x0 + i, y0, 0.2); }
      }
    } else if (w === 'crimson' || w === 'warped') {
      logSide(t, c.bark, { spread: 0.5 });
      t.each((x, y) => { if (t.n(3).at2(x, y, 16, 4) > 0.68) { t.set(x, y, w === 'crimson' ? hex('#c23b3b') : hex('#2bc8a8')); t.setE(x, y, 0.4); } });
    } else logSide(t, c.bark);
  });
  P(logName + '_top', (t) => logTop(t, c.bark, c.inner));
}
P('oak_leaves', (t) => leaves(t));
P('spruce_leaves', (t) => leaves(t, null, { holes: 0.22 }));
P('birch_leaves', (t) => leaves(t, null, { holes: 0.3 }));
P('jungle_leaves', (t) => leaves(t, null, { holes: 0.2 }));
P('acacia_leaves', (t) => leaves(t, null, { holes: 0.3 }));
P('dark_oak_leaves', (t) => leaves(t, null, { holes: 0.2 }));
P('cherry_leaves', (t) => leaves(t, null, { color: '#f1a9cf', holes: 0.25 }));

const sapling = (trunk, leaf, o = {}) => (t) => crossPlant(t, () => {
  stem(t, 15, 18, 31, hex(trunk));
  for (let i = 0; i < 26; i++) {
    const a = t.r() * Math.PI * 2, r = t.r() * (o.r || 9);
    const x = 16 + Math.cos(a) * r, y = 12 + Math.sin(a) * r * 0.8;
    t.set(x, y, mul(hex(leaf), 0.7 + t.r() * 0.5)); t.set(x + 1, y, mul(hex(leaf), 0.8));
  }
});
P('oak_sapling', sapling('#6b5130', '#4f9a2a'));
P('spruce_sapling', sapling('#3d2b17', '#3c6b3c', { r: 7 }));
P('birch_sapling', sapling('#d8d7d2', '#6aa53b'));
P('jungle_sapling', sapling('#5a4a1e', '#3f8f1f'));
P('acacia_sapling', sapling('#696159', '#7f9a2a'));
P('dark_oak_sapling', sapling('#3b2c1a', '#2f6b1f'));
P('cherry_sapling', sapling('#3b1e24', '#f1a9cf'));

// ---------------------------------------------------- BLOCS FONCTIONNELS
P('crafting_table_top', (t) => {
  planks(t, '#a8864f');
  frame(t, hex('#6b4c2a'), 2, { dark: 0.8 });
  for (let i = 4; i < 28; i++) { t.set(i, 16, hex('#5b3d20')); t.set(16, i, hex('#5b3d20')); t.setH(i, 16, 0.2); t.setH(16, i, 0.2); }
  t.rect(6, 6, 12, 8, hex('#8a8a8a'), 1, 0.8); t.rect(8, 8, 10, 13, hex('#6b4c2a'), 1, 0.8);
  t.rect(20, 20, 26, 22, hex('#a0a0a0'), 1, 0.8); t.rect(22, 22, 24, 27, hex('#6b4c2a'), 1, 0.8);
});
const tableSide = (front) => (t) => {
  planks(t, '#94703f');
  t.rect(0, 0, 32, 5, hex('#6b4c2a'), 1, 0.7);
  t.rect(0, 5, 32, 6, hex('#4d331b'), 1, 0.2);
  if (front) {
    t.rect(6, 10, 9, 28, hex('#6b4c2a'), 1, 0.8); t.rect(3, 10, 12, 14, hex('#9a9a9a'), 1, 0.9);
    t.rect(20, 12, 28, 14, hex('#b0b0b0'), 1, 0.9); for (let x = 20; x < 28; x += 2) t.set(x, 14, hex('#7a7a7a'));
    t.rect(26, 12, 28, 24, hex('#6b4c2a'), 1, 0.8);
  } else {
    t.rect(8, 9, 24, 12, hex('#9d9d9d'), 1, 0.85); t.rect(14, 12, 18, 27, hex('#6b4c2a'), 1, 0.8);
  }
};
P('crafting_table_side', tableSide(false));
P('crafting_table_front', tableSide(true));
const FURN = '#8a8a8a';
P('furnace_side', (t) => { noisy(t, FURN, { p: 8, spread: 0.25 }); frame(t, hex('#5f5f5f'), 1); t.rect(0, 0, 32, 3, hex('#a2a2a2'), 1, 0.8); });
P('furnace_top', (t) => { noisy(t, '#9a9a9a', { p: 8, spread: 0.22 }); frame(t, hex('#6a6a6a'), 2); });
const furnFront = (on) => (t) => {
  PAINTERS.get('furnace_side')(t);
  t.rect(6, 4, 26, 7, hex('#5a5a5a'), 1, 0.3);
  t.rect(8, 17, 24, 28, hex('#1d1d1d'), 1, 0.05);
  frame(t, hex('#5a5a5a'), 1);
  t.rect(7, 16, 25, 17, hex('#5a5a5a'), 1, 0.9);
  if (on) {
    for (let y = 18; y < 28; y++) for (let x = 9; x < 23; x++) {
      const v = t.n(0).at(x, y, 8) + (y - 18) / 12;
      if (v > 0.6) { t.set(x, y, v > 1.1 ? hex('#ffe680') : v > 0.85 ? hex('#ff9a1f') : hex('#d8460c')); t.setE(x, y, 1); }
    }
  }
};
P('furnace_front', furnFront(false));
P('furnace_front_on', furnFront(true));
P('chest_side', (t) => { planks(t, '#9a6c33'); frame(t, hex('#4d3214'), 2, { dark: 0.8 }); t.rect(0, 13, 32, 15, hex('#3b2610'), 1, 0.2); });
P('chest_front', (t) => { PAINTERS.get('chest_side')(t); });
P('chest_top', (t) => { planks(t, '#9a6c33'); frame(t, hex('#4d3214'), 2, { dark: 0.8 }); });
P('chest_latch', (t) => { noisy(t, '#c9c9c9', { p: 8, spread: 0.2, smooth: 0.8 }); frame(t, hex('#6f6f6f'), 2); });
P('bookshelf', (t) => {
  planks(t, '#a8864f');
  const cols = ['#8e2424', '#2b4a8e', '#2d7a32', '#7a5a2a', '#a68d2c', '#5e2d7a', '#2a7a7a', '#b3b3b3'].map(hex);
  for (const row of [3, 18]) {
    t.rect(1, row - 1, 31, row, hex('#4d331b'), 1, 0.1);
    let x = 2;
    while (x < 30) {
      const w = 2 + Math.floor(t.r() * 2), h = 9 + Math.floor(t.r() * 3), c = cols[Math.floor(t.r() * cols.length)];
      for (let xx = x; xx < Math.min(x + w, 30); xx++) for (let y = row + 12 - h; y < row + 12; y++) {
        t.set(xx, y, mul(c, xx === x ? 1.15 : 0.9)); t.setH(xx, y, 0.7);
      }
      if (h > 9) t.set(x, row + 13 - h + 2, hex('#e8d68a'));
      x += w;
    }
    t.rect(1, row + 12, 31, row + 13, hex('#5b3d20'), 1, 0.2);
  }
});
P('tnt_side', (t) => {
  t.each((x, y) => { const v = t.n(0).at2(x, y, 16, 2); t.set(x, y, mix(hex('#b6271a'), hex('#d8402c'), v)); t.setH(x, y, 0.5 + v * 0.2); });
  for (let x = 0; x < S; x += 8) t.rect(x, 0, x + 1, 32, hex('#7d150c'), 1, 0.2);
  t.rect(0, 10, 32, 22, hex('#e9e5dc'), 1, 0.6);
  text(t, 'TNT', 5, 11, hex('#1a1a1a'), 2);
});
P('tnt_top', (t) => { t.fill(hex('#c73a26')); frame(t, hex('#8a1c10'), 2); t.rect(10, 10, 22, 22, hex('#e9e5dc'), 1, 0.6); t.rect(14, 14, 18, 18, hex('#3a3a3a'), 1, 0.9); });
P('tnt_bottom', (t) => { t.fill(hex('#c73a26')); frame(t, hex('#8a1c10'), 2); t.rect(10, 10, 22, 22, hex('#e9e5dc'), 1, 0.6); });
P('torch', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  for (let y = 12; y < 32; y++) { t.set(14, y, hex('#7c5d34')); t.set(15, y, hex('#9c7a4a')); t.set(16, y, hex('#7c5d34')); t.set(17, y, hex('#5e4426')); }
  const fl = [hex('#fff9d6'), hex('#ffe066'), hex('#ffad1f'), hex('#ff6a00')];
  for (let y = 12; y < 17; y++) for (let x = 14; x < 18; x++) { t.set(x, y, fl[Math.min(3, Math.abs(y - 13) + (x === 14 || x === 17 ? 1 : 0))]); t.setE(x, y, 1); }
  t.flatNormal = true;
});
P('soul_torch', (t) => {
  PAINTERS.get('torch')(t);
  const fl = [hex('#e6ffff'), hex('#8ff4ff'), hex('#3fd7e8'), hex('#1a9cb0')];
  for (let y = 12; y < 17; y++) for (let x = 14; x < 18; x++) t.set(x, y, fl[Math.min(3, Math.abs(y - 13) + (x === 14 || x === 17 ? 1 : 0))]);
});
const lantern = (glow) => (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  const metal = [hex('#3c3f4a'), hex('#4f5361'), hex('#2b2d36')];
  // corps (0..6, 2..9) -> pixels 0..12, 4..18
  t.rect(0, 4, 12, 18, metal[1]);
  t.rect(2, 7, 10, 16, glow[0]); t.rect(3, 8, 9, 15, glow[1]);
  for (let y = 7; y < 16; y++) for (let x = 2; x < 10; x++) t.setE(x, y, 1);
  t.rect(0, 4, 12, 6, metal[0]); t.rect(0, 16, 12, 18, metal[2]);
  // dessus (0..6, 9..15) -> 0..12, 18..30
  t.rect(0, 18, 12, 30, metal[0]); t.rect(2, 20, 10, 28, metal[2]);
  // capuchon (1..5, 0..2)
  t.rect(2, 0, 10, 4, metal[1]);
  // anse
  t.rect(22, 2, 28, 6, metal[0]);
  t.flatNormal = true;
};
P('lantern', lantern([hex('#ffd27a'), hex('#fff1c0')]));
P('soul_lantern', lantern([hex('#5ce1e6'), hex('#d4ffff')]));
P('glowstone', (t) => {
  const pts = voronoiPts(t, 12, 0.9);
  t.each((x, y) => {
    const [i, d1, d2] = voronoiAt(pts, x + 0.5, y + 0.5);
    const e = d2 - d1;
    const v = clamp01(pts[i][2] * 0.6 + 0.4 - d1 / 20);
    const c = e < 1.2 ? hex('#8a6b3a') : pal([hex('#c79a52'), hex('#e8bd6c'), hex('#f9d899'), hex('#fff0c8')], v);
    t.set(x, y, c); t.setE(x, y, e < 1.2 ? 0.3 : 0.75 + v * 0.25); t.setH(x, y, e < 1.2 ? 0.2 : 0.7);
  });
});
P('sea_lantern', (t) => {
  t.each((x, y) => {
    const cell = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const v = t.n(0).at(x, y, 8);
    t.set(x, y, mix(hex(cell ? '#a9d7cf' : '#d6efe9'), hex('#ffffff'), v * 0.5)); t.setE(x, y, 0.85); t.setS(x, y, 0.6);
    if (x % 8 === 0 || y % 8 === 0) { t.set(x, y, hex('#7cb3a8')); t.setE(x, y, 0.5); t.setH(x, y, 0.3); }
  });
});
P('shroomlight', (t) => { noisy(t, '#f19a3c', { p: 8, spread: 0.35 }); t.each((x, y) => t.setE(x, y, 0.8)); speckle(t, [hex('#ffd27f')], 0.08); });
P('pumpkin_side', (t) => {
  t.each((x, y) => {
    const rib = Math.abs(((x + 2) % 8) - 4) / 4;
    const v = clamp01(1 - rib * 0.6 + (t.r() - 0.5) * 0.2 + t.n(0).at(x, y, 4) * 0.2);
    t.set(x, y, pal(palette('#d47a19', 5, 0.4), v)); t.setH(x, y, 0.3 + v * 0.5);
  });
  t.normalStrength = 1.4;
});
P('pumpkin_top', (t) => {
  t.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5, a = Math.atan2(dy, dx);
    const v = clamp01(0.6 + Math.cos(a * 8) * 0.25 + (t.r() - 0.5) * 0.2);
    t.set(x, y, pal(palette('#d07316', 5, 0.4), v)); t.setH(x, y, v);
  });
  t.rect(13, 13, 19, 19, hex('#5e4a1a'), 1, 0.9); t.rect(14, 14, 18, 18, hex('#7a6224'), 1, 0.95);
});
const face = (glow) => (t) => {
  PAINTERS.get('pumpkin_side')(t);
  const c = glow ? hex('#ffd34d') : hex('#3b2306');
  const tri = (cx, cy) => { for (let r = 0; r < 5; r++) for (let x = -r; x <= r; x++) { t.set(cx + x, cy + r, c); t.setH(cx + x, cy + r, 0.1); if (glow) t.setE(cx + x, cy + r, 1); } };
  tri(9, 7); tri(22, 7);
  for (let x = 6; x < 26; x++) for (let y = 19; y < 24; y++) {
    if (y === 19 && x % 5 === 0) continue;
    if (y === 23 && (x + 2) % 5 === 0) continue;
    t.set(x, y, c); t.setH(x, y, 0.1); if (glow) t.setE(x, y, 1);
  }
};
P('carved_pumpkin', face(false));
P('jack_o_lantern', face(true));
P('melon_side', (t) => {
  t.each((x, y) => {
    const stripe = (Math.floor((x + Math.sin(y * 0.4) * 1.5) / 4) % 2);
    const v = clamp01(0.5 + (t.r() - 0.5) * 0.3 + t.n(0).at(x, y, 8) * 0.2);
    t.set(x, y, stripe ? pal(palette('#5e8a1c', 4, 0.3), v) : pal(palette('#9fb52b', 4, 0.3), v));
    t.setH(x, y, stripe ? 0.4 : 0.6);
  });
});
P('melon_top', (t) => {
  t.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5, a = Math.atan2(dy, dx);
    t.set(x, y, Math.cos(a * 10) > 0 ? pal(palette('#5e8a1c', 4, 0.3), t.r()) : pal(palette('#9fb52b', 4, 0.3), t.r()));
  });
  t.rect(14, 14, 18, 18, hex('#3c5a14'));
});
P('hay_block_side', (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).at2(x, y, 32, 4) * 0.7 + t.r() * 0.35);
    t.set(x, y, pal([hex('#9d7a1a'), hex('#b8901f'), hex('#c9a42a'), hex('#d9b83b'), hex('#e8cc5c')], v)); t.setH(x, y, v);
  });
  for (const yy of [7, 23]) t.rect(0, yy, 32, yy + 3, hex('#8c2a1a'), 1, 0.8);
});
P('hay_block_top', (t) => {
  t.each((x, y) => { const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 0.6 + t.r() * 0.4); t.set(x, y, pal([hex('#9d7a1a'), hex('#b8901f'), hex('#c9a42a'), hex('#d9b83b')], v)); t.setH(x, y, v); });
  frame(t, hex('#8c2a1a'), 2);
});
P('bed_foot_top', (t) => { t.each((x, y) => { const v = t.n(0).fbm(x, y, 8, 2); t.set(x, y, mix(hex('#8e1a1a'), hex('#b82c2c'), v)); t.setH(x, y, 0.5 + v * 0.3); }); t.normalStrength = 1.2; });
P('bed_head_top', (t) => { PAINTERS.get('bed_foot_top')(t); t.rect(3, 4, 29, 16, hex('#e8e8e8'), 1, 0.8); t.rect(3, 15, 29, 16, hex('#bdbdbd'), 1, 0.6); });
P('bed_side', (t) => { PAINTERS.get('bed_foot_top')(t); t.rect(0, 20, 32, 32, hex('#8a6a3a'), 1, 0.5); });
P('bed_end', (t) => { PAINTERS.get('bed_foot_top')(t); t.rect(0, 20, 32, 32, hex('#8a6a3a'), 1, 0.5); });
P('bed_leg', (t) => planks(t, '#8a6a3a'));
P('spawner', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  for (let i = 0; i < S; i++) for (let k = 0; k < S; k++) {
    if (i % 8 < 2 || k % 8 < 2) { t.set(i, k, mix(hex('#1f2a33'), hex('#3d4c58'), t.r())); t.setS(i, k, 0.6); t.setH(i, k, 0.8); }
  }
  t.flatNormal = false;
});
P('cobweb', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  const w = hex('#e8e8e8');
  for (let i = 0; i < S; i++) { t.set(i, i, w); t.set(i, S - 1 - i, w); t.set(16, i, w); t.set(i, 16, w); }
  for (const r of [5, 10, 14]) for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; t.set(16 + Math.cos(an) * r, 16 + Math.sin(an) * r, w); }
  t.flatNormal = true;
});
P('iron_bars', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  for (let y = 0; y < S; y++) for (const bx of [1, 9, 17, 25]) { t.set(bx, y, hex('#a6a6a6')); t.set(bx + 1, y, hex('#7e7e7e')); t.setS(bx, y, 0.7); t.setS(bx + 1, y, 0.7); }
  for (const by of [2, 29]) for (let x = 0; x < S; x++) { t.set(x, by, hex('#9a9a9a')); t.set(x, by + 1, hex('#6e6e6e')); }
  t.rect(14, 0, 18, 32, hex('#8f8f8f'));
});
P('ladder', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  for (let y = 0; y < S; y++) { t.rect(4, y, 7, y + 1, hex('#7c5d34')); t.rect(25, y, 28, y + 1, hex('#7c5d34')); t.set(4, y, hex('#9c7a4a')); }
  for (const r of [3, 11, 19, 27]) { t.rect(4, r, 28, r + 3, hex('#8c6a3c')); t.rect(4, r + 2, 28, r + 3, hex('#5e4426')); }
});
const door = (top) => (t) => {
  planks(t, '#9c7a4a');
  frame(t, hex('#6b5130'), 2);
  if (top) {
    for (const [x0, y0] of [[5, 5], [17, 5], [5, 17], [17, 17]]) t.rect(x0, y0, x0 + 10, y0 + 9, [0, 0, 0], 0);
  } else {
    t.rect(4, 4, 28, 28, hex('#8c6a3c'), 1, 0.4); frame(t, hex('#6b5130'), 2);
    t.rect(24, 2, 27, 6, hex('#3a3a3a'), 1, 0.9);
  }
};
P('oak_door_top', door(true));
P('oak_door_bottom', door(false));
P('cauldron_side', (t) => { noisy(t, '#3f3f45', { p: 8, spread: 0.25, smooth: 0.45 }); frame(t, hex('#55555c'), 1); t.rect(4, 26, 28, 32, [0, 0, 0], 0); });
P('cauldron_top', (t) => { noisy(t, '#4a4a52', { p: 8, spread: 0.2, smooth: 0.45 }); });
P('cauldron_inner', (t) => { noisy(t, '#2b2b30', { p: 8, spread: 0.2, smooth: 0.3 }); });
P('composter_side', (t) => { planks(t, '#7c5d34'); });
P('composter_top', (t) => { planks(t, '#7c5d34'); });
P('composter_bottom', (t) => { noisy(t, '#4f3a1f', { p: 8 }); });
P('anvil', (t) => { noisy(t, '#444448', { p: 8, spread: 0.18, smooth: 0.55 }); });
P('anvil_top', (t) => { noisy(t, '#4d4d52', { p: 8, spread: 0.12, smooth: 0.7 }); frame(t, hex('#3a3a3e'), 2); });
P('enchanting_table_side', (t) => {
  noisy(t, '#2a1b2d', { p: 8, spread: 0.3 }); t.rect(0, 0, 32, 8, hex('#a01e2a'), 1, 0.6);
  for (let x = 0; x < S; x += 8) t.rect(x + 2, 1, x + 5, 5, hex('#5de0e0'), 1, 0.9);
});
P('enchanting_table_top', (t) => { noisy(t, '#a01e2a', { p: 8, spread: 0.2 }); frame(t, hex('#1c1c22'), 3); t.rect(10, 10, 22, 22, hex('#5de0e0'), 1, 0.9); });
P('enchanting_table_bottom', (t) => noisy(t, '#1c1c22', { p: 8 }));
P('enchanting_book', (t) => { t.fill(hex('#7a4a2a')); t.rect(2, 2, 30, 30, hex('#e8dfc4')); for (let y = 6; y < 26; y += 4) t.rect(5, y, 27, y + 1, hex('#5a4a8a')); });
P('bell_body', (t) => { noisy(t, '#f5c33a', { p: 8, spread: 0.2, smooth: 0.9 }); frame(t, hex('#c4911c'), 2); });
P('campfire_log', (t) => logSide(t, '#4d3a20'));
P('campfire_log_lit', (t) => {
  t.each((x, y) => { const v = t.n(0).fbm(x, y, 8, 2); t.set(x, y, v > 0.55 ? mix(hex('#ff8a1c'), hex('#ffd04a'), v) : hex('#3a2a1a')); t.setE(x, y, v > 0.55 ? 1 : 0); });
});
const fireTex = (cols) => (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  t.each((x, y) => {
    const v = t.n(0).at2(x, y, 8, 4) * 0.6 + t.n(1).at2(x, y, 16, 8) * 0.4 + (y / S) * 0.8 - 0.35;
    if (v > 0.45) {
      const c = v > 0.95 ? cols[0] : v > 0.75 ? cols[1] : v > 0.58 ? cols[2] : cols[3];
      t.set(x, y, c); t.setE(x, y, 1);
    }
  });
  t.flatNormal = true;
};
P('fire', fireTex([hex('#fff4c2'), hex('#ffd34a'), hex('#ff8f1f'), hex('#d2400a')]));
P('soul_fire', fireTex([hex('#e6ffff'), hex('#8ff4ff'), hex('#2fc8db'), hex('#127a8a')]));
P('campfire_fire', fireTex([hex('#fff4c2'), hex('#ffd34a'), hex('#ff8f1f'), hex('#d2400a')]));
P('barrel_side', (t) => { planks(t, '#7a5a34'); for (const y of [3, 28]) t.rect(0, y, 32, y + 2, hex('#3a3a3a'), 1, 0.8); });
P('barrel_top', (t) => { planks(t, '#8a6a3e'); frame(t, hex('#4d3a20'), 3); t.rect(12, 12, 20, 20, hex('#3a2a1a'), 1, 0.2); });
P('barrel_bottom', (t) => { planks(t, '#7a5a34'); frame(t, hex('#4d3a20'), 3); });
P('beacon', (t) => { t.fill(hex('#bff5f5'), 0.5); frame(t, hex('#e8ffff'), 2); t.rect(8, 8, 24, 24, hex('#6cf0e8'), 1); t.each((x, y) => t.setE(x, y, 0.6)); });

// ------------------------------------------------------- MINÉRAUX, COULEURS
const metalBlock = (base, o = {}) => (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 0.5 + 0.25 + (t.r() - 0.5) * 0.1);
    t.set(x, y, pal(palette(base, 5, o.spread || 0.25), v)); t.setS(x, y, o.smooth || 0.75); t.setH(x, y, 0.6);
  });
  frame(t, mul(hex(base), 1.18), 2, { dark: 0.62 });
  if (o.gem) {
    for (let k = 0; k < 8; k++) { const x = 4 + t.r() * 24, y = 4 + t.r() * 24; t.set(x, y, mul(hex(base), 1.35)); t.set(x + 1, y, mul(hex(base), 1.2)); }
  }
};
P('iron_block', metalBlock('#d8d8d8', { smooth: 0.7 }));
P('gold_block', metalBlock('#f2cd36', { smooth: 0.85 }));
P('diamond_block', metalBlock('#62e5de', { smooth: 0.9, gem: true }));
P('emerald_block', metalBlock('#2fd36a', { smooth: 0.88, gem: true }));
P('lapis_block', metalBlock('#2350a8', { smooth: 0.4 }));
P('redstone_block', (t) => { metalBlock('#b01608', { smooth: 0.5 })(t); t.each((x, y) => t.setE(x, y, 0.15)); });
P('copper_block', metalBlock('#c56b48', { smooth: 0.65 }));
P('netherite_block', metalBlock('#433c3e', { smooth: 0.75 }));
P('coal_block', (t) => { noisy(t, '#1c1c1c', { p: 8, spread: 0.4, smooth: 0.45 }); speckle(t, [hex('#3a3a3a')], 0.1); });
P('amethyst_block', (t) => {
  const pts = voronoiPts(t, 10, 1);
  t.each((x, y) => { const [i, d1, d2] = voronoiAt(pts, x, y); t.set(x, y, pal(palette('#8d6acc', 5, 0.4), clamp01(pts[i][2] * 0.7 + (d2 - d1) / 12))); t.setS(x, y, 0.8); t.setH(x, y, (d2 - d1) / 8); });
});
P('obsidian', (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 4, 3) * 1.3 - 0.15 + (t.r() - 0.5) * 0.1);
    t.set(x, y, pal([hex('#0b0812'), hex('#130d20'), hex('#1d1430'), hex('#2c1f47'), hex('#3f2c63')], v)); t.setS(x, y, 0.88); t.setH(x, y, v);
  });
});
P('crying_obsidian', (t) => {
  PAINTERS.get('obsidian')(t);
  t.each((x, y) => { const v = t.n(3).at2(x, y, 8, 2); if (v > 0.7) { t.set(x, y, mix(hex('#7a17c9'), hex('#c25cff'), (v - 0.7) * 3)); t.setE(x, y, 0.9); } });
});
P('bone_block_side', (t) => { t.each((x, y) => { const v = t.n(0).at2(x, y, 16, 2); t.set(x, y, pal(palette('#e2dcc4', 4, 0.15), v)); t.setH(x, y, v); }); });
P('bone_block_top', (t) => { noisy(t, '#e2dcc4', { p: 8, spread: 0.12 }); frame(t, hex('#c9c2a6'), 3); t.rect(12, 12, 20, 20, hex('#b8b092'), 1, 0.2); });
P('terracotta', (t) => noisy(t, '#985e43', { p: 8, spread: 0.12, jitter: 0.2, smooth: 0.08 }));

const DYE = {
  white: '#e9ecec', orange: '#f07613', magenta: '#bd44b3', light_blue: '#3aafd9', yellow: '#f8c627', lime: '#70b919',
  pink: '#ed8dac', gray: '#3e4447', light_gray: '#8e8e86', cyan: '#158991', purple: '#792aac', blue: '#35399d',
  brown: '#724728', green: '#546d1b', red: '#a12722', black: '#141519',
};
const TERRA = {
  white: '#d1b1a1', orange: '#a15325', magenta: '#95576c', light_blue: '#706c8a', yellow: '#ba8523', lime: '#677534',
  pink: '#a14e4e', gray: '#392a23', light_gray: '#876b62', cyan: '#565b5b', purple: '#764656', blue: '#4a3b5b',
  brown: '#4d3323', green: '#4c532a', red: '#8e3c2e', black: '#251610',
};
for (const c of COLOR_KEYS) {
  P(c + '_wool', (t) => {
    t.each((x, y) => {
      const v = clamp01(t.n(0).at(x, y, 8) * 0.5 + t.n(1).at(x, y, 16) * 0.3 + t.r() * 0.3);
      t.set(x, y, pal(palette(DYE[c], 5, 0.22), v)); t.setH(x, y, 0.4 + v * 0.3); t.setS(x, y, 0.02);
    });
    t.normalStrength = 1.3;
  });
  P(c + '_concrete', (t) => noisy(t, DYE[c], { p: 8, spread: 0.06, jitter: 0.15, smooth: 0.3 }));
  P(c + '_terracotta', (t) => noisy(t, TERRA[c], { p: 8, spread: 0.1, jitter: 0.2, smooth: 0.08 }));
}
const glass = (col, a) => (t) => {
  t.each((x, y) => { t.set(x, y, col ? hex(col) : [235, 245, 250], a); t.setS(x, y, 0.98); });
  frame(t, col ? mul(hex(col), 0.85) : hex('#dfeef2'), 1, { dark: 0.9 });
  for (let i = 0; i < S; i++) { t.set(i, 0, col ? mul(hex(col), 0.8) : hex('#cfe3e8'), 0.95); t.set(0, i, col ? mul(hex(col), 0.8) : hex('#cfe3e8'), 0.95); t.set(S - 1, i, col ? mul(hex(col), 0.7) : hex('#c0d6dc'), 0.95); t.set(i, S - 1, col ? mul(hex(col), 0.7) : hex('#c0d6dc'), 0.95); }
  for (let i = 0; i < 6; i++) { t.set(5 + i, 10 - i, [255, 255, 255], 0.55); t.set(6 + i, 10 - i, [255, 255, 255], 0.4); }
  for (let i = 0; i < 4; i++) t.set(22 + i, 26 - i, [255, 255, 255], 0.45);
  t.flatNormal = true;
};
P('glass', glass(null, 0.08));
for (const c of ['white', 'light_blue', 'lime', 'pink', 'purple', 'red', 'black', 'yellow']) P(c + '_stained_glass', glass(DYE[c], 0.42));

// --------------------------------------------------------------- PLANTES
const GREEN = [[120, 120, 120], [150, 150, 150], [175, 175, 175], [200, 200, 200]];
P('short_grass', (t) => crossPlant(t, () => {
  for (let i = 0; i < 14; i++) blade(t, 3 + t.r() * 26, 8 + Math.floor(t.r() * 14), pal(GREEN, t.r()), { tint: true, lean: 1.2 });
}));
P('fern', (t) => crossPlant(t, () => {
  for (let f = 0; f < 3; f++) {
    const x0 = 8 + f * 8, len = 14 + Math.floor(t.r() * 10);
    for (let i = 0; i < len; i++) {
      const y = S - 1 - i, x = x0 + Math.round((i / len) * (f - 1) * 4);
      t.tint(x, y, pal(GREEN, 0.6));
      if (i > 3 && i % 2 === 0) { const w = Math.round((1 - i / len) * 4) + 1; for (let k = 1; k <= w; k++) { t.tint(x - k, y + 1 - (k >> 1), pal(GREEN, 0.4 + t.r() * 0.5)); t.tint(x + k, y + 1 - (k >> 1), pal(GREEN, 0.4 + t.r() * 0.5)); } }
    }
  }
}));
P('tall_grass_bottom', (t) => crossPlant(t, () => { for (let i = 0; i < 18; i++) { const x = 2 + t.r() * 28; for (let y = 0; y < S; y++) t.tint(x + Math.sin(y * 0.2 + i) * 0.8, y, pal(GREEN, t.r() * 0.5 + 0.3)); } }));
P('tall_grass_top', (t) => crossPlant(t, () => { for (let i = 0; i < 16; i++) blade(t, 2 + t.r() * 28, 10 + Math.floor(t.r() * 20), pal(GREEN, t.r()), { tint: true, lean: 1.5 }); }));
P('large_fern_bottom', (t) => PAINTERS.get('tall_grass_bottom')(t));
P('large_fern_top', (t) => PAINTERS.get('fern')(t));
P('dead_bush', (t) => crossPlant(t, () => {
  const c = hex('#8a5a2a');
  const branch = (x, y, a, len, d) => {
    for (let i = 0; i < len; i++) { x += Math.cos(a); y -= Math.sin(a); t.set(x, y, mul(c, 0.8 + t.r() * 0.3)); }
    if (d < 3) { branch(x, y, a + 0.5, len * 0.6, d + 1); branch(x, y, a - 0.6, len * 0.6, d + 1); }
  };
  branch(16, 31, Math.PI / 2, 8, 0);
}));
const FLOWER_DEF = {
  dandelion: ['#f5d82a', '#e8a91c', 2], poppy: ['#d6261c', '#2a1a10', 3], blue_orchid: ['#2fa3e0', '#a4e6ff', 3], allium: ['#b46ce0', '#8a3dbd', 4],
  azure_bluet: ['#e8eef2', '#f5d82a', 2], red_tulip: ['#d8301f', null, 3], orange_tulip: ['#ef7b1f', null, 3], white_tulip: ['#f0f0ec', null, 3],
  pink_tulip: ['#efa2c8', null, 3], oxeye_daisy: ['#f2f2f2', '#f5c71a', 4], cornflower: ['#4566d6', '#2a3a8a', 3], lily_of_the_valley: ['#f4f4f0', null, 2],
};
for (const k of FLOWER_KEYS) {
  const [petal, center, r] = FLOWER_DEF[k];
  P(k, (t) => crossPlant(t, () => {
    const g = hex('#3d7a24');
    stem(t, 15, 14, 31, g);
    leafPair(t, 15, 24, hex('#4a8f2a'), -1); leafPair(t, 16, 21, hex('#4a8f2a'), 1);
    if (k.endsWith('tulip')) {
      t.rect(12, 7, 20, 15, mul(hex(petal), 0.9)); t.rect(13, 5, 15, 8, hex(petal)); t.rect(17, 5, 19, 8, hex(petal)); t.rect(15, 6, 17, 8, mul(hex(petal), 0.8));
    } else if (k === 'lily_of_the_valley') {
      for (const [x, y] of [[11, 10], [14, 7], [18, 9], [21, 13], [10, 15]]) t.rect(x, y, x + 3, y + 3, hex(petal));
    } else if (k === 'allium') {
      flowerHead(t, 15, 10, hex(petal), null, 5);
    } else {
      flowerHead(t, 15, 11, hex(petal), center ? hex(center) : null, r);
    }
  }));
}
const tallFlower = (petal, isTop) => (t) => crossPlant(t, () => {
  const g = hex('#3d7a24');
  for (const sx of [10, 20]) stem(t, sx, 0, 31, g);
  if (isTop) for (let i = 0; i < 9; i++) flowerHead(t, 6 + t.r() * 20, 6 + t.r() * 18, hex(petal), null, 2 + Math.floor(t.r() * 2));
  else for (let i = 0; i < 6; i++) leafPair(t, i % 2 ? 10 : 21, 6 + i * 4, hex('#4a8f2a'), i % 2 ? -1 : 1);
});
P('rose_bush_bottom', tallFlower('#c41e2a', false));
P('rose_bush_top', tallFlower('#c41e2a', true));
P('lilac_bottom', tallFlower('#c89be0', false));
P('lilac_top', tallFlower('#c89be0', true));
P('pink_petals', (t) => crossPlant(t, () => { for (let i = 0; i < 14; i++) flowerHead(t, 3 + t.r() * 26, 3 + t.r() * 26, hex('#f4a6c8'), hex('#f5d82a'), 2); }));
const mushroom = (cap, spots) => (t) => crossPlant(t, () => {
  t.rect(14, 18, 18, 30, hex('#e3d6c0')); t.rect(17, 18, 18, 30, hex('#bfb29b'));
  for (let y = 0; y < 8; y++) { const w = y < 2 ? 4 + y * 2 : 8; t.rect(16 - w, 10 + y, 16 + w, 11 + y, mul(hex(cap), 1 - y * 0.03)); }
  if (spots) for (const [x, y] of [[11, 12], [18, 11], [14, 14], [20, 15]]) t.rect(x, y, x + 2, y + 2, hex('#f2f2f2'));
});
P('red_mushroom', mushroom('#d22b26', true));
P('brown_mushroom', mushroom('#9a6a4a', false));
P('red_mushroom_block', (t) => { noisy(t, '#c12a24', { p: 8, spread: 0.2 }); for (let k = 0; k < 7; k++) { const x = t.r() * 28, y = t.r() * 28, r = 2 + t.r() * 2; for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j < r * r) t.set(x + i, y + j, hex('#ece6dc')); } });
P('brown_mushroom_block', (t) => noisy(t, '#94704f', { p: 8, spread: 0.2 }));
P('mushroom_stem', (t) => { noisy(t, '#d6ceb9', { p: 8, spread: 0.12 }); });
P('cactus_side', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  for (let y = 0; y < S; y++) for (let x = 2; x < 30; x++) {
    const rib = (x - 2) % 7;
    const v = rib === 0 ? 0.25 : rib === 3 ? 0.85 : 0.6;
    t.set(x, y, pal(palette('#1f7a2f', 5, 0.5), clamp01(v + (t.r() - 0.5) * 0.15))); t.setH(x, y, v);
    if (rib === 3 && (y + x) % 6 === 0) { t.set(x, y, hex('#e8e0a0')); t.setH(x, y, 1); }
  }
  t.normalStrength = 1.8;
});
P('cactus_top', (t) => { t.each((x, y) => { const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy); t.set(x, y, d > 13 ? hex('#1a6a28') : mix(hex('#3f9a3a'), hex('#5cb04a'), Math.cos(d) * 0.5 + 0.5)); }); });
P('cactus_bottom', (t) => noisy(t, '#7a9a4a', { p: 8 }));
P('sugar_cane', (t) => crossPlant(t, () => {
  for (const x0 of [6, 15, 24]) for (let y = 0; y < S; y++) {
    const seg = y % 10 === 0;
    t.tint(x0, y, seg ? [140, 140, 140] : [200, 200, 200]); t.tint(x0 + 1, y, seg ? [120, 120, 120] : [175, 175, 175]); t.tint(x0 + 2, y, [150, 150, 150]);
    if (y % 10 === 3) { t.tint(x0 + 3, y, [170, 170, 170]); t.tint(x0 + 4, y - 1, [160, 160, 160]); }
  }
}));
P('bamboo_stalk', (t) => {
  t.each((x, y) => { const seg = y % 16 === 0; t.set(x, y, seg ? hex('#4f7a20') : mix(hex('#6a9a2a'), hex('#8ab83a'), (x % 6) / 6)); t.setH(x, y, seg ? 0.3 : 0.6); });
});
P('bamboo_leaves', (t) => crossPlant(t, () => { for (let i = 0; i < 6; i++) { const x0 = 4 + t.r() * 24, y0 = 4 + t.r() * 20; for (let k = 0; k < 10; k++) { t.set(x0 + k, y0 + k * 0.4, hex('#5a9a2a')); t.set(x0 + k, y0 + k * 0.4 + 1, hex('#4a8a1f')); } } }));
P('vine', (t) => crossPlant(t, () => {
  for (let i = 0; i < 6; i++) {
    let x = 2 + t.r() * 28;
    for (let y = 0; y < S; y++) {
      x += (t.r() - 0.5) * 1.5;
      t.tint(x, y, pal(GREEN, 0.4 + t.r() * 0.4));
      if (t.r() < 0.35) { t.tint(x + 1, y, pal(GREEN, 0.6)); t.tint(x - 1, y, pal(GREEN, 0.5)); t.tint(x + 2, y, pal(GREEN, 0.7)); }
    }
  }
}));
P('lily_pad', (t) => crossPlant(t, () => {
  t.each((x, y) => {
    const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    if (d < 14 && !(a > 0.2 && a < 0.6)) t.tint(x, y, mix([110, 110, 110], [190, 190, 190], clamp01(0.5 + Math.cos(a * 9) * 0.2 + t.r() * 0.2)));
  });
}));
P('seagrass', (t) => crossPlant(t, () => { for (let i = 0; i < 6; i++) blade(t, 4 + t.r() * 24, 18 + Math.floor(t.r() * 14), hex('#3a8a2a'), { lean: 2, wide: true }); }));
P('kelp', (t) => crossPlant(t, () => {
  for (let y = 0; y < S; y++) { const x = 15 + Math.sin(y * 0.4) * 2; t.set(x, y, hex('#4a7a1f')); t.set(x + 1, y, hex('#3a6a18')); if (y % 6 === 2) { t.set(x + 2, y, hex('#5a8a2a')); t.set(x + 3, y + 1, hex('#5a8a2a')); t.set(x - 1, y + 3, hex('#5a8a2a')); t.set(x - 2, y + 4, hex('#5a8a2a')); } }
  t.rect(13, 0, 19, 4, hex('#5f9a2a'));
}));
P('kelp_plant', (t) => crossPlant(t, () => {
  for (let y = 0; y < S; y++) { const x = 15 + Math.sin(y * 0.4) * 2; t.set(x, y, hex('#4a7a1f')); t.set(x + 1, y, hex('#3a6a18')); if (y % 6 === 2) { t.set(x + 2, y, hex('#5a8a2a')); t.set(x + 3, y + 1, hex('#5a8a2a')); t.set(x - 1, y + 3, hex('#5a8a2a')); t.set(x - 2, y + 4, hex('#5a8a2a')); } }
}));
const CORAL_COL = { tube: '#3156d1', brain: '#d45aa2', bubble: '#a51ca5', fire: '#c72f3b', horn: '#d9c83f' };
for (const c of CORAL_KEYS) {
  P(c + '_coral_block', (t) => {
    t.each((x, y) => { const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 0.8 + t.r() * 0.3); t.set(x, y, pal(palette(CORAL_COL[c], 5, 0.45), v)); t.setH(x, y, v); });
    speckle(t, [mul(hex(CORAL_COL[c]), 0.6)], 0.12, { h: 0.1 });
    t.normalStrength = 2;
  });
  P(c + '_coral', (t) => crossPlant(t, () => {
    const br = (x, y, a, len, d) => {
      for (let i = 0; i < len; i++) { x += Math.cos(a); y -= Math.sin(a); t.set(x, y, mul(hex(CORAL_COL[c]), 0.75 + t.r() * 0.4)); t.set(x + 1, y, mul(hex(CORAL_COL[c]), 0.7)); }
      if (d < 3) { br(x, y, a + 0.6, len * 0.7, d + 1); br(x, y, a - 0.5, len * 0.7, d + 1); }
      else t.rect(x - 1, y - 1, x + 2, y + 2, mul(hex(CORAL_COL[c]), 1.2));
    };
    br(16, 31, Math.PI / 2, 9, 0);
  }));
}
P('sweet_berry_bush', (t) => crossPlant(t, () => {
  for (let i = 0; i < 40; i++) { const x = 2 + t.r() * 28, y = 6 + t.r() * 25; t.set(x, y, mul(hex('#2f6b2a'), 0.8 + t.r() * 0.4)); t.set(x + 1, y, hex('#3a7a30')); }
  for (let i = 0; i < 7; i++) { const x = 4 + t.r() * 24, y = 8 + t.r() * 20; t.rect(x, y, x + 2, y + 2, hex('#c41e3a')); t.set(x, y, hex('#ff6a7a')); }
}));
const cropStages = (name, n, draw) => { for (let s = 0; s < n; s++) P(name + s, (t) => crossPlant(t, () => draw(t, s / (n - 1)))); };
cropStages('wheat_stage', 8, (t, g) => {
  const h = 4 + Math.floor(g * 26);
  const col = mix(hex('#3f9a2a'), hex('#c9a832'), Math.max(0, g - 0.5) * 2);
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * 4 + Math.floor(t.r() * 2);
    for (let y = 0; y < h; y++) t.set(x, S - 1 - y, mul(col, 0.8 + t.r() * 0.3));
    if (g > 0.7) for (let y = 0; y < 6; y++) { t.set(x - 1, S - h + y, hex('#d9b84a')); t.set(x + 1, S - h + y, hex('#b8952f')); }
  }
});
cropStages('carrots_stage', 4, (t, g) => {
  for (let i = 0; i < 5; i++) { const x = 4 + i * 6; blade(t, x, 4 + Math.floor(g * 14), hex('#3f9a2a'), { lean: 1.5 }); blade(t, x + 2, 3 + Math.floor(g * 10), hex('#4aa830'), { lean: 1.5 }); if (g === 1) t.rect(x, 29, x + 3, 32, hex('#ef8a1f')); }
});
cropStages('potatoes_stage', 4, (t, g) => {
  for (let i = 0; i < 5; i++) { const x = 4 + i * 6; blade(t, x, 4 + Math.floor(g * 12), hex('#3a8f2a'), { lean: 1, wide: true }); if (g === 1) t.rect(x, 28, x + 4, 32, hex('#c9a45a')); }
});
cropStages('nether_wart_stage', 3, (t, g) => {
  for (let i = 0; i < 5; i++) { const x = 4 + i * 6; blade(t, x, 3 + Math.floor(g * 12), hex('#8a1a1a'), { lean: 1.2, wide: true }); if (g > 0.5) t.rect(x - 1, 31 - Math.floor(g * 12), x + 3, 34 - Math.floor(g * 12), hex('#b52a2a')); }
});

// ----------------------------------------------------------------- NETHER
P('soul_sand', (t) => {
  noisy(t, '#51402f', { p: 8, spread: 0.35, jitter: 0.3 });
  for (let k = 0; k < 4; k++) {
    const x = 3 + Math.floor(t.r() * 24), y = 3 + Math.floor(t.r() * 22);
    const d = hex('#2a1f15');
    t.rect(x, y, x + 2, y + 2, d, 1, 0.1); t.rect(x + 4, y, x + 6, y + 2, d, 1, 0.1); t.rect(x + 1, y + 4, x + 5, y + 6, d, 1, 0.1);
  }
});
P('soul_soil', (t) => { noisy(t, '#4b3a2c', { p: 8, spread: 0.35, jitter: 0.3 }); speckle(t, [hex('#3a2c20'), hex('#6a5442')], 0.1); });
P('basalt_side', (t) => {
  t.each((x, y) => { const v = clamp01(t.n(0).at2(x, y, 16, 2) * 0.8 + (t.r() - 0.5) * 0.2); t.set(x, y, pal(palette('#55545a', 5, 0.4), v)); t.setH(x, y, v); });
  for (const x of [7, 15, 24]) for (let y = 0; y < S; y++) { t.set(x, y, hex('#3a393e')); t.setH(x, y, 0.1); }
});
P('basalt_top', (t) => { t.each((x, y) => { const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy); const v = clamp01(Math.sin(d * 0.8) * 0.3 + 0.5 + (t.r() - 0.5) * 0.2); t.set(x, y, pal(palette('#5a5960', 5, 0.35), v)); t.setH(x, y, v); }); });
P('blackstone', (t) => { noisy(t, '#2c2630', { p: 4, spread: 0.45 }); speckle(t, [hex('#4a4250'), hex('#1a161c')], 0.1); });
P('blackstone_top', (t) => { noisy(t, '#2c2630', { p: 8, spread: 0.35 }); });
P('gilded_blackstone', (t) => oreOn(t, PAINTERS.get('blackstone'), [hex('#f2c230'), hex('#c4911c'), hex('#fff1a0')], { smooth: 0.85, clusters: 7 }));
P('polished_blackstone_bricks', (t) => bricks(t, { base: '#302a33', mortar: '#1a161c', rows: 4, bw: 16, bevel: true }));
P('magma_block', (t) => {
  const pts = voronoiPts(t, 9, 1);
  t.each((x, y) => {
    const [i, d1, d2] = voronoiAt(pts, x, y);
    const e = d2 - d1;
    if (e < 1.6) { const k = 1 - e / 1.6; t.set(x, y, mix(hex('#c2410c'), hex('#ffd04a'), k)); t.setE(x, y, 0.6 + k * 0.4); t.setH(x, y, 0.1); }
    else { t.set(x, y, pal([hex('#3a120c'), hex('#4f1a10'), hex('#632216'), hex('#7a2c1a')], clamp01(pts[i][2] * 0.6 + t.r() * 0.3))); t.setH(x, y, 0.7); }
  });
});
P('nether_bricks', (t) => bricks(t, { base: '#2f161b', mortar: '#160a0d', rows: 4, bw: 16, bevel: true, pal: [hex('#2a1217'), hex('#33171d'), hex('#3d1c22'), hex('#47222a')] }));
P('red_nether_bricks', (t) => bricks(t, { base: '#4a0a0c', mortar: '#260405', rows: 4, bw: 16, bevel: true }));
P('nether_wart_block', (t) => { noisy(t, '#7a0b0b', { p: 8, spread: 0.45, jitter: 0.35 }); t.normalStrength = 1.6; });
P('warped_wart_block', (t) => { noisy(t, '#137a7a', { p: 8, spread: 0.45, jitter: 0.35 }); t.normalStrength = 1.6; });
P('crimson_nylium', (t) => { noisy(t, '#8a1b1b', { p: 8, spread: 0.5, jitter: 0.35 }); speckle(t, [hex('#b83030'), hex('#5a0f0f')], 0.1); });
P('warped_nylium', (t) => { noisy(t, '#167a6a', { p: 8, spread: 0.5, jitter: 0.35 }); speckle(t, [hex('#1fa58a'), hex('#0e4f45')], 0.1); });
const nylSide = (col) => (t) => {
  NETHERRACK(t);
  for (let x = 0; x < S; x++) { const d = 4 + Math.floor(t.r() * 6); for (let y = 0; y < d; y++) t.set(x, y, pal(palette(col, 4, 0.4), t.r())); }
};
P('crimson_nylium_side', nylSide('#8a1b1b'));
P('warped_nylium_side', nylSide('#167a6a'));
const fungus = (cap, stemC) => (t) => crossPlant(t, () => {
  t.rect(15, 16, 17, 32, hex(stemC));
  for (let y = 0; y < 7; y++) { const w = 3 + y; t.rect(16 - w, 9 + y, 16 + w, 10 + y, mul(hex(cap), 0.85 + t.r() * 0.3)); }
  for (let k = 0; k < 4; k++) t.set(10 + t.r() * 12, 12 + t.r() * 3, hex('#ffd27a'));
});
P('crimson_fungus', fungus('#a3201f', '#e3a06a'));
P('warped_fungus', fungus('#16897a', '#e3a06a'));
P('crimson_roots', (t) => crossPlant(t, () => { for (let i = 0; i < 10; i++) blade(t, 3 + t.r() * 26, 8 + Math.floor(t.r() * 16), hex('#a8252a'), { lean: 1.4 }); }));
P('warped_roots', (t) => crossPlant(t, () => { for (let i = 0; i < 10; i++) blade(t, 3 + t.r() * 26, 8 + Math.floor(t.r() * 16), hex('#1fa58a'), { lean: 1.4 }); }));
P('weeping_vines', (t) => crossPlant(t, () => { for (let i = 0; i < 5; i++) { const x = 6 + i * 5; for (let y = 0; y < S; y++) t.set(x + Math.sin(y * 0.3 + i), y, hex('#8a1b1b')); } }));
P('nether_portal', (t) => {
  t.each((x, y) => {
    const dx = x - 16, dy = y - 16, a = Math.atan2(dy, dx), d = Math.sqrt(dx * dx + dy * dy);
    const v = 0.5 + 0.5 * Math.sin(a * 3 + d * 0.5) * t.n(0).at(x, y, 8);
    t.set(x, y, mix(hex('#3b0c87'), hex('#b45cff'), v), 0.78); t.setE(x, y, 0.75); t.setS(x, y, 0.9);
  });
  t.flatNormal = true;
});
P('quartz_block_side', (t) => { noisy(t, '#ebe5dd', { p: 8, spread: 0.08, smooth: 0.45 }); });
P('quartz_block_top', (t) => { noisy(t, '#ebe5dd', { p: 8, spread: 0.08, smooth: 0.45 }); frame(t, hex('#d8d0c4'), 1); });

// -------------------------------------------------------------------- END
P('end_stone', (t) => {
  noisy(t, '#dcdf9e', { p: 8, spread: 0.18, jitter: 0.25 });
  for (let k = 0; k < 14; k++) { const x = t.r() * S, y = t.r() * S; t.set(x, y, hex('#b6b77a')); t.set(x + 1, y, hex('#c8ca8a')); t.setH(x, y, 0.1); }
});
P('end_stone_bricks', (t) => bricks(t, { base: '#dbe0a2', mortar: '#a9ad74', rows: 4, bw: 16, bevel: true }));
P('purpur_block', (t) => {
  t.each((x, y) => {
    const lx = x % 16, ly = y % 16;
    const edge = lx === 0 || ly === 0;
    const v = clamp01(t.n(0).at(x, y, 8) * 0.5 + 0.3 + (t.r() - 0.5) * 0.15);
    t.set(x, y, edge ? hex('#7d5a7d') : pal(palette('#a97da9', 4, 0.25), v)); t.setH(x, y, edge ? 0.2 : 0.6); t.setS(x, y, 0.25);
  });
});
P('purpur_pillar', (t) => { t.each((x, y) => { const g = x % 8; t.set(x, y, mul(pal(palette('#ab81ab', 4, 0.2), t.r()), g === 0 ? 0.7 : g === 1 ? 1.12 : 1)); t.setH(x, y, g === 0 ? 0.2 : 0.6); }); });
P('purpur_pillar_top', (t) => { noisy(t, '#ab81ab', { p: 8, spread: 0.15 }); frame(t, hex('#8a628a'), 3); });
P('end_rod', (t) => {
  t.clear(); t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
  t.rect(0, 0, 4, 30, hex('#f8f4ec')); t.rect(3, 0, 4, 30, hex('#d8d0c4'));
  t.rect(4, 4, 12, 14, hex('#c8b8a8'));
  for (let y = 0; y < 30; y++) for (let x = 0; x < 4; x++) t.setE(x, y, 0.9);
});
P('chorus_plant', (t) => { noisy(t, '#5e3a5e', { p: 8, spread: 0.5 }); speckle(t, [hex('#8a5e8a'), hex('#3a213a')], 0.15); });
P('chorus_flower', (t) => { noisy(t, '#9a7a9a', { p: 8, spread: 0.4 }); frame(t, hex('#6a4a6a'), 2); });
P('end_portal_frame_side', (t) => {
  PAINTERS.get('end_stone')(t);
  t.rect(0, 0, 32, 6, hex('#3a6a5e'), 1, 0.8);
  for (let x = 2; x < 30; x += 6) t.rect(x, 1, x + 3, 4, hex('#6fc3a8'), 1, 0.9);
});
P('end_portal_frame_top', (t) => {
  t.each((x, y) => { const v = t.n(0).at(x, y, 8); t.set(x, y, mix(hex('#2f5a52'), hex('#4f8a7a'), v)); t.setS(x, y, 0.5); });
  t.rect(8, 8, 24, 24, hex('#18302b'), 1, 0.2);
  frame(t, hex('#d6d9a0'), 2);
});
P('end_portal_frame_eye', (t) => {
  t.each((x, y) => { const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy); t.set(x, y, d < 5 ? hex('#0a1a12') : mix(hex('#1f7a52'), hex('#6fe0a8'), clamp01(1 - d / 22))); t.setS(x, y, 0.9); t.setE(x, y, d < 5 ? 0 : 0.4); });
});
P('end_portal', (t) => { t.each((x, y) => { t.set(x, y, hex('#050510')); if (t.r() < 0.05) { t.set(x, y, mix(hex('#3f7a8a'), hex('#c8f0ff'), t.r())); t.setE(x, y, 1); } }); t.flatNormal = true; });
P('end_gateway', (t) => PAINTERS.get('end_portal')(t));
P('dragon_egg', (t) => { noisy(t, '#0d0912', { p: 8, spread: 0.6, smooth: 0.7 }); speckle(t, [hex('#5a1f7a'), hex('#2a0f3a')], 0.1); });

// -------------------------------------------------------------- DEEP DARK
const SCULK = (t) => {
  t.each((x, y) => {
    const v = clamp01(t.n(0).fbm(x, y, 8, 2) * 1.2 - 0.1 + (t.r() - 0.5) * 0.2);
    t.set(x, y, pal([hex('#05141a'), hex('#0a2029'), hex('#0e2d38'), hex('#123a47')], v)); t.setH(x, y, v); t.setS(x, y, 0.35);
    if (t.n(2).at(x, y, 16) > 0.72 && t.r() < 0.5) { t.set(x, y, hex('#2ad0e0')); t.setE(x, y, 0.85); }
  });
};
P('sculk', SCULK);
P('sculk_catalyst_side', (t) => { PAINTERS.get('deepslate')(t); for (let x = 0; x < S; x++) for (let y = 0; y < 10; y++) { const c = t.r(); t.set(x, y, c < 0.2 ? hex('#2ad0e0') : hex('#0a2029')); if (c < 0.2) t.setE(x, y, 0.8); } });
P('sculk_catalyst_top', (t) => { SCULK(t); t.rect(10, 10, 22, 22, hex('#d8e4c4'), 1, 0.8); t.rect(13, 13, 19, 19, hex('#2ad0e0'), 1, 0.9); for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) t.setE(x, y, 1); });
P('sculk_catalyst_bottom', (t) => PAINTERS.get('deepslate')(t));
P('sculk_sensor_side', (t) => { SCULK(t); t.rect(0, 0, 32, 16, hex('#0a2029'), 1, 0.4); });
P('sculk_sensor_top', (t) => { SCULK(t); frame(t, hex('#0e3640'), 2); });
P('sculk_sensor_bottom', SCULK);
P('sculk_sensor_tendril', (t) => crossPlant(t, () => { for (const x of [8, 16, 24]) for (let y = 8; y < 32; y++) { t.set(x + Math.sin(y * 0.4) * 1.5, y, hex('#2ad0e0')); t.setE(x + Math.sin(y * 0.4) * 1.5, y, 1); } }));
P('sculk_shrieker_side', (t) => { SCULK(t); t.rect(0, 0, 32, 16, [0, 0, 0], 0); });
P('sculk_shrieker_top', (t) => { PAINTERS.get('sculk_shrieker_inner')(t); });
P('sculk_shrieker_bottom', SCULK);
P('sculk_shrieker_can', (t) => { noisy(t, '#d6d6b8', { p: 8, spread: 0.15 }); t.each((x, y) => { if (y < 4) t.set(x, y, [0, 0, 0], 0); }); });
P('sculk_shrieker_inner', (t) => { t.each((x, y) => { const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy); t.set(x, y, d < 9 ? mix(hex('#1a4a5a'), hex('#5ce1e6'), clamp01(1 - d / 9)) : hex('#d6d6b8')); t.setE(x, y, d < 9 ? 0.6 : 0); }); });
const skullTex = (faceDetails) => (t) => {
  noisy(t, '#2a2a2a', { p: 8, spread: 0.35 });
  if (faceDetails) {
    t.rect(6, 10, 13, 16, hex('#0a0a0a'), 1, 0.1); t.rect(19, 10, 26, 16, hex('#0a0a0a'), 1, 0.1);
    t.rect(14, 18, 18, 21, hex('#0a0a0a'), 1, 0.1);
    for (let x = 7; x < 25; x += 3) t.rect(x, 24, x + 2, 28, hex('#5a5a5a'), 1, 0.7);
  }
};
P('wither_skull', skullTex(true));
P('wither_skull_side', skullTex(false));
P('wither_skull_top', skullTex(false));
P('wither_skull_back', skullTex(false));

// fissures de minage (overlay)
for (let s = 0; s < 10; s++) {
  P('destroy_stage_' + s, (t) => {
    t.each((x, y) => t.set(x, y, [0, 0, 0], 0));
    const rng = new RNG(777);
    const cracks = 3 + s * 3;
    for (let k = 0; k < cracks; k++) {
      let x = 16 + (rng.next() - 0.5) * (6 + s * 2.5), y = 16 + (rng.next() - 0.5) * (6 + s * 2.5);
      const a0 = rng.next() * Math.PI * 2;
      const len = 3 + rng.next() * (4 + s * 1.4);
      for (let i = 0; i < len; i++) {
        t.set(x, y, [20, 20, 20], 0.85);
        const a = a0 + (rng.next() - 0.5) * 1.6;
        x += Math.cos(a); y += Math.sin(a);
      }
    }
  });
}

// ===================================================== CONSTRUCTION FINALE
export function tileIndex(name) {
  const i = TILE_INDEX[name];
  if (i === undefined) {
    if (!tileIndex.warned) tileIndex.warned = new Set();
    if (!tileIndex.warned.has(name)) { tileIndex.warned.add(name); console.warn('Texture manquante:', name); }
    return TILE_INDEX.__missing;
  }
  return i;
}

let built = null;
export function buildTiles() {
  if (built) return built;
  const names = [...PNAMES, '__missing'];
  const count = names.length;
  const albedo = new Uint8Array(N * 4 * count);
  const material = new Uint8Array(N * 4 * count);
  const tiles = {};
  let seed = 1;
  names.forEach((name, layer) => {
    const t = new Tile(name, seed++ * 7717);
    if (name === '__missing') { t.each((x, y) => t.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? [255, 0, 255] : [0, 0, 0])); }
    else PAINTERS.get(name)(t);
    tiles[name] = t;
    TILE_INDEX[name] = layer;
    TILE_NAMES[layer] = name;
    bleed(t);
    const off = layer * N * 4;
    for (let i = 0; i < N; i++) {
      albedo[off + i * 4] = Math.max(0, Math.min(255, Math.round(t.c[i * 4])));
      albedo[off + i * 4 + 1] = Math.max(0, Math.min(255, Math.round(t.c[i * 4 + 1])));
      albedo[off + i * 4 + 2] = Math.max(0, Math.min(255, Math.round(t.c[i * 4 + 2])));
      albedo[off + i * 4 + 3] = Math.round(clamp01(t.c[i * 4 + 3]) * 255);
    }
    // normal map depuis la hauteur
    const k = 2.2 * t.normalStrength;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let nx = 0, ny = 0;
      if (!t.flatNormal) {
        const hl = t.getH(x - 1, y), hr = t.getH(x + 1, y), hu = t.getH(x, y - 1), hd = t.getH(x, y + 1);
        nx = (hl - hr) * k; ny = (hu - hd) * k;
      }
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      material[off + i * 4] = Math.round((nx / len * 0.5 + 0.5) * 255);
      material[off + i * 4 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      material[off + i * 4 + 2] = Math.round(clamp01(t.sm[i]) * 255);
      material[off + i * 4 + 3] = Math.round(clamp01(t.em[i]) * 255);
    }
  });
  built = { albedo, material, count, size: S, tiles };
  return built;
}

// Propage la couleur dans les pixels transparents (évite les franges sombres des mipmaps)
function bleed(t) {
  const c = t.c;
  for (let pass = 0; pass < 4; pass++) {
    const copy = c.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (copy[i + 3] > 0.01) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (wrap(y + dy) * S + wrap(x + dx)) * 4;
        if (copy[j + 3] > 0.01 || (copy[j] + copy[j + 1] + copy[j + 2]) > 0 && pass > 0) { r += copy[j]; g += copy[j + 1]; b += copy[j + 2]; n++; }
      }
      if (n) { c[i] = r / n; c[i + 1] = g / n; c[i + 2] = b / n; }
    }
  }
}

// Dessine une tuile sur un canvas 2D (pour les icônes)
export function tileToImageData(name, ctx, tint) {
  const b = buildTiles();
  const layer = TILE_INDEX[name] ?? TILE_INDEX.__missing;
  const img = ctx.createImageData(S, S);
  const off = layer * N * 4;
  for (let i = 0; i < N * 4; i += 4) {
    let r = b.albedo[off + i], g = b.albedo[off + i + 1], bl = b.albedo[off + i + 2], a = b.albedo[off + i + 3];
    if (a > 140 && a < 175) { // pixel teinté
      if (tint) { r = r * tint[0]; g = g * tint[1]; bl = bl * tint[2]; }
      a = 255;
    } else if (a < 102) a = a < 10 ? 0 : Math.max(a, 90);
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = a;
  }
  return img;
}
