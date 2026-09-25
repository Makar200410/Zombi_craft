// Shared flow field that leads the undead toward the village.
//
// The world is reduced to a 2D grid of columns. For every column we know where a zombie would stand
// (`stand`), whether it is water, and an "obstacle cost" — the hardness of placed/tree blocks a zombie would
// have to smash to walk through that column (walls, building walls, tree trunks). Natural cliffs are
// impassable; player walls are passable-with-high-cost, so hordes flow around walls when there's a gap
// nearby and otherwise converge on the cheapest section of wall and break it (Clash-of-Clans feeling).
//
// Distances are computed with Dijkstra from goal cells (building footprints / town hall) outward,
// budgeted across frames into a back buffer that is swapped in when finished.
import { B, BLOCKS, LOG_BLOCKS, LEAF_BLOCKS } from '../core/blocks.js';

const SOLID = new Uint8Array(256);
const HARD = new Float32Array(256);
for (const b of BLOCKS) if (b) { SOLID[b.id] = b.solid ? 1 : 0; HARD[b.id] = b.hardness; }

/** Blocks that never appear in generated terrain — anything made of these was built by someone. */
export const CONSTRUCTION = new Uint8Array(256);
for (const n of ['PLANKS', 'COBBLESTONE', 'STONE_BRICKS', 'GLASS', 'THATCH', 'ROOF_TILES', 'LANTERN', 'IRON_BLOCK',
  'WORKBENCH', 'FURNACE', 'BOOKSHELF', 'ARCANE_TABLE', 'HAY_BALE', 'PLASTER', 'TIMBER_FRAME', 'PALISADE',
  'REINFORCED_WALL', 'BANNER']) if (B[n] !== undefined) CONSTRUCTION[B[n]] = 1;
const TREE = new Uint8Array(256);
for (const id of LOG_BLOCKS) TREE[id] = 1;
for (const id of LEAF_BLOCKS) TREE[id] = 1;

const WALL_TYPES = new Set(['wall', 'stone_wall', 'palisade', 'gate']);
const OBST_K = 2.6;          // path cost per point of block hardness (≈ seconds of smashing vs. walking)
const INF = 1e9;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class FlowField {
  constructor(game) {
    this.game = game;
    this.world = null;
    this.size = 0;
    this.dist = null;          // Float32Array — current (complete) field
    this.goalOwner = null;     // Int16Array — index into this.goalBuildings (-1 none)
    this.goalBuildings = [];
    this.version = 0;          // bumps every time a new field is swapped in
    this.dirty = true;
    this._job = null;
    this._lastStart = -99;
    this.minInterval = 1.2;    // seconds between recomputes triggered by block changes
  }

  // ---------- column table ----------
  _ensureWorld() {
    const w = this.game.world;
    if (!w) return false;
    if (w === this.world) return true;
    this.world = w;
    this.size = w.size;
    const n = w.size * w.size;
    this.stand = new Int16Array(n);
    this.obst = new Float32Array(n);
    this.water = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(INF);
    this.goalOwner = new Int16Array(n).fill(-1);
    this._job = null;
    for (let z = 0; z < w.size; z++) for (let x = 0; x < w.size; x++) this._column(x, z);
    this.dirty = true;
    return true;
  }

  _placed(x, y, z, id) {
    if (CONSTRUCTION[id]) return true;
    const ch = this.world.changes;
    return !!(ch && ch.size && ch.has(this.world.index(x, y, z)));
  }

  /** Recompute the stand height / obstacle cost for one column. */
  _column(x, z) {
    const w = this.world, S = w.size, blocks = w.blocks;
    const at = (y) => (y < 0 ? B.BEDROCK : y >= w.height ? 0 : blocks[x + S * (z + S * y)]);
    let y = w.height - 1;
    while (y > 0 && !SOLID[at(y)]) y--;
    // descend through built blocks and trees to the natural ground
    while (y > 0) {
      const id = at(y);
      if (SOLID[id] && !TREE[id] && !this._placed(x, y, z, id)) break;
      y--;
    }
    let s = y + 1;
    const i = z * S + x;
    const a = SOLID[at(s)], b = SOLID[at(s + 1)], c = SOLID[at(s + 2)];
    let obst = 0;
    if (!a && !b) { /* open ground */ }
    else if (a && !b && !c) { s += 1; }                 // one-block floor/slab/path: just a step
    else {
      // wall / building shell / tree trunk: cost of breaking what's in the way at body height
      if (a) obst += HARD[at(s)];
      if (b) obst += HARD[at(s + 1)];
      if (!isFinite(obst)) obst = INF;
      obst = Math.max(0.5, obst);
    }
    this.stand[i] = s;
    this.obst[i] = obst;
    const fw = at(s) === B.WATER, hw = at(s + 1) === B.WATER;
    this.water[i] = fw ? (hw ? 2 : 1) : 0;
  }

  // ---------- events ----------
  onBlockChanged(x, z) {
    if (!this._ensureWorld()) return;
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return;
    const i = z * this.size + x;
    const ps = this.stand[i], po = this.obst[i];
    this._column(x, z);
    if (this.stand[i] !== ps || this.obst[i] !== po) this.dirty = true;
  }
  invalidate() { this.dirty = true; }

  // ---------- goals ----------
  _collectGoals() {
    const game = this.game, S = this.size;
    const goals = [];
    const owners = [];
    const blds = [];
    const v = game.village;
    const list = (v && Array.isArray(v.buildings)) ? v.buildings : [];
    for (const b of list) {
      if (!b || b.state === 'destroyed' || b.state === 'planned') continue;
      const type = typeof b.type === 'string' ? b.type : b.type?.id;
      if (WALL_TYPES.has(type)) continue;
      const cells = buildingCells(b, S);
      if (!cells.length) continue;
      const k = blds.length; blds.push(b);
      for (const c of cells) { goals.push(c); owners.push(k); }
    }
    if (!goals.length) {
      // no buildings (yet): march on the town hall position or the map center
      const th = v?.townHall;
      const cx = Math.floor(th?.x ?? S / 2), cz = Math.floor(th?.z ?? S / 2);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x >= 0 && z >= 0 && x < S && z < S) { goals.push(z * S + x); owners.push(th ? 0 : -1); }
      }
      if (th) blds.push(th);
    }
    return { goals, owners, blds };
  }

  // ---------- Dijkstra (budgeted) ----------
  _startJob() {
    const S = this.size, n = S * S;
    const { goals, owners, blds } = this._collectGoals();
    const job = {
      dist: new Float32Array(n).fill(INF),
      owner: new Int16Array(n).fill(-1),
      blds,
      hk: new Float32Array(Math.max(1024, n * 2)), hv: new Int32Array(Math.max(1024, n * 2)), hn: 0,
    };
    for (let k = 0; k < goals.length; k++) {
      const g = goals[k];
      if (job.dist[g] === 0) continue;
      job.dist[g] = 0; job.owner[g] = owners[k];
      this._push(job, g, 0);
    }
    this._job = job;
    this.dirty = false;
    this._lastStart = this.game.time;
  }
  _push(job, v, k) {
    if (job.hn >= job.hk.length) {           // grow
      const nk = new Float32Array(job.hk.length * 2); nk.set(job.hk); job.hk = nk;
      const nv = new Int32Array(job.hv.length * 2); nv.set(job.hv); job.hv = nv;
    }
    const hk = job.hk, hv = job.hv;
    let i = job.hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p]; hv[i] = hv[p]; i = p;
    }
    hk[i] = k; hv[i] = v;
  }
  _pop(job) {
    const hk = job.hk, hv = job.hv;
    const topV = hv[0];
    const n = --job.hn;
    if (n > 0) {
      const lk = hk[n], lv = hv[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = lk;
        if (l < n && hk[l] < mk) { m = l; mk = hk[l]; }
        if (r < n && hk[r] < mk) { m = r; }
        if (m < 0) break;
        hk[i] = hk[m]; hv[i] = hv[m]; i = m;
      }
      hk[i] = lk; hv[i] = lv;
    }
    return topV;
  }
  /** Runs up to `budget` node expansions. Returns true when finished (and swapped in). */
  _run(budget) {
    const job = this._job; if (!job) return true;
    const S = this.size, dist = job.dist, owner = job.owner, stand = this.stand, obst = this.obst, water = this.water;
    while (job.hn > 0 && budget-- > 0) {
      const d0 = job.hk[0];
      const c = this._pop(job);
      if (d0 > dist[c]) continue;
      const cx = c % S, cz = (c / S) | 0;
      const cIsGoal = dist[c] === 0;
      const oc = obst[c], sc = stand[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DIRS[k][0], nz = cz + DIRS[k][1];
        if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
        const n = nz * S + nx;
        const on = obst[n];
        if (on >= INF) continue;
        // cost for a zombie standing on n to move into c
        let step = k < 4 ? 1 : 1.414;
        if (k >= 4) {
          // diagonals only across open, level-ish ground (no corner cutting through walls)
          const a = cz * S + nx, b = nz * S + cx;
          if (oc || on || obst[a] || obst[b]) continue;
          if (Math.abs(stand[a] - sc) > 1 || Math.abs(stand[b] - sc) > 1) continue;
        }
        if (cIsGoal) { /* the destination: zombie just needs to reach it */ }
        else if (oc) { if (oc >= INF) continue; step += oc * OBST_K; }
        else if (!on) {
          const up = sc - stand[n];
          if (up > 1 || up < -5) continue;   // natural cliff up, or too deep a drop
          if (up === 1) step += 0.3;
        }
        if (water[c]) step += water[c] === 2 ? 5 : 2;
        const nd = dist[c] + step;
        if (nd < dist[n]) { dist[n] = nd; owner[n] = owner[c]; this._push(job, n, nd); }
      }
    }
    if (job.hn > 0) return false;
    this.dist = job.dist; this.goalOwner = job.owner; this.goalBuildings = job.blds;
    this._job = null;
    this.version++;
    return true;
  }

  /** Force a complete synchronous recompute (e.g. at wave start). */
  recomputeNow() {
    if (!this._ensureWorld()) return;
    this._startJob();
    this._run(Infinity);
  }

  update(dt, active) {
    if (!this._ensureWorld()) return;
    if (this._job) { this._run(this.game.quality === 'low' ? 5000 : 9000); return; }
    if (this.dirty && active && this.game.time - this._lastStart > this.minInterval) {
      if (this.version === 0) this.recomputeNow(); else this._startJob();
    }
  }

  // ---------- queries ----------
  distAt(x, z) {
    if (!this.dist) return INF;
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return INF;
    return this.dist[z * this.size + x];
  }
  buildingAtCell(x, z) {
    if (!this.goalOwner) return null;
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return null;
    const o = this.goalOwner[z * this.size + x];
    return o >= 0 ? this.goalBuildings[o] || null : null;
  }
  /**
   * Best next cell from (x,z): writes {x,z} (cell centre) into out and returns the neighbour's distance,
   * or -1 if no field / unreachable.
   */
  next(x, z, out) {
    if (!this.dist || !this.version) return -1;
    const S = this.size;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= S || cz >= S) return -1;
    const d = this.dist, stand = this.stand, obst = this.obst;
    const here = d[cz * S + cx];
    let best = -1, bd = here;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DIRS[k][0], nz = cz + DIRS[k][1];
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      let v = d[n];
      if (k >= 4) {
        const a = cz * S + nx, b = nz * S + cx;
        if (obst[a] || obst[b] || obst[n]) continue;
        v += 0.05;
      }
      if (v < bd) { bd = v; best = n; }
    }
    if (best < 0) return here >= INF ? -1 : (out.x = cx + 0.5, out.z = cz + 0.5, here);
    out.x = (best % S) + 0.5; out.z = ((best / S) | 0) + 0.5;
    out.y = stand[best];
    return bd;
  }
  isObstacle(x, z) {
    if (!this.obst) return false;
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return false;
    return this.obst[z * this.size + x] > 0;
  }
}

/** Columns (flat indices) covered by a building. Tolerates several building shapes. */
export function buildingCells(b, S) {
  const out = new Set();
  const add = (x, z) => { x = Math.floor(x); z = Math.floor(z); if (x >= 0 && z >= 0 && x < S && z < S) out.add(z * S + x); };
  try {
    if (b.w > 0 && b.d > 0 && b.x !== undefined) {
      for (let z = 0; z < b.d; z++) for (let x = 0; x < b.w; x++) add(b.x + x, b.z + z);
    } else if (b.bounds && b.bounds.x0 !== undefined) {
      for (let z = b.bounds.z0; z <= b.bounds.z1; z++) for (let x = b.bounds.x0; x <= b.bounds.x1; x++) add(x, z);
    } else if (typeof b.footprint === 'function') {
      for (const c of b.footprint()) add(c.x, c.z);
    } else if (Array.isArray(b.blocks) && b.blocks.length) {
      for (const c of b.blocks) {
        if (c.x !== undefined) add(c.x, c.z);
        else if (c.dx !== undefined) add(b.x + c.dx, b.z + c.dz);
      }
    } else {
      let w = 1, d = 1;
      const size = b.size || b.type?.size || b.def?.size;
      if (Array.isArray(size)) { w = size[0]; d = size[1]; } else if (typeof size === 'number') { w = d = size; }
      if ((b.rot | 0) % 2 === 1) { const t = w; w = d; d = t; }
      const x0 = Math.floor(b.x), z0 = Math.floor(b.z);
      for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) add(x0 + x, z0 + z);
    }
  } catch (e) { /* ignore malformed building */ }
  return [...out];
}
