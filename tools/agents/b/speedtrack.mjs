// speed tracking vs target on the steepest grades (up & down): overspeed on descents is dangerous
import { G, V, T, A, R, run } from './h.mjs';
for (const [a, b] of [['hollow', 'summit'], ['summit', 'hollow'], ['cliff', 'lookout']]) {
  const d = T.SPOTS[a]; V.setPose(d.x, d.z, d.rot); A.disengage(); run(2); A.engage(b);
  let over = 0, worst = 0, t = 0, downOver = 0;
  run(300, () => { t += 1 / 30; const e = V.VEH.fwdSpeed - A.AP.speedT; if (e > worst) worst = e; if (e > 1.5) { over += 1 / 30; if (V.VEH.fwd.y < -0.1) downOver += 1 / 30; } if (!A.AP.on) return false; });
  console.log(`${a}->${b}: ${t.toFixed(0)}s, worst overspeed ${(worst * 3.6).toFixed(0)} km/h above target, ${over.toFixed(1)}s >5km/h over (${downOver.toFixed(1)}s of it downhill)`);
}
