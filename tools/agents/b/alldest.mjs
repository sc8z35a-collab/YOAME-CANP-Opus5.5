// every destination is reachable from the hollow and the van ends up parked ON the pad (<4m, level, stopped)
import { G, V, T, A, R, run, bus } from './h.mjs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(R.DESTS).filter(k => k !== 'hollow');
let fail = 0;
for (const id of ids) {
  G.waterLevel = -2.05; const h = T.SPOTS.hollow; V.setPose(h.x, h.z, h.rot); A.disengage(); run(2); A.engage(id); let t = 0;
  run(500, () => { t += 1 / 30; if (!A.AP.on) return false; });
  run(3); const p = V.originOf(), d = R.DESTS[id], off = Math.hypot(p.x - d.x, p.z - d.z), tilt = Math.acos(Math.min(1, V.VEH.up.y)) * 57.3;
  const ok = A.AP.at === id && off < 4 && tilt < 8 && V.VEH.speed < 0.3; if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(9)} ${t.toFixed(0).padStart(3)}s off-pad ${off.toFixed(1)}m tilt ${tilt.toFixed(1)}° spd ${V.VEH.speed.toFixed(2)}`);
}
console.log('fail', fail);
process.exit(fail ? 1 : 0);
