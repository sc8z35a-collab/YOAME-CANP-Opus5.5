// HUD & menus (landscape phone layout). All touch targets >= 44px.
//
// Layout
//   top-left   status pill: day/time · weather, and three compact gauges (車体 / 電池 / 安心)
//   top-right  map · camera · menu (always the same three round buttons)
//   top-centre alerts (threats) and, while driving, the drive HUD (dest, progress, speed, gear,
//              4WD range, surface, tilt, ABS/TCS/slip warnings)
//   bottom     left: run toggle · right: context action + "things" (grouped action sheet)
// Menu: one panel with tabs — 設定 / 車 / 鑑賞 (sandbox) — instead of one long list.
import { G, bus, fmtTime, clamp } from './core.js';
import { V, setView } from './view.js';
import { PL, focusSpot, sitAt, standUp, goOutside, goInside } from './player.js';
import { openTablet, closeTablet, TAB, initTabletUI } from './tablet.js';
import { AP, disengage, parkedAt, nearestDest } from './autopilot.js';
import { VEH, SURF } from './vehicle.js';
import { DESTS } from './roads.js';
import { C, setCurtains, drawRadio } from './camper.js';
import { W, WEATHERS, setWeather } from './weather.js';
import { Z, scareAll, nearestAnimal } from './animals.js';
import { E, triggerEvent } from './events.js';
import { DMG, repairAll } from './damage.js';
import { sfx, initAudio, A } from './audio.js';

const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

// grouped actions (the "things" sheet)
export const ACTIONS = [
  { g: 'あかり', id: 'lights', icon: '💡', label: '室内灯', on: () => G.state.lightsOn, act: () => { G.state.lightsOn = !G.state.lightsOn; sfx('switch'); } },
  { g: 'あかり', id: 'curtain', icon: '🪟', label: 'カーテン', on: () => (C.curtainTarget ?? 0) > 0.5, act: () => { const v = (C.curtainTarget ?? 0) > 0.5 ? 0 : 1; setCurtains(v); G.state.curtainsClosed = v > 0.5; sfx('curtain'); } },
  { g: 'あかり', id: 'head', icon: '🚨', label: 'ライト', on: () => G.state.headOn, act: () => { G.state.headOn = !G.state.headOn; sfx('switch'); } },
  { g: '身を守る', id: 'hide', icon: '🤫', label: '息をひそめる', on: () => G.state.hiding, act: () => { G.state.hiding = !G.state.hiding; if (G.state.hiding) { G.state.lightsOn = false; G.state.spotOn = false; } } },
  { g: '身を守る', id: 'spot', icon: '🔦', label: '投光器', on: () => G.state.spotOn, act: () => { if (G.state.battery < 3) return toast('バッテリーが足りない', 'warn'); G.state.spotOn = !G.state.spotOn; sfx('switch'); if (G.state.spotOn) { G.state.noise = Math.max(G.state.noise, 0.4); if (Z.bear.active && distBear() < 25) { Z.bear.aggro -= 0.25; if (Z.bear.aggro < 0.4) scareAll(1); } } } },
  { g: '身を守る', id: 'horn', icon: '📯', label: 'クラクション', act: () => { sfx('horn'); G.state.noise = 1; const n = nearestAnimal(); scareAll(1.0); if (n) toast(n.a.kind === 'bear' ? (Z.bear.state === 'flee' ? 'クマが驚いて逃げていく！' : 'クマは怯まない…！') : '動物たちが逃げていく', n.a.kind === 'bear' ? 'warn' : 'info'); } },
  { g: 'くらし', id: 'cook', icon: '☕', label: 'お湯', act: () => { G.state.cooking = 25; sfx('kettle'); toast('ケトルを火にかけた。温かい匂い…（クマが寄ってくるかも）', 'info'); } },
  { g: 'くらし', id: 'heater', icon: '🔥', label: 'ヒーター', on: () => G.state.heater, act: () => { G.state.heater = !G.state.heater; sfx('switch'); } },
  { g: 'くらし', id: 'radio', icon: '📻', label: 'ラジオ', on: () => G.state.radio, act: () => { G.state.radio = !G.state.radio; radioNews(); } },
  { g: 'くらし', id: 'gen', icon: '⚡', label: '発電機', on: () => G.state.generator, act: () => { G.state.generator = !G.state.generator; G.state.noise = Math.max(G.state.noise, 0.3); toast(G.state.generator ? '発電機を回した（音で動物が警戒する）' : '発電機を止めた', 'info'); } },
];
function distBear() { return Math.hypot(Z.bear.pos.x - G.camper.position.x, Z.bear.pos.z - G.camper.position.z); }

let toastEl, hud = {};
const early = [];
export function toast(msg, level = 'info', ms = 4000) {
  if (!toastEl) { if (early.length < 6) early.push([msg, level, ms]); return; }
  if (toastEl.lastChild && toastEl.lastChild.dataset.msg === msg) return; // de-dupe spam
  const t = h('div', { className: 'toast ' + level }, msg); t.dataset.msg = msg;
  toastEl.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 600); }, ms);
  while (toastEl.children.length > 3) toastEl.firstChild.remove();
}
bus.on('toast', ({ msg, level, ms }) => toast(msg, level, ms));
bus.on('bearsniff', () => toast('…窓のすぐ外で、荒い鼻息が聞こえる。明かりを消して息をひそめろ', 'danger', 5500));
bus.on('bearscared', () => toast('クマが森の奥へ走り去った', 'info'));
bus.on('bearleft', () => toast('足音が遠ざかっていく…', 'info'));

function radioNews() {
  const m = W.mode, rs = G.rainAccum;
  const msg = m === 'storm' ? '大雨警報 土砂災害に警戒' : rs > 0.3 ? '河川の増水に注意' : m === 'rain' ? '夜にかけて雨' : '明日は晴れ 所により霧';
  drawRadio(G.state.radio ? msg : '---', m === 'storm' || rs > 0.3);
  if (G.state.radio) toast('📻 「' + msg + '」', m === 'storm' ? 'warn' : 'info');
}

const closeAll = () => { $('#menu').classList.add('hidden'); $('#sheet').classList.add('hidden'); $('#actToggle').classList.remove('on'); };

export function buildUI() {
  const root = $('#ui');
  const groups = [...new Set(ACTIONS.map(a => a.g))];
  root.innerHTML = `
  <div id="topbar">
    <div id="status" class="pill">
      <div id="clock"><span id="tm">--:--</span><span id="wx"></span></div>
      <div class="gauges">
        <div class="gauge" title="車体"><i>🛻</i><b><u id="b-hull"></u></b></div>
        <div class="gauge" title="バッテリー"><i>🔋</i><b><u id="b-bat"></u></b></div>
        <div class="gauge" title="安心度"><i>💗</i><b><u id="b-calm"></u></b></div>
      </div>
    </div>
    <div id="spot" class="pill"></div>
    <div class="tbtns">
      <button id="mapBtn" data-touch class="round" aria-label="地図">🗺</button>
      <button id="camBtn" data-touch class="round" aria-label="視点">🎥</button>
      <button id="menuBtn" data-touch class="round" aria-label="メニュー">☰</button>
    </div>
  </div>
  <div id="centre">
    <div id="apHud" class="hidden">
      <div class="ap-top"><b id="apDest"></b><button data-touch class="chip small" id="apStop" aria-label="停車">■</button></div>
      <div id="apBar"><i></i></div>
      <div class="ap-tele">
        <div class="spd"><b id="apSpd">0</b><small>km/h</small></div>
        <div class="tel"><span id="apGear" class="tag">P</span><span id="apRange" class="tag">2H</span><span id="apSurf" class="tag"></span></div>
        <div class="tilt" title="傾き"><svg viewBox="-20 -20 40 40"><circle r="17"/><g id="apTilt"><rect x="-10" y="-5" width="20" height="10" rx="2"/><line x1="-14" x2="14" y1="7" y2="7"/></g></svg><small id="apTiltT">0°</small></div>
      </div>
      <div id="apSub"></div>
      <div id="apWarn"></div>
    </div>
    <div id="threat"></div>
  </div>
  <div id="joy"><div id="joyKnob"></div></div>
  <button id="runBtn" data-touch class="round small" aria-label="走る">🏃</button>
  <div id="botR">
    <button id="ctxBtn" data-touch class="ctx hidden"></button>
    <button id="actToggle" data-touch class="round" aria-label="操作">🧰</button>
  </div>
  <div id="sheet" class="hidden"><div class="panel sheet">
    ${groups.map(g => `<div class="sgroup"><h4>${g}</h4><div class="sgrid" data-g="${g}"></div></div>`).join('')}
  </div></div>
  <div id="toasts"></div>
  <div id="menu" class="hidden">
    <div class="panel menu">
      <div class="mhead"><div class="seg" id="mtabs"><button data-touch data-tab="set" class="on">⚙ 設定</button><button data-touch data-tab="car">🚐 車</button><button data-touch data-tab="play">🎬 鑑賞</button></div>
        <button data-touch class="chip small" id="closeMenu" aria-label="閉じる">✕</button></div>
      <section data-tab="set">
        <div class="row"><span>サウンド</span><div><button data-touch class="chip" id="sndBtn">🔊 オン</button></div></div>
        <div class="row"><span>画質</span><div class="seg" id="qSeg"><button data-touch data-q="u">ウルトラ</button><button data-touch data-q="h">高</button><button data-touch data-q="m">軽量</button></div></div>
        <div class="row"><span>データ</span><div><button data-touch class="chip" id="restartBtn">最初から</button></div></div>
      </section>
      <section data-tab="car" class="hidden">
        <div class="row"><span>状態</span><div id="carInfo" class="carinfo"></div></div>
        <div class="row"><span>駆動</span><div class="seg" id="rangeSeg"><button data-touch data-r="auto">自動</button><button data-touch data-r="2H">2H</button><button data-touch data-r="4H">4H</button><button data-touch data-r="4L">4L</button></div></div>
        <div class="row"><span>修理</span><div><button data-touch class="chip" id="repairBtn">🔧 板金・塗装（凹み/傷を直す）</button></div></div>
        <div class="row"><span>救助</span><div><button data-touch class="chip" id="homeBtn">🚛 レッカーでキャンプ地へ</button></div></div>
      </section>
      <section data-tab="play" class="hidden">
        <div class="row"><span>天気</span><div id="wxBtns" class="wrap"></div></div>
        <div class="row"><span>時間</span><div class="wrap"><button data-touch class="chip" data-t="-3">−3h</button><button data-touch class="chip" data-t="3">+3h</button><button data-touch class="chip" id="ff">⏩ 早送り</button></div></div>
        <div class="row"><span>出来事</span><div id="evBtns" class="wrap"></div></div>
      </section>
    </div>
  </div>`;
  initTabletUI(document.body);
  toastEl = $('#toasts'); early.splice(0).forEach(a => toast(...a));
  for (const a of ACTIONS) {
    const b = h('button', { className: 'abtn', id: 'a-' + a.id }, `<span>${a.icon}</span><small>${a.label}</small>`); b.dataset.touch = 1;
    b.onclick = () => { initAudio(); a.act(); refresh(); }; root.querySelector(`.sgrid[data-g="${a.g}"]`).appendChild(b);
  }
  $('#actToggle').onclick = () => { initAudio(); const open = $('#sheet').classList.toggle('hidden') === false; $('#actToggle').classList.toggle('on', open); $('#menu').classList.add('hidden'); };
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeAll(); };
  $('#menu').onclick = e => { if (e.target.id === 'menu') closeAll(); };
  // menu tabs
  root.querySelectorAll('#mtabs button').forEach(b => b.onclick = () => {
    root.querySelectorAll('#mtabs button').forEach(x => x.classList.toggle('on', x === b));
    root.querySelectorAll('.menu section').forEach(s => s.classList.toggle('hidden', s.dataset.tab !== b.dataset.tab));
  });
  const wx = $('#wxBtns');
  for (const [k, w] of Object.entries(WEATHERS)) { const b = h('button', { className: 'chip' }, w.label); b.dataset.touch = 1; b.onclick = () => setWeather(k); wx.appendChild(b); }
  const ev = $('#evBtns');
  for (const [k, l] of [['deer', '🦌 シカ'], ['bear', '🐻 クマ'], ['wolves', '🐺 オオカミ'], ['landslide', '⛰ 土砂崩れ'], ['flood', '🌊 洪水'], ['tree', '🌲 倒木']]) {
    const b = h('button', { className: 'chip' }, l); b.dataset.touch = 1; b.onclick = () => { triggerEvent(k); closeAll(); }; ev.appendChild(b);
  }
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const hh = G.hour + parseFloat(b.dataset.t); if (hh >= 24) G.day++; if (hh < 0 && G.day > 1) G.day--; G.hour = (hh + 24) % 24; });
  root.querySelectorAll('[data-q]').forEach(b => { b.classList.toggle('on', b.dataset.q === G.quality); b.onclick = () => { try { localStorage.setItem('fc3d_q', b.dataset.q); } catch (e) {} const u = new URL(location); u.searchParams.delete('q'); location = u; }; });
  // drive range (auto = the autopilot picks 2H/4H/4L from the ground)
  G.rangeMode = (() => { try { return localStorage.getItem('fc3d_range') || 'auto'; } catch (e) { return 'auto'; } })();
  const updRange = () => root.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', b.dataset.r === G.rangeMode));
  root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { G.rangeMode = b.dataset.r; if (b.dataset.r !== 'auto') VEH.ctrl.range = b.dataset.r; try { localStorage.setItem('fc3d_range', G.rangeMode); } catch (e) {} updRange(); sfx('switch'); });
  updRange();
  $('#repairBtn').onclick = () => {
    if (G.driving) return toast('停車中にしか直せない', 'warn');
    if (!DMG.dents.length && !DMG.scratches.length && G.state.hull >= 60) return toast('直すところはない', 'info'); // (hull damage alone also counts)
    repairAll(); G.state.hull = Math.max(G.state.hull, 60); toast('🔧 凹みを叩き出して、傷をタッチアップした', 'info'); refreshCar();
  };
  $('#ff').onclick = () => { G.timeMul = G.timeMul > 1 ? 1 : 30; $('#ff').classList.toggle('on', G.timeMul > 1); };
  $('#menuBtn').onclick = () => { initAudio(); const open = $('#menu').classList.toggle('hidden') === false; $('#sheet').classList.add('hidden'); $('#actToggle').classList.remove('on'); if (open) refreshCar(); };
  $('#closeMenu').onclick = closeAll;
  $('#mapBtn').onclick = () => { initAudio(); closeAll(); openTablet(); };
  $('#homeBtn').onclick = () => { closeAll(); bus.emit('rescueHome'); };
  $('#camBtn').onclick = () => { setView('chase'); $('#camBtn').classList.toggle('on', V.cam === 'chase'); };
  try { if (localStorage.getItem('fc3d_mute') === '1') $('#sndBtn').textContent = '🔇 オフ'; } catch (e) {}
  $('#sndBtn').onclick = () => {
    initAudio();
    // the stored preference is the truth: gain.value is mid-ramp for ~0.2s after setTargetAtTime,
    // so a quick double tap used to read the old level and leave button text / audio / storage out of sync
    let muted = false; try { muted = localStorage.getItem('fc3d_mute') === '1'; } catch (e) { muted = A.master.gain.value < 0.01; }
    const on = muted;
    A.master.gain.cancelScheduledValues(A.ctx.currentTime); A.master.gain.setTargetAtTime(on ? 0.9 : 0, A.ctx.currentTime, 0.05);
    $('#sndBtn').textContent = on ? '🔊 オン' : '🔇 オフ';
    try { localStorage.setItem('fc3d_mute', on ? '0' : '1'); } catch (e) {}
  };
  $('#restartBtn').onclick = () => { if (confirm('最初からやり直しますか？（車の傷も消えます）')) { try { ['fc3d_spot', 'fc3d_dmg'].forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); } };
  $('#apStop').onclick = () => disengage('自動運転を止めた');
  bus.on('drive', () => openTablet());
  // ---- virtual joystick (left side of the screen, appears where the thumb lands)
  const joy = $('#joy'), knob = $('#joyKnob'); let jid = null, jx = 0, jy = 0;
  const canvas = document.getElementById('c');
  canvas.addEventListener('pointerdown', e => {
    if (jid !== null || e.clientX > window.innerWidth * 0.42 || TAB.open) return;
    if (e.pointerType === 'mouse') return; // PC: WASD + mouse-look (view.js); the virtual stick is touch only
    jid = e.pointerId; jx = e.clientX; jy = e.clientY; initAudio();
    joy.style.left = jx + 'px'; joy.style.top = jy + 'px'; joy.classList.add('on');
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy), R = 52;
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    PL.move.x = dx / R; PL.move.y = -dy / R;
  });
  const jend = e => { if (e.pointerId !== jid) return; jid = null; PL.move.x = PL.move.y = 0; knob.style.transform = ''; joy.classList.remove('on'); };
  window.addEventListener('pointerup', jend); window.addEventListener('pointercancel', jend);
  // keyboard (PC dev convenience): WASD + mouse drag
  const keys = new Set(); let runToggle = false;
  window.addEventListener('keydown', e => { keys.add(e.code); if (e.repeat) return updKeys(); if (e.code === 'KeyE') $('#ctxBtn').click(); if (e.code === 'KeyM') TAB.open ? closeTablet() : openTablet(); if (e.code === 'Escape') { closeAll(); if (TAB.open) closeTablet(); } updKeys(); });
  window.addEventListener('blur', () => { keys.clear(); updKeys(); }); // alt-tab while holding W: don't walk forever
  window.addEventListener('keyup', e => { keys.delete(e.code); updKeys(); });
  function updKeys() { if (jid !== null) return; PL.move.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0); PL.move.y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0); PL.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || runToggle; }
  $('#runBtn').onclick = () => { runToggle = !runToggle; PL.run = runToggle; $('#runBtn').classList.toggle('on', runToggle); };
  // ---- context action (sit / lie / stand / door / tablet)
  $('#ctxBtn').onclick = () => {
    initAudio();
    const f = focusSpot(G.camper); if (!f) return;
    if (f.id === 'stand') standUp();
    else if (f.id === 'enter') goInside(G.camper);
    else if (f.door) { if (G.driving && VEH.speed > 0.8) return toast('走行中は外に出られない', 'warn'); goOutside(G.camper); }
    else if (f.tablet) openTablet();
    else sitAt(f.id);
  };
  bus.on('seatForDrive', () => { if (PL.inside && !PL.seat) sitAt('passenger'); });
  bus.on('arrived', id => { try { localStorage.setItem('fc3d_spot', id); } catch (e) {} });
  hud = { tm: $('#tm'), wx: $('#wx'), hull: $('#b-hull'), bat: $('#b-bat'), calm: $('#b-calm'), threat: $('#threat'), spot: $('#spot'), ctx: $('#ctxBtn'),
    ap: $('#apHud'), apDest: $('#apDest'), apSub: $('#apSub'), apBar: $('#apBar i'), spd: $('#apSpd'), gear: $('#apGear'), range: $('#apRange'), surf: $('#apSurf'),
    tilt: $('#apTilt'), tiltT: $('#apTiltT'), warn: $('#apWarn') };
  refresh();
}

function refreshCar() {
  const el = document.getElementById('carInfo'); if (!el) return;
  el.innerHTML = `<span>車体 ${Math.round(G.state.hull)}%</span><span>凹み ${DMG.dents.length}</span><span>傷 ${DMG.scratches.length}</span><span>浸水 ${Math.round(VEH.ingress * 100)}%</span>`;
}

export function refresh() {
  for (const a of ACTIONS) if (a.on) document.getElementById('a-' + a.id)?.classList.toggle('on', !!a.on());
}

export function updateUI() {
  if (!hud.tm) return;
  // the drive HUD updates every 2nd frame, the rest every 6th
  const fast = G.frame % 2 === 0, slow = G.frame % 6 === 0 || !hud.init;
  if (AP.on && fast) driveHud();
  if (!slow) return;
  hud.init = true;
  hud.tm.textContent = `${G.day}日目 ${fmtTime(G.hour)}`;
  hud.wx.textContent = ' ' + (WEATHERS[W.mode]?.label || '');
  const S = G.state, th = [];
  const set = (el, v) => { el.style.width = clamp(v, 0, 100) + '%'; el.parentElement.classList.toggle('low', v < 25); };
  set(hud.hull, S.hull); set(hud.bat, S.battery); set(hud.calm, S.calm);
  const pk = parkedAt(), nd = nearestDest();
  hud.spot.textContent = pk ? '📍 ' + DESTS[pk].name : `📍 ${nd.d.name}付近 ${Math.round(nd.dist)}m`;
  hud.spot.classList.toggle('hidden', AP.on);
  const f = focusSpot(G.camper);
  hud.ctx.classList.toggle('hidden', !f || TAB.open);
  if (f) hud.ctx.textContent = f.label;
  hud.ap.classList.toggle('hidden', !AP.on);
  if (VEH.up.y < 0.5) th.push('⚠ 横転している');
  else if (Math.abs(VEH.roll) > 0.35 && G.driving) th.push('⚠ 大きく傾いている');
  if (VEH.submerged > 0.25) th.push('🌊 水に浸かっている' + (VEH.ingress > 0.05 ? ` 浸水${Math.round(VEH.ingress * 100)}%` : ''));
  if (VEH.stuck >= 2 && !AP.on) th.push('🕳 タイヤが埋まっている'); // (G.driving is only ever true while AP.on: the old test could never fire)
  if (Z.bear?.active) th.push(Z.bear.state === 'charge' ? '🐻 突進してくる！' : '🐻 クマが近くにいる');
  if (Z.wolves?.[0]?.active) th.push('🐺 オオカミ');
  if (Z.deer?.[0]?.active) th.push('🦌 シカ');
  if (E.flood.on) th.push('🌊 増水 ' + Math.max(0, (G.waterLevel - G.camper.position.y) * 100).toFixed(0) + 'cm');
  if (E.slide?.on && !E.slide.done) th.push('⛰ 土砂崩れ');
  hud.threat.innerHTML = th.map(t => `<span>${t}</span>`).join('');
  document.getElementById('camBtn')?.classList.toggle('on', V.cam === 'chase'); // also when started with ?cam=chase
  document.getElementById('ff')?.classList.toggle('on', G.timeMul > 1);
  refresh();
  if (!$('#menu').classList.contains('hidden')) refreshCar();
}

const GEARTXT = { P: 'P', R: 'R', N: 'N' };
function driveHud() {
  const d = DESTS[AP.dest], D = VEH.drive;
  hud.apDest.textContent = d.name;
  if (AP.remain > (AP.total || 0)) AP.total = AP.remain;
  hud.apBar.style.width = clamp(100 * (1 - AP.remain / Math.max(AP.total, 1)), 0, 100) + '%';
  hud.spd.textContent = Math.abs(VEH.fwdSpeed * 3.6).toFixed(0);
  hud.gear.textContent = GEARTXT[D.mode] || 'D' + D.gear;
  hud.range.textContent = D.range; hud.range.classList.toggle('hot', D.range !== '2H');
  const sf = SURF[VEH.surface]; hud.surf.textContent = sf ? sf.name : '';
  hud.surf.classList.toggle('hot', VEH.mu < 0.45);
  const roll = VEH.roll || 0, deg = Math.round(Math.abs(roll) * 57.3);
  hud.tilt.setAttribute('transform', `rotate(${(-roll * 57.3).toFixed(1)})`);
  hud.tiltT.textContent = deg + '°'; hud.tilt.parentElement.parentElement.classList.toggle('hot', deg > 15);
  hud.apSub.textContent = { drive: `残り ${Math.round(AP.remain)} m`, right: '体勢を立て直し中…', winch: 'ウインチで引き上げ中…' }[AP.mode] || '';
  const w = [];
  if (D.abs) w.push('ABS');
  if (D.tcs) w.push('TCS');
  if (VEH.skid > 1.5) w.push('スリップ');
  if (VEH.stuck >= 2) w.push('スタック');
  if (VEH.submerged > 0.15) w.push('渡河');
  hud.warn.innerHTML = w.map(x => `<span>${x}</span>`).join('');
}
