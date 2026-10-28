// Non-human monster bodies (cave spider, slime) with the same interface as HumanoidModel, so the Zombie AI can
// drive them: group / root / body / head / hand, px, material, play(), update(dt, speed), flash(), setLight().
import * as THREE from 'three';

const ACTIONS = { attack: 0.32, hurt: 0.25, cast: 0.5, shoot: 0.35 };

function hide(canvasDraw, w = 32, h = 32) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  canvasDraw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {};
function texFor(kind, tint) {
  const key = kind + ':' + tint;
  if (TEX[key]) return TEX[key];
  const base = new THREE.Color(tint);
  const col = (k, j = 0) => { const c = base.clone().multiplyScalar(k + j); return `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`; };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  TEX[key] = hide((g, w, h) => {
    if (kind === 'slime') {
      g.fillStyle = col(1); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = col(0.8 + rnd() * 0.5); g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 2, 2); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(3, 3, 6, 3); g.fillRect(3, 6, 3, 3);
    } else {
      // hairy chitin
      g.fillStyle = col(0.55); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) { g.fillStyle = col(0.3 + rnd() * 0.6); g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 1, 2); }
      g.fillStyle = col(0.9); for (let i = 0; i < 4; i++) g.fillRect(6 + i * 6, 14, 3, 3);
    }
  });
  return TEX[key];
}

export class CreatureModel {
  /** kind: 'spider' | 'slime'; size ~ the creature's height in blocks; tint: body colour. */
  constructor({ kind = 'spider', size = 0.9, tint = 0x3a3036, width = 1 } = {}) {
    this.kind = kind;
    const px = this.px = size / 16;
    this.group = new THREE.Group();
    this.root = new THREE.Group(); this.group.add(this.root);
    this.material = new THREE.MeshLambertMaterial({ map: texFor(kind, tint), transparent: kind === 'slime', opacity: kind === 'slime' ? 0.88 : 1 });
    this.body = new THREE.Group(); this.root.add(this.body);
    this.head = new THREE.Group(); this.body.add(this.head);
    this.hand = new THREE.Group(); this.head.add(this.hand);
    const box = (w, h, d, parent, x = 0, y = 0, z = 0, mat = this.material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * px, h * px, d * px), mat);
      m.position.set(x * px, y * px, z * px); m.castShadow = true; parent.add(m); return m;
    };
    this.legs = [];
    if (kind === 'spider') {
      const W = 16 * width;
      this.body.position.y = 7 * px;
      box(W * 0.75, 7, 12, this.body, 0, 2, -7);                     // abdomen
      box(W * 0.5, 5, 7, this.body, 0, 0, 2);                         // thorax
      this.head.position.set(0, 0, 6 * px);
      box(7, 5, 5, this.head, 0, 0, 1.5);                             // head (eyes go here)
      box(1.5, 3, 2, this.head, -2, -3, 4); box(1.5, 3, 2, this.head, 2, -3, 4);     // fangs
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? 1 : -1, k = i % 4;
        const hip = new THREE.Group(); hip.position.set(side * W * 0.22 * px, 0, (3 - k * 2.4) * px); this.body.add(hip);
        const upper = new THREE.Group(); hip.add(upper);
        box(10, 1.6, 1.6, upper, side * 5, 0, 0);
        const knee = new THREE.Group(); knee.position.set(side * 10 * px, 0, 0); upper.add(knee);
        box(1.6, 9, 1.6, knee, 0, -4.5, 0);
        upper.rotation.z = side * 0.55; knee.rotation.z = -side * 0.35;
        upper.rotation.y = side * (k - 1.5) * 0.35;
        this.legs.push({ upper, knee, side, k, y0: upper.rotation.y });
      }
      this.eyeY = 0.5; this.eyeZ = 4.1; this.eyeX = 1.6;
    } else {
      // slime: a wobbling translucent cube with a darker core
      this.body.position.y = 8 * px;
      this.cube = box(16 * width, 16, 16 * width, this.body);
      box(8, 8, 8, this.body, 0, -1, 0, new THREE.MeshLambertMaterial({ color: new THREE.Color(tint).multiplyScalar(0.45) }));
      this.head.position.set(0, 3 * px, 8.1 * width * px);
      this.eyeY = 0; this.eyeZ = 0.1; this.eyeX = 3;
    }
    this.phase = Math.random() * 6;
    this.action = null; this.actionT = 0; this.actionDur = 0;
    this.forced = null; this.dieT = 0;
    this.flashT = 0; this.flashColor = new THREE.Color();
    this.blocking = false; this.lookPitch = 0;
  }
  play(name) {
    if (name === 'die') { this.forced = 'die'; this.dieT = 0; return; }
    if (name === 'idle' || name === 'walk' || name === 'run' || name === 'none') { this.forced = name === 'none' ? null : name; return; }
    if (ACTIONS[name]) { this.action = name; this.actionT = 0; this.actionDur = ACTIONS[name]; }
  }
  setLoop() {}
  setHeld() {}
  setOffhand() {}
  addHat() {}
  flash(color = 0xff3030) { this.flashT = 0.18; this.flashColor.set(color); }
  setLight(sky, block) { this._light = { s: 0.12 + 0.88 * sky * sky, b: Math.pow(block, 1.6) }; }
  update(dt, speed = 0) {
    const px = this.px;
    this.phase += dt * (speed > 0.2 ? 4 + speed * 3 : 1.2);
    const s = Math.sin(this.phase);
    let lunge = 0;
    if (this.action) {
      this.actionT += dt;
      const t = Math.min(1, this.actionT / this.actionDur);
      lunge = Math.sin(t * Math.PI);
      if (this.actionT >= this.actionDur) this.action = null;
    }
    if (this.kind === 'spider') {
      const k = speed > 0.2 ? 1 : 0.15;
      for (const L of this.legs) {
        const ph = this.phase + L.k * 1.6 + (L.side > 0 ? 0 : Math.PI);
        L.upper.rotation.y = L.y0 + Math.sin(ph) * 0.35 * k;
        L.upper.rotation.z = L.side * (0.55 + Math.max(0, Math.cos(ph)) * 0.3 * k);
      }
      this.body.position.y = 7 * px + Math.abs(s) * 0.4 * px * (speed > 0.2 ? 1 : 0);
      this.body.rotation.x = -lunge * 0.35;
      this.head.rotation.x = -lunge * 0.3;
    } else {
      // squash and stretch, a hop when moving
      const hop = speed > 0.2 ? Math.max(0, Math.sin(this.phase * 0.8)) : 0;
      const sq = 1 + (speed > 0.2 ? Math.sin(this.phase * 0.8 + 1.6) * 0.12 : Math.sin(this.phase) * 0.04) + lunge * 0.15;
      this.body.scale.set(sq, 1 / sq, sq);
      this.body.position.y = 8 * px / sq + hop * 6 * px;
    }
    if (this.forced === 'die') {
      this.dieT = Math.min(1, this.dieT + dt * 2.2);
      if (this.kind === 'spider') { this.root.rotation.z = this.dieT * Math.PI; this.root.position.y = this.dieT * 10 * px; }
      else this.body.scale.set(1 + this.dieT * 0.5, Math.max(0.05, 1 - this.dieT), 1 + this.dieT * 0.5);
    } else { this.root.rotation.z = 0; this.root.position.y = 0; }
    const Lt = this._light || { s: 1, b: 0 };
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.material.emissive.copy(this.flashColor).multiplyScalar(0.6);
      this.material.color.setRGB(1, 0.6, 0.6);
    } else {
      const b = Lt.b * 0.45;
      this.material.color.setRGB(Math.min(1.25, Lt.s + b), Math.min(1.25, Lt.s + b * 0.72), Math.min(1.25, Lt.s + b * 0.42));
      this.material.emissive.setRGB(0, 0, 0);
    }
  }
  dispose() { this.material.dispose(); }
}
