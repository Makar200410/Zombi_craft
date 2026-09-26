// Skin provider for zombies. Uses src/art/skins.js `zombieSkin(type, seed)` when available,
// otherwise draws a simple procedural 64×64 Minecraft-layout skin so enemies always render.
import { mulberry32 } from '../core/rng.js';
import { ZOMBIE_TYPES } from './zombieTypes.js';

const artMods = import.meta.glob('../art/skins.js', { eager: true });
const art = artMods['../art/skins.js'] || null;

const cache = new Map();
const VARIANTS = 4;

export function getZombieSkin(type, seed) {
  const v = Math.abs(seed | 0) % VARIANTS;
  const key = type + ':' + v;
  let c = cache.get(key);
  if (c) return c;
  const T = ZOMBIE_TYPES[type];
  if (T && T.skinBase) {
    c = deriveSkin(getZombieSkin(T.skinBase, seed), T, v);
    cache.set(key, c);
    return c;
  }
  try { if (art && typeof art.zombieSkin === 'function') c = art.zombieSkin(type, v * 7919 + 13); } catch (e) { c = null; }
  if (!c) c = drawFallback(type, v);
  cache.set(key, c);
  return c;
}

const PAL = {
  walker: { skin: [92, 140, 70], shirt: [48, 92, 140], pants: [58, 52, 110] },
  runner: { skin: [120, 150, 92], shirt: [140, 56, 40], pants: [60, 60, 60] },
  brute: { skin: [80, 118, 62], shirt: [90, 70, 50], pants: [50, 40, 34] },
  spitter: { skin: [110, 160, 60], shirt: [70, 96, 40], pants: [52, 70, 36] },
  exploder: { skin: [130, 150, 70], shirt: [150, 120, 60], pants: [80, 60, 40] },
  necromancer: { skin: [150, 150, 170], shirt: [50, 24, 80], pants: [36, 18, 58] },
};

function drawFallback(type, v) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(v * 977 + type.length * 31);
  const pal = PAL[type] || PAL.walker;
  const fill = (x, y, w, h, rgb, noise = 18) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = (rnd() - 0.5) * noise;
      ctx.fillStyle = `rgb(${clamp(rgb[0] + n)},${clamp(rgb[1] + n)},${clamp(rgb[2] + n)})`;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  };
  fill(0, 0, 32, 16, pal.skin);                      // head
  fill(16, 16, 24, 16, pal.shirt);                    // body
  fill(40, 16, 16, 16, pal.skin); fill(40, 16, 16, 6, pal.shirt);   // right arm: sleeve + rotten skin
  fill(32, 48, 16, 16, pal.skin); fill(32, 48, 16, 6, pal.shirt);   // left arm
  fill(0, 16, 16, 16, pal.pants); fill(16, 48, 16, 16, pal.pants);  // legs
  // face (front of head at 8,8 8×8): sunken dark eyes, mouth
  ctx.fillStyle = '#1a0e0a'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(13, 12, 1, 1);
  ctx.fillStyle = '#3a1a14'; ctx.fillRect(10, 14, 4, 1);
  // tears/blood on shirt
  for (let i = 0; i < 12; i++) { ctx.fillStyle = rnd() < 0.5 ? '#3b2418' : 'rgb(' + pal.skin.join(',') + ')'; ctx.fillRect(20 + ((rnd() * 8) | 0), 20 + ((rnd() * 12) | 0), 1, 1 + ((rnd() * 2) | 0)); }
  return cv;
}
function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }

/** Recolour a base zombie skin for the extended bestiary (frost, burning, armoured, skeleton …). */
function deriveSkin(base, T, v) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  const img = g.getImageData(0, 0, 64, 64), d = img.data;
  const [tint, amt] = T.tint || [0xffffff, 0];
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    if (T.bones) {           // bleach to bone, keep shading
      const l = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      const k = 0.45 + l * 0.9;
      r = tr * k; gg = tg * k; b = tb * k;
    } else {
      const l = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      r = r * (1 - amt) + tr * l * 1.4 * amt; gg = gg * (1 - amt) + tg * l * 1.4 * amt; b = b * (1 - amt) + tb * l * 1.4 * amt;
    }
    d[i] = Math.min(255, r); d[i + 1] = Math.min(255, gg); d[i + 2] = Math.min(255, b);
  }
  g.putImageData(img, 0, 0);
  const R = mulberry32(v * 31 + 7);
  if (T.bones) {
    // dark eye sockets, nose hole and rib shadows
    g.fillStyle = '#1a1612'; g.fillRect(9, 11, 2, 2); g.fillRect(13, 11, 2, 2); g.fillRect(11, 13, 2, 1);
    g.fillStyle = '#2a241c'; for (let y = 21; y < 31; y += 2) g.fillRect(21, y, 6, 1);
    g.fillStyle = '#6aa0ff'; g.fillRect(9, 11, 1, 1); g.fillRect(14, 11, 1, 1);
  }
  if (T.plate) {
    // breastplate + pauldrons with rivets
    const plate = (x, y, w, h) => { g.fillStyle = '#8e949c'; g.fillRect(x, y, w, h); g.fillStyle = '#b8bec6'; g.fillRect(x, y, w, 1); g.fillStyle = '#5a6068'; g.fillRect(x, y + h - 1, w, 1); g.fillStyle = '#dde2e8'; g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); };
    plate(20, 20, 8, 7); plate(32, 20, 8, 7); plate(44, 20, 4, 4); plate(36, 52, 4, 4); plate(4, 20, 4, 3); plate(20, 52, 4, 3);
  }
  if (T.glow) {
    // glowing cracks
    g.fillStyle = '#ffb040';
    for (let k = 0; k < 40; k++) { const x = 16 + Math.floor(R() * 40), y = 16 + Math.floor(R() * 16); g.fillRect(x, y, 1, 1 + Math.floor(R() * 2)); }
  }
  if (T.trail && T.immune === 'frost') {
    g.fillStyle = 'rgba(235,250,255,0.9)';
    for (let k = 0; k < 50; k++) g.fillRect(Math.floor(R() * 64), Math.floor(R() * 64), 1, 1);
  }
  return c;
}
