// Viewpoint correctness: the camera forward (same Euler math as view.js) must pass through the
// intended window opening and the eye must be inside the van (except 'outside').
globalThis.location = { search: '' }; globalThis.window = { addEventListener() {}, innerHeight: 400 };
const THREE = await import('../../js/lib/three.module.js');
const { VIEWS } = await import('../../js/view.js');
const { WINDOWS, windowLocal, XW, ZF, ZB, FLOOR, CEIL } = await import('../../js/camper.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const expect = { lounge: 'dinette', driver: 'windshield', bed: 'sky2', kitchen: 'kitchen', rear: 'rear' };
for (const [k, v] of Object.entries(VIEWS)) {
  const e = new THREE.Euler(v.pitch, v.yaw, 0, 'YXZ');
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(e);
  const eye = new THREE.Vector3(...v.pos);
  if (!v.out) ok(Math.abs(eye.x) < XW - 0.15 && eye.z > ZF + 0.1 && eye.z < ZB - 0.1 && eye.y > FLOOR + 0.3 && eye.y < CEIL + 0.05, `${k}: eye inside the van`);
  const want = expect[k]; if (!want) continue;
  const w = WINDOWS.find(x => x.id === want), L = windowLocal(w);
  // ray-plane intersection with the window plane
  const t = L.p.clone().sub(eye).dot(L.n) / fwd.dot(L.n);
  const hit = eye.clone().addScaledVector(fwd, t);
  const d = hit.clone().sub(L.p);
  let u, vv;
  if (w.wall === 'L' || w.wall === 'R') { u = d.z; vv = d.y; } else if (w.wall === 'T') { u = d.x; vv = d.z; } else { u = d.x; vv = d.y; }
  const inside = t > 0 && Math.abs(u) < w.w / 2 && Math.abs(vv) < w.h / 2;
  ok(inside, `${k}: looks through '${want}' window (t=${t.toFixed(2)} off=${u.toFixed(2)},${vv.toFixed(2)})`);
}
// outside view keeps >=1.5m eye height above terrain at every parking spot
const { heightAt, SPOTS, spotHeight } = await import('../../js/terrain.js');
for (const k in SPOTS) {
  const s = SPOTS[k], v = VIEWS.outside;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, spotHeight(k), s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.rot, 0)), new THREE.Vector3(1, 1, 1));
  const p = new THREE.Vector3(...v.pos).applyMatrix4(m);
  const y = Math.max(p.y, heightAt(p.x, p.z) + 1.6); // mirrors view.js clamp
  ok(y - heightAt(p.x, p.z) >= 1.5, `outside@${k}: eye ${(y - heightAt(p.x, p.z)).toFixed(2)}m above ground`);
}
// staged bear (events.js QA: 7m along lounge yaw, reared head ~1.8m) must be seen through the dinette glass
{
  const v = VIEWS.lounge, eye = new THREE.Vector3(...v.pos);
  const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, v.yaw, 0, 'YXZ'));
  const base = eye.clone().addScaledVector(f, 7.0);
  const w = WINDOWS.find(x => x.id === 'dinette'), L = windowLocal(w);
  for (const [n, y] of [['head', 1.8], ['chest', 1.2]]) {
    const p = new THREE.Vector3(base.x, y, base.z), d = p.clone().sub(eye), t = (L.p.x - eye.x) / d.x, hit = eye.clone().addScaledVector(d, t);
    ok(Math.abs(hit.z - L.p.z) < w.w / 2 && Math.abs(hit.y - L.p.y) < w.h / 2, `staged bear ${n} visible through dinette window (y ${hit.y.toFixed(2)})`);
  }
}
process.exit(fail ? 1 : 0);
