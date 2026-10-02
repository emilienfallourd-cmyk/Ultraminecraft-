// Entité de base : physique façon Minecraft (20 ticks/s), dégâts, feu, effets
import { moveEntity, fluidState, blocksInside } from './physics.js';
import { BLOCKS, BLOCK } from '../blocks/blocks.js';

let NEXT_ID = 1;

export class Entity {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.id = NEXT_ID++;
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.pyaw = 0; this.ppitch = 0;
    this.bodyYaw = 0; this.pbodyYaw = 0;
    this.w = 0.6; this.h = 1.8; this.eyeHeight = 1.62; this.stepHeight = 0.6;
    this.onGround = false; this.inWater = false; this.inLava = false; this.eyeInWater = false; this.eyeInLava = false;
    this.hcol = false; this.vcol = false;
    this.health = 20; this.maxHealth = 20;
    this.hurtTime = 0; this.invul = 0; this.deathTime = 0; this.dead = false; this.removed = false;
    this.fire = 0; this.air = 300; this.age = 0; this.fallDistance = 0;
    this.noGravity = false; this.noClip = false; this.flying = false; this.sneaking = false; this.sprinting = false;
    this.effects = {};
    this.model = null;
    this.walkDist = 0; this.pwalkDist = 0; this.limbSwing = 0; this.limbAmp = 0; this.plimbAmp = 0;
    this.fireImmune = false;
    this.knockbackResist = 0;
    this.persistent = false;
    this.inCobweb = false;
    this.lastDamager = null;
  }

  setPos(x, y, z) { this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z; }
  get world() { return this.game.world; }
  dist2(o) { const dx = o.x - this.x, dy = o.y - this.y, dz = o.z - this.z; return dx * dx + dy * dy + dz * dz; }
  distTo(o) { return Math.sqrt(this.dist2(o)); }
  aabb() { const hw = this.w / 2; return [this.x - hw, this.y, this.z - hw, this.x + hw, this.y + this.h, this.z + hw]; }
  eyePos() { return [this.x, this.y + this.eyeHeight, this.z]; }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  hasEffect(n) { return !!this.effects[n]; }
  addEffect(n, ticks, amp = 0) {
    const e = this.effects[n];
    if (!e || e.amp < amp || (e.amp === amp && e.ticks < ticks)) this.effects[n] = { ticks, amp };
  }

  // ---------------------------------------------------------- PHYSIQUE
  updateFluids() {
    const fs = fluidState(this.world, this);
    const wasIn = this.inWater;
    this.inWater = fs.water; this.inLava = fs.lava; this.eyeInWater = fs.eyeWater; this.eyeInLava = fs.eyeLava;
    this.waterTop = fs.waterTop;
    if (this.inWater) { this.fallDistance = 0; if (this.fire > 0) this.fire = 0; }
    if (!wasIn && this.inWater && this.vy < -0.3 && this.game.particles) this.game.particles.splash(this.x, this.waterTop, this.z, Math.min(1, -this.vy));
    this.inCobweb = false; this.climbing = false; this.inPortal = null; this.inFire = false; this.speedMul = 1;
    blocksInside(this.world, this, (def, x, y, z) => {
      if (def.key === 'cobweb') this.inCobweb = true;
      if (def.climbable) this.climbing = true;
      if (def.portal) this.inPortal = def.portal;
      if (def.key === 'fire' || def.key === 'soul_fire' || def.key === 'campfire') this.inFire = true;
      if (def.slow) this.speedMul = Math.min(this.speedMul, def.slow);
      if (def.key === 'sweet_berry_bush' && (this.vx || this.vz)) this.touchDamage = 1;
    });
  }

  // déplacement « travel » de Minecraft (strafe, forward ∈ [-1,1])
  travel(strafe, forward, speed, jump) {
    const w = this.world;
    if (this.flying) {
      const acc = speed * (this.sprinting ? 2 : 1) * 1.0;
      this.moveRelative(strafe, forward, acc);
      this.applyMove();
      this.vx *= 0.91; this.vz *= 0.91; this.vy *= 0.6;
      return;
    }
    if (this.inWater && !this.flying) {
      // comme Minecraft : 0,02 de poussée ; la nage rapide réduit seulement la traînée
      // (≈ 1,6 m/s en marchant dans l'eau, ≈ 5 m/s en nageant)
      let acc = 0.02;
      if (this.swimming) acc = 0.028 * Math.min(1.5, speed / 0.13);
      this.moveRelative(strafe, forward, acc);
      this.applyMove();
      const drag = this.swimming ? 0.9 : 0.8;
      this.vx *= drag; this.vy *= 0.8; this.vz *= drag;
      if (!this.noGravity) this.vy -= this.swimming ? 0.005 : 0.02;
      if (this.hcol && this.canStepOutOfWater()) this.vy = 0.3;
      return;
    }
    if (this.inLava) {
      this.moveRelative(strafe, forward, 0.02);
      this.applyMove();
      this.vx *= 0.5; this.vy *= 0.5; this.vz *= 0.5;
      if (!this.noGravity) this.vy -= 0.02;
      if (this.hcol && this.canStepOutOfWater()) this.vy = 0.3;
      return;
    }
    let slip = 0.91;
    if (this.onGround) {
      const below = BLOCKS[w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z))];
      slip = (below ? below.friction : 0.6) * 0.91;
    }
    const acc = this.onGround ? speed * (0.21600002 / (slip * slip * slip)) : (this.sprinting ? 0.026 : 0.02) * (this.airMul || 1);
    this.moveRelative(strafe, forward, acc);
    if (this.climbing) {
      this.vx = Math.max(-0.15, Math.min(0.15, this.vx));
      this.vz = Math.max(-0.15, Math.min(0.15, this.vz));
      this.fallDistance = 0;
      if (this.vy < -0.15) this.vy = -0.15;
      if (this.sneaking && this.vy < 0) this.vy = 0;
    }
    this.applyMove();
    if (this.climbing && (this.hcol || jump)) this.vy = 0.2;
    if (this.effects.levitation) this.vy += (0.05 * (this.effects.levitation.amp + 1) - this.vy) * 0.2;
    else if (!this.noGravity) {
      if (this.effects.slow_falling && this.vy < 0) this.vy -= 0.01; else this.vy -= 0.08;
    }
    this.vy *= 0.98;
    this.vx *= slip; this.vz *= slip;
  }

  canStepOutOfWater() {
    const hw = this.w / 2;
    const bx = this.x + this.vx * 4, bz = this.z + this.vz * 4;
    const y = Math.floor(this.y + 0.6 + 0.6);
    const id = this.world.getBlock(Math.floor(bx + Math.sign(this.vx) * hw), y, Math.floor(bz + Math.sign(this.vz) * hw));
    return !BLOCKS[id].solid;
  }

  moveRelative(strafe, forward, acc) {
    let d = strafe * strafe + forward * forward;
    if (d < 1e-4) return;
    d = Math.sqrt(d);
    if (d < 1) d = 1;
    strafe *= acc / d; forward *= acc / d;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vx += strafe * c - forward * s;
    this.vz += -strafe * s - forward * c;
  }

  applyMove() {
    let { vx, vy, vz } = this;
    if (this.inCobweb) { vx *= 0.25; vy *= 0.05; vz *= 0.25; this.fallDistance = 0; }
    if (this.speedMul < 1) { vx *= this.speedMul; vz *= this.speedMul; }
    const r = moveEntity(this.world, this, vx, vy, vz);
    this.hcol = r.hx; this.vcol = r.hy;
    const wasGround = this.onGround;
    this.onGround = r.ground;
    if (r.hxX) this.vx = 0;
    if (r.hxZ) this.vz = 0;
    if (r.hy) {
      if (this.vy < 0 && this.bounce && !this.sneaking) this.vy = -this.vy * 0.8;
      else this.vy = 0;
    }
    // chute
    if (this.onGround) {
      if (this.fallDistance > 0) this.onLand(this.fallDistance, wasGround);
      this.fallDistance = 0;
    } else if (r.ry < 0 && !this.flying) this.fallDistance -= r.ry;
    if (this.inCobweb) this.vy = 0;
    // marche (animation)
    const dx = this.x - this.px, dz = this.z - this.pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.walkDist += dist;
  }

  onLand(dist) {
    if (this.fallImmune || this.flying) return;
    const d = Math.ceil(dist - 3 - (this.effects.jump_boost ? this.effects.jump_boost.amp + 1 : 0));
    if (d > 0) {
      const below = this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
      if (below === BLOCK.hay_block) this.damage(Math.ceil(d * 0.2), { type: 'fall' });
      else if (below !== BLOCK.water) this.damage(d, { type: 'fall' });
      if (this.game.audio) this.game.audio.play(d > 4 ? 'fall_big' : 'fall_small', this.x, this.y, this.z);
    }
  }

  // ------------------------------------------------------------ DÉGÂTS
  damage(amount, src = {}) {
    if (this.dead || this.removed) return false;
    if (this.invulnerable && src.type !== 'void' && src.type !== 'kill') return false;
    if (this.fireImmune && (src.type === 'fire' || src.type === 'lava')) return false;
    if (this.effects.fire_resistance && (src.type === 'fire' || src.type === 'lava')) return false;
    if (this.invul > 10 && src.type !== 'void') {
      if (amount <= this.lastHurt) return false;
      const extra = amount - this.lastHurt;
      this.lastHurt = amount;
      amount = extra;
    } else { this.lastHurt = amount; this.invul = 20; this.hurtTime = 10; }
    if (this.effects.resistance) amount *= Math.max(0, 1 - 0.2 * (this.effects.resistance.amp + 1));
    amount = this.applyArmor(amount, src);
    if (this.absorption > 0) { const a = Math.min(this.absorption, amount); this.absorption -= a; amount -= a; }
    this.health -= amount;
    if (src.attacker) this.lastDamager = src.attacker;
    this.onHurt(amount, src);
    if (this.health <= 0) { this.health = 0; this.die(src); }
    return true;
  }
  applyArmor(a) { return a; }
  onHurt() {}
  heal(a) { if (!this.dead) this.health = Math.min(this.maxHealth, this.health + a); }
  knockback(dx, dz, str = 0.4) {
    str *= 1 - this.knockbackResist;
    if (str <= 0) return;
    const l = Math.hypot(dx, dz) || 1;
    this.vx /= 2; this.vz /= 2;
    this.vx += (dx / l) * str; this.vz += (dz / l) * str;
    if (this.onGround) this.vy = Math.min(0.4, this.vy / 2 + str);
  }
  die(src) {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
    this.onDeath(src);
  }
  onDeath() {}

  // ------------------------------------------------------------ TICK
  baseTick() {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.pyaw = this.yaw; this.ppitch = this.pitch; this.pbodyYaw = this.bodyYaw;
    this.pwalkDist = this.walkDist; this.plimbAmp = this.limbAmp;
    this.age++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invul > 0) this.invul--;
    this.updateFluids();
    // feu et lave
    if (this.inLava) { this.damage(4, { type: 'lava' }); if (!this.fireImmune) this.fire = Math.max(this.fire, 300); }
    if (this.inFire) { this.damage(1, { type: 'fire' }); if (!this.fireImmune) this.fire = Math.max(this.fire, 160); }
    if (this.touchDamage) { this.damage(this.touchDamage, { type: 'cactus' }); this.touchDamage = 0; }
    if (this.fire > 0) {
      if (this.fireImmune || this.effects.fire_resistance) this.fire = 0;
      else { this.fire--; if (this.fire % 20 === 0) this.damage(1, { type: 'fire' }); }
    }
    // noyade
    if (this.eyeInWater && !this.canBreatheUnderwater) {
      if (!this.effects.water_breathing) this.air--;
      if (this.air <= -20) { this.air = 0; this.damage(2, { type: 'drown' }); }
    } else if (this.air < 300) this.air = Math.min(300, this.air + 4);
    if (this.y < -64) this.damage(4, { type: 'void' });
    // effets
    for (const [n, e] of Object.entries(this.effects)) {
      e.ticks--;
      if (n === 'regeneration' && this.age % Math.max(1, 50 >> e.amp) === 0) this.heal(1);
      if (n === 'poison' && this.age % Math.max(1, 25 >> e.amp) === 0 && this.health > 1) this.damage(1, { type: 'magic' });
      if (n === 'wither' && this.age % Math.max(1, 40 >> e.amp) === 0) this.damage(1, { type: 'wither' });
      if (e.ticks <= 0) delete this.effects[n];
    }
  }

  // contact avec un bloc qui blesse (cactus, magma)
  checkContactDamage() {
    const w = this.world;
    const below = BLOCKS[w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z))];
    if (below && below.magma && this.onGround && !this.sneaking && !this.fireImmune) this.damage(1, { type: 'fire' });
    if (this.hcol || this.onGround) {
      const hw = this.w / 2 + 0.05;
      for (const [dx, dz] of [[hw, 0], [-hw, 0], [0, hw], [0, -hw]]) {
        const id = w.getBlock(Math.floor(this.x + dx), Math.floor(this.y + 0.5), Math.floor(this.z + dz));
        if (id === BLOCK.cactus) { this.damage(1, { type: 'cactus' }); break; }
      }
    }
  }

  updateLimbs() {
    const dx = this.x - this.px, dz = this.z - this.pz;
    let d = Math.sqrt(dx * dx + dz * dz) * 4;
    if (d > 1) d = 1;
    this.limbAmp += (d - this.limbAmp) * 0.4;
    this.limbSwing += this.limbAmp;
  }

  tick() { this.baseTick(); }
  // interpolation pour le rendu
  lerp(alpha) {
    return [this.px + (this.x - this.px) * alpha, this.py + (this.y - this.py) * alpha, this.pz + (this.z - this.pz) * alpha];
  }
  dispose() {}
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
