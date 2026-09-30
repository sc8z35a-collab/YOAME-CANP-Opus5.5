// change destination mid-drive, and pick a destination while the van is rolling toward it
import { G, V, T, A, R, run, bus } from './h.mjs';
const msgs = []; bus.on('toast', t => msgs.push(`[${G.t.toFixed(0)}] ${t.msg}`));
const d = T.SPOTS.hollow; V.setPose(d.x, d.z, d.rot); run(2);
A.engage('meadow'); run(15);
console.log('mid-drive speed', (V.VEH.fwdSpeed * 3.6).toFixed(0), 'km/h, switching to creekS (behind us)');
const ok = A.engage('creekS'); let t = 0, maxRev = 0;
run(300, () => { t += 1 / 30; maxRev = Math.min(maxRev, V.VEH.fwdSpeed); if (!A.AP.on) return false; });
console.log(`redirect engage=${ok} arrived=${A.AP.at === 'creekS'} in ${t.toFixed(0)}s  max reverse ${(maxRev * 3.6).toFixed(0)}km/h  total ${A.AP.total?.toFixed(0)} remain ${A.AP.remain?.toFixed(0)}`);
// engage the current destination again while still rolling in: must not say "already here" and stop dead
V.setPose(d.x, d.z, d.rot); run(1); A.engage('creekN'); run(400, () => { const p = V.originOf(), c = R.DESTS.creekN; if (Math.hypot(p.x - c.x, p.z - c.z) < 6 && V.VEH.speed > 2) return false; });
console.log('rolling in at', (V.VEH.speed * 3.6).toFixed(0), 'km/h; re-engage creekN ->', A.engage('creekN'), 'on', A.AP.on);
console.log(msgs.slice(-4).join('\n'));
