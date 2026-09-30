// the 10s before the overspeed at (10,-44): target speed & brake history
import { G, V, T, A, R, run } from './h.mjs';
const d = T.SPOTS.summit; V.setPose(d.x, d.z, d.rot); A.disengage(); run(2); A.engage('hollow'); let t = 0;
run(89, () => { t += 1 / 30; if (t > 80 && Math.round(t * 30) % 10 === 0) { const p = V.originOf(); console.log(`${t.toFixed(1)} (${p.x.toFixed(0)},${p.z.toFixed(0)}) v=${(V.VEH.fwdSpeed * 3.6).toFixed(0)} tgt=${(A.AP.speedT * 3.6).toFixed(0)} grade=${(V.VEH.fwd.y * 100).toFixed(0)}% thr=${V.VEH.ctrl.throttle.toFixed(2)} brk=${V.VEH.ctrl.brake.toFixed(2)} steer=${V.VEH.steer.toFixed(2)} idx=${A.AP.idx} road=${R.NODES[A.AP.path[A.AP.idx].n]?.road}`); } });
