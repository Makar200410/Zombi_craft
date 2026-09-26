import { B } from '../core/blocks.js';
import { Simplex, mulberry32, hash2 } from '../core/rng.js';

export const SEA_LEVEL = 20;

/**
 * Fills world.blocks. Layout: meadow plateau at the center for the village, rolling hills & forests around,
 * lakes, snowy peaks, caves with ores, and a blighted rim near the map edge where the dead rise.
 */
export function generateTerrain(world) {
  const { size, height } = world;
  const seed = world.seed;
  const n = new Simplex(seed);
  const n2 = new Simplex(seed + 101);
  const n3 = new Simplex(seed + 202);
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const cx = size / 2, cz = size / 2;
  const heights = new Int16Array(size * size);
  const biome = new Uint8Array(size * size); // 0 plains,1 forest,2 hills/spruce,3 beach,4 blight,5 birch

  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const dx = x - cx, dz = z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const edge = Math.min(x, z, size - 1 - x, size - 1 - z);
    const cont = n.fbm2(x / 140, z / 140, 3);
    const hills = n2.fbm2(x / 55, z / 55, 4);
    const detail = n3.fbm2(x / 18, z / 18, 2);
    const ridge = 1 - Math.abs(n.noise2(x / 80 + 50, z / 80 - 30));
    let h = SEA_LEVEL + 3 + cont * 7 + hills * 7 + detail * 2 + Math.pow(Math.max(0, ridge - 0.55), 2) * 70 * Math.max(0, hills + 0.3);
    // flatten the village plateau
    const plateau = SEA_LEVEL + 5;
    const flat = smooth(28, 48, dist);
    h = plateau * (1 - flat) + h * flat;
    // blight rim: lower, jagged terrain near edges
    const blight = 1 - smooth(6, 22, edge);
    h += blight * (n3.noise2(x / 9, z / 9) * 3 - 1);
    h = Math.max(4, Math.min(height - 6, Math.round(h)));
    heights[z * size + x] = h;
    let b = 0;
    const forest = n2.noise2(x / 45 + 100, z / 45);
    if (blight > 0.55) b = 4;
    else if (h <= SEA_LEVEL + 1) b = 3;
    else if (h > SEA_LEVEL + 17) b = 2;
    else if (forest > 0.25 && dist > 30) b = n3.noise2(x / 60, z / 60 + 40) > 0.2 ? 5 : 1;
    biome[z * size + x] = b;
  }
  world.biome = biome;

  const set = (x, y, z, id) => { world.blocks[world.index(x, y, z)] = id; };
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const h = heights[z * size + x];
    const b = biome[z * size + x];
    set(x, 0, z, B.BEDROCK);
    if (hash2(x, z, seed) < 0.5) set(x, 1, z, B.BEDROCK);
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
      set(x, y, z, id);
    }
    for (let y = h + 1; y <= SEA_LEVEL; y++) set(x, y, z, B.WATER);
  }

  // caves (3D worms via noise), keep away from the village plateau surface
  for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
    const h = heights[z * size + x];
    const dist = Math.hypot(x - cx, z - cz);
    for (let y = 3; y < h - 1; y++) {
      if (dist < 34 && y > h - 8) continue;
      const v = n.noise3(x / 22, y / 14, z / 22), w = n2.noise3(x / 22, y / 14, z / 22);
      if (v * v + w * w < 0.012 + (y < 12 ? 0.01 : 0)) {
        const i = world.index(x, y, z);
        if (world.blocks[i] !== B.WATER && world.blocks[world.index(x, y + 1, z)] !== B.WATER) world.blocks[i] = B.AIR;
      }
    }
  }

  // ores
  const ore = (id, count, minY, maxY, vein) => {
    for (let i = 0; i < count; i++) {
      let x = Math.floor(rnd() * size), y = minY + Math.floor(rnd() * (maxY - minY)), z = Math.floor(rnd() * size);
      for (let k = 0; k < vein; k++) {
        const j = world.index(x, y, z);
        if (x > 0 && z > 0 && x < size - 1 && z < size - 1 && y > 1 && world.blocks[j] === B.STONE) world.blocks[j] = id;
        x += Math.round(rnd() * 2 - 1); y += Math.round(rnd() * 2 - 1); z += Math.round(rnd() * 2 - 1);
      }
    }
  };
  const area = (size * size) / (192 * 192);
  ore(B.COAL_ORE, 260 * area, 5, 40, 9);
  ore(B.IRON_ORE, 200 * area, 3, 32, 6);
  ore(B.GOLD_ORE, 70 * area, 2, 18, 5);
  ore(B.CRYSTAL_ORE, 45 * area, 2, 14, 4);
  // a few surface outcrops so early game has iron/coal visible in hills
  for (let i = 0; i < 40 * area; i++) {
    const x = 4 + Math.floor(rnd() * (size - 8)), z = 4 + Math.floor(rnd() * (size - 8));
    if (biome[z * size + x] !== 2) continue;
    const h = heights[z * size + x];
    world.blocks[world.index(x, h, z)] = rnd() < 0.6 ? B.COAL_ORE : B.IRON_ORE;
  }

  // vegetation
  for (let z = 3; z < size - 3; z++) for (let x = 3; x < size - 3; x++) {
    const h = heights[z * size + x];
    const top = world.blocks[world.index(x, h, z)];
    const b = biome[z * size + x];
    const r = hash2(x, z, seed + 77);
    const dist = Math.hypot(x - cx, z - cz);
    if (h + 1 >= height - 8) continue;
    if (top === B.GRASS || top === B.SNOW) {
      const treeChance = b === 1 ? 0.045 : b === 5 ? 0.04 : b === 2 ? 0.03 : (dist < 26 ? 0 : 0.006);
      if (r < treeChance) {
        if (b === 2) spruce(world, x, h + 1, z, rnd);
        else if (b === 5 || (b === 1 && rnd() < 0.2)) birch(world, x, h + 1, z, rnd);
        else oak(world, x, h + 1, z, rnd);
        continue;
      }
      if (top === B.GRASS) {
        const r2 = hash2(x, z, seed + 78);
        if (r2 < 0.16) world.blocks[world.index(x, h + 1, z)] = B.TALL_GRASS;
        else if (r2 < 0.175) world.blocks[world.index(x, h + 1, z)] = B.FLOWER_RED;
        else if (r2 < 0.19) world.blocks[world.index(x, h + 1, z)] = B.FLOWER_YELLOW;
        else if (r2 < 0.193 && b === 1) world.blocks[world.index(x, h + 1, z)] = B.MUSHROOM;
      }
    } else if (b === 4 && (top === B.DIRT || top === B.GRAVEL) && r < 0.04) {
      world.blocks[world.index(x, h + 1, z)] = B.DEAD_BUSH;
    } else if (b === 4 && r > 0.995) {
      // ruined pillars in the blight
      const ph = 2 + Math.floor(rnd() * 4);
      for (let y = 1; y <= ph; y++) world.blocks[world.index(x, h + y, z)] = rnd() < 0.5 ? B.MOSSY_COBBLE : B.DARK_STONE;
    }
  }
  // ore boulders around the village (radius ~30–65): visible coal & iron so the player can find ore early
  const boulders = Math.round(14 * Math.sqrt(area));
  for (let i = 0, tries = 0; i < boulders && tries < 400; tries++) {
    const ang = rnd() * Math.PI * 2, r = 30 + rnd() * 35;
    const bx = Math.round(cx + Math.cos(ang) * r), bz = Math.round(cz + Math.sin(ang) * r);
    if (bx < 6 || bz < 6 || bx >= size - 6 || bz >= size - 6) continue;
    const h = heights[bz * size + bx];
    if (h <= SEA_LEVEL + 1 || biome[bz * size + bx] === 4) continue;
    const oreMain = i % 3 === 2 ? B.COAL_ORE : (i % 2 ? B.IRON_ORE : B.COAL_ORE);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 1; dy <= 2; dy++) {
      if (dy === 2 && (Math.abs(dx) + Math.abs(dz) > 1 || rnd() < 0.3)) continue;
      if (Math.abs(dx) + Math.abs(dz) === 2 && rnd() < 0.5) continue;
      const x = bx + dx, z = bz + dz, y = heights[z * size + x] + dy;
      if (y >= height - 2) continue;
      for (let yy = y; yy < y + 6 && yy < height; yy++) { const k = world.index(x, yy, z); const id = world.blocks[k]; if (id === B.LOG || id === B.LEAVES || id === B.BIRCH_LOG || id === B.BIRCH_LEAVES || id === B.SPRUCE_LOG || id === B.SPRUCE_LEAVES || id === B.TALL_GRASS) world.blocks[k] = B.AIR; }
      const roll = rnd();
      world.blocks[world.index(x, y, z)] = roll < 0.45 ? oreMain : roll < 0.6 ? (oreMain === B.IRON_ORE ? B.COAL_ORE : B.IRON_ORE) : (roll < 0.85 ? B.STONE : B.MOSSY_COBBLE);
    }
    i++;
  }
  world.heights = heights;
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
