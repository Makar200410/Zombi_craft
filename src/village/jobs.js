// Villager behaviour "brains" written as generators. Each yield = one frame; `yield` returns dt.
import * as THREE from 'three';
import { B, BLOCKS, LOG_BLOCKS } from '../core/blocks.js';

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TREE_NAMES = { [B.LOG]: 'дуб', [B.BIRCH_LOG]: 'берёзу', [B.SPRUCE_LOG]: 'ель' };
const ORE_TASK = { [B.COAL_ORE]: 'Добывает уголь', [B.IRON_ORE]: 'Добывает железо', [B.GOLD_ORE]: 'Добывает золото', [B.CRYSTAL_ORE]: 'Добывает кристаллы' };
const DEST = { town_hall: 'в ратушу', storehouse: 'на склад', farm: 'в амбар', lumber_camp: 'на лесопилку', mine: 'к шахте' };

export function brainFor(v, mode) {
  if (mode === 'hide') return hideBrain(v, false);
  if (mode === 'flee') return hideBrain(v, true);
  const f = BRAINS[v.job] || idleBrain;
  return f(v);
}

// ---------------------------------------------------------------- shared pieces
function* deposit(v) {
  if (v.carryTotal <= 0) return;
  const b = v.village.storageFor(v.position, Object.keys(v.carry), v.workplace);
  if (!b) { v.depositCarry(); return; }
  v.task = 'Несёт ' + v.carryText() + ' ' + (DEST[b.type] || 'на склад');
  yield* v.walkTo(b.door, 1.6, { maxTime: 50 });
  v.face(b.center);
  v.model.setLoop(null);
  v.model.play('harvest');
  yield* v.wait(0.5);
  const got = v.depositCarry();
  const n = Object.values(got).reduce((a, c) => a + c, 0);
  if (n > 0) {
    v.game.audio?.play('place_block', { pos: v.position, volume: 0.5, pitch: 0.8 });
    v.village.floatText(v.eye, '+' + n, Object.keys(got)[0]);
  }
  yield* v.wait(0.3);
}

function* idleStep(v, task, radius = 9) {
  v.task = task || pick(['Бездельничает', 'Гуляет по деревне', 'Глазеет по сторонам']);
  const c = v.village.plazaPoint();
  const target = v.village.randomWalkable(c, radius);
  if (target) yield* v.walkTo(target, 1.2, { maxTime: 20, teleport: false, speed: v.walkSpeed * 0.8 });
  const buddy = v.village.villagers.find(o => o !== v && !o.dead && !o.hidden && (o.job === 'idle' || o._chatting) && o.distTo(v.position) < 4);
  const r = rnd();
  if (buddy && r < 0.55) {
    v._chatting = true;
    v.face(buddy.position);
    v.task = 'Болтает с ' + buddy.name.split(' ')[0];
    for (let i = 0; i < 3; i++) {
      if (rnd() < 0.6) v.game.audio?.play('villager_hmm', { pos: v.eye, volume: 0.5, pitch: (v.female ? 1.3 : 0.9) + rnd() * 0.2 });
      v.model.lookPitch = rnd() * 0.2 - 0.1;
      yield* v.wait(1.2 + rnd() * 1.5);
    }
    v._chatting = false;
  } else if (r < 0.8 && v.job === 'idle') {
    v.task = 'Отдыхает';
    v.model.play('sit');
    yield* v.wait(4 + rnd() * 6);
    v.model.play('none');
  } else yield* v.wait(1 + rnd() * 3);
}

function* waitForWorkplace(v, what) {
  const b = v.workplace;
  if (b && b.state === 'destroyed') yield* idleStep(v, 'Ждёт восстановления: ' + b.name, 7);
  else if (b) yield* idleStep(v, 'Ждёт постройки: ' + b.name, 7);
  else yield* idleStep(v, what, 9);
}

// ---------------------------------------------------------------- idle
function* idleBrain(v) {
  if (v.carryTotal > 0) yield* deposit(v);
  while (true) yield* idleStep(v, null, 10);
}

// ---------------------------------------------------------------- hide / flee
function* hideBrain(v, flee) {
  if (!v.hidden) {
    let home = v.village.homeFor(v);
    if (!home) { // nowhere to hide: just run away from zombies
      while (v.village.nearestZombie(v.position, 14)) {
        v.task = 'Убегает от зомби';
        const z = v.village.nearestZombie(v.position, 14);
        const dx = v.position.x - z.position.x, dz = v.position.z - z.position.z, d = Math.hypot(dx, dz) || 1;
        v.steerTo(v.position.x + dx / d * 4, v.position.z + dz / d * 4, 4.2, true);
        yield;
      }
      return;
    }
    v.task = flee ? 'Убегает от зомби' : (v.game.state.isNight ? 'Идёт домой спать' : 'Спешит в укрытие');
    const ok = yield* v.walkTo(home.door, 1.4, { speed: flee ? 4.3 : v.walkSpeed * 1.25, maxTime: 45 });
    if (!ok) return;
    home = v.village.homeFor(v) || home;
    v.hide(home);
  }
  while (true) {
    const home = v.hideHome;
    if (!home || home.state === 'destroyed') break;
    const danger = v.zombiesActive || (home && v.village.nearestZombie(home.center, 16));
    if (!danger && !v.game.state.isNight) break;
    v.task = danger ? 'Прячется от зомби' : 'Спит';
    yield* v.wait(0.5);
  }
  v.unhide();
  v.fleeUntil = 0;
  if (v.village.nearestZombie(v.position, 9)) v.fleeUntil = v.game.time + 3;
}

// ---------------------------------------------------------------- builder
const CLEAR = 0;
function* builderBrain(v) {
  if (v.carryTotal > 0) yield* deposit(v);
  const vil = v.village, game = v.game;
  let beat = 0;
  while (true) {
    const b = vil.pickBuildTarget(v);
    if (!b) { v.buildTarget = null; yield* idleStep(v, 'Ждёт заказов', 8); continue; }
    v.buildTarget = b;
    if (b.state === 'destroyed') { b.state = 'constructing'; b.computeOps(); vil.onRebuildStarted(b); }
    if (b.state === 'planned') { b.state = 'constructing'; }
    const skip = (op) => vil.cellOccupied(op.x, op.y, op.z, op.id);
    const i = b.nextOp(v.position, skip);
    if (i < 0) {
      if (b.state === 'constructing') {
        if (b.remainingOps === 0) { if (!b.reserved.size) vil.completeBuilding(b); yield* v.wait(0.3); continue; }
        // someone stands where we need to build: step aside
        v.task = 'Ждёт, пока освободят место';
        const t = vil.randomWalkable(b.center, Math.max(b.w, b.d) / 2 + 3);
        if (t) yield* v.walkTo(t, 1, { maxTime: 8, teleport: false });
        yield* v.wait(0.5);
        continue;
      }
      // complete building: blocks fine, hp missing → hammer repair
      if (b.hp < b.maxHp) {
        v.task = 'Чинит: ' + b.name;
        if (b.distanceTo(v.position) > 2.5) yield* v.walkTo(b.door, 2.5, { maxTime: 30 });
        v.face(b.center);
        yield* v.work('hammer', 1.2, 0.45, () => { game.audio?.play('hammer', { pos: v.position, volume: 0.5 }); });
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06 * v.workSpeed);
        if (b.hp >= b.maxHp) { b.needsRepair = false; vil.bus.emit('building:repaired', { building: b }); }
        continue;
      }
      b.needsRepair = false;
      yield;
      continue;
    }
    const op = b.ops[i];
    b.reserved.add(i);
    const rel = v.onRelease(() => b.reserved.delete(i));
    const opPos = { x: op.x + 0.5, y: b.y + 1, z: op.z + 0.5 };
    const REACH = 5.2;
    if (v.distTo(opPos) > REACH || Math.abs(v.position.y - (b.y + 1)) > 3) {
      v.task = (b.state === 'complete' ? 'Идёт чинить: ' : 'Идёт строить: ') + b.name;
      yield* v.walkTo(opPos, 3.5, { maxTime: 35 });
    }
    const repairing = b.state === 'complete';
    v.task = (op.kind === CLEAR ? 'Расчищает место: ' : repairing ? 'Чинит: ' : 'Строит: ') + b.name;
    v.face({ x: op.x + 0.5, z: op.z + 0.5 });
    v.model.lookPitch = Math.max(-0.6, Math.min(0.6, -(op.y + 0.5 - v.eye.y) / Math.max(1, v.distTo(opPos)) * 0.6));
    const def = BLOCKS[game.world.getBlock(op.x, op.y, op.z)];
    const mech = game.state.researchDone.has('mechanics') ? 1.3 : 1;
    const speed = v.workSpeed * mech;
    const dur = op.kind === CLEAR ? (def && def.solid ? 0.35 + Math.min(1.2, def.hardness * 0.15) : 0.15) : 0.55;
    v.model.play(op.kind === CLEAR && def && def.tool === 'pick' ? 'mine' : 'hammer');
    yield* v.wait(dur / speed);
    if (!b.opDone(op) && !vil.cellOccupied(op.x, op.y, op.z, op.id) && b.state !== 'destroyed') {
      const prev = game.world.getBlock(op.x, op.y, op.z);
      b.applyOp(i, v);
      const p = { x: op.x + 0.5, y: op.y + 0.5, z: op.z + 0.5 };
      if (op.kind === CLEAR) {
        game.particles?.blockBreak(op.x, op.y, op.z, prev);
        if (BLOCKS[prev]?.solid) game.audio?.play(LOG_BLOCKS.has(prev) ? 'dig_wood' : 'dig_stone', { pos: p, volume: 0.5 });
        // leftovers: wood from cleared trees goes to stock
        if (LOG_BLOCKS.has(prev)) game.state.add('wood', 1);
      } else {
        beat++;
        game.audio?.play(beat % 2 ? 'hammer' : 'place_block', { pos: p, volume: 0.55, pitch: 0.9 + rnd() * 0.2 });
        game.particles?.emit({ pos: p, box: 0.45, count: 5, colors: [0xcbb89a, 0xa8957a, 0xe2d6c0], speed: 1.2, dir: { x: 0, y: 0.6, z: 0 }, gravity: 2, life: 0.8, size: 0.2, alpha: 0.6, drag: 0.4 });
        if (op.id && BLOCKS[op.id]?.shape === 'cube') game.particles?.blockHit(op.x, op.y, op.z, op.id, p);
      }
    }
    v.model.lookPitch = 0;
    v.release(rel);
  }
}

// ---------------------------------------------------------------- woodcutter
function* woodcutterBrain(v) {
  const vil = v.village, game = v.game;
  while (true) {
    const base = (v.workplace && v.workplace.isComplete) ? v.workplace : vil.townHall;
    if (!base) { yield* idleStep(v); continue; }
    if (v.workplace && !v.workplace.isComplete && v.workplace.state !== 'destroyed' && !vil.townHall) { yield* waitForWorkplace(v); continue; }
    if (v.carryTotal >= 6) { yield* deposit(v); continue; }
    // plant a sapling from time to time
    const sap = vil.takeReplantSpot(base, v);
    if (sap) {
      v.task = 'Идёт сажать дерево';
      const rel = v.onRelease(() => { sap.taken = false; });
      const ok = yield* v.walkTo({ x: sap.x + 0.5, y: sap.y, z: sap.z + 0.5 }, 1.5, { maxTime: 25 });
      if (ok) {
        v.task = 'Сажает дерево';
        v.face({ x: sap.x + 0.5, z: sap.z + 0.5 });
        yield* v.work('hoe', 1.6);
        vil.plantSapling(sap);
      }
      v.release(rel);
      continue;
    }
    v.task = 'Ищет дерево';
    const tree = vil.findTree(base.center, 34, v);
    if (!tree) {
      if (v.carryTotal > 0) { yield* deposit(v); continue; }
      yield* idleStep(v, 'Нет деревьев поблизости', 6);
      yield* v.wait(3);
      continue;
    }
    const key = tree.x + ',' + tree.z;
    vil.treeReserved.add(key);
    const rel = v.onRelease(() => vil.treeReserved.delete(key));
    v.task = 'Идёт к дереву';
    const ok = yield* v.walkTo({ x: tree.x + 0.5, y: tree.y, z: tree.z + 0.5 }, 1.7, { maxTime: 40 });
    if (!ok || game.world.getBlock(tree.x, tree.y, tree.z) !== tree.id) { v.release(rel); tree.bad = true; continue; }
    v.task = 'Рубит ' + (TREE_NAMES[tree.id] || 'дерево');
    v.face({ x: tree.x + 0.5, z: tree.z + 0.5 });
    const hitP = { x: tree.x + 0.5, y: tree.y + 0.8, z: tree.z + 0.5 };
    yield* v.work('chop', 3.3 / v.workSpeed, 0.55, () => {
      game.audio?.play('chop', { pos: hitP, volume: 0.6, pitch: 0.9 + rnd() * 0.2 });
      game.particles?.blockHit(tree.x, tree.y, tree.z, tree.id, hitP);
    });
    if (game.world.getBlock(tree.x, tree.y, tree.z) !== tree.id) { v.release(rel); continue; }
    v.task = 'Валит ' + (TREE_NAMES[tree.id] || 'дерево');
    const logs = yield* fellTree(v, tree);
    v.addCarry('wood', logs * 2);
    vil.onTreeFelled(tree);
    v.release(rel);
  }
}

function* fellTree(v, tree) {
  const w = v.game.world, vil = v.village, game = v.game;
  const logs = vil.collectTree(tree);
  let n = 0;
  game.audio?.play('break_block', { pos: tree, volume: 0.8, pitch: 0.7 });
  for (const c of logs.logs) {
    if (w.getBlock(c.x, c.y, c.z) !== c.id) continue;
    vil.editBlock(c.x, c.y, c.z, B.AIR);
    game.particles?.blockBreak(c.x, c.y, c.z, c.id);
    game.audio?.play('dig_wood', { pos: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }, volume: 0.4 });
    n++;
    yield* v.wait(0.14);
  }
  let k = 0;
  for (const c of logs.leaves) {
    if (w.getBlock(c.x, c.y, c.z) !== c.id) continue;
    vil.editBlock(c.x, c.y, c.z, B.AIR);
    if (k % 4 === 0) game.particles?.emit({ pos: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }, box: 0.5, count: 4, colors: game.particles.tileColors(BLOCKS[c.id].tiles.side), speed: 1, gravity: 3, life: 1.2, size: 0.14, drag: 0.5 });
    if (++k % 6 === 0) yield;
  }
  return n;
}

// ---------------------------------------------------------------- farmer
function* farmerBrain(v) {
  const vil = v.village, game = v.game, w = game.world;
  while (true) {
    const farm = v.workplace;
    if (!farm || farm.type !== 'farm' || !farm.isComplete) { if (v.carryTotal > 0) yield* deposit(v); yield* waitForWorkplace(v, 'Ждёт ферму'); continue; }
    if (v.carryTotal >= 8) { yield* deposit(v); continue; }
    // choose a plot: ripe → harvest, bare soil → till, empty farmland → sow
    let best = null, bestScore = Infinity, kind = null;
    for (const p of farm.plots) {
      const key = p.x + ',' + p.z;
      if (vil.plotReserved.has(key)) continue;
      const g = w.getBlock(p.x, p.y, p.z), a = w.getBlock(p.x, p.y + 1, p.z);
      let k = null, pri = 0;
      if (g === B.FARMLAND && a === B.WHEAT_3) { k = 'harvest'; pri = 0; }
      else if ((g === B.DIRT || g === B.GRASS) && (a === B.AIR || !BLOCKS[a].solid)) { k = 'till'; pri = 6; }
      else if (g === B.FARMLAND && (a === B.AIR || a === B.TALL_GRASS)) { k = 'sow'; pri = 3; }
      if (!k) continue;
      const s = Math.hypot(p.x + 0.5 - v.position.x, p.z + 0.5 - v.position.z) + pri;
      if (s < bestScore) { bestScore = s; best = p; kind = k; }
    }
    if (!best) {
      if (v.carryTotal > 0) { yield* deposit(v); continue; }
      // tend the crops
      const p = pick(farm.plots);
      v.task = 'Ухаживает за посевами';
      yield* v.walkTo({ x: p.x + 0.5, y: p.y + 1, z: p.z + 0.5 }, 1.2, { maxTime: 15 });
      v.face({ x: p.x + 0.5, z: p.z + 0.5 });
      yield* v.work('hoe', 2.5, 0.6);
      const a = w.getBlock(p.x, p.y + 1, p.z);
      if (a >= B.WHEAT_0 && a < B.WHEAT_3 && rnd() < 0.35) vil.editBlock(p.x, p.y + 1, p.z, a + 1);
      yield* v.wait(0.5 + rnd());
      continue;
    }
    const key = best.x + ',' + best.z;
    vil.plotReserved.add(key);
    const rel = v.onRelease(() => vil.plotReserved.delete(key));
    v.task = kind === 'harvest' ? 'Идёт собирать урожай' : kind === 'till' ? 'Идёт пахать' : 'Идёт сеять';
    yield* v.walkTo({ x: best.x + 0.5, y: best.y + 1, z: best.z + 0.5 }, 1.3, { maxTime: 20 });
    v.face({ x: best.x + 0.5, z: best.z + 0.5 });
    const P = { x: best.x + 0.5, y: best.y + 1.2, z: best.z + 0.5 };
    if (kind === 'harvest') {
      v.task = 'Собирает урожай';
      yield* v.work('harvest', 1.2 / v.workSpeed, 0.6, () => game.audio?.play('harvest', { pos: P, volume: 0.5 }));
      if (w.getBlock(best.x, best.y + 1, best.z) === B.WHEAT_3) {
        vil.editBlock(best.x, best.y + 1, best.z, B.AIR);
        game.particles?.emit({ pos: P, box: 0.4, count: 8, colors: [0xe8c860, 0xd0a840, 0xf0e090], speed: 1.5, dir: { x: 0, y: 2, z: 0 }, gravity: 8, life: 0.7, size: 0.12 });
        const yieldAmt = 2 * (game.state.researchDone.has('agriculture') ? 1.5 : 1);
        v.addCarry('food', yieldAmt);
        v.task = 'Сеет пшеницу';
        yield* v.work('hoe', 0.7);
        if (w.getBlock(best.x, best.y + 1, best.z) === B.AIR) vil.editBlock(best.x, best.y + 1, best.z, B.WHEAT_0);
      }
    } else if (kind === 'till') {
      v.task = 'Пашет землю';
      yield* v.work('hoe', 1.8 / v.workSpeed, 0.6, () => { game.audio?.play('dig_dirt', { pos: P, volume: 0.4 }); game.particles?.blockHit(best.x, best.y, best.z, B.DIRT, P); });
      const a = w.getBlock(best.x, best.y + 1, best.z);
      if (a !== B.AIR && !BLOCKS[a].solid) vil.editBlock(best.x, best.y + 1, best.z, B.AIR);
      vil.editBlock(best.x, best.y, best.z, B.FARMLAND);
    } else {
      v.task = 'Сеет пшеницу';
      yield* v.work('hoe', 1.0 / v.workSpeed, 0.5);
      const a = w.getBlock(best.x, best.y + 1, best.z);
      if (w.getBlock(best.x, best.y, best.z) === B.FARMLAND && (a === B.AIR || a === B.TALL_GRASS)) vil.editBlock(best.x, best.y + 1, best.z, B.WHEAT_0);
    }
    v.release(rel);
  }
}

// ---------------------------------------------------------------- miner
function* minerBrain(v) {
  const vil = v.village, game = v.game, w = game.world;
  while (true) {
    const mine = v.workplace;
    if (!mine || mine.type !== 'mine' || !mine.isComplete) { if (v.carryTotal > 0) yield* deposit(v); yield* waitForWorkplace(v, 'Ждёт шахту'); continue; }
    if (v.carryTotal >= 8) { yield* deposit(v); continue; }
    const t = vil.nextQuarryBlock(mine);
    if (t && t.torch) {
      v.task = 'Ставит факел';
      yield* v.walkTo({ x: t.x + 0.5, y: t.y, z: t.z + 0.5 }, 1.8, { maxTime: 20 });
      yield* v.work('hammer', 0.6);
      if (w.getBlock(t.x, t.y, t.z) === B.AIR) vil.editBlock(t.x, t.y, t.z, B.TORCH);
      continue;
    }
    if (!t) {
      // quarry finished: work the deepest face
      const deep = vil.quarryBottom(mine);
      v.task = 'Добывает камень в глубине карьера';
      yield* v.walkTo(deep, 1.5, { maxTime: 30 });
      v.face({ x: deep.x + 1, z: deep.z + 1 });
      yield* v.work('mine', 4.5 / v.workSpeed, 0.5, () => game.audio?.play('pick_hit', { pos: deep, volume: 0.5 }));
      v.addCarry('stone', 1);
      const r = rnd();
      const lucky = game.state.researchDone.has('mining') ? 1.5 : 1;
      if (r < 0.22 * lucky) v.addCarry('coal', 1); else if (r < 0.36 * lucky) v.addCarry('iron_ore', 1); else if (r < 0.40 * lucky) v.addCarry('gold_ore', 1); else if (r < 0.42 * lucky) v.addCarry('crystal', 1);
      continue;
    }
    const key = t.x + ',' + t.y + ',' + t.z;
    vil.quarryReserved.add(key);
    const rel = v.onRelease(() => vil.quarryReserved.delete(key));
    v.task = 'Копает карьер';
    yield* v.walkTo({ x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 }, 2.2, { maxTime: 30, dyMax: 2.5 });
    const id = w.getBlock(t.x, t.y, t.z);
    if (!BLOCKS[id].solid || id === B.BEDROCK) { v.release(rel); continue; }
    v.task = ORE_TASK[id] || (id === B.STONE || id === B.COBBLESTONE ? 'Добывает камень' : 'Копает карьер');
    v.face({ x: t.x + 0.5, z: t.z + 0.5 });
    const P = { x: t.x + 0.5, y: t.y + 0.9, z: t.z + 0.5 };
    const smith = game.state.researchDone.has('smithing') ? 1.4 : 1;
    const dur = Math.min(5, 0.6 + BLOCKS[id].hardness * 0.55) / (v.workSpeed * smith);
    yield* v.work('mine', dur, 0.5, () => { game.audio?.play(BLOCKS[id].tool === 'pick' ? 'pick_hit' : 'dig_dirt', { pos: P, volume: 0.5 }); game.particles?.blockHit(t.x, t.y, t.z, id, P); });
    if (w.getBlock(t.x, t.y, t.z) === id) {
      vil.editBlock(t.x, t.y, t.z, B.AIR);
      game.particles?.blockBreak(t.x, t.y, t.z, id);
      game.audio?.play('break_block', { pos: P, volume: 0.5 });
      const drop = BLOCKS[id].drop || {};
      for (const k in drop) if (drop[k] > 0) v.addCarry(k, drop[k]);
      if (id === B.STONE) { const r = rnd(), lucky = game.state.researchDone.has('mining') ? 1.5 : 1; if (r < 0.08 * lucky) v.addCarry('coal', 1); else if (r < 0.13 * lucky) v.addCarry('iron_ore', 1); }
    }
    v.release(rel);
  }
}

// ---------------------------------------------------------------- blacksmith
function* blacksmithBrain(v) {
  const vil = v.village, game = v.game, st = game.state;
  let cycle = 0;
  while (true) {
    const f = v.workplace;
    if (!f || f.type !== 'forge' || !f.isComplete) { yield* waitForWorkplace(v, 'Ждёт кузницу'); continue; }
    const spot = (f.points.work && f.points.work[0]) || f.door;
    yield* v.walkTo(spot, 0.8, { maxTime: 30 });
    const anvil = vil.findBlockNear(spot, B.IRON_BLOCK, 2) || f.center;
    v.face({ x: anvil.x + 0.5, z: anvil.z + 0.5 });
    const has = (st.resources.iron || 0) >= 2 && (st.resources.coal || 0) >= 1;
    const A = { x: anvil.x + 0.5, y: anvil.y + 1.05, z: anvil.z + 0.5 };
    const oreKind = (st.resources.coal || 0) >= 1 ? ((st.resources.iron_ore || 0) >= 2 ? 'iron' : (st.resources.gold_ore || 0) >= 2 ? 'gold' : null) : null;
    if (oreKind) {
      // smelt raw ore in the forge furnace first
      const furnace = vil.findBlockNear(spot, B.FURNACE, 4) || anvil;
      v.face({ x: furnace.x + 0.5, z: furnace.z + 0.5 });
      v.task = oreKind === 'iron' ? 'Плавит железную руду' : 'Плавит золотую руду';
      const F = { x: furnace.x + 0.5, y: furnace.y + 1, z: furnace.z + 0.5 };
      yield* v.work('hammer', 6 / v.workSpeed, 0.9, () => game.particles?.emit({ pos: F, count: 5, colors: [0xff6a10, 0xffb040, 0x5a5a5a], additive: true, speed: 1.2, dir: { x: 0, y: 2, z: 0 }, gravity: -1, life: 0.8, size: 0.14 }));
      if (st.spend({ [oreKind + '_ore']: 2, coal: 1 })) st.add(oreKind, 2);
      continue;
    }
    if (has && vil.armory.level < 5) {
      v.task = pick(['Куёт оружие', 'Куёт доспехи для стражи', 'Раздувает горн']);
      yield* v.work('hammer', 8 / v.workSpeed, 0.45, () => {
        game.audio?.play('hammer', { pos: A, volume: 0.6, pitch: 1.1 + rnd() * 0.2 });
        game.particles?.emit({ pos: A, count: 6, colors: [0xffd060, 0xff8a20, 0xffffa0], additive: true, speed: 3, dir: { x: 0, y: 2, z: 0 }, gravity: 10, life: 0.5, size: 0.08 });
      });
      if (st.spend({ iron: 2, coal: 1 })) {
        cycle++;
        vil.armory.progress++;
        if (vil.armory.progress >= 3 + vil.armory.level) {
          vil.armory.progress = 0; vil.armory.level++;
          vil.toast(`Кузнец ${v.name} улучшил снаряжение стражи (уровень ${vil.armory.level})`, 'good');
          for (const g of vil.villagers) if (g.job === 'guard') g.updateTool();
        }
        if (cycle % 3 === 0) st.add('gold', 1);
      }
    } else if (has) {
      v.task = 'Куёт монеты';
      yield* v.work('hammer', 8, 0.45, () => game.audio?.play('hammer', { pos: A, volume: 0.5 }));
      if (st.spend({ iron: 2, coal: 1 })) st.add('gold', 1);
    } else {
      v.task = 'Ждёт железо и уголь';
      yield* v.work('hammer', 3, 1.2, () => game.audio?.play('hammer', { pos: A, volume: 0.3, pitch: 0.8 }));
      yield* v.wait(3);
    }
  }
}

// ---------------------------------------------------------------- researcher
function* researcherBrain(v) {
  const vil = v.village, game = v.game;
  while (true) {
    const lab = v.workplace;
    if (!lab || lab.type !== 'laboratory' || !lab.isComplete) { yield* waitForWorkplace(v, 'Ждёт лабораторию'); continue; }
    const spots = lab.points.work || [lab.door];
    const spot = pick(spots);
    yield* v.walkTo(spot, 0.7, { maxTime: 30 });
    const table = vil.findBlockNear(spot, B.ARCANE_TABLE, 2);
    const shelf = vil.findBlockNear(spot, B.BOOKSHELF, 2);
    const target = (rnd() < 0.65 && table) ? table : (shelf || table || lab.center);
    v.face({ x: target.x + 0.5, z: target.z + 0.5 });
    const T = { x: target.x + 0.5, y: target.y + 1.1, z: target.z + 0.5 };
    const atTable = target === table;
    v.task = atTable ? pick(['Колдует над магическим столом', 'Проводит опыт']) : 'Изучает свитки';
    let acc = 0;
    yield* v.work(atTable ? 'cast' : 'harvest', 7, 0.5, () => {
      acc += 0.5;
      if (atTable) game.particles?.emit({ pos: T, box: 0.3, count: 3, colors: [0xb070ff, 0x70c0ff, 0xffffff], additive: true, speed: 0.6, dir: { x: 0, y: 1.2, z: 0 }, gravity: -0.5, life: 1, size: 0.12 });
      if (acc >= 2.5) {
        acc = 0;
        const pts = (atTable ? 1.2 : 1) * v.workSpeed;
        try { game.research?.addPoints?.(pts); } catch (e) { /* research module not ready */ }
        vil.researchPoints += pts;
      }
    });
    yield* v.wait(0.5 + rnd());
  }
}

// ---------------------------------------------------------------- guard (barracks: melee patrol, watchtower: archer)
function* guardBrain(v) {
  const vil = v.village, game = v.game;
  v.updateTool();
  while (true) {
    const wp = v.workplace;
    if (!wp || !wp.isComplete) { yield* waitForWorkplace(v, 'Ждёт казарму'); continue; }
    if (wp.type === 'watchtower') { yield* towerPost(v, 'archer'); continue; }
    // badly hurt: fall back to the town hall (archers cover it) and patch up before fighting again
    if (v.hp < v.maxHp * 0.35 && vil.townHall) {
      v.task = 'Отступает к ратуше лечиться';
      const d = vil.townHall.door;
      const walk = v.walkTo(d, 1.5, { maxTime: 20, speed: v.walkSpeed * 1.2 });
      let r; while (!(r = walk.next(yield)).done) { /* keep walking */ }
      v.stopMove();
      while (v.hp < v.maxHp * 0.8 && !v.dead) yield* v.wait(1);
      continue;
    }
    const z = vil.guardTarget(v);
    if (z) { yield* meleeFight(v, z); continue; }
    // patrol
    const night = game.state.isNight;
    v.task = night ? 'Стоит на страже' : 'Патрулирует';
    const p = night ? vil.guardPost(v) : vil.patrolPoint(v);
    if (p) {
      const walk = v.walkTo(p, 1.5, { maxTime: 25, teleport: false, speed: v.walkSpeed * 0.9 });
      let r;
      while (!(r = walk.next(yield)).done) { if (vil.guardTarget(v)) break; }
      v.stopMove();
    }
    // look around
    for (let i = 0; i < 6; i++) { if (vil.guardTarget(v)) break; v.turnTo(v.yaw + (rnd() - 0.5) * 2, 1); yield* v.wait(0.5); }
  }
}

function* meleeFight(v, z) {
  const game = v.game, vil = v.village;
  v.task = 'Сражается с зомби';
  let repath = 0, cd = 0, req = null, path = null, pi = 0;
  const leash = vil.radius + 22;
  while (!z.dead) {
    const dt = yield;
    if (z.dead) break;
    if (v.hp < v.maxHp * 0.3) break;   // retreat (guardBrain handles healing)
    cd -= dt; repath -= dt;
    const d = Math.hypot(z.position.x - v.position.x, z.position.z - v.position.z);
    if (vil.townHall && vil.townHall.distanceTo(v.position) > leash) break;
    if (d > 26) break;
    if (d < 1.9 && Math.abs(z.position.y - v.position.y) < 2) {
      v.stopMove();
      v.face(z.position);
      if (cd <= 0) {
        cd = 0.85;
        v.model.play('attack');
        game.audio?.play('swing', { pos: v.position, volume: 0.5 });
        const smith = game.state.researchDone.has('smithing');
        const dmg = (smith ? 13 : 8) + vil.armory.level * 2;
        const dir = new THREE.Vector3(z.position.x - v.position.x, 0, z.position.z - v.position.z).normalize();
        let done = false;
        try { if (game.combat?.meleeHit) { game.combat.meleeHit(v, z, dmg, { knockback: dir.multiplyScalar(4), item: smith ? 'sword_iron' : 'sword_wood' }); done = true; } } catch (e) { done = false; }
        if (!done) z.damage(dmg, v, { kind: 'phys', knockback: dir.multiplyScalar(4) });
      }
      continue;
    }
    // chase: direct if close, else path
    if (d < 5 && game.world.lineOfSight(v.eye, z.center)) { v.steerTo(z.position.x, z.position.z, 4, true); continue; }
    if (repath <= 0 && !req) { req = vil.requestPath(v, z.position, 1); repath = 1.0; }
    if (req && req.done) { path = req.path; pi = 1; req = null; }
    if (path && pi < path.length) {
      const wpt = path[pi];
      if (Math.hypot(wpt.x + 0.5 - v.position.x, wpt.z + 0.5 - v.position.z) < 0.5) pi++;
      else v.steerTo(wpt.x + 0.5, wpt.z + 0.5, 3.8, wpt.y > v.position.y + 0.4);
    } else v.steerTo(z.position.x, z.position.z, 3.8, true);
  }
  v.stopMove();
}

/** Watchtower archer / mage tower mage: climb up and shoot from the post. */
function* towerPost(v, role) {
  const game = v.game, vil = v.village;
  const b = v.workplace;
  const post = b.points.post && b.points.post[0];
  if (!post) { yield* v.wait(1); return; }
  if (!v.onPost) {
    v.task = role === 'mage' ? 'Поднимается на башню' : 'Поднимается на вышку';
    yield* v.walkTo(b.door, 1.5, { maxTime: 40 });
    // climb (ladder-less: animated ascent)
    v._climbing = true;
    const from = v.position.clone();
    const to = new THREE.Vector3(post.x, post.y, post.z);
    let t = 0;
    const T = 1.2 + (post.y - from.y) * 0.12;
    v.model.play('walk');
    while (t < 1) {
      const dt = yield;
      t = Math.min(1, t + dt / T);
      const e = t;
      v.position.set(from.x + (to.x - from.x) * Math.min(1, e * 3), from.y + (to.y - from.y) * e, from.z + (to.z - from.z) * Math.min(1, e * 3));
      v.velocity.set(0, 0, 0);
    }
    v.model.play('none');
    v._climbing = false;
    v.onPost = true;
    v._postBuilding = b;
    v.onRelease(() => { v.descend(); });
  }
  let cd = 0.5;
  while (v.workplace === b && b.isComplete) {
    const dt = yield;
    cd -= dt;
    // stay on the platform
    if (Math.hypot(v.position.x - post.x, v.position.z - post.z) > 0.6) v.steerTo(post.x, post.z, 1.5); else v.stopMove();
    const st = game.state;
    let range, cooldown, type, dmg, extra = {};
    if (role === 'mage') {
      range = 28; cooldown = 2.4;
      const frost = st.researchDone.has('frost_magic') && (v._castN || 0) % 2 === 1;
      type = frost ? 'ice_shard' : 'fireball'; dmg = frost ? 9 : 14;
      extra = frost ? { slow: 2.5, element: 'frost' } : { splash: 2.5, burn: 3, element: 'fire' };
    } else {
      const gun = st.researchDone.has('gunpowder');
      const bal = st.researchDone.has('ballistics') ? 1.5 : 1;
      range = (gun ? 30 : 24) * bal; cooldown = gun ? 3 : 1.5;
      type = gun ? 'bullet' : 'arrow'; dmg = (gun ? 30 : 8) * bal; extra = {};
    }
    const z = vil.nearestZombie(v.eye, range, true);
    if (!z) { v.task = role === 'mage' ? 'Следит за округой с башни' : 'На посту'; v.model.setLoop(null); continue; }
    v.face(z.position);
    v.task = role === 'mage' ? (type === 'fireball' ? 'Колдует огненный шар' : 'Колдует ледяную стрелу') : (type === 'bullet' ? 'Стреляет из мушкета' : 'Стреляет из лука');
    if (role !== 'mage') v.model.setLoop('aim');
    if (cd <= 0) {
      cd = cooldown;
      if (role === 'mage') { v._castN = (v._castN || 0) + 1; v.model.play('cast'); }
      else v.model.play('shoot');
      vil.shoot(v, z, type, dmg, extra);
    }
  }
  v.model.setLoop(null);
}

function* mageBrain(v) {
  v.updateTool();
  while (true) {
    const b = v.workplace;
    if (!b || b.type !== 'mage_tower' || !b.isComplete) { yield* waitForWorkplace(v, 'Ждёт башню мага'); continue; }
    yield* towerPost(v, 'mage');
  }
}

const BRAINS = {
  idle: idleBrain, builder: builderBrain, woodcutter: woodcutterBrain, farmer: farmerBrain, miner: minerBrain,
  blacksmith: blacksmithBrain, researcher: researcherBrain, guard: guardBrain, mage: mageBrain,
};
