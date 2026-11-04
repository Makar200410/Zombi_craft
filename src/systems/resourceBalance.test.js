import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WOOD_BASE_REDUCTION,
  STONE_BASE_REDUCTION,
  WOOD_GATHER_MULTIPLIER,
  STONE_GATHER_MULTIPLIER,
  FOOD_GATHER_MULTIPLIER,
  FARM_FOOD_REDUCTION,
  MINER_COAL_IRON_REDUCTION,
  BASE_WOOD_PER_LOG_VILLAGER,
  BASE_WOOD_PER_LOG_BLOCK,
  BASE_WOOD_CLEAR_LOG,
  BASE_STONE_DROP,
  BASE_FARMER_WHEAT_YIELD,
  BASE_WHEAT_BLOCK_DROP,
  BASE_FORAGE_FOOD_DROP,
  BASE_MINER_COAL_DROP,
  BASE_MINER_IRON_DROP,
  WORK_GROWTH_PER_LEVEL,
  buildingLevelWorkBonus,
  farmHarvestMultiplier,
  farmWheatYield,
  minerOreYield,
  ZOMBIE_GOLD_CHANCE_MUL,
  computeZombieLoot,
  woodcutterEffectiveLevel,
  woodcutterLevelMultiplier,
  woodcutterTreeYield,
  ORE_HARDNESS,
  ORE_MINING_SLOWDOWN,
  SMELT_TIME,
  quarryOreChances,
  pickQuarryOre,
  BLACKSMITH_GUARD_ARMOR_COST_REDUCTION,
  BLACKSMITH_GUARD_ARMOR_COST,
  BASE_STORAGE_CAPACITY,
  buildingStorageCapacity,
  computeResourceCaps,
} from './resourceBalance.js';
import { SELLS } from './caravans.js';
import { RESOURCES, ITEMS } from '../core/items.js';
import { B, BLOCKS, LEAF_BLOCKS } from '../core/blocks.js';
import { World } from '../world/World.js';
import { BUILDING_TYPES } from '../village/buildings.js';
import { growOf } from '../village/architecture.js';
import { GameState } from '../core/state.js';
import { Building } from '../village/Building.js';
import { Village } from '../village/Village.js';
import { moveEntity, collides } from '../world/physics.js';
import { findPath } from '../world/pathfinding.js';

const block = (name) => BLOCKS[B[name.toUpperCase()]];

test('Staff of embers (staff_fire) damage is reduced by 1.5x', () => {
  assert.equal(ITEMS.staff_fire.damage, +(14 / 1.5).toFixed(2));
});

test('Wood and foraging food gathering are increased by 3x, while farm wheat is reduced by an additional 3x (12x total)', () => {
  assert.equal(WOOD_BASE_REDUCTION, 5);
  assert.equal(WOOD_GATHER_MULTIPLIER, 3);
  assert.equal(FOOD_GATHER_MULTIPLIER, 3);
  assert.equal(FARM_FOOD_REDUCTION, 12);
  assert.equal(BASE_WOOD_PER_LOG_VILLAGER, 2.4);
  assert.equal(BASE_WOOD_PER_LOG_BLOCK, 1.2);
  assert.equal(BASE_WOOD_CLEAR_LOG, 0.6);
  assert.equal(BASE_FARMER_WHEAT_YIELD, 0.375); // 4.5 / 12
  assert.equal(BASE_WHEAT_BLOCK_DROP, 0.75);     // 9 / 12
  assert.equal(BASE_FORAGE_FOOD_DROP, 3);

  assert.equal(block('log').drop.wood, 1.2);
  assert.equal(block('spruce_log').drop.wood, 1.2);
  assert.equal(block('birch_log').drop.wood, 1.2);
  assert.equal(block('wheat_3').drop.food, 0.75);
  assert.equal(block('mushroom').drop.food, 3);
});

test('Farms have +30% work bonus per level vs 12% on mines and 15% on lumber camps, and expand into large farms with abundant food at high levels', () => {
  assert.equal(WORK_GROWTH_PER_LEVEL.farm, 0.30);
  assert.equal(WORK_GROWTH_PER_LEVEL.lumber_camp, 0.15);
  assert.ok(WORK_GROWTH_PER_LEVEL.mine >= 0.10 && WORK_GROWTH_PER_LEVEL.mine <= 0.15);

  for (let lv = 2; lv <= 10; lv++) {
    const farmBonus = buildingLevelWorkBonus('farm', lv);
    const lumberBonus = buildingLevelWorkBonus('lumber_camp', lv);
    const mineBonus = buildingLevelWorkBonus('mine', lv);
    assert.ok(farmBonus > lumberBonus, `Farm work bonus at L${lv} (${farmBonus}) > lumber camp (${lumberBonus})`);
    assert.ok(lumberBonus > mineBonus, `Lumber camp work bonus at L${lv} (${lumberBonus}) > mine (${mineBonus})`);
    assert.equal(farmBonus, +(1 + 0.30 * (lv - 1)).toFixed(4));
  }

  // Non-farm buildings keep consistent footprints across all tiers so they never pile onto each other
  for (let t = 1; t <= 10; t++) {
    assert.equal(growOf('house', t), 0, `house grow at tier ${t} should be 0`);
    assert.equal(growOf('lumber_camp', t), 0, `lumber_camp grow at tier ${t} should be 0`);
    assert.equal(growOf('mine', t), 0, `mine grow at tier ${t} should be 0`);
    assert.equal(growOf('storehouse', t), 0, `storehouse grow at tier ${t} should be 0`);
    assert.equal(growOf('watchtower', t), 0, `watchtower grow at tier ${t} should be 0`);
  }

  // Farm layout expands in footprint and plot count at higher tiers (36 -> 64 -> 100 -> 144) with no open water traps
  const farmT1 = BUILDING_TYPES.farm.layout(0, 0, 1, growOf('farm', 1));
  const farmT3 = BUILDING_TYPES.farm.layout(0, 0, 3, growOf('farm', 3));
  const farmT4 = BUILDING_TYPES.farm.layout(0, 0, 4, growOf('farm', 4));
  const farmT5 = BUILDING_TYPES.farm.layout(0, 0, 5, growOf('farm', 5));
  const farmT6 = BUILDING_TYPES.farm.layout(0, 0, 6, growOf('farm', 6));

  assert.equal(farmT1.plots.length, 36);
  assert.equal(farmT3.plots.length, 64);
  assert.equal(farmT4.plots.length, 100);
  assert.equal(farmT5.plots.length, 100);
  assert.equal(farmT6.plots.length, 144);
  assert.ok(farmT5.height >= 9, 'Tier 5 farm has windmill landmark height');
  for (const layout of [farmT1, farmT3, farmT4, farmT5, farmT6]) {
    assert.equal(
      layout.blocks.some(b => b.dy === 0 && b.id === B.WATER),
      false,
      'Farm ground floor must not contain open water trenches that trap villagers'
    );
  }

  // High-level large farms yield abundant food compared to level 1
  const yieldL1 = farmWheatYield({ level: 1, plotsCount: farmT1.plots.length });
  const yieldL6 = farmWheatYield({ level: 6, plotsCount: farmT6.plots.length, hasAgriculture: true, hasGranary: true });
  assert.equal(yieldL1, 0.375);
  assert.ok(yieldL6 > yieldL1 * 10, `High-level large farm wheat yield (${yieldL6}) is much larger than L1 (${yieldL1})`);
});

test('All leaf blocks are non-solid so NPCs never get stuck in tree foliage or treat leaves as solid walls/floors', () => {
  for (const id of LEAF_BLOCKS) {
    assert.equal(BLOCKS[id].solid, false, `Leaf block ${BLOCKS[id].name} must have solid: false`);
  }

  const w = new World({ bus: { emit() {} } }, 42);
  w.setBlock(10, 10, 10, B.GRASS);
  // Low-hanging leaves at y=11 (feet) and y=12 (head)
  w.setBlock(10, 11, 10, B.LEAVES);
  w.setBlock(10, 12, 10, B.SPRUCE_LEAVES);
  w.setBlock(10, 13, 10, B.BIRCH_LEAVES);

  assert.equal(w.isSolid(10, 11, 10), false);
  assert.equal(w.isSolid(10, 12, 10), false);
  assert.equal(w.isSolidForCollision(10, 11, 10), false);
  // Ground at y=11 (standing on y=10 grass, inside low-hanging leaves at y=11..12) is walkable!
  assert.equal(w.isWalkable(10, 11, 10), true);
  // Top of leaf canopy at y=14 (standing on y=13 leaves) is NOT walkable floor!
  assert.equal(w.isWalkable(10, 14, 10), false);
  // surfaceY and groundBelow ignore leaves and return the grass block at y=10
  assert.equal(w.surfaceY(10, 10), 10);
  assert.equal(w.groundBelow(10, 15, 10), 10);
});

test('Woodcutter yield scales up with woodcutter or lumber camp level', () => {
  const v1 = { level: 1, workplace: { level: 1 } };
  const v2 = { level: 1, workplace: { level: 2 } };
  const v3 = { level: 3, workplace: { level: 2 } };
  const v5 = { level: 2, workplace: { level: 5 } };

  assert.equal(woodcutterEffectiveLevel(v1), 1);
  assert.equal(woodcutterEffectiveLevel(v2), 2);
  assert.equal(woodcutterEffectiveLevel(v3), 3);
  assert.equal(woodcutterEffectiveLevel(v5), 5);

  for (let lv = 1; lv < 10; lv++) {
    assert.ok(
      woodcutterLevelMultiplier(lv + 1) > woodcutterLevelMultiplier(lv),
      `Level ${lv + 1} multiplier should exceed level ${lv}`
    );
    assert.ok(
      woodcutterTreeYield(5, lv + 1) > woodcutterTreeYield(5, lv),
      `Level ${lv + 1} tree yield should exceed level ${lv}`
    );
  }

  // 5-log tree at level 1 yields 5 * 2.4 = 12 wood (3x of 4 wood)
  assert.ok(Math.abs(woodcutterTreeYield(5, 1) - 12) < 1e-9);
});

test('Stone gathering is increased by 2x from the reduced level across stone blocks', () => {
  assert.equal(STONE_BASE_REDUCTION, 2);
  assert.equal(STONE_GATHER_MULTIPLIER, 2);
  assert.equal(BASE_STONE_DROP, 1);

  assert.equal(block('stone').drop.stone, 1);
  assert.equal(block('cobblestone').drop.stone, 1);
  assert.equal(block('stone_bricks').drop.stone, 1);
  assert.equal(block('dark_stone').drop.stone, 1);
  assert.equal(block('sandstone').drop.stone, 1);
});

test('Merchants sell all buyable resources at tier 1', () => {
  const soldResources = new Set(SELLS.map(([res]) => res));
  for (const res of RESOURCES) {
    if (res === 'gold') continue; // gold is the currency used to buy resources
    assert.ok(soldResources.has(res), `Merchant SELLS should include ${res}`);
  }
  for (const [res, qty, price, minTier] of SELLS) {
    assert.ok(qty > 0, `${res} lot size > 0`);
    assert.ok(price > 0, `${res} price > 0`);
    assert.equal(minTier, 1, `${res} should be available from tier 1`);
  }
});

test('Gold is mined, smelted, and crushed slower than iron, and rarer ores are slower than gold', () => {
  // Block hardness: coal < iron < gold < amethyst < crystal
  assert.ok(ORE_HARDNESS.coal_ore < ORE_HARDNESS.iron_ore);
  assert.ok(ORE_HARDNESS.iron_ore < ORE_HARDNESS.gold_ore);
  assert.ok(ORE_HARDNESS.gold_ore < ORE_HARDNESS.amethyst);
  assert.ok(ORE_HARDNESS.amethyst < ORE_HARDNESS.crystal_ore);

  assert.ok(block('iron_ore').hardness < block('gold_ore').hardness);
  assert.ok(block('gold_ore').hardness < block('amethyst').hardness);
  assert.ok(block('amethyst').hardness < block('crystal_ore').hardness);

  // Villager mining slowdown: coal < iron < gold < amethyst < crystal
  assert.ok(ORE_MINING_SLOWDOWN.coal_ore < ORE_MINING_SLOWDOWN.iron_ore);
  assert.ok(ORE_MINING_SLOWDOWN.iron_ore < ORE_MINING_SLOWDOWN.gold_ore);
  assert.ok(ORE_MINING_SLOWDOWN.gold_ore < ORE_MINING_SLOWDOWN.amethyst);
  assert.ok(ORE_MINING_SLOWDOWN.amethyst < ORE_MINING_SLOWDOWN.crystal_ore);

  // Smelting and crushing times: gold is slower than iron
  assert.ok(SMELT_TIME.blacksmith.gold > SMELT_TIME.blacksmith.iron);
  assert.ok(SMELT_TIME.smelter.gold > SMELT_TIME.smelter.iron);
  assert.ok(SMELT_TIME.crusher.gold_ore > SMELT_TIME.crusher.iron_ore);
});

test('Quarry ore find chances strictly follow rarity hierarchy: coal > iron_ore > gold_ore > crystal > uranium', () => {
  for (let mineLevel = 1; mineLevel <= 10; mineLevel++) {
    const shallow = quarryOreChances({
      deep: false,
      mineLevel,
      hasMiningTech: true,
      hasNuclearTech: true,
    });
    assert.ok(shallow.coal > shallow.iron_ore, `shallow L${mineLevel}: coal > iron_ore`);
    assert.ok(shallow.iron_ore > shallow.gold_ore, `shallow L${mineLevel}: iron_ore > gold_ore`);
    assert.ok(shallow.gold_ore > shallow.crystal, `shallow L${mineLevel}: gold_ore > crystal`);
    assert.equal(shallow.uranium, 0);

    const deep = quarryOreChances({
      deep: true,
      mineLevel,
      hasMiningTech: true,
      hasNuclearTech: true,
    });
    assert.ok(deep.coal > deep.iron_ore, `deep L${mineLevel}: coal > iron_ore`);
    assert.ok(deep.iron_ore > deep.gold_ore, `deep L${mineLevel}: iron_ore > gold_ore`);
    assert.ok(deep.gold_ore > deep.crystal, `deep L${mineLevel}: gold_ore > crystal`);
    assert.ok(deep.crystal > deep.uranium, `deep L${mineLevel}: crystal > uranium`);
    assert.ok(deep.uranium > 0, `deep L${mineLevel}: uranium > 0 when nuclear tech unlocked`);
  }

  // Verify pickQuarryOre maps rolls properly
  const ch = quarryOreChances({ deep: true, mineLevel: 3, hasMiningTech: true, hasNuclearTech: true });
  assert.equal(pickQuarryOre(0.0001, ch), 'coal');
  assert.equal(pickQuarryOre(ch.coal + 0.0001, ch), 'iron_ore');
  assert.equal(pickQuarryOre(ch.coal + ch.iron_ore + 0.0001, ch), 'gold_ore');
  assert.equal(pickQuarryOre(ch.coal + ch.iron_ore + ch.gold_ore + 0.0001, ch), 'crystal');
  assert.equal(pickQuarryOre(0.99, ch), null);
});

test('Miners harvest 2.5x less coal and iron', () => {
  assert.equal(MINER_COAL_IRON_REDUCTION, 2.5);
  assert.ok(Math.abs(BASE_MINER_COAL_DROP - 0.4) < 1e-9);
  assert.ok(Math.abs(BASE_MINER_IRON_DROP - 0.4) < 1e-9);
  assert.ok(Math.abs(minerOreYield('coal', 1) - 0.4) < 1e-9);
  assert.ok(Math.abs(minerOreYield('iron_ore', 1) - 0.4) < 1e-9);
  assert.ok(Math.abs(minerOreYield('iron', 2.5) - 1) < 1e-9);
  // Gold is also slower/rarer than iron
  assert.ok(minerOreYield('gold_ore', 1) < minerOreYield('iron_ore', 1));
});

test('Zombie gold drops are significantly reduced and necromancer minions drop nothing', () => {
  assert.equal(ZOMBIE_GOLD_CHANCE_MUL, 0.2);

  // Necromancer-raised zombies never drop gold
  const necroLoot = computeZombieLoot({
    base: 'walker',
    boss: false,
    lootChance: 0.4,
    raisedByNecro: true,
    wave: 5,
    rng: () => 0.001,
  });
  assert.equal(necroLoot.gold, 0);
  assert.equal(necroLoot.crystal, 0);

  // Regular zombie with lootChance=0.35 has effective chance 0.35 * 0.2 = 0.07
  // Roll 0.10 (which previously dropped gold) now drops 0 gold
  const missLoot = computeZombieLoot({
    base: 'walker',
    boss: false,
    lootChance: 0.35,
    raisedByNecro: false,
    wave: 1,
    rng: () => 0.10,
  });
  assert.equal(missLoot.gold, 0);

  // Even when a regular zombie does drop gold (roll < 0.07), it drops at most 1 gold
  const hitLoot = computeZombieLoot({
    base: 'walker',
    boss: false,
    lootChance: 0.35,
    raisedByNecro: false,
    wave: 1,
    rng: () => 0.01,
  });
  assert.equal(hitLoot.gold, 1);
});

test('Blacksmith guard armor crafting cost is reduced by 3x so iron accumulates', () => {
  assert.equal(BLACKSMITH_GUARD_ARMOR_COST_REDUCTION, 3);
  assert.equal(BLACKSMITH_GUARD_ARMOR_COST.iron, +(2 / 3).toFixed(4));
  assert.equal(BLACKSMITH_GUARD_ARMOR_COST.coal, +(1 / 3).toFixed(4));
});

test('Granary and Storehouse define maximum resource storage capacity and GameState clamps additions at cap', () => {
  const baseCaps = computeResourceCaps([{ type: 'town_hall', level: 1, state: 'complete' }]);
  assert.equal(baseCaps.food, BASE_STORAGE_CAPACITY.town_hall.food);
  assert.equal(baseCaps.wood, BASE_STORAGE_CAPACITY.town_hall.wood);
  assert.equal(baseCaps.iron, BASE_STORAGE_CAPACITY.town_hall.iron);

  const withGranaryAndStorehouse = computeResourceCaps([
    { type: 'town_hall', level: 1, state: 'complete' },
    { type: 'granary', level: 2, state: 'complete' },
    { type: 'storehouse', level: 2, state: 'complete' },
  ]);
  const granaryL2 = buildingStorageCapacity('granary', 2);
  const storehouseL2 = buildingStorageCapacity('storehouse', 2);
  assert.equal(withGranaryAndStorehouse.food, baseCaps.food + granaryL2.food + storehouseL2.food);
  assert.equal(withGranaryAndStorehouse.wood, baseCaps.wood + granaryL2.wood + storehouseL2.wood);
  assert.equal(withGranaryAndStorehouse.iron, baseCaps.iron + storehouseL2.iron);

  // Verify GameState clamps resource additions to the active storage capacity
  const st = new GameState({ emit() {} });
  st.capProvider = (res) => baseCaps[res] ?? Infinity;
  st.add('food', 99999);
  st.add('iron', 99999);
  assert.equal(st.resources.food, baseCaps.food);
  assert.equal(st.resources.iron, baseCaps.iron);
  assert.equal(st.isFull('food'), true);
});

test('Demolishing a building restores natural ground (grass/dirt) and removes the old foundation and quarry pit', () => {
  const bus = { on() {}, emit() {} };
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const world = {
    inBounds() { return true; },
    surfaceY() { return 12; },
    index(x, y, z) { return key(x, y, z); },
    getBlock(x, y, z) { return cells.get(key(x, y, z)) ?? B.AIR; },
    setBlock(x, y, z, id) { cells.set(key(x, y, z), id); },
    rawSet(x, y, z, id) { cells.set(key(x, y, z), id); },
    markChunk() {},
  };
  const state = new GameState(bus);
  const game = {
    bus,
    world,
    state,
    scene: { add() {}, remove() {} },
    particles: { burst() {}, emit() {} },
    ui: { toast() {} },
    entities: [],
  };

  // Prepare flat ground at y = 12
  for (let x = 0; x < 20; x++) {
    for (let z = 0; z < 20; z++) {
      for (let y = 0; y <= 11; y++) world.setBlock(x, y, z, B.DIRT);
      world.setBlock(x, 12, z, B.GRASS);
      for (let y = 13; y <= 24; y++) world.setBlock(x, y, z, B.AIR);
    }
  }

  const village = Object.create(Village.prototype);
  village.game = game;
  village.bus = bus;
  village.nextBuildingId = 1;
  village.buildings = [];
  village.villagers = [];
  village.morphs = [];
  village.removeBuilding = (b) => {
    const idx = village.buildings.indexOf(b);
    if (idx >= 0) village.buildings.splice(idx, 1);
  };
  village.bulkEdit = (list) => {
    for (const [x, y, z, id] of list) world.setBlock(x, y, z, id);
  };
  village.center = { x: 10, y: 12, z: 10 };

  const mine = new Building(village, 'mine', 4, 12, 4, 0, 0);
  mine.state = 'complete';
  mine.progress = 1;
  village.buildings.push(mine);

  // Stamp mine foundation (cobblestone/gravel at y = 12) + superstructure + dig a quarry pit below y = 12
  for (const bl of mine.blocks) {
    world.setBlock(bl.x, bl.y, bl.z, bl.id);
  }
  // Simulate miners having excavated a deep pit down to y = 7 inside the mine footprint
  for (let x = mine.x + 2; x < mine.x + mine.w - 2; x++) {
    for (let z = mine.z + 2; z < mine.z + mine.d - 2; z++) {
      for (let y = 7; y <= 12; y++) {
        world.setBlock(x, y, z, B.AIR);
      }
    }
  }

  // Confirm cobblestone foundation exists before demolish
  let cobbleBefore = 0;
  for (let x = mine.x; x < mine.x + mine.w; x++) {
    for (let z = mine.z; z < mine.z + mine.d; z++) {
      if (world.getBlock(x, 12, z) === B.COBBLESTONE || world.getBlock(x, 12, z) === B.GRAVEL) cobbleBefore++;
    }
  }
  assert.ok(cobbleBefore > 0, 'Mine should have cobblestone/gravel foundation before demolish');

  // Demolish the mine
  const ok = village.demolish(mine);
  assert.equal(ok, true);

  // Verify the entire footprint at y = 12 is now natural grass (B.GRASS), below is B.DIRT, and above is B.AIR
  for (let x = mine.x; x < mine.x + mine.w; x++) {
    for (let z = mine.z; z < mine.z + mine.d; z++) {
      assert.equal(world.getBlock(x, 12, z), B.GRASS, `Footprint (${x},12,${z}) must be restored to B.GRASS`);
      for (let y = 7; y < 12; y++) {
        assert.equal(world.getBlock(x, y, z), B.DIRT, `Excavated pit (${x},${y},${z}) must be filled with B.DIRT`);
      }
      for (let y = 13; y <= 20; y++) {
        assert.equal(world.getBlock(x, y, z), B.AIR, `Superstructure (${x},${y},${z}) must be cleared to B.AIR`);
      }
    }
  }
});

test('Farmers never path on top of farm log fences and physics never snaps a villager inside a solid log block', () => {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const world = {
    size: 32,
    height: 32,
    inBounds(x, y, z) { return x >= 0 && z >= 0 && x < 32 && z < 32 && y >= 0 && y < 32; },
    surfaceY() { return 10; },
    index(x, y, z) { return key(x, y, z); },
    getBlock(x, y, z) { return cells.get(key(Math.floor(x), Math.floor(y), Math.floor(z))) ?? B.AIR; },
    setBlock(x, y, z, id) { cells.set(key(Math.floor(x), Math.floor(y), Math.floor(z)), id); },
    isSolidForCollision(x, y, z) {
      const id = this.getBlock(x, y, z);
      return Boolean(BLOCKS[id]?.solid) && !LEAF_BLOCKS.has(id);
    },
  };

  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 24; z++) {
      world.setBlock(x, 10, z, B.GRASS);
    }
  }

  // Stamp a farm at (4, 10, 4)
  const bus = { on() {}, emit() {} };
  const game = { bus, world, state: new GameState(bus) };
  const village = { game, nextBuildingId: 1 };
  const farm = new Building(village, 'farm', 4, 10, 4, 0, 0);
  for (const bl of farm.blocks) {
    world.setBlock(bl.x, bl.y, bl.z, bl.id);
  }

  // 1) Pathfinding from outside the farm corner (13, 11, 11) to a corner plot (11, 11, 11) must route through a gate and NEVER step onto y=12 (top of B.LOG fence)
  const path = findPath(world, { x: 13, y: 11, z: 11 }, { x: 11, y: 11, z: 11 }, { maxNodes: 2000 });
  assert.ok(path && path.length > 2, 'Path into farm should be found via gate');
  for (const wp of path) {
    assert.equal(wp.y, 11, `Path waypoint (${wp.x},${wp.y},${wp.z}) must stay on ground level y=11 and never climb onto the farm fence`);
  }

  // 2) Physics: if a farmer is slightly overlapping the farm corner log at x=12, z=11 (e.g. p.x=11.75) and moves away (v.x = -2), moveEntity must depenetrate and move left, NEVER snapping p.x into 12.301 inside the log
  const farmer = {
    kind: 'villager',
    radius: 0.3,
    height: 1.8,
    autoStep: true,
    onGround: true,
    position: { x: 11.75, y: 11, z: 11.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { x: -2, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  };
  moveEntity(world, farmer, 0.05);
  assert.equal(collides(world, farmer.position.x, farmer.position.y, farmer.position.z, farmer.radius, farmer.height, true), false, 'Farmer must not be embedded in the log block after moveEntity');
  assert.ok(farmer.position.x < 11.71, `Farmer position.x (${farmer.position.x}) must be outside the log at x=12, never snapped into 12.301`);
});

test('Smart villager anti-stuck guardian rescues woodcutters and builders buried in mine foundation or tree trunks, and nextQuarryBlock never returns non-solid blocks', () => {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const w = {
    size: 40,
    height: 32,
    sea: 4,
    inBounds(x, y, z) { return x >= 0 && z >= 0 && x < 40 && z < 40 && y >= 0 && y < 32; },
    index(x, y, z) { return key(Math.floor(x), Math.floor(y), Math.floor(z)); },
    getBlock(x, y, z) { return cells.get(key(Math.floor(x), Math.floor(y), Math.floor(z))) ?? B.AIR; },
    setBlock(x, y, z, id) { cells.set(key(Math.floor(x), Math.floor(y), Math.floor(z)), id); },
    isSolid(x, y, z) {
      const id = this.getBlock(x, y, z);
      return Boolean(BLOCKS[id]?.solid) && !LEAF_BLOCKS.has(id);
    },
    isSolidForCollision(x, y, z) { return this.isSolid(x, y, z); },
    isWalkable(x, y, z) {
      return !this.isSolid(x, y, z) && !this.isSolid(x, y + 1, z) && this.isSolid(x, y - 1, z);
    },
    surfaceY(x, z) {
      for (let y = 30; y >= 0; y--) {
        if (this.isSolid(x, y, z)) return y;
      }
      return 0;
    },
  };

  for (let z = 6; z <= 24; z++) {
    for (let x = 6; x <= 24; x++) {
      // Simulate uneven terrain: depression at y=9 inside (12..18, 12..18), normal ground y=10 outside
      const gy = (x >= 12 && x <= 18 && z >= 12 && z <= 18) ? 9 : 10;
      for (let y = 0; y <= gy; y++) {
        w.setBlock(x, y, z, y === gy ? B.GRASS : B.DIRT);
      }
    }
  }
  // Place a tree trunk at (14, 10..12, 14) inside the depression
  w.setBlock(14, 10, 14, B.LOG);
  w.setBlock(14, 11, 14, B.LOG);
  w.setBlock(14, 12, 14, B.LOG);

  const bus = { on() {}, emit() {} };
  const game = { bus, world: w, state: new GameState(bus), time: 10 };
  const village = Object.create(Village.prototype);
  village.game = game;
  village.buildings = [];
  village.byId = new Map();
  village.cellIndex = new Map();
  village.villagers = [];
  village.quarryReserved = new Set();
  village.nextBuildingId = 1;
  village.editBlock = (x, y, z, id) => w.setBlock(x, y, z, id);
  village.foot = {
    map: new Map(),
    get(x, z) { return this.map.get(`${x},${z}`) || 0; },
    set(x, z, id) { this.map.set(`${x},${z}`, id); },
  };

  // Place a planned mine at (10, 10, 10) with base y=10 over the y=9 depression
  const mine = new Building(village, 'mine', 10, 10, 10, 0, 0);
  village.buildings.push(mine);
  village.byId.set(mine.id, mine);
  for (let z = mine.z; z < mine.z + mine.d; z++) {
    for (let x = mine.x; x < mine.x + mine.w; x++) {
      village.foot.set(x, z, mine.id);
    }
  }
  // Lay cobblestone foundation at (13, 10, 13) while a woodcutter is standing at y=10.0 (buried waist-deep in b.y=10!)
  w.setBlock(13, 10, 13, B.COBBLESTONE);
  const woodcutter = {
    kind: 'villager',
    job: 'woodcutter',
    radius: 0.3,
    height: 1.8,
    onGround: true,
    position: { x: 13.5, y: 10.0, z: 13.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    puff() {},
  };
  // Also place a builder perched on top of the tree trunk at (14.5, 13.0, 14.5)
  const builder = {
    kind: 'villager',
    job: 'builder',
    radius: 0.3,
    height: 1.8,
    onGround: true,
    position: { x: 14.5, y: 13.0, z: 14.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    puff() {},
  };
  village.villagers.push(woodcutter, builder);

  // Run the smart guardian
  village.rescueStuckVillagers();

  // Both villagers must now be on safe, walkable ground outside the unfinished mine footprint and free of AABB collision
  for (const v of [woodcutter, builder]) {
    const bx = Math.floor(v.position.x), by = Math.floor(v.position.y), bz = Math.floor(v.position.z);
    assert.equal(collides(w, v.position.x, v.position.y + 0.04, v.position.z, v.radius, v.height - 0.08, true), false, `${v.job} must not collide with any solid block after rescue`);
    assert.equal(village.isSafeStandCell(bx, by, bz, v, false), true, `${v.job} must be standing on a verified safe cell (${bx},${by},${bz})`);
    assert.equal(village.foot.get(bx, bz), 0, `${v.job} must be evacuated outside the unfinished mine footprint`);
  }

  // Verify nextQuarryBlock clears non-solid cross blocks (tall grass/flowers) and only returns solid blocks
  const qCell = mine.quarry.cells[0];
  w.setBlock(qCell.x, mine.y, qCell.z, B.TALL_GRASS);
  const nextQ = village.nextQuarryBlock(mine);
  assert.equal(w.getBlock(qCell.x, mine.y, qCell.z), B.AIR, 'Tall grass in quarry cell must be cleared automatically');
  if (nextQ && !nextQ.torch) {
    assert.equal(Boolean(BLOCKS[w.getBlock(nextQ.x, nextQ.y, nextQ.z)]?.solid), true, 'nextQuarryBlock must only return solid blocks');
  }
});
