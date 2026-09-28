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
