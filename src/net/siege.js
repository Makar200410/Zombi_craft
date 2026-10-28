// Siege mode on a network game: a friend who joins can take a side against the host's village.
//   «Командир» — leads one of the rival villages: hires soldiers with the town's wealth, sends war parties at the
//                host's village or at other towns, builds the town's defences (its wealth pays for the blocks) and
//                holds it at night, when the dead come for his town too (his soldiers fight them).
//   «Повелитель нежити» — commands the dead: dark power builds up (faster at night) and is spent to raise zombies
//                around him (never right inside the village) or to bring the night on early. The village's guards
//                and towers hunt him; when he falls he rises again in the wilds.
// The host runs it all (Siege, below); the joined player sends commands and gets his side's state once a second.
import * as THREE from 'three';

export const ROLES = { hero: 'Герой деревни', rival: 'Командир соседней деревни', horde: 'Повелитель нежити' };
// what the lord of the dead can raise: [type, name, cost, from wave]
export const HORDE = [
  ['walker', 'Ходячий', 4, 0], ['runner', 'Бегун', 7, 0], ['crawler', 'Ползун', 6, 2], ['spitter', 'Плевун', 10, 3],
  ['skeleton', 'Скелет', 9, 3], ['exploder', 'Взрывун', 14, 4], ['brute', 'Громила', 24, 5], ['armored', 'Бронированный', 28, 7],
  ['screamer', 'Крикун', 22, 8], ['necromancer', 'Некромант', 60, 10], ['giant', 'Великан', 120, 12],
];
const HORDE_CAP = 300, HORDE_MAX = 45, WAVE_COST = 100, SAFE_R = 34;

export class Siege {
  constructor(net) {
    this.net = net; this.game = net.game;
    this.horde = { points: 40, cd: 0, spawned: [] };
    this._t = 0;
    const bus = this.game.bus;
    bus.on('time:dusk', () => { if (this.net.isHost) this._nightAssault(); });
  }
  get rivals() { return this.game.rivals; }

  /** A player joins with a role: returns {role, town, spawn} (falls back to a hero when the side isn't available). */
  assign(p, role) {
    const g = this.game, R = this.rivals;
    if (role === 'rival' && R?.active) {
      const c = g.world.size / 2;
      const free = R.list.filter(r => r.commander == null && r.owner === null).sort((a, b) => Math.hypot(a.x - c, a.z - c) - Math.hypot(b.x - c, b.z - c));
      const r = free[0];
      if (r) {
        r.commander = p.cid; r.commanderName = p.playerName;
        p.role = 'rival'; p.town = r.i; p.faction = 'undead'; p.rivalId = r.i;
        if (!R.atWarWithPlayer(r.i)) R.declareWar(r, `${p.playerName} возглавил(а) «${r.name}» и объявил(а) вам войну!`);
        else g.bus.emit('toast', { text: `${p.playerName} возглавил(а) «${r.name}»!`, kind: 'bad' });
        g.bus.emit('rivals:changed', { i: r.i });
        return { role: 'rival', town: r.i, spawn: [r.x + 0.5, r.y + 1, r.z + 6.5] };
      }
    }
    if (role === 'horde') {
      p.role = 'horde'; p.faction = 'undead'; p.rivalId = null;
      g.bus.emit('toast', { text: `${p.playerName} — Повелитель нежити! Мёртвые подчиняются ему`, kind: 'bad' });
      return { role: 'horde', spawn: this._lair() };
    }
    p.role = 'hero';
    return { role: 'hero' };
  }
  /** The player left: his town goes back to its own council. */
  release(p) {
    const r = p.role === 'rival' ? this.rivals?.get(p.town) : null;
    if (r && r.commander === p.cid) { r.commander = null; r.commanderName = null; this.game.bus.emit('rivals:changed', { i: r.i }); }
  }
  /** Where the lord of the dead rises: out in the wilds, ~110 blocks from the village. */
  _lair() {
    const W = this.game.waves, c = this.game.world.size / 2;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, x = c + Math.cos(a) * 110, z = c + Math.sin(a) * 110;
      const p = W?._standPoint?.(x, z);
      if (p) return [p.x, p.y, p.z];
    }
    const p = W?._edgePoint?.(Math.random() * 6.28, 10);
    return p ? [p.x, p.y, p.z] : [c + 100, this.game.world.surfaceY(c + 100, c) + 1, c];
  }
  respawnPoint(p) {
    if (p.role === 'horde') return this._lair();
    const r = p.role === 'rival' ? this.rivals?.get(p.town) : null;
    return r ? [r.x + 0.5, r.y + 1, r.z + 6.5] : null;
  }

  // ------------------------------------------------------------------ commands from the joined player
  command(p, d) {
    const g = this.game, R = this.rivals;
    const say = (text, kind = 'info') => this.net._sendTo(p.cid, { t: 'toast', text, kind });
    if (p.role === 'rival') {
      const r = R.get(p.town); if (!r || r.commander !== p.cid) return;
      if (r.owner === 'player') return say('Ваш город захвачен хозяином: войско ему больше не подчиняется', 'bad');
      if (d.c === 'recruit') {
        const cost = this.recruitCost(r);
        if (r.army >= r.armyCap + 6) return say('Казармы полны: стройте город, чтобы растить войско', 'bad');
        if (r.wealth < cost) return say(`Нужно ${cost} богатства`, 'bad');
        r.wealth -= cost; r.army += 1;
        say(`Нанят воин. Войско: ${Math.floor(r.army)}`, 'good');
      } else if (d.c === 'raid') {
        if (!R.atWarWithPlayer(r.i)) R.declareWar(r, `«${r.name}» объявила вам войну!`);
        if (r.raid) return say('Отряд уже в походе', 'bad');
        const n = Math.max(1, Math.min(Math.floor(r.army), d.n | 0 || Math.floor(r.army)));
        if (r.army < 1) return say('Нет воинов: наймите их', 'bad');
        R.launchRaid(r, n);
        say(`Отряд из ${n} воинов выступил на деревню хозяина`, 'good');
      } else if (d.c === 'war') {
        const o = R.get(d.town); if (!o || o === r) return;
        const k = Math.min(r.i, o.i) + ':' + Math.max(r.i, o.i);
        if (!R.wars.has(k)) { R.wars.add(k); g.bus.emit('toast', { text: `«${r.name}» напала на «${o.name}»!`, kind: 'warn', share: true }); g.bus.emit('rivals:changed', {}); }
      } else if (d.c === 'peace') {
        if (!R.atWarWithPlayer(r.i)) return say('Вы и так в мире с хозяином');
        r.offer = { gold: Math.round(20 + r.tier * 10) };
        g.bus.emit('toast', { text: `«${r.name}» (${p.playerName}) предлагает мир и ${r.offer.gold} золота — ответ в «Соседях» (N)`, kind: 'info' });
        say('Предложение мира отправлено хозяину');
      }
      return;
    }
    if (p.role === 'horde') {
      const H = this.horde;
      if (d.c === 'raise') {
        const e = HORDE.find(h => h[0] === d.type);
        if (!e || (g.waves?.currentWave | 0) < e[3]) return say('Эти мертвецы ещё не пробудились', 'bad');
        H.spawned = H.spawned.filter(z => !z.dead);
        if (H.spawned.length >= HORDE_MAX) return say(`Под вашей властью уже ${HORDE_MAX} мертвецов`, 'bad');
        if (H.points < e[2]) return say(`Нужно ${e[2]} тёмной силы`, 'bad');
        const at = p.netPos, c = this._villageCenter();
        if (Math.hypot(at.x - c.x, at.z - c.z) < SAFE_R + (g.village?.radius || 0) * 0.5) return say('Слишком близко к деревне: живые не дают поднять мёртвых', 'bad');
        const n = d.n > 1 ? Math.min(d.n | 0, Math.floor(H.points / e[2]), HORDE_MAX - H.spawned.length) : 1;
        let made = 0;
        for (let k = 0; k < n * 3 && n > 0; k++) {
          const a = Math.random() * Math.PI * 2, rr = 2 + Math.random() * 4;
          const s = this._stand(at.x + Math.cos(a) * rr, at.z + Math.sin(a) * rr);
          if (!s) continue;
          const z = g.waves?.spawn(e[0], s.x, s.z, { y: s.y, emerge: true, silent: true });
          if (z) { z.lord = p.cid; H.spawned.push(z); H.points -= e[2]; if (++made >= n) break; }
          if (H.points < e[2]) break;
        }
      } else if (d.c === 'night') {
        if (H.cd > 0) return say(`Ночь можно призвать через ${Math.ceil(H.cd)} с`, 'bad');
        if (H.points < WAVE_COST) return say(`Нужно ${WAVE_COST} тёмной силы`, 'bad');
        if (!g.waves?.startWaveNow?.()) return say('Ночь уже идёт', 'bad');
        H.points -= WAVE_COST; H.cd = 240;
        g.bus.emit('toast', { text: `${p.playerName} призвал(а) ночь раньше срока!`, kind: 'bad' });
      }
    }
  }
  /** A spot to stand on near (x, z) anywhere in the loaded world (the flow field only covers the village). */
  _stand(x, z) {
    const g = this.game, w = g.world, ix = Math.floor(x), iz = Math.floor(z);
    if (!w.isGenerated(ix, iz)) return null;
    const y = g.underground?._standAt?.(ix, w.heightAt(ix, iz) + 1, iz, 8);
    return y === null || y === undefined ? null : { x: ix + 0.5, y, z: iz + 0.5 };
  }
  recruitCost(r) { return 25 + r.tier * 12; }
  _villageCenter() { const th = this.game.village?.townHall; return th?.center || { x: this.game.world.size / 2, z: this.game.world.size / 2 }; }

  /** At dusk the dead also come for every town a player commands. */
  _nightAssault() {
    const g = this.game, R = this.rivals, W = g.waves;
    if (!R?.active || !W) return;
    for (const r of R.list) {
      if (r.commander == null) continue;
      const n = Math.min(26, 5 + Math.round((W.currentWave | 0) * 0.9 + r.tier));
      let made = 0;
      for (let k = 0; k < n * 3 && made < n; k++) {
        const a = Math.random() * Math.PI * 2, rr = 46 + Math.random() * 18;
        const p = this._stand(r.x + Math.cos(a) * rr, r.z + Math.sin(a) * rr);
        if (!p) continue;
        const type = Math.random() < 0.7 ? 'walker' : Math.random() < 0.5 ? 'runner' : 'brute';
        const z = W.spawn(type, p.x, p.z, { y: p.y, emerge: true, wanderer: true, silent: true });
        if (z) { z.home = new THREE.Vector3(r.x + 0.5, r.y + 1, r.z + 0.5); made++; }
      }
      if (made) this.net._sendTo(r.commander, { t: 'toast', text: `Мёртвые идут на «${r.name}»: ${made}! Держите оборону`, kind: 'bad' });
    }
  }

  /** Host, every frame: dark power, respawns, the state each side's player sees. */
  update(dt) {
    const g = this.game, H = this.horde;
    H.points = Math.min(HORDE_CAP, H.points + dt * (g.state.isNight ? 3 : 1));
    if (H.cd > 0) H.cd -= dt;
    this._t += dt;
    if (this._t < 1) return;
    this._t = 0;
    const R = this.rivals;
    for (const p of this.net.players?.values() || []) {
      if (p.role === 'rival') {
        const r = R?.get(p.town); if (!r) continue;
        this.net._sendTo(p.cid, { t: 'siege', role: 'rival', town: {
          i: r.i, name: r.name, color: r.color, tier: r.tier, army: Math.floor(r.army), cap: r.armyCap, wealth: Math.floor(r.wealth), pop: Math.round(r.pop),
          recruit: this.recruitCost(r), war: R.atWarWithPlayer(r.i), raid: r.raid ? { size: r.raid.size, eta: Math.round(r.raid.eta), arrived: r.raid.arrived, left: r.raid.units?.filter(u => !u.dead).length } : null,
          owner: r.owner, towns: R.list.filter(o => o !== r).map(o => [o.i, o.name, R.atWar(r.i, o.i) ? 1 : 0, o.tier, Math.floor(o.army)]),
        } });
      } else if (p.role === 'horde') {
        H.spawned = H.spawned.filter(z => !z.dead);
        this.net._sendTo(p.cid, { t: 'siege', role: 'horde', horde: { points: Math.floor(H.points), cap: HORDE_CAP, cd: Math.ceil(Math.max(0, H.cd)), count: H.spawned.length, max: HORDE_MAX, wave: g.waves?.currentWave | 0, night: g.state.isNight, waveCost: WAVE_COST } });
      }
    }
  }
}
