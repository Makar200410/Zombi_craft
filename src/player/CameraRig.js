// Camera rig: first-person / third-person explore camera, and the Clash-of-Clans style command camera.
//   rig.yaw / rig.pitch      explore look angles (yaw 0 = facing +Z, pitch + = up)
//   rig.forward              unit view direction (explore or command)
//   rig.view                 'fp' | 'tp'
//   rig.target               command-mode focus point on the ground (Vector3)
//   rig.cmdYaw, rig.cmdPitch, rig.cmdDist     command orbit parameters
//   rig.shake(amount)        add screen shake trauma (0..1+)
//   rig.focusOn(pos, dist?)  smoothly move the command camera to look at pos
import * as THREE from 'three';

const EYE = 1.62, EYE_CROUCH = 1.38;
const BASE_FOV = 72, CMD_FOV = 50;
const MIN_DIST = 10, MAX_DIST = 90;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.yaw = 0; this.pitch = -0.15;
    this.view = 'fp';
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.eyeY = null;            // smoothed eye height (step smoothing)
    this.fov = BASE_FOV;
    this.tpDist = 0;
    // command mode
    this.target = new THREE.Vector3();
    this.cmdYaw = Math.PI * 0.25; this.cmdPitch = 0.87; this.cmdDist = 34; this.cmdDistTarget = 34;
    this.panVel = new THREE.Vector2();
    this._groundY = 20;
    // transitions
    this.trans = null;           // {t, dur, fromPos, fromQuat, fromFov, to: 'command'|'explore'}
    // shake
    this.trauma = 0; this._shakeT = 0;
    this.shakeOffset = new THREE.Vector3();
    this.roll = 0;               // extra roll (hurt/death)
    this._hurtKick = 0;
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  init() {
    const g = this.game;
    g.bus.on('mode:changed', ({ mode }) => this._beginTransition(mode));
    g.bus.on('player:damaged', ({ amount }) => { this.shake(Math.min(0.5, 0.12 + (amount || 0) * 0.012)); this._hurtKick = (Math.random() < 0.5 ? -1 : 1) * Math.min(0.09, 0.03 + (amount || 0) * 0.003); });
    g.bus.on('game:begin', () => { this.trans = null; });
    // command-mode keyboard hotkeys handled in update
  }

  onNewGame() {
    const p = this.game.player;
    this.trans = null;
    this.view = 'fp';
    if (p) { this.yaw = p.yaw || 0; this.target.copy(p.position); }
    this.pitch = -0.12;
    this.eyeY = null;
    this.cmdDist = this.cmdDistTarget = 34;
  }

  shake(amount = 0.3) { this.trauma = Math.min(1.2, this.trauma + amount); }

  /** focusOn(vec3, dist?) or focusOn(x, z, dist?) — glide the command camera to a ground point. */
  focusOn(a, b, c) {
    let x, z, dist;
    if (typeof a === 'number') { x = a; z = b; dist = c; } else { x = a.x; z = a.z; dist = b; }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this._focusTo = new THREE.Vector3(x, 0, z);
    this.panVel.set(0, 0);
    if (dist) this.cmdDistTarget = THREE.MathUtils.clamp(dist, MIN_DIST, MAX_DIST);
  }
  panTo(x, z) { this.focusOn(x, z); }

  serialize() { return { view: this.view, cmd: [this.target.x, this.target.z, this.cmdYaw, this.cmdPitch, this.cmdDistTarget] }; }
  deserialize(o = {}) {
    if (o.view) this.view = o.view === 'tp' ? 'tp' : 'fp';
    if (Array.isArray(o.cmd)) { const [x, z, yw, pt, d] = o.cmd; this.target.set(x, this.target.y, z); this.cmdYaw = yw; this.cmdPitch = pt; this.cmdDist = this.cmdDistTarget = d; }
    this.trans = null; this.eyeY = null;
  }

  toggleView() { this.view = this.view === 'fp' ? 'tp' : 'fp'; this.game.bus.emit('camera:view', { view: this.view }); }

  get sensitivity() { const s = this.game.settings?.sensitivity; return typeof s === 'number' && s > 0 ? s : 1; }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const g = this.game, cam = g.camera, input = g.input, p = g.player;
    if (!p || !g.world) return;
    // shake decay
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this._shakeT += dt;
    this._hurtKick = damp(this._hurtKick, 0, 9, dt);

    if (g.mode === 'explore') this._updateLook(dt);
    this._updateCommandControls(dt);

    // compute both poses as needed
    if (g.mode === 'explore') this._explorePose(dt);
    else this._commandPose(dt);

    // transition blend
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      const k = smooth(Math.min(1, tr.t / tr.dur));
      // arc: lift the path a bit so the camera swoops instead of clipping the terrain
      const lift = Math.sin(k * Math.PI) * (tr.to === 'command' ? 6 : 3);
      this._pos.lerpVectors(tr.fromPos, this._pos, k); this._pos.y += lift;
      this._quat.slerpQuaternions(tr.fromQuat, this._quat, k);
      this.fov = tr.fromFov + (this.fov - tr.fromFov) * k;
      if (tr.t >= tr.dur) this.trans = null;
    }

    cam.position.copy(this._pos);
    cam.quaternion.copy(this._quat);
    // screen shake (rotational, trauma^2)
    const s = this.trauma * this.trauma;
    if (s > 0.0001 || Math.abs(this._hurtKick) > 0.0005 || this.roll) {
      const t = this._shakeT * 32;
      _e.set(
        (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * 0.035 * s,
        (Math.sin(t * 0.97 + 1.3) + Math.sin(t * 2.13) * 0.5) * 0.035 * s,
        (Math.sin(t * 1.37 + 2.1)) * 0.05 * s + this._hurtKick + this.roll, 'YXZ');
      cam.quaternion.multiply(_q.setFromEuler(_e));
      if (g.mode === 'command') cam.position.addScaledVector(this.right, Math.sin(t * 1.7) * s * 0.6).y += Math.sin(t * 2.3) * s * 0.5;
    }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();

    // shadows follow what the camera looks at
    const sf = g.renderer.shadowFocus;
    if (g.mode === 'command') sf.set(this.target.x, this._groundY, this.target.z);
    else sf.copy(p.position);
  }

  _updateLook(dt) {
    const g = this.game, input = g.input, p = g.player;
    if (p.dead) return;
    const touch = g.isTouch;
    const sens = (touch ? 0.0052 : 0.0022) * this.sensitivity;
    let dx = input.lookDelta.x, dy = input.lookDelta.y;
    if (touch) { // gentle acceleration curve for thumbs: slow drags precise, flicks fast
      const m = Math.hypot(dx, dy); const acc = 1 + Math.min(1.2, m / 60); dx *= acc; dy *= acc;
    }
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * (g.settings?.invertY ? -1 : 1);
    // keyboard look (arrow keys are movement; use I/J/K/L? no — keep mouse only)
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  _explorePose(dt) {
    const g = this.game, p = g.player;
    // player recoil kicks (guns / spells) feed into pitch permanently like real recoil, decaying back a little
    if (p.recoil) { this.pitch = Math.min(1.55, this.pitch + p.recoil); p.recoil = 0; }
    p.yaw = this.yaw;
    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    // eye height with step smoothing (auto-step teleports 1 block up)
    const eyeH = p.crouching ? EYE_CROUCH : EYE;
    const targetEye = p.position.y + eyeH;
    if (this.eyeY === null || Math.abs(targetEye - this.eyeY) > 2.5 || p.dead) this.eyeY = targetEye;
    else if (targetEye > this.eyeY) this.eyeY = damp(this.eyeY, targetEye, p.onGround ? 16 : 60, dt);
    else this.eyeY = targetEye;
    const eye = _v.set(p.position.x, this.eyeY, p.position.z);

    // head bob & landing dip
    const bob = p.bobAmount || 0, ph = p.bobPhase || 0;
    let bobY = Math.abs(Math.sin(ph)) * 0.06 * bob - 0.03 * bob - (p.landDip || 0);
    let bobX = Math.cos(ph) * 0.035 * bob;
    if (g.settings?.headBob === false) { bobX = 0; bobY = -(p.landDip || 0); }

    // death camera: drop to the ground and roll
    if (p.dead) {
      const k = Math.min(1, (p.deadT || 0) / 0.9);
      bobY = -1.35 * smooth(k);
      this.roll = 0.5 * smooth(k);
    } else this.roll = damp(this.roll, 0, 8, dt);

    const wantTP = this.view === 'tp';
    this.tpDist = damp(this.tpDist, wantTP ? 4.2 : 0, 10, dt);
    if (this.tpDist < 0.05 && !wantTP) this.tpDist = 0;
    p.firstPerson = this.tpDist < 0.6;

    _e.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    this._quat.setFromEuler(_e);
    if (this.tpDist > 0) {
      // over-the-shoulder orbit with block collision
      const pivot = _v2.copy(eye); pivot.y += 0.1;
      pivot.addScaledVector(this.right, 0.45 * Math.min(1, this.tpDist / 4));
      const back = _v.copy(this.forward).negate();
      const hit = g.world.raycast(pivot, back, this.tpDist + 0.3, { solidOnly: true });
      const d = hit ? Math.max(0.2, hit.dist - 0.3) : this.tpDist;
      this._pos.copy(pivot).addScaledVector(back, d);
    } else {
      this._pos.copy(eye).addScaledVector(this.right, bobX);
      this._pos.y += bobY;
    }
    // FOV: sprint kick, bow zoom
    let fov = BASE_FOV + (g.settings?.fov ? g.settings.fov - BASE_FOV : 0);
    if (p.sprinting) fov += 9;
    if (p.charge > 0) fov -= 10 * p.charge;
    this.fov = damp(this.fov, fov, 8, dt);
  }

  _updateCommandControls(dt) {
    const g = this.game;
    if (g.mode !== 'command') return;
    const input = g.input, w = g.world;
    // rotate (Q/E, two-finger twist, RMB drag) and tilt
    let rot = 0;
    if (input.isDown('KeyQ')) rot += 1.6 * dt;
    if (input.isDown('KeyE')) rot -= 1.6 * dt;
    this.cmdYaw += rot + input.twist;
    this.cmdPitch = THREE.MathUtils.clamp(this.cmdPitch + input.tilt, 0.6, 1.3);
    // zoom (wheel / pinch / +-)
    if (input.wheel) this.cmdDistTarget *= Math.exp(input.wheel * 0.0012);
    if (input.pinch !== 1) this.cmdDistTarget /= input.pinch;
    if (input.isDown('Equal') || input.isDown('NumpadAdd')) this.cmdDistTarget *= Math.exp(-dt * 1.5);
    if (input.isDown('Minus') || input.isDown('NumpadSubtract')) this.cmdDistTarget *= Math.exp(dt * 1.5);
    this.cmdDistTarget = THREE.MathUtils.clamp(this.cmdDistTarget, MIN_DIST, MAX_DIST);
    const prevDist = this.cmdDist;
    this.cmdDist = damp(this.cmdDist, this.cmdDistTarget, 10, dt);
    void prevDist;

    // pan: drag in screen pixels → ground units (scaled by distance so the point under the finger stays put)
    const fx = -Math.sin(this.cmdYaw), fz = -Math.cos(this.cmdYaw);   // ground forward (away from camera)
    const rx = -fz, rz = fx;                                          // ground right
    const unitsPerPx = (2 * this.cmdDist * Math.tan(THREE.MathUtils.degToRad(CMD_FOV / 2))) / innerHeight;
    const pan = input.pan;
    if (pan.x || pan.y) {
      const k = unitsPerPx;
      const vx = (-pan.x * rx + pan.y * fx / Math.sin(this.cmdPitch) * 1) * k;
      const vz = (-pan.x * rz + pan.y * fz / Math.sin(this.cmdPitch) * 1) * k;
      this.target.x += vx; this.target.z += vz;
      if (dt > 0) { this.panVel.x = damp(this.panVel.x, vx / dt, 20, dt); this.panVel.y = damp(this.panVel.y, vz / dt, 20, dt); }
      this._focusTo = null;
    } else if (!input.dragging) {
      // inertia glide
      this.target.x += this.panVel.x * dt; this.target.z += this.panVel.y * dt;
      this.panVel.multiplyScalar(Math.exp(-dt * 4.5));
      if (this.panVel.lengthSq() < 0.01) this.panVel.set(0, 0);
    } else this.panVel.multiplyScalar(Math.exp(-dt * 20));
    // keyboard pan (WASD / arrows)
    const mv = input.move;
    if (mv.x || mv.y) {
      const sp = (12 + this.cmdDist * 0.9) * dt * (input.actions.sprint ? 2 : 1);
      this.target.x += (mv.y * fx + mv.x * rx) * sp; this.target.z += (mv.y * fz + mv.x * rz) * sp;
      this._focusTo = null;
    }
    if (this._focusTo) {
      this.target.x = damp(this.target.x, this._focusTo.x, 5, dt); this.target.z = damp(this.target.z, this._focusTo.z, 5, dt);
      if (Math.hypot(this.target.x - this._focusTo.x, this.target.z - this._focusTo.z) < 0.05) this._focusTo = null;
    }
    // clamp inside the world
    const m = 2, S = w.size;
    if (this.target.x < m || this.target.x > S - m) this.panVel.x = 0;
    if (this.target.z < m || this.target.z > S - m) this.panVel.y = 0;
    this.target.x = THREE.MathUtils.clamp(this.target.x, m, S - m);
    this.target.z = THREE.MathUtils.clamp(this.target.z, m, S - m);
    // follow terrain height smoothly (sample a small neighbourhood so cliffs don't jolt the view)
    let gy = 0, n = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { gy += w.surfaceY(this.target.x + i * 3, this.target.z + j * 3); n++; }
    gy = Math.max(gy / n, 19);
    this._groundY = damp(this._groundY, gy, 3, dt);
    this.target.y = this._groundY + 1;
  }

  _commandPose(dt) {
    const g = this.game, w = g.world;
    const cp = Math.cos(this.cmdPitch), sp = Math.sin(this.cmdPitch);
    // camera sits behind (+ back) the target along yaw
    const bx = Math.sin(this.cmdYaw) * cp, bz = Math.cos(this.cmdYaw) * cp;
    this._pos.set(this.target.x + bx * this.cmdDist, this.target.y + sp * this.cmdDist, this.target.z + bz * this.cmdDist);
    // keep above terrain
    const floor = w.surfaceY(this._pos.x, this._pos.z) + 3;
    if (this._pos.y < floor) this._pos.y = floor;
    _e.set(-this.cmdPitch, this.cmdYaw, 0, 'YXZ');
    this._quat.setFromEuler(_e);
    this.forward.set(-bx, -sp, -bz);
    this.right.set(Math.cos(this.cmdYaw), 0, -Math.sin(this.cmdYaw));
    this.fov = damp(this.fov, CMD_FOV, 6, dt);
  }

  _beginTransition(mode) {
    const g = this.game, p = g.player, cam = g.camera;
    this.trans = { t: 0, dur: mode === 'command' ? 0.85 : 0.65, fromPos: cam.position.clone(), fromQuat: cam.quaternion.clone(), fromFov: cam.fov, to: mode };
    if (mode === 'command' && p) {
      // frame the player from behind their current facing
      this.target.set(p.position.x, p.position.y, p.position.z);
      this._groundY = p.position.y - 1;
      this.cmdYaw = this.yaw + Math.PI;
      this.cmdDistTarget = this.cmdDist = Math.max(this.cmdDist, 26);
      this.panVel.set(0, 0);
      this._focusTo = null;
    } else if (mode === 'explore' && p) {
      // face the direction the command camera was looking
      this.yaw = this.cmdYaw + Math.PI;
      this.pitch = -0.2;
    }
  }
}
