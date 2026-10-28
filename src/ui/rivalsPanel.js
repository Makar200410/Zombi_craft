// «Соседи» (N): the rival villages — where they are, how strong, who is at war with whom — and diplomacy:
// declare war, buy peace, accept their peace offer. Captured towns show the tribute they pay.
import { h, img, glyph, glyphImg, clear, dragScroll } from './dom.js';
import { AGES } from '../systems/ages.js';

const STATUS = {
  peace: ['Мир', '#9fe3a0'],
  war: ['Война с вами', '#ff8070'],
  vassal: ['Ваш вассал', '#ffd35a'],
  subject: ['Вассал соседей', '#c0b0e0'],
};

export class RivalsPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('castle')), h('span', 'Соседи')),
      this.sum = h('div.zc-inv-hint', ''),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    const rr = () => { if (this.open) this.render(); };
    this.game.bus.on('rivals:changed', rr);
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
    const R = this.game.rivals;
    clear(this.body);
    if (!R?.active) {
      this.sum.textContent = '';
      this.body.append(h('div.zc-rv-empty', 'В этом мире нет соседних деревень. Они появляются в новых больших мирах.'));
      return;
    }
    const ms = R.markers().sort((a, b) => a.dist - b.dist);
    const wars = ms.filter(m => m.status === 'war').length, vassals = ms.filter(m => m.status === 'vassal').length;
    this.sum.textContent = `Ваша оборона: ${Math.round(R.playerDefense())} · войн: ${wars} · вассалов: ${vassals}`;
    for (const m of ms) {
      const r = m.r, [st, col] = STATUS[m.status];
      const foes = R.warsOf(r.i).map(i => R.get(i)?.name).filter(Boolean);
      const lines = [
        `${AGES[r.tier - 1]?.name || ''} · жителей ${Math.round(r.pop)} · войско ${Math.floor(r.army)}/${r.armyCap} (сила ${Math.round(R.power(r))})`,
        `${m.dist} блоков на ${m.dir}`,
      ];
      if (m.status === 'subject') lines.push(`Подчиняется «${R.get(r.owner)?.name || '?'}»`);
      if (foes.length) lines.push(`Воюет с: ${foes.map(n => '«' + n + '»').join(', ')}`);
      if (r.raid && !r.raid.arrived) lines.push(`⚔ Отряд из ${r.raid.size} воинов идёт к вам: ~${Math.round(r.raid.eta)} с`);
      if (m.status === 'vassal') lines.push(`Дань каждое утро: дерево и камень +${8 * r.tier}, еда +${6 * r.tier}, золото +${2 * r.tier}${r.tier >= 3 ? `, железо +${3 * r.tier}` : ''}`);
      if (m.status === 'war') lines.push('Чтобы захватить: перебейте защитников и постойте у ратуши 8 секунд.');
      const btns = [];
      if (m.status === 'peace') btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => { R.declareWar(r, `Вы объявили войну «${r.name}»!`); this.render(); } }, 'Объявить войну'));
      if (m.status === 'war' && r.owner === null) {
        if (r.offer) btns.push(h('button.zc-chipbtn.sel.ui-i', { onclick: () => { R.offerPeace(r); this.render(); } }, `Принять мир (+${r.offer.gold} золота)`));
        else btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => { R.offerPeace(r); this.render(); } }, `Купить мир (${R.peacePrice(r)} золота)`));
      }
      this.body.append(h('div.zc-rv-town', { style: `border-left-color:${r.color}` },
        h('div.zc-rv-head', h('b', r.name), h('span.zc-rv-st', { style: `color:${col}` }, st)),
        ...lines.map(t => h('div.zc-rv-line', t)),
        btns.length ? h('div.zc-rv-btns', ...btns) : null));
    }
  }
  update() {
    this._t = (this._t || 0) + 1;
    if (this.open && this._t % 60 === 0) this.render();
  }
}
