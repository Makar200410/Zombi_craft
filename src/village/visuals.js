// Village-specific rendering helpers: translucent blueprint "ghost" blocks (instanced), held block meshes,
// selection rings, scaffolding and floating job labels.
import * as THREE from 'three';
import { BLOCKS, B } from '../core/blocks.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/**
 * Instanced translucent cubes textured with each block's atlas tile and tinted (cyan for blueprints,
 * green/red for placement preview). Grid lines on the cube edges make it read as a hologram.
 */
export class GhostLayer {
  constructor(game, { tint = 0x55e6ff, opacity = 0.42, renderOrder = 3 } = {}) {
    this.game = game;
    this.capacity = 0;
    this.mesh = null;
    this.uniforms = {
      map: { value: game.atlas.texture },
      uTint: { value: new THREE.Color(tint) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aSide; attribute vec4 aTop; attribute float aScale;
        varying vec2 vUv; varying vec2 vFace; varying float vShade; varying float vH;
        void main(){
          vec4 t = normal.y > 0.5 || normal.y < -0.5 ? aTop : aSide;
          vUv = vec2(mix(t.x, t.z, uv.x), mix(t.w, t.y, uv.y));
          vFace = uv;
          vShade = normal.y > 0.5 ? 1.0 : (normal.y < -0.5 ? 0.55 : (abs(normal.x) > 0.5 ? 0.8 : 0.9));
          vec3 p = position * aScale;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vH = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 uTint; uniform float uOpacity; uniform float uTime;
        varying vec2 vUv; varying vec2 vFace; varying float vShade; varying float vH;
        void main(){
          vec4 tex = texture2D(map, vUv);
          if (tex.a < 0.1) discard;
          vec2 e = min(vFace, 1.0 - vFace);
          float edge = 1.0 - smoothstep(0.0, 0.07, min(e.x, e.y));
          float scan = 0.5 + 0.5 * sin(vH * 6.0 - uTime * 3.0);
          vec3 base = mix(tex.rgb * vShade, uTint, 0.45);
          vec3 col = base + uTint * (edge * 0.9 + scan * 0.08);
          gl_FragColor = vec4(col, uOpacity + edge * 0.35);
          #include <colorspace_fragment>
        }`,
    });
    this._m = new THREE.Matrix4();
    this.group = new THREE.Group();
    this.group.name = 'ghosts';
    game.scene.add(this.group);
  }
  ensure(n) {
    if (n <= this.capacity && this.mesh) return;
    const cap = Math.max(256, Math.ceil(n * 1.5));
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose?.(); }
    const g = boxGeo.clone();
    this.aSide = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aTop = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSide', this.aSide); g.setAttribute('aTop', this.aTop); g.setAttribute('aScale', this.aScale);
    this.mesh = new THREE.InstancedMesh(g, this.material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.group.add(this.mesh);
    this.capacity = cap;
  }
  /** blocks: iterable of {x,y,z,id} world positions (block min corner). */
  set(blocks, count = blocks.length) {
    this.ensure(count);
    const atlas = this.game.atlas;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const b = blocks[i];
      const def = BLOCKS[b.id];
      if (!def || b.id === B.AIR) continue;
      const cross = def.shape === 'cross';
      const s = cross ? 0.45 : (def.shape === 'liquid' ? 0.9 : 0.985);
      this._m.makeTranslation(b.x + 0.5, b.y + (cross ? s / 2 : 0.5), b.z + 0.5);
      this.mesh.setMatrixAt(n, this._m);
      const side = atlas.uv(def.shape === 'liquid' ? 'water' : def.tiles.side), top = atlas.uv(def.shape === 'liquid' ? 'water' : def.tiles.top);
      this.aSide.array.set(side, n * 4); this.aTop.array.set(top, n * 4); this.aScale.array[n] = s;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aSide.needsUpdate = true; this.aTop.needsUpdate = true; this.aScale.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
  clear() { if (this.mesh) { this.mesh.count = 0; this.mesh.visible = false; } }
  setTint(c) { this.uniforms.uTint.value.set(c); }
  update(t) { this.uniforms.uTime.value = t; }
  dispose() { if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); } this.game.scene.remove(this.group); this.material.dispose(); }
}

// ---------------------------------------------------------------- textured block mesh (carried goods)
const blockGeoCache = new Map();
let blockMat = null;
export function makeBlockMesh(game, id, size = 0.36) {
  const def = BLOCKS[id];
  if (!def) return null;
  let g = blockGeoCache.get(id);
  if (!g) {
    g = new THREE.BoxGeometry(1, 1, 1);
    const uv = g.attributes.uv;
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
    for (let f = 0; f < 6; f++) {
      const tile = f === 2 ? def.tiles.top : f === 3 ? def.tiles.bottom : def.tiles.side;
      const [u0, v0, u1, v1] = game.atlas.uv(tile);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, u0 + (u1 - u0) * u, v1 + (v0 - v1) * v);
      }
    }
    uv.needsUpdate = true;
    blockGeoCache.set(id, g);
  }
  if (!blockMat) blockMat = new THREE.MeshLambertMaterial({ map: game.atlas.texture, alphaTest: 0.5 });
  const m = new THREE.Mesh(g, blockMat);
  m.scale.setScalar(size);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- selection visuals
export function makeRing(color = 0xffe066) {
  const g = new THREE.RingGeometry(0.55, 0.72, 40);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 6;
  return mesh;
}

/** Rectangle outline (flat, 0.18 wide) around a footprint. */
export function makeRect(w, d, color = 0xffe066, width = 0.18) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const mk = (sx, sz, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), mat); m.position.set(x, 0, z); m.renderOrder = 6; grp.add(m); };
  mk(w + width * 2, width, w / 2, -width / 2);
  mk(w + width * 2, width, w / 2, d + width / 2);
  mk(width, d, -width / 2, d / 2);
  mk(width, d, w + width / 2, d / 2);
  grp.userData.mat = mat;
  return grp;
}
export function disposeObj(o) {
  o.traverse(c => { c.geometry?.dispose?.(); if (c.material && !c.material._shared) c.material.dispose?.(); });
  o.parent?.remove(o);
}

// ---------------------------------------------------------------- scaffolding around construction sites
const scafMat = new THREE.MeshLambertMaterial({ color: 0x8a6238 });
scafMat._shared = true;
const poleGeo = new THREE.BoxGeometry(0.14, 1, 0.14);
const barGeo = new THREE.BoxGeometry(1, 0.1, 0.1);
export class Scaffold {
  constructor(game, b) {
    this.group = new THREE.Group();
    this.b = b;
    this.h = -1;
    game.scene.add(this.group);
  }
  setHeight(h) {
    h = Math.max(0, Math.ceil(h));
    if (h === this.h) return;
    this.h = h;
    const b = this.b, grp = this.group;
    while (grp.children.length) grp.remove(grp.children[0]);
    if (h <= 1) return;
    const x0 = b.x - 0.25, x1 = b.x + b.w + 0.25, z0 = b.z - 0.25, z1 = b.z + b.d + 0.25, y0 = b.y + 1;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const p = new THREE.Mesh(poleGeo, scafMat); p.scale.y = h + 0.6; p.position.set(x, y0 + (h + 0.6) / 2, z); p.castShadow = true; grp.add(p);
    }
    for (let y = 2; y <= h; y += 2) {
      for (const z of [z0, z1]) { const bar = new THREE.Mesh(barGeo, scafMat); bar.scale.x = x1 - x0; bar.position.set((x0 + x1) / 2, y0 + y - 0.5, z); grp.add(bar); }
      for (const x of [x0, x1]) { const bar = new THREE.Mesh(barGeo, scafMat); bar.scale.x = z1 - z0; bar.rotation.y = Math.PI / 2; bar.position.set(x, y0 + y - 0.5, (z0 + z1) / 2); grp.add(bar); }
    }
  }
  dispose() { this.group.parent?.remove(this.group); }
}

// ---------------------------------------------------------------- floating job labels (command mode)
const JOB_COLORS = {
  idle: '#8a8f99', builder: '#e08a2a', woodcutter: '#4f8a2e', farmer: '#d9b43a', miner: '#6f6f7a', blacksmith: '#b0482a',
  researcher: '#6a4ec2', guard: '#3d6fc7', mage: '#9b3dd0',
};
const labelCache = new Map();
export function jobLabelTexture(job, text) {
  const key = job + '|' + text;
  let t = labelCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px "Trebuchet MS", system-ui, sans-serif';
  const tw = Math.min(236, g.measureText(text).width + 50);
  const x0 = (256 - tw) / 2;
  g.fillStyle = 'rgba(12,14,20,0.78)';
  roundRect(g, x0, 10, tw, 44, 12); g.fill();
  g.fillStyle = JOB_COLORS[job] || '#888';
  g.beginPath(); g.arc(x0 + 22, 32, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.fillText(text, x0 + 40, 33, tw - 46);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, t);
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
export { JOB_COLORS };
