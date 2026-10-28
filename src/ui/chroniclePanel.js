// «Летопись» (L): how the village grew (a picture of every age), achievements and the world's statistics.
import { h, img, glyph, glyphImg, clear, toggle, dragScroll } from './dom.js';
import { AGES } from '../systems/ages.js';
import { ACHIEVEMENTS } from '../systems/chronicle.js';

const TABS = [['timeline', 'Летопись'], ['ach', 'Достижения'], ['stats', 'Статистика']];
const fmtTime = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };

export class ChroniclePanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.tab = 'timeline';
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    this.tabsEl = h('div.zc-cats');
    for (const [id, name] of TABS) this.tabsEl.append(h('button.zc-chipbtn.ui-i', { 'data-tab': id, onclick: () => { this.tab = id; this.ui.click(); this.render(); } }, name));
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('flag')), h('span', 'Летопись')),
      this.tabsEl,
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    this.game.bus.on('chronicle:changed', () => { if (this.open) this.render(); });
  }
  show() {
    this.open = true;
    this.root.classList.add('open');
    this.ui._unlockPointer?.(); this.game.input?.releasePointer?.();
    this.game.audio?.play?.('ui_open');
    this.render();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.game.audio?.play?.('ui_close');
    this.ui.onPanelClosed?.();
  }
  toggle() { if (this.open) this.close(); else this.show(); }

  render() {
    const C = this.game.chronicle; if (!C) return;
    for (const b of this.tabsEl.children) toggle(b, 'sel', b.dataset.tab === this.tab);
    clear(this.body);
    if (this.tab === 'timeline') {
      this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#e8c040' },
        h('div.zc-rv-head', h('b', 'Как росла ваша деревня'), h('button.zc-chipbtn.sel.ui-i', { onclick: () => { this.close(); setTimeout(() => { if (C.snapshot('Памятный день')) this.ui.toast('Снимок добавлен в летопись', 'good'); this.show(); }, 200); } }, 'Сделать снимок')),
        h('div.zc-rv-line', 'Снимок делается сам в начале каждой эпохи. Добавить свой — кнопкой выше.')));
      if (!C.timeline.length) this.body.append(h('div.zc-rv-empty', 'Пока пусто: первые страницы появятся совсем скоро.'));
      for (const e of [...C.timeline].reverse()) {
        const age = AGES[e.age];
        this.body.append(h('div.zc-rv-town.zc-chron', { style: `border-left-color:${age?.color || '#888'}` },
          h('img.zc-chron-img', { src: e.img, alt: '' }),
          h('div.zc-rv-head', h('b', e.note || age?.name || ''), h('span.zc-rv-st', `День ${e.day}`)),
          h('div.zc-rv-line', `${age?.name || ''} · жителей ${e.pop} · зданий ${e.buildings}`)));
      }
    } else if (this.tab === 'ach') {
      const n = C.done.size;
      this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#e8c040' }, h('div.zc-rv-head', h('b', `Открыто ${n} из ${ACHIEVEMENTS.length}`))));
      for (const [id, name, desc] of ACHIEVEMENTS) {
        const day = C.done.get(id), got = day !== undefined;
        this.body.append(h('div.zc-rv-town' + (got ? '' : '.zc-ach-off'), { style: `border-left-color:${got ? '#9fe3a0' : '#555'}` },
          h('div.zc-rv-head', h('b', (got ? '🏆 ' : '🔒 ') + name), got ? h('span.zc-rv-st', `день ${day}`) : null), h('div.zc-rv-line', desc)));
      }
    } else {
      const g = this.game, s = g.state.stats, v = g.village;
      const rows = [
        ['Дней прожито', g.state.day], ['Время в мире', fmtTime(s.playTime || 0)], ['Эпоха', AGES[g.state.age | 0]?.name],
        ['Зомби убито', s.kills || 0], ['Волн отбито', s.wavesSurvived || 0], ['Боссов повержено', g.state.bossesSlain?.length || 0],
        ['Жителей сейчас / рекорд', `${v?.villagers?.length || 0} / ${s.maxPop || 0}`], ['Жителей потеряно', s.villagersLost || 0],
        ['Зданий построено', s.buildingsBuilt || 0], ['Блоков добыто', s.blocksMined || 0], ['Блоков поставлено', s.blocksPlaced || 0], ['Деревьев срублено', s.treesFelled || 0],
        ['Сундуков открыто', s.chests || 0], ['Глубже всего', s.deepest != null && s.deepest < 999 ? `уровень ${s.deepest}` : '—'], ['Дальше всего от дома', `${s.farthest || 0} блоков`],
        ['Сделок с соседями', s.trades || 0], ['Караванов проведено / ограблено', `${s.escorts || 0} / ${s.robberies || 0}`],
        ['Вассалов', (g.rivals?.list || []).filter(r => r.owner === 'player').length], ['Смертей героя', s.deaths || 0],
      ];
      this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#e8c040' }, h('div.zc-rv-head', h('b', 'Статистика мира')),
        ...rows.map(([k, val]) => h('div.zc-rv-trade', h('span', k), h('b', String(val))))));
    }
  }
  update() {}
}
