// Recettes d'artisanat (avec forme / sans forme) et de cuisson au fourneau
import { ITEM, ITEMS, ItemStack } from './items.js';
import { BLOCKS, COLOR_KEYS } from '../blocks/blocks.js';

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry'];
const TAGS = {
  planks: [...WOODS.map((w) => w + '_planks'), 'crimson_planks', 'warped_planks'],
  logs: [...WOODS.map((w) => w + '_log'), 'crimson_stem', 'warped_stem'],
  wool: COLOR_KEYS.map((c) => c + '_wool'),
  stone_tool: ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  coals: ['coal', 'charcoal'],
  sand: ['sand', 'red_sand'],
};
const resolve = (k) => {
  if (Array.isArray(k)) return new Set(k.map((x) => ITEM[x]));
  if (k.startsWith('#')) return new Set(TAGS[k.slice(1)].map((x) => ITEM[x]));
  return new Set([ITEM[k]]);
};

export const RECIPES = [];
function shaped(out, n, shape, keys) {
  const k = {};
  for (const [c, v] of Object.entries(keys)) k[c] = resolve(v);
  const w = Math.max(...shape.map((r) => r.length)), h = shape.length;
  const grid = shape.map((r) => r.padEnd(w, ' '));
  RECIPES.push({ out: ITEM[out], n, w, h, grid, keys: k, type: 'shaped' });
}
function shapeless(out, n, ings) {
  RECIPES.push({ out: ITEM[out], n, ings: ings.map(resolve), type: 'shapeless' });
}

// --- bois
WOODS.forEach((w) => shaped(w + '_planks', 4, ['L'], { L: w + '_log' }));
shaped('crimson_planks', 4, ['L'], { L: 'crimson_stem' });
shaped('warped_planks', 4, ['L'], { L: 'warped_stem' });
shaped('stick', 4, ['P', 'P'], { P: '#planks' });
shaped('crafting_table', 1, ['PP', 'PP'], { P: '#planks' });
shaped('chest', 1, ['PPP', 'P P', 'PPP'], { P: '#planks' });
shaped('note_block', 1, ['PPP', 'PRP', 'PPP'], { P: '#planks', R: 'redstone' });
shaped('jukebox', 1, ['PPP', 'PDP', 'PPP'], { P: '#planks', D: 'diamond' });
shaped('barrel', 1, ['PSP', 'P P', 'PSP'], { P: '#planks', S: 'oak_slab' });
shaped('furnace', 1, ['CCC', 'C C', 'CCC'], { C: '#stone_tool' });
shaped('torch', 4, ['C', 'S'], { C: '#coals', S: 'stick' });
shaped('soul_torch', 4, ['C', 'S', 'X'], { C: '#coals', S: 'stick', X: ['soul_sand', 'soul_soil'] });
shaped('ladder', 3, ['S S', 'SSS', 'S S'], { S: 'stick' });
shaped('oak_fence', 3, ['PSP', 'PSP'], { P: '#planks', S: 'stick' });
shaped('oak_door', 3, ['PP', 'PP', 'PP'], { P: '#planks' });
shaped('red_bed', 1, ['WWW', 'PPP'], { W: '#wool', P: '#planks' });
shaped('bowl', 4, ['P P', ' P '], { P: '#planks' });
shaped('bookshelf', 1, ['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' });
shaped('campfire', 1, [' S ', 'SCS', 'LLL'], { S: 'stick', C: '#coals', L: '#logs' });
shaped('composter', 1, ['P P', 'P P', 'PPP'], { P: 'oak_slab' });
shaped('shield', 1, ['WIW', 'WWW', ' W '], { W: '#planks', I: 'iron_ingot' });

// --- escaliers et dalles
const stairs = [['oak_stairs', '#planks'], ['spruce_stairs', 'spruce_planks'], ['cobblestone_stairs', 'cobblestone'], ['stone_brick_stairs', 'stone_bricks'],
  ['sandstone_stairs', 'sandstone'], ['brick_stairs', 'bricks'], ['nether_brick_stairs', 'nether_bricks'], ['purpur_stairs', 'purpur_block']];
for (const [o, m] of stairs) shaped(o, 4, ['M  ', 'MM ', 'MMM'], { M: m });
const slabs = [['oak_slab', '#planks'], ['stone_slab', 'smooth_stone'], ['cobblestone_slab', 'cobblestone'], ['stone_brick_slab', 'stone_bricks'], ['sandstone_slab', 'sandstone']];
for (const [o, m] of slabs) shaped(o, 6, ['MMM'], { M: m });
shaped('cobblestone_wall', 6, ['MMM', 'MMM'], { M: 'cobblestone' });

// --- outils et armes
const TOOLMATS = [['wooden', '#planks'], ['stone', '#stone_tool'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']];
for (const [t, m] of TOOLMATS) {
  shaped(t + '_pickaxe', 1, ['MMM', ' S ', ' S '], { M: m, S: 'stick' });
  shaped(t + '_axe', 1, ['MM', 'MS', ' S'], { M: m, S: 'stick' });
  shaped(t + '_shovel', 1, ['M', 'S', 'S'], { M: m, S: 'stick' });
  shaped(t + '_sword', 1, ['M', 'M', 'S'], { M: m, S: 'stick' });
  shaped(t + '_hoe', 1, ['MM', ' S', ' S'], { M: m, S: 'stick' });
}
for (const k of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) shapeless('netherite_' + k, 1, ['diamond_' + k, 'netherite_ingot']);
const ARM = [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']];
for (const [a, m] of ARM) {
  shaped(a + '_helmet', 1, ['MMM', 'M M'], { M: m });
  shaped(a + '_chestplate', 1, ['M M', 'MMM', 'MMM'], { M: m });
  shaped(a + '_leggings', 1, ['MMM', 'M M', 'M M'], { M: m });
  shaped(a + '_boots', 1, ['M M', 'M M'], { M: m });
}
for (const k of ['helmet', 'chestplate', 'leggings', 'boots']) shapeless('netherite_' + k, 1, ['diamond_' + k, 'netherite_ingot']);
shaped('bow', 1, [' TS', 'T S', ' TS'], { T: 'stick', S: 'string' });
shaped('arrow', 4, ['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' });
shaped('bucket', 1, ['I I', ' I '], { I: 'iron_ingot' });
shapeless('flint_and_steel', 1, ['iron_ingot', 'flint']);
shaped('shears', 1, [' I', 'I '], { I: 'iron_ingot' });
shaped('fishing_rod', 1, ['  S', ' ST', 'S T'], { S: 'stick', T: 'string' });
shaped('compass', 1, [' I ', 'IRI', ' I '], { I: 'iron_ingot', R: 'redstone' });
shaped('clock', 1, [' G ', 'GRG', ' G '], { G: 'gold_ingot', R: 'redstone' });
shaped('map', 1, ['PPP', 'PCP', 'PPP'], { P: 'paper', C: 'compass' });

// --- nourriture
shaped('bread', 1, ['WWW'], { W: 'wheat' });
shaped('golden_apple', 1, ['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' });
shaped('golden_carrot', 1, ['GGG', 'GCG', 'GGG'], { G: 'gold_nugget', C: 'carrot' });
shapeless('pumpkin_pie', 1, ['pumpkin', 'sugar', 'egg']);
shapeless('mushroom_stew', 1, ['red_mushroom', 'brown_mushroom', 'bowl']);
shaped('cookie', 8, ['WSW'], { W: 'wheat', S: 'sugar' });
shapeless('sugar', 1, ['sugar_cane']);
shaped('paper', 3, ['CCC'], { C: 'sugar_cane' });
shapeless('book', 1, ['paper', 'paper', 'paper', 'leather']);
shaped('hay_block', 1, ['WWW', 'WWW', 'WWW'], { W: 'wheat' });
shaped('wheat', 9, ['H'], { H: 'hay_block' });
shaped('melon', 1, ['MMM', 'MMM', 'MMM'], { M: 'melon_slice' });

// --- pierre et construction
shaped('stone_bricks', 4, ['SS', 'SS'], { S: 'stone' });
shaped('chiseled_stone_bricks', 1, ['S', 'S'], { S: 'stone_brick_slab' });
shapeless('mossy_cobblestone', 1, ['cobblestone', 'vine']);
shapeless('mossy_stone_bricks', 1, ['stone_bricks', 'vine']);
shaped('bricks', 1, ['BB', 'BB'], { B: 'brick' });
shaped('nether_bricks', 1, ['BB', 'BB'], { B: 'nether_brick' });
shaped('sandstone', 1, ['SS', 'SS'], { S: 'sand' });
shaped('red_sandstone', 1, ['SS', 'SS'], { S: 'red_sand' });
shaped('cut_sandstone', 4, ['SS', 'SS'], { S: 'sandstone' });
shaped('chiseled_sandstone', 1, ['S', 'S'], { S: 'sandstone_slab' });
shaped('polished_granite', 4, ['SS', 'SS'], { S: 'granite' });
shaped('polished_diorite', 4, ['SS', 'SS'], { S: 'diorite' });
shaped('polished_andesite', 4, ['SS', 'SS'], { S: 'andesite' });
shapeless('granite', 1, ['diorite', 'quartz']);
shaped('diorite', 2, ['CQ', 'QC'], { C: 'cobblestone', Q: 'quartz' });
shapeless('andesite', 2, ['diorite', 'cobblestone']);
shaped('deepslate_bricks', 4, ['SS', 'SS'], { S: 'cobbled_deepslate' });
shaped('deepslate_tiles', 4, ['SS', 'SS'], { S: 'deepslate_bricks' });
shaped('quartz_block', 1, ['QQ', 'QQ'], { Q: 'quartz' });
shaped('end_stone_bricks', 4, ['SS', 'SS'], { S: 'end_stone' });
shaped('purpur_block', 4, ['CC', 'CC'], { C: 'chorus_fruit' });
shaped('purpur_pillar', 1, ['S', 'S'], { S: 'purpur_block' });
shaped('snow_block', 1, ['SS', 'SS'], { S: 'snowball' });
shaped('snow', 6, ['SSS'], { S: 'snow_block' });
shaped('clay', 1, ['CC', 'CC'], { C: 'clay_ball' });
shaped('glowstone', 1, ['GG', 'GG'], { G: 'glowstone_dust' });
shaped('white_wool', 1, ['SS', 'SS'], { S: 'string' });
shaped('tnt', 1, ['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: '#sand' });
shapeless('jack_o_lantern', 1, ['carved_pumpkin', 'torch']);
shaped('lantern', 1, ['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' });
shaped('soul_lantern', 1, ['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'soul_torch' });
shaped('iron_bars', 16, ['III', 'III'], { I: 'iron_ingot' });
shaped('anvil', 1, ['BBB', ' I ', 'III'], { B: 'iron_block', I: 'iron_ingot' });
shaped('cauldron', 1, ['I I', 'I I', 'III'], { I: 'iron_ingot' });
shaped('enchanting_table', 1, [' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' });
shaped('beacon', 1, ['GGG', 'GNG', 'OOO'], { G: 'glass', N: 'nether_star', O: 'obsidian' });
shaped('end_rod', 4, ['B', 'P'], { B: 'blaze_rod', P: 'chorus_fruit' });
shaped('bone_block', 1, ['BBB', 'BBB', 'BBB'], { B: 'bone_meal' });
shapeless('bone_meal', 3, ['bone']);
shapeless('bone_meal', 9, ['bone_block']);
shapeless('blaze_powder', 2, ['blaze_rod']);
shapeless('ender_eye', 1, ['ender_pearl', 'blaze_powder']);
shapeless('fire_charge', 3, ['blaze_powder', '#coals', 'gunpowder']);
shapeless('magma_cream', 1, ['blaze_powder', 'slime_ball']);
shaped('magma_block', 1, ['MM', 'MM'], { M: 'magma_cream' });
for (const c of ['white', 'light_blue', 'lime', 'pink', 'purple', 'red', 'black', 'yellow']) shaped(c + '_stained_glass', 8, ['GGG', 'G G', 'GGG'], { G: 'glass' });

// --- blocs minéraux
const MIN = [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'],
  ['lapis_block', 'lapis_lazuli'], ['redstone_block', 'redstone'], ['coal_block', 'coal'], ['copper_block', 'copper_ingot'], ['netherite_block', 'netherite_ingot']];
for (const [b, i] of MIN) { shaped(b, 1, ['III', 'III', 'III'], { I: i }); shapeless(i, 9, [b]); }
shaped('iron_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' });
shaped('gold_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' });
shapeless('iron_nugget', 9, ['iron_ingot']);
shapeless('gold_nugget', 9, ['gold_ingot']);
shapeless('netherite_ingot', 1, ['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot']);

// ------------------------------------------------------------- CORRESPONDANCE
export function matchRecipe(grid, size) {
  // grid : tableau size*size d'identifiants (0 = vide)
  let minX = size, minY = size, maxX = -1, maxY = -1;
  const ids = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const id = grid[y * size + x];
    if (id) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); ids.push(id); }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.type === 'shaped') {
      if (r.w !== w || r.h !== h) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) {
          const rc = r.grid[y][mirror ? w - 1 - x : x];
          const id = grid[(y + minY) * size + (x + minX)];
          if (rc === ' ') { if (id) { ok = false; break; } }
          else if (!id || !r.keys[rc].has(id)) { ok = false; break; }
        }
        if (ok) return r;
      }
    } else {
      if (r.ings.length !== ids.length) continue;
      const used = new Array(ids.length).fill(false);
      let ok = true;
      for (const set of r.ings) {
        let found = false;
        for (let i = 0; i < ids.length; i++) if (!used[i] && set.has(ids[i])) { used[i] = true; found = true; break; }
        if (!found) { ok = false; break; }
      }
      if (ok) return r;
    }
  }
  return null;
}

// -------------------------------------------------------------- CUISSON
export const SMELT = new Map();
function smelt(ins, out, xp = 0.1) { for (const i of [].concat(ins)) if (ITEM[i] !== undefined) SMELT.set(ITEM[i], { out: ITEM[out], xp }); }
smelt(['raw_iron', 'iron_ore', 'deepslate_iron_ore'], 'iron_ingot', 0.7);
smelt(['raw_gold', 'gold_ore', 'deepslate_gold_ore', 'nether_gold_ore'], 'gold_ingot', 1);
smelt(['raw_copper', 'copper_ore', 'deepslate_copper_ore'], 'copper_ingot', 0.7);
smelt(['diamond_ore', 'deepslate_diamond_ore'], 'diamond', 1);
smelt(['emerald_ore', 'deepslate_emerald_ore'], 'emerald', 1);
smelt(['coal_ore', 'deepslate_coal_ore'], 'coal', 0.1);
smelt(['lapis_ore', 'deepslate_lapis_ore'], 'lapis_lazuli', 0.2);
smelt(['redstone_ore', 'deepslate_redstone_ore'], 'redstone', 0.7);
smelt('nether_quartz_ore', 'quartz', 0.2);
smelt('ancient_debris', 'netherite_scrap', 2);
smelt(['sand', 'red_sand'], 'glass', 0.1);
smelt('cobblestone', 'stone', 0.1);
smelt('stone', 'smooth_stone', 0.1);
smelt('cobbled_deepslate', 'deepslate', 0.1);
smelt('stone_bricks', 'cracked_stone_bricks', 0.1);
smelt('clay_ball', 'brick', 0.3);
smelt('clay', 'terracotta', 0.35);
smelt('netherrack', 'nether_brick', 0.1);
smelt(TAGS.logs, 'charcoal', 0.15);
smelt('porkchop', 'cooked_porkchop', 0.35); smelt('beef', 'cooked_beef', 0.35); smelt('chicken', 'cooked_chicken', 0.35);
smelt('mutton', 'cooked_mutton', 0.35); smelt('cod', 'cooked_cod', 0.35); smelt('salmon', 'cooked_salmon', 0.35);
smelt('potato', 'baked_potato', 0.35); smelt('kelp_item', 'dried_kelp', 0.1);
smelt('wet_sponge', 'sponge', 0.15);
smelt('chorus_fruit', 'purpur_block', 0.1);

export function fuelValue(id) { const d = ITEMS[id]; return d ? d.fuel || 0 : 0; }

// recettes faisables avec un inventaire donné (pour le livre de recettes)
export function craftableRecipes(counts, size) {
  const out = [];
  for (const r of RECIPES) {
    if (r.type === 'shaped' && (r.w > size || r.h > size)) continue;
    if (r.type === 'shapeless' && r.ings.length > size * size) continue;
    const need = [];
    if (r.type === 'shaped') { for (const row of r.grid) for (const c of row) if (c !== ' ') need.push(r.keys[c]); }
    else need.push(...r.ings);
    const avail = new Map(counts);
    let ok = true;
    for (const set of need) {
      let got = false;
      for (const id of set) { const n = avail.get(id) || 0; if (n > 0) { avail.set(id, n - 1); got = true; break; } }
      if (!got) { ok = false; break; }
    }
    if (ok) out.push(r);
  }
  return out;
}
export { ItemStack };
export const _unused = BLOCKS;
