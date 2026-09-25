// Skin provider for zombies. Uses src/art/skins.js `zombieSkin(type, seed)` when available,
// otherwise draws a simple procedural 64×64 Minecraft-layout skin so enemies always render.
import { mulberry32 } from '../core/rng.js';

const artMods = import.meta.glob('../art/skins.js', { eager: true });
const art = artMods['../art/skins.js'] || null;

const cache = new Map();
const VARIANTS = 4;

export function getZombieSkin(type, seed) {
  const v = Math.abs(seed | 0) % VARIANTS;
  const key = type + ':' + v;
  let c = cache.get(key);
  if (c) return c;
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
