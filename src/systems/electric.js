// Electricity and automatic defences, built block by block by the player.
//   sources:   dynamo (turned by a mechanism network, see kinetics.js), solar panel (by day, under the open sky);
//   storage:   battery — charges from the surplus, feeds the defences at night;
//   wires:     copper cable; a switch (right-click) closes or breaks the circuit;
//   consumers: electric turret (shoots the dead), floodlight (lights up at night and dazzles zombies), automatic gate
//              (closes by itself when the dead come near, opens for the living), electric fence (shocks what touches it).
// Blocks touching each other form a circuit. Each tick the circuit's sources and batteries cover its demand; with less
// than half of it the defences stop. The host runs the circuits; everyone sees the blocks change.
import * as THREE from 'three';
import { B, BLOCKS } from '../core/blocks.js';
import { worldUniforms } from '../render/chunkMaterials.js';

const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TICK = 0.25;
const BATTERY = 600;          // energy a battery holds
const VIEW = 72;

// demand of consumers (energy a second): idle / working
const USE = {
  [B.E_TURRET]: [0.3, 3], [B.FLOODLIGHT]: [0, 1], [B.FLOODLIGHT_ON]: [0, 1],
  [B.GATE_CLOSED]: [0.2, 0.2], [B.GATE_OPEN]: [0.2, 0.2], [B.ELECTRIC_FENCE]: [0.05, 0.6],
};
export const ELEC_HELP = {
  [B.CABLE]: 'Медный кабель: соединяет источники, аккумуляторы и потребителей в одну цепь.',
  [B.DYNAMO]: 'Динамо-машина: превращает вращение механизмов в ток (до 8 ед/с при 64 об/мин). Ставьте рядом с валом. Нагрузка 4.',
  [B.SOLAR_PANEL]: 'Солнечная панель: днём под открытым небом даёт 2,5 ед/с.',
  [B.BATTERY]: `Аккумулятор: копит излишек (до ${BATTERY} ед.) и отдаёт его ночью.`,
  [B.SWITCH_OFF]: 'Рубильник: ПКМ — замкнуть или разомкнуть цепь.',
  [B.E_TURRET]: 'Электротурель: сама стреляет по нежити в 24 блоках. Ест 3 ед/с в бою.',
  [B.FLOODLIGHT]: 'Прожектор: ночью и в темноте светит и ослепляет зомби вокруг (они замедляются). 1 ед/с.',
  [B.GATE_CLOSED]: 'Автоворота: смежные блоки ворот закрываются сами, когда рядом нежить, и открываются для жителей и вас.',
  [B.ELECTRIC_FENCE]: 'Электрозабор: бьёт током и отбрасывает зомби, которые его касаются.',
};

export class Electric {
  constructor(game) {
    this.game = game;
    this.nodes = new Map();     // world index -> {x, y, z, id, net}
    this.nets = [];
    this.charge = new Map();    // battery index -> stored energy
    this.dirty = true;
    this.t = 0;
    this.view = null;
    const bus = game.bus;
    bus.on('block:changed', ({ x, y, z, id, prev }) => {
      if (!BLOCKS[id]?.electric && !BLOCKS[prev]?.electric) return;
      const i = this.game.world.index(x, y, z);
      if (BLOCKS[id]?.electric) { const n = this.nodes.get(i); if (n) n.id = id; else this.nodes.set(i, { x, y, z, id }); }
      else { this.nodes.delete(i); if (!this._swap) this.charge.delete(i); }
      // a block turning on / off (lamp, gate) keeps its circuit; anything else rebuilds them
      if (!this._swap) this.dirty = true;
    });
    bus.on('game:begin', ({ loaded } = {}) => { if (!loaded) this.charge.clear(); this._scan(); });
  }
  _scan() {
    this.nodes.clear();
    const w = this.game.world, ch = w?.changes;
    if (ch) {
      const S = w.size;
      for (const [i, id] of ch) if (BLOCKS[id]?.electric) this.nodes.set(i, { x: i % S, y: Math.floor(i / (S * S)), z: Math.floor(i / S) % S, id });
    }
    this.dirty = true;
  }
  serialize() { return { charge: [...this.charge].map(([i, c]) => [i, Math.round(c)]) }; }
  deserialize(o) { this.charge = new Map(o?.charge || []); }

  _rebuild() {
    this.dirty = false;
    const w = this.game.world;
    for (const n of this.nodes.values()) n.net = null;
    this.nets = [];
    for (const start of this.nodes.values()) {
      if (start.net || start.id === B.SWITCH_OFF) continue;
      const net = { nodes: [], sources: [], batteries: [], users: [], gates: [], supply: 0, demand: 0, ratio: 0, stored: 0, cap: 0 };
      const stack = [start]; start.net = net;
      while (stack.length) {
        const n = stack.pop();
        net.nodes.push(n);
        const role = BLOCKS[n.id].electric;
        if (role === 'source') net.sources.push(n); else if (role === 'store') net.batteries.push(n); else if (role === 'use') net.users.push(n);
        for (const [dx, dy, dz] of DIR6) {
          const m = this.nodes.get(w.index(n.x + dx, n.y + dy, n.z + dz));
          if (!m || m.net || m.id === B.SWITCH_OFF) continue;
          m.net = net; stack.push(m);
        }
      }
      // gate leaves: touching gate blocks open and close together
      const seen = new Set();
      for (const g of net.users) {
        if (!this._isGate(g.id) || seen.has(g)) continue;
        const leaf = [], st = [g]; seen.add(g);
        while (st.length) {
          const n = st.pop(); leaf.push(n);
          for (const [dx, dy, dz] of DIR6) { const m = this.nodes.get(w.index(n.x + dx, n.y + dy, n.z + dz)); if (m && this._isGate(m.id) && !seen.has(m)) { seen.add(m); st.push(m); } }
        }
        net.gates.push(leaf);
      }
      this.nets.push(net);
    }
    this.view?.invalidate();
  }
  _isGate(id) { return id === B.GATE_CLOSED || id === B.GATE_OPEN; }

  /** Energy a second a source gives right now. */
  _output(n) {
    const g = this.game, w = g.world;
    if (n.id === B.DYNAMO) {
      const k = g.kinetics?.nodes.get(w.index(n.x, n.y, n.z));
      return k?.net?.rpm > 0 ? 8 * Math.min(2, k.net.rpm / 64) : 0;
    }
    if (n.id === B.SOLAR_PANEL) {
      const t = g.state.timeOfDay, day = t > 0.27 && t < 0.73 ? Math.sin((t - 0.25) / 0.5 * Math.PI) : 0;
      if (!day || (w.getLight(n.x, n.y + 1, n.z) >> 4) < 15) return 0;
      return 2.5 * day * (1 - (g.weather?.cloud || 0) * 0.5);
    }
    return 0;
  }

  update(dt) {
    const g = this.game;
    if (!g.world || !g.running) return;
    if (this.dirty) this._rebuild();
    if (!g.net?.isClient) {
      this.t += dt;
      if (this.t >= TICK) { const step = this.t; this.t = 0; this._tick(step); }
      this._defend(dt);
    }
    if (g.renderer?.scene && this.nodes.size) { if (!this.view) this.view = new ElectricView(this); this.view.update(dt); }
  }

  _tick(dt) {
    const g = this.game;
    const night = g.state.isNight;
    for (const net of this.nets) {
      let supply = 0;
      for (const s of net.sources) supply += this._output(s);
      let demand = 0;
      for (const u of net.users) { const d = USE[u.id]; if (!d) continue; demand += (u.busy || (u.busyUntil || 0) > g.time) ? d[1] : (u.id === B.FLOODLIGHT || u.id === B.FLOODLIGHT_ON) ? (this._wantLight(u) ? d[1] : 0) : d[0]; }
      // batteries cover the gap or take the surplus
      let stored = 0;
      for (const b of net.batteries) stored += this.charge.get(this.game.world.index(b.x, b.y, b.z)) || 0;
      const cap = net.batteries.length * BATTERY;
      let got = supply;
      const delta = (supply - demand) * dt;
      if (delta >= 0) stored = Math.min(cap, stored + delta);
      else { const take = Math.min(stored, -delta); stored -= take; got += take / dt; }
      for (const b of net.batteries) this.charge.set(g.world.index(b.x, b.y, b.z), net.batteries.length ? stored / net.batteries.length : 0);
      net.supply = supply; net.demand = demand; net.stored = stored; net.cap = cap;
      net.ratio = demand > 0 ? Math.min(1, got / demand) : (supply > 0 || stored > 0 ? 1 : 0);
      net.on = net.ratio >= 0.5;
      // lamps and gates follow the circuit
      for (const u of net.users) {
        if (u.id === B.FLOODLIGHT || u.id === B.FLOODLIGHT_ON) this._swapTo(u, net.on && this._wantLight(u) ? B.FLOODLIGHT_ON : B.FLOODLIGHT);
      }
      for (const leaf of net.gates) this._gate(leaf, net.on, night);
    }
  }
  _wantLight(u) {
    const g = this.game;
    if (g.state.isNight) return true;
    return (g.world.getLight(u.x, u.y + 1, u.z) >> 4) < 8;        // dark underground
  }
  _swapTo(n, id) {
    if (n.id === id) return;
    this._swap = true;
    try { this.game.world.setBlock(n.x, n.y, n.z, id); } finally { this._swap = false; }
    n.id = id;
  }
  /** A gate leaf closes when the dead come near and opens for the living (if the circuit has power). */
  _gate(leaf, on, night) {
    if (!on) return;
    const g = this.game;
    let cx = 0, cy = 0, cz = 0;
    for (const n of leaf) { cx += n.x; cy += n.y; cz += n.z; }
    const c = { x: cx / leaf.length + 0.5, y: cy / leaf.length + 0.5, z: cz / leaf.length + 0.5 };
    const near = (e, r) => Math.hypot(e.position.x - c.x, e.position.z - c.z) < r && Math.abs(e.position.y - c.y) < 8;
    const threat = (g.village?.zombies || []).some(z => !z.dead && near(z, night ? 14 : 10));
    let friend = false;
    if (!threat) {
      const p = g.player;
      if (p && !p.dead && near(p, 5)) friend = true;
      if (!friend) for (const v of g.village?.villagers || []) if (!v.dead && near(v, 4)) { friend = true; break; }
    }
    const want = threat ? B.GATE_CLOSED : friend ? B.GATE_OPEN : B.GATE_CLOSED;
    if (leaf[0].id === want) return;
    // never shut a gate on someone standing in it
    if (want === B.GATE_CLOSED) for (const n of leaf) for (const e of g.entities.query({ x: n.x + 0.5, y: n.y + 0.5, z: n.z + 0.5 }, 1.2)) if (e.kind !== 'projectile' && !e.dead && e.faction === 'village') return;
    for (const n of leaf) this._swapTo(n, want);
    g.audio?.play('hammer', { pos: c, volume: 0.4, pitch: want === B.GATE_OPEN ? 0.6 : 0.45 });
  }

  /** Every frame (host): turrets shoot, fences shock, floodlights dazzle. */
  _defend(dt) {
    const g = this.game, v = g.village, w = g.world;
    if (!v || !this.nets.length) return;
    const zs = v.zombies;
    for (const net of this.nets) {
      if (!net.on) { for (const u of net.users) u.busy = false; continue; }
      for (const u of net.users) {
        if (u.id === B.E_TURRET) {
          u.cd = (u.cd || 0) - dt;
          if (u.cd > 0) continue;
          const src = this._src(u);
          const z = zs.length ? v.nearestZombie(src.position, 24, true) : null;
          u.busy = !!z; u.aim = z ? z.center || z.position : null;
          if (!z) { u.cd = 0.3; continue; }
          v.shoot(src, z, 'bullet', 11);
          u.cd = 0.45 / net.ratio;
          u.flash = 0.08;
        } else if (u.id === B.FLOODLIGHT_ON) {
          for (const z of zs) {
            if (z.dead) continue;
            const dx = z.position.x - u.x, dz = z.position.z - u.z;
            if (dx * dx + dz * dz < 18 * 18) z.slowTimer = Math.max(z.slowTimer || 0, 0.4);
          }
        }
      }
    }
    // electric fences: whatever undead touches a live one is shocked and thrown back
    this._fenceT = (this._fenceT || 0) - dt;
    if (this._fenceT > 0) return;
    this._fenceT = 0.2;
    for (const z of zs) {
      if (z.dead) continue;
      const p = z.position;
      for (let dy = 0; dy <= 1; dy++) for (const [dx, , dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 0, 0]]) {
        const x = Math.floor(p.x + dx * 0.55), y = Math.floor(p.y + 0.3 + dy), zz = Math.floor(p.z + dz * 0.55);
        if (w.getBlock(x, y, zz) !== B.ELECTRIC_FENCE) continue;
        const n = this.nodes.get(w.index(x, y, zz));
        if (!n?.net?.on) continue;
        n.busyUntil = g.time + 0.6;
        z.damage(6, this._src(n), { kind: 'storm' });
        const ax = p.x - (x + 0.5), az = p.z - (zz + 0.5), l = Math.hypot(ax, az) || 1;
        if (z.velocity) { z.velocity.x += ax / l * 7; z.velocity.z += az / l * 7; z.velocity.y = Math.max(z.velocity.y, 3); }
        g.particles?.emit?.({ pos: { x: x + 0.5, y: y + 0.5, z: zz + 0.5 }, box: 0.4, count: 6, colors: [0xfff3a0, 0x9fdcff], additive: true, speed: 3, gravity: 0, life: 0.25, size: 0.06 });
        dy = 2; break;
      }
    }
  }
  _src(n) {
    if (!n._src) {
      const top = new THREE.Vector3(n.x + 0.5, n.y + 1.1, n.z + 0.5);
      n._src = { kind: 'tower', faction: 'village', id: -5000 - (n.x * 7 + n.z * 13 + n.y) % 100000, name: BLOCKS[n.id].label, eye: top, position: top, center: top, velocity: new THREE.Vector3(), dead: false, cooldowns: {} };
    }
    return n._src;
  }

  /** Right-click: switches toggle; everything tells about its circuit. */
  interact(x, y, z) {
    const w = this.game.world, id = w.getBlock(x, y, z);
    if (id === B.SWITCH_OFF || id === B.SWITCH_ON) {
      w.setBlock(x, y, z, id === B.SWITCH_OFF ? B.SWITCH_ON : B.SWITCH_OFF);
      this.game.audio?.play('ui_click', { volume: 0.8, pitch: 0.6 });
      return id === B.SWITCH_OFF ? 'Рубильник включён: цепь замкнута' : 'Рубильник выключен: цепь разомкнута';
    }
    if (this.dirty) this._rebuild();
    const n = this.nodes.get(w.index(x, y, z));
    const help = ELEC_HELP[id] || ELEC_HELP[{ [B.FLOODLIGHT_ON]: B.FLOODLIGHT, [B.GATE_OPEN]: B.GATE_CLOSED }[id]] || '';
    const net = n?.net;
    if (!net) return help;
    const f = (v) => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
    let state = `выработка ${f(net.supply)}, потребление ${f(net.demand)} ед/с`;
    if (net.cap) state += `, заряд ${Math.round(net.stored)}/${net.cap}`;
    state += net.on ? ' — работает' : !net.sources.length && !net.cap ? ' — нет источника тока' : ' — не хватает тока';
    if (id === B.DYNAMO) state += this._output(n) ? '' : ' (динамо не крутится: подведите вал от источника вращения)';
    return `${help} Цепь: ${state}`;
  }
}

// ------------------------------------------------------------------ turrets (model blocks)
class ElectricView {
  constructor(sys) {
    this.sys = sys; this.game = sys.game;
    this.group = new THREE.Group(); this.group.name = 'electric';
    this.game.renderer.scene.add(this.group);
    this.parts = new Map();
    this.stale = true; this.checkT = 0;
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    this.mats = { base: m(0x5a5e66), head: m(0x8a8e96), dark: m(0x2a2c30), flash: new THREE.MeshBasicMaterial({ color: 0xffe080 }) };
  }
  invalidate() { this.stale = true; }
  _build(n) {
    const M = this.mats, root = new THREE.Group();
    root.position.set(n.x + 0.5, n.y, n.z + 0.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), M.base); base.position.y = 0.25; root.add(base);
    const yaw = new THREE.Group(); yaw.position.y = 0.62; root.add(yaw);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.56), M.head); yaw.add(head);
    const pitch = new THREE.Group(); yaw.add(pitch);
    for (const s of [-0.1, 0.1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), M.dark); b.rotation.x = Math.PI / 2; b.position.set(s, 0.02, 0.45); pitch.add(b); }
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), M.flash); fl.position.set(0, 0.02, 0.85); fl.visible = false; pitch.add(fl);
    return { obj: root, yaw, pitch, fl };
  }
  update(dt) {
    const g = this.game, cam = g.camera.position;
    this.checkT -= dt;
    if (this.stale || this.checkT <= 0) {
      this.checkT = 1; this.stale = false;
      const want = new Set();
      for (const n of this.sys.nodes.values()) if (n.id === B.E_TURRET && Math.abs(n.x - cam.x) < VIEW && Math.abs(n.z - cam.z) < VIEW && g.world.isGenerated(n.x, n.z)) want.add(n);
      for (const [n, p] of this.parts) if (!want.has(n)) { this.group.remove(p.obj); this.parts.delete(n); }
      for (const n of want) if (!this.parts.has(n)) { const p = this._build(n); this.parts.set(n, p); this.group.add(p.obj); }
      for (const [n, p] of this.parts) {
        const l = g.world.getLight(n.x, n.y + 1, n.z), sky = (l >> 4) / 15, blk = (l & 15) / 15;
        const v = Math.min(1.1, 0.12 + 0.88 * sky * sky * worldUniforms.uSkyLight.value + Math.pow(blk, 1.6) * 0.8);
        p.obj.traverse((o) => { if (o.isMesh && o.material !== this.mats.flash) { if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; o.userData.base = o.material.color.clone(); } o.material.color.copy(o.userData.base).multiplyScalar(v); } });
      }
    }
    for (const [n, p] of this.parts) {
      if (n.aim) {
        const dx = n.aim.x - (n.x + 0.5), dz = n.aim.z - (n.z + 0.5), dy = n.aim.y - (n.y + 0.62);
        const want = Math.atan2(dx, dz);
        let d = want - p.yaw.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw.rotation.y += d * Math.min(1, dt * 10);
        p.pitch.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.9;
      } else p.yaw.rotation.y += dt * 0.4;          // idle sweep
      if (n.flash > 0) { n.flash -= dt; p.fl.visible = true; } else p.fl.visible = false;
    }
  }
}
