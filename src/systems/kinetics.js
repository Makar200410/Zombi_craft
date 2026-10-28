// Mechanisms (in the spirit of the Create mod): rotation made by a water wheel, a windmill or a steam engine runs
// along shafts and cogwheels to machines that automate the village's work:
//   mechanical drill  — bores straight away from its power input (a shaft above it digs a mine shaft down), up to
//                       DRILL_RANGE blocks (DRILL_DOWN downwards), everything it breaks goes to the village stock, it shreds zombies;
//   mechanical saw    — fells the whole tree in front of it, wood to the stock, cuts zombies;
//   crusher           — grinds iron and gold ore from the stock into metal (with a bonus now and then);
//   fan               — blows zombies away along its front;
//   conveyor belt     — carries whatever stands on it (zombies into a saw, the player along a hall), passes rotation on;
//   mechanical piston — right-click to extend / retract: pushes and pulls the structure glued in front of it (built
//                       blocks, up to MAX_GLUE), and whoever stands on it — lifts into the mine, drawbridges, gates;
//   tunnel drill      — bores its own tunnel to the nearest ore within ORE_SEEK blocks, mines the vein, looks for
//                       the next one; it leaves a shaft behind, so it never loses its power.
// Belts, pistons and tunnel drills face the way they were placed (kept in `faces`, saved with the world).
// Blocks touching each other form a network. Every source adds capacity (сила) and a speed (об/мин); every machine
// adds stress (нагрузка). A network carrying more stress than capacity stalls. Machines take rotation on one side
// and work on the opposite one. The host runs the work; everyone sees the moving parts.
import * as THREE from 'three';
import { B, BLOCKS, WATER_IDS, WATER_LEVEL, LOG_BLOCKS, LEAF_BLOCKS, PALETTE, ORE_BLOCKS } from '../core/blocks.js';
import { RESOURCE_LABELS } from '../core/items.js';
import { worldUniforms } from '../render/chunkMaterials.js';

const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MAX_EXT = 32;           // piston reach
const MAX_GLUE = 128;         // blocks a piston can move
const ORE_SEEK = 20;          // a tunnel drill looks for ore this far
const TUNNEL_MAX = 160;       // and gives up after boring this many blocks
const DRILL_RANGE = 24;       // sideways; boring straight down a drill reaches DRILL_DOWN
const DRILL_DOWN = 64;
const VIEW = 80;              // moving parts are drawn this far from the camera
const TICK = 0.25;

// role of each mechanism: capacity / speed of sources, stress of machines
export const KINETIC = {
  [B.SHAFT]: { role: 'shaft' },
  [B.COGWHEEL]: { role: 'shaft' },
  [B.WATER_WHEEL]: { role: 'source' },
  [B.WINDMILL]: { role: 'source' },
  [B.STEAM_ENGINE]: { role: 'source' },
  [B.MECH_DRILL]: { role: 'machine', stress: 4 },
  [B.MECH_SAW]: { role: 'machine', stress: 3 },
  [B.CRUSHER]: { role: 'machine', stress: 6 },
  [B.MECH_FAN]: { role: 'machine', stress: 2 },
  [B.BELT]: { role: 'shaft', stress: 0.5 },
  [B.MECH_PISTON]: { role: 'machine', stress: 4 },
  [B.TUNNEL_DRILL]: { role: 'machine', stress: 6 },
  [B.DYNAMO]: { role: 'machine', stress: 4 },
};
export const MECH_HELP = {
  [B.SHAFT]: 'Вал: передаёт вращение соседним механизмам.',
  [B.COGWHEEL]: 'Шестерня: передаёт вращение, как вал.',
  [B.WATER_WHEEL]: 'Водяное колесо: крутится, если рядом вода (с течением — вдвое сильнее). Сила 4–8, 16–32 об/мин.',
  [B.WINDMILL]: 'Ветряк: нужен открытый небосвод, чем выше — тем сильнее. Сила 2–8, 12–32 об/мин.',
  [B.STEAM_ENGINE]: 'Паровой двигатель: жжёт уголь со склада (1 за 20 с). Сила 16, 64 об/мин.',
  [B.MECH_DRILL]: `Механический бур: бурит в сторону, противоположную валу, до ${DRILL_RANGE} блоков; вал сверху — роет шахту вниз до ${DRILL_DOWN} блоков. Добыча идёт на склад. Нагрузка 4.`,
  [B.MECH_SAW]: 'Механическая пила: валит целое дерево перед собой, древесина на склад. Нагрузка 3.',
  [B.CRUSHER]: 'Дробилка: перемалывает железную и золотую руду со склада в металл. Нагрузка 6.',
  [B.MECH_FAN]: 'Вентилятор: отбрасывает зомби перед собой на 8 блоков. Нагрузка 2.',
  [B.BELT]: 'Конвейер: везёт всё, что на нём стоит, туда, куда вы смотрели, ставя его; передаёт вращение дальше. Нагрузка 0,5.',
  [B.MECH_PISTON]: `Механический поршень: ПКМ — выдвинуть / втянуть (нужно вращение). Двигает склеенную постройку перед собой (до ${MAX_GLUE} блоков) и тех, кто на ней стоит: лифт в шахту, выдвижной мост. Смотрит на вас, когда ставите. Нагрузка 4.`,
  [B.TUNNEL_DRILL]: `Бур-проходчик: сам прокладывает туннель к ближайшей руде (до ${ORE_SEEK} блоков), выбирает жилу на склад и ищет следующую; оставляет за собой вал. Нагрузка 6.`,
};
// what a piston can glue and move: built blocks (not the natural ground)
const GLUE = new Set([...PALETTE, B.CASING].filter(id => ![B.DIRT, B.SAND, B.GRAVEL, B.PATH].includes(id)));
const FACED = new Set([B.BELT, B.MECH_PISTON, B.TUNNEL_DRILL]);
const DRILLER = { faction: 'village', kinetic: true };       // breaks blocks for the village (drops go to the stock)
const NOT_DRILLABLE = new Set([B.BEDROCK, B.SPAWNER, B.CHEST]);

export class Kinetics {
  constructor(game) {
    this.game = game;
    this.nodes = new Map();     // world index -> node {x, y, z, id, role, net, dir, prog, head}
    this.nets = [];
    this.dirty = true;
    this.t = 0; this.srcT = 0;
    this.view = null;
    this.faces = new Map();     // world index -> DIR6 index, for belts, pistons and tunnel drills
    this.pistons = new Map();   // world index -> {ext, want, t}
    this.drills = new Map();    // world index -> tunnel drill state {target, moves, prog, cool}
    const bus = game.bus;
    bus.on('block:changed', ({ x, y, z, id, prev }) => {
      if (!KINETIC[id] && !KINETIC[prev]) return;
      const i = this.game.world.index(x, y, z);
      if (KINETIC[id]) this.nodes.set(i, { x, y, z, id, role: KINETIC[id].role, prog: 0, head: 1 });
      else { this.nodes.delete(i); if (!this._moving) { this.faces.delete(i); this.pistons.delete(i); this.drills.delete(i); } }
      this.dirty = true;
    });
    bus.on('block:placed', ({ x, y, z, id, by }) => { if (by === 'player' && FACED.has(id)) { this.faces.set(this.game.world.index(x, y, z), this._lookFace(id)); this.dirty = true; } });
    bus.on('game:begin', ({ loaded } = {}) => { if (!loaded) { this.faces.clear(); this.pistons.clear(); } this.drills.clear(); this._scan(); });
  }
  /** Facing of a block the player puts down: belts and drills along the look, pistons toward the player. */
  _lookFace(id) {
    const f = this.game.cameraRig?.forward || { x: 0, y: 0, z: 1 };
    let ax = Math.abs(f.x), ay = Math.abs(f.y), az = Math.abs(f.z);
    if (id === B.BELT) ay = 0;
    let k = ax >= ay && ax >= az ? (f.x > 0 ? 0 : 1) : ay >= az ? (f.y > 0 ? 2 : 3) : (f.z > 0 ? 4 : 5);
    if (id === B.MECH_PISTON) k ^= 1;
    return k;
  }
  faceOf(n) { return this.faces.get(this.game.world.index(n.x, n.y, n.z)) ?? (n.id === B.MECH_PISTON ? 2 : 4); }
  serialize() {
    return { faces: [...this.faces], pistons: [...this.pistons].map(([i, p]) => [i, p.ext, p.want ? 1 : 0]) };
  }
  deserialize(o) {
    this.faces = new Map(o?.faces || []);
    this.pistons = new Map((o?.pistons || []).map(([i, ext, want]) => [i, { ext, want: !!want, t: 0 }]));
  }

  /** All mechanisms of the world come from its edits (they are only ever placed). */
  _scan() {
    this.nodes.clear();
    const w = this.game.world, ch = w?.changes;
    if (ch) {
      const S = w.size;
      for (const [i, id] of ch) if (KINETIC[id]) {
        const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S));
        this.nodes.set(i, { x, y, z, id, role: KINETIC[id].role, prog: 0, head: 1 });
      }
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------------ networks
  _rebuild() {
    this.dirty = false;
    const w = this.game.world;
    for (const n of this.nodes.values()) { n.net = null; n.dir = null; }
    this.nets = [];
    // shafts and sources carry rotation; each machine hangs on the first network next to it (machines pass nothing on)
    const mk = () => ({ nodes: [], sources: [], machines: [], cap: 0, stress: 0, rpm: 0, angle: 0, over: false });
    for (const start of this.nodes.values()) {
      if (start.net || start.role === 'machine') continue;
      const net = mk(), stack = [start];
      start.net = net;
      while (stack.length) {
        const n = stack.pop();
        net.nodes.push(n);
        if (n.role === 'source') net.sources.push(n);
        for (const [dx, dy, dz] of DIR6) {
          const m = this.nodes.get(w.index(n.x + dx, n.y + dy, n.z + dz));
          if (!m || m.net) continue;
          m.net = net;
          if (m.role === 'machine') { net.nodes.push(m); net.machines.push(m); } else stack.push(m);
        }
      }
      this.nets.push(net);
    }
    for (const n of this.nodes.values()) if (!n.net) { const net = mk(); n.net = net; net.nodes.push(n); net.machines.push(n); this.nets.push(net); }
    // a machine works on the side opposite its power input
    for (const n of this.nodes.values()) {
      if (n.role !== 'machine' && n.id !== B.WINDMILL) continue;
      for (const [dx, dy, dz] of DIR6) {
        const m = this.nodes.get(w.index(n.x + dx, n.y + dy, n.z + dz));
        if (m && m.role !== 'machine' && m.net === n.net) { n.dir = [-dx, -dy, -dz]; break; }
      }
      if (!n.dir && n.id === B.WINDMILL) n.dir = [0, 0, 1];
      if (FACED.has(n.id) && !n.dir) n.dir = DIR6[this.faceOf(n)];
    }
    this._hasBelts = false;
    for (const n of this.nodes.values()) if (n.id === B.BELT) { this._hasBelts = true; break; }
    this.srcT = 0;
    this.view?.invalidate();
  }

  /** Capacity and speed of each source right now. */
  _sourcePower(n, dt) {
    const g = this.game, w = g.world;
    if (!w.isGenerated(n.x, n.z)) return null;
    if (n.id === B.WATER_WHEEL) {
      let water = 0, flowing = 0;
      for (const [dx, dy, dz] of DIR6) {
        const id = w.getBlock(n.x + dx, n.y + dy, n.z + dz);
        if (WATER_IDS[id]) { water++; if (id === B.WATER_FALL || WATER_LEVEL[id] > 0) flowing++; }
      }
      if (!water) return null;
      return flowing ? { cap: 8, rpm: 32 } : { cap: 4, rpm: 16 };
    }
    if (n.id === B.WINDMILL) {
      if ((w.getLight(n.x, n.y + 1, n.z) >> 4) < 15) return null;        // needs the open sky
      const h = Math.max(0, Math.min(1, (n.y - w.sea) / 40));
      const storm = g.weather?.storm || 0;
      return { cap: Math.round(2 + h * 4 + storm * 2), rpm: Math.round(12 + h * 16 + storm * 4) };
    }
    if (n.id === B.STEAM_ENGINE) {
      // burns coal from the village stock while its network has work to do
      if (n.fuel > 0) { n.fuel -= dt; return { cap: 16, rpm: 64 }; }
      if (!n.net?.nodes.some(q => KINETIC[q.id].stress) || g.net?.isClient) return n.burning ? { cap: 16, rpm: 64 } : null;
      if (g.state.spend({ coal: 1 })) { n.fuel = 20; n.burning = true; return { cap: 16, rpm: 64 }; }
      n.burning = false;
      return null;
    }
    return null;
  }

  _updateSources(dt) {
    for (const net of this.nets) {
      let cap = 0, rpm = 0;
      for (const s of net.sources) { const p = this._sourcePower(s, dt); s.on = !!p; if (p) { cap += p.cap; rpm = Math.max(rpm, p.rpm); } }
      let stress = 0;
      for (const m of net.nodes) stress += KINETIC[m.id].stress || 0;
      net.cap = cap; net.stress = stress; net.over = stress > cap && cap > 0;
      net.rpm = cap > 0 && !net.over ? rpm : 0;
    }
  }

  update(dt) {
    const g = this.game;
    if (!g.world || !g.running) return;
    if (this.dirty) this._rebuild();
    this.srcT -= dt;
    if (this.srcT <= 0) { this.srcT = 1; this._updateSources(1); }
    for (const net of this.nets) net.angle = (net.angle + net.rpm / 60 * Math.PI * 2 * dt) % (Math.PI * 200);
    this._belts(dt);
    if (!g.net?.isClient) {
      this.t += dt;
      if (this.t >= TICK) { const step = this.t; this.t = 0; this._work(step); }
    }
    if (g.renderer?.scene) { if (!this.view) this.view = new KineticsView(this); this.view.update(dt); }
  }

  // ------------------------------------------------------------------ machines at work
  _work(dt) {
    const g = this.game, w = g.world;
    for (const net of this.nets) {
      if (net.rpm <= 0) continue;
      const k = net.rpm / 32;
      for (const m of net.machines) {
        if (!m.dir || !w.isGenerated(m.x, m.z)) continue;
        if (m.id === B.MECH_DRILL) this._drill(m, k, dt);
        else if (m.id === B.MECH_SAW) this._saw(m, k, dt);
        else if (m.id === B.CRUSHER) this._crush(m, k, dt);
        else if (m.id === B.MECH_FAN) this._fan(m, k, dt);
        else if (m.id === B.MECH_PISTON) this._piston(m, k, dt);
        else if (m.id === B.TUNNEL_DRILL) this._tunnel(m, k, dt);
      }
    }
  }
  _drill(m, k, dt) {
    const w = this.game.world, v = this.game.village, [dx, dy, dz] = m.dir;
    const range = dy < 0 ? DRILL_DOWN : DRILL_RANGE;
    for (let d = 1; d <= range; d++) {
      const x = m.x + dx * d, y = m.y + dy * d, z = m.z + dz * d;
      if (!w.inBounds(x, y, z) || !w.isGenerated(x, z)) { m.head = d; m.stuck = true; return; }
      const id = w.getBlock(x, y, z);
      if (id === B.AIR || WATER_IDS[id] || (BLOCKS[id] && !BLOCKS[id].solid && BLOCKS[id].shape !== 'cross')) continue;
      m.head = d;
      // never into the village's buildings, other machines or what can't be broken
      let building = null; try { building = v?.buildingAt?.(x, y, z) || null; } catch (e) { building = null; }
      if (building || KINETIC[id] || NOT_DRILLABLE.has(id) || !isFinite(BLOCKS[id]?.hardness)) { m.stuck = true; return; }
      m.stuck = false;
      w.hitBlock(x, y, z, 2.6 * k * dt, DRILLER);
      this._hurt(x + 0.5 - dx, y + 0.5 - dy, z + 0.5 - dz, 1.2, 10 * k * dt);
      return;
    }
    m.head = range; m.stuck = true;
  }
  _saw(m, k, dt) {
    const w = this.game.world, [dx, dy, dz] = m.dir;
    const x = m.x + dx, y = m.y + dy, z = m.z + dz;
    this._hurt(x + 0.5, y + 0.5, z + 0.5, 1.1, 14 * k * dt);
    if (!LOG_BLOCKS.has(w.getBlock(x, y, z))) { m.prog = 0; return; }
    m.prog += k * dt;
    if (m.prog < 2.5) return;
    m.prog = 0;
    // fell the tree: every log connected to this one (and the leaves right around them drop away)
    const seen = new Set(), stack = [[x, y, z]], logs = [];
    while (stack.length && logs.length < 80) {
      const [cx, cy, cz] = stack.pop();
      const key = w.index(cx, cy, cz);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!LOG_BLOCKS.has(w.getBlock(cx, cy, cz))) continue;
      logs.push([cx, cy, cz]);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (let oy = 0; oy <= 1; oy++) if (ox || oy || oz) stack.push([cx + ox, cy + oy, cz + oz]);
    }
    for (const [lx, ly, lz] of logs) w.breakBlock(lx, ly, lz, DRILLER);
    let leaves = 0;
    for (const [lx, ly, lz] of logs) for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) for (let oy = -1; oy <= 2; oy++) {
      if (leaves > 160) break;
      if (LEAF_BLOCKS.has(w.getBlock(lx + ox, ly + oy, lz + oz))) { w.setBlock(lx + ox, ly + oy, lz + oz, B.AIR); leaves++; }
    }
    if (logs.length) this.game.audio?.play('chop', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.8 });
  }
  _crush(m, k, dt) {
    const st = this.game.state;
    m.prog += k * dt;
    if (m.prog < 2) return;
    m.prog = 0;
    for (const [ore, metal] of [['iron_ore', 'iron'], ['gold_ore', 'gold']]) {
      if (st.spend({ [ore]: 1 })) { st.add(metal, Math.random() < 0.25 ? 2 : 1); return; }
    }
  }
  _fan(m, k, dt) {
    const w = this.game.world, [dx, dy, dz] = m.dir;
    let len = 0;
    for (let d = 1; d <= 8; d++) { if (w.isSolid(m.x + dx * d, m.y + dy * d, m.z + dz * d)) break; len = d; }
    if (!len) return;
    const cx = m.x + 0.5 + dx * (len + 1) / 2, cy = m.y + 0.5 + dy * (len + 1) / 2, cz = m.z + 0.5 + dz * (len + 1) / 2;
    const hx = dx ? len / 2 + 0.5 : 0.9, hy = dy ? len / 2 + 0.5 : 1.4, hz = dz ? len / 2 + 0.5 : 0.9;
    for (const z of this.game.waves?.zombies || []) {
      if (z.dead) continue;
      const p = z.position;
      if (Math.abs(p.x - cx) > hx || Math.abs(p.y + 0.8 - cy) > hy || Math.abs(p.z - cz) > hz) continue;
      z.velocity.x += dx * 22 * k * dt; z.velocity.y += dy * 22 * k * dt; z.velocity.z += dz * 22 * k * dt;
    }
  }
  // ------------------------------------------------------------------ belts
  /** Whatever stands on a moving belt rides along (the player on every machine, the rest on the host). */
  _belts(dt) {
    const g = this.game, w = g.world;
    if (!this._hasBelts) return;
    const host = !g.net?.isClient;
    for (const e of g.entities.list) {
      if (e.dead || e.kind === 'projectile' || (!host && e !== g.player) || e.flying || e.fly) continue;
      const p = e.position, x = Math.floor(p.x), y = Math.floor(p.y - 0.08), z = Math.floor(p.z);
      if (p.y - (y + 1) > 0.25 || w.getBlock(x, y, z) !== B.BELT) continue;
      const n = this.nodes.get(w.index(x, y, z));
      if (!n?.net?.rpm) continue;
      const [dx, , dz] = DIR6[this.faceOf(n)], s = 2.4 * n.net.rpm / 32 * dt;
      const nx = p.x + dx * s, nz = p.z + dz * s;
      if (w.isSolid(Math.floor(nx + dx * (e.radius || 0.3)), Math.floor(p.y + 0.1), Math.floor(nz + dz * (e.radius || 0.3)))) continue;
      p.x = nx; p.z = nz;
      // keep riders in the middle of the belt
      if (dx) p.z += (z + 0.5 - p.z) * Math.min(1, dt * 3); else p.x += (x + 0.5 - p.x) * Math.min(1, dt * 3);
    }
  }

  // ------------------------------------------------------------------ pistons
  /** Right-click on a mechanism: a piston toggles, the others explain themselves. */
  interact(x, y, z) {
    const w = this.game.world, i = w.index(x, y, z);
    if (w.getBlock(x, y, z) !== B.MECH_PISTON) return this.describe(x, y, z);
    let st = this.pistons.get(i);
    if (!st) this.pistons.set(i, st = { ext: 0, want: false, t: 0 });
    st.want = !st.want; st.blocked = null;
    if (this.dirty) this._rebuild();
    const n = this.nodes.get(i), on = n?.net?.rpm > 0;
    this.game.audio?.play('hammer', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.5, pitch: 0.7 });
    return (st.want ? 'Поршень выдвигается' : 'Поршень втягивается') + (on ? '' : ' — когда появится вращение (подведите вал от источника)');
  }
  /** Cells of the structure glued to `start` (flood over built blocks), or null if it is too big. */
  _glue(start, skip) {
    const w = this.game.world, out = new Map(), stack = [start];
    while (stack.length) {
      const [x, y, z] = stack.pop();
      const i = w.index(x, y, z);
      if (out.has(i) || i === skip || !w.inBounds(x, y, z)) continue;
      const id = w.getBlock(x, y, z);
      if (!GLUE.has(id)) continue;
      out.set(i, [x, y, z, id]);
      if (out.size > MAX_GLUE) return null;
      for (const [dx, dy, dz] of DIR6) stack.push([x + dx, y + dy, z + dz]);
    }
    return out;
  }
  _free(x, y, z) { const id = this.game.world.getBlock(x, y, z); return id === B.AIR || !!BLOCKS[id]?.replaceable; }
  _piston(m, k, dt) {
    const w = this.game.world, i = w.index(m.x, m.y, m.z);
    const st = this.pistons.get(i);
    if (!st) return;
    const dir = st.want && st.ext < MAX_EXT ? 1 : !st.want && st.ext > 0 ? -1 : 0;
    if (!dir) return;
    st.t += k * dt;
    if (st.t < 0.7) return;
    st.t = 0;
    const [fx, fy, fz] = DIR6[this.faceOf(m)];
    const at = (d) => [m.x + fx * d, m.y + fy * d, m.z + fz * d];
    if (dir > 0) {
      const front = at(st.ext + 1);
      if (!w.inBounds(...front) || !w.isGenerated(front[0], front[2])) return;
      const set = this._free(...front) ? new Map() : this._glue(front, i);
      if (!set || (!set.size && !this._free(...front))) return this._blocked(st, set ? 'перед поршнем земля или камень — он двигает только постройки' : `постройка больше ${MAX_GLUE} блоков`);
      for (const [, [x, y, z]] of set) if (!set.has(w.index(x + fx, y + fy, z + fz)) && !this._free(x + fx, y + fy, z + fz)) return this._blocked(st, 'путь перегорожен');
      this._shift(set, fx, fy, fz);
      this._set(front[0], front[1], front[2], B.PISTON_POLE);
      st.ext++;
    } else {
      const pole = at(st.ext), head = at(st.ext + 1);
      const set = this._glue(head, i) || new Map();
      this._set(pole[0], pole[1], pole[2], B.AIR);
      this._shift(set, -fx, -fy, -fz);
      st.ext--;
    }
    this.game.audio?.play('hammer', { pos: { x: m.x + 0.5, y: m.y + 0.5, z: m.z + 0.5 }, volume: 0.35, pitch: 0.5 + Math.random() * 0.1 });
  }
  _blocked(st, why) {
    if (st.blocked !== why) { st.blocked = why; this.game.bus.emit('toast', { text: 'Поршень: ' + why, kind: 'bad' }); }
  }
  _set(x, y, z, id) { this._moving = true; try { this.game.world.setBlock(x, y, z, id); } finally { this._moving = false; } }
  /** Moves the glued cells one block along (dx, dy, dz), with the people and zombies standing on them. */
  _shift(set, dx, dy, dz) {
    if (!set.size) return;
    const g = this.game, w = g.world;
    // riders first: anyone whose feet rest on a moving block goes along
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const [, [x, y, z]] of set) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    const c = { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, z: (z0 + z1 + 1) / 2 };
    for (const e of g.entities.query(c, Math.max(x1 - x0, y1 - y0, z1 - z0) + 4)) {
      if (e.dead || e.kind === 'projectile') continue;
      const p = e.position;
      if (set.has(w.index(Math.floor(p.x), Math.floor(p.y - 0.08), Math.floor(p.z)))) { p.x += dx; p.y += dy; p.z += dz; if (dy > 0 && e.velocity) e.velocity.y = Math.max(0, e.velocity.y); }
    }
    this._moving = true;
    try {
      for (const [i, [x, y, z]] of set) if (!set.has(w.index(x - dx, y - dy, z - dz))) w.setBlock(x, y, z, B.AIR);
      for (const [, [x, y, z, id]] of set) w.setBlock(x + dx, y + dy, z + dz, id);
    } finally { this._moving = false; }
  }

  // ------------------------------------------------------------------ tunnel drill
  _ore(id) { return ORE_BLOCKS.has(id); }
  _findOre(m) {
    const w = this.game.world;
    let best = null, bd = Infinity;
    const R = ORE_SEEK;
    for (let y = Math.max(2, m.y - R); y <= Math.min(w.height - 2, m.y + R); y++)
      for (let z = m.z - R; z <= m.z + R; z++) for (let x = m.x - R; x <= m.x + R; x++) {
        const d = Math.abs(x - m.x) + Math.abs(y - m.y) + Math.abs(z - m.z);
        if (d >= bd || !this._ore(w.getBlock(x, y, z))) continue;
        bd = d; best = [x, y, z];
      }
    return best;
  }
  _drillable(x, y, z) {
    const w = this.game.world, v = this.game.village, id = w.getBlock(x, y, z);
    if (!w.inBounds(x, y, z) || !w.isGenerated(x, z) || id === B.LAVA || KINETIC[id] || NOT_DRILLABLE.has(id) || !isFinite(BLOCKS[id]?.hardness) || id === B.PISTON_POLE) return false;
    try { if (v?.buildingAt?.(x, y, z)) return false; } catch (e) { /* ignore */ }
    return true;
  }
  _tunnel(m, k, dt) {
    const w = this.game.world, i = w.index(m.x, m.y, m.z);
    let st = this.drills.get(i);
    if (!st) this.drills.set(i, st = { target: null, moves: 0, prog: 0, cool: 0 });
    if (st.done) return;
    st.prog += k * dt;
    if (st.prog < 0.9) return;
    st.prog = 0;
    if (st.cool > 0) { st.cool -= 0.9; return; }
    if (!st.target || !this._ore(w.getBlock(...st.target))) {
      st.target = this._findOre(m);
      if (!st.target) { st.cool = 8; m.stuck = true; return; }
    }
    const [tx, ty, tz] = st.target;
    const ddx = tx - m.x, ddy = ty - m.y, ddz = tz - m.z;
    // next to the ore: mine the whole vein into the stock
    if (Math.abs(ddx) + Math.abs(ddy) + Math.abs(ddz) === 1) {
      const seen = new Set(), stack = [[tx, ty, tz]];
      let n = 0;
      while (stack.length && n < 48) {
        const [x, y, z] = stack.pop(), key = w.index(x, y, z);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!this._ore(w.getBlock(x, y, z))) continue;
        w.breakBlock(x, y, z, DRILLER); n++;
        for (const [a, b, c] of DIR6) stack.push([x + a, y + b, z + c]);
      }
      this.game.audio?.play('pick_hit', { pos: { x: tx + 0.5, y: ty + 0.5, z: tz + 0.5 }, volume: 0.7 });
      st.target = null;
      return;
    }
    // one step toward it: the biggest gap first, around what it can't bore
    const steps = [[Math.sign(ddx), 0, 0, Math.abs(ddx)], [0, Math.sign(ddy), 0, Math.abs(ddy)], [0, 0, Math.sign(ddz), Math.abs(ddz)]].filter(s => s[3] > 0).sort((a, b) => b[3] - a[3]);
    for (const [sx, sy, sz] of steps) {
      const x = m.x + sx, y = m.y + sy, z = m.z + sz;
      if (!this._drillable(x, y, z)) continue;
      if (x === tx && y === ty && z === tz) continue;
      this._moveDrill(m, st, x, y, z, sy === 0);
      return;
    }
    st.target = null; st.cool = 4; m.stuck = true;
  }
  _moveDrill(m, st, x, y, z, flat) {
    const w = this.game.world;
    if (w.getBlock(x, y, z) !== B.AIR) w.breakBlock(x, y, z, DRILLER);
    // a walkable tunnel: clear the cell above the new one when boring sideways
    if (flat && this._drillable(x, y + 1, z) && w.getBlock(x, y + 1, z) !== B.AIR && !this._ore(w.getBlock(x, y + 1, z))) w.breakBlock(x, y + 1, z, DRILLER);
    const from = w.index(m.x, m.y, m.z), to = w.index(x, y, z);
    const face = this.faces.get(from);
    this._moving = true;
    try { w.setBlock(x, y, z, B.TUNNEL_DRILL); w.setBlock(m.x, m.y, m.z, B.SHAFT); } finally { this._moving = false; }
    this.drills.delete(from); this.faces.delete(from);
    if (face !== undefined) this.faces.set(to, face);
    st.moves++;
    if (st.moves >= TUNNEL_MAX) { st.done = true; this.game.bus.emit('toast', { text: `Бур-проходчик прошёл ${TUNNEL_MAX} блоков и остановился`, kind: 'info' }); }
    this.drills.set(to, st);
    this.game.audio?.play('dig_stone', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.6 });
  }

  _hurt(x, y, z, r, dmg) {
    if (dmg <= 0) return;
    for (const zb of this.game.waves?.zombies || []) {
      if (zb.dead) continue;
      const p = zb.position;
      if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && p.y - 0.5 < y && p.y + (zb.height || 1.8) > y - 0.5) zb.damage(dmg, null, { kind: 'phys' });
    }
  }

  /** What the player learns by right-clicking a mechanism. */
  describe(x, y, z) {
    if (this.dirty) this._rebuild();
    const n = this.nodes.get(this.game.world.index(x, y, z));
    const help = MECH_HELP[this.game.world.getBlock(x, y, z)] || '';
    if (!n?.net) return help;
    const net = n.net;
    let state;
    if (!net.cap) state = 'нет вращения — нужен источник (колесо в воде, ветряк под небом или двигатель с углём)';
    else if (net.over) state = `перегрузка: нагрузка ${net.stress} больше силы ${net.cap}`;
    else state = `${net.rpm} об/мин, нагрузка ${net.stress}/${net.cap}`;
    let extra = '';
    if (n.id === B.MECH_DRILL && n.dir) extra = n.stuck ? ` · бур упёрся (глубина ${n.head})` : ` · бурит на глубине ${n.head}`;
    if (n.id === B.CRUSHER) { const st = this.game.state.resources; extra = ` · руда: ${RESOURCE_LABELS.iron_ore} ${Math.floor(st.iron_ore || 0)}, ${RESOURCE_LABELS.gold_ore} ${Math.floor(st.gold_ore || 0)}`; }
    if (n.role === 'machine' && !n.dir) extra = ' · подведите вал с одной стороны';
    if (n.id === B.TUNNEL_DRILL) { const d = this.drills.get(this.game.world.index(x, y, z)); extra = d?.target ? ` · идёт к руде, пройдено ${d.moves}` : ' · ищет руду'; }
    return `${help} Сеть: ${state}${extra}`;
  }
}

// ------------------------------------------------------------------ the moving parts
const MAT = {};
function mat(key, color) {
  if (!MAT[key]) MAT[key] = new THREE.MeshLambertMaterial({ color });
  return MAT[key];
}
function stripes(a, b) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, i * 4, 8, 4); }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let BELT_TEX = null;
function beltTex() {
  if (BELT_TEX) return BELT_TEX;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2826'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#4c4842'; for (let y = 0; y < 16; y += 4) g.fillRect(1, y, 14, 1);
  g.fillStyle = '#8a8e96'; g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (BELT_TEX = t);
}
let SHAFT_MAT = null;
const shaftMat = () => SHAFT_MAT || (SHAFT_MAT = new THREE.MeshLambertMaterial({ map: stripes('#8a8e96', '#5a5e66') }));
const Y = new THREE.Vector3(0, 1, 0);

function box(w, h, d, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }
function cyl(r, h, m, seg = 10) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); }

/** A part spinning around local +Y, oriented so +Y points along `axis`. */
function spinner(axis) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...axis).normalize());
  outer.add(inner);
  return { outer, inner };
}
function gear(r, thick, teeth, m) {
  const g = new THREE.Group();
  g.add(cyl(r, thick, m, 16));
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * Math.PI * 2;
    const t = box(0.12, thick, 0.12, m, Math.cos(a) * (r + 0.05), 0, Math.sin(a) * (r + 0.05));
    t.rotation.y = -a; g.add(t);
  }
  return g;
}

class KineticsView {
  constructor(sys) {
    this.sys = sys; this.game = sys.game;
    this.group = new THREE.Group(); this.group.name = 'kinetics';
    this.game.renderer.scene.add(this.group);
    this.parts = new Map();   // node -> {obj, spin: [{inner, dir}], ...}
    this.stale = true; this.checkT = 0;
  }
  invalidate() { this.stale = true; }
  _axisOf(n) {
    const w = this.game.world, nodes = this.sys.nodes;
    const has = (dx, dy, dz) => nodes.has(w.index(n.x + dx, n.y + dy, n.z + dz));
    if (has(1, 0, 0) || has(-1, 0, 0)) return [1, 0, 0];
    if (has(0, 0, 1) || has(0, 0, -1)) return [0, 0, 1];
    return [0, 1, 0];
  }
  _build(n) {
    const root = new THREE.Group();
    root.position.set(n.x + 0.5, n.y + 0.5, n.z + 0.5);
    const spins = [];
    const iron = mat('iron', 0x9a9ea6), brass = mat('brass', 0xc89a40), wood = mat('wood', 0x8a5a30), dark = mat('dark', 0x3a3c40), cloth = mat('cloth', 0xe8e0c8);
    const add = (axis, build, dirSign = 1, at = null) => {
      const s = spinner(axis); build(s.inner);
      if (at) s.outer.position.set(...at);
      root.add(s.outer); spins.push({ inner: s.inner, sign: dirSign });
      return s;
    };
    const axis = this._axisOf(n);
    const front = n.dir || [0, 0, 1];
    const fa = (k) => [front[0] * k, front[1] * k, front[2] * k];
    switch (n.id) {
      case B.SHAFT: add(axis, (g) => g.add(cyl(0.13, 1.0, shaftMat(), 8))); break;
      case B.COGWHEEL: add(axis, (g) => { g.add(cyl(0.13, 1.0, shaftMat(), 8)); g.add(gear(0.36, 0.2, 10, wood)); }); break;
      case B.WATER_WHEEL: {
        // a paddle wheel, its axle across the water
        const water = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].find(([dx, , dz]) => WATER_IDS[this.game.world.getBlock(n.x + dx, n.y, n.z + dz)]);
        const ax = water ? (water[0] ? [0, 0, 1] : [1, 0, 0]) : axis;
        add(ax, (g) => {
          g.add(cyl(0.14, 1.0, shaftMat(), 8));
          g.add(cyl(0.3, 0.7, wood, 12));
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            const p = box(0.12, 0.8, 0.5, wood, Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62); p.rotation.y = -a; p.rotation.z = Math.PI / 2; g.add(p);
            const s = box(0.06, 0.06, 0.6, dark, Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36); s.rotation.y = -a + Math.PI / 2; g.add(s);
          }
        });
        break;
      }
      case B.WINDMILL: {
        root.add(box(0.7, 0.7, 0.7, wood));
        add(front, (g) => {
          g.add(cyl(0.12, 0.6, shaftMat(), 8)); g.children[0].position.y = 0.35;
          for (let i = 0; i < 4; i++) {
            const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; arm.position.y = 0.62;
            arm.add(box(2.4, 0.05, 0.08, wood, 1.25, 0, 0));
            arm.add(box(1.9, 0.03, 0.55, cloth, 1.4, 0.02, 0.3));
            g.add(arm);
          }
        });
        break;
      }
      case B.STEAM_ENGINE: add([1, 0, 0], (g) => { g.add(gear(0.42, 0.12, 12, iron)); g.children[0].position.y = 0.0; }, 1, [0.56, 0, 0]); break;
      case B.MECH_DRILL: {
        const s = add(front, (g) => {
          const bit = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 10), iron); bit.position.y = 0.35; g.add(bit);
          for (let i = 0; i < 4; i++) { const f = box(0.06, 0.5, 0.2, dark, 0, 0.25, 0); f.rotation.y = i * Math.PI / 4; f.position.y = 0.3; g.add(f); }
        }, 1, fa(0.5));
        const rod = cyl(0.09, 1, shaftMat(), 6); rod.visible = false; root.add(rod);
        return { obj: root, spins, drill: s.outer, rod, front };
      }
      case B.MECH_SAW: add(front, (g) => { const d = gear(0.5, 0.05, 16, iron); g.add(d); }, 1, fa(0.52)); break;
      case B.MECH_FAN: add(front, (g) => { g.add(cyl(0.08, 0.1, dark, 8)); for (let i = 0; i < 4; i++) { const b = box(0.85, 0.03, 0.22, iron); b.rotation.y = i * Math.PI / 2 + 0.3; b.rotation.x = 0.35; g.add(b); } }, 1, fa(0.53));
        break;
      case B.BELT: {
        // a frame with rollers and a moving belt on top, running along its facing
        const f = DIR6[this.sys.faceOf(n)];
        root.add(box(1, 0.8, 1, dark, 0, -0.1, 0));
        root.add(box(1.0, 0.12, 0.12, brass, 0, 0.36, 0).rotateY(f[0] ? Math.PI / 2 : 0).translateZ(0.44));
        root.add(box(1.0, 0.12, 0.12, brass, 0, 0.36, 0).rotateY(f[0] ? Math.PI / 2 : 0).translateZ(-0.44));
        const tex = beltTex().clone(); tex.needsUpdate = true;
        const top = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1), new THREE.MeshLambertMaterial({ map: tex }));
        top.rotation.order = 'YXZ'; top.rotation.y = Math.atan2(f[0], f[2]); top.rotation.x = -Math.PI / 2; top.position.y = 0.502;
        root.add(top);
        return { obj: root, spins, belt: tex };
      }
      case B.MECH_PISTON: {
        // a casing with a plank head plate on the side it pushes
        const f = DIR6[this.sys.faceOf(n)], s = new THREE.Group();
        s.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...f));
        s.add(box(0.98, 0.74, 0.98, iron, 0, -0.13, 0));
        s.add(box(1, 0.24, 1, wood, 0, 0.38, 0));
        s.add(box(0.3, 0.3, 0.3, brass, 0, 0.3, 0));
        root.add(s);
        break;
      }
      case B.CRUSHER:
        add([0, 0, 1], (g) => g.add(gear(0.22, 0.85, 8, iron)), 1, [-0.24, 0.55, 0]);
        add([0, 0, 1], (g) => g.add(gear(0.22, 0.85, 8, iron)), -1, [0.24, 0.55, 0]);
        break;
    }
    return { obj: root, spins };
  }
  update(dt) {
    const g = this.game, cam = g.camera.position, sys = this.sys;
    this.checkT -= dt;
    if (this.stale || this.checkT <= 0) {
      this.checkT = 1;
      this.stale = false;
      // keep the parts of the mechanisms near the camera
      const want = new Set();
      for (const n of sys.nodes.values()) {
        if (Math.abs(n.x - cam.x) > VIEW || Math.abs(n.z - cam.z) > VIEW || !g.world.isGenerated(n.x, n.z)) continue;
        want.add(n);
      }
      for (const [n, p] of this.parts) if (!want.has(n) || p.key !== (n.dir || []).join() + this._axisOf(n).join() + this.sys.faceOf(n)) { this.group.remove(p.obj); this.parts.delete(n); }
      for (const n of want) if (!this.parts.has(n)) {
        const p = this._build(n);
        p.key = (n.dir || []).join() + this._axisOf(n).join() + this.sys.faceOf(n);
        this.parts.set(n, p); this.group.add(p.obj);
      }
      // dim them like the world around (caves are dark)
      for (const [n, p] of this.parts) {
        const l = g.world.getLight(n.x, n.y, n.z);
        const sky = (l >> 4) / 15, blk = (l & 15) / 15;
        const v = Math.min(1.1, 0.1 + 0.9 * sky * sky * worldUniforms.uSkyLight.value + Math.pow(blk, 1.6) * 0.8);
        p.obj.traverse((o) => { if (o.isMesh) { if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; o.userData.base = o.material.color.clone(); } o.material.color.copy(o.userData.base).multiplyScalar(v); } });
      }
    }
    for (const [n, p] of this.parts) {
      const a = n.net ? n.net.angle : 0;
      for (const s of p.spins) s.inner.rotation.y = a * s.sign;
      if (p.belt) p.belt.offset.y = -a * 0.35;
      if (p.drill) {
        // the drill head reaches out to the face it is boring
        const d = Math.max(1, n.head || 1);
        p.drill.position.set(p.front[0] * (d - 0.5), p.front[1] * (d - 0.5), p.front[2] * (d - 0.5));
        p.rod.visible = d > 1;
        if (d > 1) {
          p.rod.scale.set(1, d - 1, 1);
          p.rod.position.set(p.front[0] * (d / 2), p.front[1] * (d / 2), p.front[2] * (d / 2));
          p.rod.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...p.front));
        }
      }
    }
  }
}
