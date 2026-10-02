// Main / objet tenu en vue à la première personne (animations de frappe, d'équipement, de repas, d'arc)
import * as THREE from 'three';
import { ITEMS, ITEM } from '../items/items.js';
import { BLOCKS } from '../blocks/blocks.js';
import { blockGeometry } from '../entity/models.js';
import { itemSpritePixels } from './icons.js';
import { buildModel, MODELS } from '../entity/mobmodels.js';

const TONE = /* glsl */`
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;
const VS = /* glsl */`
attribute float aTile;
varying vec2 vUv; varying vec3 vN; flat varying float vTile;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vTile = aTile; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS_MAP = /* glsl */`
uniform sampler2D uMap; uniform vec3 uLight; uniform float uExposure; uniform vec3 uTint;
varying vec2 vUv; varying vec3 vN; flat varying float vTile;
${TONE}
void main(){
  vec4 a = texture(uMap, vUv);
  if (a.a < 0.4) discard;
  float d = 0.62 + 0.38 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.8, 0.6))), 0.0);
  vec3 c = a.rgb * uTint * uLight * d;
  gl_FragColor = vec4(toSRGB(aces(c * uExposure)), 1.0);
}`;
const FS_ARRAY = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo; uniform vec3 uLight; uniform float uExposure; uniform vec3 uTint;
varying vec2 vUv; varying vec3 vN; flat varying float vTile;
${TONE}
void main(){
  vec4 a = texture(uAlbedo, vec3(vUv, vTile));
  float ar = textureLod(uAlbedo, vec3(vUv, vTile), 0.0).a;
  if (ar < 0.4) discard;
  float tm = (ar > 0.5 && ar < 0.75) ? 1.0 : 0.0;
  float d = 0.62 + 0.38 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.8, 0.6))), 0.0);
  vec3 c = a.rgb * mix(vec3(1.0), uTint, tm) * uLight * d;
  gl_FragColor = vec4(toSRGB(aces(c * uExposure)), 1.0);
}`;

export class Hand {
  constructor(game) {
    this.game = game;
    const P = game.pipeline;
    this.scene = P.handScene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.uLight = { value: new THREE.Vector3(1, 1, 1) };
    this.uExposure = { value: 1 };
    this.arrayMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_ARRAY, side: THREE.DoubleSide,
      uniforms: { uAlbedo: P.U.uAlbedo, uLight: this.uLight, uExposure: this.uExposure, uTint: { value: new THREE.Vector3(1, 1, 1) } } });
    this.swingT = 1;
    this.equip = 0;
    this.heldId = -1;
    this.current = null;
    this.armMesh = this.makeArm();
  }

  mapMat(tex) {
    return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_MAP, side: THREE.DoubleSide,
      uniforms: { uMap: { value: tex }, uLight: this.uLight, uExposure: this.uExposure, uTint: { value: new THREE.Vector3(1, 1, 1) } } });
  }

  makeArm() {
    const m = buildModel(MODELS.player());
    const src = m.parts.rightArm.children[0];
    const geo = src.geometry.clone();
    geo.scale(1 / 16, 1 / 16, 1 / 16);
    geo.translate(0, 0.25, 0);
    return new THREE.Mesh(geo, this.mapMat(m.tex));
  }

  swing() { if (this.swingT > 0.5) this.swingT = 0; }

  build(id) {
    if (this.current) this.root.remove(this.current);
    const g = new THREE.Group();
    if (id < 0) {
      g.add(this.armMesh);
      this.armMesh.position.set(0, 0, 0);
      this.armMesh.rotation.set(0, 0, 0);
      g.userData.kind = 'arm';
    } else {
      const def = ITEMS[id];
      if (def.isBlock && BLOCKS[def.block].shape !== 'cross' && !['torch', 'ladder', 'vine', 'crop', 'door'].includes(BLOCKS[def.block].model)) {
        const m = new THREE.Mesh(blockGeometry(def.block), this.arrayMat);
        const b = BLOCKS[def.block];
        if (b.tint) this.arrayMat.uniforms.uTint.value.set(0.22, 0.55, 0.1); else this.arrayMat.uniforms.uTint.value.set(1, 1, 1);
        m.scale.setScalar(0.4);
        m.rotation.set(0.1, Math.PI / 4, 0);
        g.add(m);
        g.userData.kind = 'block';
      } else {
        const px = def.isBlock ? null : itemSpritePixels(id);
        let mesh;
        if (px) {
          const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
          const ctx = canvas.getContext('2d');
          for (let i = 0; i < 256; i++) if (px[i]) { ctx.fillStyle = px[i]; ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1); }
          const tex = new THREE.CanvasTexture(canvas);
          tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
          mesh = this.extrude(px, this.mapMat(tex));
        } else {
          // plante / torche : tuile plate
          const b = BLOCKS[def.block];
          const geo = new THREE.PlaneGeometry(1, 1);
          const name = b.key === 'oak_door' ? 'oak_door_bottom' : b.tex[0];
          const t = this.game.pipeline.tiles ? 0 : 0;
          void t;
          const tile = new Float32Array(4).fill(tileIdx(name));
          geo.setAttribute('aTile', new THREE.BufferAttribute(tile, 1));
          mesh = new THREE.Mesh(geo, this.arrayMat);
          if (b.tint) this.arrayMat.uniforms.uTint.value.set(0.22, 0.55, 0.1);
        }
        mesh.scale.setScalar(0.62);
        g.add(mesh);
        g.userData.kind = 'item';
        g.userData.tool = !!def.tool || def.key === 'stick' || def.key === 'bow' || def.key === 'blaze_rod' || def.key === 'fishing_rod';
      }
    }
    this.current = g;
    this.root.add(g);
  }

  extrude(px, mat) {
    const T = 1 / 16;
    const pos = [], nor = [], uv = [], idx = [];
    const quad = (a, b, c, d, n, u0, v0, u1, v1) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) nor.push(...n);
      uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const z0 = -0.5 * T, z1 = 0.5 * T;
    quad([-0.5, -0.5, z1], [0.5, -0.5, z1], [0.5, 0.5, z1], [-0.5, 0.5, z1], [0, 0, 1], 0, 0, 1, 1);
    quad([0.5, -0.5, z0], [-0.5, -0.5, z0], [-0.5, 0.5, z0], [0.5, 0.5, z0], [0, 0, -1], 1, 0, 0, 1);
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
    return new THREE.Mesh(g, mat);
  }

  update(dt, alpha) {
    const g = this.game, p = g.player;
    if (!p) return;
    const held = p.held;
    const id = held ? held.id : -1;
    if (id !== this.heldId) { this.heldId = id; this.equip = 1; this.build(id); }
    this.equip = Math.max(0, this.equip - dt * 6);
    this.swingT = Math.min(1, this.swingT + dt * 3.4);
    // lumière
    const l = g.world.getLight(Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z));
    const sky = (l >> 4) / 15, blk = (l & 15) / 15;
    const e = g.env;
    const sc = e.sunColor || [1, 1, 1], am = e.ambient || [0.3, 0.3, 0.3];
    const s2 = sky * sky;
    const bl = blk * blk * blk * 2.2 + blk * 0.3;
    this.uLight.value.set(am[0] * s2 * 1.2 + sc[0] * 0.55 * s2 + bl * 1.0 + 0.03, am[1] * s2 * 1.2 + sc[1] * 0.55 * s2 + bl * 0.72 + 0.03, am[2] * s2 * 1.2 + sc[2] * 0.55 * s2 + bl * 0.42 + 0.03);
    this.uExposure.value = g.pipeline.finalU.uExposure.value;
    // animation
    const r = this.root;
    const kind = this.current ? this.current.userData.kind : 'arm';
    const sp = this.swingT;
    const sinP = Math.sin(sp * Math.PI), sqP = Math.sin(Math.sqrt(sp) * Math.PI);
    const wd = p.pwalkDist + (p.walkDist - p.pwalkDist) * alpha;
    const bob = (p.pbob + (p.bob - p.pbob) * alpha) * (g.settings.viewBob ? 1 : 0);
    const bx = Math.sin(wd * Math.PI * 0.6) * bob * 0.5, by = -Math.abs(Math.cos(wd * Math.PI * 0.6) * bob);
    r.position.set(0, 0, 0); r.rotation.set(0, 0, 0);
    const eq = this.equip;
    const c = this.current;
    if (!c) return;
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
    if (kind === 'arm') {
      r.position.set(0.52 - sqP * 0.3 + bx * 0.6, -0.55 + by * 0.6 - eq * 0.6 + Math.sin(Math.sqrt(sp) * Math.PI * 2) * 0.12, -0.65 - sinP * 0.25);
      r.rotation.set(-0.15 - sinP * 0.5, -0.45 + sqP * 0.4, -0.15 + sinP * 0.3);
      this.armMesh.rotation.set(-1.1, 0.2, 0.1);
    } else if (kind === 'block') {
      r.position.set(0.5 - sqP * 0.25 + bx * 0.6, -0.48 + by * 0.6 - eq * 0.6 + Math.sin(Math.sqrt(sp) * Math.PI * 2) * 0.1, -0.78 - sinP * 0.2);
      r.rotation.set(-sinP * 0.6, -sqP * 0.3, sinP * 0.2);
    } else {
      r.position.set(0.52 - sqP * 0.25 + bx * 0.6, -0.42 + by * 0.6 - eq * 0.6 + Math.sin(Math.sqrt(sp) * Math.PI * 2) * 0.1, -0.72 - sinP * 0.2);
      r.rotation.set(-sinP * 1.1, -sqP * 0.3, sinP * 0.3);
      if (c.userData.tool) { c.rotation.set(0, -Math.PI / 2 + 0.35, 0.65); c.position.set(0.05, 0.12, 0); }
      else { c.rotation.set(0, -0.5, 0.05); }
    }
    // repas
    if (p.using && p.using.eat) {
      const t = p.useTicks + alpha;
      r.position.set(0.22, -0.32 + Math.abs(Math.sin(t * 0.8)) * 0.03, -0.55);
      r.rotation.set(0.25, 0.45, 0.3);
    }
    if (p.using && p.using.bow) {
      const t = Math.min(1, (p.useTicks + alpha) / 20);
      r.position.set(0.28, -0.35, -0.6 + t * 0.12);
      r.rotation.set(0, 0.3, 0.1);
      c.rotation.set(0, -Math.PI / 2, -0.6);
      r.position.x += (Math.random() - 0.5) * 0.004 * t; r.position.y += (Math.random() - 0.5) * 0.004 * t;
    }
  }
}

import { tileIndex as tileIdx } from './textures.js';
