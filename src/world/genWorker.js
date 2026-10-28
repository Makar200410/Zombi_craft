// Background world generation: makes chunk columns off the main thread. The worker keeps its own World (same
// seed, size and format, so the same generator and the same rival sites), generates the asked-for chunk, lights
// it on its own (sky from above, glowing blocks inside it), and hands back the arrays. The main thread only
// stitches the light across the chunk's borders and draws it (see World.requestChunk / _install).
import { World, CHUNK } from './World.js';

let w = null;

onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    w = new World(null, { size: m.size, seed: m.seed, height: m.height, sea: m.sea, format: m.format });
    w.gen = w._makeGen();
    return;
  }
  if (m.t !== 'gen' || !w) return;
  const { cx, cz } = m, N = w.chunksX, k = cz * N + cx;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  w.colAt(x0, z0, true);
  w.gen.generateChunk(cx, cz);
  w.relightBox(x0, z0, x0 + CHUNK - 1, z0 + CHUNK - 1);       // the chunk's own light (no neighbours here)
  const spawners = [], chests = [];
  for (const [i, s] of w.spawners) spawners.push([i, s]);
  for (const [i, t] of w.chestTier) chests.push([i, t]);
  const blocks = w.cols[k], light = w.lcols[k], meta = w.meta[k];
  postMessage({ t: 'chunk', cx, cz, blocks, light, top: meta.top, h: meta.h, b: meta.b, spawners, chests },
    [blocks.buffer, light.buffer, meta.top.buffer, meta.h.buffer, meta.b.buffer]);
  // forget everything: every chunk is made from scratch (generation never depends on neighbours' blocks)
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const kk = (cz + dz) * N + (cx + dx);
    if (kk >= 0 && kk < w.cols.length) { w.cols[kk] = null; w.lcols[kk] = null; w.meta[kk] = null; }
  }
  w.spawners.clear(); w.chestTier.clear(); w.dirty.clear();
};
