// Network games on the local network. One player hosts: their game runs the world, the village and the undead as
// usual and shares them; friends join it and play in the same world as heroes (exploring, mining, building, fighting).
//
// Transport: the LAN server (electron/lan.cjs — started by the Windows app, or `node tools/lan-server.cjs`) relays
// WebSocket messages between the host and the players and also serves the game to phones' browsers.
//   host → player: welcome (world seed + edits + state), blocks (edits), snap (time, resources, nearby undead /
//                  villagers / other players, 10 times a second), hurt, item, toast
//   player → host: hello, pos (own hero), set (block edit), hit (damage dealt to an undead), craft
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { HumanoidModel } from '../entities/HumanoidModel.js';
import { Zombie } from '../enemies/Zombie.js';
import { villagerSkin, playerSkin } from '../art/skins.js';
import { JOBS } from '../village/names.js';
import { B, BLOCKS } from '../core/blocks.js';
import { encodeChanges, decodeChanges } from '../systems/save.js';
import { RECIPES } from '../systems/crafting.js';
import { ITEMS } from '../core/items.js';

export const LAN_PORT = 27015;
const TICK = 0.1;            // snapshot / position rate (s)
const VIEW = 110;            // undead & villagers sent within this distance of a player
const PLAYER_COLORS = ['#e8c040', '#40c0ff', '#ff6a5a', '#7aff60', '#d080ff', '#ffa040'];

// ------------------------------------------------------------------ a figure moved by the network
/** A person shown from network data (another player, or a villager on a joined game). */
export class NetFigure extends Entity {
  constructor(game, { kind = 'netfigure', faction = 'neutral', skin, height = 1.8, hat, hatColor, name = null, color = '#ffffff' } = {}) {
    super(game, { kind, faction, radius: 0.3, height, maxHp: 100 });
    this.model = new HumanoidModel({ skin, height, hat, hatColor });
    this.object3d.add(this.model.group);
    this.netPos = new THREE.Vector3(); this.netYaw = 0; this._first = true;
    this.speedNow = 0;
    if (name) this._label(name, color);
  }
  _label(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)'; const w = Math.min(250, g.measureText(text).width + 24); g.fillRect(128 - w / 2, 6, w, 36);
    g.fillStyle = color; g.fillText(text, 128, 25);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(2.2, 0.42, 1); s.position.y = this.height + 0.45; s.renderOrder = 8;
    this.object3d.add(s);
  }
  setNet(x, y, z, yaw) {
    this.netPos.set(x, y, z); this.netYaw = yaw;
    if (this._first) { this._first = false; this.position.copy(this.netPos); this.yaw = yaw; }
  }
  update(dt) {
    const k = Math.min(1, dt * 12);
    const ox = this.position.x, oz = this.position.z;
    this.position.lerp(this.netPos, k);
    if (this.position.distanceTo(this.netPos) > 8) this.position.copy(this.netPos);
    let d = this.netYaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k;
    const sp = Math.hypot(this.position.x - ox, this.position.z - oz) / Math.max(dt, 1e-3);
    this.speedNow += (sp - this.speedNow) * Math.min(1, dt * 8);
    this.tickStatus?.(0);
    this.model.update(dt, this.speedNow);
    this.syncObject(dt);
  }
}

/** On the host: a joined player's hero. The undead hunt it; their blows are sent to that player. */
class RemotePlayer extends NetFigure {
  constructor(game, net, id, name, color) {
    super(game, { kind: 'netplayer', faction: 'village', skin: playerSkin(), name, color });
    this.net = net; this.cid = id; this.playerName = name;
  }
  damage(amount, source, opts = {}) {
    if (this.dead || this.hidden || amount <= 0) return false;
    this.net._sendTo(this.cid, { t: 'hurt', amount: Math.round(amount * 10) / 10, kind: opts.kind || 'phys' });
    this.model.flash(0xff3030);
    this.game.bus.emit('damage:number', { pos: this.eye.clone(), amount: Math.round(amount), kind: opts.kind || 'phys', target: this });
    return false;
  }
}

// ------------------------------------------------------------------ the network game
export class Net {
  constructor(game) {
    this.game = game;
    this.role = null;           // null | 'host' | 'client'
    this.ws = null;
    this._t = 0;
  }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }
  get active() { return !!this.role; }

  init() {
    const g = this.game;
    g.bus.on('block:changed', ({ x, y, z, id }) => { if (this.isHost) this._edits.push(x, y, z, id); });
    g.bus.on('toast', (t) => { if (this.isHost && t.share) this._sendAll({ t: 'toast', text: t.text, kind: t.kind }); });
  }

  // ================================================================ hosting
  /** Opens the current world to the network. Returns {ok, addresses|reason}. */
  async host() {
    const g = this.game;
    if (this.active) return { ok: true, addresses: this.addresses };
    let port = LAN_PORT, ips = [];
    if (window.zcDesktop?.startLan) {
      try { const r = await window.zcDesktop.startLan(LAN_PORT); port = r.port; ips = r.ips || []; } catch (e) { return { ok: false, reason: 'Не удалось запустить сервер: ' + (e.message || e) }; }
    }
    const ok = await this._connect(`ws://127.0.0.1:${port}/zc?role=host`);
    if (!ok) return { ok: false, reason: window.zcDesktop ? 'Сервер не отвечает' : 'Создать сервер можно в версии игры для Windows (или запустив node tools/lan-server.cjs на компьютере). С телефона можно подключиться к другу.' };
    this.role = 'host';
    this.players = new Map();   // id -> RemotePlayer
    this._edits = [];
    this.addresses = ips.map(ip => ip + ':' + port);
    this.ws.onmessage = (ev) => this._hostMsg(ev.data);
    this.ws.onclose = () => { if (this.isHost) { this._stopHost(); g.bus.emit('toast', { text: 'Сетевая игра закрыта', kind: 'warn' }); } };
    g.bus.emit('net:changed', {});
    return { ok: true, addresses: this.addresses };
  }
  _stopHost() {
    for (const p of this.players?.values() || []) this.game.entities.remove(p);
    this.players = null;
    this.role = null;
    try { this.ws?.close(); } catch (e) { /* ignore */ }
    this.ws = null;
    window.zcDesktop?.stopLan?.();
    this.game.bus.emit('net:changed', {});
  }
  stop() {
    if (this.isHost) this._stopHost();
    else if (this.isClient) this._leave('Вы вышли из сетевой игры');
  }
  _sendTo(id, msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ to: id, d: JSON.stringify(msg) })); }
  _sendAll(msg) { if (this.ws?.readyState === 1 && this.players?.size) this.ws.send(JSON.stringify({ to: '*', d: JSON.stringify(msg) })); }

  _hostMsg(raw) {
    const g = this.game;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.sys === 'join') return;                   // waits for the player's hello
    if (m.sys === 'leave') {
      const p = this.players.get(m.id);
      if (p) { this.players.delete(m.id); g.entities.remove(p); g.bus.emit('toast', { text: `${p.playerName} покинул(а) игру`, kind: 'info' }); g.bus.emit('net:changed', {}); }
      return;
    }
    const id = m.from;
    let d; try { d = JSON.parse(m.d); } catch (e) { return; }
    const p = this.players.get(id);
    switch (d.t) {
      case 'hello': {
        const name = String(d.name || 'Игрок').slice(0, 20);
        const rp = new RemotePlayer(g, this, id, name, PLAYER_COLORS[id % PLAYER_COLORS.length]);
        const sp = this._spawnPoint();
        rp.setNet(sp.x, sp.y, sp.z, 0);
        g.entities.add(rp);
        this.players.set(id, rp);
        this._sendTo(id, {
          t: 'welcome', you: id, seed: g.world.seed, size: g.world.size, format: g.world.format,
          changes: encodeChanges(g.world.changes || new Map()), state: g.state.serialize(), spawn: [sp.x, sp.y, sp.z],
          owned: [...(g.crafting?.owned || [])], wave: g.waves?.currentWave | 0,
        });
        g.bus.emit('toast', { text: `${name} присоединился(ась) к игре!`, kind: 'good' });
        g.audio?.play('level_up', { volume: 0.5 });
        g.bus.emit('net:changed', {});
        break;
      }
      case 'pos':
        if (!p) return;
        p.setNet(d.p[0], d.p[1], d.p[2], d.yaw);
        p.hp = d.hp; p.dead = false;
        p.hidden = !!d.dead; p.object3d.visible = !d.dead;
        if (d.item !== p._item) { p._item = d.item; try { p.model.setHeld(d.item || null); } catch (e) { /* ignore */ } }
        if (d.a && d.a !== p._a) p.model.play(d.a);
        p._a = d.a;
        break;
      case 'set': this._remoteSet(id, d.x, d.y, d.z, d.id); break;
      case 'hit': {
        const z = g.entities.list.find(e => e.id === d.id && e.kind === 'zombie');
        if (z && !z.dead && p) {
          const dir = new THREE.Vector3(z.position.x - p.position.x, 0, z.position.z - p.position.z).normalize();
          z.damage(Math.min(500, +d.dmg || 0), p, { kind: d.kind || 'phys', knockback: dir.multiplyScalar(3) });
        }
        break;
      }
      case 'craft': this._remoteCraft(id, d.id); break;
    }
  }
  _spawnPoint() {
    const g = this.game, th = g.village?.townHall;
    const p = g.player?.findSpawn?.() || new THREE.Vector3(g.world.size / 2, g.world.surfaceY(g.world.size / 2, g.world.size / 2) + 1, g.world.size / 2);
    void th;
    return p;
  }
  /** A joined player's block edit: breaking gives the village its drop, placing costs village resources. */
  _remoteSet(id, x, y, z, bid) {
    const g = this.game, w = g.world;
    if (!w.inBounds(x, y, z)) return;
    const prev = w.getBlock(x, y, z);
    if (prev === bid) return;
    if (bid === B.AIR) {
      if (!isFinite(BLOCKS[prev]?.hardness)) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
      w.breakBlock(x, y, z, 'player');
      return;
    }
    const b = BLOCKS[bid];
    if (!b || !g.state.spend(b.cost || {})) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
    w.setBlock(x, y, z, bid);
  }
  _remoteCraft(id, rid) {
    const g = this.game, r = RECIPES.find(x => x.id === rid);
    if (!r) return;
    if (!g.state.canAfford(r.in)) { this._sendTo(id, { t: 'toast', text: 'В деревне не хватает ресурсов', kind: 'bad' }); return; }
    if (r.kind === 'item' && !g.crafting.researched(r.item)) { this._sendTo(id, { t: 'toast', text: 'Нужно исследование', kind: 'bad' }); return; }
    g.state.spend(r.in);
    if (r.kind === 'item') this._sendTo(id, { t: 'item', item: r.item });
    else { g.crafting.queue.push({ id: r.id, left: r.time, total: r.time }); this._sendTo(id, { t: 'toast', text: 'Печь деревни взялась за работу', kind: 'info' }); }
  }

  _hostTick() {
    const g = this.game;
    if (this._edits.length) {
      // block edits for everyone (big bursts are sent in pieces)
      for (let i = 0; i < this._edits.length; i += 4000) this._sendAll({ t: 'blocks', b: this._edits.slice(i, i + 4000) });
      this._edits = [];
    }
    if (!this.players.size) return;
    const st = g.state;
    this._resT = (this._resT || 0) + 1;
    const base = { t: 'snap', tod: +st.timeOfDay.toFixed(4), day: st.day, age: st.age | 0, wave: g.waves?.currentWave | 0, weather: g.weather?.type };
    if (this._resT % 5 === 0) base.res = st.resources;
    // everybody: host + joined players
    const heroes = [];
    const hp = g.player;
    if (hp) heroes.push([0, 'Хозяин', +hp.position.x.toFixed(2), +hp.position.y.toFixed(2), +hp.position.z.toFixed(2), +hp.yaw.toFixed(2), hp.itemId || null, hp.dead ? 1 : 0, hp.model?.action || '']);
    for (const p of this.players.values()) heroes.push([p.cid, p.playerName, +p.netPos.x.toFixed(2), +p.netPos.y.toFixed(2), +p.netPos.z.toFixed(2), +p.netYaw.toFixed(2), p._item || null, p.hidden ? 1 : 0, p._a || '']);
    const zs = g.waves?.zombies || [], vs = g.village?.villagers || [];
    for (const p of this.players.values()) {
      const at = p.netPos, ents = [];
      for (const z of zs) {
        if (z.dead || z.emergeT > 0 || Math.abs(z.position.x - at.x) > VIEW || Math.abs(z.position.z - at.z) > VIEW) continue;
        ents.push([z.id, 'z', z.type, +z.position.x.toFixed(2), +z.position.y.toFixed(2), +z.position.z.toFixed(2), +z.yaw.toFixed(2), Math.round(z.hp), Math.round(z.maxHp), (z.diving ? 1 : 0) | (z.model?.action === 'attack' ? 2 : 0)]);
      }
      for (const v of vs) {
        if (v.dead || v.hidden || Math.abs(v.position.x - at.x) > VIEW || Math.abs(v.position.z - at.z) > VIEW) continue;
        ents.push([v.id, 'v', v.job, v.seed | 0, v.female ? 1 : 0, +v.position.x.toFixed(2), +v.position.y.toFixed(2), +v.position.z.toFixed(2), +v.yaw.toFixed(2)]);
      }
      this._sendTo(p.cid, { ...base, ents, heroes: heroes.filter(h => h[0] !== p.cid) });
    }
  }

  // ================================================================ joining
  /** Joins a friend's game at "ip[:port]". progress(p, text) shows loading. Returns {ok, reason}. */
  async join(addr, name, progress = () => {}) {
    const g = this.game;
    if (this.active) this.stop();
    addr = String(addr || '').trim().replace(/^(https?|wss?):\/\//, '').replace(/\/.*$/, '');
    if (!addr) return { ok: false, reason: 'Введите адрес' };
    if (!addr.includes(':')) addr += ':' + LAN_PORT;
    progress(0.05, 'Подключение к ' + addr + '…');
    const ok = await this._connect(`ws://${addr}/zc?role=client`);
    if (!ok) return { ok: false, reason: 'Не удалось подключиться к ' + addr + '. Проверьте адрес и что вы в одной сети.' };
    const welcome = await new Promise((resolve) => {
      const tm = setTimeout(() => resolve(null), 15000);
      this.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'welcome' || m.t === 'nohost') { clearTimeout(tm); resolve(m); } };
      this.ws.onclose = () => { clearTimeout(tm); resolve(null); };
      this.ws.send(JSON.stringify({ t: 'hello', name: name || 'Игрок' }));
    });
    if (!welcome || welcome.t !== 'welcome') { try { this.ws?.close(); } catch (e) { /* ignore */ } this.ws = null; return { ok: false, reason: welcome?.t === 'nohost' ? 'На этом компьютере мир ещё не открыт для сети' : 'Хозяин не ответил' }; }
    // the host's world: same seed, plus every edit made in it
    g.running = false;
    await g.setup({ seed: welcome.seed, size: welcome.size, format: welcome.format }, (p, t) => progress(0.1 + p * 0.8, t || 'Загрузка мира друга…'));
    const w = g.world;
    const changes = decodeChanges(welcome.changes);
    w.applyChanges(changes);
    w.computeAllLight();
    g.chunkRenderer?.buildAll?.();
    w.changes = changes;
    g.state.deserialize(welcome.state || {});
    if (g.crafting) { g.crafting.owned = new Set([...(g.crafting.owned || []), ...(welcome.owned || [])]); g.crafting.queue = []; }
    if (g.waves) g.waves.currentWave = welcome.wave | 0;
    g.village?.reset?.();
    if (g.village) g.village.netSpawn = new THREE.Vector3(...welcome.spawn);
    this.role = 'client';
    this.me = welcome.you;
    this.proxies = new Map();
    this.heroes = new Map();
    // the friend's computer runs the village, the undead, research and saving
    this._systems = g.systems;
    g.systems = g.systems.filter(s => s !== g.village && s !== g.waves && s !== g.research && s !== g.quests && s !== g.save);
    this.ws.onmessage = (ev) => this._clientMsg(ev.data);
    this.ws.onclose = () => { if (this.isClient) this._leave('Связь с хозяином потеряна'); };
    g.begin({ loaded: true });
    const p = g.player;
    if (p) { p.revive?.(); p.position.set(...welcome.spawn); p.velocity.set(0, 0, 0); }
    g.bus.emit('toast', { text: 'Вы в мире друга! Деревней управляет хозяин, а вы — герой: исследуйте, стройте, сражайтесь.', kind: 'good' });
    g.bus.emit('net:changed', {});
    progress(1, '');
    return { ok: true };
  }
  _leave(why) {
    const g = this.game;
    for (const e of this.proxies?.values() || []) g.entities.remove(e);
    for (const e of this.heroes?.values() || []) g.entities.remove(e);
    this.proxies = null; this.heroes = null;
    if (this._systems) { g.systems = this._systems; this._systems = null; }
    this.role = null;
    try { this.ws?.close(); } catch (e) { /* ignore */ }
    this.ws = null;
    if (g.village) g.village.netSpawn = null;
    g.bus.emit('net:changed', {});
    if (g.running) { g.ui?.quitToMenu?.(true); g.bus.emit('toast', { text: why, kind: 'warn' }); }
  }
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  /** A joined player's block edit (applied locally right away, made real by the host). */
  sendSet(x, y, z, id) { this.send({ t: 'set', x, y, z, id }); }
  /** Damage dealt to an undead shown here (the host applies it). */
  sendHit(z, amount, kind) { if (z.netId) this.send({ t: 'hit', id: z.netId, dmg: Math.round(amount * 10) / 10, kind }); }

  _clientMsg(raw) {
    const g = this.game;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    switch (m.t) {
      case 'blocks': {
        const b = m.b, w = g.world;
        for (let i = 0; i < b.length; i += 4) {
          w.setBlock(b[i], b[i + 1], b[i + 2], b[i + 3], { fromNet: true });
          w.changes?.set(w.index(b[i], b[i + 1], b[i + 2]), b[i + 3]);
        }
        break;
      }
      case 'snap': this._applySnap(m); break;
      case 'hurt': g.player?.damage?.(m.amount, null, { kind: m.kind, fromNet: true }); break;
      case 'item':
        g.crafting?.owned.add(m.item); g.crafting?._equip?.(m.item);
        g.bus.emit('toast', { text: 'Создано: ' + (ITEMS[m.item]?.name || m.item), kind: 'good' });
        g.audio?.play('level_up', { volume: 0.7 });
        break;
      case 'toast': g.bus.emit('toast', { text: m.text, kind: m.kind }); break;
    }
  }
  _applySnap(m) {
    const g = this.game, st = g.state;
    st.timeOfDay = m.tod; st.day = m.day; st.age = m.age;
    if (m.res) { for (const k in st.resources) st.resources[k] = 0; Object.assign(st.resources, m.res); g.bus.emit('resources:changed', { resources: st.resources }); }
    if (g.waves) g.waves.currentWave = m.wave;
    if (m.weather && g.weather && g.weather.type !== m.weather) g.weather.set(m.weather);
    // undead and villagers near us
    const seen = new Set();
    for (const e of m.ents || []) {
      const id = e[0];
      seen.add(id);
      let px = this.proxies.get(id);
      if (e[1] === 'z') {
        if (!px) {
          px = new Zombie(g, e[2], { emerge: false, seed: id, cave: true, sunproof: true });
          px.netRemote = true; px.netId = id; px.flying = true;
          px.position.set(e[3], e[4], e[5]); px.yaw = e[6];
          g.entities.add(px);
          this.proxies.set(id, px);
        }
        px.netPos = px.netPos || new THREE.Vector3();
        px.netPos.set(e[3], e[4], e[5]); px.netYaw = e[6];
        px.hp = e[7]; px.maxHp = e[8];
        px.diving = !!(e[9] & 1);
        if (e[9] & 2 && !px.model.action) px.model.play('attack');
      } else {
        if (!px) {
          const J = JOBS[e[2]] || JOBS.idle;
          let skin = null; try { skin = villagerSkin(e[2], e[3]); } catch (er) { skin = null; }
          if (!skin) { skin = document.createElement('canvas'); skin.width = skin.height = 64; }
          px = new NetFigure(g, { kind: 'netvillager', faction: 'village', skin, height: e[4] ? 1.74 : 1.8, hat: J.hat, hatColor: J.hatColor });
          try { px.model.setHeld(J.tool || null); } catch (er) { /* ignore */ }
          g.entities.add(px);
          this.proxies.set(id, px);
        }
        px.setNet(e[5], e[6], e[7], e[8]);
      }
    }
    for (const [id, px] of this.proxies) if (!seen.has(id)) {
      this.proxies.delete(id);
      if (px.kind === 'zombie' && px.hp <= 0) px.netDie?.(); else g.entities.remove(px);
    }
    // other heroes
    const seenH = new Set();
    for (const h of m.heroes || []) {
      const id = h[0];
      seenH.add(id);
      let f = this.heroes.get(id);
      if (!f) {
        f = new NetFigure(g, { kind: 'netplayer', faction: 'village', skin: playerSkin(), name: h[1], color: id === 0 ? '#ffd860' : PLAYER_COLORS[id % PLAYER_COLORS.length] });
        g.entities.add(f);
        this.heroes.set(id, f);
      }
      f.setNet(h[2], h[3], h[4], h[5]);
      if (h[6] !== f._item) { f._item = h[6]; try { f.model.setHeld(h[6] || null); } catch (e) { /* ignore */ } }
      f.object3d.visible = !h[7];
      if (h[8] && h[8] !== f._a) f.model.play(h[8]);
      f._a = h[8];
    }
    for (const [id, f] of this.heroes) if (!seenH.has(id)) { this.heroes.delete(id); g.entities.remove(f); }
  }

  _connect(url) {
    return new Promise((resolve) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { resolve(false); return; }
      const tm = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } resolve(false); }, 5000);
      ws.onopen = () => { clearTimeout(tm); this.ws = ws; resolve(true); };
      ws.onerror = () => { clearTimeout(tm); resolve(false); };
    });
  }

  update(dt) {
    if (!this.active) return;
    this._t += dt;
    if (this._t < TICK) return;
    this._t = 0;
    if (this.isHost) { this._hostTick(); return; }
    const p = this.game.player;
    if (p) this.send({ t: 'pos', p: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)], yaw: +p.yaw.toFixed(2), hp: Math.round(p.hp), dead: p.dead ? 1 : 0, item: p.itemId || null, a: p.model?.action || '' });
  }
}
