// Camper rigid-body physics: 6-DOF body, 4 raycast suspension wheels (4WD, front steer),
// penalty contacts for the hull box against terrain / bridge decks, tree trunks and movable
// obstacles (boulders, log segments). Water drag + buoyancy + flood current.
// Nothing is scripted: if the van leaves the road bed on a cliff it tumbles down for real.
import { THREE, G, bus, clamp } from './core.js';
import { groundAt, normalAt, heightAt, WORLD } from './terrain.js';
import { colliders } from './forest.js';

const M = 3400;                                     // kg
const HB = { x: 1.2, y0: 0.45, y1: 2.95, z0: -5.35, z1: 3.3 };   // hull box (camper local)
const COM = new THREE.Vector3(0, 1.05, -0.7);       // centre of mass (local)
const I = new THREE.Vector3(                        // principal inertia of a box (+ low-slung chassis)
  M / 12 * ((HB.y1 - HB.y0) ** 2 + (HB.z1 - HB.z0) ** 2) * 0.8,
  M / 12 * ((2 * HB.x) ** 2 + (HB.z1 - HB.z0) ** 2) * 0.8,
  M / 12 * ((2 * HB.x) ** 2 + (HB.y1 - HB.y0) ** 2) * 0.8);
export const WHEELS = [[-1.02, -4.65, true], [1.02, -4.65, true], [-1.02, 1.9, false], [1.02, 1.9, false]];
export const WHEEL_R = 0.42;
const ANCHOR_Y = 0.95, SUS_LEN = 1.09;              // ray from anchor, contact when t < SUS_LEN
const K_SUS = 62000, C_SUS = 7800, MU = 0.95;
const K_HULL = 520000, C_HULL = 26000, MU_HULL = 0.55;
const STEP = 1 / 180;

// hull sample points (bottom perimeter, mid band, roof edges, bumpers)
const HP = [];
for (const y of [HB.y0, 1.5, HB.y1]) for (let z = HB.z0 + (y === HB.y0 ? 0.3 : 0.6); z <= HB.z1 + 0.01; z += 1.05) for (const x of [-HB.x, HB.x]) HP.push(new THREE.Vector3(x, y, z));
for (const y of [0.55, 1.3, 2.4]) for (const x of [-1.1, 0, 1.1]) { HP.push(new THREE.Vector3(x, y, HB.z0)); HP.push(new THREE.Vector3(x, y, HB.z1)); }
for (const z of [-3, -0.5, 2]) HP.push(new THREE.Vector3(0, HB.y1, z), new THREE.Vector3(0, HB.y0, z));

export const VEH = {
  pos: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(),
  ctrl: { throttle: 0, steer: 0, brake: 1, hand: true },   // throttle -1..1 (neg = reverse)
  steer: 0, wheels: WHEELS.map(() => ({ t: SUS_LEN, contact: false, spin: 0, ground: false })),
  speed: 0, fwdSpeed: 0, up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1),
  grounded: 0, airT: 0, submerged: 0, lastImpact: 0, sleeping: false, acc: 0,
  obstacles: [],                                   // { p:Vector3, v:Vector3, r, m, static, tag }
};

// ---------------------------------------------------------------- collider grid (trees etc.)
const CG = new Map(), CC = 8;
let cgReady = 0;
function buildColliderGrid() {
  CG.clear();
  for (const c of colliders) {
    const k = Math.floor(c.x / CC) * 4096 + Math.floor(c.z / CC);
    (CG.get(k) || CG.set(k, []).get(k)).push(c);
  }
  cgReady = colliders.length;
}
function nearColliders(x, z, out) {
  out.length = 0;
  const cx = Math.floor(x / CC), cz = Math.floor(z / CC);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = CG.get((cx + i) * 4096 + cz + j); if (l) for (const c of l) out.push(c); }
  return out;
}

// ---------------------------------------------------------------- pose helpers
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const F = new THREE.Vector3(), T = new THREE.Vector3();
/** origin (camper group position) from COM pose */
export function originOf(out = new THREE.Vector3()) { return out.copy(COM).applyQuaternion(VEH.q).negate().add(VEH.pos); }
export function localToWorld(p, out) { return out.copy(p).sub(COM).applyQuaternion(VEH.q).add(VEH.pos); }
function pointVel(wp, out) { return out.copy(wp).sub(VEH.pos).cross(VEH.w).negate().add(VEH.v); } // v + w×r

export function setPose(x, z, rot, drop = 0.15) {
  VEH.q.setFromEuler(new THREE.Euler(0, rot, 0));
  const y = Math.max(heightAt(x, z), groundAt(x, z)) + drop;
  VEH.pos.set(x, y, z).add(_v.copy(COM).applyQuaternion(VEH.q));
  VEH.v.set(0, 0, 0); VEH.w.set(0, 0, 0); VEH.airT = 0; VEH.sleeping = false;
  // settle: align with ground slope
  const n = normalAt(x, z, _n);
  _q.setFromUnitVectors(_v.set(0, 1, 0), n); VEH.q.premultiply(_q);
  VEH.pos.set(x, y, z).add(_v.copy(COM).applyQuaternion(VEH.q));
}

function addForceAt(f, wp) { F.add(f); T.add(_v3.copy(wp).sub(VEH.pos).cross(f)); }

// ---------------------------------------------------------------- one physics step
const near = [];
function step(dt) {
  F.set(0, -9.81 * M, 0); T.set(0, 0, 0);
  const q = VEH.q, up = _up.set(0, 1, 0).applyQuaternion(q), fw = _fw.set(0, 0, -1).applyQuaternion(q), rt = _rt.set(1, 0, 0).applyQuaternion(q);
  VEH.up.copy(up); VEH.fwd.copy(fw);
  const c = VEH.ctrl;
  VEH.steer += clamp(c.steer - VEH.steer, -dt * 1.6, dt * 1.6);
  let grounded = 0;
  // ---- wheels
  for (let i = 0; i < 4; i++) {
    const [wx, wz, front] = WHEELS[i], W = VEH.wheels[i];
    const A = localToWorld(_v.set(wx, ANCHOR_Y, wz), _v2.set(0, 0, 0)); // anchor (world)
    W.contact = false;
    if (up.y > 0.25) {
      // ground under the wheel: terrain/deck + movable obstacles (ride over boulders)
      let g = groundAt(A.x, A.z, A.y);
      for (const o of VEH.obstacles) {
        const dx = A.x - o.p.x, dz = A.z - o.p.z, d2 = dx * dx + dz * dz, rr = o.r + WHEEL_R * 0.5;
        if (d2 < rr * rr) { const top = o.p.y + Math.sqrt(rr * rr - d2) - WHEEL_R * 0.5; if (top > g && top < A.y + 0.3) { g = top; o.hitT = G.t; } }
      }
      const t = (A.y - g) / up.y; // distance along -up to the ground plane
      if (t < SUS_LEN && t > -0.4) {
        W.contact = true; grounded++;
        const comp = SUS_LEN - Math.max(t, 0);
        const cp = _v3.copy(A).addScaledVector(up, -t); // contact point
        const vel = pointVel(cp, _f);
        const n = normalAt(cp.x, cp.z, _n, cp.y + 0.5);
        const vn = vel.dot(up);
        let fs = K_SUS * comp - C_SUS * vn;
        if (t < 0) fs += K_HULL * 0.2 * -t; // bottomed out: bump stop
        fs = Math.max(0, fs);
        const fsv = _r.copy(up).multiplyScalar(fs);
        addForceAt(fsv, cp);
        // tyre frame on the ground plane
        const ang = front ? VEH.steer : 0;
        const wf = _v.copy(fw).applyAxisAngle(up, ang); wf.addScaledVector(n, -wf.dot(n)).normalize();
        const wr = _v2.crossVectors(wf, n).normalize();
        const vLong = vel.dot(wf), vLat = vel.dot(wr);
        const Nf = fs * Math.max(0.2, n.dot(up)), fmax = MU * Nf;
        // drive (4WD) + brakes
        let fl = c.throttle * 2600 * (Math.abs(vLong) < 9 ? 1 : 0.4);
        const brake = c.hand ? 1 : c.brake;
        if (brake > 0) fl -= Math.sign(vLong) * Math.min(Math.abs(vLong) * M / 4 / dt * 0.5, brake * fmax);
        fl -= vLong * 18; // rolling resistance
        // lateral grip: cancel slip (impulse-style), limited by friction circle
        let flat = -vLat * (M / 4) / dt * 0.35;
        const mag = Math.hypot(fl, flat);
        if (mag > fmax) { fl *= fmax / mag; flat *= fmax / mag; }
        addForceAt(_f.copy(wf).multiplyScalar(fl).addScaledVector(wr, flat), cp);
        W.spin += vLong * dt / WHEEL_R; W.t = Math.max(t, 0);
      } else W.t = SUS_LEN;
    } else W.t = SUS_LEN;
  }
  // ---- hull points vs ground
  let hard = 0;
  for (const lp of HP) {
    const p = localToWorld(lp, _v);
    const g = groundAt(p.x, p.z, p.y + 0.3);
    if (p.y < g) {
      const n = normalAt(p.x, p.z, _n, p.y + 0.3);
      const pen = (g - p.y) * n.y;
      const vel = pointVel(p, _v2), vn = vel.dot(n);
      const fn = Math.max(0, K_HULL * pen - C_HULL * vn);
      if (-vn > hard) hard = -vn;
      const vt = _v3.copy(vel).addScaledVector(n, -vn);
      const vtl = vt.length();
      const ff = Math.min(MU_HULL * fn, vtl * M / HP.length / dt * 0.5);
      _f.copy(n).multiplyScalar(fn);
      if (vtl > 1e-4) _f.addScaledVector(vt, -ff / vtl);
      addForceAt(_f, p);
    }
  }
  // ---- trees / fixed colliders & movable obstacles vs hull box (in body local space)
  const qi = _q.copy(q).invert();
  if (cgReady !== colliders.length) buildColliderGrid();
  nearColliders(VEH.pos.x, VEH.pos.z, near);
  const test = (cx, cy, cz, r, o) => {
    // body-local centre
    const l = _v.set(cx, cy, cz).sub(VEH.pos).applyQuaternion(qi).add(COM);
    const px = clamp(l.x, -HB.x, HB.x), py = clamp(l.y, HB.y0, HB.y1), pz = clamp(l.z, HB.z0, HB.z1);
    let dx = l.x - px, dy = l.y - py, dz = l.z - pz;
    if (!o) dy = 0; // vertical trunk: horizontal push only
    const d = Math.hypot(dx, dy, dz);
    if (d >= r) return;
    let nl;
    if (d > 1e-4) nl = _n.set(dx / d, dy / d, dz / d);
    else { // centre inside the box: push out along the least-penetration side axis
      const ex = HB.x - Math.abs(l.x), ez = Math.min(l.z - HB.z0, HB.z1 - l.z);
      nl = ex < ez ? _n.set(Math.sign(l.x) || 1, 0, 0) : _n.set(0, 0, l.z - HB.z0 < HB.z1 - l.z ? -1 : 1);
    }
    const pen = r - d;
    const cpw = localToWorld(_v2.set(px, py, pz), _v2);
    const nw = nl.applyQuaternion(q); // world normal: from box toward obstacle
    const vel = pointVel(cpw, _f);
    const ov = o ? o.v : null;
    const rel = ov ? _r.copy(vel).sub(ov) : _r.copy(vel);
    const vn = rel.dot(nw);           // >0 = box moving into obstacle
    const k = o && !o.static ? K_HULL * 0.5 : K_HULL;
    const fn = Math.max(0, k * pen + C_HULL * vn);
    if (vn > hard) hard = vn;
    const f = _v3.copy(nw).multiplyScalar(-fn);
    // friction along the contact
    const vt = rel.addScaledVector(nw, -vn), vtl = vt.length();
    if (vtl > 1e-3) f.addScaledVector(vt, -Math.min(0.5 * fn, vtl * M / dt * 0.02) / vtl);
    addForceAt(f, cpw);
    if (o && !o.static) { o.v.addScaledVector(f, -dt / o.m); o.hitT = G.t; }
  };
  for (const cl of near) if (cl.r > 0.25) test(cl.x, VEH.pos.y, cl.z, cl.r, null);
  for (const o of VEH.obstacles) if (o.p.distanceToSquared(VEH.pos) < 64) test(o.p.x, o.p.y, o.p.z, o.r, o);
  // ---- water
  const wl = G.waterLevel;
  const bottom = localToWorld(_v.set(0, HB.y0, -1), _v).y;
  VEH.submerged = clamp((wl - bottom) / 1.6);
  if (VEH.submerged > 0) {
    F.y += 9.81 * M * 0.55 * VEH.submerged;           // buoyancy (sealed-ish box)
    F.addScaledVector(VEH.v, -M * 0.9 * VEH.submerged); // drag
    T.addScaledVector(VEH.w, -I.x * 0.8 * VEH.submerged);
    if (G.floodFlow) F.addScaledVector(G.floodFlow, M * 0.6 * VEH.submerged * VEH.submerged);
  }
  // external pushes (wind gusts, bear, events)
  if (G.windPush) F.add(G.windPush);
  // aero/angular damping
  F.addScaledVector(VEH.v, -40);
  T.addScaledVector(VEH.w, -1800);
  // ---- integrate (semi-implicit Euler; inertia in body frame)
  VEH.v.addScaledVector(F, dt / M);
  const tl = _v.copy(T).applyQuaternion(qi);
  const wl2 = _v2.copy(VEH.w).applyQuaternion(qi);
  wl2.x += tl.x / I.x * dt; wl2.y += tl.y / I.y * dt; wl2.z += tl.z / I.z * dt;
  VEH.w.copy(wl2.applyQuaternion(q));
  if (VEH.w.lengthSq() > 64) VEH.w.setLength(8);
  if (VEH.v.lengthSq() > 900) VEH.v.setLength(30);
  VEH.pos.addScaledVector(VEH.v, dt);
  const wlen = VEH.w.length();
  if (wlen > 1e-6) { _q.setFromAxisAngle(_v.copy(VEH.w).divideScalar(wlen), wlen * dt); VEH.q.premultiply(_q).normalize(); }
  // never leave the world
  VEH.pos.x = clamp(VEH.pos.x, WORLD.x0 + 6, WORLD.x1 - 6); VEH.pos.z = clamp(VEH.pos.z, WORLD.z0 + 6, WORLD.z1 - 6);
  const floor = heightAt(VEH.pos.x, VEH.pos.z) - 3;
  if (VEH.pos.y < floor) { VEH.pos.y = floor + 1; VEH.v.y = Math.max(0, VEH.v.y); } // tunnelling guard
  VEH.grounded = grounded;
  return hard;
}

// ---------------------------------------------------------------- movable obstacles
const og = new THREE.Vector3();
function stepObstacles(dt) {
  for (const o of VEH.obstacles) {
    if (o.static || o.frozen) continue;
    o.v.y -= 9.81 * dt;
    o.p.addScaledVector(o.v, dt);
    const g = heightAt(o.p.x, o.p.z) + o.r * 0.85;
    if (o.p.y < g) {
      o.p.y = g; if (o.v.y < 0) o.v.y *= -0.2;
      const n = normalAt(o.p.x, o.p.z, og);
      o.v.x += n.x * 9.81 * dt * 0.6; o.v.z += n.z * 9.81 * dt * 0.6; // rolls downhill on steep ground
      o.v.multiplyScalar(1 - Math.min(1, dt * (o.slide ? 0.8 : 4)));
    }
    o.rotAcc = (o.rotAcc || 0) + Math.hypot(o.v.x, o.v.z) * dt / o.r;
  }
}
export function addObstacle(p, r, opts = {}) {
  const o = { p: p.clone(), v: new THREE.Vector3(), r, m: opts.m ?? 2600 * r * r * r * 4, static: !!opts.static, tag: opts.tag || 'rock', rot: Math.random() * 6 };
  VEH.obstacles.push(o); return o;
}
export function removeObstacles(tag) { VEH.obstacles = VEH.obstacles.filter(o => o.tag !== tag); }

// ---------------------------------------------------------------- frame update
export function updateVehicle(dt, group) {
  VEH.acc += Math.min(dt, 0.1);
  let hard = 0, n = 0;
  while (VEH.acc >= STEP && n < 12) { hard = Math.max(hard, step(STEP)); stepObstacles(STEP); VEH.acc -= STEP; n++; }
  if (n >= 12) VEH.acc = 0;
  VEH.speed = VEH.v.length();
  VEH.fwdSpeed = VEH.v.dot(VEH.fwd);
  VEH.airT = VEH.grounded ? 0 : VEH.airT + dt;
  // crash impacts -> damage / shake / glass (non-lethal: falls never end the game)
  if (hard > 3.2 && G.t - VEH.lastImpact > 0.5) {
    VEH.lastImpact = G.t;
    const power = clamp((hard - 2.5) / 6, 0.15, 1.4);
    bus.emit('impact', { from: VEH.v.clone().normalize().negate(), power, source: 'crash' });
  }
  if (group) {
    originOf(group.position); group.quaternion.copy(VEH.q);
    group.children.length && WHEEL_MESHES(group);
  }
}
function WHEEL_MESHES(group) {
  const ws = group.userData.wheels; if (!ws) return;
  ws.forEach((w, i) => {
    const W = VEH.wheels[i];
    w.position.y = ANCHOR_Y - Math.min(W.t, SUS_LEN - 0.02) + WHEEL_R;
    w.rotation.y = WHEELS[i][2] ? VEH.steer : 0;
    w.children.forEach(c => c.rotation.x = -W.spin);
  });
}

/** Gentle self-righting torque (winch / hydraulic jack assist) toward upright. */
export function rightingAssist(dt, k = 1) {
  const up = _v.set(0, 1, 0).applyQuaternion(VEH.q);
  const ax = _v2.crossVectors(up, _v3.set(0, 1, 0));
  const s = ax.length(); if (s < 1e-3 && up.y > 0) return;
  if (s < 1e-3) ax.copy(VEH.fwd); else ax.divideScalar(s);
  const ang = Math.acos(clamp(up.y, -1, 1));
  VEH.w.addScaledVector(ax, Math.min(ang, 1.2) * dt * 1.4 * k);
  VEH.w.multiplyScalar(1 - Math.min(1, dt * 1.5));
  VEH.v.y += dt * 4.5 * k * (up.y < 0.6 ? 1 : 0); // lift a little so edges don't dig in
}
/** Impulse at a world point (bear hits, blasts). */
export function applyImpulse(wp, J) {
  VEH.v.addScaledVector(J, 1 / M);
  const tl = _v.copy(wp).sub(VEH.pos).cross(J).applyQuaternion(_q.copy(VEH.q).invert());
  tl.x /= I.x; tl.y /= I.y; tl.z /= I.z;
  VEH.w.add(tl.applyQuaternion(VEH.q));
}
export const VEHICLE = { M, HB, COM };
