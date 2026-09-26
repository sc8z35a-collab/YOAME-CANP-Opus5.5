// Fully procedural WebAudio soundscape: rain on roof (muffled inside), wind gusts, creek,
// crickets/owl at night, birds in the morning, thunder with distance delay, bear growl/impacts,
// landslide rumble, flood roar, kettle, radio hiss. No audio files required.
import { G, bus, clamp, lerp } from './core.js';
import { E } from './events.js';
import { Z } from './animals.js';

export const A = { ctx: null, on: false, master: null, nodes: {} };

function noiseBuffer(ctx, sec = 4, color = 'white') {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.8; }
      else d[i] = w;
    }
  }
  return b;
}

function loop(buf, dest, { type = 'lowpass', f = 1000, q = 0.7, gain = 0 } = {}) {
  const c = A.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(fl).connect(g).connect(dest); s.start(0, Math.random() * 2);
  return { s, f: fl, g };
}

export function initAudio() {
  if (A.ctx) { A.ctx.resume(); return; }
  const c = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = A.master = c.createGain(); master.gain.value = 0.9;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  // "inside the camper" filter: lowers highs of outside sounds when not driving door open
  const outside = c.createBiquadFilter(); outside.type = 'lowpass'; outside.frequency.value = 2400;
  // small-room reverb
  const conv = c.createConvolver(); conv.buffer = impulse(c, 0.6, 3); const wet = c.createGain(); wet.gain.value = 0.18;
  outside.connect(master); outside.connect(conv).connect(wet).connect(master);
  master.connect(comp).connect(c.destination);
  A.outside = outside; A.inside = master;
  const white = noiseBuffer(c, 4), pink = noiseBuffer(c, 5, 'pink'), brown = noiseBuffer(c, 6, 'brown');
  A.brown = brown; A.white = noiseBuffer(c, 1);
  const N = A.nodes;
  // rain on the roof (inside, close, drum-like): pink band + drop ticks
  N.roof = loop(pink, master, { type: 'bandpass', f: 1400, q: 0.6 });
  N.roofLow = loop(brown, master, { type: 'lowpass', f: 380 });
  N.rainOut = loop(white, outside, { type: 'highpass', f: 2500 });
  N.wind = loop(pink, outside, { type: 'bandpass', f: 500, q: 1.4 });
  N.creek = loop(white, outside, { type: 'bandpass', f: 900, q: 0.4 });
  N.flood = loop(brown, outside, { type: 'lowpass', f: 260 });
  N.rumble = loop(brown, master, { type: 'lowpass', f: 90 });
  N.hiss = loop(white, master, { type: 'bandpass', f: 3500, q: 2 });
  N.hum = osc(55, 'sawtooth', master, 0);
  N.heater = loop(pink, master, { type: 'lowpass', f: 600 });
  A.on = true;
  // drip ticks on roof
  setInterval(() => { if (G.rain > 0.1 && A.on) for (let i = 0; i < 1 + G.rain * 5; i++) setTimeout(tick, Math.random() * 250); }, 250);
  // ambient life
  setInterval(ambient, 1000);
  bus.on('sfx', (n, p) => sfx(n, p));
  // phone: pause everything when the app is backgrounded / screen locked, resume on return
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { A.on = false; c.suspend(); } else { c.resume(); A.on = true; }
  });
  bus.on('thunder', ({ dist, delay }) => setTimeout(() => thunder(dist), Math.min(delay, 4) * 1000));
  bus.on('bearcharge', () => sfx('growl', 1));
  bus.on('animal', k => { if (k === 'wolf') setTimeout(() => howl(), 1500); if (k === 'bear') setTimeout(() => sfx('growl', 0.5), 4000); });
  bus.on('glasscrack', () => sfx('glass', 1));
}

function osc(f, type, dest, gain) {
  const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = A.ctx.createGain(); g.gain.value = gain; o.connect(g).connect(dest); o.start(); return { o, g };
}
function impulse(c, sec, decay) {
  const n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function env(g, t0, a, peak, d) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function burst(dest, { f = 800, type = 'bandpass', q = 1, a = 0.005, d = 0.2, peak = 0.3, rate = 1 } = {}) {
  const c = A.ctx, s = c.createBufferSource(); s.buffer = A.white ||= noiseBuffer(c, 1); s.playbackRate.value = rate;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); s.connect(fl).connect(g).connect(dest);
  const t = c.currentTime; env(g, t, a, peak, d); s.start(t, Math.random()); s.stop(t + a + d + 0.1);
  return fl;
}
function tone(dest, f0, f1, dur, type = 'sine', peak = 0.2, a = 0.01) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
  const t = c.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(g).connect(dest); env(g, t, a, peak, dur); o.start(t); o.stop(t + dur + a + 0.1);
}

function tick() { burst(A.inside, { f: 2500 + Math.random() * 3000, q: 4, d: 0.03 + Math.random() * 0.04, peak: 0.04 + Math.random() * 0.05 * G.rain }); }

function thunder(dist) {
  const near = clamp(1 - dist / 400);
  const c = A.ctx, t = c.currentTime;
  const s = c.createBufferSource(); s.buffer = A.brown; // cached: no per-strike allocation
  const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lerp(300, 1600, near), t); fl.frequency.exponentialRampToValueAtTime(80, t + 5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lerp(0.4, 1.6, near), t + (near > 0.7 ? 0.02 : 0.4));
  g.gain.exponentialRampToValueAtTime(lerp(0.2, 0.6, near), t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
  s.connect(fl).connect(g).connect(A.master); s.start(t); s.stop(t + 6.5);
  if (near > 0.7) burst(A.master, { f: 3000, type: 'highpass', d: 0.25, peak: 0.6 });
  G.shake = Math.max(G.shake, near * 0.3);
}

function howl() {
  const c = A.ctx;
  for (let k = 0; k < 2; k++) setTimeout(() => {
    const o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain();
    o.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 5;
    v.frequency.value = 5; vg.gain.value = 8; v.connect(vg).connect(o.frequency);
    const t = c.currentTime, b = 380 + k * 70;
    o.frequency.setValueAtTime(b, t); o.frequency.linearRampToValueAtTime(b * 1.6, t + 0.8); o.frequency.linearRampToValueAtTime(b * 1.45, t + 2.4); o.frequency.linearRampToValueAtTime(b * 0.9, t + 3.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.3);
    o.connect(f).connect(g).connect(A.outside); o.start(t); v.start(t); o.stop(t + 3.5); v.stop(t + 3.5);
  }, k * 900);
}

export function sfx(name, p = 1) {
  if (!A.ctx) return;
  const O = A.outside, M = A.master;
  switch (name) {
    case 'growl': {
      const c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 70; lfo.frequency.value = 23; lg.gain.value = 25; lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * p, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(f).connect(g).connect(O); o.start(t); lfo.start(t); o.stop(t + 2); lfo.stop(t + 2);
      burst(O, { f: 300, q: 0.8, a: 0.2, d: 1.4, peak: 0.25 * p });
      break;
    }
    case 'bearhit': case 'thud':
      tone(M, 110, 38, 0.5, 'sine', 0.9 * p, 0.004);
      burst(M, { f: 400, type: 'lowpass', d: 0.35, peak: 0.7 * p });
      burst(M, { f: 2200, q: 2, d: 0.12, peak: 0.25 * p });
      if (name === 'bearhit') setTimeout(() => burst(M, { f: 5000, type: 'highpass', d: 0.4, peak: 0.12 }), 60);
      break;
    case 'glass':
      for (let i = 0; i < 6; i++) setTimeout(() => tone(M, 3000 + Math.random() * 4000, 2000, 0.15, 'triangle', 0.06), i * 25);
      burst(M, { f: 6000, type: 'highpass', d: 0.3, peak: 0.25 });
      break;
    case 'crack':
      for (let i = 0; i < 10; i++) setTimeout(() => burst(O, { f: 1200 + Math.random() * 1500, q: 3, d: 0.05, peak: 0.5 }), i * 70 + Math.random() * 60);
      break;
    case 'horn': {
      const c = A.ctx, t = c.currentTime;
      for (const f of [415, 523]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.setValueAtTime(0.14, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o.connect(fl).connect(g).connect(M); o.start(t); o.stop(t + 1.1); }
      break;
    }
    case 'switch': burst(M, { f: 3000, q: 3, d: 0.03, peak: 0.2 }); tone(M, 1800, 1200, 0.03, 'square', 0.03); break;
    case 'curtain': burst(M, { f: 2200, q: 0.5, a: 0.05, d: 0.5, peak: 0.08 }); break;
    case 'engine': {
      const c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(30, t); o.frequency.linearRampToValueAtTime(48, t + 1.2);
      const f = c.createBiquadFilter(); f.frequency.value = 300; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      o.connect(f).connect(g).connect(M); o.start(t); o.stop(t + 2.6); break;
    }
    case 'powerdown': tone(M, 220, 40, 0.8, 'sawtooth', 0.1); break;
    case 'rumble': A.rumbleT = 12; break;
    case 'flood': A.floodT = 1; break;
    case 'kettle': A.kettleT = 20; break;
  }
}

let owlT = 20, birdT = 5, cricketT = 0;
function ambient() {
  if (!A.on) return;
  const n = G.night, day = G.daylight;
  // crickets
  if (n > 0.5 && G.rain < 0.3 && Math.random() < 0.9) {
    for (let i = 0; i < 3; i++) setTimeout(() => tone(A.outside, 4400 + Math.random() * 300, 4300, 0.04, 'sine', 0.012), i * 60);
  }
  owlT -= 1;
  if (n > 0.6 && G.rain < 0.3 && owlT < 0) { owlT = 25 + Math.random() * 40; [0, 500, 900].forEach((d, i) => setTimeout(() => tone(A.outside, i === 1 ? 420 : 380, 330, i === 1 ? 0.5 : 0.35, 'sine', 0.06, 0.06), d)); }
  birdT -= 1;
  if (day > 0.5 && G.rain < 0.2 && birdT < 0) {
    birdT = 2 + Math.random() * 6;
    const base = 2200 + Math.random() * 2000;
    const n2 = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n2; i++) setTimeout(() => tone(A.outside, base * (1 + Math.random() * 0.3), base * 0.8, 0.08 + Math.random() * 0.08, 'sine', 0.025), i * 120);
  }
  // deer bark sometimes
  if (Z.deer?.[0]?.active && Math.random() < 0.05) burst(A.outside, { f: 700, q: 2, a: 0.01, d: 0.2, peak: 0.1 });
}

export function updateAudio(dt) {
  if (!A.on) return;
  const N = A.nodes, t = A.ctx.currentTime, S = G.state;
  const set = (p, v, k = 0.3) => p.setTargetAtTime(v, t, k);
  const r = G.rain;
  set(N.roof.g.gain, r * 0.22); set(N.roof.f.frequency, 900 + r * 900);
  set(N.roofLow.g.gain, r * 0.18);
  set(N.rainOut.g.gain, r * 0.05);
  set(N.wind.g.gain, clamp(G.wind * 0.12 + Math.max(0, G.wind - 0.7) * 0.2)); set(N.wind.f.frequency, 300 + G.wind * 500, 0.8);
  const cd = G.camper ? Math.abs(G.camper.position.x - (-14)) : 20;
  const creek = clamp(1 - cd / 40) * 0.05 * (1 + (G.waterLevel + 1.55) * 2);
  set(N.creek.g.gain, creek);
  A.floodT = E.flood.on ? 1 : 0;
  set(N.flood.g.gain, A.floodT * 0.5 * clamp((G.waterLevel + 1.5) / 2), 1.5);
  A.rumbleT = Math.max(0, (A.rumbleT || 0) - dt);
  set(N.rumble.g.gain, clamp(A.rumbleT / 6) * 0.9, 0.5);
  set(N.hiss.g.gain, S.radio ? 0.012 : 0);
  set(N.hum.g.gain, S.generator ? 0.03 : 0);
  set(N.heater.g.gain, S.heater ? 0.04 : 0);
  A.kettleT = Math.max(0, (A.kettleT || 0) - dt);
  if (A.kettleT > 0 && A.kettleT < 6 && Math.random() < 0.3) tone(A.inside, 2400 + Math.random() * 200, 2600, 0.2, 'sine', 0.02 * (6 - A.kettleT) / 6);
  // hiding: outside gets quieter/muffled when curtains closed
  set(A.outside.frequency, S.hiding ? 900 : 2400 - (G.state.curtainsClosed ? 800 : 0));
  // bear footsteps & breathing when close
  const b = Z.bear;
  if (b?.active && G.camper) {
    const d = Math.hypot(b.pos.x - G.camper.position.x, b.pos.z - G.camper.position.z);
    A.stepT = (A.stepT || 0) - dt * (0.8 + b.speed * 1.3);
    if (A.stepT < 0) { A.stepT = 0.55; burst(A.outside, { f: 180, type: 'lowpass', d: 0.15, peak: clamp(1 - d / 30) * 0.35 }); }
    if (d < 6 && Math.random() < dt * 0.6) burst(A.outside, { f: 500, q: 0.6, a: 0.25, d: 0.6, peak: 0.12 });
  }
}
