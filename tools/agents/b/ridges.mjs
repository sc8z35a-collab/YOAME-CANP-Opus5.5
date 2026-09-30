// every road: worst terrain bump above its own bed within the van's half-width (junction ridges ground the hull)
import { T, R } from './h.mjs';
for (const r of R.ROADS) { let worst = 0, at = -1, cross = 0, cat = -1;
  for (let i = 0; i < r.s.length - 1; i++) { const a = r.s[i], b = r.s[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
    if (a.bridge || b.bridge) continue;
    for (const t of [0, 0.5]) { const bed = a.h + (b.h - a.h) * t, hs = [-1.2, 0, 1.2].map(o => T.heightAt(a.x + (b.x - a.x) * t + nx * o, a.z + (b.z - a.z) * t + nz * o) - bed);
      const e = Math.max(...hs); if (e > worst) { worst = e; at = i + t; } const c = Math.abs(hs[0] - hs[2]); if (c > cross) { cross = c; cat = i + t; } } }
  console.log(`${r.id.padEnd(9)} worst bump ${worst.toFixed(2)}m @${at}  worst cross-fall ${cross.toFixed(2)}m over 2.4m @${cat}  joins ${r.joins.map(j => j[1].r.id + '#' + j[1].i).join(',')}`); }
