import * as THREE from 'three';
import { makeItemMesh } from './itemMesh.js';

// Minecraft skin layout (64x64), base layer. [x, y] of each face; sizes derived from part dims.
const PARTS = {
  head: { size: [8, 8, 8], uv: [0, 0] },
  body: { size: [8, 12, 4], uv: [16, 16] },
  rarm: { size: [4, 12, 4], uv: [40, 16] },
  larm: { size: [4, 12, 4], uv: [32, 48] },
  rleg: { size: [4, 12, 4], uv: [0, 16] },
  lleg: { size: [4, 12, 4], uv: [16, 48] },
};

// Faces: n, u (texture right as seen from outside), v (up), base corner in unit box, and which skin region.
const BOX_FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1], region: 'left' },   // +X = character's left
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0], region: 'right' },  // -X = character's right
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1], region: 'top' },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0], region: 'bottom' },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1], region: 'front' },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0], region: 'back' },
];

function regions(w, h, d, ox, oy) {
  // standard MC box unwrap: w = x size, h = y size, d = z size
  return {
    top: [ox + d, oy, w, d], bottom: [ox + d + w, oy, w, d],
    right: [ox, oy + d, d, h], front: [ox + d, oy + d, w, h], left: [ox + d + w, oy + d, d, h], back: [ox + d + w + d, oy + d, w, h],
  };
}

const geoCache = new Map();
/** Box geometry (pixels → units via px) with skin UVs, origin at pivot offset. */
function skinBox(part, px, inflate = 0) {
  const key = part + px + ':' + inflate;
  if (geoCache.has(key)) return geoCache.get(key);
  const { size: [w, h, d], uv: [ox, oy] } = PARTS[part];
  const R = regions(w, h, d, ox, oy);
  const pos = [], nrm = [], uv = [], idx = [];
  const sx = w * px + inflate * 2, sy = h * px + inflate * 2, sz = d * px + inflate * 2;
  for (const f of BOX_FACES) {
    const [rx, ry, rw, rh] = R[f.region];
    const c0 = pos.length / 3;
    for (let c = 0; c < 4; c++) {
      const a = (c === 1 || c === 2) ? 1 : 0, b = c >= 2 ? 1 : 0;
      const x = (f.base[0] + f.u[0] * a + f.v[0] * b), y = (f.base[1] + f.u[1] * a + f.v[1] * b), z = (f.base[2] + f.u[2] * a + f.v[2] * b);
      pos.push((x - 0.5) * sx, (y - 0.5) * sy, (z - 0.5) * sz);
      nrm.push(...f.n);
      let U = (rx + (a ? rw : 0)) / 64, V = (ry + (b ? 0 : rh)) / 64;
      if (f.region === 'bottom') V = (ry + (b ? rh : 0)) / 64;
      uv.push(U, V);
    }
    idx.push(c0, c0 + 1, c0 + 2, c0, c0 + 2, c0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  geoCache.set(key, g);
  return g;
}

const texCache = new WeakMap();
function skinTexture(canvas) {
  let t = texCache.get(canvas);
  if (!t) {
    t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(canvas, t);
  }
  return t;
}

const HAT_MATS = {};
function hatMat(color) { return HAT_MATS[color] || (HAT_MATS[color] = new THREE.MeshLambertMaterial({ color })); }

const ACTIONS = { attack: 0.32, chop: 0.55, mine: 0.5, hoe: 0.6, cast: 0.5, shoot: 0.35, hurt: 0.25, hammer: 0.45, harvest: 0.6 };

/**
 * Blocky humanoid with procedural animation.
 *   play(name): 'idle' | 'walk' | 'run' (force locomotion), actions: 'attack','chop','mine','hoe','cast','shoot','hurt','hammer','harvest' (one-shot),
 *               'die' (fall over, stays), 'sit' (pose), 'none' (clear forced pose)
 *   setLoop(name|null): repeat an action continuously (e.g. 'chop' while working a tree), 'carry' holds arms forward
 *   update(dt, speed): speed in blocks/s drives walk cycle
 */
export class HumanoidModel {
  constructor({ skin, height = 1.8, hat = null, zombie = false, width = 1, hatColor } = {}) {
    const px = height / 32;          // 32 px tall
    this.px = px;
    this.zombie = zombie;
    this.group = new THREE.Group();
    this.root = new THREE.Group();    // rotated for death fall
    this.group.add(this.root);
    this.material = new THREE.MeshLambertMaterial({ map: skinTexture(skin), alphaTest: 0.5 });
    this.baseColor = new THREE.Color(1, 1, 1);
    const mk = (part) => { const m = new THREE.Mesh(skinBox(part, px), this.material); m.castShadow = true; m.receiveShadow = false; return m; };
    const wmul = width;
    // pivots
    this.body = new THREE.Group(); this.body.position.y = 12 * px; this.root.add(this.body);
    const bodyMesh = mk('body'); bodyMesh.position.y = 6 * px; bodyMesh.scale.x = wmul; this.body.add(bodyMesh);
    this.head = new THREE.Group(); this.head.position.y = 12 * px; this.body.add(this.head);
    const headMesh = mk('head'); headMesh.position.y = 4 * px; this.head.add(headMesh);
    this.rarm = new THREE.Group(); this.rarm.position.set(-(4 * wmul + 2) * px, 10 * px, 0); this.body.add(this.rarm);
    const ra = mk('rarm'); ra.position.y = -4 * px; this.rarm.add(ra);
    this.larm = new THREE.Group(); this.larm.position.set((4 * wmul + 2) * px, 10 * px, 0); this.body.add(this.larm);
    const la = mk('larm'); la.position.y = -4 * px; this.larm.add(la);
    this.rleg = new THREE.Group(); this.rleg.position.set(-2 * px, 12 * px, 0); this.root.add(this.rleg);
    const rl = mk('rleg'); rl.position.y = -6 * px; this.rleg.add(rl);
    this.lleg = new THREE.Group(); this.lleg.position.set(2 * px, 12 * px, 0); this.root.add(this.lleg);
    const ll = mk('lleg'); ll.position.y = -6 * px; this.lleg.add(ll);
    this.hand = new THREE.Group(); this.hand.position.set(0, -10 * px, 1 * px); this.rarm.add(this.hand);
    this.offhand = new THREE.Group(); this.offhand.position.set(1.2 * px, -7 * px, 2.8 * px); this.larm.add(this.offhand);
    this.blocking = false;
    if (hat) this.addHat(hat, hatColor);

    this.phase = Math.random() * 10;
    this.speed = 0;
    this.forced = null;     // 'idle'|'walk'|'run'|'sit'|'die'
    this.action = null; this.actionT = 0; this.actionDur = 0;
    this.loop = null;
    this.dieT = 0;
    this.flashT = 0; this.flashColor = new THREE.Color();
    this.held = null; this.heldId = null;
    this.lookPitch = 0;
  }

  addHat(type, color) {
    const px = this.px, g = new THREE.Group(); g.position.y = 8 * px;
    const box = (w, h, d, c, y = 0, x = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * px, h * px, d * px), hatMat(c)); m.position.set(x * px, y * px + h * px / 2, z * px); m.castShadow = true; g.add(m); return m; };
    if (type === 'straw') { box(14, 1, 14, color || 0xd8b25a, -0.5); box(8.6, 3, 8.6, color || 0xcaa048, 0); box(8.8, 1, 8.8, 0x8a3a2a, 0.3); }
    else if (type === 'helmet') { box(9, 4, 9, color || 0x9aa3ad, -1.5); box(9.2, 1, 9.2, 0x6c747d, -1.8); box(1, 4, 1, 0x6c747d, -3.5, 0, 4.4); }
    else if (type === 'wizard') { box(12, 1, 12, color || 0x4a2a8a, -0.5); box(8, 3, 8, color || 0x4a2a8a, 0.5); box(6, 3, 6, color || 0x4a2a8a, 3.5, 0.5, -0.5); box(4, 3, 4, color || 0x4a2a8a, 6.5, 1, -1.5); box(2, 3, 2, color || 0x4a2a8a, 9.5, 1.5, -2.5); box(8.4, 1, 8.4, 0xe8c040, 0.8); }
    else if (type === 'hood') { box(9, 5, 9, color || 0x3a2a4a, -3, 0, -0.3); }
    else if (type === 'crown') { box(9, 2, 9, 0xe8c040, -0.5); for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 4], [0, -4]]) box(1, 2, 1, 0xf0d060, 1.5, x, z); }
    else if (type === 'cap') { box(9, 2, 9, color || 0x8a5a2a, -0.5); box(8, 1, 4, color || 0x7a4a1a, -0.5, 0, 6); }
    else if (type === 'bandana') { box(8.6, 2, 8.6, color || 0xb03030, 3); }
    this.head.add(g);
    this.hat = g;
  }

  setHeld(itemId) {
    if (itemId === this.heldId) return;
    if (this.held) { this.hand.remove(this.held); this.held = null; }
    this.heldId = itemId;
    if (!itemId) return;
    const m = makeItemMesh(itemId);
    if (!m) return;
    // sprite handle at bottom-left, tip top-right: map sprite x → +Z (forward), tilt so the diagonal points forward
    const S = this.px * 16 * 0.8;
    m.scale.setScalar(S);
    m.rotation.y = -Math.PI / 2;
    m.position.set(0, -0.22 * S, -0.22 * S);
    const hold = new THREE.Group();
    hold.rotation.x = Math.PI / 4;
    hold.add(m);
    this.held = hold;
    this.hand.add(hold);
  }

  /** Object held in the left hand (shield). Pass null to clear. */
  setOffhand(obj) {
    while (this.offhand.children.length) this.offhand.remove(this.offhand.children[0]);
    if (obj) this.offhand.add(obj);
  }

  play(name) {
    if (name === 'die') { this.forced = 'die'; this.dieT = 0; return; }
    if (name === 'idle' || name === 'walk' || name === 'run' || name === 'sit') { this.forced = name; return; }
    if (name === 'none') { this.forced = null; return; }
    if (ACTIONS[name]) { this.action = name; this.actionT = 0; this.actionDur = ACTIONS[name]; }
  }
  setLoop(name) { this.loop = name; }

  flash(color = 0xff3030) { this.flashT = 0.18; this.flashColor.set(color); }
  /** sky/block 0..1 from world light at entity position */
  setLight(sky, block, night) {
    const s = 0.12 + 0.88 * sky * sky;
    this._light = { s, b: Math.pow(block, 1.6) };
  }

  update(dt, speed = 0) {
    const px = this.px;
    this.speed = speed;
    const loco = this.forced && this.forced !== 'die' ? this.forced : (speed > 4.2 ? 'run' : speed > 0.3 ? 'walk' : 'idle');
    const k = loco === 'run' ? 1.0 : loco === 'walk' ? 0.62 : 0;
    this.phase += dt * (loco === 'idle' ? 1 : Math.max(4, speed * 2.4));
    const s = Math.sin(this.phase);
    // legs & arms swing
    let rArmX = 0, lArmX = 0, rArmZ = 0, lArmZ = 0, bodyX = 0, headX = this.lookPitch;
    if (loco === 'sit') {
      this.rleg.rotation.x = this.lleg.rotation.x = -Math.PI / 2; this.root.position.y = -10 * px;
    } else {
      this.root.position.y = 0;
      this.rleg.rotation.x = s * 0.9 * k; this.lleg.rotation.x = -s * 0.9 * k;
      rArmX = -s * 0.8 * k; lArmX = s * 0.8 * k;
      if (loco === 'run') bodyX = 0.18;
      if (loco === 'idle') { rArmZ = -0.03 - Math.sin(this.phase * 1.3) * 0.03; lArmZ = -rArmZ; }
    }
    if (this.zombie) { rArmX = -Math.PI / 2 + s * 0.12 * k + Math.sin(this.phase * 0.7) * 0.05; lArmX = -Math.PI / 2 - s * 0.12 * k; }
    // continuous work loops
    const loop = this.loop;
    if (loop === 'carry') { rArmX = lArmX = -1.1; rArmZ = 0.25; lArmZ = -0.25; }
    else if (loop === 'aim') { rArmX = -Math.PI / 2; lArmX = -Math.PI / 2 + 0.2; lArmZ = -0.5; headX = 0; }
    else if (loop && !this.action) { this.action = loop; this.actionT = 0; this.actionDur = ACTIONS[loop] || 0.5; }
    // one-shot actions override the right arm (and sometimes both)
    if (this.action) {
      this.actionT += dt;
      const t = Math.min(1, this.actionT / this.actionDur);
      const swing = t < 0.35 ? -2.6 * (t / 0.35) : -2.6 + 2.6 * ((t - 0.35) / 0.65);  // raise then strike down
      switch (this.action) {
        case 'attack': rArmX = t < 0.3 ? -2.2 * (t / 0.3) : -2.2 + 2.4 * Math.min(1, (t - 0.3) / 0.4); rArmZ = 0.3 * Math.sin(t * Math.PI); bodyX = 0.1 * Math.sin(t * Math.PI); break;
        case 'chop': case 'hammer': rArmX = swing; bodyX = 0.12 * Math.sin(t * Math.PI); if (this.action === 'chop') lArmX = swing * 0.8; break;
        case 'mine': rArmX = swing * 0.9; bodyX = 0.2 * Math.sin(t * Math.PI); break;
        case 'hoe': case 'harvest': rArmX = -0.8 - Math.sin(t * Math.PI) * 0.6; lArmX = -0.6 - Math.sin(t * Math.PI) * 0.4; bodyX = 0.45 * Math.sin(t * Math.PI); break;
        case 'cast': rArmX = lArmX = -Math.PI * 0.8 * Math.sin(t * Math.PI) - 0.4; rArmZ = 0.3; lArmZ = -0.3; break;
        case 'shoot': rArmX = -Math.PI / 2; lArmX = -Math.PI / 2 + 0.2; lArmZ = -0.4; break;
        case 'hurt': bodyX = -0.25 * Math.sin(t * Math.PI); break;
      }
      if (this.actionT >= this.actionDur) this.action = null;
    }
    // shield up: left forearm raised in front of the chest
    this._block = (this._block || 0) + ((this.blocking ? 1 : 0) - (this._block || 0)) * Math.min(1, dt * 14);
    if (this._block > 0.01) {
      const b = this._block;
      lArmX = lArmX * (1 - b) + (-0.95) * b; lArmZ = lArmZ * (1 - b) + (-0.1) * b;
      this.larm.rotation.y = 0.6 * b;
    } else this.larm.rotation.y = 0;
    this.rarm.rotation.x = rArmX; this.larm.rotation.x = lArmX; this.rarm.rotation.z = rArmZ; this.larm.rotation.z = lArmZ;
    this.body.rotation.x = bodyX; this.head.rotation.x = headX - bodyX;
    // death: fall backwards
    if (this.forced === 'die') {
      this.dieT = Math.min(1, this.dieT + dt * 2.2);
      const e = this.dieT * this.dieT;
      this.root.rotation.x = -e * Math.PI / 2;
      this.root.position.y = e * 2 * px;
    } else { this.root.rotation.x = 0; }
    // hurt flash + lighting
    const L = this._light || { s: 1, b: 0 };
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.material.emissive.copy(this.flashColor).multiplyScalar(0.6);
      this.material.color.setRGB(1, 0.6, 0.6);
    } else {
      // warm block light tints the texture (multiplies it) instead of an additive emissive that washes skins out to white
      const b = L.b * 0.45;
      this.material.color.setRGB(Math.min(1.25, L.s + b), Math.min(1.25, L.s + b * 0.72), Math.min(1.25, L.s + b * 0.42));
      this.material.emissive.setRGB(0, 0, 0);
    }
  }
  dispose() { this.material.dispose(); }
}
