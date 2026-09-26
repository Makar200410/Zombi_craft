import { RESOURCES } from './items.js';

export class GameState {
  constructor(bus) {
    this.bus = bus;
    this.resources = {};
    for (const r of RESOURCES) this.resources[r] = 0;
    Object.assign(this.resources, { wood: 80, stone: 60, food: 60, iron: 0, coal: 0, gold: 10, crystal: 0 });
    this.day = 1;
    this.dayDuration = 300;        // seconds of daylight (0.22 → 0.78 of the cycle)
    this.nightDuration = 150;      // seconds of night (0.78 → 0.22)
    this.timeOfDay = 0.3;          // start in the morning
    this.researchDone = new Set();
    this.unlockedItems = new Set();
    this.stats = { kills: 0, wavesSurvived: 0, blocksMined: 0, blocksPlaced: 0, villagersLost: 0 };
    this.difficulty = 'normal';
    this.seed = (Math.random() * 1e9) | 0;
    this._wasNight = this.isNight;
  }
  get isNight() { return this.timeOfDay < 0.22 || this.timeOfDay > 0.78; }
  /** 0 = full day, 1 = deep night (smooth). */
  get nightFactor() {
    const t = this.timeOfDay;
    const sun = Math.sin((t - 0.25) * Math.PI * 2); // 1 at noon, -1 at midnight
    return Math.min(1, Math.max(0, (0.15 - sun) / 0.35));
  }
  /** Full cycle length in seconds (day + night). */
  get dayLength() { return this.dayDuration + this.nightDuration; }
  set dayLength(v) { /* legacy saves stored a single length; durations are fixed now */ }
  _isDayPart(t) { return t >= 0.22 && t < 0.78; }
  get _dayRate() { return 0.56 / this.dayDuration; }
  get _nightRate() { return 0.44 / this.nightDuration; }
  /** Seconds until the next dusk (0.78). */
  get secondsToDusk() {
    const t = this.timeOfDay;
    if (this._isDayPart(t)) return (0.78 - t) / this._dayRate;
    let n = 0.22 - t; if (n < 0) n += 1;
    return n / this._nightRate + this.dayDuration;
  }
  /** Seconds until sunrise (0.25). */
  get secondsToDawn() {
    const t = this.timeOfDay;
    if (this._isDayPart(t)) return t < 0.25 ? (0.25 - t) / this._dayRate : (0.78 - t) / this._dayRate + this.nightDuration + 0.03 / this._dayRate;
    let n = 0.22 - t; if (n < 0) n += 1;
    return n / this._nightRate + 0.03 / this._dayRate;
  }
  update(dt) {
    const prev = this.timeOfDay;
    this.timeOfDay += dt * (this._isDayPart(prev) ? this._dayRate : this._nightRate);
    if (this.timeOfDay >= 1) { this.timeOfDay -= 1; }
    if (prev < 0.25 && this.timeOfDay >= 0.25) { this.day++; this.bus.emit('time:dawn', { day: this.day }); }
    if (prev < 0.78 && this.timeOfDay >= 0.78) this.bus.emit('time:dusk', { day: this.day });
  }
  add(res, n) {
    if (!n) return;
    if (!(res in this.resources)) this.resources[res] = 0;
    this.resources[res] = Math.max(0, this.resources[res] + n);
    this.bus.emit('resources:changed', { resources: this.resources });
  }
  addAll(obj, mult = 1) {
    let any = false;
    for (const k in obj) if (obj[k]) { this.resources[k] = Math.max(0, (this.resources[k] || 0) + obj[k] * mult); any = true; }
    if (any) this.bus.emit('resources:changed', { resources: this.resources });
  }
  canAfford(cost) {
    for (const k in cost) if ((this.resources[k] || 0) < cost[k]) return false;
    return true;
  }
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.addAll(cost, -1);
    return true;
  }
  refund(cost) { this.addAll(cost, 1); }
  serialize() {
    return {
      resources: { ...this.resources }, day: this.day, timeOfDay: this.timeOfDay,
      researchDone: [...this.researchDone], unlockedItems: [...this.unlockedItems], stats: { ...this.stats },
      difficulty: this.difficulty, seed: this.seed,
    };
  }
  deserialize(o) {
    Object.assign(this.resources, o.resources || {});
    this.day = o.day || 1; this.timeOfDay = o.timeOfDay ?? 0.3;
    this.researchDone = new Set(o.researchDone || []); this.unlockedItems = new Set(o.unlockedItems || []);
    Object.assign(this.stats, o.stats || {});
    this.difficulty = o.difficulty || 'normal'; this.seed = o.seed ?? this.seed;
    this.bus.emit('resources:changed', { resources: this.resources });
  }
}
