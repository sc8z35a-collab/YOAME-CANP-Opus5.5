// Terrain height function, parking spots, and terrain mesh with splat-blended PBR ground.
import { THREE, G, U, fbm, noise2, smooth, clamp, lerp } from './core.js';
import { tex } from './assets.js';

// Parking spots. hollow = 沢沿いの窪地 (flood risk), ridge = 林道の高台 (landslide risk)
export const SPOTS = {
  hollow: { x: 0, z: 0, rot: 0.0, name: '沢沿いの窪地' },
  ridge: { x: 58, z: -40, rot: 0.55, name: '林道脇の高台' },
};
export const CREEK_BED = -2.45;
export const WATER_BASE = -1.55;

export function creekX(z) { return -14 + 6 * Math.sin(z * 0.028) + 3 * Math.sin(z * 0.071 + 1.3); }

// Dirt forest road from hollow to ridge: a switchback polyline with its own smooth road-bed
// profile (cut & fill), so the grade stays drivable regardless of the raw noise terrain.
export const TRACK = [];
{
  // two hairpin switchbacks climbing the east slope, then a traverse to the ridge pad
  const ctrl = [[0, -7], [2, -18], [8, -34], [18, -44], [34, -40], [44, -26], [40, -12], [50, -6], [62, -12], [64, -26], [58, -40]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  for (const p of curve.getSpacedPoints(110)) TRACK.push(new THREE.Vector2(p.x, p.z));
}
const TRACK_S = [0];       // cumulative arc length per vertex
for (let i = 1; i < TRACK.length; i++) TRACK_S.push(TRACK_S[i - 1] + TRACK[i].distanceTo(TRACK[i - 1]));
const TRACK_LEN = TRACK_S[TRACK_S.length - 1];
let TRACK_H = null;        // road-bed height per vertex (filled after pads are known)

const _p = new THREE.Vector2();
/** distance to road centreline; also writes arc position into trackHit.s */
export const trackHit = { s: 0, i: 0 };
let TB = null; // road bounding box for a cheap early-out (heightAt is hot)
export function trackDist(x, z) {
  if (!TB) { TB = [1e9, 1e9, -1e9, -1e9]; for (const p of TRACK) { TB[0] = Math.min(TB[0], p.x); TB[1] = Math.min(TB[1], p.y); TB[2] = Math.max(TB[2], p.x); TB[3] = Math.max(TB[3], p.y); } }
  const ox = Math.max(TB[0] - x, 0, x - TB[2]), oz = Math.max(TB[1] - z, 0, z - TB[3]);
  if (ox > 12 || oz > 12) return Math.hypot(ox, oz);
  let d = 1e9; _p.set(x, z);
  for (let i = 0; i < TRACK.length - 1; i++) {
    const a = TRACK[i], b = TRACK[i + 1];
    const abx = b.x - a.x, abz = b.y - a.y;
    const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz));
    const dx = x - (a.x + abx * t), dz = z - (a.y + abz * t);
    const dd = Math.hypot(dx, dz);
    if (dd < d) { d = dd; trackHit.s = TRACK_S[i] + (TRACK_S[i + 1] - TRACK_S[i]) * t; trackHit.i = i; }
  }
  return d;
}
function roadBed(s) {
  const n = TRACK_S.length - 1;
  let i = 0; while (i < n - 1 && TRACK_S[i + 1] < s) i++;
  const t = clamp((s - TRACK_S[i]) / (TRACK_S[i + 1] - TRACK_S[i]));
  return lerp(TRACK_H[i], TRACK_H[i + 1], t);
}
export function trackLength() { return TRACK_LEN; }

function rawHeight(x, z) {
  const dH = Math.hypot(x - SPOTS.hollow.x, z - SPOTS.hollow.z);
  const amp = smooth(10, 60, dH);
  let h = fbm(x * 0.011 + 3.1, z * 0.011 - 7.7, 5) * (2 + 7 * amp) + fbm(x * 0.06, z * 0.06, 3) * 0.6;
  // valley: slopes up to the east (+x) steeply, gently to the west beyond the creek
  const east = Math.max(0, x - 9);
  h += east * 0.5 + Math.pow(east, 1.35) * 0.02;
  h += Math.max(0, -x - 24) * 0.35;
  // avoid random ponds away from the creek (keeps flood water readable)
  h = Math.max(h, -0.9 + noise2(x * 0.05, z * 0.05) * 0.3);
  // creek channel
  const cd = Math.abs(x - creekX(z));
  const bank = 1 - smooth(2.2, 7.5, cd);
  h = lerp(h, CREEK_BED + fbm(x * 0.2, z * 0.2, 2) * 0.25, bank);
  return h;
}

// Pad heights (computed once)
const padH = {};
for (const k in SPOTS) padH[k] = k === 'hollow' ? 0 : rawHeight(SPOTS[k].x, SPOTS[k].z) - 1.5;
{ // ridge: park facing along the road's final direction (front = local -z)
  const n = TRACK.length, a = TRACK[n - 6], b = TRACK[n - 1];
  SPOTS.ridge.rot = Math.atan2(-(b.x - a.x), -(b.y - a.y));
  SPOTS.ridge.x = b.x; SPOTS.ridge.z = b.y;
}
export function spotHeight(k) { return padH[k]; }

function padBlend(x, z, h) {
  for (const k in SPOTS) {
    const s = SPOTS[k];
    const d = Math.hypot(x - s.x, z - s.z);
    const m = 1 - smooth(9, k === 'hollow' ? 22 : 16, d);
    h = lerp(h, padH[k] + noise2(x * 0.3, z * 0.3) * 0.05, m);
  }
  return h;
}

// Road-bed profile: sample terrain along the road, then heavily smooth it and pin both ends
// to the parking pads. Result is a gentle monotone-ish climb (cut into slopes / filled over dips).
{
  const n = TRACK.length;
  let h = TRACK.map(p => padBlend(p.x, p.y, rawHeight(p.x, p.y)));
  h[0] = padH.hollow; h[n - 1] = padH.ridge;
  for (let it = 0; it < 400; it++) {
    const nh = h.slice();
    for (let i = 1; i < n - 1; i++) nh[i] = (h[i - 1] + h[i] * 2 + h[i + 1]) / 4;
    nh[0] = padH.hollow; nh[n - 1] = padH.ridge; h = nh;
  }
  // blend toward a pure linear ramp so no segment exceeds the drivable grade
  const lin = TRACK_S.map(s => lerp(padH.hollow, padH.ridge, s / TRACK_LEN));
  TRACK_H = h.map((v, i) => lerp(v, lin[i], 0.85));
}

export function heightAt(x, z) {
  let h = padBlend(x, z, rawHeight(x, z));
  // road: flat 4.4m bed with 3m shoulders (cut & fill embankment)
  const td = trackDist(x, z);
  if (td < 8) {
    const bed = roadBed(trackHit.s) - 0.05;
    // fade the road into pads at both ends
    const endFade = smooth(0, 6, trackHit.s) * smooth(0, 6, TRACK_LEN - trackHit.s);
    const m = (1 - smooth(2.2, 7.5, td)) * (0.35 + 0.65 * endFade);
    h = lerp(h, bed, m);
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 0.6;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

// ---------------------------------------------------------------- mesh
export function buildTerrain(scene) {
  const hi = G.quality !== 'm';
  const SIZE = 420, SEG = hi ? 300 : 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(20, 0, -10);
  const pos = geo.attributes.position;
  const splat = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const cd = Math.abs(x - creekX(z));
    const mud = Math.max(1 - smooth(1.5, 6.5, cd), (1 - smooth(1.2, 3.2, trackDist(x, z))) * 0.9);
    const leaves = clamp(0.5 + fbm(x * 0.05, z * 0.05, 3) * 1.2);
    const s = slopeAt(x, z);
    const rock = smooth(0.75, 1.15, s) * (1 - mud);
    // grass near clearings
    let grass = 0;
    for (const k in SPOTS) grass = Math.max(grass, 1 - smooth(6, 20, Math.hypot(x - SPOTS[k].x, z - SPOTS[k].z)));
    grass *= (1 - mud) * clamp(0.6 + noise2(x * 0.15, z * 0.15));
    splat[i * 4] = leaves; splat[i * 4 + 1] = mud; splat[i * 4 + 2] = rock; splat[i * 4 + 3] = grass;
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.computeVertexNormals();

  const R = 70; // uv repeat over terrain (≈6m per tile)
  const mat = new THREE.MeshStandardMaterial({
    map: tex('forest_ground_04_diffuse', { srgb: true, repeat: R }),
    normalMap: tex('forest_ground_04_nor_gl', { repeat: R }),
    roughnessMap: tex('forest_ground_04_arm', { repeat: R }),
    aoMap: tex('forest_ground_04_arm', { repeat: R }),
    roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3),
  });
  const extra = {
    tLeaves: { value: tex('leaves_forest_ground_diffuse', { srgb: true, repeat: R }) },
    tLeavesN: { value: tex('leaves_forest_ground_nor_gl', { repeat: R }) },
    tMud: { value: tex('mud_forest_diffuse', { srgb: true, repeat: R }) },
    tMudN: { value: tex('mud_forest_nor_gl', { repeat: R }) },
    tRock: { value: tex('rock_face_diffuse', { srgb: true, repeat: R }) },
    tRockN: { value: tex('rock_face_nor_gl', { repeat: R }) },
    tGrass: { value: tex('sparse_grass_diffuse', { srgb: true, repeat: R }) },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, extra, { uWet: U.uWet });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWPos = (modelMatrix*vec4(position,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tLeaves, tLeavesN, tMud, tMudN, tRock, tRockN, tGrass; uniform float uWet;
        varying vec4 vSplat; varying vec3 vWPos;
        float hn(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hn(i),hn(i+vec2(1,0)),f.x), mix(hn(i+vec2(0,1)),hn(i+vec2(1,1)),f.x), f.y); }
        vec4 bw; float gPuddle;`)
      .replace('#include <map_fragment>', `
        vec2 uvA = vMapUv; vec2 uvB = vMapUv*0.37 + vec2(0.31,0.17);
        float br = vn(vWPos.xz*0.08)*0.6 + vn(vWPos.xz*0.5)*0.4;
        vec3 cG = mix(texture2D(map, uvA).rgb, texture2D(map, uvB).rgb, 0.35);
        vec3 cL = texture2D(tLeaves, uvA*0.8).rgb;
        vec3 cM = texture2D(tMud, uvA).rgb;
        vec3 cR = texture2D(tRock, uvA*0.5).rgb;
        vec3 cGr = texture2D(tGrass, uvA*1.3).rgb;
        float wl = smoothstep(0.15, 0.55, vSplat.x + (br-0.5)*0.7);
        float wm = smoothstep(0.2, 0.6, vSplat.y + (br-0.5)*0.4);
        float wr = smoothstep(0.3, 0.7, vSplat.z + (br-0.5)*0.5);
        float wg = smoothstep(0.25, 0.7, vSplat.w + (br-0.5)*0.6);
        vec3 col = mix(cG*vec3(0.62,0.58,0.5), cL*0.85, wl);
        col = mix(col, cGr*vec3(0.95,1.05,0.8), wg*0.9);
        col = mix(col, cR, wr);
        col = mix(col, cM, wm);
        bw = vec4(wl, wm, wr, wg);
        // wetness darkens, puddles in mud & low spots
        gPuddle = smoothstep(0.55, 0.8, vn(vWPos.xz*0.35) * (0.5+wm)) * uWet;
        col *= mix(1.0, 0.55, uWet*0.8) ;
        col = mix(col, col*0.35, gPuddle);
        diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
        roughnessFactor *= mix(texelRoughness.g, 0.9, bw.y*0.3);
        roughnessFactor = mix(roughnessFactor, 0.35, uWet*0.55);
        roughnessFactor = mix(roughnessFactor, 0.04, gPuddle);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = texture2D(normalMap, vNormalMapUv).xyz;
        vec3 nL = texture2D(tLeavesN, vNormalMapUv*0.8).xyz;
        vec3 nM = texture2D(tMudN, vNormalMapUv).xyz;
        vec3 nR = texture2D(tRockN, vNormalMapUv*0.5).xyz;
        vec3 mapN = mix(mix(mix(nA, nL, bw.x), nR, bw.z), nM, bw.y) * 2.0 - 1.0;
        mapN.xy *= normalScale * (1.0 - gPuddle*0.9);
        normal = normalize( tbn * mapN );`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}
