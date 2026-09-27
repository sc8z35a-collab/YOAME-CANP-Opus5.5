// First-person player that walks freely inside the camper (camper-local coordinates, so walking
// keeps working while the van drives, tilts, or even tumbles), can sit / lie down at seats, and
// can step outside through the side door. Collision = axis-aligned furniture boxes + walls.
import { THREE, G, P, clamp, damp, lerp, bus } from './core.js';
import { FLOOR, CEIL, XW, ZF, ZB } from './camper.js';
import { groundAt } from './terrain.js';

const XI = XW - 0.12 - 0.22;      // inner wall minus body radius
const R = 0.22;                    // body radius
const EYE = 1.62, EYE_SIT = 1.12, EYE_CROUCH = 1.05;

// furniture footprints (camper local): [x0, z0, x1, z1, top]  (top = walk-over height)
const BLOCK = [
  [-XW, -2.45, -0.35, -1.9, FLOOR + 0.9],     // dinette bench front
  [-XW, -0.3, -0.35, 0.25, FLOOR + 0.9],      // dinette bench rear
  [-XW, -1.78, -0.42, -0.42, FLOOR + 0.74],   // table
  [0.47, -1.68, XW, 0.32, FLOOR + 0.92],      // kitchen counter
  [0.45, -2.55, XW, -1.72, FLOOR + 1.7],      // fridge
  [-XW, 0.35, -0.2, 1.45, CEIL],              // wet bath / wardrobe
  [-XW, 1.5, XW, ZB, FLOOR + 0.58],           // bed platform (climb on = lie)
  [-XW, ZF, XW, -2.75, FLOOR + 0.85],         // cab: seats + dash (reached via seat hotspots)
];

// interaction hotspots (camper local)
export const SPOTS_IN = [
  { id: 'lounge', label: 'ソファに座る', at: [-0.7, -0.9], pos: [-0.45, FLOOR + EYE_SIT, -0.05], look: [-1.3, FLOOR + 1.18, -1.15], sit: true },
  { id: 'lounge2', label: 'ソファに座る', at: [-0.7, -1.6], pos: [-0.5, FLOOR + EYE_SIT, -2.1], look: [-1.3, FLOOR + 1.2, -1.0], sit: true },
  { id: 'driver', label: '運転席に座る', at: [-0.3, -2.55], pos: [-0.55, FLOOR + 1.28, -3.25], look: [-0.3, FLOOR + 1.05, -8], sit: true },
  { id: 'passenger', label: '助手席に座る', at: [0.3, -2.55], pos: [0.55, FLOOR + 1.28, -3.25], look: [0.3, FLOOR + 1.05, -8], sit: true },
  { id: 'bed', label: 'ベッドで横になる', at: [0.0, 1.3], pos: [0.15, FLOOR + 1.02, 2.75], look: [0.0, 3.9, 2.2], lie: true },
  { id: 'kitchen', label: 'キッチンに立つ', at: [0.15, -0.8], pos: [0.1, FLOOR + 1.6, -0.75], look: [1.4, FLOOR + 1.3, -0.5], stand: true },
  { id: 'alcove', label: 'ロフトに登る', at: [0.0, -2.6], pos: [0.2, 2.62, -3.3], look: [0.3, 2.35, 1.5], lie: true, needFwd: true },
  { id: 'door', label: '外に出る', at: [0.75, 0.72], door: true },
  { id: 'tablet', label: 'タブレットを見る', at: [-0.2, -2.6], tablet: true },
];

export const PL = {
  inside: true, pos: new THREE.Vector3(0.1, FLOOR + EYE, -0.6), yaw: Math.PI, pitch: -0.05,
  vel: new THREE.Vector3(), seat: null, crouch: 0, eye: EYE, bob: 0, focus: null,
  world: new THREE.Vector3(), wvel: new THREE.Vector3(), onGround: true,
  move: { x: 0, y: 0 }, run: false, trans: 1, from: null, to: null,
};

function collide(p) {
  p.x = clamp(p.x, -XI, XI); p.z = clamp(p.z, ZF + 1.0, ZB - 0.35);
  for (let it = 0; it < 2; it++) for (const b of BLOCK) {
    if (b[4] < FLOOR + 0.3) continue;
    const x0 = b[0] - R, z0 = b[1] - R, x1 = b[2] + R, z1 = b[3] + R;
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
      const dx0 = p.x - x0, dx1 = x1 - p.x, dz0 = p.z - z0, dz1 = z1 - p.z, m = Math.min(dx0, dx1, dz0, dz1);
      if (m === dx0) p.x = x0; else if (m === dx1) p.x = x1; else if (m === dz0) p.z = z0; else p.z = z1;
    }
  }
}

export function sitAt(id, instant = false) {
  const s = SPOTS_IN.find(x => x.id === id); if (!s || !s.pos) return;
  PL.inside = true;
  PL.seat = s; PL.from = PL.pos.clone(); PL.to = new THREE.Vector3(...s.pos); PL.trans = instant ? 1 : 0;
  const dx = s.look[0] - s.pos[0], dy = s.look[1] - s.pos[1], dz = s.look[2] - s.pos[2];
  PL.yaw = Math.atan2(-dx, -dz); PL.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (instant) PL.pos.copy(PL.to);
  G.viewKey = id.replace(/2$/, '');
  bus.emit('seat', id);
}
export function standUp() {
  if (!PL.seat) return;
  const s = PL.seat; PL.seat = null;
  PL.from = PL.pos.clone(); PL.to = new THREE.Vector3(s.at[0], FLOOR + EYE, s.at[1]); PL.trans = 0;
  G.viewKey = 'walk';
}
export function goOutside(camper) {
  // step out of the side door onto the ground next to the van
  const p = new THREE.Vector3(XW + 1.1, 0, 0.72); camper.localToWorld(p);
  p.y = groundAt(p.x, p.z) + EYE;
  PL.inside = false; PL.seat = null; PL.world.copy(p); PL.wvel.set(0, 0, 0);
  PL.yaw += camper.rotation.y; G.viewKey = 'outside';
  bus.emit('sfx', 'door');
}
export function goInside(camper) {
  PL.inside = true; PL.pos.set(0.75, FLOOR + EYE, 0.72); PL.yaw -= camper.rotation.y; G.viewKey = 'walk';
  bus.emit('sfx', 'door');
}

/** Hotspot the player is looking at / standing near (for the context button). */
export function focusSpot(camper) {
  if (!PL.inside) {
    const d = new THREE.Vector3(XW + 0.9, 0, 0.72); camper.localToWorld(d);
    return Math.hypot(d.x - PL.world.x, d.z - PL.world.z) < 2.4 ? { id: 'enter', label: '車に戻る' } : null;
  }
  if (PL.seat) return { id: 'stand', label: PL.seat.lie ? '起き上がる' : '立ち上がる' };
  let best = null, bd = 0.85;
  for (const s of SPOTS_IN) { const d = Math.hypot(PL.pos.x - s.at[0], PL.pos.z - s.at[1]); if (d < bd) { bd = d; best = s; } }
  return best;
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3();
export function updatePlayer(dt, camper, driving) {
  const m = PL.move, S = G.state;
  PL.crouch = damp(PL.crouch, S.hiding && !PL.seat ? 1 : 0, 5, dt);
  if (PL.inside) {
    if (PL.seat) {
      PL.trans = Math.min(1, PL.trans + dt * 1.6);
      const t = PL.trans * PL.trans * (3 - 2 * PL.trans);
      PL.pos.lerpVectors(PL.from || PL.to, PL.to, t);
      PL.pos.y += Math.sin(t * Math.PI) * 0.12;
      if (Math.hypot(m.x, m.y) > 0.6 && PL.trans >= 1) standUp();
    } else {
      if (PL.to && PL.trans < 1) { PL.trans = Math.min(1, PL.trans + dt * 2.2); PL.pos.lerpVectors(PL.from, PL.to, PL.trans); }
      const sp = (PL.run ? 2.2 : 1.35) * (1 - PL.crouch * 0.5);
      _f.set(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw)); _r.set(-_f.z, 0, _f.x);
      const tx = (_f.x * m.y + _r.x * m.x) * sp, tz = (_f.z * m.y + _r.z * m.x) * sp;
      PL.vel.x = damp(PL.vel.x, tx, 10, dt); PL.vel.z = damp(PL.vel.z, tz, 10, dt);
      // the van accelerating/turning shoves you (inertia in the moving frame)
      if (driving && G.vehAccL) { PL.vel.x -= G.vehAccL.x * dt * 0.12; PL.vel.z -= G.vehAccL.z * dt * 0.12; }
      PL.pos.x += PL.vel.x * dt; PL.pos.z += PL.vel.z * dt;
      collide(PL.pos);
      const spd = Math.hypot(PL.vel.x, PL.vel.z);
      PL.bob += spd * dt * 5.5;
      PL.pos.y = damp(PL.pos.y, FLOOR + lerp(EYE, EYE_CROUCH, PL.crouch) + Math.sin(PL.bob) * 0.025 * clamp(spd), 12, dt);
      if (spd > 0.4 && Math.floor(PL.bob / Math.PI) !== PL.step) { PL.step = Math.floor(PL.bob / Math.PI); bus.emit('sfx', 'step'); }
      G.viewKey = 'walk';
    }
  } else {
    // outside: walk on the terrain (simple character controller with gravity)
    const sp = PL.run ? 3.4 : 1.7;
    _f.set(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw)); _r.set(-_f.z, 0, _f.x);
    PL.wvel.x = damp(PL.wvel.x, (_f.x * m.y + _r.x * m.x) * sp, 8, dt);
    PL.wvel.z = damp(PL.wvel.z, (_f.z * m.y + _r.z * m.x) * sp, 8, dt);
    PL.wvel.y -= 9.8 * dt;
    PL.world.addScaledVector(PL.wvel, dt);
    // can't walk through the van (local box push-out)
    const l = camper.worldToLocal(PL.world.clone());
    if (Math.abs(l.x) < XW + 0.3 && l.z > ZF - 1.3 && l.z < ZB + 0.3 && l.y < 3.3) {
      const px = XW + 0.3 - Math.abs(l.x), pf = l.z - (ZF - 1.3), pb = ZB + 0.3 - l.z;
      if (px < pf && px < pb) l.x = Math.sign(l.x || 1) * (XW + 0.3); else if (pf < pb) l.z = ZF - 1.3; else l.z = ZB + 0.3;
      PL.world.copy(camper.localToWorld(l));
    }
    const g = groundAt(PL.world.x, PL.world.z, PL.world.y) + lerp(EYE, EYE_CROUCH, PL.crouch);
    if (PL.world.y < g) { PL.world.y = g; PL.wvel.y = 0; PL.onGround = true; } else PL.onGround = false;
    const spd = Math.hypot(PL.wvel.x, PL.wvel.z);
    PL.bob += spd * dt * 4.5;
    if (spd > 0.4 && Math.floor(PL.bob / Math.PI) !== PL.step) { PL.step = Math.floor(PL.bob / Math.PI); bus.emit('sfx', 'stepOut'); }
    // the van drove away: auto-board (autopilot only starts after you're inside anyway)
    if (driving) goInside(camper);
  }
  PL.pitch = clamp(PL.pitch, -1.35, 1.4);
}

export function initPlayer() {
  const v = P.get('view');
  if (v === 'outside') { PL.inside = false; PL.pendingOutside = true; }
  else sitAt(v && SPOTS_IN.find(s => s.id === v) ? v : 'lounge', true);
}
