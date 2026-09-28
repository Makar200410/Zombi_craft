// Quest chain: guides the player through the civilisation age by age — what to build, how many, whom to
// employ, what to research — and rewards every step. The main chain is shown three quests at a time
// (the current one and the next two, which can be done in parallel); side quests (wonders) run alongside.
// Progress is checked once per second from the game state; completed ids live in state.questsDone.
import { BUILDING_TYPES } from '../village/buildings.js';
import { TECHS } from './research.js';
import { ITEMS, RESOURCE_LABELS } from '../core/items.js';
import { AGES } from './ages.js';

const B = (type, n = 1) => ({ t: 'build', type, n });
const J = (job, n) => ({ t: 'job', job, n });
const R = (tech) => ({ t: 'research', tech });
const TH = (n) => ({ t: 'th', n });
const AGE = (n) => ({ t: 'age', n });

// Main chain, in order. age = the age the quest belongs to (for the journal).
export const QUESTS = [
  // ---- I. Stone age
  { id: 'q_trees', age: 0, title: 'Первые брёвна', desc: 'Возьмите топор и срубите пару деревьев — топор валит дерево целиком.', goals: [{ t: 'trees', n: 3 }], reward: { wood: 40 } },
  { id: 'q_farm', age: 0, title: 'Хлеб насущный', desc: 'Постройте ферму и поставьте на неё двух фермеров (вкладка «Жители»).', goals: [B('farm'), J('farmer', 2)], reward: { food: 40, wood: 20 } },
  { id: 'q_lumber', age: 0, title: 'Лесопилка', desc: 'Лесорубы сами валят лес и сажают саженцы.', goals: [B('lumber_camp'), J('woodcutter', 2)], reward: { wood: 60 } },
  { id: 'q_houses', age: 0, title: 'Крыша над головой', desc: 'Каждый дом — ещё жители. Постройте 4 дома.', goals: [B('house', 4), { t: 'pop', n: 10 }], reward: { wood: 50, stone: 30 } },
  { id: 'q_mine', age: 0, title: 'Камень и руда', desc: 'Шахтёры роют карьер и находят уголь, железо и золото.', goals: [B('mine'), J('miner', 2)], reward: { stone: 60, food: 20 } },
  { id: 'q_builders', age: 0, title: 'Бригада строителей', desc: 'Дом строителя даёт ещё двух строителей и ускоряет стройку.', goals: [B('builder_hut'), J('builder', 3)], reward: { wood: 60, stone: 40 } },
  { id: 'q_palisade', age: 0, title: 'Частокол', desc: 'Окружите деревню частоколом — зомби будут ломать стену, а не дома.', goals: [B('wall', 20)], reward: { wood: 60 } },
  { id: 'q_night1', age: 0, title: 'Первые ночи', desc: 'Отбейте две волны нежити.', goals: [{ t: 'waves', n: 2 }], reward: { gold: 15, food: 30 } },
  { id: 'q_lab', age: 0, title: 'Знание — сила', desc: 'Лаборатория и два учёных дают очки исследований.', goals: [B('laboratory'), J('researcher', 2)], reward: { wood: 40, stone: 40 } },
  { id: 'q_research1', age: 0, title: 'Основы', desc: 'Изучите земледелие, каменную кладку и горное дело.', goals: [R('agriculture'), R('masonry'), R('mining')], reward: { food: 60, stone: 60 } },
  { id: 'q_th2', age: 0, title: 'Ратуша 2 уровня', desc: 'Улучшите ратушу в её окне (режим командования → ратуша).', goals: [TH(2)], reward: { gold: 20 } },
  { id: 'q_age1', age: 0, title: 'Бронзовый век', desc: 'В окне ратуши нажмите «Перейти в Бронзовый век».', goals: [AGE(1)], reward: { gold: 30, food: 50 } },
  // ---- II. Bronze age
  { id: 'q_granary', age: 1, title: 'Запасы', desc: 'Амбар увеличивает урожай всех ферм.', goals: [B('granary'), B('farm', 3), J('farmer', 5)], reward: { food: 80 } },
  { id: 'q_market', age: 1, title: 'Торговля', desc: 'Рынок и два торговца превращают излишки в золото.', goals: [B('market'), J('merchant', 2), { t: 'res', res: 'gold', n: 100 }], reward: { wood: 80, stone: 80 } },
  { id: 'q_pop15', age: 1, title: 'Город растёт', desc: 'Доведите население до 15 жителей.', goals: [{ t: 'pop', n: 15 }, B('house', 6)], reward: { wood: 80, food: 60 } },
  { id: 'q_smith', age: 1, title: 'Кузнечное дело', desc: 'Изучите кузнечное дело, постройте кузницу и назначьте кузнеца.', goals: [R('smithing'), B('forge'), J('blacksmith', 1)], reward: { iron: 20, coal: 20 } },
  { id: 'q_sword', age: 1, title: 'Железо в руке', desc: 'Создайте железный меч в «Крафте».', goals: [{ t: 'craft', item: 'sword_iron' }], reward: { iron: 15 } },
  { id: 'q_fort', age: 1, title: 'Фортификация', desc: 'Каменные стены и казарма с гарнизоном.', goals: [R('fortification'), B('barracks'), J('guard', 5), B('stone_wall', 20)], reward: { stone: 120 } },
  { id: 'q_up2', age: 1, title: 'Добротные дома', desc: 'Улучшите три здания до 2 уровня.', goals: [{ t: 'level', n: 3, lv: 2 }], reward: { gold: 30 } },
  { id: 'q_th3', age: 1, title: 'Ратуша 3 уровня', desc: 'Улучшите ратушу.', goals: [TH(3)], reward: { gold: 30 } },
  { id: 'q_age2', age: 1, title: 'Железный век', desc: 'Перейдите в Железный век в окне ратуши.', goals: [AGE(2)], reward: { iron: 30, gold: 30 } },
  // ---- III. Iron age
  { id: 'q_towers', age: 2, title: 'Дозор', desc: 'Изучите стрельбу из лука и поставьте две сторожевые вышки с лучниками.', goals: [R('archery'), B('watchtower', 2)], reward: { wood: 100 } },
  { id: 'q_mech', age: 2, title: 'Механика', desc: 'Шестерни и блоки ускоряют стройку.', goals: [R('mechanics'), J('builder', 5)], reward: { iron: 30 } },
  { id: 'q_arcana', age: 2, title: 'Тайные знания', desc: 'Откройте магию и башню мага.', goals: [R('arcana'), B('mage_tower'), J('mage', 1)], reward: { crystal: 10, gold: 20 } },
  { id: 'q_up3', age: 2, title: 'Каменный город', desc: 'Улучшите пять зданий до 3 уровня.', goals: [{ t: 'level', n: 5, lv: 3 }], reward: { stone: 150, gold: 40 } },
  { id: 'q_waves8', age: 2, title: 'Закалённые', desc: 'Отбейте восемь волн.', goals: [{ t: 'waves', n: 8 }], reward: { gold: 60 } },
  { id: 'q_th4', age: 2, title: 'Ратуша 4 уровня', desc: 'Улучшите ратушу.', goals: [TH(4)], reward: { gold: 40 } },
  { id: 'q_age3', age: 2, title: 'Средневековье', desc: 'Перейдите в Средневековье.', goals: [AGE(3)], reward: { gold: 60, crystal: 10 } },
  // ---- IV. Middle ages
  { id: 'q_castle', age: 3, title: 'Замок', desc: 'Каменная крепость с гарнизоном.', goals: [B('castle'), J('guard', 8)], reward: { stone: 200, iron: 40 } },
  { id: 'q_pop30', age: 3, title: 'Королевство', desc: 'Население 30 жителей.', goals: [{ t: 'pop', n: 30 }], reward: { food: 150, gold: 50 } },
  { id: 'q_powder', age: 3, title: 'Порох', desc: 'Изучите порох.', goals: [R('gunpowder')], reward: { coal: 60 } },
  { id: 'q_th5', age: 3, title: 'Ратуша 5 уровня', desc: 'Улучшите ратушу.', goals: [TH(5)], reward: { gold: 60 } },
  { id: 'q_age4', age: 3, title: 'Эпоха пороха', desc: 'Перейдите в эпоху пороха.', goals: [AGE(4)], reward: { iron: 60, gold: 60 } },
  // ---- V. Gunpowder
  { id: 'q_bastion', age: 4, title: 'Пушки', desc: 'Два бастиона с канонирами.', goals: [B('cannon_tower', 2), J('gunner', 2)], reward: { iron: 60, coal: 40 } },
  { id: 'q_ballistics', age: 4, title: 'Баллистика', desc: 'Изучите баллистику и паровую машину.', goals: [R('ballistics'), R('steam_power')], reward: { gold: 80 } },
  { id: 'q_up5', age: 4, title: 'Мраморный город', desc: 'Улучшите пять зданий до 5 уровня.', goals: [{ t: 'level', n: 5, lv: 5 }], reward: { stone: 250, gold: 80 } },
  { id: 'q_th6', age: 4, title: 'Ратуша 6 уровня', desc: 'Улучшите ратушу.', goals: [TH(6)], reward: { gold: 80 } },
  { id: 'q_age5', age: 4, title: 'Индустриальная эра', desc: 'Перейдите в индустриальную эру.', goals: [AGE(5)], reward: { iron: 100, coal: 100 } },
  // ---- VI. Industrial
  { id: 'q_factory', age: 5, title: 'Завод', desc: 'Завод и три инженера плавят сталь.', goals: [B('factory'), J('engineer', 3), { t: 'res', res: 'steel', n: 60 }], reward: { iron: 100, coal: 80 } },
  { id: 'q_mg', age: 5, title: 'Пулемёты', desc: 'Изучите пулемёты и поставьте два пулемётных гнезда.', goals: [R('machine_guns'), B('mg_nest', 2)], reward: { steel: 30 } },
  { id: 'q_rifle', age: 5, title: 'Винтовка', desc: 'Создайте винтовку в «Крафте» (на заводе).', goals: [{ t: 'craft', item: 'rifle' }], reward: { steel: 20 } },
  { id: 'q_elec', age: 5, title: 'Электричество', desc: 'Изучите электричество.', goals: [R('electricity')], reward: { gold: 100 } },
  { id: 'q_th7', age: 5, title: 'Ратуша 7 уровня', desc: 'Улучшите ратушу.', goals: [TH(7)], reward: { steel: 40 } },
  { id: 'q_age6', age: 5, title: 'Эпоха электричества', desc: 'Перейдите в эпоху электричества.', goals: [AGE(6)], reward: { steel: 60, coal: 100 } },
  // ---- VII. Electric
  { id: 'q_plant', age: 6, title: 'Да будет свет', desc: 'Электростанция с двумя инженерами: 120 энергии в сети.', goals: [B('power_plant'), { t: 'power', n: 120 }], reward: { coal: 150 } },
  { id: 'q_tesla', age: 6, title: 'Токи Теслы', desc: 'Изучите токи Теслы и поставьте две тесла-башни и прожектор.', goals: [R('tesla'), B('tesla_tower', 2), B('searchlight', 1)], reward: { steel: 60, crystal: 20 } },
  { id: 'q_nuclear', age: 6, title: 'Атом', desc: 'Изучите ядерную физику.', goals: [R('nuclear')], reward: { gold: 150 } },
  { id: 'q_th8', age: 6, title: 'Ратуша 8 уровня', desc: 'Улучшите ратушу.', goals: [TH(8)], reward: { steel: 60 } },
  { id: 'q_age7', age: 6, title: 'Атомный век', desc: 'Перейдите в атомный век.', goals: [AGE(7)], reward: { steel: 100, gold: 100 } },
  // ---- VIII. Atomic
  { id: 'q_uranium', age: 7, title: 'Уран', desc: 'Шахтёры находят уран. Накопите 30.', goals: [{ t: 'res', res: 'uranium', n: 30 }, J('miner', 4)], reward: { steel: 60 } },
  { id: 'q_reactor', age: 7, title: 'Реактор', desc: 'Атомный реактор и бункер.', goals: [B('reactor'), B('bunker'), { t: 'power', n: 400 }], reward: { gold: 150 } },
  { id: 'q_rockets', age: 7, title: 'Ракеты', desc: 'Изучите ракеты, поставьте ракетную батарею.', goals: [R('rocketry'), B('rocket_battery')], reward: { steel: 80 } },
  { id: 'q_computing', age: 7, title: 'Вычисления', desc: 'Изучите вычислительную технику.', goals: [R('computing')], reward: { uranium: 10 } },
  { id: 'q_th9', age: 7, title: 'Ратуша 9 уровня', desc: 'Улучшите ратушу.', goals: [TH(9)], reward: { steel: 100 } },
  { id: 'q_age8', age: 7, title: 'Информационная эра', desc: 'Перейдите в информационную эру.', goals: [AGE(8)], reward: { steel: 120, gold: 150 } },
  // ---- IX. Information
  { id: 'q_cc', age: 8, title: 'Компьютеры', desc: 'Вычислительный центр с тремя учёными и радар.', goals: [B('computer_center'), B('radar')], reward: { gold: 150 } },
  { id: 'q_turrets', age: 8, title: 'Автоматика', desc: 'Четыре автотурели.', goals: [B('turret', 4)], reward: { steel: 120 } },
  { id: 'q_drones', age: 8, title: 'Дроны', desc: 'Изучите робототехнику и постройте дронопорт.', goals: [R('robotics'), B('drone_hub')], reward: { uranium: 20 } },
  { id: 'q_ai', age: 8, title: 'Искусственный интеллект', desc: 'Изучите ИИ.', goals: [R('ai')], reward: { crystal: 60 } },
  { id: 'q_th10', age: 8, title: 'Ратуша 10 уровня', desc: 'Улучшите ратушу до максимума.', goals: [TH(10)], reward: { steel: 150 } },
  { id: 'q_age9', age: 8, title: 'Сингулярность', desc: 'Перейдите в эпоху сингулярности.', goals: [AGE(9)], reward: { steel: 200, gold: 200 } },
  // ---- X. Singularity
  { id: 'q_core', age: 9, title: 'Разум города', desc: 'ИИ-ядро и три лазерные башни.', goals: [B('ai_core'), B('laser_tower', 3)], reward: { steel: 150 } },
  { id: 'q_nano', age: 9, title: 'Нанотехнологии', desc: 'Изучите нанотехнологии и силовые поля, постройте нанофабрику и генератор щита.', goals: [R('nanotech'), B('nanofactory'), R('force_fields'), B('shield_generator')], reward: { uranium: 40, crystal: 60 } },
  { id: 'q_singularity', age: 9, title: 'Проект «Сингулярность»', desc: 'Постройте последнее чудо света.', goals: [B('singularity')], reward: { steel: 300 } },
  { id: 'q_finale', age: 9, title: 'Нано-чума', desc: 'Продержитесь в последнюю ночь.', goals: [{ t: 'finale' }], reward: {} },
];
// Side quests: the wonder of each age (appear once their age is reached).
export const SIDE_QUESTS = [
  { id: 's_stonehenge', age: 0, title: 'Чудо: Каменный круг', desc: 'Древнее святилище ускоряет исследования.', goals: [B('stonehenge')], reward: { gold: 40 } },
  { id: 's_ziggurat', age: 1, title: 'Чудо: Великий зиккурат', desc: '+10 жителей и больше еды.', goals: [B('ziggurat')], reward: { gold: 80 } },
  { id: 's_colossus', age: 2, title: 'Чудо: Бронзовый колосс', desc: 'Защитники бьют сильнее.', goals: [B('colossus')], reward: { gold: 120 } },
  { id: 's_cathedral', age: 3, title: 'Чудо: Великий собор', desc: 'Жители лечатся быстрее и всегда довольны.', goals: [B('cathedral')], reward: { gold: 150 } },
  { id: 's_arsenal', age: 4, title: 'Чудо: Королевский арсенал', desc: 'Башни стреляют дальше и быстрее.', goals: [B('arsenal')], reward: { gold: 200 } },
  { id: 's_palace', age: 5, title: 'Чудо: Хрустальный дворец', desc: 'Все работают на 20% быстрее.', goals: [B('crystal_palace')], reward: { steel: 100 } },
  { id: 's_eiffel', age: 6, title: 'Чудо: Железная башня', desc: 'Энергия и урон обороны.', goals: [B('eiffel_tower')], reward: { steel: 150 } },
  { id: 's_cosmo', age: 7, title: 'Чудо: Космодром', desc: 'Орбитальные удары по нежити.', goals: [B('cosmodrome')], reward: { uranium: 40 } },
  { id: 's_network', age: 8, title: 'Чудо: Всемирная сеть', desc: 'Исследования и работа быстрее.', goals: [B('global_network')], reward: { uranium: 60 } },
];
const ALL = [...QUESTS, ...SIDE_QUESTS];
const BY_ID = Object.fromEntries(ALL.map(q => [q.id, q]));
const WINDOW = 3;   // main quests shown (and progressable) at once

export class Quests {
  constructor(game) {
    this.game = game;
    this._t = 0;
    this.active = [];      // [{q, prog: [{cur, n, done, label}], done}]
    this.version = 0;      // bumps when the active list or progress changes (UI refresh)
  }
  init() {
    this.game.bus.on('game:begin', ({ loaded } = {}) => {
      const st = this.game.state;
      // saves from before quests existed: everything already achieved counts as done, without rewards
      if (loaded && st._questsLegacy) { for (const q of ALL) if (this.check(q).done) st.questsDone.add(q.id); st._questsLegacy = false; }
      this.refresh(true);
    });
  }

  // ---------- evaluation ----------
  /** Progress of one goal: {cur, n, done, label}. */
  goal(g) {
    const game = this.game, st = game.state, v = game.village;
    const blds = v?.buildings || [];
    const alive = (v?.villagers || []).filter(x => !x.dead);
    let cur = 0, n = g.n || 1, label = '';
    switch (g.t) {
      case 'build': cur = blds.filter(b => b.type === g.type && b.state === 'complete').length; label = (BUILDING_TYPES[g.type]?.name || g.type); break;
      case 'job': cur = alive.filter(x => x.job === g.job).length; label = JOB_NAMES[g.job] || g.job; break;
      case 'pop': cur = alive.length; label = 'Жители'; break;
      case 'research': cur = st.researchDone.has(g.tech) ? 1 : 0; label = 'Исследование «' + (TECHS[g.tech]?.name || g.tech) + '»'; break;
      case 'craft': cur = game.crafting?.owns(g.item) ? 1 : 0; label = 'Создать: ' + (ITEMS[g.item]?.name || g.item); break;
      case 'res': cur = Math.floor(st.resources[g.res] || 0); label = RESOURCE_LABELS[g.res] || g.res; break;
      case 'waves': cur = st.stats.wavesSurvived || 0; label = 'Отбито волн'; break;
      case 'trees': cur = st.stats.treesFelled || 0; label = 'Срублено деревьев'; break;
      case 'th': cur = v?.townHall?.level || 0; label = 'Уровень ратуши'; break;
      case 'age': cur = st.age | 0; n = g.n; label = 'Эпоха: ' + (AGES[g.n]?.name || ''); return { cur: cur >= n ? 1 : 0, n: 1, done: cur >= n, label };
      case 'level': cur = blds.filter(b => b.state === 'complete' && !b.def.line && !b.def.wonder && (b.level || 1) >= g.lv).length; label = `Здания ${g.lv} уровня`; break;
      case 'power': cur = game.village?.industry?.supply || 0; label = 'Энергия в сети'; break;
      case 'finale': cur = (st.finale | 0) >= 3 ? 1 : 0; label = 'Отбить Нано-чуму'; break;
      default: break;
    }
    return { cur: Math.min(cur, n), n, done: cur >= n, label };
  }
  check(q) {
    const prog = q.goals.map(g => this.goal(g));
    return { prog, done: prog.every(p => p.done) };
  }

  /** The quests the player works on now: next main quests + side quests of reached ages. */
  pick() {
    const st = this.game.state, done = st.questsDone;
    const main = QUESTS.filter(q => !done.has(q.id)).slice(0, WINDOW);
    const side = SIDE_QUESTS.filter(q => !done.has(q.id) && q.age <= (st.age | 0)).slice(0, 2);
    return [...main, ...side];
  }
  refresh(silent) {
    const list = this.pick();
    let changed = list.length !== this.active.length;
    const next = [];
    for (const q of list) {
      const c = this.check(q);
      const old = this.active.find(a => a.q === q);
      if (!old || old.prog.map(p => p.cur).join() !== c.prog.map(p => p.cur).join()) changed = true;
      next.push({ q, prog: c.prog, done: c.done });
    }
    this.active = next;
    if (changed) this.version++;
    if (silent) return;
    // complete finished quests (one per tick so every one gets its moment)
    const fin = this.active.find(a => a.done);
    if (fin) this.complete(fin.q);
  }
  complete(q) {
    const g = this.game, st = g.state;
    if (st.questsDone.has(q.id)) return;
    st.questsDone.add(q.id);
    if (q.reward && Object.keys(q.reward).length) st.addAll(q.reward);
    const rw = Object.entries(q.reward || {}).map(([k, n]) => `+${n} ${(RESOURCE_LABELS[k] || k).toLowerCase()}`).join(', ');
    g.bus.emit('toast', { text: `Задание выполнено: «${q.title}»` + (rw ? `. Награда: ${rw}` : ''), kind: 'good' });
    g.audio?.play('research_done', { volume: 0.8 });
    g.bus.emit('quest:done', { id: q.id });
    const before = new Set(this.active.map(x => x.q));
    this.version++;
    this.refresh(true);
    const fresh = this.active.find(x => !before.has(x.q) && !x.done);
    if (fresh) g.bus.emit('toast', { text: 'Новое задание: «' + fresh.q.title + '» — ' + fresh.q.desc, kind: 'info' });
  }
  update(dt) {
    if (!this.game.running) return;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 1;
    this.refresh(false);
  }

  /** Journal: every quest with its state, grouped by age. */
  journal() {
    const done = this.game.state.questsDone;
    const activeIds = new Set(this.active.map(a => a.q.id));
    return AGES.map((a, i) => ({
      age: a, index: i,
      quests: ALL.filter(q => q.age === i).map(q => ({ q, side: SIDE_QUESTS.includes(q), state: done.has(q.id) ? 'done' : activeIds.has(q.id) ? 'active' : 'locked' })),
    })).filter(g => g.quests.length);
  }
  get(id) { return BY_ID[id]; }
}

const JOB_NAMES = { farmer: 'Фермеры', woodcutter: 'Лесорубы', miner: 'Шахтёры', builder: 'Строители', researcher: 'Учёные', blacksmith: 'Кузнецы', guard: 'Стражники', mage: 'Маги', merchant: 'Торговцы', gunner: 'Канониры', engineer: 'Инженеры' };
