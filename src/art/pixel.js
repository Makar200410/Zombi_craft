// Shared pixel-art helpers for the procedural art pipeline.
// Pure JS (no DOM at import time). Colors are [r,g,b] arrays (0..255).

// ---------------------------------------------------------------- RNG / hashing
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convenience RNG wrapper with helpers. */
export function makeRng(seed) {
  const r = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  const f = () => r();
  f.int = (a, b) => a + Math.floor(r() * (b - a + 1));        // inclusive
  f.range = (a, b) => a + r() * (b - a);
  f.pick = (arr) => arr[Math.floor(r() * arr.length)];
  f.chance = (p) => r() < p;
  f.sign = () => (r() < 0.5 ? -1 : 1);
  return f;
}

// ---------------------------------------------------------------- colors
export function hex(h) {
  if (Array.isArray(h)) return h;
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hexes = (arr) => arr.map(hex);

export function toHex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function css(c, a = 1) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hueToward(h, target, t) {
  let d = ((target - h + 540) % 360) - 180;
  return h + d * t;
}

/**
 * Hue-shifted lighten/darken, the classic pixel-art trick:
 * darker -> cooler (toward blue/purple), lighter -> warmer (toward yellow).
 * amt in -1..1.
 */
export function shift(c, amt, hueAmt = 0.18) {
  c = hex(c);
  const [h, s, l] = rgbToHsl(c);
  if (amt < 0) {
    const t = -amt;
    return hslToRgb([hueToward(h, 250, t * hueAmt * (s > 0.05 ? 1 : 0.4)), s * (1 + 0.15 * t) + (s < 0.05 ? 0.06 * t : 0), l * (1 - t)]);
  }
  const t = amt;
  return hslToRgb([hueToward(h, 55, t * hueAmt * (s > 0.05 ? 1 : 0.4)), s * (1 - 0.15 * t), l + (1 - l) * t]);
}

/** Build an n-step ramp (dark -> light) around a base color with hue shifting. */
export function makeRamp(base, n = 6, spread = 0.55, hueAmt = 0.22) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
    out.push(shift(base, t * spread, hueAmt));
  }
  return out;
}

export function rampAt(ramp, v) {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(v)));
  return ramp[i];
}

// 4x4 Bayer matrix (0..1) for ordered dithering between ramp steps.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x, y) { return BAYER[((y & 3) << 2) | (x & 3)]; }
/** Ramp lookup with optional dithering strength (0 = plain rounding). */
export function rampDither(ramp, v, x, y, strength = 1) {
  const d = (bayer(x, y) - 0.5) * strength;
  return rampAt(ramp, v + d);
}

// ---------------------------------------------------------------- noise (tileable)
/** Periodic value noise over a size x size domain; `cells` lattice cells per period. Returns fn(x,y)->0..1 */
export function tileNoise(rng, size, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = s(fx - x0), ty = s(fy - y0);
    const X0 = ((x0 % cells) + cells) % cells, Y0 = ((y0 % cells) + cells) % cells;
    const X1 = (X0 + 1) % cells, Y1 = (Y0 + 1) % cells;
    const a = g[Y0 * cells + X0], b = g[Y0 * cells + X1], c = g[Y1 * cells + X0], d = g[Y1 * cells + X1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };
}

/** Periodic anisotropic noise: separate lattice counts for x and y. */
export function tileNoise2(rng, w, h, cx, cy) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / w) * cx, fy = (y / h) * cy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = s(fx - x0), ty = s(fy - y0);
    const X0 = ((x0 % cx) + cx) % cx, Y0 = ((y0 % cy) + cy) % cy;
    const X1 = (X0 + 1) % cx, Y1 = (Y0 + 1) % cy;
    const a = g[Y0 * cx + X0], b = g[Y0 * cx + X1], c = g[Y1 * cx + X0], d = g[Y1 * cx + X1];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}

/** Tileable fractal noise. octaves = list of lattice cell counts, e.g. [4,8,16]. Returns 0..1 approx. */
export function tileFbm(rng, size, octaves = [4, 8, 16], gain = 0.5) {
  const ns = octaves.map((c) => tileNoise(rng, size, c));
  let norm = 0, amp = 1;
  const amps = octaves.map(() => { const a = amp; norm += a; amp *= gain; return a; });
  return (x, y) => {
    let v = 0;
    for (let i = 0; i < ns.length; i++) v += ns[i](x, y) * amps[i];
    return v / norm;
  };
}

/** Tileable Worley/Voronoi on a jittered grid. Returns fn(x,y)->{d1,d2,id,px,py} */
export function tileVoronoi(rng, size, grid, jitter = 0.8) {
  const pts = [];
  const cell = size / grid;
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++)
      pts.push({ x: (gx + 0.5 + (rng() - 0.5) * jitter) * cell, y: (gy + 0.5 + (rng() - 0.5) * jitter) * cell, id: pts.length, v: rng() });
  return voronoiFromPoints(pts, size);
}

export function voronoiFromPoints(pts, size, sx = 1, sy = 1) {
  return (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const p of pts) {
      let dx = Math.abs(x - p.x), dy = Math.abs(y - p.y);
      if (dx > size / 2) dx = size - dx;
      if (dy > size / 2) dy = size - dy;
      const d = Math.sqrt(dx * dx * sx + dy * dy * sy);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    return { d1, d2, id: best.id, p: best };
  };
}

// ---------------------------------------------------------------- pixel buffer
export class Px {
  constructor(w, h = w, wrap = false) {
    this.w = w; this.h = h; this.wrap = wrap;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  i(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }
  set(x, y, c, a = 255) {
    const i = this.i(x, y); if (i < 0) return;
    c = hex(c);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) {
    const i = this.i(x, y); if (i < 0) return [0, 0, 0, 0];
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  rgb(x, y) { const i = this.i(x, y); if (i < 0) return [0, 0, 0]; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  a(x, y) { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3]; }
  /** Alpha-composite color c with opacity t (0..1) over the pixel. */
  over(x, y, c, t = 1) {
    const i = this.i(x, y); if (i < 0) return;
    c = hex(c);
    const da = this.d[i + 3] / 255;
    const oa = t + da * (1 - t);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * t + this.d[i + k] * da * (1 - t)) / oa;
    this.d[i + 3] = oa * 255;
  }
  /** Tint an existing (opaque) pixel toward c by t, keeping alpha. */
  tint(x, y, c, t) {
    const i = this.i(x, y); if (i < 0 || this.d[i + 3] === 0) return;
    c = hex(c);
    for (let k = 0; k < 3; k++) this.d[i + k] = this.d[i + k] + (c[k] - this.d[i + k]) * t;
  }
  /** Hue-shifted lighten (amt>0) / darken (amt<0) of an existing pixel. */
  shade(x, y, amt) {
    const i = this.i(x, y); if (i < 0 || this.d[i + 3] === 0) return;
    const c = shift([this.d[i], this.d[i + 1], this.d[i + 2]], amt, 0.12);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  }
  clear(x, y) { const i = this.i(x, y); if (i >= 0) this.d[i + 3] = 0; }
  fill(c, a = 255) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); }
  rect(x, y, w, h, c, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  forEach(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const r = fn(x, y);
      if (r === null) this.clear(x, y);
      else if (r !== undefined) { if (r.length === 4) this.set(x, y, r, r[3]); else this.set(x, y, r); }
    }
  }
  clone() { const p = new Px(this.w, this.h, this.wrap); p.d.set(this.d); return p; }
  /** Copy (alpha-composited) another Px onto this one at (dx,dy). */
  draw(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4; const a = src.d[i + 3];
      if (a) this.over(dx + x, dy + y, [src.d[i], src.d[i + 1], src.d[i + 2]], a / 255);
    }
  }
  /** Add a 1px outline around opaque pixels (4-neighborhood). colorFn(neighborRGB) or fixed color. */
  outline(color, diag = false) {
    const src = this.clone(); src.wrap = false;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src.a(x, y) > 0) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (diag) n.push([1, 1], [-1, -1], [1, -1], [-1, 1]);
      let nb = null;
      for (const [ox, oy] of n) if (src.a(x + ox, y + oy) > 128) { nb = src.rgb(x + ox, y + oy); break; }
      if (nb) this.set(x, y, typeof color === 'function' ? color(nb) : color);
    }
  }
  toImageData() {
    return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h);
  }
  toCanvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const ctx = c.getContext('2d');
    if (scale === 1) ctx.putImageData(this.toImageData(), 0, 0);
    else {
      const t = document.createElement('canvas'); t.width = this.w; t.height = this.h;
      t.getContext('2d').putImageData(this.toImageData(), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t, 0, 0, c.width, c.height);
    }
    return c;
  }
}

// ---------------------------------------------------------------- field helpers
/** Create a float field w*h from fn(x,y). */
export function field(w, h, fn) {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = fn(x, y);
  f.w = w; f.h = h;
  f.at = (x, y) => f[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  return f;
}

/** Emboss lighting from a height field: light from top-left. Returns -1..1ish. */
export function emboss(f, x, y, k = 1) {
  return (f.at(x - 1, y - 1) - f.at(x + 1, y + 1)) * k;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** Fill an ellipse with sphere-like lighting from the top-left, using ramp (dark->light). */
export function blob(px, cx, cy, rx, ry, ramp, opts = {}) {
  const { light = [-0.55, -0.65], bias = 0, dither = 0.6, a = 255 } = opts;
  const n = ramp.length - 1;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      const l = clamp(-(dx * light[0] + dy * light[1]) * 0.8 + nz * 0.55 + bias, 0, 1);
      px.set(x, y, rampDither(ramp, l * n, x, y, dither), a);
    }
}

/** Scanline polygon fill; fn(x,y) -> color|null or fixed color. */
export function poly(px, pts, c, a = 255) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
        const col = typeof c === 'function' ? c(x, y) : c;
        if (col) px.set(x, y, col, a);
      }
  }
}

/** Deterministic integer hash of up to 4 ints -> 0..1 (for per-pixel variation without RNG state). */
export function hash01(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519) ^ Math.imul(d | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
