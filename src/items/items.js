// Registre des objets : blocs, outils, armures, nourriture, divers
import { BLOCKS, BLOCK } from '../blocks/blocks.js';

export const ITEMS = [];       // id -> def
export const ITEM = {};        // key -> id
export const ITEM_BY_KEY = {};
export const ITEM_ID_START = 1024;

let next = ITEM_ID_START;
function I(key, name, o = {}) {
  const def = { id: next++, key, name, stack: o.stack ?? 64, cat: o.cat || 'misc', ...o };
  ITEMS[def.id] = def; ITEM[key] = def.id; ITEM_BY_KEY[key] = def;
  return def;
}

// objets de blocs (même identifiant que le bloc)
for (const b of BLOCKS) {
  if (!b || !b.item) continue;
  const def = { id: b.id, key: b.key, name: b.name, stack: 64, block: b.id, cat: b.cat || 'build', isBlock: true };
  ITEMS[b.id] = def; ITEM[b.key] = b.id; ITEM_BY_KEY[b.key] = def;
}

// ---------------------------------------------------------------- OUTILS
export const TIERS = {
  wooden: { name: 'en bois', level: 0, speed: 2, dur: 59, dmg: 0, mat: 'oak_planks', color: '#8a6a3a' },
  stone: { name: 'en pierre', level: 1, speed: 4, dur: 131, dmg: 1, mat: 'cobblestone', color: '#8a8a8a' },
  iron: { name: 'en fer', level: 2, speed: 6, dur: 250, dmg: 2, mat: 'iron_ingot', color: '#e4e4e4' },
  golden: { name: 'en or', level: 0, speed: 12, dur: 32, dmg: 0, mat: 'gold_ingot', color: '#f7d84a' },
  diamond: { name: 'en diamant', level: 3, speed: 8, dur: 1561, dmg: 3, mat: 'diamond', color: '#5fe5e0' },
  netherite: { name: 'en netherite', level: 4, speed: 9, dur: 2031, dmg: 4, mat: 'netherite_ingot', color: '#4d4448' },
};
const TOOLS = {
  pickaxe: { name: 'Pioche', base: 2, atkSpeed: 1.2 },
  axe: { name: 'Hache', base: 6, atkSpeed: 0.9 },
  shovel: { name: 'Pelle', base: 2.5, atkSpeed: 1.0 },
  sword: { name: 'Épée', base: 4, atkSpeed: 1.6 },
  hoe: { name: 'Houe', base: 1, atkSpeed: 2.0 },
};
const DMG = {
  sword: { wooden: 4, golden: 4, stone: 5, iron: 6, diamond: 7, netherite: 8 },
  axe: { wooden: 7, golden: 7, stone: 9, iron: 9, diamond: 9, netherite: 10 },
  pickaxe: { wooden: 2, golden: 2, stone: 3, iron: 4, diamond: 5, netherite: 6 },
  shovel: { wooden: 2.5, golden: 2.5, stone: 3.5, iron: 4.5, diamond: 5.5, netherite: 6.5 },
  hoe: { wooden: 1, golden: 1, stone: 1, iron: 1, diamond: 1, netherite: 1 },
};
for (const [tk, t] of Object.entries(TIERS)) {
  for (const [kind, k] of Object.entries(TOOLS)) {
    I(tk + '_' + kind, k.name + ' ' + t.name, {
      stack: 1, cat: kind === 'sword' || kind === 'axe' ? 'combat' : 'tools', tool: kind, tier: tk, level: t.level, speed: t.speed,
      durability: t.dur, damage: DMG[kind][tk], atkSpeed: k.atkSpeed,
    });
  }
}
I('shears', 'Cisailles', { stack: 1, tool: 'shears', speed: 5, durability: 238, cat: 'tools' });
I('bow', 'Arc', { stack: 1, durability: 384, cat: 'combat', use: 'bow' });
I('crossbow', 'Arbalète', { stack: 1, durability: 465, cat: 'combat', use: 'bow' });
I('trident', 'Trident', { stack: 1, durability: 250, cat: 'combat', damage: 9, use: 'trident' });
I('arrow', 'Flèche', { cat: 'combat' });
I('flint_and_steel', 'Briquet', { stack: 1, durability: 64, cat: 'tools', use: 'ignite' });
I('fire_charge', 'Boule de feu', { cat: 'tools', use: 'ignite' });
I('fishing_rod', 'Canne à pêche', { stack: 1, durability: 64, cat: 'tools' });
I('bucket', 'Seau', { stack: 16, cat: 'tools', use: 'bucket' });
I('water_bucket', 'Seau d\'eau', { stack: 1, cat: 'tools', use: 'bucket', fluid: 'water' });
I('lava_bucket', 'Seau de lave', { stack: 1, cat: 'tools', use: 'bucket', fluid: 'lava' });
I('milk_bucket', 'Seau de lait', { stack: 1, cat: 'food', use: 'drink' });
I('clock', 'Horloge', { cat: 'tools' });
I('compass', 'Boussole', { cat: 'tools' });
I('map', 'Carte', { cat: 'tools' });
I('elytra', 'Élytres', { stack: 1, durability: 432, cat: 'combat', armor: { slot: 1, points: 0 } });
I('totem_of_undying', 'Totem d\'immortalité', { stack: 1, cat: 'combat' });
I('shield', 'Bouclier', { stack: 1, durability: 336, cat: 'combat' });

// --------------------------------------------------------------- ARMURES
const ARMOR_MATS = {
  leather: { name: 'en cuir', pts: [1, 3, 2, 1], mult: 5, color: '#8a5a32', tough: 0 },
  chainmail: { name: 'de mailles', pts: [2, 5, 4, 1], mult: 15, color: '#7d7d7d', tough: 0 },
  iron: { name: 'en fer', pts: [2, 6, 5, 2], mult: 15, color: '#d8d8d8', tough: 0 },
  golden: { name: 'en or', pts: [2, 5, 3, 1], mult: 7, color: '#f2cd36', tough: 0 },
  diamond: { name: 'en diamant', pts: [3, 8, 6, 3], mult: 33, color: '#4ed3cf', tough: 2 },
  netherite: { name: 'en netherite', pts: [3, 8, 6, 3], mult: 37, color: '#4a4246', tough: 3 },
};
const SLOTS = [['helmet', 'Casque'], ['chestplate', 'Plastron'], ['leggings', 'Jambières'], ['boots', 'Bottes']];
const BASE_DUR = [11, 16, 15, 13];
for (const [mk, m] of Object.entries(ARMOR_MATS)) {
  SLOTS.forEach(([sk, sn], i) => {
    I(mk + '_' + sk, sn + ' ' + m.name, { stack: 1, cat: 'combat', armor: { slot: i, points: m.pts[i], tough: m.tough, mat: mk }, durability: BASE_DUR[i] * m.mult, color: m.color });
  });
}
I('turtle_helmet', 'Carapace de tortue', { stack: 1, cat: 'combat', armor: { slot: 0, points: 2, tough: 0 }, durability: 275, color: '#47a036' });

// ---------------------------------------------------------- NOURRITURE
const food = (k, n, h, s, o = {}) => I(k, n, { cat: 'food', food: { hunger: h, sat: s, ...o } });
food('apple', 'Pomme', 4, 2.4);
food('golden_apple', 'Pomme dorée', 4, 9.6, { always: true, effects: [['regeneration', 100, 1], ['absorption', 2400, 0]] });
food('enchanted_golden_apple', 'Pomme dorée enchantée', 4, 9.6, { always: true, effects: [['regeneration', 400, 1], ['absorption', 2400, 3], ['resistance', 6000, 0], ['fire_resistance', 6000, 0]] });
food('bread', 'Pain', 5, 6);
food('porkchop', 'Côtelette de porc crue', 3, 1.8);
food('cooked_porkchop', 'Côtelette de porc cuite', 8, 12.8);
food('beef', 'Bœuf cru', 3, 1.8);
food('cooked_beef', 'Steak', 8, 12.8);
food('chicken', 'Poulet cru', 2, 1.2, { effects: [['hunger', 600, 0, 0.3]] });
food('cooked_chicken', 'Poulet rôti', 6, 7.2);
food('mutton', 'Mouton cru', 2, 1.2);
food('cooked_mutton', 'Mouton cuit', 6, 9.6);
food('cod', 'Morue crue', 2, 0.4);
food('cooked_cod', 'Morue cuite', 5, 6);
food('salmon', 'Saumon cru', 2, 0.4);
food('cooked_salmon', 'Saumon cuit', 6, 9.6);
food('carrot', 'Carotte', 3, 3.6, { plant: 'carrots' });
food('golden_carrot', 'Carotte dorée', 6, 14.4);
food('potato', 'Pomme de terre', 1, 0.6, { plant: 'potatoes' });
food('baked_potato', 'Pomme de terre cuite', 5, 6);
food('melon_slice', 'Tranche de pastèque', 2, 1.2);
food('sweet_berries', 'Baies sucrées', 2, 0.4, { plant: 'sweet_berry_bush' });
food('cookie', 'Cookie', 2, 0.4);
food('pumpkin_pie', 'Tarte à la citrouille', 8, 4.8);
food('mushroom_stew', 'Ragoût de champignons', 6, 7.2, { bowl: true });
food('rotten_flesh', 'Chair putréfiée', 4, 0.8, { effects: [['hunger', 600, 0, 0.8]] });
food('spider_eye', 'Œil d\'araignée', 2, 3.2, { effects: [['poison', 100, 0]] });
food('chorus_fruit', 'Fruit de chorus', 4, 2.4, { always: true, teleport: true });
food('dried_kelp', 'Varech séché', 1, 0.6);
food('honey_bottle', 'Fiole de miel', 6, 1.2);
ITEM_BY_KEY.milk_bucket.food = { hunger: 0, sat: 0, always: true, milk: true };

// ------------------------------------------------------------- MATÉRIAUX
const mat = (k, n, o = {}) => I(k, n, { cat: 'materials', ...o });
mat('stick', 'Bâton'); mat('coal', 'Charbon', { fuel: 1600 }); mat('charcoal', 'Charbon de bois', { fuel: 1600 });
mat('raw_iron', 'Fer brut'); mat('raw_gold', 'Or brut'); mat('raw_copper', 'Cuivre brut');
mat('iron_ingot', 'Lingot de fer'); mat('gold_ingot', 'Lingot d\'or'); mat('copper_ingot', 'Lingot de cuivre');
mat('iron_nugget', 'Pépite de fer'); mat('gold_nugget', 'Pépite d\'or');
mat('diamond', 'Diamant'); mat('emerald', 'Émeraude'); mat('lapis_lazuli', 'Lapis-lazuli'); mat('redstone', 'Poudre de redstone');
mat('quartz', 'Quartz du Nether'); mat('netherite_scrap', 'Fragment de netherite'); mat('netherite_ingot', 'Lingot de netherite');
mat('flint', 'Silex'); mat('string', 'Ficelle'); mat('feather', 'Plume'); mat('gunpowder', 'Poudre à canon');
mat('bone', 'Os'); mat('bone_meal', 'Poudre d\'os', { use: 'bonemeal' }); mat('leather', 'Cuir'); mat('paper', 'Papier'); mat('book', 'Livre');
mat('sugar', 'Sucre'); mat('wheat', 'Blé'); mat('wheat_seeds', 'Graines de blé', { plant: 'wheat' }); mat('beetroot_seeds', 'Graines de betterave');
mat('clay_ball', 'Boule d\'argile'); mat('brick', 'Brique'); mat('nether_brick', 'Brique du Nether');
mat('glowstone_dust', 'Poudre lumineuse'); mat('blaze_rod', 'Bâton de blaze', { fuel: 2400 }); mat('blaze_powder', 'Poudre de blaze');
mat('ender_pearl', 'Perle de l\'Ender', { stack: 16, use: 'throw', projectile: 'ender_pearl' });
mat('ender_eye', 'Œil de l\'Ender', { use: 'ender_eye' });
mat('ghast_tear', 'Larme de ghast'); mat('slime_ball', 'Boule de slime'); mat('magma_cream', 'Crème de magma');
mat('nether_star', 'Étoile du Nether'); mat('dragon_breath', 'Souffle du dragon'); mat('echo_shard', 'Éclat d\'écho');
mat('amethyst_shard', 'Éclat d\'améthyste'); mat('prismarine_crystals', 'Cristaux de prismarine'); mat('prismarine_shard', 'Éclat de prismarine');
mat('snowball', 'Boule de neige', { stack: 16, use: 'throw', projectile: 'snowball' });
mat('egg', 'Œuf', { stack: 16, use: 'throw', projectile: 'egg' });
mat('experience_bottle', 'Fiole d\'expérience', { use: 'throw', projectile: 'xp_bottle' });
mat('nether_wart', 'Verrues du Nether', { plant: 'nether_wart' });
mat('kelp_item', 'Varech', { plant: 'kelp' });
mat('candle', 'Bougie'); mat('saddle', 'Selle', { stack: 1 }); mat('name_tag', 'Étiquette');
mat('bowl', 'Bol'); mat('glass_bottle', 'Fiole'); mat('heart_of_the_sea', 'Cœur de la mer'); mat('nautilus_shell', 'Coquille de nautile');
mat('phantom_membrane', 'Membrane de phantom'); mat('rabbit_hide', 'Peau de lapin'); mat('ink_sac', 'Poche d\'encre'); mat('glow_ink_sac', 'Poche d\'encre lumineuse');
mat('disc_cat', 'Disque de musique'); mat('goat_horn', 'Corne de chèvre', { stack: 1 });
mat('shulker_shell', 'Carapace de shulker');

// ------------------------------------------------- ŒUFS D'APPARITION
export const SPAWN_EGGS = [
  ['pig', 'cochon', '#f0a0a0', '#d06060'], ['cow', 'vache', '#443626', '#a1a1a1'], ['sheep', 'mouton', '#e7e7e7', '#ffb5b5'],
  ['chicken', 'poulet', '#a1a1a1', '#ff0000'], ['wolf', 'loup', '#d7d3d3', '#ceaf96'], ['horse', 'cheval', '#c09e7d', '#eee500'],
  ['villager', 'villageois', '#563c33', '#bd8b72'], ['iron_golem', 'golem de fer', '#dbcdc1', '#74a332'], ['squid', 'poulpe', '#223b4d', '#708899'],
  ['cod', 'morue', '#c1a76a', '#e5c48b'], ['dolphin', 'dauphin', '#223b4d', '#f9f9f9'], ['rabbit', 'lapin', '#995f40', '#734831'],
  ['fox', 'renard', '#d5b69f', '#cc6920'], ['bee', 'abeille', '#edc343', '#43241b'], ['turtle', 'tortue', '#e7e7e7', '#00afaf'],
  ['zombie', 'zombie', '#00afaf', '#799c65'], ['skeleton', 'squelette', '#c1c1c1', '#494949'], ['creeper', 'creeper', '#0da70b', '#000000'],
  ['spider', 'araignée', '#342d27', '#a80e0e'], ['cave_spider', 'araignée venimeuse', '#0c424e', '#a80e0e'], ['enderman', 'enderman', '#161616', '#000000'],
  ['slime', 'slime', '#51a03e', '#7ebf6e'], ['witch', 'sorcière', '#340000', '#51a03e'], ['drowned', 'noyé', '#8ff1d7', '#799c65'],
  ['husk', 'zombie momifié', '#797061', '#e6cc94'], ['stray', 'vagabond', '#617677', '#ddeaea'], ['phantom', 'phantom', '#43518a', '#88ff00'],
  ['pillager', 'pillard', '#532f36', '#959b9b'], ['silverfish', 'poisson d\'argent', '#6e6e6e', '#303030'], ['guardian', 'gardien', '#5a8272', '#f17d30'],
  ['ghast', 'ghast', '#f9f9f9', '#bcbcbc'], ['blaze', 'blaze', '#f6b201', '#fff87e'], ['magma_cube', 'cube de magma', '#340000', '#fcfc00'],
  ['zombified_piglin', 'piglin zombifié', '#ea9393', '#4c7129'], ['piglin', 'piglin', '#995f40', '#f9f3a4'], ['hoglin', 'hoglin', '#c66e55', '#5f6464'],
  ['wither_skeleton', 'wither squelette', '#141414', '#474d4d'], ['strider', 'arpenteur', '#9c3436', '#4d494d'], ['endermite', 'endermite', '#161616', '#6e6e6e'],
  ['shulker', 'shulker', '#946794', '#4d3852'], ['warden', 'Warden', '#0f4649', '#39d6e0'], ['ender_dragon', 'dragon de l\'Ender', '#1c1c1c', '#e079fa'],
  ['wither', 'Wither', '#141414', '#4d72a0'], ['elder_guardian', 'gardien ancien', '#ceccba', '#747693'], ['ravager', 'ravageur', '#757470', '#5b5049'],
  ['evoker', 'évocateur', '#959b9b', '#1e1c1a'], ['vex', 'vex', '#7a90a4', '#e8edf1'], ['allay', 'allay', '#00daff', '#00adff'],
  ['axolotl', 'axolotl', '#fbc1e3', '#a62d74'], ['frog', 'grenouille', '#d07444', '#ffc77c'], ['goat', 'chèvre', '#a5947c', '#55493e'],
  ['panda', 'panda', '#e7e7e7', '#1b1b22'], ['polar_bear', 'ours polaire', '#f2f2f2', '#959590'], ['parrot', 'perroquet', '#0da70b', '#ff0000'],
  ['cat', 'chat', '#efc88e', '#957256'], ['llama', 'lama', '#c09e7d', '#995f40'], ['camel', 'dromadaire', '#fcc369', '#cb9337'],
  ['sniffer', 'renifleur', '#871e09', '#25ab70'], ['armadillo', 'tatou', '#ad716d', '#824848'], ['breeze', 'breeze', '#af94df', '#9166df'],
];
for (const [m, fr, c1, c2] of SPAWN_EGGS) I(m + '_spawn_egg', 'Œuf d\'apparition de ' + fr, { cat: 'eggs', use: 'spawn_egg', mob: m, colors: [c1, c2] });

// valeurs de combustible des blocs
const FUEL_BLOCKS = { coal_block: 16000, bookshelf: 300, crafting_table: 300, chest: 300 };
for (const b of BLOCKS) {
  if (!b || !b.item) continue;
  if (b.key.endsWith('_planks') || b.key.endsWith('_log') || b.key.endsWith('_stairs') && b.tool === 'axe') ITEMS[b.id].fuel = 300;
  if (b.key.endsWith('_slab') && b.tool === 'axe') ITEMS[b.id].fuel = 150;
  if (b.key.endsWith('_sapling') || b.key.endsWith('_wool')) ITEMS[b.id].fuel = 100;
  if (FUEL_BLOCKS[b.key]) ITEMS[b.id].fuel = FUEL_BLOCKS[b.key];
}
for (const [tk] of Object.entries(TIERS)) if (tk === 'wooden') for (const k of Object.keys(TOOLS)) ITEM_BY_KEY['wooden_' + k].fuel = 200;
ITEM_BY_KEY.stick.fuel = 100; ITEM_BY_KEY.bow.fuel = 300; ITEM_BY_KEY.lava_bucket.fuel = 20000;

// ---------------------------------------------------------------- UTILES
export function itemId(k) {
  if (typeof k === 'number') return k;
  const id = ITEM[k];
  if (id === undefined) { console.warn('Objet inconnu :', k); return ITEM.stone; }
  return id;
}
export function itemDef(id) { return ITEMS[id]; }
export function maxStack(id) { const d = ITEMS[id]; return d ? d.stack : 64; }
export function isTool(id) { const d = ITEMS[id]; return !!(d && d.tool); }

export class ItemStack {
  constructor(id, count = 1, damage = 0) { this.id = typeof id === 'string' ? itemId(id) : id; this.count = count; this.damage = damage; }
  get def() { return ITEMS[this.id]; }
  clone() { const s = new ItemStack(this.id, this.count, this.damage); if (this.tag) s.tag = { ...this.tag }; return s; }
  canStack(o) { return o && o.id === this.id && !this.def.durability && this.damage === o.damage && !this.tag && !o.tag; }
  toJSON() { return [this.id, this.count, this.damage]; }
  static from(a) {
    if (!a) return null;
    if (Array.isArray(a)) return new ItemStack(a[0], a[1], a[2] || 0);
    if (a instanceof ItemStack) return a;
    return new ItemStack(typeof a.id === 'string' ? itemId(a.id) : a.id, a.count || 1, a.damage || 0);
  }
}

// vitesse de minage (en ticks) — formule de Minecraft
export function breakTicks(blockDef, stack, onGround, inWater, effects) {
  if (blockDef.hardness < 0) return Infinity;
  if (blockDef.hardness === 0) return 0;
  const it = stack ? ITEMS[stack.id] : null;
  let speed = 1;
  const kind = it && it.tool;
  const matches = kind && (kind === blockDef.tool || (kind === 'sword' && blockDef.key === 'cobweb') || (kind === 'shears' && (blockDef.key.endsWith('_leaves') || blockDef.key.endsWith('_wool') || blockDef.key === 'cobweb' || blockDef.key === 'vine')));
  if (matches) speed = kind === 'sword' ? 15 : kind === 'shears' ? (blockDef.key === 'cobweb' ? 15 : blockDef.key.endsWith('_wool') ? 5 : 15) : it.speed;
  if (effects && effects.haste) speed *= 1 + 0.2 * (effects.haste.amp + 1);
  if (inWater) speed /= 5;
  if (!onGround) speed /= 5;
  const canHarvest = canHarvestBlock(blockDef, stack);
  const dmg = speed / blockDef.hardness / (canHarvest ? 30 : 100);
  if (dmg > 1) return 0;
  return Math.ceil(1 / dmg);
}
export function canHarvestBlock(blockDef, stack) {
  if (!blockDef.requiresTool) return true;
  const it = stack ? ITEMS[stack.id] : null;
  if (!it || it.tool !== blockDef.tool) return false;
  return (it.level ?? 0) >= blockDef.level;
}

export const ALL_ITEM_IDS = () => ITEMS.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
export { BLOCK };
