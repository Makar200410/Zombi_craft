// Background meshing: builds the geometry of one chunk section off the main thread. The main thread sends the
// slices of the section's chunk and its 8 neighbours (blocks + light, the section's height ± 2 layers); they are
// put into reused full-height arrays so the ordinary mesher (mesher.js) runs on them unchanged.
import { meshChunk } from './mesher.js';

let W = null, atlas = null;
const pool = [];       // 9 × {blocks, light} full-height arrays, reused for every job

onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    W = { size: m.size, height: m.height, chunksX: m.chunksX, cols: {}, lcols: {} };
    const uvs = m.uvs;
    atlas = { uv: (name) => uvs[name] || uvs.stone };
    for (let i = 0; i < 9; i++) pool.push({ blocks: new Uint8Array(256 * m.height), light: new Uint8Array(256 * m.height) });
    return;
  }
  if (m.t !== 'mesh' || !W) return;
  const { cx, cz, sy, ya } = m, N = W.chunksX;
  W.cols = {}; W.lcols = {};
  for (let i = 0; i < 9; i++) {
    if (!m.blocks[i]) continue;
    const dx = (i % 3) - 1, dz = ((i / 3) | 0) - 1, k = (cz + dz) * N + (cx + dx);
    const p = pool[i];
    p.blocks.set(m.blocks[i], 256 * ya); p.light.set(m.light[i], 256 * ya);
    W.cols[k] = p.blocks; W.lcols[k] = p.light;
  }
  const out = meshChunk(W, cx, cz, sy, atlas, m.opts);
  const transfer = [];
  for (const kind of ['solid', 'plants', 'water', 'glass']) {
    const d = out[kind];
    if (d) for (const a of ['position', 'normal', 'uv', 'light', 'index']) transfer.push(d[a].buffer);
  }
  postMessage({ t: 'mesh', key: m.key, data: out }, transfer);
};
