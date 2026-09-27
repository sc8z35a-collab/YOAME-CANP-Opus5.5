// Tablet: a physical tablet mounted on the dashboard (3D mesh with a live canvas map), which the
// player picks up ("brings back to the seat") to open the full-screen map UI. On the map you tap
// one of the ~36 destinations and start the autopilot. Map = baked relief shading + roads +
// water + live camper position/heading + planned route + hazard markers.
import { THREE, G, bus, clamp } from './core.js';
import { ROADS, DESTS, NODES } from './roads.js';
import { WORLD, creekX } from './relief.js';
import { heightAt } from './terrain.js';
import { AP, engage, disengage } from './autopilot.js';
import { VEH, originOf } from './vehicle.js';

export const TAB = { mesh: null, tex: null, canvas: null, open: false, sel: null, base: null, zoom: 1, cx: 0, cz: 0 };
const MAP = 1024;
// north (+z, where 林道の北端 is) is up on the map
const toMap = (x, z) => [(x - WORLD.x0) / WORLD.size * MAP, (WORLD.z1 - z) / WORLD.size * MAP];
const fromMap = (u, v) => [WORLD.x0 + u / MAP * WORLD.size, WORLD.z1 - v / MAP * WORLD.size];

// ---------------------------------------------------------------- base map (baked once)
function bakeBase() {
  const c = document.createElement('canvas'); c.width = c.height = MAP;
  const x = c.getContext('2d'), img = x.createImageData(MAP, MAP), d = img.data;
  const S = 2; // bake at half res then scale for speed
  for (let j = 0; j < MAP; j += S) for (let i = 0; i < MAP; i += S) {
    const [wx, wz] = fromMap(i + 1, j + 1);
    const h = heightAt(wx, wz), hx = heightAt(wx + 1.5, wz) - h, hz = heightAt(wx, wz + 1.5) - h;
    const shade = clamp(0.62 - hx * 0.35 + hz * 0.22, 0.15, 1); // light from the north-west
    const band = (Math.floor(h / 4) % 2) ? 0.97 : 1;          // contour banding (every 4m)
    let r = 70 + h * 1.1, g = 96 + h * 0.8, b = 62 + h * 0.4;  // forest green -> brownish heights
    const cd = Math.abs(wx - creekX(wz));
    if (cd < 3.2) { r = 70; g = 120; b = 150; }
    for (let a = 0; a < S; a++) for (let bb = 0; bb < S; bb++) {
      const k = ((j + bb) * MAP + i + a) * 4;
      d[k] = r * shade * band; d[k + 1] = g * shade * band; d[k + 2] = b * shade * band; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  // roads
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [w, col] of [[9, 'rgba(40,28,18,.8)'], [5, '#e8d6b0']]) for (const r of ROADS) {
    x.strokeStyle = col; x.lineWidth = w; x.beginPath();
    r.s.forEach((p, i) => { const [u, v] = toMap(p.x, p.z); i ? x.lineTo(u, v) : x.moveTo(u, v); }); x.stroke();
  }
  for (const r of ROADS) if (r.bridge) { // bridge marking
    x.strokeStyle = '#8b5a2b'; x.lineWidth = 7; x.beginPath();
    for (let i = r.bridge[0]; i <= r.bridge[1]; i++) { const [u, v] = toMap(r.s[i].x, r.s[i].z); i === r.bridge[0] ? x.moveTo(u, v) : x.lineTo(u, v); }
    x.stroke();
  }
  // grid + north arrow
  x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1;
  for (let g = 0; g <= MAP; g += MAP / 8) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, MAP); x.moveTo(0, g); x.lineTo(MAP, g); x.stroke(); }
  x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.fillText('N', MAP - 48, 44);
  x.beginPath(); x.moveTo(MAP - 37, 54); x.lineTo(MAP - 47, 80); x.lineTo(MAP - 27, 80); x.fill();
  TAB.base = c;
}

// ---------------------------------------------------------------- live render
function draw(ctx, W, H, full) {
  ctx.fillStyle = '#0b100d'; ctx.fillRect(0, 0, W, H);
  const p = originOf(new THREE.Vector3());
  const z = full ? TAB.zoom : 1.8;
  const [pu, pv] = toMap(p.x, p.z);
  const [cu, cv] = full ? [TAB.cu ?? pu, TAB.cv ?? pv] : [pu, pv];
  const sc = Math.min(W, H) / MAP * z;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-cu, -cv);
  ctx.drawImage(TAB.base, 0, 0);
  // flood / water level (low areas shown in blue when the creek rises)
  if (G.waterLevel > -1.6) { ctx.fillStyle = `rgba(60,120,200,${clamp((G.waterLevel + 1.6) * 0.3, 0, 0.45)})`; for (let zz = WORLD.z0; zz < WORLD.z1; zz += 4) { const [u, v] = toMap(creekX(zz), zz); ctx.fillRect(u - 12 - (G.waterLevel + 1.6) * 8, v - 9, 24 + (G.waterLevel + 1.6) * 16, 9); } }
  // route
  if (AP.on && AP.path.length) {
    ctx.strokeStyle = '#4fd1ff'; ctx.lineWidth = 7 / Math.sqrt(z); ctx.setLineDash([14, 8]); ctx.beginPath();
    AP.path.slice(AP.idx).forEach((q, i) => { const [u, v] = toMap(q.x, q.z); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  // obstacles (boulders / fallen trees) known on the roads
  for (const o of VEH.obstacles) { const [u, v] = toMap(o.p.x, o.p.z); ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(u, v, 6, 0, 7); ctx.fill(); }
  // destinations
  const fs = (full ? 21 : 26) / z;
  for (const d of Object.values(DESTS)) {
    const [u, v] = toMap(d.x, d.z), sel = TAB.sel === d.id, here = AP.at === d.id || (!AP.on && Math.hypot(p.x - d.x, p.z - d.z) < 6);
    ctx.fillStyle = sel ? '#ffb45e' : here ? '#7dffa0' : AP.dest === d.id && AP.on ? '#4fd1ff' : '#fff3dd';
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.arc(u, v, (sel ? 11 : 8) / Math.sqrt(z), 0, 7); ctx.fill(); ctx.stroke();
    if (full || sel) {
      ctx.font = `bold ${fs}px "Noto Sans JP", sans-serif`; ctx.lineWidth = 4 / z; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(d.name, u + 12 / z, v + 6 / z); ctx.fillText(d.name, u + 12 / z, v + 6 / z);
    }
  }
  // camper arrow
  const yaw = Math.atan2(VEH.fwd.x, VEH.fwd.z);
  ctx.translate(pu, pv); ctx.rotate(yaw);
  ctx.fillStyle = VEH.up.y < 0.6 ? '#ff5b3a' : '#ffd24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 / z;
  const k = 1 / Math.sqrt(z) * 1.2;
  ctx.beginPath(); ctx.moveTo(0, -16 * k); ctx.lineTo(10 * k, 12 * k); ctx.lineTo(0, 6 * k); ctx.lineTo(-10 * k, 12 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (!full) { // dashboard screen status line
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H - 54, W, 54);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText(AP.on ? `▶ ${DESTS[AP.dest].name}  残り${Math.round(AP.remain)}m` : '🧭 タップして目的地を選ぶ', 14, H - 18);
  }
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
  // mounted on the dash centre, tilted toward the seats
  g.position.set(0.0, FLOOR + 1.02, ZF + 0.62); g.rotation.set(-0.55, 0, 0);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  camperGroup.add(g); TAB.mesh = g;
  TAB.screenMat = scr.material;
}

let drawT = 0;
export function updateTablet(dt) {
  if (!TAB.ctx) return;
  drawT -= dt; if (drawT > 0) return; drawT = TAB.open ? 0 : 0.25;
  if (!TAB.open) { draw(TAB.ctx, 640, 400, false); TAB.tex.needsUpdate = true; }
  TAB.screenMat.emissiveIntensity = 0.55 + G.night * 0.2;
  if (TAB.open && TAB.fctx) drawFull();
}

// ---------------------------------------------------------------- full-screen map UI
function drawFull() {
  const c = TAB.fcanvas, W = c.width, H = c.height;
  draw(TAB.fctx, W, H, true);
}
export function openTablet() {
  if (TAB.open) return;
  const el = document.getElementById('tablet');
  el.classList.remove('hidden'); TAB.open = true; TAB.sel = null;
  const p = originOf(new THREE.Vector3()); [TAB.cu, TAB.cv] = toMap(p.x, p.z); TAB.zoom = 1.6;
  resizeFull(); refreshPanel();
  bus.emit('sfx', 'tablet'); bus.emit('tablet', true);
}
export function closeTablet() {
  document.getElementById('tablet').classList.add('hidden'); TAB.open = false; bus.emit('tablet', false);
}
function resizeFull() {
  const c = TAB.fcanvas, r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.max(10, r.width * dpr); c.height = Math.max(10, r.height * dpr);
}
function refreshPanel() {
  const info = document.getElementById('tabInfo'), go = document.getElementById('tabGo');
  const d = TAB.sel && DESTS[TAB.sel];
  if (d) {
    const p = originOf(new THREE.Vector3()), km = Math.hypot(p.x - d.x, p.z - d.z);
    info.innerHTML = `<b>${d.name}</b><small>${d.desc}</small><small>直線 ${Math.round(km)}m / 標高 ${Math.round(d.h)}m</small>`;
    go.disabled = false; go.textContent = AP.on && AP.dest === d.id ? '走行中' : '🧭 ここへ自動運転';
  } else {
    info.innerHTML = AP.on ? `<b>▶ ${DESTS[AP.dest].name}</b><small>残り ${Math.round(AP.remain)}m</small>` : '<b>目的地をタップ</b><small>地図の●を選ぶと自動運転で向かいます</small>';
    go.disabled = true; go.textContent = '🧭 ここへ自動運転';
  }
  document.getElementById('tabStop').classList.toggle('hidden', !AP.on);
  const list = document.getElementById('tabList');
  if (!list.childElementCount) for (const d of Object.values(DESTS)) {
    const b = document.createElement('button'); b.className = 'tli'; b.dataset.touch = 1; b.textContent = d.name;
    b.onclick = () => { TAB.sel = d.id; [TAB.cu, TAB.cv] = toMap(d.x, d.z); refreshPanel(); }; list.appendChild(b);
  }
  list.querySelectorAll('.tli').forEach((b, i) => b.classList.toggle('on', Object.keys(DESTS)[i] === TAB.sel));
}
export function initTabletUI(root) {
  const el = document.createElement('div'); el.id = 'tablet'; el.className = 'hidden';
  el.innerHTML = `<div class="tabframe"><canvas id="tabMap"></canvas>
    <div class="tabside"><div id="tabInfo"></div>
      <button data-touch class="chip wide go" id="tabGo">🧭 ここへ自動運転</button>
      <button data-touch class="chip wide hidden" id="tabStop">■ 停車する</button>
      <div id="tabList"></div>
      <button data-touch class="chip wide" id="tabClose">タブレットを置く</button></div>
    <div class="tabzoom"><button data-touch class="round" id="tabZi">＋</button><button data-touch class="round" id="tabZo">－</button><button data-touch class="round" id="tabMe">◎</button></div></div>`;
  root.appendChild(el);
  const c = TAB.fcanvas = el.querySelector('#tabMap'); TAB.fctx = c.getContext('2d');
  window.addEventListener('resize', () => TAB.open && resizeFull());
  // pan / pinch / tap-select
  const pts = new Map(); let moved = 0, pinch0 = 0, zoom0 = 1;
  c.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = TAB.zoom; } });
  c.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const sc = Math.min(c.clientWidth, c.clientHeight) / MAP * TAB.zoom;
    if (pts.size === 1) { TAB.cu -= (e.clientX - p.x) / sc; TAB.cv -= (e.clientY - p.y) / sc; moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; TAB.zoom = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(pinch0, 1), 0.8, 6); moved = 99; }
  });
  c.addEventListener('pointerup', e => {
    const wasTap = pts.size === 1 && moved < 10; pts.delete(e.pointerId);
    if (!wasTap) return;
    const r = c.getBoundingClientRect(), sc = Math.min(r.width, r.height) / MAP * TAB.zoom;
    const u = TAB.cu + (e.clientX - r.left - r.width / 2) / sc, v = TAB.cv + (e.clientY - r.top - r.height / 2) / sc;
    let best = null, bd = 34 / sc;
    for (const d of Object.values(DESTS)) { const [du, dv] = toMap(d.x, d.z); const dd = Math.hypot(du - u, dv - v); if (dd < bd) { bd = dd; best = d.id; } }
    TAB.sel = best; refreshPanel(); if (best) bus.emit('sfx', 'switch');
  });
  c.addEventListener('pointercancel', e => pts.delete(e.pointerId));
  c.addEventListener('wheel', e => { TAB.zoom = clamp(TAB.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.8, 6); }, { passive: true });
  el.querySelector('#tabZi').onclick = () => { TAB.zoom = clamp(TAB.zoom * 1.4, 0.8, 6); };
  el.querySelector('#tabZo').onclick = () => { TAB.zoom = clamp(TAB.zoom / 1.4, 0.8, 6); };
  el.querySelector('#tabMe').onclick = () => { const p = originOf(new THREE.Vector3()); [TAB.cu, TAB.cv] = toMap(p.x, p.z); };
  el.querySelector('#tabGo').onclick = () => { if (TAB.sel && engage(TAB.sel)) { closeTablet(); bus.emit('seatForDrive'); } refreshPanel(); };
  el.querySelector('#tabStop').onclick = () => { disengage('自動運転を止めた'); refreshPanel(); };
  el.querySelector('#tabClose').onclick = closeTablet;
  bus.on('arrived', () => TAB.open && refreshPanel());
  setInterval(() => TAB.open && refreshPanel(), 1000);
}
export { NODES };
