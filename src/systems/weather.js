// Weather: clear skies, clouds, rain, thunderstorms, fog and snowfall. Each state lasts a few minutes and blends
// into the next; mountains turn rain into snow. Weather drives the sky, fog, wind, wet/snowy ground, rain and
// snow particles, splashes, lightning and the ambient sound, and has small gameplay effects (see WEATHERS.effect).
import { WeatherFx } from '../render/weatherFx.js';
import { worldUniforms } from '../render/chunkMaterials.js';
import { SEA_LEVEL } from '../world/terrain.js';

export const WEATHERS = {
  clear: { name: 'Ясно', icon: '☀', cloud: 0.1, wind: 0.25, dur: [160, 320] },
  cloudy: { name: 'Облачно', icon: '☁', cloud: 0.6, wind: 0.45, fog: 0.05, dur: [90, 180] },
  rain: { name: 'Дождь', icon: '🌧', cloud: 0.88, rain: 0.55, wind: 0.5, fog: 0.25, dur: [80, 160], effect: 'Посевы растут на 50% быстрее, горение быстро гаснет.' },
  storm: { name: 'Гроза', icon: '⛈', cloud: 1, rain: 1, wind: 1, fog: 0.35, lightning: true, dur: [60, 120], effect: 'Молнии бьют по нежити. Посевы растут на 50% быстрее, горение гаснет.' },
  fog: { name: 'Туман', icon: '🌫', cloud: 0.45, wind: 0.06, fog: 1, dur: [60, 120], effect: 'Плохая видимость: башни и стрелки бьют на 20% ближе.' },
  snow: { name: 'Снегопад', icon: '❄', cloud: 0.8, snow: 0.75, wind: 0.45, fog: 0.3, dur: [90, 170], effect: 'Мороз: нежить движется на 15% медленнее, посевы растут вдвое медленнее.' },
};
// what follows what (weights)
const NEXT = {
  clear: { clear: 2, cloudy: 5, fog: 1.2, rain: 0.5 },
  cloudy: { clear: 3, rain: 3, storm: 1, snow: 0.8, fog: 0.6 },
  rain: { cloudy: 3, storm: 1.5, clear: 1 },
  storm: { rain: 3, cloudy: 2 },
  fog: { clear: 3, cloudy: 2 },
  snow: { cloudy: 3, clear: 1, snow: 0.5 },
};
const START = { type: 'clear', left: 200 };
const lerp = (a, b, t) => a + (b - a) * t;

export class Weather {
  constructor(game) {
    this.game = game;
    this.type = 'clear';
    this.left = 200;
    // smoothed live values
    this.cloud = 0.1; this.rain = 0; this.snow = 0; this.fog = 0; this.windAmt = 0.25; this.storm = 0;
    this.wind = { x: 1.5, z: 0.6 };
    this._windAng = Math.random() * Math.PI * 2;
    this.wet = 0; this.snowCover = 0; this.cold = 0; this.indoor = 0;
    this._boltT = 6;
    this._gustT = 20;
  }
  init() {
    const g = this.game;
    this.fx = new WeatherFx(g);
    g.bus.on('game:begin', ({ loaded } = {}) => {
      const s = loaded && g.state.weather ? g.state.weather : START;
      this.set(WEATHERS[s.type] ? s.type : 'clear', s.left, true);
      this.snowCover = loaded ? (g.state.weather?.snowCover || 0) : 0;
      this.wet = this.rain;
    });
  }
  get def() { return WEATHERS[this.type]; }

  /** Switch weather (instant = no blending, e.g. after loading). */
  set(type, left, instant = false) {
    const prev = this.type;
    this.type = type;
    const d = WEATHERS[type].dur;
    this.left = left ?? d[0] + Math.random() * (d[1] - d[0]);
    if (instant) {
      const w = WEATHERS[type];
      this.cloud = w.cloud; this.rain = w.rain || 0; this.snow = w.snow || 0; this.fog = w.fog || 0; this.windAmt = w.wind; this.storm = w.lightning ? 1 : 0;
    }
    if (prev !== type) {
      this.game.bus.emit('weather:changed', { type, prev });
      if (!instant && this.game.running) {
        const msg = { storm: ['Надвигается гроза', 'молнии бьют по нежити'], snow: ['Пошёл снег', 'нежить мёрзнет и замедляется'], fog: ['Опустился туман', 'башни видят хуже'], rain: ['Начался дождь', 'посевы растут быстрее'] }[type];
        if (msg) this.game.bus.emit('toast', { text: msg[0] + ' — ' + msg[1], kind: type === 'fog' ? 'warn' : 'info' });
      }
    }
  }
  _roll() {
    const g = this.game, opts = NEXT[this.type];
    let tot = 0; const list = [];
    for (const k in opts) {
      let wgt = opts[k];
      if (g.state.day <= 1 && (k === 'storm' || k === 'snow' || k === 'fog')) wgt = 0;    // gentle first day
      if (k === 'fog' && (g.state.timeOfDay > 0.2 && g.state.timeOfDay < 0.35)) wgt *= 3;  // morning mist
      list.push([k, wgt]); tot += wgt;
    }
    let r = Math.random() * tot;
    for (const [k, wgt] of list) { if ((r -= wgt) <= 0) return k; }
    return 'cloudy';
  }

  // ---- gameplay multipliers (read by other systems) ----------------------
  /** Crop growth speed. */
  get cropMul() { return (1 + 0.5 * Math.min(1, (this.rain + this.storm * 0.5) / 0.55)) * (1 - 0.5 * Math.min(1, this.snow / 0.5)); }
  /** Zombie movement speed. */
  get zombieSpeed() { return 1 - 0.15 * Math.min(1, this.snow / 0.5); }
  /** Range of towers and shooters. */
  get rangeMul() { return 1 - 0.2 * Math.min(1, Math.max(0, this.fog - 0.35) / 0.5); }
  /** Rain puts fires out (burn timers run down this much faster). */
  get burnDecay() { return this.rain > 0.3 ? 3 : 1; }

  update(dt) {
    const g = this.game;
    if (!g.running || !g.world) return;
    this.left -= dt;
    if (this.left <= 0) this.set(this._roll());
    const w = this.def, k = Math.min(1, dt / 18);      // ~20 s blend between weathers
    this.cloud = lerp(this.cloud, w.cloud, k);
    this.rain = lerp(this.rain, w.rain || 0, k);
    this.snow = lerp(this.snow, w.snow || 0, k);
    this.fog = lerp(this.fog, w.fog || 0, k * 0.8);
    this.windAmt = lerp(this.windAmt, w.wind, k);
    this.storm = lerp(this.storm, w.lightning ? 1 : 0, k);
    for (const p of ['rain', 'snow', 'fog', 'storm']) if (this[p] < 0.004) this[p] = 0;
    // wind direction wanders slowly; speed from the weather plus gusts
    this._windAng += (Math.random() - 0.5) * dt * 0.08;
    const gust = 1 + Math.sin(g.time * 0.37) * 0.25 + Math.sin(g.time * 1.13) * 0.12;
    const ws = (1 + this.windAmt * 9) * gust;
    this.wind.x = Math.cos(this._windAng) * ws; this.wind.z = Math.sin(this._windAng) * ws;

    // cold: on the high spruce mountains precipitation falls as snow
    const cam = g.camera.position, W = g.world;
    const cx = Math.floor(cam.x), cz = Math.floor(cam.z);
    let coldHere = 0;
    if (cx >= 0 && cz >= 0 && cx < W.size && cz < W.size) {
      const i = cz * W.size + cx;
      coldHere = W.biome[i] === 2 ? Math.min(1, Math.max(0, (W.heights[i] - SEA_LEVEL - 14) / 8)) : 0;
    }
    this.cold = lerp(this.cold, coldHere, Math.min(1, dt * 0.5));
    const rainVis = this.rain * (1 - this.cold), snowVis = Math.min(1, this.snow + this.rain * this.cold * 0.8);

    // ground: wet in the rain, dries slowly; snow settles while it snows and melts afterwards
    this.wet = rainVis > this.wet ? lerp(this.wet, rainVis, Math.min(1, dt / 15)) : Math.max(0, this.wet - dt / 70);
    if (this.snow > 0.3) this.snowCover = Math.min(1, this.snowCover + dt / 50 * this.snow);
    else this.snowCover = Math.max(0, this.snowCover - dt / (this.rain > 0.2 ? 30 : 90));
    worldUniforms.uWet.value = Math.min(1, this.wet * 1.3);
    worldUniforms.uSnowCover.value = this.snowCover;
    worldUniforms.uWind.value = 0.6 + this.windAmt * 2.2;

    // is the camera under a roof? (muffles rain, hides drops)
    const roof = this.fx.roofAt(cam.x, cam.z);
    const inside = g.mode !== 'command' && roof > cam.y + 0.6 ? 1 : 0;
    this.indoor = lerp(this.indoor, inside, Math.min(1, dt * 4));

    this.fx.update(dt, { rain: rainVis, snow: snowVis, wind: this.wind });
    this._lightning(dt);
    this._gusts(dt);
    g.audio?.setWeather?.({ rain: rainVis, snow: snowVis, wind: this.windAmt, storm: this.storm, indoor: this.indoor });
    // for saves
    g.state.weather = { type: this.type, left: Math.round(this.left), snowCover: +this.snowCover.toFixed(2) };
  }

  _gusts(dt) {
    if (this.windAmt < 0.4) return;
    this._gustT -= dt;
    if (this._gustT > 0) return;
    this._gustT = 8 + Math.random() * 16;
    const g = this.game;
    g.audio?.play(Math.random() < 0.5 ? 'wind_gust' : 'wind_leaves', { volume: 0.25 + this.windAmt * 0.35 * (1 - this.indoor * 0.6) });
  }

  // thunderstorm: bolts every few seconds; about half of them strike undead near the player or the village
  _lightning(dt) {
    if (this.storm < 0.6) return;
    this._boltT -= dt;
    if (this._boltT > 0) return;
    this._boltT = 4 + Math.random() * 9;
    const g = this.game, W = g.world, cam = g.camera.position;
    let x, z, target = null;
    const zs = (g.waves?.zombies || []).filter(e => !e.dead && Math.hypot(e.position.x - cam.x, e.position.z - cam.z) < 70);
    if (zs.length && Math.random() < 0.55) {
      target = zs[(Math.random() * zs.length) | 0];
      x = target.position.x; z = target.position.z;
    } else {
      const a = Math.random() * Math.PI * 2, d = 35 + Math.random() * 110;
      x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d;
    }
    x = Math.max(1, Math.min(W.size - 2, x)); z = Math.max(1, Math.min(W.size - 2, z));
    const y = this.fx.roofAt(x, z) || W.surfaceY(x, z) + 1;
    this.fx.bolt(x, y, z);
    const dist = Math.hypot(x - cam.x, z - cam.z);
    // thunder: close strikes crack at once, far ones rumble after a delay (sped-up speed of sound)
    const delay = Math.min(2.5, dist / 90) * 1000;
    const near = dist < 60;
    setTimeout(() => g.audio?.play(near ? 'thunder_roll' : 'thunder_far', { volume: near ? 1 - dist / 120 : Math.max(0.35, 1 - dist / 260) }), delay);
    if (target) {
      const p = { x, y: y + 0.5, z };
      for (const e of g.entities.query(p, 3.2, e => e.faction === 'undead' && !e.dead)) {
        e.damage(e === target ? 90 : 45, null, { kind: 'lightning' });
        if (!e.dead) e.burnTimer = Math.max(e.burnTimer || 0, 3);
      }
      g.particles?.emit({ pos: p, count: 40, colors: [0xffffff, 0xc8d8ff, 0x8ab0ff], additive: true, speed: 9, gravity: 6, drag: 0.9, life: 0.6, size: 0.25 });
      g.particles?.emit({ pos: p, count: 16, colors: [0x3a3632, 0x57524c], speed: 2.5, dir: { x: 0, y: 3, z: 0 }, gravity: -0.5, drag: 0.5, life: 1.6, size: 0.7, alpha: 0.6 });
      g.cameraRig?.shake?.(Math.max(0, 0.5 - dist / 120));
    }
  }
}
