// Dungeons of deep worlds, in the spirit of the best Minecraft dungeon mods — small, medium, big and (very rarely) huge:
//   • small crypts and hideouts (2×2 or 3×3 rooms) just under the surface or in the caves, a shrine over the way in;
//   • medium dungeons (4×4 rooms, one or two storeys);
//   • crypts — catacombs of two or three storeys in the cavern layer (a maze of 6×6 rooms per floor joined by corridors);
//   • great catacombs — three or four storeys of 7×7 rooms, the biggest of them all;
//   • fortresses over the lava sea of the underworld;
//   • ruined castles on the surface — a curtain wall with corner towers and a gate around a keep of two or three
//     storeys of halls, bridges between them and a lord of the dead in the throne room at the top.
// Rooms have a purpose — spawner halls, libraries, tombs, prisons, armouries, barracks, spider nests, lava-trap
// rooms, a treasure vault and the boss hall — and a ruined shrine on the surface marks a crypt's ladder shaft down.
//   • the Abyss — very rare: five storeys of 8×8 rooms with two lords of the dead;
//   • abandoned villages on the surface: crumbling houses, a farm gone wild, a well, chests and the dead who stayed.
// Every underground dungeon has a theme from where it lies — flooded, icy, sandy, overgrown, mushroom, crystal,
// spider, bone, ember or plain stone — with its own walls, floors, dwellers, lord, a few rooms of its own and a name,
// told to the player who walks in.
// The dungeons are planned once per 144×144 region from the world seed (a big one, a village and a few small ones,
// never overlapping); every chunk draws its own part of them, so they are seamless and independent of chunk order.
// Where a cave runs into an underground dungeon, its walls are left broken open; a castle levels its ground, stands on
// a foundation and its walls are crumbling.
import { B } from '../core/blocks.js';
import { mulberry32, hash2 } from '../core/rng.js';
import { BUILDING_TYPES } from '../village/buildings.js';

const R = 144;           // region size
const C = 15;            // cell size (room + corridor)
const H = 5;             // room interior height
const FLOOR_GAP = 9;     // between the floors of a catacomb
const CASTLE_GAP = H + 1; // castle storeys stand right on top of each other
const RING = 5;          // a castle's curtain wall stands this far outside its keep

const CRYPT_SPAWNS = ['skeleton', 'cave_dweller', 'walker', 'cave_spider'];
const HELL_SPAWNS = ['imp', 'magma_golem', 'burning'];
const CASTLE_SPAWNS = ['skeleton', 'armored', 'walker', 'runner', 'skeleton'];

// themes of the underground dungeons: walls ([share, block]…), floors, light, dwellers, lord, name (m / f / n / plural)
const THEMES = {
  stone: { walls: [[0.55, B.STONE_BRICKS], [0.75, B.CRACKED_BRICKS], [0.9, B.MOSSY_COBBLE], [1, B.DARK_STONE]], floor: [B.STONE_BRICKS, B.COBBLESTONE], light: B.LANTERN,
    spawns: CRYPT_SPAWNS, boss: 'lich', adj: ['Каменный', 'Каменная', 'Каменное', 'Каменные'] },
  bone: { walls: [[0.45, B.DARK_STONE], [0.7, B.CRACKED_BRICKS], [0.93, B.STONE_BRICKS], [1, B.SKULL_BLOCK]], floor: [B.GRAVEL, B.DARK_STONE], light: B.LANTERN,
    spawns: ['skeleton', 'skeleton', 'walker', 'crawler'], boss: 'lich', adj: ['Костяной', 'Костяная', 'Костяное', 'Костяные'] },
  flooded: { walls: [[0.5, B.MOSSY_COBBLE], [0.8, B.STONE_BRICKS], [1, B.CRACKED_BRICKS]], floor: [B.MOSSY_COBBLE, B.GRAVEL], light: B.LANTERN,
    spawns: ['walker', 'slime', 'cave_dweller'], boss: 'giant', adj: ['Затопленный', 'Затопленная', 'Затопленное', 'Затопленные'] },
  overgrown: { walls: [[0.6, B.MOSSY_COBBLE], [0.85, B.STONE_BRICKS], [1, B.MUD]], floor: [B.JUNGLE_GRASS, B.MUD], light: B.LANTERN,
    spawns: ['cave_spider', 'slime', 'leaper'], boss: 'brute', adj: ['Заросший', 'Заросшая', 'Заросшее', 'Заросшие'] },
  mushroom: { walls: [[0.5, B.DARK_STONE], [0.85, B.MOSSY_COBBLE], [1, B.STONE_BRICKS]], floor: [B.GLOW_MOSS, B.DARK_STONE], light: B.GLOW_MUSHROOM,
    spawns: ['slime', 'cave_dweller', 'crawler'], boss: 'giant', adj: ['Грибной', 'Грибная', 'Грибное', 'Грибные'] },
  crystal: { walls: [[0.6, B.STONE_BRICKS], [0.85, B.DARK_STONE], [0.95, B.AMETHYST], [1, B.CRYSTAL_ORE]], floor: [B.STONE_BRICKS, B.AMETHYST], light: B.LANTERN,
    spawns: ['skeleton', 'armored', 'frost'], boss: 'necromancer', adj: ['Кристальный', 'Кристальная', 'Кристальное', 'Кристальные'] },
  ice: { walls: [[0.5, B.PACKED_ICE], [0.8, B.STONE_BRICKS], [1, B.ICE]], floor: [B.SNOW, B.PACKED_ICE], light: B.LANTERN,
    spawns: ['frost', 'frost', 'skeleton', 'armored'], boss: 'giant', adj: ['Ледяной', 'Ледяная', 'Ледяное', 'Ледяные'] },
  sand: { walls: [[0.7, B.SANDSTONE], [0.9, B.STONE_BRICKS], [1, B.GOLD_ORE]], floor: [B.SAND, B.SANDSTONE], light: B.LANTERN,
    spawns: ['walker', 'burning', 'skeleton'], boss: 'necromancer', adj: ['Песчаный', 'Песчаная', 'Песчаное', 'Песчаные'] },
  web: { walls: [[0.6, B.DARK_STONE], [0.9, B.CRACKED_BRICKS], [1, B.STONE]], floor: [B.GRAVEL, B.DARK_STONE], light: B.LANTERN,
    spawns: ['cave_spider', 'cave_spider', 'skeleton'], boss: 'brute', adj: ['Паучий', 'Паучья', 'Паучье', 'Паучьи'] },
  ember: { walls: [[0.45, B.DARK_STONE], [0.75, B.OBSIDIAN], [0.9, B.STONE_BRICKS], [1, B.MAGMA]], floor: [B.DARK_STONE, B.MAGMA], light: B.MAGMA,
    spawns: ['burning', 'imp', 'skeleton'], boss: 'lich', adj: ['Огненный', 'Огненная', 'Огненное', 'Огненные'] },
};
const GENDER = { m: 0, f: 1, n: 2, pl: 3 };
const NOUNS = {
  small: [['склеп', 'm'], ['тайник', 'm'], ['погреб', 'm'], ['грот', 'm']],
  medium: [['подземелье', 'n'], ['святилище', 'n'], ['темница', 'f'], ['усыпальница', 'f']],
  large: [['катакомбы', 'pl'], ['некрополь', 'm'], ['лабиринт', 'm'], ['чертоги', 'pl']],
};
const OF = ['забытого короля', 'тысячи костей', 'павшего ордена', 'безымянных', 'чёрного епископа', 'проклятых шахтёров', 'последнего мага',
  'семи печатей', 'вечной ночи', 'утонувших', 'серых сестёр', 'мёртвого купца', 'старого культа', 'пропавшей экспедиции', 'шепчущих теней', 'алого дракона'];
const VILLAGE_NAMES = ['Глухово', 'Пустошки', 'Мёртвый Яр', 'Тихая Заводь', 'Чёрный Брод', 'Погорелово', 'Ветряки', 'Совиный Лог', 'Каменный Ручей', 'Забытая Пристань', 'Горелый Бор', 'Ивняки'];

export class Dungeons {
  constructor(gen) { this.gen = gen; this.cache = new Map(); }

  /** The dungeon of a region (the biggest one there), or null. */
  plan(rx, rz) { return this.plans(rx, rz)[0] || null; }
  /** Every dungeon of a region: maybe a big one, maybe an abandoned village, and a few small and medium ones. */
  plans(rx, rz) {
    const key = rx + ',' + rz;
    if (this.cache.has(key)) return this.cache.get(key);
    const gen = this.gen, seed = gen.seed, world = gen.world, L = gen.L, sea = gen.sea;
    const out = [];
    this.cache.set(key, out);
    const x0 = rx * R, z0 = rz * R;
    if (x0 < 12 || z0 < 12 || x0 + R > world.size - 12 || z0 + R > world.size - 12) return out;
    const mid = gen.column(x0 + R / 2, z0 + R / 2);
    if (mid.dist < 110) return out;                         // the player's home stays free
    const taken = [];                                       // [x0, z0, x1, z1] of what is placed
    const free = (a, b, w, d, m = 8) => !taken.some(([p, q, r, t]) => a - m < r && a + w + m > p && b - m < t && b + d + m > q);
    const place = (S, salt, pad = 0) => {
      for (let k = 0; k < 12; k++) {
        const ox = x0 + 12 + pad + Math.floor(hash2(rx * 13 + k, rz * 7 + salt, seed + 901) * Math.max(1, R - S - 24 - 2 * pad));
        const oz = z0 + 12 + pad + Math.floor(hash2(rx * 5 - k, rz * 11 + salt, seed + 902) * Math.max(1, R - S - 24 - 2 * pad));
        if (free(ox - pad, oz - pad, S + 2 * pad, S + 2 * pad)) { taken.push([ox - pad, oz - pad, ox + S + pad, oz + S + pad]); return [ox, oz]; }
      }
      return null;
    };
    const themeAt = (x, z, deep) => {
      const c = gen.column(x, z), zn = gen.zone(x, z, c.b);
      const byZone = { 1: 'mushroom', 2: 'overgrown', 3: 'ice', 4: 'sand', 5: 'crystal', 6: 'web' }[zn];
      if (byZone && hash2(x, z, seed + 905) < 0.75) return byZone;
      const pool = deep ? ['stone', 'bone', 'ember', 'flooded', 'crystal'] : ['stone', 'bone', 'flooded', 'overgrown', 'web'];
      return pool[Math.floor(hash2(z, x, seed + 906) * pool.length)];
    };
    const cavY = (floors, salt) => L.cavBot + 12 + (floors - 1) * FLOOR_GAP + Math.floor(hash2(rx + salt, rz, seed + 903) * (L.cavTop - L.cavBot - 52 - (floors - 1) * FLOOR_GAP));
    const roll = hash2(rx, rz, seed + 900), f2 = hash2(rx, rz, seed + 904);
    // the big one (most regions have none: the small ones are what you mostly find)
    if (roll < 0.008 && mid.dist > 260) {
      const S = 8 * C, at = place(S, 1);
      if (at) out.push(this._make('crypt', rx, rz, at[0], at[1], cavY(5, 1), 5, 8, { super: true, theme: themeAt(at[0] + S / 2, at[1] + S / 2, true), size: 'large', salt: 1 }));
    } else if (roll < 0.17) {
      const n = f2 < 0.4 ? 7 : 6, floors = n === 7 ? (f2 < 0.15 ? 4 : 3) : (f2 < 0.7 ? 3 : 2), S = n * C, at = place(S, 1);
      if (at) out.push(this._make('crypt', rx, rz, at[0], at[1], cavY(floors, 1), floors, n, { theme: themeAt(at[0] + S / 2, at[1] + S / 2, true), size: 'large', salt: 1 }));
    } else if (roll < 0.25) {
      const n = f2 < 0.5 ? 6 : 5, S = n * C, at = place(S, 1);
      if (at) out.push(this._make('fortress', rx, rz, at[0], at[1], 28, 1, n, { salt: 1 }));
    } else if (roll < 0.35 && mid.dist > 170) {
      const n = f2 < 0.5 ? 5 : 4, S = n * C, at = place(S, 1, RING + 3);
      const y0 = at ? this._castleSite(at[0], at[1], S) : null;
      if (y0 !== null) out.push(this._make('castle', rx, rz, at[0], at[1], y0, f2 < 0.35 ? 3 : 2, n, { salt: 1 }));
      else if (at) taken.pop();
    }
    // an abandoned village
    if (hash2(rx, rz, seed + 907) < 0.3 && mid.dist > 190) {
      const S = 56, at = place(S, 3);
      const v = at ? this._village(rx, rz, at[0], at[1], S) : null;
      if (v) out.push(v); else if (at) taken.pop();
    }
    // small and medium dungeons: one to three, near the surface or down in the caves
    const extras = 1 + Math.floor(hash2(rx, rz, seed + 908) * 3);
    for (let e = 0; e < extras; e++) {
      const salt = 10 + e, r2 = hash2(rx + e * 7, rz - e, seed + 909);
      const n = r2 < 0.35 ? 2 : r2 < 0.7 ? 3 : 4, size = n === 4 || (n === 3 && r2 > 0.55) ? 'medium' : 'small', floors = n === 4 && r2 > 0.88 ? 2 : 1;
      const S = n * C, at = place(S, salt);
      if (!at) continue;
      const cx = at[0] + S / 2, cz = at[1] + S / 2, h = gen.column(cx, cz).h;
      // the small ones mostly just under the surface (a shrine marks the way down), the medium ones deeper
      const shallow = size === 'small' && hash2(rx, rz + e, seed + 910) < 0.6 && h > sea - 2;
      const y0 = shallow ? Math.min(h - 12, sea - 6) - Math.floor(hash2(rx - e, rz, seed + 911) * 8) : cavY(floors, salt);
      out.push(this._make('crypt', rx, rz, at[0], at[1], y0, floors, n, { theme: themeAt(cx, cz, !shallow), size, salt, shallow }));
    }
    return out;
  }

  /** Floor height for a castle over this square, or null when the land is wet, too rugged or a town is near. */
  _castleSite(ox, oz, S) {
    const gen = this.gen, sea = gen.sea;
    const cx = ox + S / 2, cz = oz + S / 2;
    for (const s of gen.sites || []) if (Math.hypot(s.x - cx, s.z - cz) < S / 2 + RING + 100) return null;
    const hs = [];
    let wet = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const c = gen.column(Math.round(ox - RING + (S + 2 * RING) * i / 4), Math.round(oz - RING + (S + 2 * RING) * j / 4));
      if (c.h <= sea + 1 || c.b === 8) wet++;            // a pond or a creek is filled in by the foundation
      hs.push(c.h);
    }
    if (wet > 5) return null;
    hs.sort((a, b) => a - b);
    if (hs[hs.length - 2] - hs[1] > 16) return null;
    const y0 = Math.max(hs[hs.length >> 1], sea + 2) + 1;
    return y0 + 3 * CASTLE_GAP + 12 < gen.world.height - 4 ? y0 : null;
  }

  _make(kind, rx, rz, ox, oz, y0, floors, n, opts = {}) {
    const gen = this.gen, salt = opts.salt || 0;
    const rnd = mulberry32((gen.seed ^ Math.imul(rx + 31, 2654435761) ^ Math.imul(rz + 17, 40503) ^ Math.imul(salt + 7, 374761393)) >>> 0);
    const castle = kind === 'castle';
    const d = { kind, rx, rz, ox, oz, n, shells: [], inner: [], decos: [], clear: [], found: [], key: 'boss:' + rx + ',' + rz + (salt ? ':' + salt : ''),
      theme: kind === 'crypt' ? (opts.theme || 'stone') : null, size: opts.size || 'large', super: !!opts.super, shallow: !!opts.shallow };
    d.T = d.theme ? THEMES[d.theme] : null;
    d.name = this._name(d, rnd);
    const levels = [];
    for (let f = 0; f < floors; f++) {
      const y = castle ? y0 + f * CASTLE_GAP : y0 - f * FLOOR_GAP;
      // rooms: one per cell, random size (a castle's storeys keep the footprint of the halls below)
      const rooms = [];
      for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
        const below = castle && f > 0 ? levels[0].at(gx, gz) : null;
        const w = below ? below.x1 - below.x0 : 6 + 2 * Math.floor(rnd() * 3), dd = below ? below.z1 - below.z0 : 6 + 2 * Math.floor(rnd() * 3);
        const cx = ox + gx * C + (C >> 1), cz = oz + gz * C + (C >> 1);
        rooms.push({ gx, gz, f, y, x0: cx - (w >> 1), x1: cx + (w >> 1), z0: cz - (dd >> 1), z1: cz + (dd >> 1), cx, cz, type: 'plain', h: H, links: [] });
      }
      // a maze over the cells (depth-first), plus a few loops
      const at = (gx, gz) => (gx >= 0 && gz >= 0 && gx < n && gz < n ? rooms[gz * n + gx] : null);
      const seen = new Set(), stack = [at(Math.floor(rnd() * n), Math.floor(rnd() * n))];
      seen.add(stack[0]);
      while (stack.length) {
        const r = stack[stack.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => at(r.gx + a, r.gz + b)).filter(o => o && !seen.has(o));
        if (!nb.length) { stack.pop(); continue; }
        const o = nb[Math.floor(rnd() * nb.length)];
        r.links.push(o); o.links.push(r); seen.add(o); stack.push(o);
      }
      for (const r of rooms) for (const [a, b] of [[1, 0], [0, 1]]) {
        const o = at(r.gx + a, r.gz + b);
        if (o && !r.links.includes(o) && rnd() < 0.2) { r.links.push(o); o.links.push(r); }
      }
      levels.push({ y, rooms, at });
    }
    // room purposes: the entrance on the first floor (a castle's faces its gate on the north side)
    const top = levels[0], last = levels[levels.length - 1];
    const entrance = top.at(Math.floor(rnd() * n), castle ? 0 : Math.floor(rnd() * n));
    entrance.type = 'entrance';
    // a ladder from every floor to the next one
    let arrive = entrance;
    const ladders = [];
    for (let f = 0; f + 1 < floors; f++) {
      const cands = levels[f].rooms.filter(r => r.type === 'plain' && r !== arrive);
      const s = cands[Math.floor(rnd() * cands.length)];
      s.type = 'stairs';
      const s2 = levels[f + 1].at(s.gx, s.gz);
      s2.type = 'stairs_down';
      ladders.push([s, s2]);
      arrive = s2;
    }
    // the boss hall and the vault: farthest from where you arrive on the last floor
    const dist = new Map([[arrive, 0]]), q = [arrive];
    while (q.length) { const r = q.shift(); for (const o of r.links) if (!dist.has(o)) { dist.set(o, dist.get(r) + 1); q.push(o); } }
    const far = last.rooms.filter(r => r.type === 'plain').sort((a, b) => dist.get(b) - dist.get(a));
    const bigRoom = (b, t) => { b.type = t; b.h = 8; b.x0 = b.cx - 6; b.x1 = b.cx + 6; b.z0 = b.cz - 6; b.z1 = b.cz + 6; };
    if (far[0] && n >= 3) bigRoom(far[0], 'boss');
    else if (far[0]) far[0].type = 'vault';                   // a small crypt keeps a treasure, not a lord
    if (far[1]) far[1].type = 'vault';
    if (far[2] && floors > 2) far[2].type = 'vault';
    if (d.super) {
      // the Abyss: a second lord halfway down and more treasure
      const mid = levels[floors >> 1].rooms.filter(r => r.type === 'plain');
      if (mid[0]) { bigRoom(mid[0], 'boss'); mid[0].bossKey = d.key + ':mid'; }
      for (const r of far.slice(3, 6)) r.type = 'vault';
    }
    const kinds = kind === 'fortress' ? ['spawner', 'spawner', 'armory', 'trap', 'prison', 'plain', 'library']
      : castle ? ['spawner', 'spawner', 'barracks', 'armory', 'library', 'prison', 'tombs', 'trap', 'plain']
        : ['spawner', 'spawner', 'library', 'tombs', 'prison', 'armory', 'trap', 'nest', 'plain', 'fountain', 'altar', 'storeroom', 'mine', 'garden'];
    for (const lv of levels) for (const r of lv.rooms) if (r.type === 'plain') r.type = kinds[Math.floor(rnd() * kinds.length)];
    // a castle stands on levelled ground inside its curtain wall
    if (castle) this._castleGround(d, y0, floors);
    // draw lists
    for (const lv of levels) {
      for (const r of lv.rooms) this._room(d, r, rnd);
      for (const r of lv.rooms) for (const o of r.links) if (o.gx > r.gx || o.gz > r.gz) this._corridor(d, r, o, rnd);
    }
    d.rooms = levels.flatMap(l => l.rooms).map(r => ({ type: r.type, cx: r.cx, cz: r.cz, y: r.y, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, h: r.h }));
    this._entrance(d, entrance, rnd);
    for (const [a, b] of ladders) this._ladder(d, a.cx + 2, a.cz + 2, Math.min(a.y, b.y), Math.max(a.y, b.y) - 1);
    if (castle) this._curtain(d, entrance, y0, rnd);
    // the space the dungeon takes (music, trees)
    const ys = levels.map(l => l.y), pad = castle ? RING + 3 : 1;
    d.box = { x0: ox - pad, z0: oz - pad, x1: ox + n * C + pad, z1: oz + n * C + pad, y0: Math.min(...ys) - 2, y1: Math.max(...ys) + (castle ? 10 : 9) };
    return d;
  }

  // ---- building blocks of the plan
  _shell(d, x0, y0, z0, x1, y1, z1, ruin = d.kind === 'castle') { d.shells.push({ x0, y0, z0, x1, y1, z1, ruin }); }
  _air(d, x0, y0, z0, x1, y1, z1, id = B.AIR) { d.inner.push({ x0, y0, z0, x1, y1, z1, id }); }
  _deco(d, x, y, z, id, meta) { d.decos.push({ x, y, z, id, meta }); }

  _room(d, r, rnd) {
    const y = r.y, hell = d.kind === 'fortress', castle = d.kind === 'castle';
    this._shell(d, r.x0 - 1, y - 1, r.z0 - 1, r.x1 + 1, y + r.h, r.z1 + 1);
    this._air(d, r.x0, y, r.z0, r.x1, y + r.h - 1, r.z1);
    // pillars under fortress rooms, down into the lava sea
    if (hell) for (const [x, z] of [[r.x0 - 1, r.z0 - 1], [r.x1 + 1, r.z0 - 1], [r.x0 - 1, r.z1 + 1], [r.x1 + 1, r.z1 + 1], [r.cx, r.z0 - 1], [r.cx, r.z1 + 1]]) this._air(d, x, 4, z, x, y - 2, z, B.OBSIDIAN);
    // castle halls get arrow-slit windows
    if (castle) for (let x = r.x0 + 1; x < r.x1; x += 3) for (const z of [r.z0 - 1, r.z1 + 1]) if (rnd() < 0.5) this._deco(d, x, y + 2, z, B.IRON_BARS);
    const deco = (x, yy, z, id, meta) => this._deco(d, x, yy, z, id, meta);
    const pool = hell ? HELL_SPAWNS : castle ? CASTLE_SPAWNS : d.T?.spawns || CRYPT_SPAWNS;
    const spawnType = () => pool[Math.floor(rnd() * pool.length)];
    const light = hell ? B.MAGMA : d.T?.light || B.LANTERN;
    const wallLamp = () => { deco(r.x0 - 1, y + 2, r.cz, light); deco(r.x1 + 1, y + 2, r.cz, light); };
    const corners = (id, k = 1) => { for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) for (let i = 0; i < k; i++) deco(x, y + r.h - 1 - i, z, id); };
    switch (r.type) {
      case 'entrance':
        wallLamp(); deco(r.cx, y + r.h - 1, r.cz, light);
        deco(r.x0 + 1, y, r.z1 - 1, B.SKULL_BLOCK);
        if (castle) { deco(r.x0, y + 2, r.z0, B.BANNER); deco(r.x1, y + 2, r.z0, B.BANNER); }
        break;
      case 'stairs': case 'stairs_down':
        wallLamp();
        break;
      case 'spawner':
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: spawnType(), cap: 3 } });
        corners(B.COBWEB, 2);
        for (let k = 0; k < 3; k++) deco(r.x0 + 1 + Math.floor(rnd() * (r.x1 - r.x0 - 1)), y, r.z0 + Math.floor(rnd() * 2) * (r.z1 - r.z0), B.SKULL_BLOCK);
        if (rnd() < 0.6) deco(r.x1 - 1, y, r.z1 - 1, B.CHEST, { tier: 'dungeon' });
        deco(r.x0 - 1, y + 2, r.cz, light);
        break;
      case 'library':
        for (let x = r.x0; x <= r.x1; x++) for (const z of [r.z0, r.z1]) if (x !== r.cx) { deco(x, y, z, B.BOOKSHELF); deco(x, y + 1, z, B.BOOKSHELF); deco(x, y + 2, z, rnd() < 0.5 ? B.BOOKSHELF : B.COBWEB); }
        deco(r.cx, y, r.cz, B.ARCANE_TABLE);
        deco(r.cx + 1, y, r.cz, B.CHEST, { tier: 'dungeon' });
        deco(r.cx, y + r.h - 1, r.cz, B.LANTERN);
        break;
      case 'tombs':
        for (let x = r.x0 + 1; x <= r.x1 - 1; x += 2) for (const z of [r.z0 + 1, r.z1 - 2]) { deco(x, y, z, B.STONE_BRICKS); deco(x, y, z + 1, B.STONE_BRICKS); deco(x, y + 1, z, B.SKULL_BLOCK); }
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: hell ? 'burning' : 'skeleton', cap: 3 } });
        deco(r.x0 + 1, y, r.cz, B.CHEST, { tier: 'dungeon' });
        corners(B.COBWEB);
        break;
      case 'prison':
        for (let x = r.x0; x <= r.x1; x++) { deco(x, y, r.cz - 1, B.IRON_BARS); deco(x, y + 1, r.cz - 1, B.IRON_BARS); deco(x, y + 2, r.cz - 1, B.IRON_BARS); }
        for (let x = r.x0 + 2; x < r.x1; x += 3) for (let k = 0; k < 3; k++) deco(x, y + k, r.z0, B.IRON_BARS);
        deco(r.cx, y, r.z0 + 1, B.SPAWNER, { spawner: { type: hell ? 'magma_golem' : castle ? 'armored' : 'cave_dweller', cap: 2 } });
        deco(r.x0, y, r.z0, B.CHEST, { tier: 'dungeon' });
        corners(B.COBWEB, 2);
        wallLamp();
        break;
      case 'armory':
        for (const x of [r.x0, r.x1]) for (let z = r.z0 + 1; z < r.z1; z += 2) { deco(x, y, z, B.IRON_BLOCK); deco(x, y + 1, z, B.IRON_BARS); }
        deco(r.cx, y, r.cz, B.IRON_BLOCK);
        deco(r.cx - 1, y, r.z0, B.CHEST, { tier: 'dungeon' }); deco(r.cx + 1, y, r.z0, B.CHEST, { tier: 'dungeon' });
        deco(r.cx, y + r.h - 1, r.cz, light);
        break;
      case 'barracks':
        // rows of bunks, a long table, the garrison that never left
        for (let x = r.x0; x <= r.x1; x += 2) { deco(x, y, r.z0, B.BED); deco(x, y, r.z1, B.BED); }
        for (let x = r.x0 + 2; x <= r.x1 - 2; x++) deco(x, y, r.cz, B.PLANKS);
        deco(r.x1, y, r.cz, B.CHEST, { tier: 'dungeon' });
        deco(r.cx, y, r.cz + 2, B.SPAWNER, { spawner: { type: 'armored', cap: 3 } });
        deco(r.x0, y + 2, r.cz, B.BANNER);
        wallLamp();
        break;
      case 'trap':
        // the floor is a lava pit with one narrow bridge to a chest
        this._air(d, r.x0, y - 1, r.z0, r.x1, y - 1, r.z1, B.LAVA);
        this._air(d, r.x0, y - 2, r.z0, r.x1, y - 2, r.z1, B.OBSIDIAN);
        this._air(d, r.cx, y - 1, r.z0, r.cx, y - 1, r.z1, hell ? B.OBSIDIAN : B.STONE_BRICKS);
        this._air(d, r.x0, y - 1, r.cz, r.x1, y - 1, r.cz, hell ? B.OBSIDIAN : B.STONE_BRICKS);
        deco(r.cx, y, r.cz, B.CHEST, { tier: 'vault' });
        break;
      case 'nest':
        for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) for (let k = 0; k < r.h; k++) if (hash2(x * 7 + k, z * 3 - k, this.gen.seed + 950) < 0.18) deco(x, y + k, z, B.COBWEB);
        deco(r.cx - 2, y, r.cz, B.SPAWNER, { spawner: { type: 'cave_spider', cap: 3 } });
        deco(r.cx + 2, y, r.cz, B.SPAWNER, { spawner: { type: 'cave_spider', cap: 2 } });
        deco(r.cx, y, r.cz, B.CHEST, { tier: 'dungeon' });
        break;
      case 'vault':
        corners(B.GOLD_BLOCK, 1);
        for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) deco(x, y, z, B.GOLD_BLOCK);
        deco(r.cx - 1, y, r.z1, B.CHEST, { tier: 'vault' }); deco(r.cx, y, r.z1, B.CHEST, { tier: 'vault' }); deco(r.cx + 1, y, r.z1, B.CHEST, { tier: 'vault' });
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: hell ? 'magma_golem' : castle ? 'armored' : 'skeleton', cap: 2, hp: 1.8 } });
        deco(r.cx, y + r.h - 1, r.cz, light);
        break;
      case 'boss': {
        for (const [x, z] of [[r.x0 + 2, r.z0 + 2], [r.x1 - 2, r.z0 + 2], [r.x0 + 2, r.z1 - 2], [r.x1 - 2, r.z1 - 2]]) for (let k = 0; k < r.h; k++) deco(x, y + k, z, k === 3 ? light : B.OBSIDIAN);
        // the crypt's lich; in a castle its lord, a necromancer or a giant
        const boss = castle ? (rnd() < 0.6 ? 'necromancer' : 'giant') : hell ? 'lich' : (r.bossKey ? ['necromancer', 'giant', 'brute'][Math.floor(rnd() * 3)] : d.T?.boss || 'lich');
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: boss, boss: true, key: r.bossKey || d.key } });
        for (let x = r.cx - 2; x <= r.cx + 2; x++) deco(x, y - 1, r.cz - 3, B.GOLD_BLOCK);
        for (const x of [r.cx - 2, r.cx, r.cx + 2]) deco(x, y, r.z0, B.CHEST, { tier: 'boss' });
        for (let x = r.x0; x <= r.x1; x += 3) deco(x, y + r.h - 1, r.cz, light);
        if (castle) for (const x of [r.cx - 3, r.cx + 3]) deco(x, y + 3, r.z1 + 1, B.BANNER);
        corners(B.COBWEB, 2);
        break;
      }
      case 'fountain':
        // a basin of water in the middle, lamps on its corners
        for (let x = r.cx - 1; x <= r.cx + 1; x++) for (let z = r.cz - 1; z <= r.cz + 1; z++) { deco(x, y - 1, z, B.WATER); if (Math.abs(x - r.cx) + Math.abs(z - r.cz) === 2) deco(x, y, z, B.STONE_BRICKS); }
        for (const [x, z] of [[r.cx - 2, r.cz - 2], [r.cx + 2, r.cz + 2]]) { deco(x, y, z, B.STONE_BRICKS); deco(x, y + 1, z, light); }
        if (rnd() < 0.5) deco(r.x1, y, r.z0, B.CHEST, { tier: 'dungeon' });
        break;
      case 'altar':
        for (let x = r.cx - 1; x <= r.cx + 1; x++) deco(x, y, r.cz, B.OBSIDIAN);
        deco(r.cx, y + 1, r.cz, B.GOLD_BLOCK);
        deco(r.cx - 1, y + 1, r.cz, B.SKULL_BLOCK); deco(r.cx + 1, y + 1, r.cz, B.SKULL_BLOCK);
        deco(r.cx, y, r.cz + 2, B.CHEST, { tier: 'vault' });
        deco(r.cx, y, r.cz - 2, B.SPAWNER, { spawner: { type: spawnType(), cap: 2, hp: 1.6 } });
        wallLamp();
        break;
      case 'storeroom':
        for (let x = r.x0; x <= r.x1; x++) if (rnd() < 0.6) { deco(x, y, r.z0, rnd() < 0.5 ? B.PLANKS : B.HAY_BALE); if (rnd() < 0.4) deco(x, y + 1, r.z0, B.PLANKS); }
        for (let k = 0; k < 2; k++) deco(r.x0 + 1 + Math.floor(rnd() * (r.x1 - r.x0 - 1)), y, r.z1, B.CHEST, { tier: 'dungeon' });
        corners(B.COBWEB);
        wallLamp();
        break;
      case 'mine':
        // an old mine: ore in the walls, a cart of planks, a pick-room chest
        for (let k = 0; k < 8; k++) { const side = rnd() < 0.5; const x = side ? (rnd() < 0.5 ? r.x0 - 1 : r.x1 + 1) : r.x0 + Math.floor(rnd() * (r.x1 - r.x0)); const z = side ? r.z0 + Math.floor(rnd() * (r.z1 - r.z0)) : (rnd() < 0.5 ? r.z0 - 1 : r.z1 + 1); deco(x, y + Math.floor(rnd() * 3), z, [B.IRON_ORE, B.GOLD_ORE, B.COAL_ORE, B.CRYSTAL_ORE][Math.floor(rnd() * 4)]); }
        for (const x of [r.x0 + 1, r.x1 - 1]) for (let k = 0; k < r.h; k++) deco(x, y + k, r.cz, k === r.h - 1 ? B.PLANKS : B.LOG);
        deco(r.cx, y, r.cz + 1, B.CHEST, { tier: 'dungeon' });
        deco(r.cx, y + 2, r.cz, B.LANTERN);
        break;
      case 'garden': {
        // what grows down here depends on the dungeon
        const t = d.theme;
        const plant = t === 'mushroom' ? B.GLOW_MUSHROOM : t === 'overgrown' ? B.TALL_GRASS : t === 'sand' ? B.DEAD_BUSH : t === 'ice' ? B.SNOW : B.MUSHROOM;
        for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) if (hash2(x * 3, z * 5, this.gen.seed + 951) < 0.4) deco(x, y, z, plant);
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: spawnType(), cap: 2 } });
        if (rnd() < 0.6) deco(r.x0, y, r.z0, B.CHEST, { tier: 'dungeon' });
        deco(r.cx, y + r.h - 1, r.cz, light);
        break;
      }
      default:
        wallLamp();
        if (rnd() < 0.3) deco(r.cx, y, r.cz, B.CHEST, { tier: 'dungeon' });
    }
    if (d.theme) this._themeRoom(d, r, rnd);
  }
  /** What a dungeon's theme adds to each of its rooms. */
  _themeRoom(d, r, rnd) {
    const y = r.y, t = d.theme, deco = (x, yy, z, id) => this._deco(d, x, yy, z, id);
    const cells = (k) => { const out = []; for (let i = 0; i < k; i++) out.push([r.x0 + Math.floor(rnd() * (r.x1 - r.x0 + 1)), r.z0 + Math.floor(rnd() * (r.z1 - r.z0 + 1))]); return out; };
    const free = (x, z) => !(x === r.cx && z === r.cz);
    switch (t) {
      case 'flooded': for (const [x, z] of cells(6)) if (free(x, z)) deco(x, y - 1, z, B.WATER); break;
      case 'overgrown':
        for (const [x, z] of cells(5)) for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) deco(x, y + r.h - 1 - k, z, B.LEAVES);
        for (const [x, z] of cells(5)) if (free(x, z)) deco(x, y, z, B.TALL_GRASS);
        break;
      case 'mushroom':
        for (const [x, z] of cells(4)) if (free(x, z)) deco(x, y, z, B.GLOW_MUSHROOM);
        for (const [x, z] of cells(4)) deco(x, y + r.h, z, B.GLOW_MOSS);
        break;
      case 'crystal': for (const [x, z] of cells(3)) deco(x, y + r.h, z, B.AMETHYST); break;
      case 'ice': for (const [x, z] of cells(4)) for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) deco(x, y + r.h - 1 - k, z, B.ICE); break;
      case 'sand':
        for (const [x, z] of cells(3)) if (free(x, z)) deco(x, y, z, B.SAND);
        if (rnd() < 0.15) deco(r.x1, y, r.z1, B.GOLD_BLOCK);
        break;
      case 'web':
        for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
          if (hash2(x * 7, z * 3 + y, this.gen.seed + 953) < 0.1 && free(x, z)) deco(x, y + 1 + Math.floor(hash2(x, z, this.gen.seed + 954) * (r.h - 1)), z, B.COBWEB);
        }
        break;
      case 'bone': for (const [x, z] of cells(3)) if (free(x, z)) deco(x, y, z, B.SKULL_BLOCK); break;
      case 'ember': for (const [x, z] of cells(4)) if (free(x, z)) deco(x, y - 1, z, B.MAGMA); break;
    }
  }
  /** The dungeon's name: «Затопленный склеп тысячи костей», «Ледяные катакомбы», «Бездна семи печатей»… */
  _name(d, rnd) {
    const of = OF[Math.floor(rnd() * OF.length)];
    if (d.kind === 'fortress') return `Крепость преисподней ${of}`;
    if (d.kind === 'castle') return `Руины замка ${of}`;
    if (d.super) return `Бездна ${of}`;
    const list = NOUNS[d.size] || NOUNS.large, [noun, g] = list[Math.floor(rnd() * list.length)];
    const adj = d.T?.adj?.[GENDER[g]] || '';
    return `${adj} ${noun}${rnd() < 0.6 ? ' ' + of : ''}`.trim().replace(/^./, (c) => c.toUpperCase());
  }

  _corridor(d, a, b, rnd) {
    const y = a.y, hell = d.kind === 'fortress';
    if (a.gx !== b.gx) {
      const z = a.cz, x0 = a.x1 + 1, x1 = b.x0 - 1;
      this._shell(d, x0 - 1, y - 1, z - 2, x1 + 1, y + 3, z + 2);
      this._air(d, x0 - 1, y, z - 1, x1 + 1, y + 2, z + 1);
      for (let x = x0 + 3; x < x1; x += 7) this._deco(d, x, y + 2, z - 2, hell ? B.MAGMA : B.LANTERN);
      if (rnd() < 0.4) this._deco(d, x0 + 1, y + 2, z + 1, B.COBWEB);
    } else {
      const x = a.cx, z0 = a.z1 + 1, z1 = b.z0 - 1;
      this._shell(d, x - 2, y - 1, z0 - 1, x + 2, y + 3, z1 + 1);
      this._air(d, x - 1, y, z0 - 1, x + 1, y + 2, z1 + 1);
      for (let z = z0 + 3; z < z1; z += 7) this._deco(d, x - 2, y + 2, z, hell ? B.MAGMA : B.LANTERN);
      if (rnd() < 0.4) this._deco(d, x + 1, y + 2, z0 + 1, B.COBWEB);
    }
    if (hell || (d.kind === 'castle' && a.f > 0)) {
      // bridges (over the lava, over the castle yard): a pillar under the middle of the corridor
      const mx = (a.cx + b.cx) >> 1, mz = (a.cz + b.cz) >> 1;
      if (hell) this._air(d, mx, 4, mz, mx, y - 2, mz, B.OBSIDIAN);
      else this._air(d, mx, d.found[0]?.y ?? y - CASTLE_GAP, mz, mx, y - 2, mz, B.STONE_BRICKS);
    }
  }

  _ladder(d, x, z, yBottom, yTop) {
    this._shell(d, x - 1, yBottom - 1, z - 1, x + 1, yTop + 1, z + 1, false);
    this._air(d, x, yBottom, z, x, yTop, z, B.LADDER);
  }

  /** The way in: a crypt has a ruined shrine on the surface over a ladder shaft down; a castle, a door to its yard. */
  _entrance(d, r, rnd) {
    const gen = this.gen;
    if (d.kind === 'fortress') return;          // the underworld fortress is found from the caves
    if (d.kind === 'castle') {
      this._air(d, r.cx - 1, r.y, r.z0 - 1, r.cx + 1, r.y + 2, r.z0 - 1);
      this._air(d, r.cx - 1, r.y - 1, d.oz - RING, r.cx + 1, r.y - 1, r.z0 - 1, B.COBBLESTONE);      // the road from the gate
      return;
    }
    const x = r.cx, z = r.z0 + 1;
    const h = gen.column(x, z).h;
    this._ladder(d, x, z, r.y, h + 1);
    // shrine: a broken ring of mossy bricks with lanterns
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      const hh = gen.column(x + dx, z + dz).h;
      if (ring === 3 && hash2(x + dx, z + dz, gen.seed + 960) < 0.75) {
        const tall = 1 + Math.floor(hash2(x + dz, z + dx, gen.seed + 961) * 3);
        for (let k = 1; k <= tall; k++) this._deco(d, x + dx, hh + k, z + dz, k === tall && hash2(x, z + dx, gen.seed + 962) < 0.3 ? B.SKULL_BLOCK : (hash2(x + dx, k, gen.seed + z) < 0.5 ? B.MOSSY_COBBLE : B.CRACKED_BRICKS));
      } else if (ring < 3 && ring > 1) this._deco(d, x + dx, hh, z + dz, B.STONE_BRICKS);
    }
    for (const [dx, dz] of [[-2, -2], [2, 2]]) { const hh = gen.column(x + dx, z + dz).h; this._deco(d, x + dx, hh + 1, z + dz, B.MOSSY_COBBLE); this._deco(d, x + dx, hh + 2, z + dz, B.LANTERN); }
  }

  /** A castle's site: the hill above the yard is cut away and a foundation fills the hollows below it. */
  _castleGround(d, y0, floors) {
    const S = d.n * C, x0 = d.ox - RING - 2, z0 = d.oz - RING - 2, x1 = d.ox + S + RING + 2, z1 = d.oz + S + RING + 2;
    d.clear.push({ x0, z0, x1, z1, y0, y1: y0 + floors * CASTLE_GAP + 10 });
    d.found.push({ x0, z0, x1, z1, y: y0 - 1 });
  }
  /** The curtain wall: crenellated, with a tower at every corner and a gatehouse facing the entrance hall. */
  _curtain(d, entrance, y0, rnd) {
    const S = d.n * C, a0x = d.ox - RING, a0z = d.oz - RING, a1x = d.ox + S + RING - 1, a1z = d.oz + S + RING - 1;
    const top = y0 + 6;
    // the four walls
    this._shell(d, a0x, y0, a0z, a1x, top, a0z);
    this._shell(d, a0x, y0, a1z, a1x, top, a1z);
    this._shell(d, a0x, y0, a0z, a0x, top, a1z);
    this._shell(d, a1x, y0, a0z, a1x, top, a1z);
    // a walkway behind the battlements
    for (const [x0, z0, x1, z1] of [[a0x + 1, a0z + 1, a1x - 1, a0z + 1], [a0x + 1, a1z - 1, a1x - 1, a1z - 1], [a0x + 1, a0z + 1, a0x + 1, a1z - 1], [a1x - 1, a0z + 1, a1x - 1, a1z - 1]]) d.shells.push({ x0, y0: top - 1, z0, x1, y1: top - 1, z1, ruin: true });
    // battlements
    for (let x = a0x; x <= a1x; x += 2) { this._deco(d, x, top + 1, a0z, B.STONE_BRICKS); this._deco(d, x, top + 1, a1z, B.STONE_BRICKS); }
    for (let z = a0z; z <= a1z; z += 2) { this._deco(d, a0x, top + 1, z, B.STONE_BRICKS); this._deco(d, a1x, top + 1, z, B.STONE_BRICKS); }
    // corner towers with a lantern on top and an archer's spawner inside
    for (const [tx, tz] of [[a0x, a0z], [a1x, a0z], [a0x, a1z], [a1x, a1z]]) {
      const th = top + 6;
      this._shell(d, tx - 2, y0 - 1, tz - 2, tx + 2, th, tz + 2, false);
      this._air(d, tx - 1, y0, tz - 1, tx + 1, th - 1, tz + 1);
      this._air(d, tx, y0, tz, tx, th - 1, tz, B.LADDER);
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]]) this._deco(d, tx + dx, th + 1, tz + dz, B.STONE_BRICKS);
      this._deco(d, tx, th + 1, tz, B.LANTERN);
      // doors from the tower onto the yard and the walkway
      const ix = tx === a0x ? 1 : -1, iz = tz === a0z ? 1 : -1;
      this._air(d, tx + ix * 2, y0, tz, tx + ix * 2, y0 + 1, tz);
      this._air(d, tx, top, tz + iz * 2, tx, top + 1, tz + iz * 2);
      if (rnd() < 0.6) this._deco(d, tx + ix, y0, tz + iz, B.SPAWNER, { spawner: { type: 'skeleton', cap: 2 } });
      else this._deco(d, tx + ix, y0, tz + iz, B.CHEST, { tier: 'dungeon' });
    }
    // the gatehouse
    const gx = entrance.cx;
    this._shell(d, gx - 3, y0 - 1, a0z - 2, gx + 3, top + 3, a0z + 2, false);
    this._air(d, gx - 1, y0, a0z - 2, gx + 1, y0 + 3, a0z + 2);
    for (let x = gx - 1; x <= gx + 1; x++) this._deco(d, x, y0 + 3, a0z, B.IRON_BARS);          // the portcullis, half raised
    for (const x of [gx - 3, gx + 3]) { this._deco(d, x, y0 + 2, a0z - 3, B.LANTERN); this._deco(d, x, y0 + 3, a0z - 2, B.BANNER); }
    this._deco(d, gx - 2, y0, a0z + 3, B.SPAWNER, { spawner: { type: 'armored', cap: 2 } });
    // the yard: a well, broken carts of hay, graves
    const wx = d.ox + Math.floor(rnd() * S), wz = d.oz + S + 2;
    for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) this._deco(d, wx + dx, y0, wz + dz, B.COBBLESTONE);
    this._deco(d, wx, y0 - 1, wz, B.WATER);
    for (let k = 0; k < 6; k++) this._deco(d, a0x + 2 + Math.floor(rnd() * (S + 2 * RING - 4)), y0, a1z - 2, rnd() < 0.5 ? B.HAY_BALE : B.SKULL_BLOCK);
  }

  /** An abandoned village: crumbling houses around a square with a well, a farm gone wild, chests and the dead. */
  _village(rx, rz, ox, oz, S) {
    const gen = this.gen, seed = gen.seed, sea = gen.sea;
    for (const s of gen.sites || []) if (Math.hypot(s.x - ox - S / 2, s.z - oz - S / 2) < S + 110) return null;
    const rnd = mulberry32((seed ^ Math.imul(rx + 91, 2654435761) ^ Math.imul(rz + 53, 40503)) >>> 0);
    const cx = ox + S / 2, cz = oz + S / 2, c = gen.column(cx, cz);
    if (c.h <= sea + 1 || c.b === 8 || c.b === 3) return null;
    const d = { kind: 'village', rx, rz, ox, oz, n: 0, shells: [], inner: [], decos: [], clear: [], found: [], key: 'village:' + rx + ',' + rz };
    d.name = `Заброшенная деревня «${VILLAGE_NAMES[Math.floor(rnd() * VILLAGE_NAMES.length)]}»`;
    const tier = 1 + Math.floor(rnd() * 3);
    const types = ['house', 'house', 'house', 'house', 'farm', 'storehouse', 'watchtower', 'lumber_camp', 'house'];
    const spots = [[-17, -17], [3, -19], [-19, 4], [6, 6], [-4, 13], [13, -6], [-14, 14], [15, 13]];
    let houses = 0, y0 = c.h + 1;
    // the square and its well
    d.found.push({ x0: cx - 4, z0: cz - 4, x1: cx + 4, z1: cz + 4, y: c.h });
    d.clear.push({ x0: cx - 4, z0: cz - 4, x1: cx + 4, z1: cz + 4, y0: c.h + 1, y1: c.h + 8 });
    for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { this._deco(d, cx + dx, y0, cz + dz, B.COBBLESTONE); }
    this._deco(d, cx, c.h, cz, B.WATER);
    for (const [dx, dz] of [[-1, -1], [1, 1]]) { this._deco(d, cx + dx, y0 + 1, cz + dz, B.LOG); this._deco(d, cx + dx, y0 + 2, cz + dz, B.LOG); }
    for (const [sx, sz] of spots) {
      if (rnd() < 0.2) continue;
      const type = types[Math.floor(rnd() * types.length)], def = BUILDING_TYPES[type];
      if (!def) continue;
      const rot = Math.floor(rnd() * 4), variant = Math.floor(rnd() * (def.variants || 1));
      let Lay;
      try { Lay = def.layout(rot, variant, tier, def.growAt ? def.growAt(tier) : 0); } catch (e) { continue; }
      if (!Lay || Lay.w > 16 || Lay.d > 16) continue;
      const bx = cx + sx - (Lay.w >> 1), bz = cz + sz - (Lay.d >> 1);
      const hs = [gen.column(bx, bz).h, gen.column(bx + Lay.w - 1, bz).h, gen.column(bx, bz + Lay.d - 1).h, gen.column(bx + Lay.w - 1, bz + Lay.d - 1).h].sort((a, b) => a - b);
      if (hs[3] - hs[0] > 6 || hs[1] <= sea) continue;
      const by = hs[1];
      d.found.push({ x0: bx - 1, z0: bz - 1, x1: bx + Lay.w, z1: bz + Lay.d, y: by, mat: 'grass' });
      d.clear.push({ x0: bx - 1, z0: bz - 1, x1: bx + Lay.w, z1: bz + Lay.d, y0: by + 1, y1: by + Lay.height + 4 });
      // the house in ruins: the roof mostly gone, holes in the walls, moss everywhere
      const top = Lay.height;
      for (const b of Lay.blocks) {
        if (b.dy <= 0) continue;
        const h = hash2(bx + b.dx * 3 + b.dy, bz + b.dz * 5 - b.dy, seed + 980);
        if (b.dy >= top - 2 && h < 0.65) continue;
        if (b.dy >= 2 && h < 0.22) continue;
        let id = b.id;
        if (h > 0.9 && b.dy <= 3) id = B.MOSSY_COBBLE;
        this._deco(d, bx + b.dx, by + b.dy, bz + b.dz, id);
      }
      const ix = bx + (Lay.w >> 1), iz = bz + (Lay.d >> 1);
      if (rnd() < 0.6) this._deco(d, ix, by + 1, iz, B.CHEST, { tier: rnd() < 0.2 ? 'vault' : 'dungeon' });
      if (rnd() < 0.35) this._deco(d, ix + 1, by + 1, iz, B.SPAWNER, { spawner: { type: rnd() < 0.5 ? 'walker' : rnd() < 0.5 ? 'skeleton' : 'runner', cap: 2 } });
      for (let k = 0; k < 3; k++) this._deco(d, bx + Math.floor(rnd() * Lay.w), by + 2 + Math.floor(rnd() * 2), bz + Math.floor(rnd() * Lay.d), B.COBWEB);
      houses++;
    }
    if (houses < 3) return null;
    // a path of gravel between the houses, skulls in the grass, a lantern by the well
    for (let k = -14; k <= 14; k++) for (const [x, z] of [[cx + k, cz + 1], [cx + 1, cz + k]]) if (Math.abs(k) > 4 && hash2(x, z, seed + 981) < 0.7) this._deco(d, x, gen.column(x, z).h, z, B.GRAVEL);
    for (let k = 0; k < 5; k++) { const x = ox + Math.floor(rnd() * S), z = oz + Math.floor(rnd() * S); this._deco(d, x, gen.column(x, z).h + 1, z, B.SKULL_BLOCK); }
    this._deco(d, cx + 2, y0, cz + 2, B.LANTERN);
    d.box = { x0: ox, z0: oz, x1: ox + S, z1: oz + S, y0: c.h - 8, y1: c.h + 20 };
    return d;
  }

  /** Is (x, z) inside a castle's walls or an abandoned village? (No trees grow there.) */
  castleAt(x, z) {
    for (const d of this.plans(Math.floor(x / R), Math.floor(z / R))) {
      if (d.kind !== 'castle' && d.kind !== 'village') continue;
      const b = d.box;
      if (x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2) return true;
    }
    return false;
  }
  /** The dungeon whose halls contain (x, y, z), or null. */
  at(x, y, z) {
    for (const d of this.plans(Math.floor(x / R), Math.floor(z / R))) {
      const b = d.box;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && y >= b.y0 && y <= b.y1) return d;
    }
    return null;
  }

  // ---- drawing into a chunk
  draw(x0, z0, x1, z1, blocks, idx) {
    const world = this.gen.world, seed = this.gen.seed;
    const lists = [];
    for (let rz = Math.floor(z0 / R); rz <= Math.floor((z1 - 1) / R); rz++) for (let rx = Math.floor(x0 / R); rx <= Math.floor((x1 - 1) / R); rx++) {
      for (const d of this.plans(rx, rz)) if (d.box.x1 >= x0 && d.box.x0 < x1 && d.box.z1 >= z0 && d.box.z0 < z1) lists.push(d);
    }
    if (!lists.length) return;
    const clip = (o) => ({ ax: Math.max(x0, o.x0), bx: Math.min(x1 - 1, o.x1), az: Math.max(z0, o.z0), bz: Math.min(z1 - 1, o.z1), ay: Math.max(1, o.y0), by: Math.min(world.height - 2, o.y1) });
    const outside = (o) => o.x1 < x0 || o.x0 >= x1 || o.z1 < z0 || o.z0 >= z1;
    for (const d of lists) {
      const hell = d.kind === 'fortress', castle = d.kind === 'castle';
      const wallId = (x, y, z) => {
        const r = hash2(x * 31 + y, z * 17 - y, seed + 970);
        if (hell) return r < 0.35 ? B.DARK_STONE : r < 0.6 ? B.STONE_BRICKS : r < 0.85 ? B.OBSIDIAN : B.MAGMA;
        if (castle || d.kind === 'village') return r < 0.5 ? B.STONE_BRICKS : r < 0.68 ? B.CRACKED_BRICKS : r < 0.84 ? B.MOSSY_COBBLE : B.COBBLESTONE;
        for (const [share, id] of d.T?.walls || THEMES.stone.walls) if (r < share) return id;
        return B.STONE_BRICKS;
      };
      const floorIds = d.T?.floor || THEMES.stone.floor;
      // a castle: cut the hill away, then lay the yard and fill the hollows under it
      for (const o of d.clear) {
        if (outside(o)) continue;
        const c = clip(o);
        for (let y = c.ay; y <= c.by; y++) for (let z = c.az; z <= c.bz; z++) for (let x = c.ax; x <= c.bx; x++) { const i = idx(x, y, z); if (blocks[i] !== B.BEDROCK) blocks[i] = B.AIR; }
      }
      for (const o of d.found) {
        if (outside(o)) continue;
        const c = clip({ ...o, y0: o.y, y1: o.y });
        for (let z = c.az; z <= c.bz; z++) for (let x = c.ax; x <= c.bx; x++) {
          const r = hash2(x, z, seed + 973);
          if (o.mat === 'grass') blocks[idx(x, o.y, z)] = r < 0.8 ? B.GRASS : r < 0.92 ? B.DIRT : B.GRAVEL;
          else blocks[idx(x, o.y, z)] = r < 0.45 ? B.GRAVEL : r < 0.7 ? B.COBBLESTONE : r < 0.85 ? B.MOSSY_COBBLE : B.DIRT;
          for (let y = o.y - 1, k = 0; y > 1 && k < 30; y--, k++) {
            const i = idx(x, y, z), id = blocks[i];
            if (id !== B.AIR && id !== B.WATER && id !== B.TALL_GRASS && id !== B.LEAVES) break;
            blocks[i] = k < 2 ? B.DIRT : B.COBBLESTONE;
          }
        }
      }
      for (const o of d.shells) {
        if (outside(o)) continue;
        const c = clip(o);
        for (let y = c.ay; y <= c.by; y++) for (let z = c.az; z <= c.bz; z++) for (let x = c.ax; x <= c.bx; x++) {
          const i = idx(x, y, z), cur = blocks[i];
          if (cur === B.BEDROCK) continue;
          if (castle) {
            // crumbling: the top of the walls is broken, and here and there a hole in them
            if (o.ruin && y >= o.y1 - 1 && y > o.y0 && hash2(x * 5 + y, z * 3, seed + 974) < 0.3) continue;
            if (o.ruin && y > o.y0 + 1 && y < o.y1 - 1 && hash2(x * 7 - y, z * 11 + y, seed + 975) < 0.03) continue;
          } else if ((cur === B.AIR || cur === B.WATER || cur === B.LAVA) && y > o.y0 && y < o.y1 && hash2(x * 5 + y, z, seed + 971) < 0.6) continue;   // where a cave runs through, the wall stays broken open
          blocks[i] = y === o.y0 && !castle ? (hell ? B.DARK_STONE : floorIds[hash2(x, z, seed + 972) < 0.7 ? 0 : 1]) : wallId(x, y, z);
        }
      }
      for (const o of d.inner) {
        if (outside(o)) continue;
        const c = clip(o);
        for (let y = c.ay; y <= c.by; y++) for (let z = c.az; z <= c.bz; z++) for (let x = c.ax; x <= c.bx; x++) blocks[idx(x, y, z)] = o.id;
      }
      for (const o of d.decos) {
        if (o.x < x0 || o.x >= x1 || o.z < z0 || o.z >= z1 || o.y < 1 || o.y >= world.height - 1) continue;
        blocks[idx(o.x, o.y, o.z)] = o.id;
        const gi = world.index(o.x, o.y, o.z);
        if (o.meta?.tier) world.chestTier.set(gi, o.meta.tier);
        if (o.meta?.spawner) world.spawners.set(gi, { x: o.x, y: o.y, z: o.z, ...o.meta.spawner });
      }
    }
  }
}
