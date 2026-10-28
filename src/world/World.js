import * as THREE from 'three';
import { B, BLOCKS, LEAF_BLOCKS, WATER_IDS } from '../core/blocks.js';
import { TerrainGen, SEA_LEVEL } from './terrain.js';
import { TerrainGenV1 } from './terrainV1.js';
import { TerrainGenV2 } from './terrainV2.js';
import { TerrainGen4 } from './terrain4.js';
import { findPath } from './pathfinding.js';

export const CHUNK = 16;
export const HEIGHT = 64;          // height of worlds made before the deep underground (see WORLD_FORMATS)
export { SEA_LEVEL };
/**
 * World shapes: 1 = the first worlds (shallow), 2 = biomes and a first layered underground,
 * 3 = a Terraria-deep underground (~320 blocks of caves, caverns and the underworld),
 * 4 = the same, 16× wider (the world is generated and freed chunk by chunk around the player).
 */
export const WORLD_FORMATS = {
  1: { size: 1216, height: 64, sea: SEA_LEVEL },
  2: { size: 1024, height: 96, sea: 44 },
  3: { size: 1024, height: 384, sea: 320 },
  4: { size: 16384, height: 384, sea: 320 },      // a Minecraft-scale world (16 × 16 km) with rival villages
};
export const WORLD_FORMAT = 4;

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
 * Finite voxel world. Blocks and light live in one typed array per 16×16 chunk column (allocated when the chunk is
 * generated), so tall worlds only cost memory where they have been explored; rendering is done by
 * render/ChunkRenderer in vertical sections of SECTION blocks.
 * index(x,y,z) = x + size * (z + size * y) is the global key of a cell (saves, damage, building cells).
 * Inside a column array: (x & 15) + 16 * ((z & 15) + 16 * y).
 */
export const SECTION = 32;
export class World {
  constructor(game, { size = 192, seed = 1, height = HEIGHT, sea = SEA_LEVEL, format = 1 } = {}) {
    this.game = game;
    this.size = size;
    this.height = height;
    this.sea = sea;
    this.format = format;
    this.seed = seed;
    this.chunksX = Math.ceil(size / CHUNK);
    this.sections = Math.ceil(height / SECTION);
    const N = this.chunksX * this.chunksX;
    this.cols = new Array(N).fill(null);                  // chunk → Uint8Array(256 * height) block ids
    this.lcols = new Array(N).fill(null);                 // chunk → light (hi nibble sky, lo nibble block light)
    this.meta = new Array(N).fill(null);                  // chunk → {top, h, b}: per column highest light-blocking cell, terrain height, biome
    this.dirty = new Set();                                // section keys 'cx,cz,sy' needing remesh
    this.generated = new Uint8Array(N);                    // chunks whose terrain exists
    this.loaded = new Set();                               // chunk keys (cz * chunksX + cx) of generated chunks
    this.decorators = [];                                  // (cx, cz) => void, run on every newly generated chunk
    this.pending = new Map();                              // chunk key -> [[idx, id]] saved edits waiting for their chunk
    this.gen = null;
    this.damage = new Map();                               // idx -> {dmg, t}
    this.spawners = new Map();                             // idx -> {x, y, z, type, boss, key, cap} dungeon spawner cages
    this.chestTier = new Map();                            // idx -> 'dungeon' | 'vault' | 'boss' (richer chests)
    this._tmpV = new THREE.Vector3();
  }

  index(x, y, z) { return x + this.size * (z + this.size * y); }
  inBounds(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.size && z < this.size && y < this.height; }

  // ---------- storage ----------
  /** Block / light arrays of the chunk holding column (x, z); created (empty) on demand. */
  colAt(x, z, create = false) {
    const k = (z >> 4) * this.chunksX + (x >> 4);
    let c = this.cols[k];
    if (!c && create) {
      c = this.cols[k] = new Uint8Array(256 * this.height); this.lcols[k] = new Uint8Array(256 * this.height);
      if (!this.meta[k]) this.meta[k] = { top: new Int16Array(256).fill(-1), h: new Int16Array(256), b: new Uint8Array(256) };
    }
    return c;
  }
  // per-column data of generated chunks (0 / -1 elsewhere): highest light-blocking cell, terrain height, biome
  _meta(x, z) { return (x < 0 || z < 0 || x >= this.size || z >= this.size) ? null : this.meta[(z >> 4) * this.chunksX + (x >> 4)]; }
  topOf(x, z) { const m = this._meta(x, z); return m ? m.top[(x & 15) + 16 * (z & 15)] : -1; }
  setTop(x, z, v) { const m = this._meta(x, z); if (m) m.top[(x & 15) + 16 * (z & 15)] = v; }
  heightAt(x, z) { const m = this._meta(x, z); return m ? m.h[(x & 15) + 16 * (z & 15)] : 0; }
  biomeAt(x, z) { const m = this._meta(x, z); return m ? m.b[(x & 15) + 16 * (z & 15)] : 0; }
  /** Terrain height and biome of a column (written by the generators). */
  setColumn(x, z, h, b) {
    this.colAt(x, z, true);
    const m = this._meta(x, z); if (!m) return;
    const i = (x & 15) + 16 * (z & 15); m.h[i] = h; m.b[i] = b;
  }
  /** Fast block read for integer in-bounds coordinates (0 where nothing was generated). */
  rawGet(x, y, z) {
    const c = this.cols[(z >> 4) * this.chunksX + (x >> 4)];
    return c ? c[(x & 15) + 16 * ((z & 15) + 16 * y)] : 0;
  }
  /** Write a block without lighting / events (generation, bulk edits). */
  rawSet(x, y, z, id) {
    if (x < 0 || z < 0 || y < 0 || x >= this.size || z >= this.size || y >= this.height) return;
    this.colAt(x, z, true)[(x & 15) + 16 * ((z & 15) + 16 * y)] = id;
  }
  /** Light of a cell (0 where nothing was generated, so no light leaks in from there). */
  lightAt(x, y, z) {
    const c = this.lcols[(z >> 4) * this.chunksX + (x >> 4)];
    return c ? c[(x & 15) + 16 * ((z & 15) + 16 * y)] : 0;
  }
  /** Block at a global index. */
  getIdx(i) {
    const S = this.size, x = i % S, t = (i - x) / S, z = t % S, y = (t - z) / S;
    return this.rawGet(x, y, z);
  }
  setIdx(i, id) {
    const S = this.size, x = i % S, t = (i - x) / S, z = t % S, y = (t - z) / S;
    this.rawSet(x, y, z, id);
  }

  /**
   * Generates the region around the village (radius in blocks); the rest of the world is generated lazily
   * (pumpGeneration) as the player gets near, so a 10× larger world loads as fast as the old one.
   */
  generate(radius = this.format >= 3 ? 110 : 150) {
    this.gen = this._makeGen();
    const c = this.size / 2, cc = Math.floor(c / CHUNK), R = Math.ceil(radius / CHUNK) + 1;
    for (let cz = cc - R; cz <= cc + R; cz++) for (let cx = cc - R; cx <= cc + R; cx++) {
      if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) continue;
      if (Math.hypot(cx * CHUNK + 8 - c, cz * CHUNK + 8 - c) > radius + 12) continue;
      this.ensureChunk(cx, cz, false);
    }
    this.computeAllLight();
  }
  _makeGen() { return this.format === 1 ? new TerrainGenV1(this) : this.format === 2 ? new TerrainGenV2(this) : this.format === 3 ? new TerrainGen(this) : new TerrainGen4(this); }

  isGenerated(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    return cx >= 0 && cz >= 0 && cx < this.chunksX && cz < this.chunksX && this.generated[cz * this.chunksX + cx] === 1;
  }
  /** Marks every section of a chunk for remeshing. */
  dirtyChunk(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) return;
    for (let sy = 0; sy < this.sections; sy++) this.dirty.add(cx + ',' + cz + ',' + sy);
  }
  /** Generates a chunk if needed. relight=false during bulk generation (caller lights the region). */
  ensureChunk(cx, cz, relight = true) {
    if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) return false;
    const k = cz * this.chunksX + cx;
    if (this.generated[k]) return false;
    if (!this.gen) this.gen = this._makeGen();
    this.colAt(cx * CHUNK, cz * CHUNK, true);
    this.gen.generateChunk(cx, cz);
    for (const d of this.decorators) d(cx, cz);          // structures drawn from game state (rival villages)
    this.requested?.delete(k);
    this.generated[k] = 1;
    this.loaded.add(k);
    const key = cx + ',' + cz;
    const pend = this.pending.get(key);
    if (pend) { for (const [i, id] of pend) this.setIdx(i, id); this.pending.delete(key); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < this.chunksX && nz < this.chunksX && this.generated[nz * this.chunksX + nx]) this.dirtyChunk(nx, nz);
    }
    if (relight) this.relightBox(cx * CHUNK - 15, cz * CHUNK - 15, cx * CHUNK + CHUNK + 14, cz * CHUNK + CHUNK + 14);
    this.game?.bus?.emit('chunk:generated', { cx, cz });
    return true;
  }
  // ---------- background generation (format 3+ worlds; see genWorker.js) ----------
  /** Starts the generation worker (no-op where workers aren't available: everything stays synchronous). */
  startWorker() {
    if (this.worker || this.format < 3 || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./genWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => { if (e.data?.t === 'chunk') this._install(e.data); };
      this.worker.onerror = (e) => { console.warn('[world] generation worker failed, generating on the main thread', e?.message); this.worker = null; this.requested?.clear(); };
      this.worker.postMessage({ t: 'init', size: this.size, seed: this.seed, height: this.height, sea: this.sea, format: this.format });
      this.requested = new Set();
    } catch (e) { this.worker = null; }
  }
  stopWorker() { try { this.worker?.terminate(); } catch (e) { /* ignore */ } this.worker = null; this.requested?.clear(); }
  /** Asks the worker for a chunk (or makes it now without one). Returns false if it's already there / on its way. */
  requestChunk(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksX) return false;
    const k = cz * this.chunksX + cx;
    if (this.generated[k]) return false;
    if (!this.worker) return this.ensureChunk(cx, cz);
    if (this.requested.has(k)) return false;
    this.requested.add(k);
    this.worker.postMessage({ t: 'gen', cx, cz });
    return true;
  }
  /** A chunk made by the worker: put it in, add the game's structures and saved edits, stitch the light. */
  _install(m) {
    const { cx, cz } = m, k = cz * this.chunksX + cx;
    if (!this.requested?.has(k)) return;            // cancelled (unloaded / made synchronously meanwhile)
    this.requested.delete(k);
    if (this.generated[k]) return;
    this.cols[k] = new Uint8Array(m.blocks); this.lcols[k] = new Uint8Array(m.light);
    this.meta[k] = { top: new Int16Array(m.top), h: new Int16Array(m.h), b: new Uint8Array(m.b) };
    for (const [i, sp] of m.spawners) this.spawners.set(i, sp);
    for (const [i, t] of m.chests) this.chestTier.set(i, t);
    let changed = false;
    for (const d of this.decorators) if (d(cx, cz)) changed = true;
    this.generated[k] = 1;
    this.loaded.add(k);
    const key = cx + ',' + cz;
    const pend = this.pending.get(key);
    if (pend) { for (const [i, id] of pend) this.setIdx(i, id); this.pending.delete(key); changed = true; }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < this.chunksX && nz < this.chunksX && this.generated[nz * this.chunksX + nx]) this.dirtyChunk(nx, nz);
    }
    // its own light came from the worker; edits need a full relight, otherwise only the borders are stitched
    if (changed) this.relightBox(cx * CHUNK - 15, cz * CHUNK - 15, cx * CHUNK + CHUNK + 14, cz * CHUNK + CHUNK + 14);
    else this._stitchLight(cx, cz);
    this.game?.bus?.emit('chunk:generated', { cx, cz });
  }
  /** Lets light flow both ways across the borders of a chunk that was lit on its own. */
  _stitchLight(cx, cz) {
    const H = this.height, x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
    const sq = [], bq = [];
    const seed = (x, z) => {
      if (x < 0 || z < 0 || x >= this.size || z >= this.size) return;
      const lc = this.lcols[(z >> 4) * this.chunksX + (x >> 4)];
      if (!lc) return;
      const base = (x & 15) + 16 * (z & 15);
      for (let y = 0; y < H; y++) { const l = lc[base + 256 * y]; if ((l >> 4) > 1) sq.push(x, y, z); if ((l & 15) > 1) bq.push(x, y, z); }
    };
    for (let i = 0; i < CHUNK; i++) {
      seed(x0 + i, z0); seed(x0 + i, z0 - 1); seed(x0 + i, z1); seed(x0 + i, z1 + 1);
      seed(x0, z0 + i); seed(x0 - 1, z0 + i); seed(x1, z0 + i); seed(x1 + 1, z0 + i);
    }
    const box = [x0 - 15, 0, z0 - 15, x1 + 15, H - 1, z1 + 15];
    this._spread(sq, 4, box);
    this._spread(bq, 0, box);
  }
  /**
   * Frees a generated chunk (tall worlds, far from the player). Its edits stay in world.changes and come back when
   * it is generated again. Returns true if it was unloaded.
   */
  unloadChunk(cx, cz) {
    const k = cz * this.chunksX + cx;
    if (!this.generated[k]) return false;
    this.generated[k] = 0;
    this.loaded.delete(k);
    this.requested?.delete(k);
    this.cols[k] = null; this.lcols[k] = null; this.meta[k] = null;
    const key = cx + ',' + cz;
    // the chunk's saved edits wait for it again
    const ch = this.changes;
    if (ch && ch.size) {
      const S = this.size, list = [];
      const x0 = cx * CHUNK, z0 = cz * CHUNK;
      for (const [i, id] of ch) { const x = i % S, z = ((i - x) / S) % S; if (x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK) list.push([i, id]); }
      if (list.length) this.pending.set(key, list); else this.pending.delete(key);
    }
    for (let sy = 0; sy < this.sections; sy++) this.dirty.delete(key + ',' + sy);
    // the chunk's spawners and chest tags come back with its generation
    const inChunk = (i) => { const S = this.size, x = i % S, z = ((i - x) / S) % S; return (x >> 4) === cx && (z >> 4) === cz; };
    for (const i of this.spawners.keys()) if (inChunk(i)) this.spawners.delete(i);
    for (const i of this.chestTier.keys()) if (inChunk(i)) this.chestTier.delete(i);
    this.game?.bus?.emit('chunk:unloaded', { cx, cz });
    return true;
  }
  /**
   * Tall worlds only: frees chunks far from the player and from the village (keepR blocks around both),
   * so memory stays bounded however far the player wanders.
   */
  unloadFar(px, pz, keepR, vx, vz, villageR = 200, extra = []) {
    if (this.format < 3) return 0;
    const N = this.chunksX, k2 = keepR * keepR, v2 = villageR * villageR;
    let n = 0;
    for (const k of [...this.loaded]) {
      const cx = k % N, cz = (k - cx) / N;
      const mx = cx * CHUNK + 8, mz = cz * CHUNK + 8;
      if ((mx - px) ** 2 + (mz - pz) ** 2 < k2 || (mx - vx) ** 2 + (mz - vz) ** 2 < v2) continue;
      if (extra.some(([ex, ez, er]) => (mx - ex) ** 2 + (mz - ez) ** 2 < er * er)) continue;     // around other players (network games)
      if (this.unloadChunk(cx, cz)) n++;
    }
    return n;
  }
  /** Generates missing chunks around (x,z), nearest first, within a time budget (ms). Returns count made. */
  pumpGeneration(x, z, radius, budgetMs = 4) {
    const t0 = performance.now();
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    // always make the ground right under the player synchronously
    let made = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.ensureChunk(pcx + dx, pcz + dz)) made++;
    const R = Math.ceil(radius / CHUNK);
    const rings = this._rings || (this._rings = new Map());
    let ring = rings.get(R);
    if (!ring) {
      ring = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) ring.push([dx, dz, dx * dx + dz * dz]);
      ring.sort((a, b) => a[2] - b[2]);
      rings.set(R, ring);
    }
    if (this.worker) {
      // the worker makes the ring, nearest first, a few chunks in flight at a time
      for (const [dx, dz] of ring) {
        if (this.requested.size >= 4) break;
        if (this.requestChunk(pcx + dx, pcz + dz)) made++;
      }
      return made;
    }
    for (const [dx, dz] of ring) {
      if (performance.now() - t0 > budgetMs) break;
      if (this.ensureChunk(pcx + dx, pcz + dz)) made++;
    }
    return made;
  }
  /** Saved block edits: applied now where the chunk exists, otherwise when it gets generated. */
  applyChanges(changes) {
    for (const [i, id] of changes) {
      if (i < 0 || i >= this.size * this.size * this.height) continue;
      const x = i % this.size, z = Math.floor(i / this.size) % this.size;
      if (this.isGenerated(x, z)) this.setIdx(i, id);
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
    if (x < 0 || z < 0 || x >= this.size || z >= this.size || y >= this.height) return B.AIR;
    return this.rawGet(x, y, z);
  }
  isSolid(x, y, z) { return SOLID[this.getBlock(x, y, z)] === 1; }
  /** Outside the map counts as solid wall for collision (invisible border). */
  isSolidForCollision(x, y, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return true;
    return SOLID[this.getBlock(x, y, z)] === 1;
  }
  getLight(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0xF0;
    return this.lightAt(x, y, z);
  }

  surfaceY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return this.sea;
    const c = this.colAt(x, z);
    if (!c) return this.sea;
    const base = (x & 15) + 16 * (z & 15);
    for (let y = this.height - 1; y >= 0; y--) if (SOLID[c[base + 256 * y]]) return y;
    return 0;
  }
  /** Height of the first standable surface at or below `fromY` (for NPC placement under trees etc.). */
  groundBelow(x, fromY, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = Math.min(this.height - 1, Math.floor(fromY)); y >= 0; y--) if (this.isSolid(x, y, z)) return y;
    return 0;
  }
  isWalkable(x, y, z) {
    return this.isSolid(x, y - 1, z) && !this.isSolid(x, y, z) && !this.isSolid(x, y + 1, z) && !WATER_IDS[this.getBlock(x, y, z)] && this.getBlock(x, y, z) !== B.LAVA;
  }

  setBlock(x, y, z, id, opts = {}) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    const c = this.colAt(x, z, true), li = (x & 15) + 16 * ((z & 15) + 16 * y);
    const prev = c[li];
    if (prev === id) return false;
    c[li] = id;
    this.damage.delete(i);
    // lighting
    if (EMIT[prev] !== EMIT[id] || LIGHT_BLOCKING[prev] !== LIGHT_BLOCKING[id]) this.relight(x, y, z);
    this.markDirty(x, y, z);
    if (!opts.silent && this.game) this.game.bus.emit('block:changed', { x, y, z, id, prev });
    // on a joined network game our edits are made real by the host
    if (this.game?.net?.isClient && !opts.fromNet) this.game.net.sendSet(x, y, z, id);
    return true;
  }

  /** Marks the section of a cell (and neighbouring sections it touches) for remeshing. */
  markDirty(x, y, z) {
    const N = this.chunksX;
    const cx = x >> 4, cz = z >> 4, sy = Math.floor(y / SECTION);
    const lx = x & 15, lz = z & 15, ly = y - sy * SECTION;
    const xs = [cx], zs = [cz], ys = [sy];
    if (lx === 0 && cx > 0) xs.push(cx - 1);
    if (lx === 15 && cx < N - 1) xs.push(cx + 1);
    if (lz === 0 && cz > 0) zs.push(cz - 1);
    if (lz === 15 && cz < N - 1) zs.push(cz + 1);
    if (ly === 0 && sy > 0) ys.push(sy - 1);
    if (ly === SECTION - 1 && sy < this.sections - 1) ys.push(sy + 1);
    for (const a of xs) for (const b of zs) for (const c of ys) this.dirty.add(a + ',' + b + ',' + c);
  }

  // ---------- damage / breaking ----------
  hitBlock(x, y, z, dmg, by = null) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const id = this.getBlock(x, y, z);
    const b = BLOCKS[id];
    if (!b || id === B.AIR || WATER_IDS[id] || id === B.LAVA || !isFinite(b.hardness)) return { broken: false, id, progress: 0 };
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
    const solidOnly = !!opts.solidOnly, seeLeaves = !opts.throughLeaves;
    for (let i = 0; i < 400; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (!solidOnly || SOLID[id]) && (!WATER_IDS[id] || opts.includeWater) && (seeLeaves || !LEAF_BLOCKS.has(id))) {
        const p = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
        return { x, y, z, id, nx, ny, nz, px: x + nx, py: y + ny, pz: z + nz, dist: t, point: p };
      }
      if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMZ; tMZ += tDZ; nx = 0; ny = 0; nz = -stepZ; }
      if (t > maxDist) return null;
      if (y < -1 || y > this.height + 1) return null;
    }
    return null;
  }
  /** True if the straight segment a→b is free of solid blocks (line of sight). Leaves don't block: everyone walks through them. */
  lineOfSight(a, b) {
    const d = this._tmpV.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length(); if (len < 0.01) return true;
    d.divideScalar(len);
    const hit = this.raycast(a, d, len, { solidOnly: true, throughLeaves: true });
    return !hit;
  }

  findPath(from, to, opts) { return findPath(this, from, to, opts); }

  // ---------- lighting ----------
  /** Light every generated chunk (bounding box of the generated area). */
  computeAllLight() {
    // loaded chunks can be scattered over a 16 km world (a town far away, the village): relight them in tiles of
    // 8×8 chunks, never as one box spanning everything between them
    const N = this.chunksX, tiles = new Map();
    for (const k of this.loaded) {
      const cx = k % N, cz = (k - cx) / N, key = (cx >> 3) + ',' + (cz >> 3);
      let t = tiles.get(key);
      if (!t) tiles.set(key, t = [cx, cz, cx, cz]);
      if (cx < t[0]) t[0] = cx; if (cz < t[1]) t[1] = cz; if (cx > t[2]) t[2] = cx; if (cz > t[3]) t[3] = cz;
    }
    for (const [x0, z0, x1, z1] of tiles.values()) this.relightBox(x0 * CHUNK, z0 * CHUNK, x1 * CHUNK + CHUNK - 1, z1 * CHUNK + CHUNK - 1);
  }
  /** Highest light-blocking cell of a column (-1 if none). */
  _colTop(x, z) {
    const c = this.colAt(x, z);
    if (!c) return -1;
    const base = (x & 15) + 16 * (z & 15);
    let t = this.height - 1;
    for (; t >= 0; t--) if (LIGHT_BLOCKING[c[base + 256 * t]]) break;
    return t;
  }
  /** Does an emitter at (x,y,z) touch a cell light can enter? (buried emitters needn't seed the flood) */
  _emitterOpen(x, y, z) {
    const H = this.height, S = this.size;
    if (y + 1 < H && !LIGHT_BLOCKING[this.rawGet(x, y + 1, z)]) return true;
    if (y > 0 && !LIGHT_BLOCKING[this.rawGet(x, y - 1, z)]) return true;
    if (x > 0 && !LIGHT_BLOCKING[this.rawGet(x - 1, y, z)]) return true;
    if (x < S - 1 && !LIGHT_BLOCKING[this.rawGet(x + 1, y, z)]) return true;
    if (z > 0 && !LIGHT_BLOCKING[this.rawGet(x, y, z - 1)]) return true;
    if (z < S - 1 && !LIGHT_BLOCKING[this.rawGet(x, y, z + 1)]) return true;
    return false;
  }
  /** Recompute sky + block light inside a box of columns (seeded from the lit cells around it); remesh it. */
  relightBox(x0, z0, x1, z1) {
    const { size } = this, H = this.height;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(size - 1, x1); z1 = Math.min(size - 1, z1);
    if (x1 < x0 || z1 < z0) return;
    const sq = [], bq = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.setTop(x, z, this._colTop(x, z));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const c = this.colAt(x, z);
      if (!c) continue;
      const lc = this.lcols[(z >> 4) * this.chunksX + (x >> 4)], base = (x & 15) + 16 * (z & 15), t = this.topOf(x, z);
      for (let y = 0; y < H; y++) {
        const li = base + 256 * y;
        const e = EMIT[c[li]];
        lc[li] = ((y > t ? 15 : 0) << 4) | e;
        if (e && this._emitterOpen(x, y, z)) bq.push(x, y, z);
      }
    }
    // sky light only needs to spread sideways from columns next to taller neighbours
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const t = this.topOf(x, z);
      let maxN = t;
      if (x > x0) maxN = Math.max(maxN, this.topOf(x - 1, z));
      if (x < x1) maxN = Math.max(maxN, this.topOf(x + 1, z));
      if (z > z0) maxN = Math.max(maxN, this.topOf(x, z - 1));
      if (z < z1) maxN = Math.max(maxN, this.topOf(x, z + 1));
      for (let y = t + 1; y <= maxN + 1 && y < H; y++) sq.push(x, y, z);
    }
    const seedBorder = (x, y, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size) return;
      const l = this.lightAt(x, y, z);
      if ((l >> 4) > 1) sq.push(x, y, z);
      if ((l & 15) > 1) bq.push(x, y, z);
    };
    for (let y = 0; y < H; y++) {
      for (let z = z0; z <= z1; z++) { seedBorder(x0 - 1, y, z); seedBorder(x1 + 1, y, z); }
      for (let x = x0; x <= x1; x++) { seedBorder(x, y, z0 - 1); seedBorder(x, y, z1 + 1); }
    }
    const box = [x0, 0, z0, x1, H - 1, z1];
    this._spread(sq, 4, box);
    this._spread(bq, 0, box);
    const N = this.chunksX;
    for (let cz = Math.floor(z0 / CHUNK); cz <= Math.floor(z1 / CHUNK); cz++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++)
      if (this.generated[cz * N + cx]) this.dirtyChunk(cx, cz);
  }
  /** BFS spread. shift 4 = sky light (hi nibble), 0 = block light. box optional clamp [x0,y0,z0,x1,y1,z1]. */
  _spread(queue, shift, box) {
    const size = this.size, H = this.height, N = this.chunksX, cols = this.cols, lcols = this.lcols;
    const mask = 0xF << shift, inv = ~mask & 0xFF;
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const lc = lcols[(z >> 4) * N + (x >> 4)];
      if (!lc) continue;
      const lv = (lc[(x & 15) + 16 * ((z & 15) + 16 * y)] >> shift) & 0xF;
      if (lv <= 1) continue;
      for (let f = 0; f < 6; f++) {
        const nx = x + (f === 0 ? 1 : f === 1 ? -1 : 0), ny = y + (f === 2 ? 1 : f === 3 ? -1 : 0), nz = z + (f === 4 ? 1 : f === 5 ? -1 : 0);
        if (nx < 0 || nz < 0 || ny < 0 || nx >= size || nz >= size || ny >= H) continue;
        if (box && (nx < box[0] || ny < box[1] || nz < box[2] || nx > box[3] || ny > box[4] || nz > box[5])) continue;
        const k = (nz >> 4) * N + (nx >> 4), c = cols[k];
        if (!c) continue;
        const ni = (nx & 15) + 16 * ((nz & 15) + 16 * ny);
        if (LIGHT_BLOCKING[c[ni]]) continue;
        const nlc = lcols[k], nl = lv - 1;
        if (((nlc[ni] >> shift) & 0xF) < nl) { nlc[ni] = (nlc[ni] & inv) | (nl << shift); queue.push(nx, ny, nz); }
      }
    }
  }
  /** Recompute sky+block light in a box around a changed cell. */
  relight(cx, cy, cz) {
    const size = this.size, H = this.height;
    const R = 15;
    const x0 = Math.max(0, cx - R), x1 = Math.min(size - 1, cx + R);
    const z0 = Math.max(0, cz - R), z1 = Math.min(size - 1, cz + R);
    // update the top of the changed column; only the part of the box that can change is recomputed
    const oldTop = this.topOf(cx, cz), newTop = this._colTop(cx, cz);
    this.setTop(cx, cz, newTop);
    const y0 = Math.max(0, Math.min(cy, oldTop, newTop) - R), y1 = Math.min(H - 1, cy + R);
    const box = [x0, y0, z0, x1, y1, z1];
    const sq = [], bq = [];
    const w = x1 - x0 + 1, d = z1 - z0 + 1, hh = y1 - y0 + 1;
    if (!this._old || this._old.length < w * d * hh) this._old = new Uint8Array(w * d * hh);
    const old = this._old;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const c = this.colAt(x, z);
      if (!c) continue;
      const lc = this.lcols[(z >> 4) * this.chunksX + (x >> 4)], base = (x & 15) + 16 * (z & 15), t = this.topOf(x, z);
      for (let y = y0; y <= y1; y++) {
        const li = base + 256 * y;
        old[(x - x0) + w * ((z - z0) + d * (y - y0))] = lc[li];
        const sky = y > t ? 15 : 0;
        const e = EMIT[c[li]];
        lc[li] = (sky << 4) | e;
        if (sky) sq.push(x, y, z);
        if (e) bq.push(x, y, z);
      }
    }
    // seed from cells just outside the box
    const seedBorder = (x, y, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size || y < 0 || y >= H) return;
      const l = this.lightAt(x, y, z);
      if ((l >> 4) > 1) sq.push(x, y, z);
      if ((l & 15) > 1) bq.push(x, y, z);
    };
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) { seedBorder(x0 - 1, y, z); seedBorder(x1 + 1, y, z); }
      for (let x = x0; x <= x1; x++) { seedBorder(x, y, z0 - 1); seedBorder(x, y, z1 + 1); }
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { seedBorder(x, y1 + 1, z); seedBorder(x, y0 - 1, z); }
    this._spread(sq, 4, box);
    this._spread(bq, 0, box);
    // mark sections whose light actually changed dirty
    const seen = new Set();
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const lc = this.lcols[(z >> 4) * this.chunksX + (x >> 4)];
      if (!lc) continue;
      const base = (x & 15) + 16 * (z & 15);
      for (let y = y0; y <= y1; y++) {
        if (old[(x - x0) + w * ((z - z0) + d * (y - y0))] === lc[base + 256 * y]) continue;
        // markDirty only depends on the section and on which of its faces the cell touches
        const lx = x & 15, lz = z & 15, ly = y % SECTION;
        const key = (x >> 4) + ',' + (z >> 4) + ',' + ((y / SECTION) | 0) + ':' + ((lx === 0) | (lx === 15) << 1 | (lz === 0) << 2 | (lz === 15) << 3 | (ly === 0) << 4 | (ly === SECTION - 1) << 5);
        if (seen.has(key)) continue;
        seen.add(key);
        this.markDirty(x, y, z);
      }
    }
  }

}
