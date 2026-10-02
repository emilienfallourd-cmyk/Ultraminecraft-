// Modèles 3D des créatures (boîtes façon Minecraft) avec textures peintes procéduralement
import * as THREE from 'three';
import { entityMaterial } from './models.js';

// ---------------------------------------------------------------- PEINTRE
class Tex {
  constructor(w, h, seed) {
    this.w = w; this.h = h;
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.x = this.c.getContext('2d');
    this.s = seed || 7;
  }
  rnd() { this.s = (this.s * 16807 + 11) % 2147483647; return (this.s % 10000) / 10000; }
  col(c, f) {
    const v = parseInt(c.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((v >> 16) & 255) * f)), g = Math.max(0, Math.min(255, ((v >> 8) & 255) * f)), b = Math.max(0, Math.min(255, (v & 255) * f));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  fill(x, y, w, h, c, noise = 0.12, f = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { this.x.fillStyle = this.col(c, f * (1 - noise / 2 + this.rnd() * noise)); this.x.fillRect(x + i, y + j, 1, 1); }
  }
  px(x, y, c, a = 1) { this.x.globalAlpha = a; this.x.fillStyle = c; this.x.fillRect(x, y, 1, 1); this.x.globalAlpha = 1; }
  rect(x, y, w, h, c) { this.x.fillStyle = c; this.x.fillRect(x, y, w, h); }
  // pixels émissifs (alpha 0.9 = marqueur de lueur dans le shader d'entité)
  glow(x, y, w, h, c) {
    const v = parseInt(c.slice(1), 16);
    const img = this.x.getImageData(x, y, w, h);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (v >> 16) & 255; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255; img.data[i + 3] = 230; }
    this.x.putImageData(img, x, y);
  }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    return t;
  }
}

// Construction d'un modèle : parties (pivot, parent, rotation) + boîtes peintes, UV auto-empaquetées
// box: { o:[x,y,z], s:[w,h,d], c:'#hex', n:bruit, f:{front,back,top,bottom,left,right,all}: fn(T,x,y,w,h) ou couleur, inf: gonflement, alpha }
export function buildModel(spec, opts = {}) {
  // empaquetage des UV
  const boxes = [];
  for (const p of spec.parts) for (const b of p.boxes || []) boxes.push(b);
  const W = 128;
  let x = 0, y = 0, rowH = 0;
  for (const b of boxes) {
    const [w, h, d] = b.s.map((v) => Math.max(1, Math.ceil(v)));
    const bw = 2 * (w + d), bh = h + d;
    if (x + bw > W) { x = 0; y += rowH; rowH = 0; }
    b.uv = [x, y]; b.ws = [w, h, d];
    x += bw; rowH = Math.max(rowH, bh);
  }
  let H = 8; while (H < y + rowH) H *= 2;
  const T = new Tex(W, H, spec.seed || 3);
  // peinture
  for (const b of boxes) {
    const [u, v] = b.uv, [w, h, d] = b.ws;
    const c = b.c || '#888888', n = b.n ?? 0.14;
    const faces = {
      top: [u + d, v, w, d, 1.1], bottom: [u + d + w, v, w, d, 0.75],
      right: [u, v + d, d, h, 0.9], front: [u + d, v + d, w, h, 1], left: [u + d + w, v + d, d, h, 0.9], back: [u + 2 * d + w, v + d, w, h, 0.95],
    };
    for (const [k, [fx, fy, fw, fh, sh]] of Object.entries(faces)) {
      const spec2 = b.f && (b.f[k] ?? b.f.all);
      const base = typeof spec2 === 'string' ? spec2 : (b.fc && b.fc[k]) || c;
      T.fill(fx, fy, fw, fh, base, n, sh);
      if (b.grad) for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (T.rnd() < b.grad[1] * (j / fh)) T.px(fx + i, fy + j, b.grad[0]);
      if (typeof spec2 === 'function') spec2(T, fx, fy, fw, fh);
    }
    if (b.alpha) { const img = T.x.getImageData(u, v, 2 * (w + d), h + d); for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(b.alpha * 255); T.x.putImageData(img, u, v); }
  }
  const tex = T.texture();
  const mat = entityMaterial(tex, { emissive: opts.emissive || 0, glow: opts.glow || 0, transparent: !!opts.transparent, double: opts.double });
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar((opts.scale || 1) / 16);
  root.add(inner);
  const parts = {};
  for (const p of spec.parts) {
    const g = new THREE.Group();
    g.name = p.name;
    const pv = p.pivot || [0, 0, 0];
    const parentPv = p.parent ? spec.parts.find((q) => q.name === p.parent).pivot || [0, 0, 0] : [0, 0, 0];
    g.position.set(pv[0] - parentPv[0], pv[1] - parentPv[1], pv[2] - parentPv[2]);
    g.rotation.order = 'ZYX'; // même ordre que les modèles de Minecraft
    if (p.rot) g.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    g.userData.baseRot = g.rotation.clone();
    if (p.boxes && p.boxes.length) {
      const P = [], N = [], U = [], I = [];
      for (const b of p.boxes) {
        const [w, h, d] = b.ws, [u, v] = b.uv;
        const inf = b.inf || 0;
        const X0 = b.o[0] - pv[0] - inf, Y0 = b.o[1] - pv[1] - inf, Z0 = b.o[2] - pv[2] - inf;
        const X1 = b.o[0] - pv[0] + b.s[0] + inf, Y1 = b.o[1] - pv[1] + b.s[1] + inf, Z1 = b.o[2] - pv[2] + b.s[2] + inf;
        const face = (c, nn, ru, rv, rw, rh) => {
          const base = P.length / 3;
          for (const q of c) P.push(...q);
          for (let i = 0; i < 4; i++) N.push(...nn);
          let ua = ru / W, ub = (ru + rw) / W;
          if (b.mirror) { const t = ua; ua = ub; ub = t; }
          U.push(ua, rv / H, ub, rv / H, ub, (rv + rh) / H, ua, (rv + rh) / H);
          I.push(base, base + 3, base + 2, base, base + 2, base + 1);
        };
        face([[X1, Y1, Z0], [X0, Y1, Z0], [X0, Y0, Z0], [X1, Y0, Z0]], [0, 0, -1], u + d, v + d, w, h);
        face([[X0, Y1, Z1], [X1, Y1, Z1], [X1, Y0, Z1], [X0, Y0, Z1]], [0, 0, 1], u + 2 * d + w, v + d, w, h);
        face([[X1, Y1, Z1], [X1, Y1, Z0], [X1, Y0, Z0], [X1, Y0, Z1]], [1, 0, 0], u, v + d, d, h);
        face([[X0, Y1, Z0], [X0, Y1, Z1], [X0, Y0, Z1], [X0, Y0, Z0]], [-1, 0, 0], u + d + w, v + d, d, h);
        face([[X1, Y1, Z1], [X0, Y1, Z1], [X0, Y1, Z0], [X1, Y1, Z0]], [0, 1, 0], u + d, v, w, d);
        face([[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y0, Z1], [X1, Y0, Z1]], [0, -1, 0], u + d + w, v, w, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setIndex(I);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.layers.enable(1);
      if (p.noShadow) mesh.layers.disable(1);
      g.add(mesh);
    }
    (p.parent ? parts[p.parent] : inner).add(g);
    parts[p.name] = g;
  }
  return { root, parts, mat, tex };
}

// ------------------------------------------------------------- DÉTAILS
const eyes = (col, pupil, y = 4, gap = 1, ew = 2) => (T, x, yy, w, h) => {
  const cx = x + Math.floor(w / 2);
  T.rect(cx - gap - ew, yy + y, ew, 1, col); T.rect(cx + gap, yy + y, ew, 1, col);
  if (pupil) { T.px(cx - gap - 1, yy + y, pupil); T.px(cx + gap, yy + y, pupil); }
};
const face = (o) => (T, x, y, w, h) => {
  if (o.skin) T.fill(x, y, w, h, o.skin, 0.08, 1);
  if (o.hair) { T.fill(x, y, w, o.hairH || 2, o.hair, 0.15, 1); if (o.sideburn) { T.fill(x, y, 1, 4, o.hair, 0.15); T.fill(x + w - 1, y, 1, 4, o.hair, 0.15); } }
  const ey = o.ey ?? 4;
  const cx = x + Math.floor(w / 2);
  T.rect(cx - 3, y + ey, 2, 1, o.white || '#ffffff'); T.rect(cx + 1, y + ey, 2, 1, o.white || '#ffffff');
  T.px(cx - 2, y + ey, o.eye || '#3a5fc4'); T.px(cx + 1, y + ey, o.eye || '#3a5fc4');
  if (o.nose) T.rect(cx - 1, y + ey + 1, 2, 1, o.nose);
  if (o.mouth) T.rect(cx - 2, y + ey + 2, 4, 1, o.mouth);
  if (o.beard) T.fill(x + 1, y + ey + 2, w - 2, 2, o.beard, 0.1);
};

// ================================================================= MODÈLES
const HUM = (o) => {
  const head = { o: [-4, 24, -4], s: [8, 8, 8], c: o.skin, f: { front: o.face, top: o.hairTop || o.hair || o.skin, back: o.hair || o.skin, right: o.hairSide, left: o.hairSide } };
  const hat = o.hat ? [{ o: [-4, 24, -4], s: [8, 8, 8], c: o.hat, inf: 0.5, f: { front: (T, x, y, w, h) => { T.x.clearRect(x, y + 2, w, h - 2); } } }] : [];
  const thin = o.thin ? 1 : 0;
  const aw = o.thin ? 2 : 4;
  return {
    seed: o.seed,
    parts: [
      { name: 'body', pivot: [0, 24, 0], boxes: [{ o: [-4, 12, -2], s: [8, 12, 4], c: o.shirt, f: o.bodyF || {}, grad: o.bodyGrad }] },
      { name: 'head', pivot: [0, 24, 0], boxes: [head, ...hat, ...(o.extraHead || [])] },
      { name: 'rightArm', pivot: [5, 22, 0], boxes: [{ o: [4, 12, -1 - thin + (o.thin ? 1 : 0) - (o.thin ? 0 : 1)], s: [aw, 12, aw], c: o.arm || o.skin, f: { top: o.shirt, front: o.sleeve ? (T, x, y, w) => T.fill(x, y, w, 4, o.shirt, 0.1) : undefined } }] },
      { name: 'leftArm', pivot: [-5, 22, 0], boxes: [{ o: [-4 - aw, 12, -1 - thin + (o.thin ? 1 : 0) - (o.thin ? 0 : 1)], s: [aw, 12, aw], c: o.arm || o.skin, mirror: true, f: { top: o.shirt, front: o.sleeve ? (T, x, y, w) => T.fill(x, y, w, 4, o.shirt, 0.1) : undefined } }] },
      { name: 'rightLeg', pivot: [2, 12, 0], boxes: [{ o: [o.thin ? 1 : 0, 0, o.thin ? -1 : -2], s: [aw, 12, aw], c: o.pants, f: { bottom: o.shoe || o.pants, front: o.shoe ? (T, x, y, w, h) => T.fill(x, y + h - 2, w, 2, o.shoe, 0.1) : undefined } }] },
      { name: 'leftLeg', pivot: [-2, 12, 0], boxes: [{ o: [o.thin ? -3 : -4, 0, o.thin ? -1 : -2], s: [aw, 12, aw], c: o.pants, mirror: true, f: { bottom: o.shoe || o.pants, front: o.shoe ? (T, x, y, w, h) => T.fill(x, y + h - 2, w, 2, o.shoe, 0.1) : undefined } }] },
    ],
  };
};

export const MODELS = {
  player: () => HUM({ skin: '#c79a7a', shirt: '#3aa7a0', pants: '#3b3f8f', shoe: '#5a5a5a', hair: '#4a2f1a', sleeve: true,
    face: face({ skin: '#c79a7a', hair: '#4a2f1a', hairH: 2, eye: '#4a62c8', nose: '#a8765a', mouth: '#7a4a3a', ey: 4 }), hairSide: (T, x, y, w) => T.fill(x, y, w, 3, '#4a2f1a') }),
  zombie: () => HUM({ skin: '#5d8c4a', shirt: '#2f8a9a', pants: '#3a3a8a', shoe: '#3a3a3a', sleeve: true, seed: 9,
    face: face({ skin: '#5d8c4a', white: '#1a2a12', eye: '#0a0a0a', mouth: '#2a4a20', ey: 3 }) }),
  husk: () => HUM({ skin: '#a89a72', shirt: '#7a6a4a', pants: '#5a4a3a', sleeve: true, seed: 11,
    face: face({ skin: '#a89a72', white: '#3a3020', eye: '#1a1a10', mouth: '#5a4a30', ey: 3 }) }),
  drowned: () => HUM({ skin: '#4f8f8a', shirt: '#3a6a68', pants: '#2a5a7a', sleeve: true, seed: 12,
    face: face({ skin: '#4f8f8a', white: '#a0ffe8', eye: '#30e0d0', mouth: '#2a4a48', ey: 3 }), bodyGrad: ['#2a6a3a', 0.4] }),
  villager: () => ({
    seed: 21,
    parts: [
      { name: 'body', pivot: [0, 24, 0], boxes: [{ o: [-4, 12, -3], s: [8, 12, 6], c: '#7a5a3a' }, { o: [-4, 6, -3], s: [8, 6, 6], c: '#6a4a2a', inf: 0.3 }] },
      { name: 'head', pivot: [0, 24, 0], boxes: [
        { o: [-4, 24, -4], s: [8, 10, 8], c: '#b88a6a', f: { front: (T, x, y, w) => { T.fill(x, y, w, 2, '#5a3a20'); T.rect(x + 1, y + 4, 2, 1, '#ffffff'); T.rect(x + 5, y + 4, 2, 1, '#ffffff'); T.px(x + 2, y + 4, '#2a7a2a'); T.px(x + 5, y + 4, '#2a7a2a'); T.fill(x + 2, y + 3, 4, 1, '#3a2a1a'); } } },
        { o: [-1, 25, -6], s: [2, 4, 2], c: '#a87a5a' }] },
      { name: 'arms', pivot: [0, 22, 0], rot: [-0.75, 0, 0], boxes: [{ o: [-4, 16, -2], s: [8, 4, 4], c: '#7a5a3a' }, { o: [-8, 16, -2], s: [4, 8, 4], c: '#7a5a3a' }, { o: [4, 16, -2], s: [4, 8, 4], c: '#7a5a3a' }] },
      { name: 'rightLeg', pivot: [2, 12, 0], boxes: [{ o: [0, 0, -2], s: [4, 12, 4], c: '#5a3a2a' }] },
      { name: 'leftLeg', pivot: [-2, 12, 0], boxes: [{ o: [-4, 0, -2], s: [4, 12, 4], c: '#5a3a2a' }] },
    ],
  }),
  witch: () => {
    const m = MODELS.villager();
    m.parts[0].boxes[0].c = '#4a2a5a'; m.parts[0].boxes[1].c = '#3a2a4a';
    m.parts[1].boxes.push({ o: [-5, 33, -5], s: [10, 2, 10], c: '#2a2a2a' }, { o: [-3.5, 35, -3.5], s: [7, 4, 7], c: '#2a2a2a' }, { o: [-2, 39, -2], s: [4, 3, 4], c: '#2a2a2a' }, { o: [-1, 42, -1], s: [2, 2, 2], c: '#2a2a2a' });
    m.parts[1].boxes[1].c = '#7a9a5a';
    return m;
  },
  pillager: () => HUM({ skin: '#8a8a7a', shirt: '#3a3a3a', pants: '#2a2a3a', seed: 31, face: face({ skin: '#8a8a7a', hair: '#2a2a2a', eye: '#2a4a4a', ey: 4, mouth: '#4a4a40' }) }),
  skeleton: () => HUM({ skin: '#c8c8c0', shirt: '#b8b8b0', pants: '#b0b0a8', thin: true, seed: 41,
    face: (T, x, y) => { T.fill(x, y, 8, 8, '#d0d0c8', 0.1); T.rect(x + 1, y + 3, 2, 2, '#1a1a1a'); T.rect(x + 5, y + 3, 2, 2, '#1a1a1a'); T.px(x + 3, y + 5, '#3a3a3a'); T.px(x + 4, y + 5, '#3a3a3a'); T.rect(x + 1, y + 6, 6, 1, '#4a4a48'); },
    bodyF: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, '#2a2a28', 0.1); for (let i = 1; i < h - 2; i += 2) T.rect(x + 1, y + i, w - 2, 1, '#c8c8c0'); T.rect(x + 3, y, 2, h, '#c8c8c0'); } } }),
  stray: () => { const m = MODELS.skeleton(); m.parts[0].boxes.push({ o: [-4, 12, -2], s: [8, 12, 4], c: '#7a8a8a', inf: 0.4, alpha: 0.95 }); return m; },
  wither_skeleton: () => HUM({ skin: '#2a2a2a', shirt: '#252525', pants: '#232323', thin: true, seed: 42,
    face: (T, x, y) => { T.fill(x, y, 8, 8, '#2a2a2a', 0.15); T.rect(x + 1, y + 3, 2, 2, '#050505'); T.rect(x + 5, y + 3, 2, 2, '#050505'); T.rect(x + 1, y + 6, 6, 1, '#4a4a4a'); } }),
  zombified_piglin: () => {
    const m = HUM({ skin: '#e89a9a', shirt: '#c08a7a', pants: '#5a3a2a', seed: 51,
      face: (T, x, y, w, h) => { T.fill(x, y, w, h, '#e89a9a', 0.15); T.rect(x + 1, y + 2, 3, 6, '#5a9a4a'); T.rect(x + 2, y + 3, 1, 1, '#ffffff'); T.rect(x + 6, y + 3, 1, 1, '#ffffff'); } });
    m.parts[1].boxes[0] = { o: [-5, 24, -4], s: [10, 8, 8], c: '#e89a9a', f: m.parts[1].boxes[0].f };
    m.parts[1].boxes.push({ o: [-2, 25, -5], s: [4, 4, 1], c: '#f0b0b0', f: { front: (T, x, y) => { T.px(x + 1, y + 1, '#5a2a2a'); T.px(x + 2, y + 1, '#5a2a2a'); } } }, { o: [-6, 26, -1], s: [1, 5, 4], c: '#d88a8a' }, { o: [5, 26, -1], s: [1, 5, 4], c: '#d88a8a' });
    return m;
  },
  piglin: () => {
    const m = MODELS.zombified_piglin();
    m.parts[0].boxes[0].c = '#7a5a3a'; m.parts[1].boxes[0].c = '#e8a090';
    m.parts[1].boxes[0].f = { front: (T, x, y, w, h) => { T.fill(x, y, w, h, '#e8a090', 0.12); T.rect(x + 2, y + 3, 2, 1, '#ffffff'); T.rect(x + 6, y + 3, 2, 1, '#ffffff'); T.px(x + 3, y + 3, '#3a2a1a'); T.px(x + 6, y + 3, '#3a2a1a'); T.rect(x + 2, y + 7, 1, 1, '#ffffff'); T.rect(x + 7, y + 7, 1, 1, '#ffffff'); } };
    return m;
  },
  enderman: () => ({
    seed: 61,
    parts: [
      { name: 'body', pivot: [0, 38, 0], boxes: [{ o: [-4, 26, -2], s: [8, 12, 4], c: '#161618', n: 0.2 }] },
      { name: 'head', pivot: [0, 38, 0], boxes: [{ o: [-4, 38, -4], s: [8, 8, 8], c: '#161618', n: 0.2, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, '#161618', 0.2); T.rect(x + 1, y + 4, 2, 1, '#e080ff'); T.rect(x + 5, y + 4, 2, 1, '#e080ff'); T.px(x + 2, y + 4, '#ffffff'); T.px(x + 5, y + 4, '#ffffff'); } } }] },
      { name: 'jaw', pivot: [0, 38, 0], parent: 'head', boxes: [{ o: [-4, 36, -4], s: [8, 2, 8], c: '#121214' }] },
      { name: 'rightArm', pivot: [5, 36, 0], boxes: [{ o: [4, 6, -1], s: [2, 30, 2], c: '#161618' }] },
      { name: 'leftArm', pivot: [-5, 36, 0], boxes: [{ o: [-6, 6, -1], s: [2, 30, 2], c: '#161618' }] },
      { name: 'rightLeg', pivot: [2, 26, 0], boxes: [{ o: [1, 0, -1], s: [2, 26, 2], c: '#161618' }] },
      { name: 'leftLeg', pivot: [-2, 26, 0], boxes: [{ o: [-3, 0, -1], s: [2, 26, 2], c: '#161618' }] },
    ],
  }),
  creeper: () => ({
    seed: 71,
    parts: [
      { name: 'body', pivot: [0, 18, 0], boxes: [{ o: [-4, 6, -2], s: [8, 12, 4], c: '#4caf3c', n: 0.35 }] },
      { name: 'head', pivot: [0, 18, 0], boxes: [{ o: [-4, 18, -4], s: [8, 8, 8], c: '#4caf3c', n: 0.35, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, '#4caf3c', 0.35); T.rect(x + 1, y + 2, 2, 2, '#0a0a0a'); T.rect(x + 5, y + 2, 2, 2, '#0a0a0a'); T.rect(x + 3, y + 4, 2, 3, '#0a0a0a'); T.rect(x + 2, y + 5, 1, 3, '#0a0a0a'); T.rect(x + 5, y + 5, 1, 3, '#0a0a0a'); } } }] },
      { name: 'leg1', pivot: [2, 6, 2], boxes: [{ o: [0, 0, 2], s: [4, 6, 4], c: '#4caf3c', n: 0.35 }] },
      { name: 'leg2', pivot: [-2, 6, 2], boxes: [{ o: [-4, 0, 2], s: [4, 6, 4], c: '#4caf3c', n: 0.35 }] },
      { name: 'leg3', pivot: [2, 6, -2], boxes: [{ o: [0, 0, -6], s: [4, 6, 4], c: '#4caf3c', n: 0.35 }] },
      { name: 'leg4', pivot: [-2, 6, -2], boxes: [{ o: [-4, 0, -6], s: [4, 6, 4], c: '#4caf3c', n: 0.35 }] },
    ],
  }),
  spider: (cave) => {
    const c = cave ? '#14424e' : '#2e2622';
    const parts = [
      { name: 'body', pivot: [0, 9, 4], boxes: [{ o: [-5, 5, 2], s: [10, 8, 12], c, n: 0.25, f: { top: (T, x, y, w, h) => { for (let i = 0; i < 6; i++) T.px(x + 2 + i, y + 3 + (i % 3), '#5a1a1a'); } } }] },
      { name: 'neck', pivot: [0, 9, 0], boxes: [{ o: [-3, 6, -3], s: [6, 6, 6], c }] },
      { name: 'head', pivot: [0, 9, -3], boxes: [{ o: [-4, 5, -11], s: [8, 8, 8], c, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, c, 0.2); T.rect(x + 1, y + 2, 2, 2, '#e01010'); T.rect(x + 5, y + 2, 2, 2, '#e01010'); T.px(x + 3, y + 1, '#ff3030'); T.px(x + 4, y + 1, '#ff3030'); T.px(x + 2, y + 4, '#a00a0a'); T.px(x + 5, y + 4, '#a00a0a'); } } }] },
    ];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1, k = i % 4;
      const z = -3 + k * 2.5;
      parts.push({ name: 'leg' + i, pivot: [side * 3, 9, z], rot: [0, (k - 1.5) * 0.35 * side, side * 0.6], boxes: [{ o: side > 0 ? [3, 8, z - 1] : [-19, 8, z - 1], s: [16, 2, 2], c }] });
    }
    return { seed: 81, parts };
  },
  pig: () => ({
    seed: 91,
    parts: [
      { name: 'body', pivot: [0, 12, 0], boxes: [{ o: [-5, 6, -8], s: [10, 8, 16], c: '#eba5a5', n: 0.1 }] },
      { name: 'head', pivot: [0, 12, -6], boxes: [{ o: [-4, 8, -14], s: [8, 8, 8], c: '#eba5a5', n: 0.1, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, '#eba5a5', 0.1); T.rect(x, y + 3, 1, 1, '#ffffff'); T.px(x + 1, y + 3, '#1a1a1a'); T.rect(x + 7, y + 3, 1, 1, '#ffffff'); T.px(x + 6, y + 3, '#1a1a1a'); } } },
        { o: [-2, 9, -15], s: [4, 3, 1], c: '#f0b5b5', f: { front: (T, x, y) => { T.px(x + 1, y + 1, '#8a4a4a'); T.px(x + 2, y + 1, '#8a4a4a'); } } }] },
      { name: 'leg1', pivot: [3, 6, 5], boxes: [{ o: [1, 0, 3], s: [4, 6, 4], c: '#e09595' }] },
      { name: 'leg2', pivot: [-3, 6, 5], boxes: [{ o: [-5, 0, 3], s: [4, 6, 4], c: '#e09595' }] },
      { name: 'leg3', pivot: [3, 6, -5], boxes: [{ o: [1, 0, -7], s: [4, 6, 4], c: '#e09595' }] },
      { name: 'leg4', pivot: [-3, 6, -5], boxes: [{ o: [-5, 0, -7], s: [4, 6, 4], c: '#e09595' }] },
    ],
  }),
  cow: (mooshroom) => {
    const base = mooshroom ? '#a01818' : '#4a3626';
    const spots = mooshroom ? '#e8e8e8' : '#f2f2f2';
    const spot = (T, x, y, w, h) => { for (let i = 0; i < 4; i++) { const sx = x + Math.floor(T.rnd() * (w - 3)), sy = y + Math.floor(T.rnd() * (h - 3)); T.fill(sx, sy, 3 + Math.floor(T.rnd() * 3), 2 + Math.floor(T.rnd() * 3), spots, 0.06); } };
    return {
      seed: 101,
      parts: [
        { name: 'body', pivot: [0, 19, 0], boxes: [{ o: [-6, 12, -9], s: [12, 10, 18], c: base, f: { all: spot } }, { o: [-2, 11, 4], s: [4, 1, 6], c: '#e8b0b0' }] },
        { name: 'head', pivot: [0, 20, -8], boxes: [{ o: [-4, 16, -14], s: [8, 8, 6], c: base, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, base, 0.1); T.fill(x + 2, y + 5, 4, 3, '#d8c8b8', 0.05); T.rect(x + 1, y + 2, 1, 2, '#ffffff'); T.rect(x + 6, y + 2, 1, 2, '#ffffff'); T.px(x + 1, y + 3, '#1a1a1a'); T.px(x + 6, y + 3, '#1a1a1a'); } } },
          { o: [-5, 23, -12], s: [1, 3, 1], c: '#d8d0c0' }, { o: [4, 23, -12], s: [1, 3, 1], c: '#d8d0c0' }] },
        { name: 'leg1', pivot: [4, 12, 6], boxes: [{ o: [2, 0, 4], s: [4, 12, 4], c: base }] },
        { name: 'leg2', pivot: [-4, 12, 6], boxes: [{ o: [-6, 0, 4], s: [4, 12, 4], c: base }] },
        { name: 'leg3', pivot: [4, 12, -6], boxes: [{ o: [2, 0, -8], s: [4, 12, 4], c: base }] },
        { name: 'leg4', pivot: [-4, 12, -6], boxes: [{ o: [-6, 0, -8], s: [4, 12, 4], c: base }] },
      ],
    };
  },
  sheep: (wool = '#e8e8e8', sheared = false) => ({
    seed: 111,
    parts: [
      { name: 'body', pivot: [0, 19, 0], boxes: [{ o: [-4, 12, -8], s: [8, 8, 16], c: '#d8c8b0' }, ...(sheared ? [] : [{ o: [-4, 12, -8], s: [8, 8, 16], c: wool, inf: 1.75, n: 0.18 }])] },
      { name: 'head', pivot: [0, 18, -8], boxes: [{ o: [-3, 16, -14], s: [6, 6, 8], c: '#d8c8b0', f: { front: (T, x, y) => { T.fill(x, y, 6, 6, '#d8c8b0', 0.08); T.rect(x, y + 2, 2, 1, '#ffffff'); T.px(x + 1, y + 2, '#1a1a1a'); T.rect(x + 4, y + 2, 2, 1, '#ffffff'); T.px(x + 4, y + 2, '#1a1a1a'); T.fill(x + 2, y + 4, 2, 2, '#e8b8b8', 0.05); } } },
        ...(sheared ? [] : [{ o: [-3, 17, -12], s: [6, 6, 6], c: wool, inf: 0.6, n: 0.18 }])] },
      { name: 'leg1', pivot: [3, 12, 6], boxes: [{ o: [1, 0, 4], s: [4, 12, 4], c: '#d8c8b0', f: { all: (T, x, y, w) => sheared ? null : T.fill(x, y, w, 5, wool, 0.15) } }] },
      { name: 'leg2', pivot: [-3, 12, 6], boxes: [{ o: [-5, 0, 4], s: [4, 12, 4], c: '#d8c8b0', f: { all: (T, x, y, w) => sheared ? null : T.fill(x, y, w, 5, wool, 0.15) } }] },
      { name: 'leg3', pivot: [3, 12, -6], boxes: [{ o: [1, 0, -8], s: [4, 12, 4], c: '#d8c8b0', f: { all: (T, x, y, w) => sheared ? null : T.fill(x, y, w, 5, wool, 0.15) } }] },
      { name: 'leg4', pivot: [-3, 12, -6], boxes: [{ o: [-5, 0, -8], s: [4, 12, 4], c: '#d8c8b0', f: { all: (T, x, y, w) => sheared ? null : T.fill(x, y, w, 5, wool, 0.15) } }] },
    ],
  }),
  chicken: () => ({
    seed: 121,
    parts: [
      { name: 'body', pivot: [0, 8, 0], boxes: [{ o: [-3, 4, -4], s: [6, 6, 8], c: '#f2f2f2', n: 0.08 }] },
      { name: 'head', pivot: [0, 9, -4], boxes: [{ o: [-2, 9, -6], s: [4, 6, 3], c: '#f2f2f2', f: { front: (T, x, y) => { T.px(x, y + 2, '#1a1a1a'); T.px(x + 3, y + 2, '#1a1a1a'); } } }, { o: [-2, 11, -8], s: [4, 2, 2], c: '#f0a020' }, { o: [-1, 9, -7], s: [2, 2, 2], c: '#d01010' }] },
      { name: 'wingR', pivot: [3, 10, 0], boxes: [{ o: [3, 6, -3], s: [1, 4, 6], c: '#e8e8e8' }] },
      { name: 'wingL', pivot: [-3, 10, 0], boxes: [{ o: [-4, 6, -3], s: [1, 4, 6], c: '#e8e8e8' }] },
      { name: 'leg1', pivot: [1, 5, 1], boxes: [{ o: [0.5, 0, 0.5], s: [1, 5, 1], c: '#f0a020' }, { o: [-0.5, 0, -1.5], s: [3, 0.5, 3], c: '#f0a020' }] },
      { name: 'leg2', pivot: [-1, 5, 1], boxes: [{ o: [-1.5, 0, 0.5], s: [1, 5, 1], c: '#f0a020' }, { o: [-2.5, 0, -1.5], s: [3, 0.5, 3], c: '#f0a020' }] },
    ],
  }),
  wolf: (tamed) => ({
    seed: 131,
    parts: [
      { name: 'body', pivot: [0, 10, 0], boxes: [{ o: [-3, 7, -2], s: [6, 6, 9], c: '#d8d4d0' }, { o: [-4, 7, -6], s: [8, 7, 6], c: '#e0dcd8', n: 0.15 }] },
      { name: 'head', pivot: [0, 11, -6], boxes: [{ o: [-3, 8, -10], s: [6, 6, 4], c: '#e0dcd8', f: { front: (T, x, y) => { T.rect(x + 1, y + 2, 1, 1, '#1a1a1a'); T.rect(x + 4, y + 2, 1, 1, '#1a1a1a'); } } }, { o: [-1.5, 8, -13], s: [3, 3, 3], c: '#d0ccc8', f: { front: (T, x, y) => T.px(x + 1, y, '#1a1a1a') } }, { o: [-3, 14, -8], s: [2, 2, 1], c: '#d0ccc8' }, { o: [1, 14, -8], s: [2, 2, 1], c: '#d0ccc8' },
        ...(tamed ? [{ o: [-3.5, 7.5, -7.5], s: [7, 1, 1], c: '#d01010' }] : [])] },
      { name: 'tail', pivot: [0, 12, 7], rot: [0.9, 0, 0], boxes: [{ o: [-1, 4, 6], s: [2, 8, 2], c: '#d8d4d0' }] },
      { name: 'leg1', pivot: [1.5, 8, 5], boxes: [{ o: [0.5, 0, 4], s: [2, 8, 2], c: '#d0ccc8' }] },
      { name: 'leg2', pivot: [-1.5, 8, 5], boxes: [{ o: [-2.5, 0, 4], s: [2, 8, 2], c: '#d0ccc8' }] },
      { name: 'leg3', pivot: [1.5, 8, -3], boxes: [{ o: [0.5, 0, -4], s: [2, 8, 2], c: '#d0ccc8' }] },
      { name: 'leg4', pivot: [-1.5, 8, -3], boxes: [{ o: [-2.5, 0, -4], s: [2, 8, 2], c: '#d0ccc8' }] },
    ],
  }),
  horse: (col = '#8a5a32') => ({
    seed: 141,
    parts: [
      { name: 'body', pivot: [0, 17, 0], boxes: [{ o: [-5, 11, -10], s: [10, 10, 22], c: col }, { o: [-1, 13, 11], s: [2, 2, 1], c: '#2a1a10' }] },
      { name: 'tail', pivot: [0, 20, 12], rot: [0.7, 0, 0], boxes: [{ o: [-1.5, 8, 11], s: [3, 12, 3], c: '#2a1a10' }] },
      { name: 'head', pivot: [0, 21, -9], rot: [0.5, 0, 0], boxes: [{ o: [-3, 20, -13], s: [6, 12, 7], c: col }, { o: [-2, 28, -19], s: [4, 5, 6], c: col, f: { front: (T, x, y) => { T.px(x, y + 3, '#1a1a1a'); T.px(x + 3, y + 3, '#1a1a1a'); } } }, { o: [-1, 21, -7], s: [2, 12, 4], c: '#2a1a10' }, { o: [-3, 31, -11], s: [2, 3, 1], c: col }, { o: [1, 31, -11], s: [2, 3, 1], c: col }] },
      { name: 'leg1', pivot: [3, 11, 8], boxes: [{ o: [1, 0, 6], s: [4, 11, 4], c: col, f: { all: (T, x, y, w, h) => T.fill(x, y + h - 3, w, 3, '#e8e0d8') } }] },
      { name: 'leg2', pivot: [-3, 11, 8], boxes: [{ o: [-5, 0, 6], s: [4, 11, 4], c: col }] },
      { name: 'leg3', pivot: [3, 11, -8], boxes: [{ o: [1, 0, -10], s: [4, 11, 4], c: col }] },
      { name: 'leg4', pivot: [-3, 11, -8], boxes: [{ o: [-5, 0, -10], s: [4, 11, 4], c: col, f: { all: (T, x, y, w, h) => T.fill(x, y + h - 3, w, 3, '#e8e0d8') } }] },
    ],
  }),
  iron_golem: () => ({
    seed: 151,
    parts: [
      { name: 'body', pivot: [0, 31, 0], boxes: [{ o: [-9, 31, -6], s: [18, 12, 11], c: '#d8cdc1', n: 0.15, f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, '#d8cdc1', 0.15); for (let i = 0; i < 6; i++) T.fill(x + 2 + i * 2, y + 2 + (i % 2) * 4, 2, 4, '#5f8a2a', 0.2); } } }, { o: [-4.5, 26, -3], s: [9, 5, 6], c: '#c8bdb1' }] },
      { name: 'head', pivot: [0, 43, -2], boxes: [{ o: [-4, 43, -7.5], s: [8, 10, 8], c: '#d8cdc1', f: { front: (T, x, y) => { T.fill(x, y, 8, 10, '#d8cdc1', 0.12); T.rect(x + 1, y + 4, 2, 1, '#a01010'); T.rect(x + 5, y + 4, 2, 1, '#a01010'); T.rect(x + 1, y + 3, 6, 1, '#8a7a6a'); } } }, { o: [-1, 44, -9.5], s: [2, 4, 2], c: '#c8bdb1' }] },
      { name: 'rightArm', pivot: [11, 41, 0], boxes: [{ o: [9, 11, -3], s: [4, 30, 6], c: '#d8cdc1', f: { all: (T, x, y, w, h) => { for (let i = 0; i < 5; i++) T.fill(x, y + 4 + i * 5, w, 2, '#5f8a2a', 0.2); } } }] },
      { name: 'leftArm', pivot: [-11, 41, 0], boxes: [{ o: [-13, 11, -3], s: [4, 30, 6], c: '#d8cdc1' }] },
      { name: 'rightLeg', pivot: [4, 26, 0], boxes: [{ o: [1.5, 0, -3], s: [6, 16, 5], c: '#c8bdb1' }] },
      { name: 'leftLeg', pivot: [-4, 26, 0], boxes: [{ o: [-7.5, 0, -3], s: [6, 16, 5], c: '#c8bdb1' }] },
    ],
  }),
  snow_golem: () => ({
    seed: 155,
    parts: [
      { name: 'body', pivot: [0, 10, 0], boxes: [{ o: [-6, 0, -6], s: [12, 12, 12], c: '#f4f8f8', n: 0.05 }, { o: [-5, 11, -5], s: [10, 10, 10], c: '#f4f8f8', n: 0.05 }] },
      { name: 'head', pivot: [0, 21, 0], boxes: [{ o: [-4, 21, -4], s: [8, 8, 8], c: '#d47a19', n: 0.2, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, '#d47a19', 0.2); T.rect(x + 1, y + 2, 2, 2, '#3b2306'); T.rect(x + 5, y + 2, 2, 2, '#3b2306'); T.rect(x + 1, y + 5, 6, 1, '#3b2306'); } } }] },
      { name: 'rightArm', pivot: [5, 18, 0], rot: [0, 0, 1], boxes: [{ o: [5, 17, -1], s: [12, 2, 2], c: '#6b5130' }] },
      { name: 'leftArm', pivot: [-5, 18, 0], rot: [0, 0, -1], boxes: [{ o: [-17, 17, -1], s: [12, 2, 2], c: '#6b5130' }] },
    ],
  }),
  slime: (magma) => ({
    seed: 161,
    parts: [
      { name: 'inner', pivot: [0, 0, 0], boxes: [{ o: [-3, 1, -3], s: [6, 6, 6], c: magma ? '#3a0a08' : '#4a9a3a', f: { front: (T, x, y) => { if (magma) { T.rect(x + 1, y + 2, 2, 1, '#ffb030'); T.rect(x + 4, y + 2, 2, 1, '#ffb030'); } else { T.rect(x + 1, y + 1, 2, 2, '#1a3a12'); T.rect(x + 4, y + 1, 2, 2, '#1a3a12'); T.px(x + 3, y + 4, '#1a3a12'); } } } }] },
      { name: 'outer', pivot: [0, 0, 0], noShadow: !magma, boxes: [{ o: [-4, 0, -4], s: [8, 8, 8], c: magma ? '#6a1a10' : '#7ad06a', alpha: magma ? 1 : 0.6, n: 0.2, f: magma ? { all: (T, x, y, w, h) => { for (let i = 0; i < h; i += 2) T.fill(x, y + i, w, 1, '#ff8a20', 0.3); } } : {} }] },
    ],
  }),
  ghast: () => {
    const parts = [{ name: 'body', pivot: [0, 8, 0], boxes: [{ o: [-8, 8, -8], s: [16, 16, 16], c: '#f2f2f2', n: 0.05, f: { front: (T, x, y) => { T.fill(x, y, 16, 16, '#f2f2f2', 0.05); T.rect(x + 3, y + 5, 3, 2, '#5a5a5a'); T.rect(x + 10, y + 5, 3, 2, '#5a5a5a'); T.rect(x + 6, y + 10, 4, 2, '#5a5a5a'); for (let i = 0; i < 3; i++) T.px(x + 4, y + 8 + i, '#a8c8d8'); } } }] }];
    for (let i = 0; i < 9; i++) {
      const tx = (i % 3 - 1) * 5, tz = (Math.floor(i / 3) - 1) * 5;
      parts.push({ name: 't' + i, pivot: [tx, 8, tz], boxes: [{ o: [tx - 1, 8 - (9 + (i * 7) % 6), tz - 1], s: [2, 9 + (i * 7) % 6, 2], c: '#e8e8e8' }] });
    }
    return { seed: 171, parts };
  },
  blaze: () => {
    const parts = [{ name: 'head', pivot: [0, 18, 0], boxes: [{ o: [-4, 18, -4], s: [8, 8, 8], c: '#f2b01a', n: 0.25, f: { front: (T, x, y) => { T.fill(x, y, 8, 8, '#f2b01a', 0.25); T.rect(x + 1, y + 3, 2, 1, '#2a1a0a'); T.rect(x + 5, y + 3, 2, 1, '#2a1a0a'); T.rect(x + 2, y + 5, 4, 1, '#c86a10'); } } }] }];
    for (let i = 0; i < 12; i++) parts.push({ name: 'rod' + i, pivot: [0, 0, 0], boxes: [{ o: [-1, 0, -1], s: [2, 8, 2], c: '#f8c83a', n: 0.3 }] });
    return { seed: 181, parts };
  },
  squid: (glow) => {
    const c = glow ? '#1a8a8a' : '#283e52';
    const parts = [{ name: 'body', pivot: [0, 8, 0], boxes: [{ o: [-6, 8, -6], s: [12, 16, 12], c, n: 0.15, f: { front: (T, x, y) => { T.rect(x + 2, y + 10, 2, 2, '#ffffff'); T.rect(x + 8, y + 10, 2, 2, '#ffffff'); T.px(x + 3, y + 11, '#1a1a1a'); T.px(x + 8, y + 11, '#1a1a1a'); } } }] }];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      parts.push({ name: 't' + i, pivot: [Math.cos(a) * 5, 8, Math.sin(a) * 5], boxes: [{ o: [Math.cos(a) * 5 - 1, -10, Math.sin(a) * 5 - 1], s: [2, 18, 2], c }] });
    }
    return { seed: 191, parts };
  },
  cod: () => ({ seed: 201, parts: [
    { name: 'body', pivot: [0, 2, 0], boxes: [{ o: [-1, 0, -4], s: [2, 4, 7], c: '#b8a070', f: { right: (T, x, y) => T.px(x + 1, y + 1, '#1a1a1a'), left: (T, x, y, w) => T.px(x + w - 2, y + 1, '#1a1a1a') } }, { o: [-0.5, 4, -1], s: [1, 1, 3], c: '#a08a5a' }] },
    { name: 'tail', pivot: [0, 2, 3], boxes: [{ o: [-0.5, 0, 3], s: [1, 4, 4], c: '#a08a5a' }] }] }),
  dolphin: () => ({ seed: 205, parts: [
    { name: 'body', pivot: [0, 4, 0], boxes: [{ o: [-4, 0, -6], s: [8, 7, 13], c: '#6a7f94', f: { bottom: '#d8e0e8' } }, { o: [-0.5, 7, -2], s: [1, 4, 5], c: '#5a6f84' }] },
    { name: 'head', pivot: [0, 4, -6], boxes: [{ o: [-4, 0, -12], s: [8, 7, 6], c: '#6a7f94', f: { front: (T, x, y) => { T.px(x + 1, y + 3, '#1a1a1a'); T.px(x + 6, y + 3, '#1a1a1a'); } } }, { o: [-1, 0, -16], s: [2, 2, 4], c: '#e0e8f0' }] },
    { name: 'tail', pivot: [0, 4, 7], boxes: [{ o: [-2, 1, 7], s: [4, 5, 11], c: '#6a7f94' }, { o: [-5, 2, 16], s: [10, 1, 4], c: '#5a6f84' }] }] }),
  silverfish: (ender) => {
    const c = ender ? '#1a1018' : '#7a7a7a';
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push({ name: 's' + i, pivot: [0, 0, -6 + i * 2.2], boxes: [{ o: [-1.5 + (i === 2 ? -0.5 : 0), 0, -7 + i * 2.2], s: [3 + (i === 2 ? 1 : 0), 2 + (i < 3 ? 1 : 0), 2.2], c, f: ender && i === 0 ? { front: (T, x, y) => T.px(x + 1, y, '#b060e0') } : {} }] });
    return { seed: 211, parts };
  },
  hoglin: (zombie) => {
    const c = zombie ? '#b88a7a' : '#c86e55';
    return { seed: 221, parts: [
      { name: 'body', pivot: [0, 19, 0], boxes: [{ o: [-8, 10, -11], s: [16, 14, 26], c }, { o: [-1, 24, -10], s: [2, 6, 20], c: '#5a3a2a' }] },
      { name: 'head', pivot: [0, 18, -11], rot: [0.6, 0, 0], boxes: [{ o: [-7, 10, -30], s: [14, 6, 19], c, f: { front: (T, x, y) => { T.px(x + 3, y + 2, '#1a1a1a'); T.px(x + 10, y + 2, '#1a1a1a'); } } }, { o: [-9, 11, -27], s: [2, 11, 2], c: '#f0e8d8' }, { o: [7, 11, -27], s: [2, 11, 2], c: '#f0e8d8' }] },
      { name: 'leg1', pivot: [5, 10, 10], boxes: [{ o: [2, 0, 8], s: [5, 11, 5], c }] },
      { name: 'leg2', pivot: [-5, 10, 10], boxes: [{ o: [-7, 0, 8], s: [5, 11, 5], c }] },
      { name: 'leg3', pivot: [5, 10, -7], boxes: [{ o: [2, 0, -9], s: [6, 14, 6], c }] },
      { name: 'leg4', pivot: [-5, 10, -7], boxes: [{ o: [-8, 0, -9], s: [6, 14, 6], c }] },
    ] };
  },
  strider: () => ({ seed: 231, parts: [
    { name: 'body', pivot: [0, 16, 0], boxes: [{ o: [-8, 16, -8], s: [16, 14, 16], c: '#9c3436', f: { front: (T, x, y) => { T.rect(x + 3, y + 4, 3, 2, '#1a1a1a'); T.rect(x + 10, y + 4, 3, 2, '#1a1a1a'); T.rect(x + 5, y + 9, 6, 1, '#4a1a1a'); } } }] },
    { name: 'leg1', pivot: [4, 16, 0], boxes: [{ o: [2, 0, -2], s: [4, 16, 4], c: '#4d494d' }] },
    { name: 'leg2', pivot: [-4, 16, 0], boxes: [{ o: [-6, 0, -2], s: [4, 16, 4], c: '#4d494d' }] }] }),
  shulker: () => ({ seed: 241, parts: [
    { name: 'base', pivot: [0, 0, 0], boxes: [{ o: [-8, 0, -8], s: [16, 8, 16], c: '#946794' }] },
    { name: 'lid', pivot: [0, 8, 0], boxes: [{ o: [-8, 4, -8], s: [16, 12, 16], c: '#a87aa8' }] },
    { name: 'head', pivot: [0, 6, 0], boxes: [{ o: [-3, 2, -3], s: [6, 6, 6], c: '#e8e070', f: { front: (T, x, y) => { T.px(x + 1, y + 2, '#1a1a1a'); T.px(x + 4, y + 2, '#1a1a1a'); } } }] }] }),
  bat: () => ({ seed: 251, parts: [
    { name: 'body', pivot: [0, 0, 0], boxes: [{ o: [-3, -8, -3], s: [6, 12, 6], c: '#4a3a2a' }] },
    { name: 'head', pivot: [0, 4, 0], boxes: [{ o: [-3, 4, -3], s: [6, 6, 6], c: '#4a3a2a' }] },
    { name: 'wingR', pivot: [3, 0, 0], boxes: [{ o: [3, -8, 0], s: [10, 12, 0.5], c: '#3a2a1a' }] },
    { name: 'wingL', pivot: [-3, 0, 0], boxes: [{ o: [-13, -8, 0], s: [10, 12, 0.5], c: '#3a2a1a' }] }] }),
};

// Créature générique (quadrupède) à partir des couleurs de l'œuf
export function genericQuadruped(c1, c2, size = 1) {
  return {
    seed: 999,
    parts: [
      { name: 'body', pivot: [0, 12, 0], boxes: [{ o: [-4, 7, -6], s: [8, 7, 12], c: c1, f: { all: (T, x, y, w, h) => { for (let i = 0; i < 3; i++) T.fill(x + Math.floor(T.rnd() * (w - 2)), y + Math.floor(T.rnd() * (h - 2)), 2, 2, c2); } } }] },
      { name: 'head', pivot: [0, 12, -6], boxes: [{ o: [-3, 10, -11], s: [6, 6, 5], c: c1, f: { front: (T, x, y) => { T.px(x + 1, y + 2, '#111'); T.px(x + 4, y + 2, '#111'); T.rect(x + 2, y + 4, 2, 1, c2); } } }, { o: [-3, 16, -9], s: [2, 2, 1], c: c2 }, { o: [1, 16, -9], s: [2, 2, 1], c: c2 }] },
      { name: 'tail', pivot: [0, 13, 6], rot: [0.8, 0, 0], boxes: [{ o: [-1, 8, 5], s: [2, 6, 2], c: c2 }] },
      { name: 'leg1', pivot: [2.5, 7, 4], boxes: [{ o: [1, 0, 3], s: [3, 7, 3], c: c1 }] },
      { name: 'leg2', pivot: [-2.5, 7, 4], boxes: [{ o: [-4, 0, 3], s: [3, 7, 3], c: c1 }] },
      { name: 'leg3', pivot: [2.5, 7, -4], boxes: [{ o: [1, 0, -5], s: [3, 7, 3], c: c1 }] },
      { name: 'leg4', pivot: [-2.5, 7, -4], boxes: [{ o: [-4, 0, -5], s: [3, 7, 3], c: c1 }] },
    ],
  };
}

export { Tex, face, eyes };
