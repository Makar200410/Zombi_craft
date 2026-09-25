// Toast notifications + big centered banners (wave start / cleared / new day).
import { h, img, glyph, resourceIcon } from './dom.js';

const KIND_ICON = { info: () => glyph('flag'), good: () => glyph('check'), bad: () => glyph('skull'), wave: () => glyph('skull'), research: () => resourceIcon('research'), save: () => glyph('book') };

export class Toasts {
  constructor(ui) {
    this.ui = ui;
    this.root = h('div.zc-toasts');
    this.items = [];
  }
  show(text, kind = 'info', icon = null) {
    if (!text) return;
    // merge duplicates that are still visible
    const dup = this.items.find(t => t.text === text && !t.dying);
    if (dup) {
      dup.count++; dup.countEl.textContent = '×' + dup.count; dup.countEl.style.display = '';
      dup.life = 3.5; dup.el.classList.remove('pop'); void dup.el.offsetWidth; dup.el.classList.add('pop');
      return;
    }
    const t = { text, kind, count: 1, life: kind === 'wave' ? 4.5 : 3.5, dying: false };
    const ic = (icon && KIND_ICON[icon]) ? KIND_ICON[icon]() : (KIND_ICON[kind] || KIND_ICON.info)();
    t.countEl = h('span.zc-toast-count', { style: { display: 'none' } });
    t.el = h('div.zc-toast.k-' + kind + '.pop', img(ic), h('span.zc-toast-txt', text), t.countEl);
    this.root.prepend(t.el);
    this.items.unshift(t);
    while (this.items.length > 4) this._kill(this.items[this.items.length - 1], true);
  }
  _kill(t, now = false) {
    if (t.dying) return;
    t.dying = true;
    this.items = this.items.filter(x => x !== t);
    t.el.classList.add('out');
    setTimeout(() => t.el.remove(), now ? 250 : 400);
  }
  update(dt) {
    for (const t of [...this.items]) { t.life -= dt; if (t.life <= 0) this._kill(t); }
  }
  clear() { for (const t of [...this.items]) this._kill(t, true); }
}

export class Banner {
  constructor(ui) {
    this.ui = ui;
    this.root = h('div.zc-banner');
    this._timer = null;
  }
  show(title, sub = '', kind = 'wave', ms = 3200) {
    const r = this.root;
    r.className = 'zc-banner k-' + kind;
    r.textContent = '';
    r.append(h('div.zc-banner-deco'), h('div.zc-banner-title', title), sub ? h('div.zc-banner-sub', sub) : null);
    void r.offsetWidth;
    r.classList.add('show');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => r.classList.remove('show'), ms);
  }
  hide() { this.root.classList.remove('show'); }
}
