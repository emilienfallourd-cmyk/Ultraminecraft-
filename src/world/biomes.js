// Biomes : couleurs (herbe, feuillage, eau), climat, surface
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

export const BIOMES = [];
export const BIOME = {};
let id = 0;
function def(key, name, o) {
  const b = {
    id: id++, key, name,
    grass: hex(o.grass || '#91bd59'), foliage: hex(o.foliage || '#77ab2f'), water: hex(o.water || '#3f76e4'),
    temp: o.temp ?? 0.8, rain: o.rain ?? 0.4, snow: !!o.snow, dry: !!o.dry,
    fog: o.fog ? hex(o.fog) : null, sky: o.sky ? hex(o.sky) : null,
  };
  BIOMES[b.id] = b; BIOME[key] = b.id;
  return b;
}

def('plains', 'Plaines', { grass: '#91bd59', foliage: '#77ab2f' });
def('sunflower_plains', 'Plaines de tournesols', { grass: '#91bd59', foliage: '#77ab2f' });
def('forest', 'Forêt', { grass: '#79c05a', foliage: '#59ae30', temp: 0.7 });
def('flower_forest', 'Forêt fleurie', { grass: '#79c05a', foliage: '#59ae30', temp: 0.7 });
def('birch_forest', 'Forêt de bouleaux', { grass: '#88bb67', foliage: '#6ba941', temp: 0.6 });
def('dark_forest', 'Forêt noire', { grass: '#507a32', foliage: '#59ae30', temp: 0.7 });
def('taiga', 'Taïga', { grass: '#86b783', foliage: '#68a464', water: '#287082', temp: 0.25 });
def('snowy_taiga', 'Taïga enneigée', { grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', temp: -0.5, snow: true });
def('snowy_plains', 'Plaines enneigées', { grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', temp: 0, snow: true });
def('ice_spikes', 'Pics de glace', { grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', temp: 0, snow: true });
def('desert', 'Désert', { grass: '#bfb755', foliage: '#aea42a', water: '#32a598', temp: 2, rain: 0, dry: true });
def('savanna', 'Savane', { grass: '#bfb755', foliage: '#aea42a', water: '#2c8b9c', temp: 2, rain: 0, dry: true });
def('jungle', 'Jungle', { grass: '#59c93c', foliage: '#30bb0b', water: '#14a2c5', temp: 0.95, rain: 0.9 });
def('badlands', 'Badlands', { grass: '#90814d', foliage: '#9e814d', water: '#4e7f81', temp: 2, rain: 0, dry: true });
def('swamp', 'Marais', { grass: '#6a7039', foliage: '#6a7039', water: '#617b64', temp: 0.8, rain: 0.9, fog: '#7c8a6a' });
def('windswept_hills', 'Collines venteuses', { grass: '#8ab689', foliage: '#6da36b', water: '#007bf7', temp: 0.2 });
def('meadow', 'Prairie', { grass: '#83bb6d', foliage: '#63a948', water: '#0e4ecf', temp: 0.5 });
def('cherry_grove', 'Cerisaie', { grass: '#b6db61', foliage: '#b6db61', water: '#5db7ef', temp: 0.5 });
def('snowy_slopes', 'Pentes enneigées', { grass: '#80b497', foliage: '#60a17b', temp: -0.3, snow: true });
def('stony_peaks', 'Pics rocheux', { grass: '#9abe4b', foliage: '#82ac1e', temp: 1 });
def('beach', 'Plage', { grass: '#91bd59', foliage: '#77ab2f', water: '#157cab' });
def('snowy_beach', 'Plage enneigée', { grass: '#80b497', foliage: '#60a17b', water: '#1463a5', temp: 0.05, snow: true });
def('stony_shore', 'Côte rocheuse', { grass: '#8ab689', foliage: '#6da36b', water: '#0d67bb', temp: 0.2 });
def('river', 'Rivière', { water: '#3f76e4' });
def('frozen_river', 'Rivière gelée', { water: '#185390', snow: true, temp: 0 });
def('ocean', 'Océan', { water: '#3f76e4' });
def('deep_ocean', 'Océan profond', { water: '#3f76e4' });
def('warm_ocean', 'Océan tiède', { water: '#43d5ee' });
def('lukewarm_ocean', 'Océan doux', { water: '#45adf2' });
def('cold_ocean', 'Océan froid', { water: '#3d57d6' });
def('frozen_ocean', 'Océan gelé', { water: '#3938c9', snow: true, temp: 0 });
def('mushroom_fields', 'Champs de champignons', { grass: '#55c93f', foliage: '#2bbb0f', water: '#8a8997' });
def('deep_dark', 'Abîmes', { grass: '#91bd59' });
// Nether
def('nether_wastes', 'Désolation du Nether', { temp: 2, rain: 0, fog: '#330808', dry: true });
def('crimson_forest', 'Forêt carmin', { temp: 2, rain: 0, fog: '#330303', dry: true });
def('warped_forest', 'Forêt biscornue', { temp: 2, rain: 0, fog: '#1a051a', dry: true });
def('soul_sand_valley', 'Vallée du sable des âmes', { temp: 2, rain: 0, fog: '#1b4745', dry: true });
def('basalt_deltas', 'Deltas de basalte', { temp: 2, rain: 0, fog: '#685f70', dry: true });
// End
def('the_end', 'L\'End', { temp: 0.5, rain: 0, fog: '#0a0812', dry: true });

export const NUM_BIOMES = BIOMES.length;
// tables rapides
export const BIOME_GRASS = new Uint8Array(256 * 3);
export const BIOME_FOLIAGE = new Uint8Array(256 * 3);
export const BIOME_WATER = new Uint8Array(256 * 3);
for (const b of BIOMES) {
  BIOME_GRASS.set(b.grass, b.id * 3); BIOME_FOLIAGE.set(b.foliage, b.id * 3); BIOME_WATER.set(b.water, b.id * 3);
}
