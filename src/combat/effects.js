// Visual effects for combat: pooled dynamic point lights, additive glow sprites, shock rings,
// lightning ribbons, tracers. Everything is pooled so phones never allocate during fights.
import * as THREE from 'three';

let _glowTex = null;
/** Soft radial glow texture shared by all additive sprites. */
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
let _ringTex = null;
function ringTexture() {
  if (_ringTex) return _ringTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,.15)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _ringTex = new THREE.CanvasTexture(c); _ringTex.colorSpace = THREE.SRGBColorSpace;
  return _ringTex;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

/** Fixed pool of point lights; always in the scene (intensity 0 when idle) so shaders never recompile. */
export class LightPool {
  constructor(scene, count) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.castShadow = false;
      l.position.set(0, -1000, 0);
      scene.add(l);
      this.items.push({ light: l, t: 0, dur: 0, i0: 0, follow: null, prio: 0, free: true });
    }
  }
  _grab(prio) {
    let best = null;
    for (const it of this.items) if (it.free) return it;
    for (const it of this.items) if (!it.follow && (!best || it.prio < best.prio || (it.prio === best.prio && it.t / (it.dur || 1) > best.t / (best.dur || 1)))) best = it;
    if (!best || best.prio > prio) return null;
    return best;
  }
  /** One-shot flash that fades out. */
  flash(pos, color, intensity, dur, distance = 12, prio = 1) {
    const it = this._grab(prio); if (!it) return null;
    it.free = false; it.follow = null; it.t = 0; it.dur = dur; it.i0 = intensity; it.prio = prio;
    it.light.color.set(color); it.light.distance = distance; it.light.intensity = intensity;
    it.light.position.copy(pos);
    return it;
  }
  /** Light that follows an object (e.g. fireball) until released. */
  attach(obj, color, intensity, distance = 8) {
    const it = this._grab(2); if (!it) return null;
    it.free = false; it.follow = obj; it.t = 0; it.dur = Infinity; it.i0 = intensity; it.prio = 2;
    it.light.color.set(color); it.light.distance = distance; it.light.intensity = intensity;
    it.light.position.copy(obj.position);
    return it;
  }
  release(it, fade = 0.15) { if (!it || it.free) return; it.follow = null; it.t = 0; it.dur = fade; it.prio = 0; }
  update(dt, time) {
    for (const it of this.items) {
      if (it.free) continue;
      if (it.follow) {
        it.light.position.copy(it.follow.position);
        it.light.intensity = it.i0 * (0.85 + 0.15 * Math.sin(time * 37 + it.i0));
        continue;
      }
      it.t += dt;
      const k = 1 - it.t / it.dur;
      if (k <= 0) { it.free = true; it.light.intensity = 0; it.light.position.y = -1000; continue; }
      it.light.intensity = it.i0 * k * k;
    }
  }
}

/** Pooled short-lived visuals: glow sprites, rings, ribbons (lightning), tracers. */
export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.active = [];
    this.pools = { sprite: [], ring: [], ribbon: [], tracer: [] };
  }

  _sprite() {
    let s = this.pools.sprite.pop();
    if (!s) {
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      s = new THREE.Sprite(m); s.renderOrder = 6;
    }
    s.visible = true; this.scene.add(s);
    return s;
  }
  /** Additive glow flash: grows from size0 to size1 while fading. */
  glow(pos, color, size0, size1, dur, opts = {}) {
    const s = this._sprite();
    s.position.copy(pos); s.material.color.set(color); s.material.opacity = opts.opacity ?? 1;
    s.scale.setScalar(size0);
    this.active.push({ kind: 'sprite', obj: s, t: 0, dur, size0, size1, op: opts.opacity ?? 1, vel: opts.vel ? opts.vel.clone() : null });
    return s;
  }
  /** Flat expanding ring on the ground (shockwave / heal nova). */
  ring(pos, color, r0, r1, dur, opts = {}) {
    let m = this.pools.ring.pop();
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({ map: ringTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2; m.renderOrder = 6;
    }
    m.visible = true; this.scene.add(m);
    m.position.copy(pos); m.position.y += 0.08;
    m.material.color.set(color); m.material.opacity = opts.opacity ?? 1;
    m.scale.setScalar(r0);
    this.active.push({ kind: 'ring', obj: m, t: 0, dur, size0: r0, size1: r1, op: opts.opacity ?? 1 });
    return m;
  }
  /** Stretched glowing streak between two points that fades (bullet tracer). */
  tracer(from, to, color = 0xffe7a0, width = 0.05, dur = 0.12) {
    let m = this.pools.tracer.pop();
    if (!m) {
      const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, 0.5);
      m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.renderOrder = 6;
    }
    m.visible = true; this.scene.add(m);
    const len = from.distanceTo(to);
    m.position.copy(from); m.lookAt(to);
    m.scale.set(width, width, len);
    m.material.color.set(color); m.material.opacity = 1;
    this.active.push({ kind: 'tracer', obj: m, t: 0, dur, op: 1 });
    return m;
  }
  /** Jagged lightning ribbon along points (camera-facing quads). Two layers: glow + core. */
  lightning(points, opts = {}) {
    const dur = opts.dur ?? 0.32;
    const glow = this._ribbon(opts.glowColor ?? 0x6aa8ff, 0.55);
    const core = this._ribbon(opts.color ?? 0xeef6ff, 1);
    const fx = { kind: 'bolt', obj: glow, core, pts: points.map(p => p.clone()), t: 0, dur, jagT: 0, width: opts.width ?? 0.09 };
    this._buildBolt(fx);
    this.active.push(fx);
    return fx;
  }
  _ribbon(color, op) {
    let m = this.pools.ribbon.pop();
    if (!m) {
      const MAXV = 64 * 6;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3).setUsage(THREE.DynamicDrawUsage));
      m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.frustumCulled = false; m.renderOrder = 7;
    }
    m.material.color.set(color); m.material.opacity = op; m.userData.op = op;
    m.visible = true; this.scene.add(m);
    return m;
  }
  _buildBolt(fx) {
    // subdivide each segment with random midpoint displacement for the jagged look
    const pts = [];
    for (let i = 0; i < fx.pts.length - 1; i++) {
      const a = fx.pts[i], b = fx.pts[i + 1];
      const len = a.distanceTo(b);
      const n = Math.max(2, Math.min(14, Math.round(len / 0.9)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        if (k > 0) { const j = Math.min(0.6, len * 0.08); p.x += (Math.random() - 0.5) * j * 2; p.y += (Math.random() - 0.5) * j * 2; p.z += (Math.random() - 0.5) * j * 2; }
        pts.push(p);
      }
    }
    pts.push(fx.pts[fx.pts.length - 1].clone());
    const cam = this.game.camera.position;
    const write = (mesh, width) => {
      const arr = mesh.geometry.attributes.position.array;
      let o = 0;
      const segs = Math.min(pts.length - 1, 64);
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[i + 1];
        _v.subVectors(b, a); _v2.subVectors(a, cam);
        _v3.crossVectors(_v, _v2).normalize().multiplyScalar(width);
        const q = [a.x - _v3.x, a.y - _v3.y, a.z - _v3.z, a.x + _v3.x, a.y + _v3.y, a.z + _v3.z, b.x + _v3.x, b.y + _v3.y, b.z + _v3.z, b.x - _v3.x, b.y - _v3.y, b.z - _v3.z];
        for (const idx of [0, 1, 2, 0, 2, 3]) { arr[o++] = q[idx * 3]; arr[o++] = q[idx * 3 + 1]; arr[o++] = q[idx * 3 + 2]; }
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.setDrawRange(0, segs * 6);
    };
    write(fx.obj, fx.width * 4.5);
    write(fx.core, fx.width);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'sprite') {
        const e = 1 - (1 - k) * (1 - k);
        f.obj.scale.setScalar(f.size0 + (f.size1 - f.size0) * e);
        f.obj.material.opacity = f.op * (1 - k);
        if (f.vel) f.obj.position.addScaledVector(f.vel, dt);
      } else if (f.kind === 'ring') {
        const e = 1 - Math.pow(1 - k, 3);
        f.obj.scale.setScalar(f.size0 + (f.size1 - f.size0) * e);
        f.obj.material.opacity = f.op * (1 - k * k);
      } else if (f.kind === 'tracer') {
        f.obj.material.opacity = f.op * (1 - k);
      } else if (f.kind === 'bolt') {
        f.jagT += dt;
        if (f.jagT > 0.05 && k < 0.8) { f.jagT = 0; this._buildBolt(f); }
        const flick = k < 0.6 ? (0.65 + Math.random() * 0.35) : (1 - k) / 0.4;
        f.obj.material.opacity = f.obj.userData.op * flick; f.core.material.opacity = flick;
      }
      if (f.t >= f.dur) {
        this.active.splice(i, 1);
        this._free(f);
      }
    }
  }
  _free(f) {
    const put = (o, pool) => { o.visible = false; o.parent?.remove(o); this.pools[pool].push(o); };
    if (f.kind === 'sprite') put(f.obj, 'sprite');
    else if (f.kind === 'ring') put(f.obj, 'ring');
    else if (f.kind === 'tracer') put(f.obj, 'tracer');
    else if (f.kind === 'bolt') { put(f.obj, 'ribbon'); put(f.core, 'ribbon'); }
  }
  clear() { for (const f of this.active) this._free(f); this.active.length = 0; }
}
