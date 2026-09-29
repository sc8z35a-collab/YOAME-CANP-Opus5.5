// Camper interior (v3): realistic kitchen block (recessed stainless sink, gas hob, drawers),
// built-in compressor fridge, detailed driver's cab (sculpted dash, instrument cluster, steering
// wheel with column & stalks, pedals, captain seats, door trims), upholstered dinette, bed,
// lockers with LED downlights, interior window frames, CC0 Poly Haven props.
// All coordinates are camper-local metres (x right, y up, -z = front). FLOOR = 0.72.
import { THREE, G, rng } from './core.js';
import { tex, pbr, canvasTex, glb } from './assets.js';
import { RoundedBoxGeometry } from './lib/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from './lib/addons/BufferGeometryUtils.js';

export const IN = { wheel: null, gauges: null, props: [], ready: null, envMats: [], hobFlames: [] };

// ---------------------------------------------------------------- geometry helpers
/** Box-project UVs in metres (so every texture keeps a real-world scale on any box size). */
export function boxUV(g, s = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) * s, y = p.getY(i) * s, z = p.getZ(i) * s;
    if (ax >= ay && ax >= az) uv.setXY(i, z, y); else if (ay >= az) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true; return g;
}
function rgeo(w, h, d, r = 0.01, seg = 2) {
  return boxUV(new RoundedBoxGeometry(w, h, d, seg, Math.max(0.0005, Math.min(r, w / 2.01, h / 2.01, d / 2.01))));
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
const rb = (w, h, d, mat, x, y, z, r = 0.01, seg = 2) => mesh(rgeo(w, h, d, r, seg), mat, x, y, z);
/** box from min/max corners */
const B = (x0, y0, z0, x1, y1, z1, mat, r = 0.006) => rb(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
function cyl(r0, r1, h, mat, seg = 24, open = false) { return mesh(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat); }
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s;
}
function ringShape(w, h, t, r) { const s = roundRect(w + 2 * t, h + 2 * t, r + t); s.holes.push(roundRect(w, h, r)); return s; }

// ---------------------------------------------------------------- canvas textures
function gaugeTex() { return canvasTex(512, 200, () => {}); }
export function drawGauges(speed = 0, rpm = 0, fuel = 0.7, on = 0.2) {
  if (!IN.gauges) return;
  const t = IN.gauges.material.map, c = t.userData.ctx, W = 512, H = 200;
  c.fillStyle = '#060708'; c.fillRect(0, 0, W, H);
  const dial = (cx, cy, R, max, step, val, label, unit) => {
    // bezel
    const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.08);
    g.addColorStop(0, '#15181b'); g.addColorStop(0.9, '#0b0c0e'); g.addColorStop(1, '#3a3d42');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.06, 0, 7); c.fill();
    c.strokeStyle = '#8c9197'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R * 1.04, 0, 7); c.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.lineCap = 'butt';
    for (let v = 0; v <= max + 1e-6; v += step / 2) {
      const a = a0 + (a1 - a0) * v / max, major = Math.abs(v / step - Math.round(v / step)) < 1e-3;
      c.strokeStyle = v > max * 0.82 && label === 'x1000rpm' ? '#ff5a3a' : `rgba(235,240,245,${0.55 + 0.45 * on})`;
      c.lineWidth = major ? 3.5 : 1.6;
      const r0 = major ? R * 0.78 : R * 0.86;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); c.stroke();
      if (major) {
        c.fillStyle = `rgba(235,240,245,${0.6 + 0.4 * on})`; c.font = `bold ${Math.round(R * 0.17)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(Math.round(v)), cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
      }
    }
    c.fillStyle = 'rgba(200,210,220,.7)'; c.font = `${Math.round(R * 0.12)}px sans-serif`; c.fillText(unit, cx, cy + R * 0.42);
    // needle
    const a = a0 + (a1 - a0) * Math.min(1, Math.max(0, val / max));
    c.strokeStyle = '#ff6a2a'; c.lineWidth = 4; c.lineCap = 'round';
    c.shadowColor = '#ff6a2a'; c.shadowBlur = 8 * on;
    c.beginPath(); c.moveTo(cx - Math.cos(a) * R * 0.14, cy - Math.sin(a) * R * 0.14); c.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); c.stroke();
    c.shadowBlur = 0; c.fillStyle = '#23262a'; c.beginPath(); c.arc(cx, cy, R * 0.1, 0, 7); c.fill();
  };
  dial(130, 100, 88, 7, 1, rpm, 'x1000rpm', 'x1000 r/min');
  dial(382, 100, 88, 160, 20, speed, 'km/h', 'km/h');
  // centre info display (odometer, fuel bar, time)
  c.fillStyle = '#0e1a22'; c.fillRect(226, 40, 60, 120);
  c.fillStyle = `rgba(120,210,255,${0.35 + 0.65 * on})`; c.font = 'bold 15px monospace'; c.textAlign = 'center';
  const hh = Math.floor(G.hour) % 24, mm = Math.floor((G.hour % 1) * 60);
  c.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 256, 60);
  c.fillText('D', 256, 84);
  for (let i = 0; i < 8; i++) { c.fillStyle = i < fuel * 8 ? `rgba(120,210,255,${0.35 + 0.65 * on})` : 'rgba(80,100,110,.35)'; c.fillRect(236, 150 - i * 7, 40, 5); }
  c.font = '10px monospace'; c.fillText('FUEL', 256, 98);
  t.needsUpdate = true;
}
function ventSlats() {
  return canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#0a0a0b'; c.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) { const g = c.createLinearGradient(0, y, 0, y + 7); g.addColorStop(0, '#3a3c40'); g.addColorStop(1, '#141517'); c.fillStyle = g; c.fillRect(4, y, w - 8, 6); }
  });
}
function speakerTex() {
  return canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#060607';
    for (let y = 6; y < h; y += 7) for (let x = 6 + ((y / 7) % 2) * 3.5; x < w; x += 7) { if (Math.hypot(x - 64, y - 64) < 58) { c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); } }
  });
}
function hvacTex() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#151618'; c.fillRect(0, 0, w, h);
    const knob = (x, lab, cols) => {
      const g = c.createLinearGradient(x - 22, 0, x + 22, 0); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      c.strokeStyle = g; c.lineWidth = 4; c.beginPath(); c.arc(x, 32, 24, Math.PI * 0.8, Math.PI * 2.2); c.stroke();
      c.fillStyle = '#8a9096'; c.font = '9px sans-serif'; c.textAlign = 'center'; c.fillText(lab, x, 60);
    };
    knob(40, 'TEMP', ['#3a7bff', '#ff4a2a']); knob(128, 'FAN', ['#777', '#ddd']); knob(216, 'MODE', ['#999', '#999']);
    c.fillStyle = '#ff9a3a'; c.fillRect(120, 4, 16, 3);
  });
}
function fridgePanelTex() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#121314'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8edf0'; c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillText('COMPRESSOR', 14, 38);
    c.fillStyle = '#2bd46a'; c.beginPath(); c.arc(200, 32, 5, 0, 7); c.fill();
    c.strokeStyle = '#6a6e72'; c.lineWidth = 2; c.beginPath(); c.arc(232, 32, 10, 0, 7); c.stroke();
  });
}
function screenTex() { return canvasTex(256, 128, () => {}); }

// ---------------------------------------------------------------- materials
function materials() {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const rep = (m, r) => { for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(r, r); m[k].needsUpdate = true; } return m; };
  // painted cabinetry (satin cream lacquer over birch ply — faint grain in the normal only)
  M.cab = std({ color: 0xe9e3d6, roughness: 0.52, normalMap: tex('plywood_nor_gl'), normalScale: new THREE.Vector2(0.12, 0.12) });
  M.cabEdge = rep(pbr('plywood', { color: 0xf0dcc0, normalScale: 0.5 }), 2);
  M.oak = rep(pbr('oak_veneer_01', { color: 0xe6c9a2, normalScale: 0.5 }), 1.1);          // worktop / table (oiled oak)
  M.oakDark = rep(pbr('oak_veneer_01', { color: 0x9a6e48, normalScale: 0.5 }), 1.1);
  M.wall = rep(pbr('ash_veneer', { color: 0xf1e7d8, normalScale: 0.35 }), 0.8);            // light ash wall boards
  M.tile = rep(pbr('long_white_tiles', { color: 0xf4f1ea, rough: 0.9, normalScale: 0.9 }), 1.6); // subway tile backsplash
  M.floorMat = rep(pbr('rubber_tiles', { color: 0x4a4b4d, normalScale: 0.6 }), 2.5);
  M.herring = rep(pbr('poly_wool_herringbone', { color: 0xb7a58a, normalScale: 0.9 }), 3.2); // dinette cushions
  M.seatFab = rep(pbr('poly_wool_herringbone', { color: 0x6c6a67, normalScale: 0.9 }), 3.5);// cab seats
  M.leather = rep(pbr('brown_leather', { color: 0x9a7456, normalScale: 0.7 }), 2.2);
  M.leatherDark = rep(pbr('brown_leather', { color: 0x3a3634, normalScale: 0.7 }), 2.5);
  M.linen = rep(pbr('rough_linen', { arm: false, color: 0xf3eee4 }), 2.2);
  M.duvet = rep(pbr('caban', { color: 0xc9a27a, normalScale: 0.8 }), 2.0);
  M.gingham = rep(pbr('gingham_check', { color: 0xffffff, normalScale: 0.6 }), 2.5);
  // grained dashboard plastic: leather grain normal at a tiny scale reads as moulded texture
  M.dash = std({ color: 0x2c2d30, roughness: 0.72, normalMap: tex('leather_white_nor_gl', { repeat: 7 }), normalScale: new THREE.Vector2(0.45, 0.45) });
  M.dashLight = std({ color: 0x5a5b5e, roughness: 0.65, normalMap: M.dash.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) });
  M.black = std({ color: 0x141517, roughness: 0.45 });
  M.rubber = std({ color: 0x0d0d0e, roughness: 0.9 });
  M.pianoBlack = phys({ color: 0x050506, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.grey = std({ color: 0x8e9195, roughness: 0.5 });
  M.headliner = rep(pbr('rough_linen', { arm: false, color: 0x8f8c88 }), 3);
  // metals (get a baked interior cube env later, so they reflect the cabin instead of the sky)
  M.steel = std({ color: 0xd3d7da, metalness: 1, roughness: 0.3, normalMap: tex('metal_plate_nor_gl', { repeat: 4 }), normalScale: new THREE.Vector2(0.04, 0.04) });
  M.chrome = std({ color: 0xe6e8ea, metalness: 1, roughness: 0.08 });
  M.brushed = std({ color: 0xb9bdc1, metalness: 1, roughness: 0.38 });
  M.alu = std({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.3 });
  M.castIron = std({ color: 0x1a1a1b, metalness: 0.6, roughness: 0.62 });
  M.fridgeFrame = std({ color: 0x1c1d1f, roughness: 0.4 });
  M.fridgeDoor = phys({ color: 0xbfc4c8, metalness: 0.85, roughness: 0.33, clearcoat: 0.4, clearcoatRoughness: 0.2,
    normalMap: tex('metal_plate_nor_gl', { repeat: 6 }), normalScale: new THREE.Vector2(0.03, 0.03) });
  M.glassLid = phys({ color: 0x9aa4a8, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.28, depthWrite: false });
  M.mirror = std({ color: 0xffffff, metalness: 1, roughness: 0.02 });
  M.ceramic = std({ color: 0xf2eee6, roughness: 0.18 });
  M.enamel = std({ color: 0x2f5a4c, roughness: 0.25 });
  IN.envMats.push(M.steel, M.chrome, M.brushed, M.alu, M.fridgeDoor, M.mirror, M.pianoBlack, M.ceramic, M.castIron, M.enamel);
  return M;
}

// ---------------------------------------------------------------- kitchen (right side, z -1.68..0.32)
const F = 0.72, XI = 1.08;             // interior floor / inner wall x
export const K = { top: F + 0.92, x0: 0.47, z0: -1.68, z1: 0.32, sink: { x: 0.8, z: -0.5, w: 0.34, l: 0.4, d: 0.17 }, hob: { x: 0.79, z: -1.3 } };

function worktop(M) {
  // oak worktop with an undermount sink cut-out (shape in (x, -z), extruded upward)
  const s = new THREE.Shape();
  s.moveTo(K.x0, -K.z1); s.lineTo(XI, -K.z1); s.lineTo(XI, -K.z0); s.lineTo(K.x0, -K.z0); s.lineTo(K.x0, -K.z1);
  const sk = K.sink, hole = roundRect(sk.w + 0.012, sk.l + 0.012, 0.045);
  hole.getPoints(6); // ensure curves built
  const hp = new THREE.Path(hole.getPoints(6).map(p => new THREE.Vector2(p.x + sk.x, p.y - sk.z)));
  s.holes.push(hp);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, K.top - 0.039, 0); g.computeVertexNormals(); boxUV(g, 1);
  return mesh(g, M.oak);
}

function sinkBowl(M) {
  const grp = new THREE.Group(), sk = K.sink, y0 = K.top - 0.039;
  // bowl walls: thin rounded-rect ring extruded downward
  const wallS = ringShape(sk.w, sk.l, 0.006, 0.04);
  const wg = new THREE.ExtrudeGeometry(wallS, { depth: sk.d, bevelEnabled: false, curveSegments: 6 });
  wg.rotateX(Math.PI / 2); // extrude toward -y
  const inner = new THREE.MeshStandardMaterial().copy(M.steel); inner.side = THREE.DoubleSide; inner.roughness = 0.34;
  IN.envMats.push(inner);
  const walls = mesh(wg, inner); walls.position.set(sk.x, y0 + 0.001, sk.z); grp.add(walls);
  // bottom (slightly dished toward the drain) with a brushed finish
  const bg = new THREE.ShapeGeometry(roundRect(sk.w + 0.004, sk.l + 0.004, 0.042), 6); bg.rotateX(-Math.PI / 2);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, -0.004 * (1 - Math.min(1, Math.hypot(x / (sk.w / 2), z / (sk.l / 2))))); }
  bg.computeVertexNormals();
  const bot = mesh(bg, M.brushed); bot.position.set(sk.x, y0 - sk.d, sk.z); grp.add(bot);
  // drain: chrome ring + dark strainer + cross
  const drain = cyl(0.036, 0.036, 0.004, M.chrome, 28); drain.position.set(sk.x, y0 - sk.d - 0.002, sk.z + 0.08); grp.add(drain);
  const hole = cyl(0.028, 0.028, 0.005, M.black, 24); hole.position.copy(drain.position); hole.position.y += 0.0005; grp.add(hole);
  for (const r of [0, Math.PI / 2]) { const bar = rb(0.052, 0.003, 0.005, M.chrome, sk.x, drain.position.y + 0.003, drain.position.z, 0.001); bar.rotation.y = r; grp.add(bar); }
  // overflow slot on the back wall
  const of = rb(0.004, 0.012, 0.05, M.black, sk.x + sk.w / 2 - 0.002, y0 - 0.035, sk.z, 0.004); grp.add(of);
  // fitted glass cover leaning? -> real campers hinge it; ours sits open against the wall (smoked glass)
  return grp;
}

function faucet(M) {
  const g = new THREE.Group(), sk = K.sink, T = K.top;
  const bx = XI - 0.075, bz = sk.z - 0.02;
  const base = cyl(0.024, 0.027, 0.03, M.chrome, 28); base.position.set(bx, T + 0.015, bz); g.add(base);
  const body = cyl(0.017, 0.019, 0.07, M.chrome, 24); body.position.set(bx, T + 0.065, bz); g.add(body);
  // gooseneck spout (tube along a smooth arc, reaching over the bowl)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(bx, T + 0.09, bz), new THREE.Vector3(bx, T + 0.17, bz), new THREE.Vector3(bx - 0.025, T + 0.215, bz),
    new THREE.Vector3(bx - 0.085, T + 0.22, bz), new THREE.Vector3(bx - 0.135, T + 0.19, bz), new THREE.Vector3(bx - 0.15, T + 0.155, bz)]);
  const tube = mesh(new THREE.TubeGeometry(curve, 48, 0.0105, 16, false), M.chrome); g.add(tube);
  const tip = cyl(0.0125, 0.0115, 0.022, M.chrome, 20); tip.position.set(bx - 0.15, T + 0.148, bz); g.add(tip);
  const aer = cyl(0.009, 0.009, 0.002, M.black, 16); aer.position.set(bx - 0.15, T + 0.1365, bz); g.add(aer);
  // single lever mixer handle on the side
  const hub = cyl(0.014, 0.014, 0.028, M.chrome, 20); hub.rotation.x = Math.PI / 2; hub.position.set(bx, T + 0.075, bz + 0.024); g.add(hub);
  const lever = rb(0.012, 0.008, 0.06, M.chrome, bx - 0.012, T + 0.088, bz + 0.05, 0.004); lever.rotation.x = -0.35; g.add(lever);
  return g;
}

function hob(M, C) {
  const g = new THREE.Group(), hb = K.hob, T = K.top;
  const W = 0.36, L = 0.52; // x, z
  // stainless tray with a pressed edge + black enamel inner well
  g.add(rb(W, 0.012, L, M.steel, hb.x, T + 0.006, hb.z, 0.006, 3));
  g.add(rb(W - 0.03, 0.004, L - 0.03, M.castIron, hb.x, T + 0.0125, hb.z, 0.002));
  C.stove = [];
  for (const dz of [-0.12, 0.12]) {
    const z = hb.z + dz, big = dz < 0;
    const rad = big ? 0.05 : 0.04;
    // burner crown (aluminium) + enamel cap
    const crown = cyl(rad, rad + 0.006, 0.014, M.alu, 28); crown.position.set(hb.x, T + 0.021, z); g.add(crown);
    const cap = cyl(rad - 0.012, rad - 0.008, 0.008, M.castIron, 28); cap.position.set(hb.x, T + 0.031, z); g.add(cap);
    // flame ring (blue, emissive when cooking) — ring of small cones around the crown
    const fm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x4a8cff, emissiveIntensity: 0, transparent: true, opacity: 0.85, depthWrite: false });
    const cone = new THREE.ConeGeometry(0.004, 0.018, 6); const parts = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; const c = cone.clone(); c.rotateZ(-0.6); c.rotateY(-a); c.translate(Math.cos(a) * (rad + 0.004), 0.009, Math.sin(a) * (rad + 0.004)); parts.push(c); }
    const flame = new THREE.Mesh(mergeGeometries(parts), fm); flame.position.set(hb.x, T + 0.022, z); flame.visible = false; g.add(flame);
    C.stove.push(fm); IN.hobFlames.push(flame);
    // cast-iron pan support: 4 arms + outer square
    const sup = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const arm = new THREE.BoxGeometry(0.075, 0.012, 0.008); arm.translate(rad + 0.045, 0.04, 0); arm.rotateY(a); sup.push(arm);
      const foot = new THREE.BoxGeometry(0.008, 0.028, 0.008); foot.translate(rad + 0.078, 0.027, 0); foot.rotateY(a); sup.push(foot);
    }
    const ring = new THREE.TorusGeometry(rad + 0.078, 0.004, 4, 32); ring.rotateX(Math.PI / 2); ring.translate(0, 0.014, 0); sup.push(ring);
    const s = mesh(mergeGeometries(sup), M.castIron); s.position.set(hb.x, T + 0.006, z); g.add(s);
    // control knob on the worktop front strip
    const kn = cyl(0.017, 0.019, 0.022, M.black, 24); kn.position.set(hb.x - W / 2 + 0.03, T + 0.024, z); g.add(kn);
    const kp = rb(0.004, 0.006, 0.026, M.chrome, hb.x - W / 2 + 0.03, T + 0.036, z, 0.002); g.add(kp);
    const ind = rb(0.006, 0.002, 0.002, M.chrome, hb.x - W / 2 + 0.012, T + 0.013, z, 0.0005); g.add(ind);
  }
  // igniter button
  const ig = cyl(0.008, 0.008, 0.01, M.grey, 16); ig.position.set(hb.x - W / 2 + 0.03, T + 0.017, hb.z); g.add(ig);
  // smoked-glass lid hinged at the back, folded up against the backsplash
  const lid = rb(0.006, 0.36, L - 0.01, new THREE.MeshPhysicalMaterial({ color: 0x1a1d1f, roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.55 }), hb.x + W / 2 - 0.004, T + 0.012 + 0.18, hb.z, 0.003);
  lid.rotation.z = 0.06; g.add(lid);
  for (const dz of [-L / 2 + 0.04, L / 2 - 0.04]) g.add(rb(0.012, 0.02, 0.03, M.chrome, hb.x + W / 2 - 0.006, T + 0.02, hb.z + dz, 0.003));
  return g;
}

function cabinetFronts(M, x, y0, y1, z0, z1, layout, handle = 'bar') {
  // layout: array of {h, kind:'drawer'|'door'} from the top; gaps 3mm, slab 18mm
  const g = new THREE.Group(), gap = 0.003, fx = x - 0.009;
  let y = y1;
  for (const cell of layout) {
    const h = cell.h === 'rest' ? y - y0 : cell.h;
    const doors = cell.split || 1;
    for (let k = 0; k < doors; k++) {
      const a = z0 + (z1 - z0) * k / doors + gap / 2, b = z0 + (z1 - z0) * (k + 1) / doors - gap / 2;
      g.add(B(fx - 0.009, y - h + gap / 2, a, fx + 0.009, y - gap / 2, b, M.cab, 0.004));
      // handle: brushed bar near the top edge (drawers centred, doors on the meeting edge)
      const hz = cell.kind === 'drawer' ? (a + b) / 2 : (doors === 2 ? (k === 0 ? b - 0.04 : a + 0.04) : b - 0.04);
      const hy = cell.kind === 'drawer' ? y - h / 2 : y - 0.06;
      const len = cell.kind === 'drawer' ? Math.min(0.16, (b - a) * 0.45) : 0.012;
      const hl = cell.kind === 'drawer' ? rb(0.012, 0.012, len, M.brushed, fx - 0.018, hy, hz, 0.005) : rb(0.012, 0.1, 0.012, M.brushed, fx - 0.018, hy - 0.04, hz, 0.005);
      g.add(hl);
      for (const e of cell.kind === 'drawer' ? [-1, 1] : [-1, 1]) {
        const post = cell.kind === 'drawer' ? rb(0.012, 0.008, 0.008, M.brushed, fx - 0.012, hy, hz + e * (len / 2 - 0.006), 0.002)
          : rb(0.012, 0.008, 0.008, M.brushed, fx - 0.012, hy - 0.04 + e * 0.044, hz, 0.002);
        g.add(post);
      }
    }
    y -= h;
  }
  return g;
}

export function buildKitchen(I, M, C) {
  const T = K.top;
  // carcass (plywood) recessed toe-kick + fronts
  I.add(B(0.53, F + 0.09, K.z0 + 0.01, XI, T - 0.04, K.z1 - 0.01, M.cabEdge, 0.002));
  I.add(B(0.6, F, K.z0 + 0.03, XI, F + 0.09, K.z1 - 0.03, M.black, 0.002));             // plinth
  I.add(cabinetFronts(M, 0.52, F + 0.095, T - 0.042, K.z0 + 0.01, -0.92, [{ h: 0.16, kind: 'drawer' }, { h: 0.27, kind: 'drawer' }, { h: 'rest', kind: 'drawer' }]));
  I.add(cabinetFronts(M, 0.52, F + 0.095, T - 0.042, -0.92, -0.08, [{ h: 'rest', kind: 'door', split: 2 }]));
  I.add(cabinetFronts(M, 0.52, F + 0.095, T - 0.042, -0.08, K.z1 - 0.01, [{ h: 0.12, kind: 'drawer' }, { h: 0.16, kind: 'drawer' }, { h: 0.2, kind: 'drawer' }, { h: 'rest', kind: 'drawer' }]));
  I.add(worktop(M));
  I.add(sinkBowl(M));
  I.add(faucet(M));
  I.add(hob(M, C));
  // backsplash: subway tile under the window + aluminium cap
  I.add(B(XI - 0.01, T, K.z0, XI, 1.83, K.z1, M.tile, 0.001));
  I.add(B(XI - 0.016, 1.826, K.z0, XI, 1.834, K.z1, M.alu, 0.002));
  // side panel at the door end (visible when entering)
  I.add(B(0.47, F, K.z1 - 0.012, XI, T - 0.04, K.z1 + 0.006, M.cabEdge, 0.003));
  // electric socket + USB plate on the backsplash
  const plate = rb(0.006, 0.07, 0.12, M.ceramic, XI - 0.013, T + 0.08, 0.12, 0.006); I.add(plate);
  for (const dz of [-0.025, 0.025]) { const s = cyl(0.008, 0.008, 0.004, M.black, 12); s.rotation.z = Math.PI / 2; s.position.set(XI - 0.017, T + 0.08, 0.12 + dz); I.add(s); }
  // 12V control panel near the door (water tank / battery gauges, switches)
  const pt = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#e9ebea'; c.fillRect(0, 0, w, h); c.fillStyle = '#0d1a22'; c.fillRect(12, 12, 150, 104);
    c.fillStyle = '#6fd3ff'; c.font = 'bold 22px monospace'; c.fillText('12.8V', 24, 48); c.font = '16px monospace'; c.fillText('H2O 72%', 24, 78); c.fillText('GREY 18%', 24, 102);
    for (let i = 0; i < 3; i++) { c.fillStyle = '#c9ccce'; c.fillRect(180, 16 + i * 36, 60, 26); c.fillStyle = i ? '#2bd46a' : '#ffb03a'; c.fillRect(186, 25 + i * 36, 8, 8); }
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ map: pt, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.25, roughness: 0.4 }));
  panel.position.set(XI - 0.011, T + 0.6, 0.22); panel.rotation.y = -Math.PI / 2; I.add(panel);
}

// ---------------------------------------------------------------- fridge column (right, z -2.55..-1.72)
export function buildFridge(I, M) {
  const x0 = 0.45, z0 = -2.55, z1 = -1.72, top = 2.4, fx = x0;             // front plane faces -x (aisle)
  // tall housing (painted ply) with side panels
  I.add(B(x0 + 0.02, F, z0, XI, top, z0 + 0.02, M.cab, 0.003));
  I.add(B(x0 + 0.02, F, z1 - 0.02, XI, top, z1, M.cab, 0.003));
  I.add(B(x0 + 0.06, F, z0 + 0.02, XI, top, z1 - 0.02, M.cabEdge, 0.002));   // carcass back/inside
  // lower cupboard (F+0.09..F+0.42) + plinth
  I.add(B(x0 + 0.08, F, z0 + 0.03, x0 + 0.12, F + 0.09, z1 - 0.03, M.black, 0.002));
  I.add(cabinetFronts(M, x0 + 0.02, F + 0.095, F + 0.43, z0 + 0.02, z1 - 0.02, [{ h: 'rest', kind: 'door' }]));
  // fridge: black moulded frame + brushed-silver door (fridge 0.52 wide x 1.08 high) with a freezer door on top
  const fz0 = z0 + 0.13, fz1 = z1 - 0.13, fy0 = F + 0.44, fy1 = F + 1.52;
  const fc = (fz0 + fz1) / 2, fw = fz1 - fz0;
  // frame (4 bars) — sits proud of the housing by 12mm, the doors sit inside it
  I.add(B(fx - 0.012, fy0 - 0.02, fz0 - 0.1, fx + 0.03, fy0 + 0.012, fz1 + 0.1, M.fridgeFrame, 0.004));
  I.add(B(fx - 0.012, fy1 - 0.012, fz0 - 0.1, fx + 0.03, fy1 + 0.07, fz1 + 0.1, M.fridgeFrame, 0.004));
  I.add(B(fx - 0.012, fy0, fz0 - 0.1, fx + 0.03, fy1, fz0 - 0.004, M.fridgeFrame, 0.004));
  I.add(B(fx - 0.012, fy0, fz1 + 0.004, fx + 0.03, fy1, fz1 + 0.1, M.fridgeFrame, 0.004));
  // control strip across the top bar (label + LED + dial)
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(fw * 0.8, 0.045), new THREE.MeshStandardMaterial({ map: fridgePanelTex(), roughness: 0.5, emissive: 0xffffff, emissiveMap: null }));
  cp.position.set(fx - 0.0125, fy1 + 0.03, fc); cp.rotation.y = -Math.PI / 2; I.add(cp);
  // doors: freezer (top 0.26) + fridge; slightly domed panel with 2mm shadow gap
  const door = (y0, y1) => {
    const d = rb(0.03, y1 - y0 - 0.004, fw - 0.004, M.fridgeDoor, fx - 0.004, (y0 + y1) / 2, fc, 0.01, 3);
    d.userData.env = 1; return d;
  };
  I.add(door(fy1 - 0.27, fy1)); I.add(door(fy0, fy1 - 0.274));
  I.add(B(fx - 0.006, fy1 - 0.276, fz0, fx + 0.001, fy1 - 0.27, fz1, M.fridgeFrame, 0.001));
  // latch handles: vertical black recessed grips on the aisle-facing, hinge on the cab side
  for (const [y, h] of [[fy1 - 0.135, 0.14], [fy0 + 0.62, 0.34]]) {
    I.add(rb(0.03, h, 0.034, M.fridgeFrame, fx - 0.03, y, fz1 - 0.035, 0.012, 3));
    I.add(rb(0.012, h - 0.04, 0.012, M.brushed, fx - 0.046, y, fz1 - 0.035, 0.005));
  }
  // ventilation grille strip below (compressor air intake)
  const vg = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.1, 0.05), new THREE.MeshStandardMaterial({ map: ventSlats(), roughness: 0.6 }));
  vg.position.set(fx - 0.013, fy0 - 0.005, fc); vg.rotation.y = -Math.PI / 2; I.add(vg);
  // upper locker above the fridge (microwave-height cupboard)
  I.add(cabinetFronts(M, x0 + 0.02, fy1 + 0.075, top - 0.005, z0 + 0.02, z1 - 0.02, [{ h: 'rest', kind: 'door' }]));
}

// ---------------------------------------------------------------- driver's cab
function dashProfile() {
  // (z, y) outline of the dash cross-section: windshield base -> top pad -> lip -> face -> footwell
  const s = new THREE.Shape();
  const P = [[-4.21, 1.44], [-4.05, 1.475], [-3.9, 1.505], [-3.8, 1.515], [-3.745, 1.5], [-3.715, 1.465], [-3.705, 1.38],
    [-3.71, 1.26], [-3.74, 1.16], [-3.82, 1.06], [-3.97, 0.98], [-4.21, 0.95]];
  const pts = new THREE.SplineCurve(P.map(p => new THREE.Vector2(-p[0], p[1]))).getPoints(64);
  s.setFromPoints(pts); return s;
}
export function buildCab(I, M, C) {
  const g = new THREE.Group(); g.name = 'cab';
  // ---- dash body: extruded profile across the cab
  const dg = new THREE.ExtrudeGeometry(dashProfile(), { depth: 2 * XI - 0.004, bevelEnabled: false, curveSegments: 1 });
  dg.rotateY(Math.PI / 2); // shape x(-z) -> world... (x -> -z after rotate), extrude z -> +x
  dg.translate(-XI + 0.002, 0, 0); dg.computeVertexNormals(); boxUV(dg, 1);
  g.add(mesh(dg, M.dash));
  // stitched soft pad along the top edge (slightly lighter)
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2 * XI - 0.01, 12), M.dashLight);
  lip.rotation.z = Math.PI / 2; lip.position.set(0, 1.49, -3.735); lip.castShadow = true; g.add(lip);
  // defrost vent slots along the windshield base
  const vs = ventSlats();
  for (const x of [-0.7, 0, 0.7]) { const v = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.04), new THREE.MeshStandardMaterial({ map: vs, roughness: 0.7 })); v.rotation.x = -Math.PI / 2 + 0.2; v.position.set(x, 1.467, -4.1); g.add(v); }
  // ---- instrument cluster on the dash face in front of the driver, under a moulded visor
  const bx = -0.55;
  g.add(rb(0.4, 0.05, 0.2, M.dash, bx, 1.5, -3.73, 0.022, 3));                       // visor
  for (const e of [-1, 1]) g.add(rb(0.03, 0.12, 0.1, M.dash, bx + e * 0.185, 1.44, -3.69, 0.012, 2)); // cheeks
  g.add(rb(0.37, 0.14, 0.03, M.black, bx, 1.405, -3.712, 0.02, 2));                   // recess back
  const gm = new THREE.MeshStandardMaterial({ map: gaugeTex(), emissive: 0xffffff, roughness: 0.35 });
  gm.emissiveMap = gm.map; gm.emissiveIntensity = 0.9;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.133), gm);
  gauges.position.set(bx, 1.405, -3.695); gauges.rotation.x = -0.12; g.add(gauges);
  IN.gauges = gauges; C.emissives.push({ m: gm, base: 0.9, kind: 'dash' });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.1, depthWrite: false }));
  lens.position.set(bx, 1.406, -3.688); lens.rotation.x = -0.12; lens.renderOrder = 3; g.add(lens); IN.envMats.push(lens.material);
  drawGauges(0, 0, 0.7, 0.3);
  // ---- steering column + wheel (face tilted ~34deg up toward the driver)
  const tilt = -0.6, n = new THREE.Vector3(0, Math.sin(-tilt), Math.cos(tilt)); // wheel normal (toward driver)
  const wc = new THREE.Vector3(bx, 1.64, -3.5);
  const along = d => wc.clone().addScaledVector(n, -d);
  const colP = along(0.14), col = rb(0.07, 0.07, 0.26, M.black, colP.x, colP.y, colP.z, 0.025, 3); col.rotation.x = tilt; g.add(col);
  const shP = along(0.19), shroud = rb(0.13, 0.11, 0.15, M.dash, shP.x, shP.y, shP.z, 0.04, 3); shroud.rotation.x = tilt; g.add(shroud);
  // stalks: indicator (left) + wiper (right) sticking out of the shroud
  for (const s of [-1, 1]) {
    const st = cyl(0.006, 0.008, 0.13, M.black, 10); st.rotation.z = Math.PI / 2 + s * 0.15; st.position.set(bx + s * 0.12, shP.y + 0.02, shP.z + 0.03); g.add(st);
    const tip = cyl(0.01, 0.01, 0.045, M.black, 12); tip.rotation.z = Math.PI / 2 + s * 0.15; tip.position.set(bx + s * 0.2, shP.y + 0.032, shP.z + 0.03); g.add(tip);
  }
  // ignition barrel on the shroud (right side)
  const ign = cyl(0.014, 0.014, 0.02, M.chrome, 16); ign.rotation.z = Math.PI / 2; ign.position.set(bx + 0.075, shP.y - 0.01, shP.z + 0.02); g.add(ign);
  const wheel = new THREE.Group(); wheel.position.copy(wc); wheel.rotation.x = tilt;
  const spin = new THREE.Group(); wheel.add(spin);
  const R = 0.2;
  // rim: leather-wrapped torus with slight thumb-grip bulges
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.017, 16, 72), M.leatherDark); rim.castShadow = true; spin.add(rim);
  // hub / airbag cover
  const hubG = new THREE.CylinderGeometry(0.07, 0.078, 0.05, 32); hubG.rotateX(Math.PI / 2);
  const hub = new THREE.Mesh(hubG, M.dash); hub.position.z = 0.012; spin.add(hub);
  const hubPad = rb(0.12, 0.09, 0.03, M.black, 0, 0, 0.03, 0.03, 4); spin.add(hubPad);
  const badge = cyl(0.014, 0.014, 0.003, M.chrome, 20); badge.rotation.x = Math.PI / 2; badge.position.z = 0.047; spin.add(badge);
  // three spokes (9, 3 and 6 o'clock) with button pads
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = rb(R - 0.06, 0.036, 0.018, M.dash, Math.cos(a) * (R / 2 + 0.03), Math.sin(a) * (R / 2 + 0.03), 0.008, 0.008);
    sp.rotation.z = a; spin.add(sp);
    if (a !== -Math.PI / 2) { const bt = rb(0.035, 0.025, 0.008, M.pianoBlack, Math.cos(a) * 0.105, 0.005, 0.02, 0.004); spin.add(bt); }
  }
  g.add(wheel); IN.wheel = spin;
  // ---- centre stack: head unit (radio) + HVAC + gear lever
  g.add(B(-0.17, 0.98, -3.9, 0.17, 1.47, -3.69, M.dash, 0.02));
  const hu = rb(0.26, 0.12, 0.02, M.pianoBlack, 0, 1.36, -3.69, 0.008, 2); hu.rotation.x = -0.12; g.add(hu);
  // radio display (camper.js drawRadio draws into C.radio.material.emissiveMap)
  const radioTex = canvasTex(256, 64, () => {});
  const radioM = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: radioTex, emissiveIntensity: 1.0, roughness: 0.2 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), radioM);
  scr.position.set(0, 1.375, -3.677); scr.rotation.x = -0.12; g.add(scr); C.radio = scr;
  for (const s of [-1, 1]) { const k = cyl(0.014, 0.014, 0.018, M.chrome, 20); k.rotation.x = Math.PI / 2 - 0.12; k.position.set(s * 0.115, 1.33, -3.672); g.add(k); }
  for (let i = 0; i < 5; i++) g.add(rb(0.03, 0.012, 0.006, M.black, -0.07 + i * 0.035, 1.315, -3.676, 0.003));
  const hv = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.065), new THREE.MeshStandardMaterial({ map: hvacTex(), roughness: 0.5 }));
  hv.position.set(0, 1.23, -3.685); g.add(hv);
  for (const s of [-1, 0, 1]) { const k = cyl(0.022, 0.024, 0.022, M.black, 24); k.rotation.x = Math.PI / 2; k.position.set(s * 0.086, 1.236, -3.675); g.add(k); }
  // central air vents (two) above the head unit
  for (const s of [-1, 1]) { const v = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshStandardMaterial({ map: vs, roughness: 0.7 })); v.position.set(s * 0.065, 1.44, -3.6885); g.add(v);
    g.add(B(s * 0.065 - 0.054, 1.406, -3.692, s * 0.065 + 0.054, 1.41, -3.686, M.chrome, 0.001)); }
  // outer vents (round) at both dash ends
  for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 8, 28), M.chrome); ring.position.set(s * 0.95, 1.4, -3.698); g.add(ring);
    const v = new THREE.Mesh(new THREE.CircleGeometry(0.042, 24), new THREE.MeshStandardMaterial({ map: vs, roughness: 0.7 })); v.position.set(s * 0.95, 1.4, -3.701); g.add(v); }
  // gear lever on the dash (van-style) with a leather gaiter
  const gaiter = cyl(0.028, 0.04, 0.045, M.leatherDark, 16); gaiter.rotation.x = 0.9; gaiter.position.set(-0.11, 1.1, -3.68); g.add(gaiter);
  const stick = cyl(0.007, 0.009, 0.12, M.brushed, 10); stick.rotation.x = 0.9; stick.position.set(-0.11, 1.137, -3.633); g.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), M.leatherDark); knob.scale.set(1, 1.15, 1); knob.position.set(-0.11, 1.178, -3.582); knob.castShadow = true; g.add(knob);
  // glove box (passenger) with a chrome pull + seam lines
  g.add(B(0.3, 1.2, -3.715, 0.88, 1.36, -3.7, M.dashLight, 0.012));
  g.add(rb(0.12, 0.018, 0.012, M.chrome, 0.59, 1.34, -3.696, 0.006));
  // cup holders (two recessed rings) on the passenger side dash top
  for (const x of [0.62, 0.74]) { const cu = cyl(0.036, 0.036, 0.004, M.black, 24); cu.position.set(x, 1.517, -3.81); g.add(cu); const r = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 6, 24), M.dashLight); r.rotation.x = Math.PI / 2; r.position.copy(cu.position); g.add(r); }
  // ---- footwell: pedals, dead-rest, floor mats
  g.add(B(-XI, F, -4.2, XI, F + 0.02, -3.0, M.rubber, 0.004));                          // rubber cab floor
  for (const [x, z0, z1] of [[-0.55, -3.95, -3.35], [0.55, -3.95, -3.35]]) {
    const mat = B(x - 0.26, F + 0.02, z0, x + 0.26, F + 0.03, z1, new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 1, normalMap: tex('knitted_fleece_nor_gl', { repeat: 6 }) }), 0.01); g.add(mat);
  }
  const pedal = (x, w, h, y, z, ang) => { const p = rb(w, h, 0.02, M.rubber, x, y, z, 0.008); p.rotation.x = ang; g.add(p);
    const arm = cyl(0.008, 0.008, 0.26, M.castIron, 8); arm.position.set(x, y + 0.13, z - 0.06); arm.rotation.x = -0.4; g.add(arm); };
  pedal(-0.62, 0.1, 0.08, F + 0.17, -3.84, -0.7);   // brake
  pedal(-0.42, 0.055, 0.2, F + 0.14, -3.86, -0.9);  // accelerator (organ)
  g.add(B(-0.86, F + 0.03, -3.95, -0.77, F + 0.2, -3.8, M.rubber, 0.01));               // dead pedal
  // engine tunnel / centre console box between the seats with storage & cupholders
  g.add(B(-0.2, F, -3.7, 0.2, F + 0.42, -3.05, M.dash, 0.04));
  g.add(B(-0.18, F + 0.42, -3.66, 0.18, F + 0.435, -3.09, M.dashLight, 0.01));
  for (const z of [-3.55, -3.45]) { const cu = cyl(0.036, 0.036, 0.004, M.black, 24); cu.position.set(0, F + 0.437, z); g.add(cu); }
  // handbrake lever
  const hb = rb(0.035, 0.03, 0.2, M.black, -0.22, F + 0.5, -3.3, 0.012); hb.rotation.x = 0.35; g.add(hb);
  // ---- captain seats (swivel) — driver + passenger
  for (const sx of [-0.55, 0.55]) g.add(seat(M, sx, sx < 0 ? 1 : -1));
  // ---- door cards on both cab sides
  for (const s of [-1, 1]) doorCard(g, M, s);
  // ---- A-pillar trims, header with sun visors, grab handle
  for (const s of [-1, 1]) {
    const ap = rb(0.08, 0.8, 0.07, M.dashLight, s * (XI - 0.03), 1.83, -4.18, 0.03, 3); ap.rotation.x = -0.15; ap.rotation.z = s * 0.1; g.add(ap);
    const vis = rb(0.46, 0.018, 0.17, M.headliner, s * 0.52, 2.155, -4.07, 0.008, 3); vis.rotation.x = 0.05; g.add(vis);
    g.add(rb(0.02, 0.014, 0.02, M.grey, s * 0.28, 2.162, -4.13, 0.004));
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), M.mirror); mir.rotation.x = Math.PI / 2 + 0.05; mir.position.set(s * 0.52, 2.145, -4.07); g.add(mir);
    // grab handle on the A-pillar (entry help)
    const gh = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), M.black); gh.rotation.set(0, s * Math.PI / 2, Math.PI / 2); gh.position.set(s * (XI - 0.03), 1.7, -3.95); g.add(gh);
  }
  // header trim under the alcove (padded headliner) + map light
  g.add(B(-XI, 2.165, -4.2, XI, 2.175, -2.9, M.headliner, 0.004));
  const ml = rb(0.2, 0.025, 0.09, M.dashLight, 0, 2.152, -3.4, 0.01); g.add(ml);
  const mlL = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 0.6 }));
  mlL.rotation.x = Math.PI / 2; mlL.position.set(-0.05, 2.139, -3.4); g.add(mlL); C.emissives.push({ m: mlL.material, base: 0.6, kind: 'led' });
  I.add(g);
  return g;
}

function seat(M, sx, inward) {
  const s = new THREE.Group(), y0 = F; s.position.set(sx, 0, 0);
  // swivel console + base
  s.add(B(-0.2, y0, -3.52, 0.2, y0 + 0.3, -3.08, M.dash, 0.03));
  s.add(cyl(0.16, 0.18, 0.04, M.castIron, 24).translateY(y0 + 0.32).translateZ(-3.3));
  // cushion: fabric centre with leather side bolsters
  s.add(rb(0.34, 0.1, 0.5, M.seatFab, 0, y0 + 0.43, -3.33, 0.045, 4));
  for (const e of [-1, 1]) s.add(rb(0.1, 0.13, 0.5, M.leatherDark, e * 0.22, y0 + 0.435, -3.33, 0.045, 4));
  s.add(rb(0.52, 0.09, 0.08, M.leatherDark, 0, y0 + 0.44, -3.6, 0.04, 4));             // front roll
  // backrest (reclined ~12°) as a group so bolsters follow the angle
  const back = new THREE.Group(); back.position.set(0, y0 + 0.48, -3.07); back.rotation.x = 0.2; s.add(back);
  back.add(rb(0.34, 0.62, 0.1, M.seatFab, 0, 0.34, -0.02, 0.045, 4));
  for (const e of [-1, 1]) { const bo = rb(0.1, 0.62, 0.15, M.leatherDark, e * 0.22, 0.34, 0.0, 0.05, 4); bo.rotation.y = -e * 0.18; back.add(bo); }
  back.add(rb(0.54, 0.62, 0.05, M.leatherDark, 0, 0.34, 0.07, 0.03, 3));                // shell back
  // headrest on two chrome posts
  for (const e of [-1, 1]) { const p = cyl(0.0065, 0.0065, 0.1, M.chrome, 10); p.position.set(e * 0.08, 0.7, 0.02); back.add(p); }
  back.add(rb(0.28, 0.17, 0.1, M.seatFab, 0, 0.8, 0.02, 0.045, 4));
  // fold-down armrest on the inboard side
  const ar = rb(0.06, 0.07, 0.34, M.leatherDark, inward * 0.3, y0 + 0.66, -3.25, 0.03, 3); s.add(ar);
  // seat belt (webbing from the B-pillar to the outboard buckle)
  const ox = -inward * 0.3;
  const belt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(ox * 1.62, y0 + 1.32, -2.97), new THREE.Vector3(ox * 1.35, y0 + 1.05, -2.99), new THREE.Vector3(ox * 1.08, y0 + 0.55, -3.08)]), 16, 0.006, 4), M.black);
  belt.scale.set(1, 1, 1); s.add(belt);
  s.add(rb(0.035, 0.07, 0.03, M.chrome, ox * 1.62, y0 + 1.33, -2.965, 0.006));          // height adjuster / guide
  s.add(rb(0.03, 0.08, 0.045, M.black, ox * 1.08, y0 + 0.52, -3.09, 0.01));             // buckle stalk
  return s;
}

function doorCard(g, M, s) {
  const x = s * (XI - 0.012), z0 = -4.15, z1 = -3.0;
  g.add(B(x - 0.012, F + 0.08, z0, x + 0.012, 1.58, z1, M.dashLight, 0.02));
  // armrest + pull handle
  g.add(rb(0.06, 0.05, 0.5, M.dash, x - s * 0.035, 1.32, -3.45, 0.02, 3));
  g.add(rb(0.02, 0.03, 0.14, M.chrome, x - s * 0.02, 1.45, -3.75, 0.008));
  g.add(rb(0.018, 0.05, 0.1, M.black, x - s * 0.016, 1.45, -3.75, 0.008));
  // window / mirror switches on the armrest
  for (let i = 0; i < 2; i++) g.add(rb(0.012, 0.012, 0.03, M.pianoBlack, x - s * 0.06, 1.35, -3.57 + i * 0.045, 0.004));
  // speaker grille + door pocket
  const sp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 28), new THREE.MeshStandardMaterial({ map: speakerTex(), roughness: 0.8 }));
  sp.rotation.y = -s * Math.PI / 2; sp.position.set(x - s * 0.0125, F + 0.32, -3.85); g.add(sp);
  g.add(B(Math.min(x - s * 0.1, x), F + 0.12, -3.7, Math.max(x - s * 0.1, x), F + 0.26, -3.1, M.dash, 0.02));
  // top rail (window sill) in dark grain
  g.add(B(x - 0.03, 1.56, z0, x + 0.012, 1.6, z1, M.dash, 0.012));
}

// ---------------------------------------------------------------- dinette (left, facing benches + table)
function cushion(w, h, d, mat, r = 0.04) {
  // upholstered cushion (centred at origin) with piping along the long top edges
  const g = new THREE.Group();
  g.add(rb(w, h, d, mat, 0, 0, 0, r, 4));
  for (const s of [-1, 1]) {
    const t = cyl(0.005, 0.005, w - 2 * r, PIPING, 6); t.rotation.z = Math.PI / 2; t.position.set(0, h / 2 - 0.012, s * (d / 2 - 0.004)); g.add(t);
  }
  return g;
}
const PIPING = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.8 });
export function buildDinette(I, M) {
  const x0 = -XI, x1 = -0.35;
  const bench = (z0, z1, backAtFront) => {
    I.add(B(x0, F + 0.06, z0, x1 - 0.02, F + 0.4, z1, M.cab, 0.004));                      // box
    I.add(B(x0, F, z0 + 0.02, x1 - 0.06, F + 0.06, z1 - 0.02, M.black, 0.002));             // toe recess
    I.add(B(x1 - 0.02, F + 0.08, z0 + 0.03, x1, F + 0.38, z1 - 0.03, M.cab, 0.006));        // storage door
    I.add(rb(0.012, 0.012, 0.12, M.brushed, x1 + 0.008, F + 0.33, (z0 + z1) / 2, 0.005));
    I.add(B(x0, F + 0.395, z0, x1 + 0.005, F + 0.415, z1, M.oak, 0.004));                   // seat board lip
    const c = cushion(x1 - x0 - 0.02, 0.11, z1 - z0 - 0.03, M.herring);
    c.position.set((x0 + x1) / 2, F + 0.47, (z0 + z1) / 2 + (backAtFront ? 0.03 : -0.03)); I.add(c);
    const bk = cushion(x1 - x0 - 0.02, 0.5, 0.1, M.herring);
    bk.position.set((x0 + x1) / 2, F + 0.8, backAtFront ? z0 + 0.075 : z1 - 0.075);
    bk.rotation.x = backAtFront ? -0.1 : 0.1; I.add(bk);
    const fz = backAtFront ? z0 : z1 - 0.03;                                                  // backrest frame
    I.add(B(x0, F + 0.4, fz, x1, F + 1.12, fz + 0.03, M.cab, 0.006));
    I.add(B(x0, F + 1.1, fz - 0.005, x1 + 0.01, F + 1.135, fz + 0.035, M.oak, 0.008));
  };
  bench(-2.45, -1.9, true);
  bench(-0.3, 0.25, false);
  // table: oiled oak slab on a chrome pedestal + wall rail
  const tx0 = x0 + 0.02, tx1 = -0.42, tz0 = -1.78, tz1 = -0.42;
  I.add(rb(tx1 - tx0, 0.032, tz1 - tz0, M.oak, (tx0 + tx1) / 2, F + 0.724, (tz0 + tz1) / 2, 0.012, 3));
  const post = cyl(0.03, 0.03, 0.66, M.chrome, 24); post.position.set(-0.78, F + 0.37, -1.1); I.add(post);
  const foot = cyl(0.13, 0.15, 0.012, M.chrome, 32); foot.position.set(-0.78, F + 0.006, -1.1); I.add(foot);
  const flange = cyl(0.08, 0.08, 0.012, M.chrome, 32); flange.position.set(-0.78, F + 0.702, -1.1); I.add(flange);
  I.add(B(-XI, F + 0.66, tz0 + 0.05, -XI + 0.02, F + 0.7, tz1 - 0.05, M.alu, 0.004));
  const run = new THREE.Mesh(new THREE.PlaneGeometry(0.28, tz1 - tz0 - 0.2), M.gingham);
  run.rotation.x = -Math.PI / 2; run.position.set(-0.72, F + 0.7415, (tz0 + tz1) / 2); run.receiveShadow = true; I.add(run);
}

// ---------------------------------------------------------------- wardrobe, bed, lockers
const ZB_I = 3.08;
export function buildRear(I, M) {
  // wet bath / wardrobe block (left, behind the dinette): painted panels, oak-framed door, mirror
  I.add(B(-XI, F, 0.35, -0.2, 2.72, 1.45, M.cab, 0.006));
  I.add(B(-0.21, F + 0.06, 0.42, -0.186, 2.64, 1.38, M.cab, 0.006));
  for (const [z0, z1, y0, y1] of [[0.42, 0.45, F + 0.06, 2.64], [1.35, 1.38, F + 0.06, 2.64], [0.42, 1.38, 2.61, 2.64], [0.42, 1.38, F + 0.06, F + 0.09]])
    I.add(B(-0.19, y0, z0, -0.18, y1, z1, M.oak, 0.003));
  I.add(rb(0.02, 0.018, 0.12, M.brushed, -0.168, F + 1.05, 0.52, 0.007));
  const rose = cyl(0.022, 0.022, 0.014, M.brushed, 20); rose.rotation.z = Math.PI / 2; rose.position.set(-0.173, F + 1.05, 0.46); I.add(rose);
  const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), M.mirror); mir.rotation.y = Math.PI / 2; mir.position.set(-0.1795, F + 1.5, 0.92); I.add(mir);
  // bed platform with drawers + oak nosing
  I.add(B(-XI, F, 1.52, XI, F + 0.52, ZB_I, M.cab, 0.004));
  for (const [x0, x1] of [[-0.9, -0.33], [-0.3, 0.3], [0.33, 0.9]]) {
    I.add(B(x0, F + 0.1, 1.495, x1, F + 0.48, 1.52, M.cab, 0.005));
    I.add(rb(0.12, 0.012, 0.012, M.brushed, (x0 + x1) / 2, F + 0.43, 1.485, 0.005));
  }
  I.add(B(-XI, F + 0.5, 1.49, XI, F + 0.535, 1.54, M.oak, 0.008));
  I.add(B(-XI, F, 1.51, XI, F + 0.08, 1.54, M.black, 0.002));
  // mattress (fitted sheet), duvet draped over the edges, pillows
  I.add(rb(2.14, 0.18, 1.52, M.linen, 0, F + 0.625, 2.31, 0.07, 4));
  const bl = new THREE.PlaneGeometry(2.14, 1.16, 56, 30); bl.rotateX(-Math.PI / 2);
  const bp = bl.attributes.position; const R = rng(4);
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const edge = Math.max(0, Math.abs(x) - 1.0);
    const fold = Math.exp(-Math.pow((z + 0.5) * 7, 2)) * 0.03;               // turned-down fold at the head end
    bp.setY(i, Math.sin(x * 7 + z * 3) * 0.012 + Math.sin(z * 11 + x * 2) * 0.008 + (R() - 0.5) * 0.003 + fold - edge * 2.4);
    if (edge > 0) bp.setX(i, Math.sign(x) * (1.0 + edge * 0.2));
  }
  bl.computeVertexNormals(); boxUV(bl, 1);
  const dm = M.duvet.clone(); dm.side = THREE.DoubleSide;
  I.add(mesh(bl, dm, 0, F + 0.735, 2.5));
  for (const sx of [-0.5, 0.5]) { const p = rb(0.6, 0.13, 0.36, M.linen, sx, F + 0.78, 1.76, 0.065, 5); p.rotation.x = -0.12; I.add(p); }
  // headboard shelf (rear wall) with an oak lip
  I.add(B(-XI, F + 0.95, ZB_I - 0.16, XI, F + 0.975, ZB_I, M.oak, 0.006));
}

export function buildLockers(I, M, C) {
  // overhead lockers: painted doors, oak grip band, chrome push-locks, LED pucks underneath
  const lockers = [[-1, -2.55, -0.3], [1, -1.65, 0.3], [-1, 1.5, 2.1], [1, 1.5, 2.1]];
  const puckM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 1.6 });
  C.emissives.push({ m: puckM, base: 1.6, kind: 'led' });
  for (const [sgn, z0, z1] of lockers) {
    const xa = sgn < 0 ? -XI : XI - 0.34, xb = sgn < 0 ? -XI + 0.34 : XI;
    I.add(B(xa, 2.4, z0, xb, 2.745, z1, M.cabEdge, 0.004));
    const n = Math.max(1, Math.round((z1 - z0) / 0.55)), fx = sgn < 0 ? xb : xa;
    for (let k = 0; k < n; k++) {
      const a = z0 + (z1 - z0) * k / n + 0.004, b = z0 + (z1 - z0) * (k + 1) / n - 0.004;
      I.add(B(fx - 0.009, 2.415, a, fx + 0.009, 2.735, b, M.cab, 0.006));
      I.add(B(fx - 0.011, 2.402, a, fx + 0.011, 2.42, b, M.oak, 0.004));
      const btn = cyl(0.011, 0.011, 0.012, M.chrome, 16); btn.rotation.z = Math.PI / 2; btn.position.set(fx - sgn * 0.012, 2.69, (a + b) / 2); I.add(btn);
    }
    for (let z = z0 + 0.3; z < z1 - 0.1; z += 0.6) {
      const p = cyl(0.03, 0.03, 0.006, puckM, 20); p.position.set((xa + xb) / 2, 2.397, z); I.add(p);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.003, 6, 20), M.brushed); r.rotation.x = Math.PI / 2; r.position.copy(p.position); I.add(r);
    }
  }
}

// ---------------------------------------------------------------- interior window surrounds
export function buildWindowFrames(I, WINDOWS, windowLocal) {
  const frameM = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.55 });
  const blindM = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.8 });
  for (const w of WINDOWS) {
    if (w.wall === 'T' || w.wall === 'F') continue;
    const g = new THREE.ExtrudeGeometry(ringShape(w.w, w.h, 0.05, 0.07), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6 });
    const grp = new THREE.Group();
    grp.add(mesh(g, frameM));
    grp.add(rb(w.w + 0.1, 0.045, 0.04, blindM, 0, w.h / 2 + 0.075, 0.02, 0.012, 2));      // blind cassette
    const L = windowLocal(w);
    grp.position.copy(L.p).addScaledVector(L.n, -0.14);
    if (w.wall === 'L') grp.rotation.y = Math.PI / 2;
    else if (w.wall === 'R') grp.rotation.y = -Math.PI / 2;
    else if (w.wall === 'B') grp.rotation.y = Math.PI;
    I.add(grp);
  }
  for (const w of WINDOWS.filter(x => x.wall === 'T')) {
    const g = new THREE.ExtrudeGeometry(ringShape(w.w, w.h, 0.06, 0.05), { depth: 0.015, bevelEnabled: false, curveSegments: 4 }); g.rotateX(Math.PI / 2);
    const m = mesh(g, frameM); m.position.set(w.c[0], 2.752, w.c[1]); I.add(m);
  }
}

// ---------------------------------------------------------------- CC0 props (Poly Haven)
const PROPS = [
  // name, position (surface point), rotY, scale
  ['vintage_electric_kettle', [0.8, K.top + 0.046, K.hob.z + 0.12], 1.9, 0.6],
  ['pot_enamel_01', [0.79, K.top + 0.046, K.hob.z - 0.12], 0.4, 0.8],
  ['wooden_cutting_board', [0.8, K.top, -0.86], Math.PI / 2, 0.7],
  ['potted_plant_02', [0.93, K.top, 0.18], 0.8, 0.3],
  ['tea_set_01', [-0.74, F + 0.741, -1.08], Math.PI / 2, 0.5],
  ['wooden_bowl_01', [-0.92, F + 0.741, -0.62], 0, 0.6],
  ['binoculars', [0.5, 1.515, -3.95], 2.6, 1.0],
  ['throw_pillows_01', [0.0, F + 0.72, 1.9], Math.PI, 0.6],
  ['wicker_basket_01', [0.55, 2.38, -3.75], 0.3, 0.9],
  ['vintage_oil_lamp', [0.85, F + 0.975, 3.0], 0, 0.34],
];
export function loadProps(I) {
  return Promise.all(PROPS.map(async ([name, p, ry, s]) => {
    try {
      const g = await glb(name);
      const o = g.scene.clone(true);
      o.scale.setScalar(s); o.rotation.y = ry; o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);          // sit the lowest point on the surface
      const c = bb.getCenter(new THREE.Vector3());
      o.position.set(p[0] - c.x, p[1] - bb.min.y, p[2] - c.z);
      o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material.metalness > 0.3) IN.envMats.push(m.material); } });
      o.name = 'prop:' + name; I.add(o); IN.props.push(o);
      return o;
    } catch (e) { console.warn('prop', name, e.message); }
  }));
}

// ---------------------------------------------------------------- baked interior reflections
let cubeRT = null;
/** Render a cube map from inside the cabin so chrome / steel / glossy parts reflect the interior,
 *  not the open sky. Call after assets load (and again whenever it matters, e.g. lights toggled). */
export function bakeInteriorEnv(renderer, scene, camperGroup) {
  if (!renderer || !camperGroup) return;
  if (!cubeRT) cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 60, cubeRT);
  cam.position.set(0.1, 1.75, -1.0); camperGroup.add(cam); camperGroup.updateMatrixWorld(true);
  for (const m of IN.envMats) m.envMap = null;
  cam.update(renderer, scene);
  camperGroup.remove(cam);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromCubemap(cubeRT.texture).texture; pm.dispose();
  for (const m of IN.envMats) { m.envMap = env; m.envMapIntensity = 1; m.userData.ownEnv = true; m.needsUpdate = true; }
  IN.env = env;
}

export function updateInterior(dt, S, lightLevel) {
  // steering wheel follows the front-wheel steer angle (~14:1 → about ±1.5 turns lock to lock)
  if (IN.wheel) IN.wheel.rotation.z += ((-(G.steerAngle || 0) * 9) - IN.wheel.rotation.z) * Math.min(1, dt * 10);
  IN.gT = (IN.gT || 0) - dt;
  if (IN.gT <= 0 && IN.gauges) {
    IN.gT = 0.1;
    const v = Math.abs(G.driveSpeed || 0) * 3.6, on = G.driving ? 1 : 0.25;
    IN.rpm = (IN.rpm || 0) + (((G.driving ? 0.8 : 0) + v / 38) - (IN.rpm || 0)) * 0.3;
    drawGauges(v, G.driving ? IN.rpm : 0, 0.72, on);
  }
  const cook = S.cooking > 0;
  IN.hobFlames.forEach((f, i) => { f.visible = cook; if (cook) f.scale.y = 0.85 + Math.sin(G.t * 23 + i * 2) * 0.15; });
  const k = 0.25 + 0.75 * Math.max(lightLevel, G.daylight ?? 1);
  for (const m of IN.envMats) if (m.userData.ownEnv) m.envMapIntensity = k;
}

/** Build everything. Returns the materials so camper.js can reuse them (walls, curtains…). */
export function buildInteriorV3(I, C, WINDOWS, windowLocal) {
  const M = materials();
  buildKitchen(I, M, C);
  buildFridge(I, M);
  buildCab(I, M, C);
  buildDinette(I, M);
  buildRear(I, M);
  buildLockers(I, M, C);
  buildWindowFrames(I, WINDOWS, windowLocal);
  IN.ready = loadProps(I);
  return M;
}
