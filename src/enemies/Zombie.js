import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { HumanoidModel } from '../entities/HumanoidModel.js';
import { B, BLOCKS } from '../core/blocks.js';
import { ZOMBIE_TYPES } from './zombieTypes.js';
import { getZombieSkin } from './skinFallback.js';
import { groundBurst, coinBurst, fallbackExplode } from './fx.js';

const SOLID = new Uint8Array(256);
for (const b of BLOCKS) if (b) SOLID[b.id] = b.solid ? 1 : 0;

const LOD_FAR = 60 * 60;       // squared distance to camera beyond which AI/animation are throttled
const EMERGE_TIME = 1.4;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _goal = { x: 0, y: 0, z: 0 };
const _nb = [];

// shared eye resources
const eyeGeo = new THREE.BoxGeometry(1, 1, 1);
const eyeMats = new Map();
function eyeMat(color) {
  let m = eyeMats.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: false }); eyeMats.set(color, m); }
  return m;
}
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
const glowMats = new Map();
function glowMat(color) {
  let m = glowMats.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false });
    glowMats.set(color, m);
  }
  return m;
}
const propMats = {};
function propMat(color, glow = false) {
  const k = color + (glow ? 'g' : '');
  if (!propMats[k]) propMats[k] = glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false }) : new THREE.MeshLambertMaterial({ color });
  return propMats[k];
}

let lastGroan = 0, lastHurtSnd = 0;

export class Zombie extends Entity {
  /**
   * @param game
   * @param {string} type walker|runner|brute|spitter|exploder|necromancer
   * @param opts { hpMul, dmgMul, wave, wanderer, sunproof, emerge (bool), seed }
   */
  constructor(game, type = 'walker', opts = {}) {
    const T = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.walker;
    const hpMul = opts.hpMul || 1;
    super(game, { kind: 'zombie', faction: 'undead', radius: T.radius, height: T.height, maxHp: Math.round(T.hp * hpMul) });
    this.type = ZOMBIE_TYPES[type] ? type : 'walker';
    this.T = T;
    this.dmgMul = opts.dmgMul || 1;
    this.wave = opts.wave || 0;
    this.wanderer = !!opts.wanderer;
    this.sunproof = !!opts.sunproof;
    this.boss = !!T.boss;
    this.name = T.name;
    this.speed = T.speed * (0.9 + Math.random() * 0.2) * (this.wanderer ? 0.65 : 1);
    this.autoStep = true;
    const seed = opts.seed ?? (Math.random() * 1e6) | 0;

    // --- model
    const hat = this.sunproof ? 'helmet' : T.hat || null;
    const hatColor = this.sunproof ? 0x6d6a60 : T.hatColor;
    this.model = new HumanoidModel({ skin: getZombieSkin(this.type, seed), height: T.height, zombie: true, width: T.width, hat, hatColor });
    // emissive uses the skin texture, so torch glow / night corpse-light keep the pixel detail
    this.model.material.emissiveMap = this.model.material.map;
    this.model.material.needsUpdate = true;
    this.visual = new THREE.Group();          // offset group (emerge / hover / dissolve)
    this.visual.add(this.model.group);
    this.object3d.add(this.visual);
    this._addEyes();
    if (this.type === 'necromancer') this._addNecroProps();
    if (this.type === 'exploder') this._addBoils();

    // --- AI state
    this.target = null;          // Entity being chased
    this.targetT = 0;            // retarget timer
    this.losOk = false; this.losT = 0;
    this.path = null; this.pathI = 0; this.pathT = 0;
    this.goal = new THREE.Vector3(this.position.x, 0, this.position.z);
    this.hasGoal = false;
    this.bTarget = null;         // building under attack
    this.breakCell = null;       // {x,y,z} block being smashed
    this.attackT = Math.random() * 0.5;
    this.thinkT = Math.random() * 0.2;
    this.blockedT = 0;
    this.sideT = 0; this.sideSign = 1;
    this.progT = 0; this.progPos = new THREE.Vector3();
    this.groanT = 3 + Math.random() * 12;
    this.sunT = Math.random();
    this.doomT = -1;             // >0: will burn at dawn regardless of shade
    this._sunburn = false;
    this.emergeT = opts.emerge === false ? 0 : EMERGE_TIME;
    this.far = false; this._animSkip = 0; this._shadow = true;
    this.deadT = 0;
    this.home = null;            // wanderer anchor
    this.wanderT = 0;
    // type specifics
    this.spitT = 1 + Math.random() * 2;
    this.fuseT = -1;
    this.castT = 2 + Math.random();
    this.raiseT = T.raiseCd ? 5 : 0;
    this.auraT = 0;
    this.hoverPhase = Math.random() * 6;
    this._pendingCast = null;
    this.killedBy = null;
  }

  // ------------------------------------------------------------------ visuals
  _addEyes() {
    const px = this.model.px, head = this.model.head;
    const mat = eyeMat(this.T.eye);
    this.eyes = [];
    // matches the 1-px eyes of src/art/skins.js zombie faces (row 4, columns 2 and 5)
    for (const sx of [-1.5, 1.5]) {
      const e = new THREE.Mesh(eyeGeo, mat);
      e.scale.set(1.25 * px, 1.1 * px, 0.4 * px);
      e.position.set(sx * px, 3.5 * px, 4.05 * px);
      head.add(e);
      this.eyes.push(e);
    }
    if (this.game.quality !== 'low') {
      const s = new THREE.Sprite(glowMat(this.T.eye));
      this._glowBase = this.boss ? 0.5 : 0.3 * (this.T.height / 1.8);
      s.scale.setScalar(this._glowBase);
      s.position.set(0, 3.5 * px, 4.6 * px);
      s.renderOrder = 6;
      head.add(s);
      this.eyeGlow = s;
    }
  }
  _addNecroProps() {
    const px = this.model.px;
    // floating crown of dark gold spikes above the hood
    const crown = new THREE.Group();
    const band = new THREE.Mesh(new THREE.BoxGeometry(9.4 * px, 1.5 * px, 9.4 * px), propMat(0x8a6a20));
    crown.add(band);
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 4.4], [0, -4.4], [4.4, 0], [-4.4, 0]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2 * px, 3 * px, 1.2 * px), propMat(0xd4a830));
      s.position.set(x * px, 2 * px, z * px); crown.add(s);
    }
    const gem = new THREE.Mesh(new THREE.BoxGeometry(1.6 * px, 1.6 * px, 0.6 * px), propMat(0xc050ff, true));
    gem.position.set(0, 0.5 * px, 4.9 * px); crown.add(gem);
    crown.position.y = 11 * px;
    this.model.head.add(crown);
    this.crown = crown;
    // staff with glowing orb in the right hand
    const staff = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(1.2 * px, 26 * px, 1.2 * px), propMat(0x2a1a14));
    stick.position.y = 2 * px; staff.add(stick);
    const orb = new THREE.Mesh(new THREE.BoxGeometry(3.4 * px, 3.4 * px, 3.4 * px), propMat(0xb040ff, true));
    orb.position.y = 16 * px; staff.add(orb);
    this.orb = orb;
    staff.rotation.x = Math.PI / 2;     // arm points forward in the zombie pose → staff upright
    this.model.hand.add(staff);
    this.staff = staff;
  }
  _addBoils() {
    const px = this.model.px;
    this.boils = [];
    const spots = [[3, 8, 2.6], [-2, 5, 2.6], [1, 2, 2.6], [-3, 9, -2.6], [2, 4, -2.6], [5.2, 7, 0]];
    for (const [x, y, z] of spots) {
      const m = new THREE.Mesh(eyeGeo, propMat(0x9aff40, true));
      m.scale.setScalar(2 * px);
      m.position.set(x * px, y * px, z * px);
      this.model.body.add(m);
      this.boils.push(m);
    }
  }
  _setShadow(on) {
    if (this._shadow === on) return;
    this._shadow = on;
    this.model.group.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const game = this.game;
    if (this.dead) { this._updateDead(dt); return; }
    const w = game.world; if (!w) return;

    // LOD
    const cam = game.camera.position;
    const dx = cam.x - this.position.x, dz = cam.z - this.position.z, dy = cam.y - this.position.y;
    const d2 = dx * dx + dz * dz + dy * dy;
    this.camD2 = d2;
    const far = d2 > LOD_FAR;
    if (far !== this.far) { this.far = far; this._setShadow(!far && game.quality !== 'low'); }

    if (this.emergeT > 0) { this._updateEmerge(dt); return; }

    this.tickStatus(dt);
    if (this.dead) return;

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = far ? 0.55 + Math.random() * 0.3 : 0.18 + Math.random() * 0.1;
      try { this._think(); } catch (e) { console.error('zombie think', e); }
    }
    this._sunCheck(dt);
    if (this.dead) return;

    const wantMove = this._steer(dt);
    this.physics(dt);
    this._blocked(dt, wantMove);
    this._act(dt);
    if (this.dead) return;

    // animation
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (!far || (this._animSkip -= dt) <= 0) {
      const adt = far ? 0.5 : dt;
      if (far) this._animSkip = 0.5;
      this.model.update(adt, this.type === 'runner' ? hs * 1.25 : hs);
      this._postAnim(adt);
    }
    this.syncObject(dt);
    // hover for the necromancer
    if (this.T.hover) {
      this.hoverPhase += dt * 2;
      this.visual.position.y = this.T.hover + Math.sin(this.hoverPhase) * 0.12;
    }
    // ambient groans (spatial, globally rate-limited)
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 5 + Math.random() * 12;
      if (d2 < 34 * 34 && game.time - lastGroan > 0.7) {
        lastGroan = game.time;
        game.audio?.play('zombie_groan', { pos: this.eye, pitch: this.T.groanPitch, volume: this.boss ? 1 : 0.65 });
      }
    }
  }

  _postAnim(dt) {
    const game = this.game;
    // eye glow brighter at night
    const night = game.state.nightFactor || 0;
    if (this.eyeGlow) this.eyeGlow.material.opacity = 0.1 + 0.5 * night;
    // faint corpse-light so silhouettes stay readable in the dark
    if (night > 0 && this.model.flashT <= 0) {
      const em = this.model.material.emissive;
      em.r += 0.06 * night; em.g += 0.1 * night; em.b += 0.08 * night;
    }
    if (this.eyeGlow) {
      // keep eyes readable from the top-down command camera
      const d = Math.sqrt(this.camD2 || 0);
      this.eyeGlow.scale.setScalar(this._glowBase * Math.min(3.2, Math.max(1, d / 18)));
    }
    if (this.type === 'exploder') {
      const fusing = this.fuseT >= 0;
      const f = fusing ? 0.5 + 0.5 * Math.sin(game.time * 30) : 0.5 + 0.5 * Math.sin(game.time * 3 + this.id);
      for (const b of this.boils) b.scale.setScalar(this.model.px * (1.8 + f * (fusing ? 1.6 : 0.6)));
      if (fusing) {
        this.model.material.emissive.setRGB(1, 1, 0.8).multiplyScalar(f * 0.7);
        const s = 1 + f * 0.12;
        this.model.group.scale.set(s, 1 + f * 0.05, s);
      }
    }
    if (this.orb) {
      const s = 1 + 0.25 * Math.sin(game.time * 5);
      this.orb.scale.setScalar(s);
    }
  }

  _updateEmerge(dt) {
    const game = this.game;
    const first = this.emergeT === EMERGE_TIME;
    this.emergeT -= dt;
    const k = Math.max(0, this.emergeT / EMERGE_TIME);
    this.visual.position.y = -this.height * 0.95 * k * k;
    this.visual.rotation.z = Math.sin(k * 12) * 0.08 * k;
    if (first || Math.random() < dt * 8) {
      if (first) groundBurst(game, this.position.x, this.position.y, this.position.z, { purple: this.boss || this.raisedByNecro, big: this.boss || this.type === 'brute' });
      else game.particles?.emit({ pos: { x: this.position.x, y: this.position.y + 0.1, z: this.position.z }, box: 0.4, count: 3, colors: [0x4a3a2a, 0x3a2e22], speed: 1.5, dir: { x: 0, y: 3, z: 0 }, gravity: 14, life: 0.6, size: 0.12 });
    }
    if (first && this.camD2 < 40 * 40) game.audio?.play('dig_dirt', { pos: this.position, pitch: 0.6, volume: 0.8 });
    this.model.update(dt, 0);
    this._postAnim(dt);
    this.syncObject(dt);
    if (this.emergeT <= 0) { this.visual.position.y = this.T.hover || 0; this.visual.rotation.z = 0; this.emergeT = 0; }
  }

  // ------------------------------------------------------------------ AI: targets
  _think() {
    const game = this.game;
    const pos = this.position;
    const T = this.T;
    // drop invalid targets
    if (this.target && (this.target.dead || !this.target.object3d?.parent && this.target.kind !== 'player')) this.target = null;
    if (this.bTarget && this.bTarget.state === 'destroyed') this.bTarget = null;

    this.targetT -= this.far ? 0.6 : 0.2;
    if (this.targetT <= 0) {
      this.targetT = 1 + Math.random() * 0.5;
      const range = T.aggro * (game.state.isNight ? 1 : 0.8);
      const cand = game.entities.nearest(pos, (e) => e.faction === 'village' && e.kind !== 'projectile' && !e.hidden && !e.invisible, range);
      if (cand) {
        const d = cand.position.distanceTo(pos);
        let ok = d < 5;
        if (!ok) ok = this._los(cand);
        if (ok) { if (this.target !== cand) { this.target = cand; this.path = null; } }
        else if (this.target && this.target.position.distanceTo(pos) > T.aggro * 1.4) this.target = null;
      } else if (this.target && this.target.position.distanceTo(pos) > T.aggro * 1.5) this.target = null;
      if (this.wanderer && this.target && this.home && pos.distanceTo(this.home) > 32) this.target = null;
    }
  }
  _los(e) {
    const w = this.game.world;
    const o = _v.copy(this.eye), t = _v2.copy(e.eye).sub(o);
    const dist = t.length();
    if (dist < 0.1) return true;
    t.divideScalar(dist);
    const hit = w.raycast(o, t, dist, { solidOnly: true });
    return !hit;
  }

  // ------------------------------------------------------------------ AI: movement
  /** Sets velocity toward the current objective. Returns true if the zombie wants to move. */
  _steer(dt) {
    const game = this.game, pos = this.position, T = this.T;
    let gx = null, gz = null, speed = this.speed, face = null;
    const tgt = this.target;
    this.marching = false;
    if (this.fuseT >= 0 || this._pendingCast || this.stunTimer > 0) {
      speed = 0;
    } else if (tgt) {
      const dx = tgt.position.x - pos.x, dz = tgt.position.z - pos.z, dy = tgt.position.y - pos.y;
      const d = Math.hypot(dx, dz);
      face = Math.atan2(dx, dz);
      this.losT -= dt;
      if (this.losT <= 0) { this.losT = 0.8; this.losOk = this._los(tgt); }
      if (this.type === 'spitter' && d < T.keep[1] + 2) {
        // keep distance: back off when too close, hold when in range
        if (d < T.keep[0]) { gx = pos.x - dx; gz = pos.z - dz; speed *= 0.8; }
        else if (d > T.keep[1]) { gx = tgt.position.x; gz = tgt.position.z; }
        else { speed = 0; }
      } else if (this.type === 'necromancer' && d < 9 && d > 3) {
        speed = 0;       // casts from range
      } else {
        const direct = d < 2.5 || (this.losOk && Math.abs(dy) < 1.5 && d < 14);
        if (direct) { gx = tgt.position.x; gz = tgt.position.z; this.path = null; }
        else {
          this.pathT -= dt;
          if ((!this.path || this.pathT <= 0) && game.waves?.takePathBudget?.()) {
            this.pathT = 1.2 + Math.random() * 0.4;
            this.path = game.world.findPath(pos, tgt.position, { maxNodes: 350, range: 1.5, partial: true });
            this.pathI = 1;
          }
          if (this.path && this.pathI < this.path.length) {
            const p = this.path[this.pathI];
            gx = p.x + 0.5; gz = p.z + 0.5;
            if (Math.hypot(gx - pos.x, gz - pos.z) < 0.45) this.pathI++;
          } else { gx = tgt.position.x; gz = tgt.position.z; }
        }
        if (d < this.radius + tgt.radius + 0.35) speed = 0;   // in melee range: stop and swing
      }
    } else if (this.wanderer) {
      this.wanderT -= dt;
      if (!this.home) this.home = pos.clone();
      if (this.wanderT <= 0 || !this.hasGoal) {
        this.wanderT = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 10;
        this.goal.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        this.hasGoal = true;
        this._idle = Math.random() < 0.35;
      }
      if (!this._idle) { gx = this.goal.x; gz = this.goal.z; if (Math.hypot(gx - pos.x, gz - pos.z) < 0.6) this._idle = true; }
    } else {
      // march along the shared flow field
      this.marching = true;
      const flow = game.waves?.flow;
      const d = flow ? flow.next(pos.x, pos.z, _goal) : -1;
      this.flowDist = d;
      if (d >= 0) {
        const here = flow.distAt(pos.x, pos.z);
        if (here === 0 || d === 0 && Math.hypot(_goal.x - pos.x, _goal.z - pos.z) < 1.3) {
          // arrived at a building: attack it
          if (!this.bTarget) this.bTarget = flow.buildingAtCell(pos.x, pos.z) || flow.buildingAtCell(_goal.x, _goal.z) || this._nearestBuilding();
        }
        gx = _goal.x; gz = _goal.z;
        if (this.type === 'spitter' && here < T.keep[1] && here < 1e8) {
          const b = this.bTarget || flow.buildingAtCell(_goal.x, _goal.z) || this._nearestBuilding();
          if (b) { this.bTarget = b; speed = 0; const c = buildingCenter(b); face = Math.atan2(c.x - pos.x, c.z - pos.z); }
        }
      } else {
        // no field: head straight for the village centre
        const th = game.village?.townHall;
        const S = game.world.size;
        gx = th?.x ?? S / 2; gz = th?.z ?? S / 2;
      }
    }

    const v = this.velocity;
    let mx = 0, mz = 0;
    if (gx !== null && speed > 0) {
      mx = gx - pos.x; mz = gz - pos.z;
      const l = Math.hypot(mx, mz);
      if (l > 0.05) { mx /= l; mz /= l; } else { mx = mz = 0; }
      if (face === null && (mx || mz)) face = Math.atan2(mx, mz);
    }
    this.moveDirX = mx; this.moveDirZ = mz;
    // sidestep when jammed on a corner
    if (this.sideT > 0) {
      this.sideT -= dt;
      const px = -mz * this.sideSign, pz = mx * this.sideSign;
      mx = mx * 0.3 + px; mz = mz * 0.3 + pz;
    }
    // separation from other zombies
    let sx = 0, sz = 0;
    const waves = game.waves;
    if (waves?.near) {
      const n = waves.near(pos.x, pos.z, 1.6, _nb);
      for (let i = 0; i < n; i++) {
        const o = _nb[i];
        if (o === this || o.dead) continue;
        const ox = pos.x - o.position.x, oz = pos.z - o.position.z;
        const dd = Math.hypot(ox, oz);
        const min = this.radius + o.radius + 0.25;
        if (dd < min && dd > 1e-4) { const f = (min - dd) / min; sx += ox / dd * f; sz += oz / dd * f; }
        else if (dd <= 1e-4) { sx += Math.random() - 0.5; sz += Math.random() - 0.5; }
      }
    }
    const sm = this.speedMul * (this.inWater ? 0.6 : 1);
    const tx = mx * speed * sm + sx * 2.2, tz = mz * speed * sm + sz * 2.2;
    const acc = Math.min(1, dt * (this.onGround ? 10 : 2.5));
    v.x += (tx - v.x) * acc;
    v.z += (tz - v.z) * acc;
    if (this.inWater && (this.headInWater || this.hitWall)) v.y = Math.max(v.y, this.hitWall ? 5 : 2.5);
    if (face !== null) this.yaw = lerpAngle(this.yaw, face, Math.min(1, dt * 8));
    return speed > 0 && (mx !== 0 || mz !== 0);
  }

  _nearestBuilding() {
    const v = this.game.village;
    if (!v) return null;
    try {
      if (typeof v.nearestBuilding === 'function') return v.nearestBuilding(this.position, (b) => b.state !== 'destroyed' && b.state !== 'planned');
    } catch (e) { /* ignore */ }
    return v.townHall || null;
  }

  /** Detect being stuck against blocks; choose a block to smash. */
  _blocked(dt, wantMove) {
    const pos = this.position;
    if (wantMove && this.hitWall) this.blockedT += dt; else this.blockedT = Math.max(0, this.blockedT - dt * 2);
    // progress watchdog
    this.progT += dt;
    if (this.progT > 2) {
      const moved = Math.hypot(pos.x - this.progPos.x, pos.z - this.progPos.z);
      if (wantMove && moved < 0.35 && !this.breakCell) {
        const cell = this._findBlocking();
        if (cell) this.breakCell = cell;
        else { this.sideT = 0.8; this.sideSign = Math.random() < 0.5 ? -1 : 1; if (this.onGround) this.velocity.y = 6.5; }
        this.path = null;
      }
      this.progT = 0; this.progPos.copy(pos);
    }
    if (this.blockedT > 0.25 && !this.breakCell && this.T.blockDps > 0) {
      const cell = this._findBlocking();
      if (cell) this.breakCell = cell;
      else if (this.blockedT > 0.8) { this.sideT = 0.6; this.sideSign = Math.random() < 0.5 ? -1 : 1; this.blockedT = 0; }
    }
  }

  _findBlocking() {
    const w = this.game.world, p = this.position;
    let dx = this.moveDirX, dz = this.moveDirZ;
    if (!dx && !dz) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); }
    const H = Math.ceil(this.height - 0.05);
    const fy = Math.floor(p.y + 0.05);
    const reach = this.radius + 0.45;
    const cols = [
      [Math.floor(p.x + dx * reach), Math.floor(p.z + dz * reach)],
      [Math.floor(p.x + Math.sign(dx) * reach), Math.floor(p.z)],
      [Math.floor(p.x), Math.floor(p.z + Math.sign(dz) * reach)],
    ];
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    for (const [cx, cz] of cols) {
      if (cx === px && cz === pz) continue;
      for (let k = H - 1; k >= 0; k--) if (breakable(w, cx, fy + k, cz)) return { x: cx, y: fy + k, z: cz };
      // only a 1-block step in front: clear headroom so autoStep can climb it
      if (breakable(w, cx, fy + H, cz)) return { x: cx, y: fy + H, z: cz };
      if (breakable(w, px, fy + H, pz) && w.isSolid(cx, fy, cz)) return { x: px, y: fy + H, z: pz };
    }
    return null;
  }

  // ------------------------------------------------------------------ AI: actions
  _act(dt) {
    const game = this.game, T = this.T, pos = this.position;
    this.attackT -= dt;
    const tgt = this.target;
    let tgtDist = Infinity;
    if (tgt) tgtDist = Math.hypot(tgt.position.x - pos.x, tgt.position.z - pos.z);

    // pending cast (spit / bolt) released after the wind-up
    if (this._pendingCast) {
      this._pendingCast.t -= dt;
      if (this._pendingCast.t <= 0) { const c = this._pendingCast; this._pendingCast = null; c.fn(); }
      return;
    }

    // --- exploder
    if (this.type === 'exploder') {
      if (this.fuseT >= 0) {
        this.fuseT -= dt;
        if (Math.random() < dt * 25) game.particles?.emit({ pos: this.center, box: 0.4, count: 2, colors: [0xffffa0, 0xffa030], additive: true, speed: 2, life: 0.3, size: 0.2, gravity: 0 });
        if (this.fuseT <= 0) this._explode();
        return;
      }
      const near = (tgt && tgtDist < 1.8 && Math.abs(tgt.position.y - pos.y) < 2) || this.breakCell || (this.marching && this.bTarget);
      if (near) {
        this.fuseT = T.fuse;
        this.breakCell = null;
        game.audio?.play('fireball_cast', { pos, pitch: 0.45, volume: 0.9 });
        this.model.flash(0xffffff);
      }
      return;
    }

    // --- necromancer: bolts + raising the dead
    if (this.type === 'necromancer') {
      this.auraT -= dt;
      if (this.auraT <= 0 && !this.far) {
        this.auraT = 0.08;
        game.particles?.emit({ pos: { x: pos.x, y: pos.y + 0.3, z: pos.z }, box: 0.6, count: 2, colors: [0x8030e0, 0x3a1060, 0xc080ff], additive: true, speed: 0.4, dir: { x: 0, y: 1.2, z: 0 }, gravity: -0.5, life: 1.0, size: 0.3 });
      }
      this.castT -= dt;
      this.raiseT -= dt;
      if (this.raiseT <= 0) { this.raiseT = T.raiseCd * (0.85 + Math.random() * 0.3); this._raise(); return; }
      if (this.castT <= 0) {
        let aim = null, homing = null;
        if (tgt && tgtDist < 20 && this.losOk) { aim = tgt.center.clone(); homing = tgt; }
        else if (this.bTarget) aim = buildingCenter(this.bTarget);
        if (aim) {
          this.castT = T.boltCd;
          this.model.play('cast');
          this._pendingCast = { t: 0.35, fn: () => {
            const from = this._handPos();
            game.waves?.projectiles?.fire('shadow', this, from, aim, { damage: T.boltDmg * this.dmgMul, homing, speed: 11 });
          } };
          return;
        }
      }
    }

    // --- spitter: lob acid
    if (this.type === 'spitter') {
      this.spitT -= dt;
      let aim = null;
      if (tgt && tgtDist < T.keep[1] + 3 && this.losOk) aim = tgt.position.clone().add(_v.set(tgt.velocity.x * 0.6, 0.9, tgt.velocity.z * 0.6));
      else if (!tgt && this.bTarget && this.velocity.lengthSq() < 0.3) aim = buildingCenter(this.bTarget);
      if (aim && this.spitT <= 0) {
        this.spitT = T.spitCd * (0.85 + Math.random() * 0.3);
        this.model.play('cast');
        this._pendingCast = { t: 0.3, fn: () => this._spit(aim) };
        return;
      }
    }

    // --- melee vs. entities
    if (tgt && tgtDist < this.radius + tgt.radius + T.reach && Math.abs(tgt.position.y - pos.y) < 1.8) {
      this.breakCell = null;
      if (this.attackT <= 0) {
        this.attackT = T.cd;
        this.model.play('attack');
        const dir = _v.set(tgt.position.x - pos.x, 0, tgt.position.z - pos.z).normalize();
        const combat = game.combat;
        let done = false;
        if (combat && typeof combat.meleeHit === 'function') {
          try { combat.meleeHit(this, tgt, T.dmg * this.dmgMul, { kind: 'phys', knockback: T.knock, dir: dir.clone(), point: tgt.center.clone() }); done = true; } catch (e) { done = false; }
        }
        if (!done) {
          const kb = dir.clone().multiplyScalar(T.knock);
          kb.y = T.knock > 5 ? 5 : 0;
          tgt.damage(T.dmg * this.dmgMul, this, { kind: 'phys', knockback: kb });
          game.audio?.play('hit_flesh', { pos: tgt.position, pitch: this.type === 'brute' ? 0.6 : 1 });
        }
        if (this.type === 'brute') game.particles?.emit({ pos: tgt.position, box: 0.4, count: 10, colors: [0x6a5a4a, 0x8a7a6a], speed: 3, dir: { x: 0, y: 2, z: 0 }, life: 0.6, size: 0.18 });
      }
      return;
    }

    // --- smashing blocks
    if (this.breakCell) {
      const c = this.breakCell, w = game.world;
      const cx = c.x + 0.5, cz = c.z + 0.5;
      const d = Math.hypot(cx - pos.x, cz - pos.z);
      if (!breakable(w, c.x, c.y, c.z) || d > 2.4 || Math.abs(c.y - pos.y) > this.height + 1.2) { this.breakCell = null; return; }
      this.yaw = lerpAngle(this.yaw, Math.atan2(cx - pos.x, cz - pos.z), Math.min(1, dt * 10));
      if (this.attackT <= 0) {
        this.attackT = T.cd;
        this._hitBlock(c.x, c.y, c.z);
      }
      return;
    }

    // --- attacking a building we've reached
    if (this.bTarget && this.marching) {
      const b = this.bTarget;
      if (this.attackT <= 0) {
        const cell = this._buildingBlockNear(b);
        if (cell) { this.breakCell = cell; }
        else if (this._nearBuilding(b)) {
          this.attackT = T.cd;
          this.model.play('attack');
          try { b.damage?.(T.bldDmg * this.dmgMul, this); } catch (e) { /* ignore */ }
          const c = buildingCenter(b);
          game.particles?.emit({ pos: { x: pos.x + Math.sin(this.yaw) * 0.8, y: pos.y + 1, z: pos.z + Math.cos(this.yaw) * 0.8 }, count: 4, colors: [0x7a5a3a, 0x5a4030], speed: 2, life: 0.5, size: 0.1 });
          game.audio?.play('dig_wood', { pos: c, pitch: 0.8, volume: 0.6 });
        } else this.bTarget = null;
      }
    }
  }

  _hitBlock(x, y, z) {
    const game = this.game, w = game.world, T = this.T;
    const id = w.getBlock(x, y, z);
    const b = BLOCKS[id];
    this.model.play('attack');
    const dmg = T.blockDps * T.cd * this.dmgMul;
    const bld = game.village?.buildingAt?.(x, y, z) || null;
    const res = w.hitBlock(x, y, z, dmg, this);
    if (bld) { try { bld.damage?.(T.bldDmg * this.dmgMul, this); } catch (e) { /* ignore */ } }
    if (!res.broken) {
      const point = { x: x + 0.5 - Math.sin(this.yaw) * 0.5, y: Math.min(y + 0.5, this.position.y + 1.2), z: z + 0.5 - Math.cos(this.yaw) * 0.5 };
      game.particles?.blockHit(x, y, z, id, point);
    }
    if (this.camD2 < 45 * 45) {
      const snd = b?.tool === 'axe' ? 'dig_wood' : b?.tool === 'shovel' ? 'dig_dirt' : 'dig_stone';
      game.audio?.play(res.broken ? 'break_block' : snd, { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, pitch: this.type === 'brute' ? 0.7 : 0.9, volume: 0.8 });
    }
    if (this.type === 'brute') {
      // heavy slam knocks nearby defenders back
      for (const e of game.entities.query(this.center, 2.2, (e) => e.faction === 'village')) {
        const kb = new THREE.Vector3(e.position.x - this.position.x, 0, e.position.z - this.position.z).normalize().multiplyScalar(4);
        e.velocity.add(kb);
      }
    }
    if (res.broken) this.breakCell = null;
  }

  _buildingBlockNear(b) {
    const w = this.game.world, p = this.position, vil = this.game.village;
    if (!vil?.buildingAt) return null;
    const fx = Math.floor(p.x), fy = Math.floor(p.y + 0.05), fz = Math.floor(p.z);
    const H = Math.ceil(this.height - 0.05);
    let best = null, bd = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let k = -1; k <= H; k++) {
      const x = fx + dx, y = fy + k, z = fz + dz;
      if (!breakable(w, x, y, z)) continue;
      if (vil.buildingAt(x, y, z) !== b) continue;
      const d = Math.abs(dx) + Math.abs(dz) + Math.abs(k - 1) * 0.3;
      if (d < bd) { bd = d; best = { x, y, z }; }
    }
    return best;
  }
  _nearBuilding(b) {
    const flow = this.game.waves?.flow;
    if (flow) {
      const p = this.position;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (flow.buildingAtCell(p.x + dx, p.z + dz) === b) return true;
    }
    const c = buildingCenter(b);
    return Math.hypot(c.x - this.position.x, c.z - this.position.z) < 4;
  }

  _handPos() {
    const p = this.position;
    return new THREE.Vector3(p.x + Math.sin(this.yaw) * 0.6, p.y + this.height * 0.8 + (this.T.hover || 0), p.z + Math.cos(this.yaw) * 0.6);
  }
  _spit(aim) {
    const game = this.game;
    const from = this._handPos();
    const dmg = this.T.spitDmg * this.dmgMul;
    const combat = game.combat;
    let done = false;
    if (combat && typeof combat.fireProjectile === 'function') {
      try { done = !!combat.fireProjectile('acid', this, from, aim, { damage: dmg, faction: 'undead' }); } catch (e) { done = false; }
    }
    if (!done) game.waves?.projectiles?.fire('acid', this, from, aim, { damage: dmg });
    game.particles?.emit({ pos: from, count: 6, colors: [0x66ff33, 0xaaff55], additive: true, speed: 1.5, life: 0.4, size: 0.18 });
  }

  _raise() {
    const game = this.game, waves = game.waves;
    this.model.play('cast');
    game.audio?.play('zombie_groan', { pos: this.position, pitch: 0.45, volume: 1 });
    game.audio?.play('fireball_cast', { pos: this.position, pitch: 0.35, volume: 0.8 });
    game.particles?.emit({ pos: this.center, box: 0.3, count: 40, colors: [0xa040ff, 0xd080ff, 0x5010a0], additive: true, speed: 4, life: 0.8, size: 0.3, gravity: 0 });
    if (!waves?.spawn) return;
    const cap = waves.maxAlive ?? 45;
    const n = Math.min(3, Math.max(0, cap - waves.aliveCount()));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2.2;
      const z = waves.spawn('walker', this.position.x + Math.cos(a) * r, this.position.z + Math.sin(a) * r, { wave: this.wave, raised: true, hpMul: this.raiseHpMul || 1 });
      if (z) z.raisedByNecro = true;
    }
  }

  _explode() {
    if (this.dead) return;
    const game = this.game, T = this.T;
    const pos = this.center.clone();
    this._exploded = true;
    const combat = game.combat;
    let done = false;
    if (combat && typeof combat.explode === 'function' && combat.explode.length > 0) {
      try { const r = combat.explode(pos, T.blastR, T.blastDmg * this.dmgMul, this, { breakBlocks: true, faction: 'undead' }); done = r !== false; } catch (e) { done = false; }
    }
    if (!done) fallbackExplode(game, pos, T.blastR, T.blastDmg * this.dmgMul, this, true);
    this.hp = 0;
    this.die(this);
  }

  // ------------------------------------------------------------------ sunlight
  _sunCheck(dt) {
    this.sunT -= dt;
    if (this.sunT > 0) return;
    this.sunT = 0.5;
    const st = this.game.state;
    let burn = false;
    if (this.doomT > 0) { this.doomT = Math.max(0, this.doomT - 0.5); if (this.doomT > 0) return; }
    if (this.doomT === 0) burn = !st.isNight;
    else if (!this.sunproof && !st.isNight && st.nightFactor < 0.4) {
      const p = this.position;
      const l = this.game.world.getLight(Math.floor(p.x), Math.floor(p.y + this.height - 0.1), Math.floor(p.z));
      burn = (l >> 4) >= 14;
    }
    if (!burn || this.inWater) { this._sunburn = false; return; }
    this._sunburn = true;
    this.burnTimer = Math.max(this.burnTimer, 1.2);
    this.damage(Math.max(3, this.maxHp * 0.06), 'sun', { kind: 'fire' });
    if (!this.far && !this.dead) this.game.particles?.emit({ pos: this.eye, box: 0.3, count: 4, colors: [0x3a3632, 0x5a5550], speed: 0.6, dir: { x: 0, y: 2, z: 0 }, gravity: -1, life: 1.4, size: 0.4, alpha: 0.5 });
  }
  /** Called at dawn: burn after `delay` seconds even in shade. */
  doom(delay) { this.doomT = Math.max(0.01, delay); this.sunproof = false; }

  // ------------------------------------------------------------------ damage / death
  onHurt(amount, source, opts) {
    const game = this.game;
    if (source !== 'sun') {
      if (!this.model.action) this.model.play('hurt');
      if (game.time - (this._hurtSnd || 0) > 0.35 && game.time - lastHurtSnd > 0.08) {
        this._hurtSnd = lastHurtSnd = game.time;
        game.audio?.play('zombie_hurt', { pos: this.eye, pitch: this.T.groanPitch * (0.9 + Math.random() * 0.2) });
      }
      if (!this.far) game.particles?.emit({ pos: this.center, box: 0.2, count: 6, colors: [0x5a1a10, 0x3a6a20, 0x2a1008], speed: 2.5, life: 0.5, size: 0.12, gravity: 12 });
      // retaliate against whoever hurt us
      const src = source && source.faction === 'village' ? source : source?.owner?.faction === 'village' ? source.owner : null;
      if (src && !src.dead && src.position && src.position.distanceTo(this.position) < 30 && this.type !== 'exploder') { this.target = src; this.targetT = 3; this.path = null; }
    }
  }

  onDeath(source) {
    const game = this.game;
    this.removeAt = game.time + (this._exploded ? 0.05 : 2.4);
    this.killedBy = source;
    this.velocity.x *= 0.3; this.velocity.z *= 0.3;
    if (this._exploded) { this.object3d.visible = false; return; }
    const sun = source === 'sun' || (this._sunburn && !source);
    game.audio?.play('zombie_die', { pos: this.eye, pitch: this.T.groanPitch });
    game.bus.emit('zombie:killed', { zombie: this, by: source });
    if (!sun) {
      if (game.state.stats) game.state.stats.kills = (game.state.stats.kills || 0) + 1;
      this._dropLoot();
    }
    if (this.type === 'exploder' && !sun) {
      // popping the bloated corpse: small burst that doesn't break blocks
      const pos = this.center.clone();
      game.particles?.emit({ pos, box: 0.3, count: 30, colors: [0x9aff40, 0x60c020, 0xe0ff90], additive: true, speed: 5, life: 0.5, size: 0.3, gravity: 6 });
      game.audio?.play('splash', { pos, pitch: 0.6 });
      for (const e of game.entities.query(pos, 2.2, (e) => e.faction === 'village' && e.kind !== 'projectile')) e.damage(6, this, { kind: 'poison' });
    }
    if (this.boss) {
      game.particles?.emit({ pos: this.center, box: 0.5, count: 80, colors: [0xa040ff, 0xd080ff, 0xffffff], additive: true, speed: 6, life: 1.4, size: 0.4, gravity: -1 });
      game.bus.emit('toast', { text: 'Некромант повержен!', kind: 'good' });
    }
  }

  _dropLoot() {
    const game = this.game, T = this.T;
    let gold = 0, crystal = 0;
    if (this.boss) { gold = 15 + ((Math.random() * 10) | 0); crystal = 3; }
    else {
      if (Math.random() < T.loot) gold = 1 + ((Math.random() * 3) | 0) + (this.type === 'brute' ? 2 : 0);
      if (Math.random() < (this.type === 'brute' ? 0.12 : 0.04)) crystal = 1;
    }
    if (this.raisedByNecro) { gold = Math.min(gold, 1); crystal = 0; }
    if (!gold && !crystal) return;
    if (gold) game.state.add('gold', gold);
    if (crystal) game.state.add('crystal', crystal);
    coinBurst(game, this.center.clone(), gold, crystal);
    game.audio?.play('coins', { pos: this.center, volume: 0.7 });
    game.bus.emit('loot:dropped', { pos: this.center.clone(), gold, crystal, source: this });
  }

  _updateDead(dt) {
    const game = this.game;
    if (this._exploded) return;
    this.deadT += dt;
    // settle on the ground
    this.velocity.x *= Math.pow(0.05, dt); this.velocity.z *= Math.pow(0.05, dt);
    this.physics(dt);
    this.model.update(dt, 0);
    if (this.eyeGlow) this.eyeGlow.material = this.eyeGlow.material; // keep
    // dissolve into particles
    if (this.deadT > 0.9) {
      const k = Math.min(1, (this.deadT - 0.9) / 1.4);
      if (this.eyes && k > 0.2) { for (const e of this.eyes) e.visible = false; if (this.eyeGlow) this.eyeGlow.visible = false; }
      this.visual.position.y = (this.T.hover ? 0 : 0) - k * 0.6;
      const s = 1 - k * 0.85;
      this.visual.scale.set(s, 1 - k * 0.6, s);
      if (Math.random() < dt * (this.far ? 5 : 30)) {
        const c = this.center;
        game.particles?.emit({ pos: { x: c.x, y: this.position.y + 0.3, z: c.z }, box: 0.55 * this.T.width, count: this.boss ? 5 : 3, colors: [0x2c3a22, 0x4a5a38, 0x1c1a18, 0x6a7a50], speed: 0.6, dir: { x: 0, y: 1.6, z: 0 }, gravity: -0.8, life: 1.1, size: 0.18, drag: 0.6 });
        if (Math.random() < 0.3) game.particles?.emit({ pos: { x: c.x, y: this.position.y + 0.5, z: c.z }, box: 0.4, count: 1, colors: [this.T.eye], additive: true, speed: 0.2, dir: { x: 0, y: 2, z: 0 }, gravity: -0.5, life: 0.9, size: 0.2 });
      }
    }
    this.syncObject(dt);
  }
}

function breakable(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (!SOLID[id]) return false;
  const b = BLOCKS[id];
  return !!b && isFinite(b.hardness) && id !== B.BEDROCK;
}

export function buildingCenter(b) {
  if (b.center) return b.center.isVector3 ? b.center : new THREE.Vector3(b.center.x, b.center.y, b.center.z);
  if (b.w && b.d) return new THREE.Vector3(b.x + b.w / 2, (b.y ?? 20) + Math.min(3, (b.height || 3) / 2), b.z + b.d / 2);
  let w = 1, d = 1;
  const size = b.size || b.type?.size;
  if (Array.isArray(size)) { w = size[0]; d = size[1]; } else if (typeof size === 'number') w = d = size;
  if ((b.rot | 0) % 2 === 1) { const t = w; w = d; d = t; }
  if (b.bounds && b.bounds.x0 !== undefined) return new THREE.Vector3((b.bounds.x0 + b.bounds.x1 + 1) / 2, (b.y ?? 20) + 1.5, (b.bounds.z0 + b.bounds.z1 + 1) / 2);
  return new THREE.Vector3((b.x ?? 0) + w / 2, (b.y ?? 20) + 1.5, (b.z ?? 0) + d / 2);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
