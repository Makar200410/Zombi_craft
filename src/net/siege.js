// Network games: a friend who joins picks a side.
//   «Правитель деревни» — takes one of the villages (picked when joining) and runs it as their own: builds its
//                buildings, raises its town hall, researches its own technologies and leads it into new ages, pays
//                for it all from the town's treasury, hires soldiers, storms other towns or the host's village and
//                holds it at night, when the dead come for every player's town. Players (and the host) declare war
//                on each other and offer peace or an alliance; an ally joins the war when its friend is attacked
//                (treaties: systems/rivals.js). Weapons found in chests stay with the player who found them;
//                research is the town's.
//   «Повелитель нежити» — commands the dead: dark power builds up (faster at night) and is spent to raise zombies
//                where he points (his hotbar holds the dead he can call; never right inside the village) or to bring
//                the night on early. He rises not far from the host — by day in a cave below, out of the sun. The
//                village's guards and towers hunt him.
// The host runs it all (Siege, below); the joined player sends commands and gets his side's state once a second.
import * as THREE from 'three';
import { TECHS, TECH_ORDER } from '../systems/research.js';
import { AGES } from '../systems/ages.js';
import { BUILDING_TYPES } from '../village/buildings.js';

export const ROLES = { hero: 'Герой деревни', rival: 'Командир соседней деревни', horde: 'Повелитель нежити' };
// what the lord of the dead can raise: [type, name, cost, from wave, cooldown s]
export const HORDE = [
  ['walker', 'Ходячий', 4, 0, 0.8], ['runner', 'Бегун', 7, 0, 1.5], ['crawler', 'Ползун', 6, 2, 1.5], ['spitter', 'Плевун', 10, 3, 4],
  ['skeleton', 'Скелет', 9, 3, 3], ['exploder', 'Взрывун', 14, 4, 8], ['brute', 'Громила', 24, 5, 20], ['armored', 'Бронированный', 28, 7, 25],
  ['screamer', 'Крикун', 22, 8, 30], ['necromancer', 'Некромант', 60, 10, 90], ['giant', 'Великан', 120, 12, 180],
];
// Balance between the host and the lord of the dead: the dark power and the size of the horde grow with the host's
// village (its age and the waves it has held), raising by day costs half as much again (the sun burns them anyway),
// strong dead have their own cooldowns, nothing rises right by the village or the host's hero, the night can't be
// called on the first day, and the host earns gold for every risen dead he puts down.
const HORDE_CAP = 300, WAVE_COST = 100, SAFE_R = 40, HERO_R = 18, DAY_MUL = 1.5;

export class Siege {
  constructor(net) {
    this.net = net; this.game = net.game;
    this.horde = { points: 30, cd: 0, spawned: [], typeCd: {} };
    this._t = 0;
    const bus = this.game.bus;
    bus.on('time:dusk', () => { if (this.net.isHost) this._nightAssault(); });
    bus.on('zombie:killed', ({ zombie }) => {
      if (!this.net.isHost || zombie?.lord == null) return;
      const e = HORDE.find(h => h[0] === zombie.type);
      this.game.state.add('gold', 1 + Math.floor((e?.[2] || 4) / 8));
    });
  }
  get rivals() { return this.game.rivals; }

  /** The towns a joining player may lead (for the lobby). */
  lobbyTowns() {
    const R = this.rivals, c = this.game.world.size / 2;
    if (!R?.active) return [];
    return R.list.map(r => ({ i: r.i, name: r.name, color: r.color, tier: r.tier, age: AGES[r.tier - 1]?.name || '', army: Math.floor(r.army), pop: Math.round(r.pop),
      dist: Math.round(Math.hypot(r.x - c, r.z - c)), taken: r.commanderName || null, free: r.commander == null && r.owner === null, war: R.atWarWithPlayer(r.i) }));
  }
  /** A player joins with a role: returns {role, town, spawn} (falls back to a hero when the side isn't available). */
  assign(p, role, want = null) {
    const g = this.game, R = this.rivals;
    if (role === 'rival' && R?.active) {
      const c = g.world.size / 2;
      const free = R.list.filter(r => r.commander == null && r.owner === null).sort((a, b) => Math.hypot(a.x - c, a.z - c) - Math.hypot(b.x - c, b.z - c));
      const r = free.find(t => t.i === want) || free[0];
      if (r) {
        r.commander = p.cid; r.commanderName = p.playerName;
        r.hall = Math.max(1, r.hall || 1); r.techs = r.techs || [];
        p.role = 'rival'; p.town = r.i; p.faction = 'undead'; p.rivalId = r.i;
        // a new ruler starts at peace with everyone: wars are their own to declare
        if (R.atWarWithPlayer(r.i)) R.makeSidesPeace(r.i, 'P', true);
        for (const o of R.warsOf(r.i)) R.makeSidesPeace(r.i, o, true);
        g.bus.emit('toast', { text: `${p.playerName} теперь правит деревней «${r.name}»!`, kind: 'info', share: true });
        g.bus.emit('rivals:changed', { i: r.i });
        return { role: 'rival', town: r.i, spawn: [r.x + 0.5, r.y + 1, r.z + 6.5] };
      }
    }
    if (role === 'horde') {
      p.role = 'horde'; p.faction = 'undead'; p.rivalId = null;
      g.bus.emit('toast', { text: `${p.playerName} — Повелитель нежити! Мёртвые подчиняются ему`, kind: 'bad' });
      const sp = this._lordSpawn();
      p.spawnAt = sp; p.spawnT = this.game.time;
      return { role: 'horde', spawn: sp };
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
  /** The lord of the dead rises near the host: in the open at night, in a cave under the land by day. */
  _lordSpawn() {
    const g = this.game;
    if (!g.state.isNight) { const c = this._cave(); if (c) return c; }
    return this._nearHost() || this._lair();
  }
  /** 45–65 blocks from the host's hero, and not inside the village. */
  _nearHost() {
    const g = this.game, h = g.player?.position, c = this._villageCenter();
    if (!h) return null;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, rr = 45 + Math.random() * 20;
      const x = h.x + Math.cos(a) * rr, z = h.z + Math.sin(a) * rr;
      if (Math.hypot(x - c.x, z - c.z) < SAFE_R + 10) continue;
      const s = this._stand(x, z);
      if (s) return [s.x, s.y, s.z];
    }
    return null;
  }
  /** A dark cave spot (no sky light) 25–80 blocks from the host's hero. */
  _cave() {
    const g = this.game, w = g.world, h = g.player?.position;
    if (!h || w.format < 3) return null;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, rr = 25 + Math.random() * 55;
      const x = Math.floor(h.x + Math.cos(a) * rr), z = Math.floor(h.z + Math.sin(a) * rr);
      if (!w.isGenerated(x, z)) continue;
      const top = w.heightAt(x, z);
      for (let y = top - 8; y > Math.max(4, top - 90); y--) {
        if (!w.isSolid(x, y - 1, z) || w.isSolid(x, y, z) || w.isSolid(x, y + 1, z)) continue;
        const id = w.getBlock(x, y, z);
        if (id !== 0 || (w.getLight(x, y, z) >> 4) > 0) continue;
        return [x + 0.5, y, z + 0.5];
      }
    }
    return null;
  }
  respawnPoint(p) {
    if (p.role === 'horde') return this._lordSpawn();
    const r = p.role === 'rival' ? this.rivals?.get(p.town) : null;
    return r ? [r.x + 0.5, r.y + 1, r.z + 6.5] : null;
  }

  // ------------------------------------------------------------------ commands from the joined player
  command(p, d) {
    const g = this.game, R = this.rivals;
    const say = (text, kind = 'info') => this.net._sendTo(p.cid, { t: 'toast', text, kind });
    if (p.role === 'rival') {
      const r = R.get(p.town); if (!r || r.commander !== p.cid) return;
      if (r.owner !== null) return say(r.owner === 'player' ? 'Ваш город захвачен хозяином: войско ему больше не подчиняется' : `Ваш город захвачен «${R.get(r.owner)?.name}»`, 'bad');
      const side = (t) => (t === 'P' ? 'P' : R.get(t) ? +t : null);
      switch (d.c) {
        case 'recruit': {
          const cost = this.recruitCost(r), n = Math.max(1, Math.min(10, d.n | 0 || 1));
          let made = 0;
          for (let k = 0; k < n; k++) { if (r.army >= r.armyCap + 6 || r.wealth < cost) break; r.wealth -= cost; r.army += 1; made++; }
          if (!made) return say(r.army >= r.armyCap + 6 ? 'Казармы полны: стройте казармы и башни, улучшайте ратушу' : `Нужно ${cost} богатства`, 'bad');
          return say(`Нанято воинов: ${made}. Войско: ${Math.floor(r.army)}`, 'good');
        }
        case 'build': {
          const nb = this.nextBuild(r);
          if (!nb) return say(nb === null ? 'Все здания этой эпохи построены: двигайтесь в новую эпоху' : 'Нечего строить', 'bad');
          if (r.wealth < nb.cost) return say(`Нужно ${nb.cost} богатства`, 'bad');
          r.wealth -= nb.cost; r.built++;
          R._recount(r); R._queue(r, r.built - 1, 0, 14);
          return say(`Строится: ${nb.name}`, 'good');
        }
        case 'hall': {
          const c = this.hallCost(r);
          if ((r.hall || 1) >= Math.min(10, r.tier + 1)) return say('Ратуша на пределе этой эпохи', 'bad');
          if (r.wealth < c) return say(`Нужно ${c} богатства`, 'bad');
          r.wealth -= c; r.hall = (r.hall || 1) + 1; R._recount(r);
          return say(`Ратуша улучшена до ${r.hall} уровня: казармы просторнее, казна богаче`, 'good');
        }
        case 'research': {
          const t = TECHS[d.id];
          const why = this.techBlock(r, d.id);
          if (why) return say(why, 'bad');
          r.wealth -= this.techCost(d.id); r.techs.push(d.id);
          say(`Изучено: ${t.name}`, 'good');
          this.net._sendTo(p.cid, { t: 'techs', techs: r.techs });
          return;
        }
        case 'age': {
          const why = this.ageBlock(r);
          if (why) return say(why, 'bad');
          r.wealth -= this.ageCost(r);
          const old = r.tier; r.tier++;
          R._recount(r);
          for (let k = 0; k < Math.min(r.built, R._plan(r).length); k++) R._queue(r, k, old, 5);
          g.bus.emit('toast', { text: `«${r.name}» (${p.playerName}) вступает в эпоху: ${AGES[r.tier - 1]?.name || ''}`, kind: 'info', share: true });
          g.bus.emit('rivals:changed', { i: r.i });
          return;
        }
        case 'raid': {
          if (R.allied(r.i, 'P')) return say('Хозяин — ваш союзник: сначала расторгните союз', 'bad');
          if (!R.atWarWithPlayer(r.i)) R.declareWar(r, `«${r.name}» (${p.playerName}) объявила вам войну!`);
          if (r.raid) return say('Отряд уже в походе', 'bad');
          if (r.army < 1) return say('Нет воинов: наймите их', 'bad');
          const n = Math.max(1, Math.min(Math.floor(r.army), d.n | 0 || Math.floor(r.army)));
          R.launchRaid(r, n);
          return say(`Отряд из ${n} воинов выступил на деревню хозяина`, 'good');
        }
        case 'attack': {
          const o = R.get(d.town); if (!o || o === r) return;
          if (!R.atWar(r.i, o.i)) return say(`Сначала объявите войну «${o.name}»`, 'bad');
          if ((r._attackCd || 0) > g.time) return say(`Войско ещё не вернулось из похода: ${Math.ceil(r._attackCd - g.time)} с`, 'bad');
          const n = Math.max(1, Math.min(Math.floor(r.army), d.n | 0 || Math.floor(r.army)));
          if (r.army < 1) return say('Нет воинов: наймите их', 'bad');
          r.army -= n; r._attackCd = g.time + 45;
          R.assault(r, o, n);
          return say(`Отряд из ${n} воинов штурмует «${o.name}»`, 'good');
        }
        case 'war': {
          const t = side(d.town); if (t === null || t === r.i) return;
          if (R.allied(r.i, t)) return say('Это ваш союзник: сначала расторгните союз', 'bad');
          if (R.sidesAtWar(r.i, t)) return say('Вы уже воюете', 'bad');
          if (t === 'P') R.declareWar(r, `«${r.name}» (${p.playerName}) объявила вам войну!`);
          else R.townWar(r, R.get(t), `«${r.name}» (${p.playerName}) объявила войну «${R.get(t).name}»!`);
          return;
        }
        case 'peace': case 'ally': {
          const t = side(d.town); if (t === null || t === r.i) return;
          const res = R.propose(r.i, t, d.c);
          if (res) say(res, res.includes('отказ') ? 'bad' : 'info');
          return;
        }
        case 'unally': { const t = side(d.town); if (t !== null) R.breakPact(r.i, t); return; }
        case 'answer': R.answer(d.id | 0, !!d.yes, p.cid); return;
      }
      return;
    }
    if (p.role === 'horde') {
      const H = this.horde, w = g.world;
      if (d.c === 'raise') {
        const e = HORDE.find(h => h[0] === d.type);
        if (!e || (g.waves?.currentWave | 0) < e[3]) return say(`Эти мертвецы пробудятся к волне ${e?.[3] ?? '?'}`, 'bad');
        H.spawned = H.spawned.filter(z => !z.dead);
        const max = this.hordeMax(), cost = this.costOf(e);
        if (H.spawned.length >= max) return say(`Под вашей властью уже ${max} мертвецов — предел растёт с каждой волной`, 'bad');
        const cdLeft = (H.typeCd[e[0]] || 0) - g.time;
        if (cdLeft > 0) return say(`«${e[1]}» снова можно поднять через ${Math.ceil(cdLeft)} с`, 'bad');
        if (H.points < cost) return say(`Нужно ${cost} тёмной силы${g.state.isNight ? '' : ' (днём дороже)'}`, 'bad');
        // where he points (a block he looks at, up to 48 blocks away), or around himself
        const lord = p.netPos, c = this._villageCenter();
        if (d.x != null && Math.hypot(d.x - lord.x, d.z - lord.z) > 48) return say('Слишком далеко: поднимать мёртвых можно не дальше 48 блоков от себя', 'bad');
        const aimed = d.x != null;
        const at = aimed ? { x: d.x + 0.5, y: d.y, z: d.z + 0.5 } : { x: lord.x, y: lord.y, z: lord.z };
        if (Math.hypot(at.x - c.x, at.z - c.z) < SAFE_R + (g.village?.radius || 0) * 0.5) return say('Слишком близко к деревне: живые не дают поднять мёртвых', 'bad');
        const hero = g.player?.position;
        if (hero && !g.player.dead && Math.hypot(at.x - hero.x, at.z - hero.z) < HERO_R) return say('Слишком близко к герою хозяина', 'bad');
        const n = d.n > 1 && e[2] <= 10 ? Math.min(d.n | 0, Math.floor(H.points / cost), max - H.spawned.length) : 1;
        let made = 0;
        for (let k = 0; k < n * 4 && n > 0; k++) {
          const a = Math.random() * Math.PI * 2, rr = k ? 1 + Math.random() * 3 : 0;
          const x = Math.floor(at.x + Math.cos(a) * rr), z = Math.floor(at.z + Math.sin(a) * rr);
          let s = null;
          if (w.isGenerated(x, z)) { const y = g.underground?._standAt?.(x, Math.floor(at.y), z, 5); if (y != null) s = { x: x + 0.5, y, z: z + 0.5 }; }
          if (!s) s = this._stand(x, z);
          if (!s) continue;
          const dead = g.waves?.spawn(e[0], s.x, s.z, { y: s.y, emerge: true, silent: true });
          if (dead) { dead.lord = p.cid; H.spawned.push(dead); H.points -= cost; if (++made >= n) break; }
          if (H.points < cost) break;
        }
        if (made) H.typeCd[e[0]] = g.time + e[4] * (made > 1 ? 2 : 1);
        if (!made) say('Здесь не встать мертвецу: укажите на землю', 'bad');
      } else if (d.c === 'night') {
        if (g.state.day < 2) return say('Первый день деревне дают отстроиться: ночь можно призвать со второго дня', 'bad');
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
  // ---- a player's town: what things cost and what stands in the way
  nextBuild(r) {
    const R = this.rivals, plan = R._plan(r), elig = R._eligible(r);
    if (r.built >= plan.length) return undefined;
    if (r.built >= elig) return null;
    return { name: BUILDING_TYPES[plan[r.built].type]?.name || 'здание', type: plan[r.built].type, cost: Math.round((40 + r.built * 12 * r.tier) * 1.2) };
  }
  hallCost(r) { return 120 * (r.hall || 1) * (r.hall || 1); }
  techCost(id) { const t = TECHS[id]; if (!t) return 0; let n = 0; for (const k in t.cost) n += t.cost[k]; return Math.round(n * 1.2 + t.points); }
  /** Techs a town can study now (its age decides how far it can go: one band of the tree per age). */
  techBlock(r, id) {
    const t = TECHS[id];
    if (!t) return 'Нет такого исследования';
    if (r.techs.includes(id)) return 'Уже изучено';
    if (!t.prereqs.every(q => r.techs.includes(q))) return 'Сначала: ' + t.prereqs.filter(q => !r.techs.includes(q)).map(q => TECHS[q].name).join(', ');
    if ((t.tier || 0) > r.tier) return `Доступно с эпохи «${AGES[t.tier - 1]?.name || ''}»`;
    if (r.wealth < this.techCost(id)) return `Нужно ${this.techCost(id)} богатства`;
    return null;
  }
  ageCost(r) { return 200 * r.tier * r.tier; }
  ageBlock(r) {
    const a = AGES[r.tier];
    if (!a || a.soon) return 'Это последняя эпоха';
    if (this.nextBuild(r)) return 'Сначала постройте все здания этой эпохи';
    if ((r.hall || 1) < a.req.th) return `Нужна ратуша ${a.req.th} уровня`;
    const miss = a.req.techs.filter(t => !r.techs.includes(t));
    if (miss.length) return 'Нужны исследования: ' + miss.map(t => TECHS[t]?.name || t).join(', ');
    if (r.wealth < this.ageCost(r)) return `Нужно ${this.ageCost(r)} богатства`;
    return null;
  }
  /** How many risen dead the lord may hold at once: grows with the waves the village held and its age. */
  hordeMax() { const g = this.game; return Math.min(45, 8 + (g.waves?.currentWave | 0) * 2 + (g.state.age | 0) * 2); }
  /** Dark power a second: faster at night, and more as the host's village grows. */
  hordeRegen() { const g = this.game; return (g.state.isNight ? 2.2 : 0.7) * (1 + 0.12 * (g.state.age | 0)); }
  costOf(e) { return Math.ceil(e[2] * (this.game.state.isNight ? 1 : DAY_MUL)); }
  recruitCost(r) { return 25 + r.tier * 12; }
  _villageCenter() { const th = this.game.village?.townHall; return th?.center || { x: this.game.world.size / 2, z: this.game.world.size / 2 }; }

  /** At dusk the dead also come for every town a player commands. */
  _nightAssault() {
    const g = this.game, R = this.rivals, W = g.waves;
    if (!R?.active || !W) return;
    for (const r of R.list) {
      if (r.commander == null) continue;
      const n = Math.min(30, 5 + Math.round((W.currentWave | 0) * 0.9 + r.tier * 1.5));
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
    H.points = Math.min(HORDE_CAP, H.points + dt * this.hordeRegen());
    if (H.cd > 0) H.cd -= dt;
    this._t += dt;
    if (this._t < 1) return;
    this._t = 0;
    const R = this.rivals;
    for (const p of this.net.players?.values() || []) {
      if (p.role === 'rival') {
        const r = R?.get(p.town); if (!r) continue;
        const rel = (t) => (R.allied(r.i, t) ? 'ally' : R.sidesAtWar(r.i, t) ? 'war' : 'peace');
        const nb = this.nextBuild(r), a = AGES[r.tier];
        this.net._sendTo(p.cid, { t: 'siege', role: 'rival', town: {
          i: r.i, name: r.name, color: r.color, tier: r.tier, army: Math.floor(r.army), cap: r.armyCap, wealth: Math.floor(r.wealth), pop: Math.round(r.pop),
          income: Math.round((r.pop * 0.05 + r.tier * 0.4) * (r.drive || 1) * (1 + 0.1 * ((r.hall || 1) - 1)) * 60),
          hall: r.hall || 1, hallCost: this.hallCost(r), hallMax: Math.min(10, r.tier + 1), built: r.built, plan: R._plan(r).length,
          next: nb ? { name: nb.name, cost: nb.cost } : null,
          age: a && !a.soon ? { name: a.name, cost: this.ageCost(r), why: this.ageBlock(r), th: a.req.th, techs: a.req.techs } : null,
          techs: r.techs,
          study: TECH_ORDER.filter(id => !r.techs.includes(id) && TECHS[id].prereqs.every(q => r.techs.includes(q)) && (TECHS[id].tier || 0) <= r.tier).map(id => [id, TECHS[id].name, this.techCost(id)]),
          recruit: this.recruitCost(r), raid: r.raid ? { size: r.raid.size, eta: Math.round(r.raid.eta), arrived: r.raid.arrived, left: r.raid.units?.filter(u => !u.dead).length } : null,
          owner: r.owner, attackCd: Math.max(0, Math.ceil((r._attackCd || 0) - g.time)),
          host: { name: 'Деревня хозяина', rel: rel('P'), age: AGES[g.state.age | 0]?.name || '' },
          towns: R.list.filter(o => o !== r).map(o => ({ i: o.i, name: o.name, color: o.color, rel: rel(o.i), tier: o.tier, army: Math.floor(o.army), player: o.commanderName || null, subject: o.owner !== null })),
          offers: R.offersFor(r.i).map(o => ({ id: o.id, kind: o.kind, from: R.sideName(o.from) })),
        } });
      } else if (p.role === 'horde') {
        H.spawned = H.spawned.filter(z => !z.dead);
        if (!p.spawnAt || g.time - (p.spawnT || 0) > 10 || !!p.spawnNight !== g.state.isNight) { p.spawnAt = this._lordSpawn(); p.spawnT = g.time; p.spawnNight = g.state.isNight; }
        this.net._sendTo(p.cid, { t: 'siege', role: 'horde', spawn: p.spawnAt, horde: { points: Math.floor(H.points), cap: HORDE_CAP, cd: Math.ceil(Math.max(0, H.cd)), count: H.spawned.length, max: this.hordeMax(), wave: g.waves?.currentWave | 0, night: g.state.isNight, waveCost: WAVE_COST, day: g.state.day,
          regen: Math.round(this.hordeRegen() * 10) / 10, costs: Object.fromEntries(HORDE.map(e => [e[0], this.costOf(e)])), cds: Object.fromEntries(HORDE.map(e => [e[0], Math.max(0, Math.ceil((H.typeCd[e[0]] || 0) - g.time))])) } });
      }
    }
  }
}
