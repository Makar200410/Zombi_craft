import * as THREE from 'three';
import { CHUNK, SECTION } from '../world/World.js';
import { meshChunk } from '../world/mesher.js';
import { TILE_NAMES } from '../core/blocks.js';
import { createChunkMaterials } from './chunkMaterials.js';

const KINDS = ['solid', 'plants', 'water', 'glass'];
// sections no sky light reaches (deep caves) are drawn only when the camera is about this close to them vertically
const CAVE_VIEW = 56;

/**
 * Owns the terrain meshes, one per chunk section (16 × SECTION × 16). Rebuilds dirty sections within a per-frame
 * time budget, nearest first; caves deep underground are meshed and drawn only when the camera gets near them.
 */
export class ChunkRenderer {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    this.meshes = new Map();   // 'cx,cz,sy' -> {solid, plants, water, glass, sky, y0, y1}
    this.materials = createChunkMaterials(game.atlas.texture);
    this._minH = new Map();    // chunk -> lowest surface height in it
    game.scene.add(this.group);
    game.bus?.on('chunk:generated', ({ cx, cz }) => this._minH.delete(cx + ',' + cz));
    game.bus?.on('chunk:unloaded', ({ cx, cz }) => this.dropChunk(cx, cz));
    this._startMesher();
  }
  /** Meshing runs in a background worker where there is one (the main thread only builds the GPU buffers). */
  _startMesher() {
    this.inflight = new Map();          // section key -> job sent
    this.ready = [];                    // finished geometry waiting to be put on screen
    if (typeof Worker === 'undefined') return;
    try {
      const w = this.world, uvs = {};
      for (const n of TILE_NAMES) uvs[n] = this.game.atlas.uv(n);
      this.mesher = new Worker(new URL('../world/meshWorker.js', import.meta.url), { type: 'module' });
      this.mesher.onmessage = (e) => { if (e.data?.t === 'mesh') { this.inflight.delete(e.data.key); this.ready.push(e.data); } };
      this.mesher.onerror = (e) => { console.warn('[chunks] mesh worker failed, meshing on the main thread', e?.message); this.mesher = null; this.inflight.clear(); };
      this.mesher.postMessage({ t: 'init', size: w.size, height: w.height, chunksX: w.chunksX, uvs });
    } catch (e) { this.mesher = null; }
  }
  /** Sends a section to the mesh worker: its chunk and the 8 around it, only the layers the mesher looks at. */
  _post(key) {
    const [cx, cz, sy] = parse(key);
    const w = this.world, H = w.height, N = w.chunksX;
    const ya = Math.max(0, sy * SECTION - 2), yb = Math.min(H - 1, (sy + 1) * SECTION + 1);
    const blocks = [], light = [], transfer = [];
    for (let i = 0; i < 9; i++) {
      const x = cx + (i % 3) - 1, z = cz + ((i / 3) | 0) - 1, k = z * N + x;
      const c = x >= 0 && z >= 0 && x < N && z < N ? w.cols[k] : null;
      if (!c) { blocks.push(null); light.push(null); continue; }
      const b = c.slice(256 * ya, 256 * (yb + 1)), l = w.lcols[k].slice(256 * ya, 256 * (yb + 1));
      blocks.push(b); light.push(l); transfer.push(b.buffer, l.buffer);
    }
    this.inflight.set(key, true);
    this.mesher.postMessage({ t: 'mesh', key, cx, cz, sy, ya, blocks, light, opts: this._opts() }, transfer);
  }
  _opts() { return { fancyLeaves: this.game.quality !== 'low', lowDetail: this.game.quality === 'low' }; }
  /** Lowest surface in a chunk: sections well below it are underground. */
  minSurface(cx, cz) {
    const k = cx + ',' + cz;
    let v = this._minH.get(k);
    if (v === undefined) {
      const w = this.world, S = w.size;
      v = w.height;
      for (let z = cz * CHUNK; z < Math.min(S, cz * CHUNK + CHUNK); z++) for (let x = cx * CHUNK; x < Math.min(S, cx * CHUNK + CHUNK); x++) v = Math.min(v, w.heightAt(x, z));
      if (w.isGenerated(cx * CHUNK, cz * CHUNK)) this._minH.set(k, v);
    }
    return v;
  }
  /** Is a section deep underground (below the chunk's surface by more than a cave mouth)? */
  _underground(cx, cz, sy) { return (sy + 1) * SECTION < this.minSurface(cx, cz) - 24; }
  /** Mesh only the sections around a point now (and not the deep caves); the rest are meshed lazily. */
  buildNear(x, z, radius = 88) {
    const r2 = radius * radius;
    for (const k of [...this.world.dirty]) {
      const [cx, cz, sy] = parse(k);
      if (hdist(cx, cz, x, z) > r2 || this._underground(cx, cz, sy)) continue;
      this.rebuild(k); this.world.dirty.delete(k);
    }
  }
  buildAll() {
    const w = this.world, c = this.game.village?.townHall?.center || { x: w.size / 2, z: w.size / 2 };
    this.buildNear(c.x, c.z);
  }
  rebuild(key) {
    const [cx, cz, sy] = parse(key);
    this._apply(key, meshChunk(this.world, cx, cz, sy, this.game.atlas, this._opts()));
  }
  /** Puts a section's geometry on screen (replacing what was there). */
  _apply(key, data) {
    const [cx, cz, sy] = parse(key);
    if (!this.world.isGenerated(cx * CHUNK, cz * CHUNK)) return;        // unloaded while it was being meshed
    let slot = this.meshes.get(key);
    if (!KINDS.some(k => data[k])) { if (slot) this._drop(key, slot); return; }
    if (!slot) { slot = { y0: sy * SECTION, y1: (sy + 1) * SECTION }; this.meshes.set(key, slot); }
    slot.sky = data.sky;
    const shadows = this.game.quality !== 'low';
    for (const kind of KINDS) {
      const d = data[kind];
      let mesh = slot[kind];
      if (!d) { if (mesh) { this.group.remove(mesh); mesh.geometry.dispose(); slot[kind] = null; } continue; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
      g.setAttribute('light', new THREE.BufferAttribute(d.light, 4));
      g.setIndex(new THREE.BufferAttribute(d.index, 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CHUNK, slot.y0 - 1, cz * CHUNK), new THREE.Vector3(cx * CHUNK + CHUNK, slot.y1 + 1, cz * CHUNK + CHUNK));
      g.boundingSphere = new THREE.Sphere(); g.boundingBox.getBoundingSphere(g.boundingSphere);
      if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; }
      else {
        mesh = new THREE.Mesh(g, this.materials[kind]);
        mesh.matrixAutoUpdate = false;
        mesh.name = 'chunk_' + kind;
        if (kind === 'solid' || kind === 'plants') {
          mesh.castShadow = shadows; mesh.receiveShadow = shadows;
          mesh.customDepthMaterial = kind === 'plants' ? this.materials.plantDepth : this.materials.solidDepth;
        } else { mesh.receiveShadow = shadows; }
        if (kind === 'water') mesh.renderOrder = 2;
        if (kind === 'glass') mesh.renderOrder = 1;
        this.group.add(mesh);
        slot[kind] = mesh;
      }
    }
    this._applyVis(key, slot);
  }
  _drop(key, slot) {
    for (const kind of KINDS) if (slot[kind]) { this.group.remove(slot[kind]); slot[kind].geometry.dispose(); }
    this.meshes.delete(key);
  }
  /** Removes the meshes of an unloaded chunk. */
  dropChunk(cx, cz) {
    for (let sy = 0; sy < this.world.sections; sy++) { const k = cx + ',' + cz + ',' + sy; const s = this.meshes.get(k); if (s) this._drop(k, s); }
    this._minH.delete(cx + ',' + cz);
  }
  _visible(key, slot) {
    const cam = this.game.camera.position;
    const fog = this.game.scene.fog;
    const far = (this.game.renderer?.viewFar || (fog ? fog.far : 200)) + (this.game.quality === 'low' ? 10 : 20);
    const [cx, cz] = parse(key);
    if (hdist(cx, cz, cam.x, cam.z) > far * far) return false;
    if (slot.sky) return true;
    // a dark cave section: only when the camera is near it in height
    const dy = cam.y < slot.y0 ? slot.y0 - cam.y : cam.y > slot.y1 ? cam.y - slot.y1 : 0;
    return dy < CAVE_VIEW;
  }
  _applyVis(key, slot) {
    const vis = this._visible(key, slot);
    for (const kind of KINDS) if (slot[kind]) slot[kind].visible = vis;
  }
  /** Hide sections inside the fog or deep below / above the camera (big win on phones). */
  cullDistant() {
    for (const [key, slot] of this.meshes) this._applyVis(key, slot);
  }
  update() {
    if ((this._cullT = (this._cullT || 0) + 1) % 10 === 0) this.cullDistant();
    // the big world is generated lazily: make terrain ahead of the player / camera within the fog + margin
    const w = this.world, g = this.game;
    if (w.pumpGeneration) {
      const fogFar = g.renderer?.viewFar || (g.scene.fog ? g.scene.fog.far : 120);
      const p = g.mode === 'command' ? g.camera.position : (g.player?.position || g.camera.position);
      w.pumpGeneration(p.x, p.z, fogFar + 24, g.quality === 'low' ? 2.5 : 4);
      // tall worlds: forget what is far behind (it is generated again, with its edits, when we come back)
      if (w.format >= 3 && (this._unloadT = (this._unloadT || 0) + 1) % 180 === 0) {
        const c = g.village?.townHall?.center || { x: w.size / 2, z: w.size / 2 };
        w.unloadFar(p.x, p.z, fogFar + 140, c.x, c.z);
      }
    }
    // finished meshes from the worker go on screen within a small budget
    if (this.ready.length) {
      const t0 = performance.now();
      while (this.ready.length && performance.now() - t0 < 4) { const r = this.ready.shift(); this._apply(r.key, r.data); }
    }
    const dirty = this.world.dirty;
    if (!dirty.size) return;
    const cam = this.game.camera.position;
    // only sections that could be seen (inside the fog + margin; deep caves only near the camera)
    const fog = this.game.scene.fog;
    const reach = (this.game.renderer?.viewFar || (fog ? fog.far : 200)) + 32, r2 = reach * reach;
    const keys = [], dd = new Map();
    for (const k of dirty) {
      const [cx, cz, sy] = parse(k);
      const h2 = hdist(cx, cz, cam.x, cam.z);
      if (h2 > r2) continue;
      const y0 = sy * SECTION, y1 = y0 + SECTION;
      const dy = cam.y < y0 ? y0 - cam.y : cam.y > y1 ? cam.y - y1 : 0;
      if (dy > CAVE_VIEW + 8 && this._underground(cx, cz, sy)) continue;
      keys.push(k); dd.set(k, h2 + dy * dy * 2);
    }
    if (!keys.length) return;
    keys.sort((a, b) => dd.get(a) - dd.get(b));
    if (this.mesher) {
      // right around the camera (the player digging and building) at once, so edits never lag a frame
      const t0 = performance.now();
      for (const k of keys) {
        if (dd.get(k) > 20 * 20 || performance.now() - t0 > 4) break;
        if (this.inflight.has(k)) continue;
        this.rebuild(k); dirty.delete(k);
      }
      // the rest nearest first, a handful in flight (a section edited again meanwhile is simply sent again later)
      for (const k of keys) {
        if (!dirty.has(k)) continue;
        if (this.inflight.size >= 6) break;
        if (this.inflight.has(k)) continue;
        dirty.delete(k);
        this._post(k);
      }
      return;
    }
    const t0 = performance.now();
    for (const k of keys) {
      this.rebuild(k);
      dirty.delete(k);
      if (performance.now() - t0 > 6) break;
    }
  }
  setShadows(on) {
    for (const slot of this.meshes.values()) for (const kind of ['solid', 'plants']) if (slot[kind]) { slot[kind].castShadow = on; slot[kind].receiveShadow = on; }
  }
}
function parse(key) {
  const a = key.indexOf(','), b = key.indexOf(',', a + 1);
  return [+key.slice(0, a), +key.slice(a + 1, b < 0 ? undefined : b), b < 0 ? 0 : +key.slice(b + 1)];
}
function hdist(cx, cz, x, z) {
  const dx = cx * CHUNK + 8 - x, dz = cz * CHUNK + 8 - z;
  return dx * dx + dz * dz;
}
