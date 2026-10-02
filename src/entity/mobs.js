// Créatures : définitions, IA (errance, poursuite, tir, explosion, téléportation, vol, nage), apparition naturelle
import * as THREE from 'three';
import { Entity, angleLerp } from './entity.js';
import { buildModel, MODELS, genericQuadruped } from './mobmodels.js';
import { entityMaterial, itemMesh } from './models.js';
import { findPath, canSee } from './ai.js';
import { ITEMS, ITEM, ItemStack, SPAWN_EGGS } from '../items/items.js';
import { BLOCKS, BLOCK as K, B_SOLID, B_FLUID, COLOR_KEYS } from '../blocks/blocks.js';
import { BIOME as BI } from '../world/biomes.js';
import { HEIGHT, DAY_LENGTH } from '../constants.js';
import { createBoss } from './bosses.js';

// --------------------------------------------------------------- DÉFINITIONS
const D = {};
const def = (k, o) => { D[k] = { type: k, hp: 20, w: 0.6, h: 1.8, speed: 0.25, kind: 'passive', dmg: 2, xp: 0, drops: [], sound: k, ...o }; };
// passifs
def('pig', { name: 'Cochon', hp: 10, w: 0.9, h: 0.9, model: 'pig', drops: [['porkchop', 1, 3]], xp: 2, food: ['carrot', 'potato'], quad: true });
def('cow', { name: 'Vache', hp: 10, w: 0.9, h: 1.4, speed: 0.2, model: 'cow', drops: [['beef', 1, 3], ['leather', 0, 2]], xp: 2, food: ['wheat'], quad: true });
def('mooshroom', { name: 'Champimeuh', hp: 10, w: 0.9, h: 1.4, speed: 0.2, model: 'mooshroom', drops: [['beef', 1, 3], ['leather', 0, 2]], xp: 2, food: ['wheat'], quad: true });
def('sheep', { name: 'Mouton', hp: 8, w: 0.9, h: 1.3, speed: 0.23, model: 'sheep', drops: [['mutton', 1, 2]], xp: 2, food: ['wheat'], quad: true });
def('chicken', { name: 'Poulet', hp: 4, w: 0.4, h: 0.7, model: 'chicken', drops: [['chicken', 1, 1], ['feather', 0, 2]], xp: 1, food: ['wheat_seeds'], slowFall: true });
def('horse', { name: 'Cheval', hp: 22, w: 1.4, h: 1.6, speed: 0.3, model: 'horse', drops: [['leather', 0, 2]], xp: 2, food: ['apple', 'wheat', 'golden_apple'], quad: true });
def('villager', { name: 'Villageois', hp: 20, model: 'villager', speed: 0.22, villager: true, drops: [] });
def('rabbit', { name: 'Lapin', hp: 3, w: 0.4, h: 0.5, speed: 0.3, scale: 0.6, drops: [['rabbit_hide', 0, 1]], xp: 1, hopper: true, food: ['carrot'] });
def('fox', { name: 'Renard', hp: 10, w: 0.6, h: 0.7, speed: 0.3, drops: [], xp: 1, scale: 0.8 });
def('cat', { name: 'Chat', hp: 10, w: 0.6, h: 0.7, speed: 0.3, scale: 0.7, food: ['cod'] });
def('turtle', { name: 'Tortue', hp: 30, w: 1.2, h: 0.4, speed: 0.1, scale: 1.2, drops: [] });
def('goat', { name: 'Chèvre', hp: 10, w: 0.9, h: 1.3, speed: 0.25, food: ['wheat'] });
def('panda', { name: 'Panda', hp: 20, w: 1.3, h: 1.25, speed: 0.15, scale: 1.6 });
def('polar_bear', { name: 'Ours polaire', hp: 30, w: 1.4, h: 1.4, speed: 0.25, scale: 1.7, kind: 'neutral', dmg: 6, drops: [['cod', 0, 2]] });
def('llama', { name: 'Lama', hp: 22, w: 0.9, h: 1.87, speed: 0.2, scale: 1.4 });
def('camel', { name: 'Dromadaire', hp: 32, w: 1.7, h: 2.375, speed: 0.15, scale: 2 });
def('parrot', { name: 'Perroquet', hp: 6, w: 0.5, h: 0.9, scale: 0.5 });
def('bee', { name: 'Abeille', hp: 10, w: 0.7, h: 0.6, scale: 0.4, kind: 'bat' });
def('axolotl', { name: 'Axolotl', hp: 14, w: 0.75, h: 0.42, scale: 0.5, kind: 'water' });
def('frog', { name: 'Grenouille', hp: 10, w: 0.5, h: 0.5, scale: 0.45, hopper: true });
def('armadillo', { name: 'Tatou', hp: 12, w: 0.7, h: 0.65, scale: 0.55 });
def('sniffer', { name: 'Renifleur', hp: 14, w: 1.9, h: 1.75, speed: 0.1, scale: 2.2 });
def('allay', { name: 'Allay', hp: 20, w: 0.35, h: 0.6, scale: 0.4, kind: 'bat' });
def('wolf', { name: 'Loup', hp: 8, w: 0.6, h: 0.85, speed: 0.3, model: 'wolf', kind: 'wolf', dmg: 4, drops: [], xp: 1 });
def('iron_golem', { name: 'Golem de fer', hp: 100, w: 1.4, h: 2.7, speed: 0.25, model: 'iron_golem', kind: 'golem', dmg: 10, kb: 1, drops: [['iron_ingot', 3, 5], ['poppy', 0, 2]], mass: 10, fallImmune: true });
def('snow_golem', { name: 'Golem de neige', hp: 4, w: 0.7, h: 1.9, speed: 0.2, model: 'snow_golem', kind: 'snow_golem', drops: [['snowball', 0, 15]] });
def('squid', { name: 'Poulpe', hp: 10, w: 0.8, h: 0.8, model: 'squid', kind: 'water', drops: [['ink_sac', 1, 3]], xp: 1 });
def('glow_squid', { name: 'Poulpe luisant', hp: 10, w: 0.8, h: 0.8, model: 'glow_squid', kind: 'water', drops: [['glow_ink_sac', 1, 3]], xp: 1, glow: 0.6 });
def('cod', { name: 'Morue', hp: 3, w: 0.5, h: 0.3, model: 'cod', kind: 'water', drops: [['cod', 1, 1], ['bone_meal', 0, 1]], xp: 1 });
def('dolphin', { name: 'Dauphin', hp: 10, w: 0.9, h: 0.6, model: 'dolphin', kind: 'water', speed: 0.6, drops: [['cod', 0, 1]] });
def('bat', { name: 'Chauve-souris', hp: 6, w: 0.5, h: 0.9, model: 'bat', kind: 'bat', scale: 0.35 });
def('strider', { name: 'Arpenteur', hp: 20, w: 0.9, h: 1.7, speed: 0.17, model: 'strider', fireImmune: true, lavaWalker: true, drops: [['string', 2, 5]] });
// hostiles
const undead = { undead: true, burns: true };
def('zombie', { name: 'Zombie', model: 'zombie', kind: 'melee', hostile: true, speed: 0.23, dmg: 3, xp: 5, drops: [['rotten_flesh', 0, 2]], rare: [['iron_ingot', 0.025], ['carrot', 0.025], ['potato', 0.025]], armsUp: true, ...undead, h: 1.95 });
def('husk', { ...D.zombie, type: 'husk', name: 'Zombie momifié', model: 'husk', burns: false, effect: ['hunger', 140] });
def('drowned', { ...D.zombie, type: 'drowned', name: 'Noyé', model: 'drowned', swim: true, rare: [['copper_ingot', 0.11], ['trident', 0.02]] });
def('zombie_villager', { ...D.zombie, type: 'zombie_villager', name: 'Zombie villageois', model: 'zombie' });
def('skeleton', { name: 'Squelette', model: 'skeleton', kind: 'ranged', hostile: true, speed: 0.25, dmg: 2, xp: 5, drops: [['bone', 0, 2], ['arrow', 0, 2]], held: 'bow', ...undead, h: 1.99 });
def('stray', { ...D.skeleton, type: 'stray', name: 'Vagabond', model: 'stray', arrowEffect: 'slowness' });
def('wither_skeleton', { name: 'Wither squelette', model: 'wither_skeleton', kind: 'melee', hostile: true, speed: 0.25, dmg: 8, xp: 5, scale: 1.2, h: 2.4, w: 0.7, drops: [['coal', 0, 1], ['bone', 0, 2]], rare: [['wither_skeleton_skull', 0.06]], held: 'stone_sword', fireImmune: true, effect: ['wither', 200], undead: true });
def('creeper', { name: 'Creeper', model: 'creeper', kind: 'creeper', hostile: true, speed: 0.25, xp: 5, h: 1.7, drops: [['gunpowder', 0, 2]] });
def('spider', { name: 'Araignée', model: 'spider', kind: 'melee', hostile: true, neutralDay: true, speed: 0.3, dmg: 2, xp: 5, w: 1.4, h: 0.9, drops: [['string', 0, 2]], rare: [['spider_eye', 0.33]], climbs: true });
def('cave_spider', { ...D.spider, type: 'cave_spider', name: 'Araignée venimeuse', model: 'cave_spider', hp: 12, w: 0.7, h: 0.5, scale: 0.7, effect: ['poison', 140] });
def('enderman', { name: 'Enderman', model: 'enderman', kind: 'enderman', hostile: false, neutral: true, hp: 40, speed: 0.3, dmg: 7, xp: 5, h: 2.9, drops: [['ender_pearl', 0, 1]] });
def('slime', { name: 'Slime', model: 'slime', kind: 'slime', hostile: true, hp: 16, w: 2.04, h: 2.04, dmg: 4, xp: 4, drops: [], size: 4 });
def('magma_cube', { name: 'Cube de magma', model: 'magma_cube', kind: 'slime', hostile: true, hp: 16, w: 2.04, h: 2.04, dmg: 6, xp: 4, drops: [['magma_cream', 0, 1]], size: 4, fireImmune: true });
def('witch', { name: 'Sorcière', model: 'witch', kind: 'ranged', hostile: true, hp: 26, speed: 0.25, xp: 5, drops: [['glass_bottle', 0, 2], ['glowstone_dust', 0, 2], ['redstone', 0, 2], ['sugar', 0, 2], ['spider_eye', 0, 1]], projectile: 'potion' });
def('pillager', { name: 'Pillard', model: 'pillager', kind: 'ranged', hostile: true, hp: 24, speed: 0.3, xp: 5, drops: [['arrow', 0, 2]], held: 'crossbow' });
def('vindicator', { name: 'Vindicateur', model: 'pillager', kind: 'melee', hostile: true, hp: 24, speed: 0.35, dmg: 13, xp: 5, held: 'iron_axe', drops: [['emerald', 0, 1]] });
def('evoker', { name: 'Évocateur', model: 'pillager', kind: 'ranged', hostile: true, hp: 24, speed: 0.3, xp: 10, drops: [['totem_of_undying', 1, 1], ['emerald', 0, 1]], projectile: 'potion' });
def('ravager', { name: 'Ravageur', kind: 'melee', hostile: true, hp: 100, w: 1.95, h: 2.2, speed: 0.3, dmg: 12, xp: 20, scale: 2.4, kb: 1.2, mass: 8 });
def('vex', { name: 'Vex', kind: 'ghast', hostile: true, hp: 14, w: 0.4, h: 0.8, dmg: 9, scale: 0.4, xp: 3 });
def('silverfish', { name: 'Poisson d\'argent', model: 'silverfish', kind: 'melee', hostile: true, hp: 8, w: 0.4, h: 0.3, dmg: 1, speed: 0.25, xp: 5 });
def('endermite', { name: 'Endermite', model: 'endermite', kind: 'melee', hostile: true, hp: 8, w: 0.4, h: 0.3, dmg: 2, speed: 0.25, xp: 3 });
def('phantom', { name: 'Phantom', kind: 'ghast', hostile: true, hp: 20, w: 0.9, h: 0.5, dmg: 6, scale: 0.9, drops: [['phantom_membrane', 0, 1]], xp: 5, undead: true, burns: true, swoop: true });
def('guardian', { name: 'Gardien', kind: 'water', hostile: true, hp: 30, w: 0.85, h: 0.85, dmg: 6, xp: 10, scale: 0.9, drops: [['prismarine_shard', 0, 2], ['cod', 0, 1]] });
def('elder_guardian', { name: 'Gardien ancien', kind: 'water', hostile: true, hp: 80, w: 2, h: 2, dmg: 8, xp: 10, scale: 2, drops: [['prismarine_shard', 2, 5], ['prismarine_crystals', 1, 3]] });
def('shulker', { name: 'Shulker', model: 'shulker', kind: 'shulker', hostile: true, hp: 30, w: 1, h: 1, xp: 5, drops: [['shulker_shell', 0, 1]], immobile: true });
def('breeze', { name: 'Breeze', kind: 'blaze', hostile: true, hp: 30, w: 0.6, h: 1.77, xp: 10, scale: 0.9, projectile: 'snowball' });
// Nether
def('ghast', { name: 'Ghast', model: 'ghast', kind: 'ghast', hostile: true, hp: 10, w: 4, h: 4, scale: 4, xp: 5, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]], fireImmune: true, fly: true });
def('blaze', { name: 'Blaze', model: 'blaze', kind: 'blaze', hostile: true, hp: 20, w: 0.6, h: 1.8, xp: 10, drops: [['blaze_rod', 0, 1]], fireImmune: true, fly: true, glow: 0.5 });
def('zombified_piglin', { name: 'Piglin zombifié', model: 'zombified_piglin', kind: 'melee', neutral: true, hostile: false, speed: 0.23, dmg: 8, xp: 5, held: 'golden_sword', drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1]], rare: [['gold_ingot', 0.025]], fireImmune: true, undead: true, group: true });
def('piglin', { name: 'Piglin', model: 'piglin', kind: 'melee', neutral: true, hostile: false, hp: 16, speed: 0.35, dmg: 5, xp: 5, held: 'golden_sword', drops: [], piglin: true });
def('hoglin', { name: 'Hoglin', model: 'hoglin', kind: 'melee', hostile: true, hp: 40, w: 1.4, h: 1.4, speed: 0.3, dmg: 6, xp: 5, kb: 1, drops: [['porkchop', 2, 4], ['leather', 0, 1]], quad: true });
def('zoglin', { ...D.hoglin, type: 'zoglin', name: 'Zoglin', model: 'zoglin', undead: true });
// boss
def('wither', { name: 'Wither', boss: true, hp: 300 });
def('ender_dragon', { name: 'Dragon de l\'Ender', boss: true, hp: 200 });
def('warden', { name: 'Warden', boss: true, hp: 500 });
export const MOB_DEFS = D;

// ------------------------------------------------------------------ MODÈLES
const templates = new Map();
function modelSpec(type, d, opts) {
  switch (d.model) {
    case 'cave_spider': return MODELS.spider(true);
    case 'spider': return MODELS.spider(false);
    case 'mooshroom': return MODELS.cow(true);
    case 'sheep': return MODELS.sheep(opts.color || '#e8e8e8', opts.sheared);
    case 'magma_cube': return MODELS.slime(true);
    case 'glow_squid': return MODELS.squid(true);
    case 'endermite': return MODELS.silverfish(true);
    case 'zoglin': return MODELS.hoglin(true);
    case 'wolf': return MODELS.wolf(opts.tamed);
    case 'horse': return MODELS.horse(opts.color || '#8a5a32');
  }
  if (d.model && MODELS[d.model]) return MODELS[d.model]();
  const egg = SPAWN_EGGS.find((e) => e[0] === type) || ['', '', '#888888', '#444444'];
  return genericQuadruped(egg[2], egg[3]);
}
function instantiate(type, d, opts) {
  const key = type + '|' + (opts.color || '') + (opts.sheared ? 's' : '') + (opts.tamed ? 't' : '');
  let t = templates.get(key);
  if (!t) { t = buildModel(modelSpec(type, d, opts), { scale: 1, glow: d.glow || 0, transparent: false }); templates.set(key, t); }
  const root = t.root.clone(true);
  const mat = entityMaterial(t.tex, { glow: d.glow || 0 });
  const parts = {};
  root.traverse((o) => { if (o.isMesh) o.material = mat; if (o.name) parts[o.name] = o; });
  for (const p of Object.values(parts)) p.userData.baseRot = p.rotation.clone();
  return { root, parts, mat };
}

// ================================================================== CRÉATURE
export class Mob extends Entity {
  constructor(game, type, d, opts = {}) {
    super(game, 'mob');
    this.mobType = type; this.def = d;
    this.hostile = !!d.hostile; this.neutral = !!d.neutral;
    this.maxHealth = this.health = d.hp;
    this.w = d.w; this.h = d.h; this.eyeHeight = d.h * 0.85;
    this.hittable = true; this.pushable = !d.immobile;
    this.fireImmune = !!d.fireImmune; this.fallImmune = !!d.fallImmune || !!d.fly;
    this.mass = d.mass || 1;
    this.knockbackResist = d.mass > 5 ? 0.8 : 0;
    this.baby = !!opts.baby;
    this.scale = (d.scale || 1) * (this.baby ? 0.5 : 1);
    if (this.baby) { this.w *= 0.5; this.h *= 0.5; this.eyeHeight *= 0.5; this.growTicks = 24000; }
    this.size = d.size ? (opts.size || [1, 2, 4][Math.floor(Math.random() * 3)]) : 0;
    if (this.size) { this.w = this.h = 0.51 * this.size; this.maxHealth = this.health = this.size * this.size; this.scale = this.size * 0.5; }
    this.color = opts.color || (type === 'sheep' ? this.randomWool() : null);
    this.sheared = false;
    this.tamed = false; this.owner = null; this.sitting = false;
    this.target = null; this.path = null; this.pathIdx = 0; this.pathTimer = 0;
    this.wanderT = null; this.attackCd = 0; this.panic = 0; this.love = 0; this.breedCd = 0;
    this.fwd = 0; this.wantJump = false; this.headYaw = 0; this.headPitch = 0;
    this.fuse = 0; this.angry = 0; this.shootCd = 40 + Math.floor(Math.random() * 40);
    this.home = null;
    this.idleSound = 100 + Math.floor(Math.random() * 300);
    this.persistent = !this.hostile || opts.persistent;
    this.stepHeight = 0.6;
    this.makeModel(opts);
  }
  randomWool() {
    const r = Math.random();
    return r < 0.82 ? '#e8e8e8' : r < 0.87 ? '#7a7a7a' : r < 0.92 ? '#3a3a3a' : r < 0.97 ? '#5a3a20' : r < 0.998 ? '#bdbdb5' : '#f0a0c0';
  }
  makeModel() {
    const m = instantiate(this.mobType, this.def, { color: this.color, sheared: this.sheared, tamed: this.tamed });
    this.model = m.root; this.parts = m.parts; this.mat = m.mat;
    this.model.scale.setScalar(this.scale);
    // objet tenu
    const held = this.def.held;
    if (held && this.parts.rightArm && ITEM[held] !== undefined) {
      const im = itemMesh(ITEM[held]);
      im.scale.setScalar(10);
      im.position.set(1, -10, -2);
      im.rotation.set(0, Math.PI / 2, -0.6);
      this.parts.rightArm.add(im);
    }
  }
  rebuildModel() {
    const scene = this.game.pipeline.entityScene;
    scene.remove(this.model);
    this.makeModel();
    scene.add(this.model);
  }

  // ---------------------------------------------------------- AIDES IA
  get player() { return this.game.player; }
  canTargetPlayer(range) {
    const p = this.player;
    if (p.dead || p.creative || p.spectator) return false;
    const d2 = this.dist2(p);
    if (d2 > range * range) return false;
    return d2 < 9 || canSee(this.world, this.x, this.y + this.eyeHeight, this.z, p.x, p.y + p.eyeHeight, p.z);
  }
  lookAt(x, y, z, speed = 0.3) {
    const dx = x - this.x, dz = z - this.z;
    const tyaw = Math.atan2(-dx, -dz);
    this.headYaw = angleLerp(this.headYaw, tyaw, 0.5);
    this.headPitch = Math.atan2(y - (this.y + this.eyeHeight), Math.hypot(dx, dz));
    return tyaw;
  }
  turnTo(yaw, rate = 0.35) { this.yaw = angleLerp(this.yaw, yaw, rate); }
  moveTo(x, y, z, speedMul = 1) {
    this.pathTimer--;
    const tx = Math.floor(x), ty = Math.floor(y), tz = Math.floor(z);
    if (!this.path || this.pathTimer <= 0 || this.pathGoal !== tx + ',' + ty + ',' + tz) {
      this.pathTimer = 20 + Math.floor(Math.random() * 20);
      this.pathGoal = tx + ',' + ty + ',' + tz;
      const d = Math.hypot(x - this.x, z - this.z);
      if (d < 48 && !this.def.fly) {
        this.path = findPath(this.world, Math.floor(this.x), Math.floor(this.y + 0.01), Math.floor(this.z), tx, ty, tz, { height: Math.ceil(this.h), maxNodes: 250 });
        this.pathIdx = 1;
      } else this.path = null;
    }
    let gx = x, gy = y, gz = z;
    if (this.path && this.pathIdx < this.path.length) {
      const n = this.path[this.pathIdx];
      gx = n[0] + 0.5; gy = n[1]; gz = n[2] + 0.5;
      if (Math.hypot(gx - this.x, gz - this.z) < 0.45 + this.w * 0.3 && Math.abs(gy - this.y) < 1.2) this.pathIdx++;
      if (gy > this.y + 0.5 && this.onGround) this.wantJump = true;
    }
    const dx = gx - this.x, dz = gz - this.z;
    if (Math.hypot(dx, dz) > 0.2) {
      this.turnTo(Math.atan2(-dx, -dz), 0.4);
      this.fwd = speedMul;
    } else this.fwd = 0;
  }
  wander(chance = 0.008, range = 10, speedMul = 0.6) {
    if (!this.wanderT || Math.random() < 0.002) {
      if (Math.random() < chance) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * range;
        let tx = this.x + Math.cos(a) * r, tz = this.z + Math.sin(a) * r;
        if (this.home && Math.hypot(tx - this.home[0], tz - this.home[2]) > 24) { tx = this.home[0] + (Math.random() - 0.5) * 16; tz = this.home[2] + (Math.random() - 0.5) * 16; }
        const ty = this.world.getSurfaceY(Math.floor(tx), Math.floor(tz)) + 1;
        if (Math.abs(ty - this.y) < 6) this.wanderT = [tx, ty, tz];
      }
    }
    if (this.wanderT) {
      this.moveTo(this.wanderT[0], this.wanderT[1], this.wanderT[2], speedMul);
      if (Math.hypot(this.wanderT[0] - this.x, this.wanderT[2] - this.z) < 1 || (this.hcol && Math.random() < 0.05)) { this.wanderT = null; this.fwd = 0; }
    } else this.fwd = 0;
  }
  meleeReach(t) { const r = this.w * 2 * 0.7 + t.w * 0.5 + 0.6; return this.dist2(t) < r * r && Math.abs(t.y - this.y) < 2.5; }
  doMelee(t) {
    if (this.attackCd > 0 || !this.meleeReach(t)) return;
    this.attackCd = 20;
    this.swingT = 0;
    const dmg = this.def.dmg * (this.mobType === 'iron_golem' ? 0.7 + Math.random() * 1.0 : 1);
    if (t.damage(dmg, { type: 'mob', attacker: this, knock: this.def.kb || 0.4 })) {
      if (this.def.effect && t.addEffect) t.addEffect(this.def.effect[0], this.def.effect[1], 0);
      if (this.mobType === 'iron_golem') t.vy += 0.6;
      if (this.fire > 0 && Math.random() < 0.3) t.fire = 80;
      if (t !== this.player) t.knockback(t.x - this.x, t.z - this.z, this.def.kb || 0.4);
    }
  }
  isDay() { return this.game.dim === 0 && !this.game.isNight(); }

  // ------------------------------------------------------------ IA
  ai() {
    const d = this.def, g = this.game, p = this.player;
    if (this.attackCd > 0) this.attackCd--;
    this.fwd = 0; this.wantJump = false;
    if (this.panic > 0) {
      this.panic--;
      if (!this.wanderT || Math.random() < 0.1) { const a = Math.random() * Math.PI * 2; this.wanderT = [this.x + Math.cos(a) * 8, this.y, this.z + Math.sin(a) * 8]; }
      this.moveTo(this.wanderT[0], this.wanderT[1], this.wanderT[2], 1.6);
      return;
    }
    switch (d.kind) {
      case 'passive': this.aiPassive(); break;
      case 'neutral': this.aiNeutral(); break;
      case 'melee': this.aiMelee(); break;
      case 'ranged': this.aiRanged(); break;
      case 'creeper': this.aiCreeper(); break;
      case 'enderman': this.aiEnderman(); break;
      case 'slime': this.aiSlime(); break;
      case 'ghast': this.aiGhast(); break;
      case 'blaze': this.aiBlaze(); break;
      case 'water': this.aiWater(); break;
      case 'bat': this.aiBat(); break;
      case 'golem': this.aiGolem(); break;
      case 'snow_golem': this.aiGolem(true); break;
      case 'wolf': this.aiWolf(); break;
      case 'shulker': this.aiShulker(); break;
    }
    // flotter dans l'eau
    if (this.inWater && !d.swim && d.kind !== 'water' && Math.random() < 0.8) this.wantJump = true;
    if (this.inLava && !d.lavaWalker && Math.random() < 0.8) this.wantJump = true;
    // sons d'ambiance
    if (--this.idleSound <= 0) { this.idleSound = 200 + Math.floor(Math.random() * 400); g.audio.mob(this.mobType, 'say', this.x, this.y + this.eyeHeight, this.z); }
  }

  aiPassive() {
    const p = this.player, d = this.def;
    // tentation par la nourriture
    const held = p.held;
    if (d.food && held && d.food.includes(held.def.key) && this.dist2(p) < 100 && !p.dead) {
      this.lookAt(p.x, p.y + 1.5, p.z);
      if (this.dist2(p) > 6) this.moveTo(p.x, p.y, p.z, 0.9);
      return;
    }
    // reproduction
    if (this.love > 0) {
      this.love--;
      if (this.age % 10 === 0) this.game.particles.hearts(this.x, this.y + this.h, this.z);
      const mate = this.game.entities.list.find((e) => e !== this && e.mobType === this.mobType && e.love > 0 && !e.baby && e.dist2(this) < 64);
      if (mate) {
        this.moveTo(mate.x, mate.y, mate.z, 0.8);
        if (this.dist2(mate) < 3) {
          this.love = 0; mate.love = 0; this.breedCd = mate.breedCd = 6000;
          const b = this.game.spawnMob(this.mobType, this.x, this.y, this.z, { baby: true });
          if (b && this.color) { b.color = this.color; b.rebuildModel(); }
          this.game.spawnXP(this.x, this.y, this.z, 1 + Math.floor(Math.random() * 7));
        }
        return;
      }
    }
    // mouton : brouter l'herbe
    if (this.mobType === 'sheep' && this.sheared && Math.random() < 0.002) {
      const bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
      if (this.world.getBlock(bx, by, bz) === K.grass_block) { this.world.setBlock(bx, by, bz, K.dirt); this.sheared = false; this.rebuildModel(); this.eatT = 40; }
    }
    // poule : pond des œufs
    if (this.mobType === 'chicken' && !this.baby && Math.random() < 1 / 6000) { this.game.dropItem(new ItemStack(ITEM.egg, 1), this.x, this.y + 0.3, this.z); this.game.audio.play('pop', this.x, this.y, this.z); }
    if (this.def.villager) {
      // les villageois fuient les zombies
      const z = this.game.entities.list.find((e) => e.mobType && (e.mobType === 'zombie' || e.mobType === 'husk') && !e.dead && e.dist2(this) < 64);
      if (z) { const dx = this.x - z.x, dz = this.z - z.z, l = Math.hypot(dx, dz) || 1; this.moveTo(this.x + dx / l * 6, this.y, this.z + dz / l * 6, 1.4); return; }
      if (this.dist2(p) < 16 && Math.random() < 0.05) this.lookAt(p.x, p.y + 1.6, p.z);
    }
    this.wander(0.01, 10, this.def.villager ? 0.5 : 0.6);
    if (this.dist2(p) < 36 && Math.random() < 0.02) this.lookAt(p.x, p.y + 1.6, p.z);
  }

  aiNeutral() {
    if (this.angry > 0 && this.target && !this.target.dead) { this.angry--; this.chase(this.target, 1.1); return; }
    this.aiPassive();
  }

  chase(t, speed = 1) {
    this.lookAt(t.x, t.y + (t.eyeHeight || 1), t.z);
    this.moveTo(t.x, t.y, t.z, speed);
    this.doMelee(t);
    if (this.def.climbs && this.hcol) this.vy = 0.2;
  }

  aiMelee() {
    const d = this.def, p = this.player;
    let hostileNow = this.hostile && !(d.neutralDay && this.isDay() && this.world.getSkyLight(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z)) > 10);
    if (this.neutral) hostileNow = this.angry > 0;
    if (d.piglin && p && !this.angry) {
      const goldArmor = p.armor.some((a) => a && a.def.key && a.def.key.startsWith('golden_'));
      hostileNow = !goldArmor && this.dist2(p) < 64 && this.game.dim === 1;
    }
    if (this.target && (this.target.dead || this.target.removed)) this.target = null;
    if (hostileNow && !this.target && this.canTargetPlayer(this.neutral ? 32 : 24)) this.target = p;
    if (this.target && this.target === p && (p.creative || p.spectator || p.dead)) this.target = null;
    if (this.target && this.dist2(this.target) > 40 * 40) this.target = null;
    if (this.target && (hostileNow || this.angry > 0)) {
      if (this.angry > 0) this.angry--;
      this.chase(this.target, d.type === 'zombie' && this.baby ? 1.5 : 1.15);
    } else this.wander(0.008, 8, 0.5);
  }

  aiRanged() {
    const d = this.def, p = this.player;
    if (!this.target && this.canTargetPlayer(20)) this.target = p;
    if (this.target && (this.target.dead || (this.target === p && (p.creative || p.spectator)))) this.target = null;
    if (!this.target) { this.wander(0.008, 8, 0.5); return; }
    const t = this.target;
    const dist = Math.sqrt(this.dist2(t));
    const yaw = this.lookAt(t.x, t.y + 1.2, t.z);
    this.turnTo(yaw, 0.5);
    const see = canSee(this.world, this.x, this.y + this.eyeHeight, this.z, t.x, t.y + 1.5, t.z);
    if (dist > 14 || !see) this.moveTo(t.x, t.y, t.z, 1);
    else if (dist < 6) { this.fwd = -0.8; }
    else { this.fwd = 0; this.strafe = Math.sin(this.age * 0.05) * 0.6; }
    if (see && dist < 18 && --this.shootCd <= 0) {
      this.shootCd = d.type === 'witch' ? 60 : 30 + Math.floor(Math.random() * 20);
      this.aiming = 10;
      const sx = this.x, sy = this.y + this.eyeHeight - 0.1, sz = this.z;
      const tx = t.x - sx, ty = t.y + t.h * 0.33 - sy, tz = t.z - sz;
      const hd = Math.hypot(tx, tz);
      const dir = [tx, ty + hd * 0.2, tz];
      const l = Math.hypot(...dir);
      const inacc = 0.08;
      const v = dir.map((c) => c / l + (Math.random() - 0.5) * inacc);
      if (d.projectile === 'potion') {
        const pr = this.game.shoot('snowball', this, sx, sy, sz, v, 0.75);
        pr.potionHarm = true;
        pr.onHitEntity = (e) => { e.damage(4, { type: 'magic', attacker: this }); this.game.particles.burst(pr.x, pr.y, pr.z, 0x6a2a8a, 12); pr.removed = true; };
      } else {
        const a = this.game.shoot('arrow', this, sx, sy, sz, v, 1.6);
        a.damageBase = 2;
        if (d.arrowEffect) { const orig = a.onHitEntity.bind(a); a.onHitEntity = (e) => { orig(e); if (e.addEffect) e.addEffect('slowness', 600, 0); }; }
        this.game.audio.play('bow', sx, sy, sz);
      }
    }
  }

  aiCreeper() {
    const p = this.player;
    if (!this.target && this.canTargetPlayer(16)) this.target = p;
    if (this.target && (this.target.dead || p.creative || p.spectator)) { this.target = null; }
    if (!this.target) { this.wander(0.008, 8, 0.5); this.fuse = Math.max(0, this.fuse - 1); return; }
    const d = Math.sqrt(this.dist2(this.target));
    this.lookAt(this.target.x, this.target.y + 1.5, this.target.z);
    if (d < 3 || (this.fuse > 0 && d < 7)) {
      if (this.fuse === 0) this.game.audio.play('creeper_hiss', this.x, this.y, this.z);
      this.fuse++;
      this.fwd = 0;
      if (this.fuse >= 30) {
        this.removed = true; this.dead = true;
        this.game.explode(this.x, this.y + 0.5, this.z, this.charged ? 6 : 3, { source: this, attacker: this });
      }
    } else {
      this.fuse = Math.max(0, this.fuse - 1);
      this.moveTo(this.target.x, this.target.y, this.target.z, 1);
    }
  }

  aiEnderman() {
    const p = this.player, g = this.game;
    // regardé par le joueur ?
    if (!this.angry && !p.dead && !p.creative && this.dist2(p) < 64 * 64) {
      const ld = p.lookDir();
      const hx = this.x - p.x, hy = this.y + 2.6 - (p.y + p.eyeHeight), hz = this.z - p.z;
      const l = Math.hypot(hx, hy, hz);
      const dot = (ld[0] * hx + ld[1] * hy + ld[2] * hz) / l;
      const helmet = p.armor[0] && p.armor[0].id === K.carved_pumpkin;
      if (dot > 1 - 0.025 / l * 3 && !helmet && canSee(this.world, p.x, p.y + p.eyeHeight, p.z, this.x, this.y + 2.6, this.z)) {
        this.angry = 600; this.target = p; g.audio.play('enderman_scream', this.x, this.y, this.z);
      }
    }
    // eau et pluie
    if (this.inWater || (g.weather.rain > 0.5 && g.dim === 0 && this.world.getSkyLight(Math.floor(this.x), Math.floor(this.y + 2), Math.floor(this.z)) >= 15)) {
      if (this.age % 10 === 0) this.damage(1, { type: 'drown' });
      this.teleport();
    }
    if (this.angry > 0 && this.target && !this.target.dead) {
      this.angry--;
      this.chase(this.target, 1.3);
      if (this.dist2(this.target) > 256 && Math.random() < 0.05) this.teleportNear(this.target);
    } else {
      this.wander(0.006, 10, 0.5);
      if (Math.random() < 0.001) this.teleport();
    }
  }
  teleport() {
    for (let i = 0; i < 16; i++) {
      const x = this.x + (Math.random() - 0.5) * 64, z = this.z + (Math.random() - 0.5) * 64;
      if (this.tryTeleport(x, this.y + (Math.random() - 0.5) * 32, z)) return true;
    }
    return false;
  }
  teleportNear(t) { for (let i = 0; i < 16; i++) if (this.tryTeleport(t.x + (Math.random() - 0.5) * 8, t.y, t.z + (Math.random() - 0.5) * 8)) return; }
  tryTeleport(x, y, z) {
    const w = this.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = Math.min(HEIGHT - 4, Math.floor(y) + 8); yy > Math.max(1, y - 16); yy--) {
      if (B_SOLID[w.getBlock(bx, yy - 1, bz)] && !B_SOLID[w.getBlock(bx, yy, bz)] && !B_SOLID[w.getBlock(bx, yy + 1, bz)] && !B_SOLID[w.getBlock(bx, yy + 2, bz)] && !B_FLUID[w.getBlock(bx, yy, bz)]) {
        this.game.particles.portal(this.x, this.y + 1.5, this.z, 20);
        this.setPos(bx + 0.5, yy, bz + 0.5);
        this.game.particles.portal(this.x, this.y + 1.5, this.z, 20);
        this.game.audio.play('teleport', this.x, this.y, this.z);
        return true;
      }
    }
    return false;
  }

  aiSlime() {
    const p = this.player;
    if (!this.target && this.canTargetPlayer(16)) this.target = p;
    if (this.target && (this.target.dead || p.creative || p.spectator)) this.target = null;
    this.jumpDelay = (this.jumpDelay ?? 20) - 1;
    if (this.target) this.turnTo(this.lookAt(this.target.x, this.target.y, this.target.z), 0.3);
    else if (Math.random() < 0.02) this.yaw += (Math.random() - 0.5) * 2;
    if (this.onGround && this.jumpDelay <= 0) {
      this.jumpDelay = this.target ? 10 + Math.floor(Math.random() * 10) : 30 + Math.floor(Math.random() * 40);
      this.vy = 0.42 + this.size * 0.05;
      const sp = 0.25 + this.size * 0.05;
      this.vx = -Math.sin(this.yaw) * sp; this.vz = -Math.cos(this.yaw) * sp;
      this.squish = 1;
      this.game.audio.mob(this.mobType, 'jump', this.x, this.y, this.z);
    }
    if (!this.onGround) this.fwd = 0.5;
    if (this.target && this.size > 1 && this.dist2(this.target) < (this.w * 0.6 + 0.6) ** 2 + 0.5) {
      if (this.attackCd <= 0) { this.attackCd = 20; this.target.damage(this.def.dmg * this.size / 4, { type: 'mob', attacker: this }); }
    }
  }

  aiGhast() {
    const p = this.player, d = this.def;
    this.noGravity = true;
    if (!this.target && this.canTargetPlayer(64)) this.target = p;
    if (this.target && (this.target.dead || p.creative || p.spectator)) this.target = null;
    if (!this.flyT || Math.random() < 0.01 || Math.hypot(this.flyT[0] - this.x, this.flyT[1] - this.y, this.flyT[2] - this.z) < 2) {
      const base = this.target && d.type !== 'ghast' ? [this.target.x, this.target.y + 1, this.target.z] : [this.x, this.y, this.z];
      this.flyT = [base[0] + (Math.random() - 0.5) * 16, base[1] + (Math.random() - 0.5) * 8, base[2] + (Math.random() - 0.5) * 16];
      if (d.swoop && this.target) this.flyT = [this.target.x, this.target.y + 1, this.target.z];
    }
    const dx = this.flyT[0] - this.x, dy = this.flyT[1] - this.y, dz = this.flyT[2] - this.z, l = Math.hypot(dx, dy, dz) || 1;
    const sp = d.type === 'ghast' ? 0.02 : 0.04;
    this.vx += dx / l * sp; this.vy += dy / l * sp; this.vz += dz / l * sp;
    if (this.target) this.turnTo(this.lookAt(this.target.x, this.target.y + 1, this.target.z), 0.3);
    else this.turnTo(Math.atan2(-this.vx, -this.vz), 0.1);
    if (d.type === 'ghast' && this.target && canSee(this.world, this.x, this.y + 2, this.z, this.target.x, this.target.y + 1, this.target.z)) {
      this.shootCd--;
      this.charging = this.shootCd < 10;
      if (this.shootCd === 10) this.game.audio.play('ghast_warn', this.x, this.y, this.z);
      if (this.shootCd <= 0) {
        this.shootCd = 60;
        const ld = [this.target.x - this.x, this.target.y + 1 - (this.y + 2), this.target.z - this.z];
        const l2 = Math.hypot(...ld);
        const pr = this.game.shoot('fireball', this, this.x + ld[0] / l2 * 2.5, this.y + 2, this.z + ld[2] / l2 * 2.5, ld.map((c) => c / l2), 0.6);
        pr.accel = ld.map((c) => c / l2 * 0.03); pr.power = 1;
        this.game.audio.play('ghast_shoot', this.x, this.y, this.z);
      }
    } else if (this.target && this.meleeReach(this.target)) this.doMelee(this.target);
  }

  aiBlaze() {
    const p = this.player;
    if (!this.target && this.canTargetPlayer(48)) this.target = p;
    if (this.target && (this.target.dead || p.creative || p.spectator)) this.target = null;
    if (this.target) {
      const t = this.target;
      this.turnTo(this.lookAt(t.x, t.y + 1, t.z), 0.4);
      if (this.y < t.y + 2 && this.vy < 0.3) this.vy += (0.3 - this.vy) * 0.3;
      const d = Math.sqrt(this.dist2(t));
      if (d > 8) this.moveTo(t.x, t.y, t.z, 0.8);
      if (--this.shootCd <= 0) {
        this.burst = (this.burst || 0) + 1;
        this.shootCd = this.burst % 4 === 0 ? 100 : 6;
        if (this.burst % 4 !== 0 && canSee(this.world, this.x, this.y + 1.5, this.z, t.x, t.y + 1, t.z)) {
          const ld = [t.x - this.x + (Math.random() - 0.5) * Math.sqrt(d) * 0.5, t.y + 0.5 - (this.y + 1.5), t.z - this.z + (Math.random() - 0.5) * Math.sqrt(d) * 0.5];
          const l = Math.hypot(...ld);
          this.game.shoot(this.def.projectile || 'small_fireball', this, this.x, this.y + 1.5, this.z, ld.map((c) => c / l), 1.0);
          this.game.audio.play('blaze_shoot', this.x, this.y, this.z);
        }
      }
      this.onFire = true;
    } else this.wander(0.006, 6, 0.4);
    if (!this.onGround && this.vy < 0) this.vy *= 0.6;
    if (this.age % 3 === 0) this.game.particles.smoke(this.x + (Math.random() - 0.5) * 0.6, this.y + 0.8 + Math.random(), this.z + (Math.random() - 0.5) * 0.6, 0.5, 0.15);
  }

  aiWater() {
    if (this.inWater) {
      this.noGravity = true;
      if (!this.swimT || Math.random() < 0.02 || this.hcol) { const a = Math.random() * Math.PI * 2; this.swimT = [Math.cos(a), (Math.random() - 0.5) * 0.6, Math.sin(a)]; }
      const sp = (this.def.speed || 0.25) * 0.08;
      this.vx += this.swimT[0] * sp; this.vy += this.swimT[1] * sp; this.vz += this.swimT[2] * sp;
      if (this.eyeInWater === false && this.vy > 0) this.vy = -0.02;
      this.vx *= 0.9; this.vy *= 0.9; this.vz *= 0.9;
      this.turnTo(Math.atan2(-this.vx, -this.vz), 0.2);
      this.dryTicks = 0;
      if (this.hostile && this.canTargetPlayer(16) && this.player.inWater) {
        const t = this.player;
        const dx = t.x - this.x, dy = t.y + 1 - this.y, dz = t.z - this.z, l = Math.hypot(dx, dy, dz);
        this.vx += dx / l * 0.02; this.vy += dy / l * 0.02; this.vz += dz / l * 0.02;
        if (l < 2) this.doMelee(t);
      }
    } else {
      this.noGravity = false;
      this.dryTicks = (this.dryTicks || 0) + 1;
      if (this.onGround && Math.random() < 0.1) { this.vy = 0.3; this.vx = (Math.random() - 0.5) * 0.2; this.vz = (Math.random() - 0.5) * 0.2; }
      if (this.dryTicks > 300 && this.age % 20 === 0) this.damage(1, { type: 'drown' });
    }
    this.canBreatheUnderwater = true;
  }

  aiBat() {
    this.noGravity = true;
    if (!this.flyT || Math.random() < 0.03) this.flyT = [this.x + (Math.random() - 0.5) * 8, this.y + (Math.random() - 0.4) * 4, this.z + (Math.random() - 0.5) * 8];
    const dx = this.flyT[0] - this.x, dy = this.flyT[1] - this.y, dz = this.flyT[2] - this.z, l = Math.hypot(dx, dy, dz) || 1;
    this.vx += (dx / l * 0.3 - this.vx) * 0.1; this.vy += (dy / l * 0.3 - this.vy) * 0.1; this.vz += (dz / l * 0.3 - this.vz) * 0.1;
    this.turnTo(Math.atan2(-this.vx, -this.vz), 0.3);
  }

  aiGolem(snow) {
    const g = this.game;
    if (!this.target || this.target.dead || this.target.removed || this.dist2(this.target) > 400) {
      this.target = g.entities.list.find((e) => e.hostile && !e.dead && e.mobType !== 'creeper' && e.dist2(this) < 256) || null;
      if (!this.target && this.angry > 0 && this.lastDamager && !this.lastDamager.dead) this.target = this.lastDamager;
    }
    if (this.target) {
      if (snow) {
        this.turnTo(this.lookAt(this.target.x, this.target.y + 1, this.target.z), 0.5);
        if (--this.shootCd <= 0) { this.shootCd = 20; const t = this.target; const ld = [t.x - this.x, t.y + 1 - (this.y + 1.6), t.z - this.z]; const l = Math.hypot(...ld); ld[1] += l * 0.15; const l2 = Math.hypot(...ld); g.shoot('snowball', this, this.x, this.y + 1.6, this.z, ld.map((c) => c / l2), 1.2); }
        if (this.dist2(this.target) > 64) this.moveTo(this.target.x, this.target.y, this.target.z, 0.8);
      } else this.chase(this.target, 1.0);
    } else this.wander(0.005, 10, 0.4);
    if (snow && this.game.dim === 0 && !this.inWater) {
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      if (this.world.getBlock(bx, by, bz) === 0 && B_SOLID[this.world.getBlock(bx, by - 1, bz)] && BLOCKS[this.world.getBlock(bx, by - 1, bz)].opaque) this.world.setBlock(bx, by, bz, K.snow);
    }
  }

  aiWolf() {
    const p = this.player;
    if (this.tamed) {
      if (this.sitting) { this.fwd = 0; return; }
      if (this.target && !this.target.dead && this.target !== p) { this.chase(this.target, 1.2); return; }
      this.target = null;
      const d2 = this.dist2(p);
      if (d2 > 144 && p.onGround) { this.setPos(p.x + (Math.random() - 0.5) * 2, p.y, p.z + (Math.random() - 0.5) * 2); return; }
      if (d2 > 9) this.moveTo(p.x, p.y, p.z, 1.1);
      else this.lookAt(p.x, p.y + 1.6, p.z);
      return;
    }
    if (this.angry > 0 && this.target) { this.angry--; this.chase(this.target, 1.2); return; }
    // chasse les moutons
    if (Math.random() < 0.002) this.target = this.game.entities.list.find((e) => (e.mobType === 'sheep' || e.mobType === 'rabbit') && e.dist2(this) < 100) || null;
    if (this.target && !this.target.dead && this.target.mobType) { this.chase(this.target, 1.0); return; }
    this.wander(0.008, 10, 0.5);
  }

  aiShulker() {
    const p = this.player;
    this.fwd = 0; this.vx = 0; this.vz = 0;
    if (this.canTargetPlayer(16)) {
      this.open = Math.min(1, (this.open || 0) + 0.05);
      if (--this.shootCd <= 0) {
        this.shootCd = 40 + Math.floor(Math.random() * 40);
        const ld = [p.x - this.x, p.y + 1 - (this.y + 0.5), p.z - this.z], l = Math.hypot(...ld);
        const b = this.game.shoot('small_fireball', this, this.x, this.y + 0.6, this.z, ld.map((c) => c / l), 0.4);
        b.onHitEntity = (e) => { e.damage(4, { type: 'mob', attacker: this }); if (e.addEffect) e.addEffect('levitation', 200, 0); b.removed = true; };
        b.onHitBlock = () => { b.removed = true; };
      }
    } else this.open = Math.max(0, (this.open || 0) - 0.05);
    this.arrowImmune = (this.open || 0) < 0.2;
  }

  // --------------------------------------------------------------- TICK
  tick() {
    this.baseTick();
    if (this.dead) {
      this.deathTime++;
      if (this.deathTime >= 20) {
        this.removed = true;
        for (let i = 0; i < 8; i++) this.game.particles.bigSmoke(this.x + (Math.random() - 0.5) * this.w, this.y + Math.random() * this.h, this.z + (Math.random() - 0.5) * this.w);
      }
      this.vx *= 0.8; this.vz *= 0.8;
      this.vy -= 0.08; this.applyMove();
      return;
    }
    if (this.baby && --this.growTicks <= 0) { this.baby = false; this.w = this.def.w; this.h = this.def.h; this.scale = this.def.scale || 1; this.model.scale.setScalar(this.scale); }
    if (this.breedCd > 0) this.breedCd--;
    if (this.swingT !== undefined) this.swingT++;
    if (this.squish) this.squish *= 0.8;
    // brûler au soleil
    if (this.def.burns && this.isDay() && this.game.weather.rain < 0.5 && !this.inWater) {
      const sl = this.world.getSkyLight(Math.floor(this.x), Math.floor(this.y + this.eyeHeight), Math.floor(this.z));
      if (sl >= 15 && Math.random() < 0.05) this.fire = Math.max(this.fire, 160);
    }
    this.strafe = 0;
    if (!this.noAI) this.ai();
    const d = this.def;
    const speed = (d.speed || 0.25) * 0.4 * (this.baby && d.hostile ? 1.5 : 1);
    if (this.noGravity && (d.fly || d.kind === 'water' || d.kind === 'bat')) {
      this.applyMove();
      this.vx *= 0.91; this.vy *= 0.91; this.vz *= 0.91;
    } else {
      if (this.wantJump && this.onGround) this.vy = 0.42;
      else if (this.wantJump && (this.inWater || this.inLava)) this.vy += 0.04;
      else if (this.hcol && this.onGround && this.fwd > 0) this.vy = 0.42;
      if (this.def.slowFall && !this.onGround && this.vy < 0) this.vy *= 0.6;
      if (d.lavaWalker && this.inLava) { this.vy = Math.max(this.vy, 0.05); }
      this.travel(this.strafe || 0, this.fwd, speed, this.wantJump);
    }
    this.bodyYaw = angleLerp(this.bodyYaw, this.yaw, 0.3);
    this.updateLimbs();
    if (!this.fireImmune) this.checkContactDamage();
    // disparition
    if (!this.persistent && this.hostile) {
      const d2 = this.dist2(this.player);
      if (d2 > 128 * 128) this.removed = true;
      else if (d2 > 32 * 32 && Math.random() < 1 / 800) this.removed = true;
    }
    if (this.fire > 0 && this.age % 4 === 0) this.game.particles.flame(this.x + (Math.random() - 0.5) * this.w, this.y + Math.random() * this.h, this.z + (Math.random() - 0.5) * this.w);
  }

  onHurt(amount, src) {
    const g = this.game;
    g.audio.mob(this.mobType, 'hurt', this.x, this.y + this.eyeHeight, this.z);
    const a = src.attacker;
    if (this.def.kind === 'passive' && !this.dead) this.panic = 60;
    if (a && a !== this) {
      if (this.neutral || this.def.kind === 'neutral' || this.def.kind === 'wolf' || this.def.kind === 'golem') { this.angry = 400; this.target = a; }
      if (this.hostile && !this.target) this.target = a;
      if (this.def.group) for (const e of g.entities.list) if (e.mobType === this.mobType && e.dist2(this) < 400) { e.angry = 400; e.target = a; }
      if (this.mobType === 'wolf' && this.tamed) this.angry = 0;
    }
    if (this.mobType === 'enderman' && src.type === 'arrow') { this.teleport(); }
    // les loups apprivoisés défendent le joueur
    if (a === g.player) for (const e of g.entities.list) if (e.mobType === 'wolf' && e.tamed && !e.sitting && e !== this) { e.target = this; }
  }

  onDeath(src) {
    const g = this.game, d = this.def;
    g.audio.mob(this.mobType, 'death', this.x, this.y + this.eyeHeight, this.z);
    const byPlayer = src && (src.attacker === g.player || (src.attacker && src.attacker.owner === g.player) || (this.lastDamager === g.player));
    if (!this.baby) {
      for (const [k, a, b] of d.drops || []) {
        let n = a + Math.floor(Math.random() * (b - a + 1));
        let key = k;
        if (this.fire > 0) key = { porkchop: 'cooked_porkchop', beef: 'cooked_beef', chicken: 'cooked_chicken', mutton: 'cooked_mutton', cod: 'cooked_cod' }[k] || k;
        if (n > 0 && ITEM[key] !== undefined) g.dropItem(new ItemStack(ITEM[key], n), this.x, this.y + 0.5, this.z);
      }
      if (byPlayer) for (const [k, c] of d.rare || []) if (Math.random() < c && ITEM[k] !== undefined) g.dropItem(new ItemStack(ITEM[k], 1), this.x, this.y + 0.5, this.z);
      if (this.mobType === 'sheep' && !this.sheared) g.dropItem(new ItemStack(ITEM[this.woolKey()], 1), this.x, this.y + 0.5, this.z);
      if (byPlayer && d.xp) g.spawnXP(this.x, this.y + 0.5, this.z, d.xp + (d.hostile ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2)));
    }
    // les slimes se divisent
    if (d.kind === 'slime' && this.size > 1) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) g.spawnMob(this.mobType, this.x + (Math.random() - 0.5) * this.w * 0.5, this.y + 0.5, this.z + (Math.random() - 0.5) * this.w * 0.5, { size: this.size / 2 });
    }
    if (d.kind === 'slime' && this.size === 1 && this.mobType === 'slime') g.dropItem(new ItemStack(ITEM.slime_ball, Math.floor(Math.random() * 3)), this.x, this.y, this.z);
    if (g.onMobKilled) g.onMobKilled(this, src);
  }
  woolKey() {
    const map = { '#e8e8e8': 'white_wool', '#7a7a7a': 'gray_wool', '#3a3a3a': 'black_wool', '#5a3a20': 'brown_wool', '#bdbdb5': 'light_gray_wool', '#f0a0c0': 'pink_wool' };
    return map[this.color] || 'white_wool';
  }

  // interaction (clic droit)
  interact(p, held) {
    const g = this.game;
    const key = held ? held.def.key : null;
    const d = this.def;
    if (d.food && key && d.food.includes(key) && !this.baby && this.breedCd === 0 && this.love === 0) {
      this.love = 600; p.consumeHeld(1); g.particles.hearts(this.x, this.y + this.h, this.z); return true;
    }
    if (this.mobType === 'sheep' && key === 'shears' && !this.sheared && !this.baby) {
      this.sheared = true; this.rebuildModel();
      g.dropItem(new ItemStack(ITEM[this.woolKey()], 1 + Math.floor(Math.random() * 3)), this.x, this.y + 1, this.z);
      g.audio.play('shear', this.x, this.y, this.z); p.damageHeld(1); return true;
    }
    if ((this.mobType === 'cow' || this.mobType === 'mooshroom') && key === 'bucket') {
      p.consumeHeld(1); if (p.addItem(new ItemStack(ITEM.milk_bucket, 1)) > 0) g.dropItem(new ItemStack(ITEM.milk_bucket, 1), p.x, p.y, p.z); g.audio.play('milk', this.x, this.y, this.z); return true;
    }
    if (this.mobType === 'mooshroom' && key === 'bowl') { p.consumeHeld(1); p.addItem(new ItemStack(ITEM.mushroom_stew, 1)); return true; }
    if (this.mobType === 'wolf') {
      if (!this.tamed && key === 'bone') {
        p.consumeHeld(1);
        if (Math.random() < 0.33) { this.tamed = true; this.owner = p; this.persistent = true; this.maxHealth = this.health = 20; this.rebuildModel(); g.particles.hearts(this.x, this.y + 1, this.z); g.ui.toast('Loup apprivoisé !'); }
        else for (let i = 0; i < 5; i++) g.particles.smoke(this.x, this.y + 1, this.z, 0.4);
        return true;
      }
      if (this.tamed) { this.sitting = !this.sitting; return true; }
    }
    if (this.def.villager) { g.audio.mob('villager', 'say', this.x, this.y + 1.6, this.z); g.ui.toast('Villageois : « Hmm ! »'); return true; }
    if (this.mobType === 'creeper' && key === 'flint_and_steel') { this.fuse = 25; this.target = p; return true; }
    return false;
  }

  // -------------------------------------------------------------- RENDU
  render(alpha) {
    const [x, y, z] = this.lerp(alpha);
    const m = this.model, P = this.parts;
    m.position.set(x, y, z);
    const by = angleLerp(this.pbodyYaw, this.bodyYaw, alpha);
    m.rotation.set(0, by, 0);
    const t = this.age + alpha;
    const ls = this.limbSwing - this.limbAmp * (1 - alpha), la = this.plimbAmp + (this.limbAmp - this.plimbAmp) * alpha;
    const sw = Math.cos(ls * 0.6662) * 1.4 * la;
    const reset = (p) => { if (p && p.userData.baseRot) p.rotation.copy(p.userData.baseRot); };
    for (const p of Object.values(P)) reset(p);
    const head = P.head;
    if (head) {
      head.rotation.y += angleLerp(0, this.headYaw - by, 1) * 0.8;
      head.rotation.x += -this.headPitch * 0.8;
    }
    if (P.rightLeg) { P.rightLeg.rotation.x += sw; P.leftLeg.rotation.x -= sw; }
    if (P.rightArm) {
      if (this.def.armsUp) { P.rightArm.rotation.x += -Math.PI / 2 + Math.sin(t * 0.07) * 0.05; P.leftArm.rotation.x += -Math.PI / 2 - Math.sin(t * 0.07) * 0.05; }
      else if (this.mobType === 'iron_golem') { P.rightArm.rotation.x += -sw * 0.6; P.leftArm.rotation.x += sw * 0.6; }
      else if (this.aiming > 0 || (this.def.kind === 'ranged' && this.target)) { P.rightArm.rotation.x += -Math.PI / 2; P.leftArm.rotation.x += -Math.PI / 2 + 0.3; P.leftArm.rotation.y += 0.4; }
      else { P.rightArm.rotation.x += -sw * 0.7; P.leftArm.rotation.x += sw * 0.7; }
      if (this.swingT !== undefined && this.swingT < 6) { const s = Math.sin(this.swingT / 6 * Math.PI); P.rightArm.rotation.x -= s * 1.2; if (this.mobType === 'iron_golem') P.leftArm.rotation.x -= s * 1.2; }
      if (this.mobType === 'enderman' && this.angry > 0 && head) { /* mâchoire ouverte */ if (P.jaw) P.jaw.position.y = -1.5; }
    }
    if (P.leg1) {
      const sg = [0, 1, -1, -1, 1];
      for (let i = 1; i <= 4; i++) if (P['leg' + i]) P['leg' + i].rotation.x += sw * sg[i];
    }
    if (P.leg0) { // araignée
      for (let i = 0; i < 8; i++) { const l = P['leg' + i]; if (!l) continue; const ph = (i % 2 ? 1 : -1) * (i < 4 ? 1 : -1); l.rotation.y += Math.cos(ls * 1.3 + i) * 0.4 * la * ph; l.rotation.z += Math.abs(Math.sin(ls * 1.3 + i)) * 0.4 * la * (i < 4 ? 1 : -1); }
    }
    if (P.wingR) { const f = this.onGround ? 0 : Math.sin(t * 1.8) * 0.9; P.wingR.rotation.z += f; P.wingL.rotation.z -= f; if (this.mobType === 'bat') { P.wingR.rotation.y += Math.sin(t * 1.4) * 0.9; P.wingL.rotation.y -= Math.sin(t * 1.4) * 0.9; } }
    if (P.tail) P.tail.rotation.y += Math.sin(t * 0.3) * 0.15 + (this.mobType === 'cod' ? Math.sin(t * 0.8) * 0.4 : 0);
    if (P.t0) for (let i = 0; i < 9; i++) { const tt = P['t' + i]; if (tt) tt.rotation.x += Math.sin(t * 0.15 + i) * 0.3 + (this.mobType.includes('squid') ? Math.sin(t * 0.2) * 0.4 : 0); }
    if (P.rod0) {
      for (let i = 0; i < 12; i++) {
        const r = P['rod' + i], ring = Math.floor(i / 4), a = (i % 4) / 4 * Math.PI * 2 + t * (0.05 + ring * 0.02) * (ring % 2 ? -1 : 1);
        const rad = [9, 7, 5][ring];
        r.position.set(Math.cos(a) * rad, 4 + ring * 4 + Math.cos(t * 0.1 + i) * 1.5, Math.sin(a) * rad);
      }
    }
    if (P.inner && this.squish !== undefined) { const s = 1 + (this.squish || 0) * 0.3; m.scale.set(this.scale * s, this.scale / s, this.scale * s); }
    if (P.lid) P.lid.position.y = (this.open || 0) * 6;
    if (this.mobType === 'creeper' && this.fuse > 0) {
      const f = this.fuse / 30;
      const s = 1 + Math.sin(f * 80) * 0.01 + f * 0.2;
      m.scale.set(this.scale * s, this.scale * (1 + f * 0.1), this.scale * s);
      this.mat.uniforms.uHurt.value = Math.floor(this.fuse / 3) % 2 ? 0.0 : 0.0;
      this.mat.uniforms.uGlow.value = Math.floor(this.fuse / 3) % 2 ? 1.2 : 0;
    } else if (this.mobType === 'creeper') this.mat.uniforms.uGlow.value = 0;
    if (this.sitting && P.leg1) { m.position.y -= 0.2; P.leg1.rotation.x = -1.3; if (P.leg2) P.leg2.rotation.x = -1.3; }
    if (this.dead) { m.rotation.z = Math.min(1, (this.deathTime + alpha) / 20 * 1.6) * Math.PI / 2; }
    if (this.charging && P.body) { /* ghast : yeux rouges */ }
    // lumière, dégâts
    const l = this.world.getLight(Math.floor(x), Math.floor(y + this.h * 0.7), Math.floor(z));
    this.mat.uniforms.uSky.value = (l >> 4) / 15;
    this.mat.uniforms.uBlock.value = Math.max((l & 15) / 15, this.fire > 0 || this.def.glow ? 0.9 : 0);
    this.mat.uniforms.uHurt.value = this.hurtTime > 0 || this.dead ? 1 : 0;
  }
}

// --------------------------------------------------------------- JOUEUR (3e personne)
export class PlayerModel {
  constructor(game) {
    this.game = game;
    const t = buildModel(MODELS.player());
    this.root = t.root; this.parts = t.parts; this.mat = t.mat;
    for (const p of Object.values(this.parts)) p.userData.baseRot = p.rotation.clone();
    this.heldId = -1;
  }
  update(p, alpha) {
    const [x, y, z] = p.lerp(alpha);
    this.root.position.set(x, y - (p.sneaking ? 0.12 : 0), z);
    this.root.rotation.set(0, p.yaw, 0);
    const P = this.parts;
    for (const q of Object.values(P)) if (q.userData.baseRot) q.rotation.copy(q.userData.baseRot);
    const sw = Math.cos(p.limbSwing * 0.6662) * 1.4 * p.limbAmp;
    P.rightLeg.rotation.x = sw; P.leftLeg.rotation.x = -sw;
    P.rightArm.rotation.x = -sw * 0.8; P.leftArm.rotation.x = sw * 0.8;
    P.head.rotation.x = -p.pitch;
    if (p.sneaking) { P.body.rotation.x = 0.5; P.head.position.z = 0; P.rightLeg.position.z = 4; P.leftLeg.position.z = 4; }
    else { P.body.rotation.x = 0; P.rightLeg.position.z = 0; P.leftLeg.position.z = 0; }
    const hs = this.game.hand.swingT;
    if (hs < 1) P.rightArm.rotation.x -= Math.sin(hs * Math.PI) * 1.4;
    if (p.gliding) { this.root.rotation.x = -Math.PI / 2 + p.pitch * 0.5; } else this.root.rotation.x = 0;
    if (p.sleeping) { this.root.rotation.x = -Math.PI / 2; this.root.position.y += 0.2; }
    const id = p.held ? p.held.id : -1;
    if (id !== this.heldId) {
      this.heldId = id;
      if (this.heldMesh) P.rightArm.remove(this.heldMesh);
      this.heldMesh = null;
      if (id >= 0) { const m = itemMesh(id); m.scale.setScalar(8); m.position.set(1, -10, -3); m.rotation.set(0, Math.PI / 2, -0.5); P.rightArm.add(m); this.heldMesh = m; }
    }
    const l = this.game.world.getLight(Math.floor(x), Math.floor(y + 1.5), Math.floor(z));
    this.mat.uniforms.uSky.value = (l >> 4) / 15; this.mat.uniforms.uBlock.value = (l & 15) / 15;
    this.mat.uniforms.uHurt.value = p.hurtTime > 0 ? 1 : 0;
  }
}

// --------------------------------------------------------------- CRÉATION
export function createMob(game, type, opts = {}) {
  const d = D[type];
  if (!d) { console.warn('Créature inconnue', type); return null; }
  if (d.boss) return createBoss(game, type, opts);
  const m = new Mob(game, type, d, opts);
  if (type === 'zombie' && Math.random() < 0.05 && !opts.baby && opts.natural) { m.baby = true; m.w *= 0.5; m.h *= 0.5; m.eyeHeight *= 0.5; m.scale *= 0.5; m.model.scale.setScalar(m.scale); }
  if (opts.home) m.home = opts.home;
  return m;
}

// ----------------------------------------------------------- APPARITION
const CAP_HOSTILE = 35, CAP_PASSIVE = 14, CAP_WATER = 8, CAP_AMBIENT = 4;
export function naturalSpawn(game) {
  const w = game.world, p = game.player;
  if (!game.settings.mobs || p.dead) return;
  const L = game.entities.list;
  let hostile = 0, passive = 0, water = 0, ambient = 0;
  for (const e of L) {
    if (!e.mobType || e.dead) continue;
    if (e.hostile || (e.neutral && game.dim === 1)) hostile++;
    else if (e.def.kind === 'water') water++;
    else if (e.def.kind === 'bat') ambient++;
    else passive++;
  }
  const diff = game.settings.difficulty ?? 2;
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 40;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) continue;
    const chunk = w.chunkAt(x, z);
    if (!chunk || chunk.state < 3) continue;
    const top = w.getHeight(x, z);
    const bio = w.getBiome(x, z);
    // choisir une hauteur (surface ou grotte)
    let y;
    if (game.dim === 0 && Math.random() < 0.5) y = top;
    else y = 1 + Math.floor(Math.random() * Math.max(1, (game.dim === 1 ? 120 : top) - 1));
    // descendre jusqu'au sol
    while (y > 1 && !B_SOLID[w.getBlock(x, y - 1, z)]) y--;
    const below = w.getBlock(x, y - 1, z), at = w.getBlock(x, y, z), above = w.getBlock(x, y + 1, z);
    const inWater = at === K.water;
    if (B_SOLID[at] || B_SOLID[above]) continue;
    const light = w.getLight(x, y, z);
    const sky = light >> 4, blk = light & 15;
    const effSky = game.dim === 0 ? Math.round(sky * Math.max(0, game.env.daylight ?? 1)) : 0;
    let type = null, group = 1;
    if (game.dim === 0) {
      if (inWater) {
        if (water < CAP_WATER && w.getBlock(x, y + 2, z) === K.water) { const r2 = Math.random(); type = r2 < 0.5 ? 'cod' : r2 < 0.8 ? 'squid' : r2 < 0.9 ? (y < 50 ? 'glow_squid' : 'squid') : 'dolphin'; group = type === 'cod' ? 4 : type === 'dolphin' ? 2 : 2; if (diff > 0 && effSky < 7 && Math.random() < 0.15) { type = 'drowned'; group = 1; } }
      } else if (BLOCKS[below].fluid || !B_SOLID[below]) continue;
      else if (blk === 0 && effSky <= 7 && diff > 0 && hostile < CAP_HOSTILE) {
        const r2 = Math.random();
        const desert = bio === BI.desert, snowy = bio === BI.snowy_plains || bio === BI.snowy_taiga || bio === BI.ice_spikes;
        type = r2 < 0.28 ? (desert ? 'husk' : 'zombie') : r2 < 0.5 ? (snowy ? 'stray' : 'skeleton') : r2 < 0.68 ? 'creeper' : r2 < 0.84 ? 'spider' : r2 < 0.9 ? 'enderman' : r2 < 0.93 && bio === BI.swamp ? 'slime' : r2 < 0.95 && bio === BI.swamp ? 'witch' : r2 < 0.97 && y < 40 ? 'slime' : 'zombie';
        group = type === 'enderman' ? 1 : 1 + Math.floor(Math.random() * 3);
        if (y < 40 && Math.random() < 0.08 && ambient < CAP_AMBIENT) { type = 'bat'; group = 2; }
      } else if (below === K.grass_block && sky >= 9 && passive < CAP_PASSIVE && Math.random() < 0.3) {
        const r2 = Math.random();
        if (bio === BI.mushroom_fields) type = 'mooshroom';
        else if (bio === BI.desert) type = 'rabbit';
        else if (bio === BI.taiga || bio === BI.snowy_taiga) type = r2 < 0.3 ? 'wolf' : r2 < 0.5 ? 'fox' : r2 < 0.7 ? 'rabbit' : 'sheep';
        else if (bio === BI.savanna || bio === BI.plains || bio === BI.sunflower_plains) type = r2 < 0.12 ? 'horse' : r2 < 0.37 ? 'cow' : r2 < 0.62 ? 'sheep' : r2 < 0.84 ? 'pig' : 'chicken';
        else if (bio === BI.jungle) type = r2 < 0.3 ? 'parrot' : r2 < 0.45 ? 'panda' : r2 < 0.7 ? 'chicken' : 'pig';
        else if (bio === BI.snowy_plains || bio === BI.ice_spikes) type = r2 < 0.3 ? 'polar_bear' : 'rabbit';
        else if (bio === BI.windswept_hills || bio === BI.snowy_slopes || bio === BI.stony_peaks) type = r2 < 0.5 ? 'goat' : 'sheep';
        else type = r2 < 0.25 ? 'cow' : r2 < 0.5 ? 'sheep' : r2 < 0.75 ? 'pig' : r2 < 0.85 ? 'wolf' : 'chicken';
        group = type === 'wolf' ? 2 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
      }
    } else if (game.dim === 1) {
      if (hostile >= CAP_HOSTILE * 0.7) continue;
      if (!B_SOLID[below] || BLOCKS[below].fluid) {
        if (below === K.lava && Math.random() < 0.05) { type = 'strider'; }
        else continue;
      } else {
        const r2 = Math.random();
        if (bio === BI.crimson_forest) type = r2 < 0.4 ? 'hoglin' : r2 < 0.8 ? 'piglin' : 'zombified_piglin';
        else if (bio === BI.warped_forest) type = r2 < 0.8 ? 'enderman' : 'strider';
        else if (bio === BI.soul_sand_valley) type = r2 < 0.6 ? 'skeleton' : r2 < 0.85 ? 'ghast' : 'enderman';
        else if (bio === BI.basalt_deltas) type = r2 < 0.8 ? 'magma_cube' : 'ghast';
        else type = r2 < 0.55 ? 'zombified_piglin' : r2 < 0.7 ? 'ghast' : r2 < 0.85 ? 'magma_cube' : 'piglin';
        // forteresse
        if ((below === K.nether_bricks || at === K.nether_bricks) && Math.random() < 0.7) type = Math.random() < 0.5 ? 'blaze' : 'wither_skeleton';
        group = type === 'zombified_piglin' ? 2 + Math.floor(Math.random() * 3) : type === 'ghast' ? 1 : 1 + Math.floor(Math.random() * 2);
        if (type === 'ghast') { y += 8; let free = true; for (let i = 0; i < 5; i++) if (B_SOLID[w.getBlock(x, y + i, z)]) free = false; if (!free) continue; }
      }
    } else if (game.dim === 2) {
      if (hostile < 20 && B_SOLID[below] && below !== K.obsidian) { type = 'enderman'; group = 1 + Math.floor(Math.random() * 3); }
    }
    if (!type) continue;
    for (let i = 0; i < group; i++) {
      const sx = x + Math.floor((Math.random() - 0.5) * 6), sz = z + Math.floor((Math.random() - 0.5) * 6);
      let sy = y;
      if (!D[type].fly && type !== 'bat' && D[type].kind !== 'water') {
        if (B_SOLID[w.getBlock(sx, sy, sz)] || B_SOLID[w.getBlock(sx, sy + 1, sz)] || !B_SOLID[w.getBlock(sx, sy - 1, sz)]) continue;
        if (D[type].h > 2 && B_SOLID[w.getBlock(sx, sy + 2, sz)]) continue;
      }
      if (Math.hypot(sx - p.x, sy - p.y, sz - p.z) < 24) continue;
      game.spawnMob(type, sx + 0.5, sy, sz + 0.5, { natural: true });
    }
  }
}
export { DAY_LENGTH, COLOR_KEYS, THREE };
