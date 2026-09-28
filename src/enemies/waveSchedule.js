// 100-wave campaign (ten undead eras of ten waves, one per age of the civilisation): which undead appear when,
// how many, how strong, and the bosses. The first ten waves keep their pace; after that the difficulty curve is
// stretched so wave 100 is as hard as the old wave 50. Waves past 100 keep scaling ("endless").
//
//  I Пробуждение (1–10)  walker → runner → crawler → spitter → armored
//  II Орда (11–20)       brute, exploder, skeleton archers, first necromancer
//  III Чума (21–30)      frost, digger          IV Кости (31–40)        burning, leaper
//  V Пламя (41–50)       screamer               VI Буря мёртвых (51–60) bigger mixed hordes
//  VII Великий голод (61–70) giants join        VIII Легион (71–80)     multiple bosses
//  IX Затмение (81–90)                           X Конец света (91–100)  everything at once, finale on 100

/** First wave each kind appears in (2 guaranteed copies on that wave) + base weight and max weight. */
export const INTRO = {
  walker: { wave: 1, w: 1.0, max: 1.0 },
  runner: { wave: 3, w: 0.18, max: 0.45 },
  crawler: { wave: 5, w: 0.12, max: 0.3 },
  spitter: { wave: 7, w: 0.1, max: 0.22 },
  armored: { wave: 9, w: 0.08, max: 0.25 },
  brute: { wave: 12, w: 0.05, max: 0.16 },
  exploder: { wave: 16, w: 0.06, max: 0.16 },
  skeleton: { wave: 20, w: 0.08, max: 0.22 },
  frost: { wave: 25, w: 0.07, max: 0.2 },
  digger: { wave: 31, w: 0.05, max: 0.14 },
  burning: { wave: 38, w: 0.07, max: 0.2 },
  leaper: { wave: 45, w: 0.06, max: 0.18 },
  screamer: { wave: 54, w: 0.03, max: 0.08 },
  giant: { wave: 63, w: 0.008, max: 0.03 },
  necromancer: { wave: 20, w: 0, max: 0 },          // boss only (see BOSSES)
};

/** Scripted bosses per wave. */
export const BOSSES = {
  20: ['necromancer'],
  30: ['necromancer'],
  40: ['necromancer', 'brute'],
  50: ['necromancer', 'necromancer'],
  60: ['necromancer', 'giant'],
  63: ['giant'],
  70: ['necromancer', 'necromancer', 'giant'],
  80: ['giant', 'giant', 'necromancer'],
  85: ['necromancer', 'necromancer', 'giant'],
  90: ['giant', 'giant', 'necromancer', 'necromancer'],
  95: ['giant', 'giant', 'giant'],
  100: ['necromancer', 'necromancer', 'necromancer', 'giant', 'giant', 'giant'],
};
/** The campaign's last wave. */
export const LAST_WAVE = 100;

export const ERAS = [
  { from: 1, name: 'Пробуждение' },
  { from: 11, name: 'Орда' },
  { from: 21, name: 'Чума' },
  { from: 31, name: 'Кости' },
  { from: 41, name: 'Пламя' },
  { from: 51, name: 'Буря мёртвых' },
  { from: 61, name: 'Великий голод' },
  { from: 71, name: 'Легион' },
  { from: 81, name: 'Затмение' },
  { from: 91, name: 'Конец света' },
  { from: 101, name: 'Бесконечная ночь' },
];
/** Difficulty-equivalent of wave n on the old 50-wave curve: the first ten waves as before, then half speed. */
const ease = (n) => n <= 10 ? n : 10 + (n - 10) * (40 / 90);
export function eraOf(n) { let e = ERAS[0]; for (const x of ERAS) if (n >= x.from) e = x; return e; }

/** Number of undead in wave n (before difficulty multiplier). */
export function countFor(n) {
  const siege = n % 10 === 0 ? 1.25 : 1;            // every 10th wave is a siege
  const m = ease(n);
  return Math.round((5 + m * 2.4 + m * m * 0.03) * siege);
}
/** Health / damage multipliers for wave n. */
export function hpScale(n) { const m = ease(n); return 1 + Math.max(0, m - 1) * 0.045 + Math.max(0, m - 30) * 0.02; }
export function dmgScale(n) { return 1 + Math.max(0, ease(n) - 1) * 0.022; }

/** Spawn weights for wave n: each kind ramps from its base weight to max over ~10 waves; walkers thin out. */
export function weightsFor(n) {
  const w = {};
  for (const [k, e] of Object.entries(INTRO)) {
    if (n < e.wave || e.max <= 0) continue;
    const t = Math.min(1, (n - e.wave) / 15);
    w[k] = e.w + (e.max - e.w) * t;
  }
  w.walker = Math.max(0.3, 1 - ease(n) * 0.014);
  return w;
}
/** Kinds introduced on wave n (shown with a hint). */
export function introducedOn(n) { return Object.keys(INTRO).filter(k => INTRO[k].wave === n && INTRO[k].max > 0); }

export const HINTS = {
  walker: 'медленные, но их много',
  runner: 'быстрые', crawler: 'мелкие и юркие', spitter: 'плюются кислотой издали', brute: 'ломают стены',
  armored: 'броня — бейте магией', exploder: 'взрываются у стен', frost: 'замедляют ударом, не боятся льда',
  skeleton: 'стреляют из луков', burning: 'поджигают, не боятся огня', leaper: 'перепрыгивают стены',
  screamer: 'ускоряют и усиливают соседей', digger: 'быстро роют стены', giant: 'огромный и очень прочный',
  necromancer: 'поднимает мёртвых', mutant: 'живучие, заращивают раны', irradiated: 'излучение жжёт всех рядом', nanite: 'заращивается мгновенно — бейте очередями', nano_titan: 'босс: броня, регенерация, молнии не берут', swarm: 'крошечные, приходят тучами', hacker: 'глушат турели, дроны и тесла-башни', conductor: 'быстрые, молнии и свет им нипочём',
};
