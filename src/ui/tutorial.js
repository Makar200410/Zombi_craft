// First-game tutorial: a small card that walks through the basics step by step and advances by itself when the
// player does the thing. Skippable; remembered in localStorage so it runs once per device.
import { h, img, glyph, toggle } from './dom.js';

const KEY = 'zc_tutorial_done';

export class Tutorial {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.step = -1;
    this.title = h('div.zc-tut-title');
    this.text = h('div.zc-tut-text');
    this.count = h('span.zc-tut-count');
    this.nextBtn = h('button.zc-btn.small.primary.ui-i', { onclick: () => { ui.click(); this.advance(); } }, h('span.zc-btn-lbl', 'Понятно'));
    this.root = h('div.zc-tut.zc-panel.ornate.ui-i',
      h('div.zc-tut-head', img(glyph('book')), h('b', 'Обучение'), this.count,
        h('button.zc-tut-skip.ui-i', { onclick: () => { ui.click(); this.finish(true); } }, 'Пропустить')),
      this.title, this.text, h('div.zc-row.end', this.nextBtn));
    const bus = this.game.bus;
    bus.on('game:begin', ({ loaded } = {}) => { if (!loaded && !this.done) this.start(); else this.hide(); });
    bus.on('villager:job', () => { if (this.cur?.id === 'job') this.advance(); });
    bus.on('building:placed', () => this._placed = true);
  }
  get done() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

  get steps() {
    const t = this.game.isTouch;
    return [
      { id: 'move', title: 'Осмотритесь', text: t ? 'Двигайтесь джойстиком слева, осматривайтесь свайпом по правой половине экрана.' : 'Ходите на W A S D, осматривайтесь мышью. Щёлкните по игре, чтобы захватить мышь.',
        check: () => this._moved() > 8 },
      { id: 'tree', title: 'Срубите дерево', text: (t ? 'Выберите топор в панели внизу' : 'Выберите топор (клавиша 3)') + ' и ударьте по стволу — дерево упадёт целиком, а брёвна пойдут в запас деревни.',
        check: () => (this.game.state.stats.treesFelled || 0) > this._trees0 },
      { id: 'command', title: 'Режим командования', text: t ? 'Нажмите «Командовать» слева вверху: камера поднимется над деревней, как в стратегии.' : 'Нажмите Tab или «Командовать»: камера поднимется над деревней, как в стратегии.',
        check: () => this.game.mode === 'command' },
      { id: 'build', title: 'Постройте дом', text: 'Откройте «Строить», выберите «Дом» и укажите место. Строители сами возведут его по блокам. Дома дают новых жителей.',
        check: () => this._placed },
      { id: 'job', title: 'Дайте жителям работу', text: 'Во вкладке «Жители» назначьте свободного жителя фермером, лесорубом или шахтёром — плюсом у нужной работы.',
        check: () => false },
      { id: 'quests', title: 'Следуйте заданиям', text: 'Справа под часами — задания: они ведут по порядку, что и сколько строить. Все задания — в журнале (' + (t ? 'кнопка «Журнал»' : 'клавиша J') + '). Ночью придут зомби — защищайте ратушу!',
        check: () => false, manual: true },
    ];
  }
  get cur() { return this.step >= 0 ? this.steps[this.step] : null; }

  start() {
    this.step = 0;
    const p = this.game.player?.position;
    this._start = p ? { x: p.x, z: p.z } : null;
    this._trees0 = this.game.state.stats.treesFelled || 0;
    this._placed = false;
    this.render();
  }
  _moved() { const p = this.game.player?.position; return p && this._start ? Math.hypot(p.x - this._start.x, p.z - this._start.z) : 0; }
  advance() {
    if (this.step < 0) return;
    this.step++;
    if (this.step >= this.steps.length) { this.finish(false); return; }
    this.game.audio?.play?.('ui_open', { volume: 0.6 });
    this.render();
  }
  finish(skipped) {
    this.step = -1;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    this.hide();
    if (!skipped) this.ui.toast('Обучение пройдено. Удачи, правитель!', 'good');
  }
  hide() { toggle(this.root, 'show', false); }
  render() {
    const s = this.cur; if (!s) return this.hide();
    this.count.textContent = ` ${this.step + 1} / ${this.steps.length}`;
    this.title.textContent = s.title;
    this.text.textContent = s.text;
    toggle(this.nextBtn, 'hidden', !s.manual);
    toggle(this.root, 'show', true);
  }
  update() {
    const s = this.cur;
    if (!s || !this.game.running) return;
    try { if (s.check()) this.advance(); } catch (e) { /* ignore */ }
  }
}
