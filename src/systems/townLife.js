// Life in the rival villages (see rivals.js), while a player is near enough to see it:
//   townsfolk have trades — farmers, woodcutters, miners, smiths, merchants… — and go to their workplace by day,
//   home at night, and run for shelter when danger comes;
//   soldiers walk patrols around the town;
//   the town's captain («воевода») watches for threats: he raises the alarm and leads the soldiers at the enemy,
//   falls back to the town hall when badly hurt, and when he falls his soldiers waver. He also leads big war parties —
//   kill him and the party runs.
// And, for every town, a little strategy: hire soldiers when at war, ally with another enemy of the player and raid
// together.
import { JOBS } from '../village/names.js';

// workplaces in the town plan → the trade working there
const TRADES = { farm: 'farmer', lumber_camp: 'woodcutter', mine: 'miner', forge: 'blacksmith', smelter: 'smelter', market: 'merchant', laboratory: 'researcher', mage_tower: 'mage', factory: 'engineer', builder_hut: 'builder', granary: 'farmer', storehouse: 'builder' };
const DANGER_R = 13, WATCH_R = 52, CAPTAIN_CD = 240;

const dist2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;

export class TownLife {
  constructor(rivals) {
    this.R = rivals; this.game = rivals.game;
  }

  // ------------------------------------------------------------------ who lives here
  /** The trade a new townsperson takes: the workplace with the fewest hands, or none (idle folk keep the square). */
  pickJob(r, list) {
    const plan = this.R._plan(r), have = {};
    for (const u of list) if (u.type === 'folk' && !u.dead) have[u.job] = (have[u.job] || 0) + 1;
    let best = 'idle', bn = 1;          // one idle person is fine
    for (let k = 0; k < Math.min(r.built, plan.length); k++) {
      const job = TRADES[plan[k].type]; if (!job) continue;
      const n = (have[job] || 0) / 2;   // two per workplace
      if (n < bn) { bn = n; best = job; }
    }
    return best;
  }
  folkOpts(r, job) {
    const J = JOBS[job] || JOBS.idle;
    return { job, hat: J.hat || null, hatColor: J.hatColor, held: J.tool && J.tool !== 'build_hammer' ? J.tool : J.tool ? 'pickaxe_stone' : null, name: `${J.label === 'Без работы' ? 'Житель' : J.label} «${r.name}»` };
  }
  /** Where a building of the plan stands: its door side, a step in front of it. */
  _spot(p, r) {
    const cx = p.x + p.mw / 2, cz = p.z + p.md / 2;
    const dx = r.x - cx, dz = r.z - cz, l = Math.hypot(dx, dz) || 1;          // doors face the square
    return { x: cx + dx / l * (Math.min(p.mw, p.md) / 2 + 2), z: cz + dz / l * (Math.min(p.mw, p.md) / 2 + 2) };
  }
  _workplace(r, job) {
    const plan = this.R._plan(r), spots = [];
    for (let k = 0; k < Math.min(r.built, plan.length); k++) if (TRADES[plan[k].type] === job) spots.push(plan[k]);
    if (!spots.length) { const a = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 10; return { x: r.x + Math.cos(a) * rr, z: r.z + Math.sin(a) * rr }; }
    return this._spot(spots[Math.floor(Math.random() * spots.length)], r);
  }
  _home(r) {
    const plan = this.R._plan(r), houses = [];
    for (let k = 0; k < Math.min(r.built, plan.length); k++) if (plan[k].type === 'house' || plan[k].type === 'town_hall') houses.push(plan[k]);
    return houses.length ? this._spot(houses[Math.floor(Math.random() * houses.length)], r) : { x: r.x, z: r.z + 6 };
  }
  _hall(r) { return { x: r.x + 0.5, z: r.z + 7 }; }

  // ------------------------------------------------------------------ threats
  /** Is e an enemy of town r? */
  hostile(r, e) {
    if (!e || e.dead || e.kind === 'projectile' || e.hidden) return false;
    const R = this.R;
    if (e.rivalId != null) return e.rivalId !== r.i && R.atWar(r.i, e.rivalId);
    if (e.faction === 'village') return R.atWarWithPlayer(r.i);
    if (e.faction === 'undead') return R.fightsDead(r.i) || !e.peaceful;      // the dead frighten everyone
    return false;
  }
  /** Nearest enemy of town r within rad of (x, z). */
  _nearestThreat(r, x, z, rad) {
    const g = this.game;
    let best = null, bd = rad * rad;
    for (const e of g.entities.query({ x, y: r.y + 1, z }, rad)) {
      if (!this.hostile(r, e)) continue;
      // plain zombies only threaten soldiers' attention when the town fights the dead; folk fear them always
      const d = dist2(e.position, x, z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ every unit tick (≈1.5 s) for a town near a player
  tick(r, list) {
    const g = this.game, now = g.time, night = g.state.isNight;
    const captain = list.find(u => u.captain && !u.dead) || null;
    // the captain watches the town
    const threat = this._nearestThreat(r, r.x, r.z, WATCH_R);
    const enemyThreat = threat && !(threat.faction === 'undead' && threat.rivalId == null && !this.R.fightsDead(r.i)) ? threat : null;
    if (enemyThreat) {
      if (!r.alarm) this._alarmNews(r, enemyThreat);
      r.alarm = { x: enemyThreat.position.x, z: enemyThreat.position.z, t: now };
    } else if (r.alarm && now - r.alarm.t > 20) r.alarm = null;
    const wavering = (r.waverUntil || 0) > now;
    for (const u of list) {
      if (u.dead || u.attacking !== undefined || u.caravan) continue;
      u.lead = u.lead || { x: u.position.x, z: u.position.z };
      if (u.type === 'folk') this._folk(r, u, night);
      else if (u.captain) this._captain(r, u);
      else this._soldier(r, u, captain, wavering);
    }
  }
  _alarmNews(r, e) {
    const g = this.game, p = g.player?.position;
    if (!p || Math.hypot(p.x - r.x, p.z - r.z) > 140) return;
    const who = e.faction === 'village' ? 'вас' : e.rivalId != null ? `воинов «${this.R.get(e.rivalId)?.name}»` : 'мертвецов';
    g.bus.emit('toast', { text: `«${r.name}»: воевода бьёт тревогу — заметили ${who}!`, kind: e.faction === 'village' ? 'bad' : 'warn' });
  }
  _folk(r, u, night) {
    const g = this.game;
    // danger first: run for the town hall
    const danger = this._nearestThreat(r, u.position.x, u.position.z, DANGER_R);
    if (danger) {
      const s = this._hall(r);
      u.lead.x = s.x; u.lead.z = s.z;
      if (!u.fleeing) { u.fleeing = true; u._speed = u.speed; u.speed = u.speed * 1.6; }
      return;
    }
    if (u.fleeing) { u.fleeing = false; u.speed = u._speed || u.speed; u.task = null; }
    // night: home, and inside (gone until morning)
    if (night) {
      if (u.task !== 'home') { u.task = 'home'; const s = this._home(r); u.lead.x = s.x; u.lead.z = s.z; }
      else if (dist2(u.position, u.lead.x, u.lead.z) < 4) { u.dead = true; u.removeAt = 0; u.object3d.visible = false; }
      return;
    }
    // day: to work, and work there (a little wander around the spot)
    if (u.task !== 'work' || !u.spot) { u.task = 'work'; u.spot = this._workplace(r, u.job || 'idle'); u.workT = 0; }
    u.workT = (u.workT || 0) - 1.5;
    if (u.workT <= 0) {
      u.workT = 5 + Math.random() * 8;
      u.lead.x = u.spot.x + (Math.random() - 0.5) * 4; u.lead.z = u.spot.z + (Math.random() - 0.5) * 4;
    }
    if (u.job !== 'idle' && u.job !== 'merchant' && dist2(u.position, u.lead.x, u.lead.z) < 3 && Math.random() < 0.45) u.model?.play?.('attack');
    void g;
  }
  _soldier(r, u, captain, wavering) {
    const g = this.game;
    if (wavering) {             // the captain fell: they fall back to the hall
      const s = this._hall(r); u.lead.x = s.x; u.lead.z = s.z; u.target = null;
      return;
    }
    if (r.alarm) {
      // to the alarm, around the captain when he leads
      const at = captain && !captain.retreating ? captain.position : r.alarm;
      const a = (u.id % 8) / 8 * Math.PI * 2;
      u.lead.x = at.x + Math.cos(a) * 3; u.lead.z = at.z + Math.sin(a) * 3;
      return;
    }
    // patrol: walk the round of posts around the town
    u.postT = (u.postT || 0) - 1.5;
    if (u.postT <= 0) {
      u.postT = 14 + Math.random() * 10;
      u.post = ((u.post ?? (u.id % 8)) + 1) % 8;
      const a = u.post / 8 * Math.PI * 2, rr = 30 + (u.id % 3) * 6;
      u.lead.x = r.x + Math.cos(a) * rr; u.lead.z = r.z + Math.sin(a) * rr;
    }
    void g;
  }
  _captain(r, u) {
    const low = u.hp < u.maxHp * 0.35;
    if (low || (u.retreating && u.hp < u.maxHp * 0.7)) {
      // badly hurt: back to the town hall to catch his breath
      u.retreating = true; u.target = null;
      const s = this._hall(r); u.lead.x = s.x; u.lead.z = s.z;
      if (dist2(u.position, s.x, s.z) < 9) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.04);
      return;
    }
    u.retreating = false;
    if (r.alarm) { u.lead.x = r.alarm.x; u.lead.z = r.alarm.z; return; }
    // otherwise he walks the square, keeping an eye on the town
    u.postT = (u.postT || 0) - 1.5;
    if (u.postT <= 0) { u.postT = 10; const a = Math.random() * Math.PI * 2; u.lead.x = r.x + Math.cos(a) * 12; u.lead.z = r.z + Math.sin(a) * 12; }
  }
  /** Spawn the town's captain if it has none (he is one of its soldiers). */
  needCaptain(r, list) {
    return r.army >= 2 && !list.some(u => u.captain && !u.dead) && (r.captainCD || 0) <= this.game.time;
  }
  onCaptainDeath(r, u) {
    const g = this.game;
    r.captainCD = g.time + CAPTAIN_CD;
    r.waverUntil = g.time + 20;
    const p = g.player?.position;
    if (u.raider || (p && Math.hypot(p.x - r.x, p.z - r.z) < 160)) g.bus.emit('toast', { text: `Воевода «${r.name}» пал! Его воины дрогнули`, kind: 'good' });
  }

  // ------------------------------------------------------------------ strategy (every town, ~once a minute)
  strategy(r) {
    const R = this.R, g = this.game;
    if (r.commander != null || r.owner !== null) { this._breakAlly(r); return; }
    const atWar = R.atWarWithPlayer(r.i) || R.warsOf(r.i).length > 0;
    // hire soldiers while at war (or to fill the barracks), if the treasury allows
    const cost = 40 + 10 * r.tier;
    if (atWar && r.wealth >= cost && r.army < r.armyCap + 3) { r.wealth -= cost; r.army += 1; }
    // an alliance against the player: two towns at war with him, at peace with each other
    if (r.ally != null) {
      const o = R.get(r.ally);
      if (!o || o.owner !== null || o.commander != null || !R.atWarWithPlayer(r.i) || !R.atWarWithPlayer(o.i) || R.atWar(r.i, o.i)) this._breakAlly(r);
    } else if (R.atWarWithPlayer(r.i)) {
      const o = R.list.find(q => q !== r && q.ally == null && q.owner === null && q.commander == null && R.atWarWithPlayer(q.i) && !R.atWar(r.i, q.i));
      if (o) {
        r.ally = o.i; o.ally = r.i;
        g.bus.emit('toast', { text: `«${r.name}» и «${o.name}» заключили союз против вас — их набеги теперь совместные!`, kind: 'bad' });
        g.bus.emit('rivals:changed', {});
      }
    }
  }
  _breakAlly(r) {
    if (r.ally == null) return;
    const o = this.R.get(r.ally);
    if (o && o.ally === r.i) o.ally = null;
    r.ally = null;
    this.game.bus.emit('rivals:changed', {});
  }
  /** A town sends a war party: its ally joins in. */
  allyJoins(r) {
    const R = this.R, o = r.ally != null ? R.get(r.ally) : null;
    if (!o || o.raid || o.army < 3 || o.commander != null || !R.atWarWithPlayer(o.i)) return;
    R.launchRaid(o, Math.max(3, Math.min(12, Math.round(o.army * 0.5))), true);
    this.game.bus.emit('toast', { text: `Союзник «${o.name}» выступил вместе с «${r.name}»!`, kind: 'bad' });
  }
}
