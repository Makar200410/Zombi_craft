// Crafting window: smelting queue + recipe cards per category. Opened by the «Крафт» button, the I key,
// or by using a workbench / furnace / iron block / arcane table in the world (then filtered to that station).
import { RECIPES, RECIPE_CATS, STATIONS } from '../systems/crafting.js';
import { ITEMS } from '../core/items.js';
import { h, img, glyph, glyphImg, resourceIcon, itemIcon, costRow, clear, toggle } from './dom.js';

const STATION_CAT = { furnace: 'smelt', anvil: 'weapons', arcane: 'magic', workbench: 'tools' };

export class CraftPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.cat = 'smelt';
    this.root = h('div.zc-research.zc-craft.ui-i');
    this.stationsEl = h('div.zc-cr-stations');
    this.queueEl = h('div.zc-cr-queue');
    this.cats = h('div.zc-cats.zc-cr-cats');
    for (const [id, name] of RECIPE_CATS) this.cats.append(h('button.zc-chipbtn.ui-i', { 'data-cat': id, onclick: () => { this.cat = id; this.ui.click(); this.render(); } }, name));
    this.grid = h('div.zc-cr-grid');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('hammer')), h('span', 'Крафт')),
      this.stationsEl,
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.queueEl, this.cats, this.grid);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    const bus = this.game.bus;
    const rr = () => { if (this.open) this._dirty = true; };
    bus.on('resources:changed', rr); bus.on('craft:changed', rr); bus.on('research:done', rr); bus.on('building:completed', rr);
    bus.on('ui:craft', ({ station } = {}) => this.show(station));
    this._t = 0;
  }

  show(station) {
    if (station && STATION_CAT[station]) this.cat = STATION_CAT[station];
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

  render() {
    const cr = this.game.crafting; if (!cr) return;
    this._dirty = false;
    for (const b of this.cats.children) toggle(b, 'on', b.dataset.cat === this.cat);
    // stations available right now
    const have = cr.stations();
    clear(this.stationsEl);
    for (const [id, s] of Object.entries(STATIONS)) {
      if (id === 'hand') continue;
      this.stationsEl.append(h('span.zc-cr-st' + (have.has(id) ? '.on' : ''), { title: have.has(id) ? 'Доступно' : 'Нет рядом: постройте здание или подойдите к блоку' }, s.name));
    }
    this.renderQueue();
    const sc = this.grid.scrollTop;
    clear(this.grid);
    for (const r of RECIPES.filter(r => r.cat === this.cat)) this.grid.append(this.card(r));
    if (this.cat === 'smelt') this.grid.append(h('div.zc-cr-tip',
      'Руду добывают киркой: ищите камни с бежевыми (железо) и чёрными (уголь) вкраплениями — рядом с деревней лежат рудные валуны, много руды в горах и пещерах. ',
      'Шахта с шахтёрами добывает руду сама, а кузнец в Кузнице переплавляет её автоматически.'));
    this.grid.scrollTop = sc;
  }
  card(r) {
    const cr = this.game.crafting, st = this.game.state;
    const c = cr.check(r);
    const icon = r.kind === 'item' ? itemIcon(r.item) : resourceIcon(Object.keys(r.out)[0]);
    const status = c.owned ? h('div.zc-cr-status.ok', 'Уже есть') : c.locked ? h('div.zc-cr-status.lock', img(glyph('lock')), 'Нужно исследование') : c.station ? h('div.zc-cr-status.warn', 'Нужна: ' + STATIONS[r.station].name) : null;
    const actions = h('div.zc-cr-actions');
    if (r.kind === 'smelt') {
      actions.append(
        h('button.zc-btn.primary.small.ui-i', { disabled: !c.ok, onclick: () => { cr.craft(r.id, 1); this.ui.click(); } }, h('span.zc-btn-lbl', 'Плавить')),
        h('button.zc-btn.small.ui-i', { disabled: !c.ok, onclick: () => { cr.craft(r.id, 5); this.ui.click(); } }, h('span.zc-btn-lbl', '×5')));
    } else if (!c.owned) {
      actions.append(h('button.zc-btn.primary.small.ui-i', { disabled: !c.ok, onclick: () => { cr.craft(r.id); } }, h('span.zc-btn-lbl', 'Создать')));
    }
    const it = r.kind === 'item' ? ITEMS[r.item] : null;
    const stats = it ? h('div.zc-cr-stats', it.damage ? `Урон ${it.damage}${it.pellets ? '×' + it.pellets : ''}` : it.heal ? `Лечение ${it.heal}` : '', it.manaCost ? ` · мана ${it.manaCost}` : '') : null;
    const out = r.kind === 'smelt' ? h('div.zc-cr-out', '→ ', img(resourceIcon(Object.keys(r.out)[0])), '×' + Object.values(r.out)[0], ` · ${r.time} с`) : null;
    return h('div.zc-cr-card.zc-panel' + (c.ok ? '.ok' : '') + (c.owned ? '.owned' : ''),
      h('div.zc-cr-top', h('div.zc-cr-ico', img(icon)), h('div.zc-cr-name', r.name, stats, out)),
      r.desc ? h('div.zc-cr-desc', r.desc) : null,
      c.owned ? null : costRow(st, r.in),
      status, actions);
  }
  renderQueue() {
    const q = this.game.crafting?.queue || [];
    clear(this.queueEl);
    toggle(this.queueEl, 'show', q.length > 0);
    if (!q.length) return;
    const j = q[0];
    const r = RECIPES.find(x => x.id === j.id);
    this._qFill = h('div.zc-rpill-fill');
    this.queueEl.append(img(glyph('flask')), h('span', `Печь: ${r ? r.name : ''}${q.length > 1 ? ` (+${q.length - 1} в очереди)` : ''}`), h('div.zc-rpill-track.zc-cr-track', this._qFill));
  }
  update(dt) {
    if (!this.open) return;
    this._t += dt;
    const q = this.game.crafting?.queue;
    if (q && q.length && this._qFill) this._qFill.style.width = ((1 - q[0].left / q[0].total) * 100).toFixed(1) + '%';
    // stations depend on where the player stands; refresh occasionally
    if (this._dirty || this._t > 1.5) { this._t = 0; this.render(); }
  }
}
