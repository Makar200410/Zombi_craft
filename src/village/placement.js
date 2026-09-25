// Build placement (command mode): a blueprint ghost follows the pointer, snaps to the grid, auto-levels,
// turns green/red. Tap confirms. Walls: tap start, tap end → a straight line of segments.
import * as THREE from 'three';
import { BUILDING_TYPES } from './buildings.js';
import { GhostLayer, makeRect, disposeObj } from './visuals.js';

export class Placement {
  constructor(village) {
    this.village = village;
    this.game = village.game;
    this.active = false;
    this.typeId = null;
    this.rot = 0;
    this.valid = false;
    this.reason = '';
    this.x = 0; this.z = 0; this.y = 0;
    this.lineStart = null;
    this.segments = [];
    this._pointer = null;
    this._dirty = false;
    this._key = '';
    this.good = null; this.bad = null; this.rect = null;
    this._onMove = (e) => { if (!this.active) return; if (e.pointerType === 'touch' && !this.game.isTouch) return; this._pointer = { x: e.clientX, y: e.clientY }; this._dirty = true; if (e.pointerType !== 'touch') this._hover = true; };
    this._onKey = (e) => {
      if (!this.active) return;
      if (e.code === 'KeyR') { this.rotate(); e.preventDefault?.(); }
      else if (e.code === 'Escape') { this.cancel(); }
    };
    this._onContext = (e) => { if (this.active) { e.preventDefault(); this.cancel(); } };
  }
  init() {
    addEventListener('pointermove', this._onMove, { passive: true });
    addEventListener('keydown', this._onKey);
    addEventListener('contextmenu', this._onContext);
  }
  get def() { return BUILDING_TYPES[this.typeId]; }

  begin(typeId) {
    const def = BUILDING_TYPES[typeId];
    if (!def) return false;
    const chk = this.village.canPlace(typeId);
    if (!chk.ok && chk.hard) { this.village.toast(chk.reason, 'bad'); return false; }
    if (this.active) this._clearVisuals();
    this.active = true;
    this.typeId = typeId;
    this.lineStart = null;
    this.segments = [];
    if (!this.good) {
      this.good = new GhostLayer(this.game, { tint: 0x5dff7a, opacity: 0.45 });
      this.bad = new GhostLayer(this.game, { tint: 0xff4a3a, opacity: 0.45 });
    }
    // start at the screen centre (touch users then tap to move it)
    this._pointer = this._pointer || { x: innerWidth / 2, y: innerHeight / 2 };
    if (this.game.isTouch) this._pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    this._key = '';
    this._dirty = true;
    this.refresh(true);
    this.emit();
    return true;
  }
  rotate() {
    if (!this.active) return;
    this.rot = (this.rot + 1) & 3;
    this._key = '';
    this._dirty = true;
    this.refresh(true);
    this.game.audio?.play('ui_click', { volume: 0.4 });
  }
  cancel() {
    if (!this.active) return;
    this.active = false;
    this.typeId = null;
    this.lineStart = null;
    this._clearVisuals();
    this.emit();
  }
  _clearVisuals() {
    this.good?.clear(); this.bad?.clear();
    if (this.rect) { disposeObj(this.rect); this.rect = null; }
  }
  emit() {
    this.game.bus.emit('placement:changed', { active: this.active, typeId: this.typeId, valid: this.valid, reason: this.reason, rot: this.rot, line: !!(this.def && this.def.line), lineStarted: !!this.lineStart });
  }

  /** cell under a screen point */
  pickCell(sx, sy) {
    const pk = this.game.pickScreen(sx, sy, 400);
    if (!pk || !pk.hit) {
      // fall back to intersecting the village ground plane
      const ray = pk && pk.ray;
      if (!ray) return null;
      const gy = (this.village.townHall ? this.village.townHall.y : 25) + 1;
      if (Math.abs(ray.direction.y) < 1e-4) return null;
      const t = (gy - ray.origin.y) / ray.direction.y;
      if (t < 0) return null;
      return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
    }
    const h = pk.hit;
    return { x: h.x + 0.5 + (h.ny === 1 ? 0 : h.nx * 0.5), z: h.z + 0.5 + (h.ny === 1 ? 0 : h.nz * 0.5), hit: h };
  }

  update(dt) {
    if (!this.active) return;
    this.good?.update(this.game.time); this.bad?.update(this.game.time);
    if (this._dirty) { this._dirty = false; this.refresh(); }
    else if ((this._t = (this._t || 0) + dt) > 0.5) { this._t = 0; this.refresh(true); }   // resources may change
  }

  refresh(force = false) {
    if (!this.active || !this._pointer) return;
    const c = this.pickCell(this._pointer.x, this._pointer.y);
    if (!c) return;
    const def = this.def;
    const L = def.layout(this.rot);
    const x0 = Math.round(c.x - L.w / 2), z0 = Math.round(c.z - L.d / 2);
    const key = x0 + ',' + z0 + ',' + this.rot + ',' + (this.lineStart ? this.lineStart.x + ':' + this.lineStart.z : '');
    if (key === this._key && !force) return;
    this._key = key;
    this.x = x0; this.z = z0;
    const V = this.village;
    if (def.line) {
      const cells = this.lineStart ? lineCells(this.lineStart.x, this.lineStart.z, x0, z0) : [{ x: x0, z: z0 }];
      const goodBlocks = [], badBlocks = [];
      let affordable = V.game.state.resources, n = 0, anyOk = false;
      const budget = { ...affordable };
      this.segments = [];
      const claimed = new Set();
      for (const cell of cells) {
        const variant = (cell.x + cell.z) & 1;
        const site = V.checkSite(this.typeId, cell.x, cell.z, 0, { claimed });
        let ok = site.ok;
        if (ok) { for (const k in def.cost) if ((budget[k] || 0) < def.cost[k]) ok = false; }
        if (ok) { for (const k in def.cost) budget[k] -= def.cost[k]; claimed.add(cell.x + ',' + cell.z); anyOk = true; n++; }
        this.segments.push({ x: cell.x, z: cell.z, y: site.y, ok, variant });
        const list = ok ? goodBlocks : badBlocks;
        for (const b of def.blueprint(0, variant)) list.push({ x: cell.x + b.dx, y: site.y + b.dy, z: cell.z + b.dz, id: b.id });
      }
      this.good.set(goodBlocks); this.bad.set(badBlocks);
      this.valid = anyOk;
      this.reason = anyOk ? '' : (cells.length ? V.checkSite(this.typeId, cells[0].x, cells[0].z, 0).reason || 'Не хватает ресурсов' : '');
      this.y = this.segments[0] ? this.segments[0].y : 0;
      if (this.rect) { disposeObj(this.rect); this.rect = null; }
      void n;
    } else {
      const variant = V.variantFor(this.typeId, x0, z0);
      const site = V.checkSite(this.typeId, x0, z0, this.rot);
      let ok = site.ok, reason = site.reason;
      if (ok && !V.game.state.canAfford(def.cost)) { ok = false; reason = 'Не хватает ресурсов'; }
      this.valid = ok; this.reason = reason || '';
      this.y = site.y;
      const blocks = def.blueprint(this.rot, variant).map(b => ({ x: x0 + b.dx, y: site.y + b.dy, z: z0 + b.dz, id: b.id }));
      (ok ? this.good : this.bad).set(blocks);
      (ok ? this.bad : this.good).clear();
      if (this.rect) disposeObj(this.rect);
      this.rect = makeRect(L.w, L.d, ok ? 0x5dff7a : 0xff4a3a, 0.14);
      this.rect.position.set(x0, site.y + 1.03, z0);
      // front arrow (door side)
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), this.rect.userData.mat);
      const f = [[0, 1], [-1, 0], [0, -1], [1, 0]][this.rot];
      arrow.position.set(L.w / 2 + f[0] * (L.w / 2 + 0.9), 0.1, L.d / 2 + f[1] * (L.d / 2 + 0.9));
      arrow.rotation.order = 'YXZ';
      arrow.rotation.set(Math.PI / 2, Math.atan2(f[0], f[1]), 0);
      this.rect.add(arrow);
      this.game.scene.add(this.rect);
    }
    this.emit();
  }

  /** Tap handler (priority 100). Returns true when consumed. */
  onTap(sx, sy) {
    if (!this.active || this.game.mode !== 'command') return false;
    const def = this.def;
    const c = this.pickCell(sx, sy);
    if (!c) return true;
    const prevKey = this._key;
    const L = def.layout(this.rot);
    const x0 = Math.round(c.x - L.w / 2), z0 = Math.round(c.z - L.d / 2);
    const sameSpot = Math.abs(x0 - this.x) <= 1 && Math.abs(z0 - this.z) <= 1;
    this._pointer = { x: sx, y: sy };
    if (def.line) {
      if (!this.lineStart) {
        this.refresh(true);
        const site = this.village.checkSite(this.typeId, x0, z0, 0);
        if (!site.ok) { this.village.toast(site.reason || 'Здесь строить нельзя', 'bad'); return true; }
        this.lineStart = { x: x0, z: z0 };
        this._key = '';
        this.refresh(true);
        return true;
      }
      this.refresh(true);
      return this.confirm();
    }
    // touch: first tap moves the ghost, a second tap on it confirms
    if (this.game.isTouch && !this._hover && (!sameSpot || !prevKey)) { this.refresh(true); return true; }
    this.refresh(true);
    return this.confirm();
  }

  /** Confirm at the current ghost position (also usable from a UI button). */
  confirm() {
    if (!this.active) return false;
    const V = this.village, def = this.def;
    if (def.line) {
      if (!this.lineStart) { this.lineStart = { x: this.x, z: this.z }; this.refresh(true); return true; }
      let placed = 0;
      for (const s of this.segments) {
        if (!s.ok) continue;
        if (V.placeBuilding(this.typeId, s.x, s.z, 0)) placed++;
      }
      if (placed) {
        this.game.audio?.play('place_block', { volume: 0.6 });
        const last = this.segments[this.segments.length - 1];
        this.lineStart = last ? { x: last.x, z: last.z } : null;   // chain the next line from here
      } else V.toast(this.reason || 'Здесь строить нельзя', 'bad');
      this._key = '';
      this.refresh(true);
      return true;
    }
    this.refresh(true);
    if (!this.valid) { V.toast(this.reason || 'Здесь строить нельзя', 'bad'); this.game.audio?.play('mana_empty', { volume: 0.4 }); return true; }
    const b = V.placeBuilding(this.typeId, this.x, this.z, this.rot);
    if (b) {
      this.game.audio?.play('place_block', { volume: 0.7 });
      const keep = this.game.input?.keys?.has?.('ShiftLeft') || this.game.input?.keys?.has?.('ShiftRight');
      if (!keep || !V.canPlace(this.typeId).ok) this.cancel();
      else { this._key = ''; this.refresh(true); }
    }
    return true;
  }
}

/** Straight line of cells (dominant axis). */
export function lineCells(x0, z0, x1, z1, max = 40) {
  const out = [];
  const dx = x1 - x0, dz = z1 - z0;
  if (Math.abs(dx) >= Math.abs(dz)) {
    const s = Math.sign(dx) || 1;
    for (let i = 0; i <= Math.abs(dx) && out.length < max; i++) out.push({ x: x0 + i * s, z: z0 });
  } else {
    const s = Math.sign(dz) || 1;
    for (let i = 0; i <= Math.abs(dz) && out.length < max; i++) out.push({ x: x0, z: z0 + i * s });
  }
  return out;
}
