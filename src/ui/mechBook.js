// «Книга механизмов» (H): how to lay out the mechanisms (systems/kinetics.js) and the electric circuits
// (systems/electric.js) so they work — a picture of each layout drawn from block icons (side or top view), the parts
// it needs and what to mind. It opens from the iron age, when the first mechanisms can be built.
import { h, img, glyph, glyphImg, clear, dragScroll, blockIcon } from './dom.js';
import { B } from '../core/blocks.js';
import { MECH_HELP } from '../systems/kinetics.js';
import { ELEC_HELP } from '../systems/electric.js';
import { AGES } from '../systems/ages.js';

const FROM_AGE = 2;          // the iron age: shafts, wheels and the first machines
// letters of the pictures
const KEY = {
  W: B.WATER, w: B.WATER_WHEEL, m: B.WINDMILL, e: B.STEAM_ENGINE, s: B.SHAFT, c: B.COGWHEEL, b: B.BELT,
  d: B.MECH_DRILL, a: B.MECH_SAW, r: B.CRUSHER, f: B.MECH_FAN, p: B.MECH_PISTON, t: B.TUNNEL_DRILL, k: B.CASING,
  y: B.DYNAMO, l: B.CABLE, o: B.BATTERY, x: B.SWITCH_OFF, T: B.E_TURRET, F: B.FLOODLIGHT, G: B.GATE_CLOSED, E: B.ELECTRIC_FENCE, S: B.SOLAR_PANEL,
  L: B.LOG, P: B.PLANKS, '#': B.STONE, g: B.GRASS, i: B.IRON_ORE, q: B.STONE_BRICKS,
};
// [title, view, picture rows (top row first), notes]
const PAGES = [
  ['Как устроена сеть', 'сбоку', ['.Wws.ssa.L', 'gggggggg.L'],
    ['Механизмы, которые касаются друг друга, образуют одну сеть: источник (колесо, ветряк, двигатель) → валы и шестерни → машины.',
      'У каждого источника есть сила, у каждой машины — нагрузка. Если нагрузка больше силы, вся сеть встаёт: добавьте источник или разделите сеть.',
      'Машина берёт вращение с одной стороны и работает противоположной: вал подводите сзади, работа — спереди.']],
  ['Водяное колесо', 'сверху', ['WWW', 'Wws', '..s', '..r'],
    ['Колесо должно касаться воды. В текущей воде (река, водопад) оно вдвое сильнее: сила 4–8, 16–32 об/мин.',
      'Самое простое начало: колесо у ручья, вал к дробилке — она сама перемалывает руду со склада в металл.']],
  ['Ветряк на мачте', 'сбоку', ['.m.', '.s.', '.s.', '.s.', 'ssa', 'q.L'],
    ['Ветряку нужно открытое небо: чем выше, тем сильнее (сила 2–8). Ставьте его на мачту из валов.',
      'Внизу вал уходит вбок к машинам — пила рубит дерево перед собой.']],
  ['Паровой двигатель', 'сверху', ['essss', '.c..d', '.s...', '.r...'],
    ['Самый сильный источник: сила 16 и 64 об/мин. Жжёт уголь со склада (1 за 20 секунд) — держите запас угля.',
      'Одного двигателя хватает на бур, дробилку и пилу сразу. Шестерня делит вал на ветки.']],
  ['Шахта: бур вниз', 'сбоку', ['wss', 'W.s', '..d', '###', '#i#', '###'],
    ['Вал, подведённый к буру сверху, заставляет его рыть шахту прямо вниз (до 64 блоков). Сбоку — бурит вбок до 24 блоков.',
      'Всё, что бур выкопал, уходит на склад деревни. Бур нагрузка 4.']],
  ['Бур-проходчик', 'сверху', ['ws....', 'Wst...', '...##i', '....#i'],
    ['Сам прокладывает туннель к ближайшей руде (до 20 блоков), выбирает жилу и ищет следующую. За собой оставляет вал, поэтому не теряет вращение.',
      'Нагрузка 6: питайте его от двигателя или двух колёс.']],
  ['Ловушка: конвейер и пила', 'сверху', ['bbbba', '....s', '....s', 'ess.s'],
    ['Конвейер везёт всё, что на нём стоит, туда, куда вы смотрели, когда ставили его. Мертвецы, попавшие на ленту, едут прямо в пилу.',
      'Вентилятор рядом отбрасывает зомби на 8 блоков: им можно загонять их на ленту.']],
  ['Лифт на поршне', 'сбоку', ['.PPP.', '..p..', '..s..', 'ess..'],
    ['Поршень смотрит туда, куда смотрели вы, ставя его. ПКМ по поршню — выдвинуть или втянуть (нужно вращение).',
      'Он двигает склеенную постройку перед собой (до 128 блоков) и всех, кто на ней стоит: лифт в шахту, выдвижной мост, ворота.']],
  ['Электричество: динамо и турели', 'сверху', ['essy..', '...l..', '...lT.', '...lo.', '...lF.'],
    ['Динамо-машина ставится рядом с валом и превращает вращение в ток (до 8 ед/с при 64 об/мин). Нагрузка на сеть механизмов 4.',
      'Кабель соединяет динамо, аккумуляторы и потребителей. Аккумулятор копит излишек и отдаёт его ночью.',
      'Если ток покрывает меньше половины спроса цепи, защита отключается.']],
  ['Солнечная станция', 'сверху', ['SSS..', 'lll.T', '..lll', '..o.F'],
    ['Солнечные панели дают по 2,5 ед/с днём под открытым небом. Ночью цепь живёт за счёт аккумуляторов — ставьте их не меньше двух.']],
  ['Ворота и забор под током', 'сверху', ['EEGGEE', 'l....l', 'lllxll', '..o...', '..y...'],
    ['Автоворота: смежные блоки ворот закрываются сами, когда рядом нежить, и открываются для жителей и вас.',
      'Электрозабор бьёт током и отбрасывает зомби. Рубильник (ПКМ) размыкает цепь — например, чтобы забор не тратил ток днём.']],
];

export class MechBook {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('book')), h('span', 'Книга механизмов')),
      h('div.zc-inv-hint', 'Схемы расстановки механизмов и цепей'),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    this.game.bus.on('age:changed', ({ age } = {}) => { if ((age | 0) === FROM_AGE) this.ui.toast('Открыта «Книга механизмов» (H): как собирать механизмы и цепи', 'info'); });
  }
  get available() { return (this.game.state.age | 0) >= FROM_AGE; }
  show() {
    if (!this.available) { this.ui.toast(`Книга механизмов откроется в эпоху «${AGES[FROM_AGE].name}»`, 'info'); return; }
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

  _picture(rows) {
    const W = Math.max(...rows.map(r => r.length));
    const grid = h('div', { style: `display:grid;grid-template-columns:repeat(${W},26px);gap:1px;margin:6px 0;` });
    for (const row of rows) for (let x = 0; x < W; x++) {
      const id = KEY[row[x]];
      grid.append(id != null ? img(blockIcon(id), 'zc-ico') : h('span', { style: 'width:26px;height:26px;display:inline-block;background:rgba(255,255,255,0.04);' }));
    }
    for (const el of grid.querySelectorAll('img')) { el.style.width = '26px'; el.style.height = '26px'; el.style.imageRendering = 'pixelated'; }
    return grid;
  }
  _legend(rows) {
    const used = [...new Set(rows.join('').split('').filter(c => KEY[c] != null))];
    return h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:#d8cba8;' },
      ...used.map(c => h('span', { style: 'display:inline-flex;align-items:center;gap:4px;' }, (() => { const i = img(blockIcon(KEY[c]), 'zc-ico'); i.style.width = i.style.height = '18px'; return i; })(), this._name(KEY[c]))));
  }
  _name(id) {
    const t = MECH_HELP[id] || ELEC_HELP[id];
    if (t) return t.split(':')[0];
    return { [B.WATER]: 'Вода', [B.LOG]: 'Дерево', [B.PLANKS]: 'Доски (платформа)', [B.STONE]: 'Камень', [B.GRASS]: 'Земля', [B.IRON_ORE]: 'Руда', [B.STONE_BRICKS]: 'Опора' }[id] || '';
  }
  render() {
    clear(this.body);
    for (const [title, view, rows, notes] of PAGES) {
      this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#c0a060' },
        h('div.zc-rv-head', h('b', title), h('span.zc-rv-st', `вид ${view}`)),
        this._picture(rows), this._legend(rows),
        ...notes.map(t => h('div.zc-rv-line', t))));
    }
    // every part: what it gives or takes
    const parts = [...Object.entries(MECH_HELP), ...Object.entries(ELEC_HELP)].filter(([id], k, a) => a.findIndex(q => q[0] === id) === k);
    this.body.append(h('div.zc-rv-town', { style: 'border-left-color:#80a0c0' }, h('div.zc-rv-head', h('b', 'Все детали')),
      ...parts.map(([id, text]) => h('div.zc-rv-line', { style: 'display:flex;gap:6px;align-items:flex-start;' }, (() => { const i = img(blockIcon(+id), 'zc-ico'); i.style.width = i.style.height = '20px'; return i; })(), h('span', text)))));
  }
  update() {}
}
