// Entités-objets : objets au sol, orbes d'XP, blocs qui tombent, TNT, projectiles, cristaux, éclairs
import * as THREE from 'three';
import { Entity } from './entity.js';
import { ITEMS, ITEM, ItemStack } from '../items/items.js';
import { BLOCKS, BLOCK as K, B_SOLID, getSelectionBoxes } from '../blocks/blocks.js';
import { itemMesh, blockGeometry, blockItemMaterial, entityMaterial, applyLight, spriteMesh } from './models.js';
import { raycast, rayBox } from './physics.js';

function lightAt(game, x, y, z) {
  const l = game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
  return [(l >> 4) / 15, (l & 15) / 15];
}

// ----------------------------------------------------------------- OBJET AU SOL
export class ItemEntity extends Entity {
  constructor(game, stack, x, y, z) {
    super(game, 'item');
    this.stack = stack;
    this.w = 0.25; this.h = 0.25; this.stepHeight = 0;
    this.setPos(x, y, z);
    this.pickupDelay = 10;
    this.spin = Math.random() * Math.PI * 2;
    this.fireImmune = stack.id === ITEM.netherite_ingot || stack.id === ITEM.nether_star || (ITEMS[stack.id].key || '').startsWith('netherite');
    this.health = 5;
    const g = new THREE.Group();
    const m = itemMesh(stack.id);
    const isBlock = ITEMS[stack.id].isBlock && BLOCKS[ITEMS[stack.id].block].shape !== 'cross';
    m.scale.setScalar(isBlock ? 0.25 : 0.4);
    g.add(m);
    if (stack.count > 1) { const m2 = m.clone(); m2.position.set(0.06, 0.04, 0.05); g.add(m2); }
    g.traverse((o) => o.layers.enable(1));
    this.model = g;
    this.inner = m;
  }
  tick() {
    this.baseTick();
    if (this.pickupDelay > 0) this.pickupDelay--;
    if (this.inLava && !this.fireImmune) { this.removed = true; this.game.particles && this.game.particles.smoke(this.x, this.y, this.z, 1); this.game.audio && this.game.audio.play('fizz', this.x, this.y, this.z); return; }
    if (this.inWater) { this.vy += 0.005; this.vx *= 0.99; this.vz *= 0.99; }
    this.vy -= 0.04;
    this.applyMove();
    const f = this.onGround ? 0.6 * 0.98 : 0.98;
    this.vx *= f; this.vy *= 0.98; this.vz *= f;
    if (this.onGround) this.vy *= -0.5;
    // fusion des piles
    if (this.age % 20 === 0) {
      for (const o of this.game.entities.near(this.x, this.y, this.z, 1)) {
        if (o !== this && o.type === 'item' && !o.removed && o.stack.canStack(this.stack) && o.stack.count + this.stack.count <= ITEMS[this.stack.id].stack) {
          this.stack.count += o.stack.count; o.removed = true;
        }
      }
    }
    if (this.age > 6000) this.removed = true;
    // ramassage
    const p = this.game.player;
    if (!p.dead && !p.spectator && this.pickupDelay <= 0) {
      const dx = p.x - this.x, dy = (p.y + 0.6) - this.y, dz = p.z - this.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1.6) {
        const before = this.stack.count;
        const left = p.addItem(this.stack.clone());
        if (left < before) {
          this.game.audio && this.game.audio.play('pickup', this.x, this.y, this.z);
          this.game.onPickup && this.game.onPickup(this, before - left);
          this.stack.count = left;
          if (left <= 0) { this.removed = true; this.pickedBy = p; }
        }
      } else if (d2 < 4) {
        this.vx += dx * 0.01; this.vz += dz * 0.01;
      }
    }
  }
  render(alpha, t) {
    const [x, y, z] = this.lerp(alpha);
    const bob = Math.sin((this.age + alpha) * 0.1 + this.spin) * 0.06 + 0.12;
    this.model.position.set(x, y + bob + 0.1, z);
    this.model.rotation.y = (this.age + alpha) * 0.05 + this.spin;
    const [s, b] = lightAt(this.game, x, y + 0.2, z);
    applyLight(this.model, s, b);
  }
  damage(a, src) { if (src.type === 'explosion') { this.health -= a; if (this.health <= 0) this.removed = true; return true; } if (src.type === 'fire' || src.type === 'lava') { if (!this.fireImmune) this.removed = true; } return false; }
}

// ------------------------------------------------------------------ ORBE D'XP
const xpGeom = new THREE.IcosahedronGeometry(0.11, 0);
export class XPOrb extends Entity {
  constructor(game, value, x, y, z) {
    super(game, 'xp');
    this.value = value; this.w = 0.3; this.h = 0.3; this.stepHeight = 0;
    this.setPos(x, y, z);
    this.vx = (Math.random() - 0.5) * 0.2; this.vy = Math.random() * 0.2; this.vz = (Math.random() - 0.5) * 0.2;
    const mat = entityMaterial(null, { glow: 3.5 });
    mat.uniforms.uTintColor.value.set(0.5, 1.0, 0.15);
    mat.fragmentShader = mat.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(1.0);');
    const m = new THREE.Mesh(xpGeom, mat);
    m.scale.setScalar(0.7 + Math.min(1.5, value / 10));
    this.model = m;
  }
  tick() {
    this.baseTick();
    const p = this.game.player;
    this.vy -= 0.03;
    if (!p.dead) {
      const dx = p.x - this.x, dy = p.y + 0.9 - this.y, dz = p.z - this.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 8) {
        const f = (1 - d / 8) ** 2 * 0.1;
        this.vx += dx / d * f; this.vy += dy / d * f; this.vz += dz / d * f;
      }
      if (d < 1.2 && this.age > 8) { p.addXP(this.value); this.removed = true; return; }
    }
    this.applyMove();
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    if (this.onGround) { this.vx *= 0.7; this.vz *= 0.7; this.vy *= -0.6; }
    if (this.age > 6000) this.removed = true;
  }
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    this.model.position.set(x, y + 0.15, z);
    const s = 0.85 + Math.sin(this.age * 0.4) * 0.15;
    this.model.rotation.set(this.age * 0.1, this.age * 0.13, 0);
    this.model.material.uniforms.uTintColor.value.set(0.4 + 0.3 * Math.sin(this.age * 0.2), 1.0, 0.15 * s);
  }
}

// ------------------------------------------------------------- BLOC QUI TOMBE
export class FallingBlock extends Entity {
  constructor(game, id, meta, x, y, z) {
    super(game, 'falling_block');
    this.blockId = id; this.meta = meta;
    this.w = 0.98; this.h = 0.98; this.stepHeight = 0;
    this.setPos(x + 0.5, y, z + 0.5);
    const m = new THREE.Mesh(blockGeometry(id, meta), blockItemMaterial());
    m.layers.enable(1);
    this.model = m;
  }
  tick() {
    this.baseTick();
    this.vy -= 0.04;
    this.applyMove();
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    if (this.onGround) {
      const x = Math.floor(this.x), y = Math.floor(this.y + 0.5), z = Math.floor(this.z);
      const cur = this.game.world.getBlock(x, y, z);
      if (cur === 0 || BLOCKS[cur].replaceable) {
        this.game.world.setBlock(x, y, z, this.blockId, this.meta);
        this.game.audio && this.game.audio.playBlock(this.blockId, 'place', x + 0.5, y + 0.5, z + 0.5);
      } else this.game.dropItem(new ItemStack(this.blockId, 1), this.x, this.y + 0.5, this.z);
      this.removed = true;
    }
    if (this.age > 600) this.removed = true;
    // écrase les entités (enclume)
  }
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    this.model.position.set(x, y + 0.5, z);
    const [s, b] = lightAt(this.game, x, y + 0.5, z);
    applyLight(this.model, s, b);
  }
}

// ---------------------------------------------------------------------- TNT
export class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse = 80, power = 4) {
    super(game, 'tnt');
    this.fuse = fuse; this.power = power;
    this.w = 0.98; this.h = 0.98; this.stepHeight = 0;
    this.setPos(x + 0.5, y, z + 0.5);
    const a = Math.random() * Math.PI * 2;
    this.vx = -Math.sin(a) * 0.02; this.vy = 0.2; this.vz = -Math.cos(a) * 0.02;
    const m = new THREE.Mesh(blockGeometry(K.tnt), blockItemMaterial());
    m.layers.enable(1);
    this.model = m;
    game.audio && game.audio.play('fuse', this.x, this.y, this.z);
  }
  tick() {
    this.baseTick();
    this.vy -= 0.04;
    this.applyMove();
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    if (this.onGround) { this.vx *= 0.7; this.vz *= 0.7; this.vy *= -0.5; }
    this.fuse--;
    if (this.age % 2 === 0) this.game.particles && this.game.particles.smoke(this.x, this.y + 1.1, this.z, 0.4);
    if (this.fuse <= 0) {
      this.removed = true;
      this.game.explode(this.x, this.y + 0.49, this.z, this.power, { source: this, fire: false });
    }
  }
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    const s = this.fuse < 10 ? 1 + (10 - this.fuse) * 0.02 : 1;
    this.model.position.set(x, y + 0.5, z);
    this.model.scale.setScalar(s);
    const flash = Math.floor(this.fuse / 5) % 2 === 0;
    this.model.material.uniforms.uHurt.value = 0;
    applyLight(this.model, flash ? 1 : 0.8, flash ? 1 : 0.2);
    this.model.material.uniforms.uTintColor.value.set(1, 1, 1);
    if (flash) this.model.material.uniforms.uSky.value = 3;
  }
}

// --------------------------------------------------------------- PROJECTILES
const arrowGeom = (() => {
  const g = new THREE.BoxGeometry(0.06, 0.06, 0.6);
  return g;
})();
export class Projectile extends Entity {
  constructor(game, kind, shooter, x, y, z, vx, vy, vz) {
    super(game, 'projectile');
    this.kind = kind; this.shooter = shooter;
    this.w = 0.25; this.h = 0.25; this.stepHeight = 0;
    this.setPos(x, y, z);
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.gravity = { arrow: 0.05, snowball: 0.03, egg: 0.03, ender_pearl: 0.03, xp_bottle: 0.07, trident: 0.05 }[kind] ?? 0;
    this.drag = kind === 'fireball' || kind === 'small_fireball' || kind === 'wither_skull' || kind === 'dragon_fireball' ? 1.0 : 0.99;
    this.stuck = false;
    this.fireImmune = true;
    this.damageBase = kind === 'arrow' ? 2 : kind === 'trident' ? 8 : 0;
    this.crit = false;
    this.pickup = kind === 'arrow' && shooter && shooter.type === 'player' && !shooter.creative;
    this.makeModel();
  }
  makeModel() {
    const k = this.kind;
    if (k === 'arrow' || k === 'trident') {
      const mat = entityMaterial(null);
      mat.fragmentShader = mat.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(0.55, 0.42, 0.25, 1.0);');
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(arrowGeom, mat);
      g.add(shaft);
      if (k === 'trident') shaft.material.uniforms.uTintColor.value.set(0.4, 1.2, 1.1);
      g.traverse((o) => o.layers.enable(1));
      this.model = g;
    } else if (k === 'fireball' || k === 'small_fireball' || k === 'dragon_fireball' || k === 'wither_skull') {
      const mat = entityMaterial(null, { glow: k === 'wither_skull' ? 0.3 : 3 });
      mat.fragmentShader = mat.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(1.0);');
      const col = { fireball: [1, 0.45, 0.1], small_fireball: [1, 0.6, 0.15], dragon_fireball: [0.8, 0.2, 1], wither_skull: [0.15, 0.15, 0.17] }[k];
      mat.uniforms.uTintColor.value.set(...col);
      const size = k === 'fireball' ? 0.5 : k === 'wither_skull' ? 0.35 : 0.3;
      this.model = new THREE.Mesh(k === 'wither_skull' ? new THREE.BoxGeometry(size, size, size) : new THREE.IcosahedronGeometry(size, 1), mat);
      this.w = this.h = size * 2;
    } else {
      const id = { snowball: ITEM.snowball, egg: ITEM.egg, ender_pearl: ITEM.ender_pearl, xp_bottle: ITEM.experience_bottle }[k] || ITEM.snowball;
      const m = spriteMesh(id);
      if (m) m.scale.setScalar(0.4);
      this.model = m || new THREE.Group();
      this.billboard = true;
    }
  }
  tick() {
    this.baseTick();
    if (this.stuck) {
      this.stuckTicks = (this.stuckTicks || 0) + 1;
      if (this.stuckTicks > 1200) this.removed = true;
      const p = this.game.player;
      if (this.pickup && this.stuckTicks > 5 && p.dist2(this) < 2.5) {
        if (p.addItem(new ItemStack(ITEM.arrow, 1)) === 0) { this.removed = true; this.game.audio && this.game.audio.play('pickup', this.x, this.y, this.z); }
      }
      const id = this.game.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
      if (!B_SOLID[id]) { this.stuck = false; }
      return;
    }
    const g = this.game;
    const w = g.world;
    const sx = this.x, sy = this.y, sz = this.z;
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    // collision bloc (lancer de rayon)
    let hitBlock = null;
    if (speed > 0) {
      const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
      hitBlock = raycast(w, sx, sy, sz, dx, dy, dz, speed, { selection: getSelectionBoxes });
      if (hitBlock && !B_SOLID[hitBlock.id] && BLOCKS[hitBlock.id].shape !== 'cube') hitBlock = null;
    }
    // collision entité
    let hitEnt = null, best = hitBlock ? hitBlock.dist : speed;
    for (const e of g.entities.near(sx, sy, sz, speed + 3)) {
      if (e === this || e.removed || e.dead || !e.hittable) continue;
      if (e === this.shooter && this.age < 5) continue;
      if (e.type === 'item' || e.type === 'xp' || e.type === 'projectile') continue;
      const hw = e.w / 2 + 0.15;
      const r = rayBox(sx, sy, sz, this.vx / speed, this.vy / speed, this.vz / speed, e.x - hw, e.y - 0.1, e.z - hw, e.x + hw, e.y + e.h + 0.1, e.z + hw);
      if (r && r.t <= best) { best = r.t; hitEnt = e; }
    }
    if (hitEnt) { this.onHitEntity(hitEnt); return; }
    if (hitBlock) {
      this.x = hitBlock.hit[0]; this.y = hitBlock.hit[1]; this.z = hitBlock.hit[2];
      this.onHitBlock(hitBlock);
      return;
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    const drag = this.inWater ? 0.6 : this.drag;
    this.vx *= drag; this.vy *= drag; this.vz *= drag;
    this.vy -= this.gravity;
    if (this.accel) { this.vx += this.accel[0]; this.vy += this.accel[1]; this.vz += this.accel[2]; }
    if (this.kind === 'fireball' || this.kind === 'small_fireball' || this.kind === 'dragon_fireball') g.particles && g.particles.flame(this.x, this.y, this.z, this.kind === 'dragon_fireball' ? 'dragon' : 'fire');
    if (this.kind === 'arrow' && this.crit && g.particles) g.particles.crit(this.x, this.y, this.z);
    if (this.age > 400 || this.y < -10) this.removed = true;
  }
  onHitEntity(e) {
    const g = this.game;
    const k = this.kind;
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    if (e.reflectable && k === 'fireball') return; // géré par le joueur
    if (k === 'arrow' || k === 'trident') {
      let dmg = Math.ceil(speed * this.damageBase);
      if (this.crit) dmg += Math.floor(Math.random() * (dmg / 2 + 2));
      if (e.arrowImmune) { this.vx *= -0.1; this.vy *= -0.1; this.vz *= -0.1; return; }
      if (e.damage(dmg, { type: 'arrow', attacker: this.shooter, projectile: this })) {
        e.knockback(this.vx, this.vz, 0.3);
        if (this.fire) e.fire = 100;
        g.audio && g.audio.play('arrow_hit', this.x, this.y, this.z);
      }
      this.removed = true;
      if (k === 'trident' && this.shooter && this.shooter.type === 'player') { this.returning = true; }
      return;
    }
    if (k === 'snowball') { e.damage(e.type === 'blaze' ? 3 : 0, { type: 'thrown', attacker: this.shooter }); e.knockback(this.vx, this.vz, 0.25); }
    if (k === 'egg') e.damage(0, { type: 'thrown', attacker: this.shooter });
    if (k === 'small_fireball') { if (!e.fireImmune) { e.damage(5, { type: 'fireball', attacker: this.shooter }); e.fire = 100; } }
    if (k === 'fireball' || k === 'wither_skull' || k === 'dragon_fireball') { this.impact(e); return; }
    this.impact(null);
  }
  onHitBlock(h) {
    const g = this.game;
    const k = this.kind;
    if (k === 'arrow' || k === 'trident') {
      this.stuck = true; this.vx = this.vy = this.vz = 0;
      g.audio && g.audio.play('arrow_hit', this.x, this.y, this.z);
      if (h.id === K.tnt && this.fire) { g.world.setBlock(h.x, h.y, h.z, 0); g.primeTnt(h.x, h.y, h.z, 80); }
      return;
    }
    if (k === 'small_fireball') {
      const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][h.face] || [0, 1, 0];
      const fx = h.x + d[0], fy = h.y + d[1], fz = h.z + d[2];
      if (g.world.getBlock(fx, fy, fz) === 0) g.world.setBlock(fx, fy, fz, K.fire);
    }
    this.impact(null);
  }
  impact(e) {
    const g = this.game, k = this.kind;
    this.removed = true;
    if (k === 'fireball') g.explode(this.x, this.y, this.z, this.power || 1, { fire: true, source: this, attacker: this.shooter });
    else if (k === 'wither_skull') g.explode(this.x, this.y, this.z, this.blue ? 1.5 : 1, { source: this, attacker: this.shooter, wither: true });
    else if (k === 'dragon_fireball') g.spawnBreathCloud(this.x, this.y, this.z);
    else if (k === 'ender_pearl') {
      const p = this.shooter;
      if (p && !p.dead) { p.setPos(this.x, this.y + 0.1, this.z); p.vx = p.vy = p.vz = 0; p.fallDistance = 0; if (!p.creative) p.damage(5, { type: 'fall' }); g.particles && g.particles.portal(this.x, this.y + 1, this.z, 30); g.audio && g.audio.play('teleport', this.x, this.y, this.z); }
    } else if (k === 'egg') {
      g.particles && g.particles.burst(this.x, this.y, this.z, 0xf0e8d8, 8);
      if (Math.random() < 0.125) g.spawnMob('chicken', this.x, this.y, this.z, { baby: true });
    } else if (k === 'snowball') {
      g.particles && g.particles.burst(this.x, this.y, this.z, 0xffffff, 8);
    } else if (k === 'xp_bottle') {
      g.particles && g.particles.burst(this.x, this.y, this.z, 0x60ff60, 16);
      g.spawnXP(this.x, this.y, this.z, 3 + Math.floor(Math.random() * 9));
      g.audio && g.audio.play('glass', this.x, this.y, this.z);
    }
  }
  render(alpha, t, camera) {
    const [x, y, z] = this.lerp(alpha);
    this.model.position.set(x, y, z);
    if (this.billboard && camera) this.model.quaternion.copy(camera.quaternion);
    else if (this.kind === 'arrow' || this.kind === 'trident') {
      if (!this.stuck) { this.ryaw = Math.atan2(this.vx, this.vz); this.rpitch = Math.atan2(this.vy, Math.hypot(this.vx, this.vz)); }
      this.model.rotation.set(0, 0, 0);
      this.model.rotation.order = 'YXZ';
      this.model.rotation.y = this.ryaw || 0; this.model.rotation.x = -(this.rpitch || 0);
    } else this.model.rotation.set(this.age * 0.2, this.age * 0.3, 0);
    const [s, b] = lightAt(this.game, x, y, z);
    applyLight(this.model, s, b);
  }
}

// ------------------------------------------------------------ CRISTAL DE L'END
export class EndCrystal extends Entity {
  constructor(game, x, y, z) {
    super(game, 'end_crystal');
    this.w = 2; this.h = 2; this.stepHeight = 0; this.noGravity = true;
    this.setPos(x, y, z);
    this.hittable = true;
    this.fireImmune = true;
    this.health = 1;
    const g = new THREE.Group();
    const glass = entityMaterial(null, { glow: 0.5, transparent: true, alpha: 0.45, double: true, depthWrite: false });
    glass.fragmentShader = glass.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(0.85, 0.75, 1.0, 1.0);');
    const core = entityMaterial(null, { glow: 4 });
    core.fragmentShader = core.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(1.0, 0.45, 0.9, 1.0);');
    this.cubes = [];
    for (const [s, m] of [[0.9, glass], [0.7, glass], [0.45, core]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m);
      g.add(c); this.cubes.push(c);
    }
    const baseMat = entityMaterial(null);
    baseMat.fragmentShader = baseMat.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(0.12, 0.1, 0.14, 1.0);');
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), baseMat);
    base.position.y = -0.8;
    g.add(base);
    this.model = g;
  }
  tick() { this.px = this.x; this.py = this.y; this.pz = this.z; this.age++; }
  damage(a, src) {
    if (this.removed) return false;
    this.removed = true;
    this.game.explode(this.x, this.y, this.z, 6, { source: this, attacker: src.attacker });
    if (this.game.onCrystalDestroyed) this.game.onCrystalDestroyed(this, src);
    return true;
  }
  knockback() {}
  render(alpha) {
    const t = this.age + alpha;
    this.model.position.set(this.x, this.y + Math.sin(t * 0.08) * 0.2 + 0.2, this.z);
    this.cubes.forEach((c, i) => c.rotation.set(t * 0.05 * (i + 1), t * 0.07 * (i % 2 ? -1 : 1), t * 0.03));
  }
}

// ------------------------------------------------------------------ ÉCLAIR
export class Lightning extends Entity {
  constructor(game, x, y, z) {
    super(game, 'lightning');
    this.setPos(x, y, z);
    this.life = 10;
    const pts = [];
    let cx = 0, cz = 0;
    for (let h = 120; h >= 0; h -= 4) { pts.push(new THREE.Vector3(cx, h, cz)); cx += (Math.random() - 0.5) * 3; cz += (Math.random() - 0.5) * 3; }
    pts.push(new THREE.Vector3(0, 0, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const mat = entityMaterial(null, { glow: 25 });
    mat.fragmentShader = mat.fragmentShader.replace('vec4 a = texture(uMap, vUv);', 'vec4 a = vec4(0.75, 0.82, 1.0, 1.0);');
    this.model = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.18, 4, false), mat);
  }
  tick() {
    this.age++;
    if (this.age === 1) {
      const g = this.game;
      const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
      if (g.world.getBlock(x, y, z) === 0 && B_SOLID[g.world.getBlock(x, y - 1, z)]) g.world.setBlock(x, y, z, K.fire);
      for (const e of g.entities.near(this.x, this.y, this.z, 4)) if (e !== this && e.hittable) { e.damage(5, { type: 'lightning' }); e.fire = Math.max(e.fire, 160); if (e.onLightning) e.onLightning(); }
    }
    if (this.age > this.life) this.removed = true;
  }
  render() { this.model.position.set(this.x, this.y, this.z); this.model.visible = this.age % 3 !== 2; }
}
