// Rival villages (format-4 worlds). Seven or eight towns stand 300–900 blocks around the player's village, on sites
// the terrain generator levelled for them (src/world/terrain4.js). Each one lives its own life:
//   • it grows: earns wealth from its people, builds up its town plan and advances through the ages (never far
//     ahead of the player), and trains soldiers up to what its barracks and towers can keep;
//   • it makes war: on the player (aggressive towns, or anyone who attacks their people) and on other towns —
//     battles between towns are fought for real when the player is close, otherwise reckoned from the armies;
//     a town that loses its whole army is taken over and pays tribute to its new master;
//   • it raids: a town at war with the player sends war parties that march on the village like the undead do,
//     smash buildings and carry off resources; repelled raids make it cautious and in the end it asks for peace;
//   • it can be captured: kill its defenders and hold its town hall — it becomes the player's vassal and pays
//     tribute every dawn.
// Optimised: the town's buildings are drawn into chunks as they are generated (no saved block edits), its people
// only exist as entities while the player is near, and the rest is a few numbers ticked once a second.
import { B, BLOCKS } from '../core/blocks.js';
import { BUILDING_TYPES } from '../village/buildings.js';
import { AGES } from './ages.js';
import { mulberry32 } from '../core/rng.js';
import { RESOURCE_LABELS } from '../core/items.js';

const NAMES = ['Ольховка', 'Каменка', 'Сосновка', 'Берёзовый Лог', 'Заречье', 'Волчья Падь', 'Медвежий Угол', 'Красный Бор', 'Ясная Поляна', 'Луговое', 'Овражки', 'Дубравино'];
export const RIVAL_COLORS = ['#d04040', '#4070d0', '#40b060', '#e0b030', '#9050d0', '#30b0c0', '#e07030', '#8a8a8a'];
// what a town builds, in order: [type, from tier]
const PLAN = [
  ['town_hall', 1], ['house', 1], ['farm', 1], ['house', 1], ['lumber_camp', 1], ['house', 1], ['watchtower', 2], ['storehouse', 2],
  ['house', 2], ['mine', 2], ['farm', 2], ['barracks', 3], ['house', 3], ['forge', 3], ['watchtower', 3], ['market', 4], ['granary', 4],
  ['house', 4], ['house', 5], ['mage_tower', 5], ['laboratory', 5], ['cannon_tower', 6], ['house', 6], ['factory', 7], ['house', 7],
  ['power_plant', 8], ['radar', 9], ['house', 9], ['shield_generator', 10],
];
const TOWERS = new Set(['watchtower', 'cannon_tower', 'tesla_tower', 'turret', 'laser_tower', 'mg_nest']);
const NEAR = 130;           // the town's people exist as entities when the player is this close
const FAR = 190;            // and are sent home beyond this
const MAX_DEFENDERS = 9;

/** Soldier types a town fields at its tier (weighted pick). */
function soldierTypes(tier) {
  if (tier <= 2) return [['militia', 3], ['rival_archer', 1]];
  if (tier <= 4) return [['rival_guard', 3], ['rival_archer', 2], ['rival_knight', tier >= 4 ? 1 : 0]];
  if (tier <= 6) return [['rival_knight', 2], ['rival_musketeer', 2], ['rival_guard', 1]];
  if (tier <= 8) return [['rival_rifleman', 3], ['rival_knight', 1]];
  return [['rival_trooper', 2], ['rival_rifleman', 2]];
}
function pick(list, rnd = Math.random) { let t = 0; for (const [, w] of list) t += w; let r = rnd() * t; for (const [k, w] of list) if ((r -= w) <= 0) return k; return list[0][0]; }
const sector = (dx, dz) => Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8;
/** 'на севере' … */
const dirName = (dx, dz) => ['севере', 'северо-востоке', 'востоке', 'юго-востоке', 'юге', 'юго-западе', 'западе', 'северо-западе'][sector(dx, dz)];
/** 'с севера' … */
const dirFrom = (dx, dz) => ['севера', 'северо-востока', 'востока', 'юго-востока', 'юга', 'юго-запада', 'запада', 'северо-запада'][sector(dx, dz)];

export class Rivals {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.plans = new Map();     // town index -> building plan (deterministic from the seed)
    this.wars = new Set();      // 'a:b' (a < b): towns at war with each other
    this.units = new Map();     // town index -> spawned entities near the player
    this.t = 0;
    this._world = null;
    const bus = game.bus;
    bus.on('world:ready', ({ world }) => this._attach(world));
    bus.on('game:begin', ({ loaded }) => { if (!loaded) this._init(); this._restampLoaded(); });
    bus.on('time:dawn', () => this._tribute());
    bus.on('building:damaged', ({ amount, source }) => this._plunder(source, amount));
  }

  // ------------------------------------------------------------------ setup
  _attach(world) {
    this._world = world;
    this.list = []; this.plans.clear(); this.wars.clear(); this._clearUnits();
    if (world.format < 4) return;
    world.decorators.push((cx, cz) => this._decorate(cx, cz));
  }
  get active() { return this.list.length > 0; }
  _init() {
    const w = this.game.world;
    this.list = []; this.wars.clear(); this._clearUnits();
    const sites = w?.gen?.sites;
    if (!sites || w.format < 4) return;
    const rnd = mulberry32((w.seed ^ 0xa11e5) >>> 0);
    const names = [...NAMES].sort(() => rnd() - 0.5);
    sites.forEach((s, k) => {
      this.list.push({
        i: k, name: names[k % names.length], x: s.x, z: s.z, y: s.h, color: RIVAL_COLORS[k % RIVAL_COLORS.length],
        aggro: Math.round((0.15 + rnd() * 0.8) * 100) / 100,
        tier: 1, built: 4 + Math.floor(rnd() * 3), wealth: 0, army: 3 + Math.floor(rnd() * 3), pop: 12,
        rel: 'peace', owner: null, lostRaids: 0, raidT: 240 + rnd() * 240, raid: null, offer: null,
        tierT: 0, warT: 120 + rnd() * 300, battleT: 0,
      });
    });
    for (const r of this.list) this._recount(r);
    if (this.list.length) setTimeout(() => this.game.bus.emit('toast', { text: `Вокруг вашей деревни ${this.list.length} соседних деревень. Они растут, воюют между собой и могут напасть на вас — смотрите «Соседи» (N).`, kind: 'info' }), 25000);
  }

  // ------------------------------------------------------------------ queries
  get(i) { return this.list[i] || null; }
  atWar(a, b) { const k = a < b ? a + ':' + b : b + ':' + a; return this.wars.has(k); }
  /** Is town i hostile to the player (its own war, or its master's)? */
  atWarWithPlayer(i) {
    const r = this.list[i]; if (!r) return false;
    if (r.owner === 'player') return false;
    if (r.rel === 'war') return true;
    return r.owner !== null && this.list[r.owner]?.rel === 'war';
  }
  power(r) { return r.army * (1 + r.tier * 0.35); }
  playerDefense() {
    const g = this.game, v = g.village;
    let d = 4 + (g.state.age | 0) * 3;
    d += (v?.villagersByJob?.('guard').length || 0) * 2.5;
    for (const b of v?.buildings || []) if (b.state === 'complete' && TOWERS.has(b.type)) d += 3 + (b.level || 1);
    return d;
  }

  // ------------------------------------------------------------------ the town plan
  _plan(r) {
    let plan = this.plans.get(r.i);
    if (plan) return plan;
    plan = [];
    const L = 200, half = L / 2, occ = new Uint8Array(L * L);
    const free = (x0, z0, w, d, m) => {
      for (let z = z0 - m; z < z0 + d + m; z++) for (let x = x0 - m; x < x0 + w + m; x++) {
        const lx = x + half, lz = z + half;
        if (lx < 0 || lz < 0 || lx >= L || lz >= L || occ[lz * L + lx]) return false;
      }
      return true;
    };
    const mark = (x0, z0, w, d) => { for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) occ[(z + half) * L + x + half] = 1; };
    const cands = [];
    for (let z = -54; z <= 54; z += 2) for (let x = -54; x <= 54; x += 2) if (x * x + z * z <= 54 * 54) cands.push([x, z, x * x + z * z]);
    cands.sort((a, b) => a[2] - b[2]);
    const rnd = mulberry32((this.game.world.seed ^ (r.i * 7919 + 17)) >>> 0);
    for (const [type, minTier] of PLAN) {
      const def = BUILDING_TYPES[type];
      if (!def) continue;
      const variant = Math.floor(rnd() * (def.variants || 1));
      // reserve the room of its widest (last-age) design, so it can grow in place
      const big = def.layout(0, variant, 10, def.growAt(10));
      let placed = null;
      for (const [cx, cz] of cands) {
        const rot = type === 'town_hall' ? 0 : Math.abs(cx) > Math.abs(cz) ? (cx > 0 ? 1 : 3) : (cz > 0 ? 2 : 0);     // the door faces the square
        const w = rot & 1 ? big.d : big.w, d = rot & 1 ? big.w : big.d;
        const x0 = cx - (w >> 1), z0 = cz - (d >> 1);
        if (!free(x0, z0, w, d, type === 'town_hall' ? 4 : 2)) continue;
        mark(x0, z0, w, d);
        placed = { type, minTier, rot, variant, x: r.x + x0, z: r.z + z0, mw: w, md: d };
        break;
      }
      if (placed) plan.push(placed);
    }
    this.plans.set(r.i, plan);
    return plan;
  }
  /** Buildings the town can have at its tier. */
  _eligible(r) { const plan = this._plan(r); let n = 0; for (const p of plan) if (p.minTier <= r.tier) n++; return n; }
  /** World blocks of planned building p at tier t: [x, y, z, id][] and its rectangle. */
  _blocks(r, p, t) {
    const def = BUILDING_TYPES[p.type];
    const L = def.layout(p.rot, p.variant, t, def.growAt(t));
    const ox = p.x + ((p.mw - L.w) >> 1), oz = p.z + ((p.md - L.d) >> 1);
    return { L, ox, oz };
  }
  _recount(r) {
    const plan = this._plan(r);
    let houses = 0, barracks = 0, towers = 0;
    for (let k = 0; k < Math.min(r.built, plan.length); k++) {
      const t = plan[k].type;
      if (t === 'house') houses++; else if (t === 'barracks') barracks++; else if (TOWERS.has(t)) towers++;
    }
    r.pop = 6 + houses * 5 + r.tier * 2;
    r.armyCap = 3 + r.tier * 2 + barracks * 5 + towers * 2;
  }

  // ------------------------------------------------------------------ drawing the towns into the world
  /** New chunk: draw every town building that reaches into it (before lighting and the player's saved edits). */
  _decorate(cx, cz) {
    if (!this.list.length) return;
    const x0 = cx * 16, z0 = cz * 16, x1 = x0 + 16, z1 = z0 + 16;
    for (const r of this.list) {
      if (Math.abs(r.x - (x0 + 8)) > 90 || Math.abs(r.z - (z0 + 8)) > 90) continue;
      const plan = this._plan(r);
      for (let k = 0; k < Math.min(r.built, plan.length); k++) {
        const p = plan[k];
        if (p.x >= x1 || p.z >= z1 || p.x + p.mw <= x0 || p.z + p.md <= z0) continue;
        this._draw(r, p, r.tier, x0, z0, x1, z1);
      }
    }
  }
  /** Writes building p (tier t) into the part of the world inside [x0, x1) × [z0, z1). */
  _draw(r, p, t, x0, z0, x1, z1) {
    const w = this.game.world, { L, ox, oz } = this._blocks(r, p, t), y = r.y;
    // the plot: clear plants above, fill holes below
    for (let z = Math.max(z0, p.z); z < Math.min(z1, p.z + p.md); z++) for (let x = Math.max(x0, p.x); x < Math.min(x1, p.x + p.mw); x++) {
      for (let yy = y + 1; yy <= y + L.height + 1; yy++) { const id = w.rawGet(x, yy, z); if (id && !BLOCKS[id]?.solid) w.rawSet(x, yy, z, 0); }
      for (let yy = y; yy > y - 6; yy--) { const id = w.rawGet(x, yy, z); if (id && BLOCKS[id]?.solid) break; w.rawSet(x, yy, z, yy === y ? B.GRASS : B.DIRT); }
    }
    for (const b of L.blocks) {
      const x = ox + b.dx, z = oz + b.dz;
      if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
      w.rawSet(x, y + b.dy, z, b.id);
    }
  }
  /** Redraws building k of a town in the chunks that exist (the old design is taken down first). */
  _restamp(r, k, oldTier) {
    const w = this.game.world, p = this._plan(r)[k];
    if (!p) return;
    if (oldTier) {
      const { L, ox, oz } = this._blocks(r, p, oldTier);
      for (const b of L.blocks) if (b.dy >= 1 && w.isGenerated(ox + b.dx, oz + b.dz)) w.rawSet(ox + b.dx, r.y + b.dy, oz + b.dz, 0);
    }
    const N = w.chunksX;
    for (let cz = p.z >> 4; cz <= (p.z + p.md - 1) >> 4; cz++) for (let cx = p.x >> 4; cx <= (p.x + p.mw - 1) >> 4; cx++) {
      if (cx < 0 || cz < 0 || cx >= N || cz >= N || !w.generated[cz * N + cx]) continue;
      this._draw(r, p, r.tier, cx * 16, cz * 16, cx * 16 + 16, cz * 16 + 16);
    }
    w.relightBox(p.x - 1, p.z - 1, p.x + p.mw, p.z + p.md);
    this.game.bus.emit('rivals:changed', { i: r.i });
  }
  /** After loading: draw the towns into the chunks that are already there. */
  _restampLoaded() {
    const w = this.game.world; if (!w || !this.list.length) return;
    for (const r of this.list) {
      const plan = this._plan(r);
      for (let k = 0; k < Math.min(r.built, plan.length); k++) {
        const p = plan[k];
        let any = false;
        for (let z = p.z; z < p.z + p.md && !any; z += 8) for (let x = p.x; x < p.x + p.mw && !any; x += 8) if (w.isGenerated(x, z)) any = true;
        if (any) this._restamp(r, k, 0);
      }
    }
  }

  // ------------------------------------------------------------------ the simulation
  update(dt) {
    const g = this.game;
    if (!this.list.length || !g.running || g.net?.isClient) return;
    this._units(dt);
    this.t += dt;
    if (this.t < 1) return;
    const step = this.t; this.t = 0;
    for (const r of this.list) this._grow(r, step);
    this._diplomacy(step);
    for (const r of this.list) this._raids(r, step);
    this._battles(step);
    this._capture(step);
  }

  _grow(r, dt) {
    const g = this.game, playerTier = Math.min(10, (g.state.age | 0) + 1);
    r.wealth += (r.pop * 0.05 + r.tier * 0.4) * dt;
    // vassals keep a part for their master
    if (r.owner !== null && r.owner !== 'player') { const o = this.list[r.owner]; if (o) { o.wealth += r.wealth * 0.002 * dt; r.wealth *= 1 - 0.002 * dt; } }
    // build the next planned building
    const elig = this._eligible(r), cost = 40 + r.built * 12 * r.tier;
    if (r.built < elig && r.wealth >= cost) {
      r.wealth -= cost; r.built++;
      this._recount(r);
      this._restamp(r, r.built - 1, 0);
    }
    // a new age: never more than one ahead of the player (aggressive towns two)
    r.tierT += dt;
    const cap = Math.min(10, playerTier + (r.aggro > 0.7 ? 2 : 1));
    const tierCost = 200 * r.tier * r.tier;
    if (r.built >= elig && r.tier < cap && r.wealth >= tierCost && r.tierT > 360) {
      r.wealth -= tierCost; r.tierT = 0;
      const old = r.tier; r.tier++;
      this._recount(r);
      for (let k = 0; k < Math.min(r.built, this._plan(r).length); k++) this._restamp(r, k, old);
      if (this._near(r, 400)) g.bus.emit('toast', { text: `«${r.name}» вступает в эпоху: ${AGES[r.tier - 1]?.name || ''}`, kind: 'info' });
    }
    // train soldiers (not while the player is besieging the town)
    if (r.army < r.armyCap && !(this.atWarWithPlayer(r.i) && this._near(r, NEAR))) r.army = Math.min(r.armyCap, r.army + dt / Math.max(15, 45 - r.tier * 2));
  }

  /** Declarations of war and peace between the towns and with the player. */
  _diplomacy(dt) {
    const g = this.game;
    for (const r of this.list) {
      r.warT -= dt;
      if (r.warT > 0) continue;
      r.warT = 60 + Math.random() * 90;
      if (r.owner !== null) continue;              // vassals follow their master
      // on the player: aggressive towns that feel strong enough (not before the third day)
      if (r.rel === 'peace' && g.state.day >= 3 && Math.random() < r.aggro * 0.25 && this.power(r) > this.playerDefense() * 0.6) {
        this.declareWar(r, `«${r.name}» объявляет вам войну! Их отряды придут с ${dirFrom(r.x - g.world.size / 2, r.z - g.world.size / 2)}.`);
        continue;
      }
      // on a neighbouring town
      for (const o of this.list) {
        if (o === r || o.owner === r.i || this.atWar(r.i, o.i) || o.owner === 'player') continue;
        if (Math.hypot(o.x - r.x, o.z - r.z) > 900) continue;
        if (Math.random() < r.aggro * 0.12 && this.power(r) > this.power(o) * 0.8) {
          this.wars.add(r.i < o.i ? r.i + ':' + o.i : o.i + ':' + r.i);
          r.battleT = 90 + Math.random() * 120;
          this._news(`«${r.name}» пошла войной на «${o.name}»`, r, o);
          break;
        }
      }
      // tired of fighting: peace between towns
      for (const k of [...this.wars]) {
        const [a, b] = k.split(':').map(Number);
        if ((a === r.i || b === r.i) && Math.random() < 0.08) { this.wars.delete(k); this._news(`«${this.list[a].name}» и «${this.list[b].name}» заключили мир`, this.list[a], this.list[b]); }
      }
      // beaten in raids and weak: they ask the player for peace
      if (r.rel === 'war' && !r.offer && r.lostRaids >= 2 && r.army < 3) {
        r.offer = { gold: 10 + r.tier * 6 };
        g.bus.emit('toast', { text: `«${r.name}» просит мира и предлагает ${r.offer.gold} золота. Откройте «Соседи» (N).`, kind: 'good' });
      }
    }
  }
  declareWar(r, text) {
    if (r.rel === 'war' || r.owner === 'player') return;
    r.rel = 'war'; r.offer = null; r.raidT = Math.max(r.raidT, 120);
    this.game.bus.emit('toast', { text: text || `Война с «${r.name}»!`, kind: 'bad' });
    this.game.audio?.play('wave_horn', { volume: 0.7 });
  }
  /** The player asks for peace: costs gold, and an aggressive town that is winning won't take it. */
  offerPeace(r) {
    const st = this.game.state;
    if (r.offer) {
      st.add('gold', r.offer.gold);
      this._makePeace(r, `Мир с «${r.name}». Вы получили ${r.offer.gold} золота.`);
      return true;
    }
    const price = this.peacePrice(r);
    if (this.power(r) > this.playerDefense() * 1.4 && r.aggro > 0.6 && r.lostRaids < 2) { this.game.bus.emit('toast', { text: `«${r.name}» отвергает мир: они уверены в победе`, kind: 'bad' }); return false; }
    if (!st.spend({ gold: price })) { this.game.bus.emit('toast', { text: `Для мира нужно ${price} золота`, kind: 'bad' }); return false; }
    this._makePeace(r, `Мир с «${r.name}» за ${price} золота`);
    return true;
  }
  peacePrice(r) { return Math.round(15 + this.power(r) * 3 + r.tier * 10); }
  _makePeace(r, text) {
    r.rel = 'peace'; r.offer = null; r.lostRaids = 0; r.warT = 600;
    if (r.raid && !r.raid.arrived) { r.army += r.raid.size; r.raid = null; }
    this.game.bus.emit('toast', { text, kind: 'good' });
    for (const u of this.units.get(r.i) || []) { if (u.type === 'folk') u.peaceful = true; u.target = null; }
  }

  // ------------------------------------------------------------------ raids on the player
  _raids(r, dt) {
    const g = this.game;
    if (!this.atWarWithPlayer(r.i)) { r.raid = null; return; }
    if (r.raid) {
      const raid = r.raid;
      if (!raid.arrived) {
        raid.eta -= dt;
        if (raid.eta <= 0) this._raidArrive(r);
        return;
      }
      raid.t += dt;
      const alive = raid.units.filter(u => !u.dead);
      if (!alive.length || raid.t > 240) {
        // all fallen, or they leave with their loot
        for (const u of alive) { u.dead = true; u.removeAt = 0; u.object3d.visible = false; }
        r.army += alive.length;
        r.wealth += raid.loot * 2;
        if (!alive.length) { r.lostRaids++; g.bus.emit('toast', { text: `Набег «${r.name}» отбит!`, kind: 'good' }); }
        else g.bus.emit('toast', { text: `Отряд «${r.name}» ушёл${raid.loot ? ` с добычей (${Math.round(raid.loot)})` : ''}`, kind: 'warn' });
        r.raid = null;
        r.raidT = (300 + Math.random() * 300) * (1 + r.lostRaids * 0.4) * (1.3 - r.aggro * 0.5);
      }
      return;
    }
    r.raidT -= dt;
    if (r.raidT > 0 || r.army < 3) return;
    // a war party when they think they can win — or out of spite
    if (this.power(r) < this.playerDefense() * 0.5 && Math.random() > r.aggro * 0.4) { r.raidT = 120; return; }
    const size = Math.max(3, Math.min(14, Math.round(r.army * 0.6)));
    r.army -= size;
    const c = g.world.size / 2, dist = Math.hypot(r.x - c, r.z - c);
    r.raid = { size, eta: Math.max(45, Math.min(180, dist / 5)), arrived: false, units: [], t: 0, loot: 0 };
    g.bus.emit('toast', { text: `«${r.name}» выслала отряд: ${size} воинов. Они придут с ${dirFrom(r.x - c, r.z - c)} через ~${Math.round(r.raid.eta)} с!`, kind: 'bad' });
  }
  _raidArrive(r) {
    const g = this.game, W = g.waves, c = g.world.size / 2;
    const raid = r.raid; raid.arrived = true;
    const ang = Math.atan2(r.z - c, r.x - c);
    for (let k = 0; k < raid.size; k++) {
      const p = W?._edgePoint?.(ang + (Math.random() - 0.5) * 0.4, 6);
      if (!p) continue;
      const u = this._spawnUnit(r, pick(soldierTypes(r.tier)), p.x, p.z, p.y, { wanderer: false });
      if (u) { u.raider = true; raid.units.push(u); }
    }
    g.bus.emit('toast', { text: `Отряд «${r.name}» у стен деревни!`, kind: 'bad' });
    g.audio?.play('wave_horn', { volume: 1 });
  }
  /** A raider hitting a building carries off some of the stock. */
  _plunder(src, amount) {
    if (!src || src.rivalId == null || !src.raider) return;
    const r = this.list[src.rivalId]; if (!r?.raid) return;
    const st = this.game.state, res = ['wood', 'stone', 'food', 'iron', 'gold'].filter(k => (st.resources[k] || 0) > 5);
    if (!res.length || Math.random() > amount / 25) return;
    const k = res[(Math.random() * res.length) | 0], n = Math.min(st.resources[k], 2 + r.tier);
    if (st.spend({ [k]: n })) r.raid.loot += n;
  }

  // ------------------------------------------------------------------ battles between towns
  _battles(dt) {
    for (const key of [...this.wars]) {
      const [a, b] = key.split(':').map(Number), A = this.list[a], D = this.list[b];
      if (!A || !D) { this.wars.delete(key); continue; }
      const att = A.battleT <= D.battleT ? A : D, def = att === A ? D : A;
      att.battleT -= dt;
      if (att.battleT > 0) continue;
      att.battleT = 180 + Math.random() * 200;
      if (att.army < 3) continue;
      const party = Math.max(2, Math.round(att.army * 0.6));
      att.army -= party;
      if (this._near(def, NEAR + 40)) { this._fieldBattle(att, def, party); continue; }
      // reckoned from the armies (the defenders fight on their own ground)
      const pa = party * (1 + att.tier * 0.35), pd = Math.max(0.1, def.army * (1 + def.tier * 0.35) * 1.25);
      const share = pa / (pa + pd);
      const defLoss = Math.min(def.army, Math.round(def.army * share * (0.6 + Math.random() * 0.6) + party * 0.2));
      const attLoss = Math.min(party, Math.round(party * (1 - share) * (0.6 + Math.random() * 0.6)));
      def.army -= defLoss; att.army += party - attLoss;
      if (def.army <= 0.5 && party - attLoss > 0) this._conquer(att, def);
    }
  }
  /** The player is near: the attackers march into the town for real. */
  _fieldBattle(att, def, party) {
    const ang = Math.atan2(att.z - def.z, att.x - def.x);
    for (let k = 0; k < Math.min(party, 10); k++) {
      const x = def.x + Math.cos(ang) * 50 + (Math.random() - 0.5) * 10, z = def.z + Math.sin(ang) * 50 + (Math.random() - 0.5) * 10;
      const u = this._spawnUnit(att, pick(soldierTypes(att.tier)), x, z, null, { home: { x: def.x, z: def.z } });
      if (u) u.attacking = def.i;
    }
    att.army += Math.max(0, party - 10);
    this.game.bus.emit('toast', { text: `«${att.name}» штурмует «${def.name}»!`, kind: 'warn' });
  }
  _conquer(att, def) {
    def.owner = att.i; def.rel = 'peace'; def.army = 1; def.raid = null; def.offer = null;
    for (const k of [...this.wars]) { const [a, b] = k.split(':').map(Number); if (a === def.i || b === def.i) this.wars.delete(k); }
    // a fallen master frees its vassals
    for (const o of this.list) if (o.owner === def.i) o.owner = null;
    this._news(`«${att.name}» захватила «${def.name}»`, att, def);
  }
  _news(text, a, b) {
    // far-away events only reach the player as rumours (always shown: it's how the map changes)
    this.game.bus.emit('toast', { text, kind: 'info' });
    this.game.bus.emit('rivals:changed', { i: a?.i });
  }

  // ------------------------------------------------------------------ capturing a town
  _capture(dt) {
    const g = this.game, p = g.player;
    if (!p || p.dead) return;
    for (const r of this.list) {
      if (!this.atWarWithPlayer(r.i)) { r.capT = 0; continue; }
      const d = Math.hypot(p.position.x - (r.x + 0.5), p.position.z - (r.z + 0.5));
      // the town's soldiers still standing (spawned ones count in the army already)
      if (d > 9) { r.capT = 0; continue; }
      if (r.army > 0.99) {
        r.capT = 0;
        if (!(r._capMsgT > g.time)) { r._capMsgT = g.time + 5; g.bus.emit('toast', { text: `Чтобы захватить «${r.name}», перебейте защитников (осталось ${Math.ceil(r.army)})`, kind: 'warn' }); }
        continue;
      }
      r.capT = (r.capT || 0) + dt;
      g.bus.emit('toast', { text: `Захват «${r.name}»: ${Math.min(8, Math.floor(r.capT))}/8`, kind: 'info' });
      if (r.capT >= 8) {
        const prevOwner = r.owner;
        r.owner = 'player'; r.rel = 'vassal'; r.capT = 0; r.raid = null; r.offer = null; r.army = Math.max(r.army, 1);
        for (const k of [...this.wars]) { const [a, b] = k.split(':').map(Number); if (a === r.i || b === r.i) this.wars.delete(k); }
        for (const o of this.list) if (o.owner === r.i) o.owner = null;
        g.bus.emit('toast', { text: `«${r.name}» захвачена! Теперь это ваш вассал: каждое утро она платит дань.${prevOwner !== null ? ' Её прежний хозяин в ярости.' : ''}`, kind: 'good' });
        g.audio?.play('level_up', { volume: 0.9 });
        if (typeof prevOwner === 'number' && this.list[prevOwner] && this.list[prevOwner].rel !== 'war') this.declareWar(this.list[prevOwner], `«${this.list[prevOwner].name}» объявляет войну за потерю «${r.name}»!`);
        for (const u of this.units.get(r.i) || []) { if (u.type === 'folk') u.peaceful = true; u.target = null; }
      }
    }
  }
  _tribute() {
    const st = this.game.state, got = {};
    for (const r of this.list) {
      if (r.owner !== 'player') continue;
      const t = r.tier;
      const add = { wood: 8 * t, stone: 8 * t, food: 6 * t, gold: 2 * t, ...(t >= 3 ? { iron: 3 * t } : {}) };
      for (const k in add) { st.add(k, add[k]); got[k] = (got[k] || 0) + add[k]; }
    }
    const parts = Object.entries(got).map(([k, n]) => `${RESOURCE_LABELS[k] || k} +${n}`);
    if (parts.length) this.game.bus.emit('toast', { text: `Дань вассалов: ${parts.join(', ')}`, kind: 'good' });
  }

  // ------------------------------------------------------------------ people near the player
  _near(r, d) { const p = this.game.player?.position; return !!p && Math.abs(p.x - r.x) < d && Math.abs(p.z - r.z) < d; }
  _units(dt) {
    this._unitT = (this._unitT || 0) - dt;
    if (this._unitT > 0) return;
    this._unitT = 1.5;
    const g = this.game, p = g.player?.position, w = g.world;
    if (!p) return;
    for (const r of this.list) {
      let list = this.units.get(r.i) || [];
      list = list.filter(u => !u.dead);
      const d = Math.hypot(p.x - r.x, p.z - r.z);
      if (d > FAR) {
        // the player left: the townsfolk go back to being numbers (field battles end where they stood)
        for (const u of list) { if (u.attacking !== undefined) { const a = this.list[u.rivalId]; if (a) a.army += 1; } u.dead = true; u.removeAt = 0; u.object3d.visible = false; }
        this.units.set(r.i, []);
        continue;
      }
      this.units.set(r.i, list);
      if (d > NEAR || !w.isGenerated(r.x, r.z)) continue;
      const hostile = this.atWarWithPlayer(r.i) || [...this.wars].some(k => k.split(':').map(Number).includes(r.i));
      const mine = list.filter(u => u.rivalId === r.i);
      const folk = mine.filter(u => u.type === 'folk').length;
      const soldiers = mine.filter(u => u.type !== 'folk').length;
      const wantFolk = Math.min(6, Math.floor(r.pop / 5));
      const wantSoldiers = Math.min(MAX_DEFENDERS, Math.floor(r.army), hostile ? MAX_DEFENDERS : 3);
      // townsfolk go about their business; soldiers only fight whoever their town is at war with
      if (folk < wantFolk) this._spawnAround(r, 'folk', true);
      else if (soldiers < wantSoldiers) this._spawnAround(r, pick(soldierTypes(r.tier)), false);
    }
  }
  _spawnAround(r, type, peaceful) {
    const g = this.game;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, rr = 6 + Math.random() * 30;
      const x = Math.floor(r.x + Math.cos(a) * rr), z = Math.floor(r.z + Math.sin(a) * rr);
      if (!g.world.isGenerated(x, z)) continue;
      const y = g.underground?._standAt?.(x, r.y + 1, z, 6);
      if (y === null || y === undefined) continue;
      const u = this._spawnUnit(r, type, x + 0.5, z + 0.5, y, { peaceful, home: { x: r.x, z: r.z } });
      if (u) return u;
    }
    return null;
  }
  _spawnUnit(r, type, x, z, y, { peaceful = false, wanderer = true, home = null } = {}) {
    const W = this.game.waves; if (!W) return null;
    const T = ['rival_trooper', 'rival_rifleman'].includes(type) ? 1.2 : 1;
    const u = W.spawn(type, x, z, {
      y: y ?? undefined, emerge: false, cave: true, wanderer, sunproof: true, silent: true, rivalId: r.i, peaceful,
      wave: 3 + r.tier * 2, hpMul: (0.8 + r.tier * 0.12) * T, dmgMul: 0.8 + r.tier * 0.08,
      name: `${type === 'folk' ? 'Житель' : this._soldierName(type)} «${r.name}»`, hatColor: parseInt(r.color.slice(1), 16),
    });
    if (!u) return null;
    if (home) u.home = u.position.clone().set(home.x + 0.5, r.y + 1, home.z + 0.5);
    // the town's people (and field-battle attackers) exist while the player is near; raiders are tracked by their raid
    if (home) { let list = this.units.get(r.i); if (!list) this.units.set(r.i, list = []); list.push(u); }
    return u;
  }
  _soldierName(type) { return { militia: 'Ополченец', rival_guard: 'Стражник', rival_archer: 'Лучник', rival_knight: 'Рыцарь', rival_musketeer: 'Мушкетёр', rival_rifleman: 'Стрелок', rival_trooper: 'Штурмовик' }[type] || 'Воин'; }
  _clearUnits() { for (const l of this.units.values()) for (const u of l) { u.dead = true; u.removeAt = 0; } this.units.clear(); }

  /** Hooks from Zombie: a townsperson is hurt / killed. */
  onHurt(u, source) {
    const r = this.list[u.rivalId]; if (!r) return;
    const g = this.game;
    const byPlayer = source === g.player || source?.kind === 'player' || source?.owner === g.player || source?.user === g.player;
    if (byPlayer && !this.atWarWithPlayer(r.i) && r.owner !== 'player') this.declareWar(r, `Вы напали на людей «${r.name}» — это война!`);
  }
  onDeath(u) {
    const r = this.list[u.rivalId]; if (!r) return;
    if (u.type === 'folk') r.pop = Math.max(4, r.pop - 1);
    else if (!u.raider) r.army = Math.max(0, r.army - 1);
  }

  // ------------------------------------------------------------------ map markers, UI data, saves
  /** For the minimap / panel: one entry per town. */
  markers() {
    const c = this.game.world.size / 2;
    return this.list.map(r => ({
      r, x: r.x, z: r.z, name: r.name, color: r.color,
      status: r.owner === 'player' ? 'vassal' : this.atWarWithPlayer(r.i) ? 'war' : r.owner !== null ? 'subject' : 'peace',
      dist: Math.round(Math.hypot(r.x - c, r.z - c)), dir: dirName(r.x - c, r.z - c),
    }));
  }
  warsOf(i) { const out = []; for (const k of this.wars) { const [a, b] = k.split(':').map(Number); if (a === i) out.push(b); else if (b === i) out.push(a); } return out; }
  serialize() {
    return {
      list: this.list.map(r => {
        const o = { ...r };
        if (r.raid) { o.army = r.army + (r.raid.arrived ? r.raid.units.filter(u => !u.dead).length : r.raid.size); }
        delete o.raid; delete o.capT; delete o._capMsgT;
        return o;
      }),
      wars: [...this.wars],
    };
  }
  deserialize(o) {
    if (!o?.list) return;
    this._clearUnits();
    this.list = o.list.map(r => ({ ...r, raid: null }));
    this.wars = new Set(o.wars || []);
    this.plans.clear();
    for (const r of this.list) this._recount(r);
  }
}
