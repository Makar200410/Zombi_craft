// Worlds (like Minecraft): any number of saved worlds, each with its own name. The list of worlds (small meta
// data) lives in localStorage; the world data itself in IndexedDB (plenty of room), with localStorage as a fallback.
// World block edits are stored compactly: sorted indices, delta + run-length encoded as varints, then base64.
const KEY = 'zc_save_v1';            // the single save of older versions (migrated into the world list)
const INDEX = 'zc_worlds_v1';        // [{id, name, created, savedAt, day, age, difficulty, waves}]
const LAST = 'zc_world_last';
const LS_PREFIX = 'zc_world_';
const VERSION = 1;
const AUTOSAVE_EVERY = 120;   // seconds of played time

// ---- binary helpers ----------------------------------------------------------------------------
class ByteWriter {
  constructor(n = 1024) { this.buf = new Uint8Array(n); this.len = 0; }
  _grow(n) { if (this.len + n > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.len + n)); b.set(this.buf); this.buf = b; } }
  byte(v) { this._grow(1); this.buf[this.len++] = v & 255; }
  varint(v) { this._grow(5); while (v >= 0x80) { this.buf[this.len++] = (v & 0x7f) | 0x80; v = Math.floor(v / 128); } this.buf[this.len++] = v; }
  bytes() { return this.buf.subarray(0, this.len); }
}
class ByteReader {
  constructor(b) { this.b = b; this.p = 0; }
  get done() { return this.p >= this.b.length; }
  byte() { return this.b[this.p++]; }
  varint() { let v = 0, mul = 1, x; do { x = this.b[this.p++]; v += (x & 0x7f) * mul; mul *= 128; } while (x & 0x80 && this.p < this.b.length); return v; }
}
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** Map<index,id> -> base64 string. Runs of consecutive indices with the same id collapse. */
export function encodeChanges(map) {
  const w = new ByteWriter(Math.max(64, map.size * 3));
  const keys = [...map.keys()].sort((a, b) => a - b);
  let prev = 0, i = 0;
  while (i < keys.length) {
    const start = keys[i], id = map.get(start);
    let run = 1;
    while (i + run < keys.length && keys[i + run] === start + run && map.get(keys[i + run]) === id) run++;
    w.varint(start - prev); w.varint(run); w.byte(id);
    prev = start + run - 1;
    i += run;
  }
  return toB64(w.bytes());
}
export function decodeChanges(str) {
  const out = new Map();
  if (!str) return out;
  const r = new ByteReader(fromB64(str));
  let prev = 0;
  while (!r.done) {
    const start = prev + r.varint(), run = r.varint(), id = r.byte();
    for (let k = 0; k < run; k++) out.set(start + k, id);
    prev = start + run - 1;
  }
  return out;
}

// ---- tiny IndexedDB key/value store (falls back to localStorage) -------------------------------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('zombicraft', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('worlds');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }).catch(() => null);
  return dbp;
}
async function idbDo(mode, fn) {
  const d = await db(); if (!d) throw new Error('no idb');
  return new Promise((res, rej) => {
    const tx = d.transaction('worlds', mode), st = tx.objectStore('worlds');
    const r = fn(st);
    tx.oncomplete = () => res(r?.result);
    tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
const store = {
  async get(id) {
    try { const v = await idbDo('readonly', st => st.get(id)); if (v != null) return v; } catch (e) { /* fall back */ }
    try { return localStorage.getItem(LS_PREFIX + id); } catch (e) { return null; }
  },
  async put(id, data) {
    try { await idbDo('readwrite', st => st.put(data, id)); try { localStorage.removeItem(LS_PREFIX + id); } catch (e) { /* ignore */ } return true; }
    catch (e) { localStorage.setItem(LS_PREFIX + id, data); return true; }
  },
  async del(id) {
    try { await idbDo('readwrite', st => st.delete(id)); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(LS_PREFIX + id); } catch (e) { /* ignore */ }
  },
};

export class SaveSystem {
  constructor(game) {
    this.game = game;
    this.key = KEY;
    this._timer = 0;
    this.loading = false;
    this.lastSaveAt = 0;
  }
  init() {
    const bus = this.game.bus;
    bus.on('time:dawn', () => { if (this._canAutosave()) this.save({ toast: true, auto: true }); });
    bus.on('game:over', () => this.deleteSave());
    bus.on('game:begin', () => { this._timer = 0; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this._canAutosave()) this.save({ toast: false, auto: true });
    });
    addEventListener('pagehide', () => { if (this._canAutosave()) this.save({ toast: false, auto: true }); });
  }
  _canAutosave() {
    const g = this.game;
    return g.running && !this.loading && !g.gameOver && !(g.player?.dead);
  }
  update(dt) {
    this._timer += dt;
    if (this._timer >= AUTOSAVE_EVERY) {
      this._timer = 0;
      if (this._canAutosave()) this.save({ toast: true, auto: true });
    }
  }

  // ---------------------------------------------------------------- world list
  /** All saved worlds, most recently played first. */
  worlds() {
    this._migrate();
    let list = [];
    try { list = JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch (e) { list = []; }
    return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  _writeIndex(list) { try { localStorage.setItem(INDEX, JSON.stringify(list)); } catch (e) { /* ignore */ } }
  _migrate() {
    if (this._migrated) return; this._migrated = true;
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return;
      const o = JSON.parse(raw);
      const id = 'w' + Date.now().toString(36);
      const list = JSON.parse(localStorage.getItem(INDEX) || '[]');
      list.push({ id, name: 'Мой мир', created: o.savedAt || Date.now(), ...this._meta(o) });
      store.put(id, raw).then(() => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } });
      this._writeIndex(list);
      localStorage.setItem(LAST, id);
    } catch (e) { /* ignore */ }
  }
  _meta(o) {
    return { savedAt: o.savedAt || Date.now(), day: o.state?.day || 1, age: o.state?.age | 0, difficulty: o.state?.difficulty || 'normal', waves: o.state?.stats?.wavesSurvived || 0, seed: o.seed };
  }
  /** The last played world (for «Продолжить»), or null. */
  lastWorld() {
    const list = this.worlds(); if (!list.length) return null;
    let id = null; try { id = localStorage.getItem(LAST); } catch (e) { /* ignore */ }
    return list.find(w => w.id === id) || list[0];
  }
  /** Start a new world entry (the game fills it on the first save). */
  createWorld(name, meta = {}) {
    const list = this.worlds();
    const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const n = (name || '').trim() || 'Мир ' + (list.length + 1);
    list.push({ id, name: n.slice(0, 32), created: Date.now(), savedAt: Date.now(), day: 1, age: 0, waves: 0, ...meta });
    this._writeIndex(list);
    this.worldId = id;
    try { localStorage.setItem(LAST, id); } catch (e) { /* ignore */ }
    return id;
  }
  renameWorld(id, name) {
    const list = this.worlds(), w = list.find(x => x.id === id); if (!w) return;
    w.name = (name || '').trim().slice(0, 32) || w.name;
    this._writeIndex(list);
  }
  async deleteWorld(id) {
    this._writeIndex(this.worlds().filter(w => w.id !== id));
    await store.del(id);
    if (this.worldId === id) this.worldId = null;
  }
  /** Kept for older callers: is there anything to continue? */
  hasSave() { return !!this.lastWorld(); }
  info() { const w = this.lastWorld(); return w ? { ...w, wave: w.waves } : null; }
  /** Game over: the fallen world is gone (the dead don't give second chances). */
  deleteSave() { if (this.worldId) this.deleteWorld(this.worldId); }

  serialize() {
    const g = this.game;
    const safe = (sys) => { try { return sys?.serialize ? sys.serialize() : null; } catch (e) { console.error('serialize failed', sys?.constructor?.name, e); return null; } };
    return {
      v: VERSION,
      savedAt: Date.now(),
      seed: g.world?.seed ?? g.state.seed,
      size: g.world?.size || 192,
      changes: g.world?.changes ? encodeChanges(g.world.changes) : '',
      state: g.state.serialize(),
      village: safe(g.village),
      player: safe(g.player),
      waves: safe(g.waves),
      research: safe(g.research),
      crafting: safe(g.crafting),
      combat: safe(g.combat),
      camera: safe(g.cameraRig),
      mode: g.mode,
    };
  }

  save({ toast = true } = {}) {
    const g = this.game;
    if (!g.running || !g.world) return false;
    let obj, data;
    try { obj = this.serialize(); data = JSON.stringify(obj); } catch (e) { console.error('save serialize failed', e); return false; }
    if (!this.worldId) this.createWorld('', { difficulty: g.state.difficulty });
    const id = this.worldId;
    // update the world list right away (small), write the data in the background
    const list = this.worlds(), w = list.find(x => x.id === id);
    if (w) { Object.assign(w, this._meta(obj)); this._writeIndex(list); }
    else { list.push({ id, name: 'Мир ' + (list.length + 1), created: Date.now(), ...this._meta(obj) }); this._writeIndex(list); }
    try { localStorage.setItem(LAST, id); } catch (e) { /* ignore */ }
    this.lastSaveAt = Date.now();
    this._timer = 0;
    this._pending = store.put(id, data).then(() => {
      if (toast) g.bus.emit('toast', { text: 'Мир «' + (w?.name || '') + '» сохранён', kind: 'info', icon: 'save' });
      g.bus.emit('game:saved', {});
    }).catch((e) => {
      console.warn('save failed', e);
      g.bus.emit('toast', { text: 'Не удалось сохранить: мало места', kind: 'bad' });
    });
    return true;
  }

  /** Restore the saved game. progress(p, text) optional. Returns true on success. */
  async load(progress = () => {}, id = null) {
    const g = this.game;
    id = id || this.lastWorld()?.id;
    if (!id) return false;
    let o;
    try { o = JSON.parse(await store.get(id)); } catch (e) { o = null; }
    if (!o) return false;
    this.worldId = id;
    try { localStorage.setItem(LAST, id); } catch (e) { /* ignore */ }
    this.loading = true;
    try {
      g.running = false;
      await g.setup({ seed: o.seed, size: o.size || 192 }, progress);
      const w = g.world;
      progress(0.96, 'Восстанавливаем постройки…');
      const changes = decodeChanges(o.changes);
      w.applyChanges(changes);            // edits in chunks that aren't generated yet wait for their chunk
      w.computeAllLight();
      g.chunkRenderer?.buildAll?.();
      w.changes = changes;
      g.bus.emit('world:loaded', { world: w });
      g.state.deserialize(o.state || {});
      const safe = (sys, data) => { try { if (data != null) sys?.deserialize?.(data); } catch (e) { console.error('deserialize failed', sys?.constructor?.name, e); } };
      safe(g.research, o.research);
      safe(g.crafting, o.crafting);
      safe(g.village, o.village);
      safe(g.player, o.player);
      safe(g.waves, o.waves);
      safe(g.combat, o.combat);
      safe(g.cameraRig, o.camera);
      if (g.mode !== 'explore') g.setMode('explore');
      g.begin({ loaded: true });
      this._timer = 0;
      progress(1, '');
      return true;
    } catch (e) {
      console.error('load failed', e);
      g.bus.emit('toast', { text: 'Сохранение повреждено', kind: 'bad' });
      return false;
    } finally {
      this.loading = false;
    }
  }
}
