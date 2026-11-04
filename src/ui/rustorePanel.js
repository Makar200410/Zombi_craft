import * as THREE from 'three';
import { B, BLOCKS, PALETTE } from '../core/blocks.js';
import { getTileCanvas } from '../art/textures.js';
import { getItemSprite, getResourceIcon, getBlockIcon, getBuildingIcon } from '../art/icons.js';
import { ITEMS, RESOURCES, RESOURCE_LABELS } from '../core/items.js';
import { villagerSkin, zombieSkin, playerSkin, SKIN_LAYOUT } from '../art/skins.js';
import { BUILDING_TYPES, setEraTier } from '../village/buildings.js';
import { JOBS } from '../village/names.js';
import { JOB_COLORS } from '../village/visuals.js';
import { Zombie } from '../enemies/Zombie.js';
import { h, clear, glyph } from './dom.js';

export const RUSTORE_SHOTS = [
  {
    id: 'caves_hell',
    file: 'zombicraft-01-caves-hell.png',
    tag: 'Скриншот 1 · Геймплей: Пещеры и Преисподняя',
    title: 'Шахты, большие пещеры и Ад',
    subtitle: 'Подземные галереи, жилы кристаллов и золота, аметистовые жеоды, лавовое море Ада и бой с боссами',
    desc: 'Реальный геймплей под землёй: шахтёры добывают золотую и кристаллическую руду у конвейера, а на обсидиановом мосту над лавой идёт бой с Повелителем Некромантов и Брутом.',
  },
  {
    id: 'super_village',
    file: 'zombicraft-02-super-village-top.png',
    tag: 'Скриншот 2 · Геймплей: Режим командования сверху',
    title: 'Суперпрокачанная деревня сверху',
    subtitle: 'Ратуша максимального уровня, Башни Магов, Тесла и Лазерные башни, мраморные проспекты и 38 жителей',
    desc: 'Вид сверху в режиме командования (Tab): полностью отстроенная цитадель с двойными укреплёнными стенами, башнями обороны, голограммой стройки и работающими жителями.',
  },
  {
    id: 'iron_age',
    file: 'zombicraft-03-iron-age.png',
    tag: 'Скриншот 3 · Геймплей: III эпоха (Железный век)',
    title: 'Железный век',
    subtitle: 'Каменная крепость, кузница с горном и наковальней, казарма, шахта и отряд стражников со щитами',
    desc: 'Геймплей в Железном веке: кузнец куёт слитки у пылающего горна, строители возводят чертёж бастиона, а стражники в железных шлемах со щитами и арбалетами охраняют ворота.',
  },
  {
    id: 'stone_age',
    file: 'zombicraft-04-stone-age.png',
    tag: 'Скриншот 4 · Геймплей: I эпоха (Каменный век)',
    title: 'Каменный век',
    subtitle: 'Первые хижины, лагерь лесорубов, пшеничное поле, голограмма постройки и рубка леса у реки',
    desc: 'Начало выживания в Каменном веке: лесорубы валят деревья у реки, фермер в соломенной шляпе обрабатывает грядки, а строители возводят новую постройку по голубому чертежу.',
  },
  {
    id: 'wave80_siege',
    file: 'zombicraft-05-wave80-siege-top.png',
    tag: 'Скриншот 5 · Геймплей: 80-я волна сверху',
    title: 'Атака 80-й волны зомби сверху',
    subtitle: 'Ночной штурм орды зомби, Брутов и Некромантов под залпами метеоритов, Тесла-молний и лазеров',
    desc: 'Масштабная ночная оборона на 80-й волне (вид сверху): десятки зомби и боссов штурмуют бастионы под ударами метеоритного дождя, цепных молний и лазерных башен.',
  },
];

let _iconDataUrlCache = null;

// ============================================================================
// 1. GAME ICON GENERATOR (512x512 HD FOR PHONE APK / RUSTORE & PC EXE)
// ============================================================================
export function renderGameIconCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 512;

  ctx.save();
  ctx.scale(s, s);

  const pad = 12;
  const w = 512 - pad * 2;
  const r = 108;

  ctx.save();
  roundRectPath(ctx, pad, pad, w, w, r);
  ctx.clip();

  const bg = ctx.createRadialGradient(256, 210, 20, 256, 260, 310);
  bg.addColorStop(0, '#3b1d5e');
  bg.addColorStop(0.45, '#1b1332');
  bg.addColorStop(0.8, '#0f0c1b');
  bg.addColorStop(1, '#07050c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  const lavaGlow = ctx.createRadialGradient(256, 470, 10, 256, 460, 220);
  lavaGlow.addColorStop(0, 'rgba(255, 94, 0, 0.72)');
  lavaGlow.addColorStop(0.5, 'rgba(234, 88, 12, 0.28)');
  lavaGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lavaGlow;
  ctx.fillRect(0, 0, 512, 512);

  const manaHalo = ctx.createRadialGradient(160, 160, 10, 180, 180, 190);
  manaHalo.addColorStop(0, 'rgba(56, 189, 248, 0.48)');
  manaHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = manaHalo;
  ctx.fillRect(0, 0, 512, 512);

  const undeadHalo = ctx.createRadialGradient(352, 160, 10, 332, 180, 190);
  undeadHalo.addColorStop(0, 'rgba(132, 204, 22, 0.42)');
  undeadHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = undeadHalo;
  ctx.fillRect(0, 0, 512, 512);

  drawIsoBlock(ctx, 130, 360, 62, 'stone_bricks', 'stone_bricks', 1.0);
  drawIsoBlock(ctx, 382, 360, 62, 'stone_bricks', 'cracked_stone_bricks', 0.92);
  drawIsoBlock(ctx, 192, 392, 66, 'crystal_ore', 'crystal_ore', 1.15);
  drawIsoBlock(ctx, 320, 392, 66, 'lava', 'magma', 1.2);
  drawIsoBlock(ctx, 256, 418, 72, 'gold_block', 'stone_bricks', 1.1);

  const swordSprite = getItemSprite('sword_crystal');
  const axeSprite = getItemSprite('battle_axe');

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(256, 235);
  ctx.save();
  ctx.rotate(-0.22);
  ctx.drawImage(swordSprite, -170, -175, 330, 330);
  ctx.restore();
  ctx.save();
  ctx.scale(-1, 1);
  ctx.rotate(-0.22);
  ctx.drawImage(axeSprite, -170, -175, 330, 330);
  ctx.restore();
  ctx.restore();

  drawCenterClashFace(ctx, 256, 212, 184);
  drawIconKnightShield(ctx, 256, 344, 54);
  drawIconTitleBanner(ctx);

  ctx.restore();

  ctx.save();
  roundRectPath(ctx, pad, pad, w, w, r);
  const borderGrad = ctx.createLinearGradient(0, pad, 0, 512 - pad);
  borderGrad.addColorStop(0, '#fde68a');
  borderGrad.addColorStop(0.35, '#d97706');
  borderGrad.addColorStop(0.7, '#78350f');
  borderGrad.addColorStop(1, '#f59e0b');
  ctx.lineWidth = 14;
  ctx.strokeStyle = borderGrad;
  ctx.stroke();

  roundRectPath(ctx, pad + 8, pad + 8, w - 16, w - 16, r - 6);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 248, 220, 0.42)';
  ctx.stroke();
  ctx.restore();

  ctx.restore();
  return c;
}

export function getGameIconDataUrl() {
  if (!_iconDataUrlCache) {
    _iconDataUrlCache = renderGameIconCanvas(256).toDataURL('image/png');
  }
  return _iconDataUrlCache;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawIsoBlock(ctx, cx, cy, radius, topTile, sideTile, brightness = 1) {
  const tTop = getTileCanvas(topTile);
  const tSide = getTileCanvas(sideTile);
  const S = tTop.width || 16;
  const hw = radius * 0.88;
  const hh = radius * 0.45;
  const vh = radius * 0.98;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.translate(cx, cy - vh);
  ctx.transform(hw / S, hh / S, -hw / S, hh / S, 0, 0);
  ctx.drawImage(tTop, 0, 0, S, S);
  if (brightness < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cx - hw, cy - vh + hh);
  ctx.transform(hw / S, hh / S, 0, vh / S, 0, 0);
  ctx.drawImage(tSide, 0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy - vh + hh * 2);
  ctx.transform(hw / S, -hh / S, 0, vh / S, 0, 0);
  ctx.drawImage(tSide, 0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.44)';
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  ctx.restore();
}

function drawCenterClashFace(ctx, cx, cy, sz) {
  const half = sz / 2;
  const x0 = cx - half;
  const y0 = cy - half;
  const p = sz / 8;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#111827';
  ctx.fillRect(x0 - 6, y0 - 6, sz + 12, sz + 12);
  ctx.restore();

  const pSkin = playerSkin();
  const zSkin = zombieSkin('necromancer', 7);
  const [hx, hy, hw, hh] = SKIN_LAYOUT.head.faces.front;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, half, sz);
  ctx.clip();
  ctx.drawImage(pSkin, hx, hy, hw, hh, x0, y0, sz, sz);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x0, y0, half, p * 2.2);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x0 + p * 0.4, y0 + p * 0.3, half - p * 0.4, p * 1.1);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x0 + p * 3.1, y0 + p * 2.0, p * 0.9, p * 2.3);
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(x0 + p * 1.1, y0 + p * 3.8, p * 1.9, p * 1.15);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, y0, half, sz);
  ctx.clip();
  ctx.drawImage(zSkin, hx, hy, hw, hh, x0, y0, sz, sz);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(cx, y0, half, p * 1.7);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(cx + p * 0.4, y0 - p * 0.5, p * 1.0, p * 1.1);
  ctx.fillRect(cx + p * 2.2, y0 - p * 0.5, p * 1.1, p * 1.1);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(cx + p * 1.4, y0 + p * 0.4, p * 0.8, p * 0.8);
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ff3b2f';
  ctx.fillRect(cx + p * 1.0, y0 + p * 3.8, p * 1.9, p * 1.15);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(cx + p * 1.5, y0 + p * 4.0, p * 0.8, p * 0.7);
  ctx.restore();

  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fbbf24';
  ctx.strokeRect(x0 - 3, y0 - 3, sz + 6, sz + 6);

  ctx.save();
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 3, y0 - 10);
  ctx.lineTo(cx - 7, y0 + sz * 0.34);
  ctx.lineTo(cx + 6, y0 + sz * 0.54);
  ctx.lineTo(cx - 5, y0 + sz + 10);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawIconKnightShield(ctx, cx, cy, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  ctx.beginPath();
  ctx.moveTo(cx - r * 0.85, cy - r * 0.78);
  ctx.lineTo(cx + r * 0.85, cy - r * 0.78);
  ctx.lineTo(cx + r * 0.85, cy - r * 0.05);
  ctx.quadraticCurveTo(cx + r * 0.75, cy + r * 0.65, cx, cy + r * 0.96);
  ctx.quadraticCurveTo(cx - r * 0.75, cy + r * 0.65, cx - r * 0.85, cy - r * 0.05);
  ctx.closePath();

  const shGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  shGrad.addColorStop(0, '#fde047');
  shGrad.addColorStop(0.5, '#d97706');
  shGrad.addColorStop(1, '#78350f');
  ctx.fillStyle = shGrad;
  ctx.fill();

  ctx.beginPath();
  const ir = r * 0.78;
  ctx.moveTo(cx - ir * 0.85, cy - ir * 0.78);
  ctx.lineTo(cx + ir * 0.85, cy - ir * 0.78);
  ctx.lineTo(cx + ir * 0.85, cy - ir * 0.05);
  ctx.quadraticCurveTo(cx + ir * 0.75, cy + ir * 0.65, cx, cy + ir * 0.96);
  ctx.quadraticCurveTo(cx - ir * 0.75, cy + ir * 0.65, cx - ir * 0.85, cy - ir * 0.05);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(cx, cy - ir, cx, cy + ir);
  bodyGrad.addColorStop(0, '#334155');
  bodyGrad.addColorStop(0.5, '#1e293b');
  bodyGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.44);
  ctx.lineTo(cx + r * 0.28, cy);
  ctx.lineTo(cx, cy + r * 0.48);
  ctx.lineTo(cx - r * 0.28, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.24);
  ctx.lineTo(cx + r * 0.14, cy);
  ctx.lineTo(cx, cy + r * 0.24);
  ctx.lineTo(cx - r * 0.14, cy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawIconTitleBanner(ctx) {
  ctx.save();
  const bx = 54, by = 398, bw = 404, bh = 74;
  roundRectPath(ctx, bx, by, bw, bh, 18);
  const pGrad = ctx.createLinearGradient(0, by, 0, by + bh);
  pGrad.addColorStop(0, 'rgba(30, 20, 12, 0.95)');
  pGrad.addColorStop(1, 'rgba(12, 8, 5, 0.98)');
  ctx.fillStyle = pGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 44px "Ruslan Display", "Philosopher", Georgia, serif';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#1c1008';
  ctx.strokeText('ZOMBI CRAFT', 256, by + bh / 2 + 2);

  const tGrad = ctx.createLinearGradient(0, by + 10, 0, by + bh - 10);
  tGrad.addColorStop(0, '#fef08a');
  tGrad.addColorStop(0.55, '#f59e0b');
  tGrad.addColorStop(1, '#ea580c');
  ctx.fillStyle = tGrad;
  ctx.fillText('ZOMBI CRAFT', 256, by + bh / 2 + 2);
  ctx.restore();
}

// ============================================================================
// 2. TRUE 3D PERSPECTIVE VOXEL + 3D HUMANOID GAMEPLAY STAGE
// ============================================================================
class PerspectiveGameplayStage {
  constructor(opts = {}) {
    this.camPos = opts.camPos || [0, 16, 22];
    this.lookAt = opts.lookAt || [0, 2, 0];
    this.fov = opts.fov || 60;
    this.ambient = opts.ambient || [0.85, 0.85, 0.82];
    this.skyTop = opts.skyTop || '#2f78e8';
    this.skyHorizon = opts.skyHorizon || '#b4d6fb';
    this.fogColor = opts.fogColor || [180, 214, 251];
    this.fogNear = opts.fogNear ?? 38;
    this.fogFar = opts.fogFar ?? 95;
    this.sunDir = normalize3(opts.sunDir || [0.55, 0.78, 0.32]);

    this.blocks = new Map();
    this.ghostBlocks = [];
    this.entities = [];
    this.lights = [];
    this.beams = [];
    this.explosions = [];
    this.popups = [];
    this.selectionRect = null;

    this._setupCamera(1920, 1080);
  }

  _setupCamera(w, h) {
    this.w = w;
    this.h = h;
    const [cx, cy, cz] = this.camPos;
    const [tx, ty, tz] = this.lookAt;
    const F = normalize3([tx - cx, ty - cy, tz - cz]);
    let upRef = [0, 1, 0];
    if (Math.abs(F[1]) > 0.98) upRef = [0, 0, -1];
    const R = normalize3(cross3(F, upRef));
    const U = cross3(R, F);
    this.camF = F;
    this.camR = R;
    this.camU = U;
    this.focal = (h * 0.5) / Math.tan((this.fov * 0.5 * Math.PI) / 180);
  }

  project(wx, wy, wz) {
    const dx = wx - this.camPos[0];
    const dy = wy - this.camPos[1];
    const dz = wz - this.camPos[2];
    const zCam = dx * this.camF[0] + dy * this.camF[1] + dz * this.camF[2];
    if (zCam < 0.65) return null;
    const xCam = dx * this.camR[0] + dy * this.camR[1] + dz * this.camR[2];
    const yCam = dx * this.camU[0] + dy * this.camU[1] + dz * this.camU[2];
    const invZ = this.focal / zCam;
    return {
      sx: this.w * 0.5 + xCam * invZ,
      sy: this.h * 0.5 - yCam * invZ,
      zCam,
      dist: Math.hypot(dx, dy, dz),
    };
  }

  _key(x, y, z) {
    return `${x | 0},${y | 0},${z | 0}`;
  }

  set(x, y, z, id) {
    x |= 0; y |= 0; z |= 0;
    const k = this._key(x, y, z);
    if (!id || id === B.AIR) this.blocks.delete(k);
    else this.blocks.set(k, id);
  }

  get(x, y, z) {
    return this.blocks.get(this._key(x, y, z)) || 0;
  }

  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          this.set(x, y, z, id);
        }
      }
    }
  }

  addLight(x, y, z, r, g, b, radius = 10, intensity = 1.0) {
    this.lights.push({ x, y, z, r: r / 255, g: g / 255, b: b / 255, radius, intensity });
  }

  placeBuilding(typeId, ox, oy, oz, rot = 0, variant = 0, tier = 3, asGhost = false) {
    setEraTier(tier);
    const t = BUILDING_TYPES[typeId];
    if (!t) return;
    const bp = t.blueprint(variant, tier - 1);
    const rotCell = (dx, dz, r) => {
      let x = dx, z = dz, w = t.size[0], d = t.size[2];
      for (let k = 0; k < (r & 3); k++) {
        const nx = d - 1 - z, nz = x;
        x = nx; z = nz;
        const tmp = w; w = d; d = tmp;
      }
      return [x, z];
    };
    for (const c of bp) {
      if (c.dy < 0) continue;
      if (c.id === B.AIR) continue;
      const [rx, rz] = rotCell(c.dx, c.dz, rot);
      const wx = ox + rx, wy = oy + c.dy, wz = oz + rz;
      if (asGhost) {
        if (c.dy <= 1 && ((c.dx + c.dz) % 2 === 0)) {
          this.set(wx, wy, wz, c.id);
        } else if (c.dy <= 4) {
          this.ghostBlocks.push({ x: wx, y: wy, z: wz, id: c.id });
        }
      } else {
        this.set(wx, wy, wz, c.id);
        if (c.id === B.TORCH || c.id === B.LANTERN || c.id === B.FURNACE) {
          this.addLight(wx + 0.5, wy + 0.5, wz + 0.5, 255, 185, 85, 9, 0.85);
        } else if (c.id === B.NEON || c.id === B.CRYSTAL_ORE || c.id === B.ARCANE_TABLE) {
          this.addLight(wx + 0.5, wy + 0.5, wz + 0.5, 80, 210, 255, 9, 0.85);
        }
      }
    }
  }

  placeTree(x, y, z, kind = 'oak') {
    if (kind === 'spruce' || kind === true) {
      for (let dy = 0; dy < 5; dy++) this.set(x, y + dy, z, B.SPRUCE_LOG);
      for (let dy = 2; dy <= 5; dy++) {
        const r = dy === 5 ? 0 : dy >= 4 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0) continue;
            if (dx === 0 && dz === 0 && dy < 5) continue;
            this.set(x + dx, y + dy, z + dz, B.SPRUCE_LEAVES);
          }
        }
      }
    } else if (kind === 'birch') {
      for (let dy = 0; dy < 4; dy++) this.set(x, y + dy, z, B.BIRCH_LOG);
      for (let dy = 2; dy <= 4; dy++) {
        const r = dy === 4 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
            if (dx === 0 && dz === 0 && dy < 4) continue;
            this.set(x + dx, y + dy, z + dz, B.BIRCH_LEAVES);
          }
        }
      }
    } else {
      for (let dy = 0; dy < 4; dy++) this.set(x, y + dy, z, B.LOG);
      for (let dy = 2; dy <= 4; dy++) {
        const r = dy === 4 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
            if (dx === 0 && dz === 0 && dy < 4) continue;
            this.set(x + dx, y + dy, z + dz, B.LEAVES);
          }
        }
      }
    }
  }

  addCharacter(opts) {
    this.entities.push({
      x: opts.x,
      y: opts.y,
      z: opts.z,
      yaw: opts.yaw ?? 0,
      role: opts.role || 'guard',
      label: opts.label !== undefined ? opts.label : (!opts.zombie ? (JOBS[opts.role]?.name || 'Житель') : null),
      zombie: !!opts.zombie,
      boss: !!opts.boss,
      hat: opts.hat || (!opts.zombie ? JOBS[opts.role]?.hat : null),
      item: opts.item !== undefined ? opts.item : (!opts.zombie ? JOBS[opts.role]?.tool : null),
      shield: !!opts.shield,
      carryBlock: opts.carryBlock || null,
      pose: opts.pose || 'walk',
      scale: opts.scale || 1,
      hp: opts.hp ?? 1,
      eyeColor: opts.eyeColor || (opts.zombie ? '#ff3b2f' : null),
    });
  }

  _lightAt(wx, wy, wz, nx, ny, nz) {
    const sunDot = Math.max(0, nx * this.sunDir[0] + ny * this.sunDir[1] + nz * this.sunDir[2]);
    const dirFactor = 0.58 + 0.42 * sunDot;
    let lr = this.ambient[0] * dirFactor;
    let lg = this.ambient[1] * dirFactor;
    let lb = this.ambient[2] * dirFactor;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      const dx = wx - L.x, dy = wy - L.y, dz = wz - L.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r2 = L.radius * L.radius;
      if (d2 < r2) {
        const k = (1 - Math.sqrt(d2) / L.radius) * L.intensity;
        lr += L.r * k;
        lg += L.g * k;
        lb += L.b * k;
      }
    }
    return Math.min(1.38, (lr + lg + lb) / 3);
  }

  renderTo(ctx, w, h) {
    this._setupCamera(w, h);

    // Sky / cavern backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    skyGrad.addColorStop(0, this.skyTop);
    skyGrad.addColorStop(1, this.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    const drawList = [];
    const [cx, cy, cz] = this.camPos;

    for (const [k, id] of this.blocks) {
      if (!id || id === B.AIR) continue;
      const b = BLOCKS[id];
      if (!b || b.render === 'none') continue;
      const [x, y, z] = k.split(',').map(Number);

      const pCenter = this.project(x + 0.5, y + 0.5, z + 0.5);
      if (!pCenter) continue;
      if (pCenter.sx < -180 || pCenter.sx > w + 180 || pCenter.sy < -180 || pCenter.sy > h + 180) continue;

      if (b.shape === 'cross') {
        drawList.push({
          kind: 'cross',
          depth: pCenter.dist,
          x, y, z, id, b,
        });
        continue;
      }

      const isLiq = b.shape === 'liquid';
      const topH = isLiq ? 0.86 : 1.0;

      // +Y Top face
      if (cy > y + topH && !isOpaqueBlock(this.get(x, y + 1, z))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x + 0.5 - cx, y + topH - cy, z + 0.5 - cz),
          tile: b.tiles.top,
          p00: [x, y + topH, z],
          p10: [x + 1, y + topH, z],
          p01: [x, y + topH, z + 1],
          nx: 0, ny: 1, nz: 0,
          wx: x + 0.5, wy: y + topH, wz: z + 0.5,
          emissive: (b.light || 0) >= 10,
        });
      }
      // -Y Bottom ceiling face (for underground caves!)
      if (cy < y && !isOpaqueBlock(this.get(x, y - 1, z))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x + 0.5 - cx, y - cy, z + 0.5 - cz),
          tile: b.tiles.bottom || b.tiles.side,
          p00: [x, y, z + 1],
          p10: [x + 1, y, z + 1],
          p01: [x, y, z],
          nx: 0, ny: -1, nz: 0,
          wx: x + 0.5, wy: y, wz: z + 0.5,
          emissive: (b.light || 0) >= 10,
        });
      }
      // +Z South face
      if (cz > z + 1 && !isOpaqueBlock(this.get(x, y, z + 1))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 1 - cz),
          tile: b.tiles.side,
          p00: [x, y + topH, z + 1],
          p10: [x + 1, y + topH, z + 1],
          p01: [x, y, z + 1],
          nx: 0, ny: 0, nz: 1,
          wx: x + 0.5, wy: y + 0.5, wz: z + 1,
          emissive: (b.light || 0) >= 10,
        });
      }
      // -Z North face
      if (cz < z && !isOpaqueBlock(this.get(x, y, z - 1))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z - cz),
          tile: b.tiles.side,
          p00: [x + 1, y + topH, z],
          p10: [x, y + topH, z],
          p01: [x + 1, y, z],
          nx: 0, ny: 0, nz: -1,
          wx: x + 0.5, wy: y + 0.5, wz: z,
          emissive: (b.light || 0) >= 10,
        });
      }
      // +X East face
      if (cx > x + 1 && !isOpaqueBlock(this.get(x + 1, y, z))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x + 1 - cx, y + 0.5 - cy, z + 0.5 - cz),
          tile: b.tiles.side,
          p00: [x + 1, y + topH, z + 1],
          p10: [x + 1, y + topH, z],
          p01: [x + 1, y, z + 1],
          nx: 1, ny: 0, nz: 0,
          wx: x + 1, wy: y + 0.5, wz: z + 0.5,
          emissive: (b.light || 0) >= 10,
        });
      }
      // -X West face
      if (cx < x && !isOpaqueBlock(this.get(x - 1, y, z))) {
        drawList.push({
          kind: 'face',
          depth: Math.hypot(x - cx, y + 0.5 - cy, z + 0.5 - cz),
          tile: b.tiles.side,
          p00: [x, y + topH, z],
          p10: [x, y + topH, z + 1],
          p01: [x, y, z],
          nx: -1, ny: 0, nz: 0,
          wx: x, wy: y + 0.5, wz: z + 0.5,
          emissive: (b.light || 0) >= 10,
        });
      }
    }

    // Translucent cyan hologram blueprint blocks (GhostLayer)
    for (const gb of this.ghostBlocks) {
      const p = this.project(gb.x + 0.5, gb.y + 0.5, gb.z + 0.5);
      if (!p) continue;
      drawList.push({
        kind: 'ghost',
        depth: p.dist - 0.15,
        x: gb.x, y: gb.y, z: gb.z, id: gb.id,
      });
    }

    // 3D Blocky Humanoid Characters
    for (const ent of this.entities) {
      const p = this.project(ent.x, ent.y + 0.9, ent.z);
      if (!p) continue;
      drawList.push({
        kind: 'entity',
        depth: p.dist - 0.35,
        ent,
      });
    }

    // Explosions
    for (const ex of this.explosions) {
      const p = this.project(ex.x, ex.y, ex.z);
      if (!p) continue;
      drawList.push({
        kind: 'explosion',
        depth: p.dist - 0.8,
        ex,
        p,
      });
    }

    drawList.sort((a, b) => b.depth - a.depth);

    // Ground selection ring/rectangle if active
    if (this.selectionRect) {
      this._drawSelectionRect(ctx, this.selectionRect);
    }

    for (let i = 0; i < drawList.length; i++) {
      const it = drawList[i];
      if (it.kind === 'face') this._drawBlockFace(ctx, it);
      else if (it.kind === 'cross') this._drawCrossPlant(ctx, it);
      else if (it.kind === 'ghost') this._drawGhostCube(ctx, it);
      else if (it.kind === 'entity') this._drawHumanoid3D(ctx, it.ent);
      else if (it.kind === 'explosion') this._drawExplosion(ctx, it.ex, it.p);
    }

    // Beams (Tesla chain lightning, laser beams, mage spells)
    for (const bm of this.beams) {
      this._drawBeam3D(ctx, bm);
    }

    // 3D-Projected Floating Villager Job Labels & Zombie HP Bars
    this._drawWorldLabelsAndBars(ctx);
  }

  _drawBlockFace(ctx, f) {
    const a = this.project(f.p00[0], f.p00[1], f.p00[2]);
    const b = this.project(f.p10[0], f.p10[1], f.p10[2]);
    const c = this.project(f.p01[0], f.p01[1], f.p01[2]);
    if (!a || !b || !c) return;

    const tile = getTileCanvas(f.tile);
    const S = tile.width || 16;

    ctx.save();
    ctx.setTransform(
      (b.sx - a.sx) / S,
      (b.sy - a.sy) / S,
      (c.sx - a.sx) / S,
      (c.sy - a.sy) / S,
      a.sx,
      a.sy
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, 0, 0, S, S, -0.35, -0.35, S + 0.7, S + 0.7);

    if (!f.emissive) {
      const br = this._lightAt(f.wx, f.wy, f.wz, f.nx, f.ny, f.nz);
      if (br < 0.98) {
        const dark = Math.min(0.84, Math.max(0, 1 - br));
        ctx.fillStyle = `rgba(4, 6, 14, ${dark.toFixed(3)})`;
        ctx.fillRect(-0.35, -0.35, S + 0.7, S + 0.7);
      } else if (br > 1.06) {
        const glow = Math.min(0.32, (br - 1) * 0.55);
        ctx.fillStyle = `rgba(255, 220, 140, ${glow.toFixed(3)})`;
        ctx.fillRect(-0.35, -0.35, S + 0.7, S + 0.7);
      }
    }

    // Distance atmospheric fog
    if (f.depth > this.fogNear) {
      const fk = Math.min(0.78, Math.max(0, (f.depth - this.fogNear) / Math.max(1, this.fogFar - this.fogNear)));
      if (fk > 0.02) {
        const [fr, fg, fb] = this.fogColor;
        ctx.fillStyle = `rgba(${fr},${fg},${fb},${(fk * fk).toFixed(3)})`;
        ctx.fillRect(-0.35, -0.35, S + 0.7, S + 0.7);
      }
    }

    ctx.restore();
  }

  _drawCrossPlant(ctx, it) {
    const pBot = this.project(it.x + 0.5, it.y, it.z + 0.5);
    const pTop = this.project(it.x + 0.5, it.y + 0.9, it.z + 0.5);
    if (!pBot || !pTop) return;
    const hPx = Math.max(6, Math.hypot(pBot.sx - pTop.sx, pBot.sy - pTop.sy));
    const t = getTileCanvas(it.b.tiles.side);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, pBot.sx - hPx * 0.5, pBot.sy - hPx, hPx, hPx);
    if (it.id === B.TORCH || it.id === B.LANTERN) {
      const g = ctx.createRadialGradient(pTop.sx, pTop.sy + hPx * 0.25, 1, pTop.sx, pTop.sy + hPx * 0.25, hPx * 1.4);
      g.addColorStop(0, 'rgba(255, 240, 170, 0.9)');
      g.addColorStop(0.4, 'rgba(255, 160, 40, 0.4)');
      g.addColorStop(1, 'rgba(255, 120, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pTop.sx, pTop.sy + hPx * 0.25, hPx * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawGhostCube(ctx, gb) {
    const { x, y, z } = gb;
    const corners = [
      this.project(x, y, z),
      this.project(x + 1, y, z),
      this.project(x + 1, y, z + 1),
      this.project(x, y, z + 1),
      this.project(x, y + 1, z),
      this.project(x + 1, y + 1, z),
      this.project(x + 1, y + 1, z + 1),
      this.project(x, y + 1, z + 1),
    ];
    if (corners.some((c) => !c)) return;

    ctx.save();
    ctx.fillStyle = 'rgba(75, 225, 255, 0.26)';
    ctx.strokeStyle = 'rgba(135, 248, 255, 0.88)';
    ctx.lineWidth = 1.4;

    const faces = [
      [4, 5, 6, 7],
      [7, 6, 2, 3],
      [6, 5, 1, 2],
      [4, 7, 3, 0],
    ];
    for (const [i0, i1, i2, i3] of faces) {
      ctx.beginPath();
      ctx.moveTo(corners[i0].sx, corners[i0].sy);
      ctx.lineTo(corners[i1].sx, corners[i1].sy);
      ctx.lineTo(corners[i2].sx, corners[i2].sy);
      ctx.lineTo(corners[i3].sx, corners[i3].sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawSelectionRect(ctx, sel) {
    const { x, y, z, w, d, color } = sel;
    const p0 = this.project(x, y + 0.06, z);
    const p1 = this.project(x + w, y + 0.06, z);
    const p2 = this.project(x + w, y + 0.06, z + d);
    const p3 = this.project(x, y + 0.06, z + d);
    if (!p0 || !p1 || !p2 || !p3) return;
    ctx.save();
    ctx.strokeStyle = color || '#ffe066';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = color || '#ffe066';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  _drawHumanoid3D(ctx, ent) {
    const pFoot = this.project(ent.x, ent.y, ent.z);
    const pHead = this.project(ent.x, ent.y + 1.85 * (ent.scale || 1), ent.z);
    if (!pFoot || !pHead) return;
    ent._screenFoot = pFoot;
    ent._screenHead = pHead;

    const sc = ent.scale || 1;
    const px = (1.8 * sc) / 32;
    const yaw = ent.yaw || 0;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

    const sk = ent.zombie
      ? zombieSkin(ent.role || 'walker', 3)
      : ent.role === 'player'
      ? playerSkin()
      : villagerSkin(ent.role || 'guard', ((Math.abs((ent.x * 7 + ent.z * 13) | 0)) % 2) + 1);

    // Ground shadow
    const rShadow = Math.max(4, Math.abs(pFoot.sy - pHead.sy) * 0.24);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(pFoot.sx, pFoot.sy, rShadow, rShadow * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const toWorld = (lx, ly, lz) => [
      ent.x + lx * cosY + lz * sinY,
      ent.y + ly,
      ent.z - lx * sinY + lz * cosY,
    ];

    const phase = (ent.x * 1.7 + ent.z * 2.3);
    const legSwing = ent.pose === 'idle' ? 0.08 : Math.sin(phase) * 0.45;
    const rArmPitch =
      ent.pose === 'chop' || ent.pose === 'mine' || ent.pose === 'attack'
        ? -1.15
        : ent.pose === 'cast'
        ? -1.45
        : ent.pose === 'carry'
        ? -0.95
        : ent.zombie
        ? -1.3
        : -legSwing * 0.8;
    const lArmPitch =
      ent.pose === 'carry'
        ? -0.95
        : ent.zombie
        ? -1.25
        : ent.shield
        ? -0.55
        : legSwing * 0.8;

    const parts = [
      { name: 'rightLeg', pivot: [-2 * px, 12 * px, 0], size: [4 * px, 12 * px, 4 * px], offset: [0, -6 * px, 0], pitch: legSwing },
      { name: 'leftLeg', pivot: [2 * px, 12 * px, 0], size: [4 * px, 12 * px, 4 * px], offset: [0, -6 * px, 0], pitch: -legSwing },
      { name: 'body', pivot: [0, 18 * px, 0], size: [8 * px, 12 * px, 4 * px], offset: [0, 0, 0], pitch: 0 },
      { name: 'rightArm', pivot: [-6 * px, 22 * px, 0], size: [4 * px, 12 * px, 4 * px], offset: [0, -4 * px, 0], pitch: rArmPitch },
      { name: 'leftArm', pivot: [6 * px, 22 * px, 0], size: [4 * px, 12 * px, 4 * px], offset: [0, -4 * px, 0], pitch: lArmPitch },
      { name: 'head', pivot: [0, 24 * px, 0], size: [8 * px, 8 * px, 8 * px], offset: [0, 4 * px, 0], pitch: 0 },
    ];

    const partDepth = (pt) => {
      const [wx, wy, wz] = toWorld(pt.pivot[0], pt.pivot[1] + pt.offset[1], pt.pivot[2]);
      return Math.hypot(wx - this.camPos[0], wy - this.camPos[1], wz - this.camPos[2]);
    };
    parts.sort((a, b) => partDepth(b) - partDepth(a));

    for (const pt of parts) {
      this._drawLimbBox(ctx, sk, SKIN_LAYOUT[pt.name].faces, ent, pt, toWorld);
    }

    // 3D Hats / Helmets / Crowns on top of head
    const headTop = this.project(...toWorld(0, 31.5 * px, 0));
    const headSize = Math.max(4, Math.abs(pFoot.sy - pHead.sy) * 0.26);
    if (headTop && ent.hat) {
      ctx.save();
      if (ent.hat === 'straw') {
        ctx.fillStyle = '#d8b25a';
        ctx.strokeStyle = '#8a5a1e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(headTop.sx, headTop.sy, headSize * 0.95, headSize * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#caa048';
        ctx.fillRect(headTop.sx - headSize * 0.5, headTop.sy - headSize * 0.42, headSize, headSize * 0.36);
      } else if (ent.hat === 'helmet') {
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.fillRect(headTop.sx - headSize * 0.56, headTop.sy - headSize * 0.25, headSize * 1.12, headSize * 0.45);
        ctx.strokeRect(headTop.sx - headSize * 0.56, headTop.sy - headSize * 0.25, headSize * 1.12, headSize * 0.45);
      } else if (ent.hat === 'wizard') {
        ctx.fillStyle = '#5b21b6';
        ctx.beginPath();
        ctx.ellipse(headTop.sx, headTop.sy, headSize * 0.85, headSize * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(headTop.sx - headSize * 0.52, headTop.sy);
        ctx.lineTo(headTop.sx + headSize * 0.1, headTop.sy - headSize * 1.15);
        ctx.lineTo(headTop.sx + headSize * 0.52, headTop.sy);
        ctx.closePath();
        ctx.fill();
      } else if (ent.hat === 'crown') {
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.fillRect(headTop.sx - headSize * 0.52, headTop.sy - headSize * 0.35, headSize * 1.04, headSize * 0.35);
        ctx.strokeRect(headTop.sx - headSize * 0.52, headTop.sy - headSize * 0.35, headSize * 1.04, headSize * 0.35);
      }
      ctx.restore();
    }

    // Glowing zombie eyes when facing toward camera
    if (ent.zombie) {
      const eyeL = this.project(...toWorld(-1.8 * px, 28.2 * px, 4.1 * px));
      const eyeR = this.project(...toWorld(1.8 * px, 28.2 * px, 4.1 * px));
      if (eyeL && eyeR) {
        ctx.save();
        ctx.fillStyle = ent.eyeColor || '#ff3b2f';
        ctx.shadowColor = ent.eyeColor || '#ff3b2f';
        ctx.shadowBlur = 8;
        const es = Math.max(2, headSize * 0.16);
        ctx.fillRect(eyeL.sx - es * 0.5, eyeL.sy - es * 0.5, es, es * 0.75);
        ctx.fillRect(eyeR.sx - es * 0.5, eyeR.sy - es * 0.5, es, es * 0.75);
        ctx.restore();
      }
    }

    // Shield on left arm
    if (ent.shield) {
      const pSh = this.project(...toWorld(7.2 * px, 17 * px, 3.5 * px));
      if (pSh) {
        const sw = Math.max(5, headSize * 0.58);
        const sh = sw * 1.32;
        ctx.save();
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = Math.max(1.2, sw * 0.16);
        ctx.fillRect(pSh.sx - sw * 0.5, pSh.sy - sh * 0.5, sw, sh);
        ctx.strokeRect(pSh.sx - sw * 0.5, pSh.sy - sh * 0.5, sw, sh);
        ctx.restore();
      }
    }

    // Carried resource block in hands
    if (ent.carryBlock) {
      const pCarry = this.project(...toWorld(0, 19 * px, 5.5 * px));
      if (pCarry) {
        const b = BLOCKS[ent.carryBlock];
        if (b) {
          const t = getTileCanvas(b.tiles.side);
          const bs = Math.max(6, headSize * 0.75);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(t, pCarry.sx - bs * 0.5, pCarry.sy - bs * 0.5, bs, bs);
          ctx.restore();
        }
      }
    } else if (ent.item) {
      // Held weapon / tool sprite at right hand in 3D space
      const pHand = this.project(...toWorld(-6.5 * px, 18 * px, 4.5 * px));
      if (pHand) {
        const sp = getItemSprite(ent.item);
        const isz = Math.max(10, headSize * 1.28);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(pHand.sx, pHand.sy);
        ctx.rotate(-0.25);
        ctx.drawImage(sp, -isz * 0.5, -isz * 0.75, isz, isz);
        ctx.restore();
      }
    }
  }

  _drawLimbBox(ctx, skinCanvas, facesUV, ent, pt, toWorld) {
    const [px, py, pz] = pt.pivot;
    const [sx, sy, sz] = pt.size;
    const [ox, oy, oz] = pt.offset;
    const pitch = pt.pitch || 0;
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    const corner = (dx, dy, dz) => {
      const lx = ox + dx * sx;
      const ly = oy + dy * sy;
      const lz = oz + dz * sz;
      const ry = ly * cosP - lz * sinP;
      const rz = ly * sinP + lz * cosP;
      return this.project(...toWorld(px + lx, py + ry, pz + rz));
    };

    const c000 = corner(-0.5, -0.5, -0.5);
    const c100 = corner(0.5, -0.5, -0.5);
    const c010 = corner(-0.5, 0.5, -0.5);
    const c110 = corner(0.5, 0.5, -0.5);
    const c001 = corner(-0.5, -0.5, 0.5);
    const c101 = corner(0.5, -0.5, 0.5);
    const c011 = corner(-0.5, 0.5, 0.5);
    const c111 = corner(0.5, 0.5, 0.5);
    if (!c000 || !c100 || !c010 || !c110 || !c001 || !c101 || !c011 || !c111) return;

    const faces = [
      { key: 'front', a: c011, b: c111, c: c001, shade: 0 },
      { key: 'back', a: c110, b: c010, c: c100, shade: 0.25 },
      { key: 'left', a: c111, b: c110, c: c101, shade: 0.15 },
      { key: 'right', a: c010, b: c011, c: c000, shade: 0.18 },
      { key: 'top', a: c010, b: c110, c: c011, shade: 0 },
    ];

    for (const f of faces) {
      const { a, b, c } = f;
      const cross = (b.sx - a.sx) * (c.sy - a.sy) - (b.sy - a.sy) * (c.sx - a.sx);
      if (cross <= 0.5) continue;
      const [u, v, uw, uh] = facesUV[f.key] || facesUV.front;
      ctx.save();
      ctx.setTransform(
        (b.sx - a.sx) / uw,
        (b.sy - a.sy) / uw,
        (c.sx - a.sx) / uh,
        (c.sy - a.sy) / uh,
        a.sx,
        a.sy
      );
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skinCanvas, u, v, uw, uh, -0.15, -0.15, uw + 0.3, uh + 0.3);
      if (f.shade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${f.shade})`;
        ctx.fillRect(-0.15, -0.15, uw + 0.3, uh + 0.3);
      }
      ctx.restore();
    }
  }

  _drawExplosion(ctx, ex, p) {
    const pEdge = this.project(ex.x + ex.radius, ex.y, ex.z);
    const rPx = pEdge ? Math.max(24, Math.hypot(pEdge.sx - p.sx, pEdge.sy - p.sy)) : 64;
    ctx.save();
    const g = ctx.createRadialGradient(p.sx, p.sy, rPx * 0.1, p.sx, p.sy, rPx * 1.9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, ex.color || '#ff6b00');
    g.addColorStop(0.65, 'rgba(239, 68, 68, 0.45)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, rPx * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawBeam3D(ctx, bm) {
    const p0 = this.project(bm.x0, bm.y0, bm.z0);
    const p1 = this.project(bm.x1, bm.y1, bm.z1);
    if (!p0 || !p1) return;
    ctx.save();
    ctx.strokeStyle = bm.color || '#38bdf8';
    ctx.shadowColor = bm.color || '#38bdf8';
    ctx.shadowBlur = 16;
    ctx.lineWidth = bm.width || 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    if (bm.jagged) {
      const steps = 6;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const jx = ((i % 2 === 0 ? 1 : -1) * 12);
        const jy = ((i % 2 === 0 ? -1 : 1) * 8);
        ctx.lineTo(p0.sx + (p1.sx - p0.sx) * t + jx, p0.sy + (p1.sy - p0.sy) * t + jy);
      }
    }
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, (bm.width || 4) * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  _drawWorldLabelsAndBars(ctx) {
    // 1. Floating Villager Job Tags (identical to src/village/visuals.js jobLabelTexture!)
    for (const ent of this.entities) {
      const ph = ent._screenHead;
      if (!ph) continue;
      if (!ent.zombie && ent.label) {
        const text = ent.label;
        const dotColor = JOB_COLORS[ent.role] || '#4f8a2e';
        ctx.save();
        ctx.font = 'bold 17px "Trebuchet MS", system-ui, sans-serif';
        const tw = Math.min(180, ctx.measureText(text).width + 34);
        const th = 28;
        const x0 = ph.sx - tw / 2;
        const y0 = ph.sy - 34;

        ctx.fillStyle = 'rgba(12, 14, 20, 0.82)';
        roundRectPath(ctx, x0, y0, tw, th, 8);
        ctx.fill();

        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(x0 + 14, y0 + th / 2, 6.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(text, x0 + 25, y0 + th / 2 + 1);
        ctx.restore();
      } else if (ent.zombie && (ent.hp < 1 || ent.boss)) {
        // Floating Zombie / Boss HP bar
        const bw = ent.boss ? 92 : 48;
        const bh = ent.boss ? 9 : 6;
        const x0 = ph.sx - bw / 2;
        const y0 = ph.sy - (ent.boss ? 28 : 18);
        ctx.save();
        ctx.fillStyle = 'rgba(10, 10, 14, 0.85)';
        ctx.fillRect(x0 - 1, y0 - 1, bw + 2, bh + 2);
        ctx.fillStyle = ent.boss ? '#a855f7' : '#ef4444';
        ctx.fillRect(x0, y0, bw * Math.max(0.1, ent.hp), bh);
        if (ent.boss && ent.label) {
          ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
          ctx.fillStyle = '#fde047';
          ctx.textAlign = 'center';
          ctx.fillText(ent.label, ph.sx, y0 - 6);
        }
        ctx.restore();
      }
    }

    // 2. Floating Damage & Resource Gain Popups (DamageNumbers style)
    for (const pop of this.popups) {
      const p = this.project(pop.x, pop.y, pop.z);
      if (!p) continue;
      ctx.save();
      ctx.font = pop.crit ? '900 22px "Trebuchet MS", sans-serif' : 'bold 18px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(pop.text, p.sx, p.sy);
      ctx.fillStyle = pop.color || '#fef08a';
      ctx.fillText(pop.text, p.sx, p.sy);
      ctx.restore();
    }
  }
}

function isOpaqueBlock(id) {
  if (!id || id === B.AIR) return false;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cube' && b.render === 'opaque';
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// ============================================================================
// 3. AUTHENTIC ZOMBI CRAFT IN-GAME HUD COMPOSITOR (MATCHING src/ui/hud.js)
// ============================================================================
function drawAuthenticGameplayHUD(ctx, w, h, stage, cfg) {
  const s = w / 1920;
  ctx.save();
  ctx.scale(s, s);

  // 1) First-person held weapon/tool in Explore Mode (Viewmodel in bottom-right)
  if (cfg.heldWeapon) {
    const sp = getItemSprite(cfg.heldWeapon);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(1690, 890);
    ctx.rotate(-0.18);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 18;
    ctx.drawImage(sp, -180, -240, 340, 340);
    ctx.restore();

    // Explore mode crosshair in center
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(960 - 11, 540);
    ctx.lineTo(960 - 4, 540);
    ctx.moveTo(960 + 4, 540);
    ctx.lineTo(960 + 11, 540);
    ctx.moveTo(960, 540 - 11);
    ctx.moveTo(960, 540 - 11);
    ctx.lineTo(960, 540 - 4);
    ctx.moveTo(960, 540 + 4);
    ctx.lineTo(960, 540 + 11);
    ctx.stroke();
    ctx.restore();
  }

  // 2) Top-Left: Pause Button + Vitals Panel (HP, Mana, Stamina) + Mode Buttons
  drawPanelBox(ctx, 18, 18, 46, 46, 10);
  ctx.fillStyle = '#f3e5c8';
  ctx.fillRect(33, 31, 5, 20);
  ctx.fillRect(44, 31, 5, 20);

  drawPanelBox(ctx, 74, 16, 268, 96, 12);
  drawVitalBar(ctx, 86, 26, 244, 22, 'health', cfg.hp || [100, 100], '#dc2626', '#ef4444');
  drawVitalBar(ctx, 86, 53, 244, 22, 'mana', cfg.mp || [100, 100], '#1d4ed8', '#3b82f6');
  drawVitalBar(ctx, 86, 80, 244, 22, 'stamina', cfg.st || [100, 100], '#b45309', '#f59e0b');

  // Mode buttons below vitals (Командовать [Tab], Крафт [I], Инвентарь [E], Соседи [N])
  const modeButtons = [
    [cfg.commandMode ? 'В режим героя' : 'Командовать', 'Tab', cfg.commandMode],
    ['Крафт', 'I', false],
    ['Инвентарь', 'E', false],
    ['Соседи', 'N', false],
  ];
  let mbY = 122;
  for (const [lbl, key, active] of modeButtons) {
    drawPanelBox(ctx, 18, mbY, 196, 38, 9, active ? 'rgba(180, 120, 28, 0.92)' : 'rgba(22, 18, 14, 0.86)');
    ctx.font = 'bold 15px "Philosopher", "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#f7ebd2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, 32, mbY + 19);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRectPath(ctx, 162, mbY + 7, 42, 24, 6);
    ctx.fill();
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.fillText(key, 183, mbY + 19);
    mbY += 44;
  }

  // 3) Top-Center: Resource Bar (.zc-resbar)
  const resEntries = cfg.resources || [
    ['wood', 180],
    ['stone', 140],
    ['food', 95],
    ['coal', 45],
    ['iron', 60],
    ['gold', 25],
    ['crystal', 12],
  ];
  const chipW = 92;
  const totalResW = (resEntries.length + 1) * chipW + 24;
  const resX0 = Math.round(960 - totalResW / 2);
  drawPanelBox(ctx, resX0, 16, totalResW, 46, 12);

  let rx = resX0 + 14;
  for (const [rKey, val] of resEntries) {
    const ico = getResourceIcon(rKey);
    ctx.drawImage(ico, rx, 25, 28, 28);
    ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#f8efd8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(val), rx + 33, 39);
    rx += chipW;
  }
  const popIco = getResourceIcon('population');
  ctx.drawImage(popIco, rx, 25, 28, 28);
  ctx.fillStyle = '#fde68a';
  ctx.fillText(cfg.pop || '14/20', rx + 33, 39);

  // 4) Top-Right: Minimap + Clock/Era Panel + Research Pill + Quest Tracker
  drawMinimapHUD(ctx, 1920 - 196, 16, 178, stage, cfg);

  // Clock & Age Panel next to minimap
  const clkX = 1920 - 418, clkY = 16, clkW = 212, clkH = 98;
  drawPanelBox(ctx, clkX, clkY, clkW, clkH, 12);

  // Sun/Moon dial
  ctx.save();
  ctx.beginPath();
  ctx.arc(clkX + 36, clkY + 49, 24, 0, Math.PI * 2);
  ctx.fillStyle = cfg.night ? '#0f172a' : '#38bdf8';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#d97706';
  ctx.stroke();
  ctx.fillStyle = cfg.night ? '#e2e8f0' : '#fde047';
  ctx.beginPath();
  ctx.arc(clkX + 36, clkY + 44, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.font = 'bold 17px "Philosopher", sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText(cfg.dayText || 'День 12', clkX + 70, clkY + 26);
  ctx.font = '14px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#e5d5b5';
  ctx.fillText(cfg.timeText || '14:20 · Ясно', clkX + 70, clkY + 48);
  ctx.font = 'bold 14px "Philosopher", sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.fillText(cfg.ageText || 'Железный век', clkX + 70, clkY + 72);

  // Research Pill
  drawPanelBox(ctx, clkX, clkY + 106, clkW, 42, 10);
  const resIco = getResourceIcon('research');
  ctx.drawImage(resIco, clkX + 10, clkY + 113, 26, 26);
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#e9d5ff';
  ctx.fillText(cfg.researchText || 'Кузнечное дело', clkX + 42, clkY + 121);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(clkX + 42, clkY + 131, 156, 8);
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(clkX + 42, clkY + 131, Math.round(156 * (cfg.researchProg ?? 0.68)), 8);

  // Quest Tracker
  if (cfg.questText) {
    drawPanelBox(ctx, 1920 - 310, 204, 292, 66, 10);
    ctx.font = 'bold 13px "Philosopher", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('ЗАДАНИЕ ДЕРЕВНИ', 1920 - 294, 224);
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#f3e5c8';
    ctx.fillText(cfg.questText, 1920 - 294, 248);
  }

  // 5) Wave Banner / Underground Toast if active
  if (cfg.waveBanner) {
    const bw = 640, bh = 78, bx = 960 - bw / 2, by = 74;
    drawPanelBox(ctx, bx, by, bw, bh, 14, 'rgba(28, 10, 14, 0.92)', '#ef4444');
    ctx.textAlign = 'center';
    ctx.font = '900 28px "Ruslan Display", "Philosopher", serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText(cfg.waveBanner[0], 960, by + 30);
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(cfg.waveBanner[1], 960, by + 58);
  } else if (cfg.toastText) {
    const tw = 560, th = 44, tx = 960 - tw / 2, ty = 74;
    drawPanelBox(ctx, tx, ty, tw, th, 10, 'rgba(20, 16, 12, 0.88)', '#d97706');
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(cfg.toastText, 960, ty + 23);
  }

  // 6) Command Mode Inspector Panel (when in top-down Command mode)
  if (cfg.commandMode && cfg.inspector) {
    const ix = 1920 - 330, iy = 790, iw = 310, ih = 178;
    drawPanelBox(ctx, ix, iy, iw, ih, 12);
    const bIco = getBuildingIcon(cfg.inspector.type || 'town_hall');
    ctx.drawImage(bIco, ix + 16, iy + 18, 52, 52);
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px "Philosopher", sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(cfg.inspector.title, ix + 80, iy + 36);
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(cfg.inspector.sub, ix + 80, iy + 58);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(ix + 18, iy + 84, iw - 36, 12);
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#f8efd8';
    ctx.fillText(cfg.inspector.workers, ix + 18, iy + 118);
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(cfg.inspector.bonus, ix + 18, iy + 144);
  }

  // 7) Bottom 9-Slot Hotbar (.zc-hotbar) + Active Item Name
  const slots = cfg.hotbar || [
    'sword_iron', 'pickaxe_iron', 'axe_iron', 'bow', 'staff_fire', 'shovel', 'bread', 'potion_heal', 'tome_meteor',
  ];
  const selSlot = cfg.selectedSlot ?? 0;
  const slotSz = 58;
  const slotGap = 8;
  const hbW = slots.length * slotSz + (slots.length - 1) * slotGap + 24;
  const hbX = Math.round(960 - hbW / 2);
  const hbY = 1080 - 84;

  // Selected item name above hotbar
  const selId = slots[selSlot];
  const selLabel = ITEMS[selId]?.name || cfg.selectedLabel || 'Оружие';
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px "Philosopher", sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(selLabel, 960, hbY - 14);
  ctx.fillStyle = '#fde68a';
  ctx.fillText(selLabel, 960, hbY - 14);

  drawPanelBox(ctx, hbX, hbY, hbW, slotSz + 16, 14);
  for (let i = 0; i < slots.length; i++) {
    const sx = hbX + 12 + i * (slotSz + slotGap);
    const sy = hbY + 8;
    const isSel = i === selSlot;
    drawPanelBox(
      ctx,
      sx,
      sy,
      slotSz,
      slotSz,
      10,
      isSel ? 'rgba(72, 52, 22, 0.95)' : 'rgba(18, 15, 12, 0.9)',
      isSel ? '#facc15' : 'rgba(180, 140, 80, 0.45)'
    );
    if (slots[i]) {
      const sp = getItemSprite(slots[i]);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sp, sx + 7, sy + 7, slotSz - 14, slotSz - 14);
      ctx.restore();
    }
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = isSel ? '#fde047' : '#a8a29e';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), sx + 6, sy + 14);
  }

  ctx.restore();
}

function drawPanelBox(ctx, x, y, w, h, r, bg = 'rgba(20, 16, 12, 0.86)', border = 'rgba(202, 158, 82, 0.65)') {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.restore();
}

function drawVitalBar(ctx, x, y, w, h, iconName, [val, max], c0, c1) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 6);
  ctx.fillStyle = 'rgba(8, 8, 12, 0.85)';
  ctx.fill();

  const ratio = Math.max(0, Math.min(1, val / Math.max(1, max)));
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  roundRectPath(ctx, x + 2, y + 2, Math.max(8, (w - 4) * ratio), h - 4, 5);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${val} / ${max}`, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawMinimapHUD(ctx, x, y, sz, stage, cfg) {
  const cx = x + sz / 2;
  const cy = y + sz / 2;
  const r = sz / 2 - 6;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18, 14, 10, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ca9e52';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = cfg.caveMap ? '#1e1418' : '#2d5a27';
  ctx.fillRect(x, y, sz, sz);

  // Sample terrain blocks around origin
  const scale = r / 24;
  for (const [k, id] of stage.blocks) {
    const [bx, by, bz] = k.split(',').map(Number);
    if (by < 0 || by > 5) continue;
    let col = null;
    if (id === B.WATER) col = '#2563eb';
    else if (id === B.LAVA || id === B.MAGMA) col = '#ea580c';
    else if (id === B.PATH || id === B.SAND) col = '#ca8a04';
    else if (id === B.MARBLE || id === B.STONE_BRICKS || id === B.COBBLESTONE || id === B.REINFORCED_WALL) col = '#94a3b8';
    else if (id === B.PLANKS || id === B.LOG || id === B.SPRUCE_LOG) col = '#78350f';
    if (col) {
      ctx.fillStyle = col;
      ctx.fillRect(cx + bx * scale - 2, cy + bz * scale - 2, 4, 4);
    }
  }

  // Camera FOV cone
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 28, cy - 48);
  ctx.lineTo(cx + 28, cy - 48);
  ctx.closePath();
  ctx.fill();

  // Entity radar blips (green villagers, red zombies)
  for (const ent of stage.entities) {
    const ex = cx + ent.x * scale;
    const ez = cy + ent.z * scale;
    ctx.fillStyle = ent.zombie ? (ent.boss ? '#d946ef' : '#ef4444') : '#4ade80';
    ctx.beginPath();
    ctx.arc(ex, ez, ent.boss ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Compass N/E/S/W
  ctx.save();
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('С', cx, y + 10);
  ctx.fillText('Ю', cx, y + sz - 10);
  ctx.fillText('З', x + 10, cy);
  ctx.fillText('В', x + sz - 10, cy);
  ctx.restore();
}

// ============================================================================
// 4. THE 5 AUTHENTIC 3D PERSPECTIVE GAMEPLAY SCENES
// ============================================================================

// Scene 1: Mines, Huge Caves & Hell Underworld (3D Explore Gameplay Underground)
function composeCavesHellGameplay(ctx, w, h) {
  const stage = new PerspectiveGameplayStage({
    camPos: [-1, 10.2, 18.5],
    lookAt: [0.5, 4.2, -4],
    fov: 64,
    ambient: [0.44, 0.38, 0.48],
    skyTop: '#08050d',
    skyHorizon: '#2a0b08',
    fogColor: [38, 12, 14],
    fogNear: 22,
    fogFar: 58,
    sunDir: [0.2, -0.8, 0.4],
  });

  // 1) Full-screen Cavern Ceiling (y = 15..17) & Back Rock Walls so 100% of viewport is underground cavern!
  for (let z = -22; z <= 22; z++) {
    for (let x = -28; x <= 28; x++) {
      const ceilH = 15 + ((Math.abs(x * 13 + z * 7)) % 3);
      stage.set(x, ceilH, z, (x + z) % 7 === 0 ? B.CRYSTAL_ORE : (x + z) % 5 === 0 ? B.GLOW_MOSS : B.DARK_STONE);
      if ((x * 19 + z * 31) % 23 === 0 && Math.abs(x) < 18 && z < 10) {
        stage.set(x, ceilH - 1, z, B.COBBLESTONE);
      }
      // Back & side cavern walls
      if (z <= -16 || x <= -22 || x >= 22) {
        for (let y = 1; y <= ceilH; y++) {
          let id = y <= 4 ? B.MAGMA : B.DARK_STONE;
          const hsh = Math.abs((x * 37 + y * 19 + z * 13) % 19);
          if (hsh === 0) id = B.GOLD_ORE;
          else if (hsh === 1) id = B.CRYSTAL_ORE;
          else if (hsh === 2) id = B.AMETHYST;
          else if (hsh === 3) id = B.IRON_ORE;
          stage.set(x, y, z, id);
        }
      }
    }
  }

  // 2) Lower Hell Underworld (y = 0..2): Lava Sea, Ash/Magma Islands & Obsidian Bridge
  for (let z = -16; z <= 20; z++) {
    for (let x = -22; x <= 22; x++) {
      stage.set(x, 0, z, B.OBSIDIAN);
      const isIsland = Math.hypot(x - 5, z - 2) < 5.5 || Math.hypot(x + 8, z - 3) < 4.5 || z >= 11;
      if (isIsland) {
        stage.set(x, 1, z, (x + z) % 3 === 0 ? B.MAGMA : B.ASH);
        if (Math.hypot(x - 5, z - 2) < 3.6) stage.set(x, 2, z, B.CRACKED_BRICKS);
      } else {
        stage.set(x, 1, z, B.LAVA);
      }
    }
  }
  stage.addLight(0, 2.5, 2, 255, 85, 20, 18, 1.25);
  stage.addLight(7, 3, -1, 255, 65, 15, 16, 1.15);

  // Obsidian Bridge spanning across the Lava Sea at z = 2..4
  for (let x = -15; x <= 14; x++) {
    for (let z = 2; z <= 4; z++) {
      stage.set(x, 4, z, z === 3 ? B.OBSIDIAN : B.CRACKED_BRICKS);
    }
    if (x % 4 === 0) {
      stage.set(x, 5, 2, B.COBBLESTONE);
      stage.set(x, 6, 2, B.LANTERN);
      stage.addLight(x, 6.5, 2, 255, 195, 90, 10, 0.95);
    }
  }

  // Hell Spawner & Boss Treasure Vault on the right island (x=5, z=-2)
  stage.set(5, 3, -2, B.SPAWNER);
  stage.set(3, 3, -2, B.CHEST);
  stage.set(6, 3, -3, B.GOLD_BLOCK);
  stage.set(6, 4, -3, B.SKULL_BLOCK);

  // 3) Upper Mine Terrace on the left & back-left (y = 2..7) with timber supports, conveyor & ore veins
  for (let z = -15; z <= 8; z++) {
    for (let x = -21; x <= -4; x++) {
      for (let y = 2; y <= 6; y++) {
        let id = B.STONE;
        const hsh = Math.abs((x * 29 + y * 17 + z * 11) % 11);
        if (hsh === 0) id = B.GOLD_ORE;
        else if (hsh === 1) id = B.CRYSTAL_ORE;
        else if (hsh === 2) id = B.IRON_ORE;
        else if (hsh === 3) id = B.COAL_ORE;
        stage.set(x, y, z, id);
      }
      stage.set(x, 6, z, (x + z) % 3 === 0 ? B.COBBLESTONE : B.STONE);
    }
  }
  // Mine timber arches & torches on the upper terrace
  for (const mz of [-10, -4, 2]) {
    for (let y = 7; y <= 10; y++) {
      stage.set(-14, y, mz, B.LOG);
      stage.set(-6, y, mz, B.LOG);
    }
    for (let x = -14; x <= -6; x++) stage.set(x, 10, mz, B.PLANKS);
    stage.set(-6, 8, mz + 1, B.TORCH);
    stage.addLight(-5.5, 8.5, mz + 1, 255, 190, 80, 11, 1.0);
  }
  for (let z = -11; z <= 3; z++) stage.set(-10, 7, z, B.BELT);

  // Glowing Amethyst & Crystal Geode on the right cavern cliff (x = 9..16, z = -10..-4, y = 3..9)
  for (let z = -11; z <= -5; z++) {
    for (let x = 9; x <= 16; x++) {
      for (let y = 2; y <= 8; y++) {
        if (x > 11 && z < -6 && y > 3 && y < 8) {
          stage.set(x, y, z, (x + y + z) % 2 === 0 ? B.AMETHYST : B.CRYSTAL_ORE);
        } else if (y <= 5) {
          stage.set(x, y, z, (x + y) % 2 === 0 ? B.CRYSTAL_ORE : B.AMETHYST);
        }
      }
    }
  }
  stage.addLight(11, 6, -6, 80, 210, 255, 14, 1.2);

  // 4) 3D Characters in the cavern & Hell bridge
  stage.addCharacter({ role: 'miner', label: 'Шахтёр', x: -8.5, y: 7, z: -2, yaw: 1.2, item: 'pickaxe_iron', pose: 'mine', scale: 1.15 });
  stage.addCharacter({ role: 'miner', label: 'Шахтёр', x: -11.5, y: 7, z: -6, yaw: 0.8, item: 'pickaxe_iron', carryBlock: B.GOLD_ORE, pose: 'carry', scale: 1.15 });
  stage.addCharacter({ role: 'guard', label: 'Стражник', x: -2.5, y: 5, z: 3, yaw: 1.4, hat: 'helmet', item: 'sword_crystal', shield: true, pose: 'attack', scale: 1.2 });
  stage.addCharacter({ role: 'mage', label: 'Маг', x: -5.5, y: 5, z: 3.3, yaw: 1.3, hat: 'wizard', item: 'staff_storm', pose: 'cast', scale: 1.18 });

  // Hell Bosses & Monsters
  stage.addCharacter({ zombie: true, boss: true, role: 'necromancer', label: 'Повелитель Некромантов', x: 4.5, y: 3, z: -1.5, yaw: -1.6, hat: 'crown', item: 'staff_fire', eyeColor: '#d946ef', hp: 0.78, scale: 1.55 });
  stage.addCharacter({ zombie: true, boss: true, role: 'brute', label: 'Пещерный Брут', x: 1.8, y: 5, z: 3.0, yaw: -1.5, eyeColor: '#ff4500', hp: 0.62, scale: 1.48 });
  stage.addCharacter({ zombie: true, role: 'exploder', x: 6.2, y: 5, z: 3.2, yaw: -1.6, eyeColor: '#fbbf24', hp: 0.85, scale: 1.2 });
  stage.addCharacter({ zombie: true, role: 'walker', x: -0.5, y: 2, z: 7.5, yaw: -2.2, eyeColor: '#ff3b2f', hp: 0.5, scale: 1.15 });
  stage.addCharacter({ zombie: true, role: 'spitter', x: 8.0, y: 2, z: 4.5, yaw: -1.8, eyeColor: '#84cc16', hp: 0.7, scale: 1.18 });

  stage.beams.push({ x0: -5.2, y0: 6.5, z0: 3.3, x1: 1.8, y1: 6.2, z1: 3.0, color: '#38bdf8', width: 5, jagged: true });
  stage.explosions.push({ x: 1.8, y: 5.8, z: 3.0, radius: 1.3, color: '#38bdf8' });

  stage.popups.push({ x: -8.2, y: 9.2, z: -2, text: '+2 золотой руды', color: '#fde047' });
  stage.popups.push({ x: 1.8, y: 7.8, z: 3.0, text: '-94 КРИТ!', color: '#38bdf8', crit: true });

  stage.renderTo(ctx, w, h);

  drawAuthenticGameplayHUD(ctx, w, h, stage, {
    heldWeapon: 'sword_crystal',
    selectedSlot: 0,
    selectedLabel: 'Кристальный меч',
    hp: [118, 130],
    mp: [84, 120],
    st: [92, 100],
    resources: [['wood', 420], ['stone', 690], ['food', 280], ['coal', 195], ['iron', 148], ['gold', 96], ['crystal', 64]],
    pop: '18/22',
    dayText: 'День 19',
    timeText: '21:40 · Подземелье',
    ageText: 'Эпоха Магии',
    night: true,
    caveMap: true,
    researchText: 'Кристальная ковка',
    researchProg: 0.82,
    questText: 'Победить босса Преисподней (0/1)',
    toastText: 'Глубокие пещеры → Преисподняя: море лавы и сокровищницы!',
    hotbar: ['sword_crystal', 'pickaxe_iron', 'staff_storm', 'tome_meteor', 'crossbow', 'axe_iron', 'bread', 'potion_heal', 'torch'],
  });
}

// Scene 2: Super-Upgraded Village Top-Down (3D Command Mode RTS View)
function composeSuperVillageGameplay(ctx, w, h) {
  const stage = new PerspectiveGameplayStage({
    camPos: [0, 34, 30],
    lookAt: [0, 1, -2],
    fov: 56,
    ambient: [0.95, 0.94, 0.9],
    skyTop: '#2563eb',
    skyHorizon: '#93c5fd',
    fogColor: [165, 205, 248],
    fogNear: 52,
    fogFar: 120,
    sunDir: [0.48, 0.82, 0.32],
  });

  // Full-screen terrain coverage (-36..36, -32..30)
  for (let z = -32; z <= 30; z++) {
    for (let x = -36; x <= 36; x++) {
      let id = B.GRASS;
      const inWall = Math.abs(x) <= 22 && Math.abs(z) <= 20;
      if (inWall && (Math.abs(x) <= 2 || Math.abs(z) <= 2)) id = B.MARBLE;
      else if (inWall && (Math.abs(x) === 3 || Math.abs(z) === 3)) id = B.STONE_BRICKS;
      else if (inWall && (Math.abs(x) % 8 === 0 || Math.abs(z) % 8 === 0)) id = B.COBBLESTONE;
      stage.set(x, 0, z, id);
      if (!inWall && ((x * 31 + z * 17) & 15) === 0) {
        stage.set(x, 1, z, (x + z) & 1 ? B.FLOWER_YELLOW : B.TALL_GRASS);
      }
    }
  }

  // Grand Upgraded Citadel Buildings (Tier 7)
  stage.placeBuilding('town_hall', -5, 0, -5, 0, 0, 7);
  stage.placeBuilding('mage_tower', -15, 0, -14, 0, 0, 6);
  stage.placeBuilding('mage_tower', 9, 0, -14, 0, 0, 6);
  stage.placeBuilding('forge', -15, 0, 4, 0, 0, 6);
  stage.placeBuilding('laboratory', 9, 0, 4, 0, 0, 7);
  stage.placeBuilding('barracks', -15, 0, -5, 1, 0, 6);
  stage.placeBuilding('storehouse', 9, 0, -5, 3, 0, 6);
  stage.placeBuilding('house', -8, 0, 11, 2, 1, 6);
  stage.placeBuilding('house', 4, 0, 11, 2, 2, 6);
  stage.placeBuilding('farm', -17, 0, 12, 0, 0, 5);
  // Active blueprint hologram construction site on the right (like real gameplay!)
  stage.placeBuilding('tesla_tower', 13, 0, 12, 0, 0, 7, true);
  stage.placeBuilding('cannon_tower', -19, 0, -17, 0, 0, 6);
  stage.placeBuilding('cannon_tower', 15, 0, -17, 0, 0, 6);
  stage.placeBuilding('tesla_tower', -19, 0, 14, 0, 0, 7);
  stage.placeBuilding('laser_tower', 16, 0, -4, 0, 0, 9);

  // Double Reinforced Wall Perimeter with Gold & Neon Beacons
  const WX = 22, WZ = 20;
  for (let x = -WX; x <= WX; x++) {
    for (const wz of [-WZ, WZ]) {
      if (Math.abs(x) <= 2) continue;
      for (let y = 1; y <= 3; y++) stage.set(x, y, wz, y === 3 ? B.STONE_BRICKS : B.REINFORCED_WALL);
      if (Math.abs(x) % 2 === 0) stage.set(x, 4, wz, B.MARBLE);
      if (Math.abs(x) % 6 === 0) {
        stage.set(x, 4, wz, B.GOLD_BLOCK);
        stage.set(x, 5, wz, B.NEON);
      }
    }
  }
  for (let z = -WZ; z <= WZ; z++) {
    for (const wx of [-WX, WX]) {
      if (Math.abs(z) <= 2) continue;
      for (let y = 1; y <= 3; y++) stage.set(wx, y, z, y === 3 ? B.STONE_BRICKS : B.REINFORCED_WALL);
      if (Math.abs(z) % 2 === 0) stage.set(wx, 4, z, B.MARBLE);
    }
  }

  // Forest outside the walls
  for (const [tx, tz, sp] of [[-27, -12, 'spruce'], [-28, 4, 'oak'], [-26, 18, 'birch'], [27, -14, 'spruce'], [28, 5, 'oak'], [26, 17, 'spruce']]) {
    stage.placeTree(tx, 1, tz, sp);
  }

  // Yellow selection rectangle around the central Town Hall
  stage.selectionRect = { x: -5.4, y: 0, z: -5.4, w: 10.8, d: 10.8, color: '#ffe066' };

  // Bustling 3D Villagers with Floating Russian Job Tags
  const citizens = [
    { role: 'player', label: 'Герой', x: 0, y: 1, z: 7.5, yaw: 0.2, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.18 },
    { role: 'guard', label: 'Стражник', x: -2.4, y: 1, z: 16, yaw: 0, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.12 },
    { role: 'guard', label: 'Стражник', x: 2.4, y: 1, z: 16, yaw: 0, hat: 'helmet', item: 'crossbow', scale: 1.12 },
    { role: 'mage', label: 'Маг', x: -7.5, y: 1, z: -1.5, yaw: 0.8, hat: 'wizard', item: 'staff_storm', scale: 1.12 },
    { role: 'mage', label: 'Маг', x: 7.5, y: 1, z: -1.5, yaw: -0.8, hat: 'wizard', item: 'staff_fire', scale: 1.12 },
    { role: 'blacksmith', label: 'Кузнец', x: -9.5, y: 1, z: 6.5, yaw: 1.1, item: 'axe_iron', scale: 1.12 },
    { role: 'researcher', label: 'Учёный', x: 7.5, y: 1, z: 6.5, yaw: -1.1, item: 'tome_meteor', scale: 1.12 },
    { role: 'farmer', label: 'Фермер', x: -13.5, y: 1, z: 14.5, yaw: 0.5, hat: 'straw', item: 'shovel', scale: 1.12 },
    { role: 'builder', label: 'Строитель', x: 11.8, y: 1, z: 13.5, yaw: 1.4, item: 'pickaxe_iron', pose: 'chop', scale: 1.12 },
    { role: 'builder', label: 'Строитель', x: 14.5, y: 1, z: 15.2, yaw: -0.7, carryBlock: B.IRON_BLOCK, pose: 'carry', scale: 1.12 },
    { role: 'woodcutter', label: 'Лесоруб', x: -24, y: 1, z: 5, yaw: -1.4, item: 'axe_iron', pose: 'chop', scale: 1.12 },
    { role: 'guard', label: 'Стражник', x: -13, y: 1, z: 0, yaw: 1.5, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.12 },
  ];
  for (const c of citizens) stage.addCharacter(c);

  stage.popups.push({ x: -9.5, y: 3.2, z: 6.5, text: '+2 стали', color: '#fde047' });
  stage.popups.push({ x: -13.5, y: 3.2, z: 14.5, text: '+4 еды', color: '#4ade80' });

  stage.renderTo(ctx, w, h);

  drawAuthenticGameplayHUD(ctx, w, h, stage, {
    commandMode: true,
    selectedSlot: 0,
    selectedLabel: 'Кристальный меч',
    hp: [150, 150],
    mp: [150, 150],
    st: [100, 100],
    resources: [['wood', 2480], ['stone', 3120], ['food', 1890], ['coal', 840], ['iron', 960], ['gold', 720], ['crystal', 410]],
    pop: '38/40',
    dayText: 'День 45',
    timeText: '13:15 · Ясно',
    ageText: 'Эпоха Сингулярности',
    researchText: 'Звездопад (Изучено)',
    researchProg: 1.0,
    questText: 'Удерживать оборону Цитадели',
    inspector: {
      type: 'town_hall',
      title: 'Ратуша · Уровень 7',
      sub: 'Имперская Цитадель · Прочность 4500 / 4500',
      workers: 'Защитники на посту: 8 / 8 · Лимит жителей: 40',
      bonus: 'Бонус эпохи: +85% к выработке и урону башен',
    },
    hotbar: ['sword_crystal', 'staff_storm', 'tome_meteor', 'staff_fire', 'crossbow', 'pickaxe_iron', 'axe_iron', 'bread', 'potion_heal'],
  });
}

// Scene 3: Iron Age Fortress & Forge (3D Explore/Village Gameplay)
function composeIronAgeGameplay(ctx, w, h) {
  const stage = new PerspectiveGameplayStage({
    camPos: [1, 13.5, 22],
    lookAt: [-1, 2.2, 0],
    fov: 60,
    ambient: [0.92, 0.9, 0.86],
    skyTop: '#2f6ec8',
    skyHorizon: '#a8cbe8',
    fogColor: [168, 203, 232],
    fogNear: 34,
    fogFar: 82,
    sunDir: [0.55, 0.75, 0.36],
  });

  // Full-screen terrain with stepped hills on the left/back
  for (let z = -26; z <= 26; z++) {
    for (let x = -30; x <= 30; x++) {
      const hill = (x < -15 || z < -15) ? Math.min(3, Math.floor((Math.max(0, -x - 14) + Math.max(0, -z - 14)) / 4)) : 0;
      for (let y = 0; y <= hill; y++) {
        const inside = Math.abs(x) <= 13 && Math.abs(z) <= 12;
        const id = y < hill ? B.DIRT : inside ? ((x + z) % 4 === 0 ? B.MOSSY_COBBLE : B.COBBLESTONE) : B.GRASS;
        stage.set(x, y, z, id);
      }
      if (hill === 0 && Math.abs(x) > 14 && ((x * 23 + z * 19) & 15) === 0) {
        stage.set(x, 1, z, B.TALL_GRASS);
      }
    }
  }

  // Iron Age (Tier 3) Buildings
  stage.placeBuilding('town_hall', -5, 0, -12, 0, 0, 3);
  stage.placeBuilding('forge', -12, 0, -2, 0, 0, 3);
  stage.placeBuilding('barracks', 5, 0, -3, 3, 0, 3);
  stage.placeBuilding('watchtower', -11, 0, 7, 0, 0, 3);
  // Active construction site with cyan hologram blueprint blocks on the right (like user's screenshot #2!)
  stage.placeBuilding('mine', 5, 0, 6, 0, 0, 3, true);

  // Stone & Timber Rampart Wall along the front (z = 14)
  for (let x = -18; x <= 18; x++) {
    if (Math.abs(x) <= 2) continue;
    for (let y = 1; y <= 3; y++) stage.set(x, y, 14, y === 3 ? B.COBBLESTONE : B.STONE_BRICKS);
    if (x % 2 === 0) stage.set(x, 4, 14, B.COBBLESTONE);
    if (Math.abs(x) === 4 || Math.abs(x) === 11) {
      stage.set(x, 4, 14, B.SPRUCE_LOG);
      stage.set(x, 5, 14, B.TORCH);
      stage.addLight(x, 5.5, 14, 255, 185, 80, 9, 0.85);
    }
  }

  // Glowing Outdoor Smelter Hearth & Iron Anvil in Courtyard
  stage.box(-4, 1, 3, -3, 1, 4, B.IRON_BLOCK);
  stage.set(-3, 2, 3, B.IRON_BLOCK);
  stage.set(-5, 1, 3, B.FURNACE);
  stage.set(-5, 2, 3, B.TORCH);
  stage.addLight(-4.5, 2.5, 3.5, 255, 130, 45, 11, 1.0);

  for (const [tx, tz, sp] of [[-18, -7, 'spruce'], [-19, 4, 'oak'], [-17, 12, 'spruce'], [17, -8, 'spruce'], [18, 3, 'oak'], [16, 11, 'birch']]) {
    const gy = stage.get(tx, 1, tz) ? 2 : 1;
    stage.placeTree(tx, gy, tz, sp);
  }

  // 3D Villagers & Guards in action
  stage.addCharacter({ role: 'blacksmith', label: 'Кузнец', x: -4.2, y: 1, z: 4.8, yaw: 2.6, item: 'axe_iron', pose: 'chop', scale: 1.18 });
  stage.addCharacter({ role: 'miner', label: 'Шахтёр', x: 3.2, y: 1, z: 8.5, yaw: -0.9, item: 'pickaxe_iron', carryBlock: B.IRON_ORE, pose: 'carry', scale: 1.16 });
  stage.addCharacter({ role: 'builder', label: 'Строитель', x: 4.5, y: 1, z: 6.2, yaw: 0.8, item: 'pickaxe_iron', pose: 'chop', scale: 1.16 });
  stage.addCharacter({ role: 'builder', label: 'Строитель', x: 8.2, y: 1, z: 7.4, yaw: -1.2, carryBlock: B.COBBLESTONE, pose: 'carry', scale: 1.16 });
  stage.addCharacter({ role: 'woodcutter', label: 'Лесоруб', x: -15.5, y: 1, z: 4.5, yaw: -1.4, item: 'axe_iron', pose: 'chop', scale: 1.16 });
  stage.addCharacter({ role: 'guard', label: 'Стражник', x: -2.0, y: 1, z: 8.5, yaw: 0.2, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.2 });
  stage.addCharacter({ role: 'guard', label: 'Стражник', x: 0.5, y: 1, z: 9.2, yaw: -0.15, hat: 'helmet', item: 'battle_axe', shield: true, scale: 1.2 });
  stage.addCharacter({ role: 'guard', label: 'Стражник', x: -1.2, y: 1, z: 12.5, yaw: 0.1, hat: 'helmet', item: 'crossbow', scale: 1.18 });

  stage.popups.push({ x: -4.2, y: 3.3, z: 4.8, text: '+1 железа', color: '#fde047' });
  stage.popups.push({ x: -15.5, y: 3.3, z: 4.5, text: '+2 дерева', color: '#4ade80' });

  stage.renderTo(ctx, w, h);

  drawAuthenticGameplayHUD(ctx, w, h, stage, {
    heldWeapon: 'sword_iron',
    selectedSlot: 0,
    selectedLabel: 'Железный меч',
    hp: [100, 100],
    mp: [100, 100],
    st: [96, 100],
    resources: [['wood', 345], ['stone', 490], ['food', 215], ['coal', 124], ['iron', 86], ['gold', 28], ['crystal', 8]],
    pop: '16/20',
    dayText: 'День 14',
    timeText: '15:20 · Ясно',
    ageText: 'Железный век',
    researchText: 'Баллистика',
    researchProg: 0.65,
    questText: 'Построить шахту и выковать латы (2/3)',
    hotbar: ['sword_iron', 'pickaxe_iron', 'axe_iron', 'crossbow', 'battle_axe', 'shovel', 'bread', 'torch', 'bow'],
  });
}

// Scene 4: Stone Age Pioneer Settlement (3D Early Survival Gameplay)
function composeStoneAgeGameplay(ctx, w, h) {
  const stage = new PerspectiveGameplayStage({
    camPos: [0, 13.8, 21.5],
    lookAt: [-1, 2.0, 1],
    fov: 60,
    ambient: [0.98, 0.96, 0.9],
    skyTop: '#388ee0',
    skyHorizon: '#a8dcfa',
    fogColor: [168, 220, 250],
    fogNear: 36,
    fogFar: 85,
    sunDir: [0.58, 0.78, 0.25],
  });

  // Full-screen lush valley terrain with stepped green hills on back/left & river on right
  for (let z = -26; z <= 26; z++) {
    for (let x = -30; x <= 30; x++) {
      const riverX = 13 + Math.sin(z * 0.2) * 2.2;
      if (Math.abs(x - riverX) < 2.3) {
        stage.set(x, 0, z, B.WATER);
      } else if (Math.abs(x - riverX) < 3.6) {
        stage.set(x, 0, z, B.SAND);
      } else {
        const hill = (z < -12 || x < -14) ? Math.min(3, Math.floor((Math.max(0, -z - 11) + Math.max(0, -x - 13)) / 4)) : 0;
        for (let y = 0; y <= hill; y++) {
          const isPath = hill === 0 && Math.hypot(x + 1, z - 3) < 6.2 && (x + z) % 2 === 0;
          stage.set(x, y, z, y < hill ? B.DIRT : isPath ? B.PATH : B.GRASS);
        }
        const hsh = Math.abs((x * 41 + z * 19) % 23);
        if (hill === 0 && Math.hypot(x + 1, z - 3) > 6.5) {
          if (hsh === 1) stage.set(x, 1, z, B.FLOWER_RED);
          else if (hsh === 2) stage.set(x, 1, z, B.FLOWER_YELLOW);
          else if (hsh === 3) stage.set(x, 1, z, B.TALL_GRASS);
        }
      }
    }
  }

  // Stone Age (Tier 1) Buildings + Wheat Farm + Cyan Blueprint Construction Site!
  stage.placeBuilding('town_hall', -5, 0, -11, 0, 0, 1);
  stage.placeBuilding('house', -13, 0, -2, 1, 0, 1);
  stage.placeBuilding('farm', -11, 0, 6, 0, 0, 1);
  // Active blueprint under construction with cyan hologram blocks (matching user's screenshot #2!)
  stage.placeBuilding('lumber_camp', 3, 0, 3, 0, 0, 1, true);

  // Wooden Palisade Stakes along back perimeter
  for (let i = -14; i <= 8; i++) {
    stage.set(i, 1, -13, B.PALISADE);
    stage.set(i, 2, -13, B.PALISADE);
    if (i % 3 === 0) stage.set(i, 3, -13, B.LOG);
  }

  // Campfire & Hay Bale in clearing
  stage.set(-1, 1, 2, B.COBBLESTONE);
  stage.set(-1, 2, 2, B.TORCH);
  stage.set(-3, 1, 2, B.LOG);
  stage.set(1, 1, 2, B.LOG);
  stage.set(-2, 1, 0, B.HAY_BALE);
  stage.addLight(-1, 2.5, 2, 255, 180, 75, 9, 0.85);

  // Dense forest around the clearing
  for (const [tx, tz, sp] of [
    [-16, -8, 'oak'], [-17, 3, 'spruce'], [-15, 11, 'oak'], [-4, 13, 'birch'],
    [7, -9, 'spruce'], [9, -2, 'oak'], [8, 10, 'oak'], [19, -5, 'birch'], [19, 6, 'oak'],
  ]) {
    stage.placeTree(tx, 1, tz, sp);
  }

  // Stone Age Villagers with authentic floating job badges (matching user's screenshots!)
  stage.addCharacter({ role: 'farmer', label: 'Фермер', x: -7.5, y: 1, z: 8.5, yaw: 1.1, hat: 'straw', item: 'shovel', pose: 'chop', scale: 1.2 });
  stage.addCharacter({ role: 'woodcutter', label: 'Лесоруб', x: 7.5, y: 1, z: -1.2, yaw: 0.6, item: 'axe_stone', pose: 'chop', scale: 1.2 });
  stage.addCharacter({ role: 'woodcutter', label: 'Лесоруб', x: -13.2, y: 1, z: 3.5, yaw: -1.2, item: 'axe_stone', carryBlock: B.LOG, pose: 'carry', scale: 1.2 });
  stage.addCharacter({ role: 'builder', label: 'Строитель', x: 2.5, y: 1, z: 5.5, yaw: 0.9, item: 'pickaxe_stone', pose: 'chop', scale: 1.2 });
  stage.addCharacter({ role: 'builder', label: 'Строитель', x: 5.2, y: 1, z: 7.2, yaw: -0.8, carryBlock: B.PLANKS, pose: 'carry', scale: 1.2 });
  stage.addCharacter({ role: 'guard', label: 'Стражник', x: -0.5, y: 1, z: 6.5, yaw: 0.2, item: 'sword_wood', scale: 1.2 });

  stage.popups.push({ x: 7.5, y: 3.2, z: -1.2, text: '+2 дерева', color: '#4ade80' });
  stage.popups.push({ x: -7.5, y: 3.2, z: 8.5, text: '+3 еды', color: '#fde047' });

  stage.renderTo(ctx, w, h);

  drawAuthenticGameplayHUD(ctx, w, h, stage, {
    heldWeapon: 'axe_stone',
    selectedSlot: 0,
    selectedLabel: 'Каменный топор',
    hp: [100, 100],
    mp: [100, 100],
    st: [100, 100],
    resources: [['wood', 68], ['stone', 44], ['food', 52], ['coal', 14], ['iron', 0], ['gold', 0], ['crystal', 0]],
    pop: '6/8',
    dayText: 'День 2',
    timeText: '11:10 · Ясно',
    ageText: 'Каменный век',
    researchText: 'Земледелие',
    researchProg: 0.45,
    questText: 'Построить лагерь лесорубов (0/1)',
    hotbar: ['axe_stone', 'pickaxe_stone', 'sword_wood', 'shovel', 'bow', 'bread', 'torch', null, null],
  });
}

// Scene 5: Wave 80 Zombie Siege Top-Down (3D Night Siege Gameplay from Above)
function composeWave80SiegeGameplay(ctx, w, h) {
  const stage = new PerspectiveGameplayStage({
    camPos: [0, 31, 29],
    lookAt: [0, 2, 2],
    fov: 58,
    ambient: [0.46, 0.5, 0.68],
    skyTop: '#060913',
    skyHorizon: '#161224',
    fogColor: [18, 16, 32],
    fogNear: 46,
    fogFar: 110,
    sunDir: [-0.35, 0.82, -0.42],
  });

  // Full-screen battlefield & fortress terrain (-36..36, -30..30)
  for (let z = -30; z <= 30; z++) {
    for (let x = -36; x <= 36; x++) {
      const inside = Math.abs(x) <= 13 && z <= 3 && z >= -18;
      const isRoad = Math.abs(x) <= 2 && z > 3;
      const isCrater = Math.hypot(x + 3, z - 9) < 2.3 || Math.hypot(x - 5, z - 11) < 2.1;
      const id = inside
        ? ((x + z) % 3 === 0 ? B.STONE_BRICKS : B.COBBLESTONE)
        : isCrater
        ? B.MAGMA
        : isRoad
        ? B.PATH
        : ((x * 7 + z * 11) % 9 === 0 ? B.DIRT : B.GRASS);
      stage.set(x, 0, z, id);
    }
  }

  // Citadel Towers & Town Hall defending the fortress
  stage.placeBuilding('town_hall', -5, 0, -14, 0, 0, 6);
  stage.placeBuilding('mage_tower', -13, 0, -5, 0, 0, 6);
  stage.placeBuilding('tesla_tower', 7, 0, -5, 0, 0, 6);
  stage.placeBuilding('cannon_tower', -19, 0, 0, 0, 0, 6);
  stage.placeBuilding('laser_tower', 14, 0, 0, 0, 0, 8);

  // Fortress Wall Line at z = 3..4 with Torches & Neon Beacons
  for (let x = -22; x <= 22; x++) {
    const isGate = Math.abs(x) <= 2;
    for (let y = 1; y <= 3; y++) {
      stage.set(x, y, 3, isGate ? B.IRON_BARS : (y === 3 ? B.STONE_BRICKS : B.REINFORCED_WALL));
    }
    if (!isGate && x % 2 === 0) stage.set(x, 4, 3, B.STONE_BRICKS);
    if (!isGate && x % 4 === 0) {
      stage.set(x, 5, 3, B.TORCH);
      stage.addLight(x, 5.5, 3.5, 255, 180, 70, 10, 0.95);
    }
  }

  // Elite Defenders on the Ramparts & Gate
  const defenders = [
    { role: 'player', label: 'Герой', x: 0, y: 1, z: 1.5, yaw: 0, hat: 'helmet', item: 'sword_crystal', shield: true, pose: 'attack', scale: 1.22 },
    { role: 'mage', label: 'Маг', x: -4.2, y: 4, z: 3, yaw: 0.1, hat: 'wizard', item: 'staff_fire', pose: 'cast', scale: 1.16 },
    { role: 'mage', label: 'Маг', x: 4.2, y: 4, z: 3, yaw: -0.1, hat: 'wizard', item: 'staff_storm', pose: 'cast', scale: 1.16 },
    { role: 'guard', label: 'Стражник', x: -8.2, y: 4, z: 3, yaw: 0.2, hat: 'helmet', item: 'crossbow', pose: 'attack', scale: 1.16 },
    { role: 'guard', label: 'Стражник', x: 8.2, y: 4, z: 3, yaw: -0.2, hat: 'helmet', item: 'crossbow', pose: 'attack', scale: 1.16 },
    { role: 'guard', label: 'Стражник', x: -2.2, y: 1, z: 2.0, yaw: 0, hat: 'helmet', item: 'sword_crystal', shield: true, pose: 'attack', scale: 1.16 },
    { role: 'guard', label: 'Стражник', x: 2.2, y: 1, z: 2.0, yaw: 0, hat: 'helmet', item: 'battle_axe', shield: true, pose: 'attack', scale: 1.16 },
  ];
  for (const d of defenders) stage.addCharacter(d);

  // Massive Wave 80 Undead Horde Swarming from z = 5..21, x = -20..20
  const bosses = [
    { zombie: true, boss: true, role: 'necromancer', label: 'Повелитель Некромантов', x: 0, y: 1, z: 13.5, yaw: 3.14, hat: 'crown', item: 'staff_fire', eyeColor: '#d946ef', hp: 0.84, scale: 1.6 },
    { zombie: true, boss: true, role: 'necromancer', label: 'Архилич 80-й волны', x: -9.5, y: 1, z: 15.0, yaw: 2.9, hat: 'crown', item: 'staff_storm', eyeColor: '#d946ef', hp: 0.72, scale: 1.5 },
    { zombie: true, boss: true, role: 'brute', label: 'Титановый Брут', x: -3.2, y: 1, z: 7.6, yaw: 3.1, eyeColor: '#ff4500', hp: 0.56, scale: 1.52 },
    { zombie: true, boss: true, role: 'brute', label: 'Пепельный Брут', x: 3.6, y: 1, z: 8.0, yaw: -3.0, eyeColor: '#ff4500', hp: 0.64, scale: 1.52 },
    { zombie: true, boss: true, role: 'brute', label: 'Брут-Крушитель', x: 9.8, y: 1, z: 10.5, yaw: -2.7, eyeColor: '#ff4500', hp: 0.88, scale: 1.48 },
  ];
  for (const b of bosses) stage.addCharacter(b);

  const types = ['walker', 'runner', 'spitter', 'exploder', 'walker', 'runner'];
  for (let i = 0; i < 34; i++) {
    const row = Math.floor(i / 7);
    const col = (i % 7) - 3;
    const zx = col * 4.6 + ((i * 5) % 3) - 1;
    const zz = 5.6 + row * 3.1 + ((i * 3) % 2) * 0.8;
    const role = types[i % types.length];
    const eyeColor = role === 'spitter' ? '#84cc16' : role === 'exploder' ? '#fbbf24' : '#ff3b2f';
    stage.addCharacter({
      zombie: true,
      role,
      x: zx,
      y: 1,
      z: zz,
      yaw: Math.PI + ( -zx * 0.04 ),
      eyeColor,
      hp: 0.35 + ((i * 17) % 60) / 100,
      scale: role === 'exploder' ? 1.24 : 1.12,
    });
  }

  // Fiery Meteor Explosions, Tesla Chain Lightning & Laser Beams
  stage.addLight(-3, 2.5, 9, 255, 95, 20, 14, 1.4);
  stage.addLight(5, 3, 11, 56, 189, 248, 14, 1.3);
  stage.addLight(0, 3, 13.5, 192, 132, 252, 12, 1.2);

  stage.explosions.push({ x: -3.0, y: 2.0, z: 8.8, radius: 2.2, color: '#ff5500' });
  stage.explosions.push({ x: 5.2, y: 1.8, z: 11.2, radius: 1.8, color: '#38bdf8' });
  stage.explosions.push({ x: -8.5, y: 2.2, z: 10.5, radius: 1.6, color: '#ff8800' });

  // Tesla chain lightning
  stage.beams.push({ x0: 9.5, y0: 9.5, z0: -2, x1: 3.6, y1: 2.2, z1: 8.0, color: '#38bdf8', width: 6, jagged: true });
  stage.beams.push({ x0: 3.6, y0: 2.2, z0: 8.0, x1: 0, y1: 2.5, z1: 13.5, color: '#7dd3fc', width: 4.5, jagged: true });
  stage.beams.push({ x0: 3.6, y0: 2.2, z0: 8.0, x1: 9.8, y1: 2.2, z1: 10.5, color: '#7dd3fc', width: 4.5, jagged: true });
  // Laser tower & Mage beams
  stage.beams.push({ x0: 16.5, y0: 10, z0: 2, x1: -3.0, y1: 2.0, z1: 8.8, color: '#f97316', width: 7, jagged: false });
  stage.beams.push({ x0: -4.2, y0: 5.5, z0: 3, x1: -8.5, y1: 2.2, z1: 10.5, color: '#c084fc', width: 5, jagged: true });

  // Floating combat damage numbers
  stage.popups.push({ x: -3.0, y: 4.2, z: 8.8, text: '-185 МЕТЕОР!', color: '#fb923c', crit: true });
  stage.popups.push({ x: 3.6, y: 4.0, z: 8.0, text: '-142 ЦЕПЬ МОЛНИЙ', color: '#38bdf8', crit: true });
  stage.popups.push({ x: 0, y: 4.5, z: 13.5, text: '-96', color: '#fde047' });
  stage.popups.push({ x: -8.5, y: 3.8, z: 10.5, text: '-110', color: '#f87171' });

  stage.renderTo(ctx, w, h);

  drawAuthenticGameplayHUD(ctx, w, h, stage, {
    commandMode: true,
    selectedSlot: 3,
    selectedLabel: 'Фолиант метеоров (Звездопад)',
    hp: [112, 150],
    mp: [68, 150],
    st: [88, 100],
    resources: [['wood', 1920], ['stone', 2450], ['food', 1340], ['coal', 610], ['iron', 780], ['gold', 1150], ['crystal', 540]],
    pop: '36/40',
    dayText: 'День 40',
    timeText: '01:15 · Гроза',
    ageText: 'Эпоха Сингулярности',
    night: true,
    researchText: 'Сингулярность',
    researchProg: 0.94,
    waveBanner: ['ВОЛНА 80', 'Нежить наступает · Осталось врагов: 94'],
    hotbar: ['sword_crystal', 'staff_storm', 'staff_fire', 'tome_meteor', 'staff_frost', 'staff_life', 'crossbow', 'potion_heal', 'bread'],
  });
}

const _shotCache = new Map();

export function renderRuStoreShotCanvas(shotId, width = 1280, height = 720) {
  const cacheKey = `${shotId}:${width}x${height}`;
  if (_shotCache.has(cacheKey)) return _shotCache.get(cacheKey);

  const base = document.createElement('canvas');
  base.width = 1920;
  base.height = 1080;
  const bctx = base.getContext('2d');

  if (shotId === 'caves_hell') composeCavesHellGameplay(bctx, 1920, 1080);
  else if (shotId === 'super_village') composeSuperVillageGameplay(bctx, 1920, 1080);
  else if (shotId === 'iron_age') composeIronAgeGameplay(bctx, 1920, 1080);
  else if (shotId === 'stone_age') composeStoneAgeGameplay(bctx, 1920, 1080);
  else composeWave80SiegeGameplay(bctx, 1920, 1080);

  if (width === 1920 && height === 1080) {
    _shotCache.set(cacheKey, base);
    return base;
  }

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  octx.drawImage(base, 0, 0, width, height);
  _shotCache.set(cacheKey, out);
  return out;
}

// ============================================================================
// 5. LIVE PLAYABLE SCENE LAUNCHER & LIVE SCREENSHOT CAPTURE
// ============================================================================
export function launchLiveGameplayScenario(game, shotId) {
  if (!game || !game.world || !game.village) return;
  const ui = game.ui;
  if (!game.running) {
    ui?.menus?.hide?.();
    game.begin();
    ui?._setState?.('play');
  } else {
    game.setPaused(false);
    ui?.menus?.hide?.();
  }

  const w = game.world;
  const v = game.village;
  const th = v.townHall;
  const cx = Math.floor(th?.center?.x ?? w.size / 2);
  const cz = Math.floor(th?.center?.z ?? w.size / 2);
  const gy = th ? th.y : w.surfaceY(cx, cz);

  if (shotId === 'stone_age') {
    game.state.age = 0;
    game.state.day = 2;
    game.state.timeOfDay = 0.42;
    game.state.resources.wood = 68;
    game.state.resources.stone = 44;
    game.state.resources.food = 52;
    game.bus.emit('resources:changed');
    game.setMode('explore');
    if (game.player) {
      game.player.position.set(cx, gy + 1.5, cz + 14);
      game.player.hotbar[0] = 'axe_stone';
      game.player.selectSlot(0);
    }
    ui?.toast?.('Запущена живая сцена: Каменный век!', 'good');
  } else if (shotId === 'iron_age') {
    game.state.age = 2;
    game.state.day = 14;
    game.state.timeOfDay = 0.48;
    for (const r of ['masonry', 'agriculture', 'mining', 'smithing', 'archery', 'fortification']) {
      game.state.researchDone.add(r);
    }
    game.state.addAll({ wood: 350, stone: 480, food: 220, coal: 120, iron: 90, gold: 30 });
    setEraTier(3);
    if (th && th.level < 3) { th.level = 3; v.stampBuilding?.(th); }
    v.placeNear?.('forge', th, 10, 28, 2);
    v.placeNear?.('barracks', th, 10, 28, 2);
    v.placeNear?.('watchtower', th, 12, 32, 2);
    for (const vil of v.villagers) vil.updateTool?.();
    game.setMode('explore');
    if (game.player) {
      game.player.position.set(cx, gy + 1.5, cz + 16);
      game.player.hotbar[0] = 'sword_iron';
      game.player.selectSlot(0);
    }
    ui?.toast?.('Запущена живая сцена: Железный век!', 'good');
  } else if (shotId === 'super_village') {
    game.state.age = 5;
    game.state.day = 45;
    game.state.timeOfDay = 0.5;
    for (const r of ['masonry', 'agriculture', 'mining', 'smithing', 'archery', 'fortification', 'gunpowder', 'ballistics', 'alchemy', 'arcana', 'frost_magic', 'storm_magic', 'crystal_forging', 'meteor']) {
      game.state.researchDone.add(r);
    }
    game.state.addAll({ wood: 2400, stone: 3100, food: 1800, coal: 800, iron: 950, gold: 700, crystal: 400 });
    setEraTier(6);
    if (th) { th.level = 6; v.stampBuilding?.(th); }
    for (const bType of ['mage_tower', 'forge', 'barracks', 'storehouse', 'laboratory', 'watchtower']) {
      v.placeNear?.(bType, th, 12, 34, 2);
    }
    while (v.villagers.length < 18) {
      const jobs = ['guard', 'mage', 'blacksmith', 'researcher', 'farmer', 'builder', 'woodcutter'];
      const j = jobs[v.villagers.length % jobs.length];
      const nv = v.spawnVillager?.({ job: j, silent: true });
      if (!nv) break;
    }
    game.setMode('command');
    if (game.cameraRig) {
      game.cameraRig.cmdTarget?.set(cx, gy, cz);
      game.cameraRig.cmdDist = 42;
      game.cameraRig.cmdPitch = 1.05;
    }
    ui?.toast?.('Запущена живая сцена: Суперпрокачанная деревня (вид сверху)!', 'good');
  } else if (shotId === 'wave80_siege') {
    game.state.age = 5;
    game.state.day = 40;
    game.state.wave = 80;
    game.state.timeOfDay = 0.02;
    for (const r of ['masonry', 'smithing', 'fortification', 'arcana', 'storm_magic', 'crystal_forging', 'meteor']) {
      game.state.researchDone.add(r);
    }
    game.state.addAll({ wood: 1900, stone: 2400, food: 1300, iron: 750, gold: 1100, crystal: 520 });
    setEraTier(6);
    if (th) { th.level = 6; v.stampBuilding?.(th); }
    const zTypes = ['walker', 'runner', 'spitter', 'exploder', 'brute', 'necromancer'];
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const dist = 18 + (i % 4) * 3;
      const zx = cx + Math.cos(ang) * dist;
      const zz = cz + Math.sin(ang) * dist;
      const zy = w.surfaceY(zx, zz) + 1;
      const zt = i === 0 ? 'necromancer' : i % 6 === 0 ? 'brute' : zTypes[i % 4];
      try {
        const z = new Zombie(game, zt, { wave: 80, hpMul: 2.5, sunproof: true });
        z.position.set(zx, zy, zz);
        game.entities.add(z);
        v.zombies.push(z);
      } catch (e) { /* ignore */ }
    }
    game.setMode('command');
    if (game.cameraRig) {
      game.cameraRig.cmdTarget?.set(cx, gy, cz + 6);
      game.cameraRig.cmdDist = 38;
      game.cameraRig.cmdPitch = 1.02;
    }
    game.bus.emit('wave:start', { wave: 80, count: 94 });
  } else if (shotId === 'caves_hell') {
    game.state.age = 4;
    game.state.day = 19;
    game.state.timeOfDay = 0.88;
    const caveY = Math.max(8, gy - 18);
    // Carve an illuminated cavern & lava pool right around (cx, caveY, cz)
    for (let dz = -10; dz <= 10; dz++) {
      for (let dx = -10; dx <= 10; dx++) {
        if (dx * dx + dz * dz > 110) continue;
        for (let dy = 0; dy <= 7; dy++) {
          w.setBlock(cx + dx, caveY + dy, cz + dz, B.AIR, { silent: true });
        }
        const isBridge = Math.abs(dx) <= 2 || Math.abs(dz) <= 2;
        w.setBlock(cx + dx, caveY - 1, cz + dz, isBridge ? B.OBSIDIAN : B.LAVA, { silent: true });
        if ((Math.abs(dx) + Math.abs(dz)) % 5 === 0) {
          w.setBlock(cx + dx, caveY + 6, cz + dz, B.CRYSTAL_ORE, { silent: true });
        }
      }
    }
    w.setBlock(cx - 2, caveY, cz - 2, B.TORCH, { silent: true });
    w.setBlock(cx + 2, caveY, cz + 2, B.TORCH, { silent: true });
    w.setBlock(cx, caveY, cz - 6, B.SPAWNER, { silent: true });
    w.setBlock(cx + 2, caveY, cz - 6, B.CHEST, { silent: true });
    game.setMode('explore');
    if (game.player) {
      game.player.position.set(cx, caveY + 0.5, cz + 5);
      game.player.hotbar[0] = 'sword_crystal';
      game.player.selectSlot(0);
    }
    ui?.toast?.('Запущена живая сцена: Пещеры и Преисподняя!', 'good');
  }
}

export function captureLiveGameCanvas(game, shotId) {
  if (!game?.renderer?.domElement) return null;
  game.renderer.render(0.016);
  const c = document.createElement('canvas');
  c.width = 1920;
  c.height = 1080;
  const ctx = c.getContext('2d');
  ctx.drawImage(game.renderer.domElement, 0, 0, 1920, 1080);

  // Overlay the authentic gameplay HUD so the downloaded PNG has both the live WebGL 3D world and crisp HUD
  const dummyStage = new PerspectiveGameplayStage();
  for (const v of game.village?.villagers || []) {
    dummyStage.entities.push({ x: v.position.x - (game.world?.homeX || 0), z: v.position.z - (game.world?.homeZ || 0), zombie: false });
  }
  for (const z of game.village?.zombies || []) {
    dummyStage.entities.push({ x: z.position.x - (game.world?.homeX || 0), z: z.position.z - (game.world?.homeZ || 0), zombie: true, boss: z.boss });
  }
  const st = game.state;
  const res = st?.resources || {};
  drawAuthenticGameplayHUD(ctx, 1920, 1080, dummyStage, {
    commandMode: game.mode === 'command',
    heldWeapon: game.mode === 'explore' ? (game.player?.itemId || 'sword_crystal') : null,
    selectedSlot: game.player?.selected || 0,
    hp: [Math.round(game.player?.hp || 100), Math.round(game.player?.maxHp || 100)],
    mp: [Math.round(game.player?.mana || 100), Math.round(game.player?.maxMana || 100)],
    st: [Math.round(game.player?.stamina || 100), Math.round(game.player?.maxStamina || 100)],
    resources: [
      ['wood', Math.round(res.wood || 0)],
      ['stone', Math.round(res.stone || 0)],
      ['food', Math.round(res.food || 0)],
      ['coal', Math.round(res.coal || 0)],
      ['iron', Math.round(res.iron || 0)],
      ['gold', Math.round(res.gold || 0)],
      ['crystal', Math.round(res.crystal || 0)],
    ],
    pop: `${game.village?.villagers?.length || 0}/${game.village?.popCap || 10}`,
    dayText: `День ${st?.day || 1}`,
    timeText: 'Живой кадр 3D-движка',
    ageText: shotId === 'stone_age' ? 'Каменный век' : shotId === 'iron_age' ? 'Железный век' : 'Эпоха Сингулярности',
    hotbar: game.player?.hotbar || ['sword_crystal', 'pickaxe_iron', 'axe_iron', 'bow', 'staff_fire', 'shovel', 'bread', 'potion_heal', 'tome_meteor'],
  });

  _shotCache.set(`${shotId}:1920x1080`, c);
  _shotCache.delete(`${shotId}:1280x720`);
  _shotCache.delete(`${shotId}:640x360`);
  return c;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============================================================================
// 6. ORNATE IN-GAME RUSTORE SHOWCASE & ICON WINDOW
// ============================================================================
export class RuStorePanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.open = false;
    this.activeShot = RUSTORE_SHOTS[0];
    this.root = h('div.zc-modal.zc-rustore-modal.ui-i');
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.root.classList.toggle('open', this.open);
    if (this.open) {
      this.game.audio?.play?.('ui_open');
      this.render();
    } else {
      this.game.audio?.play?.('ui_close');
    }
  }

  downloadIcon(size = 512) {
    const c = renderGameIconCanvas(size);
    downloadDataUrl(c.toDataURL('image/png'), `zombicraft-icon-${size}x${size}.png`);
    this.ui.toast(`Иконка ${size}×${size} PNG сохранена!`, 'good');
  }

  downloadShot(shot) {
    const c = renderRuStoreShotCanvas(shot.id, 1920, 1080);
    downloadDataUrl(c.toDataURL('image/png'), shot.file);
    this.ui.toast(`Геймплейный скриншот «${shot.title}» (1920×1080) сохранён!`, 'good');
  }

  downloadAll() {
    this.downloadIcon(512);
    RUSTORE_SHOTS.forEach((s, idx) => {
      setTimeout(() => this.downloadShot(s), (idx + 1) * 280);
    });
  }

  render() {
    clear(this.root);
    const iconUrl = getGameIconDataUrl();

    const heroImgWrap = h('div.zc-rs-hero-view');
    const heroTitle = h('h3.zc-rs-hero-title');
    const heroDesc = h('p.zc-rs-hero-desc');
    const heroTag = h('span.zc-rs-meta');

    const playSceneBtn = h('button.zc-btn.secondary.small.ui-i', {
      onclick: () => {
        this.game.audio?.play?.('ui_click');
        this.toggle(false);
        launchLiveGameplayScenario(this.game, this.activeShot.id);
      },
    }, h('span.zc-btn-lbl', '🎮 Играть в этой сцене'));

    const snapLiveBtn = h('button.zc-btn.ghost.small.ui-i', {
      title: 'Снять текущий 3D-экран игры в этот слот',
      onclick: () => {
        this.game.audio?.play?.('ui_click');
        captureLiveGameCanvas(this.game, this.activeShot.id);
        this.render();
        this.ui.toast(`Живой 3D-кадр сохранён в слот «${this.activeShot.title}»!`, 'good');
      },
    }, h('span.zc-btn-lbl', '📸 Снять текущий кадр игры'));

    const dlHeroBtn = h('button.zc-btn.primary.small.ui-i', {
      onclick: () => {
        this.game.audio?.play?.('ui_click');
        this.downloadShot(this.activeShot);
      },
    }, h('span.zc-btn-lbl', 'Скачать Full HD (1920×1080 PNG)'));

    const selectShot = (shot, cardElements) => {
      this.activeShot = shot;
      clear(heroImgWrap);
      const dataUrl = renderRuStoreShotCanvas(shot.id, 1280, 720).toDataURL('image/png');
      const imgEl = h('img.zc-rs-hero-img', {
        src: dataUrl,
        alt: shot.title,
      });
      heroImgWrap.append(imgEl);
      heroTag.textContent = `${shot.tag} · 1920×1080 (Реальный игровой интерфейс + 3D перспектива)`;
      heroTitle.textContent = shot.title;
      heroDesc.textContent = shot.desc;
      if (cardElements) {
        for (const el of cardElements) {
          el.classList.toggle('sel', el.dataset.id === shot.id);
        }
      }
    };

    const cards = [];
    const grid = h('div.zc-rs-grid');
    for (const shot of RUSTORE_SHOTS) {
      const thumbUrl = renderRuStoreShotCanvas(shot.id, 640, 360).toDataURL('image/png');
      const thumbImg = h('img.zc-rs-thumb', {
        src: thumbUrl,
        alt: shot.title,
      });
      const card = h(
        'div.zc-rs-card.ui-i' + (shot.id === this.activeShot.id ? '.sel' : ''),
        {
          'data-id': shot.id,
          onclick: () => {
            this.game.audio?.play?.('ui_click');
            selectShot(shot, cards);
          },
        },
        h('div.zc-rs-thumb-wrap', thumbImg),
        h(
          'div.zc-rs-card-body',
          h('div.zc-rs-card-kicker', shot.tag),
          h('b.zc-rs-card-title', shot.title),
          h('span.zc-rs-card-sub', shot.subtitle),
          h(
            'div.zc-rs-card-actions',
            h(
              'button.zc-btn.secondary.small.ui-i',
              {
                onclick: (e) => {
                  e.stopPropagation();
                  this.game.audio?.play?.('ui_click');
                  this.toggle(false);
                  launchLiveGameplayScenario(this.game, shot.id);
                },
              },
              h('span.zc-btn-lbl', '🎮 В игру')
            ),
            h(
              'button.zc-btn.ghost.small.ui-i',
              {
                onclick: (e) => {
                  e.stopPropagation();
                  this.game.audio?.play?.('ui_click');
                  this.downloadShot(shot);
                },
              },
              h('span.zc-btn-lbl', 'Скачать PNG')
            )
          )
        )
      );
      cards.push(card);
      grid.append(card);
    }

    selectShot(this.activeShot, cards);

    const iconBox = h(
      'div.zc-rs-icon-showcase',
      h(
        'div.zc-rs-icon-previews',
        h(
          'div.zc-rs-device-preview',
          h('img.zc-rs-icon-phone', { src: iconUrl, alt: 'Иконка на телефоне' }),
          h('span', 'Телефон (Android / RuStore)')
        ),
        h(
          'div.zc-rs-device-preview',
          h('img.zc-rs-icon-pc', { src: iconUrl, alt: 'Иконка на ПК' }),
          h('span', 'Компьютер (Windows .exe)')
        )
      ),
      h(
        'div.zc-rs-icon-info',
        h('div.zc-rs-meta', 'Официальная иконка приложения · 512×512 PNG · Готова для RuStore'),
        h('h3.zc-rs-hero-title', 'Иконка Zombi Craft для Телефона и ПК'),
        h(
          'p.zc-rs-hero-desc',
          'Новая иконка установлена для Android APK, ярлыка Windows (.exe) и RuStore. Все 5 скриншотов ниже выполнены как реальные геймплейные кадры с 3D-перспективой и настоящим внутриигровым HUD.'
        ),
        h(
          'div.zc-row',
          h(
            'button.zc-btn.primary.small.ui-i',
            {
              onclick: () => {
                this.game.audio?.play?.('ui_click');
                this.downloadIcon(512);
              },
            },
            h('span.zc-btn-lbl', 'Скачать иконку 512×512 (RuStore)')
          ),
          h(
            'button.zc-btn.ghost.small.ui-i',
            {
              onclick: () => {
                this.game.audio?.play?.('ui_click');
                this.downloadAll();
              },
            },
            h('span.zc-btn-lbl', 'Скачать весь набор (иконка + 5 скриншотов)')
          )
        )
      )
    );

    const dialog = h(
      'div.zc-panel.ornate.zc-rs-dialog',
      h(
        'div.zc-rs-head',
        h(
          'div',
          h('h2.zc-h', 'Витрина RuStore · Иконка и Геймплейные Скриншоты'),
          h('div.zc-note', 'Настоящие геймплейные кадры 1920×1080 с игровым HUD, 3D-жителями, чертежами стройки и возможностью запустить любую сцену вживую')
        ),
        h(
          'button.zc-iconbtn.zc-close.ui-i',
          { onclick: () => this.toggle(false), title: 'Закрыть' },
          h('img', { src: glyph('close'), alt: 'Закрыть' })
        )
      ),
      h(
        'div.zc-rs-scroll',
        iconBox,
        h(
          'div.zc-rs-hero',
          heroImgWrap,
          h('div.zc-rs-hero-bar', h('div.zc-rs-hero-text', heroTag, heroTitle, heroDesc), h('div.zc-row', playSceneBtn, snapLiveBtn, dlHeroBtn))
        ),
        h('div.zc-field-lbl', 'Все 5 геймплейных сцен (нажмите для просмотра, запуска в игре или скачивания PNG)'),
        grid
      )
    );

    dialog.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.root.append(dialog);
  }
}
