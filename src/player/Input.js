// Unified input: keyboard, mouse (pointer lock in explore mode), wheel, touch (virtual controls + command-mode gestures).
//
// Per-frame values (valid during the frame after input.update()):
//   move {x: strafe right, y: forward} (-1..1)          lookDelta {x, y} (pixels; +x right, +y down)
//   actions {primary, secondary, jump, sprint, crouch}   wheel (accumulated deltaY)
//   pan {x, y} (pixels, command-mode drag), twist (radians), pinch (zoom factor, >1 = zoom in)
//   dragging (pointer down & moved past the tap threshold), pointer {x, y} (last pointer CSS px)
// Edge-triggered keys: consumePressed(code) -> true once per physical press.
// Taps: onTap(handler(x, y, e) -> bool, priority) — non-drag canvas clicks/taps, high priority first.
import * as THREE from 'three';
import { TouchControls } from './TouchControls.js';

const TAP_MOVE = 9;          // px threshold separating a tap from a drag (mouse)
const TAP_MOVE_TOUCH = 14;
const TAP_TIME = 450;        // ms

export class Input {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this._pressed = new Set();
    this.move = new THREE.Vector2();
    this.lookDelta = { x: 0, y: 0 };
    this._look = { x: 0, y: 0 };
    this.actions = { primary: false, secondary: false, jump: false, sprint: false, crouch: false };
    this._mouse = { primary: false, secondary: false };
    this.touchState = { primary: false, secondary: false, jump: false, sprint: false, crouch: false, move: new THREE.Vector2() };
    this.wheel = 0; this._wheel = 0;
    this.pan = { x: 0, y: 0 }; this._pan = { x: 0, y: 0 };
    this.twist = 0; this._twist = 0;
    this.tilt = 0; this._tilt = 0;
    this.pinch = 1; this._pinch = 1;
    this.dragging = false;
    this.pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    this.locked = false;
    this._taps = [];
    this._ptrs = new Map();     // active canvas pointers: id -> {x, y, sx, sy, t, button, moved, type}
    this._gesture = null;       // two-finger gesture state
    this._intentionalUnlock = false;
    this.touch = null;
    this.lastInputAt = 0;
  }

  get canvas() { return this.game.renderer?.domElement; }

  init() {
    const g = this.game;
    addEventListener('keydown', (e) => this._onKey(e, true));
    addEventListener('keyup', (e) => this._onKey(e, false));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    document.addEventListener('pointerlockchange', () => this._onLockChange());
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this._look.x += clampMove(e.movementX); this._look.y += clampMove(e.movementY); }
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this._mouse.primary = true;
      else if (e.button === 2) this._mouse.secondary = true;
      else if (e.button === 1) this._press('MouseMiddle');
      e.preventDefault();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouse.primary = false;
      else if (e.button === 2) this._mouse.secondary = false;
    });
    const cv = this.canvas;
    if (cv) {
      cv.style.touchAction = 'none';
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      cv.addEventListener('pointermove', (e) => this._onPointerMove(e));
      cv.addEventListener('pointerup', (e) => this._onPointerUp(e));
      cv.addEventListener('pointercancel', (e) => this._onPointerUp(e, true));
      cv.addEventListener('wheel', (e) => { e.preventDefault(); this._wheel += normWheel(e); }, { passive: false });
    }
    // wheel over the canvas while locked arrives at the canvas too; keep a window fallback for locked state
    addEventListener('wheel', (e) => { if (this.locked && e.target !== cv) this._wheel += normWheel(e); }, { passive: true });

    if (g.isTouch) this.touch = new TouchControls(g, this);
    g.bus.on('mode:changed', ({ mode }) => {
      this._ptrs.clear(); this._gesture = null; this.dragging = false;
      this._mouse.primary = this._mouse.secondary = false;
      if (mode === 'command') this.releasePointer();
      else if (!g.isTouch && g.running && !g.paused) this.requestLock();
      this.touch?.setMode(mode);
    });
    g.bus.on('game:paused', ({ paused }) => { if (paused) { this.releasePointer(); this.reset(); } });
    g.bus.on('player:died', () => { this._mouse.primary = this._mouse.secondary = false; });
  }

  // ---------------------------------------------------------------- public API
  isDown(code) { return this.keys.has(code); }
  consumePressed(code) { if (this._pressed.has(code)) { this._pressed.delete(code); return true; } return false; }
  onTap(fn, priority = 0) {
    this._taps.push({ fn, priority });
    this._taps.sort((a, b) => b.priority - a.priority);
    return () => { this._taps = this._taps.filter(t => t.fn !== fn); };
  }
  /** Whether gameplay input should be processed (not in menus / paused). */
  get active() { const g = this.game; return g.running && !g.paused; }

  requestLock() {
    const cv = this.canvas;
    if (!cv || this.game.isTouch || this.locked || !cv.requestPointerLock) return;
    try {
      const p = cv.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = cv.requestPointerLock(); p2?.catch?.(() => {}); } catch (e) { /* ignore */ } });
    } catch (e) { try { cv.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  /** Release pointer lock without triggering the pause request (UI panels, command mode). */
  releasePointer() {
    if (document.pointerLockElement) { this._intentionalUnlock = true; document.exitPointerLock?.(); }
  }
  reset() {
    this.keys.clear(); this._pressed.clear();
    this._mouse.primary = this._mouse.secondary = false;
    this.touch?.reset();
    this._ptrs.clear(); this._gesture = null; this.dragging = false;
  }

  /** Dispatches a tap at CSS pixel coords to registered handlers (high priority first). */
  dispatchTap(x, y, e) {
    for (const t of this._taps) {
      try { if (t.fn(x, y, e)) return true; } catch (err) { console.error('tap handler failed', err); }
    }
    return false;
  }

  update(dt) {
    const g = this.game;
    // look
    this.lookDelta.x = this._look.x; this.lookDelta.y = this._look.y; this._look.x = this._look.y = 0;
    this.wheel = this._wheel; this._wheel = 0;
    this.pan.x = this._pan.x; this.pan.y = this._pan.y; this._pan.x = this._pan.y = 0;
    this.twist = this._twist; this._twist = 0;
    this.tilt = this._tilt; this._tilt = 0;
    this.pinch = this._pinch; this._pinch = 1;
    this.touch?.update(dt);

    // movement vector (keyboard + touch joystick)
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const ts = this.touchState;
    if (ts.move.lengthSq() > 0.0001) { mx += ts.move.x; my += ts.move.y; }
    this.move.set(mx, my);
    if (this.move.lengthSq() > 1) this.move.normalize();

    const a = this.actions;
    const explore = g.mode === 'explore';
    a.primary = explore && (this._mouse.primary || ts.primary);
    a.secondary = explore && (this._mouse.secondary || ts.secondary);
    a.jump = k.has('Space') || ts.jump;
    a.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || ts.sprint;
    a.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') || !!ts.crouch;
  }

  // ---------------------------------------------------------------- keyboard
  _press(code) { this._pressed.add(code); this.lastInputAt = performance.now(); }
  _onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const code = e.code;
    if (down) {
      if (!e.repeat) { this.keys.add(code); this._press(code); }
      const g = this.game;
      if (!g.running || g.paused) return;
      if (code === 'Tab' || code === 'Space' || (code.startsWith('Arrow') && g.mode === 'command')) e.preventDefault();
      if (e.ctrlKey && (code === 'KeyW' || code === 'KeyS' || code === 'KeyD')) e.preventDefault();
      if (!e.repeat && (code === 'Tab' || code === 'KeyB')) {
        g.setMode(g.mode === 'command' ? 'explore' : 'command');
        this._pressed.delete(code);
      }
    } else {
      this.keys.delete(code);
    }
  }

  // ---------------------------------------------------------------- pointer lock
  _onLockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    this.lastInputAt = performance.now();
    if (was && !this.locked) {
      this._mouse.primary = this._mouse.secondary = false;
      const g = this.game;
      if (!this._intentionalUnlock && g.running && !g.paused && g.mode === 'explore') g.bus.emit('ui:pause-request', {});
    }
    this._intentionalUnlock = false;
    this.game.bus.emit('input:lock', { locked: this.locked });
  }

  // ---------------------------------------------------------------- canvas pointers
  _onPointerDown(e) {
    const g = this.game;
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    if (this.locked) return;              // locked mouse handled by the window listeners
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, moved: false, type: e.pointerType });
    if (this._ptrs.size === 2) this._startGesture();
    if (this._ptrs.size > 1) for (const p of this._ptrs.values()) p.moved = true;   // multi-touch never taps
    this.lastInputAt = performance.now();
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
    void g;
  }
  _onPointerMove(e) {
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const thr = p.type === 'touch' ? TAP_MOVE_TOUCH : TAP_MOVE;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > thr) p.moved = true;
    if (!p.moved) return;
    const g = this.game;
    if (this._ptrs.size >= 2) { this._updateGesture(); return; }
    if (g.mode === 'command') {
      this.dragging = true;
      if (p.type === 'mouse' && (p.button === 2 || p.button === 1)) { this._twist += dx * 0.006; this._tilt += dy * 0.004; }
      else { this._pan.x += dx; this._pan.y += dy; }
    } else if (!this.locked && !g.isTouch && p.type === 'mouse') {
      // explore mode without pointer lock: drag to look
      this._look.x += dx; this._look.y += dy;
      this.dragging = true;
    }
  }
  _onPointerUp(e, cancelled = false) {
    const p = this._ptrs.get(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (!p) return;
    this._ptrs.delete(e.pointerId);
    if (this._ptrs.size < 2) this._gesture = null;
    if (this._ptrs.size === 0) this.dragging = false;
    if (cancelled) return;
    const g = this.game;
    const isTap = !p.moved && performance.now() - p.t < TAP_TIME * (g.mode === 'command' ? 1.6 : 1);
    if (!isTap) return;
    if (p.type === 'mouse' && p.button !== 0) return;
    if (!g.running || g.paused) return;
    const handled = this.dispatchTap(e.clientX, e.clientY, e);
    if (!handled && g.mode === 'explore' && !g.isTouch && p.type === 'mouse') this.requestLock();
  }
  _startGesture() {
    const [a, b] = [...this._ptrs.values()];
    this._gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    this.dragging = true;
  }
  _updateGesture() {
    const gs = this._gesture; if (!gs) { this._startGesture(); return; }
    const [a, b] = [...this._ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    this._pinch *= d / gs.d;
    let da = ang - gs.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    this._twist += da;
    this._pan.x += cx - gs.cx; this._pan.y += cy - gs.cy;
    gs.d = d; gs.ang = ang; gs.cx = cx; gs.cy = cy;
  }
}

function clampMove(v) { return Math.max(-250, Math.min(250, v || 0)); }
function normWheel(e) {
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= innerHeight;
  return d;
}
