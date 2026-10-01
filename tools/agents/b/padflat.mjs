// height spread under the van footprint (6.5 x 2.4 m) parked at each destination pad [B-16]
import { T, R } from './h.mjs';
const out = [];
for (const d of Object.values(R.DESTS)) { const fx = -Math.sin(d.rot), fz = -Math.cos(d.rot), rx = -fz, rz = fx; const hs = [];
  for (const [a, b] of [[-5.35, -1.2], [-5.35, 1.2], [3.3, -1.2], [3.3, 1.2], [-1, 0]]) hs.push(T.groundAt(d.x - fx * a + rx * b, d.z - fz * a + rz * b, d.h + 1));
  out.push([d.id, Math.max(...hs) - Math.min(...hs)]); }
out.sort((a, b) => b[1] - a[1]); console.log(out.slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}m`).join('  '));
