// Camera: follows the free-walking player (first person) inside the camper, or on foot outside.
// Right half of the screen = look (drag), pinch = zoom (peek out of windows), left half = joystick
// (ui.js). The legacy VIEWS table stays as named seat viewpoints (tests / QA staging / bear AI).
import { THREE, G, clamp, damp, P } from './core.js';
import { FLOOR, ROOF } from './camper.js';
import { heightAt } from './terrain.js';
import { PL, SPOTS_IN } from './player.js';

const RAW = {
  lounge: { label: 'ソファ', pos: [-0.45, FLOOR + 1.12, -0.05], at: [-1.3, FLOOR + 1.18, -1.15], span: 3.2 },
  driver: { label: '運転席', pos: [-0.55, FLOOR + 1.28, -3.25], at: [-0.3, FLOOR + 1.05, -8], span: 1.7 },
  bed: { label: 'ベッド', pos: [0.15, FLOOR + 1.02, 2.75], at: [0.0, ROOF + 1.0, 2.2], span: 3.2, lie: true },
  kitchen: { label: 'キッチン', pos: [0.1, FLOOR + 1.6, -0.75], at: [1.4, FLOOR + 1.3, -0.5], span: 3.2 },
  rear: { label: '後部窓', pos: [0.1, FLOOR + 1.35, 2.2], at: [0.0, FLOOR + 1.2, 6], span: 3.2 },
  alcove: { label: 'ロフト', pos: [0.2, 2.62, -3.3], at: [0.3, 2.35, 1.5], span: 3.2, lie: true },
  outside: { label: '外', pos: [7.5, 1.7, -7.5], at: [0, 1.4, -0.8], span: 9, out: true },
};
function dirToYawPitch(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export const VIEWS = {};
for (const [k, r] of Object.entries(RAW)) { const { yaw, pitch } = dirToYawPitch(r.pos, r.at); VIEWS[k] = { ...r, yaw, pitch, limits: [-r.span, r.span] }; }

export const V = { cur: 'walk', fov: 70, tfov: 70, breath: 0, cam: 'fp', chase: { yaw: 0, dist: 11 } };
// true heading of the van (Euler .y flips by ±π once the body has any pitch/roll near ±π yaw)
const _hf = new THREE.Vector3();
function camperHeading() { if (!G.camper) return 0; _hf.set(0, 0, -1).applyQuaternion(G.camper.quaternion); return Math.atan2(-_hf.x, -_hf.z); }
export function setView(k) { if (k === 'chase') { V.cam = V.cam === 'chase' ? 'fp' : 'chase'; V.chaseInit = false; V.chase.yaw = camperHeading(); } }

export function initView(canvas) {
  if (P.has('yaw')) PL.yaw = parseFloat(P.get('yaw'));
  if (P.has('pitch')) PL.pitch = parseFloat(P.get('pitch'));
  const look = new Map(); let pinch0 = 0, fov0 = 70, dist0 = 11;
  canvas.addEventListener('pointerdown', e => {
    // left 42% of the screen belongs to the joystick (ui.js)
    if (e.clientX < window.innerWidth * 0.42 && e.pointerType !== 'mouse') return;
    look.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId);
    if (look.size === 2) { const [a, b] = [...look.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = V.tfov; dist0 = V.chase.dist; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = look.get(e.pointerId); if (!p) return;
    if (look.size === 1) {
      const k = 2.8 / window.innerHeight * (V.fov / 70);
      if (V.cam === 'chase') { V.chase.touchT = G.t; V.chase.yaw -= (e.clientX - p.x) * k; V.chase.pitch = clamp((V.chase.pitch || 0.35) + (e.clientY - p.y) * k, 0.05, 1.2); }
      else { PL.yaw += (e.clientX - p.x) * k; PL.pitch += (e.clientY - p.y) * k; }
    } else if (look.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...look.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (V.cam === 'chase') V.chase.dist = clamp(dist0 * pinch0 / Math.max(d, 1), 6, 26);
      else V.tfov = clamp(fov0 * pinch0 / Math.max(d, 1), 24, 80);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = e => look.delete(e.pointerId);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('wheel', e => { if (V.cam === 'chase') V.chase.dist = clamp(V.chase.dist * (1 + e.deltaY * 0.001), 6, 26); else V.tfov = clamp(V.tfov + e.deltaY * 0.03, 24, 80); }, { passive: true });
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _t = new THREE.Vector3();
export function updateView(dt, camera) {
  const cam = G.camper;
  if (Math.hypot(PL.move.x, PL.move.y) > 0.3 && V.tfov < 70) V.tfov = damp(V.tfov, 70, 2, dt); // walking relaxes the zoom
  V.fov = damp(V.fov, V.tfov, 8, dt);
  V.breath += dt * (1.1 + (1 - G.state.calm / 100) * 1.4);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  const s = G.shake * G.shake * 0.06;
  G.shakeV.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  if (V.cam === 'chase') {
    // third-person drone camera orbiting the van (world-up, so falls/rolls read clearly)
    // while driving the drone swings back behind the van (3 s after the last manual orbit drag);
    // parked it stays where the player put it
    if (G.driving && G.t - (V.chase.touchT ?? -1e9) > 3 && Math.abs(G.driveSpeed || 0) > 1) {
      const d = Math.atan2(Math.sin(camperHeading() - V.chase.yaw), Math.cos(camperHeading() - V.chase.yaw));
      V.chase.yaw += d * (1 - Math.exp(-dt * 1.2));
    }
    const c = cam.position, pitch = V.chase.pitch ?? 0.35, yaw = V.chase.yaw;
    _t.set(c.x, c.y + 1.6, c.z);
    _p.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(V.chase.dist).add(_t);
    _p.y = Math.max(_p.y, heightAt(_p.x, _p.z) + 1.2);
    if (!V.chaseInit) { camera.position.copy(_p); V.chaseInit = true; }
    camera.position.lerp(_p, 1 - Math.exp(-dt * 6)); camera.position.add(G.shakeV);
    camera.lookAt(_t); camera.fov = 60; camera.updateProjectionMatrix();
    camera.getWorldDirection(G.lookDir); G.camInside = false;
    return;
  }
  const b = Math.sin(V.breath) * 0.006;
  _e.set(PL.pitch + Math.sin(V.breath * 0.5) * 0.004, PL.yaw, G.shakeV.x * 0.4);
  _q.setFromEuler(_e);
  if (PL.inside) {
    _p.copy(PL.pos); _p.y += b; _p.add(G.shakeV);
    camera.position.copy(cam.localToWorld(_p));
    camera.quaternion.copy(cam.quaternion).multiply(_q);
    G.camInside = true;
  } else {
    camera.position.copy(PL.world); camera.position.y += b; camera.position.add(G.shakeV);
    const gy = heightAt(camera.position.x, camera.position.z) + 0.4;
    if (camera.position.y < gy) camera.position.y = gy;
    camera.quaternion.copy(_q);
    G.camInside = false;
  }
  camera.fov = V.fov; camera.updateProjectionMatrix();
  camera.getWorldDirection(G.lookDir);
  V.cur = PL.inside ? (PL.seat ? PL.seat.id : 'walk') : 'outside';
}
export { SPOTS_IN };
