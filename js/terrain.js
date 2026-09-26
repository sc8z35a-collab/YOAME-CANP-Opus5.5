// Terrain: relief + carved road beds + flattened destination pads, baked into ONE height grid.
// The render mesh vertices ARE the grid, and physics (groundAt) interpolates the same grid with
// the same triangle split, so wheels touch exactly the ground you see.
import { THREE, G, U, fbm, noise2, smooth, clamp, lerp } from './core.js';
import { tex } from './assets.js';
import { WORLD, rawHeight, creekX, CREEK_BED, WATER_BASE, HOLLOW } from './relief.js';
import { ROADS, DESTS, ROAD_HALF } from './roads.js';
export { creekX, CREEK_BED, WATER_BASE, WORLD };

// Legacy name kept for modules that talk about "spots" (destinations are the parking spots now).
export const SPOTS = DESTS;
export function spotHeight(k) { return DESTS[k] ? DESTS[k].h : 0; }

// ---------------------------------------------------------------- road spatial hash
const CELL = 10, NC = Math.ceil(WORLD.size / CELL) + 1;
const hash = new Map();
const key = (cx, cz) => cx * 4096 + cz;
for (const r of ROADS) r.s.forEach((p, i) => {
  if (i === r.s.length - 1) return;
  const q = r.s[i + 1];
  const x0 = Math.min(p.x, q.x) - 12, x1 = Math.max(p.x, q.x) + 12, z0 = Math.min(p.z, q.z) - 12, z1 = Math.max(p.z, q.z) + 12;
  for (let cx = Math.floor((x0 - WORLD.x0) / CELL); cx <= Math.floor((x1 - WORLD.x0) / CELL); cx++)
    for (let cz = Math.floor((z0 - WORLD.z0) / CELL); cz <= Math.floor((z1 - WORLD.z0) / CELL); cz++) {
      const k = key(cx, cz); (hash.get(k) || hash.set(k, []).get(k)).push(r, i);
    }
});
/** nearest road segment: writes into roadHit {d, h, bridge, fill, road, i, t} */
export const roadHit = { d: 1e9, h: 0, bridge: false, fill: 0, road: null, i: 0, t: 0, dirx: 0, dirz: 1 };
export function roadQuery(x, z) {
  roadHit.d = 1e9; roadHit.road = null;
  const list = hash.get(key(Math.floor((x - WORLD.x0) / CELL), Math.floor((z - WORLD.z0) / CELL)));
  if (!list) return roadHit;
  for (let k = 0; k < list.length; k += 2) {
    const r = list[k], i = list[k + 1], a = r.s[i], b = r.s[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / L2);
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < roadHit.d) {
      const L = Math.sqrt(L2);
      Object.assign(roadHit, { d, road: r, i, t, h: a.h + (b.h - a.h) * t, fill: a.fill + (b.fill - a.fill) * t, bridge: !!(a.bridge && b.bridge), dirx: abx / L, dirz: abz / L });
    }
  }
  return roadHit;
}
export function trackDist(x, z) { return roadQuery(x, z).d; }

// ---------------------------------------------------------------- composed analytic height
const DLIST = Object.values(DESTS);
function composeHeight(x, z) {
  let h = rawHeight(x, z);
  const r = roadQuery(x, z);
  if (r.road && !r.bridge) {
    // cut & fill embankment: shoulder width grows with the height difference (≈1:1.3 slope)
    const diff = Math.abs(r.fill);
    const shoulder = clamp(1.5 + diff * 1.3, 2, 9);
    const m = 1 - smooth(ROAD_HALF, ROAD_HALF + shoulder, r.d);
    h = lerp(h, r.h - 0.04, m);
  } else if (r.road && r.bridge && r.d < ROAD_HALF + 1) {
    // under a bridge the creek stays open; abutments are handled by the road ends
  }
  // parking pads (wide flat clearings at every destination)
  for (const d of DLIST) {
    const dd = Math.hypot(x - d.x, z - d.z);
    if (dd > 14) continue;
    const m = 1 - smooth(7, 14, dd);
    h = lerp(h, d.h - 0.04 + noise2(x * 0.3, z * 0.3) * 0.03, m);
  }
  return h;
}

// ---------------------------------------------------------------- height grid
export const GRID = { step: 1.5, n: Math.round(WORLD.size / 1.5) + 1, h: null };
function bakeGrid() {
  const { n, step } = GRID, h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = composeHeight(WORLD.x0 + i * step, WORLD.z0 + j * step);
  GRID.h = h;
}
bakeGrid();

/** Ground height of the rendered terrain (triangle-exact with the mesh). */
export function heightAt(x, z) {
  const { n, step, h } = GRID;
  let fx = (x - WORLD.x0) / step, fz = (z - WORLD.z0) / step;
  fx = clamp(fx, 0, n - 1.0001); fz = clamp(fz, 0, n - 1.0001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
  // PlaneGeometry splits each quad along (i,j+1)-(i+1,j): triangles (a,c,b) and (c,d,b)
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Bridges (decks are separate meshes; physics sees them via groundAt)
export const BRIDGES = [];
for (const r of ROADS) if (r.bridge) {
  const [a, b] = r.bridge; BRIDGES.push({ r, a: Math.max(0, a - 1), b: Math.min(r.s.length - 1, b + 1) });
}
for (const B of BRIDGES) { const s = B.r.s.slice(B.a, B.b + 1); B.box = [Math.min(...s.map(p => p.x)) - 4, Math.min(...s.map(p => p.z)) - 4, Math.max(...s.map(p => p.x)) + 4, Math.max(...s.map(p => p.z)) + 4]; }
function deckAt(x, z) {
  let inBox = false;
  for (const B of BRIDGES) if (x > B.box[0] && x < B.box[2] && z > B.box[1] && z < B.box[3]) inBox = true;
  if (!inBox) return -1e9;
  const q = roadQuery(x, z);
  if (!q.road || !q.bridge || q.d > ROAD_HALF - 0.4) return -1e9;
  return q.h + 0.18;
}
/** Ground for vehicles/people: terrain or bridge deck, whichever is higher (deck only near its top). */
export function groundAt(x, z, fromY = 1e9) {
  const t = heightAt(x, z), d = deckAt(x, z);
  return d > t && fromY > d - 1.2 ? d : t;
}
const _n = new THREE.Vector3();
export function normalAt(x, z, out = _n, fromY = 1e9) {
  const e = 0.5;
  const hx = groundAt(x + e, z, fromY) - groundAt(x - e, z, fromY), hz = groundAt(x, z + e, fromY) - groundAt(x, z - e, fromY);
  return out.set(-hx, 2 * e, -hz).normalize();
}
export function slopeAt(x, z) {
  const e = 0.75;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}
export function isInWorld(x, z, m = 0) { return x > WORLD.x0 + m && x < WORLD.x1 - m && z > WORLD.z0 + m && z < WORLD.z1 - m; }

// ---------------------------------------------------------------- mesh
export function buildTerrain(scene) {
  const { n, step } = GRID, seg = n - 1;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.x0 + WORLD.size / 2, 0, WORLD.z0 + WORLD.size / 2);
  const pos = geo.attributes.position;
  const splat = new Float32Array(pos.count * 4), splat2 = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // PlaneGeometry rows go from +z(top) to -z after rotateX(-90): map to grid indices explicitly
    const gi = Math.round((x - WORLD.x0) / step), gj = Math.round((z - WORLD.z0) / step);
    pos.setY(i, GRID.h[gj * n + gi]);
    const cd = Math.abs(x - creekX(z));
    const r = roadQuery(x, z);
    const road = r.road && !r.bridge ? 1 - smooth(ROAD_HALF - 0.6, ROAD_HALF + 0.9, r.d) : 0;
    const mud = Math.max(1 - smooth(1.5, 6.5, cd), (r.road ? (1 - smooth(ROAD_HALF, ROAD_HALF + 2.5, r.d)) * 0.5 : 0));
    const leaves = clamp(0.5 + fbm(x * 0.05, z * 0.05, 3) * 1.2);
    const s = slopeAt(x, z);
    const rock = smooth(0.75, 1.15, s) * (1 - mud) * (1 - road);
    let grass = 0;
    for (const d of DLIST) grass = Math.max(grass, 1 - smooth(5, 16, Math.hypot(x - d.x, z - d.z)));
    grass *= (1 - mud) * clamp(0.6 + noise2(x * 0.15, z * 0.15)) * (1 - road);
    splat[i * 4] = leaves; splat[i * 4 + 1] = mud; splat[i * 4 + 2] = rock; splat[i * 4 + 3] = grass;
    splat2[i] = road;
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.setAttribute('splat2', new THREE.BufferAttribute(splat2, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const R = 80; // uv repeat over terrain (≈6m per tile)
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
    tRoad: { value: tex('rocky_trail_diffuse', { srgb: true, repeat: R }) },
    tRoadN: { value: tex('rocky_trail_nor_gl', { repeat: R }) },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, extra, { uWet: U.uWet });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; attribute float splat2; varying vec4 vSplat; varying float vRoad; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vRoad = splat2; vWPos = (modelMatrix*vec4(position,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tLeaves, tLeavesN, tMud, tMudN, tRock, tRockN, tGrass, tRoad, tRoadN; uniform float uWet;
        varying vec4 vSplat; varying float vRoad; varying vec3 vWPos;
        float hn(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hn(i),hn(i+vec2(1,0)),f.x), mix(hn(i+vec2(0,1)),hn(i+vec2(1,1)),f.x), f.y); }
        vec4 bw; float gPuddle, gRoad;`)
      .replace('#include <map_fragment>', `
        vec2 uvA = vMapUv; vec2 uvB = vMapUv*0.37 + vec2(0.31,0.17);
        float br = vn(vWPos.xz*0.08)*0.6 + vn(vWPos.xz*0.5)*0.4;
        vec3 cG = mix(texture2D(map, uvA).rgb, texture2D(map, uvB).rgb, 0.35);
        vec3 cL = texture2D(tLeaves, uvA*0.8).rgb;
        vec3 cM = texture2D(tMud, uvA).rgb;
        vec3 cR = texture2D(tRock, uvA*0.5).rgb;
        vec3 cGr = texture2D(tGrass, uvA*1.3).rgb;
        vec3 cRd = texture2D(tRoad, uvA*1.6).rgb;
        float wl = smoothstep(0.15, 0.55, vSplat.x + (br-0.5)*0.7);
        float wm = smoothstep(0.2, 0.6, vSplat.y + (br-0.5)*0.4);
        float wr = smoothstep(0.3, 0.7, vSplat.z + (br-0.5)*0.5);
        float wg = smoothstep(0.25, 0.7, vSplat.w + (br-0.5)*0.6);
        gRoad = smoothstep(0.2, 0.75, vRoad + (br-0.5)*0.35);
        vec3 col = mix(cG*vec3(0.78,0.74,0.66), cL*0.92, wl);
        col = mix(col, cGr*vec3(0.95,1.05,0.8), wg*0.9);
        col = mix(col, cR, wr);
        col = mix(col, cM, wm);
        col = mix(col, cRd*vec3(0.92,0.86,0.78), gRoad);
        bw = vec4(wl, wm, wr, wg);
        gPuddle = smoothstep(0.55, 0.8, vn(vWPos.xz*0.35) * (0.5+wm+gRoad*0.4)) * uWet;
        col *= mix(1.0, 0.55, uWet*0.8);
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
        vec3 nRd = texture2D(tRoadN, vNormalMapUv*1.6).xyz;
        vec3 mapN = mix(mix(mix(mix(nA, nL, bw.x), nR, bw.z), nM, bw.y), nRd, gRoad) * 2.0 - 1.0;
        mapN.xy *= normalScale * (1.0 - gPuddle*0.9);
        normal = normalize( tbn * mapN );`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  buildBridges(scene);
  return mesh;
}

// ---------------------------------------------------------------- bridges (timber decks)
function buildBridges(scene) {
  const plank = new THREE.MeshStandardMaterial({ map: tex('oak_veneer_01_diffuse', { srgb: true, repeat: 1 }), color: 0x8a6a4a, roughness: 0.85 });
  const beam = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.9 });
  for (const B of BRIDGES) {
    const g = new THREE.Group();
    for (let i = B.a; i < B.b; i++) {
      const p = B.r.s[i], q = B.r.s[i + 1];
      const L = Math.hypot(q.x - p.x, q.z - p.z), yaw = Math.atan2(q.x - p.x, q.z - p.z);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 - 0.6, 0.18, L + 0.05), plank);
      deck.position.set((p.x + q.x) / 2, (p.h + q.h) / 2 + 0.09, (p.z + q.z) / 2); deck.rotation.y = yaw;
      deck.castShadow = deck.receiveShadow = true; g.add(deck);
      for (const s of [-1, 1]) { // side rails
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, L + 0.05), beam);
        rail.position.copy(deck.position).add(new THREE.Vector3(Math.cos(yaw) * s * (ROAD_HALF - 0.35), 0.75, -Math.sin(yaw) * s * (ROAD_HALF - 0.35)));
        rail.rotation.y = yaw; rail.castShadow = true; g.add(rail);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), beam);
        post.position.copy(rail.position); post.position.y -= 0.38; g.add(post);
      }
      const pier = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 - 0.8, 1, 0.3), beam);
      const gy = heightAt(p.x, p.z), top = p.h;
      pier.scale.y = Math.max(0.1, top - gy + 0.4); pier.position.set(p.x, (top + gy) / 2 - 0.1, p.z); pier.rotation.y = yaw;
      g.add(pier);
    }
    scene.add(g);
  }
}
