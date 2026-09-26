import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { HumanoidModel } from '../entities/HumanoidModel.js';
import { makeShieldMesh } from '../entities/shield.js';
import { villagerSkin } from '../art/skins.js';
import { B } from '../core/blocks.js';
import { JOBS } from './names.js';
import { makeBlockMesh } from './visuals.js';
import { brainFor } from './jobs.js';

const CARRY_BLOCK = { wood: B.LOG, stone: B.COBBLESTONE, food: B.HAY_BALE, coal: B.COAL_ORE, iron: B.IRON_BLOCK, gold: B.GOLD_ORE, crystal: B.CRYSTAL_ORE, iron_ore: B.IRON_ORE, gold_ore: B.GOLD_ORE };
export const RES_GEN = { wood: 'дерева', stone: 'камня', food: 'еды', coal: 'угля', iron: 'железа', gold: 'золота', crystal: 'кристаллов', iron_ore: 'железной руды', gold_ore: 'золотой руды' };

/**
 * Living villager (Millénaire-style). Behaviour is written as generator "brains" (see jobs.js):
 * each frame the active brain is resumed with dt; helpers like walkTo()/wait() are sub-generators.
 */
export class Villager extends Entity {
  constructor(game, village, o = {}) {
    super(game, { kind: 'villager', faction: 'village', maxHp: o.job === 'guard' ? 130 : 40, radius: 0.3, height: 1.8 });
    this.village = village;
    this.name = o.name || 'Житель';
    this.female = !!o.female;
    this.seed = o.seed ?? ((Math.random() * 1e9) | 0);
    this.job = o.job || 'idle';
    this.workplace = null;
    this.home = null;
    this.task = 'Осматривается';
    this.hunger = o.hunger ?? 100;       // 100 = well fed
    this.mood = o.mood ?? 70;            // 0..100
    this.eatTimer = 60 + Math.random() * 60;
    this.carry = {};
    this.hidden = false;
    this.brain = null;
    this.mode = null;
    this.walkSpeed = 2.5 + Math.random() * 0.3;
    this._steer = null;
    this._want = new THREE.Vector2();
    this._releases = [];
    this._regen = 0;
    this.fleeUntil = 0;
    this.buildTarget = null;
    this.onPost = false;
    this.speedNow = 0;
    this.buildModel();
  }

  // ---------------------------------------------------------------- appearance
  buildModel() {
    if (this.model) { this.object3d.remove(this.model.group); this.model.dispose(); }
    let skin = null;
    try { skin = villagerSkin(this.job, this.seed); } catch (e) { skin = null; }
    if (!skin) { skin = document.createElement('canvas'); skin.width = skin.height = 64; const g = skin.getContext('2d'); g.fillStyle = '#c89870'; g.fillRect(0, 0, 64, 64); }
    const J = JOBS[this.job] || JOBS.idle;
    this.model = new HumanoidModel({ skin, height: this.female ? 1.74 : 1.8, hat: J.hat, hatColor: J.hatColor });
    this.object3d.add(this.model.group);
    this._carryMesh = null; this._carryRes = null; this._shieldKind = undefined;
    this.updateTool();
    this.refreshCarryMesh();
  }
  toolId() {
    const st = this.game.state;
    if (this.job === 'guard') {
      if (this.workplace?.type === 'watchtower') return st.researchDone.has('gunpowder') ? 'musket' : 'bow';
      return st.researchDone.has('smithing') ? 'sword_iron' : 'sword_wood';
    }
    if (this.job === 'mage') return st.researchDone.has('frost_magic') ? 'staff_frost' : 'staff_fire';
    if (this.job === 'miner' && st.researchDone.has('smithing')) return 'pickaxe_iron';
    return (JOBS[this.job] || JOBS.idle).tool;
  }
  updateTool() {
    try { this.model.setHeld(this.carryTotal > 0 ? null : (this.heldOverride || this.toolId())); } catch (e) { /* sprite missing */ }
    // melee guards carry a shield in the left hand (iron after smithing)
    const shield = this.job === 'guard' && this.workplace?.type !== 'watchtower' && !this.heldOverride;
    const kind = shield ? (this.game.state.researchDone.has('smithing') ? 'iron' : 'wood') : null;
    if (kind !== this._shieldKind) {
      this._shieldKind = kind;
      try { this.model.setOffhand(kind ? makeShieldMesh(kind, this.model.px) : null); } catch (e) { /* ignore */ }
    }
  }

  setJob(job) {
    if (job === this.job) return;
    this.job = job;
    const wasGuard = this.maxHp;
    this.maxHp = job === 'guard' ? 130 : 40;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - wasGuard));
    this.interrupt();
    this.buildModel();
  }

  // ---------------------------------------------------------------- carrying goods
  get carryTotal() { let n = 0; for (const k in this.carry) n += this.carry[k]; return n; }
  addCarry(res, n) { if (n <= 0) return; this.carry[res] = (this.carry[res] || 0) + n; this.refreshCarryMesh(); }
  carryText() {
    const ks = Object.keys(this.carry).filter(k => this.carry[k] >= 1);
    if (!ks.length) return '';
    ks.sort((a, b) => this.carry[b] - this.carry[a]);
    return Math.floor(this.carry[ks[0]]) + ' ' + RES_GEN[ks[0]];
  }
  depositCarry() {
    const out = {};
    for (const k in this.carry) { const n = Math.floor(this.carry[k]); if (n > 0) out[k] = n; }
    this.game.state.addAll(out);
    this.carry = {};
    this.refreshCarryMesh();
    return out;
  }
  refreshCarryMesh() {
    let res = null, best = 0;
    for (const k in this.carry) if (this.carry[k] > best) { best = this.carry[k]; res = k; }
    if (res === this._carryRes) return;
    if (this._carryMesh) { this._carryMesh.parent?.remove(this._carryMesh); this._carryMesh = null; }
    this._carryRes = res;
    if (res) {
      const m = makeBlockMesh(this.game, CARRY_BLOCK[res] || B.PLANKS, 0.42);
      if (m) { m.position.set(0, 0.36, 0.32); this.model.body.add(m); this._carryMesh = m; }
      this.model.setLoop('carry');
    } else if (this.model.loop === 'carry') this.model.setLoop(null);
    this.updateTool();
  }

  // ---------------------------------------------------------------- brain management
  get zombiesActive() { return (this.game.waves?.activeCount || 0) > 0; }
  decideMode() {
    if (this.hidden) return this.mode || 'hide';
    if (this.job === 'guard' || this.job === 'mage') return 'work';
    const t = this.game.time;
    const z = this.village.nearestZombie(this.position, 9);
    if (z) this.fleeUntil = t + 5;
    if (t < this.fleeUntil) return 'flee';
    if (this.game.state.isNight || this.zombiesActive) return 'hide';
    return 'work';
  }
  interrupt() {
    for (const f of this._releases) { try { f(); } catch (e) { /* ignore */ } }
    this._releases.length = 0;
    this.brain = null;
    this.mode = null;
    this.stopMove();
    if (this.model) { this.model.setLoop(this.carryTotal > 0 ? 'carry' : null); this.model.play('none'); }
    this.onPost = false;
  }
  /** register a cleanup callback run when the current brain is interrupted */
  onRelease(f) { this._releases.push(f); return f; }
  release(f) { const i = this._releases.indexOf(f); if (i >= 0) this._releases.splice(i, 1); try { f(); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (this.dead) { this.model.update(dt, 0); this.syncObject(dt); return; }
    this.tickStatus(dt);
    this.needs(dt);
    const mode = this.decideMode();
    if (mode !== this.mode || !this.brain) {
      if (this.mode !== null && mode !== this.mode) this.interrupt();
      this.mode = mode;
      this.brain = brainFor(this, mode);
      this.brain.next();   // prime until first yield
    } else {
      let r;
      try { r = this.brain.next(dt); } catch (e) { console.error('villager brain failed', this.job, e); r = { done: true }; this.interrupt(); }
      if (r.done) { this.brain = null; }
    }
    if (!this.hidden) {
      this.moveUpdate(dt);
      if (!this._climbing) this.physics(dt);
    }
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedNow = hs;
    this.model.update(dt, this.hidden ? 0 : hs);
    this.syncObject(dt);
  }

  needs(dt) {
    const st = this.game.state;
    this.hunger = Math.max(0, this.hunger - dt * 0.3);
    this.eatTimer -= dt;
    if (this.eatTimer <= 0) {
      this.eatTimer = 110 + Math.random() * 20;
      if ((st.resources.food || 0) >= 1) { st.add('food', -1); this.hunger = 100; this.mood = Math.min(100, this.mood + 4); }
      else { this.mood = Math.max(0, this.mood - 12); this.village.reportHunger(); }
    }
    const targetMood = 45 + (this.hunger > 40 ? 25 : -25) + (this.home && this.home.type === 'house' ? 10 : 0) + (this.zombiesActive ? -10 : 0);
    this.mood += (targetMood - this.mood) * Math.min(1, dt * 0.02);
    // regeneration (faster with alchemy)
    this._regen += dt;
    const every = st.researchDone.has('alchemy') ? 2.5 : 8;
    const resting = this.task === 'Отступает к ратуше лечиться';
    if (this._regen > (resting ? 0.5 : every)) { this._regen = 0; if (this.hp < this.maxHp && this.hunger > 20) this.heal(resting ? 2 : 1); }
  }
  get workSpeed() { return (this.hunger < 25 ? 0.6 : 1) * (this.mood > 80 ? 1.1 : 1) * (this.job === 'builder' ? (this.village?.builderSpeedBonus || 1) : 1); }

  // ---------------------------------------------------------------- movement
  stopMove() { this._steer = null; }
  steerTo(x, z, speed, wantUp = false) { this._steer = { x, z, speed, wantUp }; }
  moveUpdate(dt) {
    const v = this.velocity;
    const sm = this.speedMul;
    if (this._steer && sm > 0) {
      const s = this._steer;
      const dx = s.x - this.position.x, dz = s.z - this.position.z;
      const d = Math.hypot(dx, dz);
      const sp = s.speed * sm * (this.inWater ? 0.6 : 1);
      const k = d > 0.05 ? Math.min(1, d * 3) : 0;
      const tx = d > 0.001 ? dx / d * sp * k : 0, tz = d > 0.001 ? dz / d * sp * k : 0;
      const a = Math.min(1, dt * 10);
      v.x += (tx - v.x) * a; v.z += (tz - v.z) * a;
      if (d > 0.1) this.turnTo(Math.atan2(dx, dz), dt);
      if (this.onGround && this.hitWall && (s.wantUp || this._stuckJump)) v.y = 8;
      if (this.inWater) v.y = Math.max(v.y, 2.2);
    } else {
      const a = Math.min(1, dt * 12);
      v.x -= v.x * a; v.z -= v.z * a;
    }
  }
  turnTo(yaw, dt, rate = 10) {
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }
  face(p) { this._faceYaw = Math.atan2(p.x - this.position.x, p.z - this.position.z); this.yaw = this._faceYaw; }
  near(t, range, dyMax = 2.2) {
    const dx = t.x - this.position.x, dz = t.z - this.position.z;
    return dx * dx + dz * dz <= (range + 0.15) * (range + 0.15) && Math.abs(t.y - this.position.y) <= dyMax;
  }
  distTo(t) { return Math.hypot(t.x - this.position.x, t.z - this.position.z); }

  /** Sub-generator: walk to target (feet position) until within range. Returns true on arrival. */
  *walkTo(target, range = 1.3, o = {}) {
    const tgt = { x: target.x, y: target.y ?? this.position.y, z: target.z };
    const speed = o.speed || this.walkSpeed * (this.hunger < 25 ? 0.75 : 1);
    const t0 = this.game.time;
    const maxTime = o.maxTime ?? 40;
    let tries = 0;
    while (true) {
      if (this.near(tgt, range, o.dyMax)) { this.stopMove(); return true; }
      if (this.game.time - t0 > maxTime || tries > 4) {
        this.stopMove();
        if (o.teleport !== false && this.teleportNear(tgt, range)) return true;
        return false;
      }
      tries++;
      const req = this.village.requestPath(this, tgt, Math.max(0, Math.floor(range)));
      while (!req.done) yield;
      const path = req.path;
      if (!path || path.length < 2) {
        // no path (or already on the goal cell): try walking straight for a moment
        let tt = 0;
        const cx = this.position.x, cz = this.position.z;
        while (tt < 2 && !this.near(tgt, range, o.dyMax)) { this.steerTo(tgt.x, tgt.z, speed, true); this._stuckJump = tt > 0.8; tt += yield; }
        this._stuckJump = false;
        if (Math.hypot(this.position.x - cx, this.position.z - cz) < 0.5) tries++;
        continue;
      }
      let i = 1, chkX = this.position.x, chkZ = this.position.z, chkT = this.game.time;
      while (i < path.length) {
        const wp = path[i];
        const wx = wp.x + 0.5, wz = wp.z + 0.5;
        const dx = wx - this.position.x, dz = wz - this.position.z;
        const dh = Math.hypot(dx, dz);
        if (dh < (i === path.length - 1 ? 0.3 : 0.45) && Math.abs(wp.y - this.position.y) < 1.3) { i++; continue; }
        if (this.near(tgt, range, o.dyMax)) break;
        // cut corners: if the waypoint after next is on the same level and adjacent, aim a bit ahead
        this.steerTo(wx, wz, speed, wp.y > this.position.y + 0.4);
        const dt = yield;
        void dt;
        if (Math.hypot(this.position.x - chkX, this.position.z - chkZ) > 0.6 || Math.abs(this.position.y - wp.y) < 0.1 && dh < 0.6) {
          chkX = this.position.x; chkZ = this.position.z; chkT = this.game.time; this._stuckJump = false;
        } else {
          const st = this.game.time - chkT;
          this._stuckJump = st > 1.0;
          if (st > 3.5) break;     // re-path
        }
      }
      this._stuckJump = false;
    }
  }
  /** Sub-generator: wait (seconds). */
  *wait(sec) { let t = 0; while (t < sec) t += yield; }
  /** Sub-generator: perform a looping work animation for `sec` seconds, calling onBeat every `beat` seconds. */
  *work(anim, sec, beat = 0.5, onBeat = null) {
    this.model.setLoop(anim);
    let t = 0, b = 0;
    while (t < sec) {
      const dt = yield;
      t += dt; b += dt;
      if (this._faceYaw !== undefined) this.turnTo(this._faceYaw, dt);
      if (onBeat && b >= beat) { b -= beat; onBeat(); }
    }
    this.model.setLoop(this.carryTotal > 0 ? 'carry' : null);
  }

  teleportNear(t, range = 1) {
    const w = this.game.world;
    const fx = Math.floor(t.x), fz = Math.floor(t.z);
    for (let r = 0; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = fx + dx, z = fz + dz;
      const y0 = Math.floor(t.y);
      for (const y of [y0, y0 + 1, y0 - 1, y0 + 2]) {
        if (w.isWalkable(x, y, z)) {
          this.puff();
          this.position.set(x + 0.5, y, z + 0.5);
          this.velocity.set(0, 0, 0);
          this.puff();
          return true;
        }
      }
    }
    return false;
  }
  puff() { this.game.particles?.emit({ pos: this.center, box: 0.4, count: 10, colors: [0xdddddd, 0xbbbbbb], speed: 1.2, gravity: -1, life: 0.6, size: 0.25, alpha: 0.7 }); }

  descend() {
    if (!this.onPost) return;
    this.onPost = false;
    const b = this._postBuilding;
    this._postBuilding = null;
    this._climbing = false;
    if (b) { this.puff(); const d = b.door; this.position.set(d.x, d.y, d.z); this.velocity.set(0, 0, 0); }
  }

  // ---------------------------------------------------------------- hiding
  hide(home) {
    this.hidden = true;
    this.hideHome = home;
    this.object3d.visible = false;
    const p = (home.points.inside && home.points.inside[0]) || home.door;
    this.position.set(p.x, p.y, p.z);
    this.velocity.set(0, 0, 0);
    this.stopMove();
  }
  unhide() {
    const home = this.hideHome;
    this.hidden = false;
    this.hideHome = null;
    this.object3d.visible = true;
    if (home) { const d = home.door; this.position.set(d.x, d.y, d.z); if (!this.game.world.isWalkable(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))) this.teleportNear(d); }
  }

  // ---------------------------------------------------------------- combat / damage
  damage(amount, source, opts = {}) {
    if (this.hidden || this._climbing) return false;
    if (this.job === 'guard') amount *= 1 - Math.min(0.5, (this.village.armory.level || 0) * 0.08);
    // shield block: hits from the front while the shield is raised lose most of their force
    if (this.blocking && source && source.position && this._shieldKind) {
      const dx = source.position.x - this.position.x, dz = source.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / len;
      if (facing > 0.25) {
        const absorb = this._shieldKind === 'iron' ? 0.82 : 0.72;
        amount *= 1 - absorb;
        if (opts.knockback && opts.knockback.multiplyScalar) opts = { ...opts, knockback: opts.knockback.clone().multiplyScalar(0.3) };
        else if (typeof opts.knockback === 'number') opts = { ...opts, knockback: opts.knockback * 0.3 };
        this.blockedHits = (this.blockedHits || 0) + 1;
        const g = this.game, p = this.eye;
        g.audio?.play(this._shieldKind === 'iron' ? 'pick_hit' : 'chop', { pos: p, volume: 0.7, pitch: 1.2 + Math.random() * 0.2 });
        g.particles?.emit({ pos: { x: p.x + Math.sin(this.yaw) * 0.45, y: p.y - 0.4, z: p.z + Math.cos(this.yaw) * 0.45 }, count: 8, colors: [0xfff0b0, 0xffc860, 0xffffff], additive: true, speed: 3, gravity: 8, life: 0.35, size: 0.07 });
        if (amount < 0.5) return false;
      }
    }
    return super.damage(amount, source, opts);
  }
  get blocking() { return !!(this.model && this.model.blocking); }
  onHurt(amount, source) {
    this.game.audio?.play('villager_hurt', { pos: this.position, volume: 0.7, pitch: this.female ? 1.25 : 1 });
    if (this.job !== 'guard' && this.job !== 'mage') this.fleeUntil = this.game.time + 6;
    if (source && source.faction === 'undead') this.lastAttacker = source;
  }
  onDeath(source) {
    this.task = 'Погиб';
    this.interrupt();
    this.object3d.visible = true;
    if (this._carryMesh) { this._carryMesh.parent?.remove(this._carryMesh); this._carryMesh = null; }
    this.village.onVillagerDied(this, source);
  }

  serialize() {
    return {
      name: this.name, female: this.female, seed: this.seed, job: this.job,
      workplace: this.workplace ? this.workplace.id : null, home: this.home ? this.home.id : null,
      hp: this.hp, x: +this.position.x.toFixed(2), y: +this.position.y.toFixed(2), z: +this.position.z.toFixed(2),
      hunger: Math.round(this.hunger), mood: Math.round(this.mood), carry: { ...this.carry },
    };
  }
}
