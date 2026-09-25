// Research lab tech tree: pannable graph of tiers with SVG links + node details.
import { TECHS, TECH_ORDER } from '../systems/research.js';
import { h, img, glyph, glyphImg, resourceIcon, itemIcon, blockIcon, costRow, clear, setText, setStyle, toggle, fmtTime } from './dom.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const STATUS_LABEL = { done: 'Изучено', active: 'Исследуется', available: 'Доступно', locked: 'Закрыто' };

function techIcon(t) {
  const i = t.icon || {};
  if (i.item) return itemIcon(i.item);
  if (i.block != null) return blockIcon(i.block);
  if (i.res) return resourceIcon(i.res);
  return glyph('flask');
}

export class ResearchPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.sel = null;
    this.nodes = {};
    this.root = h('div.zc-research.ui-i');
    this.pointsEl = h('b'); this.rateEl = h('small');
    this.hint = h('div.zc-rs-hint');
    this.cur = h('div.zc-rs-current');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(resourceIcon('research')), h('span', 'Исследования')),
      h('div.zc-rs-points', img(resourceIcon('research')), h('div', this.pointsEl, this.rateEl)),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.view = h('div.zc-rs-view');
    this.tree = h('div.zc-rs-tree');
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'zc-rs-links');
    this.tree.appendChild(this.svg);
    this.view.appendChild(this.tree);
    this.detail = h('div.zc-rs-detail.zc-panel');
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.hint, this.cur, h('div.zc-rs-body', this.view, this.detail));
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this._buildTree();
    this._dragPan();
    this._t = 0;
    const bus = this.game.bus;
    bus.on('research:done', () => { if (this.open) this.refresh(true); });
    bus.on('research:started', () => { if (this.open) this.refresh(true); });
  }

  _buildTree() {
    const COLW = 184, ROWH = 86, PAD = 22, NW = 150, NH = 62;
    this.dims = { COLW, ROWH, PAD, NW, NH };
    let maxX = 0, maxY = 0;
    const pos = {};
    for (const id of TECH_ORDER) {
      const t = TECHS[id];
      const x = PAD + t.pos[0] * COLW, y = PAD + t.pos[1] * ROWH;
      pos[id] = { x, y };
      maxX = Math.max(maxX, x + NW); maxY = Math.max(maxY, y + NH);
    }
    const W = maxX + PAD, H = maxY + PAD;
    this.tree.style.width = W + 'px'; this.tree.style.height = H + 'px';
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // tier labels
    const tiers = ['I', 'II', 'III', 'IV', 'V'];
    for (let i = 0; i < 5; i++) this.tree.appendChild(h('div.zc-rs-tier', { style: { left: (PAD + i * COLW) + 'px', width: NW + 'px' } }, 'Эпоха ' + tiers[i]));
    // links
    this.links = [];
    for (const id of TECH_ORDER) {
      for (const p of TECHS[id].prereqs) {
        const a = pos[p], b = pos[id];
        const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
        const mx = (x1 + x2) / 2;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        const glow = path.cloneNode();
        glow.setAttribute('class', 'glow');
        this.svg.append(glow, path);
        this.links.push({ from: p, to: id, path, glow });
      }
    }
    // nodes
    for (const id of TECH_ORDER) {
      const t = TECHS[id];
      const n = {
        bar: h('i'),
        el: null,
      };
      n.el = h('button.zc-tnode.ui-i', { style: { left: pos[id].x + 'px', top: pos[id].y + 'px', width: NW + 'px', height: NH + 'px' }, onclick: () => this.select(id) },
        h('div.zc-tnode-ico', img(techIcon(t))),
        h('div.zc-tnode-name', t.name),
        h('div.zc-tnode-bar', n.bar),
        h('img.zc-tnode-lock', { src: glyph('lock'), alt: '' }),
        h('img.zc-tnode-done', { src: glyph('check'), alt: '' }));
      this.nodes[id] = n;
      this.tree.appendChild(n.el);
    }
    this.pos = pos;
  }

  _dragPan() {
    const v = this.view;
    let drag = null;
    v.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;   // native scrolling on touch
      drag = { x: e.clientX, y: e.clientY, sl: v.scrollLeft, st: v.scrollTop, moved: false };
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; v.classList.add('dragging'); }
      v.scrollLeft = drag.sl - dx; v.scrollTop = drag.st - dy;
    });
    addEventListener('pointerup', () => {
      if (drag?.moved) { const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; v.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => v.removeEventListener('click', stop, { capture: true }), 0); }
      drag = null; v.classList.remove('dragging');
    });
    v.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
  }

  show(id) {
    this.open = true;
    this.root.classList.add('open');
    const r = this.game.research;
    const pick = id || r?.current || r?.available?.()[0] || this.sel || 'agriculture';
    this.select(pick, true);
    this.refresh(true);
    // scroll selected node into view
    requestAnimationFrame(() => {
      const p = this.pos[pick]; if (!p) return;
      this.view.scrollLeft = Math.max(0, p.x - this.view.clientWidth / 2 + 75);
      this.view.scrollTop = Math.max(0, p.y - this.view.clientHeight / 2 + 31);
    });
    this.game.audio?.play?.('ui_open');
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.game.audio?.play?.('ui_close');
    this.ui.onPanelClosed?.();
  }

  select(id, silent) {
    this.sel = id;
    if (!silent) this.ui.click();
    for (const k in this.nodes) toggle(this.nodes[k].el, 'sel', k === id);
    this.renderDetail();
  }

  renderDetail() {
    const id = this.sel, t = TECHS[id], r = this.game.research, st = this.game.state;
    if (!t) return;
    const d = clear(this.detail);
    const status = r?.status ? r.status(id) : (st.researchDone.has(id) ? 'done' : 'locked');
    d.append(
      h('div.zc-rs-dhead', h('div.zc-rs-dico', img(techIcon(t))), h('div', h('b', t.name), h('span.zc-badge.t-' + status, STATUS_LABEL[status]))),
      h('p.zc-rs-desc', t.desc),
      h('ul.zc-rs-effects', t.effects.map(e => h('li', e))));
    if (t.prereqs.length) {
      d.append(h('div.zc-rs-req', 'Требуется: ', t.prereqs.map((p, i) => [i ? ', ' : '', h('span' + (st.researchDone.has(p) ? '.ok' : '.bad'), TECHS[p].name)])));
    }
    if (status !== 'done') {
      const cost = costRow(st, t.cost);
      cost.prepend(h('span.zc-cost-item.pts', img(resourceIcon('research')), String(t.points)));
      d.append(h('div.zc-rs-cost', h('span.zc-field-lbl', 'Стоимость'), cost));
    }
    const actions = h('div.zc-rs-actions');
    if (status === 'active') {
      this.detailBar = h('i');
      this.detailPct = h('span');
      actions.append(h('div.zc-rs-dprog', h('div.zc-rs-dprog-track', this.detailBar), this.detailPct));
    } else if (status !== 'done') {
      const reason = r?.blockReason ? r.blockReason(id) : 'Недоступно';
      const b = h('button.zc-btn.primary.ui-i' + (reason ? '.disabled' : ''), {
        onclick: () => {
          if (reason) { this.ui.toast(reason, 'bad'); this.game.audio?.play?.('mana_empty'); return; }
          if (r.start(id)) { this.ui.toast('Начато исследование: ' + t.name, 'info', 'research'); this.refresh(true); }
        },
      }, img(resourceIcon('research'), 'zc-ico zc-btn-ico'), h('span.zc-btn-lbl', 'Исследовать'));
      actions.append(b);
      if (reason) actions.append(h('div.zc-note' + (reason === 'Не хватает ресурсов' ? '.warn' : ''), reason));
    }
    d.append(actions);
    this._detailStatus = status;
  }

  refresh(full) {
    const r = this.game.research; if (!r) return;
    const st = this.game.state;
    for (const id of TECH_ORDER) {
      const n = this.nodes[id];
      const s = r.status ? r.status(id) : (st.researchDone.has(id) ? 'done' : 'locked');
      if (n.s !== s) { n.el.className = 'zc-tnode ui-i s-' + s + (this.sel === id ? ' sel' : ''); n.s = s; }
      toggle(n.el, 'poor', s === 'available' && !st.canAfford(TECHS[id].cost));
      if (s === 'active') setStyle(n.bar, 'transform', `scaleX(${(r.progress || 0).toFixed(3)})`);
    }
    for (const l of this.links) {
      const a = r.status?.(l.from), b = r.status?.(l.to);
      const cls = b === 'done' ? 'done' : (a === 'done' ? (b === 'active' ? 'active' : 'open') : 'locked');
      if (l.cls !== cls) { l.cls = cls; l.path.setAttribute('class', 'ln ' + cls); l.glow.setAttribute('class', 'glow ' + cls); }
    }
    // header
    setText(this.pointsEl, (r.points || 0).toFixed(1) + ' оч.');
    setText(this.rateEl, '+' + (r.rate || 0.05).toFixed(2) + ' в сек.');
    const lab = r.labInfo ? r.labInfo() : { labs: 0, researchers: 0 };
    let hint = '';
    if (!lab.labs) hint = 'Постройте лабораторию и назначьте учёных — без них исследования идут очень медленно.';
    else if (!lab.researchers) hint = 'В лаборатории нет учёных. Назначьте жителей в разделе «Жители».';
    setText(this.hint, hint);
    toggle(this.hint, 'show', !!hint);
    // current research strip
    if (full || this._curId !== r.current) {
      this._curId = r.current;
      clear(this.cur);
      if (r.current) {
        const t = TECHS[r.current];
        this.curFill = h('i'); this.curTxt = h('span.zc-rs-cur-pct');
        this.cur.append(img(techIcon(t)), h('div.zc-rs-cur-main', h('div', h('small', 'Сейчас изучается: '), h('b', t.name)), h('div.zc-rs-cur-track', this.curFill)), this.curTxt);
      } else this.cur.append(h('span.zc-rs-idle', 'Ничего не исследуется — выберите технологию.'));
    }
    if (r.current && this.curFill) {
      setStyle(this.curFill, 'transform', `scaleX(${(r.progress || 0).toFixed(3)})`);
      const eta = r.eta?.();
      setText(this.curTxt, Math.floor((r.progress || 0) * 100) + '%' + (eta != null && isFinite(eta) ? ' · ~' + fmtTime(eta) : ''));
    }
    // detail
    const ds = r.status?.(this.sel);
    if (full || ds !== this._detailStatus) this.renderDetail();
    if (ds === 'active' && this.detailBar) {
      setStyle(this.detailBar, 'transform', `scaleX(${(r.progress || 0).toFixed(3)})`);
      setText(this.detailPct, Math.floor((r.progress || 0) * 100) + '%');
    }
  }

  update(dt) {
    if (!this.open) return;
    this._t += dt;
    if (this._t > 0.25) { this._t = 0; this.refresh(false); }
    this._afT = (this._afT || 0) + dt;
    if (this._afT > 1.5) { this._afT = 0; if (this._detailStatus === 'available') this.renderDetail(); }
  }
}
