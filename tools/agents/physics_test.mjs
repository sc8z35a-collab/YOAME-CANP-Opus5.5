// Vehicle-physics behaviour checks (no WebGL): each scenario asserts a qualitative real-world
// behaviour of a 3.6 t motorhome.  node tools/agents/physics_test.mjs [-v]
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) }; globalThis.location = { search: '' };
globalThis.window = { addEventListener() {} }; globalThis.localStorage = { getItem() { return null; } };
const { G } = await import('../../js/core.js');
const V = await import('../../js/vehicle.js'); const T = await import('../../js/terrain.js');
const THREE = await import('../../js/lib/three.module.js');
const verbose = process.argv.includes('-v');
const VEH = V.VEH, C = VEH.ctrl;
let fail = 0;
const ok = (c, name, info) => { console.log(`${c ? 'PASS' : 'FAIL'} ${name}  ${info}`); if (!c) fail++; };
function reset(spot = 'hollow', rot) { G.waterLevel = -2.05; G.wet = 0; G.rain = 0; G.floodK = 0; G.mudZones.length = 0; VEH.obstacles.length = 0; const d = T.SPOTS[spot]; V.setPose(d.x, d.z, rot ?? d.rot); Object.assign(C, { throttle: 0, steer: 0, brake: 1, hand: true, range: '2H' }); run(1); }
function run(sec, f) { for (let i = 0; i < sec * 60; i++) { G.t += 1 / 60; f && f(i / 60); V.updateVehicle(1 / 60, null); } }
function launch(v, gear = 1) { // put the van at speed v (m/s) going straight
  VEH.v.copy(VEH.fwd).multiplyScalar(v); VEH.wheels.forEach(W => W.w = v / V.WHEEL_R);
  Object.assign(VEH.drive, { mode: 'D', gear }); Object.assign(C, { hand: false, brake: 0, throttle: 0.2 });
}
// flat straight test strip: the valley road north of the hollow (dir +z ≈ rot π)
const flat = () => reset('hollow', Math.PI);

// 1) parked on a road grade with the handbrake: stands still
{ reset('switch1'); const p0 = V.originOf().clone(); run(6); const d = V.originOf().distanceTo(p0);
  ok(d < 0.1, 'parked on a grade holds (P + handbrake)', `drift ${d.toFixed(3)}m, grade ${(T.slopeAt(p0.x, p0.z) * 100).toFixed(0)}%`); }

// 2) braking distance: wet > dry, both plausible (ABS)
function brakeDist(wet) {
  flat(); G.wet = wet; G.rain = wet; launch(13.9, 4); run(0.3);
  const p0 = V.originOf().clone(); Object.assign(C, { throttle: 0, brake: 1 }); let t = 0;
  while (VEH.speed > 0.2 && t < 12) { run(1 / 60); t += 1 / 60; }
  return V.originOf().distanceTo(p0);
}
{ const dry = brakeDist(0), wet = brakeDist(1);
  ok(dry > 12 && dry < 30 && wet > dry * 1.2, 'braking 50 km/h: wet gravel stops longer than dry', `dry ${dry.toFixed(1)}m / wet ${wet.toFixed(1)}m`); }

// 3) sharp turn too fast: tyres let go (slides) and the tall body leans hard / tips
{ flat(); launch(16, 4); let maxRoll = 0, maxSlip = 0, minUp = 1;
  run(2.5, () => { C.steer = 0.7; C.throttle = 0.3; maxRoll = Math.max(maxRoll, Math.abs(VEH.roll)); maxSlip = Math.max(maxSlip, VEH.skid); minUp = Math.min(minUp, VEH.up.y); });
  ok(maxSlip > 1 && maxRoll > 0.08, 'full lock at 58 km/h: tyres slide & body rolls', `slip ${maxSlip.toFixed(1)}m/s, roll ${(maxRoll * 57.3).toFixed(0)}°, minUp ${minUp.toFixed(2)}`); }
{ flat(); launch(19, 5); let minUp = 1; G.wet = 0; VEH.wheels.forEach(W => W.mu = 1.1);
  run(3, () => { C.steer = 0.7; minUp = Math.min(minUp, VEH.up.y); });
  if (verbose) console.log('   (fishhook minUp', minUp.toFixed(2), ')'); }

// 4) creek current pushes a floating van downstream (-z), and water gets inside
{ reset('creekN'); const x = T.creekX(30); V.setPose(x, 30, Math.PI / 2, 0.3); G.waterLevel = -0.3; G.floodK = 1;
  Object.assign(C, { hand: false, brake: 0 }); const z0 = V.originOf().z; run(20);
  const dz = V.originOf().z - z0;
  ok(dz < -4, 'flash flood carries the van downstream', `moved ${dz.toFixed(1)}m along the creek, ingress ${(VEH.ingress * 100).toFixed(0)}%, submerged ${(VEH.submerged * 100).toFixed(0)}%`); }

// 5) deep mud: spinning tyres dig in and the van gets stuck (2H), 4L crawls better
function mudRun(range) {
  reset('hollow', Math.PI); const o = V.originOf(); G.wet = 1; G.rain = 1;
  G.mudZones.push({ x: o.x, z: o.z + 8, r: 14, depth: 0, vx: 0, vz: 0 });
  Object.assign(C, { hand: false, brake: 0, throttle: 1, range }); const z0 = o.z; let maxDig = 0;
  run(15, () => { maxDig = Math.max(maxDig, ...VEH.wheels.map(W => W.dig)); });
  return { d: V.originOf().z - z0, dig: maxDig };
}
{ const a = mudRun('2H'), b = mudRun('4L');
  ok(a.dig > 0.05, 'full throttle in slide mud: wheels spin and dig ruts', `2H moved ${a.d.toFixed(1)}m dig ${(a.dig * 100).toFixed(0)}cm / 4L moved ${b.d.toFixed(1)}m dig ${(b.dig * 100).toFixed(0)}cm`);
  ok(b.d > a.d, '4L + locker gets further than 2H in mud', ''); }

// 6) boulders: a small rock barely moves the van, a big fast one shoves it (momentum)
function rockHit(r, v) {
  flat(); const o = V.originOf(); let hits = 0; const off = () => hits++;
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(VEH.q); side.y = 0; side.normalize();
  const p = o.clone().addScaledVector(side, 6); p.y = T.heightAt(p.x, p.z) + r + 0.6; p.y = Math.max(p.y, o.y + 1.2);
  V.addObstacle(p, r, { v: side.clone().multiplyScalar(-v), tag: 'slide' });
  const x0 = o.clone(); run(3);
  return V.originOf().distanceTo(x0);
}
{ const s = rockHit(0.35, 6), b = rockHit(1.1, 6);
  ok(b > s * 3 && b > 0.4, 'big boulder shoves the van far more than a small stone', `small ${s.toFixed(2)}m / big ${b.toFixed(2)}m`); }

// 7) driving into a tree trunk at speed: stops hard and reports an impact (damage)
{ flat(); let imp = 0; const { bus } = await import('../../js/core.js'); const h = e => imp = Math.max(imp, e.power || e.sev || 0); bus.on('impact', h); bus.on('dent', h);
  const o = V.originOf(), f = VEH.fwd.clone(); f.y = 0; f.normalize();
  const { colliders } = await import('../../js/forest.js'); colliders.push({ x: o.x + f.x * 12, z: o.z + f.z * 12, r: 0.5 });
  launch(8, 2); run(4); colliders.pop();
  ok(imp > 0.1 && VEH.speed < 2, 'hitting a tree at 29 km/h stops the van and damages it', `impact power ${imp.toFixed(2)}, speed after ${VEH.speed.toFixed(1)}`); }

process.exit(fail ? 1 : 0);
