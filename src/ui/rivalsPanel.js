// «Соседи» (N): the rival villages — where they are, how strong, who is at war with whom — and diplomacy:
// declare war, buy peace, accept their peace offer. Captured towns show the tribute they pay.
import { h, img, glyph, glyphImg, clear, dragScroll } from './dom.js';
import { AGES } from '../systems/ages.js';
import { RESOURCE_LABELS } from '../core/items.js';
import { SELLS, BUYS } from '../systems/caravans.js';

const STATUS = {
  peace: ['Мир', '#9fe3a0'],
  war: ['Война с вами', '#ff8070'],
  vassal: ['Ваш вассал', '#ffd35a'],
  ally: ['Ваш союзник', '#80d0ff'],
  subject: ['Вассал соседей', '#c0b0e0'],
};

export class RivalsPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.trade = null;        // town index when the trade view is open
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('shield')), h('span', 'Соседи')),
      this.sum = h('div.zc-inv-hint', ''),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    const rr = () => { if (this.open) this.render(); };
    this.game.bus.on('rivals:changed', rr);
    this.game.bus.on('siege:state', () => { if (this.open && this._ruler) this.render(); });
    this.game.bus.on('resources:changed', () => { if (this.open && this.trade !== null) this.render(); });
    this.game.bus.on('ui:trade', ({ town }) => { this.trade = town; if (this.open) this.render(); else this.show(); });
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
    this.trade = null;
    this.root.classList.remove('open');
    this.game.audio?.play?.('ui_close');
    this.ui.onPanelClosed?.();
  }
  toggle() { if (this.open) this.close(); else this.show(); }

  get _ruler() { const n = this.game.net; return !!n?.isClient && n.siegeRole === 'rival'; }
  /** A diplomatic act of the host's village: done here by the host, sent to the host by a hero who shares it. */
  _dip(act, town, extra = {}) {
    const R = this.game.rivals, net = this.game.net;
    if (net?.isClient) { net.send({ t: 'vcmd', op: 'dip', act, town, ...extra }); this.ui.click(); return; }
    const r = R.get(town), say = (t) => { if (t) this.ui.toast(t, t.includes('отказ') ? 'bad' : 'info'); };
    if (act === 'war' && r) R.declareWar(r, `Вы объявили войну «${r.name}»!`, { byHost: true });
    else if (act === 'ally') say(R.propose('P', town, 'ally'));
    else if (act === 'peace') say(R.propose('P', town, 'peace'));
    else if (act === 'unally') R.breakPact(town, 'P');
    else if (act === 'buy' && r) R.offerPeace(r);
    else if (act === 'answer') R.answer(extra.id, !!extra.yes, 'host');
    this.render();
  }
  render() {
    const R = this.game.rivals;
    clear(this.body);
    if (!R?.active) {
      this.sum.textContent = '';
      this.body.append(h('div.zc-rv-empty', 'В этом мире нет соседних деревень. Они появляются в новых больших мирах.'));
      return;
    }
    // a ruler of another town: their own town's treaties (orders go to the host, see net/siege.js)
    const net = this.game.net;
    if (this._ruler) {
      const t = net.siegeState?.town;
      this.sum.textContent = t ? `Ваша деревня «${t.name}» · войско ${t.army}` : '';
      if (!t) { this.body.append(h('div.zc-rv-empty', 'Ждём донесений от хозяина мира…')); return; }
      this.body.append(...this.ui.siege.diplomacy(t));
      return;
    }
    if (this.trade !== null && R.get(this.trade)) { this.renderTrade(R.get(this.trade)); return; }
    const C = this.game.caravans;
    const ms = R.markers().sort((a, b) => a.dist - b.dist);
    const wars = ms.filter(m => m.status === 'war').length, vassals = ms.filter(m => m.status === 'vassal').length;
    this.sum.textContent = `Ваша оборона: ${Math.round(R.playerDefense())} · войн: ${wars} · вассалов: ${vassals}`;
    // offers from the other players (and towns) to the host
    for (const o of R.offersFor('P')) {
      this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#9fe3a0' },
        h('div.zc-rv-head', h('b', `${R.sideName(o.from)} предлагает ${o.kind === 'ally' ? 'союз' : 'мир'}`)),
        h('div.zc-rv-line', o.kind === 'ally' ? 'Союзники не воюют друг с другом и вступают в войну, если на одного из вас нападут.' : 'Война закончится, их отряды вернутся домой.'),
        h('div.zc-rv-btns',
          h('button.zc-chipbtn.sel.ui-i', { onclick: () => this._dip('answer', null, { id: o.id, yes: 1 }) }, 'Принять'),
          h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('answer', null, { id: o.id, yes: 0 }) }, 'Отказать'))));
    }
    for (const m of ms) {
      const r = m.r, [st, col] = STATUS[m.status];
      const foes = R.warsOf(r.i).map(i => R.get(i)?.name).filter(Boolean);
      const pace = (r.drive || 1) >= 1.4 ? 'процветает' : (r.drive || 1) >= 1.1 ? 'быстро растёт' : (r.drive || 1) >= 0.8 ? 'растёт' : 'отстаёт';
      const lines = [
        `${AGES[r.tier - 1]?.name || ''} (${pace}) · жителей ${Math.round(r.pop)} · войско ${Math.floor(r.army)}/${r.armyCap} (сила ${Math.round(R.power(r))})`,
        `${m.dist} блоков на ${m.dir}`,
      ];
      if (r.next) lines.push(r.next.pct === null ? `Развитие: ${r.next.what}` : `Строит: ${r.next.what} — ${r.next.pct}%`);
      if (r.ally != null) lines.push(`🤝 В союзе с «${R.get(r.ally)?.name || '?'}» против вас`);
      if ((r.captainCD || 0) > this.game.time) lines.push(`Воевода пал — новый через ~${Math.ceil(r.captainCD - this.game.time)} с`);
      if (r.commanderName) lines.push(`⚑ Деревней правит игрок ${r.commanderName}`);
      const pals = R.alliesOf(r.i).filter(a => a !== 'P').map(a => R.get(a)?.name).filter(Boolean);
      if (pals.length) lines.push(`🤝 Союзники: ${pals.map(n => '«' + n + '»').join(', ')}`);
      if (m.status === 'subject') lines.push(`Подчиняется «${R.get(r.owner)?.name || '?'}»`);
      if (foes.length) lines.push(`Воюет с: ${foes.map(n => '«' + n + '»').join(', ')}`);
      if (r.raid && !r.raid.arrived) lines.push(`⚔ Отряд из ${r.raid.size} воинов идёт к вам: ~${Math.round(r.raid.eta)} с`);
      if (m.status === 'vassal') lines.push(`Дань каждое утро: дерево и камень +${8 * r.tier}, еда +${6 * r.tier}, золото +${2 * r.tier}${r.tier >= 3 ? `, железо +${3 * r.tier}` : ''}`);
      if (m.status === 'war') lines.push('Чтобы захватить: перебейте защитников и постойте у ратуши 8 секунд.');
      const cs = C?.status(r.i); if (cs) lines.push('🐎 ' + cs);
      const btns = [];
      if (C?.active && m.status !== 'war' && !this.game.net?.isClient) {        // the town's caravans trade with the host's computer
        const why = C.whyNoTrade(r);
        btns.push(h('button.zc-chipbtn.ui-i' + (why ? '.off' : '.sel'), { title: why || 'Купить и продать товары', onclick: () => { if (why) { this.ui.toast(why, 'bad'); return; } this.trade = r.i; this.ui.click(); this.render(); } }, 'Торговать'));
      }
      if (m.status === 'peace') {
        btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('ally', r.i) }, 'Предложить союз'));
        btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('war', r.i) }, 'Объявить войну'));
      }
      if (m.status === 'ally') btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('unally', r.i) }, 'Расторгнуть союз'));
      if (m.status === 'war' && r.owner === null && r.commander != null) btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('peace', r.i) }, 'Предложить мир'));
      else if (m.status === 'war' && r.owner === null) {
        if (r.offer) btns.push(h('button.zc-chipbtn.sel.ui-i', { onclick: () => this._dip('buy', r.i) }, `Принять мир (+${r.offer.gold} золота)`));
        else btns.push(h('button.zc-chipbtn.ui-i', { onclick: () => this._dip('buy', r.i) }, `Купить мир (${R.peacePrice(r)} золота)`));
      }
      this.body.append(h('div.zc-rv-town', { style: `border-left-color:${r.color}` },
        h('div.zc-rv-head', h('b', r.name), h('span.zc-rv-st', { style: `color:${col}` }, st)),
        ...lines.map(t => h('div.zc-rv-line', t)),
        btns.length ? h('div.zc-rv-btns', ...btns) : null));
    }
  }
  /** Trade with town r: lots of goods for gold and back; prices drop for vassals and towns that trust you. */
  renderTrade(r) {
    const C = this.game.caravans, st = this.game.state, why = C.whyNoTrade(r);
    const disc = Math.round((1 - C.priceMul(r)) * 100);
    this.sum.textContent = `Торговля с «${r.name}» · у вас золота: ${Math.floor(st.resources.gold || 0)}${disc ? ` · скидка ${disc}%` : ''}`;
    const back = h('button.zc-chipbtn.ui-i', { onclick: () => { this.trade = null; this.ui.click(); this.render(); } }, '← Все соседи');
    const row = (label, info, btn) => h('div.zc-rv-trade', h('div', h('b', label), h('div.zc-rv-line', info)), btn);
    const sells = [], buys = [];
    for (const [res, n, price, tier] of SELLS) {
      const name = `${RESOURCE_LABELS[res] || res} ×${n}`;
      if (r.tier < tier) { sells.push(row(name, `Появится в эпоху «${AGES[tier - 1]?.name || tier}»`, null)); continue; }
      const left = r.stock?.['s_' + res] || 0, p = C.sellPrice(r, price);
      sells.push(row(name, `${p} золота · в запасе ${left}`, h('button.zc-chipbtn.ui-i' + (left && !why ? '.sel' : '.off'), { onclick: () => { if (why) return this.ui.toast(why, 'bad'); if (C.buy(r, res)) this.render(); } }, 'Купить')));
    }
    for (const [res, n, price, tier] of BUYS) {
      if (r.tier < tier) continue;
      const name = `${RESOURCE_LABELS[res] || res} ×${n}`;
      const left = r.stock?.['b_' + res] || 0, p = C.buyPrice(r, price);
      buys.push(row(name, `за ${p} золота · возьмут ещё ${left} · у вас ${Math.floor(st.resources[res] || 0)}`, h('button.zc-chipbtn.ui-i' + (left && !why ? '.sel' : '.off'), { onclick: () => { if (why) return this.ui.toast(why, 'bad'); if (C.sell(r, res)) this.render(); } }, 'Продать')));
    }
    this.body.append(
      h('div.zc-rv-town', { style: `border-left-color:${r.color}` }, h('div.zc-rv-head', h('b', `«${r.name}» продаёт`), back),
        why ? h('div.zc-rv-line', { style: 'color:#ff9080' }, why) : h('div.zc-rv-line', 'Товар обновляется каждое утро. Проводите их караваны — цены станут ниже.'), ...sells),
      h('div.zc-rv-town', { style: `border-left-color:${r.color}` }, h('div.zc-rv-head', h('b', `«${r.name}» покупает`)), ...buys));
  }
  update() {
    this._t = (this._t || 0) + 1;
    if (this.open && this._t % 60 === 0) this.render();
  }
}
