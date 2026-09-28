// Axis-separated AABB vs voxel collision. entity: position (feet), velocity, radius, height.
import { B, LEAF_BLOCKS } from '../core/blocks.js';

const LEAF = new Uint8Array(256);
for (const id of LEAF_BLOCKS) LEAF[id] = 1;

export const GRAVITY = 28;

/** foliage = true: leaves don't block — everyone walks through tree crowns (slowed a little) instead of getting caught. */
export function collides(world, px, py, pz, r, h, foliage = false) {
  const x0 = Math.floor(px - r), x1 = Math.floor(px + r - 1e-4);
  const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-4);
  const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r - 1e-4);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
    if (world.isSolidForCollision(x, y, z) && !(foliage && LEAF[world.getBlock(x, y, z)])) return true;
  return false;
}

export function moveEntity(world, e, dt) {
  const r = e.radius, h = e.height, fo = e.passFoliage !== false;
  const p = e.position, v = e.velocity;
  const feet = world.getBlock(p.x, p.y + 0.1, p.z), body = world.getBlock(p.x, p.y + h * 0.6, p.z);
  e.inWater = feet === B.WATER || body === B.WATER;
  e.headInWater = world.getBlock(p.x, p.y + h * 0.9, p.z) === B.WATER;
  // pushing through leaves is a bit slower
  e.inFoliage = fo && (LEAF[feet] || LEAF[body]) === 1;
  const hs = e.inFoliage ? 0.7 : 1;
  if (!e.flying) {
    if (e.inWater) { v.y -= GRAVITY * 0.25 * dt; v.y = Math.max(v.y, -3); v.x *= Math.pow(0.2, dt); v.z *= Math.pow(0.2, dt); }
    else v.y -= GRAVITY * dt;
    v.y = Math.max(v.y, -50);
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
  if (collides(world, nx, p.y, p.z, r, h, fo)) {
    if (e.autoStep && (wasOnGround || e.inWater) && !collides(world, nx, p.y + 1.01, p.z, r, h, fo) && !collides(world, p.x, p.y + 1.01, p.z, r, h, fo)) { p.y += 1.01; v.y = Math.max(v.y, 0); }
    else { nx = v.x > 0 ? Math.floor(nx + r) - r - 1e-3 : Math.floor(nx - r) + 1 + r + 1e-3; v.x = 0; e.hitWall = true; }
  }
  p.x = nx;
  // Z
  let nz = p.z + v.z * dt * hs;
  if (collides(world, p.x, p.y, nz, r, h, fo)) {
    if (e.autoStep && (wasOnGround || e.inWater) && !collides(world, p.x, p.y + 1.01, nz, r, h, fo) && !collides(world, p.x, p.y + 1.01, p.z, r, h, fo)) { p.y += 1.01; v.y = Math.max(v.y, 0); }
    else { nz = v.z > 0 ? Math.floor(nz + r) - r - 1e-3 : Math.floor(nz - r) + 1 + r + 1e-3; v.z = 0; e.hitWall = true; }
  }
  p.z = nz;
  // safety: fell out of the world
  if (p.y < -10) { p.y = world.surfaceY(p.x, p.z) + 1; v.set(0, 0, 0); }
}
