// Big dungeons of deep worlds, in the spirit of the best Minecraft dungeon mods: two-storey catacombs in the cavern
// layer (a maze of 5×5 rooms per floor joined by corridors) and fortresses over the lava sea of the underworld.
// Rooms have a purpose — spawner halls, libraries, tombs, prisons, armouries, spider nests, lava-trap rooms, a
// treasure vault and the boss hall of a lich — and a ruined shrine on the surface marks a ladder shaft down.
// Each dungeon is planned once per 176×176 region from the world seed; every chunk draws its own part of it, so it is
// seamless and independent of chunk order. Where a cave runs into a dungeon, its walls are left broken open.
import { B } from '../core/blocks.js';
import { mulberry32, hash2 } from '../core/rng.js';

const R = 176;           // region size
const N = 5;             // rooms per side per floor
const C = 15;            // cell size (room + corridor)
const H = 5;             // room interior height
const FLOOR_GAP = 9;     // between the floors of a catacomb

const CRYPT_SPAWNS = ['skeleton', 'cave_dweller', 'walker', 'cave_spider'];
const HELL_SPAWNS = ['imp', 'magma_golem', 'burning'];

export class Dungeons {
  constructor(gen) { this.gen = gen; this.cache = new Map(); }

  /** The dungeon of a region (or null). */
  plan(rx, rz) {
    const key = rx + ',' + rz;
    if (this.cache.has(key)) return this.cache.get(key);
    const gen = this.gen, seed = gen.seed, world = gen.world, L = gen.L;
    let d = null;
    const roll = hash2(rx, rz, seed + 900);
    const ox = rx * R + 12 + Math.floor(hash2(rx, rz, seed + 901) * (R - N * C - 24));
    const oz = rz * R + 12 + Math.floor(hash2(rx, rz, seed + 902) * (R - N * C - 24));
    const inWorld = ox > 8 && oz > 8 && ox + N * C < world.size - 8 && oz + N * C < world.size - 8;
    const c = gen.column(ox + N * C / 2, oz + N * C / 2);
    if (inWorld && c.dist > 130) {
      if (roll < 0.5) d = this._make('crypt', rx, rz, ox, oz, L.cavBot + 30 + Math.floor(hash2(rx, rz, seed + 903) * (L.cavTop - L.cavBot - 70)), 2);
      else if (roll < 0.72) d = this._make('fortress', rx, rz, ox, oz, 28, 1);
    }
    this.cache.set(key, d);
    return d;
  }

  _make(kind, rx, rz, ox, oz, y0, floors) {
    const gen = this.gen, rnd = mulberry32((gen.seed ^ Math.imul(rx + 31, 2654435761) ^ Math.imul(rz + 17, 40503)) >>> 0);
    const d = { kind, rx, rz, ox, oz, shells: [], inner: [], decos: [], key: 'boss:' + rx + ',' + rz };
    const levels = [];
    for (let f = 0; f < floors; f++) {
      const y = y0 - f * FLOOR_GAP;
      // rooms: one per cell, random size
      const rooms = [];
      for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++) {
        const w = 7 + 2 * Math.floor(rnd() * 3), dd = 7 + 2 * Math.floor(rnd() * 3);
        const cx = ox + gx * C + (C >> 1), cz = oz + gz * C + (C >> 1);
        rooms.push({ gx, gz, f, y, x0: cx - (w >> 1), x1: cx + (w >> 1), z0: cz - (dd >> 1), z1: cz + (dd >> 1), cx, cz, type: 'plain', h: H, links: [] });
      }
      // a maze over the cells (depth-first), plus a few loops
      const at = (gx, gz) => rooms[gz * N + gx];
      const seen = new Set(), stack = [at(Math.floor(rnd() * N), Math.floor(rnd() * N))];
      seen.add(stack[0]);
      while (stack.length) {
        const r = stack[stack.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => at(r.gx + a, r.gz + b)).filter(o => o && r.gx + 0 >= 0 && !seen.has(o) && Math.abs(o.gx - r.gx) + Math.abs(o.gz - r.gz) === 1);
        if (!nb.length) { stack.pop(); continue; }
        const o = nb[Math.floor(rnd() * nb.length)];
        r.links.push(o); o.links.push(r); seen.add(o); stack.push(o);
      }
      for (const r of rooms) for (const [a, b] of [[1, 0], [0, 1]]) {
        const o = at(r.gx + a, r.gz + b);
        if (o && r.gx + a < N && r.gz + b < N && !r.links.includes(o) && rnd() < 0.2) { r.links.push(o); o.links.push(r); }
      }
      levels.push({ y, rooms, at });
    }
    // room purposes
    const top = levels[0], bottom = levels[levels.length - 1];
    const entrance = top.at(Math.floor(rnd() * N), Math.floor(rnd() * N));
    entrance.type = 'entrance';
    let stairTop = null;
    if (floors > 1) {
      const cands = top.rooms.filter(r => r !== entrance);
      stairTop = cands[Math.floor(rnd() * cands.length)];
      stairTop.type = 'stairs';
      const sb = bottom.at(stairTop.gx, stairTop.gz);
      sb.type = 'stairs_down';
    }
    // the boss hall and the vault: farthest from where you come in (on the lowest floor)
    const startB = floors > 1 ? bottom.at(stairTop.gx, stairTop.gz) : bottom.at(entrance.gx, entrance.gz);
    const dist = new Map([[startB, 0]]), q = [startB];
    while (q.length) { const r = q.shift(); for (const o of r.links) if (!dist.has(o)) { dist.set(o, dist.get(r) + 1); q.push(o); } }
    const far = bottom.rooms.filter(r => r.type === 'plain').sort((a, b) => dist.get(b) - dist.get(a));
    if (far[0]) { const b = far[0]; b.type = 'boss'; b.h = 8; b.x0 = b.cx - 6; b.x1 = b.cx + 6; b.z0 = b.cz - 6; b.z1 = b.cz + 6; }
    if (far[1]) far[1].type = 'vault';
    const kinds = kind === 'fortress' ? ['spawner', 'spawner', 'armory', 'trap', 'prison', 'plain', 'library'] : ['spawner', 'spawner', 'library', 'tombs', 'prison', 'armory', 'trap', 'nest', 'plain'];
    for (const lv of levels) for (const r of lv.rooms) if (r.type === 'plain') r.type = kinds[Math.floor(rnd() * kinds.length)];
    // draw lists
    for (const lv of levels) {
      for (const r of lv.rooms) this._room(d, r, rnd);
      for (const r of lv.rooms) for (const o of r.links) if (o.gx > r.gx || o.gz > r.gz) this._corridor(d, r, o, rnd);
    }
    d.rooms = levels.flatMap(l => l.rooms).map(r => ({ type: r.type, cx: r.cx, cz: r.cz, y: r.y, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, h: r.h }));
    this._entrance(d, entrance, rnd);
    if (stairTop) this._ladder(d, stairTop.cx + 2, stairTop.cz + 2, bottom.y, top.y - 1);
    return d;
  }

  // ---- building blocks of the plan
  _shell(d, x0, y0, z0, x1, y1, z1) { d.shells.push({ x0, y0, z0, x1, y1, z1 }); }
  _air(d, x0, y0, z0, x1, y1, z1, id = B.AIR) { d.inner.push({ x0, y0, z0, x1, y1, z1, id }); }
  _deco(d, x, y, z, id, meta) { d.decos.push({ x, y, z, id, meta }); }

  _room(d, r, rnd) {
    const y = r.y, hell = d.kind === 'fortress';
    this._shell(d, r.x0 - 1, y - 1, r.z0 - 1, r.x1 + 1, y + r.h, r.z1 + 1);
    this._air(d, r.x0, y, r.z0, r.x1, y + r.h - 1, r.z1);
    // pillars under fortress rooms, down into the lava sea
    if (hell) for (const [x, z] of [[r.x0 - 1, r.z0 - 1], [r.x1 + 1, r.z0 - 1], [r.x0 - 1, r.z1 + 1], [r.x1 + 1, r.z1 + 1], [r.cx, r.z0 - 1], [r.cx, r.z1 + 1]]) this._air(d, x, 4, z, x, y - 2, z, B.OBSIDIAN);
    const deco = (x, yy, z, id, meta) => this._deco(d, x, yy, z, id, meta);
    const spawnType = () => (hell ? HELL_SPAWNS : CRYPT_SPAWNS)[Math.floor(rnd() * (hell ? HELL_SPAWNS.length : CRYPT_SPAWNS.length))];
    const light = hell ? B.MAGMA : B.LANTERN;
    const wallLamp = () => { deco(r.x0 - 1, y + 2, r.cz, light); deco(r.x1 + 1, y + 2, r.cz, light); };
    const corners = (id, n = 1) => { for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) for (let k = 0; k < n; k++) deco(x, y + r.h - 1 - k, z, id); };
    switch (r.type) {
      case 'entrance':
        wallLamp(); deco(r.cx, y + r.h - 1, r.cz, light);
        deco(r.x0 + 1, y, r.z0 + 1, B.SKULL_BLOCK);
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
        deco(r.cx, y, r.z0 + 1, B.SPAWNER, { spawner: { type: hell ? 'magma_golem' : 'cave_dweller', cap: 2 } });
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
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: hell ? 'magma_golem' : 'skeleton', cap: 2, hp: 1.8 } });
        deco(r.cx, y + r.h - 1, r.cz, light);
        break;
      case 'boss':
        for (const [x, z] of [[r.x0 + 2, r.z0 + 2], [r.x1 - 2, r.z0 + 2], [r.x0 + 2, r.z1 - 2], [r.x1 - 2, r.z1 - 2]]) for (let k = 0; k < r.h; k++) deco(x, y + k, z, k === 3 ? light : B.OBSIDIAN);
        deco(r.cx, y, r.cz, B.SPAWNER, { spawner: { type: 'lich', boss: true, key: d.key } });
        for (let x = r.cx - 2; x <= r.cx + 2; x++) deco(x, y - 1, r.cz - 3, B.GOLD_BLOCK);
        for (const x of [r.cx - 2, r.cx, r.cx + 2]) deco(x, y, r.z0, B.CHEST, { tier: 'boss' });
        for (let x = r.x0; x <= r.x1; x += 3) deco(x, y + r.h - 1, r.cz, light);
        corners(B.COBWEB, 2);
        break;
      default:
        wallLamp();
        if (rnd() < 0.3) deco(r.cx, y, r.cz, B.CHEST, { tier: 'dungeon' });
    }
  }

  _corridor(d, a, b, rnd) {
    const y = a.y;
    if (a.gx !== b.gx) {
      const z = a.cz, x0 = a.x1 + 1, x1 = b.x0 - 1;
      this._shell(d, x0 - 1, y - 1, z - 2, x1 + 1, y + 3, z + 2);
      this._air(d, x0 - 1, y, z - 1, x1 + 1, y + 2, z + 1);
      for (let x = x0 + 3; x < x1; x += 7) this._deco(d, x, y + 2, z - 2, d.kind === 'fortress' ? B.MAGMA : B.LANTERN);
      if (rnd() < 0.4) this._deco(d, x0 + 1, y + 2, z + 1, B.COBWEB);
    } else {
      const x = a.cx, z0 = a.z1 + 1, z1 = b.z0 - 1;
      this._shell(d, x - 2, y - 1, z0 - 1, x + 2, y + 3, z1 + 1);
      this._air(d, x - 1, y, z0 - 1, x + 1, y + 2, z1 + 1);
      for (let z = z0 + 3; z < z1; z += 7) this._deco(d, x - 2, y + 2, z, d.kind === 'fortress' ? B.MAGMA : B.LANTERN);
      if (rnd() < 0.4) this._deco(d, x + 1, y + 2, z0 + 1, B.COBWEB);
    }
    if (d.kind === 'fortress') {
      // bridges over the lava: pillars under the corridor
      const mx = (a.cx + b.cx) >> 1, mz = (a.cz + b.cz) >> 1;
      this._air(d, mx, 4, mz, mx, y - 2, mz, B.OBSIDIAN);
    }
  }

  _ladder(d, x, z, yBottom, yTop) {
    this._shell(d, x - 1, yBottom - 1, z - 1, x + 1, yTop + 1, z + 1);
    this._air(d, x, yBottom, z, x, yTop, z, B.LADDER);
  }

  /** The way in: a ruined shrine on the surface over a ladder shaft down to the entrance hall. */
  _entrance(d, r, rnd) {
    const gen = this.gen;
    const x = r.cx, z = r.z0 + 1;
    const h = gen.column(x, z).h;
    if (d.kind === 'fortress') return;          // the underworld fortress is found from the caves
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
    for (const d of lists) {
      const hell = d.kind === 'fortress';
      const wallId = (x, y, z) => {
        const r = hash2(x * 31 + y, z * 17 - y, seed + 970);
        if (hell) return r < 0.35 ? B.DARK_STONE : r < 0.6 ? B.STONE_BRICKS : r < 0.85 ? B.OBSIDIAN : B.MAGMA;
        return r < 0.55 ? B.STONE_BRICKS : r < 0.75 ? B.CRACKED_BRICKS : r < 0.9 ? B.MOSSY_COBBLE : B.DARK_STONE;
      };
      for (const o of d.shells) {
        if (o.x1 < x0 || o.x0 >= x1 || o.z1 < z0 || o.z0 >= z1) continue;
        const c = clip(o);
        for (let y = c.ay; y <= c.by; y++) for (let z = c.az; z <= c.bz; z++) for (let x = c.ax; x <= c.bx; x++) {
          const i = idx(x, y, z), cur = blocks[i];
          if (cur === B.BEDROCK) continue;
          // where a cave runs through, the wall stays broken open
          if ((cur === B.AIR || cur === B.WATER || cur === B.LAVA) && y > o.y0 && y < o.y1 && hash2(x * 5 + y, z, seed + 971) < 0.6) continue;
          blocks[i] = y === o.y0 ? (hell ? B.DARK_STONE : (hash2(x, z, seed + 972) < 0.7 ? B.STONE_BRICKS : B.COBBLESTONE)) : wallId(x, y, z);
        }
      }
      for (const o of d.inner) {
        if (o.x1 < x0 || o.x0 >= x1 || o.z1 < z0 || o.z0 >= z1) continue;
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
