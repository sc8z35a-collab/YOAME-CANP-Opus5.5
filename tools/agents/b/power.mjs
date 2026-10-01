// drivetrain energy check: power delivered at the driven wheels vs engine output (must be <= engine)
import { G, V, T, A, R, run } from './h.mjs';
const VEH = V.VEH, C = VEH.ctrl, D = VEH.drive;
const road = process.argv[2] || 'hollow', range = process.argv[3] || '4L';
const d = T.SPOTS[road]; V.setPose(d.x, d.z, Math.PI, 0.05); Object.assign(C, { throttle: 0, steer: 0, brake: 1, hand: true, range }); run(2, null, false);
Object.assign(C, { throttle: 1, brake: 0, hand: false });
const mask = range === '2H' ? [0, 0, 1, 1] : [1, 1, 1, 1];
for (let k = 0; k < 16; k++) {
  let pw = 0, pe = 0, n = 0, ke0 = 0.5 * 3600 * VEH.v.lengthSq(), y0 = VEH.pos.y;
  run(0.5, () => { const wAvg = VEH.wheels.reduce((a, W, i) => a + (mask[i] ? W.w : 0), 0) / mask.reduce((a, b) => a + b); pw += D.torque * wAvg; pe += Math.max(0, D.torque / D.ratio / 0.88 / 1) * D.rpm * 2 * Math.PI / 60; n++; }, false);
  const dE = (0.5 * 3600 * VEH.v.lengthSq() - ke0 + 3600 * 9.81 * (VEH.pos.y - y0)) / 0.5;
  console.log(`${(k * 0.5 + 0.5).toFixed(1)}s ${D.mode}${D.gear} lock=${D.lock} rpm=${D.rpm.toFixed(0)} v=${(VEH.fwdSpeed * 3.6).toFixed(0)}km/h  wheel power ${(pw / n / 1000).toFixed(0)}kW  body dE/dt ${(dE / 1000).toFixed(0)}kW  (engine max ≈ ${(400 * 2800 * 2 * Math.PI / 60 / 1000).toFixed(0)}kW)`);
}
