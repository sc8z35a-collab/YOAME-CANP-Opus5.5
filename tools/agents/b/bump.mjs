// what shapes the terrain at a bump beside a road: nearest road seg, pads nearby
import { T, R } from './h.mjs';
const [road, idx, off] = [process.argv[2] || 'ford', +(process.argv[3] || 3), +(process.argv[4] || 1.2)];
const r = R.ROADS.find(r => r.id === road), a = r.s[idx], b = r.s[idx + 1], L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
for (const o of [0, 0.6, 1.2, 1.8, 2.6, 3.5]) { const x = a.x + nx * o, z = a.z + nz * o, q = T.roadQuery(x, z);
  console.log(`off ${o}: (${x.toFixed(1)},${z.toFixed(1)}) terrain ${T.heightAt(x, z).toFixed(2)} nearest ${q.road?.id}#${q.i} d=${q.d.toFixed(2)} bedH=${q.h.toFixed(2)}`); }
for (const d of Object.values(R.DESTS)) { const dd = Math.hypot(a.x - d.x, a.z - d.z); if (dd < 25) console.log('pad', d.id, 'dist', dd.toFixed(1), 'h', d.h.toFixed(2), 'end', d.end); }
