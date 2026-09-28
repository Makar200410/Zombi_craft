// Era architecture. Every age builds with its own blocks and its own forms, and buildings grow with the ages:
// a stone-age wattle hut becomes a mud-brick house, a log cabin, a half-timbered house, a stucco townhouse,
// a brick terrace, an art-deco block, a prefab tower, a glass tower and finally a singularity spire.
// Designs keep the footprint and the door / work points of their type, so a building can be rebuilt in place.
import { B } from '../core/blocks.js';
import { BP } from './bp.js';

const AIR = B.AIR;
const SH = 3;              // storey height: two wall rows + a floor band

/** Materials and forms of each tier (1 stone age … 10 singularity). */
export const ERAS = [null,
  { t: 1, yard: B.GRASS, pave: B.PATH, floor: B.PATH, base: B.WATTLE, wall: B.WATTLE, up: B.WATTLE, post: B.LOG, band: B.LOG, roof: B.THATCH, gableEnd: B.WATTLE, ridge: B.LOG, win: AIR, winRows: 'upper', light: B.TORCH, trim: B.HIDE, chim: B.COBBLESTONE, fence: B.LOG, roofKind: 'cone', crate: B.HAY_BALE },
  { t: 2, yard: B.GRASS, pave: B.PATH, floor: B.SANDSTONE, base: B.SANDSTONE, wall: B.MUDBRICK, up: B.MUDBRICK, post: B.SANDSTONE, band: B.SANDSTONE, roof: B.MUDBRICK, gableEnd: B.MUDBRICK, ridge: B.SANDSTONE, win: AIR, winRows: 'upper', light: B.TORCH, trim: B.BRONZE_BLOCK, chim: B.MUDBRICK, fence: B.MUDBRICK, roofKind: 'flat', crate: B.HAY_BALE, beam: B.LOG },
  { t: 3, yard: B.GRASS, pave: B.GRAVEL, floor: B.PLANKS, base: B.COBBLESTONE, wall: B.LOG, up: B.LOG, post: B.SPRUCE_LOG, band: B.PLANKS, roof: B.SHINGLES, gableEnd: B.PLANKS, ridge: B.LOG, win: AIR, winRows: 'upper', light: B.TORCH, trim: B.IRON_BLOCK, chim: B.COBBLESTONE, fence: B.PALISADE, roofKind: 'gable', crate: B.PLANKS },
  { t: 4, yard: B.GRASS, pave: B.COBBLESTONE, floor: B.PLANKS, base: B.STONE_BRICKS, wall: B.PLASTER, up: B.TIMBER_FRAME, post: B.SPRUCE_LOG, band: B.PLANKS, roof: B.ROOF_TILES, gableEnd: B.PLASTER, ridge: B.STONE_BRICKS, win: B.GLASS, winRows: 'upper', light: B.LANTERN, trim: B.BANNER, chim: B.STONE_BRICKS, fence: B.PLANKS, roofKind: 'gable', crate: B.PLANKS },
  { t: 5, yard: B.GRASS, pave: B.STONE_BRICKS, floor: B.MARBLE, base: B.MARBLE, wall: B.STUCCO, up: B.STUCCO, post: B.MARBLE, band: B.MARBLE, roof: B.SLATE, gableEnd: B.STUCCO, ridge: B.BRONZE_BLOCK, win: B.GLASS, winRows: 'upper', light: B.LANTERN, trim: B.BRONZE_BLOCK, chim: B.MARBLE, fence: B.MARBLE, roofKind: 'mansard', crate: B.BOOKSHELF },
  { t: 6, yard: B.GRASS, pave: B.DARK_STONE, floor: B.PLANKS, base: B.DARK_STONE, wall: B.BRICK, up: B.BRICK, post: B.BRICK, band: B.STONE_BRICKS, roof: B.CORRUGATED, gableEnd: B.BRICK, ridge: B.CAST_IRON, win: B.WINDOW, winRows: 'upper', light: B.LANTERN, trim: B.CAST_IRON, chim: B.BRICK, fence: B.CAST_IRON, roofKind: 'gable', crate: B.CORRUGATED },
  { t: 7, yard: B.GRASS, pave: B.CONCRETE, floor: B.CONCRETE, base: B.DARK_STONE, wall: B.CONCRETE, up: B.CONCRETE, post: B.COPPER_ROOF, band: B.CONCRETE, roof: B.COPPER_ROOF, gableEnd: B.CONCRETE, ridge: B.BRONZE_BLOCK, win: B.WINDOW, winRows: 'both', light: B.LAMP, trim: B.BRONZE_BLOCK, chim: B.CONCRETE, fence: B.CONCRETE, roofKind: 'crown', crate: B.IRON_BLOCK },
  { t: 8, yard: B.GRASS, pave: B.CONCRETE, floor: B.CONCRETE, base: B.CONCRETE, wall: B.PREFAB, up: B.PREFAB, post: B.STEEL_BLOCK, band: B.CONCRETE, roof: B.CONCRETE, gableEnd: B.PREFAB, ridge: B.STEEL_BLOCK, win: B.WINDOW, winRows: 'both', light: B.LAMP, trim: B.HAZARD, chim: B.STEEL_BLOCK, fence: B.STEEL_BLOCK, roofKind: 'tech', crate: B.HAZARD, floors: true },
  { t: 9, yard: B.GRASS, pave: B.CONCRETE, floor: B.ALUMINUM, base: B.ALUMINUM, wall: B.GLASS_BLUE, up: B.GLASS_BLUE, post: B.ALUMINUM, band: B.ALUMINUM, roof: B.ALUMINUM, gableEnd: B.ALUMINUM, ridge: B.ALUMINUM, win: B.GLASS_BLUE, winRows: 'curtain', light: B.LED, trim: B.SERVER, chim: B.ALUMINUM, fence: B.ALUMINUM, roofKind: 'glass', crate: B.SERVER, floors: true },
  { t: 10, yard: B.GRASS, pave: B.POLYMER, floor: B.POLYMER, base: B.NANO, wall: B.POLYMER, up: B.POLYMER, post: B.NANO, band: B.POLYMER, roof: B.ENERGY_GLASS, gableEnd: B.POLYMER, ridge: B.NANO, win: B.ENERGY_GLASS, winRows: 'both', light: B.NEON, trim: B.NEON, chim: B.NANO, fence: B.NANO, roofKind: 'dome', crate: B.NANO, floors: true, neonBands: true },
];
export const eraOf = (t) => ERAS[Math.max(1, Math.min(10, t | 0))];

// ---------------------------------------------------------------- kit
const isCube = (id) => id !== B.TORCH && id !== AIR;

function yard(bp, e) { bp.box(0, 0, 0, bp.w - 1, 0, bp.d - 1, e.yard); }

/**
 * Rectangular building of `storeys` floors on (x0..x1, z0..z1), walls from y0. door: {x, z, w, face}
 * (face 'z1' = front +z by default). Returns the y of the top floor band (where a roof starts).
 */
function block(bp, e, x0, z0, x1, z1, y0, storeys, o = {}) {
  bp.box(x0, y0 - 1, z0, x1, y0 - 1, z1, e.floor);
  const rows = e.winRows;
  for (let s = 0; s < storeys; s++) {
    const yb = y0 + s * SH;
    for (let r = 0; r < 2; r++) bp.ring(x0, yb + r, z0, x1, yb + r, z1, s === 0 && r === 0 ? e.base : s === 0 ? e.wall : e.up);
    bp.ring(x0, yb + 2, z0, x1, yb + 2, z1, e.neonBands && s % 2 === 1 ? B.NEON : e.band);
    if (s > 0 && e.floors) bp.box(x0 + 1, yb - 1, z0 + 1, x1 - 1, yb - 1, z1 - 1, e.floor);
    // windows every other block, never on corners
    const wrows = rows === 'curtain' ? [yb, yb + 1] : rows === 'both' && s > 0 ? [yb, yb + 1] : [yb + 1];
    const step = rows === 'curtain' ? 1 : 2;
    for (const y of wrows) {
      for (let x = x0 + 1; x < x1; x++) if ((x - x0) % step === (step === 1 ? 0 : 1)) { bp.set(x, y, z0, e.win); bp.set(x, y, z1, e.win); }
      for (let z = z0 + 1; z < z1; z++) if ((z - z0) % step === (step === 1 ? 0 : 1)) { bp.set(x0, y, z, e.win); bp.set(x1, y, z, e.win); }
    }
    if (e.post !== e.wall) for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) bp.box(x, yb, z, x, yb + 2, z, e.post);
  }
  const top = y0 + storeys * SH - 1;
  if (o.door) door(bp, e, o.door, y0);
  return top;
}

/** Door opening (2 high, w wide) on a face, with lights beside it from the medieval age on. */
function door(bp, e, d, y0) {
  const w = d.w || 1, half = (w - 1) / 2;
  const along = d.face === 'x1' || d.face === 'x0' ? 'z' : 'x';
  for (let k = -half; k <= half; k++) {
    const x = along === 'x' ? d.x + k : d.x, z = along === 'z' ? d.z + k : d.z;
    bp.del(x, y0, z); bp.del(x, y0 + 1, z);
  }
  if (isCube(e.light) && e.t >= 4 && d.lights !== false) {
    for (const k of [-half - 1, half + 1]) {
      const x = along === 'x' ? d.x + k : d.x, z = along === 'z' ? d.z + k : d.z;
      if (bp.get(x, y0 + 1, z) !== AIR) bp.set(x, y0 + 1, z, e.light);
    }
  }
}

/** Round wattle hut (stone age) of radius r around (cx, cz); returns the top of the walls. */
function hut(bp, e, cx, cz, r, y0, rows, o = {}) {
  for (let z = 0; z < bp.d; z++) for (let x = 0; x < bp.w; x++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d <= r) bp.set(x, y0 - 1, z, e.floor);
    if (d <= r && d > r - 1) for (let y = y0; y < y0 + rows; y++) bp.set(x, y, z, e.wall);
  }
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, -r]]) {
    const x = Math.round(cx + dx * 0.72), z = Math.round(cz + dz * 0.72);
    if (Math.abs(dx) + Math.abs(dz)) bp.box(x, y0, z, x, y0 + rows - 1, z, e.post);
  }
  return y0 + rows - 1;
}

/** Conical (stepped) roof over a circle / rectangle, with a pole on top. */
function cone(bp, id, cx, cz, R, y, pole = B.LOG) {
  let k = 0;
  for (let r = R; r > 0.4; r -= 1.0, k++) {
    for (let z = 0; z < bp.d; z++) for (let x = 0; x < bp.w; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= r && (d > r - 1.35 || r < 1.4)) bp.set(x, y + k, z, id);
    }
  }
  bp.set(Math.round(cx), y + k, Math.round(cz), pole);
  return y + k;
}

/** Gable roof along an axis; rise = rows per step (2 = steep). Ends filled with endId. */
function gable(bp, x0, x1, z0, z1, y, id, endId, ridgeId, axis = 'x', rise = 1, ov = 1) {
  const W = bp.w, D = bp.d;
  const set = (u, yy, v, b) => axis === 'x' ? bp.set(u, yy, v, b) : bp.set(v, yy, u, b);
  // u runs along the ridge, v across it
  const u0 = axis === 'x' ? x0 : z0, u1 = axis === 'x' ? x1 : z1, v0 = axis === 'x' ? z0 : x0, v1 = axis === 'x' ? z1 : x1;
  const U = axis === 'x' ? W : D, V = axis === 'x' ? D : W;
  const ua = Math.max(0, u0 - ov), ub = Math.min(U - 1, u1 + ov);
  const va0 = Math.max(0, v0 - ov), vb0 = Math.min(V - 1, v1 + ov);
  let top = y;
  for (let k = 0; ; k++) {
    const va = va0 + k, vb = vb0 - k;
    if (va > vb) break;
    for (let r = 0; r < rise; r++) {
      const yy = y + k * rise + r;
      const rid = va === vb || va + 1 === vb;
      for (let u = ua; u <= ub; u++) { set(u, yy, va, rid && ridgeId ? ridgeId : id); set(u, yy, vb, rid && ridgeId ? ridgeId : id); }
      if (endId) for (let v = Math.max(va + 1, v0); v <= Math.min(vb - 1, v1); v++) { set(u0, yy, v, endId); set(u1, yy, v, endId); }
      top = yy;
    }
  }
  return top;
}

/** Era roof on top of a block building whose top floor band is at y. Returns the highest y used. */
function roof(bp, e, x0, z0, x1, z1, y, o = {}) {
  const kind = o.kind || e.roofKind;
  const axis = o.axis || ((x1 - x0) >= (z1 - z0) ? 'x' : 'z');
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const R = (Math.max(x1 - x0, z1 - z0) + 1) / 2;
  switch (kind) {
    case 'cone': return cone(bp, e.roof, cx, cz, R + 0.6, y + 1);
    case 'flat': {
      bp.box(x0, y, z0, x1, y, z1, e.roof);
      // crenellated parapet + protruding roof beams (vigas)
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if ((x === x0 || x === x1 || z === z0 || z === z1) && (x + z) % 2 === 0) bp.set(x, y + 1, z, e.base);
      if (e.beam) for (let x = x0 + 1; x < x1; x += 2) { bp.set(x, y - 1, z0 - 1, e.beam); bp.set(x, y - 1, z1 + 1, e.beam); }
      return y + 1;
    }
    case 'steep': return gable(bp, x0, x1, z0, z1, y + 1, e.roof, e.gableEnd, e.ridge, axis, 2, 1);
    case 'gable': return gable(bp, x0, x1, z0, z1, y + 1, e.roof, e.gableEnd, e.ridge, axis, 1, 1);
    case 'mansard': {
      bp.ring(x0, y + 1, z0, x1, y + 1, z1, e.roof);
      bp.ring(x0, y + 2, z0, x1, y + 2, z1, e.roof);
      // dormer windows on the long sides
      for (let x = x0 + 1; x < x1; x += 2) { bp.set(x, y + 2, z0, B.GLASS); bp.set(x, y + 2, z1, B.GLASS); }
      bp.box(x0 + 1, y + 3, z0 + 1, x1 - 1, y + 3, z1 - 1, e.roof);
      let t = y + 3;
      if (x1 - x0 >= 4 && z1 - z0 >= 4) { bp.box(x0 + 2, y + 4, z0 + 2, x1 - 2, y + 4, z1 - 2, e.roof); t = y + 4; }
      bp.set(Math.round(cx), t + 1, Math.round(cz), e.trim);
      return t + 1;
    }
    case 'crown': {
      bp.box(x0, y, z0, x1, y, z1, e.band);
      let k = 1;
      for (; x0 + k <= x1 - k && z0 + k <= z1 - k; k++) {
        bp.ring(x0 + k - 1, y + k, z0 + k - 1, x1 - k + 1, y + k, z1 - k + 1, k === 1 ? e.trim : e.roof);
        bp.box(x0 + k, y + k, z0 + k, x1 - k, y + k, z1 - k, e.roof);
      }
      const t = y + k;
      bp.box(Math.round(cx), t, Math.round(cz), Math.round(cx), t + 1, Math.round(cz), e.roof);
      bp.set(Math.round(cx), t + 2, Math.round(cz), e.light);
      return t + 2;
    }
    case 'tech': {
      bp.box(x0, y, z0, x1, y, z1, e.roof);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) bp.set(x, y + 1, z, B.HAZARD);
      bp.box(x1 - 2, y + 1, z0 + 1, x1 - 1, y + 2, z0 + 1, B.STEEL_BLOCK);
      const ax = x0 + 1, az = z1 - 1;
      bp.box(ax, y + 1, az, ax, y + 4, az, B.STEEL_BLOCK); bp.set(ax, y + 5, az, B.LAMP);
      return y + 5;
    }
    case 'glass': {
      bp.box(x0, y, z0, x1, y, z1, e.roof);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if ((x === x0 || x === x1 || z === z0 || z === z1) && (x + z) % 2 === 0) bp.set(x, y + 1, z, B.LED);
      bp.box(Math.round(cx), y + 1, Math.round(cz), Math.round(cx), y + 4, Math.round(cz), B.ALUMINUM); bp.set(Math.round(cx), y + 5, Math.round(cz), B.LED);
      return y + 5;
    }
    case 'dome': {
      bp.box(x0, y, z0, x1, y, z1, e.band);
      const r = Math.min(x1 - x0, z1 - z0) / 2 + 0.3;
      let t = y;
      for (let yy = 1; yy <= Math.ceil(r); yy++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, (yy - 0.5) * 1.1, z - cz);
        if (d <= r && d > r - 1.2) { bp.set(x, y + yy, z, e.roof); t = Math.max(t, y + yy); }
      }
      bp.ring(x0, y + 1, z0, x1, y + 1, z1, B.NEON);
      bp.box(Math.round(cx), t + 1, Math.round(cz), Math.round(cx), t + 2, Math.round(cz), B.NANO);
      bp.set(Math.round(cx), t + 3, Math.round(cz), B.NEON);
      return t + 3;
    }
  }
  return y;
}

/** A chimney column at (x, z) from y0 up to top (inclusive), with a cap. */
function chimney(bp, e, x, z, y0, top) {
  bp.box(x, y0, z, x, top, z, e.chim);
  if (e.t >= 6) bp.set(x, top + 1, z, e.t === 6 ? B.CAST_IRON : e.chim);
  bp.point('smoke', x, top + 1.2, z);
}

/** A lamp post (or torch) in the yard. */
function lampPost(bp, e, x, z, h = 2) {
  if (!isCube(e.light)) { bp.set(x, 1, z, e.light); return; }
  const post = e.t >= 9 ? e.post : e.t >= 6 ? (e.t === 6 ? B.CAST_IRON : B.STEEL_BLOCK) : B.SPRUCE_LOG;
  bp.box(x, 1, z, x, h, z, post); bp.set(x, h + 1, z, e.light);
}

const pick = (arr, t) => arr[Math.max(1, Math.min(10, t))];

// ---------------------------------------------------------------- designs (tier 1..10; tier 4 is the classic medieval design)

function house(v, t) {
  const e = eraOf(t), bp = new BP(7, 7);
  yard(bp, e);
  bp.set(3, 0, 6, e.pave);
  if (t === 1) {
    hut(bp, e, 3, 3, 2.6, 1, 2);
    bp.del(3, 1, 5); bp.del(3, 2, 5); bp.set(3, 1, 6, AIR);
    cone(bp, e.roof, 3, 3, 3.3, 3);
    // fire pit, wood pile and a drying rack with hides
    bp.set(6, 1, 5, B.COBBLESTONE); bp.set(5, 1, 6, B.TORCH);
    bp.box(0, 1, 5, 0, 1, 6, B.LOG);
    bp.box(0, 1, 0, 0, 2, 0, B.LOG); bp.box(2, 1, 0, 2, 2, 0, B.LOG); bp.set(1, 2, 0, B.HIDE);
    bp.set(2, 1, 2, B.HAY_BALE);
  } else {
    const storeys = pick([0, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7], t);
    let top = block(bp, e, 1, 1, 5, 5, 1, storeys, { door: { x: 3, z: 5 } });
    if (t === 2) {
      // flat roof terrace with a small upper room
      roof(bp, e, 1, 1, 5, 5, top);
      bp.box(2, top + 1, 1, 4, top + 2, 3, e.wall); bp.box(2, top + 3, 1, 4, top + 3, 3, e.roof);
      bp.set(3, top + 2, 3, AIR); bp.set(3, top + 1, 3, AIR);
      bp.set(1, 1, 6, B.HAY_BALE); bp.set(5, 1, 6, e.base); bp.set(5, 2, 6, B.TORCH);
      top += 3;
    } else if (t === 3) {
      const r = roof(bp, e, 1, 1, 5, 5, top, { axis: v & 1 ? 'z' : 'x', kind: 'gable' });
      chimney(bp, e, 4, 2, top, r);
      bp.box(0, 1, 5, 0, 2, 6, B.LOG); bp.set(1, 1, 6, B.TORCH); bp.set(5, 1, 6, B.TORCH);
      top = r + 1;
    } else {
      const r = roof(bp, e, 1, 1, 5, 5, top, { axis: v & 1 ? 'z' : 'x' });
      if (t <= 6) chimney(bp, e, v & 2 ? 2 : 4, 2, top, r);
      if (t === 6) chimney(bp, e, v & 2 ? 4 : 2, 4, top, r - 1);
      top = r + 1;
      // porch, balconies, yard
      if (t === 5) { bp.box(2, 4, 6, 4, 4, 6, e.band); bp.set(2, 5, 6, e.trim); bp.set(4, 5, 6, e.trim); bp.set(1, 1, 6, B.LEAVES); bp.set(5, 1, 6, B.LEAVES); }
      if (t === 8) for (let s = 1; s < storeys; s++) { const y = 1 + s * SH - 1; bp.box(2, y, 6, 4, y, 6, B.STEEL_BLOCK); bp.set(2, y + 1, 6, B.HAZARD); bp.set(4, y + 1, 6, B.HAZARD); }
      if (t >= 9) { bp.box(2, 3, 6, 4, 3, 6, e.band); bp.set(3, 3, 6, e.light); }
      if (t >= 6) lampPost(bp, e, 6, 6, 2 + (t >= 8 ? 1 : 0));
      if (t === 7) { bp.set(0, 1, 6, B.LEAVES); bp.set(1, 1, 6, B.FLOWER_RED); }
    }
    // a little furniture
    bp.set(2, 1, 2, t >= 9 ? B.SERVER : B.WORKBENCH);
    if (t <= 3) bp.set(4, 1, 2, B.HAY_BALE);
  }
  bp.point('door', 3, 1, 6);
  bp.point('inside', 3, 1, 3);
  return bp;
}

function townHall(v, t) {
  const e = eraOf(t), bp = new BP(11, 11);
  yard(bp, e);
  for (let z = 9; z <= 10; z++) bp.set(5, 0, z, e.pave);
  let top;
  if (t === 1) {
    // chieftain's great hut with totems and a council fire
    hut(bp, e, 5, 5, 4.4, 1, 3);
    bp.del(5, 1, 9); bp.del(5, 2, 9); bp.del(5, 1, 10);
    top = cone(bp, e.roof, 5, 5, 5.3, 4);
    for (const x of [3, 7]) { bp.box(x, 1, 10, x, 3, 10, B.LOG); bp.set(x, 4, 10, B.HIDE); bp.set(x, 5, 10, B.TORCH); }
    bp.set(1, 1, 10, B.TORCH); bp.set(9, 1, 10, B.TORCH);
    bp.set(5, 1, 5, B.COBBLESTONE); bp.set(3, 1, 3, B.HIDE); bp.set(7, 1, 3, B.HIDE);
  } else if (t === 2) {
    // ziggurat palace: three shrinking stories and a temple on top
    block(bp, e, 1, 1, 9, 9, 1, 1, { door: { x: 5, z: 9, w: 3 } });
    bp.box(1, 3, 1, 9, 3, 9, e.band);
    block(bp, { ...e, floor: e.band }, 2, 2, 8, 8, 4, 1, {});
    bp.box(2, 6, 2, 8, 6, 8, e.band);
    block(bp, { ...e, floor: e.band }, 3, 3, 7, 7, 7, 1, { door: { x: 5, z: 7 } });
    top = roof(bp, e, 3, 3, 7, 7, 9);
    for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9], [2, 2], [8, 2], [2, 8], [8, 8]]) bp.set(x, x < 2 || x > 8 ? 3 : 6, z, e.trim);
    bp.box(5, top + 1, 5, 5, top + 2, 5, e.trim); bp.set(5, top + 3, 5, B.TORCH);
    for (const x of [3, 7]) { bp.set(x, 1, 10, e.base); bp.set(x, 2, 10, B.TORCH); }
    top += 3;
  } else if (t === 3) {
    // longhall with a steep shingle roof and a watch tower
    block(bp, e, 1, 2, 9, 8, 1, 1, { door: { x: 5, z: 8 } });
    top = roof(bp, e, 1, 2, 9, 8, 3, { axis: 'x', kind: 'steep' });
    for (const x of [1, 9]) { bp.set(x, top + 1, 5, B.LOG); bp.set(x, top + 2, 5, B.LOG); }     // carved ridge ends
    bp.posts(8, 8, 10, 10, 1, 9, B.LOG);
    bp.box(8, 7, 8, 10, 7, 10, B.PLANKS); bp.ring(8, 8, 8, 10, 8, 10, B.PALISADE);
    bp.box(8, 10, 8, 10, 10, 10, e.roof); bp.set(9, 11, 9, B.LOG); bp.set(9, 12, 9, B.BANNER);
    bp.set(9, 9, 9, B.TORCH);
    bp.set(3, 1, 9, B.TORCH); bp.set(7, 1, 9, B.TORCH);
    top = Math.max(top, 12);
    bp.point('top', 9, 8, 9);
  } else if (t === 5) {
    // renaissance palazzo with a colonnade and a gilded dome
    const st = block(bp, e, 1, 1, 9, 8, 1, 3, { door: { x: 5, z: 8 } });
    for (const x of [1, 3, 7, 9]) bp.box(x, 1, 10, x, 3, 10, e.post);
    bp.box(1, 4, 9, 9, 4, 10, e.band); bp.box(3, 5, 10, 7, 5, 10, e.band); bp.set(5, 6, 10, e.trim);
    top = roof(bp, e, 1, 1, 9, 8, st);
    // drum + dome
    const y = top;
    bp.ring(4, y, 3, 6, y + 2, 5, e.post); bp.set(5, y + 1, 3, B.GLASS); bp.set(5, y + 1, 5, B.GLASS); bp.set(4, y + 1, 4, B.GLASS); bp.set(6, y + 1, 4, B.GLASS);
    bp.ring(3, y + 3, 2, 7, y + 3, 6, e.trim); bp.box(4, y + 3, 3, 6, y + 4, 5, e.trim); bp.set(5, y + 5, 4, e.trim);
    bp.set(5, y + 6, 4, B.LANTERN);
    top = y + 6;
  } else if (t === 6) {
    // brick town hall with a clock tower
    const st = block(bp, e, 1, 1, 9, 7, 1, 3, { door: { x: 5, z: 7 } });
    top = roof(bp, e, 1, 1, 9, 7, st, { axis: 'x' });
    // tower in front of the hall
    const ty = block(bp, e, 4, 7, 6, 9, 1, 6, { door: { x: 5, z: 9 } });
    for (const [x, z] of [[5, 7], [5, 9], [4, 8], [6, 8]]) { bp.set(x, ty - 1, z, e.trim); }     // clock faces
    bp.set(5, ty - 1, 9, B.BRONZE_BLOCK); bp.set(4, ty - 1, 8, B.BRONZE_BLOCK); bp.set(6, ty - 1, 8, B.BRONZE_BLOCK);
    const r = gable(bp, 4, 6, 7, 9, ty + 1, B.CORRUGATED, e.wall, B.CAST_IRON, 'x', 2, 0);
    bp.set(5, r + 1, 8, B.CAST_IRON); bp.set(5, r + 2, 8, B.LANTERN);
    chimney(bp, e, 2, 2, st, top); chimney(bp, e, 8, 2, st, top);
    lampPost(bp, e, 2, 10, 2); lampPost(bp, e, 8, 10, 2);
    top = r + 2;
    bp.point('top', 5, ty + 1, 8);
  } else if (t === 7) {
    // art-deco city hall: podium + stepped tower with a copper crown
    const p = block(bp, e, 1, 1, 9, 9, 1, 2, { door: { x: 5, z: 9, w: 3 } });
    bp.box(1, p, 1, 9, p, 9, e.band);
    const a = block(bp, { ...e, floor: e.band }, 3, 3, 7, 7, p + 1, 4, {});
    const b2 = block(bp, { ...e, floor: e.band }, 4, 4, 6, 6, a + 1, 2, {});
    top = roof(bp, e, 4, 4, 6, 6, b2);
    for (const [x, z] of [[3, 3], [7, 3], [3, 7], [7, 7]]) bp.set(x, a + 1, z, e.light);
    lampPost(bp, e, 2, 10, 3); lampPost(bp, e, 8, 10, 3);
    bp.point('top', 5, p + 1, 8);
  } else if (t === 8) {
    // brutalist ministry: concrete podium + prefab tower with an antenna mast
    const p = block(bp, e, 1, 1, 9, 9, 1, 1, { door: { x: 5, z: 9, w: 3 } });
    bp.box(1, p, 1, 9, p, 9, e.band);
    const a = block(bp, { ...e, floor: e.band }, 2, 2, 8, 7, p + 1, 7, {});
    top = roof(bp, e, 2, 2, 8, 7, a);
    for (const x of [1, 9]) bp.box(x, p + 1, 9, x, p + 1, 9, B.HAZARD);
    lampPost(bp, e, 0, 10, 3); lampPost(bp, e, 10, 10, 3);
    bp.point('top', 5, p + 1, 8);
  } else if (t === 9) {
    // glass headquarters
    const p = block(bp, e, 1, 1, 9, 9, 1, 1, { door: { x: 5, z: 9, w: 3 } });
    bp.box(1, p, 1, 9, p, 9, e.band);
    const a = block(bp, { ...e, floor: e.band }, 2, 2, 8, 7, p + 1, 8, {});
    top = roof(bp, e, 2, 2, 8, 7, a);
    bp.box(3, 3, 10, 7, 3, 10, e.band); bp.set(5, 3, 10, e.light);
    bp.point('top', 5, p + 1, 8);
  } else if (t === 10) {
    // singularity spire: tapering tiers ringed with neon, crowned by an energy dome and a needle
    const p = block(bp, e, 1, 1, 9, 9, 1, 2, { door: { x: 5, z: 9, w: 3 } });
    bp.box(1, p, 1, 9, p, 9, e.band);
    const a = block(bp, { ...e, floor: e.band }, 2, 2, 8, 8, p + 1, 4, {});
    bp.box(2, a, 2, 8, a, 8, e.band);
    const b2 = block(bp, { ...e, floor: e.band }, 3, 3, 7, 7, a + 1, 4, {});
    top = roof(bp, e, 3, 3, 7, 7, b2);
    for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]]) bp.set(x, p + 1, z, B.NEON);
    bp.point('top', 5, p + 1, 8);
  }
  // where the town hall archers shoot from: above the roof (open air)
  if (!bp.pts.top) bp.point('top', 5, top + 1, 5);
  bp.set(5, 1, 3, t >= 9 ? B.SERVER : B.WORKBENCH);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 5, 1, 6);
  bp.point('work', 5, 1, 4);
  return bp;
}

function builderHut(v, t) {
  const e = eraOf(t), bp = new BP(7, 7);
  yard(bp, e);
  bp.set(5, 0, 2, e.pave); bp.set(6, 0, 2, e.pave);
  if (t === 1) {
    hut(bp, e, 2.5, 2.5, 2.1, 1, 2);
    bp.del(4, 1, 2); bp.del(4, 2, 2);
    cone(bp, e.roof, 2.5, 2.5, 2.9, 3);
  } else {
    const st = block(bp, e, 1, 1, 4, 4, 1, pick([0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3], t), { door: { x: 4, z: 2, face: 'x1', lights: false } });
    const r = roof(bp, e, 1, 1, 4, 4, st, { axis: 'x' });
    if (t >= 5 && t <= 6) chimney(bp, e, 2, 1, st, r);
  }
  // stacks of this age's building materials
  bp.box(5, 1, 0, 6, 1, 0, e.wall); bp.set(6, 2, 0, e.wall); bp.set(6, 1, 1, e.base);
  bp.box(0, 1, 6, 1, 1, 6, e.base); bp.set(0, 2, 6, e.roof);
  // crane: a log derrick early, then an iron / steel tower crane that gets taller every age
  const h = 3 + t, post = pick([0, B.LOG, B.LOG, B.LOG, B.SPRUCE_LOG, B.SPRUCE_LOG, B.CAST_IRON, B.STEEL_BLOCK, B.HAZARD, B.ALUMINUM, B.NANO], t);
  bp.box(6, 1, 6, 6, h, 6, post);
  bp.box(3, h, 6, 6, h, 6, post);
  bp.set(3, h - 1, 6, t >= 6 ? B.IRON_BLOCK : B.HAY_BALE);
  bp.set(6, h + 1, 6, isCube(e.light) ? e.light : B.LANTERN);
  if (!isCube(e.light)) bp.set(6, 1, 3, e.light);
  bp.set(2, 1, 2, B.WORKBENCH);
  bp.point('door', 5, 1, 2);
  bp.point('work', 5, 1, 3);
  bp.point('inside', 2, 1, 3);
  return bp;
}

function storehouse(v, t) {
  const e = eraOf(t), bp = new BP(7, 7);
  yard(bp, e);
  bp.box(2, 0, 6, 4, 0, 6, e.pave);
  if (t === 1) {
    hut(bp, e, 3, 3, 2.6, 1, 2);
    bp.del(3, 1, 5); bp.del(3, 2, 5);
    cone(bp, e.roof, 3, 3, 3.4, 3);
  } else {
    const st = block(bp, e, 1, 1, 5, 5, 1, pick([0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3], t), { door: { x: 3, z: 5, w: 3 } });
    roof(bp, e, 1, 1, 5, 5, st, { axis: 'z' });
  }
  // goods of the age
  bp.box(2, 1, 2, 2, 2, 2, e.crate); bp.set(3, 1, 2, B.LOG); bp.set(4, 1, 2, e.crate);
  bp.set(0, 1, 6, e.crate); bp.set(0, 1, 5, B.LOG); bp.set(6, 1, 6, e.crate); bp.set(6, 2, 6, e.crate);
  if (isCube(e.light)) bp.set(6, 1, 5, e.light); else bp.set(6, 1, 5, e.light);
  bp.point('door', 3, 1, 6);
  bp.point('inside', 3, 1, 3);
  return bp;
}

function granary(v, t) {
  const e = eraOf(t), bp = new BP(7, 9);
  yard(bp, e);
  bp.box(2, 0, 8, 4, 0, 8, e.pave);
  if (t === 1) {
    hut(bp, e, 3, 4, 2.8, 1, 2);
    bp.del(3, 1, 7); bp.del(3, 2, 7);
    cone(bp, e.roof, 3, 4, 3.6, 3);
  } else if (t <= 5) {
    const st = block(bp, e, 1, 1, 5, 7, 1, pick([0, 1, 1, 1, 1, 2], t), { door: { x: 3, z: 7, w: 3 } });
    roof(bp, e, 1, 1, 5, 7, st, { axis: 'z' });
  } else {
    // shed + two tall silos behind it
    const st = block(bp, e, 1, 5, 5, 7, 1, 1, { door: { x: 3, z: 7, w: 3 } });
    roof(bp, e, 1, 5, 5, 7, st, { kind: t >= 8 ? 'tech' : 'gable', axis: 'x' });
    const siloMat = pick([0, 0, 0, 0, 0, 0, B.CORRUGATED, B.CONCRETE, B.PREFAB, B.ALUMINUM, B.POLYMER], t);
    const h = 4 + t;
    for (const cx of [2, 4.5]) {
      for (let y = 1; y <= h; y++) for (let z = 0; z <= 4; z++) for (let x = 0; x <= 6; x++) {
        const d = Math.hypot(x - cx, z - 2);
        if (d <= 1.6 && d > 0.6) bp.set(x, y, z, y % 4 === 0 ? e.band : siloMat);
      }
      cone(bp, t >= 10 ? B.ENERGY_GLASS : e.roof === B.CORRUGATED ? B.CORRUGATED : e.band, cx, 2, 1.7, h + 1, e.post);
    }
  }
  bp.box(2, 1, 2, 2, 1, 3, B.HAY_BALE); bp.set(0, 1, 8, B.HAY_BALE); bp.set(6, 1, 8, B.HAY_BALE);
  bp.set(6, 1, 7, isCube(e.light) ? e.light : B.TORCH);
  bp.point('door', 3, 1, 8);
  bp.point('inside', 3, 1, 6);
  return bp;
}

function barracks(v, t) {
  const e = eraOf(t), bp = new BP(9, 7);
  yard(bp, e);
  bp.set(4, 0, 6, e.pave);
  if (t === 1) {
    hut(bp, e, 2.5, 3, 2.2, 1, 2); hut(bp, e, 6.5, 3, 2.2, 1, 2);
    bp.del(2, 1, 5); bp.del(2, 2, 5); bp.del(6, 1, 5); bp.del(6, 2, 5); bp.del(4, 1, 3); bp.del(4, 2, 3);
    cone(bp, e.roof, 2.5, 3, 2.9, 3); cone(bp, e.roof, 6.5, 3, 2.9, 3);
  } else {
    const st = block(bp, e, 1, 1, 7, 5, 1, pick([0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3], t), { door: { x: 4, z: 5 } });
    roof(bp, e, 1, 1, 7, 5, st, { axis: 'x' });
  }
  // flag pole, training dummy, weapon rack
  const fh = 3 + Math.ceil(t * 0.8);
  bp.box(8, 1, 6, 8, fh, 6, e.t >= 6 ? B.CAST_IRON : B.LOG); bp.set(8, fh + 1, 6, B.BANNER);
  bp.set(0, 1, 6, B.LOG); bp.set(0, 2, 6, B.HAY_BALE);
  bp.set(1, 1, 6, t >= 3 ? B.IRON_BLOCK : B.LOG);
  bp.set(7, 1, 6, isCube(e.light) ? e.light : B.TORCH);
  bp.set(2, 1, 2, B.HAY_BALE); bp.set(6, 1, 2, B.HAY_BALE);
  bp.point('door', 4, 1, 6);
  bp.point('inside', 4, 1, 3);
  return bp;
}

function laboratory(v, t) {
  const e = eraOf(t), bp = new BP(7, 9);
  yard(bp, e);
  bp.set(3, 0, 8, e.pave);
  if (t === 1) {
    // shaman's hut with a glowing crystal
    hut(bp, e, 3, 4, 2.8, 1, 2);
    bp.del(3, 1, 7); bp.del(3, 2, 7);
    const c = cone(bp, e.roof, 3, 4, 3.6, 3, B.LOG);
    bp.set(3, c + 1, 4, B.CRYSTAL_ORE);
    bp.set(1, 1, 8, B.MUSHROOM); bp.set(5, 1, 8, B.TORCH);
  } else {
    const n = pick([0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4], t);
    const st = block(bp, e, 1, 1, 5, 7, 1, n, { door: { x: 3, z: 7 } });
    if (t >= 5 && t <= 7) {
      // observatory dome
      bp.box(1, st, 1, 5, st, 7, e.band);
      const dm = t === 5 ? B.BRONZE_BLOCK : B.COPPER_ROOF;
      for (let yy = 1; yy <= 3; yy++) for (let z = 2; z <= 6; z++) for (let x = 1; x <= 5; x++) {
        const d = Math.hypot(x - 3, (yy - 0.5) * 1.2, z - 4);
        if (d <= 2.6 && d > 1.5) bp.set(x, st + yy, z, dm);
      }
      bp.set(3, st + 2, 2, B.GLASS); bp.set(3, st + 3, 3, B.GLASS);
      bp.set(3, st + 4, 4, e.trim);
    } else roof(bp, e, 1, 1, 5, 7, st, { axis: 'z' });
    if (t >= 8) { bp.box(0, 1, 0, 0, 5 + t, 0, t >= 9 ? B.ALUMINUM : B.STEEL_BLOCK); bp.set(0, 6 + t, 0, e.light); }
    bp.set(1, 1, 8, B.LEAVES); bp.set(5, 1, 8, isCube(e.light) ? e.light : B.TORCH);
  }
  bp.set(3, 1, 3, B.ARCANE_TABLE);
  bp.box(2, 1, 2, 4, 1, 2, t >= 8 ? B.SERVER : B.BOOKSHELF); bp.set(3, 1, 2, t >= 8 ? B.SERVER : B.BOOKSHELF);
  bp.point('door', 3, 1, 8);
  bp.point('work', 3, 1, 4);
  bp.point('work', 2, 1, 5);
  bp.point('inside', 3, 1, 5);
  return bp;
}

function forge(v, t) {
  const e = eraOf(t), bp = new BP(7, 7);
  yard(bp, e);
  bp.box(1, 0, 5, 5, 0, 6, e.pave);
  if (t === 1) {
    // open hearth under a lean-to
    bp.posts(1, 1, 5, 3, 1, 2, B.LOG);
    bp.box(0, 3, 0, 6, 3, 4, B.THATCH);
    bp.ring(2, 1, 1, 4, 1, 3, B.COBBLESTONE); bp.set(3, 1, 2, B.FURNACE);
    bp.point('smoke', 3, 4, 2);
  } else if (t === 2) {
    // domed mud-brick kiln for bronze casting
    for (let yy = 1; yy <= 3; yy++) for (let z = 0; z <= 4; z++) for (let x = 1; x <= 5; x++) {
      const d = Math.hypot(x - 3, (yy - 1) * 1.1, z - 2);
      if (d <= 2.4 && d > 1.4) bp.set(x, yy, z, e.wall);
    }
    bp.set(3, 1, 2, B.FURNACE); bp.del(3, 1, 4); bp.del(3, 2, 4);
    chimney(bp, e, 3, 2, 4, 5);
    bp.posts(0, 3, 6, 5, 1, 2, B.LOG); bp.box(0, 3, 3, 6, 3, 5, B.THATCH);
  } else {
    // workshop open at the front, with a chimney that becomes a factory smokestack
    const n = pick([0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3], t);
    const st = block(bp, e, 1, 1, 5, 4, 1, n, {});
    for (let y = 1; y <= 2; y++) for (let x = 2; x <= 4; x++) bp.del(x, y, 4);
    const r = roof(bp, e, 1, 1, 5, 4, st, { axis: 'x' });
    const stack = t >= 6 ? r + 3 + (t - 6) * 2 : r + 1;
    chimney(bp, e, 3, 1, 2, stack);
    bp.set(2, 1, 2, B.FURNACE); bp.set(4, 1, 2, B.WORKBENCH);
  }
  bp.set(3, 1, 4, B.IRON_BLOCK);
  bp.set(5, 0, 6, B.WATER);
  bp.set(0, 1, 6, isCube(e.light) ? e.light : B.TORCH); bp.set(6, 1, 6, isCube(e.light) ? e.light : B.TORCH);
  bp.point('door', 3, 1, 6);
  bp.point('work', 3, 1, 5);
  return bp;
}

function lumberCamp(v, t) {
  const e = eraOf(t), bp = new BP(7, 7);
  yard(bp, e);
  bp.box(1, 0, 4, 5, 0, 6, e.pave);
  if (t <= 2) {
    // lean-to of poles and hides / thatch
    bp.posts(1, 1, 5, 3, 1, 2, B.LOG);
    bp.box(0, 3, 0, 6, 3, 3, t === 1 ? B.HIDE : B.THATCH); bp.box(0, 4, 0, 6, 4, 1, t === 1 ? B.HIDE : B.THATCH);
  } else {
    // sawmill shed, open at the front; later with a steam engine chimney
    const n = t >= 8 ? 2 : 1;
    const st = block(bp, e, 1, 0, 5, 3, 1, n, {});
    for (let y = 1; y <= 2; y++) for (let x = 2; x <= 4; x++) bp.del(x, y, 3);
    const r = roof(bp, e, 1, 0, 5, 3, st, { axis: 'x', kind: t >= 7 ? 'tech' : e.roofKind === 'mansard' ? 'gable' : e.roofKind });
    if (t >= 6) chimney(bp, e, 5, 0, st, r + 2);
    bp.set(3, 1, 1, t >= 6 ? B.IRON_BLOCK : B.WORKBENCH);   // saw bench
  }
  // logs: in piles early, neatly stacked later
  bp.box(2, 1, 1, 4, 1, 1, B.LOG); bp.box(2, 2, 1, 3, 2, 1, B.BIRCH_LOG);
  bp.set(1, 1, 5, B.LOG);
  bp.box(5, 1, 5, 6, 1, 6, B.SPRUCE_LOG); bp.set(6, 2, 6, B.SPRUCE_LOG);
  if (t >= 5) bp.box(0, 1, 4, 0, 2, 6, B.LOG);
  bp.set(0, 1, 6, isCube(e.light) ? e.light : B.TORCH);
  bp.point('door', 3, 1, 5);
  bp.point('work', 2, 1, 5);
  return bp;
}

function farm(v, t) {
  const e = eraOf(t), bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, e.pave === B.POLYMER ? B.GRASS : B.PATH);
  const fence = pick([0, B.LOG, B.LOG, B.PALISADE, B.PLANKS, B.MARBLE, B.CAST_IRON, B.CONCRETE, B.STEEL_BLOCK, B.ALUMINUM, B.NANO], t);
  bp.ring(0, 1, 0, 8, 1, 8, fence);
  bp.del(4, 1, 8);
  const lamp = isCube(e.light) ? e.light : B.TORCH;
  const ph = t >= 7 ? 3 : 2;
  for (const [x, z] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { bp.box(x, 2, z, x, ph, z, t >= 6 ? e.post : B.LOG); bp.set(x, ph + 1, z, lamp); }
  for (let z = 2; z <= 7; z++) {
    for (const x of [1, 2, 3, 5, 6, 7]) { bp.set(x, 0, z, B.FARMLAND); bp.plots.push({ dx: x, dy: 0, dz: z }); }
    bp.set(4, 0, z, B.WATER);
  }
  bp.set(4, 0, 7, B.PATH);
  if (t <= 3) {
    bp.box(1, 1, 1, 2, 1, 1, B.HAY_BALE); bp.set(1, 2, 1, B.HAY_BALE);
    bp.box(6, 1, 1, 7, 1, 1, B.HAY_BALE);
    bp.set(4, 1, 1, B.LOG); bp.set(4, 2, 1, B.LOG); bp.set(4, 3, 1, B.HAY_BALE); bp.set(3, 2, 1, B.PLANKS); bp.set(5, 2, 1, B.PLANKS); bp.set(4, 4, 1, B.THATCH);
  } else if (t <= 5) {
    // windmill
    bp.box(4, 1, 1, 4, 8, 1, t === 5 ? B.STUCCO : B.SPRUCE_LOG);
    bp.set(4, 9, 1, e.roof);
    for (let k = 1; k <= 3; k++) { bp.set(4 - k, 7, 0, B.PLANKS); bp.set(4 + k, 7, 0, B.PLANKS); bp.set(4, 7 - k, 0, B.PLANKS); bp.set(4, 7 + k, 0, B.PLANKS); }
    bp.set(4, 7, 0, B.LOG);
    bp.box(1, 1, 1, 2, 1, 1, B.HAY_BALE); bp.box(6, 1, 1, 7, 1, 1, B.HAY_BALE);
  } else {
    // water tower / irrigation tank, then grow lights
    const tank = pick([0, 0, 0, 0, 0, 0, B.CORRUGATED, B.CONCRETE, B.STEEL_BLOCK, B.ALUMINUM, B.ENERGY_GLASS], t);
    const h = 4 + t - 6;
    bp.box(4, 1, 1, 4, h, 1, e.post);
    bp.box(3, h + 1, 0, 5, h + 2, 1, tank); bp.set(4, h + 3, 1, lamp);
    bp.box(1, 1, 1, 2, 1, 1, e.crate); bp.box(6, 1, 1, 7, 1, 1, e.crate);
    if (t >= 9) for (const x of [2, 6]) { bp.box(x, 1, 8, x, 3, 8, e.post); bp.set(x, 4, 8, lamp); }
  }
  bp.point('door', 4, 1, 8);
  bp.point('work', 4, 1, 7);
  return bp;
}

function mine(v, t) {
  const e = eraOf(t), bp = new BP(9, 12);
  bp.box(0, 0, 0, 8, 0, 3, e.pave === B.GRAVEL ? B.COBBLESTONE : e.pave);
  bp.box(0, 0, 4, 1, 0, 11, B.GRAVEL); bp.box(7, 0, 4, 8, 0, 11, B.GRAVEL); bp.box(2, 0, 11, 6, 0, 11, B.GRAVEL);
  // shed along the back (open towards the pit)
  if (t === 1) {
    bp.posts(0, 0, 8, 2, 1, 2, B.LOG); bp.box(0, 3, 0, 8, 3, 2, B.HIDE);
  } else {
    const n = t >= 8 ? 2 : 1;
    const st = block(bp, e, 0, 0, 8, 2, 1, n, {});
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 7; x++) bp.del(x, y, 2);
    roof(bp, e, 0, 0, 8, 2, st, { axis: 'x', kind: e.roofKind === 'mansard' || e.roofKind === 'cone' ? 'gable' : e.roofKind === 'dome' ? 'glass' : e.roofKind });
  }
  bp.set(1, 1, 1, B.WORKBENCH); bp.set(7, 1, 1, B.FURNACE); bp.set(6, 1, 1, B.IRON_BLOCK);
  // headframe over the pit entrance: logs → iron → steel, taller every age
  const hp = pick([0, B.LOG, B.LOG, B.SPRUCE_LOG, B.SPRUCE_LOG, B.SPRUCE_LOG, B.CAST_IRON, B.STEEL_BLOCK, B.HAZARD, B.ALUMINUM, B.NANO], t);
  const hh = 3 + t;
  bp.box(2, 3, 3, 2, hh, 3, hp); bp.box(6, 3, 3, 6, hh, 3, hp);
  bp.box(2, hh + 1, 3, 6, hh + 1, 3, hp);
  if (t >= 6) { bp.ring(3, hh - 2, 3, 5, hh, 3, e.trim); bp.set(4, hh - 1, 3, B.AIR); }      // winding wheel
  bp.set(4, hh + 2, 3, isCube(e.light) ? e.light : B.LANTERN);
  // fence around the quarry
  const fence = pick([0, B.LOG, B.LOG, B.PALISADE, B.LOG, B.MARBLE, B.CAST_IRON, B.CONCRETE, B.STEEL_BLOCK, B.ALUMINUM, B.NANO], t);
  for (let z = 4; z <= 11; z++) { bp.set(1, 1, z, fence); bp.set(7, 1, z, fence); }
  bp.box(1, 1, 11, 7, 1, 11, fence);
  for (const [x, z] of [[1, 11], [7, 11], [1, 4], [7, 4]]) { bp.set(x, 2, z, fence); bp.set(x, 3, z, isCube(e.light) ? e.light : B.TORCH); }
  bp.quarry = { x0: 2, z0: 4, x1: 6, z1: 10 };
  bp.point('door', 4, 1, 3);
  bp.point('work', 4, 1, 2);
  return bp;
}

function market(v, t) {
  const e = eraOf(t), bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, e.pave === B.GRAVEL ? B.PATH : e.pave);
  bp.box(1, 0, 1, 7, 0, 7, e.floor === B.PATH ? B.PATH : e.floor);
  // centrepiece: fire → well → fountain → statue → hologram
  if (t <= 2) { bp.set(4, 1, 4, B.COBBLESTONE); bp.set(4, 2, 4, B.TORCH); }
  else if (t <= 5) { bp.ring(3, 1, 3, 5, 1, 5, t === 5 ? B.MARBLE : B.COBBLESTONE); bp.set(4, 1, 4, B.WATER); if (t === 5) { bp.box(4, 2, 4, 4, 3, 4, B.MARBLE); bp.set(4, 4, 4, B.BRONZE_BLOCK); } }
  else if (t <= 8) { bp.ring(3, 1, 3, 5, 1, 5, e.base); bp.set(4, 1, 4, B.WATER); bp.box(4, 2, 4, 4, 4, 4, e.post); bp.set(4, 5, 4, e.light); }
  else { bp.box(4, 1, 4, 4, 1, 4, e.base); bp.box(4, 2, 4, 4, 4, 4, t === 10 ? B.ENERGY_GLASS : B.GLASS_BLUE); bp.set(4, 5, 4, e.light); }
  // four stalls with era awnings and goods
  const awn = pick([0, B.HIDE, B.THATCH, B.SHINGLES, B.ROOF_TILES, B.SLATE, B.CORRUGATED, B.COPPER_ROOF, B.STEEL_BLOCK, B.GLASS_BLUE, B.ENERGY_GLASS], t);
  const post = t >= 6 ? e.post : B.LOG;
  const goods = [[B.HAY_BALE, e.crate], [B.LOG, e.crate], [B.BOOKSHELF, e.light === B.TORCH ? B.HAY_BALE : e.light], [B.HAY_BALE, B.LOG]];
  [[0, 0], [6, 0], [0, 6], [6, 6]].forEach(([x0, z0], i) => {
    const front = z0 === 0 ? z0 + 1 : z0, back = z0 === 0 ? z0 : z0 + 1;
    const h = t >= 6 ? 3 : 2;
    bp.posts(x0, z0, x0 + 2, z0 + 1, 1, h, post);
    bp.box(x0, h + 1, z0, x0 + 2, h + 1, z0 + 1, awn);
    bp.set(x0 + 1, 1, front, t >= 8 ? e.base : B.PLANKS);
    bp.set(x0 + 1, 1, back, goods[i][0]);
    bp.set(x0 + 1, 2, back, goods[i][1]);
    bp.point('stall', x0 + 1, 1, z0 === 0 ? z0 + 2 : z0 - 1);
  });
  // iron-and-glass market hall roof over the plaza in the industrial age and later
  if (t >= 6) {
    const hy = t >= 8 ? 6 : 5;
    for (const [x, z] of [[3, 2], [5, 2], [3, 6], [5, 6]]) bp.box(x, 1, z, x, hy - 1, z, e.post);
    const glaze = t === 6 ? B.WINDOW : t === 7 ? B.WINDOW : t === 8 ? B.WINDOW : e.roof === B.ALUMINUM ? B.GLASS_BLUE : B.ENERGY_GLASS;
    gable(bp, 2, 6, 2, 6, hy, glaze, null, e.post, 'z', 1, 0);
  }
  bp.set(4, 2, 1, B.BANNER); bp.set(4, 1, 1, t >= 6 ? e.post : B.LOG);
  bp.point('door', 4, 1, 8);
  bp.point('inside', 4, 1, 6);
  return bp;
}

function watchtower(v, t) {
  const e = eraOf(t), bp = new BP(5, 5);
  const py = 3 + t;            // platform height grows every age
  const mat = pick([0, B.LOG, B.LOG, B.SPRUCE_LOG, B.LOG, B.STONE_BRICKS, B.BRICK, B.CONCRETE, B.STEEL_BLOCK, B.ALUMINUM, B.NANO], t);
  bp.posts(0, 0, 4, 4, 0, 0, t >= 5 ? e.base : B.COBBLESTONE);
  if (t <= 4 || t >= 8) {
    // open lattice legs with braces
    bp.posts(0, 0, 4, 4, 1, py + 2, mat);
    for (let y = 2; y < py - 1; y += 3) {
      bp.set(1, y, 0, mat); bp.set(2, y + 1, 0, mat); bp.set(3, y + 2, 0, mat);
      bp.set(3, y, 4, mat); bp.set(2, y + 1, 4, mat); bp.set(1, y + 2, 4, mat);
      bp.set(0, y, 3, mat); bp.set(0, y + 1, 2, mat); bp.set(0, y + 2, 1, mat);
      bp.set(4, y, 1, mat); bp.set(4, y + 1, 2, mat); bp.set(4, y + 2, 3, mat);
    }
  } else {
    // solid masonry tower with a door and slit windows
    for (let y = 1; y < py; y++) bp.ring(0, y, 0, 4, y, 4, mat);
    bp.del(2, 1, 4); bp.del(2, 2, 4);
    for (let y = 4; y < py; y += 3) { bp.set(2, y, 0, e.win || AIR); bp.set(0, y, 2, e.win || AIR); bp.set(4, y, 2, e.win || AIR); }
  }
  bp.box(0, py, 0, 4, py, 4, t >= 6 ? e.band : B.PLANKS);
  bp.ring(0, py + 1, 0, 4, py + 1, 4, t <= 3 ? B.PALISADE : t >= 9 ? e.win : e.base);
  // roof over the platform
  if (t <= 5) { bp.box(0, py + 3, 0, 4, py + 3, 4, e.roof === B.MUDBRICK ? B.THATCH : e.roof); bp.box(1, py + 4, 1, 3, py + 4, 3, e.roof === B.MUDBRICK ? B.THATCH : e.roof); bp.set(2, py + 5, 2, B.LOG); bp.set(2, py + 6, 2, B.BANNER); }
  else { bp.box(0, py + 3, 0, 4, py + 3, 4, e.band); bp.box(2, py + 4, 2, 2, py + 6, 2, e.post); bp.set(2, py + 7, 2, isCube(e.light) ? e.light : B.LANTERN); }
  if (t <= 4 || t >= 8) bp.posts(0, 0, 4, 4, py + 2, py + 2, mat);
  bp.set(2, py + 2, 2, isCube(e.light) ? e.light : B.LANTERN);
  bp.point('door', 2, 1, 4);
  bp.point('post', 2, py + 1, 2);
  return bp;
}

const OWN_T4 = new Set(['house']);
const DESIGNS = { town_hall: townHall, house, builder_hut: builderHut, storehouse, granary, barracks, laboratory, forge, lumber_camp: lumberCamp, farm, mine, market, watchtower };

/**
 * Design function (variant, tier) for a building type: tier 4 keeps the classic handmade medieval design,
 * every other tier comes from the era designs above. Returns null for types without era designs.
 */
export function tiered(id, medieval) {
  const f = DESIGNS[id];
  if (!f) return null;
  return (v, t = 4) => (t === 4 && medieval && !OWN_T4.has(id) ? medieval(v) : f(v, t));
}
