// Russian villager names + job metadata.
export const MALE_NAMES = [
  'Иван', 'Пётр', 'Алексей', 'Дмитрий', 'Николай', 'Сергей', 'Михаил', 'Фёдор', 'Григорий', 'Василий', 'Степан', 'Егор',
  'Тимофей', 'Ярослав', 'Борис', 'Глеб', 'Святослав', 'Добрыня', 'Никита', 'Матвей', 'Остап', 'Прохор', 'Савва', 'Трофим',
  'Филипп', 'Яков', 'Демьян', 'Кузьма', 'Лука', 'Макар', 'Игнат', 'Емельян', 'Всеволод', 'Мирон', 'Захар', 'Афанасий',
];
export const FEMALE_NAMES = [
  'Анна', 'Мария', 'Ольга', 'Елена', 'Дарья', 'Ксения', 'Василиса', 'Алёна', 'Любава', 'Марфа', 'Варвара', 'Настасья',
  'Полина', 'Софья', 'Татьяна', 'Ульяна', 'Агафья', 'Евдокия', 'Злата', 'Милана', 'Пелагея', 'Прасковья', 'Ярослава', 'Забава',
  'Людмила', 'Аксинья', 'Фёкла', 'Серафима', 'Устинья', 'Арина', 'Вера', 'Надежда',
];
export const NICKNAMES = [
  'Рыжий', 'Тихий', 'Кривой', 'Весёлый', 'Мудрый', 'Смелый', 'Длинный', 'Малый', 'Рябой', 'Лысый', 'Бородач', 'Косой',
];

export function pickName(rnd, taken, female) {
  const list = female ? FEMALE_NAMES : MALE_NAMES;
  const free = list.filter(n => !taken.has(n));
  if (free.length) return free[Math.floor(rnd() * free.length)];
  for (let i = 0; i < 50; i++) {
    const n = list[Math.floor(rnd() * list.length)] + ' ' + (female ? 'Младшая' : NICKNAMES[Math.floor(rnd() * NICKNAMES.length)]);
    if (!taken.has(n)) return n;
  }
  return list[Math.floor(rnd() * list.length)] + ' ' + Math.floor(rnd() * 100);
}

export const JOBS = {
  idle: { label: 'Без работы', hat: null, tool: null },
  builder: { label: 'Строитель', hat: 'cap', hatColor: 0xd9822b, tool: 'build_hammer' },
  woodcutter: { label: 'Лесоруб', hat: 'bandana', hatColor: 0x3f7a2a, tool: 'axe_stone' },
  farmer: { label: 'Фермер', hat: 'straw', tool: 'shovel' },
  miner: { label: 'Шахтёр', hat: 'cap', hatColor: 0x505a66, tool: 'pickaxe_stone' },
  blacksmith: { label: 'Кузнец', hat: 'bandana', hatColor: 0x3a3a3a, tool: 'build_hammer' },
  researcher: { label: 'Учёный', hat: 'hood', hatColor: 0x3b2d6a, tool: null },
  guard: { label: 'Стражник', hat: 'helmet', tool: 'sword_wood' },
  mage: { label: 'Маг', hat: 'wizard', hatColor: 0x4a2a9a, tool: 'staff_fire' },
};
export const JOB_ORDER = ['idle', 'builder', 'woodcutter', 'farmer', 'miner', 'blacksmith', 'researcher', 'guard', 'mage'];
