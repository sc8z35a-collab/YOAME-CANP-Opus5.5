// van tipped onto its side and resting there: must not count as "airborne / falling"
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
let falls = 0; bus.on('fall', () => falls++);
const d = T.SPOTS.hollow; V.setPose(d.x, d.z, d.rot); run(1);
V.VEH.q.premultiply(new THREE.Quaternion().setFromAxisAngle(V.VEH.fwd.clone(), Math.PI / 2)); V.VEH.pos.y += 1.0;
run(8, null, false);
console.log(`on its side: up.y=${V.VEH.up.y.toFixed(2)} speed=${V.VEH.speed.toFixed(2)} airT=${V.VEH.airT.toFixed(2)}s (expect ~0)`);
A.engage('meadow'); run(3); console.log('fall events:', falls, 'mode', A.AP.mode);
