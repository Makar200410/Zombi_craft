// Network games on the local network. One player hosts: their game runs the world, the village and the undead as
// usual and shares them; friends join it and play in the same world as heroes (exploring, mining, building, fighting).
//
// Transport: the LAN server (electron/lan.cjs — started by the Windows app, or `node tools/lan-server.cjs`) relays
// WebSocket messages between the host and the players and also serves the game to phones' browsers.
//   host → player: welcome (world seed + edits + state), blocks (edits), snap (time, resources, nearby undead /
//                  villagers / other players, 10 times a second), vil (the village: buildings, people, research —
//                  once a second), hurt, item, toast
//   player → host: lobby (which towns are free, before joining), hello, pos (own hero), set (block edit), hit (damage
//                  dealt to an undead), craft, loot (what a player's chest or hunt gave their side), cmd (siege orders),
//                  vcmd (a village order: place / upgrade / demolish a building, jobs, research, a new age, a wave)
// A hero runs the village together with the host: their computer keeps a mirror of it (Village.applyMirror), the
// command mode works on that mirror and every order is carried out by the host.
// A joining player picks a side (see siege.js): a hero of the village, the commander of a rival town, or the lord
// of the dead.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { HumanoidModel } from '../entities/HumanoidModel.js';
import { Zombie } from '../enemies/Zombie.js';
import { villagerSkin, playerSkin } from '../art/skins.js';
import { JOBS } from '../village/names.js';
import { B, BLOCKS } from '../core/blocks.js';
import { encodeChanges, decodeChanges } from '../systems/save.js';
import { RECIPES } from '../systems/crafting.js';
import { ITEMS, HORDE_HOTBAR } from '../core/items.js';
import { Siege, ROLES } from './siege.js';
import { decodeBlueprint } from '../systems/blueprints.js';
import { advanceAge } from '../systems/ages.js';

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
    this.siege = new Siege(this);
    this.siegeRole = 'hero';    // a joined player's side
    this.siegeState = null;
  }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }
  get active() { return !!this.role; }

  init() {
    const g = this.game;
    g.bus.on('block:changed', ({ x, y, z, id }) => { if (this.isHost) this._edits.push(x, y, z, id); });
    g.bus.on('toast', (t) => {
      if (!this.isHost) return;
      if (t.share) this._sendAll({ t: 'toast', text: t.text, kind: t.kind });
      else if (this._toastTo != null) this._sendTo(this._toastTo, { t: 'toast', text: t.text, kind: t.kind });     // the answer to a joined player's order
    });
    // the village changed: the heroes' mirrors are brought up to date soon
    for (const ev of ['building:placed', 'building:completed', 'building:destroyed', 'building:removed', 'building:upgrading', 'villager:spawned', 'villager:job', 'research:done', 'research:started', 'age:changed']) {
      g.bus.on(ev, () => { if (this.isHost) this._vilDirty = true; });
    }
    g.bus.on('rivals:changed', () => {
      if (!this.isHost || this._rivT) return;
      this._rivT = setTimeout(() => { this._rivT = null; if (this.isHost) this._sendAll({ t: 'rivals', s: g.rivals?.serialize?.() }); }, 1500);
    });
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
    if (m.sys === 'join') return;                   // waits for the player's hello (or a lobby question)
    if (m.sys === 'leave') {
      const p = this.players.get(m.id);
      if (p) { this.siege.release(p); this.players.delete(m.id); g.entities.remove(p); g.bus.emit('toast', { text: `${p.playerName} покинул(а) игру`, kind: 'info' }); g.bus.emit('net:changed', {}); }
      return;
    }
    const id = m.from;
    let d; try { d = JSON.parse(m.d); } catch (e) { return; }
    const p = this.players.get(id);
    switch (d.t) {
      case 'lobby': this._sendTo(id, { t: 'lobby', towns: this.siege.lobbyTowns(), players: [...this.players.values()].map(q => q.playerName) }); break;
      case 'hello': {
        const name = String(d.name || 'Игрок').slice(0, 20);
        const rp = new RemotePlayer(g, this, id, name, PLAYER_COLORS[id % PLAYER_COLORS.length]);
        const side = this.siege.assign(rp, ROLES[d.role] ? d.role : 'hero', d.town ?? null);
        const sp0 = this._spawnPoint(), sp = side.spawn ? { x: side.spawn[0], y: side.spawn[1], z: side.spawn[2] } : sp0;
        rp.setNet(sp.x, sp.y, sp.z, 0);
        g.entities.add(rp);
        this.players.set(id, rp);
        this._sendTo(id, {
          t: 'welcome', you: id, seed: g.world.seed, size: g.world.size, format: g.world.format, role: side.role, town: side.town ?? null,
          changes: encodeChanges(g.world.changes || new Map()), state: g.state.serialize(), spawn: [sp.x, sp.y, sp.z],
          owned: [...(g.crafting?.owned || [])], wave: g.waves?.currentWave | 0, rivals: g.rivals?.serialize?.(),
          vil: side.role === 'hero' ? this._villageSnap() : null,
        });
        g.bus.emit('toast', { text: `${name} присоединился(ась) к игре!`, kind: 'good' });
        g.audio?.play('quest_done', { volume: 0.6 });
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
      case 'loot': if (p) this._remoteLoot(p, d.res); break;
      case 'cmd': if (p) this.siege.command(p, d); break;
      case 'vcmd': if (p && p.role === 'hero') this._villageCmd(id, p, d); break;
      case 'bp': if (p) { this._takeBlueprint(d.code, p.playerName); this._sendAll({ t: 'bp', code: d.code, from: p.playerName }); } break;
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
    const rp = this.players.get(id);
    // the lord of the dead can't touch the world; a town's commander builds with his town's wealth
    if (rp?.role === 'horde') { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
    const town = rp?.role === 'rival' ? g.rivals?.get(rp.town) : null;
    if (town) {
      const sum = (o) => Object.values(o || {}).reduce((a, n) => a + n, 0);
      if (bid === B.AIR) {
        if (!isFinite(BLOCKS[prev]?.hardness)) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
        w.breakBlock(x, y, z, null); town.wealth += sum(BLOCKS[prev]?.drop);
        return;
      }
      const cost = sum(BLOCKS[bid]?.cost);
      if (!BLOCKS[bid] || town.wealth < cost) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); this._sendTo(id, { t: 'toast', text: `Казне «${town.name}» не хватает богатства`, kind: 'bad' }); return; }
      town.wealth -= cost; w.setBlock(x, y, z, bid);
      return;
    }
    if (bid === B.AIR) {
      if (!isFinite(BLOCKS[prev]?.hardness)) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
      // a chest is opened on the joined player's own computer: its weapon is theirs and its goods come as 'loot'
      w.breakBlock(x, y, z, prev === B.CHEST ? 'remote' : 'player');
      return;
    }
    const b = BLOCKS[bid];
    if (!b || !g.state.spend(b.cost || {})) { this._sendTo(id, { t: 'blocks', b: [x, y, z, prev] }); return; }
    w.setBlock(x, y, z, bid);
  }
  /** Goods a joined player found (a chest, a hunt): into their side's stores — the host's village or their town. */
  _remoteLoot(p, res) {
    const g = this.game, got = {};
    for (const k in res || {}) { const n = Math.max(0, Math.min(60, res[k] | 0)); if (n) got[k] = n; }
    if (!Object.keys(got).length) return;
    if (p.role === 'hero') g.state.addAll(got);
    else if (p.role === 'rival') { const r = g.rivals?.get(p.town); if (r) r.wealth += Object.values(got).reduce((a, n) => a + n, 0); }
  }
  _remoteCraft(id, rid) {
    const g = this.game, r = RECIPES.find(x => x.id === rid);
    if (!r) return;
    const rp = this.players.get(id);
    if (rp?.role === 'horde') return;
    if (rp?.role === 'rival') {
      // a town's ruler: its own research, paid from its treasury
      const town = g.rivals?.get(rp.town);
      if (!town || r.kind !== 'item') { this._sendTo(id, { t: 'toast', text: 'Плавильные печи есть только в деревне хозяина', kind: 'bad' }); return; }
      const need = ITEMS[r.item]?.research;
      if (need && !town.techs?.includes(need)) { this._sendTo(id, { t: 'toast', text: 'Нужно исследование вашей деревни', kind: 'bad' }); return; }
      const cost = Object.values(r.in || {}).reduce((a, n) => a + n, 0);
      if (town.wealth < cost) { this._sendTo(id, { t: 'toast', text: `В казне не хватает богатства (${cost})`, kind: 'bad' }); return; }
      town.wealth -= cost;
      this._sendTo(id, { t: 'item', item: r.item });
      return;
    }
    if (!g.state.canAfford(r.in)) { this._sendTo(id, { t: 'toast', text: 'В деревне не хватает ресурсов', kind: 'bad' }); return; }
    if (r.kind === 'item' && !g.crafting.researched(r.item)) { this._sendTo(id, { t: 'toast', text: 'Нужно исследование', kind: 'bad' }); return; }
    g.state.spend(r.in);
    if (r.kind === 'item') this._sendTo(id, { t: 'item', item: r.item });
    else { g.crafting.queue.push({ id: r.id, left: r.time, total: r.time }); this._sendTo(id, { t: 'toast', text: 'Печь деревни взялась за работу', kind: 'info' }); }
  }

  /** The village as a hero's mirror needs it. */
  _villageSnap() {
    const g = this.game, R = g.research;
    return { t: 'vil', vil: g.village?.mirrorState?.() || null, r: R?.serialize?.() || null, rate: R?.rate || 0, done: [...g.state.researchDone], items: [...(g.state.unlockedItems || [])], age: g.state.age | 0 };
  }
  _sendVillage() {
    this._vilDirty = false; this._vilT = 0;
    const heroes = [...this.players.values()].filter(p => p.role === 'hero');
    if (!heroes.length) return;
    const msg = this._villageSnap();
    for (const p of heroes) this._sendTo(p.cid, msg);
  }
  /** A hero's village order, carried out here as if the host gave it (the answers go back to that player). */
  _villageCmd(id, p, d) {
    const g = this.game, V = g.village;
    if (!V) return;
    const vil = (vid) => V.villagers.find(v => v.id === vid && !v.dead) || null;
    this._toastTo = id;
    try {
      switch (d.op) {
        case 'place': if (V.placeBuilding(String(d.type), +d.x, +d.z, (d.rot | 0) & 3)) g.bus.emit('toast', { text: `${p.playerName} заложил(а): ${V.buildings[V.buildings.length - 1]?.def?.name || 'здание'}`, kind: 'info' }); break;
        case 'demolish': { const b = V.byId.get(d.id); if (b) V.demolish(b); break; }
        case 'upgrade': { const b = V.byId.get(d.id); if (b) V.startUpgrade(b); break; }
        case 'assign': { const v = vil(d.v); if (v) V.assign(v, d.b != null ? V.byId.get(d.b) || null : null, d.job || null); break; }
        case 'setjob': { const v = vil(d.v); if (v) V.setJob(v, d.job); break; }
        case 'builders': V.setBuilderCount(d.n | 0); break;
        case 'auto': V.autoAssign(d.only != null ? V.byId.get(d.only) || null : null); break;
        case 'research': if (!g.research?.start(d.id)) g.bus.emit('toast', { text: g.research?.blockReason?.(d.id) || 'Исследование недоступно', kind: 'bad' }); else g.bus.emit('toast', { text: `${p.playerName} начал(а) исследование`, kind: 'info' }); break;
        case 'rcancel': g.research?.cancel(); break;
        case 'age': advanceAge(g); break;
        case 'wave': if (!g.waves?.startWaveNow()) g.bus.emit('toast', { text: 'Сейчас волну не вызвать', kind: 'bad' }); break;
      }
    } catch (e) { console.error('village order failed', d.op, e); }
    finally { this._toastTo = null; }
    this._sendVillage();
  }

  _hostTick() {
    const g = this.game;
    if (this._edits.length) {
      // block edits for everyone (big bursts are sent in pieces)
      for (let i = 0; i < this._edits.length; i += 4000) this._sendAll({ t: 'blocks', b: this._edits.slice(i, i + 4000) });
      this._edits = [];
    }
    if (!this.players.size) return;
    this._vilT = (this._vilT || 0) + 1;
    if (this._vilT >= 10 || (this._vilDirty && this._vilT >= 3)) this._sendVillage();
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
  /** Asks the host at addr which towns can be led (before joining). Returns {ok, towns, players} or {ok:false, reason}. */
  async lobby(addr) {
    addr = String(addr || '').trim().replace(/^(https?|wss?):\/\//, '').replace(/\/.*$/, '');
    if (!addr) return { ok: false, reason: 'Введите адрес' };
    if (!addr.includes(':')) addr += ':' + LAN_PORT;
    let ws;
    try { ws = new WebSocket(`ws://${addr}/zc?role=client`); } catch (e) { return { ok: false, reason: 'Не удалось подключиться' }; }
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(tm); try { ws.close(); } catch (e) { /* ignore */ } resolve(v); };
      const tm = setTimeout(() => done({ ok: false, reason: 'Хозяин не ответил' }), 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'lobby' }));
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'lobby') done({ ok: true, towns: m.towns || [], players: m.players || [] }); else if (m.t === 'nohost') done({ ok: false, reason: 'На этом компьютере мир ещё не открыт для сети' }); };
      ws.onerror = () => done({ ok: false, reason: 'Не удалось подключиться к ' + addr });
    });
  }
  async join(addr, name, progress = () => {}, role = 'hero', town = null) {
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
      this.myName = name || 'Игрок';
      this.ws.send(JSON.stringify({ t: 'hello', name: name || 'Игрок', role, town }));
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
    if (welcome.rivals) g.rivals?.deserialize(welcome.rivals);        // the towns are drawn into the chunks as they appear
    g.village?.reset?.();
    if (g.village) g.village.mirror = (welcome.role || 'hero') === 'hero';
    if (g.village) g.village.netSpawn = new THREE.Vector3(...welcome.spawn);
    this.role = 'client';
    this.me = welcome.you;
    this.siegeRole = welcome.role || 'hero'; this.siegeTown = welcome.town; this.siegeState = null;
    this.proxies = new Map();
    this.heroes = new Map();
    // the friend's computer runs the village, the undead, research and saving
    this._systems = g.systems;
    g.systems = g.systems.filter(s => s !== g.village && s !== g.waves && s !== g.research && s !== g.quests && s !== g.save);
    // a hero's copy of the village: placement, ghosts and labels (its life runs on the host)
    if (g.village?.mirror) g.systems.push({ update: (dt) => g.village.mirrorUpdate(dt) });
    this.ws.onmessage = (ev) => this._clientMsg(ev.data);
    this.ws.onclose = () => { if (this.isClient) this._leave('Связь с хозяином потеряна'); };
    g.begin({ loaded: true });
    if (welcome.vil) this._applyVillage(welcome.vil);
    const p = g.player;
    if (p) { p.revive?.(); p.position.set(...welcome.spawn); p.velocity.set(0, 0, 0); }
    const hello = {
      hero: 'Вы в мире друга! Деревня у вас общая: стройте, улучшайте, назначайте жителей и ведите исследования в «Командовании» (Tab), исследуйте мир и сражайтесь.',
      rival: 'Вы правите своей деревней! «Командование» (G): стройте, улучшайте ратушу, изучайте технологии, ведите деревню в новые эпохи, нанимайте войско, объявляйте войны и заключайте союзы. Ночью мёртвые придут и к вам.',
      horde: 'Вы — Повелитель нежити! Ваша панель внизу — это мертвецы: выберите цифрой 1–9 и кликните ЛКМ по земле, чтобы поднять его там. Тёмная сила копится сама (ночью втрое быстрее). G — командование: призыв ночи и группы по 5.',
    };
    g.bus.emit('toast', { text: hello[this.siegeRole] || hello.hero, kind: 'good' });
    // the lord of the dead holds the dead he can call instead of weapons (his own hotbar comes back when he leaves)
    if (this.siegeRole === 'horde' && p) { this._ownHotbar = [...p.hotbar]; p.hotbar = [...HORDE_HOTBAR]; p.selected = 0; p._emitHotbar?.(); g.bus.emit('hotbar:changed', {}); }
    g.bus.emit('siege:role', { role: this.siegeRole });
    g.bus.emit('net:changed', {});
    progress(1, '');
    return { ok: true };
  }
  _leave(why) {
    const g = this.game;
    if (this._ownHotbar && g.player) { g.player.hotbar = this._ownHotbar; this._ownHotbar = null; g.bus.emit('hotbar:changed', {}); }
    this.siegeRole = 'hero'; this.siegeState = null; g.bus.emit('siege:role', { role: 'hero' });
    for (const e of this.proxies?.values() || []) g.entities.remove(e);
    for (const e of this.heroes?.values() || []) g.entities.remove(e);
    this.proxies = null; this.heroes = null;
    if (this._systems) { g.systems = this._systems; this._systems = null; }
    this.role = null;
    try { this.ws?.close(); } catch (e) { /* ignore */ }
    this.ws = null;
    if (g.village) { g.village.netSpawn = null; if (g.village.mirror) { g.village.mirror = false; g.village._netV = null; g.village.reset(); } }
    g.bus.emit('net:changed', {});
    if (g.running) { g.ui?.quitToMenu?.(true); g.bus.emit('toast', { text: why, kind: 'warn' }); }
  }
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  /** Workshop: send a blueprint code to everyone in the game (through the host). */
  shareBlueprint(code) {
    if (this.isHost) this._sendAll({ t: 'bp', code, from: 'Хозяин' });
    else this.send({ t: 'bp', code });
  }
  _takeBlueprint(code, from) {
    const bp = decodeBlueprint(code); if (!bp) return;
    this.game.blueprints?.add(bp);
    this.game.bus.emit('toast', { text: `${from || 'Игрок'} поделился(ась) чертежом «${bp.name}»: Строительство → Чертежи`, kind: 'good' });
  }
  /** A siege order from a joined commander / lord of the dead (see siege.js). */
  command(c, extra = {}) { this.send({ t: 'cmd', c, ...extra }); }
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
      case 'vil': this._applyVillage(m); break;
      case 'hurt': g.player?.damage?.(m.amount, null, { kind: m.kind, fromNet: true }); break;
      case 'item':
        g.crafting?.owned.add(m.item); g.crafting?._equip?.(m.item);
        g.bus.emit('toast', { text: 'Создано: ' + (ITEMS[m.item]?.name || m.item), kind: 'good' });
        g.audio?.play('quest_done', { volume: 0.7 });
        break;
      case 'toast': g.bus.emit('toast', { text: m.text, kind: m.kind }); break;
      case 'rivals': g.rivals?.deserialize(m.s); g.rivals?._restampLoaded(); break;
      case 'techs': if (this.siegeRole === 'rival') g.state.researchDone = new Set(m.techs || []); break;
      case 'siege':
        this.siegeState = m;
        if (m.role === 'rival' && m.town) {
          // a ruler's own town: its research opens their recipes, its treasury is what they have
          g.state.researchDone = new Set(m.town.techs || []);
          for (const k in g.state.resources) g.state.resources[k] = 0;
          g.state.resources.gold = m.town.wealth;
          g.bus.emit('resources:changed', { resources: g.state.resources });
        }
        if (m.spawn && g.village) g.village.netSpawn = new THREE.Vector3(...m.spawn);      // the lord rises near the host (by day in a cave)
        g.bus.emit('siege:state', m);
        break;
      case 'bp': if (m.from !== this.myName) this._takeBlueprint(m.code, m.from); break;
    }
  }
  /** The host's village, research and age, into this hero's mirror. */
  _applyVillage(m) {
    const g = this.game, st = g.state;
    if (m.vil && g.village?.mirror) g.village.applyMirror(m.vil);
    if (m.r && g.research) { g.research.deserialize(m.r); g.research.rate = m.rate || 0; }
    if (m.items) st.unlockedItems = new Set(m.items);
    if (m.done) {
      const fresh = m.done.filter(id => !st.researchDone.has(id));
      st.researchDone = new Set(m.done);
      for (const id of fresh) { g.bus.emit('research:done', { id }); g.bus.emit('toast', { text: 'Исследование завершено: ' + (g.research?.techs?.[id]?.name || id), kind: 'good' }); }
      if (fresh.length) g.audio?.play?.('research_done');
    }
    if (typeof m.age === 'number' && m.age !== (st.age | 0)) { st.age = m.age; g.bus.emit('age:changed', { age: m.age }); }
  }
  _applySnap(m) {
    const g = this.game, st = g.state;
    st.timeOfDay = m.tod; st.day = m.day;
    const own = this.siegeRole === 'hero';          // a ruler of another town keeps their own age and treasury
    if (own) st.age = m.age;
    if (m.res && own) { for (const k in st.resources) st.resources[k] = 0; Object.assign(st.resources, m.res); g.bus.emit('resources:changed', { resources: st.resources }); }
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
        if (g.village?.mirror && g.village.mirrorMove(id, e[5], e[6], e[7], e[8])) { seen.delete(id); continue; }
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
    if (this.isHost && this.players?.size) this.siege.update(dt);
    this._t += dt;
    if (this._t < TICK) return;
    this._t = 0;
    if (this.isHost) { this._hostTick(); return; }
    const p = this.game.player;
    if (p) this.send({ t: 'pos', p: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)], yaw: +p.yaw.toFixed(2), hp: Math.round(p.hp), dead: p.dead ? 1 : 0, item: p.itemId || null, a: p.model?.action || '' });
  }
}
