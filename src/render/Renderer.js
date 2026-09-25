import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from './Sky.js';
import { worldUniforms } from './chunkMaterials.js';

// Sky color keyframes over timeOfDay (0 midnight, .25 sunrise, .5 noon, .75 sunset)
const KEYS = [
  { t: 0.00, top: 0x02040c, horizon: 0x0a1226, bottom: 0x020308, fog: 0x070b18, sun: 0x8899ff, amb: 0.16, sunI: 0.0, moonI: 0.22, cloud: 0x1a2030 },
  { t: 0.20, top: 0x07102a, horizon: 0x1d2446, bottom: 0x05060d, fog: 0x151a33, sun: 0xff9955, amb: 0.2, sunI: 0.0, moonI: 0.18, cloud: 0x2a2f45 },
  { t: 0.25, top: 0x3a5a9a, horizon: 0xf39a5a, bottom: 0x2a2030, fog: 0xc88a6a, sun: 0xffa060, amb: 0.45, sunI: 0.9, moonI: 0.0, cloud: 0xffc9a0 },
  { t: 0.32, top: 0x3d7fe0, horizon: 0xa8d0ff, bottom: 0x6a88a8, fog: 0xa9cdf5, sun: 0xfff0d8, amb: 0.8, sunI: 2.3, moonI: 0, cloud: 0xffffff },
  { t: 0.50, top: 0x2f78e8, horizon: 0xb6dcff, bottom: 0x7f9ab8, fog: 0xb4d6fb, sun: 0xfff6e8, amb: 0.9, sunI: 2.7, moonI: 0, cloud: 0xffffff },
  { t: 0.68, top: 0x3a76d8, horizon: 0xb0d2f5, bottom: 0x6a88a8, fog: 0xadcff3, sun: 0xffecd0, amb: 0.8, sunI: 2.3, moonI: 0, cloud: 0xffffff },
  { t: 0.75, top: 0x34427e, horizon: 0xff7a45, bottom: 0x2a1c28, fog: 0xc66a4e, sun: 0xff7a40, amb: 0.45, sunI: 0.9, moonI: 0, cloud: 0xff9a7a },
  { t: 0.80, top: 0x0a1030, horizon: 0x3a2a4a, bottom: 0x06060d, fog: 0x1c1a33, sun: 0xff6040, amb: 0.22, sunI: 0.0, moonI: 0.18, cloud: 0x2a2840 },
  { t: 1.00, top: 0x02040c, horizon: 0x0a1226, bottom: 0x020308, fog: 0x070b18, sun: 0x8899ff, amb: 0.16, sunI: 0.0, moonI: 0.22, cloud: 0x1a2030 },
];
const C = (h) => new THREE.Color(h);
const KC = KEYS.map(k => ({ ...k, top: C(k.top), horizon: C(k.horizon), bottom: C(k.bottom), fog: C(k.fog), sun: C(k.sun), cloud: C(k.cloud) }));

export class Renderer {
  constructor(game, canvasParent = document.body) {
    this.game = game;
    const q = game.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    canvasParent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 800);
    this.scene.fog = new THREE.Fog(0xb4d6fb, 40, q === 'low' ? 85 : 130);
    this.fogFar = this.scene.fog.far;

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5b4a3a, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 2.5);
    this.sun.castShadow = q !== 'low';
    const sm = q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.2);
    this.scene.add(this.moon, this.moon.target);

    this.sky = new Sky(this.scene);
    this.shadowFocus = new THREE.Vector3();
    this.sunDir = new THREE.Vector3();
    this._c = {};
    for (const k of ['top', 'horizon', 'bottom', 'fog', 'sun', 'cloud']) this._c[k] = new THREE.Color();

    this.composer = null;
    if (q === 'high') this.enableBloom();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }
  get domElement() { return this.renderer.domElement; }

  enableBloom() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q) {
    this.game.quality = q;
    const r = this.renderer;
    r.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const sm = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(sm, sm);
    r.shadowMap.type = THREE.PCFShadowMap;
    if (q === 'high' && !this.composer) this.enableBloom();
    if (q !== 'high' && this.composer) { this.composer.dispose?.(); this.composer = null; }
    this.scene.fog.far = this.fogFar = q === 'low' ? 85 : 130;
    this.game.chunkRenderer?.setShadows(q !== 'low');
    this.scene.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(mm => mm.needsUpdate = true); } });
    this.resize();
  }

  resize() {
    const q = this.game.quality;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(innerWidth, innerHeight);
    }
  }

  /** Project a world position to CSS pixels. Returns null when behind the camera. */
  worldToScreen(v, out = { x: 0, y: 0 }) {
    const p = this._proj || (this._proj = new THREE.Vector3());
    p.copy(v).project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    out.x = (p.x * 0.5 + 0.5) * innerWidth; out.y = (-p.y * 0.5 + 0.5) * innerHeight;
    return out;
  }

  updateDayNight(dt) {
    const st = this.game.state;
    const t = st.timeOfDay;
    let i = 0; while (i < KC.length - 2 && KC[i + 1].t <= t) i++;
    const a = KC[i], b = KC[i + 1];
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const c = this._c;
    for (const k of ['top', 'horizon', 'bottom', 'fog', 'sun', 'cloud']) c[k].copy(a[k]).lerp(b[k], f);
    const amb = a.amb + (b.amb - a.amb) * f, sunI = a.sunI + (b.sunI - a.sunI) * f, moonI = a.moonI + (b.moonI - a.moonI) * f;
    const night = st.nightFactor;
    // sun travels east → west; tilt a bit so shadows are never perfectly axis aligned
    const ang = (t - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const focus = this.shadowFocus;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(c.sun);
    this.sun.intensity = sunI * (this.sunDir.y > 0 ? 1 : 0);
    this.sun.castShadow = this.game.quality !== 'low' && this.sunDir.y > 0.05;
    this.moon.position.copy(focus).addScaledVector(this.sunDir, -120);
    this.moon.target.position.copy(focus);
    this.moon.intensity = moonI;
    this.hemi.intensity = amb;
    this.hemi.color.copy(c.horizon).lerp(new THREE.Color(0xffffff), 0.4);
    this.hemi.groundColor.set(0x4a3c30).multiplyScalar(0.4 + amb * 0.6);
    this.scene.fog.color.copy(c.fog);
    // fog closes in a bit at night — spookier waves
    this.scene.fog.near = 30 - night * 12;
    this.scene.fog.far = this.fogFar * (1 - night * 0.25);
    worldUniforms.uSkyLight.value = 1 - night * 0.7;
    worldUniforms.uBlockLightStrength.value = 1.1 + night * 0.6;
    this.renderer.toneMappingExposure = 1.0 + night * 0.25;
    this.sky.update(dt, this.camera.position, this.sunDir, c, night, this.game.time);
    if (this.bloom) this.bloom.strength = 0.25 + night * 0.35;
  }

  render(dt) {
    worldUniforms.uTime.value = this.game.time;
    this.updateDayNight(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
