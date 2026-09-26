// Sky, sun/moon, stars, clouds, fog, rain streaks + splashes, lightning, fireflies, creek water.
import { THREE, G, U, P, clamp, smooth, lerp, damp, rng, bus } from './core.js';
import { Sky } from './lib/addons/objects/Sky.js';
import { creekX, CREEK_BED, heightAt } from './terrain.js';

export const W = {
  sky: null, sun: null, moon: null, hemi: null, stars: null, rain: null, splash: null,
  water: null, clouds: null, fireflies: null, moonMesh: null,
  mode: 'clear', target: { rain: 0, cloud: 0.3, fog: 0.2, wind: 0.3 },
  nextBolt: 8, boltLight: null, boltMesh: null,
};

export const WEATHERS = {
  clear: { rain: 0, cloud: 0.15, fog: 0.12, wind: 0.25, label: '晴れ' },
  cloudy: { rain: 0, cloud: 0.7, fog: 0.25, wind: 0.45, label: 'くもり' },
  fog: { rain: 0, cloud: 0.6, fog: 0.85, wind: 0.1, label: '霧' },
  rain: { rain: 0.65, cloud: 0.9, fog: 0.45, wind: 0.6, label: '雨' },
  storm: { rain: 1.0, cloud: 1.0, fog: 0.55, wind: 1.2, label: '嵐' },
};

export function setWeather(mode, instant = false) {
  W.mode = mode;
  Object.assign(W.target, WEATHERS[mode]);
  if (instant) { G.rain = W.target.rain; G.cloud = W.target.cloud; G.fog = W.target.fog; G.wind = W.target.wind; G.wet = mode === 'rain' || mode === 'storm' ? 1 : 0; }
  bus.emit('weather', mode);
}

export function buildWeather(scene, renderer) {
  // --- sky
  const sky = new Sky(); sky.scale.setScalar(4500);
  sky.material.depthWrite = false;
  scene.add(sky); W.sky = sky;
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.86;
  // overlay dome: night sky gradient + stars + moon + clouds (drawn over Sky)
  W.dome = starDome(); scene.add(W.dome);

  // --- lights
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a2618, 0.6); scene.add(hemi); W.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const S = G.quality === 'm' ? 2048 : 4096;
  sun.shadow.mapSize.set(S, S);
  const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target); W.sun = sun;
  const bolt = new THREE.DirectionalLight(0xcfe0ff, 0); bolt.position.set(-60, 120, -80); scene.add(bolt); W.boltLight = bolt;

  // --- fog
  scene.fog = new THREE.FogExp2(0x9aa7a0, 0.01);

  buildRain(scene);
  buildWater(scene);
  buildFireflies(scene);
  buildBoltMesh(scene);
  setWeather(P.get('weather') || 'clear', true);
}

function starDome() {
  const R = rng(5);
  const N = 2600, pos = new Float32Array(N * 3), a = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = R(), v = R() * 0.95 + 0.05;
    const th = u * Math.PI * 2, ph = Math.acos(v);
    pos[i * 3] = Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = Math.cos(ph); pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th);
    a[i] = Math.pow(R(), 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('mag', new THREE.BufferAttribute(a, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 }, uCloud: { value: 0 }, uTime: U.uTime },
    vertexShader: `attribute float mag; varying float vM; varying float vY; uniform float uTime;
      void main(){ vM = mag; vY = position.y; vec4 p = modelViewMatrix*vec4(position*3000., 1.);
        gl_Position = projectionMatrix*p; gl_PointSize = (1.2 + mag*3.2) * (0.8 + 0.2*sin(uTime*3.0 + position.x*400.)); }`,
    fragmentShader: `varying float vM; varying float vY; uniform float uNight, uCloud;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(.5, .0, d);
        gl_FragColor = vec4(vec3(0.85,0.9,1.0)*(0.5+vM*1.6), a*uNight*(1.-uCloud)*smoothstep(0.02,0.2,vY)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -1;
  W.starMat = m;
  // milky way band + moon + cloud layer as a big sphere shader
  const dm = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uNight: { value: 0 }, uCloud: { value: 0 }, uTime: U.uTime, uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uCloudCol: { value: new THREE.Color() }, uFlash: U.uFlash, uDay: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vD; uniform float uNight, uCloud, uTime, uFlash, uDay; uniform vec3 uMoon, uSun, uCloudCol;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float up = clamp(d.y, 0., 1.);
        // night base gradient
        vec3 night = mix(vec3(0.012,0.018,0.035), vec3(0.002,0.004,0.012), up);
        // milky way
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 0.93)))*4., 2.));
        float mw = band * fbm(d.xz*6. + d.y*3.) * 0.08;
        night += vec3(0.5,0.55,0.7)*mw;
        // moon
        float md = dot(d, normalize(uMoon));
        float disc = smoothstep(0.99965, 0.9998, md);
        float crater = fbm(d.xy*260.)*0.35;
        float halo = pow(max(md,0.), 400.)*0.25 + pow(max(md,0.), 30.)*0.04;
        vec3 moonC = vec3(1.0,0.97,0.9)*(disc*(1.2-crater)*3.0) + vec3(0.6,0.7,0.9)*halo;
        // clouds (2 layers drifting)
        vec2 cp = d.xz/(d.y+0.12);
        float c1 = fbm(cp*0.9 + vec2(uTime*0.01, uTime*0.004));
        float c2 = fbm(cp*2.3 - vec2(uTime*0.02, 0.));
        float cov = smoothstep(1.0 - uCloud*0.95, 1.25 - uCloud*0.6, c1*0.75 + c2*0.35 + uCloud*0.3);
        cov *= smoothstep(-0.02, 0.15, d.y);
        float sunlit = pow(max(dot(d, normalize(uSun)), 0.), 6.);
        vec3 cc = uCloudCol * (0.75 + 0.35*c2) + vec3(1.,0.8,0.6)*sunlit*uDay*0.4*(1.-uCloud*0.6);
        cc += vec3(0.7,0.75,1.0)*uFlash*(0.6 + 0.6*c1);
        vec3 col = night*uNight + moonC*uNight*(1.-cov);
        float a = max(uNight*0.97*(1.-cov*0.0), 0.);
        col = mix(col, cc, cov);
        a = max(a, cov*0.98);
        // overcast darkening towards horizon
        gl_FragColor = vec4(col, clamp(a, 0., 1.)*smoothstep(-0.12, 0.02, d.y) + (d.y < 0. ? 0. : 0.));
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3500, 48, 24), dm);
  dome.frustumCulled = false; dome.renderOrder = -2;
  W.domeMat = dm;
  const grp = new THREE.Group(); grp.add(dome, pts);
  return grp;
}

// ---------------------------------------------------------------- rain
function buildRain(scene) {
  const N = G.quality === 'm' ? 14000 : 26000;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const R = rng(3), off = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { off[i * 4] = R(); off[i * 4 + 1] = R(); off[i * 4 + 2] = R(); off[i * 4 + 3] = R(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  g.instanceCount = N;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uRain: U.uRain, uWind: U.uWind, uCam: { value: new THREE.Vector3() }, uLight: { value: new THREE.Color() }, uFlash: U.uFlash,
      uCamperM: { value: new THREE.Matrix4() } },
    vertexShader: `attribute vec4 aOff; uniform float uTime, uRain, uWind; uniform vec3 uCam; uniform mat4 uCamperM;
      varying float vA; varying vec2 vUv;
      void main(){
        float box = 36.;
        float speed = 11. + aOff.w*4.;
        vec3 p = vec3(aOff.x*box - box*.5, 0., aOff.z*box - box*.5);
        float y = mod(aOff.y*30. - uTime*speed, 30.) - 6.;
        p.y = y;
        p.x += uWind*1.4*(y);
        p.xz += uCam.xz - mod(uCam.xz, 1.);
        p.xz = mod(p.xz - uCam.xz + box*.5, box) + uCam.xz - box*.5;
        p.y += uCam.y - 4.0;
        // hide drops inside the camper box
        vec3 lp = (uCamperM * vec4(p, 1.)).xyz;
        float inside = step(abs(lp.x), 1.25) * step(abs(lp.z - (-0.6)), 3.9) * step(lp.y, 2.95) * step(-1.0, lp.y);
        vec3 dir = normalize(vec3(uWind*1.4, -speed, 0.));
        vec3 camR = normalize(cross(dir, normalize(p - cameraPosition)));
        float len = 0.35 + aOff.w*0.3;
        vec3 wp = p + camR*position.x*0.012 - dir*position.y*len;
        vA = step(aOff.x*0.999 + aOff.y*0.001, uRain) * (1. - inside);
        vUv = position.xy + vec2(0.5, 0.);
        vec4 mv = viewMatrix * vec4(wp, 1.);
        vA *= smoothstep(0.3, 1.2, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying vec2 vUv; uniform vec3 uLight; uniform float uFlash;
      void main(){ float a = vA * (1. - abs(vUv.x-.5)*2.) * vUv.y * 0.35;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uLight*1.2 + vec3(0.6,0.7,0.9)*uFlash, a); }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh); W.rain = mesh;

  // ground splashes (ring ripples)
  const NS = 1500;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  sg.setIndex([0, 2, 1, 0, 3, 2]);
  const so = new Float32Array(NS * 3);
  const heights = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { so[i * 3] = R() * 30 - 15; so[i * 3 + 1] = R() * 30 - 15; so[i * 3 + 2] = R(); }
  sg.setAttribute('aOff', new THREE.InstancedBufferAttribute(so, 3));
  sg.setAttribute('aH', new THREE.InstancedBufferAttribute(heights, 1));
  sg.instanceCount = NS;
  const sm = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uRain: U.uRain, uLight: { value: new THREE.Color() } },
    vertexShader: `attribute vec3 aOff; attribute float aH; uniform float uTime; varying vec2 vP; varying float vT, vOn; uniform float uRain;
      void main(){ float t = fract(uTime*1.6 + aOff.z*7.); vT = t; vP = position.xz; vOn = step(aOff.z, uRain);
        vec3 p = vec3(aOff.x, aH + 0.03, aOff.y) + position*(0.04 + t*0.12);
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: `varying vec2 vP; varying float vT, vOn; uniform vec3 uLight;
      void main(){ float r = length(vP); float ring = smoothstep(0.15, 0.0, abs(r-0.75))*(1.-vT)*vOn; if (ring<0.01) discard;
        gl_FragColor = vec4(uLight*1.5, ring*0.5); }`,
    transparent: true, depthWrite: false,
  });
  const splash = new THREE.Mesh(sg, sm); splash.frustumCulled = false;
  scene.add(splash); W.splash = splash;
}

export function placeSplashes(cx, cz) {
  const g = W.splash.geometry, o = g.attributes.aOff, h = g.attributes.aH;
  const R = rng(Math.floor(cx * 7 + cz * 13));
  for (let i = 0; i < o.count; i++) {
    let x = cx + R() * 34 - 17, z = cz + R() * 34 - 17;
    o.setXY(i, x, z);
    h.setX(i, Math.max(heightAt(x, z), G.waterLevel));
  }
  o.needsUpdate = true; h.needsUpdate = true;
}

// ---------------------------------------------------------------- creek / flood water
function buildWater(scene) {
  const g = new THREE.PlaneGeometry(420, 420, 1, 1); g.rotateX(-Math.PI / 2); g.translate(20, 0, -10);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x5a5a3a, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.86,
    envMapIntensity: 1.0,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uRain = U.uRain; sh.uniforms.uMud = W.uMud = { value: 0.3 }; sh.uniforms.uFlow = W.uFlow = { value: 1 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform float uTime, uRain, uMud, uFlow;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float wn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(wh(i),wh(i+vec2(1,0)),f.x), mix(wh(i+vec2(0,1)),wh(i+vec2(1,1)),f.x), f.y); }
      vec2 wgrad(vec2 p){ float e=0.05; return vec2(wn(p+vec2(e,0))-wn(p-vec2(e,0)), wn(p+vec2(0,e))-wn(p-vec2(0,e)))/(2.*e); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(vec3(0.05,0.09,0.08), vec3(0.32,0.25,0.14), uMud);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 flow = vec2(0.0, -1.0) * uTime * 0.6 * uFlow;
          vec2 g1 = wgrad(vWP.xz*0.9 + flow);
          vec2 g2 = wgrad(vWP.xz*2.7 - flow*1.7 + 3.);
          vec2 g3 = wgrad(vWP.xz*8. + vec2(uTime*0.3)) * uRain;
          vec2 gg = g1*0.25 + g2*0.15 + g3*0.2;
          normal = normalize(normal + (viewMatrix*vec4(gg.x, 0., gg.y, 0.)).xyz * 0.9);
        }`);
  };
  const w = new THREE.Mesh(g, m); w.position.y = G.waterLevel; w.receiveShadow = true; w.renderOrder = 1;
  scene.add(w); W.water = w;
}

// ---------------------------------------------------------------- fireflies
function buildFireflies(scene) {
  const N = 90, pos = new Float32Array(N * 3), ph = new Float32Array(N);
  const R = rng(8);
  for (let i = 0; i < N; i++) {
    const z = (R() - 0.5) * 60, x = creekX(z) + (R() - 0.5) * 14;
    pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + 0.4 + R() * 1.6; pos[i * 3 + 2] = z; ph[i] = R() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uAmt: { value: 0 } },
    vertexShader: `attribute float ph; uniform float uTime; varying float vB;
      void main(){ vec3 p = position + vec3(sin(uTime*0.3+ph)*1.2, sin(uTime*0.5+ph*2.)*0.4, cos(uTime*0.27+ph)*1.2);
        vB = pow(max(sin(uTime*1.3 + ph*3.), 0.), 6.);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 90./-mv.z; }`,
    fragmentShader: `uniform float uAmt; varying float vB; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d);
        gl_FragColor = vec4(vec3(0.75,1.0,0.35)*3.0, a*a*vB*uAmt); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); W.fireflies = p;
}

// ---------------------------------------------------------------- lightning bolt
function buildBoltMesh(scene) {
  const m = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  m.toneMapped = false;
  W.boltMesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
  W.boltMesh.frustumCulled = false;
  scene.add(W.boltMesh);
}
function makeBolt(from, to) {
  const pts = [from.clone()];
  const n = 18;
  for (let i = 1; i < n; i++) {
    const p = from.clone().lerp(to, i / n);
    p.x += (Math.random() - 0.5) * 18; p.z += (Math.random() - 0.5) * 18;
    pts.push(p);
  }
  pts.push(to.clone());
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  W.boltMesh.geometry.dispose();
  W.boltMesh.geometry = new THREE.TubeGeometry(curve, 80, 0.9, 4);
}
export function strike(near = false) {
  const a = Math.random() * Math.PI * 2, d = near ? 40 + Math.random() * 30 : 150 + Math.random() * 250;
  const c = G.camper ? G.camper.position : new THREE.Vector3();
  const to = new THREE.Vector3(c.x + Math.cos(a) * d, heightAt(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d), c.z + Math.sin(a) * d);
  const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 260, (Math.random() - 0.5) * 60));
  makeBolt(from, to);
  W.boltLight.position.copy(from);
  W.boltLight.target.position.copy(to);
  W.flashT = 0; W.flashPow = near ? 1.6 : 0.8;
  bus.emit('thunder', { dist: d, delay: d / 340 });
}

// ---------------------------------------------------------------- update
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
const cFogDay = new THREE.Color(0x8fa197), cFogNight = new THREE.Color(0x05080b), cFogStorm = new THREE.Color(0x4d5553), cFogDusk = new THREE.Color(0xc98a5a);
const tmpC = new THREE.Color();
let splashTimer = 0;

export function updateWeather(dt, camera) {
  const T = W.target;
  G.rain = damp(G.rain, T.rain, 0.25, dt);
  G.cloud = damp(G.cloud, T.cloud, 0.2, dt);
  G.fog = damp(G.fog, T.fog, 0.2, dt);
  G.wind = damp(G.wind, T.wind + Math.sin(G.t * 0.23) * 0.15 * T.wind + (T.wind > 0.8 ? Math.max(0, Math.sin(G.t * 0.9)) * 0.5 : 0), 0.8, dt);
  G.wet = clamp(G.wet + (G.rain > 0.1 ? dt * 0.03 * (0.5 + G.rain) : -dt * 0.004));
  U.uRain.value = G.rain; U.uWind.value = G.wind; U.uWet.value = G.wet;

  // sun position: rises at 5.5 east, sets 18.5 west
  const hr = G.hour;
  const sunA = (hr - 6) / 12 * Math.PI;
  sunDir.set(Math.cos(sunA) * 0.85, Math.sin(sunA), -0.35 + Math.cos(sunA) * 0.1).normalize();
  const moonA = (hr - 18.5) / 12 * Math.PI;
  moonDir.set(-Math.cos(moonA) * 0.7, Math.max(Math.sin(moonA), -0.3) * 0.8 + 0.1, -0.6).normalize();
  const elev = sunDir.y;
  G.daylight = smooth(-0.1, 0.25, elev);
  G.night = 1 - smooth(-0.18, 0.05, elev);
  const dusk = smooth(-0.15, 0.05, elev) * (1 - smooth(0.05, 0.35, elev));
  const storm = G.cloud;

  const su = W.sky.material.uniforms;
  su.sunPosition.value.copy(sunDir);
  su.rayleigh.value = lerp(1.2, 3.0, dusk) * (1 - storm * 0.6);
  su.turbidity.value = lerp(4, 16, storm);
  W.domeMat.uniforms.uNight.value = G.night;
  W.domeMat.uniforms.uCloud.value = G.cloud;
  W.domeMat.uniforms.uMoon.value.copy(moonDir);
  W.domeMat.uniforms.uSun.value.copy(sunDir);
  W.domeMat.uniforms.uDay.value = G.daylight;
  tmpC.setRGB(0.62, 0.66, 0.7).multiplyScalar(lerp(0.06, 1, G.daylight) * lerp(1, 0.55, storm * storm));
  tmpC.lerp(new THREE.Color(0.9, 0.55, 0.4), dusk * 0.5 * (1 - storm));
  W.domeMat.uniforms.uCloudCol.value.copy(tmpC);
  W.starMat.uniforms.uNight.value = G.night; W.starMat.uniforms.uCloud.value = G.cloud;

  // lights
  const c = G.camper ? G.camper.position : new THREE.Vector3();
  const moonUp = moonDir.y > 0 ? 1 : 0;
  const useMoon = G.night > 0.5;
  const L = useMoon ? moonDir : sunDir;
  W.sun.position.copy(c).addScaledVector(L, 120);
  W.sun.target.position.copy(c);
  const sunI = 3.2 * G.daylight * (1 - storm * 0.82);
  const moonI = 0.22 * G.night * moonUp * (1 - storm * 0.9);
  W.sun.intensity = sunI + moonI;
  W.sun.color.setRGB(1, lerp(0.95, 0.62, dusk), lerp(0.9, 0.42, dusk));
  if (useMoon) W.sun.color.setRGB(0.62, 0.72, 1.0);
  W.hemi.intensity = lerp(0.05, 1.0, G.daylight) * lerp(1, 0.7, storm) + 0.02;
  W.hemi.color.setRGB(lerp(0.3, 0.72, G.daylight), lerp(0.35, 0.8, G.daylight), lerp(0.55, 0.95, G.daylight));

  // fog
  tmpC.copy(cFogNight).lerp(cFogDay, G.daylight).lerp(cFogStorm.clone().multiplyScalar(lerp(0.12, 1, G.daylight)), storm * 0.7).lerp(cFogDusk, dusk * 0.35 * (1 - storm));
  const scene = W.sun.parent;
  scene.fog.color.copy(tmpC);
  scene.fog.density = lerp(0.003, 0.05, G.fog * G.fog) + G.rain * 0.006 + G.night * 0.004;
  G.fogColor = tmpC;
  W.renderer?.setClearColor(tmpC);

  // rain drawing
  const rm = W.rain.material.uniforms;
  rm.uCam.value.copy(camera.getWorldPosition(new THREE.Vector3()));
  if (G.camper) rm.uCamperM.value.copy(G.camper.matrixWorld).invert();
  rm.uLight.value.setRGB(0.35, 0.38, 0.42).multiplyScalar(lerp(0.12, 1, G.daylight));
  W.rain.visible = G.rain > 0.02;
  W.splash.material.uniforms.uLight.value.copy(rm.uLight.value);
  W.splash.visible = G.rain > 0.05;
  splashTimer -= dt;
  if (splashTimer < 0) { splashTimer = 1.5; placeSplashes(rm.uCam.value.x, rm.uCam.value.z); }

  // lightning
  if (W.mode === 'storm') {
    W.nextBolt -= dt;
    if (W.nextBolt < 0) { strike(Math.random() < 0.25); W.nextBolt = 6 + Math.random() * 14; }
  }
  if (W.flashT !== undefined) {
    W.flashT += dt;
    const t = W.flashT;
    const f = (t < 0.08 ? 1 : 0) + (t > 0.14 && t < 0.2 ? 0.7 : 0) + (t > 0.28 && t < 0.4 ? 0.9 * (1 - (t - 0.28) / 0.12) : 0);
    G.flash = f * W.flashPow;
    W.boltMesh.material.opacity = t < 0.4 ? f : 0;
    W.boltLight.intensity = G.flash * 8;
    if (t > 1) W.flashT = undefined;
  } else G.flash = 0;
  U.uFlash.value = G.flash;

  // water
  W.water.position.y = G.waterLevel;
  W.uMud && (W.uMud.value = clamp(0.25 + (G.waterLevel - CREEK_BED - 0.9) * 0.4 + G.rain * 0.2));
  W.uFlow && (W.uFlow.value = 1 + (G.waterLevel + 1.55) * 1.5 + G.rain);

  // fireflies on clear warm nights
  W.fireflies.material.uniforms.uAmt.value = damp(W.fireflies.material.uniforms.uAmt.value, G.night * (1 - G.rain) * (1 - G.cloud * 0.6), 0.5, dt);
}
