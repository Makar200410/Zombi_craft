// A joined player ruling a town of a network game runs it as a real village of their own, on their own computer:
// the same village as the host's (buildings, villagers with jobs, building anywhere in the command mode, research,
// ages, crafting) and its own nights of the dead. The host keeps the world: every block the village changes is sent
// to it (and so seen by everyone), the town's people are shown to the other players, and the village is saved on the
// host's computer (in the town's record, see Rivals.serialize) so the ruler finds it again when they come back.
// Taking a town for the first time, the ruler adopts it: its buildings become theirs and its people start working.
import { BUILDING_TYPES } from '../village/buildings.js';
import { Building } from '../village/Building.js';

const SAVE_EVERY = 20;      // seconds between saves sent to the host
const PEOPLE_EVERY = 0.3;   // seconds between the villagers' positions sent to the host

export class OwnVillage {
  constructor(net) { this.net = net; this.game = net.game; this.active = false; }

  /** Called when the welcome says we rule town `town` (index); data: what the host saved of our village, or null. */
  start(town, data) {
    const g = this.game, R = g.rivals, r = R?.get(town);
    if (!r) return false;
    this.active = true; this.town = town; this.ready = false; this.data = data || null;
    this._saveT = SAVE_EVERY; this._peopleT = 0;
    const w = g.world;
    w.setHome(r.x + 0.5, r.z + 0.5);
    // the town's own state: its age and research (or what was saved), a new village's stores
    const st = g.state, s = data?.state;
    if (s) {
      Object.assign(st.resources, s.resources || {});
      st.researchDone = new Set(s.researchDone || []);
      st.age = s.age | 0;
      Object.assign(st.stats, s.stats || {});
      st.questsDone = new Set(s.questsDone || []);
    } else {
      st.researchDone = new Set(r.techs || []);
      st.questsDone = new Set();
      st.age = Math.max(0, r.tier - 1);
      Object.assign(st.resources, { wood: 120, stone: 80, food: 80, gold: 20 + r.tier * 10, iron: r.tier >= 3 ? 20 : 0 });
    }
    g.research?.deserialize?.(data?.research || null);
    if (g.waves) g.waves.currentWave = data?.wave | 0;
    const v = g.village;
    v.mirror = false; v.netSpawn = null;
    v.reset();
    g.bus.emit('resources:changed', { resources: st.resources });
    return true;
  }
  stop() {
    if (!this.active) return;
    this.save();
    this.active = false;
    const w = this.game.world;
    w?.setHome(w.size / 2, w.size / 2);
  }

  /** Once the town's land is there: the saved village comes back, or the town is adopted. */
  _begin() {
    const g = this.game, v = g.village, R = g.rivals, r = R.get(this.town);
    if (this.data?.village) v.deserialize(this.data.village);
    else this._adopt(r);
    this.ready = true;
    v.recalcPop(); v.recalcRadius();
    g.bus.emit('village:ready', { village: v });
    const th = v.townHall;
    if (th && g.player) { const d = th.door; g.player.position.set(d.x, d.y, d.z + 2); g.player.velocity.set(0, 0, 0); }
    g.bus.emit('toast', { text: `«${r.name}» — ваша деревня! Tab — командование: стройте, назначайте жителей на работы, исследуйте. G — войско и дипломатия.`, kind: 'good' });
    this.save();
  }
  /** The town's buildings become the village's, and its people get to work. */
  _adopt(r) {
    const g = this.game, v = g.village, R = g.rivals, plan = R._plan(r), t = r.tier;
    for (let k = 0; k < Math.min(r.built, plan.length); k++) {
      const p = plan[k], def = BUILDING_TYPES[p.type];
      if (!def) continue;
      const L = def.layout(p.rot, p.variant, t, def.growAt(t));
      const x = p.x + ((p.mw - L.w) >> 1), z = p.z + ((p.md - L.d) >> 1);
      const b = new Building(v, p.type, x, r.y, z, p.rot, p.variant);
      if (def.tiered && (b.tier !== t || b.grow !== def.growAt(t))) b.relayout(t, def.growAt(t), false);
      b.applyLevelMaterials(false);
      v.addBuilding(b);
      b.computeOps();
      b.refreshBuilt();
      b.state = 'complete';
      b.maxHp = b.computeMaxHp(); b.hp = b.maxHp;
      b.needsRepair = b.builtCount < b.blocks.length;
    }
    const th = v.townHall;
    if (th) { const d = th.door; v.spawnPoint.set(d.x, d.y, d.z + 2); }
    else v.spawnPoint.set(r.x + 0.5, r.y + 1, r.z + 6.5);
    // the townsfolk: builders first, then everyone to a workplace
    const n = Math.max(5, Math.min(14, Math.round(r.pop / 2)));
    for (let i = 0; i < n; i++) {
      const vi = v.spawnVillager({ job: i < 2 ? 'builder' : 'idle', female: i % 2 === 1, silent: true });
      if (vi) vi.position.set(v.spawnPoint.x - 3 + (i % 6), v.spawnPoint.y, v.spawnPoint.z + 1 + Math.floor(i / 6));
    }
    v.recalcPop();
    v.autoAssign();
    v.ghostsDirty = true;
  }

  /** What the host keeps of our village. */
  save() {
    if (!this.active || !this.ready) return;
    const g = this.game, st = g.state;
    this.net.send({ t: 'pvsave', data: {
      village: g.village.serialize(), research: g.research?.serialize?.() || null, wave: g.waves?.currentWave | 0,
      owned: [...(g.crafting?.owned || [])], player: g.player?.serialize?.() || null, quests: g.quests?.serialize?.() || null,
      state: { resources: { ...st.resources }, researchDone: [...st.researchDone], age: st.age | 0, stats: { ...st.stats }, questsDone: [...(st.questsDone || [])] },
      pop: g.village.villagers.filter(x => !x.dead).length,
    } });
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game, w = g.world;
    if (!this.ready) {
      // wait for the town's land (its chunks come in around the player, who stands there)
      const r = g.rivals.get(this.town);
      let ok = true;
      for (let dz = -64; dz <= 64 && ok; dz += 16) for (let dx = -64; dx <= 64 && ok; dx += 16) if (dx * dx + dz * dz <= 64 * 64 && !w.isGenerated(r.x + dx, r.z + dz)) ok = false;
      if (ok) this._begin();
      else w.pumpGeneration?.(r.x, r.z, 96, 4);
      return;
    }
    this._saveT -= dt;
    if (this._saveT <= 0) { this._saveT = SAVE_EVERY; this.save(); }
    // the people, for the others to see
    this._peopleT -= dt;
    if (this._peopleT <= 0) {
      this._peopleT = PEOPLE_EVERY;
      const vs = [];
      for (const v of g.village.villagers) if (!v.dead && !v.hidden) vs.push([v.id, v.job, v.seed | 0, v.female ? 1 : 0, +v.position.x.toFixed(2), +v.position.y.toFixed(2), +v.position.z.toFixed(2), +v.yaw.toFixed(2)]);
      // and the dead that come for it (the others see them and can fight them)
      const zs = [], home = { x: w.homeX, z: w.homeZ };
      for (const z of g.waves?.zombies || []) {
        if (z.dead || z.netRemote || z.emergeT > 0 || Math.abs(z.position.x - home.x) > 160 || Math.abs(z.position.z - home.z) > 160) continue;
        zs.push([z.id, z.type, +z.position.x.toFixed(2), +z.position.y.toFixed(2), +z.position.z.toFixed(2), +z.yaw.toFixed(2), Math.round(z.hp), Math.round(z.maxHp), (z.diving ? 1 : 0) | (z.model?.action === 'attack' ? 2 : 0)]);
        if (zs.length >= 80) break;
      }
      this.net.send({ t: 'pvv', v: vs, z: zs });
    }
  }
}

