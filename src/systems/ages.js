// Ages of civilisation: from the stone age to the singularity.
// The current age (state.age, index into AGES) caps building levels, gives small village-wide bonuses
// and is advanced from the town hall once its level, research and resources allow it.
// Ages marked `soon` are on the road map (their buildings / tech / enemies are not in the game yet).

export const AGES = [
  { id: 'stone', name: 'Каменный век', maxLevel: 2, color: '#b9a58a',
    desc: 'Шалаши, частокол и каменные топоры. Здания до 2 уровня.' },
  { id: 'bronze', name: 'Бронзовый век', maxLevel: 3, color: '#d08a4a',
    req: { th: 2, techs: ['agriculture', 'masonry', 'mining'] }, cost: { wood: 150, stone: 150, food: 100 },
    desc: 'Первые города: черепица вместо соломы, здания до 3 уровня.' },
  { id: 'iron', name: 'Железный век', maxLevel: 4, color: '#9aa4ad',
    req: { th: 3, techs: ['smithing', 'fortification'] }, cost: { stone: 300, iron: 40, food: 150 },
    desc: 'Каменная кладка, плавильни, кузницы и гарнизоны. Здания до 4 уровня.' },
  { id: 'medieval', name: 'Средневековье', maxLevel: 5, color: '#c9b36a',
    req: { th: 4, techs: ['mechanics', 'arcana'] }, cost: { stone: 500, iron: 100, gold: 40, crystal: 10 },
    desc: 'Крепости, магия и механика. Здания до 5 уровня.' },
  { id: 'gunpowder', name: 'Эпоха пороха', maxLevel: 6, color: '#b05a3a',
    req: { th: 5, techs: ['gunpowder'] }, cost: { stone: 700, iron: 200, gold: 100, coal: 80 },
    desc: 'Мушкеты, бастионы и первые мануфактуры. Здания до 6 уровня.' },
  { id: 'industrial', name: 'Индустриальная эра', maxLevel: 7, color: '#a08a70',
    req: { th: 6, techs: ['steam_power'] }, cost: { stone: 900, iron: 300, coal: 200, gold: 150 },
    desc: 'Заводы варят сталь, пулемёты косят нежить, бетонные стены. Здания до 7 уровня.' },
  { id: 'electric', name: 'Эпоха электричества', maxLevel: 8, color: '#e8d05a',
    req: { th: 7, techs: ['electricity'] }, cost: { steel: 120, coal: 300, gold: 250, crystal: 30 },
    desc: 'Электростанции питают тесла-башни, прожекторы и заводы. Здания до 8 уровня.' },
  { id: 'atomic', name: 'Атомный век', maxLevel: 9, color: '#7ad06a',
    req: { th: 8, techs: ['nuclear'] }, cost: { steel: 300, gold: 400, crystal: 60, coal: 400 },
    desc: 'Реакторы на уране, бункеры и ракеты. Здания до 9 уровня.' },
  { id: 'information', name: 'Информационная эра', maxLevel: 10, color: '#5ab0e8',
    req: { th: 9, techs: ['computing'] }, cost: { steel: 500, gold: 600, crystal: 100, uranium: 40 },
    desc: 'Компьютеры, дроны, автотурели и радар. Нежить выходит и днём. Здания до 10 уровня.' },
  { id: 'singularity', name: 'Сингулярность', maxLevel: 10, color: '#c07aff',
    req: { th: 10, techs: ['ai'] }, cost: { steel: 800, uranium: 120, gold: 1000, crystal: 200 },
    desc: 'ИИ-ядро, нанофабрики, лазеры и энергощит над всей цивилизацией. Постройте Проект «Сингулярность», чтобы победить.' },
];

export function ageOf(game) { return AGES[Math.max(0, Math.min(AGES.length - 1, game.state.age | 0))]; }
export function nextAge(game) { return AGES[(game.state.age | 0) + 1] || null; }

/** Village-wide bonuses that grow with each age. */
export function ageWorkBonus(game) { return 1 + 0.05 * (game.state.age | 0); }
export function ageHpBonus(game) { return 1 + 0.1 * (game.state.age | 0); }

/** True if building `b` is a regular upgradable village building (not Town Hall, walls, or wonders). */
export function isUpgradableVillageBuilding(b, townHall = null) {
  if (!b) return false;
  if (b === townHall || b.type === 'town_hall') return false;
  if (b.def?.line || b.def?.wonder) return false;
  return true;
}

/**
 * Cost of upgrading a building definition `def` from `fromLevel` to `fromLevel + 1` (i.e. reaching `targetLevel = fromLevel + 1`).
 */
export function buildingUpgradeCostToLevel(def, targetLevel = 2) {
  if (!def) return {};
  const lv = Math.max(2, targetLevel | 0);
  const L = lv - 1;
  const c = {};
  for (const k in (def.cost || {})) c[k] = Math.ceil(def.cost[k] * 1.5 * L);
  if (L >= 2) c.iron = (c.iron || 0) + 3 * (L - 1);
  if (L >= 3) c.gold = (c.gold || 0) + 2 * (L - 2);
  if (L >= 5) c.crystal = (c.crystal || 0) + 3 * (L - 4);
  if (L >= 6) c.steel = (c.steel || 0) + 5 * (L - 5);
  return c;
}

/**
 * Cost of constructing a new building of definition `def` when the Town Hall is at `thLevel`.
 * At Town Hall level 1, buildings cost their base `def.cost`.
 * At Town Hall level >= 2, upgradable buildings cost the same as upgrading that building to `thLevel`.
 */
export function buildingBuildCostForTownHall(def, thLevel = 1) {
  if (!def) return {};
  const lv = Math.max(1, thLevel | 0);
  if (lv <= 1 || def.line || def.wonder) return { ...(def.cost || {}) };
  return buildingUpgradeCostToLevel(def, lv);
}

/**
 * Checks whether all upgradable buildings in the village have been built and upgraded to at least `targetLevel`.
 * Returns { ok, ready, total, targetLevel, missing, reason }.
 */
export function checkBuildingsForLevel(buildings, targetLevel, townHall = null) {
  const list = (buildings || []).filter(b => isUpgradableVillageBuilding(b, townHall));
  if (list.length === 0) {
    return {
      ok: false,
      ready: 0,
      total: 0,
      targetLevel,
      missing: [],
      reason: `Сначала постройте и улучшите здания до ${targetLevel} уровня`,
    };
  }
  const isReady = (b) => b.state === 'complete' && !b.upgrade && (b.level || 1) >= targetLevel;
  const missing = list.filter(b => !isReady(b));
  const ready = list.length - missing.length;
  if (missing.length > 0) {
    const names = [...new Set(missing.map(b => b.def?.name || b.name || b.type))].slice(0, 3).join(', ');
    return {
      ok: false,
      ready,
      total: list.length,
      targetLevel,
      missing,
      reason: `Сначала прокачайте все здания до ${targetLevel} ур. (${ready}/${list.length}: осталось — ${names})`,
    };
  }
  return {
    ok: true,
    ready: list.length,
    total: list.length,
    targetLevel,
    missing: [],
    reason: '',
  };
}

/** What is still missing for the next age: [{text, ok}] plus ok flag. */
export function checkNextAge(game) {
  const a = nextAge(game);
  if (!a) return { ok: false, age: null, items: [], reason: 'Это последняя эпоха' };
  if (a.soon) return { ok: false, age: a, items: [], reason: 'Эта эпоха ещё в разработке' };
  const items = [];
  const v = game.village;
  const th = v?.townHall;
  const reqLv = a.req.th;
  const bst = checkBuildingsForLevel(v?.buildings || [], reqLv, th);
  items.push({
    text: bst.total > 0
      ? `Все здания ${reqLv} уровня (${bst.ready}/${bst.total})`
      : `Построить и улучшить здания до ${reqLv} уровня`,
    ok: bst.ok,
  });
  const thOk = !!th && th.state === 'complete' && !th.upgrade && (th.level || 1) >= reqLv;
  items.push({ text: `Ратуша ${reqLv} уровня`, ok: thOk });
  for (const t of a.req.techs) items.push({ tech: t, ok: game.state.researchDone.has(t) });
  const afford = game.state.canAfford(a.cost);
  const ok = items.every(i => i.ok) && afford;
  let reason = '';
  if (!ok) {
    if (!bst.ok) reason = bst.reason;
    else if (!thOk) reason = `Сначала улучшите ратушу до ${reqLv} уровня`;
    else if (!a.req.techs.every(t => game.state.researchDone.has(t))) reason = 'Не изучены нужные технологии эпохи';
    else if (!afford) reason = 'Не хватает ресурсов для перехода в новую эпоху';
  }
  return { ok, age: a, items, afford, reason };
}

export function advanceAge(game) {
  const c = checkNextAge(game);
  if (!c.ok) {
    game.bus.emit('toast', { text: c.reason || 'Не выполнены условия новой эпохи', kind: 'bad' });
    return false;
  }
  // a joined player: the host's village enters the new age
  if (game.net?.isClient && !game.net.ownVillage) { game.net.send({ t: 'vcmd', op: 'age' }); return true; }
  if (!game.state.spend(c.age.cost)) return false;
  game.state.age = (game.state.age | 0) + 1;
  game.state.siegePending = game.state.age;
  const v = game.village;
  if (v) {
    for (const b of v.buildings) b.refreshMaxHp?.();
    const n = v.restyleAll?.() || 0;
    if (n) game.bus.emit('toast', { text: 'Город перестраивается в стиле новой эпохи', kind: 'info' });
    if (v.townHall) v.celebrate(v.townHall);
  }
  game.audio?.play('upgrade_done', { volume: 1 });
  game.bus.emit('toast', { text: `Новая эпоха: ${c.age.name}!`, kind: 'good' });
  game.bus.emit('toast', { text: c.age.desc, kind: 'info' });
  game.bus.emit('toast', { text: 'Нежить почуяла вашу силу — следующей ночью будет осада!', kind: 'bad' });
  game.bus.emit('age:changed', { age: game.state.age });
  return true;
}
