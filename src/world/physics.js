// Axis-separated AABB vs voxel collision. entity: position (feet), velocity, radius, height.
import { B, LEAF_BLOCKS, LOG_BLOCKS, WATER_IDS } from '../core/blocks.js';
import { waterFlow } from './waterShape.js';
import { SOLID } from './World.js';

const LEAF = new Uint8Array(256);
for (const id of LEAF_BLOCKS) LEAF[id] = 1;

const NO_VILLAGER_STEP = new Uint8Array(256);
for (const id of LOG_BLOCKS) NO_VILLAGER_STEP[id] = 1;
NO_VILLAGER_STEP[B.FENCE] = 1;
NO_VILLAGER_STEP[B.ELECTRIC_FENCE] = 1;
NO_VILLAGER_STEP[B.PALISADE] = 1;
NO_VILLAGER_STEP[B.HAY_BALE] = 1;
NO_VILLAGER_STEP[B.WORKBENCH] = 1;
NO_VILLAGER_STEP[B.FURNACE] = 1;
NO_VILLAGER_STEP[B.ARCANE_TABLE] = 1;

export const GRAVITY = 28;
const _flow = { x: 0, z: 0, fall: false };

/** foliage = true: leaves don't block — everyone walks through tree crowns (slowed a little) instead of getting caught. */
export function collides(world, px, py, pz, r, h, foliage = false) {
  const x0 = Math.floor(px - r), x1 = Math.floor(px + r - 1e-4);
  const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-4);
  const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r - 1e-4);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
    if (world.isSolidForCollision(x, y, z) && !(foliage && LEAF[world.getBlock(x, y, z)])) return true;
  return false;
}

function canStepUp(world, nx, py, pz, r, h, fo, e) {
  if (collides(world, nx, py + 1.01, pz, r, h, fo)) return false;
  if (e?.kind !== 'villager') return true;
  const vil = e.village;
  const y = Math.floor(py + 0.1);
  const x0 = Math.floor(nx - r), x1 = Math.floor(nx + r - 1e-4);
  const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r - 1e-4);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const id = world.getBlock(x, y, z);
    if (NO_VILLAGER_STEP[id]) return false;
    if (vil?.cellIndex && world.index) {
      const cell = vil.cellIndex.get(world.index(x, y, z));
      if (cell && cell.b.blocks[cell.i]?.dy >= 1) return false;
    }
  }
  return true;
}

/** If an entity's horizontal AABB is already overlapping a solid block, nudge it out to the nearest clear offset. */
function depenetrateHorizontal(world, p, r, h, fo) {
  if (!collides(world, p.x, p.y + 0.05, p.z, r, h - 0.1, fo)) return;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let dist = 0.08; dist <= 0.72; dist += 0.08) {
    for (const [dx, dz] of dirs) {
      const len = Math.hypot(dx, dz);
      const tx = p.x + (dx / len) * dist;
      const tz = p.z + (dz / len) * dist;
      if (!collides(world, tx, p.y + 0.05, tz, r, h - 0.1, fo)) {
        p.x = tx;
        p.z = tz;
        return;
      }
    }
  }
}

export function moveEntity(world, e, dt) {
  const r = e.radius, h = e.height, fo = e.passFoliage !== false;
  const isVillager = e.kind === 'villager';
  const p = e.position, v = e.velocity;
  const feet = world.getBlock(p.x, p.y + 0.1, p.z), body = world.getBlock(p.x, p.y + h * 0.6, p.z);
  // lava is a thick liquid that sets you on fire
  e.inLava = feet === B.LAVA || body === B.LAVA;
  e.inWater = WATER_IDS[feet] === 1 || WATER_IDS[body] === 1 || e.inLava;
  if (e.inLava && !e.dead && e.damage) {
    e.burnTimer = Math.max(e.burnTimer || 0, 4);
    e._lavaAcc = (e._lavaAcc || 0) + dt;
    if (e._lavaAcc > 0.5) { e._lavaAcc = 0; e.damage(7, null, { kind: 'fire' }); }
  }
  e.headInWater = WATER_IDS[world.getBlock(p.x, p.y + h * 0.9, p.z)] === 1;
  // pushing through leaves is a bit slower for non-villagers
  e.inFoliage = fo && (LEAF[feet] || LEAF[body]) === 1;
  const hs = (e.inFoliage && !isVillager) ? 0.7 : 1;
  if (!e.flying) {
    if (e.inWater) {
      v.y -= GRAVITY * 0.25 * dt; v.y = Math.max(v.y, -3); v.x *= Math.pow(0.2, dt); v.z *= Math.pow(0.2, dt);
      // currents carry swimmers along (and waterfalls push them down), like flowing water in Minecraft
      if (!e.inLava && WATER_IDS[feet]) {
        const fx = Math.floor(p.x), fy = Math.floor(p.y + 0.1), fz = Math.floor(p.z);
        const f = waterFlow((x, y, z) => world.getBlock(x, y, z), (id) => SOLID[id], fx, fy, fz, _flow);
        const len = Math.hypot(f.x, f.z);
        if (len > 0.01) { const k = Math.min(1, len) * 9 * dt / len; v.x += f.x * k; v.z += f.z * k; }
        if (feet === B.WATER_FALL) v.y -= 14 * dt;
      }
    }
    else v.y -= GRAVITY * dt;
    v.y = Math.max(v.y, -50);
  }
  // ladders: no falling, climb while pushing forward / jumping, slide down slowly otherwise
  e.onLadder = !e.flying && (world.getBlock(p.x, p.y + 0.2, p.z) === B.LADDER || world.getBlock(p.x, p.y + 1.1, p.z) === B.LADDER);
  if (e.onLadder) {
    if (e.climb) v.y = 3.6;
    else if (e.sneak) v.y = 0;
    else v.y = Math.max(v.y, -2.2);
  }
  const wasOnGround = e.onGround;
  e.onGround = false;
  e.hitWall = false;
  // Y
  let ny = p.y + v.y * dt;
  if (collides(world, p.x, ny, p.z, r, h, fo)) {
    if (v.y < 0) { ny = Math.floor(ny) + 1; e.onGround = true; if (e.onLand && v.y < -8) e.onLand(-v.y); }
    else { ny = Math.floor(ny + h) - h - 1e-3; }
    v.y = 0;
  }
  p.y = ny;
  // X
  let nx = p.x + v.x * dt * hs;
  if (nx !== p.x && collides(world, nx, p.y, p.z, r, h, fo)) {
    if (e.autoStep && (wasOnGround || e.inWater) && canStepUp(world, nx, p.y, p.z, r, h, fo, e) && !collides(world, p.x, p.y + 1.01, p.z, r, h, fo)) {
      p.y += 1.01;
      v.y = Math.max(v.y, 0);
    } else {
      const candX = v.x > 0 ? Math.floor(nx + r) - r - 1e-3 : Math.floor(nx - r) + 1 + r + 1e-3;
      if ((v.x > 0 ? (candX >= p.x - 1e-4 && candX <= nx) : (candX <= p.x + 1e-4 && candX >= nx)) && !collides(world, candX, p.y, p.z, r, h, fo)) {
        nx = candX;
      } else {
        depenetrateHorizontal(world, p, r, h, fo);
        nx = p.x + v.x * dt * hs;
        if (collides(world, nx, p.y, p.z, r, h, fo)) nx = p.x;
      }
      v.x = 0;
      e.hitWall = true;
    }
  }
  p.x = nx;
  // Z
  let nz = p.z + v.z * dt * hs;
  if (nz !== p.z && collides(world, p.x, p.y, nz, r, h, fo)) {
    if (e.autoStep && (wasOnGround || e.inWater) && canStepUp(world, p.x, p.y, nz, r, h, fo, e) && !collides(world, p.x, p.y + 1.01, p.z, r, h, fo)) {
      p.y += 1.01;
      v.y = Math.max(v.y, 0);
    } else {
      const candZ = v.z > 0 ? Math.floor(nz + r) - r - 1e-3 : Math.floor(nz - r) + 1 + r + 1e-3;
      if ((v.z > 0 ? (candZ >= p.z - 1e-4 && candZ <= nz) : (candZ <= p.z + 1e-4 && candZ >= nz)) && !collides(world, p.x, p.y, candZ, r, h, fo)) {
        nz = candZ;
      } else {
        depenetrateHorizontal(world, p, r, h, fo);
        nz = p.z + v.z * dt * hs;
        if (collides(world, p.x, p.y, nz, r, h, fo)) nz = p.z;
      }
      v.z = 0;
      e.hitWall = true;
    }
  }
  p.z = nz;
  // safety: fell out of the world
  if (p.y < -10) { p.y = world.surfaceY(p.x, p.z) + 1; v.set(0, 0, 0); }
}
