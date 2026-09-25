// Small DOM + icon helpers shared by all UI modules.
import { RESOURCE_LABELS } from '../core/items.js';

// ---- optional modules written by other agents (loaded defensively) -------------------------
const artMods = import.meta.glob('../art/icons.js', { eager: true });
const ART = Object.values(artMods)[0] || null;
const bMods = import.meta.glob('../village/buildings.js', { eager: true });
const BLD = Object.values(bMods)[0] || null;

export const BUILDING_TYPES = BLD?.BUILDING_TYPES || {};
export const BUILDING_ORDER = BLD?.BUILDING_ORDER || Object.keys(BUILDING_TYPES);

/** Create an element: h('div.cls.cls2', {attrs|on*}, children...) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs != null && attrs !== false && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Set text only when it changed (avoids layout churn in per-frame updates). */
export function setText(el, t) { t = String(t); if (el._t !== t) { el._t = t; el.textContent = t; } }
export function setStyle(el, k, v) { const key = '_s_' + k; if (el[key] !== v) { el[key] = v; el.style[k] = v; } }
export function toggle(el, cls, on) { if (!!el['_c_' + cls] !== !!on) { el['_c_' + cls] = !!on; el.classList.toggle(cls, !!on); } }

export function fmtNum(n) {
  n = Math.floor(n || 0);
  if (n >= 100000) return Math.round(n / 1000) + 'к';
  if (n >= 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'к';
  return String(n);
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- icons ------------------------------------------------------------------------------------
const urlCache = new WeakMap();
export function canvasURL(c) {
  if (!c) return '';
  if (ART?.iconURL) { try { return ART.iconURL(c); } catch (e) { /* fall through */ } }
  let u = urlCache.get(c);
  if (!u) { u = c.toDataURL(); urlCache.set(c, u); }
  return u;
}
function tryArt(fn, arg) {
  try { const c = ART?.[fn]?.(arg); if (c && c.width) return c; } catch (e) { /* ignore */ }
  return null;
}
const RES_COLORS = { wood: '#a0692e', stone: '#9a9a9a', food: '#e0b040', iron: '#c8c0b8', coal: '#303030', gold: '#f0c030', crystal: '#b060f0',
  research: '#50c0e0', population: '#e0a070', mana: '#4080ff', health: '#e03030' };
const fallbackCache = new Map();
function fallbackIcon(key, color = '#888', letter = '?') {
  if (fallbackCache.has(key)) return fallbackCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#1a1208'; x.fillRect(2, 2, 12, 12);
  x.fillStyle = color; x.fillRect(3, 3, 10, 10);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(3, 3, 10, 2);
  x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(3, 11, 10, 2);
  x.fillStyle = '#fff'; x.font = 'bold 9px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 8, 8.5);
  fallbackCache.set(key, c);
  return c;
}
export function resourceIcon(res) {
  const a = tryArt('getResourceIcon', res);
  if (a) return canvasURL(a);
  const gm = { health: 'heart', mana: 'mana', research: 'flask', population: 'people', stamina: 'bolt' };
  if (gm[res]) return glyph(gm[res]);
  return canvasURL(fallbackIcon('r_' + res, RES_COLORS[res], (RESOURCE_LABELS[res] || res)[0]));
}
export function itemIcon(id) { return canvasURL(tryArt('getItemSprite', id) || fallbackIcon('i_' + id, '#6a5a8a', (id || '?')[0].toUpperCase())); }
export function blockIcon(id) { return canvasURL(tryArt('getBlockIcon', id) || fallbackIcon('b_' + id, '#7a6a4a', String(id))); }
export function buildingIcon(type) {
  return canvasURL(tryArt('getBuildingIcon', type) || glyph('castle'));
}
export const hasArt = () => !!ART;

/** <img> for a data URL with pixelated rendering. */
export function img(src, cls = 'zc-ico') { const i = new Image(); i.className = cls; i.draggable = false; i.alt = ''; if (src) i.src = src; return i; }

// ---- procedural pixel glyphs for UI chrome ---------------------------------------------------
const PAL = {
  w: '#f4ecd8', s: '#b9b3a6', S: '#6f6a62', D: '#2b241e', g: '#f0c75a', G: '#a8782a', r: '#e04a3c', R: '#8e2320', b: '#5aa0ff', B: '#2a4ea8',
  y: '#ffd84a', o: '#ff9a2e', e: '#7fd34e', E: '#3e8a2a', n: '#9a6a36', N: '#5c3a1a', p: '#b070f0', c: '#6fe0f0', k: '#140e08', h: '#e8b890', l: '#3a6ab0', m: '#b04a3a',
};
const MAPS = {
  pause: ['............', '............', '...ww..ww...', '...ww..ww...', '...ww..ww...', '...ww..ww...', '...ww..ww...', '...ww..ww...', '...ww..ww...', '............', '............', '............'],
  close: ['............', '............', '..ww....ww..', '...ww..ww...', '....wwww....', '.....ww.....', '....wwww....', '...ww..ww...', '..ww....ww..', '............', '............', '............'],
  plus: ['............', '............', '.....ww.....', '.....ww.....', '.....ww.....', '..wwwwwwww..', '..wwwwwwww..', '.....ww.....', '.....ww.....', '.....ww.....', '............', '............'],
  minus: ['............', '............', '............', '............', '............', '..wwwwwwww..', '..wwwwwwww..', '............', '............', '............', '............', '............'],
  check: ['............', '............', '.........ee.', '........eee.', '.......eee..', '.ee...eee...', '.eee.eee....', '..eeeee.....', '...eee......', '....e.......', '............', '............'],
  lock: ['............', '....SSSS....', '...S....S...', '...S....S...', '...S....S...', '..gggggggg..', '..gggDDggg..', '..GggDDggG..', '..GGggDgGG..', '..GGGGGGGG..', '............', '............'],
  heart: ['............', '..rr....rr..', '.rrrr..rrrr.', '.rwrrrrrrrr.', '.rrrrrrrrrr.', '.rrrrrrrrRr.', '..rrrrrrRr..', '...rrrrRr...', '....rrRr....', '.....rr.....', '............', '............'],
  mana: ['............', '.....bb.....', '....bbbb....', '...bwbbbb...', '..bwbbbbbb..', '..bbbbbbBb..', '..bbbbbbBb..', '...bbbbBb...', '....bBBb....', '.....bb.....', '............', '............'],
  bolt: ['............', '......yyy...', '.....yyy....', '....yyy.....', '...yyyyyyy..', '...yyyyyy...', '.....yyy....', '....yyy.....', '...yy.......', '..y.........', '............', '............'],
  sword: ['............', '..........s.', '.........sw.', '........sw..', '.......sw...', '......sw....', '..g..sw.....', '...gsw......', '...ng.......', '..n..g......', '.n..........', '............'],
  hammer: ['............', '..SSSSSS....', '..ssssssS...', '..ssssssS...', '..SSSnSS....', '.....n......', '.....n......', '.....n......', '.....N......', '.....N......', '............', '............'],
  flask: ['............', '....www.....', '.....w......', '.....w......', '....wcw.....', '...wcccw....', '..wcccccw...', '..wcpcccw...', '..wccccpw...', '...wwwww....', '............', '............'],
  home: ['............', '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.RRRRRRRRRR.', '..nnnnnnnn..', '..nnnDDnnn..', '..nnnDDnnn..', '..NNNDDNNN..', '............', '............'],
  skull: ['................', '................', '.....wwwwww.....', '....wwwwwwww....', '...wwwwwwwwww...', '...wwwwwwwwww...', '...wDDwwwwDDw...', '...wDDDwwDDDw...', '...wwwwDDwwww...', '....wwwwwwww....', '.....wDwDwDw....', '.....wwwwwww....', '................', '................', '................', '................'],
  castle: ['................', '.s.s.s....s.s.s.', '.sssss....sssss.', '.ssDss....ssDss.', '.sssss....sssss.', '.ssssss..ssssss.', '.ssssssssssssss.', '.sssssssssssssss', '.ssssssNNssssss.', '.sssssNNNNsssss.', '.sssssNNNNsssss.', '.sssssNNNNsssss.', '.SSSSSNNNNSSSSS.', '................', '................', '................'],
  people: ['................', '..........hh....', '....hh...hhhh...', '...hhhh..hhhh...', '...hhhh...hh....', '....hh...llll...', '...mmmm.llllll..', '..mmmmmm.llllll.', '..mmmmmm.llllll.', '..mmmmmm.llllll.', '...mmmm...llll..', '...m..m...l..l..', '...N..N...N..N..', '................', '................', '................'],
  book: ['............', '............', '..rrrrrrrr..', '..rwwwwwwr..', '..rwssssrr..', '..rwwwwwwr..', '..rwssssrr..', '..rwwwwwwr..', '..RRRRRRRR..', '............', '............', '............'],
  flag: ['............', '..n.........', '..nrrrrrr...', '..nrrrrrrr..', '..nrrrrrr...', '..nrrrrr....', '..n.........', '..n.........', '..n.........', '..N.........', '............', '............'],
  pick: ['............', '...ssss.....', '..s....s....', '.s....n.s...', '.s...n...s..', '.....n......', '....n.......', '...n........', '..N.........', '.N..........', '............', '............'],
  sickle: ['............', '....yyyy....', '...y....y...', '........y...', '........y...', '.......y....', '......y.....', '.....n......', '....n.......', '...N........', '............', '............'],
  anvil: ['............', '............', '.SSSSSSSSS..', '..sssssssss.', '...sssssss..', '....sss.....', '....sss.....', '...SSSSS....', '..SSSSSSS...', '............', '............', '............'],
  shield: ['............', '..bbbbbbbb..', '..bgbbbbgb..', '..bbbggbbb..', '..bbggggbb..', '..bbbggbbb..', '...bbbbbb...', '...bbbbbb...', '....bbbb....', '.....bb.....', '............', '............'],
  star: ['............', '.....yy.....', '.....yy.....', '....yyyy....', '.yyyyyyyyyy.', '..yyyyyyyy..', '...yyyyyy...', '...yyyyyy...', '..yyy..yyy..', '..yy....yy..', '............', '............'],
  axe: ['............', '....ss......', '...sssn.....', '...ssnn.....', '....n.n.....', '.....n......', '......n.....', '.......n....', '........N...', '.........N..', '............', '............'],
  zzz: ['............', '..wwww......', '....w.......', '...w........', '..wwww......', '......www...', '.......w....', '......www...', '............', '............', '............', '............'],
  eye: ['............', '............', '...wwwwww...', '..ww.bb.ww..', '.ww.bDDb.ww.', '..ww.bb.ww..', '...wwwwww...', '............', '............', '............', '............', '............'],
  staff: ['............', '.........ppp', '........pcp.', '........ppp.', '.......n....', '......n.....', '.....n......', '....n.......', '...n........', '..N.........', '............', '............'],
};
const glyphCache = new Map();
function rasterFromMap(rows) {
  const n = Math.max(rows.length, ...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  const filled = (i, j) => j >= 0 && i >= 0 && j < rows.length && i < (rows[j]?.length || 0) && rows[j][i] !== '.';
  // outline pass
  x.fillStyle = PAL.k;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (filled(i, j)) continue;
    if (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1)) x.fillRect(i, j, 1, 1);
  }
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i]; if (ch === '.') continue;
    x.fillStyle = PAL[ch] || '#f0f';
    x.fillRect(i, j, 1, 1);
    // gentle vertical shading
    const shade = (j / n) * 0.28;
    if (shade > 0.02) { x.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`; x.fillRect(i, j, 1, 1); }
  }
  return c;
}
function rasterFn(n, fn) {
  const rows = [];
  for (let j = 0; j < n; j++) { let r = ''; for (let i = 0; i < n; i++) r += fn(i + 0.5, j + 0.5) || '.'; rows.push(r); }
  return rasterFromMap(rows);
}
const PROC = {
  sun: () => rasterFn(16, (x, y) => {
    const dx = x - 8, dy = y - 8, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (r < 3.6) return r < 2.2 ? 'w' : 'y';
    if (r < 6.8 && r > 4.6 && Math.abs(Math.sin(a * 4)) > 0.82) return 'o';
    return null;
  }),
  moon: () => rasterFn(16, (x, y) => {
    const r1 = Math.hypot(x - 8, y - 8), r2 = Math.hypot(x - 10.5, y - 6.5);
    if (r1 < 5.5 && r2 > 4.6) return r1 > 4.2 ? 'S' : 's';
    return null;
  }),
  gear: () => rasterFn(16, (x, y) => {
    const dx = x - 8, dy = y - 8, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const tooth = Math.cos(a * 8) > 0.35;
    if (r < 2.2) return null;
    if (r < 5 || (tooth && r < 7)) return r < 3.4 ? 'S' : 's';
    return null;
  }),
  rotate: () => rasterFn(16, (x, y) => {
    const dx = x - 8, dy = y - 8, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    // arrow head near angle -0.3 (upper right)
    const hx = 12.8, hy = 4.4;
    if (y < 7.5 && x > 9.5 && Math.abs(x - hx) + Math.abs(y - hy) < 3.2) return 'w';
    if (r > 3.4 && r < 5.6 && !(a > -1.3 && a < 0.1)) return 'w';
    return null;
  }),
  play: () => rasterFn(12, (x, y) => (x > 3.5 && x < 10 && Math.abs(y - 6) < (10 - x) * 0.62 ? 'w' : null)),
  clock: () => rasterFn(12, (x, y) => {
    const r = Math.hypot(x - 6, y - 6);
    if (r < 4.8) { if ((Math.abs(x - 6) < 0.6 && y < 6.5 && y > 2.5) || (Math.abs(y - 6) < 0.6 && x > 5.5 && x < 8.8)) return 'D'; return 'w'; }
    return null;
  }),
};
/** Pixel glyph data URL by name. */
export function glyph(name) {
  if (glyphCache.has(name)) return glyphCache.get(name);
  let c = null;
  if (MAPS[name]) c = rasterFromMap(MAPS[name]);
  else if (PROC[name]) c = PROC[name]();
  else c = fallbackIcon('g_' + name, '#555', name[0]);
  const u = c.toDataURL();
  glyphCache.set(name, u);
  return u;
}
export function glyphImg(name, cls = 'zc-ico') { return img(glyph(name), cls); }

// Soft noise texture for panels (generated once).
export function noiseURL() {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d');
  const d = x.createImageData(96, 96);
  let s = 1234567;
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 18;
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL();
}

export const JOB_LABELS = {
  idle: 'Без дела', builder: 'Строитель', woodcutter: 'Лесоруб', farmer: 'Фермер', miner: 'Шахтёр',
  blacksmith: 'Кузнец', researcher: 'Учёный', guard: 'Стражник', mage: 'Маг',
};
export const JOB_PLURAL = {
  idle: 'Без дела', builder: 'Строители', woodcutter: 'Лесорубы', farmer: 'Фермеры', miner: 'Шахтёры',
  blacksmith: 'Кузнецы', researcher: 'Учёные', guard: 'Стражники', mage: 'Маги',
};
export const JOB_ORDER = ['builder', 'woodcutter', 'farmer', 'miner', 'blacksmith', 'researcher', 'guard', 'mage', 'idle'];
const JOB_ICON = { builder: ['item', 'build_hammer', 'hammer'], woodcutter: ['item', 'axe_stone', 'axe'], farmer: ['res', 'food', 'sickle'], miner: ['item', 'pickaxe_stone', 'pick'],
  blacksmith: ['g', 'anvil'], researcher: ['res', 'research', 'flask'], guard: ['item', 'sword_iron', 'sword'], mage: ['item', 'staff_fire', 'staff'], idle: ['g', 'zzz'] };
export function jobIcon(job) {
  const d = JOB_ICON[job] || ['g', 'people'];
  if (d[0] === 'g') return glyph(d[1]);
  if (ART) return d[0] === 'item' ? itemIcon(d[1]) : resourceIcon(d[1]);
  return glyph(d[2]);
}
export const STATE_LABELS = { planned: 'Запланировано', constructing: 'Строится', complete: 'Готово', destroyed: 'Разрушено' };

/** Resource cost row: [{icon, n, ok}] */
export function costRow(state, cost, cls = 'zc-cost') {
  const row = h('div.' + cls.replace(/ /g, '.'));
  for (const k in cost || {}) {
    if (!cost[k]) continue;
    const ok = (state?.resources?.[k] || 0) >= cost[k];
    row.appendChild(h('span.zc-cost-item' + (ok ? '' : '.bad'), { title: RESOURCE_LABELS[k] || k }, img(resourceIcon(k)), fmtNum(cost[k])));
  }
  return row;
}
