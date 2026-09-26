// Wildlife: deer herd (skinned stag w/ animations + fawn), black bear (procedural gait),
// wolves (skinned). Simple steering + state machines reacting to noise, light and smell.
import { THREE, G, bus, clamp, rng } from './core.js';
import { glb } from './assets.js';
import { heightAt } from './terrain.js';
import { colliders } from './forest.js';
import * as SkeletonUtils from './lib/addons/SkeletonUtils.js';

export const animals = [];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function camperPos() { return G.camper ? G.camper.position : _w.set(0, 0, 0); }
function distToCamper(a) { const c = camperPos(); return Math.hypot(a.pos.x - c.x, a.pos.z - c.z); }

// normalize a GLB so its height is `h` and feet sit at y=0, facing +z
function fitModel(root, h, yaw = 0) {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  const s = h / (b.max.y - b.min.y);
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(s);
  inner.position.y = -b.min.y * s;
  inner.rotation.y = yaw;
  holder.add(inner);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return holder;
}

class Animal {
  constructor(kind, obj, opts) {
    this.kind = kind; this.obj = obj; Object.assign(this, opts);
    this.pos = obj.position; this.heading = Math.random() * Math.PI * 2;
    this.speed = 0; this.state = 'hidden'; this.t = 0; this.target = new THREE.Vector3();
    this.active = false; obj.visible = false;
    this.eyes = null;
  }
  spawnAt(x, z) {
    this.pos.set(x, heightAt(x, z), z); this.active = true; this.obj.visible = true; this.t = 0;
  }
  despawn() { this.active = false; this.obj.visible = false; this.state = 'hidden'; }
  steer(dt, tx, tz, spd, turn = 2.2) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    let want = Math.atan2(dx, dz);
    // avoid colliders & camper box
    for (const c of colliders) {
      const ox = c.x - this.pos.x, oz = c.z - this.pos.z, d = Math.hypot(ox, oz);
      if (d < c.r + 1.4 && d > 0.01) want += (Math.sign(ox * Math.cos(want) - oz * Math.sin(want)) || 1) * 0.6 * (1 - d / (c.r + 1.4));
    }
    let da = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += clamp(da, -turn * dt, turn * dt);
    this.speed += (spd - this.speed) * Math.min(1, dt * 3);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    // keep out of the camper footprint
    if (G.camper) {
      _v.copy(this.pos); G.camper.worldToLocal(_v);
      const mx = 1.6 + this.radius, mz0 = -5.6 - this.radius, mz1 = 3.6 + this.radius;
      if (Math.abs(_v.x) < mx && _v.z > mz0 && _v.z < mz1) {
        _v.x = Math.sign(_v.x || 1) * mx; G.camper.localToWorld(_v); this.pos.x = _v.x; this.pos.z = _v.z;
      }
    }
    this.pos.y += (heightAt(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 10);
    this.obj.rotation.y = this.heading;
    return Math.hypot(dx, dz);
  }
}

// ---------------------------------------------------------------- skinned (stag / wolf)
class Skinned extends Animal {
  constructor(kind, gltf, h, opts) {
    const root = SkeletonUtils.clone(gltf.scene);
    const obj = fitModel(root, h, opts.yaw || 0);
    super(kind, obj, opts);
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    for (const c of gltf.animations) {
      const n = c.name.split('|').pop();
      if (!this.clips[n]) this.clips[n] = this.mixer.clipAction(c);
    }
    this.cur = null;
    this.play('Idle');
  }
  play(name, fade = 0.35) {
    const a = this.clips[name] || this.clips.Idle; if (!a || a === this.cur) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a;
  }
  anim(dt) {
    if (this.cur) this.cur.timeScale = this.speed > 0.2 ? clamp(this.speed / this.gaitRef, 0.6, 1.8) : 1;
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------- bear (static mesh + procedural gait)
class Bear extends Animal {
  constructor(gltf) {
    const root = gltf.scene.clone(true);
    const obj = fitModel(root, 1.15, Math.PI / 2);
    super('bear', obj, { radius: 0.9, gaitRef: 1.2 });
    this.body = obj.children[0];
    this.baseY = this.body.position.y; this.baseYaw = this.body.rotation.y; // keep fitModel foot offset / facing
    // fur tint, subtle sheen
    root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.roughness = 0.95; o.material.color?.multiplyScalar(0.55); } });
    this.phase = 0; this.rear = 0; this.aggro = 0; this.hitCd = 0;
    // eye shine
    const em = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0 });
    const eg = new THREE.SphereGeometry(0.025, 6, 4);
    this.eyes = [new THREE.Mesh(eg, em), new THREE.Mesh(eg, em)];
    this.eyes[0].position.set(-0.09, 0.92, 0.85); this.eyes[1].position.set(0.09, 0.92, 0.85);
    obj.add(...this.eyes); this.eyeMat = em;
  }
  anim(dt) {
    this.phase += dt * (1.5 + this.speed * 3.2);
    const gait = clamp(this.speed / 2.5);
    this.body.position.y = this.baseY + Math.abs(Math.sin(this.phase)) * 0.06 * gait + this.rear * 0.55;
    this.body.rotation.z = Math.sin(this.phase) * 0.04 * gait;
    this.body.rotation.x = -this.rear * 0.9 + Math.sin(this.phase * 2) * 0.02 * gait;
    this.body.rotation.y = this.baseYaw + Math.sin(this.phase * 0.5) * 0.05;
  }
}

// ---------------------------------------------------------------- manager
export const Z = { deer: [], fawns: [], bear: null, wolves: [], ready: false };

export async function buildAnimals(scene) {
  const [stag, fawn, bear, wolf] = await Promise.all([glb('stag'), glb('fawn'), glb('black_bear'), glb('wolf')]);
  for (let i = 0; i < 3; i++) {
    const d = new Skinned('deer', stag, i === 0 ? 1.95 : 1.55, { radius: 0.5, gaitRef: 1.4 });
    if (i > 0) d.obj.traverse(o => { if (o.isMesh && /antler|horn/i.test(o.material.name)) o.visible = false; });
    scene.add(d.obj); animals.push(d); Z.deer.push(d);
  }
  const fr = fawn.scene.clone(true);
  const fObj = fitModel(fr, 0.95, 0);
  const f = new Animal('fawn', fObj, { radius: 0.35, gaitRef: 1 });
  const fBase = fObj.children[0].position.y;
  f.anim = function (dt) { this.ph = (this.ph || 0) + dt * (2 + this.speed * 5); fObj.children[0].position.y = fBase + Math.abs(Math.sin(this.ph)) * 0.05 * clamp(this.speed); };
  scene.add(fObj); animals.push(f); Z.fawns.push(f);
  Z.bear = new Bear(bear); scene.add(Z.bear.obj); animals.push(Z.bear);
  for (let i = 0; i < 3; i++) {
    const w = new Skinned('wolf', wolf, 0.85, { radius: 0.45, gaitRef: 3, yaw: 0 });
    w.obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(0.45, 0.43, 0.4); o.material.roughness = 0.9; } });
    scene.add(w.obj); animals.push(w); Z.wolves.push(w);
  }
  Z.ready = true;
}

// --------------------------------------------------------------- behaviours
const R = rng(99);
function ringPoint(r0, r1, ang) {
  const c = camperPos(), a = ang ?? R() * Math.PI * 2, r = r0 + R() * (r1 - r0);
  return [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
}

export function spawnDeer() {
  if (!Z.ready || Z.deer[0].active) return false;
  const base = R() * Math.PI * 2;
  [...Z.deer, ...Z.fawns].forEach((d, i) => {
    const [x, z] = ringPoint(26, 32, base + (i - 1.5) * 0.18);
    d.spawnAt(x, z); d.state = 'approach';
    const [tx, tz] = ringPoint(7, 11, base + 0.9 + (i - 1.5) * 0.25);
    d.target.set(tx, 0, tz); d.t = 0;
  });
  bus.emit('animal', 'deer');
  return true;
}

export function spawnBear(mode = 'prowl') {
  if (!Z.ready || Z.bear.active) return false;
  const b = Z.bear;
  const [x, z] = ringPoint(30, 36);
  b.spawnAt(x, z); b.state = mode; b.t = 0; b.aggro = mode === 'charge' ? 1 : 0.2; b.hits = 0;
  bus.emit('animal', 'bear');
  return true;
}

export function spawnWolves() {
  if (!Z.ready || Z.wolves[0].active) return false;
  const base = R() * Math.PI * 2;
  Z.wolves.forEach((w, i) => { const [x, z] = ringPoint(30, 36, base + i * 0.3); w.spawnAt(x, z); w.state = 'circle'; w.t = i * 3; w.play('Walk'); });
  bus.emit('animal', 'wolf');
  return true;
}

// Stimulus from camper: light & noise attract/scare.
function stimulus() {
  const S = G.state;
  const light = (S.lightsOn && !S.hiding ? 0.4 * (1 - (S.curtainsClosed ? 0.7 : 0)) : 0) + (S.spotOn ? 1 : 0);
  return { light, noise: S.noise, smell: S.smell };
}

export function updateAnimals(dt) {
  if (!Z.ready) return;
  const st = stimulus();
  const c = camperPos();
  // deer
  for (const d of [...Z.deer, ...Z.fawns]) {
    if (!d.active) continue;
    d.t += dt;
    const dist = distToCamper(d);
    const scared = st.noise > 0.5 || st.light > 0.8 || G.flash > 0.5 || Z.bear.active && Math.hypot(Z.bear.pos.x - d.pos.x, Z.bear.pos.z - d.pos.z) < 25;
    if (scared && d.state !== 'flee') { d.state = 'flee'; const a = Math.atan2(d.pos.z - c.z, d.pos.x - c.x); d.target.set(c.x + Math.cos(a) * 60, 0, c.z + Math.sin(a) * 60); bus.emit('deerflee'); }
    if (d.state === 'approach') {
      const r = d.steer(dt, d.target.x, d.target.z, 1.3);
      d.play?.('Walk');
      if (r < 1.2) { d.state = 'graze'; d.t = 0; }
    } else if (d.state === 'graze') {
      d.steer(dt, d.target.x, d.target.z, 0);
      d.play?.(d.t % 12 < 7 ? 'Eating' : (d.t % 12 < 9.5 ? 'Idle' : 'Idle_Headlow'));
      if (d.t > 10 && R() < dt * 0.15) { const [tx, tz] = ringPoint(6, 12); d.target.set(tx, 0, tz); d.state = 'approach'; }
      if (d.t > 55) { d.state = 'leave'; const [tx, tz] = ringPoint(55, 60); d.target.set(tx, 0, tz); }
    } else if (d.state === 'flee' || d.state === 'leave') {
      const r = d.steer(dt, d.target.x, d.target.z, d.state === 'flee' ? 7 : 1.4, 4);
      d.play?.(d.state === 'flee' ? 'Gallop' : 'Walk');
      if (r < 3 || dist > 58) d.despawn();
    }
    d.anim(dt);
  }
  // bear
  const b = Z.bear;
  if (b.active) {
    b.t += dt; b.hitCd -= dt;
    const dist = distToCamper(b);
    // aggression drivers: smell (food), low light hiding reduces, spotlight/horn scare
    if (st.smell > 0.3) b.aggro = Math.min(1, b.aggro + dt * 0.04 * st.smell);
    if (G.state.hiding) b.aggro = Math.max(0, b.aggro - dt * 0.05);
    b.eyeMat.opacity = G.night * (G.state.spotOn ? 1 : 0.55);
    if (b.state === 'prowl') {
      const ang = b.t * 0.12 + 1.0;
      const r = 14 - Math.min(8, b.t * 0.15);
      b.steer(dt, c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, 1.1);
      if (b.aggro > 0.75 || b.t > 60 && b.aggro > 0.45) { b.state = 'charge'; bus.emit('bearcharge'); }
      if (b.t > 70 && b.aggro < 0.3) { b.state = 'leave'; }
    } else if (b.state === 'sniff') {
      b.steer(dt, c.x + 1.8, c.z - 1.0, 0.6);
      b.rear += ((dist < 4 ? 1 : 0) - b.rear) * dt * 1.5;
      if (b.t > 16) b.state = b.aggro > 0.5 ? 'charge' : 'leave';
    } else if (b.state === 'charge') {
      b.rear += (0 - b.rear) * dt * 4;
      const r = b.steer(dt, c.x, c.z, 5.5, 3);
      if (dist < 3.2 && b.hitCd < 0) {
        b.hitCd = 3.5; b.hits++;
        _v.set(b.pos.x - c.x, 0, b.pos.z - c.z).normalize();
        bus.emit('impact', { from: _v.clone(), power: 1, source: 'bear' });
        b.state = 'backoff'; b.t = 0;
      }
    } else if (b.state === 'backoff') {
      const a = Math.atan2(b.pos.z - c.z, b.pos.x - c.x);
      b.steer(dt, c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, 2.0);
      b.rear += ((b.t < 1.5 ? 1 : 0) - b.rear) * dt * 3;
      if (b.t > 4) { b.t = 0; b.state = b.hits >= 3 || b.aggro < 0.35 ? 'leave' : 'charge'; if (b.state === 'charge') bus.emit('bearcharge'); }
    } else if (b.state === 'flee' || b.state === 'leave') {
      const a = Math.atan2(b.pos.z - c.z, b.pos.x - c.x);
      b.steer(dt, c.x + Math.cos(a) * 70, c.z + Math.sin(a) * 70, b.state === 'flee' ? 6 : 1.6);
      b.rear += (0 - b.rear) * dt * 3;
      if (dist > 55) { b.despawn(); bus.emit('bearleft'); }
    }
    b.anim(dt);
  }
  // wolves
  for (const w of Z.wolves) {
    if (!w.active) continue;
    w.t += dt;
    if (w.state === 'circle') {
      const ang = w.t * 0.18 + Z.wolves.indexOf(w) * 2.1;
      const r = 12 + Math.sin(w.t * 0.3) * 3;
      w.steer(dt, c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, 2.4);
      w.play('Walk');
      if (w.t > 45 || st.light > 0.9 || st.noise > 0.6) w.state = 'leave';
    } else {
      const a = Math.atan2(w.pos.z - c.z, w.pos.x - c.x);
      w.steer(dt, c.x + Math.cos(a) * 70, c.z + Math.sin(a) * 70, 6);
      w.play('Run');
      if (distToCamper(w) > 55) w.despawn();
    }
    w.anim(dt);
  }
}

// Player actions that affect wildlife
export function scareAll(power = 1) {
  const b = Z.bear;
  if (b.active) {
    b.aggro = Math.max(0, b.aggro - 0.35 * power);
    if (b.aggro < 0.3 || power > 1.2) { b.state = 'flee'; bus.emit('bearscared'); }
  }
  for (const d of [...Z.deer, ...Z.fawns]) if (d.active && d.state !== 'flee') d.state = 'graze', d.t = 1e3; // leave
  for (const w of Z.wolves) if (w.active) w.state = 'leave';
}

export function nearestAnimal() {
  let best = null, bd = 1e9;
  for (const a of animals) if (a.active) { const d = distToCamper(a); if (d < bd) { bd = d; best = a; } }
  return best ? { a: best, d: bd } : null;
}
