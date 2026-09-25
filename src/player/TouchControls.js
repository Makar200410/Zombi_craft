// On-screen touch controls for phones/tablets (explore mode): floating joystick on the left,
// look pad on the right, attack / use / jump / crouch / view buttons, and a mode (explore ↔ command) button.
// Writes into input.touchState and input._look; the rest of the game reads the unified Input API.
import './touch.css';
import * as icons from '../art/icons.js';

const SVG = {
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9l8-4 8 4-8 4z" fill="rgba(255,255,255,.18)"/><path d="M4 9v7l8 4 8-4V9M12 13v7"/></svg>',
  jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".5"/></svg>',
  crouch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/><path d="M5 20h14" opacity=".6"/></svg>',
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  castle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21V9h2V6h2v3h2V6h2v3h2V6h2v3h2V6h2v3h2v12h-7v-5a2 2 0 0 0-4 0v5z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="3"/><path d="M8 10h8l-1 6h-1.5l-.5 6h-3l-.5-6H8z"/></svg>',
  sword: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3l2 0 0 2-9 9-2-2zM6 14l4 4-2 2-1-1-2 2-2-2 2-2-1-1z"/></svg>',
};

export class TouchControls {
  constructor(game, input) {
    this.game = game;
    this.input = input;
    this.ts = input.touchState;
    this.ts.crouch = false;
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.className = 'tc-hidden';
    root.innerHTML = `
      <div class="tc-zone tc-move"></div>
      <div class="tc-zone tc-look"></div>
      <div class="tc-joy"><div class="tc-arrows"></div><div class="tc-knob"></div></div>
      <div class="tc-btn tc-attack" aria-label="Атака"><div class="tc-cd"></div><img alt="" draggable="false"/><span class="tc-fallback">${SVG.sword}</span></div>
      <div class="tc-btn tc-use" aria-label="Использовать / поставить">${SVG.hand}</div>
      <div class="tc-btn tc-jump" aria-label="Прыжок">${SVG.jump}</div>
      <div class="tc-btn tc-crouch" aria-label="Присесть">${SVG.crouch}</div>
      <div class="tc-btn tc-view" aria-label="Вид">${SVG.view}</div>
      <div class="tc-btn tc-mode" aria-label="Режим командира">${SVG.castle}<span class="tc-lbl">Деревня</span></div>`;
    const ui = document.getElementById('ui');
    if (ui && ui.parentNode) ui.parentNode.insertBefore(root, ui); else document.body.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.el = {
      move: $('.tc-move'), look: $('.tc-look'), joy: $('.tc-joy'), knob: $('.tc-knob'),
      attack: $('.tc-attack'), attackImg: $('.tc-attack img'), attackFallback: $('.tc-attack .tc-fallback'), cd: $('.tc-cd'),
      use: $('.tc-use'), jump: $('.tc-jump'), crouch: $('.tc-crouch'), view: $('.tc-view'), mode: $('.tc-mode'),
    };
    this.joy = null;          // {id, cx, cy}
    this.looks = new Map();   // pointerId -> {x, y, sx, sy, t, moved}
    this._shownItem = null;
    this._visible = false;
    this._bind();
    this.setMode(game.mode);
  }

  _bind() {
    const E = this.el;
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const el of Object.values(E)) if (el && el.addEventListener) el.addEventListener('contextmenu', stop);

    // joystick (floating: appears where the thumb lands)
    E.move.addEventListener('pointerdown', (e) => {
      stop(e);
      if (this.joy) return;
      capture(E.move, e);
      const r = this._joyRadius();
      const cx = Math.max(r + 8, e.clientX), cy = Math.min(innerHeight - r - 8, Math.max(r + 8, e.clientY));
      this.joy = { id: e.pointerId, cx, cy };
      E.joy.style.left = cx + 'px'; E.joy.style.top = cy + 'px';
      E.joy.classList.add('active');
      this._joyMove(e.clientX, e.clientY);
    });
    E.move.addEventListener('pointermove', (e) => { if (this.joy && e.pointerId === this.joy.id) { stop(e); this._joyMove(e.clientX, e.clientY); } });
    const joyEnd = (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      this.joy = null; this.ts.move.set(0, 0); this.ts.sprint = false;
      E.knob.style.transform = ''; E.joy.classList.remove('active', 'sprint');
      this._restJoy();
    };
    E.move.addEventListener('pointerup', joyEnd);
    E.move.addEventListener('pointercancel', joyEnd);

    // look pad (+ taps → input.dispatchTap)
    const lookDown = (zone) => (e) => {
      stop(e); capture(zone, e);
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
    };
    const lookMove = (e) => {
      const l = this.looks.get(e.pointerId); if (!l) return;
      stop(e);
      const dx = e.clientX - l.x, dy = e.clientY - l.y;
      l.x = e.clientX; l.y = e.clientY;
      if (!l.moved && Math.hypot(l.x - l.sx, l.y - l.sy) > 10) l.moved = true;
      // small dead-zone before the camera starts turning so taps don't jitter the view
      if (l.moved) { this.input._look.x += dx; this.input._look.y += dy; }
    };
    const lookUp = (isPad) => (e) => {
      const l = this.looks.get(e.pointerId); if (!l) return;
      this.looks.delete(e.pointerId);
      if (isPad && e.type === 'pointerup' && !l.moved && performance.now() - l.t < 350) this.input.dispatchTap(e.clientX, e.clientY, e);
    };
    E.look.addEventListener('pointerdown', lookDown(E.look));
    E.look.addEventListener('pointermove', lookMove);
    E.look.addEventListener('pointerup', lookUp(true));
    E.look.addEventListener('pointercancel', lookUp(false));

    // hold buttons (attack & use also act as look pads while held, so you can aim while mining)
    const hold = (el, key, look) => {
      el.addEventListener('pointerdown', (e) => {
        stop(e); capture(el, e); el.classList.add('down'); this.ts[key] = true;
        if (look) this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
        if (key === 'jump') this.input._press('Space');
        navigator.vibrate?.(key === 'primary' ? 8 : 5);
      });
      if (look) el.addEventListener('pointermove', lookMove);
      const up = (e) => { el.classList.remove('down'); this.ts[key] = false; if (look) this.looks.delete(e.pointerId); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    hold(E.attack, 'primary', true);
    hold(E.use, 'secondary', true);
    hold(E.jump, 'jump', false);

    const click = (el, fn) => {
      el.addEventListener('pointerdown', (e) => { stop(e); el.classList.add('down'); });
      el.addEventListener('pointerup', (e) => { stop(e); el.classList.remove('down'); fn(); });
      el.addEventListener('pointercancel', () => el.classList.remove('down'));
    };
    click(E.crouch, () => { this.ts.crouch = !this.ts.crouch; E.crouch.classList.toggle('on', this.ts.crouch); });
    click(E.view, () => this.game.player?.toggleView?.());
    click(E.mode, () => { const g = this.game; g.setMode(g.mode === 'command' ? 'explore' : 'command'); navigator.vibrate?.(12); });
  }

  _joyRadius() { return this.el.joy.offsetWidth * 0.5 || 60; }
  _restJoy() {
    // resting position hint: bottom-left, semi-transparent
    const r = this._joyRadius();
    const portrait = innerHeight > innerWidth;
    this.el.joy.style.left = (r + 30) + 'px';
    this.el.joy.style.top = (innerHeight - r - (portrait ? 110 : 36)) + 'px';
  }
  _joyMove(x, y) {
    const j = this.joy; if (!j) return;
    const r = this._joyRadius() * 0.78;
    let dx = x - j.cx, dy = y - j.cy;
    const d = Math.hypot(dx, dy);
    // drag the base along when the thumb goes far beyond the rim (keeps control responsive)
    if (d > r * 1.6) { const k = (d - r * 1.6) / d; j.cx += dx * k; j.cy += dy * k; dx = x - j.cx; dy = y - j.cy; this.el.joy.style.left = j.cx + 'px'; this.el.joy.style.top = j.cy + 'px'; }
    const dd = Math.hypot(dx, dy), m = Math.min(1, dd / r);
    const nx = dd > 0 ? dx / dd : 0, ny = dd > 0 ? dy / dd : 0;
    const dead = 0.12, mag = m < dead ? 0 : (m - dead) / (1 - dead);
    this.ts.move.set(nx * mag, -ny * mag);
    this.ts.sprint = dd > r * 1.08 && -ny > 0.55;          // push past the rim forward to sprint
    this.el.joy.classList.toggle('sprint', this.ts.sprint);
    const kx = nx * Math.min(dd, r), ky = ny * Math.min(dd, r);
    this.el.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  setMode(mode) {
    this.root.classList.toggle('tc-command', mode === 'command');
    this.el.mode.innerHTML = (mode === 'command' ? SVG.person : SVG.castle) + `<span class="tc-lbl">${mode === 'command' ? 'Герой' : 'Деревня'}</span>`;
    this.el.mode.setAttribute('aria-label', mode === 'command' ? 'Режим героя' : 'Режим командира');
    this.reset();
  }

  reset() {
    this.ts.primary = this.ts.secondary = this.ts.jump = this.ts.sprint = false;
    this.ts.move.set(0, 0);
    this.joy = null; this.looks.clear();
    this.el.joy.classList.remove('active', 'sprint'); this.el.knob.style.transform = '';
    for (const b of [this.el.attack, this.el.use, this.el.jump]) b.classList.remove('down');
    this._restJoy();
  }

  update() {
    const g = this.game;
    const vis = g.running && !g.paused && !(g.player && g.player.dead && g.mode === 'explore');
    if (vis !== this._visible) { this._visible = vis; this.root.classList.toggle('tc-hidden', !vis); if (!vis) this.reset(); }
    if (!vis) return;
    const p = g.player;
    if (!p) return;
    const id = p.hotbar?.[p.selected] || null;
    if (id !== this._shownItem) {
      this._shownItem = id;
      let url = null;
      try { if (id && icons.getItemSprite && icons.iconURL) url = icons.iconURL(icons.getItemSprite(id)); } catch (e) { url = null; }
      if (url) { this.el.attackImg.src = url; this.el.attackImg.style.display = ''; this.el.attackFallback.style.display = 'none'; }
      else { this.el.attackImg.style.display = 'none'; this.el.attackFallback.style.display = ''; }
    }
    const cd = p.cooldownFrac ? p.cooldownFrac() : 0;
    const charge = p.charge || 0;
    const v = charge > 0 ? charge : (cd > 0 ? 1 - cd : 0);
    this.el.cd.style.setProperty('--p', (v * 100).toFixed(1) + '%');
    this.el.cd.style.opacity = v > 0 && v < 1 ? '0.9' : charge >= 1 ? '1' : '0';
  }
}

function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
