// Event director: schedules & runs accidents (bear attack, landslide, flash flood, falling tree,
// wolves, deer visits, power trouble). Handles impacts (camera shake, glass cracks, hull damage).
import { THREE, G, P, bus, clamp, rng, lerp, smooth, isNight } from './core.js';
import { heightAt, creekX, SPOTS, WATER_BASE, spotHeight, roadQuery } from './terrain.js';
import { VEH, addObstacle, removeObstacles, applyImpulse, linkObstacles, toLocal } from './vehicle.js';
import { ROADS } from './roads.js';
import { W, setWeather, strike } from './weather.js';
import { C, WINDOWS, windowLocal } from './camper.js';
import { Z, spawnBear, spawnDeer, spawnWolves } from './animals.js';
import { glassShared } from './glass.js';
import { tex } from './assets.js';
import { VIEWS } from './view.js';
const QAview = () => VIEWS[P.get('view') || 'lounge'] || VIEWS.lounge;
import { treeKit } from './forest.js';

export const E = { active: null, cooldown: 25, log: [], slide: null, flood: { t: 0, on: false, peak: 0 }, fallen: null };
const R = rng(1234);

function warn(msg, level = 'info', ms = 4200) { bus.emit('toast', { msg, level, ms }); }

// ---------------------------------------------------------------- impacts
bus.on('impact', ({ from, power = 1, source, lp, ln, cause }) => {
  const S = G.state;
  // physical damage on the body where it was hit (dent + scratches), see damage.js
  if (lp) bus.emit('dent', { lp, ln, sev: clamp(power * 0.8, 0.1, 1.2), cause: cause || source });
  else if (from && G.camper) { // external hit without a contact point: dent the side facing the blow
    const d = from.clone().applyQuaternion(G.camper.quaternion.clone().invert()); d.y = 0; d.normalize();
    const l = new THREE.Vector3(d.x * 1.2, 1.1 + R() * 0.8, clamp(d.z * 4, -5.2, 3.2) + (R() - 0.5) * 1.5);
    bus.emit('dent', { lp: l, ln: d.clone().negate(), sev: clamp(power * 0.8, 0.1, 1.2), cause: source });
    // a charging bear (~250 kg at 6 m/s) really shoves the van: impulse at shoulder height rocks it on its springs
    if (source === 'bear') applyImpulse(G.camper.localToWorld(l.clone().setY(1.2)), from.clone().setY(0).normalize().multiplyScalar(-1500 * power));
  }
  const dmg = (source === 'bear' ? 9 : source === 'rock' ? 14 : source === 'tree' ? 22 : source === 'crash' ? 5 : 6) * power;
  // crashes / falls never finish the game (the map must never soft-lock): they bottom out at 8%
  S.hull = source === 'crash' ? Math.max(Math.min(S.hull, 8), S.hull - dmg) : Math.max(0, S.hull - dmg);
  S.calm = Math.max(0, S.calm - 12 * power);
  G.shake = Math.min(1.5, G.shake + 0.9 * power);
  // camper rocks physically
  G.rockV = (G.rockV || 0) + (from ? Math.sign(from.x || 1) : 1) * 0.06 * power;
  // crack the window closest to the impact direction
  if (from && G.camper && (source !== 'crash' || power > 0.6)) {
    const dirL = from.clone().applyQuaternion(G.camper.quaternion.clone().invert());
    let best = null, bd = -2;
    for (const w of WINDOWS) {
      if (w.wall === 'T' && source !== 'tree' && source !== 'rock') continue;
      const n = windowLocal(w).n; const d = n.dot(dirL);
      if (d > bd) { bd = d; best = w; }
    }
    if (best && R() < 0.75) {
      const u = C.glass[best.id].material.userData.u;
      u.uCrack.value = Math.min(1.2, u.uCrack.value + 0.45 * power);
      u.uCrackAt.value.set(0.3 + R() * 0.4, 0.3 + R() * 0.4);
      bus.emit('glasscrack', best.id);
    }
  }
  bus.emit('sfx', source === 'bear' ? 'bearhit' : source === 'crash' ? 'crash' : 'thud', power);
  if (S.hull <= 0) bus.emit('gameover', source);
});

// ---------------------------------------------------------------- landslide
// debris: instanced rocks + mud sheet sliding down the slope towards the camper
function buildSlide(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ map: tex('rock_face_diffuse', { srgb: true }), normalMap: tex('rock_face_nor_gl'), roughness: 0.9 });
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(0.75 + Math.sin(v.x * 5) * 0.12 + Math.cos(v.z * 4 + v.y * 3) * 0.12); p.setXYZ(i, v.x, v.y * 0.8, v.z); }
  g.computeVertexNormals();
  const N = 70;
  const im = new THREE.InstancedMesh(g, rockMat, N);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.visible = false;
  scene.add(im);
  const mud = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 30, 30), new THREE.MeshStandardMaterial({
    map: tex('mud_forest_diffuse', { srgb: true, repeat: 3 }), normalMap: tex('mud_forest_nor_gl', { repeat: 3 }), roughness: 0.35, color: 0x8a7a66,
  }));
  mud.visible = false; mud.receiveShadow = true; mud.castShadow = true; scene.add(mud);
  // dust
  const dg = new THREE.BufferGeometry(); const dn = 400;
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dn * 3), 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x6b5a48, size: 1.6, transparent: true, opacity: 0.35, depthWrite: false, map: softDot() }));
  dust.frustumCulled = false; dust.visible = false; scene.add(dust);
  E.slide = { im, mud, dust, rocks: [], on: false, t: 0 };
}
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

function syncSlide(s) {
  // every rock of the slide is a physical body (vehicle.js obstacles): draw them where they are
  s.bodies.forEach((o, i) => { _s.setScalar(o.r / 0.9); s.im.setMatrixAt(i, _m.compose(o.p, o.q, _s)); });
  for (let i = s.bodies.length; i < s.im.count; i++) s.im.setMatrixAt(i, _m.makeScale(0, 0, 0));
  s.im.instanceMatrix.needsUpdate = true;
}
export function startLandslide() {
  const s = E.slide; if (!s || s.on) return false;
  removeObstacles('slide'); s.done = false;
  const c = G.camper.position;
  // uphill direction = gradient of height
  const e = 2, gx = heightAt(c.x + e, c.z) - heightAt(c.x - e, c.z), gz = heightAt(c.x, c.z + e) - heightAt(c.x, c.z - e);
  const up = new THREE.Vector2(gx, gz); if (up.length() < 0.01) up.set(1, 0); up.normalize();
  // size of the slide scales with how much steep ground there is above the van
  let above = 0; for (let k = 10; k <= 40; k += 10) above = Math.max(above, heightAt(c.x + up.x * k, c.z + up.y * k) - c.y);
  const scale = clamp(above / 10, 0.35, 1.3);
  s.on = true; s.t = 0; s.up = up; s.scale = scale; s.bodies = []; s.src = new THREE.Vector2(c.x + up.x * 36, c.z + up.y * 36);
  const side = new THREE.Vector2(-up.y, up.x), n = Math.round(24 + 36 * scale);
  s.queue = [];
  for (let i = 0; i < Math.min(n, s.im.count); i++) {
    const along = 26 + R() * 22, lat = (R() - 0.5) * 18 * (0.6 + scale * 0.4);
    const x = c.x + up.x * along + side.x * lat, z = c.z + up.y * along + side.y * lat;
    const r = (0.22 + Math.pow(R(), 2.2) * 1.05) * (0.7 + scale * 0.35);
    s.queue.push({ x, z, r, delay: R() * 3.5 * (0.7 + scale * 0.3) });
  }
  // the flowing mud sheet: a moving heavy-fluid zone the van floats / wades in (vehicle.js)
  s.mudZ = { x: s.src.x, z: s.src.y, r: 8 * (0.6 + scale * 0.4), depth: 0.35 + 0.45 * scale, vx: 0, vz: 0, slide: true };
  G.mudZones.push(s.mudZ);
  s.im.visible = true; s.mud.visible = true; s.dust.visible = true;
  bus.emit('sfx', 'rumble', 1);
  warn(scale > 0.9 ? '⚠ 地鳴り…！ 山側で大規模な土砂崩れ！' : '⚠ 地鳴り…！ 山側で土砂崩れ！', 'danger', 5000);
  G.shake = 0.5;
  return true;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function updateSlide(dt) {
  const s = E.slide; if (!s || !s.on) return;
  s.t += dt;
  // release queued rocks as bodies (they slide & roll down the real slope under gravity)
  for (let i = s.queue.length - 1; i >= 0; i--) {
    const q = s.queue[i]; if (s.t < q.delay) continue;
    const o = addObstacle(new THREE.Vector3(q.x, heightAt(q.x, q.z) + q.r + 0.3, q.z), q.r * 0.9, { tag: 'slide', v: new THREE.Vector3(-s.up.x * 4, -1, -s.up.y * 4) });
    s.bodies.push(o); s.queue.splice(i, 1);
  }
  // mud front: flows downhill along the fall line, slows on flat ground, spreads and thins
  const m = s.mudZ;
  if (m) {
    const e = 1.5, gx = (heightAt(m.x + e, m.z) - heightAt(m.x - e, m.z)) / (2 * e), gz = (heightAt(m.x, m.z + e) - heightAt(m.x, m.z - e)) / (2 * e);
    const g = Math.hypot(gx, gz), acc = 9.81 * (g - 0.08);                       // Bingham-ish: stops below ~8% grade
    const dir = g > 1e-3 ? [-gx / g, -gz / g] : [0, 0];
    m.vx += (dir[0] * acc - m.vx * 0.35) * dt; m.vz += (dir[1] * acc - m.vz * 0.35) * dt;
    if (acc < 0) { m.vx *= 1 - Math.min(1, dt * 0.6); m.vz *= 1 - Math.min(1, dt * 0.6); }
    const sp = Math.hypot(m.vx, m.vz); if (sp > 9) { m.vx *= 9 / sp; m.vz *= 9 / sp; }
    m.x += m.vx * dt; m.z += m.vz * dt;
    m.r = Math.min(14 * (0.6 + s.scale * 0.4), m.r + dt * 0.6);
    if (s.t > 14) m.depth = Math.max(0.12, m.depth - dt * 0.01);
    if (s.t > 25 && sp < 0.3) { m.vx = m.vz = 0; }
  }
  syncSlide(s);
  G.shake = Math.max(G.shake, 0.35 * smooth(0, 1, s.t) * (1 - smooth(8, 14, s.t)));
  // mud sheet mesh follows the flow
  if (m) {
    s.mud.position.set(m.x, 0, m.z); s.mud.rotation.set(0, Math.atan2(s.up.x, s.up.y), 0);
    s.mud.scale.set(m.r * 1.9, 1, m.r * 2.2 + 8);
    const mp = s.mud.geometry.attributes.position;
    if (!s.mudInit) { s.mud.geometry.rotateX(-Math.PI / 2); s.mudInit = true; }
    s.mud.updateMatrixWorld();
    for (let i = 0; i < mp.count; i++) {
      _p.set(mp.getX(i), 0, mp.getZ(i)); s.mud.localToWorld(_p);
      const edge = 1 - Math.pow(Math.hypot(mp.getX(i), mp.getZ(i)) * 2, 3);
      mp.setY(i, heightAt(_p.x, _p.z) + 0.05 + m.depth * Math.max(0, edge) * smooth(0, 3, s.t));
    }
    mp.needsUpdate = true; s.mud.geometry.computeVertexNormals();
  }
  // dust
  const dp = s.dust.geometry.attributes.position;
  if (s.bodies.length) for (let i = 0; i < dp.count; i++) {
    const r = s.bodies[i % s.bodies.length].p;
    dp.setXYZ(i, r.x + Math.sin(i * 7.1 + s.t) * 2, r.y + (i % 7) * 0.4 + s.t * 0.1, r.z + Math.cos(i * 3.3 + s.t) * 2);
  }
  dp.needsUpdate = true;
  s.dust.material.opacity = 0.4 * (1 - smooth(10, 30, s.t));
  if (s.t > 16 && !s.done) {
    s.done = true; bus.emit('slidesettled');
    let onRoad = 0; for (const o of s.bodies) if (o.r > 0.45 && roadQuery(o.p.x, o.p.z).d < 3.5) onRoad++;
    warn(onRoad ? `土砂が道をふさいだ（岩${onRoad}個）。押しのけるか迂回する` : '土砂は手前で止まった…', 'warn');
  }
  if (s.t > 600) { s.on = false; s.im.visible = s.mud.visible = s.dust.visible = false; removeObstacles('slide'); G.mudZones.splice(G.mudZones.indexOf(m), 1); s.mudZ = null; }
}

// ---------------------------------------------------------------- flood
export function startFlood() {
  const f = E.flood; if (f.on) return false;
  f.on = true; f.t = 0;
  // world flood level: the valley floor (hollow pad) goes ~60cm under; anything a few metres up stays dry
  f.peak = spotHeight('hollow') + 0.62;
  if (W.mode !== 'storm' && W.mode !== 'rain') setWeather('rain');
  warn('⚠ 上流で鉄砲水！ 沢が増水しています', 'danger', 5200);
  bus.emit('sfx', 'flood', 1);
  return true;
}
function updateFlood(dt) {
  const f = E.flood;
  const base = WATER_BASE + G.rainAccum * 0.35;
  if (!f.on) { G.waterLevel += (base - G.waterLevel) * dt * 0.05; G.floodK = Math.max(0, (G.floodK || 0) - dt * 0.05); return; }
  f.t += dt;
  const rise = smooth(0, 35, f.t), fall = smooth(120, 200, f.t);
  const target = lerp(base, f.peak, rise * (1 - fall));
  G.waterLevel += (target - G.waterLevel) * Math.min(1, dt * 0.8);
  // current strength (vehicle.js waterFlowAt): strongest on the rising limb of the flood wave
  G.floodK = clamp(smooth(0, 20, f.t) * (1 - smooth(90, 200, f.t)) * 1.1);
  if (G.camper) {
    const sub = G.waterLevel - G.camper.position.y;
    if (sub > 0.35 && !f.warned) { f.warned = true; warn('水がタイヤを越えた！ 高台へ避難を！', 'danger'); }
    if (sub > 0.55) {
      G.state.hull = Math.max(0, G.state.hull - dt * 0.8);
      G.state.battery = Math.max(0, G.state.battery - dt * 0.3);
      G.state.calm = Math.max(0, G.state.calm - dt * 1.2);
      G.shake = Math.max(G.shake, 0.08);
      // flooding never destroys the van outright (the current carries it; the player can drive out)
      G.state.hull = Math.max(G.state.hull, 6);
    }
  }
  if (f.t > 200) { f.on = false; f.warned = false; warn('水が引いていく…', 'info'); }
}

// ---------------------------------------------------------------- falling tree
let treeMesh = null;
function buildFallingTree(scene) {
  // same procedural conifer as the forest (bark + twig cards), scaled a bit
  treeMesh = new THREE.Group();
  const trunk = new THREE.Mesh(treeKit.trunk, treeKit.bark);
  const crown = new THREE.Mesh(treeKit.cards, treeKit.needles);
  for (const m of [trunk, crown]) { m.castShadow = true; m.receiveShadow = true; treeMesh.add(m); }
  treeMesh.scale.setScalar(0.85);
  treeMesh.visible = false; scene.add(treeMesh);
}
export function startTreeFall() {
  if (!treeMesh || (E.fallen && !E.fallen.done)) return false;
  removeObstacles('tree');
  const c = G.camper.position, a = Math.atan2(-VEH.fwd.x, -VEH.fwd.z);
  // while driving, the tree comes down across the road AHEAD (a road block the autopilot must handle)
  const ahead = G.driving && VEH.speed > 1;
  const side = R() < 0.5 ? -1 : 1;
  const fwd = new THREE.Vector3(VEH.fwd.x, 0, VEH.fwd.z).normalize();
  const base = ahead
    ? new THREE.Vector3(c.x + fwd.x * 22 - fwd.z * 7 * side, 0, c.z + fwd.z * 22 + fwd.x * 7 * side)
    : new THREE.Vector3(c.x + Math.cos(a) * 9 * side, 0, c.z - Math.sin(a) * 9 * side);
  base.y = heightAt(base.x, base.z) - 0.2;
  treeMesh.position.copy(base); treeMesh.rotation.set(0, 0, 0); treeMesh.quaternion.identity(); treeMesh.visible = true;
  // falling direction (horizontal unit vector toward the van / across the road)
  const dir = ahead ? new THREE.Vector3(fwd.z * side, 0, -fwd.x * side) : new THREE.Vector3(-Math.cos(a) * side, 0, Math.sin(a) * side);
  const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize(); // rotating +Y about axis tips the top toward dir
  // rest angle: on the camper roof edge (parked) or flat on the ground (road block)
  const rise = c.y + 2.95 - base.y, run = 9 - 1.2;
  E.fallen = { t: 0, axis, dir, hit: false, ang: 0, v: 0, maxA: ahead ? Math.PI / 2 - 0.06 : Math.atan2(run, rise), ahead, base: base.clone() };
  strike(true);
  warn(ahead ? 'バキバキッ…！ 前方に木が倒れてくる！' : 'バキバキッ…！ 木が倒れてくる！', 'danger', 3500);
  bus.emit('sfx', 'crack', 1);
  return true;
}
function updateTree(dt) {
  const f = E.fallen; if (!f || f.done) return;
  f.t += dt;
  if (f.t < 1.2) { treeMesh.rotation.z = Math.sin(f.t * 30) * 0.004; return; }
  if (f.ang < f.maxA) { f.v += dt * 1.6 * Math.sin(f.ang + 0.15); f.ang = Math.min(f.maxA, f.ang + f.v * dt); }
  else if (!f.hit) {
    f.hit = true; f.v = 0;
    if (f.ahead) {
      // the trunk becomes ONE rigid log (a linked chain of segments, ~1.2 t, thicker at the butt)
      // lying across the road: the van can shove / pivot it, or get blocked by it
      removeObstacles('tree');
      const segs = [];
      for (let k = 2; k < 15; k += 1.2) {
        const r = 0.42 - k * 0.012, x = f.base.x + f.dir.x * k, z = f.base.z + f.dir.z * k;
        segs.push(addObstacle(new THREE.Vector3(x, heightAt(x, z) + r * 0.9, z), r, { tag: 'tree', m: 700 * r * r * 3.14 * 1.2 }));
      }
      linkObstacles(segs); f.segs = segs;
      G.shake = Math.max(G.shake, 0.6); bus.emit('sfx', 'thud', 0.8);
    } else {
      // the trunk lands on the roof: dent where it hits + the skylight cracks, the van is pushed down/sideways
      const hitW = G.camper.localToWorld(new THREE.Vector3(0, 2.95, -0.8));
      bus.emit('impact', { from: new THREE.Vector3(0, 1, 0), power: 1.2, source: 'tree', lp: toLocal(hitW), ln: new THREE.Vector3(0, -1, 0), cause: 'tree' });
      const u = C.glass.sky1?.material.userData.u; if (u) u.uCrack.value = 1;
      applyImpulse(hitW, f.dir.clone().multiplyScalar(2600).setY(-6000));
    }
  }
  if (f.segs && f.segs.length > 1) { // the mesh follows the physical log (pushed / rotated by the van)
    const a = f.segs[0].p, b = f.segs[f.segs.length - 1].p, d = _p.subVectors(b, a).normalize();
    treeMesh.quaternion.setFromUnitVectors(_s.set(0, 1, 0), d);
    treeMesh.position.copy(a).addScaledVector(d, -2); treeMesh.position.y -= 0.35; // segs[0] sits 2 m up the trunk from its base
  } else treeMesh.quaternion.setFromAxisAngle(f.axis, f.ang);
  // parked hit: once the van drives away the tree slides off the roof and ends up on the ground
  if (f.hit && !f.ahead && G.camper.position.distanceTo(f.base) > 11) { f.maxA = Math.PI / 2 - 0.06; f.ahead = true; f.hit = false; f.segs = null; }
  // clean up long after (so another tree can fall later)
  if (f.t > 400) { f.done = true; treeMesh.visible = false; removeObstacles('tree'); }
}

// ---------------------------------------------------------------- power
export function powerTick(dt) {
  const S = G.state;
  const draw = (S.lightsOn && !S.hiding ? 0.05 : 0) + (S.spotOn ? 0.35 : 0) + (S.heater ? 0.12 : 0) + (S.cooking > 0 ? 0.1 : 0) + 0.01;
  const solar = G.daylight * (1 - G.cloud * 0.8) * 0.22;
  const gen = S.generator ? 0.5 : 0;
  S.battery = clamp(S.battery + (solar + gen - draw) * dt * 0.35, 0, 100);
  // slow field repair while parked safely (tools + generator power); never while driving or flooded
  if (!G.driving && (G.submerge || 0) < 0.3 && S.hull < 100) S.hull = Math.min(100, S.hull + dt * (S.generator ? 0.12 : 0.03));
  if (S.battery <= 0.01 && (S.lightsOn || S.spotOn)) { S.lightsOn = false; S.spotOn = false; warn('バッテリー切れ… 真っ暗だ', 'warn'); bus.emit('sfx', 'powerdown'); }
}

// ---------------------------------------------------------------- director
const EVENTS = {
  deer: { w: () => (G.hour > 5 && G.hour < 9 || G.hour > 16 && G.hour < 20) ? 3 : 0.6, run: spawnDeer, cd: 60 },
  bear: { w: () => (isNight() ? 1.6 : 0.4) * (1 + G.state.smell * 2), run: () => { const ok = spawnBear('prowl'); if (ok) warn('…何かが外を歩いている。重い足音', 'warn'); return ok; }, cd: 120 },
  wolves: { w: () => isNight() && W.mode !== 'storm' ? 0.8 : 0, run: () => { const ok = spawnWolves(); if (ok) warn('遠吠えが近づいてくる…', 'warn'); return ok; }, cd: 110 },
  landslide: { w: () => G.rainAccum > 0.4 ? 1.4 * G.rainAccum : 0, run: startLandslide, cd: 240 },
  flood: { w: () => G.rainAccum > 0.35 ? 1.5 * G.rainAccum : 0, run: startFlood, cd: 260 },
  tree: { w: () => W.mode === 'storm' ? 0.9 : 0, run: startTreeFall, cd: 400 },
  stormroll: { w: () => W.mode === 'rain' ? 0.6 : W.mode === 'clear' || W.mode === 'cloudy' ? 0.35 : 0.1, run: () => { const m = W.mode === 'rain' ? 'storm' : W.mode === 'storm' ? 'rain' : R() < 0.5 ? 'rain' : 'cloudy'; setWeather(m); warn({ rain: '雨が降り出した…屋根を叩く音が心地いい', storm: '風が強まってきた。嵐になりそうだ', cloudy: '雲が広がってきた' }[m] || '', 'info'); return true; }, cd: 150 },
  clearup: { w: () => W.mode === 'storm' || W.mode === 'rain' ? 0.4 : W.mode === 'fog' ? 0.8 : 0, run: () => { setWeather(R() < 0.5 ? 'clear' : 'fog'); warn(W.mode === 'fog' ? '霧が森を包み込んでいく' : '雨が上がった。森が静かになる', 'info'); return true; }, cd: 150 },
};
const lastRun = {};

export function buildEvents(scene) {
  buildSlide(scene); buildFallingTree(scene);
  const forced = P.get('event');
  // QA: trigger synchronously after init (main.js calls startForcedEvent) so it is always in frame 1.
  if (forced && !P.has('qa')) setTimeout(() => triggerEvent(forced), 3000);
}

export function startForcedEvent(name) { const f = name || P.get('event'); if (f && (P.has('qa') || name)) triggerEvent(f); }

export function triggerEvent(name) {
  const e = EVENTS[name] || { run: { deer: spawnDeer }[name] };
  // QA staging: put subjects on the current seat's line of sight (camper-local -> world),
  // so screenshots are deterministic and actually show the event.
  const stage = (dist, lateral = 0) => {
    const e = new THREE.Euler(0, (QAview().yaw || 0), 0, 'YXZ');
    const f = new THREE.Vector3(0, 0, -1).applyEuler(e), r = new THREE.Vector3(1, 0, 0).applyEuler(e);
    const lp = new THREE.Vector3(...(QAview().pos || [0, 0, 0])).addScaledVector(f, dist).addScaledVector(r, lateral);
    const wp = G.camper.localToWorld(lp); wp.y = heightAt(wp.x, wp.z);
    const face = Math.atan2(G.camper.position.x - wp.x, G.camper.position.z - wp.z); // look at the van
    return { wp, face };
  };
  if (name === 'bear' && P.has('qa')) {
    // Geometry (verified in tools/agents/view_test.mjs): floor is 0.72m up and the dinette sill is at
    // 1.58m, so from the seat only ground >=3.9m from the wall is visible. Stage the reared bear
    // 6m out on the seat's line of sight, looking at the lit window.
    spawnBear('prowl'); const b = Z.bear; const { wp, face } = stage(7.0, 0.0);
    b.pos.copy(wp); b.heading = face; b.obj.rotation.y = b.heading; b.rear = 1; b.state = 'sniff'; b.t = 0; b.qaHold = true; return;
  }
  if (name === 'deer' && P.has('qa')) {
    spawnDeer();
    Z.deer.concat(Z.fawns).forEach((d, i) => { const { wp, face } = stage(10 + i * 1.3, (i - 1.5) * 1.8); d.pos.copy(wp); d.target.copy(wp); d.state = 'graze'; d.heading = face + 1.2 + i * 0.5; d.obj.rotation.y = d.heading; });
    return;
  }
  if (name === 'flood' && P.has('qa')) { startFlood(); E.flood.t = 40; G.waterLevel = E.flood.peak; return; }
  if (name === 'landslide' && P.has('qa')) { startLandslide(); return; }
  e.run && e.run();
  lastRun[name] = G.t;
}

export function updateEvents(dt) {
  // rain accumulation drives floods & slides
  G.rainAccum = clamp(G.rainAccum + (G.rain > 0.5 ? dt * 0.0035 * G.rain : -dt * 0.001) * G.timeMul);
  updateSlide(dt); updateFlood(dt); updateTree(dt); powerTick(dt);
  // stress/calm
  const S = G.state;
  const threat = (Z.bear?.active ? 1 : 0) + (Z.wolves?.[0]?.active ? 0.5 : 0) + (E.flood.on ? 0.6 : 0) + (E.slide?.on && !E.slide.done ? 0.8 : 0);
  const cozy = (S.lightsOn ? 0.4 : 0) + (C.curtainLevel > 0.5 ? 0.3 : 0) + (G.rain > 0.2 && threat === 0 ? 0.5 : 0) + (S.cooking > 0 ? 0.6 : 0) + (S.heater ? 0.3 : 0);
  S.calm = clamp(S.calm + (cozy * 0.6 - threat * 1.4) * dt * 0.5, 0, 100);
  S.smell = Math.max(0, S.smell - dt * 0.004);
  S.noise = Math.max(0, S.noise - dt * 0.5);
  if (S.cooking > 0) { S.cooking -= dt; S.smell = Math.min(1, S.smell + dt * 0.02); }
  if (P.has('qa') && P.has('event')) return; // deterministic screenshots
  if (P.has('noevents')) return;
  // director
  E.cooldown -= dt * G.timeMul;
  if (E.cooldown > 0 || threat > 0) return;
  const pool = Object.entries(EVENTS).filter(([k, e]) => !(lastRun[k] && G.t - lastRun[k] < e.cd)).map(([k, e]) => [k, e.w()]).filter(x => x[1] > 0);
  const tot = pool.reduce((a, b) => a + b[1], 0);
  if (!tot) { E.cooldown = 10; return; }
  let r = R() * tot;
  for (const [k, w] of pool) { r -= w; if (r <= 0) { const ok = EVENTS[k].run(); if (ok !== false) lastRun[k] = G.t; break; } }
  E.cooldown = 35 + R() * 50;
}
