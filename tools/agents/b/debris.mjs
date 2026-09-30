// debris physics: a rock dropped on the bridge deck must rest on the deck, and slide debris must come to rest
import { G, V, T, A, R, run, THREE } from './h.mjs';
const br = R.ROADS.find(r => r.id === 'west'), mid = br.s[Math.round((br.bridge[0] + br.bridge[1]) / 2)];
V.VEH.obstacles.length = 0; V.setPose(0, -60, 0);
const o = V.addObstacle(new THREE.Vector3(mid.x, mid.h + 2, mid.z), 0.5, { tag: 'slide' });
run(5, null, false);
console.log(`rock on bridge: deck top ${mid.h.toFixed(2)}, terrain below ${T.heightAt(mid.x, mid.z).toFixed(2)}, rock centre y ${o.p.y.toFixed(2)} (expect ≈ deck + r*0.85 = ${(mid.h + 0.43).toFixed(2)})`);
// many debris: do they settle (sleep) within 30s on a slope?
V.VEH.obstacles.length = 0; const c = R.DESTS.ridge; const list = [];
for (let k = 0; k < 12; k++) list.push(V.addObstacle(new THREE.Vector3(c.x + 20 + k, T.heightAt(c.x + 20 + k, c.z) + 1, c.z + (k % 3)), 0.6, { tag: 'slide' }));
run(40, null, false);
console.log(`debris asleep after 40s: ${list.filter(o => o.sleep).length}/12, max speed ${Math.max(...list.map(o => o.v.length())).toFixed(2)} m/s, any NaN: ${list.some(o => !isFinite(o.p.x + o.p.y + o.p.z))}`);
