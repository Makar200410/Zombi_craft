// Shape of water cells (Minecraft's LiquidBlockRenderer): surface height per level, smoothed corner heights and the
// flow direction. Shared by the mesher (sloped, animated surfaces) and physics (currents push swimmers).
// get(x, y, z) -> block id; solid(id) -> 1 if the block is a solid cube.
import { B, WATER_IDS, WATER_LEVEL } from '../core/blocks.js';

/** Own surface height of a water cell (source 8/9 … level 7 1/9), 0 if not water. */
export function waterHeight(id) {
  const l = WATER_LEVEL[id];
  return l < 0 ? 0 : (8 - l) / 9;
}

/** Height of the water surface at a grid corner (x, z) for the cells of layer y: averaged over the 4 cells around
 *  it, sources weigh more, open air pulls it down, water above makes it full. */
export function cornerHeight(get, solid, x, y, z) {
  let sum = 0, wsum = 0;
  for (let k = 0; k < 4; k++) {
    const cx = x - 1 + (k & 1), cz = z - 1 + (k >> 1);
    const id = get(cx, y, cz);
    if (WATER_IDS[id]) {
      if (WATER_IDS[get(cx, y + 1, cz)]) return 1;
      const h = waterHeight(id), w = WATER_LEVEL[id] === 0 ? 10 : 1;
      sum += h * w; wsum += w;
    } else if (!solid(id)) wsum += 1;
  }
  return wsum ? sum / wsum : 0;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Flow of a water cell: {x, z} direction (unnormalised, strength = length), fall = water pours down here. */
export function waterFlow(get, solid, x, y, z, out = { x: 0, z: 0, fall: false }) {
  out.x = 0; out.z = 0; out.fall = false;
  const id = get(x, y, z);
  if (!WATER_IDS[id]) return out;
  const h0 = waterHeight(id);
  for (const [dx, dz] of DIRS) {
    const n = get(x + dx, y, z + dz);
    let d = 0;
    if (WATER_IDS[n]) d = h0 - waterHeight(n);
    else if (!solid(n)) d = WATER_IDS[get(x + dx, y - 1, z + dz)] || !solid(get(x + dx, y - 1, z + dz)) ? h0 + 0.5 : h0;
    out.x += dx * d; out.z += dz * d;
  }
  // a falling column, or flowing water about to pour over an edge
  const below = get(x, y - 1, z);
  out.fall = id === B.WATER_FALL || (id !== B.WATER && !solid(below) && !WATER_IDS[below]);
  return out;
}
