// Entry: renderer, post FX (bloom + cinematic grade/vignette/grain + rain lens), loop, driving.
import { THREE, G, U, P, QA, bus, clamp, damp, lerp, smooth } from './core.js';
import { setAniso, progress } from './assets.js';
import { buildTerrain, heightAt, SPOTS, spotHeight, drivePath } from './terrain.js';
import { buildForest, camp, updateForest } from './forest.js';
import { buildCamper, updateCamper, C } from './camper.js';
import { buildWeather, updateWeather, W } from './weather.js';
import { buildAnimals, updateAnimals, Z } from './animals.js';
import { buildEvents, updateEvents, E } from './events.js';
import { initView, updateView, V } from './view.js';
import { buildUI, updateUI, toast } from './ui.js';
import { initAudio, updateAudio, sfx } from './audio.js';
import { glassShared } from './glass.js';
import { EffectComposer } from './lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './lib/addons/postprocessing/ShaderPass.js';
import { OutputPass } from './lib/addons/postprocessing/OutputPass.js';

window.__QA = { ready: false, fps: 0 };
if (QA) { window.__G = G; import('./view.js').then(m => window.__V = m.V); }
window.__QA.resume = () => { window.__QA.run = true; requestAnimationFrame(loop); };
const loadEl = document.getElementById('loading');
const barEl = document.getElementById('loadbar');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const maxDPR = G.quality === 'm' ? 1.25 : (QA ? 1 : 2.0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDPR));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
setAniso(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
G.renderer = renderer;

const scene = new THREE.Scene(); G.scene = scene;
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.03, 3000); G.camera = camera;
scene.add(camera);

// PMREM env from the sky for reflections
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envTimer = 0;
function updateEnv() {
  const s = new THREE.Scene();
  s.add(W.sky.clone()); s.add(W.dome.clone());
  s.background = null;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(s, 0, 1, 5000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = lerp(0.08, 1.0, G.daylight) * lerp(1, 0.55, G.cloud);
}

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: G.quality === 'm' ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.45, 0.92);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: U.uTime, uVig: { value: 0.35 }, uGrain: { value: 0.018 }, uRed: { value: 0 },
    uWarm: { value: 0 }, uLens: { value: 0 }, uAspect: { value: 1.7 }, uDark: { value: 0 }, uSub: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uRed, uWarm, uLens, uAspect, uDark, uSub; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      // underwater-ish wobble when the flood reaches the floor
      uv += vec2(sin(uv.y*30. + uTime*2.), cos(uv.x*25. + uTime*1.7))*0.002*uSub;
      // chromatic aberration at edges
      vec2 d = uv - .5; float r2 = dot(d,d);
      vec3 c;
      c.r = texture2D(tDiffuse, uv - d*r2*0.012).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv + d*r2*0.012).b;
      // warm/cool split-tone grade
      float l = dot(c, vec3(0.299,0.587,0.114));
      vec3 shadowT = mix(vec3(0.92,1.0,1.08), vec3(1.0), smoothstep(0.0, 0.5, l));
      vec3 hiT = mix(vec3(1.0), vec3(1.07,1.0,0.9), smoothstep(0.3, 1.0, l));
      c *= mix(vec3(1.), shadowT*hiT, 0.8);
      c = mix(c, c*vec3(1.08,0.98,0.86), uWarm);
      c = mix(vec3(l), c, 1.06);
      // vignette
      vec2 vd = d*vec2(uAspect, 1.); float v = smoothstep(0.95, 0.2, length(vd)*0.9);
      c *= mix(1.0, v, uVig + uDark*0.4);
      // danger pulse
      c = mix(c, c*vec3(1.35,0.55,0.5), uRed*(0.5+0.5*sin(uTime*6.))*smoothstep(0.2, 0.9, length(vd)));
      // film grain
      c += (h(uv*vec2(1920.,1080.) + fract(uTime)*100.) - 0.5) * uGrain;
      gl_FragColor = vec4(max(c, 0.), 1.);
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  grade.uniforms.uAspect.value = w / h;
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- camper placement & driving
function placeCamper(spot) {
  const s = SPOTS[spot]; G.camperSpot = spot;
  C.group.position.set(s.x, spotHeight(spot), s.z);
  C.group.rotation.set(0, s.rot, 0);
}
const drive = { on: false, path: [], t: 0, len: 0, to: null };
bus.on('driveTo', to => {
  if (to === G.camperSpot) return toast('もうここに停まっている', 'info');
  if (G.state.hull < 5) return toast('車が動かない…', 'danger');
  const pts = drivePath(G.camperSpot, to);
  drive.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); drive.len = drive.curve.getLength();
  drive.t = 0; drive.on = true; drive.to = to; G.driving = true;
  G.state.noise = 1; sfx('engine');
  toast(`${SPOTS[to].name}へ移動する…`, 'info');
  import('./view.js').then(m => m.setView('driver'));
});
const _t = new THREE.Vector3(), _a = new THREE.Vector3();
function updateDrive(dt) {
  if (!drive.on) { G.driveSpeed = 0; return; }
  const bogged = G.submerge > 0.5 ? 0.35 : 1;
  const sp = 5.5 * bogged * smooth(0, 0.06, drive.t) * (1 - smooth(0.9, 1, drive.t) * 0.8);
  G.driveSpeed = sp;
  drive.t = Math.min(1, drive.t + sp * dt / drive.len + (sp < 0.3 ? dt * 0.002 : 0));
  drive.curve.getPointAt(drive.t, _t);
  drive.curve.getTangentAt(Math.min(drive.t, 0.999), _a);
  const y = heightAt(_t.x, _t.z);
  C.group.position.set(_t.x, y, _t.z);
  const yaw = Math.atan2(-_a.x, -_a.z);
  let d = yaw - C.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  C.group.rotation.y += d * Math.min(1, dt * 3);
  // pitch from terrain: _a points forward; nose up (+rotation.x tilts local -z upward) when climbing
  const f = heightAt(_t.x + _a.x * 2, _t.z + _a.z * 2) - heightAt(_t.x - _a.x * 2, _t.z - _a.z * 2);
  drive.pitch = damp(drive.pitch || 0, Math.atan2(f, 4), 3, dt);
  C.group.rotation.x = drive.pitch;
  G.shake = Math.max(G.shake, 0.12 + Math.random() * 0.05);
  if (drive.t >= 1) {
    drive.on = false; G.driving = false; drive.pitch = 0;
    G.camperSpot = drive.to;
    placeCamper(drive.to); // path ends aligned with the pad heading, so this snap is sub-degree
    toast(`${SPOTS[drive.to].name}に到着。エンジンを切った`, 'info');
    bus.emit('arrived', drive.to);
  }
}

// camper rocking (spring) from impacts & wind
function updateRock(dt) {
  G.rockAngle = G.rockAngle || 0; G.rockV = G.rockV || 0;
  const windF = (G.wind > 0.7 ? Math.sin(G.t * 1.7) * Math.sin(G.t * 0.63) * 0.004 * G.wind : 0);
  G.rockV = (G.rockV || 0) + (-G.rockAngle * 60 - G.rockV * 6) * dt + windF;
  G.rockAngle += G.rockV * dt;
  if (!drive.on) {
    C.group.rotation.z = G.rockAngle;
    const sub = G.submerge || 0;
    // floating/bobbing when water gets high
    C.group.rotation.x = damp(C.group.rotation.x, sub > 0.6 ? Math.sin(G.t * 0.8) * 0.015 : 0, 2, dt);
  }
}

bus.on('gameover', src => {
  if (G.state.over) return; G.state.over = true;
  const why = { bear: 'クマの攻撃で車体が壊れた…', flood: '濁流に飲み込まれた…', rock: '土砂に埋もれた…', tree: '倒木が屋根を突き破った…' }[src] || '限界だ…';
  document.getElementById('over').innerHTML = `<div class="panel"><h2>${why}</h2><p>${G.day}日目 ${Math.floor(G.hour)}時 / 生き延びた夜: ${G.state.nightsSurvived}</p><button data-touch class="chip wide" onclick="location.reload()">もう一度</button></div>`;
  document.getElementById('over').classList.remove('hidden');
});

// ---------------------------------------------------------------- start
async function init() {
  buildWeather(scene, renderer); W.renderer = renderer;
  buildTerrain(scene);
  buildCamper(scene);
  placeCamper(P.get('spot') || 'hollow');
  await buildForest(scene);
  await buildAnimals(scene);
  buildEvents(scene);
  initView(canvas);
  if (P.has('hide')) for (const k of P.get('hide').split(',')) { if (k === 'curtains') C.curtains.forEach(c => c.visible = false); if (k === 'glass') Object.values(C.glass).forEach(g => g.visible = false); }
  buildUI();
  resize();
  updateWeather(0.016, camera);
  updateEnv();
  // warm up shaders
  renderer.compile(scene, camera);
  loadEl.classList.add('done');
  setTimeout(() => loadEl.remove(), 1200);
  if (!QA) {
    let seen = false; try { seen = localStorage.getItem('fc3d_intro') === '1'; } catch (e) {}
    if (!seen) showIntro(); else toast('森の奥、沢沿いの窪地。今夜はここで過ごそう。', 'info', 5500);
  }
  // first gesture: audio + fullscreen landscape lock
  const first = async () => {
    initAudio();
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
    try { await screen.orientation.lock('landscape'); } catch (e) {}
  };
  window.addEventListener('pointerdown', first, { once: true });
  requestAnimationFrame(loop);
}
const loadTick = setInterval(() => { if (progress.total) barEl.style.width = (100 * progress.loaded / progress.total) + '%'; }, 100);

let last = performance.now(), fpsAcc = 0, fpsN = 0, qaFrames = 0;
document.addEventListener('visibilitychange', () => { last = performance.now(); });
function loop(now) {
  if (QA && window.__QA.ready && !window.__QA.run) { window.__QA.frozen = true; return; }
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (QA) dt = 1 / 30;
  G.dt = dt; G.t += dt; G.frame++;
  U.uTime.value = G.t;
  // time of day
  if (!QA) {
    const prev = G.hour;
    G.hour += dt * G.hoursPerSec * G.timeMul;
    if (G.hour >= 24) { G.hour -= 24; G.day++; }
    if (prev < 6 && G.hour >= 6 && G.state.lastDawnDay !== G.day) { G.state.lastDawnDay = G.day; G.state.nightsSurvived++; toast(`🌅 夜が明けた。${G.state.nightsSurvived}夜目を越えた`, 'info', 5000); }
  }
  updateDrive(dt);
  updateRock(dt);
  C.group.updateMatrixWorld(true);
  updateWeather(dt, camera);
  if (!G.state.over) { updateEvents(dt); updateAnimals(dt); }
  updateCamper(dt);
  updateView(dt, camera);
  updateForest(camera.position);
  updateAudio(dt);
  updateUI();
  // campfire at dusk/night when calm
  camp.fireLight.intensity = G.night > 0.4 && G.rain < 0.3 ? 6 * (0.8 + Math.sin(G.t * 11) * 0.1 + Math.sin(G.t * 23) * 0.08) : 0;
  // glass condensation: rises with cold + heater/cooking inside
  glassShared.uFogGlass.value = damp(glassShared.uFogGlass.value, clamp(G.rain * 0.35 + (G.state.cooking > 0 ? 0.5 : 0) + G.night * 0.1), 0.1, dt);
  // env map refresh (sky changes slowly)
  envTimer -= dt; if (envTimer < 0) { envTimer = QA ? 1e9 : 4; updateEnv(); }
  // exposure: eye adapts inside vs night
  const inside = !VIEWS_out();
  const target = lerp(1.25, 0.72, G.daylight) * (inside ? 1 : 0.9) + (G.state.lightsOn ? -0.1 * G.night : 0.35 * G.night);
  renderer.toneMappingExposure = damp(renderer.toneMappingExposure, target, 1.5, dt);
  const gu = grade.uniforms;
  gu.uWarm.value = C.lightLevel * G.night * 0.25;
  gu.uRed.value = damp(gu.uRed.value, Z.bear?.state === 'charge' || G.state.hull < 25 ? 0.35 : 0, 3, dt);
  gu.uDark.value = G.state.hiding ? 1 : 0;
  gu.uSub.value = clamp((G.submerge || 0) - 0.5);
  bloom.strength = 0.28 + G.night * 0.14 + G.flash * 0.5;
  if (P.has('nopost')) renderer.render(scene, camera); else composer.render(dt);
  // fps
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { window.__QA.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  window.__QA.frames = qaFrames + 1;
  if (QA && ++qaFrames === (parseInt(P.get('frames')) || 6)) { window.__QA.ready = true; try { window.__QA.shot = canvas.toDataURL('image/jpeg', 0.9); } catch (e) { window.__QA.shotErr = String(e); }
    // subject diagnostics: where are active animals on screen (NDC) and are they visible?
    window.__QA.subjects = [...Z.deer, ...Z.fawns, Z.bear, ...Z.wolves].filter(a => a && a.active).map(a => {
      const p = a.pos.clone(); p.y += 0.6; const n = p.clone().project(camera);
      return { k: a.kind, st: a.state, vis: a.obj.visible, pos: a.pos.toArray().map(v => +v.toFixed(1)), ndc: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(3)] };
    });
    window.__QA.cam = camera.position.toArray().map(v => +v.toFixed(2)).concat(G.camper.position.toArray().map(v => +v.toFixed(2))); window.__QA.exp = renderer.toneMappingExposure; window.__QA.fogD = scene.fog.density; window.__QA.info = renderer.info.render;
    window.__QA.state = { ...G.state, hour: G.hour, weather: W.mode, water: G.waterLevel }; }
}
function showIntro() {
  const el = document.getElementById('intro');
  el.innerHTML = `<div class="panel intro">
    <h2>森の奥のキャンプカー</h2>
    <p>林道の先、沢沿いの窪地に車を停めた。<br>雨の音を聞きながら、夜を越えよう。</p>
    <ul>
      <li><b>ドラッグ</b>で見回す／<b>ピンチ</b>で窓の外を覗く</li>
      <li>左のボタンで<b>席を移動</b>（ソファ・運転席・ベッド…）</li>
      <li>夜は<b>クマ</b>が来る。料理の匂いと明かりに注意。<b>息をひそめる</b>か<b>投光器・クラクション</b>で追い払う</li>
      <li>長雨は<b>洪水</b>・<b>土砂崩れ</b>を呼ぶ。窪地は水に弱く、高台は土砂に弱い。<b>🚐移動</b>で避難</li>
      <li>🛻車体が0になったら終わり。🔋電気は太陽と発電機で回復</li>
    </ul>
    <button data-touch class="chip wide" id="introGo">はじめる</button></div>`;
  el.classList.remove('hidden');
  document.getElementById('introGo').onclick = () => {
    el.classList.add('hidden');
    try { localStorage.setItem('fc3d_intro', '1'); } catch (e) {}
    toast('森の奥、沢沿いの窪地。今夜はここで過ごそう。', 'info', 5500);
  };
}
function VIEWS_out() { return V.cur === 'outside'; }

init().catch(e => { console.error(e); loadEl.innerHTML = '<p style="color:#f88">読み込みエラー: ' + e.message + '</p>'; window.__QA.error = String(e); window.__QA.ready = true; });
