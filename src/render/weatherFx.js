import * as THREE from 'three';
import { HEIGHT } from '../world/World.js';

// GPU precipitation: rain streaks / snow flakes live in a box that wraps around the view point (world-anchored,
// so walking through the rain does not drag it along). A small "roof map" (the highest block of every column
// around the camera) hides drops under roofs, trees and overhangs, and tells where splashes land.

const OCC = 96;               // roof map size in blocks (centred on the view point)

const VERT = `
attribute vec4 seed;          // x,z in the box (0..1), y phase (0..1), w = per-drop random
attribute vec2 corner;        // x: -1..1 across, y: 0 head .. 1 tail
uniform vec3 uCenter; uniform float uTime, uBox, uHeight, uFall, uLen, uWidth, uAmount, uSnow;
uniform vec2 uWind; uniform sampler2D uOcc; uniform vec2 uOccOrigin;
varying float vA; varying vec2 vUv;
void main(){
  if (seed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float fall = uFall * (0.85 + 0.3 * seed.w);
  vec3 p;
  p.y = seed.y * uHeight - uTime * fall;
  p.xz = seed.xz * uBox + uWind * uTime * (uSnow > 0.5 ? 0.7 : 1.0);
  if (uSnow > 0.5) { p.x += sin(uTime * 1.3 + seed.w * 40.0) * 0.6; p.z += cos(uTime * 1.1 + seed.w * 23.0) * 0.6; }
  // wrap into the box around the view point
  p.xz = uCenter.xz + mod(p.xz - uCenter.xz + uBox * 0.5, uBox) - uBox * 0.5;
  p.y = uCenter.y + mod(p.y - uCenter.y + uHeight * 0.5, uHeight) - uHeight * 0.5;
  // under a roof? (roof map stores the top of the highest block of the column)
  vec2 ouv = (floor(p.xz) - uOccOrigin + 0.5) / ${OCC.toFixed(1)};
  float roof = (ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0) ? texture2D(uOcc, ouv).r : 0.0;
  if (p.y < roof) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 vel = normalize(vec3(uWind.x, -fall, uWind.y));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side;
  if (uSnow > 0.5) {
    // flakes: small camera-facing squares
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 u = cross(toCam, r);
    p += r * corner.x * uWidth + u * (corner.y * 2.0 - 1.0) * uWidth;
  } else {
    side = normalize(cross(vel, toCam));
    p += side * corner.x * uWidth - vel * corner.y * uLen * (0.8 + 0.4 * seed.w);
  }
  float d = distance(p, cameraPosition);
  vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, distance(p.xz, uCenter.xz))) * smoothstep(0.3, 1.5, d);
  vUv = corner;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform vec3 uColor; uniform float uOpacity, uSnow; varying float vA; varying vec2 vUv;
void main(){
  float a;
  if (uSnow > 0.5) { vec2 q = vec2(vUv.x, vUv.y * 2.0 - 1.0); a = 1.0 - smoothstep(0.55, 1.0, length(q)); }
  else a = (1.0 - abs(vUv.x)) * (1.0 - vUv.y * 0.7);
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

function precipMesh(count, occTex) {
  const seed = new Float32Array(count * 4 * 4), corner = new Float32Array(count * 4 * 2), index = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let k = 0; k < 4; k++) seed.set(s, (i * 4 + k) * 4);
    corner.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 8);
    const v = i * 4;
    index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: {
      uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: 44 }, uHeight: { value: 34 }, uFall: { value: 24 },
      uLen: { value: 1.1 }, uWidth: { value: 0.022 }, uAmount: { value: 0 }, uSnow: { value: 0 }, uWind: { value: new THREE.Vector2() },
      uOcc: { value: occTex }, uOccOrigin: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0xb8c8dc) }, uOpacity: { value: 0.55 },
    },
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
  return m;
}

export class WeatherFx {
  constructor(game) {
    this.game = game;
    this.occData = new Float32Array(OCC * OCC);
    this.occ = new THREE.DataTexture(this.occData, OCC, OCC, THREE.RedFormat, THREE.FloatType);
    this.occ.magFilter = this.occ.minFilter = THREE.NearestFilter;
    this.occ.needsUpdate = true;
    this.occOrigin = { x: -1e6, z: -1e6 };
    this._occT = 0;
    const q = game.quality;
    const n = q === 'low' ? 1600 : q === 'medium' ? 3600 : 6000;
    this.rain = precipMesh(n, this.occ);
    this.snow = precipMesh(Math.round(n * 0.6), this.occ);
    const su = this.snow.material.uniforms;
    su.uSnow.value = 1; su.uFall.value = 2.6; su.uWidth.value = 0.07; su.uColor.value.set(0xffffff); su.uOpacity.value = 0.9; su.uBox.value = 40; su.uHeight.value = 26;
    game.scene.add(this.rain, this.snow);
    this.center = new THREE.Vector3();
    this.bolts = [];
    this.flashLight = new THREE.PointLight(0xc8d8ff, 0, 140, 1.2);
    game.scene.add(this.flashLight);
    this._splashT = 0;
  }

  /** Top of the highest non-air block of the column, or 0 if unknown. Uses the roof map when possible. */
  roofAt(x, z) {
    const ox = Math.floor(x) - this.occOrigin.x, oz = Math.floor(z) - this.occOrigin.z;
    if (ox >= 0 && oz >= 0 && ox < OCC && oz < OCC) return this.occData[oz * OCC + ox];
    return this._scanColumn(Math.floor(x), Math.floor(z));
  }
  _scanColumn(x, z) {
    const w = this.game.world, S = w.size;
    if (x < 0 || z < 0 || x >= S || z >= S) return 0;
    const b = w.blocks, step = S * S, base = x + S * z;
    for (let y = HEIGHT - 1; y >= 0; y--) if (b[base + step * y]) return y + 1;
    return 0;
  }
  _updateOcc(force) {
    const c = this.center;
    const ox = Math.floor(c.x) - OCC / 2, oz = Math.floor(c.z) - OCC / 2;
    const moved = Math.abs(ox - this.occOrigin.x) > 6 || Math.abs(oz - this.occOrigin.z) > 6;
    if (!force && !moved) return;
    this.occOrigin.x = ox; this.occOrigin.z = oz;
    const d = this.occData;
    for (let z = 0; z < OCC; z++) for (let x = 0; x < OCC; x++) d[z * OCC + x] = this._scanColumn(ox + x, oz + z);
    this.occ.needsUpdate = true;
  }

  /** w: {rain, snow, wind:{x,z}, amountRain, amountSnow} from the Weather system. */
  update(dt, w) {
    const g = this.game;
    if (!g.world) return;
    const cmd = g.mode === 'command';
    // precipitation follows the camera in first person and what the strategy camera looks at from above
    if (cmd && g.renderer) this.center.copy(g.renderer.shadowFocus).setY(g.renderer.shadowFocus.y + 14);
    else this.center.copy(g.camera.position);
    const active = w.rain > 0.01 || w.snow > 0.01;
    this._occT -= dt;
    if (active) { this._updateOcc(this._occT <= 0); if (this._occT <= 0) this._occT = 1.2; }
    const t = g.time;
    for (const [m, amt] of [[this.rain, w.rain], [this.snow, w.snow]]) {
      m.visible = amt > 0.01;
      if (!m.visible) continue;
      const u = m.material.uniforms;
      u.uCenter.value.copy(this.center); u.uTime.value = t; u.uAmount.value = Math.min(1, amt);
      u.uWind.value.set(w.wind.x, w.wind.z);
      u.uOccOrigin.value.set(this.occOrigin.x, this.occOrigin.z);
      const big = cmd ? 1.8 : 1;
      if (m === this.rain) { u.uBox.value = 44 * big; u.uHeight.value = 34 * big; u.uFall.value = 22 + 8 * amt; u.uLen.value = 0.9 + amt * 0.5; u.uWidth.value = cmd ? 0.06 : 0.022; u.uOpacity.value = 0.45 + amt * 0.35; }
      else { u.uBox.value = 40 * big; u.uHeight.value = 26 * big; u.uWidth.value = cmd ? 0.14 : 0.07; }
      // night: rain picks up less light
      const night = g.state.nightFactor;
      if (m === this.rain) u.uColor.value.setRGB(0.86, 0.9, 1).multiplyScalar(1 - night * 0.72);
      else u.uColor.value.setScalar(1 - night * 0.55);
    }
    if (w.rain > 0.05) this._splashes(dt, w.rain);
    this._boltsUpdate(dt);
  }

  // splashes where drops hit the ground (or a roof) near the view point
  _splashes(dt, amt) {
    const g = this.game;
    this._splashT += dt * amt * (g.quality === 'low' ? 30 : 80);
    const P = g.particles, c = this.center;
    const night = g.state.nightFactor;
    const col = [night > 0.5 ? 0x5a6478 : 0xc8d6e6, night > 0.5 ? 0x48526a : 0xe2ecf6];
    while (this._splashT >= 1) {
      this._splashT -= 1;
      const x = c.x + (Math.random() - 0.5) * 26, z = c.z + (Math.random() - 0.5) * 26;
      const y = this.roofAt(x, z);
      if (!y || Math.abs(y - g.camera.position.y) > 24) continue;
      P.emit({ pos: { x, y: y + 0.05, z }, count: 3, colors: col, speed: 1.6, spread: 0.7, dir: { x: 0, y: 1.8, z: 0 }, gravity: 12, drag: 0.8, life: 0.25, size: 0.08, alpha: 0.8 });
    }
  }

  // ---- lightning ---------------------------------------------------------
  /** Draws a jagged bolt from the clouds to (x, y, z) and flashes the scene. */
  bolt(x, y, z) {
    const g = this.game, cam = g.camera.position;
    const top = Math.max(y + 60, 120);
    const pts = [];
    let px = x + (Math.random() - 0.5) * 20, pz = z + (Math.random() - 0.5) * 20;
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const yy = top + (y - top) * f;
      const tx = px + (x - px) * f, tz = pz + (z - pz) * f;
      const j = i === steps ? 0 : (1 - f * 0.6) * 3.2;
      pts.push(new THREE.Vector3(tx + (Math.random() - 0.5) * j, yy, tz + (Math.random() - 0.5) * j));
    }
    const lines = [pts];
    // a few branches
    for (let b = 0; b < 3; b++) {
      const k = 3 + ((Math.random() * (steps - 8)) | 0);
      const br = [pts[k].clone()];
      const dir = new THREE.Vector3(Math.random() - 0.5, -1, Math.random() - 0.5).normalize();
      for (let i = 0; i < 6; i++) br.push(br[br.length - 1].clone().addScaledVector(dir, 3 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)));
      lines.push(br);
    }
    const group = new THREE.Group();
    const view = new THREE.Vector3().subVectors(cam, new THREE.Vector3(x, (y + top) / 2, z)).normalize();
    for (const [li, line] of lines.entries()) {
      for (const [w, a] of [[li ? 0.25 : 0.45, 1], [li ? 0.9 : 1.8, 0.35]]) {
        const pos = [], idx = [];
        for (let i = 0; i < line.length; i++) {
          const p = line[i], n = line[Math.min(i + 1, line.length - 1)], pr = line[Math.max(i - 1, 0)];
          const t = new THREE.Vector3().subVectors(n, pr).normalize();
          const s = new THREE.Vector3().crossVectors(t, view).normalize().multiplyScalar(w * (1 - (i / line.length) * (li ? 0.8 : 0.3)));
          pos.push(p.x - s.x, p.y - s.y, p.z - s.z, p.x + s.x, p.y + s.y, p.z + s.z);
          if (i) { const v = i * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mat = new THREE.MeshBasicMaterial({ color: a === 1 ? 0xf4f6ff : 0x9ab4ff, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 7;
        group.add(mesh);
      }
    }
    g.scene.add(group);
    this.bolts.push({ group, t: 0, life: 0.45 + Math.random() * 0.2, flicker: Math.random() * 10 });
    this.flashLight.position.set(x, y + 8, z);
    this.flash = 1;
  }
  _boltsUpdate(dt) {
    this.flash = Math.max(0, (this.flash || 0) - dt * 3.2);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const f = b.t / b.life;
      // stroboscopic flicker, then fade
      const on = f < 0.15 ? 1 : (Math.sin((b.t + b.flicker) * 60) > -0.2 ? 1 - f : 0.15 * (1 - f));
      b.group.traverse(o => { if (o.material) o.material.opacity = (o.material.color.getHex() === 0xf4f6ff ? 1 : 0.35) * Math.max(0, on); });
      if (b.t >= b.life) {
        this.game.scene.remove(b.group);
        b.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
        this.bolts.splice(i, 1);
      }
    }
    // sky flash: sharp at first, then a second weaker pulse
    const fl = this.flash || 0;
    this.skyFlash = fl > 0 ? Math.pow(fl, 1.5) * (0.75 + 0.25 * Math.sin(fl * 40)) : 0;
    this.flashLight.intensity = this.skyFlash * 900;
    this.flashLight.visible = this.skyFlash > 0.01;
  }
}
