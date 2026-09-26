// Camper van: exterior shell (painted, muddy), windows with rain glass, full interior
// (dinette, kitchen, bed, cab, alcove), warm lighting, fairy lights, curtains, wall clock.
import { THREE, G, U, rng, fmtTime } from './core.js';
import { tex, pbr, canvasTex } from './assets.js';
import { makeGlass } from './glass.js';
import { RoundedBoxGeometry } from './lib/addons/geometries/RoundedBoxGeometry.js';

export const FLOOR = 0.72;          // interior floor height (camper local)
export const CEIL = 2.75;
export const ROOF = 2.9;
export const XW = 1.2;              // half width (exterior)
export const ZF = -4.3, ZB = 3.2;   // front / back of box

// ---------------------------------------------------------------- windows
// plane coords: L/R -> (z,y), B/F -> (x,y), T -> (x,z)
export const WINDOWS = [
  { id: 'dinette', wall: 'L', c: [-1.1, 1.97], w: 1.6, h: 0.78, curtain: true },
  { id: 'bedL', wall: 'L', c: [2.3, 1.98], w: 0.95, h: 0.56, curtain: true },
  { id: 'cabL', wall: 'L', c: [-3.55, 1.92], w: 0.95, h: 0.62, curtain: true },
  { id: 'kitchen', wall: 'R', c: [-0.55, 2.08], w: 0.9, h: 0.5, curtain: true },
  { id: 'door', wall: 'R', c: [0.72, 2.1], w: 0.42, h: 0.46, curtain: true },
  { id: 'bedR', wall: 'R', c: [2.3, 1.98], w: 0.8, h: 0.56, curtain: true },
  { id: 'cabR', wall: 'R', c: [-3.55, 1.92], w: 0.95, h: 0.62, curtain: true },
  { id: 'rear', wall: 'B', c: [0, 1.98], w: 1.3, h: 0.56, curtain: true },
  { id: 'windshield', wall: 'F', c: [0, 1.82], w: 2.08, h: 0.74, curtain: true },
  { id: 'sky1', wall: 'T', c: [0, -1.15], w: 0.7, h: 0.7, curtain: true },
  { id: 'sky2', wall: 'T', c: [0, 2.3], w: 0.9, h: 0.85, curtain: true },
];
export const win = id => WINDOWS.find(w => w.id === id);

// world helpers for a window (local center + outward normal)
export function windowLocal(w) {
  const [a, b] = w.c;
  switch (w.wall) {
    case 'L': return { p: new THREE.Vector3(-XW, b, a), n: new THREE.Vector3(-1, 0, 0) };
    case 'R': return { p: new THREE.Vector3(XW, b, a), n: new THREE.Vector3(1, 0, 0) };
    case 'B': return { p: new THREE.Vector3(a, b, ZB), n: new THREE.Vector3(0, 0, 1) };
    case 'F': return { p: new THREE.Vector3(a, b, ZF), n: new THREE.Vector3(0, 0, -1) };
    default: return { p: new THREE.Vector3(a, ROOF, b), n: new THREE.Vector3(0, 1, 0) };
  }
}

export const C = {
  group: null, interiorLights: [], emissives: [], fairy: null, lantern: null, porch: null,
  spot: null, heads: [], curtains: [], glass: {}, clock: null, radio: null, rug: null,
  lightLevel: 1, curtainLevel: 0, dash: null, stove: null, steam: null, interiorRoot: null,
};

function rbox(w, h, d, mat, x, y, z, r = 0.02, seg = 2) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
// box from min/max corners
function bb(x0, y0, z0, x1, y1, z1, mat, r = 0.015) {
  return rbox(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
}

function rectPath(cx, cy, w, h, r = 0.08) {
  const p = new THREE.Path(), x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1); p.lineTo(x0 + r, y1);
  p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

// Extruded wall panel with window holes. axis: 'x' (L/R walls, shape=(z,y)), 'z' (F/B, shape=(x,y)), 'y' (roof, shape=(x,z))
function wallPanel(outline, holes, depth, mat, axis, offset) {
  const s = new THREE.Shape();
  const [u0, v0, u1, v1] = outline;
  s.moveTo(u0, v0); s.lineTo(u1, v0); s.lineTo(u1, v1); s.lineTo(u0, v1); s.lineTo(u0, v0);
  holes.forEach(h => s.holes.push(rectPath(h.c[0], h.c[1], h.w, h.h, h.r ?? 0.07)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  if (axis === 'x') { g.rotateY(-Math.PI / 2); g.translate(offset, 0, 0); }
  else if (axis === 'z') { g.translate(0, 0, offset); }
  else { g.rotateX(Math.PI / 2); g.translate(0, offset, 0); }
  g.computeVertexNormals();
  // box-projected UVs in metres so textures keep a consistent real-world scale
  const pp = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pp.count; i++) {
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z, y); else if (ay >= az) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

function paintMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xe8e4da, roughness: 0.42, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.18,
    roughnessMap: tex('metal_plate_arm'), normalMap: tex('metal_plate_nor_gl'), normalScale: new THREE.Vector2(0.08, 0.08),
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOP; uniform float uWet;
      float ph(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float pn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(ph(i),ph(i+vec2(1,0)),f.x), mix(ph(i+vec2(0,1)),ph(i+vec2(1,1)),f.x), f.y); }
      float gMud;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float y = vOP.y; vec2 hz = vec2(vOP.x + vOP.z, y);
        // retro livery: forest green band + amber pinstripe
        float band = smoothstep(1.18, 1.19, y) * (1. - smoothstep(1.52, 1.53, y));
        float pin = smoothstep(1.56, 1.565, y) * (1. - smoothstep(1.585, 1.59, y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.26, 0.21), band);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.45, 0.12), pin);
        // mud splash from the ground & dripping grime streaks under windows
        float n = pn(hz*vec2(6., 3.)) * .6 + pn(hz*vec2(22., 9.)) * .4;
        gMud = smoothstep(1.25, 0.45, y + n*0.45);
        float streak = pn(vec2((vOP.x+vOP.z)*38., 0.)) * smoothstep(2.4, 1.2, y) * .25;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.15, 0.09), clamp(gMud*0.85 + streak*0.4, 0., 1.));
        diffuseColor.rgb *= mix(1., .8, uWet);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, gMud); roughnessFactor = mix(roughnessFactor, 0.15, uWet*.7);`);
  };
  return m;
}

// ---------------------------------------------------------------- canvas art
function kilimTex() {
  return canvasTex(512, 768, (c, w, h) => {
    c.fillStyle = '#7a2a1c'; c.fillRect(0, 0, w, h);
    const cols = ['#c8873a', '#e9d8b4', '#2c4a52', '#4a1a14', '#d9a441'];
    for (let y = 0; y < h; y += 64) {
      for (let x = 0; x < w; x += 64) {
        const k = ((x + y) / 64) % cols.length;
        c.fillStyle = cols[k]; c.beginPath();
        c.moveTo(x + 32, y + 6); c.lineTo(x + 58, y + 32); c.lineTo(x + 32, y + 58); c.lineTo(x + 6, y + 32); c.fill();
        c.fillStyle = '#7a2a1c'; c.beginPath();
        c.moveTo(x + 32, y + 20); c.lineTo(x + 44, y + 32); c.lineTo(x + 32, y + 44); c.lineTo(x + 20, y + 32); c.fill();
      }
    }
    c.strokeStyle = '#e9d8b4'; c.lineWidth = 18; c.strokeRect(12, 12, w - 24, h - 24);
    c.strokeStyle = '#2c4a52'; c.lineWidth = 6; c.strokeRect(30, 30, w - 60, h - 60);
    // wear
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 6); }
  });
}
function mapTex() {
  return canvasTex(512, 384, (c, w, h) => {
    c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h);
    const R = rng(9);
    for (let k = 0; k < 16; k++) {
      c.strokeStyle = k % 4 ? 'rgba(140,100,60,.45)' : 'rgba(120,80,40,.8)'; c.lineWidth = k % 4 ? 1 : 2;
      c.beginPath();
      const cx = 300, cy = 170, r = 20 + k * 14;
      for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; const rr = r * (1 + 0.18 * Math.sin(t * 3 + k * 0.3) + 0.08 * Math.sin(t * 7)); c.lineTo(cx + Math.cos(t) * rr * 1.3, cy + Math.sin(t) * rr); }
      c.stroke();
    }
    c.strokeStyle = '#3d7fa6'; c.lineWidth = 4; c.beginPath(); c.moveTo(40, 0);
    for (let y = 0; y <= h; y += 16) c.lineTo(60 + Math.sin(y * 0.03) * 25, y); c.stroke();
    c.strokeStyle = '#a0522d'; c.setLineDash([8, 6]); c.lineWidth = 3; c.beginPath(); c.moveTo(90, 250); c.bezierCurveTo(180, 300, 260, 120, 360, 120); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(95, 250, 7, 0, 7); c.fill(); c.beginPath(); c.arc(360, 120, 7, 0, 7); c.fill();
    c.fillStyle = '#3b2a1a'; c.font = 'bold 22px serif'; c.fillText('奥沢の森', 20, 30);
    c.font = '14px serif'; c.fillText('窪地', 70, 280); c.fillText('高台', 340, 105); c.fillText('沢', 72, 60);
    for (let i = 0; i < 2000; i++) { c.fillStyle = `rgba(90,60,30,${R() * 0.06})`; c.fillRect(R() * w, R() * h, 3, 3); }
  });
}
function blobShadowTex() {
  return canvasTex(128, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.save(); c.scale(1, 1); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
  }, false);
}
function clockTex() {
  return canvasTex(256, 256, () => {});
}
export function drawClock() {
  if (!C.clock) return;
  const t = C.clock.material.map, c = t.userData.ctx;
  c.clearRect(0, 0, 256, 256);
  c.fillStyle = '#f3ecdc'; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill();
  c.lineWidth = 10; c.strokeStyle = '#5a3b22'; c.stroke();
  c.fillStyle = '#3a2a1a';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 3, 6, 6); }
  const h = G.hour % 12, m = (G.hour % 1) * 60;
  const hand = (a, l, wd) => { c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * l, 128 - Math.cos(a) * l); c.stroke(); };
  c.strokeStyle = '#2a1a10'; hand(h / 12 * Math.PI * 2, 58, 8); hand(m / 60 * Math.PI * 2, 86, 5);
  c.fillStyle = '#b5652a'; c.beginPath(); c.arc(128, 128, 8, 0, 7); c.fill();
  t.needsUpdate = true;
}
export function drawRadio(text, alert = false) {
  if (!C.radio) return;
  const t = C.radio.material.emissiveMap, c = t.userData.ctx;
  c.fillStyle = alert ? '#200800' : '#081408'; c.fillRect(0, 0, 256, 64);
  c.fillStyle = alert ? '#ff8a3a' : '#7dffa0'; c.font = 'bold 26px monospace'; c.fillText(text.slice(0, 14), 10, 42);
  t.needsUpdate = true;
}

// ---------------------------------------------------------------- build
export function buildCamper(scene) {
  const g = new THREE.Group(); g.name = 'camper';
  const inner = new THREE.Group(); inner.name = 'interior'; g.add(inner);
  C.group = g; C.interiorRoot = inner; G.camper = g;

  // materials
  const paint = paintMaterial();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 1 });
  const panel = pbr('oak_veneer_01', { color: 0xc99a6a, repeat: 0.55, normalScale: 0.8 });
  const ceilM = pbr('rough_linen', { arm: false, color: 0xd9ccb4, repeat: 0.7, normalScale: 0.6 });
  const oak = pbr('oak_veneer_01', { repeat: 1, color: 0xd9b48a, normalScale: 0.6 });
  const oakDark = pbr('oak_veneer_01', { repeat: 1, color: 0x8a5a35, normalScale: 0.6 });
  const floorM = pbr('laminate_floor_02', { repeat: 1, normalScale: 0.7 });
  floorM.map.repeat.set(1.3, 2.5); floorM.normalMap.repeat.set(1.3, 2.5); floorM.aoMap.repeat.set(1.3, 2.5);
  const leather = pbr('leather_white', { color: 0x7a4a2a, repeat: 1, normalScale: 0.6 });
  const linen = pbr('rough_linen', { arm: false, color: 0xf4eee3, repeat: 1.5 });
  const fleece = pbr('knitted_fleece', { arm: false, color: 0xb8433a, repeat: 2 });
  const tile = pbr('square_tiled_wall', { color: 0x9fb8b0, repeat: 1 });
  const steel = pbr('metal_plate', { metal: 1, color: 0xd8dde0, rough: 0.5, repeat: 0.5 });
  const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 });
  const dashM = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.75 });

  // ---------- shell: side walls (outer skin + inner panel)
  const holes = w => WINDOWS.filter(x => x.wall === w).map(x => ({ c: x.c, w: x.w, h: x.h }));
  const sideOutline = [ZF, 0.55, ZB, ROOF];
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const hs = holes(side);
    // skin: extrude depth goes toward -x after rotation; for L place at -XW+d
    const skin = wallPanel(sideOutline, hs, 0.02, paint, 'x', side === 'L' ? -XW + 0.02 : XW);
    const inn = wallPanel([ZF, FLOOR, ZB, CEIL], hs, 0.1, panel, 'x', side === 'L' ? -XW + 0.12 : XW - 0.02);
    g.add(skin); inner.add(inn);
    // window rubber frames (outside)
    for (const h of WINDOWS.filter(x => x.wall === side)) {
      const fr = frameRing(h.w, h.h, rubber);
      fr.rotation.y = sgn * Math.PI / 2; fr.position.set(sgn * (XW + 0.005), h.c[1], h.c[0]);
      g.add(fr);
    }
  }
  // back / front walls
  const back = wallPanel([-XW, 0.55, XW, ROOF], holes('B'), 0.02, paint, 'z', ZB - 0.02);
  const backIn = wallPanel([-XW + 0.02, FLOOR, XW - 0.02, CEIL], holes('B'), 0.1, panel, 'z', ZB - 0.12);
  const front = wallPanel([-XW, 0.55, XW, ROOF], holes('F'), 0.02, paint, 'z', ZF);
  const frontIn = wallPanel([-XW + 0.02, FLOOR, XW - 0.02, CEIL], holes('F'), 0.08, dashM, 'z', ZF + 0.02);
  g.add(back, front); inner.add(backIn, frontIn);
  for (const h of WINDOWS.filter(x => x.wall === 'B' || x.wall === 'F')) {
    const fr = frameRing(h.w, h.h, rubber);
    fr.position.set(h.c[0], h.c[1], h.wall === 'B' ? ZB + 0.005 : ZF - 0.005);
    g.add(fr);
  }
  // roof (skin + ceiling)
  const roofHoles = holes('T');
  const roof = wallPanel([-XW, ZF, XW, ZB], roofHoles, 0.03, paint, 'y', ROOF);
  const ceil = wallPanel([-XW, ZF, XW, ZB], roofHoles, ROOF - 0.03 - CEIL, ceilM, 'y', ROOF - 0.03);
  g.add(roof); inner.add(ceil);
  for (const h of WINDOWS.filter(x => x.wall === 'T')) {
    const fr = frameRing(h.w + 0.08, h.h + 0.08, darkPlastic, 0.05);
    fr.rotation.x = -Math.PI / 2; fr.position.set(h.c[0], ROOF + 0.03, h.c[1]);
    g.add(fr);
  }
  // floor + underbody
  inner.add(bb(-XW + 0.02, FLOOR - 0.04, ZF + 0.02, XW - 0.02, FLOOR, ZB - 0.02, floorM, 0.005));
  g.add(bb(-XW + 0.05, 0.42, ZF + 0.2, XW - 0.05, 0.58, ZB - 0.1, darkPlastic, 0.02));
  // rounded front cap edges & roof trims
  g.add(bb(-XW - 0.01, ROOF - 0.02, ZF - 0.04, XW + 0.01, ROOF + 0.04, ZB + 0.02, paint, 0.03));
  // rounded corner posts (hide the hard box corners of the extruded walls)
  for (const [x, z] of [[-XW, ZF], [XW, ZF], [-XW, ZB], [XW, ZB]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, ROOF - 0.55, 12), paint);
    post.position.set(x, (ROOF + 0.55) / 2, z); post.castShadow = true; g.add(post);
  }
  for (const x of [-XW, XW]) { // roof edge rails
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ZB - ZF, 12), paint);
    rail.rotation.x = Math.PI / 2; rail.position.set(x, ROOF + 0.01, (ZF + ZB) / 2); g.add(rail);
  }
  // aluminium skirt trim & rain gutter
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.35, metalness: 0.9 });
  for (const sx of [-1, 1]) {
    g.add(bb(sx * XW - 0.015, 0.56, ZF, sx * XW + 0.015, 0.62, ZB, alu, 0.01));
    g.add(bb(sx * XW - 0.02, ROOF - 0.12, ZF + 0.1, sx * XW + 0.02, ROOF - 0.1, ZB - 0.05, alu, 0.005));
  }
  // rear: tail lights, ladder, spare tyre cover, bumper
  const tailM = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a0a, emissiveIntensity: 0.25, roughness: 0.2 });
  C.tailMat = tailM;
  for (const sx of [-1, 1]) g.add(rbox(0.12, 0.34, 0.04, tailM, sx * (XW - 0.12), 1.15, ZB + 0.02, 0.02));
  g.add(rbox(2.3, 0.2, 0.22, darkPlastic, 0, 0.6, ZB + 0.08, 0.06));
  const ladderM = alu;
  for (const lx of [0.55, 0.9]) g.add(bb(lx - 0.015, 0.9, ZB + 0.04, lx + 0.015, ROOF + 0.25, ZB + 0.07, ladderM, 0.008));
  for (let y = 1.0; y < ROOF + 0.2; y += 0.28) g.add(bb(0.55, y, ZB + 0.04, 0.9, y + 0.025, ZB + 0.07, ladderM, 0.008));
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 28), new THREE.MeshStandardMaterial({ color: 0x1e3a30, roughness: 0.55 }));
  spare.rotation.x = Math.PI / 2; spare.position.set(-0.45, 1.25, ZB + 0.13); spare.castShadow = true; g.add(spare);
  // roof A/C unit & vent
  g.add(rbox(0.7, 0.24, 0.9, new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.5 }), 0, ROOF + 0.14, -1.9 + 0.95, 0.08, 3));
  // soft contact shadow under the chassis (blob; sells grounding on soft forest floor)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.6), new THREE.MeshBasicMaterial({
    alphaMap: blobShadowTex(), transparent: true, depthWrite: false, opacity: 0.75, color: 0x000000,
    polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.02, (ZF + ZB) / 2 - 0.4); blob.renderOrder = 1; g.add(blob);

  // ---------- hood / cab front
  const hood = rbox(2.3, 0.85, 1.05, paint, 0, 0.98, ZF - 0.5, 0.18, 4);
  g.add(hood);
  g.add(rbox(2.36, 0.22, 0.2, darkPlastic, 0, 0.62, ZF - 1.05, 0.06));        // bumper
  g.add(rbox(1.2, 0.26, 0.04, darkPlastic, 0, 1.05, ZF - 1.03, 0.02));        // grille
  const hlM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0, roughness: 0.1 });
  for (const sx of [-0.8, 0.8]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 20), hlM);
    hl.rotation.x = Math.PI / 2; hl.position.set(sx, 1.05, ZF - 1.03); g.add(hl);
    const sl = new THREE.SpotLight(0xfff0d0, 0, 45, 0.45, 0.5, 1.5);
    sl.position.set(sx, 1.05, ZF - 1.1); sl.target.position.set(sx * 1.5, 0.3, ZF - 20);
    g.add(sl, sl.target); C.heads.push(sl);
  }
  C.headMat = hlM;
  // mirrors
  for (const sx of [-1, 1]) {
    g.add(rbox(0.06, 0.05, 0.05, darkPlastic, sx * 1.3, 1.9, ZF + 0.3, 0.01));
    g.add(rbox(0.05, 0.32, 0.2, darkPlastic, sx * 1.36, 1.9, ZF + 0.3, 0.03));
  }
  // wheels
  const tireG = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 32); tireG.rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.24, 0.24, 0.3, 20); rimG.rotateZ(Math.PI / 2);
  C.wheels = [];
  for (const [x, z] of [[-1.02, ZF - 0.35], [1.02, ZF - 0.35], [-1.02, 1.9], [1.02, 1.9]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(tireG, rubber); t.castShadow = true;
    const r = new THREE.Mesh(rimG, chrome);
    w.add(t, r); w.position.set(x, 0.42, z); g.add(w); C.wheels.push(w);
    // wheel arch
    g.add(rbox(0.1, 0.12, 1.05, darkPlastic, x * 1.14, 0.9, z, 0.04));
  }
  // side door outline & handle (right)
  for (const [z0, z1] of [[0.35, 1.1]]) {
    g.add(bb(XW, 0.62, z0 - 0.012, XW + 0.012, 2.62, z0 + 0.012, rubber, 0.002));
    g.add(bb(XW, 0.62, z1 - 0.012, XW + 0.012, 2.62, z1 + 0.012, rubber, 0.002));
    g.add(bb(XW, 2.6, z0, XW + 0.012, 2.625, z1, rubber, 0.002));
    g.add(rbox(0.03, 0.05, 0.16, chrome, XW + 0.02, 1.55, z1 - 0.1, 0.01));
    // step
    g.add(bb(XW - 0.1, 0.4, z0, XW + 0.28, 0.46, z1, steel, 0.01));
  }
  // rolled awning
  g.add(rbox(0.16, 0.16, 4.6, new THREE.MeshStandardMaterial({ color: 0x3d4a45, roughness: 0.5 }), XW + 0.09, ROOF - 0.12, -0.2, 0.07));
  // roof rack + solar panel
  const solar = new THREE.MeshPhysicalMaterial({ color: 0x0a1630, roughness: 0.15, metalness: 0.3, clearcoat: 1 });
  g.add(bb(-0.7, ROOF + 0.05, 0.1, 0.7, ROOF + 0.09, 1.5, solar, 0.01));
  g.add(bb(-0.9, ROOF + 0.04, -3.9, 0.9, ROOF + 0.06, -2.6, steel, 0.01));
  // roof spotlight (投光器)
  const spotHousing = rbox(0.22, 0.16, 0.2, darkPlastic, 0, ROOF + 0.18, -3.4, 0.04);
  g.add(spotHousing);
  const spot = new THREE.SpotLight(0xe8f0ff, 0, 60, 0.5, 0.35, 1.2);
  spot.position.set(0, ROOF + 0.25, -3.4); spot.castShadow = false;
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
  g.add(spot, spot.target); spot.target.position.set(0, 0, -20);
  C.spot = spot;
  // porch light
  const porchM = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffb060, emissiveIntensity: 2 });
  const porchLamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), porchM);
  porchLamp.position.set(XW + 0.05, 2.5, 1.25); g.add(porchLamp);
  const porch = new THREE.PointLight(0xffa860, 3, 9, 1.8); porch.position.set(XW + 0.3, 2.45, 1.25);
  g.add(porch); C.porch = porch; C.emissives.push({ m: porchM, base: 2, kind: 'porch' });

  // ---------- glass
  for (const w of WINDOWS) {
    const horizontal = w.wall === 'T';
    const mat = makeGlass({ horizontal, tint: w.wall === 'F' ? 0xf4fbf8 : 0xffffff });
    const geo = new THREE.PlaneGeometry(w.w + 0.02, w.h + 0.02);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w.w / 0.8, uv.getY(i) * w.h / 0.8);
    const m = new THREE.Mesh(geo, mat);
    const L = windowLocal(w);
    m.position.copy(L.p).addScaledVector(L.n, -0.04);
    if (w.wall === 'L') m.rotation.y = -Math.PI / 2;
    if (w.wall === 'R') m.rotation.y = Math.PI / 2;
    if (w.wall === 'F') { m.rotation.x = -0.18; m.position.z -= 0.02; }
    if (w.wall === 'T') { m.rotation.x = -Math.PI / 2; m.position.y = ROOF + 0.015; }
    m.renderOrder = 2;
    g.add(m);
    C.glass[w.id] = m;
  }

  buildInterior(inner, { oak, oakDark, leather, linen, fleece, tile, steel, darkPlastic, dashM, panel, chrome });
  scene.add(g);
  return g;
}

function frameRing(w, h, mat, t = 0.04) {
  const s = new THREE.Shape();
  const o = rectPath(0, 0, w + t * 2, h + t * 2, 0.1);
  s.setFromPoints(o.getPoints(6));
  s.holes.push(rectPath(0, 0, w, h, 0.07));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 4 });
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- interior
function buildInterior(I, M) {
  const F = FLOOR;
  const add = (...o) => { o.forEach(x => I.add(x)); return o[0]; };
  const xi = XW - 0.12; // inner wall x

  // ---- dinette (left, facing benches) ----
  const benchBase = (z0, z1, backAtFront) => {
    add(bb(-xi, F, z0, -0.35, F + 0.4, z1, M.oak));
    add(rbox(-0.35 + xi - 0.02, 0.12, z1 - z0 - 0.02, M.leather, (-xi - 0.35) / 2, F + 0.46, (z0 + z1) / 2, 0.05, 3));
    const bz = backAtFront ? z0 + 0.06 : z1 - 0.06;
    add(rbox(-0.35 + xi - 0.02, 0.55, 0.12, M.leather, (-xi - 0.35) / 2, F + 0.8, bz, 0.05, 3));
  };
  benchBase(-2.45, -1.9, true);
  benchBase(-0.3, 0.25, false);
  // table (on a pedestal)
  const table = add(bb(-xi + 0.02, F + 0.7, -1.78, -0.42, F + 0.74, -0.42, M.oakDark, 0.02));
  add(bb(-0.8, F, -1.15, -0.72, F + 0.7, -1.05, M.steel, 0.01));
  // ---- cab ----
  for (const sx of [-0.55, 0.55]) {
    add(rbox(0.55, 0.14, 0.55, M.leather, sx, F + 0.5, -3.3, 0.06, 3));
    add(rbox(0.55, 0.7, 0.14, M.leather, sx, F + 0.95, -2.98, 0.06, 3));
    add(rbox(0.3, 0.16, 0.1, M.leather, sx, F + 1.36, -2.97, 0.05, 3));
    add(rbox(0.4, 0.42, 0.4, M.darkPlastic, sx, F + 0.21, -3.3, 0.03));
  }
  // dashboard
  const dash = add(bb(-xi, F + 0.55, ZF + 0.02, xi, F + 0.85, ZF + 0.55, M.dashM, 0.08));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 32), M.darkPlastic);
  wheel.position.set(-0.55, F + 0.98, ZF + 0.75); wheel.rotation.x = -0.9; add(wheel);
  add(rbox(0.06, 0.06, 0.35, M.darkPlastic, -0.55, F + 0.9, ZF + 0.6, 0.02));
  const gaugeM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3aa0ff, emissiveIntensity: 0.6 });
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), gaugeM);
  gauge.position.set(-0.55, F + 0.87, ZF + 0.5); gauge.rotation.x = -1.1; add(gauge);
  C.emissives.push({ m: gaugeM, base: 0.6, kind: 'dash' });
  // alcove bunk over cab
  add(bb(-xi, 2.17, ZF + 0.05, xi, 2.24, -2.85, M.oak, 0.02));
  add(rbox(2.0, 0.14, 1.3, M.linen, 0, 2.31, -3.55, 0.06, 3));
  add(rbox(0.5, 0.12, 0.35, M.fleece, 0.4, 2.44, -3.8, 0.05, 3));
  add(bb(-xi, 2.24, -2.9, xi, 2.36, -2.85, M.oakDark, 0.01));

  // ---- kitchen (right) ----
  add(bb(0.5, F, -1.65, xi, F + 0.88, 0.3, M.oak));
  const counter = add(bb(0.47, F + 0.88, -1.68, xi, F + 0.92, 0.32, M.oakDark, 0.01));
  // sink
  add(bb(0.62, F + 0.84, -0.3, 0.98, F + 0.925, 0.1, M.steel, 0.02));
  const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 16, Math.PI), M.chrome);
  faucet.position.set(1.0, F + 1.04, -0.1); faucet.rotation.y = Math.PI / 2; add(faucet);
  add(rbox(0.024, 0.12, 0.024, M.chrome, 1.0, F + 0.98, 0.0, 0.01));
  // stove (glass top with burners)
  const stoveTop = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.08, clearcoat: 1 });
  add(bb(0.58, F + 0.92, -1.45, 1.02, F + 0.935, -0.8, stoveTop, 0.01));
  C.stove = [];
  for (const z of [-1.28, -0.97]) {
    const bm = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff3a10, emissiveIntensity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 28), bm);
    ring.rotation.x = -Math.PI / 2; ring.position.set(0.8, F + 0.94, z); add(ring); C.stove.push(bm);
  }
  // kettle
  const kettle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.1, 0.05], [0.09, 0.14], [0.05, 0.18], [0.015, 0.2], [0, 0.2]].map(p => new THREE.Vector2(p[0], p[1])), 24), M.chrome);
  kettle.position.set(0.8, F + 0.94, -0.97); kettle.castShadow = true; add(kettle);
  // backsplash tile
  add(bb(xi - 0.012, F + 0.92, -1.65, xi, F + 1.25, 0.3, M.tile, 0.002));
  // fridge
  add(bb(0.45, F, -2.55, xi, F + 1.7, -1.72, new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.35 }), 0.02));
  add(rbox(0.02, 0.4, 0.03, M.chrome, 0.44, F + 1.2, -1.8, 0.01));
  // wet bath / wardrobe block (left, behind dinette)
  add(bb(-xi, F, 0.35, -0.2, CEIL, 1.45, M.oak, 0.01));
  add(bb(-0.205, F + 0.1, 0.45, -0.19, CEIL - 0.1, 1.35, M.oakDark, 0.005));
  add(rbox(0.03, 0.12, 0.03, M.chrome, -0.18, F + 1.1, 0.55, 0.01));

  // ---- bed (rear) ----
  add(bb(-xi, F, 1.5, xi, F + 0.58, ZB - 0.12, M.oak));
  add(rbox(2.14, 0.2, 1.55, M.linen, 0, F + 0.68, 2.33, 0.08, 3));
  // blanket (draped, wrinkled)
  const bl = new THREE.PlaneGeometry(2.1, 1.1, 40, 24); bl.rotateX(-Math.PI / 2);
  const bp = bl.attributes.position; const R = rng(4);
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const edge = Math.max(0, Math.abs(x) - 0.98);
    bp.setY(i, Math.sin(x * 9 + z * 3) * 0.012 + Math.sin(z * 14) * 0.008 + (R() - 0.5) * 0.004 - edge * 2.2);
    if (edge > 0) bp.setX(i, Math.sign(x) * (0.98 + edge * 0.25));
  }
  bl.computeVertexNormals();
  const blanket = new THREE.Mesh(bl, M.fleece); blanket.position.set(0, F + 0.8, 2.45); blanket.castShadow = true; blanket.receiveShadow = true; add(blanket);
  for (const sx of [-0.5, 0.5]) add(rbox(0.62, 0.14, 0.36, M.linen, sx, F + 0.86, 1.72, 0.07, 4));
  // book
  add(rbox(0.16, 0.03, 0.22, new THREE.MeshStandardMaterial({ color: 0x2a4d6b, roughness: 0.7 }), 0.3, F + 0.84, 2.9, 0.005));

  // ---- overhead lockers (both sides) & LED strips ----
  const ledM = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc27a, emissiveIntensity: 1.1 });
  C.emissives.push({ m: ledM, base: 1.1, kind: 'led' });
  const locker = (sgn, z0, z1) => {
    const x0 = sgn < 0 ? -xi : xi - 0.34, x1 = sgn < 0 ? -xi + 0.34 : xi;
    add(bb(x0, 2.4, z0, x1, CEIL, z1, M.oak, 0.01));
    const n = Math.max(1, Math.round((z1 - z0) / 0.55));
    for (let k = 0; k < n; k++) {
      const a = z0 + (z1 - z0) * k / n + 0.01, b = z0 + (z1 - z0) * (k + 1) / n - 0.01;
      const fx = sgn < 0 ? x1 + 0.005 : x0 - 0.005;
      add(bb(fx - 0.01, 2.42, a, fx + 0.01, CEIL - 0.02, b, M.oakDark, 0.005));
      add(rbox(0.02, 0.02, 0.1, M.chrome, fx + (sgn < 0 ? 0.015 : -0.015), 2.46, (a + b) / 2, 0.005));
    }
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, z1 - z0 - 0.1), ledM);
    led.position.set(sgn < 0 ? x1 - 0.04 : x0 + 0.04, 2.395, (z0 + z1) / 2); add(led);
  };
  locker(-1, -2.55, -0.3); locker(1, -1.65, 0.3); locker(-1, 1.5, 2.1); locker(1, 1.5, 2.1);

  // ---- fairy lights (string along both locker edges and over bed) ----
  const pts = [];
  const string = (a, b, n, sag) => { for (let i = 0; i < n; i++) { const t = i / (n - 1); const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag + Math.abs(Math.sin(t * Math.PI * 6)) * 0.03; pts.push(p); } };
  string(new THREE.Vector3(-0.72, 2.38, -2.5), new THREE.Vector3(-0.72, 2.38, -0.35), 22, 0.05);
  string(new THREE.Vector3(0.72, 2.38, -1.6), new THREE.Vector3(0.72, 2.38, 0.28), 18, 0.05);
  string(new THREE.Vector3(-1.0, 2.62, 1.55), new THREE.Vector3(1.0, 2.62, 1.55), 16, 0.12);
  string(new THREE.Vector3(-1.02, 2.4, 2.15), new THREE.Vector3(-1.02, 2.3, 3.0), 10, 0.04);
  string(new THREE.Vector3(1.02, 2.4, 2.15), new THREE.Vector3(1.02, 2.3, 3.0), 10, 0.04);
  const fairyM = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 2.6, toneMapped: true });
  const fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), fairyM, pts.length);
  const d = new THREE.Object3D();
  pts.forEach((p, i) => { d.position.copy(p); d.updateMatrix(); fairy.setMatrixAt(i, d.matrix); });
  add(fairy); C.fairy = fairy; C.emissives.push({ m: fairyM, base: 2.6, kind: 'fairy' });
  // wire
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(0, 22)), 60, 0.002, 4), M.darkPlastic); add(wire);

  // ---- lantern on the table ----
  const lanternM = new THREE.MeshStandardMaterial({ color: 0xffe1a8, emissive: 0xff9a3a, emissiveIntensity: 2.4 });
  const lg = new THREE.Group();
  lg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16), lanternM));
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.13, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4, wireframe: true }));
  lg.add(cage);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.7, roughness: 0.4 }));
  top.position.y = 0.085; lg.add(top);
  lg.position.set(-0.95, F + 0.81, -1.35); add(lg);
  C.emissives.push({ m: lanternM, base: 2.4, kind: 'lantern' });
  const lanternL = new THREE.PointLight(0xff9a45, 1.6, 4, 2); lanternL.position.set(-0.95, F + 0.85, -1.35);
  add(lanternL); C.lantern = lanternL;
  // mugs
  const mugM = new THREE.MeshStandardMaterial({ color: 0xeee6d8, roughness: 0.3 });
  for (const [x, z] of [[-0.62, -1.1], [-0.68, -0.72]]) {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 18), mugM);
    mug.position.set(x, F + 0.785, z); mug.castShadow = true; add(mug);
  }
  // wall map, clock, radio
  const mapM = new THREE.MeshStandardMaterial({ map: mapTex(), roughness: 0.9 });
  const map = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.375), mapM);
  map.position.set(-0.199, F + 1.55, 0.9); map.rotation.y = -Math.PI / 2; add(map);
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.6 }));
  clk.position.set(0, 2.25, ZB - 0.121); clk.rotation.y = Math.PI; add(clk); C.clock = clk; drawClock();
  clk.position.set(-0.199, F + 1.1, 0.95); clk.rotation.y = -Math.PI / 2;
  const radioTex = canvasTex(256, 64, () => {});
  const radioM = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: radioTex, emissiveIntensity: 1.2 });
  add(rbox(0.3, 0.14, 0.12, M.darkPlastic, 0.8, F + 1.0, 0.2, 0.02));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), radioM);
  scr.position.set(0.8, F + 1.02, 0.141); add(scr); C.radio = scr; drawRadio('FM 81.3 森');
  scr.rotation.y = 0; scr.position.set(0.8, F + 1.02, 0.141);
  // rug
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.3), new THREE.MeshStandardMaterial({ map: kilimTex(), roughness: 1, normalMap: tex('knitted_fleece_nor_gl', { repeat: 3 }) }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.05, F + 0.004, -0.6); rug.receiveShadow = true; add(rug);
  // plant
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xa55a35, roughness: 0.9 }));
  pot.position.set(1.0, F + 0.97, 0.22); add(pot);
  const leafM = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI), leafM);
    lf.scale.set(0.5, 1.6, 0.2); lf.position.set(1.0 + Math.cos(i * 2.4) * 0.03, F + 1.08 + (i % 3) * 0.03, 0.22 + Math.sin(i * 2.4) * 0.03);
    lf.rotation.set(Math.cos(i * 2.4) * 0.6, i * 2.4, Math.sin(i * 2.4) * 0.6); add(lf);
  }

  // ---- ceiling lamp & interior lights ----
  const domeM = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffd9a0, emissiveIntensity: 0.9 });
  for (const z of [-2.0, 0.9]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
    dome.rotation.x = Math.PI; dome.position.set(0, CEIL, z); add(dome);
  }
  C.emissives.push({ m: domeM, base: 0.9, kind: 'dome' });
  const main = new THREE.PointLight(0xffc88a, 1.8, 7, 1.6); main.position.set(0, CEIL - 0.2, -1.0);
    const bedL = new THREE.PointLight(0xffb070, 1.2, 4, 1.8); bedL.position.set(0.3, 2.35, 2.2);
  const cabL = new THREE.PointLight(0xffbb80, 0.5, 3, 2); cabL.position.set(0, 2.05, -3.3);
  add(main, bedL, cabL);
  C.interiorLights = [{ l: main, base: 1.8 }, { l: bedL, base: 1.2 }, { l: cabL, base: 0.5 }];

  // ---- curtains ----
  const curtainM = pbr('rough_linen', { arm: false, color: 0xcaa878, repeat: 2, extra: { side: THREE.DoubleSide } });
  curtainM.transparent = false;
  curtainM.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x*55.0)*0.012 + sin(uTime*1.3+position.y*3.)*0.002;');
    sh.uniforms.uTime = U.uTime;
  };
  for (const w of WINDOWS) {
    const L = windowLocal(w);
    const cw = w.w + 0.1, ch = w.h + 0.1;
    const pieces = w.wall === 'T' ? 1 : 2;
    for (let k = 0; k < pieces; k++) {
      const geo = new THREE.PlaneGeometry(cw / pieces, ch, 40, 1);
      geo.translate((k === 0 ? 1 : -1) * cw / pieces / 2, 0, 0);
      const m = new THREE.Mesh(geo, curtainM); m.castShadow = true;
      const pivot = new THREE.Group();
      pivot.add(m);
      const inset = w.wall === 'T' ? (ROOF - CEIL) + 0.02 : 0.16;
      pivot.position.copy(L.p).addScaledVector(L.n, -inset);
      // local x across window, anchored at the pane edge
      const edge = (k === 0 ? -1 : 1) * cw / 2;
      if (w.wall === 'L') { pivot.rotation.y = Math.PI / 2; pivot.position.z += -edge; }
      else if (w.wall === 'R') { pivot.rotation.y = -Math.PI / 2; pivot.position.z += edge; }
      else if (w.wall === 'B') { pivot.rotation.y = Math.PI; pivot.position.x += -edge; }
      else if (w.wall === 'F') { pivot.position.x += edge; pivot.position.z += 0.25; pivot.position.y -= 0.02; }
      else { pivot.rotation.x = Math.PI / 2; pivot.position.x += edge; }
      pivot.userData = { pieces, win: w.id };
      I.add(pivot);
      C.curtains.push(pivot);
    }
  }
  setCurtains(0, true);
  occludeInterior(I);
}

// Interior is enclosed: hemisphere/env (unshadowed) light must be attenuated, otherwise the
// van looks roofless. Patch every interior material's indirect term with a shared factor.
export const uIntAmb = { value: 0.3 };
const prevIds = new Map();
function occludeInterior(root) {
  const done = new Set();
  root.traverse(o => {
    const m = o.material; if (!m || done.has(m) || !m.isMeshStandardMaterial) return; done.add(m);
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev && prev.call(m, sh, r);
      sh.uniforms.uIntAmb = uIntAmb;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uIntAmb;')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= uIntAmb; reflectedLight.indirectSpecular *= uIntAmb;');
    };
    // unique key per distinct pre-existing patch (string length could collide)
    if (prev && !prevIds.has(prev)) prevIds.set(prev, prevIds.size + 1);
    const key = 'int' + (prev ? prevIds.get(prev) : 0);
    m.customProgramCacheKey = () => key;
    m.needsUpdate = true;
  });
}

export function setCurtains(v, instant = false) {
  C.curtainTarget = v;
  if (instant) C.curtainLevel = v;
}

const _flick = rng(77);
export function updateCamper(dt) {
  const S = G.state;
  // curtains
  C.curtainLevel += ((C.curtainTarget ?? 0) - C.curtainLevel) * Math.min(1, dt * 3);
  for (const p of C.curtains) p.scale.x = 0.14 + 0.86 * C.curtainLevel;
  // interior lighting level
  const target = S.lightsOn && !S.hiding ? 1 : 0;
  C.lightLevel += (target - C.lightLevel) * Math.min(1, dt * 6);
  const flick = 0.85 + 0.15 * Math.sin(G.t * 13) * Math.sin(G.t * 7.3) + (_flick() - 0.5) * 0.08;
  for (const { l, base } of C.interiorLights) l.intensity = base * C.lightLevel * (S.battery > 0 ? 1 : 0);
  C.lantern.intensity = 1.6 * flick * C.lightLevel;
  for (const e of C.emissives) {
    let k = C.lightLevel;
    if (e.kind === 'lantern') k *= flick;
    if (e.kind === 'fairy') k *= 0.85 + 0.15 * Math.sin(G.t * 2.0);
    if (e.kind === 'porch') k = S.hiding ? 0 : (G.night > 0.3 ? 1 : 0.1);
    if (e.kind === 'dash') k = G.driving ? 1 : 0.15;
    e.m.emissiveIntensity = e.base * k;
  }
  C.porch.intensity = S.hiding ? 0 : 3 * G.night;
  // spotlight & headlights
  C.spot.intensity = S.spotOn ? 900 : 0;
  const hk = S.headOn || G.driving ? 1 : 0;
  C.heads.forEach(h => h.intensity = 350 * hk);
  C.headMat.emissiveIntensity = 6 * hk;
  // stove glow
  const cook = S.cooking > 0 ? 1 : 0;
  C.stove.forEach(m => m.emissiveIntensity = cook * (1.5 + Math.sin(G.t * 9) * 0.2));
  // clock
  if (G.frame % 30 === 0) drawClock();
  // wheel spin when driving
  if (C.wheels && G.driveSpeed) C.wheels.forEach(w => w.children.forEach(c => c.rotation.x -= G.driveSpeed * dt / 0.42));
}
