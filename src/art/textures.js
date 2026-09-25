// Procedural block texture atlas (32x32 pixel-art tiles), generated deterministically at load time.
//
// UV CONVENTION (important for the mesher):
//   texture.flipY = false, so texture v = 0 is the TOP row of the canvas and v grows downward.
//   uv(name) -> [u0, v0, u1, v1] where (u0,v0) is the tile's top-left and (u1,v1) its bottom-right
//   (all in 0..1). Map a face's top edge to v0 and bottom edge to v1.
//
// Layout: each 32x32 tile sits in a 40x40 cell with a 4px gutter. For cube tiles the gutter is filled
// with WRAPPED pixels (what the neighbouring block face would show), for cross-sprite tiles it replicates
// the edge pixels. This prevents bleeding at every mip level down to ~5px cells.
//
// Alpha usage:
//   cutout (alpha is 0 or 255): leaves, spruce_leaves, birch_leaves, wheat_0..3, torch, tall_grass,
//     flower_red, flower_yellow, mushroom, dead_bush
//   semi-transparent (blend): water (~0.75), water_flow (~0.75), glass (mostly ~0.15 with an opaque frame),
//     ghost (translucent cyan), destroy_0..5 (overlay: transparent with dark cracks)
//   everything else is fully opaque.

import * as THREE from 'three';
import { TILE_NAMES } from '../core/blocks.js';
import {
  Px, makeRng, hexes, hex, mix, shift, rampAt, rampDither, tileNoise, tileNoise2, tileFbm,
  voronoiFromPoints, field, emboss, clamp, blob,
} from './pixel.js';

export const TILE_SIZE = 32;
const S = TILE_SIZE;
const GUT = 4;
const CELL = S + GUT * 2;

// Cross-shaped sprite tiles (gutter = clamped edge, not wrapped)
const SPRITES = new Set(['wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'torch', 'tall_grass', 'flower_red',
  'flower_yellow', 'mushroom', 'dead_bush']);

// ------------------------------------------------------------------ palettes (dark -> light, hue shifted)
const P = {
  stone: hexes(['#2c2b36', '#3f3e49', '#53525c', '#67666e', '#7b7a7f', '#8f8d8f', '#a3a09e', '#b8b3ac']),
  cobble: hexes(['#1f1e26', '#33323c', '#48474f', '#5e5c63', '#737177', '#88868a', '#9f9c9c', '#b7b2ac']),
  mortar: hexes(['#15141a', '#1e1d24', '#29282f', '#34323a']),
  moss: hexes(['#1f3216', '#2b4520', '#385a28', '#476f2f', '#598536', '#6e9a40', '#88b04e']),
  dark: hexes(['#101016', '#17161e', '#1f1e27', '#282731', '#32303c', '#3d3a47', '#4a4655', '#5a5566']),
  bedrock: hexes(['#08080b', '#141418', '#222228', '#34333b', '#4a4952', '#63626b', '#807e86']),
  dirt: hexes(['#2b1b12', '#3c2718', '#4f3320', '#624028', '#764f31', '#8a5f3b', '#9e7047', '#b28456']),
  grass: hexes(['#17331a', '#1f4520', '#295626', '#34682b', '#417b31', '#4f8e37', '#62a13e', '#7ab44a', '#96c75c']),
  sand: hexes(['#9a8157', '#ae9565', '#c2a974', '#d2ba84', '#dfc893', '#ead5a2', '#f3e2b6', '#fbf0cc']),
  bark: hexes(['#1f140e', '#2e1e14', '#3e291b', '#503522', '#62422a', '#755033', '#895f3d']),
  wood: hexes(['#4a3019', '#6b4a2a', '#8a6437', '#a57c47', '#bb9258', '#cea86b', '#dfbd80']),
  sbark: hexes(['#170f0b', '#241810', '#322016', '#40291c', '#4f3423', '#60402b', '#724d34']),
  swood: hexes(['#3b2615', '#583a20', '#74502c', '#8d6639', '#a37b48', '#b68f59', '#c7a26c']),
  birch: hexes(['#7f7a72', '#9d998f', '#b9b5ab', '#cfcbc1', '#e0ddd4', '#eeebe4', '#f8f7f2']),
  bwood: hexes(['#8d7550', '#a88f63', '#c2a877', '#d4bb89', '#e2cc9c', '#ecdcb2']),
  birchMark: hexes(['#15130f', '#2a2622', '#433d37', '#5f5750']),
  leaf: hexes(['#0e220e', '#143015', '#1c3f1b', '#255021', '#306228', '#3e752e', '#4f8835', '#659c40', '#7fb04e']),
  sleaf: hexes(['#0a1a14', '#0f241a', '#143021', '#1b3d29', '#224a31', '#2b583a', '#366845', '#437951']),
  bleaf: hexes(['#1f3812', '#2b4c17', '#3a621d', '#4a7624', '#5c8a2c', '#709e36', '#88b243', '#a3c555', '#bdd66e']),
  plank: hexes(['#3b2413', '#54341c', '#6d4526', '#855731', '#9c693b', '#b07b47', '#c38d55', '#d4a067']),
  darkoak: hexes(['#1a0f09', '#26170d', '#342013', '#432a19', '#53351f', '#644127', '#764e30']),
  brick: hexes(['#2a2931', '#3b3a44', '#4e4d57', '#62616a', '#76747b', '#89878b', '#9e9b9b', '#b2aea9']),
  straw: hexes(['#4a3517', '#664b1f', '#836327', '#a07c31', '#b9933c', '#cfaa4b', '#e0c060', '#eed57e']),
  terra: hexes(['#35120e', '#521d17', '#6f281e', '#8b3524', '#a4442b', '#bb5634', '#cf6c41', '#df8854']),
  plaster: hexes(['#948a79', '#aca28f', '#c1b7a4', '#d2c9b6', '#e0d8c7', '#ebe5d7', '#f5f0e5']),
  farm: hexes(['#170d07', '#22150c', '#301e11', '#3f2817', '#4e321e', '#5f3e25', '#71492d']),
  path: hexes(['#4a3822', '#5e4829', '#735a33', '#876b3d', '#9a7c48', '#ab8d56', '#bb9d65', '#c8ad76']),
  snow: hexes(['#8a9fbe', '#a5b7d0', '#bfcde2', '#d4dfee', '#e5edf7', '#f1f6fb', '#ffffff']),
  iron: hexes(['#44464e', '#5d6069', '#787b84', '#94979f', '#b0b3b9', '#c9cbcf', '#e0e2e4', '#f3f4f5']),
  ironD: hexes(['#101014', '#1c1c22', '#2a2a32', '#3a3a44', '#4d4d59', '#62626f', '#7a7a88']),
  glow: hexes(['#6a240a', '#a54614', '#d8721f', '#f59a31', '#ffc257', '#ffe08e', '#fff6d2']),
  cloth: hexes(['#3e0a0c', '#5c1014', '#7a171b', '#962024', '#ae2d2c', '#c43e36', '#d6544a']),
  gold: hexes(['#5e3a0c', '#8d5f14', '#bb8a22', '#dfb13a', '#f5d360', '#fff0a6']),
  arcwood: hexes(['#120c16', '#1b1320', '#251a2b', '#302236', '#3c2b42', '#49354f', '#57405d']),
  water: hexes(['#173782', '#1c4696', '#2356aa', '#2c68bb', '#3a7cc9', '#5092d5', '#6eaade', '#98c6ea', '#c6e2f5']),
  wgreen: hexes(['#1d3a10', '#2b5317', '#3b6c1e', '#4f8727', '#67a131', '#82b83f']),
  wgold: hexes(['#5e3e10', '#7f5816', '#a5771f', '#c8972c', '#e0b43d', '#efcb58', '#f9e083', '#fff2b4']),
};

// ------------------------------------------------------------------ generator registry
const GEN = {};
const cache = new Map();

function gen(name) {
  if (!cache.has(name)) {
    const px = new Px(S, S, true);
    const r = makeRng('zombicraft:' + name);
    const g = GEN[name];
    if (g) g(px, r);
    else fallback(px);
    px.wrap = true;
    cache.set(name, px);
  }
  return cache.get(name);
}
const base = (name) => gen(name).clone();
function copyInto(dst, src) { dst.d.set(src.d); }

function fallback(p) {
  p.map((x, y) => (((x >> 2) + (y >> 2)) & 1 ? hex('#ff00ff') : hex('#000000')));
}

// small helper: draw a crack (random walk) with a lit lower-right rim
function cracks(p, r, count, darkC, rimAmt = 0.25, len = [4, 9]) {
  const pts = new Set();
  for (let c = 0; c < count; c++) {
    let x = r.int(0, 31), y = r.int(0, 31);
    const dx = r.sign(), L = r.int(len[0], len[1]);
    const vert = r.chance(0.35);
    for (let i = 0; i < L; i++) {
      pts.add(((x + 32) % 32) + ',' + ((y + 32) % 32));
      if (vert) { y += 1; if (r.chance(0.45)) x += r.sign(); }
      else { x += dx; if (r.chance(0.4)) y += r.sign(); }
    }
  }
  for (const k of pts) {
    const [x, y] = k.split(',').map(Number);
    p.set(x, y, darkC);
  }
  for (const k of pts) {
    const [x, y] = k.split(',').map(Number);
    const kk = ((x + 1) % 32) + ',' + ((y + 1) % 32);
    if (!pts.has(kk)) p.shade(x + 1, y + 1, rimAmt);
    const k2 = ((x + 32 - 1) % 32) + ',' + ((y + 32 - 1) % 32);
    if (!pts.has(k2)) p.shade(x - 1, y - 1, -0.12);
  }
}

// ================================================================== NATURAL
GEN.stone = (p, r) => {
  const n1 = tileFbm(r, S, [4, 8, 16], 0.5);
  const n2 = tileFbm(r, S, [8, 16], 0.55);
  const n3 = tileNoise(r, S, 16);
  // quantized "mineral cluster" levels, embossed so every cluster gets a lit top-left rim
  const lvl = field(S, S, (x, y) => {
    const a = n1(x, y);
    let l = a < 0.4 ? 0 : a < 0.52 ? 1 : a < 0.64 ? 2 : 3;
    const b = n2(x, y);
    if (b > 0.63) l += 1; else if (b < 0.34) l -= 1;
    return l;
  });
  p.map((x, y) => {
    const v = 2.4 + lvl.at(x, y) * 0.95 + (n3(x, y) - 0.5) * 1.1 + emboss(lvl, x, y, 0.75);
    return rampDither(P.stone, v, x, y, 0.25);
  });
  cracks(p, r, 3, P.stone[1], 0.22, [3, 6]);
  for (let i = 0; i < 12; i++) p.shade(r.int(0, 31), r.int(0, 31), r.chance(0.5) ? 0.15 : -0.18);
};

function cobbleData(r) {
  const pts = [];
  const g = 4, cell = S / g;
  for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++) {
    if (r.chance(0.12)) continue;
    pts.push({ x: (gx + 0.5 + (r() - 0.5) * 0.75) * cell + (gy % 2) * 2, y: (gy + 0.5 + (r() - 0.5) * 0.75) * cell, id: pts.length, v: r(), t: r() });
  }
  const vor = voronoiFromPoints(pts, S, 1, 1.25);
  const info = [];
  const mortar = field(S, S, (x, y) => {
    const o = vor(x + 0.5, y + 0.5);
    info[y * S + x] = o;
    return o.d2 - o.d1 < 1.35 ? 1 : 0;
  });
  const nz = tileFbm(r, S, [8, 16, 32], 0.6);
  const vals = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = info[y * S + x];
    if (mortar.at(x, y)) { vals[y * S + x] = -1; continue; }
    const edge = o.d2 - o.d1;
    let v = 3.2 + (o.p.v - 0.5) * 1.6;
    v += clamp(edge / 5, 0, 1) * 0.9;                                  // rounded dome
    let dx = o.p.x - (x + 0.5), dy = o.p.y - (y + 0.5);
    if (dx > 16) dx -= 32; if (dx < -16) dx += 32; if (dy > 16) dy -= 32; if (dy < -16) dy += 32;
    v += (dx + dy) * 0.06;                                             // lit from top-left
    v += (nz(x, y) - 0.5) * 2.2;
    if (mortar.at(x - 1, y) || mortar.at(x, y - 1)) v += 1.3;           // bevel highlight
    if (mortar.at(x - 1, y - 1) && !mortar.at(x - 1, y) && !mortar.at(x, y - 1)) v += 0.6;
    if (mortar.at(x + 1, y) || mortar.at(x, y + 1)) v -= 1.4;           // bevel shadow
    vals[y * S + x] = v;
  }
  return { vals, mortar, info };
}

function paintCobble(p, r, d, ramp = P.cobble) {
  const nz = tileNoise(r, S, 16);
  p.map((x, y) => {
    const v = d.vals[y * S + x];
    if (v < 0) {
      const under = !d.mortar.at(x, y - 1); // directly below a stone -> in its shadow
      return rampAt(P.mortar, 1.6 + (nz(x, y) - 0.5) * 2 - (under ? 1.2 : 0));
    }
    let c = rampDither(ramp, v, x, y, 0.4);
    const t = d.info[y * S + x].p.t;
    if (t < 0.25) c = mix(c, [c[0] * 1.06 + 4, c[1] * 1.0, c[2] * 0.9], 0.6);                  // warm stone
    else if (t > 0.8) c = mix(c, [c[0] * 0.92, c[1] * 0.97, c[2] * 1.08 + 3], 0.6);            // cool stone
    return c;
  });
}

GEN.cobblestone = (p, r) => {
  const d = cobbleData(r);
  paintCobble(p, r, d);
};

GEN.mossy_cobble = (p, r) => {
  const d = cobbleData(makeRng('zombicraft:cobblestone'));
  paintCobble(p, makeRng('zombicraft:cobblestone'), d);
  const m = tileFbm(r, S, [4, 8, 16], 0.6);
  const mn = tileNoise(r, S, 16);
  p.forEach((x, y) => {
    const v = d.vals[y * S + x];
    const mm = m(x, y) + (v < 0 ? 0.12 : 0) + (v > 4.2 ? 0.06 : 0);
    if (mm > 0.56) {
      let mv = 3 + (mn(x, y) - 0.5) * 3 + (v < 0 ? -1.2 : (v - 3.2) * 0.6);
      if (mm < 0.6) mv -= 0.8;
      p.set(x, y, rampDither(P.moss, mv, x, y, 0.5));
    }
  });
  // moss hanging a pixel down (drip) into mortar
  for (let i = 0; i < 10; i++) { const x = r.int(0, 31), y = r.int(0, 31); if (m(x, y) > 0.52) p.set(x, y + 1, P.moss[1]); }
};

GEN.dark_stone = (p, r) => {
  const strata = tileNoise2(r, S, S, 4, 16);
  const n = tileFbm(r, S, [4, 8, 16], 0.6);
  const h = field(S, S, (x, y) => strata(x, y) * 0.6 + n(x, y) * 0.6 + (n(x, y) > 0.6 ? 0.15 : 0));
  p.map((x, y) => rampDither(P.dark, 3.6 + (h.at(x, y) - 0.6) * 4 + emboss(h, x, y, 7), x, y, 0.3));
  cracks(p, r, 4, P.dark[0], 0.3, [4, 10]);
  for (let i = 0; i < 7; i++) { const x = r.int(0, 31), y = r.int(0, 31); p.set(x, y, hex('#6f6480')); }
};

GEN.bedrock = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.7);
  const h = field(S, S, (x, y) => n(x, y));
  p.map((x, y) => {
    const v = (h.at(x, y) - 0.5) * 11 + 3 + emboss(h, x, y, 9);
    return rampDither(P.bedrock, v, x, y, 0.8);
  });
};

GEN.dirt = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.55);
  const n2 = tileNoise(r, S, 8);
  const h = field(S, S, (x, y) => n(x, y) + (n2(x, y) > 0.62 ? 0.18 : 0));
  p.map((x, y) => rampDither(P.dirt, 3.8 + (h.at(x, y) - 0.55) * 3.6 + emboss(h, x, y, 6), x, y, 0.5));
  // roots (thin, dark)
  for (let k = 0; k < 2; k++) {
    let x = r.int(0, 31), y = r.int(0, 31);
    const dx = r.sign();
    for (let i = 0; i < r.int(5, 8); i++) {
      p.set(x, y, P.dirt[1]); p.shade(x, y - 1, 0.12);
      x += dx; if (r.chance(0.45)) y += r.sign();
    }
  }
  // pebbles
  const peb = hexes(['#3e3630', '#5c534b', '#7b7167', '#998e82', '#b3a99c']);
  for (let i = 0; i < 6; i++) {
    const x = r.range(0, 32), y = r.range(0, 32), rx = r.range(1.2, 2.1), ry = r.range(1.0, 1.5);
    blob(p, x + 0.6, y + 0.8, rx, ry, [P.dirt[0]], { dither: 0 });
    blob(p, x, y, rx, ry, peb, { dither: 0.3, bias: 0.12 });
  }
  for (let i = 0; i < 26; i++) p.shade(r.int(0, 31), r.int(0, 31), r.chance(0.5) ? 0.22 : -0.28);
};

GEN.grass_top = (p, r) => {
  const n = tileFbm(r, S, [8, 16], 0.5);
  const low = tileNoise(r, S, 4);
  const low2 = tileNoise(r, S, 8);
  const tone = (x, y) => (low(x, y) - 0.5) * 2.2 + (low2(x, y) - 0.5) * 0.9;
  // darker under-layer = shadowed gaps between blades
  p.map((x, y) => rampAt(P.grass, 2.9 + tone(x, y) + (n(x, y) - 0.5) * 1.8));
  const blades = [];
  for (let i = 0; i < 300; i++) blades.push({ x: r.int(0, 31), y: r.int(0, 31), L: r.int(2, 3), lean: r.chance(0.35) ? r.sign() : 0, j: r.range(-0.4, 1.4) });
  blades.sort((a, b) => a.y - b.y);
  for (const b of blades) {
    const bv = 4.1 + tone(b.x, b.y) + b.j;
    p.set(b.x, b.y + 1, rampAt(P.grass, bv - 2.3));
    for (let k = 0; k < b.L; k++) {
      const tip = k === b.L - 1;
      p.set(b.x + (tip ? b.lean : 0), b.y - k, rampAt(P.grass, bv - 0.7 + k * 0.9 + (tip ? 0.5 : 0)));
    }
  }
  for (let i = 0; i < 5; i++) { const x = r.int(0, 31), y = r.int(0, 31); p.set(x, y, P.grass[8]); p.set(x + 1, y, P.grass[7]); }
};

function overhang(p, r, ramp, base, opts = {}) {
  const { min = 4, var: vr = 3, drips = 0.3, dripLen = [1, 3], top = 5.2, snow = false } = opts;
  const n1 = tileNoise(r, S, 8);
  const depth = [];
  for (let x = 0; x < S; x++) {
    let d = min + Math.round(n1(x, 0) * vr);
    if (r.chance(drips)) d += r.int(dripLen[0], dripLen[1]);
    depth.push(d);
  }
  if (snow) for (let x = 0; x < S; x++) depth[x] = Math.round((depth[x] + depth[(x + 1) % S] + depth[(x + 31) % S]) / 3);
  const nz = tileNoise(r, S, 16);
  for (let x = 0; x < S; x++) {
    const D = depth[x];
    for (let y = 0; y < D; y++) {
      let v = top - y * (snow ? 0.18 : 0.32) + (nz(x, y) - 0.5) * 2.2;
      if (y === D - 1) v = snow ? 2 : 1.3 + (nz(x, y) - 0.5);
      if (y === D - 2 && !snow) v -= 0.7;
      if (y === 0) v += 0.8;
      p.set(x, y, rampDither(ramp, v, x, y, 0.7));
    }
    p.shade(x, D, -0.35);
    p.shade(x, D + 1, -0.15);
  }
}

GEN.grass_side = (p, r) => {
  copyInto(p, gen('dirt'));
  overhang(p, r, P.grass, 'dirt');
  // a few blades poking over the top edge region
  for (let i = 0; i < 14; i++) { const x = r.int(0, 31); p.set(x, 0, P.grass[7]); p.set(x, 1, P.grass[6]); }
};

GEN.sand = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.55);
  const wob = tileNoise(r, S, 4);
  const ph = r.range(0, 6.28);
  p.map((x, y) => {
    let v = 4 + (n(x, y) - 0.5) * 2;
    const off = 1.6 * Math.sin((x / 32) * Math.PI * 2 + ph) + wob(x, y) * 3;
    const q = (((y + off) / 8) % 1 + 1) % 1;
    if (q < 0.14) v += 1.3; else if (q < 0.28) v -= 0.9;
    return rampDither(P.sand, v, x, y, 0.8);
  });
  for (let i = 0; i < 40; i++) { const x = r.int(0, 31), y = r.int(0, 31); p.set(x, y, r.chance(0.55) ? P.sand[7] : P.sand[1]); }
  for (let i = 0; i < 6; i++) p.set(r.int(0, 31), r.int(0, 31), r.pick(hexes(['#8b7c69', '#a0685a', '#6f7480'])));
};

GEN.gravel = (p, r) => {
  p.fill(hex('#2e2a2a'));
  const n = tileNoise(r, S, 16);
  p.map((x, y) => rampAt(hexes(['#221f20', '#2e2a2a', '#3a3535']), 1 + (n(x, y) - 0.5) * 3));
  const ramps = [
    hexes(['#3f3e44', '#58575d', '#74727a', '#918e94', '#afacae', '#c7c3c2']),
    hexes(['#43382f', '#5f5046', '#7c6a5c', '#998473', '#b59f8b', '#cbb8a4']),
    hexes(['#373c47', '#4e5562', '#68707e', '#848c99', '#a2a9b3']),
    hexes(['#2c2a2c', '#403d40', '#575356', '#6f6a6c', '#89847f']),
  ];
  const pebs = [];
  for (let i = 0; i < 40; i++) pebs.push({ x: r.range(0, 32), y: r.range(0, 32), rx: r.range(1.9, 3.4), ry: r.range(1.5, 2.7), ramp: r.pick(ramps), b: r.range(-0.12, 0.1) });
  pebs.sort((a, b) => a.y - b.y);
  for (const q of pebs) {
    blob(p, q.x + 0.7, q.y + 0.9, q.rx, q.ry, [hex('#1b1819')], { dither: 0 });
    blob(p, q.x, q.y, q.rx, q.ry, q.ramp, { bias: q.b, dither: 0.15 });
  }
};

// ------------------------------------------------------------------ ores
function oreNuggets(p, r, cols, clusters, opts = {}) {
  const { per = [3, 5], spread = 3.5 } = opts;
  const spots = [];
  for (let c = 0; c < clusters; c++) {
    const cx = r.range(0, 32), cy = r.range(0, 32);
    const n = r.int(per[0], per[1]);
    for (let i = 0; i < n; i++) spots.push({ x: cx + r.range(-spread, spread), y: cy + r.range(-spread, spread), rx: r.range(1.1, 1.9), ry: r.range(1.0, 1.6) });
  }
  for (const q of spots) blob(p, q.x + 0.8, q.y + 0.9, q.rx, q.ry, [cols[0]], { dither: 0 });
  for (const q of spots) {
    blob(p, q.x, q.y, q.rx, q.ry, cols.slice(1), { dither: 0.2, bias: -0.05 });
    p.set(Math.floor(q.x - q.rx * 0.35), Math.floor(q.y - q.ry * 0.4), cols[4]);
  }
  return spots;
}

function ore(p, r, cols, clusters, opts) {
  copyInto(p, gen('stone'));
  return oreNuggets(p, r, cols, clusters, opts);
}

GEN.coal_ore = (p, r) => ore(p, r, hexes(['#050507', '#111115', '#1a1a20', '#282830', '#5c5e70']), 5);
GEN.iron_ore = (p, r) => ore(p, r, hexes(['#3a2317', '#8a5a3a', '#bf8a63', '#dcae88', '#f6dcc0']), 5);
GEN.gold_ore = (p, r) => ore(p, r, hexes(['#4a2e06', '#b07814', '#e2aa28', '#f8d64e', '#fff7b8']), 5);
GEN.crystal_ore = (p, r) => {
  copyInto(p, gen('stone'));
  // darken & cool the host rock slightly
  p.forEach((x, y) => p.tint(x, y, hex('#2a2440'), 0.18));
  const shards = [];
  for (let c = 0; c < 4; c++) {
    const cx = r.int(0, 31), cy = r.int(0, 31);
    for (let i = 0; i < r.int(2, 3); i++) shards.push([cx + r.int(-4, 4), cy + r.int(-4, 4), r.int(3, 5), r.chance(0.5)]);
  }
  // glow halo
  for (const [x, y, h] of shards) for (let j = -3; j <= h + 2; j++) for (let i = -3; i <= 4; i++) {
    const d = Math.hypot(i - 0.5, (j - h / 2) * 0.8);
    if (d < 4.2) p.tint(x + i, y + j, hex('#7a5cff'), 0.22 * (1 - d / 4.2) + 0.05);
  }
  const cyan = hexes(['#1a4a7a', '#2fa6d6', '#6fe6ff', '#c8fbff']);
  const vio = hexes(['#2c1560', '#6a3cc8', '#a57bff', '#e2d0ff']);
  for (const [x, y, h, flip] of shards) {
    const a = flip ? vio : cyan, b = flip ? cyan : vio;
    const H = h + 2;
    for (let j = 0; j < H; j++) {
      const tip = j === 0, bot = j === H - 1;
      p.set(x + 1, y + j, tip ? a[3] : a[2 + (j === 1 ? 1 : 0)]);
      if (!tip) { p.set(x, y + j, bot ? a[1] : a[3]); p.set(x + 2, y + j, bot ? b[0] : b[1 + (j & 1)]); }
    }
    p.set(x + 1, y + H, hex('#140c2a')); p.set(x + 3, y + 2, hex('#140c2a')); p.set(x + 3, y + 3, hex('#140c2a'));
    p.set(x, y + 1, hex('#ffffff'));
  }
};

// ------------------------------------------------------------------ logs
function barkSide(p, r, ramp, opts = {}) {
  const { fissures = 6, streak = [8, 2], contrast = 3 } = opts;
  const n1 = tileNoise2(r, S, S, streak[0], streak[1]);
  const n2 = tileNoise2(r, S, S, 16, 4);
  const h = field(S, S, (x, y) => n1(x, y) * 0.65 + n2(x, y) * 0.35);
  const vals = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) vals[y * S + x] = 3.2 + (h.at(x, y) - 0.5) * contrast + emboss(h, x, y, 4);
  const fis = new Uint8Array(S * S);
  for (let f = 0; f < fissures; f++) {
    const x0 = r.int(0, 31), ph = r.range(0, 6.28), amp = r.range(0.6, 1.6), k = r.int(1, 2);
    const full = r.chance(0.6);
    const y0 = r.int(0, 31), L = full ? 32 : r.int(8, 18);
    for (let t = 0; t < L; t++) {
      const y = (y0 + t) % 32;
      const x = (x0 + Math.round(amp * Math.sin((y / 32) * Math.PI * 2 * k + ph)) + 32) % 32;
      fis[y * S + x] = 1;
      if (r.chance(0.2)) fis[y * S + ((x + 1) % 32)] = 1;
    }
  }
  p.map((x, y) => {
    const i = y * S + x;
    let v = vals[i];
    if (fis[i]) v = 0.4 + r() * 0.6;
    else {
      if (fis[y * S + ((x + 31) % 32)]) v += 1.2;   // ridge lit (left edge of ridge right of fissure)
      if (fis[y * S + ((x + 1) % 32)]) v -= 0.8;
    }
    return rampDither(ramp, v, x, y, 0.4);
  });
  return fis;
}

GEN.log_side = (p, r) => {
  barkSide(p, r, P.bark);
  for (let i = 0; i < 5; i++) { const x = r.int(0, 31), y = r.int(0, 31); p.set(x, y, P.bark[0]); p.set(x + 1, y, P.bark[1]); p.shade(x, y + 1, 0.25); }
};

function logTop(p, r, wood, bark, opts = {}) {
  const { ringW = 2.6, barkW = 2 } = opts;
  const n = tileNoise(r, S, 8);
  const nb = tileNoise(r, S, 16);
  const edge = S / 2 - barkW;
  const ang = r.range(0, Math.PI * 2);
  const crackDir = [Math.cos(ang), Math.sin(ang)];
  p.map((x, y) => {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16;
    const dm = Math.max(Math.abs(dx), Math.abs(dy));
    const de = Math.hypot(dx, dy);
    if (dm > edge) return rampDither(bark, 3 + (nb(x, y) - 0.5) * 4 + (dm > 15 ? -0.6 : 0.4), x, y, 0.6);
    if (dm > edge - 1) return rampAt(bark, 0.6 + nb(x, y));
    const d = de * 0.55 + dm * 0.45 + (n(x, y) - 0.5) * 0.9;
    const ring = (d / ringW) % 1;
    let v = 4.4 - d * 0.06 + (nb(x, y) - 0.5) * 0.7;
    if (ring < 0.28) v -= 1.7;
    else if (ring > 0.8) v += 0.4;
    if (d < 1.4) v = 1.8;
    // radial crack
    const along = dx * crackDir[0] + dy * crackDir[1];
    const perp = Math.abs(dx * crackDir[1] - dy * crackDir[0]);
    if (along > 2 && along < 11 && perp < 0.6) v = 0.6;
    return rampAt(wood, v);
  });
}

GEN.log_top = (p, r) => logTop(p, r, P.wood, P.bark);

GEN.spruce_log_side = (p, r) => {
  // scaly plates: vertically elongated voronoi with dark gaps
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push({ x: r.range(0, 32), y: r.range(0, 32), v: r(), id: i });
  const vor = voronoiFromPoints(pts, S, 2.2, 0.35);
  const n = tileNoise2(r, S, S, 16, 4);
  const h = field(S, S, (x, y) => { const o = vor(x + 0.5, y + 0.5); return o.d2 - o.d1 < 0.9 ? 0 : 0.5 + o.p.v * 0.3 + n(x, y) * 0.4; });
  p.map((x, y) => {
    const hv = h.at(x, y);
    if (hv === 0) return rampAt(P.sbark, 0.5 + n(x, y));
    return rampDither(P.sbark, 1.6 + hv * 3 + emboss(h, x, y, 2.2), x, y, 0.5);
  });
};
GEN.spruce_log_top = (p, r) => logTop(p, r, P.swood, P.sbark, { ringW: 2.1 });

GEN.birch_log_side = (p, r) => {
  const n = tileNoise2(r, S, S, 8, 2);
  const n2 = tileFbm(r, S, [8, 16], 0.5);
  p.map((x, y) => rampDither(P.birch, 4 + (n(x, y) - 0.5) * 2 + (n2(x, y) - 0.5) * 1.5, x, y, 0.6));
  // horizontal lenticels
  for (let i = 0; i < 16; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), L = r.int(2, 6);
    for (let k = 0; k < L; k++) p.set(x + k, y, P.birchMark[k === 0 || k === L - 1 ? 2 : 1]);
    for (let k = 0; k < L; k++) p.shade(x + k, y + 1, 0.12);
  }
  // black scar patches
  for (let i = 0; i < 3; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), w = r.int(3, 6), h = r.int(2, 3);
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
      if ((j === 0 || j === h - 1) && (k === 0 || k === w - 1)) continue;
      p.set(x + k, y + j, P.birchMark[j === h - 1 ? 0 : r.int(0, 1)]);
    }
    for (let k = 1; k < w - 1; k++) p.shade(x + k, y - 1, -0.12);
  }
  // shading grooves
  for (let i = 0; i < 4; i++) { const x = r.int(0, 31); for (let y = 0; y < 32; y++) if (r.chance(0.5)) p.shade(x, y, -0.08); }
};
GEN.birch_log_top = (p, r) => {
  logTop(p, r, P.bwood, P.birch, { ringW: 2.4 });
  for (let i = 0; i < 18; i++) {
    const t = r.int(0, 3), k = r.int(0, 31);
    const [x, y] = [[k, r.int(0, 1)], [k, 30 + r.int(0, 1)], [r.int(0, 1), k], [30 + r.int(0, 1), k]][t];
    p.set(x, y, P.birchMark[1]);
  }
};

// ------------------------------------------------------------------ leaves (cutout)
function leafTile(p, r, ramp, opts = {}) {
  const { count = 64, rmin = 1.6, rmax = 2.9, holeT = 0.64, interior = 1 } = opts;
  const holes = tileFbm(r, S, [8, 16], 0.6);
  // interior shadow fill; holes transparent
  p.map((x, y) => (holes(x, y) > holeT ? null : rampAt(ramp, interior + (holes(x, y) < 0.35 ? 0.5 : 0))));
  const cl = [];
  for (let i = 0; i < count; i++) cl.push({ x: r.range(0, 32), y: r.range(0, 32), rx: r.range(rmin, rmax), ry: r.range(rmin * 0.8, rmax * 0.85), z: r() });
  cl.sort((a, b) => a.z - b.z);
  const n = ramp.length - 1;
  for (const c of cl) {
    for (let y = Math.floor(c.y - c.ry - 1); y <= c.y + c.ry + 1; y++) for (let x = Math.floor(c.x - c.rx - 1); x <= c.x + c.rx + 1; x++) {
      const dx = (x + 0.5 - c.x) / c.rx, dy = (y + 0.5 - c.y) / c.ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (holes(x, y) > holeT + 0.1 && d > 0.5) continue;
      const l = clamp(-(dx * -0.6 + dy * -0.75) * 0.7 + (1 - d) * 0.5, 0, 1);
      const v = 1.2 + c.z * 2.2 + l * (n - 3);
      p.set(x, y, rampDither(ramp, v, x, y, 0.6));
    }
  }
  // a few bright specular leaf tips
  for (let i = 0; i < 10; i++) { const c = cl[cl.length - 1 - i]; p.set(Math.floor(c.x - c.rx * 0.4), Math.floor(c.y - c.ry * 0.5), ramp[n]); }
}

GEN.leaves = (p, r) => leafTile(p, r, P.leaf);
GEN.birch_leaves = (p, r) => leafTile(p, r, P.bleaf, { count: 90, rmin: 1.3, rmax: 2.2, holeT: 0.62 });
GEN.spruce_leaves = (p, r) => {
  const holes = tileFbm(r, S, [8, 16], 0.6);
  p.map((x, y) => (holes(x, y) > 0.66 ? null : rampAt(P.sleaf, 0.6 + (holes(x, y) < 0.4 ? 0.6 : 0))));
  // needle sprays: short diagonal strokes fanning downward
  for (let i = 0; i < 95; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), z = r();
    const bv = 2 + z * 3.5;
    const dirs = [[-1, 1], [1, 1], [-1, 0], [1, 0], [0, 1]];
    p.set(x, y, rampAt(P.sleaf, bv + 1.5));
    for (let k = 0; k < 3; k++) {
      const [dx, dy] = dirs[r.int(0, dirs.length - 1)];
      const L = r.int(2, 3);
      for (let s = 1; s <= L; s++) p.set(x + dx * s, y + dy * s, rampAt(P.sleaf, bv + 1 - s * 0.6));
    }
  }
  for (let i = 0; i < 14; i++) p.set(r.int(0, 31), r.int(0, 31), P.sleaf[7]);
};

// ------------------------------------------------------------------ wood / construction
GEN.planks = (p, r) => {
  const grain = tileNoise2(r, S, S, 3, 32);
  const grain2 = tileNoise2(r, S, S, 6, 32);
  const joints = [5, 21, 13, 28];
  const tones = [r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4)];
  p.map((x, y) => {
    const b = y >> 3, ly = y & 7;
    let v = 4 + tones[b] + (grain(x, y) - 0.5) * 2.2 + (grain2(x, y) - 0.5) * 0.9;
    if (ly === 7) v = 1.0 + (grain(x, y) - 0.5);
    else if (ly === 0) v += 1.0;
    else if (ly === 6) v -= 0.5;
    const jx = joints[b];
    if (x === jx && ly !== 7) v = 1.2;
    else if (x === (jx + 1) % 32 && ly !== 7) v += 0.9;
    return rampDither(P.plank, v, x, y, 0.35);
  });
  // grain lines
  for (let b = 0; b < 4; b++) for (let g = 0; g < 3; g++) {
    let x = r.int(0, 31), y = b * 8 + r.int(2, 5);
    const L = r.int(6, 16);
    for (let k = 0; k < L; k++) {
      if (x % 32 === joints[b] || (x + 31) % 32 === joints[b]) break;
      p.shade(x, y, -0.2);
      x++;
      if (r.chance(0.12)) y += (y - b * 8 > 3 ? -1 : 1);
    }
  }
  // knots
  for (let k = 0; k < 2; k++) {
    const b = r.int(0, 3), kx = (joints[b] + r.int(5, 12)) % 32, ky = b * 8 + 3;
    p.set(kx, ky, P.plank[0]); p.set(kx + 1, ky, P.plank[1]);
    p.set(kx - 1, ky, P.plank[2]); p.set(kx + 2, ky, P.plank[2]);
    p.set(kx, ky - 1, P.plank[3]); p.set(kx + 1, ky + 1, P.plank[2]); p.set(kx, ky + 1, P.plank[3]);
    p.shade(kx + 1, ky - 1, 0.15);
  }
  // nails beside each joint
  for (let b = 0; b < 4; b++) {
    const x = (joints[b] + 2) % 32;
    for (const ly of [2, 5]) { p.set(x, b * 8 + ly, hex('#2b1b12')); p.set(x - 1, b * 8 + ly - 1, P.plank[7]); }
  }
};

GEN.stone_bricks = (p, r) => {
  const n = tileFbm(r, S, [8, 16], 0.6);
  const h = field(S, S, (x, y) => n(x, y));
  const tone = [];
  for (let i = 0; i < 16; i++) tone.push(r.range(-0.5, 0.5));
  p.map((x, y) => {
    const row = y >> 3, ly = y & 7;
    const off = row & 1 ? 8 : 0;
    const lx = (x + off) & 15, bi = row * 2 + (((x + off) >> 4) & 1);
    if (ly === 7 || lx === 15) return rampAt(P.mortar, 1.5 + (n(x, y) - 0.5) * 2);
    let v = 4 + tone[bi] + (h.at(x, y) - 0.5) * 2.4 + emboss(h, x, y, 4);
    if (ly === 0) v += 1.3; if (lx === 0) v += 0.8;
    if (ly === 6) v -= 1.1; if (lx === 14) v -= 0.9;
    return rampDither(P.brick, v, x, y, 0.4);
  });
  // chips at brick corners
  for (let i = 0; i < 6; i++) {
    const row = r.int(0, 3), off = row & 1 ? 8 : 0, col = r.int(0, 1);
    const x = (col * 16 - off + (r.chance(0.5) ? 0 : 14) + 32) % 32, y = row * 8 + (r.chance(0.5) ? 0 : 6);
    p.set(x, y, P.mortar[2]);
  }
  cracks(p, r, 2, P.brick[1], 0.2, [3, 5]);
};

GEN.thatch = (p, r) => {
  const wob = [];
  for (let x = 0; x < S; x++) wob.push(r.int(0, 1) + (r.chance(0.15) ? 1 : 0));
  const strand = [];
  for (let i = 0; i < 4 * S; i++) strand.push(r());
  p.map((x, y) => {
    let yy = y - wob[x];
    const layer = ((Math.floor(yy / 8) % 4) + 4) % 4, ly = ((yy % 8) + 8) % 8;
    const sx = (x + (layer & 1 ? 3 : 0) + Math.floor(ly / 3) * (layer & 1 ? 1 : -1) + 32) % 32;
    const s = strand[layer * S + sx];
    let v = 3.3 + s * 3;
    v -= Math.max(0, 2.5 - ly) * 0.9;        // shadow under the overlapping layer
    if (ly === 7) v += 0.7;
    if (s < 0.14) v = 1 + ly * 0.1;
    return rampDither(P.straw, v, x, y, 0.3);
  });
  for (let i = 0; i < 18; i++) { const x = r.int(0, 31), y = r.int(0, 31); p.set(x, y, P.straw[7]); p.set(x, y + 1, P.straw[6]); }
};

GEN.roof_tiles = (p, r) => {
  const tone = [];
  for (let i = 0; i < 16; i++) tone.push(r.range(-0.6, 0.5));
  const n = tileNoise(r, S, 16);
  const yb = (sx) => 7 + 2.4 * Math.sqrt(Math.max(0, 1 - ((sx + 0.5 - 4) / 4.2) ** 2));
  p.map((x, y) => {
    const row = y >> 3, ly = y & 7;
    const up = (row + 3) & 3;
    const oUp = (up & 1) * 4, oCur = (row & 1) * 4;
    const lxU = (x - oUp + 32) & 7;
    let lx, sy, id, shadow = false;
    if (ly + 8 < yb(lxU)) { lx = lxU; sy = ly + 8; id = up * 4 + (((x - oUp + 32) >> 3) & 3); }
    else {
      lx = (x - oCur + 32) & 7; sy = ly; id = row * 4 + (((x - oCur + 32) >> 3) & 3);
      if (ly + 8 < yb(lxU) + 1.3) shadow = true;
    }
    let v = 3.6 + tone[id] + 1.1 * Math.cos(((lx + 0.5 - 4) / 4) * Math.PI * 0.5) - 0.4 + sy * 0.09 + (n(x, y) - 0.5) * 1.2;
    if (sy + 1 >= yb(lx)) v = 1.2;
    else if (sy + 2 >= yb(lx)) v += 0.8;
    if (lx === 7) v -= 1.2; if (lx === 0) v += 0.4;
    if (shadow) v -= 1.6;
    return rampDither(P.terra, v, x, y, 0.4);
  });
  for (let i = 0; i < 8; i++) p.shade(r.int(0, 31), r.int(0, 31), r.chance(0.5) ? 0.2 : -0.25);
};

GEN.plaster = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.6);
  const h = field(S, S, (x, y) => n(x, y));
  p.map((x, y) => rampDither(P.plaster, 4.1 + (h.at(x, y) - 0.5) * 2 + emboss(h, x, y, 3), x, y, 0.7));
  cracks(p, r, 2, P.plaster[2], 0.1, [3, 6]);
  for (let i = 0; i < 12; i++) p.shade(r.int(0, 31), r.int(0, 31), -0.1);
};

GEN.timber_frame = (p, r) => {
  copyInto(p, gen('plaster'));
  const g = tileNoise2(r, S, S, 4, 32);
  const gd = tileNoise(r, S, 16);
  const isBeam = (x, y) => {
    x = (x + 32) % 32; y = (y + 32) % 32;
    return x < 2 || x > 29 || y < 2 || y > 29 || Math.abs(x + y - 31) <= 1;
  };
  p.forEach((x, y) => {
    if (!isBeam(x, y)) {
      if (isBeam(x - 1, y) || isBeam(x, y - 1)) p.shade(x, y, -0.3);
      return;
    }
    const diag = !(x < 2 || x > 29 || y < 2 || y > 29);
    let v = 3.2 + (diag ? (gd((x - y + 64) % 32, 0) - 0.5) * 2.5 : ((x < 2 || x > 29) ? (g(y, x) - 0.5) : (g(x, y) - 0.5)) * 2.5);
    if (!isBeam(x - 1, y) || !isBeam(x, y - 1)) v += 1.4;
    if (!isBeam(x + 1, y) || !isBeam(x, y + 1)) v -= 1.2;
    if (y === 0 || x === 0) v += 0.6;
    if (y === 31 || x === 31) v -= 0.6;
    p.set(x, y, rampDither(P.darkoak, v, x, y, 0.3));
  });
  // pegs where the diagonal meets the frame
  for (const [x, y] of [[3, 29], [29, 3]]) { p.set(x - 1, y - 1, hex('#8c6a45')); }
};

GEN.farmland = (p, r) => {
  const n = tileFbm(r, S, [8, 16, 32], 0.7);
  const prof = [5, 4.4, 4, 3.3, 2.1, 1.1, 1.0, 2.2];
  const wob = tileNoise(r, S, 8);
  const h = field(S, S, (x, y) => { const yy = y + Math.round((wob(x, y) - 0.5) * 2.2); return prof[((yy % 8) + 8) % 8] / 5 + (n(x, y) - 0.5) * 0.9; });
  p.map((x, y) => rampDither(P.farm, h.at(x, y) * 4.4 + 0.7 + emboss(h, x, y, 1.8), x, y, 0.5));
  // clods on the ridges
  for (let i = 0; i < 12; i++) {
    const x = r.range(0, 32), y = r.int(0, 3) * 8 + r.range(0.5, 2.5);
    blob(p, x + 0.6, y + 0.8, r.range(1, 1.6), 1, [P.farm[0]], { dither: 0 });
    blob(p, x, y, r.range(1, 1.7), r.range(0.8, 1.2), P.farm.slice(3), { dither: 0.2 });
  }
  // wet glints in the troughs
  for (let i = 0; i < 8; i++) { const x = r.int(0, 31), y = (r.int(0, 3) * 8) + 5; p.set(x, y, hex('#46394a')); }
};

GEN.path_top = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.55);
  const h = field(S, S, (x, y) => n(x, y));
  p.map((x, y) => rampDither(P.path, 4.2 + (h.at(x, y) - 0.5) * 2.4 + emboss(h, x, y, 4), x, y, 0.6));
  const peb = hexes(['#4a4038', '#6f665c', '#968c80', '#b7ad9f']);
  for (let i = 0; i < 9; i++) {
    const x = r.int(0, 31), y = r.int(0, 31);
    p.set(x, y, peb[3]); p.set(x + 1, y, peb[2]); p.set(x + 1, y + 1, peb[1]); p.set(x, y + 1, peb[2]); p.set(x + 2, y + 1, P.path[1]);
  }
  cracks(p, r, 2, P.path[1], 0.25, [3, 6]);
};

GEN.snow = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.5);
  const h = field(S, S, (x, y) => n(x, y));
  p.map((x, y) => rampDither(P.snow, 4.5 + (h.at(x, y) - 0.5) * 2 + emboss(h, x, y, 5), x, y, 0.7));
  for (let i = 0; i < 14; i++) p.set(r.int(0, 31), r.int(0, 31), r.chance(0.6) ? hex('#ffffff') : hex('#d8f2ff'));
};
GEN.snow_side = (p, r) => {
  copyInto(p, gen('dirt'));
  overhang(p, r, P.snow, 'dirt', { min: 5, var: 3, drips: 0.1, dripLen: [1, 3], top: 5.4, snow: true });
};

GEN.hay_side = (p, r) => {
  const st = [];
  for (let x = 0; x < S; x++) st.push(r());
  const n = tileNoise2(r, S, S, 16, 4);
  const bands = [6, 24];
  p.map((x, y) => {
    const sx = (x + (((y >> 2) & 1) ? 1 : 0)) % 32;
    let v = 3.2 + st[sx] * 2.6 + (n(x, y) - 0.5) * 1.5;
    if (st[sx] < 0.12) v = 1.2;
    for (const b of bands) {
      const d = y - b;
      if (d >= 0 && d < 3) {
        const tw = ((x + d) % 3 === 0);
        return rampAt(hexes(['#3f1f12', '#5e3019', '#7c4424', '#9a5a30', '#b57442']), (d === 0 ? 3 : d === 2 ? 1.5 : 2.5) + (tw ? -1 : 0.4));
      }
      if (d === 3) v -= 1.6;
      if (d === -1) v -= 0.6;
    }
    return rampDither(P.straw, v, x, y, 0.3);
  });
};
GEN.hay_top = (p, r) => {
  const n = tileFbm(r, S, [8, 16], 0.5);
  p.map((x, y) => rampDither(P.straw, 3.0 + (n(x, y) - 0.5) * 2, x, y, 0.3));
  for (let i = 0; i < 110; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), L = r.int(4, 8);
    const dir = r.pick([[1, 0], [1, 1], [1, -1], [2, 1], [2, -1]]);
    const v = r.range(2.5, 7.2);
    for (let k = 0; k < L; k++) {
      const xx = x + Math.round(k * dir[0] / Math.max(1, Math.abs(dir[0]) === 2 ? 1 : 1)), yy = y + Math.round((k * dir[1]) / (dir[0] === 2 ? 2 : 1));
      p.set(xx, yy, rampAt(P.straw, v - (k === L - 1 ? 0.8 : 0)));
    }
    p.shade(x, y + 1, -0.25);
  }
  // twine bands continuing from sides
  for (const b of [6, 24]) for (let x = 0; x < 32; x++) {
    p.set(x, b, hex('#7c4424')); p.set(x, b + 1, ((x & 1) ? hex('#5e3019') : hex('#9a5a30')));
    p.shade(x, b + 2, -0.3);
  }
};

GEN.palisade_side = (p, r) => {
  const n = tileNoise2(r, S, S, 16, 3);
  const cyl = [-1.6, 0.3, 1.0, 0.9, 0.5, 0.0, -0.6, -2.4];
  const tone = [r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4)];
  p.map((x, y) => {
    const lx = x & 7, lg = x >> 3;
    let v = 3.3 + cyl[lx] + tone[lg] + (n(x, y) - 0.5) * 2.2;
    return rampDither(P.bark, v, x, y, 0.5);
  });
  for (let i = 0; i < 7; i++) {
    const lg = r.int(0, 3), x = lg * 8 + r.int(2, 5), y0 = r.int(0, 31), L = r.int(4, 10);
    for (let k = 0; k < L; k++) { p.set(x, y0 + k, P.bark[0]); p.shade(x + 1, y0 + k, 0.2); }
  }
  // rope lashings
  const rope = hexes(['#3e2a14', '#6b4c26', '#8f6a38', '#b08b4e', '#c9a766']);
  for (const b of [5, 23]) for (let x = 0; x < 32; x++) {
    const lx = x & 7;
    const c = (lx === 7) ? 0 : 1;
    for (let d = 0; d < 3; d++) {
      const tw = (x + d) % 3;
      p.set(x, b + d, rope[clamp((tw === 0 ? 3 : tw === 1 ? 2 : 1) + (d === 0 ? 1 : 0) - (c ? 0 : 2) + (lx === 2 ? 1 : 0), 0, 4)]);
    }
    p.shade(x, b + 3, -0.35);
  }
};
GEN.palisade_top = (p, r) => {
  p.fill(hex('#120c08'));
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const cx = gx * 8 + 4, cy = gy * 8 + 4, rad = 3.9;
    const facets = 6, rot = r.range(0, 1);
    for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > rad) continue;
      if (d > rad - 0.9) { p.set(x, y, rampAt(P.bark, 2 + (dx < 0 ? 1 : 0))); continue; }
      const a = Math.atan2(dy, dx);
      const f = Math.floor(((a + Math.PI) / (Math.PI * 2)) * facets + rot) % facets;
      const fa = ((f + 0.5 - rot) / facets) * Math.PI * 2 - Math.PI;
      const lit = -(Math.cos(fa) * 0.7 + Math.sin(fa) * 0.7);
      p.set(x, y, rampAt(P.wood, 3 + lit * 1.8 + (d < 1 ? 1.2 : 0)));
    }
  }
};

function brickLike(p, r, ramp, mortarRamp) {
  const n = tileFbm(r, S, [8, 16], 0.6);
  const h = field(S, S, (x, y) => n(x, y));
  const tone = [];
  for (let i = 0; i < 16; i++) tone.push(r.range(-0.5, 0.5));
  p.map((x, y) => {
    const row = y >> 3, ly = y & 7, off = row & 1 ? 8 : 0;
    const lx = (x + off) & 15, bi = row * 2 + (((x + off) >> 4) & 1);
    if (ly === 7 || lx === 15) return rampAt(mortarRamp, 1.2 + (n(x, y) - 0.5) * 2);
    let v = 3.4 + tone[bi] + (h.at(x, y) - 0.5) * 2.4 + emboss(h, x, y, 4);
    if (ly === 0 || lx === 0) v += 1.1;
    if (ly === 6 || lx === 14) v -= 1.0;
    return rampDither(ramp, v, x, y, 0.4);
  });
}
function ironBand(p, x0, y0, w, h, vertical = false) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const t = vertical ? x - x0 : y - y0, L = vertical ? w : h;
    let v = 3.4;
    if (t === 0) v = 5; else if (t === L - 1) v = 1.6;
    v += (((vertical ? y : x) * 7) % 5 === 0) ? -0.4 : 0;
    p.set(x, y, rampAt(P.ironD, v));
  }
  if (vertical) { for (let y = y0; y < y0 + h; y++) p.shade(x0 + w, y, -0.4); }
  else for (let x = x0; x < x0 + w; x++) p.shade(x, y0 + h, -0.45);
}
function rivet(p, x, y) {
  p.set(x, y, P.iron[5]); p.set(x + 1, y, P.iron[3]); p.set(x, y + 1, P.iron[3]); p.set(x + 1, y + 1, P.ironD[1]);
}
GEN.reinforced_side = (p, r) => {
  brickLike(p, r, P.dark.map((c) => shift(c, 0.12)), P.mortar);
  ironBand(p, 0, 2, 32, 4); ironBand(p, 0, 26, 32, 4); ironBand(p, 14, 0, 4, 32, true);
  ironBand(p, 0, 2, 32, 4); ironBand(p, 0, 26, 32, 4);
  for (const y of [3, 27]) for (const x of [3, 9, 22, 28]) rivet(p, x, y);
  for (const y of [11, 19]) rivet(p, 15, y);
  for (let i = 0; i < 10; i++) { const x = r.int(0, 31), y = r.chance(0.5) ? r.int(2, 5) : r.int(26, 29); p.tint(x, y, hex('#8a4520'), 0.5); }
};
GEN.reinforced_top = (p, r) => {
  brickLike(p, r, P.dark.map((c) => shift(c, 0.12)), P.mortar);
  ironBand(p, 0, 14, 32, 4); ironBand(p, 14, 0, 4, 32, true);
  for (const [x, y] of [[2, 2], [28, 2], [2, 28], [28, 28], [15, 15]]) rivet(p, x, y);
  for (let i = 0; i < 8; i++) p.tint(r.int(0, 31), r.int(14, 17), hex('#8a4520'), 0.45);
};

GEN.iron_block = (p, r) => {
  const g = tileNoise2(r, S, S, 3, 32);
  p.map((x, y) => {
    const lx = x & 15, ly = y & 15;
    let v = 4 + (g(x, y) - 0.5) * 1.4;
    if (lx === 0 || ly === 0) v = 6.4;
    else if (lx === 15 || ly === 15) v = 1.2;
    else if (lx === 1 || ly === 1) v += 0.6;
    else if (lx === 14 || ly === 14) v -= 0.8;
    v += (15 - lx - ly) * 0.03;
    return rampDither(P.iron, v, x, y, 0.3);
  });
  for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) for (const [ox, oy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
    if ((x === 3 && y === 3) || (x === 11 && y === 11)) { p.set(x + ox, y + oy, P.iron[7]); p.set(x + ox + 1, y + oy + 1, P.iron[1]); p.set(x + ox + 1, y + oy, P.iron[4]); p.set(x + ox, y + oy + 1, P.iron[4]); }
  }
};

GEN.glass = (p, r) => {
  p.map((x, y) => {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) return [...(x === 0 || y === 0 ? hex('#e8f4f6') : hex('#8fa9b3')), 255];
    if (e === 1) return [...(x === 1 || y === 1 ? hex('#b9d3db') : hex('#6f8c98')), 235];
    const sheen = (x + y) % 32;
    return [...hex('#cfe9f1'), 38 + (sheen < 4 ? 14 : 0)];
  });
  // diagonal glints
  const glint = (x0, y0, L, a) => { for (let k = 0; k < L; k++) p.set(x0 + k, y0 - k, hex('#ffffff'), a); };
  glint(4, 13, 9, 170); glint(5, 13, 8, 90); glint(4, 19, 4, 120);
  glint(18, 28, 9, 150); glint(22, 28, 5, 90);
};

GEN.water = (p, r) => {
  const n = tileFbm(r, S, [4, 8, 16], 0.55);
  const wob = tileNoise(r, S, 4);
  const mask = tileNoise(r, S, 8);
  p.map((x, y) => {
    let v = 3.3 + (n(x, y) - 0.5) * 2.6;
    const w = Math.sin(((y / 8) + 0.3 * Math.sin((x / 16) * Math.PI * 2) + wob(x, y) * 1.2) * Math.PI * 2);
    let a = 188;
    const m = mask(x, y);
    if (w > 0.92 && m > 0.5) { v += 2.0; a = 205; }
    else if (w > 0.75 && m > 0.4) v += 0.8;
    else if (w < -0.8) v -= 0.8;
    return [...rampDither(P.water, v, x, y, 0.5), a];
  });
  for (let i = 0; i < 6; i++) p.set(r.int(0, 31), r.int(0, 31), P.water[8], 215);
};
GEN.water_flow = (p, r) => {
  const n = tileNoise2(r, S, S, 8, 2);
  const n2 = tileNoise2(r, S, S, 16, 4);
  p.map((x, y) => {
    let v = 3.3 + (n(x, y) - 0.5) * 2.6 + (n2(x, y) - 0.5) * 1.5;
    let a = 190;
    if (n2(x, y) > 0.72) { v += 2.2; a = 210; }
    return [...rampDither(P.water, v, x, y, 0.6), a];
  });
};

// ------------------------------------------------------------------ crafted / village blocks
GEN.workbench_top = (p, r) => {
  copyInto(p, gen('planks'));
  p.forEach((x, y) => p.shade(x, y, 0.08));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 3) {
      let v = 3 + (e === 0 ? -0.5 : 0);
      if (e === 0 && (x === 0 || y === 0)) v = 4.2;
      if (e === 2) v = (x === 2 || y === 2) ? 1.5 : 4.5;
      p.set(x, y, rampAt(P.darkoak, v + ((x * 13 + y * 7) % 5 === 0 ? 0.6 : 0)));
    }
  }
  // 3x3 grid
  for (const g of [11, 20]) for (let k = 3; k < 29; k++) {
    p.set(g, k, P.plank[1]); p.set(g + 1, k, P.plank[6]);
    p.set(k, g, P.plank[1]); p.set(k, g + 1, P.plank[6]);
  }
  // tiny hammer in top-right cell, and a pencil in bottom-left
  const hx = 22, hy = 4;
  for (let k = 0; k < 5; k++) p.set(hx + 1 + k, hy + 6 - k, hex('#6d4526'));
  p.rect(hx + 4, hy, 3, 2, P.iron[4]); p.set(hx + 4, hy, P.iron[6]); p.set(hx + 6, hy + 1, P.iron[1]);
  for (let k = 0; k < 6; k++) p.set(4 + k, 28 - k - 1, k < 1 ? hex('#2a2a2a') : k < 5 ? hex('#d9a531') : hex('#e8c7c0'));
};
GEN.workbench_side = (p, r) => {
  const n = tileNoise2(r, S, S, 32, 3);
  p.map((x, y) => {
    if (y < 4) { let v = y === 0 ? 6 : y === 3 ? 1.2 : 4.3; return rampDither(P.plank, v + (n(y, x) - 0.5) * 1.4, x, y, 0.3); }
    if (x < 4 || x > 27) { const lx = x < 4 ? x : x - 28; return rampAt(P.plank, [5, 4.3, 3.6, 1.8][lx] + (n(x, y) - 0.5)); }
    if (y > 24 && y < 28) return rampAt(P.plank, y === 25 ? 5.2 : y === 27 ? 1.5 : 4);
    // back panel: vertical dark boards
    let v = 2.4 + (n(x, y) - 0.5) * 1.4 + ((x & 7) === 3 ? -1.2 : 0);
    if (y === 4) v -= 1.2;
    return rampAt(P.darkoak.map((c) => shift(c, 0.25)), v);
  });
  // saw
  const blade = P.iron;
  for (let y = 7; y < 20; y++) for (let x = 6; x < 13 + Math.floor((y - 7) / 3); x++) {
    const edge = x === 6 || y === 7; const tooth = y === 19 && (x & 1);
    p.set(x, y, tooth ? blade[1] : edge ? blade[6] : rampAt(blade, 4 + ((x + y) % 7 === 0 ? 1 : 0) - (x > 12 ? 1 : 0)));
  }
  p.rect(6, 5, 5, 3, P.plank[3]); p.set(7, 6, P.darkoak[0]); p.rect(6, 5, 5, 1, P.plank[5]);
  // hammer
  for (let y = 9; y < 22; y++) { p.set(21, y, P.plank[5]); p.set(22, y, P.plank[2]); }
  p.rect(18, 7, 8, 3, P.iron[4]); p.rect(18, 7, 8, 1, P.iron[6]); p.rect(18, 9, 8, 1, P.iron[1]);
  p.set(25, 8, P.iron[2]);
  p.set(21, 5, P.iron[3]); p.set(21, 6, P.iron[2]);
};

GEN.furnace_top = (p, r) => {
  copyInto(p, gen('stone'));
  p.forEach((x, y) => {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) p.shade(x, y, x === 0 || y === 0 ? 0.25 : -0.35);
    else if (e === 1) p.shade(x, y, x === 1 || y === 1 ? -0.3 : 0.15);
  });
  // chimney grate
  for (let y = 11; y < 21; y++) for (let x = 11; x < 21; x++) {
    const onBar = ((x - 11) % 3 === 0) || y === 11 || y === 20;
    p.set(x, y, onBar ? rampAt(P.ironD, (x === 11 || y === 11) ? 5 : 3) : rampAt(P.glow, 1 + ((x * 3 + y) % 3 === 0 ? 1 : 0)));
  }
};
GEN.furnace_front = (p, r) => {
  // small stone bricks
  const n = tileFbm(r, S, [8, 16], 0.6);
  const tone = [];
  for (let i = 0; i < 64; i++) tone.push(r.range(-0.6, 0.6));
  p.map((x, y) => {
    const row = y >> 2, ly = y & 3, off = row & 1 ? 4 : 0;
    const lx = (x + off) & 7, bi = row * 4 + (((x + off) >> 3) & 3);
    if (ly === 3 || lx === 7) return rampAt(P.mortar, 1.4 + (n(x, y) - 0.5) * 2);
    let v = 3.8 + tone[bi] + (n(x, y) - 0.5) * 2;
    if (ly === 0 || lx === 0) v += 1.1; if (ly === 2 || lx === 6) v -= 0.7;
    return rampDither(P.cobble, v, x, y, 0.4);
  });
  // lintel
  for (let x = 6; x < 26; x++) for (let y = 11; y < 15; y++) p.set(x, y, rampAt(P.brick, y === 11 ? 6 : y === 14 ? 1.5 : 4 + ((x * 5) % 3) * 0.3));
  // mouth
  const fire = P.glow;
  for (let y = 15; y < 28; y++) for (let x = 8; x < 24; x++) {
    if (y === 15 && (x === 8 || x === 23)) continue;
    p.set(x, y, hex('#120a08'));
  }
  const fn = tileNoise(r, S, 8);
  for (let x = 9; x < 23; x++) {
    const hgt = 4 + Math.round(fn(x * 2, 5) * 6) + ((x === 15 || x === 16) ? 2 : 0);
    for (let k = 0; k < hgt; k++) {
      const y = 25 - k;
      const t = k / hgt;
      p.set(x, y, rampAt(fire, 6 - t * 6 - ((x === 9 || x === 22) ? 1.5 : 0)));
    }
  }
  for (let x = 8; x < 24; x++) { p.set(x, 26, (x & 1) ? hex('#3a1a10') : hex('#ff8a2a')); p.set(x, 27, (x % 3) ? hex('#2a120a') : hex('#c24a18')); }
  // glow on surrounding bricks
  p.forEach((x, y) => {
    if (x >= 8 && x < 24 && y >= 15 && y < 28) return;
    const dx = Math.max(0, 8 - x, x - 23), dy = Math.max(0, 15 - y, y - 27);
    const d = Math.hypot(dx, dy);
    if (d < 5) p.tint(x, y, hex('#ff9a3a'), 0.32 * (1 - d / 5));
  });
  // vent slit
  for (let x = 12; x < 20; x++) { p.set(x, 5, hex('#0f0908')); p.set(x, 6, x & 1 ? hex('#7a2a10') : hex('#3a1a10')); p.set(x, 4, P.cobble[6]); }
};

GEN.bookshelf = (p, r) => {
  const n = tileNoise2(r, S, S, 4, 32);
  // frame boards
  p.map((x, y) => {
    if (y < 4 || y > 27 || (y >= 14 && y < 18)) {
      const ly = y < 4 ? y : y > 27 ? y - 28 : y - 14;
      return rampAt(P.plank, [5.5, 4.4, 4, 1.2][ly] + (n(x, y) - 0.5) * 1.4);
    }
    return hex('#1c110b');
  });
  const bookCols = hexes(['#8e2a26', '#2b4a8a', '#2f6b3a', '#7a4a24', '#5e3478', '#2a6b6b', '#a8822c', '#6b1f2c', '#3a3a5a']);
  for (const shelf of [[4, 14], [18, 28]]) {
    const floor = shelf[1];
    let x = 1;
    while (x < 31) {
      const w = r.int(2, 3);
      if (r.chance(0.08)) { x += 2; continue; }
      const h = r.int(7, 10);
      const c = r.pick(bookCols);
      const lean = r.chance(0.08) && x + w < 30;
      for (let k = 0; k < w && x + k < 31; k++) {
        for (let j = 0; j < h; j++) {
          const y = floor - 1 - j;
          if (y < shelf[0]) continue;
          let cc = k === 0 ? shift(c, 0.25) : k === w - 1 ? shift(c, -0.35) : c;
          if (j === h - 2 || j === 1) cc = k === 0 ? hex('#f0d47a') : hex('#c99a38');
          if (j === h - 1) cc = shift(c, 0.15);
          if (lean && j > h - 3 && k === 0) continue;
          p.set(x + k, y, cc);
        }
      }
      if (w === 3 && r.chance(0.5)) p.set(x + 1, floor - 1 - Math.floor(h / 2), hex('#e9dfc8'));
      x += w;
    }
  }
  for (let y = 0; y < 32; y++) { p.shade(0, y, 0.15); p.shade(31, y, -0.3); }
};

function glowPx(p, x, y, core, halo, haloAmt = 0.35) {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) p.tint(x + i, y + j, halo, haloAmt * (i && j ? 0.6 : 1));
  p.set(x, y, core);
}
GEN.arcane_top = (p, r) => {
  const n = tileNoise2(r, S, S, 4, 32);
  p.map((x, y) => {
    const ly = y & 7;
    let v = 3 + (n(x, y) - 0.5) * 1.8;
    if (ly === 7) v = 0.8; if (ly === 0) v += 0.7;
    return rampDither(P.arcwood, v, x, y, 0.3);
  });
  const core = hex('#f2dcff'), mid = hex('#c07bff'), halo = hex('#7a3adf');
  const pts = new Set();
  const plot = (x, y) => pts.add(Math.round(x) + ',' + Math.round(y));
  for (let a = 0; a < 360; a += 2.5) {
    const t = (a * Math.PI) / 180;
    plot(15.5 + Math.cos(t) * 12, 15.5 + Math.sin(t) * 12);
    plot(15.5 + Math.cos(t) * 6.5, 15.5 + Math.sin(t) * 6.5);
  }
  const star = [];
  for (let i = 0; i < 5; i++) { const t = -Math.PI / 2 + (i * 2 * Math.PI) / 5; star.push([15.5 + Math.cos(t) * 12, 15.5 + Math.sin(t) * 12]); }
  for (let i = 0; i < 5; i++) {
    const [x0, y0] = star[i], [x1, y1] = star[(i + 2) % 5];
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s <= L; s += 0.5) plot(x0 + ((x1 - x0) * s) / L, y0 + ((y1 - y0) * s) / L);
  }
  for (const k of pts) { const [x, y] = k.split(',').map(Number); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) p.tint(x + i, y + j, halo, 0.22); }
  for (const k of pts) { const [x, y] = k.split(',').map(Number); p.set(x, y, mid); }
  for (const [x, y] of star) glowPx(p, Math.round(x), Math.round(y), core, halo, 0.5);
  glowPx(p, 15, 15, core, mid, 0.6); glowPx(p, 16, 16, core, mid, 0.6); p.set(16, 15, core); p.set(15, 16, core);
  // gold corner brackets
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [31, 0, -1, 1], [0, 31, 1, -1], [31, 31, -1, -1]])
    for (let k = 0; k < 4; k++) { p.set(cx + sx * k, cy, P.gold[3 + (k === 0 ? 1 : 0)]); p.set(cx, cy + sy * k, P.gold[2]); }
};
const RUNES = [
  ['01110', '10001', '00100', '01010', '00100', '01010', '10001'],
  ['10001', '11011', '10101', '00100', '00100', '01110', '00100'],
  ['00100', '01110', '10101', '00100', '10101', '01110', '00100'],
  ['11100', '10010', '11100', '10100', '10010', '00001', '00001'],
];
GEN.arcane_side = (p, r) => {
  const n = tileNoise2(r, S, S, 32, 4);
  p.map((x, y) => {
    const lx = x & 7;
    let v = 3 + (n(x, y) - 0.5) * 1.8;
    if (lx === 7) v = 0.8; if (lx === 0) v += 0.7;
    if (y < 3 || y > 28) return rampAt(P.gold, y === 0 || y === 29 ? 4 : y === 2 || y === 31 ? 1 : 2.6);
    return rampDither(P.arcwood, v, x, y, 0.3);
  });
  const mid = hex('#c07bff'), core = hex('#f4e4ff'), halo = hex('#7a3adf');
  const glyphs = [RUNES[r.int(0, 3)], RUNES[r.int(0, 3)], RUNES[r.int(0, 3)]];
  const xs = [3, 13, 23];
  glyphs.forEach((g, gi) => {
    const ox = xs[gi], oy = 12;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '1') for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) p.tint(ox + i + a, oy + j + b, halo, 0.2);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '1') p.set(ox + i, oy + j, (i + j) % 3 === 0 ? core : mid);
  });
  // crystal studs
  for (const x of [8, 18, 28]) { p.set(x, 6, hex('#8ff4ff')); p.set(x + 1, 6, hex('#3fa6d6')); p.set(x, 25, hex('#c07bff')); p.set(x + 1, 25, hex('#6a3cc8')); }
};

GEN.lantern = (p, r) => {
  const cx = 15.5, cy = 18;
  p.map((x, y) => {
    const e = Math.min(x, 31 - x);
    if (y < 4 || y > 27) {
      let v = y === 0 || y === 28 ? 5 : y === 3 || y === 31 ? 1 : 3.2;
      if (x === 0) v += 1; if (x === 31) v -= 1;
      return rampAt(P.ironD, v);
    }
    if (e < 2) return rampAt(P.ironD, x === 0 ? 5 : x === 31 ? 0.5 : x === 1 ? 3 : 2);
    if (x === 10 || x === 21) return rampAt(P.ironD, 4.2);
    if (x === 11 || x === 22) return rampAt(P.ironD, 2);
    if (y === 16) return rampAt(P.ironD, 3.6);
    const d = Math.hypot((x + 0.5 - cx) * 0.9, y + 0.5 - cy);
    return rampAt(P.glow, 6.2 - d * 0.42);
  });
  // candle + flame
  for (let y = 21; y < 28; y++) for (let x = 14; x < 18; x++) p.set(x, y, x === 14 ? hex('#fff7e6') : x === 17 ? hex('#d8c29a') : hex('#f2e4c4'));
  p.set(15, 20, hex('#2a1a10'));
  for (const [x, y, c] of [[15, 19, '#ffffff'], [16, 19, '#fff6d2'], [15, 18, '#fff6d2'], [16, 18, '#ffe08e'], [15, 17, '#ffc257'], [15, 17, '#ffe08e'], [16, 17, '#ffc257'], [15, 15, '#ffc257']])
    p.set(x, y, hex(c));
  // rivets on caps
  for (const x of [4, 15, 27]) { p.set(x, 1, P.ironD[6]); p.set(x, 29, P.ironD[6]); p.set(x + 1, 2, P.ironD[0]); p.set(x + 1, 30, P.ironD[0]); }
  // glass glints
  for (let k = 0; k < 4; k++) { p.set(3 + k, 9 - k, hex('#fff8e0')); p.set(23 + k, 9 - k, hex('#fff8e0')); }
};

GEN.banner = (p, r) => {
  const n = tileNoise2(r, S, S, 16, 4);
  p.map((x, y) => {
    const weave = ((x + y) & 1) ? 0.25 : -0.25;
    let v = 3.6 + Math.sin((x / 16) * Math.PI * 2) * 1.1 + weave + (n(x, y) - 0.5) * 0.8;
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) return rampAt(P.gold, 1);
    if (e === 1) return rampAt(P.gold, (x === 1 || y === 1) ? 4.5 : 2.5);
    if (e === 2) v -= 1.2;
    return rampDither(P.cloth, v, x, y, 0.3);
  });
  // gold tower emblem
  const G = P.gold;
  const emblem = [
    '..#.#..#.#..',
    '..#.#..#.#..',
    '..########..',
    '...######...',
    '...######...',
    '...##..##...',
    '...######...',
    '...######...',
    '...######...',
    '...##..##...',
    '...#....#...',
    '..########..',
    '.##########.',
  ];
  const ox = 10, oy = 9;
  for (let j = 0; j < emblem.length; j++) for (let i = 0; i < 12; i++) {
    if (emblem[j][i] !== '#') continue;
    const left = i === 0 || emblem[j][i - 1] !== '#';
    const right = i === 11 || emblem[j][i + 1] !== '#';
    p.set(ox + i, oy + j, left ? G[5] : right ? G[1] : G[3 + ((i + j) % 4 === 0 ? 1 : 0)]);
  }
  for (let j = 0; j < emblem.length; j++) for (let i = 0; i < 12; i++) if (emblem[j][i] === '#') {
    if (j + 1 >= emblem.length || emblem[j + 1][i] !== '#') p.set(ox + i, oy + j + 1, P.cloth[0]);
  }
  // hanging pole shadow at the top
  for (let x = 2; x < 30; x++) p.shade(x, 2, -0.3);
};

// ------------------------------------------------------------------ cross sprites (transparent bg)
function spriteCanvas(p) { p.wrap = false; p.d.fill(0); }

function stalk(p, x0, h, lean, colFn) {
  const pts = [];
  for (let k = 0; k < h; k++) {
    const t = k / Math.max(1, h - 1);
    const x = Math.round(x0 + lean * t * t);
    pts.push([x, 31 - k]);
    p.set(x, 31 - k, colFn(t, k));
  }
  return pts;
}

function wheat(p, r, stage) {
  spriteCanvas(p);
  const xs = [3, 7, 11, 15, 19, 23, 27];
  const G = P.wgreen, Y = P.wgold;
  xs.forEach((x0, i) => {
    x0 += r.int(-1, 1);
    const lean = r.range(-2.5, 2.5);
    if (stage === 0) {
      const h = r.int(3, 6);
      const pts = stalk(p, x0, h, lean * 0.3, (t) => rampAt(G, 2 + t * 3));
      const [tx, ty] = pts[pts.length - 1];
      p.set(tx + r.sign(), ty + 1, G[4]);
      return;
    }
    if (stage === 1) {
      const h = r.int(9, 14);
      const pts = stalk(p, x0, h, lean * 0.6, (t) => rampAt(G, 1.5 + t * 3.5));
      for (let l = 0; l < 2; l++) {
        const [lx, ly] = pts[r.int(3, h - 3)];
        const s = r.sign();
        for (let k = 1; k <= 3; k++) p.set(lx + s * k, ly - (k > 1 ? 1 : 0) - (k > 2 ? 1 : 0), G[3 + (k === 3 ? 1 : 0)]);
      }
      return;
    }
    const h = stage === 2 ? r.int(16, 22) : r.int(23, 29);
    const ripe = stage === 3;
    const pts = stalk(p, x0, h, lean, (t) => ripe ? rampAt(Y, 1.5 + t * 3) : rampAt(G, 1.5 + t * 3.5));
    // leaves
    for (let l = 0; l < 2; l++) {
      const [lx, ly] = pts[r.int(3, Math.min(10, h - 8))];
      const s = r.sign();
      for (let k = 1; k <= 4; k++) p.set(lx + s * k, ly - Math.floor(k / 2), ripe ? Y[2 + (k & 1)] : G[3 + (k & 1)]);
    }
    // ear
    const earLen = ripe ? 8 : 6;
    for (let k = 0; k < earLen; k++) {
      const [ex, ey] = pts[h - 1 - k] || pts[0];
      const kern = ripe ? Y : hexes(['#3b6c1e', '#5b8a2a', '#86a83a', '#a8c24e', '#c2d468', '#d8e489']);
      const lit = (k & 1);
      p.set(ex, ey, kern[ripe ? 4 : 3]);
      p.set(ex - 1, ey, kern[lit ? (ripe ? 6 : 4) : (ripe ? 5 : 3)]);
      p.set(ex + 1, ey, kern[lit ? (ripe ? 3 : 2) : (ripe ? 2 : 1)]);
      if (k === 0) { p.clear(ex - 1, ey); p.clear(ex + 1, ey); }
    }
    if (ripe) { // awns
      const [ax, ay] = pts[h - 1];
      p.set(ax, ay - 1, Y[6]); p.set(ax - 1, ay - 2, Y[7]); p.set(ax + 1, ay - 2, Y[5]);
    }
  });
}
GEN.wheat_0 = (p, r) => wheat(p, r, 0);
GEN.wheat_1 = (p, r) => wheat(p, r, 1);
GEN.wheat_2 = (p, r) => wheat(p, r, 2);
GEN.wheat_3 = (p, r) => wheat(p, r, 3);

GEN.tall_grass = (p, r) => {
  spriteCanvas(p);
  const blades = [];
  for (let i = 0; i < 22; i++) blades.push({ x: r.int(2, 29), h: r.int(10, 27), bend: r.range(-5, 5), tone: r.range(-0.6, 0.8), w: r.chance(0.5) ? 2 : 1 });
  blades.sort((a, b) => b.h - a.h);
  for (const b of blades) {
    for (let k = 0; k < b.h; k++) {
      const t = k / b.h;
      const x = Math.round(b.x + b.bend * t * t);
      const v = 1.5 + t * 5 + b.tone;
      p.set(x, 31 - k, rampAt(P.grass, v));
      if (b.w === 2 && t < 0.55) p.set(x + 1, 31 - k, rampAt(P.grass, v - 1.3));
    }
  }
};

function flowerStem(p, r, x0, top) {
  for (let y = 31; y > top; y--) {
    const x = x0 + (y < 24 && y > 18 ? 1 : 0);
    p.set(x, y, P.wgreen[3]); p.set(x + 1, y, P.wgreen[1]);
  }
  // leaves
  const lf = [[x0 - 1, 26], [x0 - 2, 25], [x0 - 3, 25], [x0 - 4, 24], [x0 + 2, 22], [x0 + 3, 21], [x0 + 4, 21], [x0 + 5, 20]];
  lf.forEach(([x, y], i) => p.set(x, y, P.wgreen[i % 4 === 3 ? 5 : 4]));
  p.set(x0 - 2, 26, P.wgreen[2]); p.set(x0 + 3, 22, P.wgreen[2]);
}
GEN.flower_red = (p, r) => {
  spriteCanvas(p);
  flowerStem(p, r, 15, 13);
  const R = hexes(['#4a0808', '#7c120e', '#b01f18', '#d8342a', '#f25a44', '#ff8a6a']);
  blob(p, 16, 10, 5.2, 4.2, R, { dither: 0.3 });
  // petal separations
  for (const [x, y] of [[16, 6], [16, 7], [11, 10], [12, 10], [20, 10], [16, 13]]) p.set(x, y, R[1]);
  p.set(15, 9, hex('#1a0f12')); p.set(16, 9, hex('#1a0f12')); p.set(15, 10, hex('#241418')); p.set(16, 10, hex('#3a2a10'));
  p.set(14, 8, R[5]); p.set(13, 8, R[4]);
};
GEN.flower_yellow = (p, r) => {
  spriteCanvas(p);
  flowerStem(p, r, 15, 13);
  const Yl = hexes(['#7a4e06', '#b88410', '#e8b41c', '#ffd83a', '#ffeb78', '#fff8c0']);
  blob(p, 16, 10, 4.4, 4, Yl, { dither: 0.8 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.set(Math.round(16 + Math.cos(a) * 4.8 - 0.5), Math.round(10 + Math.sin(a) * 4.3 - 0.5), Yl[i & 1 ? 2 : 3]); }
  p.set(15, 9, Yl[1]); p.set(16, 10, Yl[1]);
};
GEN.mushroom = (p, r) => {
  spriteCanvas(p);
  const stem = hexes(['#8a7458', '#b8a07a', '#d8c49c', '#efe2c4']);
  const cap = hexes(['#4a0c0a', '#7a1410', '#a82018', '#d03424', '#ea5436', '#ff8466']);
  const shroom = (cx, top, rx, ry, sh) => {
    for (let y = top + ry; y < 32; y++) for (let x = cx - sh; x < cx + sh; x++) p.set(x, y, stem[x === cx - sh ? 3 : x === cx + sh - 1 ? 0 : 2]);
    for (let y = top; y < top + ry + 1; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx - 0.5) / (rx + 0.5), dy = (y + 0.5 - top - ry - 0.5) / (ry + 0.5);
      if (dx * dx + dy * dy > 1) continue;
      const l = clamp(0.55 - dx * 0.5 - dy * 0.3 - (dx * dx + dy * dy) * 0.3, 0, 1);
      p.set(x, y, rampAt(cap, l * 5));
    }
    for (let x = cx - rx + 1; x <= cx + rx - 1; x++) p.set(x, top + ry + 1, stem[1]);
    return (x, y) => { p.set(cx + x, top + y, hex('#f6f0e4')); };
  };
  const s1 = shroom(15, 11, 8, 6, 3);
  s1(-4, 3); s1(-3, 3); s1(-4, 4); s1(1, 1); s1(2, 1); s1(4, 4); s1(-1, 5); s1(5, 3);
  const s2 = shroom(24, 22, 4, 3, 1);
  s2(-1, 1); s2(1, 2);
};
GEN.dead_bush = (p, r) => {
  spriteCanvas(p);
  const C = hexes(['#3a2412', '#5a3a1c', '#7a5129', '#9a6c3a', '#b88a52']);
  const branch = (x, y, ang, len, depth) => {
    let cx = x, cy = y;
    for (let k = 0; k < len; k++) {
      cx += Math.cos(ang); cy += Math.sin(ang);
      ang += r.range(-0.18, 0.18);
      p.set(Math.round(cx), Math.round(cy), C[clamp(Math.round(1 + (k / len) * 3 - depth * 0.3), 0, 4)]);
      if (depth === 0 && k < len * 0.4) p.set(Math.round(cx) + 1, Math.round(cy), C[1]);
    }
    if (depth < 2) {
      const n = r.int(2, 3);
      for (let i = 0; i < n; i++) branch(cx, cy, ang + r.range(-0.65, 0.65), len * r.range(0.45, 0.65), depth + 1);
    }
  };
  branch(15.5, 31, -Math.PI / 2 - 0.55, 13, 0);
  branch(16.5, 31, -Math.PI / 2 + 0.5, 14, 0);
  branch(16, 31, -Math.PI / 2 - 0.05, 11, 1);
};
GEN.torch = (p, r) => {
  spriteCanvas(p);
  const stick = hexes(['#4e3419', '#6e4c28', '#8a6436', '#a8804a']);
  for (let y = 14; y < 32; y++) for (let x = 14; x < 18; x++) p.set(x, y, stick[3 - (x - 14)]);
  for (let y = 16; y < 32; y += 5) p.set(15, y, stick[1]);
  for (let x = 14; x < 18; x++) { p.set(x, 12, hex('#2b1d14')); p.set(x, 13, hex(x < 16 ? '#4a2a18' : '#3d2a1b')); }
  const rows = [
    [15, 16, '#ff7a2a'],
    [15, 16, '#ffab2e'],
    [14, 17, '#ffab2e'],
    [13, 18, '#ffc94a'],
    [13, 18, '#ffe16a'],
    [13, 18, '#ffe16a'],
    [13, 18, '#fff3b0'],
    [14, 17, '#fff3b0'],
    [14, 17, '#fffbe0'],
  ];
  rows.forEach(([a, b, c], i) => {
    const y = 3 + i;
    for (let x = a; x <= b; x++) {
      let col = c;
      if ((x === a || x === b) && i > 2) col = i > 6 ? '#ffc94a' : '#ff8a2a';
      if (i < 1) col = '#e84818';
      p.set(x, y, hex(col));
    }
  });
  p.set(16, 1, hex('#ffcf5a')); p.set(13, 2, hex('#ff9a3a')); p.set(18, 0, hex('#ffd87a'));
};

// ------------------------------------------------------------------ overlays
const DESTROY_COUNTS = [3, 6, 10, 15, 21, 28];
function destroy(p, stage) {
  p.d.fill(0);
  const r = makeRng('zombicraft:destroy');
  const segs = [];
  // build a crack tree from the center outward
  const nodes = [[16, 16]];
  for (let i = 0; i < 28; i++) {
    const [sx, sy] = i < 4 ? [16 + r.int(-2, 2), 16 + r.int(-2, 2)] : nodes[r.int(0, nodes.length - 1)];
    const ang = r.range(0, Math.PI * 2), L = r.int(4, 9);
    const pts = [];
    let x = sx, y = sy;
    for (let k = 0; k < L; k++) {
      x += Math.cos(ang) + r.range(-0.5, 0.5); y += Math.sin(ang) + r.range(-0.5, 0.5);
      pts.push([Math.round(x), Math.round(y)]);
    }
    nodes.push([Math.round(x), Math.round(y)]);
    segs.push(pts);
  }
  const n = DESTROY_COUNTS[stage];
  const set = new Set();
  for (let i = 0; i < n; i++) for (const [x, y] of segs[i]) if (x >= 0 && y >= 0 && x < 32 && y < 32) set.add(x + ',' + y);
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    for (const [ox, oy] of [[1, 0], [0, 1], [1, 1]]) if (!set.has((x + ox) + ',' + (y + oy))) p.over(x + ox, y + oy, [0, 0, 0], 0.22);
  }
  for (const k of set) { const [x, y] = k.split(',').map(Number); p.set(x, y, hex('#0b0a0d'), 205 + stage * 8); }
}
for (let i = 0; i < 6; i++) GEN['destroy_' + i] = (p) => { p.wrap = false; destroy(p, i); };

GEN.ghost = (p) => {
  p.wrap = false;
  p.map((x, y) => {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) return [...hex('#c8f8ff'), 235];
    if (e === 1) return [...hex('#62e3ff'), 170];
    if (x % 8 === 0 || y % 8 === 0) return [...hex('#62e3ff'), 80];
    return [...hex('#48d4f5'), 42];
  });
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [31, 0, -1, 1], [0, 31, 1, -1], [31, 31, -1, -1]])
    for (let k = 0; k < 6; k++) { p.set(cx + sx * k, cy, hex('#ffffff'), 255); p.set(cx, cy + sy * k, hex('#ffffff'), 255); p.set(cx + sx * k, cy + sy, hex('#e8fdff'), 240); p.set(cx + sx, cy + sy * k, hex('#e8fdff'), 240); }
};

// ================================================================== atlas assembly
let atlasCanvasCache = null;

/** Build (once) the atlas canvas + layout, without touching three.js. */
export function buildAtlasCanvas() {
  if (atlasCanvasCache) return atlasCanvasCache;
  const names = [...new Set([...TILE_NAMES, '__fallback'])];
  let size = 256;
  while (Math.floor(size / CELL) ** 2 < names.length) size *= 2;
  const perRow = Math.floor(size / CELL);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rects = new Map();
  names.forEach((name, idx) => {
    const px = name === '__fallback' ? (() => { const q = new Px(S, S, true); fallback(q); return q; })() : gen(name);
    const cx = (idx % perRow) * CELL, cy = Math.floor(idx / perRow) * CELL;
    const clampEdge = SPRITES.has(name) || name === 'ghost';
    for (let y = -GUT; y < S + GUT; y++) for (let x = -GUT; x < S + GUT; x++) {
      let sx, sy;
      if (clampEdge) { sx = clamp(x, 0, S - 1); sy = clamp(y, 0, S - 1); }
      else { sx = (x + S) % S; sy = (y + S) % S; }
      const si = (sy * S + sx) * 4;
      const di = ((cy + GUT + y) * size + (cx + GUT + x)) * 4;
      img.data[di] = px.d[si]; img.data[di + 1] = px.d[si + 1]; img.data[di + 2] = px.d[si + 2]; img.data[di + 3] = px.d[si + 3];
    }
    rects.set(name, [(cx + GUT) / size, (cy + GUT) / size, (cx + GUT + S) / size, (cy + GUT + S) / size]);
  });
  ctx.putImageData(img, 0, 0);
  const fb = rects.get('__fallback');
  atlasCanvasCache = {
    canvas, size, rects,
    uv: (name) => rects.get(name) || fb,
    has: (name) => rects.has(name) && name !== '__fallback',
  };
  return atlasCanvasCache;
}

let atlasCache = null;
/**
 * Build the block texture atlas (memoized).
 * @returns {{texture: THREE.CanvasTexture, canvas: HTMLCanvasElement, uv: (name:string)=>number[], tileSize: number, has: (name:string)=>boolean, size: number}}
 */
export function buildAtlas() {
  if (atlasCache) return atlasCache;
  const a = buildAtlasCanvas();
  const texture = new THREE.CanvasTexture(a.canvas);
  texture.flipY = false;                        // v measured from the top of the canvas (see header)
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  atlasCache = { texture, canvas: a.canvas, uv: a.uv, tileSize: S, has: a.has, size: a.size };
  return atlasCache;
}

/** Raw 32x32 pixel buffer of a tile (for icons). */
export function getTilePx(name) { return GEN[name] ? gen(name) : (() => { const q = new Px(S, S); fallback(q); return q; })(); }

const tileCanvasCache = new Map();
/** 32x32 canvas of a single tile (memoized). */
export function getTileCanvas(name) {
  if (!tileCanvasCache.has(name)) tileCanvasCache.set(name, getTilePx(name).toCanvas());
  return tileCanvasCache.get(name);
}
