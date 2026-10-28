// «Командование» (G) for a player who joined a network game against the host (siege mode, see src/net/siege.js):
// the commander of a rival town hires soldiers and sends war parties; the lord of the dead raises zombies and calls
// the night. The state comes from the host once a second; the buttons send orders to it.
import { h, img, glyph, glyphImg, clear, dragScroll } from './dom.js';
import { AGES } from '../systems/ages.js';
import { HORDE } from '../net/siege.js';

export class SiegePanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    this.title = h('span', 'Командование');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('skull')), this.title),
      this.sum = h('div.zc-inv-hint', ''),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    this.game.bus.on('siege:state', () => { if (this.open) this.render(); });
  }
  get role() { return this.game.net?.isClient ? this.game.net.siegeRole : 'hero'; }
  get available() { return this.role === 'rival' || this.role === 'horde'; }
  show() {
    if (!this.available) return;
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
  _cmd(c, extra) { this.game.net?.command(c, extra); this.ui.click(); }

  render() {
    clear(this.body);
    const s = this.game.net?.siegeState;
    if (!s) { this.sum.textContent = ''; this.body.append(h('div.zc-rv-empty', 'Ждём донесений от хозяина мира…')); return; }
    if (s.role === 'rival') this._rival(s.town); else this._horde(s.horde);
  }
  _card(color, title, lines, btns) {
    return h('div.zc-rv-town', { style: `border-left-color:${color}` }, h('div.zc-rv-head', h('b', title)),
      ...lines.filter(Boolean).map(t => h('div.zc-rv-line', t)), btns?.length ? h('div.zc-rv-btns', ...btns) : null);
  }
  _btn(label, on, ok = true) { return h('button.zc-chipbtn.ui-i' + (ok ? '.sel' : '.off'), { onclick: on }, label); }

  _rival(t) {
    this.title.textContent = `Командование: «${t.name}»`;
    this.sum.textContent = `Казна ${t.wealth} · войско ${t.army}/${t.cap} · жителей ${t.pop}`;
    const lost = t.owner === 'player';
    const raid = t.raid ? (t.raid.arrived ? `Отряд штурмует деревню хозяина: в строю ${t.raid.left ?? '?'}` : `Отряд из ${t.raid.size} в пути: ~${t.raid.eta} с`) : 'Отрядов в походе нет';
    this.body.append(
      this._card(t.color, `«${t.name}» — ${AGES[t.tier - 1]?.name || ''}`, [
        lost ? 'Ваш город захвачен хозяином!' : t.war ? 'В войне с деревней хозяина' : 'В мире с деревней хозяина',
        raid,
        'Ночью мёртвые идут и на ваш город: держите воинов дома и стройте стены (блоки оплачивает казна).',
      ], lost ? [] : [
        this._btn(`Нанять воина (${t.recruit})`, () => this._cmd('recruit'), t.wealth >= t.recruit),
        this._btn('Отряд из 3', () => this._cmd('raid', { n: 3 }), !t.raid && t.army >= 3),
        this._btn(`Все в поход (${t.army})`, () => this._cmd('raid', { n: t.army }), !t.raid && t.army >= 1),
        t.war ? this._btn('Предложить мир хозяину', () => this._cmd('peace')) : null,
      ].filter(Boolean)),
      this._card('#888', 'Другие деревни', t.towns.map(([, name, war, tier, army]) => `«${name}» — ${AGES[tier - 1]?.name || ''}, войско ${army}${war ? ' · воюете' : ''}`),
        lost ? [] : t.towns.filter(o => !o[2]).map(([i, name]) => this._btn(`Напасть на «${name}»`, () => this._cmd('war', { town: i })))));
  }
  _horde(H) {
    this.title.textContent = 'Повелитель нежити';
    this.sum.textContent = `Тёмная сила ${H.points}/${H.cap} · мертвецов ${H.count}/${H.max} · волна ${H.wave}`;
    const btns = [];
    for (const [type, name, cost, wave] of HORDE) {
      if (H.wave < wave) { btns.push(h('button.zc-chipbtn.off.ui-i', { title: `Пробудится к волне ${wave}` }, `${name} — волна ${wave}`)); continue; }
      btns.push(this._btn(`${name} (${cost})`, () => this._cmd('raise', { type }), H.points >= cost));
      if (cost <= 10) btns.push(this._btn(`${name} ×5`, () => this._cmd('raise', { type, n: 5 }), H.points >= cost * 5));
    }
    this.body.append(
      this._card('#a050e0', 'Поднять мёртвых', [
        'Мертвецы встают вокруг вас и идут на деревню хозяина. Не ближе ~35 блоков к ней — живые мешают.',
        H.night ? 'Ночь: тёмная сила копится втрое быстрее.' : 'День: сила копится медленно, а солнце жжёт мертвецов.',
      ], btns),
      this._card('#e05040', 'Призвать ночь', [
        `Тьма опустится раньше срока, и деревня встретит волну. Стоит ${H.waveCost} силы${H.cd ? `, готово через ${H.cd} с` : ''}.`,
        'Стража и башни деревни охотятся на вас; павший повелитель восстаёт в глуши.',
      ], [this._btn('Призвать ночь', () => this._cmd('night'), !H.cd && !H.night && H.points >= H.waveCost)]));
  }
  update() {}
}
