import * as THREE from 'three';
import { moveEntity } from '../world/physics.js';

let NEXT_ID = 1;

export class Entity {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.kind = opts.kind || 'entity';
    this.faction = opts.faction || 'neutral';
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.radius = opts.radius ?? 0.3;
    this.height = opts.height ?? 1.8;
    this.maxHp = opts.maxHp ?? 20;
    this.hp = this.maxHp;
    this.dead = false;
    this.removeAt = 0;
    this.onGround = false;
    this.inWater = false;
    this.autoStep = opts.autoStep ?? true;
    this.slowTimer = 0;        // frost slow
    this.burnTimer = 0;        // fire damage over time
    this.stunTimer = 0;
    this.invuln = 0;
    this.object3d = opts.object3d || new THREE.Group();
    this.model = null;         // HumanoidModel if any
    this._lightT = Math.random() * 0.3;
  }
  get center() { return this._c || (this._c = new THREE.Vector3()), this._c.set(this.position.x, this.position.y + this.height * 0.5, this.position.z); }
  get eye() { return this._e || (this._e = new THREE.Vector3()), this._e.set(this.position.x, this.position.y + this.height * 0.9, this.position.z); }

  /** Standard physics step; subclasses call this from update(). */
  physics(dt) { moveEntity(this.game.world, this, dt); }

  update(dt) {
    this.tickStatus(dt);
    this.physics(dt);
    this.syncObject(dt);
  }
  tickStatus(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this._burnAcc = (this._burnAcc || 0) + dt;
      if (this._burnAcc > 0.5) { this._burnAcc = 0; this.damage(2, null, { kind: 'fire', silent: true }); }
      if (Math.random() < dt * 20) this.game.particles?.emit({ pos: this.center, box: 0.3, count: 1, colors: [0xffa030, 0xff5020, 0xffe070], additive: true, speed: 0.5, dir: { x: 0, y: 2, z: 0 }, gravity: -1, life: 0.5, size: 0.2 });
      if (this.inWater) this.burnTimer = 0;
    }
  }
  get speedMul() { return (this.slowTimer > 0 ? 0.5 : 1) * (this.stunTimer > 0 ? 0 : 1); }

  syncObject(dt) {
    this.object3d.position.copy(this.position);
    this.object3d.rotation.y = this.yaw;
    if (this.model) {
      this._lightT -= dt;
      if (this._lightT <= 0) {
        this._lightT = 0.25;
        const w = this.game.world;
        const l = w.getLight(Math.floor(this.position.x), Math.floor(this.position.y + 1), Math.floor(this.position.z));
        this.model.setLight((l >> 4) / 15, (l & 15) / 15, this.game.state.nightFactor);
      }
    }
  }

  /** Returns true if this hit killed the entity. opts: {kind, knockback: Vector3, silent} */
  damage(amount, source, opts = {}) {
    if (this.dead || amount <= 0) return false;
    this.hp -= amount;
    if (opts.knockback) { this.velocity.add(opts.knockback); if (this.onGround) this.velocity.y = Math.max(this.velocity.y, 4); }
    if (this.model) { this.model.flash(opts.kind === 'frost' ? 0x66ccff : 0xff3030); }
    this.game.bus.emit('damage:number', { pos: this.eye.clone(), amount: Math.round(amount), kind: opts.kind || 'phys', target: this });
    this.lastAttacker = source;
    if (this.hp <= 0) { this.hp = 0; this.die(source); return true; }
    this.onHurt?.(amount, source, opts);
    return false;
  }
  heal(n) { if (this.dead) return; this.hp = Math.min(this.maxHp, this.hp + n); }
  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.removeAt = this.game.time + 2.5;
    if (this.model) this.model.play('die');
    this.onDeath?.(source);
  }
  dispose() { this.model?.dispose(); }
}
