// Event director: schedules & runs accidents (bear attack, landslide, flash flood, falling tree,
// wolves, deer visits, power trouble). Handles impacts (camera shake, glass cracks, hull damage).
import { THREE, G, P, bus, clamp, rng, lerp, smooth, isNight } from './core.js';
import { heightAt, creekX, SPOTS, WATER_BASE, spotHeight } from './terrain.js';
import { W, setWeather, strike } from './weather.js';
import { C, WINDOWS, windowLocal } from './camper.js';
import { Z, spawnBear, spawnDeer, spawnWolves } from './animals.js';
import { glassShared } from './glass.js';
import { tex } from './assets.js';
import { treeKit } from './forest.js';

export const E = { active: null, cooldown: 25, log: [], slide: null, flood: { t: 0, on: false, peak: 0 }, fallen: null };
const R = rng(1234);

function warn(msg, level = 'info', ms = 4200) { bus.emit('toast', { msg, level, ms }); }

// ---------------------------------------------------------------- impacts
bus.on('impact', ({ from, power = 1, source }) => {
  const S = G.state;
  const dmg = (source === 'bear' ? 9 : source === 'rock' ? 14 : source === 'tree' ? 22 : 6) * power;
  S.hull = Math.max(0, S.hull - dmg);
  S.calm = Math.max(0, S.calm - 12 * power);
  G.shake = Math.min(1.5, G.shake + 0.9 * power);
  // camper rocks physically
  G.rockV = (G.rockV || 0) + (from ? Math.sign(from.x || 1) : 1) * 0.06 * power;
  // crack the window closest to the impact direction
  if (from && G.camper) {
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
  bus.emit('sfx', source === 'bear' ? 'bearhit' : 'thud', power);
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

export function startLandslide() {
  const s = E.slide; if (!s || s.on) return false;
  const c = G.camper.position;
  // uphill direction = gradient of height
  const e = 2, gx = heightAt(c.x + e, c.z) - heightAt(c.x - e, c.z), gz = heightAt(c.x, c.z + e) - heightAt(c.x, c.z - e);
  let up = new THREE.Vector2(gx, gz); if (up.length() < 0.01) up.set(1, 0); up.normalize();
  const hit = G.camperSpot === 'ridge' ? 1 : 0.35; // ridge = direct hit; hollow = debris stops short
  s.on = true; s.t = 0; s.up = up; s.hit = hit; s.rocks = []; s.impacted = false;
  const side = new THREE.Vector2(-up.y, up.x);
  for (let i = 0; i < s.im.count; i++) {
    const along = 28 + R() * 30, lat = (R() - 0.5) * 16;
    const x = c.x + up.x * along + side.x * lat, z = c.z + up.y * along + side.y * lat;
    s.rocks.push({ x, z, y: heightAt(x, z) + 1, vx: 0, vz: 0, vy: 0, r: 0.25 + Math.pow(R(), 2) * 1.1, rot: new THREE.Euler(R() * 6, R() * 6, R() * 6), delay: R() * 3.5, stopAt: (hit > 0.9 ? -6 : 9) + R() * 5 });
  }
  s.im.visible = true; s.mud.visible = true; s.dust.visible = true;
  bus.emit('sfx', 'rumble', 1);
  warn('⚠ 地鳴り…！ 山側で土砂崩れ！', 'danger', 5000);
  G.shake = 0.5;
  return true;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function updateSlide(dt) {
  const s = E.slide; if (!s || !s.on) return;
  s.t += dt;
  const c = G.camper.position;
  G.shake = Math.max(G.shake, 0.35 * smooth(0, 1, s.t) * (1 - smooth(8, 14, s.t)));
  let front = 1e9;
  s.rocks.forEach((r, i) => {
    if (s.t > r.delay) {
      const along = (r.x - c.x) * s.up.x + (r.z - c.z) * s.up.y;
      const g = 9.8 * 0.35;
      if (along > r.stopAt) { r.vx -= s.up.x * g * dt; r.vz -= s.up.y * g * dt; }
      else { r.vx *= 0.9; r.vz *= 0.9; }
      r.x += r.vx * dt; r.z += r.vz * dt;
      const h = heightAt(r.x, r.z) + r.r * 0.6;
      r.vy -= 9.8 * dt; r.y += r.vy * dt; if (r.y < h) { r.y = h; r.vy = Math.abs(r.vy) * 0.3 + Math.hypot(r.vx, r.vz) * 0.08; }
      const sp = Math.hypot(r.vx, r.vz);
      r.rot.x += sp * dt / r.r; r.rot.z += sp * dt / r.r * 0.3;
      front = Math.min(front, along);
      // hits camper
      _p.set(r.x, r.y, r.z); G.camper.worldToLocal(_p);
      if (Math.abs(_p.x) < 1.3 + r.r && _p.z > -5.4 && _p.z < 3.4 && _p.y < 3.2 && sp > 1.5 && !r.hitDone) {
        r.hitDone = true; r.vx *= -0.2; r.vz *= -0.2;
        bus.emit('impact', { from: new THREE.Vector3(s.up.x, 0.2, s.up.y), power: clamp(r.r * sp * 0.12, 0.2, 1.3), source: 'rock' });
      }
    }
    _q.setFromEuler(r.rot); _s.setScalar(r.r); _p.set(r.x, r.y, r.z);
    _m.compose(_p, _q, _s); s.im.setMatrixAt(i, _m);
  });
  s.im.instanceMatrix.needsUpdate = true;
  // mud sheet follows the front
  const len = Math.max(2, 60 - Math.max(front, s.hit > 0.9 ? -4 : 8));
  const mid = Math.max(front, -4) + len / 2;
  s.mud.position.set(c.x + s.up.x * mid, 0, c.z + s.up.y * mid);
  s.mud.rotation.set(0, Math.atan2(s.up.x, s.up.y), 0);
  s.mud.scale.set(18, 1, len);
  const mp = s.mud.geometry.attributes.position;
  if (!s.mudInit) { s.mud.geometry.rotateX(-Math.PI / 2); s.mudInit = true; }
  s.mud.updateMatrixWorld();
  for (let i = 0; i < mp.count; i++) {
    _p.set(mp.getX(i), 0, mp.getZ(i)); s.mud.localToWorld(_p);
    const edge = 1 - Math.pow(Math.abs(mp.getX(i)) * 2, 4);
    mp.setY(i, heightAt(_p.x, _p.z) + 0.08 + 0.35 * edge * smooth(0, 3, s.t));
  }
  mp.needsUpdate = true; s.mud.geometry.computeVertexNormals();
  // dust
  const dp = s.dust.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const r = s.rocks[i % s.rocks.length];
    dp.setXYZ(i, r.x + Math.sin(i * 7.1 + s.t) * 2, r.y + (i % 7) * 0.4 + s.t * 0.1, r.z + Math.cos(i * 3.3 + s.t) * 2);
  }
  dp.needsUpdate = true;
  s.dust.material.opacity = 0.4 * (1 - smooth(10, 30, s.t));
  if (s.t > 14 && !s.done) { s.done = true; bus.emit('slidesettled'); warn(G.camperSpot === 'ridge' ? '土砂が車体を直撃…早く移動を！' : '土砂は手前で止まった。窪地で助かった…', 'warn'); }
}

// ---------------------------------------------------------------- flood
export function startFlood() {
  const f = E.flood; if (f.on) return false;
  f.on = true; f.t = 0;
  // flood peak relative to parking spot: hollow gets water up to wheels/door; ridge stays dry
  f.peak = G.camperSpot === 'hollow' ? spotHeight('hollow') + 0.62 : WATER_BASE + 1.4;
  if (W.mode !== 'storm' && W.mode !== 'rain') setWeather('rain');
  warn('⚠ 上流で鉄砲水！ 沢が増水しています', 'danger', 5200);
  bus.emit('sfx', 'flood', 1);
  return true;
}
function updateFlood(dt) {
  const f = E.flood;
  const base = WATER_BASE + G.rainAccum * 0.35;
  if (!f.on) { G.waterLevel += (base - G.waterLevel) * dt * 0.05; return; }
  f.t += dt;
  const rise = smooth(0, 35, f.t), fall = smooth(120, 200, f.t);
  const target = lerp(base, f.peak, rise * (1 - fall));
  G.waterLevel += (target - G.waterLevel) * Math.min(1, dt * 0.8);
  if (G.camper) {
    const sub = G.waterLevel - G.camper.position.y;
    G.submerge = sub;
    if (sub > 0.35 && !f.warned) { f.warned = true; warn('水がタイヤを越えた！ 高台へ避難を！', 'danger'); }
    if (sub > 0.55) {
      G.state.hull = Math.max(0, G.state.hull - dt * 0.8);
      G.state.battery = Math.max(0, G.state.battery - dt * 0.3);
      G.state.calm = Math.max(0, G.state.calm - dt * 1.2);
      G.shake = Math.max(G.shake, 0.08);
      if (G.state.hull <= 0) bus.emit('gameover', 'flood');
    }
  }
  // floating debris pushes camper
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
  if (!treeMesh || E.fallen) return false;
  const c = G.camper.position, a = G.camper.rotation.y;
  const side = R() < 0.5 ? -1 : 1;
  const base = new THREE.Vector3(c.x + Math.cos(a) * 9 * side, 0, c.z - Math.sin(a) * 9 * side);
  base.y = heightAt(base.x, base.z) - 0.2;
  treeMesh.position.copy(base); treeMesh.rotation.set(0, 0, 0); treeMesh.visible = true;
  // camper local +x in world = (cos a, 0, -sin a); local +z = (sin a, 0, cos a).
  // Rotating +Y about +Z by +θ moves the top toward -X, so axis = localZ * side tips toward the van.
  // Contact: trunk reaches roof edge (|x|=XW) at height above base = roofTop - baseY.
  const rise = c.y + 2.95 - base.y, run = 9 - 1.2;
  E.fallen = { t: 0, axis: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(side), hit: false, ang: 0, v: 0, maxA: Math.atan2(run, rise) };
  strike(true);
  warn('バキバキッ…！ 木が倒れてくる！', 'danger', 3500);
  bus.emit('sfx', 'crack', 1);
  return true;
}
function updateTree(dt) {
  const f = E.fallen; if (!f) return;
  f.t += dt;
  if (f.t < 1.2) { treeMesh.rotation.z = Math.sin(f.t * 30) * 0.004; return; }
  const maxA = f.maxA; // resting on the camper roof edge
  if (f.ang < maxA) { f.v += dt * 1.6 * Math.sin(f.ang + 0.15); f.ang = Math.min(maxA, f.ang + f.v * dt); }
  else if (!f.hit) {
    f.hit = true; f.v = 0;
    bus.emit('impact', { from: new THREE.Vector3(0, 1, 0), power: 1.2, source: 'tree' });
    const u = C.glass.sky1?.material.userData.u; if (u) u.uCrack.value = 1;
  }
  treeMesh.quaternion.setFromAxisAngle(f.axis, f.ang);
}

// ---------------------------------------------------------------- power
export function powerTick(dt) {
  const S = G.state;
  const draw = (S.lightsOn && !S.hiding ? 0.05 : 0) + (S.spotOn ? 0.35 : 0) + (S.heater ? 0.12 : 0) + (S.cooking > 0 ? 0.1 : 0) + 0.01;
  const solar = G.daylight * (1 - G.cloud * 0.8) * 0.22;
  const gen = S.generator ? 0.5 : 0;
  S.battery = clamp(S.battery + (solar + gen - draw) * dt * 0.35, 0, 100);
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
  if (forced) setTimeout(() => triggerEvent(forced), P.has('qa') ? 200 : 3000);
}

export function triggerEvent(name) {
  const e = EVENTS[name] || { run: { deer: spawnDeer }[name] };
  if (name === 'bear' && P.has('qa')) { spawnBear('prowl'); const b = Z.bear; const c = G.camper.position; b.pos.set(c.x - 5, 0, c.z - 6); b.pos.y = heightAt(b.pos.x, b.pos.z); b.heading = 0.6; b.rear = 0.8; b.state = 'sniff'; return; }
  if (name === 'deer' && P.has('qa')) { spawnDeer(); Z.deer.concat(Z.fawns).forEach((d, i) => { const c = G.camper.position; d.pos.set(c.x - 8 - i * 1.4, 0, c.z - 3 + i * 1.6); d.pos.y = heightAt(d.pos.x, d.pos.z); d.target.copy(d.pos); d.state = 'graze'; d.heading = 1.9 + i * 0.4; }); return; }
  if (name === 'flood' && P.has('qa')) { startFlood(); E.flood.t = 40; G.waterLevel = E.flood.peak; return; }
  if (name === 'landslide' && P.has('qa')) { startLandslide(); for (let i = 0; i < 60; i++) updateSlide(0.1); return; }
  e.run && e.run();
  lastRun[name] = G.t;
}

export function updateEvents(dt) {
  // rain accumulation drives floods & slides
  G.rainAccum = clamp(G.rainAccum + (G.rain > 0.5 ? dt * 0.0035 * G.rain : -dt * 0.001));
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
