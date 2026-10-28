// Flowing water, as in Minecraft. A source (`water`) pours into open cells next to it: straight down as a falling
// column (water_fall), otherwise sideways one level weaker per block (water_1 … water_7), heading for the nearest
// drop within 4 blocks. Flowing water that loses its feed recedes; two sources side by side over solid ground make
// a new source (infinite water); water reaching lava turns it to obsidian. Generated lakes and seas stay still until
// something next to them changes (the player digs, a zombie breaks a wall, a bomb goes off).
// The host simulates; edits go through world.setBlock, so they are saved and sent to network players like any other.
import { B, BLOCKS, WATER_IDS, WATER_LEVEL, WATER_FLOW } from '../core/blocks.js';
import { SOLID } from '../world/World.js';

const TICK = 0.25;            // Minecraft water updates every 5 game ticks
const MAX_PER_TICK = 600;     // cell updates per tick (a flood keeps going over the next ticks)
const SLOPE = 4;              // how far flowing water looks for a drop
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// cells water can wash into: air, plants, torches, snow layers … (not solids, not other liquids)
const WASHABLE = new Uint8Array(256);
for (const b of BLOCKS) if (b && !SOLID[b.id] && b.shape !== 'liquid' && (b.id === B.AIR || b.replaceable || b.shape === 'cross')) WASHABLE[b.id] = 1;

export class Fluids {
  constructor(game) {
    this.game = game;
    this.queue = new Map();   // world index -> [x, y, z]
    this.t = 0;
    const bus = game.bus;
    // the village's own diggers and builders don't flood their sites; everything else wakes the water nearby
    bus.on('block:broken', ({ x, y, z, by }) => { if (!(by && by.faction === 'village')) this.touch(x, y, z); });
    bus.on('block:placed', ({ x, y, z }) => this.touch(x, y, z));
    bus.on('game:begin', ({ loaded }) => { this.queue.clear(); if (loaded) this._resume(); });
  }

  get world() { return this.game.world; }

  /** Something changed at (x, y, z): water in and around that cell takes another look. */
  touch(x, y, z) {
    const w = this.world; if (!w || this.game.net?.isClient) return;
    if (WATER_IDS[w.getBlock(x, y, z)]) this.schedule(x, y, z);
    for (const [dx, dy, dz] of NB6) if (WATER_IDS[w.getBlock(x + dx, y + dy, z + dz)]) this.schedule(x + dx, y + dy, z + dz);
  }
  schedule(x, y, z) {
    const w = this.world;
    if (!w.inBounds(x, y, z)) return;
    this.queue.set(w.index(x, y, z), [x, y, z]);
  }

  update(dt) {
    if (!this.queue.size || this.game.net?.isClient) return;
    this.t += dt;
    if (this.t < TICK) return;
    this.t = 0;
    let n = 0;
    const batch = [];
    for (const [k, c] of this.queue) { batch.push(c); this.queue.delete(k); if (++n >= MAX_PER_TICK) break; }
    for (const [x, y, z] of batch) this._tick(x, y, z);
  }

  // ------------------------------------------------------------------ rules
  _get(x, y, z) { return this.world.getBlock(x, y, z); }
  /** Can water move into this cell (loaded, in the world, washable)? */
  _enterable(x, y, z, id) { return WASHABLE[id] === 1 && y >= 0 && this.world.inBounds(x, y, z) && this.world.isGenerated(x, z); }
  /** Below is open (or flowing water): this cell pours down instead of spreading. */
  _canDown(x, y, z) {
    if (y <= 0) return false;
    const b = this._get(x, y - 1, z);
    return (WATER_IDS[b] === 1 && b !== B.WATER) || b === B.LAVA || this._enterable(x, y - 1, z, b);
  }
  _sources(x, y, z) {
    let n = 0;
    for (const [dx, dz] of DIRS) if (this._get(x + dx, y, z + dz) === B.WATER) n++;
    return n;
  }
  /** Does the water cell (x, y, z) of kind id spread sideways? */
  _sideways(x, y, z, id) {
    if (this._canDown(x, y, z)) return id === B.WATER && this._sources(x, y, z) >= 3;
    return WATER_LEVEL[id] < 7;
  }
  /** What a flowing / falling cell should be given its neighbours. */
  _want(x, y, z) {
    let src = 0, best = 99;
    for (const [dx, dz] of DIRS) {
      const n = this._get(x + dx, y, z + dz);
      if (!WATER_IDS[n]) continue;
      if (n === B.WATER) src++;
      if (!this._sideways(x + dx, y, z + dz, n)) continue;
      best = Math.min(best, WATER_LEVEL[n] + 1);
    }
    if (src >= 2) { const b = this._get(x, y - 1, z); if (SOLID[b] || b === B.WATER) return B.WATER; }
    if (WATER_IDS[this._get(x, y + 1, z)]) return B.WATER_FALL;
    return best <= 7 ? WATER_FLOW[best] : B.AIR;
  }

  _tick(x, y, z) {
    let id = this._get(x, y, z);
    if (!WATER_IDS[id]) return;
    if (id !== B.WATER) {
      const want = this._want(x, y, z);
      if (want !== id) {
        this._set(x, y, z, want);
        this._wake(x, y, z);
        if (want === B.AIR) return;
        id = want;
      }
    }
    this._spread(x, y, z, id);
  }

  _spread(x, y, z, id) {
    if (this._canDown(x, y, z)) {
      const b = this._get(x, y - 1, z);
      if (b === B.LAVA) this._set(x, y - 1, z, B.OBSIDIAN);
      else if (b !== B.WATER_FALL) { this._set(x, y - 1, z, B.WATER_FALL); this.schedule(x, y - 1, z); }
      if (!(id === B.WATER && this._sources(x, y, z) >= 3)) return;
    }
    const lv = WATER_LEVEL[id];
    if (lv >= 7) return;
    const nl = lv + 1;
    for (const [dx, dz] of this._directions(x, y, z, nl)) {
      const tx = x + dx, tz = z + dz, t = this._get(tx, y, tz);
      if (t === B.LAVA) { this._set(tx, y, tz, B.OBSIDIAN); continue; }
      if (WATER_IDS[t]) {
        if (t !== B.WATER && t !== B.WATER_FALL && WATER_LEVEL[t] > nl) { this._set(tx, y, tz, WATER_FLOW[nl]); this.schedule(tx, y, tz); }
        continue;
      }
      if (!this._enterable(tx, y, tz, t)) continue;
      this._set(tx, y, tz, WATER_FLOW[nl]);
      this.schedule(tx, y, tz);
    }
  }

  /** Minecraft's spread rule: only towards the nearest drop within SLOPE blocks, or every way if there is none. */
  _directions(x, y, z, nl) {
    const cand = [];
    let best = 1000;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d], tx = x + dx, tz = z + dz, t = this._get(tx, y, tz);
      const open = t === B.LAVA || (WATER_IDS[t] && t !== B.WATER && t !== B.WATER_FALL && WATER_LEVEL[t] > nl) || this._enterable(tx, y, tz, t);
      if (!open) continue;
      const dist = this._canDown(tx, y, tz) ? 0 : this._slope(tx, y, tz, 1, d);
      cand.push([dx, dz, dist]);
      if (dist < best) best = dist;
    }
    return cand.filter(c => c[2] === best);
  }
  _slope(x, y, z, depth, from) {
    let best = 1000;
    for (let d = 0; d < 4; d++) {
      if (d === (from ^ 1)) continue;            // don't walk back (DIRS pairs: 0/1, 2/3)
      const [dx, dz] = DIRS[d], nx = x + dx, nz = z + dz, t = this._get(nx, y, nz);
      if (!(this._enterable(nx, y, nz, t) || (WATER_IDS[t] && t !== B.WATER))) continue;
      if (this._canDown(nx, y, nz)) return depth;
      if (depth < SLOPE) best = Math.min(best, this._slope(nx, y, nz, depth + 1, d));
    }
    return best;
  }

  _set(x, y, z, id) { this.world.setBlock(x, y, z, id); }
  _wake(x, y, z) {
    this.schedule(x, y, z);
    for (const [dx, dy, dz] of NB6) if (WATER_IDS[this._get(x + dx, y + dy, z + dz)]) this.schedule(x + dx, y + dy, z + dz);
  }
  /** After loading a save: flowing water that was still moving carries on. */
  _resume() {
    const w = this.world, ch = w?.changes; if (!ch) return;
    const S = w.size;
    for (const [i, id] of ch) if (WATER_IDS[id] && id !== B.WATER) { const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S)); this.schedule(x, y, z); }
  }
}
