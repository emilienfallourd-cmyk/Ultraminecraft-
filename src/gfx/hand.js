// Main / objet tenu en vue à la première personne.
// Les positions, angles et animations (frappe, équipement, repas, arc, balancement)
// reprennent les transformations de Minecraft (ItemInHandRenderer + modèles d'objets).
import * as THREE from 'three';
import { ITEMS } from '../items/items.js';
import { BLOCKS } from '../blocks/blocks.js';
import { blockGeometry } from '../entity/models.js';
import { itemSpritePixels, tileSpriteCanvas } from './icons.js';
import { buildModel, MODELS } from '../entity/mobmodels.js';

const DEG = Math.PI / 180;
// point d'appui de la main (espace vue) et poses de repos des objets autour de ce point
const PIVOT = [0.56, -0.48, -0.72];
const DISPLAY_ITEM = { t: [-0.1, 0.25, 0], r: [0, 125, 5], s: 0.44 };
const DISPLAY_BLOCK = { t: [-0.1, 0.27, 0], r: [8, 45, 0], s: 0.25 };
const DISPLAY_BOW = { t: [-0.18, 0.28, 0.05], r: [0, 95, -40], s: 0.48 };
// objets brillants (métal, gemmes) : léger reflet spéculaire
const SHINY = /(diamond|iron|gold|netherite|emerald|chainmail|shears|compass|clock|bucket|trident|spyglass|amethyst|prismarine|nether_star|ender_pearl|ender_eye|totem)/;
const FLAT_MODELS = ['torch', 'ladder', 'vine', 'crop', 'door', 'rail', 'lever', 'pane', 'bars', 'carpet'];

const TONE = /* glsl */`
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;
const VS = /* glsl */`
attribute float aTile;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos; flat varying float vTile;
void main(){
  vUv = uv; vTile = aTile;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
// éclairage commun : deux lumières fixes façon Minecraft (lisibilité de la forme),
// modulées par la lumière du lieu, + soleil réel en espace vue et reflet spéculaire
const LIGHT = /* glsl */`
uniform vec3 uAmb; uniform vec3 uSun; uniform vec3 uSunV; uniform float uShine; uniform float uEmit; uniform float uExposure;
vec3 lightItem(vec3 albedo, vec3 N){
  vec3 L0 = normalize(vec3(-0.35, 0.85, 0.55)), L1 = normalize(vec3(0.55, 0.35, -0.45));
  float mc = 0.42 + 0.48 * max(dot(N, L0), 0.0) + 0.18 * max(dot(N, L1), 0.0);
  float sd = max(dot(N, uSunV), 0.0);
  vec3 V = normalize(-vPos);
  vec3 H = normalize(uSunV + V);
  vec3 H0 = normalize(L0 + V);
  float sp = pow(max(dot(N, H), 0.0), 48.0) * uShine;
  float sp0 = pow(max(dot(N, H0), 0.0), 32.0) * uShine;
  vec3 c = albedo * (uAmb * mc + uSun * sd * 0.75);
  c += (uSun * sp * 1.2 + uAmb * sp0 * 0.9) * mix(vec3(1.0), albedo * 1.5, 0.35);
  c += albedo * uEmit * 2.2;
  return c;
}`;
const FS_MAP = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos; flat varying float vTile;
${TONE}
${LIGHT}
void main(){
  vec4 a = texture(uMap, vUv);
  if (a.a < 0.4) discard;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 alb = a.rgb;
  gl_FragColor = vec4(toSRGB(aces(lightItem(alb, N) * uExposure)), 1.0);
}`;
const FS_ARRAY = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo; uniform vec3 uTint;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos; flat varying float vTile;
${TONE}
${LIGHT}
void main(){
  vec4 a = texture(uAlbedo, vec3(vUv, vTile));
  float ar = textureLod(uAlbedo, vec3(vUv, vTile), 0.0).a;
  if (ar < 0.4) discard;
  float tm = (ar > 0.5 && ar < 0.75) ? 1.0 : 0.0;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 alb = a.rgb * mix(vec3(1.0), uTint, tm);
  gl_FragColor = vec4(toSRGB(aces(lightItem(alb, N) * uExposure)), 1.0);
}`;

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3();
// orientation du bras au repos : l'épaule hors champ en bas à droite, le poing vers le centre
const ARM_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.5, -0.62, 0.6).normalize());

export class Hand {
  constructor(game) {
    this.game = game;
    const P = game.pipeline;
    this.scene = P.handScene;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root);
    this.U = {
      uAmb: { value: new THREE.Vector3(0.5, 0.5, 0.5) }, uSun: { value: new THREE.Vector3() }, uSunV: { value: new THREE.Vector3(0, 1, 0) },
      uExposure: { value: 1 },
    };
    this.arrayMat = this.material(FS_ARRAY, { uAlbedo: P.U.uAlbedo, uTint: { value: new THREE.Vector3(1, 1, 1) } });
    this.swingT = 1;
    this.equip = 0;
    this.heldId = null;
    this.pendingId = undefined;
    this.current = null;
    this.swayP = null; this.swayY = 0;
    this.armMesh = this.makeArm();
  }

  material(fs, extra, shine = 0, emit = 0) {
    return new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: fs, side: THREE.DoubleSide,
      uniforms: { ...this.U, uShine: { value: shine }, uEmit: { value: emit }, ...extra },
    });
  }
  mapMat(tex, shine = 0, emit = 0) { return this.material(FS_MAP, { uMap: { value: tex } }, shine, emit); }

  // bras droit du joueur : origine au poing, axe +Y vers l'épaule, en blocs
  makeArm() {
    const m = buildModel(MODELS.player());
    const geo = m.parts.rightArm.children[0].geometry.clone();
    geo.translate(-1, 10, 0);
    geo.scale(1 / 16, 1 / 16, 1 / 16);
    return new THREE.Mesh(geo, this.mapMat(m.tex));
  }

  swing() { if (this.swingT > 0.5) this.swingT = 0; }

  build(id) {
    if (this.current) {
      this.root.remove(this.current);
      this.current.traverse((o) => { if (o.isMesh && o !== this.armMesh) { if (o.material !== this.arrayMat) { o.material.uniforms.uMap?.value?.dispose(); o.material.dispose(); } if (o.userData.ownGeo) o.geometry.dispose(); } });
    }
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.userData.kind = 'arm';
    if (id >= 0) {
      const def = ITEMS[id];
      const b = def.isBlock ? BLOCKS[def.block] : null;
      const shine = SHINY.test(def.key || '') ? 1 : 0;
      if (b && b.shape !== 'cross' && !FLAT_MODELS.includes(b.model)) {
        const mesh = new THREE.Mesh(blockGeometry(def.block), this.arrayMat);
        this.arrayMat.uniforms.uTint.value.set(...(b.tint === 3 ? [0.25, 0.45, 0.9] : b.tint ? [0.3, 0.62, 0.18] : [1, 1, 1]));
        this.arrayMat.uniforms.uEmit.value = b.lightEmit ? 0.5 : 0;
        g.add(mesh);
        g.userData.kind = 'block';
      } else {
        let px, n, tex;
        if (b) {
          // objet plat tiré de la tuile du bloc (fleurs, torches, rails…)
          const name = b.key === 'oak_door' ? 'oak_door_bottom' : b.tex[0];
          const c = tileSpriteCanvas(name, b.tint);
          n = c.width;
          const d = c.getContext('2d').getImageData(0, 0, n, n).data;
          px = new Array(n * n);
          for (let i = 0; i < n * n; i++) px[i] = d[i * 4 + 3] > 100;
          tex = new THREE.CanvasTexture(c);
        } else {
          const sp = itemSpritePixels(id);
          n = 16;
          const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
          const ctx = canvas.getContext('2d');
          px = new Array(256);
          for (let i = 0; i < 256; i++) { px[i] = !!sp[i]; if (sp[i]) { ctx.fillStyle = sp[i]; ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1); } }
          tex = new THREE.CanvasTexture(canvas);
        }
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
        const mesh = this.extrude(px, n, this.mapMat(tex, shine, b && b.lightEmit ? 0.8 : 0));
        mesh.userData.ownGeo = true;
        g.add(mesh);
        g.userData.kind = 'item';
      }
      g.userData.bow = def.key === 'bow' || def.key === 'crossbow';
    }
    if (g.userData.kind === 'arm') g.add(this.armMesh);
    for (const c of g.children) c.matrixAutoUpdate = false;
    this.current = g;
    this.root.add(g);
  }

  // sprite extrudé en relief (comme les objets de Minecraft), centré à l'origine, de côté 1
  extrude(px, n, mat) {
    const T = 1 / n, depth = 1 / 16;
    const pos = [], nor = [], uv = [], idx = [];
    const quad = (a, b, c, d, nn, u0, v0, u1, v1) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) nor.push(...nn);
      uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const z0 = -0.5 * depth, z1 = 0.5 * depth;
    quad([-0.5, -0.5, z1], [0.5, -0.5, z1], [0.5, 0.5, z1], [-0.5, 0.5, z1], [0, 0, 1], 0, 0, 1, 1);
    quad([0.5, -0.5, z0], [-0.5, -0.5, z0], [-0.5, 0.5, z0], [0.5, 0.5, z0], [0, 0, -1], 1, 0, 0, 1);
    const has = (x, y) => x >= 0 && x < n && y >= 0 && y < n && !!px[y * n + x];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!has(x, y)) continue;
      const X0 = -0.5 + x * T, X1 = X0 + T, Y1 = 0.5 - y * T, Y0 = Y1 - T;
      const u0 = (x + 0.25) / n, u1 = (x + 0.75) / n, v0 = (y + 0.25) / n, v1 = (y + 0.75) / n;
      if (!has(x, y - 1)) quad([X0, Y1, z1], [X1, Y1, z1], [X1, Y1, z0], [X0, Y1, z0], [0, 1, 0], u0, v0, u1, v1);
      if (!has(x, y + 1)) quad([X0, Y0, z0], [X1, Y0, z0], [X1, Y0, z1], [X0, Y0, z1], [0, -1, 0], u0, v0, u1, v1);
      if (!has(x - 1, y)) quad([X0, Y0, z0], [X0, Y0, z1], [X0, Y1, z1], [X0, Y1, z0], [-1, 0, 0], u0, v0, u1, v1);
      if (!has(x + 1, y)) quad([X1, Y0, z1], [X1, Y0, z0], [X1, Y1, z0], [X1, Y1, z1], [1, 0, 0], u0, v0, u1, v1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return new THREE.Mesh(geo, mat);
  }

  update(dt, alpha) {
    const g = this.game, p = g.player;
    if (!p) return;
    const held = p.held;
    const id = held ? held.id : -1;
    // changement d'objet : la main descend, l'objet change, puis remonte
    if (this.current === null) { this.heldId = id; this.build(id); }
    else if (id !== this.heldId) this.pendingId = id;
    if (this.pendingId !== undefined) {
      this.equip = Math.min(1, this.equip + dt * 8);
      if (this.equip >= 1) { this.heldId = this.pendingId; this.pendingId = undefined; this.build(this.heldId); }
    } else this.equip = Math.max(0, this.equip - dt * 8);
    this.swingT = Math.min(1, this.swingT + dt * 3.33);
    this.updateLight();
    if (!this.current) return;

    // ----- pile de transformations (espace vue : +X droite, +Y haut, -Z devant)
    const M = new THREE.Matrix4();
    const T = (x, y, z) => M.multiply(_m.makeTranslation(x, y, z));
    const RX = (d) => M.multiply(_m.makeRotationX(d * DEG));
    const RY = (d) => M.multiply(_m.makeRotationY(d * DEG));
    const RZ = (d) => M.multiply(_m.makeRotationZ(d * DEG));
    const S = (x, y, z) => M.multiply(_m.makeScale(x, y, z));
    // balancement de la vue en marchant
    if (g.settings.viewBob && !p.flying) {
      const wd = p.pwalkDist + (p.walkDist - p.pwalkDist) * alpha;
      const bob = p.pbob + (p.bob - p.pbob) * alpha;
      const ph = wd * Math.PI * 0.6;
      T(Math.sin(ph) * bob * 0.5, -Math.abs(Math.cos(ph) * bob), 0);
      RZ(Math.sin(ph) * bob * 3);
      RX(Math.abs(Math.cos(ph - 0.2) * bob) * 5);
    }
    // inertie quand on tourne la tête
    if (this.swayP === null) { this.swayP = p.pitch; this.swayY = p.yaw; }
    const k = 1 - Math.pow(0.5, dt * 20);
    this.swayP += (p.pitch - this.swayP) * k;
    let dy = p.yaw - this.swayY; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.swayY = p.yaw - dy * (1 - k);
    M.multiply(_m.makeRotationX(-(p.pitch - this.swayP) * 0.1));
    M.multiply(_m.makeRotationY(-dy * (1 - k) * 0.1));

    const sp = this.swingT, s1 = Math.sqrt(sp), eq = this.equip;
    const kind = this.current.userData.kind;
    const use = p.using;
    const armT = () => T(PIVOT[0], PIVOT[1] - eq * 0.6, PIVOT[2]);
    const display = (D) => {
      T(D.t[0], D.t[1], D.t[2]);
      M.multiply(_m.makeRotationFromEuler(_e.set(D.r[0] * DEG, D.r[1] * DEG, D.r[2] * DEG, 'XYZ')));
      S(D.s, D.s, D.s);
    };
    if (kind === 'arm') {
      // coup de poing : le bras avance vers le centre puis revient
      const f1 = Math.sin(s1 * Math.PI), f = Math.sin(sp * sp * Math.PI);
      T(0.36 - 0.2 * f1, -0.24 + 0.12 * Math.sin(s1 * Math.PI * 2) - eq * 0.6, -0.58 - 0.22 * Math.sin(sp * Math.PI));
      RX(-f * 18); RY(f1 * 12);
      M.multiply(_m.makeRotationFromQuaternion(ARM_Q));
      RY(-35);
    } else if (use && use.eat) {
      const dur = use.ticks || 32;
      const f = Math.max(0, dur - (p.useTicks + alpha)) + 1;
      const f1 = f / dur;
      if (f1 < 0.8) T(0, Math.abs(Math.cos(f / 4 * Math.PI) * 0.1), 0);
      const f3 = 1 - Math.pow(Math.min(1, f1), 27);
      T(f3 * 0.6, f3 * -0.5, 0);
      RY(f3 * 90); RX(f3 * 10); RZ(f3 * 30);
      armT();
      display(kind === 'block' ? DISPLAY_BLOCK : DISPLAY_ITEM);
    } else if (use && use.bow && this.current.userData.bow) {
      armT();
      T(-0.2785682, 0.18344387, 0.15731531);
      RX(-13.935); RY(35.3); RZ(-9.785);
      const f8 = p.useTicks + alpha;
      let f12 = f8 / 20; f12 = Math.min(1, (f12 * f12 + f12 * 2) / 3);
      if (f12 > 0.1) T(0, Math.sin((f8 - 0.1) * 1.3) * (f12 - 0.1) * 0.004, 0);
      T(0, 0, f12 * 0.04);
      S(1, 1, 1 + f12 * 0.2);
      RY(-45);
      display(DISPLAY_BOW);
    } else {
      T(-0.4 * Math.sin(s1 * Math.PI), 0.2 * Math.sin(s1 * Math.PI * 2), -0.2 * Math.sin(sp * Math.PI));
      armT();
      const f = Math.sin(sp * sp * Math.PI), f1 = Math.sin(s1 * Math.PI);
      RY(45 + f * -20); RZ(f1 * -20); RX(f1 * -80); RY(-45);
      display(kind === 'block' ? DISPLAY_BLOCK : DISPLAY_ITEM);
    }
    this.root.matrix.copy(M);
    this.root.matrixWorldNeedsUpdate = true;
    const c = this.current;
    c.matrix.identity();
    for (const ch of c.children) ch.matrix.identity();
  }

  // lumière au niveau des yeux : ciel (soleil + ambiance) et blocs (torches)
  updateLight() {
    const g = this.game, p = g.player, e = g.env, U = this.U;
    const l = g.world.getLight(Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z));
    const sky = (l >> 4) / 15, blk = (l & 15) / 15;
    const sc = e.sunColor || [1, 1, 1], am = e.ambient || [0.3, 0.3, 0.3];
    const s2 = sky * sky;
    const bl = blk * blk * 1.6 + blk * 0.25;
    const bc = [1.0, 0.72, 0.42];
    const water = p.eyeInWater ? [0.55, 0.8, 0.9] : [1, 1, 1];
    U.uAmb.value.set(
      (am[0] * s2 * 1.5 + bl * bc[0] + 0.05) * water[0],
      (am[1] * s2 * 1.5 + bl * bc[1] + 0.05) * water[1],
      (am[2] * s2 * 1.5 + bl * bc[2] + 0.06) * water[2]);
    const sunVis = sky >= 0.99 ? 1 : 0;
    U.uSun.value.set(sc[0] * sunVis * 0.6 * water[0], sc[1] * sunVis * 0.6 * water[1], sc[2] * sunVis * 0.6 * water[2]);
    const ld = e.lightDir || [0.3, 1, 0.2];
    _v.set(ld[0], ld[1], ld[2]).normalize().transformDirection(g.pipeline.camera.matrixWorldInverse);
    U.uSunV.value.copy(_v);
    U.uExposure.value = g.pipeline.finalU.uExposure.value;
  }
}
