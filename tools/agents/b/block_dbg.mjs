import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const d = T.SPOTS.hollow; V.setPose(d.x, d.z, Math.PI); run(2);
const r = R.ROADS[0]; let bi = 0; r.s.forEach((p, i) => { if (Math.abs(p.z - 25) < Math.abs(r.s[bi].z - 25)) bi = i; });
const p = r.s[bi]; for (let k = -4; k <= 4; k++) V.addObstacle(new THREE.Vector3(p.x + k * 1.2, p.h + 0.6, p.z), 0.8, { static: true });
A.engage('meadow'); let t = 0;
run(40, () => { t += 1 / 30; if (Math.round(t * 30) % 30 === 0) console.log(t.toFixed(0), 'spd', V.VEH.fwdSpeed.toFixed(2), 'vt', A.AP.speedT.toFixed(2), 'stuckT', A.AP.stuckT.toFixed(2), 'thr', V.VEH.ctrl.throttle.toFixed(2), 'brk', V.VEH.ctrl.brake.toFixed(2), 'mode', V.VEH.drive.mode, 'kturn', !!A.AP.kturn, 'idx', A.AP.idx); });
