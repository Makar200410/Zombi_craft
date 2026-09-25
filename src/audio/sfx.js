// src/audio/sfx.js
// Fully procedural WebAudio sound engine for Zombi Craft. No audio files are
// loaded; every sound (SFX + generative ambient music) is synthesized with
// oscillators / filtered noise. Must be safe to import on a server or in a
// headless test: no AudioContext (or any DOM/window API) is touched at
// import time, and every public method is a no-op instead of throwing when
// WebAudio is unavailable or the context hasn't been unlocked yet.

const STORAGE_KEY = 'zc_audio';
const MAX_VOICES = 24;
const MAX_DIST = 60;
const PITCH_JITTER = 0.06; // +/-6%

// Ratios used by generative arpeggios / plucks (major pentatonic + octave).
const MAJOR_PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

function clamp01(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// Rotate the vector (x,y,z) by quaternion q ({x,y,z,w}). Avoids depending on
// THREE just for this; works with any THREE.Quaternion-like object.
function rotateVec(q, x, y, z) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return {
    x: x + qw * tx + (qy * tz - qz * ty),
    y: y + qw * ty + (qz * tx - qx * tz),
    z: z + qw * tz + (qx * ty - qy * tx),
  };
}

function getNoiseBuffer(ctx) {
  if (!ctx._zcNoiseBuffer) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    ctx._zcNoiseBuffer = buf;
  }
  return ctx._zcNoiseBuffer;
}

// A short oscillator "note" with a linear attack + exponential decay,
// optionally sweeping frequency. Returns its total duration in seconds.
function tone(ctx, out, now, opts = {}) {
  const {
    type = 'sine',
    freq = 440,
    freqEnd = null,
    duration = 0.2,
    attack = 0.005,
    decay = null,
    gainPeak = 0.3,
    detune = 0,
  } = opts;
  const d = decay != null ? decay : duration;
  const osc = ctx.createOscillator();
  osc.type = type;
  const f0 = Math.max(1, freq);
  osc.frequency.setValueAtTime(f0, now);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + Math.max(0.01, duration));
  }
  if (detune) osc.detune.setValueAtTime(detune, now);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, gainPeak), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + d);
  osc.connect(g);
  g.connect(out);
  osc.start(now);
  osc.stop(now + attack + d + 0.03);
  return attack + d;
}

// A burst of white noise through a resonant filter (optionally sweeping the
// filter's cutoff), with its own attack/decay envelope. Returns duration.
function noiseBurst(ctx, out, now, opts = {}) {
  const {
    duration = 0.15,
    filterType = 'bandpass',
    freq = 1200,
    freqEnd = null,
    Q = 1,
    gainPeak = 0.3,
    attack = 0.002,
  } = opts;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  const f0 = Math.max(20, freq);
  filt.frequency.setValueAtTime(f0, now);
  filt.Q.value = Q;
  if (freqEnd != null) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + Math.max(0.01, duration));
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, gainPeak), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filt);
  filt.connect(g);
  g.connect(out);
  src.start(now);
  src.stop(now + duration + 0.03);
  return duration;
}

// name -> (ctx, out, {pitch, now}) -> duration(seconds)
// `out` is the per-voice GainNode the builder should connect its layers to.
const SOUND_BUILDERS = {
  step_grass(ctx, out, { pitch, now }) {
    return noiseBurst(ctx, out, now, { duration: 0.09, filterType: 'bandpass', freq: 900 * pitch, Q: 0.8, gainPeak: 0.32 });
  },
  step_stone(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.06, filterType: 'highpass', freq: 1500 * pitch, Q: 0.7, gainPeak: 0.28 });
    const d2 = tone(ctx, out, now, { type: 'square', freq: 180 * pitch, duration: 0.04, attack: 0.001, decay: 0.04, gainPeak: 0.1 });
    return Math.max(d1, d2);
  },
  step_wood(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 150 * pitch, duration: 0.07, attack: 0.002, decay: 0.07, gainPeak: 0.22 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.06, filterType: 'bandpass', freq: 700 * pitch, Q: 1, gainPeak: 0.18 });
    return Math.max(d1, d2);
  },
  dig_dirt(ctx, out, { pitch, now }) {
    return noiseBurst(ctx, out, now, { duration: 0.22, filterType: 'bandpass', freq: 500 * pitch, freqEnd: 300 * pitch, Q: 0.6, gainPeak: 0.38, attack: 0.01 });
  },
  dig_stone(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.14, filterType: 'highpass', freq: 2000 * pitch, Q: 1, gainPeak: 0.3 });
    const d2 = tone(ctx, out, now, { type: 'sine', freq: 900 * pitch, freqEnd: 500 * pitch, duration: 0.08, attack: 0.001, decay: 0.08, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  dig_wood(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 140 * pitch, duration: 0.12, attack: 0.003, decay: 0.12, gainPeak: 0.2 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.15, filterType: 'bandpass', freq: 600 * pitch, Q: 1.2, gainPeak: 0.24 });
    return Math.max(d1, d2);
  },
  break_block(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.28, filterType: 'bandpass', freq: 1400 * pitch, freqEnd: 250 * pitch, Q: 0.7, gainPeak: 0.5, attack: 0.002 });
    const d2 = tone(ctx, out, now, { type: 'square', freq: 220 * pitch, freqEnd: 80 * pitch, duration: 0.18, attack: 0.001, decay: 0.18, gainPeak: 0.22 });
    return Math.max(d1, d2);
  },
  place_block(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 220 * pitch, freqEnd: 130 * pitch, duration: 0.1, attack: 0.002, decay: 0.1, gainPeak: 0.32 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.05, filterType: 'lowpass', freq: 900 * pitch, Q: 0.7, gainPeak: 0.22 });
    return Math.max(d1, d2);
  },
  swing(ctx, out, { pitch, now }) {
    return noiseBurst(ctx, out, now, { duration: 0.14, filterType: 'bandpass', freq: 2500 * pitch, freqEnd: 900 * pitch, Q: 0.6, gainPeak: 0.2, attack: 0.001 });
  },
  hit_flesh(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 150 * pitch, freqEnd: 70 * pitch, duration: 0.12, attack: 0.001, decay: 0.12, gainPeak: 0.38 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.08, filterType: 'lowpass', freq: 600 * pitch, Q: 0.6, gainPeak: 0.18 });
    return Math.max(d1, d2);
  },
  hit_zombie(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 130 * pitch, freqEnd: 60 * pitch, duration: 0.13, attack: 0.001, decay: 0.13, gainPeak: 0.32 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.12, filterType: 'bandpass', freq: 900 * pitch, freqEnd: 300 * pitch, Q: 1.4, gainPeak: 0.28 });
    return Math.max(d1, d2);
  },
  bow_shoot(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 500 * pitch, freqEnd: 1400 * pitch, duration: 0.09, attack: 0.001, decay: 0.09, gainPeak: 0.28 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.06, filterType: 'highpass', freq: 2000 * pitch, Q: 0.8, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  arrow_hit(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.06, filterType: 'bandpass', freq: 2200 * pitch, Q: 1.5, gainPeak: 0.32 });
    const d2 = tone(ctx, out, now, { type: 'triangle', freq: 600 * pitch, freqEnd: 200 * pitch, duration: 0.05, attack: 0.001, decay: 0.05, gainPeak: 0.18 });
    return Math.max(d1, d2);
  },
  crossbow_shoot(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.04, filterType: 'highpass', freq: 3000 * pitch, Q: 1, gainPeak: 0.28 });
    const d2 = tone(ctx, out, now, { type: 'square', freq: 700 * pitch, freqEnd: 1800 * pitch, duration: 0.06, attack: 0.0005, decay: 0.06, gainPeak: 0.22 });
    return Math.max(d1, d2);
  },
  musket_shot(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 90 * pitch, freqEnd: 40 * pitch, duration: 0.12, attack: 0.001, decay: 0.12, gainPeak: 0.55 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.5, filterType: 'lowpass', freq: 3500 * pitch, freqEnd: 400 * pitch, Q: 0.5, gainPeak: 0.5, attack: 0.001 });
    return Math.max(d1, d2);
  },
  blunderbuss_shot(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 70 * pitch, freqEnd: 35 * pitch, duration: 0.15, attack: 0.001, decay: 0.15, gainPeak: 0.5 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.65, filterType: 'lowpass', freq: 2500 * pitch, freqEnd: 250 * pitch, Q: 0.4, gainPeak: 0.55, attack: 0.002 });
    return Math.max(d1, d2);
  },
  explosion(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 60 * pitch, freqEnd: 30 * pitch, duration: 0.4, attack: 0.001, decay: 0.4, gainPeak: 0.65 });
    const d2 = noiseBurst(ctx, out, now, { duration: 1.1, filterType: 'lowpass', freq: 4000 * pitch, freqEnd: 200 * pitch, Q: 0.4, gainPeak: 0.6, attack: 0.003 });
    return Math.max(d1, d2);
  },
  fireball_cast(ctx, out, { pitch, now }) {
    let maxD = noiseBurst(ctx, out, now, { duration: 0.35, filterType: 'bandpass', freq: 600 * pitch, freqEnd: 2200 * pitch, Q: 0.7, gainPeak: 0.32, attack: 0.02 });
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.06 + Math.random() * 0.02;
      const d = noiseBurst(ctx, out, t, { duration: 0.03, filterType: 'highpass', freq: 3000 * pitch, Q: 2, gainPeak: 0.1 });
      maxD = Math.max(maxD, (t - now) + d);
    }
    return maxD;
  },
  fire_impact(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.3, filterType: 'bandpass', freq: 1500 * pitch, freqEnd: 400 * pitch, Q: 0.8, gainPeak: 0.38 });
    const d2 = tone(ctx, out, now, { type: 'sawtooth', freq: 300 * pitch, freqEnd: 100 * pitch, duration: 0.2, attack: 0.001, decay: 0.2, gainPeak: 0.18 });
    return Math.max(d1, d2);
  },
  frost_cast(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1800, 2200, 2700].forEach((f, i) => {
      const t = now + i * 0.02;
      const d = tone(ctx, out, t, { type: 'sine', freq: f * pitch, duration: 0.3, attack: 0.02, decay: 0.28, gainPeak: 0.11, detune: Math.random() * 10 - 5 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    const dn = noiseBurst(ctx, out, now, { duration: 0.25, filterType: 'highpass', freq: 3500 * pitch, Q: 0.7, gainPeak: 0.14, attack: 0.01 });
    return Math.max(maxD, dn);
  },
  frost_impact(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1500, 1900, 2400, 3000].forEach((f, i) => {
      const t = now + i * 0.015;
      const d = tone(ctx, out, t, { type: 'triangle', freq: f * pitch, duration: 0.18, attack: 0.001, decay: 0.17, gainPeak: 0.14 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    const dc = noiseBurst(ctx, out, now, { duration: 0.1, filterType: 'highpass', freq: 3000 * pitch, Q: 1, gainPeak: 0.18 });
    return Math.max(maxD, dc);
  },
  lightning(ctx, out, { pitch, now }) {
    let maxD = 0;
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.02 + Math.random() * 0.015;
      const d = noiseBurst(ctx, out, t, { duration: 0.02, filterType: 'highpass', freq: 4000 * pitch, Q: 3, gainPeak: 0.22 });
      maxD = Math.max(maxD, (t - now) + d);
    }
    const thunder = noiseBurst(ctx, out, now + 0.1, { duration: 1.6, filterType: 'lowpass', freq: 900 * pitch, freqEnd: 120 * pitch, Q: 0.4, gainPeak: 0.48, attack: 0.15 });
    return Math.max(maxD, 0.1 + thunder);
  },
  heal(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1, 5 / 4, 3 / 2, 2].forEach((r, i) => {
      const t = now + i * 0.09;
      const d = tone(ctx, out, t, { type: 'sine', freq: 392 * r * pitch, duration: 0.5, attack: 0.03, decay: 0.45, gainPeak: 0.16 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    return maxD;
  },
  meteor_fall(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sawtooth', freq: 1600 * pitch, freqEnd: 200 * pitch, duration: 1.3, attack: 0.05, decay: 1.25, gainPeak: 0.28 });
    const d2 = noiseBurst(ctx, out, now, { duration: 1.3, filterType: 'bandpass', freq: 2000 * pitch, freqEnd: 400 * pitch, Q: 0.5, gainPeak: 0.28, attack: 0.05 });
    return Math.max(d1, d2);
  },
  mana_empty(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'square', freq: 300 * pitch, duration: 0.08, attack: 0.001, decay: 0.08, gainPeak: 0.18 });
    const d2 = tone(ctx, out, now + 0.09, { type: 'square', freq: 180 * pitch, duration: 0.12, attack: 0.001, decay: 0.12, gainPeak: 0.18 });
    return Math.max(d1, 0.09 + d2);
  },
  zombie_groan(ctx, out, { pitch, now }) {
    const base = (60 + Math.random() * 25) * pitch;
    const dur = 0.7 + Math.random() * 0.6;
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.setValueAtTime(base, now);
    const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(base * 1.5, now); osc2.detune.setValueAtTime(-15, now);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 3 + Math.random() * 2;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = base * 0.15;
    lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);
    const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = base * 4; filt.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc1.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(out);
    osc1.start(now); osc2.start(now); lfo.start(now);
    osc1.stop(now + dur + 0.05); osc2.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
    return dur;
  },
  zombie_hurt(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sawtooth', freq: 140 * pitch, freqEnd: 90 * pitch, duration: 0.18, attack: 0.001, decay: 0.18, gainPeak: 0.28 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.1, filterType: 'bandpass', freq: 700 * pitch, Q: 1, gainPeak: 0.18 });
    return Math.max(d1, d2);
  },
  zombie_die(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sawtooth', freq: 110 * pitch, freqEnd: 35 * pitch, duration: 0.7, attack: 0.005, decay: 0.68, gainPeak: 0.32 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.4, filterType: 'lowpass', freq: 800 * pitch, freqEnd: 150 * pitch, Q: 0.5, gainPeak: 0.24 });
    return Math.max(d1, d2);
  },
  zombie_spit(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.14, filterType: 'bandpass', freq: 1200 * pitch, freqEnd: 400 * pitch, Q: 2, gainPeak: 0.32 });
    const d2 = tone(ctx, out, now, { type: 'sawtooth', freq: 400 * pitch, freqEnd: 150 * pitch, duration: 0.1, attack: 0.001, decay: 0.1, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  villager_hmm(ctx, out, { pitch, now }) {
    return tone(ctx, out, now, { type: 'triangle', freq: 400 * pitch, freqEnd: 520 * pitch, duration: 0.18, attack: 0.01, decay: 0.16, gainPeak: 0.24 });
  },
  villager_hurt(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 500 * pitch, freqEnd: 350 * pitch, duration: 0.15, attack: 0.001, decay: 0.15, gainPeak: 0.26 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.08, filterType: 'bandpass', freq: 1500 * pitch, Q: 1, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  player_hurt(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 160 * pitch, freqEnd: 80 * pitch, duration: 0.18, attack: 0.001, decay: 0.18, gainPeak: 0.38 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.1, filterType: 'lowpass', freq: 700 * pitch, Q: 0.6, gainPeak: 0.24 });
    return Math.max(d1, d2);
  },
  chop(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 180 * pitch, freqEnd: 110 * pitch, duration: 0.09, attack: 0.001, decay: 0.09, gainPeak: 0.38 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.06, filterType: 'bandpass', freq: 1000 * pitch, Q: 1.2, gainPeak: 0.28 });
    return Math.max(d1, d2);
  },
  pick_hit(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 1800 * pitch, freqEnd: 900 * pitch, duration: 0.07, attack: 0.001, decay: 0.07, gainPeak: 0.24 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.03, filterType: 'highpass', freq: 3000 * pitch, Q: 2, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  hammer(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'triangle', freq: 200 * pitch, freqEnd: 120 * pitch, duration: 0.08, attack: 0.001, decay: 0.08, gainPeak: 0.34 });
    const d2 = tone(ctx, out, now + 0.1, { type: 'triangle', freq: 190 * pitch, freqEnd: 110 * pitch, duration: 0.08, attack: 0.001, decay: 0.08, gainPeak: 0.3 });
    return Math.max(d1, 0.1 + d2);
  },
  harvest(ctx, out, { pitch, now }) {
    return noiseBurst(ctx, out, now, { duration: 0.2, filterType: 'bandpass', freq: 1400 * pitch, freqEnd: 900 * pitch, Q: 0.7, gainPeak: 0.24, attack: 0.01 });
  },
  coins(ctx, out, { pitch, now }) {
    let maxD = 0;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = now + i * 0.045;
      const f = (1800 + Math.random() * 800) * pitch;
      const d = tone(ctx, out, t, { type: 'triangle', freq: f, duration: 0.12, attack: 0.001, decay: 0.11, gainPeak: 0.16 });
      maxD = Math.max(maxD, (t - now) + d);
    }
    return maxD;
  },
  ui_click(ctx, out, { pitch, now }) {
    return tone(ctx, out, now, { type: 'square', freq: 1000 * pitch, duration: 0.02, attack: 0.0005, decay: 0.02, gainPeak: 0.14 });
  },
  ui_open(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 500 * pitch, duration: 0.09, attack: 0.005, decay: 0.08, gainPeak: 0.18 });
    const d2 = tone(ctx, out, now + 0.05, { type: 'sine', freq: 750 * pitch, duration: 0.1, attack: 0.005, decay: 0.09, gainPeak: 0.18 });
    return Math.max(d1, 0.05 + d2);
  },
  ui_close(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 750 * pitch, duration: 0.09, attack: 0.005, decay: 0.08, gainPeak: 0.18 });
    const d2 = tone(ctx, out, now + 0.05, { type: 'sine', freq: 500 * pitch, duration: 0.1, attack: 0.005, decay: 0.09, gainPeak: 0.18 });
    return Math.max(d1, 0.05 + d2);
  },
  research_done(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1, 1.125, 1.25, 1.5, 2].forEach((r, i) => {
      const t = now + i * 0.09;
      const d = tone(ctx, out, t, { type: 'triangle', freq: 523.25 * r * pitch, duration: 0.35, attack: 0.005, decay: 0.32, gainPeak: 0.2 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    return maxD;
  },
  build_complete(ctx, out, { pitch, now }) {
    let maxD = 0;
    [[1, 1.25, 1.5], [1.125, 1.4, 1.6667]].forEach((chord, ci) => {
      const t = now + ci * 0.16;
      chord.forEach((r) => {
        const d = tone(ctx, out, t, { type: 'sawtooth', freq: 196 * r * pitch, duration: 0.3, attack: 0.005, decay: 0.28, gainPeak: 0.12 });
        maxD = Math.max(maxD, (t - now) + d);
      });
    });
    return maxD;
  },
  wave_horn(ctx, out, { pitch, now }) {
    const dur = 1.8;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(80 * pitch, now);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(80 * pitch * 1.02, now); o2.detune.setValueAtTime(-12, now);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 4.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 3;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500 * pitch; filt.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.3);
    g.gain.setValueAtTime(0.5, now + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(out);
    o1.start(now); o2.start(now); lfo.start(now);
    o1.stop(now + dur + 0.05); o2.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
    return dur;
  },
  wave_cleared(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1, 1.25, 1.5, 2].forEach((r, i) => {
      const t = now + i * 0.1;
      const d = tone(ctx, out, t, { type: 'sawtooth', freq: 261.63 * r * pitch, duration: 0.4, attack: 0.005, decay: 0.38, gainPeak: 0.18 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    for (let i = 0; i < 3; i++) {
      const t = now + 0.4 + i * 0.06;
      const d = tone(ctx, out, t, { type: 'triangle', freq: (2000 + i * 400) * pitch, duration: 0.15, attack: 0.002, decay: 0.14, gainPeak: 0.12 });
      maxD = Math.max(maxD, (t - now) + d);
    }
    return maxD;
  },
  level_up(ctx, out, { pitch, now }) {
    let maxD = 0;
    [1, 1.25, 1.5, 2].forEach((r, i) => {
      const t = now + i * 0.06;
      const d = tone(ctx, out, t, { type: 'square', freq: 440 * r * pitch, duration: 0.15, attack: 0.002, decay: 0.14, gainPeak: 0.18 });
      maxD = Math.max(maxD, (t - now) + d);
    });
    return maxD;
  },
  splash(ctx, out, { pitch, now }) {
    const d1 = noiseBurst(ctx, out, now, { duration: 0.3, filterType: 'bandpass', freq: 1200 * pitch, freqEnd: 400 * pitch, Q: 0.8, gainPeak: 0.34, attack: 0.005 });
    const d2 = tone(ctx, out, now, { type: 'sine', freq: 300 * pitch, freqEnd: 120 * pitch, duration: 0.15, attack: 0.001, decay: 0.15, gainPeak: 0.14 });
    return Math.max(d1, d2);
  },
  death(ctx, out, { pitch, now }) {
    const d1 = tone(ctx, out, now, { type: 'sine', freq: 220 * pitch, freqEnd: 60 * pitch, duration: 1.0, attack: 0.01, decay: 0.95, gainPeak: 0.34 });
    const d2 = noiseBurst(ctx, out, now, { duration: 0.5, filterType: 'lowpass', freq: 600 * pitch, freqEnd: 100 * pitch, Q: 0.5, gainPeak: 0.2, attack: 0.05 });
    return Math.max(d1, d2);
  },
};

export class Audio {
  constructor(game) {
    this.game = game;

    this.ctx = null;
    this.unlocked = false;

    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.listener = null;

    this.voices = []; // active SFX voices: {output, panner, endTime}
    this.warned = new Set(); // unknown sound names we've already warned about

    this.volumes = { master: 1, music: 0.6, sfx: 1 };
    this._loadVolumes();

    // Generative ambient music state.
    this._mood = 'day';
    this._moodGains = null;
    this._musicNextEventAt = 0;

    this._unlockHandler = null;
    this._registerUnlockListeners();
  }

  // Called once after all game systems are constructed. Intentionally does
  // almost nothing: creating an AudioContext before a user gesture is
  // blocked by browsers anyway, so real setup happens in unlock().
  init() {
    if (this.unlocked && !this.master) {
      try { this._buildGraph(); } catch (e) { /* never throw */ }
    }
  }

  _registerUnlockListeners() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const handler = () => this.unlock();
    this._unlockHandler = handler;
    try {
      window.addEventListener('pointerdown', handler, { once: true, passive: true });
      window.addEventListener('keydown', handler, { once: true });
      window.addEventListener('touchstart', handler, { once: true, passive: true });
    } catch (e) { /* never throw */ }
  }

  // Call on the first user gesture (also self-registered above). Creates
  // the AudioContext and resumes it; safe to call repeatedly.
  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this._buildGraph();
      this.unlocked = true;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      this.ctx = null;
      this.unlocked = false;
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.master);

    this.listener = ctx.listener;

    try { this._initMusic(); } catch (e) { /* never throw */ }
  }

  // ---- SFX -----------------------------------------------------------

  play(name, opts = {}) {
    try {
      if (!this.ctx || !this.unlocked || !this.sfxBus) return;
      const builder = SOUND_BUILDERS[name];
      if (!builder) {
        if (!this.warned.has(name)) {
          this.warned.add(name);
          console.warn(`[audio] unknown sound "${name}"`);
        }
        return;
      }

      const { pos = null, volume = 1, pitch = 1 } = opts;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      if (pos && this.game && this.game.camera && this.game.camera.position) {
        const cp = this.game.camera.position;
        const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > MAX_DIST) return;
      }

      this._pruneVoices(now);
      if (this.voices.length >= MAX_VOICES) {
        const oldest = this.voices.shift();
        if (oldest) this._stopVoice(oldest, now);
      }

      const jitteredPitch = Math.max(0.1, pitch * (1 + (Math.random() * 2 - 1) * PITCH_JITTER));
      const vol = clamp01(volume);

      const output = ctx.createGain();
      output.gain.value = vol;

      let panner = null;
      if (pos) {
        panner = ctx.createPanner();
        panner.panningModel = (this.game && this.game.isTouch) ? 'equalpower' : 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 2;
        panner.maxDistance = MAX_DIST;
        panner.rolloffFactor = 1.3;
        try {
          if (panner.positionX) {
            panner.positionX.value = pos.x;
            panner.positionY.value = pos.y;
            panner.positionZ.value = pos.z;
          } else if (panner.setPosition) {
            panner.setPosition(pos.x, pos.y, pos.z);
          }
        } catch (e) { /* ignore */ }
        output.connect(panner);
        panner.connect(this.sfxBus);
      } else {
        output.connect(this.sfxBus);
      }

      let duration = 0.3;
      try {
        const d = builder(ctx, output, { pitch: jitteredPitch, now });
        if (typeof d === 'number' && Number.isFinite(d) && d > 0) duration = d;
      } catch (e) {
        try { output.disconnect(); } catch (e2) { /* ignore */ }
        if (panner) { try { panner.disconnect(); } catch (e2) { /* ignore */ } }
        return;
      }

      this.voices.push({ output, panner, endTime: now + duration + 0.2 });
    } catch (e) {
      // Audio must never throw into gameplay code.
    }
  }

  _pruneVoices(now) {
    this.voices = this.voices.filter((v) => {
      if (v.endTime <= now) {
        try { v.output.disconnect(); } catch (e) { /* ignore */ }
        if (v.panner) { try { v.panner.disconnect(); } catch (e) { /* ignore */ } }
        return false;
      }
      return true;
    });
  }

  _stopVoice(voice, now) {
    try {
      voice.output.gain.cancelScheduledValues(now);
      voice.output.gain.setValueAtTime(voice.output.gain.value, now);
      voice.output.gain.linearRampToValueAtTime(0, now + 0.03);
    } catch (e) { /* ignore */ }
    setTimeout(() => {
      try { voice.output.disconnect(); } catch (e) { /* ignore */ }
      if (voice.panner) { try { voice.panner.disconnect(); } catch (e) { /* ignore */ } }
    }, 60);
  }

  // ---- Per-frame update: listener pose + ambient music ---------------

  update(dt) {
    if (!this.ctx || !this.unlocked) return;
    try { this._updateListener(); } catch (e) { /* ignore */ }
    try { this._updateMusic(dt); } catch (e) { /* ignore */ }
  }

  _updateListener() {
    const cam = this.game && this.game.camera;
    const listener = this.listener;
    if (!cam || !listener || !cam.position || !cam.quaternion) return;
    const p = cam.position;
    const q = cam.quaternion;
    try {
      if (listener.positionX) {
        listener.positionX.value = p.x;
        listener.positionY.value = p.y;
        listener.positionZ.value = p.z;
      } else if (listener.setPosition) {
        listener.setPosition(p.x, p.y, p.z);
      }
      const fwd = rotateVec(q, 0, 0, -1);
      const up = rotateVec(q, 0, 1, 0);
      if (listener.forwardX) {
        listener.forwardX.value = fwd.x;
        listener.forwardY.value = fwd.y;
        listener.forwardZ.value = fwd.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      } else if (listener.setOrientation) {
        listener.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    } catch (e) { /* ignore */ }
  }

  // ---- Generative ambient music ---------------------------------------

  _initMusic() {
    const ctx = this.ctx;
    this._moodGains = {
      day: ctx.createGain(),
      night: ctx.createGain(),
      wave: ctx.createGain(),
    };
    this._mood = 'day';
    for (const k in this._moodGains) {
      this._moodGains[k].gain.value = (k === 'day') ? 1 : 0;
      this._moodGains[k].connect(this.musicBus);
    }

    // Continuous soft night pad (two low sines a minor-ish interval apart).
    const nd1 = ctx.createOscillator(); nd1.type = 'sine'; nd1.frequency.value = 55;
    const nd2 = ctx.createOscillator(); nd2.type = 'sine'; nd2.frequency.value = 65.4;
    const ndGain = ctx.createGain(); ndGain.gain.value = 0.22;
    nd1.connect(ndGain); nd2.connect(ndGain); ndGain.connect(this._moodGains.night);
    nd1.start(); nd2.start();

    // Continuous low pulsing drone used during zombie waves for tension.
    const wd = ctx.createOscillator(); wd.type = 'sine'; wd.frequency.value = 42;
    const wdGain = ctx.createGain(); wdGain.gain.value = 0.15;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 1.4;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.13;
    lfo.connect(lfoGain); lfoGain.connect(wdGain.gain);
    wd.connect(wdGain); wdGain.connect(this._moodGains.wave);
    wd.start(); lfo.start();

    this._musicNextEventAt = ctx.currentTime + 1;
  }

  _computeMood() {
    try {
      const waves = this.game && this.game.waves;
      if (waves && typeof waves.activeCount === 'number' && waves.activeCount > 0) return 'wave';
      const st = this.game && this.game.state;
      if (st && st.isNight) return 'night';
      return 'day';
    } catch (e) {
      return 'day';
    }
  }

  _updateMusic() {
    const ctx = this.ctx;
    if (!ctx || !this._moodGains) return;

    const mood = this._computeMood();
    if (mood !== this._mood) {
      this._mood = mood;
      const now = ctx.currentTime;
      for (const k in this._moodGains) {
        const g = this._moodGains[k].gain;
        const target = k === mood ? 1 : 0;
        try {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(target, now + 2.5);
        } catch (e) { /* ignore */ }
      }
    }

    const lookahead = 0.25;
    let guard = 0;
    while (this._musicNextEventAt < ctx.currentTime + lookahead && guard < 8) {
      try { this._scheduleMusicEvent(this._musicNextEventAt, mood); } catch (e) { /* ignore */ }
      this._musicNextEventAt += this._musicEventInterval(mood);
      guard++;
    }
  }

  _musicEventInterval(mood) {
    if (mood === 'day') return 1.6 + Math.random() * 2.2;
    if (mood === 'night') return 2.2 + Math.random() * 2.8;
    if (mood === 'wave') return 0.45 + Math.random() * 0.3;
    return 2;
  }

  _scheduleMusicEvent(t, mood) {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!bus) return;
    if (mood === 'day') {
      if (Math.random() < 0.8) {
        const r = MAJOR_PENTA[Math.floor(Math.random() * MAJOR_PENTA.length)];
        tone(ctx, bus, t, { type: 'triangle', freq: 196 * r, duration: 1.4, attack: 0.02, decay: 1.3, gainPeak: 0.1 });
      } else {
        tone(ctx, bus, t, { type: 'sine', freq: 2600 + Math.random() * 700, freqEnd: 3200 + Math.random() * 500, duration: 0.12, attack: 0.005, decay: 0.1, gainPeak: 0.05 });
      }
    } else if (mood === 'night') {
      if (Math.random() < 0.6) {
        noiseBurst(ctx, bus, t, { duration: 0.05, filterType: 'bandpass', freq: 4500 + Math.random() * 1500, Q: 6, gainPeak: 0.05 });
        noiseBurst(ctx, bus, t + 0.07, { duration: 0.05, filterType: 'bandpass', freq: 4500 + Math.random() * 1500, Q: 6, gainPeak: 0.05 });
      } else {
        const r = [1, 6 / 5, 3 / 2][Math.floor(Math.random() * 3)];
        tone(ctx, bus, t, { type: 'sine', freq: 110 * r, duration: 2.5, attack: 0.5, decay: 2.3, gainPeak: 0.06 });
      }
    } else if (mood === 'wave') {
      tone(ctx, bus, t, { type: 'sine', freq: 85, freqEnd: 55, duration: 0.25, attack: 0.001, decay: 0.24, gainPeak: 0.18 });
      noiseBurst(ctx, bus, t, { duration: 0.06, filterType: 'lowpass', freq: 400, Q: 0.6, gainPeak: 0.1 });
      if (Math.random() < 0.2) {
        tone(ctx, bus, t + 0.05, { type: 'sawtooth', freq: 1400 + Math.random() * 300, duration: 0.2, attack: 0.005, decay: 0.18, gainPeak: 0.06 });
      }
    }
  }

  // ---- Volumes (persisted) --------------------------------------------

  _loadVolumes() {
    this.volumes = { master: 1, music: 0.6, sfx: 1 };
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (typeof obj.master === 'number') this.volumes.master = clamp01(obj.master);
        if (typeof obj.music === 'number') this.volumes.music = clamp01(obj.music);
        if (typeof obj.sfx === 'number') this.volumes.sfx = clamp01(obj.sfx);
      }
    } catch (e) { /* ignore */ }
  }

  _saveVolumes() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch (e) { /* ignore */ }
  }

  setMasterVolume(v) {
    this.volumes.master = clamp01(v);
    if (this.ctx && this.master) {
      try {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(this.volumes.master, now + 0.05);
      } catch (e) { /* ignore */ }
    }
    this._saveVolumes();
  }

  setMusicVolume(v) {
    this.volumes.music = clamp01(v);
    if (this.ctx && this.musicBus) {
      try {
        const now = this.ctx.currentTime;
        this.musicBus.gain.cancelScheduledValues(now);
        this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
        this.musicBus.gain.linearRampToValueAtTime(this.volumes.music, now + 0.05);
      } catch (e) { /* ignore */ }
    }
    this._saveVolumes();
  }

  setSfxVolume(v) {
    this.volumes.sfx = clamp01(v);
    if (this.ctx && this.sfxBus) {
      try {
        const now = this.ctx.currentTime;
        this.sfxBus.gain.cancelScheduledValues(now);
        this.sfxBus.gain.setValueAtTime(this.sfxBus.gain.value, now);
        this.sfxBus.gain.linearRampToValueAtTime(this.volumes.sfx, now + 0.05);
      } catch (e) { /* ignore */ }
    }
    this._saveVolumes();
  }
}
