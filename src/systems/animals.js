// Animals of the surface: chickens, sheep, cows and pigs graze in small herds on the meadows around the player.
// They wander, put their heads down to graze, call now and then (recorded sounds, see audio/library.js), bolt when
// hurt, and give the village food when the player hunts them. Nobody else bothers them: the dead and the rival towns
// fight people. They live only near the player (spawned in the light on grass, gone when far away) and are not saved.
// Predators — wolves in packs and lone bears — roam the forests, hills and tundra, more of them at night: they hunt
// the player and the villagers (the village's guards and towers shoot them), and a wolf badly hurt runs away.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { B, WATER_IDS } from '../core/blocks.js';

// size in pixels (1/16 block): body [w, h, d], leg length, head [w, h, d]
export const SPECIES = {
  chicken: { name: 'Курица', hp: 4, speed: 1.5, body: [6, 6, 8], leg: 5, head: [4, 6, 3], radius: 0.25, height: 0.75, food: [1, 2], sound: 'chicken', death: 'animal_death', pitch: 1,
    color: 0xf4f2ec, spot: 0xe0ddd2, face: 0xf4f2ec, nose: 0xe8a428, noseSize: [4, 2, 2], comb: 0xd02a20, legColor: 0xe8a428, biped: true },
  sheep: { name: 'Овца', hp: 8, speed: 1.4, body: [10, 9, 15], leg: 8, head: [6, 6, 7], radius: 0.42, height: 1.25, food: [2, 3], sound: 'sheep', death: 'animal_death', pitch: 1,
    color: 0xe9e6dd, spot: 0xd9d5c9, face: 0xc9ad92, nose: 0xb89a80, noseSize: [4, 2, 1], legColor: 0xc9ad92 },
  cow: { name: 'Корова', hp: 10, speed: 1.3, body: [12, 10, 18], leg: 10, head: [8, 8, 6], radius: 0.46, height: 1.45, food: [3, 5], sound: 'cow', death: 'animal_death', pitch: 0.95,
    color: 0x5a3a24, spot: 0xece8e0, face: 0x5a3a24, nose: 0xd8b8a8, noseSize: [6, 3, 1], horns: 0xe8e0c8, legColor: 0x4a2e1c, spots: true },
  pig: { name: 'Свинья', hp: 10, speed: 1.5, body: [10, 8, 14], leg: 5, head: [8, 8, 7], radius: 0.42, height: 0.95, food: [2, 4], sound: 'pig', death: 'pig_death', pitch: 1,
    color: 0xeaa4a4, spot: 0xdc9494, face: 0xeaa4a4, nose: 0xd88a8a, noseSize: [4, 3, 1], legColor: 0xdc9494 },
  // predators: hunt (dmg per bite, reach, seconds between bites, how far they notice prey, how fast they run)
  wolf: { name: 'Волк', hp: 26, speed: 1.6, body: [8, 8, 16], leg: 8, head: [7, 6, 6], radius: 0.38, height: 1.05, food: [1, 2], sound: 'wolf_growl', death: 'wolf_die', hurt: 'wolf_hurt', pitch: 1,
    color: 0x8a8a8c, spot: 0x6e6e72, face: 0x9a9a9c, nose: 0x7a7a7c, noseSize: [3, 3, 4], legColor: 0x7a7a7e, ears: 0x6a6a6e, tail: [2, 2, 8],
    predator: { dmg: 7, reach: 1.1, cd: 1.0, aggro: 18, run: 2.6, pack: true, flee: 0.3 } },
  bear: { name: 'Медведь', hp: 90, speed: 1.3, body: [14, 13, 22], leg: 9, head: [10, 9, 8], radius: 0.6, height: 1.7, food: [5, 8], sound: 'bear_roar', death: 'bear_roar', hurt: 'bear_attack', pitch: 0.7,
    color: 0x5c3e26, spot: 0x4c321e, face: 0x5c3e26, nose: 0x8a6a4a, noseSize: [5, 4, 3], legColor: 0x4c321e, ears: 0x4c321e, tail: [3, 3, 3],
    predator: { dmg: 16, reach: 1.4, cd: 1.6, aggro: 13, run: 2.3, flee: 0 } },
};
export const PREDATORS = new Set(['wolf', 'bear']);
// where the predators roam: forests, birch woods, hills, swamps and the tundra
const WILD_BIOME = { 1: ['wolf', 'wolf', 'bear'], 2: ['wolf', 'bear'], 5: ['wolf', 'wolf', 'bear'], 8: ['wolf'], 9: ['wolf', 'wolf', 'bear'], 0: ['wolf'] };
// who grazes where (biome ids: see world/terrain.js BIOME)
const BY_BIOME = { 0: ['cow', 'sheep', 'pig', 'chicken', 'cow'], 1: ['pig', 'chicken', 'cow'], 2: ['sheep', 'sheep', 'cow'], 5: ['sheep', 'chicken', 'pig'], 7: ['cow', 'chicken'], 8: ['pig', 'pig', 'chicken'], 9: ['sheep'] };
const GRAZE = new Set([B.GRASS, B.DRY_GRASS, B.SNOW]);
const WILD_CAP_DAY = 2, WILD_CAP_NIGHT = 5;
const CAP = 10, NEAR = 30, FAR = 60, GONE = 100;

// ---------------------------------------------------------------- the blocky body
const TEX = {};
function hideTex(kind, S) {
  if (TEX[kind]) return TEX[kind];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'), hex = (n) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(S.color); g.fillRect(0, 0, 16, 16);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = hex(S.spot);
  if (S.spots) { for (let i = 0; i < 4; i++) { const x = rnd() * 12 | 0, y = rnd() * 12 | 0; g.fillRect(x, y, 3 + (rnd() * 3 | 0), 2 + (rnd() * 3 | 0)); } }
  else for (let i = 0; i < 26; i++) g.fillRect(rnd() * 16 | 0, rnd() * 16 | 0, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return (TEX[kind] = t);
}

export class AnimalModel {
  constructor(kind) {
    const S = SPECIES[kind], px = this.px = 1 / 16;
    this.kind = kind;
    this.group = new THREE.Group();
    this.root = new THREE.Group(); this.group.add(this.root);
    this.mats = [];
    const mat = (opts) => { const m = new THREE.MeshLambertMaterial(opts); m.userData.base = m.color.clone(); this.mats.push(m); return m; };
    this.material = mat({ map: hideTex(kind, S) });
    const flat = (c) => mat({ color: c });
    const box = (w, h, d, parent, x, y, z, m = this.material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * px, h * px, d * px), m);
      mesh.position.set(x * px, y * px, z * px); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    const [bw, bh, bd] = S.body, L = S.leg, [hw, hh, hd] = S.head;
    this.body = new THREE.Group(); this.body.position.y = (L + bh / 2) * px; this.root.add(this.body);
    box(bw, bh, bd, this.body, 0, 0, 0);
    // legs hang from the body's corners
    const legM = flat(S.legColor);
    this.legs = [];
    const legW = S.biped ? 1 : Math.max(3, Math.round(bw * 0.3));
    const spots = S.biped ? [[-1.5, 0], [1.5, 0]] : [[-bw / 2 + legW / 2, bd / 2 - legW / 2 - 1], [bw / 2 - legW / 2, bd / 2 - legW / 2 - 1], [-bw / 2 + legW / 2, -bd / 2 + legW / 2 + 1], [bw / 2 - legW / 2, -bd / 2 + legW / 2 + 1]];
    spots.forEach(([x, z], i) => {
      const hip = new THREE.Group(); hip.position.set(x * px, L * px, z * px); this.root.add(hip);
      box(legW, L, legW, hip, 0, -L / 2, 0, legM);
      if (S.biped) box(3, 1, 3, hip, 0, -L + 0.5, 1, legM);       // a chicken's foot
      this.legs.push({ hip, ph: i % 2 === (i >> 1) % 2 ? 0 : Math.PI });
    });
    // head on a neck pivot at the front of the body
    this.head = new THREE.Group();
    this.head.position.set(0, (L + bh * (S.biped ? 0.6 : 0.75)) * px, (bd / 2 - (S.biped ? 1 : 0)) * px);
    this.root.add(this.head);
    const faceM = kind === 'sheep' ? flat(S.face) : this.material;
    box(hw, hh, hd, this.head, 0, S.biped ? hh / 2 : 1, hd / 2, faceM);
    const [nw, nh, nd] = S.noseSize;
    box(nw, nh, nd, this.head, 0, S.biped ? hh / 2 : -0.5, hd + nd / 2, flat(S.nose));
    if (S.comb) { box(2, 2, 2, this.head, 0, hh + 1, hd / 2, flat(S.comb)); box(2, 2, 1, this.head, 0, hh / 2 - 2, hd + 0.5, flat(S.comb)); }
    if (S.horns) for (const s of [-1, 1]) box(1, 3, 1, this.head, s * (hw / 2 + 0.5), 1 + hh / 2, hd / 2, flat(S.horns));
    const eyeM = flat(0x141414);
    for (const s of [-1, 1]) box(1, 1, 0.4, this.head, s * (hw / 2 - 1), (S.biped ? hh / 2 : 1) + (S.biped ? 1 : 1.5), hd + 0.21, eyeM);
    if (kind === 'sheep') box(bw + 2, bh + 2, bd - 2, this.body, 0, 0.5, 0);        // the fleece
    if (S.ears) for (const s of [-1, 1]) box(kind === 'wolf' ? 2 : 3, kind === 'wolf' ? 3 : 2, 1, this.head, s * (hw / 2 - 1.5), 1 + hh / 2 + 1, hd / 2 - 1, flat(S.ears));
    if (S.tail) {
      const [tw, th, td] = S.tail;
      this.tail = new THREE.Group(); this.tail.position.set(0, bh / 2 - 1 * px, -bd / 2 * px); this.body.add(this.tail);
      box(tw, th, td, this.tail, 0, 0, -td / 2);
      this.tail.rotation.x = kind === 'wolf' ? -0.5 : 0;
    }
    if (kind === 'wolf') for (const s of [-1, 1]) box(1, 1, 0.4, this.head, s * (hw / 2 - 1), 2.5, hd + 0.22, flat(0xe8c040));   // yellow eyes
    this.phase = Math.random() * 6; this.graze = 0; this.flashT = 0; this.dieT = 0; this.forced = null; this.action = null;
    this.flashColor = new THREE.Color();
  }
  play(name) { if (name === 'die') { this.forced = 'die'; this.dieT = 0; } else if (name === 'attack') { this.action = 'attack'; this.actionT = 0; } }
  setHeld() {}
  flash(color = 0xff3030) { this.flashT = 0.2; this.flashColor.set(color); }
  setLight(sky, block) { this._light = { s: 0.12 + 0.88 * sky * sky, b: Math.pow(block, 1.6) }; }
  update(dt, speed = 0) {
    const moving = speed > 0.15;
    this.phase += dt * (moving ? 5 + speed * 3 : 0);
    const sw = moving ? Math.sin(this.phase) * Math.min(0.8, 0.35 + speed * 0.2) : 0;
    for (const L of this.legs) L.hip.rotation.x = Math.sin(this.phase + L.ph) * Math.abs(sw);
    // grazing: the head goes down to the grass
    this.head.rotation.x += ((this.graze ? 0.9 : moving ? 0.1 : 0) - this.head.rotation.x) * Math.min(1, dt * 4);
    if (this.tail) this.tail.rotation.y = Math.sin(this.phase * 0.7) * (moving ? 0.4 : 0.15);
    if (this.action) { this.actionT += dt; this.head.rotation.x = -Math.sin(Math.min(1, this.actionT / 0.3) * Math.PI) * 0.5; if (this.actionT > 0.3) this.action = null; }
    if (this.forced === 'die') { this.dieT = Math.min(1, this.dieT + dt * 3); this.root.rotation.z = this.dieT * Math.PI / 2; this.root.position.y = this.dieT * 0.25; }
    const Lt = this._light || { s: 1, b: 0 };
    for (const m of this.mats) {
      if (this.flashT > 0) { m.color.setRGB(1, 0.45, 0.45); continue; }
      const b = Lt.b * 0.45, base = m.userData.base;
      m.color.setRGB(base.r * Math.min(1.25, Lt.s + b), base.g * Math.min(1.25, Lt.s + b * 0.72), base.b * Math.min(1.25, Lt.s + b * 0.42));
    }
    if (this.flashT > 0) this.flashT -= dt;
  }
  dispose() {
    this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.mats) if (m !== this.material || !m.map) m.dispose();
  }
}

// ---------------------------------------------------------------- one animal
export class Animal extends Entity {
  constructor(game, kind) {
    const S = SPECIES[kind];
    super(game, { kind: 'animal', faction: S.predator ? 'wild' : 'neutral', radius: S.radius, height: S.height, maxHp: S.hp });
    this.species = kind; this.S = S; this.name = S.name;
    this.predator = S.predator || null; this.prey = null; this.biteT = 0; this.huntT = 0;
    this.model = new AnimalModel(kind);
    this.object3d.add(this.model.group);
    this.goal = null; this.thinkT = Math.random() * 3; this.callT = 4 + Math.random() * 16; this.panicT = 0; this.from = null;
    this.speedNow = 0;
  }
  onHurt(amount, source) {
    const P = this.predator, who = source?.user || source?.owner || source;
    this.game.audio?.play(this.S.hurt || this.S.sound, { pos: this.eye, pitch: this.S.pitch * 1.25, volume: 0.9 });
    // a predator turns on whoever hurt it — unless it is a wolf near death, which runs
    if (P && !(this.hp < this.maxHp * P.flee)) { if (who?.position && who.faction !== this.faction && !who.dead) { this.prey = who; this.huntT = 0; } return; }
    this.panicT = 5; this.from = source?.position || source?.user?.position || null; this.thinkT = 0; this.prey = null;
  }
  onDeath(source) {
    const g = this.game, S = this.S;
    g.audio?.play(S.death, { pos: this.eye, pitch: S.pitch, volume: 0.8 });
    const killer = source?.user || source?.owner || source;
    if (killer && (killer === g.player || killer.kind === 'player')) {
      const n = S.food[0] + Math.floor(Math.random() * (S.food[1] - S.food[0] + 1));
      if (g.net?.isClient) g.net.send({ t: 'loot', res: { food: n } });       // the stores of this player's side are on the host
      else g.state.add('food', n);
      g.bus.emit('village:gain', { pos: this.eye.clone(), text: `+${n} Еда`, res: 'food' });
      g.state.stats.animals = (g.state.stats.animals || 0) + 1;
    }
  }
  /** A predator picks its prey: the nearest person (the player, a villager, another player's hero) it can see. */
  _hunt(dt) {
    const g = this.game, P = this.predator, pos = this.position;
    this.huntT -= dt;
    if (this.huntT <= 0) {
      this.huntT = 0.6;
      const night = g.state.isNight ? 1.4 : 1;
      if (this.prey && (this.prey.dead || this.prey.hidden || this.prey.position.distanceTo(pos) > P.aggro * night * 2.2)) this.prey = null;
      if (!this.prey && this.panicT <= 0) {
        const t = g.entities.nearest(pos, (e) => e.faction === 'village' && !e.hidden && !e.invisible && e.kind !== 'projectile' && Math.abs(e.position.y - pos.y) < 6, P.aggro * night);
        if (t) {
          this.prey = t;
          g.audio?.play(this.S.sound, { pos: this.eye, pitch: this.S.pitch, volume: 1 });
          // the pack hunts together
          if (P.pack) for (const o of g.animals?.list || []) if (o !== this && o.species === this.species && !o.dead && !o.prey && o.position.distanceTo(pos) < 14) o.prey = t;
        }
      }
    }
    const t = this.prey;
    if (!t) return false;
    const dx = t.position.x - pos.x, dz = t.position.z - pos.z, d = Math.hypot(dx, dz);
    this.model.graze = 0;
    this.biteT -= dt;
    if (d < this.radius + (t.radius || 0.3) + P.reach && Math.abs(t.position.y - pos.y) < 1.8) {
      this.velocity.x *= 0.5; this.velocity.z *= 0.5;
      if (this.biteT <= 0) {
        this.biteT = P.cd;
        this.model.play('attack');
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        g.combat?.meleeHit?.(this, t, P.dmg * (g.state.isNight ? 1.15 : 1), { kind: 'phys', knockback: this.species === 'bear' ? 6 : 3, dir });
        g.audio?.play(this.species === 'bear' ? 'bear_attack' : 'wolf_growl', { pos: this.eye, pitch: this.S.pitch * (0.95 + Math.random() * 0.1), volume: 0.8 });
      }
      this.goal = null;
      this._face(dx / (d || 1), dz / (d || 1), dt);
      return { mx: 0, mz: 0 };
    }
    return { mx: dx / (d || 1), mz: dz / (d || 1), run: true };
  }
  _face(mx, mz, dt) {
    let d = Math.atan2(mx, mz) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += Math.max(-dt * 8, Math.min(dt * 8, d));
  }
  update(dt) {
    const g = this.game, w = g.world;
    this.tickStatus(dt);
    if (this.dead) { this.velocity.x *= 0.8; this.velocity.z *= 0.8; this.physics(dt); this.model.update(dt, 0); this.syncObject(dt); return; }
    if (this.predator && this.panicT > 0) this.panicT -= dt;
    const hunt = this.predator ? this._hunt(dt) : false;
    if (hunt) {
      const sp = this.predator.run * (hunt.run ? 1 : 0) * this.speedMul, acc = Math.min(1, dt * (this.onGround ? 8 : 2));
      this.velocity.x += (hunt.mx * sp - this.velocity.x) * acc;
      this.velocity.z += (hunt.mz * sp - this.velocity.z) * acc;
      if ((hunt.mx || hunt.mz) && this.hitWall && this.onGround) this.velocity.y = 6.5;
      if (this.inWater) this.velocity.y = Math.max(this.velocity.y, 2.2);
      if (hunt.mx || hunt.mz) this._face(hunt.mx, hunt.mz, dt);
      this.physics(dt);
      const hs = Math.hypot(this.velocity.x, this.velocity.z);
      this.model.update(dt, hs);
      this.syncObject(dt);
      return;
    }
    // what to do next: wander to a spot near by, stand and graze, or run from whoever hurt it
    this.thinkT -= dt;
    if (this.panicT > 0) this.panicT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = this.panicT > 0 ? 0.8 : 3 + Math.random() * 6;
      this.model.graze = 0;
      if (this.panicT > 0 && this.from) {
        const dx = this.position.x - this.from.x, dz = this.position.z - this.from.z, l = Math.hypot(dx, dz) || 1;
        this.goal = { x: this.position.x + dx / l * 8 + (Math.random() - 0.5) * 4, z: this.position.z + dz / l * 8 + (Math.random() - 0.5) * 4 };
      } else if (Math.random() < 0.45) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
        this.goal = { x: this.position.x + Math.cos(a) * r, z: this.position.z + Math.sin(a) * r };
      } else { this.goal = null; this.model.graze = Math.random() < 0.6 ? 1 : 0; }
    }
    let mx = 0, mz = 0;
    if (this.goal) {
      const dx = this.goal.x - this.position.x, dz = this.goal.z - this.position.z, d = Math.hypot(dx, dz);
      if (d < 0.5) this.goal = null;
      else { mx = dx / d; mz = dz / d; }
    }
    // keep out of deep water and off cliffs: turn back at the edge
    if (mx || mz) {
      const ax = Math.floor(this.position.x + mx * 1.2), az = Math.floor(this.position.z + mz * 1.2), y = Math.floor(this.position.y);
      const below = (yy) => w.isSolid(ax, yy, az);
      if (WATER_IDS[w.getBlock(ax, y, az)] || WATER_IDS[w.getBlock(ax, y - 1, az)] || (!below(y - 1) && !below(y - 2) && !below(y - 3))) { this.goal = null; mx = mz = 0; this.thinkT = Math.min(this.thinkT, 1); }
    }
    const sp = this.S.speed * (this.panicT > 0 ? 2.1 : 1) * this.speedMul;
    const acc = Math.min(1, dt * (this.onGround ? 8 : 2));
    this.velocity.x += (mx * sp - this.velocity.x) * acc;
    this.velocity.z += (mz * sp - this.velocity.z) * acc;
    if ((mx || mz) && this.hitWall && this.onGround) this.velocity.y = 6.2;           // hop up a block
    if (this.inWater) this.velocity.y = Math.max(this.velocity.y, 2.2);               // swim to the shore
    if (mx || mz) {
      let d = Math.atan2(mx, mz) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += Math.max(-dt * 6, Math.min(dt * 6, d));
    }
    this.physics(dt);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedNow = hs;
    // a call now and then (only heard near by)
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = 9 + Math.random() * 18;
      const cam = g.camera.position;
      if (Math.hypot(cam.x - this.position.x, cam.z - this.position.z) < 26) g.audio?.play(this.S.sound, { pos: this.eye, pitch: this.S.pitch, volume: 0.75 });
    }
    this.model.update(dt, hs);
    this.syncObject(dt);
  }
}

// ---------------------------------------------------------------- the herds around the player
export class Animals {
  constructor(game) { this.game = game; this.list = []; this._t = 1; }
  init() {
    this.game.bus.on('world:ready', () => this.clear());
    this.game.bus.on('game:begin', () => this.clear());
  }
  clear() { for (const a of this.list) { a.dead = true; a.removeAt = 0; } this.list = []; }
  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!g.running || !p || !w) return;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 2;
    // the far and the fallen go
    this.list = this.list.filter(a => {
      if (a.dead && g.time >= a.removeAt) return false;
      const far = Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) > GONE;
      if (far || a.position.y < 1 || !w.isGenerated(a.position.x, a.position.z)) { a.dead = true; a.removeAt = 0; a.object3d.visible = false; return false; }
      return true;
    });
    this._wild();
    if (this.list.filter(a => !a.dead && !a.predator).length >= CAP) return;
    // a new herd out of sight, on grass in the light, not in the village and not under the player's feet underground
    const surf = w.heightAt(Math.floor(p.position.x), Math.floor(p.position.z));
    if (p.position.y < surf - 12) return;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = NEAR + Math.random() * (FAR - NEAR);
      const x = Math.floor(p.position.x + Math.cos(a) * r), z = Math.floor(p.position.z + Math.sin(a) * r);
      if (!w.isGenerated(x, z)) continue;
      const kinds = BY_BIOME[w.biomeAt(x, z)];
      if (!kinds) continue;
      const v = g.village;
      if (v?.townHall && Math.hypot(x - v.townHall.center.x, z - v.townHall.center.z) < (v.radius || 20) + 6) continue;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const n = kind === 'chicken' ? 2 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 2);
      let made = 0;
      for (let i = 0; i < n * 3 && made < n; i++) {
        const ax = x + Math.floor((Math.random() - 0.5) * 8), az = z + Math.floor((Math.random() - 0.5) * 8);
        const y = w.surfaceY(ax, az);
        if (!GRAZE.has(w.getBlock(ax, y, az)) || w.isSolid(ax, y + 1, az) || w.isSolid(ax, y + 2, az)) continue;
        const an = new Animal(g, kind);
        an.position.set(ax + 0.5, y + 1, az + 0.5);
        an.yaw = Math.random() * Math.PI * 2;
        g.entities.add(an);
        this.list.push(an);
        made++;
      }
      if (made) return;
    }
  }
  /** Wolves and bears out in the wilds: a pack or a lone bear now and then, more of them at night. */
  _wild() {
    const g = this.game, p = g.player, w = g.world;
    const cap = g.state.isNight ? WILD_CAP_NIGHT : WILD_CAP_DAY;
    if (this.list.filter(a => !a.dead && a.predator).length >= cap || Math.random() > (g.state.isNight ? 0.4 : 0.15)) return;
    if (p.position.y < w.heightAt(Math.floor(p.position.x), Math.floor(p.position.z)) - 12) return;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 36 + Math.random() * 26;
      const x = Math.floor(p.position.x + Math.cos(a) * r), z = Math.floor(p.position.z + Math.sin(a) * r);
      if (!w.isGenerated(x, z)) continue;
      const kinds = WILD_BIOME[w.biomeAt(x, z)];
      if (!kinds) continue;
      const v = g.village;
      if (v?.townHall && Math.hypot(x - v.townHall.center.x, z - v.townHall.center.z) < (v.radius || 20) + 30) continue;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const n = kind === 'wolf' ? 2 + Math.floor(Math.random() * 2) : 1;
      let made = 0;
      for (let i = 0; i < n * 4 && made < n; i++) {
        const ax = x + Math.floor((Math.random() - 0.5) * 6), az = z + Math.floor((Math.random() - 0.5) * 6);
        const y = w.surfaceY(ax, az);
        if (!GRAZE.has(w.getBlock(ax, y, az)) || w.isSolid(ax, y + 1, az) || w.isSolid(ax, y + 2, az)) continue;
        const an = new Animal(g, kind);
        an.position.set(ax + 0.5, y + 1, az + 0.5);
        an.yaw = Math.random() * Math.PI * 2;
        g.entities.add(an);
        this.list.push(an);
        made++;
      }
      if (made) return;
    }
  }
}
