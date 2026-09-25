// Combat system shared by the player, guards, mages and zombies.
//
//   useItem(user, itemId, origin, dir, opts?) -> false | {used: true, hits, projectile?}
//        opts: {charge 0..1 (bow), damageMul, muzzle: Vector3 (visual spawn point), target: Vector3 (spells), silent}
//   fireProjectile(type, user, from, dirOrTarget, opts?) -> projectile
//        dirOrTarget: unit direction, or a world point (arc projectiles solve a ballistic lob to hit it)
//        opts: {damage, speed, splash, slow, burn, breakBlocks, faction, muzzle}
//   meleeHit(user, target, damage, opts?) -> bool died     opts: {kind, knockback (number), dir, point, slow, burn, stun}
//   explode(pos, radius, damage, source, opts?)            opts: {breakBlocks: false|'natural'|'all', kind, burn, shake, craterRadius}
//   lightning(user, from, dir, opts) / healNova(user, center, radius, amount) / meteor(user, point, opts)
//   canUse(user, itemId) -> {ok, reason}   cooldownLeft(user, itemId)   cooldownFrac(user, itemId)
//   isEnemy(a, b)  — friendly fire is never allowed (same faction never takes damage)
import * as THREE from 'three';
import { ITEMS } from '../core/items.js';
import { B, BLOCKS } from '../core/blocks.js';
import { LightPool, Effects } from './effects.js';
import { Projectiles, PROJECTILES } from './projectiles.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// Blocks a meteor / bomb crater may remove (never building materials).
const NATURAL = new Set([B.GRASS, B.DIRT, B.STONE, B.SAND, B.GRAVEL, B.LEAVES, B.SPRUCE_LEAVES, B.BIRCH_LEAVES, B.TALL_GRASS,
  B.FLOWER_RED, B.FLOWER_YELLOW, B.SNOW, B.DEAD_BUSH, B.MUSHROOM, B.MOSSY_COBBLE, B.DARK_STONE, B.COAL_ORE, B.FARMLAND, B.PATH,
  B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3].filter(v => v !== undefined));

const ITEM_SOUNDS = {
  bow: 'bow_shoot', crossbow: 'crossbow_shoot', musket: 'musket_shot', blunderbuss: 'blunderbuss_shot', grenade: 'swing',
  staff_fire: 'fireball_cast', staff_frost: 'frost_cast', staff_storm: 'lightning', staff_life: 'heal', tome_meteor: 'meteor_fall',
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.lights = null;
    this.effects = null;
    this.projectiles = null;
    this._toastT = 0;
  }

  init() {
    const g = this.game;
    this.lights = new LightPool(g.scene, g.quality === 'low' ? 2 : 4);
    this.effects = new Effects(g);
    this.projectiles = new Projectiles(this);
    g.bus.on('world:ready', () => { this.projectiles.clear(); this.effects.clear(); });
  }
  onNewGame() { this.projectiles?.clear(); this.effects?.clear(); }

  update(dt) {
    // keep user.cooldowns (remaining seconds) fresh for HUDs
    const now = this.game.time;
    for (const e of this.game.entities.list) {
      const cu = e._cdUntil; if (!cu) continue;
      for (const k in cu) { const left = cu[k] - now; e.cooldowns[k] = left > 0 ? left : 0; }
    }
    this.projectiles.update(dt);
    this.effects.update(dt);
    this.lights.update(dt, this.game.time);
    // meteor warnings
    if (this._warnings) for (let i = this._warnings.length - 1; i >= 0; i--) {
      const w = this._warnings[i]; w.t -= dt;
      if (w.t <= 0) { this._warnings.splice(i, 1); continue; }
      w.pulse -= dt;
      if (w.pulse <= 0) { w.pulse = 0.28; this.effects.ring(w.pos, 0xff5020, w.r * 0.2, w.r, 0.5, { opacity: 0.8 }); }
    }
  }

  // ------------------------------------------------------------------ helpers
  isEnemy(a, b) {
    if (!a || !b || a === b) return false;
    const fa = a.faction ?? a, fb = b.faction;
    return fa !== fb && fb !== undefined && b.kind !== 'projectile';
  }
  _enemyFilter(user) {
    const f = user?.faction;
    return (e) => e !== user && !e.dead && e.kind !== 'projectile' && e.faction !== f && e.hp > 0;
  }
  /** Seconds until itemId is ready again for user. (user.cooldowns[id] mirrors this as remaining seconds for UIs.) */
  cooldownLeft(user, itemId) { const t = user?._cdUntil?.[itemId] || 0; return Math.max(0, t - this.game.time); }
  cooldownFrac(user, itemId) {
    const it = ITEMS[itemId]; if (!it) return 0;
    const left = this.cooldownLeft(user, itemId);
    const dur = user?._cdDur?.[itemId] || it.cooldown || 0.5;
    return dur > 0 ? Math.min(1, left / dur) : 0;
  }
  canUse(user, itemId) {
    const it = ITEMS[itemId];
    if (!it) return { ok: false, reason: 'unknown' };
    if (this.cooldownLeft(user, itemId) > 0) return { ok: false, reason: 'cooldown' };
    if (it.manaCost && typeof user?.mana === 'number' && user.mana < it.manaCost) return { ok: false, reason: 'mana' };
    return { ok: true };
  }
  _setCooldown(user, itemId, dur) {
    if (!user) return;
    user.cooldowns = user.cooldowns || {}; user._cdDur = user._cdDur || {}; user._cdUntil = user._cdUntil || {};
    user._cdUntil[itemId] = this.game.time + dur; user._cdDur[itemId] = dur; user.cooldowns[itemId] = dur;
  }
  _toast(user, text, kind = 'bad') {
    if (user?.kind !== 'player') return;
    if (this.game.time < this._toastT) return;
    this._toastT = this.game.time + 1.6;
    this.game.bus.emit('toast', { text, kind });
  }
  _play(name, pos, volume = 1, pitch = 1) { try { this.game.audio?.play(name, { pos, volume, pitch }); } catch (e) { /* ignore */ } }
  /** Where a spell/shot aimed along dir lands (block or entity), up to maxDist. */
  aimPoint(user, origin, dir, maxDist) {
    const g = this.game;
    const hb = g.world?.raycast(origin, dir, maxDist, { solidOnly: true });
    const he = g.entities.raycast(origin, dir, hb ? hb.dist : maxDist, this._enemyFilter(user));
    if (he) return { point: origin.clone().addScaledVector(dir, he.dist), entity: he.entity, block: null };
    if (hb) return { point: hb.point.clone(), entity: null, block: hb };
    return { point: origin.clone().addScaledVector(dir, maxDist), entity: null, block: null };
  }

  // ------------------------------------------------------------------ items
  useItem(user, itemId, origin, dir, opts = {}) {
    const g = this.game, it = ITEMS[itemId];
    if (!it || !user || user.dead) return false;
    if (this.cooldownLeft(user, itemId) > 0) return false;
    const isPlayer = user.kind === 'player';
    if (it.manaCost && typeof user.mana === 'number') {
      if (user.mana < it.manaCost) {
        this._play('mana_empty', user.position, 0.6);
        this._toast(user, 'Недостаточно маны');
        this._setCooldown(user, itemId, 0.35);
        return false;
      }
      user.mana -= it.manaCost;
    }
    this._setCooldown(user, itemId, (it.cooldown || 0.5) * (opts.cooldownMul || 1));
    const dmgMul = opts.damageMul ?? 1;
    const d = dir.clone().normalize();
    const muzzle = opts.muzzle ? opts.muzzle.clone() : origin.clone().addScaledVector(d, 0.5);
    const snd = ITEM_SOUNDS[itemId];
    const res = { used: true, hits: 0 };

    switch (it.kind) {
      case 'melee': case 'tool': case 'build': {
        const hits = this.meleeCone(user, origin, d, it, dmgMul);
        res.hits = hits;
        if (!opts.silent) this._play('swing', origin, hits ? 0.5 : 0.7, 0.9 + Math.random() * 0.25);
        break;
      }
      case 'ranged': {
        if (it.projectile === 'bomb') {
          const v = d.clone(); v.y += 0.28; v.normalize().multiplyScalar(PROJECTILES.bomb.speed + 3);
          res.projectile = this.projectiles.spawn('bomb', user, muzzle, v, { damage: it.damage * dmgMul, splash: it.splash, breakBlocks: 'natural', craterRadius: 1.4 });
          this._play('swing', origin, 0.8, 0.7);
        } else {
          const charge = it.charge ? THREE.MathUtils.clamp(opts.charge ?? 1, 0.15, 1) : 1;
          const def = PROJECTILES[it.projectile];
          const speed = it.charge ? 18 + def.speed * charge : def.speed;
          const dmg = it.damage * dmgMul * (it.charge ? 0.3 + 0.7 * charge * charge : 1) * (charge >= 1 && it.charge ? 1.25 : 1);
          res.projectile = this.fireProjectile(it.projectile, user, muzzle, this._aimDir(user, origin, d, muzzle, it.range), { damage: dmg, speed });
          if (snd) this._play(snd, origin, 0.9, 0.9 + charge * 0.2);
        }
        break;
      }
      case 'gun': {
        const pellets = it.pellets || 1;
        const aim = this._aimDir(user, origin, d, muzzle, it.range);
        for (let i = 0; i < pellets; i++) {
          const sd = aim.clone();
          const spread = it.spread ?? (isPlayer ? 0.004 : 0.02);
          if (spread) { sd.x += (Math.random() - 0.5) * spread * 2; sd.y += (Math.random() - 0.5) * spread * 2; sd.z += (Math.random() - 0.5) * spread * 2; sd.normalize(); }
          this.fireProjectile('bullet', user, muzzle, sd, { damage: it.damage * dmgMul, life: Math.max(0.12, (it.range || 60) / 170) });
        }
        this._muzzleFx(muzzle, d, pellets > 1);
        if (snd) this._play(snd, origin, 1, 0.95 + Math.random() * 0.1);
        if (isPlayer) { user.recoil = (user.recoil || 0) + (pellets > 1 ? 0.07 : 0.045); g.cameraRig?.shake?.(pellets > 1 ? 0.28 : 0.2); }
        break;
      }
      case 'spell': {
        this._castFx(muzzle, it.element);
        if (it.projectile === 'lightning') { res.hits = this.lightning(user, muzzle, d, { damage: it.damage * dmgMul, range: it.range, chain: it.chain || 3, origin }); }
        else if (it.projectile === 'heal_nova') { res.hits = this.healNova(user, user.position, it.range || 8, (it.heal || 20) * dmgMul); }
        else if (it.projectile === 'meteor') {
          const target = opts.target || this.aimPoint(user, origin, d, it.range || 80).point;
          res.projectile = this.meteor(user, target, { damage: it.damage * dmgMul, splash: it.splash });
        } else {
          res.projectile = this.fireProjectile(it.projectile, user, muzzle, this._aimDir(user, origin, d, muzzle, it.range), { damage: it.damage * dmgMul, splash: it.splash, slow: it.slow ? 3 : undefined, burn: it.element === 'fire' ? 4 : 0 });
        }
        if (snd && it.projectile !== 'lightning' && it.projectile !== 'heal_nova') this._play(snd, origin, 0.9);
        if (isPlayer && it.projectile === 'meteor') g.cameraRig?.shake?.(0.1);
        break;
      }
      default: return false;
    }
    g.bus.emit('combat:used', { user, itemId, result: res });
    return res;
  }

  /** Direction from the muzzle towards whatever the eye ray is aiming at (so shots converge on the crosshair). */
  _aimDir(user, origin, d, muzzle, range = 60) {
    if (!muzzle || muzzle.distanceToSquared(origin) < 0.0001) return d.clone();
    const a = this.aimPoint(user, origin, d, Math.min(range || 60, 120));
    const dir = a.point.clone().sub(muzzle);
    if (dir.lengthSq() < 1) return d.clone();
    return dir.normalize();
  }

  /** Enemies inside a short melee cone in front of origin, best first (no damage applied). */
  meleeTargets(user, origin, dir, range = 3) {
    const g = this.game;
    const scored = [];
    for (const e of g.entities.query(origin, range + 2, this._enemyFilter(user))) {
      const c = e.center;
      _v.subVectors(c, origin);
      const len = _v.length() || 1;
      const dist = Math.max(0, len - e.radius);          // roughly to the body surface
      if (dist > range) continue;
      const cos = _v.dot(dir) / len;
      if (dist >= 0.9 && cos < 0.72) continue;           // ~44° half-angle cone (point blank always counts)
      if (g.world && !g.world.lineOfSight(origin, c)) continue;
      scored.push({ e, s: (1 - cos) * 3 + dist * 0.3 });
    }
    scored.sort((a, b) => a.s - b.s);
    return scored.map(o => o.e);
  }

  /** Melee: hits enemies inside a short cone in front of origin. Cleave items hit several, others the best one. */
  meleeCone(user, origin, dir, it, dmgMul = 1) {
    const g = this.game;
    const found = this.meleeTargets(user, origin, dir, it.range || 3);
    if (!found.length) return 0;
    const targets = it.cleave ? found.slice(0, 5) : found.slice(0, 1);
    let dmg = (it.damage || 1) * dmgMul;
    let kind = it.element === 'arcane' ? 'arcane' : 'phys';
    if (user.kind === 'player' && !user.onGround && user.velocity.y < -0.5 && !user.inWater) { dmg *= 1.5; kind = 'crit'; }
    for (const e of targets) {
      const flat = _v.subVectors(e.position, user.position).setY(0);
      if (flat.lengthSq() < 1e-4) flat.copy(dir).setY(0);
      flat.normalize();
      const hitPoint = _v2.copy(e.center).lerp(origin, 0.35);
      this.meleeHit(user, e, dmg, { kind, dir: flat, knockback: it.knockback ?? 3, point: hitPoint });
      if (kind === 'crit') g.particles.emit({ pos: e.center, count: 10, colors: [0xfff6c0, 0xffe070], additive: true, speed: 3, gravity: 2, life: 0.5, size: 0.12 });
      if (it.element === 'arcane') g.particles.emit({ pos: hitPoint, count: 10, colors: [0xc080ff, 0x80d0ff, 0xffffff], additive: true, speed: 3.5, gravity: 0, life: 0.45, size: 0.12 });
    }
    if (user.kind === 'player') g.cameraRig?.shake?.(it.cleave ? 0.18 : 0.08);
    return targets.length;
  }

  /** Direct damage with knockback + impact fx. Returns true if the target died. */
  meleeHit(user, target, damage, opts = {}) {
    const g = this.game;
    if (!target || target.dead) return false;
    if (user && target.faction === user.faction) return false;     // no friendly fire
    const dir = opts.dir ? _v.copy(opts.dir) : (user ? _v.subVectors(target.position, user.position).setY(0) : _v.set(0, 0, 0));
    if (dir.lengthSq() > 1e-6) dir.normalize();
    let kb;
    if (opts.knockback && typeof opts.knockback === 'object') kb = new THREE.Vector3().copy(opts.knockback);
    else { const kbS = opts.knockback ?? 3; kb = new THREE.Vector3(dir.x * kbS, Math.min(3, kbS * 0.4), dir.z * kbS); }
    const point = opts.point || target.center;
    if (!opts.noFx) this.hitFx(target, point, opts.kind);
    if (opts.slow) target.slowTimer = Math.max(target.slowTimer || 0, opts.slow);
    if (opts.burn) target.burnTimer = Math.max(target.burnTimer || 0, opts.burn);
    if (opts.stun) target.stunTimer = Math.max(target.stunTimer || 0, opts.stun);
    if (opts.sound !== null && !opts.silent) {
      const undead = target.faction === 'undead';
      this._play(undead ? 'hit_zombie' : 'hit_flesh', point, 0.8, 0.9 + Math.random() * 0.2);
    }
    const died = target.damage(damage, user, { kind: opts.kind || 'phys', knockback: kb });
    if (died && user?.kind === 'player') g.cameraRig?.shake?.(0.06);
    return died;
  }

  /** Impact particles: green goo for zombies, red for the living, sparks for structures. */
  hitFx(target, point, kind = 'phys') {
    const P = this.game.particles;
    const undead = target?.faction === 'undead';
    const colors = undead ? [0x6f9a34, 0x4d7424, 0x95c04a, 0x3a5a1c] : [0xb02020, 0x801818, 0xd04040];
    P.emit({ pos: point, count: 9, colors, speed: 3.2, gravity: 14, life: 0.55, size: 0.11, dir: { x: 0, y: 1.8, z: 0 }, drag: 0.7 });
    if (kind === 'fire') P.emit({ pos: point, count: 8, colors: [0xffc050, 0xff7020], additive: true, speed: 2.5, gravity: -2, life: 0.4, size: 0.2 });
    else if (kind === 'frost') P.emit({ pos: point, count: 8, colors: [0xdff6ff, 0x8fd4ff], additive: true, speed: 2.5, gravity: 3, life: 0.4, size: 0.12 });
    else if (kind === 'acid') P.emit({ pos: point, count: 8, colors: [0x9ae04a, 0xc8f070], speed: 2.5, gravity: 10, life: 0.5, size: 0.12 });
    else P.emit({ pos: point, count: 4, colors: [0xffffff, 0xfff0c0], additive: true, speed: 4, gravity: 6, life: 0.18, size: 0.08 });
  }

  _muzzleFx(pos, dir, big) {
    const g = this.game;
    this.lights.flash(pos, 0xffc070, big ? 28 : 20, 0.09, 10, 1);
    this.effects.glow(pos, 0xffd890, big ? 0.5 : 0.35, big ? 1.4 : 1.0, 0.07);
    g.particles.emit({ pos, count: big ? 12 : 7, colors: [0xfff0a0, 0xffb040], additive: true, speed: 6, spread: 0.35, dir: { x: dir.x * 7, y: dir.y * 7, z: dir.z * 7 }, gravity: 0, life: 0.12, size: 0.14 });
    g.particles.emit({ pos, count: big ? 10 : 6, colors: [0xcfcac0, 0xa8a49c, 0xe8e4dc], speed: 0.8, spread: 1, dir: { x: dir.x * 1.8, y: dir.y * 1.8 + 0.4, z: dir.z * 1.8 }, gravity: -0.6, life: 1.4, size: 0.45, alpha: 0.4, drag: 0.35 });
  }
  _castFx(pos, element) {
    const col = { fire: [0xffc050, 0xff7020], frost: [0xdff6ff, 0x7ac8ff], storm: [0xeef6ff, 0x8ab8ff], life: [0xb8ffb0, 0xffe890], arcane: [0xd0a0ff, 0x80d0ff] }[element] || [0xffffff];
    this.game.particles.emit({ pos, count: 8, colors: col, additive: true, speed: 1.6, gravity: -1, life: 0.35, size: 0.14 });
    this.effects.glow(pos, col[col.length - 1], 0.2, 0.8, 0.16, { opacity: 0.8 });
  }

  // ------------------------------------------------------------------ projectiles
  fireProjectile(type, user, from, dirOrTarget, opts = {}) {
    const g = this.game;
    if (type === 'lightning') return this.lightning(user, from, _v.copy(dirOrTarget).sub(from).normalize(), opts);
    if (type === 'heal_nova') return this.healNova(user, from, opts.radius || 8, opts.heal || 20);
    if (type === 'meteor') return this.meteor(user, dirOrTarget, opts);
    const def = PROJECTILES[type];
    if (!def) { console.warn('[combat] unknown projectile', type); return null; }
    const speed = opts.speed ?? def.speed;
    const gravity = opts.gravity ?? def.gravity;
    const vel = new THREE.Vector3();
    const len = dirOrTarget.length();
    const isDir = len > 0.9 && len < 1.1;
    if (isDir) vel.copy(dirOrTarget).normalize().multiplyScalar(speed);
    else {
      // target point: lob for gravity-heavy projectiles, straight shot (+ drop compensation) otherwise
      const to = _v.copy(dirOrTarget).sub(from);
      const dist = to.length();
      const T = Math.max(0.15, dist / speed);
      vel.copy(to).divideScalar(T);
      vel.y += 0.5 * gravity * T;
    }
    if (opts.inherit) vel.addScaledVector(opts.inherit, 0.5);
    if (type === 'bullet' && user?.kind !== 'player' && opts.tracer !== false) { /* NPC shots still get a streak via mesh */ }
    const p = this.projectiles.spawn(type, user, from, vel, { ...opts, gravity });
    if (user && user.kind !== 'player' && type === 'bullet') this._muzzleFx(from, _v2.copy(vel).normalize(), false);
    void g;
    return p;
  }

  // ------------------------------------------------------------------ spells
  /** Chain lightning: strikes the aimed enemy (or nearest in a narrow cone) then jumps between enemies. */
  lightning(user, from, dir, opts = {}) {
    const g = this.game, range = opts.range || 40, chain = Math.max(1, opts.chain || 4);
    let damage = opts.damage ?? 18;
    const filter = this._enemyFilter(user);
    const origin = opts.origin || from;
    let first = g.entities.raycast(origin, dir, range, filter)?.entity || null;
    if (first && g.world && !g.world.lineOfSight(origin, first.center)) first = null;
    if (!first) {
      let best = null, bs = Infinity;
      for (const e of g.entities.query(origin, range, filter)) {
        _v.subVectors(e.center, origin); const l = _v.length() || 1;
        const cos = _v.dot(dir) / l;
        if (cos < 0.96) continue;
        const s = (1 - cos) * 40 + l * 0.05;
        if (s < bs && (!g.world || g.world.lineOfSight(origin, e.center))) { bs = s; best = e; }
      }
      first = best;
    }
    const pts = [from.clone()];
    this._play('lightning', from, 0.9);
    if (!first) {
      const a = this.aimPoint(user, origin, dir, range);
      pts.push(a.point);
      this.effects.lightning(pts, { dur: 0.25 });
      this.lights.flash(a.point, 0x9ac8ff, 18, 0.2, 10, 1);
      g.particles.emit({ pos: a.point, count: 14, colors: [0xffffff, 0x9ac8ff], additive: true, speed: 4, gravity: 6, life: 0.4, size: 0.1 });
      if (a.block) g.particles.blockHit(a.block.x, a.block.y, a.block.z, a.block.id, a.point);
      return 0;
    }
    const hit = new Set();
    let cur = first, n = 0;
    while (cur && n < chain) {
      hit.add(cur);
      pts.push(cur.center.clone());
      this.meleeHit(user, cur, damage, { kind: 'storm', dir: _v.subVectors(cur.position, pts[pts.length - 2]).setY(0), knockback: 2, stun: 0.45, point: cur.center, noFx: true, sound: null });
      g.particles.emit({ pos: cur.center, count: 12, colors: [0xffffff, 0xaad4ff, 0x6aa8ff], additive: true, speed: 3.5, gravity: 2, life: 0.4, size: 0.12 });
      this.effects.glow(cur.center, 0x9ac8ff, 0.5, 2.2, 0.22);
      n++; damage *= 0.82;
      let next = null, nd = 9 * 9;
      for (const e of g.entities.query(cur.center, 9, filter)) {
        if (hit.has(e)) continue;
        const d2 = e.position.distanceToSquared(cur.position);
        if (d2 < nd) { nd = d2; next = e; }
      }
      cur = next;
    }
    this.effects.lightning(pts, { dur: 0.32 });
    // bright flash at the first target
    this.lights.flash(first.center, 0xaad0ff, 30, 0.22, 16, 2);
    if (user?.kind === 'player') g.cameraRig?.shake?.(0.12);
    return n;
  }

  /** Expanding ring that heals the caster's faction. */
  healNova(user, center, radius = 8, amount = 25) {
    const g = this.game;
    const c = _v.copy(center);
    const faction = user?.faction ?? 'village';
    this.effects.ring(c, 0x9affa0, 0.5, radius, 0.7, { opacity: 0.9 });
    this.effects.ring(c, 0xffe890, 0.3, radius * 0.7, 0.55, { opacity: 0.6 });
    this.lights.flash(_v2.copy(c).setY(c.y + 1.2), 0x9aff9a, 16, 0.6, radius * 1.6, 1);
    g.particles.emit({ pos: _v2.copy(c).setY(c.y + 0.3), box: radius * 0.5, count: 40, colors: [0xb8ffb0, 0xffe890, 0xffffff], additive: true, speed: 0.6, dir: { x: 0, y: 2.2, z: 0 }, gravity: -0.5, life: 1.1, size: 0.14 });
    this._play('heal', center, 0.9);
    let n = 0;
    for (const e of g.entities.query(_v2.copy(center).setY(center.y + 0.9), radius + 0.5, (e) => e.faction === faction && e.kind !== 'projectile')) {
      if (e.hp >= e.maxHp) { n++; continue; }
      const before = e.hp;
      e.heal(amount);
      const healed = Math.round(e.hp - before);
      if (healed > 0) g.bus.emit('damage:number', { pos: e.eye.clone(), amount: healed, kind: 'heal', target: e });
      g.particles.emit({ pos: e.center, box: 0.3, count: 10, colors: [0xb8ffb0, 0xffffff], additive: true, speed: 0.5, dir: { x: 0, y: 1.8, z: 0 }, gravity: -0.5, life: 0.9, size: 0.12 });
      n++;
    }
    return n;
  }

  /** Meteor strike at a world point: telegraphed ring, falls from the sky, huge blast + crater. */
  meteor(user, point, opts = {}) {
    const g = this.game, w = g.world;
    const target = new THREE.Vector3(point.x, point.y, point.z);
    if (w) target.y = Math.max(target.y, w.surfaceY(target.x, target.z) + 1) - 0.4;
    const start = new THREE.Vector3(target.x - 16, target.y + 46, target.z - 11);
    const speed = PROJECTILES.meteor.speed;
    const splash = opts.splash ?? 6;
    this._warnings = this._warnings || [];
    const T = start.distanceTo(target) / speed;
    this._warnings.push({ pos: target.clone(), r: splash, t: T, pulse: 0 });
    const vel = target.clone().sub(start).divideScalar(T);
    vel.y += 0.5 * PROJECTILES.meteor.gravity * T;
    this._play('meteor_fall', target, 1);
    return this.projectiles.spawn('meteor', user, start, vel, { damage: opts.damage ?? 80, splash, breakBlocks: 'natural', craterRadius: opts.craterRadius ?? 3.2, shake: 1.1, burn: 5, life: T + 2 });
  }

  // ------------------------------------------------------------------ explosions
  explode(pos, radius, damage, source, opts = {}) {
    const g = this.game, P = g.particles;
    const center = new THREE.Vector3(pos.x, pos.y, pos.z);
    const faction = opts.faction ?? source?.faction;
    const big = !!opts.big || radius >= 5;
    if (opts.breakBlocks === true) opts = { ...opts, breakBlocks: 'all' };
    // damage entities (never same faction)
    let hits = 0;
    for (const e of g.entities.query(center, radius + 1.5, (e) => e.kind !== 'projectile' && !e.dead && (faction === undefined || e.faction !== faction) && e !== opts.exclude)) {
      _v.subVectors(e.center, center);
      const d = Math.max(0, _v.length() - e.radius);
      if (d > radius) continue;
      const f = 1 - 0.65 * (d / radius) * (d / radius);
      _v.setY(0); if (_v.lengthSq() < 1e-4) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5); _v.normalize();
      const kbS = (opts.knockback ?? (big ? 12 : 7)) * f;
      if (opts.burn) e.burnTimer = Math.max(e.burnTimer || 0, opts.burn * f);
      e.damage(damage * f, source, { kind: opts.kind === 'acid' ? 'acid' : opts.kind === 'fire' ? 'fire' : 'explosion', knockback: new THREE.Vector3(_v.x * kbS, 3 + 4 * f, _v.z * kbS) });
      hits++;
    }
    // buildings take damage from undead blasts
    if (faction === 'undead') this._damageBuildingsNear(center, radius, damage * 0.6, source);
    // terrain
    if (opts.breakBlocks && g.world) this._crater(center, opts.craterRadius ?? radius * 0.5, opts.breakBlocks, source);
    if (opts.noFx) return hits;

    // --- visuals
    const s = Math.max(0.6, radius / 3);
    if (opts.kind === 'acid') {
      P.emit({ pos: center, count: 18 * s, colors: [0x9ae04a, 0x6aa82a], speed: 4, gravity: 10, life: 0.7, size: 0.16 });
      return hits;
    }
    const fireCols = opts.kind === 'frost' ? [0xdff6ff, 0x8fd4ff, 0xffffff] : [0xffe8a0, 0xffb040, 0xff6a1a, 0xff3a10];
    this.effects.glow(center, 0xfff0c0, radius * 0.4, radius * 1.6, 0.18);
    this.effects.glow(center, opts.kind === 'frost' ? 0x6ab8ff : 0xff7a2a, radius * 0.6, radius * 2.6, big ? 0.6 : 0.4, { opacity: 0.85 });
    P.emit({ pos: center, count: Math.round(34 * s), colors: fireCols, additive: true, speed: radius * 2.2, spread: 1, gravity: -1.5, life: 0.55, size: 0.45 * s, drag: 0.35, box: 0.3 * s });
    P.emit({ pos: center, count: Math.round(20 * s), colors: [0xfff0a0, 0xffc050], additive: true, speed: radius * 3.5, gravity: 14, life: 0.7, size: 0.08, drag: 0.8 });
    P.emit({ pos: center, count: Math.round(22 * s), colors: [0x3a3632, 0x5a544c, 0x7a746a], speed: radius * 0.9, spread: 1, dir: { x: 0, y: 1.2, z: 0 }, gravity: -0.8, life: 2.2, size: 0.9 * s, alpha: 0.55, drag: 0.4, box: 0.4 * s });
    // ground debris
    if (g.world) {
      const gy = Math.floor(center.y - 0.5), id = g.world.getBlock(center.x, gy, center.z);
      if (id && BLOCKS[id] && id !== B.WATER) P.emit({ pos: center, count: Math.round(16 * s), colors: P.tileColors(BLOCKS[id].tiles.side), speed: radius * 1.8, dir: { x: 0, y: radius * 1.6, z: 0 }, gravity: 18, life: 1.1, size: 0.16, drag: 0.85 });
      this.effects.ring(_v2.set(center.x, (g.world.surfaceY(center.x, center.z) + 1), center.z), 0xffd8a0, radius * 0.3, radius * 2.2, big ? 0.55 : 0.35, { opacity: 0.7 });
    }
    this.lights.flash(center, opts.kind === 'frost' ? 0x8ac8ff : 0xffa050, big ? 90 : 40, big ? 0.7 : 0.4, radius * 5, 3);
    this._play('explosion', center, Math.min(1, 0.5 + radius * 0.12), big ? 0.7 : 1 + (Math.random() - 0.5) * 0.15);
    // camera shake by distance
    const cam = g.camera.position;
    const dist = cam.distanceTo(center);
    const sh = (opts.shake ?? Math.min(0.8, 0.15 + radius * 0.1)) * Math.max(0, 1 - dist / (radius * 9 + 10));
    if (sh > 0.01) g.cameraRig?.shake?.(sh);
    return hits;
  }

  _crater(center, r, mode, source) {
    const g = this.game, w = g.world, village = g.village;
    const R = Math.ceil(r);
    const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
    let removed = 0;
    for (let y = cy - R; y <= cy + R; y++) for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
      const dx = x + 0.5 - center.x, dy = (y + 0.5 - center.y) * 1.3, dz = z + 0.5 - center.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r + (Math.random() - 0.5) * 0.8) continue;
      const id = w.getBlock(x, y, z);
      if (!id || id === B.WATER || id === B.BEDROCK) continue;
      let building = null;
      try { building = village?.buildingAt?.(x, y, z) || null; } catch (e) { building = null; }
      if (mode === 'natural') {
        if (building || !NATURAL.has(id)) continue;
        // don't erase player edits (anything placed is in world.changes and not natural terrain)
        if (w.setBlock(x, y, z, B.AIR)) { removed++; if (removed % 4 === 0) g.particles.blockBreak(x, y, z, id); }
      } else if (mode === 'all') {
        w.hitBlock(x, y, z, 6 * (1 - d / (r + 1)), source);
      }
    }
    // scorch: turn exposed grass under the crater to dirt
    if (mode === 'natural' && removed) {
      for (let z = cz - R - 1; z <= cz + R + 1; z++) for (let x = cx - R - 1; x <= cx + R + 1; x++) {
        const sy = w.surfaceY(x, z);
        if (w.getBlock(x, sy, z) === B.GRASS && Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z) < r + 1.2 && !village?.buildingAt?.(x, sy, z)) w.setBlock(x, sy, z, B.DIRT);
      }
    }
    return removed;
  }

  _damageBuildingsNear(center, radius, dmg, source) {
    const v = this.game.village;
    if (!v?.buildingAt) return;
    const seen = new Set();
    const R = Math.ceil(radius);
    for (let y = -1; y <= 2; y++) for (let z = -R; z <= R; z += 1) for (let x = -R; x <= R; x += 1) {
      if (x * x + z * z > radius * radius) continue;
      let b = null;
      try { b = v.buildingAt(Math.floor(center.x + x), Math.floor(center.y + y), Math.floor(center.z + z)); } catch (e) { b = null; }
      if (b && !seen.has(b)) { seen.add(b); try { b.damage?.(dmg, source); } catch (e) { /* ignore */ } }
    }
  }
  _damageBuildingBlock(x, y, z, dmg, source) {
    const v = this.game.village;
    let b = null;
    try { b = v?.buildingAt?.(x, y, z); } catch (e) { b = null; }
    if (b) { try { b.damage?.(dmg, source); } catch (e) { /* ignore */ } }
  }
}
