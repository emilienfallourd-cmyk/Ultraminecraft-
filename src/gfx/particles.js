// Système de particules (points GPU) : fragments de blocs, fumée, flammes, éclaboussures, pluie, neige, portails...
import * as THREE from 'three';
import { BLOCKS } from '../blocks/blocks.js';
import { tileIndex } from './textures.js';

const MAX = 6000;
const VS = /* glsl */`
attribute float aSize;
attribute float aTile;
attribute vec2 aUvOff;
attribute vec4 aColor;
attribute float aType;
uniform float uScale;
varying float vTile;
varying vec2 vUvOff;
varying vec4 vColor;
varying float vType;
void main(){
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
  vTile = aTile; vUvOff = aUvOff; vColor = aColor; vType = aType;
}`;
const FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform vec3 uSkyAmbient;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uBlockColor;
varying float vTile;
varying vec2 vUvOff;
varying vec4 vColor;
varying float vType;
void main(){
  vec2 pc = gl_PointCoord;
  if (vType < 0.5) {
    vec4 t = textureLod(uAlbedo, vec3(vUvOff + pc * 0.25, vTile), 0.0);
    if (t.a < 0.4) discard;
    vec3 c = t.rgb * vColor.rgb * ((uSkyAmbient + uSunColor * max(uSunDir.y, 0.0) * 0.5) * vColor.a + uBlockColor * (1.0 - vColor.a) * 0.6 + 0.02);
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec2 q = pc - 0.5;
  float r = length(q) * 2.0;
  if (vType > 2.5 && vType < 3.5) { // goutte de pluie : trait vertical
    float m = smoothstep(0.12, 0.0, abs(q.x)) * smoothstep(0.5, 0.2, abs(q.y));
    if (m < 0.02) discard;
    vec3 c = vColor.rgb * (uSkyAmbient * 1.4 + uSunColor * 0.2);
    gl_FragColor = vec4(c * vColor.a * m, vColor.a * m);
    return;
  }
  if (r > 1.0) discard;
  float soft = 1.0 - r * r;
  if (vType > 1.5) { // émissif additif
    gl_FragColor = vec4(vColor.rgb * soft * vColor.a * 3.0, 0.0);
  } else {
    vec3 c = vColor.rgb * (uSkyAmbient + uSunColor * 0.35 + 0.04);
    float a = vColor.a * soft;
    gl_FragColor = vec4(c * a, a);
  }
}`;

export class Particles {
  constructor(pipeline, game) {
    this.game = game;
    this.p = [];
    this.solid = this.makePoints(pipeline, false);
    this.soft = this.makePoints(pipeline, true);
    pipeline.entityScene.add(this.solid.points);
    pipeline.entityScene.add(this.soft.points);
    this.enabled = true;
    this.density = 1;
  }
  makePoints(pipeline, soft) {
    const g = new THREE.BufferGeometry();
    const o = {
      pos: new Float32Array(MAX * 3), size: new Float32Array(MAX), tile: new Float32Array(MAX), uv: new Float32Array(MAX * 2),
      col: new Float32Array(MAX * 4), type: new Float32Array(MAX),
    };
    g.setAttribute('position', new THREE.BufferAttribute(o.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(o.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTile', new THREE.BufferAttribute(o.tile, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUvOff', new THREE.BufferAttribute(o.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(o.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aType', new THREE.BufferAttribute(o.type, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { uAlbedo: pipeline.U.uAlbedo, uSkyAmbient: pipeline.U.uSkyAmbient, uSunColor: pipeline.U.uSunColor, uSunDir: pipeline.U.uSunDir, uBlockColor: pipeline.U.uBlockColor, uScale: { value: 400 } },
      transparent: soft, depthWrite: !soft,
      blending: soft ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    points.renderOrder = soft ? 10 : 0;
    o.points = points; o.geom = g; o.mat = mat;
    return o;
  }

  add(x, y, z, vx, vy, vz, o) {
    if (!this.enabled) return;
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({
      x, y, z, vx, vy, vz, life: o.life || 1, max: o.life || 1, size: o.size || 0.1, grav: o.grav ?? 0, drag: o.drag ?? 0.98,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, type: o.type || 0, tile: o.tile || 0, u: o.u || 0, v: o.v || 0,
      grow: o.grow || 0, fade: o.fade ?? true, collide: o.collide || false, light: o.light ?? 1, onDie: o.onDie,
    });
  }

  // ---------------------------------------------------------- ÉMETTEURS
  blockBreak(x, y, z, id) {
    const def = BLOCKS[id];
    if (!def || def.shape === 'none') return;
    const tile = tileIndex(def.tex[2] && def.shape === 'cube' ? def.tex[4] : def.tex[0]);
    const tint = def.tint === 1 ? [0.47, 0.74, 0.32] : def.tint === 2 ? [0.42, 0.7, 0.22] : [1, 1, 1];
    const l = this.lightAt(x + 0.5, y + 0.5, z + 0.5);
    const n = Math.round(4 * this.density);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const px = x + (i + 0.5) / n, py = y + (j + 0.5) / n, pz = z + (k + 0.5) / n;
      this.add(px, py, pz, (px - x - 0.5) * 0.12 + (Math.random() - 0.5) * 0.06, (py - y - 0.5) * 0.1 + Math.random() * 0.12, (pz - z - 0.5) * 0.12 + (Math.random() - 0.5) * 0.06,
        { type: 0, tile, u: Math.floor(Math.random() * 4) * 0.25, v: Math.floor(Math.random() * 4) * 0.25, size: 0.1 + Math.random() * 0.06, life: 0.6 + Math.random() * 0.8, grav: 9, drag: 0.98, r: tint[0], g: tint[1], b: tint[2], a: l, collide: true, fade: false });
    }
  }
  blockHit(x, y, z, face, id) {
    const def = BLOCKS[id];
    if (!def) return;
    const tile = tileIndex(def.tex[face] || def.tex[0]);
    const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face] || [0, 1, 0];
    const tint = def.tint === 1 ? [0.47, 0.74, 0.32] : def.tint === 2 ? [0.42, 0.7, 0.22] : [1, 1, 1];
    const l = this.lightAt(x + 0.5 + d[0], y + 0.5 + d[1], z + 0.5 + d[2]);
    const px = x + 0.5 + d[0] * 0.52 + (d[0] ? 0 : (Math.random() - 0.5) * 0.9);
    const py = y + 0.5 + d[1] * 0.52 + (d[1] ? 0 : (Math.random() - 0.5) * 0.9);
    const pz = z + 0.5 + d[2] * 0.52 + (d[2] ? 0 : (Math.random() - 0.5) * 0.9);
    this.add(px, py, pz, d[0] * 0.05 + (Math.random() - 0.5) * 0.04, d[1] * 0.05 + Math.random() * 0.05, d[2] * 0.05 + (Math.random() - 0.5) * 0.04,
      { type: 0, tile, u: Math.floor(Math.random() * 4) * 0.25, v: Math.floor(Math.random() * 4) * 0.25, size: 0.08, life: 0.5, grav: 9, collide: true, fade: false, r: tint[0], g: tint[1], b: tint[2], a: l });
  }
  smoke(x, y, z, scale = 1, dark = 0.3) {
    this.add(x, y, z, (Math.random() - 0.5) * 0.02, 0.03 + Math.random() * 0.02, (Math.random() - 0.5) * 0.02,
      { type: 1, size: 0.25 * scale, grow: 0.6 * scale, life: 1.2 + Math.random(), r: dark, g: dark, b: dark, a: 0.55, drag: 0.96, grav: -0.3 });
  }
  bigSmoke(x, y, z) {
    this.add(x, y, z, (Math.random() - 0.5) * 0.05, 0.08 + Math.random() * 0.04, (Math.random() - 0.5) * 0.05,
      { type: 1, size: 0.8, grow: 2.5, life: 4 + Math.random() * 3, r: 0.6, g: 0.6, b: 0.62, a: 0.35, drag: 0.985, grav: -0.25 });
  }
  flame(x, y, z, kind = 'fire') {
    const c = kind === 'soul' ? [0.3, 0.9, 1] : kind === 'dragon' ? [0.8, 0.3, 1] : [1, 0.55, 0.15];
    this.add(x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1, 0, 0.015, 0, { type: 2, size: 0.1, grow: -0.05, life: 0.5 + Math.random() * 0.3, r: c[0], g: c[1], b: c[2], a: 1, drag: 0.95 });
  }
  torch(x, y, z, soul) {
    this.flame(x, y, z, soul ? 'soul' : 'fire');
    if (Math.random() < 0.3) this.smoke(x, y + 0.1, z, 0.4, 0.25);
  }
  lavaPop(x, y, z) {
    this.add(x, y, z, (Math.random() - 0.5) * 0.1, 0.2 + Math.random() * 0.15, (Math.random() - 0.5) * 0.1, { type: 2, size: 0.08, life: 1.2, grav: 12, r: 1, g: 0.5, b: 0.1, collide: true });
  }
  splash(x, y, z, s = 1) {
    const n = Math.round(12 * s * this.density) + 4;
    for (let i = 0; i < n; i++) this.add(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.2 * s, (Math.random() - 0.5) * 0.15,
      { type: 1, size: 0.08, life: 0.6, grav: 14, r: 0.7, g: 0.82, b: 1, a: 0.8, collide: true });
  }
  bubble(x, y, z) {
    this.add(x, y, z, (Math.random() - 0.5) * 0.01, 0.06, (Math.random() - 0.5) * 0.01, { type: 1, size: 0.07, life: 1.2, r: 0.85, g: 0.95, b: 1, a: 0.7, grav: -0.5, drag: 0.92 });
  }
  explosion(x, y, z, power) {
    const n = Math.round((20 + power * 8) * this.density);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI, sp = 0.1 + Math.random() * 0.25 * power * 0.4;
      const vx = Math.sin(b) * Math.cos(a) * sp, vy = Math.cos(b) * sp, vz = Math.sin(b) * Math.sin(a) * sp;
      this.add(x + vx * 2, y + vy * 2, z + vz * 2, vx, vy, vz, { type: 1, size: 0.6 + Math.random(), grow: 2, life: 1.2 + Math.random() * 1.5, r: 0.55, g: 0.55, b: 0.55, a: 0.6, drag: 0.92 });
      if (i % 2 === 0) this.add(x + vx * 3, y + vy * 3, z + vz * 3, vx * 1.6, vy * 1.6, vz * 1.6, { type: 2, size: 0.5 + Math.random() * 0.5, grow: -0.6, life: 0.35 + Math.random() * 0.3, r: 1, g: 0.6, b: 0.2, a: 1, drag: 0.9 });
    }
  }
  portal(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) this.add(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05,
      { type: 2, size: 0.08, life: 1 + Math.random(), r: 0.6, g: 0.25, b: 1, a: 1, drag: 0.98 });
  }
  crit(x, y, z) { this.add(x, y, z, (Math.random() - 0.5) * 0.1, Math.random() * 0.1, (Math.random() - 0.5) * 0.1, { type: 2, size: 0.07, life: 0.5, r: 0.9, g: 0.9, b: 1, grav: 3 }); }
  hearts(x, y, z) { for (let i = 0; i < 4; i++) this.add(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), 0, 0.03, 0, { type: 2, size: 0.15, life: 1, r: 1, g: 0.25, b: 0.35 }); }
  burst(x, y, z, color, n = 10) {
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    for (let i = 0; i < n; i++) this.add(x, y, z, (Math.random() - 0.5) * 0.2, Math.random() * 0.2, (Math.random() - 0.5) * 0.2, { type: 1, size: 0.08, life: 0.6, grav: 10, r, g, b, a: 1, collide: true });
  }
  breath(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) this.add(x + (Math.random() - 0.5) * 3, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.03, 0.02, (Math.random() - 0.5) * 0.03,
      { type: 2, size: 0.25, grow: 0.5, life: 1.2, r: 0.75, g: 0.25, b: 0.9, a: 0.6, drag: 0.95 });
  }
  sonicRing(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 18; i++) { const t = i / 18 * 15; this.add(x + dx * t, y + dy * t, z + dz * t, 0, 0, 0, { type: 2, size: 0.9 + i * 0.02, grow: 1.5, life: 0.6, r: 0.4, g: 0.85, b: 0.95, a: 0.7 }); }
  }
  soul(x, y, z) { this.add(x, y, z, 0, 0.04, 0, { type: 2, size: 0.15, life: 1.5, r: 0.3, g: 0.95, b: 1, a: 0.9, drag: 0.98 }); }
  sparkle(x, y, z, r = 1, g = 1, b = 0.5) { this.add(x, y, z, (Math.random() - 0.5) * 0.04, 0.03, (Math.random() - 0.5) * 0.04, { type: 2, size: 0.07, life: 0.8, r, g, b }); }
  drip(x, y, z, lava) { this.add(x, y, z, 0, 0, 0, { type: lava ? 2 : 1, size: 0.06, life: 2, grav: 6, r: lava ? 1 : 0.4, g: lava ? 0.4 : 0.6, b: lava ? 0.1 : 1, a: 0.9, collide: true }); }
  petal(x, y, z) { this.add(x, y, z, 0.02 + Math.random() * 0.02, -0.01, (Math.random() - 0.5) * 0.02, { type: 1, size: 0.07, life: 6, grav: 0.3, r: 1, g: 0.7, b: 0.85, a: 1, drag: 0.99, collide: true }); }
  rain(x, y, z, snow) {
    if (snow) this.add(x, y, z, (Math.random() - 0.5) * 0.02, -0.06, (Math.random() - 0.5) * 0.02, { type: 1, size: 0.07, life: 6, r: 1, g: 1, b: 1, a: 0.9, drag: 1, collide: true });
    else this.add(x, y, z, 0, -0.9, 0, { type: 3, size: 0.55, life: 1.5, r: 0.65, g: 0.75, b: 0.9, a: 0.45, drag: 1, collide: true, fade: false, onDie: 'rainSplash' });
  }
  lightAt(x, y, z) {
    const w = this.game.world;
    if (!w) return 1;
    const l = w.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return Math.max(0.05, (l >> 4) / 15);
  }

  // ---------------------------------------------------------------- MISE À JOUR
  update(dt) {
    const w = this.game.world;
    const S = this.solid, F = this.soft;
    let ns = 0, nf = 0;
    const keep = [];
    for (const p of this.p) {
      p.life -= dt;
      if (p.life <= 0) {
        if (p.onDie === 'rainSplash' && Math.random() < 0.3) this.add(p.x, p.y + 0.05, p.z, 0, 0.03, 0, { type: 1, size: 0.05, life: 0.25, r: 0.7, g: 0.8, b: 1, a: 0.5 });
        continue;
      }
      const f = Math.pow(p.drag, dt * 20);
      p.vx *= f; p.vy *= f; p.vz *= f;
      p.vy -= p.grav * dt * 0.05;
      const nx = p.x + p.vx * dt * 20, ny = p.y + p.vy * dt * 20, nz = p.z + p.vz * dt * 20;
      if (p.collide && w) {
        const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        const d = BLOCKS[id];
        if (d && (d.solid && d.shape !== 'cross' || (p.type === 3 && d.fluid))) {
          if (p.type === 3 || p.onDie) { p.life = 0; p.y = Math.floor(ny) + 1; if (p.onDie === 'rainSplash') this.add(p.x, p.y + 0.02, p.z, 0, 0.02, 0, { type: 1, size: 0.05, life: 0.2, r: 0.7, g: 0.8, b: 1, a: 0.5 }); continue; }
          p.vy = 0; p.vx *= 0.5; p.vz *= 0.5;
          if (Math.floor(ny) !== Math.floor(p.y)) { /* posé */ } else { p.x = nx; p.z = nz; }
        } else { p.x = nx; p.y = ny; p.z = nz; }
      } else { p.x = nx; p.y = ny; p.z = nz; }
      p.size = Math.max(0.01, p.size + p.grow * dt);
      keep.push(p);
      const t = p.life / p.max;
      const a = p.fade ? Math.min(1, t * 2) * p.a : p.a;
      const O = p.type === 0 ? S : F;
      const i = p.type === 0 ? ns++ : nf++;
      if (i >= MAX) continue;
      O.pos[i * 3] = p.x; O.pos[i * 3 + 1] = p.y; O.pos[i * 3 + 2] = p.z;
      O.size[i] = p.size; O.tile[i] = p.tile; O.uv[i * 2] = p.u; O.uv[i * 2 + 1] = p.v;
      O.col[i * 4] = p.r; O.col[i * 4 + 1] = p.g; O.col[i * 4 + 2] = p.b; O.col[i * 4 + 3] = a;
      O.type[i] = p.type;
    }
    this.p = keep;
    for (const [O, n] of [[S, ns], [F, nf]]) {
      O.geom.setDrawRange(0, n);
      for (const k of ['position', 'aSize', 'aTile', 'aUvOff', 'aColor', 'aType']) {
        const at = O.geom.attributes[k];
        at.needsUpdate = true;
      }
    }
  }
  setScale(h, fov) { const s = h / (2 * Math.tan((fov * Math.PI / 180) / 2)); this.solid.mat.uniforms.uScale.value = s; this.soft.mat.uniforms.uScale.value = s; }
  clear() { this.p = []; }
}
