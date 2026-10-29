import { B } from '../core/blocks.js';
import { Simplex, mulberry32, hash2 } from '../core/rng.js';
import { TerrainGenV2 } from './terrainV2.js';
import { Dungeons } from './dungeons.js';
import { oak, birch, spruce, acacia, swampOak, cactus, setTreeClip } from './trees.js';

export { oak, birch, spruce, acacia, swampOak, cactus };

/** Sea level of the first (format 1) worlds; deeper worlds keep theirs in world.sea. */
export const SEA_LEVEL = 20;

// biomes (world.biome): 0 plains, 1 forest, 2 hills/spruce, 3 beach, 4 blight, 5 birch,
// 6 desert (mesa on its hills), 7 savanna, 8 swamp, 9 tundra
export const BIOME = { PLAINS: 0, FOREST: 1, HILLS: 2, BEACH: 3, BLIGHT: 4, BIRCH: 5, DESERT: 6, SAVANNA: 7, SWAMP: 8, TUNDRA: 9 };
export const BIOME_NAMES = ['Луга', 'Лес', 'Горы', 'Побережье', 'Мёртвые земли', 'Березняк', 'Пустыня', 'Саванна', 'Болото', 'Тундра'];

/** The underground layers of a format-3 world (y ranges, see TerrainGen). */
export function layersOf(world) {
  const sea = world.sea;
  return { cavTop: sea - 40, cavBot: 96, deep: 160, hellTop: 92, lavaSea: 18 };
}

// cavern zones under the surface
const Z_NONE = 0, Z_MUSH = 1, Z_JUNGLE = 2, Z_ICE = 3, Z_SAND = 4, Z_GEM = 5, Z_SPIDER = 6;

/**
 * Terrain of deep worlds (format 3, ~384 blocks high): the surface of format 2 (biomes, the village meadow,
 * pyramids…) over a Terraria-sized underground, about 320 blocks deep:
 *   the underground (~40 blocks): winding tunnels, abandoned mineshafts, coal and iron;
 *   the cavern layer (~190 blocks): huge open caves joined by wide tunnels, each region with its own character —
 *     glowing mushroom groves, an underground jungle of mud and hanging vines, ice caves under the tundra, sandstone
 *     caves under the desert, crystal grottos, spider nests — stalactites and stalagmites, pools of water and lava,
 *     forgotten cabins with treasure, gold, crystals and amethyst geodes;
 *   the underworld (bottom ~90 blocks): a vast hall over a lava sea, ash islands and pillars, glowing magma and the
 *     ruined towers of a lost people.
 * Caves come from a 3D density field sampled every 4 blocks and interpolated (fast enough for phones).
 * Deterministic per seed and independent of chunk order (trees are clipped to their chunk and drawn again by the
 * neighbours), so chunks can be thrown away and generated again.
 */
const CH = 16, G = 4;
export class TerrainGen extends TerrainGenV2 {
  constructor(world) {
    super(world);
    const seed = this.seed;
    this.c1 = new Simplex(seed + 505); this.c2 = new Simplex(seed + 606); this.c3 = new Simplex(seed + 707);
    this.c4 = new Simplex(seed + 808); this.c5 = new Simplex(seed + 909); this.c6 = new Simplex(seed + 1010);
    this.L = layersOf(world);
    this.GY = Math.floor(world.height / G) + 1;
    this.dungeons = new Dungeons(this);
  }

  /** Cavern zone of a column (by noise and by the biome above). */
  zone(x, z, b) {
    if (b === 9) return Z_ICE;
    if (b === 6) return Z_SAND;
    const { n, n2, n3 } = this;
    if (n3.noise2(x / 150 + 70, z / 150) > 0.42) return Z_JUNGLE;
    if (n2.noise2(x / 115 - 200, z / 115 + 200) > 0.44) return Z_MUSH;
    if (n.noise2(x / 85 + 33, z / 85 - 71) > 0.52) return Z_GEM;
    if (this.c6.noise2(x / 60, z / 60) > 0.55) return Z_SPIDER;
    return Z_NONE;
  }

  /** Cave density at a point (> 0 = open). h = surface height of the column, dist = distance from the village. */
  density(X, Y, Z, h, dist) {
    const L = this.L, sea = this.sea;
    if (Y <= 2) return -1;
    // ---- the underworld
    if (Y < L.hellTop + 6) {
      const ceil = 70 + 12 * this.c1.noise2(X / 60, Z / 60);
      const floor = 6 + 4 * this.c2.noise2(X / 40, Z / 40);
      if (Y < floor) return -1;
      if (Y > ceil) {
        // shafts down from the caverns
        return this.c3.noise2(X / 70, Z / 70) > 0.6 ? 0.6 : -1;
      }
      if (this.c5.noise2(X / 9, Z / 9) > 0.84) return -1;                         // pillars
      const isl = this.c4.noise3(X / 46, Y / 15, Z / 46) - Math.abs(Y - 34) / 60;
      return isl > 0.36 ? -1 : 1;
    }
    // ---- caverns and tunnels
    const d = h - Y;
    const mouth = dist > 90 && this.n2.noise2(X / 50 - 70, Z / 50 + 70) > 0.45;
    if (d < (mouth ? 0 : dist < 70 ? 16 : h <= sea + 1 ? 10 : 6)) return -1;
    const a = this.c1.noise3(X / 52, Y / 34, Z / 52), b = this.c2.noise3(X / 52 + 200, Y / 34, Z / 52);
    const spag = 1 - Math.hypot(a, b) / 0.11;
    const a2 = this.c3.noise3(X / 38 - 90, Y / 26, Z / 38), b2 = this.c4.noise3(X / 38, Y / 26 + 50, Z / 38);
    const spag2 = Y < sea - 10 ? 1 - Math.hypot(a2, b2) / 0.09 : -1;
    // big "cheese" caverns, rare near the surface, everywhere in the cavern layer
    const cav = smooth(L.cavTop + 20, L.cavTop - 30, Y) * smooth(L.cavBot, L.cavBot + 24, Y);
    const c = this.n.noise3(X / 96, Y / 50, Z / 96) * 0.65 + this.n3.noise3(X / 34, Y / 22, Z / 34) * 0.35;
    const cheese = (c - (0.6 - 0.34 * cav)) * 4;
    return Math.max(spag, spag2, cheese);
  }

  /** Surface block of a column, as the terrain fill makes it (used for trees next to the chunk). */
  surfaceTop(x, z, h, b) {
    const SEA = this.sea, seed = this.seed;
    if (b === 6) return h > SEA + 8 ? B.RED_SAND : B.SAND;
    if (b === 7) return h < SEA ? B.DIRT : B.DRY_GRASS;
    if (b === 8) return h <= SEA ? B.MUD : (hash2(x, z, seed + 7) < 0.25 ? B.MUD : B.GRASS);
    if (b === 9) return h < SEA ? B.GRAVEL : B.SNOW;
    if (b === 2 && h > SEA + 24) return B.SNOW;
    if (b === 2 && h > SEA + 21 && hash2(x, z, seed + 6) < 0.5) return B.STONE;
    if (b === 3 || b === 4) return B.SAND;
    return h < SEA ? B.DIRT : B.GRASS;
  }
  /** The tree growing on a column, if any: a function drawing it. */
  treeAt(x, z, h, b, top, dist) {
    const seed = this.seed, world = this.world;
    const r = hash2(x, z, seed + 77);
    const trnd = () => mulberry32((seed + x * 374761393 + z * 668265263) >>> 0);
    if (h + 1 >= world.height - 8 || x < 3 || z < 3 || x >= world.size - 3 || z >= world.size - 3) return null;
    if (this.dungeons.castleAt(x, z)) return null;            // nothing grows in a castle's yard
    if (b === 6) return top === B.SAND && r < 0.006 && dist > 40 ? () => { const t = trnd(); cactus(world, x, h + 1, z, 1 + Math.floor(t() * 3)); } : null;
    if (b === 7) return top === B.DRY_GRASS && r < 0.007 && dist > 30 ? () => acacia(world, x, h + 1, z, trnd()) : null;
    if (b === 8) return (top === B.GRASS || top === B.MUD) && r < 0.03 && dist > 30 ? () => swampOak(world, x, h + 1, z, trnd()) : null;
    if (b === 9) return top === B.SNOW && r < 0.012 && dist > 30 ? () => spruce(world, x, h + 1, z, trnd()) : null;
    if (top !== B.GRASS && top !== B.SNOW) return null;
    const treeChance = b === 1 ? 0.045 : b === 5 ? 0.04 : b === 2 ? 0.03 : (dist < 26 ? 0 : 0.006);
    if (r >= treeChance) return null;
    return () => {
      const t = trnd();
      if (b === 2) spruce(world, x, h + 1, z, t);
      else if (b === 5 || (b === 1 && t() < 0.2)) birch(world, x, h + 1, z, t);
      else oak(world, x, h + 1, z, t);
    };
  }

  generateChunk(ccx, ccz) {
    const world = this.world, size = world.size, H = world.height, seed = this.seed, SEA = this.sea, L = this.L;
    const x0 = ccx * CH, z0 = ccz * CH, x1 = Math.min(size, x0 + CH), z1 = Math.min(size, z0 + CH);
    const blocks = world.colAt(x0, z0, true);
    const idx = (x, y, z) => (x - x0) + 16 * ((z - z0) + 16 * y);
    const inChunk = (x, z) => x >= x0 && z >= z0 && x < x1 && z < z1 && x > 0 && z > 0 && x < size - 1 && z < size - 1;
    const rnd = mulberry32((seed ^ Math.imul(ccx + 7919, 73856093) ^ Math.imul(ccz + 104729, 19349663)) >>> 0);
    // ---------------------------------------------------------------- surface columns
    const cols = [];
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = this.column(x, z);
      world.setColumn(x, z, c.h, c.b);
      c.zone = this.zone(x, z, c.b);
      cols[(z - z0) * CH + (x - x0)] = c;
    }
    // ---------------------------------------------------------------- the cave field on a coarse grid
    const GY = this.GY, GN = CH / G + 1;
    const D = new Float32Array(GN * GN * GY);
    for (let gz = 0; gz < GN; gz++) for (let gx = 0; gx < GN; gx++) {
      const X = x0 + gx * G, Z = z0 + gz * G;
      const c = gx < GN - 1 && gz < GN - 1 ? cols[(gz * G) * CH + gx * G] : this.column(Math.min(size - 1, X), Math.min(size - 1, Z));
      for (let gy = 0; gy < GY; gy++) D[(gz * GN + gx) * GY + gy] = this.density(X, gy * G, Z, c.h, c.dist);
    }
    // ---------------------------------------------------------------- rock, soil, caves and water
    const colD = new Float32Array(GY);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = cols[(z - z0) * CH + (x - x0)], h = c.h, b = c.b, zone = c.zone;
      // the column's cave field: bilinear on the grid, linear between grid rows below
      const lx = x - x0, lz = z - z0, gx = lx >> 2, gz = lz >> 2, fx = (lx & 3) / G, fz = (lz & 3) / G;
      const i00 = (gz * GN + gx) * GY, i10 = (gz * GN + gx + 1) * GY, i01 = ((gz + 1) * GN + gx) * GY, i11 = ((gz + 1) * GN + gx + 1) * GY;
      for (let gy = 0; gy < GY; gy++) {
        const a = D[i00 + gy] + (D[i10 + gy] - D[i00 + gy]) * fx, bb = D[i01 + gy] + (D[i11 + gy] - D[i01 + gy]) * fx;
        colD[gy] = a + (bb - a) * fz;
      }
      const bed2 = hash2(x, z, seed) < 0.5, bed3 = hash2(x, z, seed + 1) < 0.2;
      const deepY = L.deep + Math.floor(hash2(x, z, seed + 2) * 4);
      const mesa = b === 6 && h > SEA + 8;
      const zoneMat = zone === Z_ICE ? B.PACKED_ICE : zone === Z_SAND ? B.SANDSTONE : zone === Z_JUNGLE ? B.MUD : 0;
      const zTop = h - 14, zBot = L.cavBot + 16;
      const top = Math.max(h, SEA), base = lx + 16 * lz;
      let cr = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ seed) >>> 0;     // cheap per-cell noise (gravel, dirt pockets)
      for (let y = 0; y <= top; y++) {
        const i = base + 256 * y;
        cr = (Math.imul(cr ^ (cr >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
        const cv = cr / 4294967296;
        if (y === 0 || (y === 1 && bed2) || (y === 2 && bed3)) { blocks[i] = B.BEDROCK; continue; }
        if (y > h) { blocks[i] = (y === SEA && b === 9) ? B.ICE : B.WATER; continue; }
        const gy = y >> 2, dd = colD[gy] + (colD[Math.min(GY - 1, gy + 1)] - colD[gy]) * ((y & 3) / G);
        if (dd > 0) { blocks[i] = y <= L.lavaSea ? B.LAVA : B.AIR; continue; }
        let id;
        if (y < L.hellTop) id = y < 60 ? B.ASH : B.DARK_STONE;
        else id = y < deepY ? B.DARK_STONE : B.STONE;
        if (zoneMat && y > zBot && y < zTop) id = zoneMat;
        const depth = h - y;
        if (depth === 0) {
          if (b === 3) id = h < SEA ? (hash2(x, z, seed + 3) < 0.3 ? B.GRAVEL : B.SAND) : B.SAND;
          else if (b === 4) id = hash2(x, z, seed + 4) < 0.35 ? B.DARK_STONE : (hash2(x, z, seed + 5) < 0.5 ? B.GRAVEL : B.DIRT);
          else if (b === 6) id = mesa ? B.RED_SAND : B.SAND;
          else if (b === 7) id = h < SEA ? B.DIRT : B.DRY_GRASS;
          else if (b === 8) id = h <= SEA ? B.MUD : (hash2(x, z, seed + 7) < 0.25 ? B.MUD : B.GRASS);
          else if (b === 9) id = h < SEA ? B.GRAVEL : B.SNOW;
          else if (b === 2 && h > SEA + 24) id = B.SNOW;
          else if (b === 2 && h > SEA + 21 && hash2(x, z, seed + 6) < 0.5) id = B.STONE;
          else id = h < SEA ? B.DIRT : B.GRASS;
        } else if (depth < 4) {
          id = (b === 3) ? B.SAND : (b === 4 && depth < 2 ? B.GRAVEL : B.DIRT);
          if (b === 6) id = depth < 3 ? (mesa ? B.RED_SAND : B.SAND) : B.SANDSTONE;
          if (b === 8 && depth < 2) id = B.MUD;
          if (b === 2 && h > SEA + 21) id = B.STONE;
        } else if (b === 6 && depth < 12) id = B.SANDSTONE;
        else if (depth < 9 && cv < 0.5 - depth * 0.05) id = B.DIRT;      // dirt pockets just below the soil
        if (mesa && depth > 0 && y > SEA) id = (y % 5) < 2 ? B.RED_SAND : (y % 5 === 2 ? B.SAND : B.SANDSTONE);
        if (id === B.STONE && cv > 0.98) id = B.GRAVEL;
        if (id === B.STONE && b === 4 && y > h - 8) id = cv < 0.5 ? B.DARK_STONE : B.MOSSY_COBBLE;
        blocks[i] = id;
      }
    }
    // ---------------------------------------------------------------- cave decoration (floors, ceilings, pools)
    const ROCK = new Uint8Array(256);
    for (const id of [B.STONE, B.DARK_STONE, B.MUD, B.PACKED_ICE, B.SANDSTONE, B.DIRT, B.ASH, B.GRAVEL]) ROCK[id] = 1;
    const solidRock = (id) => ROCK[id] === 1;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = cols[(z - z0) * CH + (x - x0)], h = c.h, zone = c.zone;
      const wet = this.c5.noise2(x / 34 + 9, z / 34) , hot = this.c6.noise2(x / 30 - 40, z / 30 + 12);
      const yMax = Math.min(h - 3, H - 2), base = (x - x0) + 16 * (z - z0);
      for (let y = 3; y < yMax; y++) {
        const i = base + 256 * y;
        if (blocks[i] !== B.AIR) continue;
        const below = blocks[i - 256], above = blocks[i + 256];
        if (below === B.AIR && above === B.AIR && zone !== Z_SPIDER) continue;
        const hv = hash2(x * 13 + y, z * 7 - y, seed + 120);
        const inCav = y > L.hellTop + 6;
        // ---- floors
        if (solidRock(below)) {
          if (inCav && y < 150 && hot > 0.5) { blocks[i] = B.LAVA; if (hot > 0.66 && blocks[idx(x, y + 1, z)] === B.AIR) blocks[idx(x, y + 1, z)] = B.LAVA; continue; }
          if (inCav && wet > 0.45) { blocks[i] = B.WATER; if (wet > 0.6 && above === B.AIR) blocks[idx(x, y + 1, z)] = B.WATER; continue; }
          if (!inCav) {
            // underworld floors: ash, glowing cracks
            if (below === B.ASH && hv < 0.05) blocks[idx(x, y - 1, z)] = B.MAGMA;
            continue;
          }
          if (zone === Z_MUSH) { blocks[idx(x, y - 1, z)] = B.GLOW_MOSS; if (hv < 0.15) blocks[i] = B.GLOW_MUSHROOM; continue; }
          if (zone === Z_JUNGLE) { if (below === B.MUD) blocks[idx(x, y - 1, z)] = B.JUNGLE_GRASS; if (hv < 0.3) blocks[i] = B.TALL_GRASS; else if (hv < 0.33) blocks[i] = B.GLOW_MUSHROOM; continue; }
          if (zone === Z_ICE) { if (hv < 0.5) blocks[idx(x, y - 1, z)] = B.SNOW; continue; }
          if (zone === Z_SAND) { blocks[idx(x, y - 1, z)] = B.SAND; if (hv < 0.03) blocks[i] = B.DEAD_BUSH; continue; }
          if (zone === Z_GEM && hv < 0.12) { blocks[idx(x, y - 1, z)] = B.AMETHYST; continue; }
          if (hv < 0.035) {
            // stalagmite
            const len = 1 + Math.floor(hash2(x, z + y, seed + 121) * 3);
            for (let k = 0; k < len && y + k < yMax; k++) { const j = idx(x, y + k, z); if (blocks[j] !== B.AIR) break; blocks[j] = below; }
            continue;
          }
          if (hv > 0.97) blocks[idx(x, y - 1, z)] = B.GRAVEL;
          continue;
        }
        // ---- ceilings
        if (solidRock(above) || above === B.PACKED_ICE) {
          if (!inCav) { if (hv < 0.04) blocks[idx(x, y + 1, z)] = B.MAGMA; continue; }
          if (zone === Z_JUNGLE && hv < 0.14) {
            const len = 1 + Math.floor(hash2(x, z * 3 + y, seed + 122) * 6);
            for (let k = 0; k < len && y - k > 3; k++) { const j = idx(x, y - k, z); if (blocks[j] !== B.AIR) break; blocks[j] = B.LEAVES; }
            continue;
          }
          if (zone === Z_MUSH && hv < 0.3) { blocks[idx(x, y + 1, z)] = B.GLOW_MOSS; continue; }
          if (zone === Z_SPIDER && hv < 0.25 && inCav) { blocks[i] = B.COBWEB; continue; }
          const len = zone === Z_ICE ? (hv < 0.1 ? 1 + Math.floor(hv * 30) : 0) : (hv < 0.045 ? 1 + Math.floor(hash2(x, z - y, seed + 123) * 4) : 0);
          for (let k = 0; k < len && y - k > 3; k++) { const j = idx(x, y - k, z); if (blocks[j] !== B.AIR) break; blocks[j] = zone === Z_ICE ? B.ICE : above; }
          continue;
        }
        // spider nests: webs strung in corners next to the walls
        if (zone === Z_SPIDER && inCav && hv < 0.08 && x > x0 && x < x1 - 1 && z > z0 && z < z1 - 1 &&
          (ROCK[blocks[i - 1]] + ROCK[blocks[i + 1]] + ROCK[blocks[i - 16]] + ROCK[blocks[i + 16]]) >= 2) blocks[i] = B.COBWEB;
      }
    }
    // ---------------------------------------------------------------- ores (veins stay inside the chunk)
    const STONES = [B.STONE, B.DARK_STONE];
    const ore = (id, perMap, minY, maxY, vein, hosts = STONES) => {
      const e = perMap * this.perChunk;
      const count = Math.floor(e) + (rnd() < e - Math.floor(e) ? 1 : 0);
      for (let i = 0; i < count; i++) {
        let x = x0 + Math.floor(rnd() * CH), y = minY + Math.floor(rnd() * (maxY - minY)), z = z0 + Math.floor(rnd() * CH);
        for (let k = 0; k < vein; k++) {
          if (inChunk(x, z) && y > 2 && y < H) { const j = idx(x, y, z); if (hosts.includes(blocks[j])) blocks[j] = id; }
          x += Math.round(rnd() * 2 - 1); y += Math.round(rnd() * 2 - 1); z += Math.round(rnd() * 2 - 1);
        }
      }
    };
    ore(B.COAL_ORE, 1300, 190, SEA + 30, 9);
    ore(B.IRON_ORE, 700, 110, SEA - 4, 5);
    ore(B.GOLD_ORE, 450, 60, 240, 5);
    ore(B.CRYSTAL_ORE, 330, 20, 170, 4);
    ore(B.MAGMA, 500, 3, L.hellTop + 4, 8, [B.ASH, B.DARK_STONE]);
    ore(B.OBSIDIAN, 120, 3, L.hellTop, 6, [B.ASH, B.DARK_STONE]);
    if (cols[0].zone === Z_GEM) ore(B.CRYSTAL_ORE, 400, L.cavBot, L.cavTop, 5);
    // surface outcrops in the hills so early iron/coal is visible
    if (rnd() < 40 * this.perChunk * 1.5) {
      const x = x0 + Math.floor(rnd() * CH), z = z0 + Math.floor(rnd() * CH);
      if (inChunk(x, z) && world.biomeAt(x, z) === 2) blocks[idx(x, world.heightAt(x, z), z)] = rnd() < 0.8 ? B.COAL_ORE : B.IRON_ORE;
    }
    // amethyst geodes
    for (let g = 0; g < 2; g++) {
      if (rnd() > (cols[0].zone === Z_GEM ? 0.5 : 0.1)) continue;
      const cx = x0 + 4 + Math.floor(rnd() * 8), cz = z0 + 4 + Math.floor(rnd() * 8), cy = L.hellTop + 10 + Math.floor(rnd() * (L.cavTop - L.hellTop - 30)), R = 3 + rnd() * 1.5;
      for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let z = cz - 5; z <= cz + 5; z++) for (let x = cx - 5; x <= cx + 5; x++) {
        if (!inChunk(x, z)) continue;
        const d = Math.hypot(x - cx, (y - cy) * 1.15, z - cz), i = idx(x, y, z);
        if (blocks[i] === B.LAVA || blocks[i] === B.BEDROCK || blocks[i] === B.WATER) continue;
        if (d < R - 1.1) blocks[i] = hash2(x * 3 + y, z, seed + 41) < 0.14 && d > R - 2.2 ? B.CRYSTAL_ORE : B.AIR;
        else if (d < R) blocks[i] = B.AMETHYST;
        else if (d < R + 0.9 && blocks[i] !== B.AIR) blocks[i] = B.OBSIDIAN;
      }
    }
    // ---------------------------------------------------------------- structures
    this._mineshafts3(x0, z0, x1, z1, idx, inChunk, cols, blocks);
    if (rnd() < 0.09) this._cabin(x0, z0, idx, rnd, blocks, cols);
    if (rnd() < 0.09) this._ruin(x0, z0, idx, rnd, blocks);
    this.dungeons.draw(x0, z0, x1, z1, blocks, idx);
    // treasure chests on cave floors
    for (let t = 0; t < 5; t++) {
      if (rnd() > 0.3) continue;
      const x = x0 + Math.floor(rnd() * CH), z = z0 + Math.floor(rnd() * CH);
      const c = cols[(z - z0) * CH + (x - x0)];
      if (!inChunk(x, z) || c.dist < 50) continue;
      const start = 4 + Math.floor(rnd() * Math.max(1, c.h - 20));
      for (let y = start; y < c.h - 10; y++) {
        const i = idx(x, y, z), below = blocks[idx(x, y - 1, z)];
        if (blocks[i] === B.AIR && blocks[idx(x, y + 1, z)] === B.AIR && solidRock(below) || (blocks[i] === B.AIR && (below === B.GLOW_MOSS || below === B.JUNGLE_GRASS || below === B.OBSIDIAN || below === B.SNOW))) {
          blocks[i] = B.CHEST;
          break;
        }
      }
    }
    // ---------------------------------------------------------------- vegetation (trees of the columns around are drawn clipped)
    setTreeClip([x0, z0, x1, z1]);
    try {
      for (let z = Math.max(0, z0 - 3); z < Math.min(size, z1 + 3); z++) for (let x = Math.max(0, x0 - 3); x < Math.min(size, x1 + 3); x++) {
        const own = x >= x0 && x < x1 && z >= z0 && z < z1;
        const c = own ? cols[(z - z0) * CH + (x - x0)] : this.column(x, z);
        const top = this.surfaceTop(x, z, c.h, c.b);
        const tree = this.treeAt(x, z, c.h, c.b, top, c.dist);
        if (tree) { if (!own || blocks[idx(x, c.h, z)] === top) tree(); continue; }
        if (!own) continue;
        // small plants on the chunk's own columns
        const h = c.h, b = c.b, above = idx(x, h + 1, z);
        if (h + 2 >= H || blocks[above] !== B.AIR || blocks[idx(x, h, z)] !== top) continue;
        const r = hash2(x, z, seed + 77), r2 = hash2(x, z, seed + 78);
        if (b === 6) { if (r > 0.985) blocks[above] = B.DEAD_BUSH; }
        else if (b === 7) { if (r2 < 0.14) blocks[above] = B.TALL_GRASS; else if (r2 < 0.16) blocks[above] = B.DEAD_BUSH; }
        else if (b === 8) { if (h >= SEA && r2 < 0.2) blocks[above] = B.REEDS; else if (top === B.GRASS && r2 < 0.32) blocks[above] = B.TALL_GRASS; else if (r2 < 0.335) blocks[above] = B.MUSHROOM; }
        else if (b === 4) { if (r < 0.04) blocks[above] = B.DEAD_BUSH; }
        else if (top === B.GRASS) {
          if (r2 < 0.16) blocks[above] = B.TALL_GRASS;
          else if (r2 < 0.175) blocks[above] = B.FLOWER_RED;
          else if (r2 < 0.19) blocks[above] = B.FLOWER_YELLOW;
          else if (r2 < 0.193 && b === 1) blocks[above] = B.MUSHROOM;
        }
      }
    } finally { setTreeClip(null); }
    // ---------------------------------------------------------------- desert pyramids
    if (rnd() < 0.05) {
      const cx = x0 + 8, cz = z0 + 8;
      const c = cols[8 * CH + 8];
      if (c.b === 6 && c.h > SEA + 1 && c.dist > 120 && cx + 6 < size - 3 && cz + 6 < size - 3) this._pyramid(cx, c.h, cz, idx, rnd);
    }
    // ---------------------------------------------------------------- ore boulders near the village
    for (const bo of this.boulders) {
      if (bo.x < x0 - 1 || bo.x > x1 || bo.z < z0 - 1 || bo.z > z1) continue;
      const ch = this.column(bo.x, bo.z);
      if (ch.h <= SEA + 1 || ch.b === 4) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 1; dy <= 2; dy++) {
        const x = bo.x + dx, z = bo.z + dz;
        if (!inChunk(x, z)) continue;
        const hr = hash2(x * 3 + dy, z * 5 - dy, seed + 55);
        if (dy === 2 && (Math.abs(dx) + Math.abs(dz) > 1 || hr < 0.3)) continue;
        if (Math.abs(dx) + Math.abs(dz) === 2 && hash2(x, z, seed + 56) < 0.5) continue;
        const y = world.heightAt(x, z) + dy;
        if (y >= H - 2) continue;
        for (let yy = y; yy < y + 6 && yy < H; yy++) { const k = idx(x, yy, z); const id = blocks[k]; if (id === B.LOG || id === B.LEAVES || id === B.BIRCH_LOG || id === B.BIRCH_LEAVES || id === B.SPRUCE_LOG || id === B.SPRUCE_LEAVES || id === B.TALL_GRASS) blocks[k] = B.AIR; }
        const roll = hash2(x + dy * 17, z, seed + 57);
        blocks[idx(x, y, z)] = roll < 0.3 ? bo.main : roll < 0.38 ? (bo.main === B.IRON_ORE ? B.COAL_ORE : B.IRON_ORE) : (roll < 0.8 ? B.STONE : B.MOSSY_COBBLE);
      }
    }
  }

  /** Abandoned mineshafts in the upper underground (a grid of 3×3 corridors per 96×96 region, drawn per chunk). */
  _mineshafts3(x0, z0, x1, z1, idx, inChunk, cols, blocks) {
    const seed = this.seed, SEA = this.sea, R = 96;
    for (let rz = Math.floor(z0 / R); rz <= Math.floor((z1 - 1) / R); rz++) for (let rx = Math.floor(x0 / R); rx <= Math.floor((x1 - 1) / R); rx++) {
      if (hash2(rx, rz, seed + 61) > 0.5) continue;
      const fy = SEA - 16 - Math.floor(hash2(rx, rz, seed + 62) * 26);
      const ox = rx * R + 8 + Math.floor(hash2(rx, rz, seed + 63) * 12), oz = rz * R + 8 + Math.floor(hash2(rx, rz, seed + 64) * 12);
      const lines = 4, step = 20;
      const corridor = (x, z, along, lc) => {
        if (!inChunk(x, z)) return;
        const c = cols[(z - z0) * CH + (x - x0)];
        if (c.dist < 70 || fy + 4 >= c.h - 4) return;                       // never break the surface
        const u = along === 'x' ? x : z, frame = (u % 4) === 0;
        const side = (along === 'x' ? z : x) !== lc;
        for (let y = fy; y <= fy + 2; y++) {
          const i = idx(x, y, z);
          if (blocks[i] === B.WATER || blocks[i] === B.LAVA) return;
          blocks[i] = B.AIR;
          if (frame && side && y < fy + 2) blocks[i] = B.LOG;
          if (frame && y === fy + 2) blocks[i] = B.PLANKS;
        }
        const fl = idx(x, fy - 1, z);
        if (blocks[fl] === B.AIR || blocks[fl] === B.WATER || blocks[fl] === B.LAVA || hash2(x, z, seed + 65) < 0.35) blocks[fl] = B.PLANKS;
        const r = hash2(x * 7, z * 3, seed + 66);
        if (!frame && side && r < 0.08) blocks[idx(x, fy + 2, z)] = B.COBWEB;
        if (frame && !side && r > 0.9) blocks[idx(x, fy + 1, z)] = B.COBWEB;
        if (!frame && side && r > 0.985) blocks[idx(x, fy, z)] = B.CHEST;
        if (frame && side && r > 0.8 && r < 0.9) blocks[idx(x, fy + 1, z)] = B.TORCH;
      };
      for (let j = 0; j < lines; j++) {
        const cz = oz + j * step;
        if (hash2(rx * 5 + j, rz, seed + 67) < 0.25) continue;
        for (let x = Math.max(x0, ox); x < Math.min(x1, ox + (lines - 1) * step + 1); x++) for (let z = cz - 1; z <= cz + 1; z++) corridor(x, z, 'x', cz);
      }
      for (let i = 0; i < lines; i++) {
        const cx = ox + i * step;
        if (hash2(rx, rz * 5 + i, seed + 68) < 0.25) continue;
        for (let z = Math.max(z0, oz); z < Math.min(z1, oz + (lines - 1) * step + 1); z++) for (let x = cx - 1; x <= cx + 1; x++) corridor(x, z, 'z', cx);
      }
    }
  }

  /** A forgotten miner's cabin in the cavern layer: a wooden room with a chest, a workbench and a lantern. */
  _cabin(x0, z0, idx, rnd, blocks, cols) {
    const L = this.L;
    const ax = x0 + 2 + Math.floor(rnd() * 4), az = z0 + 2 + Math.floor(rnd() * 5);       // 9 × 7 room inside the chunk
    const c = cols[(az - z0 + 3) * CH + (ax - x0 + 4)];
    if (c.dist < 80) return;
    // set it into an open cave if there is one in this column, otherwise carve it out of the rock
    let fy = L.cavBot + 10 + Math.floor(rnd() * (Math.min(L.cavTop, c.h - 30) - L.cavBot - 10));
    for (let y = fy; y < fy + 40 && y < c.h - 20; y++) if (blocks[idx(ax + 4, y, az + 3)] === B.AIR && blocks[idx(ax + 4, y - 1, az + 3)] !== B.AIR) { fy = y; break; }
    if (fy < L.cavBot || fy + 6 >= c.h - 12) return;
    const W = 9, Dd = 7, Hh = 5;
    for (let y = fy - 1; y <= fy + Hh; y++) for (let z = az; z < az + Dd; z++) for (let x = ax; x < ax + W; x++) {
      const edgeX = x === ax || x === ax + W - 1, edgeZ = z === az || z === az + Dd - 1;
      let id = B.AIR;
      if (y === fy - 1 || y === fy + Hh) id = B.PLANKS;
      else if (edgeX && edgeZ) id = B.LOG;
      else if (edgeX || edgeZ) id = y === fy + 2 && (x + z) % 3 === 0 ? B.GLASS : B.PLANKS;
      blocks[idx(x, y, z)] = id;
    }
    // doorways on both short sides, furniture
    for (const x of [ax, ax + W - 1]) { blocks[idx(x, fy, az + 3)] = B.AIR; blocks[idx(x, fy + 1, az + 3)] = B.AIR; }
    blocks[idx(ax + 1, fy, az + 1)] = B.CHEST;
    blocks[idx(ax + 2, fy, az + 1)] = B.WORKBENCH;
    blocks[idx(ax + W - 2, fy, az + 1)] = B.BOOKSHELF; blocks[idx(ax + W - 2, fy + 1, az + 1)] = B.BOOKSHELF;
    blocks[idx(ax + W - 2, fy, az + Dd - 2)] = B.BED;
    blocks[idx(ax + 4, fy + Hh - 1, az + 3)] = B.LANTERN;
    if (rnd() < 0.5) blocks[idx(ax + 1, fy, az + Dd - 2)] = B.CHEST;
    if (rnd() < 0.6) blocks[idx(ax + 3, fy, az + Dd - 2)] = B.FURNACE;
  }

  /** A ruined tower in the underworld, standing on an island or on a pillar out of the lava sea. */
  _ruin(x0, z0, idx, rnd, blocks) {
    const L = this.L;
    const ax = x0 + 3 + Math.floor(rnd() * 5), az = z0 + 3 + Math.floor(rnd() * 5);
    let base = L.lavaSea + 1;
    for (let y = L.lavaSea + 1; y < 60; y++) { const id = blocks[idx(ax + 2, y, az + 2)]; if (id === B.AIR && blocks[idx(ax + 2, y - 1, az + 2)] !== B.AIR && blocks[idx(ax + 2, y - 1, az + 2)] !== B.LAVA) { base = y; break; } }
    const Hh = 7 + Math.floor(rnd() * 6);
    if (base + Hh > 68) return;
    for (let x = ax; x < ax + 5; x++) for (let z = az; z < az + 5; z++) {
      const edge = x === ax || x === ax + 4 || z === az || z === az + 4, corner = (x === ax || x === ax + 4) && (z === az || z === az + 4);
      for (let y = 4; y < base; y++) { const i = idx(x, y, z); if (blocks[i] === B.LAVA || blocks[i] === B.AIR) blocks[i] = B.OBSIDIAN; }   // foundation
      for (let y = base; y < base + Hh; y++) {
        const broken = y > base + Hh - 4 && hash2(x * 5 + y, z, this.seed + 140) < 0.45;
        let id = B.AIR;
        if (corner) id = B.OBSIDIAN;
        else if (edge) id = broken ? B.AIR : (y % 4 === 2 && (x + z) % 2 === 0 ? B.AIR : (hash2(x, y * 3 + z, this.seed + 141) < 0.3 ? B.MAGMA : B.STONE_BRICKS));
        if (y === base || (y - base) % 5 === 4) id = edge ? (corner ? B.OBSIDIAN : B.STONE_BRICKS) : B.OBSIDIAN;
        blocks[idx(x, y, z)] = id;
      }
    }
    blocks[idx(ax + 2, base + 1, az)] = B.AIR; blocks[idx(ax + 2, base + 2, az)] = B.AIR;     // doorway
    blocks[idx(ax + 2, base + 1, az + 2)] = B.CHEST;
    blocks[idx(ax + 2, base + 1, az + 3)] = B.LANTERN;
    if (rnd() < 0.5) blocks[idx(ax + 1, base + 6, az + 1)] = B.CHEST;
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
