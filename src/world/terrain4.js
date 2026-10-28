// Format-4 terrain: the deep format-3 world, 16 km across, with the sites of the rival villages (see
// src/systems/rivals.js) levelled into flat, tree-free plateaus. Sites are picked from the seed alone, so the
// generator and the rivals agree on them without any saved data.
import { mulberry32 } from '../core/rng.js';
import { TerrainGen } from './terrain.js';

export const SITE_FLAT = 58;      // fully flat within this radius of a site
const SITE_BLEND = 84;            // and blended back into the land by here
const SITES = 8;

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class TerrainGen4 extends TerrainGen {
  constructor(world) {
    super(world);
    this.sites = this._pickSites();
  }

  /** Rival village sites: one per direction, 320–840 blocks out, on dry and fairly even land. */
  _pickSites() {
    const rnd = mulberry32((this.seed ^ 0x51735) >>> 0), sea = this.sea, out = [];
    for (let i = 0; i < SITES; i++) {
      const a0 = (i / SITES) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const r0 = 320 + rnd() * 520;
      let best = null;
      for (let t = 0; t < 90 && !best; t++) {
        const spread = 1 + t / 30;          // look further around the wanted spot when it is under water
        const a = a0 + (rnd() - 0.5) * 0.35 * spread, r = Math.max(300, r0 + (rnd() - 0.5) * 160 * spread);
        const x = Math.round(this.cx + Math.cos(a) * r), z = Math.round(this.cz + Math.sin(a) * r);
        if (out.some(o => Math.hypot(o.x - x, o.z - z) < 240)) continue;     // villages keep their distance
        const hs = [];
        let wet = false;
        for (let k = 0; k < 13; k++) {
          const ang = k / 12 * Math.PI * 2, rr = k ? 34 : 0;
          const c = super.column(Math.round(x + Math.cos(ang) * rr), Math.round(z + Math.sin(ang) * rr));
          hs.push(c.h); if (c.h <= sea + 1 || c.b === 8) wet = true;
        }
        if (wet) continue;
        hs.sort((p, q) => p - q);
        if (hs[hs.length - 1] - hs[0] > 18) continue;
        best = { x, z, h: hs[hs.length >> 1] };
      }
      if (best) out.push({ i, ...best });
    }
    return out;
  }

  column(x, z) {
    const c = super.column(x, z);
    for (const s of this.sites) {
      const dx = x - s.x, dz = z - s.z;
      if (dx > SITE_BLEND || dx < -SITE_BLEND || dz > SITE_BLEND || dz < -SITE_BLEND) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= SITE_BLEND) continue;
      const k = 1 - smoothstep(SITE_FLAT, SITE_BLEND, d);
      c.h = Math.round(c.h * (1 - k) + s.h * k);
      // a village clearing: no forest, no cave mouths, no trees (the generator treats it like the home village)
      if (d < SITE_FLAT + 6) { if (c.b === 1 || c.b === 5 || c.b === 2 || c.b === 4) c.b = 0; c.dist = Math.min(c.dist, d * 0.3); }
    }
    return c;
  }
}
