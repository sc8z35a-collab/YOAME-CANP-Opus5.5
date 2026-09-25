// Forest: instanced procedural conifers (cedar/fir) with twig-atlas cards + wind,
// instanced photo-scanned understory, rocks, deadwood and camp props.
import { THREE, G, U, rng, clamp, smooth, fbm } from './core.js';
import { tex, pbr, glbParts, glb } from './assets.js';
import { heightAt, slopeAt, creekX, trackDist, SPOTS } from './terrain.js';
import * as BGU from './lib/addons/BufferGeometryUtils.js';

// twig atlas regions (u0, vTop0, u1, vTop1) measured from alpha map (image-space y from top)
const TWIGS = [[0.184, 0.041, 0.435, 0.317], [0.646, 0.034, 0.943, 0.375], [0.3, 0.394, 0.65, 0.781], [0.629, 0.446, 0.963, 0.806]];

export const colliders = []; // {x,z,r} for animals / events
export const treeList = [];   // {x,z,h,s}

function windify(mat, { strength = 1, card = false } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = dot(ip, vec3(0.13, 0., 0.17));
          float hgt = max(position.y, 0.);
          float w = uWind * ${strength.toFixed(2)};
          float sway = (sin(uTime*0.9 + ph) * 0.6 + sin(uTime*2.1 + ph*1.7) * 0.25) * w;
          transformed.x += sway * hgt * hgt * 0.004;
          transformed.z += sway * hgt * hgt * 0.0025;
          ${card ? 'transformed.y += sin(uTime*6.0 + ph + position.x*3.0 + position.z*2.0) * 0.02 * w * hgt*0.1;' : ''}
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, uWet*0.6);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.7, uWet);');
  };
  return mat;
}

function cardGeo(w, h, reg) {
  // quad anchored at its base (x from 0..w along branch), uv mapped to atlas region
  const g = new THREE.PlaneGeometry(w, h, 2, 1);
  g.translate(w / 2, 0, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    // twig atlas: stems point down in image; map branch base (u=0) to twig base (image bottom)
    uv.setXY(i, reg[0] + (reg[2] - reg[0]) * v, (1 - reg[3]) + (reg[3] - reg[1]) * u);
  }
  // droop: bend outer vertices downward
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - (x / w) * (x / w) * w * 0.18); }
  g.computeVertexNormals();
  return g;
}

function buildTreeTemplate(seed, kind) {
  const R = rng(seed);
  const H = kind === 'cedar' ? 22 : 18;
  // trunk
  const trunk = new THREE.CylinderGeometry(0.1, kind === 'cedar' ? 0.42 : 0.35, H, 10, 8, true);
  trunk.translate(0, H / 2, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const flare = Math.max(0, 1 - y / 1.4);
    const f = 1 + flare * flare * 0.9;
    tp.setX(i, tp.getX(i) * f); tp.setZ(i, tp.getZ(i) * f);
  }
  const tuv = trunk.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 2, tuv.getY(i) * H / 3);
  trunk.computeVertexNormals();

  // branch cards
  const cards = [];
  const start = kind === 'cedar' ? H * 0.38 : H * 0.22;
  const whorls = kind === 'cedar' ? 20 : 22;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = start + (H - start - 0.3) * t;
    const len = (kind === 'cedar' ? 3.0 : 3.6) * Math.pow(1 - t, 0.9) + 0.6;
    const n = Math.round(5 + (1 - t) * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.6 + w * 0.7;
      const reg = TWIGS[Math.floor(R() * TWIGS.length)];
      const g = cardGeo(len * (0.8 + R() * 0.4), len * (0.55 + R() * 0.2), reg);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 0.6 - 0.3 + Math.PI / 2 * (R() < 0.5 ? 0.25 : -0.25), a, -(0.12 + R() * 0.25), 'YXZ'));
      m.compose(new THREE.Vector3(0, y + R() * 0.4, 0), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      cards.push(g);
    }
    // vertical crossed card cluster for density
    if (w % 2 === 0) {
      const reg = TWIGS[2];
      for (let k = 0; k < 2; k++) {
        const g = cardGeo(len * 1.6, len * 0.9, reg);
        g.translate(-len * 0.8, 0, 0);
        g.rotateZ(Math.PI / 2 * 0.0);
        const m = new THREE.Matrix4().makeRotationY(k * Math.PI / 2 + w);
        m.setPosition(0, y, 0);
        g.applyMatrix4(m);
        cards.push(g);
      }
    }
  }
  // top spike
  const top = cardGeo(1.8, 0.9, TWIGS[0]); top.rotateZ(Math.PI / 2); top.translate(0, H - 0.6, 0);
  cards.push(top);
  const top2 = top.clone(); top2.rotateY(Math.PI / 2); cards.push(top2);
  const merged = BGU.mergeGeometries(cards.map(c => c.toNonIndexed()));
  // per-vertex color variation (inner darker = AO)
  const p = merged.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const ao = clamp(0.35 + r * 0.22, 0.35, 1.0) * (0.75 + 0.25 * p.getY(i) / H);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { trunk, cards: merged, H };
}

function place(n, seed, test, minD = 0) {
  const R = rng(seed), out = [];
  let tries = 0;
  while (out.length < n && tries < n * 30) {
    tries++;
    const x = -150 + R() * 340, z = -190 + R() * 330;
    if (!test(x, z, R)) continue;
    if (minD && out.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < minD * minD)) continue;
    out.push({ x, z, r: R(), y: heightAt(x, z) });
  }
  return out;
}

function clearOf(x, z, spotR = 11, trackR = 4, creekR = 4.5) {
  for (const k in SPOTS) if (Math.hypot(x - SPOTS[k].x, z - SPOTS[k].z) < spotR) return false;
  if (trackDist(x, z) < trackR) return false;
  if (Math.abs(x - creekX(z)) < creekR) return false;
  return true;
}

export async function buildForest(scene) {
  const hi = G.quality !== 'm';
  const barkC = pbr('japanese_cedar_bark', { repeat: 1, normalScale: 1.5 });
  const barkF = pbr('pine_bark', { repeat: 1, normalScale: 1.5 });
  windify(barkC, { strength: 0.6 }); windify(barkF, { strength: 0.6 });
  const needleMat = new THREE.MeshStandardMaterial({
    map: tex('fir_twig_diff', { srgb: true }), alphaMap: tex('fir_twig_alpha'),
    normalMap: tex('fir_twig_nor_gl'), alphaTest: 0.45, side: THREE.DoubleSide,
    roughness: 0.85, vertexColors: true, color: new THREE.Color(0.78, 0.86, 0.72),
  });
  windify(needleMat, { strength: 1, card: true });

  const templates = [buildTreeTemplate(11, 'cedar'), buildTreeTemplate(23, 'fir'), buildTreeTemplate(37, 'cedar')];
  const pts = place(hi ? 950 : 650, 5, (x, z, R) => {
    if (!clearOf(x, z)) return false;
    const d = Math.hypot(x, z);
    const dens = 0.55 + fbm(x * 0.02, z * 0.02, 3) * 0.8;
    return R() < dens * (d < 30 ? 1.2 : 1);
  }, 3.2);
  // hand placed "close" trees framing the camper windows
  const framing = [[-7, -12], [9, -13], [12, 6], [-9, 10], [3, 15], [-12, -2], [13, -3], [-3, -16]];
  for (const [x, z] of framing) pts.push({ x, z, r: Math.random(), y: heightAt(x, z) });

  const perT = templates.map(() => []);
  pts.forEach((p, i) => perT[i % templates.length].push(p));
  const dummy = new THREE.Object3D();
  templates.forEach((T, ti) => {
    const list = perT[ti];
    const trunkM = new THREE.InstancedMesh(T.trunk, ti === 1 ? barkF : barkC, list.length);
    const cardM = new THREE.InstancedMesh(T.cards, needleMat, list.length);
    const c = new THREE.Color();
    list.forEach((p, i) => {
      const s = 0.7 + p.r * 0.65;
      dummy.position.set(p.x, p.y - 0.15, p.z);
      dummy.rotation.set((p.r - 0.5) * 0.04, p.r * 20, (p.r - 0.5) * 0.04);
      dummy.scale.set(s, s * (0.9 + p.r * 0.25), s);
      dummy.updateMatrix();
      trunkM.setMatrixAt(i, dummy.matrix); cardM.setMatrixAt(i, dummy.matrix);
      c.setHSL(0.24 + (p.r - 0.5) * 0.05, 0.3 + p.r * 0.15, 0.5 + (p.r - 0.5) * 0.2);
      cardM.setColorAt(i, c);
      colliders.push({ x: p.x, z: p.z, r: 0.6 * s });
      treeList.push({ x: p.x, z: p.z, h: T.H * s, s });
    });
    for (const m of [trunkM, cardM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }
  });

  await buildUnderstory(scene, hi);
  await buildProps(scene);
}

async function instanceGLB(scene, name, pts, { scale = [0.8, 1.3], shadow = true, wind = 0, yOff = 0, tilt = 0.1, colliderR = 0 } = {}) {
  const parts = await glbParts(name);
  const dummy = new THREE.Object3D();
  for (const part of parts) {
    const mat = part.mat.clone();
    if (wind) windify(mat, { strength: wind });
    if (mat.map) mat.map.anisotropy = 8;
    const im = new THREE.InstancedMesh(part.geo, mat, pts.length);
    pts.forEach((p, i) => {
      const s = scale[0] + (scale[1] - scale[0]) * p.r;
      dummy.position.set(p.x, p.y + yOff, p.z);
      dummy.rotation.set((p.r - 0.5) * tilt, p.r * 31, (p.r * 7 % 1 - 0.5) * tilt);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  }
  if (colliderR) pts.forEach(p => colliders.push({ x: p.x, z: p.z, r: colliderR }));
}

async function buildUnderstory(scene, hi) {
  const k = hi ? 1 : 0.6;
  const shady = (x, z) => clearOf(x, z, 7.5, 2.6, 3.5);
  const ferns = place(Math.round(900 * k), 71, (x, z, R) => shady(x, z) && slopeAt(x, z) < 0.8 && R() < 0.5 + fbm(x * 0.04, z * 0.04) * 0.9);
  // dense ferns near the camper clearing edge (seen from windows)
  const ring = place(Math.round(260 * k), 72, (x, z) => { const d = Math.hypot(x, z); return d > 7.5 && d < 20 && shady(x, z); });
  await instanceGLB(scene, 'fern_02', ferns.concat(ring), { scale: [0.9, 1.7], wind: 1.2, shadow: hi });
  const shrubs = place(Math.round(420 * k), 73, (x, z, R) => shady(x, z) && R() < 0.6);
  await instanceGLB(scene, 'shrub_03', shrubs.filter((_, i) => i % 2 === 0), { scale: [1.0, 2.0], wind: 1.2, shadow: hi });
  await instanceGLB(scene, 'shrub_04', shrubs.filter((_, i) => i % 2 === 1), { scale: [1.2, 2.4], wind: 1.2, shadow: hi });
  const weeds = place(Math.round(900 * k), 74, (x, z) => {
    for (const s in SPOTS) { const d = Math.hypot(x - SPOTS[s].x, z - SPOTS[s].z); if (d > 5 && d < 15) return true; }
    const cd = Math.abs(x - creekX(z)); return cd > 3 && cd < 7;
  });
  await instanceGLB(scene, 'weed_plant_02', weeds.filter((_, i) => i % 2), { scale: [0.8, 1.4], wind: 1.6, shadow: false });
  await instanceGLB(scene, 'nettle_plant', weeds.filter((_, i) => !(i % 2)), { scale: [0.9, 1.5], wind: 1.6, shadow: false });
  const rocks = place(Math.round(160 * k), 75, (x, z, R) => clearOf(x, z, 9, 3, 0) && (slopeAt(x, z) > 0.5 || Math.abs(x - creekX(z)) < 7 || R() < 0.15));
  await instanceGLB(scene, 'rock_moss_set_01', rocks, { scale: [0.35, 0.9], yOff: -0.2, tilt: 0.3, colliderR: 1.5 });
  const small = place(Math.round(300 * k), 76, (x, z) => Math.abs(x - creekX(z)) < 5.5 || trackDist(x, z) < 4);
  await instanceGLB(scene, 'rock_07', small, { scale: [1.5, 4.0], yOff: -0.03, tilt: 1, shadow: false });
  const logs = place(40, 77, (x, z) => clearOf(x, z, 10, 3.5, 4));
  await instanceGLB(scene, 'dead_tree_trunk', logs, { scale: [1.2, 2.2], yOff: 0.05, tilt: 0.05, colliderR: 1 });
  await instanceGLB(scene, 'tree_stump_01', place(45, 78, (x, z) => clearOf(x, z, 8, 3, 4)), { scale: [0.8, 1.3], yOff: -0.05, colliderR: 0.8 });
  await instanceGLB(scene, 'dry_branches_medium_01', place(Math.round(200 * k), 79, (x, z) => clearOf(x, z, 5, 2, 3)), { scale: [0.8, 1.6], tilt: 0.1, shadow: false });
}

// Camp props around the parked camper (placed in world, relative to hollow spot)
export const camp = { fire: null, fireLight: null, table: null, generator: null };
async function buildProps(scene) {
  const s = SPOTS.hollow;
  const put = async (name, lx, lz, rot = 0, sc = 1) => {
    const g = (await glb(name)).scene.clone(true);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const x = s.x + lx, z = s.z + lz;
    g.position.set(x, heightAt(x, z), z); g.rotation.y = rot; g.scale.setScalar(sc);
    scene.add(g); return g;
  };
  camp.fire = await put('stone_fire_pit', 5.2, 3.2, 0.3);
  camp.table = await put('outdoor_table_chair_set_01', 3.6, -1.8, 1.3);
  camp.generator = await put('portable_generator', -2.4, -4.2, 2.0);
  await put('metal_jerrycan', -1.9, -4.9, 0.4);
  colliders.push({ x: s.x + 5.2, z: s.z + 3.2, r: 0.9 }, { x: s.x + 3.6, z: s.z - 1.8, r: 1.0 });
  // embers / fire light (lit at night by events/ui)
  const fl = new THREE.PointLight(0xff7a2a, 0, 12, 1.6);
  fl.position.set(s.x + 5.2, heightAt(s.x + 5.2, s.z + 3.2) + 0.6, s.z + 3.2);
  scene.add(fl); camp.fireLight = fl;
}
