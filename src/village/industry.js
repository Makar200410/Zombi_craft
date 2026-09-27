// Industry & electricity: the village power grid and self-running electric defences.
// Power is a single village-wide grid (no wires): power plants / reactors staffed by engineers burn
// fuel (coal / uranium) and produce energy; factories, searchlights, tesla towers, turrets, radar,
// computer centres and drone hubs draw it. When demand exceeds supply every consumer runs at
// supply / demand. Hacker zombies jam electric defences near them.
import * as THREE from 'three';

const JAM_R = 14;

export class Industry {
  constructor(village) {
    this.village = village;
    this.game = village.game;
    this.supply = 0; this.demand = 0; this.ratio = 1;
    this._cd = new Map();
    this.drones = new Map();       // hub building -> [drone]
    this._strikeT = 10;
  }

  /** Energy share available to consumers (0..1). */
  get powered() { return this.demand > 0 ? this.ratio : (this.supply > 0 ? 1 : 0); }
  /** A consumer works when the grid gives it at least 30%. */
  running(b) { return b.state === 'complete' && this.powered >= 0.3 && !this.jammed(b); }

  /** Once per second: recompute the grid, burn fuel. */
  tick(dt) {
    const v = this.village, st = this.game.state;
    let supply = 0, demand = 0, noFuel = null;
    for (const b of v.buildings) {
      if (b.state !== 'complete') continue;
      if (b.def.power) demand += b.def.power;
      if (!b.def.powerOut) continue;
      if (b.def.wonder) { supply += b.def.powerOut; continue; }
      const staff = b.workers.filter(w => !w.dead && w.job === 'engineer').length;
      if (!staff) continue;
      const fuel = b.def.fuel || 'coal', every = b.def.fuelEvery || 8;
      if ((st.resources[fuel] || 0) <= 0) { noFuel = fuel; continue; }
      b._fuelT = (b._fuelT || 0) + dt;
      if (b._fuelT >= every) { b._fuelT -= every; st.add(fuel, -1); }
      supply += b.def.powerOut * Math.min(1, staff / Math.min(2, b.jobSlots || 1)) * (b.levelWorkBonus || 1);
    }
    const wasShort = this.demand > 0 && this.ratio < 1;
    this.supply = Math.round(supply); this.demand = demand;
    this.ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    if (demand > 0 && this.ratio < 1 && !wasShort && this.game.time - (this._warnAt || -1e9) > 60) {
      this._warnAt = this.game.time;
      v.toast(noFuel ? `Нет топлива (${noFuel === 'uranium' ? 'уран' : 'уголь'}) — станции стоят` : supply > 0 ? 'Не хватает энергии: постройте ещё электростанцию или добавьте инженеров' : 'Нет энергии: станциям нужны инженеры и топливо', 'bad');
    }
  }

  /** Is an electric building jammed by a hacker nearby? */
  jammed(b) {
    const zs = this.village.zombies;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.dead || !z.T.jam) continue;
      const dx = z.position.x - b.center.x, dz = z.position.z - b.center.z;
      if (dx * dx + dz * dz < JAM_R * JAM_R) {
        if (this.game.time - (this._jamWarn ?? -1e9) > 30) { this._jamWarn = this.game.time; this.village.toast(`Хакер глушит «${b.def.name}» и электронику рядом! Убейте его`, 'bad'); }
        return true;
      }
    }
    return false;
  }

  /** Every frame: electric defences, drones, orbital strikes. */
  update(dt) {
    const v = this.village;
    for (const b of v.buildings) {
      if (b.type === 'drone_hub') { this._drones(b, dt); continue; }
      if (!v.zombies.length || b.state !== 'complete') continue;
      if (b.type === 'tesla_tower') this._tesla(b, dt);
      else if (b.type === 'searchlight') this._light(b);
      else if (b.type === 'turret') this._turret(b, dt);
      else if (b.type === 'cosmodrome') this._orbital(b, dt);
    }
    // drones of hubs that are gone
    for (const [hub, list] of this.drones) if (!v.buildings.includes(hub)) { for (const d of list) d.mesh.parent?.remove(d.mesh); this.drones.delete(hub); }
  }

  get rangeMul() { const v = this.village; return (v.hasWonder('arsenal') ? 1.25 : 1) * (this.radarOn ? 1.1 : 1); }
  get dmgMul() { const v = this.village; return (v.hasWonder('colossus') ? 1.25 : 1) * (v.hasWonder('eiffel_tower') ? 1.15 : 1); }
  get radarOn() { const r = this.village.buildings.find(b => b.type === 'radar'); return !!r && this.running(r); }

  _src(b) {
    if (!b._src) {
      const t = b.points.top?.[0] || { x: b.center.x, y: b.y + b.height, z: b.center.z };
      const top = new THREE.Vector3(t.x, t.y + 0.5, t.z);
      b._src = { kind: 'tower', faction: 'village', id: -100 - b.id, name: b.def.name, eye: top, position: top, center: top, velocity: new THREE.Vector3(), dead: false, cooldowns: {} };
    }
    return b._src;
  }
  _ready(key, dt) {
    const cd = (this._cd.get(key) || 0) - dt;
    this._cd.set(key, cd);
    return cd <= 0;
  }

  _tesla(b, dt) {
    if (!this._ready(b, dt) || !this.running(b)) return;
    const src = this._src(b), v = this.village;
    const range = 20 * this.rangeMul;
    const z = v.nearestZombie(src.position, range, true);
    if (!z) { this._cd.set(b, 0.3); return; }
    const dmg = 26 * (b.levelWorkBonus || 1) * this.dmgMul;
    const dir = new THREE.Vector3().subVectors(z.center, src.position).normalize();
    try { this.game.combat?.lightning(src, src.position, dir, { damage: dmg, chain: 5, range: range + 4 }); } catch (e) { z.damage(dmg, src, { kind: 'storm' }); }
    this._cd.set(b, 1.6 / this.powered);
  }

  _turret(b, dt) {
    if (!this._ready(b, dt) || !this.running(b)) return;
    const src = this._src(b), v = this.village;
    const z = v.nearestZombie(src.position, 28 * this.rangeMul, true);
    if (!z) { this._cd.set(b, 0.25); return; }
    v.shoot(src, z, 'bullet', 16 * (b.levelWorkBonus || 1) * this.dmgMul);
    this._cd.set(b, 0.35 / this.powered);
  }

  _light(b) {
    if (!this.running(b)) return;
    const src = this._src(b), R = 22;
    for (const z of this.village.zombies) {
      if (z.dead) continue;
      const dx = z.position.x - src.position.x, dz = z.position.z - src.position.z;
      if (dx * dx + dz * dz < R * R) z.slowTimer = Math.max(z.slowTimer || 0, 0.4);
    }
  }

  /** Cosmodrome: at night an orbital strike hits the densest pack of undead. */
  _orbital(b, dt) {
    if (!this.game.state.isNight) return;
    this._strikeT -= dt;
    if (this._strikeT > 0) return;
    this._strikeT = 25;
    const zs = this.village.zombies.filter(z => !z.dead);
    if (!zs.length) return;
    let best = zs[0], bn = 0;
    for (const z of zs) {
      let n = 0;
      for (const o of zs) if (Math.abs(o.position.x - z.position.x) < 6 && Math.abs(o.position.z - z.position.z) < 6) n++;
      if (n > bn) { bn = n; best = z; }
    }
    const src = this._src(b);
    try { this.game.combat?.meteor(src, best.position.clone(), { damage: 120 * this.dmgMul, splash: 7, breakBlocks: false }); }
    catch (e) { for (const o of zs) if (o.position.distanceTo(best.position) < 7) o.damage(120, src, { kind: 'fire' }); }
    this.village.toast('Орбитальный удар!', 'info');
  }

  // ---- drones
  _drones(hub, dt) {
    const v = this.village, g = this.game;
    let list = this.drones.get(hub);
    const want = hub.state === 'complete' ? 3 + (v.hasWonder('global_network') ? 2 : 0) : 0;
    if (!list) { list = []; this.drones.set(hub, list); }
    while (list.length < want) list.push(this._makeDrone(hub, list.length));
    while (list.length > want) { const d = list.pop(); d.mesh.parent?.remove(d.mesh); }
    if (!list.length) return;
    const on = this.running(hub);
    const home = this._src(hub).position;
    const range = 45 * this.rangeMul;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.t += dt;
      let tx, ty, tz, target = null;
      if (on) target = v.nearestZombie(home, range, false);
      if (target) {
        const a = d.t * 1.3 + i * 2.1;
        tx = target.position.x + Math.cos(a) * 5; tz = target.position.z + Math.sin(a) * 5; ty = target.position.y + 6;
      } else if (on) {
        const a = d.t * 0.5 + i * (Math.PI * 2 / list.length);
        tx = home.x + Math.cos(a) * 9; tz = home.z + Math.sin(a) * 9; ty = home.y + 7;
      } else { tx = home.x + (i - 1) * 1.2; ty = home.y + 0.3; tz = home.z; }
      const p = d.mesh.position;
      const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, l = Math.hypot(dx, dy, dz);
      const step = Math.min(l, 10 * dt);
      if (l > 0.01) p.set(p.x + dx / l * step, p.y + dy / l * step, p.z + dz / l * step);
      d.mesh.rotation.y += dt * 2;
      for (const r of d.rotors) r.rotation.y += dt * 40;
      d.cd -= dt;
      if (target && d.cd <= 0 && p.distanceTo(target.position) < 16) {
        d.cd = 0.7;
        d.src.eye.copy(p); d.src.position.copy(p);
        v.shoot(d.src, target, 'bullet', 12 * this.dmgMul);
      }
    }
  }
  _makeDrone(hub, i) {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2e36 }), light = new THREE.MeshLambertMaterial({ color: 0xd8dde4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), light); g.add(body);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0x40d0ff }));
    eye.position.set(0, -0.02, 0.29); g.add(eye);
    const rotors = [];
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), dark); arm.position.set(x, 0.06, z); g.add(arm);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.06), dark); r.position.set(x, 0.12, z); g.add(r); rotors.push(r);
    }
    const home = this._src(hub).position;
    g.position.set(home.x + (i - 1) * 1.2, home.y + 0.3, home.z);
    this.game.scene.add(g);
    const pos = g.position.clone();
    return { mesh: g, rotors, t: Math.random() * 10, cd: Math.random(), src: { kind: 'tower', faction: 'village', id: -500 - hub.id * 10 - i, name: 'Дрон', eye: pos.clone(), position: pos.clone(), center: pos, velocity: new THREE.Vector3(), dead: false, cooldowns: {} } };
  }
  dispose() { for (const list of this.drones.values()) for (const d of list) d.mesh.parent?.remove(d.mesh); this.drones.clear(); }
}
