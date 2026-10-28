// Far terrain (the land beyond the loaded chunks): samples the generator's height and biome on a coarse grid
// around a centre and turns it into a coloured heightmap mesh (positions, colours, normals). Runs in its own
// worker with its own copy of the generator, so the horizon never costs the main thread anything.
import { World } from './World.js';
import { B } from '../core/blocks.js';
import { hash2 } from '../core/rng.js';

let w = null, gen = null, sea = 0;

const C = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const TOP = {
  [B.GRASS]: C(0x5f9a3c), [B.DRY_GRASS]: C(0xa6a04e), [B.SAND]: C(0xd8cb93), [B.RED_SAND]: C(0xb4683c),
  [B.SNOW]: C(0xeaf0f5), [B.STONE]: C(0x8a8a8a), [B.DIRT]: C(0x7b5a3b), [B.MUD]: C(0x544736), [B.GRAVEL]: C(0x8a837e),
};
const LEAVES = { 1: C(0x3c6e2b), 5: C(0x6c9a45), 2: C(0x32563a), 8: C(0x4a6339), 9: C(0x3a5a46) };
const BLIGHT = C(0x8c8466), WATER = C(0x3d6fbf), DEEP = C(0x1f3f80), STONE = C(0x8a8a8a);

/** Shown height (top of the surface, tree tops in forests) and colour of the column at x, z. */
function sample(x, z, out) {
  const c = gen.column(x, z), h = c.h, b = c.b;
  let y = h + 1, col;
  if (h < sea) {
    const k = Math.min(1, (sea - h) / 14);
    out[0] = WATER[0] + (DEEP[0] - WATER[0]) * k; out[1] = WATER[1] + (DEEP[1] - WATER[1]) * k; out[2] = WATER[2] + (DEEP[2] - WATER[2]) * k;
    out[3] = sea + 0.9;
    return;
  }
  const top = gen.surfaceTop(x, z, h, b);
  col = b === 4 ? BLIGHT : TOP[top] || STONE;
  // tree canopies: forests read as a dark, raised mass, as they do from afar in the game
  const leafy = top === B.GRASS || top === B.SNOW || top === B.MUD || top === B.DRY_GRASS;
  if (leafy && LEAVES[b] && c.dist > 30) {
    const dense = b === 1 || b === 5 ? 1 : b === 2 ? 0.8 : 0.55;
    const k = dense * (0.75 + 0.25 * hash2(x >> 2, z >> 2, 911));
    const L = LEAVES[b];
    col = [col[0] + (L[0] - col[0]) * k, col[1] + (L[1] - col[1]) * k, col[2] + (L[2] - col[2]) * k];
    y += (b === 2 ? 5 : 4.5) * k;
  }
  const j = 0.92 + 0.16 * hash2(x, z, 404);
  out[0] = col[0] * j; out[1] = col[1] * j; out[2] = col[2] * j; out[3] = y;
}

onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    w = new World(null, { size: m.size, seed: m.seed, height: m.height, sea: m.sea, format: m.format });
    gen = w._makeGen(); sea = w.sea;
    return;
  }
  if (m.t !== 'level' || !gen) return;
  const { n, step, cx, cz } = m, N1 = n + 1, half = n >> 1, size = w.size;
  const pos = new Float32Array(N1 * N1 * 3), col = new Uint8Array(N1 * N1 * 3), nor = new Float32Array(N1 * N1 * 3);
  const s = [0, 0, 0, 0];
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const dx = (i - half) * step, dz = (j - half) * step;
    const x = Math.max(0, Math.min(size - 1, cx + dx)), z = Math.max(0, Math.min(size - 1, cz + dz));
    sample(x, z, s);
    const v = (j * N1 + i) * 3;
    pos[v] = dx; pos[v + 1] = s[3] - m.drop; pos[v + 2] = dz;
    col[v] = s[0]; col[v + 1] = s[1]; col[v + 2] = s[2];
  }
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const y = (a, b) => pos[(Math.max(0, Math.min(n, b)) * N1 + Math.max(0, Math.min(n, a))) * 3 + 1];
    const gx = (y(i + 1, j) - y(i - 1, j)) / (2 * step), gz = (y(i, j + 1) - y(i, j - 1)) / (2 * step);
    const l = Math.hypot(gx, 1, gz), v = (j * N1 + i) * 3;
    nor[v] = -gx / l; nor[v + 1] = 1 / l; nor[v + 2] = -gz / l;
  }
  postMessage({ t: 'level', id: m.id, lvl: m.lvl, cx, cz, pos, col, nor }, [pos.buffer, col.buffer, nor.buffer]);
};
