// hill start on the steepest road grade, full throttle: the 3.6 t van must climb a 20% gravel grade
import { G, V, T, A, R, run } from './h.mjs';
const VEH = V.VEH, C = VEH.ctrl;
const road = process.argv[2] || 'mount';
const r = R.ROADS.find(r => r.id === road); let bi = 1, bg = 0;
for (let i = 2; i < r.s.length - 3; i++) { const g = (r.s[i + 1].h - r.s[i - 1].h) / 4; if (Math.abs(g) > Math.abs(bg) && !r.s[i].bridge) { bg = g; bi = i; } }
const up = bg > 0 ? 1 : -1, a = r.s[bi - up * 2], b = r.s[bi + up * 2];
for (const range of ['2H', '4H', '4L']) {
  V.setPose(a.x, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)), 0.05); Object.assign(C, { throttle: 0, steer: 0, brake: 1, hand: true, range }); run(2, null, false);
  const p0 = V.originOf().clone(); let tcs = 0, maxTcs = 0;
  Object.assign(C, { throttle: 1, brake: 0, hand: false });
  run(6, () => { if (VEH.drive.tcs) tcs++; maxTcs = Math.max(maxTcs, ...VEH.wheels.map(w => w.tcs || 0)); }, false);
  const dist = V.originOf().distanceTo(p0);
  console.log(`${road}#${bi} grade ${(Math.abs(bg) * 100).toFixed(0)}% ${range}: climbed ${dist.toFixed(1)}m in 6s, v=${(VEH.fwdSpeed * 3.6).toFixed(0)}km/h, TCS active ${(tcs / 180 * 100).toFixed(0)}% of frames, max TCS brake ${maxTcs.toFixed(0)}Nm, slip ${VEH.wheels.map(w => w.slip.toFixed(1)).join('/')}`);
}
