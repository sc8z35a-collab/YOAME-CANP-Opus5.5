// Pure-logic tests (no WebGL): world + road network invariants the gameplay depends on.
// Run: node tools/agents/logic_test.mjs
import { heightAt, groundAt, SPOTS, spotHeight, creekX, CREEK_BED, WATER_BASE, WORLD, roadQuery } from '../../js/terrain.js';
import { ROADS, DESTS, NODES, route, GRADE_MAX } from '../../js/roads.js';
import { creekRamp } from '../../js/relief.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ids = Object.keys(DESTS);
ok(ids.length >= 30, `${ids.length} destinations (>=30 selectable on the tablet map)`);
// every destination pair must be routable (no island)
let bad = 0; for (const a of ids) for (const b of ids) if (a !== b && !route(DESTS[a].node, DESTS[b].node)) bad++;
ok(bad === 0, 'every destination is reachable from every other one');
// pads are flat and match their stored height (wheels must not float)
let worstPad = 0, worstId = '';
for (const d of Object.values(DESTS)) {
  for (const [dx, dz] of [[-1.1, -4.7], [1.1, -4.7], [-1.1, 2], [1.1, 2]]) {
    const x = d.x + dx * Math.cos(d.rot) + dz * Math.sin(d.rot), z = d.z - dx * Math.sin(d.rot) + dz * Math.cos(d.rot);
    const e = Math.abs(groundAt(x, z) - d.h); if (e > worstPad) { worstPad = e; worstId = d.id; }
  }
}
ok(worstPad < 0.5, `pad wheel-contact error ${worstPad.toFixed(2)}m (worst ${worstId})`);
// road grade along every road (what the physics actually drives on)
let wg = 0, wr = '';
for (const r of ROADS) for (let i = 1; i < r.s.length; i++) {
  const a = r.s[i - 1], b = r.s[i], d = Math.hypot(b.x - a.x, b.z - a.z);
  const g = Math.abs(groundAt(b.x, b.z, b.h + 1) - groundAt(a.x, a.z, a.h + 1)) / d;
  if (g > wg) { wg = g; wr = `${r.id}#${i}`; }
}
ok(wg < GRADE_MAX * 1.6, `max driven grade ${(wg * 100).toFixed(0)}% (${wr})`);
// hollow camp sits in the valley (flood risk), ridge is a refuge
const hH = spotHeight('hollow'), rH = spotHeight('ridge');
ok(rH - hH > 3, `ridge ${(rH - hH).toFixed(1)}m above hollow (flood refuge)`);
ok(WATER_BASE > CREEK_BED && WATER_BASE < hH - 0.8, `normal creek level ${WATER_BASE} below the hollow pad ${hH.toFixed(2)}`);
// anti soft-lock: creek exit ramps exist every ~55m, and the world rim rises
let ramps = 0; for (let z = WORLD.z0; z < WORLD.z1; z += 5) if (creekRamp(z) > 0.9) ramps++;
ok(ramps >= 12, `creek exit ramps along the channel (${ramps} samples ≈ one every 55m)`);
const rim = [heightAt(WORLD.x0 + 3, 0), heightAt(WORLD.x1 - 3, 0), heightAt(0, WORLD.z0 + 3), heightAt(0, WORLD.z1 - 3)];
ok(rim.every((h, i) => h > heightAt([WORLD.x0 + 40, WORLD.x1 - 40, 0, 0][i], [0, 0, WORLD.z0 + 40, WORLD.z1 - 40][i]) + 5), 'world rim mountains close the map');
// no NaN anywhere
let nan = 0;
for (let x = WORLD.x0; x <= WORLD.x1; x += 9) for (let z = WORLD.z0; z <= WORLD.z1; z += 9) if (!Number.isFinite(heightAt(x, z))) nan++;
ok(nan === 0, 'terrain height finite everywhere');
// roads keep out of the creek except at the ford / bridge
let wet = 0; for (const r of ROADS) for (const p of r.s) if (!p.bridge && !p.ford && Math.abs(p.x - creekX(p.z)) < 5) wet++;
ok(wet === 0, 'road beds stay out of the creek (except ford/bridge)');
ok(NODES.some(n => n.bridge) && NODES.some(n => n.ford), 'network has a bridge and a ford');
// spatial road query agrees with brute force
let qbad = 0;
for (let k = 0; k < 200; k++) {
  const x = WORLD.x0 + 20 + ((k * 97) % 440), z = WORLD.z0 + 20 + ((k * 61) % 440);
  let best = 1e9; for (const r of ROADS) for (let i = 0; i < r.s.length - 1; i++) { const a = r.s[i], b = r.s[i + 1], abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz))); best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.z - abz * t)); }
  const q = roadQuery(x, z).d; if (best < 10 && Math.abs(q - best) > 0.01) qbad++;
}
ok(qbad === 0, 'road spatial hash matches brute force');
ok(SPOTS === DESTS, 'SPOTS alias = destinations');
process.exit(fail ? 1 : 0);
