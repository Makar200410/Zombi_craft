# Zombi Craft — architecture & module contracts

Browser 3D game (Three.js r186 + Vite, plain ES modules, no TypeScript). Runs on desktop and phones.
Genre mix: Minecraft-style voxel sandbox + Clash-of-Clans village building + Millénaire-style living
villagers you assign to jobs + weapons & magic + research lab + nightly zombie waves.
**All player-facing text is in Russian.** Code/comments in English.

## Coordinates & world
- Y is up. Block `(x,y,z)` (integers) occupies `[x,x+1)×[y,y+1)×[z,z+1)`. Entity `position` = feet center.
- Finite world: `world.size` × `world.size` blocks in X/Z (default 192), `HEIGHT = 64` in Y. `SEA_LEVEL = 20`.
- Village center (town hall) is near the middle `(size/2, size/2)`. Zombies arrive from map edges.

## Game object (`src/core/Game.js`) — the hub every system receives
```
game.world        World            (src/world/World.js)
game.renderer     Renderer         scene, camera, sky, day/night (src/render/Renderer.js)
game.scene        THREE.Scene      shortcut
game.camera       THREE.PerspectiveCamera (single camera; the player camera rig moves it)
game.state        GameState        resources, time, research, stats (src/core/state.js)
game.bus          EventBus         on/off/emit/once (src/core/events.js)
game.entities     EntityManager    (src/entities/EntityManager.js)
game.particles    Particles        emit(...) (src/render/particles.js)
game.atlas        {texture, uv(tileName)->[u0,v0,u1,v1], canvas, tileSize}   (src/art/textures.js)
game.audio        Audio            play(name, {pos, volume, pitch}) (src/audio/sfx.js)
game.input        Input            keyboard/pointer/touch state + tap dispatch (src/player/Input.js)
game.player       Player           (src/player/Player.js)
game.combat       Combat           (src/combat/Combat.js)
game.village      Village          (src/village/Village.js)
game.waves        WaveDirector     (src/enemies/WaveDirector.js)
game.research     Research         (src/systems/research.js)
game.ui           UI               (src/ui/UI.js)
game.save         SaveSystem       (src/systems/save.js)
game.mode         'explore' | 'command'     (setMode(m) emits 'mode:changed')
game.paused       bool
game.quality      'low' | 'medium' | 'high'  (auto: phones → low/medium)
game.isTouch      bool
game.time         seconds since start (real, unpaused)
game.pickScreen(clientX, clientY) -> { hit: raycastHit|null, entity: Entity|null, point: THREE.Vector3|null }
```
### Lifecycle
1. `game.init()` — builds atlas, renderer, all systems (constructors), then calls `init()` on each system (subscribe to bus here).
2. `game.setup({seed})` — generates the world + meshes it (menu shows an orbiting camera over it). Emits `world:ready`. `game.world` is replaced on every setup, so always read `game.world` lazily.
3. `game.begin()` — new game: calls `onNewGame()` on village, player, waves, research, combat, cameraRig, ui; sets `game.running = true`.
   Load: SaveSystem calls `setup({seed})`, re-applies `world.changes`, calls `deserialize()` on systems, then `begin({loaded:true})`.
- Systems expose optional `serialize()` / `deserialize(obj)`; `world.changes: Map<index,id>` holds all block edits since generation.
- URL params: `?autostart` skips the menu (for testing), `?debug` also autostarts.
- `window.game` is exposed for debugging / Playwright tests.

Loop order each frame (dt clamped to 0.05): input → player → combat → village → waves → entities → particles → research → ui → renderer. Every system has `update(dt)`; many also have `init()` called once after all systems are constructed.

## Events (`game.bus.emit(name, payload)`) — canonical names
| event | payload |
|---|---|
| `resources:changed` | `{resources}` |
| `block:changed` | `{x,y,z,id,prev}` |
| `block:broken` | `{x,y,z,id,by}` (`by` = entity or 'player') |
| `mode:changed` | `{mode}` |
| `time:dawn` / `time:dusk` | `{day}` |
| `wave:start` / `wave:end` | `{wave, count}` |
| `building:placed` / `building:completed` / `building:destroyed` / `building:damaged` | `{building}` |
| `villager:spawned` / `villager:died` / `villager:job` | `{villager}` |
| `zombie:killed` | `{zombie, by}` |
| `player:damaged` / `player:died` / `player:respawn` | `{amount, source}` |
| `research:started` / `research:done` | `{id}` |
| `item:unlocked` | `{id}` |
| `toast` | `{text, kind: 'info'|'good'|'bad'|'wave'}` — UI shows a notification |
| `game:over` | `{reason}` |
| `hotbar:select` | `{index, itemId}` |
| `select:entity` / `select:building` / `select:clear` | `{entity}` / `{building}` |

## Core data
- `src/core/blocks.js`: `BLOCKS[id]`, `B.NAME` ids, `TILE_NAMES`, `PALETTE`, helpers. Block drops go to the **shared village stockpile** (`state.add`). Placing costs `block.cost`.
- `src/core/items.js`: `ITEMS`, `DEFAULT_HOTBAR`, `RESOURCES`, `RESOURCE_LABELS`.
- `src/core/state.js` GameState:
  - `resources` `{wood, stone, food, iron, coal, gold, crystal}`; `add(res, n)`, `canAfford(cost)`, `spend(cost)->bool`, `refund(cost)`
  - `day` (1-based), `timeOfDay` 0..1 (0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset), `isNight`
  - `dayLength` seconds (default 300; night is ~35% of it)
  - `researchDone: Set<string>`, `unlockedItems: Set<string>`
  - `stats {kills, wavesSurvived, blocksMined, blocksPlaced}`
  - `serialize()/deserialize(obj)`

## World API (`src/world/World.js`)
```
world.size, world.height, world.seed
getBlock(x,y,z) -> id        (outside → AIR; y<0 → BEDROCK)
setBlock(x,y,z,id, opts?)    emits block:changed, remeshes, updates lighting/heightmap
isSolid(x,y,z)
surfaceY(x,z) -> y of the highest solid block (stand position = surfaceY+1)
isWalkable(x,y,z)            feet cell & head cell free, block below solid
hitBlock(x,y,z, dmg, by) -> {broken, id, progress 0..1}   (accumulating damage; decays after 3s)
breakBlock(x,y,z, by) -> id  (adds drops to stockpile if by is player/villager, emits block:broken)
raycast(origin: Vector3, dir: Vector3(normalized), maxDist, opts?) -> {x,y,z,id, nx,ny,nz, px,py,pz, dist, point} | null
    (px,py,pz = adjacent cell for placing; opts.includeWater)
findPath(from:{x,y,z}, to:{x,y,z}, opts?) -> [{x,y,z}...] | null  (A* over walkable cells; opts.maxNodes, opts.range = accept goal within range)
getBlockDamage(x,y,z) -> 0..1
```
Physics helper: `src/world/physics.js` `moveEntity(world, entity, dt)` — AABB (radius, height) vs voxels, gravity, `entity.onGround`, step-up 0.6 for NPCs when `entity.autoStep`, water drag `entity.inWater`.

## Entities (`src/entities/`)
Base class `Entity` (`src/entities/Entity.js`):
```
id, kind ('player'|'villager'|'zombie'|'projectile'|...), faction ('village'|'undead'),
position: Vector3 (feet), velocity: Vector3, yaw, radius, height, hp, maxHp, dead, onGround,
object3d: THREE.Object3D (added to scene by EntityManager.add), slowTimer, burnTimer
update(dt) ; damage(amount, source, {kind, knockback: Vector3}) -> bool died ; heal(n) ; onDeath(source)
```
`EntityManager`: `add(e)`, `remove(e)`, `list`, `byKind(kind)`, `query(pos, radius, filter)`, `nearest(pos, filter, maxDist)`. It calls `e.update(dt)` for every live entity, removes dead ones after `e.removeAt` time.

`HumanoidModel` (`src/entities/HumanoidModel.js`): blocky Minecraft-proportion rig (head 8px, body 8×12×4, arms/legs 4×12×4; 1px = 1/16 block, total 2 blocks → scaled to entity height).
Skin = 64×64 canvas in the **standard Minecraft skin layout** (classic 4px arms), produced by `src/art/skins.js`.
```
new HumanoidModel({ skin: canvas, scale, hat?: 'straw'|'helmet'|'wizard'|'hood'|'crown'|null })
new HumanoidModel({ skin, height = 1.8, hat, hatColor, zombie: bool (arms forward), width: body width multiplier (brutes) })
model.group (Object3D — add to entity.object3d) ; model.setHeld(itemId|null)
model.play(name): one-shot actions 'attack'|'chop'|'mine'|'hoe'|'cast'|'shoot'|'hurt'|'hammer'|'harvest'; 'die' (falls, stays);
                  forced locomotion 'idle'|'walk'|'run'|'sit'; 'none' clears forced locomotion
model.setLoop('chop'|'mine'|'hoe'|'hammer'|'harvest'|'carry'|'aim'|null) — repeat a work animation / hold a pose
model.update(dt, horizontalSpeed) — walk/run cycle derived from speed ; model.lookPitch ; model.flash(color) ; model.dispose()
Entity.syncObject() automatically feeds world light into the model (dark in caves, warm near torches).
```
Held items: `src/entities/itemMesh.js` `makeItemMesh(itemIdOrSprite) -> Mesh` (extruded pixel sprite, 1 unit wide, origin at sprite bottom-left).
Entity helpers: `entity.center`, `entity.eye` (shared vectors — clone if you keep them), `entity.physics(dt)` (gravity+collision), `entity.tickStatus(dt)` (burn/slow/stun timers), `entity.speedMul`, `damage()` emits `damage:number`.
`game.entities.raycast(origin, dir, maxDist, filter) -> {entity, dist}`.
Particles: `game.particles.emit({pos, count, color|colors, speed, spread, dir, life, size, gravity, additive, drag, alpha, box})`, `blockBreak(x,y,z,id)`, `blockHit(x,y,z,id,point)`, `tileColors(tileName)`.
Renderer: `game.renderer.shadowFocus` (Vector3 — set it to what the camera looks at), `worldToScreen(vec3)`, `setQuality(q)`.

## Art (`src/art/`)
- `textures.js`: `buildAtlas() -> {texture, canvas, uv(name), tileSize}`. Procedural pixel-art (32×32 per tile), drawn to canvas, with gutters to avoid mip bleeding. Must implement every name in `TILE_NAMES`.
- `skins.js`: `villagerSkin(job, seed) -> canvas 64×64`, `zombieSkin(type, seed)`, `playerSkin()`.
- `icons.js`: `getItemSprite(itemId) -> canvas 32×32` (transparent bg, used for UI icons and held-item meshes),
  `getResourceIcon(res) -> canvas`, `getBlockIcon(blockId) -> canvas` (isometric cube render of the block's tiles), `getBuildingIcon(type)`, `iconURL(canvas)` (cached dataURL).

## Village (`src/village/`)
- Building types (`src/village/buildings.js` exports `BUILDING_TYPES` (object keyed by id) and `BUILDING_ORDER` (array of ids for the build menu)): `town_hall`, `house`, `lumber_camp`, `farm`, `mine`, `storehouse`, `laboratory`, `forge`, `mage_tower`, `watchtower`, `barracks`, `wall` (palisade segment), `stone_wall`.
  Each: `{ id, name(ru), desc(ru), cost, research|null, size:[w,d], blueprint(rot) -> [{dx,dy,dz,id}], jobs: {job: slots}, popBonus, hp, category: 'economy'|'military'|'magic'|'defense', maxCount? }`.
- `Village`: `buildings[]`, `villagers[]`, `beginPlacement(typeId)`, `cancelPlacement()`, `placeBuilding(typeId, x, z, rot) -> building|null`, `buildingAt(x,y,z)`, `assign(villager, building|null)`, `popCap`, `townHall`, `nearestBuilding(pos, filter)`.
- `Building`: `id, type, x, y, z, rot, state ('planned'|'constructing'|'complete'|'destroyed'), progress, hp, maxHp, workers[], blocks[], damage(n, source)`.
- `Villager extends Entity` — jobs: `idle`, `builder`, `woodcutter`, `farmer`, `miner`, `blacksmith`, `researcher`, `guard`, `mage`. Visible behaviour: walks paths, chops real trees, mines real blocks, tills/plants/harvests farmland, carries goods to storage, builds blueprints block-by-block, flees/hides at night unless guard, guards fight zombies. Has `name` (Russian), `job`, `workplace`, `task` string (ru, shown in UI), `hunger`, `mood`.

## Enemies (`src/enemies/`)
- `Zombie extends Entity` with types: `walker`, `runner`, `brute`, `spitter` (ranged acid), `exploder`, `necromancer` (boss, raises walkers). Target priority: nearby player/villagers, else buildings/town hall. Break blocks in their way via `world.hitBlock`.
- `WaveDirector`: each dusk spawns wave `n` scaled by day, from map edges; `wave:start`/`wave:end`; also stragglers in darkness. `update(dt)`, `activeCount`, `currentWave`, `nextWaveIn` (seconds until dusk).

## Combat (`src/combat/`)
- `Combat`: `useItem(user, itemId, origin, dir)`, `meleeHit(...)`, `explode(pos, radius, dmg, source)`, `projectiles` (arrows, bolts, bullets, fireball, ice_shard, lightning, heal_nova, meteor, bomb, acid). Guards and zombies use the same API.
- Damage numbers & hit sparks via `game.particles` and `bus.emit('damage:number', {pos, amount, kind})` (UI draws).

## Player (`src/player/`)
- `Input`: keyboard/mouse (pointer lock in explore mode), touch (virtual joystick + look pad + buttons, drawn by `TouchControls.js`), `onTap(handler, priority)` — canvas taps (not drags) dispatched high→low priority until a handler returns true.
- `Player extends Entity`: first-person (default) / third-person (V), hotbar of items, mana, stamina, mine/place with raycast, respawn at town hall.
- `CameraRig`: explore (FP/TP) and **command mode** (Clash-of-Clans style top-down orbit camera: drag to pan, pinch/wheel zoom, rotate with two fingers / Q-E).

## UI (`src/ui/`) — DOM overlay, `#ui` root, Russian text, mobile-friendly
HUD (hp/mana, resources bar, day/time & wave timer, hotbar, crosshair, minimap), toasts, damage numbers, main menu (new game / continue / settings), pause, command-mode panels (build menu, villager list & job assignment, building inspector), research lab tree, game over.

## Research (`src/systems/research.js`)
Tree ids (use exactly these): `masonry`, `agriculture`, `mining`, `smithing`, `archery`, `mechanics`, `fortification`, `gunpowder`, `alchemy`, `arcana`, `frost_magic`, `storm_magic`, `restoration`, `crystal_forging`, `meteor`, `ballistics`.
Research points are generated by researchers working in a completed laboratory; each tech also costs resources.
`research.start(id)`, `research.current`, `research.progress`, `research.isDone(id)`, `research.available()`.
An item is usable when `ITEMS[id].research` is null or done (or `state.unlockedItems.has(id)`); a building type is buildable when its `research` is null or done.

| tech | prereqs | effect (who implements) |
|---|---|---|
| `agriculture` | – | farms +50% yield (village) |
| `masonry` | – | houses +2 pop, all buildings +50% max hp (village) |
| `mining` | – | unlocks `mine` building (village) |
| `archery` | – | `bow` item; `watchtower` building (archer guard) |
| `smithing` | mining | `forge` building; iron sword / iron pickaxe / battle axe; guards get iron swords (village) |
| `mechanics` | smithing | `crossbow`; builders +30% speed (village) |
| `fortification` | masonry | `stone_wall`, `barracks` buildings |
| `gunpowder` | mechanics, mining | musket, blunderbuss, powder bomb; watchtower guards shoot muskets (village) |
| `ballistics` | gunpowder, fortification | watchtowers +50% damage & range (village) |
| `alchemy` | – | +50% player mana regen (player); healing: villagers regen hp (village) |
| `arcana` | alchemy | `mage_tower` building, `staff_fire` |
| `frost_magic` | arcana | `staff_frost`; mage towers also slow zombies |
| `storm_magic` | arcana | `staff_storm` |
| `restoration` | arcana | `staff_life` |
| `crystal_forging` | smithing, arcana | `sword_crystal` |
| `meteor` | storm_magic, frost_magic | `tome_meteor` |

Building gates: `mine`→mining, `forge`→smithing, `watchtower`→archery, `stone_wall`/`barracks`→fortification, `mage_tower`→arcana; others free. `town_hall` is placed automatically at game start (one only).

## File ownership (agents must only edit their own files)
- core/engine (orchestrator): `index.html`, `src/main.js`, `src/core/*`, `src/world/*`, `src/render/*`, `src/entities/Entity.js`, `src/entities/EntityManager.js`, `src/entities/HumanoidModel.js`, `src/entities/itemMesh.js`
- art & audio: `src/art/*`, `src/audio/*`
- player & combat: `src/player/*`, `src/combat/*`
- village: `src/village/*`
- enemies: `src/enemies/*`
- ui, research, save: `src/ui/*`, `src/systems/*`, `src/styles/*`
