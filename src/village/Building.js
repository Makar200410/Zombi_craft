import * as THREE from 'three';
import { B, BLOCKS, LOG_BLOCKS, LEAF_BLOCKS } from '../core/blocks.js';
import { BUILDING_TYPES } from './buildings.js';

const CLEAR = 0, FILL = 1, BP = 2;

/**
 * A placed building. Blocks are real world blocks; `ops` is the ordered construction list
 * (clear the site → fill holes → blueprint bottom-up). Builders execute ops one by one.
 *   state: 'planned' | 'constructing' | 'complete' | 'destroyed'
 */
export class Building {
  constructor(village, typeId, x, y, z, rot = 0, variant = 0, id = null) {
    this.village = village;
    this.game = village.game;
    this.id = id ?? village.nextBuildingId++;
    this.type = typeId;
    this.def = BUILDING_TYPES[typeId];
    this.name = this.def.name;
    this.x = x; this.y = y; this.z = z;
    this.rot = rot & 3; this.variant = variant;
    const L = this.def.layout(this.rot, variant);
    this.layout = L;
    this.w = L.w; this.d = L.d; this.height = L.height;
    this.state = 'planned';
    this.progress = 0;
    this.level = 1;
    this.workers = [];
    this.createdAt = this.game.time;
    this.blocks = L.blocks.map(b => ({ x: x + b.dx, y: y + b.dy, z: z + b.dz, id: b.id, dy: b.dy }));
    this.built = new Uint8Array(this.blocks.length);
    this.builtCount = 0;
    this.points = {};
    for (const k in L.points) this.points[k] = L.points[k].map(p => ({ x: x + p.dx + 0.5, y: y + p.dy, z: z + p.dz + 0.5 }));
    this.plots = L.plots.map(p => ({ x: x + p.dx, y: y + p.dy, z: z + p.dz }));
    this.quarry = L.quarry ? { ...L.quarry, cells: L.quarry.cells.map(c => ({ x: x + c.dx, z: z + c.dz, step: c.step, lx: c.lx })) } : null;
    this.quarryDone = false;
    this.center = new THREE.Vector3(x + this.w / 2, y + 1, z + this.d / 2);
    this.maxHp = this.computeMaxHp();
    this.hp = this.maxHp;
    this._lostAcc = 0;
    this.ops = [];
    this.opCursor = 0;
    this.reserved = new Set();   // op indices reserved by builders
    this.needsRepair = false;
    this.lastDamagedAt = -1e9;
  }

  get typeDef() { return this.def; }
  get jobSlots() { let n = 0; for (const k in this.def.jobs) n += this.def.jobs[k]; return n; }
  get job() { for (const k in this.def.jobs) return k; return null; }
  get freeSlots() { return Math.max(0, this.jobSlots - this.workers.length); }
  get isComplete() { return this.state === 'complete'; }
  get popBonus() {
    if (this.state !== 'complete') return 0;
    let p = this.def.popBonus;
    if (this.type === 'house' && this.game.state.researchDone.has('masonry')) p += 2;
    if (this.type === 'town_hall') p += (this.level - 1) * 2;
    return p;
  }
  get door() { return (this.points.door && this.points.door[0]) || { x: this.center.x, y: this.y + 1, z: this.z + this.d + 0.5 }; }
  get label() { return this.def.name; }

  computeMaxHp() {
    let hp = this.def.hp;
    if (this.game.state.researchDone.has('masonry')) hp *= 1.5;
    hp *= 1 + (this.level - 1) * 0.3;
    return Math.round(hp);
  }
  refreshMaxHp() {
    const f = this.hp / this.maxHp;
    this.maxHp = this.computeMaxHp();
    this.hp = Math.max(1, Math.round(this.maxHp * f));
  }

  contains(x, z, margin = 0) { return x >= this.x - margin && x < this.x + this.w + margin && z >= this.z - margin && z < this.z + this.d + margin; }
  /** closest point on the footprint rectangle (for distance checks) */
  distanceTo(p) {
    const cx = Math.max(this.x, Math.min(this.x + this.w, p.x)), cz = Math.max(this.z, Math.min(this.z + this.d, p.z));
    return Math.hypot(p.x - cx, p.z - cz);
  }

  // ---------------------------------------------------------------- construction ops
  /** (Re)computes the construction op list from the current world. */
  computeOps() {
    const w = this.game.world;
    const ops = [];
    const bpAt = new Map();
    this.blocks.forEach((b, i) => bpAt.set(w.index(b.x, b.y, b.z), i));
    const quarryCols = new Set();
    if (this.quarry) for (const c of this.quarry.cells) quarryCols.add(c.x + ',' + c.z);
    const top = this.y + Math.max(this.height + 1, 13);
    const clears = [], fills = [];
    for (let z = this.z; z < this.z + this.d; z++) for (let x = this.x; x < this.x + this.w; x++) {
      for (let yy = top; yy > this.y; yy--) {
        const id = w.getBlock(x, yy, z);
        if (id === B.AIR) continue;
        if (bpAt.has(w.index(x, yy, z))) continue;
        if (yy > this.y + this.height + 1 && !LOG_BLOCKS.has(id) && !LEAF_BLOCKS.has(id)) continue;
        clears.push({ x, y: yy, z, id: B.AIR, kind: CLEAR });
      }
      if (quarryCols.has(x + ',' + z)) continue;
      // fill holes below the floor
      let g = this.y;
      while (g > this.y - 6 && !BLOCKS[w.getBlock(x, g, z)].solid) g--;
      for (let yy = g + 1; yy < this.y; yy++) fills.push({ x, y: yy, z, id: B.DIRT, kind: FILL });
      if (!bpAt.has(w.index(x, this.y, z)) && !BLOCKS[w.getBlock(x, this.y, z)].solid) fills.push({ x, y: this.y, z, id: B.GRASS, kind: FILL });
    }
    clears.sort((a, b) => b.y - a.y);
    fills.sort((a, b) => a.y - b.y);
    ops.push(...clears, ...fills);
    this.blocks.forEach((b, i) => ops.push({ x: b.x, y: b.y, z: b.z, id: b.id, kind: BP, bi: i }));
    this.ops = ops;
    this.opCursor = 0;
    this.reserved.clear();
    this.refreshBuilt();
  }
  refreshBuilt() {
    const w = this.game.world;
    let n = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const ok = w.getBlock(b.x, b.y, b.z) === b.id ? 1 : 0;
      this.built[i] = ok; n += ok;
    }
    this.builtCount = n;
    this.progress = this.blocks.length ? n / this.blocks.length : 1;
  }
  opDone(op) { return this.game.world.getBlock(op.x, op.y, op.z) === op.id; }
  get remainingOps() {
    let n = 0;
    for (let i = this.opCursor; i < this.ops.length; i++) if (!this.opDone(this.ops[i])) n++;
    return n;
  }
  /** Next undone op near `pos` (prefers ops in build order; within the first few candidates picks the closest). */
  nextOp(pos, skip) {
    const ops = this.ops;
    while (this.opCursor < ops.length && this.opDone(ops[this.opCursor])) this.opCursor++;
    let best = -1, bestScore = Infinity, seen = 0, firstKind = -1, firstY = 0;
    for (let i = this.opCursor; i < ops.length; i++) {
      const op = ops[i];
      if (this.reserved.has(i) || this.opDone(op)) continue;
      if (skip && skip(op)) continue;
      if (firstKind < 0) { firstKind = op.kind; firstY = op.y; }
      if (firstKind !== BP && op.kind === BP) break;          // finish site work first
      if (op.kind === BP && op.y > firstY + 1) break;          // strictly bottom-up (lowest pending layer + 1)
      const d = pos ? Math.hypot(op.x + 0.5 - pos.x, op.z + 0.5 - pos.z) + Math.abs(op.y - firstY) * 3 : i;
      if (d < bestScore) { bestScore = d; best = i; }
      if (++seen > (op.kind === BP ? 60 : 14)) break;
    }
    return best;
  }
  hasWork() {
    if (this.state === 'destroyed') return true;
    if (this.state !== 'complete') return true;
    return this.needsRepair || this.hp < this.maxHp;
  }

  /** Execute op i (called by a builder). Returns true if the world changed. */
  applyOp(i, by) {
    const op = this.ops[i];
    if (!op) return false;
    const v = this.village, w = this.game.world;
    const prev = w.getBlock(op.x, op.y, op.z);
    if (prev === op.id) return false;
    v.editBlock(op.x, op.y, op.z, op.id);
    if (op.kind === BP) {
      if (!this.built[op.bi]) { this.built[op.bi] = 1; this.builtCount++; }
      this.progress = this.builtCount / this.blocks.length;
      if (this.state === 'complete') this.hp = Math.min(this.maxHp, this.hp + this.maxHp / this.blocks.length * 1.5);
      else this.hp = Math.max(this.hp, Math.round(this.maxHp * Math.max(0.1, this.progress)));
    }
    v.ghostsDirty = true;
    return true;
  }

  // ---------------------------------------------------------------- damage
  /** Damage from zombies / explosions. Removes a random block every ~15% hp lost. */
  damage(n, source) {
    if (this.state === 'destroyed' || n <= 0) return false;
    this.hp -= n;
    this.lastDamagedAt = this.game.time;
    this._lostAcc += n;
    const step = this.maxHp * 0.15;
    while (this._lostAcc >= step && this.hp > 0) { this._lostAcc -= step; this.knockOutBlock(); }
    this.game.bus.emit('building:damaged', { building: this, amount: n, source });
    if (this.hp <= 0) { this.hp = 0; this.village.onBuildingDestroyed(this, source); return true; }
    this.needsRepair = true;
    return false;
  }
  knockOutBlock(silent = false) {
    const w = this.game.world;
    const cands = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.dy >= 1 && this.built[i] && BLOCKS[b.id].solid) cands.push(i);
    }
    if (!cands.length) return;
    // prefer higher blocks for a "crumbling" look
    let pick = cands[Math.floor(Math.random() * cands.length)];
    const alt = cands[Math.floor(Math.random() * cands.length)];
    if (this.blocks[alt].y > this.blocks[pick].y) pick = alt;
    const b = this.blocks[pick];
    const id = w.getBlock(b.x, b.y, b.z);
    this.village.editBlock(b.x, b.y, b.z, B.AIR);
    this.built[pick] = 0; this.builtCount--;
    this.needsRepair = true;
    this.opCursor = 0;
    if (!silent) {
      this.game.particles?.blockBreak(b.x, b.y, b.z, id);
      this.game.audio?.play('break_block', { pos: { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }, volume: 0.6 });
    }
    this.village.ghostsDirty = true;
  }
  /** Called when some other actor changed one of our blueprint cells. */
  onBlockEdited(i, id) {
    const b = this.blocks[i];
    const ok = id === b.id ? 1 : 0;
    if (ok === this.built[i]) return;
    this.built[i] = ok;
    this.builtCount += ok ? 1 : -1;
    this.progress = this.builtCount / this.blocks.length;
    if (!ok) {
      this.needsRepair = true;
      this.opCursor = 0;
      if (this.state === 'complete' && b.dy >= 1) {
        this.hp -= this.maxHp / this.blocks.length;
        this.lastDamagedAt = this.game.time;
        if (this.hp <= 0) { this.hp = 0; this.village.onBuildingDestroyed(this, null); }
      }
    }
    this.village.ghostsDirty = true;
  }

  serialize() {
    return { id: this.id, type: this.type, x: this.x, y: this.y, z: this.z, rot: this.rot, variant: this.variant, state: this.state, hp: this.hp, level: this.level, quarryDone: this.quarryDone };
  }
}
