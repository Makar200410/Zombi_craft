import * as THREE from 'three';
import { BLOCKS } from '../core/blocks.js';

const MAX = 3000;

class Pool {
  constructor(scene, additive) {
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 4); this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX); this.baseSize = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: innerHeight / 2 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: additive
        ? `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC.rgb * (1.0 - r * 1.6), vC.a); }`
        : `varying vec4 vC; void main(){ gl_FragColor = vC; }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  add(x, y, z, vx, vy, vz, r, g, b, a, size, life, grav, drag) {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha[i] = a; this.baseSize[i] = size; this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt, pr = 1) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copy(n, i);
        i--; continue;
      }
      const d = Math.pow(this.drag[i], dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha[i] * Math.min(1, t * 3);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
    this.mat.uniforms.uScale.value = innerHeight * pr / 2 / Math.tan(Math.PI / 180 * 36);
  }
  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    this.size[to] = this.size[from]; this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.baseSize[to] = this.baseSize[from]; this.alpha[to] = this.alpha[from];
  }
}

const tmpC = new THREE.Color();

/**
 * game.particles.emit({ pos, count, color | colors[], speed, spread, dir, life, size, gravity, additive, drag, alpha, box })
 *  - pos: {x,y,z}; dir: base velocity {x,y,z}; spread: 0..1 randomness of direction; box: random start offset radius
 */
export class Particles {
  constructor(game) {
    this.game = game;
    this.normal = new Pool(game.scene, false);
    this.glow = new Pool(game.scene, true);
    this._tileColors = new Map();
  }
  emit(o) {
    const pool = o.additive ? this.glow : this.normal;
    const count = Math.round((o.count ?? 10) * (this.game.quality === 'low' ? 0.5 : 1));
    const speed = o.speed ?? 3, spread = o.spread ?? 1, life = o.life ?? 0.8, size = o.size ?? 0.15;
    const grav = o.gravity ?? 10, drag = o.drag ?? 0.6, alpha = o.alpha ?? 1, box = o.box ?? 0;
    const colors = o.colors || [o.color ?? 0xffffff];
    const p = o.pos;
    for (let i = 0; i < count; i++) {
      let dx = (Math.random() * 2 - 1), dy = (Math.random() * 2 - 1), dz = (Math.random() * 2 - 1);
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      let vx = dx * speed * spread, vy = dy * speed * spread, vz = dz * speed * spread;
      if (o.dir) { vx += o.dir.x; vy += o.dir.y; vz += o.dir.z; }
      const c = colors[(Math.random() * colors.length) | 0];
      if (typeof c === 'number') tmpC.setHex(c); else tmpC.copy(c);
      const jitter = 0.85 + Math.random() * 0.3;
      pool.add(p.x + (Math.random() * 2 - 1) * box, p.y + (Math.random() * 2 - 1) * box, p.z + (Math.random() * 2 - 1) * box,
        vx, vy, vz, tmpC.r * jitter, tmpC.g * jitter, tmpC.b * jitter, alpha, size * (0.7 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.8), grav, drag);
    }
  }
  /** Colors sampled from a block's atlas tile. */
  tileColors(name) {
    let arr = this._tileColors.get(name);
    if (arr) return arr;
    arr = [];
    const atlas = this.game.atlas;
    try {
      const ctx = atlas.canvas.getContext('2d');
      const [u0, v0, u1, v1] = atlas.uv(name);
      const W = atlas.canvas.width, H = atlas.canvas.height;
      const x = Math.floor(u0 * W), y = Math.floor(v0 * H), w = Math.max(1, Math.floor((u1 - u0) * W)), h = Math.max(1, Math.floor((v1 - v0) * H));
      const d = ctx.getImageData(x, y, w, h).data;
      for (let i = 0; i < 24; i++) {
        const k = ((Math.random() * w * h) | 0) * 4;
        if (d[k + 3] < 128) continue;
        arr.push(new THREE.Color(d[k] / 255, d[k + 1] / 255, d[k + 2] / 255).convertSRGBToLinear());
      }
    } catch (e) { /* ignore */ }
    if (!arr.length) arr.push(new THREE.Color(0x888888));
    this._tileColors.set(name, arr);
    return arr;
  }
  blockBreak(x, y, z, id) {
    const b = BLOCKS[id]; if (!b) return;
    this.emit({ pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, box: 0.35, count: 22, colors: this.tileColors(b.tiles.side), speed: 3, spread: 1, dir: { x: 0, y: 2.5, z: 0 }, gravity: 14, life: 0.9, size: 0.14, drag: 0.8 });
  }
  blockHit(x, y, z, id, point) {
    const b = BLOCKS[id]; if (!b) return;
    this.emit({ pos: point || { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, count: 4, colors: this.tileColors(b.tiles.side), speed: 2, dir: { x: 0, y: 1.5, z: 0 }, gravity: 14, life: 0.5, size: 0.1 });
  }
  update(dt) {
    const pr = this.game.renderer ? this.game.renderer.renderer.getPixelRatio() : 1;
    this.normal.update(dt, pr); this.glow.update(dt, pr);
  }
}
