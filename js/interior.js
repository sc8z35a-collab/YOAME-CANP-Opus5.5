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
