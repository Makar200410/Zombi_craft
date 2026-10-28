// The horizon: low-detail land beyond the loaded chunks, so mountains, forests, seas and the neighbouring towns
// stand on the skyline instead of a wall of fog. Two rings of coloured heightmap (fine near, coarse far) are made
// by a worker from the world generator (src/world/farWorker.js) and re-centred as the camera travels; town
// buildings are drawn as simple blocks of their size and colour. The near ring has a round hole where the real
// chunks are, the far ring a square hole where the near ring is.
import * as THREE from 'three';
import { worldUniforms } from './chunkMaterials.js';
import { BUILDING_TYPES } from '../village/buildings.js';

const LEVELS = {
  high: [{ step: 4, n: 192, drop: 0.7 }, { step: 16, n: 192, drop: 3 }],
  medium: [{ step: 6, n: 128, drop: 0.8 }, { step: 24, n: 128, drop: 3.5 }],
};
export const HAZE = { high: 1500, medium: 1100 };       // how far the haze lets you see when the horizon is drawn

const WALLS = [0x8a6a45, 0x8a6a45, 0x9a958c, 0x9a958c, 0xa45c45, 0xa45c45, 0xbdbab2, 0xcfd3d8, 0xd8dde4, 0xe2e8ee];

/** Lambert material that skips fragments inside the hole(s) and takes the weather's snow. */
function holed(params, uni) {
  const mat = new THREE.MeshLambertMaterial(params);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = uni.hole; sh.uniforms.uSq = uni.sq; sh.uniforms.uSnowCover = worldUniforms.uSnowCover;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 fp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  fp = instanceMatrix * fp;
#endif
  vFarPos = (modelMatrix * fp).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarPos;\nuniform vec3 uHole;\nuniform vec3 uSq;\nuniform float uSnowCover;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (distance(vFarPos.xz, uHole.xy) < uHole.z) discard;
if (abs(vFarPos.x - uSq.x) < uSq.z && abs(vFarPos.z - uSq.y) < uSq.z) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${params.vertexColors ? 'diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2));    // the worker\'s colours are sRGB' : ''}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), uSnowCover * 0.8);`);
  };
  mat.customProgramCacheKey = () => 'farland' + (params.vertexColors ? 'v' : '');
  return mat;
}

export class FarTerrain {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'far-terrain';
    game.scene.add(this.group);
    this.levels = [];
    this.worker = null;
    this.world = null;
    this.townsSig = '';
    this._townT = 0;
    // towns: one box per building (walls), one per roof
    this.townUni = { hole: { value: new THREE.Vector3(0, 0, 0) }, sq: { value: new THREE.Vector3(0, 0, -1) } };
    this.townMat = holed({ vertexColors: false }, this.townUni);
    this.towns = null;
  }

  get quality() { return this.game.quality === 'high' ? 'high' : 'medium'; }
  /** True when the horizon is drawn (not on low quality, and only in the big generated worlds). */
  get active() { return !!this.worker && this.game.quality !== 'low' && this.group.visible; }

  /** New world: restart the worker on its generator and forget the old rings. */
  setWorld(world) {
    this.stop();
    this.world = world;
    if (!world || world.format < 3 || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('../world/farWorker.js', import.meta.url), { type: 'module' });
    } catch (e) { this.worker = null; return; }
    this.worker.onmessage = (e) => this._receive(e.data);
    this.worker.onerror = (e) => { console.warn('far terrain worker failed', e.message); this.stop(); };
    this.worker.postMessage({ t: 'init', size: world.size, seed: world.seed, height: world.height, sea: world.sea, format: world.format });
    this._build();
  }
  stop() {
    this.worker?.terminate(); this.worker = null;
    for (const l of this.levels) if (l.mesh) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); l.mat.dispose(); }
    this.levels = [];
    if (this.towns) { this.group.remove(this.towns); this.towns.geometry.dispose(); this.towns = null; }
    this.townsSig = '';
  }
  _build() {
    this._q = this.quality;
    this.levels = LEVELS[this._q].map((L, i) => {
      const uni = { hole: { value: new THREE.Vector3(0, 0, 0) }, sq: { value: new THREE.Vector3(0, 0, -1) } };
      return { ...L, i, uni, mat: holed({ vertexColors: true }, uni), mesh: null, cx: null, cz: null, pending: false, index: null };
    });
  }

  _request(l, x, z) {
    const s = l.step * 4;              // centres on a coarse lattice: the samples stay put, no shimmering
    const cx = Math.round(x / s) * s, cz = Math.round(z / s) * s;
    if (cx === l.cx && cz === l.cz) return;
    l.pending = true;
    this.worker.postMessage({ t: 'level', id: this._q, lvl: l.i, n: l.n, step: l.step, drop: l.drop, cx, cz });
  }
  _receive(m) {
    if (m.t !== 'level' || m.id !== this._q) return;
    const l = this.levels[m.lvl]; if (!l) return;
    l.pending = false;
    if (!l.index) {
      const N1 = l.n + 1, idx = new Uint32Array(l.n * l.n * 6);
      let k = 0;
      for (let j = 0; j < l.n; j++) for (let i = 0; i < l.n; i++) {
        const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      l.index = new THREE.BufferAttribute(idx, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.col, 3, true));
    g.setIndex(l.index);
    g.computeBoundingSphere();
    if (l.mesh) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); }
    l.mesh = new THREE.Mesh(g, l.mat);
    l.mesh.position.set(m.cx, 0, m.cz);
    l.mesh.matrixAutoUpdate = false; l.mesh.updateMatrix();
    l.mesh.castShadow = l.mesh.receiveShadow = false;
    l.mesh.renderOrder = -1;
    this.group.add(l.mesh);
    l.cx = m.cx; l.cz = m.cz;
  }

  /** Town buildings as blocks: the rivals' (walls by age, roofs in the town colour) and the player's village. */
  _townBoxes() {
    const R = this.game.rivals, boxes = [];
    const hcache = this._hcache || (this._hcache = new Map());
    if (R?.active) for (const r of R.list) {
      const plan = R._plan(r), roof = new THREE.Color(r.color).multiplyScalar(0.8).getHex();
      for (let k = 0; k < Math.min(r.built, plan.length); k++) {
        const p = plan[k], def = BUILDING_TYPES[p.type];
        const key = p.type + ':' + p.variant + ':' + p.rot + ':' + r.tier;
        let L = hcache.get(key);
        if (!L) { const full = def.layout(p.rot, p.variant, r.tier, def.growAt(r.tier)); L = { w: full.w, d: full.d, height: full.height }; hcache.set(key, L); }
        const ox = p.x + ((p.mw - L.w) >> 1), oz = p.z + ((p.md - L.d) >> 1);
        boxes.push([ox, r.y + 1, oz, L.w, L.d, L.height, WALLS[Math.min(9, r.tier - 1)], roof]);
      }
    }
    const V = this.game.village;
    if (V?.buildings) for (const b of V.buildings) if (b.w && b.height) boxes.push([b.x, b.y, b.z, b.w, b.d, b.height, WALLS[Math.min(9, (b.tier || 1) - 1)], 0x3c64b4]);
    return boxes;
  }
  _updateTowns() {
    const R = this.game.rivals, V = this.game.village;
    const sig = (R?.list || []).map(r => r.built + '.' + r.tier).join(',') + '|' + (V?.buildings?.length || 0) + '.' + (this.game.state.age | 0);
    if (sig === this.townsSig) return;
    this.townsSig = sig;
    if (this.towns) { this.group.remove(this.towns); this.towns.geometry.dispose(); this.towns.dispose?.(); this.towns = null; }
    const boxes = this._townBoxes();
    if (!boxes.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    const mesh = new THREE.InstancedMesh(geo, this.townMat, boxes.length * 2);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    for (const [x, y, z, w, d, h, wall, roof] of boxes) {
      const hw = Math.max(2, h * 0.68);
      m.makeScale(w, hw, d).setPosition(x, y, z); mesh.setMatrixAt(n, m); mesh.setColorAt(n++, c.setHex(wall));
      m.makeScale(w - 1, Math.max(1, h - hw), d - 1).setPosition(x + 0.5, y + hw, z + 0.5); mesh.setMatrixAt(n, m); mesh.setColorAt(n++, c.setHex(roof));
    }
    mesh.count = n;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.towns = mesh;
    this.group.add(mesh);
  }

  /** Per frame: hide underground / on low quality, re-centre the rings, move the holes. */
  update(viewFar, cave) {
    const g = this.game;
    const show = !!this.worker && g.quality !== 'low' && cave < 0.6;
    this.group.visible = show;
    if (!show) return;
    if (this._q !== this.quality) { const w = this.world; this.setWorld(w); if (!this.worker) return; }
    const cam = g.camera.position;
    for (const l of this.levels) {
      const reach = l.step * l.n / 2;
      if (!l.pending && (l.cx === null || Math.max(Math.abs(cam.x - l.cx), Math.abs(cam.z - l.cz)) > reach * 0.22)) this._request(l, cam.x, cam.z);
    }
    // the real chunks cover a circle around the camera: the near ring leaves it to them
    const hole = Math.max(24, viewFar - 6);
    const [L0, L1] = this.levels;
    L0.uni.hole.value.set(cam.x, cam.z, hole);
    L1.uni.hole.value.set(cam.x, cam.z, hole);
    if (L0.mesh) L1.uni.sq.value.set(L0.cx, L0.cz, L0.step * L0.n / 2 - L1.step * 1.5);
    else L1.uni.sq.value.set(0, 0, -1);
    this.townUni.hole.value.set(cam.x, cam.z, hole);
    const now = performance.now();
    if (now > this._townT) { this._townT = now + 1500; this._updateTowns(); }
  }
}
