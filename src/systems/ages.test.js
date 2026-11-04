import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGES,
  isUpgradableVillageBuilding,
  checkBuildingsForLevel,
  checkNextAge,
  advanceAge,
  buildingUpgradeCostToLevel,
  buildingBuildCostForTownHall,
} from './ages.js';

function makeBuilding(type, level = 1, state = 'complete', extra = {}) {
  const isLine = type === 'wall' || type === 'stone_wall';
  const isWonder = type === 'stonehenge' || type === 'ziggurat';
  return {
    type,
    name: extra.name || type,
    level,
    state,
    upgrade: extra.upgrade || null,
    def: {
      name: extra.name || type,
      line: isLine,
      wonder: isWonder,
      ...extra.def,
    },
  };
}

function makeMockGame({ age = 0, thLevel = 1, buildings = [], techs = [], resources = {} } = {}) {
  const th = makeBuilding('town_hall', thLevel, 'complete', { name: 'Ратуша' });
  const allBuildings = [th, ...buildings];
  const researchDone = new Set(techs);
  const res = { wood: 1000, stone: 1000, food: 1000, iron: 1000, gold: 1000, coal: 1000, crystal: 1000, steel: 1000, uranium: 1000, ...resources };
  const toasts = [];
  const game = {
    state: {
      age,
      researchDone,
      resources: res,
      canAfford(cost) {
        return Object.entries(cost || {}).every(([k, v]) => (res[k] || 0) >= v);
      },
      spend(cost) {
        if (!this.canAfford(cost)) return false;
        for (const [k, v] of Object.entries(cost || {})) res[k] -= v;
        return true;
      },
    },
    bus: {
      emit(ev, payload) {
        if (ev === 'toast') toasts.push(payload);
      },
    },
    village: {
      townHall: th,
      buildings: allBuildings,
      celebrate() {},
      restyleAll() { return 0; },
    },
    toasts,
  };
  return game;
}

test('isUpgradableVillageBuilding excludes town_hall, walls, and wonders', () => {
  const th = makeBuilding('town_hall', 1);
  const house = makeBuilding('house', 1);
  const wall = makeBuilding('wall', 1);
  const wonder = makeBuilding('stonehenge', 1);

  assert.equal(isUpgradableVillageBuilding(th, th), false);
  assert.equal(isUpgradableVillageBuilding(house, th), true);
  assert.equal(isUpgradableVillageBuilding(wall, th), false);
  assert.equal(isUpgradableVillageBuilding(wonder, th), false);
});

test('checkBuildingsForLevel requires all regular buildings to be complete and at targetLevel', () => {
  const th = makeBuilding('town_hall', 1);
  const h1 = makeBuilding('house', 2, 'complete', { name: 'Дом' });
  const h2 = makeBuilding('house', 1, 'complete', { name: 'Дом' });
  const farm = makeBuilding('farm', 2, 'complete', { name: 'Ферма' });
  const wall = makeBuilding('wall', 1, 'complete', { name: 'Частокол' });

  // One house is still level 1 -> blocked
  let st = checkBuildingsForLevel([th, h1, h2, farm, wall], 2, th);
  assert.equal(st.ok, false);
  assert.equal(st.ready, 2);
  assert.equal(st.total, 3);
  assert.match(st.reason, /2\/3/);

  // While upgrading, still not ready
  h2.upgrade = { left: 10, total: 20 };
  st = checkBuildingsForLevel([th, h1, h2, farm, wall], 2, th);
  assert.equal(st.ok, false);

  // Once upgrade completes to level 2 -> ready!
  h2.upgrade = null;
  h2.level = 2;
  st = checkBuildingsForLevel([th, h1, h2, farm, wall], 2, th);
  assert.equal(st.ok, true);
  assert.equal(st.ready, 3);
  assert.equal(st.total, 3);
});

test('progression order: upgrade all buildings -> upgrade TH -> advance to next age', () => {
  const h1 = makeBuilding('house', 1, 'complete', { name: 'Дом' });
  const farm = makeBuilding('farm', 1, 'complete', { name: 'Ферма' });
  const camp = makeBuilding('lumber_camp', 1, 'complete', { name: 'Лесопилка' });

  const game = makeMockGame({
    age: 0,
    thLevel: 1,
    buildings: [h1, farm, camp],
    techs: AGES[1].req.techs,
  });

  // Step 1: Buildings are level 1, TH is level 1 -> cannot advance age
  let next = checkNextAge(game);
  assert.equal(next.ok, false);
  assert.equal(next.items[0].ok, false); // Все здания 2 уровня (0/3)
  assert.equal(next.items[1].ok, false); // Ратуша 2 уровня
  assert.equal(advanceAge(game), false);
  assert.equal(game.state.age, 0);

  // Step 2: Upgrade all regular buildings to level 2, but TH is still level 1 -> still cannot advance age
  h1.level = 2;
  farm.level = 2;
  camp.level = 2;
  next = checkNextAge(game);
  assert.equal(next.items[0].ok, true);  // Все здания 2 уровня (3/3)
  assert.equal(next.items[1].ok, false); // Ратуша 2 уровня still false!
  assert.equal(next.ok, false);
  assert.equal(advanceAge(game), false);

  // Step 3: Upgrade TH to level 2 -> now next age unlocks and advances!
  game.village.townHall.level = 2;
  next = checkNextAge(game);
  assert.equal(next.items[0].ok, true);
  assert.equal(next.items[1].ok, true);
  assert.equal(next.ok, true);
  assert.equal(advanceAge(game), true);
  assert.equal(game.state.age, 1);

  // Step 4: In Bronze Age (age = 1), next age (Iron Age) requires all buildings at level 3 and TH at level 3
  next = checkNextAge(game);
  assert.equal(next.age.id, 'iron');
  assert.equal(next.items[0].ok, false); // Все здания 3 уровня (0/3)
  assert.equal(next.items[1].ok, false); // Ратуша 3 уровня
});

test('buildingBuildCostForTownHall matches upgrade cost to current Town Hall level', () => {
  const houseDef = { id: 'house', cost: { wood: 25, stone: 10 } };
  const wallDef = { id: 'wall', line: true, cost: { wood: 4 } };

  // At TH level 1, building costs base def.cost
  assert.deepEqual(buildingBuildCostForTownHall(houseDef, 1), { wood: 25, stone: 10 });

  // At TH level 2+, building costs the exact same as upgrading that building to thLevel
  for (let thLevel = 2; thLevel <= 6; thLevel++) {
    const buildCost = buildingBuildCostForTownHall(houseDef, thLevel);
    const upgCost = buildingUpgradeCostToLevel(houseDef, thLevel);
    assert.deepEqual(buildCost, upgCost);
  }

  // Non-upgradable line buildings keep base cost
  assert.deepEqual(buildingBuildCostForTownHall(wallDef, 4), { wood: 4 });
});

