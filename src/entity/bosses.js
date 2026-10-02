// Boss : Dragon de l'Ender (combat complet avec cristaux), Wither, Warden
import * as THREE from 'three';
import { Entity, angleLerp } from './entity.js';
import { buildModel } from './mobmodels.js';
import { canSee } from './ai.js';
import { ITEM, ItemStack } from '../items/items.js';
import { BLOCK as K, BLOCKS, B_SOLID } from '../blocks/blocks.js';
import { HEIGHT } from '../constants.js';

// =========================================================== DRAGON DE L'ENDER
function dragonSpec() {
  const black = '#1a1a1e', dark = '#121215', scale = '#2a2a30';
  const scales = (T, x, y, w, h) => { for (let j = 0; j < h; j += 3) for (let i = (j / 3) % 2 ? 1 : 0; i < w; i += 3) T.px(x + i, y + j, '#34343c'); };
  const parts = [
    { name: 'body', pivot: [0, 0, 0], boxes: [
      { o: [-12, -12, -16], s: [24, 24, 64], c: black, f: { all: scales } },
      { o: [-1, 12, -10], s: [2, 6, 12], c: '#3a3a44' }, { o: [-1, 12, 10], s: [2, 6, 12], c: '#3a3a44' }, { o: [-1, 12, 30], s: [2, 6, 12], c: '#3a3a44' }] },
  ];
  // cou
  let prev = 'body';
  for (let i = 0; i < 5; i++) {
    const z = -16 - i * 10;
    parts.push({ name: 'neck' + i, parent: prev, pivot: [0, 2, z], boxes: [{ o: [-5, -3, z - 10], s: [10, 10, 10], c: scale, f: { all: scales } }, { o: [-1, 7, z - 8], s: [2, 4, 6], c: '#3a3a44' }] });
    prev = 'neck' + i;
  }
  parts.push({ name: 'head', parent: prev, pivot: [0, 2, -66], boxes: [
    { o: [-8, -6, -82], s: [16, 16, 16], c: black, f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, black, 0.1); T.glow(x + 2, y + 5, 4, 2, '#d070ff'); T.glow(x + 10, y + 5, 4, 2, '#d070ff'); }, right: scales, left: scales } },
    { o: [-6, -2, -98], s: [12, 5, 16], c: dark, f: { top: (T, x, y) => { T.rect(x + 2, y + 1, 2, 2, '#3a3a44'); T.rect(x + 8, y + 1, 2, 2, '#3a3a44'); } } },
    { o: [-5, 10, -76], s: [2, 4, 6], c: '#2a2a30' }, { o: [3, 10, -76], s: [2, 4, 6], c: '#2a2a30' }] });
  parts.push({ name: 'jaw', parent: 'head', pivot: [0, -3, -82], boxes: [{ o: [-6, -7, -98], s: [12, 4, 16], c: dark }] });
  // ailes
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    parts.push({ name: 'wing' + n, parent: 'body', pivot: [side * 12, 5, -10], boxes: [
      { o: side > 0 ? [12, 1, -14] : [-68, 1, -14], s: [56, 8, 8], c: scale },
      { o: side > 0 ? [12, 4, -6] : [-68, 4, -6], s: [56, 1, 56], c: '#26262c', alpha: 0.98, f: { top: (T, x, y, w, h) => { for (let i = 0; i < w; i += 8) T.fill(x + i, y, 1, h, '#3a3a44', 0.1); } } }] });
    parts.push({ name: 'wingTip' + n, parent: 'wing' + n, pivot: [side * 68, 5, -10], boxes: [
      { o: side > 0 ? [68, 3, -12] : [-124, 3, -12], s: [56, 4, 4], c: scale },
      { o: side > 0 ? [68, 4.5, -8] : [-124, 4.5, -8], s: [56, 1, 56], c: '#26262c', f: { top: (T, x, y, w, h) => { for (let i = 0; i < w; i += 8) T.fill(x + i, y, 1, h, '#3a3a44', 0.1); } } }] });
  }
  // pattes
  for (const [n, x, z, big] of [['legFR', 12, -6, 1], ['legFL', -12, -6, 1], ['legBR', 16, 34, 1.4], ['legBL', -16, 34, 1.4]]) {
    parts.push({ name: n, parent: 'body', pivot: [x, -8, z], boxes: [{ o: [x - 4 * big, -8 - 24 * big, z - 4 * big], s: [8 * big, 24 * big, 8 * big], c: scale }, { o: [x - 4 * big, -32 * big - 8, z - 10 * big], s: [8 * big, 4, 14 * big], c: dark }] });
  }
  // queue
  prev = 'body';
  for (let i = 0; i < 12; i++) {
    const z = 48 + i * 10;
    parts.push({ name: 'tail' + i, parent: prev, pivot: [0, 0, z], boxes: [{ o: [-5, -5, z], s: [10, 10, 10], c: scale, f: { all: scales } }, { o: [-1, 5, z + 2], s: [2, 4, 6], c: '#3a3a44' }] });
    prev = 'tail' + i;
  }
  return { seed: 666, parts };
}

class EnderDragon extends Entity {
  constructor(game) {
    super(game, 'ender_dragon');
    this.mobType = 'ender_dragon';
    this.maxHealth = this.health = 200;
    this.w = 8; this.h = 4; this.noGravity = true; this.fireImmune = true; this.hittable = true; this.knockbackResist = 1;
    this.fallImmune = true;
    const t = buildModel(dragonSpec(), { emissive: 1.0 });
    this.model = t.root; this.parts = t.parts; this.mat = t.mat;
    this.mat.uniforms.uEmissive.value = 1.5;
    this.model.scale.setScalar(1.2);
    for (const p of Object.values(this.parts)) p.userData.baseRot = p.rotation.clone();
    this.phase = 'circle'; this.phaseT = 0; this.circleA = 0;
    this.target = [0, 80, 0];
    this.hist = [];
    this.flap = 0;
    this.beam = null;
    this.persistent = true;
    this.speed = 0;
    this.hitCd = 0;
  }
  hitBoxes() {
    const ld = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const hx = this.x + ld[0] * 7, hz = this.z + ld[2] * 7;
    return [
      [this.x - 2, this.y - 1.5, this.z - 2, this.x + 2, this.y + 1.5, this.z + 2],
      [hx - 1.2, this.y - 1, hz - 1.2, hx + 1.2, this.y + 1.2, hz + 1.2],
      [this.x - 7, this.y - 0.3, this.z - 2, this.x + 7, this.y + 0.6, this.z + 2],
    ];
  }
  tick() {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; this.age++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invul > 0) this.invul--;
    if (this.hitCd > 0) this.hitCd--;
    const g = this.game, p = g.player;
    this.hist.unshift([this.y, this.yaw]);
    if (this.hist.length > 64) this.hist.pop();
    this.flap += this.phase === 'perch' ? 0.08 : 0.2;
    if (this.dead) { this.dyingTick(); return; }
    // soin par les cristaux
    let crystal = null, cd = 32 * 32;
    for (const e of g.entities.list) if (e.type === 'end_crystal' && !e.removed) { const d = e.dist2(this); if (d < cd) { cd = d; crystal = e; } }
    this.crystal = crystal;
    if (crystal && this.age % 10 === 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 1);
    this.phaseT++;
    switch (this.phase) {
      case 'circle': {
        this.circleA += 0.012;
        const r = 50;
        this.target = [Math.cos(this.circleA) * r, 78 + Math.sin(this.circleA * 3) * 10, Math.sin(this.circleA) * r];
        if (this.phaseT > 200 + Math.random() * 300) this.nextPhase();
        break;
      }
      case 'strafe': {
        this.target = [p.x, p.y + 12, p.z];
        const d = Math.hypot(p.x - this.x, p.z - this.z);
        if (d < 40 && this.phaseT % 60 === 30 && !p.dead) {
          const ld = [p.x - this.x, p.y - this.y, p.z - this.z], l = Math.hypot(...ld);
          g.shoot('dragon_fireball', this, this.x + ld[0] / l * 8, this.y, this.z + ld[2] / l * 8, ld.map((c) => c / l), 1.2);
          g.audio.play('dragon_shoot', this.x, this.y, this.z);
        }
        if (this.phaseT > 200) this.nextPhase();
        break;
      }
      case 'charge': {
        if (this.phaseT === 1) { this.chargeT = [p.x, p.y + 1, p.z]; g.audio.play('dragon_growl', this.x, this.y, this.z); }
        this.target = this.chargeT;
        if (Math.hypot(this.x - this.chargeT[0], this.y - this.chargeT[1], this.z - this.chargeT[2]) < 4 || this.phaseT > 120) { this.phase = 'circle'; this.phaseT = 0; }
        break;
      }
      case 'land': {
        const top = this.portalTop();
        this.target = [0, top + 4, 0];
        if (Math.hypot(this.x, this.z) < 3 && Math.abs(this.y - (top + 4)) < 2) { this.phase = 'perch'; this.phaseT = 0; g.audio.play('dragon_roar', this.x, this.y, this.z); }
        break;
      }
      case 'perch': {
        this.target = [0, this.portalTop() + 4, 0];
        // souffle de dragon devant lui
        if (this.phaseT % 30 === 0 && this.phaseT > 20 && this.phaseT < 160) {
          const ld = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
          g.spawnBreathCloud(this.x + ld[0] * 8, this.y - 3, this.z + ld[2] * 8);
          g.audio.play('dragon_breath', this.x, this.y, this.z);
        }
        // regarde le joueur
        this.yaw = angleLerp(this.yaw, Math.atan2(-(p.x - this.x), -(p.z - this.z)), 0.05);
        if (this.phaseT > 200) { this.phase = 'circle'; this.phaseT = 0; }
        break;
      }
    }
    // pilotage
    if (this.phase !== 'perch') {
      const dx = this.target[0] - this.x, dy = this.target[1] - this.y, dz = this.target[2] - this.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const want = Math.atan2(-dx, -dz);
      this.yaw = angleLerp(this.yaw, want, this.phase === 'charge' ? 0.12 : 0.06);
      const sp = this.phase === 'charge' ? 0.9 : 0.6;
      this.speed += (sp - this.speed) * 0.05;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.vx = fx * this.speed; this.vz = fz * this.speed;
      this.vy += (Math.max(-0.5, Math.min(0.5, dy / d * this.speed)) - this.vy) * 0.1;
    } else { this.vx *= 0.5; this.vz *= 0.5; this.vy = ((this.portalTop() + 4) - this.y) * 0.1; }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    // dégâts de contact et destruction de blocs
    if (!p.dead && this.hitCd === 0) {
      for (const b of this.hitBoxes()) {
        if (p.x > b[0] && p.x < b[3] && p.y + 1 > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5]) {
          p.damage(this.phase === 'charge' ? 10 : 5, { type: 'mob', attacker: this, knock: 1.5 }); p.vy += 0.6; this.hitCd = 20; break;
        }
      }
    }
    if (this.age % 5 === 0) this.destroyBlocks();
    g.bossBars.set('dragon', { name: 'Dragon de l\'Ender', frac: this.health / this.maxHealth, color: '#e07afa' });
    if (this.age % 120 === 0 && Math.random() < 0.4) g.audio.play('dragon_growl', this.x, this.y, this.z);
    if (this.age % 18 === 0) g.audio.play('dragon_flap', this.x, this.y, this.z, 0.6);
  }
  portalTop() { return this.game.dragonFight ? this.game.dragonFight.portalY : 64; }
  nextPhase() {
    const crystals = this.game.entities.list.filter((e) => e.type === 'end_crystal' && !e.removed).length;
    const r = Math.random();
    const landChance = crystals === 0 ? 0.4 : 0.15;
    this.phase = r < landChance ? 'land' : r < 0.6 ? 'strafe' : r < 0.8 ? 'charge' : 'circle';
    this.phaseT = 0;
  }
  destroyBlocks() {
    const w = this.game.world;
    for (const b of this.hitBoxes()) for (let x = Math.floor(b[0]); x <= b[3]; x++) for (let y = Math.floor(b[1]); y <= b[4]; y++) for (let z = Math.floor(b[2]); z <= b[5]; z++) {
      const id = w.getBlock(x, y, z);
      if (!id || id === K.obsidian || id === K.end_stone || id === K.bedrock || id === K.iron_bars || id === K.end_portal || id === K.end_portal_frame || BLOCKS[id].hardness < 0) continue;
      w.setBlock(x, y, z, 0);
    }
  }
  damage(amount, src) {
    if (this.dead) return false;
    if (src.type === 'explosion' && !src.crystal) return false;
    if (this.invul > 0) return false;
    // la tête prend tous les dégâts
    let head = false;
    if (src.attacker) {
      const ld = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
      const hx = this.x + ld[0] * 7, hz = this.z + ld[2] * 7;
      const a = src.projectile || src.attacker;
      head = Math.hypot(a.x - hx, a.z - hz) < Math.hypot(a.x - this.x, a.z - this.z);
    }
    const dmg = head ? amount : amount / 4 + 1;
    this.health -= dmg;
    this.hurtTime = 10; this.invul = 10;
    this.game.audio.play('dragon_hurt', this.x, this.y, this.z);
    if (this.phase === 'perch' && Math.random() < 0.3) { this.phase = 'circle'; this.phaseT = 0; }
    if (this.health <= 0) { this.health = 0; this.dead = true; this.deathTime = 0; this.game.audio.play('dragon_death', this.x, this.y, this.z); }
    return true;
  }
  knockback() {}
  dyingTick() {
    const g = this.game;
    this.deathTime++;
    this.y += 0.1;
    this.yaw += 0.02;
    if (this.deathTime % 5 === 0) for (let i = 0; i < 4; i++) g.particles.explosion(this.x + (Math.random() - 0.5) * 8, this.y + (Math.random() - 0.5) * 4, this.z + (Math.random() - 0.5) * 8, 1);
    if (this.deathTime % 10 === 0) g.spawnXP(this.x, this.y, this.z, 60);
    g.bossBars.set('dragon', { name: 'Dragon de l\'Ender', frac: 0, color: '#e07afa' });
    if (this.deathTime >= 200) {
      this.removed = true;
      g.bossBars.delete('dragon');
      if (g.dragonFight) g.dragonFight.onDragonDeath();
    }
  }
  render(alpha) {
    const x = this.px + (this.x - this.px) * alpha, y = this.py + (this.y - this.py) * alpha, z = this.pz + (this.z - this.pz) * alpha;
    const m = this.model, P = this.parts;
    m.position.set(x, y, z);
    m.rotation.set(-this.vy * 0.4, angleLerp(this.pyaw, this.yaw, alpha), 0);
    const f = this.flap + alpha * 0.2;
    const wing = Math.sin(f) * 0.6;
    P.wingR.rotation.z = -wing; P.wingL.rotation.z = wing;
    P.wingTipR.rotation.z = -Math.sin(f - 0.6) * 0.5 - 0.1; P.wingTipL.rotation.z = Math.sin(f - 0.6) * 0.5 + 0.1;
    if (this.phase === 'perch') { P.wingR.rotation.z = 0.5; P.wingL.rotation.z = -0.5; P.wingTipR.rotation.z = 1.2; P.wingTipL.rotation.z = -1.2; }
    // cou et queue ondulent selon l'historique
    const h = this.hist;
    for (let i = 0; i < 5; i++) {
      const n = P['neck' + i];
      const a = h[Math.min(h.length - 1, i * 2 + 2)] || [this.y, this.yaw];
      n.rotation.y = angleLerp(0, this.yaw - a[1], 1) * 0.5;
      n.rotation.x = Math.sin(f * 0.5 + i * 0.6) * 0.05 + (this.phase === 'perch' ? 0.12 : 0) - (a[0] - this.y) * 0.03;
    }
    P.jaw.rotation.x = this.phase === 'perch' && this.phaseT % 30 < 10 ? 0.6 : Math.max(0, Math.sin(f * 0.3)) * 0.15;
    for (let i = 0; i < 12; i++) {
      const tt = P['tail' + i];
      const a = h[Math.min(h.length - 1, 12 + i * 3)] || [this.y, this.yaw];
      tt.rotation.y = angleLerp(0, this.yaw - a[1], 1) * 0.25 + Math.sin(f * 0.4 + i * 0.5) * 0.06;
      tt.rotation.x = Math.sin(f * 0.3 + i * 0.4) * 0.05 + (a[0] - this.y) * 0.02;
    }
    for (const n of ['legFR', 'legFL', 'legBR', 'legBL']) P[n].rotation.x = this.phase === 'perch' ? 0 : 0.6;
    this.mat.uniforms.uSky.value = 0.6; this.mat.uniforms.uBlock.value = 0.3;
    this.mat.uniforms.uHurt.value = this.hurtTime > 0 ? 1 : 0;
    // rayon de soin
    const g = this.game;
    if (this.crystal && !this.dead) {
      if (!this.beam) {
        const mat = new THREE.LineBasicMaterial({ color: 0xff88ff });
        this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat);
        this.beam.frustumCulled = false;
        g.pipeline.entityScene.add(this.beam);
      }
      this.beam.visible = true;
      const pos = this.beam.geometry.attributes.position;
      pos.setXYZ(0, this.crystal.x, this.crystal.y + 0.5, this.crystal.z); pos.setXYZ(1, x, y, z); pos.needsUpdate = true;
    } else if (this.beam) this.beam.visible = false;
    if (this.dead && Math.random() < 0.5) g.particles.sparkle(x + (Math.random() - 0.5) * 10, y + Math.random() * 6, z + (Math.random() - 0.5) * 10, 1, 0.8, 1);
  }
  dispose() { if (this.beam) this.game.pipeline.entityScene.remove(this.beam); }
}

// Gestion du combat dans l'End
export class DragonFight {
  constructor(game) {
    this.game = game;
    game.dragonFight = this;
    this.portalY = 64;
    this.started = false;
    this.ticks = 0;
  }
  tick() {
    const g = this.game, w = g.world;
    this.ticks++;
    if (!this.started) {
      // attendre que l'île centrale soit chargée
      const c = w.getChunk(0, 0);
      if (!c || c.state < 3) return;
      this.started = true;
      // hauteur du portail de sortie
      for (let y = HEIGHT - 1; y > 0; y--) if (w.getBlock(0, y, 0) === K.bedrock) { this.portalY = y; break; }
      if (g.dragonKilled) { this.openExit(); return; }
      // cristaux sur les piliers
      for (const [px, py, pz] of this.pillarTops()) if (py > 0) g.spawnCrystal(px + 0.5, py + 1, pz + 0.5);
      const d = new EnderDragon(g);
      d.setPos(0, 100, 0);
      g.entities.add(d);
      this.dragon = d;
      g.ui.toast('Le Dragon de l\'Ender vous attend…');
    }
  }
  pillarTops() {
    const w = this.game.world, out = [];
    for (let i = 0; i < 10; i++) {
      const a = 2 * (-Math.PI + Math.PI / 10 * i);
      const x = Math.floor(42 * Math.cos(a)), z = Math.floor(42 * Math.sin(a));
      let top = -1;
      for (let y = HEIGHT - 1; y > 0; y--) if (w.getBlock(x, y, z) === K.bedrock) { top = y; break; }
      out.push([x, top, z]);
    }
    return out;
  }
  onDragonDeath() {
    const g = this.game;
    g.dragonKilled = true;
    if (g.meta) g.meta.dragonKilled = true;
    this.openExit();
    g.world.setBlock(0, this.portalY + 4, 0, K.dragon_egg);
    // portail d'accès
    const gx = 96, gz = 0, gy = 75;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
      const edge = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (edge === 0) g.world.setBlock(gx + dx, gy + dy, gz + dz, K.end_gateway);
      else if (Math.abs(dy) === 1 && edge === 1) g.world.setBlock(gx + dx, gy + dy, gz + dz, K.bedrock);
    }
    g.ui.toast('Le Dragon de l\'Ender est vaincu ! Le portail de sortie est ouvert.');
    g.ui.showTitle('Victoire !', 'Vous avez libéré l\'End');
  }
  openExit() {
    const w = this.game.world, y = this.portalY;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = dx * dx + dz * dz;
      if (d <= 6 && !(dx === 0 && dz === 0) && w.getBlock(dx, y + 1, dz) === 0) w.setBlock(dx, y + 1, dz, K.end_portal);
    }
  }
}

// ===================================================================== WITHER
function witherSpec() {
  const c = '#1c1c1e', bone = '#2a2a2d';
  const skull = (T, x, y, w, h) => { T.fill(x, y, w, h, c, 0.15); const s = w / 8; T.rect(x + 1 * s, y + 3 * s, 2 * s, 2 * s, '#050505'); T.rect(x + 5 * s, y + 3 * s, 2 * s, 2 * s, '#050505'); T.rect(x + 2 * s, y + 6 * s, 4 * s, Math.max(1, s), '#4a4a4f'); };
  return {
    seed: 777,
    parts: [
      { name: 'body', pivot: [0, 24, 0], boxes: [
        { o: [-10, 31, -1.5], s: [20, 3, 3], c: bone },
        { o: [-1.5, 15, -1.5], s: [3, 16, 3], c: bone },
        { o: [-6, 25, -1], s: [12, 2, 2], c: bone }, { o: [-6, 21, -1], s: [12, 2, 2], c: bone }, { o: [-6, 17, -1], s: [12, 2, 2], c: bone }] },
      { name: 'tail', parent: 'body', pivot: [0, 15, 0], rot: [0.4, 0, 0], boxes: [{ o: [-1.5, 3, -1.5], s: [3, 12, 3], c: bone }] },
      { name: 'head0', pivot: [0, 34, 0], boxes: [{ o: [-4, 34, -4], s: [8, 8, 8], c, f: { front: skull } }] },
      { name: 'head1', pivot: [-9, 33, 0], boxes: [{ o: [-12, 33, -3], s: [6, 6, 6], c, f: { front: skull } }] },
      { name: 'head2', pivot: [9, 33, 0], boxes: [{ o: [6, 33, -3], s: [6, 6, 6], c, f: { front: skull } }] },
    ],
  };
}

class Wither extends Entity {
  constructor(game) {
    super(game, 'wither');
    this.mobType = 'wither';
    this.maxHealth = 300; this.health = 1;
    this.w = 0.9; this.h = 3.5; this.noGravity = true; this.fireImmune = true; this.hittable = true; this.pushable = false;
    this.fallImmune = true; this.knockbackResist = 1;
    this.spawnT = 220;
    const t = buildModel(witherSpec(), { scale: 1 });
    this.model = t.root; this.parts = t.parts; this.mat = t.mat;
    this.model.scale.setScalar(1.6);
    for (const p of Object.values(this.parts)) p.userData.baseRot = p.rotation.clone();
    this.shootCd = 40; this.breakCd = 0; this.persistent = true;
    this.headTargets = [null, null, null];
    this.hostile = true;
  }
  get armored() { return this.health <= this.maxHealth / 2; }
  tick() {
    this.baseTick();
    const g = this.game, p = g.player;
    if (this.dead) {
      this.deathTime++;
      if (this.deathTime > 30) { this.removed = true; g.bossBars.delete('wither'); }
      return;
    }
    g.bossBars.set('wither', { name: 'Wither', frac: this.health / this.maxHealth, color: '#7a7aff' });
    if (this.spawnT > 0) {
      this.spawnT--;
      this.health = Math.min(this.maxHealth, this.maxHealth * (1 - this.spawnT / 220));
      this.invulnerable = true;
      if (this.spawnT === 0) {
        this.invulnerable = false;
        g.explode(this.x, this.y + 1.5, this.z, 7, { source: this, fire: false, force: true });
        g.audio.play('wither_spawn', this.x, this.y, this.z);
      }
      return;
    }
    // cible
    if (!this.target || this.target.dead || this.target.removed || (this.target === p && (p.creative || p.spectator))) {
      this.target = null;
      if (!p.dead && !p.creative && !p.spectator && this.dist2(p) < 64 * 64) this.target = p;
      else this.target = g.entities.list.find((e) => e.mobType && e !== this && !e.dead && !e.def?.undead && e.dist2(this) < 400) || null;
    }
    const t = this.target;
    // vol
    if (t) {
      const ty = this.armored ? t.y : t.y + 5;
      this.vy += ((ty - this.y) * 0.03 - this.vy) * 0.1;
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      if (d > 9) { this.vx += (dx / d * 0.4 - this.vx) * 0.05; this.vz += (dz / d * 0.4 - this.vz) * 0.05; }
      else { this.vx *= 0.9; this.vz *= 0.9; this.vx += -dz / d * 0.02; this.vz += dx / d * 0.02; }
      this.yaw = angleLerp(this.yaw, Math.atan2(-dx, -dz), 0.2);
    } else { this.vx *= 0.9; this.vz *= 0.9; this.vy *= 0.9; }
    this.applyMove();
    // tirs de crânes
    if (--this.shootCd <= 0 && t) {
      this.shootCd = this.armored ? 20 : 40;
      for (let h = 0; h < 3; h++) {
        const tgt = h === 0 ? t : (g.entities.list.find((e) => e.mobType && e !== this && !e.dead && e.dist2(this) < 400 && Math.random() < 0.3) || t);
        const hp = this.headPos(h);
        const ld = [tgt.x - hp[0], tgt.y + 1 - hp[1], tgt.z - hp[2]];
        const l = Math.hypot(...ld);
        const sk = g.shoot('wither_skull', this, hp[0], hp[1], hp[2], ld.map((c) => c / l), 0.9);
        sk.blue = Math.random() < 0.1;
        if (h > 0 && Math.random() < 0.5) break;
      }
      g.audio.play('wither_shoot', this.x, this.y, this.z);
    }
    // casse les blocs autour quand blessé
    if (this.breakCd > 0) {
      this.breakCd--;
      if (this.breakCd % 20 === 0) {
        const w = g.world;
        for (let x = Math.floor(this.x - 1); x <= Math.floor(this.x + 1); x++) for (let y = Math.floor(this.y); y <= Math.floor(this.y + 3); y++) for (let z = Math.floor(this.z - 1); z <= Math.floor(this.z + 1); z++) {
          const id = w.getBlock(x, y, z);
          if (id && BLOCKS[id].hardness >= 0 && BLOCKS[id].hardness < 50 && !BLOCKS[id].fluid) g.breakBlock(x, y, z, true);
        }
      }
    }
    if (this.age % 40 === 0 && this.health < this.maxHealth) this.health += 1;
    if (this.age % 80 === 0) g.audio.play('wither_ambient', this.x, this.y, this.z);
  }
  headPos(h) {
    const off = h === 0 ? 0 : h === 1 ? -0.9 : 0.9;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.x + c * off * 1.6, this.y + 3.0 * 1.0, this.z - s * off * 1.6];
  }
  damage(a, src) {
    if (this.spawnT > 0) return false;
    if (this.armored && (src.type === 'arrow')) return false;
    if (src.type === 'explosion' && src.attacker === this) return false;
    if (src.type === 'drown' || src.type === 'wither') return false;
    const r = super.damage(a, src);
    if (r) { this.breakCd = 60; this.game.audio.play('wither_hurt', this.x, this.y, this.z); }
    return r;
  }
  knockback() {}
  onDeath() {
    const g = this.game;
    g.audio.play('wither_death', this.x, this.y, this.z);
    g.dropItem(new ItemStack(ITEM.nether_star, 1), this.x, this.y + 1, this.z);
    g.spawnXP(this.x, this.y + 1, this.z, 50);
    g.explode(this.x, this.y + 1.5, this.z, 4, { source: this });
  }
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    const t = this.age + alpha;
    this.model.position.set(x, y + Math.sin(t * 0.1) * 0.1, z);
    this.model.rotation.set(0, this.yaw, 0);
    const P = this.parts;
    P.tail.rotation.x = 0.4 + Math.sin(t * 0.1) * 0.15;
    P.head1.rotation.y = Math.sin(t * 0.05) * 0.4; P.head2.rotation.y = -Math.sin(t * 0.06) * 0.4;
    const s = this.spawnT > 0 ? 1 + (220 - this.spawnT) / 220 * 0.3 : 1.6 / 1.6;
    this.model.scale.setScalar(1.6 * (this.spawnT > 0 ? 0.7 + 0.3 * (1 - this.spawnT / 220) : 1) * s / s);
    const U = this.mat.uniforms;
    U.uSky.value = 0.5; U.uBlock.value = 0.5;
    U.uHurt.value = this.hurtTime > 0 ? 1 : 0;
    U.uGlow.value = this.spawnT > 0 ? 0.6 + 0.4 * Math.sin(t * 0.5) : this.armored ? 0.35 + 0.15 * Math.sin(t * 0.3) : 0;
    U.uTintColor.value.set(this.spawnT > 0 || this.armored ? 0.6 : 1, this.spawnT > 0 || this.armored ? 0.7 : 1, 1.2);
    if (this.dead) this.model.rotation.z = Math.min(1, this.deathTime / 20) * Math.PI / 2;
  }
}

// ===================================================================== WARDEN
function wardenSpec() {
  const c = '#0f4649', dark = '#0a2e30';
  const skin = (T, x, y, w, h) => { for (let i = 0; i < w * h * 0.05; i++) T.px(x + Math.floor(T.rnd() * w), y + Math.floor(T.rnd() * h), '#17666a'); };
  return {
    seed: 888,
    parts: [
      { name: 'body', pivot: [0, 21, 0], boxes: [{ o: [-9, 21, -5], s: [18, 21, 11], c, f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, c, 0.15); skin(T, x, y, w, h); T.rect(x + 3, y + 4, w - 6, 9, '#06191a'); T.glow(x + 5, y + 6, 3, 2, '#39d6e0'); T.glow(x + 10, y + 7, 3, 3, '#39d6e0'); T.glow(x + 7, y + 10, 4, 2, '#5ef2ff'); }, all: skin } }] },
      { name: 'head', parent: 'body', pivot: [0, 42, 0], boxes: [{ o: [-8, 42, -5], s: [16, 16, 10], c, f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, c, 0.15); T.rect(x + 3, y + 9, 10, 4, dark); T.rect(x + 4, y + 10, 8, 1, '#c8f0f0'); }, all: skin } }] },
      { name: 'tendrilR', parent: 'head', pivot: [8, 55, 0], boxes: [{ o: [8, 50, -0.5], s: [16, 16, 1], c: '#0a3a3c', f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, '#0a3a3c'); T.glow(x + 3, y + 5, 6, 3, '#39d6e0'); } } }] },
      { name: 'tendrilL', parent: 'head', pivot: [-8, 55, 0], boxes: [{ o: [-24, 50, -0.5], s: [16, 16, 1], c: '#0a3a3c', f: { front: (T, x, y, w, h) => { T.fill(x, y, w, h, '#0a3a3c'); T.glow(x + 7, y + 5, 6, 3, '#39d6e0'); } } }] },
      { name: 'rightArm', pivot: [13, 40, 0], boxes: [{ o: [9, 12, -4], s: [8, 28, 8], c, f: { all: skin } }] },
      { name: 'leftArm', pivot: [-13, 40, 0], boxes: [{ o: [-17, 12, -4], s: [8, 28, 8], c, f: { all: skin } }] },
      { name: 'rightLeg', pivot: [6, 21, 0], boxes: [{ o: [3, 0, -3], s: [6, 21, 6], c: dark }] },
      { name: 'leftLeg', pivot: [-6, 21, 0], boxes: [{ o: [-9, 0, -3], s: [6, 21, 6], c: dark }] },
    ],
  };
}

class Warden extends Entity {
  constructor(game, opts) {
    super(game, 'warden');
    this.mobType = 'warden';
    this.maxHealth = this.health = 500;
    this.w = 0.9; this.h = 2.9; this.eyeHeight = 2.5; this.hittable = true; this.pushable = true; this.mass = 20; this.knockbackResist = 1;
    this.hostile = true; this.persistent = true;
    const t = buildModel(wardenSpec(), { emissive: 1 });
    this.model = t.root; this.parts = t.parts; this.mat = t.mat;
    this.mat.uniforms.uEmissive.value = 2;
    for (const p of Object.values(this.parts)) p.userData.baseRot = p.rotation.clone();
    this.anger = new Map();
    this.emerge = opts.emerging ? 134 : 0;
    this.sonicCd = 0; this.charge = 0; this.attackCd = 0; this.sniffT = 120; this.idle = 0;
    this.investigate = null;
    this.yaw = Math.random() * Math.PI * 2;
    this.stepHeight = 1;
    game.audio.play('warden_emerge', 0, 0, 0);
  }
  onVibration(x, y, z, s, src) {
    if (this.emerge > 0 || this.dead) return;
    if (Math.hypot(x - this.x, y - this.y, z - this.z) > 16) return;
    this.investigate = [x, y, z];
    this.idle = 0;
    if (src && src.hittable !== false && src !== this) this.anger.set(src, Math.min(150, (this.anger.get(src) || 0) + (src.type === 'player' ? 35 : 10) * s));
    if (Math.random() < 0.3) this.game.audio.play('warden_listen', this.x, this.y, this.z);
  }
  tick() {
    this.baseTick();
    const g = this.game, p = g.player;
    if (this.dead) { this.deathTime++; if (this.deathTime > 40) { this.removed = true; g.bossBars.delete('warden'); } return; }
    g.bossBars.set('warden', { name: 'Warden', frac: this.health / this.maxHealth, color: '#39d6e0' });
    if (this.emerge > 0) { this.emerge--; if (this.age % 4 === 0) g.particles.blockBreak(Math.floor(this.x), Math.floor(this.y - 1), Math.floor(this.z), K.sculk); return; }
    // ténèbres
    if (this.age % 120 === 0 && this.dist2(p) < 400) p.addEffect('darkness', 260, 0);
    // battement de cœur
    let maxA = 0, tgt = null;
    for (const [e, a] of this.anger) { if (e.dead || e.removed) { this.anger.delete(e); continue; } if (a > maxA) { maxA = a; tgt = e; } }
    const hb = Math.max(10, 40 - maxA / 4);
    if (this.age % Math.floor(hb) === 0) g.audio.play('warden_heartbeat', this.x, this.y, this.z);
    // reniflement
    if (--this.sniffT <= 0) {
      this.sniffT = 120;
      if (this.dist2(p) < 24 * 24 && !p.creative && !p.spectator && !p.dead) { this.anger.set(p, Math.min(150, (this.anger.get(p) || 0) + 20)); g.audio.play('warden_sniff', this.x, this.y, this.z); }
    }
    for (const [e, a] of this.anger) this.anger.set(e, Math.max(0, a - 0.05));
    this.fwd = 0; let jump = false;
    if (this.attackCd > 0) this.attackCd--;
    if (this.sonicCd > 0) this.sonicCd--;
    if (tgt && maxA >= 80 && !(tgt === p && (p.creative || p.spectator))) {
      this.idle = 0;
      const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz);
      this.yaw = angleLerp(this.yaw, Math.atan2(-dx, -dz), 0.25);
      if (this.charge > 0) {
        this.charge--;
        if (this.charge === 0) {
          // explosion sonique : ignore l'armure
          const ld = [tgt.x - this.x, tgt.y + 1 - (this.y + 1.8), tgt.z - this.z], l = Math.hypot(...ld);
          g.particles.sonicRing(this.x, this.y + 1.8, this.z, ld[0] / l, ld[1] / l, ld[2] / l);
          g.audio.play('sonic_boom', this.x, this.y, this.z);
          tgt.damage(10, { type: 'sonic', attacker: this });
          tgt.vx += ld[0] / l * 2.5; tgt.vy += 0.5; tgt.vz += ld[2] / l * 2.5;
          this.sonicCd = 60;
        }
      } else if (d < 2.4 && Math.abs(tgt.y - this.y) < 3) {
        if (this.attackCd === 0) { this.attackCd = 18; this.swing = 0; tgt.damage(30, { type: 'mob', attacker: this, knock: 1.2 }); g.audio.play('warden_attack', this.x, this.y, this.z); }
      } else {
        this.fwd = 1;
        if (d > 5 && d < 15 && this.sonicCd === 0 && canSee(g.world, this.x, this.y + 2, this.z, tgt.x, tgt.y + 1, tgt.z) && Math.random() < 0.05) {
          this.charge = 34; this.fwd = 0; g.audio.play('sonic_charge', this.x, this.y, this.z);
        }
      }
      if (this.hcol && this.onGround) jump = true;
    } else if (this.investigate) {
      const [ix, , iz] = this.investigate;
      const dx = ix - this.x, dz = iz - this.z, d = Math.hypot(dx, dz);
      if (d < 1.5) this.investigate = null;
      else { this.yaw = angleLerp(this.yaw, Math.atan2(-dx, -dz), 0.2); this.fwd = 0.6; if (this.hcol && this.onGround) jump = true; }
    } else {
      this.idle++;
      if (this.idle > 1200) { this.removed = true; g.bossBars.delete('warden'); g.ui.toast('Le Warden s\'est enfoncé dans le sol…'); return; }
    }
    if (jump) this.vy = 0.5;
    this.travel(0, this.fwd, 0.3 * 0.4, jump);
    this.bodyYaw = angleLerp(this.bodyYaw, this.yaw, 0.3);
    this.updateLimbs();
    if (this.swing !== undefined) this.swing++;
  }
  damage(a, src) {
    if (this.emerge > 0) return false;
    if (src.attacker && src.attacker !== this) this.anger.set(src.attacker, 150);
    const r = super.damage(a, src);
    if (r) this.game.audio.play('warden_hurt', this.x, this.y, this.z);
    return r;
  }
  onDeath() {
    const g = this.game;
    g.dropItem(new ItemStack(ITEM.sculk_catalyst, 1), this.x, this.y + 1, this.z);
    g.spawnXP(this.x, this.y + 1, this.z, 5);
    g.audio.play('warden_death', this.x, this.y, this.z);
  }
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    const m = this.model, P = this.parts;
    const em = this.emerge > 0 ? -2.9 * (this.emerge / 134) : 0;
    m.position.set(x, y + em, z);
    m.rotation.set(0, angleLerp(this.pbodyYaw, this.bodyYaw, alpha), 0);
    for (const q of Object.values(P)) if (q.userData.baseRot) q.rotation.copy(q.userData.baseRot);
    const t = this.age + alpha;
    const sw = Math.cos(this.limbSwing * 0.45) * 1.0 * this.limbAmp;
    P.rightLeg.rotation.x = sw; P.leftLeg.rotation.x = -sw;
    P.rightArm.rotation.x = -sw * 0.8; P.leftArm.rotation.x = sw * 0.8;
    if (this.swing !== undefined && this.swing < 8) { const s = Math.sin(this.swing / 8 * Math.PI); P.rightArm.rotation.x -= s * 1.6; P.leftArm.rotation.x -= s * 1.6; }
    if (this.charge > 0) { P.head.rotation.x = -0.4; P.rightArm.rotation.x = -0.3; P.leftArm.rotation.x = -0.3; }
    const vib = Math.sin(t * (this.anger.size ? 1.2 : 0.4)) * 0.25;
    P.tendrilR.rotation.z = -0.3 + vib; P.tendrilL.rotation.z = 0.3 - vib;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.25);
    this.mat.uniforms.uEmissive.value = 1 + pulse * 2;
    const l = this.game.world.getLight(Math.floor(x), Math.floor(y + 2), Math.floor(z));
    this.mat.uniforms.uSky.value = (l >> 4) / 15; this.mat.uniforms.uBlock.value = (l & 15) / 15;
    this.mat.uniforms.uHurt.value = this.hurtTime > 0 ? 1 : 0;
    if (this.dead) m.rotation.z = Math.min(1, this.deathTime / 20) * Math.PI / 2;
  }
}

export function createBoss(game, type, opts) {
  if (type === 'wither') return new Wither(game);
  if (type === 'warden') return new Warden(game, opts);
  if (type === 'ender_dragon') return new EnderDragon(game);
  return null;
}
export { EnderDragon, Wither, Warden, B_SOLID };
