// Village: buildings, villagers, jobs, construction, population, selection, save/load.
import * as THREE from 'three';
import { B, BLOCKS, LOG_BLOCKS, LEAF_BLOCKS } from '../core/blocks.js';
import { SEA_LEVEL } from '../world/terrain.js';
import { oak, birch, spruce } from '../world/terrain.js';
import { mulberry32 } from '../core/rng.js';
import { BUILDING_TYPES, BUILDING_ORDER, RESEARCH_LABELS, setEraTier } from './buildings.js';
import { Building } from './Building.js';
import { AGES } from '../systems/ages.js';
import { Industry } from './industry.js';
import { Villager } from './Villager.js';
import { Placement } from './placement.js';
import { GhostLayer, Scaffold, makeRing, makeRect, disposeObj, jobLabelTexture } from './visuals.js';
import { pickName, JOBS, JOB_ORDER } from './names.js';

const MAX_VILLAGERS = 40;
const SPAWN_INTERVAL = 40;
const LEAF_OF = { [B.LOG]: B.LEAVES, [B.BIRCH_LOG]: B.BIRCH_LEAVES, [B.SPRUCE_LOG]: B.SPRUCE_LEAVES };
const NON_TERRAIN = new Set([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);

export { BUILDING_TYPES, BUILDING_ORDER, JOBS, JOB_ORDER };

export class Village {
  constructor(game) {
    this.game = game;
    this.bus = game.bus;
    this.buildings = [];
    this.villagers = [];
    this.popCap = 0;
    this.townHall = null;
    this.nextBuildingId = 1;
    this.armory = { level: 0, progress: 0 };
    this.industry?.dispose(); this.industry = new Industry(this);
    this.industry = new Industry(this);
    this.researchPoints = 0;
    this.spawnTimer = SPAWN_INTERVAL * 0.5;
    this.spawnPoint = new THREE.Vector3();
    this.zombies = [];
    this.pathQueue = [];
    this.treeReserved = new Set();
    this.plotReserved = new Set();
    this.quarryReserved = new Set();
    this.saplings = [];          // {x,y,z,log,growAt}
    this.replantSpots = [];      // {x,y,z,log,taken}
    this.treeCache = new Map();
    this.cellIndex = new Map();  // world idx -> {b, i}
    this.foot = null;            // Int32Array(size*size): building id per column
    this.byId = new Map();
    this.ghostsDirty = true;
    this._ghostT = 0;
    this._tick = 0;
    this._hungerToastT = -1e9;
    this._self = false;
    this.selected = null;
    this.placement = new Placement(this);
    this.scaffolds = new Map();
    this.radius = 20;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
  }

  // ================================================================ lifecycle
  init() {
    const bus = this.bus;
    this.ghosts = new GhostLayer(this.game, { tint: 0x55e6ff, opacity: 0.32 });
    this.placement.init();
    bus.on('world:ready', () => this.reset());
    bus.on('block:changed', (e) => this.onBlockChanged(e));
    bus.on('research:done', ({ id }) => this.onResearch(id));
    bus.on('select:entity', ({ entity }) => this.setSelection(entity && entity.kind === 'villager' ? entity : null));
    bus.on('select:building', ({ building }) => this.setSelection(building || null));
    bus.on('select:clear', () => this.setSelection(null));
    bus.on('mode:changed', ({ mode }) => { if (mode !== 'command') this.placement.cancel(); });
    const input = this.game.input;
    if (input && input.onTap) {
      input.onTap((...a) => { const p = tapPoint(a); return p ? this.placement.onTap(p.x, p.y) : false; }, 100);
      input.onTap((...a) => { const p = tapPoint(a); return p ? this.onSelectTap(p.x, p.y) : false; }, 10);
    }
  }

  reset() {
    this.morphs = [];
    setEraTier((this.game.state.age | 0) + 1);
    for (const v of this.villagers) { this.game.entities.remove(v); }
    this.villagers = [];
    for (const s of this.scaffolds.values()) s.dispose();
    this.scaffolds.clear();
    this.buildings = [];
    this.byId.clear();
    this.cellIndex.clear();
    this.townHall = null;
    this.popCap = 0;
    this.nextBuildingId = 1;
    this.armory = { level: 0, progress: 0 };
    this.saplings = []; this.replantSpots = [];
    this.treeCache.clear(); this.treeReserved.clear(); this.plotReserved.clear(); this.quarryReserved.clear();
    this.pathQueue = [];
    const w = this.game.world;
    this.foot = w ? new Int32Array(w.size * w.size) : null;
    this.placement.cancel();
    this.setSelection(null);
    this.ghostsDirty = true;
    this.spawnTimer = SPAWN_INTERVAL * 0.5;
  }

  onNewGame() {
    this.reset();
    const w = this.game.world;
    const c = Math.floor(w.size / 2);
    // town hall at the map centre, front (door) facing +z
    const th = this.placeBuilding('town_hall', c - 5, c - 5, 0, { free: true, instant: true });
    if (!th) return;
    // central path south from the door, lamp posts, and a starter house facing the path
    const door = th.door;
    const px = Math.floor(door.x), pz0 = Math.floor(door.z) + 1;
    const edits = [];
    for (let z = pz0 - 1; z <= pz0 + 13; z++) for (const x of [px - 1, px, px + 1]) {
      if (x !== px && z > pz0 + 10) continue;
      const gy = this.groundY(x, z);
      if (gy !== th.y) continue;
      edits.push([x, gy, z, (x === px || (x + z) % 3) ? B.PATH : B.GRAVEL]);
      const a = w.getBlock(x, gy + 1, z); if (a !== B.AIR && !BLOCKS[a].solid) edits.push([x, gy + 1, z, B.AIR]);
    }
    for (const [x, z] of [[px - 2, pz0 + 3], [px + 2, pz0 + 3], [px - 2, pz0 + 9], [px + 2, pz0 + 9]]) {
      const gy = this.groundY(x, z);
      edits.push([x, gy + 1, z, B.LOG], [x, gy + 2, z, B.TORCH]);
    }
    this.bulkEdit(edits);
    this.placeBuilding('house', px + 3, pz0 + 4, 1, { free: true, instant: true });
    this.placeBuilding('house', px - 9, pz0 + 4, 3, { free: true, instant: true, variant: 1 });
    this.spawnPoint.set(door.x, door.y, door.z + 2);
    // a working economy from the first minute: a farm and a lumber camp next to the village
    const farm = this.placeNear('farm', th, 12, 26);
    const camp = this.placeNear('lumber_camp', th, 12, 30);
    this.recalcPop();
    // starting villagers: 2 builders, woodcutter, farmer and 2 guards posted at the town hall
    const jobs = [['builder'], ['builder'], ['woodcutter', camp], ['farmer', farm], ['guard', th], ['guard', th]];
    jobs.forEach(([job, wp], i) => {
      const v = this.spawnVillager({ job: wp ? 'idle' : job, female: i % 2 === 1, silent: true });
      if (!v) return;
      v.position.set(door.x - 2.5 + i, door.y, door.z + 1.5 + (i % 2));
      if (wp) this.assign(v, wp, job);
    });
    this.recalcPop();
    this.bus.emit('village:ready', { village: this });
  }

  /** Finds a valid site for a building in a ring around another building and stamps it instantly (free). */
  placeNear(typeId, around, rMin, rMax) {
    const c = around.center || { x: around.x + around.w / 2, z: around.z + around.d / 2 };
    const def = BUILDING_TYPES[typeId]; if (!def) return null;
    for (let r = rMin; r <= rMax; r += 2) {
      const n = Math.max(8, Math.round(r * 1.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r * 0.37;
        for (let rot = 0; rot < 4; rot++) {
          const L = def.layout(rot);
          const x = Math.round(c.x + Math.cos(a) * r - L.w / 2), z = Math.round(c.z + Math.sin(a) * r - L.d / 2);
          if (!this.checkSite(typeId, x, z, rot).ok) continue;
          const b = this.placeBuilding(typeId, x, z, rot, { free: true, instant: true });
          if (b) return b;
        }
      }
    }
    return null;
  }

  // ================================================================ world edits
  /** Block edit performed by the village itself (does not count as damage to buildings). */
  editBlock(x, y, z, id) {
    this._self = true;
    try { this.game.world.setBlock(x, y, z, id); } finally { this._self = false; }
  }
  /** Many edits at once: writes directly and relights once (used for instant stamping). */
  bulkEdit(list) {
    const w = this.game.world;
    if (list.length < 40) { for (const [x, y, z, id] of list) this.editBlock(x, y, z, id); return; }
    const chunks = new Set();
    for (const [x, y, z, id] of list) {
      if (!w.inBounds(x, y, z)) continue;
      const i = w.index(x, y, z);
      w.blocks[i] = id;
      w.changes?.set(i, id);
      w.damage.delete(i);
      chunks.add(Math.floor(x / 16) + ',' + Math.floor(z / 16));
    }
    // relight only around the edits (the world is far too big to relight everything)
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const [x, , z] of list) { if (x < bx0) bx0 = x; if (z < bz0) bz0 = z; if (x > bx1) bx1 = x; if (z > bz1) bz1 = z; }
    if (w.relightBox) w.relightBox(bx0 - 15, bz0 - 15, bx1 + 15, bz1 + 15); else w.computeAllLight();
    // let other systems (minimap, flow field, save changes) know
    this._self = true;
    try { for (const [x, y, z, id] of list) this.bus.emit('block:changed', { x, y, z, id, prev: B.AIR, bulk: true }); } finally { this._self = false; }
    for (const k of chunks) {
      const [cx, cz] = k.split(',').map(Number);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (nx >= 0 && nz >= 0 && nx < w.chunksX && nz < w.chunksX) w.dirty.add(nx + ',' + nz);
      }
    }
    this.bus.emit('world:bulkChanged', { count: list.length });
  }
  onBlockChanged({ x, y, z, id }) {
    if (this._self) return;
    const w = this.game.world;
    if (!w) return;
    const e = this.cellIndex.get(w.index(x, y, z));
    if (e && e.b.state !== 'destroyed') e.b.onBlockEdited(e.i, id);
  }

  /** Terrain height at a column ignoring trees (top solid non-tree block). */
  groundY(x, z) {
    const w = this.game.world;
    let y = w.surfaceY(x, z);
    while (y > 0) {
      const id = w.getBlock(x, y, z);
      if (BLOCKS[id].solid && !NON_TERRAIN.has(id)) break;
      y--;
    }
    return y;
  }

  // ================================================================ placement API
  beginPlacement(typeId) { return this.placement.begin(typeId); }
  rotatePlacement() { this.placement.rotate(); }
  cancelPlacement() { this.placement.cancel(); }
  confirmPlacement() { return this.placement.confirm(); }
  get placing() { return this.placement.active; }

  /** Completed building of this type exists (wonder / effect checks). */
  hasBuilding(typeId) {
    const t = this.game.time;
    if (this._hbT !== t) { this._hbT = t; this._hb = new Map(); }
    let r = this._hb.get(typeId);
    if (r === undefined) { r = false; for (const b of this.buildings) if (b.type === typeId && b.state === 'complete') { r = true; break; } this._hb.set(typeId, r); }
    return r;
  }
  hasWonder(typeId) { return this.hasBuilding(typeId); }
  countOf(typeId) { let n = 0; for (const b of this.buildings) if (b.type === typeId) n++; return n; }
  /** Can this type be built at all right now? {ok, reason, hard} (hard = research/limit, not just cost) */
  canPlace(typeId) {
    const def = BUILDING_TYPES[typeId];
    if (!def) return { ok: false, reason: 'Неизвестная постройка', hard: true };
    if (def.auto) return { ok: false, reason: 'Ставится автоматически', hard: true };
    if ((def.age | 0) > (this.game.state.age | 0)) return { ok: false, reason: 'Нужна эпоха: ' + AGES[def.age].name, hard: true, age: def.age };
    if (def.research && !this.game.state.researchDone.has(def.research)) return { ok: false, reason: 'Нужно исследование: ' + (RESEARCH_LABELS[def.research] || def.research), hard: true, research: def.research };
    if (this.countOf(typeId) >= def.maxCount) return { ok: false, reason: 'Достигнут предел построек этого типа', hard: true };
    if (!this.townHall) return { ok: false, reason: 'Нет ратуши', hard: true };
    if (!this.game.state.canAfford(def.cost)) return { ok: false, reason: 'Не хватает ресурсов', hard: false };
    return { ok: true, reason: '' };
  }
  variantFor(typeId, x, z) {
    const def = BUILDING_TYPES[typeId];
    if (!def || def.variants <= 1) return 0;
    if (def.line) return (x + z) & 1;
    return (((x * 73856093) ^ (z * 19349663)) >>> 0) % def.variants;
  }
  /** Checks a site: inside map, flat enough, no overlap, not water. Returns {ok, y, reason}. */
  checkSite(typeId, x0, z0, rot = 0, opts = {}) {
    const def = BUILDING_TYPES[typeId];
    const L = def.layout(rot);
    const w = this.game.world;
    const m = 3;
    if (x0 < m || z0 < m || x0 + L.w > w.size - m || z0 + L.d > w.size - m) return { ok: false, y: this.groundY(Math.max(0, Math.min(w.size - 1, x0)), Math.max(0, Math.min(w.size - 1, z0))), reason: 'Слишком близко к краю мира' };
    const hs = [];
    let water = false;
    for (let z = z0; z < z0 + L.d; z++) for (let x = x0; x < x0 + L.w; x++) {
      const gy = this.groundY(x, z);
      hs.push(gy);
      if (w.getBlock(x, gy + 1, z) === B.WATER || gy < SEA_LEVEL - 1) water = true;
    }
    hs.sort((a, b) => a - b);
    const y = hs[Math.floor(hs.length / 2)];
    const spread = Math.max(y - hs[0], hs[hs.length - 1] - y);
    if (water) return { ok: false, y, reason: 'Нельзя строить на воде' };
    if (spread > (def.line ? 4 : 3)) return { ok: false, y, reason: 'Слишком неровная местность' };
    // overlap with other buildings (1-block gap between regular buildings, walls may touch)
    const gap = def.line ? 0 : 1;
    for (let z = z0 - gap; z < z0 + L.d + gap; z++) for (let x = x0 - gap; x < x0 + L.w + gap; x++) {
      if (x < 0 || z < 0 || x >= w.size || z >= w.size) continue;
      const id = this.foot[z * w.size + x];
      if (!id) continue;
      const inside = x >= x0 && z >= z0 && x < x0 + L.w && z < z0 + L.d;
      const other = this.byId.get(id);
      if (inside || (other && !other.def.line)) return { ok: false, y, reason: 'Место занято другой постройкой' };
    }
    if (opts.claimed && opts.claimed.has(x0 + ',' + z0)) return { ok: false, y, reason: 'Место занято' };
    return { ok: true, y, reason: '' };
  }

  /**
   * Places a building (spends cost unless opts.free). opts.instant stamps it fully built.
   * Returns the Building or null.
   */
  placeBuilding(typeId, x, z, rot = 0, opts = {}) {
    const def = BUILDING_TYPES[typeId];
    if (!def) return null;
    x = Math.round(x); z = Math.round(z);
    const site = this.checkSite(typeId, x, z, rot);
    if (!site.ok && !opts.force) { if (!opts.silent && !opts.free) this.toast(site.reason, 'bad'); return null; }
    if (!opts.free) {
      const chk = this.canPlace(typeId);
      if (!chk.ok) { this.toast(chk.reason, 'bad'); return null; }
      if (!this.game.state.spend(def.cost)) { this.toast('Не хватает ресурсов', 'bad'); return null; }
    }
    const variant = opts.variant ?? this.variantFor(typeId, x, z);
    const b = new Building(this, typeId, x, opts.y ?? site.y, z, rot, variant, opts.id);
    this.addBuilding(b);
    b.computeOps();
    if (opts.instant) this.stamp(b);
    else {
      b.hp = Math.round(b.maxHp * 0.1);
      this.scaffolds.set(b.id, new Scaffold(this.game, b));
      if (!def.line) this.toast(`Заложено: ${def.name}. Строители уже идут!`, 'info');
    }
    this.bus.emit('building:placed', { building: b });
    this.ghostsDirty = true;
    return b;
  }
  addBuilding(b) {
    this.buildings.push(b);
    this.byId.set(b.id, b);
    this.nextBuildingId = Math.max(this.nextBuildingId, b.id + 1);
    const w = this.game.world;
    for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) if (x >= 0 && z >= 0 && x < w.size && z < w.size) this.foot[z * w.size + x] = b.id;
    b.blocks.forEach((bl, i) => this.cellIndex.set(w.index(bl.x, bl.y, bl.z), { b, i }));
    if (b.type === 'town_hall') this.townHall = b;
    this.recalcRadius();
  }
  removeBuilding(b) {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.byId.delete(b.id);
    const w = this.game.world;
    for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) if (this.foot[z * w.size + x] === b.id) this.foot[z * w.size + x] = 0;
    for (const bl of b.blocks) { const k = w.index(bl.x, bl.y, bl.z); if (this.cellIndex.get(k)?.b === b) this.cellIndex.delete(k); }
    for (const v of [...b.workers]) this.assign(v, null);
    for (const v of this.villagers) { if (v.home === b) v.home = null; if (v.buildTarget === b) v.buildTarget = null; }
    this.scaffolds.get(b.id)?.dispose(); this.scaffolds.delete(b.id);
    if (this.selected === b) this.setSelection(null);
    if (b === this.townHall) this.townHall = null;
    this.recalcPop(); this.recalcRadius();
    this.ghostsDirty = true;
  }
  /** Instantly builds all ops of a building (start-of-game / debug). */
  stamp(b) {
    const edits = b.ops.map(op => [op.x, op.y, op.z, op.id]);
    this.bulkEdit(edits);
    b.refreshBuilt();
    b.state = 'complete';
    b.hp = b.maxHp;
    b.progress = 1;
    b.opCursor = b.ops.length;
    this.recalcPop();
  }
  /** Demolish (player action): removes the building record and its blocks, refunds half the cost. */
  demolish(b) {
    if (!b || b === this.townHall) return false;
    const edits = [];
    for (let i = 0; i < b.blocks.length; i++) { const bl = b.blocks[i]; if (bl.dy >= 1 && this.game.world.getBlock(bl.x, bl.y, bl.z) === bl.id) edits.push([bl.x, bl.y, bl.z, B.AIR]); }
    this.removeBuilding(b);
    this.bulkEdit(edits);
    for (const [x, y, z] of edits.slice(0, 30)) this.game.particles?.emit({ pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, count: 3, colors: [0xbbaa88, 0x887766], speed: 1, life: 0.8, size: 0.25, alpha: 0.6, gravity: 1 });
    if (b.state !== 'destroyed') { const refund = {}; for (const k in b.def.cost) refund[k] = Math.floor(b.def.cost[k] * (b.state === 'complete' ? 0.5 : 1)); this.game.state.refund(refund); }
    this.game.audio?.play('break_block', { pos: b.center, volume: 0.8 });
    this.bus.emit('building:removed', { building: b });
    return true;
  }
  // ================================================================ building upgrades
  /** Cost of taking building b from its current level to the next one. */
  upgradeCost(b = this.townHall) {
    if (!b) return null;
    const L = b.level || 1;
    if (b.type === 'town_hall') {
      const c = { wood: 80 * L, stone: 80 * L, gold: 10 * L };
      if (L >= 4) c.iron = 20 * (L - 3);
      if (L >= 6) { c.crystal = 10 * (L - 5); c.steel = 25 * (L - 5); }
      if (L >= 8) c.uranium = 10 * (L - 7);
      return c;
    }
    const c = {};
    for (const k in b.def.cost) c[k] = Math.ceil(b.def.cost[k] * 1.5 * L);
    if (L >= 2) c.iron = (c.iron || 0) + 3 * (L - 1);
    if (L >= 3) c.gold = (c.gold || 0) + 2 * (L - 2);
    if (L >= 5) c.crystal = (c.crystal || 0) + 3 * (L - 4);
    if (L >= 6) c.steel = (c.steel || 0) + 5 * (L - 5);
    return c;
  }
  upgradeTime(b) { return (b.type === 'town_hall' ? 40 : 20) + 20 * (b.level || 1); }
  /** How many upgrades may run at once: one per two builders (at least one). */
  get upgradeSlots() { return Math.max(1, Math.ceil(this.villagersByJob('builder').length / 2)); }
  get activeUpgrades() { return this.buildings.filter(b => b.upgrade).length; }
  /** null if building b can be upgraded now, otherwise the reason. */
  upgradeBlocker(b) {
    if (!b || b.state !== 'complete') return 'Здание не достроено';
    if (b.upgrade) return 'Уже улучшается';
    if (b.def.line) return 'Стены не улучшаются';
    if (b.def.wonder) return 'Чудо света уже совершенно';
    if ((b.level || 1) >= b.maxLevel) return (b.level || 1) >= 10 ? 'Высший уровень' : `Уровень ${b.level} — максимум этой эпохи. Перейдите в следующую эпоху, чтобы улучшать дальше`;
    if (b.type !== 'town_hall' && this.townHall && (b.level || 1) >= this.townHall.level + 1) return 'Сначала улучшите ратушу';
    if (this.activeUpgrades >= this.upgradeSlots) return 'Все строители заняты улучшениями — наймите ещё';
    return null;
  }
  startUpgrade(b) {
    const why = this.upgradeBlocker(b);
    if (why) { this.toast(why, 'bad'); return false; }
    if (!this.game.state.spend(this.upgradeCost(b))) { this.toast('Не хватает ресурсов для улучшения', 'bad'); return false; }
    const t = this.upgradeTime(b);
    b.upgrade = { left: t, total: t };
    this.toast(`«${b.def.name}»: улучшение до ${b.level + 1} уровня началось`, 'info');
    this.game.audio?.play('place_block', { pos: b.center });
    this.bus.emit('building:upgrading', { building: b });
    return true;
  }
  /** A new age: the whole town is rebuilt in the materials of its time. */
  restyleAll() {
    setEraTier((this.game.state.age | 0) + 1);
    const edits = [];
    let n = 0;
    for (const b of this.buildings) {
      if (b.state === 'destroyed') continue;
      if (b.def.tiered) { if (this.retier(b)) n++; continue; }
      for (const e of b.applyLevelMaterials('collect')) edits.push(e);
      b.computeOps();
    }
    if (edits.length) this.bulkEdit(edits);
    for (const b of this.buildings) if (!b.def.tiered) b.refreshBuilt?.();
    return edits.length + n;
  }

  // ================================================================ era rebuilds
  /**
   * An era building grows into the design of its style (age / level): swap its blueprint and let the town
   * rebuild it block by block over a few seconds (old parts come down from the top, new ones rise from the ground).
   */
  retier(b, force = false) {
    if (!b.def.tiered || b.state === 'destroyed') return false;
    const t = b.style;
    if (t === b.tier && !force) return false;
    const w = this.game.world;
    for (const bl of b.blocks) { const k = w.index(bl.x, bl.y, bl.z); if (this.cellIndex.get(k)?.b === b) this.cellIndex.delete(k); }
    const oldH = b.relayout(t);
    b.blocks.forEach((bl, i) => this.cellIndex.set(w.index(bl.x, bl.y, bl.z), { b, i }));
    b.computeOps(oldH);
    b.refreshMaxHp();
    if (b.state === 'complete' || b.state === 'constructing') this.startMorph(b);
    if (b === this.townHall) this._thFor = null;
    this.ghostsDirty = true;
    return true;
  }
  /** Queue the building's outstanding construction ops to be carried out automatically. */
  startMorph(b) {
    if (b.state !== 'complete') return;
    this.morphs = this.morphs.filter(m => m.b !== b);
    this.morphs.push({ b, i: 0, acc: 0, fx: 0 });
  }
  updateMorphs(dt) {
    if (!this.morphs?.length) return;
    const w = this.game.world, P = this.game.particles;
    let budget = this.game.quality === 'low' ? 24 : 40;       // world edits per frame over all buildings
    const per = Math.max(2, Math.ceil(budget / this.morphs.length));
    for (let m = this.morphs.length - 1; m >= 0; m--) {
      const mo = this.morphs[m], b = mo.b;
      if (!this.byId.has(b.id) || b.state === 'destroyed') { this.morphs.splice(m, 1); continue; }
      mo.acc += dt * 70;                    // ~70 blocks per second per building
      let n = Math.min(per, Math.floor(mo.acc));
      mo.acc -= n;
      while (n > 0 && mo.i < b.ops.length) {
        const op = b.ops[mo.i++];
        if (w.getBlock(op.x, op.y, op.z) === op.id) continue;
        this.editBlock(op.x, op.y, op.z, op.id);
        n--; budget--;
        if (++mo.fx % 6 === 0) P?.emit({ pos: { x: op.x + 0.5, y: op.y + 0.5, z: op.z + 0.5 }, count: 3, colors: [0xd8cfc0, 0xa89c88, 0xfff2c0], speed: 1.2, life: 0.7, size: 0.22, alpha: 0.6, gravity: 1 });
        if (mo.fx % 24 === 0) this.game.audio?.play('hammer', { pos: { x: op.x, y: op.y, z: op.z }, volume: 0.35 });
      }
      if (mo.i >= b.ops.length) {
        this.morphs.splice(m, 1);
        b.refreshBuilt();
        b.opCursor = 0;
        b.needsRepair = b.builtCount < b.blocks.length;
        this.unstickAround(b);
        this.game.audio?.play('build_complete', { pos: b.center, volume: 0.6 });
        this.bus.emit('building:restyled', { building: b });
      }
      if (budget <= 0) break;
    }
  }
  /** After a rebuild: nobody may end up inside the new walls. */
  unstickAround(b) {
    const w = this.game.world;
    const inside = (e) => w.isSolid(e.position.x, e.position.y + 0.1, e.position.z) || w.isSolid(e.position.x, e.position.y + 1.1, e.position.z);
    // anyone at all (villagers wander in and out while the town rebuilds)
    for (const v of this.villagers) if (!v.dead && inside(v)) v.teleportNear?.(b.contains(v.position.x, v.position.z, 1) ? b.door : v.position);
    const p = this.game.player;
    if (p && b.contains(p.position.x, p.position.z, 1) && inside(p)) { let y = Math.floor(p.position.y); while (y < w.height - 2 && (w.isSolid(p.position.x, y, p.position.z) || w.isSolid(p.position.x, y + 1, p.position.z))) y++; p.position.y = y; }
  }
  /**
   * A new age brings every building up to the age's base level (age + 1) for free, so the level in the panel
   * matches what the building looks like; a running upgrade that is now pointless is refunded.
   */
  raiseLevelsForAge(age, silent = false) {
    const target = Math.max(1, Math.min(10, (age | 0) + 1));
    let n = 0;
    for (const b of this.buildings) {
      if (b.state === 'destroyed' || b.def.line || b.def.wonder) continue;
      const lv = b.level || 1;
      if (lv >= target) continue;
      if (b.upgrade) { this.game.state.refund(this.upgradeCost(b)); b.upgrade = null; }
      b.level = target;
      n++;
      if (b.jobSlots) this.autoAssign?.(b);
    }
    if (n && !silent) {
      this.recalcPop();
      this.toast(`Новая эпоха: ${n} зданий поднялись до ${target} уровня`, 'good');
      this.bus.emit('buildings:aged', { level: target });
    }
    return n;
  }
  /** Kept for the town hall button. */
  upgradeTownHall() { return this.startUpgrade(this.townHall); }
  finishUpgrade(b) {
    b.upgrade = null;
    b.level = (b.level || 1) + 1;
    if (b.def.tiered) this.retier(b);
    else { b.applyLevelMaterials(true); b.computeOps(); }
    b.refreshMaxHp(); b.hp = b.maxHp;
    this.recalcPop();
    this.toast(`«${b.def.name}» улучшено до ${b.level} уровня!`, 'good');
    this.game.audio?.play('level_up', { pos: b.center });
    this.celebrate(b);
    if (b.jobSlots) this.autoAssign(b);
    this.bus.emit('building:upgraded', { building: b });
  }
  tickUpgrades(dt) {
    for (const b of this.buildings) {
      if (!b.upgrade) continue;
      if (b.state !== 'complete') continue;          // paused while damaged down / rebuilding
      b.upgrade.left -= dt * this.builderSpeedBonus;
      if (b.upgrade.left <= 0) this.finishUpgrade(b);
    }
  }

  buildingAt(x, y, z) {
    const w = this.game.world;
    x = Math.floor(x); z = Math.floor(z);
    if (!this.foot || x < 0 || z < 0 || x >= w.size || z >= w.size) return null;
    const id = this.foot[z * w.size + x];
    if (!id) return null;
    const b = this.byId.get(id);
    if (!b) return null;
    const lo = b.quarry ? b.y - b.quarry.depth - 2 : b.y - 1;
    if (y < lo || y > b.y + b.height + 1) return null;
    return b;
  }
  nearestBuilding(pos, filter, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const b of this.buildings) {
      if (filter && !filter(b)) continue;
      const d = b.distanceTo(pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ================================================================ building lifecycle
  completeBuilding(b) {
    if (b.state === 'complete') return;
    const rebuilt = !!b._rebuilding;
    b._rebuilding = false;
    b.state = 'complete';
    b.progress = 1;
    b.refreshMaxHp();
    b.hp = b.maxHp;
    b.needsRepair = false;
    this.scaffolds.get(b.id)?.dispose(); this.scaffolds.delete(b.id);
    if (!b.def.line) {
      this.game.audio?.play('build_complete', { pos: b.center, volume: 0.9 });
      this.celebrate(b);
    }
    this.recalcPop();
    if (b.def.wonder && !rebuilt) {
      this.toast(`Чудо света «${b.def.name}» построено!`, 'good');
      this.toast(b.def.desc.replace(/^Чудо [^.]*\. /, ''), 'info');
      for (let i = 0; i < 3; i++) this.celebrate(b);
      this.townHall?.refreshMaxHp();
      if (b.type === 'singularity' && !(this.game.state.finale > 0)) {
        this.game.state.finale = 1;
        this.toast('Проект «Сингулярность» завершён! Нежить в ярости: следующей ночью придёт Нано-чума', 'bad');
      }
    }
    this.bus.emit('building:completed', { building: b, rebuilt });
    // fill job slots: villagers who already have this job but no workplace, then idle villagers
    if (b.jobSlots) {
      const job = b.job;
      for (const v of this.villagers) if (b.freeSlots && !v.dead && v.job === job && !v.workplace) this.assign(v, b);
      this.autoAssign(b);
    }
    this.ghostsDirty = true;
  }
  celebrate(b) {
    const p = this.game.particles;
    if (!p) return;
    for (let i = 0; i < 6; i++) p.emit({ pos: { x: b.x + Math.random() * b.w, y: b.y + 2 + Math.random() * b.height, z: b.z + Math.random() * b.d }, count: 12, colors: [0xffe070, 0xfff0b0, 0x9fffd0], additive: true, speed: 3, gravity: 3, life: 1.2, size: 0.18 });
  }
  onRebuildStarted(b) {
    b._rebuilding = true;
    b.hp = Math.max(b.hp, Math.round(b.maxHp * 0.1));
    if (!this.scaffolds.has(b.id)) this.scaffolds.set(b.id, new Scaffold(this.game, b));
  }
  onBuildingDestroyed(b, source) {
    if (b.state === 'destroyed') return;
    b.state = 'destroyed';
    b.hp = 0;
    // collapse: knock out a good part of the structure
    const n = Math.floor(b.builtCount * 0.35);
    for (let i = 0; i < n; i++) b.knockOutBlock(i % 5 !== 0);
    const p = this.game.particles;
    for (let i = 0; i < 8; i++) p?.emit({ pos: { x: b.x + Math.random() * b.w, y: b.y + 1 + Math.random() * b.height * 0.6, z: b.z + Math.random() * b.d }, count: 8, colors: [0x6a6258, 0x8a8070, 0x4a443c], speed: 1.5, gravity: -0.5, life: 2, size: 0.6, alpha: 0.5, drag: 0.5 });
    this.game.audio?.play('explosion', { pos: b.center, volume: 0.6, pitch: 0.6 });
    this.scaffolds.get(b.id)?.dispose(); this.scaffolds.delete(b.id);
    this.recalcPop();
    this.bus.emit('building:destroyed', { building: b, source });
    if (b === this.townHall) this.bus.emit('game:over', { reason: 'Ратуша разрушена' });
    this.ghostsDirty = true;
  }

  recalcPop() {
    let p = 0;
    for (const b of this.buildings) p += b.popBonus;
    this.popCap = p;
  }
  recalcRadius() {
    const th = this.townHall;
    if (!th) { this.radius = 20; return; }
    let r = 14;
    for (const b of this.buildings) {
      const dx = Math.max(Math.abs(b.x - th.center.x), Math.abs(b.x + b.w - th.center.x));
      const dz = Math.max(Math.abs(b.z - th.center.z), Math.abs(b.z + b.d - th.center.z));
      r = Math.max(r, Math.hypot(dx, dz));
    }
    this.radius = r + 4;
  }
  get builderCap() {
    let huts = 0;
    for (const b of this.buildings) if (b.state === 'complete' && b.def.builderSlots) huts += b.builderSlots;
    return 2 + (this.townHall ? this.townHall.level : 0) + huts;
  }
  /** Hiring cost of the n-th builder (1-based). The first two are free, then it grows as a power law (~k^1.5). */
  builderHireCost(n = this.villagersByJob('builder').length + 1) {
    const k = n - 2;
    if (k <= 0) return {};
    const f = Math.pow(k, 1.5);
    return { food: Math.round(6 * f), wood: Math.round(5 * f), ...(k >= 3 ? { gold: Math.round(1.5 * Math.pow(k - 2, 1.5)) } : {}) };
  }
  get builderSpeedBonus() { return this.buildings.some(b => b.state === 'complete' && b.def.builderSlots) ? 1.15 : 1; }
  get population() { return this.villagers.length; }

  onResearch(id) {
    if (id === 'masonry') { for (const b of this.buildings) b.refreshMaxHp(); this.recalcPop(); }
    if (id === 'smithing' || id === 'gunpowder' || id === 'frost_magic') for (const v of this.villagers) v.updateTool();
  }

  // ================================================================ villagers & jobs
  spawnVillager(o = {}) {
    if (this.villagers.length >= MAX_VILLAGERS) return null;
    const taken = new Set(this.villagers.map(v => v.name));
    const female = o.female ?? (this.rng() < 0.5);
    const name = o.name || pickName(this.rng, taken, female);
    const v = new Villager(this.game, this, { ...o, name, female, job: o.job || 'idle' });
    const sp = o.pos || this.spawnPoint;
    v.position.set(sp.x + (this.rng() - 0.5), sp.y, sp.z + (this.rng() - 0.5));
    if (o.hp) v.hp = Math.min(v.maxHp, o.hp);
    this.villagers.push(v);
    this.game.entities.add(v);
    if (!o.silent) {
      this.game.audio?.play('villager_hmm', { pos: v.position, pitch: female ? 1.3 : 1 });
    }
    this.bus.emit('villager:spawned', { villager: v });
    return v;
  }
  onVillagerDied(v, source) {
    const i = this.villagers.indexOf(v);
    if (i >= 0) this.villagers.splice(i, 1);
    if (v.workplace) { const w = v.workplace.workers; const k = w.indexOf(v); if (k >= 0) w.splice(k, 1); }
    v.workplace = null;
    this.game.state.stats.villagersLost = (this.game.state.stats.villagersLost || 0) + 1;
    this.game.audio?.play('death', { pos: v.position, volume: 0.7 });
    if (this.selected === v) this.setSelection(null);
    if (v._label) { v._label.parent?.remove(v._label); v._label.material.dispose(); v._label = null; }
    this.bus.emit('villager:died', { villager: v, source });
  }

  /** Assign a villager to a building's job (null → idle, or keeps 'builder' only via setJob). */
  assign(v, building, job = null) {
    if (!v || v.dead) return false;
    if (building) {
      if (!building.jobSlots) return false;
      if (building.workers.includes(v)) return true;
      if (building.freeSlots <= 0) return false;
    }
    if (v.workplace) { const w = v.workplace.workers; const k = w.indexOf(v); if (k >= 0) w.splice(k, 1); }
    v.workplace = building || null;
    if (building) building.workers.push(v);
    const newJob = building ? (job || building.job) : (job || 'idle');
    if (v.job !== newJob) v.setJob(newJob); else { v.interrupt(); v.updateTool(); }
    this.bus.emit('villager:job', { villager: v });
    return true;
  }
  /** Job without a building (builder / idle). */
  setJob(v, job) {
    if (job === 'builder' || job === 'idle') return this.assign(v, null, job);
    const b = this.buildings.find(b => b.def.jobs[job] && b.freeSlots > 0 && b.state !== 'destroyed');
    return b ? this.assign(v, b, job) : false;
  }
  setBuilderCount(n, { free = false } = {}) {
    n = Math.max(0, Math.min(this.builderCap, n | 0));
    let builders = this.villagersByJob('builder');
    while (builders.length > n) { this.assign(builders.pop(), null, 'idle'); }
    if (builders.length < n) {
      const idle = this.villagersByJob('idle');
      while (builders.length < n && idle.length) {
        if (!free) {
          const cost = this.builderHireCost(builders.length + 1);
          if (!this.game.state.spend(cost)) { this.toast('Не хватает ресурсов, чтобы нанять строителя', 'bad'); break; }
        }
        const v = idle.shift(); this.assign(v, null, 'builder'); builders.push(v);
      }
    }
    return builders.length;
  }
  villagersByJob(job) { return this.villagers.filter(v => !v.dead && v.job === job); }
  jobCounts() {
    const c = {};
    for (const j of JOB_ORDER) c[j] = 0;
    for (const v of this.villagers) if (!v.dead) c[v.job] = (c[v.job] || 0) + 1;
    return c;
  }
  /** Fill free job slots with idle villagers (optionally only for one building). Keeps ≥2 builders. */
  autoAssign(only = null) {
    let changed = 0;
    const idle = () => this.villagers.filter(v => !v.dead && v.job === 'idle');
    if (!only) {
      const need = Math.min(2, this.builderCap) - this.villagersByJob('builder').length;
      for (let i = 0; i < need; i++) { const v = idle()[0]; if (!v) break; this.assign(v, null, 'builder'); changed++; }
    }
    const blds = only ? [only] : this.buildings.filter(b => b.jobSlots && b.state === 'complete').sort((a, b) => a.createdAt - b.createdAt);
    for (const b of blds) {
      while (b.freeSlots > 0) {
        const v = this.villagers.find(v => !v.dead && v.job === b.job && !v.workplace) || idle()[0];
        if (!v) return changed;
        this.assign(v, b); changed++;
      }
    }
    return changed;
  }
  homeFor(v) {
    const ok = (b) => b && b.state === 'complete' && (b.points.inside || b.points.door);
    if (ok(v.home)) return v.home;
    v.home = null;
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!ok(b) || !b.popBonus) continue;
      const occ = this.villagers.reduce((n, o) => n + (o.home === b ? 1 : 0), 0);
      if (occ >= b.popBonus) continue;
      const d = b.distanceTo(v.position) + (b.type === 'town_hall' ? 6 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) best = this.nearestBuilding(v.position, (b) => ok(b) && !!b.points.inside);
    v.home = best;
    return best;
  }
  storageFor(pos, resKeys, workplace) {
    const main = resKeys[0];
    const stores = (b) => b.state === 'complete' && b.def.storage && resKeys.some(r => b.def.storage.includes(r));
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!stores(b)) continue;
      let d = b.distanceTo(pos);
      if (b === workplace) d -= 6;
      if (b.def.storage.length > 3 && !b.def.storage.includes(main)) d += 100;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ================================================================ construction management
  /**
   * Spread builders over all open work (new construction, rebuilding raided buildings, repairs).
   * Each project accepts builders in proportion to the work left; a builder takes the closest project with room
   * (new construction first), sticks with it until it's done, and extra builders are shared out evenly.
   */
  pickBuildTarget(v) {
    const now = this.game.time, night = this.game.state.isNight;
    const active = (b) => b.state === 'planned' || b.state === 'constructing';
    const destroyedReady = (b) => b.state === 'destroyed' && now - b.lastDamagedAt > 8;
    const damaged = (b) => b.state === 'complete' && (b.needsRepair || b.hp < b.maxHp) && now - b.lastDamagedAt >= 5;
    const hasWork = (b) => b && this.byId.has(b.id) && (active(b) || (!night && (destroyedReady(b) || damaged(b))));
    const work = (b) => active(b) || b.state === 'destroyed' ? Math.max(1, b.remainingOps ?? b.blocks.length) : (b.needsRepair ? 12 : 4);
    const cap = (b) => b.def.line ? 1 : Math.max(1, Math.min(b.state === 'complete' && !b.needsRepair ? 2 : 6, Math.ceil(work(b) / 14)));
    const counts = new Map();
    for (const o of this.villagers) if (o !== v && !o.dead && o.job === 'builder' && o.buildTarget) counts.set(o.buildTarget, (counts.get(o.buildTarget) || 0) + 1);
    const count = (b) => counts.get(b) || 0;
    // stay on the current project while it still needs work and isn't overcrowded
    const cur = v.buildTarget;
    if (hasWork(cur) && count(cur) < cap(cur) + 1) return cur;
    const cand = this.buildings.filter(hasWork);
    if (!cand.length) return null;
    const prio = (b) => active(b) ? 0 : b.state === 'destroyed' ? 25 : 45;
    const score = (b) => b.distanceTo(v.position) + prio(b) + count(b) * 6 + (active(b) ? (now - b.createdAt) * -0.02 : 0);
    let best = null, bs = Infinity;
    for (const b of cand) { if (count(b) >= cap(b)) continue; const sc = score(b); if (sc < bs) { bs = sc; best = b; } }
    if (best) return best;
    // every project is at capacity: join the least crowded one (relative to its size), nearest first
    for (const b of cand) { const sc = (count(b) + 1) / cap(b) * 100 + b.distanceTo(v.position); if (sc < bs) { bs = sc; best = b; } }
    return best;
  }
  /** Is a (solid) block placement at this cell blocked by an entity standing there? */
  cellOccupied(x, y, z, id) {
    if (id === B.AIR || (BLOCKS[id] && !BLOCKS[id].solid)) return false;
    for (const e of this.game.entities.list) {
      if (e.dead || e.kind === 'projectile' || e.hidden) continue;
      const p = e.position, r = e.radius || 0.3;
      if (p.x + r > x && p.x - r < x + 1 && p.z + r > z && p.z - r < z + 1 && p.y < y + 1 && p.y + (e.height || 1.8) > y) return true;
    }
    return false;
  }

  // ================================================================ path requests (staggered A*)
  requestPath(v, to, range = 1) {
    for (const r of this.pathQueue) if (r.v === v) r.cancelled = true;
    const req = {
      v, done: false, path: null, cancelled: false, range,
      from: { x: Math.floor(v.position.x), y: Math.floor(v.position.y + 0.05), z: Math.floor(v.position.z) },
      to: { x: Math.floor(to.x), y: Math.floor(to.y), z: Math.floor(to.z) },
    };
    this.pathQueue.push(req);
    return req;
  }
  processPaths() {
    const w = this.game.world;
    let n = 0;
    while (n < 2 && this.pathQueue.length) {
      const r = this.pathQueue.shift();
      if (r.cancelled) { r.done = true; continue; }
      try { r.path = w.findPath(r.from, r.to, { maxNodes: 2500, range: r.range, partial: true }); } catch (e) { r.path = null; }
      r.done = true;
      n++;
    }
  }

  // ================================================================ environment helpers used by jobs
  refreshZombies() {
    const out = this.zombies; out.length = 0;
    for (const e of this.game.entities.list) if (!e.dead && e.faction === 'undead' && e.kind !== 'projectile') out.push(e);
  }
  nearestZombie(pos, maxDist, los = false) {
    let best = null, bd = maxDist * maxDist;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = z.position.x - pos.x, dy = z.position.y - pos.y, dz = z.position.z - pos.z;
      const d = dx * dx + dy * dy * 0.25 + dz * dz;
      if (d < bd) {
        if (los && !this.game.world.lineOfSight(pos, z.center)) continue;
        bd = d; best = z;
      }
    }
    return best;
  }
  /**
   * Pick the most urgent zombie for a guard: protect villagers under attack, take out spitters and
   * necromancers, finish wounded ones, avoid exploders, and spread guards over different targets.
   */
  /** How far guards see: they keep watch over the whole village and further with archery / watchtowers. */
  get guardVision() {
    const st = this.game.state;
    return 42 + (st.researchDone.has('archery') ? 8 : 0) + Math.min(12, this.villagersByJob('guard').length) + (this.industry?.radarOn ? 10 : 0);
  }
  guardTarget(v, current = null) {
    const th = this.townHall;
    const claims = new Map();
    for (const o of this.villagers) if (o !== v && o.fightTarget && !o.dead) claims.set(o.fightTarget, (claims.get(o.fightTarget) || 0) + 1);
    const vision = this.guardVision;
    let best = null, bs = Infinity;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = v.position.distanceTo(z.position);
      const thd = th ? th.center.distanceTo(z.position) : 0;
      const nearVillage = th ? thd < this.radius + 18 : true;
      // the alarm: anything attacking the village is known to every guard, the rest only within sight
      const attacking = nearVillage && (z.bTarget || (z.target && z.target.faction === 'village'));
      if (d > (attacking ? vision + 25 : vision)) continue;
      if (d > vision * 0.6 && !nearVillage) continue;       // don't wander off after stragglers in the woods
      let s = d * 0.8 + thd * 0.25;                          // the closer to the town hall, the more urgent
      if (attacking) s -= 6;
      if (z.bTarget === th) s -= 6;
      const t = z.target;
      if (t && t !== v && t.faction === 'village') s -= t.kind === 'player' ? 3 : 8;   // someone needs help
      if (z.breakCell) s -= 4;                                                          // breaking our walls
      if (z.type === 'spitter') s -= 5;
      if (z.type === 'necromancer') s -= 7;
      if (z.type === 'exploder') s += 9;                                               // let archers handle those
      if (z.type === 'brute') s += 2;
      s -= (1 - z.hp / z.maxHp) * 5;                                                   // finish the wounded
      const big = z.boss || z.type === 'giant' || z.type === 'brute' || z.type === 'necromancer' || z.type === 'nano_titan';
      s += (claims.get(z) || 0) * (big ? 2 : 7);                                       // spread out, but gang up on the big ones
      if (z === current) s -= 3;                                                       // don't flip-flop
      if (s < bs) { bs = s; best = z; }
    }
    return best;
  }
  guardPost(v) {
    const th = this.townHall;
    if (!th) return null;
    const guards = this.villagersByJob('guard').filter(g => g.workplace?.type !== 'watchtower');
    const i = Math.max(0, guards.indexOf(v));
    // during a wave: split the guards between the directions the dead come from (one stays at the town hall)
    const dirs = this.game.waves?.spawnDirections || [];
    if (dirs.length && guards.length) {
      if (guards.length >= 3 && i === guards.length - 1) return this.randomWalkable(th.door, 2) || th.door;
      const d = dirs[i % dirs.length];
      const ang = Math.atan2(d.z - th.center.z, d.x - th.center.x) + ((Math.floor(i / dirs.length) % 3) - 1) * 0.35;
      const r = Math.max(10, Math.min(this.radius * 0.8, 30));
      return this.randomWalkable({ x: th.center.x + Math.cos(ang) * r, y: th.y + 1, z: th.center.z + Math.sin(ang) * r }, 3) || th.door;
    }
    const a = (i / Math.max(1, guards.length)) * Math.PI * 2 + 0.6;
    const r = Math.min(this.radius - 2, 12);
    return this.randomWalkable({ x: th.center.x + Math.cos(a) * r, y: th.y + 1, z: th.center.z + Math.sin(a) * r }, 2) || th.door;
  }
  patrolPoint() {
    const th = this.townHall;
    if (!th) return null;
    if (this.rng() < 0.5 && this.buildings.length > 1) {
      const b = this.buildings[Math.floor(this.rng() * this.buildings.length)];
      if (b.state === 'complete') return this.randomWalkable(b.door, 2) || b.door;
    }
    const a = this.rng() * Math.PI * 2, r = this.radius * (0.7 + this.rng() * 0.3);
    return this.randomWalkable({ x: th.center.x + Math.cos(a) * r, y: th.y + 1, z: th.center.z + Math.sin(a) * r }, 3);
  }
  plazaPoint() {
    const th = this.townHall;
    if (!th) { const c = this.game.world.size / 2; return { x: c, y: this.groundY(c, c) + 1, z: c }; }
    const d = th.door;
    return { x: d.x, y: d.y, z: d.z + 5 };
  }
  randomWalkable(c, r) {
    const w = this.game.world;
    for (let i = 0; i < 14; i++) {
      const a = this.rng() * Math.PI * 2, rr = Math.sqrt(this.rng()) * r;
      const x = Math.floor(c.x + Math.cos(a) * rr), z = Math.floor(c.z + Math.sin(a) * rr);
      if (x < 2 || z < 2 || x >= w.size - 2 || z >= w.size - 2) continue;
      const fid = this.foot[z * w.size + x];
      if (fid) { const b = this.byId.get(fid); if (b && b.state === 'complete' && !b.def.line) continue; }
      const gy = this.groundY(x, z);
      if (w.isWalkable(x, gy + 1, z)) return { x: x + 0.5, y: gy + 1, z: z + 0.5 };
    }
    return null;
  }
  findBlockNear(p, id, r) {
    const w = this.game.world;
    const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
    let best = null, bd = Infinity;
    for (let y = fy - 1; y <= fy + 1; y++) for (let z = fz - r; z <= fz + r; z++) for (let x = fx - r; x <= fx + r; x++) {
      if (w.getBlock(x, y, z) !== id) continue;
      const d = Math.abs(x - fx) + Math.abs(z - fz) + Math.abs(y - fy);
      if (d < bd) { bd = d; best = { x, y, z }; }
    }
    return best;
  }

  // ---- trees
  scanTrees(cx, cz, R) {
    const w = this.game.world;
    const out = [];
    const x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(w.size - 2, Math.floor(cx + R));
    const z0 = Math.max(1, Math.floor(cz - R)), z1 = Math.min(w.size - 2, Math.floor(cz + R));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > R * R) continue;
      const top = w.surfaceY(x, z);
      if (!LEAF_BLOCKS.has(w.getBlock(x, top, z)) && !LOG_BLOCKS.has(w.getBlock(x, top, z))) continue;
      for (let y = top; y > SEA_LEVEL - 3; y--) {
        const id = w.getBlock(x, y, z);
        if (LOG_BLOCKS.has(id)) {
          const below = w.getBlock(x, y - 1, z);
          if (!LOG_BLOCKS.has(below) && BLOCKS[below].solid) { out.push({ x, y, z, id }); break; }
        } else if (BLOCKS[id].solid && !LEAF_BLOCKS.has(id)) break;
      }
    }
    return out;
  }
  findTree(center, R, v) {
    const key = Math.round(center.x / 4) + ',' + Math.round(center.z / 4);
    let c = this.treeCache.get(key);
    const now = this.game.time;
    if (!c || now - c.t > 25 || !c.list.length) { c = { t: now, list: this.scanTrees(center.x, center.z, R) }; this.treeCache.set(key, c); }
    const w = this.game.world;
    let best = null, bd = Infinity;
    for (const t of c.list) {
      if (t.bad || this.treeReserved.has(t.x + ',' + t.z)) continue;
      if (w.getBlock(t.x, t.y, t.z) !== t.id) { t.bad = true; continue; }
      if (this.buildingAt(t.x, t.y, t.z)) continue;
      const d = Math.hypot(t.x - center.x, t.z - center.z) + Math.hypot(t.x - v.position.x, t.z - v.position.z) * 0.5;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  /** logs (bottom→top) and matching leaves of a tree starting at its base log */
  collectTree(tree) {
    const w = this.game.world;
    const logs = [], seen = new Set(), q = [[tree.x, tree.y, tree.z]];
    const K = (x, y, z) => x + ',' + y + ',' + z;
    seen.add(K(tree.x, tree.y, tree.z));
    while (q.length && logs.length < 40) {
      const [x, y, z] = q.shift();
      const id = w.getBlock(x, y, z);
      if (!LOG_BLOCKS.has(id)) continue;
      logs.push({ x, y, z, id });
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (Math.abs(nx - tree.x) > 2 || Math.abs(nz - tree.z) > 2 || ny < tree.y) continue;
        const k = K(nx, ny, nz);
        if (seen.has(k)) continue;
        seen.add(k);
        if (LOG_BLOCKS.has(w.getBlock(nx, ny, nz))) q.push([nx, ny, nz]);
      }
    }
    logs.sort((a, b) => a.y - b.y);
    const logSet = new Set(logs.map(l => K(l.x, l.y, l.z)));
    const leafId = LEAF_OF[tree.id];
    const leaves = [];
    const topY = logs.length ? logs[logs.length - 1].y : tree.y;
    for (let y = tree.y + 1; y <= topY + 3; y++) for (let z = tree.z - 3; z <= tree.z + 3; z++) for (let x = tree.x - 3; x <= tree.x + 3; x++) {
      const id = w.getBlock(x, y, z);
      if (!LEAF_BLOCKS.has(id) || (leafId && id !== leafId)) continue;
      // skip leaves that belong to a neighbouring trunk
      let foreign = false;
      for (let yy = y - 2; yy <= y + 1 && !foreign; yy++) for (let zz = z - 2; zz <= z + 2 && !foreign; zz++) for (let xx = x - 2; xx <= x + 2; xx++) {
        if (LOG_BLOCKS.has(w.getBlock(xx, yy, zz)) && !logSet.has(K(xx, yy, zz))) { foreign = true; break; }
      }
      if (!foreign) leaves.push({ x, y, z, id });
    }
    leaves.sort((a, b) => b.y - a.y);
    return { logs, leaves };
  }
  onTreeFelled(tree, o = {}) {
    for (const c of this.treeCache.values()) c.list = c.list.filter(t => t !== tree);
    // every tree felled near the village gets replanted by the woodcutters
    const th = this.townHall;
    if (o.byPlayer && (!th || Math.hypot(tree.x - th.center.x, tree.z - th.center.z) > this.radius + 70)) return;
    if (!LOG_BLOCKS.has(tree.id)) tree = { ...tree, id: B.LOG };
    this.replantSpots.push({ x: tree.x, y: tree.y, z: tree.z, log: tree.id, taken: false, t: this.game.time });
  }
  /**
   * Forestry: when the woods around a lumber camp thin out, woodcutters plant new trees on free grass
   * 8–30 blocks away (never on paths, fields or building plots).
   */
  forestSpot(base) {
    if (this.saplings.length > 40) return null;
    const w = this.game.world;
    const near = this.findTreesCount?.(base.center, 30) ?? 99;
    if (near >= 14) return null;
    const pending = this.saplings.filter(s => Math.hypot(s.x - base.center.x, s.z - base.center.z) < 32).length;
    if (near + pending >= 14) return null;
    for (let i = 0; i < 20; i++) {
      const a = this.rng() * Math.PI * 2, r = 8 + this.rng() * 22;
      const x = Math.floor(base.center.x + Math.cos(a) * r), z = Math.floor(base.center.z + Math.sin(a) * r);
      const gy = w.surfaceY(x, z);
      if (w.getBlock(x, gy, z) !== B.GRASS || w.getBlock(x, gy + 1, z) !== B.AIR && BLOCKS[w.getBlock(x, gy + 1, z)].solid) continue;
      if (this.buildingAt(x, gy + 1, z) || this.foot?.[z * w.size + x]) continue;
      // keep room around the sapling and away from other trees
      let clear = true;
      for (let dz = -2; dz <= 2 && clear; dz++) for (let dx = -2; dx <= 2 && clear; dx++) {
        if (this.foot?.[(z + dz) * w.size + (x + dx)]) clear = false;
        for (let dy = 0; dy <= 3 && clear; dy++) if (LOG_BLOCKS.has(w.getBlock(x + dx, gy + dy, z + dz))) clear = false;
      }
      if (!clear) continue;
      const logs = [B.LOG, B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
      return { x, y: gy + 1, z, log: logs[(this.rng() * logs.length) | 0], taken: true, t: this.game.time, forest: true };
    }
    return null;
  }
  findTreesCount(c, r) {
    const w = this.game.world;
    let n = 0;
    const cx = Math.floor(c.x), cz = Math.floor(c.z);
    for (let z = cz - r; z <= cz + r; z += 1) for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > r * r) continue;
      const gy = w.surfaceY(x, z);
      // a trunk base: a log standing on the ground
      for (let y = gy; y > gy - 12 && y > 1; y--) { const id = w.getBlock(x, y, z); if (LOG_BLOCKS.has(id)) { const bl = w.getBlock(x, y - 1, z); if (bl === B.GRASS || bl === B.DIRT) { n++; break; } } else if (id !== B.AIR && !LEAF_BLOCKS.has(id)) break; }
    }
    return n;
  }
  takeReplantSpot(base, v) {
    const now = this.game.time;
    for (const s of this.replantSpots) {
      if (s.taken || now - s.t < 4) continue;
      if (Math.hypot(s.x - base.center.x, s.z - base.center.z) > 45) continue;
      s.taken = true;
      return s;
    }
    return null;
  }
  plantSapling(s) {
    const i = this.replantSpots.indexOf(s);
    if (i >= 0) this.replantSpots.splice(i, 1);
    const w = this.game.world;
    const below = w.getBlock(s.x, s.y - 1, s.z);
    if (below !== B.GRASS && below !== B.DIRT) return;
    const a = w.getBlock(s.x, s.y, s.z);
    if (a !== B.AIR && BLOCKS[a].solid) return;
    const leaf = LEAF_OF[s.log] || B.LEAVES;
    this.editBlock(s.x, s.y, s.z, leaf);      // a young bush that grows into a tree
    this.saplings.push({ x: s.x, y: s.y, z: s.z, log: s.log, leaf, growAt: this.game.time + 40 + this.rng() * 40 });
    this.game.particles?.emit({ pos: { x: s.x + 0.5, y: s.y + 0.6, z: s.z + 0.5 }, count: 8, colors: [0x6fd05a, 0x9fe070], speed: 1, gravity: 1, life: 0.8, size: 0.12 });
  }
  growSaplings() {
    const now = this.game.time;
    const w = this.game.world;
    for (let i = this.saplings.length - 1; i >= 0; i--) {
      const s = this.saplings[i];
      if (now < s.growAt) continue;
      this.saplings.splice(i, 1);
      if (w.getBlock(s.x, s.y, s.z) !== s.leaf || this.buildingAt(s.x, s.y, s.z)) continue;
      this.editBlock(s.x, s.y, s.z, B.AIR);
      this.growTree(s.x, s.y, s.z, s.log);
      this._grown = (this._grown || 0) + 1;
    }
  }
  growTree(x, y, z, log) {
    const w = this.game.world;
    const writes = [];
    const fake = {
      size: w.size, height: w.height, index: (a, b, c) => w.index(a, b, c),
      blocks: new Proxy(w.blocks, { get: (t, k) => t[k], set: (t, k, v) => { writes.push([+k, v]); return true; } }),
    };
    const gen = log === B.BIRCH_LOG ? birch : log === B.SPRUCE_LOG ? spruce : oak;
    gen(fake, x, y, z, this.rng);
    const S = w.size;
    const edits = [];
    for (const [i, id] of writes) {
      const bx = i % S, bz = Math.floor(i / S) % S, by = Math.floor(i / (S * S));
      if (this.buildingAt(bx, by, bz) || this.cellOccupied(bx, by, bz, id)) continue;
      edits.push([bx, by, bz, id]);
    }
    edits.sort((a, b) => a[1] - b[1]);
    for (const e of edits) this.editBlock(e[0], e[1], e[2], e[3]);
    this.game.particles?.emit({ pos: { x: x + 0.5, y: y + 3, z: z + 0.5 }, box: 1.5, count: 16, colors: [0x6fd05a, 0x9fe070, 0xd0ff90], speed: 1, gravity: -0.5, life: 1.2, size: 0.15 });
    for (const c of this.treeCache.values()) c.t = -1e9;
  }

  // ---- quarry
  /** The mine whose quarry pit contains column (x, z), or null. */
  quarryAt(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (const b of this.buildings) {
      if (!b.quarry || b.state === 'destroyed') continue;
      if (x < b.x || z < b.z || x >= b.x + b.w || z >= b.z + b.d) continue;
      const set = b._qset || (b._qset = new Set(b.quarry.cells.map(c => c.x + ',' + c.z)));
      if (set.has(x + ',' + z)) return b;
    }
    return null;
  }
  nextQuarryBlock(mine) {
    const q = mine.quarry;
    if (!q || mine.quarryDone) return null;
    const w = this.game.world;
    mine.qLayer = mine.qLayer || 0;
    for (let d = mine.qLayer; d < q.depth; d++) {
      const y = mine.y - d;
      if (y <= 2) break;
      let pendingReserved = false, found = null;
      const cells = q.cells.filter(c => c.step >= d).sort((a, b) => a.step - b.step || a.lx - b.lx);
      for (const c of cells) {
        const id = w.getBlock(c.x, y, c.z);
        if (!BLOCKS[id].solid || id === B.BEDROCK) {
          if (id !== B.AIR && id !== B.WATER && id !== B.TORCH && BLOCKS[id].shape === 'cross') { found = { x: c.x, y, z: c.z }; break; }
          continue;
        }
        if (this.quarryReserved.has(c.x + ',' + y + ',' + c.z)) { pendingReserved = true; continue; }
        found = { x: c.x, y, z: c.z };
        break;
      }
      if (found) return found;
      if (pendingReserved) return null;
      // layer finished → torch on the stair every third layer
      if (d > mine.qLayer - 1) {
        mine.qLayer = d + 1;
        if (d % 3 === 2) {
          const c = q.cells.find(c => c.step === d && c.lx === 0);
          if (c && w.getBlock(c.x, y, c.z) === B.AIR) return { x: c.x, y, z: c.z, torch: true };
        }
      }
    }
    mine.quarryDone = true;
    return null;
  }
  quarryBottom(mine) {
    const q = mine.quarry;
    const c = q.cells.filter(c => c.step === q.depth - 1).sort((a, b) => Math.abs(a.lx - 2) - Math.abs(b.lx - 2))[0];
    const w = this.game.world;
    let y = mine.y + 1;
    while (y > 2 && !w.isWalkable(c.x, y, c.z)) y--;
    return { x: c.x + 0.5, y, z: c.z + 0.5 };
  }

  /** Clash-of-Clans style: archers on the town hall tower shoot the nearest undead in range. */
  townHallDefense(dt) {
    const th = this.townHall;
    if (!th || th.state !== 'complete') return;
    this._thCd = (this._thCd || 0) - dt;
    if (this._thCd > 0) return;
    this._thCd = 0.4;
    if (this._thFor !== th) {
      this._thFor = th;
      const tp = th.points.top?.[0];
      this._thTop = tp ? new THREE.Vector3(tp.x, tp.y + 1, tp.z) : new THREE.Vector3(th.x + th.w / 2, th.y + Math.min(12, th.height || 10) + 1, th.z + th.d / 2);
      this._thShooter = null;
    }
    const top = this._thTop;
    const range = (this.game.state.researchDone.has('ballistics') ? 32 : 24) * (this.game.weather?.rangeMul ?? 1);
    let best = null, bd = range * range;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = z.position.x - top.x, dz = z.position.z - top.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) return;
    this._thCd = 1.0;
    const shooter = this._thShooter || (this._thShooter = { kind: 'tower', faction: 'village', id: -7, name: 'Ратуша', eye: top, position: top, velocity: new THREE.Vector3(), dead: false, cooldowns: {} });
    const gun = this.game.state.researchDone.has('gunpowder');
    this.shoot(shooter, best, gun ? 'bullet' : 'arrow', (gun ? 18 : 10) * (1 + this.armory.level * 0.15));
  }

  // ---- ranged attacks of guards / mages
  shoot(v, z, type, dmg, extra = {}) {
    const game = this.game;
    const from = v.eye.clone();
    const dir = new THREE.Vector3(z.position.x - from.x, 0, z.position.z - from.z).normalize();
    from.addScaledVector(dir, 0.5);
    const to = z.center.clone();
    const dist = from.distanceTo(to);
    to.addScaledVector(z.velocity, Math.min(1.2, dist / 35));
    const snd = extra.sound || { arrow: 'bow_shoot', bullet: this.game.state.researchDone.has('steam_power') ? 'rifle_shot' : 'musket_shot', fireball: 'fireball_cast', ice_shard: 'frost_cast', bolt: 'crossbow_shoot', lightning: 'lightning', bomb: 'cannon_shot' }[type];
    let done = false;
    try {
      if (game.combat?.fireProjectile) { game.combat.fireProjectile(type, v, from, to, { damage: dmg, owner: v, ...extra }); done = true; }
    } catch (e) { done = false; }
    if (snd) game.audio?.play(snd, { pos: from, volume: 0.6 });
    if (!done) {
      // fallback hitscan with a tracer
      const col = { fireball: [0xff8030, 0xffd060], ice_shard: [0x80d0ff, 0xffffff], bullet: [0xfff0a0], arrow: [0xd8c8a0] }[type] || [0xffffff];
      const steps = Math.ceil(dist / 1.2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        game.particles?.emit({ pos: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }, count: 1, colors: col, additive: type !== 'arrow', speed: 0.1, gravity: 0, life: 0.25, size: type === 'fireball' ? 0.35 : 0.12 });
      }
      z.damage(dmg, v, { kind: extra.element || 'phys' });
      if (extra.slow) z.slowTimer = Math.max(z.slowTimer || 0, 2.5);
      if (extra.splash) for (const o of this.zombies) if (o !== z && !o.dead && o.position.distanceTo(z.position) < extra.splash) o.damage(dmg * 0.5, v, { kind: 'fire' });
      if (type === 'fireball') { z.burnTimer = Math.max(z.burnTimer || 0, 2); game.particles?.emit({ pos: to, count: 20, colors: [0xff8030, 0xffd060, 0xff4010], additive: true, speed: 4, gravity: 2, life: 0.6, size: 0.3 }); }
    }
  }

  // ================================================================ misc
  toast(text, kind = 'info') { this.bus.emit('toast', { text, kind }); }
  floatText(pos, text, res) { this.bus.emit('village:gain', { pos: pos.clone ? pos.clone() : { ...pos }, text, res }); }
  reportHunger() {
    if (this.game.time - this._hungerToastT < 45) return;
    this._hungerToastT = this.game.time;
    this.toast('Жители голодают! Стройте фермы — без еды работа идёт медленнее.', 'bad');
  }

  // ================================================================ selection (command mode taps)
  onSelectTap(sx, sy) {
    if (this.game.mode !== 'command' || this.placement.active) return false;
    const pk = this.game.pickScreen(sx, sy, 400);
    if (pk.entity && pk.entity.kind === 'villager' && !pk.entity.dead) { this.bus.emit('select:entity', { entity: pk.entity }); this.game.audio?.play('ui_click', { volume: 0.4 }); return true; }
    // near-miss on villagers (small on phones): pick the closest villager to the hit point
    if (pk.point) {
      let best = null, bd = 1.3;
      for (const v of this.villagers) { if (v.dead || v.hidden) continue; const d = Math.hypot(v.position.x - pk.point.x, v.position.z - pk.point.z); if (d < bd) { bd = d; best = v; } }
      if (best) { this.bus.emit('select:entity', { entity: best }); this.game.audio?.play('ui_click', { volume: 0.4 }); return true; }
    }
    if (pk.hit) {
      const b = this.buildingAt(pk.hit.x, pk.hit.y, pk.hit.z);
      if (b) { this.bus.emit('select:building', { building: b }); this.game.audio?.play('ui_click', { volume: 0.4 }); return true; }
    }
    if (this.selected) this.bus.emit('select:clear', {});
    return false;
  }
  setSelection(obj) {
    if (this.selected === obj) return;
    this.selected = obj;
    if (this._selMesh) { disposeObj(this._selMesh); this._selMesh = null; }
    if (!obj) return;
    if (obj instanceof Villager) { this._selMesh = makeRing(0xffe066); this.game.scene.add(this._selMesh); }
    else { this._selMesh = makeRect(obj.w, obj.d, 0xffe066, 0.2); this._selMesh.position.set(obj.x, obj.y + 1.04, obj.z); this.game.scene.add(this._selMesh); }
  }
  updateSelection() {
    const s = this.selected, m = this._selMesh;
    if (!s || !m) return;
    if (s instanceof Villager) {
      if (s.dead) { this.setSelection(null); return; }
      m.visible = !s.hidden;
      m.position.set(s.position.x, s.position.y + 0.06, s.position.z);
      const k = 1 + Math.sin(this.game.time * 5) * 0.06; m.scale.set(k, 1, k);
    }
  }
  updateLabels() {
    const show = this.game.mode === 'command';
    for (const v of this.villagers) {
      if (!show || v.hidden || v.dead) { if (v._label) v._label.visible = false; continue; }
      const text = (JOBS[v.job] || JOBS.idle).label;
      const key = v.job + text;
      if (!v._label) {
        v._label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
        v._label.renderOrder = 10;
        v._label.center.set(0.5, 0);
        v._label.scale.set(0.15, 0.0375, 1);
        v.object3d.add(v._label);
      }
      if (v._labelKey !== key) { v._label.material.map = jobLabelTexture(v.job, text); v._label.material.needsUpdate = true; v._labelKey = key; }
      v._label.position.set(0, v.height + 0.35, 0);
      v._label.visible = true;
    }
  }

  // ================================================================ per-frame
  update(dt) {
    if (!this.game.world || !this.foot) return;
    this.refreshZombies();
    this.processPaths();
    this.placement.update(dt);
    this.ghosts.update(this.game.time);
    this._tick += dt;
    if (this._tick >= 1) { this.tick1(this._tick); this._tick = 0; }
    this._ghostT -= dt;
    if (this.ghostsDirty && this._ghostT <= 0) { this.rebuildGhosts(); this._ghostT = 0.2; }
    this.industry.update(dt);
    this.updateMorphs(dt);
    this.updateSelection();
    this.updateLabels();
  }
  /** once per second */
  tick1(dt) {
    const st = this.game.state;
    this.tickUpgrades(dt);
    this.industry.tick(dt);
    // crops grow (≈4 min from seed to ripe, ≈2.6 min with agriculture): one farm feeds ~25 villagers (~60 later)
    const stage = st.researchDone.has('agriculture') ? 52 : 80;
    const w = this.game.world, wmul = this.game.weather?.cropMul ?? 1;
    for (const b of this.buildings) {
      if (b.type !== 'farm' || b.state !== 'complete') continue;
      for (const p of b.plots) {
        const a = w.getBlock(p.x, p.y + 1, p.z);
        if (a >= B.WHEAT_0 && a < B.WHEAT_3 && w.getBlock(p.x, p.y, p.z) === B.FARMLAND && this.rng() < dt / stage * wmul) this.editBlock(p.x, p.y + 1, p.z, a + 1);
      }
    }
    this.growSaplings();
    // scaffolds follow the current build layer
    for (const [id, s] of this.scaffolds) {
      const b = this.byId.get(id);
      if (!b) { s.dispose(); this.scaffolds.delete(id); continue; }
      let lo = null;
      for (let i = b.opCursor; i < b.ops.length; i++) { const op = b.ops[i]; if (op.kind === 2 && !b.opDone(op)) { lo = op.y; break; } }
      s.setHeight(lo === null ? 0 : lo - b.y);
    }
    this.townHallDefense(dt);
    // immigration
    if (this.townHall && this.townHall.state === 'complete') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        const pop = this.villagers.length;
        const idle = this.villagers.filter(v => !v.dead && v.job === 'idle').length;
        const freeJobs = this.buildings.reduce((n, b) => n + (b.state === 'complete' && b.jobSlots ? b.freeSlots : 0), 0);
        const foodOk = (st.resources.food || 0) >= 15 + pop * 3;       // keep a reserve so the village doesn't starve
        if (pop < Math.min(this.popCap, MAX_VILLAGERS) && foodOk && (freeJobs > 0 || idle === 0) && !st.isNight && !(this.game.waves?.activeCount > 0)) {
          st.add('food', -10);
          const v = this.spawnVillager({});
          if (v) this.autoAssign();
        }
      }
    }
    // cleanup stale reservations
    if (this.replantSpots.length > 30) this.replantSpots.splice(0, this.replantSpots.length - 30);
  }
  rebuildGhosts() {
    this.ghostsDirty = false;
    const list = this._ghostList || (this._ghostList = []);
    list.length = 0;
    const w = this.game.world;
    for (const b of this.buildings) {
      if (b.state === 'complete' && !b.needsRepair) continue;
      for (let i = 0; i < b.blocks.length; i++) {
        if (b.built[i]) continue;
        const bl = b.blocks[i];
        if (w.getBlock(bl.x, bl.y, bl.z) === bl.id) { b.built[i] = 1; b.builtCount++; continue; }
        list.push(bl);
      }
    }
    this.ghosts.set(list);
  }

  // ================================================================ save / load
  serialize() {
    return {
      v: 1,
      nextBuildingId: this.nextBuildingId,
      armory: { ...this.armory },
      spawnTimer: this.spawnTimer,
      buildings: this.buildings.map(b => b.serialize()),
      villagers: this.villagers.filter(v => !v.dead).map(v => v.serialize()),
      saplings: this.saplings.map(s => ({ ...s, growAt: Math.max(0, s.growAt - this.game.time) })),
      spawnPoint: [this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z],
    };
  }
  deserialize(o) {
    if (!o || !o.buildings) return;
    this.reset();
    setEraTier((this.game.state.age | 0) + 1);
    this.armory = { level: 0, progress: 0, ...(o.armory || {}) };
    this.spawnTimer = o.spawnTimer ?? SPAWN_INTERVAL;
    if (o.spawnPoint) this.spawnPoint.set(o.spawnPoint[0], o.spawnPoint[1], o.spawnPoint[2]);
    for (const s of o.buildings) {
      if (!BUILDING_TYPES[s.type]) continue;
      const b = new Building(this, s.type, s.x, s.y, s.z, s.rot, s.variant || 0, s.id);
      b.level = s.level || 1;
      b.upgrade = s.upgrade && s.upgrade.left > 0 ? { left: s.upgrade.left, total: s.upgrade.total || s.upgrade.left } : null;
      // era buildings: the design that stands in the world (older saves had the medieval design + material swaps)
      let oldH = 0, morph = false;
      if (b.def.tiered) {
        const saved = s.tier || 0;
        if (saved) { if (saved !== b.tier) b.relayout(saved); }
        else { oldH = b.def.layout(b.rot, b.variant, 4).height; b.relayout(b.style); morph = true; }
      }
      b.applyLevelMaterials(false);
      this.addBuilding(b);
      b.computeOps(oldH);
      b.state = s.state || 'complete';
      b.maxHp = b.computeMaxHp();
      b.hp = Math.min(b.maxHp, s.hp ?? b.maxHp);
      b.quarryDone = !!s.quarryDone;
      if (b.state === 'complete') b.needsRepair = b.builtCount < b.blocks.length;
      if (b.state === 'planned' || b.state === 'constructing') this.scaffolds.set(b.id, new Scaffold(this.game, b));
      if (morph && b.state === 'complete') this.startMorph(b);
      else if (b.def.tiered && b.state === 'complete' && b.tier !== b.style) this.retier(b);
    }
    this.nextBuildingId = Math.max(this.nextBuildingId, o.nextBuildingId || 1);
    for (const s of o.villagers || []) {
      const v = this.spawnVillager({ name: s.name, female: s.female, seed: s.seed, job: s.job, hunger: s.hunger, mood: s.mood, silent: true, pos: { x: s.x, y: s.y, z: s.z } });
      if (!v) continue;
      v.position.set(s.x, s.y, s.z);
      v.hp = Math.min(v.maxHp, s.hp ?? v.maxHp);
      const wp = s.workplace != null ? this.byId.get(s.workplace) : null;
      if (wp) { v.workplace = wp; wp.workers.push(v); }
      if (s.home != null) v.home = this.byId.get(s.home) || null;
      if (s.carry) { v.carry = { ...s.carry }; v.refreshCarryMesh(); }
      if (!this.game.world.isWalkable(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z))) v.teleportNear(v.position);
    }
    for (const s of o.saplings || []) this.saplings.push({ ...s, growAt: this.game.time + (s.growAt || 60) });
    // older saves: buildings below their age's base level catch up (their looks already did)
    if (this.raiseLevelsForAge((this.game.state.age | 0), true)) for (const b of this.buildings) b.refreshMaxHp();
    this.recalcPop();
    this.recalcRadius();
    this.ghostsDirty = true;
  }
}

function tapPoint(a) {
  const e = a[0];
  if (e && typeof e === 'object') {
    if ('clientX' in e) return { x: e.clientX, y: e.clientY };
    if ('x' in e && 'y' in e) return { x: e.x, y: e.y };
  }
  if (typeof a[0] === 'number' && typeof a[1] === 'number') return { x: a[0], y: a[1] };
  return null;
}
