// Atmosphere & polish: chimney smoke / reactor steam (blown by the wind), fireflies at night, and a
// fireworks celebration (weather lives in systems/weather.js) when the village enters a new age. Everything is cheap and scaled down on low quality.
import { ageOf } from './ages.js';

export class Ambience {
  constructor(game) {
    this.game = game;
    this._smokeT = 0;
    this._flyT = 0;
    this._fireworks = [];       // {t, x, y, z}
  }
  init() {
    const bus = this.game.bus;
    bus.on('age:changed', ({ age } = {}) => this.celebrate(age));
    bus.on('game:begin', () => { this._fireworks.length = 0; });
  }

  get low() { return this.game.quality === 'low'; }

  update(dt) {
    const g = this.game;
    if (!g.running || !g.world) return;
    this._smoke(dt);
    this._fireflies(dt);
    this._fireworksUpdate(dt);
  }

  // ---- chimneys: smoke from factories / power plants, steam from reactors, hearth smoke at night -------
  _smoke(dt) {
    this._smokeT -= dt;
    if (this._smokeT > 0) return;
    this._smokeT = this.low ? 0.6 : 0.28;
    const g = this.game, cam = g.camera.position, P = g.particles;
    const night = g.state.isNight;
    const wx = g.weather?.wind || { x: 0.4, z: 0.2 }, wk = 0.25;
    for (const b of g.village?.buildings || []) {
      if (b.state !== 'complete') continue;
      const dx = b.center.x - cam.x, dz = b.center.z - cam.z;
      if (dx * dx + dz * dz > 90 * 90) continue;
      const pts = b.points.smoke;
      if (pts) {
        // industry only smokes while powered/staffed
        if (b.def.jobs?.engineer && !b.workers.some(w => !w.dead && w.job === 'engineer')) continue;
        for (const p of pts) P.emit({ pos: p, count: 2, colors: [0x5a5652, 0x6e6a64, 0x45423e], speed: 0.4, box: 0.4, dir: { x: wx.x * wk, y: 1.8, z: wx.z * wk }, gravity: -0.6, drag: 0.3, life: 3.2, size: 0.9, alpha: 0.5 });
      }
      for (const p of b.points.steam || []) P.emit({ pos: p, count: 3, colors: [0xf2f4f6, 0xdde2e8], speed: 0.6, box: 0.9, dir: { x: wx.x * wk, y: 2.4, z: wx.z * wk }, gravity: -0.8, drag: 0.4, life: 3.5, size: 1.4, alpha: 0.45 });
      // homes light their hearths in the evening
      if (night && (b.type === 'house' || b.type === 'town_hall') && Math.random() < 0.5) {
        P.emit({ pos: { x: b.center.x, y: b.y + b.height + 0.3, z: b.center.z }, count: 1, colors: [0x6a6660, 0x7a756e], speed: 0.2, box: 0.3, dir: { x: wx.x * wk, y: 1.2, z: wx.z * wk }, gravity: -0.4, drag: 0.3, life: 2.5, size: 0.6, alpha: 0.35 });
      }
    }
  }

  // ---- fireflies over grass on calm nights ------------------------------
  _fireflies(dt) {
    const g = this.game;
    const W = g.weather;
    if (!g.state.isNight || (W && (W.rain > 0.2 || W.snow > 0.2 || W.windAmt > 0.7)) || g.waves?.activeCount > 15) return;
    this._flyT -= dt;
    if (this._flyT > 0) return;
    this._flyT = this.low ? 0.5 : 0.18;
    const cam = g.camera.position, w = g.world;
    const x = cam.x + (Math.random() - 0.5) * 40, z = cam.z + (Math.random() - 0.5) * 40;
    const y = w.surfaceY(x, z) + 1 + Math.random() * 2.5;
    g.particles.emit({ pos: { x, y, z }, count: 1, colors: [0xd8ff70, 0xb8f050, 0xfff08a], additive: true, speed: 0.35, gravity: -0.05, drag: 0.1, life: 4, size: 0.12 });
  }

  // ---- a new age: banner + fireworks over the town hall -----------------
  celebrate(age) {
    const g = this.game, a = ageOf(g);
    g.ui?.banner?.show('НОВАЯ ЭПОХА', a.name, 'good', 4800);
    const th = g.village?.townHall; if (!th) return;
    for (let i = 0; i < (this.low ? 8 : 16); i++) this._fireworks.push({ t: i * 0.35 + Math.random() * 0.2, x: th.center.x + (Math.random() - 0.5) * 26, y: th.y + 18 + Math.random() * 10, z: th.center.z + (Math.random() - 0.5) * 26, launched: false });
  }
  _fireworksUpdate(dt) {
    if (!this._fireworks.length) return;
    const g = this.game, P = g.particles;
    const palette = [[0xff5040, 0xffc060], [0x60c0ff, 0xffffff], [0x9aff70, 0xfff080], [0xd080ff, 0xff90e0], [0xffd84a, 0xfff6c0]];
    for (let i = this._fireworks.length - 1; i >= 0; i--) {
      const f = this._fireworks[i];
      f.t -= dt;
      if (f.t > 0) continue;
      const cols = palette[(Math.random() * palette.length) | 0];
      P.emit({ pos: { x: f.x, y: f.y, z: f.z }, count: this.low ? 40 : 90, colors: cols, additive: true, speed: 9, gravity: 4, drag: 1.2, life: 1.6, size: 0.22 });
      P.emit({ pos: { x: f.x, y: f.y, z: f.z }, count: 10, colors: [0xffffff], additive: true, speed: 3, gravity: 1, drag: 1, life: 0.5, size: 0.5 });
      g.audio?.play('explosion', { pos: { x: f.x, y: f.y, z: f.z }, volume: 0.35, pitch: 1.6 });
      this._fireworks.splice(i, 1);
    }
  }
}
