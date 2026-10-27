// Tree and plant shapes, shared by the terrain generators and the woodcutters who replant forests.
import { B } from '../core/blocks.js';

// While a deep-world chunk is generated, trees are clipped to it (its neighbours draw their own parts of them).
let CLIP = null;
/** [x0, z0, x1, z1) box trees may write into, or null. */
export function setTreeClip(box) { CLIP = box; }

function put(world, x, y, z, id, onlyAir = true) {
  if (x < 0 || z < 0 || x >= world.size || z >= world.size || y < 0 || y >= world.height) return;
  if (CLIP && (x < CLIP[0] || z < CLIP[1] || x >= CLIP[2] || z >= CLIP[3])) return;
  const cur = world.rawGet(x, y, z);
  if (onlyAir && cur !== B.AIR && cur !== B.TALL_GRASS) return;
  world.rawSet(x, y, z, id);
}

export function oak(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.LOG, false);
  const top = y + h;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy >= 0 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || rnd() < 0.5)) continue;
      put(world, x + dx, top + dy, z + dz, B.LEAVES);
    }
  }
  put(world, x, top + 1, z, B.LEAVES);
}
export function birch(world, x, y, z, rnd) {
  const h = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.BIRCH_LOG, false);
  const top = y + h;
  for (let dy = -3; dy <= 1; dy++) {
    const r = dy >= 0 || dy === -3 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.6) continue;
      put(world, x + dx, top + dy, z + dz, B.BIRCH_LEAVES);
    }
  }
}
export function spruce(world, x, y, z, rnd) {
  const h = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.SPRUCE_LOG, false);
  let r = 2;
  for (let yy = y + 2; yy <= y + h + 1; yy++) {
    const rr = Math.max(0, r);
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 1 : 0)) continue;
      put(world, x + dx, yy, z + dz, B.SPRUCE_LEAVES);
    }
    r = (yy - y) % 2 === 0 ? r - 1 : r; if (r < 0) r = 1;
    if (yy > y + h - 2) r = 0;
  }
  put(world, x, y + h + 1, z, B.SPRUCE_LEAVES);
  put(world, x, y + h + 2, z, B.SPRUCE_LEAVES);
}
/** Savanna acacia: a leaning trunk that forks into flat, wide canopies. */
export function acacia(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 2);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [ax, az] = dirs[Math.floor(rnd() * 4)];
  let tx = x, tz = z;
  for (let i = 0; i < h; i++) {
    if (i >= 2 && i < h - 1 && rnd() < 0.6) { tx += ax; tz += az; }
    put(world, tx, y + i, tz, B.LOG, false);
  }
  const canopy = (cx, cy, cz, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      put(world, cx + dx, cy, cz + dz, B.ACACIA_LEAVES);
    }
    for (let dx = -r + 1; dx <= r - 1; dx++) for (let dz = -r + 1; dz <= r - 1; dz++) if (Math.abs(dx) + Math.abs(dz) < r) put(world, cx + dx, cy + 1, cz + dz, B.ACACIA_LEAVES);
  };
  canopy(tx, y + h, tz, 3);
  if (rnd() < 0.6) {
    const bx = x - ax * 2, bz = z - az * 2;
    put(world, x - ax, y + 2, z - az, B.LOG, false); put(world, bx, y + 3, bz, B.LOG, false);
    canopy(bx, y + 4, bz, 2);
  }
}
/** Swamp oak: an oak with a wide, drooping crown. */
export function swampOak(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.LOG, false);
  const top = y + h;
  for (let dy = -1; dy <= 1; dy++) {
    const r = dy === 1 ? 1 : 3;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      if (dy === -1 && Math.abs(dx) < 3 && Math.abs(dz) < 3) continue;
      put(world, x + dx, top + dy, z + dz, B.LEAVES);
    }
  }
  // hanging curtains of leaves
  for (let k = 0; k < 8; k++) {
    const a = rnd() * Math.PI * 2, hx = x + Math.round(Math.cos(a) * 3), hz = z + Math.round(Math.sin(a) * 3);
    const L = 1 + Math.floor(rnd() * 3);
    for (let i = 1; i <= L; i++) put(world, hx, top - 1 - i, hz, B.LEAVES);
  }
}
/** A cactus column. */
export function cactus(world, x, y, z, h) {
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.CACTUS);
}
