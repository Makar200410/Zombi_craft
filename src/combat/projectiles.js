// Projectile simulation + pooled meshes. Types: arrow, bolt, bullet, fireball, ice_shard, acid, bomb, meteor.
// (lightning and heal_nova are instant effects handled by Combat.)
import * as THREE from 'three';
import { glowTexture } from './effects.js';

export const PROJECTILES = {
  arrow:     { speed: 48, gravity: 14, life: 5, damage: 8, stick: true, knock: 2.5, kind: 'phys', sound: 'arrow_hit' },
  bolt:      { speed: 72, gravity: 6, life: 4, damage: 14, stick: true, knock: 4, kind: 'phys', sound: 'arrow_hit' },
  bullet:    { speed: 170, gravity: 2, life: 0.9, damage: 30, knock: 5, kind: 'phys', sound: 'arrow_hit' },
  fireball:  { speed: 28, gravity: 1.2, life: 3.5, damage: 14, splash: 2.5, knock: 3, kind: 'fire', sound: 'fire_impact', light: 0xff7a2a },
  ice_shard: { speed: 44, gravity: 0.5, life: 2.5, damage: 8, knock: 1.5, kind: 'frost', sound: 'frost_impact', light: 0x7ad0ff },
  acid:      { speed: 17, gravity: 18, life: 4, damage: 7, splash: 1.3, knock: 1, kind: 'acid', sound: 'splash' },
  bomb:      { speed: 17, gravity: 20, life: 4, damage: 35, splash: 4, knock: 8, kind: 'explosion', sound: 'explosion' },
  meteor:    { speed: 40, gravity: 6, life: 6, damage: 80, splash: 6, knock: 12, kind: 'fire', sound: 'explosion', light: 0xff5a1a },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

const MATS = {};
function mat(key, make) { return MATS[key] || (MATS[key] = make()); }
const lambert = (color, o = {}) => mat('l' + color + JSON.stringify(o), () => new THREE.MeshLambertMaterial({ color, ...o }));
const basic = (color, o = {}) => mat('b' + color + JSON.stringify(o), () => new THREE.MeshBasicMaterial({ color, ...o }));
const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());

function haloSprite(color, size, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false }));
  s.scale.setScalar(size); s.renderOrder = 6;
  return s;
}

/** Builds the visual for a projectile type. The object's local +Z points along the flight direction. */
function buildMesh(type) {
  const g = new THREE.Group();
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m); b.position.set(x, y, z); g.add(b); return b; };
  switch (type) {
    case 'arrow': {
      box(0.035, 0.035, 0.78, lambert(0x9a7448));
      box(0.07, 0.07, 0.12, lambert(0xb8c0c8), 0, 0, 0.42);
      box(0.012, 0.11, 0.16, lambert(0xf2efe6), 0, 0, -0.34);
      box(0.11, 0.012, 0.16, lambert(0xc84a3a), 0, 0, -0.34);
      break;
    }
    case 'bolt': {
      box(0.05, 0.05, 0.55, lambert(0x5a4630));
      box(0.09, 0.09, 0.1, lambert(0x8a939c), 0, 0, 0.3);
      box(0.012, 0.1, 0.1, lambert(0x3a3a3a), 0, 0, -0.24);
      box(0.1, 0.012, 0.1, lambert(0x3a3a3a), 0, 0, -0.24);
      break;
    }
    case 'bullet': {
      const streak = box(0.045, 0.045, 1, basic(0xfff0b0, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      streak.geometry = geo('streak', () => { const b = new THREE.BoxGeometry(1, 1, 1); b.translate(0, 0, -0.5); return b; });
      streak.scale.set(0.045, 0.045, 2.2); g.userData.streak = streak;
      box(0.06, 0.06, 0.06, basic(0xffffff));
      break;
    }
    case 'fireball': {
      const core = new THREE.Mesh(geo('ico1', () => new THREE.IcosahedronGeometry(0.2, 1)), basic(0xffe08a));
      g.add(core);
      const shell = new THREE.Mesh(geo('ico1b', () => new THREE.IcosahedronGeometry(0.28, 1)), basic(0xff6a1a, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(shell); g.userData.spin = shell;
      g.add(haloSprite(0xff8a30, 1.6));
      break;
    }
    case 'ice_shard': {
      const m = new THREE.Mesh(geo('oct', () => new THREE.OctahedronGeometry(0.5, 0)), basic(0xbfeaff, { transparent: true, opacity: 0.92 }));
      m.scale.set(0.12, 0.12, 0.5); g.add(m); g.userData.spin = m;
      const m2 = new THREE.Mesh(geo('oct'), basic(0x5ab8ff, { transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      m2.scale.set(0.2, 0.2, 0.62); g.add(m2);
      g.add(haloSprite(0x7ac8ff, 0.9, 0.7));
      break;
    }
    case 'acid': {
      const m = new THREE.Mesh(geo('ico0', () => new THREE.IcosahedronGeometry(0.17, 1)), basic(0x8fe03a));
      g.add(m); g.userData.spin = m;
      g.add(haloSprite(0x7ad030, 0.8, 0.8));
      break;
    }
    case 'bomb': {
      const m = new THREE.Mesh(geo('bomb', () => new THREE.SphereGeometry(0.2, 10, 8)), lambert(0x2b2b30));
      m.castShadow = true; g.add(m); g.userData.spin = m;
      box(0.06, 0.1, 0.06, lambert(0x6a5a40), 0, 0.22, 0);
      const spark = haloSprite(0xffc040, 0.35); spark.position.y = 0.3; g.add(spark); g.userData.spark = spark;
      break;
    }
    case 'meteor': {
      const rock = new THREE.Mesh(geo('meteor', () => new THREE.DodecahedronGeometry(0.95, 0)), new THREE.MeshLambertMaterial({ color: 0x3a2418, emissive: 0xff4a10, emissiveIntensity: 0.55, flatShading: true }));
      g.add(rock); g.userData.spin = rock;
      const lava = new THREE.Mesh(geo('meteor2', () => new THREE.DodecahedronGeometry(1.15, 0)), basic(0xff7a20, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(lava);
      g.add(haloSprite(0xff6a20, 5.5, 0.9));
      break;
    }
    default: box(0.1, 0.1, 0.1, basic(0xffffff));
  }
  return g;
}

export class Projectiles {
  constructor(combat) {
    this.combat = combat;
    this.game = combat.game;
    this.list = [];
    this.stuck = [];     // arrows stuck in blocks: {obj, type, t}
    this.pool = {};
  }
  _get(type) {
    const arr = this.pool[type] || (this.pool[type] = []);
    const o = arr.pop() || buildMesh(type);
    o.visible = true;
    this.game.scene.add(o);
    return o;
  }
  _put(type, o) { o.visible = false; o.parent?.remove(o); (this.pool[type] || (this.pool[type] = [])).push(o); }

  /** Spawns a projectile. vel = initial velocity vector. opts: damage, splash, slow, burn, faction, onHit */
  spawn(type, user, from, vel, opts = {}) {
    const def = PROJECTILES[type];
    if (!def) return null;
    const obj = this._get(type);
    const p = {
      type, def, user, faction: opts.faction ?? user?.faction ?? 'neutral',
      pos: new THREE.Vector3().copy(from), vel: new THREE.Vector3().copy(vel), prev: new THREE.Vector3().copy(from),
      start: new THREE.Vector3().copy(from),
      damage: opts.damage ?? def.damage, splash: opts.splash ?? def.splash ?? 0, gravity: opts.gravity ?? def.gravity,
      life: opts.life ?? def.life, t: 0, obj, opts, light: null, trailT: 0, dead: false,
    };
    obj.position.copy(from);
    this._orient(p);
    if (def.light) p.light = this.combat.lights.attach(obj, def.light, type === 'meteor' ? 60 : 14, type === 'meteor' ? 26 : 8);
    this.list.push(p);
    return p;
  }

  _orient(p) {
    if (p.vel.lengthSq() < 1e-6) return;
    _dir.copy(p.vel).normalize();
    p.obj.quaternion.setFromUnitVectors(Z, _dir);
  }

  update(dt) {
    const g = this.game, w = g.world;
    const lowQ = g.quality === 'low';
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t > p.life) { this._expire(p); this.list.splice(i, 1); continue; }
      p.prev.copy(p.pos);
      p.vel.y -= p.gravity * dt;
      if (p.type === 'fireball' || p.type === 'ice_shard') p.vel.multiplyScalar(Math.pow(0.97, dt));
      const step = _v.copy(p.vel).multiplyScalar(dt);
      const len = step.length();
      if (len > 1e-6) {
        _dir.copy(step).divideScalar(len);
        const faction = p.faction;
        const hitE = g.entities.raycast(p.prev, _dir, len + 0.05, e => e !== p.user && e.faction !== faction && e.kind !== 'projectile' && !e.dead);
        const hitB = w ? w.raycast(p.prev, _dir, len, { solidOnly: true }) : null;
        if (hitE && (!hitB || hitE.dist <= hitB.dist)) {
          p.pos.copy(p.prev).addScaledVector(_dir, hitE.dist);
          this._hitEntity(p, hitE.entity);
          this.list.splice(i, 1); continue;
        }
        if (hitB) {
          p.pos.copy(hitB.point).addScaledVector(_dir, -0.02);
          this._hitBlock(p, hitB);
          this.list.splice(i, 1); continue;
        }
        p.pos.add(step);
      }
      // world bounds
      if (w && (p.pos.y < -2 || p.pos.x < -5 || p.pos.z < -5 || p.pos.x > w.size + 5 || p.pos.z > w.size + 5)) { this._expire(p); this.list.splice(i, 1); continue; }
      p.obj.position.copy(p.pos);
      this._orient(p);
      this._trail(p, dt, lowQ);
    }
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t -= dt;
      // arrows fall out when their block disappears
      if (s.t <= 0 || (w && !w.isSolid(s.bx, s.by, s.bz))) { this._put(s.type, s.obj); this.stuck.splice(i, 1); }
    }
  }

  _trail(p, dt, lowQ) {
    const P = this.game.particles;
    p.trailT -= dt;
    const u = p.obj.userData;
    if (u.spin) { u.spin.rotation.x += dt * 9; u.spin.rotation.y += dt * 7; }
    switch (p.type) {
      case 'bullet': {
        const traveled = p.pos.distanceTo(p.start);
        u.streak.scale.z = Math.min(3.2, traveled);
        break;
      }
      case 'fireball':
        if (p.trailT <= 0) { p.trailT = lowQ ? 0.03 : 0.016; P.emit({ pos: p.pos, count: 2, colors: [0xffc050, 0xff7020, 0xffe8a0], additive: true, speed: 0.6, box: 0.12, gravity: -2, life: 0.45, size: 0.32, drag: 0.5 }); if (Math.random() < 0.3) P.emit({ pos: p.pos, count: 1, color: 0x40342c, speed: 0.3, gravity: -1.5, life: 0.9, size: 0.35, alpha: 0.5 }); }
        break;
      case 'ice_shard':
        if (p.trailT <= 0) { p.trailT = lowQ ? 0.04 : 0.02; P.emit({ pos: p.pos, count: 1, colors: [0xdff6ff, 0x8fd4ff], additive: true, speed: 0.4, gravity: 1, life: 0.4, size: 0.14 }); }
        break;
      case 'acid':
        if (p.trailT <= 0) { p.trailT = 0.035; P.emit({ pos: p.pos, count: 1, colors: [0x9ae04a, 0x6aa82a], speed: 0.3, gravity: 6, life: 0.4, size: 0.1 }); }
        break;
      case 'bomb':
        if (u.spark) u.spark.scale.setScalar(0.25 + Math.random() * 0.25);
        if (p.trailT <= 0) { p.trailT = 0.03; P.emit({ pos: _v2.copy(p.pos).setY(p.pos.y + 0.3), count: 1, colors: [0xffd060, 0xff8a20], additive: true, speed: 1.5, gravity: 4, life: 0.25, size: 0.07 }); }
        break;
      case 'meteor':
        if (p.trailT <= 0) {
          p.trailT = lowQ ? 0.025 : 0.012;
          P.emit({ pos: p.pos, count: 4, colors: [0xffd070, 0xff7020, 0xff4010], additive: true, speed: 1.2, box: 0.6, gravity: -1, life: 0.6, size: 0.9, drag: 0.4 });
          P.emit({ pos: p.pos, count: 2, colors: [0x2a2420, 0x4a3a30], speed: 0.6, box: 0.5, gravity: -0.8, life: 1.8, size: 1.1, alpha: 0.6, drag: 0.5 });
        }
        break;
    }
  }

  _hitEntity(p, e) {
    const c = this.combat, def = p.def;
    const dir = _dir.copy(p.vel).setY(0).normalize();
    switch (p.type) {
      case 'fireball': case 'bomb': case 'meteor':
        c.meleeHit(p.user, e, p.damage, { kind: def.kind, dir, knockback: def.knock * 0.4, silent: true, point: p.pos, noFx: true, burn: p.opts.burn });
        c.explode(p.pos, p.splash, p.damage * 0.6, p.user, { kind: def.kind, burn: p.opts.burn ?? (def.kind === 'fire' ? 4 : 0), exclude: e, breakBlocks: p.opts.breakBlocks, craterRadius: p.opts.craterRadius, shake: p.opts.shake, big: p.type === 'meteor' });
        break;
      case 'acid':
        c.meleeHit(p.user, e, p.damage, { kind: 'acid', dir, knockback: def.knock, point: p.pos, noFx: true });
        this._acidSplash(p);
        break;
      case 'ice_shard':
        c.meleeHit(p.user, e, p.damage, { kind: 'frost', dir, knockback: def.knock, point: p.pos, slow: p.opts.slow ?? 3 });
        this._frostBurst(p.pos);
        break;
      default:
        c.meleeHit(p.user, e, p.damage, { kind: def.kind, dir, knockback: def.knock, point: p.pos, sound: p.type === 'bullet' ? null : undefined });
    }
    this._release(p);
  }

  _hitBlock(p, hit) {
    const c = this.combat, g = this.game, P = g.particles;
    switch (p.type) {
      case 'arrow': case 'bolt': {
        g.audio?.play('arrow_hit', { pos: p.pos, volume: 0.7, pitch: 0.9 + Math.random() * 0.2 });
        P.blockHit(hit.x, hit.y, hit.z, hit.id, hit.point);
        if (this.stuck.length > 40) { const s = this.stuck.shift(); this._put(s.type, s.obj); }
        if (p.light) { c.lights.release(p.light); p.light = null; }
        // leave it stuck in the block, slightly buried
        p.obj.position.copy(hit.point).addScaledVector(_dir.copy(p.vel).normalize(), p.type === 'arrow' ? 0.22 : 0.12);
        this.stuck.push({ obj: p.obj, type: p.type, t: 8, bx: hit.x, by: hit.y, bz: hit.z });
        if (p.user?.faction === 'undead') c._damageBuildingBlock(hit.x, hit.y, hit.z, p.damage * 0.3, p.user);
        return;
      }
      case 'bullet':
        P.blockHit(hit.x, hit.y, hit.z, hit.id, hit.point);
        P.emit({ pos: hit.point, count: 6, colors: [0xfff0a0, 0xffc050], additive: true, speed: 5, gravity: 12, life: 0.25, size: 0.06, dir: { x: hit.nx * 2, y: hit.ny * 2 + 1, z: hit.nz * 2 } });
        P.emit({ pos: hit.point, count: 4, color: 0x9a948a, speed: 0.8, gravity: -0.6, life: 0.9, size: 0.3, alpha: 0.5 });
        g.audio?.play('pick_hit', { pos: hit.point, volume: 0.35, pitch: 1.6 });
        break;
      case 'fireball': case 'bomb': case 'meteor':
        c.explode(p.pos, p.splash, p.damage * (p.type === 'fireball' ? 0.7 : 1), p.user, { kind: p.def.kind, burn: p.opts.burn ?? (p.def.kind === 'fire' ? 4 : 0), breakBlocks: p.opts.breakBlocks, craterRadius: p.opts.craterRadius, shake: p.opts.shake, big: p.type === 'meteor', normal: hit });
        break;
      case 'acid':
        this._acidSplash(p);
        if (p.user?.faction === 'undead') c._damageBuildingBlock(hit.x, hit.y, hit.z, p.damage * 0.5, p.user);
        break;
      case 'ice_shard':
        this._frostBurst(p.pos);
        g.audio?.play('frost_impact', { pos: p.pos, volume: 0.7 });
        break;
    }
    this._release(p);
  }

  _acidSplash(p) {
    const g = this.game;
    g.particles.emit({ pos: p.pos, count: 16, colors: [0x9ae04a, 0x6aa82a, 0xc8f070], speed: 3, gravity: 12, life: 0.6, size: 0.14, dir: { x: 0, y: 2, z: 0 } });
    g.particles.emit({ pos: p.pos, count: 5, colors: [0x6a9a3a], speed: 0.6, gravity: -0.5, life: 1.0, size: 0.4, alpha: 0.45 });
    g.audio?.play('splash', { pos: p.pos, volume: 0.5, pitch: 1.4 });
    if (p.splash > 0) this.combat.explode(p.pos, p.splash, p.damage * 0.4, p.user, { kind: 'acid', silent: true, noFx: true });
  }
  _frostBurst(pos) {
    const g = this.game;
    g.particles.emit({ pos, count: 14, colors: [0xe8f8ff, 0x9ad8ff, 0x5ab0f0], additive: true, speed: 3.2, gravity: 6, life: 0.55, size: 0.12 });
    g.particles.emit({ pos, count: 5, colors: [0xcfeaff], speed: 0.7, gravity: -0.3, life: 0.8, size: 0.4, alpha: 0.35 });
    this.combat.effects.glow(pos, 0x8fd0ff, 0.3, 1.6, 0.25);
  }

  _expire(p) {
    if (p.type === 'bomb' || p.type === 'meteor') { this._hitBlock(p, { x: Math.floor(p.pos.x), y: Math.floor(p.pos.y), z: Math.floor(p.pos.z), id: 0, nx: 0, ny: 1, nz: 0, point: p.pos }); return; }
    if (p.type === 'fireball') this.combat.effects.glow(p.pos, 0xff8030, 0.6, 1.4, 0.3);
    this._release(p);
  }
  _release(p) {
    if (p.dead) return;
    p.dead = true;
    if (p.light) { this.combat.lights.release(p.light); p.light = null; }
    if (!this.stuck.some(s => s.obj === p.obj)) this._put(p.type, p.obj);
  }
  clear() {
    for (const p of this.list) this._release(p);
    this.list.length = 0;
    for (const s of this.stuck) this._put(s.type, s.obj);
    this.stuck.length = 0;
  }
}
