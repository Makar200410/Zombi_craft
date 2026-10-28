import { setItemAtlas } from '../entities/itemMesh.js';
import * as THREE from 'three';
import { Quests } from '../systems/quests.js';
import { Ambience } from '../systems/ambience.js';
import { Weather } from '../systems/weather.js';
import { Underground } from '../systems/underground.js';
import { Fluids } from '../systems/fluids.js';
import { Kinetics } from '../systems/kinetics.js';
import { Rivals } from '../systems/rivals.js';
import { Caravans } from '../systems/caravans.js';
import { Net } from '../net/Net.js';
import { EventBus } from './events.js';
import { GameState } from './state.js';
import { World, WORLD_FORMATS, WORLD_FORMAT } from '../world/World.js';
import { Renderer } from '../render/Renderer.js';
import { FarTerrain } from '../render/FarTerrain.js';
import { ChunkRenderer } from '../render/ChunkRenderer.js';
import { Particles } from '../render/particles.js';
import { EntityManager } from '../entities/EntityManager.js';
import { buildAtlas } from '../art/textures.js';
import { Audio } from '../audio/sfx.js';
import { Input } from '../player/Input.js';
import { Player } from '../player/Player.js';
import { CameraRig } from '../player/CameraRig.js';
import { Combat } from '../combat/Combat.js';
import { Village } from '../village/Village.js';
import { WaveDirector } from '../enemies/WaveDirector.js';
import { Research } from '../systems/research.js';
import { SaveSystem } from '../systems/save.js';
import { Crafting } from '../systems/crafting.js';
import { UI } from '../ui/UI.js';

function detectQuality() {
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  // phones start conservative; adaptive quality (see _adaptQuality) steps down further if FPS is poor
  let q = touch ? (mem >= 6 && cores >= 8 ? 'medium' : 'low') : 'high';
  try { const saved = localStorage.getItem('zc_quality'); if (saved) q = saved; } catch (e) { /* ignore */ }
  return { q, touch };
}

export class Game {
  constructor() {
    const { q, touch } = detectQuality();
    this.quality = q;
    this.isTouch = touch;
    this.bus = new EventBus();
    this.state = new GameState(this.bus);
    this.time = 0;
    this.paused = false;
    this.running = false;       // true while a game session is being played (not in menu)
    this.mode = 'explore';
    this.systems = [];
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._timer = new THREE.Timer();
    this.menuOrbit = 0;
    this.debug = new URLSearchParams(location.search).has('debug');
  }

  /** Builds renderer/atlas and all systems once. */
  async init(progress = () => {}) {
    progress(0.05, 'Рисуем текстуры…');
    await tick();
    this.atlas = buildAtlas();
    setItemAtlas(this.atlas);
    this.renderer = new Renderer(this, document.getElementById('game-root') || document.body);
    this.atlas.texture.anisotropy = Math.min(4, this.renderer.renderer.capabilities.getMaxAnisotropy());
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.farTerrain = new FarTerrain(this);
    this.particles = new Particles(this);
    this.entities = new EntityManager(this);
    this.audio = new Audio(this);
    this.input = new Input(this);
    this.cameraRig = new CameraRig(this);
    this.player = new Player(this);
    this.combat = new Combat(this);
    this.village = new Village(this);
    this.waves = new WaveDirector(this);
    this.research = new Research(this);
    this.crafting = new Crafting(this);
    this.quests = new Quests(this);
    this.ambience = new Ambience(this);
    this.underground = new Underground(this);
    this.fluids = new Fluids(this);
    this.kinetics = new Kinetics(this);
    this.rivals = new Rivals(this);
    this.caravans = new Caravans(this);
    this.net = new Net(this);
    this.weather = new Weather(this);
    this.save = new SaveSystem(this);
    this.ui = new UI(this);
    // update order
    this.systems = [this.input, this.player, this.cameraRig, this.combat, this.village, this.waves, this.entities, this.particles, this.research, this.crafting, this.quests, this.weather, this.ambience, this.underground, this.fluids, this.kinetics, this.rivals, this.caravans, this.save, this.net];
    for (const s of [this.audio, this.input, this.cameraRig, this.player, this.combat, this.village, this.waves, this.research, this.crafting, this.quests, this.weather, this.ambience, this.underground, this.save, this.net, this.ui]) s.init?.();
    this.bus.on('block:changed', ({ x, y, z, id }) => { this.world?.changes?.set(this.world.index(x, y, z), id); });
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    progress(0.1, 'Готово');
  }

  /** (Re)generates the world for a seed. Call before begin(). */
  async setup({ seed = (Math.random() * 1e9) | 0, size, format = WORLD_FORMAT } = {}, progress = () => {}) {
    const F = WORLD_FORMATS[format] || WORLD_FORMATS[1];
    size = size || F.size;
    progress(0.15, 'Генерация мира…');
    await tick();
    if (this.chunkRenderer) { this.scene.remove(this.chunkRenderer.group); this.chunkRenderer.group.traverse(o => o.geometry?.dispose()); this.chunkRenderer.mesher?.terminate(); }
    for (const e of [...(this.entities?.list || [])]) if (e.kind !== 'player') this.entities.remove(e);
    this.state.seed = seed;
    this.world?.stopWorker?.();
    this.world = new World(this, { size, seed, height: F.height, sea: F.sea, format: WORLD_FORMATS[format] ? format : 1 });
    this.world.generate();
    this.world.startWorker();             // the rest of the world is made in the background
    this.farTerrain.setWorld(this.world);  // and the horizon beyond it
    progress(0.55, 'Строим ландшафт…');
    await tick();
    this.chunkRenderer = new ChunkRenderer(this);
    // mesh the area around the village now (same amount of work as the old small map); the rest of the
    // big world is meshed in the background as the camera approaches it
    const c = size / 2, R = 88;
    const keys = [...this.world.dirty].filter(k => { const [cx, cz, sy] = k.split(',').map(Number); return Math.hypot(cx * 16 + 8 - c, cz * 16 + 8 - c) < R && !this.chunkRenderer._underground(cx, cz, sy); });
    for (let i = 0; i < keys.length; i++) {
      this.chunkRenderer.rebuild(keys[i]);
      this.world.dirty.delete(keys[i]);
      if (i % 12 === 0) { progress(0.55 + 0.4 * i / keys.length, 'Строим ландшафт…'); await tick(); }
    }
    this.world.changes = new Map();   // idx -> id, block edits since generation (for saves)
    this.bus.emit('world:ready', { world: this.world });
    progress(1, '');
  }

  /** Starts gameplay. opts.loaded = true when restoring a save (systems already deserialized). */
  begin(opts = {}) {
    if (!opts.loaded) for (const s of [this.crafting, this.village, this.player, this.waves, this.research, this.combat, this.cameraRig, this.ui]) s.onNewGame?.();
    this.running = true;
    this.paused = false;
    this.bus.emit('game:begin', { loaded: !!opts.loaded });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'command' && this.net?.isClient) { this.bus.emit('toast', { text: 'Деревней управляет хозяин сетевой игры', kind: 'info' }); return; }
    this.mode = mode;
    this.bus.emit('mode:changed', { mode });
  }
  setPaused(p) { this.paused = p; this.bus.emit('game:paused', { paused: p }); }

  /** Screen-space pick (CSS pixels). */
  pickScreen(clientX, clientY, maxDist = 250) {
    this._ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const ray = this._raycaster.ray;
    const hit = this.world ? this.world.raycast(ray.origin, ray.direction, maxDist) : null;
    const ent = this.entities.raycast(ray.origin, ray.direction, hit ? hit.dist : maxDist, e => e.kind !== 'player' && e.kind !== 'projectile');
    let point = null;
    if (ent) point = ray.origin.clone().addScaledVector(ray.direction, ent.dist);
    else if (hit) point = hit.point;
    return { hit, entity: ent ? ent.entity : null, point, ray };
  }

  _loop(ts) {
    requestAnimationFrame(this._loop);
    // optional frame cap (phones with 90–120 Hz screens otherwise render twice the frames and heat up)
    const cap = this.settings?.fpsCap || 0;
    if (cap && this._lastTs !== undefined && ts - this._lastTs < 1000 / cap - 2) return;
    this._lastTs = ts;
    this._timer.update(ts);
    const raw = this._timer.getDelta();
    // up to 0.1 s per frame, split into two sub-steps when slow, so a 15-20 FPS phone doesn't run the game in slow motion
    const total = Math.min(0.1, raw);
    const steps = total > 0.05 ? 2 : 1;
    const dt = total / steps;
    this.time += total;
    if (this.running && !this.paused) {
      this._adaptQuality(raw);
      for (let k = 0; k < steps; k++) {
        this.state.update(dt);
        for (const s of this.systems) {
          try { s.update?.(dt); } catch (e) { console.error('system update failed', s.constructor.name, e); }
        }
      }
      this.world.updateDamageDecay(this.time);
    } else {
      if (!this.running && this.world) this._menuCamera(dt);
      this.particles.update(dt);
      this.input?.update?.(0);
    }
    try { this.ui?.update?.(dt); } catch (e) { console.error('ui update failed', e); }
    this.audio?.update?.(dt);
    if (this.chunkRenderer) this.chunkRenderer.update();
    this.renderer.render(dt);
  }

  /** Measures FPS while playing and lowers graphics quality / render scale when the device can't keep up. */
  _adaptQuality(raw) {
    if (this._qLocked) return;
    const a = this._fps || (this._fps = { t: 0, n: 0, warm: 3 });
    if (a.warm > 0) { a.warm -= raw; return; }            // ignore start-up hitches
    a.t += raw; a.n++;
    if (a.t < 4) return;
    const fps = a.n / a.t;
    a.t = 0; a.n = 0;
    // with a frame cap the thresholds scale down (30 fps by choice is not a slow device)
    const cap = this.settings?.fpsCap || 60;
    if (fps >= Math.min(40, cap * 0.9)) { if (++a.good >= 3) this._qLocked = true; return; }
    a.good = 0;
    if (fps < Math.min(30, cap * 0.75)) {
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(this.quality);
      if (i >= 0 && i < 2) {
        this.renderer.setQuality(order[i + 1]);
        try { localStorage.setItem('zc_quality', this.quality); } catch (e) { /* ignore */ }
        this.bus.emit('toast', { text: 'Графика снижена для плавной игры', kind: 'info' });
        a.warm = 2;
      } else if (this.renderer.renderScale > 0.6) {
        this.renderer.renderScale = Math.max(0.6, this.renderer.renderScale - 0.2);
        this.renderer.resize();
        a.warm = 2;
      }
    }
  }

  /**
   * Main-menu backdrop: a slow, steady flight around the village. The height is fixed for the whole circle
   * (above the tallest thing on it), the camera looks at the town hall, and position and aim are smoothed,
   * so nothing wobbles with the ground below.
   */
  _menuCamera(dt) {
    const w = this.world, th = this.village?.townHall;
    const cx = th?.center?.x ?? w.size / 2, cz = th?.center?.z ?? w.size / 2;
    let m = this._menuShot;
    if (!m || m.world !== w || Math.abs(m.cx - cx) > 1 || Math.abs(m.cz - cz) > 1) {
      // survey the circle once: the flight height clears every tree and roof on it
      const R = 60;
      let top = 0;
      for (let k = 0; k < 96; k++) {
        const a = k / 96 * Math.PI * 2;
        for (const rr of [R - 10, R, R + 10]) top = Math.max(top, w.surfaceY(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr));
      }
      const ground = th ? th.y : w.surfaceY(cx, cz);
      m = this._menuShot = { world: w, cx, cz, R, ground, height: Math.max(top + 8, ground + 26), pos: null, aim: null };
    }
    this.menuOrbit += dt * 0.03;
    const a = this.menuOrbit;
    const r = m.R + Math.sin(a * 0.7) * 6;
    const want = { x: cx + Math.cos(a) * r, y: m.height + Math.sin(a * 0.45) * 3, z: cz + Math.sin(a) * r };
    const aim = { x: cx + Math.cos(a * 0.37) * 5, y: m.ground + 6 + Math.sin(a * 0.6) * 1.5, z: cz + Math.sin(a * 0.37) * 5 };
    const k = m.pos ? 1 - Math.exp(-dt * 1.5) : 1;
    m.pos = m.pos || { ...want }; m.aimP = m.aimP || { ...aim };
    for (const q of ['x', 'y', 'z']) { m.pos[q] += (want[q] - m.pos[q]) * k; m.aimP[q] += (aim[q] - m.aimP[q]) * k; }
    this.camera.position.set(m.pos.x, m.pos.y, m.pos.z);
    this.camera.lookAt(m.aimP.x, m.aimP.y, m.aimP.z);
    this.renderer.shadowFocus.set(cx, m.ground, cz);
    this.state.timeOfDay = (this.state.timeOfDay + dt / 400) % 1;
    w.pumpGeneration?.(cx, cz, 180, 3);      // fill in the land around the backdrop while the menu is open
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
