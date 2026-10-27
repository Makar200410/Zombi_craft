// The underground of deep worlds: depth layers the player is told about when going down, and treasure chests
// (in caves and abandoned mineshafts) whose loot gets better the deeper they lie.
import { B } from '../core/blocks.js';
import { ITEMS, RESOURCE_LABELS } from '../core/items.js';

/** Depth layers, measured in blocks below sea level. */
export const LAYERS = [
  { id: 'surface', min: -Infinity, name: 'Поверхность' },
  { id: 'under', min: 8, name: 'Подземелье', text: 'пещеры, уголь и железо' },
  { id: 'caverns', min: 20, name: 'Пещерный ярус', text: 'огромные гроты, золото, грибные пещеры, озёра' },
  { id: 'depths', min: 32, name: 'Глубины', text: 'лава, кристаллы, аметисты и богатые сундуки' },
];
export function layerAt(world, y) {
  const d = world.sea - y;
  let l = LAYERS[0];
  for (const x of LAYERS) if (d >= x.min) l = x;
  return l;
}

// loot by layer: resources [min, max] and the chance / pool of a rare item
const LOOT = {
  surface: { res: { wood: [8, 16], food: [4, 8], coal: [2, 5] }, item: 0.1, pool: ['shovel', 'bow'] },
  under: { res: { coal: [5, 10], iron_ore: [4, 8], food: [4, 8], wood: [6, 12] }, item: 0.15, pool: ['shovel', 'bow', 'pickaxe_iron'] },
  caverns: { res: { iron: [4, 8], gold_ore: [3, 6], coal: [6, 10], crystal: [1, 3] }, item: 0.3, pool: ['sword_iron', 'crossbow', 'battle_axe', 'staff_fire', 'pickaxe_iron'] },
  depths: { res: { gold: [4, 8], crystal: [4, 9], iron: [6, 10], gold_ore: [4, 8] }, item: 0.5, pool: ['sword_crystal', 'staff_frost', 'staff_storm', 'staff_life', 'battle_axe', 'crossbow'] },
};
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class Underground {
  constructor(game) {
    this.game = game;
    this._layer = 'surface';
    this._pendingLayer = null; this._pendingT = 0;
    this._told = {};
  }
  init() {
    const g = this.game;
    g.bus.on('block:broken', ({ x, y, z, id, by }) => { if (id === B.CHEST && by === 'player') this.openChest(x, y, z); });
    g.bus.on('game:begin', () => { this._layer = 'surface'; this._pendingLayer = null; });
  }

  openChest(x, y, z) {
    const g = this.game, w = g.world;
    const layer = layerAt(w, y);
    const L = LOOT[layer.id] || LOOT.under;
    const got = {};
    for (const [r, [a, b]] of Object.entries(L.res)) if (Math.random() < 0.8) got[r] = rint(a, b);
    if (!Object.keys(got).length) got.coal = rint(3, 6);
    g.state.addAll(got);
    const parts = Object.entries(got).map(([r, n]) => `+${n} ${RESOURCE_LABELS[r] || r}`);
    // a rare item the player doesn't have yet
    if (Math.random() < L.item) {
      const free = L.pool.filter(id => ITEMS[id] && !g.crafting?.owns(id));
      if (free.length) {
        const id = free[(Math.random() * free.length) | 0];
        g.crafting.owned.add(id);
        g.crafting._equip?.(id);
        g.bus.emit('item:unlocked', { id });
        parts.unshift('★ ' + ITEMS[id].name);
      }
    }
    g.state.stats.chests = (g.state.stats.chests || 0) + 1;
    g.bus.emit('toast', { text: 'Сундук: ' + parts.join(', '), kind: 'good' });
    g.audio?.play('coins', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.9 });
    g.audio?.play('level_up', { volume: 0.45 });
    g.particles?.emit({ pos: { x: x + 0.5, y: y + 0.7, z: z + 0.5 }, count: 30, colors: [0xffe070, 0xfff2b0, 0xffb020], additive: true, speed: 3, dir: { x: 0, y: 3, z: 0 }, gravity: 4, life: 1, size: 0.18 });
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!p || !w || w.format === 1 || g.mode !== 'explore') return;
    // tell the player which layer they've reached (after staying there a moment)
    const l = layerAt(w, Math.floor(p.position.y));
    if (l.id === this._layer) { this._pendingLayer = null; return; }
    if (this._pendingLayer !== l.id) { this._pendingLayer = l.id; this._pendingT = 1.2; return; }
    if ((this._pendingT -= dt) > 0) return;
    const deeper = LAYERS.indexOf(l) > LAYERS.findIndex(x => x.id === this._layer);
    this._layer = l.id; this._pendingLayer = null;
    if (!deeper || !l.text) return;
    const now = g.time;
    if (this._told[l.id] && now - this._told[l.id] < 90) return;
    this._told[l.id] = now;
    g.bus.emit('toast', { text: `${l.name} — ${l.text}`, kind: l.id === 'depths' ? 'warn' : 'info' });
  }
}
