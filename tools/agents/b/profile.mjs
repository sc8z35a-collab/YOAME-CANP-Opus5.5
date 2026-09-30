// terrain height along a road vs its bed (centre and ±1.2m): finds bumps the grader didn't see
import { T, R } from './h.mjs';
const [road, i0, i1] = [process.argv[2] || 'ford', +(process.argv[3] || 0), +(process.argv[4] || 30)];
const r = R.ROADS.find(r => r.id === road);
for (let i = i0; i < Math.min(i1, r.s.length - 1); i++) { const a = r.s[i], b = r.s[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
  for (let t = 0; t < 1; t += 0.5) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, bed = a.h + (b.h - a.h) * t;
    const hs = [-1.2, 0, 1.2].map(o => T.heightAt(x + nx * o, z + nz * o) - bed); console.log(`${(i + t).toFixed(1)} bed ${bed.toFixed(2)}  terrain-bed L ${hs[0].toFixed(2)} C ${hs[1].toFixed(2)} R ${hs[2].toFixed(2)} ${a.ford ? 'FORD' : ''}`); } }
