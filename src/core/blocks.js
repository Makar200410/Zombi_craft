// Block registry. IDs are stable (saved games reference them) — only append.
// tiles: tile names in the texture atlas (see src/art/textures.js, which must draw every name in TILE_NAMES).
// shape: 'cube' | 'cross' (X-shaped sprite plant) | 'liquid'
// render: 'opaque' | 'cutout' (alpha-tested, e.g. leaves/plants) | 'transparent' (blended, e.g. water/glass)
// hardness: hits (seconds of mining with bare hand ≈ hardness * 0.5)
// drop: resources given to the village stockpile when broken
// cost: resources consumed when the player / builders place it
// light: 0..15 emitted block light

export const B = {};
export const BLOCKS = [];

function def(id, name, o = {}) {
  const t = o.tiles || name;
  const tiles = typeof t === 'string' ? { top: t, bottom: t, side: t } : { top: t.top || t.side, bottom: t.bottom || t.top || t.side, side: t.side };
  const b = {
    id, name,
    label: o.label || name,
    tiles,
    shape: o.shape || 'cube',
    render: o.render || 'opaque',
    solid: o.solid !== undefined ? o.solid : true,
    hardness: o.hardness !== undefined ? o.hardness : 2,
    drop: o.drop || {},
    cost: o.cost || {},
    light: o.light || 0,
    placeable: o.placeable !== undefined ? o.placeable : true,
    replaceable: !!o.replaceable,     // can be overwritten by placing (air, plants, water)
    tool: o.tool || 'any',            // 'axe' | 'pick' | 'shovel' | 'any' — faster with the right tool
  };
  BLOCKS[id] = b;
  B[name.toUpperCase()] = id;
  return b;
}

def(0, 'air', { solid: false, render: 'none', shape: 'none', hardness: 0, placeable: false, replaceable: true, tiles: 'stone' });
def(1, 'grass', { label: 'Трава', tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 1.2, tool: 'shovel' });
def(2, 'dirt', { label: 'Земля', hardness: 1.1, tool: 'shovel' });
def(3, 'stone', { label: 'Камень', hardness: 3, drop: { stone: 1 }, cost: { stone: 1 }, tool: 'pick' });
def(4, 'cobblestone', { label: 'Булыжник', hardness: 3, drop: { stone: 1 }, cost: { stone: 1 }, tool: 'pick' });
def(5, 'sand', { label: 'Песок', hardness: 1, tool: 'shovel' });
def(6, 'gravel', { label: 'Гравий', hardness: 1.2, tool: 'shovel' });
def(7, 'water', { label: 'Вода', shape: 'liquid', render: 'transparent', solid: false, hardness: 0, placeable: false, replaceable: true });
def(8, 'log', { label: 'Дубовое бревно', tiles: { top: 'log_top', side: 'log_side' }, hardness: 2.5, drop: { wood: 2 }, cost: { wood: 2 }, tool: 'axe' });
def(9, 'leaves', { label: 'Листва', render: 'cutout', hardness: 0.4, drop: {}, tool: 'axe' });
def(10, 'planks', { label: 'Доски', hardness: 2, drop: { wood: 1 }, cost: { wood: 1 }, tool: 'axe' });
def(11, 'stone_bricks', { label: 'Каменный кирпич', hardness: 4, drop: { stone: 1 }, cost: { stone: 2 }, tool: 'pick' });
def(12, 'coal_ore', { label: 'Угольная руда', hardness: 3.5, drop: { stone: 1, coal: 2 }, tool: 'pick' });
def(13, 'iron_ore', { label: 'Железная руда', hardness: 4.5, drop: { iron_ore: 2 }, tool: 'pick' });
def(14, 'gold_ore', { label: 'Золотая руда', hardness: 5, drop: { gold_ore: 2 }, tool: 'pick' });
def(15, 'crystal_ore', { label: 'Кристалл маны', hardness: 5, drop: { crystal: 2 }, light: 9, tool: 'pick' });
def(16, 'glass', { label: 'Стекло', render: 'transparent', hardness: 0.6, cost: { stone: 1 } });
def(17, 'thatch', { label: 'Соломенная крыша', hardness: 1, drop: { food: 0 }, cost: { wood: 1 }, tool: 'axe' });
def(18, 'roof_tiles', { label: 'Черепица', hardness: 2.5, cost: { stone: 1 }, drop: { stone: 1 }, tool: 'pick' });
def(19, 'farmland', { label: 'Пашня', tiles: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, hardness: 1, tool: 'shovel' });
def(20, 'wheat_0', { label: 'Пшеница', tiles: 'wheat_0', shape: 'cross', render: 'cutout', solid: false, hardness: 0.1, placeable: false, replaceable: true });
def(21, 'wheat_1', { label: 'Пшеница', tiles: 'wheat_1', shape: 'cross', render: 'cutout', solid: false, hardness: 0.1, placeable: false, replaceable: true });
def(22, 'wheat_2', { label: 'Пшеница', tiles: 'wheat_2', shape: 'cross', render: 'cutout', solid: false, hardness: 0.1, placeable: false, replaceable: true });
def(23, 'wheat_3', { label: 'Спелая пшеница', tiles: 'wheat_3', shape: 'cross', render: 'cutout', solid: false, hardness: 0.1, drop: { food: 3 }, placeable: false, replaceable: true });
def(24, 'torch', { label: 'Факел', tiles: 'torch', shape: 'cross', render: 'cutout', solid: false, hardness: 0.1, light: 14, cost: { wood: 1 } });
def(25, 'bedrock', { label: 'Коренная порода', hardness: Infinity, placeable: false });
def(26, 'tall_grass', { label: 'Высокая трава', tiles: 'tall_grass', shape: 'cross', render: 'cutout', solid: false, hardness: 0, placeable: false, replaceable: true });
def(27, 'flower_red', { label: 'Мак', tiles: 'flower_red', shape: 'cross', render: 'cutout', solid: false, hardness: 0, replaceable: true });
def(28, 'flower_yellow', { label: 'Одуванчик', tiles: 'flower_yellow', shape: 'cross', render: 'cutout', solid: false, hardness: 0, replaceable: true });
def(29, 'spruce_log', { label: 'Еловое бревно', tiles: { top: 'spruce_log_top', side: 'spruce_log_side' }, hardness: 2.5, drop: { wood: 2 }, cost: { wood: 2 }, tool: 'axe' });
def(30, 'spruce_leaves', { label: 'Хвоя', render: 'cutout', hardness: 0.4, tool: 'axe' });
def(31, 'lantern', { label: 'Фонарь', hardness: 1, light: 15, cost: { iron: 1, wood: 1 } });
def(32, 'iron_block', { label: 'Железный блок', hardness: 6, cost: { iron: 4 }, drop: { iron: 3 }, tool: 'pick' });
def(33, 'workbench', { label: 'Верстак', tiles: { top: 'workbench_top', side: 'workbench_side', bottom: 'planks' }, hardness: 2, cost: { wood: 3 }, drop: { wood: 2 }, tool: 'axe' });
def(34, 'furnace', { label: 'Печь', tiles: { top: 'furnace_top', side: 'furnace_front', bottom: 'furnace_top' }, hardness: 3.5, light: 10, cost: { stone: 4 }, drop: { stone: 2 }, tool: 'pick' });
def(35, 'bookshelf', { label: 'Книжная полка', tiles: { top: 'planks', side: 'bookshelf' }, hardness: 1.5, cost: { wood: 3 }, drop: { wood: 1 }, tool: 'axe' });
def(36, 'arcane_table', { label: 'Магический стол', tiles: { top: 'arcane_top', side: 'arcane_side', bottom: 'planks' }, hardness: 3, light: 8, cost: { wood: 2, crystal: 2 }, tool: 'pick' });
def(37, 'hay_bale', { label: 'Сноп сена', tiles: { top: 'hay_top', side: 'hay_side' }, hardness: 0.8, cost: { food: 2 }, drop: { food: 1 } });
def(38, 'plaster', { label: 'Штукатурка', hardness: 2, cost: { stone: 1 }, tool: 'pick' });
def(39, 'timber_frame', { label: 'Фахверк', hardness: 2, cost: { wood: 1, stone: 1 }, drop: { wood: 1 }, tool: 'axe' });
def(40, 'mossy_cobble', { label: 'Замшелый булыжник', hardness: 3, drop: { stone: 1 }, cost: { stone: 1 }, tool: 'pick' });
def(41, 'dark_stone', { label: 'Тёмный камень', hardness: 5, drop: { stone: 1 }, cost: { stone: 2 }, tool: 'pick' });
def(42, 'path', { label: 'Тропинка', tiles: { top: 'path_top', side: 'dirt', bottom: 'dirt' }, hardness: 1, tool: 'shovel' });
def(43, 'snow', { label: 'Снег', tiles: { top: 'snow', side: 'snow_side', bottom: 'dirt' }, hardness: 1, tool: 'shovel' });
def(44, 'palisade', { label: 'Частокол', tiles: { top: 'palisade_top', side: 'palisade_side' }, hardness: 5, cost: { wood: 3 }, drop: { wood: 1 }, tool: 'axe' });
def(45, 'reinforced_wall', { label: 'Укреплённая стена', tiles: { top: 'reinforced_top', side: 'reinforced_side' }, hardness: 12, cost: { stone: 3, iron: 1 }, drop: { stone: 1 }, tool: 'pick' });
def(46, 'banner', { label: 'Знамя деревни', tiles: 'banner', hardness: 1, cost: { wood: 1, food: 1 } });
def(47, 'mushroom', { label: 'Гриб', tiles: 'mushroom', shape: 'cross', render: 'cutout', solid: false, hardness: 0, drop: { food: 1 }, replaceable: true });
def(48, 'dead_bush', { label: 'Сухой куст', tiles: 'dead_bush', shape: 'cross', render: 'cutout', solid: false, hardness: 0, replaceable: true });
def(49, 'birch_log', { label: 'Берёзовое бревно', tiles: { top: 'birch_log_top', side: 'birch_log_side' }, hardness: 2.5, drop: { wood: 2 }, cost: { wood: 2 }, tool: 'axe' });
def(50, 'birch_leaves', { label: 'Берёзовая листва', render: 'cutout', hardness: 0.4, tool: 'axe' });

// Every tile name used by blocks + extra overlay tiles. textures.js must draw all of these.
export const TILE_NAMES = (() => {
  const s = new Set();
  for (const b of BLOCKS) if (b && b.id !== 0) { s.add(b.tiles.top); s.add(b.tiles.side); s.add(b.tiles.bottom); }
  for (let i = 0; i < 6; i++) s.add('destroy_' + i);   // mining crack overlay stages (transparent with dark cracks)
  s.add('water_flow');                                   // optional animated/side water
  s.add('ghost');                                        // blueprint ghost block overlay (translucent cyan grid)
  return [...s];
})();

export const isSolid = (id) => BLOCKS[id] ? BLOCKS[id].solid : false;
export const isOpaqueCube = (id) => { const b = BLOCKS[id]; return !!b && b.shape === 'cube' && b.render === 'opaque'; };
export const LOG_BLOCKS = new Set([B.LOG, B.SPRUCE_LOG, B.BIRCH_LOG]);
export const LEAF_BLOCKS = new Set([B.LEAVES, B.SPRUCE_LEAVES, B.BIRCH_LEAVES]);
export const ORE_BLOCKS = new Set([B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.CRYSTAL_ORE]);
// Blocks the player can pick in the build palette (in order).
export const PALETTE = [
  B.PLANKS, B.COBBLESTONE, B.STONE_BRICKS, B.LOG, B.TIMBER_FRAME, B.PLASTER, B.ROOF_TILES, B.THATCH,
  B.GLASS, B.TORCH, B.LANTERN, B.PALISADE, B.REINFORCED_WALL, B.DIRT, B.SAND, B.GRAVEL, B.PATH,
  B.MOSSY_COBBLE, B.DARK_STONE, B.BOOKSHELF, B.WORKBENCH, B.FURNACE, B.HAY_BALE, B.IRON_BLOCK, B.BANNER, B.ARCANE_TABLE,
];
