// «Мастерская»: share blueprints and worlds with friends. Everything travels as short text codes (copy them into a
// chat, paste a friend's), as files, or straight to everyone in a network game.
//   blueprint: ZCBP1:… (see src/systems/blueprints.js)   world: ZCSEED:<seed>:<format>:<name>
import { h, img, glyph, glyphImg, clear, dragScroll } from './dom.js';
import { encodeBlueprint, decodeBlueprint } from '../systems/blueprints.js';
import { WORLD_FORMAT } from '../world/World.js';

export function seedCode(seed, format = WORLD_FORMAT, name = '') { return `ZCSEED:${seed >>> 0}:${format | 0}:${encodeURIComponent(String(name || '').slice(0, 32))}`; }
export function parseSeedCode(text) {
  const t = String(text || '').trim();
  const m = /ZCSEED:(\d+):(\d+):?([^\s]*)/.exec(t);
  if (m) { let name = ''; try { name = decodeURIComponent(m[3] || ''); } catch (e) { name = ''; } return { seed: +m[1] % 2147483647, format: +m[2], name }; }
  if (/^\d{1,10}$/.test(t)) return { seed: +t % 2147483647, format: WORLD_FORMAT, name: '' };
  return null;
}

/** Copies text to the clipboard (falls back to selecting it in a field the player can copy from). */
async function copy(ui, text, field) {
  try { await navigator.clipboard.writeText(text); ui.toast('Код скопирован', 'good'); return; } catch (e) { /* no clipboard here */ }
  if (field) { field.value = text; field.focus(); field.select(); try { document.execCommand('copy'); ui.toast('Код скопирован', 'good'); return; } catch (e) { /* ignore */ } }
  ui.toast('Скопируйте код из поля вручную', 'info');
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Fills container c with the workshop. inMenu: started from the main menu (worlds can be created from a code). */
export function renderWorkshop(c, ui, { inMenu = false, onNewWorld = null } = {}) {
  const g = ui.game, B = g.blueprints;
  clear(c);
  const field = h('textarea.zc-input.zc-ws-code.ui-i', { rows: 3, placeholder: 'Вставьте сюда код чертежа (ZCBP1:…) или мира (ZCSEED:…)' });
  field.addEventListener('keydown', (e) => e.stopPropagation());
  const card = (color, title, ...rest) => h('div.zc-rv-town', { style: `border-left-color:${color}` }, h('div.zc-rv-head', h('b', title)), ...rest);
  const btn = (label, on, cls = '') => h('button.zc-chipbtn.ui-i' + cls, { onclick: on }, label);
  const rerender = () => renderWorkshop(c, ui, { inMenu, onNewWorld });

  // ---- import a code or a file
  const fileIn = h('input', { type: 'file', accept: '.zcbp,.txt', style: 'display:none' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    const text = await f.text();
    const bp = decodeBlueprint(text);
    if (!bp) return ui.toast('В файле нет чертежа', 'bad');
    B.add(bp); ui.toast(`Чертёж «${bp.name}» добавлен`, 'good'); rerender();
  });
  const take = () => {
    const t = field.value.trim();
    const bp = decodeBlueprint(t);
    if (bp) { B.add(bp); ui.toast(`Чертёж «${bp.name}»${bp.author ? ` от ${bp.author}` : ''} добавлен: Строительство → Чертежи`, 'good'); rerender(); return; }
    const s = parseSeedCode(t);
    if (s) {
      if (inMenu && onNewWorld) { onNewWorld(s); return; }
      ui.toast(`Это мир «${s.name || 'без имени'}», зерно ${s.seed}. Создайте его из главного меню: Мастерская или Новый мир`, 'info');
      return;
    }
    ui.toast('Код не распознан', 'bad');
  };
  c.append(card('#e8c040', 'Получить от друга',
    h('div.zc-rv-line', 'Код чертежа или мира, присланный другом. Чертежи можно и из файла .zcbp.'),
    field,
    h('div.zc-rv-btns', btn('Добавить', take, '.sel'), btn('Из файла…', () => fileIn.click()), fileIn)));

  // ---- worlds
  const worlds = [];
  if (g.running && g.world) worlds.push(['Текущий мир', g.world.seed, g.world.format, g.save?.worlds?.().find(w => w.id === g.save.worldId)?.name || '']);
  for (const w of (g.save?.worlds?.() || []).slice(0, 6)) if (w.seed != null && !worlds.some(x => x[1] === w.seed)) worlds.push([w.name, w.seed, WORLD_FORMAT, w.name]);
  c.append(card('#6fd0ff', 'Поделиться миром',
    h('div.zc-rv-line', 'Код мира — это его зерно: у друга появится тот же самый мир (горы, пещеры, соседи), но без ваших построек.'),
    ...worlds.map(([label, seed, fmt, name]) => h('div.zc-rv-trade', h('span', `${label} · зерно ${seed}`), btn('Копировать код', () => copy(ui, seedCode(seed, fmt, name), field)))),
    worlds.length ? null : h('div.zc-rv-line', 'Здесь появятся ваши миры.')));

  // ---- blueprints
  const net = g.net, canSend = net?.active && (net.isHost ? net.players?.size : true);
  const list = B?.list || [];
  c.append(card('#9fe3a0', `Мои чертежи (${list.length})`,
    h('div.zc-rv-line', 'Чертёж делается «Рамкой чертежа» (Инструменты): обведите постройку двумя углами.'),
    ...list.map(bp => h('div.zc-rv-trade',
      h('div', h('b', bp.name), h('div.zc-rv-line', `${bp.w}×${bp.d}, высота ${bp.h}, блоков ${bp.blocks.length}${bp.author ? ` · автор ${bp.author}` : ''}`)),
      h('div.zc-rv-btns',
        btn('Код', () => copy(ui, encodeBlueprint(bp), field)),
        btn('Файл', () => download((bp.name || 'чертёж').replace(/[\\/:*?"<>|]/g, '_') + '.zcbp', encodeBlueprint(bp))),
        canSend ? btn('Всем в сети', () => { net.shareBlueprint(encodeBlueprint(bp)); ui.toast(`«${bp.name}» отправлен игрокам`, 'good'); }, '.sel') : null,
        btn('Удалить', () => ui.confirm('Удалить чертёж?', `«${bp.name}» исчезнет из списка (уже построенное останется).`, 'Удалить', () => { B.remove(bp.id); rerender(); }))))),
    list.length ? null : h('div.zc-rv-line', 'Пока нет ни одного чертежа.')));
}

/** In-game workshop panel (K). */
export class WorkshopPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.root = h('div.zc-research.zc-craft.zc-rv.ui-i');
    this.body = h('div.zc-rv-body');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('hammer')), h('span', 'Мастерская')),
      h('div.zc-inv-hint', 'Обмен чертежами и мирами'),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
    this.game.bus.on('blueprints:changed', () => { if (this.open) this.render(); });
  }
  show() {
    this.open = true;
    this.root.classList.add('open');
    this.ui._unlockPointer?.(); this.game.input?.releasePointer?.();
    this.game.audio?.play?.('ui_open');
    this.render();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.game.audio?.play?.('ui_close');
    this.ui.onPanelClosed?.();
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  render() { renderWorkshop(this.body, this.ui); }
  update() {}
}
