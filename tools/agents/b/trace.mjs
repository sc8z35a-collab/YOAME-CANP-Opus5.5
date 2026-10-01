// verbose autopilot trace: node trace.mjs from to [every_s] [limit_s]
import { G, V, T, A, R, run, bus } from './h.mjs';
const [from, to, ev = 5, lim = 400] = process.argv.slice(2);
bus.on('toast', t => console.log(`   [${G.t.toFixed(0)}] ${t.msg}`));
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); run(3); A.engage(to); let t = 0;
run(+lim, () => { t += 1 / 30; const p = V.originOf(); const n = A.AP.path[A.AP.idx];
  if (Math.round(t * 30) % Math.round(ev * 30) === 0) console.log(`${t.toFixed(0)}s (${p.x.toFixed(0)},${p.z.toFixed(0)}) v=${(V.VEH.fwdSpeed * 3.6).toFixed(0)} vt=${(A.AP.speedT * 3.6).toFixed(0)} ${A.AP.mode} slow=${A.AP.slow} kt=${!!A.AP.kturn} N=${A.AP.stuckN} ${V.VEH.drive.range} sub=${(V.VEH.submerged * 100).toFixed(0)}% idx=${A.AP.idx}/${A.AP.path.length} ${n && n.n >= 0 ? R.NODES[n.n].road + (R.NODES[n.n].ford ? '(ford)' : '') : '-'}`);
  if (!A.AP.on) return false; });
console.log('done', t.toFixed(0), 's arrived', A.AP.at === to);
