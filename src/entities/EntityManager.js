export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  add(e) {
    this.list.push(e);
    if (e.object3d && !e.object3d.parent) this.game.scene.add(e.object3d);
    return e;
  }
  remove(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (e.object3d && e.object3d.parent) e.object3d.parent.remove(e.object3d);
    e.dispose?.();
  }
  byKind(kind) { return this.list.filter(e => e.kind === kind && !e.dead); }
  query(pos, radius, filter) {
    const r2 = radius * radius, out = [];
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.position.x - pos.x, dy = (e.position.y + e.height * 0.5) - pos.y, dz = e.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2 && (!filter || filter(e))) out.push(e);
    }
    return out;
  }
  nearest(pos, filter, maxDist = Infinity) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.list) {
      if (e.dead || (filter && !filter(e))) continue;
      const dx = e.position.x - pos.x, dy = e.position.y - pos.y, dz = e.position.z - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** Ray vs entity capsules (approximated as vertical cylinders). Returns {entity, dist} or null. */
  raycast(origin, dir, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const e of this.list) {
      if (e.dead || (filter && !filter(e))) continue;
      const t = rayCylinder(origin, dir, e.position, e.radius + 0.1, e.height);
      if (t !== null && t < bd) { bd = t; best = e; }
    }
    return best ? { entity: best, dist: bd } : null;
  }
  update(dt) {
    const now = this.game.time;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      try { e.update(dt); } catch (err) { console.error('entity update failed', e.kind, err); e.dead = true; e.removeAt = 0; }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead && e.kind !== 'player' && now >= e.removeAt) this.remove(e);
    }
  }
}

function rayCylinder(o, d, base, r, h) {
  // horizontal circle intersection then clamp to height
  const ox = o.x - base.x, oz = o.z - base.z;
  const a = d.x * d.x + d.z * d.z;
  let t0, t1;
  if (a < 1e-8) { if (ox * ox + oz * oz > r * r) return null; t0 = -Infinity; t1 = Infinity; }
  else {
    const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c; if (disc < 0) return null;
    const s = Math.sqrt(disc); t0 = (-b - s) / (2 * a); t1 = (-b + s) / (2 * a);
  }
  // vertical slab
  let y0, y1;
  if (Math.abs(d.y) < 1e-8) { if (o.y < base.y || o.y > base.y + h) return null; y0 = -Infinity; y1 = Infinity; }
  else { const ta = (base.y - o.y) / d.y, tb = (base.y + h - o.y) / d.y; y0 = Math.min(ta, tb); y1 = Math.max(ta, tb); }
  const tn = Math.max(t0, y0, 0), tf = Math.min(t1, y1);
  return tn <= tf ? tn : null;
}
