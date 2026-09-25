// Floating damage numbers projected from world space. Pooled DOM nodes, transform-only animation.
import { h } from './dom.js';

const POOL = 40;
const LIFE = 0.95;

export class DamageNumbers {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.root = h('div.zc-dmg-layer');
    this.pool = [];
    this.active = [];
    for (let i = 0; i < POOL; i++) {
      const el = h('div.zc-dmg');
      el.style.display = 'none';
      this.root.appendChild(el);
      this.pool.push({ el, x: 0, y: 0, z: 0, t: 0, dx: 0, big: false });
    }
    this._scr = { x: 0, y: 0 };
    this.game.bus.on('damage:number', (p) => this.spawn(p));
  }
  spawn(p) {
    if (!p || !p.pos || !this.game.running) return;
    let n = this.pool.pop();
    if (!n) { n = this.active.shift(); }   // recycle the oldest
    const amt = p.amount ?? 0;
    let kind = p.kind || 'normal';
    if (p.target && p.target === this.game.player) kind = 'player';
    const heal = kind === 'heal' || amt < 0;
    const v = Math.abs(amt);
    n.x = p.pos.x; n.y = p.pos.y + 0.2; n.z = p.pos.z;
    n.t = 0; n.dx = (Math.random() - 0.5) * 36;
    n.big = kind === 'crit' || v >= 30;
    n.el.className = 'zc-dmg k-' + (heal ? 'heal' : kind) + (n.big ? ' big' : '');
    n.el.textContent = (heal ? '+' : '') + (v >= 10 ? Math.round(v) : (Math.round(v * 10) / 10));
    n.el.style.display = '';
    this.active.push(n);
  }
  /** Floating label (e.g. '+2' with a resource icon) at a world position. */
  text(pos, text, iconURL = null, kind = 'gain') {
    if (!pos || !this.game.running) return;
    let n = this.pool.pop();
    if (!n) n = this.active.shift();
    n.x = pos.x; n.y = (pos.y ?? 0) + 0.3; n.z = pos.z;
    n.t = 0; n.dx = 0; n.big = false;
    n.el.className = 'zc-dmg k-' + kind;
    n.el.textContent = '';
    if (iconURL) { const i = new Image(); i.src = iconURL; i.className = 'zc-dmg-ico'; n.el.appendChild(i); }
    n.el.appendChild(document.createTextNode(text));
    n.el.style.display = '';
    this.active.push(n);
  }
  update(dt) {
    if (!this.active.length) return;
    const r = this.game.renderer, s = this._scr;
    const v = this._v || (this._v = { x: 0, y: 0, z: 0 });
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      n.t += dt;
      if (n.t >= LIFE) { n.el.style.display = 'none'; this.active.splice(i, 1); this.pool.push(n); continue; }
      v.x = n.x; v.y = n.y; v.z = n.z;
      const p = r?.worldToScreen?.(v, s);
      if (!p) { n.el.style.opacity = '0'; continue; }
      const k = n.t / LIFE;
      const rise = -60 * k + 30 * k * k;          // ease out
      const pop = n.t < 0.12 ? 0.6 + (n.t / 0.12) * 0.7 : 1.3 - Math.min(0.3, (n.t - 0.12) * 1.5);
      const sc = (n.big ? 1.35 : 1) * pop;
      n.el.style.transform = `translate(${(p.x + n.dx * k).toFixed(1)}px, ${(p.y + rise).toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
      n.el.style.opacity = k > 0.65 ? ((1 - k) / 0.35).toFixed(2) : '1';
    }
  }
  clear() { for (const n of this.active) { n.el.style.display = 'none'; this.pool.push(n); } this.active.length = 0; }
}
