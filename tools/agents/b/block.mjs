// road fully blocked by a wall of static rocks: must escalate replan -> winch [B-02]
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
let w = 0; bus.on('winch', on => on && w++);
const d = T.SPOTS.hollow; V.setPose(d.x, d.z, Math.PI); run(2);
const r = R.ROADS[0]; let bi = 0; r.s.forEach((p, i) => { if (Math.abs(p.z - 25) < Math.abs(r.s[bi].z - 25)) bi = i; });
const p = r.s[bi]; for (let k = -4; k <= 4; k++) V.addObstacle(new THREE.Vector3(p.x + k * 1.2, p.h + 0.6, p.z), 0.8, { static: true });
A.engage('meadow'); let t = 0, maxN = 0; run(240, () => { t += 1 / 30; maxN = Math.max(maxN, A.AP.stuckN || 0); if (!A.AP.on) return false; });
console.log(`t=${t.toFixed(0)} maxStuckN=${maxN} winch=${w}`);
