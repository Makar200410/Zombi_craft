import * as THREE from 'three';
import { B, BLOCKS } from '../core/blocks.js';
import { TerrainGen, SEA_LEVEL } from './terrain.js';
import { findPath } from './pathfinding.js';

export const CHUNK = 16;
export const HEIGHT = 64;
export { SEA_LEVEL };

const LIGHT_BLOCKING = new Uint8Array(256);
const EMIT = new Uint8Array(256);
const SOLID = new Uint8Array(256);
for (const b of BLOCKS) if (b) {
  LIGHT_BLOCKING[b.id] = (b.shape === 'cube' && b.render === 'opaque') ? 1 : 0;
  EMIT[b.id] = b.light || 0;
  SOLID[b.id] = b.solid ? 1 : 0;
}
export { LIGHT_BLOCKING, SOLID };

/**
 * Finite voxel world. Data lives in flat typed arrays; rendering is done by render/ChunkRenderer.
 * index(x,y,z) = x + size * (z + size * y)
 */
export class World {
  constructor(game, { size = 192, seed = 1 } = {}) {
    this.game = game;
    this.size = size;
    this.height = HEIGHT;
    this.seed = seed;
    this.chunksX = Math.ceil(size / CHUNK);
    this.blocks = new Uint8Array(size * size * HEIGHT);
    this.light = new Uint8Array(size * size * HEIGHT);   // hi nibble sky, lo nibble block light
    this.top = new Int16Array(size * size);               // highest light-blocking block per column (-1 none)
    this.dirty = new Set();                                // chunk keys needing remesh
    this.generated = new Uint8Array(this.chunksX * this.chunksX);   // chunks whose terrain exists
    this.heights = new Int16Array(size * size);
    this.biome = new Uint8Array(size * size);
    this.pending = new Map();                              // chunk key -> [[idx, id]] saved edits waiting for their chunk
    this.gen = null;
    this.damage = new Map();                               // idx -> {dmg, t}
    this._tmpV = new THREE.Vector3();
  }

  index(x, y, z) { return x + this.size * (z + this.size * y); }
  inBounds(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.size && z < this.size && y < HEIGHT; }

  /**
   * Generates the region around the village (radius in blocks); the rest of the world is generated lazily
   * (pumpGeneration) as the player gets near, so a 10× larger world loads as fast as the old one.
   */
  generate(radius = 150) {
    this.gen = new TerrainGen(this);
    const c = this.size / 2, cc = Math.floor(c / CHUNK), R = Math.ceil(radius / CHUNK) + 1;
    for (let cz = cc - R; cz <= cc + R; cz++) for (let cx = cc - R; cx <= cc + R; cx++) {
      if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) continue;
      if (Math.hypot(cx * CHUNK + 8 - c, cz * CHUNK + 8 - c) > radius + 12) continue;
      this.ensureChunk(cx, cz, false);
    }
    this.computeAllLight();
  }

  isGenerated(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    return cx >= 0 && cz >= 0 && cx < this.chunksX && cz < this.chunksX && this.generated[cz * this.chunksX + cx] === 1;
  }
  /** Generates a chunk if needed. relight=false during bulk generation (caller lights the region). */
  ensureChunk(cx, cz, relight = true) {
    if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) return false;
    const k = cz * this.chunksX + cx;
    if (this.generated[k]) return false;
    if (!this.gen) this.gen = new TerrainGen(this);
    this.gen.generateChunk(cx, cz);
    this.generated[k] = 1;
    const key = cx + ',' + cz;
    const pend = this.pending.get(key);
    if (pend) { for (const [i, id] of pend) this.blocks[i] = id; this.pending.delete(key); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < this.chunksX && nz < this.chunksX && this.generated[nz * this.chunksX + nx]) this.dirty.add(nx + ',' + nz);
    }
    if (relight) this.relightBox(cx * CHUNK - 15, cz * CHUNK - 15, cx * CHUNK + CHUNK + 14, cz * CHUNK + CHUNK + 14);
    this.game?.bus?.emit('chunk:generated', { cx, cz });
    return true;
  }
  /** Generates missing chunks around (x,z), nearest first, within a time budget (ms). Returns count made. */
  pumpGeneration(x, z, radius, budgetMs = 4) {
    const t0 = performance.now();
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    // always make the ground right under the player synchronously
    let made = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.ensureChunk(pcx + dx, pcz + dz)) made++;
    const R = Math.ceil(radius / CHUNK);
    if (!this._ring || this._ringR !== R) {
      this._ringR = R; this._ring = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) this._ring.push([dx, dz, dx * dx + dz * dz]);
      this._ring.sort((a, b) => a[2] - b[2]);
    }
    for (const [dx, dz] of this._ring) {
      if (performance.now() - t0 > budgetMs) break;
      if (this.ensureChunk(pcx + dx, pcz + dz)) made++;
    }
    return made;
  }
  /** Saved block edits: applied now where the chunk exists, otherwise when it gets generated. */
  applyChanges(changes) {
    for (const [i, id] of changes) {
      if (i < 0 || i >= this.blocks.length) continue;
      const x = i % this.size, z = Math.floor(i / this.size) % this.size;
      if (this.isGenerated(x, z)) this.blocks[i] = id;
      else {
        const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
        let list = this.pending.get(key); if (!list) this.pending.set(key, list = []);
        list.push([i, id]);
      }
    }
  }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0) return B.BEDROCK;
    if (x < 0 || z < 0 || x >= this.size || z >= this.size || y >= HEIGHT) return B.AIR;
    return this.blocks[x + this.size * (z + this.size * y)];
  }
  isSolid(x, y, z) { return SOLID[this.getBlock(x, y, z)] === 1; }
  /** Outside the map counts as solid wall for collision (invisible border). */
  isSolidForCollision(x, y, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return true;
    return SOLID[this.getBlock(x, y, z)] === 1;
  }
  getLight(x, y, z) {
    if (!this.inBounds(x, y, z)) return y >= HEIGHT ? 0xF0 : 0xF0;
    return this.light[x + this.size * (z + this.size * y)];
  }

  surfaceY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return SEA_LEVEL;
    for (let y = HEIGHT - 1; y >= 0; y--) if (SOLID[this.blocks[x + this.size * (z + this.size * y)]]) return y;
    return 0;
  }
  /** Height of the first standable surface at or below `fromY` (for NPC placement under trees etc.). */
  groundBelow(x, fromY, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = Math.min(HEIGHT - 1, Math.floor(fromY)); y >= 0; y--) if (this.isSolid(x, y, z)) return y;
    return 0;
  }
  isWalkable(x, y, z) {
    return this.isSolid(x, y - 1, z) && !this.isSolid(x, y, z) && !this.isSolid(x, y + 1, z) && this.getBlock(x, y, z) !== B.WATER;
  }

  setBlock(x, y, z, id, opts = {}) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    const prev = this.blocks[i];
    if (prev === id) return false;
    this.blocks[i] = id;
    this.damage.delete(i);
    // lighting
    if (EMIT[prev] !== EMIT[id] || LIGHT_BLOCKING[prev] !== LIGHT_BLOCKING[id]) this.relight(x, y, z);
    this.markDirty(x, y, z);
    if (!opts.silent && this.game) this.game.bus.emit('block:changed', { x, y, z, id, prev });
    return true;
  }

  markDirty(x, y, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(cx + ',' + cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add((cx - 1) + ',' + cz);
    if (lx === CHUNK - 1 && cx < this.chunksX - 1) this.dirty.add((cx + 1) + ',' + cz);
    if (lz === 0 && cz > 0) this.dirty.add(cx + ',' + (cz - 1));
    if (lz === CHUNK - 1 && cz < this.chunksX - 1) this.dirty.add(cx + ',' + (cz + 1));
    if (lx === 0 && lz === 0 && cx > 0 && cz > 0) this.dirty.add((cx - 1) + ',' + (cz - 1));
    if (lx === CHUNK - 1 && lz === CHUNK - 1 && cx < this.chunksX - 1 && cz < this.chunksX - 1) this.dirty.add((cx + 1) + ',' + (cz + 1));
    if (lx === 0 && lz === CHUNK - 1 && cx > 0 && cz < this.chunksX - 1) this.dirty.add((cx - 1) + ',' + (cz + 1));
    if (lx === CHUNK - 1 && lz === 0 && cx < this.chunksX - 1 && cz > 0) this.dirty.add((cx + 1) + ',' + (cz - 1));
  }

  // ---------- damage / breaking ----------
  hitBlock(x, y, z, dmg, by = null) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const id = this.getBlock(x, y, z);
    const b = BLOCKS[id];
    if (!b || id === B.AIR || id === B.WATER || !isFinite(b.hardness)) return { broken: false, id, progress: 0 };
    const i = this.index(x, y, z);
    const d = this.damage.get(i) || { dmg: 0, t: 0 };
    d.dmg += dmg; d.t = this.game ? this.game.time : 0;
    const hard = Math.max(0.05, b.hardness);
    if (d.dmg >= hard) { this.damage.delete(i); this.breakBlock(x, y, z, by); return { broken: true, id, progress: 1 }; }
    this.damage.set(i, d);
    return { broken: false, id, progress: d.dmg / hard };
  }
  getBlockDamage(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    const d = this.damage.get(this.index(x, y, z));
    if (!d) return 0;
    const b = BLOCKS[this.getBlock(x, y, z)];
    return Math.min(1, d.dmg / Math.max(0.05, b.hardness));
  }
  breakBlock(x, y, z, by = null) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return B.AIR;
    this.setBlock(x, y, z, B.AIR);
    const game = this.game;
    if (game) {
      const b = BLOCKS[id];
      const friendly = by === 'player' || (by && by.faction === 'village');
      if (friendly && b.drop) game.state.addAll(b.drop);
      if (by === 'player') game.state.stats.blocksMined++;
      game.bus.emit('block:broken', { x, y, z, id, by });
      if (game.particles) game.particles.blockBreak(x, y, z, id);
      // plants sitting on top pop off
      const above = this.getBlock(x, y + 1, z);
      if (above !== B.AIR && BLOCKS[above].shape === 'cross') this.breakBlock(x, y + 1, z, by);
    }
    return id;
  }
  updateDamageDecay(time) {
    if (!this.damage.size) return;
    for (const [i, d] of this.damage) if (time - d.t > 3) this.damage.delete(i);
  }

  // ---------- raycast (voxel DDA) ----------
  raycast(origin, dir, maxDist = 8, opts = {}) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (dir.x || 1e-9)), tDY = Math.abs(1 / (dir.y || 1e-9)), tDZ = Math.abs(1 / (dir.z || 1e-9));
    let tMX = (dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDX;
    let tMY = (dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDY;
    let tMZ = (dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDZ;
    let nx = 0, ny = 0, nz = 0, t = 0;
    const solidOnly = !!opts.solidOnly;
    for (let i = 0; i < 400; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (!solidOnly || SOLID[id]) && (id !== B.WATER || opts.includeWater)) {
        const p = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
        return { x, y, z, id, nx, ny, nz, px: x + nx, py: y + ny, pz: z + nz, dist: t, point: p };
      }
      if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMZ; tMZ += tDZ; nx = 0; ny = 0; nz = -stepZ; }
      if (t > maxDist) return null;
      if (y < -1 || y > HEIGHT + 1) return null;
    }
    return null;
  }
  /** True if the straight segment a→b is free of solid blocks (line of sight). */
  lineOfSight(a, b) {
    const d = this._tmpV.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length(); if (len < 0.01) return true;
    d.divideScalar(len);
    const hit = this.raycast(a, d, len, { solidOnly: true });
    return !hit;
  }

  findPath(from, to, opts) { return findPath(this, from, to, opts); }

  // ---------- lighting ----------
  /** Light every generated chunk (bounding box of the generated area). */
  computeAllLight() {
    let x0 = Infinity, z0 = Infinity, x1 = -1, z1 = -1;
    const N = this.chunksX;
    for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) if (this.generated[cz * N + cx]) {
      if (cx < x0) x0 = cx; if (cz < z0) z0 = cz; if (cx > x1) x1 = cx; if (cz > z1) z1 = cz;
    }
    if (x1 < 0) return;
    this.relightBox(x0 * CHUNK, z0 * CHUNK, x1 * CHUNK + CHUNK - 1, z1 * CHUNK + CHUNK - 1);
  }
  /** Recompute sky + block light inside a box of columns (seeded from the lit cells around it); remesh it. */
  relightBox(x0, z0, x1, z1) {
    const { size, light, blocks } = this;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(size - 1, x1); z1 = Math.min(size - 1, z1);
    if (x1 < x0 || z1 < z0) return;
    const sq = [], bq = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      let t = HEIGHT - 1;
      for (; t >= 0; t--) if (LIGHT_BLOCKING[blocks[x + size * (z + size * t)]]) break;
      this.top[z * size + x] = t;
    }
    for (let y = 0; y < HEIGHT; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + size * (z + size * y);
      const sky = y > this.top[z * size + x] ? 15 : 0;
      const e = EMIT[blocks[i]];
      light[i] = (sky << 4) | e;
      if (e) bq.push(x, y, z);
    }
    // sky light only needs to spread sideways from columns next to taller neighbours
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const t = this.top[z * size + x];
      let maxN = t;
      if (x > x0) maxN = Math.max(maxN, this.top[z * size + x - 1]);
      if (x < x1) maxN = Math.max(maxN, this.top[z * size + x + 1]);
      if (z > z0) maxN = Math.max(maxN, this.top[(z - 1) * size + x]);
      if (z < z1) maxN = Math.max(maxN, this.top[(z + 1) * size + x]);
      for (let y = t + 1; y <= maxN + 1 && y < HEIGHT; y++) sq.push(x, y, z);
    }
    const seedBorder = (x, y, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size) return;
      const l = light[x + size * (z + size * y)];
      if ((l >> 4) > 1) sq.push(x, y, z);
      if ((l & 15) > 1) bq.push(x, y, z);
    };
    for (let y = 0; y < HEIGHT; y++) {
      for (let z = z0; z <= z1; z++) { seedBorder(x0 - 1, y, z); seedBorder(x1 + 1, y, z); }
      for (let x = x0; x <= x1; x++) { seedBorder(x, y, z0 - 1); seedBorder(x, y, z1 + 1); }
    }
    const box = [x0, 0, z0, x1, HEIGHT - 1, z1];
    this._spread(sq, 4, box);
    this._spread(bq, 0, box);
    const N = this.chunksX;
    for (let cz = Math.floor(z0 / CHUNK); cz <= Math.floor(z1 / CHUNK); cz++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++)
      if (this.generated[cz * N + cx]) this.dirty.add(cx + ',' + cz);
  }
  /** BFS spread. shift 4 = sky light (hi nibble), 0 = block light. box optional clamp [x0,y0,z0,x1,y1,z1]. */
  _spread(queue, shift, box) {
    const { size, light, blocks } = this;
    const mask = 0xF << shift, inv = ~mask & 0xFF;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const lv = (light[x + size * (z + size * y)] >> shift) & 0xF;
      if (lv <= 1) continue;
      for (let f = 0; f < 6; f++) {
        const nx = x + (f === 0 ? 1 : f === 1 ? -1 : 0), ny = y + (f === 2 ? 1 : f === 3 ? -1 : 0), nz = z + (f === 4 ? 1 : f === 5 ? -1 : 0);
        if (nx < 0 || nz < 0 || ny < 0 || nx >= size || nz >= size || ny >= HEIGHT) continue;
        if (box && (nx < box[0] || ny < box[1] || nz < box[2] || nx > box[3] || ny > box[4] || nz > box[5])) continue;
        const ni = nx + size * (nz + size * ny);
        if (LIGHT_BLOCKING[blocks[ni]]) continue;
        const nl = lv - 1;
        if (((light[ni] >> shift) & 0xF) < nl) { light[ni] = (light[ni] & inv) | (nl << shift); queue.push(nx, ny, nz); }
      }
    }
  }
  /** Recompute sky+block light in a box around a changed cell. */
  relight(cx, cy, cz) {
    const { size, light, blocks } = this;
    const R = 15;
    const x0 = Math.max(0, cx - R), x1 = Math.min(size - 1, cx + R);
    const z0 = Math.max(0, cz - R), z1 = Math.min(size - 1, cz + R);
    const y0 = 0, y1 = Math.min(HEIGHT - 1, cy + R);
    // update column top for the changed column
    {
      let y = HEIGHT - 1;
      for (; y >= 0; y--) if (LIGHT_BLOCKING[blocks[cx + size * (cz + size * y)]]) break;
      this.top[cz * size + cx] = y;
    }
    const box = [x0, y0, z0, x1, y1, z1];
    const sq = [], bq = [];
    const w = x1 - x0 + 1, d = z1 - z0 + 1;
    if (!this._old || this._old.length < w * d * HEIGHT) this._old = new Uint8Array(31 * 31 * HEIGHT);
    const old = this._old;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + size * (z + size * y);
      old[(x - x0) + w * ((z - z0) + d * y)] = light[i];
      const sky = y > this.top[z * size + x] ? 15 : 0;
      const e = EMIT[blocks[i]];
      light[i] = (sky << 4) | e;
      if (sky) sq.push(x, y, z);
      if (e) bq.push(x, y, z);
    }
    // seed from border cells just outside the box
    const seedBorder = (x, y, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size) return;
      const l = light[x + size * (z + size * y)];
      if ((l >> 4) > 1) sq.push(x, y, z);
      if ((l & 15) > 1) bq.push(x, y, z);
    };
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) { seedBorder(x0 - 1, y, z); seedBorder(x1 + 1, y, z); }
      for (let x = x0; x <= x1; x++) { seedBorder(x, y, z0 - 1); seedBorder(x, y, z1 + 1); }
    }
    if (y1 < HEIGHT - 1) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) seedBorder(x, y1 + 1, z);
    this._spread(sq, 4, box);
    this._spread(bq, 0, box);
    // mark chunks whose light actually changed (plus neighbours via markDirty) dirty
    const cols = new Uint8Array(w * d);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const c = (x - x0) + w * (z - z0);
      if (!cols[c] && old[c + w * d * y] !== light[x + size * (z + size * y)]) { cols[c] = 1; this.markDirty(x, y, z); }
    }
  }

  serializeBlocks() { return this.blocks; }
}
