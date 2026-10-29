// The underground of deep worlds: depth layers the player is told about when going down, treasure chests (in caves,
// mineshafts and dungeons) whose loot gets better the deeper they lie, the monsters that live down there (they
// come out of the dark near the player) and the spawner cages and bosses of the dungeons.
import { B, WATER_IDS } from '../core/blocks.js';
import { ITEMS, RESOURCE_LABELS } from '../core/items.js';

/** Depth layers (format-2 worlds: blocks below sea level). */
export const LAYERS = [
  { id: 'surface', min: -Infinity, name: 'Поверхность' },
  { id: 'under', min: 8, name: 'Подземелье', text: 'пещеры, уголь и железо' },
  { id: 'caverns', min: 20, name: 'Пещерный ярус', text: 'огромные гроты, золото, грибные пещеры, озёра' },
  { id: 'depths', min: 32, name: 'Глубины', text: 'лава, кристаллы, аметисты и богатые сундуки' },
];
// Terraria-deep worlds (format 3): the layers by height
const LAYERS3 = [
  { id: 'surface', name: 'Поверхность' },
  { id: 'under', name: 'Подземелье', text: 'туннели, заброшенные шахты, уголь и железо' },
  { id: 'caverns', name: 'Пещерный ярус', text: 'огромные пещеры: грибные рощи, подземные джунгли, ледяные гроты, озёра, золото и кристаллы' },
  { id: 'depths', name: 'Глубокие пещеры', text: 'лава, аметистовые жеоды, старые хижины с сундуками' },
  { id: 'hell', name: 'Преисподняя', text: 'море лавы, острова пепла и руины с богатыми сундуками. Осторожно!' },
];
export function layerAt(world, y) {
  if (world.format >= 3) {
    const sea = world.sea;
    const i = y > sea - 8 ? 0 : y > sea - 40 ? 1 : y > 160 ? 2 : y > 92 ? 3 : 4;
    return LAYERS3[i];
  }
  const d = world.sea - y;
  let l = LAYERS[0];
  for (const x of LAYERS) if (d >= x.min) l = x;
  return l;
}
const ORDER = ['surface', 'under', 'caverns', 'depths', 'hell'];

// loot by layer: resources [min, max] and the chance / pool of a rare item
const LOOT = {
  surface: { res: { wood: [8, 16], food: [4, 8], coal: [2, 5] }, item: 0.1, pool: ['shovel', 'bow'] },
  under: { res: { coal: [5, 10], iron_ore: [4, 8], food: [4, 8], wood: [6, 12] }, item: 0.15, pool: ['shovel', 'bow', 'pickaxe_iron'] },
  caverns: { res: { iron: [4, 8], gold_ore: [3, 6], coal: [6, 10], crystal: [1, 3] }, item: 0.3, pool: ['sword_iron', 'crossbow', 'battle_axe', 'staff_fire', 'pickaxe_iron'] },
  depths: { res: { gold: [4, 8], crystal: [4, 9], iron: [6, 10], gold_ore: [4, 8] }, item: 0.5, pool: ['sword_crystal', 'staff_frost', 'staff_storm', 'staff_life', 'battle_axe', 'crossbow'] },
  hell: { res: { gold: [8, 16], crystal: [8, 16], iron: [8, 14], coal: [10, 20] }, item: 0.7, pool: ['sword_crystal', 'staff_storm', 'tome_meteor', 'staff_fire', 'staff_frost', 'staff_life'] },
};
// dungeon chests (tagged by the generator in world.chestTier) are richer than the layer's
const DUNGEON_LOOT = {
  dungeon: { res: { gold: [6, 12], iron: [6, 12], crystal: [2, 6], coal: [6, 12] }, item: 0.45, pool: ['sword_iron', 'crossbow', 'battle_axe', 'staff_fire', 'staff_frost', 'sword_crystal', 'pickaxe_iron'] },
  vault: { res: { gold: [14, 26], crystal: [6, 12], iron: [10, 18] }, item: 0.7, pool: ['sword_crystal', 'staff_storm', 'staff_life', 'battle_axe', 'crossbow', 'tome_meteor'] },
  boss: { res: { gold: [30, 50], crystal: [14, 24], iron: [16, 24] }, item: 1, pool: ['tome_meteor', 'staff_storm', 'sword_crystal', 'staff_life', 'staff_frost'] },
};
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Danger grows with depth: ten levels from the first tunnels under the grass to the bottom of the underworld.
// Each level: who lives there ([type, weight]), how tough they are (hp / damage multipliers, the wave their stats
// are scaled to), how many come at once, and from level 5 the bosses that roam it (chance per spawn, cooldown).
export const DEPTH_TIERS = [
  { name: 'Неглубокие норы', folk: [['walker', 4], ['crawler', 3], ['slime_small', 2], ['bat', 1]], hp: 0.7, dmg: 0.7, wave: 2, cap: 3 },
  { name: 'Сырые туннели', folk: [['walker', 3], ['crawler', 2], ['cave_spider', 2], ['bat', 2], ['slime', 1]], hp: 0.85, dmg: 0.85, wave: 4, cap: 4 },
  { name: 'Заброшенные шахты', folk: [['cave_dweller', 3], ['cave_spider', 3], ['runner', 2], ['slime', 2], ['skeleton', 1]], hp: 1, dmg: 1, wave: 6, cap: 5 },
  { name: 'Гулкие гроты', folk: [['skeleton', 3], ['armored', 2], ['cave_dweller', 2], ['leaper', 2], ['slime', 2], ['spitter', 1]], hp: 1.15, dmg: 1.1, wave: 8, cap: 6 },
  { name: 'Пещерный ярус', folk: [['armored', 3], ['leaper', 2], ['skeleton', 2], ['frost', 2], ['harpy', 1], ['digger', 1]], hp: 1.3, dmg: 1.2, wave: 10, cap: 6,
    bosses: [['brute', 1]], bossChance: 0.06 },
  { name: 'Ледяные глубины', folk: [['frost', 3], ['armored', 2], ['screamer', 1], ['exploder', 2], ['harpy', 2], ['brute', 1]], hp: 1.5, dmg: 1.3, wave: 12, cap: 7,
    bosses: [['brute', 2], ['giant', 1]], bossChance: 0.07 },
  { name: 'Глубокие пещеры', folk: [['brute', 2], ['burning', 3], ['skeleton', 2], ['mutant', 2], ['screamer', 1], ['leaper', 2]], hp: 1.7, dmg: 1.45, wave: 15, cap: 8,
    bosses: [['giant', 2], ['necromancer', 1]], bossChance: 0.08 },
  { name: 'Врата преисподней', folk: [['imp', 3], ['burning', 3], ['magma_golem', 1], ['mutant', 2], ['skeleton', 1]], hp: 2, dmg: 1.6, wave: 18, cap: 8,
    bosses: [['necromancer', 2], ['giant', 2]], bossChance: 0.09 },
  { name: 'Пепельные пустоши', folk: [['imp', 3], ['magma_golem', 2], ['irradiated', 2], ['burning', 2], ['giant', 1]], hp: 2.4, dmg: 1.8, wave: 22, cap: 9,
    bosses: [['lich', 2], ['necromancer', 1]], bossChance: 0.1 },
  { name: 'Дно преисподней', folk: [['magma_golem', 3], ['imp', 2], ['irradiated', 2], ['giant', 2], ['nanite', 2]], hp: 2.9, dmg: 2.1, wave: 26, cap: 10,
    bosses: [['lich', 2], ['nano_titan', 1]], bossChance: 0.12 },
];
/** Depth level 0..9 at height y (0 = just under the surface). */
export function depthTier(world, y) {
  const top = world.sea - 8;
  const d = Math.max(0, Math.min(0.999, (top - y) / Math.max(1, top)));
  return Math.floor(d * DEPTH_TIERS.length);
}
const BOSS_COOLDOWN = 120;    // seconds between roaming bosses

function pick(list) { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [k, w] of list) if ((r -= w) <= 0) return k; return list[0][0]; }

export class Underground {
  constructor(game) {
    this.game = game;
    this._layer = 'surface';
    this._pendingLayer = null; this._pendingT = 0;
    this._told = {};
  }
  init() {
    const g = this.game;
    g.bus.on('block:broken', ({ x, y, z, id, by }) => {
      if (id === B.CHEST && by === 'player') this.openChest(x, y, z);
      if (id === B.SPAWNER && by === 'player') this.spawnerBroken(x, y, z);
    });
    g.bus.on('game:begin', () => { this._layer = 'surface'; this._pendingLayer = null; this._spawnT = 4; });
    g.bus.on('dungeon:boss', ({ key }) => {
      g.state.bossesSlain = g.state.bossesSlain || new Set();
      g.state.bossesSlain.add(key);
      g.bus.emit('toast', { text: 'Хозяин подземелья пал! Его сокровищница открыта — ищите сундуки в зале.', kind: 'good' });
    });
  }

  openChest(x, y, z) {
    const g = this.game, w = g.world;
    const layer = layerAt(w, y);
    const tier = w.chestTier?.get(w.index(x, y, z));
    const L = DUNGEON_LOOT[tier] || LOOT[layer.id] || LOOT.under;
    const got = {};
    for (const [r, [a, b]] of Object.entries(L.res)) if (Math.random() < 0.8) got[r] = rint(a, b);
    if (!Object.keys(got).length) got.coal = rint(3, 6);
    g.state.addAll(got);
    if (g.net?.isClient && !g.net.ownVillage) g.net.send({ t: 'loot', res: got });          // the goods go to this player's side on the host
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
    g.audio?.play('quest_done', { volume: 0.5 });
    g.particles?.emit({ pos: { x: x + 0.5, y: y + 0.7, z: z + 0.5 }, count: 30, colors: [0xffe070, 0xfff2b0, 0xffb020], additive: true, speed: 3, dir: { x: 0, y: 3, z: 0 }, gravity: 4, life: 1, size: 0.18 });
  }

  /** A spawner cage smashed by the player: a reward and one less source of monsters. */
  spawnerBroken(x, y, z) {
    const g = this.game, w = g.world;
    w.spawners?.delete(w.index(x, y, z));
    const got = { gold: rint(4, 9), crystal: rint(1, 3) };
    g.state.addAll(got);
    g.bus.emit('toast', { text: `Клетка-спавнер разрушена! +${got.gold} ${RESOURCE_LABELS.gold}, +${got.crystal} ${RESOURCE_LABELS.crystal}`, kind: 'good' });
    g.particles?.emit({ pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, count: 40, colors: [0xa040ff, 0xff8a30, 0xffffff], additive: true, speed: 4, life: 0.9, size: 0.25 });
    g.audio?.play('fire_impact', { pos: { x, y, z }, volume: 0.8, pitch: 0.7 });
  }

  /** The heroes the deep comes for: the player, and on a network game every joined hero of the village. */
  _anchors() {
    const g = this.game, out = [];
    if (g.player && !g.player.dead) out.push({ key: g.player, pos: g.player.position });
    if (g.net?.isHost) for (const rp of g.net.players?.values() || []) if ((rp.role === 'hero' || rp.role === 'rival') && !rp.hidden) out.push({ key: rp, pos: rp.netPos });
    return out;
  }
  /** Monsters of the deep and the dungeons' spawner cages, around the player (and the joined heroes). */
  _monsters(dt) {
    const g = this.game, w = g.world, W = g.waves;
    if (!W) return;
    const anchors = this._anchors();
    if (!anchors.length) return;
    const mine = W.zombies.filter(z => z.cave && !z.dead && z.rivalId == null);
    // the far ones go back to the dark
    for (const z of mine) {
      if (z.bossKey) continue;              // dungeon bosses guard their lair
      const near = anchors.some(a => Math.hypot(z.position.x - a.pos.x, z.position.z - a.pos.z) <= 72 && Math.abs(z.position.y - a.pos.y) <= 48);
      if (!near) { z.dead = true; z.removeAt = 0; z.object3d.visible = false; }
    }
    // spawner cages near any hero
    this._cageT = (this._cageT || 0) - dt;
    if (this._cageT <= 0 && w.spawners?.size) {
      this._cageT = 1;
      for (const [i, sp] of w.spawners) {
        const d = Math.min(...anchors.map(a => Math.hypot(sp.x + 0.5 - a.pos.x, sp.y - a.pos.y, sp.z + 0.5 - a.pos.z)));
        if (d > (sp.boss ? 14 : 20)) continue;
        if (w.getBlock(sp.x, sp.y, sp.z) !== B.SPAWNER) { w.spawners.delete(i); continue; }
        if (sp.boss) {
          if (g.state.bossesSlain?.has(sp.key) || mine.some(z => z.bossKey === sp.key)) continue;
          const z = this._spawnNear(sp.type, sp.x, sp.y, sp.z, 3, 1.2, { silent: true });
          if (z) { z.bossKey = sp.key; g.bus.emit('toast', { text: `${z.name} пробудился!`, kind: 'bad', share: true }); g.audio?.play('zombie_roar', { pos: z.position, pitch: 0.5, volume: 1 }); }
          continue;
        }
        sp.t = (sp.t ?? 2) - 1;
        if (sp.t > 0) continue;
        sp.t = 5 + Math.random() * 4;
        if (mine.filter(z => z.spawnerKey === i).length >= (sp.cap || 3)) continue;
        const z = this._spawnNear(sp.type, sp.x, sp.y, sp.z, 3, sp.hp || 1.4);
        if (z) {
          z.spawnerKey = i;
          g.particles?.emit({ pos: { x: sp.x + 0.5, y: sp.y + 0.5, z: sp.z + 0.5 }, count: 18, colors: [0xa040ff, 0xff8a30], additive: true, speed: 2.5, life: 0.6, size: 0.2 });
        }
      }
    }
    // creatures coming out of the dark around each hero underground: the deeper, the more and the deadlier
    this._bossT = (this._bossT ?? 30) - dt;
    for (const a of anchors) this._darkSpawn(a, dt, mine);
  }
  _darkSpawn(a, dt, mine) {
    const g = this.game, w = g.world, W = g.waves, pos = a.pos;
    const layer = layerAt(w, Math.floor(pos.y));
    if (layer.id === 'surface') return;
    const ti = depthTier(w, Math.floor(pos.y)), T = DEPTH_TIERS[ti];
    const k = a.key;
    k._ugSpawnT = (k._ugSpawnT ?? 4) - dt;
    if (k._ugSpawnT > 0) return;
    k._ugSpawnT = Math.max(1.5, 4.5 - ti * 0.3) + Math.random() * 3;
    const around = mine.filter(z => !z.spawnerKey && !z.roamBoss && Math.abs(z.position.x - pos.x) < 40 && Math.abs(z.position.z - pos.z) < 40).length;
    if (around >= T.cap) return;
    // now and then one of the level's bosses comes hunting
    const boss = T.bosses && this._bossT <= 0 && !mine.some(z => z.roamBoss) && Math.random() < T.bossChance;
    const type = boss ? pick(T.bosses) : pick(T.folk);
    const opts = { cave: true, wanderer: true, sunproof: true, silent: true, wave: T.wave, hpMul: T.hp, dmgMul: T.dmg };
    for (let n = 0; n < 14; n++) {
      const ang = Math.random() * Math.PI * 2, r = (boss ? 18 : 14) + Math.random() * 12;
      const x = Math.floor(pos.x + Math.cos(ang) * r), z = Math.floor(pos.z + Math.sin(ang) * r);
      if (!w.isGenerated(x, z)) continue;
      const s = this._standAt(x, Math.floor(pos.y), z, 8);
      if (s === null) continue;
      const l = w.getLight(x, s, z);
      if ((l & 15) > 6 || (l >> 4) > 3) continue;                    // only in the dark
      const zb = W.spawn(type, x + 0.5, z + 0.5, { y: s, emerge: false, ...opts });
      if (!zb) return;
      zb.home = zb.position.clone();
      if (boss) {
        zb.roamBoss = true;
        this._bossT = BOSS_COOLDOWN;
        g.bus.emit('toast', { text: `Из глубины поднимается ${zb.name}!`, kind: 'bad', share: true });
        g.audio?.play('zombie_roar', { pos: zb.position, pitch: 0.5, volume: 1 });
      }
      return;
    }
  }
  /** A floor cell with two free cells above it near height y (searching up and down), or null. */
  _standAt(x, y, z, range) {
    const w = this.game.world;
    for (let d = 0; d <= range; d++) for (const yy of d ? [y - d, y + d] : [y]) {
      if (yy < 2 || yy >= w.height - 2) continue;
      if (w.isSolid(x, yy - 1, z) && !w.isSolid(x, yy, z) && !w.isSolid(x, yy + 1, z) && w.getBlock(x, yy, z) !== B.LAVA && !WATER_IDS[w.getBlock(x, yy, z)]) return yy;
    }
    return null;
  }
  _spawnNear(type, x, y, z, r, hpMul, opts = {}) {
    const W = this.game.waves;
    for (let k = 0; k < 10; k++) {
      const xx = x + Math.round((Math.random() - 0.5) * 2 * r), zz = z + Math.round((Math.random() - 0.5) * 2 * r);
      const s = this._standAt(xx, y, zz, 3);
      if (s === null) continue;
      const zb = W.spawn(type, xx + 0.5, zz + 0.5, { y: s, emerge: false, cave: true, wanderer: true, sunproof: true, silent: true, wave: Math.max(4, W.currentWave), hpMul, ...opts });
      if (zb) zb.home = zb.position.clone();
      return zb;
    }
    return null;
  }

  /** Danger level 0..9 at height y, or -1 on the surface (used by the music). */
  tierAt(y) {
    const w = this.game.world;
    if (!w || w.format === 1 || layerAt(w, y).id === 'surface') return -1;
    return depthTier(w, y);
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!p || !w || w.format === 1 || g.mode !== 'explore') return;
    if (!g.net?.isClient) this._monsters(dt);
    // a deeper danger level than ever before on this trip down
    const ti = layerAt(w, Math.floor(p.position.y)).id === 'surface' ? -1 : depthTier(w, Math.floor(p.position.y));
    if (ti < 0) this._deepest = -1;
    else if (ti > (this._deepest ?? -1)) {
      this._deepest = ti;
      if (ti > 0) g.bus.emit('toast', { text: `Глубина ${ti + 1}/${DEPTH_TIERS.length}: ${DEPTH_TIERS[ti].name} — нежить здесь сильнее`, kind: ti >= 6 ? 'bad' : 'warn' });
    }
    // tell the player which layer they've reached (after staying there a moment)
    const l = layerAt(w, Math.floor(p.position.y));
    if (l.id === this._layer) { this._pendingLayer = null; return; }
    if (this._pendingLayer !== l.id) { this._pendingLayer = l.id; this._pendingT = 1.2; return; }
    if ((this._pendingT -= dt) > 0) return;
    const deeper = ORDER.indexOf(l.id) > ORDER.indexOf(this._layer);
    this._layer = l.id; this._pendingLayer = null;
    if (!deeper || !l.text) return;
    const now = g.time;
    if (this._told[l.id] && now - this._told[l.id] < 90) return;
    this._told[l.id] = now;
    g.bus.emit('toast', { text: `${l.name} — ${l.text}`, kind: l.id === 'depths' || l.id === 'hell' ? 'warn' : 'info' });
  }
}
