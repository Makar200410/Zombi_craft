export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) { const off = this.on(name, (p) => { off(); fn(p); }); return off; }
  off(name, fn) { const s = this.map.get(name); if (s) s.delete(fn); }
  emit(name, payload) {
    const s = this.map.get(name);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(payload); } catch (e) { console.error(`[bus] handler for "${name}" failed`, e); }
    }
  }
}
