// Big dungeons of deep worlds, in the spirit of the best Minecraft dungeon mods:
//   • crypts — catacombs of two or three storeys in the cavern layer (a maze of 6×6 rooms per floor joined by corridors);
//   • great catacombs — three or four storeys of 7×7 rooms, the biggest of them all;
//   • fortresses over the lava sea of the underworld;
//   • ruined castles on the surface — a curtain wall with corner towers and a gate around a keep of two or three
//     storeys of halls, bridges between them and a lord of the dead in the throne room at the top.
// Rooms have a purpose — spawner halls, libraries, tombs, prisons, armouries, barracks, spider nests, lava-trap
// rooms, a treasure vault and the boss hall — and a ruined shrine on the surface marks a crypt's ladder shaft down.
// Each dungeon is planned once per 144×144 region from the world seed; every chunk draws its own part of it, so it
// is seamless and independent of chunk order. Where a cave runs into an underground dungeon, its walls are left
// broken open; a castle levels its ground, stands on a foundation and its walls are crumbling.
import { B } from '../core/blocks.js';
import { mulberry32, hash2 } from '../core/rng.js';

const R = 144;           // region size
const C = 15;            // cell size (room + corridor)
const H = 5;             // room interior height
const FLOOR_GAP = 9;     // between the floors of a catacomb
const CASTLE_GAP = H + 1; // castle storeys stand right on top of each other
const RING = 5;          // a castle's curtain wall stands this far outside its keep

const CRYPT_SPAWNS = ['skeleton', 'cave_dweller', 'walker', 'cave_spider'];
const HELL_SPAWNS = ['imp', 'magma_golem', 'burning'];
const CASTLE_SPAWNS = ['skeleton', 'armored', 'walker', 'runner', 'skeleton'];

export class Dungeons {
  constructor(gen) { this.gen = gen; this.cache = new Map(); }

  /** The dungeon of a region (or null). */
  plan(rx, rz) {
    const key = rx + ',' + rz;
    if (this.cache.has(key)) return this.cache.get(key);
    const gen = this.gen, seed = gen.seed, world = gen.world, L = gen.L;
    let d = null;
    const roll = hash2(rx, rz, seed + 900);
    // the great catacombs are 7×7 rooms a floor, crypts and fortresses 6×6, castles 5×5
    const great = roll >= 0.28 && roll < 0.48;
    const n = great ? 7 : roll < 0.28 || (roll >= 0.48 && roll < 0.6) || roll >= 0.86 ? 6 : 5, S = n * C;
    const ox = rx * R + 12 + Math.floor(hash2(rx, rz, seed + 901) * (R - S - 24));
    const oz = rz * R + 12 + Math.floor(hash2(rx, rz, seed + 902) * (R - S - 24));
    const inWorld = ox > 12 && oz > 12 && ox + S < world.size - 12 && oz + S < world.size - 12;
    const c = gen.column(ox + S / 2, oz + S / 2);
    const cavY = (floors) => L.cavBot + 12 + (floors - 1) * FLOOR_GAP + Math.floor(hash2(rx, rz, seed + 903) * (L.cavTop - L.cavBot - 52 - (floors - 1) * FLOOR_GAP));
    if (inWorld && c.dist > 130) {
      const f2 = hash2(rx, rz, seed + 904);
      if (roll < 0.28) d = this._make('crypt', rx, rz, ox, oz, cavY(f2 < 0.4 ? 3 : 2), f2 < 0.4 ? 3 : 2, n);
      else if (great) d = this._make('crypt', rx, rz, ox, oz, cavY(f2 < 0.45 ? 4 : 3), f2 < 0.45 ? 4 : 3, n);
      else if (roll < 0.6) d = this._make('fortress', rx, rz, ox, oz, 28, 1, n);
      else if (roll < 0.86) {
        const y0 = c.dist > 170 ? this._castleSite(ox, oz, S) : null;
        if (y0 !== null) d = this._make('castle', rx, rz, ox, oz, y0, f2 < 0.35 ? 3 : 2, n);
        else d = this._make('crypt', rx, rz, ox, oz, cavY(2), 2, n);
      } else d = this._make('crypt', rx, rz, ox, oz, cavY(3), 3, n);       // every other region has a dungeon too
    }
    this.cache.set(key, d);
    return d;
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

  _make(kind, rx, rz, ox, oz, y0, floors, n) {
    const gen = this.gen, rnd = mulberry32((gen.seed ^ Math.imul(rx + 31, 2654435761) ^ Math.imul(rz + 17, 40503)) >>> 0);
    const castle = kind === 'castle';
    const d = { kind, rx, rz, ox, oz, n, shells: [], inner: [], decos: [], clear: [], found: [], key: 'boss:' + rx + ',' + rz };
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
    if (far[0]) { const b = far[0]; b.type = 'boss'; b.h = 8; b.x0 = b.cx - 6; b.x1 = b.cx + 6; b.z0 = b.cz - 6; b.z1 = b.cz + 6; }
    if (far[1]) far[1].type = 'vault';
    if (far[2] && floors > 2) far[2].type = 'vault';
    const kinds = kind === 'fortress' ? ['spawner', 'spawner', 'armory', 'trap', 'prison', 'plain', 'library']
      : castle ? ['spawner', 'spawner', 'barracks', 'armory', 'library', 'prison', 'tombs', 'trap', 'plain']
        : ['spawner', 'spawner', 'library', 'tombs', 'prison', 'armory', 'trap', 'nest', 'plain'];
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
    const pool = hell ? HELL_SPAWNS : castle ? CASTLE_SPAWNS : CRYPT_SPAWNS;
    const spawnType = () => pool[Math.floor(rnd() * pool.length)];
    const light = hell ? B.MAGMA : B.LANTERN;
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
        const boss = castle ? (rnd() < 0.6 ? 'necromancer' : 'giant') : 'lich';
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: boss, boss: true, key: d.key } });
        for (let x = r.cx - 2; x <= r.cx + 2; x++) deco(x, y - 1, r.cz - 3, B.GOLD_BLOCK);
        for (const x of [r.cx - 2, r.cx, r.cx + 2]) deco(x, y, r.z0, B.CHEST, { tier: 'boss' });
        for (let x = r.x0; x <= r.x1; x += 3) deco(x, y + r.h - 1, r.cz, light);
        if (castle) for (const x of [r.cx - 3, r.cx + 3]) deco(x, y + 3, r.z1 + 1, B.BANNER);
        corners(B.COBWEB, 2);
        break;
      }
      default:
        wallLamp();
        if (rnd() < 0.3) deco(r.cx, y, r.cz, B.CHEST, { tier: 'dungeon' });
    }
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

  /** Is (x, z) inside a castle's walls? (No trees grow there.) */
  castleAt(x, z) {
    const d = this.plan(Math.floor(x / R), Math.floor(z / R));
    if (!d || d.kind !== 'castle') return false;
    const b = d.box;
    return x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2;
  }
  /** The dungeon whose halls contain (x, y, z), or null. */
  at(x, y, z) {
    const d = this.plan(Math.floor(x / R), Math.floor(z / R));
    if (!d) return null;
    const b = d.box;
    return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && y >= b.y0 && y <= b.y1 ? d : null;
  }

  // ---- drawing into a chunk
  draw(x0, z0, x1, z1, blocks, idx) {
    const world = this.gen.world, seed = this.gen.seed;
    const lists = [];
    for (let rz = Math.floor(z0 / R); rz <= Math.floor((z1 - 1) / R); rz++) for (let rx = Math.floor(x0 / R); rx <= Math.floor((x1 - 1) / R); rx++) {
      const d = this.plan(rx, rz);
      if (d) lists.push(d);
    }
    if (!lists.length) return;
    const clip = (o) => ({ ax: Math.max(x0, o.x0), bx: Math.min(x1 - 1, o.x1), az: Math.max(z0, o.z0), bz: Math.min(z1 - 1, o.z1), ay: Math.max(1, o.y0), by: Math.min(world.height - 2, o.y1) });
    const outside = (o) => o.x1 < x0 || o.x0 >= x1 || o.z1 < z0 || o.z0 >= z1;
    for (const d of lists) {
      const hell = d.kind === 'fortress', castle = d.kind === 'castle';
      const wallId = (x, y, z) => {
        const r = hash2(x * 31 + y, z * 17 - y, seed + 970);
        if (hell) return r < 0.35 ? B.DARK_STONE : r < 0.6 ? B.STONE_BRICKS : r < 0.85 ? B.OBSIDIAN : B.MAGMA;
        if (castle) return r < 0.5 ? B.STONE_BRICKS : r < 0.68 ? B.CRACKED_BRICKS : r < 0.84 ? B.MOSSY_COBBLE : B.COBBLESTONE;
        return r < 0.55 ? B.STONE_BRICKS : r < 0.75 ? B.CRACKED_BRICKS : r < 0.9 ? B.MOSSY_COBBLE : B.DARK_STONE;
      };
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
          blocks[idx(x, o.y, z)] = r < 0.45 ? B.GRAVEL : r < 0.7 ? B.COBBLESTONE : r < 0.85 ? B.MOSSY_COBBLE : B.DIRT;
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
          blocks[i] = y === o.y0 && !castle ? (hell ? B.DARK_STONE : (hash2(x, z, seed + 972) < 0.7 ? B.STONE_BRICKS : B.COBBLESTONE)) : wallId(x, y, z);
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
