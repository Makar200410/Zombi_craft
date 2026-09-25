// First-person viewmodel: blocky arm + held item, parented to the camera and drawn last after a depth clear
// (so it never clips into walls). Procedural animation: idle sway, walk bob, look lag, swing, mine loop,
// gun recoil + muzzle flash, spell cast thrust + tip glow, bow draw, equip.
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';
import { makeItemMesh } from '../entities/itemMesh.js';
import { glowTexture } from '../combat/effects.js';

const RO = 1000;   // render order for viewmodel parts (after everything else, incl. particles)

// Per-grip placement in camera space. pos = grip point; rot = holder Euler (YXZ); s = item scale;
// grip = sprite coords (0..1) of the hand; tip = sprite coords of the business end (muzzle / staff tip).
const GRIPS = {
  blade:  { pos: [0.3, -0.33, -0.56], rot: [0.12, 1.95, -0.2], s: 0.56, grip: [0.2, 0.2], tip: [0.9, 0.9], arm: [0.34, -0.72, 0.5] },
  tool:   { pos: [0.3, -0.33, -0.56], rot: [0.12, 1.95, -0.2], s: 0.56, grip: [0.18, 0.18], tip: [0.85, 0.85], arm: [0.34, -0.72, 0.5] },
  staff:  { pos: [0.29, -0.34, -0.58], rot: [0.05, 1.75, -0.08], s: 0.66, grip: [0.3, 0.3], tip: [0.9, 0.9], arm: [0.34, -0.72, 0.5] },
  gun:    { pos: [0.2, -0.24, -0.46], rot: [0.0, 1.62, 0.0], s: 0.58, grip: [0.35, 0.35], tip: [0.97, 0.97], arm: [0.3, -0.7, 0.55], flat: true },
  bow:    { pos: [0.2, -0.2, -0.52], rot: [0.0, 1.35, -0.55], s: 0.6, grip: [0.5, 0.5], tip: [0.5, 0.5], arm: [0.34, -0.7, 0.5] },
  throw:  { pos: [0.3, -0.3, -0.52], rot: [0.1, 2.0, -0.25], s: 0.4, grip: [0.3, 0.3], tip: [0.6, 0.6], arm: [0.34, -0.72, 0.5] },
  book:   { pos: [0.2, -0.3, -0.5], rot: [-0.95, 0.3, 0.1], s: 0.42, grip: [0.3, 0.5], tip: [0.5, 0.8], arm: [0.3, -0.62, 0.5] },
};
function gripFor(it) {
  if (!it) return 'blade';
  if (it.id === 'tome_meteor') return 'book';
  if (it.kind === 'gun' || it.id === 'crossbow') return 'gun';
  if (it.id === 'bow') return 'bow';
  if (it.id === 'grenade') return 'throw';
  if (it.kind === 'spell') return 'staff';
  if (it.kind === 'tool' || it.kind === 'build') return 'tool';
  return 'blade';
}
const ELEMENT_COLORS = { fire: 0xff8a30, frost: 0x8ad8ff, storm: 0xb0d0ff, life: 0x9aff9a, arcane: 0xc890ff };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const Y = new THREE.Vector3(0, 1, 0);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Viewmodel {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    // depth clear right before the viewmodel draws
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const clearer = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    clearer.frustumCulled = false; clearer.renderOrder = RO - 1;
    clearer.onBeforeRender = (renderer) => renderer.clearDepth();
    this.root.add(clearer);

    this.sway = new THREE.Group();     // bob / sway / look lag
    this.root.add(this.sway);
    this.anim = new THREE.Group();     // action animations
    this.sway.add(this.anim);
    this.holder = new THREE.Group();   // grip point & orientation
    this.anim.add(this.holder);

    this.itemMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
    this.armMat = null;
    this.arm = null;
    this.armPivot = new THREE.Group();
    this.anim.add(this.armPivot);

    this.tipMarker = new THREE.Object3D();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd080, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flash.renderOrder = RO + 2; this.flash.visible = false;
    this.tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.tipGlow.renderOrder = RO + 2; this.tipGlow.visible = false;

    this.itemId = undefined;
    this.pending = null;
    this.mesh = null;
    this.grip = GRIPS.blade;
    // animation state
    this.t = 0;
    this.swingT = 1; this.swingDur = 0.3; this.swingKind = 'swing';
    this.mining = false; this.mineT = 0;
    this.recoil = 0;
    this.castT = 1;
    this.equipT = 1;
    this.placeT = 1;
    this.flashT = 0;
    this.lag = new THREE.Vector2();
    this.charge = 0;
    this.light = new THREE.Color(1, 1, 1);
    this.emis = new THREE.Color(0, 0, 0);
  }

  attach(camera, armGeometry, skinTexture) {
    camera.add(this.root);
    if (armGeometry && !this.arm) {
      this.armMat = new THREE.MeshLambertMaterial({ map: skinTexture, transparent: true, alphaTest: 0.5 });
      this.arm = new THREE.Mesh(armGeometry, this.armMat);
      this.arm.renderOrder = RO;
      const len = 12 * (1.8 / 32);
      this.arm.position.set(0, len / 2 + 0.02, 0);
      this.arm.scale.set(1.05, 1, 1.05);
      this.armPivot.add(this.arm);
    }
  }

  setVisible(v) { this.root.visible = v; }

  setItem(itemId) {
    if (itemId === this.itemId && !this.pending) return;
    if (this.itemId === undefined) { this._apply(itemId); this.equipT = 0.3; return; }
    this.pending = itemId;   // swapped at the bottom of the lower/raise animation
    if (this.equipT >= 1 || this.equipT > 0.5) this.equipT = 0;
  }

  _apply(itemId) {
    this.itemId = itemId;
    this.pending = null;
    if (this.mesh) { this.holder.remove(this.mesh); this.mesh = null; }
    const it = ITEMS[itemId];
    const grip = this.grip = GRIPS[gripFor(it)];
    this.holder.position.set(grip.pos[0], grip.pos[1], grip.pos[2]);
    _e.set(grip.rot[0], grip.rot[1], grip.rot[2], 'YXZ');
    this.holder.quaternion.setFromEuler(_e);
    const m = itemId ? makeItemMesh(itemId) : null;
    if (m) {
      m.material = this.itemMat;
      m.castShadow = false; m.receiveShadow = false;
      m.renderOrder = RO;
      const S = grip.s;
      m.scale.setScalar(S);
      if (grip.flat) {
        // gun: rotate the diagonal sprite so the barrel lies along +X, then holder turns +X forward
        const inner = new THREE.Group();
        m.position.set(-grip.grip[0] * S, -grip.grip[1] * S, 0);
        inner.add(m); inner.rotation.z = -Math.PI / 4;
        inner.renderOrder = RO;
        this.mesh = inner;
      } else {
        m.position.set(-grip.grip[0] * S, -grip.grip[1] * S, 0);
        this.mesh = m;
      }
      m.add(this.tipMarker);
      this.tipMarker.position.set(grip.tip[0], grip.tip[1], 0);
      this.holder.add(this.mesh);
    }
    // muzzle flash & tip glow live at the tip
    this.tipMarker.add(this.flash);
    this.tipMarker.add(this.tipGlow);
    const el = it?.element;
    this.tipGlow.visible = !!(it && it.kind === 'spell' && el && it.id !== 'tome_meteor');
    if (el) this.tipGlow.material.color.set(ELEMENT_COLORS[el] || 0xffffff);
    const inv = grip.s > 0 ? 1 / grip.s : 1;
    this.tipGlow.scale.setScalar(0.22 * inv);
    this.flash.scale.setScalar(0.5 * inv);
    // arm: from grip towards the shoulder (off-screen bottom right)
    this.armPivot.position.copy(this.holder.position);
    _v.set(grip.arm[0], grip.arm[1], grip.arm[2]).normalize();
    this.armPivot.quaternion.setFromUnitVectors(Y, _v);
    this.armPivot.rotateY(0.4);
  }

  /** One-shot animations: 'swing' | 'cast' | 'recoil' | 'place' | 'throw' */
  play(name, strength = 1) {
    if (name === 'swing' || name === 'throw') { this.swingT = 0; this.swingDur = name === 'throw' ? 0.35 : 0.28; this.swingKind = name; }
    else if (name === 'cast') this.castT = 0;
    else if (name === 'recoil') { this.recoil = Math.min(1.4, this.recoil + strength); this.flashT = 0.06; }
    else if (name === 'place') this.placeT = 0;
  }

  /** World position of the item's tip (muzzle / staff tip). */
  tipWorld(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    return this.tipMarker.getWorldPosition(out);
  }

  update(dt, st) {
    this.t += dt;
    const g = this.game;
    // equip lower/raise
    if (this.equipT < 1) {
      const before = this.equipT;
      this.equipT = Math.min(1, this.equipT + dt / 0.32);
      if (this.pending !== null && before < 0.5 && this.equipT >= 0.5) this._apply(this.pending);
      if (this.pending !== null && this.equipT >= 1) this._apply(this.pending);
    }
    const eq = this.equipT < 0.5 ? this.equipT * 2 : (1 - this.equipT) * 2;   // 0 → 1 (lowest) → 0
    // lighting from the world at the player's eye (caves are dark, torches warm)
    if (st.light) {
      const { s, b } = st.light;
      this.light.setScalar(s); this.emis.setRGB(1.0, 0.72, 0.42).multiplyScalar(b * 0.5);
      this.itemMat.color.copy(this.light); this.itemMat.emissive.copy(this.emis);
      if (this.armMat) { this.armMat.color.copy(this.light); this.armMat.emissive.copy(this.emis); }
    }

    // --- sway group: bob, idle breathing, look lag
    const bob = st.bobAmount || 0, ph = st.bobPhase || 0;
    this.lag.x = damp(this.lag.x, THREE.MathUtils.clamp(st.lookX * 0.0018, -0.09, 0.09), 10, dt);
    this.lag.y = damp(this.lag.y, THREE.MathUtils.clamp(st.lookY * 0.0018, -0.09, 0.09), 10, dt);
    const breathe = Math.sin(this.t * 1.6) * 0.006;
    this.sway.position.set(
      Math.cos(ph) * 0.028 * bob - this.lag.x * 0.35,
      -Math.abs(Math.sin(ph)) * 0.032 * bob + breathe + this.lag.y * 0.3 - (st.landDip || 0) * 0.35 - eq * 0.55 - (st.sprinting ? 0.03 : 0),
      (st.sprinting ? 0.02 : 0));
    this.sway.rotation.set(this.lag.y * 0.9 + (st.sprinting ? -0.12 : 0), -this.lag.x * 1.2 + (st.sprinting ? 0.25 : 0), Math.cos(ph) * 0.02 * bob);

    // --- anim group: actions
    const a = this.anim;
    a.position.set(0, 0, 0); a.rotation.set(0, 0, 0);
    // swing (melee / tool one-shot) and mining loop
    let sw = -1;
    if (this.swingT < 1) { this.swingT = Math.min(1, this.swingT + dt / this.swingDur); sw = this.swingT; }
    else if (st.mining) { this.mineT = (this.mineT + dt / 0.27) % 1; sw = this.mineT; }
    else this.mineT = 0;
    if (sw >= 0) {
      // MC-like arc: quick wind-up → strike down & inward → recover
      const k = Math.sin(Math.min(1, sw) * Math.PI);
      const k2 = Math.sin(Math.sqrt(Math.min(1, sw)) * Math.PI);
      if (this.swingKind === 'throw' && this.swingT < 1) {
        a.position.set(-0.05 * k, 0.12 * k, -0.2 * k2); a.rotation.set(-0.9 * k, 0, 0);
      } else {
        a.position.set(-0.2 * k2, 0.06 * k - 0.1 * k * k, -0.14 * k);
        a.rotation.set(-0.95 * k2, 0.35 * k, 0.55 * k);
      }
    }
    // place bump
    if (this.placeT < 1) { this.placeT = Math.min(1, this.placeT + dt / 0.22); const k = Math.sin(this.placeT * Math.PI); a.position.z -= 0.08 * k; a.rotation.x -= 0.35 * k; }
    // cast: thrust forward & up, glow flare
    if (this.castT < 1) {
      this.castT = Math.min(1, this.castT + dt / 0.35);
      const k = Math.sin(this.castT * Math.PI);
      a.position.x -= 0.1 * k; a.position.y += 0.07 * k; a.position.z -= 0.16 * k; a.rotation.x += 0.25 * k;
    }
    // recoil: kick back and muzzle up, springy settle
    if (this.recoil > 0.001) {
      const r = this.recoil;
      a.position.z += 0.13 * r; a.position.y += 0.02 * r; a.rotation.x += 0.38 * r; a.rotation.z -= 0.08 * r;
      this.recoil *= Math.exp(-dt * 11);
    }
    // bow draw: bring to center, pull back, tremble at full draw
    const ch = st.charge || 0;
    this.charge = damp(this.charge, ch, 14, dt);
    if (this.charge > 0.01) {
      const c = this.charge;
      const trem = ch >= 1 ? Math.sin(this.t * 40) * 0.004 : 0;
      a.position.x -= 0.16 * c; a.position.y += 0.07 * c + trem; a.position.z += 0.08 * c;
      a.rotation.z += 0.35 * c;
    }
    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = true;
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.material.opacity = Math.max(0, this.flashT / 0.06);
    } else this.flash.visible = false;
    // staff tip glow pulses
    if (this.tipGlow.visible) {
      const p = 0.75 + Math.sin(this.t * 5) * 0.12 + (1 - this.castT) * 0.9;
      this.tipGlow.material.opacity = Math.min(1, 0.55 + (1 - this.castT));
      const inv = this.grip.s > 0 ? 1 / this.grip.s : 1;
      this.tipGlow.scale.setScalar(0.22 * inv * p);
    }
    void g;
  }
}
