// HUD & actions (landscape phone layout). All touch targets >= 44px.
import { G, bus, fmtTime, clamp } from './core.js';
import { VIEWS, V, setView } from './view.js';
import { PL, focusSpot, sitAt, standUp, goOutside, goInside } from './player.js';
import { openTablet, closeTablet, TAB, initTabletUI } from './tablet.js';
import { AP, disengage, parkedAt, nearestDest } from './autopilot.js';
import { VEH } from './vehicle.js';
import { DESTS } from './roads.js';
import { C, setCurtains, drawRadio } from './camper.js';
import { W, WEATHERS, setWeather } from './weather.js';
import { Z, scareAll, nearestAnimal } from './animals.js';
import { E, triggerEvent } from './events.js';

import { sfx, initAudio, A } from './audio.js';

const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

export const ACTIONS = [
  { id: 'lights', icon: '💡', label: '室内灯', on: () => G.state.lightsOn, act: () => { G.state.lightsOn = !G.state.lightsOn; sfx('switch'); } },
  { id: 'curtain', icon: '🪟', label: 'カーテン', on: () => (C.curtainTarget ?? 0) > 0.5, act: () => { const v = (C.curtainTarget ?? 0) > 0.5 ? 0 : 1; setCurtains(v); G.state.curtainsClosed = v > 0.5; sfx('curtain'); } },
  { id: 'hide', icon: '🤫', label: '息をひそめる', on: () => G.state.hiding, act: () => { G.state.hiding = !G.state.hiding; if (G.state.hiding) { G.state.lightsOn = false; G.state.spotOn = false; } } },
  { id: 'spot', icon: '🔦', label: '投光器', on: () => G.state.spotOn, act: () => { if (G.state.battery < 3) return toast('バッテリーが足りない', 'warn'); G.state.spotOn = !G.state.spotOn; sfx('switch'); if (G.state.spotOn) { G.state.noise = Math.max(G.state.noise, 0.4); if (Z.bear.active && distBear() < 25) { Z.bear.aggro -= 0.25; if (Z.bear.aggro < 0.4) scareAll(1); } } } },
  { id: 'horn', icon: '📯', label: 'クラクション', act: () => { sfx('horn'); G.state.noise = 1; const n = nearestAnimal(); scareAll(1.0); if (n) toast(n.a.kind === 'bear' ? (Z.bear.state === 'flee' ? 'クマが驚いて逃げていく！' : 'クマは怯まない…！') : '動物たちが逃げていく', n.a.kind === 'bear' ? 'warn' : 'info'); } },
  { id: 'cook', icon: '☕', label: 'お湯を沸かす', act: () => { G.state.cooking = 25; sfx('kettle'); toast('ケトルを火にかけた。温かい匂い…（クマが寄ってくるかも）', 'info'); } },
  { id: 'heater', icon: '🔥', label: 'ヒーター', on: () => G.state.heater, act: () => { G.state.heater = !G.state.heater; sfx('switch'); } },
  { id: 'gen', icon: '⚡', label: '発電機', on: () => G.state.generator, act: () => { G.state.generator = !G.state.generator; G.state.noise = Math.max(G.state.noise, 0.3); toast(G.state.generator ? '発電機を回した（音で動物が警戒する）' : '発電機を止めた', 'info'); } },
  { id: 'radio', icon: '📻', label: 'ラジオ', on: () => G.state.radio, act: () => { G.state.radio = !G.state.radio; radioNews(); } },
  { id: 'tablet', icon: '🗺', label: '地図/自動運転', act: () => openTablet() },
  { id: 'head', icon: '🚨', label: 'ライト', on: () => G.state.headOn, act: () => { G.state.headOn = !G.state.headOn; sfx('switch'); } },
];
function distBear() { return Math.hypot(Z.bear.pos.x - G.camper.position.x, Z.bear.pos.z - G.camper.position.z); }

let toastEl, hud = {};
export function toast(msg, level = 'info', ms = 4000) {
  if (!toastEl) return;
  const t = h('div', { className: 'toast ' + level }, msg);
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

export function buildUI() {
  const root = $('#ui');
  root.innerHTML = `
  <div id="topbar">
    <div id="clock"><span id="tm">--:--</span><span id="wx"></span></div>
    <div class="bars">
      <div class="bar" title="車体"><i>🛻</i><b id="b-hull"></b></div>
      <div class="bar" title="バッテリー"><i>🔋</i><b id="b-bat"></b></div>
      <div class="bar" title="安心度"><i>💗</i><b id="b-calm"></b></div>
    </div>
    <div id="spot"></div>
    <button id="camBtn" data-touch class="round" title="視点">🎥</button>
    <button id="menuBtn" data-touch class="round">☰</button>
  </div>
  <div id="apHud" class="hidden"><div id="apDest"></div><div id="apBar"><i></i></div><div id="apSub"></div><button data-touch class="chip" id="apStop">■ 停車</button></div>
  <div id="joy"><div id="joyKnob"></div></div>
  <button id="runBtn" data-touch class="round small">🏃</button>
  <button id="ctxBtn" data-touch class="ctx hidden"></button>
  <button id="actToggle" data-touch class="round">🧰</button>
  <div id="actions" class="hidden"></div>
  <div id="threat"></div>
  <div id="toasts"></div>
  <div id="menu" class="hidden">
    <div class="panel">
      <h2>森の奥のキャンプカー</h2>
      <div class="row"><span>サウンド</span><div><button data-touch class="chip" id="sndBtn">🔊 オン</button><button data-touch class="chip" id="restartBtn">最初から</button></div></div>
      <div class="row"><span>画質</span><div><button data-touch class="chip" data-q="u">ウルトラ</button><button data-touch class="chip" data-q="h">高</button><button data-touch class="chip" data-q="m">軽量</button></div></div>
      <div class="row"><span>ワープ</span><div><button data-touch class="chip" id="homeBtn">キャンプ地へ戻す（困ったとき）</button></div></div>
      <h3 class="sub">鑑賞モード（自由に天気・時間・出来事を起こせます）</h3>
      <div class="row"><span>天気</span><div id="wxBtns"></div></div>
      <div class="row"><span>時間</span><div><button data-touch class="chip" data-t="-3">−3h</button><button data-touch class="chip" data-t="3">+3h</button><button data-touch class="chip" id="ff">早送り</button></div></div>
      <div class="row"><span>出来事</span><div id="evBtns"></div></div>
      <button data-touch class="chip wide" id="closeMenu">閉じる</button>
    </div>
  </div>`;
  initTabletUI(document.body);
  toastEl = $('#toasts');
  const aEl = $('#actions');
  for (const a of ACTIONS) {
    const b = h('button', { className: 'abtn', id: 'a-' + a.id }, `<span>${a.icon}</span><small>${a.label}</small>`); b.dataset.touch = 1;
    b.onclick = () => { initAudio(); a.act(); refresh(); }; aEl.appendChild(b);
  }
  $('#actToggle').onclick = () => { initAudio(); $('#actions').classList.toggle('hidden'); $('#actToggle').classList.toggle('on'); };
  const wx = $('#wxBtns');
  for (const [k, w] of Object.entries(WEATHERS)) { const b = h('button', { className: 'chip' }, w.label); b.dataset.touch = 1; b.onclick = () => setWeather(k); wx.appendChild(b); }
  const ev = $('#evBtns');
  for (const [k, l] of [['deer', 'シカ'], ['bear', 'クマ'], ['wolves', 'オオカミ'], ['landslide', '土砂崩れ'], ['flood', '洪水'], ['tree', '倒木']]) {
    const b = h('button', { className: 'chip' }, l); b.dataset.touch = 1; b.onclick = () => { triggerEvent(k); $('#menu').classList.add('hidden'); }; ev.appendChild(b);
  }
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { G.hour = (G.hour + parseFloat(b.dataset.t) + 24) % 24; });
  root.querySelectorAll('[data-q]').forEach(b => { b.classList.toggle('on', b.dataset.q === G.quality); b.onclick = () => { try { localStorage.setItem('fc3d_q', b.dataset.q); } catch (e) {} const u = new URL(location); u.searchParams.delete('q'); location = u; }; });
  $('#ff').onclick = () => { G.timeMul = G.timeMul > 1 ? 1 : 30; $('#ff').classList.toggle('on', G.timeMul > 1); };
  $('#menuBtn').onclick = () => { initAudio(); $('#menu').classList.toggle('hidden'); };
  $('#closeMenu').onclick = () => $('#menu').classList.add('hidden');
  $('#homeBtn').onclick = () => { $('#menu').classList.add('hidden'); bus.emit('rescueHome'); };
  $('#camBtn').onclick = () => { setView('chase'); $('#camBtn').classList.toggle('on', V.cam === 'chase'); };
  try { if (localStorage.getItem('fc3d_mute') === '1') $('#sndBtn').textContent = '🔇 オフ'; } catch (e) {}
  $('#sndBtn').onclick = () => {
    initAudio();
    const on = A.master.gain.value < 0.01;
    A.master.gain.setTargetAtTime(on ? 0.9 : 0, A.ctx.currentTime, 0.05);
    $('#sndBtn').textContent = on ? '🔊 オン' : '🔇 オフ';
    try { localStorage.setItem('fc3d_mute', on ? '0' : '1'); } catch (e) {}
  };
  $('#restartBtn').onclick = () => { if (confirm('最初からやり直しますか？')) { try { localStorage.removeItem('fc3d_spot'); } catch (e) {} location.reload(); } };
  $('#apStop').onclick = () => disengage('自動運転を止めた');
  bus.on('drive', () => openTablet());
  // ---- virtual joystick (left side of the screen, appears where the thumb lands)
  const joy = $('#joy'), knob = $('#joyKnob'); let jid = null, jx = 0, jy = 0;
  const canvas = document.getElementById('c');
  canvas.addEventListener('pointerdown', e => {
    if (jid !== null || e.clientX > window.innerWidth * 0.42 || TAB.open) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
  const keys = new Set();
  window.addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyE') $('#ctxBtn').click(); if (e.code === 'KeyM') TAB.open ? closeTablet() : openTablet(); updKeys(); });
  window.addEventListener('keyup', e => { keys.delete(e.code); updKeys(); });
  function updKeys() { if (jid !== null) return; PL.move.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0); PL.move.y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0); PL.run = keys.has('ShiftLeft'); }
  $('#runBtn').onclick = () => { PL.run = !PL.run; $('#runBtn').classList.toggle('on', PL.run); };
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
  // after starting the autopilot from the tablet: sit down in the passenger seat if walking around
  bus.on('seatForDrive', () => { if (PL.inside && !PL.seat) sitAt('passenger'); });
  bus.on('arrived', id => { try { localStorage.setItem('fc3d_spot', id); } catch (e) {} });
  hud = { tm: $('#tm'), wx: $('#wx'), hull: $('#b-hull'), bat: $('#b-bat'), calm: $('#b-calm'), threat: $('#threat'), spot: $('#spot'), ctx: $('#ctxBtn'),
    ap: $('#apHud'), apDest: $('#apDest'), apSub: $('#apSub'), apBar: $('#apBar i') };
  refresh();
}

export function refresh() {
  for (const a of ACTIONS) if (a.on) document.getElementById('a-' + a.id)?.classList.toggle('on', !!a.on());
}

export function updateUI() {
  if (!hud.tm || (G.frame % 6 && hud.init)) return;
  hud.init = true;
  hud.tm.textContent = `${G.day}日目 ${fmtTime(G.hour)}`;
  hud.wx.textContent = ' ' + (WEATHERS[W.mode]?.label || '');
  const S = G.state, th = [];
  const set = (el, v) => { el.style.width = clamp(v, 0, 100) + '%'; el.classList.toggle('low', v < 25); };
  set(hud.hull, S.hull); set(hud.bat, S.battery); set(hud.calm, S.calm);
  const pk = parkedAt(), nd = nearestDest();
  hud.spot.textContent = G.driving ? `🚐 ${Math.abs(VEH.fwdSpeed * 3.6).toFixed(0)}km/h` : pk ? '📍' + DESTS[pk].name : `📍${nd.d.name}付近（${Math.round(nd.dist)}m）`;
  // context button
  const f = focusSpot(G.camper);
  hud.ctx.classList.toggle('hidden', !f || TAB.open);
  if (f) hud.ctx.textContent = f.label;
  // autopilot HUD
  hud.ap.classList.toggle('hidden', !AP.on);
  if (AP.on) {
    const d = DESTS[AP.dest];
    hud.apDest.textContent = '🧭 ' + d.name;
    AP.total = Math.max(AP.total || 0, AP.remain);
    hud.apBar.style.width = clamp(100 * (1 - AP.remain / Math.max(AP.total, 1)), 0, 100) + '%';
    hud.apSub.textContent = { drive: `残り ${Math.round(AP.remain)}m ・ ${Math.abs(VEH.fwdSpeed * 3.6).toFixed(0)}km/h`, right: '体勢を立て直し中…', winch: 'ウインチで引き上げ中…' }[AP.mode] || '';
  } else AP.total = 0;
  if (VEH.up.y < 0.5) th.push('⚠ 横転している');
  if (Z.bear?.active) th.push(Z.bear.state === 'charge' ? '🐻 突進してくる！' : '🐻 クマが近くにいる');
  if (Z.wolves?.[0]?.active) th.push('🐺 オオカミ');
  if (Z.deer?.[0]?.active) th.push('🦌 シカ');
  if (E.flood.on) th.push('🌊 増水 ' + Math.max(0, (G.waterLevel - G.camper.position.y) * 100).toFixed(0) + 'cm');
  if (E.slide?.on && !E.slide.done) th.push('⛰ 土砂崩れ');
  hud.threat.innerHTML = th.map(t => `<span>${t}</span>`).join('');
  refresh();
}
