// where does the worst overspeed happen on summit->hollow
import { G, V, T, A, R, run } from './h.mjs';
const d = T.SPOTS.summit; V.setPose(d.x, d.z, d.rot); A.disengage(); run(2); A.engage('hollow'); let t = 0, prevT = 0;
run(300, () => { t += 1 / 30; const e = V.VEH.fwdSpeed - A.AP.speedT; if (e > 2.5 && t - prevT > 0.5) { prevT = t; const p = V.originOf(); console.log(`${t.toFixed(1)}s (${p.x.toFixed(0)},${p.z.toFixed(0)}) v=${(V.VEH.fwdSpeed * 3.6).toFixed(0)} target=${(A.AP.speedT * 3.6).toFixed(0)} grade=${(V.VEH.fwd.y * 100).toFixed(0)}% brake=${V.VEH.ctrl.brake.toFixed(2)} ABS=${V.VEH.drive.abs} mu=${V.VEH.mu.toFixed(2)} kturn=${!!A.AP.kturn} stuckT=${A.AP.stuckT.toFixed(1)}`); } if (!A.AP.on) return false; });
