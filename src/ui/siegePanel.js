// «Командование» (G) for a player who joined a network game on their own side (see src/net/siege.js): the ruler of
// a town builds it up, raises its town hall, researches, leads it into new ages, hires soldiers, makes war, peace
// and alliances; the lord of the dead raises zombies and calls the night. The state comes from the host once a second; the buttons send orders to it.
import { h, img, glyph, glyphImg, clear, dragScroll } from './dom.js';
import { AGES } from '../systems/ages.js';
import { HORDE } from '../net/siege.js';
import { TECHS } from '../systems/research.js';

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
    // always-on strip under the top bar: dark power / the town's treasury and army
    this.bar = h('div.zc-siege-bar.ui-i', { onclick: () => this.toggle() });
    this.game.bus.on('siege:state', (s) => { this._bar(s); if (this.open) this.render(); });
    this.game.bus.on('siege:role', ({ role }) => { if (role !== 'rival' && role !== 'horde') this.bar.classList.remove('on'); });
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
    this.title.textContent = `Ваша деревня: «${t.name}»`;
    this.sum.textContent = `Казна ${t.wealth} (+${t.income}/мин) · войско ${t.army}/${t.cap} · жителей ${t.pop} · ратуша ${t.hall}`;
    if (t.owner !== null && t.owner !== undefined) {
      this.body.append(this._card(t.color, `«${t.name}» захвачена`, [t.owner === 'player' ? 'Ваш город захвачен хозяином.' : 'Ваш город захвачен соседями.', 'Отбейте его или переподключитесь и выберите другую деревню.']));
      return;
    }
    const age = AGES[t.tier - 1]?.name || '';
    // the town: buildings, town hall, the next age
    const growth = [];
    if (t.next) growth.push(this._btn(`Строить: ${t.next.name} (${t.next.cost})`, () => this._cmd('build'), t.wealth >= t.next.cost));
    growth.push(this._btn(t.hall >= t.hallMax ? `Ратуша ${t.hall} — предел эпохи` : `Ратуша → ${t.hall + 1} ур. (${t.hallCost})`, () => this._cmd('hall'), t.hall < t.hallMax && t.wealth >= t.hallCost));
    if (t.age) growth.push(this._btn(`Новая эпоха: ${t.age.name} (${t.age.cost})`, () => this._cmd('age'), !t.age.why));
    this.body.append(this._card(t.color, `«${t.name}» — ${age}`, [
      `Зданий ${t.built} из ${t.plan}${t.next ? '' : ' — все здания этой эпохи построены'}. Ратуша ${t.hall} уровня: больше места для войска и доход казны.`,
      t.age ? `Эпоха «${t.age.name}»: ратуша ${t.age.th} ур., исследования: ${t.age.techs.map(id => (t.techs.includes(id) ? '✓ ' : '') + (this._techName(id))).join(', ')}${t.age.why ? ' — ' + t.age.why : ' — можно!'}` : 'Это последняя эпоха.',
      'Казна пополняется от жителей. Блоки, которые вы ставите сами, тоже оплачивает казна.',
    ], growth));
    // research: the town's own
    const study = t.study.map(([id, name, cost]) => this._btn(`${name} (${cost})`, () => this._cmd('research', { id }), t.wealth >= cost));
    this.body.append(this._card('#60a0e0', 'Исследования деревни', [
      t.techs.length ? 'Изучено: ' + t.techs.map(id => this._techName(id)).join(', ') : 'Пока ничего не изучено.',
      'Исследования открывают вам рецепты оружия в «Крафте» (оплата — из казны) и путь в новые эпохи. Они только ваши: у других деревень свои.',
    ], study.length ? study : null));
    // the army
    const raid = t.raid ? (t.raid.arrived ? `Отряд штурмует деревню хозяина: в строю ${t.raid.left ?? '?'}` : `Отряд из ${t.raid.size} идёт к хозяину: ~${t.raid.eta} с`) : null;
    this.body.append(this._card('#e0a040', 'Войско', [
      `Воинов ${t.army} из ${t.cap}. Найм — ${t.recruit} за воина. Казармы, башни и ратуша дают место для войска.`,
      raid, t.attackCd ? `Войско вернётся из похода через ${t.attackCd} с` : null,
      'Ночью мёртвые идут и на ваш город: держите воинов дома.',
    ], [
      this._btn(`Нанять (${t.recruit})`, () => this._cmd('recruit'), t.wealth >= t.recruit),
      this._btn(`Нанять 5 (${t.recruit * 5})`, () => this._cmd('recruit', { n: 5 }), t.wealth >= t.recruit * 5),
    ]));
    // diplomacy: the host and every town
    if (t.offers?.length) this.body.append(this._card('#9fe3a0', 'Вам предлагают', t.offers.map(o => `${o.from}: ${o.kind === 'ally' ? 'союз' : 'мир'}`),
      t.offers.flatMap(o => [this._btn(`Принять: ${o.kind === 'ally' ? 'союз' : 'мир'} с ${o.from}`, () => this._cmd('answer', { id: o.id, yes: 1 })), this._btn('Отказать', () => this._cmd('answer', { id: o.id, yes: 0 }), false)])));
    const REL = { war: '⚔ война', peace: 'мир', ally: '🤝 союз' };
    const sideCard = (key, name, color, info, rel, extra = []) => {
      const btns = [];
      if (rel === 'war') {
        if (key === 'P') btns.push(this._btn(`Отряд на хозяина (${t.army})`, () => this._cmd('raid', { n: t.army }), !t.raid && t.army >= 1));
        else btns.push(this._btn(`Штурм всем войском (${t.army})`, () => this._cmd('attack', { town: key, n: t.army }), t.army >= 1 && !t.attackCd), this._btn('Штурм: половина', () => this._cmd('attack', { town: key, n: Math.ceil(t.army / 2) }), t.army >= 2 && !t.attackCd));
        btns.push(this._btn('Предложить мир', () => this._cmd('peace', { town: key }), true));
      } else if (rel === 'peace') {
        btns.push(this._btn('Предложить союз', () => this._cmd('ally', { town: key }), true));
        btns.push(this._btn('Объявить войну', () => this.ui.confirm(`Объявить войну: ${name}?`, 'Их союзники тоже вступят в войну против вас.', 'Война', () => this._cmd('war', { town: key })), false));
      } else btns.push(this._btn('Расторгнуть союз', () => this._cmd('unally', { town: key }), false));
      return this._card(color, `${name} — ${REL[rel]}`, [info, ...extra], btns);
    };
    this.body.append(h('div.zc-rv-line', h('b', 'Дипломатия')));
    this.body.append(sideCard('P', 'Деревня хозяина', '#ffd860', `Эпоха: ${t.host.age}. Хозяин — тоже игрок.`, t.host.rel));
    for (const o of t.towns) {
      const info = `${AGES[o.tier - 1]?.name || ''} · войско ${o.army}${o.player ? ` · правит игрок ${o.player}` : ' · правит совет (компьютер)'}${o.subject ? ' · чей-то вассал' : ''}`;
      this.body.append(sideCard(o.i, `«${o.name}»`, o.color, info, o.rel));
    }
  }
  _techName(id) { return TECHS[id]?.name || id; }
  _horde(H) {
    this.title.textContent = 'Повелитель нежити';
    this.sum.textContent = `Тёмная сила ${H.points}/${H.cap} (+${H.regen}/с) · мертвецов ${H.count}/${H.max} · волна ${H.wave}`;
    const btns = [];
    for (const [type, name, , wave] of HORDE) {
      if (H.wave < wave) { btns.push(h('button.zc-chipbtn.off.ui-i', { title: `Пробудится к волне ${wave}` }, `${name} — волна ${wave}`)); continue; }
      const cost = H.costs?.[type] ?? 0, cd = H.cds?.[type] || 0;
      btns.push(this._btn(cd ? `${name} — ${cd} с` : `${name} (${cost})`, () => this._cmd('raise', { type }), !cd && H.points >= cost && H.count < H.max));
      if (cost <= 15) btns.push(this._btn(`${name} ×5`, () => this._cmd('raise', { type, n: 5 }), !cd && H.points >= cost * 5 && H.count + 5 <= H.max));
    }
    this.body.append(
      this._card('#a050e0', 'Поднять мёртвых', [
        'Проще всего — панелью внизу: выберите мертвеца цифрой 1–9 и кликните ЛКМ по земле. Здесь — те же мертвецы и группы по 5.',
        `Предел войска ${H.max} растёт с волнами и эпохой деревни. У сильных мертвецов свой откат.`,
        H.night ? 'Ночь: сила копится втрое быстрее, цена обычная.' : 'День: призыв в полтора раза дороже, а солнце жжёт мертвецов — лучше поднимать в тени и пещерах.',
        'Не ближе ~40 блоков к деревне и 18 — к герою хозяина. За каждого павшего мертвеца хозяин получает золото.',
      ], btns),
      this._card('#e05040', 'Призвать ночь', [
        `Тьма опустится раньше срока, и деревня встретит волну. Стоит ${H.waveCost} силы${H.cd ? `, готово через ${H.cd} с` : ''}${H.day < 2 ? ' · со второго дня' : ''}.`,
        'Стража и башни деревни охотятся на вас; павший повелитель восстаёт рядом с хозяином (днём — в пещере).',
      ], [this._btn('Призвать ночь', () => this._cmd('night'), !H.cd && !H.night && H.day >= 2 && H.points >= H.waveCost)]));
  }
  _bar(s) {
    if (!s || !this.available) { this.bar.classList.remove('on'); return; }
    this.bar.classList.add('on');
    if (s.role === 'horde') {
      const H = s.horde;
      this.bar.textContent = `☠ Тёмная сила ${H.points}/${H.cap} (+${H.regen}/с${H.night ? '' : ', днём призыв дороже'}) · мертвецов ${H.count}/${H.max} — мертвец 1–9, ЛКМ по земле · G`;
    } else {
      const t = s.town;
      const offers = t.offers?.length ? ` · ✉ предложений: ${t.offers.length}` : '';
      this.bar.textContent = `⚑ «${t.name}» · ${AGES[t.tier - 1]?.name || ''} · казна ${t.wealth} · войско ${t.army}/${t.cap}${t.raid ? ' · отряд в походе' : ''}${offers} — G: ваша деревня`;
    }
  }
  update() {}
}
