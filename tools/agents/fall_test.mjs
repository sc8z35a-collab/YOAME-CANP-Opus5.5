// Fall & recovery scenario: shove the van off the cliff road, let physics play out, then
// pick a destination again -> the autopilot must recover (right / off-road / winch) and arrive.
// node tools/agents/fall_test.mjs [dest=cliff] [goal=hollow]
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) }; globalThis.location = { search: '' };
globalThis.window = { addEventListener() {} }; globalThis.localStorage = { getItem() { return null; } };
const { G, bus } = await import('../../js/core.js'); G.waterLevel = -2.05;
const V = await import('../../js/vehicle.js'); const T = await import('../../js/terrain.js'); const A = await import('../../js/autopilot.js');
const THREE = await import('../../js/lib/three.module.js');
const [at = 'cliff', goal = 'hollow'] = process.argv.slice(2);
const msgs = []; bus.on('toast', t => msgs.push(t.msg));
const d = T.SPOTS[at]; V.setPose(d.x, d.z, d.rot);
for (let i = 0; i < 60; i++) { G.t += 1 / 60; A.updateAutopilot(1 / 60); V.updateVehicle(1 / 60, null); }
// find the downhill side and shove the van hard toward it (like a landslide / bear hit)
const p0 = V.originOf(); let best = null, bd = 1e9;
for (let a = 0; a < 6.28; a += 0.2) { const h = T.heightAt(p0.x + Math.cos(a) * 12, p0.z + Math.sin(a) * 12); if (h < bd) { bd = h; best = a; } }
const J = new THREE.Vector3(Math.cos(best), 0.15, Math.sin(best)).multiplyScalar(3400 * (+process.env.SHOVE || 16));
V.applyImpulse(V.VEH.pos.clone().setY(V.VEH.pos.y + 1.2), J);
let minUp = 1, drop = 0;
for (let i = 0; i < 30 * 20; i++) { G.t += 1 / 30; A.updateAutopilot(1 / 30); V.updateVehicle(1 / 30, null); minUp = Math.min(minUp, V.VEH.up.y); drop = Math.max(drop, p0.y - V.originOf().y); }
console.log(`after shove: dropped ${drop.toFixed(1)}m, minUp ${minUp.toFixed(2)}, off-road ${T.roadQuery(V.originOf().x, V.originOf().z).d.toFixed(1)}m`);
A.engage(goal);
let t = 0, ok = false;
for (let i = 0; i < 30 * 900; i++) { G.t += 1 / 30; A.updateAutopilot(1 / 30); V.updateVehicle(1 / 30, null); t += 1 / 30; if (!A.AP.on) { ok = A.AP.at === goal; break; } }
console.log(`${ok ? 'PASS' : 'FAIL'} recovered from fall at ${at} and reached ${goal} in ${t.toFixed(0)}s`);
console.log('  messages:', [...new Set(msgs)].join(' / '));
process.exit(ok ? 0 : 1);
