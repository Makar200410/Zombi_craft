// Research lab tech tree. Points come from researcher villagers (research.addPoints(n)) plus a tiny
// passive trickle; each tech also costs village resources, paid when research starts.
import { ITEMS } from '../core/items.js';

// pos: [tier(column), row] used by the UI tree layout.
export const TECHS = {
  agriculture: {
    name: 'Земледелие', icon: { res: 'food' }, tier: 0, pos: [0, 0], prereqs: [],
    cost: { wood: 20, food: 15 }, points: 20,
    desc: 'Севооборот и удобрения. Поля дают больше урожая.',
    effects: ['Фермы: +50% урожая'],
  },
  masonry: {
    name: 'Каменная кладка', icon: { block: 11 }, tier: 0, pos: [0, 1], prereqs: [],
    cost: { stone: 40, wood: 10 }, points: 25,
    desc: 'Прочные каменные основания для всех построек.',
    effects: ['Дома: +2 к населению', 'Все здания: +50% прочности'],
  },
  mining: {
    name: 'Горное дело', icon: { item: 'pickaxe_stone' }, tier: 0, pos: [0, 2], prereqs: [],
    cost: { wood: 30, stone: 20 }, points: 25,
    desc: 'Шахтёры научатся прокладывать штольни к рудным жилам.',
    effects: ['Открывает здание «Шахта»'],
  },
  archery: {
    name: 'Стрельба из лука', icon: { item: 'bow' }, tier: 0, pos: [0, 3], prereqs: [],
    cost: { wood: 40, food: 10 }, points: 25,
    desc: 'Тисовые луки и сторожевые вышки с лучниками.',
    effects: ['Предмет: Длинный лук', 'Открывает «Сторожевую вышку»'],
  },
  alchemy: {
    name: 'Алхимия', icon: { res: 'mana' }, tier: 0, pos: [0, 4.6], prereqs: [],
    cost: { food: 30, gold: 5 }, points: 30,
    desc: 'Настойки и эликсиры. Первые шаги к магии.',
    effects: ['+50% восстановления маны', 'Жители постепенно лечатся'],
  },
  smithing: {
    name: 'Кузнечное дело', icon: { item: 'sword_iron' }, tier: 1, pos: [1, 2], prereqs: ['mining'],
    cost: { stone: 40, coal: 10, iron: 5 }, points: 50,
    desc: 'Горн и наковальня: железное оружие и инструменты.',
    effects: ['Открывает «Кузницу»', 'Железный меч, кирка, боевой топор', 'Стражники получают железные мечи'],
  },
  fortification: {
    name: 'Фортификация', icon: { block: 45 }, tier: 1, pos: [1, 1], prereqs: ['masonry'],
    cost: { stone: 80, wood: 40 }, points: 50,
    desc: 'Каменные стены и казармы для постоянного гарнизона.',
    effects: ['Открывает «Каменную стену»', 'Открывает «Казармы»'],
  },
  arcana: {
    name: 'Тайные знания', icon: { item: 'staff_fire' }, tier: 1, pos: [1, 4.6], prereqs: ['alchemy'],
    cost: { crystal: 8, gold: 10 }, points: 60,
    desc: 'Кристаллы маны раскрывают свою силу посвящённым.',
    effects: ['Открывает «Башню магов»', 'Предмет: Посох углей'],
  },
  mechanics: {
    name: 'Механика', icon: { item: 'crossbow' }, tier: 2, pos: [2, 2], prereqs: ['smithing'],
    cost: { wood: 60, iron: 20 }, points: 80,
    desc: 'Шестерни, рычаги и блоки ускоряют любую стройку.',
    effects: ['Предмет: Арбалет', 'Строители: +30% скорости'],
  },
  crystal_forging: {
    name: 'Кристальная ковка', icon: { item: 'sword_crystal' }, tier: 2, pos: [2, 3.3], prereqs: ['smithing', 'arcana'],
    cost: { crystal: 20, iron: 20 }, points: 110,
    desc: 'Сплав стали и маны — клинок, режущий саму тьму.',
    effects: ['Предмет: Кристальный клинок'],
  },
  storm_magic: {
    name: 'Магия бури', icon: { item: 'staff_storm' }, tier: 2, pos: [2, 4.3], prereqs: ['arcana'],
    cost: { crystal: 20, gold: 20 }, points: 110,
    desc: 'Призыв молний, перескакивающих между врагами.',
    effects: ['Предмет: Посох бури'],
  },
  frost_magic: {
    name: 'Магия льда', icon: { item: 'staff_frost' }, tier: 2, pos: [2, 5.3], prereqs: ['arcana'],
    cost: { crystal: 18, stone: 30 }, points: 100,
    desc: 'Ледяные осколки замедляют нежить.',
    effects: ['Предмет: Посох стужи', 'Башни магов замедляют зомби'],
  },
  restoration: {
    name: 'Магия жизни', icon: { item: 'staff_life' }, tier: 2, pos: [2, 6.3], prereqs: ['arcana'],
    cost: { crystal: 15, food: 60 }, points: 90,
    desc: 'Целительная волна для вас и союзников рядом.',
    effects: ['Предмет: Посох жизни'],
  },
  gunpowder: {
    name: 'Порох', icon: { item: 'musket' }, tier: 3, pos: [3, 2], prereqs: ['mechanics', 'mining'],
    cost: { coal: 40, iron: 30 }, points: 130,
    desc: 'Селитра, уголь и сера. Громко и очень эффективно.',
    effects: ['Мушкет, мушкетон, пороховая бомба', 'Стрелки на вышках берут мушкеты'],
  },
  meteor: {
    name: 'Звёздный огонь', icon: { item: 'tome_meteor' }, tier: 3, pos: [3, 4.8], prereqs: ['storm_magic', 'frost_magic'],
    cost: { crystal: 60, gold: 50 }, points: 300,
    desc: 'Древний фолиант, обрушивающий метеоры на орды мёртвых.',
    effects: ['Предмет: Фолиант метеоров'],
  },
  ballistics: {
    name: 'Баллистика', icon: { item: 'blunderbuss' }, tier: 4, pos: [4, 1.5], prereqs: ['gunpowder', 'fortification'],
    cost: { iron: 50, stone: 100 }, points: 180,
    desc: 'Расчёт траекторий превращает вышки в неприступные бастионы.',
    effects: ['Сторожевые вышки: +50% урона и дальности'],
  },
};
for (const id in TECHS) TECHS[id].id = id;
export const TECH_ORDER = Object.keys(TECHS);

const PASSIVE_RATE = 0.05;   // points / second, always

export class Research {
  constructor(game) {
    this.game = game;
    this.techs = TECHS;
    this.current = null;     // tech id being researched
    this.invested = 0;       // points invested in current
    this.points = 0;         // banked (unspent) points
    this.rate = 0;           // measured incoming points / second (for UI ETA)
    this._acc = 0; this._accT = 0;
  }
  init() {}
  onNewGame() { this.current = null; this.invested = 0; this.points = 0; this.rate = 0; }

  get state() { return this.game.state; }
  get progress() { return this.current ? Math.min(1, this.invested / TECHS[this.current].points) : 0; }
  isDone(id) { return this.state.researchDone.has(id); }
  prereqsMet(id) { const t = TECHS[id]; return !!t && t.prereqs.every(p => this.isDone(p)); }
  /** 'done' | 'active' | 'available' | 'locked' */
  status(id) {
    if (this.isDone(id)) return 'done';
    if (this.current === id) return 'active';
    return this.prereqsMet(id) ? 'available' : 'locked';
  }
  available() { return TECH_ORDER.filter(id => !this.isDone(id) && this.current !== id && this.prereqsMet(id)); }
  canStart(id) {
    if (this.current || !TECHS[id] || this.isDone(id) || !this.prereqsMet(id)) return false;
    return this.state.canAfford(TECHS[id].cost);
  }
  /** Why a tech can't be started (ru) or null. */
  blockReason(id) {
    const t = TECHS[id];
    if (!t) return 'Неизвестная технология';
    if (this.isDone(id)) return 'Уже изучено';
    if (this.current === id) return 'Исследуется';
    if (!this.prereqsMet(id)) return 'Требуется: ' + t.prereqs.filter(p => !this.isDone(p)).map(p => TECHS[p].name).join(', ');
    if (this.current) return 'Сначала завершите: ' + TECHS[this.current].name;
    if (!this.state.canAfford(t.cost)) return 'Не хватает ресурсов';
    return null;
  }
  /** Village laboratory status for the UI: {labs, researchers}. */
  labInfo() {
    const v = this.game.village;
    const labs = (v?.buildings || []).filter(b => b.type === 'laboratory' && b.state === 'complete');
    const researchers = (v?.villagers || []).filter(x => !x.dead && x.job === 'researcher').length;
    return { labs: labs.length, researchers };
  }

  start(id) {
    if (!this.canStart(id)) return false;
    if (!this.state.spend(TECHS[id].cost)) return false;
    this.current = id;
    this.invested = 0;
    this.game.bus.emit('research:started', { id });
    this.game.audio?.play?.('ui_open');
    return true;
  }
  /** Abort current research; refunds half of the resources. */
  cancel() {
    if (!this.current) return;
    const t = TECHS[this.current];
    const half = {}; for (const k in t.cost) half[k] = Math.floor(t.cost[k] / 2);
    this.state.refund(half);
    this.points += this.invested * 0.5;
    this.current = null; this.invested = 0;
  }
  addPoints(n) {
    if (!(n > 0)) return;
    this.points += n;
    this._acc += n;
  }

  update(dt) {
    this.points += PASSIVE_RATE * dt;
    this._acc += PASSIVE_RATE * dt;
    this._accT += dt;
    if (this._accT >= 3) { this.rate = this.rate * 0.4 + (this._acc / this._accT) * 0.6; this._acc = 0; this._accT = 0; }
    if (!this.current) return;
    const t = TECHS[this.current];
    // banked points flow into the active research at a visible pace
    const flow = Math.max(3, t.points * 0.08) * dt;
    const take = Math.min(this.points, flow, t.points - this.invested);
    if (take > 0) { this.points -= take; this.invested += take; }
    if (this.invested >= t.points - 1e-6) this.complete(this.current);
  }

  /** Mark tech done (also used by debug/cheats). */
  complete(id) {
    const t = TECHS[id]; if (!t) return;
    if (this.current === id) { this.current = null; this.invested = 0; }
    if (this.state.researchDone.has(id)) return;
    this.state.researchDone.add(id);
    const bus = this.game.bus;
    bus.emit('research:done', { id });
    for (const itemId in ITEMS) {
      if (ITEMS[itemId].research === id) { this.state.unlockedItems.add(itemId); bus.emit('item:unlocked', { id: itemId }); }
    }
    bus.emit('toast', { text: 'Исследование завершено: ' + t.name, kind: 'good' });
    this.game.audio?.play?.('research_done');
  }

  /** Seconds left for the active research at the current rate (null if unknown). */
  eta() {
    if (!this.current) return null;
    const t = TECHS[this.current];
    const need = t.points - this.invested - this.points;
    if (need <= 0) return (t.points - this.invested) / Math.max(3, t.points * 0.08);
    return need / Math.max(PASSIVE_RATE, this.rate || PASSIVE_RATE);
  }

  serialize() { return { current: this.current, invested: this.invested, points: this.points }; }
  deserialize(o) {
    if (!o) return;
    this.current = o.current && TECHS[o.current] ? o.current : null;
    this.invested = o.invested || 0;
    this.points = o.points || 0;
  }
}
