// what holds the van between t0..t1 of a drive: wheels, hull ground clearance, dents
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const [from, to, t0, t1] = process.argv.slice(2);
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); run(3); A.engage(to); let t = 0, hits = {};
bus.on('dent', e => hits[e.cause] = (hits[e.cause] || 0) + 1);
const P = new THREE.Vector3(), clr = (x, y, z) => { V.localToWorld(P.set(x, y, z), P); return (P.y - T.groundAt(P.x, P.z, P.y + 0.3)).toFixed(2); };
run(+t1, () => { t += 1 / 30; if (t > +t0 && Math.round(t * 30) % 15 === 0) { const p = V.originOf(), W = V.VEH.wheels;
  console.log(`${t.toFixed(1)} (${p.x.toFixed(1)},${p.z.toFixed(1)}) v=${V.VEH.fwdSpeed.toFixed(2)} thr=${V.VEH.ctrl.throttle.toFixed(2)} brk=${V.VEH.ctrl.brake.toFixed(2)} ${V.VEH.drive.mode}${V.VEH.drive.gear} ${V.VEH.drive.range} rpm=${V.VEH.drive.rpm.toFixed(0)} wheels=${W.map(w => (w.contact ? "c" : "-") + w.kind[0] + (w.w * 0.42).toFixed(1) + "/d" + w.dig.toFixed(2) + "/s" + w.sink.toFixed(2)).join(" ")} pitch=${V.VEH.pitch.toFixed(2)} clr F=${clr(0, 0.45, -5.35)} R=${clr(0, 0.45, 3.3)} mid=${clr(0, 0.45, -1.5)} hits=${JSON.stringify(hits)}`); hits = {}; } });
