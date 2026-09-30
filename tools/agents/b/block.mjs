// road fully blocked by a static wall of rocks ahead: the autopilot must escalate (replan / winch), not rock forever
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const quiet = process.argv.includes('-q'); const log = []; bus.on('toast', t => log.push(t.msg)); let w = 0; bus.on('winch', on => on && w++);
const d = T.SPOTS.hollow; V.setPose(d.x, d.z, Math.PI); run(2);
// wall across the valley road ~25m north (the route to meadow goes north)
const r = R.ROADS[0]; let bi = 0; r.s.forEach((p, i) => { if (Math.abs(p.z - 25) < Math.abs(r.s[bi].z - 25)) bi = i; });
const p = r.s[bi]; for (let k = -4; k <= 4; k++) V.addObstacle(new THREE.Vector3(p.x + k * 1.2, p.h + 0.6, p.z), 0.8, { static: true });
A.engage('meadow'); let t = 0, maxStuckN = 0, modes = new Set();
run(240, () => { t += 1 / 30; modes.add(A.AP.mode); maxStuckN = Math.max(maxStuckN, A.AP.stuckN || 0); if (!A.AP.on) return false; });
console.log(`t=${t.toFixed(0)} on=${A.AP.on} modes=${[...modes]} maxStuckN=${maxStuckN} winch=${w} z=${V.originOf().z.toFixed(1)}`);
if (!quiet) console.log([...new Set(log)].join(' / '));
