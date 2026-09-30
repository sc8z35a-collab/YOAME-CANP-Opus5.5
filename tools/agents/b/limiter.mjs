// which speed limiter binds (needs temporary AP.dbg instrumentation)
import { G, V, T, A, R, run } from './h.mjs';
const [from, to, t0, t1] = process.argv.slice(2);
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); A.disengage(); run(2); A.engage(to); let t = 0;
run(+t1, () => { t += 1 / 30; if (t > +t0 && Math.round(t * 30) % 5 === 0 && A.AP.dbg) console.log(t.toFixed(1), 'v', (V.VEH.fwdSpeed * 3.6).toFixed(0), Object.entries(A.AP.dbg).map(([k, v]) => k + '=' + (v * 3.6).toFixed(0)).join(' '), 'bd', A.AP.path[A.AP.idx] ? Math.hypot(A.AP.path[A.AP.idx].x - V.originOf().x, A.AP.path[A.AP.idx].z - V.originOf().z).toFixed(1) : '', 'roll', V.VEH.roll.toFixed(2), 'skid', V.VEH.skid.toFixed(1)); });
