// Blueprints: the player frames something he built with the «Рамка» tool (two corners), and it is saved as a
// blueprint — a new building type in «Строительство → Чертежи» that the village's builders raise anywhere, block
// by block. Blueprints live in the browser (shared by all worlds, see the workshop) and travel with the save of a
// world that uses them.
import * as THREE from 'three';
import { B, BLOCKS } from '../core/blocks.js';
import { defineCustom } from '../village/buildings.js';
import { h } from '../ui/dom.js';

const KEY = 'zc_blueprints';
export const MAX_SIDE = 40, MAX_BLOCKS = 16000;

/** Compact text form of a blueprint (for the workshop): JSON with the blocks packed as base64 bytes. */
export function encodeBlueprint(bp) {
  const bytes = new Uint8Array(bp.blocks.length * 4);
  bp.blocks.forEach(([x, y, z, id], i) => { bytes[i * 4] = x; bytes[i * 4 + 1] = y; bytes[i * 4 + 2] = z; bytes[i * 4 + 3] = id; });
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'ZCBP1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ name: bp.name, w: bp.w, h: bp.h, d: bp.d, author: bp.author || '' })))) + ':' + btoa(bin);
}
export function decodeBlueprint(text) {
  const m = /ZCBP1:([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]*)/.exec(String(text || '').replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const head = JSON.parse(decodeURIComponent(escape(atob(m[1])))), bin = atob(m[2]), blocks = [];
    for (let i = 0; i + 3 < bin.length; i += 4) {
      const b = [bin.charCodeAt(i), bin.charCodeAt(i + 1), bin.charCodeAt(i + 2), bin.charCodeAt(i + 3)];
      if (BLOCKS[b[3]] && b[0] < head.w && b[2] < head.d && b[0] < MAX_SIDE && b[1] < MAX_SIDE && b[2] < MAX_SIDE) blocks.push(b);
    }
    if (!blocks.length || blocks.length > MAX_BLOCKS) return null;
    return { name: String(head.name || 'Чертёж').slice(0, 40), w: head.w | 0, h: head.h | 0, d: head.d | 0, author: String(head.author || '').slice(0, 40), blocks };
  } catch (e) { return null; }
}

export class Blueprints {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.a = null;            // first corner while framing
    try { this.list = JSON.parse(localStorage.getItem(KEY) || '[]').filter(b => b && b.id && b.blocks?.length); } catch (e) { this.list = []; }
    for (const bp of this.list) defineCustom(bp);
    this.box = null;
  }
  _store() { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch (e) { this.game.bus.emit('toast', { text: 'Не удалось сохранить чертёж: мало места', kind: 'bad' }); } }
  get(id) { return this.list.find(b => b.id === id) || null; }
  /** Adds a blueprint (from the frame or the workshop); returns its building type id. */
  add(bp) {
    bp = { ...bp, id: bp.id || (Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)) };
    this.list = this.list.filter(b => b.id !== bp.id);
    this.list.push(bp);
    this._store();
    const type = defineCustom(bp);
    this.game.bus.emit('blueprints:changed', {});
    return type;
  }
  remove(id) {
    const used = this.game.village?.buildings?.some(b => b.type === 'bp_' + id);
    this.list = this.list.filter(b => b.id !== id);
    this._store();
    this.game.bus.emit('blueprints:changed', { used });
  }
  /** Blueprints the village's buildings use (kept in the world's save). */
  forSave() {
    const used = new Set((this.game.village?.buildings || []).map(b => b.type).filter(t => t.startsWith('bp_')).map(t => t.slice(3)));
    return this.list.filter(b => used.has(b.id));
  }
  /** Loading a world: its blueprints become building types again (and join the player's collection). */
  restore(list) {
    if (!Array.isArray(list)) return;
    for (const bp of list) {
      if (!bp?.id || !bp.blocks?.length) continue;
      if (!this.get(bp.id)) { this.list.push(bp); this._store(); }
      defineCustom(bp);
    }
  }

  // ------------------------------------------------------------------ the frame tool
  /** Primary click with the frame: first corner, then the second one (then the save dialog). */
  click(block) {
    const g = this.game;
    if (!block) return;
    if (!this.a) {
      this.a = { x: block.x, y: block.y, z: block.z };
      g.bus.emit('toast', { text: 'Первый угол отмечен. Теперь — противоположный угол постройки (ПКМ — сброс). Нижний слой рамки станет фундаментом.', kind: 'info' });
      g.audio?.play?.('ui_click');
      return;
    }
    const a = this.a, b = { x: block.x, y: block.y, z: block.z };
    this.a = null;
    const box = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), z1: Math.max(a.z, b.z) };
    const w = box.x1 - box.x0 + 1, hh = box.y1 - box.y0 + 1, d = box.z1 - box.z0 + 1;
    if (w > MAX_SIDE || d > MAX_SIDE || hh > MAX_SIDE) { g.bus.emit('toast', { text: `Слишком большая рамка (${w}×${d}×${hh}). Предел — ${MAX_SIDE} блоков в каждую сторону`, kind: 'bad' }); return; }
    if (w < 2 || d < 2) { g.bus.emit('toast', { text: 'Рамка должна быть хотя бы 2×2', kind: 'bad' }); return; }
    const bp = this.capture(box);
    if (!bp.blocks.length) { g.bus.emit('toast', { text: 'В рамке нет блоков', kind: 'bad' }); return; }
    this._nameDialog(bp);
  }
  cancel() { if (this.a) { this.a = null; this.game.bus.emit('toast', { text: 'Рамка сброшена', kind: 'info' }); } }
  /** The blocks inside a box, in local coordinates. */
  capture({ x0, y0, z0, x1, y1, z1 }) {
    const wd = this.game.world, blocks = [];
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = wd.getBlock(x, y, z);
      if (!id || !BLOCKS[id] || BLOCKS[id].kinetic || (BLOCKS[id].placeable === false && id !== B.WATER)) continue;
      blocks.push([x - x0, y - y0, z - z0, id]);
    }
    let h = 0; for (const b of blocks) h = Math.max(h, b[1] + 1);
    return { name: '', w: x1 - x0 + 1, h, d: z1 - z0 + 1, blocks: blocks.slice(0, MAX_BLOCKS), author: this.game.net?.name || '' };
  }
  _nameDialog(bp) {
    const ui = this.game.ui; if (!ui) return;
    ui._unlockPointer?.(); this.game.input?.releasePointer?.();
    const input = h('input.zc-input.ui-i', { type: 'text', maxlength: '40', value: `Чертёж ${this.list.length + 1}`, placeholder: 'Название' });
    const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 220); };
    const save = () => {
      bp.name = (input.value || '').trim() || `Чертёж ${this.list.length + 1}`;
      this.add(bp);
      close();
      this.game.audio?.play?.('build_complete', { volume: 0.6 });
      this.game.bus.emit('toast', { text: `Чертёж «${bp.name}» сохранён: Строительство → Чертежи. Строители возведут его где угодно.`, kind: 'good' });
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
    const back = h('div.zc-dialog-back.ui-i', { onclick: (e) => { if (e.target === back) close(); } },
      h('div.zc-dialog.zc-panel.ornate',
        h('h3.zc-h', 'Новый чертёж'),
        h('p', `${bp.w}×${bp.d}, высота ${bp.h}, блоков: ${bp.blocks.length}`),
        input,
        h('div.zc-row.end',
          h('button.zc-btn.ghost.ui-i', { onclick: close }, h('span.zc-btn-lbl', 'Отмена')),
          h('button.zc-btn.primary.ui-i', { onclick: save }, h('span.zc-btn-lbl', 'Сохранить')))));
    ui.dialogLayer.appendChild(back);
    requestAnimationFrame(() => { back.classList.add('in'); input.focus(); input.select(); });
  }
  /** Per frame: the frame's outline from the first corner to the block under the cursor. */
  update() {
    const g = this.game, p = g.player;
    const on = !!(this.a && p && p.itemId === 'blueprint_frame' && g.mode === 'explore');
    if (!on) { if (this.box) this.box.visible = false; return; }
    if (!this.box) {
      this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x6fd0ff, depthTest: false, transparent: true }));
      this.box.renderOrder = 10;
      g.scene.add(this.box);
    }
    const t = p.target?.block || this.a, a = this.a;
    const x0 = Math.min(a.x, t.x), y0 = Math.min(a.y, t.y), z0 = Math.min(a.z, t.z);
    const sx = Math.abs(a.x - t.x) + 1, sy = Math.abs(a.y - t.y) + 1, sz = Math.abs(a.z - t.z) + 1;
    this.box.visible = true;
    this.box.scale.set(sx + 0.04, sy + 0.04, sz + 0.04);
    this.box.position.set(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2);
    this.box.material.color.setHex(sx > MAX_SIDE || sy > MAX_SIDE || sz > MAX_SIDE ? 0xff6050 : 0x6fd0ff);
  }
}
