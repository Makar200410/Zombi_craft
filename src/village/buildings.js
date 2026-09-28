// Building types & block blueprints (Millénaire-style medieval village).
// Local coords: x ∈ [0,w), z ∈ [0,d), dy = 0 is the ground/foundation layer (replaces the terrain top block).
// The front (door side) faces +z at rotation 0. rot r turns the building r×90°:
//   rot0 front +z, rot1 front -x, rot2 front -z, rot3 front +x.
// blueprint(rot, variant) -> [{dx,dy,dz,id}] ; layout(rot, variant) -> {w, d, height, points, plots, quarry}
import { B } from '../core/blocks.js';

import { BP } from './bp.js';
import { tiered } from './architecture.js';

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

function builderHut(v) {
  // builder's workshop: small timber house + yard with stacked planks, scaffolding and a crane post
  const bp = new BP(7, 7);
  const roof = v & 1 ? B.ROOF_TILES : B.THATCH;
  bp.box(0, 0, 0, 6, 0, 6, B.PATH);
  bp.box(1, 0, 1, 4, 0, 4, B.PLANKS);
  bp.ring(1, 1, 1, 4, 1, 4, B.COBBLESTONE);
  bp.ring(1, 2, 1, 4, 2, 4, B.TIMBER_FRAME);
  bp.posts(1, 1, 4, 4, 1, 2, B.SPRUCE_LOG);
  bp.del(4, 1, 2); bp.del(4, 2, 2);
  bp.set(2, 2, 1, B.GLASS);
  bp.gableX(0, 5, 0, 5, 3, roof, B.PLANKS, 1, 4);
  bp.set(2, 1, 2, B.WORKBENCH); bp.set(3, 1, 3, B.HAY_BALE);
  // yard: plank stacks, stone pile, scaffolding tower
  bp.box(6, 1, 0, 6, 2, 1, B.PLANKS); bp.set(6, 1, 2, B.PLANKS);
  bp.box(0, 1, 6, 1, 1, 6, B.COBBLESTONE); bp.set(0, 2, 6, B.COBBLESTONE);
  for (const [x, z] of [[4, 6], [6, 6], [6, 4]]) bp.box(x, 1, z, x, 4, z, B.SPRUCE_LOG);
  bp.box(4, 4, 4, 6, 4, 6, B.PLANKS); bp.del(5, 4, 5);
  bp.set(5, 5, 6, B.LANTERN);
  bp.set(6, 1, 3, B.TORCH);
  bp.point('door', 5, 1, 2);
  bp.point('work', 5, 1, 3);
  bp.point('inside', 2, 1, 3);
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
// ---------------------------------------------------------------- civilisation-age designs

function granary(v) {
  const bp = new BP(7, 9);
  bp.box(0, 0, 0, 6, 0, 8, B.PATH);
  bp.box(1, 0, 1, 5, 0, 7, B.COBBLESTONE);
  bp.ring(1, 1, 1, 5, 1, 7, B.COBBLESTONE);
  bp.ring(1, 2, 1, 5, 4, 7, B.PLANKS);
  bp.posts(1, 1, 5, 7, 1, 5, B.LOG);
  bp.ring(1, 5, 1, 5, 5, 7, B.LOG);
  for (let y = 1; y <= 3; y++) for (let x = 2; x <= 4; x++) bp.del(x, y, 7);
  bp.box(2, 4, 7, 4, 4, 7, B.LOG);
  bp.set(1, 3, 4, B.GLASS); bp.set(5, 3, 4, B.GLASS);
  bp.gableZ(0, 6, 0, 8, 5, B.THATCH, B.PLANKS, 1, 7);
  bp.box(2, 1, 2, 2, 2, 3, B.HAY_BALE); bp.box(4, 1, 2, 4, 1, 3, B.HAY_BALE); bp.set(3, 1, 2, B.HAY_BALE);
  bp.set(0, 1, 8, B.HAY_BALE); bp.set(6, 1, 8, B.HAY_BALE); bp.set(6, 2, 8, B.HAY_BALE);
  bp.set(3, 5, 8, B.LANTERN);
  bp.point('door', 3, 1, 8);
  bp.point('inside', 3, 1, 4);
  return bp;
}

function market(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.PATH);
  bp.box(1, 0, 1, 7, 0, 7, B.COBBLESTONE);
  // fountain
  bp.ring(3, 1, 3, 5, 1, 5, B.MARBLE);
  bp.set(4, 1, 4, B.WATER);
  // four stalls with awnings and goods
  const roofs = [B.THATCH, B.ROOF_TILES, B.ROOF_TILES, B.THATCH];
  const goods = [[B.HAY_BALE, B.HAY_BALE], [B.LOG, B.COBBLESTONE], [B.BOOKSHELF, B.LANTERN], [B.HAY_BALE, B.LOG]];
  [[0, 0], [6, 0], [0, 6], [6, 6]].forEach(([x0, z0], i) => {
    const front = z0 === 0 ? z0 + 1 : z0;       // counter row faces the plaza
    const back = z0 === 0 ? z0 : z0 + 1;
    bp.posts(x0, z0, x0 + 2, z0 + 1, 1, 2, B.LOG);
    bp.box(x0, 3, z0, x0 + 2, 3, z0 + 1, roofs[i]);
    bp.set(x0 + 1, 1, front, B.PLANKS);
    bp.set(x0 + 1, 1, back, goods[i][0]);
    bp.set(x0 + 1, 2, back, goods[i][1]);
    bp.point('stall', x0 + 1, 1, z0 === 0 ? z0 + 2 : z0 - 1);
  });
  bp.set(4, 2, 1, B.BANNER); bp.set(4, 1, 1, B.LOG);
  bp.point('door', 4, 1, 8);
  bp.point('inside', 4, 1, 6);
  return bp;
}

function castle(v) {
  const bp = new BP(13, 13);
  bp.box(0, 0, 0, 12, 0, 12, B.COBBLESTONE);
  bp.box(2, 0, 2, 10, 0, 10, B.PATH);
  // curtain wall with crenellations
  bp.ring(1, 1, 1, 11, 4, 11, B.STONE_BRICKS);
  for (let i = 1; i <= 11; i += 2) { bp.set(i, 5, 1, B.STONE_BRICKS); bp.set(i, 5, 11, B.STONE_BRICKS); bp.set(1, 5, i, B.STONE_BRICKS); bp.set(11, 5, i, B.STONE_BRICKS); }
  // corner towers
  for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) {
    bp.box(x, 1, z, x + 2, 6, z + 2, B.STONE_BRICKS);
    bp.posts(x, z, x + 2, z + 2, 7, 7, B.STONE_BRICKS);
    bp.set(x + 1, 7, z + 1, B.TORCH);
  }
  // gate with banner
  for (let y = 1; y <= 3; y++) for (let x = 5; x <= 7; x++) bp.del(x, y, 11);
  bp.set(6, 4, 11, B.DARK_STONE); bp.set(6, 5, 11, B.BANNER);
  bp.set(4, 3, 12, B.LANTERN); bp.set(8, 3, 12, B.LANTERN);
  // keep
  bp.box(4, 1, 3, 8, 6, 7, B.STONE_BRICKS);
  for (let y = 1; y <= 5; y++) for (let z = 4; z <= 6; z++) for (let x = 5; x <= 7; x++) bp.del(x, y, z);
  bp.box(5, 0, 4, 7, 0, 6, B.PLANKS);
  bp.del(6, 1, 7); bp.del(6, 2, 7);
  bp.set(4, 4, 5, B.GLASS); bp.set(8, 4, 5, B.GLASS); bp.set(6, 4, 3, B.GLASS); bp.set(6, 4, 7, B.GLASS);
  bp.set(6, 5, 5, B.LANTERN); bp.set(5, 1, 4, B.WORKBENCH); bp.set(7, 1, 4, B.BOOKSHELF);
  bp.box(3, 7, 2, 9, 7, 8, B.ROOF_TILES);
  bp.box(4, 8, 3, 8, 8, 7, B.ROOF_TILES);
  bp.box(5, 9, 4, 7, 9, 6, B.ROOF_TILES);
  bp.set(6, 10, 5, B.LOG); bp.set(6, 11, 5, B.BANNER);
  // courtyard
  bp.set(3, 1, 9, B.HAY_BALE); bp.set(9, 1, 9, B.HAY_BALE); bp.set(3, 1, 3, B.HAY_BALE); bp.set(9, 1, 3, B.LOG);
  bp.point('door', 6, 1, 12);
  bp.point('inside', 6, 1, 5);
  return bp;
}

function cannonTower(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.COBBLESTONE);
  const corner = (x, z) => (x === 0 || x === 6) && (z === 0 || z === 6);
  for (let y = 1; y <= 5; y++) bp.ring(0, y, 0, 6, y, 6, y <= 1 ? B.DARK_STONE : B.STONE_BRICKS);
  bp.box(0, 6, 0, 6, 6, 6, B.STONE_BRICKS);
  for (let i = 0; i <= 6; i += 2) { bp.set(i, 7, 0, B.STONE_BRICKS); bp.set(i, 7, 6, B.STONE_BRICKS); bp.set(0, 7, i, B.STONE_BRICKS); bp.set(6, 7, i, B.STONE_BRICKS); }
  for (let y = 0; y <= 7; y++) for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) if (corner(x, z)) bp.del(x, y, z);
  bp.del(3, 1, 6); bp.del(3, 2, 6);
  bp.set(0, 3, 3, B.GLASS); bp.set(6, 3, 3, B.GLASS); bp.set(3, 3, 0, B.GLASS);
  bp.set(3, 7, 2, B.CANNON);
  bp.set(1, 7, 4, B.IRON_BLOCK); bp.set(5, 7, 4, B.LANTERN);
  bp.set(3, 4, 6, B.BANNER);
  bp.point('door', 3, 1, 6);
  bp.point('post', 3, 7, 4);
  return bp;
}

// ---- wonders
function stonehenge(v) {
  const bp = new BP(11, 11);
  bp.box(0, 0, 0, 10, 0, 10, B.GRASS);
  bp.box(4, 0, 4, 6, 0, 6, B.COBBLESTONE);
  for (let z = 7; z <= 10; z++) bp.set(5, 0, z, B.PATH);
  const pillars = [[5, 1], [8, 2], [9, 5], [8, 8], [2, 8], [1, 5], [2, 2]];
  pillars.forEach(([x, z], i) => { bp.box(x, 1, z, x, 3, z, i % 3 === 0 ? B.MOSSY_COBBLE : B.STONE); bp.set(x, 4, z, B.DARK_STONE); });
  // lintels between neighbouring stones
  bp.set(6, 4, 1, B.DARK_STONE); bp.set(7, 4, 2, B.DARK_STONE); bp.set(9, 4, 6, B.DARK_STONE); bp.set(1, 4, 6, B.DARK_STONE); bp.set(3, 4, 2, B.DARK_STONE); bp.set(4, 4, 1, B.DARK_STONE);
  // altar & fire
  bp.box(4, 1, 5, 6, 1, 5, B.STONE_BRICKS); bp.set(5, 2, 5, B.TORCH);
  bp.set(3, 1, 3, B.TORCH); bp.set(7, 1, 3, B.TORCH);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 5, 1, 7);
  return bp;
}

function ziggurat(v) {
  const bp = new BP(13, 13);
  bp.box(0, 0, 0, 12, 0, 12, B.SAND);
  for (let t = 0; t < 5; t++) {
    const a = t + 0, b = 12 - t, y0 = 1 + t * 2;
    bp.ring(a, y0, a, b, y0 + 1, b, t % 2 ? B.SAND : B.BRICK);
  }
  bp.box(5, 10, 5, 7, 10, 7, B.BRICK);
  // shrine on top
  bp.posts(5, 5, 7, 7, 11, 12, B.BRONZE_BLOCK);
  bp.box(5, 13, 5, 7, 13, 7, B.ROOF_TILES);
  bp.set(6, 11, 6, B.LANTERN); bp.set(6, 14, 6, B.BANNER);
  // front stair
  for (let t = 0; t < 5; t++) for (let k = 0; k < 2; k++) bp.set(6, 1 + t * 2 + k, 12 - t, B.STONE_BRICKS);
  bp.set(4, 1, 12, B.TORCH); bp.set(8, 1, 12, B.TORCH);
  bp.point('door', 6, 1, 12);
  bp.point('inside', 6, 1, 12);
  return bp;
}

function colossus(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.PATH);
  bp.box(1, 1, 1, 7, 2, 7, B.MARBLE);
  bp.ring(0, 1, 0, 8, 1, 8, B.STONE_BRICKS);
  for (let x = 2; x <= 6; x += 2) { bp.set(x, 1, 8, B.LANTERN); }
  // legs
  bp.box(3, 3, 4, 3, 7, 4, B.BRONZE_BLOCK); bp.box(5, 3, 4, 5, 7, 4, B.BRONZE_BLOCK);
  // body
  bp.box(3, 8, 3, 5, 12, 5, B.BRONZE_BLOCK);
  // arms: left down with shield, right raised with a torch
  bp.box(2, 9, 4, 2, 11, 4, B.BRONZE_BLOCK); bp.set(2, 9, 5, B.IRON_BLOCK);
  bp.box(6, 11, 4, 6, 15, 4, B.BRONZE_BLOCK); bp.set(6, 16, 4, B.LANTERN);
  // head with crest
  bp.box(4, 13, 4, 4, 14, 4, B.BRONZE_BLOCK); bp.set(4, 15, 4, B.BRONZE_BLOCK);
  bp.point('door', 4, 1, 8);
  bp.point('inside', 4, 3, 7);
  return bp;
}

function cathedral(v) {
  const bp = new BP(11, 15);
  bp.box(0, 0, 0, 10, 0, 14, B.PATH);
  bp.box(1, 0, 1, 9, 0, 13, B.MARBLE);
  // nave
  bp.ring(2, 1, 2, 8, 6, 12, B.STONE_BRICKS);
  for (const z of [4, 6, 8, 10]) for (let y = 2; y <= 5; y++) { bp.set(2, y, z, B.GLASS); bp.set(8, y, z, B.GLASS); }
  // buttresses
  for (const z of [3, 5, 7, 9, 11]) { bp.box(1, 1, z, 1, 4, z, B.STONE_BRICKS); bp.box(9, 1, z, 9, 4, z, B.STONE_BRICKS); }
  bp.gableZ(1, 9, 2, 12, 7, B.ROOF_TILES, B.STONE_BRICKS, 2, 12);
  // front towers
  for (const x of [1, 7]) {
    bp.box(x, 1, 11, x + 2, 11, 13, B.STONE_BRICKS);
    bp.set(x + 1, 8, 13, B.GLASS); bp.set(x + 1, 9, 13, B.GLASS);
    bp.box(x, 12, 11, x + 2, 12, 13, B.ROOF_TILES); bp.set(x + 1, 13, 12, B.ROOF_TILES); bp.set(x + 1, 14, 12, B.LANTERN);
  }
  // portal & rose window
  for (let y = 1; y <= 3; y++) for (let x = 4; x <= 6; x++) bp.del(x, y, 12);
  bp.set(5, 5, 12, B.GLASS); bp.set(4, 6, 12, B.GLASS); bp.set(6, 6, 12, B.GLASS); bp.set(5, 7, 12, B.GLASS);
  // interior
  bp.box(5, 1, 3, 5, 1, 3, B.BRONZE_BLOCK); bp.set(5, 2, 3, B.LANTERN);
  for (const z of [5, 7, 9]) { bp.set(4, 1, z, B.PLANKS); bp.set(6, 1, z, B.PLANKS); }
  bp.point('door', 5, 1, 14);
  bp.point('inside', 5, 1, 8);
  return bp;
}

function arsenal(v) {
  const bp = new BP(11, 11);
  bp.box(0, 0, 0, 10, 0, 10, B.GRAVEL);
  // low star-fort walls
  bp.ring(0, 1, 0, 10, 2, 10, B.DARK_STONE);
  for (let i = 0; i <= 10; i += 2) { bp.set(i, 3, 0, B.DARK_STONE); bp.set(i, 3, 10, B.DARK_STONE); bp.set(0, 3, i, B.DARK_STONE); bp.set(10, 3, i, B.DARK_STONE); }
  for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) { bp.set(x, 3, z, B.STONE_BRICKS); bp.set(x, 4, z, B.CANNON); }
  for (let y = 1; y <= 2; y++) for (let x = 4; x <= 6; x++) bp.del(x, y, 10);
  bp.del(4, 3, 10); bp.del(6, 3, 10);
  // brick powder house with copper roof
  bp.box(3, 1, 2, 7, 4, 6, B.BRICK);
  for (let y = 1; y <= 3; y++) for (let z = 3; z <= 5; z++) for (let x = 4; x <= 6; x++) bp.del(x, y, z);
  bp.del(5, 1, 6); bp.del(5, 2, 6);
  bp.set(3, 3, 4, B.GLASS); bp.set(7, 3, 4, B.GLASS);
  bp.gableX(2, 8, 1, 7, 5, B.COPPER_ROOF, B.BRICK, 3, 7);
  bp.set(4, 1, 3, B.IRON_BLOCK); bp.set(6, 1, 3, B.IRON_BLOCK); bp.set(5, 1, 3, B.CANNON); bp.set(5, 3, 4, B.LANTERN);
  bp.set(2, 1, 8, B.CANNON); bp.set(8, 1, 8, B.CANNON);
  bp.set(5, 3, 10, B.BANNER);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 5, 1, 4);
  return bp;
}

// ---- industrial & electric ages
function factory(v) {
  const bp = new BP(11, 9);
  bp.box(0, 0, 0, 10, 0, 8, B.GRAVEL);
  bp.box(1, 0, 1, 9, 0, 6, B.CONCRETE);
  bp.ring(1, 1, 1, 9, 4, 6, B.BRICK);
  for (const x of [3, 5, 7]) for (let y = 2; y <= 3; y++) { bp.set(x, y, 1, B.GLASS); bp.set(x, y, 6, B.GLASS); }
  bp.set(1, 3, 3, B.GLASS); bp.set(9, 3, 3, B.GLASS);
  // saw-tooth roof with skylights
  for (let x = 1; x <= 9; x++) for (let z = 1; z <= 6; z++) bp.set(x, 5, z, (z === 2 || z === 5) ? B.GLASS : B.STEEL_BLOCK);
  for (const z of [1, 4]) for (let x = 1; x <= 9; x++) bp.set(x, 6, z, B.STEEL_BLOCK);
  // chimney
  bp.box(8, 1, 7, 9, 10, 8, B.BRICK); bp.set(8, 11, 7, B.DARK_STONE); bp.set(9, 11, 8, B.DARK_STONE);
  bp.point('smoke', 8, 12, 7);
  // big door
  for (let y = 1; y <= 3; y++) for (let x = 4; x <= 6; x++) bp.del(x, y, 6);
  bp.box(4, 4, 6, 6, 4, 6, B.STEEL_BLOCK);
  // machines inside
  bp.set(2, 1, 2, B.FURNACE); bp.set(3, 1, 2, B.IRON_BLOCK); bp.set(7, 1, 2, B.IRON_BLOCK); bp.set(8, 1, 2, B.FURNACE);
  bp.set(2, 1, 4, B.STEEL_BLOCK); bp.set(8, 1, 4, B.IRON_BLOCK); bp.set(5, 4, 3, B.LANTERN);
  bp.box(0, 1, 7, 1, 1, 8, B.COAL_ORE); bp.set(3, 1, 8, B.IRON_BLOCK);
  bp.point('door', 5, 1, 7);
  bp.point('inside', 5, 1, 3);
  bp.point('machine', 3, 1, 3); bp.point('machine', 7, 1, 3); bp.point('machine', 5, 1, 4);
  return bp;
}

function mgNest(v) {
  const bp = new BP(5, 5);
  bp.box(0, 0, 0, 4, 0, 4, B.GRAVEL);
  bp.ring(0, 1, 0, 4, 2, 4, B.SAND);
  bp.box(1, 1, 1, 3, 1, 3, B.PLANKS);
  bp.box(1, 2, 1, 3, 2, 3, B.AIR);
  bp.set(2, 2, 0, B.STEEL_BLOCK); bp.set(0, 2, 2, B.CONCRETE); bp.set(4, 2, 2, B.CONCRETE);
  bp.del(2, 1, 4); bp.del(2, 2, 4);
  bp.set(0, 3, 0, B.SAND); bp.set(4, 3, 0, B.SAND);
  bp.point('door', 2, 1, 4);
  bp.point('post', 2, 2, 2);
  return bp;
}

function powerPlant(v) {
  const bp = new BP(11, 9);
  bp.box(0, 0, 0, 10, 0, 8, B.GRAVEL);
  bp.box(1, 0, 1, 8, 0, 6, B.CONCRETE);
  bp.ring(1, 1, 1, 8, 5, 6, B.CONCRETE);
  for (const x of [2, 4, 5, 7]) for (let y = 2; y <= 4; y++) bp.set(x, y, 6, B.GLASS);
  bp.box(1, 6, 1, 8, 6, 6, B.STEEL_BLOCK);
  // twin cooling chimneys
  for (const [x, z] of [[2, 2], [6, 3]]) { bp.box(x, 7, z, x + 1, 12, z + 1, B.BRICK); bp.set(x, 13, z, B.DARK_STONE); bp.point('smoke', x, 14, z); }
  // generators & coal heap
  bp.set(3, 1, 3, B.STEEL_BLOCK); bp.set(3, 2, 3, B.COPPER_ROOF); bp.set(6, 1, 3, B.STEEL_BLOCK); bp.set(6, 2, 3, B.COPPER_ROOF);
  bp.set(4, 4, 3, B.LAMP);
  bp.box(9, 1, 1, 10, 1, 4, B.COAL_ORE); bp.set(9, 2, 2, B.COAL_ORE);
  // transformer yard
  bp.set(10, 1, 7, B.STEEL_BLOCK); bp.set(10, 2, 7, B.STEEL_BLOCK); bp.set(10, 3, 7, B.LAMP);
  for (let y = 1; y <= 3; y++) bp.del(5, y, 6);
  bp.del(4, 2, 6); bp.del(4, 3, 6);
  bp.point('door', 5, 1, 7);
  bp.point('inside', 5, 1, 3);
  bp.point('machine', 4, 1, 3); bp.point('machine', 8, 1, 2);
  return bp;
}

function teslaTower(v) {
  const bp = new BP(5, 5);
  bp.box(0, 0, 0, 4, 0, 4, B.CONCRETE);
  bp.box(1, 1, 1, 3, 1, 3, B.CONCRETE);
  bp.box(2, 2, 2, 2, 8, 2, B.STEEL_BLOCK);
  for (const y of [3, 5, 7]) { bp.set(1, y, 2, B.COPPER_ROOF); bp.set(3, y, 2, B.COPPER_ROOF); bp.set(2, y, 1, B.COPPER_ROOF); bp.set(2, y, 3, B.COPPER_ROOF); }
  bp.box(1, 9, 1, 3, 9, 3, B.BRONZE_BLOCK);
  bp.set(2, 10, 2, B.LAMP);
  bp.point('door', 2, 1, 4);
  bp.point('top', 2, 10, 2);
  return bp;
}

function searchlight(v) {
  const bp = new BP(3, 3);
  bp.box(0, 0, 0, 2, 0, 2, B.CONCRETE);
  bp.posts(0, 0, 2, 2, 1, 4, B.STEEL_BLOCK);
  bp.box(0, 5, 0, 2, 5, 2, B.STEEL_BLOCK);
  bp.set(1, 6, 1, B.LAMP);
  bp.point('door', 1, 1, 2);
  bp.point('top', 1, 6, 1);
  return bp;
}

function crystalPalace(v) {
  const bp = new BP(15, 9);
  bp.box(0, 0, 0, 14, 0, 8, B.PATH);
  bp.box(1, 0, 1, 13, 0, 7, B.MARBLE);
  // glass hall with steel ribs
  for (let x = 1; x <= 13; x++) for (let z = 1; z <= 7; z++) for (let y = 1; y <= 4; y++) {
    const edge = x === 1 || x === 13 || z === 1 || z === 7;
    if (!edge) continue;
    bp.set(x, y, z, (x % 3 === 1 || z === 1 && x % 3 === 1) ? B.STEEL_BLOCK : B.GLASS);
  }
  // barrel vault
  for (let x = 1; x <= 13; x++) {
    const rib = x % 3 === 1 ? B.STEEL_BLOCK : B.GLASS;
    bp.set(x, 5, 1, rib); bp.set(x, 5, 7, rib);
    bp.set(x, 6, 2, rib); bp.set(x, 6, 6, rib);
    for (let z = 3; z <= 5; z++) bp.set(x, 7, z, rib);
  }
  // transept dome in the middle
  bp.box(6, 8, 3, 8, 8, 5, B.GLASS); bp.set(7, 9, 4, B.LAMP);
  for (let y = 1; y <= 3; y++) bp.del(7, y, 7);
  bp.set(7, 4, 7, B.STEEL_BLOCK);
  // exhibits
  bp.set(4, 1, 4, B.CANNON); bp.set(10, 1, 4, B.BRONZE_BLOCK); bp.set(10, 2, 4, B.LAMP); bp.set(7, 1, 3, B.MARBLE); bp.set(7, 2, 3, B.LAMP);
  bp.point('door', 7, 1, 8);
  bp.point('inside', 7, 1, 5);
  return bp;
}

function eiffelTower(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.PATH);
  const S = B.STEEL_BLOCK;
  // four legs converging
  const legs = [[0, 0], [7, 0], [0, 7], [7, 7]];
  for (let y = 1; y <= 8; y++) {
    const k = Math.min(3, Math.floor(y / 2.5));
    for (const [lx, lz] of legs) {
      const x = Math.min(8, lx === 0 ? lx + k : lx - k + 1), z = Math.min(8, lz === 0 ? lz + k : lz - k + 1);
      const sx = lx === 0 ? 1 : -1, sz = lz === 0 ? 1 : -1;
      bp.set(x, y, z, S);
      if (y <= 6) { bp.set(x + sx, y, z, S); bp.set(x, y, z + sz, S); }
    }
  }
  // arches between the legs
  for (let x = 2; x <= 6; x++) { bp.set(x, 4, 1, S); bp.set(x, 4, 7, S); }
  for (let z = 2; z <= 6; z++) { bp.set(1, 4, z, S); bp.set(7, 4, z, S); }
  // first platform
  bp.ring(1, 6, 1, 7, 6, 7, S);
  bp.ring(2, 9, 2, 6, 9, 6, S);
  // spire
  for (let y = 10; y <= 16; y++) { bp.set(3, y, 3, S); bp.set(5, y, 3, S); bp.set(3, y, 5, S); bp.set(5, y, 5, S); }
  bp.ring(3, 17, 3, 5, 17, 5, S);
  for (let y = 18; y <= 23; y++) bp.set(4, y, 4, S);
  bp.set(4, 24, 4, B.LAMP);
  bp.set(4, 17, 4, B.LAMP); bp.set(4, 6, 4, B.LAMP);
  bp.point('door', 4, 1, 8);
  bp.point('inside', 4, 1, 4);
  return bp;
}

// ---- atomic & information ages
function reactor(v) {
  const bp = new BP(11, 11);
  bp.box(0, 0, 0, 10, 0, 10, B.CONCRETE);
  bp.ring(0, 0, 0, 10, 0, 10, B.HAZARD);
  // containment dome (stepped cylinder)
  const circle = (r) => { const out = []; for (let z = 0; z < 11; z++) for (let x = 0; x < 11; x++) { const d = Math.hypot(x - 4, z - 4); if (d <= r + 0.4 && d > r - 0.7) out.push([x, z]); } return out; };
  for (let y = 1; y <= 4; y++) for (const [x, z] of circle(3.2)) bp.set(x, y, z, B.CONCRETE);
  const disc = (r, y) => { for (let z = 0; z < 11; z++) for (let x = 0; x < 11; x++) if (Math.hypot(x - 4, z - 4) <= r + 0.4) bp.set(x, y, z, B.CONCRETE); };
  disc(3.2, 5); disc(2.4, 6); disc(1.4, 7);
  bp.set(4, 8, 4, B.LAMP);
  bp.set(4, 2, 1, B.GLASS); bp.set(1, 2, 4, B.GLASS);
  bp.set(4, 1, 4, B.LAMP);
  // cooling tower
  for (let y = 1; y <= 9; y++) { const r = y < 5 ? 1.9 - y * 0.12 : 1.4 + (y - 5) * 0.1; for (let z = 6; z <= 10; z++) for (let x = 6; x <= 10; x++) { const d = Math.hypot(x - 8, z - 8); if (d <= r + 0.4 && d > r - 0.8) bp.set(x, y, z, y > 7 ? B.HAZARD : B.CONCRETE); } }
  bp.point('steam', 8, 10, 8);
  // entrance
  bp.del(4, 1, 7); bp.del(4, 2, 7);
  bp.set(3, 3, 7, B.HAZARD); bp.set(5, 3, 7, B.HAZARD);
  bp.point('door', 4, 1, 8);
  bp.point('machine', 4, 1, 8); bp.point('machine', 7, 1, 5);
  return bp;
}

function bunker(v) {
  const bp = new BP(9, 7);
  bp.box(0, 0, 0, 8, 0, 6, B.CONCRETE);
  bp.ring(0, 1, 0, 8, 3, 6, B.CONCRETE);
  bp.box(0, 4, 0, 8, 4, 6, B.CONCRETE);
  bp.box(1, 5, 1, 7, 5, 5, B.GRASS);
  // firing slits & blast door
  for (const x of [2, 6]) bp.set(x, 2, 6, B.GLASS);
  bp.set(0, 2, 3, B.GLASS); bp.set(8, 2, 3, B.GLASS);
  bp.del(4, 1, 6); bp.del(4, 2, 6);
  bp.set(3, 3, 6, B.HAZARD); bp.set(4, 3, 6, B.HAZARD); bp.set(5, 3, 6, B.HAZARD);
  bp.set(4, 3, 3, B.LAMP); bp.set(2, 1, 2, B.STEEL_BLOCK); bp.set(6, 1, 2, B.STEEL_BLOCK);
  bp.point('door', 4, 1, 6);
  bp.point('inside', 4, 1, 3);
  return bp;
}

function rocketBattery(v) {
  const bp = new BP(5, 5);
  bp.box(0, 0, 0, 4, 0, 4, B.CONCRETE);
  bp.ring(0, 1, 0, 4, 1, 4, B.HAZARD);
  bp.box(1, 1, 1, 3, 1, 3, B.STEEL_BLOCK);
  // launch rails with rockets
  for (const x of [1, 3]) { bp.set(x, 2, 1, B.STEEL_BLOCK); bp.set(x, 3, 1, B.POLYMER); bp.set(x, 4, 1, B.HAZARD); }
  bp.set(2, 2, 2, B.STEEL_BLOCK);
  bp.del(2, 1, 4);
  bp.point('door', 2, 1, 4);
  bp.point('post', 2, 2, 3);
  return bp;
}

function turret(v) {
  const bp = new BP(3, 3);
  bp.box(0, 0, 0, 2, 0, 2, B.HAZARD);
  bp.box(1, 1, 1, 1, 2, 1, B.STEEL_BLOCK);
  bp.box(0, 3, 0, 2, 3, 2, B.POLYMER);
  bp.set(1, 3, 0, B.STEEL_BLOCK); bp.set(1, 4, 1, B.LAMP);
  bp.point('door', 1, 1, 2);
  bp.point('top', 1, 4, 1);
  return bp;
}

function radar(v) {
  const bp = new BP(5, 5);
  bp.box(0, 0, 0, 4, 0, 4, B.CONCRETE);
  bp.box(1, 1, 1, 3, 2, 3, B.POLYMER);
  bp.set(2, 3, 2, B.STEEL_BLOCK); bp.set(2, 4, 2, B.STEEL_BLOCK);
  // dish
  bp.box(0, 5, 1, 4, 5, 3, B.POLYMER); bp.set(0, 6, 2, B.POLYMER); bp.set(4, 6, 2, B.POLYMER); bp.set(2, 6, 2, B.LAMP);
  bp.set(2, 2, 4, B.SERVER);
  bp.point('door', 2, 1, 4);
  bp.point('top', 2, 6, 2);
  return bp;
}

function computerCenter(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.PATH);
  bp.box(1, 0, 1, 7, 0, 7, B.POLYMER);
  bp.ring(1, 1, 1, 7, 4, 7, B.POLYMER);
  for (let x = 2; x <= 6; x++) for (let y = 2; y <= 3; y++) bp.set(x, y, 7, B.GLASS);
  for (let z = 2; z <= 6; z++) for (let y = 2; y <= 3; y++) { bp.set(1, y, z, B.GLASS); bp.set(7, y, z, B.GLASS); }
  bp.box(1, 5, 1, 7, 5, 7, B.STEEL_BLOCK);
  bp.box(3, 6, 3, 5, 6, 5, B.POLYMER); bp.set(4, 7, 4, B.LAMP);
  // server rows
  for (const z of [2, 4]) for (const x of [2, 3, 5, 6]) { bp.set(x, 1, z, B.SERVER); bp.set(x, 2, z, B.SERVER); }
  bp.set(4, 4, 4, B.LAMP);
  bp.del(4, 1, 7); bp.del(4, 2, 7);
  bp.point('door', 4, 1, 8);
  bp.point('work', 4, 1, 3); bp.point('work', 4, 1, 5); bp.point('work', 2, 1, 6);
  return bp;
}

function droneHub(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.CONCRETE);
  bp.ring(1, 1, 1, 5, 2, 5, B.POLYMER);
  bp.box(1, 3, 1, 5, 3, 5, B.HAZARD);
  bp.box(2, 3, 2, 4, 3, 4, B.STEEL_BLOCK);
  bp.set(3, 3, 3, B.LAMP);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) bp.set(x, 4, z, B.LAMP);
  bp.set(3, 1, 3, B.SERVER);
  bp.del(3, 1, 5); bp.del(3, 2, 5);
  bp.point('door', 3, 1, 6);
  bp.point('top', 3, 4, 3);
  return bp;
}

function cosmodrome(v) {
  const bp = new BP(11, 11);
  bp.box(0, 0, 0, 10, 0, 10, B.CONCRETE);
  bp.ring(1, 0, 1, 9, 0, 9, B.HAZARD);
  // launch tower
  bp.box(1, 1, 4, 1, 16, 4, B.STEEL_BLOCK); bp.box(1, 1, 6, 1, 16, 6, B.STEEL_BLOCK);
  for (let y = 3; y <= 15; y += 3) bp.set(1, y, 5, B.STEEL_BLOCK);
  for (let y = 4; y <= 14; y += 5) bp.box(2, y, 5, 3, y, 5, B.STEEL_BLOCK);
  // rocket
  bp.box(4, 1, 4, 6, 12, 6, B.POLYMER);
  for (let y = 3; y <= 9; y += 3) bp.set(5, y, 6, B.GLASS);
  bp.box(5, 13, 5, 5, 16, 5, B.POLYMER); bp.set(5, 17, 5, B.LAMP);
  for (const [x, z] of [[3, 5], [7, 5], [5, 3], [5, 7]]) bp.box(x, 1, z, x, 3, z, B.HAZARD);
  bp.box(4, 12, 4, 6, 12, 6, B.HAZARD);
  bp.set(9, 1, 9, B.SERVER); bp.set(9, 2, 9, B.LAMP);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 8, 1, 8);
  return bp;
}

function globalNetwork(v) {
  const bp = new BP(11, 11);
  bp.box(0, 0, 0, 10, 0, 10, B.POLYMER);
  // server halls around a glass core
  bp.ring(1, 1, 1, 9, 3, 9, B.POLYMER);
  for (let i = 2; i <= 8; i += 2) { bp.set(i, 2, 1, B.SERVER); bp.set(i, 2, 9, B.SERVER); bp.set(1, 2, i, B.SERVER); bp.set(9, 2, i, B.SERVER); }
  bp.box(1, 4, 1, 9, 4, 9, B.STEEL_BLOCK);
  // glass spire
  for (let y = 5; y <= 14; y++) { const r = y < 10 ? 2 : y < 13 ? 1 : 0; bp.ring(5 - r, y, 5 - r, 5 + r, y, 5 + r, r ? B.GLASS : B.LAMP); }
  bp.set(5, 15, 5, B.LAMP);
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]]) { bp.box(x, 5, z, x, 7, z, B.STEEL_BLOCK); bp.set(x, 8, z, B.LAMP); }
  bp.del(5, 1, 9); bp.del(5, 2, 9);
  bp.point('door', 5, 1, 10);
  bp.point('inside', 5, 1, 5);
  return bp;
}

// ---- singularity
function aiCore(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.POLYMER);
  bp.ring(0, 0, 0, 6, 0, 6, B.HAZARD);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) bp.box(x, 1, z, x, 4, z, B.SERVER);
  bp.box(2, 1, 2, 4, 1, 4, B.POLYMER);
  bp.box(2, 2, 2, 4, 5, 4, B.GLASS);
  bp.box(3, 2, 3, 3, 5, 3, B.LAMP);
  bp.box(1, 5, 1, 5, 5, 5, B.POLYMER); bp.box(2, 5, 2, 4, 5, 4, B.GLASS); bp.set(3, 5, 3, B.LAMP);
  bp.box(2, 6, 2, 4, 6, 4, B.POLYMER); bp.set(3, 7, 3, B.LAMP);
  bp.point('door', 3, 1, 6);
  bp.point('top', 3, 7, 3);
  return bp;
}

function laserTower(v) {
  const bp = new BP(3, 3);
  bp.box(0, 0, 0, 2, 0, 2, B.POLYMER);
  bp.box(1, 1, 1, 1, 5, 1, B.STEEL_BLOCK);
  for (const y of [2, 4]) { bp.set(0, y, 1, B.POLYMER); bp.set(2, y, 1, B.POLYMER); bp.set(1, y, 0, B.POLYMER); bp.set(1, y, 2, B.POLYMER); }
  bp.box(0, 6, 0, 2, 6, 2, B.POLYMER);
  bp.set(1, 7, 1, B.LAMP);
  bp.point('door', 1, 1, 2);
  bp.point('top', 1, 7, 1);
  return bp;
}

function nanofactory(v) {
  const bp = new BP(9, 9);
  bp.box(0, 0, 0, 8, 0, 8, B.POLYMER);
  bp.ring(1, 1, 1, 7, 4, 7, B.POLYMER);
  for (let x = 2; x <= 6; x++) for (let y = 2; y <= 3; y++) { bp.set(x, y, 1, B.GLASS); bp.set(x, y, 7, B.GLASS); }
  bp.box(1, 5, 1, 7, 5, 7, B.GLASS);
  for (let x = 1; x <= 7; x += 3) for (let z = 1; z <= 7; z++) bp.set(x, 5, z, B.STEEL_BLOCK);
  // assembler vats
  for (const [x, z] of [[3, 3], [5, 3], [3, 5], [5, 5]]) { bp.set(x, 1, z, B.STEEL_BLOCK); bp.set(x, 2, z, B.LAMP); }
  bp.set(4, 1, 4, B.SERVER); bp.set(4, 2, 4, B.SERVER);
  bp.del(4, 1, 7); bp.del(4, 2, 7);
  bp.point('door', 4, 1, 8);
  bp.point('top', 4, 6, 4);
  return bp;
}

function shieldGenerator(v) {
  const bp = new BP(7, 7);
  bp.box(0, 0, 0, 6, 0, 6, B.CONCRETE);
  bp.ring(0, 0, 0, 6, 0, 6, B.HAZARD);
  bp.box(1, 1, 1, 5, 1, 5, B.POLYMER);
  bp.box(2, 2, 2, 4, 2, 4, B.STEEL_BLOCK);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) { bp.box(x, 2, z, x, 5, z, B.STEEL_BLOCK); bp.set(x, 6, z, B.LAMP); }
  bp.box(3, 3, 3, 3, 8, 3, B.STEEL_BLOCK);
  for (const y of [4, 6, 8]) { bp.set(2, y, 3, B.GLASS); bp.set(4, y, 3, B.GLASS); bp.set(3, y, 2, B.GLASS); bp.set(3, y, 4, B.GLASS); }
  bp.set(3, 9, 3, B.LAMP);
  bp.point('door', 3, 1, 6);
  bp.point('top', 3, 9, 3);
  return bp;
}

function singularity(v) {
  const bp = new BP(13, 13);
  bp.box(0, 0, 0, 12, 0, 12, B.POLYMER);
  bp.ring(0, 0, 0, 12, 0, 12, B.LAMP);
  // outer server ring
  bp.ring(1, 1, 1, 11, 2, 11, B.SERVER);
  for (let i = 2; i <= 10; i += 4) { bp.del(i, 1, 11); bp.del(i, 2, 11); }
  // pylons
  for (const [x, z] of [[1, 1], [11, 1], [1, 11], [11, 11]]) { bp.box(x, 3, z, x, 10, z, B.STEEL_BLOCK); bp.set(x, 11, z, B.LAMP); }
  // central spire of glass and light
  for (let y = 1; y <= 22; y++) {
    const r = y < 6 ? 3 : y < 12 ? 2 : y < 18 ? 1 : 0;
    if (r) bp.ring(6 - r, y, 6 - r, 6 + r, y, 6 + r, y % 4 === 0 ? B.POLYMER : B.GLASS);
    bp.set(6, y, 6, B.LAMP);
  }
  // floating rings
  for (const [y, r] of [[8, 4], [14, 3], [19, 2]]) for (let x = 6 - r; x <= 6 + r; x++) for (let z = 6 - r; z <= 6 + r; z++) if (Math.abs(Math.hypot(x - 6, z - 6) - r) < 0.5) bp.set(x, y, z, B.LAMP);
  bp.set(6, 23, 6, B.LAMP);
  bp.del(6, 1, 9); bp.del(6, 2, 9);
  bp.point('door', 6, 1, 12);
  bp.point('inside', 6, 1, 10);
  return bp;
}

function rotXZ(x, z, w, d, rot) {
  switch (rot & 3) {
    case 1: return [d - 1 - z, x];
    case 2: return [w - 1 - x, d - 1 - z];
    case 3: return [z, w - 1 - x];
    default: return [x, z];
  }
}

const cache = new Map();
// Era tier used for previews / icons when no tier is given (the village sets it to the current age + 1).
let eraTier = 1;
export function setEraTier(t) { eraTier = Math.max(1, Math.min(10, t | 0)); }
export function getEraTier() { return eraTier; }
function compile(type, rot, variant, tier) {
  if (!type.tiered) tier = 0;
  const key = type.id + ':' + (rot & 3) + ':' + variant + ':' + tier;
  let c = cache.get(key);
  if (c) return c;
  const bp = type.tiered ? type.design(variant, tier) : type.design(variant);
  const { w, d } = bp;
  const blocks = [];
  let height = 0;
  for (const cell of bp.cells.values()) {
    const [x, z] = rotXZ(cell.dx, cell.dz, w, d, rot);
    blocks.push({ dx: x, dy: cell.dy, dz: z, id: cell.id });
    height = Math.max(height, cell.dy + 1);
  }
  // build order: bottom-up; solid structure before decoration (torches, glass, plants, water) of that layer
  const deco = (id) => id === B.TORCH || id === B.GLASS || id === B.WINDOW || id === B.GLASS_BLUE || id === B.ENERGY_GLASS || id === B.LED || id === B.NEON || id === B.LAMP || id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.MUSHROOM || id === B.LANTERN || id === B.BANNER || id === B.WATER;
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
  // era designs: the type grows and changes materials with every age (see architecture.js)
  const era = tiered(id, t.design);
  if (era) { t.tiered = true; t.design = era; }
  t.blueprint = (rot = 0, variant = 0, tier = eraTier) => compile(t, rot, variant % t.variants, tier).blocks;
  t.layout = (rot = 0, variant = 0, tier = eraTier) => compile(t, rot, variant % t.variants, tier);
  const l = t.layout(0, 0, 4);
  t.size = [l.w, l.d];
  t.height = l.height;
  BUILDING_TYPES[id] = t;
  return t;
}

def('town_hall', {
  name: 'Ратуша', desc: 'Сердце деревни: жильё для 4 жителей, 2 поста стражи, лучники на башне сами стреляют по нежити. Если её разрушат — игра окончена.',
  cost: { wood: 200, stone: 200 }, hp: 2000, popBonus: 4, jobs: { guard: 2 }, category: 'economy', maxCount: 1, design: townHall, storage: ['wood', 'stone', 'food', 'iron', 'iron_ore', 'coal', 'gold', 'gold_ore', 'crystal', 'uranium'], auto: true,
});
def('house', {
  name: 'Дом', desc: 'Уютный фахверковый дом. +4 к населению. Ночью жители прячутся внутри.',
  cost: { wood: 20, stone: 10 }, hp: 450, popBonus: 4, category: 'economy', design: house, variants: 4,
});
def('builder_hut', {
  name: 'Дом строителя', desc: 'Мастерская бригады строителей: +2 места для строителей. Строители из хижины работают на 15% быстрее.',
  cost: { wood: 30, stone: 15 }, hp: 300, popBonus: 1, category: 'economy', design: builderHut, variants: 2, builderSlots: 2,
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
  cost: { wood: 30, stone: 15 }, hp: 350, category: 'economy', design: storehouse, storage: ['wood', 'stone', 'food', 'iron', 'iron_ore', 'coal', 'gold', 'gold_ore', 'crystal', 'uranium'],
});
def('mine', {
  name: 'Шахта', desc: 'Шахтёры роют настоящий карьер ступенями вглубь: камень, уголь, железо, золото и кристаллы.',
  cost: { wood: 25, stone: 10 }, hp: 300, jobs: { miner: 2 }, research: null, category: 'economy', design: mine, storage: ['stone', 'coal', 'iron_ore', 'iron', 'gold_ore', 'gold', 'crystal', 'uranium'],
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

// ---- civilisation ages (age = index into AGES, see systems/ages.js)
def('granary', {
  name: 'Амбар', desc: 'Хранилище урожая: фермы дают на 25% больше еды (не суммируется), рядом удобно сдавать еду и дерево.',
  cost: { wood: 60, stone: 40 }, hp: 450, age: 1, category: 'economy', maxCount: 2, design: granary, storage: ['food', 'wood'],
});
def('market', {
  name: 'Рынок', desc: 'Торговцы продают излишки еды, дерева и камня за золото. Золото нужно для улучшений и эпох.',
  cost: { wood: 80, stone: 60, gold: 10 }, hp: 500, age: 1, jobs: { merchant: 2 }, category: 'economy', maxCount: 2, design: market, storage: ['gold'],
});
def('castle', {
  name: 'Замок', desc: 'Каменная крепость с донжоном: +6 жителей, 4 поста стражи, очень прочные стены.',
  cost: { stone: 400, wood: 150, iron: 40 }, hp: 3500, popBonus: 6, age: 3, jobs: { guard: 4 }, category: 'military', maxCount: 1, design: castle,
});
def('cannon_tower', {
  name: 'Бастион', desc: 'Каменная башня с пушкой. Канонир бьёт ядрами по толпе зомби — урон по площади.',
  cost: { stone: 150, iron: 40, coal: 20 }, hp: 900, age: 4, jobs: { gunner: 1 }, category: 'military', design: cannonTower,
});
// wonders: one per age, huge projects with village-wide effects
def('stonehenge', {
  name: 'Каменный круг', desc: 'Чудо каменного века. Учёные получают на 30% больше очков исследований, жители спокойнее.',
  cost: { stone: 250, wood: 150, food: 80 }, hp: 1500, age: 0, wonder: true, category: 'wonder', maxCount: 1, design: stonehenge,
});
def('ziggurat', {
  name: 'Великий зиккурат', desc: 'Чудо бронзового века. +10 к населению, фермы дают на 25% больше еды.',
  cost: { stone: 500, wood: 200, food: 200, gold: 40 }, hp: 3000, popBonus: 10, age: 1, wonder: true, category: 'wonder', maxCount: 1, design: ziggurat,
});
def('colossus', {
  name: 'Бронзовый колосс', desc: 'Чудо железного века. Стражники, лучники, маги и пушки наносят на 25% больше урона.',
  cost: { stone: 400, iron: 120, gold: 80 }, hp: 3000, age: 2, wonder: true, category: 'wonder', maxCount: 1, design: colossus,
});
def('cathedral', {
  name: 'Великий собор', desc: 'Чудо Средневековья. Жители лечатся вдвое быстрее и всегда в хорошем настроении, ратуша на 50% прочнее.',
  cost: { stone: 800, wood: 300, gold: 150, crystal: 20 }, hp: 4000, age: 3, wonder: true, category: 'wonder', maxCount: 1, design: cathedral,
});
def('arsenal', {
  name: 'Королевский арсенал', desc: 'Чудо эпохи пороха. Башни и бастионы стреляют дальше на 25% и быстрее на 20%.',
  cost: { stone: 700, iron: 250, gold: 200, coal: 120 }, hp: 4000, age: 4, wonder: true, category: 'wonder', maxCount: 1, design: arsenal,
});

def('factory', {
  name: 'Завод', desc: 'Инженеры плавят сталь: 3 железа + 2 угля → 2 стали. С электричеством работает в полтора раза быстрее.',
  cost: { stone: 300, iron: 120, wood: 100, coal: 40 }, hp: 1400, age: 5, research: 'steam_power', jobs: { engineer: 3 }, category: 'economy', design: factory, power: 20,
});
def('mg_nest', {
  name: 'Пулемётное гнездо', desc: 'Пулемётчик в укрытии из мешков косит зомби очередями.',
  cost: { stone: 80, iron: 60, steel: 10 }, hp: 900, age: 5, research: 'machine_guns', jobs: { gunner: 1 }, category: 'military', design: mgNest,
});
def('power_plant', {
  name: 'Электростанция', desc: 'Инженеры жгут уголь и дают 120 единиц энергии (1 уголь в 8 с). Энергия питает заводы, прожекторы и тесла-башни.',
  cost: { steel: 60, stone: 300, iron: 100 }, hp: 1600, age: 6, research: 'electricity', jobs: { engineer: 2 }, category: 'economy', design: powerPlant, powerOut: 120,
});
def('tesla_tower', {
  name: 'Тесла-башня', desc: 'Бьёт цепной молнией до 5 зомби. Нужно 30 энергии, без неё молчит.',
  cost: { steel: 50, iron: 60, crystal: 10 }, hp: 1000, age: 6, research: 'tesla', category: 'military', design: teslaTower, power: 30,
});
def('searchlight', {
  name: 'Прожектор', desc: 'Освещает округу и слепит зомби: в луче они двигаются медленнее. Нужно 10 энергии.',
  cost: { steel: 15, iron: 20 }, hp: 500, age: 6, research: 'electricity', category: 'defense', design: searchlight, power: 10,
});
def('crystal_palace', {
  name: 'Хрустальный дворец', desc: 'Чудо индустриальной эры. Все жители работают на 20% быстрее.',
  cost: { steel: 150, stone: 600, iron: 300, gold: 250 }, hp: 5000, age: 5, wonder: true, category: 'wonder', maxCount: 1, design: crystalPalace,
});
def('eiffel_tower', {
  name: 'Железная башня', desc: 'Чудо эпохи электричества. +150 энергии в сеть, вся оборона наносит на 15% больше урона.',
  cost: { steel: 300, iron: 300, gold: 300, crystal: 40 }, hp: 5000, age: 6, wonder: true, category: 'wonder', maxCount: 1, design: eiffelTower, powerOut: 150,
});

def('reactor', {
  name: 'Атомный реактор', desc: 'Инженеры запускают реактор на уране: 450 энергии (1 уран в 20 с). Прочный, но береги его от нежити.',
  cost: { steel: 250, stone: 500, crystal: 30, uranium: 10 }, hp: 4000, age: 7, research: 'nuclear', jobs: { engineer: 2 }, category: 'economy', design: reactor, powerOut: 450, fuel: 'uranium', fuelEvery: 20,
});
def('bunker', {
  name: 'Бункер', desc: 'Бетонное убежище: +8 жителей и 3 поста стражи. Выдерживает любую осаду.',
  cost: { steel: 120, stone: 400 }, hp: 6000, popBonus: 8, age: 7, research: 'nuclear', jobs: { guard: 3 }, category: 'military', design: bunker,
});
def('rocket_battery', {
  name: 'Ракетная батарея', desc: 'Ракетчик накрывает толпы нежити ракетами с огромной дальностью.',
  cost: { steel: 120, iron: 100, coal: 60 }, hp: 1200, age: 7, research: 'rocketry', jobs: { gunner: 1 }, category: 'military', design: rocketBattery,
});
def('turret', {
  name: 'Автотурель', desc: 'Автоматическая турель без экипажа: быстрые очереди по нежити. Нужно 25 энергии.',
  cost: { steel: 60, gold: 30 }, hp: 900, age: 8, research: 'computing', category: 'military', design: turret, power: 25,
});
def('radar', {
  name: 'Радар', desc: 'Засекает волну заранее: число врагов и направления атаки. Башни и турели видят на 10% дальше. Нужно 15 энергии.',
  cost: { steel: 80, gold: 60, crystal: 10 }, hp: 800, age: 8, research: 'computing', category: 'defense', design: radar, power: 15, maxCount: 1,
});
def('computer_center', {
  name: 'Вычислительный центр', desc: 'Учёные с компьютерами дают в 2,5 раза больше очков исследований (при питании). Нужно 30 энергии.',
  cost: { steel: 150, gold: 150, crystal: 20 }, hp: 1500, age: 8, research: 'computing', jobs: { researcher: 3 }, category: 'magic', design: computerCenter, power: 30,
});
def('drone_hub', {
  name: 'Дронопорт', desc: 'Три боевых дрона патрулируют небо и расстреливают нежить. Нужно 40 энергии.',
  cost: { steel: 200, uranium: 10, gold: 150 }, hp: 1400, age: 8, research: 'robotics', category: 'military', design: droneHub, power: 40,
});
def('cosmodrome', {
  name: 'Космодром', desc: 'Чудо атомного века. Орбитальный удар каждые 25 секунд ночью бьёт по самой большой толпе нежити.',
  cost: { steel: 400, uranium: 40, gold: 400, crystal: 60 }, hp: 6000, age: 7, wonder: true, category: 'wonder', maxCount: 1, design: cosmodrome,
});
def('global_network', {
  name: 'Всемирная сеть', desc: 'Чудо информационной эры. Исследования в 1,5 раза быстрее, жители работают на 10% быстрее, в каждом дронопорте +2 дрона.',
  cost: { steel: 600, uranium: 60, gold: 600, crystal: 100 }, hp: 6000, age: 8, wonder: true, category: 'wonder', maxCount: 1, design: globalNetwork,
});

def('ai_core', {
  name: 'ИИ-ядро', desc: 'Искусственный интеллект управляет городом: жители работают на 25% быстрее, оборона бьёт на 20% сильнее, свободные жители сами находят работу. Нужно 80 энергии.',
  cost: { steel: 400, uranium: 40, gold: 500, crystal: 60 }, hp: 3000, age: 9, research: 'ai', category: 'magic', maxCount: 1, design: aiCore, power: 80,
});
def('laser_tower', {
  name: 'Лазерная башня', desc: 'Мгновенный луч прожигает любую броню. Нужно 35 энергии.',
  cost: { steel: 120, crystal: 20, gold: 80 }, hp: 1200, age: 9, research: 'ai', category: 'military', design: laserTower, power: 35,
});
def('nanofactory', {
  name: 'Нанофабрика', desc: 'Нанороботы чинят все здания прямо под огнём и собирают сталь из камня (5 камня → 1 сталь). Нужно 60 энергии.',
  cost: { steel: 300, uranium: 30, gold: 300 }, hp: 2500, age: 9, research: 'nanotech', category: 'economy', maxCount: 2, design: nanofactory, power: 60,
});
def('shield_generator', {
  name: 'Генератор щита', desc: 'Энергетический купол над городом поглощает урон по зданиям, пока не иссякнет, и сам восстанавливается. Нужно 150 энергии.',
  cost: { steel: 600, uranium: 80, crystal: 150, gold: 600 }, hp: 4000, age: 9, research: 'force_fields', category: 'defense', maxCount: 1, design: shieldGenerator, power: 150,
});
def('singularity', {
  name: 'Проект «Сингулярность»', desc: 'Последнее чудо: разум цивилизации выходит за пределы плоти. Когда проект завершится, нежить бросит на город всё — «Нано-чуму». Отбейте её, чтобы победить.',
  cost: { steel: 1500, uranium: 200, gold: 2000, crystal: 300 }, hp: 8000, age: 9, wonder: true, category: 'wonder', maxCount: 1, design: singularity,
});

export const BUILDING_ORDER = ['house', 'builder_hut', 'lumber_camp', 'farm', 'storehouse', 'mine', 'granary', 'market', 'factory', 'power_plant', 'laboratory', 'forge', 'watchtower', 'barracks', 'castle', 'cannon_tower', 'mg_nest',
  'tesla_tower', 'searchlight', 'reactor', 'bunker', 'rocket_battery', 'computer_center', 'radar', 'turret', 'drone_hub', 'ai_core', 'laser_tower', 'nanofactory', 'shield_generator', 'mage_tower', 'wall', 'stone_wall',
  'stonehenge', 'ziggurat', 'colossus', 'cathedral', 'arsenal', 'crystal_palace', 'eiffel_tower', 'cosmodrome', 'global_network', 'singularity'];

export const RESEARCH_LABELS = {
  masonry: 'Каменная кладка', agriculture: 'Земледелие', mining: 'Горное дело', smithing: 'Кузнечное дело', archery: 'Стрельба из лука',
  mechanics: 'Механика', fortification: 'Фортификация', gunpowder: 'Порох', ballistics: 'Баллистика', alchemy: 'Алхимия', arcana: 'Тайные искусства',
  frost_magic: 'Магия льда', storm_magic: 'Магия бури', restoration: 'Восстановление', crystal_forging: 'Кристальная ковка', meteor: 'Метеоры',
  steam_power: 'Паровая машина', machine_guns: 'Пулемёты', electricity: 'Электричество', tesla: 'Токи Теслы',
  nuclear: 'Ядерная физика', rocketry: 'Ракеты', computing: 'Вычислительная техника', robotics: 'Робототехника',
  ai: 'Искусственный интеллект', nanotech: 'Нанотехнологии', force_fields: 'Силовые поля',
};

export { rotXZ };
