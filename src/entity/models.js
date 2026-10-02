// Système de modèles en boîtes (format proche de Minecraft) + maillages d'objets (blocs miniatures, sprites extrudés)
import * as THREE from 'three';
import * as SH from '../gfx/shaders.js';
import { BLOCKS } from '../blocks/blocks.js';
import { ITEMS } from '../items/items.js';
import { bakeModel } from '../world/mesher.js';
import { tileIndex } from '../gfx/textures.js';
import { itemSpritePixels } from '../gfx/icons.js';

let PIPE = null;
export function setPipeline(p) { PIPE = p; }

// ---------------------------------------------------------- MATÉRIAUX
export function entityMaterial(map, o = {}) {
  const U = PIPE.U;
  const uniforms = {
    ...U,
    uMap: { value: map }, uSky: { value: 1 }, uBlock: { value: 0 }, uHurt: { value: 0 }, uHurtColor: { value: new THREE.Vector3(1, 0.1, 0.1) },
    uEmissive: { value: o.emissive || 0 }, uAlpha: { value: o.alpha ?? 1 }, uTintColor: { value: new THREE.Vector3(1, 1, 1) }, uGlow: { value: o.glow || 0 },
  };
  const m = new THREE.ShaderMaterial({
    vertexShader: SH.ENTITY_VS, fragmentShader: SH.ENTITY_FS, uniforms,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide, transparent: !!o.transparent, depthWrite: o.depthWrite ?? true,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return m;
}

const BLOCK_ITEM_VS = /* glsl */`
attribute float aTile;
varying vec2 vUv;
flat varying float vTile;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vUv = uv; vTile = aTile;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BLOCK_ITEM_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform vec3 uCamPos;
uniform float uSky;
uniform float uBlock;
uniform vec3 uTintColor;
uniform float uHurt;
varying vec2 vUv;
flat varying float vTile;
varying vec3 vNormal;
varying vec3 vWorldPos;
${SH.COMMON}
${SH.CLOUDS}
${SH.SHADOW}
${SH.LIGHTING}
void main(){
  vec4 a = texture(uAlbedo, vec3(vUv, vTile));
  float aRaw = textureLod(uAlbedo, vec3(vUv, vTile), 0.0).a;
  if (aRaw < 0.4) discard;
  float tintMask = (aRaw > 0.5 && aRaw < 0.75) ? 1.0 : 0.0;
  vec3 albedo = a.rgb * mix(vec3(1.0), uTintColor, tintMask);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 col = shade(albedo, N, N, vWorldPos, V, uSky, uBlock, 1.0, 0.1, 0.0, 1.0, false, ign(gl_FragCoord.xy));
  col = mix(col, vec3(1.0, 0.1, 0.1) * (uSkyAmbient + 0.3), uHurt * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;
let blockItemMatShared = null;
export function blockItemMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: BLOCK_ITEM_VS, fragmentShader: BLOCK_ITEM_FS, side: THREE.DoubleSide,
    uniforms: { ...PIPE.U, uSky: { value: 1 }, uBlock: { value: 0 }, uTintColor: { value: new THREE.Vector3(1, 1, 1) }, uHurt: { value: 0 } },
  });
}

// lumière du monde appliquée à un objet avant son rendu
export function applyLight(obj, sky, blk) {
  obj.traverse((o) => {
    if (o.material && o.material.uniforms && o.material.uniforms.uSky) {
      o.material.uniforms.uSky.value = sky;
      o.material.uniforms.uBlock.value = blk;
    }
  });
}

// --------------------------------------------- GÉOMÉTRIE DE BLOC (objet)
const FV = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const geomCache = new Map();
const DUMMY = { id: () => 0, meta: () => 0, hash: 0 };

export function blockGeometry(id, meta = 0) {
  const key = id * 256 + meta;
  if (geomCache.has(key)) return geomCache.get(key);
  const def = BLOCKS[id];
  let quads = [];
  if (def.shape === 'model' && def.modelFn) quads = bakeModel(def, meta, DUMMY);
  else if (def.shape === 'cross') {
    const t = tileIndex(def.tex[0]);
    quads.push({ verts: [[0.15, 0, 0.85], [0.85, 0, 0.15], [0.85, 1, 0.15], [0.15, 1, 0.85]], n: [0.7, 0, 0.7], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], tile: t });
    quads.push({ verts: [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]], n: [-0.7, 0, 0.7], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], tile: t });
  } else {
    for (let f = 0; f < 6; f++) {
      let t = def.tex[f];
      if (def.facing && f === 4 && def.texFront) t = def.texFront;
      quads.push({ verts: FV[f], n: DIRS[f], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], tile: tileIndex(t) });
    }
  }
  const pos = [], nor = [], uv = [], tile = [], idx = [];
  for (const q of quads) {
    const b = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      pos.push(q.verts[k][0] - 0.5, q.verts[k][1] - 0.5, q.verts[k][2] - 0.5);
      nor.push(q.n[0], q.n[1], q.n[2]);
      uv.push(q.uv[k][0], q.uv[k][1]);
      tile.push(q.tile);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTile', new THREE.Float32BufferAttribute(tile, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  geomCache.set(key, g);
  return g;
}

// ------------------------------------------- SPRITE EXTRUDÉ (objet tenu)
const spriteCache = new Map();
export function spriteMesh(id) {
  let c = spriteCache.get(id);
  if (!c) {
    const px = itemSpritePixels(id);
    if (!px) return null;
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = px[y * 16 + x]; if (p) { ctx.fillStyle = p; ctx.fillRect(x, y, 1, 1); } }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.flipY = false;
    const pos = [], nor = [], uv = [], idx = [];
    const T = 1 / 16;
    const quad = (a, b, cc, d, n, u0, v0, u1, v1) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...cc, ...d);
      for (let i = 0; i < 4; i++) nor.push(...n);
      uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const z0 = -0.5 * T, z1 = 0.5 * T;
    // faces avant / arrière
    quad([-0.5, -0.5, z1], [0.5, -0.5, z1], [0.5, 0.5, z1], [-0.5, 0.5, z1], [0, 0, 1], 0, 0, 1, 1);
    quad([0.5, -0.5, z0], [-0.5, -0.5, z0], [-0.5, 0.5, z0], [0.5, 0.5, z0], [0, 0, -1], 1, 0, 0, 1);
    // côtés par pixel
    const has = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 16 && !!px[y * 16 + x];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!has(x, y)) continue;
      const X0 = -0.5 + x * T, X1 = X0 + T, Y1 = 0.5 - y * T, Y0 = Y1 - T;
      const u0 = (x + 0.25) / 16, u1 = (x + 0.75) / 16, v0 = (y + 0.25) / 16, v1 = (y + 0.75) / 16;
      if (!has(x, y - 1)) quad([X0, Y1, z1], [X1, Y1, z1], [X1, Y1, z0], [X0, Y1, z0], [0, 1, 0], u0, v0, u1, v1);
      if (!has(x, y + 1)) quad([X0, Y0, z0], [X1, Y0, z0], [X1, Y0, z1], [X0, Y0, z1], [0, -1, 0], u0, v0, u1, v1);
      if (!has(x - 1, y)) quad([X0, Y0, z0], [X0, Y0, z1], [X0, Y1, z1], [X0, Y1, z0], [-1, 0, 0], u0, v0, u1, v1);
      if (!has(x + 1, y)) quad([X1, Y0, z1], [X1, Y0, z0], [X1, Y1, z0], [X1, Y1, z1], [1, 0, 0], u0, v0, u1, v1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    c = { geom: g, tex };
    spriteCache.set(id, c);
  }
  return new THREE.Mesh(c.geom, entityMaterial(c.tex, { double: true }));
}

// maillage d'un objet (bloc 3D ou sprite)
export function itemMesh(id, meta = 0) {
  const def = ITEMS[id];
  if (!def) return new THREE.Group();
  if (def.isBlock) {
    const b = BLOCKS[def.block];
    if (b.shape === 'cross' || (b.shape === 'model' && ['torch', 'crop', 'vine', 'ladder', 'fire', 'door'].includes(b.model))) {
      return flatTileMesh(b);
    }
    const m = new THREE.Mesh(blockGeometry(def.block, meta), blockItemMaterial());
    if (b.tint) {
      const t = { 1: [0.47, 0.74, 0.32], 2: [0.42, 0.7, 0.22], 4: [0.38, 0.6, 0.38], 5: [0.5, 0.65, 0.33], 6: [0.13, 0.5, 0.19] }[b.tint];
      if (t) m.material.uniforms.uTintColor.value.set(...t.map((v) => v * v));
    }
    return m;
  }
  return spriteMesh(id) || new THREE.Group();
}

function flatTileMesh(b) {
  const name = b.key === 'oak_door' ? 'oak_door_bottom' : b.tex[0];
  const t = tileIndex(name);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  g.setAttribute('aTile', new THREE.Float32BufferAttribute([t, t, t, t], 1));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(g, blockItemMaterial());
  if (b.tint) m.material.uniforms.uTintColor.value.set(0.22, 0.55, 0.1);
  return m;
}

// =============================================================== BOÎTES
// Modèle en boîtes : unités = pixels (1/16 de bloc), dépliage UV style Minecraft.
function boxGeometry(x0, y0, z0, w, h, d, u, v, tw, th, inflate = 0, mirror = false) {
  const X0 = x0 - inflate, Y0 = y0 - inflate, Z0 = z0 - inflate;
  const X1 = x0 + w + inflate, Y1 = y0 + h + inflate, Z1 = z0 + d + inflate;
  const pos = [], nor = [], uv = [], idx = [];
  const face = (c, n, ru, rv, rw, rh) => {
    const b = pos.length / 3;
    for (const p of c) pos.push(...p);
    for (let i = 0; i < 4; i++) nor.push(...n);
    let ua = ru / tw, ub = (ru + rw) / tw;
    if (mirror) { const t = ua; ua = ub; ub = t; }
    const va = rv / th, vb = (rv + rh) / th;
    uv.push(ua, va, ub, va, ub, vb, ua, vb); // TL TR BR BL
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  };
  // avant (-Z)
  face([[X1, Y1, Z0], [X0, Y1, Z0], [X0, Y0, Z0], [X1, Y0, Z0]], [0, 0, -1], u + d, v + d, w, h);
  // arrière (+Z)
  face([[X0, Y1, Z1], [X1, Y1, Z1], [X1, Y0, Z1], [X0, Y0, Z1]], [0, 0, 1], u + 2 * d + w, v + d, w, h);
  // +X
  face([[X1, Y1, Z1], [X1, Y1, Z0], [X1, Y0, Z0], [X1, Y0, Z1]], [1, 0, 0], u, v + d, d, h);
  // -X
  face([[X0, Y1, Z0], [X0, Y1, Z1], [X0, Y0, Z1], [X0, Y0, Z0]], [-1, 0, 0], u + d + w, v + d, d, h);
  // dessus
  face([[X1, Y1, Z1], [X0, Y1, Z1], [X0, Y1, Z0], [X1, Y1, Z0]], [0, 1, 0], u + d, v, w, d);
  // dessous
  face([[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y0, Z1], [X1, Y0, Z1]], [0, -1, 0], u + d + w, v, w, d);
  return { pos, nor, uv, idx };
}

export class ModelBuilder {
  constructor(texture, tw, th, mat) {
    this.tw = tw; this.th = th;
    this.material = mat || entityMaterial(texture);
    this.root = new THREE.Group();
    this.root.scale.setScalar(1 / 16);
    this.parts = {};
  }
  // pivot en coordonnées modèle ; boîtes : [x,y,z, w,h,d, u,v, inflate?, mirror?] en coordonnées absolues
  part(name, pivot, boxes, parent = null, rot = null) {
    const g = new THREE.Group();
    g.position.set(pivot[0], pivot[1], pivot[2]);
    const pp = parent ? this.parts[parent].userData.pivotAbs : [0, 0, 0];
    g.position.set(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2]);
    g.userData.pivotAbs = pivot;
    if (boxes && boxes.length) {
      const P = [], N = [], U = [], I = [];
      for (const b of boxes) {
        const r = boxGeometry(b[0] - pivot[0], b[1] - pivot[1], b[2] - pivot[2], b[3], b[4], b[5], b[6], b[7], this.tw, this.th, b[8] || 0, b[9] || false);
        const base = P.length / 3;
        P.push(...r.pos); N.push(...r.nor); U.push(...r.uv); I.push(...r.idx.map((i) => i + base));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setIndex(I);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.layers.enable(1);
      g.add(mesh);
    }
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    g.userData.baseRot = g.rotation.clone();
    (parent ? this.parts[parent] : this.root).add(g);
    this.parts[name] = g;
    return g;
  }
}

// ============================================================ PEINTURE
// Aide au dessin des textures de mobs (dépliage MC : u,v,w,h,d)
export class Painter {
  constructor(w, h, seed = 1) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.x = this.c.getContext('2d');
    this.s = seed;
  }
  rnd() { this.s = (this.s * 16807) % 2147483647; return (this.s & 0xffff) / 0xffff; }
  col(hex, f = 1) {
    const v = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((v >> 16) & 255) * f)), g = Math.max(0, Math.min(255, ((v >> 8) & 255) * f)), b = Math.max(0, Math.min(255, (v & 255) * f));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  rect(x, y, w, h, hex, noise = 0.12, f = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      this.x.fillStyle = this.col(hex, f * (1 - noise / 2 + this.rnd() * noise));
      this.x.fillRect(x + i, y + j, 1, 1);
    }
  }
  px(x, y, hex) { this.x.fillStyle = hex.startsWith('#') ? hex : hex; this.x.fillRect(x, y, 1, 1); }
  // peint toutes les faces d'une boîte
  box(u, v, w, h, d, hex, o = {}) {
    const n = o.noise ?? 0.14;
    this.rect(u + d, v, w, d, o.top || hex, n, o.topF ?? 1.08);
    this.rect(u + d + w, v, w, d, o.bottom || hex, n, o.botF ?? 0.8);
    this.rect(u, v + d, d, h, o.side || hex, n, 0.92);
    this.rect(u + d, v + d, w, h, o.front || hex, n, 1);
    this.rect(u + d + w, v + d, d, h, o.side || hex, n, 0.92);
    this.rect(u + 2 * d + w, v + d, w, h, o.back || hex, n, 0.95);
  }
  // origine de la face avant d'une boîte
  front(u, v, d) { return [u + d, v + d]; }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    return t;
  }
}
