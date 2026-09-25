// First-person viewpoints inside the camper. Touch-drag (right side of screen) to look,
// pinch to zoom, tap viewpoint buttons to glide between seats; "peek" leans toward a window.
import { THREE, G, clamp, damp, lerp, P } from './core.js';
import { FLOOR } from './camper.js';

// local camper coords: eye position + default yaw (0 = looking toward -z/front), pitch
export const VIEWS = {
  lounge: { label: 'ソファ', pos: [-0.72, FLOOR + 1.12, 0.02], yaw: 0.45, pitch: -0.05, limits: [-3.2, 3.2] },
  driver: { label: '運転席', pos: [-0.55, FLOOR + 1.28, -3.25], yaw: 0, pitch: -0.02, limits: [-1.7, 1.7] },
  bed: { label: 'ベッド', pos: [0.15, FLOOR + 1.08, 2.7], yaw: 0.0, pitch: 0.55, limits: [-3.2, 3.2], lie: true },
  kitchen: { label: 'キッチン', pos: [0.15, FLOOR + 1.6, -0.9], yaw: -1.35, pitch: -0.2, limits: [-3.2, 3.2] },
  rear: { label: '後部窓', pos: [0.1, FLOOR + 1.35, 2.35], yaw: Math.PI, pitch: -0.05, limits: [-3.2, 3.2] },
  alcove: { label: 'ロフト', pos: [0.2, 2.62, -3.3], yaw: Math.PI * 0.95, pitch: -0.25, limits: [-3.2, 3.2], lie: true },
  outside: { label: '外', pos: [7.5, 1.7, -7.5], yaw: 0.75 + Math.PI, pitch: -0.08, limits: [-9, 9], out: true },
};

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
  if (v.out) { camera.position.copy(cam.localToWorld(_p.clone())); }
  else camera.position.copy(cam.localToWorld(_p));
  _e.set(V.pitch * -1 + Math.sin(V.breath * 0.5) * 0.004, V.yaw + Math.PI + (V.tilt || 0) * 0.3, (G.rockAngle || 0) * 0.5 + G.shakeV.x * 0.4);
  // camera looks toward -z at yaw 0; our convention yaw 0 = front (-z)
  _e.y = V.yaw;
  _q.setFromEuler(_e);
  camera.quaternion.copy(cam.quaternion).multiply(_q);
  camera.fov = V.fov; camera.updateProjectionMatrix();
  camera.getWorldDirection(G.lookDir);
}
