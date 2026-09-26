// Explore-mode HUD: vitals, resources, clock & wave status, hotbar, build palette, crosshair.
import { ITEMS, RESOURCES, RESOURCE_LABELS } from '../core/items.js';
import { BLOCKS, PALETTE } from '../core/blocks.js';
import { TECHS } from '../systems/research.js';
import { h, img, glyph, glyphImg, resourceIcon, itemIcon, blockIcon, setText, setStyle, toggle, fmtNum, fmtTime, clamp } from './dom.js';

class Bar {
  constructor(cls, icon, label) {
    this.el = h('div.zc-bar.' + cls, { title: label },
      h('div.zc-bar-ico', img(icon)),
      h('div.zc-bar-track',
        this.trail = h('div.zc-bar-trail'),
        this.fill = h('div.zc-bar-fill'),
        h('div.zc-bar-shine'),
        this.val = h('span.zc-bar-val'),
      ));
    this.ratio = 1; this.trailRatio = 1; this.hold = 0; this.last = -1;
  }
  set(v, max, dt) {
    max = Math.max(1, max || 1);
    const r = clamp((v || 0) / max, 0, 1);
    if (r < this.ratio - 0.001) this.hold = 0.45;
    this.ratio = r;
    if (this.trailRatio < r) this.trailRatio = r;
    else if (this.hold > 0) this.hold -= dt;
    else this.trailRatio = Math.max(r, this.trailRatio - dt * 0.6);
    setStyle(this.fill, 'transform', `scaleX(${r.toFixed(3)})`);
    setStyle(this.trail, 'transform', `scaleX(${this.trailRatio.toFixed(3)})`);
    const txt = Math.ceil(v || 0) + ' / ' + Math.round(max);
    setText(this.val, txt);
    toggle(this.el, 'low', r < 0.25);
  }
}

export class Hud {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    const root = this.root = h('div.zc-hud');

    // --- top-left: pause + vitals
    this.pauseBtn = h('button.zc-iconbtn.zc-pause-btn.ui-i', { title: 'Пауза (Esc)', 'aria-label': 'Пауза', onclick: () => ui.requestPause() }, glyphImg('pause'));
    this.hp = new Bar('hp', resourceIcon('health'), 'Здоровье');
    this.mp = new Bar('mp', resourceIcon('mana'), 'Мана');
    this.st = new Bar('st', glyph('bolt'), 'Выносливость');
    this.vitals = h('div.zc-vitals.zc-panel', this.hp.el, this.mp.el, this.st.el);
    this.topLeft = h('div.zc-topleft', this.pauseBtn, this.vitals);

    // --- mode switch (always visible while playing)
    this.modeIco = img(glyph('castle'));
    this.modeLbl = h('span.zc-mode-lbl', 'Командовать');
    this.modeBtn = h('button.zc-mode-btn.ui-i', { title: 'Переключить режим (Tab)', onclick: () => ui.toggleMode() },
      h('span.zc-mode-ico', this.modeIco), this.modeLbl);

    this.craftBtn = h('button.zc-mode-btn.zc-craft-btn.ui-i', { title: 'Крафт и переплавка (I)', onclick: () => { ui.click(); ui.craft.toggle(); } },
      h('span.zc-mode-ico', img(glyph('hammer'))), h('span.zc-mode-lbl', 'Крафт'));

    // --- resources
    this.chips = {};
    this.resbar = h('div.zc-resbar.zc-panel');
    for (const r of RESOURCES) {
      const c = { el: null, n: null, shown: this.game.state.resources[r] || 0, target: 0, delta: null, deltaT: 0, deltaV: 0 };
      c.n = h('span.zc-chip-n', fmtNum(c.shown));
      c.el = h('div.zc-chip', { 'data-res': r, title: RESOURCE_LABELS[r] }, img(resourceIcon(r)), c.n);
      this.chips[r] = c; this.resbar.appendChild(c.el);
    }
    this.popN = h('span.zc-chip-n', '0/0');
    this.popChip = h('div.zc-chip.pop', { title: 'Жители / лимит населения' }, img(resourceIcon('population')), this.popN);
    this.resbar.appendChild(this.popChip);

    // --- top-right: minimap + clock
    this.dial = h('canvas.zc-dial', { width: 64, height: 64 });
    this.dayLbl = h('div.zc-day', 'День 1');
    this.timeLbl = h('div.zc-timer', '');
    this.clock = h('div.zc-clock.zc-panel', this.dial, h('div.zc-clock-txt', this.dayLbl, this.timeLbl));
    this.researchPill = h('button.zc-rpill.ui-i', { onclick: () => ui.openResearch() },
      img(resourceIcon('research')), this.rpName = h('span.zc-rpill-name'), h('div.zc-rpill-track', this.rpFill = h('div.zc-rpill-fill')));
    this.topRight = h('div.zc-topright', ui.minimap.root, this.clock, this.researchPill);

    // --- crosshair
    this.crosshair = h('div.zc-crosshair', h('i'), h('i'), h('i'), h('i'), h('b'));

    // --- hotbar + palette
    this.slots = [];
    this.hotbar = h('div.zc-hotbar.zc-panel');
    for (let i = 0; i < 9; i++) {
      const s = { i, id: null, img: img(''), lock: h('div.zc-slot-lock', img(glyph('lock'))), key: h('span.zc-slot-key', String(i + 1)), cd: h('div.zc-slot-cd') };
      s.el = h('button.zc-slot.ui-i', { onclick: () => this.onSlot(i) }, s.img, s.cd, s.lock, s.key);
      this.slots.push(s); this.hotbar.appendChild(s.el);
    }
    this.itemName = h('div.zc-itemname');
    this.palette = h('div.zc-palette.zc-panel.ui-i');
    this.paletteBtns = [];
    for (const id of PALETTE) {
      const b = BLOCKS[id]; if (!b) continue;
      const costK = Object.keys(b.cost || {})[0];
      const btn = h('button.zc-pblock', { title: b.label, onclick: () => this.pickBlock(id) },
        img(blockIcon(id)),
        costK ? h('span.zc-pcost', img(resourceIcon(costK)), String(b.cost[costK])) : h('span.zc-pcost.free', '0'));
      this.paletteBtns.push({ id, btn, cost: b.cost || {} });
      this.palette.appendChild(btn);
    }
    this.paletteLbl = h('div.zc-palette-lbl');
    this.bottom = h('div.zc-bottom', this.itemName, h('div.zc-palette-wrap', this.paletteLbl, this.palette), this.hotbar);

    this.fps = h('div.zc-fps');
    root.append(this.topLeft, this.modeBtn, this.craftBtn, this.resbar, this.topRight, this.crosshair, this.bottom, this.fps);

    this._prevRes = { ...this.game.state.resources };
    this._nameT = 0; this._lastSel = -1; this._lastBuild = -1;
    this._fpsAcc = 0; this._fpsN = 0; this._dialT = 1; this._slowT = 0;

    const bus = this.game.bus;
    bus.on('resources:changed', () => this.onResources());
    bus.on('hotbar:select', () => { this._lastSel = -1; });
    bus.on('item:unlocked', ({ id }) => this.flashUnlocked(id));
    bus.on('game:begin', () => { this._prevRes = { ...this.game.state.resources }; for (const r of RESOURCES) { this.chips[r].shown = this.game.state.resources[r] || 0; } });
  }

  // ------------------------------------------------------------------ resources
  onResources() {
    const res = this.game.state.resources;
    const now = performance.now();
    for (const r of RESOURCES) {
      const prev = this._prevRes[r] || 0, cur = res[r] || 0;
      if (prev === cur) continue;
      const d = cur - prev;
      const c = this.chips[r];
      if (!this.game.running) { c.shown = cur; continue; }
      // merge rapid consecutive deltas of the same sign into one floating label
      if (c.delta && now - c.deltaT < 700 && Math.sign(c.deltaV) === Math.sign(d)) {
        c.deltaV += d; c.delta.textContent = (c.deltaV > 0 ? '+' : '−') + fmtNum(Math.abs(c.deltaV));
        c.delta.style.animation = 'none'; void c.delta.offsetWidth; c.delta.style.animation = '';
      } else {
        c.deltaV = d;
        c.delta = h('span.zc-delta' + (d > 0 ? '.up' : '.down'), (d > 0 ? '+' : '−') + fmtNum(Math.abs(d)));
        c.el.appendChild(c.delta);
        const el = c.delta; setTimeout(() => el.remove(), 1400);
      }
      c.deltaT = now;
      c.el.classList.remove('bump-up', 'bump-down'); void c.el.offsetWidth;
      c.el.classList.add(d > 0 ? 'bump-up' : 'bump-down');
    }
    this._prevRes = { ...res };
  }

  // ------------------------------------------------------------------ hotbar
  isItemUnlocked(id) {
    const p = this.game.player, st = this.game.state;
    if (!id) return false;
    if (p?.isUnlocked) { try { return !!p.isUnlocked(id); } catch (e) { /* fall back */ } }
    const it = ITEMS[id];
    return !it || !it.research || st.researchDone.has(it.research) || st.unlockedItems.has(id);
  }
  onSlot(i) {
    const p = this.game.player; if (!p) return;
    const id = p.hotbar?.[i];
    if (p.selectSlot) p.selectSlot(i);
    else { p.selected = i; this.game.bus.emit('hotbar:select', { index: i, itemId: id }); this.game.audio?.play?.('ui_click'); }
  }
  pickBlock(id) {
    const p = this.game.player; if (!p) return;
    if (p.setBuildBlock) p.setBuildBlock(id);
    else { p.buildBlock = id; this.game.bus.emit('build:block', { id }); }
    this.game.audio?.play?.('ui_click', { volume: 0.5 });
    this._lastBuild = -1;
  }
  flashUnlocked(id) {
    const i = this.game.player?.hotbar?.indexOf(id);
    if (i >= 0) { const el = this.slots[i].el; el.classList.remove('unlocked-flash'); void el.offsetWidth; el.classList.add('unlocked-flash'); }
  }

  /** Lay out hotbar for touch devices so it never covers the joystick / action button zones. */
  layout() {
    const W = innerWidth, H = innerHeight, touch = this.game.isTouch;
    const portrait = H >= W;
    let slot, cols = 9;
    if (!touch) slot = W < 700 ? Math.floor((W - 24) / 9) : 54;
    else if (portrait) slot = Math.min(50, Math.floor((W - 20 - 8 - 16) / 9));
    else {
      const gap = W - W * 0.42 - 214 - 8;
      slot = Math.floor((gap - 16) / 9);
      if (slot < 36) { cols = 5; slot = Math.min(44, Math.floor((gap - 8) / 5)); }
      slot = Math.min(slot, 50);
    }
    this.root.style.setProperty('--slot', slot + 'px');
    this.root.style.setProperty('--hb-cols', cols);
    toggle(this.hotbar, 'two-rows', cols !== 9);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game, p = g.player, st = g.state;
    if (p) {
      this.hp.set(p.hp, p.maxHp, dt);
      this.mp.set(p.mana ?? 0, p.maxMana ?? 100, dt);
      this.st.set(p.stamina ?? p.maxStamina ?? 100, p.maxStamina ?? 100, dt);
    }
    // resource number tween
    for (const r of RESOURCES) {
      const c = this.chips[r], target = st.resources[r] || 0;
      if (c.shown !== target) {
        const diff = target - c.shown;
        c.shown = Math.abs(diff) < 1 ? target : c.shown + diff * Math.min(1, dt * 10);
        setText(c.n, fmtNum(Math.round(c.shown)));
      }
      // raw ores only take space in the bar while you actually have some
      if (r.endsWith('_ore')) { const show = target > 0; if (c._vis !== show) { c._vis = show; c.el.style.display = show ? '' : 'none'; } }
    }
    const alive = (g.village?.villagers || []).filter(v => !v.dead).length;
    const cap = g.village?.popCap ?? 0;
    setText(this.popN, alive + '/' + cap);
    toggle(this.popChip, 'full', cap > 0 && alive >= cap);

    this.updateClock(dt);
    this.updateHotbar(dt);
    this.updateResearchPill();

    if (this.ui.settings.showFps) {
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc > 0.5) { setText(this.fps, Math.round(this._fpsN / this._fpsAcc) + ' FPS'); this._fpsAcc = 0; this._fpsN = 0; }
    }
    toggle(this.fps, 'on', !!this.ui.settings.showFps);
  }

  updateClock(dt) {
    const g = this.game, st = g.state, w = g.waves;
    setText(this.dayLbl, 'День ' + st.day);
    let txt, cls = '';
    const active = w?.activeCount || 0;
    if (active > 0 || (st.isNight && (w?.waveActive || w?.active))) {
      txt = 'ВОЛНА ' + (w?.currentWave || 1) + ' — осталось ' + active; cls = 'wave';
    } else if (st.isNight) {
      txt = 'До рассвета ' + fmtTime(st.secondsToDawn ?? 0); cls = 'night';
    } else {
      const s = (typeof w?.nextWaveIn === 'number' && w.nextWaveIn >= 0) ? w.nextWaveIn : st.secondsToDusk;
      txt = 'До ночи ' + fmtTime(s); cls = s < 30 ? 'warn' : '';
    }
    setText(this.timeLbl, txt);
    if (this._clockCls !== cls) { this.clock.dataset.state = cls; this._clockCls = cls; }
    this._dialT += dt;
    if (this._dialT > 0.5) { this._dialT = 0; this.drawDial(); }
  }

  drawDial() {
    const c = this.dial, x = c.getContext('2d'), st = this.game.state;
    const S = 64, cx = 32, cy = 32, R = 27;
    x.clearRect(0, 0, S, S);
    // sky disc: day arc (0.22..0.78) vs night arc, drawn with 0 = midnight at bottom
    const toAng = (t) => Math.PI / 2 + t * Math.PI * 2;  // midnight at bottom, noon at top
    x.lineWidth = 7;
    x.beginPath(); x.strokeStyle = '#1b2350'; x.arc(cx, cy, R - 4, 0, Math.PI * 2); x.stroke();
    const grd = x.createLinearGradient(0, 0, 0, S); grd.addColorStop(0, '#8fd0ff'); grd.addColorStop(1, '#f2a04a');
    x.beginPath(); x.strokeStyle = grd; x.arc(cx, cy, R - 4, toAng(0.22), toAng(0.78)); x.stroke();
    // inner disc
    const ig = x.createRadialGradient(cx, cy - 6, 2, cx, cy, R - 7);
    const night = st.nightFactor;
    ig.addColorStop(0, night > 0.5 ? '#26305a' : '#5da8e8'); ig.addColorStop(1, night > 0.5 ? '#0b0f22' : '#2a5a9a');
    x.fillStyle = ig; x.beginPath(); x.arc(cx, cy, R - 8, 0, Math.PI * 2); x.fill();
    // ticks at dawn/dusk
    x.strokeStyle = '#f5d27a'; x.lineWidth = 2;
    for (const t of [0.22, 0.78]) { const a = toAng(t); x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); }
    // rim
    x.strokeStyle = '#c9a452'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#2a1c0c'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, R + 1.5, 0, Math.PI * 2); x.stroke();
    // hand + sun/moon icon
    const a = toAng(st.timeOfDay);
    const px = cx + Math.cos(a) * (R - 4), py = cy + Math.sin(a) * (R - 4);
    x.strokeStyle = 'rgba(255,240,200,.85)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); x.stroke();
    const icon = st.isNight ? this._moonImg : this._sunImg;
    if (!this._sunImg) { this._sunImg = new Image(); this._sunImg.src = glyph('sun'); this._moonImg = new Image(); this._moonImg.src = glyph('moon'); }
    x.imageSmoothingEnabled = false;
    if (icon?.complete && icon.naturalWidth) x.drawImage(icon, Math.round(px - 10), Math.round(py - 10), 20, 20);
    else { x.fillStyle = st.isNight ? '#dde' : '#ffd84a'; x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill(); }
  }

  updateHotbar(dt) {
    const g = this.game, p = g.player; if (!p) return;
    const hb = p.hotbar || [];
    for (let i = 0; i < 9; i++) {
      const s = this.slots[i], id = hb[i] || null;
      if (s.id !== id) {
        s.id = id;
        s.img.src = id ? itemIcon(id) : '';
        s.img.style.visibility = id ? 'visible' : 'hidden';
        s.el.title = id ? (ITEMS[id]?.name || id) : '';
      }
      const locked = id ? !this.isItemUnlocked(id) : false;
      toggle(s.el, 'locked', locked);
      toggle(s.el, 'sel', p.selected === i);
      const it = ITEMS[id];
      toggle(s.el, 'nomana', !!(it && it.manaCost && (p.mana ?? 0) < it.manaCost));
      // cooldown sweep (selected slot; only for slow weapons so fast swings don't flicker)
      let frac = 0;
      if (p.selected === i && it && it.cooldown >= 0.8) { try { frac = clamp(p.cooldownFrac?.() || 0, 0, 1); } catch (e) { frac = 0; } }
      setStyle(s.cd, 'transform', `scaleY(${frac.toFixed(2)})`);
    }
    // selected item name fade
    const sel = p.selected ?? 0;
    if (sel !== this._lastSel) {
      this._lastSel = sel;
      const id = hb[sel];
      const it = ITEMS[id];
      if (it) {
        const locked = !this.isItemUnlocked(id);
        this.itemName.textContent = '';
        this.itemName.append(h('b', it.name), locked ? h('span.lockedtxt', ' — нужно: ' + (TECHS[it.research]?.name || it.research)) : (it.manaCost ? h('span.mana', ` · ${it.manaCost} маны`) : ''));
        this.itemName.classList.remove('show'); void this.itemName.offsetWidth; this.itemName.classList.add('show');
      }
    }
    // build palette
    const building = hb[sel] === 'build_hammer' && g.mode === 'explore' && this.isItemUnlocked('build_hammer');
    toggle(this.bottom, 'building', building);
    if (building) {
      const cur = p.buildBlock ?? PALETTE[0];
      this._slowT -= dt;
      if (cur !== this._lastBuild || this._slowT <= 0) {
        this._slowT = 0.4;
        let selBtn = null;
        for (const pb of this.paletteBtns) {
          const on = pb.id === cur;
          toggle(pb.btn, 'sel', on);
          toggle(pb.btn, 'poor', !g.state.canAfford(pb.cost));
          if (on) selBtn = pb.btn;
        }
        if (cur !== this._lastBuild) {
          this._lastBuild = cur;
          const b = BLOCKS[cur];
          this.paletteLbl.textContent = b ? b.label : '';
          selBtn?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  updateResearchPill() {
    const r = this.game.research;
    const on = !!r?.current;
    toggle(this.researchPill, 'on', on);
    if (on) {
      setText(this.rpName, TECHS[r.current]?.name || r.current);
      setStyle(this.rpFill, 'transform', `scaleX(${(r.progress || 0).toFixed(3)})`);
    }
  }

  setMode(mode) {
    const cmd = mode === 'command';
    this.modeIco.src = glyph(cmd ? 'sword' : 'castle');
    this.modeLbl.textContent = cmd ? 'Исследовать' : 'Командовать';
    this.modeBtn.title = cmd ? 'Вернуться к герою (Tab)' : 'Режим командования (Tab)';
  }
}
