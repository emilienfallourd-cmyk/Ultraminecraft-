// Tables de butin des coffres (clés d'objets, converties en identifiants à l'ouverture)
const TABLES = {
  dungeon: [['bread', 1, 3, 10], ['iron_ingot', 1, 4, 10], ['gold_ingot', 1, 4, 5], ['bone', 1, 8, 10], ['rotten_flesh', 1, 8, 10],
    ['string', 1, 8, 10], ['gunpowder', 1, 8, 10], ['coal', 1, 4, 10], ['redstone', 1, 4, 8], ['golden_apple', 1, 1, 3],
    ['enchanted_golden_apple', 1, 1, 1], ['wheat', 1, 4, 10], ['bucket', 1, 1, 6], ['diamond', 1, 2, 2], ['saddle', 1, 1, 4], ['name_tag', 1, 1, 3]],
  desert_pyramid: [['bone', 4, 6, 25], ['rotten_flesh', 3, 7, 16], ['gunpowder', 1, 8, 10], ['sand', 1, 8, 10], ['string', 1, 8, 10],
    ['gold_ingot', 2, 7, 15], ['iron_ingot', 1, 5, 15], ['emerald', 1, 3, 15], ['diamond', 1, 3, 5], ['golden_apple', 1, 1, 20],
    ['enchanted_golden_apple', 1, 1, 2], ['saddle', 1, 1, 10]],
  igloo: [['apple', 1, 3, 15], ['coal', 1, 4, 15], ['gold_nugget', 1, 3, 10], ['stone_axe', 1, 1, 2], ['rotten_flesh', 1, 1, 10], ['emerald', 1, 1, 1], ['wheat', 2, 3, 10], ['golden_apple', 1, 1, 1]],
  ruined_portal: [['obsidian', 1, 2, 40], ['flint', 1, 4, 40], ['iron_nugget', 9, 18, 40], ['flint_and_steel', 1, 1, 40], ['fire_charge', 1, 1, 40],
    ['golden_apple', 1, 1, 15], ['gold_nugget', 4, 24, 15], ['golden_sword', 1, 1, 15], ['golden_pickaxe', 1, 1, 15], ['golden_carrot', 4, 12, 15],
    ['enchanted_golden_apple', 1, 1, 1], ['gold_block', 1, 2, 1], ['clock', 1, 1, 5]],
  shipwreck: [['iron_ingot', 1, 5, 20], ['gold_nugget', 1, 10, 10], ['emerald', 1, 5, 10], ['diamond', 1, 1, 3], ['paper', 1, 12, 20], ['wheat', 8, 21, 10],
    ['carrot', 4, 8, 10], ['potato', 2, 6, 10], ['coal', 2, 8, 10], ['rotten_flesh', 5, 24, 10], ['map', 1, 1, 5]],
  village: [['bread', 1, 4, 15], ['apple', 1, 5, 15], ['iron_ingot', 1, 5, 10], ['wheat', 3, 7, 15], ['emerald', 1, 3, 8], ['oak_sapling', 3, 7, 10],
    ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['diamond', 1, 3, 2], ['potato', 1, 7, 10], ['carrot', 1, 7, 10]],
  stronghold: [['ender_pearl', 1, 1, 10], ['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5],
    ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5],
    ['golden_apple', 1, 1, 1], ['book', 1, 3, 10]],
  ancient_city: [['enchanted_golden_apple', 1, 2, 2], ['diamond_hoe', 1, 1, 6], ['diamond_leggings', 1, 1, 4], ['echo_shard', 1, 3, 8],
    ['amethyst_shard', 1, 15, 6], ['bone', 1, 15, 8], ['sculk', 4, 10, 6], ['candle', 1, 4, 6], ['experience_bottle', 1, 3, 5],
    ['golden_apple', 1, 1, 4], ['book', 3, 10, 5], ['diamond', 1, 3, 4], ['netherite_ingot', 1, 1, 1]],
  nether_fortress: [['diamond', 1, 3, 5], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 15], ['golden_sword', 1, 1, 5], ['golden_chestplate', 1, 1, 5],
    ['flint_and_steel', 1, 1, 5], ['nether_wart', 3, 7, 5], ['saddle', 1, 1, 10], ['obsidian', 2, 4, 2], ['blaze_rod', 1, 2, 6]],
  bastion: [['gold_block', 1, 3, 10], ['gold_ingot', 4, 9, 15], ['netherite_scrap', 1, 1, 4], ['ancient_debris', 1, 2, 6], ['diamond', 1, 3, 6],
    ['crying_obsidian', 1, 5, 6], ['golden_apple', 1, 1, 6], ['enchanted_golden_apple', 1, 1, 1], ['magma_cream', 2, 6, 6]],
  end_city: [['diamond', 2, 7, 5], ['iron_ingot', 4, 8, 10], ['gold_ingot', 2, 7, 15], ['emerald', 2, 6, 2], ['beetroot_seeds', 1, 10, 5],
    ['diamond_sword', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['iron_sword', 1, 1, 3]],
};

Object.assign(TABLES, {
  village_smith: [['iron_ingot', 1, 5, 10], ['bread', 1, 3, 15], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['obsidian', 3, 7, 5], ['oak_sapling', 3, 7, 5], ['gold_ingot', 1, 3, 5], ['diamond', 1, 3, 3], ['apple', 1, 3, 15]],
  pillager_outpost: [['crossbow', 1, 1, 6], ['wheat', 3, 5, 7], ['potato', 2, 5, 5], ['carrot', 3, 5, 5], ['dark_oak_log', 2, 3, 10], ['experience_bottle', 1, 1, 7], ['string', 1, 6, 4], ['arrow', 2, 7, 4], ['iron_ingot', 1, 3, 3], ['emerald', 1, 2, 4]],
  jungle_temple: [['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 2, 7, 15], ['emerald', 1, 3, 2], ['bone', 4, 6, 20], ['rotten_flesh', 3, 7, 16], ['saddle', 1, 1, 3], ['bamboo', 1, 3, 15], ['golden_apple', 1, 1, 2]],
  mineshaft: [['golden_apple', 1, 1, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5], ['lapis_lazuli', 4, 9, 5], ['diamond', 1, 2, 3], ['coal', 3, 8, 10], ['bread', 1, 3, 15], ['iron_pickaxe', 1, 1, 1], ['torch', 1, 16, 15], ['name_tag', 1, 1, 3]],
  ocean_ruin: [['coal', 1, 4, 10], ['stone_axe', 1, 1, 2], ['rotten_flesh', 1, 1, 5], ['emerald', 1, 1, 1], ['wheat', 2, 3, 10], ['gold_nugget', 1, 3, 5], ['fishing_rod', 1, 1, 1], ['heart_of_the_sea', 1, 1, 1]],
});

export function lootChest(table, rng) {
  const t = TABLES[table] || TABLES.dungeon;
  const items = new Array(27).fill(null);
  const total = t.reduce((s, e) => s + e[3], 0);
  const rolls = 4 + rng.int(5);
  for (let r = 0; r < rolls; r++) {
    let p = rng.next() * total;
    for (const [k, a, b, wgt] of t) {
      p -= wgt;
      if (p <= 0) {
        let slot = rng.int(27), tries = 0;
        while (items[slot] && tries++ < 30) slot = rng.int(27);
        items[slot] = { id: k, count: a + rng.int(b - a + 1) };
        break;
      }
    }
  }
  return items;
}
