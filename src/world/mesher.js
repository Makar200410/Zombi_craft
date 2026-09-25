// Builds chunk geometry buffers (world-space positions) with smooth lighting + ambient occlusion.
// Output buckets: solid (opaque + cutout cubes), plants (cross sprites, double sided), water, glass.
import { BLOCKS, B } from '../core/blocks.js';
import { CHUNK, HEIGHT, LIGHT_BLOCKING } from './World.js';

// face: n (normal), u, v (tangent axes, u×v=n), base corner
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1], tile: 'side' },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0], tile: 'side' },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1], tile: 'top' },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0], tile: 'bottom' },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1], tile: 'side' },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0], tile: 'side' },
];
const SHAPE = new Uint8Array(256);   // 0 none, 1 cube, 2 cross, 3 liquid
const RENDER = new Uint8Array(256);  // 0 none, 1 opaque, 2 cutout, 3 transparent
for (const b of BLOCKS) if (b) {
  SHAPE[b.id] = b.shape === 'cube' ? 1 : b.shape === 'cross' ? 2 : b.shape === 'liquid' ? 3 : 0;
  RENDER[b.id] = b.render === 'opaque' ? 1 : b.render === 'cutout' ? 2 : b.render === 'transparent' ? 3 : 0;
}

class Bucket {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.light = []; this.idx = []; this.count = 0; }
  quad(p, n, uvs, l, flip, reverse = false) {
    const c = this.count;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.light.push(l[i * 4], l[i * 4 + 1], l[i * 4 + 2], l[i * 4 + 3]);
    }
    if (reverse) this.idx.push(c, c + 2, c + 1, c, c + 3, c + 2);
    else if (flip) this.idx.push(c + 1, c + 2, c + 3, c + 1, c + 3, c);
    else this.idx.push(c, c + 1, c + 2, c, c + 2, c + 3);
    this.count += 4;
  }
  result() {
    if (!this.count) return null;
    return {
      position: new Float32Array(this.pos), normal: new Float32Array(this.nrm), uv: new Float32Array(this.uv),
      light: new Float32Array(this.light), index: this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

export function meshChunk(world, cx, cz, atlas, opts = {}) {
  const fancyLeaves = opts.fancyLeaves !== false;
  const size = world.size, blocks = world.blocks, light = world.light;
  const solid = new Bucket(), plants = new Bucket(), water = new Bucket(), glass = new Bucket();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const x1 = Math.min(size, x0 + CHUNK), z1 = Math.min(size, z0 + CHUNK);
  const uvCache = new Map();
  const uvOf = (name) => { let r = uvCache.get(name); if (!r) { r = atlas.uv(name); uvCache.set(name, r); } return r; };

  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT || x < 0 || z < 0 || x >= size || z >= size) return 0;
    return blocks[x + size * (z + size * y)];
  };
  const lightAt = (x, y, z) => {
    if (y >= HEIGHT) return 0xF0;
    if (y < 0 || x < 0 || z < 0 || x >= size || z >= size) return 0xF0;
    return light[x + size * (z + size * y)];
  };
  const occ = (x, y, z) => LIGHT_BLOCKING[get(x, y, z)];

  const P = new Array(12), UV = new Array(8), L = new Array(16);
  const aoArr = [0, 0, 0, 0];

  for (let y = 0; y < HEIGHT; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const id = blocks[x + size * (z + size * y)];
    if (id === 0) continue;
    const shape = SHAPE[id], render = RENDER[id];
    const def = BLOCKS[id];
    if (shape === 2) { crossQuads(x, y, z, id, def); continue; }
    const isLiquid = shape === 3;
    const emissive = def.light > 0 && !isLiquid && shape === 1;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      const nb = get(nx, ny, nz);
      // visibility rules
      if (isLiquid) {
        if (nb === id) continue;
        if (LIGHT_BLOCKING[nb]) continue;
        if (f !== 2 && nb !== 0 && SHAPE[nb] === 1 && RENDER[nb] !== 3) continue;
      } else {
        if (LIGHT_BLOCKING[nb]) continue;
        if (nb === id && (render === 3 || (render === 2 && !fancyLeaves))) continue;
      }
      // tile uv
      const t = uvOf(isLiquid ? 'water' : def.tiles[F.tile]);
      // corner positions
      let top = 1;
      if (isLiquid && get(x, y + 1, z) !== id) top = 0.875;
      for (let c = 0; c < 4; c++) {
        const a = (c === 1 || c === 2) ? 1 : 0, b = (c >= 2) ? 1 : 0;
        let px = x + F.base[0] + F.u[0] * a + F.v[0] * b;
        let py = y + F.base[1] + F.u[1] * a + F.v[1] * b;
        let pz = z + F.base[2] + F.u[2] * a + F.v[2] * b;
        if (isLiquid && py > y + 0.5) py = y + top;
        P[c * 3] = px; P[c * 3 + 1] = py; P[c * 3 + 2] = pz;
        UV[c * 2] = a ? t[2] : t[0];
        UV[c * 2 + 1] = b ? t[1] : t[3];
        // AO + smooth light: sample the 4 cells in front of this vertex
        const su0 = a ? F.u[0] : -F.u[0], su1 = a ? F.u[1] : -F.u[1], su2 = a ? F.u[2] : -F.u[2];
        const sv0 = b ? F.v[0] : -F.v[0], sv1 = b ? F.v[1] : -F.v[1], sv2 = b ? F.v[2] : -F.v[2];
        const s1 = occ(nx + su0, ny + su1, nz + su2), s2 = occ(nx + sv0, ny + sv1, nz + sv2);
        const cc = occ(nx + su0 + sv0, ny + su1 + sv1, nz + su2 + sv2);
        const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
        aoArr[c] = ao;
        let sky = 0, blk = 0, cnt = 0;
        const l0 = lightAt(nx, ny, nz); sky += l0 >> 4; blk += l0 & 15; cnt++;
        if (!s1) { const l = lightAt(nx + su0, ny + su1, nz + su2); sky += l >> 4; blk += l & 15; cnt++; }
        if (!s2) { const l = lightAt(nx + sv0, ny + sv1, nz + sv2); sky += l >> 4; blk += l & 15; cnt++; }
        if (!cc && !(s1 && s2)) { const l = lightAt(nx + su0 + sv0, ny + su1 + sv1, nz + su2 + sv2); sky += l >> 4; blk += l & 15; cnt++; }
        L[c * 4] = isLiquid || render === 3 ? 1 : (0.45 + 0.55 * ao / 3);
        L[c * 4 + 1] = sky / cnt / 15;
        L[c * 4 + 2] = blk / cnt / 15;
        L[c * 4 + 3] = emissive ? 2 : (render === 2 ? 0.25 : 0);
      }
      const flip = aoArr[0] + aoArr[2] < aoArr[1] + aoArr[3];
      const bucket = isLiquid ? water : render === 3 ? glass : solid;
      bucket.quad(P, F.n, UV, L, flip);
    }
  }

  function crossQuads(x, y, z, id, def) {
    const t = uvOf(def.tiles.side);
    const l = lightAt(x, y, z);
    const sky = (l >> 4) / 15, blk = (l & 15) / 15;
    const isTorch = id === B.TORCH;
    const inset = isTorch ? 0.35 : 0.15;
    const h = isTorch ? 0.7 : 1;
    // jitter plant position a little for natural look
    const jx = isTorch ? 0 : (((x * 73856093) ^ (z * 19349663)) & 7) / 7 * 0.2 - 0.1;
    const jz = isTorch ? 0 : (((x * 83492791) ^ (z * 2654435761)) & 7) / 7 * 0.2 - 0.1;
    const diag = [[inset, inset, 1 - inset, 1 - inset], [inset, 1 - inset, 1 - inset, inset]];
    for (const d of diag) {
      const ax = x + d[0] + jx, az = z + d[1] + jz, bx = x + d[2] + jx, bz = z + d[3] + jz;
      P[0] = ax; P[1] = y; P[2] = az;
      P[3] = bx; P[4] = y; P[5] = bz;
      P[6] = bx; P[7] = y + h; P[8] = bz;
      P[9] = ax; P[10] = y + h; P[11] = az;
      UV[0] = t[0]; UV[1] = t[3]; UV[2] = t[2]; UV[3] = t[3]; UV[4] = t[2]; UV[5] = t[1]; UV[6] = t[0]; UV[7] = t[1];
      if (isTorch) { UV[5] = t[1] + (t[3] - t[1]) * 0.3; UV[7] = UV[5]; }
      const sway = isTorch ? 0 : 1;
      for (let c = 0; c < 4; c++) { L[c * 4] = c < 2 ? 0.8 : 1; L[c * 4 + 1] = sky; L[c * 4 + 2] = blk; L[c * 4 + 3] = isTorch ? 2 : (c >= 2 ? sway : 0); }
      const nx = bz - az, nz = -(bx - ax); const len = Math.hypot(nx, nz);
      plants.quad(P, [nx / len * 0.3, 0.9, nz / len * 0.3], UV, L, false);
      // back side: same vertices, reversed winding, same (upward) normal so both sides light identically
      plants.quad(P, [-nx / len * 0.3, 0.9, -nz / len * 0.3], UV, L, false, true);
    }
  }

  return { solid: solid.result(), plants: plants.result(), water: water.result(), glass: glass.result() };
}
