// Window glass: physically based transmission + procedural raindrops (static + sliding),
// condensation fog cleared by drop trails, and impact cracks. Drops refract the real scene
// through the transmission pass.
import { THREE, U } from './core.js';

export const glassShared = { uFogGlass: { value: 0.0 }, uDirt: { value: 0.25 } };

const GLSL = /* glsl */`
uniform float uTime, uRain, uFogGlass, uDirt, uCrack, uFlash;
uniform vec2 uCrackAt;
uniform float uSlope; // 1 = vertical pane (drops slide), 0 = horizontal (skylight: only static + splashes)
varying vec2 vGUv;
float gH1(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec3 gH3(float p){ vec3 p3 = fract(vec3(p)*vec3(.1031,.11369,.13787)); p3 += dot(p3, p3.yzx+19.19); return fract(vec3((p3.x+p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x)); }
vec2 gH2(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }

// static beads: returns xy = slope offset, z = coverage
vec3 staticDrops(vec2 uv, float t, float amt){
  uv *= 38.;
  vec2 id = floor(uv);
  vec2 st = fract(uv) - .5;
  vec3 n = gH3(id.x*107.45 + id.y*3543.654);
  vec2 p = (n.xy - .5)*.7;
  float d = length(st - p);
  float life = fract(n.z*10. + t*0.08);
  float r = mix(.08, .3, n.x*n.y) * smoothstep(1., .8, life) * step(n.z, amt);
  float m = smoothstep(r, r*.55, d);
  vec2 off = (st - p) / max(r, 1e-3);
  return vec3(off * m, m);
}

// sliding drops with trails
vec3 slideDrops(vec2 uv, float t, float amt, float scale){
  vec2 UV = uv;
  uv *= scale;
  vec2 grid = vec2(1.0, 3.0);
  uv.y += t*.55;
  float colId = floor(uv.x*grid.x);
  uv.y += gH1(colId*13.7) * 7.;
  vec2 id = floor(uv*grid);
  vec3 n = gH3(id.x*35.2 + id.y*2376.1);
  vec2 st = fract(uv*grid) - vec2(.5, 0.);
  float x = n.x - .5;
  float y = UV.y*20.;
  float wig = sin(y + sin(y));
  x += wig*(.5 - abs(x))*(n.z - .5);
  x *= .7;
  float ti = fract(t*.35 + n.z);
  y = (smoothstep(.85, 1., ti) - .5)*.9 + .5 - ti*.3;
  vec2 p = vec2(x, y);
  float on = step(n.y, amt);
  vec2 dv = (st - p) * grid.yx;
  float d = length(dv);
  float r = .23 + n.y*.08;
  float main = smoothstep(r, r*.4, d) * on;
  // trail
  float tr = smoothstep(.12, .05, abs(dv.x)) * smoothstep(-.02, .02, st.y - p.y) * smoothstep(1.0, p.y, st.y);
  float trailFade = tr * on;
  // droplets left in the trail
  vec2 tuv = vec2(dv.x, fract((st.y)*grid.y*2.8) - .5);
  float td = length(tuv*vec2(1., 1.));
  float trailDrops = smoothstep(.22, .12, td) * trailFade * (1. - smoothstep(p.y, p.y + .5, st.y))*0. + smoothstep(.2,.1,td)*trailFade*.7;
  vec2 off = dv/r * main + tuv*trailDrops*1.5;
  return vec3(off, max(main, trailDrops) + trailFade*.35);
}

// voronoi crack lines around impact
float crackLines(vec2 uv, vec2 c, float amt){
  if (amt <= 0.) return 0.;
  vec2 q = (uv - c);
  float r = length(q);
  float a = atan(q.y, q.x);
  float rays = pow(abs(sin(a*7. + gH1(floor(a*3.)))), 60.) * smoothstep(amt*.9, 0., r);
  vec2 g = uv*9.; vec2 gi = floor(g); float md = 8., md2 = 8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 o = vec2(i,j); vec2 pp = o + gH2(gi+o) - fract(g); float dd = dot(pp,pp);
    if(dd<md){md2=md;md=dd;}else if(dd<md2){md2=dd;} }
  float cell = smoothstep(.06, .0, sqrt(md2) - sqrt(md)) * smoothstep(amt*.7, 0., r);
  float center = smoothstep(.05, .0, r) * step(.01, amt);
  return clamp(rays + cell + center, 0., 1.);
}
`;

export function makeGlass({ tint = 0xffffff, crackable = true, horizontal = false, env = 0.6 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.18, ior: 1.33,
    transparent: false, side: THREE.DoubleSide, envMapIntensity: env, specularIntensity: 1,
    attenuationColor: new THREE.Color(0xeef6f2), attenuationDistance: 3,
  });
  m.depthWrite = false;
  const u = { uCrack: { value: 0 }, uCrackAt: { value: new THREE.Vector2(0.5, 0.5) }, uSlope: { value: horizontal ? 0 : 1 } };
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u, { uTime: U.uTime, uRain: U.uRain, uFlash: U.uFlash }, glassShared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL + '\nvec3 gDrops; float gFog; float gCrack;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          float amt = clamp(uRain*1.3, 0., 1.);
          vec3 s1 = staticDrops(vGUv, uTime, amt*.95);
          vec3 s2 = staticDrops(vGUv*1.63 + 3.1, uTime*1.3, amt*.8);
          vec3 sd = vec3(0.);
          if (uSlope > .5) {
            sd = slideDrops(vGUv, uTime, amt*.9, 5.0);
            vec3 sd2 = slideDrops(vGUv*1.7 + .37, uTime*1.1, amt*.7, 5.0);
            sd = vec3(sd.xy + sd2.xy, max(sd.z, sd2.z));
            s1.z *= (1. - sd.z);
          }
          gDrops = vec3(s1.xy + s2.xy*.6 + sd.xy, clamp(s1.z + s2.z + sd.z, 0., 1.));
          gCrack = crackLines(vGUv, uCrackAt, uCrack);
          float clear = clamp(gDrops.z*1.6, 0., 1.);
          gFog = uFogGlass * (1. - clear);
          roughnessFactor = mix(roughnessFactor, .5, gFog) + uDirt*.03;
          roughnessFactor = mix(roughnessFactor, .25, gCrack);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vGUv), st1 = dFdy(vGUv);
          vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
          vec3 T = q1p*st0.x + q0p*st1.x, B = q1p*st0.y + q0p*st1.y;
          float det = max(dot(T,T), dot(B,B)); float s = det == 0. ? 0. : inversesqrt(det);
          vec2 o = gDrops.xy*.9 + vec2(gCrack)*.4;
          normal = normalize(normal + (T*o.x + B*o.y)*s*1.2);
        }`)
      .replace('#include <transmission_fragment>', `#include <transmission_fragment>
        totalDiffuse = mix(totalDiffuse, totalDiffuse*vec3(1.02,1.02,1.0) + vec3(.035,.04,.045), gFog);`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += vec3(.8,.85,.9)*gCrack*.35 + vec3(.6,.7,.9)*uFlash*gDrops.z*.4;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rainglass' + (horizontal ? 'h' : 'v');
  return m;
}
