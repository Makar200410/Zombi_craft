// Command mode (Clash-of-Clans style) UI: tab bar, build menu, villagers & jobs, placement bar, inspectors.
import { TECHS } from '../systems/research.js';
import {
  h, img, glyph, glyphImg, buildingIcon, costRow, clear, setText, setStyle, toggle, fmtNum,
  BUILDING_TYPES, BUILDING_ORDER, JOB_LABELS, JOB_PLURAL, JOB_ORDER, jobIcon, STATE_LABELS, clamp,
} from './dom.js';

const CATS = [['all', 'Все'], ['economy', 'Экономика'], ['military', 'Военное'], ['magic', 'Магия'], ['defense', 'Оборона']];
const ZOMBIE_NAMES = { walker: 'Ходок', runner: 'Бегун', brute: 'Громила', spitter: 'Плевальщик', exploder: 'Взрывун', necromancer: 'Некромант' };
const CONTINUOUS = new Set(['wall', 'stone_wall']);   // keep placing after each placement

function jobSlotsOf(b) {
  if (b?.jobSlots && typeof b.jobSlots === 'object') return b.jobSlots;
  return b?.def?.jobs || BUILDING_TYPES[b?.type]?.jobs || {};
}
function workersOf(b, job) {
  const w = (b?.workers || []).filter(v => v && !v.dead);
  return job ? w.filter(v => (v.job || 'idle') === job) : w;
}
function bar(cls, label) {
  const fill = h('div.zc-mbar-fill'), val = h('span.zc-mbar-val');
  const el = h('div.zc-mbar.' + cls, h('span.zc-mbar-lbl', label), h('div.zc-mbar-track', fill, val));
  return { el, set(v, max, txt) { const r = clamp(max ? v / max : 0, 0, 1); setStyle(fill, 'transform', `scaleX(${r.toFixed(3)})`); setText(val, txt ?? (Math.ceil(v) + ' / ' + Math.round(max))); toggle(el, 'low', r < 0.3); } };
}

export class CommandPanel {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.root = h('div.zc-command');
    this.tab = null;           // 'build' | 'people' | null
    this.cat = 'all';
    this.placing = null;       // building type id being placed
    this.selected = null;      // {kind:'building'|'entity', ref}

    // tab bar
    const tb = (id, label, icon, cls = '') => h('button.zc-tab.ui-i' + cls, { 'data-tab': id, onclick: () => this.onTab(id) }, h('span.zc-tab-ico', img(icon)), h('span.zc-tab-lbl', label));
    this.waveTab = tb('wave', 'Вызвать волну', glyph('skull'), '.danger');
    this.tabbar = h('div.zc-tabbar.zc-panel',
      tb('build', 'Строить', glyph('hammer')),
      tb('people', 'Жители', glyph('people')),
      tb('research', 'Исследования', glyph('flask')),
      this.waveTab);

    // build sheet
    this.catBar = h('div.zc-cats');
    for (const [id, name] of CATS) this.catBar.append(h('button.zc-chipbtn.ui-i', { 'data-cat': id, onclick: () => { this.cat = id; this.ui.click(); this.renderBuild(); } }, name));
    this.cards = h('div.zc-cards');
    this.buildSheet = h('div.zc-sheet.zc-build-sheet.zc-panel.ui-i',
      h('div.zc-sheet-head', h('div.zc-sheet-title', img(glyph('hammer')), 'Строительство'), this.catBar, this.closeBtn(() => this.closeTab())),
      this.cards);

    // villagers sheet
    this.peopleTitle = h('span', 'Жители');
    this.peopleMode = 'jobs';
    this.peopleSeg = h('div.zc-seg.small',
      h('button.ui-i', { 'data-m': 'jobs', onclick: () => { this.peopleMode = 'jobs'; this.ui.click(); this.renderPeople(true); } }, 'Работы'),
      h('button.ui-i', { 'data-m': 'list', onclick: () => { this.peopleMode = 'list'; this.ui.click(); this.renderPeople(true); } }, 'Список'));
    this.peopleBody = h('div.zc-people-body');
    this.peopleSheet = h('div.zc-sheet.zc-people-sheet.zc-panel.ui-i',
      h('div.zc-sheet-head', h('div.zc-sheet-title', img(glyph('people')), this.peopleTitle), this.peopleSeg, this.closeBtn(() => this.closeTab())),
      this.peopleBody);

    // placement bar
    this.placeIcon = img('');
    this.placeName = h('b');
    this.placeCost = h('div');
    this.placeHint = h('div.zc-place-hint');
    this.placeWarn = h('div.zc-place-warn');
    this.rotBtn = h('button.zc-iconbtn.big.ui-i', { title: 'Повернуть (R)', onclick: () => { this.game.village?.rotatePlacement?.(); } }, glyphImg('rotate'));
    this.okBtn = h('button.zc-iconbtn.big.ok.ui-i', { title: 'Поставить здесь', onclick: () => { this.game.village?.confirmPlacement?.(); } }, glyphImg('check'));
    this.placebar = h('div.zc-placebar.zc-panel.ui-i',
      h('div.zc-place-info', this.placeIcon, h('div', this.placeName, this.placeCost)),
      h('div.zc-place-mid', this.placeHint, this.placeWarn),
      h('div.zc-place-btns', this.okBtn, this.rotBtn,
        h('button.zc-iconbtn.big.danger.ui-i', { title: 'Отмена (Esc)', onclick: () => this.cancelPlacement() }, glyphImg('close'))));

    // inspector
    this.inspector = h('div.zc-inspector.zc-panel.ornate.ui-i');

    this.root.append(this.buildSheet, this.peopleSheet, this.placebar, this.inspector, this.tabbar);
    this._t = 0; this._peopleT = 0; this._insT = 0;

    const bus = this.game.bus;
    bus.on('select:building', ({ building }) => this.select('building', building));
    bus.on('select:entity', ({ entity }) => this.select('entity', entity));
    bus.on('select:clear', () => this.deselect());
    bus.on('placement:changed', (p) => this.onPlacement(p || {}));
    bus.on('research:done', () => { if (this.tab === 'build') this.renderBuild(); });
    bus.on('building:completed', () => { if (this.tab === 'build') this.renderBuild(); });
    bus.on('mode:changed', ({ mode }) => { if (mode !== 'command') { this.closeTab(true); this.cancelPlacement(true); } });
  }

  closeBtn(fn) { return h('button.zc-iconbtn.zc-close.ui-i', { title: 'Закрыть', onclick: (e) => { e.stopPropagation(); this.ui.game.audio?.play?.('ui_close'); fn(); } }, glyphImg('close')); }

  onTab(id) {
    this.ui.click();
    if (id === 'research') { this.closeTab(true); this.ui.openResearch(); return; }
    if (id === 'wave') { this.callWave(); return; }
    if (this.tab === id) { this.closeTab(); return; }
    this.cancelPlacement(true);
    this.tab = id;
    this.game.audio?.play?.('ui_open');
    if (id === 'build') this.renderBuild();
    if (id === 'people') this.renderPeople(true);
    this.syncTabs();
  }
  closeTab(silent) { this.tab = null; this.syncTabs(); }
  syncTabs() {
    for (const b of this.tabbar.children) toggle(b, 'sel', b.dataset.tab === this.tab);
    toggle(this.buildSheet, 'open', this.tab === 'build');
    toggle(this.peopleSheet, 'open', this.tab === 'people');
    toggle(this.root, 'sheet-open', !!this.tab);
  }
  get isOpen() { return !!this.tab || !!this.selected; }
  closeTop() {
    if (this.placing) { this.cancelPlacement(); return true; }
    if (this.selected) { this.deselect(true); return true; }
    if (this.tab) { this.closeTab(); return true; }
    return false;
  }

  // ------------------------------------------------------------------ wave
  callWave() {
    const w = this.game.waves;
    if (!w?.startWaveNow) { this.ui.toast('Недоступно', 'bad'); return; }
    if ((w.activeCount || 0) > 0) { this.ui.toast('Волна уже идёт!', 'bad'); return; }
    this.ui.confirm('Вызвать волну сейчас?', 'Нежить нападёт немедленно. Ранний вызов ускоряет игру — будьте готовы к обороне.', 'В бой!', () => w.startWaveNow());
  }

  // ------------------------------------------------------------------ build menu
  buildable(id) {
    const t = BUILDING_TYPES[id]; const st = this.game.state, v = this.game.village;
    const count = (v?.buildings || []).filter(b => b.type === id && b.state !== 'destroyed').length;
    const lockedBy = t?.research && !st.researchDone.has(t.research) ? t.research : null;
    const limited = t?.maxCount != null && isFinite(t.maxCount);
    const maxed = limited && count >= t.maxCount;
    const afford = st.canAfford(t?.cost || {});
    return { t, count, lockedBy, maxed, afford, limited };
  }
  renderBuild() {
    for (const b of this.catBar.children) toggle(b, 'sel', b.dataset.cat === this.cat);
    clear(this.cards);
    const ids = BUILDING_ORDER.filter(id => BUILDING_TYPES[id] && !BUILDING_TYPES[id].auto && id !== 'town_hall' && (this.cat === 'all' || BUILDING_TYPES[id].category === this.cat));
    if (!ids.length) { this.cards.append(h('div.zc-empty', Object.keys(BUILDING_TYPES).length ? 'Нет зданий в этой категории' : 'Список зданий загружается…')); return; }
    for (const id of ids) {
      const { t, count, lockedBy, maxed, afford, limited } = this.buildable(id);
      const card = h('button.zc-bcard.ui-i' + (lockedBy ? '.locked' : '') + (!afford ? '.poor' : '') + (maxed ? '.maxed' : ''), {
        'data-cat': t.category || 'economy', title: t.desc || '', onclick: () => this.chooseBuilding(id),
      },
      h('div.zc-bcard-img', img(buildingIcon(id))),
      h('div.zc-bcard-name', t.name || id),
      (count || limited) ? h('div.zc-bcard-count', limited ? `${count}/${t.maxCount}` : '×' + count) : null,
      lockedBy ? h('div.zc-bcard-lock', img(glyph('lock')), TECHS[lockedBy]?.name || lockedBy) : costRow(this.game.state, t.cost),
      t.popBonus ? h('div.zc-bcard-tag', '+' + t.popBonus + ' жит.') : null);
      this.cards.append(card);
    }
  }
  chooseBuilding(id) {
    const { t, lockedBy, maxed, afford } = this.buildable(id);
    const chk = this.game.village?.canPlace?.(id);
    if (chk && !chk.ok && chk.hard) { this.ui.toast(chk.reason, 'bad'); this.game.audio?.play?.('mana_empty'); return; }
    if (lockedBy) { this.ui.toast('Нужно исследование: ' + (TECHS[lockedBy]?.name || lockedBy), 'bad'); this.game.audio?.play?.('mana_empty'); return; }
    if (maxed) { this.ui.toast('Достигнут лимит: ' + t.name, 'bad'); return; }
    if (!afford) { this.ui.toast('Не хватает ресурсов', 'bad'); this.game.audio?.play?.('mana_empty'); return; }
    this.ui.click();
    const v = this.game.village;
    const r = v?.beginPlacement?.(id);
    if (r === false) return;
    this.startPlacement(id);
  }
  startPlacement(id) {
    const t = BUILDING_TYPES[id];
    this.placing = id;
    this.closeTab(true);
    this.deselect();
    this.placeIcon.src = buildingIcon(id);
    this.placeName.textContent = t?.name || id;
    clear(this.placeCost).append(costRow(this.game.state, t?.cost || {}));
    toggle(this.rotBtn, 'hidden', !!t?.line);
    toggle(this.root, 'placing', true);
    this.onPlacement({ active: true, typeId: id, valid: true, line: !!t?.line, lineStarted: false });
  }
  /** Mirrors the village placement state ('placement:changed'). */
  onPlacement(p) {
    if (!p.active) { if (this.placing) this.endPlacement(); return; }
    if (p.typeId && p.typeId !== this.placing) { this.startPlacement(p.typeId); return; }
    const touch = this.game.isTouch;
    let hint;
    if (p.line) hint = p.lineStarted ? (touch ? 'Коснитесь конца линии' : 'Щёлкните конец линии · Esc — готово') : (touch ? 'Коснитесь начала линии' : 'Щёлкните начало линии');
    else hint = touch ? 'Коснитесь места, затем ✓ или ещё раз — поставить' : 'ЛКМ — поставить · R — поворот · Esc — отмена';
    setText(this.placeHint, hint);
    setText(this.placeWarn, p.valid === false && p.reason ? p.reason : '');
    toggle(this.placebar, 'invalid', p.valid === false);
    toggle(this.okBtn, 'hidden', !!(p.line && !p.lineStarted && !touch));
  }
  cancelPlacement(silent) {
    if (!this.placing) return;
    this.game.village?.cancelPlacement?.();
    if (!silent) this.game.audio?.play?.('ui_close');
    this.endPlacement();
  }
  endPlacement() {
    this.placing = null;
    toggle(this.root, 'placing', false);
  }

  // ------------------------------------------------------------------ villagers / jobs
  villagers() { return (this.game.village?.villagers || []).filter(v => v && !v.dead); }
  jobCounts() {
    const counts = {}; for (const j of JOB_ORDER) counts[j] = 0;
    for (const v of this.villagers()) counts[v.job || 'idle'] = (counts[v.job || 'idle'] || 0) + 1;
    return counts;
  }
  capacity() {
    const cap = {};
    for (const b of this.game.village?.buildings || []) {
      if (b.state === 'destroyed') continue;
      const s = jobSlotsOf(b);
      for (const j in s) cap[j] = (cap[j] || 0) + (s[j] || 0);
    }
    const bc = this.game.village?.builderCap;
    if (typeof bc === 'number') cap.builder = bc;
    return cap;
  }
  freeBuildingFor(job) {
    const list = [...(this.game.village?.buildings || [])].sort((a, b) => (b.state === 'complete') - (a.state === 'complete'));
    for (const b of list) {
      if (b.state === 'destroyed') continue;
      const slots = jobSlotsOf(b)[job] || 0;
      if (slots > workersOf(b, job).length) return b;
    }
    return null;
  }
  jobOptions(v) {
    const opts = [{ label: 'Без дела', b: null, job: 'idle' }];
    const seen = {};
    for (const b of this.game.village?.buildings || []) {
      if (b.state === 'destroyed') continue;
      const s = jobSlotsOf(b), tname = BUILDING_TYPES[b.type]?.name || b.type;
      seen[b.type] = (seen[b.type] || 0) + 1;
      for (const job in s) {
        const used = workersOf(b, job).length, here = v.workplace === b && v.job === job;
        if (used >= s[job] && !here) continue;
        opts.push({ label: `${JOB_LABELS[job] || job} — ${tname}${seen[b.type] > 1 ? ' ' + seen[b.type] : ''} (${used}/${s[job]})`, b, job, here });
      }
    }
    return opts;
  }
  jobSelect(v) {
    const opts = this.jobOptions(v);
    const sel = h('select.zc-select.ui-i');
    let cur = 0;
    opts.forEach((o, i) => { sel.append(h('option', { value: String(i) }, o.label)); if (o.here || (!v.workplace && o.job === 'idle' && (v.job || 'idle') === 'idle')) cur = i; });
    if (!opts[cur]?.here && v.job && v.job !== 'idle' && !v.workplace) {   // e.g. builders without a workplace
      sel.append(h('option', { value: 'keep' }, JOB_LABELS[v.job] || v.job)); sel.value = 'keep';
    } else sel.value = String(cur);
    sel.addEventListener('change', () => {
      if (sel.value === 'keep') return;
      const o = opts[+sel.value]; if (!o) return;
      this.assign(v, o.b, o.job);
      sel.blur();
    });
    sel.addEventListener('keydown', (e) => e.stopPropagation());
    return sel;
  }
  assign(v, b, job) {
    const vil = this.game.village;
    if (!vil?.assign) { this.ui.toast('Назначение недоступно', 'bad'); return; }
    vil.assign(v, b, job);
    this.ui.click();
    this._peopleDirty = true;
    this._insT = 1;
  }
  jobPlus(job) {
    const vil = this.game.village;
    if (job === 'builder' && vil?.setBuilderCount) {
      const n = this.jobCounts().builder || 0;
      if (!(this.jobCounts().idle > 0)) { this.ui.toast('Нет свободных жителей', 'bad'); return; }
      if (typeof vil.builderCap === 'number' && n >= vil.builderCap) { this.ui.toast('Предел строителей — улучшите ратушу', 'bad'); return; }
      vil.setBuilderCount(n + 1); this.ui.click(); this._peopleDirty = true; return;
    }
    const idle = this.villagers().find(v => (v.job || 'idle') === 'idle');
    if (!idle) { this.ui.toast('Нет свободных жителей', 'bad'); return; }
    const b = this.freeBuildingFor(job);
    if (!b) {
      const types = Object.values(BUILDING_TYPES).filter(t => t.jobs?.[job]).map(t => t.name);
      this.ui.toast('Нет свободных мест' + (types.length ? ': постройте «' + types[0] + '»' : ''), 'bad');
      return;
    }
    this.assign(idle, b, job);
  }
  jobMinus(job) {
    const vil = this.game.village;
    if (job === 'builder' && vil?.setBuilderCount) {
      const n = this.jobCounts().builder || 0; if (n <= 0) return;
      vil.setBuilderCount(n - 1); this.ui.click(); this._peopleDirty = true; return;
    }
    const list = this.villagers().filter(v => v.job === job);
    const v = list[list.length - 1];
    if (v) this.assign(v, null, 'idle');
  }
  autoAssign() {
    const vil = this.game.village;
    if (vil?.autoAssign) { vil.autoAssign(); this.ui.click(); this._peopleDirty = true; this.ui.toast('Жители распределены', 'good'); }
  }

  renderPeople(force) {
    if (!this.peopleSheet.classList.contains('open') && !force) return;
    if (!force && this.peopleSheet.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    for (const b of this.peopleSeg.children) toggle(b, 'sel', b.dataset.m === this.peopleMode);
    const vs = this.villagers(), cap = this.game.village?.popCap ?? 0;
    this.peopleTitle.textContent = `Жители ${vs.length}/${cap}`;
    const scroll = this.peopleBody.scrollTop;
    clear(this.peopleBody);
    const counts = this.jobCounts(), capa = this.capacity();
    if (this.peopleMode === 'jobs') {
      const top = h('div.zc-jobs-top',
        h('div.zc-idle', img(glyph('zzz')), 'Без дела: ', h('b', counts.idle || 0)),
        this.game.village?.autoAssign ? h('button.zc-btn.small.ui-i', { onclick: () => this.autoAssign() }, h('span.zc-btn-lbl', 'Распределить')) : null);
      const list = h('div.zc-jobs');
      for (const job of JOB_ORDER) {
        if (job === 'idle') continue;
        const c = counts[job] || 0, cp = capa[job] || 0;
        const builder = job === 'builder' && this.game.village?.setBuilderCount;
        if (!cp && !c && !builder) {
          list.append(h('div.zc-job.off', img(jobIcon(job)), h('div.zc-job-name', JOB_PLURAL[job], h('small', this.jobHint(job))), h('div.zc-job-n', '—')));
          continue;
        }
        list.append(h('div.zc-job', img(jobIcon(job)),
          h('div.zc-job-name', JOB_PLURAL[job], h('small', builder ? 'Строят и чинят здания' : `Мест: ${cp}`)),
          h('div.zc-job-ctl',
            h('button.zc-iconbtn.small.ui-i', { title: 'Убрать', disabled: c <= 0, onclick: () => this.jobMinus(job) }, glyphImg('minus')),
            h('div.zc-job-n', h('b', c), cp ? ' / ' + cp : ''),
            h('button.zc-iconbtn.small.ui-i', { title: 'Добавить', disabled: !(counts.idle > 0) || (cp > 0 && c >= cp), onclick: () => this.jobPlus(job) }, glyphImg('plus')))));
      }
      this.peopleBody.append(top, list);
    } else {
      if (!vs.length) this.peopleBody.append(h('div.zc-empty', 'В деревне пока нет жителей. Постройте дома!'));
      for (const job of JOB_ORDER) {
        const group = vs.filter(v => (v.job || 'idle') === job);
        if (!group.length) continue;
        const sec = h('div.zc-vgroup', h('div.zc-vgroup-head', img(jobIcon(job)), JOB_PLURAL[job], h('span', group.length)));
        for (const v of group) sec.append(this.villagerRow(v));
        this.peopleBody.append(sec);
      }
    }
    this.peopleBody.scrollTop = scroll;
    this._peopleDirty = false;
  }
  jobHint(job) {
    const t = Object.values(BUILDING_TYPES).find(t => t.jobs?.[job]);
    return t ? 'Нужно здание: ' + t.name : 'Нет рабочих мест';
  }
  villagerRow(v) {
    const hp = bar('hp', ''), hu = bar('hunger', '');
    hp.set(v.hp, v.maxHp, ''); const hunger = this.hungerFrac(v); hu.set(hunger, 1, '');
    return h('div.zc-vrow',
      h('button.zc-vrow-main.ui-i', { onclick: () => this.focusEntity(v) },
        h('div.zc-vrow-name', v.name || 'Житель'), h('div.zc-vrow-task', v.task || '…'),
        h('div.zc-vrow-bars', hp.el, hu.el)),
      this.jobSelect(v));
  }
  hungerFrac(v) {
    // Villager.hunger: 100 = well fed (0..100). UI shows satiety (full bar = well fed).
    const x = v.satiety ?? v.hunger ?? 100;
    return clamp(x > 1.001 ? x / 100 : x, 0, 1);
  }
  focusEntity(e) {
    this.ui.click();
    const rig = this.game.cameraRig;
    (rig?.focusOn || rig?.panTo)?.call(rig, e.position.x, e.position.z);
    this.game.bus.emit('select:entity', { entity: e });
  }

  // ------------------------------------------------------------------ inspector
  select(kind, ref) {
    if (!ref) return this.deselect();
    if (this.game.mode !== 'command' && kind === 'building') return;
    if (this.game.mode !== 'command' && !this.game.isTouch) return;   // desktop explore: pointer is locked
    this.selected = { kind, ref };
    this.renderInspector();
    toggle(this.inspector, 'open', true);
    toggle(this.root, 'inspecting', true);
    this.game.audio?.play?.('ui_open');
  }
  deselect(emit) {
    if (!this.selected) return;
    this.selected = null;
    toggle(this.inspector, 'open', false);
    toggle(this.root, 'inspecting', false);
    if (emit) this.game.bus.emit('select:clear', {});
  }
  renderInspector() {
    const s = this.selected; if (!s) return;
    const el = clear(this.inspector);
    this._ins = {};
    if (s.kind === 'building') this._inspectBuilding(el, s.ref);
    else if (s.ref.kind === 'villager') this._inspectVillager(el, s.ref);
    else this._inspectOther(el, s.ref);
  }
  _head(icon, title, sub, badge) {
    return h('div.zc-ins-head', h('div.zc-ins-ico', img(icon)), h('div.zc-ins-title', h('b', title), sub ? h('small', sub) : null),
      badge || null, this.closeBtn(() => this.deselect(true)));
  }
  _inspectBuilding(el, b) {
    const t = BUILDING_TYPES[b.type] || {};
    const badge = this._ins.badge = h('span.zc-badge.s-' + b.state, STATE_LABELS[b.state] || b.state);
    el.append(this._head(buildingIcon(b.type), t.name || b.type, t.category ? ({ economy: 'Экономика', military: 'Военное', magic: 'Магия', defense: 'Оборона' })[t.category] : '', badge));
    if (t.desc) el.append(h('p.zc-ins-desc', t.desc));
    const prog = this._ins.prog = bar('build', 'Стройка');
    const hp = this._ins.hp = bar('hp', 'Прочность');
    el.append(prog.el, hp.el);
    const extra = [];
    if (t.popBonus) extra.push(h('span', img(glyph('people')), '+' + t.popBonus + ' к населению'));
    if (extra.length) el.append(h('div.zc-ins-tags', extra));
    const jobsBox = this._ins.jobs = h('div.zc-ins-jobs');
    el.append(jobsBox);
    this._renderBuildingJobs(b);
    const btns = h('div.zc-row.zc-ins-actions');
    const vil = this.game.village;
    if (b.type === 'laboratory') btns.append(h('button.zc-btn.primary.small.ui-i', { onclick: () => { this.ui.click(); this.ui.openResearch(); } }, img(glyph('flask'), 'zc-ico zc-btn-ico'), h('span.zc-btn-lbl', 'Исследования')));
    if (b.type === 'town_hall' && vil?.upgradeTownHall) {
      const cost = vil.upgradeCost?.(b);
      this._ins.lvl = h('div.zc-ins-lvl');
      el.insertBefore(this._ins.lvl, prog.el);
      if (cost && (b.level || 1) < 5) btns.append(h('button.zc-btn.primary.small.ui-i', { onclick: () => { this.ui.click(); if (vil.upgradeTownHall()) this.renderInspector(); } },
        img(glyph('star'), 'zc-ico zc-btn-ico'), h('span.zc-btn-lbl', 'Улучшить', costRow(this.game.state, cost))));
    }
    if (b.type !== 'town_hall' && vil?.demolish) {
      btns.append(h('button.zc-btn.danger.small.ui-i', { onclick: () => this.ui.confirm('Снести «' + (t.name || b.type) + '»?', b.state === 'complete' ? 'Вернётся половина ресурсов.' : 'Ресурсы вернутся полностью.', 'Снести', () => { if (vil.demolish(b)) this.deselect(true); }) },
        img(glyph('close'), 'zc-ico zc-btn-ico'), h('span.zc-btn-lbl', 'Снести')));
    }
    if (btns.children.length) el.append(btns);
    this._updateBuilding(b);
  }
  _renderBuildingJobs(b) {
    const box = this._ins.jobs; clear(box);
    const slots = jobSlotsOf(b);
    const jobs = Object.keys(slots).filter(j => slots[j] > 0);
    if (!jobs.length) return;
    this._ins.jobsSig = this._jobsSig(b);
    box.append(h('div.zc-ins-sub', 'Рабочие места'));
    for (const job of jobs) {
      const ws = workersOf(b, job);
      const row = h('div.zc-ins-job', img(jobIcon(job)), h('div.zc-ins-job-name', JOB_PLURAL[job] || job,
        h('small', ws.length ? ws.map(w => w.name).join(', ') : 'никого')),
      h('div.zc-job-ctl',
        h('button.zc-iconbtn.small.ui-i', { title: 'Снять', disabled: !ws.length, onclick: () => { const w = ws[ws.length - 1]; if (w) this.assign(w, null, 'idle'); } }, glyphImg('minus')),
        h('div.zc-job-n', h('b', ws.length), ' / ' + slots[job]),
        h('button.zc-iconbtn.small.ui-i', { title: 'Назначить', disabled: ws.length >= slots[job] || b.state === 'destroyed', onclick: () => {
          const idle = this.villagers().find(v => (v.job || 'idle') === 'idle');
          if (!idle) { this.ui.toast('Нет свободных жителей', 'bad'); return; }
          this.assign(idle, b, job);
        } }, glyphImg('plus'))));
      box.append(row);
    }
    if (b.state !== 'complete') box.append(h('div.zc-note', 'Рабочие начнут трудиться, когда стройка завершится.'));
  }
  _jobsSig(b) { return b.state + '|' + workersOf(b).map(w => w.id + ':' + w.job).join(','); }
  _updateBuilding(b) {
    const I = this._ins;
    if (I.lvl) setText(I.lvl, 'Уровень ' + (b.level || 1) + ' · Население +' + (b.popBonus ?? 0) + ' · Строителей до ' + (this.game.village?.builderCap ?? '—'));
    setText(I.badge, STATE_LABELS[b.state] || b.state);
    I.badge.className = 'zc-badge s-' + b.state;
    const building = b.state === 'planned' || b.state === 'constructing';
    toggle(I.prog.el, 'hidden', !building);
    if (building) I.prog.set(b.progress || 0, 1, Math.round((b.progress || 0) * 100) + '%');
    I.hp.set(b.hp ?? 0, b.maxHp || 1);
    if (this._jobsSig(b) !== I.jobsSig) this._renderBuildingJobs(b);
    if (b.state === 'destroyed') this.deselect();
  }
  _inspectVillager(el, v) {
    el.append(this._head(jobIcon(v.job || 'idle'), v.name || 'Житель', JOB_LABELS[v.job || 'idle']));
    const task = this._ins.task = h('div.zc-ins-task');
    const hp = this._ins.hp = bar('hp', 'Здоровье');
    const hu = this._ins.hunger = bar('hunger', 'Сытость');
    const wp = this._ins.wp = h('div.zc-ins-wp');
    el.append(task, hp.el, hu.el, wp, h('div.zc-ins-sub', 'Работа'), this._ins.sel = this.jobSelect(v));
    this._ins.job = v.job; this._ins.wpRef = v.workplace;
    this._updateVillager(v);
  }
  _updateVillager(v) {
    const I = this._ins;
    if (v.dead) { this.deselect(); return; }
    const p = this.game.player;
    if (this.game.mode !== 'command' && p && v.position.distanceTo(p.position) > 12) { this.deselect(); return; }
    setText(I.task, v.task || '…');
    I.hp.set(v.hp, v.maxHp);
    const f = this.hungerFrac(v); I.hunger.set(f, 1, Math.round(f * 100) + '%');
    const t = v.workplace ? (BUILDING_TYPES[v.workplace.type]?.name || v.workplace.type) : null;
    setText(I.wp, t ? 'Место работы: ' + t : (v.mood != null ? 'Настроение: ' + Math.round((v.mood > 1 ? v.mood : v.mood * 100)) + '%' : ''));
    if ((I.job !== v.job || I.wpRef !== v.workplace) && document.activeElement !== I.sel) this.renderInspector();
  }
  _inspectOther(el, e) {
    const zombie = e.kind === 'zombie' || e.faction === 'undead';
    const name = zombie ? (ZOMBIE_NAMES[e.type] || 'Зомби') : (e.name || e.kind);
    el.append(this._head(glyph(zombie ? 'skull' : 'people'), name, zombie ? 'Нежить' : ''));
    const hp = this._ins.hp = bar('hp', 'Здоровье');
    el.append(hp.el);
    this._updateOther(e);
  }
  _updateOther(e) { if (e.dead) { this.deselect(); return; } this._ins.hp.set(e.hp, e.maxHp); }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game;
    if (this.placing && g.village && 'placing' in g.village && !g.village.placing) this.endPlacement();
    // wave tab availability
    this._t += dt;
    if (this._t > 0.3) {
      this._t = 0;
      const busy = (g.waves?.activeCount || 0) > 0 || g.state.isNight;
      toggle(this.waveTab, 'disabled', busy);
    }
    if (this.tab === 'people') {
      this._peopleT += dt;
      if (this._peopleDirty || this._peopleT > 1) { this._peopleT = 0; this.renderPeople(false); }
    }
    if (this.selected) {
      this._insT += dt;
      if (this._insT > 0.2) {
        this._insT = 0;
        const s = this.selected;
        if (s.kind === 'building') this._updateBuilding(s.ref);
        else if (s.ref.kind === 'villager') this._updateVillager(s.ref);
        else this._updateOther(s.ref);
      }
    }
  }
}
