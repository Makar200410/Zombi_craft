import { Game } from './core/Game.js';

const loader = document.getElementById('loader');
const bar = document.getElementById('loader-bar');
const label = document.getElementById('loader-label');
const progress = (p, text) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (label && text) label.textContent = text; };

async function main() {
  const game = new Game();
  window.game = game;   // handy for debugging from the console
  await game.init(progress);
  await game.setup({}, progress);
  loader?.classList.add('hidden');
  setTimeout(() => loader?.remove(), 800);
  if (game.debug || new URLSearchParams(location.search).has('autostart')) game.begin();
  else game.ui.showMainMenu?.();
}

main().catch((e) => {
  console.error(e);
  if (label) label.textContent = 'Ошибка запуска: ' + e.message;
});
