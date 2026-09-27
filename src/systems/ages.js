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
    desc: 'Каменная кладка, кузницы и гарнизоны. Здания до 4 уровня.' },
  { id: 'medieval', name: 'Средневековье', maxLevel: 5, color: '#c9b36a',
    req: { th: 4, techs: ['mechanics', 'arcana'] }, cost: { stone: 500, iron: 100, gold: 40, crystal: 10 },
    desc: 'Крепости, магия и механика. Здания до 5 уровня.' },
  { id: 'gunpowder', name: 'Эпоха пороха', maxLevel: 6, color: '#b05a3a',
    req: { th: 5, techs: ['gunpowder'] }, cost: { stone: 700, iron: 200, gold: 100, coal: 80 },
    desc: 'Мушкеты, бастионы и первые мануфактуры. Здания до 6 уровня.' },
  { id: 'industrial', name: 'Индустриальная эра', maxLevel: 7, color: '#7a6a5a', soon: true,
    desc: 'Паровые машины, заводы, железная дорога и пулемёты.' },
  { id: 'electric', name: 'Эпоха электричества', maxLevel: 8, color: '#e8d05a', soon: true,
    desc: 'Электростанции, прожекторы и электрические заграждения.' },
  { id: 'atomic', name: 'Атомный век', maxLevel: 9, color: '#7ad06a', soon: true,
    desc: 'Реакторы, ракеты и радиоактивные мутанты.' },
  { id: 'information', name: 'Информационная эра', maxLevel: 10, color: '#5ab0e8', soon: true,
    desc: 'Компьютеры, дроны-охранники и автоматические турели.' },
  { id: 'singularity', name: 'Сингулярность', maxLevel: 10, color: '#c07aff', soon: true,
    desc: 'ИИ-ядро, нанофабрики и щит над всей цивилизацией.' },
];

export function ageOf(game) { return AGES[Math.max(0, Math.min(AGES.length - 1, game.state.age | 0))]; }
export function nextAge(game) { return AGES[(game.state.age | 0) + 1] || null; }

/** Village-wide bonuses that grow with each age. */
export function ageWorkBonus(game) { return 1 + 0.05 * (game.state.age | 0); }
export function ageHpBonus(game) { return 1 + 0.1 * (game.state.age | 0); }

/** What is still missing for the next age: [{text, ok}] plus ok flag. */
export function checkNextAge(game) {
  const a = nextAge(game);
  if (!a) return { ok: false, age: null, items: [], reason: 'Это последняя эпоха' };
  if (a.soon) return { ok: false, age: a, items: [], reason: 'Эта эпоха ещё в разработке' };
  const items = [];
  const th = game.village?.townHall;
  items.push({ text: `Ратуша ${a.req.th} уровня`, ok: !!th && th.state === 'complete' && th.level >= a.req.th });
  for (const t of a.req.techs) items.push({ tech: t, ok: game.state.researchDone.has(t) });
  const afford = game.state.canAfford(a.cost);
  const ok = items.every(i => i.ok) && afford;
  return { ok, age: a, items, afford };
}

export function advanceAge(game) {
  const c = checkNextAge(game);
  if (!c.ok) {
    game.bus.emit('toast', { text: c.reason || 'Не выполнены условия новой эпохи', kind: 'bad' });
    return false;
  }
  if (!game.state.spend(c.age.cost)) return false;
  game.state.age = (game.state.age | 0) + 1;
  const v = game.village;
  if (v) {
    for (const b of v.buildings) b.refreshMaxHp?.();
    if (v.townHall) v.celebrate(v.townHall);
  }
  game.audio?.play('level_up', { volume: 1 });
  game.bus.emit('toast', { text: `Новая эпоха: ${c.age.name}!`, kind: 'good' });
  game.bus.emit('toast', { text: c.age.desc, kind: 'info' });
  game.bus.emit('age:changed', { age: game.state.age });
  return true;
}
