// The chronicle of a world: statistics, achievements and a timeline of how the village grew — a picture of it is
// taken when every new age begins (and whenever the player asks). Everything is kept in the world's save.
import { AGES } from './ages.js';

const S = (g) => g.state.stats;
/** Achievements: [id, name, description, test(game, stats)]. */
export const ACHIEVEMENTS = [
  ['first_blood', 'Первая кровь', 'Убейте первого зомби', (g, s) => s.kills >= 1],
  ['slayer', 'Истребитель', 'Убейте 250 зомби', (g, s) => s.kills >= 250],
  ['legend', 'Легенда ночи', 'Убейте 2000 зомби', (g, s) => s.kills >= 2000],
  ['night1', 'Первая ночь', 'Переживите первую волну', (g, s) => s.wavesSurvived >= 1],
  ['night10', 'Десять ночей', 'Переживите 10 волн', (g, s) => s.wavesSurvived >= 10],
  ['night30', 'Несокрушимые', 'Переживите 30 волн', (g, s) => s.wavesSurvived >= 30],
  ['miner', 'Шахтёр', 'Добудьте 500 блоков', (g, s) => s.blocksMined >= 500],
  ['builder', 'Зодчий', 'Поставьте 500 блоков', (g, s) => s.blocksPlaced >= 500],
  ['lumber', 'Лесоруб', 'Срубите 100 деревьев', (g, s) => s.treesFelled >= 100],
  ['town', 'Городок', 'Постройте 15 зданий', (g, s) => (s.buildingsBuilt || 0) >= 15],
  ['city', 'Город', 'Постройте 50 зданий', (g, s) => (s.buildingsBuilt || 0) >= 50],
  ['people20', 'Двадцать душ', 'Доведите население до 20', (g, s) => (s.maxPop || 0) >= 20],
  ['people60', 'Многолюдье', 'Доведите население до 60', (g, s) => (s.maxPop || 0) >= 60],
  ['bronze', 'Бронзовый век', 'Перейдите в Бронзовый век', (g) => (g.state.age | 0) >= 1],
  ['middle', 'Средневековье', 'Дойдите до Средневековья', (g) => (g.state.age | 0) >= 3],
  ['industry', 'Индустрия', 'Дойдите до Индустриальной эры', (g) => (g.state.age | 0) >= 5],
  ['future', 'Будущее', 'Дойдите до последней эпохи', (g) => (g.state.age | 0) >= AGES.length - 1],
  ['boss', 'Победитель чудовищ', 'Сразите босса подземелья', (g) => (g.state.bossesSlain?.length || 0) >= 1],
  ['deep', 'Глубины', 'Спуститесь ниже 150-го уровня', (g, s) => (s.deepest ?? 999) <= 150],
  ['hell', 'Преисподняя', 'Спуститесь в подземный мир', (g, s) => (s.deepest ?? 999) <= 90],
  ['explorer', 'Путешественник', 'Отойдите от дома на 1000 блоков', (g, s) => (s.farthest || 0) >= 1000],
  ['trader', 'Купец', 'Совершите 20 сделок с соседями', (g, s) => (s.trades || 0) >= 20],
  ['escort', 'Охрана каравана', 'Проводите караван', (g, s) => (s.escorts || 0) >= 1],
  ['robber', 'Разбойник', 'Ограбьте караван', (g, s) => (s.robberies || 0) >= 1],
  ['conqueror', 'Завоеватель', 'Захватите соседнюю деревню', (g) => (g.rivals?.list || []).some(r => r.owner === 'player')],
  ['emperor', 'Император', 'Сделайте вассалами три деревни', (g) => (g.rivals?.list || []).filter(r => r.owner === 'player').length >= 3],
  ['engineer', 'Инженер', 'Запустите механизм от источника вращения', (g) => (g.kinetics?.nets || []).some(n => n.rpm > 0 && n.machines.length)],
  ['electric', 'Да будет свет', 'Зажгите прожектор от своей электросети', (g) => (g.electric?.nets || []).some(n => n.on && n.users.length)],
  ['architect', 'Архитектор', 'Сохраните свой чертёж', (g) => (g.blueprints?.list?.length || 0) >= 1],
  ['survivor', 'Долгожитель', 'Проведите в мире 3 часа', (g, s) => (s.playTime || 0) >= 3 * 3600],
];

export class Chronicle {
  constructor(game) {
    this.game = game;
    this.done = new Map();      // achievement id -> day it was earned
    this.timeline = [];         // {age, day, img, pop, buildings, note}
    this.t = 0;
    const bus = game.bus;
    bus.on('building:completed', ({ rebuilt } = {}) => { if (!rebuilt && game.running) S(game).buildingsBuilt = (S(game).buildingsBuilt || 0) + 1; });
    bus.on('age:changed', ({ age }) => setTimeout(() => this.snapshot(`Наступила эпоха «${AGES[age]?.name || ''}»`), 2500));
    bus.on('game:begin', ({ loaded } = {}) => {
      if (loaded) return;
      this.done.clear(); this.timeline = [];
      setTimeout(() => this.snapshot('Основание деревни'), 4000);
    });
  }
  serialize() { return { done: [...this.done], timeline: this.timeline }; }
  deserialize(o) { this.done = new Map(o?.done || []); this.timeline = Array.isArray(o?.timeline) ? o.timeline : []; }

  update(dt) {
    const g = this.game;
    if (!g.running || g.net?.isClient) return;
    const s = S(g);
    s.playTime = (s.playTime || 0) + dt;
    this.t += dt;
    if (this.t < 2) return;
    this.t = 0;
    const p = g.player?.position, c = g.village?.townHall?.center;
    if (p) {
      if (c) s.farthest = Math.max(s.farthest || 0, Math.round(Math.hypot(p.x - c.x, p.z - c.z)));
      if (!g.player.dead) s.deepest = Math.min(s.deepest ?? 999, Math.floor(p.y));
    }
    s.maxPop = Math.max(s.maxPop || 0, g.village?.villagers?.length || 0);
    for (const [id, name, desc, test] of ACHIEVEMENTS) {
      if (this.done.has(id)) continue;
      let ok = false; try { ok = !!test(g, s); } catch (e) { ok = false; }
      if (!ok) continue;
      this.done.set(id, g.state.day);
      g.bus.emit('toast', { text: `🏆 Достижение: «${name}» — ${desc}`, kind: 'good' });
      g.audio?.play('quest_done', { volume: 0.5 });
      g.bus.emit('chronicle:changed', {});
    }
  }

  /** A picture of the village for the timeline: from above the town hall when the player is home, else his view. */
  snapshot(note = 'Снимок') {
    const g = this.game, R = g.renderer, cam = g.camera, th = g.village?.townHall;
    if (!g.running || !R || !g.world) return null;
    let url = null;
    const pos = cam.position.clone(), quat = cam.quaternion.clone();
    const vm = g.player?.viewmodel;
    try {
      vm?.setVisible?.(false);
      const p = g.player?.position, home = th && p && Math.hypot(p.x - th.center.x, p.z - th.center.z) < 160;
      if (home) {
        const c = th.center, a = (g.state.day * 0.7) % (Math.PI * 2);
        const top = th.y + (th.height || 10);
        cam.position.set(c.x + Math.cos(a) * 34, top + 14, c.z + Math.sin(a) * 34);
        cam.lookAt(c.x, th.y + 4, c.z);
        cam.updateMatrixWorld();
      }
      R.render(0);
      const src = R.domElement, out = document.createElement('canvas');
      out.width = 320; out.height = Math.round(320 * src.height / Math.max(1, src.width));
      out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
      url = out.toDataURL('image/jpeg', 0.72);
    } catch (e) { url = null; }
    cam.position.copy(pos); cam.quaternion.copy(quat); cam.updateMatrixWorld();
    if (!url || url.length < 2000) return null;
    const v = g.village;
    this.timeline.push({ age: g.state.age | 0, day: g.state.day, img: url, note,
      pop: v?.villagers?.length || 0, buildings: (v?.buildings || []).filter(b => b.state === 'complete').length });
    if (this.timeline.length > 40) this.timeline.splice(1, 1);         // keep the founding picture
    g.bus.emit('chronicle:changed', {});
    return url;
  }
}
