// Full-screen menus: main menu, new game, settings, how-to-play, pause, death, game over, confirm, loading.
import { h, img, glyph, glyphImg, resourceIcon, itemIcon, clear } from './dom.js';

const DIFFS = [
  { id: 'easy', name: 'Лёгкая', desc: 'Меньше зомби, больше времени на стройку.', icon: 'shield' },
  { id: 'normal', name: 'Нормальная', desc: 'Задуманный баланс выживания.', icon: 'sword' },
  { id: 'hard', name: 'Сложная', desc: 'Орды сильнее, ошибки дорого стоят.', icon: 'skull' },
];
export const DIFF_NAMES = { easy: 'Лёгкая', normal: 'Нормальная', hard: 'Сложная' };

function seedFrom(str) {
  str = (str || '').trim();
  if (!str) return null;
  if (/^-?\d+$/.test(str)) return Math.abs(parseInt(str, 10)) % 2147483647;
  let hsh = 2166136261;
  for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
  return (hsh >>> 0) % 2147483647;
}

export class Menus {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.root = h('div.zc-menus');
    this.difficulty = 'normal';
    this.seedText = '';
    this.current = null;     // 'main' | 'pause' | 'death' | 'over' | null
    this._deathT = 0;
  }
  click() { this.game.audio?.play?.('ui_click'); }

  btn(label, onClick, cls = '', icon = null, sub = null) {
    return h('button.zc-btn.ui-i' + (cls ? '.' + cls.split(' ').join('.') : ''), {
      onclick: (e) => { e.stopPropagation(); this.click(); onClick(e); },
    }, icon ? img(icon, 'zc-ico zc-btn-ico') : null, h('span.zc-btn-lbl', label, sub ? h('small', sub) : null));
  }

  _screen(cls) {
    clear(this.root);
    const s = h('div.zc-screen.' + cls);
    this.root.appendChild(s);
    requestAnimationFrame(() => s.classList.add('in'));
    return s;
  }
  hide() {
    const s = this.root.firstChild;
    this.current = null;
    if (!s) return;
    s.classList.remove('in'); s.classList.add('out');
    setTimeout(() => { if (s.parentNode === this.root) s.remove(); }, 350);
  }

  // =============================================================== main menu
  showMain(page = 'home') {
    this.current = 'main';
    const s = this._screen('zc-mainmenu');
    const logo = h('div.zc-logo',
      h('div.zc-logo-title', h('span.l1', 'ZOMBI'), h('span.l2', 'CRAFT')),
      h('div.zc-logo-sub', h('i'), 'Осада нежити', h('i')));
    this.card = h('div.zc-mm-card.zc-panel.ornate');
    s.append(h('div.zc-mm-vignette'), h('div.zc-mm-inner', logo, this.card),
      h('div.zc-mm-footer', 'Строй • Исследуй • Выживай', h('span', ' · v0.1')));
    this.page(page);
  }
  page(p) {
    const c = this.card; if (!c) return;
    clear(c);
    c.dataset.page = p;
    this.root.firstChild?.classList.toggle('subpage', p !== 'home');
    c.classList.remove('page-in'); void c.offsetWidth; c.classList.add('page-in');
    if (p === 'home') this._home(c);
    else if (p === 'new') this._newGame(c);
    else if (p === 'settings') this._settings(c, () => this.page('home'));
    else if (p === 'help') this._help(c, () => this.page('home'));
  }
  _home(c) {
    const save = this.game.save;
    const info = save?.hasSave?.() ? save.info?.() : null;
    const list = h('div.zc-mm-buttons');
    if (info) list.append(this.btn('Продолжить', () => this.ui.continueGame(), 'primary big', glyph('play'), `День ${info.day} · ${DIFF_NAMES[info.difficulty] || ''}`));
    list.append(
      this.btn('Новая игра', () => this.page('new'), info ? 'big' : 'primary big', glyph('sword')),
      this.btn('Настройки', () => this.page('settings'), '', glyph('gear')),
      this.btn('Как играть', () => this.page('help'), '', glyph('book')),
    );
    c.append(list);
  }
  _newGame(c) {
    c.append(h('h2.zc-h', 'Новая игра'));
    const cards = h('div.zc-diffs');
    const render = () => { for (const el of cards.children) el.classList.toggle('sel', el.dataset.id === this.difficulty); };
    for (const d of DIFFS) {
      cards.append(h('button.zc-diff.ui-i', { 'data-id': d.id, onclick: () => { this.click(); this.difficulty = d.id; render(); } },
        img(glyph(d.icon), 'zc-ico zc-diff-ico'), h('b', d.name), h('span', d.desc)));
    }
    render();
    const seed = h('input.zc-input', { type: 'text', placeholder: 'Случайный', maxlength: 24, value: this.seedText, oninput: (e) => { this.seedText = e.target.value; } });
    seed.addEventListener('keydown', (e) => e.stopPropagation());
    c.append(h('div.zc-field-lbl', 'Сложность'), cards,
      h('label.zc-field', h('span.zc-field-lbl', 'Зерно мира (необязательно)'), seed));
    if (this.game.save?.hasSave?.()) c.append(h('div.zc-note.warn', 'Текущее сохранение будет перезаписано.'));
    c.append(h('div.zc-row.end',
      this.btn('Назад', () => this.page('home'), 'ghost'),
      this.btn('В бой!', () => this.ui.startNewGame({ difficulty: this.difficulty, seed: seedFrom(this.seedText) }), 'primary', glyph('play'))));
  }

  _settings(c, back) {
    const g = this.game, ui = this.ui;
    c.append(h('h2.zc-h', 'Настройки'));
    // quality
    const q = h('div.zc-seg');
    const qs = [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']];
    const renderQ = () => { for (const b of q.children) b.classList.toggle('sel', b.dataset.q === g.quality); };
    for (const [id, name] of qs) q.append(h('button.ui-i', { 'data-q': id, onclick: () => { this.click(); ui.setQuality(id); renderQ(); } }, name));
    renderQ();
    const slider = (label, value, min, max, step, onInput, fmt = (v) => Math.round(v * 100) + '%') => {
      const out = h('span.zc-slider-val', fmt(value));
      const inp = h('input.zc-range', { type: 'range', min, max, step, value, oninput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt(v); onInput(v); } });
      const fillUpd = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%');
      inp.addEventListener('input', fillUpd); fillUpd();
      return h('label.zc-slider', h('span.zc-slider-lbl', label), inp, out);
    };
    const vol = g.audio?.volumes || { master: 1, music: 0.6, sfx: 1 };
    const fpsT = h('button.zc-toggle.ui-i' + (ui.settings.showFps ? '.on' : ''), { onclick: (e) => { this.click(); ui.settings.showFps = !ui.settings.showFps; e.currentTarget.classList.toggle('on', ui.settings.showFps); ui.saveSettings(); } }, h('i'));
    c.append(
      h('div.zc-field-lbl', 'Качество графики'), q,
      h('div.zc-note', 'Низкое — для слабых телефонов. Высокое — тени и свечение.'),
      slider('Чувствительность', ui.settings.sensitivity, 0.2, 3, 0.05, (v) => { ui.settings.sensitivity = v; ui.saveSettings(); }, (v) => v.toFixed(2) + '×'),
      slider('Общая громкость', vol.master, 0, 1, 0.01, (v) => g.audio?.setMasterVolume?.(v)),
      slider('Музыка', vol.music, 0, 1, 0.01, (v) => g.audio?.setMusicVolume?.(v)),
      slider('Эффекты', vol.sfx, 0, 1, 0.01, (v) => { g.audio?.setSfxVolume?.(v); }),
      h('div.zc-slider', h('span.zc-slider-lbl', 'Показывать FPS'), fpsT),
      h('div.zc-row.end', this.btn('Назад', back, 'ghost')),
    );
  }

  _help(c, back) {
    c.append(h('h2.zc-h', 'Как играть'));
    const tabs = h('div.zc-seg.tabs');
    const body = h('div.zc-help-body');
    const pages = {
      goal: () => [
        h('p', 'Днём добывайте ресурсы, стройте деревню и распределяйте жителей по работам. С наступлением ночи с краёв карты приходят волны зомби — каждая следующая сильнее.'),
        h('p', 'Защищайте ', h('b', 'ратушу'), ' и жителей. Если ратуша падёт — игра окончена.'),
        h('p', 'Постройте ', h('b', 'лабораторию'), ' и назначьте учёных: исследования открывают рецепты оружия, огнестрела, магии и укрепления. Сами предметы создаются в меню ', h('b', '«Крафт»'), '.'),
        h('p', h('b', 'Железо и уголь: '), 'добывайте руду киркой (рудные валуны лежат вокруг деревни, много руды в горах и пещерах) или постройте ', h('b', 'шахту'), '. Руду переплавляйте в печи: «Крафт» → «Переплавка». Нет угля — пережгите дерево в древесный уголь.'),
        h('p', h('b', 'Строители: '), 'первые двое бесплатные, каждый следующий нанимается всё дороже. ', h('b', 'Дом строителя'), ' даёт +2 места и ускоряет стройку.'),
        h('ul.zc-tips',
          h('li', img(resourceIcon('wood')), 'Лесорубы, фермеры и шахтёры приносят ресурсы в общий склад.'),
          h('li', img(resourceIcon('population')), 'Дома увеличивают лимит населения — приходят новые жители.'),
          h('li', img(glyph('shield')), 'Стены, вышки и стражники сдерживают орду.'),
          h('li', img(glyph('moon')), 'Ночью жители прячутся. Будьте рядом с деревней к закату!')),
      ],
      pc: () => [keys([
        ['W A S D', 'Движение'], ['Пробел', 'Прыжок'], ['Shift', 'Бег'], ['Мышь', 'Обзор'],
        ['ЛКМ', 'Атака / добыча блока'], ['ПКМ', 'Поставить блок / особое действие'], ['1–9, колесо', 'Выбор предмета'],
        ['V', 'Вид от 1-го / 3-го лица'], ['Tab', 'Режим командования'], ['I', 'Крафт и переплавка'], ['ПКМ по верстаку / печи', 'Открыть крафт'], ['Esc / P', 'Пауза'],
      ])],
      touch: () => [keys([
        ['Джойстик слева', 'Движение'], ['Свайп справа', 'Обзор'], ['Кнопки справа', 'Атака, прыжок, действие'],
        ['Касание слота', 'Выбор предмета'], ['Кнопка «Командовать»', 'Вид сверху на деревню'], ['Кнопка «Крафт»', 'Создание предметов и переплавка'], ['Кнопка «действие» на верстаке / печи', 'Открыть крафт'], ['❚❚ вверху', 'Пауза'],
      ])],
      command: () => [
        h('p', 'В режиме командования камера смотрит на деревню сверху, как в стратегии.'),
        keys([
          ['Перетаскивание', 'Сдвиг камеры'], ['Щипок / колесо', 'Масштаб'], ['Два пальца / Q E', 'Поворот'],
          ['Строить', 'Выберите здание и коснитесь земли'], ['Жители', 'Назначение на работы'], ['Касание здания', 'Информация и рабочие места'],
        ]),
      ],
    };
    const names = [['goal', 'Цель'], ['pc', 'ПК'], ['touch', 'Телефон'], ['command', 'Деревня']];
    const show = (id) => { clear(body).append(...pages[id]()); for (const b of tabs.children) b.classList.toggle('sel', b.dataset.id === id); };
    for (const [id, n] of names) tabs.append(h('button.ui-i', { 'data-id': id, onclick: () => { this.click(); show(id); } }, n));
    c.append(tabs, body, h('div.zc-row.end', this.btn('Назад', back, 'ghost')));
    show('goal');
    function keys(rows) { return h('div.zc-keys', rows.map(([k, v]) => h('div.zc-keyrow', h('kbd', k), h('span', v)))); }
  }

  // =============================================================== pause
  showPause() {
    this.current = 'pause';
    const s = this._screen('zc-pause');
    this.card = h('div.zc-mm-card.zc-panel.ornate.pause-card');
    s.append(this.card);
    this._pausePage('home');
  }
  _pausePage(p) {
    const c = this.card; clear(c);
    c.classList.remove('page-in'); void c.offsetWidth; c.classList.add('page-in');
    if (p === 'settings') return this._settings(c, () => this._pausePage('home'));
    if (p === 'help') return this._help(c, () => this._pausePage('home'));
    const st = this.game.state;
    c.append(h('h2.zc-h', 'Пауза'),
      h('div.zc-pause-stats', h('span', img(glyph('sun')), 'День ', h('b', st.day)), h('span', img(glyph('skull')), 'Убито ', h('b', st.stats.kills || 0)),
        h('span', img(glyph('flag')), 'Волн ', h('b', st.stats.wavesSurvived || 0))),
      h('div.zc-mm-buttons',
        this.btn('Продолжить', () => this.ui.resume(), 'primary big', glyph('play')),
        this.btn('Сохранить игру', () => { if (this.game.save?.save?.({ toast: true })) this._pausePage('home'); }, '', glyph('book')),
        this.btn('Настройки', () => this._pausePage('settings'), '', glyph('gear')),
        this.btn('Как играть', () => this._pausePage('help'), '', glyph('flag')),
        this.btn('Главное меню', () => this.ui.confirm('Выйти в меню?', 'Прогресс будет сохранён.', 'Выйти', () => this.ui.quitToMenu()), 'ghost', glyph('home')),
      ));
  }

  // =============================================================== death
  showDeath(src) {
    this.current = 'death';
    const s = this._screen('zc-death');
    this._deathT = this.game.player?.respawnTimer ?? this.game.player?.respawnIn ?? 5;
    this.deathCount = h('b', Math.ceil(this._deathT));
    s.append(h('div.zc-death-inner',
      h('div.zc-death-title', 'ВЫ ПОГИБЛИ'),
      h('div.zc-death-sub', src ? 'Вас одолела нежить' : 'Деревня ждёт своего героя'),
      h('div.zc-death-timer', 'Возрождение в ратуше через ', this.deathCount)));
  }
  updateDeath(dt) {
    if (this.current !== 'death') return;
    const p = this.game.player;
    const t = p?.respawnTimer ?? p?.respawnIn;
    this._deathT = typeof t === 'number' ? t : Math.max(0, this._deathT - dt);
    const n = String(Math.max(0, Math.ceil(this._deathT)));
    if (this.deathCount.textContent !== n) this.deathCount.textContent = n;
  }

  // =============================================================== game over
  showGameOver(reason) {
    this.current = 'over';
    const st = this.game.state, s = this._screen('zc-gameover');
    const stat = (icon, label, v) => h('div.zc-stat', img(icon), h('span', label), h('b', String(v ?? 0)));
    const card = h('div.zc-mm-card.zc-panel.ornate.over-card',
      h('div.zc-over-title', 'ДЕРЕВНЯ ПАЛА'),
      h('div.zc-over-reason', reason || 'Ратуша разрушена ордами нежити.'),
      h('div.zc-stats',
        stat(glyph('sun'), 'Дней прожито', st.day),
        stat(glyph('flag'), 'Волн отбито', st.stats.wavesSurvived),
        stat(glyph('skull'), 'Убито зомби', st.stats.kills),
        stat(itemIcon('pickaxe_stone'), 'Добыто блоков', st.stats.blocksMined),
        stat(glyph('hammer'), 'Поставлено блоков', st.stats.blocksPlaced),
        stat(resourceIcon('population'), 'Погибло жителей', st.stats.villagersLost)),
      h('div.zc-row.center',
        this.btn('Новая игра', () => { this.showMain('new'); }, 'primary big', glyph('sword')),
        this.btn('Главное меню', () => this.ui.quitToMenu(true), 'ghost', glyph('home'))));
    s.append(card);
  }

  // =============================================================== loading
  showLoading(text = 'Загрузка…') {
    this.current = 'loading';
    const s = this._screen('zc-loading');
    this.loadBar = h('div.zc-load-fill');
    this.loadLbl = h('div.zc-load-lbl', text);
    s.append(h('div.zc-load-inner', h('div.zc-logo.small', h('div.zc-logo-title', h('span.l1', 'ZOMBI'), h('span.l2', 'CRAFT'))),
      h('div.zc-load-track', this.loadBar), this.loadLbl));
    return (p, t) => { this.loadBar.style.width = Math.round(p * 100) + '%'; if (t) this.loadLbl.textContent = t; };
  }
}

/** Modal confirm dialog (separate layer so it can stack over menus/panels). */
export function confirmDialog(ui, title, text, okLabel, onOk, cancelLabel = 'Отмена') {
  const layer = ui.dialogLayer;
  const close = () => { d.classList.remove('in'); setTimeout(() => d.remove(), 220); ui.game.audio?.play?.('ui_close'); };
  const d = h('div.zc-dialog-back.ui-i', { onclick: (e) => { if (e.target === d) close(); } },
    h('div.zc-dialog.zc-panel.ornate',
      h('h3.zc-h', title), text ? h('p', text) : null,
      h('div.zc-row.end',
        h('button.zc-btn.ghost.ui-i', { onclick: () => { ui.game.audio?.play?.('ui_click'); close(); } }, h('span.zc-btn-lbl', cancelLabel)),
        h('button.zc-btn.primary.ui-i', { onclick: () => { ui.game.audio?.play?.('ui_click'); close(); onOk(); } }, h('span.zc-btn-lbl', okLabel)))));
  layer.appendChild(d);
  requestAnimationFrame(() => d.classList.add('in'));
  ui.game.audio?.play?.('ui_open');
  return close;
}
export { glyphImg };
