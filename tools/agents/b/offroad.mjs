// start in the forest, drive to a destination: after rejoining the road the van must cruise again
import { G, V, T, A, R, run, bus } from './h.mjs';
const quiet = process.argv.includes('-q'); bus.on('toast', t => !quiet && console.log('  toast', t.msg));
const [x, z, to] = [+(process.argv[2] ?? 20), +(process.argv[3] ?? 10), process.argv[4] ?? 'meadow'];
V.setPose(x, z, Math.PI); run(2);
console.log('start road dist', T.roadQuery(x, z).d.toFixed(1));
const t0 = performance.now(); A.engage(to); console.log('engage ms', (performance.now() - t0).toFixed(0), 'offroad', A.AP.offroad);
let onRoadT = 0, vmax = 0, t = 0;
run(400, () => { t += 1 / 30; const p = V.originOf(); if (T.roadQuery(p.x, p.z).d < 2) onRoadT += 1 / 30; if (onRoadT > 15) vmax = Math.max(vmax, V.VEH.fwdSpeed); if (!A.AP.on) return false; });
console.log(`arrived=${A.AP.at === to} t=${t.toFixed(0)}s  max speed after 15s on road ${(vmax * 3.6).toFixed(0)} km/h  slow=${A.AP.slow} offroad=${A.AP.offroad}`);
