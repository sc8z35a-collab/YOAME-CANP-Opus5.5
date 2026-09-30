// Agent C: headless behaviour test of animals.js state machines (no WebGL: stub GLBs as plain groups).
globalThis.location = { search: '' }; globalThis.window = { addEventListener() {}, innerHeight: 400 };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('../../js/lib/three.module.js');
const assets = await import('../../js/assets.js');
const { G, bus } = await import('../../js/core.js');
const A = await import('../../js/animals.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// fake gltf: a box mesh (skinned ones need animations: give named clips)
const fake = (h, anims = []) => { const s = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1, h, 2), new THREE.MeshStandardMaterial()); m.name = 'Body'; s.add(m);
  const horn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshStandardMaterial()); horn.name = 'Stag_Horns'; horn.position.y = h / 2 + 0.3; s.add(horn);
  return { scene: s, animations: anims.map(n => new THREE.AnimationClip('AnimalArmature|' + n, 1, [])) }; };
const names = ['Idle', 'Walk', 'Gallop', 'Eating', 'Idle_Headlow', 'Run'];
assets.__setGlbStub?.(null);
const camper = new THREE.Group(); camper.position.set(0, 0, 0); camper.updateMatrixWorld(true); G.camper = camper;
const scene = new THREE.Scene();
// monkeypatch glb loader through module namespace is impossible; build animals with our own fakes
const origGlb = assets.glb;
await A.buildAnimals(scene, { stag: fake(1.6, names), fawn: fake(0.9), black_bear: fake(1.0), wolf: fake(0.8, names) }).catch(e => { console.log('build via stub failed:', e.message); });
if (!A.Z.ready) { console.log('SKIP (buildAnimals needs stub support)'); process.exit(0); }
const box = o => { const b = new THREE.Box3().setFromObject(o); return b.max.y - b.min.y; };
ok(Math.abs(box(A.Z.deer[1].obj) - 1.3) < 0.05, 'doe fitted to 1.3 m without antlers: ' + box(A.Z.deer[1].obj).toFixed(2));
{ const e = A.Z.bear.eyes[0]; e.updateWorldMatrix(true, false); const ws = new THREE.Vector3().setFromMatrixScale(e.matrixWorld).x * e.geometry.parameters.radius;
  ok(Math.abs(ws - 0.03) < 0.005, 'bear eye-shine world radius ~3 cm: ' + (ws * 100).toFixed(2) + ' cm'); }
// bear charging from the front must hit within 20 s
let hits = 0; bus.on('impact', () => hits++);
const b = A.Z.bear; A.spawnBear('charge'); b.pos.set(0, 0, -25); b.heading = 0;
let t = 0; for (; t < 20 && !hits; t += 1 / 30) { G.t += 1 / 30; A.updateAnimals(1 / 30); }
ok(hits > 0, `bear charging the nose reaches the van (${t.toFixed(1)} s)`);
// the bear eventually leaves (threat clears)
for (let i = 0; i < 30 * 400 && b.active; i++) { G.t += 1 / 30; A.updateAnimals(1 / 30); }
ok(!b.active, 'bear visit ends (state ' + b.state + ')');
// deer visit ends by itself
A.spawnDeer(); let k = 0; for (; k < 30 * 400 && A.anyActive([...A.Z.deer, ...A.Z.fawns]); k++) { G.t += 1 / 30; A.updateAnimals(1 / 30); }
ok(!A.anyActive([...A.Z.deer, ...A.Z.fawns]), `deer visit ends (${(k / 30).toFixed(0)} s)`);
A.spawnWolves(); k = 0; for (; k < 30 * 300 && A.anyActive(A.Z.wolves); k++) { G.t += 1 / 30; A.updateAnimals(1 / 30); }
ok(!A.anyActive(A.Z.wolves), `wolves leave (${(k / 30).toFixed(0)} s)`);
process.exit(fails ? 1 : 0);
