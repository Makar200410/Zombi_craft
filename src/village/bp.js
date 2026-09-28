// Blueprint builder used by the building designs (local coords, see buildings.js).
import { B } from '../core/blocks.js';

export class BP {
  constructor(w, d) { this.w = w; this.d = d; this.cells = new Map(); this.pts = {}; this.plots = []; this.quarry = null; }
  k(x, y, z) { return x + ',' + y + ',' + z; }
  set(x, y, z, id) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d || y < 0) return this;
    if (id === B.AIR) this.cells.delete(this.k(x, y, z)); else this.cells.set(this.k(x, y, z), { dx: x, dy: y, dz: z, id });
    return this;
  }
  get(x, y, z) { const c = this.cells.get(this.k(x, y, z)); return c ? c.id : B.AIR; }
  del(x, y, z) { this.cells.delete(this.k(x, y, z)); return this; }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
    return this;
  }
  /** perimeter walls of a rectangle */
  ring(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, y, z, id);
    return this;
  }
  posts(x0, z0, x1, z1, y0, y1, id) { for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.box(x, y0, z, x, y1, z, id); return this; }
  /** Stepped gable roof with its ridge along X. Gable end walls (triangles) filled at x = ex0 / ex1 with endId. */
  gableX(x0, x1, z0, z1, y0, id, endId, ex0, ex1, ridgeId) {
    for (let k = 0; z0 + k <= z1 - k; k++) {
      const y = y0 + k, za = z0 + k, zb = z1 - k;
      const rid = za === zb || za + 1 === zb;
      for (let x = x0; x <= x1; x++) { this.set(x, y, za, rid && ridgeId ? ridgeId : id); this.set(x, y, zb, rid && ridgeId ? ridgeId : id); }
      if (k >= 1 && endId) for (let z = za + 1; z <= zb - 1; z++) { this.set(ex0, y, z, endId); this.set(ex1, y, z, endId); }
    }
    return this;
  }
  gableZ(x0, x1, z0, z1, y0, id, endId, ez0, ez1, ridgeId) {
    for (let k = 0; x0 + k <= x1 - k; k++) {
      const y = y0 + k, xa = x0 + k, xb = x1 - k;
      const rid = xa === xb || xa + 1 === xb;
      for (let z = z0; z <= z1; z++) { this.set(xa, y, z, rid && ridgeId ? ridgeId : id); this.set(xb, y, z, rid && ridgeId ? ridgeId : id); }
      if (k >= 1 && endId) for (let x = xa + 1; x <= xb - 1; x++) { this.set(x, y, ez0, endId); this.set(x, y, ez1, endId); }
    }
    return this;
  }
  point(name, x, y, z) { (this.pts[name] || (this.pts[name] = [])).push({ dx: x, dy: y, dz: z }); return this; }
}
