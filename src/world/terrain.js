import { B } from '../core/blocks.js';
import { Simplex, mulberry32, hash2 } from '../core/rng.js';

/** Sea level of the first (format 1) worlds; deep worlds keep theirs in world.sea. */
export const SEA_LEVEL = 20;

// biomes (world.biome): 0 plains, 1 forest, 2 hills/spruce, 3 beach, 4 blight, 5 birch,
// 6 desert (mesa on its hills), 7 savanna, 8 swamp, 9 tundra
export const BIOME = { PLAINS: 0, FOREST: 1, HILLS: 2, BEACH: 3, BLIGHT: 4, BIRCH: 5, DESERT: 6, SAVANNA: 7, SWAMP: 8, TUNDRA: 9 };
export const BIOME_NAMES = ['Луга', 'Лес', 'Горы', 'Побережье', 'Мёртвые земли', 'Березняк', 'Пустыня', 'Саванна', 'Болото', 'Тундра'];

/**
 * Chunk-by-chunk terrain generator of deep worlds (the world is too big to generate at once; chunks are made on
 * demand). Surface: a meadow plateau at the center for the village, temperate forests and hills around it and,
 * further out, deserts with mesas and pyramids, savannas, swamps and snowy tundra; a blighted rim at the map edge.
 * Underground, Terraria-style layers (depth below sea level):
 *   ~0–20  tunnels and mineshafts, coal and iron;
 *   ~20–32 the cavern layer: huge grottos, underground lakes, glowing mushroom caves, gold;
 *   below  the depths: dark stone, lava lakes with obsidian, amethyst geodes, crystals and the richest chests.
 * Deterministic per seed, independent of chunk order.
 */
const CH = 16;
export class TerrainGen {
  constructor(world) {
    this.world = world;
    const seed = this.seed = world.seed;
    this.n = new Simplex(seed); this.n2 = new Simplex(seed + 101); this.n3 = new Simplex(seed + 202);
    this.n4 = new Simplex(seed + 303); this.n5 = new Simplex(seed + 404);
    this.cx = world.size / 2; this.cz = world.size / 2;
    this.sea = world.sea;
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

  /** Climate at a column: temperature and humidity (about -0.7..0.7), tamed to temperate near the village. */
  climate(x, z, dist) {
    const calm = smooth(110, 200, dist);
    return { temp: this.n4.fbm2(x / 320 + 11, z / 320 - 7, 2) * 1.25 * calm, hum: this.n5.fbm2(x / 260 - 40, z / 260 + 90, 2) * 1.25 * calm };
  }

  /** Height and biome of a column. */
  column(x, z) {
    const { n, n2, n3 } = this, size = this.world.size, height = this.world.height, SEA = this.sea;
    const dx = x - this.cx, dz = z - this.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const edge = Math.min(x, z, size - 1 - x, size - 1 - z);
    const { temp, hum } = this.climate(x, z, dist);
    const cont = n.fbm2(x / 140, z / 140, 3);
    const hills = n2.fbm2(x / 55, z / 55, 4);
    const detail = n3.fbm2(x / 18, z / 18, 2);
    const ridge = 1 - Math.abs(n.noise2(x / 80 + 50, z / 80 - 30));
    const mount = Math.pow(Math.max(0, ridge - 0.55), 2) * 70 * Math.max(0, hills + 0.3);
    let h = SEA + 3 + cont * 7 + hills * 7 + detail * 2 + mount;
    // biome weights (smooth, so the land between biomes blends instead of forming cliffs)
    const hot = smooth(0.2, 0.36, temp), cold = smooth(-0.2, -0.36, temp);
    const dry = smooth(0.02, -0.14, hum), wet = smooth(0.22, 0.38, hum) * (1 - hot) * (1 - cold);
    const desertW = hot * dry;
    if (desertW > 0) {
      // dunes, and flat-topped mesas where the hills rise
      const dune = Math.abs(n3.noise2(x / 24, z / 30)) * 4;
      const mesa = mount > 6 || hills > 0.35 ? Math.round((SEA + 10 + mount * 0.8 + hills * 6) / 4) * 4 : 0;
      const hd = Math.max(SEA + 3 + cont * 4 + dune, mesa);
      h = h * (1 - desertW) + hd * desertW;
    }
    if (wet > 0) h = h * (1 - wet) + (SEA + 0.4 + detail * 1.4 + cont * 0.8) * wet;     // flat, soggy ground
    const plateau = SEA + 5;
    const flat = smooth(28, 48, dist);
    h = plateau * (1 - flat) + h * flat;
    const blight = 1 - smooth(6, 22, edge);
    h += blight * (n3.noise2(x / 9, z / 9) * 3 - 1);
    h = Math.max(4, Math.min(height - 6, Math.round(h)));
    let b = 0;
    const forest = n2.noise2(x / 45 + 100, z / 45);
    if (blight > 0.55) b = 4;
    else if (desertW > 0.5) b = 6;
    else if (wet > 0.5) b = 8;
    else if (h > SEA + 17) b = 2;
    else if (cold > 0.5) b = 9;
    else if (h <= SEA + 1) b = 3;
    else if (hot > 0.5) b = 7;
    else if (forest > 0.25 && dist > 30) b = n3.noise2(x / 60, z / 60 + 40) > 0.2 ? 5 : 1;
    return { h, b, dist };
  }

  /** Fill one 16×16 chunk column. Trees may spill leaves into neighbouring chunks. */
  generateChunk(ccx, ccz) {
    const world = this.world, size = world.size, height = world.height, seed = this.seed, SEA = this.sea;
    const { n, n2, n3 } = this;
    const x0 = ccx * CH, z0 = ccz * CH, x1 = Math.min(size, x0 + CH), z1 = Math.min(size, z0 + CH);
    const heights = world.heights, biome = world.biome, blocks = world.blocks;
    const rnd = mulberry32((seed ^ Math.imul(ccx + 7919, 73856093) ^ Math.imul(ccz + 104729, 19349663)) >>> 0);
    const idx = (x, y, z) => x + size * (z + size * y);
    const dists = new Float32Array(CH * CH);
    const DEEP = SEA - 30;            // dark stone below this
    // ---------------------------------------------------------------- rock, soil and water
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = this.column(x, z);
      heights[z * size + x] = c.h; biome[z * size + x] = c.b; dists[(z - z0) * CH + (x - x0)] = c.dist;
      const h = c.h, b = c.b;
      blocks[idx(x, 0, z)] = B.BEDROCK;
      const bed2 = hash2(x, z, seed) < 0.5, bed3 = hash2(x, z, seed + 1) < 0.2;
      const deepY = DEEP + Math.floor(hash2(x, z, seed + 2) * 3);
      const mesa = b === 6 && h > SEA + 8;
      for (let y = 1; y <= h; y++) {
        if ((y === 1 && bed2) || (y === 2 && bed3)) { blocks[idx(x, y, z)] = B.BEDROCK; continue; }
        let id = y < deepY ? B.DARK_STONE : B.STONE;
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
        } else if (b === 6 && depth < 9) id = B.SANDSTONE;
        if (mesa && depth > 0 && y > SEA) id = (y % 5) < 2 ? B.RED_SAND : (y % 5 === 2 ? B.SAND : B.SANDSTONE);   // banded mesa cliffs
        if (id === B.STONE && hash2(x * 7 + y, z * 3 - y, seed + 11) < 0.02) id = B.GRAVEL;
        if (id === B.STONE && b === 4 && y > h - 8) id = hash2(x, y * 31 + z, seed) < 0.5 ? B.DARK_STONE : B.MOSSY_COBBLE;
        blocks[idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) blocks[idx(x, y, z)] = (y === SEA && b === 9) ? B.ICE : B.WATER;
    }
    const inChunk = (x, z) => x >= x0 && z >= z0 && x < x1 && z < z1 && x > 0 && z > 0 && x < size - 1 && z < size - 1;
    const isWaterish = (id) => id === B.WATER || id === B.ICE;
    // ---------------------------------------------------------------- caves
    // tunnels (3D noise worms) everywhere below the surface, caverns in their layer; cave mouths open to the
    // surface only away from the village
    const CAV0 = SEA - 33, CAV1 = SEA - 13;        // cavern layer
    for (let z = Math.max(1, z0); z < Math.min(size - 1, z1); z++) for (let x = Math.max(1, x0); x < Math.min(size - 1, x1); x++) {
      const h = heights[z * size + x];
      const dist = dists[(z - z0) * CH + (x - x0)];
      const tunnels = n3.noise2(x / 38 + 300, z / 38 - 300) > -0.25;
      const mouth = dist > 90 && n2.noise2(x / 50 - 70, z / 50 + 70) > 0.45;      // where tunnels may break the surface
      const roof = dist < 60 ? h - 12 : mouth ? h + 1 : h - 4;
      let cv = 1, cw = 1, cav = 0, deep = 0;
      for (let y = 3; y < Math.min(roof, h + 1); y++) {
        let open = false;
        if (tunnels) {
          if (!(y & 1) || y === 3) { cv = n.noise3(x / 24, y / 12, z / 24); cw = n2.noise3(x / 24, y / 12, z / 24); }
          if (cv * cv + cw * cw < 0.011 + (y < SEA - 20 ? 0.006 : 0)) open = true;
        }
        if (y >= CAV0 && y <= CAV1) {
          if (!(y & 1) || y === CAV0) cav = n.noise3(x / 42, y / 16, z / 42) * 0.75 + n3.noise3(x / 15, y / 9, z / 15) * 0.25;
          const taper = Math.min(y - CAV0, CAV1 - y) / 6;          // caverns close up at the top and bottom of the layer
          if (cav > 0.5 - Math.min(1, taper) * 0.2) open = true;
        }
        if (y <= DEEP + 3) {
          // the depths: low, wide halls whose floors are lakes of lava
          if (!(y & 1) || y === 3) deep = n2.noise3(x / 36, y / 9, z / 36) * 0.8 + n.noise3(x / 12, y / 7, z / 12) * 0.2;
          if (deep > 0.4 + Math.max(0, y - DEEP) * 0.05) open = true;
        }
        if (!open) continue;
        const i = idx(x, y, z);
        if (isWaterish(blocks[i]) || isWaterish(blocks[idx(x, y + 1, z)]) || blocks[i] === B.BEDROCK) continue;
        blocks[i] = B.AIR;
      }
    }
    // the floors of the caves: lava pools in the depths, lakes and mushroom groves in the cavern layer
    const LAVA_Y = 6;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const h = heights[z * size + x];
      const lake = n3.noise2(x / 70 + 500, z / 70) > 0.32;
      const shrooms = n2.noise2(x / 90 - 200, z / 90 + 200) > 0.38;
      for (let y = 2; y < Math.min(h - 3, CAV1 + 2); y++) {
        const i = idx(x, y, z);
        if (blocks[i] !== B.AIR) continue;
        if (y <= LAVA_Y) {
          blocks[i] = B.LAVA;
          const below = idx(x, y - 1, z);
          if ((blocks[below] === B.DARK_STONE || blocks[below] === B.STONE) && hash2(x * 3, z * 5 + y, seed + 21) < 0.35) blocks[below] = B.OBSIDIAN;
          continue;
        }
        if (lake && y <= CAV0 + 5 && y > LAVA_Y + 2) { blocks[i] = B.WATER; continue; }
        if (shrooms && y >= CAV0 - 6) {
          const below = idx(x, y - 1, z);
          const bid = blocks[below];
          if ((bid === B.STONE || bid === B.DARK_STONE || bid === B.DIRT || bid === B.GRAVEL) && n3.noise2(x / 7 + y, z / 7) > -0.35) {
            blocks[below] = B.GLOW_MOSS;
            if (hash2(x, z * 7 + y, seed + 31) < 0.13) blocks[i] = B.GLOW_MUSHROOM;
          }
          const above = idx(x, y + 1, z);
          if ((blocks[above] === B.STONE || blocks[above] === B.DARK_STONE) && hash2(x * 5 + y, z, seed + 32) < 0.3) blocks[above] = B.GLOW_MOSS;
        }
      }
    }
    // ---------------------------------------------------------------- ores (veins stay inside the chunk)
    const ore = (id, perMap, minY, maxY, vein, hosts = [B.STONE, B.DARK_STONE]) => {
      const e = perMap * this.perChunk;
      const count = Math.floor(e) + (rnd() < e - Math.floor(e) ? 1 : 0);
      for (let i = 0; i < count; i++) {
        let x = x0 + Math.floor(rnd() * CH), y = minY + Math.floor(rnd() * (maxY - minY)), z = z0 + Math.floor(rnd() * CH);
        for (let k = 0; k < vein; k++) {
          if (inChunk(x, z) && y > 1 && y < height) { const j = idx(x, y, z); if (hosts.includes(blocks[j])) blocks[j] = id; }
          x += Math.round(rnd() * 2 - 1); y += Math.round(rnd() * 2 - 1); z += Math.round(rnd() * 2 - 1);
        }
      }
    };
    ore(B.COAL_ORE, 300, 12, SEA + 22, 9);
    ore(B.IRON_ORE, 140, 6, SEA - 4, 5);            // iron is a real resource: fewer, smaller veins
    ore(B.GOLD_ORE, 80, 3, SEA - 18, 5);
    ore(B.CRYSTAL_ORE, 55, 2, SEA - 28, 4);
    // surface outcrops in the hills so early iron/coal is visible
    if (rnd() < 40 * this.perChunk * 1.5) {
      const x = x0 + Math.floor(rnd() * CH), z = z0 + Math.floor(rnd() * CH);
      if (inChunk(x, z) && biome[z * size + x] === 2) blocks[idx(x, heights[z * size + x], z)] = rnd() < 0.8 ? B.COAL_ORE : B.IRON_ORE;
    }
    // amethyst geodes in the depths
    if (rnd() < 0.07) {
      const cx = x0 + 4 + Math.floor(rnd() * 8), cz = z0 + 4 + Math.floor(rnd() * 8), cy = 9 + Math.floor(rnd() * (DEEP - 8)), R = 3 + rnd() * 1.2;
      if (cy + R < heights[cz * size + cx] - 6) {
        for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let z = cz - 5; z <= cz + 5; z++) for (let x = cx - 5; x <= cx + 5; x++) {
          if (!inChunk(x, z) || y < 3) continue;
          const d = Math.hypot(x - cx, (y - cy) * 1.15, z - cz), i = idx(x, y, z);
          if (blocks[i] === B.LAVA || blocks[i] === B.BEDROCK) continue;
          if (d < R - 1.1) blocks[i] = hash2(x * 3 + y, z, seed + 41) < 0.12 && d > R - 2.2 ? B.CRYSTAL_ORE : B.AIR;
          else if (d < R) blocks[i] = B.AMETHYST;
          else if (d < R + 0.9 && blocks[i] !== B.AIR) blocks[i] = B.OBSIDIAN;
        }
      }
    }
    // ---------------------------------------------------------------- abandoned mineshafts
    this._mineshafts(x0, z0, x1, z1, idx, inChunk, dists, rnd);
    // ---------------------------------------------------------------- treasure chests in caves
    const tries = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let t = 0; t < tries; t++) {
      if (rnd() > 0.32) continue;
      const x = x0 + Math.floor(rnd() * CH), z = z0 + Math.floor(rnd() * CH);
      if (!inChunk(x, z) || dists[(z - z0) * CH + (x - x0)] < 50) continue;
      const h = heights[z * size + x];
      const start = 4 + Math.floor(rnd() * Math.max(1, h - 12));
      for (let y = start; y < h - 8; y++) {
        const i = idx(x, y, z), below = blocks[idx(x, y - 1, z)];
        if (blocks[i] === B.AIR && blocks[idx(x, y + 1, z)] === B.AIR && (below === B.STONE || below === B.DARK_STONE || below === B.GLOW_MOSS || below === B.DIRT || below === B.GRAVEL || below === B.OBSIDIAN)) {
          blocks[i] = B.CHEST;
          break;
        }
      }
    }
    // ---------------------------------------------------------------- vegetation
    for (let z = Math.max(3, z0); z < Math.min(size - 3, z1); z++) for (let x = Math.max(3, x0); x < Math.min(size - 3, x1); x++) {
      const h = heights[z * size + x];
      const top = blocks[idx(x, h, z)];
      const b = biome[z * size + x];
      const r = hash2(x, z, seed + 77);
      const dist = dists[(z - z0) * CH + (x - x0)];
      if (h + 1 >= height - 8) continue;
      const above = idx(x, h + 1, z);
      if (blocks[above] !== B.AIR) continue;
      const trnd = () => mulberry32((seed + x * 374761393 + z * 668265263) >>> 0);
      if (b === 6) {
        if (top === B.SAND && r < 0.006 && dist > 40) { const t = trnd(); cactus(world, x, h + 1, z, 1 + Math.floor(t() * 3)); }
        else if (r > 0.985) blocks[above] = B.DEAD_BUSH;
        continue;
      }
      if (b === 7) {
        if (top !== B.DRY_GRASS) continue;
        if (r < 0.007 && dist > 30) { acacia(world, x, h + 1, z, trnd()); continue; }
        const r2 = hash2(x, z, seed + 78);
        if (r2 < 0.14) blocks[above] = B.TALL_GRASS;
        else if (r2 < 0.16) blocks[above] = B.DEAD_BUSH;
        continue;
      }
      if (b === 8) {
        if ((top === B.GRASS || top === B.MUD) && r < 0.03 && dist > 30) { swampOak(world, x, h + 1, z, trnd()); continue; }
        const r2 = hash2(x, z, seed + 78);
        if (h >= SEA && r2 < 0.2 && (top === B.MUD || top === B.GRASS)) blocks[above] = B.REEDS;
        else if (top === B.GRASS && r2 < 0.32) blocks[above] = B.TALL_GRASS;
        else if (r2 < 0.335) blocks[above] = B.MUSHROOM;
        continue;
      }
      if (b === 9) {
        if (top === B.SNOW && r < 0.012 && dist > 30) spruce(world, x, h + 1, z, trnd());
        continue;
      }
      if (top === B.GRASS || top === B.SNOW) {
        const treeChance = b === 1 ? 0.045 : b === 5 ? 0.04 : b === 2 ? 0.03 : (dist < 26 ? 0 : 0.006);
        if (r < treeChance) {
          const t = trnd();
          if (b === 2) spruce(world, x, h + 1, z, t);
          else if (b === 5 || (b === 1 && t() < 0.2)) birch(world, x, h + 1, z, t);
          else oak(world, x, h + 1, z, t);
          continue;
        }
        if (top === B.GRASS) {
          const r2 = hash2(x, z, seed + 78);
          if (r2 < 0.16) blocks[above] = B.TALL_GRASS;
          else if (r2 < 0.175) blocks[above] = B.FLOWER_RED;
          else if (r2 < 0.19) blocks[above] = B.FLOWER_YELLOW;
          else if (r2 < 0.193 && b === 1) blocks[above] = B.MUSHROOM;
        }
      } else if (b === 4 && (top === B.DIRT || top === B.GRAVEL) && r < 0.04) {
        blocks[above] = B.DEAD_BUSH;
      } else if (b === 4 && r > 0.995) {
        const ph = 2 + Math.floor(hash2(x, z, seed + 90) * 4);
        for (let y = 1; y <= ph; y++) blocks[idx(x, h + y, z)] = hash2(x, y, seed + z) < 0.5 ? B.MOSSY_COBBLE : B.DARK_STONE;
      }
    }
    // ---------------------------------------------------------------- desert pyramids
    if (rnd() < 0.05) {
      const cx = x0 + 8, cz = z0 + 8;
      const c = this.column(cx, cz);
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
        const y = heights[z * size + x] + dy;
        if (y >= height - 2) continue;
        for (let yy = y; yy < y + 6 && yy < height; yy++) { const k = idx(x, yy, z); const id = blocks[k]; if (id === B.LOG || id === B.LEAVES || id === B.BIRCH_LOG || id === B.BIRCH_LEAVES || id === B.SPRUCE_LOG || id === B.SPRUCE_LEAVES || id === B.TALL_GRASS) blocks[k] = B.AIR; }
        const roll = hash2(x + dy * 17, z, seed + 57);
        blocks[idx(x, y, z)] = roll < 0.3 ? bo.main : roll < 0.38 ? (bo.main === B.IRON_ORE ? B.COAL_ORE : B.IRON_ORE) : (roll < 0.8 ? B.STONE : B.MOSSY_COBBLE);
      }
    }
  }

  /**
   * Abandoned mineshafts: the world is split into 96×96 regions; some of them hold a grid of 3×3 corridors at one
   * depth (every chunk draws its own part, so the network is seamless). Wooden frames every 4 blocks, planks over
   * gaps, cobwebs, a rare torch and treasure chests.
   */
  _mineshafts(x0, z0, x1, z1, idx, inChunk, dists, rnd) {
    const world = this.world, size = world.size, blocks = world.blocks, heights = world.heights, seed = this.seed, SEA = this.sea;
    const R = 96;
    for (let rz = Math.floor(z0 / R); rz <= Math.floor((z1 - 1) / R); rz++) for (let rx = Math.floor(x0 / R); rx <= Math.floor((x1 - 1) / R); rx++) {
      if (hash2(rx, rz, seed + 61) > 0.42) continue;
      const fy = SEA - 10 - Math.floor(hash2(rx, rz, seed + 62) * 14);       // corridor floor
      const ox = rx * R + 8 + Math.floor(hash2(rx, rz, seed + 63) * 12), oz = rz * R + 8 + Math.floor(hash2(rx, rz, seed + 64) * 12);
      const lines = 4, step = 20;
      const corridor = (x, z, along) => {
        if (!inChunk(x, z) || dists[(z - z0) * CH + (x - x0)] < 70) return;
        if (fy + 4 >= heights[z * size + x] - 3) return;                    // never break the surface
        const u = along === 'x' ? x : z;
        const frame = (u % 4) === 0;
        const across = along === 'x' ? z : x;
        const side = across === (along === 'x' ? cz : cx) - 1 || across === (along === 'x' ? cz : cx) + 1;
        for (let y = fy; y <= fy + 2; y++) {
          const i = idx(x, y, z);
          if (blocks[i] === B.WATER || blocks[i] === B.LAVA) return;
          blocks[i] = B.AIR;
          if (frame && side && y < fy + 2) blocks[i] = B.LOG;                 // posts
          if (frame && y === fy + 2) blocks[i] = B.PLANKS;                    // beam
        }
        const fl = idx(x, fy - 1, z);
        if (blocks[fl] === B.AIR || blocks[fl] === B.WATER || blocks[fl] === B.LAVA || hash2(x, z, seed + 65) < 0.35) blocks[fl] = B.PLANKS;
        const r = hash2(x * 7, z * 3, seed + 66);
        if (!frame && side && r < 0.08) blocks[idx(x, fy + 2, z)] = B.COBWEB;
        if (frame && !side && r > 0.9) blocks[idx(x, fy + 1, z)] = B.COBWEB;
        if (!frame && side && r > 0.985) blocks[idx(x, fy, z)] = B.CHEST;
        if (frame && side && r > 0.8 && r < 0.9) blocks[idx(x, fy + 1, z)] = B.TORCH;           // the miners' old torches
      };
      let cx = 0, cz = 0;
      for (let j = 0; j < lines; j++) {
        cz = oz + j * step;
        if (hash2(rx * 5 + j, rz, seed + 67) < 0.25) continue;
        for (let x = Math.max(x0, ox); x < Math.min(x1, ox + (lines - 1) * step + 1); x++) for (let z = cz - 1; z <= cz + 1; z++) corridor(x, z, 'x');
      }
      for (let i = 0; i < lines; i++) {
        cx = ox + i * step;
        if (hash2(rx, rz * 5 + i, seed + 68) < 0.25) continue;
        for (let z = Math.max(z0, oz); z < Math.min(z1, oz + (lines - 1) * step + 1); z++) for (let x = cx - 1; x <= cx + 1; x++) corridor(x, z, 'z');
      }
    }
  }

  /** A small sandstone pyramid with a hidden treasure room. */
  _pyramid(cx, gy, cz, idx, rnd) {
    const world = this.world, blocks = world.blocks;
    const H = 6;
    for (let k = 0; k <= H; k++) {
      const r = H - k;
      for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
        const edge = Math.max(Math.abs(x - cx), Math.abs(z - cz)) === r;
        const inner = k >= 1 && k <= 3 && Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= Math.min(2, r - 1);
        blocks[idx(x, gy + k, z)] = inner ? B.AIR : (edge && (x + z + k) % 7 === 0 ? B.SAND : B.SANDSTONE);
      }
      // fill down to the dunes so it doesn't float
      if (k === 0) for (let z = cz - H; z <= cz + H; z++) for (let x = cx - H; x <= cx + H; x++) for (let y = gy - 1; y > gy - 5; y--) { const i = idx(x, y, z); if (blocks[i] === B.AIR || blocks[i] === B.WATER) blocks[i] = B.SANDSTONE; }
    }
    // entrance tunnel from the south and the treasure room
    for (let z = cz + 2; z <= cz + H; z++) { blocks[idx(cx, gy + 1, z)] = B.AIR; blocks[idx(cx, gy + 2, z)] = B.AIR; }
    blocks[idx(cx, gy + 1, cz - 1)] = B.CHEST;
    blocks[idx(cx - 2, gy + 1, cz - 2)] = B.TORCH; blocks[idx(cx + 2, gy + 1, cz - 2)] = B.TORCH;
    blocks[idx(cx, gy + H + 1, cz)] = B.GOLD_ORE;
    if (rnd() < 0.5) blocks[idx(cx + 1, gy + 1, cz - 1)] = B.CHEST;
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
/** Savanna acacia: a leaning trunk that forks into flat, wide canopies. */
export function acacia(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 2);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [ax, az] = dirs[Math.floor(rnd() * 4)];
  let tx = x, tz = z;
  for (let i = 0; i < h; i++) {
    if (i >= 2 && i < h - 1 && rnd() < 0.6) { tx += ax; tz += az; }
    put(world, tx, y + i, tz, B.LOG, false);
  }
  const canopy = (cx, cy, cz, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      put(world, cx + dx, cy, cz + dz, B.ACACIA_LEAVES);
    }
    for (let dx = -r + 1; dx <= r - 1; dx++) for (let dz = -r + 1; dz <= r - 1; dz++) if (Math.abs(dx) + Math.abs(dz) < r) put(world, cx + dx, cy + 1, cz + dz, B.ACACIA_LEAVES);
  };
  canopy(tx, y + h, tz, 3);
  if (rnd() < 0.6) {
    const bx = x - ax * 2, bz = z - az * 2;
    put(world, x - ax, y + 2, z - az, B.LOG, false); put(world, bx, y + 3, bz, B.LOG, false);
    canopy(bx, y + 4, bz, 2);
  }
}
/** Swamp oak: an oak with a wide, drooping crown. */
export function swampOak(world, x, y, z, rnd) {
  const h = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.LOG, false);
  const top = y + h;
  for (let dy = -1; dy <= 1; dy++) {
    const r = dy === 1 ? 1 : 3;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
      if (dy === -1 && Math.abs(dx) < 3 && Math.abs(dz) < 3) continue;
      put(world, x + dx, top + dy, z + dz, B.LEAVES);
    }
  }
  // hanging curtains of leaves
  for (let k = 0; k < 8; k++) {
    const a = rnd() * Math.PI * 2, hx = x + Math.round(Math.cos(a) * 3), hz = z + Math.round(Math.sin(a) * 3);
    const L = 1 + Math.floor(rnd() * 3);
    for (let i = 1; i <= L; i++) put(world, hx, top - 1 - i, hz, B.LEAVES);
  }
}
/** A cactus column. */
export function cactus(world, x, y, z, h) {
  for (let i = 0; i < h; i++) put(world, x, y + i, z, B.CACTUS);
}
