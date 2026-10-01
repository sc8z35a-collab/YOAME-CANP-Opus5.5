// which fixed colliders touch the hull at time `at` of a drive (body-local coords)
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const { colliders } = await import('../../../js/forest.js');
const [from, to, at] = [process.argv[2], process.argv[3], +process.argv[4]];
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); run(3); A.engage(to); run(at);
const VEH = V.VEH, HB = V.VEHICLE.HB, COM = V.VEHICLE.COM, qi = VEH.q.clone().invert();
for (const c of colliders.concat(T.RAILS)) { const l = new THREE.Vector3(c.x, VEH.pos.y, c.z).sub(VEH.pos).applyQuaternion(qi).add(COM);
  const px = Math.max(-HB.x, Math.min(HB.x, l.x)), pz = Math.max(HB.z0, Math.min(HB.z1, l.z)); const dd = Math.hypot(l.x - px, l.z - pz);
  if (dd < c.r + 0.3) console.log(c.rail ? 'RAIL' : 'tree', 'r', c.r.toFixed(2), 'local x', l.x.toFixed(2), 'z', l.z.toFixed(2), 'gap', (dd - c.r).toFixed(2), 'world', c.x.toFixed(1), c.z.toFixed(1)); }
const p = V.originOf(); console.log('origin', p.x.toFixed(2), p.z.toFixed(2), 'hdg', (Math.atan2(VEH.fwd.x, VEH.fwd.z) * 57.3).toFixed(0), 'v', VEH.fwdSpeed.toFixed(2), 'steer', VEH.steer.toFixed(2), 'idx', A.AP.idx, 'kturn', !!A.AP.kturn);
