// UI root: DOM overlay (#ui) orchestrating HUD, menus, command-mode panels, research tree, toasts.
import './ui.css';
import { GameState } from '../core/state.js';
import { h, noiseURL, toggle, clamp, BUILDING_TYPES } from './dom.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { Toasts, Banner } from './toasts.js';
import { DamageNumbers } from './damageNumbers.js';
import { Menus, confirmDialog } from './menus.js';
import { CommandPanel } from './commandPanel.js';
import { ResearchPanel } from './researchPanel.js';

const SETTINGS_KEY = 'zc_settings';
const STOP_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'wheel', 'contextmenu'];

export class UI {
  constructor(game) {
    this.game = game;
    this.settings = { sensitivity: 1, showFps: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* ignore */ }
    game.settings = this.settings;

    let root = document.getElementById('ui');
    if (!root) { root = document.createElement('div'); root.id = 'ui'; document.body.appendChild(root); }
    this.root = root;
    root.classList.add('zc-root', 'st-boot');
    toggle(root, 'zc-touch', !!game.isTouch);
    root.style.setProperty('--noise', `url(${noiseURL()})`);

    this.vignette = h('div.zc-vignette');
    this.hitflash = h('div.zc-hitflash');
    this.minimap = new Minimap(this);
    this.hud = new Hud(this);
    this.toasts = new Toasts(this);
    this.banner = new Banner(this);
    this.dmg = new DamageNumbers(this);
    this.command = new CommandPanel(this);
    this.research = new ResearchPanel(this);
    this.menus = new Menus(this);
    this.dialogLayer = h('div.zc-dialogs');
    root.append(this.vignette, this.hitflash, this.dmg.root, this.hud.root, this.command.root, this.toasts.root, this.banner.root,
      this.research.root, this.menus.root, this.dialogLayer);

    // keep UI interactions from reaching game input listeners on window/document
    for (const ev of STOP_EVENTS) {
      root.addEventListener(ev, (e) => { if (e.target instanceof Element && e.target.closest('.ui-i')) e.stopPropagation(); }, { passive: ev !== 'contextmenu' && ev !== 'wheel' ? true : ev === 'wheel' });
    }
    root.addEventListener('contextmenu', (e) => { if (e.target instanceof Element && e.target.closest('.ui-i')) e.preventDefault(); });

    this._worldUsed = false;
    this._quietUntil = 0;
    this._lowHp = 0;
  }

  init() {
    const g = this.game, bus = g.bus;
    bus.on('toast', (p) => this.toast(p?.text, p?.kind, p?.icon));
    bus.on('mode:changed', ({ mode }) => this.onMode(mode));
    bus.on('ui:pause-request', () => this.requestPause());
    bus.on('game:begin', (p) => this.onBegin(p));
    bus.on('game:paused', ({ paused }) => toggle(this.root, 'st-paused', paused));
    bus.on('wave:start', ({ wave, count } = {}) => {
      this.banner.show('ВОЛНА ' + (wave ?? ''), count ? `Нежить наступает · ${count} врагов` : 'Нежить наступает!', 'wave', 3600);
    });
    bus.on('wave:end', ({ wave } = {}) => this.banner.show('Волна отбита!', wave ? `Волна ${wave} уничтожена` : '', 'good', 2800));
    bus.on('time:dawn', ({ day } = {}) => { if (!g.waves?.activeCount) this.banner.show('День ' + (day ?? g.state.day), 'Солнце встаёт — нежить отступает', 'day', 2600); });
    bus.on('time:dusk', () => { if (g.running) this.toast('Сгущаются сумерки… Готовьтесь к обороне!', 'wave'); });
    bus.on('player:damaged', ({ amount } = {}) => this.onHurt(amount));
    bus.on('player:died', ({ source } = {}) => this.onDeath(source));
    bus.on('player:respawn', () => { if (this.menus.current === 'death') this.menus.hide(); toggle(this.root, 'st-dead', false); });
    bus.on('game:over', ({ reason } = {}) => this.onGameOver(reason));
    bus.on('building:completed', ({ building } = {}) => { if (this._loud()) this.toast('Построено: ' + (BUILDING_TYPES[building?.type]?.name || building?.type || ''), 'good'); });
    bus.on('building:destroyed', ({ building } = {}) => { if (this._loud()) this.toast('Разрушено: ' + (BUILDING_TYPES[building?.type]?.name || building?.type || ''), 'bad'); });
    bus.on('villager:spawned', ({ villager } = {}) => { if (this._loud()) this.toast('Новый житель: ' + (villager?.name || ''), 'info'); });
    bus.on('villager:died', ({ villager } = {}) => { if (this._loud()) this.toast('Погиб житель: ' + (villager?.name || ''), 'bad'); });

    addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    addEventListener('resize', () => this.layout());
    addEventListener('orientationchange', () => setTimeout(() => this.layout(), 250));
    this.layout();
    this.onMode(g.mode);
  }

  _loud() { return this.game.running && performance.now() > this._quietUntil; }
  click() { this.game.audio?.play?.('ui_click'); }
  toast(text, kind = 'info', icon = null) { if (text) this.toasts.show(text, kind, icon); }
  confirm(title, text, ok, onOk) { return confirmDialog(this, title, text, ok, onOk); }

  layout() {
    const portrait = innerHeight >= innerWidth;
    toggle(this.root, 'o-portrait', portrait);
    toggle(this.root, 'o-landscape', !portrait);
    toggle(this.root, 'o-short', innerHeight < 500);
    this.hud.layout();
  }

  // ---------------------------------------------------------------- flow
  showMainMenu() {
    this._setState('menu');
    this.menus.showMain();
    this._unlockPointer();
  }
  _setState(s) {
    for (const k of ['st-boot', 'st-menu', 'st-play']) this.root.classList.remove(k);
    this.root.classList.add('st-' + s);
  }
  async startNewGame({ difficulty = 'normal', seed = null } = {}) {
    const g = this.game;
    g.running = false;
    g.setPaused(false);
    g.save?.deleteSave?.();
    if (seed != null || this._worldUsed) {
      const prog = this.menus.showLoading('Генерация мира…');
      await g.setup({ seed: seed ?? ((Math.random() * 1e9) | 0) }, prog);
    }
    // fresh game state (keeps the same object so every system's reference stays valid)
    const fresh = new GameState(g.bus).serialize();
    fresh.seed = g.world?.seed ?? fresh.seed;
    fresh.difficulty = difficulty;
    g.state.deserialize(fresh);
    g.state.difficulty = difficulty;
    this.menus.hide();
    g.begin();
  }
  async continueGame() {
    const g = this.game;
    const prog = this.menus.showLoading('Загрузка сохранения…');
    const ok = await g.save?.load?.(prog);
    if (ok) { this.menus.hide(); this._setState('play'); }
    else { this.menus.showMain(); this.toast('Не удалось загрузить сохранение', 'bad'); }
  }
  quitToMenu(skipSave) {
    const g = this.game;
    if (!skipSave && g.running && !g.gameOver && !g.player?.dead) g.save?.save?.({ toast: false });
    g.running = false;
    g.setPaused(false);
    if (g.mode !== 'explore') g.setMode('explore');
    this.research.close();
    this.command.closeTab(true); this.command.deselect(); this.command.endPlacement();
    this.toasts.clear(); this.dmg.clear(); this.banner.hide();
    this.showMainMenu();
  }
  onNewGame() {
    this.research.close();
    this.command.closeTab(true); this.command.deselect(); this.command.endPlacement();
    this.toasts.clear(); this.dmg.clear();
  }
  onBegin(p = {}) {
    const g = this.game;
    this._worldUsed = true;
    g.gameOver = false;
    this._quietUntil = performance.now() + 2500;
    this._setState('play');
    toggle(this.root, 'st-dead', false);
    if (this.menus.current && this.menus.current !== 'pause') this.menus.hide();
    this.layout();
    if (p.loaded) this.banner.show('День ' + g.state.day, 'С возвращением!', 'day', 2400);
    else this.banner.show('День 1', 'Укрепите деревню до заката!', 'day', 3000);
  }
  onMode(mode) {
    toggle(this.root, 'm-command', mode === 'command');
    toggle(this.root, 'm-explore', mode !== 'command');
    this.hud.setMode(mode);
    if (mode === 'command') this._unlockPointer();
  }
  toggleMode() {
    const g = this.game;
    if (!g.running) return;
    this.click();
    g.setMode(g.mode === 'command' ? 'explore' : 'command');
  }

  // ---------------------------------------------------------------- pause / modal
  get modalOpen() { return !!(this.research.open || (this.menus.current && this.menus.current !== 'death') || this.dialogLayer.children.length); }
  /** True when the UI wants all game input (used by Input to ignore clicks/keys). */
  isBlocking() { return this.modalOpen || !this.game.running; }
  requestPause() {
    const g = this.game;
    if (!g.running || g.gameOver || g.paused || this.menus.current) return;
    g.setPaused(true);
    this.menus.showPause();
    this.game.audio?.play?.('ui_open');
    this._unlockPointer();
  }
  resume() {
    const g = this.game;
    if (this.menus.current === 'pause') this.menus.hide();
    g.setPaused(false);
    if (!g.isTouch && g.mode === 'explore') this._lockPointer();
  }
  openResearch(id) { this._unlockPointer(); this.research.show(id); }
  onPanelClosed() {}
  _unlockPointer() {
    if (document.pointerLockElement) { this._intentionalUnlock = performance.now(); try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  }
  _lockPointer() {
    const g = this.game;
    try {
      if (g.input?.lockPointer) g.input.lockPointer();
      else { const r = g.renderer?.domElement?.requestPointerLock?.(); r?.catch?.(() => {}); }
    } catch (e) { /* ignore */ }
  }
  onLockChange() {
    if (document.pointerLockElement) return;
    if (performance.now() - (this._intentionalUnlock || 0) < 400) return;
    setTimeout(() => {
      const g = this.game;
      if (document.pointerLockElement || g.isTouch || g.mode !== 'explore' || this.modalOpen || g.player?.dead) return;
      this.requestPause();
    }, 120);
  }
  onKey(e) {
    const g = this.game;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'Escape') {
      const dlg = this.dialogLayer.lastElementChild;
      if (dlg) { dlg.dispatchEvent(new MouseEvent('click', { bubbles: true })); e.preventDefault(); return; }
      if (this.research.open) { this.research.close(); e.preventDefault(); return; }
      if (this.menus.current === 'pause') { this.resume(); e.preventDefault(); return; }
      if (this.menus.current === 'main') { if (this.menus.card?.dataset.page !== 'home') this.menus.page('home'); return; }
      if (this.menus.current) return;
      if (g.mode === 'command' && this.command.closeTop()) { e.preventDefault(); return; }
      if (g.running) { this.requestPause(); e.preventDefault(); }
      return;
    }
    if (e.code === 'KeyP' && g.running && !e.repeat) {
      if (this.menus.current === 'pause') this.resume();
      else if (!this.modalOpen) this.requestPause();
    }
  }

  // ---------------------------------------------------------------- player events
  onHurt(amount) {
    const f = this.hitflash;
    f.style.setProperty('--a', String(clamp((amount || 5) / 30, 0.25, 0.9)));
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  onDeath(source) {
    toggle(this.root, 'st-dead', true);
    this._unlockPointer();
    if (!this.menus.current) this.menus.showDeath(source);
    this.research.close();
  }
  onGameOver(reason) {
    const g = this.game;
    g.gameOver = true;
    this._unlockPointer();
    this.research.close();
    this.command.closeTab(true); this.command.deselect();
    this.menus.showGameOver(reason);
    g.audio?.play?.('death');
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game;
    if (g.running) {
      this.hud.update(dt);
      this.minimap.update(dt);
      if (g.mode === 'command') this.command.update(dt);
      this.research.update(dt);
      this.dmg.update(dt);
      // low-hp vignette
      const p = g.player;
      const r = p && p.maxHp ? p.hp / p.maxHp : 1;
      const target = p?.dead ? 0 : clamp((0.4 - r) / 0.4, 0, 1);
      this._lowHp += (target - this._lowHp) * Math.min(1, dt * 4);
      const op = this._lowHp.toFixed(2);
      if (this._vigOp !== op) { this._vigOp = op; this.vignette.style.opacity = op; }
    }
    this.toasts.update(dt);
    this.menus.updateDeath(dt);
  }
}
