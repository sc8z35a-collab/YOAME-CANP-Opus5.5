// Autopilot: plans a route on the road graph and drives the physical camper with pure-pursuit
// steering + a speed planner (curvature, grade, water, obstacles). It never teleports:
// if the van is pushed off the road, falls or rolls, the physics plays out, and afterwards the
// autopilot recovers — self-righting assist, off-road A* back to the road, K-turns at dead ends,
// and as a last resort a winch that reels the van back onto the road (no soft-locks).
import { THREE, G, bus, clamp } from './core.js';
import { NODES, DESTS, route, nearestNode } from './roads.js';
import { heightAt, slopeAt, isInWorld } from './terrain.js';
import { VEH, originOf, rightingAssist } from './vehicle.js';

export const AP = {
  on: false, dest: null, path: [], idx: 0, mode: 'idle',   // idle | drive | right | winch
  speedT: 0, stuckT: 0, remain: 0, msg: '', offroad: null, slow: false, at: null,
  blockedNodes: new Map(), cruise: 7.5, kturn: null,       // cruise m/s (~27km/h on a forest road)
};
const _o = new THREE.Vector3();
const LOCK = 0.72;          // max steering angle (rad) ≈ 7.5m turning radius
const WB = 6.55;            // wheelbase

function say(msg, level = 'info', ms = 3800) { AP.msg = msg; bus.emit('toast', { msg, level, ms }); }

// ---------------------------------------------------------------- planning
function nodeCost(n) {
  const b = AP.blockedNodes.get(n);
  if (b && G.t < b) return 400;                  // soft block: avoid if any alternative exists
  if (NODES[n].ford && G.waterLevel > -1.2) return 300; // flooded ford: go around if possible
  return 0;
}

/** Off-road A* on a 3m grid from (x,z) to the nearest road node reachable with grades < 0.55. */
function offroadPlan(x, z) {
  const S = 3, R = 40, W = R * 2 + 1, ox = x - R * S, oz = z - R * S, idx = (i, j) => j * W + i;
  const cost = new Float32Array(W * W).fill(Infinity), prev = new Int32Array(W * W).fill(-1);
  const tgt = new Map();
  for (let k = 0; k < NODES.length; k++) {
    const n = NODES[k], i = Math.round((n.x - ox) / S), j = Math.round((n.z - oz) / S);
    if (i >= 0 && j >= 0 && i < W && j < W && !n.bridge) tgt.set(idx(i, j), k);
  }
  const open = [[0, idx(R, R)]]; cost[idx(R, R)] = 0;
  let found = -1, it = 0;
  while (open.length && it++ < 9000) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [c, u] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (c > cost[u]) continue;
    if (tgt.has(u)) { found = u; break; }
    const ui = u % W, uj = (u / W) | 0, uh = heightAt(ox + ui * S, oz + uj * S);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const vi = ui + di, vj = uj + dj; if (vi < 0 || vj < 0 || vi >= W || vj >= W) continue;
      const vx = ox + vi * S, vz = oz + vj * S; if (!isInWorld(vx, vz, 10)) continue;
      const d = Math.hypot(di, dj) * S, vh = heightAt(vx, vz), g = Math.abs(vh - uh) / d;
      if (g > 0.55 || slopeAt(vx, vz) > 0.8) continue;
      const v = idx(vi, vj), nc = c + d * (1 + g * 4 + (G.waterLevel > vh + 0.3 ? 3 : 0));
      if (nc < cost[v]) { cost[v] = nc; prev[v] = u; open.push([nc, v]); }
    }
  }
  if (found < 0) return null;
  const pts = []; for (let u = found; u !== -1; u = prev[u]) pts.push({ x: ox + (u % W) * S, z: oz + ((u / W) | 0) * S, n: -1 });
  return { pts: pts.reverse(), node: tgt.get(found) };
}

function plan(fromRecovery = false) {
  const p = originOf(_o), dest = DESTS[AP.dest];
  let start = nearestNode(p.x, p.z, 7), lead = [];
  if (start < 0 || Math.abs(NODES[start].h - p.y) > 2.5) {
    const off = offroadPlan(p.x, p.z);
    if (!off) { start = nearestNode(p.x, p.z); lead = [{ x: NODES[start].x, z: NODES[start].z, n: -1 }]; }
    else { start = off.node; lead = off.pts; }
  }
  AP.offroad = lead.length > 0;
  const r = route(start, dest.node, nodeCost);
  if (!r) return false;
  let pts = lead.concat(r.nodes.map(i => ({ x: NODES[i].x, z: NODES[i].z, n: i })));
  // drop leading nodes that are behind us (no needless U-turn to the exact nearest sample)
  const f = VEH.fwd; let k = 0;
  while (!lead.length && k < Math.min(pts.length - 1, 4) && ((pts[k].x - p.x) * f.x + (pts[k].z - p.z) * f.z) < 0) k++;
  AP.path = pts.slice(k); AP.idx = 0; AP.kturn = null;
  AP.slow = fromRecovery || AP.offroad;
  return true;
}

// ---------------------------------------------------------------- API
export function engage(destId) {
  const d = DESTS[destId]; if (!d) return false;
  const p = originOf(_o);
  if (Math.hypot(p.x - d.x, p.z - d.z) < 4 && VEH.speed < 0.5) { say('もう「' + d.name + '」にいる'); return false; }
  if (G.state.hull < 3) { say('車体が壊れて動かない…（しばらく休むと少し直る）', 'danger'); return false; }
  AP.dest = destId; AP.on = true; AP.mode = 'drive'; AP.stuckT = 0; AP.stuckN = 0; AP.slow = false; AP.at = null;
  AP.blockedNodes.clear();
  G.driving = true; G.state.noise = Math.max(G.state.noise, 0.8);
  if (VEH.up.y < 0.7) { AP.mode = 'right'; AP.rightT = 0; say('車体を起こしてから、ゆっくり発進する', 'warn'); }
  else if (!plan()) { say('ルートが見つからない…', 'warn'); AP.on = false; G.driving = false; return false; }
  else say(`🧭 自動運転：「${d.name}」へ${AP.offroad ? '（まず林道へ戻る）' : ''}`, 'info');
  bus.emit('sfx', 'engine'); bus.emit('autopilot', 'start', destId);
  return true;
}
export function disengage(reason = '') {
  const was = AP.on;
  AP.on = false; AP.mode = 'idle'; AP.kturn = null; G.driving = false;
  VEH.ctrl.throttle = 0; VEH.ctrl.brake = 1; VEH.ctrl.hand = true; VEH.ctrl.steer = 0;
  if (reason) say(reason, 'info');
  if (was) bus.emit('autopilot', 'stop');
}

// ---------------------------------------------------------------- winch rescue (anti soft-lock)
function startWinch() {
  const p = originOf(_o);
  let best = -1, bd = 1e18;
  for (let i = 0; i < NODES.length; i++) {
    const n = NODES[i]; if (n.bridge || n.ford) continue;
    const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2 + ((n.h - p.y) * 2) ** 2;
    if (d < bd && !(AP.blockedNodes.get(i) > G.t)) { bd = d; best = i; }
  }
  AP.mode = 'winch'; AP.winchN = best; AP.winchT = 0; AP.kturn = null;
  say('🪝 ウインチを木に掛けて、林道まで引き上げる…', 'warn', 4500);
  bus.emit('winch', true);
}
function winch(dt, p) {
  const c = VEH.ctrl, n = NODES[AP.winchN];
  c.throttle = 0; c.brake = 0; c.hand = false; c.steer = 0;
  AP.winchT += dt;
  const dx = n.x - p.x, dz = n.z - p.z, dy = n.h + 0.6 - p.y, d = Math.hypot(dx, dz);
  const sp = Math.min(1.6, 0.4 + AP.winchT * 0.1), k = Math.min(1, dt * 2.5);
  // bounded velocity servo toward the anchor: the body still collides, scrapes and tilts
  VEH.v.x += ((dx / Math.max(d, 0.1)) * sp - VEH.v.x) * k;
  VEH.v.z += ((dz / Math.max(d, 0.1)) * sp - VEH.v.z) * k;
  if (dy > -0.2) VEH.v.y += (clamp(dy, 0, 2) * 0.8 - VEH.v.y) * k * 0.6;
  rightingAssist(dt, 1.5);
  G.state.noise = Math.max(G.state.noise, 0.5);
  if ((d < 2.5 && VEH.up.y > 0.9) || AP.winchT > 120) {
    AP.mode = 'drive'; AP.stuckT = 0; AP.stuckN = 0;
    bus.emit('winch', false);
    if (!plan(true)) return disengage('ここからは戻れない…');
    say('林道に戻った。ゆっくり再発進する', 'info');
  }
}

// ---------------------------------------------------------------- per-frame control
export function updateAutopilot(dt) {
  const c = VEH.ctrl;
  if (!AP.on) {
    c.throttle = 0; c.steer = 0;
    c.hand = VEH.speed < 1.5; c.brake = VEH.up.y > 0.6 ? 1 : 0; // parked: handbrake (still slides if shoved hard)
    return;
  }
  if (G.state.hull <= 0) return disengage('車が動かなくなった…');
  const p = originOf(_o), up = VEH.up.y;
  if (AP.mode === 'winch') return winch(dt, p);
  // ---- airborne / upset: physics only, then recover
  if (VEH.airT > 0.25 || (up < 0.55 && AP.mode !== 'right')) {
    c.throttle = 0; c.brake = 0; c.hand = false;
    if (VEH.airT > 0.6 && !AP.fallWarn) { AP.fallWarn = true; say('うわっ…！ 落ちる！', 'danger', 2500); bus.emit('fall'); }
    if (VEH.speed < 1.2 && up < 0.55) { AP.mode = 'right'; AP.rightT = 0; }
    return;
  }
  AP.fallWarn = false;
  if (AP.mode === 'right') {
    c.throttle = 0; c.hand = false; c.brake = 0.3;
    AP.rightT = (AP.rightT || 0) + dt;
    if (AP.rightT > 1.5) rightingAssist(dt, 1 + AP.rightT * 0.1);
    if (AP.rightT > 25) return startWinch();
    if (up > 0.93 && VEH.speed < 1 && AP.rightT > 1.5) {
      AP.mode = 'drive'; AP.stuckT = 0; AP.rightT = 0;
      if (!plan(true)) return startWinch();
      say('体勢を立て直した。ゆっくり林道へ戻る', 'warn');
    }
    return;
  }
  // ---- follow path
  const path = AP.path; if (!path.length) return disengage();
  const spd = VEH.fwdSpeed;
  let best = AP.idx, bd = 1e9;
  for (let i = AP.idx; i < Math.min(path.length, AP.idx + 12); i++) { const d = Math.hypot(path[i].x - p.x, path[i].z - p.z); if (d < bd) { bd = d; best = i; } }
  AP.idx = best;
  if (bd > (AP.offroad ? 9 : 6) && !AP.kturn) { AP.replanT = (AP.replanT || 0) + dt; if (AP.replanT > 1.2) { AP.replanT = 0; plan(true); return; } } else AP.replanT = 0;
  const look = clamp(4 + Math.abs(spd) * 0.9, 4, 12);
  let li = AP.idx, acc = 0;
  while (li < path.length - 1 && acc < look) { acc += Math.hypot(path[li + 1].x - path[li].x, path[li + 1].z - path[li].z); li++; }
  const T = path[li];
  // pure pursuit from the rear axle (local z=+1.9)
  const f = VEH.fwd, fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl, rx = -fz, rz = fx;
  const ax = p.x - fx * 1.9, az = p.z - fz * 1.9;
  const dx = T.x - ax, dz = T.z - az, Ld = Math.max(2, Math.hypot(dx, dz));
  const lat = dx * rx + dz * rz, lon = dx * fx + dz * fz;
  const herr = Math.atan2(lat, lon);
  // ---- K-turn when the target is well behind (dead ends, after a spin, wrong-way recovery)
  if (!AP.kturn && Math.abs(herr) > 1.75 && Ld < 30) AP.kturn = { dir: 1, t: 0, side: lat >= 0 ? 1 : -1, n: 0, dist: 0 };
  if (AP.kturn) {
    const K = AP.kturn; K.t += dt;
    if (Math.abs(herr) < 0.6 || K.n > 14) AP.kturn = null;
    else {
      c.hand = false; c.steer = -LOCK * K.side * K.dir;
      if (K.t < 0.5) { c.throttle = 0; c.brake = 1; }
      else { c.brake = 0; c.throttle = K.dir * clamp(0.35 + (1.6 - spd * K.dir) * 0.4, 0, 0.8); }
      K.dist += Math.abs(spd) * dt;
      if (K.t > 0.5 && (K.dist > 5.5 || (K.t > 3 && Math.abs(spd) < 0.2))) { K.dir = -K.dir; K.t = 0; K.dist = 0; K.n++; }
      AP.speedT = 1.6; AP.stuckT = 0;
      return;
    }
  }
  c.steer = -clamp(Math.atan(2 * WB * lat / (Ld * Ld)), -LOCK, LOCK); // steer>0 = left
  // ---- speed plan
  let kmax = 0;
  for (let i = AP.idx + 1; i < Math.min(path.length - 1, AP.idx + 14); i++) {
    const a = path[i - 1], b = path[i], d = path[i + 1];
    let dh = Math.abs(Math.atan2(d.x - b.x, d.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)); dh = Math.min(dh, Math.PI * 2 - dh);
    kmax = Math.max(kmax, dh / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z)));
  }
  let remain = 0; for (let i = AP.idx; i < path.length - 1; i++) remain += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  AP.remain = remain + bd;
  let vt = Math.min(AP.cruise, Math.sqrt(2.2 / Math.max(kmax, 1e-3)), 1.2 + Math.sqrt(2 * 1.6 * Math.max(0, remain - 1)));
  if (AP.slow) vt = Math.min(vt, 2.6);
  if (VEH.submerged > 0.15) vt = Math.min(vt, 2);
  if (G.rain > 0.6) vt *= 0.85;
  if (G.fog > 0.7) vt *= 0.8;
  for (const o of VEH.obstacles) { // obstacle ahead: creep toward it — the physics decides what happens
    const ox = o.p.x - p.x, oz = o.p.z - p.z, along = ox * fx + oz * fz, side = Math.abs(ox * rx + oz * rz);
    if (along > 0 && along < 16 && side < 1.6 + o.r) vt = Math.min(vt, 1.4 + along * 0.15);
  }
  if (G.obstacleAhead) vt = Math.min(vt, G.obstacleAhead);
  if (AP.slow && remain < AP.slowUntil) AP.slow = false;
  AP.speedT = vt;
  const err = vt - spd;
  c.hand = false;
  if (err > 0) { c.throttle = clamp(err * 0.5 + 0.18 + Math.max(0, f.y) * 2, 0, 1); c.brake = 0; }
  else { c.throttle = 0; c.brake = clamp(-err * 0.4, 0, 1); }
  // ---- stuck: back up with opposite lock, mark ahead as blocked, replan; repeated -> winch
  if (Math.abs(spd) < 0.35 && vt > 1) AP.stuckT += dt; else AP.stuckT = Math.max(0, AP.stuckT - dt * 2);
  if (Math.abs(spd) > 2) { AP.goodT = (AP.goodT || 0) + dt; if (AP.goodT > 20) { AP.goodT = 0; AP.stuckN = 0; } }
  if (AP.stuckT > 4 && AP.stuckT < 6.5) { c.throttle = -0.5; c.steer = -c.steer; c.brake = 0; }
  if (AP.stuckT >= 6.5) {
    AP.stuckT = 0; AP.stuckN = (AP.stuckN || 0) + 1;
    for (let i = AP.idx; i < Math.min(path.length, AP.idx + 8); i++) if (path[i].n >= 0) AP.blockedNodes.set(path[i].n, G.t + 90);
    if (AP.stuckN > 2) { AP.stuckN = 0; return startWinch(); }
    plan(true); say('進めない…別の道を探す', 'warn');
  }
  // ---- arrival
  const dest = DESTS[AP.dest];
  if (Math.hypot(p.x - dest.x, p.z - dest.z) < 3 || (li >= path.length - 1 && remain < 2 && bd < 4)) {
    if (Math.abs(spd) < 0.4) {
      AP.at = AP.dest; G.camperSpot = AP.dest; AP.stuckN = 0;
      disengage(); say(`🅿 「${dest.name}」に到着。エンジンを切った`, 'info', 4500);
      bus.emit('arrived', AP.at);
    } else { c.throttle = 0; c.brake = 1; }
  }
}

/** Destination the camper is parked at (null if none within 9m). */
export function parkedAt() {
  const p = originOf(_o); let best = null, bd = 9;
  for (const d of Object.values(DESTS)) { const dd = Math.hypot(p.x - d.x, p.z - d.z); if (dd < bd) { bd = dd; best = d.id; } }
  return best;
}
export function nearestDest() {
  const p = originOf(_o); let best = null, bd = 1e9;
  for (const d of Object.values(DESTS)) { const dd = Math.hypot(p.x - d.x, p.z - d.z); if (dd < bd) { bd = dd; best = d; } }
  return { d: best, dist: bd };
}
