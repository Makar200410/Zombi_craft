// Item registry: weapons, spells and tools the player (and guards) can wield.
// kind: 'melee' | 'ranged' | 'gun' | 'spell' | 'tool' | 'build'
// research: research id that must be completed to unlock (null = available from start)
// projectile: key understood by src/combat/projectiles.js
// sprite: icon/held-item sprite name drawn by src/art/icons.js (getItemSprite(name) -> 32x32 canvas)

export const ITEMS = {};
function item(id, o) { ITEMS[id] = { id, research: null, cooldown: 0.5, damage: 0, range: 3, manaCost: 0, ammo: null, sprite: id, ...o }; }

// --- tools
item('build_hammer', { name: 'Молот строителя', kind: 'build', desc: 'Ставит блоки из палитры. Тратит ресурсы деревни.' });
item('pickaxe_stone', { name: 'Каменная кирка', kind: 'tool', toolType: 'pick', speed: 2.0, damage: 3, cooldown: 0.35 });
item('pickaxe_iron', { name: 'Железная кирка', kind: 'tool', toolType: 'pick', speed: 3.5, damage: 4, cooldown: 0.3, research: 'smithing' });
item('axe_stone', { name: 'Каменный топор', kind: 'tool', toolType: 'axe', speed: 2.2, damage: 5, cooldown: 0.5 });
item('shovel', { name: 'Лопата', kind: 'tool', toolType: 'shovel', speed: 3.0, damage: 2, cooldown: 0.35 });

// --- melee
item('sword_wood', { name: 'Деревянный меч', kind: 'melee', damage: 5, cooldown: 0.45, range: 3.0, knockback: 4 });
item('sword_iron', { name: 'Железный меч', kind: 'melee', damage: 9, cooldown: 0.42, range: 3.2, knockback: 5, research: 'smithing' });
item('battle_axe', { name: 'Боевой топор', kind: 'melee', damage: 15, cooldown: 0.9, range: 3.3, knockback: 8, cleave: true, research: 'smithing' });
item('sword_crystal', { name: 'Кристальный клинок', kind: 'melee', damage: 16, cooldown: 0.35, range: 3.5, knockback: 6, research: 'crystal_forging', element: 'arcane' });

// --- ranged / guns
item('bow', { name: 'Длинный лук', kind: 'ranged', damage: 8, cooldown: 0.7, range: 60, projectile: 'arrow', charge: true, research: 'archery' });
item('crossbow', { name: 'Арбалет', kind: 'ranged', damage: 14, cooldown: 1.2, range: 70, projectile: 'bolt', research: 'mechanics' });
item('musket', { name: 'Кремнёвый мушкет', kind: 'gun', damage: 30, cooldown: 1.8, range: 90, projectile: 'bullet', research: 'gunpowder' });
item('blunderbuss', { name: 'Мушкетон', kind: 'gun', damage: 9, pellets: 7, spread: 0.12, cooldown: 1.4, range: 25, projectile: 'bullet', research: 'gunpowder' });
item('grenade', { name: 'Пороховая бомба', kind: 'ranged', damage: 35, cooldown: 1.5, range: 30, projectile: 'bomb', splash: 4, research: 'gunpowder' });

// --- spells (staves), consume player mana
item('staff_fire', { name: 'Посох углей', kind: 'spell', damage: 14, cooldown: 0.6, manaCost: 8, range: 50, projectile: 'fireball', splash: 2.5, element: 'fire', research: 'arcana' });
item('staff_frost', { name: 'Посох стужи', kind: 'spell', damage: 8, cooldown: 0.4, manaCost: 6, range: 45, projectile: 'ice_shard', slow: 0.5, element: 'frost', research: 'frost_magic' });
item('staff_storm', { name: 'Посох бури', kind: 'spell', damage: 18, cooldown: 1.0, manaCost: 14, range: 40, projectile: 'lightning', chain: 4, element: 'storm', research: 'storm_magic' });
item('staff_life', { name: 'Посох жизни', kind: 'spell', damage: 0, heal: 25, cooldown: 2.0, manaCost: 20, range: 8, projectile: 'heal_nova', element: 'life', research: 'restoration' });
item('tome_meteor', { name: 'Фолиант метеоров', kind: 'spell', damage: 80, cooldown: 8, manaCost: 60, range: 80, projectile: 'meteor', splash: 6, element: 'fire', research: 'meteor' });

// Default hotbar layout for a new game (ids may be locked until researched).
export const DEFAULT_HOTBAR = ['sword_wood', 'pickaxe_stone', 'axe_stone', 'build_hammer', 'bow', 'staff_fire', 'musket', 'staff_frost', 'staff_storm'];

export const RESOURCES = ['wood', 'stone', 'food', 'coal', 'iron_ore', 'iron', 'gold_ore', 'gold', 'crystal'];
export const RESOURCE_LABELS = { wood: 'Дерево', stone: 'Камень', food: 'Еда', iron: 'Железо', coal: 'Уголь', gold: 'Золото', iron_ore: 'Железная руда', gold_ore: 'Золотая руда', crystal: 'Кристаллы маны' };
