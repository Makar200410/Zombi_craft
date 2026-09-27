// Industry & electricity: the village power grid and self-running electric defences.
// Power is a single village-wide grid (no wires): power plants staffed by engineers burn coal and
// produce energy; factories, searchlights and tesla towers draw it. When demand exceeds supply
// every consumer runs at supply / demand.
import * as THREE from 'three';

const COAL_EVERY = 8;          // seconds of full output per coal per plant

export class Industry {
  constructor(village) {
    this.village = village;
    this.game = village.game;
    this.supply = 0; this.demand = 0; this.ratio = 1;
    this._coalT = 0;
    this._teslaCd = new Map();
  }

  /** Energy share available to consumers (0..1). */
  get powered() { return this.demand > 0 ? this.ratio : (this.supply > 0 ? 1 : 0); }

  /** Once per second: recompute the grid, burn coal. */
  tick(dt) {
    const v = this.village, st = this.game.state;
    let supply = 0, demand = 0, plants = 0;
    for (const b of v.buildings) {
      if (b.state !== 'complete') continue;
      if (b.def.powerOut) {
        if (b.def.wonder) { supply += b.def.powerOut; continue; }
        const slots = b.jobSlots || 1;
        const staff = b.workers.filter(w => !w.dead && w.job === 'engineer').length;
        if (!staff) continue;
        plants++;
        supply += b.def.powerOut * Math.min(1, staff / Math.min(2, slots)) * (b.levelWorkBonus || 1);
      }
      if (b.def.power) demand += b.def.power;
    }
    // coal keeps the boilers burning
    if (plants > 0) {
      if ((st.resources.coal || 0) <= 0) supply = v.buildings.filter(b => b.def.wonder && b.def.powerOut && b.state === 'complete').reduce((n, b) => n + b.def.powerOut, 0);
      else {
        this._coalT += dt * plants;
        while (this._coalT >= COAL_EVERY && (st.resources.coal || 0) > 0) { this._coalT -= COAL_EVERY; st.add('coal', -1); }
      }
    }
    const wasShort = this.demand > 0 && this.ratio < 1;
    this.supply = Math.round(supply); this.demand = demand;
    this.ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    if (demand > 0 && this.ratio < 1 && !wasShort && this.game.time - (this._warnAt || -1e9) > 60) {
      this._warnAt = this.game.time;
      v.toast(supply > 0 ? 'Не хватает энергии: постройте ещё электростанцию или добавьте инженеров' : 'Нет энергии: электростанции нужны инженеры и уголь', 'bad');
    }
  }

  /** Every frame: electric defences. */
  update(dt) {
    const v = this.village;
    if (!v.zombies.length) return;
    const p = this.powered;
    for (const b of v.buildings) {
      if (b.state !== 'complete') continue;
      if (b.type === 'tesla_tower') this._tesla(b, dt, p);
      else if (b.type === 'searchlight') this._light(b, dt, p);
    }
  }

  _src(b) {
    if (!b._src) {
      const t = b.points.top?.[0] || { x: b.center.x, y: b.y + b.height, z: b.center.z };
      const top = new THREE.Vector3(t.x, t.y + 0.5, t.z);
      b._src = { kind: 'tower', faction: 'village', id: -100 - b.id, name: b.def.name, eye: top, position: top, center: top, velocity: new THREE.Vector3(), dead: false, cooldowns: {} };
    }
    return b._src;
  }

  _tesla(b, dt, p) {
    if (p < 0.3) return;
    let cd = (this._teslaCd.get(b) || 0) - dt;
    if (cd > 0) { this._teslaCd.set(b, cd); return; }
    const src = this._src(b), v = this.village;
    const range = 20 * (v.hasWonder('arsenal') ? 1.25 : 1);
    const z = v.nearestZombie(src.position, range, true);
    if (!z) { this._teslaCd.set(b, 0.3); return; }
    const dmg = 26 * (b.levelWorkBonus || 1) * (v.hasWonder('colossus') ? 1.25 : 1) * (v.hasWonder('eiffel_tower') ? 1.15 : 1);
    const dir = new THREE.Vector3().subVectors(z.center, src.position).normalize();
    try { this.game.combat?.lightning(src, src.position, dir, { damage: dmg, chain: 5, range: range + 4 }); } catch (e) { z.damage(dmg, src, { kind: 'storm' }); }
    this._teslaCd.set(b, 1.6 / p);
  }

  _light(b, dt, p) {
    if (p < 0.3) return;
    const src = this._src(b), R = 22;
    for (const z of this.village.zombies) {
      if (z.dead) continue;
      const dx = z.position.x - src.position.x, dz = z.position.z - src.position.z;
      if (dx * dx + dz * dz < R * R) z.slowTimer = Math.max(z.slowTimer || 0, 0.4);
    }
  }
}
