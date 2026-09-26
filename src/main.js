import { Game } from './core/Game.js';

// All procedural art / UI icons are small 2D canvases that get read back (toDataURL, getImageData).
// GPU-backed canvases make every read-back a synchronous GPU round-trip (100+ ms each on phones),
// so default 2D contexts to CPU-backed ones.
{
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (type === '2d' && this.width <= 1024 && this.height <= 1024) opts = { willReadFrequently: true, ...(opts || {}) };
    return orig.call(this, type, opts);
  };
}

const loader = document.getElementById('loader');
const bar = document.getElementById('loader-bar');
const label = document.getElementById('loader-label');
const progress = (p, text) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (label && text) label.textContent = text; };

async function main() {
  const game = new Game();
  window.game = game;   // handy for debugging from the console
  await game.init(progress);
  const qs = new URLSearchParams(location.search);
  await game.setup(qs.has('seed') ? { seed: +qs.get('seed') } : {}, progress);
  await prewarmIcons(game, progress);
  loader?.classList.add('hidden');
  setTimeout(() => loader?.remove(), 800);
  if (game.debug || new URLSearchParams(location.search).has('autostart')) game.begin();
  else game.ui.showMainMenu?.();
}

main().catch((e) => {
  console.error(e);
  if (label) label.textContent = 'Ошибка запуска: ' + e.message;
});

/** Generate every UI icon + its data URL up front so opening panels never stalls. */
async function prewarmIcons(game, progress) {
  progress(0.97, 'Готовим интерфейс…');
  try {
    const icons = await import('./art/icons.js');
    const { ITEMS, RESOURCES } = await import('./core/items.js');
    const { PALETTE } = await import('./core/blocks.js');
    let types = [];
    try { types = Object.keys((await import('./village/buildings.js')).BUILDING_TYPES); } catch (e) { /* ignore */ }
    const jobs = [
      ...types.map(t => () => icons.iconURL(icons.getBuildingIcon(t))),
      ...Object.keys(ITEMS).map(id => () => icons.iconURL(icons.getItemSprite(id))),
      ...[...RESOURCES, 'research', 'population', 'mana', 'health'].map(r => () => icons.iconURL(icons.getResourceIcon(r))),
      ...PALETTE.map(b => () => icons.iconURL(icons.getBlockIcon(b))),
    ];
    let t0 = performance.now();
    for (const j of jobs) {
      try { j(); } catch (e) { /* ignore missing icon */ }
      if (performance.now() - t0 > 30) { await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); }
    }
  } catch (e) { console.warn('icon prewarm failed', e); }
}
