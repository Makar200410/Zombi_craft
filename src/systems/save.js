// Save / load to localStorage. World block edits are stored compactly:
// sorted indices, delta + run-length encoded as varints, then base64.
const KEY = 'zc_save_v1';
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

  hasSave() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }
  /** Small summary for the menu (day, difficulty, time) or null. */
  info() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return null;
      const o = JSON.parse(raw);
      return { day: o.state?.day || 1, difficulty: o.state?.difficulty || 'normal', savedAt: o.savedAt || 0, wave: o.state?.stats?.wavesSurvived || 0 };
    } catch (e) { return null; }
  }
  deleteSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

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
    let data;
    try { data = JSON.stringify(this.serialize()); } catch (e) { console.error('save serialize failed', e); return false; }
    const write = () => localStorage.setItem(KEY, data);
    try { write(); }
    catch (e) {
      // quota: drop the old save + other large keys of ours and retry once
      try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '_bak'); write(); }
      catch (e2) {
        console.warn('save failed', e2);
        g.bus.emit('toast', { text: 'Не удалось сохранить: мало места', kind: 'bad' });
        return false;
      }
    }
    this.lastSaveAt = Date.now();
    this._timer = 0;
    if (toast) g.bus.emit('toast', { text: 'Игра сохранена', kind: 'info', icon: 'save' });
    g.bus.emit('game:saved', {});
    return true;
  }

  /** Restore the saved game. progress(p, text) optional. Returns true on success. */
  async load(progress = () => {}) {
    const g = this.game;
    let o;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) { o = null; }
    if (!o) return false;
    this.loading = true;
    try {
      g.running = false;
      await g.setup({ seed: o.seed, size: o.size || 192 }, progress);
      const w = g.world;
      progress(0.96, 'Восстанавливаем постройки…');
      const changes = decodeChanges(o.changes);
      const blocks = w.blocks;
      for (const [i, id] of changes) if (i >= 0 && i < blocks.length) blocks[i] = id;
      w.computeAllLight();
      for (let cz = 0; cz < w.chunksX; cz++) for (let cx = 0; cx < w.chunksX; cx++) w.dirty.add(cx + ',' + cz);
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
