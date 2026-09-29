// Body damage: dents and scratches on the camper's painted skin.
//  - dents     spheres of influence (camper-local centre, radius, depth, inward direction):
//              vertices are pushed in, and the shading normal follows the dent's slope plus a
//              crumple pattern, so even the flat extruded walls read as dented metal in the light
//  - scratches camper-local line segments (long drags along trunks / rock / ground grow them):
//              bundles of thin bright scores through the paint down to the aluminium, with a
//              dirty scuff halo
// Everything is driven by uniform arrays updated from physics contacts (vehicle.js 'dent'
// events + VEH.scrapes) and persisted in localStorage so the van keeps its history.
import { THREE, G, bus, clamp } from './core.js';

const ND = 32, NS = 48;
export const DMG = {
  dents: [], scratches: [],
  u: {
    uDent: { value: Array.from({ length: ND }, () => new THREE.Vector4()) },   // xyz centre, w radius
    uDentN: { value: Array.from({ length: ND }, () => new THREE.Vector4()) },  // xyz inward dir, w depth
    uNd: { value: 0 },
    uScrA: { value: Array.from({ length: NS }, () => new THREE.Vector4()) },   // xyz start, w width
    uScrB: { value: Array.from({ length: NS }, () => new THREE.Vector4()) },   // xyz end, w intensity
    uNs: { value: 0 },
    uCamRot: { value: new THREE.Matrix3() },   // camper-local -> world rotation
    uCamInv: { value: new THREE.Matrix4() },   // world -> camper-local
  },
  dirty: true,
};
const HB = { x: 1.2, y0: 0.5, y1: 2.95, z0: -5.35, z1: 3.3 };

// ---------------------------------------------------------------- adding damage
/** Snap a camper-local point to the skin (nearest face of the body box). */
function toSkin(p, n) {
  const q = p.clone();
  q.x = clamp(q.x, -HB.x, HB.x); q.y = clamp(q.y, HB.y0, HB.y1); q.z = clamp(q.z, HB.z0, HB.z1);
  const dx = HB.x - Math.abs(q.x), dyT = HB.y1 - q.y, dzF = q.z - HB.z0, dzB = HB.z1 - q.z;
  const m = Math.min(dx, dyT, dzF, dzB);
  if (m === dx) { q.x = Math.sign(q.x || n?.x || 1) * HB.x; } else if (m === dyT) q.y = HB.y1; else if (m === dzF) q.z = HB.z0; else q.z = HB.z1;
  return q;
}
function skinNormal(q) {
  if (Math.abs(Math.abs(q.x) - HB.x) < 1e-3) return new THREE.Vector3(-Math.sign(q.x), 0, 0);
  if (Math.abs(q.y - HB.y1) < 1e-3) return new THREE.Vector3(0, -1, 0);
  return new THREE.Vector3(0, 0, q.z < 0 ? 1 : -1);
}
/** sev 0..1.2 : size & depth grow with the impact severity. */
export function addDent(lp, ln, sev = 0.3, cause = '') {
  if (!lp) return;
  const c = toSkin(lp, ln), n = skinNormal(c);
  const r = clamp(0.12 + sev * 0.45, 0.12, 0.7) * (cause === 'tree' ? 1.5 : cause === 'bear' ? 0.8 : 1);
  const depth = clamp(0.01 + sev * 0.07, 0.01, 0.1) * (cause === 'tree' ? 1.4 : 1);
  // merge into an existing dent nearby (repeated hits deepen it)
  const ex = DMG.dents.find(d => d.c.distanceTo(c) < d.r * 0.7);
  if (ex) { ex.depth = Math.min(0.14, ex.depth + depth * 0.6); ex.r = Math.min(0.9, Math.max(ex.r, r)); }
  else { DMG.dents.push({ c, n, r, depth }); if (DMG.dents.length > ND) DMG.dents.shift(); }
  // the paint cracks & scores where it was hit
  const t = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0.3, 1, 0.2)).normalize();
  addScratch(c.clone().addScaledVector(t, -r * 0.8), c.clone().addScaledVector(t, r * 0.8), clamp(0.03 + sev * 0.05, 0.03, 0.09), clamp(0.5 + sev, 0.5, 1));
  DMG.dirty = true;
}
export function addScratch(a, b, w = 0.04, k = 0.8) {
  DMG.scratches.push({ a: toSkin(a), b: toSkin(b), w, k });
  if (DMG.scratches.length > NS) DMG.scratches.shift();
  DMG.dirty = true;
}
const _d = new THREE.Vector3();
/** A scrape sample from physics (body sliding against something): extend a running scratch or start one. */
function scrape(s) {
  const p = toSkin(s.lp), dir = _d.copy(s.dir); if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const w = clamp(0.02 + s.k / 4e5, 0.02, 0.1), k = clamp(0.4 + s.k / 1.5e5, 0.4, 1);
  const last = DMG.scratches[DMG.scratches.length - 1];
  if (last && last.live && last.b.distanceTo(p) < 0.6 && G.t - last.t < 0.6) {
    // body moves along -dir relative to the obstacle: the scratch trails behind the contact
    last.b.copy(p); last.w = Math.max(last.w, w); last.k = Math.max(last.k, k); last.t = G.t;
    if (last.a.distanceTo(last.b) > 3) last.live = false;
  } else {
    const a = toSkin(p.clone().addScaledVector(dir, 0.15));
    DMG.scratches.push({ a, b: p.clone(), w, k, live: true, t: G.t });
    if (DMG.scratches.length > NS) DMG.scratches.shift();
  }
  DMG.dirty = true;
}
bus.on('dent', e => addDent(e.lp, e.ln, e.sev, e.cause));

// ---------------------------------------------------------------- per frame
let saveT = 0;
export function updateDamage(dt, scrapes) {
  if (scrapes && scrapes.length) { for (const s of scrapes) scrape(s); scrapes.length = 0; }
  const cam = G.camper;
  if (cam) { DMG.u.uCamRot.value.setFromMatrix4(cam.matrixWorld); DMG.u.uCamInv.value.copy(cam.matrixWorld).invert(); }
  if (DMG.dirty) {
    DMG.dirty = false;
    DMG.dents.forEach((d, i) => { DMG.u.uDent.value[i].set(d.c.x, d.c.y, d.c.z, d.r); DMG.u.uDentN.value[i].set(d.n.x, d.n.y, d.n.z, d.depth); });
    DMG.u.uNd.value = DMG.dents.length;
    DMG.scratches.forEach((s, i) => { DMG.u.uScrA.value[i].set(s.a.x, s.a.y, s.a.z, s.w); DMG.u.uScrB.value[i].set(s.b.x, s.b.y, s.b.z, s.k); });
    DMG.u.uNs.value = DMG.scratches.length;
    saveT = 2;
  }
  if (saveT > 0 && (saveT -= dt) <= 0) save();
}
export function repairAll() { DMG.dents.length = 0; DMG.scratches.length = 0; DMG.dirty = true; }
function save() {
  try {
    const r = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    localStorage.setItem('fc3d_dmg', JSON.stringify({ d: DMG.dents.map(d => [r(d.c), r(d.n), d.r, d.depth]), s: DMG.scratches.map(s => [r(s.a), r(s.b), s.w, s.k]) }));
  } catch (e) {}
}
export function loadDamage() {
  try {
    const j = JSON.parse(localStorage.getItem('fc3d_dmg') || 'null'); if (!j) return;
    const V = a => new THREE.Vector3(...a);
    DMG.dents = j.d.map(([c, n, r, depth]) => ({ c: V(c), n: V(n), r, depth }));
    DMG.scratches = j.s.map(([a, b, w, k]) => ({ a: V(a), b: V(b), w, k }));
    DMG.dirty = true;
  } catch (e) {}
}

// ---------------------------------------------------------------- shader patch (paint material)
const GLSL_COMMON = /* glsl */`
  #define ND ${ND}
  #define NS ${NS}
  uniform vec4 uDent[ND]; uniform vec4 uDentN[ND]; uniform int uNd;
  uniform vec4 uScrA[NS]; uniform vec4 uScrB[NS]; uniform int uNs;
  uniform mat3 uCamRot; uniform mat4 uCamInv;
  varying vec3 vCP;
`;
/** dent displacement (camper-local vector) at camper-local point p */
const GLSL_DENT = /* glsl */`
  vec3 dentDisp(vec3 p) {
    vec3 d = vec3(0.);
    for (int i = 0; i < ND; i++) { if (i >= uNd) break;
      vec3 q = p - uDent[i].xyz; float r = uDent[i].w;
      float f = exp(-dot(q, q) / (r * r * 0.5));
      d += uDentN[i].xyz * uDentN[i].w * f; }
    return d;
  }
`;
export function patchPaint(sh) {
  Object.assign(sh.uniforms, DMG.u);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_DENT)
    .replace('#include <project_vertex>', `
      vec4 wpD = modelMatrix * vec4(transformed, 1.0);
      vCP = (uCamInv * wpD).xyz;
      vec3 dd = uCamRot * dentDisp(vCP);
      vec4 mvPosition = viewMatrix * (wpD + vec4(dd, 0.0));
      gl_Position = projectionMatrix * mvPosition;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + `
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float dn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x), mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x), f.y),
                   mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x), mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x), f.y), f.z); }
      float gScr, gScuff, gDent;
      vec3 gDentGrad;
      void damageEval(vec3 p) {
        gScr = 0.; gScuff = 0.; gDent = 0.; gDentGrad = vec3(0.);
        for (int i = 0; i < ND; i++) { if (i >= uNd) break;
          vec3 q = p - uDent[i].xyz; float r = uDent[i].w, k = r * r * 0.5;
          float f = exp(-dot(q, q) / k) * uDentN[i].w;
          gDent += f / max(r, 0.05);
          // slope of the dent (camper-local) + crumples that grow with the depth
          gDentGrad += (-2. * q / k) * f;
          gDentGrad += (vec3(dn(p*38.), dn(p*38.+7.), dn(p*38.+13.)) - .5) * f * 22.;
        }
        for (int i = 0; i < NS; i++) { if (i >= uNs) break;
          vec3 a = uScrA[i].xyz, b = uScrB[i].xyz, ab = b - a;
          float L = max(length(ab), 1e-3); vec3 t = ab / L;
          float s = clamp(dot(p - a, t), 0., L);
          vec3 off = p - (a + t * s); float d = length(off), w = uScrA[i].w;
          if (d > w * 2.5) continue;
          // many thin parallel scores across the width, broken up along the length
          float u = d / w;
          float lines = smoothstep(.55, .95, dn(vec3(u * 9., s * 1.5, float(i))) ) * step(u, 1.);
          float broken = smoothstep(.25, .6, dn(vec3(s * 6., u * 3., float(i) * 3.1)));
          float taper = smoothstep(0., .12, s) * smoothstep(0., .12, L - s);
          gScr = max(gScr, lines * broken * taper * uScrB[i].w);
          gScuff = max(gScuff, (1. - smoothstep(.6, 2.5, u)) * taper * .6 * uScrB[i].w);
        }
      }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      damageEval(vCP);
      // scuffs: dull, grimy paint; scores: bare aluminium under the paint
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.72,.68,.62), gScuff * .7);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78,.79,.8), gScr);
      diffuseColor.rgb *= 1. - clamp(gDent * 1.4, 0., .18);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .75, gScuff * .8);
      roughnessFactor = mix(roughnessFactor, .32, gScr);`)
    .replace('#include <clearcoat_normal_fragment_begin>', `
      // dent slope -> view space normal perturbation (tangential part only)
      vec3 gv = normalize(mat3(viewMatrix) * uCamRot * gDentGrad + vec3(1e-6)) * min(length(gDentGrad), 3.);
      normal = normalize(normal + (gv - normal * dot(gv, normal)) * .6);
      #include <clearcoat_normal_fragment_begin>
      clearcoatNormal = normalize(clearcoatNormal + (gv - clearcoatNormal * dot(gv, clearcoatNormal)) * .6);`)
    .replace('#include <clearcoat_fragment>', `#include <clearcoat_fragment>
      material.clearcoat *= 1. - max(gScr, gScuff * .6);`);
}
