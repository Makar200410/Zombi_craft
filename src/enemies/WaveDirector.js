// Nightly waves of the undead: composition, spawning from the blighted map edges, flow field upkeep,
// dawn cleanup, rewards, daytime wanderers and save/load.
import { Zombie } from './Zombie.js';
import { ZOMBIE_TYPES } from './zombieTypes.js';
import { countFor, weightsFor, introducedOn, BOSSES, HINTS, hpScale, dmgScale, eraOf } from './waveSchedule.js';
import { FlowField } from './flowfield.js';
import { EnemyProjectiles } from './fx.js';

const DIFF = {
  easy: { count: 0.7, hp: 0.85, dmg: 0.75, reward: 0.9 },
  normal: { count: 1, hp: 1, dmg: 1, reward: 1 },
  hard: { count: 1.4, hp: 1.2, dmg: 1.25, reward: 1.25 },
};
const GRID = 2;   // spatial hash cell size for separation queries

export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.zombies = [];
    this.currentWave = 0;
    this.waveActive = false;
    this.activeCount = 0;
    this.spawnDirections = [];
    this.queue = [];
    this.spawnT = 0;
    this.spawnInterval = 4;
    this.waveCount = 0;
    this.bonus = false;
    this.flow = new FlowField(game);
    this.projectiles = new EnemyProjectiles(game);
    this._grid = new Map();
    this._pathBudget = 3;
    this._wanderT = 30;
    this._ff = null;           // time-lapse to dusk (startWaveNow)
    this._rnd = Math.random;
  }

  get nextWaveIn() { return this.waveActive ? 0 : Math.max(0, this.game.state.secondsToDusk); }
  /** Zombies of the current wave still to defeat (alive + not yet spawned). */
  get remaining() { return this.activeCount + (this.waveActive ? this.queue.length : 0); }
  get maxAlive() { return this.game.quality === 'low' ? 25 : 45; }
  get diff() { return DIFF[this.game.state.difficulty] || DIFF.normal; }
  aliveCount() { let n = 0; for (const z of this.zombies) if (!z.dead) n++; return n; }

  init() {
    const bus = this.game.bus;
    bus.on('time:dusk', () => { if (this.game.running) this.startWave(); });
    bus.on('time:dawn', () => this._dawn());
    bus.on('block:changed', ({ x, z }) => this.flow.onBlockChanged(x, z));
    for (const ev of ['building:placed', 'building:completed', 'building:destroyed']) bus.on(ev, () => this.flow.invalidate());
    bus.on('world:ready', () => this._clearAll());
  }

  onNewGame() {
    this._clearAll();
    this.currentWave = 0;
    this.waveActive = false;
    this._wanderT = 40 + Math.random() * 30;
    this.flow.world = null;          // rebuild column table for the new world
    this.flow.recomputeNow();
  }

  _clearAll() {
    for (const z of this.zombies) if (!z.dead) { z.dead = true; z.removeAt = 0; }
    for (const e of [...(this.game.entities?.list || [])]) if (e.kind === 'zombie') this.game.entities.remove(e);
    this.zombies = [];
    this.queue = [];
    this.spawnDirections = [];
    this.activeCount = 0;
    this.waveActive = false;
    this.projectiles.clear();
    this._ff = null;
  }

  // ------------------------------------------------------------------ waves
  /** Composition of wave n: array of type ids (boss last). */
  compose(n) {
    const d = this.diff;
    const count = Math.min(170, Math.round(countFor(n) * d.count));
    const weights = weightsFor(n);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const out = [];
    // guarantee the newly introduced kinds show up
    for (const t of introducedOn(n)) out.push(t, t);
    while (out.length < count) {
      let r = Math.random() * total;
      for (const k in weights) { r -= weights[k]; if (r <= 0) { out.push(k); break; } }
      if (r > 0) out.push('walker');
    }
    for (let i = out.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
    // scripted bosses arrive mid-wave; past the finale: a necromancer every 5 waves, giants every 10
    const bosses = BOSSES[n] || (n > 50 ? [...(n % 5 === 0 ? ['necromancer'] : []), ...(n % 10 === 0 ? ['giant', 'giant'] : [])] : []);
    bosses.forEach((t, i) => out.splice(Math.floor(out.length * (0.4 + i * 0.08)), 0, t));
    return out;
  }

  startWave() {
    if (this.waveActive) return false;
    const game = this.game;
    this.currentWave++;
    const n = this.currentWave;
    const types = this.compose(n);
    // 1–3 attack directions
    const dirs = n < 2 ? 1 : n < 4 ? 1 + ((Math.random() * 2) | 0) : 2 + ((Math.random() * 2) | 0);
    this._makeDirections(dirs);
    this.queue = types.map((t) => ({ type: t, dir: (Math.random() * dirs) | 0 }));
    this.waveCount = types.length;
    this.waveActive = true;
    this.waveStartTime = game.time;
    const duration = Math.min(90, 55 + n * 3);
    // groups of 2–6 spaced across the duration
    const avgGroup = Math.min(6, 2.5 + n * 0.35);
    this.spawnInterval = duration / Math.max(1, types.length / avgGroup);
    this.groupSize = avgGroup;
    this.spawnT = 1.5;
    // budgeted recompute (spread over frames) — the first group needs ~1.5 s to rise anyway
    if (this.flow.version) this.flow._startJob(); else this.flow.recomputeNow();
    game.audio?.play('wave_horn', { volume: 1 });
    game.bus.emit('wave:start', { wave: n, count: types.length, directions: this.spawnDirections });
    game.bus.emit('toast', { text: `Волна ${n}! Нежить наступает`, kind: 'wave' });
    const era = eraOf(n);
    if (n === era.from) game.bus.emit('toast', { text: `Эпоха «${era.name}» — волны ${era.from}–${era.from + 9 > 50 && era.from <= 50 ? 50 : era.from + 9}`, kind: 'wave' });
    const fresh = introducedOn(n);
    if (fresh.length) game.bus.emit('toast', { text: 'Новые враги: ' + fresh.map(t => `${ZOMBIE_TYPES[t].name} (${HINTS[t]})`).join(', '), kind: 'bad' });
    if (BOSSES[n]) game.bus.emit('toast', { text: 'Боссы этой ночи: ' + BOSSES[n].map(t => ZOMBIE_TYPES[t].name).join(', '), kind: 'bad' });
    return true;
  }

  _makeDirections(dirs) {
    const S = this.game.world.size, c = S / 2;
    this.spawnDirections = [];
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < dirs; i++) {
      const angle = base + (i * Math.PI * 2) / dirs + (Math.random() - 0.5) * 0.8;
      const p = this._edgePoint(angle, 0);
      this.spawnDirections.push({ angle, x: p ? p.x : c + Math.cos(angle) * c * 0.9, z: p ? p.z : c + Math.sin(angle) * c * 0.9 });
    }
  }

  /** "Call the next wave early" — time-lapses to dusk, +50% reward. */
  startWaveNow() {
    const st = this.game.state;
    if (this.waveActive || st.isNight || this._ff) return false;
    this.bonus = true;
    this._ff = { rate: Math.max(0.01, (0.78 - st.timeOfDay)) / 2.5 };
    this.game.bus.emit('toast', { text: 'Вы призвали волну раньше! Награда +50%', kind: 'info' });
    return true;
  }

  _endWave() {
    const game = this.game, n = this.currentWave;
    this.waveActive = false;
    this.spawnDirections = [];
    const mul = this.diff.reward * (this.bonus ? 1.5 : 1);
    const gold = Math.round((4 + n * 3) * mul);
    const crystal = Math.floor((Math.floor(n / 3) + (n % 5 === 0 ? 2 : 0)) * mul);
    game.state.add('gold', gold);
    if (crystal) game.state.add('crystal', crystal);
    if (game.state.stats) game.state.stats.wavesSurvived = (game.state.stats.wavesSurvived || 0) + 1;
    this.bonus = false;
    game.audio?.play('wave_cleared', { volume: 1 });
    game.bus.emit('wave:end', { wave: n, count: this.waveCount, reward: { gold, crystal } });
    game.bus.emit('toast', { text: `Волна ${n}/50 отбита! +${gold} золота` + (crystal ? `, +${crystal} кристаллов` : ''), kind: 'good' });
    if (n === 50) {
      game.bus.emit('toast', { text: 'ПОБЕДА! Деревня выстояла все 50 волн. Дальше — бесконечная ночь…', kind: 'wave' });
      game.bus.emit('game:victory', { wave: n });
      game.audio?.play('build_complete', { volume: 1 });
    }
  }

  _dawn() {
    // the sun rises: every creature of the night is doomed
    this.queue = [];
    let i = 0;
    for (const z of this.zombies) if (!z.dead && !(z.wanderer && z.sunproof)) z.doom(0.2 + Math.random() * 5 + (i++ % 7) * 0.15);
  }

  // ------------------------------------------------------------------ spawning
  _edgePoint(angle, lateral) {
    const w = this.game.world, S = w.size, c = S / 2;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let tries = 0; tries < 10; tries++) {
      const margin = 5 + Math.random() * 8;
      // on big maps the dead rise from a ring ~90 blocks out (so they reach the village during the night),
      // on small maps from the blighted edge
      const edge = (c - margin) / Math.max(Math.abs(dx), Math.abs(dz));
      const t = Math.min(edge, 84 + Math.random() * 12);
      const lat = (lateral || 0) * (Math.random() * 2 - 1) * (1 + tries * 0.2);
      let x = c + dx * t - dz * lat, z = c + dz * t + dx * lat;
      x = Math.max(3, Math.min(S - 4, x)); z = Math.max(3, Math.min(S - 4, z));
      const p = this._standPoint(x, z);
      if (p) return p;
    }
    return null;
  }
  _standPoint(x, z) {
    const f = this.flow;
    if (!f._ensureWorld()) return null;
    const S = f.size, ix = Math.floor(x), iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= S || iz >= S) return null;
    const i = iz * S + ix;
    if (f.obst[i] > 0 || f.water[i]) return null;
    const w = this.game.world, y = f.stand[i];
    if (w.isSolid(ix, y, iz) || w.isSolid(ix, y + 1, iz)) return null;
    return { x: ix + 0.5, y, z: iz + 0.5 };
  }

  /** Debug / scripted spawn. Returns the zombie (or null). opts: {hpMul, wave, wanderer, sunproof, emerge} */
  spawn(type = 'walker', x, z, opts = {}) {
    const game = this.game, w = game.world;
    if (!w) return null;
    if (!ZOMBIE_TYPES[type]) type = 'walker';
    if (x === undefined || z === undefined) {
      const p = this._edgePoint(Math.random() * Math.PI * 2, 20);
      if (!p) return null;
      x = p.x; z = p.z;
    }
    let p = this._standPoint(x, z);
    if (!p) {
      // search a small spiral for a free spot
      outer: for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        p = this._standPoint(x + dx, z + dz); if (p) break outer;
      }
    }
    if (!p) { const y = w.surfaceY(x, z) + 1; p = { x, y, z }; }
    const d = this.diff;
    const wave = opts.wave ?? this.currentWave;
    const hpMul = (opts.hpMul ?? 1) * d.hp * hpScale(wave);
    const zb = new Zombie(game, type, { ...opts, hpMul, dmgMul: d.dmg * dmgScale(wave), wave });
    zb.position.set(p.x, p.y, p.z);
    zb.yaw = Math.atan2(w.size / 2 - p.x, w.size / 2 - p.z);
    zb.progPos.copy(zb.position);
    game.entities.add(zb);
    this.zombies.push(zb);
    if (type === 'necromancer') {
      zb.raiseHpMul = 0.8;
      if (!opts.silent) game.bus.emit('toast', { text: 'Некромант восстал! Он поднимает мёртвых', kind: 'bad' });
    }
    return zb;
  }

  _spawnGroup() {
    const n = Math.max(1, Math.round(this.groupSize * (0.6 + Math.random() * 0.8)));
    const room = this.maxAlive - this.aliveCount();
    const take = Math.min(n, room, this.queue.length);
    if (take <= 0) return false;
    const dirIdx = this.queue[0].dir;
    const dir = this.spawnDirections[dirIdx] || { angle: Math.random() * Math.PI * 2 };
    const anchor = this._edgePoint(dir.angle, 14);
    for (let i = 0; i < take; i++) {
      const q = this.queue.shift();
      let x, z;
      if (anchor) { x = anchor.x + (Math.random() - 0.5) * 7; z = anchor.z + (Math.random() - 0.5) * 7; }
      const zb = this.spawn(q.type, x, z, { wave: this.currentWave });
      if (zb) zb.emergeT = 1.4 + i * 0.12;   // staggered rise
    }
    return true;
  }

  _spawnWanderer() {
    const st = this.game.state;
    const day = !st.isNight;
    const p = this._edgePoint(Math.random() * Math.PI * 2, 40);
    if (!p) return;
    // stay away from the player so they don't pop in on screen
    const pl = this.game.player?.position;
    if (pl && Math.hypot(pl.x - p.x, pl.z - p.z) < 25) return;
    const zb = this.spawn(day || Math.random() < 0.7 ? 'walker' : 'runner', p.x, p.z, { wanderer: true, sunproof: day, wave: Math.max(1, this.currentWave), hpMul: 0.9 });
    if (zb) zb.home = zb.position.clone();
  }

  /** At most a few A* searches per frame across all zombies. */
  takePathBudget() { if (this._pathBudget > 0) { this._pathBudget--; return true; } return false; }

  /** Fills `out` with zombies near (x,z) (spatial hash). Returns count. */
  near(x, z, r, out) {
    let n = 0;
    const x0 = Math.floor((x - r) / GRID), x1 = Math.floor((x + r) / GRID), z0 = Math.floor((z - r) / GRID), z1 = Math.floor((z + r) / GRID);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const cell = this._grid.get(gx * 4096 + gz);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) out[n++] = cell[i];
    }
    out.length = n;
    return n;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const game = this.game;
    if (!game.world) return;
    this._pathBudget = game.quality === 'low' ? 2 : 4;

    // time-lapse toward dusk after "call wave now"
    if (this._ff) {
      const st = game.state;
      const before = st.timeOfDay;
      st.timeOfDay = Math.min(0.78, st.timeOfDay + this._ff.rate * dt);
      if (before < 0.78 && st.timeOfDay >= 0.78 - 1e-6) { this._ff = null; st.timeOfDay = 0.7801; game.bus.emit('time:dusk', { day: st.day }); }
    }

    // prune dead from the live list, rebuild spatial hash
    const grid = this._grid;
    for (const cell of grid.values()) cell.length = 0;
    let alive = 0, waveAlive = 0, write = 0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.dead) continue;
      this.zombies[write++] = z;
      alive++;
      if (!z.wanderer) waveAlive++;
      const k = Math.floor(z.position.x / GRID) * 4096 + Math.floor(z.position.z / GRID);
      let cell = grid.get(k);
      if (!cell) { cell = []; grid.set(k, cell); }
      cell.push(z);
    }
    this.zombies.length = write;
    if (grid.size > 400) for (const [k, c] of grid) if (!c.length) grid.delete(k);
    this.activeCount = waveAlive;

    this.flow.update(dt, this.waveActive || alive > 0);
    this.projectiles.update(dt);

    if (this.waveActive) {
      if (this.queue.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          if (this._spawnGroup()) this.spawnT = this.spawnInterval * (0.7 + Math.random() * 0.6);
          else this.spawnT = 1.5;      // capped — retry soon
        }
      } else if (waveAlive === 0 && game.time - this.waveStartTime > 3) {
        this._endWave();
      }
    }

    // lone wanderers near the far edges (sun-proof helmets by day, stragglers by night)
    this._wanderT -= dt;
    if (this._wanderT <= 0) {
      this._wanderT = 45 + Math.random() * 45;
      let wanderers = 0;
      for (const z of this.zombies) if (z.wanderer) wanderers++;
      if (wanderers < (game.state.isNight ? 4 : 3) && alive < this.maxAlive && !this.waveActive) this._spawnWanderer();
    }
  }

  // ------------------------------------------------------------------ save / load
  serialize() {
    return {
      currentWave: this.currentWave,
      waveActive: this.waveActive,
      remaining: this.waveActive ? this.queue.length + this.activeCount : 0,
      bonus: this.bonus,
    };
  }
  deserialize(o = {}) {
    this._clearAll();
    this.currentWave = o.currentWave | 0;
    this.bonus = !!o.bonus;
    if (o.waveActive && o.remaining > 0 && this.game.state.isNight) {
      // resume the interrupted wave with what was left of it
      const types = this.compose(this.currentWave).slice(-o.remaining);
      const dirs = 2;
      this._makeDirections(dirs);
      this.queue = types.map((t) => ({ type: t, dir: (Math.random() * dirs) | 0 }));
      this.waveCount = types.length;
      this.waveActive = true;
      this.waveStartTime = this.game.time;
      this.spawnInterval = 4; this.groupSize = 4; this.spawnT = 3;
    }
  }
}
