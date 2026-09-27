// Inventory: every weapon, tool and spell the player owns; put any of them into any hotbar slot.
// Opened by the «Инвентарь» button or the E key. Pick a slot on top, then an item below
// (an item already on the hotbar swaps places with it).
import { ITEMS } from '../core/items.js';
import { TECHS } from '../systems/research.js';
import { h, img, glyph, glyphImg, itemIcon, clear, toggle } from './dom.js';

const KIND_ORDER = ['melee', 'ranged', 'gun', 'spell', 'tool', 'build'];
const KIND_NAMES = { melee: 'Ближний бой', ranged: 'Стрелковое', gun: 'Огнестрельное', spell: 'Магия', tool: 'Инструменты', build: 'Строительство' };

export class InventoryPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.target = 0;
    this.root = h('div.zc-research.zc-craft.zc-inv.ui-i');
    this.slotsEl = h('div.zc-inv-slots');
    this.grid = h('div.zc-inv-grid');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('sword')), h('span', 'Инвентарь')),
      h('div.zc-inv-hint', 'Выберите ячейку панели, затем предмет'),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.slotsEl, this.grid);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    const bus = this.game.bus;
    const rr = () => { if (this.open) this.render(); };
    bus.on('item:unlocked', rr); bus.on('research:done', rr); bus.on('hotbar:changed', rr);
  }

  show() {
    const p = this.game.player;
    this.target = p?.selected ?? 0;
    this.open = true;
    this.root.classList.add('open');
    this.ui._unlockPointer?.();
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

  owns(id) {
    const cr = this.game.crafting;
    if (cr) return cr.owns(id);
    const it = ITEMS[id];
    return !it.research || this.game.state.researchDone.has(it.research);
  }

  render() {
    const p = this.game.player; if (!p) return;
    const hb = p.hotbar;
    clear(this.slotsEl);
    for (let i = 0; i < 9; i++) {
      const id = hb[i];
      const slot = h('button.zc-inv-slot.ui-i' + (i === this.target ? '.target' : ''), { title: id ? ITEMS[id]?.name : 'Пусто', onclick: () => { this.target = i; this.ui.click(); this.render(); } },
        id ? img(itemIcon(id)) : null, h('span.zc-slot-key', String(i + 1)),
        id ? h('span.zc-inv-x.ui-i', { title: 'Убрать', onclick: (e) => { e.stopPropagation(); hb[i] = null; this._changed(); } }, '×') : null);
      this.slotsEl.append(slot);
    }
    clear(this.grid);
    const ids = Object.keys(ITEMS).sort((a, b) => KIND_ORDER.indexOf(ITEMS[a].kind) - KIND_ORDER.indexOf(ITEMS[b].kind));
    let kind = null;
    for (const id of ids) {
      const it = ITEMS[id];
      if (it.kind !== kind) { kind = it.kind; this.grid.append(h('div.zc-inv-cat', KIND_NAMES[kind] || kind)); }
      const own = this.owns(id);
      const where = hb.indexOf(id);
      const why = own ? (where >= 0 ? 'В ячейке ' + (where + 1) : '') : it.research && !this.game.state.researchDone.has(it.research) ? 'Нужно: ' + (TECHS[it.research]?.name || it.research) : 'Создайте в «Крафте»';
      const stats = it.damage ? `Урон ${it.damage}${it.pellets ? '×' + it.pellets : ''}` : it.heal ? `Лечение ${it.heal}` : '';
      const card = h('button.zc-inv-item.ui-i' + (own ? '' : '.locked') + (where >= 0 ? '.equipped' : ''), {
        title: it.desc || it.name,
        onclick: () => this.place(id),
      }, h('div.zc-inv-ico', img(itemIcon(id))), h('div.zc-inv-name', it.name, h('small', stats)), why ? h('div.zc-inv-why', why) : null);
      this.grid.append(card);
    }
  }

  /** Put item id into the target slot (swapping if it already sits in another slot). */
  place(id) {
    const p = this.game.player; if (!p) return;
    if (!this.owns(id)) { this.ui.toast(ITEMS[id]?.research && !this.game.state.researchDone.has(ITEMS[id].research) ? 'Сначала исследуйте: ' + (TECHS[ITEMS[id].research]?.name || '') : 'Сначала создайте в «Крафте»', 'bad'); this.game.audio?.play?.('mana_empty'); return; }
    const hb = p.hotbar, t = this.target;
    const from = hb.indexOf(id);
    if (from === t) return;
    if (from >= 0) hb[from] = hb[t] || null;
    hb[t] = id;
    this.ui.click();
    this.target = (t + 1) % 9;
    this._changed();
  }
  _changed() {
    const p = this.game.player;
    p?._emitHotbar?.();
    this.game.bus.emit('hotbar:changed', {});
    this.render();
  }
  update() {}
}
