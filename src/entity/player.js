// Joueur : inventaire, survie (faim, santé, oxygène, XP), déplacements, vol créatif, élytres
import { Entity } from './entity.js';
import { ITEMS, ITEM, ItemStack, maxStack } from '../items/items.js';
import { GAMEMODE } from '../constants.js';
import { BLOCKS } from '../blocks/blocks.js';

export function xpForLevel(l) { return l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158; }

export class Player extends Entity {
  constructor(game) {
    super(game, 'player');
    this.w = 0.6; this.h = 1.8; this.eyeHeight = 1.62;
    this.inventory = new Array(36).fill(null);
    this.armor = [null, null, null, null];
    this.offhand = null;
    this.craft = new Array(4).fill(null);
    this.cursor = null;
    this.selected = 0;
    this.gamemode = GAMEMODE.SURVIVAL;
    this.food = 20; this.saturation = 5; this.exhaustion = 0; this.foodTimer = 0;
    this.xpLevel = 0; this.xpProgress = 0; this.xpTotal = 0;
    this.spawnPoint = null;
    this.attackTicks = 100;
    this.jumpCooldown = 0;
    this.useTicks = 0; this.using = null;
    this.portalTicks = 0; this.portalCooldown = 0;
    this.gliding = false;
    this.absorption = 0;
    this.input = { strafe: 0, forward: 0, jump: false, sneak: false, sprint: false };
    this.bob = 0; this.pbob = 0; this.tilt = 0;
    this.score = 0;
    this.persistent = true;
    this.swing = 0; this.swinging = false;
    this.lastHealth = 20;
  }

  get creative() { return this.gamemode === GAMEMODE.CREATIVE; }
  get spectator() { return this.gamemode === GAMEMODE.SPECTATOR; }
  get held() { return this.inventory[this.selected]; }
  set held(v) { this.inventory[this.selected] = v; }

  setGamemode(m) {
    this.gamemode = m;
    if (m === GAMEMODE.SURVIVAL) { this.flying = false; this.noClip = false; this.invulnerable = false; }
    if (m === GAMEMODE.CREATIVE) { this.noClip = false; this.invulnerable = true; this.fire = 0; }
    if (m === GAMEMODE.SPECTATOR) { this.flying = true; this.noClip = true; this.invulnerable = true; }
  }

  // ----------------------------------------------------------- INVENTAIRE
  addItem(stack) {
    if (!stack || stack.count <= 0) return 0;
    const inv = this.inventory;
    const max = maxStack(stack.id);
    // empiler d'abord
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 36 && stack.count > 0; i++) {
        const s = inv[i];
        if (pass === 0 && s && s.canStack(stack) && s.count < max) {
          const n = Math.min(max - s.count, stack.count);
          s.count += n; stack.count -= n;
        } else if (pass === 1 && !s) {
          const n = Math.min(max, stack.count);
          inv[i] = new ItemStack(stack.id, n, stack.damage);
          if (stack.tag) inv[i].tag = { ...stack.tag };
          stack.count -= n;
        }
      }
    }
    if (this.game.ui) this.game.ui.refresh();
    return stack.count;
  }
  countItem(id) { let n = 0; for (const s of this.inventory) if (s && s.id === id) n += s.count; return n; }
  removeItem(id, n) {
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) this.inventory[i] = null; }
    }
    if (this.game.ui) this.game.ui.refresh();
  }
  consumeHeld(n = 1) {
    if (this.creative) return;
    const h = this.held;
    if (!h) return;
    h.count -= n;
    if (h.count <= 0) this.held = null;
    if (this.game.ui) this.game.ui.refresh();
  }
  damageHeld(n = 1) {
    if (this.creative) return;
    const h = this.held;
    if (!h || !h.def.durability) return;
    h.damage += n;
    if (h.damage >= h.def.durability) {
      this.held = null;
      if (this.game.audio) this.game.audio.play('break_tool', this.x, this.y, this.z);
    }
    if (this.game.ui) this.game.ui.refresh();
  }
  armorPoints() { let p = 0; for (const a of this.armor) if (a && a.def.armor) p += a.def.armor.points; return p; }
  armorToughness() { let p = 0; for (const a of this.armor) if (a && a.def.armor) p += a.def.armor.tough || 0; return p; }
  applyArmor(dmg, src) {
    if (['fall', 'drown', 'starve', 'void', 'magic', 'wither', 'kill', 'sonic'].includes(src.type)) return dmg;
    const pts = this.armorPoints(), t = this.armorToughness();
    const red = Math.min(20, Math.max(pts / 5, pts - dmg / (2 + t / 4))) / 25;
    // usure de l'armure
    if (!this.creative) for (let i = 0; i < 4; i++) {
      const a = this.armor[i];
      if (a && a.def.durability) { a.damage += Math.max(1, Math.floor(dmg / 4)); if (a.damage >= a.def.durability) this.armor[i] = null; }
    }
    return dmg * (1 - red);
  }

  addExhaustion(e) { if (!this.creative && !this.spectator) this.exhaustion = Math.min(40, this.exhaustion + e); }
  addXP(n) {
    this.xpTotal += n; this.score += n;
    this.xpProgress += n / xpForLevel(this.xpLevel);
    while (this.xpProgress >= 1) {
      this.xpProgress = (this.xpProgress - 1) * xpForLevel(this.xpLevel);
      this.xpLevel++;
      this.xpProgress /= xpForLevel(this.xpLevel);
      if (this.game.audio && this.xpLevel % 5 === 0) this.game.audio.play('levelup');
    }
    if (this.game.audio) this.game.audio.play('xp', this.x, this.y, this.z);
  }

  eat(def) {
    const f = def.food;
    if (f.milk) { this.effects = {}; return; }
    this.food = Math.min(20, this.food + f.hunger);
    this.saturation = Math.min(this.food, this.saturation + f.sat);
    if (f.effects) for (const [n, t, a, chance] of f.effects) if (!chance || Math.random() < chance) {
      if (n === 'absorption') this.absorption = Math.max(this.absorption, 4 * (a + 1)); else this.addEffect(n, t, a);
    }
    if (f.teleport) this.game.chorusTeleport(this);
  }

  // ------------------------------------------------------------------ TICK
  tick() {
    const g = this.game;
    this.baseTick();
    if (this.dead) { this.deathTime++; return; }
    this.attackTicks++;
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.portalCooldown > 0) this.portalCooldown--;
    const inp = this.input;
    const surv = !this.creative && !this.spectator;

    // posture furtive
    const wantSneak = inp.sneak && !this.flying;
    if (wantSneak !== this.sneaking) {
      this.sneaking = wantSneak;
      this.h = wantSneak ? 1.5 : 1.8; this.eyeHeight = wantSneak ? 1.27 : 1.62;
    }
    // sprint
    if (inp.sprint && inp.forward > 0.5 && !this.sneaking && (this.food > 6 || !surv) && !this.using) this.sprinting = true;
    if (inp.forward <= 0.2 || this.hcol || this.sneaking || (surv && this.food <= 6)) this.sprinting = false;
    this.swimming = this.inWater && this.sprinting && this.eyeInWater;

    let speed = 0.1;
    if (this.sprinting) speed *= 1.3;
    if (this.effects.speed) speed *= 1 + 0.2 * (this.effects.speed.amp + 1);
    if (this.effects.slowness) speed *= Math.max(0, 1 - 0.15 * (this.effects.slowness.amp + 1));
    let strafe = inp.strafe * 0.98, forward = inp.forward * 0.98;
    if (this.sneaking) { strafe *= 0.3; forward *= 0.3; }
    if (this.using) { strafe *= 0.2; forward *= 0.2; }
    // vitesse réduite sur le sable des âmes
    const below = g.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    if (BLOCKS[below] && BLOCKS[below].speed < 1 && this.onGround) speed *= BLOCKS[below].speed;

    // vol créatif
    if (this.creative && inp.doubleJump) { this.flying = !this.flying; this.vy = 0; }
    if (this.spectator) this.flying = true;
    if (this.flying) {
      if (inp.jump) this.vy += 0.15;
      if (inp.sneak) this.vy -= 0.15;
      this.travel(strafe, forward, 0.05, false);
      if (this.onGround && !this.spectator && this.creative && inp.sneak) this.flying = false;
      this.updateLimbs();
      this.updateBob();
      return;
    }

    // élytres
    const chest = this.armor[1];
    const hasElytra = chest && chest.id === ITEM.elytra && chest.damage < chest.def.durability - 1;
    if (hasElytra && inp.jumpPressed && !this.onGround && !this.inWater && !this.gliding && this.vy < 0.1) this.gliding = true;
    if (this.gliding && (this.onGround || this.inWater || !hasElytra)) this.gliding = false;
    if (this.gliding) {
      this.glide();
      if (surv && this.age % 20 === 0) { chest.damage++; }
      this.updateLimbs(); this.updateBob();
      return;
    }

    // saut / nage
    if (inp.jump) {
      if (this.inWater || this.inLava) this.vy += 0.04;
      else if (this.onGround && this.jumpCooldown === 0) {
        this.vy = 0.42 + (this.effects.jump_boost ? 0.1 * (this.effects.jump_boost.amp + 1) : 0);
        if (this.sprinting) {
          this.vx -= Math.sin(this.yaw) * 0.2; this.vz -= Math.cos(this.yaw) * 0.2;
          this.addExhaustion(0.2);
        } else this.addExhaustion(0.05);
        this.jumpCooldown = 10;
        if (g.audio) g.audio.step(this, true);
      }
    } else this.jumpCooldown = 0;
    if (this.swimming && this.eyeInWater) {
      // nage façon dauphin : suit le regard
      const ld = this.lookDir();
      this.vy += (ld[1] * 0.08 - this.vy) * 0.08;
    }

    const ox = this.x, oz = this.z;
    this.travel(strafe, forward, speed, inp.jump);
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.sprinting) this.addExhaustion(0.1 * moved);
    if (this.inWater) this.addExhaustion(0.01 * moved);
    this.checkContactDamage();
    this.updateLimbs();
    this.updateBob();

    // pas
    if (this.onGround && moved > 0.01 && !this.sneaking) {
      this.stepAcc = (this.stepAcc || 0) + moved;
      if (this.stepAcc > 1.6) { this.stepAcc = 0; if (g.audio) g.audio.step(this); if (g.onPlayerStep) g.onPlayerStep(this); }
    }

    // faim et santé
    if (surv) this.survivalTick();
  }

  glide() {
    const ld = this.lookDir();
    const pitch = this.pitch;
    const lh = Math.hypot(ld[0], ld[2]);
    const hs = Math.hypot(this.vx, this.vz);
    const cp = Math.cos(pitch);
    const f = cp * cp;
    this.vy += -0.08 + f * 0.06;
    if (this.vy < 0 && lh > 0) { const d = this.vy * -0.1 * f; this.vy += d; this.vx += ld[0] * d / lh; this.vz += ld[2] * d / lh; }
    if (pitch > 0 && lh > 0) { const d = hs * Math.sin(pitch) * 0.04; this.vy += d * 3.2; this.vx -= ld[0] * d / lh; this.vz -= ld[2] * d / lh; }
    if (lh > 0) { this.vx += (ld[0] / lh * hs - this.vx) * 0.1; this.vz += (ld[2] / lh * hs - this.vz) * 0.1; }
    if (this.boost > 0) { this.boost--; this.vx += ld[0] * 0.1 + (ld[0] * 1.5 - this.vx) * 0.5 * 0.1; this.vy += ld[1] * 0.1 + (ld[1] * 1.5 - this.vy) * 0.05; this.vz += ld[2] * 0.1 + (ld[2] * 1.5 - this.vz) * 0.05; }
    this.vx *= 0.99; this.vy *= 0.98; this.vz *= 0.99;
    const before = Math.hypot(this.vx, this.vz);
    this.applyMove();
    if (this.hcol) {
      const after = Math.hypot(this.vx, this.vz);
      const dmg = (before - after) * 10 - 3;
      if (dmg > 0) this.damage(dmg, { type: 'fly_into_wall' });
    }
    this.fallDistance = Math.max(0, this.fallDistance * 0.5);
  }

  survivalTick() {
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    this.foodTimer++;
    if (this.saturation > 0 && this.food >= 20 && this.health < this.maxHealth) {
      if (this.foodTimer >= 10) { const s = Math.min(this.saturation, 6); this.heal(s / 6); this.addExhaustion(s); this.foodTimer = 0; }
    } else if (this.food >= 18 && this.health < this.maxHealth) {
      if (this.foodTimer >= 80) { this.heal(1); this.addExhaustion(6); this.foodTimer = 0; }
    } else if (this.food <= 0) {
      if (this.foodTimer >= 80) { if (this.health > 1) this.damage(1, { type: 'starve' }); this.foodTimer = 0; }
    } else this.foodTimer = 0;
  }

  updateBob() {
    this.pbob = this.bob;
    const hs = Math.hypot(this.x - this.px, this.z - this.pz);
    const target = this.onGround || this.flying ? Math.min(0.1, hs) : 0;
    this.bob += (target - this.bob) * 0.4;
    this.ptilt = this.tilt;
  }

  onHurt(amount, src) {
    const g = this.game;
    if (g.audio) g.audio.play('hurt', this.x, this.y, this.z);
    if (g.onPlayerHurt) g.onPlayerHurt(amount, src);
  }

  die(src) {
    // totem d'immortalité
    const hands = [this.selected, -1];
    for (const h of hands) {
      const s = h === -1 ? this.offhand : this.inventory[h];
      if (s && s.id === ITEM.totem_of_undying) {
        if (h === -1) this.offhand = null; else this.inventory[h] = null;
        this.health = 1; this.effects = {};
        this.addEffect('regeneration', 900, 1); this.absorption = 4; this.addEffect('fire_resistance', 800, 0);
        if (this.game.onTotem) this.game.onTotem(this);
        return;
      }
    }
    super.die(src);
  }

  onDeath(src) { if (this.game.onPlayerDeath) this.game.onPlayerDeath(src); }

  respawn(pos) {
    this.dead = false; this.deathTime = 0; this.health = this.maxHealth; this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 300; this.fire = 0; this.effects = {}; this.vx = this.vy = this.vz = 0; this.fallDistance = 0; this.absorption = 0;
    this.setPos(pos[0], pos[1], pos[2]);
  }

  toJSON() {
    const ser = (s) => (s ? s.toJSON() : null);
    return {
      pos: [this.x, this.y, this.z], yaw: this.yaw, pitch: this.pitch, health: this.health, food: this.food, sat: this.saturation,
      xp: [this.xpLevel, this.xpProgress, this.xpTotal], inv: this.inventory.map(ser), armor: this.armor.map(ser), off: ser(this.offhand),
      sel: this.selected, gm: this.gamemode, spawn: this.spawnPoint, flying: this.flying, effects: this.effects, air: this.air, score: this.score,
    };
  }
  fromJSON(o) {
    this.setPos(o.pos[0], o.pos[1], o.pos[2]);
    this.yaw = o.yaw || 0; this.pitch = o.pitch || 0; this.health = o.health ?? 20; this.food = o.food ?? 20; this.saturation = o.sat ?? 5;
    [this.xpLevel, this.xpProgress, this.xpTotal] = o.xp || [0, 0, 0];
    this.inventory = (o.inv || []).map((s) => ItemStack.from(s)); while (this.inventory.length < 36) this.inventory.push(null);
    this.armor = (o.armor || [null, null, null, null]).map((s) => ItemStack.from(s));
    this.offhand = ItemStack.from(o.off);
    this.selected = o.sel || 0;
    this.setGamemode(o.gm || 0);
    this.spawnPoint = o.spawn || null;
    this.flying = !!o.flying && this.gamemode !== 0;
    this.effects = o.effects || {}; this.air = o.air ?? 300; this.score = o.score || 0;
  }
}
