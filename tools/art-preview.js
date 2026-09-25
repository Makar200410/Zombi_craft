// Dev-only preview of the procedural art (atlas, skins, icons).
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const only = params.get('only');
function section(id, title) {
  const h = document.createElement('h2'); h.textContent = title; app.appendChild(h);
  const d = document.createElement('div'); d.className = 'sec'; d.id = id; app.appendChild(d); return d;
}
function scaled(src, s, cls = '') {
  const c = document.createElement('canvas'); c.width = src.width * s; c.height = src.height * s;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
  if (cls) c.className = cls; return c;
}
function labeled(parent, canvas, label) {
  const d = document.createElement('div'); d.className = 'item'; d.appendChild(canvas);
  const s = document.createElement('span'); s.textContent = label; d.appendChild(s); parent.appendChild(d);
}
function tiled(tile, n, s) {
  const c = document.createElement('canvas'); c.width = c.height = tile.width * n;
  const x = c.getContext('2d'); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) x.drawImage(tile, i * tile.width, j * tile.height);
  return scaled(c, s);
}
async function main() {
  const tex = await import('../src/art/textures.js');
  const { TILE_NAMES } = await import('../src/core/blocks.js');
  const t0 = performance.now();
  const atlas = tex.buildAtlas();
  const dt = performance.now() - t0;
  if (!only || only === 'atlas') {
    const a = section('atlas', `Atlas ${atlas.canvas.width}px built in ${dt.toFixed(0)}ms (x2)`);
    a.appendChild(scaled(atlas.canvas, 2, 'chk'));
  }
  if (!only || only === 'tiles') {
    const t = section('tiles', 'Tiles 3x3 (x2)');
    for (const n of TILE_NAMES) labeled(t, tiled(tex.getTileCanvas(n), 3, 2), n);
  }
  if (!only || only === 'big') {
    const sel = params.get('tiles') ? params.get('tiles').split(',') : TILE_NAMES;
    const sc = +(params.get('scale') || 4);
    const t = section('big', 'Tiles x' + sc);
    for (const n of sel) labeled(t, scaled(tex.getTileCanvas(n), sc, 'chk'), n);
    if (params.get('tiled')) for (const n of sel) labeled(t, tiled(tex.getTileCanvas(n), 2, sc / 2), n + ' 2x2');
  }
  try {
    const skins = await import(/* @vite-ignore */ ['..','src','art','skins.js'].join('/'));
    if (!only || only === 'skins') {
      const s = section('skins', 'Skins');
      const L = skins.SKIN_LAYOUT;
      const front = (sk) => { // flat front+back composite
        const c = document.createElement('canvas'); c.width = 40; c.height = 32; const x = c.getContext('2d');
        const f = (part, face, dx, dy) => { const [u, v, w, h] = L[part].faces[face]; x.drawImage(sk, u, v, w, h, dx, dy, w, h); };
        f('head', 'front', 4, 0); f('body', 'front', 4, 8); f('rightArm', 'front', 0, 8); f('leftArm', 'front', 12, 8); f('rightLeg', 'front', 4, 20); f('leftLeg', 'front', 8, 20);
        f('head', 'back', 24, 0); f('body', 'back', 24, 8); f('leftArm', 'back', 20, 8); f('rightArm', 'back', 32, 8); f('leftLeg', 'back', 24, 20); f('rightLeg', 'back', 28, 20);
        return c;
      };
      const list = [];
      for (const j of ['idle', 'builder', 'woodcutter', 'farmer', 'miner', 'blacksmith', 'researcher', 'guard', 'mage']) for (const sd of [1, 2]) list.push([j + ' ' + sd, skins.villagerSkin(j, sd)]);
      for (const z of ['walker', 'runner', 'brute', 'spitter', 'exploder', 'necromancer']) list.push([z, skins.zombieSkin(z, 3)]);
      list.push(['player', skins.playerSkin()]);
      for (const [n, sk] of list) labeled(s, scaled(front(sk), 5, 'sky'), n);
      const raw = section('skinsraw', 'Raw skins x3');
      for (const [n, sk] of list.slice(0, 6).concat(list.slice(-7))) labeled(raw, scaled(sk, 3, 'chk'), n);
    }
  } catch (e) { console.error(e); section('skinerr', 'skins error: ' + e.message); }
  try {
    const icons = await import(/* @vite-ignore */ ['..','src','art','icons.js'].join('/'));
    const { ITEMS, RESOURCES } = await import('../src/core/items.js');
    const { BLOCKS } = await import('../src/core/blocks.js');
    if (!only || only === 'icons') {
      const s = section('items', 'Item sprites x3');
      for (const id of Object.keys(ITEMS)) labeled(s, scaled(icons.getItemSprite(id), 3, 'chk'), id);
      const r = section('res', 'Resource icons x2');
      for (const id of [...RESOURCES, 'research', 'population', 'mana', 'health']) labeled(r, scaled(icons.getResourceIcon(id), 2, 'chk'), id);
      const b = section('blocks', 'Block icons x2');
      for (const bl of BLOCKS) if (bl && bl.id) labeled(b, scaled(icons.getBlockIcon(bl.id), 2, 'chk'), bl.name);
      const bu = section('buildings', 'Building icons x2');
      for (const id of ['town_hall', 'house', 'lumber_camp', 'farm', 'mine', 'storehouse', 'laboratory', 'forge', 'mage_tower', 'watchtower', 'barracks', 'wall', 'stone_wall', 'gate']) labeled(bu, scaled(icons.getBuildingIcon(id), 2, 'chk'), id);
      const u = icons.iconURL(icons.getItemSprite('bow'));
      const img = new Image(); img.src = u; labeled(bu, img, 'iconURL test');
    }
  } catch (e) { console.error(e); section('iconerr', 'icons error: ' + e.message); }
  document.body.dataset.done = '1';
}
main().catch((e) => { console.error(e); document.body.dataset.done = 'err'; app.textContent = 'ERROR ' + e.stack; });
