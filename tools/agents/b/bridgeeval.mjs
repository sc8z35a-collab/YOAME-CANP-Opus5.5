// west bridge: approach radius, drives in all directions, rail hits, stuck replans
import { G, V, T, A, R, run, bus } from './h.mjs';
const r = R.ROADS.find(r => r.id === 'west'), [a, b] = r.bridge;
let minR = 1e9; for (let i = 2; i < b; i++) { const p = r.s[i - 2], q = r.s[i], s = r.s[i + 2]; let d = Math.atan2(s.x - q.x, s.z - q.z) - Math.atan2(q.x - p.x, q.z - p.z); d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); minR = Math.min(minR, 4 / Math.max(d, 1e-6)); }
console.log(`deck ${a}-${b} approach minR ${minR.toFixed(1)}m roads ${R.ROADS.map(r => r.id + '(' + r.joins.map(j => j[1].r.id).join('/') + ')').join(' ')}`);
let rail = 0, stuck = 0; bus.on('dent', e => e.cause === 'rail' && rail++); bus.on('toast', t => t.msg.includes('進めない') && stuck++);
for (const [f, to] of [['hollow', 'westEnd'], ['bridgeE', 'bridgeW'], ['bridgeW', 'meadow'], ['creekS', 'bridgeW'], ['meadow', 'bridgeW'], ['westHill', 'creekN']]) {
  G.waterLevel = -2.05; const d = T.SPOTS[f]; V.setPose(d.x, d.z, d.rot); A.disengage(); run(3); rail = 0; stuck = 0; A.engage(to); let t = 0, minUp = 1;
  run(400, () => { t += 1 / 30; minUp = Math.min(minUp, V.VEH.up.y); if (!A.AP.on) return false; });
  console.log(`${(f + '->' + to).padEnd(18)} ${A.AP.at === to ? 'OK  ' : 'FAIL'} ${t.toFixed(0).padStart(3)}s rail=${rail} stuck=${stuck} minUp=${minUp.toFixed(2)}`);
}
