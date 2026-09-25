// Visual/sound helpers for the undead + a tiny projectile system for enemy spells
// (necromancer shadow bolts, and acid when the combat module doesn't provide fireProjectile).
import * as THREE from 'three';
import { B, BLOCKS } from '../core/blocks.js';

export function groundBurst(game, x, y, z, { purple = false, big = false } = {}) {
  const p = game.particles; if (!p) return;
  const w = game.world;
  const under = w ? w.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z)) : B.DIRT;
  const cols = BLOCKS[under] && under !== B.AIR ? p.tileColors(BLOCKS[under].tiles.top) : [0x5a4a3a];
  const n = big ? 2 : 1;
  p.emit({ pos: { x, y: y + 0.1, z }, box: 0.5 * n, count: 26 * n, colors: cols, speed: 3.5, spread: 0.8, dir: { x: 0, y: 5, z: 0 }, gravity: 16, life: 1.0, size: 0.16, drag: 0.7 });
  p.emit({ pos: { x, y: y + 0.2, z }, box: 0.6 * n, count: 14 * n, colors: [0x2a2622, 0x3b3530, 0x4a4238], speed: 1.2, dir: { x: 0, y: 1.2, z: 0 }, gravity: -0.6, life: 1.6, size: 0.45, alpha: 0.55, drag: 0.5 });
  if (purple) p.emit({ pos: { x, y: y + 0.3, z }, box: 0.5 * n, count: 30 * n, colors: [0xa040ff, 0x6a20d0, 0xd080ff], additive: true, speed: 2, dir: { x: 0, y: 3.5, z: 0 }, gravity: -1, life: 1.2, size: 0.3 });
  else p.emit({ pos: { x, y: y + 0.3, z }, box: 0.4 * n, count: 8 * n, colors: [0x6aff4a, 0x3ad030], additive: true, speed: 1, dir: { x: 0, y: 2, z: 0 }, gravity: -1, life: 0.9, size: 0.18, alpha: 0.7 });
}

export function coinBurst(game, pos, gold, crystal) {
  const p = game.particles; if (!p) return;
  if (gold) p.emit({ pos, box: 0.2, count: 6 + gold * 4, colors: [0xffd84a, 0xffb020, 0xfff2a0], additive: true, speed: 2.5, spread: 0.6, dir: { x: 0, y: 5, z: 0 }, gravity: 12, life: 1.0, size: 0.22, drag: 0.9 });
  if (crystal) p.emit({ pos, box: 0.2, count: 14 * crystal, colors: [0x7af0ff, 0xb070ff, 0xffffff], additive: true, speed: 2.5, spread: 0.7, dir: { x: 0, y: 5.5, z: 0 }, gravity: 10, life: 1.3, size: 0.26, drag: 0.9 });
}

/** Explosion used when combat.explode is unavailable. */
export function fallbackExplode(game, pos, radius, damage, source, breakBlocks) {
  const p = game.particles, w = game.world;
  game.audio?.play('explosion', { pos, volume: 1 });
  if (p) {
    p.emit({ pos, box: 0.3, count: 50, colors: [0xffe080, 0xff8020, 0xff4010], additive: true, speed: 7, life: 0.5, size: 0.6, gravity: 0, drag: 0.2 });
    p.emit({ pos, box: 0.6, count: 40, colors: [0x2a2622, 0x4a4540, 0x6a6560], speed: 3, dir: { x: 0, y: 2, z: 0 }, life: 2.0, size: 0.9, gravity: -1, alpha: 0.6, drag: 0.4 });
  }
  if (breakBlocks && w) {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy, dz);
      if (d > radius - 0.3) continue;
      const x = Math.floor(pos.x) + dx, y = Math.floor(pos.y) + dy, z = Math.floor(pos.z) + dz;
      const id = w.getBlock(x, y, z);
      if (id === B.AIR || id === B.WATER || id === B.BEDROCK) continue;
      const res = w.hitBlock(x, y, z, 10 * (1 - d / radius) + 1.5, source);
      if (!res.broken) continue;
      const bld = game.village?.buildingAt?.(x, y, z);
      if (bld && bld.damage) try { bld.damage(20, source); } catch (e) { /* ignore */ }
    }
  }
  if (game.entities) for (const e of game.entities.query(pos, radius + 1, (e) => e !== source && e.kind !== 'projectile')) {
    const c = e.center;
    const d = c.distanceTo(pos);
    const f = Math.max(0, 1 - d / (radius + 1));
    const kb = new THREE.Vector3(c.x - pos.x, 0, c.z - pos.z).normalize().multiplyScalar(10 * f);
    kb.y = 5 * f;
    e.damage(damage * f * (e.faction === 'undead' ? 0.5 : 1), source, { kind: 'explosion', knockback: kb });
  }
}

const _v = new THREE.Vector3();
let orbGeo = null;
const MATS = {};
function orbMat(color) {
  if (!MATS[color]) { MATS[color] = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }); }
  return MATS[color];
}

/** Minimal enemy projectile system (updated by the WaveDirector). */
export class EnemyProjectiles {
  constructor(game) { this.game = game; this.list = []; }
  /** type: 'acid' (lobbed arc) | 'shadow' (fast, slightly homing). */
  fire(type, owner, from, target, opts = {}) {
    if (!orbGeo) orbGeo = new THREE.IcosahedronGeometry(1, 0);
    const acid = type === 'acid';
    const color = acid ? 0x66ff33 : 0xb050ff;
    const mesh = new THREE.Mesh(orbGeo, orbMat(color));
    mesh.scale.setScalar(acid ? 0.16 : 0.2);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    const vel = new THREE.Vector3();
    const tgt = target.clone ? target.clone() : new THREE.Vector3(target.x, target.y, target.z);
    if (acid) {
      // ballistic lob that lands on the target
      const g = 14;
      const dx = tgt.x - from.x, dz = tgt.z - from.z, dy = tgt.y - from.y;
      const dist = Math.hypot(dx, dz);
      const T = Math.max(0.5, Math.min(1.6, dist / 9));
      vel.set(dx / T, (dy + 0.5 * g * T * T) / T, dz / T);
    } else {
      vel.subVectors(tgt, from).normalize().multiplyScalar(opts.speed || 12);
    }
    this.list.push({ type, owner, mesh, vel, life: acid ? 3 : 4, damage: opts.damage ?? 8, homing: opts.homing || null, color, trail: 0 });
    this.game.audio?.play(acid ? 'zombie_spit' : 'frost_cast', { pos: from, pitch: acid ? 1 : 0.55, volume: 0.8 });
  }
  update(dt) {
    const game = this.game, w = game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      const pos = p.mesh.position;
      if (p.type === 'acid') p.vel.y -= 14 * dt;
      else if (p.homing && !p.homing.dead) {
        _v.copy(p.homing.center).sub(pos).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(_v, Math.min(1, dt * 1.6));
      }
      pos.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 7; p.mesh.rotation.y += dt * 5;
      p.trail -= dt;
      if (p.trail <= 0 && game.particles) {
        p.trail = 0.03;
        game.particles.emit({ pos, count: 2, color: p.color, additive: true, speed: 0.3, life: 0.4, size: p.type === 'acid' ? 0.18 : 0.28, gravity: p.type === 'acid' ? 3 : -0.5 });
      }
      let hit = null;
      if (w && w.isSolid(pos.x, pos.y, pos.z)) hit = 'block';
      let ent = null;
      if (!hit && game.entities) {
        ent = game.entities.nearest(pos, (e) => e.faction === 'village' && e.kind !== 'projectile', 1.2);
        if (ent) { const c = ent.center; if (Math.abs(c.y - pos.y) < ent.height * 0.6 + 0.3) hit = 'entity'; else ent = null; }
      }
      if (hit || p.life <= 0) {
        this._impact(p, pos, ent, hit === 'block');
        game.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
  _impact(p, pos, ent, block) {
    const game = this.game;
    const acid = p.type === 'acid';
    game.particles?.emit({ pos, box: 0.2, count: 18, colors: acid ? [0x66ff33, 0xaaff55, 0x33aa22] : [0xb050ff, 0xe0a0ff, 0x6020c0], additive: true, speed: 3, life: 0.6, size: 0.25, gravity: acid ? 8 : -1 });
    game.audio?.play(acid ? 'splash' : 'frost_impact', { pos, pitch: acid ? 1.3 : 0.6, volume: 0.6 });
    // splash damage
    const r = acid ? 1.8 : 1.4;
    for (const e of game.entities?.query(pos, r + 0.6, (e) => e.faction === 'village' && e.kind !== 'projectile') || []) {
      e.damage(p.damage * (e === ent ? 1 : 0.5), p.owner, { kind: acid ? 'poison' : 'arcane' });
      if (acid) e.slowTimer = Math.max(e.slowTimer || 0, 1.2);
    }
    if (block && game.world) {
      const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
      const bld = game.village?.buildingAt?.(x, y, z);
      if (bld && bld.damage) try { bld.damage(p.damage * 0.8, p.owner); } catch (e) { /* ignore */ }
      if (acid) game.world.hitBlock(x, y, z, 0.8, p.owner);
    }
  }
  clear() { for (const p of this.list) this.game.scene.remove(p.mesh); this.list.length = 0; }
}
