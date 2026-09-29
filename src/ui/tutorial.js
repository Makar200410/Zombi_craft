// First-game tutorial: a big card at the top of the screen that teaches the controls and the basics step by step.
// Each step advances by itself when the player does the thing; the button it talks about glows. Skippable,
// remembered in localStorage (runs once per device) and can be replayed from the pause menu.
import { h, img, glyph, toggle } from './dom.js';

const KEY = 'zc_tutorial_done';

export class Tutorial {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.step = -1;
    this.title = h('div.zc-tut-title');
    this.text = h('div.zc-tut-text');
    this.keysEl = h('div.zc-tut-keys');
    this.count = h('span.zc-tut-count');
    this.bar = h('div.zc-tut-bar', this.fill = h('i'));
    this.nextBtn = h('button.zc-btn.small.primary.ui-i', { onclick: () => { ui.click(); this.advance(); } }, h('span.zc-btn-lbl', 'Дальше'));
    this.root = h('div.zc-tut.zc-panel.ornate.ui-i',
      h('div.zc-tut-head', img(glyph('book')), h('b', 'Обучение'), this.count,
        h('button.zc-tut-skip.ui-i', { onclick: () => { ui.click(); this.finish(true); } }, 'Пропустить обучение')),
      this.bar, this.title, this.text, this.keysEl, h('div.zc-row.end', this.nextBtn));
    const bus = this.game.bus;
    bus.on('game:begin', ({ loaded } = {}) => { if (!loaded && !this.done) this.start(); else this.hide(); });
    bus.on('villager:job', () => { if (this.cur?.id === 'job') this.advance(); });
    bus.on('building:placed', () => this._placed = true);
  }
  get done() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

  get steps() {
    const t = this.game.isTouch, ui = this.ui, g = this.game;
    const P = () => g.player;
    return [
      { id: 'look', title: 'Осмотритесь', text: t ? 'Проведите пальцем по правой половине экрана, чтобы повернуть камеру.' : 'Щёлкните по игре, чтобы захватить мышь, и подвигайте ею — камера поворачивается за мышью.',
        keys: t ? [['Свайп справа', 'обзор']] : [['Мышь', 'обзор'], ['Esc', 'отпустить мышь / пауза']],
        check: () => this._turned() > 2.2 },
      { id: 'move', title: 'Походите', text: t ? 'Двигайтесь джойстиком в левой части экрана.' : 'Пройдитесь по деревне.',
        keys: t ? [['Джойстик слева', 'движение']] : [['W A S D', 'движение']],
        check: () => this._moved() > 8 },
      { id: 'jump', title: 'Прыжок и бег', text: 'Запрыгните на что-нибудь и пробегитесь. Бег тратит выносливость (жёлтая полоса слева вверху).',
        keys: t ? [['Кнопка прыжка', 'прыжок'], ['Кнопка бега', 'бег']] : [['Пробел', 'прыжок'], ['Shift', 'бег'], ['Ctrl / C', 'присесть']],
        check: () => { const p = P(); if (p && !p.onGround && !p.inWater) this._jumped = true; if (p?.sprinting) this._ran = true; return this._jumped && this._ran; } },
      { id: 'axe', title: 'Возьмите топор', text: t ? 'Коснитесь ячейки с топором в панели внизу.' : 'Предметы переключаются цифрами или колесом мыши. Топор — в 3-й ячейке.',
        keys: t ? [['Касание ячейки', 'выбор предмета']] : [['1–9', 'ячейка'], ['Колесо', 'следующий предмет']], glow: () => ui.hud?.bottom,
        check: () => P()?.item?.toolType === 'axe' },
      { id: 'tree', title: 'Срубите дерево', text: 'Подойдите к дереву и бейте по стволу — оно упадёт целиком, брёвна уйдут в запас деревни. Так же киркой добывается камень и руда.',
        keys: t ? [['Кнопка удара', 'рубить / бить']] : [['ЛКМ (держать)', 'рубить / добывать / бить'], ['ПКМ', 'поставить блок']],
        check: () => (g.state.stats.treesFelled || 0) > this._trees0 },
      { id: 'inv', title: 'Инвентарь и крафт', text: 'В инвентаре раскладывают оружие по ячейкам, в крафте создают новое оружие, инструменты и переплавляют руду. Откройте любое из них.',
        keys: t ? [['Кнопки «Крафт» / «Инвентарь»', 'слева вверху']] : [['E', 'инвентарь'], ['I', 'крафт'], ['J', 'журнал заданий']], glow: () => ui.hud?.craftBtn,
        check: () => ui.inventory?.open || ui.craft?.open },
      { id: 'command', title: 'Режим командования', text: (t ? 'Закройте окно и нажмите «Командовать»' : 'Закройте окно (Esc) и нажмите Tab') + ' — камера поднимется над деревней, как в стратегии. Там строят и назначают жителей.',
        keys: t ? [['Кнопка «Командовать»', 'вид сверху'], ['Щипок', 'масштаб']] : [['Tab', 'командовать / вернуться'], ['Перетаскивание, колесо', 'камера'], ['Q E', 'поворот']], glow: () => ui.hud?.modeBtn,
        check: () => g.mode === 'command' },
      { id: 'build', title: 'Постройте дом', text: 'Откройте «Строить», выберите «Дом» и укажите место. Строители сами возведут его по блокам. Дома дают новых жителей.',
        keys: [['«Строить» → «Дом»', 'выбор'], [t ? 'Касание' : 'ЛКМ', 'поставить'], [t ? 'Кнопка поворота' : 'R', 'повернуть']], glow: () => document.querySelector('.zc-tab[data-tab="build"]'),
        check: () => this._placed },
      { id: 'job', title: 'Дайте жителям работу', text: 'Во вкладке «Жители» нажмите «+» у нужной работы — свободный житель станет фермером, лесорубом или шахтёром.',
        keys: [['«Жители» → «+»', 'назначить']], glow: () => document.querySelector('.zc-tab[data-tab="people"]'),
        check: () => false },
      { id: 'quests', title: 'Следуйте заданиям', text: 'Справа — задания: что строить, сколько и кого назначить. Под каждым есть подсказка 💡, как его выполнить. Все задания — в журнале.',
        keys: [[t ? 'Кнопка «Журнал»' : 'J', 'журнал заданий']], glow: () => ui.questTracker?.root,
        check: () => false, manual: true },
      { id: 'night', title: 'Ночью приходят зомби', text: 'К закату будьте у деревни: стража защищает ратушу, но зомби много — помогайте ей. Если ратуша падёт, игра окончена. Удачи, правитель!',
        keys: t ? [['❚❚ вверху', 'пауза']] : [['ЛКМ', 'удар'], ['Esc / P', 'пауза'], ['V', 'вид от 3-го лица']],
        check: () => false, manual: true, last: true },
    ];
  }
  get cur() { return this.step >= 0 ? this.steps[this.step] : null; }

  start() {
    this.step = 0;
    const p = this.game.player?.position;
    this._start = p ? { x: p.x, z: p.z } : null;
    this._yaw0 = this.game.cameraRig?.yaw || 0; this._turn = 0;
    this._trees0 = this.game.state.stats.treesFelled || 0;
    this._placed = false; this._jumped = false; this._ran = false;
    this.render();
  }
  /** Replay from the pause menu. */
  restart() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    if (this.game.mode !== 'explore') this.game.setMode('explore');
    this.start();
  }
  _moved() { const p = this.game.player?.position; return p && this._start ? Math.hypot(p.x - this._start.x, p.z - this._start.z) : 0; }
  _turned() {
    const y = this.game.cameraRig?.yaw || 0;
    this._turn += Math.abs(y - this._yaw0); this._yaw0 = y;
    return this._turn;
  }
  advance() {
    if (this.step < 0) return;
    if (this.cur?.last) { this.finish(false); return; }
    this.step++;
    if (this.step >= this.steps.length) { this.finish(false); return; }
    this.game.audio?.play?.('ui_open', { volume: 0.7 });
    if (this.cur.id === 'tree') this._trees0 = this.game.state.stats.treesFelled || 0;
    if (this.cur.id === 'build') this._placed = false;
    this.render();
  }
  finish(skipped) {
    this.step = -1;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    this.hide();
    if (!skipped) { this.ui.toast('Обучение пройдено. Повторить его можно в меню паузы.', 'good'); this.game.audio?.play?.('level_up', { volume: 0.6 }); }
  }
  hide() { toggle(this.root, 'show', false); this._glow(null); }
  _glow(el) {
    if (this._glowEl && this._glowEl !== el) this._glowEl.classList.remove('zc-tut-target');
    this._glowEl = el || null;
    if (el) el.classList.add('zc-tut-target');
  }
  render() {
    const s = this.cur; if (!s) return this.hide();
    const n = this.steps.length;
    this.count.textContent = `шаг ${this.step + 1} из ${n}`;
    this.fill.style.width = Math.round((this.step / n) * 100) + '%';
    this.title.textContent = s.title;
    this.text.textContent = s.text;
    this.keysEl.replaceChildren(...(s.keys || []).map(([k, what]) => h('span.zc-tut-key', h('kbd', k), h('small', what))));
    toggle(this.nextBtn, 'hidden', !s.manual);
    this.nextBtn.querySelector('.zc-btn-lbl').textContent = s.last ? 'Начать игру' : 'Дальше';
    toggle(this.root, 'show', true);
    // restart the pop-in animation so every new step catches the eye
    this.root.classList.remove('pop'); void this.root.offsetWidth; this.root.classList.add('pop');
    this._glow(s.glow ? s.glow() : null);
  }
  update() {
    const s = this.cur;
    if (!s || !this.game.running) return;
    // the glowing target may be re-created by its panel
    if (s.glow && !this._glowEl?.isConnected) this._glow(s.glow());
    try { if (s.check()) this.advance(); } catch (e) { /* ignore */ }
  }
}
