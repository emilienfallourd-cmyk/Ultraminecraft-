// Icônes d'objets : blocs en vue isométrique 3D (rendu des modèles) et sprites pixel-art procéduraux
import { BLOCKS } from '../blocks/blocks.js';
import { ITEMS } from '../items/items.js';
import { tileToImageData, S as TS, TILE_NAMES } from './textures.js';
import { bakeModel } from '../world/mesher.js';

const SIZE = 64;
const cache = new Map();
const tileCanvases = new Map();
const TINT = { 1: [0.47, 0.74, 0.32], 2: [0.42, 0.7, 0.22], 3: [0.25, 0.46, 0.9], 4: [0.38, 0.6, 0.38], 5: [0.5, 0.65, 0.33], 6: [0.13, 0.5, 0.19] };

function tileCanvas(name, tint, shade) {
  const key = name + '|' + (tint || '') + '|' + shade;
  let c = tileCanvases.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = TS; c.height = TS;
  const ctx = c.getContext('2d');
  const img = tileToImageData(name, ctx, tint ? TINT[tint] : null);
  if (shade !== 1) for (let i = 0; i < img.data.length; i += 4) { img.data[i] *= shade; img.data[i + 1] *= shade; img.data[i + 2] *= shade; }
  ctx.putImageData(img, 0, 0);
  tileCanvases.set(key, c);
  return c;
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FV = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];

function cubeQuads(def, meta) {
  const quads = [];
  for (let f = 0; f < 6; f++) {
    let t = def.tex[f];
    if (def.facing && f === 4 && def.texFront) t = def.texFront;
    quads.push({ verts: FV[f], n: DIRS[f], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], tileName: t, tint: !!def.tint });
  }
  return quads;
}

const P = (v, k) => [SIZE / 2 + ((v[0] - 0.5) - (v[2] - 0.5)) * k * 0.866, SIZE / 2 + ((v[0] - 0.5) + (v[2] - 0.5)) * k * 0.5 - (v[1] - 0.5) * k];

function drawIso(ctx, quads, tint) {
  const k = 31;
  const vis = quads.filter((q) => q.n[0] + q.n[1] * 1.2 + q.n[2] > 0.01);
  vis.sort((a, b) => {
    const da = a.verts.reduce((s, v) => s + v[0] + v[1] + v[2], 0), db = b.verts.reduce((s, v) => s + v[0] + v[1] + v[2], 0);
    return da - db;
  });
  for (const q of vis) {
    const shade = q.n[1] > 0.5 ? 1 : q.n[0] > 0.5 ? 0.62 : q.n[2] > 0.5 ? 0.8 : 0.7;
    const img = tileCanvas(q.tileName, q.tint ? tint : 0, shade);
    const [uBL, vBL] = q.uv[0], [uBR] = q.uv[1], [, vTL] = q.uv[3];
    const sBL = P(q.verts[0], k), sBR = P(q.verts[1], k), sTL = P(q.verts[3], k);
    const du = uBR - uBL, dv = vBL - vTL;
    if (Math.abs(du) < 1e-4 || Math.abs(dv) < 1e-4) continue;
    // repère image : origine = coin (uMin, vMin)
    const ex = [(sBR[0] - sBL[0]) / du, (sBR[1] - sBL[1]) / du];
    const ey = [(sBL[0] - sTL[0]) / dv, (sBL[1] - sTL[1]) / dv];
    const u0 = Math.min(uBL, uBR), v0 = Math.min(vTL, vBL);
    const ox = sTL[0] + (u0 - uBL) * ex[0] + (v0 - vTL) * ey[0];
    const oy = sTL[1] + (u0 - uBL) * ex[1] + (v0 - vTL) * ey[1];
    const sw = Math.abs(du), sh = Math.abs(dv);
    ctx.save();
    ctx.setTransform(ex[0] / TS, ex[1] / TS, ey[0] / TS, ey[1] / TS, ox, oy);
    // léger débordement pour éviter les joints
    ctx.drawImage(img, u0 * TS, v0 * TS, sw * TS, sh * TS, -0.15, -0.15, sw * TS + 0.3, sh * TS + 0.3);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function blockIcon(def, ctx) {
  if (def.shape === 'cross' || (def.shape === 'model' && ['torch', 'crop', 'vine', 'lily_pad', 'ladder', 'fire', 'petals', 'bars', 'lantern', 'door', 'portal', 'end_rod', 'bamboo'].includes(def.model))) {
    const name = def.key === 'oak_door' ? 'oak_door_bottom' : def.model === 'bars' ? 'iron_bars' : def.model === 'lantern' ? null : def.tex[0];
    ctx.imageSmoothingEnabled = false;
    if (def.model === 'lantern') {
      drawIso(ctx, bakeModel(def, 0, DUMMY).map((q) => ({ ...q, tileName: def.tex[0] })), def.tint);
      return;
    }
    if (def.key === 'oak_door') {
      ctx.drawImage(tileCanvas('oak_door_top', 0, 1), 12, 0, 40, 32);
      ctx.drawImage(tileCanvas('oak_door_bottom', 0, 1), 12, 32, 40, 32);
      return;
    }
    const tn = def.tall ? def.key + '_top' : name;
    const useTop = def.tall && (def.key === 'rose_bush' || def.key === 'lilac');
    ctx.drawImage(tileCanvas(useTop ? tn : name, def.tint, 1), 0, 0, SIZE, SIZE);
    return;
  }
  let quads;
  if (def.shape === 'model' && def.modelFn) {
    quads = bakeModel(def, def.key.endsWith('_slab') ? 0 : def.facing ? 0 : 0, DUMMY).map((q) => ({ ...q, tileName: tileNameOf(q.tile) }));
  } else if (def.shape === 'fluid') {
    quads = cubeQuads(def, 0);
  } else quads = cubeQuads(def, 0);
  drawIso(ctx, quads, def.tint);
}

let TILE_NAMES_REF = null;
function tileNameOf(idx) { return TILE_NAMES_REF[idx]; }
const DUMMY = { id: () => 0, meta: () => 0, hash: 0 };

// =============================================================== SPRITES
const G = 16;
class Spr {
  constructor() { this.p = new Array(G * G).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < G && y >= 0 && y < G) this.p[y * G + x] = c; }
  get(x, y) { return x >= 0 && x < G && y >= 0 && y < G ? this.p[y * G + x] : null; }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) this.set(x + a, y + b, typeof c === 'function' ? c(i / n) : c);
    }
  }
  circle(cx, cy, r, c) { for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r) this.set(x, y, typeof c === 'function' ? c(d / r, x, y) : c); } }
  ellipse(cx, cy, rx, ry, c) { for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (d <= 1) this.set(x, y, typeof c === 'function' ? c(d, x, y) : c); } }
  poly(pts, c) {
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
  ascii(rows, pal) { rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && ch !== ' ' && pal[ch]) this.set(x, y, pal[ch]); })); }
  // contour sombre + ombrage
  finish(outline = true) {
    if (outline) {
      const add = [];
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (this.get(x, y)) continue;
        let n = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.get(x + dx, y + dy) && !this.get(x + dx, y + dy).noOutline) n = true;
        if (n) add.push([x, y]);
      }
      for (const [x, y] of add) this.p[y * G + x] = '#1a1a1a';
    }
    return this;
  }
}
const sh = (hex, f) => {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * f)), g = Math.min(255, Math.round(((v >> 8) & 255) * f)), b = Math.min(255, Math.round((v & 255) * f));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};
const STICK = ['#a37b45', '#7a5a2e', '#5e4423'];

function handle(s, len = 9) {
  // manche en diagonale du coin bas-gauche vers le centre
  for (let i = 0; i < len; i++) { s.set(2 + i, 13 - i, STICK[i % 2 ? 1 : 0]); s.set(3 + i, 13 - i, STICK[2]); }
}
const TOOL_SPR = {
  pickaxe(s, c) {
    handle(s, 9);
    const C = [sh(c, 1.25), c, sh(c, 0.75)];
    s.ascii([
      '................',
      '....AAAAAA......',
      '..AABBBBBBAA....',
      '.ABB......BBA...',
      '.AB........BBA..',
      '.A..........BA..',
      '.............BA.',
      '.............BA.',
      '..............A.',
      '..............A.',
    ], { A: C[2], B: C[0] });
    s.set(11, 2, C[1]); s.set(12, 3, C[1]);
  },
  axe(s, c) {
    handle(s, 10);
    const C = [sh(c, 1.25), c, sh(c, 0.75)];
    s.poly([[7, 1], [12, 1], [14, 4], [14, 8], [11, 7], [9, 5]], (x, y) => (x + y < 11 ? C[0] : x > 12 ? C[2] : C[1]));
  },
  shovel(s, c) {
    handle(s, 8);
    const C = [sh(c, 1.25), c, sh(c, 0.75)];
    s.poly([[9.5, 1.5], [14.5, 1.5], [14.5, 6.5], [11.5, 7.5], [8.5, 4.5]], (x, y) => (y < 3 ? C[0] : x > 12 ? C[2] : C[1]));
  },
  sword(s, c) {
    const C = [sh(c, 1.3), c, sh(c, 0.7)];
    for (let i = 0; i < 10; i++) { s.set(5 + i, 10 - i, C[0]); s.set(6 + i, 10 - i, C[1]); s.set(5 + i, 11 - i, C[2]); }
    s.set(14, 1, C[0]); s.set(14, 0, C[1]);
    s.line(2, 9, 6, 13, '#4a3a20'); s.line(3, 9, 7, 13, '#6b5130');
    for (let i = 0; i < 3; i++) { s.set(2 + i, 13 - i, STICK[0]); s.set(3 + i, 13 - i, STICK[2]); }
    s.set(1, 14, '#4a3a20');
  },
  hoe(s, c) {
    handle(s, 10);
    const C = [sh(c, 1.25), c, sh(c, 0.75)];
    s.rect(7, 2, 12, 3, C[1]); s.rect(7, 2, 9, 2, C[0]); s.rect(6, 3, 7, 5, C[2]);
  },
};

function itemSprite(def) {
  const s = new Spr();
  const k = def.key;
  const col = def.color || '#cccccc';
  if (def.tool && TOOL_SPR[def.tool]) {
    const tierCol = { wooden: '#9a7440', stone: '#8c8c8c', iron: '#e6e6e6', golden: '#f9da4a', diamond: '#53e3dc', netherite: '#4f474b' }[def.tier] || col;
    TOOL_SPR[def.tool](s, tierCol);
    return s.finish();
  }
  if (def.armor && !k.includes('elytra')) {
    const c = def.color || '#aaa';
    const C = [sh(c, 1.25), c, sh(c, 0.72)];
    const slot = def.armor.slot;
    if (slot === 0) s.ascii(['', '', '', '...AAAAAAAAA....', '..ABBBBBBBBBA...', '..AB.......BA...', '..AB.......BA...', '..AC.......CA...', '..AC.......CA...'], { A: C[2], B: C[0], C: C[1] });
    if (slot === 1) s.ascii(['', '..AAA.....AAA...', '..ABBA...ABBA...', '..ABBBAAABBBA...', '...ABBBBBBBA....', '...ABBBBBBBA....', '...ACBBBBBCA....', '...ACCBBBCCA....', '...ACCCCCCCA....', '...ACCCCCCCA....', '...AAAAAAAAA....'], { A: C[2], B: C[0], C: C[1] });
    if (slot === 2) s.ascii(['', '', '...AAAAAAAAA....', '...ABBBBBBBA....', '...ABBBBBBBA....', '...ABBA.ABBA....', '...ACCA.ACCA....', '...ACCA.ACCA....', '...ACCA.ACCA....', '...ACCA.ACCA....', '...AAAA.AAAA....'], { A: C[2], B: C[0], C: C[1] });
    if (slot === 3) s.ascii(['', '', '', '', '', '', '...AAA...AAA....', '...ABA...ABA....', '...ABA...ABA....', '..AABA...ABAA...', '..ACCA...ACCA...', '..AAAA...AAAA...'], { A: C[2], B: C[0], C: C[1] });
    return s.finish(false);
  }
  if (def.use === 'spawn_egg') {
    const [a, b] = def.colors;
    s.ellipse(8, 8.5, 4.6, 6.2, (d, x, y) => ((x * 7 + y * 13) % 11 < 3 ? b : d > 0.75 ? sh(a, 0.75) : x < 7 && y < 7 ? sh(a, 1.2) : a));
    return s.finish();
  }
  const paint = SPRITES[k] || SPRITES[genericKind(k)];
  if (paint) paint(s, def);
  else s.circle(8, 8, 5, col);
  return s.finish();
}

function genericKind(k) {
  if (k.endsWith('_ingot')) return '__ingot';
  if (k.endsWith('_nugget')) return '__nugget';
  if (k.startsWith('raw_')) return '__raw';
  if (k.startsWith('cooked_')) return '__cooked';
  return null;
}
const METAL = { iron: '#e4e4e4', gold: '#fcd843', copper: '#e0794f', netherite: '#4d4448' };
const SPRITES = {
  stick: (s) => { for (let i = 0; i < 12; i++) { s.set(2 + i, 13 - i, STICK[0]); s.set(3 + i, 13 - i, STICK[2]); } },
  __ingot: (s, d) => { const c = METAL[d.key.split('_')[0]] || '#ccc'; s.poly([[2, 9], [9, 5], [14, 7], [7, 11]], (x, y) => (y < 8 ? sh(c, 1.2) : c)); s.poly([[2, 9], [7, 11], [7, 13], [2, 11]], sh(c, 0.7)); s.poly([[7, 11], [14, 7], [14, 9], [7, 13]], sh(c, 0.85)); },
  __nugget: (s, d) => { const c = METAL[d.key.split('_')[0]] || '#ccc'; s.circle(8, 9, 3.2, (r, x, y) => (x + y < 16 ? sh(c, 1.2) : sh(c, 0.8))); s.circle(6, 7, 1.6, sh(c, 1.1)); },
  __raw: (s, d) => { const c = METAL[d.key.split('_')[1]] || '#ccc'; s.circle(8, 8, 5, (r, x, y) => ((x * 3 + y * 5) % 7 < 2 ? sh(c, 0.6) : r > 0.7 ? sh(c, 0.75) : c)); },
  coal: (s) => s.poly([[3, 7], [7, 3], [12, 4], [13, 9], [9, 13], [4, 12]], (x, y) => ((x + y) % 5 === 0 ? '#555' : x + y < 13 ? '#3a3a3a' : '#202020')),
  charcoal: (s) => s.poly([[3, 7], [7, 3], [12, 4], [13, 9], [9, 13], [4, 12]], (x, y) => ((x + y) % 5 === 0 ? '#5a4a3a' : x + y < 13 ? '#3d3026' : '#241c15')),
  diamond: (s) => s.poly([[3, 6], [6, 3], [10, 3], [13, 6], [8, 13]], (x, y) => (y < 6 ? (x < 8 ? '#d3fffb' : '#8ff2ec') : x < 8 ? '#4fd9d2' : '#2aa7a0')),
  emerald: (s) => s.poly([[8, 2], [12, 6], [12, 10], [8, 14], [4, 10], [4, 6]], (x, y) => (x < 8 ? (y < 8 ? '#9dffc1' : '#3edf7c') : y < 8 ? '#41d977' : '#139442')),
  lapis_lazuli: (s) => s.poly([[3, 8], [6, 4], [11, 4], [13, 9], [9, 13], [5, 12]], (x, y) => ((x * y) % 7 === 0 ? '#5d8be8' : '#2650b0')),
  redstone: (s) => { for (let i = 0; i < 18; i++) s.set(4 + (i * 7) % 9, 6 + (i * 5) % 7, i % 3 ? '#d01010' : '#ff5050'); s.rect(6, 8, 10, 10, '#b00c0c'); },
  glowstone_dust: (s) => { for (let i = 0; i < 18; i++) s.set(4 + (i * 7) % 9, 6 + (i * 5) % 7, i % 3 ? '#f7d26a' : '#fff1b5'); s.rect(6, 8, 10, 10, '#e0b040'); },
  blaze_powder: (s) => { for (let i = 0; i < 18; i++) s.set(4 + (i * 7) % 9, 6 + (i * 5) % 7, i % 3 ? '#f7a01a' : '#ffe15a'); s.rect(6, 8, 10, 10, '#e07a10'); },
  gunpowder: (s) => { for (let i = 0; i < 20; i++) s.set(3 + (i * 7) % 10, 6 + (i * 5) % 8, i % 3 ? '#555' : '#777'); s.rect(5, 9, 10, 11, '#444'); },
  sugar: (s) => { for (let i = 0; i < 20; i++) s.set(3 + (i * 7) % 10, 6 + (i * 5) % 8, i % 3 ? '#f2f2f2' : '#d8d8d8'); },
  bone_meal: (s) => { for (let i = 0; i < 20; i++) s.set(3 + (i * 7) % 10, 6 + (i * 5) % 8, i % 3 ? '#f2f2e6' : '#d8d8c8'); },
  quartz: (s) => { s.poly([[4, 12], [6, 4], [8, 3], [9, 11]], '#f0ece4'); s.poly([[9, 11], [10, 6], [12, 5], [12, 12]], '#d8d0c4'); },
  netherite_scrap: (s) => s.poly([[3, 8], [7, 3], [12, 5], [13, 10], [8, 13], [4, 12]], (x, y) => ((x + y) % 4 === 0 ? '#6b5a50' : '#4a3a34')),
  flint: (s) => s.poly([[4, 13], [5, 6], [9, 2], [12, 7], [11, 13]], (x, y) => (x < 8 ? '#5a5a5a' : '#3a3a3a')),
  string: (s) => { for (let y = 2; y < 15; y++) s.set(8 + Math.round(Math.sin(y * 0.9) * 2), y, '#eeeeee'); },
  feather: (s) => { s.line(3, 13, 12, 2, '#cfcfcf'); s.poly([[5, 9], [11, 2], [13, 4], [7, 11]], '#f4f4f4'); s.line(3, 13, 12, 3, '#aaaaaa'); },
  bone: (s) => { s.line(4, 11, 11, 4, '#ece6d2', 2); s.circle(4, 12, 1.6, '#ece6d2'); s.circle(12, 4, 1.6, '#ece6d2'); s.circle(3, 10, 1.3, '#ddd6bf'); s.circle(13, 6, 1.3, '#ddd6bf'); },
  leather: (s) => s.poly([[3, 4], [8, 3], [13, 4], [12, 12], [8, 13], [4, 12]], (x, y) => ((x + y) % 6 === 0 ? '#8a5030' : '#a8653a')),
  rabbit_hide: (s) => s.poly([[3, 4], [8, 3], [13, 4], [12, 12], [8, 13], [4, 12]], '#c09070'),
  paper: (s) => { s.poly([[3, 3], [13, 2], [13, 13], [3, 14]], '#f4f4ec'); for (let y = 5; y < 12; y += 2) s.line(5, y, 11, y, '#d0d0c4'); },
  book: (s) => { s.rect(3, 3, 12, 13, '#7a3a1a'); s.rect(4, 4, 12, 12, '#a04a22'); s.rect(4, 12, 12, 13, '#f0eadc'); s.rect(3, 3, 3, 13, '#5a2a10'); },
  brick: (s) => { s.poly([[2, 9], [9, 5], [14, 7], [7, 11]], '#b0644a'); s.poly([[2, 9], [7, 11], [7, 13], [2, 11]], '#7a3e2c'); s.poly([[7, 11], [14, 7], [14, 9], [7, 13]], '#94503a'); },
  nether_brick: (s) => { s.poly([[2, 9], [9, 5], [14, 7], [7, 11]], '#4a2226'); s.poly([[2, 9], [7, 11], [7, 13], [2, 11]], '#2a1215'); s.poly([[7, 11], [14, 7], [14, 9], [7, 13]], '#3a1a1e'); },
  clay_ball: (s) => s.circle(8, 8, 5, (r, x, y) => (x + y < 14 ? '#b8bfcc' : '#8a92a2')),
  slime_ball: (s) => s.circle(8, 8, 5, (r, x, y) => (x + y < 13 ? '#9ae37a' : r > 0.8 ? '#4a9a3a' : '#6cc04f')),
  magma_cream: (s) => s.circle(8, 8, 5, (r, x, y) => ((x * y) % 5 === 0 ? '#ffd040' : r > 0.75 ? '#7a2a10' : '#c8501a')),
  snowball: (s) => s.circle(8, 8, 5, (r, x, y) => (x + y < 13 ? '#ffffff' : '#d8e6f0')),
  ender_pearl: (s) => s.circle(8, 8, 5, (r, x, y) => (r < 0.35 ? '#2a8a6a' : x + y < 13 ? '#3fbf9a' : '#1a5a4a')),
  ender_eye: (s) => { s.circle(8, 8, 5.2, (r, x, y) => (r < 0.35 ? '#0a2a1a' : r < 0.6 ? '#6ae07a' : '#2a8a5a')); s.rect(7, 4, 8, 12, '#0a2a1a'); },
  ghast_tear: (s) => s.poly([[8, 2], [11, 8], [10, 12], [6, 12], [5, 8]], (x, y) => (x < 8 ? '#e8ffff' : '#b0d8e0')),
  blaze_rod: (s) => { for (let i = 0; i < 12; i++) { s.set(2 + i, 13 - i, i % 3 ? '#f8c83a' : '#fff3a0'); s.set(3 + i, 13 - i, '#c8801a'); } },
  nether_star: (s) => { s.poly([[8, 1], [10, 6], [15, 8], [10, 10], [8, 15], [6, 10], [1, 8], [6, 6]], (x, y) => (Math.abs(x - 8) + Math.abs(y - 8) < 3 ? '#ffffff' : '#e0f0ff')); },
  echo_shard: (s) => s.poly([[5, 13], [7, 3], [10, 2], [11, 12]], (x, y) => (x < 8 ? '#2ad0e0' : '#0e6a7a')),
  amethyst_shard: (s) => s.poly([[5, 13], [7, 3], [10, 2], [11, 12]], (x, y) => (x < 8 ? '#cfa0ff' : '#7a4ac0')),
  prismarine_crystals: (s) => { s.circle(6, 9, 3, '#c8f0e0'); s.circle(10, 6, 3, '#9ae0c8'); s.circle(10, 11, 2, '#e8fff8'); },
  prismarine_shard: (s) => s.poly([[4, 12], [8, 2], [12, 12]], '#6ab8a0'),
  arrow: (s) => { s.line(3, 12, 12, 3, '#8a6a3a'); s.poly([[10, 2], [14, 2], [14, 6]], '#c0c0c0'); s.line(2, 11, 4, 13, '#eeeeee'); s.line(3, 10, 5, 12, '#dddddd'); },
  bow: (s) => { for (let i = 0; i < 12; i++) { const t = i / 11; s.set(2 + i, 13 - i - Math.round(Math.sin(t * Math.PI) * 0), STICK[0]); } s.line(3, 3, 13, 13, '#e8e8e8'); s.line(3, 3, 3, 8, '#7a5a2e', 1); s.line(3, 3, 8, 3, '#7a5a2e', 1); s.line(13, 13, 13, 8, '#7a5a2e'); s.line(13, 13, 8, 13, '#7a5a2e'); },
  crossbow: (s) => { s.line(3, 12, 12, 3, '#6b5130', 2); s.line(4, 4, 12, 12, '#7a5a2e', 1); s.line(4, 4, 12, 12, '#cfcfcf'); },
  trident: (s) => { s.line(3, 13, 11, 5, '#4fa8a0', 2); s.line(9, 3, 13, 7, '#7fe8d8'); s.line(11, 1, 11, 5, '#7fe8d8'); s.line(15, 5, 11, 5, '#7fe8d8'); },
  flint_and_steel: (s) => { s.poly([[3, 6], [7, 3], [9, 5], [5, 9]], '#5a5a5a'); s.poly([[8, 9], [12, 6], [13, 11], [9, 13]], '#c8c8c8'); s.line(9, 9, 11, 12, '#888'); },
  fire_charge: (s) => s.circle(8, 8, 5, (r, x, y) => ((x * 7 + y * 3) % 5 === 0 ? '#ffd040' : r > 0.7 ? '#3a1a10' : '#a03010')),
  bucket: (s) => { s.poly([[3, 4], [13, 4], [11, 13], [5, 13]], (x, y) => (x < 7 ? '#d8d8d8' : '#a8a8a8')); s.rect(4, 4, 12, 5, '#6a6a6a'); },
  water_bucket: (s) => { SPRITES.bucket(s); s.rect(5, 4, 11, 5, '#3a6ae0'); },
  lava_bucket: (s) => { SPRITES.bucket(s); s.rect(5, 4, 11, 5, '#ff8a1a'); s.set(7, 4, '#ffe060'); },
  milk_bucket: (s) => { SPRITES.bucket(s); s.rect(5, 4, 11, 5, '#ffffff'); },
  shears: (s) => { s.poly([[3, 3], [9, 9], [8, 10], [2, 4]], '#d0d0d0'); s.poly([[13, 3], [7, 9], [8, 10], [14, 4]], '#a8a8a8'); s.circle(5, 12, 2, '#8a2a2a'); s.circle(11, 12, 2, '#8a2a2a'); },
  fishing_rod: (s) => { s.line(2, 14, 13, 2, '#7a5a2e'); s.line(13, 2, 13, 12, '#e8e8e8'); s.rect(12, 12, 13, 13, '#c0c0c0'); },
  apple: (s) => { s.circle(8, 9, 5.2, (r, x, y) => (x < 7 && y < 8 ? '#ff6a5a' : r > 0.8 ? '#8a1010' : '#d01818')); s.line(8, 2, 8, 4, '#5a3a1a'); s.rect(9, 2, 10, 3, '#3a9a2a'); },
  golden_apple: (s) => { s.circle(8, 9, 5.2, (r, x, y) => (x < 7 && y < 8 ? '#fff4a0' : r > 0.8 ? '#b88a10' : '#f2c830')); s.line(8, 2, 8, 4, '#5a3a1a'); s.rect(9, 2, 10, 3, '#3a9a2a'); },
  enchanted_golden_apple: (s) => { SPRITES.golden_apple(s); s.set(5, 6, '#ff9aff'); s.set(10, 10, '#ff9aff'); s.set(7, 11, '#e0a0ff'); },
  bread: (s) => s.ellipse(8, 9, 6.5, 3.5, (d, x, y) => (y < 8 ? '#c8902a' : d > 0.8 ? '#7a4a12' : '#a8701e')),
  porkchop: (s) => { s.ellipse(8, 8, 6, 4.5, (d, x) => (d > 0.8 ? '#c86070' : '#f09aa8')); s.ellipse(6, 7, 2, 1.5, '#ffd8dc'); },
  cooked_porkchop: (s) => { s.ellipse(8, 8, 6, 4.5, (d, x) => (d > 0.8 ? '#7a4020' : '#c88050')); s.ellipse(6, 7, 2, 1.5, '#e8c090'); },
  beef: (s) => { s.ellipse(8, 8, 6, 5, (d) => (d > 0.8 ? '#8a1a1a' : '#d03838')); s.line(4, 7, 11, 9, '#ffd0d0'); },
  cooked_beef: (s) => { s.ellipse(8, 8, 6, 5, (d) => (d > 0.8 ? '#4a2010' : '#8a4a24')); s.line(4, 7, 11, 9, '#b07040'); },
  chicken: (s) => { s.ellipse(7, 7, 5, 4.5, '#f4c8b0'); s.line(10, 10, 13, 13, '#f0e8e0', 2); },
  cooked_chicken: (s) => { s.ellipse(7, 7, 5, 4.5, '#c88040'); s.line(10, 10, 13, 13, '#f0e8e0', 2); },
  mutton: (s) => { s.ellipse(8, 8, 5.5, 4.5, '#d84a4a'); s.circle(8, 8, 1.6, '#f4e0e0'); },
  cooked_mutton: (s) => { s.ellipse(8, 8, 5.5, 4.5, '#8a4020'); s.circle(8, 8, 1.6, '#e8d0c0'); },
  cod: (s) => { s.ellipse(7, 8, 5.5, 3, (d, x) => (d > 0.8 ? '#8a7a5a' : '#c8b088')); s.poly([[11, 8], [15, 5], [15, 11]], '#a89068'); s.set(4, 7, '#1a1a1a'); },
  cooked_cod: (s) => { s.ellipse(7, 8, 5.5, 3, '#d8b880'); s.poly([[11, 8], [15, 5], [15, 11]], '#b89860'); },
  salmon: (s) => { s.ellipse(7, 8, 5.5, 3, '#c85048'); s.poly([[11, 8], [15, 5], [15, 11]], '#a83a32'); },
  cooked_salmon: (s) => { s.ellipse(7, 8, 5.5, 3, '#d8805a'); s.poly([[11, 8], [15, 5], [15, 11]], '#b8603a'); },
  carrot: (s) => { s.poly([[3, 13], [11, 4], [13, 6]], (x, y) => (x + y < 16 ? '#ff9a2a' : '#d06a10')); s.line(11, 4, 14, 1, '#3a9a2a'); s.line(12, 5, 15, 3, '#4ab03a'); },
  golden_carrot: (s) => { s.poly([[3, 13], [11, 4], [13, 6]], '#f2c830'); s.line(11, 4, 14, 1, '#d8b020'); },
  potato: (s) => s.ellipse(8, 8, 5, 4, (d, x, y) => ((x * y) % 7 === 0 ? '#8a6a30' : d > 0.8 ? '#a8803a' : '#d8b060')),
  baked_potato: (s) => s.ellipse(8, 8, 5, 4, (d, x, y) => (y < 7 ? '#f0d080' : d > 0.8 ? '#8a5a20' : '#c89040')),
  melon_slice: (s) => { s.poly([[2, 4], [14, 4], [8, 14]], (x, y) => (y < 6 ? '#3a8a20' : (x + y) % 5 === 0 ? '#1a1a1a' : '#e83a3a')); },
  sweet_berries: (s) => { s.circle(6, 9, 2.4, '#c41e3a'); s.circle(10, 10, 2.4, '#a8102a'); s.circle(8, 6, 2.2, '#d82a4a'); s.line(8, 2, 8, 4, '#3a6a2a'); },
  cookie: (s) => { s.circle(8, 8, 5.5, '#c88a3a'); for (const [x, y] of [[6, 6], [10, 7], [7, 10], [10, 10]]) s.set(x, y, '#4a2a10'); },
  pumpkin_pie: (s) => { s.ellipse(8, 9, 6.5, 4, '#e0a050'); s.ellipse(8, 8, 5, 2.5, '#d06a20'); },
  mushroom_stew: (s) => { s.ellipse(8, 10, 6, 3.5, '#8a5a2e'); s.ellipse(8, 8.5, 5, 2, '#c89a6a'); },
  bowl: (s) => { s.ellipse(8, 10, 6, 3.5, '#8a5a2e'); s.ellipse(8, 8.5, 5, 1.6, '#5a3a1a'); },
  rotten_flesh: (s) => s.poly([[3, 6], [8, 3], [13, 6], [12, 12], [5, 13]], (x, y) => ((x + y * 2) % 5 === 0 ? '#5a7a2a' : '#a85a3a')),
  spider_eye: (s) => { s.circle(8, 8, 5, '#8a1a2a'); s.circle(7, 7, 2, '#ff5a6a'); },
  chorus_fruit: (s) => s.circle(8, 8, 5, (r, x, y) => ((x + y) % 3 === 0 ? '#d8a0d8' : '#8a5a8a')),
  dried_kelp: (s) => s.poly([[4, 4], [12, 3], [12, 12], [4, 13]], '#3a4a20'),
  honey_bottle: (s) => { s.poly([[5, 6], [11, 6], [12, 13], [4, 13]], '#f2b030'); s.rect(6, 3, 10, 5, '#c0c0c0'); },
  wheat: (s) => { for (const x of [5, 8, 11]) { s.line(x, 14, x + 1, 4, '#c8a83a'); s.rect(x - 1, 3, x + 1, 7, '#e0c050'); } },
  wheat_seeds: (s) => { for (const [x, y] of [[5, 8], [8, 6], [10, 9], [7, 11], [11, 6]]) { s.set(x, y, '#3a9a2a'); s.set(x + 1, y, '#2a7a1a'); } },
  beetroot_seeds: (s) => { for (const [x, y] of [[5, 8], [8, 6], [10, 9], [7, 11]]) { s.set(x, y, '#c8a070'); s.set(x + 1, y, '#a88050'); } },
  nether_wart: (s) => { s.circle(6, 9, 3, '#a01a1a'); s.circle(10, 8, 3, '#c02a2a'); s.line(8, 13, 8, 10, '#5a0a0a'); },
  kelp_item: (s) => { for (let y = 1; y < 15; y++) s.set(8 + Math.round(Math.sin(y * 0.6) * 2), y, '#4a8a2a'); },
  egg: (s) => s.ellipse(8, 8.5, 4, 5.5, (d, x, y) => (x < 7 && y < 7 ? '#fff4e0' : d > 0.8 ? '#c8a888' : '#e8d4b8')),
  experience_bottle: (s) => { s.poly([[5, 6], [11, 6], [12, 13], [4, 13]], '#7ae04a'); s.rect(6, 3, 10, 5, '#c0c0c0'); s.set(7, 9, '#e0ffa0'); },
  glass_bottle: (s) => { s.poly([[5, 6], [11, 6], [12, 13], [4, 13]], '#d0e8f0'); s.rect(6, 3, 10, 5, '#c0c0c0'); },
  dragon_breath: (s) => { s.poly([[5, 6], [11, 6], [12, 13], [4, 13]], '#c86ae0'); s.rect(6, 3, 10, 5, '#c0c0c0'); },
  candle: (s) => { s.rect(6, 6, 9, 14, '#e8dcc0'); s.line(7, 4, 7, 5, '#2a2a2a'); s.set(7, 3, '#ffb030'); },
  saddle: (s) => { s.ellipse(8, 8, 6, 4, '#8a4a2a'); s.rect(4, 10, 5, 14, '#5a3a1a'); s.rect(11, 10, 12, 14, '#5a3a1a'); s.rect(4, 13, 5, 14, '#c0c0c0'); },
  name_tag: (s) => { s.poly([[3, 6], [11, 4], [14, 10], [6, 12]], '#e8dcc0'); s.circle(5, 8, 1, '#8a6a3a'); },
  clock: (s) => { s.circle(8, 8, 5.5, (r) => (r > 0.8 ? '#c8a020' : '#f2d040')); s.line(8, 8, 8, 4, '#2a2a2a'); s.line(8, 8, 11, 8, '#2a2a2a'); },
  compass: (s) => { s.circle(8, 8, 5.5, (r) => (r > 0.8 ? '#8a8a8a' : '#d8d8d8')); s.line(8, 8, 8, 4, '#d01010'); s.line(8, 8, 8, 12, '#2a2a2a'); },
  map: (s) => { s.rect(3, 3, 13, 13, '#e8dcb0'); s.rect(5, 5, 11, 11, '#a8c870'); s.rect(7, 7, 9, 9, '#5a8ae0'); },
  totem_of_undying: (s) => { s.rect(5, 2, 11, 7, '#f2d040'); s.rect(6, 4, 7, 5, '#1a8a3a'); s.rect(9, 4, 10, 5, '#1a8a3a'); s.rect(6, 8, 10, 13, '#e0b020'); s.rect(3, 8, 5, 10, '#e0b020'); s.rect(11, 8, 13, 10, '#e0b020'); },
  elytra: (s) => { s.poly([[3, 3], [7, 3], [7, 13], [2, 11]], '#8a8aa8'); s.poly([[9, 3], [13, 3], [14, 11], [9, 13]], '#7a7a98'); },
  shield: (s) => { s.poly([[3, 3], [13, 3], [13, 9], [8, 14], [3, 9]], '#8a6a3a'); s.poly([[4, 4], [12, 4], [12, 9], [8, 13], [4, 9]], '#a8a8a8'); s.rect(7, 4, 8, 12, '#8a6a3a'); },
  heart_of_the_sea: (s) => s.circle(8, 8, 5, (r) => (r < 0.4 ? '#a0f0ff' : '#2a6ab0')),
  nautilus_shell: (s) => s.circle(8, 8, 5.5, (r, x, y) => ((Math.atan2(y - 8, x - 8) * 3 + r * 8) % 2 < 1 ? '#e8d8c8' : '#c88a6a')),
  phantom_membrane: (s) => s.poly([[3, 4], [13, 3], [11, 13], [4, 11]], '#c8c0a0'),
  ink_sac: (s) => s.circle(8, 9, 5, '#2a2a3a'),
  glow_ink_sac: (s) => s.circle(8, 9, 5, '#2ad0c0'),
  disc_cat: (s) => { s.circle(8, 8, 6, '#1a1a1a'); s.circle(8, 8, 2, '#4ab83a'); },
  goat_horn: (s) => s.poly([[3, 12], [6, 5], [12, 2], [10, 6], [7, 13]], '#c8b890'),
  shulker_shell: (s) => s.ellipse(8, 8, 6, 5, (d, x, y) => (y < 8 ? '#a87aa8' : '#7a5a7a')),
};

export function itemIcon(id) {
  let url = cache.get(id);
  if (url) return url;
  const def = ITEMS[id];
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (!def) { ctx.fillStyle = '#f0f'; ctx.fillRect(0, 0, SIZE, SIZE); }
  else if (def.isBlock) {
    if (!TILE_NAMES_REF) TILE_NAMES_REF = TILE_NAMES;
    blockIcon(BLOCKS[def.block], ctx);
  } else {
    const spr = itemSprite(def);
    const k = SIZE / G;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const p = spr.p[y * G + x];
      if (!p) continue;
      ctx.fillStyle = p; ctx.fillRect(x * k, y * k, k, k);
    }
  }
  url = c.toDataURL();
  cache.set(id, url);
  return url;
}

// sprite 16x16 brut (pour l'extrusion 3D de l'objet tenu en main)
export function itemSpritePixels(id) {
  const def = ITEMS[id];
  if (!def || def.isBlock) return null;
  return itemSprite(def).p;
}
export function setTileNames(names) { TILE_NAMES_REF = names; }
