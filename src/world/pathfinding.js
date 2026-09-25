// A* over walkable voxel cells. Moves: 4 horizontal neighbours (+ diagonals when both sides free),
// step up 1, drop down up to 3. Returns list of cell positions {x,y,z} (feet cells) or null.
import { SOLID } from './World.js';
import { B } from '../core/blocks.js';

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    const n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mf = last.f;
        if (l < n && a[l].f < mf) { m = l; mf = a[l].f; }
        if (r < n && a[r].f < mf) { m = r; }
        if (m < 0) break;
        a[i] = a[m]; i = m;
      }
      a[i] = last;
    }
    return top;
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function findPath(world, from, to, opts = {}) {
  const maxNodes = opts.maxNodes || 3000;
  const range = opts.range || 0;           // accept arriving within this horizontal distance of goal
  const allowWater = opts.allowWater !== false;
  const size = world.size;
  const solid = (x, y, z) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return true;
    return SOLID[world.getBlock(x, y, z)] === 1;
  };
  const passable = (x, y, z) => !solid(x, y, z) && !solid(x, y + 1, z);
  const standable = (x, y, z) => passable(x, y, z) && (solid(x, y - 1, z) || (allowWater && world.getBlock(x, y - 1, z) === B.WATER));
  const fx = Math.floor(from.x), fz = Math.floor(from.z);
  let fy = Math.floor(from.y);
  if (!standable(fx, fy, fz)) { if (standable(fx, fy + 1, fz)) fy++; else if (standable(fx, fy - 1, fz)) fy--; }
  const tx = Math.floor(to.x), ty = Math.floor(to.y), tz = Math.floor(to.z);
  const key = (x, y, z) => (y * size + z) * size + x;
  const h = (x, y, z) => { const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz) + Math.abs(y - ty) * 0.5; };
  const open = new Heap();
  const nodes = new Map();
  const start = { x: fx, y: fy, z: fz, g: 0, f: h(fx, fy, fz), parent: null, closed: false };
  nodes.set(key(fx, fy, fz), start);
  open.push(start);
  let best = start, expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.closed) continue;
    cur.closed = true;
    const dxg = cur.x - tx, dzg = cur.z - tz;
    if ((cur.x === tx && cur.z === tz && Math.abs(cur.y - ty) <= 1) || (range && dxg * dxg + dzg * dzg <= range * range && Math.abs(cur.y - ty) <= 2)) return build(cur);
    if (cur.f - cur.g < best.f - best.g) best = cur;
    if (++expanded > maxNodes) break;
    for (let d = 0; d < 8; d++) {
      const [dx, dz] = DIRS[d];
      const nx = cur.x + dx, nz = cur.z + dz;
      if (d >= 4 && (!passable(cur.x + dx, cur.y, cur.z) || !passable(cur.x, cur.y, cur.z + dz))) continue;
      let ny = -999;
      if (standable(nx, cur.y, nz)) ny = cur.y;
      else if (d < 4 && standable(nx, cur.y + 1, nz) && !solid(cur.x, cur.y + 2, cur.z)) ny = cur.y + 1;
      else if (passable(nx, cur.y, nz)) {
        for (let k = 1; k <= 3; k++) if (standable(nx, cur.y - k, nz)) { ny = cur.y - k; break; } else if (!passable(nx, cur.y - k, nz)) break;
      }
      if (ny === -999) continue;
      const k2 = key(nx, ny, nz);
      let n = nodes.get(k2);
      const inWater = world.getBlock(nx, ny, nz) === B.WATER;
      const g = cur.g + (d >= 4 ? 1.414 : 1) + (ny > cur.y ? 0.6 : 0) + (inWater ? 3 : 0);
      if (n && (n.closed || n.g <= g)) continue;
      if (!n) { n = { x: nx, y: ny, z: nz, g, f: 0, parent: cur, closed: false }; nodes.set(k2, n); }
      n.g = g; n.parent = cur; n.f = g + h(nx, ny, nz) * 1.1;
      open.push(n);
    }
  }
  return opts.partial ? build(best) : null;
}

function build(n) {
  const path = [];
  while (n) { path.push({ x: n.x, y: n.y, z: n.z }); n = n.parent; }
  path.reverse();
  return path;
}
