// Pure resource harvesting & mining balance calculations.
// - Wood harvested is increased by 3x from the previous reduced level (0.8 * 3 = 2.4 per log for woodcutters, 0.4 * 3 = 1.2 per log block).
// - Woodcutters scale wood yield up with their level (personal woodcutter level and/or lumber camp level).
// - Stone harvested is increased by 2x from the previous reduced level (0.5 * 2 = 1.0 per stone block / quarry cycle).
// - Food harvested is increased by 3x from the previous level (farmer wheat yield 1.5 * 3 = 4.5, wheat block 3 * 3 = 9, foraging & hunting 3x).
// - Gold is mined and smelted slower than iron, and occurs more rarely than iron.
// - Rare resources (mana crystals, amethyst, uranium) are mined slower and occur even more rarely than gold.

export const WOOD_BASE_REDUCTION = 5;
export const STONE_BASE_REDUCTION = 2;
export const WOOD_GATHER_MULTIPLIER = 3;
export const STONE_GATHER_MULTIPLIER = 2;
export const FOOD_GATHER_MULTIPLIER = 3;
export const FARM_FOOD_REDUCTION = 12; // 4 * 3 (additional 3x reduction on farm food harvesting)
export const MINER_COAL_IRON_REDUCTION = 2.5;
export const BLACKSMITH_GUARD_ARMOR_COST_REDUCTION = 3;

export const BASE_WOOD_PER_LOG_VILLAGER = +((4 / WOOD_BASE_REDUCTION) * WOOD_GATHER_MULTIPLIER).toFixed(4); // 2.4 (3x of 0.8)
export const BASE_WOOD_PER_LOG_BLOCK = +((2 / WOOD_BASE_REDUCTION) * WOOD_GATHER_MULTIPLIER).toFixed(4);    // 1.2 (3x of 0.4)
export const BASE_WOOD_CLEAR_LOG = +((1 / WOOD_BASE_REDUCTION) * WOOD_GATHER_MULTIPLIER).toFixed(4);        // 0.6 (3x of 0.2)
export const BASE_STONE_DROP = +((1 / STONE_BASE_REDUCTION) * STONE_GATHER_MULTIPLIER).toFixed(4);           // 1.0 (2x of 0.5)
export const BASE_FARMER_WHEAT_YIELD = +((1.5 * FOOD_GATHER_MULTIPLIER) / FARM_FOOD_REDUCTION).toFixed(4);  // 0.375 (3x less than 1.125)
export const BASE_WHEAT_BLOCK_DROP = +((3 * FOOD_GATHER_MULTIPLIER) / FARM_FOOD_REDUCTION).toFixed(4);      // 0.75 (3x less than 2.25)
export const BASE_FORAGE_FOOD_DROP = 1 * FOOD_GATHER_MULTIPLIER;                                            // 3   (3x of 1)
export const BASE_MINER_COAL_DROP = 1 / MINER_COAL_IRON_REDUCTION; // 0.4 (was 1)
export const BASE_MINER_IRON_DROP = 1 / MINER_COAL_IRON_REDUCTION; // 0.4 (was 1)

/** Cost per blacksmith guard armor forging cycle (reduced by 3x from { iron: 2, coal: 1 } so iron can accumulate). */
export const BLACKSMITH_GUARD_ARMOR_COST = {
  iron: +(2 / BLACKSMITH_GUARD_ARMOR_COST_REDUCTION).toFixed(4),
  coal: +(1 / BLACKSMITH_GUARD_ARMOR_COST_REDUCTION).toFixed(4),
};

/** Base storage capacity at level 1 for storage buildings (scales linearly with building level). */
export const BASE_STORAGE_CAPACITY = {
  town_hall: {
    wood: 300,
    stone: 300,
    food: 250,
    coal: 200,
    iron_ore: 200,
    iron: 200,
    steel: 200,
    gold_ore: 200,
    gold: 200,
    crystal: 100,
    uranium: 100,
  },
  granary: {
    food: 400,
    wood: 200,
  },
  storehouse: {
    wood: 350,
    stone: 350,
    food: 200,
    coal: 200,
    iron_ore: 200,
    iron: 200,
    steel: 200,
    gold_ore: 200,
    gold: 200,
    crystal: 100,
    uranium: 100,
  },
};

/** Returns the resource storage capacity map added by a building of `typeId` at `level`. */
export function buildingStorageCapacity(typeId, level = 1) {
  const base = BASE_STORAGE_CAPACITY[typeId];
  if (!base) return {};
  const lv = Math.max(1, Math.min(10, level | 0));
  const out = {};
  for (const k in base) out[k] = base[k] * lv;
  return out;
}

/**
 * Computes total village resource storage caps from completed Town Hall, Granaries (Амбар), and Storehouses (Склад).
 */
export function computeResourceCaps(buildings = [], fallbackThLevel = 1) {
  const caps = {};
  let hasTh = false;
  for (const b of buildings || []) {
    if (!b || b.state !== 'complete') continue;
    if (b.type === 'town_hall') hasTh = true;
    const add = buildingStorageCapacity(b.type, b.level || 1);
    for (const k in add) caps[k] = (caps[k] || 0) + add[k];
  }
  if (!hasTh) {
    const base = buildingStorageCapacity('town_hall', fallbackThLevel);
    for (const k in base) caps[k] = (caps[k] || 0) + base[k];
  }
  return caps;
}

/**
 * Per-level work speed & output growth rate by building type.
 * Farms gain +30% per level, while mines gain +12% (10-15%) and lumber camps gain +15%.
 */
export const WORK_GROWTH_PER_LEVEL = {
  farm: 0.30,
  lumber_camp: 0.15,
  mine: 0.12,
  default: 0.15,
};

/** Returns the work speed / output multiplier for a building of `typeId` at `level` (1..10). */
export function buildingLevelWorkBonus(typeId, level = 1) {
  const lv = Math.max(1, Math.min(10, level | 0));
  const rate = WORK_GROWTH_PER_LEVEL[typeId] ?? WORK_GROWTH_PER_LEVEL.default;
  return +(1 + rate * (lv - 1)).toFixed(4);
}

/**
 * Farm harvest multiplier combining +30% per-level work bonus, high-level intensive farming surge,
 * and extra field expansion bonus when the farm grows into a large estate (>36 plots).
 */
export function farmHarvestMultiplier(level = 1, plotsCount = 36) {
  const lv = Math.max(1, Math.min(10, level | 0));
  const workBonus = buildingLevelWorkBonus('farm', lv); // 1 + 0.30 * (lv - 1)
  const highLevelBonus = lv >= 3 ? 1 + 0.35 * (lv - 2) : 1;
  const plots = Math.max(36, Number(plotsCount) || 36);
  const sizeBonus = plots > 36 ? 1 + Math.min(1.2, (plots - 36) / 36) : 1;
  return +(workBonus * highLevelBonus * sizeBonus).toFixed(4);
}

/** Total food harvested by a farmer from a single ripe wheat plot. */
export function farmWheatYield({
  level = 1,
  plotsCount = 36,
  hasAgriculture = false,
  hasGranary = false,
  hasZiggurat = false,
} = {}) {
  return +(
    BASE_FARMER_WHEAT_YIELD
    * farmHarvestMultiplier(level, plotsCount)
    * (hasAgriculture ? 1.5 : 1)
    * (hasGranary ? 1.25 : 1)
    * (hasZiggurat ? 1.25 : 1)
  ).toFixed(4);
}

/** Scales coal and iron harvested by miners down by 2.5x, and gold even slightly lower than iron. */
export function minerOreYield(res, amount = 1) {
  const n = Math.max(0, Number(amount) || 0);
  if (res === 'coal' || res === 'iron_ore' || res === 'iron') {
    return +(n / MINER_COAL_IRON_REDUCTION).toFixed(4);
  }
  if (res === 'gold_ore' || res === 'gold') {
    return +(n / (MINER_COAL_IRON_REDUCTION * 1.25)).toFixed(4);
  }
  return n;
}


/** Effective level of a woodcutter (combines villager skill level and workplace building level, 1..10). */
export function woodcutterEffectiveLevel(villager) {
  const vLv = Math.max(1, (villager?.level | 0) || 1);
  const wp = villager?.workplace;
  const wpLv = wp && (!wp.state || wp.state === 'complete')
    ? Math.max(1, (wp.level | 0) || 1)
    : 1;
  return Math.min(10, Math.max(vLv, wpLv));
}

/** Wood harvesting multiplier for a woodcutter of a given level (+15% per level). */
export function woodcutterLevelMultiplier(level = 1) {
  const lv = Math.max(1, Math.min(10, level | 0));
  return +(1 + WORK_GROWTH_PER_LEVEL.lumber_camp * (lv - 1)).toFixed(4);
}

/** Total wood harvested by a woodcutter of `level` from felling a tree with `logsCount` logs. */
export function woodcutterTreeYield(logsCount, level = 1) {
  const logs = Math.max(0, Number(logsCount) || 0);
  return +(logs * BASE_WOOD_PER_LOG_VILLAGER * woodcutterLevelMultiplier(level)).toFixed(2);
}

/** Number of felled trees required for a woodcutter to advance from `level` to `level + 1`. */
export function woodcutterTreesForNextLevel(level = 1) {
  const lv = Math.max(1, level | 0);
  return 2 + lv * 2;
}

/**
  * Block hardness and mining duration multipliers by ore type.
  * Enforces: coal < iron < gold < amethyst < crystal.
  */
export const ORE_HARDNESS = {
  coal_ore: 3.5,
  iron_ore: 4.5,
  gold_ore: 7.5,
  amethyst: 9.0,
  crystal_ore: 10.5,
};

export const ORE_MINING_SLOWDOWN = {
  coal_ore: 1.0,
  iron_ore: 1.15,
  gold_ore: 1.7,
  amethyst: 2.05,
  crystal_ore: 2.3,
};

/** Smelting and crushing durations (seconds at workSpeed = 1) — gold is slower than iron. */
export const SMELT_TIME = {
  blacksmith: { iron: 5.5, gold: 9.0 },
  smelter: { iron: 6.5, gold: 10.5 },
  crusher: { iron_ore: 2.0, gold_ore: 3.5 },
};

/**
  * Quarry ore find probabilities for a single mining cycle.
  * Guarantees strict rarity ordering:
  *   coal > iron_ore > gold_ore > crystal > uranium
  */
export function quarryOreChances({ deep = false, mineLevel = 1, hasMiningTech = false, hasNuclearTech = false } = {}) {
  const lvl = 1 + 0.22 * (Math.max(1, mineLevel | 0) - 1);
  const lucky = hasMiningTech ? 1.35 : 1;
  if (deep) {
    const coal = +(0.18 * lvl * lucky).toFixed(6);
    const iron_ore = +(0.095 * lvl * lucky).toFixed(6);
    const gold_ore = +(0.038 * lvl * lucky).toFixed(6);
    const crystal = +(0.015 * lvl * lucky).toFixed(6);
    const uranium = hasNuclearTech ? +(0.005 * lvl * lucky).toFixed(6) : 0;
    return { coal, iron_ore, gold_ore, crystal, uranium };
  }
  const coal = +(0.08 * lvl * lucky).toFixed(6);
  const iron_ore = +(0.04 * lvl * lucky).toFixed(6);
  const gold_ore = +(0.014 * lvl * lucky).toFixed(6);
  const crystal = +(0.005 * lvl * lucky).toFixed(6);
  return { coal, iron_ore, gold_ore, crystal, uranium: 0 };
}

/**
 * Resolves a single random roll `r` in [0, 1) against cumulative quarry ore chances.
 * Returns 'coal' | 'iron_ore' | 'gold_ore' | 'crystal' | null.
 */
export function pickQuarryOre(r, chances) {
  const pC = chances.coal || 0;
  const pI = pC + (chances.iron_ore || 0);
  const pG = pI + (chances.gold_ore || 0);
  const pX = pG + (chances.crystal || 0);
  if (r < pC) return 'coal';
  if (r < pI) return 'iron_ore';
  if (r < pG) return 'gold_ore';
  if (r < pX) return 'crystal';
  return null;
}

/** Multiplier applied to base zombie gold drop chance so early waves don't flood the player with gold. */
export const ZOMBIE_GOLD_CHANCE_MUL = 0.2;

/**
 * Computes gold & crystal loot dropped by a killed zombie.
 * Keeps gold scarce (1 coin on rare drop for normal zombies, 1-2 for brutes, 5-8 for bosses)
 * and crystals even rarer than gold.
 */
export function computeZombieLoot({ base = 'walker', boss = false, lootChance = 0.4, raisedByNecro = false, wave = 1, rng = Math.random } = {}) {
  if (raisedByNecro) return { gold: 0, crystal: 0 };
  if (boss) {
    return {
      gold: 5 + ((rng() * 4) | 0),
      crystal: 1 + (rng() < 0.5 ? 1 : 0),
    };
  }
  const isBrute = base === 'brute';
  const effGoldChance = Math.min(0.4, Math.max(0, lootChance) * (isBrute ? 0.32 : ZOMBIE_GOLD_CHANCE_MUL));
  const gold = rng() < effGoldChance ? (isBrute && rng() < 0.35 ? 2 : 1) : 0;
  const crystalChance = wave < 3 ? 0 : (isBrute ? 0.025 : 0.004);
  const crystal = rng() < crystalChance ? 1 : 0;
  return { gold, crystal };
}

