// Procedural 64x64 character skins in the standard Minecraft skin layout (classic 4px arms).
// Everything important is painted on the BASE layer (the model renders only base boxes).
// Faces are pre-shaded: front = base, sides darker, back darker still, top lighter, bottom darkest.
// No DOM work at import time; canvases are created on demand and memoized.

import { Px, makeRng, hex, hexes, shift, mix } from './pixel.js';

function box(u, v, w, h, d) {
  return {
    u, v, w, h, d,
    faces: {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],
      front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h],
      back: [u + d + w + d, v + d, w, h],
    },
  };
}

/**
 * Standard 64x64 skin layout. Each part: {u,v,w,h,d, faces:{top,bottom,right,front,left,back: [x,y,w,h]}}
 * (w = width (X), h = height (Y), d = depth (Z), in pixels; 1px = 1/16 block).
 * `overlay` holds the second-layer boxes (hat/jacket/sleeves/pants); this generator leaves them transparent.
 */
export const SKIN_LAYOUT = {
  size: 64,
  head: box(0, 0, 8, 8, 8),
  body: box(16, 16, 8, 12, 4),
  rightArm: box(40, 16, 4, 12, 4),
  rightLeg: box(0, 16, 4, 12, 4),
  leftArm: box(32, 48, 4, 12, 4),
  leftLeg: box(16, 48, 4, 12, 4),
  overlay: {
    head: box(32, 0, 8, 8, 8),
    body: box(16, 32, 8, 12, 4),
    rightArm: box(40, 32, 4, 12, 4),
    rightLeg: box(0, 32, 4, 12, 4),
    leftArm: box(48, 48, 4, 12, 4),
    leftLeg: box(0, 48, 4, 12, 4),
  },
};

const PARTS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
const FACE_SHADE = { front: 0, right: -0.13, left: -0.13, back: -0.2, top: 0.09, bottom: -0.36 };

// ------------------------------------------------------------------ palettes
const SKIN_TONES = ['#f3cfb0', '#e8b894', '#d49e78', '#bb8360', '#9c6646', '#7c4d33', '#5e3825'];
const HAIR = ['#20150f', '#3a2416', '#5a3620', '#7a4a26', '#9a6a36', '#c89a58', '#e0c27a', '#7a7a7e', '#b8b8bc', '#8a3a1c', '#b85a24'];
const EYES = ['#2f5f9e', '#3d7a3a', '#6a4022', '#3a281a', '#4e8aa6', '#6b5e2e', '#5a5a6e'];
const TUNICS = ['#6a7a3a', '#7a5a3a', '#44648a', '#8a6a44', '#6a4a6a', '#3e6a5a', '#8a4a3a'];

function skinRamp(base) {
  const b = hex(base);
  return [shift(b, -0.42, 0.35), shift(b, -0.22, 0.3), b, shift(b, 0.14, 0.2), shift(b, 0.28, 0.15)];
}

// ring coordinate around a box (right -> front -> left -> back)
function ringOf(L, face, x) {
  if (face === 'right') return x;
  if (face === 'front') return L.d + x;
  if (face === 'left') return L.d + L.w + x;
  if (face === 'back') return 2 * L.d + L.w + x;
  return -1;
}
// distance (in px) of a head side-face column from the face's front edge
function frontDist(face, x) {
  if (face === 'right') return 7 - x;
  if (face === 'left') return x;
  if (face === 'front') return 0;
  return 8;
}

// ------------------------------------------------------------------ head
function paintHead(c, face, x, y) {
  const S = c.skin, H = c.hair;
  const style = c.hairStyle;
  const fd = frontDist(face, x);
  // extra (hood, skull, lamp...) takes priority
  if (c.headExtra) { const e = c.headExtra(face, x, y, fd); if (e) return e; }
  const hairCol = (xx, yy) => {
    const k = (xx * 3 + yy * 5 + (c.hairSeed || 0)) % 7;
    return k === 0 ? H[3] : k === 3 ? H[1] : k === 5 && yy > 0 ? H[1] : H[2];
  };
  if (face === 'top') {
    if (style === 'bald') return (x + y) % 5 === 0 ? S[3] : S[2];
    return hairCol(x, y);
  }
  if (face === 'bottom') {
    if (c.beard === 'full' && y < 5) return H[1];
    return S[1];
  }
  const beard = c.beard;
  // --- hair coverage
  let hair = false;
  if (face === 'back') {
    const len = style === 'long' ? 8 : style === 'bald' ? 0 : style === 'bowl' ? 6 : 5;
    hair = y < len || (style === 'bald' && y >= 2 && y < 5);
    if (!hair && y === len && (x + (c.hairSeed || 0)) % 2 === 0 && style !== 'bald') hair = true; // ragged edge
  } else if (face === 'front') {
    if (style === 'bald') hair = false;
    else if (style === 'bowl') hair = y < 2 || (y === 2 && x !== 3 && x !== 4);
    else if (style === 'spiky') hair = y < 1 || (y === 1 && x % 3 !== 1) || (y === 2 && (x === 0 || x === 7));
    else if (style === 'long') hair = y < 2 || ((x === 0 || x === 7) && y < 8);
    else if (style === 'side') hair = y < 2 || (y === 2 && x < 5) || ((x === 0 || x === 7) && y < 3);
    else hair = y < 2 || ((x === 0 || x === 7) && y < 3);
  } else { // sides
    if (style === 'bald') hair = fd >= 3 && y >= 2 && y < 5;
    else if (style === 'long') hair = y < 3 || fd >= 2;
    else hair = y < 2 || (y < 3 && fd >= 1) || (fd >= 4 && y < 5) || (fd >= 6 && y < 6);
  }
  // --- beard coverage
  let isBeard = false;
  if (beard === 'full') {
    if (face === 'front') isBeard = (y >= 5 && (x < 2 || x > 5)) || y === 7 || (y === 6 && (x === 2 || x === 5));
    else if (face !== 'back') isBeard = fd <= 3 && y >= 4 && (fd <= 2 || y >= 5);
  } else if (beard === 'goatee' && face === 'front') isBeard = y === 7 && x >= 2 && x <= 5;
  else if (beard === 'mustache' && face === 'front') isBeard = y === 5 && x >= 2 && x <= 5;
  else if (beard === 'chin' && face === 'front') isBeard = (y === 7) || (y === 6 && (x < 2 || x > 5));
  if (hair) return hairCol(x, y);
  if (isBeard) return (x + y) % 3 === 0 ? H[1] : H[2];
  // --- skin with facial features
  if (face === 'front') {
    if (c.face) { const f = c.face(x, y); if (f) return f; }
    if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return c.browCol || H[1];
    if (y === 4) {
      if (x === 1 || x === 6) return c.eyeWhite || hex('#f2f0ea');
      if (x === 2 || x === 5) return c.eye;
      if (x === 3 || x === 4) return S[3];
    }
    if (y === 5 && (x === 3 || x === 4)) return S[1];
    if (y === 6 && (x === 3 || x === 4)) return c.mouth || hex('#8a4a3e');
    if (y === 6 && (x === 2 || x === 5) && c.smile) return S[1];
    if (c.stubble && y >= 6 && (x + y) % 2 === 0) return mix(S[1], H[1], 0.45);
    if (x === 0 || x === 7) return S[1];
    if (y === 7) return S[1];
    if (y === 5 && (x === 1 || x === 6) && c.blush) return mix(S[2], hex('#d87060'), 0.35);
    if (y === 2) return S[3];
    return S[2];
  }
  if (face !== 'back') {
    // ear
    if (fd === 3 && (y === 4 || y === 5)) return y === 4 ? S[3] : S[1];
    if (fd === 4 && (y === 4 || y === 5)) return S[1];
    if (fd === 0) return S[1];
  }
  if (y >= 6 && face === 'back') return S[1];
  return S[2];
}

// ------------------------------------------------------------------ body/limbs (outfit painter)
function paintOutfit(c, part, face, x, y, ring) {
  const o = c.outfit;
  const S = c.skin;
  const L = SKIN_LAYOUT[part];
  const isArm = part === 'rightArm' || part === 'leftArm';
  const isLeg = part === 'rightLeg' || part === 'leftLeg';
  let col = null;
  if (o.custom) { col = o.custom(part, face, x, y, ring, L); if (col) return col; }
  if (part === 'body') {
    if (face === 'top') return o.shoulder ? o.shoulder(x, y) : o.shirt(ring < 0 ? x : ring, 0, face);
    if (face === 'bottom') return o.robe ? o.robe : (o.pants || o.shirt(x, 11, face));
    let c0 = o.shirt(ring, y, face, x);
    if (o.collar && face === 'front' && y === 0 && (x === 3 || x === 4)) c0 = S[1];
    if (o.collar && face === 'front' && y === 1 && (x === 3 || x === 4) && o.collar === 'v') c0 = S[2];
    if (o.belt && y === (o.beltY || 8)) c0 = (face === 'front' && (x === 3 || x === 4)) ? (x === 3 ? o.buckle || hex('#d8b24a') : shift(o.buckle || hex('#d8b24a'), -0.35)) : o.belt;
    if (o.overlay) { const k = o.overlay(face, x, y, ring); if (k) c0 = k; }
    return c0;
  }
  if (isArm) {
    const sleeve = o.sleeve ?? 8;
    if (face === 'top') return sleeve > 0 ? o.shirt(ring < 0 ? x : x, 0, 'arm') : S[2];
    if (face === 'bottom') return o.glove || S[1];
    if (o.glove && y >= (o.gloveY || 9)) {
      const g = o.glove;
      return y === (o.gloveY || 9) ? shift(g, 0.18) : face === 'front' ? g : shift(g, -0.1);
    }
    if (y < sleeve) {
      let s = o.sleeveCol ? o.sleeveCol(ring, y, face) : o.shirt(ring + (part === 'leftArm' ? 3 : 0), y, 'arm');
      if (o.cuff && y === sleeve - 1) s = o.cuff;
      return s;
    }
    // skin (forearm/hands)
    if (y >= 10) return face === 'front' || face === 'left' || face === 'right' ? (y === 11 ? S[1] : S[2]) : S[1];
    return y === sleeve ? S[1] : S[2];
  }
  if (isLeg) {
    if (face === 'top') return o.robe || o.pants;
    if (face === 'bottom') return o.bootSole || shift(o.boots, -0.3);
    if (o.robe) {
      if (o.robeTrim && y >= 10) return o.robeTrim;
      if (y >= 11) return o.boots;
      return o.robeCol ? o.robeCol(part, face, x, y, ring) : o.robe;
    }
    const bootH = o.bootH ?? 3;
    if (y >= 12 - bootH) {
      if (y === 12 - bootH) return shift(o.boots, 0.16);
      if (y === 11) return shift(o.boots, -0.25);
      return o.boots;
    }
    let pc = o.pantsCol ? o.pantsCol(part, face, x, y, ring) : o.pants;
    // inner-leg seam shading
    if ((part === 'rightLeg' && face === 'left') || (part === 'leftLeg' && face === 'right')) pc = shift(pc, -0.1);
    if (face === 'front' && y === 0) pc = shift(pc, -0.12);
    return pc;
  }
  return null;
}

function render(c) {
  const px = new Px(64, 64);
  const r = c.rng;
  for (const part of PARTS) {
    const L = SKIN_LAYOUT[part];
    for (const [face, [u, v, w, h]] of Object.entries(L.faces)) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ring = ringOf(L, face, x);
        let col = part === 'head' ? paintHead(c, face, x, y) : paintOutfit(c, part, face, x, y, ring);
        if (!col) continue;
        col = hex(col);
        let amt = FACE_SHADE[face];
        // subtle cloth/skin texture: deterministic micro-variation
        if (c.grain !== 0 && part !== 'head') amt += (r() - 0.5) * (c.grain ?? 0.07);
        if (c.post) { const pc = c.post(part, face, x, y, ring, col); if (pc) col = hex(pc); }
        if (amt) col = shift(col, amt, 0.14);
        px.set(u + x, v + y, col);
      }
    }
  }
  return px;
}

// ------------------------------------------------------------------ patterns
const solid = (col) => () => col;
function plaid(base, dark, line) {
  base = hex(base); dark = hex(dark); line = hex(line);
  return (ring, y) => {
    const a = ((ring % 4) + 4) % 4 === 0, b = y % 4 === 0;
    if (a && b) return line;
    if (a || b) return dark;
    return base;
  };
}
function chainmail(base) {
  const r = hexes(base);
  return (ring, y) => ((ring + y) % 2 === 0 ? r[(y % 2) ? 1 : 2] : r[0]);
}

// village emblem (tiny tower) 4x5 used on the guard tabard
const EMBLEM = ['1010', '1111', '0110', '0110', '1111'];

// ------------------------------------------------------------------ villagers
function baseVillager(seed) {
  const r = makeRng('villager:' + seed);
  const tone = r.pick(SKIN_TONES);
  const hairBase = r.pick(HAIR);
  const c = {
    rng: r,
    skin: skinRamp(tone),
    hair: [shift(hairBase, -0.45), shift(hairBase, -0.22), hex(hairBase), shift(hairBase, 0.18)],
    hairStyle: r.pick(['short', 'short', 'bowl', 'side', 'long', 'spiky', 'bald']),
    hairSeed: r.int(0, 6),
    beard: null,
    eye: hex(r.pick(EYES)),
    smile: r.chance(0.5),
    blush: r.chance(0.35),
  };
  c.male = r.chance(0.6);
  if (c.male) c.beard = r.pick([null, null, 'full', 'mustache', 'goatee', 'chin']);
  else if (c.hairStyle === 'bald' || c.hairStyle === 'spiky') c.hairStyle = 'long';
  if (!c.male) c.blush = true;
  return c;
}

const JOBS = {
  idle(c, r) {
    const t = hex(r.pick(TUNICS));
    c.outfit = {
      shirt: (ring, y) => (y === 11 ? shift(t, -0.15) : t), sleeve: r.pick([4, 8]), collar: 'v',
      belt: hex('#4a2e1a'), buckle: hex('#b0a080'), pants: hex(r.pick(['#5a4632', '#4a4238', '#3e4658'])), boots: hex('#3a2616'),
    };
  },
  builder(c, r) {
    const shirt = hex('#d9c9a6'), vest = hex('#e2791c'), vestD = hex('#b85a12');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'arm') return shirt;
        if (face === 'front') return (x <= 1 || x >= 6) ? (x === 1 || x === 6 ? vestD : vest) : (y === 0 ? shift(shirt, -0.15) : shirt);
        if (face === 'back') return y < 9 ? vest : shirt;
        return vest;
      },
      sleeve: 7, cuff: hex('#c4b28c'), collar: true,
      belt: hex('#5a3a1e'), buckle: hex('#c8c8c8'), beltY: 8,
      overlay: (face, x, y) => {
        // tool belt pouches + hammer
        if (y === 9 && face === 'front' && (x === 1 || x === 6)) return hex('#6e4826');
        if (y === 10 && face === 'front' && x === 1) return hex('#6e4826');
        if (face === 'front' && x === 6 && (y === 9 || y === 10 || y === 11)) return y === 9 ? hex('#9aa0a8') : hex('#7a5430');
        if (face === 'left' && y >= 9 && y <= 10) return hex('#6e4826');
        // reflective stripe
        if (y === 5 && (face === 'back' || (face === 'front' && (x <= 1 || x >= 6)))) return hex('#f3e39a');
        return null;
      },
      pants: hex('#4e5a6e'), boots: hex('#5a3a1e'), bootH: 3, glove: hex('#a07a4a'), gloveY: 10,
    };
    c.beard = c.male ? c.beard || 'chin' : null;
  },
  woodcutter(c, r) {
    const pl = plaid('#b8322a', '#7a1c16', '#2a0c0a');
    c.outfit = {
      shirt: (ring, y) => pl(ring, y), sleeve: 9, cuff: hex('#6a1812'), collar: 'v',
      belt: hex('#2a1a10'), buckle: hex('#8a8a8a'),
      overlay: (face, x, y) => (face === 'front' && (x === 1 || x === 6) && y < 8 ? hex('#3a2a1a') : face === 'back' && (x === 2 || x === 5) && y < 8 ? hex('#3a2a1a') : null), // suspenders
      pants: hex('#3e4a2c'), boots: hex('#3a2414'), bootH: 4,
    };
    if (c.male && !c.beard) c.beard = 'full';
  },
  farmer(c, r) {
    const shirt = hex('#dcc27c'), shirtD = hex('#c4a660');
    const ov = hex('#48639a'), ovD = hex('#34497a');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'arm') return (y % 3 === 0) ? shirtD : shirt;
        if (face === 'front') {
          if (y >= 5) return ov;
          if (y >= 1 && (x === 1 || x === 6)) return ovD;                   // straps
          if (y >= 3 && x >= 2 && x <= 5) return ov;                        // bib
          return (y % 3 === 0) ? shirtD : shirt;
        }
        if (face === 'back') return y >= 6 ? ov : ((x === 1 || x === 6) && y >= 1 ? ovD : shirt);
        return y >= 6 ? ov : shirt;
      },
      sleeve: 4, collar: true,
      overlay: (face, x, y) => {
        if (face === 'front' && y === 3 && (x === 1 || x === 6)) return hex('#d8d8d8'); // strap buttons
        if (face === 'front' && y === 6 && x >= 3 && x <= 4) return ovD;               // pocket
        return null;
      },
      pants: ov, boots: hex('#5e3c1e'), bootH: 3,
      pantsCol: (part, face, x, y) => (y === 4 && face === 'front' && x === 1 ? ovD : ov),
    };
  },
  miner(c, r) {
    const shirt = hex('#6c6c72'), dirt = hex('#4a4038');
    c.outfit = {
      shirt: (ring, y) => ((ring * 7 + y * 3) % 11 === 0 ? dirt : y === 11 ? shift(shirt, -0.15) : shirt),
      sleeve: 9, collar: true,
      belt: hex('#2a2420'), buckle: hex('#c8a040'),
      overlay: (face, x, y) => (face === 'front' && y >= 2 && y <= 3 && x >= 5 && x <= 6 ? hex('#50505a') : null),
      pants: hex('#3e3a40'), boots: hex('#1e1a18'), bootH: 4, glove: hex('#3a3634'), gloveY: 10,
      pantsCol: (part, face, x, y) => ((x + y * 3) % 9 === 0 ? dirt : hex('#3e3a40')),
    };
    // headlamp strap + lamp; soot smudges
    c.headExtra = (face, x, y, fd) => {
      if (y === 1 && face !== 'top' && face !== 'bottom') {
        if (face === 'front' && (x === 3 || x === 4)) return x === 3 ? hex('#fff6b0') : hex('#ffd84a');
        if (face === 'front' && (x === 2 || x === 5)) return hex('#8a8a8a');
        return hex('#3a2a1e');
      }
      if (face === 'front' && y === 0 && (x === 3 || x === 4)) return hex('#6a6a6a');
      return null;
    };
    c.face = (x, y) => ((x === 1 && y === 6) || (x === 6 && y === 5) ? mix(c.skin[1], hex('#3a3a3a'), 0.5) : null);
  },
  blacksmith(c, r) {
    const shirt = hex('#3a3232'), apron = hex('#7a4a26'), apronD = hex('#5a3418');
    c.skin = skinRamp(shift(c.skin[2], -0.05));
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'front') {
          if (y <= 1 && (x === 1 || x === 6)) return apronD;
          if (y >= 2 && x >= 1 && x <= 6) return (x === 1 || x === 6) ? apronD : ((x + y) % 5 === 0 ? shift(apron, 0.12) : apron);
        }
        return shirt;
      },
      sleeve: 3, collar: true,
      overlay: (face, x, y) => (face === 'front' && y === 7 && x >= 2 && x <= 5 ? hex('#3a2010') : (face === 'back' && y === 7) ? apronD : null),
      pants: hex('#2e2a2a'), boots: hex('#1e1612'), bootH: 3, glove: hex('#6a4424'), gloveY: 8,
      pantsCol: (part, face, x, y) => (face === 'front' && y < 8 ? (y === 7 ? apronD : apron) : hex('#2e2a2a')),
    };
    c.face = (x, y) => (x === 6 && y === 6 ? mix(c.skin[1], hex('#2a2a2a'), 0.5) : null);
    if (c.male && !c.beard) c.beard = r.pick(['full', 'mustache']);
    if (c.hairStyle === 'long') c.hairStyle = 'short';
  },
  researcher(c, r) {
    const robe = hex('#2e4e8e'), robeD = hex('#223c70'), trim = hex('#e8e8f0');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'front' && (x === 3 || x === 4)) return y === 0 ? trim : (x === 3 ? trim : hex('#c8c8d8'));
        if (face === 'front' && y === 0) return trim;
        return y % 4 === 3 && face === 'back' ? robeD : robe;
      },
      sleeve: 10, cuff: trim, collar: false,
      belt: hex('#6a4a2a'), buckle: hex('#d8b24a'), beltY: 7,
      overlay: (face, x, y) => (face === 'front' && x === 6 && y >= 2 && y <= 4 ? (y === 2 ? hex('#1a1a1a') : hex('#f0e8d0')) : null), // quill in pocket
      robe, robeTrim: trim, boots: hex('#2a2018'),
      robeCol: (part, face, x, y) => (face === 'front' && ((part === 'rightLeg' && x === 3) || (part === 'leftLeg' && x === 0)) ? trim : (y % 5 === 4 ? robeD : robe)),
    };
    // spectacles
    c.face = (x, y) => {
      if (y === 4 && (x === 0 || x === 7)) return hex('#9a9aa2');
      if (y === 4 && (x === 3 || x === 4)) return hex('#b8b8c0');
      if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return hex('#8a8a92');
      return null;
    };
    c.eyeWhite = hex('#dff0ff');
    if (c.hairStyle === 'spiky') c.hairStyle = 'side';
  },
  guard(c, r) {
    const mail = chainmail(['#4e525a', '#8a8e96', '#aeb2b8']);
    const tab = hex('#9a2224'), tabD = hex('#6a1216'), gold = hex('#e0b440');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if ((face === 'front' || face === 'back') && x >= 1 && x <= 6) {
          if (x === 1 || x === 6) return tabD;
          if (face === 'front' && y >= 2 && y <= 6) {
            const row = EMBLEM[y - 2]; if (row && row[x - 2] === '1') return gold;
          }
          return y === 11 ? tabD : tab;
        }
        return mail(ring, y);
      },
      sleeveCol: (ring, y) => (y === 0 ? hex('#6a6e76') : mail(ring, y)),
      sleeve: 9, collar: false,
      belt: hex('#3a2414'), buckle: hex('#d8b24a'),
      pants: hex('#34343e'), boots: hex('#2a1c12'), bootH: 4, glove: hex('#7a7e86'), gloveY: 9,
    };
    c.hairStyle = r.pick(['short', 'bowl', 'side']);
    c.smile = false;
  },
  mage(c, r) {
    const robe = hex('#5a2a86'), robeD = hex('#42186a'), gold = hex('#e2b44a');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'front' && (x === 3 || x === 4)) return x === 3 ? gold : shift(gold, -0.2);
        if (face === 'front' && y === 0) return gold;
        if (face === 'back' && y >= 2 && y <= 4 && x >= 3 && x <= 4) return hex('#f0d060'); // star
        return (ring + y) % 7 === 0 ? robeD : robe;
      },
      sleeve: 10, cuff: gold,
      belt: gold, buckle: hex('#8ff4ff'), beltY: 7,
      robe, robeTrim: gold, boots: hex('#2a1a30'),
      robeCol: (part, face, x, y) => (face === 'front' && ((part === 'rightLeg' && x === 3) || (part === 'leftLeg' && x === 0)) ? gold : (y % 4 === 1 && (x + y) % 3 === 0 ? robeD : robe)),
    };
    const grey = r.chance(0.6);
    if (grey) c.hair = hexes(['#6a6a70', '#8e8e94', '#b4b4ba', '#dadade']);
    if (c.male) c.beard = 'full';
    c.hairStyle = r.pick(['long', 'long', 'bald', 'side']);
    c.eye = hex('#8a5ae0');
  },
};

const skinCache = new Map();
function memo(key, fn) {
  if (!skinCache.has(key)) skinCache.set(key, fn());
  return skinCache.get(key);
}

/** Villager skin for a job ('idle','builder','woodcutter','farmer','miner','blacksmith','researcher','guard','mage'). */
export function villagerSkin(job = 'idle', seed = 0) {
  return memo(`v:${job}:${seed}`, () => {
    const c = baseVillager(seed);
    const r = makeRng(`villager-job:${job}:${seed}`);
    (JOBS[job] || JOBS.idle)(c, r);
    return render(c).toCanvas();
  });
}

// ------------------------------------------------------------------ zombies
const ZOMBIE = {
  walker: { skin: '#6f8f5c', eye: '#e4f25a', shirt: '#3e5a7c', pants: '#4a3e30', tear: 0.22 },
  runner: { skin: '#839070', eye: '#ff3a24', shirt: '#7a3228', pants: '#2e2e36', tear: 0.3 },
  brute: { skin: '#5a7a48', eye: '#ff8a24', shirt: '#5a4028', pants: '#3a3026', tear: 0.35 },
  spitter: { skin: '#8aa05a', eye: '#a8ff3a', shirt: '#6a7040', pants: '#3e3a2a', tear: 0.28 },
  exploder: { skin: '#7c8a56', eye: '#ffc83a', shirt: null, pants: '#4a3a2a', tear: 0.3 },
  necromancer: { skin: '#d6d0bc', eye: '#c86aff', shirt: '#1e1a2a', pants: '#1e1a2a', tear: 0.08 },
};

/** Zombie skin: type 'walker','runner','brute','spitter','exploder','necromancer'. */
export function zombieSkin(type = 'walker', seed = 0) {
  return memo(`z:${type}:${seed}`, () => {
    const t = ZOMBIE[type] || ZOMBIE.walker;
    const r = makeRng(`zombie:${type}:${seed}`);
    const skin = skinRamp(t.skin);
    const eye = hex(t.eye);
    const hairBase = r.pick(['#2a2218', '#3a3026', '#4a4a44', '#1e1a16']);
    const rot = hex('#3f4a2c'), wound = hex('#6a2420'), bone = hex('#d8d2b8');
    const c = {
      rng: r, skin,
      hair: [shift(hairBase, -0.4), shift(hairBase, -0.2), hex(hairBase), shift(hairBase, 0.15)],
      hairStyle: r.pick(['short', 'bald', 'side', 'short']), hairSeed: r.int(0, 6),
      eye, eyeWhite: hex('#1a1210'), browCol: shift(t.skin, -0.45),
      mouth: hex('#2a0e0c'), grain: 0.12,
    };
    // face: sunken glowing eyes, gaping mouth with a tooth, rot spots
    c.face = (x, y) => {
      if (y === 4 && (x === 1 || x === 6)) return hex('#140c0a');
      if (y === 4 && (x === 2 || x === 5)) return eye;
      if (y === 3 && (x === 2 || x === 5)) return mix(skin[0], eye, 0.25);
      if (y === 6 && x >= 2 && x <= 5) return x === 3 ? hex('#d8cfa6') : hex('#2a0e0c');
      if (y === 7 && (x === 3 || x === 4)) return hex('#4a1a14');
      if ((x * 5 + y * 3 + seed) % 13 === 0) return rot;
      return null;
    };
    const torn = (x, y, ring, part) => ((x * 7 + y * 13 + ring * 3 + part.length * 5 + seed) % 100) / 100 < t.tear;
    const shirt = t.shirt ? hex(t.shirt) : null;
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (!shirt) return skin[(ring + y) % 5 === 0 ? 1 : 2];
        // ragged hem & holes
        if (y >= 10 && (ring + y) % 3 === 0) return skin[1];
        if (torn(x || 0, y, ring, 'body')) return (ring + y) % 4 === 0 ? wound : skin[2];
        return (ring * 3 + y) % 7 === 0 ? shift(shirt, -0.2) : shirt;
      },
      sleeve: shirt ? r.int(3, 6) : 0,
      pants: hex(t.pants), boots: hex(t.pants), bootH: 0,
      pantsCol: (part, face, x, y, ring) => {
        if (y >= 9 && (x + y + ring) % 3 === 0) return skin[1];            // shredded trouser legs
        if (torn(x, y, ring, part)) return skin[2];
        return (x + y * 2) % 6 === 0 ? shift(t.pants, -0.2) : hex(t.pants);
      },
      custom: null,
    };
    // legs: bare feet under tatters
    const extra = [];
    if (type === 'brute') {
      c.outfit.sleeve = 0;
      c.outfit.shirt = (ring, y, face, x) => {
        if (face === 'front' && (x === 0 || x === 7 || x === 1 || x === 6) && y < 9) return hex('#5a4028');   // open vest
        if (face === 'back' && y < 9) return hex('#5a4028');
        if (face === 'front' && ((x === 3 && y === 2) || (x === 4 && y === 3) || (x === 5 && y === 4))) return hex('#c47a70'); // scar
        if (face === 'front' && y === 5 && (x === 3 || x === 4)) return skin[1];
        if (y === 8) return hex('#2a1a10');
        return skin[(x + y) % 6 === 0 ? 3 : 2];
      };
      c.beard = null; c.hairStyle = 'bald';
      c.face = ((f) => (x, y) => ((x === 5 && y === 2) || (x === 6 && y === 3) ? hex('#b86a60') : f(x, y)))(c.face);
      c.outfit.glove = hex('#3a2a1e'); c.outfit.gloveY = 10;
    }
    if (type === 'spitter') {
      const acid = hex('#a8ff3a'), acidD = hex('#5aa81e');
      c.face = ((f) => (x, y) => {
        if (y === 6 && x >= 2 && x <= 5) return x === 4 ? acid : hex('#1e2a0c');
        if (y === 7 && (x === 3 || x === 4)) return x === 3 ? acid : acidD;
        return f(x, y);
      })(c.face);
      c.post = (part, face, x, y) => (part === 'body' && face === 'front' && ((x === 3 && y <= 3) || (x === 4 && y <= 1) || (x === 3 && y === 5)) ? (y % 2 ? acidD : acid) : null);
      c.headExtra = (face, x, y) => (face === 'bottom' && (x === 3 || x === 4) && y < 3 ? acid : null);
    }
    if (type === 'exploder') {
      const pus = hexes(['#a8401a', '#ff8a2a', '#ffc85a', '#fff0b0']);
      const dyn = hex('#c02a1e'), dynD = hex('#7a1410'), strap = hex('#4a3018');
      const pustules = new Set();
      for (let i = 0; i < 14; i++) pustules.add(`${r.pick(['body', 'rightArm', 'leftArm', 'head'])}:${r.pick(['front', 'right', 'left', 'back'])}:${r.int(0, 7)}:${r.int(0, 11)}`);
      c.post = (part, face, x, y, ring) => {
        if (part === 'body' && (face === 'front' || face === 'back')) {
          if (y === 5 || y === 6) return y === 5 ? strap : shift(strap, -0.2);         // strap
          if (face === 'front' && y >= 3 && y <= 9 && (x === 1 || x === 2 || x === 5 || x === 6)) {   // dynamite sticks
            if (y === 3) return hex('#e8d8b0');
            return (x === 1 || x === 5) ? dyn : dynD;
          }
          if (face === 'front' && y === 2 && (x === 1 || x === 5)) return hex('#2a2a2a'); // fuse
        }
        if (part === 'body' && (face === 'right' || face === 'left') && (y === 5 || y === 6)) return strap;
        const k = `${part}:${face}:${x}:${y}`;
        if (pustules.has(k)) return pus[2];
        if (pustules.has(`${part}:${face}:${x - 1}:${y}`) || pustules.has(`${part}:${face}:${x}:${y - 1}`)) return pus[1];
        return null;
      };
      c.face = ((f) => (x, y) => ((x === 1 && y === 1) || (x === 6 && y === 6) ? pus[2] : (x === 2 && y === 1) ? pus[1] : f(x, y)))(c.face);
      c.hairStyle = 'bald';
    }
    if (type === 'necromancer') {
      const robe = hex('#1e1a2a'), robeD = hex('#141020'), trim = hex('#8a3ad8'), glow = hex('#d89aff');
      c.hair = hexes(['#0e0c14', '#16121e', '#1e1a2a', '#2a2438']);    // hood uses hair slots
      c.hairStyle = 'long';
      c.eyeWhite = hex('#08060c'); c.browCol = hex('#8a8474');
      c.face = (x, y) => {
        if ((y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6)) return (y === 4 && (x === 2 || x === 5)) ? glow : hex('#0a0810');
        if (y === 5 && (x === 3 || x === 4)) return hex('#1a1414');                 // nasal cavity
        if (y === 6 && x >= 1 && x <= 6) return x % 2 ? hex('#e8e2cc') : hex('#3a3228'); // teeth
        if (y === 7 && x >= 2 && x <= 5) return hex('#a8a28c');
        if (x === 0 || x === 7) return y > 1 ? robeD : null;
        return y === 2 ? hex('#ece6d2') : null;
      };
      c.skin = hexes(['#7a7462', '#a8a28c', '#d6d0bc', '#ece6d2', '#fbf8ec']);
      c.outfit = {
        shirt: (ring, y, face, x) => {
          if (face === 'front' && (x === 3 || x === 4)) return trim;
          if (face === 'front' && y === 2 && (x === 2 || x === 5)) return glow;      // skull clasp
          return (ring + y) % 5 === 0 ? robeD : robe;
        },
        sleeve: 10, cuff: trim, belt: hex('#3a2a4a'), buckle: hex('#c86aff'), beltY: 7,
        robe, robeTrim: trim, boots: robeD,
        robeCol: (part, face, x, y) => (y % 4 === 2 && x % 2 === 0 ? robeD : robe),
        glove: hex('#b8b29e'), gloveY: 10,
      };
      c.grain = 0.05;
    }
    return render(c).toCanvas();
  });
}

/** The player's heroic adventurer skin. */
export function playerSkin() {
  return memo('player', () => {
    const r = makeRng('player');
    const c = {
      rng: r,
      skin: skinRamp('#e2b08a'),
      hair: hexes(['#2a160c', '#4a2812', '#6e3e1a', '#945a28']),
      hairStyle: 'side', hairSeed: 2, beard: 'chin', stubble: false,
      eye: hex('#3a8ac8'), smile: false, grain: 0.05,
    };
    const tunic = hex('#2f5f9f'), tunicD = hex('#224a80');
    const leather = hex('#7a4a24'), leatherD = hex('#56321a'), gold = hex('#e8c04a');
    c.outfit = {
      shirt: (ring, y, face, x) => {
        if (face === 'front') {
          // diagonal baldric from right shoulder to left hip
          if (Math.abs((7 - x) - y) <= 0 && y < 8) return leatherD;
          if (Math.abs((7 - x) - y) === 1 && y < 8) return leather;
          if (y === 0 && x >= 2 && x <= 5) return x === 3 || x === 4 ? c.skin[1] : tunicD;
        }
        if (face === 'back' && Math.abs(x - y) <= 1 && y < 8) return x - y === 0 ? leatherD : leather;
        return y >= 9 ? tunicD : tunic;
      },
      shoulder: (x, y) => (x < 2 || x > 5 ? leather : tunic),
      sleeveCol: (ring, y) => (y < 3 ? (y === 2 ? leatherD : leather) : tunic),
      sleeve: 6, collar: false,
      belt: hex('#3a2212'), buckle: gold,
      overlay: (face, x, y) => (face === 'front' && y === 9 && x === 5 ? leatherD : face === 'front' && y === 10 && x === 5 ? leather : null),
      pants: hex('#3e3a34'), boots: hex('#5a3418'), bootH: 4,
      glove: hex('#6a3e1e'), gloveY: 8,
    };
    return render(c).toCanvas();
  });
}
