// Minimap: cached low-res terrain (top blocks) + live markers (buildings, villagers, zombies, player).
import { BLOCKS } from '../core/blocks.js';
import { h, BUILDING_TYPES } from './dom.js';

const NAME_COLORS = {
  grass: 0x5f9a3a, dirt: 0x7a5a3a, stone: 0x8b8b8b, cobblestone: 0x7c7c7c, sand: 0xd9c98f, gravel: 0x8a8280, water: 0x2f62b8,
  log: 0x6a4a2a, leaves: 0x3c7428, planks: 0xb08850, stone_bricks: 0x9a9a9a, coal_ore: 0x6a6a6a, iron_ore: 0x9a8a7a, gold_ore: 0xb0a060,
  crystal_ore: 0x9a70d0, glass: 0xbfe0ee, thatch: 0xc8a848, roof_tiles: 0xa44a3a, farmland: 0x5a3a20, wheat_0: 0x6a8a30, wheat_1: 0x7a9a30,
  wheat_2: 0xa0a038, wheat_3: 0xd0b040, torch: 0xffcc44, bedrock: 0x333333, tall_grass: 0x5f9a3a, flower_red: 0x5f9a3a, flower_yellow: 0x5f9a3a,
  spruce_log: 0x4a3420, spruce_leaves: 0x2c5530, lantern: 0xffd070, iron_block: 0xd0d0d0, workbench: 0xa07040, furnace: 0x707070,
  bookshelf: 0x8a6030, arcane_table: 0x7050b0, hay_bale: 0xd8b840, plaster: 0xe8e0d0, timber_frame: 0xb09070, mossy_cobble: 0x6a7a5a,
  dark_stone: 0x484852, path: 0xa88a5a, snow: 0xf2f4f8, palisade: 0x7a5a32, reinforced_wall: 0x6a6a7a, banner: 0xc03030,
  mushroom: 0x5f9a3a, dead_bush: 0xb09a60, birch_log: 0xd8d0c0, birch_leaves: 0x6a9a3a,
};
const COL = new Uint32Array(256);
const SKIP = new Uint8Array(256);   // look through (air, plants)
for (const b of BLOCKS) if (b) {
  COL[b.id] = NAME_COLORS[b.name] ?? 0x808080;
  if (b.id === 0 || (b.shape === 'cross' && !/wheat/.test(b.name))) SKIP[b.id] = 1;
}

export class Minimap {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.canvas = h('canvas.zc-minimap-cv');
    this.root = h('div.zc-minimap.ui-i', { title: 'Карта (нажмите, чтобы изменить масштаб)' },
      this.canvas, h('div.zc-minimap-frame'), h('span.zc-minimap-n', 'С'));
    this.root.addEventListener('pointerdown', (e) => this.onTap(e));
    this.terrain = document.createElement('canvas');
    this.world = null;
    this.dirtyCols = new Set();
    this.zoomed = true;
    this._t = 0; this._imgDirty = false;
    const bus = this.game.bus;
    bus.on('world:ready', () => this.rebuild());
    bus.on('world:loaded', () => this.rebuild());
    bus.on('block:changed', ({ x, z }) => { if (this.world) this.dirtyCols.add(x + z * this.world.size); });
  }

  rebuild() {
    const w = this.game.world; if (!w) return;
    this.world = w;
    const S = w.size;
    this.terrain.width = this.terrain.height = S;
    this.tctx = this.terrain.getContext('2d');
    this.img = this.tctx.createImageData(S, S);
    this.heights = new Int16Array(S * S);
    this.u32 = new Uint32Array(this.img.data.buffer);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) this.heights[x + z * S] = this._colHeight(x, z);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) this._shade(x, z);
    this.tctx.putImageData(this.img, 0, 0);
    this.dirtyCols.clear();
  }
  _colHeight(x, z) {
    const w = this.world, S = w.size, bl = w.blocks, H = w.height;
    for (let y = H - 1; y >= 0; y--) { const id = bl[x + S * (z + S * y)]; if (!SKIP[id]) return y; }
    return 0;
  }
  _shade(x, z) {
    const w = this.world, S = w.size, i = x + z * S;
    const y = this.heights[i];
    const id = w.blocks[x + S * (z + S * y)];
    let c = COL[id];
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (id === 7) {   // water: darker with depth
      let d = 0; for (let yy = y - 1; yy > 0 && d < 8 && w.blocks[x + S * (z + S * yy)] === 7; yy--) d++;
      const k = 1.1 - d * 0.07; r *= k; g *= k; b *= k;
    } else {
      const hw = x > 0 ? this.heights[i - 1] : y, hn = z > 0 ? this.heights[i - S] : y;
      const k = 1 + ((y - hw) + (y - hn)) * 0.07 + (y - 24) * 0.008;
      const kk = Math.max(0.6, Math.min(1.35, k));
      r *= kk; g *= kk; b *= kk;
    }
    r = r > 255 ? 255 : r | 0; g = g > 255 ? 255 : g | 0; b = b > 255 ? 255 : b | 0;
    this.u32[i] = (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian RGBA
  }

  onTap(e) {
    e.stopPropagation();
    const g = this.game;
    if (g.mode === 'command') {
      const rect = this.canvas.getBoundingClientRect();
      const v = this._view; if (!v) return;
      const wx = v.x0 + ((e.clientX - rect.left) / rect.width) * v.span;
      const wz = v.z0 + ((e.clientY - rect.top) / rect.height) * v.span;
      const rig = g.cameraRig;
      (rig?.focusOn || rig?.panTo || rig?.moveTo)?.call(rig, wx, wz);
      return;
    }
    this.zoomed = !this.zoomed;
    g.audio?.play?.('ui_click');
  }

  update(dt) {
    if (!this.world || this.world !== this.game.world) { if (this.game.world) this.rebuild(); else return; }
    this._t += dt;
    if (this.dirtyCols.size) {
      const S = this.world.size;
      let n = 0;
      for (const i of this.dirtyCols) {
        this.dirtyCols.delete(i);
        const x = i % S, z = (i / S) | 0;
        this.heights[i] = this._colHeight(x, z);
        this._shade(x, z);
        if (x + 1 < S) this._shade(x + 1, z);
        if (z + 1 < S) this._shade(x, z + 1);
        if (++n > 400) break;
      }
      this._imgDirty = true;
    }
    if (this._t < 0.1) return;
    this._t = 0;
    if (this._imgDirty) { this.tctx.putImageData(this.img, 0, 0); this._imgDirty = false; }
    this.draw();
  }

  draw() {
    const g = this.game, w = this.world, S = w.size;
    const cv = this.canvas;
    const css = cv.clientWidth || 160;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (cv.width !== px) { cv.width = cv.height = px; }
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    // view window
    const cmd = g.mode === 'command';
    const focus = cmd ? g.renderer.shadowFocus : g.player?.position;
    let span = Math.min(S, 200);        // big worlds: show the region around the village / player
    if (!cmd && this.zoomed) span = Math.min(S, 96);
    let x0 = 0, z0 = 0;
    if (span < S && focus) {
      x0 = Math.max(0, Math.min(S - span, focus.x - span / 2));
      z0 = Math.max(0, Math.min(S - span, focus.z - span / 2));
    }
    this._view = { x0, z0, span };
    const k = px / span;
    const mx = (wx) => (wx - x0) * k, mz = (wz) => (wz - z0) * k;
    x.fillStyle = '#10141c'; x.fillRect(0, 0, px, px);
    x.drawImage(this.terrain, x0, z0, span, span, 0, 0, px, px);
    // night tint
    const nf = g.state.nightFactor || 0;
    if (nf > 0.05) { x.fillStyle = `rgba(10,14,40,${(nf * 0.35).toFixed(3)})`; x.fillRect(0, 0, px, px); }

    const dot = Math.max(2, Math.round(dpr * (span < S ? 2.4 : 1.8)));
    // buildings
    for (const b of g.village?.buildings || []) {
      if (b.state === 'destroyed') continue;
      const c = this._bCenter(b);
      const t = BUILDING_TYPES[b.type];
      const sz = Math.max(dot * 2, ((t?.size?.[0] || 3) * k) * 0.7);
      const cx = mx(c.x), cz = mz(c.z);
      x.fillStyle = b.state === 'complete' ? (b.type === 'town_hall' ? '#ffd35a' : '#e0b050') : 'rgba(120,220,255,.75)';
      x.strokeStyle = '#1a1208'; x.lineWidth = Math.max(1, dpr);
      x.fillRect(cx - sz / 2, cz - sz / 2, sz, sz); x.strokeRect(cx - sz / 2, cz - sz / 2, sz, sz);
      if (b.type === 'town_hall') { x.fillStyle = '#c02a20'; x.fillRect(cx - sz * 0.15, cz - sz * 0.9, sz * 0.3, sz * 0.5); }
      if (b.hp != null && b.maxHp && b.hp < b.maxHp * 0.5 && b.state === 'complete') {
        x.strokeStyle = 'rgba(255,60,40,' + (0.5 + 0.5 * Math.sin(g.time * 8)).toFixed(2) + ')'; x.lineWidth = 2 * dpr; x.strokeRect(cx - sz / 2 - 2, cz - sz / 2 - 2, sz + 4, sz + 4);
      }
    }
    // entities
    const ents = g.entities?.list || [];
    for (const e of ents) {
      if (e.dead || e.kind === 'player' || e.kind === 'projectile') continue;
      const ex = mx(e.position.x), ez = mz(e.position.z);
      if (ex < -4 || ez < -4 || ex > px + 4 || ez > px + 4) continue;
      if (e.kind === 'zombie' || e.faction === 'undead') { x.fillStyle = '#ff3a2a'; x.strokeStyle = '#300'; }
      else if (e.kind === 'villager') { x.fillStyle = e.job === 'guard' ? '#7fe0ff' : '#ffffff'; x.strokeStyle = '#123'; }
      else continue;
      x.beginPath(); x.arc(ex, ez, dot, 0, Math.PI * 2); x.fill(); x.lineWidth = Math.max(1, dpr * 0.8); x.stroke();
    }
    // wave spawn directions
    const dirs = g.waves?.spawnDirections;
    if (dirs && dirs.length) {
      const pulse = 0.55 + 0.45 * Math.sin(g.time * 6);
      for (const d of dirs) {
        const v = this._dirVec(d, S); if (!v) continue;
        this._edgeArrow(x, px, v, pulse, dpr);
      }
    }
    // camera focus (command) / player arrow
    const p = g.player;
    if (cmd) {
      const f = g.renderer.shadowFocus;
      const vr = Math.max(8 * dpr, 24 * k);
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5 * dpr; x.setLineDash([4 * dpr, 3 * dpr]);
      x.strokeRect(mx(f.x) - vr, mz(f.z) - vr * 0.7, vr * 2, vr * 1.4); x.setLineDash([]);
    }
    if (p && !p.dead) {
      const d = this._camDir || (this._camDir = { x: 0, z: -1 });
      if (g.mode === 'explore') {
        const e = g.camera.matrixWorld.elements;   // camera looks along -Z
        const dx = -e[8], dz = -e[10], l = Math.hypot(dx, dz);
        if (l > 1e-3) { d.x = dx / l; d.z = dz / l; }
      }
      const ax = mx(p.position.x), az = mz(p.position.z);
      const r = Math.max(5, 4.5 * dpr);
      const ang = Math.atan2(d.z, d.x);
      x.save(); x.translate(ax, az); x.rotate(ang);
      x.beginPath(); x.moveTo(r * 1.5, 0); x.lineTo(-r, r * 0.95); x.lineTo(-r * 0.45, 0); x.lineTo(-r, -r * 0.95); x.closePath();
      x.fillStyle = '#fff6c8'; x.fill(); x.lineWidth = Math.max(1.2, dpr * 1.2); x.strokeStyle = '#1a1208'; x.stroke();
      x.restore();
    }
  }

  _bCenter(b) {
    if (b._mmC && b._mmN === (b.blocks?.length || 0)) return b._mmC;
    let c;
    if (b.center) c = { x: b.center.x, z: b.center.z };
    else if (b.blocks?.length) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const q of b.blocks) { const bx = q.x ?? (b.x + (q.dx || 0)), bz = q.z ?? (b.z + (q.dz || 0)); if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (bz < z0) z0 = bz; if (bz > z1) z1 = bz; }
      c = { x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2 };
    } else c = { x: (b.x ?? 0) + 0.5, z: (b.z ?? 0) + 0.5 };
    b._mmC = c; b._mmN = b.blocks?.length || 0;
    return c;
  }
  _dirVec(d, S) {
    let dx, dz;
    if (typeof d === 'number') { dx = Math.cos(d); dz = Math.sin(d); }
    else if (d && typeof d === 'object') {
      const vx = d.x ?? d.dx ?? d[0], vz = d.z ?? d.dz ?? d[1];
      if (vx == null || vz == null) { if (typeof d.angle === 'number') { dx = Math.cos(d.angle); dz = Math.sin(d.angle); } else return null; }
      else if (Math.abs(vx) <= 1.01 && Math.abs(vz) <= 1.01) { dx = vx; dz = vz; }
      else { dx = vx - S / 2; dz = vz - S / 2; }
    } else return null;
    const l = Math.hypot(dx, dz); if (l < 1e-6) return null;
    return { x: dx / l, z: dz / l };
  }
  _edgeArrow(x, px, v, pulse, dpr) {
    const c = px / 2, m = 9 * dpr;
    const t = Math.min((c - m) / Math.max(1e-6, Math.abs(v.x)), (c - m) / Math.max(1e-6, Math.abs(v.z)));
    const ex = c + v.x * t, ez = c + v.z * t;
    const ang = Math.atan2(v.z, v.x), s = 7 * dpr;
    x.save(); x.translate(ex, ez); x.rotate(ang);
    x.globalAlpha = pulse;
    x.beginPath(); x.moveTo(s, 0); x.lineTo(-s * 0.6, s * 0.8); x.lineTo(-s * 0.2, 0); x.lineTo(-s * 0.6, -s * 0.8); x.closePath();
    x.fillStyle = '#ff3020'; x.fill(); x.lineWidth = dpr; x.strokeStyle = '#2a0000'; x.stroke();
    x.restore(); x.globalAlpha = 1;
  }
}
