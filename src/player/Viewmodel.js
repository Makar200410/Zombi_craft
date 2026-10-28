// First-person viewmodel, laid out like Minecraft's ItemInHandRenderer: the held item floats at the lower right
// (no arm), an empty hand shows the bare arm. The pose is built like Minecraft's pose stack — arm transform
// (0.56, -0.52, -0.72) lowered by the equip progress, the swing (attack) rotations, then the item model's
// "firstperson_righthand" display transform — and drawn last after a depth clear so it never clips into walls.
// On top of that: walk bob, look lag, mining loop, bow draw, gun recoil + muzzle flash, spell thrust + tip glow.
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';
import { makeItemMesh } from '../entities/itemMesh.js';
import { glowTexture } from '../combat/effects.js';

const RO = 1000;   // render order for viewmodel parts (after everything else, incl. particles)
const DEG = Math.PI / 180;

// Item display transforms (rotation in degrees XYZ, translation in 1/16 block, uniform scale), as in item model
// JSON "display.firstperson_righthand". `end` = sprite coords of the business end (muzzle / staff tip).
export const DISPLAY = {
  item:  { r: [0, -90, 25], t: [1.13, 3.2, 1.13], s: 0.68, end: [0.9, 0.9] },     // swords, tools, rods, food
  staff: { r: [0, -90, 25], t: [1.13, 3.2, 1.13], s: 0.7, end: [0.9, 0.9] },
  bow:   { r: [0, -90, 25], t: [1.13, 3.2, 1.13], s: 0.68, end: [0.5, 0.5] },
  gun:   { r: [0, 95, -45], t: [-3.6, 3.4, 0.4], s: 1.0, end: [0.97, 0.97], noSwing: true },
  book:  { r: [0, -90, 25], t: [1.13, 3.2, 1.13], s: 0.55, end: [0.5, 0.9] },
  block: { r: [0, 45, 0], t: [0, 0, 0], s: 0.4, end: [0.5, 0.5] },
};
function displayFor(it) {
  if (!it) return null;
  if (it.kind === 'block') return 'block';
  if (it.id === 'tome_meteor') return 'book';
  if (it.kind === 'gun' || it.id === 'crossbow') return 'gun';
  if (it.id === 'bow') return 'bow';
  if (it.kind === 'spell') return 'staff';
  return 'item';
}
const ELEMENT_COLORS = { fire: 0xff8a30, frost: 0x8ad8ff, storm: 0xb0d0ff, life: 0x9aff9a, arcane: 0xc890ff };

/** Minimal pose stack (post-multiplied, like Minecraft's PoseStack). */
class Pose {
  constructor() { this.m = new THREE.Matrix4(); this._t = new THREE.Matrix4(); }
  reset() { this.m.identity(); return this; }
  translate(x, y, z) { this.m.multiply(this._t.makeTranslation(x, y, z)); return this; }
  rotX(d) { if (d) this.m.multiply(this._t.makeRotationX(d * DEG)); return this; }
  rotY(d) { if (d) this.m.multiply(this._t.makeRotationY(d * DEG)); return this; }
  rotZ(d) { if (d) this.m.multiply(this._t.makeRotationZ(d * DEG)); return this; }
  scale(x, y = x, z = x) { this.m.multiply(this._t.makeScale(x, y, z)); return this; }
}

const _warm = new THREE.Color(1.1, 0.85, 0.6);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = THREE.MathUtils.clamp;

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

    this.sway = new THREE.Group();     // bob / look lag
    this.root.add(this.sway);
    this.hand = new THREE.Group();     // the pose-stack matrix (arm transform + swing)
    this.hand.matrixAutoUpdate = false;
    this.sway.add(this.hand);
    this.armSpace = new THREE.Group(); // empty hand: the arm's own pose
    this.armSpace.matrixAutoUpdate = false;
    this.sway.add(this.armSpace);

    this.itemMat = new THREE.MeshBasicMaterial({ vertexColors: true });   // baked face shading, tinted by world light below
    this.armMat = null;
    this.arm = null;

    this.tipMarker = new THREE.Object3D();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd080, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flash.renderOrder = RO + 2; this.flash.visible = false;
    this.tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.tipGlow.renderOrder = RO + 2; this.tipGlow.visible = false;

    this.itemId = undefined;
    this.pending = undefined;
    this.mesh = null;
    this.disp = null;
    this.pose = new Pose();
    // animation state
    this.t = 0;
    this.swingT = 1; this.swingDur = 0.3; this.swingKind = 'swing';
    this.mineT = 0;
    this.recoil = 0;
    this.castT = 1;
    this.height = 1;           // Minecraft's equip height: 1 = raised, 0 = lowered out of view
    this.flashT = 0;
    this.lag = new THREE.Vector2();
    this.charge = 0; this.drawT = 0;
    this.light = new THREE.Color(1, 1, 1);
  }

  attach(camera, armGeometry, skinTexture) {
    camera.add(this.root);
    if (armGeometry && !this.arm) {
      this.armMat = new THREE.MeshLambertMaterial({ map: skinTexture, transparent: true, alphaTest: 0.5 });
      this.arm = new THREE.Mesh(armGeometry, this.armMat);
      this.arm.renderOrder = RO;
      // the body model's arm is a centered 4×12×4 box at 1.8/32 per pixel (hand at -y); scale it to Minecraft's
      // 1/16 per pixel and lay it from the hand (armSpace origin) back towards the shoulder below the screen
      this.arm.scale.setScalar((1 / 16) / (1.8 / 32));
      const dir = new THREE.Vector3(0.28, -0.8, 0.53).normalize();
      this.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.arm.rotateY(-0.5);
      this.arm.position.copy(dir).multiplyScalar(6 / 16);
      this.armSpace.add(this.arm);
    }
  }

  setVisible(v) { this.root.visible = v; }

  setItem(itemId) {
    itemId = itemId || null;
    if (this.itemId === undefined) { this._apply(itemId); this.height = 0; return; }
    if (itemId === this.itemId) { this.pending = undefined; return; }
    this.pending = itemId;   // swapped once the hand is lowered
  }

  _apply(itemId) {
    this.itemId = itemId;
    this.pending = undefined;
    if (this.mesh) { this.mesh.parent?.remove(this.mesh); this.mesh = null; }
    const it = ITEMS[itemId];
    const key = displayFor(it);
    const D = this.disp = key ? DISPLAY[key] : null;
    const m = itemId ? makeItemMesh(itemId, { thick: 2 }) : null;
    if (m && D) {
      const isBlock = !!m.userData.block;
      let mesh = m;
      if (isBlock) { mesh = m.children[0]; m.remove(mesh); mesh.position.set(0, 0, 0); mesh.scale.setScalar(1); }
      else mesh.material = this.itemMat;
      mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = RO; mesh.frustumCulled = false;
      // display transform: translate, rotate XYZ, scale, then the model is centered (sprites span 0..1)
      const ps = new Pose();
      ps.translate(D.t[0] / 16, D.t[1] / 16, D.t[2] / 16).rotX(D.r[0]).rotY(D.r[1]).rotZ(D.r[2]).scale(D.s);
      if (!isBlock) ps.translate(-0.5, -0.5, 0);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(ps.m);
      this.mesh = mesh;
      mesh.add(this.tipMarker);
      this.tipMarker.position.set(isBlock ? 0 : D.end[0], isBlock ? 0 : D.end[1], 0);
      this.hand.add(mesh);
    }
    this.tipMarker.add(this.flash);
    this.tipMarker.add(this.tipGlow);
    const el = it?.element;
    this.tipGlow.visible = !!(it && it.kind === 'spell' && el && it.id !== 'tome_meteor');
    if (el) this.tipGlow.material.color.set(ELEMENT_COLORS[el] || 0xffffff);
    const inv = D ? 1 / D.s : 1;
    this.tipGlow.scale.setScalar(0.22 * inv);
    this.flash.scale.setScalar(0.5 * inv);
    if (this.arm) this.arm.visible = !this.mesh;
  }

  /** One-shot animations: 'swing' | 'cast' | 'recoil' | 'place' | 'throw' */
  play(name, strength = 1) {
    if (name === 'swing' || name === 'place' || name === 'throw') {
      // Minecraft restarts the swing only once it is past half way
      if (this.swingT >= 0.5 || this.swingT >= 1) { this.swingT = 0; this.swingDur = name === 'throw' ? 0.35 : 0.3; this.swingKind = name; }
    } else if (name === 'cast') this.castT = 0;
    else if (name === 'recoil') { this.recoil = Math.min(1.4, this.recoil + strength); this.flashT = 0.06; }
  }

  /** World position of the item's tip (muzzle / staff tip). */
  tipWorld(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    return this.tipMarker.getWorldPosition(out);
  }

  update(dt, st) {
    this.t += dt;
    const k = Math.min(1.45, Math.max(0.45, (this.game.camera.aspect || 1.78) / 1.78));
    this.root.position.x = (k - 1) * 0.3;
    this.root.scale.setScalar(Math.min(1, 0.55 + 0.45 * k));
    // equip: lower (0.4 per tick), swap, raise — like Minecraft's mainHandHeight
    const want = this.pending !== undefined ? 0 : 1;
    this.height = want > this.height ? Math.min(want, this.height + dt * 8) : Math.max(want, this.height - dt * 8);
    if (this.pending !== undefined && this.height <= 0) this._apply(this.pending);
    const equip = 1 - this.height;
    // lighting from the world at the player's eye (caves are dark, torches warm)
    if (st.light) {
      const { s, b } = st.light;
      const lit = Math.min(1.15, 0.28 + s * 0.8 + b * 0.4);
      this.itemMat.color.setScalar(lit).lerp(_warm, Math.min(0.35, b * 0.4));
      const bm = this.mesh?.material;
      if (bm && bm !== this.itemMat) bm.color.setScalar(lit);
      if (this.armMat) {
        const w = b * 0.4, base = 0.35 + s * 0.65;
        this.armMat.color.setRGB(Math.min(1.2, base + w), Math.min(1.2, base + w * 0.72), Math.min(1.2, base + w * 0.42));
        this.armMat.emissive.setRGB(0, 0, 0);
      }
    }

    // --- sway group: view bob and look lag (the hand trails the camera a little)
    const bob = st.bobAmount || 0, ph = st.bobPhase || 0;
    this.lag.x = damp(this.lag.x, clamp(st.lookX * 0.0018, -0.09, 0.09), 10, dt);
    this.lag.y = damp(this.lag.y, clamp(st.lookY * 0.0018, -0.09, 0.09), 10, dt);
    this.sway.position.set(
      Math.sin(ph) * 0.03 * bob - this.lag.x * 0.3,
      -Math.abs(Math.cos(ph)) * 0.035 * bob + this.lag.y * 0.25 - (st.landDip || 0) * 0.3,
      0);
    this.sway.rotation.set(this.lag.y * 0.6, -this.lag.x * 0.8, Math.sin(ph) * 0.03 * bob);

    // --- swing progress (one-shot swing, or a looping swing while mining — Minecraft swings every 6 ticks)
    let sw = 0;
    if (this.swingT < 1) { this.swingT = Math.min(1, this.swingT + dt / this.swingDur); sw = this.swingT < 1 ? this.swingT : 0; }
    else if (st.mining) { this.mineT = (this.mineT + dt / 0.3) % 1; sw = this.mineT; }
    else this.mineT = 0;
    const sq = Math.sqrt(sw);
    const D = this.disp;
    const P = this.pose.reset();

    if (!this.mesh) {
      // ---- empty hand (Minecraft renderPlayerArm, right side)
      const f2 = -0.3 * Math.sin(sq * Math.PI), f3 = 0.4 * Math.sin(sq * Math.PI * 2), f4 = -0.4 * Math.sin(sw * Math.PI);
      P.translate(f2 + 0.42, f3 - 0.3 - equip * 0.6, f4 - 0.62);
      P.rotY(Math.sin(sq * Math.PI) * 70);
      P.rotZ(Math.sin(sw * sw * Math.PI) * -20);
      P.rotX(Math.sin(sq * Math.PI) * -30);
      this.armSpace.matrix.copy(P.m);
      this.armSpace.matrixWorldNeedsUpdate = true;
      this.hand.matrix.identity();
      return;
    }

    const ch = st.charge || 0;
    this.charge = damp(this.charge, ch, 18, dt);
    this.drawT = ch > 0 ? this.drawT + dt : 0;
    if (this.charge > 0.02 && this.disp === DISPLAY.bow) {
      // ---- bow being drawn (Minecraft's BOW use animation)
      P.translate(0.56, -0.52 - equip * 0.6, -0.72);
      P.translate(-0.2785682, 0.18344387, 0.15731531).rotX(-13.935).rotY(35.3).rotZ(-9.785);
      const f = Math.min(1, this.charge);
      if (f > 0.1) P.translate(0, Math.sin((this.drawT * 20 - 0.1) * 1.3) * (f - 0.1) * 0.004, 0);
      P.translate(0, 0, f * 0.04).scale(1, 1, 1 + f * 0.2).rotY(-45);
    } else if (D?.noSwing) {
      // ---- firearms: held forward, kick back on each shot
      P.translate(0.56, -0.52 - equip * 0.6, -0.72);
      const r = this.recoil;
      if (r > 0.001) { P.translate(0, 0.02 * r, 0.12 * r).rotX(22 * r).rotZ(-4 * r); this.recoil *= Math.exp(-dt * 11); }
      if (this.charge > 0.02) P.translate(-0.1 * this.charge, 0.04 * this.charge, 0.05 * this.charge);
    } else {
      // ---- everything else (Minecraft: swing offset, applyItemArmTransform, applyItemArmAttackTransform)
      if (this.swingKind === 'throw' && this.swingT < 1) {
        const kk = Math.sin(this.swingT * Math.PI);
        P.translate(0, 0.1 * kk, -0.2 * kk);
        P.translate(0.56, -0.52 - equip * 0.6, -0.72).rotX(-60 * kk);
      } else {
        P.translate(-0.4 * Math.sin(sq * Math.PI), 0.2 * Math.sin(sq * Math.PI * 2), -0.2 * Math.sin(sw * Math.PI));
        P.translate(0.56, -0.52 - equip * 0.6, -0.72);
        const f = Math.sin(sw * sw * Math.PI), f1 = Math.sin(sq * Math.PI);
        P.rotY(45 + f * -20).rotZ(f1 * -20).rotX(f1 * -80).rotY(-45);
      }
      // spell: thrust forward and up
      if (this.castT < 1) {
        this.castT = Math.min(1, this.castT + dt / 0.35);
        const kk = Math.sin(this.castT * Math.PI);
        P.translate(-0.1 * kk, 0.07 * kk, -0.16 * kk).rotX(-15 * kk);
      }
      const r = this.recoil;   // light kick (crossbow-like items)
      if (r > 0.001) { P.translate(0, 0.02 * r, 0.1 * r).rotX(15 * r); this.recoil *= Math.exp(-dt * 11); }
    }
    this.hand.matrix.copy(P.m);
    this.hand.matrixWorldNeedsUpdate = true;

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
      this.tipGlow.scale.setScalar(0.22 / (D?.s || 1) * p);
    }
  }
}
