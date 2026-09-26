// 50-wave campaign: which undead appear when, how many, how strong, and the bosses.
// Waves past 50 keep scaling ("endless").
//
//  Эпоха I   (1–10)  Пробуждение   walker → runner → crawler → spitter → armored
//  Эпоха II  (11–20) Орда          brute, exploder, skeleton archers, first necromancer, frost
//  Эпоха III (21–30) Чума          digger, burning, leaper, screamer
//  Эпоха IV  (31–40) Буря мёртвых  giants join, bigger mixed hordes
//  Эпоха V   (41–50) Конец света   everything at once, multiple bosses, finale on 50

/** First wave each kind appears in (2 guaranteed copies on that wave) + base weight and max weight. */
export const INTRO = {
  walker: { wave: 1, w: 1.0, max: 1.0 },
  runner: { wave: 3, w: 0.18, max: 0.45 },
  crawler: { wave: 5, w: 0.12, max: 0.3 },
  spitter: { wave: 7, w: 0.1, max: 0.22 },
  armored: { wave: 9, w: 0.08, max: 0.25 },
  brute: { wave: 11, w: 0.05, max: 0.16 },
  exploder: { wave: 13, w: 0.06, max: 0.16 },
  skeleton: { wave: 15, w: 0.08, max: 0.22 },
  frost: { wave: 17, w: 0.07, max: 0.2 },
  digger: { wave: 20, w: 0.05, max: 0.14 },
  burning: { wave: 23, w: 0.07, max: 0.2 },
  leaper: { wave: 26, w: 0.06, max: 0.18 },
  screamer: { wave: 30, w: 0.03, max: 0.08 },
  giant: { wave: 34, w: 0.008, max: 0.03 },
  necromancer: { wave: 15, w: 0, max: 0 },          // boss only (see BOSSES)
};

/** Scripted bosses per wave. */
export const BOSSES = {
  15: ['necromancer'],
  20: ['necromancer'],
  25: ['necromancer'],
  30: ['necromancer', 'giant'],
  34: ['giant'],
  35: ['necromancer', 'necromancer'],
  40: ['giant', 'giant', 'necromancer'],
  45: ['necromancer', 'necromancer', 'giant'],
  48: ['giant', 'giant'],
  50: ['necromancer', 'necromancer', 'necromancer', 'giant', 'giant', 'giant'],
};

export const ERAS = [
  { from: 1, name: 'Пробуждение' },
  { from: 11, name: 'Орда' },
  { from: 21, name: 'Чума' },
  { from: 31, name: 'Буря мёртвых' },
  { from: 41, name: 'Конец света' },
  { from: 51, name: 'Бесконечная ночь' },
];
export function eraOf(n) { let e = ERAS[0]; for (const x of ERAS) if (n >= x.from) e = x; return e; }

/** Number of undead in wave n (before difficulty multiplier). */
export function countFor(n) {
  const siege = n % 10 === 0 ? 1.25 : 1;            // every 10th wave is a siege
  return Math.round((5 + n * 2.4 + n * n * 0.03) * siege);
}
/** Health / damage multipliers for wave n. */
export function hpScale(n) { return 1 + Math.max(0, n - 1) * 0.045 + Math.max(0, n - 30) * 0.02; }
export function dmgScale(n) { return 1 + Math.max(0, n - 1) * 0.022; }

/** Spawn weights for wave n: each kind ramps from its base weight to max over ~10 waves; walkers thin out. */
export function weightsFor(n) {
  const w = {};
  for (const [k, e] of Object.entries(INTRO)) {
    if (n < e.wave || e.max <= 0) continue;
    const t = Math.min(1, (n - e.wave) / 10);
    w[k] = e.w + (e.max - e.w) * t;
  }
  w.walker = Math.max(0.3, 1 - n * 0.014);
  return w;
}
/** Kinds introduced on wave n (shown with a hint). */
export function introducedOn(n) { return Object.keys(INTRO).filter(k => INTRO[k].wave === n && INTRO[k].max > 0); }

export const HINTS = {
  runner: 'быстрые', crawler: 'мелкие и юркие', spitter: 'плюются кислотой издали', brute: 'ломают стены',
  armored: 'броня — бейте магией', exploder: 'взрываются у стен', frost: 'замедляют ударом, не боятся льда',
  skeleton: 'стреляют из луков', burning: 'поджигают, не боятся огня', leaper: 'перепрыгивают стены',
  screamer: 'ускоряют и усиливают соседей', digger: 'быстро роют стены', giant: 'огромный и очень прочный',
  necromancer: 'поднимает мёртвых',
};
