// Building types & block blueprints (Millénaire-style medieval village).
// Local coords: x ∈ [0,w), z ∈ [0,d), dy = 0 is the ground/foundation layer (replaces the terrain top block).
// The front (door side) faces +z at rotation 0. rot r turns the building r×90°:
//   rot0 front +z, rot1 front -x, rot2 front -z, rot3 front +x.
// blueprint(rot, variant) -> [{dx,dy,dz,id}] ; layout(rot, variant) -> {w, d, height, points, plots, quarry}
import { B } from '../core/blocks.js';

class BP {
  constructor(w, d) { this.w = w; this.d = d; this.cells = new Map(); this.pts = {}; this.plots = []; this.quarry = null; }
  k(x, y, z) { return x + ',' + y + ',' + z; }
  set(x, y, z, id) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d || y < 0) return this;
    if (id === B.AIR) this.cells.delete(this.k(x, y, z)); else this.cells.set(this.k(x, y, z), { dx: x, dy: y, dz: z, id });
    return this;
  }
  get(x, y, z) { const c = this.cells.get(this.k(x, y, z)); return c ? c.id : B.AIR; }
  del(x, y, z) { this.cells.delete(this.k(x, y, z)); return this; }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
    return this;
  }
  /** perimeter walls of a rectangle */
  ring(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, y, z, id);
    return this;
  }
  posts(x0, z0, x1, z1, y0, y1, id) { for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.box(x, y0, z, x, y1, z, id); return this; }
  /** Stepped gable roof with its ridge along X. Gable end walls (triangles) filled at x = ex0 / ex1 with endId. */
  gableX(x0, x1, z0, z1, y0, id, endId, ex0, ex1, ridgeId) {
    for (let k = 0; z0 + k <= z1 - k; k++) {
      const y = y0 + k, za = z0 + k, zb = z1 - k;
      const rid = za === zb || za + 1 === zb;
      for (let x = x0; x <= x1; x++) { this.set(x, y, za, rid && ridgeId ? ridgeId : id); this.set(x, y, zb, rid && ridgeId ? ridgeId : id); }
      if (k >= 1 && endId) for (let z = za + 1; z <= zb - 1; z++) { this.set(ex0, y, z, endId); this.set(ex1, y, z, endId); }
    }
    return this;
  }
  gableZ(x0, x1, z0, z1, y0, id, endId, ez0, ez1, ridgeId) {
    for (let k = 0; x0 + k <= x1 - k; k++) {
      const y = y0 + k, xa = x0 + k, xb = x1 - k;
      const rid = xa === xb || xa + 1 === xb;
      for (let z = z0; z <= z1; z++) { this.set(xa, y, z, rid && ridgeId ? ridgeId : id); this.set(xb, y, z, rid && ridgeId ? ridgeId : id); }
      if (k >= 1 && endId) for (let x = xa + 1; x <= xb - 1; x++) { this.set(x, y, ez0, endId); this.set(x, y, ez1, endId); }
    }
    return this;
  }
  point(name, x, y, z) { (this.pts[name] || (this.pts[name] = [])).push({ dx: x, dy: y, dz: z }); return this; }
}

// ---------------------------------------------------------------- designs

function townHall(v) {
  const bp = new BP(11, 11);
  // plinth & floors
  bp.box(0, 0, 0, 10, 0, 10, B.GRASS);
  bp.box(1, 0, 1, 9, 0, 9, B.STONE_BRICKS);
  bp.box(2, 0, 2, 8, 0, 8, B.PLANKS);
  bp.box(3, 0, 10, 7, 0, 10, B.PATH);
  bp.set(5, 0, 10, B.COBBLESTONE);
  // ground floor: stone bricks, mossy base
  bp.ring(1, 1, 1, 9, 1, 9, B.COBBLESTONE);
  bp.ring(1, 2, 1, 9, 2, 9, B.STONE_BRICKS);
  bp.ring(1, 3, 1, 9, 3, 9, B.PLANKS);                  // floor band of the upper storey
  bp.ring(1, 4, 1, 9, 5, 9, B.TIMBER_FRAME);
  bp.ring(1, 6, 1, 9, 6, 9, B.PLANKS);                  // top plate
  bp.posts(1, 1, 9, 9, 1, 6, B.SPRUCE_LOG);
  for (const [x, z] of [[5, 1], [1, 5], [9, 5]]) bp.box(x, 4, z, x, 5, z, B.SPRUCE_LOG);
  // entrance with log door frame
  bp.box(4, 1, 9, 4, 3, 9, B.SPRUCE_LOG); bp.box(6, 1, 9, 6, 3, 9, B.SPRUCE_LOG);
  bp.del(5, 1, 9); bp.del(5, 2, 9);
  // windows
  for (const x of [3, 7]) { bp.set(x, 2, 9, B.GLASS); bp.set(x, 2, 1, B.GLASS); bp.box(x, 4, 9, x, 5, 9, B.GLASS); bp.box(x, 4, 1, x, 5, 1, B.GLASS); }
  for (const z of [3, 7]) { bp.set(1, 2, z, B.GLASS); bp.set(9, 2, z, B.GLASS); bp.box(1, 4, z, 1, 5, z, B.GLASS); bp.box(9, 4, z, 9, 5, z, B.GLASS); }
  // banners on the façade and sides
  bp.box(5, 4, 9, 5, 5, 9, B.BANNER);
  // roof
  bp.gableX(0, 10, 0, 10, 6, B.ROOF_TILES, B.PLASTER, 1, 9);
  bp.set(1, 8, 5, B.GLASS); bp.set(9, 8, 5, B.GLASS);
  bp.set(1, 7, 3, B.SPRUCE_LOG); bp.set(1, 7, 7, B.SPRUCE_LOG); bp.set(9, 7, 3, B.SPRUCE_LOG); bp.set(9, 7, 7, B.SPRUCE_LOG);
  // cupola / bell tower on the ridge
  bp.box(4, 11, 4, 6, 11, 6, B.PLANKS);
  bp.posts(4, 4, 6, 6, 12, 13, B.SPRUCE_LOG);
  bp.set(5, 12, 5, B.LANTERN);
  bp.box(3, 14, 3, 7, 14, 7, B.ROOF_TILES);
  bp.box(4, 15, 4, 6, 15, 6, B.ROOF_TILES);
  bp.set(5, 16, 5, B.SPRUCE_LOG); bp.set(5, 17, 5, B.SPRUCE_LOG); bp.set(5, 18, 5, B.BANNER);
  // porch lanterns on posts
  for (const x of [3, 7]) { bp.box(x, 1, 10, x, 2, 10, B.SPRUCE_LOG); bp.set(x, 3, 10, B.LANTERN); }
  // hedges & flowers in front
  bp.set(1, 1, 10, B.LEAVES); bp.set(9, 1, 10, B.LEAVES); bp.set(2, 1, 10, B.FLOWER_RED); bp.set(8, 1, 10, B.FLOWER_YELLOW);
  // interior
  bp.box(2, 1, 2, 8, 2, 2, B.BOOKSHELF);
  bp.set(5, 1, 2, B.WORKBENCH); bp.set(5, 2, 2, B.BANNER);
  bp.set(2, 1, 8, B.HAY_BALE); bp.set(8, 1, 8, B.LOG);
  bp.set(5, 5, 5, B.LANTERN);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 5, 1, 6);
  bp.point('work', 5, 1, 4);
  return bp;
}

function house(v) {
  const bp = new BP(7, 7);
  const roof = v & 1 ? B.ROOF_TILES : B.THATCH;
  const upper = v & 2 ? B.PLASTER : B.TIMBER_FRAME;
  const post = v & 1 ? B.SPRUCE_LOG : B.LOG;
  bp.box(0, 0, 0, 6, 0, 6, B.GRASS);
  bp.box(1, 0, 1, 5, 0, 5, B.COBBLESTONE);
  bp.box(2, 0, 2, 4, 0, 4, B.PLANKS);
  bp.set(3, 0, 6, B.PATH);
  bp.ring(1, 1, 1, 5, 1, 5, B.COBBLESTONE);
  bp.ring(1, 2, 1, 5, 2, 5, upper);
  bp.ring(1, 3, 1, 5, 3, 5, B.PLANKS);
  bp.posts(1, 1, 5, 5, 1, 3, post);
  bp.del(3, 1, 5); bp.del(3, 2, 5);
  bp.set(1, 2, 3, B.GLASS); bp.set(5, 2, 3, B.GLASS); bp.set(3, 2, 1, B.GLASS);
  bp.gableX(0, 6, 0, 6, 3, roof, upper, 1, 5);
  bp.set(1, 4, 3, B.GLASS); bp.set(5, 4, 3, B.GLASS);
  // fireplace + chimney
  bp.set(4, 1, 2, B.FURNACE);
  bp.box(4, 2, 2, 4, 7, 2, B.COBBLESTONE);
  bp.set(2, 1, 2, B.WORKBENCH);
  bp.set(2, 1, 4, B.HAY_BALE);
  // front garden
  bp.set(1, 1, 6, B.LEAVES); bp.set(5, 1, 6, B.LEAVES);
  bp.set(2, 1, 6, v & 2 ? B.FLOWER_YELLOW : B.FLOWER_RED); bp.set(4, 1, 6, B.TORCH);
  bp.point('door', 3, 1, 6);
  bp.point('inside', 3, 1, 3);
  return bp;
}

function lumberCamp(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.PATH);
  bp.box(1, 0, 1, 5, 0, 3, B.PLANKS);
  // lean-to shed
  bp.box(1, 1, 1, 5, 3, 1, B.PLANKS);
  bp.box(1, 1, 1, 1, 2, 3, B.PLANKS); bp.box(5, 1, 1, 5, 2, 3, B.PLANKS);
  bp.posts(1, 1, 5, 3, 1, 3, B.SPRUCE_LOG);
  bp.box(1, 4, 1, 5, 4, 1, B.SPRUCE_LOG);
  bp.box(0, 4, 0, 6, 4, 2, B.PLANKS);
  bp.box(0, 3, 3, 6, 3, 4, B.PLANKS);
  bp.box(0, 4, 1, 6, 4, 1, B.SPRUCE_LOG);
  // log piles under the roof
  bp.box(2, 1, 2, 4, 1, 2, B.LOG); bp.box(2, 2, 2, 3, 2, 2, B.BIRCH_LOG);
  bp.set(4, 1, 3, B.WORKBENCH);
  // chopping stump & stacked logs in the yard
  bp.set(1, 1, 5, B.LOG);
  bp.box(5, 1, 5, 6, 1, 6, B.SPRUCE_LOG); bp.set(6, 2, 6, B.SPRUCE_LOG);
  bp.set(0, 1, 6, B.TORCH); bp.set(3, 3, 3, B.LANTERN);
  bp.point('door', 3, 1, 5);
  bp.point('work', 2, 1, 5);
  return bp;
}

function farm(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.PATH);
  // fence ring of logs with a gate
  bp.ring(0, 1, 0, 8, 1, 8, B.LOG);
  bp.del(4, 1, 8);
  for (const [x, z] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { bp.set(x, 2, z, B.LOG); bp.set(x, 3, z, B.TORCH); }
  // fields & irrigation channel
  for (let z = 2; z <= 7; z++) {
    for (const x of [1, 2, 3, 5, 6, 7]) { bp.set(x, 0, z, B.FARMLAND); bp.plots.push({ dx: x, dy: 0, dz: z }); }
    bp.set(4, 0, z, B.WATER);
  }
  bp.set(4, 0, 7, B.PATH);
  // hay stacks & scarecrow along the back
  bp.box(1, 1, 1, 2, 1, 1, B.HAY_BALE); bp.set(1, 2, 1, B.HAY_BALE);
  bp.box(6, 1, 1, 7, 1, 1, B.HAY_BALE); bp.set(7, 2, 1, B.HAY_BALE);
  bp.set(4, 1, 1, B.LOG); bp.set(4, 2, 1, B.LOG); bp.set(4, 3, 1, B.HAY_BALE); bp.set(3, 2, 1, B.PLANKS); bp.set(5, 2, 1, B.PLANKS);
  bp.set(4, 4, 1, B.THATCH);
  bp.point('door', 4, 1, 8);
  bp.point('work', 4, 1, 7);
  return bp;
}

function mine(v) {
  const bp = new BP(9, 12);
  bp.box(0, 0, 0, 8, 0, 3, B.COBBLESTONE);
  bp.box(0, 0, 4, 1, 0, 11, B.GRAVEL); bp.box(7, 0, 4, 8, 0, 11, B.GRAVEL); bp.box(2, 0, 11, 6, 0, 11, B.GRAVEL);
  // shed
  bp.box(0, 1, 0, 8, 3, 0, B.COBBLESTONE);
  bp.box(0, 1, 0, 0, 3, 2, B.COBBLESTONE); bp.box(8, 1, 0, 8, 3, 2, B.COBBLESTONE);
  bp.posts(0, 0, 8, 2, 1, 3, B.SPRUCE_LOG);
  bp.gableX(0, 8, 0, 3, 4, B.PLANKS, null, 0, 8, B.SPRUCE_LOG);
  bp.box(0, 3, 3, 8, 3, 3, B.PLANKS);
  bp.set(0, 3, 3, B.SPRUCE_LOG); bp.set(8, 3, 3, B.SPRUCE_LOG); bp.box(0, 1, 3, 0, 2, 3, B.SPRUCE_LOG); bp.box(8, 1, 3, 8, 2, 3, B.SPRUCE_LOG);
  bp.set(1, 1, 1, B.WORKBENCH); bp.set(7, 1, 1, B.FURNACE);
  bp.box(2, 1, 1, 3, 1, 1, B.COBBLESTONE); bp.set(2, 2, 1, B.COBBLESTONE); bp.set(6, 1, 1, B.IRON_BLOCK);
  // headframe over the pit entrance
  bp.box(2, 4, 3, 2, 6, 3, B.SPRUCE_LOG); bp.box(6, 4, 3, 6, 6, 3, B.SPRUCE_LOG);
  bp.box(2, 7, 3, 6, 7, 3, B.SPRUCE_LOG); bp.set(4, 6, 3, B.LANTERN);
  // fence around the quarry
  for (let z = 4; z <= 11; z++) { bp.set(1, 1, z, B.LOG); bp.set(7, 1, z, B.LOG); }
  bp.box(1, 1, 11, 7, 1, 11, B.LOG);
  for (const [x, z] of [[1, 11], [7, 11], [1, 4], [7, 4]]) { bp.set(x, 2, z, B.LOG); bp.set(x, 3, z, B.TORCH); }
  bp.quarry = { x0: 2, z0: 4, x1: 6, z1: 10 };      // stairs descend towards +z
  bp.point('door', 4, 1, 3);
  bp.point('work', 4, 1, 2);
  return bp;
}

function storehouse(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.PATH);
  bp.box(1, 0, 1, 5, 0, 5, B.COBBLESTONE);
  bp.ring(1, 1, 1, 5, 1, 5, B.COBBLESTONE);
  bp.ring(1, 2, 1, 5, 3, 5, B.PLANKS);
  bp.posts(1, 1, 5, 5, 1, 4, B.LOG);
  bp.ring(1, 4, 1, 5, 4, 5, B.LOG);
  bp.del(2, 1, 5); bp.del(2, 2, 5); bp.del(3, 1, 5); bp.del(3, 2, 5); bp.del(4, 1, 5); bp.del(4, 2, 5);
  bp.box(2, 3, 5, 4, 3, 5, B.LOG);
  bp.set(1, 2, 3, B.GLASS); bp.set(5, 2, 3, B.GLASS);
  bp.gableZ(0, 6, 0, 6, 4, B.ROOF_TILES, B.PLANKS, 1, 5);
  bp.set(3, 5, 5, B.LANTERN);
  // goods
  bp.box(2, 1, 2, 2, 2, 2, B.HAY_BALE); bp.set(3, 1, 2, B.LOG); bp.set(4, 1, 2, B.COBBLESTONE); bp.set(4, 2, 2, B.COBBLESTONE); bp.set(2, 1, 3, B.WORKBENCH);
  bp.set(0, 1, 6, B.HAY_BALE); bp.set(0, 1, 5, B.LOG); bp.set(6, 1, 6, B.SPRUCE_LOG); bp.set(6, 2, 6, B.SPRUCE_LOG); bp.set(6, 1, 5, B.TORCH);
  bp.point('door', 3, 1, 6);
  bp.point('inside', 3, 1, 3);
  return bp;
}

function laboratory(v) {
  const bp = new BP(7, 9);
  bp.box(0, 0, 0, 6, 0, 8, B.GRASS);
  bp.box(1, 0, 1, 5, 0, 7, B.STONE_BRICKS);
  bp.box(2, 0, 2, 4, 0, 6, B.PLANKS);
  bp.set(3, 0, 8, B.PATH);
  bp.ring(1, 1, 1, 5, 1, 7, B.STONE_BRICKS);
  bp.ring(1, 2, 1, 5, 3, 7, B.PLASTER);
  bp.ring(1, 4, 1, 5, 4, 7, B.DARK_STONE);
  bp.posts(1, 1, 5, 7, 1, 4, B.DARK_STONE);
  for (let z = 2; z <= 6; z++) { bp.set(1, 2, z, B.BOOKSHELF); bp.set(5, 2, z, B.BOOKSHELF); }
  for (const z of [3, 5]) { bp.set(1, 3, z, B.GLASS); bp.set(5, 3, z, B.GLASS); }
  bp.set(3, 2, 1, B.GLASS); bp.set(3, 3, 1, B.GLASS);
  bp.del(3, 1, 7); bp.del(3, 2, 7);
  bp.set(2, 3, 7, B.GLASS); bp.set(4, 3, 7, B.GLASS);
  bp.gableZ(0, 6, 0, 8, 4, B.ROOF_TILES, B.PLASTER, 1, 7, B.DARK_STONE);
  bp.set(3, 6, 1, B.GLASS); bp.set(3, 6, 7, B.GLASS);
  // crystal finials on the ridge
  bp.set(3, 8, 0, B.CRYSTAL_ORE); bp.set(3, 8, 8, B.CRYSTAL_ORE);
  // interior: arcane table + books
  bp.set(3, 1, 3, B.ARCANE_TABLE);
  bp.box(2, 1, 2, 4, 1, 2, B.BOOKSHELF); bp.set(3, 1, 2, B.BOOKSHELF);
  bp.set(3, 5, 4, B.LANTERN);
  // herb garden
  bp.set(1, 1, 8, B.LEAVES); bp.set(5, 1, 8, B.LEAVES); bp.set(2, 1, 8, B.MUSHROOM); bp.set(4, 1, 8, B.FLOWER_RED); bp.set(0, 1, 8, B.TORCH); bp.set(6, 1, 8, B.TORCH);
  bp.point('door', 3, 1, 8);
  bp.point('work', 3, 1, 4);
  bp.point('work', 2, 1, 5);
  bp.point('inside', 3, 1, 5);
  return bp;
}

function forge(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.COBBLESTONE);
  bp.box(1, 0, 5, 5, 0, 6, B.GRAVEL);
  bp.box(1, 1, 1, 5, 3, 1, B.COBBLESTONE);
  bp.box(1, 1, 1, 1, 3, 4, B.STONE_BRICKS); bp.box(5, 1, 1, 5, 3, 4, B.STONE_BRICKS);
  bp.posts(1, 1, 5, 4, 1, 3, B.SPRUCE_LOG);
  bp.set(1, 2, 3, B.GLASS); bp.set(5, 2, 3, B.GLASS);
  bp.gableX(0, 6, 0, 5, 4, B.ROOF_TILES, B.COBBLESTONE, 1, 5);
  bp.box(1, 4, 5, 5, 4, 5, B.ROOF_TILES);
  // furnaces, chimney, bench
  bp.set(2, 1, 2, B.FURNACE); bp.set(3, 1, 2, B.FURNACE); bp.set(4, 1, 2, B.WORKBENCH);
  bp.box(2, 2, 2, 3, 3, 2, B.COBBLESTONE);
  bp.box(3, 1, 1, 3, 8, 1, B.STONE_BRICKS); bp.set(3, 9, 1, B.COBBLESTONE);
  // anvil and quench tub in the yard
  bp.set(3, 1, 4, B.IRON_BLOCK);
  bp.set(5, 0, 6, B.WATER); bp.set(1, 1, 6, B.LOG); bp.set(0, 1, 6, B.TORCH); bp.set(6, 1, 6, B.TORCH);
  bp.point('door', 3, 1, 6);
  bp.point('work', 3, 1, 5);
  return bp;
}

function mageTower(v) {
  const bp = new BP(7, 7);
  const c = 3;
  const dist = (x, z) => Math.hypot(x - c, z - c);
  for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) {
    const d = dist(x, z);
    if (d <= 3.2) bp.set(x, 0, z, d <= 2.4 ? B.DARK_STONE : B.COBBLESTONE);
    if (d > 1.5 && d <= 2.3) {
      for (let y = 1; y <= 10; y++) bp.set(x, y, z, y === 1 ? B.MOSSY_COBBLE : (y % 4 === 0 ? B.DARK_STONE : B.STONE_BRICKS));
    }
    if (d <= 3.2) bp.set(x, 11, z, d > 2.3 ? B.DARK_STONE : B.STONE_BRICKS);
    if (d > 2.3 && d <= 3.2 && (x + z) % 2 === 0) bp.set(x, 12, z, B.DARK_STONE);
  }
  // spiral windows
  bp.set(3, 3, 1, B.GLASS); bp.set(1, 5, 3, B.GLASS); bp.set(3, 7, 5, B.GLASS); bp.set(5, 9, 3, B.GLASS); bp.set(5, 4, 3, B.GLASS); bp.set(1, 8, 3, B.GLASS);
  // door
  bp.del(3, 1, 5); bp.del(3, 2, 5); bp.set(3, 3, 5, B.DARK_STONE);
  bp.set(2, 1, 6, B.TORCH); bp.set(4, 1, 6, B.TORCH);
  // glowing crystal pillars on the battlements
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) { bp.set(x, 12, z, B.DARK_STONE); bp.set(x, 13, z, B.CRYSTAL_ORE); }
  bp.set(3, 5, 3, B.LANTERN);
  bp.point('door', 3, 1, 6);
  bp.point('post', 3, 12, 3);
  return bp;
}

function watchtower(v) {
  const bp = new BP(5, 5);
  bp.posts(0, 0, 4, 4, 0, 0, B.COBBLESTONE);
  bp.posts(0, 0, 4, 4, 1, 9, B.LOG);
  // diagonal braces
  bp.set(1, 2, 0, B.PLANKS); bp.set(2, 3, 0, B.PLANKS); bp.set(3, 4, 0, B.PLANKS);
  bp.set(3, 2, 4, B.PLANKS); bp.set(2, 3, 4, B.PLANKS); bp.set(1, 4, 4, B.PLANKS);
  bp.set(0, 2, 3, B.PLANKS); bp.set(0, 3, 2, B.PLANKS); bp.set(0, 4, 1, B.PLANKS);
  bp.set(4, 2, 1, B.PLANKS); bp.set(4, 3, 2, B.PLANKS); bp.set(4, 4, 3, B.PLANKS);
  // platform + railing
  bp.box(0, 6, 0, 4, 6, 4, B.PLANKS);
  bp.ring(0, 5, 0, 4, 5, 4, B.SPRUCE_LOG);
  bp.ring(0, 7, 0, 4, 7, 4, B.PALISADE);
  bp.posts(0, 0, 4, 4, 7, 9, B.LOG);
  // pyramid roof
  bp.box(0, 10, 0, 4, 10, 4, B.THATCH);
  bp.box(1, 11, 1, 3, 11, 3, B.THATCH);
  bp.set(2, 12, 2, B.LOG); bp.set(2, 13, 2, B.BANNER);
  bp.set(2, 9, 2, B.LANTERN);
  bp.set(2, 1, 2, B.HAY_BALE);
  bp.point('door', 2, 1, 5 - 1);
  bp.point('post', 2, 7, 2);
  return bp;
}

function barracks(v) {
  const bp = new BP(9, 7);
  bp.box(0, 0, 0, 8, 0, 6, B.GRAVEL);
  bp.box(1, 0, 1, 7, 0, 5, B.COBBLESTONE);
  bp.box(2, 0, 2, 6, 0, 4, B.PLANKS);
  bp.ring(1, 1, 1, 7, 1, 5, B.COBBLESTONE);
  bp.ring(1, 2, 1, 7, 2, 5, B.STONE_BRICKS);
  bp.ring(1, 3, 1, 7, 3, 5, B.PLANKS);
  bp.posts(1, 1, 7, 5, 1, 3, B.SPRUCE_LOG);
  bp.box(4, 1, 1, 4, 3, 1, B.SPRUCE_LOG);
  bp.del(4, 1, 5); bp.del(4, 2, 5); bp.box(3, 1, 5, 3, 3, 5, B.SPRUCE_LOG); bp.box(5, 1, 5, 5, 3, 5, B.SPRUCE_LOG);
  bp.set(2, 2, 5, B.GLASS); bp.set(6, 2, 5, B.GLASS); bp.set(1, 2, 3, B.GLASS); bp.set(7, 2, 3, B.GLASS); bp.set(2, 2, 1, B.GLASS); bp.set(6, 2, 1, B.GLASS);
  bp.gableX(0, 8, 0, 6, 3, B.ROOF_TILES, B.PLANKS, 1, 7, B.STONE_BRICKS);
  bp.set(1, 5, 3, B.BANNER); bp.set(7, 5, 3, B.BANNER);
  bp.set(2, 3, 5, B.BANNER); bp.set(6, 3, 5, B.BANNER);
  // training dummy & weapon rack
  bp.set(7, 1, 6, B.LOG); bp.set(7, 2, 6, B.HAY_BALE); bp.set(1, 1, 6, B.IRON_BLOCK); bp.set(0, 1, 6, B.TORCH); bp.set(8, 1, 6, B.TORCH);
  bp.set(2, 1, 2, B.HAY_BALE); bp.set(6, 1, 2, B.HAY_BALE); bp.set(4, 1, 2, B.WORKBENCH);
  bp.set(4, 4, 3, B.LANTERN);
  bp.point('door', 4, 1, 6);
  bp.point('inside', 4, 1, 3);
  return bp;
}

function palisade(v) {
  const bp = new BP(1, 1);
  bp.box(0, 1, 0, 0, 3, 0, B.PALISADE);
  if (v & 1) bp.set(0, 4, 0, B.PALISADE);
  return bp;
}

function stoneWall(v) {
  const bp = new BP(1, 1);
  bp.set(0, 0, 0, B.COBBLESTONE);
  bp.set(0, 1, 0, B.MOSSY_COBBLE);
  bp.box(0, 2, 0, 0, 3, 0, B.REINFORCED_WALL);
  bp.set(0, 4, 0, B.STONE_BRICKS);
  if (v & 1) bp.set(0, 5, 0, B.STONE_BRICKS);
  return bp;
}

// ---------------------------------------------------------------- rotation & caching
function rotXZ(x, z, w, d, rot) {
  switch (rot & 3) {
    case 1: return [d - 1 - z, x];
    case 2: return [w - 1 - x, d - 1 - z];
    case 3: return [z, w - 1 - x];
    default: return [x, z];
  }
}

const cache = new Map();
function compile(type, rot, variant) {
  const key = type.id + ':' + (rot & 3) + ':' + variant;
  let c = cache.get(key);
  if (c) return c;
  const bp = type.design(variant);
  const { w, d } = bp;
  const blocks = [];
  let height = 0;
  for (const cell of bp.cells.values()) {
    const [x, z] = rotXZ(cell.dx, cell.dz, w, d, rot);
    blocks.push({ dx: x, dy: cell.dy, dz: z, id: cell.id });
    height = Math.max(height, cell.dy + 1);
  }
  // build order: bottom-up; solid structure before decoration (torches, glass, plants, water) of that layer
  const deco = (id) => id === B.TORCH || id === B.GLASS || id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.MUSHROOM || id === B.LANTERN || id === B.BANNER || id === B.WATER;
  blocks.sort((a, b) => a.dy - b.dy || (deco(a.id) - deco(b.id)) || a.dz - b.dz || a.dx - b.dx);
  const points = {};
  for (const name in bp.pts) points[name] = bp.pts[name].map(p => { const [x, z] = rotXZ(p.dx, p.dz, w, d, rot); return { dx: x, dy: p.dy, dz: z }; });
  const plots = bp.plots.map(p => { const [x, z] = rotXZ(p.dx, p.dz, w, d, rot); return { dx: x, dy: p.dy, dz: z }; });
  let quarry = null;
  if (bp.quarry) {
    // list quarry cells in local coords with their "stair index" (distance from the entrance edge)
    const q = bp.quarry, cells = [];
    for (let z = q.z0; z <= q.z1; z++) for (let x = q.x0; x <= q.x1; x++) {
      const [rx, rz] = rotXZ(x, z, w, d, rot);
      cells.push({ dx: rx, dz: rz, step: z - q.z0, lx: x - q.x0 });
    }
    quarry = { cells, depth: q.z1 - q.z0 + 1, width: q.x1 - q.x0 + 1 };
  }
  const rw = (rot & 1) ? d : w, rd = (rot & 1) ? w : d;
  c = { blocks, w: rw, d: rd, height, points, plots, quarry };
  cache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- registry
export const BUILDING_TYPES = {};
function def(id, o) {
  const t = {
    id, research: null, jobs: {}, popBonus: 0, hp: 300, category: 'economy', maxCount: Infinity, variants: 1, storage: [],
    ...o,
  };
  t.blueprint = (rot = 0, variant = 0) => compile(t, rot, variant % t.variants).blocks;
  t.layout = (rot = 0, variant = 0) => compile(t, rot, variant % t.variants);
  const l = t.layout(0);
  t.size = [l.w, l.d];
  t.height = l.height;
  BUILDING_TYPES[id] = t;
  return t;
}

def('town_hall', {
  name: 'Ратуша', desc: 'Сердце деревни. Даёт жильё 4 жителям и строителей. Если её разрушат — игра окончена.',
  cost: { wood: 200, stone: 200 }, hp: 2000, popBonus: 4, category: 'economy', maxCount: 1, design: townHall, storage: ['wood', 'stone', 'food', 'iron', 'coal', 'gold', 'crystal'], auto: true,
});
def('house', {
  name: 'Дом', desc: 'Уютный фахверковый дом. +4 к населению. Ночью жители прячутся внутри.',
  cost: { wood: 20, stone: 10 }, hp: 300, popBonus: 4, category: 'economy', design: house, variants: 4,
});
def('lumber_camp', {
  name: 'Лесопилка', desc: 'Лесорубы валят деревья поблизости, приносят дерево и сажают новые саженцы.',
  cost: { wood: 15, stone: 5 }, hp: 250, jobs: { woodcutter: 2 }, category: 'economy', design: lumberCamp, storage: ['wood'],
});
def('farm', {
  name: 'Ферма', desc: 'Фермеры пашут, сеют и собирают пшеницу — главный источник еды.',
  cost: { wood: 15, stone: 5 }, hp: 200, jobs: { farmer: 2 }, category: 'economy', design: farm, storage: ['food'],
});
def('storehouse', {
  name: 'Склад', desc: 'Ближняя точка сдачи ресурсов: рабочие меньше ходят и больше работают.',
  cost: { wood: 30, stone: 15 }, hp: 350, category: 'economy', design: storehouse, storage: ['wood', 'stone', 'food', 'iron', 'coal', 'gold', 'crystal'],
});
def('mine', {
  name: 'Шахта', desc: 'Шахтёры роют настоящий карьер ступенями вглубь: камень, уголь, железо, золото и кристаллы.',
  cost: { wood: 25, stone: 10 }, hp: 300, jobs: { miner: 2 }, research: 'mining', category: 'economy', design: mine, storage: ['stone', 'coal', 'iron', 'gold', 'crystal'],
});
def('laboratory', {
  name: 'Лаборатория', desc: 'Учёные корпят над книгами и магическим столом, производя очки исследований.',
  cost: { wood: 40, stone: 30 }, hp: 350, jobs: { researcher: 2 }, category: 'magic', maxCount: 2, design: laboratory,
});
def('forge', {
  name: 'Кузница', desc: 'Кузнец переплавляет железо и уголь в оружие и доспехи для стражи.',
  cost: { wood: 20, stone: 40 }, hp: 450, jobs: { blacksmith: 1 }, research: 'smithing', category: 'military', design: forge,
});
def('mage_tower', {
  name: 'Башня мага', desc: 'Маг на вершине башни обрушивает огненные шары (а после «Магии льда» — ледяные стрелы) на нежить.',
  cost: { stone: 60, crystal: 8, gold: 5 }, hp: 650, jobs: { mage: 1 }, research: 'arcana', category: 'magic', design: mageTower,
});
def('watchtower', {
  name: 'Сторожевая вышка', desc: 'Лучник на площадке обстреливает зомби. После «Пороха» — мушкет.',
  cost: { wood: 35, stone: 10 }, hp: 350, jobs: { guard: 1 }, research: 'archery', category: 'military', design: watchtower,
});
def('barracks', {
  name: 'Казарма', desc: 'Стражники патрулируют деревню и бьются с зомби в ближнем бою.',
  cost: { wood: 40, stone: 50 }, hp: 650, jobs: { guard: 4 }, research: 'fortification', category: 'military', design: barracks,
});
def('wall', {
  name: 'Частокол', desc: 'Секция деревянного частокола. Коснитесь начала и конца линии.',
  cost: { wood: 3 }, hp: 150, category: 'defense', design: palisade, variants: 2, line: true,
});
def('stone_wall', {
  name: 'Каменная стена', desc: 'Крепкая секция каменной стены с зубцами. Коснитесь начала и конца линии.',
  cost: { stone: 5 }, hp: 450, research: 'fortification', category: 'defense', design: stoneWall, variants: 2, line: true,
});

export const BUILDING_ORDER = ['house', 'lumber_camp', 'farm', 'storehouse', 'mine', 'laboratory', 'forge', 'watchtower', 'barracks', 'mage_tower', 'wall', 'stone_wall'];

export const RESEARCH_LABELS = {
  masonry: 'Каменная кладка', agriculture: 'Земледелие', mining: 'Горное дело', smithing: 'Кузнечное дело', archery: 'Стрельба из лука',
  mechanics: 'Механика', fortification: 'Фортификация', gunpowder: 'Порох', ballistics: 'Баллистика', alchemy: 'Алхимия', arcana: 'Тайные искусства',
  frost_magic: 'Магия льда', storm_magic: 'Магия бури', restoration: 'Восстановление', crystal_forging: 'Кристальная ковка', meteor: 'Метеоры',
};

export { rotXZ };
