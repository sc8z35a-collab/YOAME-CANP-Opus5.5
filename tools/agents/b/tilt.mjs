// report where the van tilts hard during a drive: node tilt.mjs from to [thr=0.85]
import { G, V, T, A, R, run, bus } from './h.mjs';
const [from, to, thr = 0.85] = process.argv.slice(2);
bus.on('toast', t => console.log(`[${G.t.toFixed(0)}] ${t.msg}`));
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); run(3); A.engage(to); let last = 1;
run(300, () => { const u = V.VEH.up.y; if (u < +thr && last >= +thr) { const p = V.originOf(), q = T.roadQuery(p.x, p.z); console.log(`[${G.t.toFixed(1)}] up=${u.toFixed(2)} (${p.x.toFixed(1)},${p.z.toFixed(1)}) roadD=${q.d.toFixed(1)} ${q.road?.id}#${q.i} v=${V.VEH.fwdSpeed.toFixed(1)} kturn=${!!A.AP.kturn} pitch=${V.VEH.pitch.toFixed(2)} roll=${V.VEH.roll.toFixed(2)}`); } last = u; if (!A.AP.on) return false; });
