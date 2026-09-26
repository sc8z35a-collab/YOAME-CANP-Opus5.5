// Shared runtime context, event bus, math & noise helpers.
import * as THREE from './lib/three.module.js';
export { THREE };

export const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const QA = P.has('qa');

// Global game context (filled by main.js and modules)
export const G = {
  scene: null, camera: null, renderer: null,
  t: 0, dt: 0, frame: 0,
  hour: P.has('t') ? parseFloat(P.get('t')) : 19.2,
  day: 1,
  hoursPerSec: 1 / 40,          // 1 in-game hour = 40 real seconds
  timeMul: 1,
  wind: 0.3, rain: 0, cloud: 0.3, fog: 0.2, flash: 0, wet: 0, rainAccum: 0,
  daylight: 1, night: 0,
  waterLevel: -1.55,
  shake: 0, shakeV: new THREE.Vector3(),
  camper: null,                 // camper group (world transform of the vehicle)
  camperSpot: 'hollow',
  driving: false,
  // q: 'u' ultra (2K textures), 'h' high (1K textures, default), 'm' light (512px, cheaper FX).
  // Persisted choice from the in-game menu wins over the default; URL ?q= wins over both.
  quality: P.get('q') || (() => { try { return localStorage.getItem('fc3d_q'); } catch (e) { return null; } })() || 'h',
  state: {
    hull: 100, battery: 86, calm: 72,
    lightsOn: true, curtainsClosed: false, hiding: false, spotOn: false, headOn: false,
    cooking: 0, heater: false, generator: false, radio: false,
    smell: 0, noise: 0, over: false, nightsSurvived: 0, lastDawnDay: 0,
  },
  lookDir: new THREE.Vector3(0, 0, -1),
};

// ---------------------------------------------------------------- event bus
const handlers = {};
export const bus = {
  on(e, f) { (handlers[e] ||= []).push(f); },
  emit(e, ...a) { (handlers[e] || []).forEach(f => f(...a)); },
};

// ---------------------------------------------------------------- math
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

// Hour helpers
export const fmtTime = h => {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
export const isNight = () => G.hour < 5 || G.hour > 19.2;

// Shared shader uniforms (time / wind) so every wind-affected material stays in sync.
export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.3 },
  uRain: { value: 0 },
  uFlash: { value: 0 },
  uWet: { value: 0 },
};

// Camper local -> world helpers
const _v = new THREE.Vector3();
export function camperToWorld(x, y, z, out = new THREE.Vector3()) {
  out.set(x, y, z);
  return G.camper ? G.camper.localToWorld(out) : out;
}
export function worldToCamper(v, out = new THREE.Vector3()) {
  out.copy(v);
  return G.camper ? G.camper.worldToLocal(out) : out;
}
export { _v };
