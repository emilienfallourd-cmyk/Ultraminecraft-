// Registre des blocs — inspiré fidèlement de Minecraft
import { MODELS, BOXES } from './models.js';

export const BLOCKS = [];          // id -> def
export const BLOCK = {};           // key -> id
export const BLOCK_BY_KEY = {};    // key -> def

// Faces: 0 +X(est) 1 -X(ouest) 2 +Y(haut) 3 -Y(bas) 4 +Z(sud) 5 -Z(nord)
// facing (meta & 3): 0 sud(+Z) 1 ouest(-X) 2 nord(-Z) 3 est(+X)
export const FACING_FACE = [4, 1, 5, 0];

function resolveTex(t) {
  if (!t) return null;
  if (typeof t === 'string') return [t, t, t, t, t, t];
  const side = t.side || t.all;
  const top = t.top || t.end || t.all || side;
  const bottom = t.bottom || t.end || t.all || top;
  return [t.east || side, t.west || side, top, bottom, t.south || side, t.north || side];
}

let nextId = 0;
function B(key, name, o = {}) {
  const def = {
    id: nextId++, key, name,
    shape: o.shape || 'cube',
    render: o.render || 'solid',
    opaque: o.opaque !== undefined ? o.opaque : ((o.shape || 'cube') === 'cube' && (o.render || 'solid') === 'solid'),
    solid: o.solid !== undefined ? o.solid : true,
    lightEmit: o.light || 0,
    lightFilter: 0,
    tint: o.tint || 0,
    hardness: o.hardness !== undefined ? o.hardness : 1,
    tool: o.tool || null,
    level: o.level || 0,
    requiresTool: !!o.requiresTool,
    drops: o.drops,
    sound: o.sound || 'stone',
    replaceable: !!o.replaceable,
    gravity: !!o.gravity,
    wave: o.wave || 0,
    model: o.model || null,
    boxes: o.boxes || null,
    climbable: !!o.climbable,
    fluid: o.fluid || null,
    flammable: !!o.flammable,
    item: o.item !== undefined ? o.item : true,
    cat: o.cat || 'build',
    friction: o.friction || 0.6,
    speed: o.speed || 1,
    support: o.support || null, // 'below' | 'wall' | 'plant' | 'sand' | 'water'
    facing: !!o.facing,        // orientation horizontale à la pose
    axis: !!o.axis,            // bûches
    tex: resolveTex(o.tex || key),
    texFront: o.front || null, // texture de face avant (facing)
    cullSame: o.cullSame !== undefined ? o.cullSame : true,
    damage: o.damage || 0,     // dégâts de contact (cactus, magma, feu)
    xp: o.xp || 0,
    blast: o.blast !== undefined ? o.blast : (o.hardness !== undefined ? o.hardness : 1) * 1.2,
    interact: o.interact || null,
    ...o.extra,
  };
  if (o.filter !== undefined) def.lightFilter = o.filter;
  else def.lightFilter = def.opaque ? 15 : 0;
  BLOCKS[def.id] = def;
  BLOCK[key] = def.id;
  BLOCK_BY_KEY[key] = def;
  return def;
}

const stone = { tool: 'pickaxe', requiresTool: true, sound: 'stone' };
const wood = { tool: 'axe', sound: 'wood', flammable: true };
const dirtLike = { tool: 'shovel', sound: 'gravel' };
const plant = { shape: 'cross', render: 'cutout', solid: false, hardness: 0, replaceable: true, sound: 'grass', support: 'plant', cat: 'nature', wave: 2 };
const flower = { ...plant, replaceable: false, wave: 2 };

// ------------------------------------------------------------------ BASE
B('air', 'Air', { shape: 'none', render: 'none', solid: false, opaque: false, item: false, replaceable: true, hardness: 0 });
B('stone', 'Roche', { ...stone, hardness: 1.5, drops: 'cobblestone', blast: 6 });
B('grass_block', 'Bloc d\'herbe', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, tint: 1, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: 'dirt', cat: 'nature' });
B('dirt', 'Terre', { ...dirtLike, hardness: 0.5, cat: 'nature' });
B('cobblestone', 'Pierre', { ...stone, hardness: 2, blast: 6 });
B('bedrock', 'Bedrock', { hardness: -1, blast: 3600000 });
B('sand', 'Sable', { ...dirtLike, hardness: 0.5, gravity: true, sound: 'sand', cat: 'nature' });
B('red_sand', 'Sable rouge', { ...dirtLike, hardness: 0.5, gravity: true, sound: 'sand', cat: 'nature' });
B('gravel', 'Gravier', { ...dirtLike, hardness: 0.6, gravity: true, cat: 'nature', drops: (r) => r.chance(0.1) ? 'flint' : 'gravel' });
B('clay', 'Argile', { ...dirtLike, hardness: 0.6, drops: [['clay_ball', 4]], cat: 'nature' });
B('podzol', 'Podzol', { ...dirtLike, tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' }, hardness: 0.5, drops: 'dirt', cat: 'nature' });
B('coarse_dirt', 'Terre stérile', { ...dirtLike, hardness: 0.5, cat: 'nature' });
B('mycelium', 'Mycélium', { ...dirtLike, tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' }, hardness: 0.6, drops: 'dirt', cat: 'nature' });
B('moss_block', 'Bloc de mousse', { hardness: 0.1, tool: 'hoe', sound: 'grass', cat: 'nature' });
B('mud', 'Boue', { ...dirtLike, hardness: 0.5, cat: 'nature' });
B('farmland', 'Terre labourée', { ...dirtLike, shape: 'model', model: 'farmland', boxes: 'farmland', opaque: false, filter: 15, tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, hardness: 0.6, drops: 'dirt', cat: 'nature' });
B('dirt_path', 'Chemin', { ...dirtLike, shape: 'model', model: 'farmland', boxes: 'farmland', opaque: false, filter: 15, tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' }, hardness: 0.65, drops: 'dirt', cat: 'nature' });
B('snow_block', 'Bloc de neige', { ...dirtLike, hardness: 0.2, sound: 'snow', drops: [['snowball', 4]], tex: 'snow', cat: 'nature' });
B('snow', 'Neige', { shape: 'model', model: 'snow_layer', boxes: 'snow_layer', render: 'solid', opaque: false, tool: 'shovel', hardness: 0.1, sound: 'snow', replaceable: true, drops: 'snowball', support: 'below', cat: 'nature', solid: true });
B('snowy_grass_block', 'Bloc d\'herbe enneigé', { tex: { top: 'snow', bottom: 'dirt', side: 'grass_snow_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: 'dirt', item: false });
B('ice', 'Glace', { render: 'translucent', opaque: false, filter: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: null, cat: 'nature' });
B('packed_ice', 'Glace compactée', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: null, cat: 'nature' });
B('blue_ice', 'Glace bleue', { hardness: 2.8, tool: 'pickaxe', sound: 'glass', friction: 0.989, drops: null, cat: 'nature', light: 0 });

// --------------------------------------------------------------- FLUIDES
B('water', 'Eau', { shape: 'fluid', render: 'translucent', solid: false, opaque: false, fluid: 'water', filter: 2, tint: 3, hardness: 100, replaceable: true, item: false, tex: 'water_still' });
B('lava', 'Lave', { shape: 'fluid', render: 'solid', solid: false, opaque: false, fluid: 'lava', filter: 15, light: 15, hardness: 100, replaceable: true, item: false, tex: 'lava_still', damage: 4 });

// ------------------------------------------------------------- MINERAIS
const ore = (key, name, h, lvl, drop, xp, deep) => {
  B(key, name, { ...stone, hardness: h, level: lvl, drops: drop, xp, cat: 'nature' });
  if (deep) B('deepslate_' + key, name + ' des abîmes', { ...stone, hardness: h * 1.5, level: lvl, drops: drop, xp, cat: 'nature' });
};
ore('coal_ore', 'Minerai de charbon', 3, 0, 'coal', 1, true);
ore('iron_ore', 'Minerai de fer', 3, 1, 'raw_iron', 0, true);
ore('copper_ore', 'Minerai de cuivre', 3, 1, [['raw_copper', 2, 4]], 0, true);
ore('gold_ore', 'Minerai d\'or', 3, 2, 'raw_gold', 0, true);
ore('redstone_ore', 'Minerai de redstone', 3, 2, [['redstone', 4, 5]], 3, true);
ore('lapis_ore', 'Minerai de lapis-lazuli', 3, 1, [['lapis_lazuli', 4, 8]], 3, true);
ore('diamond_ore', 'Minerai de diamant', 3, 2, 'diamond', 5, true);
ore('emerald_ore', 'Minerai d\'émeraude', 3, 2, 'emerald', 5, true);
B('nether_quartz_ore', 'Minerai de quartz du Nether', { ...stone, hardness: 3, drops: 'quartz', xp: 3, cat: 'nature' });
B('nether_gold_ore', 'Minerai d\'or du Nether', { ...stone, hardness: 3, drops: [['gold_nugget', 2, 6]], xp: 1, cat: 'nature' });
B('ancient_debris', 'Débris antiques', { ...stone, tex: { top: 'ancient_debris_top', side: 'ancient_debris_side' }, hardness: 30, level: 3, blast: 1200, cat: 'nature' });

// ---------------------------------------------------------------- PIERRES
B('granite', 'Granite', { ...stone, hardness: 1.5, cat: 'nature' });
B('diorite', 'Diorite', { ...stone, hardness: 1.5, cat: 'nature' });
B('andesite', 'Andésite', { ...stone, hardness: 1.5, cat: 'nature' });
B('polished_granite', 'Granite poli', { ...stone, hardness: 1.5 });
B('polished_diorite', 'Diorite polie', { ...stone, hardness: 1.5 });
B('polished_andesite', 'Andésite polie', { ...stone, hardness: 1.5 });
B('deepslate', 'Ardoise des abîmes', { ...stone, tex: { top: 'deepslate_top', side: 'deepslate' }, hardness: 3, drops: 'cobbled_deepslate', cat: 'nature' });
B('cobbled_deepslate', 'Ardoise des abîmes taillée', { ...stone, hardness: 3.5 });
B('deepslate_bricks', 'Briques d\'ardoise des abîmes', { ...stone, hardness: 3.5 });
B('deepslate_tiles', 'Carreaux d\'ardoise des abîmes', { ...stone, hardness: 3.5 });
B('reinforced_deepslate', 'Ardoise des abîmes renforcée', { tex: { top: 'reinforced_deepslate_top', side: 'reinforced_deepslate_side' }, hardness: -1, blast: 3600000 });
B('tuff', 'Tuf', { ...stone, hardness: 1.5, cat: 'nature' });
B('calcite', 'Calcite', { ...stone, hardness: 0.75, cat: 'nature' });
B('smooth_stone', 'Roche lisse', { ...stone, hardness: 2 });
B('stone_bricks', 'Pierres taillées', { ...stone, hardness: 1.5 });
B('mossy_stone_bricks', 'Pierres taillées moussues', { ...stone, hardness: 1.5 });
B('cracked_stone_bricks', 'Pierres taillées craquelées', { ...stone, hardness: 1.5 });
B('chiseled_stone_bricks', 'Pierres taillées sculptées', { ...stone, hardness: 1.5 });
B('mossy_cobblestone', 'Pierre moussue', { ...stone, hardness: 2 });
B('bricks', 'Briques', { ...stone, hardness: 2 });
B('sandstone', 'Grès', { ...stone, tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' }, hardness: 0.8 });
B('chiseled_sandstone', 'Grès sculpté', { ...stone, tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'chiseled_sandstone' }, hardness: 0.8 });
B('cut_sandstone', 'Grès taillé', { ...stone, tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'cut_sandstone' }, hardness: 0.8 });
B('red_sandstone', 'Grès rouge', { ...stone, tex: { top: 'red_sandstone_top', bottom: 'red_sandstone_bottom', side: 'red_sandstone' }, hardness: 0.8 });
B('obsidian', 'Obsidienne', { ...stone, hardness: 50, level: 3, blast: 1200 });
B('crying_obsidian', 'Obsidienne pleureuse', { ...stone, hardness: 50, level: 3, light: 10, blast: 1200 });
B('bone_block', 'Bloc d\'os', { ...stone, tex: { top: 'bone_block_top', side: 'bone_block_side' }, axis: true, hardness: 2 });
B('terracotta', 'Terre cuite', { ...stone, hardness: 1.25 });

// ------------------------------------------------------------------ BOIS
const WOODS = [
  ['oak', 'chêne'], ['spruce', 'sapin'], ['birch', 'bouleau'], ['jungle', 'acajou'],
  ['acacia', 'acacia'], ['dark_oak', 'chêne noir'], ['cherry', 'cerisier'],
];
for (const [w, fr] of WOODS) {
  B(w + '_log', 'Bûche de ' + fr, { ...wood, tex: { end: w + '_log_top', side: w + '_log' }, axis: true, hardness: 2, cat: 'nature' });
  B(w + '_planks', 'Planches de ' + fr, { ...wood, hardness: 2 });
  B(w + '_leaves', 'Feuilles de ' + fr, {
    render: 'cutout', opaque: false, filter: 1, hardness: 0.2, tool: 'hoe', sound: 'grass', cullSame: false,
    tint: w === 'spruce' ? 4 : w === 'birch' ? 5 : w === 'cherry' ? 0 : 2, wave: 1, cat: 'nature', flammable: true,
    drops: (r, tool) => {
      if (tool === 'shears') return [w + '_leaves'];
      const out = [];
      if (r.chance(0.05)) out.push(w + '_sapling');
      if (r.chance(0.02)) out.push('stick');
      if ((w === 'oak' || w === 'dark_oak') && r.chance(0.005)) out.push('apple');
      return out;
    },
  });
  B(w + '_sapling', 'Pousse de ' + fr, { ...flower, wave: 0, extra: { sapling: w } });
}
B('crimson_stem', 'Tige carmin', { ...wood, tex: { end: 'crimson_stem_top', side: 'crimson_stem' }, axis: true, hardness: 2, flammable: false, cat: 'nature' });
B('warped_stem', 'Tige biscornue', { ...wood, tex: { end: 'warped_stem_top', side: 'warped_stem' }, axis: true, hardness: 2, flammable: false, cat: 'nature' });
B('crimson_planks', 'Planches carmin', { ...wood, hardness: 2, flammable: false });
B('warped_planks', 'Planches biscornues', { ...wood, hardness: 2, flammable: false });
B('bookshelf', 'Bibliothèque', { ...wood, tex: { top: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, drops: [['book', 3]], cat: 'deco' });
B('crafting_table', 'Établi', { ...wood, tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', south: 'crafting_table_front', north: 'crafting_table_front' }, hardness: 2.5, interact: 'crafting', cat: 'func' });
B('chest', 'Coffre', { ...wood, shape: 'model', model: 'chest', boxes: 'chest', opaque: false, render: 'solid', facing: true, hardness: 2.5, interact: 'chest', cat: 'func', tex: 'chest_side' });
B('oak_fence', 'Barrière en chêne', { ...wood, shape: 'model', model: 'fence', boxes: 'fence', opaque: false, tex: 'oak_planks', hardness: 2, cat: 'deco' });
B('oak_door', 'Porte en chêne', { ...wood, shape: 'model', model: 'door', boxes: 'door', opaque: false, render: 'cutout', facing: true, hardness: 3, interact: 'door', tex: 'oak_door_bottom', cat: 'func', drops: (r, t, meta) => (meta & 8) ? [] : ['oak_door'] });
B('ladder', 'Échelle', { ...wood, shape: 'model', model: 'ladder', boxes: 'ladder', opaque: false, solid: false, render: 'cutout', facing: true, climbable: true, hardness: 0.4, support: 'wall', cat: 'deco' });
B('oak_stairs', 'Escalier en chêne', { ...wood, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'oak_planks', hardness: 2, filter: 0, cat: 'build' });
B('oak_slab', 'Dalle en chêne', { ...wood, shape: 'model', model: 'slab', boxes: 'slab', opaque: false, tex: 'oak_planks', hardness: 2, cat: 'build' });
B('spruce_stairs', 'Escalier en sapin', { ...wood, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'spruce_planks', hardness: 2, cat: 'build' });

// ------------------------------------------------------------ CONSTRUCTION
B('glass', 'Verre', { render: 'translucent', opaque: false, hardness: 0.3, sound: 'glass', drops: null, cat: 'build' });
B('cobblestone_stairs', 'Escalier en pierre', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'cobblestone', hardness: 2 });
B('stone_brick_stairs', 'Escalier en pierres taillées', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'stone_bricks', hardness: 1.5 });
B('sandstone_stairs', 'Escalier en grès', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'sandstone', hardness: 0.8 });
B('brick_stairs', 'Escalier en briques', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'bricks', hardness: 2 });
B('stone_slab', 'Dalle en roche', { ...stone, shape: 'model', model: 'slab', boxes: 'slab', opaque: false, tex: 'smooth_stone', hardness: 2 });
B('cobblestone_slab', 'Dalle en pierre', { ...stone, shape: 'model', model: 'slab', boxes: 'slab', opaque: false, tex: 'cobblestone', hardness: 2 });
B('stone_brick_slab', 'Dalle en pierres taillées', { ...stone, shape: 'model', model: 'slab', boxes: 'slab', opaque: false, tex: 'stone_bricks', hardness: 2 });
B('sandstone_slab', 'Dalle en grès', { ...stone, shape: 'model', model: 'slab', boxes: 'slab', opaque: false, tex: 'sandstone', hardness: 2 });
B('cobblestone_wall', 'Muret de pierre', { ...stone, shape: 'model', model: 'wall', boxes: 'fence', opaque: false, tex: 'cobblestone', hardness: 2 });
B('iron_bars', 'Barreaux de fer', { ...stone, shape: 'model', model: 'bars', boxes: 'bars', opaque: false, render: 'cutout', hardness: 5, sound: 'metal', cat: 'deco' });

const COLORS = [
  ['white', 'blanc', 'blanche'], ['orange', 'orange', 'orange'], ['magenta', 'magenta', 'magenta'], ['light_blue', 'bleu clair', 'bleu clair'],
  ['yellow', 'jaune', 'jaune'], ['lime', 'vert clair', 'vert clair'], ['pink', 'rose', 'rose'], ['gray', 'gris', 'grise'],
  ['light_gray', 'gris clair', 'gris clair'], ['cyan', 'cyan', 'cyan'], ['purple', 'violet', 'violette'], ['blue', 'bleu', 'bleue'],
  ['brown', 'marron', 'marron'], ['green', 'vert', 'verte'], ['red', 'rouge', 'rouge'], ['black', 'noir', 'noire'],
];
export const COLOR_KEYS = COLORS.map((c) => c[0]);
for (const [c, m, f] of COLORS) B(c + '_wool', 'Laine ' + f, { hardness: 0.8, tool: 'shears', sound: 'wool', flammable: true, cat: 'deco' });
for (const [c, m] of COLORS) B(c + '_concrete', 'Béton ' + m, { ...stone, hardness: 1.8, cat: 'build' });
for (const [c, m, f] of COLORS) B(c + '_terracotta', 'Terre cuite ' + f, { ...stone, hardness: 1.25, cat: 'build' });
for (const c of ['white', 'light_blue', 'lime', 'pink', 'purple', 'red', 'black', 'yellow']) {
  const fr = COLORS.find((x) => x[0] === c);
  B(c + '_stained_glass', 'Verre ' + fr[1], { render: 'translucent', opaque: false, hardness: 0.3, sound: 'glass', drops: null, cat: 'deco', cullSame: true });
}

// ------------------------------------------------------- BLOCS MINÉRAUX
B('coal_block', 'Bloc de charbon', { ...stone, hardness: 5 });
B('iron_block', 'Bloc de fer', { ...stone, hardness: 5, level: 1, sound: 'metal' });
B('gold_block', 'Bloc d\'or', { ...stone, hardness: 3, level: 2, sound: 'metal' });
B('diamond_block', 'Bloc de diamant', { ...stone, hardness: 5, level: 2, sound: 'metal' });
B('emerald_block', 'Bloc d\'émeraude', { ...stone, hardness: 5, level: 2, sound: 'metal' });
B('lapis_block', 'Bloc de lapis-lazuli', { ...stone, hardness: 3, level: 1 });
B('redstone_block', 'Bloc de redstone', { ...stone, hardness: 5, sound: 'metal', light: 0 });
B('copper_block', 'Bloc de cuivre', { ...stone, hardness: 3, level: 1, sound: 'metal' });
B('netherite_block', 'Bloc de netherite', { ...stone, hardness: 50, level: 3, sound: 'metal' });
B('amethyst_block', 'Bloc d\'améthyste', { ...stone, hardness: 1.5, sound: 'glass', cat: 'nature' });

// -------------------------------------------------------------- FONCTIONNEL
B('furnace', 'Fourneau', { ...stone, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side' }, front: 'furnace_front', facing: true, hardness: 3.5, interact: 'furnace', cat: 'func' });
B('lit_furnace', 'Fourneau allumé', { ...stone, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side' }, front: 'furnace_front_on', facing: true, light: 13, hardness: 3.5, interact: 'furnace', drops: 'furnace', item: false });
B('tnt', 'TNT', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', interact: 'tnt', blast: 0, cat: 'redstone' });
B('torch', 'Torche', { shape: 'model', model: 'torch', render: 'cutout', solid: false, opaque: false, light: 14, hardness: 0, sound: 'wood', support: 'torch', cat: 'deco', tex: 'torch' });
B('soul_torch', 'Torche des âmes', { shape: 'model', model: 'torch', render: 'cutout', solid: false, opaque: false, light: 10, hardness: 0, sound: 'wood', support: 'torch', cat: 'deco', tex: 'soul_torch' });
B('lantern', 'Lanterne', { shape: 'model', model: 'lantern', boxes: 'lantern', render: 'cutout', opaque: false, light: 15, hardness: 3.5, tool: 'pickaxe', sound: 'metal', cat: 'deco', tex: 'lantern' });
B('soul_lantern', 'Lanterne des âmes', { shape: 'model', model: 'lantern', boxes: 'lantern', render: 'cutout', opaque: false, light: 10, hardness: 3.5, tool: 'pickaxe', sound: 'metal', cat: 'deco', tex: 'soul_lantern' });
B('glowstone', 'Pierre lumineuse', { hardness: 0.3, sound: 'glass', light: 15, drops: [['glowstone_dust', 2, 4]], cat: 'deco' });
B('sea_lantern', 'Lanterne aquatique', { hardness: 0.3, sound: 'glass', light: 15, drops: [['prismarine_crystals', 2, 3]], cat: 'deco' });
B('shroomlight', 'Champilampe', { hardness: 1, sound: 'wool', light: 15, cat: 'nature' });
B('jack_o_lantern', 'Citrouille-lanterne', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, front: 'jack_o_lantern', facing: true, light: 15, hardness: 1, tool: 'axe', sound: 'wood', cat: 'deco' });
B('pumpkin', 'Citrouille', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood', cat: 'nature' });
B('carved_pumpkin', 'Citrouille sculptée', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, front: 'carved_pumpkin', facing: true, hardness: 1, tool: 'axe', sound: 'wood', cat: 'deco' });
B('melon', 'Pastèque', { tex: { top: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', drops: [['melon_slice', 3, 7]], cat: 'nature' });
B('hay_block', 'Botte de foin', { tex: { top: 'hay_block_top', side: 'hay_block_side' }, axis: true, hardness: 0.5, tool: 'hoe', sound: 'grass', cat: 'deco' });
B('red_bed', 'Lit rouge', { shape: 'model', model: 'bed', boxes: 'bed', opaque: false, facing: true, hardness: 0.2, sound: 'wool', interact: 'bed', cat: 'func', tex: 'bed_red_top', drops: (r, t, meta) => (meta & 8) ? ['red_bed'] : [] });
B('spawner', 'Générateur de monstres', { ...stone, render: 'cutout', opaque: false, hardness: 5, drops: [], xp: 25, cat: 'func', filter: 0 });
B('cobweb', 'Toile d\'araignée', { shape: 'cross', render: 'cutout', solid: false, opaque: false, hardness: 4, tool: 'sword', sound: 'wool', drops: 'string', extra: { slow: 0.05 }, cat: 'deco' });
B('cauldron', 'Chaudron', { ...stone, shape: 'model', model: 'cauldron', boxes: 'full', opaque: false, tex: 'cauldron_side', hardness: 2, cat: 'func' });
B('anvil', 'Enclume', { ...stone, shape: 'model', model: 'anvil', boxes: 'anvil', opaque: false, facing: true, tex: 'anvil', hardness: 5, sound: 'metal', cat: 'func' });
B('enchanting_table', 'Table d\'enchantement', { ...stone, shape: 'model', model: 'enchanting_table', boxes: 'enchanting_table', opaque: false, tex: 'enchanting_table_side', hardness: 5, level: 3, light: 7, cat: 'func' });
B('bell', 'Cloche', { ...stone, shape: 'model', model: 'bell', boxes: 'bell', opaque: false, tex: 'gold_block', hardness: 5, sound: 'metal', interact: 'bell', cat: 'deco' });
B('campfire', 'Feu de camp', { ...wood, shape: 'model', model: 'campfire', boxes: 'campfire', render: 'cutout', opaque: false, tex: 'campfire_log', light: 15, hardness: 2, damage: 1, cat: 'deco' });
B('composter', 'Composteur', { ...wood, shape: 'model', model: 'cauldron', boxes: 'full', opaque: false, tex: 'composter_side', hardness: 0.6, cat: 'func' });
B('barrel', 'Tonneau', { ...wood, tex: { top: 'barrel_top', bottom: 'barrel_bottom', side: 'barrel_side' }, hardness: 2.5, interact: 'chest', cat: 'func' });
B('beacon', 'Balise', { render: 'translucent', opaque: false, hardness: 3, light: 15, sound: 'glass', cat: 'func' });

// ---------------------------------------------------------------- PLANTES
B('short_grass', 'Herbe', { ...plant, tint: 1, drops: (r) => r.chance(0.125) ? ['wheat_seeds'] : [] });
B('fern', 'Fougère', { ...plant, tint: 1, drops: (r) => r.chance(0.125) ? ['wheat_seeds'] : [] });
B('tall_grass', 'Hautes herbes', { ...plant, tint: 1, tex: 'tall_grass_bottom', extra: { tall: true }, drops: (r) => r.chance(0.125) ? ['wheat_seeds'] : [] });
B('tall_grass_top', 'Hautes herbes', { ...plant, tint: 1, item: false, extra: { tallTop: 'tall_grass' }, drops: [] });
B('large_fern', 'Grande fougère', { ...plant, tint: 1, tex: 'large_fern_bottom', extra: { tall: true } });
B('large_fern_top', 'Grande fougère', { ...plant, tint: 1, item: false, extra: { tallTop: 'large_fern' }, drops: [] });
B('dead_bush', 'Buisson mort', { ...plant, drops: (r) => [['stick', r.range(0, 2)]] });
const FLOWERS = [
  ['dandelion', 'Pissenlit'], ['poppy', 'Coquelicot'], ['blue_orchid', 'Orchidée bleue'], ['allium', 'Allium'],
  ['azure_bluet', 'Houstonie bleue'], ['red_tulip', 'Tulipe rouge'], ['orange_tulip', 'Tulipe orange'], ['white_tulip', 'Tulipe blanche'],
  ['pink_tulip', 'Tulipe rose'], ['oxeye_daisy', 'Marguerite'], ['cornflower', 'Bleuet'], ['lily_of_the_valley', 'Muguet'],
];
export const FLOWER_KEYS = FLOWERS.map((f) => f[0]);
for (const [k, n] of FLOWERS) B(k, n, { ...flower });
B('rose_bush', 'Rosier', { ...flower, tex: 'rose_bush_bottom', extra: { tall: true } });
B('rose_bush_top', 'Rosier', { ...flower, item: false, extra: { tallTop: 'rose_bush' }, drops: [] });
B('lilac', 'Lilas', { ...flower, tex: 'lilac_bottom', extra: { tall: true } });
B('lilac_top', 'Lilas', { ...flower, item: false, extra: { tallTop: 'lilac' }, drops: [] });
B('pink_petals', 'Pétales roses', { shape: 'model', model: 'petals', render: 'cutout', solid: false, opaque: false, hardness: 0, replaceable: true, sound: 'grass', support: 'plant', cat: 'nature' });
B('red_mushroom', 'Champignon rouge', { ...flower, wave: 0, light: 0 });
B('brown_mushroom', 'Champignon brun', { ...flower, wave: 0, light: 1 });
B('red_mushroom_block', 'Bloc de champignon rouge', { hardness: 0.2, tool: 'axe', sound: 'wood', cat: 'nature', drops: (r) => [['red_mushroom', r.range(0, 2)]] });
B('brown_mushroom_block', 'Bloc de champignon brun', { hardness: 0.2, tool: 'axe', sound: 'wood', cat: 'nature', drops: (r) => [['brown_mushroom', r.range(0, 2)]] });
B('mushroom_stem', 'Pied de champignon', { hardness: 0.2, tool: 'axe', sound: 'wood', cat: 'nature', drops: [] });
B('cactus', 'Cactus', { shape: 'model', model: 'cactus', boxes: 'cactus', render: 'cutout', opaque: false, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'wool', support: 'sand', damage: 1, cat: 'nature' });
B('sugar_cane', 'Canne à sucre', { ...plant, tint: 1, replaceable: false, support: 'cane', wave: 0, drops: 'sugar_cane' });
B('bamboo', 'Bambou', { shape: 'model', model: 'bamboo', boxes: 'bamboo', render: 'cutout', solid: true, opaque: false, hardness: 1, tool: 'axe', sound: 'wood', support: 'cane', cat: 'nature', tex: 'bamboo_stalk' });
B('vine', 'Lianes', { shape: 'model', model: 'vine', render: 'cutout', solid: false, opaque: false, tint: 2, hardness: 0.2, replaceable: true, climbable: true, sound: 'grass', wave: 1, cat: 'nature', drops: (r, t) => t === 'shears' ? ['vine'] : [] });
B('lily_pad', 'Nénuphar', { shape: 'model', model: 'lily_pad', boxes: 'lily_pad', render: 'cutout', opaque: false, tint: 6, hardness: 0, sound: 'grass', support: 'water', cat: 'nature' });
B('seagrass', 'Herbe aquatique', { ...plant, wave: 3, extra: { waterlogged: true }, drops: [] , item: false});
B('kelp', 'Varech', { ...plant, wave: 3, replaceable: false, extra: { waterlogged: true }, support: 'kelp', item: false, drops: 'kelp_item' });
B('kelp_plant', 'Varech', { ...plant, wave: 3, replaceable: false, extra: { waterlogged: true }, support: 'kelp', item: false, drops: 'kelp_item' });
const CORALS = [['tube', 'tubulaire'], ['brain', 'cerveau'], ['bubble', 'bulles'], ['fire', 'de feu'], ['horn', 'corné']];
export const CORAL_KEYS = CORALS.map((c) => c[0]);
for (const [c, fr] of CORALS) {
  B(c + '_coral_block', 'Bloc de corail ' + fr, { ...stone, hardness: 1.5, cat: 'nature' });
  B(c + '_coral', 'Corail ' + fr, { ...plant, wave: 3, replaceable: false, extra: { waterlogged: true }, cat: 'nature' });
}
B('sweet_berry_bush', 'Buisson de baies sucrées', { ...plant, replaceable: false, damage: 0.5, extra: { slow: 0.4 }, drops: [['sweet_berries', 1, 3]] });
B('wheat', 'Blé', { shape: 'model', model: 'crop', render: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'farmland', item: false, tex: 'wheat_stage7', extra: { crop: { stages: 8, tex: 'wheat_stage', seed: 'wheat_seeds', product: 'wheat' } } });
B('carrots', 'Carottes', { shape: 'model', model: 'crop', render: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'farmland', item: false, tex: 'carrots_stage3', extra: { crop: { stages: 4, tex: 'carrots_stage', seed: 'carrot', product: 'carrot' } } });
B('potatoes', 'Pommes de terre', { shape: 'model', model: 'crop', render: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'farmland', item: false, tex: 'potatoes_stage3', extra: { crop: { stages: 4, tex: 'potatoes_stage', seed: 'potato', product: 'potato' } } });
B('fire', 'Feu', { shape: 'model', model: 'fire', render: 'cutout', solid: false, opaque: false, light: 15, hardness: 0, replaceable: true, item: false, damage: 1, drops: [], tex: 'fire', sound: 'wool' });
B('soul_fire', 'Feu des âmes', { shape: 'model', model: 'fire', render: 'cutout', solid: false, opaque: false, light: 10, hardness: 0, replaceable: true, item: false, damage: 2, drops: [], tex: 'soul_fire', sound: 'wool' });

// ---------------------------------------------------------------- NETHER
B('netherrack', 'Netherrack', { ...stone, hardness: 0.4, cat: 'nature' });
B('soul_sand', 'Sable des âmes', { ...dirtLike, boxes: 'soul_sand', hardness: 0.5, sound: 'sand', speed: 0.4, cat: 'nature' });
B('soul_soil', 'Terre des âmes', { ...dirtLike, hardness: 0.5, sound: 'sand', cat: 'nature' });
B('basalt', 'Basalte', { ...stone, tex: { top: 'basalt_top', side: 'basalt_side' }, axis: true, hardness: 1.25, cat: 'nature' });
B('blackstone', 'Roche noire', { ...stone, tex: { top: 'blackstone_top', side: 'blackstone' }, hardness: 1.5, cat: 'nature' });
B('magma_block', 'Bloc de magma', { ...stone, hardness: 0.5, light: 3, damage: 1, extra: { magma: true }, cat: 'nature' });
B('nether_bricks', 'Briques du Nether', { ...stone, hardness: 2 });
B('red_nether_bricks', 'Briques rouges du Nether', { ...stone, hardness: 2 });
B('nether_brick_fence', 'Barrière en briques du Nether', { ...stone, shape: 'model', model: 'fence', boxes: 'fence', opaque: false, tex: 'nether_bricks', hardness: 2, cat: 'deco' });
B('nether_brick_stairs', 'Escalier en briques du Nether', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'nether_bricks', hardness: 2 });
B('nether_wart_block', 'Bloc de verrues du Nether', { hardness: 1, tool: 'hoe', sound: 'wool', cat: 'nature' });
B('warped_wart_block', 'Bloc de verrues biscornues', { hardness: 1, tool: 'hoe', sound: 'wool', cat: 'nature' });
B('crimson_nylium', 'Nylium carmin', { ...stone, tex: { top: 'crimson_nylium', bottom: 'netherrack', side: 'crimson_nylium_side' }, hardness: 0.4, drops: 'netherrack', cat: 'nature' });
B('warped_nylium', 'Nylium biscornu', { ...stone, tex: { top: 'warped_nylium', bottom: 'netherrack', side: 'warped_nylium_side' }, hardness: 0.4, drops: 'netherrack', cat: 'nature' });
B('crimson_fungus', 'Champignon carmin', { ...flower, wave: 0, support: 'nylium' });
B('warped_fungus', 'Champignon biscornu', { ...flower, wave: 0, support: 'nylium' });
B('crimson_roots', 'Racines carmin', { ...plant, support: 'nylium' });
B('warped_roots', 'Racines biscornues', { ...plant, support: 'nylium' });
B('weeping_vines', 'Lianes pleureuses', { ...plant, support: null, climbable: true, replaceable: false, wave: 1 });
B('nether_wart', 'Verrues du Nether', { shape: 'model', model: 'crop', render: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'soul_sand', tex: 'nether_wart_stage2', extra: { crop: { stages: 3, tex: 'nether_wart_stage', seed: 'nether_wart', product: 'nether_wart' } }, cat: 'nature' });
B('nether_portal', 'Portail du Nether', { shape: 'model', model: 'portal', render: 'translucent', solid: false, opaque: false, light: 11, hardness: -1, item: false, drops: [], extra: { portal: 'nether' }, sound: 'glass' });
B('quartz_block', 'Bloc de quartz', { ...stone, tex: { top: 'quartz_block_top', side: 'quartz_block_side' }, hardness: 0.8 });
B('gilded_blackstone', 'Roche noire dorée', { ...stone, hardness: 1.5 });
B('polished_blackstone_bricks', 'Briques de roche noire polie', { ...stone, hardness: 1.5 });

// ------------------------------------------------------------------- END
B('end_stone', 'Pierre de l\'End', { ...stone, hardness: 3, blast: 9, cat: 'nature' });
B('end_stone_bricks', 'Briques de pierre de l\'End', { ...stone, hardness: 3 });
B('purpur_block', 'Bloc de purpur', { ...stone, hardness: 1.5 });
B('purpur_pillar', 'Pilier de purpur', { ...stone, tex: { top: 'purpur_pillar_top', side: 'purpur_pillar' }, axis: true, hardness: 1.5 });
B('purpur_stairs', 'Escalier en purpur', { ...stone, shape: 'model', model: 'stairs', boxes: 'stairs', opaque: false, facing: true, tex: 'purpur_block', hardness: 1.5 });
B('end_rod', 'Barre de l\'End', { shape: 'model', model: 'end_rod', boxes: 'end_rod', render: 'cutout', opaque: false, solid: true, light: 14, hardness: 0, sound: 'wood', cat: 'deco' });
B('chorus_plant', 'Plante de chorus', { shape: 'model', model: 'chorus', boxes: 'chorus', opaque: false, hardness: 0.4, tool: 'axe', sound: 'wood', drops: (r) => r.chance(0.5) ? ['chorus_fruit'] : [], cat: 'nature' });
B('chorus_flower', 'Fleur de chorus', { hardness: 0.4, tool: 'axe', sound: 'wood', render: 'cutout', opaque: false, cat: 'nature' });
B('end_portal_frame', 'Cadre de portail de l\'End', { shape: 'model', model: 'end_portal_frame', boxes: 'end_portal_frame', opaque: false, facing: true, hardness: -1, light: 1, drops: [], interact: 'eye', tex: { top: 'end_portal_frame_top', bottom: 'end_stone', side: 'end_portal_frame_side' }, cat: 'func', filter: 15 });
B('end_portal', 'Portail de l\'End', { shape: 'model', model: 'end_portal', render: 'translucent', solid: false, opaque: false, light: 15, hardness: -1, item: false, drops: [], extra: { portal: 'end' } });
B('end_gateway', 'Portail d\'accès de l\'End', { render: 'translucent', solid: false, opaque: false, light: 15, hardness: -1, item: false, drops: [], extra: { portal: 'gateway' } });
B('dragon_egg', 'Œuf de dragon', { shape: 'model', model: 'dragon_egg', boxes: 'dragon_egg', opaque: false, hardness: 3, light: 1, gravity: true, cat: 'deco' });

// ------------------------------------------------------------- DEEP DARK
B('sculk', 'Sculk', { hardness: 0.2, tool: 'hoe', sound: 'sculk', xp: 1, cat: 'nature' });
B('sculk_catalyst', 'Catalyseur sculk', { tex: { top: 'sculk_catalyst_top', bottom: 'sculk_catalyst_bottom', side: 'sculk_catalyst_side' }, hardness: 3, tool: 'hoe', light: 6, sound: 'sculk', xp: 5, cat: 'nature' });
B('sculk_sensor', 'Capteur sculk', { shape: 'model', model: 'sculk_sensor', boxes: 'half', opaque: false, render: 'cutout', hardness: 1.5, tool: 'hoe', light: 1, sound: 'sculk', xp: 5, cat: 'redstone' });
B('sculk_shrieker', 'Hurleur sculk', { shape: 'model', model: 'sculk_shrieker', boxes: 'half', opaque: false, render: 'cutout', hardness: 3, tool: 'hoe', sound: 'sculk', xp: 5, cat: 'redstone' });
B('wither_skeleton_skull', 'Crâne de wither squelette', { shape: 'model', model: 'skull', boxes: 'skull', opaque: false, facing: true, hardness: 1, sound: 'stone', cat: 'deco', tex: 'wither_skull' });
// --- ajoutés ensuite (toujours à la fin pour garder les identifiants des mondes sauvegardés)
B('prismarine', 'Prismarine', { ...stone, hardness: 1.5, sound: 'stone' });
B('prismarine_bricks', 'Briques de prismarine', { ...stone, hardness: 1.5 });
B('dark_prismarine', 'Prismarine sombre', { ...stone, hardness: 1.5 });
B('sponge', 'Éponge', { hardness: 0.6, tool: 'hoe', sound: 'grass', cat: 'deco' });
B('wet_sponge', 'Éponge mouillée', { hardness: 0.6, tool: 'hoe', sound: 'grass', cat: 'deco' });
B('rail', 'Rail', { shape: 'model', model: 'rail', boxes: 'rail', render: 'cutout', opaque: false, solid: false, hardness: 0.7, tool: 'pickaxe', sound: 'metal', support: 'below', cat: 'redstone' });
B('cracked_mossy_bricks', 'Pierres taillées moussues fissurées', { ...stone, hardness: 1.5, tex: 'mossy_stone_bricks' });
B('note_block', 'Bloc musical', { ...wood, hardness: 0.8, interact: 'note', cat: 'redstone' });
B('jukebox', 'Juke-box', { ...wood, hardness: 2, interact: 'jukebox', tex: { top: 'jukebox_top', bottom: 'jukebox_side', side: 'jukebox_side' }, cat: 'deco' });

// Applique les modèles / collisions
for (const b of BLOCKS) {
  if (b.model) b.modelFn = MODELS[b.model];
  if (typeof b.boxes === 'string') b.boxFn = BOXES[b.boxes];
}

export const NUM_BLOCKS = BLOCKS.length;

// Tableaux rapides pour le mailleur / la lumière
export const B_OPAQUE = new Uint8Array(1024);
export const B_SOLID = new Uint8Array(1024);
export const B_FILTER = new Uint8Array(1024);
export const B_EMIT = new Uint8Array(1024);
export const B_RENDER = new Uint8Array(1024); // 0 none, 1 solid, 2 cutout, 3 translucent
export const B_SHAPE = new Uint8Array(1024);  // 0 none,1 cube,2 cross,3 model,4 fluid
export const B_FLUID = new Uint8Array(1024);  // 0,1 eau,2 lave
export const B_REPLACEABLE = new Uint8Array(1024);
const SHAPES = { none: 0, cube: 1, cross: 2, model: 3, fluid: 4 };
const RENDERS = { none: 0, solid: 1, cutout: 2, translucent: 3 };
for (const b of BLOCKS) {
  B_OPAQUE[b.id] = b.opaque ? 1 : 0;
  B_SOLID[b.id] = b.solid ? 1 : 0;
  B_FILTER[b.id] = b.lightFilter;
  B_EMIT[b.id] = b.lightEmit;
  B_RENDER[b.id] = RENDERS[b.render];
  B_SHAPE[b.id] = SHAPES[b.shape];
  B_FLUID[b.id] = b.fluid === 'water' ? 1 : b.fluid === 'lava' ? 2 : 0;
  B_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
}
// les plantes aquatiques sont considérées comme de l'eau
export const B_WATERLOGGED = new Uint8Array(1024);
for (const b of BLOCKS) if (b.waterlogged) B_WATERLOGGED[b.id] = 1;

export function isWaterAt(id) { return B_FLUID[id] === 1 || B_WATERLOGGED[id] === 1; }

export function getBoxes(id, meta, world, x, y, z) {
  const b = BLOCKS[id];
  if (!b || !b.solid) return null;
  if (b.boxFn) return b.boxFn(meta, world, x, y, z);
  if (b.shape === 'cube' || b.boxes === 'full') return FULL_BOX;
  return FULL_BOX;
}
export const FULL_BOX = [[0, 0, 0, 1, 1, 1]];

export function getSelectionBoxes(id, meta, world, x, y, z) {
  const b = BLOCKS[id];
  if (!b || b.shape === 'none') return null;
  if (b.boxFn) return b.boxFn(meta, world, x, y, z);
  if (b.shape === 'cross') return [[0.15, 0, 0.15, 0.85, b.tall || b.tallTop ? 1 : 0.8, 0.85]];
  if (b.shape === 'fluid') return null;
  if (b.model === 'torch') return (meta & 7) === 0 ? [[0.4, 0, 0.4, 0.6, 0.62, 0.6]] : [[0.35, 0.2, 0.35, 0.65, 0.8, 0.65]];
  if (b.model === 'crop' || b.model === 'fire') return [[0, 0, 0, 1, 0.25, 1]];
  if (b.model === 'vine') return [[0, 0, 0, 1, 1, 1]];
  if (b.model === 'portal') return [[0, 0, 0.375, 1, 1, 0.625]];
  if (b.model === 'end_portal') return [[0, 0, 0, 1, 0.75, 1]];
  if (b.model === 'petals') return [[0, 0, 0, 1, 0.1, 1]];
  return FULL_BOX;
}

export function blockId(key) {
  const id = BLOCK[key];
  if (id === undefined) throw new Error('Bloc inconnu: ' + key);
  return id;
}
