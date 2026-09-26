// Pure-logic tests (no WebGL): terrain design invariants that gameplay depends on.
// Run: node tools/agents/logic_test.mjs
import { heightAt, SPOTS, spotHeight, creekX, CREEK_BED, WATER_BASE, trackDist, slopeAt, TRACK, drivePath } from '../../js/terrain.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

const hH = spotHeight('hollow'), rH = spotHeight('ridge');
ok(Math.abs(heightAt(SPOTS.hollow.x, SPOTS.hollow.z) - hH) < 0.15, `hollow pad flat at ${hH.toFixed(2)}`);
ok(Math.abs(heightAt(SPOTS.ridge.x, SPOTS.ridge.z) - rH) < 0.15, `ridge pad flat at ${rH.toFixed(2)}`);
ok(rH - hH > 3, `ridge is clearly higher than hollow (${(rH - hH).toFixed(1)}m) so it is a real refuge from floods`);
// flood design: peak at hollow = pad + 0.62 must flood hollow but never reach ridge
ok(hH + 0.62 < rH - 2, 'flood peak stays far below the ridge');
ok(WATER_BASE > CREEK_BED && WATER_BASE < hH - 0.8, `normal creek level (${WATER_BASE}) is below the hollow pad`);
// creek is near the hollow (visible from the dinette window, drives flood fantasy)
ok(Math.abs(creekX(0) - SPOTS.hollow.x) < 20, `creek ${Math.abs(creekX(0)).toFixed(1)}m from hollow`);
// camper footprint flatness (both spots) — wheels must not float
for (const k in SPOTS) {
  const s = SPOTS[k]; let mx = 0;
  for (const [dx, dz] of [[-1.1, -4.7], [1.1, -4.7], [-1.1, 2], [1.1, 2]]) {
    const x = s.x + dx * Math.cos(s.rot) + dz * Math.sin(s.rot), z = s.z - dx * Math.sin(s.rot) + dz * Math.cos(s.rot);
    mx = Math.max(mx, Math.abs(heightAt(x, z) - spotHeight(k)));
  }
  ok(mx < 0.2, `${k}: wheel contact error ${mx.toFixed(3)}m`);
}
// ridge must have an uphill slope nearby (landslide source)
let upR = -1e9;
for (let a = 0; a < 6.28; a += 0.3) upR = Math.max(upR, heightAt(SPOTS.ridge.x + Math.cos(a) * 30, SPOTS.ridge.z + Math.sin(a) * 30) - rH);
ok(upR > 4, `ridge has a slope ${upR.toFixed(1)}m above it within 30m (landslide source)`);
// track connects both spots
ok(Math.hypot(TRACK[0].x - SPOTS.hollow.x, TRACK[0].y - SPOTS.hollow.z) < 8 && Math.hypot(TRACK.at(-1).x - SPOTS.ridge.x, TRACK.at(-1).y - SPOTS.ridge.z) < 1, 'dirt track connects the spots');
// track drivable: max slope along it
let ms = 0;
for (let t = 0; t <= 1; t += 0.02) {
  // sample along the straight line hollow->ridge as a proxy
  const x = SPOTS.hollow.x + (SPOTS.ridge.x - SPOTS.hollow.x) * t, z = SPOTS.hollow.z + (SPOTS.ridge.z - SPOTS.hollow.z) * t;
  ms = Math.max(ms, slopeAt(x, z));
}
console.log('info: max slope on straight hollow→ridge line', ms.toFixed(2));
// no NaN anywhere on a grid
let nan = 0;
for (let x = -150; x <= 190; x += 7) for (let z = -190; z <= 140; z += 7) if (!Number.isFinite(heightAt(x, z))) nan++;
ok(nan === 0, 'terrain height finite everywhere');
// drivability along the real track polyline (grade between consecutive samples)
let worst = 0, len = 0;
for (let i = 0; i < TRACK.length - 1; i++) {
  const a = TRACK[i], b = TRACK[i + 1];
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4;
    const x0 = a.x + (b.x - a.x) * t0, z0 = a.y + (b.y - a.y) * t0, x1 = a.x + (b.x - a.x) * t1, z1 = a.y + (b.y - a.y) * t1;
    const d = Math.hypot(x1 - x0, z1 - z0); len += d;
    worst = Math.max(worst, Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) / d);
  }
}
ok(worst < 0.45, `track max grade ${(worst * 100).toFixed(0)}% (len ${len.toFixed(0)}m) is drivable (<45%)`);
// road must stay out of the creek and not cut through the middle of either pad
let wet = 0, padHit = 0;
for (let i = 0; i < TRACK.length; i++) {
  const p = TRACK[i];
  if (Math.abs(p.x - creekX(p.y)) < 6) wet++;
  if (i > 8 && i < TRACK.length - 8) for (const k in SPOTS) if (Math.hypot(p.x - SPOTS[k].x, p.y - SPOTS[k].z) < 7) padHit++;
}
ok(wet === 0, 'road never runs through the creek');
ok(padHit === 0, 'road middle section avoids the parking pads');
// drive path (mirrors main.js driveTo): heading must never jump (> 60deg in 1m) = no U-turn glitch
const THREE = await import('../../js/lib/three.module.js');
for (const [fromK, to] of [['hollow', 'ridge'], ['ridge', 'hollow']]) {
  const pts = drivePath(fromK, to);
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const L = c.getLength();
  let worst = 0, prev = null; const a = new THREE.Vector3();
  for (let d = 0; d < L; d += 1) {
    c.getTangentAt(Math.min(d / L, 0.999), a); const y = Math.atan2(-a.x, -a.z);
    if (prev !== null) { let dd = Math.abs(y - prev); dd = Math.min(dd, Math.PI * 2 - dd); worst = Math.max(worst, dd); }
    prev = y;
  }
  // end heading must match the pad heading (no visible snap on arrival)
  c.getTangentAt(0.999, a); let e = Math.abs(Math.atan2(-a.x, -a.z) - SPOTS[to].rot); e = Math.min(e, Math.PI * 2 - e);
  ok(e < 0.35, `${fromK}->${to}: arrival heading error ${(e * 180 / Math.PI).toFixed(0)}deg`);
  // loop must avoid camp props at the hollow (table, fire pit, generator)
  let prop = 1e9;
  for (let d = 0; d < L; d += 0.5) { const p = c.getPointAt(d / L); for (const [x, z] of [[3.6, -1.8], [5.2, 3.2], [2.7, 5.2]]) prop = Math.min(prop, Math.hypot(p.x - x, p.z - z)); }
  ok(prop > 2.2, `${fromK}->${to}: clearance to camp props ${prop.toFixed(1)}m`);
  ok(worst < Math.PI / 3, `${fromK}->${to}: path ${L.toFixed(0)}m, max heading change ${(worst * 180 / Math.PI).toFixed(0)}deg/m`);
}
process.exit(fail ? 1 : 0);
