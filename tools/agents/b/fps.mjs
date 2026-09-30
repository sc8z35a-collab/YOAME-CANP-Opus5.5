// frame-rate independence: the same drive at 60 / 30 / 20 fps must behave the same
import { G, V, T, A, R, bus } from './h.mjs';
for (const fps of [60, 30, 20]) {
  const dt = 1 / fps, d = T.SPOTS.hollow; V.setPose(d.x, d.z, d.rot); A.disengage();
  for (let i = 0; i < fps * 2; i++) { G.t += dt; A.updateAutopilot(dt); V.updateVehicle(dt, null); }
  A.engage('ridge'); let t = 0, maxV = 0;
  for (let i = 0; i < fps * 200; i++) { G.t += dt; t += dt; A.updateAutopilot(dt); V.updateVehicle(dt, null); maxV = Math.max(maxV, V.VEH.fwdSpeed); if (!A.AP.on) break; }
  console.log(`${fps} fps: arrived=${A.AP.at === 'ridge'} ${t.toFixed(0)}s max ${(maxV * 3.6).toFixed(0)} km/h`);
}
