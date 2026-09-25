// The hero: first/third-person movement, hotbar, mining/placing, weapons & spells, death/respawn.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { HumanoidModel } from '../entities/HumanoidModel.js';
import { ITEMS, DEFAULT_HOTBAR, RESOURCE_LABELS } from '../core/items.js';
import { B, BLOCKS, PALETTE } from '../core/blocks.js';
import { playerSkin } from '../art/skins.js';
import { Viewmodel } from './Viewmodel.js';
import { BlockCursor } from './BlockCursor.js';

const WALK = 4.4, SPRINT_MUL = 1.45, CROUCH_MUL = 0.33, SWIM_MUL = 0.6;
const JUMP_V = 8.7, COYOTE = 0.12, JUMP_BUFFER = 0.16;
const REACH = 6;
const STAMINA_MAX = 100, SPRINT_COST = 14, STAMINA_REGEN = 22;
const RESPAWN_TIME = 5;

export const RESEARCH_NAMES = {
  masonry: 'Каменная кладка', agriculture: 'Земледелие', mining: 'Горное дело', smithing: 'Кузнечное дело',
  archery: 'Стрельба из лука', mechanics: 'Механика', fortification: 'Фортификация', gunpowder: 'Порох',
  ballistics: 'Баллистика', alchemy: 'Алхимия', arcana: 'Тайные искусства', frost_magic: 'Магия льда',
  storm_magic: 'Магия бури', restoration: 'Магия исцеления', crystal_forging: 'Кристальная ковка', meteor: 'Звездопад',
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();

export class Player extends Entity {
  constructor(game) {
    super(game, { kind: 'player', faction: 'village', maxHp: 100, radius: 0.3, height: 1.8, autoStep: false });
    this.name = 'Герой';
    this.mana = 100; this.maxMana = 100; this.manaRegen = 4;
    this.stamina = STAMINA_MAX; this.maxStamina = STAMINA_MAX;
    this.hotbar = [...DEFAULT_HOTBAR];
    this.selected = 0;
    this.buildBlock = B.PLANKS;
    this.cooldowns = {};
    this.firstPerson = true;
    this.sprinting = false; this.crouching = false;
    this.charge = 0;              // bow draw 0..1
    this.recoil = 0;              // consumed by CameraRig (pitch kick)
    this.bobPhase = 0; this.bobAmount = 0; this.landDip = 0;
    this.deadT = 0;
    this.target = { block: null, entity: null, place: null };
    this._coyote = 0; this._jumpBuf = 0; this._fallStart = null; this._stepDist = 0; this._staminaDelay = 0;
    this._mineKey = ''; this._mineSoundT = 0; this._mineFxT = 0; this.mining = false;
    this._placeT = 0; this._wheelAcc = 0; this._hintT = 0; this._lastFrame = -1;
    this._prevPrimary = false; this._prevSecondary = false;
    this._wasInWater = false;
    this._lightCache = { s: 1, b: 0 }; this._lightT = 0;
    this.lookPitch = 0;
  }

  init() {
    const g = this.game;
    // third-person / command-mode body
    try {
      this.skin = playerSkin();
      this.model = new HumanoidModel({ skin: this.skin, height: 1.8 });
      this.object3d.add(this.model.group);
    } catch (e) { console.warn('[player] model unavailable', e); this.model = null; }
    // first-person viewmodel (camera must be in the scene for its children to render)
    this.viewmodel = new Viewmodel(g, this);
    if (!g.camera.parent) g.scene.add(g.camera);
    let armGeo = null, skinTex = null;
    if (this.model) {
      const armMesh = this.model.rarm.children.find(c => c.isMesh);
      armGeo = armMesh?.geometry || null;
      skinTex = this.model.material.map;
    }
    this.viewmodel.attach(g.camera, armGeo, skinTex);
    this.viewmodel.setVisible(false);
    this.cursor = new BlockCursor(g);
    g.bus.on('world:ready', () => { this.cursor?.hide(); });
    g.bus.on('mode:changed', ({ mode }) => {
      this.charge = 0; this.mining = false;
      this.model?.setLoop(null);
      if (mode === 'command') this.cursor?.hide();
    });
    g.bus.on('research:done', () => this._emitHotbar());
    g.bus.on('item:unlocked', () => this._emitHotbar());
  }

  // ------------------------------------------------------------------ API
  /** Seconds until respawn while dead (for the death screen). */
  get respawnIn() { return this.dead ? Math.max(0, RESPAWN_TIME - this.deadT) : 0; }
  get item() { return ITEMS[this.hotbar[this.selected]] || null; }
  get itemId() { return this.hotbar[this.selected] || null; }

  selectSlot(i) {
    const n = this.hotbar.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === this.selected) return;
    this.selected = i;
    this.charge = 0; this.mining = false;
    const id = this.hotbar[i];
    this.game.bus.emit('hotbar:select', { index: i, itemId: id });
    this.game.audio?.play('ui_click', { volume: 0.35, pitch: 1.3 });
    if (id && !this.isUnlocked(id)) this._lockedToast(id, true);
  }
  _emitHotbar() { this.game.bus.emit('hotbar:select', { index: this.selected, itemId: this.itemId }); }

  isUnlocked(itemId) {
    const it = ITEMS[itemId];
    if (!it) return false;
    if (!it.research) return true;
    const st = this.game.state;
    if (st.unlockedItems?.has(itemId) || st.researchDone?.has(it.research)) return true;
    try { if (this.game.research?.isDone?.(it.research)) return true; } catch (e) { /* ignore */ }
    return false;
  }
  researchName(id) {
    const r = this.game.research;
    try {
      return r?.getName?.(id) || r?.techs?.[id]?.name || r?.tree?.[id]?.name || r?.TECHS?.[id]?.name || RESEARCH_NAMES[id] || id;
    } catch (e) { return RESEARCH_NAMES[id] || id; }
  }
  _lockedToast(itemId, force = false) {
    if (!force && this.game.time < this._hintT) return;
    this._hintT = this.game.time + 1.5;
    const it = ITEMS[itemId];
    this.game.bus.emit('toast', { text: `Требуется исследование: ${this.researchName(it.research)}`, kind: 'bad' });
  }
  _hint(text, kind = 'info') {
    if (this.game.time < this._hintT) return;
    this._hintT = this.game.time + 2;
    this.game.bus.emit('toast', { text, kind });
  }

  setBuildBlock(id) {
    if (!BLOCKS[id]) return;
    this.buildBlock = id;
    this.game.bus.emit('build:block', { id });
  }
  cycleBuildBlock(dir = 1) {
    const i = PALETTE.indexOf(this.buildBlock);
    const n = PALETTE.length;
    this.setBuildBlock(PALETTE[(((i < 0 ? 0 : i) + dir) % n + n) % n]);
    const b = BLOCKS[this.buildBlock];
    this._hintT = 0;
    this._hint(`Блок: ${b.label}${costText(b.cost)}`);
  }
  toggleView() { this.game.cameraRig?.toggleView?.(); }

  cooldownFrac() { const id = this.itemId; return id && this.game.combat?.cooldownFrac ? this.game.combat.cooldownFrac(this, id) : 0; }

  /** Aim ray from the eye towards the crosshair (handles third-person parallax). */
  getAim() {
    const g = this.game, rig = g.cameraRig, cam = g.camera;
    const fwd = rig?.forward || _dir.set(0, 0, 1);
    const eye = new THREE.Vector3(this.position.x, (rig?.eyeY ?? this.position.y + 1.62), this.position.z);
    if (this.firstPerson) return { origin: cam.position.clone(), dir: fwd.clone() };
    const hb = g.world.raycast(cam.position, fwd, 120, { solidOnly: true });
    const he = g.entities.raycast(cam.position, fwd, hb ? hb.dist : 120, e => e !== this && !e.dead && e.kind !== 'projectile');
    const pt = he ? cam.position.clone().addScaledVector(fwd, he.dist) : hb ? hb.point.clone() : cam.position.clone().addScaledVector(fwd, 120);
    const dir = pt.sub(eye);
    if (dir.dot(fwd) < 0.2 || dir.lengthSq() < 0.5) return { origin: eye, dir: fwd.clone() };
    return { origin: eye, dir: dir.normalize() };
  }
  /** Where visual projectiles leave from (viewmodel tip in FP, right hand in TP). */
  muzzle(aim) {
    if (this.firstPerson && this.viewmodel?.root.visible) {
      const p = this.viewmodel.tipWorld(new THREE.Vector3());
      // never spawn behind a wall the eye can see past
      const d = p.clone().sub(aim.origin); const len = d.length();
      if (len > 0.01 && this.game.world.raycast(aim.origin, d.divideScalar(len), len, { solidOnly: true })) return aim.origin.clone().addScaledVector(aim.dir, 0.2);
      return p;
    }
    if (this.model) { const p = new THREE.Vector3(); this.model.hand.getWorldPosition(p); return p.addScaledVector(aim.dir, 0.4); }
    return aim.origin.clone().addScaledVector(aim.dir, 0.5);
  }

  // ------------------------------------------------------------------ lifecycle
  onNewGame() {
    this.hotbar = [...DEFAULT_HOTBAR];
    this.selected = 0;
    this.buildBlock = B.PLANKS;
    this.cooldowns = {}; this._cdUntil = {};
    this.revive();
    const sp = this.findSpawn();
    this.position.copy(sp);
    this.velocity.set(0, 0, 0);
    // face the village center
    const c = this.game.world.size / 2;
    const th = this.game.village?.townHall;
    const tx = th ? (th.center?.x ?? th.x) : c, tz = th ? (th.center?.z ?? th.z) : c;
    const yaw = Math.atan2(tx - sp.x, tz - sp.z);
    if (Number.isFinite(yaw)) { this.yaw = yaw; if (this.game.cameraRig) this.game.cameraRig.yaw = yaw; }
    if (!this.game.entities.list.includes(this)) this.game.entities.add(this);
    this._emitHotbar();
  }

  revive() {
    this.dead = false; this.removeAt = 0; this.deadT = 0;
    this.hp = this.maxHp; this.mana = this.maxMana; this.stamina = STAMINA_MAX;
    this.burnTimer = 0; this.slowTimer = 0; this.stunTimer = 0;
    this.charge = 0; this.recoil = 0; this.mining = false; this._fallStart = null;
    this.invuln = 2.5;
    if (this.model) { this.model.play('none'); this.model.root.rotation.x = 0; this.model.root.position.y = 0; }
  }

  /** Walkable spot next to the town hall (or the map center). */
  findSpawn() {
    const g = this.game, w = g.world, v = g.village;
    const th = v?.townHall;
    let cx = w.size / 2, cz = w.size / 2;
    if (th) {
      cx = th.center?.x ?? th.x ?? cx; cz = th.center?.z ?? th.z ?? cz;
      const sz = th.def?.size || th.typeDef?.size || th.size;
      if (Array.isArray(sz) && th.center === undefined) { cx += sz[0] / 2; cz += sz[1] / 2; }
      // prefer the doorstep: in front of the hall (+z side for rot 0)
    }
    const bAt = (x, y, z) => { try { return v?.buildingAt?.(x, y, z) || null; } catch (e) { return null; } };
    for (let r = th ? 2 : 0; r < 40; r++) {
      const steps = Math.max(1, Math.round(r * 6));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + r * 0.7;
        const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
        if (x < 2 || z < 2 || x >= w.size - 2 || z >= w.size - 2) continue;
        const y = w.surfaceY(x, z) + 1;
        const below = w.getBlock(x, y - 1, z);
        if (below === B.WATER || BLOCKS[below]?.render === 'cutout') continue;
        if (bAt(x, y - 1, z) || bAt(x, y, z) || bAt(x, y + 1, z)) continue;
        if (!w.isWalkable(x, y, z)) continue;
        if (w.getBlock(x, y, z) === B.WATER) continue;
        return new THREE.Vector3(x + 0.5, y, z + 0.5);
      }
    }
    return new THREE.Vector3(cx, w.surfaceY(cx, cz) + 1, cz);
  }

  respawn() {
    this.revive();
    this.position.copy(this.findSpawn());
    this.velocity.set(0, 0, 0);
    if (this.game.cameraRig) this.game.cameraRig.eyeY = null;
    this.game.bus.emit('player:respawn', { amount: 0, source: null });
    this.game.bus.emit('toast', { text: 'Вы очнулись у ратуши', kind: 'info' });
  }

  damage(amount, source, opts = {}) {
    if (this.dead || amount <= 0) return false;
    if (this.invuln > 0 && opts.kind !== 'fall' && opts.kind !== 'void') return false;
    const died = super.damage(amount, source, opts);
    this.game.bus.emit('player:damaged', { amount, source, kind: opts.kind });
    if (!died) this.game.audio?.play('player_hurt', { volume: 0.8, pitch: 0.95 + Math.random() * 0.1 });
    if (this.model && !died) this.model.play('hurt');
    this._knockT = opts.knockback ? 0.25 : 0;
    return died;
  }

  onDeath(source) {
    this.deadT = 0;
    this.charge = 0; this.mining = false;
    this.game.state.stats.deaths = (this.game.state.stats.deaths || 0) + 1;
    this.game.audio?.play('death', { volume: 1 });
    this.game.bus.emit('player:died', { amount: 0, source });
    this.cursor?.hide();
  }

  serialize() {
    return {
      pos: [this.position.x, this.position.y, this.position.z], yaw: this.game.cameraRig?.yaw ?? this.yaw, pitch: this.game.cameraRig?.pitch ?? 0,
      hp: this.hp, mana: this.mana, stamina: this.stamina, hotbar: [...this.hotbar], selected: this.selected,
      buildBlock: this.buildBlock, view: this.game.cameraRig?.view || 'fp',
    };
  }
  deserialize(o = {}) {
    this.revive();
    this.invuln = 1;
    if (Array.isArray(o.pos)) this.position.set(o.pos[0], o.pos[1], o.pos[2]);
    this.velocity.set(0, 0, 0);
    if (Array.isArray(o.hotbar) && o.hotbar.length) this.hotbar = o.hotbar.filter(id => ITEMS[id]);
    if (!this.hotbar.length) this.hotbar = [...DEFAULT_HOTBAR];
    this.selected = Math.min(this.hotbar.length - 1, Math.max(0, o.selected | 0));
    if (typeof o.hp === 'number' && o.hp > 0) this.hp = Math.min(this.maxHp, o.hp);
    if (typeof o.mana === 'number') this.mana = Math.min(this.maxMana, o.mana);
    if (typeof o.stamina === 'number') this.stamina = o.stamina;
    if (BLOCKS[o.buildBlock]) this.buildBlock = o.buildBlock;
    const rig = this.game.cameraRig;
    if (rig) { rig.yaw = o.yaw ?? 0; rig.pitch = o.pitch ?? 0; rig.view = o.view === 'tp' ? 'tp' : 'fp'; rig.eyeY = null; rig.trans = null; }
    this.yaw = o.yaw ?? 0;
    // make sure we're not stuck inside blocks after load
    const w = this.game.world;
    if (w && (w.isSolid(this.position.x, this.position.y + 0.1, this.position.z) || w.isSolid(this.position.x, this.position.y + 1.5, this.position.z))) this.position.copy(this.findSpawn());
    if (!this.game.entities.list.includes(this)) this.game.entities.add(this);
    this._emitHotbar();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const g = this.game;
    // called both by the system loop and EntityManager — run once per frame
    if (this._lastFrame === g.time) return;
    this._lastFrame = g.time;
    if (!g.world || !g.running) return;
    const input = g.input, cmd = g.mode === 'command';
    this.tickStatus(dt);
    this.landDip = Math.max(0, this.landDip - dt * 1.2);

    if (this.dead) {
      this.deadT += dt;
      this.velocity.x *= 0.9; this.velocity.z *= 0.9;
      this.physics(dt);
      if (this.deadT >= RESPAWN_TIME) this.respawn();
      this._visuals(dt, false);
      return;
    }

    if (!cmd) this._handleKeys(input);
    this._move(dt, input, cmd);
    this._regen(dt);
    if (!cmd) this._interact(dt, input);
    else { this.mining = false; this.charge = 0; this.target.block = this.target.entity = this.target.place = null; }
    this._visuals(dt, !cmd);
  }

  _handleKeys(input) {
    for (let i = 0; i < 9; i++) if (input.consumePressed('Digit' + (i + 1)) || input.consumePressed('Numpad' + (i + 1))) this.selectSlot(i);
    if (input.consumePressed('Digit0')) this.selectSlot(9);
    if (input.wheel) {
      this._wheelAcc += input.wheel;
      while (this._wheelAcc >= 50) { this._wheelAcc -= 50; this.selectSlot(this.selected + 1); }
      while (this._wheelAcc <= -50) { this._wheelAcc += 50; this.selectSlot(this.selected - 1); }
    } else this._wheelAcc *= 0.8;
    if (input.consumePressed('KeyV') || input.consumePressed('F5')) this.toggleView();
    if (input.consumePressed('KeyR')) this.cycleBuildBlock(input.isDown('ShiftLeft') ? -1 : 1);
    if (input.consumePressed('KeyF')) this.cycleBuildBlock(-1);
  }

  _move(dt, input, cmd) {
    const g = this.game, a = input.actions;
    const yaw = g.cameraRig ? g.cameraRig.yaw : this.yaw;
    let mx = cmd ? 0 : input.move.x, my = cmd ? 0 : input.move.y;
    if (this.stunTimer > 0) { mx = my = 0; }
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    // crouch / sprint
    this.crouching = !cmd && a.crouch && !this.inWater;
    const wantSprint = !cmd && a.sprint && my > 0.3 && !this.crouching && this.charge === 0;
    if (wantSprint && (this.sprinting ? this.stamina > 0 : this.stamina > 12)) this.sprinting = true;
    else if (!wantSprint || this.stamina <= 0) this.sprinting = false;
    if (this.sprinting && wl > 0.1) { this.stamina = Math.max(0, this.stamina - SPRINT_COST * dt); this._staminaDelay = 0.9; }
    let speed = WALK * (this.sprinting ? SPRINT_MUL : 1) * (this.crouching ? CROUCH_MUL : 1) * (this.inWater ? SWIM_MUL : 1) * this.speedMul;
    if (this.charge > 0) speed *= 0.5;
    if (this.mining) speed *= 0.85;
    const tx = wx * speed, tz = wz * speed;
    const v = this.velocity;
    this._knockT = Math.max(0, (this._knockT || 0) - dt);
    const k = this._knockT > 0 ? 2 : this.onGround ? (wl > 0.05 ? 16 : 20) : this.inWater ? 5 : (wl > 0.05 ? 5 : 1.2);
    const f = 1 - Math.exp(-k * dt);
    v.x += (tx - v.x) * f; v.z += (tz - v.z) * f;

    // crouch edge safety: don't walk off ledges while sneaking
    if (this.crouching && this.onGround) {
      const w = g.world, p = this.position;
      const ground = (x, z) => { const r = this.radius - 0.05; for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (w.isSolid(x + ox, p.y - 0.5, z + oz)) return true; return false; };
      if (!ground(p.x + v.x * dt * 2, p.z)) v.x = 0;
      if (!ground(p.x, p.z + v.z * dt * 2)) v.z = 0;
    }

    // jump: buffered press + coyote time; swimming
    if (this.onGround) this._coyote = COYOTE; else this._coyote -= dt;
    if (!cmd && input.consumePressed('Space')) this._jumpBuf = JUMP_BUFFER; else this._jumpBuf -= dt;
    if (!cmd && this.inWater) {
      if (a.jump) { v.y = Math.min(v.y + 26 * dt, 3.4); if (this.hitWall) v.y = Math.max(v.y, 5.5); }
      this._jumpBuf = 0;
    } else if (!cmd && (this._jumpBuf > 0 || (a.jump && this.onGround)) && this._coyote > 0 && this.stunTimer <= 0) {
      v.y = JUMP_V;
      this._jumpBuf = 0; this._coyote = 0;
      if (this.sprinting) { v.x += fx * 1.2; v.z += fz * 1.2; this.stamina = Math.max(0, this.stamina - 3); }
    }

    // physics (touch players get auto-step up single blocks)
    this.autoStep = !!g.isTouch && !this.crouching;
    const wasGround = this.onGround, wasWater = this.inWater;
    const vyBefore = v.y;
    this.physics(dt);
    // falling / landing
    if (!this.onGround && !this.inWater) { if (this._fallStart === null || this.position.y > this._fallStart) this._fallStart = this.position.y; }
    if (this.inWater) this._fallStart = null;
    if (this.onGround && !wasGround) {
      const fall = this._fallStart !== null ? this._fallStart - this.position.y : 0;
      this._fallStart = null;
      if (fall > 1.2) {
        this.landDip = Math.min(0.28, 0.05 + fall * 0.03);
        this._footstep(0.6, 0.8);
      }
      if (fall > 4) {
        const dmg = Math.round((fall - 3.5) * 6);
        this.damage(dmg, null, { kind: 'fall' });
        g.cameraRig?.shake?.(Math.min(0.5, fall * 0.04));
      }
    }
    void vyBefore;
    if (this.inWater && !wasWater && this.velocity.y < -3) {
      g.audio?.play('splash', { pos: this.position, volume: 0.7 });
      g.particles.emit({ pos: _v.copy(this.position).setY(Math.floor(this.position.y) + 0.9), count: 18, colors: [0xcfe8ff, 0x8ab8e8, 0xffffff], speed: 2.5, dir: { x: 0, y: 3, z: 0 }, gravity: 14, life: 0.7, size: 0.12 });
    }
    // footsteps & head bob
    const hs = Math.hypot(v.x, v.z);
    if (this.onGround && hs > 0.6) {
      this._stepDist += hs * dt;
      const stride = this.sprinting ? 2.5 : this.crouching ? 1.4 : 2.1;
      if (this._stepDist > stride) { this._stepDist = 0; this._footstep(this.crouching ? 0.15 : 0.32, 1); }
      this.bobPhase += dt * hs * 2.05;
      this.bobAmount += (Math.min(1.3, hs / WALK) - this.bobAmount) * Math.min(1, dt * 8);
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, dt * 6);
      if (this.inWater && hs > 0.5) this.bobPhase += dt * hs * 1.2;
    }
  }

  _footstep(volume, pitchMul) {
    const w = this.game.world, p = this.position;
    const id = w.getBlock(p.x, p.y - 0.2, p.z);
    const b = BLOCKS[id];
    if (!b || id === B.AIR) return;
    const snd = b.tool === 'pick' ? 'step_stone' : (b.tool === 'axe' || id === B.PLANKS) ? 'step_wood' : 'step_grass';
    this.game.audio?.play(snd, { pos: p, volume, pitch: (0.85 + Math.random() * 0.3) * pitchMul });
  }

  _regen(dt) {
    const alch = this.game.state.researchDone?.has('alchemy');
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * (alch ? 1.5 : 1) * dt);
    this._staminaDelay -= dt;
    if (this._staminaDelay <= 0) this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
    // slow natural healing when not hurt recently
    if (this.hp < this.maxHp && this.game.time - (this._lastHurt || -99) > 6) this.hp = Math.min(this.maxHp, this.hp + 0.6 * dt);
  }
  onHurt() { this._lastHurt = this.game.time; }

  // ------------------------------------------------------------------ interaction
  _interact(dt, input) {
    const g = this.game, w = g.world, combat = g.combat, a = input.actions;
    const id = this.itemId, it = this.item;
    const unlocked = id ? this.isUnlocked(id) : true;
    const pressP = a.primary && !this._prevPrimary, releaseP = !a.primary && this._prevPrimary;
    const pressS = a.secondary && !this._prevSecondary;
    this._prevPrimary = a.primary; this._prevSecondary = a.secondary;

    // targets
    const rig = g.cameraRig, cam = g.camera;
    const fwd = rig.forward;
    const eyeY = rig.eyeY ?? this.position.y + 1.62;
    const eye = _v2.set(this.position.x, eyeY, this.position.z);
    const t0 = Math.max(0, _v.subVectors(eye, cam.position).dot(fwd));
    const rayO = _v.copy(cam.position).addScaledVector(fwd, t0);
    const hit = w.raycast(rayO, fwd, REACH);
    const ent = g.entities.raycast(rayO, fwd, hit ? hit.dist : REACH, e => e !== this && !e.dead && e.kind !== 'projectile');
    this.target.block = hit && !ent ? hit : (hit && ent && hit.dist < ent.dist ? hit : null);
    this.target.entity = ent ? ent.entity : null;

    // placement preview for the build hammer
    let ghost = null;
    if (id === 'build_hammer' && this.target.block) ghost = this._placeCell(this.target.block);
    this.target.place = ghost;

    let mining = false;
    if (!it) { this.mining = false; this.cursor.update(dt, this.target.block, null); return; }
    if (!unlocked) {
      if (pressP || pressS) { this._lockedToast(id); g.audio?.play('mana_empty', { volume: 0.4, pitch: 0.7 }); }
      this.charge = 0;
    } else {
      const aim = () => this.getAim();
      switch (it.kind) {
        case 'melee': case 'tool': case 'build': {
          if (a.primary) {
            const reach = it.range || 3;
            const aimv = aim();
            const foes = combat.meleeTargets ? combat.meleeTargets(this, aimv.origin, aimv.dir, reach) : [];
            if (foes.length) {
              if (combat.cooldownLeft(this, id) <= 0) this._swing(aimv, it);
            } else if (this.target.block && this.target.block.dist <= REACH) {
              mining = true;
              this._mine(dt, this.target.block, it);
            } else if (pressP && combat.cooldownLeft(this, id) <= 0) this._swing(aimv, it);
          }
          break;
        }
        case 'ranged': {
          if (it.charge) {
            if (a.primary && combat.cooldownLeft(this, id) <= 0) {
              this.charge = Math.min(1, this.charge + dt / 0.85);
              if (this.charge >= 1 && !this._fullCharge) { this._fullCharge = true; g.audio?.play('ui_click', { volume: 0.3, pitch: 1.8 }); }
            } else if (releaseP && this.charge > 0) {
              if (this.charge > 0.12) this._fire(aim(), it, { charge: this.charge });
              this.charge = 0; this._fullCharge = false;
            } else if (!a.primary) { this.charge = 0; this._fullCharge = false; }
          } else if (a.primary && combat.cooldownLeft(this, id) <= 0) this._fire(aim(), it);
          break;
        }
        case 'gun': case 'spell':
          if (a.primary && combat.cooldownLeft(this, id) <= 0 && (it.kind === 'gun' ? true : (pressP || true))) this._fire(aim(), it);
          break;
      }
      // secondary: place (hammer) / interact
      if (a.secondary) {
        this._placeT -= dt;
        if (id === 'build_hammer') {
          if (pressS || this._placeT <= 0) { this._place(ghost); this._placeT = pressS ? 0.3 : 0.2; }
        } else if (pressS) {
          if (this.target.entity && this.target.entity.faction === 'village') g.bus.emit('select:entity', { entity: this.target.entity });
          else if (this.target.block) this._hint('Выберите «Молот строителя», чтобы ставить блоки');
        }
      } else this._placeT = 0;
    }
    if (!mining && this.mining) { this._mineKey = ''; }
    this.mining = mining;
    this.cursor.update(dt, this.target.block, ghost);
  }

  _swing(aim, it) {
    const res = this.game.combat.useItem(this, it.id, aim.origin, aim.dir);
    if (!res) return;
    this.viewmodel.play('swing');
    this.model?.play(it.kind === 'tool' && it.toolType === 'axe' ? 'chop' : 'attack');
    if (res.hits) navigator.vibrate?.(10);
  }

  _fire(aim, it, opts = {}) {
    const g = this.game;
    const muzzle = this.muzzle(aim);
    const res = g.combat.useItem(this, it.id, aim.origin, aim.dir, { ...opts, muzzle });
    if (!res) return;
    const vm = this.viewmodel;
    if (it.kind === 'gun') { vm.play('recoil', it.pellets ? 1.3 : 1); this.model?.play('shoot'); navigator.vibrate?.(25); }
    else if (it.kind === 'spell') { vm.play('cast'); this.model?.play('cast'); }
    else if (it.id === 'grenade') { vm.play('throw'); this.model?.play('attack'); }
    else if (it.id === 'crossbow') { vm.play('recoil', 0.6); this.model?.play('shoot'); }
    else { vm.play('recoil', 0.35); this.model?.play('shoot'); }
  }

  _mine(dt, hit, it) {
    const g = this.game, w = g.world;
    const b = BLOCKS[hit.id];
    if (!b || !isFinite(b.hardness)) return;
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (key !== this._mineKey) { this._mineKey = key; this._mineSoundT = 0; this._mineFxT = 0; }
    let mul = 1;
    if (it.kind === 'tool' && it.toolType === b.tool) mul = it.speed || 1;
    else if (it.kind === 'build') mul = 1.6;
    else if (b.tool === 'pick') mul = 0.35;
    if (it.kind === 'melee' && b.tool === 'axe' && hit.id !== B.LOG) mul = Math.max(mul, 1.2);
    const res = w.hitBlock(hit.x, hit.y, hit.z, 2 * mul * dt, 'player');
    this._mineSoundT -= dt; this._mineFxT -= dt;
    if (res.broken) {
      g.audio?.play('break_block', { pos: { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, volume: 0.8, pitch: 0.9 + Math.random() * 0.2 });
      this._mineKey = '';
      g.cameraRig?.shake?.(0.03);
      navigator.vibrate?.(12);
      return;
    }
    if (this._mineSoundT <= 0) {
      this._mineSoundT = 0.27;
      const snd = b.tool === 'pick' ? 'dig_stone' : b.tool === 'axe' ? 'dig_wood' : 'dig_dirt';
      g.audio?.play(snd, { pos: hit.point, volume: 0.55, pitch: 0.9 + Math.random() * 0.2 });
      this.model?.play('mine');
    }
    if (this._mineFxT <= 0) { this._mineFxT = 0.12; g.particles.blockHit(hit.x, hit.y, hit.z, hit.id, hit.point); }
  }

  /** Cell where the build block would go for a given block hit (+ whether it's allowed). */
  _placeCell(hit) {
    const w = this.game.world;
    const hb = BLOCKS[hit.id];
    let x = hit.px, y = hit.py, z = hit.pz;
    if (hb && hb.replaceable && hit.id !== B.WATER) { x = hit.x; y = hit.y; z = hit.z; }
    if (!w.inBounds(x, y, z)) return null;
    const cur = BLOCKS[w.getBlock(x, y, z)];
    const id = this.buildBlock, b = BLOCKS[id];
    let ok = !!cur?.replaceable && !!b;
    if (ok && b.solid) ok = !this._entityInCell(x, y, z);
    if (ok && !this.game.state.canAfford(b.cost)) ok = false;
    return { x, y, z, id, ok };
  }
  _entityInCell(x, y, z) {
    for (const e of this.game.entities.query({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, 3)) {
      if (e.kind === 'projectile') continue;
      const r = e.radius;
      if (e.position.x + r > x && e.position.x - r < x + 1 && e.position.z + r > z && e.position.z - r < z + 1 && e.position.y + e.height > y && e.position.y < y + 1) return true;
    }
    return false;
  }
  _place(cell) {
    const g = this.game, w = g.world;
    if (!cell) return;
    const b = BLOCKS[cell.id];
    const cur = BLOCKS[w.getBlock(cell.x, cell.y, cell.z)];
    if (!cur?.replaceable) return;
    if (b.solid && this._entityInCell(cell.x, cell.y, cell.z)) { this._hint('Мешает существо', 'bad'); return; }
    if (!g.state.spend(b.cost)) { this._hint(`Недостаточно ресурсов:${costText(b.cost, true)}`, 'bad'); g.audio?.play('mana_empty', { volume: 0.4, pitch: 0.8 }); return; }
    w.setBlock(cell.x, cell.y, cell.z, cell.id);
    g.state.stats.blocksPlaced = (g.state.stats.blocksPlaced || 0) + 1;
    g.bus.emit('block:placed', { x: cell.x, y: cell.y, z: cell.z, id: cell.id, by: 'player' });
    g.audio?.play('place_block', { pos: { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 }, volume: 0.8, pitch: 0.9 + Math.random() * 0.2 });
    g.particles.emit({ pos: { x: cell.x + 0.5, y: cell.y + 0.1, z: cell.z + 0.5 }, box: 0.5, count: 6, colors: g.particles.tileColors(b.tiles.side), speed: 1, gravity: 8, life: 0.4, size: 0.08 });
    this.viewmodel.play('place');
    this.model?.play('hammer');
  }

  // ------------------------------------------------------------------ visuals
  _visuals(dt, explore) {
    const g = this.game, vm = this.viewmodel, rig = g.cameraRig;
    const fp = this.firstPerson && g.mode === 'explore';
    // light at eye level for viewmodel shading
    this._lightT -= dt;
    if (this._lightT <= 0) {
      this._lightT = 0.2;
      const l = g.world.getLight(Math.floor(this.position.x), Math.floor(this.position.y + 1.6), Math.floor(this.position.z));
      const sky = (l >> 4) / 15, blk = (l & 15) / 15;
      this._lightCache = { s: 0.12 + 0.88 * sky * sky, b: Math.pow(blk, 1.6) };
    }
    if (vm) {
      const showVm = fp && explore && !this.dead && !rig?.trans;
      vm.setVisible(showVm);
      vm.setItem(this.itemId);
      if (showVm) vm.update(dt, {
        bobAmount: this.onGround ? this.bobAmount : this.bobAmount * 0.3, bobPhase: this.bobPhase, landDip: this.landDip,
        lookX: g.input.lookDelta.x, lookY: g.input.lookDelta.y, mining: this.mining, charge: this.charge,
        sprinting: this.sprinting && this.bobAmount > 0.3, light: this._lightCache,
      });
    }
    if (this.model) {
      this.model.group.visible = !fp || !!rig?.trans;
      this.model.setHeld(this.itemId);
      this.model.lookPitch = g.mode === 'explore' ? -(rig?.pitch || 0) * 0.8 : 0;
      this.model.setLoop(this.mining ? 'mine' : this.charge > 0 ? 'aim' : null);
      if (this.crouching) this.model.body.rotation.x = 0.35;
      this.model.update(dt, Math.hypot(this.velocity.x, this.velocity.z));
      if (this.crouching) { this.model.body.rotation.x = 0.4; this.model.root.position.y = -0.12; }
    }
    if (!explore || this.dead) this.cursor?.hide();
    this.syncObject(dt);
  }
}

function costText(cost, always = false) {
  const parts = [];
  for (const k in cost || {}) if (cost[k]) parts.push(`${cost[k]} ${(RESOURCE_LABELS[k] || k).toLowerCase()}`);
  if (!parts.length) return always ? ' —' : ' (бесплатно)';
  return (always ? ' ' : ' — ') + parts.join(', ');
}
