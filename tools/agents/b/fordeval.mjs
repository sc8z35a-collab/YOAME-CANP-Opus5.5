// evaluate the ford layout: grades, junction ridge (terrain above bed near the ford road), crossing depth
import { T, R } from './h.mjs';
const { creekX, WATER_BASE } = await import('../../../js/relief.js');
const r = R.ROADS.find(r => r.id === 'ford'); let mg = 0, ridge = 0, at = -1;
for (let i = 1; i < r.s.length; i++) mg = Math.max(mg, Math.abs(r.s[i].h - r.s[i - 1].h) / Math.hypot(r.s[i].x - r.s[i - 1].x, r.s[i].z - r.s[i - 1].z));
for (let i = 0; i < r.s.length - 1; i++) { const a = r.s[i], b = r.s[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
  for (const t of [0, 0.5]) for (const o of [-1.2, 1.2]) { const x = a.x + (b.x - a.x) * t + nx * o, z = a.z + (b.z - a.z) * t + nz * o, e = T.heightAt(x, z) - (a.h + (b.h - a.h) * t); if (e > ridge) { ridge = e; at = i + t; } } }
const low = Math.min(...r.s.map(p => p.h));
console.log(`ford: max grade ${(mg * 100).toFixed(1)}%  worst side ridge ${ridge.toFixed(2)}m @${at}  lowest bed ${low.toFixed(2)} (water ${WATER_BASE})  join ${r.joins.map(j => j[1].r.id + '#' + j[1].i).join(',')}  fordE on ${R.DESTS.fordE.road}`);
