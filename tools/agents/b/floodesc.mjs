// flash flood at the hollow: pick 'ridge' as the water rises -> the van must get out
import { G, V, T, A, R, run, bus } from './h.mjs';
const msgs = []; bus.on('toast', t => msgs.push(`[${G.t.toFixed(0)}] ${t.msg}`));
const d = T.SPOTS.hollow, peak = d.h + 0.62, base = -2.05; V.setPose(d.x, d.z, d.rot); run(2);
const delay = +(process.argv[2] || 10); let ft = 0;
const flood = () => { ft += 1 / 30; const rise = Math.min(1, ft / 35); G.waterLevel = base + (peak - base) * rise * rise * (3 - 2 * rise); G.floodK = Math.min(1.1, ft / 20); G.rain = G.wet = 1; };
run(delay, flood); console.log(`after ${delay}s: water ${G.waterLevel.toFixed(2)} (van floor ~${(d.h + 0.72).toFixed(2)}), submerged ${(V.VEH.submerged * 100).toFixed(0)}%`);
A.engage('ridge'); let t = 0, maxSub = 0;
run(300, () => { flood(); t += 1 / 30; maxSub = Math.max(maxSub, V.VEH.submerged); if (!A.AP.on) return false; });
console.log(`escape: arrived=${A.AP.at === 'ridge'} ${t.toFixed(0)}s maxSubmerged ${(maxSub * 100).toFixed(0)}% ingress ${(V.VEH.ingress * 100).toFixed(0)}% mode=${A.AP.mode}`);
console.log(msgs.slice(0, 8).join('\n'));
