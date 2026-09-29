// Tablet: a physical tablet mounted on the dashboard (3D mesh with a live canvas map), which the
// player picks up to open the full-screen map UI. On the map you tap one of the destinations and
// start the autopilot.
//
// Map rendering (v3, high resolution):
//  - base raster baked ONCE at 2048 px (≈4.3 px/m): hypsometric tint, multi-directional
//    hillshade, 5 m contours (25 m index contours), creek, forest texture
//  - everything else is VECTOR, drawn every frame in screen pixels at the device pixel ratio, so
//    roads, labels and icons stay razor sharp at any zoom: road casings, bridges, fords,
//    planned route, destinations (labels with collision avoidance), hazards, scale bar, compass
import { THREE, G, bus, clamp, noise2 } from './core.js';
import { ROADS, DESTS, NODES } from './roads.js';
import { WORLD, creekX } from './relief.js';
import { heightAt } from './terrain.js';
import { AP, engage, disengage } from './autopilot.js';
import { VEH, originOf } from './vehicle.js';

export const TAB = { mesh: null, tex: null, canvas: null, open: false, sel: null, base: null, zoom: 1, cu: 512, cv: 512, labels: true, sort: 'near' };
const MAP = 2048, PXM = MAP / WORLD.size, _tp = new THREE.Vector3();
// north (+z) is up on the map
const toMap = (x, z) => [(x - WORLD.x0) * PXM, (WORLD.z1 - z) * PXM];
const fromMap = (u, v) => [WORLD.x0 + u / PXM, WORLD.z1 - v / PXM];
const ROAD_NAMES = Object.fromEntries(ROADS.map(r => [r.id, r.name]));

// ---------------------------------------------------------------- base map (baked once)
// Baked incrementally (a band of rows per frame) so loading never stalls: ~2 s of work spread
// over the first seconds of play. The map shows the rows that are finished so far.
const BK = { j: 0, H: null, img: null, x: null, done: false };
function bakeBase() {
  const c = document.createElement('canvas'); c.width = c.height = MAP;
  const x = c.getContext('2d');
  TAB.base = c;
  if (!x || !x.createImageData) { BK.done = true; return; }
  BK.x = x; BK.img = x.createImageData(MAP, MAP); BK.H = new Float32Array(MAP * MAP); BK.j = 0;
  // height range from a coarse pass
  let hmin = 1e9, hmax = -1e9;
  for (let j = 0; j < MAP; j += 16) for (let i = 0; i < MAP; i += 16) { const [wx, wz] = fromMap(i, j), h = heightAt(wx, wz); if (h < hmin) hmin = h; if (h > hmax) hmax = h; }
  TAB.hmin = hmin; TAB.hmax = hmax;
}
const PAL = [[0, [86, 122, 84]], [0.2, [98, 134, 88]], [0.45, [128, 146, 96]], [0.7, [162, 150, 112]], [0.88, [176, 166, 150]], [1, [206, 202, 196]]];
const pal = t => { for (let k = 1; k < PAL.length; k++) if (t <= PAL[k][0]) { const [a, A] = PAL[k - 1], [b, B] = PAL[k], f = (t - a) / (b - a); return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; } return PAL[PAL.length - 1][1]; };
const LIGHTS = [[-0.6, 0.6, 1], [-0.1, 0.8, 0.45], [-0.9, -0.1, 0.35]].map(([lx, ly, w]) => { const n = Math.hypot(lx, ly, 1); return [lx / n, ly / n, 1 / n, w]; });
function hrow(j) { const H = BK.H; if (j < 0 || j >= MAP || H[j * MAP + 1] !== 0 || H[j * MAP] !== 0) return; for (let i = 0; i < MAP; i++) { const [wx, wz] = fromMap(i + 0.5, j + 0.5); H[j * MAP + i] = heightAt(wx, wz) || 1e-6; } }
/** bake up to `ms` milliseconds of rows */
export function bakeStep(ms = 6) {
  if (BK.done || !BK.H) return true;
  const t0 = performance.now(), H = BK.H, d = BK.img.data, e = 1 / PXM, { hmin, hmax } = TAB;
  const j0 = BK.j;
  while (BK.j < MAP && performance.now() - t0 < ms) {
    const j = BK.j; hrow(j - 1); hrow(j); hrow(j + 1);
    if (j > 0 && j < MAP - 1) for (let i = 1; i < MAP - 1; i++) {
      const k = j * MAP + i, h = H[k];
      const dx = (H[k + 1] - H[k - 1]) / (2 * e), dy = (H[k - MAP] - H[k + MAP]) / (2 * e);
      const nl = Math.hypot(dx, dy, 1), nx = -dx / nl, ny = -dy / nl, nz = 1 / nl;
      let sh = 0, wsum = 0; for (const [lx, ly, lz, w] of LIGHTS) { sh += Math.max(0, nx * lx + ny * ly + nz * lz) * w; wsum += w; }
      sh = 0.35 + 0.8 * sh / wsum;
      let [r, g, b] = pal(clamp((h - hmin) / (hmax - hmin)));
      const [wx, wz] = fromMap(i, j);
      const f = noise2(wx * 0.35, wz * 0.35) * 0.5 + noise2(wx * 1.1, wz * 1.1) * 0.5;
      r *= 0.92 + f * 0.08; g *= 0.94 + f * 0.1; b *= 0.92 + f * 0.06;
      const slope = Math.hypot(dx, dy); if (slope > 0.8) { const t = clamp((slope - 0.8) * 1.5); r += (150 - r) * t; g += (140 - g) * t; b += (130 - b) * t; }
      const cd = Math.abs(wx - creekX(wz));
      if (cd < 2.6) { r = 74; g = 140; b = 196; sh = 0.9 + sh * 0.1; } else if (cd < 3.4) { r = 60; g = 104; b = 140; }
      const c5 = Math.floor(h / 5), cR = Math.floor(H[k + 1] / 5), cD = Math.floor(H[k + MAP] / 5);
      let line = 0; if (c5 !== cR || c5 !== cD) line = (Math.max(c5, cR, cD) % 5 === 0) ? 0.5 : 0.24;
      d[k * 4] = r * sh * (1 - line); d[k * 4 + 1] = g * sh * (1 - line); d[k * 4 + 2] = b * sh * (1 - line * 0.8); d[k * 4 + 3] = 255;
    }
    BK.j++;
  }
  BK.x.putImageData(BK.img, 0, 0, 0, Math.max(0, j0 - 1), MAP, BK.j - j0 + 2);
  if (BK.j >= MAP) {
    const x = BK.x; x.font = '600 15px "Noto Sans JP", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let j = 60; j < MAP - 60; j += 170) for (let i = 60; i < MAP - 60; i += 170) {
      const k = j * MAP + i, h = H[k];
      if (Math.floor(h / 25) !== Math.floor(H[k + 3] / 25)) { x.fillStyle = 'rgba(40,34,20,.55)'; x.fillText(Math.round(h / 25) * 25 + '', i, j); }
    }
    BK.done = true; BK.H = null; BK.img = null;
  }
  return BK.done;
}

// ---------------------------------------------------------------- live render (vector overlay in screen px)
const _lab = [];
function draw(ctx, W, H, full, dpr = 1) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b100d'; ctx.fillRect(0, 0, W, H);
  if (!TAB.base) return;
  const p = originOf(_tp);
  const z = full ? TAB.zoom : 3.2;
  const [pu, pv] = toMap(p.x, p.z);
  const [cu, cv] = full ? [TAB.cu ?? pu, TAB.cv ?? pv] : [pu, pv];
  const sc = Math.min(W, H) / MAP * z;              // screen px per map px
  const S = (u, v) => [W / 2 + (u - cu) * sc, H / 2 + (v - cv) * sc];
  const SW = (x, zz) => { const [u, v] = toMap(x, zz); return S(u, v); };
  const mpp = 1 / (PXM * sc);                        // metres per screen px
  // raster
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(sc, 0, 0, sc, W / 2 - cu * sc, H / 2 - cv * sc);
  ctx.drawImage(TAB.base, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const k = dpr;                                      // UI scale in device px
  // flood water (valley floor below the water level)
  if (G.waterLevel > -1.7) {
    ctx.fillStyle = `rgba(70,140,220,${clamp((G.waterLevel + 1.7) * 0.35, 0.1, 0.5)})`;
    const step = Math.max(2, 6 * mpp * 3);
    for (let zz = WORLD.z0; zz < WORLD.z1; zz += 4) {
      const cx = creekX(zz); let a = cx, b = cx;
      while (a > cx - 60 && heightAt(a, zz) < G.waterLevel) a -= step;
      while (b < cx + 60 && heightAt(b, zz) < G.waterLevel) b += step;
      const [x0, y0] = SW(a, zz + 2), [x1, y1] = SW(b, zz - 2); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  // roads: dark casing + light fill; width in metres, but never thinner than readable
  const rw = Math.max(5.2 / mpp, 3.2 * k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = r => { ctx.beginPath(); r.s.forEach((q, i) => { const [x, y] = SW(q.x, q.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  for (const r of ROADS) { path(r); ctx.strokeStyle = 'rgba(30,22,14,.85)'; ctx.lineWidth = rw + 2.6 * k; ctx.stroke(); }
  for (const r of ROADS) { path(r); ctx.strokeStyle = r.id === 'valley' ? '#f4e2b8' : '#e8d3a6'; ctx.lineWidth = rw; ctx.stroke(); }
  for (const r of ROADS) if (r.bridge) { // bridge: timber brown with rails
    ctx.beginPath(); for (let i = r.bridge[0]; i <= r.bridge[1]; i++) { const [x, y] = SW(r.s[i].x, r.s[i].z); i === r.bridge[0] ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = '#1a120a'; ctx.lineWidth = rw + 4 * k; ctx.stroke(); ctx.strokeStyle = '#a0703c'; ctx.lineWidth = rw; ctx.stroke();
  }
  // fords (dashed blue over the road)
  ctx.setLineDash([3 * k, 3 * k]); ctx.strokeStyle = G.waterLevel > -1.2 ? '#ff6b5a' : '#6ec1ff'; ctx.lineWidth = rw * 0.6;
  for (const r of ROADS) { let on = false; ctx.beginPath(); r.s.forEach(q => { const [x, y] = SW(q.x, q.z); if (q.ford) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; }); ctx.stroke(); }
  ctx.setLineDash([]);
  // road names along the road (full map, zoomed in enough)
  if (full && TAB.labels && z > 1.4) {
    ctx.font = `600 ${11 * k}px "Noto Sans JP", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of ROADS) {
      const i = Math.floor(r.s.length * 0.42), a = r.s[i], b = r.s[Math.min(r.s.length - 1, i + 3)];
      const [x0, y0] = SW(a.x, a.z), [x1, y1] = SW(b.x, b.z); let ang = Math.atan2(y1 - y0, x1 - x0); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      if (x0 < 0 || y0 < 0 || x0 > W || y0 > H) continue;
      ctx.save(); ctx.translate(x0, y0 - rw * 1.4); ctx.rotate(ang);
      ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(20,16,10,.85)'; ctx.strokeText(r.name, 0, 0); ctx.fillStyle = '#fff4d8'; ctx.fillText(r.name, 0, 0); ctx.restore();
    }
  }
  // planned route (glowing cyan)
  if (AP.on && AP.path.length) {
    ctx.beginPath(); AP.path.slice(AP.idx).forEach((q, i) => { const [x, y] = SW(q.x, q.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = 'rgba(10,40,60,.8)'; ctx.lineWidth = rw * 0.75 + 3 * k; ctx.stroke();
    ctx.strokeStyle = '#4fd1ff'; ctx.lineWidth = rw * 0.75; ctx.stroke();
  }
  // hazards: boulders / logs on the map, mud flows
  for (const m of G.mudZones || []) { const [x, y] = SW(m.x, m.z); ctx.fillStyle = 'rgba(120,80,40,.45)'; ctx.beginPath(); ctx.arc(x, y, m.r / mpp, 0, 7); ctx.fill(); }
  for (const o of VEH.obstacles) { if (o.r < 0.35) continue; const [x, y] = SW(o.p.x, o.p.z); ctx.fillStyle = o.tag === 'tree' ? '#b06a2c' : '#ff7043'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.arc(x, y, Math.max(o.r / mpp, 2.5 * k), 0, 7); ctx.fill(); ctx.stroke(); }
  // destinations: pin + label, labels placed greedily without overlaps (selected / near first)
  _lab.length = 0;
  const fs = (full ? 13 : 15) * k, ds = Object.values(DESTS);
  ctx.font = `700 ${fs}px "Noto Sans JP", sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const order = ds.map(d => { const [x, y] = SW(d.x, d.z); return { d, x, y, pri: (TAB.sel === d.id ? 0 : AP.on && AP.dest === d.id ? 1 : 2) + Math.hypot(x - W / 2, y - H / 2) / (W + H) }; }).sort((a, b) => a.pri - b.pri);
  for (const { d, x, y } of order) {
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    const sel = TAB.sel === d.id, here = AP.at === d.id || (!AP.on && Math.hypot(p.x - d.x, p.z - d.z) < 6), tgt = AP.on && AP.dest === d.id;
    const col = sel ? '#ffb45e' : tgt ? '#4fd1ff' : here ? '#7dffa0' : '#fff6e4';
    const r = (sel ? 7.5 : 5.5) * k;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + 1 * k, y + 1.5 * k, r + 1.5 * k, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    if (d.end) { ctx.fillStyle = '#1a1510'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, 7); ctx.fill(); }
    if (!(full ? TAB.labels || sel : sel)) continue;
    const tw = ctx.measureText(d.name).width;
    // try right, left, above, below
    const cand = [[x + r + 4 * k, y], [x - r - 4 * k - tw, y], [x - tw / 2, y - r - fs * 0.8], [x - tw / 2, y + r + fs * 0.8]];
    let placed = null;
    for (const [lx, ly] of cand) {
      const box = [lx - 3 * k, ly - fs * 0.62, lx + tw + 3 * k, ly + fs * 0.62];
      if (!_lab.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { placed = [lx, ly]; _lab.push(box); break; }
    }
    if (!placed && !sel) continue;
    const [lx, ly] = placed || cand[0];
    ctx.lineWidth = 3.6 * k; ctx.strokeStyle = 'rgba(16,12,8,.9)'; ctx.strokeText(d.name, lx, ly);
    ctx.fillStyle = sel ? '#ffd79a' : '#fffaf0'; ctx.fillText(d.name, lx, ly);
  }
  // camper: heading cone + arrow
  const yaw = Math.atan2(VEH.fwd.x, VEH.fwd.z);
  ctx.save(); ctx.translate(pu * sc + W / 2 - cu * sc, pv * sc + H / 2 - cv * sc); ctx.rotate(Math.PI - yaw);
  const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 46 * k); cone.addColorStop(0, 'rgba(255,210,74,.45)'); cone.addColorStop(1, 'rgba(255,210,74,0)');
  ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46 * k, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.fill();
  ctx.fillStyle = VEH.up.y < 0.6 ? '#ff5b3a' : '#ffd24a'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * k;
  ctx.beginPath(); ctx.moveTo(0, -13 * k); ctx.lineTo(9 * k, 10 * k); ctx.lineTo(0, 5 * k); ctx.lineTo(-9 * k, 10 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (full) { drawScale(ctx, W, H, mpp, k); drawCompass(ctx, W, k); }
  else { // dashboard screen status line
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H - 54, W, 54);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(AP.on ? `▶ ${DESTS[AP.dest].name}  残り${Math.round(AP.remain)}m` : '🧭 目的地を選ぶ', 14, H - 27);
  }
}
function drawScale(ctx, W, H, mpp, k) {
  const target = 110 * k * mpp, nice = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(v => v >= target * 0.6) || 500, px = nice / mpp;
  const x = W - px - 18 * k, y = H - 20 * k;
  ctx.fillStyle = 'rgba(10,12,11,.6)'; ctx.fillRect(x - 8 * k, y - 20 * k, px + 16 * k, 30 * k);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, px, 3 * k); ctx.fillRect(x, y - 5 * k, 2 * k, 8 * k); ctx.fillRect(x + px - 2 * k, y - 5 * k, 2 * k, 8 * k);
  ctx.font = `700 ${11 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(nice + ' m', x + px / 2, y - 6 * k);
}
function drawCompass(ctx, W, k) {
  const x = W - 30 * k, y = 30 * k, r = 18 * k;
  ctx.fillStyle = 'rgba(10,12,11,.6)'; ctx.beginPath(); ctx.arc(x, y, r + 4 * k, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff6b5a'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + 6 * k, y); ctx.lineTo(x - 6 * k, y); ctx.fill();
  ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x + 6 * k, y); ctx.lineTo(x - 6 * k, y); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 ${10 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', x, y - r - 9 * k);
}

// ---------------------------------------------------------------- 3D tablet on the dash
export function buildTablet(camperGroup, FLOOR, ZF) {
  bakeBase();
  const c = document.createElement('canvas'); c.width = 640; c.height = 400;
  TAB.canvas = c; TAB.ctx = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  TAB.tex = t;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.19, 0.012), new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.4, metalness: 0.5 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.169), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.25 }));
  scr.position.z = 0.0065;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.35 }));
  arm.position.set(0, -0.1, -0.03); arm.rotation.x = 0.5;
  g.add(body, scr, arm);
  g.position.set(0.0, FLOOR + 1.02, ZF + 0.62); g.rotation.set(-0.55, 0, 0);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  camperGroup.add(g); TAB.mesh = g;
  TAB.screenMat = scr.material;
}

let drawT = 0;
export function updateTablet(dt) {
  if (!TAB.ctx) return;
  if (!BK.done) bakeStep(TAB.open ? 30 : 6);
  drawT -= dt; if (drawT > 0) return; drawT = TAB.open ? 0 : 0.25;
  if (!TAB.open) { draw(TAB.ctx, 640, 400, false); TAB.tex.needsUpdate = true; }
  TAB.screenMat.emissiveIntensity = 0.55 + G.night * 0.2;
  if (TAB.open && TAB.fctx) draw(TAB.fctx, TAB.fcanvas.width, TAB.fcanvas.height, true, TAB.dpr || 1);
}

// ---------------------------------------------------------------- full-screen map UI
export function openTablet() {
  if (TAB.open) return;
  const el = document.getElementById('tablet');
  el.classList.remove('hidden'); TAB.open = true; TAB.sel = null;
  const p = originOf(new THREE.Vector3()); [TAB.cu, TAB.cv] = toMap(p.x, p.z); TAB.zoom = 2.6;
  resizeFull(); refreshPanel(true);
  bus.emit('sfx', 'tablet'); bus.emit('tablet', true);
}
export function closeTablet() {
  document.getElementById('tablet').classList.add('hidden'); TAB.open = false; bus.emit('tablet', false);
}
function resizeFull() {
  const c = TAB.fcanvas, r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
  TAB.dpr = dpr; c.width = Math.max(10, Math.round(r.width * dpr)); c.height = Math.max(10, Math.round(r.height * dpr));
}
function eta(m) { const s = m / 6; return s < 60 ? `${Math.max(1, Math.round(s))}秒` : `${Math.round(s / 60)}分`; }
function refreshPanel(rebuild = false) {
  const info = document.getElementById('tabInfo'), go = document.getElementById('tabGo');
  const p = originOf(new THREE.Vector3());
  const d = TAB.sel && DESTS[TAB.sel];
  if (d) {
    const km = Math.hypot(p.x - d.x, p.z - d.z), dh = d.h - p.y;
    info.innerHTML = `<b>${d.name}</b><small>${d.desc}</small>
      <div class="tstats"><span>📏 ${Math.round(km)} m</span><span>⛰ ${dh >= 0 ? '+' : ''}${Math.round(dh)} m</span><span>🛣 ${ROAD_NAMES[d.road]}</span></div>`;
    go.disabled = false; go.textContent = AP.on && AP.dest === d.id ? '走行中' : 'ここへ自動運転';
  } else {
    info.innerHTML = AP.on ? `<b>▶ ${DESTS[AP.dest].name}</b><div class="tstats"><span>残り ${Math.round(AP.remain)} m</span><span>約 ${eta(AP.remain)}</span></div>`
      : '<b>目的地を選ぶ</b><small>地図の●をタップ、またはリストから選択</small>';
    go.disabled = true; go.textContent = 'ここへ自動運転';
  }
  document.getElementById('tabStop').classList.toggle('hidden', !AP.on);
  const list = document.getElementById('tabList');
  if (rebuild || !list.childElementCount) {
    list.innerHTML = '';
    const ds = Object.values(DESTS).map(x => ({ x, dist: Math.hypot(p.x - x.x, p.z - x.z) }));
    if (TAB.sort === 'near') ds.sort((a, b) => a.dist - b.dist); else ds.sort((a, b) => ROADS.findIndex(r => r.id === a.x.road) - ROADS.findIndex(r => r.id === b.x.road) || a.x.i - b.x.i);
    let lastRoad = null;
    for (const { x: dd, dist } of ds) {
      if (TAB.sort === 'road' && dd.road !== lastRoad) { lastRoad = dd.road; const hdr = document.createElement('div'); hdr.className = 'tgrp'; hdr.textContent = ROAD_NAMES[dd.road]; list.appendChild(hdr); }
      const b = document.createElement('button'); b.className = 'tli'; b.dataset.touch = 1; b.dataset.id = dd.id;
      b.innerHTML = `<span>${dd.name}</span><em>${dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'km'}</em>`;
      b.onclick = () => { TAB.sel = dd.id; [TAB.cu, TAB.cv] = toMap(dd.x, dd.z); TAB.zoom = Math.max(TAB.zoom, 3); refreshPanel(); bus.emit('sfx', 'switch'); };
      list.appendChild(b);
    }
  }
  list.querySelectorAll('.tli').forEach(b => b.classList.toggle('on', b.dataset.id === TAB.sel));
  document.querySelectorAll('#tabSort button').forEach(b => b.classList.toggle('on', b.dataset.sort === TAB.sort));
  document.getElementById('tabLbl')?.classList.toggle('on', TAB.labels);
}
function zoomAt(f, sx, sy) { // zoom keeping the map point under (sx,sy) [css px, relative to canvas centre] fixed
  const c = TAB.fcanvas, sc0 = Math.min(c.clientWidth, c.clientHeight) / MAP * TAB.zoom;
  const nz = clamp(TAB.zoom * f, 0.9, 14), sc1 = Math.min(c.clientWidth, c.clientHeight) / MAP * nz;
  TAB.cu += sx / sc0 - sx / sc1; TAB.cv += sy / sc0 - sy / sc1; TAB.zoom = nz;
}
export function initTabletUI(root) {
  const el = document.createElement('div'); el.id = 'tablet'; el.className = 'hidden';
  el.innerHTML = `<div class="tabframe"><div class="tabmapwrap"><canvas id="tabMap"></canvas>
      <div class="tabzoom"><button data-touch class="round" id="tabZi" aria-label="拡大">＋</button><button data-touch class="round" id="tabZo" aria-label="縮小">－</button><button data-touch class="round" id="tabMe" aria-label="現在地">◎</button><button data-touch class="round on" id="tabLbl" aria-label="地名">Aa</button></div>
      <div class="tablegend"><i class="lg-road"></i>林道<i class="lg-bridge"></i>木橋<i class="lg-ford"></i>浅瀬<i class="lg-route"></i>ルート<i class="lg-haz"></i>障害物</div></div>
    <div class="tabside">
      <div class="tabhead"><b>🗺 地図</b><button data-touch class="chip small" id="tabClose" aria-label="閉じる">✕</button></div>
      <div id="tabInfo"></div>
      <div class="tabbtns"><button data-touch class="chip go" id="tabGo">ここへ自動運転</button><button data-touch class="chip stop hidden" id="tabStop">■ 停車</button></div>
      <div id="tabSort" class="seg"><button data-touch data-sort="near">近い順</button><button data-touch data-sort="road">道路別</button></div>
      <div id="tabList"></div></div></div>`;
  root.appendChild(el);
  const c = TAB.fcanvas = el.querySelector('#tabMap'); TAB.fctx = c.getContext('2d');
  window.addEventListener('resize', () => TAB.open && resizeFull());
  // pan / pinch (zoom about the pinch centre) / tap-select
  const pts = new Map(); let moved = 0, pinch0 = 0, zoom0 = 1, mid0 = null;
  const rel = (x, y) => { const r = c.getBoundingClientRect(); return [x - r.left - r.width / 2, y - r.top - r.height / 2]; };
  c.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = TAB.zoom; mid0 = rel((a.x + b.x) / 2, (a.y + b.y) / 2); } });
  c.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const sc = Math.min(c.clientWidth, c.clientHeight) / MAP * TAB.zoom;
    if (pts.size === 1) { TAB.cu -= (e.clientX - p.x) / sc; TAB.cv -= (e.clientY - p.y) / sc; moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { TAB.pinched = true; const [a, b] = [...pts.values()]; const want = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(pinch0, 1), 0.9, 14); zoomAt(want / TAB.zoom, mid0[0], mid0[1]); moved = 99; }
    TAB.cu = clamp(TAB.cu, 0, MAP); TAB.cv = clamp(TAB.cv, 0, MAP);
  });
  c.addEventListener('pointerup', e => {
    const wasTap = pts.size === 1 && moved < 10 && !TAB.pinched; pts.delete(e.pointerId); if (!pts.size) TAB.pinched = false;
    if (!wasTap) return;
    const [sx, sy] = rel(e.clientX, e.clientY), sc = Math.min(c.clientWidth, c.clientHeight) / MAP * TAB.zoom;
    const u = TAB.cu + sx / sc, v = TAB.cv + sy / sc;
    let best = null, bd = 26 / sc;
    for (const d of Object.values(DESTS)) { const [du, dv] = toMap(d.x, d.z); const dd = Math.hypot(du - u, dv - v); if (dd < bd) { bd = dd; best = d.id; } }
    TAB.sel = best; refreshPanel(); if (best) bus.emit('sfx', 'switch');
  });
  c.addEventListener('pointercancel', e => pts.delete(e.pointerId));
  c.addEventListener('wheel', e => { const [sx, sy] = rel(e.clientX, e.clientY); zoomAt(e.deltaY > 0 ? 0.88 : 1.14, sx, sy); }, { passive: true });
  el.querySelector('#tabZi').onclick = () => zoomAt(1.5, 0, 0);
  el.querySelector('#tabZo').onclick = () => zoomAt(1 / 1.5, 0, 0);
  el.querySelector('#tabMe').onclick = () => { const p = originOf(new THREE.Vector3()); [TAB.cu, TAB.cv] = toMap(p.x, p.z); };
  el.querySelector('#tabLbl').onclick = () => { TAB.labels = !TAB.labels; refreshPanel(); };
  el.querySelectorAll('#tabSort button').forEach(b => b.onclick = () => { TAB.sort = b.dataset.sort; refreshPanel(true); });
  el.querySelector('#tabGo').onclick = () => { if (TAB.sel && engage(TAB.sel)) { closeTablet(); bus.emit('seatForDrive'); } refreshPanel(); };
  el.querySelector('#tabStop').onclick = () => { disengage('自動運転を止めた'); refreshPanel(); };
  el.querySelector('#tabClose').onclick = closeTablet;
  bus.on('arrived', () => TAB.open && refreshPanel(true));
  setInterval(() => TAB.open && refreshPanel(), 1000);
}
export { NODES };
