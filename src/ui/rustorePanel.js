// RuStore Media Kit & Game Icon Studio:
// 1. Generates the official 512x512 HD icon for Android (RuStore / APK) and Windows PC (Electron EXE).
// 2. Renders 5 authentic 3D Voxel screenshots (1920x1080 16:9 Full HD) using the game's real block textures,
//    BUILDING_TYPES era blueprints, villager/guard/zombie skins, weapons, lighting, and spell effects.
// 3. Displays everything in an ornate in-game showcase window with full-screen preview & 1-click PNG download.

import { h, clear, glyph } from './dom.js';
import { B, BLOCKS } from '../core/blocks.js';
import { getTileCanvas } from '../art/textures.js';
import { getItemSprite } from '../art/icons.js';
import { villagerSkin, zombieSkin, playerSkin, SKIN_LAYOUT } from '../art/skins.js';
import { BUILDING_TYPES } from '../village/buildings.js';

export const RUSTORE_SHOTS = [
  {
    id: 'caves_hell',
    title: 'Шахты: Большие пещеры и Преисподняя',
    subtitle: 'Глубокие гроты с рудами, аметистовыми жеодами и лавовым морем Ада',
    tag: 'Подземелья и Ад',
    file: 'zombicraft-01-caves-hell.png',
    staticUrl: './rustore/zombicraft-01-caves-hell.png',
    desc: 'Многоярусное подземелье: верхний шахтный горизонт с крепями, золотой и кристальной рудой переходит в раскалённую Преисподнюю с реками лавы, обсидиановыми мостами и боссами глубин.',
  },
  {
    id: 'super_village',
    title: 'Суперпрокачанная деревня сверху',
    subtitle: 'Имперская цитадель, башни магов, тесла-вышки и укреплённый периметр',
    tag: 'Вид сверху · Высшая эпоха',
    file: 'zombicraft-02-super-village-top.png',
    staticUrl: './rustore/zombicraft-02-super-village-top.png',
    desc: 'Стратегический вид сверху на максимально развитый город: величественная ратуша, собор, башни магов, пушечные и лазерные башни, плавильни, мельницы, фонари и десятки жителей за работой.',
  },
  {
    id: 'iron_age',
    title: 'Железный век: Крепость и Кузница',
    subtitle: 'Каменные стены, пылающий горн кузницы, казармы и стража в латах',
    tag: 'Железный век · Эпоха III',
    file: 'zombicraft-03-iron-age.png',
    staticUrl: './rustore/zombicraft-03-iron-age.png',
    desc: 'Переход к тяжёлой индустрии и обороне: глубокий ступенчатый карьер шахты, кузница и плавильня, каменные зубчатые стены и отряд стражников в кованых железных доспехах со щитами.',
  },
  {
    id: 'stone_age',
    title: 'Каменный век: Первое поселение',
    subtitle: 'Плетёные хижины под соломой, частокол, костры и рубка векового леса',
    tag: 'Каменный век · Эпоха I',
    file: 'zombicraft-04-stone-age.png',
    staticUrl: './rustore/zombicraft-04-stone-age.png',
    desc: 'Начало выживания на лесной поляне у реки: первые хижины из плетня и брёвен, деревянный частокол, древний кромлех, лесорубы с каменными топорами и первые пшеничные грядки.',
  },
  {
    id: 'wave80_siege',
    title: 'Атака 80-й волны зомби сверху',
    subtitle: 'Ночной штурм ордой нежити, громилами и Некромантом под огнём башен и магии',
    tag: 'Волна 80 · Ночная осада',
    file: 'zombicraft-05-wave80-siege-top.png',
    staticUrl: './rustore/zombicraft-05-wave80-siege-top.png',
    desc: 'Масштабная ночная битва: десятки зомби, бронированных громил, кислотных плевальщиков и Босс-Некромант штурмуют бастионы под залпами пушек, цепных молний и огненных метеоров.',
  },
];

// ============================================================================
// 1. GAME ICON GENERATOR (512x512 HD for Android APK / RuStore & Windows EXE)
// ============================================================================

let _cachedIconDataUrl = null;

export function renderGameIconCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 512;
  ctx.save();
  ctx.scale(s, s);

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  rr(0, 0, 512, 512, 96);
  ctx.clip();

  // Deep dramatic night sky gradient
  const bg = ctx.createRadialGradient(256, 170, 20, 256, 260, 360);
  bg.addColorStop(0, '#3a1828');
  bg.addColorStop(0.38, '#171024');
  bg.addColorStop(0.75, '#0b0e18');
  bg.addColorStop(1, '#04060b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  // Blood Moon in upper background
  const moonGlow = ctx.createRadialGradient(256, 142, 10, 256, 142, 155);
  moonGlow.addColorStop(0, 'rgba(255, 92, 64, 0.95)');
  moonGlow.addColorStop(0.45, 'rgba(220, 45, 38, 0.42)');
  moonGlow.addColorStop(1, 'rgba(220, 45, 38, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(256, 142, 155, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff6b4a';
  ctx.beginPath();
  ctx.arc(256, 142, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 28, 22, 0.35)';
  ctx.fillRect(212, 114, 22, 18);
  ctx.fillRect(262, 148, 28, 22);
  ctx.fillRect(230, 164, 18, 14);

  const drawIsoBlock = (cx, cy, sz, topTile, leftTile, rightTile) => {
    const tTop = getTileCanvas(topTile);
    const tLeft = getTileCanvas(leftTile || topTile);
    const tRight = getTileCanvas(rightTile || leftTile || topTile);
    const hw = sz * 0.866;
    const hh = sz * 0.5;

    ctx.save();
    ctx.translate(cx, cy - sz);
    ctx.transform(0.866, 0.5, -0.866, 0.5, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tTop, 0, 0, sz, sz);
    ctx.restore();

    ctx.save();
    ctx.translate(cx - hw, cy - hh);
    ctx.transform(0.866, 0.5, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tLeft, 0, 0, sz, sz);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, sz, sz);
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(0.866, -0.5, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tRight, 0, 0, sz, sz);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, sz, sz);
    ctx.restore();
  };

  // Isometric Voxel Citadel Fortress platform
  const bsz = 34;
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      const ix = 256 + (gx - gz) * bsz * 0.866;
      const iy = 340 + (gx + gz) * bsz * 0.5;
      const isEdge = Math.abs(gx) === 2 || Math.abs(gz) === 2;
      drawIsoBlock(
        ix,
        iy,
        bsz,
        isEdge ? 'stone_bricks' : 'grass_top',
        isEdge ? 'stone_bricks' : 'grass_side',
        isEdge ? 'cracked_bricks' : 'obsidian'
      );
      if (isEdge && (Math.abs(gx) + Math.abs(gz)) % 2 === 0) {
        drawIsoBlock(ix, iy - bsz, bsz, 'stone_bricks', 'stone_bricks', 'stone_bricks');
      }
    }
  }
  drawIsoBlock(134, 370, 36, 'crystal_ore', 'crystal_ore', 'crystal_ore');
  drawIsoBlock(378, 370, 36, 'lava', 'magma', 'obsidian');

  const drawSpriteRotated = (sprite, x, y, scale, angleRad, flipX = false) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    if (flipX) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 14;
    ctx.drawImage(sprite, -16 * scale, -16 * scale, 32 * scale, 32 * scale);
    ctx.restore();
  };

  drawSpriteRotated(getItemSprite('sword_crystal'), 142, 216, 6.2, -0.35);
  drawSpriteRotated(getItemSprite('battle_axe'), 370, 216, 6.2, 0.35, true);

  // Central Split Voxel Head Emblem: Left = Armored Hero Guard, Right = Glowing Zombie Boss
  const guardSk = villagerSkin('guard', 1);
  const zombieSk = zombieSkin('walker', 3);
  const headX = 144;
  const headY = 98;
  const headSize = 224;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#120d08';
  ctx.fillRect(headX - 10, headY - 10, headSize + 20, headSize + 20);
  ctx.restore();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(guardSk, 8, 8, 4, 8, headX, headY, headSize / 2, headSize);
  ctx.drawImage(zombieSk, 12, 8, 4, 8, headX + headSize / 2, headY, headSize / 2, headSize);

  const px = headSize / 8;
  ctx.fillStyle = '#d4dce6';
  ctx.fillRect(headX, headY, px * 4, px * 2);
  ctx.fillStyle = '#9aa4b2';
  ctx.fillRect(headX, headY + px * 2, px * 1, px * 3);
  ctx.fillStyle = '#f5cb5c';
  ctx.fillRect(headX + px * 3, headY, px * 1, px * 2.4);

  ctx.fillStyle = '#5eead4';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 16;
  ctx.fillRect(headX + px * 1, headY + px * 4, px * 2, px * 1);

  ctx.fillStyle = '#b8ff3c';
  ctx.shadowColor = '#84cc16';
  ctx.shadowBlur = 20;
  ctx.fillRect(headX + px * 5, headY + px * 4, px * 2, px * 1);
  ctx.fillStyle = '#ff3b2f';
  ctx.fillRect(headX + px * 5.6, headY + px * 4.2, px * 0.8, px * 0.6);
  ctx.shadowBlur = 0;

  // Lightning crack down the center
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(256, headY - 8);
  ctx.lineTo(249, headY + 56);
  ctx.lineTo(263, headY + 112);
  ctx.lineTo(251, headY + 170);
  ctx.lineTo(256, headY + headSize + 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 6;
  ctx.strokeRect(headX - 4, headY - 4, headSize + 8, headSize + 8);

  // Ornate Golden-Iron Knight Heater Shield + Mana Gem emblem at bottom-center of the head
  ctx.save();
  ctx.translate(256, 330);
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(34, -26);
  ctx.lineTo(30, 10);
  ctx.quadraticCurveTo(22, 34, 0, 46);
  ctx.quadraticCurveTo(-22, 34, -30, 10);
  ctx.lineTo(-34, -26);
  ctx.closePath();
  const shGrad = ctx.createLinearGradient(-30, -34, 30, 42);
  shGrad.addColorStop(0, '#64748b');
  shGrad.addColorStop(0.5, '#334155');
  shGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = shGrad;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#facc15';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(14, 2);
  ctx.lineTo(0, 22);
  ctx.lineTo(-14, 2);
  ctx.closePath();
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#e0f2fe';
  ctx.stroke();
  ctx.restore();

  // Bottom title banner: "ZOMBI CRAFT"
  const banGrad = ctx.createLinearGradient(0, 392, 0, 488);
  banGrad.addColorStop(0, 'rgba(20, 14, 10, 0.92)');
  banGrad.addColorStop(0.5, 'rgba(38, 25, 14, 0.98)');
  banGrad.addColorStop(1, 'rgba(12, 8, 5, 0.98)');
  ctx.fillStyle = banGrad;
  rr(28, 394, 456, 86, 22);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#d9a441';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 50px "Cinzel Decorative", "Ruslan Display", "Trebuchet MS", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#140c04';
  ctx.strokeText('ZOMBI CRAFT', 256, 439);

  const txtGrad = ctx.createLinearGradient(0, 412, 0, 465);
  txtGrad.addColorStop(0, '#fff7cc');
  txtGrad.addColorStop(0.45, '#f4c85a');
  txtGrad.addColorStop(0.85, '#b8e04a');
  txtGrad.addColorStop(1, '#68a828');
  ctx.fillStyle = txtGrad;
  ctx.fillText('ZOMBI CRAFT', 256, 439);

  const borderGrad = ctx.createLinearGradient(0, 0, 512, 512);
  borderGrad.addColorStop(0, '#fde68a');
  borderGrad.addColorStop(0.3, '#ca8a04');
  borderGrad.addColorStop(0.7, '#713f12');
  borderGrad.addColorStop(1, '#facc15');
  rr(6, 6, 500, 500, 90);
  ctx.lineWidth = 12;
  ctx.strokeStyle = borderGrad;
  ctx.stroke();

  ctx.restore();
  return c;
}

export function getGameIconDataUrl() {
  if (!_cachedIconDataUrl) {
    _cachedIconDataUrl = renderGameIconCanvas(512).toDataURL('image/png');
  }
  return _cachedIconDataUrl;
}

// ============================================================================
// 2. TRUE 3D ISOMETRIC VOXEL & ENTITY PAINTER ENGINE (100% GPU-INDEPENDENT)
// ============================================================================

class IsoVoxelStage {
  constructor(opts = {}) {
    this.voxels = new Map(); // "x,y,z" -> id
    this.entities = [];
    this.lights = [];        // { x, y, z, r, g, b, rad, intensity }
    this.beams = [];         // { x0, y0, z0, x1, y1, z1, color, width }
    this.meteors = [];       // { x, y, z, radius, color }
    this.scale = opts.scale || 30;
    this.pitch = opts.pitch || 0.55; // 0.5 = classic iso, 0.72 = high top-down
    this.originX = opts.originX || 960;
    this.originY = opts.originY || 560;
    this.ambient = opts.ambient || [0.85, 0.85, 0.88];
  }

  key(x, y, z) { return `${x | 0},${y | 0},${z | 0}`; }
  set(x, y, z, id) {
    const k = this.key(x, y, z);
    if (!id || id === B.AIR) this.voxels.delete(k);
    else this.voxels.set(k, id);
  }
  get(x, y, z) { return this.voxels.get(this.key(x, y, z)) || B.AIR; }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          this.set(x, y, z, id);
  }

  placeBuilding(type, ox, oy, oz, rot = 0, variant = 0, tier = 4) {
    const def = BUILDING_TYPES[type];
    if (!def) return;
    const blocks = def.blueprint(rot, variant, tier);
    for (const b of blocks) {
      if (b.id && b.id !== B.AIR) {
        this.set(ox + b.dx, oy + b.dy, oz + b.dz, b.id);
        const bl = BLOCKS[b.id];
        if (bl && bl.light >= 10) {
          const col = b.id === B.NEON ? [168, 85, 247] : b.id === B.LED || b.id === B.ENERGY_GLASS ? [56, 189, 248] : [255, 190, 95];
          this.addLight(ox + b.dx, oy + b.dy, oz + b.dz, col[0], col[1], col[2], 7, 0.55);
        }
      }
    }
  }

  placeTree(ox, oy, oz, spruce = false) {
    const log = spruce ? B.SPRUCE_LOG : B.LOG;
    const leaf = spruce ? B.SPRUCE_LEAVES : B.LEAVES;
    const h = spruce ? 6 : 5;
    for (let y = 0; y < h; y++) this.set(ox, oy + y, oz, log);
    for (let dy = h - 3; dy <= h + 1; dy++) {
      const r = dy >= h ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && dy > h - 2) continue;
          if (dx === 0 && dz === 0 && dy < h) continue;
          this.set(ox + dx, oy + dy, oz + dz, leaf);
        }
      }
    }
  }

  addLight(x, y, z, r, g, b, rad = 9, intensity = 0.75) {
    this.lights.push({ x, y, z, r, g, b, rad, intensity });
  }

  addCharacter(opts) {
    this.entities.push(opts);
  }

  project(x, y, z) {
    const S = this.scale;
    const hw = S * 0.8660254;
    const hh = S * this.pitch;
    const vh = S * (1 - this.pitch * 0.32);
    return {
      sx: this.originX + (x - z) * hw,
      sy: this.originY + (x + z) * hh - y * vh,
      hw,
      hh,
      vh,
    };
  }

  lightAt(x, y, z) {
    let lr = this.ambient[0], lg = this.ambient[1], lb = this.ambient[2];
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      const d = Math.hypot(x - L.x, y - L.y, z - L.z);
      if (d < L.rad) {
        const k = (1 - d / L.rad) ** 1.6 * L.intensity;
        lr += (L.r / 255) * k;
        lg += (L.g / 255) * k;
        lb += (L.b / 255) * k;
      }
    }
    return [Math.min(1.5, lr), Math.min(1.5, lg), Math.min(1.5, lb)];
  }

  renderTo(ctx, width, height) {
    // Collect visible blocks and entities, then sort back-to-front by (x + z) and y
    const drawList = [];

    for (const [k, id] of this.voxels.entries()) {
      const [x, y, z] = k.split(',').map(Number);
      const b = BLOCKS[id];
      if (!b) continue;
      // Visible if any of top (+y), front-left (+z), or front-right (+x) is non-opaque
      const occTop = isOpaque(this.get(x, y + 1, z));
      const occZ = isOpaque(this.get(x, y, z + 1));
      const occX = isOpaque(this.get(x + 1, y, z));
      if (occTop && occZ && occX) continue;
      drawList.push({
        kind: 'block',
        x, y, z, id, b,
        occTop, occZ, occX,
        depth: (x + z) * 1000 + y * 10,
      });
    }

    for (const ent of this.entities) {
      drawList.push({
        kind: 'entity',
        ...ent,
        depth: (ent.x + ent.z) * 1000 + ent.y * 10 + 6,
      });
    }

    for (const m of this.meteors) {
      drawList.push({
        kind: 'meteor',
        ...m,
        depth: (m.x + m.z) * 1000 + m.y * 10 + 8,
      });
    }

    drawList.sort((a, b) => a.depth - b.depth);

    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      if (item.kind === 'block') {
        this._drawBlock(ctx, item);
      } else if (item.kind === 'entity') {
        this._drawEntity(ctx, item);
      } else if (item.kind === 'meteor') {
        this._drawMeteor(ctx, item);
      }
    }

    // Draw 3D beams / chain lightning / cannon fire on top
    for (const bm of this.beams) {
      const p0 = this.project(bm.x0, bm.y0, bm.z0);
      const p1 = this.project(bm.x1, bm.y1, bm.z1);
      ctx.save();
      ctx.strokeStyle = bm.color;
      ctx.lineWidth = bm.width || 5;
      ctx.shadowColor = bm.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      const steps = bm.jagged ? 7 : 1;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const jx = Math.sin(s * 5.1 + p0.sx) * 16;
        const jy = Math.cos(s * 3.7 + p0.sy) * 12;
        ctx.lineTo(p0.sx + (p1.sx - p0.sx) * t + jx, p0.sy + (p1.sy - p0.sy) * t + jy);
      }
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawBlock(ctx, { x, y, z, id, b, occTop, occZ, occX }) {
    const { sx, sy, hw, hh, vh } = this.project(x, y, z);
    if (sx < -120 || sx > 2040 || sy < -120 || sy > 1200) return;

    const S = this.scale;
    const [lr, lg, lb] = this.lightAt(x, y, z);
    const bright = (lr + lg + lb) / 3;

    if (b.shape === 'cross') {
      const tc = getTileCanvas(b.tiles.side);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tc, sx - S * 0.55, sy - vh * 1.15, S * 1.1, vh * 1.2);
      if (id === B.TORCH || id === B.GLOW_MUSHROOM) {
        const g = ctx.createRadialGradient(sx, sy - vh * 0.7, 2, sx, sy - vh * 0.7, S * 1.4);
        g.addColorStop(0, id === B.TORCH ? 'rgba(255,200,90,0.65)' : 'rgba(90,235,255,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy - vh * 0.7, S * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const hMul = b.shape === 'liquid' ? 0.82 : 1.0;
    const bvh = vh * hMul;

    // Top face (diamond at y + hMul)
    if (!occTop) {
      const tTop = getTileCanvas(b.tiles.top);
      ctx.save();
      ctx.translate(sx, sy - bvh - hh * 2);
      ctx.transform(hw / S, hh / S, -hw / S, hh / S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tTop, 0, 0, S + 0.65, S + 0.65);
      if (bright < 0.92) {
        ctx.fillStyle = `rgba(0,0,12,${Math.min(0.75, 1 - bright)})`;
        ctx.fillRect(0, 0, S + 0.65, S + 0.65);
      } else if (bright > 1.08) {
        ctx.fillStyle = `rgba(255,220,160,${Math.min(0.32, (bright - 1) * 0.45)})`;
        ctx.fillRect(0, 0, S + 0.65, S + 0.65);
      }
      ctx.restore();
    }

    // Left face (+Z side)
    if (!occZ) {
      const tSide = getTileCanvas(b.tiles.side);
      ctx.save();
      ctx.translate(sx - hw, sy - hh - bvh);
      ctx.transform(hw / S, hh / S, 0, bvh / S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tSide, 0, 0, S + 0.65, S + 0.65);
      const shade = Math.min(0.82, Math.max(0.12, 1 - bright * 0.82));
      ctx.fillStyle = `rgba(0,0,10,${shade})`;
      ctx.fillRect(0, 0, S + 0.65, S + 0.65);
      ctx.restore();
    }

    // Right face (+X side)
    if (!occX) {
      const tSide = getTileCanvas(b.tiles.side);
      ctx.save();
      ctx.translate(sx, sy - bvh);
      ctx.transform(hw / S, -hh / S, 0, bvh / S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tSide, 0, 0, S + 0.65, S + 0.65);
      const shade = Math.min(0.88, Math.max(0.26, 1 - bright * 0.66));
      ctx.fillStyle = `rgba(0,0,14,${shade})`;
      ctx.fillRect(0, 0, S + 0.65, S + 0.65);
      ctx.restore();
    }
  }

  _drawEntity(ctx, ent) {
    const { sx, sy, vh } = this.project(ent.x, ent.y, ent.z);
    if (sx < -100 || sx > 2020 || sy < -100 || sy > 1180) return;

    const sc = (this.scale / 22) * (ent.scale || 1);
    const sk = ent.zombie
      ? zombieSkin(ent.role || 'walker', 3)
      : ent.role === 'player'
      ? playerSkin()
      : villagerSkin(ent.role || 'guard', ((Math.abs((ent.x * 7 + ent.z * 13) | 0)) % 2) + 1);

    ctx.save();
    ctx.translate(sx, sy - vh * 0.4);
    ctx.imageSmoothingEnabled = false;

    // Ground shadow under character
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 * sc, 5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    const L = SKIN_LAYOUT;
    const part = (name, dx, dy) => {
      const [u, v, w, h] = L[name].faces.front;
      ctx.drawImage(sk, u, v, w, h, dx * sc, dy * sc, w * sc, h * sc);
    };

    // Legs, torso, arms, head
    part('rightLeg', -4, -12);
    part('leftLeg', 0, -12);
    part('body', -4, -24);
    part('rightArm', -8, -24);
    part('leftArm', 4, -24);
    part('head', -4, -32);

    // Hats / helmets / crowns
    if (ent.hat === 'helmet') {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-4.5 * sc, -33 * sc, 9 * sc, 3.2 * sc);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-4.5 * sc, -30 * sc, 9 * sc, 1 * sc);
    } else if (ent.hat === 'wizard') {
      ctx.fillStyle = '#5b21b6';
      ctx.fillRect(-6 * sc, -32.5 * sc, 12 * sc, 1.5 * sc);
      ctx.fillRect(-4 * sc, -36 * sc, 8 * sc, 3.5 * sc);
      ctx.fillRect(-2 * sc, -39 * sc, 4 * sc, 3 * sc);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-4 * sc, -33 * sc, 8 * sc, 1 * sc);
    } else if (ent.hat === 'crown') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-4.5 * sc, -34.5 * sc, 9 * sc, 2.5 * sc);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-1 * sc, -34 * sc, 2 * sc, 1.5 * sc);
    } else if (ent.hat === 'straw') {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-6 * sc, -32.5 * sc, 12 * sc, 2 * sc);
      ctx.fillRect(-4 * sc, -35 * sc, 8 * sc, 2.5 * sc);
    }

    // Glowing eyes for zombies & bosses
    if (ent.zombie) {
      ctx.fillStyle = ent.eyeColor || '#ff3b2f';
      ctx.shadowColor = ent.eyeColor || '#ff3b2f';
      ctx.shadowBlur = 8;
      ctx.fillRect(-3 * sc, -29 * sc, 2 * sc, 1.2 * sc);
      ctx.fillRect(1 * sc, -29 * sc, 2 * sc, 1.2 * sc);
      ctx.shadowBlur = 0;
    }

    // Shield in offhand
    if (ent.shield) {
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = Math.max(1, 1.2 * sc);
      ctx.fillRect(3.5 * sc, -23 * sc, 5.5 * sc, 8.5 * sc);
      ctx.strokeRect(3.5 * sc, -23 * sc, 5.5 * sc, 8.5 * sc);
    }

    // Held weapon / tool sprite
    if (ent.item) {
      const sp = getItemSprite(ent.item);
      ctx.drawImage(sp, -16 * sc, -32 * sc, 14 * sc, 14 * sc);
    }

    ctx.restore();
  }

  _drawMeteor(ctx, m) {
    const { sx, sy } = this.project(m.x, m.y, m.z);
    const r = m.radius * this.scale;
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, r * 2.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, m.color || '#ff6b00');
    g.addColorStop(0.65, 'rgba(239, 68, 68, 0.45)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function isOpaque(id) {
  if (!id || id === B.AIR) return false;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cube' && b.render === 'opaque';
}

// ============================================================================
// 3. THE 5 REQUESTED RUSTORE SCENES
// ============================================================================

// Scene 1: Mines, Huge Caves & Hell Underworld
function composeCavesHell(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#090710');
  bg.addColorStop(0.55, '#190a10');
  bg.addColorStop(1, '#320b08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const stage = new IsoVoxelStage({
    scale: 32,
    pitch: 0.52,
    originX: 980,
    originY: 640,
    ambient: [0.42, 0.38, 0.46],
  });

  // 1) Lower Hell Underworld (y = 0..2): Glowing Lava Sea, Obsidian Islands & Basalt Bridge
  for (let z = -12; z <= 14; z++) {
    for (let x = -14; x <= 14; x++) {
      stage.set(x, 0, z, B.OBSIDIAN);
      const isIsland = Math.hypot(x - 4, z - 4) < 5.2 || Math.hypot(x + 6, z - 5) < 4.2;
      if (isIsland) {
        stage.set(x, 1, z, (x + z) % 3 === 0 ? B.MAGMA : B.ASH);
        if (Math.hypot(x - 4, z - 4) < 3.4) stage.set(x, 2, z, B.CRACKED_BRICKS);
      } else {
        stage.set(x, 1, z, B.LAVA);
      }
    }
  }
  stage.addLight(0, 2, 6, 255, 85, 20, 18, 1.15);
  stage.addLight(6, 3, 5, 255, 60, 10, 14, 1.0);

  // Obsidian Bridge spanning across the Lava Sea at z = 1..3
  for (let x = -12; x <= 11; x++) {
    for (let z = 0; z <= 2; z++) {
      stage.set(x, 4, z, z === 1 ? B.OBSIDIAN : B.CRACKED_BRICKS);
    }
    if (x % 4 === 0) {
      stage.set(x, 5, 0, B.COBBLESTONE);
      stage.set(x, 6, 0, B.LANTERN);
      stage.addLight(x, 6, 0, 255, 190, 90, 9, 0.85);
    }
  }

  // Hell Spawner & Golden Vault on the lava island (x=4, z=4)
  stage.set(4, 3, 4, B.SPAWNER);
  stage.set(2, 3, 4, B.CHEST);
  stage.set(5, 3, 3, B.GOLD_BLOCK);
  stage.set(5, 4, 3, B.SKULL_BLOCK);

  // 2) Upper Deep Cavern & Mine Gallery (back-left & back-right cliffs y = 2..12)
  for (let z = -12; z <= 10; z++) {
    for (let x = -14; x <= 12; x++) {
      const inBackWall = z <= -3 || x <= -6;
      if (!inBackWall) continue;
      // Carve an open Mine Gallery terrace at y = 7..10 along z = -8..-4
      const onTerrace = z >= -8 && z <= -4 && x >= -10 && x <= 8;
      const topY = onTerrace ? 6 : 12;
      for (let y = 2; y <= topY; y++) {
        let id = y <= 4 ? ((x + y + z) % 4 === 0 ? B.MAGMA : B.DARK_STONE) : B.STONE;
        const hsh = Math.abs((x * 37 + y * 19 + z * 13) % 17);
        if (y >= 5 && hsh === 0) id = B.GOLD_ORE;
        else if (y >= 5 && hsh === 1) id = B.CRYSTAL_ORE;
        else if (y >= 5 && hsh === 2) id = B.AMETHYST;
        else if (y >= 6 && hsh === 3) id = B.IRON_ORE;
        else if (y >= 5 && hsh === 4) id = B.GLOW_MOSS;
        else if (y >= 6 && hsh === 5) id = B.COAL_ORE;
        stage.set(x, y, z, id);
      }
      if (onTerrace && (x + z) % 5 === 0) {
        stage.set(x, 6, z, B.COBBLESTONE);
      }
    }
  }

  // Timber Mine Supports, Conveyor Belt & Torches on the upper terrace (y = 7)
  for (const mx of [-8, -3, 2, 7]) {
    for (let y = 7; y <= 10; y++) {
      stage.set(mx, y, -8, B.LOG);
      stage.set(mx, y, -4, B.LOG);
    }
    for (let z = -8; z <= -4; z++) stage.set(mx, 10, z, B.PLANKS);
    stage.set(mx + 1, 7, -5, B.TORCH);
    stage.addLight(mx + 1, 8, -5, 255, 185, 80, 10, 0.9);
  }
  for (let x = -9; x <= 7; x++) stage.set(x, 7, -6, B.BELT);

  // Glowing Amethyst & Mana Crystal Geode Cluster on the right cavern cliff
  for (let y = 6; y <= 10; y++) {
    for (let x = 5; x <= 10; x++) {
      stage.set(x, y, -9, (x + y) % 2 === 0 ? B.CRYSTAL_ORE : B.AMETHYST);
    }
  }
  stage.addLight(8, 8, -8, 80, 210, 255, 13, 1.1);

  // Miners in the upper mine gallery, Hero & Guard on the Obsidian Bridge, Bosses in Hell
  stage.addCharacter({ role: 'miner', x: -5, y: 7, z: -6, item: 'pickaxe_iron', scale: 1.15 });
  stage.addCharacter({ role: 'miner', x: 0, y: 7, z: -5.5, item: 'pickaxe_iron', scale: 1.15 });
  stage.addCharacter({ role: 'guard', x: 5, y: 7, z: -5.5, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.15 });

  stage.addCharacter({ role: 'player', x: -3, y: 5, z: 1, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.25 });
  stage.addCharacter({ role: 'mage', x: -6, y: 5, z: 1.2, hat: 'wizard', item: 'staff_storm', scale: 1.2 });

  stage.addCharacter({ zombie: true, role: 'necromancer', x: 4, y: 3, z: 4.5, hat: 'crown', item: 'staff_fire', eyeColor: '#d946ef', scale: 1.5 });
  stage.addCharacter({ zombie: true, role: 'brute', x: 1.5, y: 5, z: 1.2, eyeColor: '#ff4500', scale: 1.45 });
  stage.addCharacter({ zombie: true, role: 'exploder', x: 5.5, y: 5, z: 1.4, eyeColor: '#fbbf24', scale: 1.2 });
  stage.addCharacter({ zombie: true, role: 'walker', x: -1, y: 2, z: 6, eyeColor: '#ff3b2f', scale: 1.15 });
  stage.addCharacter({ zombie: true, role: 'spitter', x: 7, y: 2, z: 5.5, eyeColor: '#84cc16', scale: 1.15 });

  stage.beams.push({ x0: -6, y0: 7, z0: 1.2, x1: 1.5, y1: 6.5, z1: 1.2, color: '#38bdf8', width: 5, jagged: true });
  stage.renderTo(ctx, w, h);
}

// Scene 2: Super-Upgraded Village Top-Down
function composeSuperVillage(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#132a19');
  bg.addColorStop(1, '#0b180e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const stage = new IsoVoxelStage({
    scale: 22,
    pitch: 0.62,
    originX: 960,
    originY: 520,
    ambient: [0.95, 0.94, 0.9],
  });

  const R = 24;
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      let id = B.GRASS;
      if (Math.abs(x) <= 2 || Math.abs(z) <= 2) id = B.MARBLE;
      else if (Math.abs(x) === 3 || Math.abs(z) === 3) id = B.STONE_BRICKS;
      else if (Math.abs(x) <= 19 && Math.abs(z) <= 19 && (Math.abs(x) % 9 === 0 || Math.abs(z) % 9 === 0)) id = B.COBBLESTONE;
      stage.set(x, 0, z, id);
    }
  }

  // Grand Upgraded Citadel Buildings
  stage.placeBuilding('town_hall', -5, 0, -5, 0, 0, 7);
  stage.placeBuilding('mage_tower', -15, 0, -14, 0, 0, 6);
  stage.placeBuilding('mage_tower', 8, 0, -14, 0, 0, 6);
  stage.placeBuilding('forge', -15, 0, 5, 0, 0, 6);
  stage.placeBuilding('laboratory', 8, 0, 5, 0, 0, 7);
  stage.placeBuilding('barracks', -15, 0, -5, 1, 0, 6);
  stage.placeBuilding('storehouse', 8, 0, -5, 3, 0, 6);
  stage.placeBuilding('house', -8, 0, 11, 2, 1, 6);
  stage.placeBuilding('house', 4, 0, 11, 2, 2, 6);
  stage.placeBuilding('farm', -16, 0, 13, 0, 0, 5);
  stage.placeBuilding('farm', 10, 0, 13, 0, 0, 5);
  stage.placeBuilding('cannon_tower', -19, 0, -18, 0, 0, 6);
  stage.placeBuilding('cannon_tower', 14, 0, -18, 0, 0, 6);
  stage.placeBuilding('tesla_tower', -19, 0, 15, 0, 0, 7);
  stage.placeBuilding('laser_tower', 14, 0, 15, 0, 0, 9);

  // Double Reinforced Wall Perimeter with Gold & Neon Beacons
  const W = 21;
  for (let i = -W; i <= W; i++) {
    for (const [wx, wz] of [[i, -W], [i, W], [-W, i], [W, i]]) {
      if (Math.abs(i) <= 2) continue;
      for (let y = 1; y <= 3; y++) stage.set(wx, y, wz, y === 3 ? B.STONE_BRICKS : B.REINFORCED_WALL);
      if (Math.abs(i) % 2 === 0) stage.set(wx, 4, wz, B.MARBLE);
      if (Math.abs(i) % 5 === 0) {
        stage.set(wx, 4, wz, B.GOLD_BLOCK);
        stage.set(wx, 5, wz, B.NEON);
      }
    }
  }

  // Bustling Citizens, Mages, and Elite Guards along the Marble Boulevards
  const citizens = [
    { role: 'player', x: 0, y: 1, z: 7, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.2 },
    { role: 'guard', x: -2, y: 1, z: 8, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.15 },
    { role: 'guard', x: 2, y: 1, z: 8, hat: 'helmet', item: 'crossbow', scale: 1.15 },
    { role: 'mage', x: -7, y: 1, z: -1, hat: 'wizard', item: 'staff_storm', scale: 1.15 },
    { role: 'mage', x: 7, y: 1, z: -1, hat: 'wizard', item: 'staff_fire', scale: 1.15 },
    { role: 'blacksmith', x: -9, y: 1, z: 6, item: 'axe_iron', scale: 1.15 },
    { role: 'researcher', x: 7, y: 1, z: 6, item: 'tome_meteor', scale: 1.15 },
    { role: 'farmer', x: -11, y: 1, z: 14, hat: 'straw', item: 'shovel', scale: 1.15 },
    { role: 'farmer', x: 11, y: 1, z: 14, hat: 'straw', item: 'shovel', scale: 1.15 },
    { role: 'guard', x: -12, y: 1, z: 0, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.15 },
    { role: 'guard', x: 12, y: 1, z: 0, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.15 },
    { role: 'builder', x: 0, y: 1, z: -8, item: 'pickaxe_iron', scale: 1.15 },
  ];
  for (const c of citizens) stage.addCharacter(c);

  stage.renderTo(ctx, w, h);
}

// Scene 3: Iron Age Fortress & Forge
function composeIronAge(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#3a536b');
  bg.addColorStop(0.45, '#688399');
  bg.addColorStop(1, '#1d2d1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const stage = new IsoVoxelStage({
    scale: 30,
    pitch: 0.5,
    originX: 960,
    originY: 600,
    ambient: [0.92, 0.9, 0.86],
  });

  for (let z = -16; z <= 16; z++) {
    for (let x = -16; x <= 16; x++) {
      const inside = Math.abs(x) <= 12 && Math.abs(z) <= 12;
      stage.set(x, 0, z, inside ? ((x + z) % 4 === 0 ? B.MOSSY_COBBLE : B.COBBLESTONE) : B.GRASS);
    }
  }

  // Iron Age (tier = 3) Buildings: Town Hall, Forge, Smelter, Barracks, Watchtower, Mine
  stage.placeBuilding('town_hall', -5, 0, -12, 0, 0, 3);
  stage.placeBuilding('forge', -12, 0, -1, 0, 0, 3);
  stage.placeBuilding('barracks', 4, 0, -2, 3, 0, 3);
  stage.placeBuilding('watchtower', 6, 0, 6, 0, 0, 3);
  stage.placeBuilding('mine', -11, 0, 7, 0, 0, 3);

  // Iron Age Stone & Timber Rampart Wall along the front (z = 13)
  for (let x = -14; x <= 14; x++) {
    if (Math.abs(x) <= 2) continue;
    for (let y = 1; y <= 3; y++) stage.set(x, y, 13, y === 3 ? B.COBBLESTONE : B.STONE_BRICKS);
    if (x % 2 === 0) stage.set(x, 4, 13, B.COBBLESTONE);
    if (Math.abs(x) === 4 || Math.abs(x) === 10) {
      stage.set(x, 4, 13, B.SPRUCE_LOG);
      stage.set(x, 5, 13, B.TORCH);
      stage.addLight(x, 5, 13, 255, 180, 75, 8, 0.75);
    }
  }

  // Glowing Outdoor Smelter Hearth & Iron Block Anvil Stockpile in Courtyard
  stage.box(-3, 1, 2, -2, 1, 3, B.IRON_BLOCK);
  stage.set(-2, 2, 2, B.IRON_BLOCK);
  stage.set(-4, 1, 2, B.FURNACE);
  stage.set(-4, 2, 2, B.TORCH);
  stage.addLight(-4, 2, 2, 255, 120, 40, 10, 0.95);

  stage.placeTree(-15, 1, -8, true);
  stage.placeTree(14, 1, -9, true);

  // Blacksmith, Miners & Iron-Armored Guard Phalanx
  stage.addCharacter({ role: 'blacksmith', x: -4.5, y: 1, z: 3.5, item: 'axe_iron', scale: 1.25 });
  stage.addCharacter({ role: 'miner', x: -7, y: 1, z: 9, item: 'pickaxe_iron', scale: 1.2 });
  stage.addCharacter({ role: 'player', x: 0, y: 1, z: 4.5, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.3 });
  stage.addCharacter({ role: 'guard', x: -2.2, y: 1, z: 6.5, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.25 });
  stage.addCharacter({ role: 'guard', x: 0, y: 1, z: 7.2, hat: 'helmet', item: 'battle_axe', shield: true, scale: 1.25 });
  stage.addCharacter({ role: 'guard', x: 2.2, y: 1, z: 6.5, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.25 });
  stage.addCharacter({ role: 'guard', x: 4.2, y: 1, z: 5.5, hat: 'helmet', item: 'crossbow', scale: 1.2 });

  stage.renderTo(ctx, w, h);
}

// Scene 4: Stone Age Pioneer Settlement
function composeStoneAge(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#56a3c9');
  bg.addColorStop(0.45, '#8bd1e8');
  bg.addColorStop(1, '#1f3a1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const stage = new IsoVoxelStage({
    scale: 31,
    pitch: 0.5,
    originX: 960,
    originY: 600,
    ambient: [0.98, 0.96, 0.9],
  });

  for (let z = -15; z <= 15; z++) {
    for (let x = -16; x <= 16; x++) {
      const riverX = 10 + Math.sin(z * 0.25) * 2;
      if (Math.abs(x - riverX) < 2.2) {
        stage.set(x, 0, z, B.WATER);
      } else if (Math.abs(x - riverX) < 3.4) {
        stage.set(x, 0, z, B.SAND);
      } else {
        const isPath = Math.hypot(x + 1, z - 2) < 5.5 && (x + z) % 2 === 0;
        stage.set(x, 0, z, isPath ? B.PATH : B.GRASS);
        const hsh = Math.abs((x * 41 + z * 19) % 29);
        if (!isPath && hsh === 1) stage.set(x, 1, z, B.FLOWER_RED);
        else if (!isPath && hsh === 2) stage.set(x, 1, z, B.FLOWER_YELLOW);
        else if (!isPath && hsh === 3) stage.set(x, 1, z, B.TALL_GRASS);
      }
    }
  }

  // Stone Age (tier = 1) Wattle & Thatch Huts, Lumber Camp & Early Farm
  stage.placeBuilding('town_hall', -5, 0, -11, 0, 0, 1);
  stage.placeBuilding('house', -13, 0, -2, 1, 0, 1);
  stage.placeBuilding('lumber_camp', -12, 0, 6, 0, 0, 1);
  stage.placeBuilding('farm', 1, 0, 5, 0, 0, 1);

  // Wooden Palisade Stakes along back-left perimeter
  for (let i = -14; i <= 6; i++) {
    stage.set(i, 1, -13, B.PALISADE);
    stage.set(i, 2, -13, B.PALISADE);
    if (i % 3 === 0) stage.set(i, 3, -13, B.LOG);
  }

  // Campfire in center clearing
  stage.set(-1, 1, 2, B.COBBLESTONE);
  stage.set(-1, 2, 2, B.TORCH);
  stage.set(-3, 1, 2, B.LOG);
  stage.set(1, 1, 2, B.LOG);
  stage.set(-1, 1, 0, B.HAY_BALE);
  stage.addLight(-1, 2, 2, 255, 175, 70, 9, 0.85);

  // Trees around the clearing
  for (const [tx, tz, sp] of [[-14, -9, false], [-15, 4, true], [-5, 12, false], [6, -10, true], [14, -4, false], [14, 7, false]]) {
    stage.placeTree(tx, 1, tz, sp);
  }

  // Stone Age Pioneers: Woodcutters, Farmers & Builders
  stage.addCharacter({ role: 'woodcutter', x: -6, y: 1, z: 8, item: 'axe_stone', scale: 1.25 });
  stage.addCharacter({ role: 'woodcutter', x: -10, y: 1, z: 4, item: 'axe_stone', scale: 1.25 });
  stage.addCharacter({ role: 'farmer', x: 3, y: 1, z: 7, hat: 'straw', item: 'shovel', scale: 1.25 });
  stage.addCharacter({ role: 'builder', x: -2.2, y: 1, z: 3.2, item: 'pickaxe_stone', scale: 1.25 });
  stage.addCharacter({ role: 'player', x: 0.4, y: 1, z: 3.5, item: 'sword_wood', scale: 1.3 });

  stage.renderTo(ctx, w, h);
}

// Scene 5: Wave 80 Zombie Siege Top-Down
function composeWave80Siege(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#060812');
  bg.addColorStop(0.5, '#0e1224');
  bg.addColorStop(1, '#1a0b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const stage = new IsoVoxelStage({
    scale: 25,
    pitch: 0.6,
    originX: 960,
    originY: 480,
    ambient: [0.46, 0.5, 0.66],
  });

  const R = 22;
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      const inside = Math.abs(x) <= 11 && z <= 4 && z >= -16;
      stage.set(x, 0, z, inside ? ((x + z) % 3 === 0 ? B.STONE_BRICKS : B.COBBLESTONE) : ((x * 7 + z * 11) % 7 === 0 ? B.DIRT : B.GRASS));
    }
  }

  // Citadel Towers & Town Hall defending the fortress
  stage.placeBuilding('town_hall', -5, 0, -14, 0, 0, 6);
  stage.placeBuilding('mage_tower', -11, 0, -5, 0, 0, 6);
  stage.placeBuilding('mage_tower', 5, 0, -5, 0, 0, 6);
  stage.placeBuilding('cannon_tower', -11, 0, 1, 0, 0, 6);
  stage.placeBuilding('tesla_tower', 6, 0, 1, 0, 0, 7);

  // Fortress Wall along z = 5 with breached battle gate at x = -2..2
  for (let x = -13; x <= 13; x++) {
    const isGate = Math.abs(x) <= 2;
    for (let y = 1; y <= (isGate ? 1 : 4); y++) {
      stage.set(x, y, 5, y === 4 ? B.STONE_BRICKS : B.REINFORCED_WALL);
    }
    if (!isGate && x % 2 === 0) stage.set(x, 5, 5, B.STONE_BRICKS);
    if (Math.abs(x) === 4 || Math.abs(x) === 8 || Math.abs(x) === 12) {
      stage.set(x, 5, 5, B.LANTERN);
      stage.addLight(x, 5, 5, 255, 190, 90, 9, 0.9);
    }
  }
  for (let z = -15; z <= 5; z++) {
    for (const wx of [-13, 13]) {
      for (let y = 1; y <= 4; y++) stage.set(wx, y, z, B.REINFORCED_WALL);
    }
  }

  // Defenders on the Ramparts & Gate Breach
  for (const gx of [-10, -7, -4, 4, 7, 10]) {
    stage.addCharacter({ role: 'guard', x: gx, y: 5, z: 5, hat: 'helmet', item: gx % 2 === 0 ? 'musket' : 'crossbow', scale: 1.15 });
  }
  stage.addCharacter({ role: 'mage', x: -8, y: 8, z: -2, hat: 'wizard', item: 'staff_fire', scale: 1.2 });
  stage.addCharacter({ role: 'mage', x: 8, y: 8, z: -2, hat: 'wizard', item: 'staff_storm', scale: 1.2 });
  stage.addCharacter({ role: 'player', x: 0, y: 1, z: 4, hat: 'helmet', item: 'sword_crystal', shield: true, scale: 1.3 });
  stage.addCharacter({ role: 'guard', x: -2, y: 1, z: 4.2, hat: 'helmet', item: 'sword_iron', shield: true, scale: 1.2 });
  stage.addCharacter({ role: 'guard', x: 2, y: 1, z: 4.2, hat: 'helmet', item: 'battle_axe', shield: true, scale: 1.2 });

  // Massive Wave 80 Zombie Horde + Necromancer Bosses + Brutes + Spitters + Exploders
  stage.addCharacter({ zombie: true, role: 'necromancer', x: 0, y: 1, z: 13.5, hat: 'crown', item: 'staff_fire', eyeColor: '#e879f9', scale: 1.65 });
  stage.addCharacter({ zombie: true, role: 'necromancer', x: -7.5, y: 1, z: 14.5, hat: 'crown', item: 'staff_storm', eyeColor: '#c084fc', scale: 1.45 });
  stage.addCharacter({ zombie: true, role: 'brute', x: -2.8, y: 1, z: 8.2, eyeColor: '#ff4500', scale: 1.5 });
  stage.addCharacter({ zombie: true, role: 'brute', x: 2.8, y: 1, z: 8.4, eyeColor: '#ff4500', scale: 1.5 });
  stage.addCharacter({ zombie: true, role: 'brute', x: 7.2, y: 1, z: 10.2, eyeColor: '#ff4500', scale: 1.45 });

  const kinds = ['walker', 'runner', 'spitter', 'exploder', 'walker', 'runner'];
  for (let i = 0; i < 42; i++) {
    const row = Math.floor(i / 7);
    const col = (i % 7) - 3;
    const zx = col * 3.2 + ((row % 2) * 1.2 - 0.6) + Math.sin(i * 1.9) * 0.6;
    const zz = 7.0 + row * 2.1 + Math.cos(i * 2.3) * 0.4;
    const role = kinds[i % kinds.length];
    const eyeColor = role === 'spitter' ? '#84cc16' : role === 'exploder' ? '#fbbf24' : '#ff3b2f';
    stage.addCharacter({
      zombie: true,
      role,
      x: zx,
      y: 1,
      z: zz,
      eyeColor,
      scale: role === 'exploder' ? 1.22 : 1.08,
    });
  }

  // Fiery Meteor Explosions & Tesla Chain Lightning Beams
  stage.addLight(-2.5, 2, 9, 255, 95, 20, 12, 1.35);
  stage.addLight(5, 3, 10, 56, 189, 248, 12, 1.25);
  stage.addLight(0, 3, 13.5, 192, 132, 252, 11, 1.15);

  stage.meteors.push({ x: -2.8, y: 2.0, z: 8.8, radius: 1.4, color: '#ff5500' });
  stage.meteors.push({ x: 4.5, y: 5.5, z: 10.5, radius: 1.15, color: '#ff8800' });
  stage.meteors.push({ x: -6.5, y: 7.5, z: 11.5, radius: 0.95, color: '#ffaa00' });

  stage.beams.push({ x0: 8, y0: 9, z0: 2, x1: 2.8, y1: 2, z1: 8.4, color: '#38bdf8', width: 6, jagged: true });
  stage.beams.push({ x0: 2.8, y0: 2, z0: 8.4, x1: 0, y1: 2.5, z1: 13.5, color: '#7dd3fc', width: 4, jagged: true });
  stage.beams.push({ x0: 2.8, y0: 2, z0: 8.4, x1: 6.2, y1: 2, z1: 11.2, color: '#7dd3fc', width: 4, jagged: true });
  stage.beams.push({ x0: -8, y0: 9, z0: -2, x1: -2.8, y1: 2, z1: 8.8, color: '#f97316', width: 7, jagged: false });

  stage.renderTo(ctx, w, h);
}

// Post-FX 2D overlay (clean cinematic game HUD frame)
function drawShotPostOverlay(ctx, w, h, shotId) {
  const s = w / 1920;
  ctx.save();
  ctx.scale(s, s);

  const vig = ctx.createRadialGradient(960, 540, 540, 960, 540, 1140);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 1920, 1080);

  if (shotId === 'wave80_siege') {
    ctx.fillStyle = 'rgba(20, 10, 14, 0.9)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(540, 26, 840, 92, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '700 30px "Ruslan Display", "Philosopher", serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('ВОЛНА 80 · НОЧНАЯ ОСАДА НЕЖИТИ', 960, 62);

    ctx.fillStyle = '#2a1215';
    ctx.fillRect(600, 80, 720, 22);
    const hpGrad = ctx.createLinearGradient(600, 0, 1320, 0);
    hpGrad.addColorStop(0, '#dc2626');
    hpGrad.addColorStop(1, '#a855f7');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(600, 80, 590, 22);
    ctx.font = '700 14px "Philosopher", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Повелитель Некромантов · 18 400 / 22 000 ОЗ', 960, 96);
  } else {
    const meta = {
      caves_hell: ['Ярус: Глубокие пещеры → Преисподняя', 'Руды: Золото · Кристаллы маны · Аметисты · Море лавы и Боссы', '#f97316'],
      super_village: ['Имперская Цитадель · Вид сверху', 'Население: 64/64 · Башни магов и Теслы · Полная оборона', '#eac66e'],
      iron_age: ['Железный век · Крепость и Кузница', 'Пылающий горн · Каменные стены · Стражники в железных латах', '#eac66e'],
      stone_age: ['Каменный век · Первое поселение', 'Хижины из плетня · Частокол · Добыча дерева и пропитания', '#eac66e'],
    }[shotId];
    if (meta) {
      ctx.fillStyle = 'rgba(22, 16, 11, 0.88)';
      ctx.strokeStyle = meta[2];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(36, 30, 620, 72, 10);
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 24px "Philosopher", sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText(meta[0], 58, 62);
      ctx.font = '400 16px "Philosopher", sans-serif';
      ctx.fillStyle = '#e5d5b5';
      ctx.fillText(meta[1], 58, 88);
    }
  }

  ctx.restore();
}

const _shotCache = new Map();

export function renderRuStoreShotCanvas(shotId, width = 1280, height = 720) {
  const cacheKey = `${shotId}:${width}x${height}`;
  if (_shotCache.has(cacheKey)) return _shotCache.get(cacheKey);

  const base = document.createElement('canvas');
  base.width = 1920;
  base.height = 1080;
  const bctx = base.getContext('2d');

  if (shotId === 'caves_hell') composeCavesHell(bctx, 1920, 1080);
  else if (shotId === 'super_village') composeSuperVillage(bctx, 1920, 1080);
  else if (shotId === 'iron_age') composeIronAge(bctx, 1920, 1080);
  else if (shotId === 'stone_age') composeStoneAge(bctx, 1920, 1080);
  else composeWave80Siege(bctx, 1920, 1080);

  drawShotPostOverlay(bctx, 1920, 1080, shotId);

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

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============================================================================
// 4. ORNATE IN-GAME RUSTORE SHOWCASE & ICON WINDOW
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
    this.ui.toast(`Скриншот «${shot.title}» (1920×1080) сохранён!`, 'good');
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
      heroTag.textContent = `${shot.tag} · 1920×1080 (16:9 для RuStore)`;
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
          'Новая иконка автоматически установлена для ярлыка Windows (.exe), Android APK и браузера, а также полностью соответствует требованиям каталога RuStore (512×512 PNG).'
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
          h('h2.zc-h', 'Витрина RuStore · Иконка и Скриншоты'),
          h('div.zc-note', 'Готовый медиа-набор в высоком разрешении (512×512 и 1920×1080) для публикации игры в RuStore')
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
          h('div.zc-rs-hero-bar', h('div.zc-rs-hero-text', heroTag, heroTitle, heroDesc), dlHeroBtn)
        ),
        h('div.zc-field-lbl', 'Все 5 промо-скриншотов игры (нажмите для увеличения или скачивания)'),
        grid
      )
    );

    dialog.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.root.append(dialog);
  }
}
