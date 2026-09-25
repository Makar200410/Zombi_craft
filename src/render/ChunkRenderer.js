import * as THREE from 'three';
import { CHUNK, HEIGHT } from '../world/World.js';
import { meshChunk } from '../world/mesher.js';
import { createChunkMaterials } from './chunkMaterials.js';

/** Owns chunk meshes; rebuilds dirty chunks within a per-frame time budget, nearest first. */
export class ChunkRenderer {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    this.meshes = new Map();   // key -> {solid, plants, water, glass}
    this.materials = createChunkMaterials(game.atlas.texture);
    game.scene.add(this.group);
  }
  buildAll() {
    for (const k of [...this.world.dirty]) this.rebuild(k);
    this.world.dirty.clear();
  }
  rebuild(key) {
    const [cx, cz] = key.split(',').map(Number);
    const data = meshChunk(this.world, cx, cz, this.game.atlas, { fancyLeaves: this.game.quality !== 'low' });
    let slot = this.meshes.get(key);
    if (!slot) { slot = {}; this.meshes.set(key, slot); }
    const shadows = this.game.quality !== 'low';
    for (const kind of ['solid', 'plants', 'water', 'glass']) {
      const d = data[kind];
      let mesh = slot[kind];
      if (!d) { if (mesh) { this.group.remove(mesh); mesh.geometry.dispose(); slot[kind] = null; } continue; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
      g.setAttribute('light', new THREE.BufferAttribute(d.light, 4));
      g.setIndex(new THREE.BufferAttribute(d.index, 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CHUNK, 0, cz * CHUNK), new THREE.Vector3(cx * CHUNK + CHUNK, HEIGHT, cz * CHUNK + CHUNK));
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
  }
  update() {
    const dirty = this.world.dirty;
    if (!dirty.size) return;
    const cam = this.game.camera.position;
    const keys = [...dirty].sort((a, b) => dist(a, cam) - dist(b, cam));
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
function dist(key, p) {
  const i = key.indexOf(',');
  const x = +key.slice(0, i) * CHUNK + 8 - p.x, z = +key.slice(i + 1) * CHUNK + 8 - p.z;
  return x * x + z * z;
}
