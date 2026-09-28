import { B } from '../core/blocks.js';
import { Simplex, mulberry32, hash2 } from '../core/rng.js';

export const SEA_LEVEL = 20;

/**
 * Chunk-by-chunk terrain generator (the world is too big to generate at once; chunks are made on demand).
 * Layout: meadow plateau at the center for the village, rolling hills & forests around, lakes, snowy peaks,
 * caves with ores, and a blighted rim near the map edge. Deterministic per seed, independent of chunk order.
 */
const CH = 16;
export class TerrainGen {
  constructor(world) {
    this.world = world;
    const seed = this.seed = world.seed;
    this.n = new Simplex(seed); this.n2 = new Simplex(seed + 101); this.n3 = new Simplex(seed + 202);
    this.cx = world.size / 2; this.cz = world.size / 2;
    // ore densities are defined per 192×192 blocks; per chunk that is 256 / 36864 of it
    this.perChunk = 256 / 36864;
    // ore boulders around the village (radius ~30–65): visible coal & iron so the player finds ore early
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    this.boulders = [];
    for (let i = 0; i < 28; i++) {
      const ang = rnd() * Math.PI * 2, r = 30 + rnd() * 35;
      this.boulders.push({ x: Math.round(this.cx + Math.cos(ang) * r), z: Math.round(this.cz + Math.sin(ang) * r), main: i % 3 === 2 ? B.COAL_ORE : (i % 2 ? B.IRON_ORE : B.COAL_ORE) });
    }
  }

  /** Height and biome of a column (0 plains, 1 forest, 2 hills/spruce, 3 beach, 4 blight, 5 birch). */
  column(x, z) {
    const { n, n2, n3 } = this, size = this.world.size, height = this.world.height;
    const dx = x - this.cx, dz = z - this.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const edge = Math.min(x, z, size - 1 - x, size - 1 - z);
    const cont = n.fbm2(x / 140, z / 140, 3);
    const hills = n2.fbm2(x / 55, z / 55, 4);
    const detail = n3.fbm2(x / 18, z / 18, 2);
    const ridge = 1 - Math.abs(n.noise2(x / 80 + 50, z / 80 - 30));
    let h = SEA_LEVEL + 3 + cont * 7 + hills * 7 + detail * 2 + Math.pow(Math.max(0, ridge - 0.55), 2) * 70 * Math.max(0, hills + 0.3);
    const plateau = SEA_LEVEL + 5;
    const flat = smooth(28, 48, dist);
    h = plateau * (1 - flat) + h * flat;
    const blight = 1 - smooth(6, 22, edge);
    h += blight * (n3.noise2(x / 9, z / 9) * 3 - 1);
    h = Math.max(4, Math.min(height - 6, Math.round(h)));
    let b = 0;
    const forest = n2.noise2(x / 45 + 100, z / 45);
    if (blight > 0.55) b = 4;
    else if (h <= SEA_LEVEL + 1) b = 3;
    else if (h > SEA_LEVEL + 17) b = 2;
    else if (forest > 0.25 && dist > 30) b = n3.noise2(x / 60, z / 60 + 40) > 0.2 ? 5 : 1;
    return { h, b, dist };
  }

  /** Fill one 16×16 chunk column. Trees may spill leaves into neighbouring chunks. */
  generateChunk(ccx, ccz) {
    const world = this.world, size = world.size, height = world.height, seed = this.seed;
    const { n, n2, n3 } = this;
    const x0 = ccx * CH, z0 = ccz * CH, x1 = Math.min(size, x0 + CH), z1 = Math.min(size, z0 + CH);
    const heights = world.heights, biome = world.biome, blocks = world.blocks;
    const rnd = mulberry32((seed ^ Math.imul(ccx + 7919, 73856093) ^ Math.imul(ccz + 104729, 19349663)) >>> 0);
    const idx = (x, y, z) => x + size * (z + size * y);
    const dists = new Float32Array(CH * CH);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = this.column(x, z);
      heights[z * size + x] = c.h; biome[z * size + x] = c.b; dists[(z - z0) * CH + (x - x0)] = c.dist;
      const h = c.h, b = c.b;
      blocks[idx(x, 0, z)] = B.BEDROCK;
      if (hash2(x, z, seed) < 0.5) blocks[idx(x, 1, z)] = B.BEDROCK;
      for (let y = 1; y <= h; y++) {
        let id = B.STONE;
        const depth = h - y;
        if (depth === 0) {
          if (b === 3) id = h < SEA_LEVEL ? (hash2(x, z, seed + 3) < 0.3 ? B.GRAVEL : B.SAND) : B.SAND;
          else if (b === 4) id = hash2(x, z, seed + 4) < 0.35 ? B.DARK_STONE : (hash2(x, z, seed + 5) < 0.5 ? B.GRAVEL : B.DIRT);
          else if (b === 2 && h > SEA_LEVEL + 24) id = B.SNOW;
          else if (b === 2 && h > SEA_LEVEL + 21 && hash2(x, z, seed + 6) < 0.5) id = B.STONE;
          else id = h < SEA_LEVEL ? B.DIRT : B.GRASS;
        } else if (depth < 4) {
          id = (b === 3) ? B.SAND : (b === 4 && depth < 2 ? B.GRAVEL : B.DIRT);
          if (b === 2 && h > SEA_LEVEL + 21) id = B.STONE;
        }
        if (id === B.STONE && hash2(x * 7 + y, z * 3 - y, seed + 11) < 0.02) id = B.GRAVEL;
        if (id === B.STONE && b === 4 && y > h - 8) id = hash2(x, y * 31 + z, seed) < 0.5 ? B.DARK_STONE : B.MOSSY_COBBLE;
        if (y === 1 && blocks[idx(x, 1, z)] === B.BEDROCK) continue;
        blocks[idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[idx(x, y, z)] = B.WATER;
    }
    // caves (3D worms via noise), kept away from the village plateau surface
    for (let z = Math.max(1, z0); z < Math.min(size - 1, z1); z++) for (let x = Math.max(1, x0); x < Math.min(size - 1, x1); x++) {
      if (n3.noise2(x / 38 + 300, z / 38 - 300) < -0.15) continue;
      const h = heights[z * size + x];
      const dist = dists[(z - z0) * CH + (x - x0)];
      let cv = 1, cw = 1;
      for (let y = 3; y < h - 1; y++) {
        if (dist < 34 && y > h - 8) continue;
        if (!(y & 1) || y === 3) { cv = n.noise3(x / 22, y / 14, z / 22); cw = n2.noise3(x / 22, y / 14, z / 22); }
        if (cv * cv + cw * cw < 0.012 + (y < 12 ? 0.01 : 0)) {
          const i = idx(x, y, z);
          if (blocks[i] !== B.WATER && blocks[idx(x, y + 1, z)] !== B.WATER) blocks[i] = B.AIR;
        }
      }
    }
    // ores (veins stay inside the chunk)
    const inChunk = (x, z) => x >= x0 && z >= z0 && x < x1 && z < z1 && x > 0 && z > 0 && x < size - 1 && z < size - 1;
    const ore = (id, perMap, minY, maxY, vein) => {
      const e = perMap * this.perChunk;
      const count = Math.floor(e) + (rnd() < e - Math.floor(e) ? 1 : 0);
      for (let i = 0; i < count; i++) {
        let x = x0 + Math.floor(rnd() * CH), y = minY + Math.floor(rnd() * (maxY - minY)), z = z0 + Math.floor(rnd() * CH);
        for (let k = 0; k < vein; k++) {
          if (inChunk(x, z) && y > 1 && y < height) { const j = idx(x, y, z); if (blocks[j] === B.STONE) blocks[j] = id; }
          x += Math.round(rnd() * 2 - 1); y += Math.round(rnd() * 2 - 1); z += Math.round(rnd() * 2 - 1);
        }
      }
    };
    ore(B.COAL_ORE, 260, 5, 40, 9);
    ore(B.IRON_ORE, 200, 3, 32, 6);
    ore(B.GOLD_ORE, 70, 2, 18, 5);
    ore(B.CRYSTAL_ORE, 45, 2, 14, 4);
    // surface outcrops in the hills so early iron/coal is visible
    if (rnd() < 40 * this.perChunk * 1.5) {
      const x = x0 + Math.floor(rnd() * CH), z = z0 + Math.floor(rnd() * CH);
      if (inChunk(x, z) && biome[z * size + x] === 2) blocks[idx(x, heights[z * size + x], z)] = rnd() < 0.6 ? B.COAL_ORE : B.IRON_ORE;
    }
    // vegetation
    for (let z = Math.max(3, z0); z < Math.min(size - 3, z1); z++) for (let x = Math.max(3, x0); x < Math.min(size - 3, x1); x++) {
      const h = heights[z * size + x];
      const top = blocks[idx(x, h, z)];
      const b = biome[z * size + x];
      const r = hash2(x, z, seed + 77);
      const dist = dists[(z - z0) * CH + (x - x0)];
      if (h + 1 >= height - 8) continue;
      if (top === B.GRASS || top === B.SNOW) {
        const treeChance = b === 1 ? 0.045 : b === 5 ? 0.04 : b === 2 ? 0.03 : (dist < 26 ? 0 : 0.006);
        if (r < treeChance) {
          const trnd = mulberry32((seed + x * 374761393 + z * 668265263) >>> 0);
          if (b === 2) spruce(world, x, h + 1, z, trnd);
          else if (b === 5 || (b === 1 && trnd() < 0.2)) birch(world, x, h + 1, z, trnd);
          else oak(world, x, h + 1, z, trnd);
          continue;
        }
        if (top === B.GRASS) {
          const r2 = hash2(x, z, seed + 78), i = idx(x, h + 1, z);
          if (blocks[i] !== B.AIR) continue;
          if (r2 < 0.16) blocks[i] = B.TALL_GRASS;
          else if (r2 < 0.175) blocks[i] = B.FLOWER_RED;
          else if (r2 < 0.19) blocks[i] = B.FLOWER_YELLOW;
          else if (r2 < 0.193 && b === 1) blocks[i] = B.MUSHROOM;
        }
      } else if (b === 4 && (top === B.DIRT || top === B.GRAVEL) && r < 0.04) {
        blocks[idx(x, h + 1, z)] = B.DEAD_BUSH;
      } else if (b === 4 && r > 0.995) {
        const ph = 2 + Math.floor(hash2(x, z, seed + 90) * 4);
        for (let y = 1; y <= ph; y++) blocks[idx(x, h + y, z)] = hash2(x, y, seed + z) < 0.5 ? B.MOSSY_COBBLE : B.DARK_STONE;
      }
    }
    // ore boulders whose cells fall into this chunk
    for (const bo of this.boulders) {
      if (bo.x < x0 - 1 || bo.x > x1 || bo.z < z0 - 1 || bo.z > z1) continue;
      const ch = this.column(bo.x, bo.z);
      if (ch.h <= SEA_LEVEL + 1 || ch.b === 4) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 1; dy <= 2; dy++) {
        const x = bo.x + dx, z = bo.z + dz;
        if (!inChunk(x, z)) continue;
        const hr = hash2(x * 3 + dy, z * 5 - dy, seed + 55);
        if (dy === 2 && (Math.abs(dx) + Math.abs(dz) > 1 || hr < 0.3)) continue;
        if (Math.abs(dx) + Math.abs(dz) === 2 && hash2(x, z, seed + 56) < 0.5) continue;
        const y = heights[z * size + x] + dy;
        if (y >= height - 2) continue;
        for (let yy = y; yy < y + 6 && yy < height; yy++) { const k = idx(x, yy, z); const id = blocks[k]; if (id === B.LOG || id === B.LEAVES || id === B.BIRCH_LOG || id === B.BIRCH_LEAVES || id === B.SPRUCE_LOG || id === B.SPRUCE_LEAVES || id === B.TALL_GRASS) blocks[k] = B.AIR; }
        const roll = hash2(x + dy * 17, z, seed + 57);
        blocks[idx(x, y, z)] = roll < 0.45 ? bo.main : roll < 0.6 ? (bo.main === B.IRON_ORE ? B.COAL_ORE : B.IRON_ORE) : (roll < 0.85 ? B.STONE : B.MOSSY_COBBLE);
      }
    }
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function put(world, x, y, z, id, onlyAir = true) {
  if (x < 0 || z < 0 || x >= world.size || z >= world.size || y < 0 || y >= world.height) return;
  const i = world.index(x, y, z);
  const cur = world.blocks[i];
  if (onlyAir && cur !== B.AIR && cur !== B.TALL_GRASS) return;
  world.blocks[i] = id;
}

export function oak(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.LOG, false);
  const top = y + h;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy >= 0 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || rnd() < 0.5)) continue;
      put(world, x + dx, top + dy, z + dz, B.LEAVES);
    }
  }
  put(world, x, top + 1, z, B.LEAVES);
}
export function birch(world, x, y, z, rnd) {
  const h = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.BIRCH_LOG, false);
  const top = y + h;
  for (let dy = -3; dy <= 1; dy++) {
    const r = dy >= 0 || dy === -3 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.6) continue;
      put(world, x + dx, top + dy, z + dz, B.BIRCH_LEAVES);
    }
  }
}
export function spruce(world, x, y, z, rnd) {
  const h = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.SPRUCE_LOG, false);
  let r = 2;
  for (let yy = y + 2; yy <= y + h + 1; yy++) {
    const rr = Math.max(0, r);
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 1 : 0)) continue;
      put(world, x + dx, yy, z + dz, B.SPRUCE_LEAVES);
    }
    r = (yy - y) % 2 === 0 ? r - 1 : r; if (r < 0) r = 1;
    if (yy > y + h - 2) r = 0;
  }
  put(world, x, y + h + 1, z, B.SPRUCE_LEAVES);
  put(world, x, y + h + 2, z, B.SPRUCE_LEAVES);
}
