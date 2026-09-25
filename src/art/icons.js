// Procedural pixel-art icons: item sprites (also extruded into 3D held items), resource icons,
// isometric block icons rendered from the atlas, and building icons. All memoized, browser-only,
// no DOM work at import time.

import { Px, hex, hexes, shift, mix, blob, poly, clamp, rampAt, makeRng, hash01 } from './pixel.js';
import { BLOCKS } from '../core/blocks.js';
import { getTilePx, getTileCanvas } from './textures.js';
import { villagerSkin } from './skins.js';

// ------------------------------------------------------------------ shared helpers
const OUT = hex('#161010');
function outlineCol(nb) { return mix(shift(nb, -0.72), OUT, 0.45); }

/** Iterate the 32x32 grid in diagonal coordinates: a = x - y (along bottom-left -> top-right), c = x + y - 31 (across). */
function D(p, fn) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const col = fn(x - y, x + y - 31, x, y);
    if (col) p.set(x, y, col);
  }
}
// pixel center of diagonal coords
const dx = (a, c) => (a + c + 31) / 2;
const dy = (a, c) => (c - a + 31) / 2;

const R = {
  wood: hexes(['#3a2412', '#5a3a1c', '#7a5129', '#9a6a36', '#b88548']),
  dwood: hexes(['#24160c', '#3a2414', '#54341c', '#6e4826', '#8a5c32']),
  pale: hexes(['#6a5a44', '#9a8666', '#c2ad88', '#e0cfaa', '#f4e8cc']),
  iron: hexes(['#3e424c', '#6a707c', '#a2a8b2', '#d2d7de', '#ffffff']),
  stone: hexes(['#3a3a40', '#5a5a62', '#7e7e86', '#a2a2a8', '#c4c2c2']),
  gold: hexes(['#6a4208', '#a8700e', '#e0a820', '#fad650', '#fff4b0']),
  brass: hexes(['#5a3a10', '#8a6020', '#b8883a', '#dcb25a', '#f4dc94']),
  leather: hexes(['#3a1e10', '#5a321a', '#7a4826', '#9a6034', '#b87a48']),
  crystal: hexes(['#2a1a6a', '#3a6ad8', '#5ad0f0', '#a8f4ff', '#ffffff']),
  blade: hexes(['#4a3a8a', '#8a6ae8', '#6ad8ff', '#c8f8ff', '#ffffff']),
  string: hexes(['#8a8478', '#d8d2c0']),
};

function newSprite() { return new Px(32, 32); }
function finish(p, outline = true) {
  if (outline) p.outline(outlineCol);
  return p.toCanvas();
}

// wooden handle along the diagonal (c in {-1,0}), with grip wraps
function handle(p, a0, a1, ramp = R.wood, wraps = null) {
  D(p, (a, c) => {
    if (a < a0 || a > a1 || c < -1 || c > 1) return null;
    if (wraps && a >= wraps[0] && a <= wraps[1]) return ((a >> 1) & 1) ? R.leather[3 - (c + 1)] : R.leather[2 - (c > 0 ? 1 : 0)];
    const knot = hash01(a, 3) < 0.12;
    return c === -1 ? ramp[knot ? 3 : 4] : c === 0 ? ramp[knot ? 1 : 2] : ramp[knot ? 0 : 1];
  });
}

// ------------------------------------------------------------------ items
function sword(p, blade, guard, gripRamp, pommel, wide = false) {
  D(p, (a, c) => {
    // blade
    const tipStart = 17;
    const hw = a > tipStart ? Math.max(0, (25 - a) / (wide ? 2.6 : 3.4)) : (wide ? 2 : 1);
    if (a >= -6 && a <= 25 && Math.abs(c) <= hw + 0.01) {
      if (wide) return c <= -2 ? blade[3] : c === -1 ? blade[4] : c === 0 ? blade[2] : c === 1 ? blade[1] : blade[0];
      return c < 0 ? blade[3] : c > 0 ? blade[1] : (a < 16 && a > -4 ? blade[2] : blade[3]);
    }
    // cross guard
    if (a >= -8 && a <= -6 && Math.abs(c) <= 6) return a === -6 ? guard[3] : a === -8 ? guard[1] : (Math.abs(c) >= 5 ? guard[1] : guard[2]);
    // grip
    if (a >= -16 && a < -8 && c >= -1 && c <= 1) return ((a >> 1) & 1) ? gripRamp[3 - (c + 1)] : gripRamp[2 - (c > 0 ? 1 : 0)];
    // pommel
    if (a >= -21 && a <= -17 && Math.abs(c) <= 2 && !(Math.abs(c) === 2 && (a === -21 || a === -17))) return (c < 0 && a > -20) ? pommel[3] : c > 0 ? pommel[1] : pommel[2];
    return null;
  });
}

function pickaxe(p, head) {
  handle(p, -24, 12);
  D(p, (a, c) => {
    if (Math.abs(c) > 13) return null;
    const ah = 14 - 5 * (c / 13) ** 2;
    const t = Math.abs(c) > 9 ? 0.6 : 1.6;
    if (a < ah - t || a > ah + t + 0.1) return null;
    if (Math.abs(c) <= 1 && a > ah) return head[4];
    const top = a > ah + 0.5;
    const bot = a < ah - 0.9;
    return top ? head[3] : bot ? head[1] : head[2];
  });
  // binding
  D(p, (a, c) => (a >= 10 && a <= 12 && c >= -2 && c <= 1 ? R.leather[a === 12 ? 3 : 2] : null));
}

function axe(p, head, double = false, long = false) {
  if (long) handle(p, -25, 19, R.dwood, [-22, -14]); else handle(p, -24, 17);
  D(p, (a, c) => {
    const ac = Math.abs(c);
    if (ac <= 1) {
      if (a >= 10 && a <= 16 && long === false && c === 1) return head[1];
      return null;
    }
    const side = c < 0 ? 'front' : 'back';
    if (!double && side === 'back') {
      if (c >= 2 && c <= 3 && a >= 11 && a <= 15) return head[1];
      return null;
    }
    const maxC = double ? 10 : 11;
    if (ac > maxC) return null;
    const half = 2 + (ac - 1) * (double ? 0.52 : 0.45);
    const mid = long ? 11.5 : 12.5;
    if (a < mid - half || a > mid + half) return null;
    if (ac >= maxC - 1) return head[4];
    if (ac >= maxC - 2) return head[3];
    const lit = a > mid + half - 1.2;
    return lit ? head[3] : (a < mid - half + 1.2 ? head[1] : head[2]);
  });
  if (long) D(p, (a, c) => (a >= 18 && a <= 25 && Math.abs(c) <= Math.max(0, (25 - a) / 2.8) ? (c < 0 ? head[3] : head[2]) : null));
}

function shovel(p) {
  handle(p, -24, 8);
  D(p, (a, c) => {
    if (a >= 7 && a <= 9 && Math.abs(c) <= 2) return R.iron[a === 9 ? 2 : 1];
    if (a < 9 || a > 25) return null;
    const hw = a > 19 ? 4 - (a - 19) * 0.9 : 4;
    if (Math.abs(c) > hw) return null;
    if (c <= -3) return R.iron[4];
    if (c < 0) return R.iron[3];
    if (c >= 3) return R.iron[1];
    return R.iron[2];
  });
}

function hammer(p) {
  handle(p, -24, 12, R.wood, [-22, -15]);
  D(p, (a, c) => {
    if (a < 11 || a > 19 || c < -10 || c > 8) return null;
    if (c <= -9) return a > 15 ? R.iron[4] : R.iron[3];      // striking face
    if (c >= 7) return R.iron[1];
    if (c >= -2 && c <= 1) return a > 16 ? R.brass[3] : R.brass[2]; // brass band
    return a >= 18 ? R.iron[3] : a <= 12 ? R.iron[1] : R.iron[2];
  });
}

function bow(p) {
  const k = 11;
  D(p, (a, c) => {
    if (a < -22 || a > 22) return null;
    const t = a / 22;
    const cs = -k * (1 - t * t);
    if (c >= cs - 2 && c <= cs + 0.3) {
      if (Math.abs(a) <= 3) return R.leather[c < cs - 0.9 ? 3 : 2];
      return c < cs - 0.9 ? R.wood[4] : R.wood[2];
    }
    if (Math.abs(a) >= 20 && c >= cs - 3 && c <= cs + 1) return R.wood[1]; // tips
    if (c === 0 && Math.abs(a) < 21) return R.string[1];
    return null;
  });
}

function crossbow(p) {
  // string (drawn first, in pixel space)
  const tip = (c) => [Math.round(dx(9, c)), Math.round(dy(9, c))];
  const nock = [Math.round(dx(-5, 0)), Math.round(dy(-5, 0))];
  for (const c of [-11, 11]) { const [x, y] = tip(c); p.line(x, y, nock[0], nock[1], R.string[1]); }
  D(p, (a, c) => {
    // prod (bow arms), bent back toward the tips
    const ap = 13 - 3.2 * (c / 11.5) ** 2;
    if (Math.abs(c) <= 11.5 && a >= ap - 1.6 && a <= ap + 1.1) return Math.abs(c) >= 10 ? R.iron[1] : a > ap ? R.dwood[4] : R.dwood[2];
    // stock
    if (a >= -22 && a <= 13 && c >= -1 && c <= 1) {
      if (a <= -19) return R.dwood[c < 0 ? 3 : 1];
      if (a >= 11) return R.iron[c < 0 ? 3 : 2];
      return c < 0 ? R.wood[4] : c > 0 ? R.wood[1] : R.wood[2];
    }
    // loaded bolt
    if (c === -2 && a >= -5 && a <= 19) return a >= 17 ? R.iron[3] : a <= -3 ? hex('#c83a2a') : R.pale[3];
    // stirrup
    if (a >= 15 && a <= 18 && Math.abs(c) === 3) return R.iron[2];
    if (a === 18 && Math.abs(c) <= 3) return R.iron[3];
    // trigger
    if (a >= -9 && a <= -7 && c >= 2 && c <= 3) return R.iron[1];
    return null;
  });
}

function musket(p) {
  D(p, (a, c) => {
    // barrel
    if (a >= -8 && a <= 26 && c >= -1 && c <= 0) {
      if (a === 4 || a === 5 || a === 15 || a === 16) return R.brass[c ? 3 : 2];
      return c === -1 ? R.iron[2] : R.iron[1];
    }
    if (a >= 24 && a <= 26 && c === -2) return R.iron[2];                      // front sight
    // stock (widening toward butt)
    const cmax = 0.5 + Math.max(0, (-6 - a) / 5);
    if (a >= -24 && a <= -2 && c >= -1 && c <= cmax) {
      if (a <= -23) return R.brass[c < 1 ? 3 : 2];
      if (c >= cmax - 0.9 && c > 0) return R.wood[1];
      return c <= -1 ? R.wood[4] : R.wood[3 - (c > 1 ? 1 : 0)];
    }
    // lock + hammer
    if (a >= -7 && a <= -3 && c >= -3 && c <= -2) return a === -3 && c === -3 ? R.iron[4] : R.iron[2];
    if (a >= -9 && a <= -8 && c <= -2 && c >= -4) return R.iron[1];
    // trigger guard
    if (a >= -12 && a <= -8 && c === 2) return R.brass[2];
    return null;
  });
}

function blunderbuss(p) {
  D(p, (a, c) => {
    if (a >= -6 && a <= 17 && c >= -1 && c <= 0) return c === -1 ? R.brass[3] : R.brass[2];
    const flare = a - 15;
    if (a >= 15 && a <= 22 && c >= -1 - flare * 0.45 && c <= flare * 0.45) {
      if (a >= 21) return R.brass[1];
      return c < -1 ? R.brass[4] : c > 0 ? R.brass[1] : R.brass[3];
    }
    const cmax = 0.5 + Math.max(0, (-4 - a) / 4);
    if (a >= -22 && a <= -1 && c >= -1 && c <= cmax) {
      if (a <= -21) return R.dwood[1];
      if (c >= cmax - 0.9 && c > 0) return R.dwood[2];
      return c <= -1 ? R.wood[3] : R.wood[2];
    }
    if (a >= -5 && a <= -2 && c >= -3 && c <= -2) return R.iron[2];
    if (a >= -7 && a <= -6 && c >= -4 && c <= -2) return R.iron[1];
    if (a >= -10 && a <= -6 && c === 2) return R.brass[2];
    return null;
  });
}

function bomb(p) {
  const B = hexes(['#0e0e12', '#1c1c24', '#2c2c38', '#46465a', '#7a7a92']);
  blob(p, 14.5, 18.5, 10, 10, B, { dither: 0.4 });
  p.set(9, 12, B[4]); p.set(10, 12, B[4]); p.set(9, 13, B[4]); p.set(11, 11, B[3]);
  // brass cap
  for (let y = 7; y < 11; y++) for (let x = 19; x < 24; x++) if (!((x === 19 || x === 23) && y === 7)) p.set(x, y, y === 7 ? R.brass[4] : x < 21 ? R.brass[3] : R.brass[1]);
  // fuse
  const fuse = [[22, 6], [23, 5], [23, 4], [24, 3], [25, 3], [26, 2]];
  fuse.forEach(([x, y]) => p.set(x, y, hex('#c8b890')));
  // spark
  p.set(27, 1, hex('#ffffff')); p.set(28, 1, hex('#ffd84a')); p.set(27, 0, hex('#ffd84a')); p.set(26, 1, hex('#ff8a2a')); p.set(28, 2, hex('#ff8a2a')); p.set(29, 0, hex('#ffb84a'));
}

function staff(p, kind) {
  const woods = { fire: R.dwood, frost: R.pale, storm: R.dwood, life: hexes(['#2a3a14', '#4a5a20', '#6a7a2e', '#8a9a3e', '#aaba5a']) };
  const gems = {
    fire: hexes(['#5a0a04', '#a8200c', '#e8501a', '#ff9a3a', '#ffe08a']),
    frost: hexes(['#1a3a7a', '#3a7ad8', '#7ac8ff', '#c8f0ff', '#ffffff']),
    storm: hexes(['#2a1a6a', '#5a3ad8', '#8a7aff', '#c8c0ff', '#ffffff']),
    life: hexes(['#0a4a1a', '#1a8a3a', '#4ad86a', '#a8ffb0', '#ffffff']),
  };
  const claw = kind === 'frost' ? R.iron : kind === 'life' ? woods.life : R.gold;
  handle(p, -25, 10, woods[kind], kind === 'storm' ? null : [-8, -4]);
  if (kind === 'storm') D(p, (a, c) => (c >= -1 && c <= 0 && (a === -14 || a === -13 || a === 0 || a === 1) ? R.gold[c ? 3 : 2] : null));
  const gx = dx(16, 0), gy = dy(16, 0);
  // claws: arcs around the gem
  for (let ang = 0; ang < 360; ang += 4) {
    const t = (ang * Math.PI) / 180;
    const rel = Math.abs(((ang - 135 + 540) % 360) - 180); // angular distance from the handle direction
    if (rel < 25 || rel > 150) continue;
    const rr = 4.6;
    const x = Math.round(gx + Math.cos(t) * rr - 0.5), y = Math.round(gy + Math.sin(t) * rr - 0.5);
    p.set(x, y, rel > 120 ? claw[4] : (Math.cos(t) - Math.sin(t) < 0 ? claw[3] : claw[1]));
  }
  D(p, (a, c) => (a >= 10 && a <= 12 && Math.abs(c) <= 3 ? claw[a === 12 ? 3 : 2] : null));
  blob(p, gx, gy, 3.4, 3.4, gems[kind], { dither: 0 });
  p.set(Math.floor(gx) - 1, Math.floor(gy) - 2, hex('#ffffff'));
  const G = gems[kind];
  if (kind === 'fire') {
    for (const [x, y, k] of [[28, 4, 4], [29, 7, 3], [25, 1, 3], [28, 10, 2], [20, 2, 3]]) p.set(x, y, G[k]);
  } else if (kind === 'frost') {
    for (const [x, y] of [[28, 2], [28, 3], [27, 2], [29, 2], [28, 1]]) p.set(x, y, G[3]);
    for (const [x, y] of [[19, 2], [30, 10]]) p.set(x, y, G[4]);
  } else if (kind === 'storm') {
    const bolt = [[28, 1], [27, 2], [28, 3], [27, 4], [29, 4], [28, 5], [29, 6]];
    bolt.forEach(([x, y], i) => p.set(x, y, i % 2 ? hex('#fff3a0') : hex('#ffd83a')));
  } else if (kind === 'life') {
    const leaf = hexes(['#1e5a1a', '#3a8a2a', '#6ac04a']);
    for (const a of [-12, -2]) {
      const x = Math.round(dx(a, -1)), y = Math.round(dy(a, -1));
      p.set(x - 1, y, leaf[2]); p.set(x - 2, y - 1, leaf[1]); p.set(x - 1, y - 1, leaf[2]); p.set(x - 2, y, leaf[0]);
    }
    for (const [x, y] of [[28, 3], [29, 9], [20, 2]]) p.set(x, y, G[3]);
  }
}

function tome(p) {
  const cover = hexes(['#3a0a08', '#5e140e', '#841e14', '#a82c1a', '#c84424']);
  const page = hexes(['#9a8a6a', '#c8b890', '#e8dcb8', '#fbf2d8']);
  // pages block (right & bottom)
  for (let y = 6; y < 29; y++) for (let x = 8; x < 27; x++) p.set(x, y, (y % 2 === 0) ? page[2] : page[3]);
  for (let x = 8; x < 27; x++) p.set(x, 28, page[1]);
  // cover
  for (let y = 4; y < 27; y++) for (let x = 5; x < 25; x++) {
    let col = cover[2];
    if (x <= 7) col = x === 5 ? cover[1] : x === 6 ? cover[3] : cover[2]; // spine
    else if (y === 4 || x === 24) col = cover[y === 4 ? 4 : 1];
    else if (y === 26) col = cover[1];
    else if (hash01(x, y, 9) < 0.1) col = cover[3];
    p.set(x, y, col);
  }
  // spine bands
  for (const y of [8, 22]) for (let x = 5; x < 8; x++) p.set(x, y, R.gold[3]);
  // gold corners
  for (const [cx, cy, sx, sy] of [[24, 4, -1, 1], [24, 26, -1, -1]])
    for (let k = 0; k < 4; k++) { p.set(cx + sx * k, cy, R.gold[3]); p.set(cx, cy + sy * k, R.gold[2]); }
  // meteor emblem
  const M = hexes(['#7a1a08', '#d8401a', '#ff8a2a', '#ffc84a', '#fff4c0']);
  for (let k = 0; k < 9; k++) for (let w = -1; w <= 1; w++) {
    const x = 10 + k + (w < 0 ? -1 : 0), y = 9 + k + (w > 0 ? 1 : 0) - (w < 0 ? 0 : 0);
    if (k < 3 && w !== 0) continue;
    p.set(x + (w > 0 ? 1 : 0), y, M[w === 0 ? 3 - (k < 4 ? 1 : 0) : 1 + (k > 5 ? 1 : 0)]);
  }
  blob(p, 19.5, 19.5, 4.2, 4.2, M, { dither: 0 });
  p.set(18, 17, M[4]); p.set(19, 17, M[4]); p.set(18, 18, M[4]);
  // bookmark ribbon
  p.set(20, 29, hex('#e8c040')); p.set(20, 30, hex('#b89020'));
}

const ITEM_DRAW = {
  sword_wood: (p) => sword(p, hexes(['#4a2e14', '#7a5129', '#9a6a36', '#c8955a', '#e0b070']), R.dwood, R.leather, R.dwood, true),
  sword_iron: (p) => sword(p, R.iron, R.gold, R.leather, R.gold, true),
  sword_crystal: (p) => sword(p, R.blade, R.gold, hexes(['#1a1030', '#2e1e50', '#4a3278', '#6a4aa0', '#8a6ac8']), R.crystal, true),
  battle_axe: (p) => axe(p, R.iron, true, true),
  pickaxe_stone: (p) => pickaxe(p, R.stone),
  pickaxe_iron: (p) => pickaxe(p, R.iron),
  axe_stone: (p) => axe(p, R.stone),
  shovel: (p) => shovel(p),
  build_hammer: (p) => hammer(p),
  bow: (p) => bow(p),
  crossbow: (p) => crossbow(p),
  musket: (p) => musket(p),
  blunderbuss: (p) => blunderbuss(p),
  grenade: (p) => bomb(p),
  staff_fire: (p) => staff(p, 'fire'),
  staff_frost: (p) => staff(p, 'frost'),
  staff_storm: (p) => staff(p, 'storm'),
  staff_life: (p) => staff(p, 'life'),
  tome_meteor: (p) => tome(p),
};

const itemCache = new Map();
/** 32x32 transparent pixel-art sprite for an item id (or sprite name). Unknown ids get a "?" placeholder. */
export function getItemSprite(itemId) {
  if (itemCache.has(itemId)) return itemCache.get(itemId);
  const p = newSprite();
  const fn = ITEM_DRAW[itemId];
  if (fn) fn(p);
  else {
    blob(p, 16, 16, 11, 11, hexes(['#4a2a6a', '#6a3a9a', '#8a5ac8', '#b08ae8']));
    const q = ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'];
    q.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { p.set(14 + i, 10 + j * 2, hex('#ffffff')); p.set(14 + i, 11 + j * 2, hex('#ffffff')); } }));
  }
  const c = finish(p);
  itemCache.set(itemId, c);
  return c;
}

// ------------------------------------------------------------------ resource icons (32x32)
const RES_DRAW = {
  wood(p) {
    // two stacked logs with ring ends
    const bark = hexes(['#24160c', '#3e2616', '#5a3820', '#74492a', '#8e5c36']);
    const ring = hexes(['#6b4a2a', '#8a6437', '#bb9258', '#dfbd80']);
    const log = (x0, y0, len, rad) => {
      for (let y = -rad; y <= rad; y++) for (let x = 0; x < len; x++) {
        const t = y / rad;
        const v = 2.4 - t * 1.6 + (hash01(x >> 1, y, 3) < 0.25 ? -1 : 0);
        p.set(x0 + x, y0 + y, rampAt(bark, v));
      }
      const rx = Math.max(2, rad * 0.62);
      for (let y = -rad; y <= rad; y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        const d = Math.hypot(x / rx, y / rad);
        if (d > 1.05) continue;
        const col = d > 0.82 ? bark[1] : d < 0.2 ? ring[0] : (Math.floor(d * 4.5) % 2 ? ring[1] : ring[2 + (x < 0 ? 1 : 0)]);
        p.set(x0 + len + x, y0 + y, col);
      }
    };
    log(4, 21, 18, 5);
    log(8, 11, 16, 5);
  },
  stone(p) {
    const S = hexes(['#2e2e36', '#4a4a54', '#66666e', '#86868c', '#a6a4a6', '#c8c4c0']);
    poly(p, [[5, 22], [8, 11], [15, 6], [24, 8], [28, 16], [26, 26], [14, 28]], S[2]);
    poly(p, [[8, 11], [15, 6], [24, 8], [17, 14]], S[4]);
    poly(p, [[5, 22], [8, 11], [17, 14], [14, 28]], S[3]);
    poly(p, [[17, 14], [24, 8], [28, 16], [26, 26], [14, 28]], S[1]);
    for (const [x, y] of [[12, 9], [13, 9], [20, 8], [10, 16], [18, 20], [22, 22]]) p.set(x, y, S[5]);
    for (const [x, y] of [[19, 18], [20, 19], [21, 19], [10, 22], [11, 23]]) p.set(x, y, S[0]);
  },
  food(p) {
    const B = hexes(['#5a2e0e', '#8a4a18', '#b86e24', '#d8923a', '#eeb862', '#fad88e']);
    blob(p, 16, 18, 13, 8, B, { dither: 0.3 });
    for (let y = 22; y < 27; y++) for (let x = 5; x < 28; x++) if (p.a(x, y)) p.shade(x, y, -0.18);
    for (const s of [0, 1, 2]) for (let k = 0; k < 5; k++) { p.set(9 + s * 6 + k, 16 - k + 2, B[5]); p.set(10 + s * 6 + k, 17 - k + 2, B[2]); }
    // wheat sprig
    for (let k = 0; k < 7; k++) p.set(23 + (k > 4 ? 1 : 0), 10 - k, hex('#c89a38'));
    for (const [x, y] of [[22, 6], [25, 6], [22, 4], [25, 4], [23, 3], [24, 2]]) p.set(x, y, hex('#f0c850'));
  },
  iron(p) { ingot(p, R.iron); },
  gold(p) { ingot(p, R.gold); p.set(24, 5, hex('#ffffff')); p.set(23, 5, hex('#fff4b0')); p.set(25, 5, hex('#fff4b0')); p.set(24, 4, hex('#fff4b0')); p.set(24, 6, hex('#fff4b0')); },
  coal(p) {
    const C = hexes(['#050507', '#121216', '#1e1e26', '#30303c', '#5a5c70']);
    blob(p, 11, 19, 7, 6, C, { dither: 0.4 });
    blob(p, 21, 21, 6.5, 5.5, C, { dither: 0.4 });
    blob(p, 16, 12, 6, 5, C, { dither: 0.4 });
    for (const [x, y] of [[13, 9], [8, 16], [19, 18], [14, 10]]) p.set(x, y, hex('#8a8ea8'));
  },
  crystal(p) {
    const cy = hexes(['#123a6a', '#1e7ab8', '#4ad0f0', '#a8f4ff', '#ffffff']);
    const vi = hexes(['#2a1260', '#5a2ab8', '#8a5ae8', '#c8a8ff', '#f4ecff']);
    const shard = (cx, base, h, w, ramp) => {
      for (let y = 0; y < h; y++) {
        const top = y < w ? y : w;
        for (let x = -top; x <= top; x++) {
          const col = x < 0 ? ramp[3] : x === 0 ? ramp[2] : ramp[1];
          p.set(cx + x, base - h + y + 1, y === 0 ? ramp[4] : col);
        }
      }
    };
    shard(10, 27, 14, 3, vi);
    shard(22, 27, 13, 3, vi);
    shard(16, 28, 22, 4, cy);
    p.set(14, 12, hex('#ffffff')); p.set(14, 13, hex('#ffffff'));
    for (let x = 6; x < 27; x++) { if (p.a(x, 28)) continue; }
    for (let x = 7; x < 26; x++) p.set(x, 28, hexes(['#3a3a44', '#55555f'])[x & 1]);
  },
  research(p) {
    // round-bottom flask with bubbling liquid
    const G = hexes(['#6a8a98', '#a8c8d4', '#e0f2f8']);
    const L = hexes(['#0e5a4a', '#1a8a6a', '#3ac88a', '#8af0b8']);
    for (let y = 3; y < 12; y++) for (let x = 13; x < 19; x++) p.set(x, y, x === 13 ? G[2] : x === 18 ? G[0] : hex('#cfe8f0'));
    for (let x = 12; x < 20; x++) p.set(x, 3, G[1]);
    for (let y = 10; y < 30; y++) for (let x = 3; x < 29; x++) {
      const d = Math.hypot(x + 0.5 - 16, (y + 0.5 - 20) * 1.05);
      if (d > 10) continue;
      if (d > 9) { p.set(x, y, x < 16 ? G[1] : G[0]); continue; }
      if (y >= 18) p.set(x, y, rampAt(L, 3 - (y - 18) * 0.25 - (x > 18 ? 1 : 0)));
      else p.set(x, y, hex('#d8eef4'));
    }
    for (const [x, y, r] of [[12, 22, 1], [18, 25, 1], [15, 15, 1], [17, 8, 0], [14, 20, 0]]) { p.set(x, y, L[3]); if (r) p.set(x + 1, y, L[3]); }
    p.set(9, 14, G[2]); p.set(8, 15, G[2]); p.set(8, 16, G[2]);
  },
  population(p) {
    const sk = villagerSkin('farmer', 5);
    const tmp = new Px(8, 8);
    const d = sk.getContext('2d').getImageData(8, 8, 8, 8).data;
    tmp.d.set(d);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) p.set(4 + x, 3 + y, tmp.rgb(x / 3, y / 3));
    for (let x = 4; x < 28; x++) { p.set(x, 27, hex('#48639a')); p.set(x, 28, hex('#34497a')); }
  },
  mana(p) {
    const M = hexes(['#101a5a', '#1a3aa8', '#2a6ae8', '#5aa8ff', '#a8e0ff', '#ffffff']);
    for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) {
      const yy = y + 0.5, xx = x + 0.5 - 16;
      let inside;
      if (yy > 17) inside = Math.hypot(xx, yy - 19) < 10;
      else inside = Math.abs(xx) < (yy - 3) * 0.72;
      if (!inside) continue;
      const l = clamp(0.55 - xx * 0.04 - (yy - 19) * 0.03 + (Math.hypot(xx + 3, yy - 16) < 3 ? 0.4 : 0), 0, 1);
      p.set(x, y, rampAt(M, l * 5));
    }
    p.set(12, 15, M[5]); p.set(12, 16, M[5]); p.set(13, 14, M[4]);
  },
  health(p) {
    const H = hexes(['#4a0608', '#8a0e12', '#c81e22', '#f04a3a', '#ff8a7a', '#ffe0d8']);
    for (let y = 4; y < 30; y++) for (let x = 2; x < 30; x++) {
      const X = (x + 0.5 - 16) / 13, Y = -(y + 0.5 - 15) / 13;
      const v = (X * X + Y * Y - 0.36) ** 3 - X * X * Y * Y * Y * 1.2;
      if (v > 0) continue;
      const l = clamp(0.6 - X * 0.35 + Y * 0.3, 0, 1);
      p.set(x, y, rampAt(H, l * 4.2));
    }
    p.set(8, 9, H[5]); p.set(9, 9, H[5]); p.set(8, 10, H[5]); p.set(10, 8, H[4]);
  },
};

function ingot(p, M) {
  // isometric-ish trapezoid ingot
  const top = [[8, 11], [22, 8], [28, 12], [14, 16]];
  poly(p, [[4, 17], [14, 16], [14, 25], [4, 24]], M[2]);          // left end? (front face)
  poly(p, [[8, 11], [14, 16], [14, 25], [4, 20]], M[1]);
  poly(p, [[14, 16], [28, 12], [28, 20], [14, 25]], M[2]);
  poly(p, top, M[3]);
  for (let x = 10; x < 22; x++) p.set(x, Math.round(11 - (x - 8) * 0.2) + 1, M[4]);
  p.set(15, 17, M[3]); p.set(16, 17, M[3]);
  // second ingot behind? keep single but add stamp
  p.set(20, 11, M[2]); p.set(21, 11, M[2]); p.set(19, 12, M[2]);
}

const resCache = new Map();
/** 32x32 icon for a resource ('wood','stone','food','iron','coal','gold','crystal') or 'research','population','mana','health'. */
export function getResourceIcon(res) {
  if (resCache.has(res)) return resCache.get(res);
  const p = newSprite();
  (RES_DRAW[res] || RES_DRAW.stone)(p);
  const c = finish(p);
  resCache.set(res, c);
  return c;
}

// ------------------------------------------------------------------ isometric block icons (48x48)
const blockCache = new Map();
/** 48x48 isometric cube icon rendered from the block's atlas tiles (cross blocks draw their sprite). */
export function getBlockIcon(blockId) {
  if (blockCache.has(blockId)) return blockCache.get(blockId);
  const b = BLOCKS[blockId];
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (b && b.shape === 'cross') {
    ctx.drawImage(getTileCanvas(b.tiles.side), 4, 4, 40, 40);
  } else if (b && b.shape !== 'none') {
    const top = getTileCanvas(b.tiles.top), side = getTileCanvas(b.tiles.side);
    const s = 1 / 32;
    const faces = [
      // [tile, a, b, c, d, e, f, darken]
      [top, 21 * s, 10.5 * s, -21 * s, 10.5 * s, 24, 1.5, 0],
      [side, 21 * s, 10.5 * s, 0, 24 * s, 3, 12, 0.2],
      [side, 21 * s, -10.5 * s, 0, 24 * s, 24, 22.5, 0.4],
    ];
    for (const [img, A, B, C, Dd, E, F, dark] of faces) {
      ctx.setTransform(A, B, C, Dd, E, F);
      ctx.drawImage(img, 0, 0);
      if (dark) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(10,8,20,${dark})`;
        ctx.fillRect(0, 0, 32, 32);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // crisp edge highlight along the top-front edges
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(23.5, 23, 1, 24);
  }
  blockCache.set(blockId, c);
  return c;
}

// ------------------------------------------------------------------ building icons (48x48)
function tex(name, amt = 0, scale = 2) {
  const t = getTilePx(name);
  return (x, y) => {
    const c = t.rgb(x * scale, y * scale);
    return amt ? shift(c, amt, 0.12) : c;
  };
}
function rect(p, x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = typeof col === 'function' ? col(x + i, y + j) : col; if (c) p.set(x + i, y + j, c); } }
function door(p, x, y, w, h, arch = true) {
  rect(p, x, y, w, h, (xx, yy) => {
    if (arch && yy === y && (xx === x || xx === x + w - 1)) return null;
    const lx = xx - x;
    return lx === 0 ? hex('#3a2412') : (lx % 3 === 0 ? hex('#4a2e16') : hex('#6e4826'));
  });
  p.set(x + w - 2, y + (h >> 1), R.gold[3]);
}
function windowAt(p, x, y, w = 4, h = 4, lit = true) {
  rect(p, x, y, w, h, (xx, yy) => {
    if (xx === x + (w >> 1) || yy === y + (h >> 1)) return hex('#3a2412');
    return lit ? ((xx - x + yy - y) < 2 ? hex('#fff0b0') : hex('#f0b848')) : hex('#8ab8d8');
  });
}
/** Generic house: front wall + shaded side wall + gable roof with visible right slope. */
function house(p, o) {
  const { x, g, w, h, d = 8, wall, side = wall, roof, roofH = 10, gable = wall, over = 2 } = o;
  const topY = g - h;
  // side wall (receding to the upper right)
  poly(p, [[x + w, topY], [x + w + d, topY - d / 2], [x + w + d, g - d / 2], [x + w, g]], tex(side, -0.28));
  // front wall
  rect(p, x, topY, w, h, tex(wall));
  // gable triangle
  const ax = x + w / 2, ay = topY - roofH;
  poly(p, [[x, topY], [ax, ay], [x + w, topY]], tex(gable, -0.08));
  // roof slope (right plane)
  poly(p, [[ax, ay], [x + w + over, topY + over / 2], [x + w + d + over, topY - d / 2 + over / 2], [ax + d, ay - d / 2]], tex(roof, 0.05));
  // roof front edge (bargeboards)
  for (let t = 0; t <= 1; t += 0.02) {
    const lx = Math.round(x - over + (ax - x + over) * t), ly = Math.round(topY + over / 2 + (ay - topY - over / 2) * t);
    const rx = Math.round(x + w + over - (x + w + over - ax) * t);
    p.set(lx, ly, tex(roof, -0.35)(lx, ly)); p.set(lx, ly + 1, tex(roof, -0.1)(lx, ly + 1));
    p.set(rx, ly, tex(roof, -0.35)(rx, ly));
  }
  return { topY, ax, ay };
}
function flag(p, x, y, col = hex('#b82828')) {
  for (let k = 0; k < 9; k++) p.set(x, y + k, hex('#4a3a2a'));
  p.set(x, y - 1, R.gold[3]);
  rect(p, x + 1, y, 6, 4, (xx, yy) => ((xx + yy) % 5 === 0 ? shift(col, -0.25) : col));
  p.set(x + 3, y + 1, R.gold[4]); p.set(x + 4, y + 2, R.gold[3]);
}
function logEnd(p, cx, cy, r = 2.5) {
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.4) continue;
    p.set(cx + x, cy + y, d > r - 0.6 ? hex('#3e2616') : d < 1 ? hex('#8a6437') : hex('#cea86b'));
  }
}
function tower(p, cx, g, r, h, wallTile, roofCol, roofH) {
  // cylindrical tower with cone roof
  for (let y = g - h; y < g; y++) for (let x = cx - r; x < cx + r; x++) {
    const t = (x + 0.5 - cx) / r;
    p.set(x, y, tex(wallTile, -0.35 * t - (t < -0.7 ? 0.1 : 0) + (t < -0.3 && t > -0.7 ? 0.1 : 0))(x, y));
  }
  const R0 = hexes(roofCol);
  for (let y = 0; y < roofH; y++) {
    const hw = ((y + 1) / roofH) * (r + 2);
    for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
      const t = (x + 0.5 - cx) / hw;
      p.set(x, g - h - roofH + y, rampAt(R0, 3 - t * 2 - ((y % 4 === 3) ? 0.6 : 0)));
    }
  }
}

const BUILD_DRAW = {
  town_hall(p) {
    house(p, { x: 4, g: 44, w: 26, h: 16, d: 12, wall: 'stone_bricks', roof: 'roof_tiles', roofH: 12, gable: 'timber_frame' });
    rect(p, 4, 28, 26, 6, tex('timber_frame'));
    door(p, 14, 36, 6, 8);
    windowAt(p, 7, 30, 4, 3); windowAt(p, 23, 30, 4, 3);
    windowAt(p, 15, 22, 4, 4);
    flag(p, 17, 3);
    // tower on the right
    tower(p, 40, 40, 5, 18, 'stone_bricks', ['#3a1410', '#5a1e16', '#8a3424', '#b84a2c', '#d8683e'], 9);
    windowAt(p, 38, 28, 3, 4);
  },
  house(p) {
    house(p, { x: 7, g: 42, w: 22, h: 14, d: 12, wall: 'timber_frame', roof: 'thatch', roofH: 11, gable: 'plaster' });
    door(p, 15, 33, 6, 9);
    windowAt(p, 9, 31); windowAt(p, 24, 31);
    // chimney
    rect(p, 32, 8, 4, 9, tex('cobblestone'));
    p.set(33, 6, hex('#b8b8c0')); p.set(34, 4, hex('#d8d8e0')); p.set(33, 2, hex('#e8e8f0'));
  },
  lumber_camp(p) {
    // open shed: posts + plank roof
    for (const x of [6, 26]) rect(p, x, 16, 2, 24, (xx) => (xx === x ? hex('#8a5c32') : hex('#54341c')));
    poly(p, [[3, 17], [24, 8], [44, 14], [30, 22]], tex('planks', 0.05));
    for (let x = 3; x < 31; x++) p.set(x, Math.round(17 + (x - 3) * (5 / 27)), hex('#3a2412'));
    // log pile
    for (const [cx, cy] of [[12, 38], [18, 38], [24, 38], [15, 33], [21, 33], [18, 28]]) logEnd(p, cx, cy, 2.8);
    // stump with axe
    rect(p, 34, 36, 8, 6, tex('log_side'));
    rect(p, 34, 34, 8, 2, tex('log_top'));
    for (let k = 0; k < 8; k++) p.set(38 + (k >> 1), 34 - k, hex('#8a5c32'));
    rect(p, 40, 25, 4, 3, R.iron[2]); p.set(43, 25, R.iron[4]); p.set(43, 26, R.iron[4]);
  },
  farm(p) {
    // field in perspective: rows of wheat
    for (let row = 0; row < 6; row++) {
      const y = 22 + row * 4;
      for (let x = 2 + row; x < 46 - row; x++) {
        p.set(x, y + 2, tex('farmland')(x, y));
        p.set(x, y + 3, tex('farmland', -0.2)(x, y));
        const h = ((x * 7 + row * 3) % 5 === 0) ? 3 : 2;
        for (let k = 0; k < h; k++) p.set(x, y + 1 - k, (x + k) % 2 ? hex('#e8c050') : hex('#c8962a'));
      }
    }
    // fence
    for (let x = 2; x < 46; x++) { p.set(x, 44, hex('#8a5c32')); p.set(x, 45, hex('#54341c')); }
    for (let x = 3; x < 46; x += 6) rect(p, x, 41, 2, 6, (xx) => (xx % 2 ? hex('#54341c') : hex('#9a6a36')));
    // scarecrow
    rect(p, 23, 8, 2, 14, hex('#6e4826'));
    rect(p, 17, 12, 14, 2, hex('#6e4826'));
    rect(p, 21, 4, 6, 5, hex('#e8c878')); p.set(22, 6, hex('#222')); p.set(25, 6, hex('#222'));
    rect(p, 20, 3, 8, 2, hex('#c8a040'));
    rect(p, 21, 12, 6, 6, hex('#8a3a2a'));
  },
  mine(p) {
    poly(p, [[0, 44], [6, 20], [16, 10], [30, 8], [42, 18], [48, 44]], (x, y) => tex(y < 16 ? 'grass_top' : 'stone', (x - 24) * -0.012)(x, y));
    for (let x = 0; x < 48; x++) { const y = Math.round(12 + Math.abs(x - 22) * 0.35); if (y < 20 && p.a(x, y)) { p.set(x, y, hex('#4f8e37')); } }
    // entrance
    rect(p, 16, 24, 16, 20, hex('#120c0a'));
    for (let y = 24; y < 44; y++) { p.set(15, y, hex('#9a6a36')); p.set(16, y, hex('#6e4826')); p.set(31, y, hex('#6e4826')); p.set(32, y, hex('#54341c')); }
    rect(p, 13, 22, 22, 3, (x, y) => (y === 22 ? hex('#b88548') : hex('#6e4826')));
    // rails
    for (let y = 36; y < 48; y++) { const s = (y - 36) * 0.5; p.set(Math.round(20 - s), y, R.iron[2]); p.set(Math.round(27 + s), y, R.iron[2]); }
    for (let y = 38; y < 48; y += 3) for (let x = Math.round(19 - (y - 36) * 0.5); x < 29 + (y - 36) * 0.5; x++) p.set(x, y, hex('#6e4826'));
    // lantern
    p.set(24, 26, hex('#2a2a2a')); rect(p, 23, 27, 3, 3, hex('#ffc84a')); p.set(24, 28, hex('#fff4c0'));
    // ore sparkle
    for (const [x, y, c] of [[9, 30, '#fad650'], [38, 28, '#5ad0f0'], [40, 34, '#fad650'], [8, 36, '#d8a67e']]) { p.set(x, y, hex(c)); p.set(x + 1, y + 1, shift(hex(c), -0.3)); }
  },
  storehouse(p) {
    house(p, { x: 5, g: 42, w: 26, h: 16, d: 12, wall: 'planks', roof: 'roof_tiles', roofH: 10, gable: 'planks' });
    // big barn door with X brace
    rect(p, 12, 30, 12, 12, hex('#6e3a1e'));
    for (let k = 0; k < 12; k++) { p.set(12 + k, 30 + k, hex('#e8d8b8')); p.set(23 - k, 30 + k, hex('#e8d8b8')); }
    for (let x = 12; x < 24; x++) { p.set(x, 30, hex('#e8d8b8')); p.set(x, 41, hex('#e8d8b8')); }
    // crates & barrel
    rect(p, 34, 36, 8, 8, (x, y) => (x === 34 || y === 36 || x === 41 || y === 43 || x - 34 === y - 36 ? hex('#6e4826') : hex('#b88548')));
    rect(p, 1, 36, 4, 8, (x) => (x === 1 ? hex('#8a5c32') : hex('#6e4826')));
    p.set(1, 38, R.iron[1]); p.set(2, 38, R.iron[1]); p.set(3, 38, R.iron[1]); p.set(4, 38, R.iron[1]);
    p.set(1, 42, R.iron[1]); p.set(2, 42, R.iron[1]); p.set(3, 42, R.iron[1]); p.set(4, 42, R.iron[1]);
  },
  laboratory(p) {
    house(p, { x: 4, g: 44, w: 24, h: 18, d: 10, wall: 'stone_bricks', roof: 'roof_tiles', roofH: 3, gable: 'stone_bricks', over: 1 });
    // observatory dome sitting on the roof
    const Dm = hexes(['#1a2a4a', '#2a4a7a', '#3a6aa8', '#5a8ac8', '#8ab8e8']);
    const dome = new Px(48, 48);
    blob(dome, 16, 26, 9, 9, Dm, { dither: 0.3 });
    for (let y = 0; y < 26; y++) for (let x = 0; x < 48; x++) if (dome.a(x, y)) p.set(x, y, dome.rgb(x, y));
    rect(p, 15, 17, 2, 9, hex('#101a2a'));
    for (let k = 0; k < 8; k++) { p.set(17 + k, 19 - k, R.brass[3]); p.set(17 + k, 20 - k, R.brass[1]); }
    // flask sign
    door(p, 13, 34, 6, 10);
    rect(p, 22, 30, 5, 6, hex('#e8e0c8'));
    p.set(24, 31, hex('#3ac88a')); p.set(23, 33, hex('#3ac88a')); p.set(24, 33, hex('#3ac88a')); p.set(25, 33, hex('#3ac88a')); p.set(24, 32, hex('#8af0b8'));
    windowAt(p, 6, 30, 4, 4);
  },
  forge(p) {
    house(p, { x: 4, g: 42, w: 24, h: 16, d: 10, wall: 'cobblestone', roof: 'roof_tiles', roofH: 9, gable: 'planks' });
    // glowing forge opening
    rect(p, 9, 30, 14, 12, hex('#1a0c08'));
    for (let x = 10; x < 22; x++) { const h = 3 + ((x * 5) % 4); for (let k = 0; k < h; k++) p.set(x, 41 - k, rampAt(hexes(['#a8401a', '#ff8a2a', '#ffc84a', '#fff4c0']), 3 - k * 0.8)); }
    for (let x = 8; x < 24; x++) p.set(x, 29, hex('#5a5a62'));
    // chimney + smoke
    rect(p, 30, 6, 5, 14, tex('stone_bricks'));
    blob(p, 33, 3, 3, 2, hexes(['#6a6a72', '#9a9aa2', '#c8c8d0']));
    // anvil
    rect(p, 34, 36, 10, 3, R.iron[2]); rect(p, 34, 36, 10, 1, R.iron[3]); rect(p, 32, 36, 2, 2, R.iron[1]);
    rect(p, 37, 39, 4, 3, R.iron[1]); rect(p, 35, 42, 8, 2, R.iron[0]);
  },
  mage_tower(p) {
    tower(p, 22, 46, 8, 28, 'stone_bricks', ['#1e0e3a', '#3a1a6a', '#5a2a9a', '#8a4ad0', '#b07af0'], 16);
    // glowing windows
    for (const [x, y] of [[20, 24], [20, 34]]) { rect(p, x, y, 3, 5, hex('#c07bff')); p.set(x, y, hex('#f2dcff')); rect(p, x + 1, y - 1, 1, 1, hex('#c07bff')); }
    door(p, 19, 39, 6, 7);
    // star on top
    const [sx, sy] = [22, 1];
    for (const [x, y] of [[0, 0], [-1, 1], [1, 1], [0, 1], [0, 2], [-2, 1], [2, 1]]) p.set(sx + x - 1, sy + y, hex('#fff08a'));
    // orbiting sparkles
    for (const [x, y, c] of [[7, 14, '#8ff4ff'], [36, 20, '#c07bff'], [9, 30, '#c07bff'], [37, 36, '#8ff4ff']]) { p.set(x, y, hex(c)); p.set(x + 1, y, hex('#ffffff')); p.set(x, y + 1, hex(c)); }
  },
  watchtower(p) {
    // legs
    for (const [x0, x1] of [[10, 14], [36, 32]]) for (let y = 20; y < 46; y++) { const x = Math.round(x0 + (x1 - x0) * (y - 20) / 26); p.set(x, y, hex('#8a5c32')); p.set(x + 1, y, hex('#54341c')); }
    for (let k = 0; k < 18; k++) { p.set(13 + k, 26 + k * 1, hex('#6e4826')); p.set(34 - k, 26 + k, hex('#6e4826')); }
    // platform with palisade rail
    rect(p, 7, 18, 34, 3, tex('planks'));
    rect(p, 7, 10, 34, 8, (x, y) => ((x - 7) % 4 === 3 ? hex('#3e2616') : tex('palisade_side')(x, y)));
    for (let x = 7; x < 41; x += 4) p.set(x + 1, 9, hex('#8a5c32'));
    // pointed roof
    poly(p, [[4, 10], [24, 0], [44, 10]], tex('thatch'));
    for (let x = 4; x < 44; x++) p.set(x, 10, hex('#6a4a1e'));
    // guard spear tip
    p.set(30, 3, R.iron[3]); p.set(30, 4, R.iron[2]);
  },
  barracks(p) {
    house(p, { x: 3, g: 42, w: 30, h: 14, d: 10, wall: 'stone_bricks', roof: 'roof_tiles', roofH: 9, gable: 'planks' });
    door(p, 15, 33, 6, 9);
    windowAt(p, 6, 31, 4, 3, false);
    // shield with crossed swords beside the door
    const Sh = hexes(['#4a0c0c', '#8a1a1a', '#b82828', '#d84a3a']);
    for (let k = 0; k < 10; k++) { p.set(23 + k, 28 + k, R.iron[3]); p.set(32 - k, 28 + k, R.iron[2]); }
    for (let y = 30; y < 38; y++) for (let x = 24; x < 32; x++) { const hw = y < 34 ? 4 : 4 - (y - 34) * 1.2; if (Math.abs(x + 0.5 - 28) <= hw) p.set(x, y, x < 28 ? Sh[2] : Sh[1]); }
    p.set(27, 32, R.gold[3]); p.set(28, 32, R.gold[3]); p.set(27, 33, R.gold[2]); p.set(28, 33, R.gold[2]); p.set(27, 34, R.gold[2]);
    flag(p, 38, 8, hex('#b82828'));
  },
  wall(p) {
    for (let i = 0; i < 7; i++) {
      const x0 = 3 + i * 6, top = 10 + (i % 2) * 3;
      for (let y = top; y < 44; y++) for (let x = x0; x < x0 + 5; x++) {
        const lx = x - x0;
        const tipW = Math.min(2.5, (y - top) * 0.5 + 0.5);
        if (Math.abs(lx + 0.5 - 2.5) > tipW) continue;
        p.set(x, y, rampAt(hexes(['#2e1e14', '#503522', '#755033', '#8f6440', '#a87a4e']), [3, 3.6, 2.8, 2, 1][lx] + (y - top < 3 ? 0.8 : 0) - (hash01(x, y >> 1) < 0.15 ? 1 : 0)));
      }
    }
    for (const y of [20, 34]) for (let x = 3; x < 45; x++) { p.set(x, y, hex('#b08b4e')); p.set(x, y + 1, hex('#6b4c26')); }
  },
  stone_wall(p) {
    rect(p, 3, 16, 42, 28, tex('cobblestone'));
    for (let i = 0; i < 4; i++) rect(p, 3 + i * 12, 9, 7, 7, tex('stone_bricks', 0.05));
    for (let x = 3; x < 45; x++) p.set(x, 16, shift(tex('cobblestone')(x, 16), 0.3));
    rect(p, 20, 26, 2, 6, hex('#141018'));
  },
  gate(p) {
    tower(p, 8, 46, 6, 34, 'stone_bricks', ['#3a1410', '#5a1e16', '#8a3424', '#b84a2c', '#d8683e'], 8);
    tower(p, 40, 46, 6, 34, 'stone_bricks', ['#3a1410', '#5a1e16', '#8a3424', '#b84a2c', '#d8683e'], 8);
    rect(p, 14, 16, 20, 30, tex('stone_bricks', -0.1));
    // arch opening with wooden doors
    for (let y = 22; y < 46; y++) for (let x = 17; x < 31; x++) {
      const dxx = x + 0.5 - 24, dyy = y + 0.5 - 29;
      if (y < 29 && dxx * dxx + dyy * dyy * 1.8 > 49) continue;
      p.set(x, y, x === 24 ? hex('#2a1a0c') : ((x - 17) % 3 === 0 ? hex('#4a2e16') : hex('#7a5129')));
    }
    for (const y of [30, 40]) for (let x = 17; x < 31; x++) p.set(x, y, R.iron[1]);
    for (let x = 14; x < 34; x += 3) rect(p, x, 13, 2, 3, tex('stone_bricks'));
  },
};

const buildCache = new Map();
/** 48x48 icon for a building type id. */
export function getBuildingIcon(typeId) {
  if (buildCache.has(typeId)) return buildCache.get(typeId);
  const p = new Px(48, 48);
  (BUILD_DRAW[typeId] || BUILD_DRAW.house)(p);
  p.outline(outlineCol);
  const c = p.toCanvas();
  buildCache.set(typeId, c);
  return c;
}

// ------------------------------------------------------------------ data URLs
const urlCache = new WeakMap();
/** Cached PNG data URL of an icon canvas. */
export function iconURL(canvas) {
  if (!canvas) return '';
  let u = urlCache.get(canvas);
  if (!u) { u = canvas.toDataURL('image/png'); urlCache.set(canvas, u); }
  return u;
}
