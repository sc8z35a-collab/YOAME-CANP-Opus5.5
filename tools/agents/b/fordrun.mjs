// drive across the ford at normal water, and check the planner avoids it when flooded [B-05]
import { G, V, T, A, R, run, bus } from './h.mjs';
for (const [wl, from, to] of [[-2.05, 'fordE', 'fordW'], [-2.05, 'fordW', 'creekS'], [-1.4, 'fordE', 'fordW']]) {
  G.waterLevel = wl; const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); A.disengage(); run(3); A.engage(to);
  const viaFord = A.AP.path.some(p => p.n >= 0 && R.NODES[p.n].ford); let t = 0, maxSub = 0, minUp = 1;
  run(400, () => { t += 1 / 30; maxSub = Math.max(maxSub, V.VEH.submerged); minUp = Math.min(minUp, V.VEH.up.y); if (!A.AP.on) return false; });
  console.log(`water ${wl}: ${from}->${to} ${A.AP.at === to ? 'OK' : 'FAIL'} ${t.toFixed(0)}s viaFord=${viaFord} maxSubmerged=${(maxSub * 100).toFixed(0)}% minUp=${minUp.toFixed(2)} ingress=${(V.VEH.ingress * 100).toFixed(0)}%`);
}
