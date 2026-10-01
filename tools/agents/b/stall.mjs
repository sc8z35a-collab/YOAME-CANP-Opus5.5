// at the stall point on the ford ramp: per-wheel force budget (Fz, mu, fx) and hull contacts
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const d = T.SPOTS.swEnd; V.setPose(d.x, d.z, d.rot); run(3); A.engage('fordE'); run(57.5);
const VEH = V.VEH; console.log('pos', V.originOf().toArray().map(v => v.toFixed(2)).join(','), 'range', VEH.drive.range, 'gear', VEH.drive.mode + VEH.drive.gear, 'torque', VEH.drive.torque.toFixed(0), 'lock', VEH.drive.lock);
VEH.wheels.forEach((W, i) => console.log(i, 'Fz', W.Fz.toFixed(0), 'mu', W.mu.toFixed(2), 'kind', W.kind, 'sat', W.sat, 'slip', W.slip.toFixed(2), 'tcs', (W.tcs || 0).toFixed(0), 'comp', W.comp.toFixed(2)));
const P = new THREE.Vector3(); const HB = V.VEHICLE.HB;
for (const y of [HB.y0]) for (let z = HB.z0; z <= HB.z1 + 0.01; z += 0.5) for (const x of [-HB.x, 0, HB.x]) { V.localToWorld(P.set(x, y, z), P); const g = T.groundAt(P.x, P.z, P.y + 0.3); if (P.y - g < 0.08) console.log('hull low point', x, z.toFixed(2), 'clear', (P.y - g).toFixed(2)); }
console.log('Fz sum', VEH.wheels.reduce((a, W) => a + W.Fz, 0).toFixed(0), 'weight', (3600 * 9.81).toFixed(0), 'grade', (Math.sin(VEH.pitch) * 100).toFixed(0) + '%');
