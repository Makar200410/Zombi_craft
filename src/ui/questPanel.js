// Quest tracker (always on screen, under the clock) and the quest journal (every quest, age by age).
import { h, img, glyph, glyphImg, clear, toggle, dragScroll } from './dom.js';
import { RESOURCE_LABELS } from '../core/items.js';

const rewardText = (r) => Object.entries(r || {}).map(([k, n]) => `+${n} ${(RESOURCE_LABELS[k] || k).toLowerCase()}`).join(', ');

export class QuestTracker {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem('zc_quests_min') === '1'; } catch (e) { /* ignore */ }
    this.list = h('div.zc-qt-list');
    this.head = h('button.zc-qt-head.ui-i', { onclick: () => this.toggle() }, img(glyph('flag')), h('span', 'Задания'), this.arrow = h('b', '▾'));
    this.journalBtn = h('button.zc-qt-journal.ui-i', { title: 'Журнал заданий (J)', onclick: () => { ui.click(); ui.quests.show(); } }, 'Журнал');
    this.root = h('div.zc-qt.zc-panel.ui-i', h('div.zc-qt-top', this.head, this.journalBtn), this.list);
    this._ver = -1;
    this.apply();
  }
  toggle() {
    this.collapsed = !this.collapsed;
    try { localStorage.setItem('zc_quests_min', this.collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    this.ui.click();
    this.apply();
  }
  apply() { toggle(this.root, 'min', this.collapsed); this.arrow.textContent = this.collapsed ? '▸' : '▾'; }
  update() {
    const qs = this.game.quests;
    toggle(this.root, 'hidden', !this.game.running || !qs);
    if (!qs || qs.version === this._ver) return;
    this._ver = qs.version;
    clear(this.list);
    for (const a of qs.active) {
      const side = a.q.id.startsWith('s_');
      const goals = h('div.zc-qt-goals');
      for (const p of a.prog) {
        const txt = p.n > 1 ? `${p.label}: ${p.cur}/${p.n}` : p.label;
        goals.append(h('div.zc-qt-goal' + (p.done ? '.ok' : ''), h('i', p.done ? '✓' : '•'), h('span', txt)));
      }
      // how to do the next unfinished goal
      const gi = a.prog.findIndex(p => !p.done);
      const hint = gi >= 0 ? qs.hint(a.q.goals[gi]) : '';
      this.list.append(h('div.zc-qt-q' + (side ? '.side' : ''), { title: a.q.desc, onclick: () => this.ui.quests.show(a.q.id) },
        h('div.zc-qt-title', a.q.title), goals, hint ? h('div.zc-qt-hint', '💡 ' + hint) : null));
    }
    if (!qs.active.length) this.list.append(h('div.zc-qt-q', h('div.zc-qt-title', 'Все задания выполнены!')));
  }
}

export class QuestPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.open = false;
    this.root = h('div.zc-research.zc-craft.zc-qj.ui-i');
    this.body = h('div.zc-qj-body');
    const head = h('div.zc-rs-head',
      h('div.zc-rs-title', img(glyph('flag')), h('span', 'Журнал заданий')),
      this.sum = h('div.zc-inv-hint', ''),
      h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: () => this.close() }, glyphImg('close')));
    this.panel = h('div.zc-rs-panel.zc-panel.ornate', head, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    dragScroll(this.body, { x: false, y: true });
  }
  show(focusId) {
    this.open = true;
    this.root.classList.add('open');
    this.ui._unlockPointer?.(); this.game.input?.releasePointer?.();
    this.game.audio?.play?.('ui_open');
    this.render(focusId);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.game.audio?.play?.('ui_close');
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  render(focusId) {
    const qs = this.game.quests; if (!qs) return;
    clear(this.body);
    const cur = this.game.state.age | 0;
    let total = 0, done = 0, focusEl = null;
    for (const grp of qs.journal()) {
      const sec = h('div.zc-qj-age' + (grp.index > cur ? '.future' : ''));
      sec.append(h('div.zc-qj-agehead', h('b', { style: 'color:' + grp.age.color }, grp.age.name), grp.index > cur ? h('small', ' — впереди') : null));
      for (const it of grp.quests) {
        total++; if (it.state === 'done') done++;
        const act = qs.active.find(a => a.q === it.q);
        const goals = h('div.zc-qt-goals');
        for (const [i, g] of it.q.goals.entries()) {
          const p = act ? act.prog[i] : qs.goal(g);
          const ok = it.state === 'done' || p.done;
          goals.append(h('div.zc-qt-goal' + (ok ? '.ok' : ''), h('i', ok ? '✓' : '•'), h('span', p.n > 1 && it.state !== 'done' ? `${p.label}: ${p.cur}/${p.n}` : p.label)));
        }
        const rw = rewardText(it.q.reward);
        const hints = it.state === 'active' ? it.q.goals.map((g, i) => { const p = act ? act.prog[i] : qs.goal(g); return p.done ? '' : qs.hint(g); }).filter(Boolean) : [];
        const el = h('div.zc-qj-q.' + it.state + (it.side ? '.side' : ''),
          h('div.zc-qj-qhead', h('span.zc-qj-mark', it.state === 'done' ? '✓' : it.state === 'active' ? '➤' : '·'), h('b', it.q.title), it.side ? h('small', ' (доп.)') : null),
          h('div.zc-qj-desc', it.q.desc), goals, ...[...new Set(hints)].map(t => h('div.zc-qj-hint', '💡 ' + t)), rw ? h('div.zc-qj-rw', 'Награда: ' + rw) : null);
        if (focusId === it.q.id || (!focusId && !focusEl && it.state === 'active')) focusEl = el;
        sec.append(el);
      }
      this.body.append(sec);
    }
    this.sum.textContent = `Выполнено ${done} из ${total}`;
    if (focusEl) requestAnimationFrame(() => focusEl.scrollIntoView({ block: 'center' }));
  }
  update() {}
}
