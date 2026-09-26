// Crafting & smelting.
// Items (weapons, tools, staves) must be researched (if they have a research gate) AND crafted once before use.
// Recipes need a station: available when the player stands near a matching block, or when the village has a
// completed building that contains it (so on phones you don't have to walk to it every time).
import { ITEMS, RESOURCE_LABELS } from '../core/items.js';
import { B } from '../core/blocks.js';

export const STATIONS = {
  hand: { name: 'Руки', blocks: [], buildings: [] },
  workbench: { name: 'Верстак', blocks: [B.WORKBENCH], buildings: ['town_hall', 'house', 'lumber_camp', 'builder_hut'] },
  furnace: { name: 'Печь', blocks: [B.FURNACE], buildings: ['house', 'forge'] },
  anvil: { name: 'Кузница', blocks: [B.IRON_BLOCK], buildings: ['forge'] },
  arcane: { name: 'Магический стол', blocks: [B.ARCANE_TABLE], buildings: ['laboratory', 'mage_tower'] },
};

// Items the player starts with.
export const STARTING_ITEMS = ['sword_wood', 'pickaxe_stone', 'axe_stone', 'build_hammer'];

/** kind: 'smelt' (resource → resource, takes time in the furnace queue) | 'item' (unlocks an item for the hotbar) */
export const RECIPES = [
  // ---- smelting
  { id: 'smelt_iron', kind: 'smelt', cat: 'smelt', name: 'Выплавить железо', station: 'furnace', in: { iron_ore: 2, coal: 1 }, out: { iron: 2 }, time: 4 },
  { id: 'smelt_gold', kind: 'smelt', cat: 'smelt', name: 'Выплавить золото', station: 'furnace', in: { gold_ore: 2, coal: 1 }, out: { gold: 2 }, time: 5 },
  { id: 'charcoal', kind: 'smelt', cat: 'smelt', name: 'Древесный уголь', desc: 'Пережечь дерево в уголь, если угольной руды нет.', station: 'furnace', in: { wood: 4 }, out: { coal: 1 }, time: 3 },
  { id: 'bricks', kind: 'smelt', cat: 'smelt', name: 'Обжечь камень', desc: 'Прочный обожжённый камень для стен.', station: 'furnace', in: { stone: 3, coal: 1 }, out: { stone: 5 }, time: 4 },
  // ---- tools
  { id: 'c_shovel', kind: 'item', cat: 'tools', item: 'shovel', station: 'workbench', in: { wood: 4, stone: 2 } },
  { id: 'c_pickaxe_iron', kind: 'item', cat: 'tools', item: 'pickaxe_iron', station: 'anvil', in: { iron: 4, wood: 2 } },
  // ---- weapons
  { id: 'c_sword_iron', kind: 'item', cat: 'weapons', item: 'sword_iron', station: 'anvil', in: { iron: 5, wood: 1 } },
  { id: 'c_battle_axe', kind: 'item', cat: 'weapons', item: 'battle_axe', station: 'anvil', in: { iron: 7, wood: 3 } },
  { id: 'c_bow', kind: 'item', cat: 'weapons', item: 'bow', station: 'workbench', in: { wood: 10, food: 3 } },
  { id: 'c_crossbow', kind: 'item', cat: 'weapons', item: 'crossbow', station: 'anvil', in: { wood: 10, iron: 4 } },
  { id: 'c_musket', kind: 'item', cat: 'weapons', item: 'musket', station: 'anvil', in: { iron: 9, wood: 5, coal: 4 } },
  { id: 'c_blunderbuss', kind: 'item', cat: 'weapons', item: 'blunderbuss', station: 'anvil', in: { iron: 12, wood: 5, coal: 5 } },
  { id: 'c_grenade', kind: 'item', cat: 'weapons', item: 'grenade', station: 'anvil', in: { iron: 3, coal: 8 } },
  { id: 'c_sword_crystal', kind: 'item', cat: 'weapons', item: 'sword_crystal', station: 'anvil', in: { crystal: 8, iron: 5, gold: 3 } },
  // ---- magic
  { id: 'c_staff_fire', kind: 'item', cat: 'magic', item: 'staff_fire', station: 'arcane', in: { wood: 4, crystal: 4, gold: 2 } },
  { id: 'c_staff_frost', kind: 'item', cat: 'magic', item: 'staff_frost', station: 'arcane', in: { wood: 4, crystal: 6, iron: 2 } },
  { id: 'c_staff_storm', kind: 'item', cat: 'magic', item: 'staff_storm', station: 'arcane', in: { wood: 4, crystal: 10, gold: 5 } },
  { id: 'c_staff_life', kind: 'item', cat: 'magic', item: 'staff_life', station: 'arcane', in: { wood: 4, crystal: 8, food: 20 } },
  { id: 'c_tome_meteor', kind: 'item', cat: 'magic', item: 'tome_meteor', station: 'arcane', in: { crystal: 25, gold: 12, coal: 10 } },
];
export const RECIPE_CATS = [['smelt', 'Переплавка'], ['tools', 'Инструменты'], ['weapons', 'Оружие'], ['magic', 'Магия']];
for (const r of RECIPES) if (r.kind === 'item') { r.name = ITEMS[r.item]?.name || r.item; r.desc = r.desc || ITEMS[r.item]?.desc || ''; r.time = r.time || 0; }

const TIPS = [
  'Совет: рядом с деревней лежат рудные валуны — чёрные вкрапления это уголь, бежевые — железная руда. Добывайте их киркой.',
  'Совет: руду переплавляют в «Крафте» → Переплавка (нужна печь — она есть в каждом доме). Нет угля? Пережгите дерево в древесный уголь.',
  'Совет: постройте «Шахту» — шахтёры сами добывают камень, уголь и руду, а кузнец в «Кузнице» переплавляет её.',
];

export class Crafting {
  constructor(game) {
    this.game = game;
    this.owned = new Set(STARTING_ITEMS);
    this.queue = [];          // smelting jobs: {id, left, total}
    this._stationCache = { t: -1, set: null };
  }
  init() {
    // legacy saves: items unlocked by research before crafting existed stay usable
    this.game.bus.on('game:begin', ({ loaded }) => {
      if (loaded && !this._loadedOwned) for (const id in ITEMS) { const r = ITEMS[id].research; if ((r && this.game.state.researchDone.has(r)) || this.game.state.unlockedItems?.has(id)) this.owned.add(id); }
    });
  }
  onNewGame() { this.owned = new Set(STARTING_ITEMS); this.queue = []; this._loadedOwned = true; this._tips = 0; this._tipT = 40; }

  owns(itemId) { return this.owned.has(itemId); }
  researched(itemId) {
    const it = ITEMS[itemId]; if (!it) return false;
    return !it.research || this.game.state.researchDone.has(it.research);
  }
  recipeForItem(itemId) { return RECIPES.find(r => r.item === itemId) || null; }

  /** Set of station ids currently usable by the player. */
  stations() {
    const g = this.game;
    if (this._stationCache.t === g.time) return this._stationCache.set;
    const set = new Set(['hand']);
    const done = (g.village?.buildings || []).filter(b => b.state === 'complete');
    for (const [id, st] of Object.entries(STATIONS)) {
      if (id === 'hand') continue;
      if (done.some(b => st.buildings.includes(b.type))) { set.add(id); continue; }
      if (st.blocks.length && this._blockNearPlayer(st.blocks, 6)) set.add(id);
    }
    this._stationCache = { t: g.time, set };
    return set;
  }
  _blockNearPlayer(ids, r) {
    const p = this.game.player?.position, w = this.game.world;
    if (!p || !w) return false;
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (let y = py - 2; y <= py + 3; y++) for (let z = pz - r; z <= pz + r; z++) for (let x = px - r; x <= px + r; x++) if (ids.includes(w.getBlock(x, y, z))) return true;
    return false;
  }

  /** {ok, reason} whether a recipe can be crafted right now. */
  check(r) {
    const st = this.game.state;
    if (r.kind === 'item') {
      if (this.owns(r.item)) return { ok: false, reason: 'Уже есть', owned: true };
      if (!this.researched(r.item)) return { ok: false, reason: 'Нужно исследование', locked: true };
    }
    if (!this.stations().has(r.station)) return { ok: false, reason: 'Нужна станция: ' + STATIONS[r.station].name, station: true };
    if (!st.canAfford(r.in)) return { ok: false, reason: 'Не хватает ресурсов', poor: true };
    return { ok: true };
  }
  /** Craft once (items) or enqueue n smelting jobs. Returns true on success. */
  craft(recipeId, n = 1) {
    const r = RECIPES.find(x => x.id === recipeId); if (!r) return false;
    const g = this.game;
    let done = 0;
    for (let i = 0; i < n; i++) {
      const c = this.check(r);
      if (!c.ok) { if (!done) g.bus.emit('toast', { text: c.reason, kind: 'bad' }); break; }
      g.state.spend(r.in);
      if (r.kind === 'item') {
        this.owned.add(r.item);
        g.bus.emit('item:unlocked', { id: r.item });
        g.bus.emit('toast', { text: 'Создано: ' + r.name, kind: 'good' });
        g.audio?.play('level_up', { volume: 0.7 });
        this._equip(r.item);
      } else {
        this.queue.push({ id: r.id, left: r.time, total: r.time });
      }
      done++;
    }
    if (done && r.kind === 'smelt') g.audio?.play('fire_impact', { volume: 0.4 });
    if (done) g.bus.emit('craft:changed', {});
    return done > 0;
  }
  /** Put a newly crafted item into the hotbar if it isn't there yet. */
  _equip(itemId) {
    const p = this.game.player; if (!p?.hotbar) return;
    if (p.hotbar.includes(itemId)) return;
    const free = p.hotbar.findIndex(id => !id || !this.owns(id));
    if (free >= 0) p.hotbar[free] = itemId; else if (p.hotbar.length < 9) p.hotbar.push(itemId);
    this.game.bus.emit('hotbar:changed', {});
  }
  update(dt) {
    // early-game tips about ore & crafting (new games only)
    if (this._tipT > 0 && (this._tipT -= dt) <= 0 && this._tips < TIPS.length) {
      this.game.bus.emit('toast', { text: TIPS[this._tips++], kind: 'info' });
      this._tipT = this._tips < TIPS.length ? 45 : 0;
    }
    if (!this.queue.length) return;
    const j = this.queue[0];
    j.left -= dt;
    if (j.left <= 0) {
      this.queue.shift();
      const r = RECIPES.find(x => x.id === j.id);
      if (r) {
        this.game.state.addAll(r.out);
        const [res, n] = Object.entries(r.out)[0];
        this.game.bus.emit('toast', { text: `Печь: +${n} ${RESOURCE_LABELS[res] || res}`, kind: 'good' });
      }
      this.game.bus.emit('craft:changed', {});
    }
  }
  serialize() { return { owned: [...this.owned], queue: this.queue }; }
  deserialize(o) {
    if (!o) return;
    this.owned = new Set([...STARTING_ITEMS, ...(o.owned || [])]);
    this.queue = o.queue || [];
    this._loadedOwned = true;
  }
}
