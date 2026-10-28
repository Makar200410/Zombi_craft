// Inventory (E key or the «Инвентарь» button), split into tabs like a creative inventory:
// Оружие / Инструменты / Броня / Блоки / Технологии (firearms, late-age gear and mechanism blocks). Pick a hotbar slot on top, then an item below
// (an item already on the hotbar swaps places with it). Armour goes to the four armour slots instead.
import { ITEMS, ARMOR_SLOTS, ARMOR_SLOT_NAMES, RESOURCE_LABELS } from '../core/items.js';
import { BLOCKS } from '../core/blocks.js';
import { MECH_HELP } from '../systems/kinetics.js';
import { TECHS } from '../systems/research.js';
import { AGES } from '../systems/ages.js';
import { h, img, glyph, glyphImg, itemIcon, clear, toggle, dragScroll } from './dom.js';

const TABS = [
  ['weapons', 'Оружие', ['melee', 'ranged', 'spell']],
  ['tools', 'Инструменты', ['tool', 'build']],
  ['armor', 'Броня', ['armor']],
  ['blocks', 'Блоки', ['block']],
  ['tech', 'Технологии', ['gun', 'melee', 'ranged', 'block']],
];
// research of the gunpowder age and later: those weapons go to the «Технологии» tab
const TECH_RESEARCH = new Set(['gunpowder', 'steam_power', 'machine_guns', 'rocketry', 'ai', 'nanotech']);
const isTech = (it) => it.kind === 'gun' || (it.kind !== 'armor' && TECH_RESEARCH.has(it.research)) || (it.kind === 'block' && !!(BLOCKS[it.blockId]?.kinetic || BLOCKS[it.blockId]?.minAge));
const KIND_NAMES = { melee: 'Ближний бой', ranged: 'Стрелковое', gun: 'Огнестрельное', spell: 'Магия', tool: 'Инструменты', build: 'Строительство' };
const KINETIC_NAMES = { source: 'Механизмы: источники', shaft: 'Механизмы: передача', machine: 'Механизмы: машины', undefined: 'Механизмы: корпуса' };
// what each mechanism does (src/systems/kinetics.js); right-clicking a placed one shows its network
const MECH_DESC = { casing: 'Корпус для механизмов (декор).' };
for (const [id, text] of Object.entries(MECH_HELP)) MECH_DESC[BLOCKS[id].name] = text;

export class InventoryPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.target = 0;
    this.tab = 'weapons';
    this.root = h('div.zc-research.zc-craft.zc-inv.ui-i');
    this.slotsEl = h('div.zc-inv-slots');
    this.tabsEl = h('div.zc-cats.zc-inv-tabs');
    for (const [id, name] of TABS) this.tabsEl.append(h('button.zc-chipbtn.ui-i', { 'data-tab': id, onclick: () => { this.tab = id; this.ui.click(); this.render(); } }, name));
    this.grid = h('div.zc-inv-grid');
    dragScroll(this.grid, { x: false, y: true });
    this.grid.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.hint = h('div.zc-inv-hint', 'Выберите ячейку панели, затем предмет');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('sword')), h('span', 'Инвентарь')),
      this.hint,
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.slotsEl, this.tabsEl, this.grid);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    const bus = this.game.bus;
    const rr = () => { if (this.open) this.render(); };
    bus.on('item:unlocked', rr); bus.on('research:done', rr); bus.on('hotbar:changed', rr); bus.on('armor:changed', rr); bus.on('craft:changed', rr); bus.on('age:changed', rr);
  }

  show() {
    const p = this.game.player;
    this.target = p?.selected ?? 0;
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

  owns(id) {
    const cr = this.game.crafting;
    if (cr) return cr.owns(id);
    const it = ITEMS[id];
    if (it.kind === 'block') return (this.game.state.age | 0) >= (it.minAge || 0);
    return !it.research || this.game.state.researchDone.has(it.research);
  }

  /** Items shown on a tab, grouped: [[groupName, ids[]], ...]. */
  groups(tab) {
    const [, , kinds] = TABS.find(t => t[0] === tab);
    let ids = Object.keys(ITEMS).filter(id => kinds.includes(ITEMS[id].kind) && !ITEMS[id].hidden);
    if (tab === 'tech') {
      ids = ids.filter(id => isTech(ITEMS[id]));
      const out = [['Технологичное оружие', ids.filter(id => ITEMS[id].kind !== 'block')]];
      const blocks = ids.filter(id => ITEMS[id].kind === 'block');
      for (const k of ['source', 'shaft', 'machine', undefined]) out.push([KINETIC_NAMES[k], blocks.filter(id => (BLOCKS[ITEMS[id].blockId].kinetic || undefined) === k)]);
      return out;
    }
    ids = ids.filter(id => !isTech(ITEMS[id]));
    if (tab === 'blocks') return [['', ids]];
    if (tab === 'armor') return ARMOR_SLOTS.map(s => [ARMOR_SLOT_NAMES[s], ids.filter(id => ITEMS[id].slot === s)]);
    return kinds.map(k => [KIND_NAMES[k] || k, ids.filter(id => ITEMS[id].kind === k)]);
  }

  render() {
    const p = this.game.player; if (!p) return;
    const hb = p.hotbar, armorTab = this.tab === 'armor';
    for (const b of this.tabsEl.children) toggle(b, 'sel', b.dataset.tab === this.tab);
    this.hint.textContent = armorTab ? `Защита: ${p.armorDefense || 0} (−${Math.round(Math.min(0.7, (p.armorDefense || 0) * 0.03) * 100)}% урона)` : 'Выберите ячейку панели, затем предмет';
    clear(this.slotsEl);
    if (armorTab) {
      // the four worn pieces
      for (const s of ARMOR_SLOTS) {
        const id = p.armor?.[s];
        this.slotsEl.append(h('button.zc-inv-slot.zc-inv-armor.ui-i', { title: id ? ITEMS[id].name + ' — снять' : ARMOR_SLOT_NAMES[s], onclick: () => { if (id) { p.equipArmor(id); this.ui.click(); } } },
          id ? img(itemIcon(id)) : h('span.zc-inv-empty', ARMOR_SLOT_NAMES[s])));
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const id = hb[i];
        const slot = h('button.zc-inv-slot.ui-i' + (i === this.target ? '.target' : ''), { title: id ? ITEMS[id]?.name : 'Пусто', onclick: () => { this.target = i; this.ui.click(); this.render(); } },
          id ? img(itemIcon(id)) : null, h('span.zc-slot-key', String(i + 1)),
          id ? h('span.zc-inv-x.ui-i', { title: 'Убрать', onclick: (e) => { e.stopPropagation(); hb[i] = null; this._changed(); } }, '×') : null);
        this.slotsEl.append(slot);
      }
    }
    clear(this.grid);
    toggle(this.grid, 'blocks', this.tab === 'blocks');
    for (const [name, ids] of this.groups(this.tab)) {
      if (!ids.length) continue;
      if (name) this.grid.append(h('div.zc-inv-cat', name));
      for (const id of ids) this.grid.append(this.tab === 'blocks' ? this.cell(id) : this.card(id));
    }
  }

  _why(id) {
    const it = ITEMS[id], p = this.game.player, own = this.owns(id);
    if (it.kind === 'armor') return own ? (p.armor?.[it.slot] === id ? 'Надето' : 'Нажмите, чтобы надеть') : it.research && !this.game.state.researchDone.has(it.research) ? 'Нужно: ' + (TECHS[it.research]?.name || it.research) : 'Создайте в «Крафте» → Броня';
    if (it.kind === 'block' && !own) return 'Откроется: ' + (AGES[it.minAge]?.name || 'позже');
    const where = p.hotbar.indexOf(id);
    if (own) return where >= 0 ? 'В ячейке ' + (where + 1) : '';
    return it.research && !this.game.state.researchDone.has(it.research) ? 'Нужно: ' + (TECHS[it.research]?.name || it.research) : 'Создайте в «Крафте»';
  }
  _cost(id) {
    const b = BLOCKS[ITEMS[id].blockId];
    const c = Object.entries(b?.cost || {});
    return c.length ? c.map(([r, n]) => `${RESOURCE_LABELS[r] || r} ${n}`).join(', ') : 'Бесплатно';
  }

  card(id) {
    const it = ITEMS[id], p = this.game.player, own = this.owns(id);
    const on = it.kind === 'armor' ? p.armor?.[it.slot] === id : p.hotbar.includes(id);
    const why = this._why(id);
    const stats = it.kind === 'armor' ? `Защита +${it.def}` : it.kind === 'block' ? this._cost(id) : it.damage ? `Урон ${it.damage}${it.pellets ? '×' + it.pellets : ''}` : it.heal ? `Лечение ${it.heal}` : '';
    const desc = it.kind === 'block' ? MECH_DESC[BLOCKS[it.blockId]?.name] || '' : it.desc || '';
    return h('button.zc-inv-item.ui-i' + (own ? '' : '.locked') + (on ? '.equipped' : ''), { title: desc || it.name, onclick: () => this.place(id) },
      h('div.zc-inv-ico', img(itemIcon(id))), h('div.zc-inv-name', it.name, h('small', stats)),
      it.kind === 'block' && desc ? h('div.zc-inv-why', desc) : null, why ? h('div.zc-inv-why', why) : null);
  }
  /** Compact Minecraft-like block cell. */
  cell(id) {
    const it = ITEMS[id], on = this.game.player.hotbar.includes(id);
    return h('button.zc-inv-cell.ui-i' + (on ? '.equipped' : ''), { title: `${it.name}\nСтоимость: ${this._cost(id)}`, onclick: () => this.place(id) }, img(itemIcon(id)));
  }

  /** Put item id into the target slot (swapping if it already sits in another slot); armour is worn instead. */
  place(id) {
    const p = this.game.player; if (!p) return;
    const it = ITEMS[id];
    if (!this.owns(id)) { this.ui.toast(this._why(id) || 'Недоступно', 'bad'); this.game.audio?.play?.('mana_empty'); return; }
    if (it.kind === 'armor') { p.equipArmor(id); this.ui.click(); return; }
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
