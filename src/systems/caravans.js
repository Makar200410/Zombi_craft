// Roads, caravans and trade between the villages (big worlds with rival towns, see rivals.js).
//
// Roads: every town is joined to the player's village and to its nearest neighbours by a winding dirt road
// (plank bridges over water), drawn into chunks as they are generated — from the seed alone, nothing is saved.
// Caravans: a merchant with a pack and a few guards walk those roads between towns at peace. Far from the player
// they are just a point moving along the road; near him they are real people. A caravan that reaches a town
// makes both richer; one that comes to the player's village stays by the town hall for a while to trade.
// The player can trade with them (and in a neighbour's town), escort them through the night for a reward —
// zombies go for caravans — or rob them, which means war with their town.
import { B, BLOCKS, LOG_BLOCKS, LEAF_BLOCKS, isWater } from '../core/blocks.js';
import { RESOURCE_LABELS } from '../core/items.js';
import { mulberry32 } from '../core/rng.js';
import { soldierTypes, pick } from './rivals.js';
import * as THREE from 'three';

const HOME = -1;
const SPEED = 1.9;                // blocks a second along the road
const NEAR = 120, FAR = 170;      // a caravan becomes people within NEAR of the player, numbers again beyond FAR
const MAX_CARAVANS = 6;
const HOME_END = 62, TOWN_END = 50;     // roads stop short of the village centres (their streets are their own)

/** What a town sells (resource, lot size, price in gold, from tier) and buys from the player. */
export const SELLS = [
  ['food', 20, 8, 1], ['iron', 10, 22, 2], ['coal', 10, 10, 2], ['crystal', 5, 35, 2], ['steel', 5, 45, 4], ['uranium', 2, 70, 8],
];
export const BUYS = [['wood', 20, 6, 1], ['stone', 20, 5, 1], ['food', 20, 6, 1], ['iron', 10, 15, 2], ['coal', 10, 6, 3]];
const LOTS = 3;                   // lots of each good per day (sold and bought)

const sideways = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };

export class Caravans {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.roads = [];        // [{a, b, pts: [[x, z]...]}]
    this.segs = [];         // road segments for drawing: {ax, az, bx, bz, x0, z0, x1, z1}
    this.ends = [];         // [x, z, r]: no road within r of a village centre
    this.nextId = 1;
    this.t = 0;
    const bus = game.bus;
    bus.on('world:ready', ({ world }) => this._attach(world));
    bus.on('game:begin', ({ loaded }) => { if (!loaded) this._init(); this._roadsLoaded(); });
    bus.on('time:dawn', () => this._restock());
  }

  get rivals() { return this.game.rivals; }
  get active() { return this.roads.length > 0; }

  // ------------------------------------------------------------------ roads
  _attach(world) {
    this.list = []; this.roads = []; this.segs = []; this.ends = [];
    const gen = world.gen;
    if (world.format < 4 || !gen?.sites?.length) return;
    this._makeRoads(world);
    world.decorators.push((cx, cz) => this._decorate(cx, cz));
  }
  /** Each town to the home village and to its two nearest neighbours; the roads wind a little, the same every time. */
  _makeRoads(world) {
    const gen = world.gen, sites = gen.sites;
    const nodes = new Map([[HOME, [gen.cx, gen.cz]]]);
    for (const s of sites) nodes.set(s.i, [s.x, s.z]);
    this.ends = [[gen.cx, gen.cz, HOME_END], ...sites.map(s => [s.x, s.z, TOWN_END])];
    const pairs = new Set();
    for (const s of sites) {
      pairs.add(HOME + ':' + s.i);
      const near = sites.filter(o => o !== s).map(o => [o.i, Math.hypot(o.x - s.x, o.z - s.z)]).filter(([, d]) => d < 720).sort((p, q) => p[1] - q[1]).slice(0, 2);
      for (const [j] of near) pairs.add(Math.min(s.i, j) + ':' + Math.max(s.i, j));
    }
    for (const key of pairs) {
      const [a, b] = key.split(':').map(Number);
      const A = nodes.get(a), Bp = nodes.get(b);
      const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), n = Math.max(4, Math.ceil(len / 20));
      const rnd = mulberry32((world.seed ^ ((a + 3) * 7919 + (b + 3) * 104729)) >>> 0);
      const [sx, sz] = sideways(A, Bp);
      const w1 = (rnd() - 0.5) * 70, w2 = (rnd() - 0.5) * 30, f2 = 2 + Math.floor(rnd() * 2), ph = rnd() * 6.28;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, env = Math.sin(Math.PI * t);
        const off = env * (w1 * Math.sin(Math.PI * t) + w2 * Math.sin(Math.PI * t * f2 * 2 + ph) * env);
        pts.push([Math.round(A[0] + (Bp[0] - A[0]) * t + sx * off), Math.round(A[1] + (Bp[1] - A[1]) * t + sz * off)]);
      }
      this.roads.push({ a, b, pts });
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        this.segs.push({ ax, az, bx, bz, x0: Math.min(ax, bx) - 3, z0: Math.min(az, bz) - 3, x1: Math.max(ax, bx) + 3, z1: Math.max(az, bz) + 3 });
      }
    }
  }
  _offRoad(x, z) { for (const [cx, cz, r] of this.ends) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true; return false; }
  /** New chunk: lay the road through it (a 3-wide dirt path on the ground, planks over water, trees cleared). */
  _decorate(cx, cz, touched = null) {
    const x0 = cx * 16, z0 = cz * 16, x1 = x0 + 16, z1 = z0 + 16;
    let cells = null;
    for (const s of this.segs) {
      if (s.x1 < x0 || s.x0 >= x1 || s.z1 < z0 || s.z0 >= z1) continue;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.ceil(len * 2);
      for (let k = 0; k <= n; k++) {
        const px = s.ax + (s.bx - s.ax) * k / n, pz = s.az + (s.bz - s.az) * k / n;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = Math.round(px + dx * 0.8), z = Math.round(pz + dz * 0.8);
          if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
          (cells || (cells = new Uint8Array(256)))[(x - x0) + (z - z0) * 16] = 1;
        }
      }
    }
    if (!cells) return false;
    const w = this.game.world, gen = w.gen, sea = w.sea;
    let drawn = false;
    for (let i = 0; i < 256; i++) {
      if (!cells[i]) continue;
      const x = x0 + (i & 15), z = z0 + (i >> 4);
      if (this._offRoad(x, z)) continue;
      const h = gen.column(x, z).h;
      // the ground: the highest solid block near the generator's height that is not a tree
      let y = -1;
      for (let yy = h + 4; yy >= h - 6; yy--) {
        const id = w.rawGet(x, yy, z);
        if (id && BLOCKS[id]?.solid && !LOG_BLOCKS.has(id) && !LEAF_BLOCKS.has(id)) { y = yy; break; }
        if (isWater(id)) break;
      }
      const wet = isWater(w.rawGet(x, Math.max(y, h) + 1, z)) || isWater(w.rawGet(x, sea, z));
      const set = (yy, id) => { w.rawSet(x, yy, z, id); if (touched) touched.push(x, yy, z); };
      if (wet) {
        set(sea + 1, B.PLANKS);
        for (let yy = sea + 2; yy < sea + 6; yy++) if (w.rawGet(x, yy, z)) set(yy, 0);
      } else if (y > 0) {
        set(y, B.PATH);
        for (let yy = y + 1; yy < y + 16; yy++) {
          const id = w.rawGet(x, yy, z);
          if (id && (!BLOCKS[id]?.solid || LOG_BLOCKS.has(id) || LEAF_BLOCKS.has(id))) set(yy, 0);
        }
      }
      drawn = true;
    }
    return drawn;
  }
  /** At the start: roads through the chunks that already exist. */
  _roadsLoaded() {
    const w = this.game.world; if (!w || !this.segs.length) return;
    const N = w.chunksX;
    for (const k of w.loaded) {
      const cx = k % N, cz = (k / N) | 0;
      const touched = [];
      if (!this._decorate(cx, cz, touched)) continue;
      w.relightBox(cx * 16, cz * 16, cx * 16 + 15, cz * 16 + 15);
      for (let q = 0; q < touched.length; q += 3) w.markDirty(touched[q], touched[q + 1], touched[q + 2]);
    }
  }

  // ------------------------------------------------------------------ caravans
  _init() {
    this.list = [];
    const R = this.rivals; if (!R?.active) return;
    for (const r of R.list) { r.caravanT = 60 + Math.random() * 240; r.favor = 0; }
    this._restock();
  }
  _restock() {
    const R = this.rivals; if (!R?.active) return;
    for (const r of R.list) { r.stock = {}; for (const [res] of SELLS) r.stock['s_' + res] = LOTS; for (const [res] of BUYS) r.stock['b_' + res] = LOTS; }
    this.game.bus.emit('rivals:changed', {});
  }
  _road(a, b) {
    const rd = this.roads.find(q => (q.a === a && q.b === b) || (q.a === b && q.b === a));
    if (!rd) return null;
    const pts = rd.a === a ? rd.pts : [...rd.pts].reverse();
    return pts;
  }
  /** Home village trading spot: in front of the town hall. */
  _homeSpot() {
    const th = this.game.village?.townHall;
    const c = th?.center || { x: this.game.world.size / 2, z: this.game.world.size / 2 };
    return [Math.round(c.x), Math.round(c.z + (th ? th.d / 2 + 4 : 6))];
  }
  _launch(r) {
    const R = this.rivals, g = this.game;
    const dests = [];
    if (r.owner === 'player' || (!R.atWarWithPlayer(r.i) && r.owner === null)) dests.push([HOME, 3]);
    for (const o of R.list) if (o !== r && !R.atWar(r.i, o.i) && this._road(r.i, o.i)) dests.push([o.i, 1]);
    if (!dests.length) return;
    const to = pick(dests);
    const pts = this._road(r.i, to);
    if (!pts) return;
    if (to === HOME) pts[pts.length - 1] = this._homeSpot();
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const guards = Math.min(3, 1 + Math.floor(r.tier / 3));
    const c = { id: this.nextId++, from: r.i, to, pts, cum, len: cum[cum.length - 1], d: TOWN_END * 0.6, state: 'go', wait: 0, guards, esc: 0, units: null, tier: r.tier };
    this.list.push(c);
    if (to === HOME) g.bus.emit('toast', { text: `Караван «${r.name}» вышел к вам по дороге — его можно проводить или встретить у ратуши`, kind: 'info' });
    g.bus.emit('rivals:changed', {});
  }
  /** Where along its road the caravan is (x, z) at distance d. */
  posAt(c, d) {
    const { pts, cum } = c;
    d = Math.max(0, Math.min(c.len, d));
    let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
    const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, Math.atan2(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])];
  }
  townOf(c) { return this.rivals.get(c.from); }
  /** The caravan from town i trading at the home village now, if any. */
  atHome(i) { return this.list.find(c => c.from === i && c.to === HOME && c.state === 'trade') || null; }

  update(dt) {
    const g = this.game;
    if (!this.roads.length || !g.running || g.net?.isClient) return;
    this._lead(dt);
    this.t += dt;
    if (this.t < 0.5) return;
    const step = this.t; this.t = 0;
    const R = this.rivals;
    for (const r of R.list) {
      if (r.caravanT === undefined) r.caravanT = 120;
      r.caravanT -= step * (r.drive || 1);
      if (r.caravanT <= 0) {
        r.caravanT = 260 + Math.random() * 260;
        if (this.list.length < MAX_CARAVANS && !this.list.some(c => c.from === r.i)) this._launch(r);
      }
    }
    for (const c of [...this.list]) this._step(c, step);
  }
  _step(c, dt) {
    const g = this.game, R = this.rivals, r = this.townOf(c), p = g.player?.position;
    if (!r) { this._remove(c); return; }
    // the road is closed by a war: the caravan turns back (simply goes away)
    if (c.state === 'go' && (c.to === HOME ? R.atWarWithPlayer(r.i) : R.atWar(r.i, c.to))) { this._remove(c); return; }
    const [x, z] = c.state === 'trade' ? c.pts[c.pts.length - 1] : this.posAt(c, c.d);
    const dist = p ? Math.hypot(p.x - x, p.z - z) : 1e9;
    if (!c.units && dist < NEAR && g.world.isGenerated(x, z)) this._materialize(c, x, z);
    else if (c.units && dist > FAR) this._dematerialize(c);
    if (c.units && dist < 28) c.esc += dt;
    if (c.state === 'trade') {
      c.wait -= dt;
      if (c.wait <= 0) { if (dist < 60) g.bus.emit('toast', { text: `Караван «${r.name}» уходит домой`, kind: 'info' }); this._remove(c); }
      return;
    }
    // people halt while they fight, or while the merchant lags behind
    let halt = false;
    if (c.units) {
      const m = c.units.find(u => u.trader && !u.dead);
      if (!m) { this._remove(c); return; }
      for (const u of c.units) if (!u.dead && u.target) halt = true;
      const [lx, lz] = this.posAt(c, c.d);
      if (Math.hypot(m.position.x - lx, m.position.z - lz) > 7) halt = true;
    } else if (g.state.isNight && Math.random() < 0.0005 * dt * 60) {
      // nobody to protect it: on a long night road a caravan may fall to the dead
      if (c.to === HOME) g.bus.emit('toast', { text: `Караван «${r.name}» не дошёл: ночью на него напали зомби`, kind: 'warn' });
      this._remove(c); return;
    }
    if (!halt) c.d += SPEED * dt;
    if (c.d >= c.len - (c.to === HOME ? 0 : TOWN_END * 0.6)) this._arrive(c);
  }
  _arrive(c) {
    const g = this.game, r = this.townOf(c), R = this.rivals;
    const reward = c.esc > 40 && c.units ? 10 + c.tier * 6 : 0;
    if (reward) {
      g.state.stats.escorts = (g.state.stats.escorts || 0) + 1;
      g.state.add('gold', reward);
      r.favor = Math.min(5, (r.favor || 0) + 1);
      g.bus.emit('toast', { text: `Вы проводили караван «${r.name}»: +${reward} золота, «${r.name}» доверяет вам больше (скидка ${r.favor * 4}%)`, kind: 'good' });
    }
    if (c.to === HOME) {
      c.state = 'trade'; c.wait = 150; c.d = c.len;
      r.wealth += 10 * c.tier;
      g.bus.emit('toast', { text: `Караван «${r.name}» пришёл в деревню: торговец ждёт у ратуши (≈2,5 мин)`, kind: 'good' });
      g.audio?.play?.('quest_done', { volume: 0.5 });
      g.bus.emit('rivals:changed', {});
      return;
    }
    const o = R.get(c.to);
    if (o) { o.wealth += 30 * c.tier; r.wealth += 30 * c.tier; }
    this._remove(c);
  }
  _remove(c) {
    this._dematerialize(c);
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    this.game.bus.emit('rivals:changed', {});
  }

  // ------------------------------------------------------------------ the people of a caravan
  _materialize(c, x, z) {
    const R = this.rivals, r = this.townOf(c), g = this.game;
    const types = ['merchant'];
    for (let k = 0; k < c.guards; k++) types.push(pick(soldierTypes(r.tier)));
    c.units = [];
    types.forEach((type, k) => {
      const [ox, oz] = this._slot(c, k);
      const px = Math.floor(x + ox), pz = Math.floor(z + oz);
      const y = g.underground?._standAt?.(px, g.world.heightAt(px, pz) + 1, pz, 10);
      if (y === null || y === undefined) return;
      const u = R._spawnUnit(r, type, px + 0.5, pz + 0.5, y, { peaceful: type === 'merchant', wanderer: false });
      if (!u) return;
      u.caravan = c; u.lead = { x: px + 0.5, z: pz + 0.5 };
      if (type === 'merchant') { u.trader = true; u.name = `Торговец «${r.name}»`; this._pack(u); }
      c.units.push(u);
    });
    if (!c.units.some(u => u.trader)) this._dematerialize(c);
  }
  /** Merchant's pack: a crate of goods on his back. */
  _pack(u) {
    const crate = new THREE.Mesh(this._crateGeo || (this._crateGeo = new THREE.BoxGeometry(0.62, 0.6, 0.42)), this._crateMat || (this._crateMat = new THREE.MeshLambertMaterial({ color: 0x9a6a3a })));
    crate.position.set(0, 1.15, -0.32);
    crate.castShadow = true;
    u.object3d.add(crate);
  }
  _dematerialize(c) {
    if (!c.units) return;
    let guards = 0;
    for (const u of c.units) { if (!u.dead && !u.trader) guards++; if (!u.dead) { u.dead = true; u.removeAt = 0; u.object3d.visible = false; } }
    if (c.units.some(u => u.trader)) c.guards = guards;
    c.units = null;
  }
  /** Formation: the merchant in the middle, guards ahead and behind; at the village, around the trading spot. */
  _slot(c, k) {
    if (c.state === 'trade') { const a = k * 2.1; return k ? [Math.cos(a) * 3.5, Math.sin(a) * 3.5] : [0, 0]; }
    return [0, 0];
  }
  _lead() {
    for (const c of this.list) {
      if (!c.units) continue;
      c.units.forEach((u, k) => {
        if (u.dead) return;
        let x, z;
        if (c.state === 'trade') { const e = c.pts[c.pts.length - 1], [ox, oz] = this._slot(c, k); x = e[0] + 0.5 + ox; z = e[1] + 0.5 + oz; }
        else {
          const along = k === 0 ? 0 : k % 2 ? 3 + k : -2 - k, side = k === 0 ? 0 : (k % 2 ? 1 : -1) * 1.2;
          const [px, pz, a] = this.posAt(c, c.d + 2 + along);
          x = px + Math.cos(a) * side; z = pz - Math.sin(a) * side;
        }
        u.lead.x = x; u.lead.z = z;
      });
    }
  }
  /** Hook from Rivals.onDeath: a caravan's merchant or guard fell. */
  onDeath(u, source) {
    const c = u.caravan; if (!c || !this.list.includes(c)) return;
    if (!u.trader) { c.guards = Math.max(0, c.guards - 1); return; }
    const g = this.game, r = this.townOf(c);
    const byPlayer = source === g.player || source?.owner === g.player || source?.user === g.player || source?.kind === 'player';
    if (byPlayer) {
      // the loot: some of each good the town trades in
      const loot = { gold: 15 + c.tier * 8 };
      for (const [res, n, , t] of SELLS) if (r && r.tier >= t) loot[res] = Math.round(n * 0.6);
      g.state.addAll(loot);
      g.state.stats.robberies = (g.state.stats.robberies || 0) + 1;
      g.bus.emit('toast', { text: `Караван ограблен: ${Object.entries(loot).map(([k, n]) => `${RESOURCE_LABELS[k] || k} +${n}`).join(', ')}`, kind: 'warn' });
    } else if (r) g.bus.emit('toast', { text: `Торговец «${r.name}» погиб в дороге`, kind: 'warn' });
    for (const o of c.units || []) if (o !== u && !o.dead && !o.target) { o.dead = true; o.removeAt = 0; o.object3d.visible = false; }
    c.units = null;
    this._remove(c);
  }

  // ------------------------------------------------------------------ trade
  /** Can the player trade with town r now? Returns '' when yes, else why not. */
  whyNoTrade(r) {
    const R = this.rivals, p = this.game.player?.position;
    if (R.atWarWithPlayer(r.i)) return 'С врагами не торгуют';
    if (this.atHome(r.i)) return '';
    if (p && Math.hypot(p.x - r.x, p.z - r.z) < 80) return '';
    if (p && this.list.some(c => c.from === r.i && c.units?.some(u => u.trader && !u.dead && u.position.distanceTo(p) < 10))) return '';
    return 'Торговать можно с караваном у вашей ратуши или в самой деревне';
  }
  priceMul(r) { return (r.owner === 'player' ? 0.7 : 1) * (1 - 0.04 * (r.favor || 0)); }
  sellPrice(r, price) { return Math.max(1, Math.round(price * this.priceMul(r))); }
  buyPrice(r, price) { return Math.max(1, Math.round(price * (2 - this.priceMul(r)) * 0.9)); }
  /** The player buys a lot of res from town r. */
  buy(r, res) {
    const o = SELLS.find(s => s[0] === res), st = this.game.state;
    if (!o || r.tier < o[3] || this.whyNoTrade(r) || !(r.stock?.['s_' + res] > 0)) return false;
    const price = this.sellPrice(r, o[2]);
    if (!st.spend({ gold: price })) { this.game.bus.emit('toast', { text: 'Не хватает золота', kind: 'bad' }); return false; }
    st.add(res, o[1]); r.stock['s_' + res]--; r.wealth += price; st.stats.trades = (st.stats.trades || 0) + 1;
    this.game.audio?.play?.('coins', { volume: 0.6 });
    return true;
  }
  /** The player sells a lot of res to town r. */
  sell(r, res) {
    const o = BUYS.find(s => s[0] === res), st = this.game.state;
    if (!o || r.tier < o[3] || this.whyNoTrade(r) || !(r.stock?.['b_' + res] > 0)) return false;
    if (!st.spend({ [res]: o[1] })) { this.game.bus.emit('toast', { text: `Не хватает: ${RESOURCE_LABELS[res] || res}`, kind: 'bad' }); return false; }
    const price = this.buyPrice(r, o[2]);
    st.add('gold', price); r.stock['b_' + res]--; st.stats.trades = (st.stats.trades || 0) + 1;
    this.game.audio?.play?.('coins', { volume: 0.6 });
    return true;
  }

  /** For the minimap: caravans on the road. */
  markers() { return this.list.map(c => { const [x, z] = c.state === 'trade' ? c.pts[c.pts.length - 1] : this.posAt(c, c.d); return { x, z, color: this.townOf(c)?.color || '#fff', home: c.to === HOME }; }); }
  /** A line for the «Соседи» panel. */
  status(i) {
    const c = this.list.find(q => q.from === i); if (!c) return '';
    if (c.state === 'trade') return `Караван торгует у вашей ратуши ещё ~${Math.ceil(c.wait)} с`;
    const R = this.rivals, to = c.to === HOME ? 'к вам' : `в «${R.get(c.to)?.name || '?'}»`;
    return `Караван идёт ${to}: пройдено ${Math.round(c.d / c.len * 100)}%`;
  }

  serialize() {
    return { nextId: this.nextId, list: this.list.map(c => ({ ...c, units: null })) };
  }
  deserialize(o) {
    for (const c of this.list) this._dematerialize(c);
    this.list = (o?.list || []).filter(c => c.pts && c.cum).map(c => ({ ...c, units: null }));
    this.nextId = o?.nextId || 1;
  }
}
