// aero sanity: coasting from 60 km/h on flat ground in neutral-ish (brake 0, no throttle), with head/tail wind
import { G, V, T, A, R, run } from './h.mjs';
const VEH = V.VEH, C = VEH.ctrl;
for (const wind of [0, 10, -10]) {
  const d = T.SPOTS.hollow; V.setPose(d.x, d.z, Math.PI, 0.05); run(1, null, false);
  G.windVec = VEH.fwd.clone().setY(0).normalize().multiplyScalar(-wind);   // +wind = head wind
  VEH.v.copy(VEH.fwd).multiplyScalar(16.7); VEH.wheels.forEach(W => W.w = 16.7 / V.WHEEL_R);
  Object.assign(VEH.drive, { mode: 'N', gear: 1 }); Object.assign(C, { hand: false, brake: 0, throttle: 0 });
  const v0 = VEH.v.dot(VEH.fwd); run(1, () => { VEH.drive.mode = 'N'; }, false);
  console.log(`wind ${wind > 0 ? 'head' : wind < 0 ? 'tail' : 'none'} ${Math.abs(wind)} m/s: decel over 1s from 60km/h = ${(v0 - VEH.fwdSpeed).toFixed(2)} m/s²`);
}
G.windVec = null;
