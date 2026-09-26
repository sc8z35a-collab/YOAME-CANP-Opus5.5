// First-person viewpoints inside the camper. Touch-drag (right side of screen) to look,
// pinch to zoom, tap viewpoint buttons to glide between seats; "peek" leans toward a window.
import { THREE, G, clamp, damp, lerp, P } from './core.js';
import { FLOOR, ROOF } from './camper.js';
import { heightAt } from './terrain.js';
const ROOFV = ROOF;

// local camper coords: eye position + default yaw (0 = looking toward -z/front), pitch
// Each viewpoint = eye position + look-at target (camper local coords, metres).
// yaw/pitch are derived from the target so orientation can never be sign-flipped by hand.
// Camper local: +x = right (kitchen/door side), -x = left (dinette side), -z = cab/front, +z = bed/rear.
const RAW = {
  lounge: { label: 'ソファ', pos: [-0.45, FLOOR + 1.12, -0.05], at: [-1.3, FLOOR + 1.18, -1.15], span: 3.2 },   // dinette window (left)
  driver: { label: '運転席', pos: [-0.55, FLOOR + 1.28, -3.25], at: [-0.3, FLOOR + 1.05, -8], span: 1.7 },   // windshield
  bed: { label: 'ベッド', pos: [0.15, FLOOR + 1.02, 2.75], at: [0.0, ROOFV + 1.0, 2.2], span: 3.2, lie: true }, // skylight 2
  kitchen: { label: 'キッチン', pos: [0.1, FLOOR + 1.6, -0.75], at: [1.4, FLOOR + 1.3, -0.5], span: 3.2 },    // kitchen window (right)
  rear: { label: '後部窓', pos: [0.1, FLOOR + 1.35, 2.2], at: [0.0, FLOOR + 1.2, 6], span: 3.2 },            // rear window
  alcove: { label: 'ロフト', pos: [0.2, 2.62, -3.3], at: [0.3, 2.35, 1.5], span: 3.2, lie: true },           // look down the van
  outside: { label: '外', pos: [7.5, 1.7, -7.5], at: [0, 1.4, -0.8], span: 9, out: true },
};
function dirToYawPitch(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  // camera forward at yaw=0,pitch=0 is -z. yaw>0 turns toward -x (three.js right-handed Y rotation).
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export const VIEWS = {};
for (const [k, r] of Object.entries(RAW)) {
  const { yaw, pitch } = dirToYawPitch(r.pos, r.at);
  VIEWS[k] = { ...r, yaw, pitch, limits: [-r.span, r.span] };
}

export const V = { cur: 'lounge', pos: new THREE.Vector3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, fov: 62, tfov: 62, trans: 1, from: new THREE.Vector3(), breath: 0, peek: 0 };

export function setView(k, instant = false) {
  if (!VIEWS[k]) return;
  const v = VIEWS[k];
  V.from.copy(V.pos); V.cur = k; V.trans = instant ? 1 : 0;
  V.tyaw = v.yaw; V.tpitch = v.pitch;
  if (instant) { V.pos.set(...v.pos); V.yaw = v.yaw; V.pitch = v.pitch; }
}

export function initView(canvas) {
  setView(P.get('view') || 'lounge', true);
  if (P.has('yaw')) { V.tyaw = V.yaw = parseFloat(P.get('yaw')); }
  if (P.has('pitch')) { V.tpitch = V.pitch = parseFloat(P.get('pitch')); }
  const ptrs = new Map(); let pinch0 = 0, fov0 = 62;
  canvas.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = V.tfov; } });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) {
      const k = 2.6 / window.innerHeight * (V.fov / 62);
      // drag-the-world: moving the finger right pulls the view left (yaw+), down pulls it up (pitch+)
      V.tyaw += (e.clientX - p.x) * k; V.tpitch += (e.clientY - p.y) * k;
    } else if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      V.tfov = clamp(fov0 * pinch0 / Math.max(d, 1), 22, 75);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = e => ptrs.delete(e.pointerId);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { V.tfov = clamp(V.tfov + e.deltaY * 0.03, 22, 75); }, { passive: true });
  // gentle device-tilt parallax (optional)
  window.addEventListener('deviceorientation', e => { if (e.gamma == null) return; V.tilt = clamp((e.gamma || 0) / 90, -0.3, 0.3); });
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
export function updateView(dt, camera) {
  const v = VIEWS[V.cur];
  G.viewKey = V.cur;
  const lim = v.limits;
  V.tyaw = clamp(V.tyaw, v.yaw + lim[0], v.yaw + lim[1]);
  V.tpitch = clamp(V.tpitch, -1.1, v.lie ? 1.35 : 1.0);
  V.yaw = damp(V.yaw, V.tyaw, 10, dt); V.pitch = damp(V.pitch, V.tpitch, 10, dt);
  V.fov = damp(V.fov, V.tfov, 8, dt);
  V.trans = Math.min(1, V.trans + dt * 1.1);
  const tt = V.trans * V.trans * (3 - 2 * V.trans);
  _p.set(...v.pos);
  V.pos.lerpVectors(V.from, _p, tt);
  // lift over furniture during glide
  const arc = Math.sin(tt * Math.PI) * 0.15;
  // breathing / idle sway, stronger when calm is low (anxious)
  V.breath += dt * (1.1 + (1 - G.state.calm / 100) * 1.4);
  const b = Math.sin(V.breath) * 0.006;
  // hiding: crouch
  const crouch = G.state.hiding && !v.lie ? -0.42 : 0;
  V.crouch = damp(V.crouch || 0, crouch, 4, dt);
  // shake
  G.shake = Math.max(0, G.shake - dt * 1.6);
  const s = G.shake * G.shake * 0.06;
  G.shakeV.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  _p.copy(V.pos); _p.y += b + arc + V.crouch; _p.add(G.shakeV);
  const cam = G.camper;
  camera.position.copy(cam.localToWorld(_p)); // _p is scratch, safe to mutate
  // outside view: keep a real eye height above whatever terrain is under the camera
  if (v.out) { const gy = heightAt(camera.position.x, camera.position.z) + 1.6; if (camera.position.y < gy) camera.position.y = gy; }
  // Euler YXZ: yaw about +Y (positive = turn left, three.js convention), then pitch about +X
  // (positive = look up). Camera looks down -z at yaw 0 = toward the cab.
  _e.set(V.pitch + Math.sin(V.breath * 0.5) * 0.004, V.yaw + (V.tilt || 0) * 0.3, (G.rockAngle || 0) * 0.5 + G.shakeV.x * 0.4);
  _q.setFromEuler(_e);
  camera.quaternion.copy(cam.quaternion).multiply(_q);
  camera.fov = V.fov; camera.updateProjectionMatrix();
  camera.getWorldDirection(G.lookDir);
}
