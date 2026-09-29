// Camper vehicle dynamics (v3): a 3.6 t Class-C motorhome on a light-truck chassis.
//
//  body      6-DOF rigid body, high centre of mass (1.15 m) -> it really can roll over
//  chassis   per-axle springs tuned to the static load, bump/rebound damping, bump stops,
//            anti-roll bars, Ackermann steering with a rate-limited power steering rack
//  tyres     per-wheel spin DOF; implicit slip-velocity tyre (stable at any speed) with a
//            combined-slip friction ellipse and peak -> sliding friction drop, so locked or
//            spinning wheels lose side grip exactly like a real tyre; brush deflection at a crawl
//  ground    surface model (gravel road / forest litter / grass / mud / rock / timber deck /
//            stream bed / landslide mud), wetness from the weather, rolling resistance,
//            sinkage and wheel-spin digging (high-centring = stuck)
//  drive     turbo-diesel torque curve, torque converter (creep, stall multiplication, lock-up),
//            6-speed automatic, 2H / 4H / 4L transfer case, open diffs (+ rear locker in 4L),
//            engine braking, ABS, brake-based traction control, parking pawl + handbrake
//  water     per-column buoyancy + quadratic drag against the moving water (creek / flood),
//            water ingress (it floats for a while, then sinks), mud flows (landslides)
//  air       aero drag + side wind gusts on the tall box
//  contacts  velocity-level impulses: hull vs ground / trees / bridge rails / movable debris
//            (rocks, logs) with real momentum exchange; every hard contact is reported with its
//            body-local point so damage.js can dent / scratch the body there.
import { THREE, G, bus, clamp, lerp, smooth, noise2 } from './core.js';
import { groundAt, normalAt, heightAt, WORLD, RAILS, roadQuery, creekX, slopeAt } from './terrain.js';
import { colliders } from './forest.js';
import { DESTS, ROAD_HALF } from './roads.js';

// ---------------------------------------------------------------- vehicle constants
const M = 3600;                                                    // kg (laden)
const HB = { x: 1.2, y0: 0.45, y1: 2.95, z0: -5.35, z1: 3.3 };     // hull box (camper local)
const COM = new THREE.Vector3(0, 1.15, -0.55);                     // centre of mass (local)
const I = new THREE.Vector3(                                       // principal inertia (pitch, yaw, roll)
  M / 12 * ((HB.y1 - HB.y0) ** 2 + (HB.z1 - HB.z0) ** 2) * 0.75,
  M / 12 * ((2 * HB.x) ** 2 + (HB.z1 - HB.z0) ** 2) * 0.75,
  M / 12 * ((2 * HB.x) ** 2 + (HB.y1 - HB.y0) ** 2) * 0.9);
export const WHEELS = [[-1.02, -4.65, true], [1.02, -4.65, true], [-1.02, 1.9, false], [1.02, 1.9, false]]; // = camper.js wheel layout
export const WHEEL_R = 0.42;
const WB = 6.55, TRACK = 2.04;
const ANCHOR_Y = 0.95, SUS_LEN = 1.09, COMP0 = 0.14, BUMP = 0.27;  // travel: 0.14 static, bump stop at 0.27
// static axle loads from the COM position -> spring rates giving equal static compression
const FRONT_SHARE = (WHEELS[2][1] - COM.z) / WB;
const K_SUS = [0, 1, 2, 3].map(i => (i < 2 ? FRONT_SHARE : 1 - FRONT_SHARE) * M * 9.81 / 2 / COMP0);
const C_SUS = K_SUS.map((k, i) => 2 * 0.36 * Math.sqrt(k * (i < 2 ? FRONT_SHARE : 1 - FRONT_SHARE) * M / 2));
const K_ARB = [32000, 24000];                                       // anti-roll bars front / rear (N/m)
const STEP = 1 / 180;
const MAX_LOCK = 0.7, STEER_RATE = 1.25;                            // rad, rad/s (power steering rack)
// tyres (LT 225/75R16-ish)
const CK = 11, CA = 7.5;                                            // longitudinal / cornering stiffness per unit load
const IW = 2.4;                                                     // wheel + brake rotor inertia (kg m^2)
const TB_MAX = [3600, 3600, 2500, 2500], T_HAND = 3200, T_PAWL = 30000;
// drivetrain
const GEARS = [0, 4.17, 2.34, 1.52, 1.14, 0.87, 0.69], REV = 3.4, FINAL = 4.1, LOW = 2.48, EFF = 0.88;
const IDLE = 750, STALL = 2300, REDLINE = 3900, I_ENG = 0.28;

// hull sample points (bottom perimeter, mid band, roof edges, bumpers)
const HP = [];
for (const y of [HB.y0, 1.5, HB.y1]) for (let z = HB.z0 + (y === HB.y0 ? 0.3 : 0.6); z <= HB.z1 + 0.01; z += 1.05) for (const x of [-HB.x, HB.x]) HP.push(new THREE.Vector3(x, y, z));
for (const y of [0.55, 1.3, 2.4]) for (const x of [-1.1, 0, 1.1]) { HP.push(new THREE.Vector3(x, y, HB.z0)); HP.push(new THREE.Vector3(x, y, HB.z1)); }
for (const z of [-3, -0.5, 2]) HP.push(new THREE.Vector3(0, HB.y1, z), new THREE.Vector3(0, HB.y0, z));
// buoyancy / drag columns under the hull (2 x 6)
const COLS = [];
for (const x of [-0.6, 0.6]) for (let k = 0; k < 6; k++) COLS.push(new THREE.Vector3(x, HB.y0, HB.z0 + (k + 0.5) * (HB.z1 - HB.z0) / 6));
const COL_A = (2 * HB.x) * (HB.z1 - HB.z0) / COLS.length, COL_W = Math.sqrt(COL_A);

const wheelState = () => ({ t: SUS_LEN, contact: false, spin: 0, w: 0, sink: 0, dig: 0, abs: 0, slip: 0, sat: false, Fz: 0, comp: 0, kind: 'road', mu: 0.8, crr: 0.02, soft: 0, steer: 0, sx: 0, sy: 0, on: null, cp: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0) });
export const VEH = {
  pos: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(),
  // throttle -1..1 (negative = reverse request; the transmission brakes to a stop before engaging R)
  ctrl: { throttle: 0, steer: 0, brake: 1, hand: true, range: '2H' },
  steer: 0, wheels: WHEELS.map(wheelState),
  drive: { mode: 'P', gear: 1, range: '2H', rpm: IDLE, shiftT: 0, lock: false, torque: 0, abs: false, tcs: false, ratio: 1, nDriven: 2, iRef: 0 },
  speed: 0, fwdSpeed: 0, latSpeed: 0, up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1),
  grounded: 0, airT: 0, submerged: 0, ingress: 0, lastImpact: 0, lastDent: 0, sleeping: false, acc: 0,
  latG: 0, lonG: 0, pitch: 0, roll: 0, skid: 0, mu: 0.8, stuck: 0, surface: 'road',
  obstacles: [],                                   // { p, v, r, m, static, tag, q }
  scrapes: [],                                     // [{ lp, dir, k }] consumed by damage.js
};

// ---------------------------------------------------------------- surfaces
// mu: dry peak friction, wet: fully soaked, crr: rolling resistance, soft: sinkage (0 hard .. 1 deep mud)
export const SURF = {
  road:   { name: '砂利道', mu: 0.78, wet: 0.56, crr: 0.018, soft: 0.05 },
  puddle: { name: 'ぬかるみ', mu: 0.6, wet: 0.34, crr: 0.05, soft: 0.45 },
  forest: { name: '腐葉土', mu: 0.62, wet: 0.4, crr: 0.045, soft: 0.3 },
  grass:  { name: '草地', mu: 0.66, wet: 0.33, crr: 0.035, soft: 0.2 },
  mud:    { name: '泥', mu: 0.5, wet: 0.25, crr: 0.09, soft: 0.85 },
  rock:   { name: '岩', mu: 0.8, wet: 0.5, crr: 0.02, soft: 0 },
  deck:   { name: '木橋', mu: 0.7, wet: 0.36, crr: 0.015, soft: 0 },
  stream: { name: '沢', mu: 0.42, wet: 0.42, crr: 0.07, soft: 0.4 },
  slide:  { name: '土砂', mu: 0.3, wet: 0.22, crr: 0.16, soft: 1 },
};
for (const [k, s] of Object.entries(SURF)) s.id = k;
G.mudZones = G.mudZones || [];                     // [{ x, z, r, depth, vx, vz }] (landslides)
const DL = Object.values(DESTS);
export function wetness() { return clamp(Math.max(G.wet || 0, (G.rain || 0) * 0.85)); }
/** Surface under (x,z) at ground height gy: writes { kind, name, mu, crr, soft } into out. */
export function surfaceAt(x, z, gy, out = {}) {
  let s = SURF.forest;
  const r = roadQuery(x, z), wet = wetness();
  const cd = Math.abs(x - creekX(z));
  if (r.road && r.bridge && r.d < ROAD_HALF + 0.3 && gy > heightAt(x, z) + 0.25) s = SURF.deck;
  else if (G.waterLevel > gy + 0.06) s = SURF.stream;
  else if (r.road && r.d < ROAD_HALF + 0.35) s = wet > 0.3 && noise2(x * 0.35, z * 0.35) > 0.42 ? SURF.puddle : SURF.road;
  else if (cd < 6.5) s = SURF.mud;
  else if (slopeAt(x, z) > 0.75) s = SURF.rock;
  else { for (const d of DL) if (Math.abs(x - d.x) < 13 && Math.abs(z - d.z) < 13 && Math.hypot(x - d.x, z - d.z) < 12) { s = SURF.grass; break; } }
  let soft = s.soft, mu = lerp(s.mu, s.wet, wet), crr = s.crr * (1 + wet * 0.6);
  for (const m of G.mudZones) { const d = Math.hypot(x - m.x, z - m.z); if (d < m.r) { const k = 1 - smooth(m.r * 0.6, m.r, d); if (k > 0.4) s = SURF.slide; soft = lerp(soft, 1, k); mu = lerp(mu, SURF.slide.wet, k); crr = lerp(crr, SURF.slide.crr, k); } }
  out.kind = s.id; out.name = s.name;
  out.mu = mu; out.crr = crr; out.soft = soft * (0.5 + 0.5 * wet);
  return out;
}

/** Water velocity (m/s) at (x,z): the creek always flows downstream (-z); a flash flood spreads over the valley floor. */
const _fl = new THREE.Vector3();
export function waterFlowAt(x, z, out = _fl) {
  const cx = creekX(z), cd = Math.abs(x - cx), k = G.floodK || 0;
  const dcx = (creekX(z + 1) - creekX(z - 1)) / 2;                // channel direction dx/dz
  const base = 0.8 * (1 - smooth(1.5, 4, cd));
  const flood = k * 3.0 * (1 - smooth(4, 30, cd) * 0.75);
  const sp = base + flood, L = Math.hypot(dcx, 1);
  out.set(-dcx / L * sp, 0, -1 / L * sp);
  out.x += clamp(cx - x, -8, 8) * 0.04 * k;                      // flood water drains toward the channel
  return out;
}

// ---------------------------------------------------------------- collider grid (trees etc.)
const CG = new Map(), CC = 8;
let cgReady = -1;
function buildColliderGrid() {
  CG.clear();
  for (const c of colliders.concat(RAILS)) {
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
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const F = new THREE.Vector3(), T = new THREE.Vector3();
/** origin (camper group position) from COM pose */
export function originOf(out = new THREE.Vector3()) { return out.copy(COM).applyQuaternion(VEH.q).negate().add(VEH.pos); }
export function localToWorld(p, out) { return out.copy(p).sub(COM).applyQuaternion(VEH.q).add(VEH.pos); }
const _wq = new THREE.Quaternion();
function worldToLocal(p, out) { return out.copy(p).sub(VEH.pos).applyQuaternion(_wq.copy(VEH.q).invert()).add(COM); }
function pointVel(wp, out) { return out.copy(wp).sub(VEH.pos).cross(VEH.w).negate().add(VEH.v); } // v + w×r

export function setPose(x, z, rot, drop = 0.15) {
  VEH.q.setFromEuler(new THREE.Euler(0, rot, 0));
  const y = Math.max(heightAt(x, z), groundAt(x, z)) + drop;
  const n = normalAt(x, z, _n);
  _q.setFromUnitVectors(_v.set(0, 1, 0), n); VEH.q.premultiply(_q);
  VEH.pos.set(x, y, z).add(_v.copy(COM).applyQuaternion(VEH.q));
  VEH.v.set(0, 0, 0); VEH.w.set(0, 0, 0); VEH.airT = 0; VEH.sleeping = false; VEH.ingress = 0; VEH.acc = 0;
  VEH.wheels.forEach(W => { W.w = 0; W.sink = 0; W.dig = 0; W.abs = 0; W.sx = W.sy = 0; W.t = SUS_LEN - COMP0; });
  Object.assign(VEH.drive, { mode: 'P', gear: 1, rpm: IDLE, shiftT: 0 });
}

const _em = new THREE.Vector3();
/** effective mass of the body at world point wp along unit direction n */
function effMass(wp, n) {
  const rn = _em.copy(wp).sub(VEH.pos).cross(n).applyQuaternion(_qi);
  return 1 / (1 / M + rn.x * rn.x / I.x + rn.y * rn.y / I.y + rn.z * rn.z / I.z);
}
const _af = new THREE.Vector3();
function addForceAt(f, wp) { F.add(f); T.add(_af.copy(wp).sub(VEH.pos).cross(f)); }

// ---------------------------------------------------------------- contacts
const _cv = new THREE.Vector3(), _ct = new THREE.Vector3(), _cj = new THREE.Vector3();
let contactDt = STEP;
const HIT = { vn: 0, p: new THREE.Vector3(), n: new THREE.Vector3(), o: null, src: 'crash' };
const SCR = { k: 0, p: new THREE.Vector3(), d: new THREE.Vector3() };
/** Push the body at world point p out along unit normal n (penetration pen). Obstacle o (optional) gets the reaction. */
function contact(p, n, pen, o, mu, src = 'crash') {
  const vel = pointVel(p, _cv);
  if (o) vel.sub(o.v);
  const vn = vel.dot(n);
  if (-vn > HIT.vn) { HIT.vn = -vn; HIT.p.copy(p); HIT.n.copy(n); HIT.o = o; HIT.src = src; }
  const bias = Math.min(pen * 6, 1.5);          // separation speed used to resolve penetration
  if (vn >= bias) return;
  const me = effMass(p, n), mo = o && !o.static ? o.m : Infinity;
  const mEff = 1 / (1 / me + 1 / mo);
  const jn = mEff * (bias - vn) * 0.35;         // relaxed (many simultaneous contacts)
  _cj.copy(n).multiplyScalar(jn);
  const vt = _ct.copy(vel).addScaledVector(n, -vn), vtl = vt.length();
  if (vtl > 1e-4) {
    vt.divideScalar(vtl);
    const mt = 1 / (1 / effMass(p, vt) + 1 / mo);
    const jt = Math.min(mu * jn, mt * vtl * 0.35);
    _cj.addScaledVector(vt, -jt);
    // scraping (body sliding along ground / trunks / rock): scratches the paint there
    const k = jt / contactDt * vtl;               // friction power (W)
    if (vtl > 0.5 && k > SCR.k) { SCR.k = k; SCR.p.copy(p); SCR.d.copy(vt); }
  }
  F.addScaledVector(_cj, 1 / contactDt); T.add(_af.copy(p).sub(VEH.pos).cross(_cj).divideScalar(contactDt));
  if (o && !o.static) { o.v.addScaledVector(_cj, -1 / o.m); o.hitT = G.t; o.sleep = false; }
}

// ---------------------------------------------------------------- drivetrain
function engineTorque(rpm) { // full-load curve of a 3.0 L turbo diesel (Nm)
  if (rpm >= REDLINE) return 0;
  if (rpm < 1600) return lerp(170, 400, smooth(650, 1600, rpm));
  if (rpm < 2800) return 400;
  return lerp(400, 290, (rpm - 2800) / (REDLINE - 2800));
}
const MASK2 = [0, 0, 1, 1], MASK4 = [1, 1, 1, 1];
const drivenMask = r => r === '2H' ? MASK2 : MASK4;
const rangeK = D => D.range === '4L' ? LOW : 1;
function ratioOf(D) { return (D.mode === 'R' ? REV : GEARS[D.gear]) * FINAL * rangeK(D); }
let thrEff = 0, brkEff = 0;
function updateDrivetrain(dt) {
  const D = VEH.drive, c = VEH.ctrl, vF = VEH.fwdSpeed;
  let thr = c.throttle, brk = c.brake;
  // gear selector (P / R / N / D): the opposite direction is only engaged once (almost) stopped
  let want = D.mode;
  if (thr > 0.01) want = 'D'; else if (thr < -0.01) want = 'R';
  else if (c.hand && Math.abs(vF) < 0.4) want = 'P';
  if (want !== D.mode) {
    const opposite = (want === 'R' && vF > 0.6) || (want === 'D' && vF < -0.6) || (want === 'P' && Math.abs(vF) > 0.4);
    if (opposite) { brk = Math.max(brk, Math.abs(thr)); thr = 0; }
    else { D.mode = want; D.gear = 1; D.shiftT = want === 'P' ? 0 : 0.4; }
  }
  // transfer case: 2H <-> 4H on the move, 4L only at a crawl
  if (c.range && c.range !== D.range) {
    if (c.range === '4L' || D.range === '4L') { if (Math.abs(vF) < 2.5) { D.range = c.range; D.shiftT = 0.6; } }
    else D.range = c.range;
  }
  thr = Math.abs(thr);
  const mask = drivenMask(D.range); let wd = 0, nd = 0;
  VEH.wheels.forEach((W, i) => { if (mask[i]) { wd += W.w; nd++; } });
  wd /= nd;
  let ratio = ratioOf(D);
  const toRpm = 60 / (2 * Math.PI);
  let rpmW = Math.abs(wd) * ratio * toRpm;
  if (D.mode === 'D' && D.shiftT <= 0) { // 6-speed automatic shift schedule (kick-down with throttle)
    const upAt = lerp(1750, 3350, thr), downAt = lerp(1050, 1900, thr);
    if (rpmW > upAt && D.gear < 6) { D.gear++; D.shiftT = 0.35; }
    else if (D.gear > 1 && rpmW < downAt && Math.abs(wd) * GEARS[D.gear - 1] * FINAL * rangeK(D) * toRpm < upAt * 0.82) { D.gear--; D.shiftT = 0.3; }
    ratio = ratioOf(D); rpmW = Math.abs(wd) * ratio * toRpm;
  }
  D.lock = D.mode === 'D' && D.gear >= 2 && rpmW > 1350;
  const re = D.mode === 'P' || D.mode === 'N' ? lerp(IDLE, REDLINE * 0.9, thr)
    : D.lock ? Math.max(rpmW, IDLE) : Math.max(rpmW, IDLE + (STALL - IDLE) * Math.pow(thr, 0.7) * (1 - 0.45 * clamp(rpmW / STALL)));
  D.rpm += (re - D.rpm) * Math.min(1, dt * 10);
  let tq = 0;
  if (D.mode === 'D' || D.mode === 'R') {
    const sr = clamp(rpmW / Math.max(D.rpm, 1)), tm = D.lock ? 1 : lerp(2.1, 1, clamp(sr / 0.9));
    if (thr > 0.02) tq = engineTorque(D.rpm) * thr * tm;
    else if (D.lock || sr > 0.95) tq = -(28 + D.rpm * 0.013) * (D.lock ? 1 : 0.35);            // engine braking
    else tq = engineTorque(IDLE) * 0.11 * (1 - sr);                                               // idle creep
    if (D.rpm >= REDLINE - 20 && tq > 0) tq = 0;
    tq *= ratio * EFF * (D.shiftT > 0 ? 0.3 : 1) * (D.mode === 'R' ? -1 : 1);
  }
  D.shiftT -= dt;
  D.torque = tq; D.ratio = ratio; D.nDriven = nd;
  // reflected engine inertia on each driven wheel (why a truck in 1st gear can't just spin its tyres)
  D.iRef = (D.mode === 'D' || D.mode === 'R' ? (D.lock ? 1 : 0.35) : 0) * I_ENG * ratio * ratio / nd;
  thrEff = thr; brkEff = brk;
}

// ---------------------------------------------------------------- one physics step
const near = [], S0 = {}, _wA = WHEELS.map(() => new THREE.Vector3()), _fl2 = new THREE.Vector3();
function step(dt) {
  contactDt = dt; HIT.vn = 0; HIT.o = null; SCR.k = 0;
  F.set(0, -9.81 * M, 0); T.set(0, 0, 0);
  const q = VEH.q; _qi.copy(q).invert();
  const up = _up.set(0, 1, 0).applyQuaternion(q), fw = _fw.set(0, 0, -1).applyQuaternion(q), rt = _rt.set(1, 0, 0).applyQuaternion(q);
  VEH.up.copy(up); VEH.fwd.copy(fw);
  const c = VEH.ctrl, D = VEH.drive;
  // power steering: rate-limited rack, less lock authority at speed
  const lim = MAX_LOCK * lerp(1, 0.35, smooth(8, 25, Math.abs(VEH.fwdSpeed)));
  VEH.steer += clamp(clamp(c.steer, -lim, lim) - VEH.steer, -dt * STEER_RATE, dt * STEER_RATE);
  updateDrivetrain(dt);
  const mask = drivenMask(D.range);
  let grounded = 0, skid = 0, muSum = 0, stuck = 0;
  // ---- pass 1: suspension raycasts
  for (let i = 0; i < 4; i++) {
    const [wx, wz] = WHEELS[i], W = VEH.wheels[i];
    const A = localToWorld(_v.set(wx, ANCHOR_Y, wz), _wA[i]);
    W.contact = false; W.comp = 0;
    if (up.y < 0.2) { W.t = SUS_LEN; continue; }
    let g = groundAt(A.x, A.z, A.y), on = null;
    for (const o of VEH.obstacles) { // ride over rocks / logs
      const dx = A.x - o.p.x, dz = A.z - o.p.z, d2 = dx * dx + dz * dz, rr = o.r + WHEEL_R * 0.5;
      if (d2 < rr * rr) { const top = o.p.y + Math.sqrt(rr * rr - d2) - WHEEL_R * 0.5; if (top > g && top < A.y + 0.3) { g = top; on = o; } }
    }
    surfaceAt(A.x, A.z, g, S0);
    if (on) { S0.kind = 'rock'; S0.mu = 0.55; S0.crr = 0.03; S0.soft = 0; on.hitT = G.t; }
    W.kind = S0.kind; W.mu = S0.mu; W.crr = S0.crr; W.soft = S0.soft; W.on = on;
    // sinkage: soft ground gives way under the tyre's load; wheel-spin digs a rut
    const sinkT = S0.soft * 0.1 * clamp(W.Fz / 9000, 0, 2) + W.dig;
    W.sink += (sinkT - W.sink) * Math.min(1, dt * 2.5);
    g -= W.sink;
    const t = (A.y - g) / up.y;
    if (t < SUS_LEN && t > -0.5) { W.contact = true; W.comp = SUS_LEN - Math.max(t, 0); W.t = Math.max(t, 0); grounded++; }
    else W.t = SUS_LEN;
  }
  // ---- pass 2: forces
  for (let i = 0; i < 4; i++) {
    const [wx, , front] = WHEELS[i], W = VEH.wheels[i], A = _wA[i];
    const driven = mask[i] && (D.mode === 'D' || D.mode === 'R');
    const Iw = IW + (mask[i] ? D.iRef : 0);
    const Td = driven ? D.torque / D.nDriven : 0;
    // brakes: service (with ABS), handbrake (rear), parking pawl (driven axle)
    if (W.abs > 0) W.abs -= dt;
    let Tb = brkEff * TB_MAX[i] * (W.abs > 0 ? 0.15 : 1);
    if (c.hand && !front) Tb += T_HAND;
    if (D.mode === 'P' && mask[i]) Tb += T_PAWL;
    // Ackermann steering: the inner wheel turns tighter
    let ang = 0;
    if (front && Math.abs(VEH.steer) > 1e-3) { const R = WB / Math.tan(Math.abs(VEH.steer)); ang = Math.sign(VEH.steer) * Math.atan(WB / Math.max(1, R + wx * Math.sign(VEH.steer))); }
    W.steer = ang;
    if (!W.contact) { // airborne wheel: spins freely (an open diff sends the torque here!)
      let w = W.w + dt / Iw * Td; const dw = (Tb + 15) * dt / Iw; w = w > 0 ? Math.max(0, w - dw) : Math.min(0, w + dw);
      W.w = w; W.spin += w * dt; W.slip = 0; W.sat = false; W.Fz = 0; W.sx = W.sy = 0; continue;
    }
    const comp = W.comp, cp = W.cp.copy(A).addScaledVector(up, -W.t);
    const vel = pointVel(cp, _f);
    const n = normalAt(cp.x, cp.z, W.n, cp.y + 0.5 + W.sink);
    if (W.on) n.copy(up);
    // spring + damper (+ bump stop, + anti-roll bar)
    const vn = vel.dot(up);
    const cDamp = C_SUS[i] * (vn > 0 ? 1.45 : 0.75);
    let fs = K_SUS[i] * comp - Math.sign(vn) * Math.min(cDamp * Math.abs(vn), effMass(cp, up) * Math.abs(vn) / dt * 0.08);
    if (comp > BUMP) fs += 250000 * (comp - BUMP) + 5000000 * (comp - BUMP) ** 2;
    const Wo = VEH.wheels[i ^ 1];
    fs += K_ARB[front ? 0 : 1] * (comp - (Wo.contact ? Wo.comp : 0));
    fs = Math.max(0, fs);
    addForceAt(_r.copy(up).multiplyScalar(fs), cp);
    const Fz = Math.min(fs * Math.max(0.2, n.dot(up)), 32000); W.Fz = Fz;
    // tyre frame on the ground plane
    const wf = _v.copy(fw).applyAxisAngle(up, ang); wf.addScaledVector(n, -wf.dot(n)).normalize();
    const wr = _v2.crossVectors(wf, n).normalize();
    const vx = vel.dot(wf), vy = vel.dot(wr);
    // friction: surface (+wet); a dug-in tyre grips less
    const mu = W.mu * (1 - 0.35 * clamp(W.dig / 0.3));
    muSum += mu;
    Tb += (W.crr + W.sink * 0.9) * Fz * WHEEL_R;               // rolling resistance + bulldozing soft ground
    // ABS: release a wheel that starts to lock under braking
    // TCS (not in 4L): brake a spinning driven wheel so an open diff still drives the other side
    const sv = W.w * WHEEL_R - vx;
    if (brkEff > 0.05 && Math.abs(vx) > 1.8 && sv * Math.sign(vx) < -0.16 * Math.abs(vx)) { W.abs = 0.06; D.abs = true; }
    if (driven && D.range !== '4L' && Math.abs(sv) > 0.9 + 0.2 * Math.abs(vx) && Math.sign(sv) === Math.sign(Td)) { Tb += 900; D.tcs = true; }
    // implicit tyre / wheel solve (unconditionally stable slip-velocity model)
    const ks = CK * Fz / Math.max(Math.abs(vx), 0.5), ky = CA * Fz / Math.max(Math.abs(vx), 1.0);
    const mL = effMass(cp, wf) * 0.3, mT = effMass(cp, wr) * 0.3;
    const K = ks / (1 + ks * dt / mL);
    // brush-tyre deflection at a crawl: the tread's elastic deflection acts as a spring, so a
    // braked van stands still on a slope instead of creeping (blends out above ~1 m/s)
    const lowK = 1 - smooth(0.2, 1.2, Math.abs(vx)), kS = 30 * Fz;
    if (lowK <= 0) { W.sx = 0; W.sy = 0; }
    const fsx = kS * W.sx * lowK, fsy = kS * W.sy * lowK;
    const a = Iw / dt, den = a + K * WHEEL_R * WHEEL_R, base = a * W.w + Td + WHEEL_R * K * vx - WHEEL_R * fsx;
    let w = base / den;
    if (Tb > 0) { if (w > 0) { const wb = (base - Tb) / den; w = wb < 0 ? 0 : wb; } else if (w < 0) { const wb = (base + Tb) / den; w = wb > 0 ? 0 : wb; } }
    let fx = K * (w * WHEEL_R - vx) + fsx;
    let fy = -vy * ky / (1 + ky * dt / mT) + fsy;
    // combined-slip friction ellipse; once it lets go the tyre slides on (lower) kinetic friction
    const Fmax = mu * Fz, mag = Math.hypot(fx, fy);
    W.sat = mag > Fmax;
    if (W.sat) {
      const kin = Fmax * lerp(1, 0.82, clamp((mag / Fmax - 1) * 1.5)) / mag;
      fx *= kin; fy *= kin;
      w = W.w + dt / Iw * (Td - WHEEL_R * fx);
      const dw = Tb * dt / Iw; w = w > 0 ? Math.max(0, w - dw) : Math.min(0, w + dw);
      W.sx *= 0.5; W.sy *= 0.5;                                   // tread snaps back while sliding
    }
    if (lowK > 0) { W.sx = clamp(W.sx + (w * WHEEL_R - vx) * dt, -0.05, 0.05); W.sy = clamp(W.sy - vy * dt, -0.05, 0.05); }
    W.w = w; W.spin += w * dt;
    addForceAt(_f.copy(wf).multiplyScalar(fx).addScaledVector(wr, fy), cp);
    const slipV = Math.hypot(w * WHEEL_R - vx, vy);
    W.slip = slipV; if (W.sat) skid = Math.max(skid, slipV);
    // digging: a spinning tyre on soft ground throws the soil out and sinks; rolling on climbs out
    const spinV = Math.abs(w * WHEEL_R - vx);
    if (W.soft > 0.15 && spinV > 1.2) W.dig = Math.min(0.36, W.dig + dt * 0.035 * W.soft * (spinV - 1.2));
    else W.dig = Math.max(0, W.dig - Math.abs(vx) * dt * 0.06 - dt * 0.002);
    if (W.sink > 0.18) stuck++;
  }
  // locked centre (4H/4L) and rear locker (4L): wheel speeds forced together
  if (D.range !== '2H') {
    const Wv = VEH.wheels, mf = (Wv[0].w + Wv[1].w) / 2, mr = (Wv[2].w + Wv[3].w) / 2, m = (mf + mr) / 2;
    Wv[0].w += m - mf; Wv[1].w += m - mf; Wv[2].w += m - mr; Wv[3].w += m - mr;
    if (D.range === '4L') { const r = (Wv[2].w + Wv[3].w) / 2; Wv[2].w = Wv[3].w = r; }
  }
  // ---- hull points vs ground (velocity-level impulses: unconditionally stable)
  for (const lp of HP) {
    const p = localToWorld(lp, _v);
    const g = groundAt(p.x, p.z, p.y + 0.3);
    if (p.y < g) {
      const n = normalAt(p.x, p.z, _n, p.y + 0.3);
      surfaceAt(p.x, p.z, g, S0);
      contact(p, n, (g - p.y) * n.y, null, clamp(S0.mu * 0.8, 0.2, 0.65), 'ground');
    }
  }
  // ---- trees / fixed colliders & movable obstacles vs hull box (in body local space)
  if (cgReady !== colliders.length) buildColliderGrid();
  nearColliders(VEH.pos.x, VEH.pos.z, near);
  const test = (cx, cy, cz, r, o, src) => {
    const l = _v.set(cx, cy, cz).sub(VEH.pos).applyQuaternion(_qi).add(COM);
    const px = clamp(l.x, -HB.x, HB.x), py = clamp(l.y, HB.y0, HB.y1), pz = clamp(l.z, HB.z0, HB.z1);
    const dx = l.x - px, dz = l.z - pz; let dy = l.y - py;
    if (!o) dy = 0; // vertical trunk: horizontal push only
    const d = Math.hypot(dx, dy, dz);
    if (d >= r) return;
    let nl;
    if (d > 1e-4) nl = _n.set(dx / d, dy / d, dz / d);
    else { // centre inside the box: push out along the least-penetration axis
      const ex = HB.x - Math.abs(l.x), ez = Math.min(l.z - HB.z0, HB.z1 - l.z), ey = o ? HB.y1 - l.y : 9;
      nl = ey < ex && ey < ez ? _n.set(0, 1, 0) : ex < ez ? _n.set(Math.sign(l.x) || 1, 0, 0) : _n.set(0, 0, l.z - HB.z0 < HB.z1 - l.z ? -1 : 1);
    }
    const pen = r - d;
    const cpw = localToWorld(_v2.set(px, py, pz), _v2);
    const nw = nl.applyQuaternion(q).negate(); // world normal pointing from obstacle into the box
    contact(cpw, nw, pen, o, o ? 0.5 : 0.45, src);
  };
  for (const cl of near) if (cl.r > 0.25) test(cl.x, VEH.pos.y, cl.z, cl.r, null, cl.rail ? 'rail' : 'tree');
  for (const o of VEH.obstacles) if (o.p.distanceToSquared(VEH.pos) < (o.r + 6.5) ** 2) test(o.p.x, o.p.y, o.p.z, o.r, o, o.tag === 'tree' ? 'log' : 'rock');
  // ---- water / mud: buoyancy + drag per column against the moving fluid
  const wl = G.waterLevel;
  let subSum = 0;
  for (const lc of COLS) {
    const pb = localToWorld(lc, _v);
    let depth = wl - pb.y, rho = 1000, flow = null;
    for (const m of G.mudZones) { // landslide mud: heavy fluid (1800 kg/m3) while it moves, then a soft bog
      const dd = Math.hypot(pb.x - m.x, pb.z - m.z);
      if (dd < m.r) { const top = heightAt(pb.x, pb.z) + m.depth * (1 - smooth(m.r * 0.5, m.r, dd)); if (top - pb.y > depth) { depth = top - pb.y; rho = 1800; flow = m; } }
    }
    if (depth <= 0) continue;
    depth = Math.min(depth, (HB.y1 - HB.y0) * Math.max(0.3, up.y));
    subSum += depth;
    const cen = _v3.copy(pb).addScaledVector(up, depth * 0.5);
    const seal = rho > 1000 ? 1 : 1 - VEH.ingress * 0.88;          // flooded interior -> sinks
    const fb = rho * 9.81 * COL_A * depth * seal;
    F.y += fb; T.add(_af.copy(cen).sub(VEH.pos).cross(_r.set(0, fb, 0)));
    const wv = flow ? _fl2.set(flow.vx || 0, 0, flow.vz || 0) : waterFlowAt(cen.x, cen.z, _fl2);
    const rel = pointVel(cen, _r).sub(wv), sp = rel.length();
    if (sp > 1e-3) {
      const area = depth * COL_W * 1.6 + COL_A * 0.5 * Math.abs(rel.y) / sp;
      let fd = 0.5 * rho * 1.05 * area * sp * sp;
      fd = Math.min(fd, sp * (M / COLS.length) / dt * 0.5);       // never reverses the relative motion in one step
      const fdv = rel.multiplyScalar(-fd / sp);
      F.add(fdv); T.add(_af.copy(cen).sub(VEH.pos).cross(fdv));
    }
  }
  VEH.submerged = clamp(subSum / COLS.length / 1.6);
  // water gets in through door seals / vents once it is above the floor
  const floorY = localToWorld(_v.set(0, 0.72, -0.5), _v).y;
  VEH.ingress = clamp(VEH.ingress + (wl > floorY ? dt * 0.012 * clamp(wl - floorY, 0, 1.5) : -dt * 0.004));
  // ---- air: drag + wind on the tall flat sides (centre of pressure 1.6 m up)
  const air = _r.set(0, 0, 0); if (G.windVec) air.copy(G.windVec); air.sub(VEH.v);
  const ax = air.dot(rt), az = air.dot(fw), ay = air.dot(up);
  const fa = _f.set(0, 0, 0)
    .addScaledVector(rt, 0.5 * 1.225 * 1.1 * 21 * ax * Math.abs(ax))
    .addScaledVector(fw, 0.5 * 1.225 * 0.62 * 6.8 * az * Math.abs(az))
    .addScaledVector(up, 0.5 * 1.225 * 20 * ay * Math.abs(ay) * 0.2);
  addForceAt(fa, localToWorld(_v.set(0, 1.6, -0.6), _v));
  // external pushes (events)
  if (G.windPush) F.add(G.windPush);
  // tiny numerical damping
  F.addScaledVector(VEH.v, -8);
  T.addScaledVector(VEH.w, -350);
  // ---- integrate (semi-implicit Euler; inertia in body frame)
  VEH.v.addScaledVector(F, dt / M);
  const tl = _v.copy(T).applyQuaternion(_qi);
  const wl2 = _v2.copy(VEH.w).applyQuaternion(_qi);
  wl2.x += tl.x / I.x * dt; wl2.y += tl.y / I.y * dt; wl2.z += tl.z / I.z * dt;
  VEH.w.copy(wl2.applyQuaternion(q));
  if (VEH.w.lengthSq() > 144) VEH.w.setLength(12);
  if (VEH.v.lengthSq() > 1600) VEH.v.setLength(40);
  VEH.pos.addScaledVector(VEH.v, dt);
  const wlen = VEH.w.length();
  if (wlen > 1e-6) { _q.setFromAxisAngle(_v.copy(VEH.w).divideScalar(wlen), wlen * dt); VEH.q.premultiply(_q).normalize(); }
  // never leave the world
  VEH.pos.x = clamp(VEH.pos.x, WORLD.x0 + 6, WORLD.x1 - 6); VEH.pos.z = clamp(VEH.pos.z, WORLD.z0 + 6, WORLD.z1 - 6);
  const floor = heightAt(VEH.pos.x, VEH.pos.z) - 3;
  if (VEH.pos.y < floor) { VEH.pos.y = floor + 1; VEH.v.y = Math.max(0, VEH.v.y); } // tunnelling guard
  VEH.grounded = grounded; VEH.skid = Math.max(VEH.skid * 0.97, skid); if (grounded) VEH.mu = muSum / grounded;
  VEH.stuck = stuck;
  if (VEH.wheels[2].contact) VEH.surface = VEH.wheels[2].kind;
  // report the scrape of this step (body local)
  if (SCR.k > 3000 && VEH.scrapes.length < 24) VEH.scrapes.push({ lp: worldToLocal(SCR.p, new THREE.Vector3()), dir: SCR.d.clone().applyQuaternion(_qi), k: SCR.k });
  return HIT.vn;
}

// ---------------------------------------------------------------- movable obstacles (rocks / logs)
const og = new THREE.Vector3(), _ov = new THREE.Vector3(), _oq = new THREE.Quaternion(), _oa = new THREE.Vector3();
const GROUPS = [];
function stepObstacles(dt) {
  const obs = VEH.obstacles;
  for (const o of obs) {
    if (o.static || o.frozen || o.sleep) continue;
    o.v.y -= 9.81 * dt;
    o.p.addScaledVector(o.v, dt);
    const g = heightAt(o.p.x, o.p.z) + o.r * 0.85;
    o.grounded = false;
    if (o.p.y < g) {
      o.p.y = g; o.grounded = true;
      const n = normalAt(o.p.x, o.p.z, og), vn = o.v.dot(n);
      if (vn < 0) o.v.addScaledVector(n, -vn * 1.2);                  // bounce a little
      // tangential: irregular rocks roll/slide with resistance
      const vt = _ov.copy(o.v).addScaledVector(n, -o.v.dot(n)), sp = vt.length();
      const muR = o.tag === 'tree' ? 0.55 : 0.22 + o.r * 0.18;
      const dec = muR * 9.81 * n.y * dt;
      if (sp > dec) o.v.addScaledVector(vt, -dec / sp); else o.v.addScaledVector(vt, -1);
      // mud flow carries debris
      for (const m of G.mudZones) if (m.vx || m.vz) { const d = Math.hypot(o.p.x - m.x, o.p.z - m.z); if (d < m.r) { o.v.x += (m.vx - o.v.x) * dt * 0.8; o.v.z += (m.vz - o.v.z) * dt * 0.8; } }
      // rolling visual
      if (sp > 0.02) { _oa.crossVectors(n, vt).normalize(); _oq.setFromAxisAngle(_oa, sp * dt / o.r); o.q.premultiply(_oq); }
      if (sp < 0.04 && Math.abs(o.v.y) < 0.2) { o.restT = (o.restT || 0) + dt; if (o.restT > 1.5 && G.t - (o.hitT || -9) > 1.5) { o.sleep = true; o.v.set(0, 0, 0); } } else o.restT = 0;
    }
    o.rotAcc = (o.rotAcc || 0) + Math.hypot(o.v.x, o.v.z) * dt / o.r;
  }
  // sphere-sphere collisions between debris (momentum exchange, slight restitution)
  for (let i = 0; i < obs.length; i++) {
    const a = obs[i];
    for (let j = i + 1; j < obs.length; j++) {
      const b = obs[j]; if ((a.sleep || a.static) && (b.sleep || b.static)) continue;
      if (a.group && a.group === b.group) continue;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, rr = a.r + b.r, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
      const ia = a.static ? 0 : 1 / a.m, ib = b.static ? 0 : 1 / b.m, sum = ia + ib; if (!sum) continue;
      a.p.x -= nx * pen * ia / sum; a.p.y -= ny * pen * ia / sum; a.p.z -= nz * pen * ia / sum;
      b.p.x += nx * pen * ib / sum; b.p.y += ny * pen * ib / sum; b.p.z += nz * pen * ib / sum;
      const vn = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
      if (vn < 0) { const j2 = -1.15 * vn / sum; a.v.x -= nx * j2 * ia; a.v.y -= ny * j2 * ia; a.v.z -= nz * j2 * ia; b.v.x += nx * j2 * ib; b.v.y += ny * j2 * ib; b.v.z += nz * j2 * ib; a.sleep = b.sleep = false; }
    }
  }
  // rigid chains (a fallen trunk = row of spheres that moves and turns as one piece)
  for (const grp of GROUPS) for (let it = 0; it < 2; it++) for (let k = 0; k + 1 < grp.length; k++) {
    const a = grp[k], b = grp[k + 1], L = a.link;
    const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, d = Math.hypot(dx, dy, dz) || 1, e = (d - L) / d * 0.5;
    a.p.x += dx * e; a.p.y += dy * e; a.p.z += dz * e; b.p.x -= dx * e; b.p.y -= dy * e; b.p.z -= dz * e;
    const nx = dx / d, ny = dy / d, nz = dz / d;
    const rv = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz; // remove stretching velocity
    a.v.x += nx * rv / 2; a.v.y += ny * rv / 2; a.v.z += nz * rv / 2; b.v.x -= nx * rv / 2; b.v.y -= ny * rv / 2; b.v.z -= nz * rv / 2;
    if (!a.sleep || !b.sleep) { a.sleep = b.sleep = false; }
  }
}
export function addObstacle(p, r, opts = {}) {
  const o = { p: p.clone(), v: opts.v ? opts.v.clone() : new THREE.Vector3(), r, m: opts.m ?? 2600 * r * r * r * 4, static: !!opts.static, tag: opts.tag || 'rock', rot: Math.random() * 6, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)), sleep: false, group: null };
  VEH.obstacles.push(o); return o;
}
/** Link obstacles into a rigid chain (e.g. the segments of one fallen trunk). */
export function linkObstacles(list) {
  for (let k = 0; k + 1 < list.length; k++) list[k].link = list[k].p.distanceTo(list[k + 1].p);
  list.forEach(o => o.group = list); GROUPS.push(list);
}
export function removeObstacles(tag) {
  VEH.obstacles = VEH.obstacles.filter(o => o.tag !== tag);
  for (let i = GROUPS.length - 1; i >= 0; i--) if (GROUPS[i][0]?.tag === tag) GROUPS.splice(i, 1);
}

// ---------------------------------------------------------------- frame update
const _lv = new THREE.Vector3(), _pv = new THREE.Vector3(), _e = new THREE.Euler(), _hp = new THREE.Vector3(), _hn = new THREE.Vector3();
export function updateVehicle(dt, group) {
  VEH.acc += Math.min(dt, 0.1);
  VEH.drive.abs = VEH.drive.tcs = false;
  let hard = 0, n = 0, ho = null, hs = 'crash'; _pv.copy(VEH.v);
  while (VEH.acc >= STEP && n < 12) {
    const h = step(STEP);
    if (h > hard) { hard = h; _hp.copy(HIT.p); _hn.copy(HIT.n); ho = HIT.o; hs = HIT.src; }
    stepObstacles(STEP); VEH.acc -= STEP; n++;
  }
  if (n >= 12) VEH.acc = 0;
  VEH.speed = VEH.v.length();
  VEH.fwdSpeed = VEH.v.dot(VEH.fwd);
  VEH.latSpeed = VEH.v.dot(_lv.set(1, 0, 0).applyQuaternion(VEH.q));
  VEH.airT = VEH.grounded ? 0 : VEH.airT + dt;
  if (n) { // accelerations in g (body frame) for HUD / sway
    const a = _pv.subVectors(VEH.v, _pv).divideScalar(n * STEP).applyQuaternion(_wq.copy(VEH.q).invert());
    VEH.latG += (a.x / 9.81 - VEH.latG) * Math.min(1, dt * 6); VEH.lonG += (-a.z / 9.81 - VEH.lonG) * Math.min(1, dt * 6);
  }
  _e.setFromQuaternion(VEH.q, 'YXZ'); VEH.pitch = _e.x; VEH.roll = _e.z;
  // ---- impacts -> damage (dents / scratches / cracks / hull %); relative speed decides the severity
  if (hard > 1.3) {
    const lp = worldToLocal(_hp, new THREE.Vector3()), ln = _hn.clone().applyQuaternion(_wq.copy(VEH.q).invert()).negate();
    const cause = ho ? (ho.tag === 'tree' ? 'log' : 'rock') : hs;
    if (hard > 3.2 && G.t - VEH.lastImpact > 0.5) {
      VEH.lastImpact = G.t;
      const power = clamp((hard - 2.5) / 6, 0.15, 1.4) * (ho && !ho.static ? clamp(ho.m / 2500, 0.4, 1.6) : 1);
      bus.emit('impact', { from: _hn.clone().negate(), power, source: 'crash', lp, ln, cause });
    } else if (G.t - VEH.lastDent > 0.25) { VEH.lastDent = G.t; bus.emit('dent', { lp, ln, sev: clamp((hard - 1.2) / 5, 0.05, 0.5), cause }); }
  }
  if (group) {
    originOf(group.position); group.quaternion.copy(VEH.q);
    WHEEL_MESHES(group);
  }
}
function WHEEL_MESHES(group) {
  const ws = group.userData.wheels; if (!ws) return;
  ws.forEach((w, i) => {
    const W = VEH.wheels[i];
    w.position.y = ANCHOR_Y - Math.min(W.t, SUS_LEN - 0.02) + WHEEL_R + W.sink * 0; // tyre sinks into the ground with the contact
    w.rotation.y = WHEELS[i][2] ? W.steer : 0;
    w.children.forEach(c => c.rotation.x = -W.spin);
  });
}

/** Winch / hydraulic-jack assist toward upright (used by recovery only). */
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
/** World point -> camper local (for damage placement from external events). */
export function toLocal(wp, out = new THREE.Vector3()) { return worldToLocal(wp, out); }
export const VEHICLE = { M, HB, COM, WB, TRACK, MAX_LOCK };
